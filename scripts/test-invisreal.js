#!/usr/bin/env node
/**
 * v9.18 🔍 AUDITORIA DO INVISÍVEL — «funciona de verdade?»
 * Nada de reimplementações: corre os fluxos REAIS (ondarapida, assistente
 * 4 passos, ondafoto, ondacartao) contra um sock que captura tudo o que
 * SAIRIA para o grupo, e audita do ponto de vista de um ADM:
 *   I1 nenhum corpo enviado ao grupo contém @tags ou o selo ☣️ DIVULGAÇÃO
 *   I2 as menções invisíveis = só membros; ADM/creator NUNCA mencionados
 *   I3 painéis/relatórios/assistente só aparecem no PV do dono (zero no grupo)
 *   I4 rasto selado: comando + foto original do dono apagados (deletes emitidos)
 *   I5 o NOSSO anti-link não apaga as NOSSAS ondas (fromMe imune) — mas
 *      apanha exatamente o mesmo cartão vindo de um concorrente
 *   I6 visível continua visível (contraste): tags à vista + ADM na menção
 *   I7 agenda invisível: o disparo agendado cumpre o mesmo contrato
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

const GRP = 'G1@g.us', GRP2 = 'G2@g.us', PV = '2449@s.whatsapp.net';
const ADMIN_BOT = '2449@s.whatsapp.net', ADM1 = '2450@s.whatsapp.net', ADM2 = '2451@s.whatsapp.net';
const MEMB = ['2443@s.whatsapp.net', '2444@s.whatsapp.net', '2445@s.whatsapp.net'];
const mkMeta = (id) => ({
  id, subject: 'VITRINE',
  participants: [
    { id: ADMIN_BOT, admin: 'admin' },
    { id: ADM1, admin: 'superadmin' },
    { id: ADM2, admin: 'admin' },
    ...MEMB.map((m) => ({ id: m })),
  ],
});

const capt = { sent: [], relays: [], dels: [] };
let _db = new Map();
let GS = { antilink: true, antilinkMode: 'all_links', antilinkAction: 'delete' };
let carroOk = true;

Module.prototype.require = function (id) {
  const s = String(id);
  if (s === '../../config' || s === '../config') return { bot: { name: 'DARK BOT', prefix: '!' }, owner: { number: '2449' }, ai: { groq: 'k', gemini: null } };
  if (s.endsWith('botConfigCache')) return { get: async (k, d) => (_db.has(k) ? _db.get(k) : d), set: async (k, v) => { _db.set(k, v); return v; } };
  if (s.endsWith('hotCache')) return { getGroupSettings: async () => GS, getUser: async () => null, forgetGroup: () => {} };
  if (s.endsWith('GroupSettings')) return { findOne: () => ({ lean: async () => null }), updateOne: async () => ({}) };
  if (s.endsWith('/carousel') || s.endsWith('rpg/carousel')) return { enviarCarrossel: async () => carroOk, _imgCache: new Map(), _imagem: async () => null };
  if (s.endsWith('liveBroadcaster')) return { antilinkAction: () => {}, publish: () => {} };
  if (s.endsWith('mediaHandler')) return { fetchBuffer: async () => Buffer.from('X'.repeat(200)) };
  if (s === 'mongoose') {
    class Schema { constructor() { this.statics = {}; this.methods = {}; } index() { return this; } set() { return this; } static plugin() { return this; } static get Types() { return { Mixed: Object, ObjectId: class {} }; } }
    const mk = () => { const M = function () {}; M.findOne = () => ({ lean: async () => null, sort: () => ({ lean: async () => [] }) }); M.find = async () => []; M.updateOne = async () => ({}); return M; };
    return { Schema, model: mk, connect: async () => ({}), Types: { ObjectId: class {} } };
  }
  if (s.includes('baileys')) {
    const p = { fromObject: (o) => o, toObject: (o) => o };
    return {
      generateWAMessageFromContent: (jid, content) => ({ key: { id: 'gen', remoteJid: jid }, message: { _wrapped: content } }),
      prepareWAMessageMedia: async () => ({ imageMessage: { url: 'fake' } }),
      downloadMediaMessage: async () => Buffer.from('FOTO-'.repeat(30)),
      proto: { Message: { InteractiveMessage: { ...p, Body: p, Footer: p, Header: p, NativeFlowMessage: p, ContextInfo: p } } },
    };
  }
  return _orig.apply(this, arguments);
};

const sock = {
  user: { id: ADMIN_BOT },
  waUploadToServer: async () => ({}),
  async sendMessage(jid, c) {
    if (c && c.delete) { capt.dels.push({ jid, key: c.delete }); return { key: { id: 'd' } }; }
    capt.sent.push({ jid, ...c });
    return { key: { id: 'k' } };
  },
  async relayMessage(jid, m, o) { capt.relays.push({ jid, m, o }); return {}; },
  async groupMetadata(jid) { return mkMeta(jid); },
  async groupFetchAllParticipating() { return { [GRP]: mkMeta(GRP), [GRP2]: mkMeta(GRP2) }; },
};
const DONO = { remoteJid: GRP, senderNumber: '2449', senderJid: ADMIN_BOT, isGroup: true, isOwner: true, prefix: '!', groupName: 'VITRINE' };
const reply = async (t) => { capt.sent.push({ jid: PV, text: t }); return {}; };
const reset = () => { capt.sent.length = 0; capt.relays.length = 0; capt.dels.length = 0; };
const grpMsgs = () => capt.sent.filter((x) => x.jid.endsWith('@g.us'));
const grpAll = () => [...capt.sent.filter((x) => x.jid.endsWith('@g.us')), ...capt.relays.filter((x) => x.jid.endsWith('@g.us'))];
const J = (o) => JSON.stringify(o || {});

const semRasto = (m) => String(m.text || m.caption || '').replace(/[\u200b-\u200f\u2060-\u206f\ufeff\u180e]/g, '');

(async () => {
  console.log('=== v9.18 — AUDITORIA DO INVISÍVEL ═ ver do lado do ADM ===');

  const mod = require('../src/bot/cases/divulgacao');
  const div = {};
  mod((nomes, fn) => { for (const x of [].concat(nomes)) div[x] = fn; });
  const consumir = mod.consumir;
  _db.set('divulg_grupos_2449', [{ jid: GRP, nome: 'Vitrine 1' }, { jid: GRP2, nome: 'Vitrine 2' }]);

  // ── I1+I2+I3: !ondarapida invisivel ──────────────────────────
  reset();
  await div.ondarapida({ sock, msg: { key: { id: 'r1', remoteJid: GRP } }, ctx: DONO, args: ['invisivel', 'AO NOVO NA VITRINE'], isOwner: true, reply });
  const ondas = grpMsgs();
  assert.ok(ondas.length >= 2, 'I0 onda chegou aos 2 grupos');
  for (const m of ondas) {
    assert.ok(!/@\d/.test(semRasto(m)), 'I1 corpo sem @tags (' + String(m.text).slice(0, 12) + '…)');
    assert.ok(!/DIVULGA|☣️/.test(semRasto(m)), 'I1b corpo sem selos visíveis');
    const menc = (m.mentions || []).map(String);
    assert.ok(menc.length === MEMB.length, 'I2 menciona os ' + MEMB.length + ' membros');
    for (const adm of [ADM1, ADM2]) assert.ok(!menc.includes(adm), 'I2b ADM ' + adm.split('@')[0] + ' FORA das menções');
  }
  // só a onda pisa o grupo; tudo o resto é PV (nem um relay de painel lá dentro)
  assert.strictEqual(capt.sent.filter((x) => x.jid === GRP2).length, 1, 'I3 um único envio por grupo (a onda)');
  assert.strictEqual(capt.relays.filter((x) => String(x.jid).endsWith('@g.us')).length, 0, 'I3b zero painéis interativos no grupo');
  assert.ok(capt.sent.some((x) => x.jid === PV) || capt.relays.some((x) => x.jid === PV), 'I3b relatórios vão para o PV do dono');
  assert.ok(capt.dels.some((d) => d.key.id === 'r1'), 'I4 comando selado (delete emitido)');
  console.log('✔ I1–I4 · RAPIDO: corpo limpo, ADM fora das menções, só onda no grupo, rasto apagado');

  // ── I5: o NOSSO anti-link vs o NOSSO cartão (fromMe imune) e vs concorrente ──
  const al = require('../src/bot/antiLink');
  const payloadConcorrente = {
    key: { remoteJid: GRP2, fromMe: false, id: 'x9', participant: '2443@s.whatsapp.net' },
    message: {
      interactiveMessage: {
        body: { text: 'olha esta promoção 😉' },
        footer: { text: 'vem' },
        nativeFlowMessage: { buttons: [{ name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: 'Ver', url: 'http://concorrente.example/c' }) }] },
      },
    },
  };
  assert.strictEqual(await al.check(sock, payloadConcorrente), true, 'I5b cartão de concorrente é apanhado (link no botão)');
  const ondaCartao = {
    key: { remoteJid: GRP2, fromMe: true, id: 'k-own' },
    message: payloadConcorrente.message,
  };
  assert.strictEqual(await al.check(sock, ondaCartao), false, 'I5 as NOSSAS ondas (fromMe) passam imunes pelo nosso escudo');
  console.log('✔ I5 · escudo próprio: não morde as nossas ondas; morde cartões alheios com URL');

  // ── I6: visível continua CONTRASTE (tags à vista + ADM dentro) ──
  reset();
  await div.ondarapida({ sock, msg: { key: { id: 'r2', remoteJid: GRP } }, ctx: DONO, args: ['visivel', 'PROMO BIG'], isOwner: true, reply });
  const vis = grpMsgs();
  assert.ok(vis.length >= 2 && vis.every((m) => /@\d/.test(semRasto(m)) && /DIVULGA/i.test(J(m))), 'I6 visível: selo e @tags à vista');
  assert.ok(vis.every((m) => (m.mentions || []).map(String).includes(ADM1)), 'I6b visível: ADM recebe ping (é o modo público)');
  assert.strictEqual(capt.dels.length, 0, 'I6c visível NÃO sela nada (o dono quis mostrar)');
  console.log('✔ I6 · contraste do visível intacto (ninguém confunde os modos)');

  // ── I7: ASSISTENTE 4 passos → invisivel = onda + pegada toda apagada ──
  reset();
  await div.onda({ sock, msg: { key: { id: 's0', remoteJid: GRP }, message: {} }, ctx: DONO, args: [], prefix: '!', isOwner: true, reply });
  await consumir(sock, { key: { id: 's1', remoteJid: GRP }, message: {} }, DONO, 'GOTAS NOVAS 🍃');
  await consumir(sock, { key: { id: 's2', remoteJid: GRP }, message: {} }, DONO, '1');
  await consumir(sock, { key: { id: 's3', remoteJid: GRP }, message: {} }, DONO, 'invisivel');
  const ondasF = grpMsgs();
  assert.ok(ondasF.length >= 2, 'I7a assistente disparou a onda');
  assert.ok(ondasF.every((m) => !/@\d/.test(semRasto(m)) && (m.mentions || []).length === MEMB.length), 'I7b onda invisível: corpo limpo + só membros');
  assert.ok(ondasF.every((m) => /GOTAS NOVAS/.test(semRasto(m))), 'I7c o TEXTO chegou (auditado após tirar ruído invisível)');
  for (const sid of ['s1', 's2', 's3']) assert.ok(capt.dels.some((d) => d.key.id === sid), `I7d passo ${sid} apagado do grupo`);
  const painelNoGrupo = capt.sent.filter((x) => x.jid.endsWith('@g.us')).length - ondasF.length;
  assert.ok(painelNoGrupo <= 0, 'I7e assistente não deixou NENHUMA passada visível no grupo');
  console.log('✔ I7 · assistente: onda invisível entregue e pegada 100% selada');

  // ── I8: !ondafoto invisivel — a pergunta original das «fotos visíveis» ──
  reset();
  const msgFoto = {
    key: { id: 'f9', remoteJid: GRP, fromMe: true },
    message: {
      extendedTextMessage: {
        text: 'invisivel',
        contextInfo: {
          quotedMessage: { imageMessage: { mimetype: 'image/jpeg' } },
          remoteJid: GRP, stanzaId: 'FOTO_DO_DONO', participant: ADMIN_BOT,
        },
      },
    },
  };
  await div.ondafoto({ sock, msg: msgFoto, ctx: DONO, args: ['invisivel'], isOwner: true, reply });
  const fotos = grpMsgs().filter((x) => x.image);
  assert.ok(fotos.length >= 2, 'I8a foto divulgada nos grupos');
  assert.ok(fotos.every((x) => !/@\d/.test(semRasto({ text: x.caption || '' }))), 'I8b caption sem tags visíveis');
  assert.ok(fotos.every((x) => (x.mentions || []).map(String).every((m) => !m.startsWith('2450') && !m.startsWith('2451'))), 'I8c ADMs fora da menção da foto');
  assert.ok(capt.dels.some((d) => d.key.id === 'f9'), 'I8d comando apagado');
  assert.ok(capt.dels.some((d) => d.key.id === 'FOTO_DO_DONO'), 'I8e A FOTO ORIGINAL DO DONO foi apagada — é isto que a torna invisível ao ADM');
  console.log('✔ I8 · fotos: entrega + caption limpo + rasto (comando e foto do dono) selados');

  // ── I9: !ondacartao invisivel — onda em cartão com contrato idêntico ──
  reset();
  await div.ondacartao({ sock, msg: { key: { id: 'c9', remoteJid: GRP }, message: {} }, ctx: DONO, args: ['invisivel', 'OFERTA! | Loja=https://dark.example/shop'], isOwner: true, reply });
  const cartoes = grpMsgs().filter((x) => x.templateButtons);
  assert.ok(cartoes.length >= 2, 'I9a cartão com botões entregue aos grupos');
  assert.ok(cartoes.every((x) => x.text && !/https?:/.test(x.text)), 'I9b link VIVO SÓ nos botões — corpo limpo (é isso que engana moderadores de texto)');
  assert.ok(cartoes.every((x) => (x.mentions || []).length === MEMB.length && !(x.mentions || []).map(String).includes(ADM1)), 'I9c menções do cartão: só membros');
  assert.ok(capt.relays.some((r) => r.jid === PV) || capt.sent.some((x) => x.jid === PV && /pré-visual/.test(x.text || '')), 'I9d pré-visualização só no PV');
  assert.ok(capt.dels.some((d) => d.key.id === 'c9'), 'I9e comando do cartão selado');
  console.log('✔ I9 · cartão invisível: link nos botões, menção só a membros, zero rasto');

  // ── I10: AGENDA invisível — registo + contrato de disparo ──
  reset();
  await div.agenda({ sock, msg: { key: { id: 'a1', remoteJid: GRP }, message: {} }, ctx: DONO, args: ['23:59', 'invisivel', 'PROMO AGENDADA'], isOwner: true, reply });
  const agSalva = [].concat(_db.get('divulg_agenda_2449') || []).find((x) => /PROMO AGENDADA/.test(x.texto));
  assert.ok(agSalva && agSalva.vis === 'invisivel', 'I10a agenda guarda INVISIVEL');
  assert.ok(capt.dels.length === 0, 'I10b (agenda não sela — é PV por natureza, rasto só na entrega)');
  const src = require('fs').readFileSync(require.resolve('../src/bot/cases/divulgacao.js'), 'utf8');
  assert.ok(/_corpoDesp\(ag\.texto, ag\.vis, tag, own\), mentions: ag\.vis === 'sem' \? \[\] : mencoes/.test(src), 'I10c o disparo agendado passa pelo MESMO funil invisível (corpo sem tags + mencoes sem ADMs)');
  console.log('✔ I10 · agenda invisível: gravada e ligada ao mesmo funil auditado em I1–I2');

  // ── I11: giros múltiplos → corpos DIFERENTES por grupo (anti-repetição) ──
  reset();
  _db.set('divulg_giro_2449', ['versão um 🔥', 'versão dois 💥', 'versão três 🌪️']);
  await div.ondarapida({ sock, msg: { key: { id: 'g1', remoteJid: GRP } }, ctx: DONO, args: ['invisivel', 'qualquer'], isOwner: true, reply });
  const corpos = grpMsgs().map((m) => semRasto(m));
  assert.ok(new Set(corpos).size === corpos.length && corpos.length >= 2, 'I11 giro ativo: cada grupo recebe corpo ÚNICO (hash por igualdade não bate)');
  console.log('✔ I11 · variação por envio confirma o bypass de conteúdo');

  console.log('\n✅ INVISÍVEL VERIFICADO DE PONTA A PONTA: payloads, menções, rasto e escudo');
  process.exit(0);
})().catch((e) => { console.error('❌', (e && e.stack) || e); process.exit(1); });
