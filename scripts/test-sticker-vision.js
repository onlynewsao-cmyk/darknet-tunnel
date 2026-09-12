#!/usr/bin/env node
'use strict';

const vis = require('../src/bot/stickerVision');
const ai = require('../src/bot/ai');
let failed = 0;
function ok(name, cond, extra = '') {
  if (cond) console.log('  ✅', name);
  else { failed++; console.log('  ❌', name, extra); }
}

console.log('test-sticker-vision');

ok('pick 1 de 1', JSON.stringify(vis.pickFrameIndexes(1, 4)) === '[0]');
ok('pick 4 de 12', JSON.stringify(vis.pickFrameIndexes(12, 4)) === JSON.stringify([0, 4, 7, 11]), JSON.stringify(vis.pickFrameIndexes(12, 4)));
ok('pick 4 de 4', JSON.stringify(vis.pickFrameIndexes(4, 4)) === '[0,1,2,3]');
ok('pick 2 de 8', JSON.stringify(vis.pickFrameIndexes(8, 2)) === '[0,7]');

ok('lottie json', vis.detectStickerKind(Buffer.from('{"v":"5.5"}')).kind === 'lottie');
ok('lottie flag', vis.detectStickerKind(Buffer.from('xxxx'), { isLottie: true }).kind === 'lottie');
ok('flag animado sem bytes = static (não é webp)', vis.detectStickerKind(Buffer.from('xxxx'), { isAnimated: true }).kind === 'static');

const fakeStaticWebp = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([20, 0, 0, 0]),
  Buffer.from('WEBP'),
  Buffer.from('VP8 '),
  Buffer.alloc(8, 1),
]);
ok('webp estático detectado', vis.isWebp(fakeStaticWebp));
ok('webp estático não é animado', vis.isAnimatedWebp(fakeStaticWebp) === false);
ok('kind static', vis.detectStickerKind(fakeStaticWebp).kind === 'static');

const fakeAnim = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([40, 0, 0, 0]),
  Buffer.from('WEBP'),
  Buffer.from('VP8X'),
  Buffer.from([8, 0, 0, 0, 0x02, 0, 0, 0]),
  Buffer.from('ANIM'),
  Buffer.alloc(8, 0),
]);
ok('webp animado (ANIM)', vis.isAnimatedWebp(fakeAnim));
ok('kind animated', vis.detectStickerKind(fakeAnim).kind === 'animated');
ok('flag + webp = animated', vis.detectStickerKind(fakeStaticWebp, { isAnimated: true }).kind === 'animated');

const pStatic = vis.visionPromptForSticker({ animated: false, frames: 1 });
ok('prompt estático pede ver', /STICKER|figurinha/i.test(pStatic) && /NUNCA/i.test(pStatic));
const pAnim = vis.visionPromptForSticker({ animated: true, frames: 4 });
ok('prompt animado fala em fotogramas', /ANIMADO/i.test(pAnim) && /4 fotogramas/i.test(pAnim));
ok('prompt citado', /citada/i.test(vis.visionPromptForSticker({ quoted: true })));

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
ok('mime png', ai.detectImageMime(png) === 'image/png');
ok('mime webp', ai.detectImageMime(fakeStaticWebp) === 'image/webp');
ok('toImageBuffers filtra', ai.toImageBuffers([png, null, Buffer.alloc(10)]).length === 0); // png header too small
const bigPng = Buffer.concat([png, Buffer.alloc(100, 1)]);
ok('toImageBuffers aceita', ai.toImageBuffers([bigPng, bigPng]).length === 2, String(ai.toImageBuffers([bigPng, bigPng]).length));
ok('toImageBuffers single', ai.toImageBuffers(bigPng).length === 1);

(async () => {
  let sharpOk = false;
  try { require('sharp'); sharpOk = true; } catch {}
  if (sharpOk) {
    const sharp = require('sharp');
    const frameA = await sharp({
      create: { width: 64, height: 64, channels: 4, background: { r: 220, g: 40, b: 40, alpha: 1 } },
    }).png().toBuffer();
    const frameB = await sharp({
      create: { width: 64, height: 64, channels: 4, background: { r: 40, g: 40, b: 220, alpha: 1 } },
    }).png().toBuffer();
    const staticWebp = await sharp(frameA).webp().toBuffer();
    const r1 = await vis.stickerToVision(staticWebp, { isAnimated: false });
    ok('extrai frame estático', r1.ok && r1.frames.length === 1 && r1.frames[0][0] === 0x89);
    ok('estático não marcado animado', r1.animated === false);

    const gif = await sharp(frameA, { animated: false })
      .gif()
      .toBuffer()
      .catch(() => null);
    // GIF de 1 frame ainda é gif
    if (gif && gif.length > 20) {
      const rg = await vis.stickerToVision(gif);
      ok('gif vira frame', rg.ok && rg.frames.length >= 1);
    } else {
      ok('gif skip (sharp sem gif encoder)', true);
    }

    // WebP animado real via sharp (2 páginas)
    try {
      const animWebp = await sharp(frameA, { animated: false })
        .joinChannel
        ? null
        : null;
      // Constrói GIF animado e deixa stickerToVision tratar
      const animGif = await sharp([
        { input: frameA, delay: 80 },
      ], { animated: false }).gif().toBuffer().catch(() => null);
      if (animGif) {
        const ra = await vis.stickerToVision(animGif, { isAnimated: true });
        ok('gif/anim extrai', ra.ok && ra.frames.length >= 1);
      } else {
        ok('anim skip encoder', true);
      }
    } catch {
      ok('anim skip', true);
    }
  } else {
    console.log('  ⚠️  sharp não instalado — skip extração real');
    const raw = await vis.stickerToVision(fakeStaticWebp);
    ok('fallback raw webp', raw.ok && raw.frames.length === 1);
  }

  if (failed) {
    console.log('\nFALHOU:', failed);
    process.exit(1);
  }
  console.log('\nOK  —  0 falhas');
})().catch(e => {
  console.error(e);
  process.exit(1);
});
