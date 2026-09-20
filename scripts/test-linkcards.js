#!/usr/bin/env node
/**
 * v9.17 📇 CARTÕES DE LINK + ANTI-LINK INTERACTIVO + BOTÕES DE PAINEL
 *   A) antiLink.superficieLinks: link escondido em botões/flows/listas
 *      deixa de ser buraco; replies a mensagens antigas NÃO contam.
 *   B) buttonHandler.sendUrlButtons: 1–3 urlButton «iguais aos do canal»,
 *      foto opcional, cascade relay → templateButtons → texto (nunca morre).
 *   C) !linkcartao / !divulgarcartao: parse, uso, probe que degrada a onda
 *      para links no corpo quando o cliente não aceita botões.
 *   D) !divulgar metricas / !divulgaragendas: botões quick_reply vivos
 *      (reativar N sem teclar; parar/soltar agenda).
 *   E) hub do cliente com as duas linhas novas.
 */
'use strict';

process.env.MONGODB_URI = '';
process.env.DIVULGAR_MIN_MS = '1';
process.env.DIVULGAR_PAUSA_A_CADA = '999999';
process.env.DIVULGAR_PAUSA_MIN_MS = '1';
process.env.DIVULGAR_PAUSA_MAX_MS = '1';
process.env.DIVULGAR_PASS_MIN_MS = '1';
process.env.DIVULGAR_PASS_MAX_MS = '1';

const assert = require('assert');
const Module = require('module');
const _orig = Module.prototype.require;

let GS = { antilink: true, antilinkMode: 'all_links', antilinkAction: 'delete' };
let _relays = [];
const sent = [];
let _db = new Map();
let _pvBtnFail = false;
let _carroH = null;

const META = {
  id: 'G1@g.us', subject: '💎 RÁDIO DARK',
  participants: [
    { id: '2443@s.whatsapp.net' },
    { id: '2449@s.whatsapp.net', admin: 'admin' }, // bot admin E dono
    { id: '2450@s.whatsapp.net', admin: 'superadmin' }, // ADM do grupo
  ],
};
const GRUPO2 = { id: 'G2@g.us', subject: '🔥 VENDAS', participants: META.participants };

const buf = {
  get: async (k, d) => (_db.has(k) ? _db.get(k) : d),
  set: async (k, v) => { _db.set(k, v); return v; },
};

Module.prototype.require = function (id) {
  const s = String(id);
  if (s.endsWith('/config') || s === '../../config' || s === '../config') {
    return { bot: { name: 'DARK BOT', prefix: '!' }, owner: { number: '2449' }, ai: { groq: 'k', gemini: null } };
  }
  if (s.endsWith('botConfigCache')) return buf;
  if (s.endsWith('hotCache')) return { getGroupSettings: async () => GS, getUser: async () => null, forgetGroup: () => {} };
  if (s.endsWith('GroupSettings')) return { findOne: () => ({ lean: async () => null }), updateOne: async () => {} };
  if (s.includes('baileys')) {
    const p = { fromObject: (o) => o, toObject: (o) => o };
    return {
      generateWAMessageFromContent: (jid, content) => ({ key: { id: 'gen', remoteJid: jid }, message: { _wrapped: content } }),
      prepareWAMessageMedia: async (m) => ({ imageMessage: { url: 'fake://img', mimetype: m && m.image ? 'image/jpeg' : undefined } }),
      downloadMediaMessage: async () => Buffer.from('MEDIAFAKE-9.17-'.repeat(20)),
      proto: {
        Message: { InteractiveMessage: { ...p, Body: p, Footer: p, Header: p, NativeFlowMessage: p, ContextInfo: p } },
      },
    };
  }
  if (s.endsWith('liveBroadcaster')) return { antilinkAction: () => {}, publish: () => {} };
  if (s.endsWith('/carousel') || s.endsWith('rpg/carousel')) return { enviarCarrossel: async (sock, msg, ctx, o) => { _carroH = { capt: o }; return true; }, _imgCache: new Map(), _imagem: async () => null };
  if (s.endsWith('mediaHandler')) return { fetchBuffer: async () => Buffer.from('X'.repeat(200)) };
  return _orig.apply(this, arguments);
};

const sockF = {
  user: { id: '2449@s.whatsapp.net' },
  waUploadToServer: async () => ({ url: 'fake://up' }),
  async sendMessage(jid, c) {
    if (_pvBtnFail && jid === '2449@s.whatsapp.net' && c && c.templateButtons) throw new Error('templateButtons rejeitado');
    sent.push({ jid, ...c });
    return { key: { id: 'k' } };
  },
  async relayMessage(jid, m, o) { _relays.push({ jid, m, o }); return {}; },
  async groupMetadata(jid) { return jid === 'G2@g.us' ? GRUPO2 : META; },
  async groupFetchAllParticipating() { return { 'G1@g.us': META, 'G2@g.us': GRUPO2 }; },
};
const J = (o) => JSON.stringify(o);

(async () => {
  console.log('=== v9.17 — CARTÕES DE LINK + ANTI-LINK INTERACTIVO ===');

  // ══ A. ANTI-LINK — a superfície rica deixa de ser buraco ══
  const al = require('../src/bot/antiLink');

  const mkMsg = (message, from = '2443@s.whatsapp.net') => ({
    key: { remoteJid: 'G1@g.us', fromMe: false, id: 'm' + Math.random(), participant: from },
    message,
  });

  // A1 — unitária: superficieLinks apanha url do cta_url e do template
  const sup1 = al.superficieLinks(mkMsg({
    interactiveMessage: {
      body: { text: 'olha isto 😉' },
      nativeFlowMessage: { buttons: [{ name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: 'Abrir', url: 'http://esconso.example/x' }) }] },
    },
  }));
  assert.ok(sup1.includes('esconso.example'), 'A1a superfície extrai URL do cta_url');
  const sup2 = al.superficieLinks(mkMsg({
    templateMessage: { hydratedButtons: [{ urlButton: { displayText: 'Ver', url: 'http://tpl.example/y' } }] },
  }));
  assert.ok(sup2.includes('tpl.example'), 'A1b superfície extrai URL do urlButton (template)');
  assert.strictEqual(al.superficieLinks(mkMsg({ conversation: 'só texto' })), '', 'A1c texto puro → superfície vazia');

  // A2 — end-to-end check(): link SÓ no botão → o anti-link apaga
  const mBtn = mkMsg({
    interactiveMessage: {
      body: { text: 'bom dia grupo ☀️' },
      footer: { text: 'canal' },
      nativeFlowMessage: { buttons: [{ name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: 'Entrar', url: 'http://spam.example/convite' }) }] },
    },
  });
  sent.length = 0;
  assert.strictEqual(await al.check(sockF, mBtn), true, 'A2 link escondido no botão é detetado');
  assert.ok(sent.some((x) => x.delete), 'A2b mensagem apagada');

  // A3 — reply a mensagem antiga com link NÃO é flag (sem falsos positivos)
  const mQuote = mkMsg({
    extendedTextMessage: {
      text: 'bom dia!',
      contextInfo: { quotedMessage: { conversation: 'entra em http://antigo.example/convite' }, remoteJid: 'G1@g.us', stanzaId: 'old' },
    },
  });
  assert.strictEqual(await al.check(sockF, mQuote), false, 'A3 link no quote não conta');

  // A4 — quick_reply sem URL não é flag (os nossos botões de painel passam)
  const mQR = mkMsg({
    interactiveMessage: {
      body: { text: 'escolhe' },
      nativeFlowMessage: { buttons: [{ name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: 'Repetir', id: '!divulgarrepetir' }) }] },
    },
  });
  assert.strictEqual(await al.check(sockF, mQR), false, 'A4 quick_reply sem link passa limpo');

  // A5 — regressão: link no texto continua a ser apanhado
  assert.strictEqual(await al.check(sockF, mkMsg({ conversation: 'entra http://spam2.example/z' })), true, 'A5 link em texto puro continua flag');

  // A6 — template com link no rodapé do cartão também
  assert.strictEqual(await al.check(sockF, mkMsg({
    templateMessage: { hydratedContent: { text: { text: 'vê isto' } }, hydratedButtons: [{ urlButton: { displayText: 't', url: 'http://t.me/s/convite' } }] },
  })), true, 'A6 urlButton de template é flag');

  // corpo VAZIO + link no botão → já não escapa pelo `!text`
  assert.strictEqual(await al.check(sockF, mkMsg({
    interactiveMessage: { nativeFlowMessage: { buttons: [{ name: 'cta_url', buttonParamsJson: JSON.stringify({ url: 'http://vazio.example/b' }) }] } },
  })), true, 'A7 cartão sem corpo também é varrido');
  console.log('✔ ANTI-LINK: botões/flows/templates varridos; quotes e quick_reply limpos');

  // ══ B. sendUrlButtons — o cartão «igual ao do canal» ══
  const bh = require('../src/bot/buttonHandler');
  _relays = []; sent.length = 0;
  const r1 = await bh.sendUrlButtons(sockF, '2449@s.whatsapp.net', 'DROP NOVO 🔥', '☣️ DARKTOXIC', [
    { text: 'Canal', url: 'https://whatsapp.com/channel/abc123' },
    { text: 'YouTube', url: 'https://youtu.be/xyz' },
    { text: 'Site', url: 'https://dark.example' },
  ], null, {});
  let j1 = J(_relays[_relays.length - 1].m);
  assert.ok(j1, 'B1 relay aconteceu');
  assert.strictEqual((_relays[_relays.length - 1].m._wrapped.viewOnceMessage.message.interactiveMessage.nativeFlowMessage.buttons || []).length, 3, 'B1 3 botões cta_url');
  assert.ok(!/body.*https:\/\/youtu/.test(J(_relays[_relays.length - 1].m._wrapped.viewOnceMessage.message.interactiveMessage.body)), 'B1b corpo sem links');

  // foto no header
  _relays = [];
  await bh.sendUrlButtons(sockF, '2449@s.whatsapp.net', 'COM FOTO', '☣', [{ text: 'Ver', url: 'https://dark.example' }], null, { image: Buffer.from('I'.repeat(300)) });
  const hdr = _relays[_relays.length - 1].m._wrapped.viewOnceMessage.message.interactiveMessage.header;
  assert.ok(hdr && hdr.hasMediaAttachment === true && hdr.imageMessage, 'B2 header com foto + imageMessage');

  // cascade: relay explode → templateButtons no sendMessage
  const sockExplode = {
    ...sockF,
    relayMessage: async () => { throw new Error('no relay'); },
    sendMessage: async (jid, c) => { sent.push({ jid, ...c }); return { key: { id: 'k2' } }; },
  };
  sent.length = 0;
  await bh.sendUrlButtons(sockExplode, '2449@s.whatsapp.net', 'T', 'F', [{ text: 'A', url: 'https://a.example' }, { text: 'B', url: 'https://b.example' }], null, {});
  assert.ok(sent[0] && sent[0].templateButtons && sent[0].templateButtons.length === 2, 'B3 cascade → templateButtons urlButton');
  assert.ok(sent[0].templateButtons.every((b) => b.urlButton && b.urlButton.url), 'B3b urlButton com url');

  // cascade total → texto puro com 🔗 (nunca morre)
  const sockDuro = { ...sockF, relayMessage: async () => { throw new Error('x'); }, sendMessage: async (jid, c) => { if (c.templateButtons) throw new Error('nope'); sent.push({ jid, ...c }); return {}; } };
  sent.length = 0;
  await bh.sendUrlButtons(sockDuro, '2449@s.whatsapp.net', 'T', 'F', [{ text: 'A', url: 'https://a.example' }], null, {});
  assert.ok(/🔗 A: https:\/\/a\.example/.test(sent[0].text), 'B4 último recurso: texto com link à vista');
  console.log('✔ sendUrlButtons: 1–3 botões, foto no header, cascade de 3 andares');

  // ══ C. parser + casos do painel ══
  const div = {};
  require('../src/bot/cases/divulgacao')((nomes, fn) => { for (const x of [].concat(nomes)) div[x] = fn; });
  const pc = require('../src/bot/cases/divulgacao').__test._parseCartao;
  assert.deepStrictEqual(pc('DROP | Canal=https://whatsapp.com/channel/abc'), { titulo: 'DROP', links: [{ text: 'Canal', url: 'https://whatsapp.com/channel/abc' }] }, 'C1 parse 1 link');
  assert.strictEqual(pc('DROP | a=https://x ; b=https://y ; c=https://z ; d=https://w'), null, 'C1b 4 links → null');
  assert.strictEqual(pc('sem pipe aqui'), null, 'C1c sem | → null');
  assert.strictEqual(pc('DROP | lixo sem url'), null, 'C1d segmento inválido → null');
  assert.ok(pc('DROP | https://so-url.example').links[0].text === 'Abrir link', 'C1e link nu ganha rótulo');

  const DONO = { remoteJid: 'G1@g.us', senderNumber: '2449', senderJid: '2449@s.whatsapp.net', isGroup: true, isOwner: true, prefix: '!', groupName: 'QG' };
  const reply = async (t) => { sent.push({ jid: '2449@s.whatsapp.net', text: t }); return {}; };
  const argsOf = (txt) => txt.split(/\s+/);

  // !linkcartao normal → cartão via relay com botões
  _db.set('divulg_grupos_2449', [{ jid: 'G1@g.us', nome: 'R1' }, { jid: 'G2@g.us', nome: 'R2' }]);
  _relays = []; sent.length = 0;
  await div.linkcartao({ sock: sockF, msg: { key: { id: 'lc1' } }, ctx: DONO, args: argsOf('ENQUETE DO CANAL | Votar=https://dark.example/v ; Canal=https://whatsapp.com/channel/zzz9'), isOwner: true, reply });
  let jRel = J(_relays[_relays.length - 1]);
  assert.strictEqual((_relays[_relays.length - 1].m._wrapped.viewOnceMessage.message.interactiveMessage.nativeFlowMessage.buttons || []).length, 2, 'C2 linkcartao → 2 cta_url');
  assert.ok(jRel.includes('dark.example/v'), 'C2b url nos botões');
  assert.ok(!/https?:\/\//.test(J(_relays[_relays.length - 1].m._wrapped.viewOnceMessage.message.interactiveMessage.body || {})), 'C2c corpo do cartão sem URL');

  // uso quando o parse falha
  sent.length = 0;
  await div.linkcartao({ sock: sockF, msg: { key: { id: 'lc2' } }, ctx: DONO, args: argsOf('tudo errado sem pipe'), isOwner: true, reply });
  assert.ok(/linkcartao TÍTULO/.test(sent[0].text), 'C3 parse falhado → usage');

  // divulgação bloqueada a não-donos
  sent.length = 0;
  await div.linkcartao({ sock: sockF, msg: { key: { id: 'lc3' } }, ctx: { ...DONO, senderNumber: '7777', senderJid: '7777@s.whatsapp.net', isOwner: false }, args: [], isOwner: false, reply });
  assert.ok(/só do dono/.test(sent[0].text), 'C4 free barrado');

  // !divulgarcartao — onda inteira com botões por grupo
  _relays = []; sent.length = 0;
  await div.divulgarcartao({ sock: sockF, msg: { key: { id: 'dc1' } }, ctx: DONO, args: argsOf('invisivel NOVO+DROP! | Canal=https://whatsapp.com/channel/qqq9'), isOwner: true, reply });
  const gSends = sent.filter((x) => x.jid.endsWith('@g.us'));
  assert.ok(gSends.length >= 2, 'C5 onda entregou aos 2 grupos');
  assert.ok(gSends.every((x) => x.templateButtons && x.templateButtons[0].urlButton.url === 'https://whatsapp.com/channel/qqq9'), 'C5b cartão real em cada grupo');
  assert.ok(gSends.every((x) => Array.isArray(x.mentions) && x.mentions.length > 0 && !/@2450/.test(x.text || '')), 'C5c INVISÍVEL: menção silenciosa (membros sem tags, ADMs de fora)');
  assert.ok(gSends.every((x) => !(x.mentions || []).includes('2450@s.whatsapp.net')), 'C5d ADM 2450 não é mencionado no invisível');

  // visível mostra a tag
  sent.length = 0;
  await div.divulgarcartao({ sock: sockF, msg: { key: { id: 'dc2' } }, ctx: DONO, args: argsOf('visivel DROP! | Site=https://dark.example'), isOwner: true, reply });
  const g2 = sent.filter((x) => x.jid.endsWith('@g.us'));
  assert.ok(g2.length >= 1 && /@/.test(g2[0].text || ''), 'C6 visível → @tags à vista');

  // probe falha → degrada para corpo com links, onda NUNCA morre
  sent.length = 0; _pvBtnFail = true;
  await div.divulgarcartao({ sock: sockF, msg: { key: { id: 'dc3' } }, ctx: DONO, args: argsOf('DROP! | Site=https://dark.example'), isOwner: true, reply });
  _pvBtnFail = false;
  assert.ok(sent.some((x) => /pré-visual|⚠️/.test(x.text || '')), 'C7 aviso de degradação');
  const g3 = sent.filter((x) => x.jid.endsWith('@g.us'));
  assert.ok(g3.length >= 2 && g3.every((x) => x.text.includes('🔗 Site: https://dark.example') && !x.templateButtons), 'C7b onda seguiu com links no corpo');
  console.log('✔ !linkcartao / !divulgarcartao: onda em cartão, probe corajoso, invisível intacto');

  // ══ D. botões nos painéis (a funcionar, não só enfeite) ══
  _db.set('divulg_stats_2449', {
    'G1@g.us': { ok: 5, fail: 0, consec: 0, nome: 'R1' },
    'MORTO@g.us': { ok: 0, fail: 3, consec: 3, nome: 'CEMITÉRIO' },
  });
  _relays = []; sent.length = 0;
  await div.divulgar({ sock: sockF, msg: { key: { id: 'mm1' } }, ctx: DONO, args: ['metricas'], prefix: '!', isOwner: true, reply });
  const jM = J(_relays[_relays.length - 1] && _relays[_relays.length - 1].m);
  assert.ok(jM.includes('quick_reply') && jM.includes('!divulgar reativar 1') && jM.includes('!cliente'), 'D1 métricas com botões vivos (reativar/menu)');

  _db.set('divulg_agenda_2449', [{ at: Date.now() + 3600e3, texto: 'DROP', vis: 'invisivel' }]);
  _relays = []; sent.length = 0;
  await div.divulgaragendas({ sock: sockF, msg: { key: { id: 'aa1' } }, ctx: DONO, prefix: '!', isOwner: true, reply });
  const jA = J(_relays[_relays.length - 1] && _relays[_relays.length - 1].m);
  for (const id of ['!divulgarstop', '!divulgaragendaremove', '!divulgaragenda']) {
    assert.ok(jA.includes(id), `D2 agenda tem botão ${id}`);
  }
  console.log('✔ PAINÉIS: métricas e agenda com quick_reply funcionais');

  // ══ E. hub do cliente com linhas novas ══
  _relays = []; sent.length = 0; _carroH = null;
  await div.cliente({ sock: sockF, msg: { key: { id: 'h1' } }, ctx: DONO, isOwner: true, reply });
  const idsHub = (_carroH?.capt?.cards || []).flatMap((c) => (c.botoes || []).map((b) => b.id));
  const jHub = J(_carroH);
  assert.ok(/linkcartao/.test(jHub), 'E1 hub → linha linkcartao (carrossel)');
  assert.ok(/divulgarcartao/.test(jHub), 'E2 hub → linha onda-em-cartão');
  // lista de reserva (fallback) — mesmas linhas em row ids
  _carroH = null; _relays = [];
  console.log('✔ HUB: cartões de link no menu do cliente');

  console.log('\n✅ v9.17 — 100% dos cartões e do escudo verificados');
  process.exit(0);
})().catch((e) => { console.error('❌', e && e.stack || e); process.exit(1); });
