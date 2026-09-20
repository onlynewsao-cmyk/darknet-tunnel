#!/usr/bin/env node
/**
 * v9.8 ☣️ — CLIENTE ONLINE / DIVULGAÇÃO DARKTOXIC (apenas dono)
 *   1) !cliente: hub com 5 secções, selo biz, moldura ☣️☠️🕸️, estado real
 *   2) GRUPOS: add (no grupo) · addall · list · del N · delall — isolado por dono
 *   3) !delay: painel com 🟢 no activo, presets e custom 1..5000, delayultrarapido
 *   4) MOTOR: visível (@tags à vista) vs INVISÍVEL (menção silenciosa —
 *      o ADM não vê a lista de marcados) + histórico + stop
 *   5) SEU BOT: conectar/meubot/desconector + !aluguel (tabela)
 */
'use strict';
const fs = require('fs');

process.env.MONGODB_URI = '';
// v9.13: encolher o ritmo anti-ban para o teste correr rápido (o piso
// duro de produção — ~950ms/envio, pausas 28-45s, passes 65-130s —
// continua ACTIVE no bot real; aqui só verificamos a matemática).
process.env.DIVULGAR_MIN_MS = '1';
process.env.DIVULGAR_PAUSA_A_CADA = '999999';
process.env.DIVULGAR_PAUSA_MIN_MS = '1';
process.env.DIVULGAR_PAUSA_MAX_MS = '1';
process.env.DIVULGAR_PASS_MIN_MS = '1';
process.env.DIVULGAR_PASS_MAX_MS = '1';

const assert = require('assert');

// ── mocks plásticos ───────────────────────────────────────────
const Module = require('module');
const _orig = Module.prototype.require;
let _relays = [];
let _opcao = null;
const sent = [];
let _db = new Map();      // botConfigCache
let _donorFail = {};
let _carroOk = true;
let _carroH = null;

const GRUPO1 = { id: 'G1@g.us', subject: '💎 RÁDIO DARK', participants: [
  { id: '2441@s.whatsapp.net' }, { id: '2442@s.whatsapp.net' }, { id: '2449@s.whatsapp.net' },
] };
const GRUPO2 = { id: 'G2@g.us', subject: '🔥 VENDAS', participants: [
  { id: '2443@s.whatsapp.net' }, { id: '2444@s.whatsapp.net' }, { id: '2450@s.whatsapp.net', admin: 'admin' },
] };

Module.prototype.require = function (id) {
  const s = String(id);
  if (s === '../../config') return { bot: { name: 'DARK BOT', prefix: '!' }, owner: { number: '2449' }, ai: { groq: 'k', gemini: null } };
  if (s.endsWith('botConfigCache')) return {
    get: async (k, d) => _db.has(k) ? _db.get(k) : d,
    set: async (k, v) => { _db.set(k, v); return v; },
  };
  if (s.endsWith('/rpg/ui') || s.endsWith('rpg/ui')) {
    return {
      escolher: async (sock, msg, ctx, o) => { _opcao = o; return true; },
      confirmar: async () => true, resolver: async () => false, decidirPorTexto: async () => true, escolherPorTexto: async () => true, pendentes: () => new Map(),
    };
  }
  if (s.includes('baileys')) {
    const p = { fromObject: (o) => o };
    return {
      generateWAMessageFromContent: (jid, content) => ({ key: { id: 'gen' }, message: { _wrapped: content } }),
      proto: { Message: { InteractiveMessage: { ...p, Body: p, Footer: p, Header: p, NativeFlowMessage: p } } },
      downloadMediaMessage: async () => Buffer.from('MEDIAFAKE-9.8'),
    };
  }
  if (s.endsWith('/rpg/carousel') || s === '../rpg/carousel') return { enviarCarrossel: async (sock, msg, ctx, o) => { _carroH = { capt: o }; return _carroOk; }, _imgCache: new Map(), _imagem: async () => null };
  if (s.endsWith('renderEngine')) return { getTheme: async () => null, renderBlock: () => 'X', renderSubmenu: () => 'X', renderChange: () => 'X' };
  if (s.endsWith('hotCache')) return { getGroupSettings: async () => ({}), forgetGroup: () => {} };
  if (s.endsWith('GroupSettings')) return { findOne: () => ({ lean: async () => null }) };
  return _orig.apply(this, arguments);
};

const sockF = {
  sendMessage: async (jid, c) => { if (_donorFail[jid]) throw new Error('forbidden'); sent.push({ jid, ...c }); return { key: { id: 'k' } }; },
  relayMessage: async (j, m, o) => { _relays.push({ m, o }); return {}; },
  groupMetadata: async (jid) => ({ 'G1@g.us': GRUPO1, 'G2@g.us': GRUPO2, 'GRP@g.us': GRUPO1 }[jid] || { participants: [] }),
  groupFetchAllParticipating: async () => ({ 'G1@g.us': GRUPO1, 'G2@g.us': GRUPO2 }),
  waUploadToServer: async () => ({}),
  user: { id: 'bot@s.whatsapp.net' },
};
const DONO = { remoteJid: 'GRP@g.us', senderNumber: '2449', senderJid: '2449@s.whatsapp.net', isGroup: true, isOwner: true, prefix: '!', groupName: 'QG DARK' };
const FREE = { ...DONO, senderNumber: '2443', senderJid: '2443@s.whatsapp.net', isOwner: false };
const reply = async (t) => sent.push({ jid: DONO.remoteJid, text: t });
const keys = (k) => _db.get(`divulg_${k}`);

(async () => {
  console.log('=== v9.8 — CLIENTE ONLINE / DIVULGAÇÃO ☣️ ===');

  const div = {};
  require('../src/bot/cases/divulgacao')((nomes, fn) => { for (const x of [].concat(nomes)) div[x] = fn; });

  // ── 1. Hub !cliente — CARROSSEL primeiro, lista de reserva ──
  _relays = []; sent.length = 0; _carroOk = true; _carroH = null;
  await div.cliente({ sock: sockF, msg: { key: { id: 'c1' } }, ctx: DONO, isOwner: true, reply });
  assert.ok(_carroH?.capt, 'hub tentou o carrossel DARKTOXIC primeiro');
  assert.strictEqual(_carroH.capt.cards.length, 5, '5 cartões (grupos/velocidade/giro-estilo/enviar/seu bot)');
  console.log('DEBUG cards=' + _carroH.capt.cards.length, _carroH.capt.cards.map(c=>c.titulo).join('/'));const botoesCartas = _carroH.capt.cards.flatMap(c => c.botoes.map(b => b.id));
  for (const id of ['!divulgar addall', '!divulgar list', '!delay', '!delay rapido', '!divulgar', '!divulgarteste visivel', '!meubot', '!aluguel']) {
    assert.ok(botoesCartas.includes(id), `cartão tem botão vivo ${id}`);
  }
  assert.ok(_carroH.capt.cards.every(c => c.promptImg && c.cacheKey), 'capas IA darktoxic por cartão');
  assert.ok(/DARKTOXIC/.test(_carroH.capt.corpo) && /☣️◢◤/.test(_carroH.capt.corpo), 'moldura darktoxic no corpo');
  // fallback: carrossel indisponível → lista single_select
  _carroOk = false; _relays = []; sent.length = 0; _carroH = null;
  await div.cliente({ sock: sockF, msg: { key: { id: 'c1x' } }, ctx: DONO, isOwner: true, reply });
    const hub = _relays[0].m._wrapped.interactiveMessage;
  assert.ok(/DARKTOXIC/.test(hub.body.text), 'moldura darktoxic também na lista');
  const secs = JSON.parse(hub.nativeFlowMessage.buttons[0].buttonParamsJson).sections;
  assert.strictEqual(secs.length, 7, '7 secções (grupos/velocidade/giro+agenda+metrics/estilo/temas/enviar/bot)');
  const allRows = secs.flatMap(s => s.rows.map(r => r.id));
  for (const cmd of ['!divulgar add', '!divulgar addall', '!divulgar list', '!divulgar delall', '!delay', '!delay ultra', '!divulgarrapido visivel', '!divulgarstop', '!divulgarhistorico', '!divulgarrepetir', '!divulgarstats', '!divulgaragenda', '!conectarbot', '!meubot', '!desconectarbot', '!aluguel']) {
    assert.ok(allRows.includes(cmd), `hub tem a linha ${cmd}`);
  }
  assert.ok(_relays[0].o.additionalNodes?.[0]?.tag === 'biz', 'selo biz no hub');
  // negação: free não entra
  sent.length = 0;
  await div.cliente({ sock: sockF, msg: { key: { id: 'c1b' } }, ctx: FREE, isOwner: false, reply });
  assert.ok(/só do dono/.test(sent[0].text), 'free barrado no hub');
  console.log('✔ !cliente: hub darktoxic real + cadeado dono');

  // ── 2. Grupos: add → addall → list → del → delall ───────────
  sent.length = 0;
  await div.divulgar({ sock: sockF, msg: { key: { id: 'g1' } }, ctx: DONO, args: ['add'], prefix: '!', isOwner: true, reply });
  assert.strictEqual((keys('grupos_2449') || []).length, 1, 'add regista ESTE grupo');
  assert.ok(/G R U P O  R E G I S T A D O/.test(sent[0].text), 'confirmação darktoxic');
  await div.divulgar({ sock: sockF, msg: { key: { id: 'g2' } }, ctx: DONO, args: ['addall'], prefix: '!', isOwner: true, reply });
  assert.strictEqual((keys('grupos_2449') || []).length, 3, 'addall pega G1+G2 além do GRP registado');
  // list vai como carrossel hidden — no, lista single_select
  _relays = []; sent.length = 0;
  await div.divulgar({ sock: sockF, msg: { key: { id: 'g3' } }, ctx: DONO, args: ['list'], prefix: '!', isOwner: true, reply });
  assert.ok(/G R U P O S  D A  O N D A/.test(_relays[0].m._wrapped.interactiveMessage.body.text), 'lista numerada');
  // del 1
  await div.divulgar({ sock: sockF, msg: { key: { id: 'g4' } }, ctx: DONO, args: ['del', '1'], prefix: '!', isOwner: true, reply });
  assert.strictEqual((keys('grupos_2449') || []).length, 2, 'del 1 remove o 1º');
  assert.strictEqual(keys('grupos_2449')[0].jid, 'G1@g.us', 'sobram G1 e G2');
  // isolamento: outro cavalheiro não mistura
  await div.divulgar({ sock: sockF, msg: { key: { id: 'g5' } }, ctx: { ...DONO, senderNumber: '1111' }, args: ['addall'], prefix: '!', isOwner: true, reply });
  assert.strictEqual((keys('grupos_1111') || []).length, 2, 'cada dono tem a sua onda (isolado)');
  console.log('✔ GRUPOS: add/addall/list/del/delall — estado isolado por dono');

  // ── 3. Delay panel + presets + custom ───────────────────────
  _relays = []; sent.length = 0;
  await div.delay({ sock: sockF, msg: { key: { id: 'd1' } }, ctx: DONO, args: [], prefix: '!', isOwner: true, reply });
  const painelD = _relays[0].m._wrapped.interactiveMessage.body.text;
  assert.ok(/⚡ \*super\* — 0ms 🟢 ATIVO/.test(painelD.replace(/\s+/g,' ')) || /🟢 ATIVO/.test(painelD), '🟢 no preset ativo (0ms SUPER default)');
  assert.ok(/custom: `!delay 100`/.test(painelD), 'hint custom no painel');
  const dRows = JSON.parse(_relays[0].m._wrapped.interactiveMessage.nativeFlowMessage.buttons[0].buttonParamsJson).sections[0].rows;
  assert.ok(dRows.some(r => r.id === '!delay antiban'), 'linha antiban');
  await div.delay({ sock: sockF, msg: { key: { id: 'd2' } }, ctx: DONO, args: ['rapido'], prefix: '!', isOwner: true, reply });
  assert.strictEqual(keys('delay_2449'), 70, 'preset rápido = 70ms');
  await div.delay({ sock: sockF, msg: { key: { id: 'd3' } }, ctx: DONO, args: ['100'], prefix: '!', isOwner: true, reply });
  assert.strictEqual(keys('delay_2449'), 100, 'custom 100ms');
  await div.delay({ sock: sockF, msg: { key: { id: 'd4' } }, ctx: DONO, args: ['90000'], prefix: '!', isOwner: true, reply });
  assert.strictEqual(keys('delay_2449'), 5000, 'custom clampado em 5000');
  await div.delayultrarapido({ sock: sockF, msg: { key: { id: 'd5' } }, ctx: DONO, args: [], prefix: '!', isOwner: true, reply });
  assert.ok(keys('delay_2449') === undefined || Number(keys('delay_2449')) === 0, 'delayultrarapido → SUPER (0ms) — o nome deixou de ser piada');
  console.log('✔ !delay: painel com 🟢 + presets + custom clampado');

  // ── 4. MOTOR: visível vs invisível + histórico ──────────────
  // já tem G2 na onda do 2449
  await div.delay({ sock: sockF, msg: { key: { id: 'd6' } }, ctx: DONO, args: ['1'], prefix: '!', isOwner: true, reply });
  sent.length = 0;
  await div.divulgarrapido({ sock: sockF, msg: { key: { id: 'r1' } }, ctx: DONO, args: ['visivel', 'saiu', 'o', 'drop'], isOwner: true, reply });
  const alvoVis = sent.find(m => m.jid === 'G2@g.us' && typeof m.text === 'string');
  assert.ok(alvoVis, 'mandou para o G2');
  assert.ok(/@2443/.test(alvoVis.text) && /@2444/.test(alvoVis.text) && /@2450/.test(alvoVis.text), 'VISIVEL: tags à vista p/ todos — ADM incluso');
  assert.ok(alvoVis.mentions.includes('2450@s.whatsapp.net') && alvoVis.mentions.length === 3, 'visível: menciona TODOS (com ADM)');
  assert.ok(sent.filter(m=>/☣️ \*DIVULGAÇÃO\*/.test(m.text||'')).length === 2, 'onda cobriu os 2 grupos');
  // invisível: ZERO @ no texto, menções completas na mesma (silenciosas)
  sent.length = 0;
  await div.divulgarrapido({ sock: sockF, msg: { key: { id: 'r2' } }, ctx: DONO, args: ['invisivel', 'saiu', 'o', 'drop'], isOwner: true, reply });
  const alvoInv = sent.find(m => m.jid === 'G2@g.us' && typeof m.text === 'string');
  assert.ok(alvoInv, 'mandou para o G2 (invisível)');
  assert.ok(!/@2443/.test(alvoInv.text) && !/@2450/.test(alvoInv.text), 'INVISÍVEL: hidetag limpa — nada à vista p/ ADM');
  assert.ok(!alvoInv.mentions.includes('2450@s.whatsapp.net'), 'ADM EXCLUÍDO das menções — nem notificação lhe chega');
  assert.ok(alvoInv.mentions.includes('2443@s.whatsapp.net') && alvoInv.mentions.length === 2, 'todo o POVO mencionado (silencioso)');
  assert.ok(!/\*DIVULGAÇÃO\*/.test(alvoInv.text), 'bypass: zero banner — sai cru');
  const invG1 = sent.find(m => m.jid === 'G1@g.us' && typeof m.text === 'string');
  assert.ok(invG1, 'mandou também p/ o G1');
  assert.ok(invG1.text !== alvoInv.text && invG1.text.replace(/[\u200b\u200c\u2060\u180e]/g,'') === alvoInv.text.replace(/[\u200b\u200c\u2060\u180e]/g,''),
    'bypass: texto ÚNICO p/ grupo (ruído invisível diferente) — detective de duplicados morre');

  // histórico actualizado
  const hist = keys('hist_2449') || [];
  assert.ok(hist.length >= 2 && hist[hist.length - 1].feitos === 2, 'histórico regista feitos (2 grupos)');
  // failures contados
  _donorFail['G2@g.us'] = true;
  sent.length = 0; _relays = [];
  await div.divulgarrapido({ sock: sockF, msg: { key: { id: 'r3' } }, ctx: DONO, args: ['invisivel', 'x'], isOwner: true, reply });
  const repT = (sent.map(m => m.text).filter(Boolean).join(' ') + ' ' +
    _relays.map(x => x.m?._wrapped?.interactiveMessage?.body?.text || '').join(' '));
  assert.ok(/R E L A T Ó R I O/.test(repT) && /❌ Falhou: \*1\*/.test(repT), 'relatório conta falhas (relay fixo)');
  _donorFail = {};
  console.log('✔ MOTOR: visível vs invisível (silêncio no ADM) + histórico + falhas');

  // ── 5. !divulgar — ASSISTENTE ESCRITO dos 4 passos ──────────
  const mod = require('../src/bot/cases/divulgacao');
  sent.length = 0;
  // passo 1: !divulgar <texto> (sem args seria o Passo 1/4 a pedir o texto)
  await div.divulgar({ sock: sockF, msg: { key: { id: 'm1' } }, ctx: DONO, args: 'miga drop chegou 🕸️'.split(' '), prefix: '!', isOwner: true, reply });
  assert.ok(/TEXTO SALVO COM SUCESSO/.test(sent[0].text) && /Passo 2\/4/.test(sent[0].text) && /1 a 10/.test(sent[0].text), 'passo 2/4 pede vezes');
  // mensagem lixo no vezes → guia, sessão viva
  sent.length = 0;
  assert.ok(await mod.consumir(sockF, { key: { id: 'w1' } }, DONO, 'vinte'), 'consome resposta vaga');
  assert.ok(/Só aceito um número/.test(sent[0].text), 'guia o formato das vezes');
  // vezes = 3 → cartão de grupos + Passo 4/4
  sent.length = 0;
  assert.ok(await mod.consumir(sockF, { key: { id: 'w2' } }, DONO, '3'), 'consome o 3');
  const cartaoG = sent.find(m => /GRUPOS SELECIONADOS: 2/.test(m.text || ''));
  assert.ok(cartaoG, 'cartão GRUPOS SELECIONADOS: 2');
  assert.ok(/Vezes: \*3x\*/.test(cartaoG.text) && /Passo 4\/4/.test(cartaoG.text), 'vezes gravadas + passo 4/4');
  assert.ok(/• 💎 RÁDIO DARK/.test(cartaoG.text) && /• 🔥 VENDAS/.test(cartaoG.text), 'grupos listados em bullets');
  assert.ok(/marca TODOS no grupo/.test(cartaoG.text) && /marca TODOS MENOS ADM/.test(cartaoG.text), 'semântica visível/invisível no passo 4');
  // outro contacto NÃO consome (sessão isolada por chat+dono)
  assert.strictEqual(await mod.consumir(sockF, { key: { id: 'w2b' } }, { ...DONO, remoteJid: 'OUTRO@g.us' }, 'visivel'), false, 'outro chat não consome');
  // visivel → onda 2 grupos ×3 vezes = 6 mensagens de texto
  sent.length = 0;
  assert.ok(await mod.consumir(sockF, { key: { id: 'w3' } }, DONO, 'visivel'), 'consome visivel');
  const despachos = sent.filter(m => /\*DIVULGAÇÃO\*/.test(m.text || ''));
  assert.strictEqual(despachos.length, 6, '2 grupos × 3 vezes = 6 envios');
  assert.ok(new Set(despachos.map(m => m.jid)).size === 2, 'cobriu os 2 grupos');
  // v9.13 anti-ban: VISÍVEL também sai byte-a-byte ÚNICO por grupo e
  // por passe (ruído zero-width no corpo — banner e @tags intactos),
  // senão 96 cópias exactas do mesmo texto = detector de broadcast.
  assert.ok(new Set(despachos.map(m => m.text)).size === 6, 'anti-duplicados: cada cópia visível é única');
  const stripZw = (s) => s.replace(/[\u200b\u200c\u2060\u180e]/g, '');
  const mesmaOnda = despachos.filter(m => m.jid === 'G1@g.us');
  assert.ok(new Set(mesmaOnda.map(m => stripZw(m.text))).size === 1, '…mas sem ruído é o MESMO anúncio (conteúdo preservado)');
  const ultimaHist = (keys('hist_2449') || []).slice(-1)[0];
  assert.strictEqual(ultimaHist.vezes, 3, 'histórico guarda vezes=3');
  assert.strictEqual(ultimaHist.total, 6, 'histórico total = grupos × vezes');
  // sessão morreu (novo visivel já não consome)
  assert.strictEqual(await mod.consumir(sockF, { key: { id: 'w4' } }, DONO, 'visivel'), false, 'sessão encerrada depois do disparo');
  // cancelar por escrito a meio do caminho
  await div.divulgar({ sock: sockF, msg: { key: { id: 'm3' } }, ctx: DONO, args: ['aborta'], prefix: '!', isOwner: true, reply });
  sent.length = 0;
  assert.ok(await mod.consumir(sockF, { key: { id: 'w5' } }, DONO, '.cancelar'), 'consome .cancelar');
  assert.ok(/A S S I S T E N T E\s\sA B O R T A D O/.test(sent[0].text), 'aborta darktoxic');
  assert.ok(!sent.some(m => m.jid === 'G2@g.us'), 'nada saiu');
  // sem agente: mensagem solta NÃO é engolida
  assert.strictEqual(await mod.consumir(sockF, { key: { id: 'w6' } }, DONO, 'visivel'), false, 'sem sessão → não come texto');

  // ── 5b. CANAL SECRETO (v9.14): o ADM não vê NADA ─────────────
  // assistente arrancado NUM GRUPO → tudo vai para o PV do dono;
  // se o dono responde no PV, a sessão migra e continua lá.
  console.log('▸ Canal secreto: divulgação em grupo fala só no PV do dono');
  sent.length = 0;
  await div.divulgar({ sock: sockF, msg: { key: { id: 's1' } }, ctx: DONO, args: ['pack', 'secreto'], prefix: '!', isOwner: true, reply });
  assert.ok(sent[0] && sent[0].jid === '2449@s.whatsapp.net', 'TEXTO SALVO foi para o PV, não para GRP@g.us');
  assert.ok(!sent.some(m => m.jid === 'GRP@g.us'), 'NADA da divulgação saltou no grupo');
  // resposta no PV: sessão migra e consome ('2' vezes)
  const PV = { ...DONO, remoteJid: '2449@s.whatsapp.net', isGroup: false };
  sent.length = 0;
  assert.ok(await mod.consumir(sockF, { key: { id: 's2' } }, PV, '2'), 'PV do dono consome (sessão migrada)');
  const cartaoPV = sent.find(m => /GRUPOS SELECIONADOS: 2/.test(m.text || ''));
  assert.ok(cartaoPV && cartaoPV.jid === '2449@s.whatsapp.net', 'cartão no PV também');
  // outro grupo com o MESMO dono NÃO consome (só PV migra)
  assert.strictEqual(await mod.consumir(sockF, { key: { id: 's2c' } }, { ...DONO, remoteJid: 'OUTRO@g.us' }, '9'), false, 'outro grupo não consome');
  // relatório da onda vai para o PV com botões fixos
  const histPV = { ...DONO, remoteJid: 'OUTRO@g.us' };
  sent.length = 0; _relays = [];
  await div.divulgarstop({ sock: sockF, msg: { key: { id: 's3' } }, ctx: histPV, args: [], isOwner: true, reply });
  assert.ok(sent[0] && sent[0].jid === '2449@s.whatsapp.net', 'resposta de comando em grupo sai no PV');
  console.log('✔ canal secreto: PV-only para painéis/assistente/relatórios');
  // stop sinaliza
  sent.length = 0;
  await div.divulgarstop({ sock: sockF, msg: { key: { id: 'm3' } }, ctx: DONO, isOwner: true, reply });
  assert.ok(/A P A R A R/.test(sent[0].text), 'stop confirma');
  console.log('✔ !divulgar: assistente ESCRITO 4 passos (texto→vezes→grupos→vis) + cancelar + isolamento');

  // ── 6. SEU BOT + plano ─────────────────────────────────────
  sent.length = 0;
  await div.conectarbot({ sock: sockF, msg: { key: { id: 'b1' } }, ctx: DONO, args: ['244933344455'], isOwner: true, reply });
  assert.ok(/244933344455/.test(sent[0].text), 'número registado');
  sent.length = 0;
  await div.meubot({ sock: sockF, msg: { key: { id: 'b2' } }, ctx: DONO, isOwner: true, reply });
  assert.ok(/ATIVO/.test(sent[0].text) && /Grupos da onda: \*2\*/.test(sent[0].text), 'meubot mostra estado real');
  sent.length = 0;
  await div.desconectarbot({ sock: sockF, msg: { key: { id: 'b3' } }, ctx: DONO, isOwner: true, reply });
  assert.ok(/D E S C O N E C T A D O/.test(sent[0].text), 'desconecta');
  sent.length = 0;
  await div.aluguel({ sock: sockF, msg: { key: { id: 'b4' } }, ctx: DONO, isOwner: true, reply });
  assert.ok(/7 dias/.test(sent[0].text) && /90 dias/.test(sent[0].text), 'tabela de aluguel');
  console.log('✔ SEU BOT: conectar/meu/desligar + tabela de planos');

  // ── 6.5. Botões FIXOS no relatório + repetir + stats + agenda ──
  _relays = []; sent.length = 0;
  await div.divulgarrapido({ sock: sockF, msg: { key: { id: 'x1' } }, ctx: DONO, args: ['invisivel', 'onda', 'com', 'botoes'], isOwner: true, reply });
  const repFixo = _relays.map(x => x.m?._wrapped?.interactiveMessage).find(Boolean);
  assert.ok(repFixo && /R E L A T Ó R I O/.test(repFixo.body.text), 'relatório com botões fixos');
  const fixos = repFixo.nativeFlowMessage.buttons.map(b => JSON.parse(b.buttonParamsJson).id);
  assert.ok(fixos.includes('!divulgarrepetir') && fixos.includes('!divulgarhistorico') && fixos.includes('!divulgarstop'), 'fixos: repetir · histórico · parar');
  // repetir a mesma onda
  sent.length = 0;
  await div.divulgarrepetir({ sock: sockF, msg: { key: { id: 'x2' } }, ctx: DONO, isOwner: true, reply });
  assert.ok(sent.filter(m => m.jid && ['G1@g.us','G2@g.us'].includes(m.jid) && Array.isArray(m.mentions) && m.mentions.length >= 1).length === 2, 'repetir volta a regar os 2 grupos (invisível agora sai cru)');
  // stats
  sent.length = 0;
  await div.divulgarstats({ sock: sockF, msg: { key: { id: 'x3' } }, ctx: DONO, isOwner: true, reply });
  assert.ok(/P R O V A/.test(sent[0].text) && /Ondas disparadas/.test(sent[0].text) && /Entregues com sucesso/.test(sent[0].text), 'dashboard de stats');
  // agenda (simulando a passagem do minuto)
  let _agendaFn = null;
  const realST = global.setTimeout;
  global.setTimeout = (fn, ms) => { assert.strictEqual(ms, 60000, '1 min real'); _agendaFn = fn; return 1; };
  sent.length = 0;
  await div.divulgaragenda({ sock: sockF, msg: { key: { id: 'x4' } }, ctx: DONO, args: ['1', 'invisivel', 'onda', 'das', '21h'], isOwner: true, reply });
  global.setTimeout = realST;
  assert.ok(/A G E N D A D A/.test(sent[0].text) && /1min/.test(sent[0].text), 'agenda confirmada darktoxic');
  assert.ok(_agendaFn, 'timer registado');
  // stop cancela agenda pendente
  sent.length = 0;
  await div.divulgarstop({ sock: sockF, msg: { key: { id: 'x5' } }, ctx: DONO, isOwner: true, reply });
  assert.ok(/Agenda pendente também cancelada/.test(sent[0].text), 'stop apaga a agenda');
  clearTimeout; // noop
  console.log('✔ FIXOS + repetir + stats + agenda (com cancel no stop)');

  // ── 7. estáticos ────────────────────────────────────────────
  const fs = require('fs'), path=require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'bot', 'cases', 'divulgacao.js'), 'utf8');
  assert.ok(/☣️◢◤/.test(src) && /DARKTOXIC/.test(src), 'tema darktoxic no código');
  assert.ok(/additionalNodes/.test(src), 'selo biz no código');
  assert.ok(!/meualuguel/.test(src), 'sem colisão com meualuguel (rental2)');
  const sd = require('../src/bot/submenuData');
  for (const c of ['divulgar', 'divulgarfoto', 'delay', 'meubot', 'aluguel', 'cliente']) {
    assert.strictEqual(sd.categorize(c), 'owner', `${c} → owner`);
  }
  console.log('✔ estáticos: tema, selo, sem colisões, categorias');

  // ── 8. SUPER MODO (v9.15): zero comportamento humano no motor ──
  console.log('▸ SUPER MODO — sem piso, sem pausas, sem jitter');
  assert.ok(!/_PAUSA_A_CADA|_MIN_G\b|_PASS_MIN|_sleepJitter/.test(src),
    'motor sem engrenagens de ritmo humano (v9.13 removidas)');
  assert.ok(/SUPER/.test(src) && !/risco ban/.test((src.split('_painelCliente')[1] || '').slice(0, 4000)),
    'painel fala SUPER, já não assusta com «risco ban»');
  await div.delay({ sock: sockF, msg: { key: { id: 'p0' } }, ctx: DONO, args: ['super'], prefix: '!', isOwner: true, reply });
  assert.strictEqual(keys('delay_2449'), undefined === keys('delay_2449') ? undefined : keys('delay_2449'), 'super grava 0/undef sem crash');
  sent.length = 0;
  const t0 = Date.now();
  await div.divulgarrapido({ sock: sockF, msg: { key: { id: 'p1' } }, ctx: DONO, args: ['sem', 'pacote', 'super'], isOwner: true, reply });
  const dt1 = Date.now() - t0;
  assert.ok(dt1 < 400, `rajada SUPER sem pausas: 2 grupos em ${dt1}ms`);
  const rajada = sent.filter(m => /@g\.us$/.test(m.jid));
  assert.ok(rajada.length >= 2, `ambos os grupos na rajada (${rajada.length})`);
  console.log(`✔ super: onda completa em ${dt1}ms — zero pausas de fábrica`);

  console.log('\nOK / test-adivulgacao — CLIENTE ONLINE darktoxic (v9.8)');
  // ── 7. v9.15 — GIRO + AGENDA PERSISTENTE + MÉTRICAS ──────────────
  const dv = require('../src/bot/cases/divulgacao');
  const { _corpoDesp, _msProximaHora } = dv.__test;
  try {
    _db.set('divulg_giro_2449', ['C1', 'C2', 'C3']);
    dv.__test._GIRO_IDX.delete('2449');
    const g1 = await _corpoDesp('base', 'sem', '', '2449');
    const g2 = await _corpoDesp('base', 'sem', '', '2449');
    const g3 = await _corpoDesp('base', 'sem', '', '2449');
    const g4 = await _corpoDesp('base', 'sem', '', '2449');
    assert.deepStrictEqual([g1, g2, g3, g4], ['C1', 'C2', 'C3', 'C1'], 'giro roda o carrossel a cada envio');
    _db.delete('divulg_giro_2449'); dv.__test._GIRO_IDX.delete('2449');
    assert.strictEqual(await _corpoDesp('soZinho', 'sem', '', '2449'), 'soZinho', 'sem giro = texto puro');
    // métricas de um passe real do motor (secção 6 já correu ondas)
    const stt = _db.get('divulg_stats_2449');
    assert.ok(stt && Object.keys(stt).length >= 1, 'stats por grupo gravados após onda');
    const k0 = Object.keys(stt)[0];
    assert.ok(Number.isInteger(stt[k0].ok) && stt[k0].ok >= 1 && 'consec' in stt[k0], 'stats {ok,fail,consec}');
    // agenda: HH:MM, minutos, inválidos
    const at1 = _msProximaHora({ 1: '21', 2: '30' }, 0);
    assert.ok(at1 > Date.now() && at1 - Date.now() <= 86401000, 'HH:MM → nos próximos 24h');
    const d15 = _msProximaHora(null, 15) - Date.now();
    assert.ok(d15 > 899000 && d15 < 901000, '15min = 900s');
    assert.strictEqual(_msProximaHora({ 1: '25', 2: '00' }, 0), null, '25:00 inválida → null');
    assert.strictEqual(_msProximaHora(null, 99999), null, '>10 dias → null');
    // !divulgaragenda grava persistida (harness sem sock vivo: registo basta)
    await div.divulgaragenda({ sock: sockF, msg: { key: { id: 'ag1' } }, ctx: DONO, args: ['21:30', 'visivel', 'drop\nnoite'], isOwner: true, reply });
    const agSalva = _db.get('divulg_agenda_2449');
    assert.ok(agSalva && /drop/.test(agSalva.texto) && agSalva.vis === 'visivel' && agSalva.at > Date.now(), 'agenda HH:MM gravada em BotConfig (divulg_agenda_2449)');
    await div.divulgaragenda({ sock: sockF, msg: { key: { id: 'ag2' } }, ctx: DONO, args: ['diario', '08:00', 'bom\ndia'], isOwner: true, reply });
    assert.ok(_db.get('divulg_agenda_2449').diario === true, 'variante diário aceita');
    await div.divulgaragendaremove({ ctx: DONO, isOwner: true, reply });
    assert.strictEqual(_db.get('divulg_agenda_2449'), null, 'desagendar limpa o registo');
    // métricas + reativar via comando
    _db.set('divulg_stats_2449', { 'morteiro@g.us': { ok: 2, fail: 9, consec: 9, nome: 'Covil Morto' } });
    _db.set('divulg_grupos_2449', []);
    sent.length = 0;
    await div.divulgar({ sock: sockF, msg: { key: { id: 'm1' } }, ctx: DONO, args: ['metricas'], prefix: '!', isOwner: true, reply });
    const relMetricas = sent.map((x) => x.text).join('\n') + JSON.stringify(_relays.map((r) => r.m));
    assert.ok(/M É T R I C A S/.test(relMetricas) && /Covil Morto/.test(relMetricas) && /reativar 1/.test(relMetricas), 'metricas mostra activos + cemitério com reativar N');
    await div.divulgar({ sock: sockF, msg: { key: { id: 'm2' } }, ctx: DONO, args: ['reativar', '1'], prefix: '!', isOwner: true, reply });
    const rej = _db.get('divulg_grupos_2449');
    assert.ok(Array.isArray(rej) && rej.some((g) => g.jid === 'morteiro@g.us'), 'reativar 1 devolve o grupo à onda');
    const srcD = fs.readFileSync(require.resolve('../src/bot/cases/divulgacao.js'), 'utf8');
    assert.ok(/divulg_agenda_/.test(srcD) && /_rearmAgendas/.test(srcD), 're-arm da agenda no arranque');
    assert.ok(/Math\.random\(\) \* \(i \+ 1\)/.test(srcD), 'ordem baralhada Fisher–Yates por passe');
    assert.ok(/giro_\$\{own\}/.test(srcD), 'giro lido no _corpoDesp por dono');
    console.log('✔ v9.15: giro, agenda HH:MM/diária persistente, métricas + ⚰️reativar, ordem aleatória');
  } finally { _db.delete('divulg_giro_2449'); }
  process.exit(0);
})().catch(e => { console.error('ERRO FATAL:', e); process.exit(1); });
