/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║   DARK BOT v6.72 — Call Handler                              ║
 * ║   AURA atende chamadas de voz/vídeo                          ║
 * ║                                                               ║
 * ║   O Baileys NÃO tem WebRTC. Tentamos TODOS os métodos de     ║
 * ║   aceitar a chamada (API, IQ, sendNode). Se nenhum entrar    ║
 * ║   no áudio RTP, conversamos por notas de voz:                ║
 * ║   ATENDER → FALAR → OUVIR → ENTENDER → RESPONDER             ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */
'use strict';

const config = require('../config');
const ai = require('./ai');

const MODOS = new Set(['atender', 'rejeitar', 'ignorar']);
const KEY_MODOS = 'darkbot_call_modes_v1';
const JANELA_MS = 5 * 60 * 1000;
const CALLBACK_COOLDOWN_MS = 60 * 1000; // anti-spam: 1 callback por número/minuto

/** jid → { id, isVideo, inicio, ultimo, turnos, isOwner, from } */
const _activas = new Map();
const _modosMem = new Map();
const _seen = new Set();
const _callbackCooldown = new Map();
let _modosCarregados = false;

function jidNum(jid) {
  return String(jid || '').split(':')[0].split('@')[0].replace(/\D/g, '');
}

function ehDespedida(texto) {
  const t = String(texto || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim();
  return /\b(tchau|adeus|desliga|desligar|xau|flw|falou|beijo|beijos|ate logo|ate ja|ate amanha|falamos depois|vou dormir|to saindo|estou a sair)\b/.test(t);
}

function limparParaFala(texto) {
  return String(texto || '')
    .replace(/\p{Extended_Pictographic}[\uFE0F\u200D]*/gu, '')
    .replace(/[*_~`#]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

async function _carregarModos() {
  if (_modosCarregados) return;
  _modosCarregados = true;
  try {
    const bcc = require('./botConfigCache');
    const stored = await bcc.get(KEY_MODOS, {});
    if (stored && typeof stored === 'object') {
      for (const [k, v] of Object.entries(stored)) {
        if (MODOS.has(v)) _modosMem.set(k, v);
      }
    }
  } catch {}
}

async function _persistirModos() {
  try {
    const bcc = require('./botConfigCache');
    await bcc.set(KEY_MODOS, Object.fromEntries(_modosMem));
  } catch {}
}

async function getMode(jid, isOwner) {
  await _carregarModos();
  const k = String(jid || '');
  if (_modosMem.has(k)) return _modosMem.get(k);
  const porNum = [..._modosMem.entries()].find(([id]) => jidNum(id) === jidNum(k));
  if (porNum) return porNum[1];
  // Primeiro passo: ATENDE sempre, a não ser que o Dono mude o modo.
  return 'atender';
}

async function setMode(jid, modo) {
  const m = String(modo || '').toLowerCase().trim();
  if (!MODOS.has(m)) {
    return { ok: false, error: 'modo inválido. Usa: atender, rejeitar, ignorar' };
  }
  await _carregarModos();
  _modosMem.set(String(jid), m);
  await _persistirModos();
  return { ok: true, modo: m };
}

/** O Dono escolheu EXPLICITAMENTE um modo para este chat? (vs. default) */
function modoExplicito(jid) {
  const k = String(jid || '');
  if (_modosMem.has(k)) return true;
  return [..._modosMem.entries()].some(([id]) => jidNum(id) === jidNum(k));
}

function chamadaActiva(jid) {
  const k = String(jid || '');
  if (_activas.has(k)) {
    const c = _activas.get(k);
    if (Date.now() - c.ultimo < JANELA_MS) return c;
    _activas.delete(k);
    return null;
  }
  const hit = [..._activas.entries()].find(([id]) => jidNum(id) === jidNum(k));
  if (!hit) return null;
  if (Date.now() - hit[1].ultimo >= JANELA_MS) {
    _activas.delete(hit[0]);
    return null;
  }
  return hit[1];
}

let _ultimoSock = null;

function terminar(jid) {
  const k = String(jid || '');
  let rec = null;
  if (_activas.has(k)) {
    rec = _activas.get(k);
    _activas.delete(k);
  } else {
    for (const [id, c] of _activas) {
      if (jidNum(id) === jidNum(k)) {
        rec = c;
        _activas.delete(id);
        break;
      }
    }
  }
  if (rec && _ultimoSock) {
    try {
      require('./atenderChamada').desligar(_ultimoSock, {
        from: rec.from, id: rec.id, creator: rec.creator,
      }).catch(() => {});
    } catch {}
  }
  return rec;
}

function marcarActiva(from, call, isOwner) {
  const rec = {
    id: call?.id || ('c' + Date.now()),
    from,
    creator: call?.creator || call?.callCreator || from,
    isVideo: !!call?.isVideo,
    isGroup: !!call?.isGroup,
    inicio: Date.now(),
    ultimo: Date.now(),
    turnos: 0,
    isOwner: !!isOwner,
    soAtendeu: true,
  };
  _activas.set(String(from), rec);
  setTimeout(() => {
    const cur = _activas.get(String(from));
    if (cur && Date.now() - cur.ultimo >= JANELA_MS) _activas.delete(String(from));
  }, JANELA_MS + 1000);
  return rec;
}

/**
 * Tenta ACEITAR a chamada por todos os caminhos conhecidos.
 * Nenhum Baileys oficial tem WebRTC — mas forks e o protocolo
 * às vezes aceitam o sinal. Se falhar, o fallback é PTT.
 */
async function tentarAceitarChamada(sock, call) {
  const id = call.id;
  const from = call.from;
  const tentativas = [];

  // v6.76: cada sock.query respeita defaultQueryTimeoutMs (60s). Como
  // acceptCall/answerCall/IQ accept NÃO existem no @systemzero/baileys
  // (só rejectCall), estas tentativas falham SEMPRE — e falhavam devagar:
  // 2 querys × 60s = até 2 minutos até cair no fallback PTT. Nesse tempo
  // o WhatsApp já desistiu da chamada e quem ligou não recebeu nada.
  // Agora cada tentativa tem 1,5s. O caminho útil (PTT) arranca quase já.
  const LIMITE_MS = 1500;
  const tentar = async (nome, fn) => {
    try {
      await Promise.race([
        fn(),
        new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout ${LIMITE_MS}ms`)), LIMITE_MS)),
      ]);
      tentativas.push({ metodo: nome, ok: true });
      return true;
    } catch (e) {
      tentativas.push({ metodo: nome, ok: false, erro: String(e?.message || e).slice(0, 80) });
      return false;
    }
  };

  if (typeof sock.acceptCall === 'function') {
    if (await tentar('acceptCall', () => sock.acceptCall(id, from))) {
      return { ok: true, metodo: 'acceptCall', tentativas };
    }
  }
  if (typeof sock.answerCall === 'function') {
    if (await tentar('answerCall', () => sock.answerCall(id, from))) {
      return { ok: true, metodo: 'answerCall', tentativas };
    }
  }

  const tag = typeof sock.generateMessageTag === 'function'
    ? sock.generateMessageTag()
    : String(Date.now());

  // v6.77 — handshake COMPLETO de atendimento (ack -> receipt -> preaccept
  // -> accept), igual ao que um telemóvel real envia. Estava escrito em
  // atenderChamada.js mas nunca era chamado: o onCall só tentava
  // acceptCall/answerCall (inexistentes no fork) e um <accept> solto com
  // 'call-creator' ERRADO (punha `from` em vez do criador da chamada).
  // Sem preaccept o servidor não considera a chamada estabelecida.
  try {
    const A = require('./atenderChamada');
    const r = await Promise.race([
      A.atender(sock, call),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout 4000ms')), 4000)),
    ]);
    if (r && r.atendeu) {
      tentativas.push({ metodo: 'handshake_completo', ok: true, passos: r.passos });
      return { ok: true, metodo: 'handshake_completo', tentativas };
    }
    tentativas.push({ metodo: 'handshake_completo', ok: false, passos: r?.passos });
  } catch (e) {
    tentativas.push({ metodo: 'handshake_completo', ok: false, erro: String(e?.message || e).slice(0, 80) });
  }

  if (typeof sock.query === 'function') {
    if (await tentar('iq_accept', () => sock.query({
      tag: 'call',
      attrs: { to: from, id: tag },
      content: [{ tag: 'accept', attrs: { 'call-id': id, 'call-creator': from, count: '0' } }],
    }))) {
      return { ok: true, metodo: 'iq_accept', tentativas };
    }

    if (await tentar('iq_offer_accept', () => sock.query({
      tag: 'iq',
      attrs: { to: from, type: 'set', xmlns: 'call' },
      content: [{ tag: 'accept', attrs: { 'call-id': id, 'call-creator': from } }],
    }))) {
      return { ok: true, metodo: 'iq_offer_accept', tentativas };
    }
  }

  if (typeof sock.sendNode === 'function') {
    if (await tentar('sendNode_accept', () => sock.sendNode({
      tag: 'call',
      attrs: { to: from, id: tag },
      content: [{ tag: 'accept', attrs: { 'call-id': id, 'call-creator': from } }],
    }))) {
      return { ok: true, metodo: 'sendNode_accept', tentativas };
    }
  }

  // Método que funciona de certeza: conversa por PTT (sem stream RTP)
  tentativas.push({ metodo: 'ptt_conversa', ok: true });
  return { ok: true, metodo: 'ptt_conversa', tentativas };
}

async function falar(sock, jid, texto) {
  const limpo = limparParaFala(texto);
  if (!limpo) return { ok: false, error: 'texto vazio' };

  try {
    const buf = await ai.speakWithFallback(limpo);
    if (buf && buf.length > 500) {
      await sock.sendMessage(jid, {
        audio: buf,
        mimetype: 'audio/mpeg',
        ptt: true,
      });
      return { ok: true, bytes: buf.length, texto: limpo };
    }
  } catch (e) {
    console.warn('[Call TTS]', e.message?.slice(0, 60));
  }

  await sock.sendMessage(jid, { text: texto });
  return { ok: true, texto: limpo, fallbackTexto: true };
}

async function gerarRespostaChamada(texto, { isOwner, pushName }) {
  try {
    const aura = require('../aura/auraHuman');
    const r = await aura.auraRespond(
      `[CHAMADA DE VOZ] A pessoa disse: "${texto}". Responde CURTO, como se estivesses ao telefone. 1 ou 2 frases. Sem markdown.`,
      { isOwner, isVip: !!isOwner, pushName: pushName || (isOwner ? 'Dark' : 'pessoa'), isGroup: false, isAudio: true }
    );
    if (r && !String(r).trim().startsWith('❌')) return String(r).trim();
  } catch {}
  try {
    const r = await ai.chat(
      `Estás numa chamada. A pessoa disse: "${texto}". Responde em 1-2 frases faladas, sem emojis.`,
      'És a AURA ao telefone. Natural, curta, humana.',
      {},
      !!isOwner
    );
    if (r && !String(r).trim().startsWith('❌')) return String(r).trim();
  } catch {}
  return isOwner
    ? 'Estou aqui, meu Dark. Diz outra vez.'
    : 'Estou aqui. Manda outro áudio que eu ouço.';
}

async function transcrever(buf) {
  let ultimo = null;
  try {
    const t = await ai.transcribeAudio(buf, 'pt');
    if (t && String(t).trim()) return String(t).trim();
  } catch (e) { ultimo = e; }
  try {
    if (typeof ai.transcribeAssemblyAI === 'function') {
      const t = await ai.transcribeAssemblyAI(buf, 'pt');
      const txt = typeof t === 'string' ? t : t?.text;
      if (txt && String(txt).trim()) return String(txt).trim();
    }
  } catch (e) { ultimo = e; }
  throw ultimo || new Error('não percebi o áudio');
}

async function continuarConversa(sock, jid, audioBuf, { pushName = '' } = {}) {
  const activa = chamadaActiva(jid);
  if (!activa) return { ok: false, semChamada: true };

  let ouviu = '';
  try {
    ouviu = await transcrever(audioBuf);
  } catch (e) {
    const pedido = 'Não percebi. Manda o áudio outra vez, mais perto do microfone.';
    await falar(sock, jid, pedido).catch(() => sock.sendMessage(jid, { text: pedido }));
    return { ok: false, erro: String(e.message || e).slice(0, 80) };
  }

  activa.ultimo = Date.now();

  if (ehDespedida(ouviu)) {
    const despedida = activa.isOwner
      ? 'Tchau, meu Dark. Estou aqui quando ligares.'
      : 'Até já. Quando quiseres, liga outra vez.';
    await falar(sock, jid, despedida).catch(() => {});
    const turnos = activa.turnos;
    terminar(jid);
    return { ok: true, ouviu, respondeu: despedida, terminou: true, turnos };
  }

  const respondeu = await gerarRespostaChamada(ouviu, {
    isOwner: activa.isOwner,
    pushName,
  });
  activa.turnos += 1;
  await falar(sock, jid, respondeu);
  return { ok: true, ouviu, respondeu, turnos: activa.turnos };
}

async function ligar(sock, jid, { tipo = 'voice', pushName = '' } = {}) {
  const isVideo = tipo === 'video';
  try {
    // 1º: chamada REAL — faz o telemóvel TOCAR. Só cai no link se falhar.
    try {
      const realCall = require('./realCall');
      if (realCall.suportado(sock)) {
        const r = await realCall.ligar(sock, jid, { isVideo });
        if (r.ok) {
          try { marcarActiva(jid, { callId: r.callId, origem: 'realCall' }); } catch {}
          return { ok: true, tipo: isVideo ? 'video' : 'voice', metodo: 'realCall', callId: r.callId, tocou: true };
        }
      }
    } catch {}

    if (typeof sock.createCallLink === 'function') {
      const token = await sock.createCallLink(isVideo ? 'video' : 'audio');
      const url = String(token || '').startsWith('http')
        ? String(token)
        : `https://call.whatsapp.com/${isVideo ? 'video' : 'voice'}/${token}`;
      await sock.sendMessage(jid, {
        text: `📞 ${pushName ? pushName + ', ' : ''}clica para ligar:\n${url}`,
      });
      return { ok: true, tipo: isVideo ? 'video' : 'voice', url };
    }
  } catch (e) {
    console.warn('[Call ligar createCallLink]', e.message?.slice(0, 60));
  }

  try {
    if (typeof sock.offerCall === 'function') {
      await sock.offerCall(jid, { isVideo });
      return { ok: true, tipo: isVideo ? 'video' : 'voice', metodo: 'offerCall' };
    }
  } catch (e) {
    console.warn('[Call ligar offerCall]', e.message?.slice(0, 60));
  }

  const num = jidNum(jid);
  const url = `https://wa.me/${num}`;
  try {
    await sock.sendMessage(jid, {
      text: `📞 Quero falar contigo. Responde aqui ou liga-me no WhatsApp.\n${url}`,
    });
    return { ok: true, tipo: isVideo ? 'video' : 'voice', url };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function _saudacao(ownerCall, isVideo) {
  return ownerCall
    ? (isVideo
      ? 'Oi meu Dark. Não consigo entrar no vídeo, mas estou aqui: manda um áudio que eu ouço e respondo.'
      : 'Oi meu Dark. Estou aqui. Manda um áudio que eu ouço e respondo já.')
    : (isVideo
      ? 'Olá! Não consigo entrar na chamada de vídeo, mas estou aqui: manda um áudio que eu ouço e respondo.'
      : 'Olá! Não consigo falar pela chamada, mas estou aqui: manda um áudio que eu ouço e respondo.');
}

function _saudacaoCallback(ownerCall) {
  return ownerCall
    ? 'Oi meu Dark, sou eu, a Aura. Estou na linha. Fala comigo.'
    : 'Olá, sou a Aura. Estou na linha. Fala comigo.';
}

/**
 * v7.2 — CALLBACK com VOZ REAL.
 * Quando entra uma chamada de VOZ e há sessão VoIP (3.º aparelho), a Aura
 * REJEITA a entrada e LIGA DE VOLTA com áudio RTP real — fala e ouve de
 * verdade. O que ela ouve é transcrito e respondido pela mesma conversa.
 *
 * Regras de segurança:
 *   • só voz (vídeo cai no fluxo PTT de sempre)
 *   • só para o Dono — ou para quem o Dono pôs o modo explicitamente em
 *     'atender' (evita ligar de volta a estranhos à toa)
 *   • cooldown de 60 s por número (evita spam/ban)
 */
async function tentarCallbackVozReal(sock, call, { ownerCall, isVideo, saudacao }) {
  // v7.44: ligar de volta a quem NÃO é o Dono = risco de restrição. Nunca.
  if (!ownerCall) return { ok: false, motivo: 'so_dono' };
  if (isVideo) return { ok: false, motivo: 'video_nao_suportado' };

  const from = call.from;
  const numero = jidNum(from);
  if (numero.length < 9) return { ok: false, motivo: 'numero_invalido' };

  if (!ownerCall && !modoExplicito(from)) {
    return { ok: false, motivo: 'modo_nao_explicito' };
  }

  const agora = Date.now();
  const ultimo = _callbackCooldown.get(numero) || 0;
  if (agora - ultimo < CALLBACK_COOLDOWN_MS) {
    return { ok: false, motivo: 'cooldown' };
  }

  let live;
  try {
    live = require('./liveVoip');
    if (!(await live.disponivel())) return { ok: false, motivo: 'nao_instalado' };
    if (!live.temSessao()) return { ok: false, motivo: 'sem_sessao_voip' };
  } catch (e) {
    return { ok: false, motivo: 'livevoip_erro', detalhe: String(e?.message || e).slice(0, 80) };
  }

  // rejeita a chamada de entrada antes de ligar de volta
  try { if (call.id) await sock.rejectCall(call.id, from); } catch {}

  _callbackCooldown.set(numero, agora);

  const alvo = numero + '@s.whatsapp.net';
  let r = null;
  try {
    r = await Promise.race([
      live.ligarAoVivo(numero, {
        saudacao,
        onEscuta: async (wavBuf) => {
          try {
            marcarActiva(alvo, { id: 'vozrtp-cb-' + Date.now(), isVideo: false }, ownerCall);
            await continuarConversa(sock, alvo, wavBuf, { pushName: '' });
          } catch {}
        },
      }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout voip 30s')), 30000)),
    ]);
  } catch (e) {
    return { ok: false, motivo: 'falhou', detalhe: String(e?.message || e).slice(0, 80) };
  }

  if (r?.ok) {
    try { marcarActiva(alvo, { id: r.callId, isVideo: false }, ownerCall); } catch {}
    return { ok: true, metodo: 'rtp_vivo_callback', callId: r.callId };
  }
  return { ok: false, motivo: r?.motivo || 'falhou', detalhe: r?.detalhe || '' };
}

async function onCall(sock, call, { ownerJid, ownerNumber, isOwner } = {}) {
  if (sock) _ultimoSock = sock;
  if (!call) return { ok: true, ignorado: true, motivo: 'sem_call' };
  if (call.status && call.status !== 'offer') {
    return { ok: true, ignorado: true, motivo: 'nao_e_offer' };
  }

  const callId = call.id || '';
  const from = call.from;
  if (!from) return { ok: true, ignorado: true, motivo: 'sem_from' };

  if (callId && _seen.has(callId)) {
    return { ok: true, ignorado: true, motivo: 'ja_processada' };
  }
  if (callId) {
    _seen.add(callId);
    setTimeout(() => _seen.delete(callId), 120000);
  }

  const fromNumber = jidNum(from);
  const botNumber = jidNum(sock.user?.id);
  if (fromNumber && botNumber && fromNumber === botNumber) {
    return { ok: true, ignorado: true, motivo: 'proprio_bot' };
  }

  const ownerNum = String(ownerNumber || config.owner?.number || '').replace(/\D/g, '');
  const donoJid = ownerJid || (ownerNum ? ownerNum + '@s.whatsapp.net' : '');
  const ownerCall = !!(isOwner || (ownerNum && fromNumber === ownerNum));
  let modo = await getMode(from, ownerCall);
  const isVideo = !!call.isVideo;

  // v7.44 ANTI-RESTRIÇÃO: responder automaticamente (texto + callback) a
  // chamadas de números DESCONHECIDOS é exactamente o padrão que a Meta
  // marca como "mensagens automáticas/em massa" (conta ficou restrita a
  // 06/09 depois de um bot ligar para o PV). Para quem nunca falou
  // connosco: rejeita em silêncio. Só o Dono (e quem o Dono definiu
  // modo explícito) recebe atendimento/callback.
  if (!ownerCall && !modoExplicito(from)) {
    let conhecido = false;
    try {
      const User = require('../database/models/User');
      conhecido = !!(await User.findOne({ number: fromNumber }).select('_id').lean().catch(() => null));
    } catch {}
    if (!conhecido) modo = 'silencio';
  }

  console.log(`[Call] offer de ${fromNumber} (${isVideo ? 'vídeo' : 'voz'}) modo=${modo}`);

  if (modo === 'silencio') {
    try { await sock.rejectCall(call.id, from); } catch {}
    return { ok: true, modo: 'silencio', motivo: 'desconhecido' };
  }

  if (modo === 'ignorar') {
    return { ok: true, modo: 'ignorar', ignorado: false };
  }

  if (modo === 'rejeitar') {
    try { await sock.rejectCall(call.id, from); } catch (e) {
      console.warn('[Call reject]', e.message?.slice(0, 50));
    }
    const tipo = isVideo ? 'vídeo' : 'voz';
    try {
      await sock.sendMessage(from, {
        text: `Olá! O Dark não pode atender chamadas de ${tipo} agora. Deixa uma mensagem por aqui que ele lê quando puder. 👋`,
      });
    } catch {}
    if (donoJid && donoJid !== from) {
      try {
        await sock.sendMessage(donoJid, {
          text: `📞 Alguém te ligou! De: ${fromNumber} | Tipo: ${tipo}`,
        });
      } catch {}
    }
    return { ok: true, modo: 'rejeitar', tipo };
  }

  // ── ATENDER ──────────────────────────────────────────────
  // v6.76: marcar PRIMEIRO (para as notas de voz que cheguem já contarem
  // como turnos da chamada) e falar LOGO A SEGUIR. As tentativas de aceitar
  // o sinal ficam para o fim, em segundo plano: nenhuma delas funciona
  // nesta biblioteca e não faz sentido a saudação esperar por elas.
  marcarActiva(from, call, ownerCall);

  const tipo = isVideo ? 'vídeo' : 'voz';

  // v6.76: REVERTE o silêncio total introduzido em 7a3a068.
  // Como a biblioteca não consegue entrar no áudio da chamada (não há
  // WebRTC/RTP no Baileys), o único sinal de que a AURA atendeu é esta
  // mensagem. Sem ela, quem liga ouve tocar até cair e conclui, com
  // razão, que o bot não atende. A conversa faz-se por notas de voz.
  const saudacao = _saudacao(ownerCall, isVideo);

  // v7.2 — CALLBACK com VOZ REAL: se houver sessão VoIP (3.º aparelho),
  // rejeita a entrada e LIGA DE VOLTA com áudio RTP real (fala e ouve).
  const callback = await tentarCallbackVozReal(sock, call, {
    ownerCall, isVideo, saudacao: _saudacaoCallback(ownerCall),
  }).catch(() => ({ ok: false, motivo: 'erro' }));
  if (callback.ok) {
    return {
      ok: true,
      modo: 'atender',
      tipo,
      callback: true,
      metodo: callback.metodo,
      callId: callback.callId,
    };
  }

  // v6.77 — ATENDER PRIMEIRO, falar depois. O handshake tem uma janela
  // curta (o WhatsApp desiste em poucos segundos); se esperarmos pelo TTS
  // o <accept> chega tarde e a chamada cai a tocar. Falar demora ~1-3s.
  const aceite = await tentarAceitarChamada(sock, call).catch(() => ({
    ok: false, metodo: 'erro', tentativas: [],
  }));

  await falar(sock, from, saudacao);

  return {
    ok: true,
    modo: 'atender',
    tipo,
    aceite: aceite.metodo,
    tentativas: aceite.tentativas,
  };
}

function isActiveCall(callId) {
  if (!callId) return false;
  for (const c of _activas.values()) {
    if (c.id === callId) return true;
  }
  return false;
}

function getActiveCalls() {
  return Array.from(_activas.entries()).map(([id, info]) => ({
    id: info.id,
    from: info.from || id,
    type: info.isVideo ? 'video' : 'voice',
    duration: Math.floor((Date.now() - info.inicio) / 1000),
    turnos: info.turnos,
  }));
}

module.exports = {
  onCall,
  isActiveCall,
  getActiveCalls,
  getMode,
  setMode,
  modoExplicito,
  chamadaActiva,
  marcarActiva,
  continuarConversa,
  ehDespedida,
  falar,
  ligar,
  terminar,
  tentarAceitarChamada,
  tentarCallbackVozReal,
  limparParaFala,
  _activas,
  _callbackCooldown,
  CALLBACK_COOLDOWN_MS,
};
