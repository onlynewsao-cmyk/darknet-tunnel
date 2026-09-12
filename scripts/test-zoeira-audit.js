#!/usr/bin/env node
/**
 * DARK BOT — Auditoria do menu ZOEIRA & MEDIDORES (regressão)
 *
 * Garante que TODOS os medidores do submenu têm handler REAL com GIF
 * (percentage/alias em packages/interactions.js) e que NENHUM fica
 * como stub fake (hZ/hE) em stubs.js.
 *
 * Uso: node scripts/test-zoeira-audit.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const lista = 'atleta bebado2 burro2 ciumao desapegado doido dorminhoco2 feio2 fraco gay2 insone inveja invejosa invejoso lindo2 pecador pirocudo pirokudo possessivo sono sorte sortudo2 viciada viciadao viciado'.split(' ');

const interactions = require(path.join(__dirname, '..', 'src', 'bot', 'packages', 'interactions'));
const stubs = fs.readFileSync(path.join(__dirname, '..', 'src', 'bot', 'cases', 'stubs.js'), 'utf8');

let ok = 0, fail = 0;
const mortos = [];
for (const c of lista) {
  const temPkg = typeof interactions[c] === 'function';
  const temStub = stubs.includes(`'${c}'`);
  if (temPkg && !temStub) ok++;
  else { fail++; mortos.push(`${c} (pkg:${temPkg} stub:${temStub})`); }
}

console.log(`\n😂 ZOEIRA & MEDIDORES: ${ok}/${lista.length} medidores reais com GIF\n`);
if (mortos.length) {
  console.log('❌ Ainda em stub fake:');
  mortos.forEach(c => console.log('   - ' + c));
  process.exit(1);
}
console.log('✅ Nenhum medidor de ZOEIRA está em stub fake.\n');
