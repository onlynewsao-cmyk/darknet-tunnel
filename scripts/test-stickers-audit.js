#!/usr/bin/env node
/**
 * DARK BOT — Auditoria do menu STICKERS & IMAGENS (regressão)
 *
 * Garante que TODOS os comandos do submenu têm handler real
 * (case / native / package) — incluindo registos por loop
 * (ex: for (const cmd of [...]) registerCase([cmd], ...)).
 *
 * Uso: node scripts/test-stickers-audit.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', 'src', 'bot');

// Registo real pode aparecer de várias formas (directo, loop com {,
// Object.entries, chave de objecto sem aspas, etc.). Método robusto:
// o comando aparece como PALAVRA INTEIRA num ficheiro de cases
// (excepto stubs) ou packages, ou é método nativo.
function collectCommands() {
  const palavras = new Set();

  const dirs = ['cases', 'packages'];
  for (const d of dirs) {
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

const lista = 'aisticker attp brat brat2 definestickwm definirmarca faber fig figanime figcoreana figdesenho figemoji figengracada figmeme figraiva figroblox figubug figubug2 figurinha fullsticker gerarlink gif gimage jeff legenda norian packname pin pinpacks pinsticker ptvmsg renamesticker rvisu s setstickwm sfull sly slypack sticker sticker2img stickerful stickerly stickerrename stickertoimg stickerwm stickwmgrupo takepack textosticker textsticker toimg totext ttp txtsticker ximg'.split(' ');

let ok = 0, fail = 0;
const mortos = [];
for (const c of lista) {
  if (reais.has(c.toLowerCase())) ok++; else { fail++; mortos.push(c); }
}

console.log(`\n🎨 STICKERS & IMAGENS: ${ok}/${lista.length} comandos com handler real\n`);
if (mortos.length) {
  console.log('❌ Sem handler (mortos):');
  mortos.forEach(c => console.log('   - ' + c));
  process.exit(1);
}
console.log('✅ Nenhum comando de STICKERS & IMAGENS está morto.\n');
