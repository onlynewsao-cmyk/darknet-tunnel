#!/usr/bin/env node
'use strict';

const sly = require('../src/bot/stickerly');
let failed = 0;
function ok(name, cond, extra = '') {
  if (cond) console.log('  ✅', name);
  else { failed++; console.log('  ❌', name, extra); }
}

(async () => {
  console.log('test-stickerly-search (live)');
  ok('wantsAnimated gif', sly.wantsAnimated('Neymar gif'));
  ok('wantsAnimated animado', sly.wantsAnimated('gato animado'));
  ok('wantsAnimated no', !sly.wantsAnimated('Neymar'));

  const packs = await sly.searchPacks('neymar', { size: 20 });
  ok('pesquisa neymar devolve packs', packs.length >= 5, 'got ' + packs.length);
  ok('tem pack animado na pesquisa', packs.some((p) => p.isAnimated), packs.slice(0, 4).map((p) => p.title).join(' | '));
  ok('pack tem id + prefixo ou url', packs[0] && packs[0].id && (packs[0].url || packs[0].resourceUrlPrefix));

  const picked = sly.pickWide(packs, 'neymar');
  ok('pickWide mistura', picked.length >= 2);
  ok('pickWide inclui animado se existir', !packs.some((p) => p.isAnimated) || picked.some((p) => p.isAnimated));

  const animOnly = await sly.searchPacks('neymar gif', { size: 15, animatedOnly: false });
  ok('pesquisa gif também encontra', animOnly.length >= 1, 'got ' + animOnly.length);

  const detail = await sly.getPack(packs[0].id);
  ok('getPack stickers', detail.stickers.length >= 5, 'got ' + detail.stickers.length);
  ok('sticker tem url https', /^https?:\/\//i.test(detail.stickers[0].url));

  const collected = await sly.collectStickers('neymar', { limit: 8 });
  ok('collectStickers junta vários', collected.stickers.length >= 4, 'got ' + collected.stickers.length);
  ok('collect reporta totalFound', collected.totalFound >= 5);

  if (failed) {
    console.log('\nFALHOU:', failed);
    process.exit(1);
  }
  console.log('\nOK  —  0 falhas');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
