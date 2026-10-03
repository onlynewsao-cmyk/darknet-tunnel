#!/usr/bin/env node
/**
 * MENURPG — painel interativo dos comandos RPG.
 * O cartão vivo vem no topo e as secções surgem numa lista tocável;
 * cada linha devolve o comando correspondente. Sem personagem, só o
 * portal e a vitrine ficam disponíveis.
 */
'use strict';

process.env.MONGODB_URI = '';

const assert = require('assert');

// ── mocks plásticos ───────────────────────────────────────────
const Module = require('module');
const _orig = Module.prototype.require;
let _gs = null;
let _player = null;
Module.prototype.require = function (id) {
  const s = String(id);
  if (s.endsWith('hotCache')) return { getGroupSettings: async () => _gs, forgetGroup: () => {} };
  if (s === './community' || s.endsWith('/rpg/community') || s.endsWith('rpg/community')) {
    return { loadState: async () => ({}), isCommunityGroup: () => false };
  }
  if (s === './engine' || s.endsWith('/rpg/engine') || s.endsWith('rpg/engine')) {
    return { peekPlayer: async () => _player };
  }
  if (s.endsWith('GroupSettings')) return { findOne: () => ({ lean: async () => _gs }), find: () => ({ lean: async () => [] }) };
  return _orig.apply(this, arguments);
};

const sent = [];
let relays = 0;
let relayPayload = null;
const sockF = {
  sendMessage: async (j, c) => { sent.push({ j, c }); return { key: { id: 'k' } }; },
  relayMessage: async (_j, m) => { relays++; relayPayload = m; return {}; },
  user: { id: 'bot@s.whatsapp.net' },
};
function menuInterativo() {
  const im = relayPayload?.viewOnceMessage?.message?.interactiveMessage || relayPayload?.interactiveMessage;
  const params = im?.nativeFlowMessage?.buttons?.[0]?.buttonParamsJson || '{}';
  const data = JSON.parse(params);
  return {
    corpo: im?.body?.text || '',
    rows: (data.sections || []).flatMap(s => s.rows || []),
    sections: data.sections || [],
  };
}
const CTX = (extra = {}) => ({ remoteJid: 'GRP@g.us', senderNumber: '2449', senderJid: '2449@s.whatsapp.net', isGroup: true, pushName: 'Dark', prefix: '!', isOwner: false, ...extra });
const MSG = (id) => ({ key: { id, remoteJid: 'GRP@g.us', participant: '2449@s.whatsapp.net' }, message: { conversation: '!menurpg' } });

(async () => {
  console.log('=== MENURPG — PAINEL INTERATIVO ===');

  const reg = {};
  require('../src/bot/cases/rpgCommunity')((nomes, fn) => { for (const n of [].concat(nomes)) reg[n] = fn; });
  assert.ok(reg.menurpg && reg['menu-rpg'] && reg.rpgmenu, 'menurpg registado');

  // ── 1. Fechado → MSG_MODO ──────────────────────────────────
  _gs = null; sent.length = 0; relays = 0;
  await reg.menurpg({ sock: sockF, msg: MSG('m1'), ctx: CTX(), prefix: '!' });
  assert.ok(sent.some(x => /mundo RPG está fechado/i.test(x.c?.text || '')), 'mundo fechado pede !modorpg');
  console.log('✔ gate intacto: fechado nem abre');

  // ── 2. Aberto SEM personagem → portal tocável ──────────────
  _gs = { modorpg: true }; _player = null; sent.length = 0; relays = 0; relayPayload = null;
  await reg.menurpg({ sock: sockF, msg: MSG('m2'), ctx: CTX(), prefix: '!' });
  const m2 = menuInterativo();
  const ids2 = m2.rows.map(r => r.id);
  assert.strictEqual(relays, 1, 'menu abre uma lista interativa');
  assert.ok(/Ainda não tens personagem/i.test(m2.corpo), 'cartão avisa a falta de personagem');
  assert.ok(m2.sections.some(s => /PORTAL DE ENTRADA/.test(s.title)), 'secção do portal');
  assert.ok(ids2.includes('!rpgstart'), 'linha de criação é tocável');
  assert.ok(!ids2.includes('!lutar'), 'jogo fica guardado sem personagem');
  assert.ok(ids2.includes('!ranking'), 'vitrine continua visível');
  console.log('✔ sem personagem: portal e vitrine abrem por toque');

  // ── 3. Aberto COM personagem → cartão + secções tocáveis ───
  _player = {
    started: true, name: 'Kael Storm', race: 'elfo', class: 'mago',
    level: 12, xp: 1440, hp: 72, maxHp: 120, mp: 55, maxMp: 90,
    coins: 630, bank: 2500, lives: 2, kills: 88, deaths: 5,
    guild: 'LOBO NEGRO', winStreak: 7, biome: { visited: ['floresta', 'caverna', 'vulcão'] },
  };
  sent.length = 0; relays = 0; relayPayload = null;
  await reg.menurpg({ sock: sockF, msg: MSG('m3'), ctx: CTX(), prefix: '!' });
  const m3 = menuInterativo();
  const ids3 = m3.rows.map(r => r.id);
  assert.strictEqual(relays, 1, 'menu completo abre uma lista nativa');
  assert.ok(/Kael Storm/.test(m3.corpo), 'nome da personagem');
  assert.ok(/ELFO · MAGO/.test(m3.corpo), 'raça + classe');
  assert.ok(/Nível \*12\*/.test(m3.corpo) && /XP 1440/.test(m3.corpo), 'nível + xp');
  assert.ok(/▰/.test(m3.corpo) && /▱/.test(m3.corpo), 'barras HP/MP');
  assert.ok(/72\/120/.test(m3.corpo) && /55\/90/.test(m3.corpo), 'valores HP/MP');
  assert.ok(/630 gold/.test(m3.corpo) && /2500 banco/.test(m3.corpo), 'finanças');
  assert.ok(/2 vidas/.test(m3.corpo) && /88 K/.test(m3.corpo) && /💀 5 M/.test(m3.corpo), 'vidas + K/M');
  assert.ok(/LOBO NEGRO/.test(m3.corpo), 'guilda');
  assert.ok(/biomas pisados: 3/.test(m3.corpo), 'biomas');
  for (const seccao of ['A TUA PERSONAGEM', 'AVENTURA & COMBATE', 'INVENTÁRIO & BAÚ', 'PRAÇA', 'LIVRO DO MUNDO']) {
    assert.ok(m3.sections.some(s => s.title.includes(seccao)), `secção ${seccao} na lista`);
  }
  for (const cmd of ['!rg', '!lutar', '!explorar', '!quest', '!viajar', '!descansar', '!pocao', '!inventario', '!bau', '!guilda', '!criaclan', '!npc', '!ranking', '!mundial', '!nome', '!vidas', '!regrasrpg', '!rpgguia']) {
    assert.ok(ids3.includes(cmd), `comando ${cmd} tocável`);
  }
  console.log('✔ com personagem: cartão completo + comandos tocáveis por secção');

  // ── 4. Prefixos respeitados nos IDs tocáveis ─────────────────
  sent.length = 0; relayPayload = null;
  await reg.menurpg({ sock: sockF, msg: MSG('m4'), ctx: CTX({ prefix: '.' }), prefix: '.' });
  const ids4 = menuInterativo().rows.map(r => r.id);
  assert.ok(ids4.includes('.lutar') && !ids4.includes('!lutar'), 'linhas usam o prefixo activo');
  console.log('✔ prefixo dinâmico aplicado');

  // ── 5. Estático ─────────────────────────────────────────────
  const fs8 = require('fs'), path8 = require('path');
  const src = fs8.readFileSync(path8.join(__dirname, '..', 'src', 'bot', 'cases', 'rpgCommunity.js'), 'utf8');
  assert.ok(/rpgLista/.test(src), 'menurpg usa lista interativa');
  assert.ok(/peekPlayer/.test(src), 'lê a personagem sem criar');
  assert.ok(/ABRIR MENU RPG/.test(src), 'título do painel está presente');
  console.log('✔ ganchos correctos para lista interativa');

  console.log('\nOK / test-amenurpg — MENURPG interativo pronto');
  process.exit(0);
})().catch(e => { console.error('ERRO FATAL:', e); process.exit(1); });
