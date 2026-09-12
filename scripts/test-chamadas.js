/**
 * DARK BOT — CHAMADAS: atender, ouvir, falar, responder (v6.68)
 *
 * ── O QUE O BAILEYS DEIXA MESMO FAZER ────────────────────────
 * Auditado no @systemzero/baileys 1.1.1:
 *   ✅ rejectCall(callId, callFrom)
 *   ✅ evento 'call' (offer/ringing/accept/reject/timeout/terminate)
 *   ❌ acceptCall — NÃO EXISTE
 *   ❌ WebRTC / SRTP / ICE — NÃO EXISTE
 * Logo, não há stream de áudio bidireccional. O callHandler faz o
 * mais próximo que funciona: conversa por notas de voz.
 *
 * Este teste verifica o ciclo todo com mocks fiéis, e (se houver
 * chaves) faz uma volta REAL: TTS → bytes → transcrição.
 *
 * Uso: node scripts/test-chamadas.js
 */
'use strict';

process.env.OWNER_NUMBER = '244945280380';
const path = require('path');
const Module = require('module');
const orig = Module.prototype.require;
const STORE = {};
Module.prototype.require = function (id) {
  if (/models\//.test(id)) {
    const w = v => { const p = Promise.resolve(v); p.lean = () => Promise.resolve(v); p.sort = () => p; p.limit = () => p; return p; };
    return { find: () => w([]), findOne: () => w(null), countDocuments: async () => 0, getOrCreate: async () => null };
  }
  if (id.endsWith('botConfigCache')) return { get: async (k, d) => (k in STORE ? STORE[k] : d), set: async (k, v) => { STORE[k] = v; } };
  return orig.apply(this, arguments);
};

const C = require(path.join(__dirname, '..', 'src', 'bot', 'callHandler'));
const OWNER = '244945280380@s.whatsapp.net';
const ZE = '244900000111@s.whatsapp.net';
let ok = 0, fail = 0;
const t = (n, c, e) => { e = e || ''; c ? ok++ : fail++; console.log('  ' + (c ? '✅' : '❌') + ' ' + n + (e ? ' → ' + String(e).replace(/\n/g, ' ').slice(0, 74) : '')); };

function mkSock() {
  const acts = [], msgs = [];
  return {
    acts, msgs,
    rejectCall: async (id, from) => { acts.push('reject:' + from); },
    sendMessage: async (j, c) => {
      msgs.push({ j, audio: !!c.audio, ptt: !!c.ptt, text: c.text ? String(c.text).slice(0, 60) : null,
                  bytes: c.audio ? c.audio.length : 0 });
      return { key: { id: 'x' } };
    },
  };
}

(async () => {
  console.log('\n╔═══ CHAMADAS: ATENDER · OUVIR · FALAR · RESPONDER ═══╗');

  // ── A. O que a API do Baileys realmente tem ────────────────
  console.log('\n▸ A. Limites reais da API (auditado no código-fonte)');
  const fs = require('fs');
  const bail = path.join(__dirname, '..', 'node_modules', '@systemzero', 'baileys', 'lib', 'Socket', 'messages-recv.js');
  const src = fs.existsSync(bail) ? fs.readFileSync(bail, 'utf8') : '';
  t('rejectCall existe', /const rejectCall = async/.test(src), 'confirmado no código');
  t('acceptCall NÃO existe (é por isso que não há stream)', !/acceptCall|answerCall/.test(src), 'confirmado');
  t('Evento call emitido', /ev\.emit\('call'/.test(src), '');

  // ── B. Modos ────────────────────────────────────────────────
  console.log('\n▸ B. Modos de chamada');
  t('Padrão do Dono é atender', (await C.getMode(OWNER, true)) === 'atender', await C.getMode(OWNER, true));
  t('Padrão de qualquer um é atender', (await C.getMode(ZE, false)) === 'atender', await C.getMode(ZE, false));
  const sm = await C.setMode(ZE, 'atender');
  t('setMode grava', sm.ok && (await C.getMode(ZE, false)) === 'atender', '');
  t('Persiste no MongoDB', !!STORE['darkbot_call_modes_v1'], JSON.stringify(STORE['darkbot_call_modes_v1'] || {}).slice(0, 50));
  t('Modo inválido é recusado', !(await C.setMode(ZE, 'voar')).ok, '');
  await C.setMode(ZE, 'rejeitar');

  // ── C. Rejeitar ─────────────────────────────────────────────
  console.log('\n▸ C. REJEITAR (estranho)');
  const s1 = mkSock();
  const r1 = await C.onCall(s1, { id: 'c1', from: ZE, status: 'offer', isVideo: false }, { ownerJid: OWNER, ownerNumber: '244945280380' });
  t('Rejeita mesmo', r1.modo === 'rejeitar' && s1.acts.includes('reject:' + ZE), s1.acts.join(','));
  t('Avisa quem ligou', s1.msgs.some(m => m.j === ZE), '');
  t('Notifica o Dono', s1.msgs.some(m => m.j === OWNER && /ligou/i.test(m.text || '')), '');

  // ── D. Ignorar ──────────────────────────────────────────────
  console.log('\n▸ D. IGNORAR');
  await C.setMode(ZE, 'ignorar');
  const s2 = mkSock();
  const r2 = await C.onCall(s2, { id: 'c2', from: ZE, status: 'offer' }, { ownerJid: OWNER });
  t('Não mexe em nada', r2.modo === 'ignorar' && s2.acts.length === 0 && s2.msgs.length === 0, '');

  // ── E. Atender ──────────────────────────────────────────────
  console.log('\n▸ E. ATENDER (o Dono liga)');
  const s3 = mkSock();
  const r3 = await C.onCall(s3, { id: 'c3', from: OWNER, status: 'offer', isVideo: false },
    { ownerJid: OWNER, ownerNumber: '244945280380', isOwner: true });
  t('Assume a chamada', r3.modo === 'atender', r3.modo);
  // v6.76: a saudação é o ÚNICO sinal de que a AURA atendeu — a biblioteca
  // não entra no áudio da chamada. Sem ela, quem liga não recebe nada e
  // conclui que o bot não atende. Exige-se 1 mensagem (áudio PTT ou texto).
  t('Avisa que atendeu', s3.msgs.length === 1, s3.msgs.map(m => m.text || 'media').join(','));
  t('Não entra em conversa sozinha', (r3.turnos || 0) === 0, String(r3.turnos || 0));
  t('Chamada fica activa', !!C.chamadaActiva(OWNER), '');
  t('Não se notifica a si próprio', !s3.msgs.some(m => /Chamada atendida/.test(m.text || '')), '');

  // ── F. Só 'offer' conta ─────────────────────────────────────
  console.log('\n▸ F. Estados que não são oferta');
  const s4 = mkSock();
  for (const st of ['ringing', 'accept', 'reject', 'timeout', 'terminate']) {
    await C.onCall(s4, { id: 'c9', from: ZE, status: st }, { ownerJid: OWNER });
  }
  t('Ignora ringing/accept/reject/timeout/terminate', s4.acts.length === 0 && s4.msgs.length === 0, '');

  // ── G. Despedida ────────────────────────────────────────────
  console.log('\n▸ G. Detecta despedida');
  const desp = ['tchau', 'até logo', 'desliga', 'adeus', 'falamos depois', 'beijo'];
  const naoDesp = ['tudo bem', 'como estás', 'conta lá', 'oi'];
  t('Reconhece despedidas', desp.every(d => C.ehDespedida(d)), desp.filter(d => !C.ehDespedida(d)).join(',') || '6/6');
  t('Não confunde conversa normal', naoDesp.every(d => !C.ehDespedida(d)), naoDesp.filter(d => C.ehDespedida(d)).join(',') || '4/4');

  // ── H. Ciclo de conversa (ouvir → entender → falar) ─────────
  console.log('\n▸ H. Ciclo completo com áudio simulado');
  const aiPath = path.join(__dirname, '..', 'src', 'bot', 'ai');
  const ai = require(aiPath);
  const _tr = ai.transcribeAudio, _sp = ai.speakWithFallback;
  ai.transcribeAudio = async () => 'oi aura tudo bem contigo';
  ai.speakWithFallback = async () => Buffer.alloc(9000, 1);

  const s5 = mkSock();
  const conv = await C.continuarConversa(s5, OWNER, Buffer.alloc(5000, 7), { pushName: 'Dark' });
  t('Ouviu o que foi dito', conv.ok && /tudo bem/.test(conv.ouviu), conv.ouviu);
  t('Respondeu alguma coisa', !!conv.respondeu, String(conv.respondeu).slice(0, 60));
  t('Respondeu em ÁUDIO (ptt)', s5.msgs.some(m => m.ptt && m.bytes > 500), s5.msgs.map(m => m.ptt ? 'PTT' : 'txt').join(','));
  t('Contou o turno', conv.turnos === 1, 'turnos=' + conv.turnos);

  // despedida encerra
  ai.transcribeAudio = async () => 'ok tchau aura';
  const s6 = mkSock();
  const fim = await C.continuarConversa(s6, OWNER, Buffer.alloc(5000, 7), {});
  t('Despedida termina a chamada', fim.terminou === true && !C.chamadaActiva(OWNER), '');

  // sem chamada activa não faz nada
  const s7 = mkSock();
  const semC = await C.continuarConversa(s7, ZE, Buffer.alloc(5000, 7), {});
  t('Sem chamada activa não responde', semC.semChamada === true && s7.msgs.length === 0, '');

  // áudio impercetível
  C._activas.set(OWNER, { id: 'x', isVideo: false, inicio: Date.now(), ultimo: Date.now(), turnos: 0, isOwner: true });
  ai.transcribeAudio = async () => { throw new Error('sem chave'); };
  ai.transcribeAssemblyAI = async () => { throw new Error('sem chave'); };
  const s8 = mkSock();
  const mau = await C.continuarConversa(s8, OWNER, Buffer.alloc(5000, 7), {});
  t('Áudio impercetível → pede para repetir', !mau.ok && s8.msgs.length > 0, s8.msgs[0]?.ptt ? 'PTT' : s8.msgs[0]?.text);
  ai.transcribeAudio = _tr; ai.speakWithFallback = _sp;
  C.terminar(OWNER);

  // ── I. TTS de emojis/markdown ───────────────────────────────
  console.log('\n▸ I. Limpeza para o TTS');
  ai.speakWithFallback = async (txt) => { ai.__ultimo = txt; return Buffer.alloc(9000, 1); };
  const s9 = mkSock();
  await C.falar(s9, OWNER, '*Olá* meu 🖤 _Dark_ 😏 tudo bem?');
  t('Tira emojis e markdown antes de falar', !/[*_🖤😏]/.test(ai.__ultimo || ''), JSON.stringify(ai.__ultimo));
  ai.speakWithFallback = _sp;

  // ── J. VOLTA REAL (se houver chaves) ────────────────────────
  console.log('\n▸ J. Volta REAL: falar → bytes → ouvir');
  let real = false;
  try {
    require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
    const buf = await ai.speakWithFallback('Oi Dark, estou aqui a ouvir.');
    if (buf && buf.length > 1000) {
      const magic = buf.slice(0, 4).toString('hex');
      const mp3 = /^(fffb|fff3|4944)/.test(magic);
      t('TTS devolve MP3 real', mp3, buf.length + ' bytes, magic ' + magic);
      const txt = await ai.transcribeAudio(buf, 'pt');
      t('Transcrição devolve o que foi dito', /ouvir|dark/i.test(String(txt)), String(txt).slice(0, 70));
      real = true;
    }
  } catch (e) {
    console.log('  ⚠️  Sem rede/chaves — volta real saltada (' + e.message.slice(0, 40) + ')');
  }
  if (!real) console.log('  ⚠️  Volta real não corrida (offline)');

  console.log('\n  ' + ok + ' OK / ' + fail + ' FALHOU\n');
  process.exit(fail ? 1 : 0);
})();
