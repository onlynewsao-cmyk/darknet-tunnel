#!/usr/bin/env node
/**
 * DARK BOT — Auditoria do menu JOGOS & DIVERSÃO (regressão)
 *
 * Garante que TODOS os comandos do submenu têm handler real
 * (case / native / package). Palavra inteira em cases+packages
 * (excepto stubs) ou método nativo.
 *
 * Uso: node scripts/test-jogos-audit.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', 'src', 'bot');

function collectCommands() {
  const palavras = new Set();
  for (const d of ['cases', 'packages']) {
    for (const f of fs.readdirSync(path.join(ROOT, d))) {
      if (!f.endsWith('.js')) continue;
      if (d === 'cases' && f === 'stubs.js') continue;
      let src; try { src = fs.readFileSync(path.join(ROOT, d, f), 'utf8'); } catch { continue; }
      const re = /\b([a-zA-Z][a-zA-Z0-9_-]{0,30})\b/g;
      let m;
      while ((m = re.exec(src)) !== null) palavras.add(m[1].toLowerCase());
    }
  }
  const nc = fs.readFileSync(path.join(ROOT, 'nativeCommands.js'), 'utf8');
  const ncRe = /^\s*async\s+([a-zA-Z0-9_]+)\s*\(/gm; let m2;
  while ((m2 = ncRe.exec(nc)) !== null) palavras.add(m2[1].toLowerCase());
  return palavras;
}

const reais = collectCommands();

const lista = 'adivinha akinator anagrama apostar batalhanaval bingo blackjack cacapalavras caraoucoroa cassino chance chute coin coinflip connect4 corrida crash d6 dado dados desafio desafiomensal desafiosemanal dice digitar dueloquiz enigma eununca flip forca forcareacao genio jogodavelha jokenpo leilao loteria memoria menurpg moeda palavra ppt quando quiz quizplacar resp roleta roulette russa ship shipo simular slots sn snow stop termo tictactoe truco uno vab velha verdade verdadedesafio verdadeoudesafio winadivinha winforca winquiz wordle'.split(' ');

let ok = 0, fail = 0;
const mortos = [];
for (const c of lista) {
  if (reais.has(c.toLowerCase())) ok++; else { fail++; mortos.push(c); }
}

console.log(`\n🎮 JOGOS & DIVERSÃO: ${ok}/${lista.length} comandos com handler real\n`);
if (mortos.length) {
  console.log('❌ Sem handler (mortos):');
  mortos.forEach(c => console.log('   - ' + c));
  process.exit(1);
}
console.log('✅ Nenhum comando de JOGOS & DIVERSÃO está morto.\n');
