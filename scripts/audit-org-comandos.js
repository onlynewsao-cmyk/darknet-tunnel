#!/usr/bin/env node
/**
 * AUDITORIA DE ORGANIZAÇÃO DOS COMANDOS
 * 1. Todos os comandos registados (cases + nativos + pacotes)
 * 2. Em que submenu cada um CAI (categorize do submenuData)
 * 3. Divergências com o commandCatalog (dashboard)
 * 4. Comandos com pinta de estar no submenu ERRADO (heurísticas)
 * 5. Comandos anunciados pelo catálogo do dashboard SEM handler
 */
'use strict';
process.env.OWNER_NUMBER = '244945280380';
process.env.BOT_NUMBER = '244949926074';

const sd = require('../src/bot/submenuData');
const catalog = require('../src/bot/commandCatalog');
const ch = require('../src/bot/caseHandler');
try { ch.loadCases?.(); } catch {}
try { ch.init?.(); } catch {}
const nativeCommands = require('../src/bot/nativeCommands');
const packageCommands = {
  ...require('../src/bot/packages/interactions'),
  ...require('../src/bot/packages/family'),
  ...require('../src/bot/packages/economy'),
  ...require('../src/bot/packages/games'),
  ...require('../src/bot/packages/cheats'),
};

const registrados = new Set([
  ...ch.CASES.keys(),
  ...Object.keys(nativeCommands),
  ...Object.keys(packageCommands),
]);

const CATS = Object.keys(sd.SUBMENU_META || {});
console.log('Categorias de submenu (SUBMENU_META):', CATS.join(', '));
console.log('Comandos registados:', registrados.size);

// 1) onde cada comando cai
const porCategoria = {};
for (const cmd of registrados) {
  let cat;
  try { cat = sd.categorize(cmd); } catch (e) { cat = 'ERRO:' + e.message; }
  (porCategoria[cat] = porCategoria[cat] || []).push(cmd);
}
console.log('\n=== DISTRIBUIÇÃO ===');
for (const [c, cmds] of Object.entries(porCategoria).sort((a, b) => b[1].length - a[1].length)) {
  const fora = !CATS.includes(c) ? '  ⚠️ FORA DO SUBMENU_META' : '';
  console.log(`  ${c}: ${cmds.length}${fora}`);
}

// 2) comandos que caem em categorias sem submenu (invisíveis/órfãos)
const orfaos = [];
for (const [c, cmds] of Object.entries(porCategoria)) {
  if (!CATS.includes(c)) orfaos.push(...cmds.map(x => `${x} → ${c}`));
}
console.log('\n=== ÓRFÃOS (categoria sem submenu) ===');
console.log(orfaos.length ? orfaos.join('\n') : 'nenhum');

// 3) catálogo do dashboard vs realidade
const catList = catalog.getAll ? catalog.getAll() : (catalog.CATALOG || []);
console.log('\n=== CATÁLOGO DO DASHBOARD ===');
console.log('Entradas no catálogo:', catList.length);
const semHandler = catList.filter(c => !registrados.has(c.name));
console.log('⚠️ Comandos no catálogo SEM handler (dashboard anuncia o que não funciona):', semHandler.length);
semHandler.slice(0, 60).forEach(c => console.log('   ❌', c.name, '→', c.category));

// 4) divergência catálogo vs submenuData
const diverg = [];
for (const c of catList) {
  if (!registrados.has(c.name)) continue;
  const noMenu = sd.categorize(c.name);
  if (noMenu !== c.category) diverg.push({ cmd: c.name, catalogo: c.category, submenu: noMenu });
}
console.log('\n=== DIVERGÊNCIA catálogo vs submenu ===');
console.log('Total divergente:', diverg.length);
diverg.slice(0, 120).forEach(d => console.log(`   ⚠️ ${d.cmd}: catálogo=${d.catalogo} | submenu=${d.submenu}`));

// 5) heurísticas de submenu errado
const H = [
  [/^(bass|grave|reverb|8d|slowed|nightcore|vibrato|esquilo|sq|deep|slowmo|fade|flanger|phaser|tremolo|reverse|karaoke|estadio|radio|chipmunk|monster|robot|voz|audiofx|audiomeme)/, 'audio', 'efeito de áudio'],
  [/logo$/, 'logos', 'estilo de logo'],
  [/^(fig|s$|sticker|take|wm)/, 'stickers', 'figurinha'],
];
console.log('\n=== HEURÍSTICAS (possíveis mal-colocados) ===');
let n = 0;
for (const cmd of registrados) {
  const onde = sd.categorize(cmd);
  for (const [re, catIdeal, porq] of H) {
    if (re.test(cmd) && onde !== catIdeal && onde !== 'owner') {
      if (n++ < 60) console.log(`   ⚠️ ${cmd} (${porq}) está em '${onde}', devia estar em '${catIdeal}'`);
    }
  }
}
console.log(n ? `(${n} suspeitos)` : 'nenhum suspeito');

// 6) stubs.js — ainda tem stub?
const fs = require('fs');
const stubsSrc = fs.readFileSync(require.resolve('../src/bot/cases/stubs.js'), 'utf8');
const nStubs = (stubsSrc.match(/registerCase\(/g) || []).length;
console.log('\n=== STUBS ===');
console.log('registerCase em stubs.js:', nStubs, nStubs ? '⚠️ AINDA HÁ STUBS' : '✅ limpo');

// ── VEREDICTO ─────────────────────────────────────────────────
// Falha dura: dashboard a anunciar comandos que não existem, ou
// comandos fora de qualquer submenu que não sejam 18+ (menu18).
const falhaFantasmas = semHandler.length;
const falhaOrfaos = orfaos.filter(x => !x.endsWith('→ 18')).length;
console.log('\n══════════════════════════════════════════');
if (falhaFantasmas || falhaOrfaos || nStubs) {
  console.log(`❌ ORG COMANDOS: ${falhaFantasmas} fantasmas no catálogo, ${falhaOrfaos} órfãos, ${nStubs} stubs`);
  process.exit(1);
}
console.log('✅ ORG COMANDOS OK — catálogo sem fantasmas, sem órfãos, sem stubs');
process.exit(0);
