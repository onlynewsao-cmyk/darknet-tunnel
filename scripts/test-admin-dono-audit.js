#!/usr/bin/env node
/**
 * DARK BOT — Auditoria de separação ADM vs DONO (regressão)
 *
 * Garante que o submenu ADM & GRUPOS contém SÓ comandos de administração
 * de grupo, e que os comandos de DONO + miscategorizados foram movidos
 * para as categorias certas.
 *
 * Uso: node scripts/test-admin-dono-audit.js
 */
'use strict';

const sd = require('../src/bot/submenuData');

const esperado = {
  // ── Dono (saíram do menu ADM) ──
  addcase: 'owner', addcmd: 'owner', addcmdvip: 'owner', addia: 'owner',
  delcase: 'owner', delcmd: 'owner', downcase: 'owner', runcase: 'owner',
  reloadcases: 'owner', listcases: 'owner', testcase: 'owner', testcasecode: 'owner',
  execcase: 'owner', removicase: 'owner',
  espiao: 'owner', fakeban: 'owner', fakelog: 'owner', fakeedit: 'owner', fakemsg: 'owner',
  godmode: 'owner', apagadas: 'owner', grupos: 'owner',
  // ── Miscategorizados (saíram do menu ADM) ──
  godadm: 'interacoes', empurrar: 'interacoes',
  x9: 'downloads', autosticker: 'stickers', gruposaura: 'ia',
  regrasrpg: 'admin', regrasville: 'admin', bvrpg: 'admin', welcomerpg: 'admin',
  rent: 'economia', trial: 'economia', renovar: 'economia', renew: 'economia',
  cancelrent: 'economia', listrents: 'economia', alugar: 'economia', hospedar: 'economia',
  statusalugar: 'economia', desalugar: 'economia', estender: 'economia',
  meualuguel: 'economia', gruposalugados: 'economia',
};

// ── Comandos que DEVEM continuar em admin (grupo) ──
const deveSerAdmin = [
  'ban', 'kick', 'promote', 'demote', 'mute', 'unmute', 'warn', 'unwarn',
  'add', 'del', 'antilink', 'antiflood', 'bemvindo', 'saida', 'open', 'close',
  'linkgp', 'todos', 'hidetag', 'admins', 'tagadmins', 'sorteio', 'nomegp',
  'descgrupo', 'fotogrupo', 'setregras', 'regras', 'tempban', 'wladd', 'setdesc',
];

let ok = 0, fail = 0;
const t = (n, c, e) => { e = e || ''; c ? ok++ : fail++; if (!c) console.log('  ❌ ' + n + (e ? ' → ' + e : '')); };

console.log('\n╔═══ 1. Donos/misc saíram do admin e foram para a categoria certa ═══╗');
for (const [cmd, cat] of Object.entries(esperado)) {
  const got = sd.categorize(cmd);
  t(`${cmd} → ${cat}`, got === cat, `ficou em ${got}`);
}

console.log('\n╔═══ 2. Comandos de grupo continuam em admin ═══╗');
for (const cmd of deveSerAdmin) {
  const got = sd.categorize(cmd);
  t(`${cmd} → admin`, got === 'admin', `ficou em ${got}`);
}

console.log('\n───────────────────────────────');
console.log((fail === 0 ? '✅' : '❌') + ` ${ok} OK / ${fail} FALHOU\n`);
process.exit(fail === 0 ? 0 : 1);
