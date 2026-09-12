#!/usr/bin/env node
/**
 * v6.89 — REGRESSÃO DOS 3 FIXES (prints + pedido do Dark)
 *
 * 1. INSTRUÇÃO ≠ COMANDO — a frase do print
 *    "Se eu responder alguem com este sticker de ban vc remove ele tá"
 *    deixa de ser roubada pelo regex do `.ban`.
 * 2. STICKER-BAN — ensinar por conversa → confirmar como pessoa →
 *    responder com o sticker → remover a pessoa citada.
 * 3. RPG POR SELECÇÃO — !rpgstart abre listas clicáveis de raças →
 *    classes → ficha; o caminho escrito continua a funcionar.
 *
 * Uso: node scripts/test-aura-printbugs2.js
 */
'use strict';

process.env.MONGODB_URI = '';
process.env.OWNER_NUMBER = '244945280380';
process.env.BOT_NUMBER = '244949926074';
process.env.NODE_ENV = 'development';

const mongoose = require('mongoose');
mongoose.set('bufferTimeoutMS', 150);

let ok = 0, fail = 0;
const t = (n, c, e) => { c ? ok++ : fail++; console.log(`  ${c ? '✅' : '❌'} ${n}${e ? ' → ' + String(e).slice(0, 90) : ''}`); };

const FRASE_PRINT = 'Se eu responder alguem com este sticker de ban vc remove ele tá';
const GRUPO = '12036301826@g.us';
const DONO = '244945280380';
const VITIMA = '258872126737';

// ── Stub do RPGPlayer (sem DB) ──────────────────────────────
const RPGPlayer = require('../src/database/models/RPGPlayer');
const _players = new Map();
const _key = n => String(n).replace(/\D/g, '');
RPGPlayer.findOne = async function (q) { return _players.get(_key(q.whatsappNumber)) || null; };
RPGPlayer.getOrCreate = async function (num, name = 'Aventureiro') {
  const k = _key(num);
  if (!_players.has(k)) {
    _players.set(k, new RPGPlayer({
      whatsappNumber: k, name,
      hp: 150, maxHp: 150, mp: 80, maxMp: 80, coins: 0,
      stats: { str: 6, dex: 6, int: 6, vit: 6, luk: 6 },
      inventory: ['poção de vida'],
    }));
  }
  return _players.get(k);
};
RPGPlayer.prototype.save = async function () { _players.set(_key(this.whatsappNumber), this); return this; };

// renderEngine sem DB → tema default
try {
  const RE = require('../src/bot/renderEngine');
  RE.getTheme = async () => null;
} catch (_) {}

function mkSock() {
  const enviados = [];
  const relay = [];
  const calls = [];
  return {
    enviados, relay, calls,
    user: { id: '244949926074:5@s.whatsapp.net', lid: '998877@lid' },
    sendMessage: async (jid, content, opts) => { enviados.push({ jid, content, opts }); return { key: { id: 'OUT' + (enviados.length) } }; },
    relayMessage: async (jid, message, opts) => { relay.push({ jid, message, opts }); },
    groupParticipantsUpdate: async (jid, users, acao) => { calls.push({ jid, users, acao }); return [{ id: users[0], status: '200' }]; },
    groupMetadata: async (jid) => ({ id: jid, subject: 'DARK RPG', participants: [
      { id: `${DONO}@s.whatsapp.net`, admin: 'superadmin' },
      { id: `${VITIMA}@s.whatsapp.net` },
      { id: '244949926074:5@s.whatsapp.net' },
    ]}),
    sendPresenceUpdate: async () => {}, readMessages: async () => {},
    profilePictureUrl: async () => null,
  };
}

function msgsDe(sock) {
  return sock.enviados.map(e => String(e.content?.text || '')).join('\n');
}

function msgTexto(texto, de = DONO, citaSticker = false) {
  const message = citaSticker
    ? { extendedTextMessage: { text: texto, contextInfo: {
        stanzaId: 'STK123', participant: `${DONO}@s.whatsapp.net`,
        quotedMessage: { stickerMessage: { url: 'https://mmg.whatsapp.net/sticker.webp', fileSha256: Buffer.from('BANSTICKERSHA'), fileEncSha256: Buffer.from('x'), mediaKey: Buffer.from('y'), mimetype: 'image/webp' } },
      } } }
    : { conversation: texto };
  return { key: { id: 'REALMSG' + Math.floor(Math.random() * 1e6), remoteJid: GRUPO, fromMe: false, participant: `${de}@s.whatsapp.net` }, message, pushName: de === DONO ? 'Dark' : 'Membro' };
}

function msgSticker(de, citando = null, sha = 'BANSTICKERSHA') {
  const message = { stickerMessage: {
    url: 'https://mmg.whatsapp.net/sticker.webp',
    fileSha256: Buffer.from(sha), fileEncSha256: Buffer.from('x'), mediaKey: Buffer.from('y'),
    mimetype: 'image/webp',
    ...(citando ? { contextInfo: { stanzaId: 'MSGVITIMA', participant: citando } } : {}),
  } };
  return { key: { id: 'REALSTK' + Math.floor(Math.random() * 1e6), remoteJid: GRUPO, fromMe: false, participant: `${de}@s.whatsapp.net` }, message, pushName: de === DONO ? 'Dark' : 'Membro' };
}

const ctxDe = (de = DONO) => ({
  remoteJid: GRUPO, isGroup: true, senderNumber: de,
  senderJid: `${de}@s.whatsapp.net`, pushName: de === DONO ? 'Dark' : 'Membro',
  sock: null,
});

(async () => {
  // ═══ 1. INSTRUÇÃO ≠ COMANDO ═══
  console.log('\n═══ 1. INSTRUÇÃO ≠ COMANDO (frase do print) ═══');
  const auraCmds = require('../src/aura/auraCommands');
  const d1 = auraCmds.detectarComando(FRASE_PRINT);
  t('frase do print NÃO vira comando .ban', d1 === null, JSON.stringify(d1));
  const d2 = auraCmds.detectarComando('aura bane o Zeca');
  t('ordem directa "aura bane o Zeca" continua a funcionar', d2 && d2.comando === 'ban', JSON.stringify(d2));
  t('"quando eu disser x vc fecha o grupo" é instrução', auraCmds.eInstrucao('quando eu disser a palavra x vc fecha o grupo'));

  // ═══ 2. STICKER-BAN — aprender + executar ═══
  console.log('\n═══ 2. STICKER-BAN (ensinar → confirmar → remover) ═══');
  const stickerBan = require('../src/aura/stickerBan');
  await stickerBan._reset();

  // 2a. fim-a-fim pelo handler: a frase do print com o sticker citado
  const ch = require('../src/bot/commandHandler');
  const sock1 = mkSock();
  const rHandle = await ch.handle(sock1, msgTexto(FRASE_PRINT, DONO, true));
  const out1 = msgsDe(sock1);
  t('handler consome a instrução e ela confirma como pessoa', rHandle === true && /removo|Tá/i.test(out1), out1.slice(0, 80));
  t('NÃO responde com o uso do .ban (bug do print)', !/Marca o utilizador|\.ban/i.test(out1), out1.slice(0, 80));

  const est1 = await stickerBan.estado();
  t('regra guardada com o hash do sticker citado', est1.activa === true && est1.hash && est1.hash.includes('…'), JSON.stringify(est1));

  // 2b. execução: Dono responde à vítima com o sticker de ban
  const sock2 = mkSock();
  const ctxD = ctxDe(DONO);
  const rExec = await stickerBan.executar({ sock: sock2, msg: msgSticker(DONO, `${VITIMA}@s.whatsapp.net`), ctx: ctxD, isOwner: true });
  t('sticker-resposta do Dono remove a pessoa citada', rExec === true && sock2.calls.length === 1 && sock2.calls[0].acao === 'remove' && sock2.calls[0].users[0] === `${VITIMA}@s.whatsapp.net`, JSON.stringify(sock2.calls));
  t('confirma "Removido por ordem do Dark"', /Removido por ordem do Dark/.test(msgsDe(sock2)), msgsDe(sock2).slice(0, 60));

  // 2c. guardas
  const sock3 = mkSock();
  const rDono = await stickerBan.executar({ sock: sock3, msg: msgSticker(DONO, `${DONO}@s.whatsapp.net`), ctx: ctxDe(DONO), isOwner: true });
  t('nunca remove o próprio Dono', rDono === false && sock3.calls.length === 0);
  const rBot = await stickerBan.executar({ sock: sock3, msg: msgSticker(DONO, '244949926074:5@s.whatsapp.net'), ctx: ctxDe(DONO), isOwner: true });
  t('nunca remove o bot', rBot === false && sock3.calls.length === 0);
  const rOutro = await stickerBan.executar({ sock: sock3, msg: msgSticker(VITIMA, `${DONO}@s.whatsapp.net`), ctx: ctxDe(VITIMA), isOwner: false });
  t('não-dono com o sticker não remove nada', rOutro === false && sock3.calls.length === 0);

  // 2d. cancelamento + fluxo pendente (frase sem sticker)
  const sock4 = mkSock();
  await stickerBan.cancelar({ sock: sock4, msg: msgTexto('cancela a regra do sticker de ban', DONO), ctx: ctxDe(DONO), texto: 'cancela a regra do sticker de ban', isOwner: true });
  t('cancela por conversa', (await stickerBan.estado()).activa === false);

  const rPend = await stickerBan.aprender({ sock: sock4, msg: msgTexto(FRASE_PRINT, DONO), ctx: ctxDe(DONO), texto: FRASE_PRINT });
  const outPend = msgsDe(sock4);
  t('frase sem sticker → regra pendente + pede o sticker', rPend === true && /manda-me.{0,12}sticker/i.test(outPend), outPend.slice(-90));

  const rCap = await stickerBan.capturarPendente({ sock: sock4, msg: msgSticker(DONO), ctx: ctxDe(DONO), isOwner: true });
  const est2 = await stickerBan.estado();
  t('próximo sticker do Dono fica registado', rCap === true && est2.activa && !est2.pendente && est2.hash, JSON.stringify(est2));

  // ═══ 3. RPG POR SELECÇÃO ═══
  console.log('\n═══ 3. RPG — gerador de personagens por selecção ═══');
  const flow = require('../src/bot/rpg/createFlow');
  flow.pendentes().clear();
  const sockR = mkSock();
  const ctxR = ctxDe(DONO);
  ctxR.pushName = 'Dark';

  // !rpgstart vazio → lista de raças (relay interactiva OU texto com as raças)
  await flow.start({ sock: sockR, msg: msgTexto('!rpgstart', DONO), ctx: ctxR, args: [] });
  const tudoR = JSON.stringify(sockR.relay) + msgsDe(sockR);
  t('!rpgstart abre a lista de RAÇAS (shinobi…saiyajin)', /shinobi/.test(tudoR) && /saiyajin/.test(tudoR));

  // clique RPGPICK_R_shinobi → guarda a raça e abre classes
  sockR.relay.length = 0; sockR.enviados.length = 0;
  await flow.pick({ sock: sockR, msg: msgTexto('RPGPICK_R_shinobi', DONO), ctx: ctxR, token: 'RPGPICK_R_shinobi' });
  const tudoC = JSON.stringify(sockR.relay) + msgsDe(sockR);
  const pend = flow.pendentes().get(DONO) || {};
  t('clique na raça → pendente com race=shinobi', pend.race === 'shinobi', JSON.stringify(pend));
  t('abre a lista de CLASSES (RPGPICK_C_)', /RPGPICK_C_|guerreiro/.test(tudoC));

  // clique RPGPICK_C_pirata → personagem criado com bónus
  sockR.relay.length = 0; sockR.enviados.length = 0;
  await flow.pick({ sock: sockR, msg: msgTexto('RPGPICK_C_pirata', DONO), ctx: ctxR, token: 'RPGPICK_C_pirata' });
  const p = _players.get(DONO);
  const strBase = 6 + (require('../src/bot/rpg/engine').ORIGINS.shinobi.bonus.str || 0);
  t('personagem criado: raça shinobi + classe pirata', p && p.race === 'shinobi' && p.class === 'pirata', JSON.stringify({ race: p?.race, class: p?.class }));
  t('bónus da origem aplicado nas stats', p && p.stats.str === strBase, `str=${p?.stats?.str} esperado=${strBase}`);
  t('ficha final enviada', /PERSONAGEM CRIADO|personagem criado|Usa/i.test(msgsDe(sockR)), msgsDe(sockR).slice(0, 70));

  // caminho escrito continua: !rpgstart Zeca saiyajin hashira
  sockR.relay.length = 0; sockR.enviados.length = 0;
  await flow.start({ sock: sockR, msg: msgTexto('!rpgstart Zeca saiyajin hashira', DONO), ctx: ctxR, args: ['Zeca', 'saiyajin', 'hashira'] });
  const p2 = _players.get(DONO);
  t('caminho escrito !rpgstart Nome raça classe cria directo', p2 && p2.name === 'Zeca' && p2.race === 'saiyajin' && p2.class === 'hashira', JSON.stringify({ name: p2?.name, race: p2?.race, class: p2?.class }));

  console.log(`\n${'═'.repeat(50)}\n${ok > 0 && fail === 0 ? '🎉' : '💀'} PRINTBUGS2: ${ok} OK / ${fail} FALHOU\n`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('ERRO FATAL:', e); process.exit(1); });
