/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║   DARK BOT — Play Engine v2 🎵                           ║
 * ║   play / play2 / play3 com InteractiveMessage oficial                 ║
 * ╚══════════════════════════════════════════════════════════╝
 *
 * Fluxo:
 *  1. Busca a música: API systemzone.store → fallback yt-search (local)
 *  2. Mostra card InteractiveMessage com thumbnail + 2 botões (Áudio / Vídeo)
 *  3. Clique no botão → dispara !ytd (áudio) ou !gyt (vídeo)
 *  4. !ytd / !gyt → API systemzone → fallback yt-dlp local
 *
 * v2: ytsearch() retorna { resultados } (formato exacto do código
 * de referência) + sendPlayCard com cascata de 3 níveis:
 *   interactive viewOnce → texto formatado
 */

'use strict';

const mediaHandler = require('./mediaHandler');
const config = require('../config');
const { profile } = require('../../mediaQuality');

const SYSTEMZONE_API_URL = (process.env.SYSTEMZONE_API_URL || 'https://systemzone.store').replace(/\/$/, '');
const SYSTEMZONE_API_KEY = process.env.SYSTEMZONE_API_KEY || 'freekey';

// O clique do botão leva apenas a URL. Guardamos os metadados da busca por
// alguns minutos para o vídeo manter título, autor e duração no envio final.
const _videoMeta = new Map();
const META_TTL = 15 * 60 * 1000;
const META_MAX = 120;
function _videoKey(value) {
  const s = String(value || '');
  return s.match(/[?&]v=([\w-]{11})|youtu\.be\/([\w-]{11})|\/shorts\/([\w-]{11})/)?.slice(1).find(Boolean) || s;
}
function _rememberVideos(results) {
  const list = Array.isArray(results) ? results : [];
  if (_videoMeta.size >= META_MAX) _videoMeta.clear();
  for (const item of list) {
    const key = _videoKey(item?.youtube_url || item?.url);
    if (key) _videoMeta.set(key, { ...item, at: Date.now() });
  }
  return list;
}
function _rememberedVideo(value) {
  const entry = _videoMeta.get(_videoKey(value));
  return entry && Date.now() - entry.at < META_TTL ? entry : null;
}

// ─────────────────────────────────────────────
// BUSCA LOCAL — pacote yt-search (sem API externa)
// ─────────────────────────────────────────────
let _ytSearchLib = null;
async function localYtSearch(query) {
  if (!_ytSearchLib) _ytSearchLib = require('yt-search');
  const r = await _ytSearchLib(query);
  const videos = (r.videos || []).slice(0, 10).filter((v) => v.type === 'video' || !v.type);
  return videos.map((v) => ({
    title: v.title,
    youtube_url: v.url || `https://www.youtube.com/watch?v=${v.videoId}`,
    thumbnail: v.thumbnail || v.image || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
    author: v.author?.name || v.author || '',
    views: v.views || 0,
    duration: v.timestamp || v.duration?.toString() || '',
    source: 'yt-search-local',
  }));
}

// ─────────────────────────────────────────────
// API: BUSCA YOUTUBE (array simples)
// ─────────────────────────────────────────────
async function ytSearch(query) {
  let lastErr;
  // 1º — API systemzone
  try {
    const url = `${SYSTEMZONE_API_URL}/api/ytsearch?text=${encodeURIComponent(query)}&apikey=${encodeURIComponent(SYSTEMZONE_API_KEY)}`;
    const data = await mediaHandler.fetchJson(url, 20000);
    if (data?.resultados?.length) return _rememberVideos(data.resultados);
    lastErr = new Error('API sem resultados');
  } catch (e) {
    lastErr = e;
    console.warn('[ytSearch] API falhou:', e.message?.slice(0, 80));
  }
  // 2º — busca local (yt-search) — nunca depende de API externa
  try {
    const local = await localYtSearch(query);
    if (local.length) return _rememberVideos(local);
  } catch (e) {
    console.warn('[ytSearch] local falhou:', e.message?.slice(0, 80));
  }
  throw lastErr || new Error('Nenhum resultado encontrado para: ' + query);
}

/**
 * Formato compatível com o código de referência:
 *   const searchData = await systemZone.ytsearch(text)
 *   searchData.resultados[0]
 */
async function ytsearch(query) {
  const resultados = await ytSearch(query);
  return { status: true, resultados };
}

// ─────────────────────────────────────────────
// API: DOWNLOAD ÁUDIO
// ─────────────────────────────────────────────
async function ytAudio(urlOrQuery, quality = '128k') {
  const q = profile(quality, '720');
  // 1º — SystemZone API. Se a API suportar quality/bitrate, a conversão
  // já sai no tamanho pedido; se ignorar, o fallback local respeita q.audio.
  try {
    const endpoint = `${SYSTEMZONE_API_URL}/api/ytmp3?text=${encodeURIComponent(urlOrQuery)}&apikey=${encodeURIComponent(SYSTEMZONE_API_KEY)}&quality=${encodeURIComponent(q.apiAudio)}&bitrate=${encodeURIComponent(q.audio)}`;
    const data = await mediaHandler.fetchJson(endpoint, 65000);
    const r = data?.result || data?.data || data;
    const u = r?.download || r?.download_url || r?.url || data?.download_url;
    if ((data?.status === 'sucesso' || data?.status === true) && u) {
      return {
        url: String(u).replace(/^http:\/\//i, 'https://'),
        title: r?.title || data?.title || 'Áudio',
        author: r?.author || data?.artist || '',
        duration: r?.duration || data?.duration || '',
        thumbnail: r?.thumbnail || data?.thumbnail || '',
        quality: q.audio,
        source: 'SystemZone-ytmp3',
      };
    }
  } catch (e) {
    console.warn('[ytAudio] SystemZone falhou:', e.message);
  }

  // 2º — ytdl.js (yt-dlp, ytdl-core, youtubei, Loader.to)
  try {
    const ytdl = require('./ytdl');
    const r = await ytdl.getAudio(urlOrQuery, q.audio);
    return {
      buffer: r.buffer,
      title: r.title || 'Áudio',
      author: r.author || '',
      duration: r.duration || '',
      thumbnail: r.thumb || '',
      mimetype: r.mimetype || 'audio/mpeg',
      source: r.source || 'ytdl',
    };
  } catch (e) {
    console.warn('[ytAudio] ytdl falhou:', e.message);
  }

  throw new Error('Download de áudio falhou. Tente de novo em alguns segundos.');
}

// ─────────────────────────────────────────────
// API: DOWNLOAD VÍDEO
// ─────────────────────────────────────────────
async function ytVideo(urlOrQuery, quality = '720') {
  const q = profile('128k', quality);
  const remembered = _rememberedVideo(urlOrQuery) || {};
  // 1º — API recebe a resolução pedida para acelerar a entrega e reduzir
  // o tamanho do ficheiro. O fallback local também recebe q.video.
  try {
    const endpoint = `${SYSTEMZONE_API_URL}/api/ytmp4?text=${encodeURIComponent(urlOrQuery)}&apikey=${encodeURIComponent(SYSTEMZONE_API_KEY)}&quality=${encodeURIComponent(q.apiVideo)}&resolution=${encodeURIComponent(q.video)}`;
    const data = await mediaHandler.fetchJson(endpoint, 65000);
    const r = data?.result || data?.data || data;
    const u = r?.download || r?.download_url || r?.url;
    if (data?.status && u) {
      return {
        url: String(u).replace(/^http:\/\//i, 'https://'),
        title: r?.title || remembered.title || 'Vídeo',
        author: r?.author || remembered.author || '',
        duration: r?.duration || remembered.duration || '',
        quality: r?.quality || q.apiVideo,
        thumbnail: r?.thumbnail || remembered.thumbnail || '',
        source: 'SystemZone-ytmp4',
      };
    }
  } catch (e) {
    console.warn('[ytVideo] SystemZone falhou:', e.message);
  }

  // 2º — ytdl.js (yt-dlp, youtubei, Loader.to)
  try {
    const ytdl = require('./ytdl');
    const r = await ytdl.getVideo(urlOrQuery, q.video);
    return {
      buffer: r.buffer,
      title: r.title || remembered.title || 'Vídeo',
      author: r.author || remembered.author || '',
      duration: r.duration || remembered.duration || '',
      quality: r.quality || quality + 'p',
      thumbnail: r.thumb || remembered.thumbnail || '',
      mimetype: r.mimetype || 'video/mp4',
      source: r.source || 'ytdl',
    };
  } catch (e) {
    console.warn('[ytVideo] ytdl falhou:', e.message);
  }

  throw new Error('Download de vídeo falhou. Tente de novo.');
}

// ─────────────────────────────────────────────
// HELPER: Texto de fallback formatado
// ─────────────────────────────────────────────
function playFallbackText(video, prefix) {
  const audioCmd = `${prefix}ytd ${video.youtube_url}`;
  const videoCmd = `${prefix}gyt ${video.youtube_url} | mp4 | 720 | ${video.duration || ''}`;
  return (
    `🎵 *${video.title}*\n` +
    `👤 ${video.author || 'Desconhecido'}\n` +
    `⏱️ ${video.duration || '?'} • 👁️ ${Number(video.views || 0).toLocaleString('pt-BR')}\n\n` +
    `▶️ Escolha uma opção:\n` +
    `┃ 🎵 Áudio → \`${audioCmd}\`\n` +
    `┃ 🎬 Vídeo → \`${videoCmd}\`\n\n` +
    `💡 Copia o comando e envia, ou espera os botões carregarem.`
  );
}

// ─────────────────────────────────────────────
// CARD LEGACY — estilo DARK TÓXICO (mantido exportado por compatibilidade;
// !play, !play2 e !play3 usam o mesmo card visual em downloads.js)
// ─────────────────────────────────────────────
// Mantém os IDs compatíveis com ytd/gyt e respeita as qualidades pedidas
// pelo comando; os padrões preservam compatibilidade com chamadas antigas.
async function sendToxicPlayCard(sock, jid, video, prefix, quoted = null, quality = {}, bodyExtra = '') {
  const audioQuality = String(quality.audio || '128k');
  const videoQuality = String(quality.video || '480');
  const audioCmd = `${prefix}ytd ${video.youtube_url} | ${audioQuality}`;
  const title = String(video.title || 'Música').slice(0, 70);
  const author = String(video.author || 'Canal desconhecido').slice(0, 60);
  const duration = video.duration || '—';
  // A duração segue no ID do botão para não se perder no download.
  const videoCmd = `${prefix}gyt ${video.youtube_url} | mp4 | ${videoQuality} | ${duration}`;
  const views = Number(video.views || 0).toLocaleString('pt-BR');
  const body =
    `╭━━━〔 ☠️ 𖤐 ᴅᴀʀᴋ ᴛᴏxɪᴄ ᴘʟᴀʏ 𖤐 ☠️ 〕━━━╮\n` +
    `┃ 🩸 *${title}*\n` +
    (bodyExtra ? `┃ 🔎 *${bodyExtra}*\n` : '') +
    `┃\n` +
    `┃ 👤 𝙲𝚊𝚗𝚊𝚕: *${author}*\n` +
    `┃ ⏱️ 𝙳𝚞𝚛𝚊𝚌̧𝚊̃𝚘: *${duration}*\n` +
    `┃ 👁️ 𝚅𝚒𝚜𝚞𝚊𝚕𝚒𝚣𝚊𝚌̧𝚘̃𝚎𝚜: *${views}*\n` +
    `┃ 🎚️ ${audioQuality}  ·  ${videoQuality}p\n` +
    `┃\n` +
    `┃ ⚠️ 𓆩 𝙴𝚜𝚌𝚘𝚕𝚑𝚊 𝚘 𝚊𝚝𝚊𝚚𝚞𝚎 𓆪 ⚠️\n` +
    `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯\n` +
    `☠️ 𝙰𝚄́𝙳𝙸𝙾 𝚘𝚞 𝚅𝙸́𝙳𝙴𝙾? 𝙲𝚕𝚒𝚚𝚞𝚎 𝚎 𝚍𝚎𝚒𝚡𝚊 𝚘 𝚖𝚘𝚝𝚘𝚛 𝚝𝚛𝚊𝚋𝚊𝚕𝚑𝚊𝚛. 🩸`;
  const footer = '☠️ DARK BOT 𖤐 Dark Net Engine 𖤐 ☠️';
  try {
    const { sendButtonsWithImage, sendButtons } = require('./buttonHandler');
    const buttons = [
      { text: `🩸 ÁUDIO ${audioQuality}`, id: audioCmd },
      { text: `☠️ VÍDEO ${videoQuality}p`, id: videoCmd },
    ];
    if (video.thumbnail) {
      await sendButtonsWithImage(sock, jid, body, footer, video.thumbnail, buttons, quoted);
    } else {
      await sendButtons(sock, jid, body, footer, buttons, quoted);
    }
    return 'toxic-interactive';
  } catch (e) {
    console.warn('[ToxicPlay] interactive falhou:', e.message?.slice(0, 80));
  }

  // Se a implementação de botões não existir, entrega o mesmo visual em texto.
  await sock.sendMessage(jid, { text: `☠️ *${title}*\n\n${body}\n\n🩸 Áudio: \`${audioCmd}\`\n☠️ Vídeo: \`${videoCmd}\`\n\n${footer}` }, { quoted });
  return 'toxic-text';
}

// ─────────────────────────────────────────────
// ENVIAR CARD COM BOTÕES — cascata robusta
//   interactive viewOnce → texto
// ─────────────────────────────────────────────
async function sendPlayCard(sock, jid, video, prefix, quoted = null, bodyExtra = '') {
  const audioCmd = `${prefix}ytd ${video.youtube_url}`;
  const videoCmd = `${prefix}gyt ${video.youtube_url} | mp4 | 720 | ${video.duration || ''}`;
  const footer = (config.bot?.name ? `${config.bot.name} 🕸️ Dark Net Engine` : '© DARK BOT v6');
  const body =
    `👤 ${video.author || 'Desconhecido'}\n` +
    `⏱️ ${video.duration || '?'} • 👁️ ${Number(video.views || 0).toLocaleString('pt-BR')}\n\n` +
    (bodyExtra || '✦ ݁˖ Selecione o formato desejado ✦ ݁˖');


  // interactive viewOnce com thumbnail
  try {
    const { sendButtonsWithImage, sendButtons } = require('./buttonHandler');
    const title = `🎵 *${video.title}*\n\n${body}`;
    const btns = [
      { text: '🎵 Baixar Áudio', id: audioCmd },
      { text: '🎬 Baixar Vídeo', id: videoCmd },
    ];
    if (video.thumbnail) {
      try {
        await sendButtonsWithImage(sock, jid, title, footer, video.thumbnail, btns, quoted);
        return 'interactive';
      } catch {}
    }
    await sendButtons(sock, jid, title, footer, btns, quoted);
    return 'interactive';
  } catch (e) {
    console.warn('[PlayCard] interactive falhou:', e.message?.slice(0, 80));
  }

  // 3º — texto
  await sock.sendMessage(jid, { text: playFallbackText(video, prefix) }, { quoted });
  return 'text';
}

// ─────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────
module.exports = {
  ytSearch,
  ytsearch,
  ytAudio,
  ytVideo,
  sendPlayCard,
  sendToxicPlayCard,
  playFallbackText,
  localYtSearch,
  SYSTEMZONE_API_URL,
  SYSTEMZONE_API_KEY,
};
