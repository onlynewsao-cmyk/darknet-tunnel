/**
 * DARK BOT v7 — EROME.COM Engine
 * Busca e download de fotos/vídeos por nome
 *
 * Fluxo:
 *   1. search(query) → lista de álbuns/perfis
 *   2. getAlbum(url) → { photos[], videos[], name }
 *   3. searchAndDownload(query, limit) → mídias prontas a enviar
 *
 * Suporta:
 *   - Busca por nome (resultados múltiplos)
 *   - Página de perfil (múltiplos álbuns)
 *   - Álbuns individuais (fotos + vídeos)
 *   - Download directo de buffers
 */
'use strict';

const axios = require('axios');
const mediaHandler = require('./mediaHandler');


// ─── Filtro de conteúdo — exclui gay/trans ────────────────────
const BLOCKED_TAGS = /gay|trans|travesti|travest|shemale|ladyboy|femboy|sissy|cd[s_]|crossdress|homosexual|bisexual|threesome.*male|bbc.*male/i;
const BLOCKED_URLS = /gay|trans|travesti|shemale|ladyboy|femboy|sissy|crossdress/i;

function isFiltered(name, url) {
  const n = String(name || '').toLowerCase();
  const u = String(url || '').toLowerCase();
  return BLOCKED_TAGS.test(n) || BLOCKED_URLS.test(u);
}

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9,pt;q=0.8',
  'Referer': 'https://www.erome.com/',
  'Connection': 'keep-alive',
};

// ─── Busca de álbuns ────────────────────────────────────────
async function search(query) {
  const r = await axios.get(`https://www.erome.com/search?q=${encodeURIComponent(query)}`, {
    headers: HEADERS, timeout: 20000,
  });
  const html = r.data;
  const results = [];

  // Padrão 1: links de álbum com thumbnail
  const albumRe = /<a[^>]*href="(https:\/\/www\.erome\.com\/a\/[^"]+)"[^>]*>[\s\S]*?<img[^>]*(?:data-src|src)="([^"]*)"[^>]*alt="([^"]*)"/gi;
  let m;
  while ((m = albumRe.exec(html)) !== null && results.length < 30) {
    const url = m[1];
    const thumb = m[2] || '';
    const name = (m[3] || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").trim();
    if (!results.find(r => r.url === url)) {
      results.push({ url, name: name || 'Erome Album', thumb, type: 'album' });
    }
  }

  // Padrão 2: cards de álbum
  if (!results.length) {
    const cardRe = /href="(https:\/\/www\.erome\.com\/a\/[^"]+)"[^>]*>[\s\S]*?class="[^"]*album-title[^"]*"[^>]*>([^<]+)/gi;
    while ((m = cardRe.exec(html)) !== null && results.length < 30) {
      const url = m[1];
      const name = m[2].trim();
      if (!results.find(r => r.url === url)) {
        results.push({ url, name: name || 'Erome Album', type: 'album' });
      }
    }
  }

  // Padrão 3: perfis
  if (!results.length) {
    const profileRe = /href="(https:\/\/www\.erome\.com\/[^/"]+)"[^>]*class="[^"]*(?:avatar|user)[^"]*"[^>]*>[\s\S]*?alt="([^"]*)"/gi;
    while ((m = profileRe.exec(html)) !== null && results.length < 10) {
      const url = m[1];
      const name = (m[2] || '').replace(/&amp;/g, '&').trim();
      if (!results.find(r => r.url === url) && !url.includes('/a/')) {
        results.push({ url, name: name || 'Erome Profile', type: 'profile' });
      }
    }
  }

  return results;
}

// ─── Busca em perfil (múltiplos álbuns) ─────────────────────
async function getProfileAlbums(profileUrl, limit = 5) {
  const r = await axios.get(profileUrl, { headers: HEADERS, timeout: 20000 });
  const html = r.data;
  const albums = [];

  const re = /href="(https:\/\/www\.erome\.com\/a\/[^"]+)"[\s\S]*?(?:data-src|src)="([^"]*)"[^>]*alt="([^"]*)"/gi;
  let m;
  while ((m = re.exec(html)) !== null && albums.length < limit) {
    albums.push({
      url: m[1],
      thumb: m[2] || '',
      name: (m[3] || 'Album').replace(/&amp;/g, '&').trim(),
    });
  }
  return albums;
}

// ─── Mídias de um álbum ─────────────────────────────────────
async function getAlbum(url, limit = 10) {
  const r = await axios.get(url, { headers: HEADERS, timeout: 20000 });
  const html = r.data;
  const photos = [];
  const videos = [];

  // ═══ FOTOS ═══
  // Padrão 1: imagens do álbum (data-src ou src)
  const imgRe = /(?:data-src|src)="(https:\/\/s\d+\.erome\.com\/[^"]+\.(?:jpg|jpeg|png|webp)(?:\?[^"]*)?)"/gi;
  let m;
  while ((m = imgRe.exec(html)) !== null) {
    const u = m[1];
    if (!u.includes('avatar') && !u.includes('thumb') && !u.includes('icon') && !photos.includes(u)) {
      photos.push(u);
    }
  }

  // Padrão 2: lazy-load images
  const lazyRe = /data-src="(https:\/\/s\d+\.erome\.com\/[^"]+)"/gi;
  while ((m = lazyRe.exec(html)) !== null) {
    const u = m[1];
    if (!u.includes('avatar') && !photos.includes(u)) {
      photos.push(u);
    }
  }

  // ═══ VÍDEOS ═══
  // Padrão 1: <source src="...mp4">
  const vidRe1 = /<source\s+src="(https:\/\/v\d+\.erome\.com\/[^"]+\.mp4[^"]*)"/gi;
  while ((m = vidRe1.exec(html)) !== null) {
    if (!videos.includes(m[1])) videos.push(m[1]);
  }

  // Padrão 2: <video src="...">
  const vidRe2 = /<video[^>]+src="(https:\/\/v\d+\.erome\.com\/[^"]+\.mp4[^"]*)"/gi;
  while ((m = vidRe2.exec(html)) !== null) {
    if (!videos.includes(m[1])) videos.push(m[1]);
  }

  // Padrão 3: data-src em elementos de vídeo
  const vidRe3 = /data-src="(https:\/\/v\d+\.erome\.com\/[^"]+\.mp4[^"]*)"/gi;
  while ((m = vidRe3.exec(html)) !== null) {
    if (!videos.includes(m[1])) videos.push(m[1]);
  }

  // Padrão 4: URL directa no JS/JSON
  const vidRe4 = /"(https:\/\/v\d+\.erome\.com\/[^"]+\.mp4[^"]*)"/gi;
  while ((m = vidRe4.exec(html)) !== null) {
    if (!videos.includes(m[1])) videos.push(m[1]);
  }

  // Nome do álbum
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  const name = titleMatch ? titleMatch[1].replace(/ - Erome.*$/i, '').trim() : 'Erome';

  // v11.2.5: devolve TODAS as mídias detectadas (limit só como teto de segurança)
  const safeCap = Math.max(limit || 50, 50);
  return {
    photos: photos.slice(0, safeCap),
    videos: videos.slice(0, safeCap),
    name,
    allPhotos: photos.length,
    allVideos: videos.length,
  };
}

// ─── Baixa as mídias de UM álbum ──
// v11.2.5: por defeito manda QUASE tudo o que o post tem (teto 30).
// Antes limit=5 cortava o álbum e o user só via uma fracção.
async function albumToMedia(albumUrl, limit = 30, { videosOnly = false, photosOnly = false } = {}) {
  const hardCap = Math.min(Math.max(Number(limit) || 30, 1), 40);
  const album = await getAlbum(albumUrl, hardCap);
  const media = [];
  if (!videosOnly) {
    for (const url of album.photos.slice(0, hardCap)) {
      try {
        const buf = await mediaHandler.fetchBuffer(url, 5, {
          headers: { ...HEADERS, Accept: 'image/*,*/*' },
          timeout: 45000,
        });
        if (buf && buf.length > 1000) media.push({ url, buf, type: 'photo' });
      } catch {}
      if (media.length >= hardCap) break;
    }
  }
  if (!photosOnly) {
    const room = hardCap - media.length;
    const vidLimit = videosOnly ? hardCap : Math.max(0, room);
    for (const url of album.videos.slice(0, vidLimit)) {
      try {
        const r = await axios.get(url, {
          responseType: 'arraybuffer',
          timeout: 90000,
          headers: { ...HEADERS, 'Accept': '*/*', 'Range': 'bytes=0-' },
          maxContentLength: 55 * 1024 * 1024,
        });
        const buf = Buffer.from(r.data);
        if (buf && buf.length > 5000) media.push({ url, buf, type: 'video' });
      } catch {}
    }
  }
  if (!media.length) throw new Error('Sem mídias neste álbum.');
  return {
    media,
    name: album.name,
    albumUrl,
    totalPhotos: album.allPhotos || album.photos.length,
    totalVideos: album.allVideos || album.videos.length,
    sent: media.length,
  };
}

// ─── Busca e download completo ──────────────────────────────
async function searchAndDownload(query, limit = 5) {
  const results = await search(query);
  if (!results.length) throw new Error('Nenhum resultado para: ' + query);

  // Tenta múltiplos resultados até encontrar mídia
  for (let i = 0; i < Math.min(results.length, 10); i++) {
    if (isFiltered(results[i].name, results[i].url)) continue;
    try {
      const r = await albumToMedia(results[i].url, limit);
      return { ...r, source: results[i].name };
    } catch {}
  }

  throw new Error('Nenhuma mídia encontrada nos resultados.');
}

// ─── Busca só vídeos ────────────────────────────────────────
async function searchVideos(query, limit = 3) {
  const results = await search(query);
  if (!results.length) throw new Error('Nenhum resultado para: ' + query);

  for (let i = 0; i < Math.min(results.length, 5); i++) {
    if (isFiltered(results[i].name, results[i].url)) continue;
    try {
      const r = await albumToMedia(results[i].url, limit, { videosOnly: true });
      return r.media.map(v => ({ ...v, name: r.name }));
    } catch {}
  }

  throw new Error('Nenhum vídeo encontrado para: ' + query);
}

// ─── Busca só fotos ─────────────────────────────────────────
async function searchPhotos(query, limit = 5) {
  const results = await search(query);
  if (!results.length) throw new Error('Nenhum resultado para: ' + query);

  for (let i = 0; i < Math.min(results.length, 5); i++) {
    if (isFiltered(results[i].name, results[i].url)) continue;
    try {
      const r = await albumToMedia(results[i].url, limit, { photosOnly: true });
      return r.media.map(p => ({ ...p, name: r.name }));
    } catch {}
  }

  throw new Error('Nenhuma foto encontrada para: ' + query);
}

module.exports = { search, getAlbum, getProfileAlbums, searchAndDownload, searchVideos, searchPhotos, albumToMedia, isFiltered };
