#!/usr/bin/env node
'use strict';
/** Regressão: quests com três botões, avanço imediato e cartões antigos seguros. */
const assert = require('assert');
const path = require('path');
const Module = require('module');

const root = path.resolve(__dirname, '..');
const rpg2Path = path.join(root, 'src/bot/cases/rpg2.js');
const player = { xp: 0, coins: 0, inventory: [], title: '', quest: { current: null, step: 0, completed: [] } };
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
  async getPlayer() { return player; },
  async savePlayer() {},
  addXP(p, xp) { p.xp += xp; return false; },
};
const theme = {
  async rpgBotoes(_sock, _msg, _ctx, corpo, botoes) { sent.push({ type: 'buttons', corpo, botoes }); return true; },
  async rpgReply(_sock, _msg, _ctx, title, linhas) { sent.push({ type: 'reply', title, corpo: linhas.join('\n') }); },
};
const themePath = path.join(root, 'src/bot/rpg/rpgTheme.js');
require.cache[themePath] = { id: themePath, filename: themePath, loaded: true, exports: theme };
const originalLoad = Module._load;
Module._load = function mockLoad(request, parent, isMain) {
  if (parent?.filename === rpg2Path) {
    if (request === '../../config') return { bot: { name: 'DARK BOT' } };
    if (request === '../rpg/engine') return rpg;
    if (request === '../rpg/rpgTheme') return theme;
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

  const router = require('fs').readFileSync(path.join(root, 'src/bot/commandHandler.js'), 'utf8');
  assert(/RPGQUEST_\[a-z0-9_\]\+_\\d\+/.test(router), 'o commandHandler deve encaminhar os cliques RPGQUEST');
  console.log('✓ Quest: três botões, avanço sem cooldown e cartões antigos bloqueados.');
})().catch(err => { console.error('✗ Quest button test failed:', err.stack || err); process.exit(1); });
