'use strict';
/** v7.51 — CALL-SEGURO: garantia de ZERO chamadas automáticas.
 * Uma chamada de saída não pedida pelo Dono = ban instantâneo do número.
 * Este teste trava TODOS os caminhos de saída: comandos, NL, AURA,
 * autoCall, callback e o atendimento de entrada — exclusivo do Dono. */
delete process.env.AUTO_CALL;
process.env.OWNER_NUMBER = '244900000001';
process.env.OWNER_NAME = 'Dark Net';
const Module = require('module'); const orig = Module.prototype.require;
const VOIP_OUT = [];   // tentativas via bot/callVoip.ligar
const BRIDGE_OUT = []; // tentativas via bot/callBridge.*
const w = (v) => { const p = Promise.resolve(v); p.lean = () => p; p.select = () => p; p.sort = () => p; p.limit = () => p; p.catch = () => p; return p; };
const KNOWN = '244933344455'; // conhecido, NÃO dono
Module.prototype.require = function (id) {
  const s = String(id);
  if (/callVoip/.test(s)) return {
    suportado: () => true,
    activa: () => false,
    ligar: async (...a) => { VOIP_OUT.push(a); return { ok: true, metodo: 'mock' }; },
    desligar: async () => ({ ok: true }),
    falar: async () => ({ ok: true }),
    tocarMusica: async () => ({ ok: true }),
    parar: () => {},
  };
  if (/callBridge/.test(s)) return {
    tentarLigar: async (...a) => { BRIDGE_OUT.push(['tentarLigar', ...a]); return { ok: false, motivo: 'mock' }; },
    ligarGrupo: async (...a) => { BRIDGE_OUT.push(['ligarGrupo', ...a]); return { ok: false, motivo: 'mock' }; },
  };
  if (s === './ai' || /bot[\\/]ai$/.test(s)) return { speakWithFallback: async () => { throw new Error('tts-off'); } };
  if (/liveVoip/.test(s)) return { disponivel: async () => false };
  if (/models[\\/]User/.test(s)) return { findOne: (q) => w(q.number === KNOWN ? { number: q.number, nome: 'Amigo' } : null) };
  if (/models[\\/]/.test(s)) return { find: () => w([]), findOne: () => w(null), findOneAndUpdate: async () => null, countDocuments: async () => 0, create: async () => ({}) };
  if (s.endsWith('botConfigCache')) return {
    get: async (k, d) => k === 'owner_lid' ? '213907088089212@lid' : d,
    set: async () => {},
  };
  return orig.apply(this, arguments);
};
const ch = require('../src/bot/caseHandler'); ch.loadCases();
const config = require('../src/config');
const OWNER = '244900000001', FREE = '244911111111';
function mkCtx(num, group) {
  const owner = num === OWNER;
  return { remoteJid: group ? '120363@g.us' : num + '@s.whatsapp.net', isGroup: group, senderJid: num + '@s.whatsapp.net', senderNumber: num, pushName: owner ? 'Dono' : 'Zeca', isOwner: owner, prefix: '!' };
}
function mkSock(sent) {
  return {
    user: { id: '244900000002:1@s.whatsapp.net' },
    sendMessage: async (j, c) => { sent.push(c); return { key: { id: 'x' } }; },
    groupMetadata: async () => ({ subject: 'G', participants: [] }),
    rejectCall: async () => ({}), acceptCall: async () => { throw new Error('no'); }, query: async () => { throw new Error('no'); },
  };
}
async function run(cmd, num, group, args = []) {
  const sent = [];
  const ctx = mkCtx(num, group);
  await ch.runCase(cmd, { sock: mkSock(sent), msg: { key: { id: 'm' }, pushName: ctx.pushName, message: { conversation: '!' + cmd } }, ctx, args, text: args.join(' '), prefix: '!', isOwner: ctx.isOwner, command: cmd, from: ctx.remoteJid, sender: ctx.senderJid, config });
  return sent.map(s => s.text || s.caption || '').join('\n');
}
(async () => {
  let ok = 0, fail = 0;
  const C = (n, c, x = '') => { if (c) ok++; else fail++; console.log(c ? '  ✅' : '  ❌', n, c ? '' : String(x).slice(0, 200)); };

  // ── 1. COMANDOS: não-dono recusado, zero saída ──
  let t = await run('ligar', FREE, false);
  C('!ligar não-dono: recusa', /dark pede|dono/i.test(t), t.slice(0, 120));
  C('!ligar não-dono: ZERO voip/bridge', VOIP_OUT.length === 0 && BRIDGE_OUT.length === 0, JSON.stringify({ v: VOIP_OUT.length, b: BRIDGE_OUT.length }));
  t = await run('call', FREE, false);
  C('!call não-dono: recusa + zero saída', /dark pede|dono/i.test(t) && VOIP_OUT.length === 0 && BRIDGE_OUT.length === 0, t.slice(0, 120));
  t = await run('ligarnum', FREE, false, [KNOWN]);
  C('!ligarnum não-dono: recusa + zero saída', /dono/i.test(t) && VOIP_OUT.length === 0, t.slice(0, 120));
  t = await run('videocall', FREE, false, [KNOWN]);
  C('!videocall não-dono: recusa + zero saída', /dono/i.test(t) && VOIP_OUT.length === 0 && BRIDGE_OUT.length === 0, t.slice(0, 120));

  // ── 2. DONO continua a funcionar (gate não partiu o positivo) ──
  const v0 = VOIP_OUT.length;
  t = await run('ligar', OWNER, false);
  C('!ligar dono: CHEGA ao voip (positivo intacto)', VOIP_OUT.length === v0 + 1, t.slice(0, 120));

  // ── 3. AURA actions: gate DENTRO da acção ──
  const AA = require('../src/aura/auraActions');
  const sentA = []; const sockA = mkSock(sentA);
  let r = await AA.executar('ligar', null, { sock: sockA, ctx: { ...mkCtx(FREE, false) } });
  C('aura ligar não-dono: ok:false', r && r.ok === false, JSON.stringify(r).slice(0, 120));
  C('aura ligar não-dono: zero saída', VOIP_OUT.length === v0 + 1 && BRIDGE_OUT.length === 0, JSON.stringify({ v: VOIP_OUT.length, b: BRIDGE_OUT.length }));
  r = await AA.executar('ligarGrupo', null, { sock: sockA, ctx: { ...mkCtx(FREE, true) } });
  C('aura ligarGrupo não-dono: ok:false + zero saída', r && r.ok === false && VOIP_OUT.length === v0 + 1 && BRIDGE_OUT.length === 0, JSON.stringify(r).slice(0, 120));
  const b0 = BRIDGE_OUT.length;
  r = await AA.executar('ligar', null, { sock: sockA, ctx: { ...mkCtx(OWNER, false) } }).catch(e => ({ ok: false, erro: e.message }));
  C('aura ligar dono: passa o gate (tenta sair)', VOIP_OUT.length > v0 + 1 || BRIDGE_OUT.length > b0, JSON.stringify(r).slice(0, 120));

  // ── 4. NL "liga-me" não-dono via pipeline completo ──
  const cmdH = require('../src/bot/commandHandler');
  const sentN = []; const sockN = mkSock(sentN);
  sockN.relayMessage = async () => {}; sockN.sendPresenceUpdate = async () => {}; sockN.readMessages = async () => {};
  const msgN = { key: { remoteJid: FREE + '@s.whatsapp.net', id: 'n1', fromMe: false }, pushName: 'Zeca', message: { conversation: 'liga-me' } };
  const vb = VOIP_OUT.length + BRIDGE_OUT.length;
  let threw = null;
  try { await cmdH.handle(sockN, msgN); } catch (e) { threw = e.message; }
  C('NL liga-me não-dono: zero saída', VOIP_OUT.length + BRIDGE_OUT.length === vb, `threw=${threw} v=${VOIP_OUT.length} b=${BRIDGE_OUT.length}`);

  // ── 5. AUTOCALL desligado por omissão ──
  const AC = require('../src/bot/autoCall');
  const st = AC.arrancar(mkSock([]));
  C('autoCall sem env: desligado_por_env', st && st.ok === false && /desligado/.test(st.motivo || ''), JSON.stringify(st));
  C('autoCall sem env: sem timer', AC.estado && AC.estado().ligado === false, JSON.stringify(AC.estado ? AC.estado() : null));
  AC.parar();

  // ── 6. CALLBACK só dono ──
  const CH = require('../src/bot/callHandler');
  const cb = await CH.tentarCallbackVozReal(mkSock([]), { id: 'c1' }, { ownerCall: false });
  C('callback não-dono: so_dono', cb && cb.ok === false && cb.motivo === 'so_dono', JSON.stringify(cb));

  // ── 7. ENTRADA: voz e vídeo são SÓ do Dono ─────────────────
  // Não existe exceção para contactos conhecidos ou modos antigos: terceiros
  // recebem apenas rejectCall, sem texto, PTT, callback, IA ou sessão activa.
  const sentI = []; let rej = 0; let accepts = 0;
  const sockI = mkSock(sentI);
  sockI.rejectCall = async () => { rej++; return {}; };
  sockI.acceptCall = async () => { accepts++; return {}; };

  const unk = await CH.onCall(sockI, { id: 'u1', from: '999000111@s.whatsapp.net', status: 'offer' }, {});
  C('desconhecido: rejeita em silêncio, ZERO texto', unk.motivo === 'so_dono' && unk.ignorado === true && rej === 1 && sentI.length === 0 && accepts === 0, JSON.stringify({ m: unk.modo, rej, sent: sentI.length, accepts }));
  const known = await CH.onCall(sockI, { id: 'k1', from: KNOWN + '@s.whatsapp.net', status: 'offer' }, {});
  C('contacto conhecido também NÃO é atendido', known.motivo === 'so_dono' && rej === 2 && sentI.length === 0 && accepts === 0, JSON.stringify({ m: known.modo, rej, sent: sentI.length, accepts }));

  const ownerVoice = await CH.onCall(sockI, { id: 'owner-v1', from: OWNER + '@s.whatsapp.net', status: 'offer', isVideo: false }, { ownerNumber: OWNER });
  C('Dono: chamada de voz é atendida', ownerVoice.modo === 'atender' && !ownerVoice.ignorado && accepts === 1 && sentI.length === 1, JSON.stringify(ownerVoice).slice(0, 150));
  const sentAntes = sentI.length;
  const ownerDuplicate = await CH.onCall(sockI, { id: 'owner-v1', from: OWNER + '@s.whatsapp.net', status: 'offer', isVideo: false }, { ownerNumber: OWNER });
  C('evento repetido do Dono não duplica atendimento', ownerDuplicate.motivo === 'ja_processada' && accepts === 1 && sentI.length === sentAntes, JSON.stringify(ownerDuplicate));
  const ownerVideo = await CH.onCall(sockI, { id: 'owner-v2', from: OWNER + '@s.whatsapp.net', status: 'offer', isVideo: true }, { ownerNumber: OWNER });
  C('Dono: chamada de vídeo é atendida', ownerVideo.modo === 'atender' && !ownerVideo.ignorado && accepts === 2 && sentI.length === sentAntes + 1, JSON.stringify(ownerVideo).slice(0, 150));
  const ownerLid = await CH.onCall(sockI, { id: 'owner-lid', from: '213907088089212@lid', status: 'offer' }, { ownerNumber: OWNER });
  C('LID guardado do Dono também é autorizado', ownerLid.modo === 'atender' && !ownerLid.ignorado && accepts === 3, JSON.stringify(ownerLid).slice(0, 150));

  console.log(`\nCALL-SEGURO: ${ok} OK / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
