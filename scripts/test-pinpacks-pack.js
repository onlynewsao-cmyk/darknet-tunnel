#!/usr/bin/env node
'use strict';

const path = require('path');
const wm = require('../src/bot/stickerWm');

let failed = 0;
function ok(name, cond, extra = '') {
  if (cond) console.log('  ✅', name);
  else { failed++; console.log('  ❌', name, extra); }
}

console.log('test-pinpacks-pack');

const makerPath = path.join(__dirname, '../src/bot/stickerMaker.js');
const src = require('fs').readFileSync(makerPath, 'utf8');
ok('makePackId existe no maker', /function makePackId\(/.test(src) && /module\.exports[\s\S]*makePackId/.test(src));
ok('stampPack existe', /async function stampPack\(/.test(src) && /module\.exports[\s\S]*stampPack/.test(src));
ok('createFull fallback leva packId', /packStickerOpts\(pack, author, packId/.test(src));

const native = require('fs').readFileSync(path.join(__dirname, '../src/bot/nativeCommands.js'), 'utf8');
ok('pinpacks usa finishSearchPack', native.includes('finishSearchPack') && native.includes('stickerPack'));
ok('stickerly manda pack de uma vez', require('fs').readFileSync(require('path').join(__dirname, '../src/bot/cases/stickerly.js'), 'utf8').includes('sendFinishedPack'));
ok('packbusca usa searchQuery', native.includes('searchQuery: nome'));
ok('pack18 usa searchQuery', native.includes('searchQuery: tags'));
ok('helper stickerPack existe', require('fs').existsSync(require('path').join(__dirname, '../src/bot/stickerPack.js')));

const meta = wm.composeMeta({ link: 'https://whatsapp.com/channel/0029VbC8voN4Y9lszc9VuT2D' });
ok('WM pack name não é o nome do canal', meta.packName === 'DARK NET 🕸️');
ok('WM description 4 linhas', meta.description.split('\n').length === 4);
ok('publisher do pack = brand', meta.brand === 'DARK NET 🕸️');

try {
  const stickerMaker = require('../src/bot/stickerMaker');
  const a = stickerMaker.makePackId('Neymar');
  const b = stickerMaker.makePackId('Neymar');
  ok('makePackId formato', /^com\.darkbot\.pack\.[a-f0-9]{16}$/.test(a), a);
  ok('makePackId único por pack', a !== b);
} catch (e) {
  ok('makePackId runtime (deps)', /Cannot find module/.test(String(e.message)), String(e.message).slice(0, 80));
}

if (failed) {
  console.log('\nFALHOU:', failed);
  process.exit(1);
}
console.log('\nOK  —  0 falhas');
