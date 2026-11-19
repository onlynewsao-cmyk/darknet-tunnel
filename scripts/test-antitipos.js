'use strict';
const at = require('../src/bot/antiTipos');
let ok = 0, fail = 0;
const t = (n, c, d = '') => { c ? ok++ : fail++; console.log(`  ${c ? '✅' : '❌'} ${n} ${d}`); };
const G = '1@g.us', P = '244900@s.whatsapp.net';
const mk = (message) => ({ key: { remoteJid: G, participant: P, id: 'x', fromMe: false }, message });
const ALL = { antistatus: 1, antimencao: 1, antipagamento: 1, antiinvisivel: 1, antiflood: 1, antidoc: 1, antiloc: 1, antifigurinha: 1, antibtn: 1, antipalavra: 1, palavrasProibidas: ['bosta', 'zé'], antitoxic: 1, antiporn: 1 };
// v7.75: cada chamada usa um participante fresco (a rajada conta volume por
// pessoa — 20 testes rápidos na mesma chave disparavam-na). Sequências reais
// (repetido/rajada/slowmode) passam same=true.
let _np = 0;
const d = (m, gs = ALL, same = false) => {
  const who = same ? P : ('t' + (_np++) + '@s.whatsapp.net');
  return at.detectar({ key: { remoteJid: G, participant: who, id: 'x' + _np, fromMe: false }, message: m }, gs)?.flag || null;
};

t('texto normal passa', d({ conversation: 'olá pessoal, tudo bem?' }) === null);
t('antistatus: statusMentionMessage', d({ statusMentionMessage: {} }) === 'antistatus');
t('antistatus: groupStatusMentionMessage', d({ groupStatusMentionMessage: {} }) === 'antistatus');
t('antistatus: reenvio de estado (statusSourceType)', d({ extendedTextMessage: { text: 'olha', contextInfo: { statusSourceType: 1 } } }) === 'antistatus');
t('antipagamento: requestPaymentMessage', d({ requestPaymentMessage: {} }) === 'antipagamento');
t('antipagamento: sendPaymentMessage', d({ sendPaymentMessage: {} }) === 'antipagamento');
t('antimencao: 8 menções', d({ extendedTextMessage: { text: 'x', contextInfo: { mentionedJid: Array.from({ length: 8 }, (_, i) => i + '@s.whatsapp.net') } } }) === 'antimencao');
t('antimencao: 3 menções passa', d({ extendedTextMessage: { text: 'x', contextInfo: { mentionedJid: ['1@s.whatsapp.net', '2@s.whatsapp.net', '3@s.whatsapp.net'] } } }) === null);
t('antimencao: @todos (groupMentions)', d({ extendedTextMessage: { text: '@todos', contextInfo: { groupMentions: [{ groupJid: G }] } } }) === 'antimencao');
t('antiinvisivel: só zero-width', d({ conversation: '\u200b\u200b\u200b\u200b' }) === 'antiinvisivel');
t('antiinvisivel: fantasma (vazio com mentions)', d({ extendedTextMessage: { text: '', contextInfo: { mentionedJid: ['1@s.whatsapp.net'] } } }) === 'antiinvisivel');
t('antiinvisivel: zalgo', d({ conversation: 'o' + '\u0301\u0302\u0303'.repeat(150) }) === 'antiinvisivel');
t('antiinvisivel: acento normal NÃO é zalgo', d({ conversation: 'coração, avô, açúcar — está tudo bem?' }) === null);
t('antiflood: gigante', d({ conversation: 'a'.repeat(6001) }) === 'antiflood');
t('antiflood: 12 linhas iguais', d({ conversation: Array(12).fill('spam').join('\n') }) === 'antiflood');
at._reset();
let r = null; for (let i = 0; i < 4; i++) r = d({ conversation: 'compra já' }, ALL, true);
t('antiflood: 4× a mesma msg em 30s', r === 'antiflood');
at._reset();
// v7.75 PRO — rajada (volume) + slowmode
let rj = null; for (let i = 0; i < 8; i++) rj = d({ conversation: 'msg diferente ' + i }, ALL, true);
t('antiflood: rajada (8 msgs diferentes em 10s)', rj === 'antiflood');
at._reset();
let rs = null; for (let i = 0; i < 5; i++) rs = d({ stickerMessage: {} }, { antiflood: 1 }, true);
t('antiflood: chuva de figurinhas (5 em 30s)', rs === 'antiflood');
at._reset();
t('slowmode desligado → passa', d({ conversation: 'oi' }, { slowmode: 0 }) === null);
const sl1 = d({ conversation: 'primeira' }, { slowmode: 30 }, true);
const sl2 = d({ conversation: 'segunda logo' }, { slowmode: 30 }, true);
t('slowmode: 1.ª passa, 2.ª imediata cai', sl1 === null && sl2 === 'slowmode');
at._reset();
t('antidoc', d({ documentMessage: {} }) === 'antidoc');
t('antidoc dentro de documentWithCaption', d({ documentWithCaptionMessage: { message: { documentMessage: {} } } }) === 'antidoc');
t('antiloc', d({ locationMessage: {} }) === 'antiloc');
t('antifigurinha', d({ stickerMessage: {} }) === 'antifigurinha');
// v7.86 — antis novos (só apaga) + foto/vídeo p/ visu1
t('antifoto', d({ imageMessage: {} }, { antifoto: 1 }) === 'antifoto');
t('antifoto off passa', d({ imageMessage: {} }, {}) === null);
t('antivideo', d({ videoMessage: {} }, { antivideo: 1 }) === 'antivideo');
t('antiaudio', d({ audioMessage: {} }, { antiaudio: 1 }) === 'antiaudio');
t('anticontacto', d({ contactsMessage: {} }, { anticontacto: 1 }) === 'anticontacto');
t('antitexto apanha texto', d({ conversation: 'bla bla' }, { antitexto: 1 }) === 'antitexto');
t('antitexto não come foto', d({ imageMessage: {} }, { antitexto: 1 }) === null);
t('antibtn: buttonsMessage', d({ buttonsMessage: {} }) === 'antibtn');
t('antibtn: interactiveMessage', d({ interactiveMessage: {} }) === 'antibtn');
t('antipalavra: "bosta" (com acento no texto)', d({ conversation: 'isto é uma BÓSTA' }) === 'antipalavra');
t('antipalavra: "zé" não apanha "zebra"', d({ conversation: 'vi uma zebra' }) === null);
t('antitoxic', d({ conversation: 'vai te foder seu idiota' }) === 'antitoxic');
t('antiporn: link', d({ conversation: 'entra no xvideos' }) === 'antiporn');
t('flags desligadas → nada', d({ stickerMessage: {} }, {}) === null);
t('ephemeral desembrulha', d({ ephemeralMessage: { message: { stickerMessage: {} } } }) === 'antifigurinha');
t('viewOnce desembrulha', d({ viewOnceMessageV2: { message: { documentMessage: {} } } }) === 'antidoc');

// check() completo com sock fake
(async () => {
  const Model = require('../src/database/models/GroupSettings');
  const ev = [];
  const sock = {
    user: { id: '244999:1@s.whatsapp.net' },
    groupMetadata: async () => ({ participants: [{ id: '244999@s.whatsapp.net', admin: 'admin' }, { id: P }] }),
    sendMessage: async (j, c) => { ev.push(Object.keys(c)[0]); },
    groupParticipantsUpdate: async (j, ps, a) => { ev.push('kick:' + a); },
  };
  const m = mk({ statusMentionMessage: {} });
  Model.findOne = () => ({ lean: async () => ({ antistatus: true }) });
  t('check sem serviço: flags legadas não apagam', await at.check(sock, m) === false && ev.length === 0, ev.join(','));
  Model.findOne = () => ({ lean: async () => ({ antistatus: true, isHosted: true, hostedUntil: new Date(Date.now() + 60_000) }) });
  delete m._hot;
  t('check: apaga + avisa (1/3)', await at.check(sock, m) === true && ev.join(',') === 'delete,text', ev.join(','));
  ev.length = 0; await at.check(sock, m);
  t('check: 2.º aviso dentro do cooldown → só apaga', ev.join(',') === 'delete', ev.join(','));
  ev.length = 0; await at.check(sock, m);
  t('check: 3.º → remove', ev.includes('kick:remove'), ev.join(','));
  // admin imune
  ev.length = 0;
  const mAdm = { ...m, key: { ...m.key, participant: '244999@s.whatsapp.net' } };
  t('check: admin imune', await at.check(sock, mAdm) === false && ev.length === 0);
  // bot não admin → nada
  sock.groupMetadata = async () => ({ participants: [{ id: '244999@s.whatsapp.net' }, { id: P }] });
  at._reset(); ev.length = 0;
  t('check: bot sem admin → não age', await at.check(sock, m) === false && ev.length === 0);
  // v7.75 PRO — slowmode no check() (outro grupo: o cache TTL do hotCache é por jid)
  Model.findOne = () => ({ lean: async () => ({ slowmode: 30, isHosted: true, hostedUntil: new Date(Date.now() + 60_000) }) });
  sock.groupMetadata = async () => ({ participants: [{ id: '244999@s.whatsapp.net', admin: 'admin' }, { id: '244901@s.whatsapp.net' }] });
  at._reset(); ev.length = 0;
  const G2 = '2@g.us', P2 = '244901@s.whatsapp.net';
  const mS1 = { key: { remoteJid: G2, participant: P2, id: 'slow1', fromMe: false }, message: { conversation: 'primeira' } };
  const mS2 = { key: { remoteJid: G2, participant: P2, id: 'slow2', fromMe: false }, message: { conversation: 'segunda' } };
  const rS1 = await at.check(sock, mS1);
  const rS2 = await at.check(sock, mS2);
  t('check slowmode: 1.ª passa, 2.ª apaga+avisa', rS1 === false && rS2 === true && ev.join(',') === 'delete,text', ev.join(','));
  console.log(`\n${fail ? '❌' : '🎉'} ANTI-TIPOS: ${ok} OK / ${fail} FALHOU`);
  process.exit(fail ? 1 : 0);
})();
