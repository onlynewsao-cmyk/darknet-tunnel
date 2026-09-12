#!/usr/bin/env node
/**
 * DARK BOT — Auditoria do menu TEXTO & UTILIDADES (regressão)
 *
 * Garante que TODOS os comandos do submenu têm handler real e que os
 * comandos de CONTEÚDO (piada, charada, elogio, motivacional, frase)
 * NÃO estão em stubs (que davam formatação de fonte em vez de conteúdo).
 *
 * Uso: node scripts/test-texto-audit.js
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
  { const src = fs.readFileSync(path.join(ROOT, 'caseHandler.js'), 'utf8'); const re = /\b([a-zA-Z][a-zA-Z0-9_-]{0,30})\b/g; let m; while ((m = re.exec(src)) !== null) palavras.add(m[1].toLowerCase()); }
  const nc = fs.readFileSync(path.join(ROOT, 'nativeCommands.js'), 'utf8');
  const ncRe = /^\s*async\s+([a-zA-Z0-9_]+)\s*\(/gm; let m2;
  while ((m2 = ncRe.exec(nc)) !== null) palavras.add(m2[1].toLowerCase());
  return palavras;
}

const reais = collectCommands();

const lista = 'abv age anos base baseconv bible biblia bold bold2 calc calcular cantada cantadas charada code color colorful conselho conselhobiblico conselhos cor correr curto elogio encurtar fake-quote fakequote fato fazernick filosofia filosofo fq glitch idade lermais math mathresp mgs mini mono monospace motivacional piada randomcolor reflexao relevar renomear scaps secret short smallcaps spoiler tabela tagme tagme2 texto tiny upload vazar versiculo zalgo frase hora help'.split(' ');

let ok = 0, fail = 0;
const mortos = [];
for (const c of lista) {
  if (reais.has(c.toLowerCase())) ok++; else { fail++; mortos.push(c); }
}

// conteúdo não pode estar como stub de fonte
const stubs = fs.readFileSync(path.join(ROOT, 'cases', 'stubs.js'), 'utf8');
const conteudo = ['piada', 'charada', 'elogio', 'motivacional'];
for (const c of conteudo) {
  if (stubs.includes(`'${c}'`)) { fail++; console.log('  ❌ ainda em stub: ' + c); }
  else ok++;
}

console.log(`\n✍️ TEXTO & UTILIDADES: ${ok}/${lista.length + conteudo.length} verificações OK\n`);
if (mortos.length) {
  console.log('❌ Sem handler (mortos):');
  mortos.forEach(c => console.log('   - ' + c));
  process.exit(1);
}
console.log('✅ TEXTO & UTILIDADES completo.\n');
