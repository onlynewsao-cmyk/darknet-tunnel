#!/usr/bin/env node
/**
 * v9.19 💰🧲🧹 MÉTODOS COPIADOS DOS PAINÉIS REAIS (só os legítimos)
 *   F) !ondafunil — saudação vai a todos; OFERTA só nos grupos que responderem
 *      dentro da janela (o «modo estratégico» do Marketing Certo)
 *   V) !ondavida  — TTL: auto-purga dos próprios posts, com aviso honesto do
 *      carimbo «mensagem apagada» (rotação nos TEUS grupos; não é disfarce)
 *   P) pagamentos — preço por onda + códigos pré-pagos (modelo ZapSimples/
 *      SuperZapBot): !pagamentos on N, !emitircodigos, !pagar <código>, !saldo;
 *      sem saldo = onda BLOQUEADA com upsell; 1 código = 1 uso
 *   M) hub + !comandosonda + categorias (nada cai em «outros»)
 * O que NÃO foi copiado, e porquê: extração de contactos de grupos alheios
 * (AutoWhats) = spam/lei de dados; «mensagem invisível ao ADM» (exploit
 * reportado Reddit 2026) = vulnerabilidade da plataforma, não se clona.
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
const capt = { sent: [], relays: [], dels: [] };
let _db = new Map();
let carroOk = true;

Module.prototype.require = function (id) {
  const s = String(id);
  if (s === '../../config' || s === '../config') return { bot: { name: 'DARK BOT', prefix: '!' }, owner: { number: '2449' }, ai: { groq: 'k', gemini: null } };
  if (s.endsWith('botConfigCache')) return { get: async (k, d) => (_db.has(k) ? _db.get(k) : d), set: async (k, v) => { _db.set(k, v); return v; } };
  if (s.endsWith('/carousel') || s.endsWith('rpg/carousel')) return { enviarCarrossel: async () => carroOk, _imgCache: new Map(), _imagem: async () => null };
  if (s.includes('baileys')) {
    const p = { fromObject: (o) => o, toObject: (o) => o };
    return {
      generateWAMessageFromContent: (jid, content) => ({ key: { id: 'gen', remoteJid: jid }, message: { _wrapped: content } }),
      downloadMediaMessage: async () => Buffer.from('X'.repeat(120)),
      proto: { Message: { InteractiveMessage: { ...p, Body: p, Footer: p, Header: p, NativeFlowMessage: p, ContextInfo: p } } },
    };
  }
  return _orig.apply(this, arguments);
};

let _sentCounter = 0;
const META = (id) => ({
  id, subject: 'VITRINE',
  participants: [
    { id: '2449@s.whatsapp.net', admin: 'admin' },
    { id: '2450@s.whatsapp.net', admin: 'superadmin' },
    { id: '2443@s.whatsapp.net' }, { id: '2444@s.whatsapp.net' },
  ],
});
const sock = {
  user: { id: '2449@s.whatsapp.net' },
  waUploadToServer: async () => ({}),
  async sendMessage(jid, c) {
    if (c && c.delete) { capt.dels.push({ jid, key: c.delete }); return { key: { id: 'd' + (++_sentCounter) } }; }
    const id = 'w' + (++_sentCounter);
    capt.sent.push({ jid, _id: id, ...c });
    return { key: { id, remoteJid: jid } };
  },
  async relayMessage(jid, m, o) { capt.relays.push({ jid, m, o }); return {}; },
  async groupMetadata(jid) { return META(jid); },
  async groupFetchAllParticipating() { return { [GRP]: META(GRP), [GRP2]: META(GRP2) }; },
};
const DONO = { remoteJid: GRP, senderNumber: '2449', senderJid: '2449@s.whatsapp.net', isGroup: true, isOwner: true, prefix: '!', groupName: 'VITRINE' };
const CLIENTE = { remoteJid: GRP, senderNumber: '2443', senderJid: '2443@s.whatsapp.net', isGroup: true, isOwner: false, prefix: '!', groupName: 'VITRINE' };
const reply = async (t) => { capt.sent.push({ jid: PV, text: t }); return {}; };
const reset = () => { capt.sent.length = 0; capt.relays.length = 0; capt.dels.length = 0; };
const grpMsgs = () => capt.sent.filter((x) => x.jid.endsWith('@g.us'));
const semRuido = (t) => String(t || '').replace(/[\u200b-\u200f\u2060-\u206f\ufeff\u180e]/g, '');

(async () => {
  console.log('=== v9.19 — MÉTODOS DOS PAINÉIS REAIS (funil · TTL · créditos) ===');
  const mod = require('../src/bot/cases/divulgacao');
  const div = {};
  mod((nomes, fn) => { for (const x of [].concat(nomes)) div[x] = fn; });
  const consumir = mod.consumir;
  _db.set('divulg_grupos_2449', [{ jid: GRP, nome: 'Vitrine 1' }, { jid: GRP2, nome: 'Vitrine 2' }]);

  // ══ F. FUNIL — o mecanismo anti-report dos painéis pagos ══
  reset();
  await div.ondafunil({ sock, msg: {}, ctx: DONO, args: ['0.3', 'olá NOVOS na área 👋 || 🎁 OFERTA RELÂMPAGO 🔥'], isOwner: true, reply });
  assert.ok(_db.get('divulg_funil_2449'), 'F0 funil gravado');

  reset();
  await div.ondarapida({ sock, msg: { key: { id: 'fr', remoteJid: GRP } }, ctx: DONO, args: ['sem', 'qualquer texto'], isOwner: true, reply });
  const sauds = grpMsgs();
  assert.strictEqual(sauds.length, 2, 'F1 saudação foi aos 2 grupos');
  assert.ok(sauds.every((x) => /NOVOS na área/.test(semRuido(x.text))), 'F1b saudação certa (não a oferta)');
  assert.ok(!sauds.some((x) => /OFERTA/.test(x.text || '')), 'F1c a oferta NÃO saiu sozinha');

  // o membro do G1 responde → a oferta entra SÓ no G1
  await consumir(sock, { key: { id: 'resp', remoteJid: GRP, fromMe: false, participant: '2443@s.whatsapp.net' } }, { ...CLIENTE }, 'sim por favor');
  await new Promise((r) => setTimeout(r, 40));
  const ofG1 = capt.sent.filter((x) => x.jid === GRP && /OFERTA RELÂMPAGO/.test(semRuido(x.text)));
  assert.strictEqual(ofG1.length, 1, 'F2 resposta no G1 libertou a oferta (1× só)');
  assert.strictEqual(capt.sent.filter((x) => x.jid === GRP2 && /OFERTA/.test(x.text || '')).length, 0, 'F2b G2 (sem resposta) ficou SEM oferta');

  // janela fecha → pendência morre sozinha
  await new Promise((r) => setTimeout(r, 350));
  await consumir(sock, { key: { id: 'late', remoteJid: GRP2, fromMe: false, participant: '2444@s.whatsapp.net' } }, { ...CLIENTE, remoteJid: GRP2 }, 'tardi');
  await new Promise((r) => setTimeout(r, 40));
  assert.strictEqual(capt.sent.filter((x) => x.jid === GRP2 && /OFERTA/.test(x.text || '')).length, 0, 'F3 resposta fora da janela não compra nada');

  // o relatório avisa do funil; funil off → onda volta a ser direta
  const rel = capt.relays.map((r) => JSON.stringify(r.m)).join('');
  assert.ok(/funil: 1 grupo/.test(rel) || /funil:/.test(rel), 'F4 relatório menciona o funil pendente');
  await div.ondafunil({ sock, msg: {}, ctx: DONO, args: ['off'], isOwner: true, reply });
  reset();
  await div.ondarapida({ sock, msg: { key: { id: 'fd', remoteJid: GRP } }, ctx: DONO, args: ['sem', 'TEXTO DIRETO'], isOwner: true, reply });
  assert.ok(grpMsgs().every((x) => /TEXTO DIRETO/.test(semRuido(x.text))), 'F4b funil off = onda direta');
  console.log('✔ FUNIL: saudação→resposta→oferta; janela expira; off limpo');

  // ══ V. VIDA DA ONDA (TTL) — auto-purga dos próprios posts ══
  await div.ondavida({ sock, msg: {}, ctx: DONO, args: ['0.15'], isOwner: true, reply });
  assert.strictEqual(_db.get('divulg_vid_2449'), 0.15, 'V0 TTL gravado');
  reset();
  await div.ondarapida({ sock, msg: { key: { id: 'vv', remoteJid: GRP } }, ctx: DONO, args: ['sem', 'POST DESCARTÁVEL'], isOwner: true, reply });
  const posts = grpMsgs().filter((x) => x.text);
  assert.strictEqual(posts.length, 2, 'V1 os posts saíram');
  assert.strictEqual(capt.dels.length, 0, 'V1b ainda nada apagado no instante zero');
  await new Promise((r) => setTimeout(r, 320));
  assert.strictEqual(capt.dels.length, 2, 'V2 TTL apagou exatamente os 2 posts');
  assert.ok(capt.dels.every((d) => posts.some((x) => x._id === d.key.id)), 'V2b apagou AS CHAVES dos posts (não alheias)');
  await div.ondavida({ sock, msg: {}, ctx: DONO, args: ['off'], isOwner: true, reply });
  reset();
  await div.ondarapida({ sock, msg: { key: { id: 'vw', remoteJid: GRP } }, ctx: DONO, args: ['sem', 'POST PERMANENTE'], isOwner: true, reply });
  await new Promise((r) => setTimeout(r, 260));
  assert.strictEqual(capt.dels.length, 0, 'V3 TTL off → nada se apaga');
  console.log('✔ VIDA/TTL: apaga SÓ os posts do dono, no prazo, com aviso honesto no painel');

  // ══ P. CRÉDITOS — o modelo de pagamento dos painéis reais ══
  await div.pagamentos({ sock, msg: {}, ctx: DONO, args: ['on', '2'], isOwner: true, reply });
  assert.strictEqual(_db.get('divulg_pay_2449'), 2, 'P0 paywall=2 créditos/onda');
  reset();
  await div.ondarapida({ sock, msg: { key: { id: 'pb', remoteJid: GRP } }, ctx: DONO, args: ['sem', 'ONDA BLOQUEADA'], isOwner: true, reply });
  assert.strictEqual(grpMsgs().length, 0, 'P1 sem saldo = NADA sai para grupos');
  const blq = capt.sent.map((x) => x.text || '').join('|') + capt.relays.map((r) => JSON.stringify(r.m)).join('|');
  assert.ok(/SEM C R É D I T O S|sem-creditos|crédito/.test(blq) && /aluguel/.test(blq), 'P1b resposta ensina a comprar (upsell)');

  await div.emitircodigos({ sock, msg: {}, ctx: DONO, args: ['2', '5'], isOwner: true, reply });
  const codes = _db.get('divulg_codes_2449');
  const keysC = Object.keys(codes || {});
  assert.strictEqual(keysC.length, 2, 'P2 2 códigos emitidos');
  assert.ok(/^DARK-[0-9A-F]{6}$/.test(keysC[0]), 'P2b formato DARK-XXXXXX');

  // cliente resgata (a resposta vai ao PV DELE — o resgate é privado)
  reset();
  await div.pagar({ sock, msg: {}, ctx: CLIENTE, args: [keysC[0].toLowerCase()], reply });
  assert.strictEqual(_db.get('divulg_saldo_2443'), 5, 'P3 resgate +5 (código minúsculas OK)');
  await div.pagar({ sock, msg: {}, ctx: CLIENTE, args: [keysC[0]], reply });
  assert.ok(/já foi gasto/.test(capt.sent[capt.sent.length - 1].text), 'P3b código reusado → barrado');

  // onda do CLIENTE consome 2, sobram 3 — e o relatório mostra o saldo
  _db.set('divulg_grupos_2443', [{ jid: GRP, nome: 'Dele 1' }]);
  reset();
  await div.ondarapida({ sock, msg: { key: { id: 'pc', remoteJid: GRP } }, ctx: { ...CLIENTE, isOwner: true }, args: ['sem', 'ONDA PAGA'], isOwner: true, reply });
  assert.ok(grpMsgs().length >= 1, 'P4 onda paga saiu');
  assert.strictEqual(_db.get('divulg_saldo_2443'), 3, 'P4b saldo 5→3');
  const rel2 = capt.relays.map((r) => JSON.stringify(r.m)).join('');
  assert.ok(/onda paga · saldo: \*3\*/.test(rel2), 'P4c relatório com 💳 saldo');

  // saldo abaixo do preço → bloqueio outra vez (1 crédito < 2)
  _db.set('divulg_saldo_2443', 1);
  reset();
  await div.ondarapida({ sock, msg: { key: { id: 'px', remoteJid: GRP } }, ctx: { ...CLIENTE, isOwner: true }, args: ['sem', 'QUASE'], isOwner: true, reply });
  assert.strictEqual(grpMsgs().length, 0, 'P5 saldo a meio = bloqueado (não cobra a meias)');
  await div.creditos({ sock, msg: {}, ctx: CLIENTE, args: [], reply });
  const txtSaldo = capt.sent[capt.sent.length - 1].text;
  assert.ok(/saldo 2443: \*1\*/.test(txtSaldo) && /0 onda\(s\) pagas \(2\/onda\)/.test(txtSaldo) && /!pagar <código>/.test(txtSaldo), 'P6 !saldo: conta certa (1 crédito = 0 ondas a 2) + caminho de recarga');
  assert.ok(/\*\*|\*/.test(txtSaldo), 'P6b formatação bold ok');

  // paywall off → tudo livre outra vez (o dono não fica refém do próprio registo)
  await div.pagamentos({ sock, msg: {}, ctx: DONO, args: ['off'], isOwner: true, reply });
  reset();
  _db.set('divulg_saldo_2443', 0);
  await div.ondarapida({ sock, msg: { key: { id: 'pf', remoteJid: GRP } }, ctx: { ...CLIENTE, isOwner: true }, args: ['sem', 'LIVRE'], isOwner: true, reply });
  assert.ok(grpMsgs().length >= 1, 'P7 off = ondas livres mesmo com saldo 0');
  console.log('✔ CRÉDITOS: emito→resgato→consumo→bloqueeio→upsell; 1 código = 1 uso; off limpo');

  // ══ M. superfície: menu, lista, categorias ══
  const sd = require('../src/bot/submenuData');
  for (const n of ['ondafunil', 'funil', 'ondavida', 'vida', 'pagamentos', 'emitircodigos', 'pagar', 'creditos']) {
    assert.strictEqual(sd.categorize(n), 'owner', `M1 !${n} classificado (nunca «outros»)`);
  }
  reset();
  await div.comandosonda({ sock, msg: {}, ctx: DONO, isOwner: true, reply });
  const lista = capt.sent[capt.sent.length - 1].text;
  assert.ok(/ondafunil/.test(lista) && /ondavida/.test(lista) && /pagamentos/.test(lista) && /!pagar/.test(lista), 'M2 lista de comandos cobre o v9.19');
  carroOk = false; reset();
  await div.cliente({ sock, msg: { key: { id: 'mh' } }, ctx: DONO, isOwner: true, reply });
  const hubTxt = JSON.stringify(capt.relays[capt.relays.length - 1] || {}) + JSON.stringify(capt.sent);
  for (const need of ['ondafunil', 'ondavida', 'pagamentos']) assert.ok(hubTxt.includes(need), `M3 hub tem linha ${need}`);
  carroOk = true;
  console.log('✔ SUPERFÍCIE: menu, lista e categorias ao dia');

  console.log('\n✅ v9.19 — os métodos certos dos painéis reais, copiados à luz do dia');
  process.exit(0);
})().catch((e) => { console.error('❌', (e && e.stack) || e); process.exit(1); });
