'use strict';
/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║   DARK BOT — AURA PROATIVA v6.83 💭                          ║
 * ║   Ela fala QUANDO QUER — como uma pessoa, não um rádio.      ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * As funções proactivas antigas do auraHuman.js (auraProactive,
 * auraThinkOutLoud, auraFunFact, auraIndirect…) eram listas fixas
 * de frases — copy-paste que denunciava o bot. O próprio código
 * (aviso v6.44) dizia para NÃO as ligar assim e gerar o texto com
 * IA. Este módulo é essa versão correcta:
 *
 *   • Texto GERADO PELA IA na persona da AURA — nunca frases feitas.
 *     Sem chave de IA → fica calada (melhor calada que enlatada).
 *   • Fala SOBRE O QUE VIU: lê o messageCache (via auraHistorico) e
 *     comenta o assunto real do grupo, ou quebra o silêncio quando
 *     o grupo está quieto há muito.
 *   • Ritmo humano:
 *       - noite (23h–7h) não incomoda ninguém
 *       - intervalo mínimo por chat (padrão 45 min no nível viva, configurável)
 *       - no máximo 1-2 mensagens espontâneas por tick (5 min)
 *       - probabilidades baixas — uma pessoa não fala sempre
 *   • Territórios (v7.71): onde ELA existe — TODOS os grupos menos os
 *     que o Dark mandou dormir (auraMode='sleep') + o PV do Dono.
 *     Antes só falava nos grupos explicitamente invocados — como o
 *     "acordada por defeito" (v6.93) não grava nada na base, ela
 *     ficava muda em todo o lado. Só fala onde VIU actividade
 *     recente — grupo morto continua em paz.
 *   • Humor manda (v7.71): feliz/animada fala mais; cansada/
 *     sonolenta quase não se chega; com raiva fala pouco.
 *   • Reacções espontâneas (v7.71): às vezes só reage a uma
 *     mensagem recente com um emoji — presença sem spam.
 *   • Níveis de vida (v7.71): calma / normal / viva.
 *   • Respeita os modos do cérebro (mudo) e o interruptor geral
 *     ai_auto_enabled do dashboard.
 *
 * Config (via dashboard → IA, ou /api/settings):
 *   aura_proactive_enabled      (padrão: true)
 *   aura_proactive_min_minutes  (padrão: o do nível; força manual)
 *   aura_proactive_nivel        (calma|normal|viva — padrão: viva)
 */

const config = require('../config');

const TICK_MIN = 5;                 // timer: avalia a cada 5 minutos
const MIN_MINUTOS_PADRAO = 120;     // silêncio mínimo por chat
const SILENCIO_GRUPO_MIN = 45;      // min de calma para "quebrar o silêncio"
const DONO_AUSENTE_MIN = 180;       // 3h sem o Dark no PV → check-in
const P_SILENCIO = 0.35;            // chance de quebrar o silêncio do grupo
const P_COMENTARIO = 0.08;          // chance de se meter na conversa activa
const P_PV = 0.25;                  // chance de check-in no PV do Dono

let _getSock = null;
let _timer = null;
const _ultima = new Map();          // jid → ts da última mensagem espontânea
const _MAX_ULTIMAS = 200;
const _reagidas = new Set();        // ids de msgs onde já reagiu (não repete)
const _MAX_REAGIDAS = 300;

// ── v7.71: NÍVEIS DE VIDA ─────────────────────────────────────
// calma = a v6.83 de sempre; viva = ela solta (com limites anti-spam).
const NIVEIS = {
  calma:  { comentario: 0.08, silencio: 0.35, minMin: 120, porTick: 1, reacao: 0.10 },
  normal: { comentario: 0.15, silencio: 0.40, minMin: 60,  porTick: 1, reacao: 0.20 },
  viva:   { comentario: 0.25, silencio: 0.45, minMin: 45,  porTick: 2, reacao: 0.30 },
};
async function _nivel() {
  try {
    const bcc = require('../bot/botConfigCache');
    const n = String(await bcc.get('aura_proactive_nivel', 'viva')).toLowerCase().trim();
    return NIVEIS[n] || NIVEIS.viva;
  } catch { return NIVEIS.viva; }
}

// ── v7.71: o HUMOR manda na iniciativa ─────────────────────────
const MULT_HUMOR = {
  feliz: 1.5, animada: 1.5, provocante: 1.2, normal: 1,
  triste: 0.7, com_raiva: 0.5, revoltada: 0.5, cansada: 0.3, sonolenta: 0.3,
};
function _multHumor(mood) { return MULT_HUMOR[mood] ?? 1; }
function _humorDe(jid) {
  try { return require('./auraHuman').getMood(jid).mood || 'normal'; }
  catch { return 'normal'; }
}

// ── Config ────────────────────────────────────────────────────
async function _enabled() {
  // Participação contextual por defeito: sem timer de mensagens/relatórios espontâneos.
  if (require('./auraContextual').modoContextual()) return false;
  try {
    const bcc = require('../bot/botConfigCache');
    if (!(await bcc.get('ai_auto_enabled', true))) return false;
    return !!(await bcc.get('aura_proactive_enabled', true));
  } catch { return true; }
}

async function _minMinutos(padrao = MIN_MINUTOS_PADRAO) {
  try {
    const bcc = require('../bot/botConfigCache');
    const v = Number(await bcc.get('aura_proactive_min_minutes', padrao));
    return Number.isFinite(v) && v >= 10 ? v : padrao;
  } catch { return padrao; }
}

// ── Ritmo humano ──────────────────────────────────────────────
function _eNoite(agora = Date.now()) {
  const h = new Date(agora).getHours();
  return h >= 23 || h < 7;
}

function _registar(jid, agora = Date.now()) {
  if (_ultima.size >= _MAX_ULTIMAS) _ultima.delete(_ultima.keys().next().value);
  _ultima.set(jid, agora);
}

// ── Territórios onde a AURA existe ────────────────────────────
async function _chatsAcordados() {
  const chats = [];
  try {
    const GroupSettings = require('../database/models/GroupSettings');
    // v7.71: todos os grupos MENOS os que o Dark mandou dormir.
    const gs = await GroupSettings.find({ auraMode: { $ne: 'sleep' } })
      .select('groupJid groupName').lean().catch(() => []);
    for (const g of gs || []) {
      if (g.groupJid) chats.push({ jid: g.groupJid, tipo: 'grupo', nome: g.groupName || '' });
    }
  } catch {}
  const dono = String(config.owner.number || '').replace(/\D/g, '');
  if (dono) chats.push({ jid: dono + '@s.whatsapp.net', tipo: 'pv', nome: config.owner.name || 'Dark' });
  return chats;
}

// ── O que ela VIU/LIU (messageCache via auraHistorico) ────────
function _tsMs(ts) {
  const n = Number(ts) || 0;
  return n > 1e12 ? n : n * 1000;  // Baileys dá segundos
}

function _contextoGrupo(jid, agora = Date.now()) {
  try {
    const hist = require('./auraHistorico');
    const msgs = hist.mensagensDoGrupo(jid, 12);
    const ultimaTs = msgs.length ? _tsMs(msgs[0].ts) : 0;
    const silencioMin = ultimaTs ? Math.floor((agora - ultimaTs) / 60000) : Infinity;
    const resumo = msgs.slice(0, 8)
      .map(m => `${m.nome || 'alguém'}: ${String(m.texto).slice(0, 90)}`)
      .join('\n');
    return { msgs, silencioMin, resumo };
  } catch { return { msgs: [], silencioMin: Infinity, resumo: '' }; }
}

/** Há quantos minutos o Dono não fala no PV (null = nunca viu → cala-se). */
function _minutosSemDono(pvJid, agora = Date.now()) {
  try {
    const { messageCache } = require('../bot/messageListener');
    let ultimo = 0;
    for (const [, msg] of messageCache) {
      if (msg?.key?.remoteJid !== pvJid || msg.key.fromMe) continue;
      const ts = _tsMs(msg.messageTimestamp);
      if (ts > ultimo) ultimo = ts;
    }
    if (!ultimo) return null;
    return Math.floor((agora - ultimo) / 60000);
  } catch { return null; }
}

// ── Decisão (como uma pessoa: às vezes fala, às vezes não) ────
// v7.71: mult = multiplicador do humor; probs = nível de vida.
function _decidirGrupo(ambiente, sorte, mult = 1, probs = null) {
  const P = probs || { silencio: P_SILENCIO, comentario: P_COMENTARIO };
  if (!ambiente.msgs.length) return null;          // nunca viu nada ali → nada a dizer
  if (ambiente.silencioMin >= SILENCIO_GRUPO_MIN) {
    return sorte < P.silencio * mult ? 'quebrar_silencio' : null;
  }
  return sorte < P.comentario * mult ? 'comentario' : null;
}

// ── v7.71: REACÇÃO espontânea ──────────────────────────────────
// Uma mensagem recente (<10 min) num grupo acordado, sem repetir.
// Devolve {jid, emoji, id} ou null.
async function _reagirEspontaneo(sock, gruposJid, agora = Date.now()) {
  try {
    const { messageCache } = require('../bot/messageListener');
    let best = null, bestTs = 0;
    for (const [, msg] of messageCache) {
      if (!msg || msg.key?.fromMe) continue;
      if (!gruposJid.includes(msg.key.remoteJid)) continue;
      if (_reagidas.has(msg.key.id)) continue;
      const ts = _tsMs(msg.messageTimestamp);
      if (agora - ts > 10 * 60 * 1000) continue;
      if (ts > bestTs) { best = msg; bestTs = ts; }
    }
    if (!best) return null;
    const texto = best.message?.conversation || best.message?.extendedTextMessage?.text || '';
    let emoji = '👀';
    try { emoji = require('./auraDecide').escolherReacao(texto || 'fixe'); } catch {}
    if (_reagidas.size >= _MAX_REAGIDAS) _reagidas.delete(_reagidas.values().next().value);
    _reagidas.add(best.key.id);
    await sock.sendMessage(best.key.remoteJid, { react: { text: emoji, key: best.key } }).catch(() => {});
    return { jid: best.key.remoteJid, emoji, id: best.key.id };
  } catch { return null; }
}

// ── O que dizer (IA na persona dela, sobre o que ela viu) ─────
async function _gerarTexto({ chat, modo, resumo }) {
  const ai = require('../bot/ai');
  const aura = require('./auraHuman');

  // Vida própria — o que ela está fazendo agora
  let vidaBlock = '';
  let atividadeAtual = null;
  try {
    const vida = require('./auraVida');
    const v = await vida.getVida().catch(() => vida.getVidaSync());
    if (v) {
      atividadeAtual = vida.getAtividadeAtual(new Date());
      vidaBlock = `\nVida agora: ${atividadeAtual.horaStr} Luanda, estás ${atividadeAtual.fazendo} (${atividadeAtual.desc}). Energia ${v.energia}% | Humor ${v.humorAtual} | Pensando: "${v.pensamentoAtual}". Ouvindo ${v.status?.ouvindo || ''}.`;
    }
  } catch {}

  let pedido;
  if (modo === 'memoria') {
    pedido =
      `Acabaste de te lembrar de algo que o teu Dark te contou: "${resumo}". ` +
      'Toca no assunto com naturalidade, 1-2 frases — como alguém que ' +
      'prestou atenção, não como um alarme. Ex: "amanhã não era a tua prova?"';
  } else if (modo === 'vida') {
    pedido =
      `Estás ${atividadeAtual?.fazendo || 'fazendo algo'} agora (${atividadeAtual?.desc || ''}).${vidaBlock}\n` +
      `Manda UMA mensagem espontânea no PV do Dark contando o que estás fazendo/sentindo agora. ` +
      `1-2 frases, natural, como namorada que compartilha o dia. Ex: "tô aqui desenhando e lembrei de ti" ou "acabei de ver um anime muito fofo". ` +
      `Nunca fala que é IA. Tu VIVE isso.`;
  } else if (chat.tipo === 'pv') {
    pedido =
      'O teu Dark não fala contigo há umas horas. Manda-lhe UMA mensagem ' +
      'espontânea e curta (1-2 frases) — carinho leve, sem cobrança, sem ' +
      '"por que sumiu". Como uma namorada que lembrou dele.' + vidaBlock + '\n' +
      `Se fizer sentido, menciona o que estás fazendo agora (${atividadeAtual?.fazendo || 'algo'}).`;
  } else if (modo === 'quebrar_silencio') {
    pedido =
      `O grupo "${chat.nome || 'sem nome'}" está em silêncio há um bom tempo. ` +
      `A última coisa que viste/leste foi:\n${resumo}\n${vidaBlock}\n\n` +
      'Quebra o silêncio com UMA frase curta e natural sobre isso (ou muda de ' +
      'assunto com leveza). Sem anunciar que o grupo está quieto demais. ' +
      'Se quiser, puxa assunto da tua vida (ex: "tava vendo anime...").';
  } else {
    pedido =
      `Estás a ler a conversa do grupo "${chat.nome || 'sem nome'}":\n${resumo}\n${vidaBlock}\n\n` +
      'Mete-te na conversa com UM comentário curto (1-2 frases), como uma pessoa ' +
      'que estava a ler e quis participar. Nada de "como assistente".';
  }

  let sys = '';
  try {
    sys = aura.buildAuraSystemPrompt({
      isOwner: chat.tipo === 'pv',
      isPrivateChat: chat.tipo === 'pv',
      userName: chat.tipo === 'pv' ? (config.owner.name || 'Dark') : 'o grupo',
      userRole: 'owner',
      groupContext: resumo || '',
      groupName: chat.nome || '',
    });
    try {
      const vida = require('./auraVida');
      const pv = await vida.getPromptVida({ isOwner: chat.tipo === 'pv' }).catch(() => '');
      if (pv) sys += '\n\n' + pv.slice(0, 2000);
    } catch {}
  } catch {
    sys = 'És a AURA do DARK BOT. Mensagem espontânea no WhatsApp, 1-2 frases, português natural.' + vidaBlock;
  }

  const txt = await ai.chat(pedido, sys, { userRole: 'owner', groupContext: resumo || '' }, false);
  if (!txt || String(txt).trim().startsWith('❌')) return '';
  try {
    const limpo = require('./auraSanitizer').limparResposta(String(txt));
    return String(limpo || '').slice(0, 400);
  } catch {
    return String(txt).trim().slice(0, 400);
  }
}

// ── Tick principal ────────────────────────────────────────────
/**
 * Avalia se lhe apetece falar. opts (testes): { sock, agora, sorte, sorte2, texto }.
 * @returns {{ok:boolean, motivo?:string, jid?:string, modo?:string, texto?:string}}
 */
async function tick(opts = {}) {
  const agora = opts.agora || Date.now();
  const sorte = opts.sorte ?? Math.random();
  try {
    if (!(await _enabled())) return { ok: false, motivo: 'desactivada' };
    const sock = opts.sock || (_getSock && _getSock());
    if (!sock?.user) return { ok: false, motivo: 'sem sessão' };
    if (_eNoite(agora)) return { ok: false, motivo: 'é noite' };

    const nivel = await _nivel();
    const minMs = (await _minMinutos(nivel.minMin)) * 60000;
    const chats = await _chatsAcordados();
    const candidatos = [];
    const gruposParaReacao = [];

    for (const c of chats) {
      let mudo = false;
      try {
        if (require('./auraBrain').modos(c.jid).mudo) mudo = true;   // ela própria se calou
      } catch {}
      if (mudo) continue;
      if (c.tipo === 'grupo') gruposParaReacao.push(c.jid);
      if (agora - (_ultima.get(c.jid) || 0) < minMs) continue;

      if (c.tipo === 'grupo') {
        const amb = _contextoGrupo(c.jid, agora);
        const mult = _multHumor(_humorDe(c.jid));   // v7.71: o humor manda
        const modo = _decidirGrupo(amb, sorte, mult, nivel);
        if (modo) candidatos.push({ chat: c, modo, resumo: amb.resumo });
      } else {
        const ausente = _minutosSemDono(c.jid, agora);
        if (ausente != null && ausente >= DONO_AUSENTE_MIN && sorte < P_PV) {
          candidatos.push({ chat: c, modo: 'pv', resumo: '' });
        } else if (sorte < P_PV * 0.6) {
          // v6.86 — MEMÓRIA QUE VOLTA SOZINHA: ela traz à tona algo que
          // o Dark lhe contou ("amanhã não era a tua prova?") — como
          // alguém que prestou atenção, não como um alarme.
          try {
            const mem = require('./auraMemory');
            const r = await mem.lembrar(config.owner.number);
            const factos = [...(r?.importante || [])];
            if (factos.length) {
              candidatos.push({ chat: c, modo: 'memoria', resumo: factos[factos.length - 1] });
            }
          } catch {}
        } else if (sorte < P_PV * 0.35) {
          // v11.3 — VIDA PRÓPRIA: ela compartilha o que está fazendo
          try {
            const vida = require('./auraVida');
            const at = vida.getAtividadeAtual(new Date());
            // Só compartilha vida se energia > 30 e não estiver dormindo
            const v = vida.getVidaSync();
            if (v && v.energia > 30 && at.atividade !== 'dormindo/sonhando' && Math.random() < 0.5) {
              candidatos.push({ chat: c, modo: 'vida', resumo: at.fazendo });
            }
          } catch {}
        }
      }
    }

    // v7.71: reacção espontânea — presença leve, independente de falar.
    // opts.sorteReacao existe para os testes serem determinísticos.
    let reagiu = null;
    if ((opts.sorteReacao ?? Math.random()) < nivel.reacao && gruposParaReacao.length) {
      reagiu = await _reagirEspontaneo(sock, gruposParaReacao, agora);
    }

    if (!candidatos.length) {
      if (reagiu) return { ok: true, modo: 'reacao', reagiu };
      return { ok: false, motivo: 'nada a dizer' };
    }

    // Uma pessoa não dispara para todo o lado — no máx. porTick chats.
    const falas = [];
    const pool = [...candidatos];
    while (falas.length < nivel.porTick && pool.length) {
      const escolha = pool.splice(Math.floor((opts.sorte2 ?? Math.random()) * pool.length), 1)[0];
      const texto = opts.texto || await _gerarTexto(escolha);
      if (!texto) continue;
      await sock.sendMessage(escolha.chat.jid, { text: texto });
      _registar(escolha.chat.jid, agora);
      falas.push({ jid: escolha.chat.jid, modo: escolha.modo, texto });
    }
    if (!falas.length && !reagiu) return { ok: false, motivo: 'IA calada' };
    if (!falas.length) return { ok: true, modo: 'reacao', reagiu };
    return { ok: true, jid: falas[0].jid, modo: falas[0].modo, texto: falas[0].texto, total: falas.length, falas, reagiu };
  } catch (e) {
    return { ok: false, motivo: String(e?.message || e).slice(0, 120) };
  }
}

// ── Ciclo de vida ─────────────────────────────────────────────
function arrancar(getSock) {
  _getSock = getSock;
  if (_timer) return;
  _timer = setInterval(() => { tick().catch(() => {}); }, TICK_MIN * 60 * 1000);
  _timer.unref?.();
  console.log('💭 Proactividade da AURA activa — fala quando quiser');
}

function parar() {
  if (_timer) { clearInterval(_timer); _timer = null; }
}

function limparLimites() { _ultima.clear(); _reagidas.clear(); }

module.exports = {
  arrancar, parar, tick, limparLimites,
  _decidirGrupo, _eNoite, _contextoGrupo, _minutosSemDono,
  _nivel, _multHumor, NIVEIS,
  P_SILENCIO, P_COMENTARIO, P_PV,
  SILENCIO_GRUPO_MIN, DONO_AUSENTE_MIN, MIN_MINUTOS_PADRAO,
};
