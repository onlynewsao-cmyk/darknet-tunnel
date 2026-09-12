#!/usr/bin/env node
/**
 * DARK BOT — Auditoria completa dos SUBMENUS + AÇÕES DIRECTAS
 *
 * 1. Para cada submenu, garante que TODOS os itens têm handler real
 * 2. Verifica as ACÇÕES DIRECTAS (sel=true) — têm handler? categoria certa?
 * 3. Lista comandos "sel" que estão ÓRFÃOS (padrão marca selectable
 *    mas o comando não existe / não tem handler)
 *
 * Uso: node scripts/test-submenus-full-audit.js  (pode demorar ~2min)
 */
'use strict';

const Module = require('module');
const orig = Module.prototype.require;
const w = (v) => { const p = Promise.resolve(v); p.lean = () => p; p.select = () => p; p.sort = () => p; p.limit = () => p; p.catch = () => p; return p; };
Module.prototype.require = function (id) {
  if (/models[\/\\]/.test(id)) return { find: () => w([]), findOne: () => w(null), findOneAndUpdate: async () => null, countDocuments: async () => 0, create: async () => ({}), updateOne: async () => ({}), deleteMany: async () => ({}), deleteOne: async () => ({}) };
  if (id.endsWith('botConfigCache')) return { get: async (k, d) => d, set: async () => {}, clear: () => {}, refresh: async () => {} };
  return orig.apply(this, arguments);
};

const ch = require('../src/bot/caseHandler');
ch.loadCases();
const nc = require('../src/bot/nativeCommands');
const pkg = {
  ...require('../src/bot/packages/interactions'),
  ...require('../src/bot/packages/family'),
  ...require('../src/bot/packages/economy'),
  ...require('../src/bot/packages/games'),
  ...require('../src/bot/packages/cheats'),
};
const sd = require('../src/bot/submenuData');

const tem = (cmd) => ch.CASES.has(cmd) || typeof nc[cmd] === 'function' || typeof pkg[cmd] === 'function';

const allCmds = [...ch.CASES.keys()];
const subs = sd.getAllSubmenus(allCmds);

console.log('════════════════════════════════════════════════════');
console.log('SUBMENUS (' + Object.keys(subs).length + ')');
console.log('════════════════════════════════════════════════════');

let problemasItens = 0;
let totalSel = 0;
let selSemHandler = 0;

for (const [cat, meta] of Object.entries(subs)) {
  let nSel = 0, nMortos = 0;
  for (const it of meta.items) {
    if (!tem(it.cmd)) { nMortos++; problemasItens++; }
    if (it.sel) { nSel++; totalSel++; if (!tem(it.cmd)) selSemHandler++; }
  }
  const flag = nMortos ? '  ⚠️ ' + nMortos + ' sem handler!' : '';
  console.log(`  ${cat.padEnd(14)} itens=${String(meta.items.length).padStart(3)}  sel=${String(nSel).padStart(3)}${flag}`);
}

console.log('');
console.log('────────────────────────────────────────────────────');
console.log(`Acções directas (sel): ${totalSel}`);
console.log(`  • sel SEM handler: ${selSemHandler} ${selSemHandler ? '❌' : '✅'}`);
console.log(`Itens totais sem handler: ${problemasItens} ${problemasItens ? '❌' : '✅'}`);
console.log('────────────────────────────────────────────────────');

// ── 3. Comandos no SEL_PATTERNS que não existem em lado nenhum ──
console.log('');
console.log('SEL_PATTERNS órfãos (padrão marca "acção directa" mas sem handler):');
const selRe = sd.SEL_PATTERNS || [];
let orfaos = 0;
for (const re of selRe) {
  const src = String(re);
  const m = src.match(/\^([a-zA-Z0-9-]+)\$/);
  if (!m) continue;
  const cmd = m[1];
  if (!tem(cmd) && !tem(cmd.replace(/-/g, ''))) {
    orfaos++;
    console.log('  ❌ ' + cmd);
  }
}
console.log(orfaos === 0 ? '  ✅ nenhum órfão' : `  (${orfaos} órfãos)`);

process.exit(problemasItens === 0 ? 0 : 1);
