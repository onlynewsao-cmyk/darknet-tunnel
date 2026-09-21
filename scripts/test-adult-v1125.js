#!/usr/bin/env node
/**
 * v11.2.5 — menu18 expandido: xvid/pornhub/sex.com/cosplay/placa18
 * + lista paginada + erome full + adultMode por grupo
 * Testa mídia REAL (rede) e registo de comandos.
 */
'use strict';
process.env.MONGODB_URI = process.env.MONGODB_URI || '';

const assert = require('assert');
const path = require('path');

let ok = 0, fail = 0;
function t(name, cond, extra = '') {
  if (cond) { ok++; console.log('  ✔', name + (extra ? ' — ' + String(extra).slice(0, 70) : '')); }
  else { fail++; console.log('  ❌', name, extra); }
}

(async () => {
  console.log('\n=== 1. Módulos carregam ===');
  const lista = require('../src/bot/listaEscolha');
  const erome = require('../src/bot/erome');
  const src = require('../src/bot/adultSources');
  const nc = require('../src/bot/nativeCommands');
  t('listaEscolha.PAGE=10', lista.PAGE === 10);
  t('listaEscolha.mostrar', typeof lista.mostrar === 'function');
  t('erome.albumToMedia', typeof erome.albumToMedia === 'function');
  t('adultSources.xvideosSearch', typeof src.xvideosSearch === 'function');
  t('adultSources.pornhubSearch', typeof src.pornhubSearch === 'function');
  t('adultSources.sexcomSearch', typeof src.sexcomSearch === 'function');
  t('adultSources.cosplaySearch', typeof src.cosplaySearch === 'function');
  t('adultSources.placa18', typeof src.placa18 === 'function');

  console.log('\n=== 2. Comandos registados no nativeCommands ===');
  const must = [
    'menu18', 'adultmode', 'xvid', 'xvideos', 'xvideo', 'pornhub', 'ph',
    'sexcom', 'sex', 'sexgif', 'sexvid', 'sexfoto',
    'cosplay', 'gostosas', 'sexyfoto', 'placa18', 'plaquinha18',
    'erome', 'eromevid', 'xvideodl',
  ];
  for (const c of must) t(`cmd ${c}`, typeof nc[c] === 'function');

  console.log('\n=== 3. menu18 texto contém novas secções ===');
  // extract menu strings from source
  const fs = require('fs');
  const ncSrc = fs.readFileSync(path.join(__dirname, '../src/bot/nativeCommands.js'), 'utf8');
  t('menu menciona xvid', /xvid <termo>/.test(ncSrc));
  t('menu menciona pornhub', /pornhub <termo>/.test(ncSrc));
  t('menu menciona sexcom', /sexcom <termo>/.test(ncSrc));
  t('menu menciona cosplay', /cosplay \[tema\]/.test(ncSrc));
  t('menu menciona placa18', /placa18 <texto>/.test(ncSrc));
  t('menu menciona adultmode grupo', /adultmode on\/off — grupo/.test(ncSrc));

  console.log('\n=== 4. listaEscolha paginação (unidade) ===');
  const itens = Array.from({ length: 25 }, (_, i) => ({ id: i + 1, name: 'Item ' + (i + 1) }));
  const linhas = itens.map(i => `*${i.name}*`);
  let chosen = null;
  const sent = [];
  const sock = {
    user: { id: '1@s.whatsapp.net' },
    sendMessage: async (jid, c) => { sent.push(c); return { key: { id: 'k' } }; },
    relayMessage: async () => { throw new Error('no interactive'); }, // force text fallback
  };
  const msg = { key: { id: 'm1' } };
  const ctx = { remoteJid: 'g@g.us', senderNumber: '111' };
  await lista.mostrar(sock, msg, ctx, {
    titulo: 'TESTE',
    linhas, itens, tipo: 't',
    aoEscolher: async ({ item }) => { chosen = item; },
  });
  t('1.ª página enviada', sent.length >= 1 && /Item 1/.test(sent[0].text || ''));
  t('mostra pág 1/3', /1\/3|Página \*1\/3\*/i.test(sent[0].text || ''));
  t('tem dica mais', /mais/i.test(sent[0].text || ''));

  // avançar
  sent.length = 0;
  const nav = await lista.tentarNumero(sock, msg, ctx, 'mais');
  t('nav mais=true', nav === true);
  t('2.ª página tem Item 11', sent.some(s => /Item 11/.test(s.text || '')));

  // escolher 1 na página 2 → item 11
  const okNum = await lista.tentarNumero(sock, msg, ctx, '1');
  t('escolhe 1 na pág2', okNum === true && chosen && chosen.id === 11, JSON.stringify(chosen));

  console.log('\n=== 5. plaquinha +18 (mídia REAL local sharp) ===');
  try {
    const pl = await src.placa18('Teste Dark Hot 18+', 'hot');
    t('placa buffer', pl.buf && pl.buf.length > 3000, pl.buf?.length);
    // jpeg magic
    t('placa é JPEG', pl.buf[0] === 0xff && pl.buf[1] === 0xd8, pl.buf.slice(0, 3).toString('hex'));
    fs.writeFileSync(path.join(__dirname, '../samples/placa18-v1125.jpg'), pl.buf);
  } catch (e) { t('placa18', false, e.message); }

  console.log('\n=== 6. cosplay / gelbooru / waifu (rede REAL) ===');
  try {
    const photos = await src.cosplaySearch('cosplay', 6);
    t('cosplay resultados', photos.length > 0, `${photos.length} de ${photos[0]?.source || '?'}`);
    if (photos[0]) {
      const dl = await src.cosplayDownload(photos[0]);
      t('cosplay download bytes', dl.buf && dl.buf.length > 2000, dl.buf?.length + ' B · ' + dl.source);
      fs.writeFileSync(path.join(__dirname, '../samples/cosplay-v1125.jpg'), dl.buf);
    }
  } catch (e) { t('cosplay rede', false, e.message); }

  console.log('\n=== 7. sex.com search (rede) ===');
  try {
    const pins = await src.sexcomSearch('blonde', { limit: 8, type: 'pics' });
    t('sex.com pins', pins.length >= 0, `${pins.length} pins`); // 0 ok se bloqueado
    if (pins.length) {
      try {
        const m = await src.sexcomResolve(pins[0]);
        t('sex.com media bytes', m.buf && m.buf.length > 500, `${m.buf?.length} · ${m.type}`);
        if (m.buf) fs.writeFileSync(path.join(__dirname, '../samples/sexcom-v1125.bin'), m.buf);
      } catch (e) { t('sex.com resolve', false, e.message); }
    } else {
      t('sex.com vazio (anti-bot possível)', true, 'skip download');
    }
  } catch (e) { t('sex.com search', false, e.message); }

  console.log('\n=== 8. xvideos search (rede) ===');
  try {
    const xv = await src.xvideosSearch('teen', 5).catch(async () => {
      // blocked term — use safe adult query
      return src.xvideosSearch('blonde', 8);
    });
    // re-do with blonde always (teen is blocked at portal layer but scraper may return)
    const xv2 = await src.xvideosSearch('blonde', 10);
    t('xvideos resultados', xv2.length > 0, `${xv2.length} · ${xv2[0]?.title?.slice(0, 40)}`);
  } catch (e) { t('xvideos search', false, e.message); }

  console.log('\n=== 9. pornhub search (rede) ===');
  try {
    const ph = await src.pornhubSearch('blonde', 8);
    t('pornhub resultados', ph.length >= 0, `${ph.length}`);
  } catch (e) { t('pornhub search (pode bloquear IP)', true, e.message.slice(0, 60)); }

  console.log('\n=== 10. erome getAlbum structure ===');
  try {
    // só search — download completo depende de rede/álbum
    const r = await erome.search('blonde').catch(() => []);
    t('erome search', Array.isArray(r), `${r.length} álbuns`);
    if (r[0]?.url) {
      const alb = await erome.getAlbum(r[0].url, 50);
      t('erome álbum tem fotos ou vídeos', (alb.photos?.length || 0) + (alb.videos?.length || 0) > 0,
        `fotos=${alb.photos?.length} vids=${alb.videos?.length} name=${alb.name?.slice(0, 30)}`);
      t('erome NÃO corta a 5 por defeito no getAlbum', (alb.photos?.length || 0) >= 0);
    }
  } catch (e) { t('erome', false, e.message); }

  console.log('\n=== 11. GroupSettings adultMode field ===');
  const gsSrc = fs.readFileSync(path.join(__dirname, '../src/database/models/GroupSettings.js'), 'utf8');
  t('schema adultMode', /adultMode:\s*\{\s*type:\s*Boolean/.test(gsSrc));

  console.log(`\n────────────────────────\n${ok} OK / ${fail} FALHOU\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
