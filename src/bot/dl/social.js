/**
 * Social Downloads (YouTube) v4 — Cloudflare Worker + APIs funcionais (Junho 2026)
 *
 * Fluxo YouTube:
 *  1. Cloudflare Worker proxy (IPs limpos → URLs de streaming)
 *  2. loader.to API (fallback)
 *  3. Cobalt API (fallback)
 */
const { searchYoutube, searchYoutubeFull, proxyYoutubeAudio, proxyYoutubeVideo, loaderYoutubeAudio, loaderYoutubeVideo, cobaltDownload, YT_PROXY_URL } = require('./helpers');

// ==================== YOUTUBE AUDIO ====================

async function youtubeAudio(query) {
  const url = await searchYoutube(query);
  const info = await searchYoutubeFull(query);
  const fb = (info && info.title) || 'YouTube Audio';

  // 1ª tentativa: Cloudflare Worker
  if (YT_PROXY_URL) {
    try {
      const r = await proxyYoutubeAudio(url, '128');
      if (r) return { title: r.title || fb, ...r };
    } catch (e) { console.log('[YT-AUDIO] CF Worker falhou:', e.message); }
  }

  // 2ª tentativa: loader.to
  try {
    const r = await loaderYoutubeAudio(url, '128');
    if (r) return { title: r.title || fb, ...r };
  } catch (e) { console.log('[YT-AUDIO] loader.to falhou:', e.message); }

  // 3ª tentativa: Cobalt API
  try {
    const cobaltUrl = await cobaltDownload(url, 'audio');
    if (cobaltUrl) return { title: fb, url: cobaltUrl };
  } catch (e) {}

  throw new Error('❌ Não consegui baixar o áudio.' + (!YT_PROXY_URL ? ' Configure o Cloudflare Worker!' : ''));
}

async function youtubeAudioHD(query) {
  const url = await searchYoutube(query);
  const info = await searchYoutubeFull(query);
  const fb = (info && info.title) || 'YT HD';

  if (YT_PROXY_URL) {
    try { const r = await proxyYoutubeAudio(url, '320'); if (r) return { title: r.title || fb, ...r, quality: '320kbps' }; } catch (e) {}
  }

  try { const r = await loaderYoutubeAudio(url, '320'); if (r) return { title: r.title || fb, ...r, quality: '320kbps' }; } catch (e) {}
  try { const r = await loaderYoutubeAudio(url, '192'); if (r) return { title: r.title || fb, ...r, quality: '192kbps' }; } catch (e) {}

  throw new Error('❌ Não consegui baixar o áudio HD.');
}

async function youtubeAudioBuffer(query) {
  const r = await youtubeAudio(query);
  return { title: r.title, buffer: r.buffer, url: r.url };
}

// ==================== YOUTUBE VIDEO ====================

async function youtubeVideo(query) {
  const url = await searchYoutube(query);
  const info = await searchYoutubeFull(query);
  const fb = (info && info.title) || 'YouTube Video';

  if (YT_PROXY_URL) {
    try { const r = await proxyYoutubeVideo(url, '720'); if (r) return { title: r.title || fb, ...r, quality: r.quality || '720p' }; } catch (e) { console.log('[YT-VIDEO] CF Worker 720p falhou:', e.message); }
  }

  try { const r = await loaderYoutubeVideo(url, '720'); if (r) return { title: r.title || fb, ...r, quality: r.quality || '720p' }; } catch (e) {}
  try { const r = await loaderYoutubeVideo(url, '480'); if (r) return { title: r.title || fb, ...r, quality: r.quality || '480p' }; } catch (e) {}

  throw new Error('❌ Não consegui baixar o vídeo. Tente !play para áudio.');
}

async function youtubeVideoLow(query) {
  const url = await searchYoutube(query);
  const info = await searchYoutubeFull(query);
  const fb = (info && info.title) || 'YT';

  if (YT_PROXY_URL) {
    try { const r = await proxyYoutubeVideo(url, '360'); if (r) return { title: r.title || fb, ...r, quality: 'low' }; } catch (e) {}
  }

  try { const r = await loaderYoutubeVideo(url, '360'); if (r) return { title: r.title || fb, ...r, quality: 'low' }; } catch (e) {}

  throw new Error('❌ Não consegui baixar o vídeo em baixa qualidade.');
}

module.exports = { youtubeAudio, youtubeAudioHD, youtubeAudioBuffer, youtubeVideo, youtubeVideoLow };
