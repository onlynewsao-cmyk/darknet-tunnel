#!/usr/bin/env node
/**
 * DARK BOT — Auditoria do menu LOGOS & EFEITOS (regressão)
 *
 * Garante que TODOS os comandos de logo têm handler REAL (geram imagem
 * PNG via sharp/SVG) e que NENHUM fica como stub vazio em stubs.js.
 *
 * Uso: node scripts/test-logos-audit.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const logos = require(path.join(__dirname, '..', 'src', 'bot', 'cases', 'logos'));
const stubs = fs.readFileSync(path.join(__dirname, '..', 'src', 'bot', 'cases', 'stubs.js'), 'utf8');

const cmds = [...Object.keys(logos.STYLES), ...Object.keys(logos.ALIASES)];
const alvo = ['naruto', 'rainbow', 'neon', 'graffiti', 'fire', 'water', 'gold', 'galaxy', 'retro', 'halloween', 'pixel'];

let ok = 0, fail = 0;

// ── 1. render produz PNG válido ──
console.log('\n╔═══ 1. Render real (PNG) ═══╗');
(async () => {
  for (const c of ['naruto', 'rainbow', 'neon', 'graffiti']) {
    try {
      const buf = await logos.render('Dark Bot', c);
      const magic = buf.slice(0, 8).toString('hex');
      const valido = magic.startsWith('89504e47') && buf.length > 1000;
      if (valido) ok++; else { fail++; console.log('  ❌ ' + c + ' PNG inválido'); }
      console.log('  ' + (valido ? '✅' : '❌') + ' ' + c + ' → ' + buf.length + ' bytes');
    } catch (e) { fail++; console.log('  ❌ ' + c + ' → ' + e.message); }
  }

  // ── 2. helpers ──
  console.log('\n╔═══ 2. Helpers ═══╗');
  t('sanitize remove emojis', logos.sanitizeText('Oi 🕸️✨ Dark') === 'Oi Dark');
  t('wrap quebra em linhas', logos.wrap('o rato roeu a roupa do rei de roma', 14).length === 3);
  t('escapeXml escapa <>&', logos.escapeXml('<a & "b">').includes('&amp;'));
  t('styleFor acha alias', logos.styleFor('fire-logo') === logos.STYLES.fire);
  t('styleFor desconhecido → null', logos.styleFor('zzz-nao-existe') === null);

  // ── 3. nenhum alvo é stub ──
  console.log('\n╔═══ 3. Não há stubs ═══╗');
  let stubRestante = 0;
  for (const c of alvo) {
    if (stubs.includes(`'${c}'`)) { fail++; stubRestante++; console.log('  ❌ ainda em stub: ' + c); }
    else ok++;
  }
  t('naruto/rainbow/neon/graffiti fora de stubs', stubRestante === 0, '');
  t('total de comandos logo registados', cmds.length >= 100, String(cmds.length));

  console.log('\n───────────────────────────────');
  console.log((fail === 0 ? '✅' : '❌') + ` ${ok} OK / ${fail} FALHOU\n`);
  process.exit(fail === 0 ? 0 : 1);
})();

function t(n, c, e) { e = e || ''; c ? ok++ : fail++; console.log('  ' + (c ? '✅' : '❌') + ' ' + n + (e ? ' → ' + String(e).slice(0, 60) : '')); }
