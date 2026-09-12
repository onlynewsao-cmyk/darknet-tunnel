#!/usr/bin/env node
/**
 * DARK BOT — Auditoria do menu DONO & SISTEMA (regressão)
 *
 * Garante que TODOS os comandos do submenu DONO têm handler real
 * (case / caseHandler interno / native / package) e que os comandos
 * INTERNOS (que começam por _) NÃO aparecem nos submenus.
 *
 * Uso: node scripts/test-dono-audit.js
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
  // caseHandler regista casos de gestão internamente (newcase, runcase, ...)
  {
    const src = fs.readFileSync(path.join(ROOT, 'caseHandler.js'), 'utf8');
    const re = /\b([a-zA-Z][a-zA-Z0-9_-]{0,30})\b/g;
    let m;
    while ((m = re.exec(src)) !== null) palavras.add(m[1].toLowerCase());
  }
  const nc = fs.readFileSync(path.join(ROOT, 'nativeCommands.js'), 'utf8');
  const ncRe = /^\s*async\s+([a-zA-Z0-9_]+)\s*\(/gm; let m2;
  while ((m2 = ncRe.exec(nc)) !== null) palavras.add(m2[1].toLowerCase());
  return palavras;
}

const reais = collectCommands();

const lista = 'adultapi adultmode adultsearch adultstats adultvideo antidelete audit auditcmds buscar18 buttonmode change cmdcheck cmdsocultos downcase e621 erome eromevid eval execcase fig18 figbusca figgif flood gif18 hentai hotchat kona listcmds livros18 maiscmds menu18 menumais mycases nekos newcase pack18 packbusca prefixos recarregarcases refreshcases reloadcases remcase removecase removicase runcase send sendgroup shell shorts18 showcase temas testcase testcasecode themechange themeglobal themes validarcase vercode verificarcmds xvideo xvideodl yande'.split(' ');

let ok = 0, fail = 0;
const mortos = [];
for (const c of lista) {
  if (reais.has(c.toLowerCase())) ok++; else { fail++; mortos.push(c); }
}

console.log(`\n👑 DONO & SISTEMA: ${ok}/${lista.length} comandos com handler real\n`);
if (mortos.length) {
  console.log('❌ Sem handler (mortos):');
  mortos.forEach(c => console.log('   - ' + c));
  process.exit(1);
}

// ── Comandos internos (_*) escondidos dos submenus ──
const sd = require(path.join(ROOT, 'submenuData'));
const internos = ['_adultSend', '__change_theme_handler__'];
const todosItems = sd.getAllSubmenus ? (() => {
  const caseHandler = require(path.join(ROOT, 'caseHandler'));
  const allCmds = [...caseHandler.CASES.keys()];
  const subs = sd.getAllSubmenus(allCmds);
  const names = new Set();
  for (const cat of Object.values(subs)) for (const it of cat.items) names.add(it.cmd);
  return names;
})() : new Set();

for (const it of internos) {
  const visivel = todosItems.has(it);
  if (visivel) { fail++; console.log('  ❌ interno visível no menu: ' + it); }
  else { ok++; console.log('  ✅ interno escondido: ' + it); }
}

console.log('\n───────────────────────────────');
console.log((fail === 0 ? '✅' : '❌') + ` ${ok} OK / ${fail} FALHOU\n`);
process.exit(fail === 0 ? 0 : 1);
