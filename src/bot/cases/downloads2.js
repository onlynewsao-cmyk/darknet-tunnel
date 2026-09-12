/**
 * DARK BOT v6.16 — Downloads COMPLETOS
 * Todos os comandos de download com lógica real
 * Usa dl/others.js + dl/social.js + dl/helpers.js
 */
'use strict';

// v6.46: lazy-load — puxa sharp/ffmpeg, pesado no cold start do Render.
let _lz_downloader;
const downloader = new Proxy({}, { get: (_, k) => (_lz_downloader ||= require('../downloader'))[k] });
let _lz_mediaHandler;
const mediaHandler = new Proxy({}, { get: (_, k) => (_lz_mediaHandler ||= require('../mediaHandler'))[k] });
const config = require('../../config');

// Helper: enviar áudio
async function sendAudio(sock, jid, quoted, r) {
  const buf = r.buffer || await mediaHandler.fetchBuffer(r.url || r.download || r.download_url);
  if (!buf || buf.length < 1024) throw new Error('áudio vazio');
  const title = r.title || 'Áudio';
  const mime = r.mimetype || 'audio/mpeg';
  const ext = mime.includes('mp4') ? 'm4a' : 'mp3';
  return sock.sendMessage(jid, {
    audio: buf, mimetype: mime,
    fileName: `${title.replace(/[/\\?%*:|"<>]/g, '-').slice(0, 60)}.${ext}`,
    ptt: false,
    contextInfo: r.thumbnail ? {
      externalAdReply: { title, body: r.author || '', mediaType: 2, thumbnail: await mediaHandler.fetchBuffer(r.thumbnail).catch(() => null), mediaUrl: '', sourceUrl: '' },
    } : undefined,
  }, { quoted });
}

// Helper: enviar vídeo
async function sendVideo(sock, jid, quoted, r) {
  const buf = r.buffer || await mediaHandler.fetchBuffer(r.url || r.download || r.download_url);
  if (!buf || buf.length < 4096) throw new Error('vídeo vazio');
  const isMP4 = buf.slice(4, 8).toString() === 'ftyp';
  if (isMP4) return sock.sendMessage(jid, { video: buf, caption: `🎬 *${r.title || 'Vídeo'}*`, mimetype: 'video/mp4' }, { quoted });
  return sock.sendMessage(jid, { document: buf, fileName: `${(r.title || 'video').slice(0, 50)}.mp4`, mimetype: 'video/mp4', caption: `🎬 *${r.title || 'Vídeo'}*` }, { quoted });
}

// Helper: resposta de erro com tema
async function errReply(sock, msg, ctx, text) {
  const RE = require('../renderEngine');
  const t = await RE.getTheme(ctx.remoteJid);
  return sock.sendMessage(ctx.remoteJid, { text: RE.renderBlock(t, 'ERRO', ['❌ ' + text], { botName: config.bot.name }) }, { quoted: msg });
}

module.exports = function registerDownloads2(registerCase) {

  // ═══ TIKTOK ═══
  registerCase(['tiktok', 'tt', 'ttk', 'ttk2', 'tiktok2'], async ({ sock, msg, ctx, args, prefix, reply }) => {
    const url = args.join(' ').trim();
    if (!url) return reply(`🎶 Uso: \`${prefix}tiktok <url>\``);
    sock.sendMessage(ctx.remoteJid, { react: { text: '⏳', key: msg.key } });
    try {
      const dl = require('../dl/others');
      const r = await dl.tiktok(url);
      if (r.video || r.url || r.download) await sendVideo(sock, ctx.remoteJid, msg, r);
      else if (r.images?.length) { for (const img of r.images.slice(0, 10)) await sock.sendMessage(ctx.remoteJid, { image: { url: img } }, { quoted: msg }); }
      else throw new Error('Sem resultado');
      sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } });
    } catch (e) { sock.sendMessage(ctx.remoteJid, { react: { text: '❌', key: msg.key } }); return errReply(sock, msg, ctx, 'TikTok: ' + e.message); }
  });

  // ═══ INSTAGRAM ═══
  registerCase(['instagram', 'ig', 'instamp3', 'instamp4', 'igstory'], async ({ sock, msg, ctx, args, prefix, reply }) => {
    const url = args.join(' ').trim();
    if (!url) return reply(`📸 Uso: \`${prefix}instagram <url>\``);
    sock.sendMessage(ctx.remoteJid, { react: { text: '⏳', key: msg.key } });
    try {
      const dl = require('../dl/others');
      const r = await dl.instagram(url);
      const items = Array.isArray(r) ? r : [r];
      for (const item of items.slice(0, 10)) {
        if (item.video || item.url?.match(/\.mp4/i)) await sendVideo(sock, ctx.remoteJid, msg, item);
        else await sock.sendMessage(ctx.remoteJid, { image: { url: item.image || item.url || item.thumbnail } }, { quoted: msg });
      }
      sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } });
    } catch (e) { sock.sendMessage(ctx.remoteJid, { react: { text: '❌', key: msg.key } }); return errReply(sock, msg, ctx, 'Instagram: ' + e.message); }
  });

  // ═══ FACEBOOK ═══
  registerCase(['facebook', 'fb', 'fbvideo', 'fbphoto', 'fbfoto'], async ({ sock, msg, ctx, args, prefix, reply }) => {
    const url = args.join(' ').trim();
    if (!url) return reply(`📘 Uso: \`${prefix}facebook <url>\``);
    sock.sendMessage(ctx.remoteJid, { react: { text: '⏳', key: msg.key } });
    try {
      const dl = require('../dl/others');
      const r = await dl.facebook(url);
      await sendVideo(sock, ctx.remoteJid, msg, r);
      sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } });
    } catch (e) { sock.sendMessage(ctx.remoteJid, { react: { text: '❌', key: msg.key } }); return errReply(sock, msg, ctx, 'Facebook: ' + e.message); }
  });

  // ═══ TWITTER ═══
  registerCase(['twitter', 'tw', 'twitterdl'], async ({ sock, msg, ctx, args, prefix, reply }) => {
    const url = args.join(' ').trim();
    if (!url) return reply(`🐦 Uso: \`${prefix}twitter <url>\``);
    sock.sendMessage(ctx.remoteJid, { react: { text: '⏳', key: msg.key } });
    try {
      const dl = require('../dl/others');
      const r = await dl.twitter(url);
      const items = Array.isArray(r) ? r : [r];
      for (const item of items.slice(0, 5)) {
        if (item.video || item.url?.match(/\.mp4/i)) await sendVideo(sock, ctx.remoteJid, msg, item);
        else await sock.sendMessage(ctx.remoteJid, { image: { url: item.image || item.url } }, { quoted: msg });
      }
      sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } });
    } catch (e) { sock.sendMessage(ctx.remoteJid, { react: { text: '❌', key: msg.key } }); return errReply(sock, msg, ctx, 'Twitter: ' + e.message); }
  });

  // ═══ SPOTIFY ═══
  registerCase(['spotify', 'spotify2', 'sp'], async ({ sock, msg, ctx, args, prefix, reply }) => {
    const query = args.join(' ').trim();
    if (!query) return reply(`💚 Uso: \`${prefix}spotify <nome ou url>\``);
    sock.sendMessage(ctx.remoteJid, { react: { text: '⏳', key: msg.key } });
    try {
      const dl = require('../dl/others');
      const r = await dl.spotify(query);
      await sendAudio(sock, ctx.remoteJid, msg, r);
      sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } });
    } catch (e) { sock.sendMessage(ctx.remoteJid, { react: { text: '❌', key: msg.key } }); return errReply(sock, msg, ctx, 'Spotify: ' + e.message); }
  });

  // ═══ SOUNDCLOUD ═══
  registerCase(['soundcloud', 'sc', 'scdl'], async ({ sock, msg, ctx, args, prefix, reply }) => {
    const query = args.join(' ').trim();
    if (!query) return reply(`☁️ Uso: \`${prefix}soundcloud <nome ou url>\``);
    sock.sendMessage(ctx.remoteJid, { react: { text: '⏳', key: msg.key } });
    try {
      const dl = require('../dl/others');
      const r = await dl.soundcloud(query);
      await sendAudio(sock, ctx.remoteJid, msg, r);
      sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } });
    } catch (e) { sock.sendMessage(ctx.remoteJid, { react: { text: '❌', key: msg.key } }); return errReply(sock, msg, ctx, 'SoundCloud: ' + e.message); }
  });

  // ═══ PINTEREST (imagem/vídeo) ═══
  registerCase(['pinterest2', 'pintemp3', 'pintemp4'], async ({ sock, msg, ctx, args, prefix, reply }) => {
    const query = args.join(' ').trim();
    if (!query) return reply(`📌 Uso: \`${prefix}pinterest <busca ou url>\``);
    sock.sendMessage(ctx.remoteJid, { react: { text: '⏳', key: msg.key } });
    try {
      const dl = require('../dl/others');
      if (/^https?:\/\//i.test(query)) {
        const r = await dl.pinterest(query);
        if (r.video || r.url?.match(/\.mp4/i)) await sendVideo(sock, ctx.remoteJid, msg, r);
        else await sock.sendMessage(ctx.remoteJid, { image: { url: r.image || r.url || r.image_url } }, { quoted: msg });
      } else {
        const results = await dl.pinterestSearch(query);
        if (results?.length) await sock.sendMessage(ctx.remoteJid, { image: { url: results[0].image_url || results[0].url } }, { quoted: msg });
        else throw new Error('Sem resultados');
      }
      sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } });
    } catch (e) { sock.sendMessage(ctx.remoteJid, { react: { text: '❌', key: msg.key } }); return errReply(sock, msg, ctx, 'Pinterest: ' + e.message); }
  });

  // ═══ YOUTUBE AUDIO (aliases de ytd) ═══
  registerCase(['baixaraudio', 'dlmp3', 'ytaudio', 'tomp3', 'ytmp3s', 'dlmp3s'], async ({ sock, msg, ctx, args, prefix, reply }) => {
    const url = args.join(' ').trim();
    if (!url) return reply(`🎵 Uso: \`${prefix}ytd <url YouTube>\``);
    sock.sendMessage(ctx.remoteJid, { react: { text: '⏳', key: msg.key } });
    try {
      const ytdl = require('../ytdl');
      const r = await ytdl.getAudio(url, '128k');
      await sendAudio(sock, ctx.remoteJid, msg, r);
      sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } });
    } catch (e) { sock.sendMessage(ctx.remoteJid, { react: { text: '❌', key: msg.key } }); return errReply(sock, msg, ctx, 'Áudio: ' + e.message); }
  });

  // ═══ YOUTUBE VIDEO (aliases de gyt/video) ═══
  registerCase(['baixarvideo', 'dlmp4', 'vid', 'fhd', 'ytmp4s', 'yt4v2', 'yt4k', 'ytplay4', 'yt3v2'], async ({ sock, msg, ctx, args, prefix, reply }) => {
    const url = args.join(' ').trim();
    if (!url) return reply(`🎬 Uso: \`${prefix}video <url ou busca>\``);
    sock.sendMessage(ctx.remoteJid, { react: { text: '⏳', key: msg.key } });
    try {
      const ytdl = require('../ytdl');
      const r = await ytdl.getVideo(url, '720');
      await sendVideo(sock, ctx.remoteJid, msg, r);
      sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } });
    } catch (e) { sock.sendMessage(ctx.remoteJid, { react: { text: '❌', key: msg.key } }); return errReply(sock, msg, ctx, 'Vídeo: ' + e.message); }
  });

  // ═══ VIDEO FHD (aliases de video2) ═══
  registerCase(['vid2', 'playvid', 'playvid2'], async ({ sock, msg, ctx, args, prefix, reply }) => {
    const query = args.join(' ').trim();
    if (!query) return reply(`📺 Uso: \`${prefix}video2 <busca ou url>\``);
    sock.sendMessage(ctx.remoteJid, { react: { text: '⏳', key: msg.key } });
    try {
      const ytdl = require('../ytdl');
      const r = await ytdl.getVideo(query, '1080');
      await sendVideo(sock, ctx.remoteJid, msg, r);
      sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } });
    } catch (e) { sock.sendMessage(ctx.remoteJid, { react: { text: '❌', key: msg.key } }); return errReply(sock, msg, ctx, 'FHD: ' + e.message); }
  });

  // ═══ PLAY POR ID ═══
  registerCase(['playid', 'playmax'], async ({ sock, msg, ctx, args, prefix, reply }) => {
    const id = args.join(' ').trim();
    if (!id) return reply(`🎵 Uso: \`${prefix}playid <id ou url>\``);
    const url = id.startsWith('http') ? id : `https://youtube.com/watch?v=${id}`;
    sock.sendMessage(ctx.remoteJid, { react: { text: '⏳', key: msg.key } });
    try {
      const ytdl = require('../ytdl');
      const r = await ytdl.getAudio(url, '128k');
      await sendAudio(sock, ctx.remoteJid, msg, r);
      sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } });
    } catch (e) { sock.sendMessage(ctx.remoteJid, { react: { text: '❌', key: msg.key } }); return errReply(sock, msg, ctx, e.message); }
  });

  // ═══ GDRIVE ═══
  registerCase(['gdrive'], async ({ sock, msg, ctx, args, prefix, reply }) => {
    const url = args.join(' ').trim();
    if (!url) return reply(`📁 Uso: \`${prefix}gdrive <url>\``);
    sock.sendMessage(ctx.remoteJid, { react: { text: '⏳', key: msg.key } });
    try {
      const axios = require('axios');
      const id = url.match(/\/d\/([^/]+)/)?.[1] || url.match(/id=([^&]+)/)?.[1];
      if (!id) throw new Error('ID do Google Drive não encontrado');
      const dlUrl = `https://drive.google.com/uc?export=download&id=${id}`;
      const r = await axios.get(dlUrl, { responseType: 'stream', maxRedirects: 5, timeout: 30000 });
      const chunks = [];
      for await (const chunk of r.data) chunks.push(chunk);
      const buf = Buffer.concat(chunks);
      const fname = r.headers['content-disposition']?.match(/filename="?([^"]+)"?/)?.[1] || 'arquivo';
      await sock.sendMessage(ctx.remoteJid, { document: buf, fileName: fname, mimetype: r.headers['content-type'] || 'application/octet-stream' }, { quoted: msg });
      sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } });
    } catch (e) { sock.sendMessage(ctx.remoteJid, { react: { text: '❌', key: msg.key } }); return errReply(sock, msg, ctx, 'GDrive: ' + e.message); }
  });

  // ═══ MEDIAFIRE ═══
  registerCase(['mediafire'], async ({ sock, msg, ctx, args, prefix, reply }) => {
    const url = args.join(' ').trim();
    if (!url) return reply(` Uso: \`${prefix}mediafire <url>\``);
    sock.sendMessage(ctx.remoteJid, { react: { text: '⏳', key: msg.key } });
    try {
      const axios = require('axios');
      const page = (await axios.get(url, { timeout: 15000 })).data;
      const dlUrl = page.match(/href="(https:\/\/download[^"]+)"/)?.[1] || page.match(/"download_link"\s*:\s*"([^"]+)"/)?.[1];
      if (!dlUrl) throw new Error('Link de download não encontrado');
      const r = await axios.get(dlUrl.replace(/\\//g, '/'), { responseType: 'stream', timeout: 60000 });
      const chunks = [];
      for await (const chunk of r.data) chunks.push(chunk);
      const buf = Buffer.concat(chunks);
      const fname = url.split('/').pop() || 'arquivo';
      await sock.sendMessage(ctx.remoteJid, { document: buf, fileName: fname, mimetype: r.headers['content-type'] || 'application/octet-stream' }, { quoted: msg });
      sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } });
    } catch (e) { sock.sendMessage(ctx.remoteJid, { react: { text: '❌', key: msg.key } }); return errReply(sock, msg, ctx, 'MediaFire: ' + e.message); }
  });

  // ═══ SHAZAM (identificar música pela letra) ═══
  registerCase(['shazam', 'identificar', 'qualmusica'], async ({ sock, msg, ctx, args, prefix, reply, react }) => {
    const RE = require('../renderEngine');
    const t = await RE.getTheme(ctx.remoteJid);
    const trecho = args.join(' ').trim();
    const quoted = msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    // áudio citado → reconhecimento por fingerprint precisa de API (AudD/ACRCloud)
    if (quoted && (quoted.audioMessage || quoted.pttMessage)) {
      return reply(RE.renderBlock(t, 'SHAZAM', [
        '🎧 Não consigo reconhecer o áudio directamente — isso precisa de uma API de impressão digital (AudD/ACRCloud) que não está configurada.',
        '',
        '👉 Mas identifico pela LETRA:',
        `\`${prefix}shazam <trecho da música>\``,
      ], { botName: config.bot.name }));
    }

    if (!trecho) {
      return reply(RE.renderBlock(t, 'SHAZAM', [
        '🎵 Identifico músicas pela letra.',
        '',
        `Uso: \`${prefix}shazam <trecho da letra>\``,
        `Ex: \`${prefix}shazam i know it is the last time\``,
        '',
        'Achas a música e queres o áudio? Usa ' + prefix + 'play <título>.',
      ], { botName: config.bot.name }));
    }

    try { react('⏳'); } catch {}
    try {
      const ai = require('../ai');
      const r = await ai.chat(
        `Identifica a música a partir deste trecho de letra: "${trecho}". Responde SÓ com: Título — Artista (ano). Se não souberes, responde "não identifiquei".`,
        'És um especialista em música com conhecimento enciclopédico.',
        {}, false
      );
      const texto = String(r || '').trim().replace(/^[❌✗Xx-]+/, '').trim() || 'Não identifiquei.';
      try { react('✅'); } catch {}
      return reply(RE.renderBlock(t, 'SHAZAM', [
        `🎶 *${texto.slice(0, 120)}*`,
        trecho ? `Trecho: "${trecho.slice(0, 80)}"` : '',
        `> Queres o áudio? ${prefix}play ${texto.split('—')[0].trim().slice(0, 40)}`,
      ].filter(Boolean), { botName: config.bot.name }));
    } catch (e) {
      try { react('❌'); } catch {}
      return reply(RE.renderBlock(t, 'ERRO', ['❌ IA indisponível agora: ' + (e.message || e).slice(0, 60)], { botName: config.bot.name }));
    }
  });

  // ═══ MYINSTANTS ═══
  registerCase(['myinstants'], async ({ sock, msg, ctx, args, prefix, reply }) => {
    const query = args.join(' ').trim();
    if (!query) return reply(`🔊 Uso: \`${prefix}myinstants <nome do som>\``);
    sock.sendMessage(ctx.remoteJid, { react: { text: '⏳', key: msg.key } });
    try {
      const axios = require('axios');
      const r = await axios.get(`https://www.myinstants.com/api/search/?term=${encodeURIComponent(query)}`, { timeout: 10000 });
      const results = r.data?.results;
      if (!results?.length) throw new Error('Sem resultados');
      const mp3Url = `https://www.myinstants.com${results[0].mp3}`;
      const buf = await mediaHandler.fetchBuffer(mp3Url);
      await sock.sendMessage(ctx.remoteJid, { audio: buf, mimetype: 'audio/mpeg', fileName: results[0].name + '.mp3', ptt: true }, { quoted: msg });
      sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } });
    } catch (e) { sock.sendMessage(ctx.remoteJid, { react: { text: '❌', key: msg.key } }); return errReply(sock, msg, ctx, 'MyInstants: ' + e.message); }
  });

  // ═══ KWAI ═══
  registerCase(['kwai'], async ({ sock, msg, ctx, args, prefix, reply }) => {
    const url = args.join(' ').trim();
    if (!url) return reply(`📱 Uso: \`${prefix}kwai <url>\`\nEx: \`${prefix}kwai https://www.kwai.com/...\``);
    sock.sendMessage(ctx.remoteJid, { react: { text: '⏳', key: msg.key } });
    try {
      // 1º — yt-dlp (suporta Kwai/Kuaishou, sem depender de API externa)
      try {
        const dl = require('../downloader');
        const r = await dl.ytdlpSocialVideo(url, 'Kwai HD');
        await sendVideo(sock, ctx.remoteJid, msg, r);
        sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } });
        return;
      } catch (e) { console.log('[KWAI] yt-dlp falhou:', e.message?.slice(0, 80)); }
      // 2º — API pública (pode estar offline)
      const axios = require('axios');
      const r = await axios.get(`https://api.zahwazein.xyz/downloader/kwai?url=${encodeURIComponent(url)}`, { timeout: 12000 });
      const dlUrl = r.data?.result?.url || r.data?.result?.video;
      if (!dlUrl) throw new Error('Sem resultado');
      const buf = await mediaHandler.fetchBuffer(dlUrl);
      await sendVideo(sock, ctx.remoteJid, msg, { buffer: buf, title: 'Kwai' });
      sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } });
    } catch (e) { sock.sendMessage(ctx.remoteJid, { react: { text: '❌', key: msg.key } }); return errReply(sock, msg, ctx, 'Kwai: ' + e.message + '\n\nSe o link for privado, tenta ' + prefix + 'video <nome> no YouTube.'); }
  });

  // ═══ MCPLUGIN ═══
  registerCase(['mcplugin'], async ({ sock, msg, ctx, args, prefix, reply }) => {
    const query = args.join(' ').trim();
    if (!query) return reply(`⛏️ Uso: \`${prefix}mcplugin <nome do plugin>\``);
    sock.sendMessage(ctx.remoteJid, { react: { text: '⏳', key: msg.key } });
    try {
      const axios = require('axios');
      const r = await axios.get(`https://api.spiget.org/v2/search/resources/${encodeURIComponent(query)}?size=1`, { timeout: 10000 });
      if (!r.data?.length) throw new Error('Plugin não encontrado');
      const plugin = r.data[0];
      const dlUrl = `https://api.spiget.org/v2/resources/${plugin.id}/download`;
      const buf = await mediaHandler.fetchBuffer(dlUrl);
      await sock.sendMessage(ctx.remoteJid, { document: buf, fileName: `${plugin.name}.jar`, mimetype: 'application/java-archive', caption: `⛏️ *${plugin.name}*\n📝 ${plugin.tag || ''}` }, { quoted: msg });
      sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } });
    } catch (e) { sock.sendMessage(ctx.remoteJid, { react: { text: '❌', key: msg.key } }); return errReply(sock, msg, ctx, 'MCPlugin: ' + e.message); }
  });

  // ═══ TIKTOK SEARCH POR NOME (ttks) ═══
  registerCase(['ttks', 'ttsearch', 'tiktoksearch', 'tts'], async ({ sock, msg, ctx, args, prefix, reply }) => {
    const query = args.join(' ').trim();
    if (!query) return reply(`🎶 Uso: \`${prefix}ttks <nome da música ou busca>\`\nEx: \`${prefix}ttks central cee band4band\``);
    sock.sendMessage(ctx.remoteJid, { react: { text: '🔍', key: msg.key } });
    try {
      const dl = require('../dl/others');
      const results = await dl.tiktokSearch(query, 3);
      if (!results.length) throw new Error('Nenhum vídeo encontrado para: ' + query);
      
      sock.sendMessage(ctx.remoteJid, { react: { text: '⏳', key: msg.key } });
      
      // Envia o primeiro resultado como vídeo
      const r = results[0];
      if (r.url) {
        await sendVideo(sock, ctx.remoteJid, msg, r);
      } else {
        throw new Error('Sem URL de download');
      }
      
      // Se há mais resultados, informa
      if (results.length > 1) {
        const RE = require('../renderEngine');
        const t = await RE.getTheme(ctx.remoteJid);
        const extra = results.slice(1).map((v, i) => `${i + 2}. ${v.title?.slice(0, 50) || 'TikTok'} — @${v.author || '?'}`).join('\n');
        await reply(RE.renderBlock(t, 'TIKTOK', [`🎬 Mais resultados para "${query}":`, extra, `> Usa ${prefix}ttks <número> para baixar outro`], { botName: config.bot.name }));
      }
      
      sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } });
    } catch (e) {
      sock.sendMessage(ctx.remoteJid, { react: { text: '❌', key: msg.key } });
      return errReply(sock, msg, ctx, 'TikTok Search: ' + e.message);
    }
  });

  // ═══ TIKTOK STALK (perfil → vídeos em alta) ═══
  // A API de stalk antiga (zahwazein) está offline. Fallback real:
  // pesquisa o username no TikTok (tikwm) e mostra os vídeos do perfil.
  registerCase(['tiktoktxt', 'tiktokstalk', 'ttstalk', 'ttkstalk'], async ({ sock, msg, ctx, args, prefix, reply }) => {
    const user = args.join(' ').trim().replace(/^@/, '');
    if (!user) return reply(`🎶 Uso: \`${prefix}tiktoktxt <username>\``);
    sock.sendMessage(ctx.remoteJid, { react: { text: '⏳', key: msg.key } });
    try {
      const dl = require('../dl/others');
      const results = await dl.tiktokSearch(user, 3);
      if (!results.length) throw new Error('Perfil não encontrado ou sem vídeos públicos');
      const r = results[0];
      await sendVideo(sock, ctx.remoteJid, msg, r);
      if (results.length > 1) {
        const RE = require('../renderEngine');
        const t = await RE.getTheme(ctx.remoteJid);
        const extra = results.slice(1).map((v, i) => `${i + 2}. ${(v.title || 'TikTok').slice(0, 40)} — @${v.author || user}`).join('\n');
        await reply(RE.renderBlock(t, 'TIKTOK · ' + user.toUpperCase(), [
          `🎬 Vídeos em alta de *@${user}*:`,
          extra,
          `> Usa ${prefix}ttks ${user} para baixar outro`,
        ], { botName: config.bot.name }));
      }
      sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } });
    } catch (e) { sock.sendMessage(ctx.remoteJid, { react: { text: '❌', key: msg.key } }); return errReply(sock, msg, ctx, 'TikTok Stalk: ' + e.message); }
  });

  // ═══ REMOVER down/downloads do submenu (são navegação) ═══
  // Estes comandos abrem o submenu, não fazem download
  registerCase(['down', 'downloads'], async ({ sock, msg, ctx, config: cfg }) => {
    // Redireciona para o submenu dinâmico
    const sd = require('../submenuData');
    const ch = require('../caseHandler');
    const allCmds = [...ch.CASES.keys()];
    const items = sd.buildItems(allCmds, 'downloads');
    const RE = require('../renderEngine');
    const t = await RE.getTheme(ctx.remoteJid);
    const pe = require('../prefixEngine');
    const p = await pe.getActivePrefix(ctx.remoteJid).catch(() => (cfg || config).bot.prefix);
    const txtCmds = items.filter(it => it.sel !== true);
    const selCmds = items.filter(it => it.sel === true);
    const textBody = RE.renderSubmenu(t, 'DOWNLOADS', txtCmds.map(it => ({ name: it.cmd, desc: it.desc, group: it.subcat || undefined })), { prefix: p, botName: (cfg || config).bot.name });
    const rows = selCmds.slice(0, 24).map(it => ({ title: `${it.emoji || '📥'} ${p}${it.cmd}`, description: (it.desc || '').slice(0, 72), id: `${p}${it.cmd}` }));
    if (rows.length) {
      try {
        const { generateWAMessageFromContent, proto } = require('@systemzero/baileys');
        const m = generateWAMessageFromContent(ctx.remoteJid, {
          interactiveMessage: proto.Message.InteractiveMessage.fromObject({
            body: proto.Message.InteractiveMessage.Body.fromObject({ text: textBody }),
            footer: proto.Message.InteractiveMessage.Footer.fromObject({ text: `${t.icon || '🕸️'} ${(cfg || config).bot.name}` }),
            header: proto.Message.InteractiveMessage.Header.fromObject({ title: '', hasMediaAttachment: false }),
            nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
              buttons: [{ name: 'single_select', buttonParamsJson: JSON.stringify({ title: `${t.icon || '🕸️'} DOWNLOADS`, sections: [{ title: 'AÇÕES DIRECTAS', rows }] }) }],
            }),
          }),
        }, { userJid: sock.user?.id, quoted: msg });
        await sock.relayMessage(ctx.remoteJid, m.message, { messageId: m.key.id, additionalNodes: [{ tag: 'biz', attrs: {}, content: [{ tag: 'interactive', attrs: { type: 'native_flow', v: '1' }, content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }] }] }] });
        return;
      } catch {}
    }
    return sock.sendMessage(ctx.remoteJid, { text: textBody }, { quoted: msg });
  });
};
