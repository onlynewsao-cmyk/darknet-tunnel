'use strict';
/**
 * DARK BOT v11.2.6 — Fontes adultas REAL (sem placeholder / sem furry / sem animal)
 *
 * VÍDEO:  XVideos · Pornhub · Eporner  (yt-dlp + scrape mp4)
 * FOTOS:  Pornpics · xHamster Photos · Erome  (JPEG real)
 * SEX.COM: tenta site; se SPA vazio → Pornpics (fotos reais, NÃO anime)
 * COSPLAY/GOSTOSAS: só fotos reais (pornpics/xhamster/erome) — zero e621/nekos/furry
 * HENTAI: fica no portal18 (yande/konachan) — anime hentai de verdade, não “neko SFW”
 */
const axios = require('axios');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);
const fs = require('fs');
const os = require('os');
const path = require('path');
const mediaHandler = require('./mediaHandler');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/** Bloqueia animal / furry / zoo / bestiality em títulos, tags e queries. */
const ANIMAL_BLOCK = /\b(animal|animals|zoophil|bestial|beastial|dog\s*sex|horse\s*sex|farm\s*sex|furry|furries|yiff|cub\b|feral|equine|canine|knotting|paw\b|wolf|fox\s*girl|dragon\s*dick|okami|e621)\b/i;

function isAnimalContent(s = '') {
  return ANIMAL_BLOCK.test(String(s || ''));
}

function _headers(extra = {}) {
  return {
    'User-Agent': UA,
    'Accept-Language': 'en-US,en;q=0.9,pt;q=0.8',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    ...extra,
  };
}

async function _getHtml(url, headers = {}) {
  const r = await axios.get(url, {
    headers: _headers(headers),
    timeout: 25000,
    maxRedirects: 5,
    responseType: 'text',
    validateStatus: s => s < 500,
  });
  if (r.status >= 400) throw new Error(`HTTP ${r.status}`);
  return String(r.data || '');
}

function _decode(s) {
  return String(s || '')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\\u0026/g, '&')
    .replace(/\\\//g, '/').trim();
}

function _uniqBy(arr, key = 'url') {
  const seen = new Set();
  return arr.filter((x) => {
    const k = x[key];
    if (!k || seen.has(k)) return false;
    if (isAnimalContent(x.title || '') || isAnimalContent(x.tags || '') || isAnimalContent(k)) return false;
    seen.add(k);
    return true;
  });
}

function _ytdlpBin() {
  if (process.env.YTDLP_PATH) return process.env.YTDLP_PATH;
  try {
    const which = require('child_process').execSync('which yt-dlp 2>/dev/null || which youtube-dl 2>/dev/null', { encoding: 'utf8' }).trim();
    if (which) return which.split('\n')[0];
  } catch {}
  return 'yt-dlp';
}

async function ytdlpDownload(url, { maxMb = 45, format = 'mp4' } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dark-adult-'));
  const outTpl = path.join(dir, 'v.%(ext)s');
  const bin = _ytdlpBin();
  try {
    await execFileAsync(bin, [
      '-f', 'bv*[height<=720]+ba/b[height<=720]/b',
      '--merge-output-format', format,
      '--no-playlist',
      '--max-filesize', `${maxMb}M`,
      '-o', outTpl,
      '--no-warnings',
      url,
    ], { timeout: 180000, maxBuffer: 8 * 1024 * 1024 });
    const files = fs.readdirSync(dir).filter(f => !f.endsWith('.part'));
    if (!files.length) throw new Error('yt-dlp sem ficheiro');
    const fp = path.join(dir, files.sort((a, b) => fs.statSync(path.join(dir, b)).size - fs.statSync(path.join(dir, a)).size)[0]);
    const buf = fs.readFileSync(fp);
    if (buf.length < 5000) throw new Error('ficheiro demasiado pequeno');
    return { buf, path: fp, size: buf.length, title: path.basename(fp) };
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
}

async function _fetchBuf(url, referer) {
  const buf = await mediaHandler.fetchBuffer(url, 5, {
    headers: { 'User-Agent': UA, Referer: referer || url, Accept: 'image/*,video/*,*/*' },
    timeout: 90000,
  });
  if (!buf || buf.length < 800) throw new Error('download vazio');
  return buf;
}

// ═══════════════════════════════════════════════════════════
// XVIDEOS — vídeo real
// ═══════════════════════════════════════════════════════════
async function xvideosSearch(query, limit = 20) {
  const q = encodeURIComponent(String(query || '').trim());
  if (!q) throw new Error('query vazia');
  if (isAnimalContent(query)) throw new Error('termo bloqueado (animal/furry)');
  const html = await _getHtml(`https://www.xvideos.com/?k=${q}`, { Referer: 'https://www.xvideos.com/' });
  const results = [];
  const re = /<div[^>]+id="video_(\d+)"[\s\S]*?<a[^>]+href="(\/video[^"]+)"[^>]*title="([^"]*)"/gi;
  let m;
  while ((m = re.exec(html)) !== null && results.length < limit * 2) {
    let href = m[2];
    const title = _decode(m[3]);
    if (isAnimalContent(title)) continue;
    if (!href.startsWith('http')) href = 'https://www.xvideos.com' + href;
    results.push({ id: m[1], url: href, title: title || `XVideos #${m[1]}`, source: 'xvideos', type: 'video' });
  }
  if (!results.length) {
    const re2 = /href="(\/video\.[^"]+\/[^"]+)"[^>]*title="([^"]*)"/gi;
    while ((m = re2.exec(html)) !== null && results.length < limit) {
      let href = m[1];
      const title = _decode(m[2]);
      if (isAnimalContent(title)) continue;
      if (!href.startsWith('http')) href = 'https://www.xvideos.com' + href;
      results.push({ url: href, title: title || 'XVideos', source: 'xvideos', type: 'video' });
    }
  }
  return _uniqBy(results).slice(0, limit);
}

async function xvideosDownload(url) {
  try {
    const r = await ytdlpDownload(url, { maxMb: 50 });
    return { ...r, source: 'xvideos', url, type: 'video' };
  } catch (e1) {
    const html = await _getHtml(url, { Referer: 'https://www.xvideos.com/' });
    const m = html.match(/html5player\.setVideoUrlHigh\('([^']+)'\)/)
      || html.match(/html5player\.setVideoUrlLow\('([^']+)'\)/)
      || html.match(/setVideoUrlHigh\("([^"]+)"\)/);
    if (!m) throw new Error(`xvideos download: ${e1.message}`);
    const stream = _decode(m[1]);
    const buf = await _fetchBuf(stream, 'https://www.xvideos.com/');
    if (buf.length < 10000) throw new Error('xvideos stream vazio');
    return { buf, size: buf.length, source: 'xvideos', url, title: 'xvideos', type: 'video' };
  }
}

// ═══════════════════════════════════════════════════════════
// PORNHUB — vídeo real
// ═══════════════════════════════════════════════════════════
async function pornhubSearch(query, limit = 20) {
  const q = encodeURIComponent(String(query || '').trim());
  if (!q) throw new Error('query vazia');
  if (isAnimalContent(query)) throw new Error('termo bloqueado (animal/furry)');
  const html = await _getHtml(`https://www.pornhub.com/video/search?search=${q}`, { Referer: 'https://www.pornhub.com/' });
  const results = [];
  const re = /href="(\/view_video\.php\?viewkey=[a-zA-Z0-9]+)"[^>]*title="([^"]*)"/gi;
  let m;
  while ((m = re.exec(html)) !== null && results.length < limit * 2) {
    let href = m[1];
    const title = _decode(m[2]);
    if (isAnimalContent(title)) continue;
    if (!href.startsWith('http')) href = 'https://www.pornhub.com' + href;
    results.push({ url: href, title: title || 'Pornhub', source: 'pornhub', type: 'video' });
  }
  if (!results.length) {
    const re2 = /viewkey=([a-zA-Z0-9]+)/g;
    const keys = new Set();
    while ((m = re2.exec(html)) !== null && keys.size < limit) keys.add(m[1]);
    for (const k of keys) {
      results.push({ url: `https://www.pornhub.com/view_video.php?viewkey=${k}`, title: `PH ${k}`, source: 'pornhub', type: 'video' });
    }
  }
  return _uniqBy(results).slice(0, limit);
}

async function pornhubDownload(url) {
  const r = await ytdlpDownload(url, { maxMb: 50 });
  return { ...r, source: 'pornhub', url, type: 'video' };
}

// ═══════════════════════════════════════════════════════════
// EPORNER — vídeo real (extra)
// ═══════════════════════════════════════════════════════════
async function epornerSearch(query, limit = 20) {
  const q = encodeURIComponent(String(query || '').trim());
  if (!q) throw new Error('query vazia');
  if (isAnimalContent(query)) throw new Error('termo bloqueado (animal/furry)');
  const html = await _getHtml(`https://www.eporner.com/search/${q}/`, { Referer: 'https://www.eporner.com/' });
  const results = [];
  const re = /href="(\/video-[^"]+\/[^"]+\/)"[^>]*>[\s\S]*?(?:title|alt)="([^"]*)"/gi;
  let m;
  while ((m = re.exec(html)) !== null && results.length < limit * 2) {
    const title = _decode(m[2] || '');
    if (isAnimalContent(title)) continue;
    let href = m[1];
    if (!href.startsWith('http')) href = 'https://www.eporner.com' + href;
    results.push({ url: href, title: title || 'Eporner', source: 'eporner', type: 'video' });
  }
  if (!results.length) {
    const re2 = /href="(\/video-[a-zA-Z0-9]+\/[^"]+\/)"/gi;
    while ((m = re2.exec(html)) !== null && results.length < limit) {
      let href = m[1];
      if (!href.startsWith('http')) href = 'https://www.eporner.com' + href;
      const title = decodeURIComponent(href.split('/').filter(Boolean).pop() || 'eporner').replace(/-/g, ' ');
      if (isAnimalContent(title)) continue;
      results.push({ url: href, title, source: 'eporner', type: 'video' });
    }
  }
  return _uniqBy(results).slice(0, limit);
}

async function epornerDownload(url) {
  try {
    return { ...(await ytdlpDownload(url, { maxMb: 50 })), source: 'eporner', url, type: 'video' };
  } catch (e) {
    throw new Error(`eporner: ${e.message}`);
  }
}

// ═══════════════════════════════════════════════════════════
// PORNPICS — fotos REAL (mulheres / cosplay / etc.)
// ═══════════════════════════════════════════════════════════
function _pornpicsUpgrade(url) {
  // 460 thumb → 1280 full quando possível
  return String(url || '').replace(/cdni\.pornpics\.com\/\d+\//, 'cdni.pornpics.com/1280/');
}

async function pornpicsSearch(query, limit = 24) {
  const q = String(query || 'sexy').trim();
  if (isAnimalContent(q)) throw new Error('termo bloqueado (animal/furry)');
  const url = `https://www.pornpics.com/?q=${encodeURIComponent(q)}`;
  const html = await _getHtml(url, { Referer: 'https://www.pornpics.com/' });
  const results = [];
  const re = /https:\/\/cdni\.pornpics\.com\/\d+\/\d+\/\d+\/\d+\/\d+_\d+_[a-f0-9]+\.jpg/gi;
  const found = [...new Set((html.match(re) || []))];
  // tenta apanhar alts próximos
  for (const thumb of found) {
    if (results.length >= limit) break;
    const idx = html.indexOf(thumb);
    const window = html.slice(Math.max(0, idx - 200), idx + thumb.length + 120);
    const altM = window.match(/alt="([^"]*)"/i);
    const title = _decode(altM?.[1] || q);
    if (isAnimalContent(title)) continue;
    const full = _pornpicsUpgrade(thumb);
    results.push({
      url: full,
      thumb,
      title: title.slice(0, 80) || q,
      source: 'pornpics',
      type: 'photo',
      direct: true,
    });
  }
  return _uniqBy(results).slice(0, limit);
}

async function pornpicsDownload(item) {
  const url = item.url || item;
  try {
    const buf = await _fetchBuf(url, 'https://www.pornpics.com/');
    return { buf, type: 'photo', title: item.title || 'pornpics', source: 'pornpics', url };
  } catch {
    // fallback thumb 460
    const thumb = item.thumb || String(url).replace('/1280/', '/460/');
    const buf = await _fetchBuf(thumb, 'https://www.pornpics.com/');
    return { buf, type: 'photo', title: item.title || 'pornpics', source: 'pornpics', url: thumb };
  }
}

// ═══════════════════════════════════════════════════════════
// XHAMSTER PHOTOS — galerias de fotos reais
// ═══════════════════════════════════════════════════════════
async function xhamsterPhotosSearch(query, limit = 20) {
  const q = encodeURIComponent(String(query || 'sexy').trim().replace(/\s+/g, ' '));
  if (isAnimalContent(query)) throw new Error('termo bloqueado (animal/furry)');
  const html = await _getHtml(`https://xhamster.com/photos/search/${q}`, { Referer: 'https://xhamster.com/' });
  const results = [];
  const re = /href="(https:\/\/xhamster\.com\/photos\/gallery\/[^"]+)"/gi;
  let m;
  const seen = new Set();
  while ((m = re.exec(html)) !== null && results.length < limit * 2) {
    const url = m[1].split('?')[0];
    if (seen.has(url)) continue;
    seen.add(url);
    const slug = url.split('/gallery/')[1] || '';
    const title = decodeURIComponent(slug).replace(/-\d+$/, '').replace(/-/g, ' ');
    if (isAnimalContent(title)) continue;
    results.push({ url, title: title.slice(0, 80), source: 'xhamster-photos', type: 'gallery' });
  }
  return results.slice(0, limit);
}

async function xhamsterGalleryPhotos(galleryUrl, limit = 12) {
  const html = await _getHtml(galleryUrl, { Referer: 'https://xhamster.com/' });
  const photos = [];
  const re = /https:\/\/[^"'\\s]+xhcdn\.com[^"'\\s]+/gi;
  const all = [...new Set(html.match(re) || [])];
  for (const u of all) {
    if (photos.length >= limit) break;
    if (/css|favicon|promo|sprite|logo|svg|static-ah|message\//i.test(u)) continue;
    if (!/(_1000|_450|_1600)\.(jpg|jpeg|png|webp)/i.test(u) && !/\/\d+_\d+\.(jpg|jpeg|png|webp)/i.test(u)) {
      if (!/\.(jpg|jpeg|png|webp)(\?|$)/i.test(u)) continue;
    }
    // prefere _1000
    photos.push(u.includes('_450') ? u.replace('_450', '_1000') : u);
  }
  return [...new Set(photos)].slice(0, limit);
}

async function xhamsterPhotoDownload(item) {
  if (item.type === 'gallery' || /\/photos\/gallery\//i.test(item.url || '')) {
    const urls = await xhamsterGalleryPhotos(item.url, 8);
    if (!urls.length) throw new Error('galeria xhamster sem fotos');
    const out = [];
    for (const u of urls.slice(0, 6)) {
      try {
        const buf = await _fetchBuf(u, 'https://xhamster.com/');
        if (buf.length > 2000) out.push({ buf, type: 'photo', title: item.title, source: 'xhamster-photos', url: u });
      } catch {}
    }
    if (!out.length) throw new Error('xhamster download falhou');
    return out; // array
  }
  const buf = await _fetchBuf(item.url || item, 'https://xhamster.com/');
  return [{ buf, type: 'photo', title: item.title || 'xhamster', source: 'xhamster-photos', url: item.url }];
}

// ═══════════════════════════════════════════════════════════
// SEX.COM — tenta site; senão Pornpics REAL (nunca anime/furry)
// ═══════════════════════════════════════════════════════════
async function sexcomSearch(query, { limit = 24, type = 'pics' } = {}) {
  if (isAnimalContent(query)) throw new Error('termo bloqueado (animal/furry)');
  const q = encodeURIComponent(String(query || 'sexy').trim());
  const paths = {
    pics: `https://www.sex.com/search/pics?query=${q}`,
    gifs: `https://www.sex.com/search/gifs?query=${q}`,
    videos: `https://www.sex.com/search/videos?query=${q}`,
    all: `https://www.sex.com/search?query=${q}`,
  };
  const results = [];
  try {
    const html = await _getHtml(paths[type] || paths.pics, { Referer: 'https://www.sex.com/' });
    const re = /href="(\/pin\/\d+\/?)"[^>]*>[\s\S]*?(?:data-src|src)="(https?:\/\/[^"]+)"[^>]*(?:alt="([^"]*)")?/gi;
    let m;
    while ((m = re.exec(html)) !== null && results.length < limit) {
      let href = m[1];
      if (!href.startsWith('http')) href = 'https://www.sex.com' + href;
      const thumb = _decode(m[2]);
      const title = _decode(m[3] || '') || 'sex.com';
      if (isAnimalContent(title)) continue;
      if (/static|icon|banner|apple-touch|flag/i.test(thumb)) continue;
      const isGif = /\.gif(\?|$)/i.test(thumb);
      results.push({
        url: href, thumb, title, source: 'sex.com',
        type: isGif ? 'gif' : (type === 'videos' ? 'video' : 'photo'),
      });
    }
    const re2 = /(https?:\/\/(?:image|images|cdn)[^"'\s]+(?:sex\.com|sxccdn)[^"'\s]+\.(?:jpg|jpeg|png|webp|gif|mp4))/gi;
    while ((m = re2.exec(html)) !== null && results.length < limit) {
      const u = _decode(m[1]);
      if (/static|icon|banner|apple-touch|flag|cuties/i.test(u)) continue;
      results.push({
        url: u, thumb: u, title: String(query || 'sex.com'), source: 'sex.com',
        type: /\.gif/i.test(u) ? 'gif' : /\.mp4/i.test(u) ? 'video' : 'photo',
        direct: true,
      });
    }
  } catch {}

  if (results.length) return _uniqBy(results).slice(0, limit);

  // Fallback REAL: Pornpics (fotos humanas) — NÃO nekos/e621/anime
  const pp = await pornpicsSearch(String(query || 'sexy'), limit);
  return pp.map((x) => ({
    ...x,
    source: 'pornpics',
    via: 'sex.com-fallback-real',
    title: x.title || String(query || 'sexy'),
  }));
}

async function sexcomResolve(item) {
  if (item.source === 'pornpics' || item.via === 'sex.com-fallback-real' || item.direct && /pornpics\.com/i.test(item.url || '')) {
    return pornpicsDownload(item);
  }
  if (item.direct && item.url) {
    const buf = await _fetchBuf(item.url, 'https://www.sex.com/');
    const type = /\.mp4/i.test(item.url) ? 'video' : /\.gif/i.test(item.url) ? 'gif' : 'photo';
    return { buf, type, title: item.title, source: 'sex.com', url: item.url };
  }
  try {
    const html = await _getHtml(item.url || item, { Referer: 'https://www.sex.com/' });
    let mediaUrl =
      (html.match(/property="og:video"[^>]+content="([^"]+)"/i) || [])[1] ||
      (html.match(/property="og:image"[^>]+content="([^"]+)"/i) || [])[1] ||
      (html.match(/rel="image_src"[^>]+href="([^"]+)"/i) || [])[1] ||
      item.thumb;
    if (!mediaUrl) throw new Error('sem media');
    mediaUrl = _decode(mediaUrl);
    const buf = await _fetchBuf(mediaUrl, 'https://www.sex.com/');
    const type = /\.mp4/i.test(mediaUrl) ? 'video' : /\.gif/i.test(mediaUrl) ? 'gif' : 'photo';
    return { buf, type, title: item.title || 'sex.com', source: 'sex.com', url: mediaUrl };
  } catch {
    // último recurso real
    const pp = await pornpicsSearch(item.title || 'sexy', 3);
    if (!pp[0]) throw new Error('sex.com: sem mídia real');
    return pornpicsDownload(pp[0]);
  }
}

// ═══════════════════════════════════════════════════════════
// COSPLAY / GOSTOSAS — SÓ FOTOS REAIS (sem anime/furry/animal)
// ═══════════════════════════════════════════════════════════
async function cosplaySearch(query = 'cosplay', limit = 16) {
  const q = String(query || 'cosplay sexy').trim() || 'cosplay';
  if (isAnimalContent(q)) throw new Error('termo bloqueado (animal/furry)');
  // força termos de foto real
  const boosted = /cosplay|gostos|sexy|linda|fantasia|woman|girl|model/i.test(q) ? q : `${q} cosplay`;
  const settled = await Promise.allSettled([
    pornpicsSearch(boosted, limit),
    pornpicsSearch(`${boosted} woman`, Math.ceil(limit / 2)),
    xhamsterPhotosSearch(boosted, Math.ceil(limit / 2)),
  ]);
  const all = [];
  for (const s of settled) {
    if (s.status !== 'fulfilled') continue;
    for (const item of s.value || []) {
      if (isAnimalContent(item.title || '')) continue;
      all.push(item);
    }
  }
  // erome real albums (photos)
  try {
    const erome = require('./erome');
    const albums = (await erome.search(boosted)).filter(a => !isAnimalContent(a.name || '') && !erome.isFiltered?.(a.name, a.url));
    for (const a of albums.slice(0, 8)) {
      all.push({
        url: a.url,
        title: a.name || boosted,
        source: 'erome',
        type: 'album',
        thumb: a.thumb || '',
      });
    }
  } catch {}

  return _uniqBy(all, 'url').slice(0, limit);
}

async function cosplayDownload(item) {
  if (!item) throw new Error('item vazio');
  if (isAnimalContent(item.title || '')) throw new Error('conteúdo animal bloqueado');

  if (item.source === 'pornpics' || /pornpics\.com/i.test(item.url || '')) {
    return pornpicsDownload(item);
  }
  if (item.source === 'xhamster-photos' || /xhamster\.com\/photos/i.test(item.url || '')) {
    const arr = await xhamsterPhotoDownload(item);
    return arr[0] || arr;
  }
  if (item.source === 'erome' || /erome\.com/i.test(item.url || '')) {
    const erome = require('./erome');
    const r = await erome.albumToMedia(item.url, 12, { photosOnly: true });
    if (!r.media?.length) throw new Error('erome sem fotos');
    const m = r.media[0];
    return { buf: m.buf, type: 'photo', title: r.name || item.title, source: 'erome', url: m.url };
  }
  // URL directa de imagem
  if (/\.(jpe?g|png|webp)(\?|$)/i.test(item.url || '')) {
    const buf = await _fetchBuf(item.url, item.source === 'xhamster-photos' ? 'https://xhamster.com/' : 'https://www.pornpics.com/');
    return { buf, type: 'photo', title: item.title || 'foto', source: item.source || 'direct', url: item.url };
  }
  throw new Error('fonte de foto real desconhecida: ' + (item.source || '?'));
}

/** Baixa várias fotos do item (galeria/álbum). */
async function cosplayDownloadMany(item, max = 6) {
  if (item.source === 'xhamster-photos' || /xhamster\.com\/photos\/gallery/i.test(item.url || '')) {
    return xhamsterPhotoDownload(item);
  }
  if (item.source === 'erome' || /erome\.com\/a\//i.test(item.url || '')) {
    const erome = require('./erome');
    const r = await erome.albumToMedia(item.url, max, { photosOnly: true });
    return (r.media || []).map(m => ({
      buf: m.buf, type: 'photo', title: r.name, source: 'erome', url: m.url,
    }));
  }
  if (item.source === 'pornpics' || /pornpics\.com/i.test(item.url || '')) {
    const one = await pornpicsDownload(item);
    return [one];
  }
  const one = await cosplayDownload(item);
  return Array.isArray(one) ? one : [one];
}

// ═══════════════════════════════════════════════════════════
// PLAQUINHAS +18 (geração local — não é “fake media de site”)
// ═══════════════════════════════════════════════════════════
async function placa18(texto, estilo = 'hot') {
  const t = String(texto || '').trim().slice(0, 80);
  if (!t) throw new Error('texto vazio');
  if (isAnimalContent(t)) throw new Error('texto bloqueado');
  try {
    const data = await mediaHandler.fetchJson(
      `https://systemzone.store/v1/placas/neymar-placa?texto=${encodeURIComponent('🔥 ' + t)}`,
      25000,
    );
    if (data?.url || data?.image || data?.resultado) {
      const u = data.url || data.image || data.resultado;
      const buf = await mediaHandler.fetchBuffer(u);
      if (buf?.length > 1000) return { buf, source: 'systemzone' };
    }
  } catch {}

  const sharp = require('sharp');
  const W = 1080, H = 540;
  const esc = (s) => String(s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  const words = t.split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > 28) { if (cur) lines.push(cur); cur = w; }
    else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur);
  const linesSvg = lines.slice(0, 5).map((ln, i) =>
    `<text x="540" y="${230 + i * 52}" text-anchor="middle" font-family="Arial Black, Arial" font-size="42" font-weight="900" fill="#fff">${esc(ln)}</text>`
  ).join('');
  const accents = { hot: '#f43f5e', pink: '#ec4899', gold: '#fbbf24', purple: '#a78bfa' };
  const accent = accents[estilo] || accents.hot;
  const svg = Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#1a0510"/>
        <stop offset="1" stop-color="#3b0764"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#g)"/>
    <rect x="40" y="40" width="${W - 80}" height="${H - 80}" rx="24" fill="none" stroke="${accent}" stroke-width="4" opacity="0.9"/>
    <text x="540" y="120" text-anchor="middle" font-family="Arial" font-size="28" fill="${accent}" font-weight="700" letter-spacing="6">+18 PLAQUINHA</text>
    ${linesSvg}
    <text x="540" y="${H - 60}" text-anchor="middle" font-family="Arial" font-size="20" fill="#94a3b8">DARK BOT</text>
  </svg>`);
  const buf = await sharp(svg).jpeg({ quality: 90 }).toBuffer();
  return { buf, source: 'local' };
}

module.exports = {
  isAnimalContent,
  ANIMAL_BLOCK,
  xvideosSearch,
  xvideosDownload,
  pornhubSearch,
  pornhubDownload,
  epornerSearch,
  epornerDownload,
  pornpicsSearch,
  pornpicsDownload,
  xhamsterPhotosSearch,
  xhamsterGalleryPhotos,
  xhamsterPhotoDownload,
  sexcomSearch,
  sexcomResolve,
  cosplaySearch,
  cosplayDownload,
  cosplayDownloadMany,
  placa18,
  ytdlpDownload,
};
