#!/usr/bin/env node
/**
 * DARK BOT — Auditoria do menu EFEITOS DE ÁUDIO (regressão)
 *
 * Garante que TODOS os efeitos do submenu têm handler real:
 *   • 50 efeitos ffmpeg em audioAdmin2.js (AUDIO_FILTERS + loop)
 *   • audiofx → dispatcher nativo
 *   • audiomeme → nativo (MyInstants + fallback)
 *
 * Uso: node scripts/test-audio-audit.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', 'src', 'bot');

const src = fs.readFileSync(path.join(ROOT, 'cases', 'audioAdmin2.js'), 'utf8');
const m = src.match(/const AUDIO_FILTERS = \{([\s\S]*?)\n\};/);
if (!m) { console.error('❌ AUDIO_FILTERS não encontrado'); process.exit(1); }
const filtros = new Set(
  [...m[1].matchAll(/(?:^|,\s*|\n\s*)('?[a-z0-9]+'?)\s*:/g)].map(x => x[1].replace(/'/g, ''))
);

const nc = fs.readFileSync(path.join(ROOT, 'nativeCommands.js'), 'utf8');
const temNativo = (fn) => new RegExp('async\\s+' + fn + '\\s*\\(').test(nc);

const lista = '8d 8d2 8d3 audiofx audiomeme bass bass2 bass3 blown cave chipmunk chorus chorus2 chorus3 deep earrape echo fast fat flanger grave grave2 grave3 hardcore karaoke lofi monster nightcore phaser pitch radio reverb reverb2 reverb3 reverse robot slow slowed slowed2 slowed3 slowedreverb slowedreverb2 slowedreverb3 smooth squirrel stadium telephone tremolo underwater vaporwave vibrato whisper'.split(' ');

let ok = 0, fail = 0;
const mortos = [];
for (const c of lista) {
  const tem = filtros.has(c) || temNativo(c);
  if (tem) ok++; else { fail++; mortos.push(c); }
}

console.log(`\n🎧 EFEITOS DE ÁUDIO: ${ok}/${lista.length} comandos com handler real\n`);
if (mortos.length) {
  console.log('❌ Sem handler:');
  mortos.forEach(c => console.log('   - ' + c));
  process.exit(1);
}

// audiomeme NÃO pode depender só da API morta (systemzone)
const amIdx = nc.indexOf('async audiomeme(');
const amBody = nc.slice(amIdx, amIdx + 1200);
const usaMyinstants = amBody.includes('myinstants');
console.log(usaMyinstants ? '  ✅ audiomeme usa MyInstants (vivo)' : '  ❌ audiomeme sem MyInstants');
if (!usaMyinstants) fail++; else ok++;

console.log('\n───────────────────────────────');
console.log((fail === 0 ? '✅' : '❌') + ` ${ok} OK / ${fail} FALHOU\n`);
process.exit(fail === 0 ? 0 : 1);
