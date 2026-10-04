#!/usr/bin/env node
'use strict';
/** Regressão: duração MP4 e validação antes de enviar ao WhatsApp. */
const assert = require('assert');
const video = require('../src/bot/videoCompat');

// MP4 mínimo de teste com atom mvhd v0: timescale 1000, duração 170s.
const good = Buffer.alloc(96);
good.writeUInt32BE(24, 0);
good.write('ftyp', 4, 'ascii');
good.write('isom', 8, 'ascii');
good.writeUInt32BE(56, 24);
good.write('mvhd', 28, 'ascii');
good[32] = 0;
good.writeUInt32BE(1000, 44);
good.writeUInt32BE(170000, 48);

try {
  assert(video.isMp4(good), 'reconhece contentor MP4');
  assert.strictEqual(video.durationFromMp4(good), '2:50', 'lê duração do próprio ficheiro');
  assert.strictEqual(video.formatDuration(3661), '1:01:01', 'formata duração longa');
  assert(!video.isMp4(Buffer.from('<html>erro</html>')), 'rejeita página HTML do provider');
  console.log('✓ Vídeo WhatsApp: MP4 validado e duração 2:50 preservada.');
} catch (err) {
  console.error('✗ Vídeo WhatsApp:', err.stack || err);
  process.exit(1);
}
