#!/usr/bin/env node
'use strict';

const pin = require('../src/bot/pinterestSearch');
let failed = 0;
function ok(name, cond, extra = '') {
  if (cond) console.log('  ✅', name);
  else { failed++; console.log('  ❌', name, extra); }
}

console.log('test-pinterest-pin');

const a = pin.parsePinArgs('Messi|vídeo');
ok('Messi|vídeo → video', a.type === 'video' && /messi/i.test(a.query), JSON.stringify(a));

const b = pin.parsePinArgs('gatos |6|vídeo');
ok('gatos |6|vídeo', b.type === 'video' && b.limit === 6 && /gatos/i.test(b.query), JSON.stringify(b));

const c = pin.parsePinArgs('gatos |imagem');
ok('gatos |imagem', c.type === 'image', JSON.stringify(c));

const d = pin.parsePinArgs('Messi video');
ok('Messi video sem |', d.type === 'video', JSON.stringify(d));

const e = pin.parsePinArgs('gatos');
ok('gatos default image', e.type === 'image' && e.query === 'gatos');

ok('isVideo mp4', pin.isVideoItem({}, 'https://v1.pinimg.com/videos/mc/720p/aa.mp4'));
ok('not video jpg', !pin.isVideoItem({}, 'https://i.pinimg.com/originals/aa.jpg'));

const n = pin.normalize({ image_url: 'https://i.pinimg.com/736x/ab.jpg', description: 'x' });
ok('normalize image', n && n.type === 'image' && n.url.includes('pinimg'));

const nv = pin.normalize({ url: 'https://v1.pinimg.com/videos/mc/720p/x.mp4', type: 'video' });
ok('normalize video', nv && nv.type === 'video');

ok('normalize lixo', pin.normalize({ url: 'not-a-url' }) === null);

if (failed) {
  console.log('\nFALHOU:', failed);
  process.exit(1);
}
console.log('\nOK  —  0 falhas');
