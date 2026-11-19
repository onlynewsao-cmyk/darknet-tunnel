'use strict';
/** v7.86 — AUTO-VISU1: anti-foto/vídeo converte em view-once (mantém descrição + marca quem mandou) */
const Module = require('module');
const orig = Module.prototype.require;
let GS = {};
const ev = [];
let lastSend = null;
let DL = () => Buffer.alloc(4096, 7); // download simulado da lib (comutável)
const senderP = '244901@s.whatsapp.net';
Module.prototype.require = function (id) {
  if (id === '../config') return { owner: { number: '244900000001' } };
  if (id === './hotCache') return { getGroupSettings: async () => GS };
  if (id === './liveBroadcaster') return { antilinkAction: () => {} };
  if (id === './prefixEngine') return { detect: async (t) => (String(t).startsWith('!') ? { command: 'play' } : null) };
  if (id === 'baileys-v6') return { downloadMediaMessage: (...args) => DL(...args) };
  return orig.apply(this, arguments);
};
const at = require('../src/bot/antiTipos');
let ok = 0, fail = 0;
const t = (n, c, x = '') => { if (c) { ok++; console.log('  ✅', n); } else { fail++; console.log('  ❌', n, x); } };

const sock = {
  user: { id: '244999:1@s.whatsapp.net' },
  groupMetadata: async () => ({ participants: [{ id: '244999@s.whatsapp.net', admin: 'admin' }, { id: senderP }] }),
  sendMessage: async (j, c) => { lastSend = c; ev.push(c.delete ? 'delete' : c.viewOnce ? 'visu1' : 'text'); },
  groupParticipantsUpdate: async () => [],
};
const mkImg = (cap) => ({ key: { remoteJid: '9@g.us', participant: senderP, id: 'm1', fromMe: false }, message: { imageMessage: { caption: cap } } });
const mkVid = (cap) => ({ key: { remoteJid: '9@g.us', participant: senderP, id: 'm2', fromMe: false }, message: { videoMessage: { caption: cap } } });

(async () => {
  // 1. anti-foto + visu1 (padrão) → apaga + reenvia view-once com descrição e menção
  GS = { antifoto: 1 };
  at._reset(); ev.length = 0;
  const r1 = await at.check(sock, mkImg('olha essa'));
  t('foto: apaga e reenvia em visu1', r1 === true && ev.join(',') === 'delete,visu1', ev.join(','));
  t('foto: mantém a descrição', String(lastSend.caption).includes('olha essa'), lastSend?.caption);
  t('foto: marca quem mandou', (lastSend.mentions || []).includes(senderP) && String(lastSend.caption).includes('@244901'));
  t('foto: sem warn (conversão não castiga)', ev.filter(e => e === 'text').length === 0);

  // 2. anti-vídeo idem
  GS = { antivideo: 1 };
  at._reset(); ev.length = 0;
  const r2 = await at.check(sock, mkVid('cena do jogo'));
  t('vídeo: visu1 com descrição', r2 === true && ev.join(',') === 'delete,visu1' && String(lastSend.caption).includes('cena do jogo'), ev.join(','));
  t('vídeo: é video mesmo', !!lastSend.video);

  // 3. autoVisu1 off → fluxo normal (apaga + avisa)
  GS = { antifoto: 1, autoVisu1: false };
  at._reset(); ev.length = 0;
  const r3 = await at.check(sock, mkImg('x'));
  t('autoVisu1 off: apaga + avisa', r3 === true && ev.join(',') === 'delete,text', ev.join(','));

  // 4. antis só-apaga: áudio / contacto / texto
  GS = { antiaudio: 1 };
  at._reset(); ev.length = 0;
  await at.check(sock, { key: { remoteJid: '9@g.us', participant: senderP, id: 'm3', fromMe: false }, message: { audioMessage: {} } });
  t('anti-áudio: só apaga+avisa', ev.join(',') === 'delete,text', ev.join(','));

  GS = { anticontacto: 1 };
  at._reset(); ev.length = 0;
  await at.check(sock, { key: { remoteJid: '9@g.us', participant: senderP, id: 'm4', fromMe: false }, message: { contactsMessage: {} } });
  t('anti-contacto: só apaga+avisa', ev.join(',') === 'delete,text', ev.join(','));

  GS = { antitexto: 1 };
  at._reset(); ev.length = 0;
  await at.check(sock, { key: { remoteJid: '9@g.us', participant: senderP, id: 'm5', fromMe: false }, message: { conversation: 'conversa fiada' } });
  t('anti-texto: apaga texto', ev.join(',') === 'delete,text', ev.join(','));

  // 5. anti-texto não come comandos do bot
  ev.length = 0;
  const r5 = await at.check(sock, { key: { remoteJid: '9@g.us', participant: senderP, id: 'm6', fromMe: false }, message: { conversation: '!play musica' } });
  t('anti-texto: comando ! passa', r5 === false && ev.length === 0, ev.join(','));

  // 6. sem media p/ baixar → apaga + avisa (não crasha)
  //    e PROVA do bug v7.86: o sock NUNCA teve downloadMediaMessage —
  //    agora quem baixa é o export da lib.
  GS = { antifoto: 1 };
  t('sock sem downloadMediaMessage (realidade Baileys)', typeof sock.downloadMediaMessage !== 'function', String(typeof sock.downloadMediaMessage));
  DL = () => { throw new Error('expirado'); };
  at._reset(); ev.length = 0;
  const r6 = await at.check(sock, mkImg('sem buffer'));
  t('foto sem buffer: apaga + avisa curto', r6 === true && ev.join(',') === 'delete,text', ev.join(','));
  DL = () => Buffer.alloc(4096, 7);

  // 7. v7.89 — OS CAMPOS EXISTEM NO SCHEMA (o mongoose já não apaga os toggles)
  const paths = require('../src/database/models/GroupSettings').schema.paths;
  const vivos = ['antifoto','antivideo','antiaudio','antitexto','anticontacto','autoVisu1','autoDl','modorpg'];
  const faltam = vivos.filter(f => !paths[f]);
  t('schema tem os campos dos antis v7.86', faltam.length === 0, faltam.join(','));
  t('schema tem autoVisu1 com default true', paths.autoVisu1 && paths.autoVisu1.options.default === true, String(paths.autoVisu1?.options.default));
  t('schema tem modorpg (mundo RPG por grupo)', !!paths.modorpg && paths.modorpg.options.default === false, String(paths.modorpg?.options.default));

  console.log(`\n${fail ? '💥' : '🎉'} ANTI-VISU1: ${ok} OK / ${fail} FALHOU\n`);
  process.exit(fail ? 1 : 0);
})();
