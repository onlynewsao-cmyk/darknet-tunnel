/**
 * DARK BOT v7.2 — Sex.com Source
 * Busca fotos, vídeos e GIFs do sex.com
 */
'use strict';

const axios = require('axios');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml',
  'Accept-Language': 'en-US,en;q=0.9',
};

// Filtro — exclui gay/trans
const BLOCKED = /gay|trans|travesti|travest|shemale|ladyboy|femboy|sissy|crossdress|homosexual/i;

function isFiltered(text) {
  return BLOCKED.test(String(text || ''));
}

// Shuffle (Fisher-Yates)
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Busca imagens no sex.com
 */
async function searchImages(query, count = 5) {
  const r = await axios.get('https://api.sex.com/v1/search?q=' + encodeURIComponent(query), {
    headers: HEADERS, timeout: 15000,
  });
  const html = r.data;
  const results = [];
  const seen = new Set();

  // Thumbnails
  const imgRe = /src="(https:\/\/images\.sxccdn\.com\/[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/gi;
  let m;
  while ((m = imgRe.exec(html)) !== null && results.length < count * 2) {
    const url = m[1];
    if (!url.includes('poster') && !url.includes('avatar') && !url.includes('logo') &&
        !url.includes('banner') && !url.includes('ads') && !seen.has(url)) {
      seen.add(url);
      results.push({ url, type: 'photo', source: 'sex.com' });
    }
  }

  // srcset (imagens maiores)
  const srcRe = /srcset="([^"]+)"/gi;
  while ((m = srcRe.exec(html)) !== null && results.length < count * 2) {
    const parts = m[1].split(',').map(s => s.trim());
    const largest = parts[parts.length - 1]?.split(' ')[0];
    if (largest && largest.includes('images.sxccdn.com') && !largest.includes('poster') && !seen.has(largest)) {
      seen.add(largest);
      results.push({ url: largest, type: 'photo', source: 'sex.com' });
    }
  }

  return shuffle(results).slice(0, count);
}

/**
 * Busca vídeos no sex.com
 */
async function searchVideos(query, count = 3) {
  const r = await axios.get('https://api.sex.com/v1/search?q=' + encodeURIComponent(query + ' video'), {
    headers: HEADERS, timeout: 15000,
  });
  const html = r.data;
  const results = [];
  const seen = new Set();

  // Links de vídeo
  const linkRe = /href="(\/en\/videos\/\d+)"/gi;
  let m;
  while ((m = linkRe.exec(html)) !== null && results.length < count * 3) {
    const link = 'https://www.sex.com' + m[1];
    if (!seen.has(link)) {
      seen.add(link);
      results.push({ url: link, type: 'video-page', source: 'sex.com' });
    }
  }

  // Direct MP4 URLs
  const vidRe = /src="(https?:\/\/[^"]+\.mp4[^"]*)"/gi;
  while ((m = vidRe.exec(html)) !== null && results.length < count * 2) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      results.push({ url: m[1], type: 'video', source: 'sex.com' });
    }
  }

  return shuffle(results).slice(0, count);
}

/**
 * Busca GIFs no sex.com
 * sex.com tem previews .mp4 que funcionam como GIFs
 */
async function searchGifs(query, count = 5) {
  const r = await axios.get('https://api.sex.com/v1/search?q=' + encodeURIComponent(query + ' gif'), {
    headers: HEADERS, timeout: 15000,
  });
  const html = r.data;
  const results = [];
  const seen = new Set();

  // Extrai IDs de vídeo
  const videoIdRe = /\/videos\/(\d+)/g;
  const videoIds = new Set();
  let m;
  while ((m = videoIdRe.exec(html)) !== null && videoIds.size < 30) {
    videoIds.add(m[1]);
  }

  // Constrói URLs de preview (são curtos, tipo GIF)
  for (const id of videoIds) {
    const url = 'https://videos2.sex.com/' + id + '/preview_240p.mp4';
    if (!seen.has(url)) {
      seen.add(url);
      results.push({ url, type: 'gif', source: 'sex.com', videoId: id });
    }
  }

  // Também procura GIFs directos no HTML
  const gifRe = /src="(https?:\/\/[^"]+\.gif[^"]*)"/gi;
  while ((m = gifRe.exec(html)) !== null && results.length < count * 3) {
    const url = m[1];
    if (!url.includes('static') && !url.includes('logo') && !url.includes('icon') && !seen.has(url)) {
      seen.add(url);
      results.push({ url, type: 'gif', source: 'sex.com' });
    }
  }

  // WebP animados (thumbnails que são GIF-like)
  const webpRe = /src="(https:\/\/images\.sxccdn\.com\/[^"]+\.webp[^"]*)"/gi;
  while ((m = webpRe.exec(html)) !== null && results.length < count * 2) {
    const url = m[1];
    if (!url.includes('poster') && !url.includes('avatar') && !seen.has(url)) {
      seen.add(url);
      results.push({ url, type: 'gif', source: 'sex.com' });
    }
  }

  return shuffle(results).slice(0, count);
}

module.exports = { searchImages, searchVideos, searchGifs, isFiltered, shuffle };
