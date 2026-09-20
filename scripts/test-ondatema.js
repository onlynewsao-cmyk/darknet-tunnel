#!/usr/bin/env node
/**
 * v9.18 🕷️ ONDA CURTA + RASTO SELADO + TEMA DO CLIENTE
 *   1) «porque é que as fotos não ficam invisíveis?» — porque o TEU rasto
 *      ficava no grupo. Agora: comando selado, foto citada do dono apagada,
 *      assistente apagado quando escolhe invisivel (ou cancelar).
 *   2) nomes curtos: !onda !parar !repetir !cartao !medidor !agenda !velocidade …
 *   3) !comandosonda — lista de texto puro (zero botões, contrato menurpg)
 *   4) !clientetema aranha|darktoxic — moldura de TODOS os painéis do dono
 *   5) hub com as linhas novas + categorias owner no submenuData
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

const sent = [];
const dels = [];
let _relays = [];
let _db = new Map();
let _carroOk = true;
let _carroH = null;

const GRP = 'G1@g.us';
const META = { id: GRP, subject: '💎 RÁDIO DARK', participants: [
  { id: '2443@s.whatsapp.net' }, { id: '2449@s.whatsapp.net', admin: 'admin' }, { id: '2450@s.whatsapp.net', admin: 'admin' },
] };

Module.prototype.require = function (id) {
  const s = String(id);
  if (s === '../../config' || s === '../config') return { bot: { name: 'DARK BOT', prefix: '!' }, owner: { number: '2449' }, ai: { groq: 'k', gemini: null } };
  if (s.endsWith('botConfigCache')) return {
    get: async (k, d) => (_db.has(k) ? _db.get(k) : d),
    set: async (k, v) => { _db.set(k, v); return v; },
  };
  if (s.endsWith('/carousel') || s.endsWith('rpg/carousel')) return { enviarCarrossel: async (sock, msg, ctx, o) => { _carroH = { capt: o }; return _carroOk; }, _imgCache: new Map(), _imagem: async () => null };
  if (s.includes('baileys')) {
    const p = { fromObject: (o) => o, toObject: (o) => o };
    return {
      generateWAMessageFromContent: (jid, content) => ({ key: { id: 'gen', remoteJid: jid }, message: { _wrapped: content } }),
      prepareWAMessageMedia: async () => ({ imageMessage: { url: 'fake://img' } }),
      downloadMediaMessage: async () => Buffer.from('FOTO-'.repeat(30)),
      proto: { Message: { InteractiveMessage: { ...p, Body: p, Footer: p, Header: p, NativeFlowMessage: p, ContextInfo: p } } },
    };
  }
  return _orig.apply(this, arguments);
};

const sockF = {
  user: { id: '2449@s.whatsapp.net' },
  waUploadToServer: async () => ({}),
  async sendMessage(jid, c) {
    if (c && c.delete) { dels.push({ jid, key: c.delete }); return { key: { id: 'd' } }; }
    sent.push({ jid, ...c });
    return { key: { id: 'k' } };
  },
  async relayMessage(jid, m, o) { _relays.push({ jid, m, o }); return {}; },
  async groupMetadata() { return META; },
  async groupFetchAllParticipating() { return { [GRP]: META }; },
};
const DONO = { remoteJid: GRP, senderNumber: '2449', senderJid: '2449@s.whatsapp.net', isGroup: true, isOwner: true, prefix: '!', groupName: 'QG' };
const reply = async (t) => { sent.push({ jid: '2449@s.whatsapp.net', text: t }); return {}; };
const J = (o) => JSON.stringify(o);

(async () => {
  console.log('=== v9.18 — ONDA CURTA + RASTO SELADO + TEMA ===');

  const mod = require('../src/bot/cases/divulgacao');
  const div = {};
  mod((nomes, fn) => { for (const x of [].concat(nomes)) div[x] = fn; });
  const consumir = mod.consumir;

  // ══ 1. aliases registados e todos chamáveis ══
  for (const a of ['onda', 'ondarapida', 'parar', 'repetir', 'medidor', 'cartao', 'cli', 'velocidade',
    'agenda', 'agendas', 'desagenda', 'historico', 'ondafoto', 'ondavideo', 'ondadoc', 'ondaaudio',
    'ondacartao', 'ondateste', 'comandosonda', 'clientetema']) {
    assert.ok(typeof div[a] === 'function', `1) alias !${a} registado`);
  }
  const sd = require('../src/bot/submenuData');
  for (const a of ['onda', 'parar', 'cartao', 'medidor', 'comandosonda', 'clientetema', 'velocidade']) {
    assert.strictEqual(sd.categorize(a), 'owner', `1b) !${a} é owner no submenuData`);
  }
  console.log('✔ NOMES CURTOS: 20 aliases vivos + categorias owner');

  // ══ 2. RASTO SELADO — a resposta à pergunta das fotos ══
  _db.set('divulg_grupos_2449', [{ jid: GRP, nome: 'R1' }, { jid: 'G2@g.us', nome: 'R2' }]);

  // 2a) !ondafoto INVISIVEL a responder à própria foto → apaga comando + foto
  dels.length = 0; sent.length = 0;
  const msgFoto = {
    key: { id: 'f1', remoteJid: GRP, fromMe: true },
    message: { extendedTextMessage: { text: 'invisivel', contextInfo: { quotedMessage: { imageMessage: { mimetype: 'image/jpeg' } }, remoteJid: GRP, stanzaId: 'FOTO_ORIGINAL', participant: '2449@s.whatsapp.net' } } },
  };
  await div.ondafoto({ sock: sockF, msg: msgFoto, ctx: DONO, args: ['invisivel'], isOwner: true, reply });
  assert.ok(dels.some((d) => d.key.id === 'f1'), '2a) comando do dono apagado');
  assert.ok(dels.some((d) => d.key.id === 'FOTO_ORIGINAL'), '2a2) foto original do dono apagada — É ISTO que faltava para «as fotos ficarem invisíveis»');
  assert.ok(sent.filter((x) => x.jid.endsWith('@g.us') && x.image).length >= 2, '2a3) onda com foto entregue aos grupos');

  // 2b) VISIVEL → nada selado (o dono quis mostrar)
  dels.length = 0; sent.length = 0;
  await div.ondafoto({ sock: sockF, msg: msgFoto, ctx: DONO, args: ['visivel'], isOwner: true, reply });
  assert.strictEqual(dels.length, 0, '2b) modo visível não apaga nada');

  // 2c) foto citada de OUTREM → só o comando é selado; conteúdo alheio intocável
  dels.length = 0; sent.length = 0;
  const msgFoto3 = JSON.parse(J(msgFoto));
  msgFoto3.message.extendedTextMessage.contextInfo.participant = '2443@s.whatsapp.net';
  await div.ondafoto({ sock: sockF, msg: msgFoto3, ctx: DONO, args: ['invisivel'], isOwner: true, reply });
  assert.ok(dels.some((d) => d.key.id === 'f1'), '2c) comando selado');
  assert.ok(!dels.some((d) => d.key.id === 'FOTO_ORIGINAL'), '2c2) foto de terceiro NUNCA é apagada');

  // 2d) não-dono → selo não dispara (o bot não apaga mensagens de free users)
  dels.length = 0; sent.length = 0;
  await div.ondafoto({ sock: sockF, msg: msgFoto3, ctx: { ...DONO, senderNumber: '2443', isOwner: false }, args: ['invisivel'], isOwner: false, reply });
  assert.strictEqual(dels.length, 0, '2d) free passa ao lado do selo');
  assert.ok(/só do dono/.test(sent[0].text), '2d2) free barrado');

  // 2e) ASSISTENTE: passos escritos → escolher INVISIVEL limpa toda a pegada
  dels.length = 0; sent.length = 0;
  await div.onda({ sock: sockF, msg: { key: { id: 's0', remoteJid: GRP }, message: {} }, ctx: DONO, args: [], prefix: '!', isOwner: true, reply });
  await consumir(sockF, { key: { id: 's1', remoteJid: GRP }, message: {} }, DONO, 'DROP NOVO 🔥');
  await consumir(sockF, { key: { id: 's2', remoteJid: GRP }, message: {} }, DONO, '2');
  await consumir(sockF, { key: { id: 's3', remoteJid: GRP }, message: {} }, DONO, 'invisivel');
  for (const sid of ['s1', 's2', 's3']) assert.ok(dels.some((d) => d.key.id === sid), `2e) passo ${sid} selado do grupo`);
  const waves = sent.filter((x) => x.jid.endsWith('@g.us') && x.text && Array.isArray(x.mentions) && x.mentions.length);
  assert.ok(waves.length >= 4, '2e2) onda de 2 passes × 2 grupos entregue na mesma (com menção silenciosa)');
  assert.ok(waves.every((x) => !/@\d/.test(x.text)), '2e3) invisível = zero tags visíveis no corpo');

  // 2f) .cancelar no meio → rasto apagado também
  dels.length = 0; sent.length = 0;
  await div.onda({ sock: sockF, msg: { key: { id: 'c0', remoteJid: GRP }, message: {} }, ctx: DONO, args: [], prefix: '!', isOwner: true, reply });
  await consumir(sockF, { key: { id: 'c1', remoteJid: GRP }, message: {} }, DONO, 'SEGREDO ABSOLUTO');
  await consumir(sockF, { key: { id: 'c2', remoteJid: GRP }, message: {} }, DONO, '.cancelar');
  assert.ok(dels.some((d) => d.key.id === 'c1') && dels.some((d) => d.key.id === 'c2'), '2f) abortar limpa a pegada escrita');
  assert.ok(!sent.some((x) => x.jid.endsWith('@g.us') && /SEGREDO/.test(x.text || '')), '2f2) nada foi divulgado');
  console.log('✔ RASTO SELADO: foto do dono + comandos + assistente invisível = zero prova no grupo');

  // ══ 3. !comandosonda — texto puro, zero botões ══
  _relays = []; sent.length = 0;
  await div.comandosonda({ sock: sockF, msg: { key: { id: 'q1' } }, ctx: DONO, isOwner: true, reply });
  const lista = sent[sent.length - 1];
  assert.strictEqual(lista.jid, '2449@s.whatsapp.net', '3) lista vai ao PV');
  assert.ok(/COMANDOS DA ONDA/.test(lista.text) && /!ondarapida/.test(lista.text) && /!parar/.test(lista.text) && /!cartao/.test(lista.text) && /!medidor/.test(lista.text), '3b) lista cobre os nomes curtos');
  assert.ok(/DARK BOT 🕸️\s*$/.test(lista.text), '3c) remate DARK BOT 🕸️');
  assert.strictEqual(_relays.length, 0, '3d) ZERO botões — texto compatível com tudo');
  console.log('✔ LISTA DE COMANDOS: painel de texto puro com os nomes novos');

  // ══ 4. !clientetema — aranha veste os painéis ══
  sent.length = 0; _relays = [];
  await div.clientetema({ sock: sockF, msg: { key: { id: 't1' } }, ctx: DONO, args: [], isOwner: true, reply });
  const jT = J(_relays[_relays.length - 1]);
  assert.ok(jT.includes('!clientetema aranha') && jT.includes('quick_reply'), '4) painel do tema com botões vivos');
  await div.clientetema({ sock: sockF, msg: { key: { id: 't2' } }, ctx: DONO, args: ['aranha'], isOwner: true, reply });
  assert.strictEqual(_db.get('divulg_tema_2449'), 'aranha', '4b) tema gravado no BotConfig');
  _relays = [];
  await div.medidor({ sock: sockF, msg: { key: { id: 't3' } }, ctx: DONO, args: [], isOwner: true, reply });
  const jM = J(_relays[_relays.length - 1]);
  assert.ok(/WEB TOXICA/.test(jM) && /╔══/.test(jM), '4c) métricas com moldura ARANHA');
  assert.ok(jM.includes('quick_reply'), '4c2) botões continuam a funcionar no tema novo');
  await div.clientetema({ sock: sockF, msg: { key: { id: 't4' } }, ctx: DONO, args: ['darktoxic'], isOwner: true, reply });
  _relays = [];
  await div.medidor({ sock: sockF, msg: { key: { id: 't5' } }, ctx: DONO, args: [], isOwner: true, reply });
  assert.ok(/DARKTOXIC/.test(J(_relays[_relays.length - 1])) && !/WEB TOXICA/.test(J(_relays[_relays.length - 1])), '4d) volta ao clássico sem contaminação');
  await div.clientetema({ sock: sockF, msg: { key: { id: 't6' } }, ctx: DONO, args: ['pixel'], isOwner: true, reply });
  assert.ok(/aranha.*darktoxic|darktoxic.*aranha/s.test(sent[sent.length - 1].text), '4e) tema inválido → usage');
  console.log('✔ TEMA ARANHA: uma escolha, toda a cara do cliente muda (e os botões sobrevivem)');

  // ══ 5. hub com as linhas novas (lista de reserva) ══
  _carroOk = false; _relays = []; sent.length = 0;
  await div.cli({ sock: sockF, msg: { key: { id: 'h1' } }, ctx: DONO, isOwner: true, reply });
  const w = _relays[0].m._wrapped;
  const ia = w.interactiveMessage || w.viewOnceMessage?.message?.interactiveMessage;
  const bpj = ia?.nativeFlowMessage?.buttons?.[0]?.buttonParamsJson;
  const rows = bpj ? JSON.parse(bpj).sections.flatMap((x) => x.rows.map((r) => r.id)) : [];
  assert.ok(rows.length > 10, '5 pré) hub lista real com linhas vivas');
  assert.ok(rows.includes('!comandosonda'), '5) hub → linha lista de comandos');
  assert.ok(rows.includes('!clientetema'), '5b) hub → linha tema');
  _carroOk = true;
  console.log('✔ HUB: tudo navegável à mão');

  console.log('\n✅ v9.18 — onda curta, rasto selado, tema aranha, lista completa');
  process.exit(0);
})().catch((e) => { console.error('❌', (e && e.stack) || e); process.exit(1); });
