/**
 * DARK BOT v5.1 — Cases de Downloads 🎵
 * Estilo switch/case com ButtonV2 real do @systemzero/baileys
 *
 * play   → busca + card ButtonV2 (Áudio / Vídeo) — resultado #1
 * play2  → mesmo fluxo — resultado #2 (alternativo)
 * play3  → mesmo fluxo — resultado #3
 * ytd    → download áudio por URL (disparado pelo botão)
 * gyt    → download vídeo por URL (disparado pelo botão)
 * playhq → áudio alta qualidade directa (320kbps)
 * video  → vídeo HD 720p directo
 * video2 → vídeo FHD 1080p directo
 *
 * v5.1: código play baseado no formato de referência exacto
 * (`systemZone.ytsearch` → `resultados`), com fallback automático:
 * ButtonV2 → interactive viewOnce → texto. A busca também tem
 * fallback: API systemzone → pacote yt-search local.
 */

'use strict';

// v6.46: lazy-load. Estes módulos puxam ytdl-core/ffmpeg e custavam
// ~370ms no arranque — só neste ficheiro. No Render free (que dorme
// por inactividade) isso é tempo somado a CADA cold start, mesmo que
// ninguém use um download. Agora só carregam quando são precisos.
let _szp, _ytdl, _mh;
const systemZeroPlay = new Proxy({}, { get: (_, k) => (_szp ||= require('../systemZeroPlay'))[k] });
const ytdl           = new Proxy({}, { get: (_, k) => (_ytdl ||= require('../ytdl'))[k] });
const mediaHandler   = new Proxy({}, { get: (_, k) => (_mh   ||= require('../mediaHandler'))[k] });
const config         = require('../../config');

// ── Helper: envia áudio com card de metadados ─────────────────
async function sendAudioCard(sock, jid, quoted, r) {
  const title    = r.title    || 'Áudio';
  const author   = r.author   || '';
  const duration = r.duration || '';
  const mime     = r.mimetype || 'audio/mpeg';
  const ext      = mime.includes('mp4') ? 'm4a' : 'mp3';
  const fileName = `${title.replace(/[/\\?%*:|"<>]/g, '-').slice(0, 60)}.${ext}`;

  let thumbBuf = null;
  if (r.thumb || r.thumbnail) {
    try {
      thumbBuf = await mediaHandler.fetchBuffer(r.thumb || r.thumbnail);
      if (!thumbBuf || thumbBuf.length < 100) thumbBuf = null;
    } catch {}
  }

  const contextInfo = thumbBuf ? {
    externalAdReply: {
      title,
      body: [author && `👤 ${author}`, duration && `⏱️ ${duration}`].filter(Boolean).join('  •  ') || '🎵 DARK BOT',
      mediaType: 2,
      thumbnail: thumbBuf,
      mediaUrl: '',
      sourceUrl: '',
      renderLargerThumbnail: false,
    },
  } : undefined;

  const audioBuffer = r.buffer && Buffer.isBuffer(r.buffer)
    ? r.buffer
    : await mediaHandler.fetchBuffer(r.url);

  if (!audioBuffer || audioBuffer.length < 1024) throw new Error('áudio vazio');

  return sock.sendMessage(jid, { audio: audioBuffer, mimetype: mime, fileName, ptt: false, contextInfo }, { quoted });
}

// ── Helper: envia vídeo MP4 ──────────────────────────────────
async function sendVideoFile(sock, jid, quoted, buf, caption, title) {
  if (!buf || buf.length < 4096) throw new Error('vídeo vazio');
  const isMP4 = buf.slice(4, 8).toString() === 'ftyp';
  if (isMP4) {
    return sock.sendMessage(jid, { video: buf, caption, mimetype: 'video/mp4' }, { quoted });
  }
  return sock.sendMessage(jid, {
    document: buf, fileName: `${(title || 'video').slice(0, 50)}.mp4`,
    mimetype: 'video/mp4', caption,
  }, { quoted });
}

// ─────────────────────────────────────────────
// runPlaySearch — fluxo play/play2/play3
// Estrutura EXACTA do código de referência (case 'play'),
// adaptada ao contexto do caseHandler + fallbacks robustos.
// ─────────────────────────────────────────────
async function runPlaySearch({ sock, m, msg, ctx, text, prefix, command }, resultIndex = 0, quality = {}) {
  if (!text) return m.reply(`Exemplo: ${prefix + command} Slash Inferno`);

  // Qualidade por comando
  const Q = {
    audio: quality.audio || '128k',
    video: quality.video || '720',
    label: quality.label || 'Standard',
  };

  sock.sendMessage(m.chat, { react: { text: '🫡', key: m.key } });

  try {
    const { ButtonV2 } = require('@systemzero/baileys/lib/MB.cjs');

    const searchData = await systemZeroPlay.ytsearch(text);
    if (!searchData?.resultados?.length) {
      sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
      return m.reply('Nenhum resultado encontrado.');
    }

    const video = searchData.resultados[Math.min(resultIndex, searchData.resultados.length - 1)];
    const footer = config.footer || (config.bot?.name ? `${config.bot.name} 🕸️ DARK BOT` : '© DARK BOT v6');
    const bodyExtra =
      resultIndex === 0 ? '✦ ݁˖ Selecione o formato desejado. .✦ ݁˖\n\n'
      : resultIndex === 1 ? '✦ ݁˖ Resultado alternativo (#2) ✦ ݁˖\n\n'
      : `✦ ݁˖ Resultado #${resultIndex + 1} ✦ ݁˖\n\n`;

    // ── PLAY: novo card Dark Tóxico (play3 permanece intacto) ──
    if (quality.toxic) {
      await systemZeroPlay.sendToxicPlayCard(sock, m.chat, video, prefix, msg);
      sock.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
      return true;
    }

    // ── ButtonV2 (código de referência) ──
    let sent = false;
    try {
      const msgBtn = new ButtonV2(sock);

      msgBtn.setTitle(`${video.title}`.slice(0, 60));
      msgBtn.setBody(
        `👤 ${video.author || 'Desconhecido'}\n` +
        `⏱️ ${video.duration || '?'} • 👁️ ${Number(video.views || 0).toLocaleString('pt-BR')}\n\n` +
        bodyExtra
      );
      msgBtn.setFooter(footer);

      if (video.thumbnail) {
        try { msgBtn.setThumbnail(video.thumbnail); } catch {}
      }

      msgBtn.addButton(`🎵 Baixar Áudio (${Q.audio})`, `${prefix}ytd ${video.youtube_url} | ${Q.audio}`);
      msgBtn.addButton(`🎬 Baixar Vídeo (${Q.video}p)`, `${prefix}gyt ${video.youtube_url} | mp4 | ${Q.video}`);

      await msgBtn.send(m.chat, { quoted: msg });
      sent = true;
    } catch (e) {
      console.warn('[PLAY] ButtonV2 falhou, a usar cascata:', e.message?.slice(0, 80));
    }

    // ── Fallback: interactive viewOnce → texto ──
    if (!sent) {
      await systemZeroPlay.sendPlayCard(sock, m.chat, video, prefix, msg, bodyExtra.trim());
    }

    sock.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
  } catch (e) {
    if (!e.message?.includes('rate-overlimit')) {
      console.error('[PLAY ERROR]', e.message);
      sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
      m.reply('Erro ao buscar: ' + e.message);
    }
  }
}

// ─────────────────────────────────────────────────────────────
// CASES DE DOWNLOADS
// ─────────────────────────────────────────────────────────────
module.exports = function registerDownloadCases(registerCase) {

  // ════════════════════════════════════════════════
  // case 'play' — busca + ButtonV2 (resultado #1)
  // ════════════════════════════════════════════════
  registerCase(['play', 'music', 'musica', 'yt', 'ytmp3'], (caseCtx) =>
    runPlaySearch(caseCtx, 0, { audio: '128k', video: '480', label: 'Standard', toxic: true }));

  // ════════════════════════════════════════════════
  // case 'play2' — resultado alternativo (#2)
  // ════════════════════════════════════════════════
  registerCase(['play2', 'music2'], (caseCtx) =>
    runPlaySearch(caseCtx, 1, { audio: '192k', video: '720', label: 'Medium' }));

  // ════════════════════════════════════════════════
  // case 'play3' — resultado #3
  // ════════════════════════════════════════════════
  registerCase(['play3', 'music3'], (caseCtx) =>
    runPlaySearch(caseCtx, 2, { audio: '320k', video: '1080', label: 'High Quality' }));

  // ════════════════════════════════════════════════
  // case 'playhq' — alta qualidade directa (320kbps)
  // ════════════════════════════════════════════════
  registerCase(['playhq', 'hq', 'playmax'], async ({
    sock, msg, ctx, text, prefix, reply, react,
  }) => {
    if (!text) return reply(`🎵 *Alta qualidade (320kbps)*\n\nExemplo: \`${prefix}playhq nome da música\``);

    react('⏳');
    try {
      const r = await ytdl.getAudio(text, '320k');
      await sendAudioCard(sock, ctx.remoteJid, msg, r);
      react('✅');
    } catch (e) {
      react('❌');
      return reply('❌ Falha no download.');
    }
  });

  // ════════════════════════════════════════════════
  // case 'ytd' — download áudio por URL (do botão)
  // ════════════════════════════════════════════════
  registerCase(['ytd', 'baixaraudio', 'dlmp3'], async ({
    sock, msg, ctx, text, args, prefix, reply, react,
  }) => {
    // Parse: "!ytd url" ou "!ytd url | 320k"
    const parts = (text || args.join(' ')).split('|').map(s => s.trim());
    const url = parts[0];
    const quality = parts[1] || '128k';
    if (!url) return reply('🎵 Uso: ' + prefix + 'ytd <url>');

    react('⏳');
    try {
      let r;
      try {
        r = await systemZeroPlay.ytAudio(url, quality);
      } catch {
        r = await ytdl.getAudio(url, quality);
      }
      if (!r || !r.buffer || r.buffer.length < 1024) throw new Error('audio vazio');
      await sendAudioCard(sock, ctx.remoteJid, msg, r);
      react('✅');
    } catch (e) {
      react('❌');
      return reply('❌ Falha no download de audio: ' + (e.message || '').slice(0, 100));
    }
  });

  // ════════════════════════════════════════════════
  // case 'gyt' — download vídeo por URL (do botão)
  // ════════════════════════════════════════════════
  registerCase(['gyt', 'baixarvideo', 'dlmp4'], async ({
    sock, msg, ctx, text, args, prefix, reply, react,
  }) => {
    // Parse: "!gyt url | mp4 | 720" ou "!gyt url"
    const parts = (text || args.join(' ')).split('|').map(s => s.trim());
    const url = parts[0];
    const resolution = parts[2] || parts[1] || '720';
    if (!url) return reply('🎬 Uso: ' + prefix + 'gyt <url>');

    react('⏳');
    try {
      let r;
      try {
        r = await systemZeroPlay.ytVideo(url, resolution);
        const buf = await mediaHandler.fetchBuffer(r.url);
        r.buffer = buf;
      } catch {
        r = await ytdl.getVideo(url, resolution);
      }
      if (!r || !r.buffer || r.buffer.length < 4096) throw new Error('video vazio');
      const cap = '🎬 *' + (r.title || 'Video') + '*\n👤 ' + (r.author || '') + '\n⏱️ ' + (r.duration || '?') + ' | 📺 ' + (r.quality || resolution + 'p');
      await sendVideoFile(sock, ctx.remoteJid, msg, r.buffer, cap, r.title);
      react('✅');
    } catch (e) {
      react('❌');
      return reply('❌ Falha no download de video: ' + (e.message || '').slice(0, 100));
    }
  });

  // ════════════════════════════════════════════════
  // case 'video' — vídeo HD 720p directo
  // ════════════════════════════════════════════════
  registerCase(['video', 'vid', 'ytmp4', 'yt4'], async ({
    sock, msg, ctx, text, prefix, reply, react,
  }) => {
    if (!text) return reply(
      `🎬 *Exemplo:* \`${prefix}video Naruto AMV\`\n\n` +
      `• \`${prefix}video\`  — 720p HD\n` +
      `• \`${prefix}video2\` — 1080p FHD`
    );
    react('⏳');
    try {
      const r   = await ytdl.getVideo(text, '720');
      const cap = `🎬 *${r.title}*\n👤 ${r.author || ''} | ⏱️ ${r.duration || '?'} | 📺 720p HD`;
      await sendVideoFile(sock, ctx.remoteJid, msg, r.buffer, cap, r.title);
      react('✅');
    } catch (e) {
      react('❌');
      return reply('❌ Falha no download de vídeo.');
    }
  });

  // ════════════════════════════════════════════════
  // case 'video2' — vídeo FHD 1080p
  // ════════════════════════════════════════════════
  registerCase(['video2', 'vid2', 'fhd', 'fullhd'], async ({
    sock, msg, ctx, text, prefix, reply, react,
  }) => {
    if (!text) return reply(`🎬 *Full HD (1080p)*\n\nExemplo: \`${prefix}video2 nome do vídeo\``);
    react('⏳');
    try {
      const r   = await ytdl.getVideo(text, '1080');
      const cap = `🎬 *${r.title}*\n👤 ${r.author || ''} | ⏱️ ${r.duration || '?'} | 📺 1080p FHD`;
      await sendVideoFile(sock, ctx.remoteJid, msg, r.buffer, cap, r.title);
      react('✅');
    } catch (e) {
      react('❌');
      return reply('❌ Falha no download FHD.');
    }
  });
};
