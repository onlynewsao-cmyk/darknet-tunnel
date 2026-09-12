/**
 * DARK BOT — Sticker.ly (API oficial v4)
 * Pesquisa ampla + packs estáticos e ANIMADOS.
 */
'use strict';

const SLY_UA = 'androidapp.stickerly/3.17.0 (Pixel 7; U; Android 13; pt-BR; br;)';
const SLY_HEADERS = {
  'User-Agent': SLY_UA,
  Accept: 'application/json',
  'Content-Type': 'application/json',
  'Accept-Language': 'pt-BR,pt;q=0.9',
};

function wantsAnimated(q = '') {
  return /\b(gif|animad[oa]s?|animated|anima[cç][aã]o|movimento)\b/i.test(String(q || ''));
}

function mapPack(p = {}) {
  const id = p.packId || p.resourceId || p.id || '';
  const prefix = String(p.resourceUrlPrefix || '').replace(/\/?$/, '/');
  return {
    id,
    title: p.name || p.title || 'Pack',
    author: p.authorName || p.user?.userName || p.owner || 'sticker.ly',
    stickerCount: (p.resourceFiles && p.resourceFiles.length) || p.stickerCount || 0,
    url: p.shareUrl || (id ? `https://sticker.ly/s/${id}` : ''),
    thumbnail: p.thumb || null,
    isAnimated: !!(p.isAnimated || p.animated),
    resourceUrlPrefix: prefix,
  };
}

async function slyGet(url) {
  const r = await fetch(url, { headers: SLY_HEADERS, signal: AbortSignal.timeout(15000) });
  return r.json();
}

async function slyPost(url, body) {
  const r = await fetch(url, {
    method: 'POST',
    headers: SLY_HEADERS,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(18000),
  });
  return r.json();
}

async function searchPacks(query, { size = 40, animatedOnly = false } = {}) {
  const q = String(query || '').trim();
  if (!q) return [];
  const keywords = [q];
  if (animatedOnly || wantsAnimated(q)) {
    if (!/gif|animad/i.test(q)) keywords.push(`${q} gif`, `${q} animated`);
  }
  const seen = new Set();
  const out = [];
  for (const keyword of keywords) {
    try {
      const data = await slyPost('https://api.sticker.ly/v4/stickerPack/search', {
        keyword, size, cursor: 0,
      });
      const packs = data?.result?.stickerPacks || data?.result?.packs || [];
      for (const raw of packs) {
        const p = mapPack(raw);
        if (!p.id || seen.has(p.id)) continue;
        if (animatedOnly && !p.isAnimated) continue;
        seen.add(p.id);
        out.push(p);
      }
    } catch {}
  }
  return out;
}

async function getPack(packId) {
  const id = String(packId || '').trim();
  if (!id) throw new Error('pack sem id');
  const data = await slyGet(`https://api.sticker.ly/v3.1/stickerPack/${encodeURIComponent(id)}`);
  const pack = data?.result || data?.data || data;
  if (!pack || pack.error) throw new Error('sticker.ly pack failed');
  const prefix = String(pack.resourceUrlPrefix || '').replace(/\/?$/, '/');
  const stickers = (pack.stickers || []).map((s) => {
    const file = s.fileName || s.image || s.url || '';
    const url = /^https?:\/\//i.test(file) ? file : (prefix && file ? prefix + file : '');
    const isAnimated = !!(s.isAnimated || s.animated || pack.isAnimated || pack.animated || /\.gif$/i.test(file));
    return { url, isAnimated, emoji: (s.tags && s.tags[0]) || s.emoji || '' };
  }).filter((s) => s.url);
  return {
    title: pack.name || pack.title || 'Pack',
    author: pack.authorName || pack.owner || 'sticker.ly',
    isAnimated: !!(pack.isAnimated || pack.animated),
    stickers,
    id: pack.packId || id,
  };
}

function pickWide(packs, query) {
  const list = packs || [];
  if (!list.length) return [];
  const animWanted = wantsAnimated(query);
  const anim = list.filter((p) => p.isAnimated);
  const still = list.filter((p) => !p.isAnimated);
  if (animWanted) return [...anim.slice(0, 2), ...still.slice(0, 1)].filter(Boolean);
  // pesquisa ampla: 1 estático + 1 animado (se existir) + outro estático
  const picked = [];
  if (still[0]) picked.push(still[0]);
  if (anim[0]) picked.push(anim[0]);
  if (still[1]) picked.push(still[1]);
  if (anim[1] && picked.length < 3) picked.push(anim[1]);
  return picked.length ? picked : list.slice(0, 2);
}

async function collectStickers(query, { limit = 30 } = {}) {
  const packs = await searchPacks(query, { size: 40 });
  if (!packs.length) throw new Error('Nenhum pack encontrado para: ' + query);
  const chosen = pickWide(packs, query);
  const stickers = [];
  const seenUrl = new Set();
  for (const p of chosen) {
    if (stickers.length >= limit) break;
    let detail;
    try { detail = await getPack(p.id); } catch { continue; }
    for (const s of detail.stickers) {
      if (stickers.length >= limit) break;
      if (!s.url || seenUrl.has(s.url)) continue;
      seenUrl.add(s.url);
      stickers.push({
        url: s.url,
        isAnimated: s.isAnimated || p.isAnimated,
        packTitle: detail.title || p.title,
      });
    }
  }
  return {
    packs: chosen,
    title: chosen[0]?.title || query,
    author: chosen[0]?.author || 'sticker.ly',
    stickers,
    totalFound: packs.length,
    animatedPacks: packs.filter((p) => p.isAnimated).length,
  };
}

async function searchAndDownload(query, limit = 30) {
  const found = await collectStickers(query, { limit });
  const ready = [];
  for (const s of found.stickers) {
    try {
      const buf = await require('./mediaHandler').fetchBuffer(s.url);
      if (buf && buf.length > 500) ready.push({ ...s, buf });
    } catch {}
  }
  return { ...found, stickers: ready };
}

module.exports = {
  searchPacks,
  getPack,
  pickWide,
  collectStickers,
  searchAndDownload,
  wantsAnimated,
  mapPack,
};
