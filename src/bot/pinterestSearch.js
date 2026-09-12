/**
 * Pesquisa Pinterest com várias fontes.
 * siputzx (api.siputzx.my.id) está a devolver 502 — não pode ser a única.
 */
'use strict';

function mh() { return require('./mediaHandler'); }

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function pickUrl(item) {
  if (!item) return '';
  if (typeof item === 'string') return item;
  return item.media_url || item.video_url || item.video || item.mp4
    || item.image_url || item.image || item.url || item.src
    || item.download_url || item.link || item.images?.orig?.url
    || item.images?.orig || '';
}

function isVideoItem(item, url) {
  const u = String(url || '');
  if (item && (item.type === 'video' || item.is_video || item.video || item.video_url)) return true;
  return /\.mp4(\?|$)|\/videos\/|v1\.pinimg\.com\/videos|pinimg\.com\/videos/i.test(u);
}

function normalize(item, fallbackType = 'image') {
  const url = String(pickUrl(item) || '').replace(/\\\//g, '/');
  if (!/^https?:\/\//i.test(url)) return null;
  if (/pinterest\.(com|ca)\/(pin\/)?search|login|signup/i.test(url) && !/pinimg|i\.pinimg|v1\.pinimg/i.test(url)) {
    return null;
  }
  const video = isVideoItem(item, url);
  return {
    url,
    image_url: video ? (item?.image_url || item?.image || url) : url,
    media_url: url,
    type: video ? 'video' : (fallbackType || 'image'),
    description: item?.description || item?.title || item?.grid_title || '',
    pin: item?.pin || item?.link || item?.sourceUrl || '',
  };
}

function uniq(list) {
  const seen = new Set();
  const out = [];
  for (const it of list) {
    if (!it?.url || seen.has(it.url)) continue;
    seen.add(it.url);
    out.push(it);
  }
  return out;
}

async function tryJson(url, extract, timeout = 12000) {
  const r = await mh().fetchJson(url, timeout);
  const raw = extract(r);
  const arr = Array.isArray(raw) ? raw : (raw ? [raw] : []);
  return arr.map(x => normalize(x)).filter(Boolean);
}

async function fromSystemzoneV3(query, type, limit) {
  const axios = require('axios');
  const { data } = await axios.get('https://systemzone.store/api/v3/pinterest', {
    params: { q: query, type: type === 'video' ? 'video' : 'image', limit, ia: true },
    timeout: 15000,
  });
  const raw = Array.isArray(data?.results) ? data.results : (Array.isArray(data?.data) ? data.data : []);
  return raw.map((x) => normalize(x, type)).filter(Boolean);
}

async function fromPublicApis(query) {
  const q = encodeURIComponent(query);
  const sources = [
    { url: `https://api.siputzx.my.id/api/s/pinterest?query=${q}`, ext: r => r?.data || r?.result },
    { url: `https://systemzone.store/api/v3/pinterest?q=${q}&type=image&limit=10&ia=true`, ext: r => r?.results || r?.data },
    { url: `https://delirius-apiofc.vercel.app/search/pinterest?query=${q}`, ext: r => r?.data || r?.result || r?.results },
    { url: `https://api.vreden.my.id/api/pinterest?query=${q}`, ext: r => r?.result || r?.data },
    { url: `https://api.agatz.xyz/api/pinterest?message=${q}`, ext: r => r?.data || r?.result },
    { url: `https://systemzone.store/api/search/pinterest?query=${q}&apikey=freekey`, ext: r => r?.resultados || r?.results || r?.result || r?.data },
    { url: `https://api.lolhuman.xyz/api/pinterest?query=${q}&apikey=darkbot`, ext: r => r?.result },
  ];
  const collected = [];
  for (const src of sources) {
    try {
      const items = await tryJson(src.url, src.ext);
      if (items.length) collected.push(...items);
      if (collected.length >= 12) break;
    } catch { /* 502 / timeout — tenta a seguinte */ }
  }
  return uniq(collected);
}

function unescapePin(s) {
  return String(s || '')
    .replace(/\\u002F/g, '/')
    .replace(/\\\//g, '/')
    .replace(/\\u0026/g, '&');
}

async function scrapePinterest(query, wantVideo) {
  const path = wantVideo ? 'search/videos' : 'search/pins';
  const url = `https://www.pinterest.com/${path}/?q=${encodeURIComponent(query)}&rs=typed`;
  const html = await mh().fetchBuffer(url).then(b => b.toString('utf8')).catch(() => '');
  if (!html || html.length < 400) return [];

  const found = [];
  const videoRe = /https:\\?\/\\?\/v1\.pinimg\.com\\?\/videos\\?\/[^"'\\\s>]+\.mp4/gi;
  const imgRe = /https:\\?\/\\?\/i\.pinimg\.com\\?\/[^"'\\\s>]+/gi;
  for (const m of html.matchAll(videoRe)) {
    found.push(normalize({ url: unescapePin(m[0]), type: 'video' }));
  }
  if (!wantVideo || found.length < 3) {
    for (const m of html.matchAll(imgRe)) {
      const u = unescapePin(m[0]);
      if (/\/75x75\/|\/30x30\/|\/avatars\//i.test(u)) continue;
      found.push(normalize({ url: u, type: 'image' }));
    }
  }
  return uniq(found.filter(Boolean));
}

async function resourceSearch(query, wantVideo) {
  const scope = wantVideo ? 'videos' : 'pins';
  const data = JSON.stringify({
    options: { query, scope, rs: 'typed' },
    context: {},
  });
  const url = 'https://www.pinterest.com/resource/BaseSearchResource/get/'
    + `?source_url=${encodeURIComponent(`/${wantVideo ? 'search/videos' : 'search/pins'}/?q=${query}`)}`
    + `&data=${encodeURIComponent(data)}`;
  const txt = await mh().fetchBuffer(url).then(b => b.toString('utf8')).catch(() => '');
  if (!txt) return [];
  let json;
  try { json = JSON.parse(txt); } catch { return []; }
  const results = json?.resource_response?.data?.results || [];
  const out = [];
  for (const pin of results) {
    const vids = pin?.videos?.video_list || pin?.story_pin_data?.pages?.[0]?.blocks?.[0]?.video?.video_list || {};
    const v = vids.V_720P || vids.V_HLSV4 || vids.V_480P || vids.V_360P;
    const img = pin?.images?.orig?.url || pin?.images?.['736x']?.url || pin?.images?.orig;
    if (v?.url) out.push(normalize({ url: v.url, type: 'video', description: pin?.grid_title || pin?.description, pin: pin?.link }));
    else if (img) out.push(normalize({ url: img, type: 'image', description: pin?.grid_title || pin?.description }));
  }
  return uniq(out);
}

/**
 * @param {string} query
 * @param {{ type?: 'image'|'video'|'any', limit?: number }} opts
 */
async function searchPinterest(query, opts = {}) {
  const type = opts.type || 'any';
  const limit = Math.max(1, Math.min(10, Number(opts.limit) || 6));
  const wantVideo = type === 'video';
  const q = String(query || '').trim();
  if (!q) return [];

  const searchQ = wantVideo ? `${q} video` : q;
  let items = [];

  try { items = items.concat(await fromPublicApis(searchQ)); } catch {}
  if (items.length < 4) {
    try { items = items.concat(await resourceSearch(q, wantVideo)); } catch {}
  }
  if (items.length < 4) {
    try { items = items.concat(await scrapePinterest(q, wantVideo)); } catch {}
  }
  if (wantVideo && items.filter(i => i.type === 'video').length < 1) {
    try { items = items.concat(await scrapePinterest(q + ' video', true)); } catch {}
  }

  items = uniq(items);
  if (type === 'video') {
    const vids = items.filter(i => i.type === 'video');
    if (vids.length) return vids.slice(0, limit);
    return [];
  }
  if (type === 'image') {
    return items.filter(i => i.type !== 'video').slice(0, limit);
  }
  return items.slice(0, limit);
}

function parsePinArgs(text) {
  const raw = String(text || '').trim();
  const partes = raw.split('|').map(p => p.trim()).filter(Boolean);
  const query = partes.shift() || '';
  let limit = 6;
  let type = 'image';
  for (const p of partes) {
    if (/^\d+$/.test(p)) limit = Math.max(1, Math.min(10, parseInt(p, 10)));
    else if (/^v[ií]deos?$/i.test(p) || /^mp4$/i.test(p)) type = 'video';
    else if (/^(imagens?|imagem|fotos?|image)$/i.test(p)) type = 'image';
  }
  if (!partes.length && /\b(v[ií]deo|video|mp4)\b/i.test(query)) {
    type = 'video';
  }
  return { query: query.replace(/\b(v[ií]deo|video|mp4)\b/gi, '').replace(/\s+/g, ' ').trim() || query, limit, type };
}

module.exports = {
  searchPinterest,
  parsePinArgs,
  normalize,
  isVideoItem,
};
