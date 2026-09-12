#!/usr/bin/env node
/**
 * DARK BOT — Encaminhamento dos menus (regressão)
 *
 * Garante que os botões do menu principal abrem a categoria certa:
 *   • INFO & STATS (menustatus) → info  (NÃO audio)
 *   • LOGOS & EFEITOS (menulogos) → logos (NÃO stickers)
 *   • AUDIO (menuaudio) → audio
 *   • FIGURINHAS (menufigurinhas) → stickers
 *
 * Uso: node scripts/test-menu-routing.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'bot', 'cases', 'dynamicSubmenus.js'), 'utf8');

let ok = 0, fail = 0;
const t = (n, c, e) => { e = e || ''; c ? ok++ : fail++; console.log('  ' + (c ? '✅' : '❌') + ' ' + n + (e ? ' → ' + e : '')); };

// Extrai o alvo de cada grupo registerCase
function targetOf(cmd) {
  // localiza `registerCase([...]` que contenha o comando e lê o `'categoria'` seguinte
  const re = /registerCase\(\s*\[([^\]]*)\],[\s\S]{0,200}?dynSub\(\s*\w+\s*,\s*\w+\s*,\s*\w+\s*,\s*\w+\s*,\s*'([a-z]+)'\s*\)/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const cmds = m[1].split(',').map(x => x.trim().replace(/['"]/g, ''));
    if (cmds.includes(cmd)) return m[2];
  }
  return null;
}

console.log('\n╔═══ Encaminhamento dos menus ═══╗');
t('menustatus → info', targetOf('menustatus') === 'info', targetOf('menustatus'));
t('menulogos → logos', targetOf('menulogos') === 'logos', targetOf('menulogos'));
t('menuaudio → audio', targetOf('menuaudio') === 'audio', targetOf('menuaudio'));
t('menufigurinhas → stickers', targetOf('menufigurinhas') === 'stickers', targetOf('menufigurinhas'));
t('menuia → ia', targetOf('menuia') === 'ia', targetOf('menuia'));
t('menujogos → jogos', targetOf('menujogos') === 'jogos', targetOf('menujogos'));
t('menueconomia → economia', targetOf('menueconomia') === 'economia', targetOf('menueconomia'));
t('menutexto → texto', targetOf('menutexto') === 'texto', targetOf('menutexto'));
t('menusearch → search', targetOf('menusearch') === 'search', targetOf('menusearch'));
t('menuzoeira → zoeira', targetOf('menuzoeira') === 'zoeira', targetOf('menuzoeira'));
t('menuadm → admin', targetOf('menuadm') === 'admin', targetOf('menuadm'));

// diagnostico existe em info.js
console.log('\n╔═══ Comando diagnóstico ═══╗');
const info = fs.readFileSync(path.join(__dirname, '..', 'src', 'bot', 'cases', 'info.js'), 'utf8');
t('diagnostico/diag registado em info.js', /registerCase\(\['diagnostico'[^)]*\]/.test(info), '');

// menustatus nativo tem ping + perfil + diagnostico
console.log('\n╔═══ Menustatus nativo (curated) ═══╗');
const nc = fs.readFileSync(path.join(__dirname, '..', 'src', 'bot', 'nativeCommands.js'), 'utf8');
const msIdx = nc.indexOf('async menustatus(');
const msBody = nc.slice(msIdx, msIdx + 1200);
t('contém ping', msBody.includes("'ping'"), '');
t('contém perfil', msBody.includes("'perfil'"), '');
t('contém diagnostico', msBody.includes("'diagnostico'"), '');

console.log('\n───────────────────────────────');
console.log((fail === 0 ? '✅' : '❌') + ` ${ok} OK / ${fail} FALHOU\n`);
process.exit(fail === 0 ? 0 : 1);
