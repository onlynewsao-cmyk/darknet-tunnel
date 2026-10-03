#!/usr/bin/env node
'use strict';
/** Regressão: quests com três botões, avanço imediato e cartões antigos seguros. */
const assert = require('assert');
const path = require('path');
const Module = require('module');

const root = path.resolve(__dirname, '..');
const rpg2Path = path.join(root, 'src/bot/cases/rpg2.js');
const player = {
  name: 'Kael', xp: 0, coins: 0, inventory: ['poção de vida', 'poção de mana', 'madeira'], title: '',
  hp: 40, maxHp: 100, mp: 10, maxMp: 80, level: 3, stats: { str: 6, dex: 6, int: 6, vit: 6, luk: 6 },
  quest: { current: null, step: 0, completed: [] },
};
const quests = [
  {
    id: 'inicio', titulo: 'O Chamado', texto: 'Um mensageiro entrega-te um pergaminho selado.',
    escolhas: [
      { txt: 'Abrir o pergaminho', next: 'estrada', xp: 20 },
      { txt: 'Recusar e seguir caminho', next: 'estrada', xp: 5 },
      { txt: 'Atacar o mensageiro', next: 'estrada', xp: 10 },
    ],
  },
  {
    id: 'estrada', titulo: 'A Estrada Antiga', texto: 'A estrada divide-se entre a floresta e as ruínas.',
    escolhas: [{ txt: 'Seguir pela floresta', next: null, xp: 15 }, { txt: 'Investigar as ruínas', next: null, xp: 15 }],
  },
];
const sent = [];
const rpg = {
  QUESTS: quests,
  BIOMES: {
    floresta: { emoji: '🌲', nivel: 1, danger: 1, desc: 'Mata densa' },
    caverna: { emoji: '🕳️', nivel: 8, danger: 3, desc: 'Escuridão e ecos' },
  },
  NPCS: { mago: { emoji: '🧙', name: 'Aldric', dialogues: ['Segue o teu destino.'] } },
  ITEMS: {
    'poção de vida': { emoji: '🧪', effect: { hp: 60 } },
    'poção de mana': { emoji: '💙', effect: { mp: 50 } },
  },
  async getPlayer() { return player; },
  async savePlayer() {},
  addXP(p, xp) { p.xp += xp; return false; },
};
const escolhasUi = [];
const ui = {
  async escolher(_sock, _msg, _ctx, dados) { escolhasUi.push(dados); return true; },
  async confirmar() { return true; },
};
const combat = { chamadas: [], async iniciarCombate(sock, msg, ctx, tipo) { this.chamadas.push({ sock, msg, ctx, tipo }); return true; } };
const theme = {
  async rpgBotoes(_sock, _msg, _ctx, corpo, botoes) { sent.push({ type: 'buttons', corpo, botoes }); return true; },
  async rpgReply(_sock, _msg, _ctx, title, linhas) { sent.push({ type: 'reply', title, corpo: linhas.join('\n') }); },
};
const themePath = path.join(root, 'src/bot/rpg/rpgTheme.js');
const uiPath = path.join(root, 'src/bot/rpg/ui.js');
const combatPath = path.join(root, 'src/bot/rpg/combat.js');
require.cache[themePath] = { id: themePath, filename: themePath, loaded: true, exports: theme };
require.cache[uiPath] = { id: uiPath, filename: uiPath, loaded: true, exports: ui };
require.cache[combatPath] = { id: combatPath, filename: combatPath, loaded: true, exports: combat };
const originalLoad = Module._load;
Module._load = function mockLoad(request, parent, isMain) {
  if (parent?.filename === rpg2Path) {
    if (request === '../../config') return { bot: { name: 'DARK BOT' } };
    if (request === '../rpg/engine') return rpg;
    if (request === '../rpg/rpgTheme') return theme;
    if (request === '../rpg/ui') return ui;
    if (request === '../rpg/combat') return combat;
  }
  return originalLoad.call(this, request, parent, isMain);
};
const registerRpg2 = require(rpg2Path);
Module._load = originalLoad;

const handlers = {};
registerRpg2((names, fn) => [].concat(names).forEach(name => { handlers[name] = fn; }));
const ctx = { senderNumber: '244900000001', remoteJid: '244900000001@s.whatsapp.net', prefix: '!' };

(async () => {
  registerRpg2._resetCooldowns();
  await handlers.quest({ sock: {}, msg: {}, ctx, args: [] });
  const primeira = sent.at(-1);
  assert.strictEqual(primeira.type, 'buttons', 'a primeira cena deve usar botões');
  assert.strictEqual(primeira.botoes.length, 3, 'a cena inicial deve suportar exactamente três botões');
  assert.deepStrictEqual(primeira.botoes.map(b => b.id), ['RPGQUEST_inicio_1', 'RPGQUEST_inicio_2', 'RPGQUEST_inicio_3']);
  assert(!/Abrir o pergaminho|Recusar e seguir|Atacar o mensageiro|!quest <número>/.test(primeira.corpo), 'o corpo interactivo deve conter apenas a história, sem escolhas repetidas');

  await registerRpg2.resolverQuestClique({}, {}, ctx, 'RPGQUEST_inicio_2');
  const seguinte = sent.at(-1);
  assert.strictEqual(player.quest.current, 'estrada', 'o botão deve avançar a quest sem sofrer cooldown');
  assert.strictEqual(player.xp, 5, 'o prémio da escolha deve ser aplicado uma vez');
  assert.strictEqual(seguinte.type, 'buttons', 'a próxima cena também deve manter botões');
  assert(/A estrada divide-se/.test(seguinte.corpo), 'a próxima narrativa deve ser mostrada');

  const xpAntesCliqueVelho = player.xp;
  await registerRpg2.resolverQuestClique({}, {}, ctx, 'RPGQUEST_inicio_1');
  assert.strictEqual(player.xp, xpAntesCliqueVelho, 'cartão antigo não pode aplicar prémio de novo');
  assert.strictEqual(sent.at(-1).title, '⌛ ESCOLHA ANTIGA', 'cartão antigo deve informar o jogador');

  // ── Menus RPG: explorar, lutar e consumíveis ───────────────
  escolhasUi.length = 0;
  await handlers.explorar({ sock: {}, msg: {}, ctx, args: [] });
  const mapa = escolhasUi.at(-1);
  assert.strictEqual(mapa.titulo, '🗺️ EXPLORAR', '!explorar abre uma lista de biomas');
  assert.strictEqual(mapa.opcoes.length, 2, 'todos os biomas disponíveis aparecem na lista');
  await mapa.onEscolha(1, { sock: {}, msg: {}, ctx });
  assert(sent.at(-1).type === 'reply' && /CAVERNA/.test(sent.at(-1).corpo), 'escolher um bioma executa a exploração escolhida');

  escolhasUi.length = 0;
  await handlers.lutar({ sock: {}, msg: {}, ctx, args: [] });
  const lutas = escolhasUi.at(-1);
  assert.strictEqual(lutas.titulo, '⚔️ ESCOLHER BATALHA', '!lutar abre a escolha de risco');
  assert.deepStrictEqual(lutas.opcoes.map(o => o.label), ['⚔️ Combate normal', '💀 Inimigo de elite', '👑 Desafiar boss']);
  await lutas.onEscolha(1, { sock: {}, msg: {}, ctx });
  assert.strictEqual(combat.chamadas.at(-1).tipo, 'elite', 'a escolha Elite inicia o combate correcto');

  escolhasUi.length = 0;
  await handlers.pocao({ sock: {}, msg: {}, ctx, args: [] });
  const consumiveis = escolhasUi.at(-1);
  assert.strictEqual(consumiveis.titulo, '🧪 USAR CONSUMÍVEL', '!pocao mostra os consumíveis disponíveis');
  assert.strictEqual(consumiveis.opcoes.length, 2, 'poção de vida e mana aparecem para tocar');
  await consumiveis.onEscolha(1, { sock: {}, msg: {}, ctx });
  assert.strictEqual(player.mp, 60, 'escolher poção de mana aplica o efeito correcto');
  assert(!player.inventory.includes('poção de mana'), 'o consumível escolhido é removido uma vez');

  escolhasUi.length = 0;
  await handlers.inventario({ sock: {}, msg: {}, ctx });
  const mochila = escolhasUi.at(-1);
  assert.strictEqual(mochila.titulo, '🎒 INVENTÁRIO', 'inventário oferece uso de consumíveis por toque');
  assert.strictEqual(mochila.opcoes.length, 1, 'inventário só oferece os consumíveis que ainda existem');

  const router = require('fs').readFileSync(path.join(root, 'src/bot/commandHandler.js'), 'utf8');
  assert(/RPGQUEST_\[a-z0-9_\]\+_\\d\+/.test(router), 'o commandHandler deve encaminhar os cliques RPGQUEST');
  console.log('✓ Quest: três botões, avanço sem cooldown e cartões antigos bloqueados.');
})().catch(err => { console.error('✗ Quest button test failed:', err.stack || err); process.exit(1); });
