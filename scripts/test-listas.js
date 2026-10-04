'use strict';
/** v7.77 — LISTAS COMPLETAS + SLY ANIMADO */
let ok = 0, fail = 0;
const check = (n, c, x = '') => { if (c) { ok++; console.log('  ✅', n); } else { fail++; console.log('  ❌', n, x); } };

// motor REAL antes dos stubs
const lista = require('../src/bot/listaEscolha');
const mk = require('../src/bot/stickerMaker');
const C = require('../src/aura/auraCanais');
const musicaCard = require('../src/bot/musicaCard');

const Module = require('module');
const _orig = Module.prototype.require;
const got = {};
const V = (t, a, d) => ({ title: t, author: a, duration: d, views: 1000, youtube_url: 'https://youtu.be/' + t, thumbnail: '' });
Module.prototype.require = function (id) {
  const s = String(id);
  if (s.endsWith('systemZeroPlay')) return {
    ytsearch: async () => ({ resultados: [V('Musica A', 'Cantor A', '3:10'), V('Musica B', 'Cantor B', '4:00'), V('Musica C', 'Cantor C', '2:50')] }),
    sendToxicPlayCard: async (...a) => { got.toxic = a; },
    sendPlayCard: async (...a) => { got.card = a; },
  };
  if (/(^|\/)ytdl$/.test(s)) return {
    searchVideoList: async () => [{ title: 'Video A', author: 'Canal A', duration: '5:00', url: 'https://youtu.be/AAA' }, { title: 'Video B', author: 'Canal B', duration: '6:00', url: 'https://youtu.be/BBB' }],
    getVideo: async (url, q) => { got.video = [url, q]; return { title: 'Video A', author: 'Canal A', duration: '5:00', buffer: Buffer.alloc(5000, 1) }; },
  };
  if (/(^|\/)stickerly$/.test(s)) return {
    searchPacks: async () => [{ id: 'PACK1', title: 'Pack Um', author: 'sly', stickerCount: 20, isAnimated: false }, { id: 'PACK2', title: 'Pack Dois', author: 'sly', stickerCount: 12, isAnimated: true }],
    getPack: async (id) => { got.pack = id; return { title: 'Pack ' + id, stickers: [{ url: 'https://x/y.webp', isAnimated: false }] }; },
  };
  if (s.endsWith('stickerMaker')) return { create: async (b) => { got.stk = (got.stk || 0) + 1; return Buffer.alloc(100, 2); }, makePackId: () => 'test-pack' };
  if (s.endsWith('mediaHandler')) return { fetchBuffer: async () => Buffer.alloc(5000, 3), fetchJson: async () => ({}), downloadFromMessage: async () => Buffer.alloc(600, 3) };
  if (s.endsWith('stickerPack')) return { sendFinishedPack: async () => { got.finished = true; return { stickers: [Buffer.alloc(100)], description: 'desc' }; } };
  if (s.endsWith('dl/others')) return {
    soundcloud: async (u) => { got.sc = u; return { title: 'C', url: 'https://audio/y.mp3', author: 'B' }; },
    tiktokSearch: async () => [{ title: 'TT1', author: 'u1', url: 'https://tt/1.mp4' }, { title: 'TT2', author: 'u2', url: 'https://tt/2.mp4' }, { title: 'TT3', author: 'u3', url: 'https://tt/3.mp4' }],
  };
  if (s.endsWith('dl/helpers')) return {
    systemZoneSoundCloudSearch: async () => [{ title: 'SC A', author: 'Au A', sc_url: 'https://soundcloud.com/a' }],
  };
  if (/(^|\/)erome$/.test(s)) return {
    search: async () => [{ name: 'Album A', url: 'https://www.erome.com/a/AAA', type: 'album' }, { name: 'Album B', url: 'https://www.erome.com/a/BBB', type: 'album' }],
    isFiltered: () => false,
    albumToMedia: async (url) => { got.album = url; return { media: [{ url, buf: Buffer.alloc(2000, 4), type: 'photo' }], name: 'Album', totalPhotos: 1, totalVideos: 0 }; },
  };
  if (s.endsWith('aura/auraCanais')) return {
    procurarCanais: async () => [{ jid: 'L1@newsletter', name: 'Loja Centro' }, { jid: 'L2@newsletter', name: 'Loja Norte' }],
    listarCanais: async () => ({ lista: [{ jid: 'L1@newsletter', name: 'Loja Centro' }, { jid: 'L2@newsletter', name: 'Loja Norte' }], ativo: 'L1@newsletter' }),
    ativarCanal: async () => { got.ativou = true; return { ok: true, msg: 'ok' }; },
  };
  return _orig.apply(this, arguments);
};

const cmds = {};
require('../src/bot/cases/downloads.js')((names, fn) => names.forEach(n => { cmds[n] = fn; }));
require('../src/bot/cases/downloads2.js')((names, fn) => names.forEach(n => { cmds[n] = fn; }));
require('../src/bot/cases/stickerly.js')((names, fn) => names.forEach(n => { cmds[n] = fn; }));
require('../src/bot/cases/canal.js')((names, fn) => names.forEach(n => { cmds[n] = fn; }));
require('../src/bot/cases/rpg2.js')((names, fn) => names.forEach(n => { cmds[n] = fn; }));
const native = require('../src/bot/nativeCommands');

function sockMock(store) {
  return {
    sendMessage: async (jid, content) => { store.push(content); return { key: { id: 'x' } }; },
  };
}
const CTX = (n = 'U') => ({ remoteJid: 'G' + n + '@g.us', senderNumber: '244900' + n, pushName: 'T' });
const MSG = { key: { id: 'm1', remoteJid: 'G@g.us' } };

(async () => {
  console.log('\n═══ MOTOR listaEscolha ═══');
  let store = [];
  let sock = sockMock(store);
  const ctx = CTX('1');
  let picked = null;
  await lista.mostrar(sock, MSG, ctx, { titulo: '*T*', linhas: ['A', 'B', 'C'], itens: ['a', 'b', 'c'], aoEscolher: async (p) => { picked = p; } });
  const txt = store.find(c => c.text)?.text || '';
  check('numera a lista', txt.includes('*1.* A') && txt.includes('*3.* C') && /1–3/.test(txt), txt.slice(0, 60));
  check('pendente guardado', lista._pendentes.has(lista._key(ctx)));
  store = []; sock = sockMock(store);
  check('escolha válida corre handler', await lista.tentarNumero(sock, MSG, ctx, '2') === true && picked?.item === 'b' && picked?.idx === 1);
  check('pendente consumido', !lista._pendentes.has(lista._key(ctx)));
  await lista.mostrar(sock, MSG, ctx, { titulo: '*T*', linhas: ['A', 'B'], itens: ['a', 'b'], aoEscolher: async () => {} });
  store = []; sock = sockMock(store);
  check('nº fora da lista → erro, mantém', await lista.tentarNumero(sock, MSG, ctx, '5') === true && /1\* a \*2/.test(store[0]?.text || '') && lista._pendentes.has(lista._key(ctx)));
  check('sem pendente → false', await lista.tentarNumero(sock, MSG, CTX('ZZ'), '1') === false);
  check('não-número → false', await lista.tentarNumero(sock, MSG, ctx, 'oi') === false);
  // newer-wins contra o !som
  const key = lista._key(ctx);
  musicaCard._pendentes.set(key, { video: {}, ts: Date.now() + 5000 });
  check('cartão !som mais novo → cede', await lista.tentarNumero(sock, MSG, ctx, '1') === false && lista._pendentes.has(key));
  musicaCard._pendentes.delete(key);
  // máx 10
  const many = Array.from({ length: 12 }, (_, i) => 'L' + i);
  const n = await lista.mostrar(sock, MSG, CTX('M'), { titulo: '*T*', linhas: many, itens: many, aoEscolher: async () => {} });
  check('corta em 10', n === 10 && lista._pendentes.get(lista._key(CTX('M'))).itens.length === 10);

  console.log('\n═══ SLY ANIMADO (detetor) ═══');
  const sharp = require('sharp');
  const staticWebp = await sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 10, g: 20, b: 30 } } }).webp().toBuffer();
  check('estático → false', mk.isAnimatedWebp(staticWebp) === false && mk.detectMime(staticWebp) === 'image/webp');
  const vpx = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8X'), Buffer.alloc(4), Buffer.from([0x02]), Buffer.alloc(8)]);
  check('VP8X flag anim → true', mk.isAnimatedWebp(vpx) === true);
  const vpx2 = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8X'), Buffer.alloc(4), Buffer.from([0x00]), Buffer.alloc(8), Buffer.from('xxANMFyy')]);
  check('chunk ANMF → true', mk.isAnimatedWebp(vpx2) === true);
  check('jpg → false', mk.isAnimatedWebp(Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])) === false);

  console.log('\n═══ SLY ANIMADO (vivo) ═══');
  try {
    const realFetch = await _orig.call(module, '../src/bot/mediaHandler').fetchBuffer('https://www.gstatic.com/webp/gallery/5.webp').catch(() => null);
    const slyReal = _orig.call(module, '../src/bot/stickerly');
    const packs = await slyReal.searchPacks('gato gif', { size: 6 });
    const ap = packs.find(p => p.isAnimated);
    const d = await slyReal.getPack(ap.id);
    const s = d.stickers.find(x => x.isAnimated);
    // fetch real (o stub está ativo no require normal)
    const res = await fetch(s.url);
    const buf = Buffer.from(await res.arrayBuffer());
    const anim = (b) => b.toString('latin1').includes('ANMF') || b.toString('latin1').includes('ANIM');
    check('origem sly é webp animado', anim(buf) && mk.isAnimatedWebp(buf));
    const out = await mk.create(buf, { isVideo: true, botName: 'D', ownerName: 'D', userName: 'u', groupName: 'g', packName: 't', authorName: 'a' });
    check('create() preserva animação ≤500KB', anim(out) && out.length <= 500 * 1024, Math.round(out.length / 1024) + 'KB');
    if (realFetch) { const o2 = await mk.create(realFetch, { botName: 'D', ownerName: 'D', userName: 'u', groupName: 'g', packName: 't', authorName: 'a' }); check('foto normal continua foto', !anim(o2) && o2.length > 200); }
  } catch (e) { check('sly vivo (rede ' + String(e.message).slice(0, 40) + ')', false); }

  console.log('\n═══ CANAL procurarCanais ═══');
  await C.guardarCanal({ jid: 'LJ1@newsletter', name: 'Loja Centro' });
  await C.guardarCanal({ jid: 'LJ2@newsletter', name: 'Loja Norte' });
  await C.guardarCanal({ jid: 'MM@newsletter', name: 'Memes' });
  C._limparCacheCanais();
  check('nome parcial → 2', (await C.procurarCanais('loja')).length === 2);
  check('nome único → 1', (await C.procurarCanais('memes'))[0]?.jid === 'MM@newsletter');
  check('nº → posição', (await C.procurarCanais('2'))[0]?.jid === 'LJ2@newsletter');
  check('nada → []', (await C.procurarCanais('zzz')).length === 0);
  await C.esquecerCanal('LJ1@newsletter'); await C.esquecerCanal('LJ2@newsletter'); await C.esquecerCanal('MM@newsletter');
  const saidas = [];
  const tCanal = await cmds['canal']({ sock: sockMock([]), m: {}, msg: MSG, ctx: ctx, args: ['@loja', 'postar', 'x'], text: '@loja postar x', prefix: '!', isOwner: true, reply: async (t) => { saidas.push(t); return t; } });
  check('canal @ambíguo → desempata', /2 canais/.test(saidas[0] || '') && /Loja Centro/.test(saidas[0] || '') && /@<nº>/.test(saidas[0] || ''), (saidas[0] || '').slice(0, 70));

  console.log('\n═══ FLUXOS (lista → número) ═══');
  // play — v7.93: cartão DIRECTO do resultado #1 (sem lista numerada;
  // a escolha rápida por lista ficou para video/sly, o play tem os
  // botões de formato no próprio cartão + play2/play3 alternativos)
  store = []; sock = sockMock(store);
  const cP = CTX('P');
  await cmds['play']({ sock, m: { chat: cP.remoteJid, key: MSG.key }, msg: MSG, ctx: cP, text: 'drake', prefix: '!', command: 'play' });
  const tPlay = store.find(c => c.text)?.text || '';
  check('play envia o cartão da 1.ª música', got.toxic?.[2]?.title === 'Musica A', JSON.stringify(got.toxic?.[2]?.title));
  check('play não abre lista numerada', !/\*3\.\*/.test(tPlay) && !lista._pendentes.has(lista._key(cP)), tPlay.slice(0, 60));
  // video
  store = []; sock = sockMock(store);
  const cVd = CTX('VD');
  await cmds['video']({ sock, m: {}, msg: MSG, ctx: cVd, text: 'naruto', prefix: '!', reply: async (t) => t, react: async () => {} });
  check('video mostra lista', (store.find(c => c.text)?.text || '').includes('Video B'));
  await lista.tentarNumero(sock, MSG, cVd, '1');
  check('video escolhe → getVideo(url)', got.video?.[0] === 'https://youtu.be/AAA' && got.video?.[1] === '720', JSON.stringify(got.video));
  // sly
  store = []; sock = sockMock(store);
  const cS = CTX('S');
  await cmds['sly']({ sock, msg: MSG, ctx: cS, args: ['gato'], prefix: '!', reply: async (t) => t });
  check('sly mostra packs', (store.find(c => c.text)?.text || '').includes('Pack Dois'));
  await lista.tentarNumero(sock, MSG, cS, '2');
  check('sly escolhe → baixa pack', got.pack === 'PACK2' && got.finished === true, got.pack);
  // spotify
  store = []; sock = sockMock(store);
  const cSp = CTX('SP');
  await cmds['spotify']({ sock, msg: MSG, ctx: cSp, args: ['drake'], prefix: '!', command: 'spotify', reply: async (t) => t });
  const spotifyTexto = store.find(c => c.text)?.text || '';
  check('spotify abre busca oficial', spotifyTexto.includes('SPOTIFY OFICIAL') && spotifyTexto.includes('https://open.spotify.com/search/drake'));
  check('spotify não cria escolha nem baixa MP3', !lista._pendentes.has(lista._key(cSp)) && !store.some(c => c.audio || c.document || c.video) && !got.sp, got.sp);
  // soundcloud (1 resultado → lista na mesma? só 1 item → mostra lista de 1)
  store = []; sock = sockMock(store);
  const cSc = CTX('SC');
  await cmds['soundcloud']({ sock, msg: MSG, ctx: cSc, args: ['mix'], prefix: '!', reply: async (t) => t });
  await lista.tentarNumero(sock, MSG, cSc, '1');
  check('soundcloud escolhe', got.sc === 'https://soundcloud.com/a', got.sc);
  // ttks
  store = []; sock = sockMock(store);
  const cT = CTX('T');
  await cmds['ttks']({ sock, msg: MSG, ctx: cT, args: ['dance'], prefix: '!', reply: async (t) => t });
  check('ttks mostra 3', (store.find(c => c.text)?.text || '').includes('TT3'));
  store.length = 0; // mesmo sock (produção: sock é estável)
  await lista.tentarNumero(sock, MSG, cT, '3');
  check('ttks escolhe #3 → vídeo', store.some(c => c.document && /TT3/.test(c.caption || '')));
  // erome
  store = []; sock = sockMock(store);
  const cE = CTX('E');
  await native.erome({ sock, msg: MSG, ctx: cE, args: ['nome'] });
  check('erome mostra álbuns', (store.find(c => c.text)?.text || '').includes('Album B'));
  store.length = 0; // mesmo sock (produção: sock é estável)
  await lista.tentarNumero(sock, MSG, cE, '2');
  check('erome escolhe → baixa álbum', got.album === 'https://www.erome.com/a/BBB' && store.some(c => c.image), got.album);
  // npc
  store = []; sock = sockMock(store);
  const cN = CTX('N');
  await cmds['npc']({ sock, msg: MSG, ctx: cN, args: [] });
  const tNpc = store.find(c => c.text)?.text || '';
  check('npc mostra lista', /\*1\.\*/.test(tNpc), tNpc.slice(0, 60));
  store.length = 0; // mesmo sock (produção: sock é estável)
  await lista.tentarNumero(sock, MSG, cN, '1');
  check('npc escolhe → fala', store.some(c => c.text), String(store.length));

  console.log(`\n${fail ? '💥' : '🎉'} LISTAS: ${ok} OK / ${fail} FALHOU\n`);
  process.exit(fail ? 1 : 0);
})();
