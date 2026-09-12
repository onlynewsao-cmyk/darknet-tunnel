#!/usr/bin/env node
/**
 * DARK BOT — Auditoria do menu INTERAÇÕES & FAMÍLIA (regressão)
 *
 * Garante que TODOS os comandos do submenu têm handler real
 * (case / native / package) — palavra inteira em cases+packages
 * (excepto stubs) ou método nativo.
 *
 * Uso: node scripts/test-interacoes-audit.js
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

const lista = 'abracar abracarrpg abraco aceitar aceitarconvite aceitarinvocacao adotar adotaruser amaldicoar ameme bater baterrpg beijar beijarb beijarrpg beijo beijob bencao brincadeira brincadeiras bullying cafe cafezinho cafune cantar casal casamento casar cat chocolate chorar chutar comer convidar crente criarcla cuidar cuspir dancar declarar denunciar deserdar desistir divorciar dog dormir envenenar equippet espancar esposa estender estudar eventos evolve experimentar explodir expulsar facada feed flertar fofocar gifreact goza gozar hallobat highfive historicotraicao lamber lambida malucao mamada mamar mata matar mimimi missoes morder mordida namorar namoro negrito paparico pedir pensar pequeno petbattle petbet petnome pickup polo pontape programar proteger recusar recusarconvite recusarinvocacao relacionamento renamepet revelar rir rmconvite sexo socar soco suic suicidio surubao tapa tapar telefone terminar timido tiro tomate train trair treinar treinarpet unequippet vote wave'.split(' ');

let ok = 0, fail = 0;
const mortos = [];
for (const c of lista) {
  if (reais.has(c.toLowerCase())) ok++; else { fail++; mortos.push(c); }
}

console.log(`\n💕 INTERAÇÕES & FAMÍLIA: ${ok}/${lista.length} comandos com handler real\n`);
if (mortos.length) {
  console.log('❌ Sem handler (mortos):');
  mortos.forEach(c => console.log('   - ' + c));
  process.exit(1);
}
console.log('✅ Nenhum comando de INTERAÇÕES & FAMÍLIA está morto.\n');
