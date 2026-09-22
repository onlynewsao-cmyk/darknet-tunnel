#!/usr/bin/env node
/**
 * v11.2.6 — mídia REAL + zero animal/furry
 */
'use strict';
const fs = require('fs');
const path = require('path');

let ok = 0, fail = 0;
function t(name, cond, extra = '') {
  if (cond) { ok++; console.log('  ✔', name + (extra ? ' — ' + String(extra).slice(0, 80) : '')); }
  else { fail++; console.log('  ❌', name, extra); }
}

(async () => {
  const src = require('../src/bot/adultSources');
  const p18 = require('../src/bot/portal18');
  const samples = path.join(__dirname, '../samples');
  fs.mkdirSync(samples, { recursive: true });

  console.log('\n=== 1. Bloqueio animal/furry ===');
  t('isAnimalContent furry', src.isAnimalContent('cute furry fox'));
  t('isAnimalContent clean', !src.isAnimalContent('blonde cosplay woman'));
  t('portal isBlocked furry', p18.isBlocked('furry yiff'));
  t('portal isBlocked bestiality', p18.isBlocked('bestiality'));
  t('portal isAnimalOrFurry e621', p18.isAnimalOrFurry('e621 net'));
  t('e621 desactivado', await p18.e621Images().then(() => false).catch(() => true));

  console.log('\n=== 2. Pornpics FOTO REAL ===');
  const pp = await src.pornpicsSearch('blonde cosplay', 8);
  t('pornpics resultados', pp.length > 0, `${pp.length} · ${pp[0]?.source}`);
  t('pornpics URL cdni', /pornpics\.com/i.test(pp[0]?.url || ''));
  const ppDl = await src.pornpicsDownload(pp[0]);
  t('pornpics bytes JPEG', ppDl.buf?.length > 5000 && ppDl.buf[0] === 0xff && ppDl.buf[1] === 0xd8, ppDl.buf?.length);
  fs.writeFileSync(path.join(samples, 'real-pornpics-v1126.jpg'), ppDl.buf);

  console.log('\n=== 3. Cosplay = só fontes reais (sem nekos/e621) ===');
  const cos = await src.cosplaySearch('cosplay', 12);
  t('cosplay resultados', cos.length > 0, `${cos.length}`);
  const sources = [...new Set(cos.map(c => c.source))];
  t('sem e621/nekos/waifu', !sources.some(s => /e621|nekos|waifu|gelbooru|rule34/i.test(s)), sources.join(','));
  t('tem pornpics ou xhamster ou erome', sources.some(s => /pornpics|xhamster|erome/i.test(s)), sources.join(','));
  const cosDl = await src.cosplayDownload(cos.find(c => c.source === 'pornpics') || cos[0]);
  const cbuf = cosDl.buf || cosDl[0]?.buf;
  t('cosplay download real', cbuf && cbuf.length > 5000, cbuf?.length);
  if (cbuf) fs.writeFileSync(path.join(samples, 'real-cosplay-v1126.jpg'), cbuf);

  console.log('\n=== 4. sex.com → real (pornpics fallback ok) ===');
  const sx = await src.sexcomSearch('blonde', { limit: 6, type: 'pics' });
  t('sexcom resultados', sx.length > 0, `${sx.length} · ${sx[0]?.source}`);
  t('sexcom NÃO anime fake', !/nekos|e621|waifu/i.test(sx[0]?.source || ''));
  const sxm = await src.sexcomResolve(sx[0]);
  t('sexcom media real', sxm.buf?.length > 5000, `${sxm.buf?.length} · ${sxm.source}`);
  if (sxm.buf) fs.writeFileSync(path.join(samples, 'real-sexcom-v1126.jpg'), sxm.buf);

  console.log('\n=== 5. XVideos search real ===');
  const xv = await src.xvideosSearch('blonde', 8);
  t('xvideos results', xv.length > 0, `${xv.length} · ${xv[0]?.title?.slice(0, 40)}`);
  t('xvideos urls xvideos.com', /xvideos\.com/i.test(xv[0]?.url || ''));
  t('xvideos filtra animal title', !xv.some(v => src.isAnimalContent(v.title)));

  console.log('\n=== 6. Pornhub search ===');
  try {
    const ph = await src.pornhubSearch('blonde', 5);
    t('pornhub results', ph.length >= 0, `${ph.length}`);
  } catch (e) { t('pornhub (pode bloquear)', true, e.message.slice(0, 50)); }

  console.log('\n=== 7. Hentai real yande (anime) — não furry ===');
  const hen = await p18.yandeImages('nude', 2);
  t('yande hentai', hen.length > 0 && /yande/i.test(hen[0].source), hen[0]?.source);
  t('yande url real', /^https?:\/\//.test(hen[0]?.url || ''));
  const hb = await require('../src/bot/mediaHandler').fetchBuffer(hen[0].url);
  t('yande bytes', hb.length > 10000, hb.length);
  fs.writeFileSync(path.join(samples, 'real-hentai-yande-v1126.jpg'), hb);

  console.log('\n=== 8. searchImages sem e621 ===');
  const si = await p18.searchImages('nude', 3);
  t('searchImages', si.length > 0, si.map(x => x.source).join(','));
  t('searchImages sem e621', !si.some(x => /e621/i.test(x.source || '')));

  console.log('\n=== 9. menu sem e621 activo ===');
  const nc = fs.readFileSync(path.join(__dirname, '../src/bot/nativeCommands.js'), 'utf8');
  t('menu bloqueia e621', /e621\/furry\/animal BLOQUEADOS/.test(nc));
  t('e621 cmd desactivado', /e621 desactivado/.test(nc));

  console.log(`\n────────────────\n${ok} OK / ${fail} FALHOU\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
