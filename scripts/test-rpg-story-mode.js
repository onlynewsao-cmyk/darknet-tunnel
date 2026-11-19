#!/usr/bin/env node
'use strict';
/* Isolated regression test: requires no database, Baileys, or dotenv. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');

const player = {
  name: 'Amani', level: 30, hp: 250, maxHp: 250, mp: 80, maxMp: 80, lives: 3,
  coins: 0, xp: 0, inventory: [], skills: [], storyProgress: {}, title: '',
};
const events = [];
let saves = 0;
let bossLaunch = null;

const rpg = {
  async getPlayer() { return player; },
  async savePlayer() { saves++; },
  addXP(p, xp) { p.xp = (p.xp || 0) + xp; return false; },
};
const theme = {
  async rpgReply(_sock, _msg, _ctx, title, lines) { events.push({ type: 'reply', title, body: lines.join('\n') }); },
  async rpgBotoes(_sock, _msg, _ctx, body, buttons) { events.push({ type: 'buttons', body, buttons }); },
  async rpgImagem(_sock, _msg, _ctx, imagePath, caption, buttons) { events.push({ type: 'image', imagePath, caption, buttons }); },
  async rpgLista() {}, async rpgCarrossel() {},
};
const combat = {
  async iniciarCombateBoss(_sock, _msg, _ctx, boss, onVictory) {
    bossLaunch = { boss, onVictory };
  },
};
const originalLoad = Module._load;
Module._load = function mockedLoad(request, parent, isMain) {
  if (parent && parent.filename.endsWith(path.join('rpg', 'storyMode.js'))) {
    if (request === './engine') return rpg;
    if (request === './combat') return combat;
    if (request === './rpgTheme') return theme;
    if (request === '../../config') return { PREFIX: '!' };
  }
  return originalLoad.call(this, request, parent, isMain);
};
const story = require('../src/bot/rpg/storyMode');
Module._load = originalLoad;

const sock = {};
const msg = {};
const ctx = { senderNumber: '244900000000', remoteJid: '244900000000@s.whatsapp.net', prefix: '!' };

function lastAction() {
  for (let i = events.length - 1; i >= 0; i--) {
    const button = events[i].buttons?.find(b => /^STORY[CN]_ruptura_/.test(b.id));
    if (button) return button.id;
  }
  return null;
}

async function finishCurrentRupturaChapter() {
  const startChapter = player.storyProgress.ruptura.capitulo;
  for (let guard = 0; guard < 12 && player.storyProgress.ruptura.capitulo === startChapter; guard++) {
    const token = lastAction();
    assert(token, 'o capítulo deve apresentar uma escolha ou botão Continuar');
    const beforeEventCount = events.length;
    await story.resolverClique(sock, msg, ctx, token);
    assert(events.length > beforeEventCount, 'cada acção válida deve produzir uma resposta');
  }
  assert.strictEqual(player.storyProgress.ruptura.capitulo, startChapter + 1, 'o capítulo deve avançar exactamente uma vez');
}

(async () => {
  assert.strictEqual(story.WORLDS.ruptura.acessoLivre, true, 'a campanha de entrada deve dispensar trivia externa');
  assert.strictEqual(story._getChapters('ruptura').length, 4, 'Crónicas da Ruptura deve ter quatro capítulos');
  assert(fs.existsSync(path.join(__dirname, '../src/bot/rpg/images/ruptura.jpg')), 'a capa local da campanha deve existir');

  await story.jogarMundo(sock, msg, ctx, 'ruptura');
  assert.strictEqual(player.storyProgress.ruptura.testePassado, true, 'acesso livre deve marcar o mundo como pronto');
  const firstToken = lastAction();
  assert(/^STORYC_ruptura_rt01_/.test(firstToken), 'o primeiro nó deve expor escolhas navegáveis');

  await story.resolverClique(sock, msg, ctx, firstToken);
  const xpAfterFirstClick = player.xp;
  const coinsAfterFirstClick = player.coins;
  await story.resolverClique(sock, msg, ctx, firstToken);
  assert.strictEqual(player.xp, xpAfterFirstClick, 'um clique antigo não pode repetir XP');
  assert.strictEqual(player.coins, coinsAfterFirstClick, 'um clique antigo não pode repetir coins');
  assert.strictEqual(events.at(-1).title, '⌛ ESCOLHA ANTIGA', 'um clique antigo deve informar o jogador');

  // Termina o capítulo já iniciado e todos os restantes, sempre pelo token UI actual.
  await finishCurrentRupturaChapter();
  while (player.storyProgress.ruptura.capitulo < 4) {
    await story.jogarMundo(sock, msg, ctx, 'ruptura');
    await finishCurrentRupturaChapter();
  }
  const coinsAtFinish = player.coins;
  const xpAtFinish = player.xp;
  assert(player.inventory.includes('Coração da Ruptura'), 'a recompensa final deve ser entregue');
  assert.strictEqual(player.title, 'Guardião do Véu', 'a recompensa final deve atribuir título');
  await story.jogarMundo(sock, msg, ctx, 'ruptura');
  assert.strictEqual(player.coins, coinsAtFinish, 'reabrir mundo concluído não pode pagar coins novamente');
  assert.strictEqual(player.xp, xpAtFinish, 'reabrir mundo concluído não pode pagar XP novamente');

  // O quiz usa tokens próprios e também recusa respostas fora de ordem.
  await story.resolverClique(sock, msg, ctx, 'STESTE_naruto');
  await story.resolverClique(sock, msg, ctx, 'STESTQ_naruto_0');
  const staleQuizXp = player.xp;
  await story.resolverClique(sock, msg, ctx, 'STESTA_naruto_1_0');
  assert.strictEqual(player.xp, staleQuizXp, 'uma resposta de quiz fora de ordem não pode alterar XP');
  assert.strictEqual(player._testState.naruto.pergunta, 0, 'uma resposta de quiz fora de ordem não pode avançar pergunta');
  for (let i = 0; i < story.WORLDS.naruto.teste.perguntas.length; i++) {
    const correct = story.WORLDS.naruto.teste.perguntas[i].correta;
    await story.resolverClique(sock, msg, ctx, `STESTA_naruto_${i}_${correct}`);
    if (i < story.WORLDS.naruto.teste.perguntas.length - 1) await story.resolverClique(sock, msg, ctx, `STESTQ_naruto_${i + 1}`);
  }
  assert.strictEqual(player.storyProgress.naruto.testePassado, true, 'quatro respostas certas devem desbloquear o mundo');

  // Regressão de tokens com IDs que contêm underscores + boss de história.
  const naruto = story._getChapters('naruto');
  const chapterIndex = naruto.findIndex(ch => ch.nodes.some(n => n.boss));
  assert(chapterIndex >= 0, 'Naruto deve disponibilizar pelo menos um boss de história');
  const bossChapter = naruto[chapterIndex];
  const bossNode = bossChapter.nodes.find(n => n.boss);
  player.storyProgress.naruto = { capitulo: chapterIndex, node: bossNode.id, completos: [], testePassado: true, testePontos: 0, nodesRecompensados: [] };
  await story.resolverClique(sock, msg, ctx, `STORYB_naruto_${bossChapter.id}_${bossNode.id}`);
  assert(bossLaunch?.boss?.nome === bossNode.boss.nome, 'o botão de boss deve iniciar o boss configurado, não um inimigo aleatório');
  await bossLaunch.onVictory({ p: player });
  assert.notStrictEqual(player.storyProgress.naruto.node, bossNode.id, 'vencer um boss deve avançar a narrativa');

  console.log(`✓ Story Mode: Ruptura concluída, cliques antigos bloqueados, boss narrativo integrado (${saves} saves).`);
})().catch(err => { console.error('✗ Story Mode test failed:', err.stack || err); process.exit(1); });
