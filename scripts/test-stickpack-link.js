#!/usr/bin/env node
'use strict';

const maker = require('../src/bot/stickerMaker');
const wm = require('../src/bot/stickerWm');

let failed = 0;
function ok(name, cond, extra = '') {
  if (cond) console.log('  ✅', name);
  else { failed++; console.log('  ❌', name, extra); }
}

console.log('test-stickpack-link');

const a = maker.makePackId('https://whatsapp.com/channel/AAA');
const b = maker.makePackId('https://whatsapp.com/channel/AAA');
const c = maker.makePackId('https://whatsapp.com/channel/BBB');
ok('pack id estável', a === b && a.startsWith('com.darkbot.pack.'));
ok('pack id muda com o seed', a !== c);

const exif = maker.buildStickerExifJson({
  packId: a,
  pack: 'Minecraft',
  author: 'DARK NET 🕸️',
  url: 'https://whatsapp.com/channel/0029VbC8voN4Y9lszc9VuT2D',
});
ok('store android', exif['android-app-store-link'].includes('whatsapp.com/channel/'));
ok('store ios = android', exif['ios-app-store-link'] === exif['android-app-store-link']);
ok('play store alias', exif['android-play-store-link'] === exif['android-app-store-link']);
ok('publisher website', exif['sticker-pack-publisher-website'].includes('channel'));
ok('pack id no exif', exif['sticker-pack-id'] === a);
ok('publisher no exif é uma linha', !String(exif['sticker-pack-publisher']).includes('\n'));

const meta = wm.composeMeta({ link: 'https://whatsapp.com/channel/0029VbC8voN4Y9lszc9VuT2D' });
ok('compose tem packUrl', meta.packUrl.includes('0029VbC8voN4Y9lszc9VuT2D'));
ok('compose tem packId estável', meta.packId === maker.makePackId(meta.packUrl));

const off = wm.composeSearchPack('Neymar', null);
ok('pesquisa sem marca: packUrl default', off.packUrl === wm.DEFAULT_PACK_URL);
ok('pesquisa sem marca: packId do nome', off.packId === maker.makePackId('Neymar'));

const on = wm.composeSearchPack('Neymar', {
  enabled: true,
  brand: 'DARK NET 🕸️',
  channelUrl: 'https://chat.whatsapp.com/AbCdEfGhIjKl',
  packUrl: 'https://chat.whatsapp.com/AbCdEfGhIjKl',
  packId: maker.makePackId('https://chat.whatsapp.com/AbCdEfGhIjKl'),
  description: 'DARK NET 🕸️\nO melhor canal do mundo\nhttps://chat.whatsapp.com/AbCdEfGhIjKl\nSiga o canal',
});
ok('pesquisa+marca: link do grupo no packUrl', on.packUrl.includes('chat.whatsapp.com/AbCdEfGhIjKl'));

(async () => {
  const applied = await wm.apply({
    skipGroupWm: true,
    packName: 'X',
    remoteJid: '120@g.us',
  });
  ok('skipGroupWm ainda mete packUrl', !!applied.packUrl && applied.packUrl.startsWith('http'));
  ok('skipGroupWm ainda mete packId', !!applied.packId);

  if (failed) { console.log('\nFALHOU:', failed); process.exit(1); }
  console.log('\nOK  —  0 falhas');
})().catch((e) => { console.error(e); process.exit(1); });
