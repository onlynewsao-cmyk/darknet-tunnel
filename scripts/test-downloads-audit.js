#!/usr/bin/env node
/**
 * DARK BOT — Auditoria do menu DOWNLOADS (regressão)
 *
 * Garante que TODOS os comandos do submenu DOWNLOADS têm handler real
 * (case / native / package) — nenhum fica "morto" ou a cair em stub.
 *
 * Uso: node scripts/test-downloads-audit.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const re = /registerCase\(\s*(\[[^\]]*\]|['"][^'"]+['"])\s*,/g;
function cmdsDe(f) {
  let src; try { src = fs.readFileSync(f, 'utf8'); } catch { return []; }
  const out = []; let m;
  while ((m = re.exec(src)) !== null) {
    const raw = m[1].trim();
    if (raw.startsWith('[')) { try { out.push(...JSON.parse(raw.replace(/'/g, '"'))); } catch { out.push(raw); } }
    else out.push(raw.replace(/['"]/g, ''));
  }
  return out.map(c => String(c).toLowerCase());
}

// handlers reais (cases excepto stubs + packages + nativeCommands)
const reais = new Set();
for (const f of fs.readdirSync(path.join(__dirname, '..', 'src', 'bot', 'cases'))) {
  if (!f.endsWith('.js') || f === 'stubs.js') continue;
  cmdsDe(path.join(__dirname, '..', 'src', 'bot', 'cases', f)).forEach(c => reais.add(c));
}
for (const f of fs.readdirSync(path.join(__dirname, '..', 'src', 'bot', 'packages'))) {
  if (f.endsWith('.js')) cmdsDe(path.join(__dirname, '..', 'src', 'bot', 'packages', f)).forEach(c => reais.add(c));
}
const nc = fs.readFileSync(path.join(__dirname, '..', 'src', 'bot', 'nativeCommands.js'), 'utf8');
const ncRe = /^\s*async\s+([a-zA-Z0-9_]+)\s*\(/gm; let m2;
while ((m2 = ncRe.exec(nc)) !== null) reais.add(m2[1].toLowerCase());

const lista = 'baixaraudio baixarvideo dlmp3 dlmp3s dlmp4 down downloads facebook fb fbfoto fbphoto fbpost fbset fbstatus fbstory fbvideo fhd fullhd gdrive gyt hq ig igstory instagram instamp3 instamp4 kwai letra mcplugin mediafire music music2 music3 musica myinstants pinmp4 pintemp3 pintemp4 pinterest pinterest2 pinvd play play2 play3 playhq playid playmax playvid playvid2 sc scdl shazam soundcloud sp spotify spotify2 tiktok tiktok2 tiktoksearch tiktokstalk tiktoktxt tomp3 tt ttk ttk2 ttks ttkstalk tts ttsearch tw twitter twitterdl vd vid vid2 video video2 videocall yt yt3v2 yt4 yt4k yt4v2 ytaudio ytd ytfhd ythd ytmp3 ytmp3s ytmp4 ytmp4hd ytmp4s ytplay4'.split(' ');

let ok = 0, fail = 0;
const mortos = [];
for (const c of lista) {
  const tem = reais.has(c.toLowerCase());
  if (tem) ok++; else { fail++; mortos.push(c); }
}

console.log(`\n📥 DOWNLOADS: ${ok}/${lista.length} comandos com handler real\n`);
if (mortos.length) {
  console.log('❌ Sem handler (mortos):');
  mortos.forEach(c => console.log('   - ' + c));
  process.exit(1);
}
console.log('✅ Nenhum comando de DOWNLOADS está morto.\n');
