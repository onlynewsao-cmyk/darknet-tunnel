'use strict';
/**
 * DARK BOT v11.2.5 — Fontes adultas (xvideos, pornhub, sex.com, cosplay/fotos)
 * Scrapers leves + yt-dlp quando disponível. Sem API keys.
 * Filtro legal herdado de portal18.isBlocked (chamado pelos handlers).
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
    seen.add(k);
    return true;
  });
}

// ─── yt-dlp helper ───────────────────────────────────────────
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

// ═══════════════════════════════════════════════════════════
// XVIDEOS
// ═══════════════════════════════════════════════════════════
async function xvideosSearch(query, limit = 20) {
  const q = encodeURIComponent(String(query || '').trim());
  if (!q) throw new Error('query vazia');
  const html = await _getHtml(`https://www.xvideos.com/?k=${q}`, { Referer: 'https://www.xvideos.com/' });
  const results = [];
  // data-id + href thumbs
  const re = /<div[^>]+id="video_(\d+)"[\s\S]*?<a[^>]+href="(\/video[^"]+)"[^>]*title="([^"]*)"/gi;
  let m;
  while ((m = re.exec(html)) !== null && results.length < limit) {
    const id = m[1];
    let href = m[2];
    const title = _decode(m[3]);
    if (!href.startsWith('http')) href = 'https://www.xvideos.com' + href;
    results.push({ id, url: href, title: title || `XVideos #${id}`, source: 'xvideos', type: 'video' });
  }
  // fallback: plain video links
  if (!results.length) {
    const re2 = /href="(\/video\.[^"]+\/[^"]+)"[^>]*title="([^"]*)"/gi;
    while ((m = re2.exec(html)) !== null && results.length < limit) {
      let href = m[1];
      if (!href.startsWith('http')) href = 'https://www.xvideos.com' + href;
      results.push({ url: href, title: _decode(m[2]) || 'XVideos', source: 'xvideos', type: 'video' });
    }
  }
  return _uniqBy(results);
}

async function xvideosDownload(url) {
  // tenta yt-dlp; fallback scrape low quality mp4
  try {
    const r = await ytdlpDownload(url, { maxMb: 50 });
    return { ...r, source: 'xvideos', url };
  } catch (e1) {
    try {
      const html = await _getHtml(url, { Referer: 'https://www.xvideos.com/' });
      const m = html.match(/html5player\.setVideoUrlHigh\('([^']+)'\)/)
        || html.match(/html5player\.setVideoUrlLow\('([^']+)'\)/)
        || html.match(/setVideoUrlHigh\("([^"]+)"\)/)
        || html.match(/"(https?:\/\/[^"]+\.mp4[^"]*)"/i);
      if (!m) throw new Error('stream não encontrado');
      const stream = _decode(m[1]);
      const buf = await mediaHandler.fetchBuffer(stream, 5, {
        headers: { Referer: 'https://www.xvideos.com/', 'User-Agent': UA },
        timeout: 120000,
      });
      if (!buf || buf.length < 10000) throw new Error('download vazio');
      return { buf, size: buf.length, source: 'xvideos', url, title: 'xvideos' };
    } catch (e2) {
      throw new Error(`xvideos: ${e1.message} | ${e2.message}`);
    }
  }
}

// ═══════════════════════════════════════════════════════════
// PORNHUB
// ═══════════════════════════════════════════════════════════
async function pornhubSearch(query, limit = 20) {
  const q = encodeURIComponent(String(query || '').trim());
  if (!q) throw new Error('query vazia');
  const html = await _getHtml(`https://www.pornhub.com/video/search?search=${q}`, {
    Referer: 'https://www.pornhub.com/',
  });
  const results = [];
  const re = /href="(\/view_video\.php\?viewkey=[a-zA-Z0-9]+)"[^>]*title="([^"]*)"/gi;
  let m;
  while ((m = re.exec(html)) !== null && results.length < limit) {
    let href = m[1];
    if (!href.startsWith('http')) href = 'https://www.pornhub.com' + href;
    results.push({ url: href, title: _decode(m[2]) || 'Pornhub', source: 'pornhub', type: 'video' });
  }
  // data-related-url fallback
  if (!results.length) {
    const re2 = /viewkey=([a-zA-Z0-9]+)/g;
    const keys = new Set();
    while ((m = re2.exec(html)) !== null && keys.size < limit) keys.add(m[1]);
    for (const k of keys) {
      results.push({ url: `https://www.pornhub.com/view_video.php?viewkey=${k}`, title: `PH ${k}`, source: 'pornhub', type: 'video' });
    }
  }
  return _uniqBy(results);
}

async function pornhubDownload(url) {
  try {
    const r = await ytdlpDownload(url, { maxMb: 50 });
    return { ...r, source: 'pornhub', url };
  } catch (e) {
    throw new Error(`pornhub: ${e.message}. Tenta outro resultado ou instala yt-dlp.`);
  }
}

// ═══════════════════════════════════════════════════════════
// SEX.COM  (pins / gifs / pics / videos curtos)
// ═══════════════════════════════════════════════════════════
async function sexcomSearch(query, { limit = 24, type = 'pics' } = {}) {
  // type: pics | gifs | videos | all
  // NOTA 2026: sex.com é SPA Next.js — HTML sem pins. Tentamos scrape;
  // se vazio, faz fallback para boorus/nekos (fotos/gifs reais) etiquetado.
  const q = encodeURIComponent(String(query || 'sexy').trim());
  const paths = {
    pics: `https://www.sex.com/search/pics?query=${q}`,
    gifs: `https://www.sex.com/search/gifs?query=${q}`,
    videos: `https://www.sex.com/search/videos?query=${q}`,
    all: `https://www.sex.com/search?query=${q}`,
  };
  const url = paths[type] || paths.pics;
  const results = [];
  try {
    const html = await _getHtml(url, { Referer: 'https://www.sex.com/' });
    const re = /href="(\/pin\/\d+\/?)"[^>]*>[\s\S]*?(?:data-src|src)="(https?:\/\/[^"]+)"[^>]*(?:alt="([^"]*)")?/gi;
    let m;
    while ((m = re.exec(html)) !== null && results.length < limit) {
      let href = m[1];
      if (!href.startsWith('http')) href = 'https://www.sex.com' + href;
      const thumb = _decode(m[2]);
      const title = _decode(m[3] || '') || 'sex.com';
      const isGif = /\.gif(\?|$)/i.test(thumb) || /gif/i.test(href);
      results.push({
        url: href, thumb, title, source: 'sex.com',
        type: isGif ? 'gif' : (type === 'videos' ? 'video' : 'photo'),
      });
    }
    if (!results.length) {
      const re2 = /(https?:\/\/(?:image|images|cdn)[^"'\s]+(?:sex\.com|sxccdn)[^"'\s]+\.(?:jpg|jpeg|png|webp|gif|mp4))/gi;
      while ((m = re2.exec(html)) !== null && results.length < limit) {
        const u = _decode(m[1]);
        if (/static|icon|banner|apple-touch|flag/i.test(u)) continue;
        results.push({
          url: u, thumb: u, title: 'sex.com media', source: 'sex.com',
          type: /\.gif/i.test(u) ? 'gif' : /\.mp4/i.test(u) ? 'video' : 'photo',
          direct: true,
        });
      }
    }
  } catch {}

  if (results.length) return _uniqBy(results);

  // Fallback: fotos/gifs reais (cosplay/booru) — o menu promete media
  const fb = await cosplaySearch(String(query || 'sexy'), limit);
  return fb.map((x) => ({
    ...x,
    source: `sex.com→${x.source}`,
    title: x.title || String(query || 'sexy'),
  }));
}

async function sexcomResolve(item) {
  // se já é media directa
  if (item.direct && item.url) {
    const buf = await mediaHandler.fetchBuffer(item.url, 5, {
      headers: { Referer: 'https://www.sex.com/', 'User-Agent': UA },
      timeout: 60000,
    });
    return { buf, type: item.type || 'photo', title: item.title, source: 'sex.com', url: item.url };
  }
  const html = await _getHtml(item.url || item, { Referer: 'https://www.sex.com/' });
  // image_src / og:image / video
  let mediaUrl =
    (html.match(/property="og:video"[^>]+content="([^"]+)"/i) || [])[1] ||
    (html.match(/property="og:image"[^>]+content="([^"]+)"/i) || [])[1] ||
    (html.match(/rel="image_src"[^>]+href="([^"]+)"/i) || [])[1] ||
    (html.match(/data-src="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp|gif|mp4)[^"]*)"/i) || [])[1] ||
    (html.match(/src="(https?:\/\/(?:image|images|cdn)[^"]+\.(?:jpg|jpeg|png|webp|gif|mp4)[^"]*)"/i) || [])[1];
  if (!mediaUrl && item.thumb) mediaUrl = item.thumb;
  if (!mediaUrl) throw new Error('sex.com: media não encontrada no pin');
  mediaUrl = _decode(mediaUrl);
  const buf = await mediaHandler.fetchBuffer(mediaUrl, 5, {
    headers: { Referer: 'https://www.sex.com/', 'User-Agent': UA },
    timeout: 60000,
  });
  if (!buf || buf.length < 800) throw new Error('sex.com: download vazio');
  const type = /\.mp4/i.test(mediaUrl) ? 'video'
    : /\.gif/i.test(mediaUrl) ? 'gif'
    : 'photo';
  return { buf, type, title: item.title || 'sex.com', source: 'sex.com', url: mediaUrl };
}

// ═══════════════════════════════════════════════════════════
// FOTOS — jovens mulheres / cosplay / fantasia (APIs públicas adultas + tags)
// Fontes: waifu.im nsfw, gelbooru (rating:explicit), rule34, danbooru
// ═══════════════════════════════════════════════════════════
const COSPLAY_QUERIES = {
  cosplay: 'cosplay rating:explicit',
  gostosa: 'solo female rating:explicit',
  sexy: 'beautiful_female rating:explicit -loli -shota',
  fantasia: 'fantasy cosplay rating:explicit',
  linda: '1girl solo highres rating:explicit -loli',
  default: '1girl solo cosplay rating:explicit -loli -shota -cub',
};

async function _gelbooru(tags, limit = 12) {
  const t = encodeURIComponent(`${tags} -loli -shota -cub -young`);
  const url = `https://gelbooru.com/index.php?page=dapi&s=post&q=index&json=1&limit=${Math.min(limit, 40)}&tags=${t}`;
  const r = await axios.get(url, { headers: _headers(), timeout: 20000, validateStatus: () => true });
  if (r.status >= 400) return [];
  const posts = Array.isArray(r.data) ? r.data : (r.data?.post || []);
  return (posts || []).map((p) => ({
    url: p.file_url || p.sample_url,
    thumb: p.preview_url || p.sample_url,
    title: (p.tags || '').split(' ').slice(0, 6).join(' '),
    source: 'gelbooru',
    type: /\.gif|\.mp4|\.webm/i.test(p.file_url || '') ? 'gif' : 'photo',
    score: p.score || 0,
  })).filter(x => x.url && /^https?:\/\//.test(x.url));
}

async function _rule34(tags, limit = 12) {
  const t = encodeURIComponent(`${tags} -loli -shota -cub`);
  const url = `https://api.rule34.xxx/index.php?page=dapi&s=post&q=index&json=1&limit=${Math.min(limit, 40)}&tags=${t}`;
  const r = await axios.get(url, { headers: _headers(), timeout: 20000, validateStatus: () => true });
  const posts = Array.isArray(r.data) ? r.data : [];
  return posts.map((p) => ({
    url: p.file_url,
    thumb: p.preview_url || p.sample_url,
    title: (p.tags || '').split(' ').slice(0, 6).join(' '),
    source: 'rule34',
    type: /\.gif|\.mp4|\.webm/i.test(p.file_url || '') ? 'gif' : 'photo',
  })).filter(x => x.url && /^https?:\/\//.test(x.url));
}

async function _waifuIm(limit = 8) {
  try {
    const r = await axios.get(`https://api.waifu.im/search?is_nsfw=true&limit=${Math.min(limit, 30)}`, {
      headers: _headers({ Accept: 'application/json' }),
      timeout: 15000, validateStatus: () => true,
    });
    const imgs = r.data?.images || [];
    return imgs.map((im) => ({
      url: im.url, thumb: im.url,
      title: (im.tags || []).map(t => t.name).join(' ') || 'waifu.im',
      source: 'waifu.im', type: im.extension === 'gif' ? 'gif' : 'photo',
    })).filter(x => x.url);
  } catch { return []; }
}

/** nekos.life lewd/neko — sempre disponível neste sandbox */
async function _nekosLewd(limit = 6) {
  const out = [];
  const endpoints = [
    'https://nekos.life/api/v2/img/lewd',
    'https://nekos.life/api/v2/img/waifu',
    'https://nekos.life/api/v2/img/neko',
    'https://nekos.life/api/v2/img/trap',
  ];
  for (let i = 0; i < limit; i++) {
    try {
      const ep = endpoints[i % endpoints.length];
      const r = await axios.get(ep, { headers: _headers({ Accept: 'application/json' }), timeout: 12000 });
      if (r.data?.url) {
        out.push({
          url: r.data.url, thumb: r.data.url,
          title: ep.split('/').pop() || 'nekos',
          source: 'nekos.life', type: 'photo',
        });
      }
    } catch {}
  }
  return out;
}

/** yande.re / e621 via portal18 (já testado no bot) */
async function _portalBoorus(tags, limit = 10) {
  try {
    const p18 = require('./portal18');
    const settled = await Promise.allSettled([
      p18.yandeImages(tags, Math.ceil(limit / 2)).catch(() => []),
      p18.e621Images(tags.includes('rating') ? tags : `rating:e ${tags}`, Math.ceil(limit / 2)).catch(() => []),
      p18.konachanImages(tags, Math.ceil(limit / 3)).catch(() => []),
      p18.nekosLifeImage('lewd').catch(() => []),
    ]);
    return settled.flatMap((s) => {
      if (s.status !== 'fulfilled') return [];
      const arr = Array.isArray(s.value) ? s.value : (s.value ? [s.value] : []);
      return arr.map((img) => ({
        url: img.url || img.file_url,
        thumb: img.preview || img.url,
        title: (img.tags || img.source || 'foto').toString().slice(0, 60),
        source: img.source || 'booru',
        type: /\.gif|\.webm|\.mp4/i.test(img.url || '') ? 'gif' : 'photo',
      })).filter(x => x.url);
    });
  } catch { return []; }
}

async function cosplaySearch(query = '', limit = 16) {
  const q = String(query || '').trim().toLowerCase();
  let tags = COSPLAY_QUERIES.default;
  for (const [k, v] of Object.entries(COSPLAY_QUERIES)) {
    if (k !== 'default' && q.includes(k)) { tags = v; break; }
  }
  if (q && !Object.keys(COSPLAY_QUERIES).some(k => q.includes(k))) {
    tags = `${q.replace(/[^\w\s_\-]+/g, ' ').trim()} rating:explicit -loli -shota -cub -young`;
  }
  const settled = await Promise.allSettled([
    _portalBoorus(tags, limit),
    _nekosLewd(Math.min(8, limit)),
    _gelbooru(tags, limit),
    _rule34(tags, Math.ceil(limit / 2)),
    _waifuIm(Math.ceil(limit / 3)),
  ]);
  const all = settled.flatMap(s => s.status === 'fulfilled' ? s.value : []);
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return _uniqBy(all).slice(0, limit);
}

async function cosplayDownload(item) {
  const url = item.url || item;
  const buf = await mediaHandler.fetchBuffer(url, 5, { timeout: 45000, headers: { 'User-Agent': UA } });
  if (!buf || buf.length < 1000) throw new Error('foto vazia');
  return {
    buf,
    type: item.type || (/\.gif/i.test(url) ? 'gif' : 'photo'),
    title: item.title || 'foto',
    source: item.source || 'cosplay',
    url,
  };
}

// ═══════════════════════════════════════════════════════════
// PLAQUINHAS +18 (imagem com texto hot)
// ═══════════════════════════════════════════════════════════
async function placa18(texto, estilo = 'hot') {
  const t = String(texto || '').trim().slice(0, 80);
  if (!t) throw new Error('texto vazio');
  // tenta systemzone se existir endpoint genérico; senão sharp local
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

  // sharp local — cartão dark hot
  const sharp = require('sharp');
  const W = 1080, H = 540;
  const esc = (s) => String(s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  // quebra texto em linhas ~28 chars
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
  const accents = {
    hot: '#f43f5e', pink: '#ec4899', gold: '#fbbf24', purple: '#a78bfa',
  };
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
  xvideosSearch,
  xvideosDownload,
  pornhubSearch,
  pornhubDownload,
  sexcomSearch,
  sexcomResolve,
  cosplaySearch,
  cosplayDownload,
  placa18,
  ytdlpDownload,
  COSPLAY_QUERIES,
};
