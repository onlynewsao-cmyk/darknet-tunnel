#!/usr/bin/env node
/**
 * DARK BOT — Auditoria ECONOMIA & RPG vs DONO/outros (regressão)
 *
 * Garante que os comandos de dono/cheat e os miscategorizados saíram
 * do menu ECONOMIA e foram para as categorias certas.
 *
 * Uso: node scripts/test-economia-audit.js
 */
'use strict';

const sd = require('../src/bot/submenuData');

const esperado = {
  // Dono/cheat
  dar: 'owner', forjar: 'owner',
  rpgadd: 'owner', rpgremove: 'owner', rpgsetlevel: 'owner',
  rpgadditem: 'owner', rpgremoveitem: 'owner', rpgresetplayer: 'owner', rpgstats: 'owner',
  // Categorias certas
  invocaraura: 'ia', invokedono: 'admin', cambio: 'info', cripto: 'info',
  welcomerpg: 'admin', bvrpg: 'admin', regrasrpg: 'admin', regrasville: 'admin',
  casais: 'interacoes', dependente: 'zoeira',
};

// Devem CONTINUAR em economia (RPG legítimo)
const deveSerEconomia = [
  'daily', 'saldo', 'coins', 'depositar', 'levantar', 'trabalhar', 'minerar',
  'loja', 'comprar', 'vender', 'inventario', 'roubar', 'transferir', 'pix',
  'masmorra', 'bossrpg', 'evoluir', 'prestige', 'arena', 'torneio', 'duelar',
  'forge', 'enchant', 'rpgstart', 'criarpersonagem', 'newchar', 'racas', 'classes',
  'nome', 'rename', 'npc', 'falar', 'talk', 'pet', 'pets', 'heal', 'pocao',
  'auction', 'mercado', 'plantar', 'colher', 'coletar', 'pescar', 'fish', 'mine',
];

let ok = 0, fail = 0;
const t = (n, c, e) => { e = e || ''; c ? ok++ : fail++; if (!c) console.log('  ❌ ' + n + (e ? ' → ' + e : '')); };

console.log('\n╔═══ 1. Donos/misc saíram da economia ═══╗');
for (const [cmd, cat] of Object.entries(esperado)) {
  const got = sd.categorize(cmd);
  t(`${cmd} → ${cat}`, got === cat, `ficou em ${got}`);
}

console.log('\n╔═══ 2. RPG legítimo continua em economia ═══╗');
for (const cmd of deveSerEconomia) {
  const got = sd.categorize(cmd);
  t(`${cmd} → economia`, got === 'economia', `ficou em ${got}`);
}

console.log('\n───────────────────────────────');
console.log((fail === 0 ? '✅' : '❌') + ` ${ok} OK / ${fail} FALHOU\n`);
process.exit(fail === 0 ? 0 : 1);
