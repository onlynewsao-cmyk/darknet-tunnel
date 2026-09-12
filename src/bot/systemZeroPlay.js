/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║   DARK BOT — SystemZero Play Engine v2 🎵                ║
 * ║   play / play2 / play3 com ButtonV2 real                 ║
 * ╚══════════════════════════════════════════════════════════╝
 *
 * Fluxo:
 *  1. Busca a música: API systemzone.store → fallback yt-search (local)
 *  2. Mostra card ButtonV2 com thumbnail + 2 botões (Áudio / Vídeo)
 *  3. Clique no botão → dispara !ytd (áudio) ou !gyt (vídeo)
 *  4. !ytd / !gyt → API systemzone → fallback yt-dlp local
 *
 * v2: ytsearch() retorna { resultados } (formato exacto do código
 * de referência) + sendPlayCard com cascata de 3 níveis:
 *   ButtonV2 → interactive viewOnce → texto formatado
 */

'use strict';

const mediaHandler = require('./mediaHandler');
const config = require('../config');
const { profile } = require('../../mediaQuality');

const SYSTEMZONE_API_URL = (process.env.SYSTEMZONE_API_URL || 'https://systemzone.store').replace(/\/$/, '');
const SYSTEMZONE_API_KEY = process.env.SYSTEMZONE_API_KEY || 'freekey';

// ─────────────────────────────────────────────
// LAZY LOAD ButtonV2 (só quando necessário)
// ─────────────────────────────────────────────
let _ButtonV2 = null;
function getButtonV2() {
  if (_ButtonV2) return _ButtonV2;
  try {
    const mod = require('@systemzero/baileys/lib/MB.cjs');
    _ButtonV2 = mod.ButtonV2;
    return _ButtonV2;
  } catch (e) {
    console.warn('[SystemZeroPlay] MB.cjs indisponível:', e.message);
    return null;
  }
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
    if (data?.resultados?.length) return data.resultados;
    lastErr = new Error('API sem resultados');
  } catch (e) {
    lastErr = e;
    console.warn('[ytSearch] API falhou:', e.message?.slice(0, 80));
  }
  // 2º — busca local (yt-search) — nunca depende de API externa
  try {
    const local = await localYtSearch(query);
    if (local.length) return local;
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
        title: r?.title || 'Vídeo',
        duration: r?.duration || '',
        quality: r?.quality || q.apiVideo,
        thumbnail: r?.thumbnail || '',
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
      title: r.title || 'Vídeo',
      duration: r.duration || '',
      quality: r.quality || quality + 'p',
      thumbnail: r.thumb || '',
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
  const videoCmd = `${prefix}gyt ${video.youtube_url} | mp4 | 720`;
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
// CARD PLAY — estilo DARK TÓXICO (apenas play)
// ─────────────────────────────────────────────
// Mantém os IDs dos botões compatíveis com ytd/gyt. O play3 continua
// a usar o card normal e não passa por este fluxo.
async function sendToxicPlayCard(sock, jid, video, prefix, quoted = null) {
  const audioCmd = `${prefix}ytd ${video.youtube_url}`;
  const videoCmd = `${prefix}gyt ${video.youtube_url} | mp4 | 480`;
  const title = String(video.title || 'Música').slice(0, 70);
  const author = String(video.author || 'Canal desconhecido').slice(0, 60);
  const duration = video.duration || '—';
  const views = Number(video.views || 0).toLocaleString('pt-BR');
  const body =
    `╭━━━〔 ☠️ 𖤐 ᴅᴀʀᴋ ᴛᴏxɪᴄ ᴘʟᴀʏ 𖤐 ☠️ 〕━━━╮\n` +
    `┃ 🩸 *${title}*\n` +
    `┃\n` +
    `┃ 👤 𝙲𝚊𝚗𝚊𝚕: *${author}*\n` +
    `┃ ⏱️ 𝙳𝚞𝚛𝚊𝚌̧𝚊̃𝚘: *${duration}*\n` +
    `┃ 👁️ 𝚅𝚒𝚜𝚞𝚊𝚕𝚒𝚣𝚊𝚌̧𝚘̃𝚎𝚜: *${views}*\n` +
    `┃\n` +
    `┃ ⚠️ 𓆩 𝙴𝚜𝚌𝚘𝚕𝚑𝚊 𝚘 𝚊𝚝𝚊𝚚𝚞𝚎 𓆪 ⚠️\n` +
    `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯\n` +
    `☠️ 𝙰𝚄́𝙳𝙸𝙾 𝚘𝚞 𝚅𝙸́𝙳𝙴𝙾? 𝙲𝚕𝚒𝚚𝚞𝚎 𝚎 𝚍𝚎𝚒𝚡𝚊 𝚘 𝚖𝚘𝚝𝚘𝚛 𝚝𝚛𝚊𝚋𝚊𝚕𝚑𝚊𝚛. 🩸`;
  const footer = '☠️ DARK BOT 𖤐 Dark Net Engine 𖤐 ☠️';
  const ButtonV2 = getButtonV2();
  if (ButtonV2) {
    try {
      const card = new ButtonV2(sock);
      card.setTitle(`☠️ ${title}`.slice(0, 60));
      card.setBody(body);
      card.setFooter(footer);
      if (video.thumbnail) { try { card.setThumbnail(video.thumbnail); } catch {} }
      // Rótulos curtos: o ButtonV2 coloca os dois botões na mesma linha.
      // Texto comprido força quebra no WhatsApp e deixa o card vertical.
      card.addButton('🩸 ÁUDIO', audioCmd);
      card.addButton('☠️ VÍDEO', videoCmd);
      await card.send(jid, { quoted });
      return 'toxic-buttonv2';
    } catch (e) { console.warn('[ToxicPlay] ButtonV2 falhou:', e.message?.slice(0, 80)); }
  }
  // Se a implementação de botões não existir, entrega o mesmo visual em texto.
  await sock.sendMessage(jid, { text: `☠️ *${title}*\n\n${body}\n\n🩸 Áudio: \`${audioCmd}\`\n☠️ Vídeo: \`${videoCmd}\`\n\n${footer}` }, { quoted });
  return 'toxic-text';
}

// ─────────────────────────────────────────────
// ENVIAR CARD COM BOTÕES — cascata robusta
//   1º ButtonV2 (MB.cjs)  2º interactive viewOnce  3º texto
// ─────────────────────────────────────────────
async function sendPlayCard(sock, jid, video, prefix, quoted = null, bodyExtra = '') {
  const audioCmd = `${prefix}ytd ${video.youtube_url}`;
  const videoCmd = `${prefix}gyt ${video.youtube_url} | mp4 | 720`;
  const footer = (config.bot?.name ? `${config.bot.name} 🕸️ Dark Net Engine` : '© DARK BOT v6');
  const body =
    `👤 ${video.author || 'Desconhecido'}\n` +
    `⏱️ ${video.duration || '?'} • 👁️ ${Number(video.views || 0).toLocaleString('pt-BR')}\n\n` +
    (bodyExtra || '✦ ݁˖ Selecione o formato desejado ✦ ݁˖');

  // 1º — ButtonV2 (código de referência)
  const ButtonV2 = getButtonV2();
  if (ButtonV2) {
    try {
      const msg = new ButtonV2(sock);
      msg.setTitle(`${video.title}`.slice(0, 60));
      msg.setBody(body);
      msg.setFooter(footer);
      if (video.thumbnail) {
        try { msg.setThumbnail(video.thumbnail); } catch {}
      }
      msg.addButton('🎵 Baixar Áudio', audioCmd);
      msg.addButton('🎬 Baixar Vídeo', videoCmd);
      await msg.send(jid, { quoted });
      return 'buttonv2';
    } catch (e) {
      console.warn('[PlayCard] ButtonV2 falhou:', e.message?.slice(0, 80));
    }
  }

  // 2º — interactive viewOnce com thumbnail
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
