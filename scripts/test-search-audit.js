#!/usr/bin/env node
/**
 * DARK BOT — Auditoria do menu SEARCH & STALK (regressão)
 *
 * Garante que TODOS os comandos do submenu têm handler real.
 * Normaliza acentos (mangá ≡ manga) antes de comparar.
 *
 * Uso: node scripts/test-search-audit.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', 'src', 'bot');

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

function collectCommands() {
  const palavras = new Set();
  for (const d of ['cases', 'packages']) {
    for (const f of fs.readdirSync(path.join(ROOT, d))) {
      if (!f.endsWith('.js')) continue;
      if (d === 'cases' && f === 'stubs.js') continue;
      let src; try { src = fs.readFileSync(path.join(ROOT, d, f), 'utf8'); } catch { continue; }
      const re = /[a-zA-Z\u00C0-\u024F][a-zA-Z0-9_\u00C0-\u024F-]{0,30}/g;
      let m;
      while ((m = re.exec(src)) !== null) palavras.add(norm(m[0]));
    }
  }
  {
    const src = fs.readFileSync(path.join(ROOT, 'caseHandler.js'), 'utf8');
    const re = /[a-zA-Z\u00C0-\u024F][a-zA-Z0-9_\u00C0-\u024F-]{0,30}/g;
    let m;
    while ((m = re.exec(src)) !== null) palavras.add(norm(m[0]));
  }
  const nc = fs.readFileSync(path.join(ROOT, 'nativeCommands.js'), 'utf8');
  const ncRe = /^\s*async\s+([a-zA-Z0-9_]+)\s*\(/gm; let m2;
  while ((m2 = ncRe.exec(nc)) !== null) palavras.add(norm(m2[1]));
  return palavras;
}

const reais = collectCommands();

const lista = 'anime anime2 animeapi animebr animedl animedub animeepisodios animeeps apps aptoide buscalivro capitulo cep cnpj deepsearch episodiosanime filme gethtml ghstalk githubstalk gitubstalk google idcanal instastalk ip ipinfo lercap lermanga manga mangacap mangá movie noticias pesquisar procurar rbxcodes robloxcodes search stalkff stalkinsta stalktk tikstalk ttstalk wiki wikipedia'.split(' ');

let ok = 0, fail = 0;
const mortos = [];
for (const c of lista) {
  if (reais.has(norm(c))) ok++; else { fail++; mortos.push(c); }
}

console.log(`\n🔎 SEARCH & STALK: ${ok}/${lista.length} comandos com handler real\n`);
if (mortos.length) {
  console.log('❌ Sem handler (mortos):');
  mortos.forEach(c => console.log('   - ' + c));
  process.exit(1);
}
console.log('✅ SEARCH & STALK completo.\n');
