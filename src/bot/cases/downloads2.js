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
  if (!mediaHandler.isAudioBytes(buf)) throw new Error('áudio vazio ou inválido'); // v7.56
  const title = r.title || 'Áudio';
  const mime = r.mimetype || 'audio/mpeg';
  const ext = mime.includes('mp4') ? 'm4a' : 'mp3';
  let contextInfo;
  if (r.thumbnail) {
    const thumb = mediaHandler.cleanThumb(await mediaHandler.fetchBuffer(r.thumbnail).catch(() => null));
    if (thumb) contextInfo = { externalAdReply: { title, body: r.author || '', mediaType: 2, thumbnail: thumb, mediaUrl: '', sourceUrl: '' } };
  }
  console.log('[MUSIC-SEND]', jid, Math.round(buf.length / 1024) + 'KB', mime, r.source || r.quality || '');
  return sock.sendMessage(jid, {
    audio: buf, mimetype: mime,
    fileName: `${title.replace(/[/\\?%*:|"<>]/g, '-').slice(0, 60)}.${ext}`,
    ptt: false,
    ...(contextInfo ? { contextInfo } : {}),
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

// v7.47 incoming-cases (tomp3): vídeo/áudio → MP3 192k via ffmpeg,
// sem shell (execFileSync), ficheiros temporários isolados.
async function videoBufferToMp3(buffer) { // v7.52: async (o Sync parava todos os chats)
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const execFileAsync = require('util').promisify(require('child_process').execFile);
  let ffmpeg = 'ffmpeg';
  try { ffmpeg = require('ffmpeg-static') || 'ffmpeg'; } catch {}
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'darkbot-tomp3-'));
  const input = path.join(dir, 'input.bin');
  const output = path.join(dir, 'output.mp3');
  try {
    fs.writeFileSync(input, buffer);
    await execFileAsync(ffmpeg, ['-y', '-i', input, '-vn', '-ar', '44100', '-ac', '2', '-b:a', '192k', output],
      { stdio: 'ignore', timeout: 120000 });
    const out = fs.readFileSync(output);
    if (!out || out.length < 1024) throw new Error('ffmpeg não gerou MP3 válido');
    return out;
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
}

// Helper: resposta de erro com tema
async function errReply(sock, msg, ctx, text) {
  const RE = require('../renderEngine');
  const t = await RE.getTheme(ctx.remoteJid);
  return sock.sendMessage(ctx.remoteJid, { text: RE.renderBlock(t, 'ERRO', ['❌ ' + text], { botName: config.bot.name }) }, { quoted: msg });
}

// v7.64: o resultado é VÍDEO? Antes só via .mp4 no url — os buffers do
// yt-dlp têm url:'' e iam parar ao ramo de FOTO com url vazia → ❌.
function isVideoResult(item = {}) {
  if (item.buffer?.length > 1024 || item.video) return true;
  if (/video/i.test(item.mimetype || '') || /video/i.test(item.type || '')) return true;
  return !!String(item.url || item.download || '').match(/\.mp4/i);
}

// v7.64: pega "Título — Artista" do /suggest da lyrics.ovh (Deezer). Pura p/ testes.
function shazamPickLyric(json) {
  const d = json?.data || json?.result || [];
  const first = Array.isArray(d) ? d[0] : null;
  const title = first?.title_short || first?.title;
  const artist = first?.artist?.name;
  if (!title || !artist) return null;
  return `${title} — ${artist}`;
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
  registerCase(['instagram', 'ig', 'instamp3', 'instamp4', 'igstory'], async ({ sock, msg, ctx, args, prefix, reply, isOwner }) => {
    const url = args.join(' ').trim();
    if (!url) return reply(`📸 Uso: \`${prefix}instagram <url>\``);
    sock.sendMessage(ctx.remoteJid, { react: { text: '⏳', key: msg.key } });
    try {
      const dl = require('../dl/others');
      const r = await dl.instagram(url);
      const items = Array.isArray(r) ? r : [r];
      for (const item of items.slice(0, 10)) {
        if (isVideoResult(item)) await sendVideo(sock, ctx.remoteJid, msg, item);
        else await sock.sendMessage(ctx.remoteJid, { image: { url: item.image || item.url || item.thumbnail } }, { quoted: msg });
      }
      sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } });
    } catch (e) { sock.sendMessage(ctx.remoteJid, { react: { text: '❌', key: msg.key } }); return errReply(sock, msg, ctx, 'Instagram: ' + e.message + (isOwner ? '\n\n🍪 Dono: o IG exige login — define YTDLP_COOKIES_BASE64 (cookies Netscape em base64) na Northflank.' : '')); }
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
  registerCase(['twitter', 'tw', 'x', 'twitterdl'], async ({ sock, msg, ctx, args, prefix, reply }) => {
    const url = args.join(' ').trim();
    if (!url) return reply(`🐦 Uso: \`${prefix}twitter <url>\``);
    sock.sendMessage(ctx.remoteJid, { react: { text: '⏳', key: msg.key } });
    try {
      const dl = require('../dl/others');
      const r = await dl.twitter(url);
      const items = Array.isArray(r) ? r : [r];
      for (const item of items.slice(0, 5)) {
        if (isVideoResult(item)) await sendVideo(sock, ctx.remoteJid, msg, item);
        else await sock.sendMessage(ctx.remoteJid, { image: { url: item.image || item.url } }, { quoted: msg });
      }
      sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } });
    } catch (e) { sock.sendMessage(ctx.remoteJid, { react: { text: '❌', key: msg.key } }); return errReply(sock, msg, ctx, 'Twitter: ' + e.message); }
  });

  // ═══ SPOTIFY OFICIAL — links/player, sem áudio de outra origem ═══
  // A API pública do Spotify não disponibiliza os ficheiros de áudio: a
  // reprodução licenciada é feita pelo player/app Spotify. Este fluxo nunca
  // troca uma faixa Spotify por YouTube nem finge entregar um MP3 oficial.
  function linkOficialSpotify(tipo, id, original) {
    return tipo && id ? `https://open.spotify.com/${tipo}/${id}` : String(original || '');
  }

  async function enviarSpotifyOficial(sock, msg, ctx, { url, tipo = '', nome = '', faixas = [] }) {
    const tipoNome = ({ track: 'Faixa', album: 'Álbum / EP / CD', playlist: 'Playlist', episode: 'Episódio', show: 'Podcast', artist: 'Artista' })[tipo] || 'Conteúdo';
    const linhas = [
      '💚 *SPOTIFY OFICIAL*',
      `${tipoNome}: *${nome || 'Abrir no Spotify'}*`,
      faixas.length ? `🎶 ${faixas.length} faixas identificadas no catálogo Spotify.` : '',
      '',
      '▶️ A reprodução abre no player/app oficial do Spotify.',
      '🔒 Não envio MP3 de YouTube ou de outra fonte como se fosse Spotify.',
      '',
      `🔗 ${url}`,
    ];
    if (faixas.length) {
      linhas.splice(3, 0, ...faixas.slice(0, 10).map((f, i) => `${i + 1}. ${f.nome}${f.artista ? ' — ' + f.artista : ''}`));
      if (faixas.length > 10) linhas.splice(13, 0, `… e mais ${faixas.length - 10} faixas no Spotify.`);
    }
    await sock.sendMessage(ctx.remoteJid, { text: linhas.filter(Boolean).join('\n') }, { quoted: msg });
  }

  async function runSpotify({ sock, msg, ctx, args, prefix, reply, command }) {
    const tiers = require('../spotifyTiers');
    const query = args.join(' ').trim();
    if (!query) return reply(
      '💚 *SPOTIFY OFICIAL*\n\n' +
      `Uso: \`${prefix}${command} <link Spotify ou nome>\`\n\n` +
      'Aceita faixa, playlist, álbum, EP, CD, podcast e artista.\n' +
      'Um link abre sempre a mídia no player oficial; não substituímos por YouTube.'
    );
    await sock.sendMessage(ctx.remoteJid, { react: { text: '⏳', key: msg.key } }).catch(() => {});

    const isUrl = /^https?:\/\//i.test(query);
    if (!isUrl) {
      // Busca oficial abre directamente no catálogo Spotify, sem resultados
      // de vídeos de outras plataformas misturados na lista.
      const searchUrl = `https://open.spotify.com/search/${encodeURIComponent(query)}`;
      await enviarSpotifyOficial(sock, msg, ctx, { url: searchUrl, nome: query });
      return sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } }).catch(() => {});
    }

    if (!tiers.isOfficialSpotifyUrl(query)) {
      throw new Error('Envia um link oficial spotify.com ou spotify.link. Para YouTube usa !play.');
    }
    const { tipo, id } = tiers.parseSpotifyLink(query);
    const officialUrl = linkOficialSpotify(tipo, id, query);

    // spotify.link é um redireccionamento oficial. Sem resolver a URL, ainda
    // preservamos o link original em vez de inventar uma faixa parecida.
    if (!tipo || !id) {
      await enviarSpotifyOficial(sock, msg, ctx, { url: officialUrl, nome: 'Link Spotify' });
      return sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } }).catch(() => {});
    }

    if (tiers.TIPOS_COLECAO.has(tipo)) {
      // O link oficial continua útil mesmo que o catálogo público não exponha
      // metadados (por exemplo, uma playlist privada ou variação regional).
      let col = { nome: tipo === 'album' ? 'Álbum / EP / CD Spotify' : 'Playlist Spotify', faixas: [] };
      try { col = await tiers.colecaoSpotify(officialUrl, { tipo, id }); }
      catch (e) { console.warn('[SPOTIFY OFICIAL] metadados indisponíveis:', e.message); }
      await enviarSpotifyOficial(sock, msg, ctx, { url: officialUrl, tipo, nome: col.nome, faixas: col.faixas });
    } else {
      await enviarSpotifyOficial(sock, msg, ctx, { url: officialUrl, tipo, nome: tipo === 'track' ? 'Faixa Spotify' : 'Conteúdo Spotify' });
    }
    return sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } }).catch(() => {});
  }

  const _wrapSpotify = () => async (cc) => {
    try { await runSpotify(cc); }
    catch (e) {
      cc.sock.sendMessage(cc.ctx.remoteJid, { react: { text: '❌', key: cc.msg.key } }).catch(() => {});
      return errReply(cc.sock, cc.msg, cc.ctx, 'Spotify: ' + e.message);
    }
  };
  registerCase(['spotify', 'spotify1', 'sp', 'spotify2', 'spotify3'], _wrapSpotify());

  // ═══ SOUNDCLOUD ═══
  registerCase(['soundcloud', 'sc', 'scdl'], async ({ sock, msg, ctx, args, prefix, reply }) => {
    const query = args.join(' ').trim();
    if (!query) return reply(`☁️ Uso: \`${prefix}soundcloud <nome ou url>\``);
    sock.sendMessage(ctx.remoteJid, { react: { text: '⏳', key: msg.key } });
    try {
      const dl = require('../dl/others');
      // v7.77: nome → LISTA de resultados; URL → direto como antes
      if (!/^https?:\/\//i.test(query)) {
        const { systemZoneSoundCloudSearch } = require('../dl/helpers');
        const achados = await systemZoneSoundCloudSearch(query);
        const itens = (achados || []).filter(a => a?.sc_url || a?.url).slice(0, 8);
        if (!itens.length) throw new Error('Sem resultados para: ' + query);
        const lista = require('../listaEscolha');
        await lista.mostrar(sock, msg, ctx, {
          titulo: `☁️ *${itens.length} resultados* — ${query.slice(0, 40)}`,
          linhas: itens.map((a) => `*${String(a.title || a.name || '?').slice(0, 50)}*\n   👤 ${String(a.author || a.username || '?').slice(0, 30)}`),
          itens, tipo: 'soundcloud',
          aoEscolher: async ({ item }) => {
            const r = await dl.soundcloud(item.sc_url || item.url);
            await sendAudio(sock, ctx.remoteJid, msg, r);
            sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } }).catch(() => {});
          },
        });
        sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } });
        return;
      }
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

  // ═══ YOUTUBE AUDIO (aliases de ytd) + TOMP3 local (incoming-cases) ═══
  // v7.47: com vídeo/áudio citado → converte para MP3 local (ffmpeg, sem shell);
  // com URL/texto → comportamento original (áudio do YouTube).
  registerCase(['baixaraudio', 'dlmp3', 'ytaudio', 'tomp3', 'ytmp3s', 'dlmp3s', 'tomp3video', 'videoaomp3'], async ({ sock, msg, m, quoted, ctx, args, prefix, reply }) => {
    const qm = quoted?.message || {};
    const quotedMedia = quoted && (qm.videoMessage || qm.audioMessage);
    const ownMedia = !quoted && (msg.message?.videoMessage || msg.message?.audioMessage);
    if (quotedMedia || ownMedia) {
      sock.sendMessage(ctx.remoteJid, { react: { text: '⏳', key: msg.key } });
      try {
        const srcMsg = quotedMedia ? quoted.msg : msg;
        const buf = await mediaHandler.downloadFromMessage(srcMsg);
        if (!buf?.length) throw new Error('mídia vazia');
        if (buf.length > 100 * 1024 * 1024) throw new Error('mídia maior que 100 MB');
        const mp3 = await videoBufferToMp3(buf);
        await sock.sendMessage(ctx.remoteJid, {
          audio: mp3, mimetype: 'audio/mpeg', ptt: false,
          fileName: `tomp3_${Date.now()}.mp3`,
        }, { quoted: msg });
        sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } });
      } catch (e) { sock.sendMessage(ctx.remoteJid, { react: { text: '❌', key: msg.key } }); return errReply(sock, msg, ctx, 'TOMP3: ' + e.message); }
      return;
    }
    const url = args.join(' ').trim();
    if (!url) return reply(`🎵 Uso: \`${prefix}ytd <url YouTube>\`\nou responde a um vídeo/áudio com \`${prefix}tomp3\``);
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

    // v7.64: letra via IA, com fallback grátis (lyrics.ovh/Deezer) se a IA falhar
    async function identifyByLyrics(trecho) {
      try {
        const ai = require('../ai');
        const r = await ai.chat(
          `Identifica a música a partir deste trecho de letra: "${trecho}". Responde SÓ com: Título — Artista (ano). Se não souberes, responde "não identifiquei".`,
          'És um especialista em música com conhecimento enciclopédico.',
          {}, false
        );
        const s = String(r || '').trim();
        if (s && !s.startsWith('❌') && !/não identifiquei/i.test(s)) {
          return { texto: s.replace(/^[✗Xx-]+/, '').trim(), fonte: '🤖 IA' };
        }
      } catch {}
      const mh = require('../mediaHandler');
      const j = await mh.fetchJson(`https://api.lyrics.ovh/suggest/${encodeURIComponent(trecho.slice(0, 100))}`, 15000);
      const pick = shazamPickLyric(j);
      if (!pick) throw new Error('não identifiquei');
      return { texto: pick, fonte: '🔍 busca' };
    }

    // áudio citado → transcreve (Whisper) e identifica pela letra ouvida
    if (quoted && (quoted.audioMessage || quoted.pttMessage)) {
      try { react('🎧'); } catch {}
      try {
        const mh = require('../mediaHandler');
        const buf = await mh.downloadFromMessage({ message: quoted });
        if (!buf || buf.length < 1000) throw new Error('áudio vazio');
        if (buf.length > 20 * 1024 * 1024) throw new Error('áudio grande demais');
        const ai = require('../ai');
        const ouvido = String(await ai.transcribeAudio(buf) || '').trim();
        if (ouvido.length < 4) throw new Error('nada audível');
        const found = await identifyByLyrics(ouvido.slice(0, 200));
        try { react('✅'); } catch {}
        return reply(RE.renderBlock(t, 'SHAZAM', [
          `🎶 *${found.texto.slice(0, 120)}*`,
          `Ouvi: "${ouvido.slice(0, 80)}"`,
          `> Queres o áudio? ${prefix}play ${found.texto.split('—')[0].trim().slice(0, 40)}`,
        ].filter(Boolean), { botName: config.bot.name }));
      } catch (e) {
        try { react('❌'); } catch {}
        return reply(RE.renderBlock(t, 'SHAZAM', [
          '🎧 Não consegui ouvir esse áudio.',
          '',
          '👉 Mas identifico pela LETRA:',
          `\`${prefix}shazam <trecho da música>\``,
        ], { botName: config.bot.name }));
      }
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
      const found = await identifyByLyrics(trecho);
      const texto = found.texto;
      try { react('✅'); } catch {}
      return reply(RE.renderBlock(t, 'SHAZAM', [
        `🎶 *${texto.slice(0, 120)}* ${found.fonte}`,
        trecho ? `Trecho: "${trecho.slice(0, 80)}"` : '',
        `> Queres o áudio? ${prefix}play ${texto.split('—')[0].trim().slice(0, 40)}`,
      ].filter(Boolean), { botName: config.bot.name }));
    } catch (e) {
      try { react('❌'); } catch {}
      return reply(RE.renderBlock(t, 'ERRO', ['❌ Não identifiquei. Tenta outro trecho ou ' + prefix + 'play <título>'], { botName: config.bot.name }));
    }
  });

  // ═══ MYINSTANTS ═══
  registerCase(['myinstants'], async ({ sock, msg, ctx, args, prefix, reply }) => {
    const query = args.join(' ').trim();
    if (!query) return reply(`🔊 Uso: \`${prefix}myinstants <nome do som>\``);
    sock.sendMessage(ctx.remoteJid, { react: { text: '⏳', key: msg.key } });
    const tocar = async (item) => {
      const mp3Url = `https://www.myinstants.com${item.mp3}`;
      const buf = await mediaHandler.fetchBuffer(mp3Url);
      await sock.sendMessage(ctx.remoteJid, { audio: buf, mimetype: 'audio/mpeg', fileName: item.name + '.mp3', ptt: true }, { quoted: msg });
    };
    try {
      const axios = require('axios');
      const r = await axios.get(`https://www.myinstants.com/api/search/?term=${encodeURIComponent(query)}`, { timeout: 10000 });
      const results = (r.data?.results || []).filter(x => x?.mp3);
      if (!results?.length) throw new Error('Sem resultados');
      // v7.78: vários → LISTA; 1 → direto
      if (results.length > 1) {
        const lista = require('../listaEscolha');
        const itens = results.slice(0, 8);
        await lista.mostrar(sock, msg, ctx, {
          titulo: `🔊 *${results.length} sons* — ${query.slice(0, 40)}`,
          linhas: itens.map((x) => `*${String(x.name || '?').slice(0, 55)}*`),
          itens, tipo: 'myinstants',
          aoEscolher: async ({ item }) => {
            await tocar(item);
            sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } }).catch(() => {});
          },
        });
        sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } });
        return;
      }
      await tocar(results[0]);
      sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } });
    } catch (e) { sock.sendMessage(ctx.remoteJid, { react: { text: '❌', key: msg.key } }); return errReply(sock, msg, ctx, 'MyInstants: ' + e.message); }
  });

  // ═══ KWAI ═══
  registerCase(['kwai'], async ({ sock, msg, ctx, args, prefix, reply }) => {
    const url = args.join(' ').trim();
    if (!url) return reply(`📱 Uso: \`${prefix}kwai <url>\`\nEx: \`${prefix}kwai https://www.kwai.com/...\``);
    sock.sendMessage(ctx.remoteJid, { react: { text: '⏳', key: msg.key } });
    try {
      // v7.64: 1º scrape da página (mp4 direto no HTML) — o yt-dlp NÃO
      // tem extractor Kwai e a API zahwazein morreu.
      try {
        const dl = require('../downloader');
        const r = await dl.kwai(url);
        await sendVideo(sock, ctx.remoteJid, msg, r);
        sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } });
        return;
      } catch (e) { console.log('[KWAI] scrape falhou:', e.message?.slice(0, 80)); }
      // 2º — yt-dlp (tenta na mesma; cobre kuaishou.com se suportado)
      try {
        const dl = require('../downloader');
        const r = await dl.ytdlpSocialVideo(url, 'Kwai HD');
        await sendVideo(sock, ctx.remoteJid, msg, r);
        sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } });
        return;
      } catch (e) { console.log('[KWAI] yt-dlp falhou:', e.message?.slice(0, 80)); }
      throw new Error('Sem resultado (link inválido ou privado)');
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
      const results = await dl.tiktokSearch(query, 6);
      if (!results.length) throw new Error('Nenhum vídeo encontrado para: ' + query);

      sock.sendMessage(ctx.remoteJid, { react: { text: '⏳', key: msg.key } });

      // Só 1 → baixa direto; vários → LISTA (v7.77)
      if (results.length === 1) {
        if (!results[0].url) throw new Error('Sem URL de download');
        await sendVideo(sock, ctx.remoteJid, msg, results[0]);
        sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } });
        return;
      }
      const lista = require('../listaEscolha');
      const itens = results.filter(v => v.url).slice(0, 8);
      if (!itens.length) throw new Error('Sem URL de download');
      await lista.mostrar(sock, msg, ctx, {
        titulo: `🎬 *${itens.length} resultados* — ${query.slice(0, 40)}`,
        linhas: itens.map((v) => `*${String(v.title || 'TikTok').slice(0, 50)}*\n   👤 @${v.author || '?'}${v.duration ? ` • ⏱️ ${v.duration}` : ''}`),
        itens, tipo: 'ttks',
        aoEscolher: async ({ item }) => {
          await sendVideo(sock, ctx.remoteJid, msg, item);
          sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } }).catch(() => {});
        },
      });
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
      const results = await dl.tiktokSearch(user, 6);
      if (!results.length) throw new Error('Perfil não encontrado ou sem vídeos públicos');
      // v7.78: 1 → direto; vários → LISTA (a dica antiga "usa ttks" nunca funcionou)
      if (results.length === 1) {
        if (!results[0].url) throw new Error('Sem URL de download');
        await sendVideo(sock, ctx.remoteJid, msg, results[0]);
        sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } });
        return;
      }
      const lista = require('../listaEscolha');
      const itens = results.filter(v => v.url).slice(0, 8);
      if (!itens.length) throw new Error('Sem URL de download');
      await lista.mostrar(sock, msg, ctx, {
        titulo: `🎬 *Vídeos de @${user}* (${itens.length})`,
        linhas: itens.map((v) => `*${String(v.title || 'TikTok').slice(0, 50)}*\n   👤 @${v.author || user}${v.duration ? ` • ⏱️ ${v.duration}` : ''}`),
        itens, tipo: 'ttstalk',
        aoEscolher: async ({ item }) => {
          await sendVideo(sock, ctx.remoteJid, msg, item);
          sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } }).catch(() => {});
        },
      });
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

  // ── statusvideo (v7.55: vídeo pronto pro status, ≤30s; VIP por defeito) ──
  registerCase(['statusvideo', 'statusvid', 'stv'], async ({ sock, msg, quoted, ctx, args, prefix, reply }) => {
    const url = args.join(' ').trim();
    const qm = quoted?.message || {};
    const quotedMedia = quoted && qm.videoMessage;
    const ownMedia = !quoted && msg.message?.videoMessage;
    try {
      let buf = null;
      if (quotedMedia || ownMedia) {
        const mediaHandler = require('../mediaHandler');
        buf = await mediaHandler.downloadFromMessage(quotedMedia ? quoted.msg : msg);
      } else if (url) {
        const r = await require('../ytdl').getVideo(url, '480');
        buf = r.buffer;
      } else {
        return reply(`📱 Uso: responde a um vídeo com \`${prefix}statusvideo\` ou envia \`${prefix}statusvideo <url>\``);
      }
      if (!buf?.length) throw new Error('vídeo vazio');
      const fs = require('fs');
      const os = require('os');
      const path = require('path');
      const execFileAsync = require('util').promisify(require('child_process').execFile);
      let ff = 'ffmpeg';
      try { ff = require('ffmpeg-static') || 'ffmpeg'; } catch {}
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'darkbot-stv-'));
      try {
        const inp = path.join(dir, 'in.mp4');
        const out = path.join(dir, 'status.mp4');
        fs.writeFileSync(inp, buf);
        await execFileAsync(ff, ['-y', '-i', inp, '-t', '30', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', out], { timeout: 180000 });
        const outBuf = fs.readFileSync(out);
        if (!outBuf?.length) throw new Error('corte vazio');
        await sock.sendMessage(ctx.remoteJid, { video: outBuf, caption: '📱 Pronto pro status (≤30s)' }, { quoted: msg });
      } finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }
    } catch (e) { return reply('❌ StatusVideo: ' + (e.message || e)); }
  });

  // ── musictest (v7.56: diagnóstico de entrega de áudio; só dono) ──
  registerCase(['musictest', 'testaudio'], async ({ sock, msg, ctx, args, isOwner, reply }) => {
    if (!isOwner) return reply('🚫 Só o *dono*.');
    const withCard = String(args[0] || '').toLowerCase() === 'card';
    try {
      const fs = require('fs');
      const os = require('os');
      const path = require('path');
      const execFileAsync = require('util').promisify(require('child_process').execFile);
      let ff = 'ffmpeg';
      try { ff = require('ffmpeg-static') || 'ffmpeg'; } catch {}
      const out = path.join(os.tmpdir(), `darkbot-musictest-${Date.now()}.mp3`);
      await execFileAsync(ff, ['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-b:a', '128k', out], { timeout: 60000 });
      const buf = fs.readFileSync(out);
      try { fs.unlinkSync(out); } catch {}
      const mh = require('../mediaHandler');
      if (!mh.isAudioBytes(buf)) throw new Error('ffmpeg gerou bytes inválidos?!');
      const contextInfo = withCard
        ? { externalAdReply: { title: 'MUSICTEST', body: 'cartão de teste', mediaType: 2, mediaUrl: '', sourceUrl: '' } }
        : undefined;
      await sock.sendMessage(ctx.remoteJid, {
        audio: buf, mimetype: 'audio/mpeg', fileName: 'musictest.mp3', ptt: false,
        ...(contextInfo ? { contextInfo } : {}),
      }, { quoted: msg });
      return reply(`🔊 Teste enviado (${(buf.length / 1024).toFixed(0)}KB, ${withCard ? 'COM cartão' : 'SEM cartão'}).\nConsegues ouvir? Diz o que aconteceu.`);
    } catch (e) { return reply('❌ musictest: ' + (e.message || e)); }
  });
};

module.exports.isVideoResult = isVideoResult; // v7.64 (testes)
module.exports.shazamPickLyric = shazamPickLyric; // v7.64 (testes)
