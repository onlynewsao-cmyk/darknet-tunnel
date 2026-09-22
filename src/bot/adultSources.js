'use strict';
/**
 * DARK BOT v11.2.7 — Fontes adultas REAL + sex.com API REAL (sem placeholder / sem furry / sem animal)
 *
 * VÍDEO:  XVideos · Pornhub · Eporner  (yt-dlp + scrape mp4)
 * FOTOS:  Pornpics · xHamster Photos · Erome  (JPEG real)
 * SEX.COM: API REAL /portal/api/pictures/search (imagex1.sx.cdn.live) — 397k resultados, JPEG real
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
// SEX.COM — API REAL descoberta 2026-09-22
// Verificado em https://www.sex.com/en :
//   /portal/api/pictures/search?search=blonde&sexual-orientation=straight&order=likeCount&page=1&limit=40  -> 200 OK, 397k resultados
//   /portal/api/gifs/search  mesmo esquema
//   imagem: https://imagex1.sx.cdn.live + uri  (ex: /images/pinporn/2012/05/30/286956.jpg) -> JPEG 195KB real
// ═══════════════════════════════════════════════════════════
const SEXCOM_IMG_BASE = 'https://imagex1.sx.cdn.live';
const SEXCOM_API_PICS = 'https://www.sex.com/portal/api/pictures/search';
const SEXCOM_API_GIFS = 'https://www.sex.com/portal/api/gifs/search';

async function _sexcomApiSearch({ query, limit = 24, type = 'pics', page = 1, order = 'likeCount' }) {
  const q = String(query || '').trim();
  if (!q) throw new Error('query vazia');
  if (isAnimalContent(q)) throw new Error('termo bloqueado (animal/furry)');
  const base = type === 'gifs' ? SEXCOM_API_GIFS : SEXCOM_API_PICS;
  const params = new URLSearchParams({
    search: q,
    'sexual-orientation': 'straight',
    order,
    page: String(page),
    limit: String(Math.min(Math.max(limit, 1), 100)),
  });
  const url = `${base}?${params.toString()}`;
  const r = await axios.get(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'application/json, text/plain, */*',
      Referer: `https://www.sex.com/en/${type === 'gifs' ? 'gifs' : 'pics'}?search=${encodeURIComponent(q)}`,
      'Accept-Language': 'en-US,en;q=0.9',
      'X-Requested-With': 'XMLHttpRequest',
    },
    timeout: 20000,
    validateStatus: s => s < 500,
  });
  if (r.status >= 400) throw new Error(`sex.com API HTTP ${r.status}: ${JSON.stringify(r.data).slice(0, 200)}`);
  const data = r.data;
  const items = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
  if (!items.length) return [];
  const out = [];
  for (const it of items) {
    const uri = it.uri || it.image || it.url || '';
    if (!uri) continue;
    const full = uri.startsWith('http') ? uri : SEXCOM_IMG_BASE + uri;
    const thumb = full + (full.includes('?') ? '&' : '?') + 'width=400';
    const title = _decode(it.title || q).slice(0, 120);
    if (isAnimalContent(title)) continue;
    out.push({
      id: it.id || it.externalId,
      externalId: it.externalId,
      uri,
      url: full,
      thumb,
      title: title || q,
      width: it.width,
      height: it.height,
      source: 'sex.com',
      type: type === 'gifs' ? 'gif' : 'photo',
      direct: true,
      api: true,
    });
  }
  return _uniqBy(out, 'url').slice(0, limit);
}

async function sexcomSearch(query, { limit = 24, type = 'pics' } = {}) {
  const q = String(query || 'sexy').trim() || 'sexy';
  if (isAnimalContent(q)) throw new Error('termo bloqueado (animal/furry)');
  if (type === 'pics' || type === 'gifs' || type === 'all') {
    try {
      const res = await _sexcomApiSearch({ query: q, limit, type: type === 'gifs' ? 'gifs' : 'pics' });
      if (res.length) return res;
    } catch (e) {
      console.warn('[sex.com] API falhou, tentando HTML fallback:', e.message.slice(0, 120));
    }
  }
  if (type === 'videos') {
    try {
      const html = await _getHtml(`https://www.sex.com/en/videos?search=${encodeURIComponent(q)}`, { Referer: 'https://www.sex.com/' });
      const results = [];
      const re = /href="(\/en\/videos\/\d+[^"]*)"[^>]*>[\s\S]*?title="([^"]*)"/gi;
      let m;
      while ((m = re.exec(html)) !== null && results.length < limit) {
        const href = 'https://www.sex.com' + m[1].split('?')[0];
        const title = _decode(m[2] || q);
        if (isAnimalContent(title)) continue;
        results.push({ url: href, title, source: 'sex.com', type: 'video' });
      }
      if (results.length) return _uniqBy(results).slice(0, limit);
    } catch {}
  }
  const pp = await pornpicsSearch(q, limit);
  return pp.map((x) => ({
    ...x,
    source: 'pornpics',
    via: 'sex.com-fallback-real',
    title: x.title || q,
  }));
}

async function sexcomResolve(item) {
  if (!item) throw new Error('item vazio');
  if (item.source === 'pornpics' || item.via === 'sex.com-fallback-real' || /pornpics\.com/i.test(item.url || '')) {
    return pornpicsDownload(item);
  }
  // VIDEO / SHORTS - tenta yt-dlp primeiro
  if (item.type === 'video' || item.type === 'shorts' || item.type === 'short' || /\/en\/videos\//i.test(item.url || '')) {
    try {
      const dl = await ytdlpDownload(item.url, { maxMb: 50 });
      return { buf: dl.buf, type: item.type === 'shorts' || item.type === 'short' ? 'shorts' : 'video', title: item.title || 'sex.com video', source: 'sex.com', url: item.url };
    } catch (e) {
      // tenta scrape og:video
      try {
        const html = await _getHtml(item.url, { Referer: 'https://www.sex.com/' });
        const ogVid = (html.match(/property="og:video"[^>]+content="([^"]+)"/i) || [])[1] ||
                      (html.match(/property="og:video:url"[^>]+content="([^"]+)"/i) || [])[1] ||
                      (html.match(/<source[^>]+src="([^"]+\.mp4[^"]*)"/i) || [])[1];
        if (ogVid) {
          const mediaUrl = _decode(ogVid);
          const buf = await _fetchBuf(mediaUrl.startsWith('/') ? SEXCOM_IMG_BASE + mediaUrl : mediaUrl, 'https://www.sex.com/');
          return { buf, type: 'video', title: item.title || 'sex.com', source: 'sex.com', url: mediaUrl };
        }
      } catch {}
      // fallback para foto real para não quebrar
      const pp = await pornpicsSearch(item.title || 'sexy', 3);
      if (pp[0]) return pornpicsDownload(pp[0]);
      throw new Error('sex.com video: ' + e.message);
    }
  }
  if (item.source === 'sex.com' && (item.uri || /imagex1\.sx\.cdn\.live|pinporn/i.test(item.url || ''))) {
    const directUrl = item.url || (item.uri ? SEXCOM_IMG_BASE + item.uri : null);
    if (!directUrl) throw new Error('sex.com sem URL');
    const highRes = directUrl.includes('?') ? directUrl.split('?')[0] : directUrl;
    try {
      const buf = await _fetchBuf(highRes, 'https://www.sex.com/');
      const type = /\.gif|\.webp$/i.test(highRes) ? 'gif' : 'photo';
      return { buf, type, title: item.title || 'sex.com', source: 'sex.com', url: highRes };
    } catch {
      const sized = highRes + '?width=1280';
      const buf = await _fetchBuf(sized, 'https://www.sex.com/');
      return { buf, type: /webp|gif/i.test(sized) ? 'gif' : 'photo', title: item.title || 'sex.com', source: 'sex.com', url: sized };
    }
  }
  if (item.direct && item.url) {
    const buf = await _fetchBuf(item.url, 'https://www.sex.com/');
    const type = /\.mp4/i.test(item.url) ? 'video' : /\.gif/i.test(item.url) || /\.webp/i.test(item.url) ? 'gif' : 'photo';
    return { buf, type, title: item.title, source: 'sex.com', url: item.url };
  }
  try {
    const html = await _getHtml(item.url || item, { Referer: 'https://www.sex.com/' });
    let mediaUrl =
      (html.match(/property="og:image"[^>]+content="([^"]+)"/i) || [])[1] ||
      (html.match(/property="og:video"[^>]+content="([^"]+)"/i) || [])[1] ||
      (html.match(/rel="image_src"[^>]+href="([^"]+)"/i) || [])[1] ||
      item.thumb;
    if (!mediaUrl) throw new Error('sem media');
    mediaUrl = _decode(mediaUrl);
    if (mediaUrl.startsWith('/')) mediaUrl = SEXCOM_IMG_BASE + mediaUrl;
    const buf = await _fetchBuf(mediaUrl, 'https://www.sex.com/');
    const type = /\.mp4/i.test(mediaUrl) ? 'video' : /\.gif|webp/i.test(mediaUrl) ? 'gif' : 'photo';
    return { buf, type, title: item.title || 'sex.com', source: 'sex.com', url: mediaUrl };
  } catch {
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
  // força termos de foto real — agora com sex.com REAL também
  const boosted = /cosplay|gostos|sexy|linda|fantasia|woman|girl|model/i.test(q) ? q : `${q} cosplay`;
  const settled = await Promise.allSettled([
    pornpicsSearch(boosted, limit),
    pornpicsSearch(`${boosted} woman`, Math.ceil(limit / 2)),
    xhamsterPhotosSearch(boosted, Math.ceil(limit / 2)),
    sexcomSearch(boosted, { limit, type: 'pics' }),
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

  // mistura para não privilegiar só pornpics — sex.com tem cosplay real
  const uniq = _uniqBy(all, 'url');
  // Fisher-Yates shuffle leve para variar fontes
  for (let i = uniq.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [uniq[i], uniq[j]] = [uniq[j], uniq[i]];
  }
  return uniq.slice(0, limit);
}

async function cosplayDownload(item) {
  if (!item) throw new Error('item vazio');
  if (isAnimalContent(item.title || '')) throw new Error('conteúdo animal bloqueado');

  if (item.source === 'sex.com' || /imagex1\.sx\.cdn\.live|pinporn/i.test(item.url || '')) {
    return sexcomResolve(item);
  }
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
  // URL directa de imagem (sex.com / pornpics / etc)
  if (/\.(jpe?g|png|webp)(\?|$)/i.test(item.url || '')) {
    const ref = item.source === 'xhamster-photos' ? 'https://xhamster.com/' : item.source === 'sex.com' ? 'https://www.sex.com/' : 'https://www.pornpics.com/';
    const buf = await _fetchBuf(item.url, ref);
    return { buf, type: 'photo', title: item.title || 'foto', source: item.source || 'direct', url: item.url };
  }
  throw new Error('fonte de foto real desconhecida: ' + (item.source || '?'));
}

/** Baixa várias fotos do item (galeria/álbum). */
async function cosplayDownloadMany(item, max = 6) {
  if (item.source === 'sex.com' || /imagex1\.sx\.cdn\.live|pinporn/i.test(item.url || '')) {
    const one = await sexcomResolve(item);
    return [one];
  }
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

async function pornhubShortsSearch(query, limit = 20) {
  const q = encodeURIComponent(String(query || '').trim());
  if (!q) throw new Error('query vazia');
  if (isAnimalContent(query)) throw new Error('termo bloqueado (animal/furry)');
  // Pornhub não tem endpoint oficial shorts, mas filtra por duração curta via HTML ou usa /video/search?search=&o=mr
  // Vamos tentar buscar e filtrar duração < 6min quando disponível, senão retorna normal marcado como shorts
  try {
    const html = await _getHtml(`https://www.pornhub.com/video/search?search=${q}&o=mr`, { Referer: 'https://www.pornhub.com/' });
    const results = [];
    // tenta extrair duração: <var class="duration"> ou data-mediumthumb
    const re = /href="(\/view_video\.php\?viewkey=[a-zA-Z0-9]+)"[^>]*>[\s\S]*?(?:class="duration">([^<]+)<|data-mediabook)/gi;
    // fallback simples: pega viewkeys como no search normal mas marca shorts
    const reSimple = /href="(\/view_video\.php\?viewkey=[a-zA-Z0-9]+)"[^>]*title="([^"]*)"/gi;
    let m;
    while ((m = reSimple.exec(html)) !== null && results.length < limit * 3) {
      let href = m[1];
      const title = _decode(m[2] || '');
      if (isAnimalContent(title)) continue;
      if (!href.startsWith('http')) href = 'https://www.pornhub.com' + href;
      results.push({ url: href, title: title || `PH Short ${m[1].slice(-6)}`, source: 'pornhub', type: 'shorts', isShort: true });
    }
    if (!results.length) {
      const re2 = /viewkey=([a-zA-Z0-9]+)/g;
      const keys = new Set();
      while ((m = re2.exec(html)) !== null && keys.size < limit) keys.add(m[1]);
      for (const k of keys) {
        results.push({ url: `https://www.pornhub.com/view_video.php?viewkey=${k}`, title: `PH Short ${k}`, source: 'pornhub', type: 'shorts', isShort: true });
      }
    }
    return _uniqBy(results).slice(0, limit);
  } catch (e) {
    // fallback para search normal
    const normal = await pornhubSearch(query, limit);
    return normal.map(r => ({ ...r, type: 'shorts', isShort: true }));
  }
}

async function xvideosShortsSearch(query, limit = 20) {
  const res = await xvideosSearch(query, limit);
  return res.map(r => ({ ...r, type: 'shorts', isShort: true }));
}

async function sexcomShortsSearch(query, limit = 20) {
  const q = String(query || 'sexy').trim();
  if (isAnimalContent(q)) throw new Error('termo bloqueado');
  // sex.com gifs são os shorts reais (loop curto) + tenta videos
  try {
    const gifs = await _sexcomApiSearch({ query: q, limit, type: 'gifs' });
    if (gifs.length) return gifs.map(g => ({ ...g, type: 'shorts', isShort: true, source: 'sex.com' }));
  } catch {}
  // fallback videos
  const vids = await sexcomSearch(q, { limit, type: 'videos' });
  return vids.map(v => ({ ...v, type: 'shorts', isShort: true }));
}

async function pornhubShortsDownload(url) {
  return pornhubDownload(url);
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
  pornhubShortsSearch,
  pornhubShortsDownload,
  xvideosShortsSearch,
  sexcomShortsSearch,
  cosplaySearch,
  cosplayDownload,
  cosplayDownloadMany,
  placa18,
  ytdlpDownload,
};
