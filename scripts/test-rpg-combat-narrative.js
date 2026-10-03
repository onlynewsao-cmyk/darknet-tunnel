#!/usr/bin/env node
'use strict';
/** Regressão para momentos narrativos, armadilhas e escolhas táticas de combate. */
const assert = require('assert');
const path = require('path');
const Module = require('module');

const root = path.resolve(__dirname, '..');
const combatPath = path.join(root, 'src/bot/rpg/combat.js');
const player = {
  name: 'Kael', level: 8, hp: 180, maxHp: 180, mp: 80, maxMp: 80, lives: 3,
  race: 'humano', class: 'guerreiro', inventory: ['poção de vida'], coins: 0,
  kills: 0, bossKills: 0, deaths: 0, stats: { str: 12, dex: 12, int: 12, vit: 12, luk: 12 },
};
const renders = [];
const engine = {
  RACES: { humano: { emoji: '🧑' } },
  SKILLS: { guerreiro: [{ name: 'Golpe de Aço', emoji: '⚔️', type: 'atk', power: 20, cost: 10 }] },
  async getPlayer() { return player; }, async savePlayer() {},
  getStrategy() { return null; },
  generateEnemy() { return { name: 'Sentinela da Ruína', emoji: '🗿', level: 8, hp: 900, maxHp: 900, atk: 18, def: 8, boss: false }; },
  generateLoot() { return []; }, getRank() { return { emoji: '⚪', name: 'E' }; },
  addXP() { return false; },
};
const ui = { async _enviarBotoes(_sock, _msg, _ctx, corpo, botoes) { renders.push({ corpo, botoes }); return true; } };
const theme = { async rpgReply(_sock, _msg, _ctx, title, lines) { renders.push({ title, corpo: lines.join('\n'), botoes: [] }); } };
const originalLoad = Module._load;
Module._load = function mockLoad(request, parent, isMain) {
  if (parent?.filename === combatPath) {
    if (request === './engine') return engine;
    if (request === './ui') return ui;
    if (request === './rpgTheme') return theme;
    if (request === './catalog') return { allyBonus: () => ({ atk: 0, hp: 0, n: 0 }), techBonus: () => ({ atk: 0, def: 0, crit: 0, dodge: 0, n: 0 }) };
    if (request === '../../config') return {};
  }
  return originalLoad.call(this, request, parent, isMain);
};
const combat = require(combatPath);
Module._load = originalLoad;

const ctx = { senderNumber: '244900000002', remoteJid: '244900000002@s.whatsapp.net', prefix: '!' };
const sock = { sendMessage: async () => ({}) };
const msg = {};
const realRandom = Math.random;

(async () => {
  Math.random = () => 0.5;
  await combat.iniciarCombate(sock, msg, ctx, 'normal');
  assert(renders.at(-1).botoes.some(b => b.id === 'RPGFIGHT_basic'), 'combate começa com acções normais');
  assert(/Algo neste combate|Marcas antigas|terreno estremece/i.test(renders.at(-1).corpo), 'combate começa com uma introdução narrativa');

  await combat.processarEscolha(sock, msg, ctx, 'basic');
  const c = combat._combates.get(ctx.senderNumber);
  assert(c?.momentoPendente, 'o primeiro round deve criar um momento único');
  const evento = renders.at(-1);
  assert.strictEqual(evento.botoes.length, 3, 'um momento narrativo deve oferecer três decisões');
  assert(evento.botoes.every(b => b.id.startsWith('RPGFIGHT_EVENT_')), 'as decisões devem usar IDs próprios de evento');
  assert(/MOMENTO ÚNICO/.test(evento.corpo), 'a narrativa do momento deve ser apresentada');

  const hpEnemyAntesCliqueAntigo = c.enemy.hp;
  await combat.processarEscolha(sock, msg, ctx, 'basic');
  assert.strictEqual(c.enemy.hp, hpEnemyAntesCliqueAntigo, 'acção normal não pode ignorar uma decisão narrativa pendente');

  const token = evento.botoes[0].id;
  assert.strictEqual(await combat.resolverBotao(sock, msg, ctx, token), true, 'o clique de evento deve ser resolvido');
  assert.strictEqual(c.momentoPendente, null, 'a decisão deve encerrar o momento pendente');
  assert(c.tactical, 'a decisão deve criar uma vantagem ou desvantagem tática temporária');
  assert(renders.at(-1).botoes.some(b => b.id === 'RPGFIGHT_basic'), 'após decidir, o combate volta às acções normais');

  // Armadilha explícita: a opção de atravessar tem custo de HP e benefício de ataque.
  c.momentoPendente = combat.MOMENTOS_BATALHA.find(m => m.id === 'runa_explosiva');
  const hpAntesArmadilha = c.playerHp;
  await combat.resolverBotao(sock, msg, ctx, 'RPGFIGHT_EVENT_runa_explosiva_3');
  assert(c.playerHp < hpAntesArmadilha, 'atravessar a armadilha deve ter risco real de HP');
  assert.strictEqual(c.tactical.nome, 'Fúria Ardente', 'a armadilha deve conceder uma vantagem ofensiva em troca do risco');

  assert(combat.MOMENTOS_BATALHA.length >= 4, 'combate deve ter variedade de situações narrativas');
  const router = require('fs').readFileSync(path.join(root, 'src/bot/commandHandler.js'), 'utf8');
  assert(/RPGFIGHT_\[a-z0-9_\]\+/.test(router), 'o commandHandler deve aceitar IDs de eventos com underscore');
  console.log('✓ Combate narrativo: introdução, 3 decisões, armadilha, risco e vantagem tática validados.');
})().catch(err => { console.error('✗ Combat narrative test failed:', err.stack || err); process.exit(1); })
  .finally(() => { Math.random = realRandom; });
