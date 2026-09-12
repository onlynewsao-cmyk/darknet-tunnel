/**
 * Other Downloads v4 — Cloudflare Worker + APIs funcionais (Junho 2026)
 *
 * TikTok: tikwm → Cloudflare Worker → Cobalt
 * Instagram: Cloudflare Worker → Cobalt
 * Facebook: Cloudflare Worker → Cobalt
 * Twitter: Cloudflare Worker → Cobalt
 * Spotify: spotifydown → Cobalt → YouTube fallback
 * SoundCloud: Cloudflare Worker → Cobalt → YouTube fallback
 * Pinterest: siputzx → Cobalt → Bing images
 */
const { tryApis, cobaltDownload, tikwmDownload, spotifydownDownload, siputzxPinterest, siputzxPinterestSearch, proxySocialDownload, loaderYoutubeAudio } = require('./helpers');

// ==================== TIKTOK ====================
async function tiktok(url) {
  const tikwmResult = await tikwmDownload(url);
  if (tikwmResult && tikwmResult.noWatermark) return { title: tikwmResult.title, url: tikwmResult.noWatermark };
  if (tikwmResult && tikwmResult.url) return { title: tikwmResult.title, url: tikwmResult.url };

  const proxyUrl = await proxySocialDownload(url);
  if (proxyUrl) return { title: 'TikTok', url: proxyUrl };

  try {
    const cobaltUrl = await cobaltDownload(url, 'auto');
    if (cobaltUrl) return { title: 'TikTok', url: cobaltUrl };
  } catch (e) {}

  throw new Error('❌ Não consegui baixar o TikTok.');
}

// ==================== INSTAGRAM ====================
async function instagram(url) {
  const proxyUrl = await proxySocialDownload(url);
  if (proxyUrl) {
    const isVideo = typeof proxyUrl === 'string' && proxyUrl.includes('.mp4');
    return { type: isVideo ? 'video' : 'image', url: proxyUrl };
  }

  try {
    const cobaltUrl = await cobaltDownload(url, 'auto');
    if (cobaltUrl) {
      const isVideo = typeof cobaltUrl === 'string' && cobaltUrl.includes('.mp4');
      return { type: isVideo ? 'video' : 'image', url: cobaltUrl };
    }
  } catch (e) {}

  // Fallback yt-dlp (reels/vídeos públicos; alguns posts exigem cookies)
  try {
    const dl = require('../downloader');
    const r = await dl.instagram(url);
    if (r) return r;
  } catch (e) { console.log('[IG] yt-dlp falhou:', e.message?.slice(0, 80)); }

  throw new Error('❌ Não consegui baixar do Instagram. Link pode ser privado ou exigir login.');
}

// ==================== FACEBOOK ====================
async function facebook(url) {
  const proxyUrl = await proxySocialDownload(url);
  if (proxyUrl) return { url: proxyUrl, title: 'Facebook' };

  try {
    const cobaltUrl = await cobaltDownload(url, 'auto');
    if (cobaltUrl) return { url: cobaltUrl, title: 'Facebook' };
  } catch (e) {}

  // Fallback yt-dlp (vídeos públicos do Facebook)
  try {
    const dl = require('../downloader');
    const r = await dl.facebook(url);
    if (r) return r;
  } catch (e) { console.log('[FB] yt-dlp falhou:', e.message?.slice(0, 80)); }

  throw new Error('❌ Não consegui baixar do Facebook.');
}

// ==================== TWITTER / X ====================
async function twitter(url) {
  const proxyUrl = await proxySocialDownload(url);
  if (proxyUrl) return { url: proxyUrl };

  try {
    const cobaltUrl = await cobaltDownload(url, 'auto');
    if (cobaltUrl) return { url: cobaltUrl };
  } catch (e) {}

  // Fallback yt-dlp (vídeos públicos do X)
  try {
    const dl = require('../downloader');
    const r = await dl.twitter(url);
    if (r) return r;
  } catch (e) { console.log('[TW] yt-dlp falhou:', e.message?.slice(0, 80)); }

  throw new Error('❌ Não consegui baixar do X/Twitter.');
}

// ==================== SPOTIFY ====================
async function spotify(url) {
  const spotResult = await spotifydownDownload(url);
  if (spotResult && spotResult.url) {
    return { title: spotResult.title, url: spotResult.url, author: spotResult.author, thumbnail: spotResult.thumbnail, duration: spotResult.duration };
  }

  try {
    const cobaltUrl = await cobaltDownload(url, 'audio');
    if (cobaltUrl) return { title: 'Spotify', url: cobaltUrl };
  } catch (e) {}

  // Fallback: entrega o ÁUDIO via busca YouTube (yt-dlp) — a música chega na mesma.
  try {
    const dl = require('../downloader');
    const r = await dl.spotify(url);
    if (r) return r;
  } catch (e) { console.log('[SPOTIFY] fallback yt-dlp falhou:', e.message?.slice(0, 80)); }

  throw new Error('❌ Não consegui baixar do Spotify. Envia o NOME da música (ex: spotify nome da música) ou usa !play <nome>.');
}

// ==================== SOUNDCLOUD ====================
async function soundcloud(url) {
  const proxyUrl = await proxySocialDownload(url);
  if (proxyUrl) return { title: 'SoundCloud', url: proxyUrl };

  try {
    const cobaltUrl = await cobaltDownload(url, 'audio');
    if (cobaltUrl) return { title: 'SoundCloud', url: cobaltUrl };
  } catch (e) {}

  // Fallback: entrega o ÁUDIO via busca YouTube (yt-dlp).
  try {
    const dl = require('../downloader');
    const r = await dl.soundcloud(url);
    if (r) return r;
  } catch (e) { console.log('[SC] fallback yt-dlp falhou:', e.message?.slice(0, 80)); }

  throw new Error('❌ Não consegui baixar do SoundCloud. Envia o nome da música ou usa !play <nome>.');
}

// ==================== PINTEREST ====================
async function pinterest(url) {
  if (!/^https?:\/\//i.test(url)) return (await pinterestSearch(url))[0];

  const pinResult = await siputzxPinterest(url);
  if (pinResult && pinResult.url) return pinResult;

  try {
    const cobaltUrl = await cobaltDownload(url, 'auto');
    if (cobaltUrl) return { url: cobaltUrl, title: 'Pinterest' };
  } catch (e) {}

  throw new Error('❌ Não consegui baixar do Pinterest.');
}

async function pinterestSearch(query) {
  try {
    const pin = require('../pinterestSearch');
    const items = await pin.searchPinterest(query, { type: 'any', limit: 10 });
    if (items.length) return items;
  } catch {}
  return [];
}

// ==================== TIKTOK SEARCH ====================
async function tiktokSearch(query, count = 1) {
  // Tenta múltiplas APIs de busca TikTok
  const apis = [
    {
      url: `https://www.tikwm.com/api/feed/search?keywords=${encodeURIComponent(query)}&count=${count}&cursor=0`,
      extract: r => r?.data?.videos || r?.data || [],
    },
    {
      url: `https://api.zahwazein.xyz/searching/tiktok?query=${encodeURIComponent(query)}`,
      extract: r => r?.result || r?.data || [],
    },
  ];
  
  for (const api of apis) {
    try {
      const r = await mediaHandler.fetchJson(api.url, 20000);
      const items = api.extract(r);
      if (Array.isArray(items) && items.length > 0) {
        return items.slice(0, count).map(v => ({
          title: v.title || v.desc || v.description || 'TikTok',
          url: v.play || v.no_watermark || v.video || v.download || v.url || v.hdplay || '',
          author: v.author?.nickname || v.author?.unique_id || v.username || '',
          thumbnail: v.cover || v.origin_cover || v.thumbnail || '',
          duration: v.duration || '',
          likes: v.digg_count || v.likes || 0,
        })).filter(v => v.url);
      }
    } catch (e) { console.log('[TT-SEARCH] falhou:', e.message); }
  }
  return [];
}

module.exports = { tiktok, tiktokSearch, instagram, facebook, twitter, spotify, soundcloud, pinterest, pinterestSearch };
