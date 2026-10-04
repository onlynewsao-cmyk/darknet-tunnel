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
  // v7.59: SEM capa — o externalAdReply+thumbnail quebrava a entrega/
  // renderização no fluxo do botão (mídia "invisível" p/ membros).
  // Áudio simples (só buffer + nome) entrega sempre.
  const title    = r.title    || 'Áudio';
  const mime     = r.mimetype || 'audio/mpeg';
  const ext      = mime.includes('mp4') ? 'm4a' : 'mp3';
  const fileName = `${title.replace(/[/\\?%*:|"<>]/g, '-').slice(0, 60)}.${ext}`;

  let audioBuffer = r.buffer && Buffer.isBuffer(r.buffer) ? r.buffer : null;
  try {
    if (!audioBuffer) audioBuffer = await mediaHandler.fetchBuffer(r.url);
    if (!mediaHandler.isAudioBytes(audioBuffer)) throw new Error('áudio vazio ou inválido');
    console.log('[MUSIC-SEND]', jid, Math.round(audioBuffer.length / 1024) + 'KB', mime, (r.source || r.quality || '') + ' nocover');
    return await sock.sendMessage(jid, { audio: audioBuffer, mimetype: mime, fileName, ptt: false }, { quoted });
  } catch (bufferError) {
    // Algumas URLs de provider são válidas para o fetch do WhatsApp, mas
    // expiram/bloqueiam o fetch do Node. Tenta a entrega por URL antes de
    // trocar de provider; isso evita perder músicas que já foram geradas.
    if (r.url) {
      console.log('[MUSIC-SEND]', jid, 'URL', mime, (r.source || r.quality || '') + ' nocover');
      return sock.sendMessage(jid, { audio: { url: r.url }, mimetype: mime, fileName, ptt: false }, { quoted });
    }
    throw bufferError;
  }
}

// ── Helper: envia vídeo MP4 reproduzível no WhatsApp ─────────
async function sendVideoFile(sock, jid, quoted, buf, caption, title, opts = {}) {
  if (!buf || buf.length < 4096) throw new Error('vídeo vazio');
  const compatible = await require('../videoCompat').prepareForWhatsApp(buf, {
    maxHeight: opts.maxHeight || 480,
  });
  const duration = compatible.duration || opts.duration || '';
  const finalCaption = duration && !/⏱️\s*(?:\?|—)?\s*(?:\||$)/.test(caption)
    ? caption
    : (duration ? String(caption).replace(/⏱️\s*(?:\?|—)?/, `⏱️ ${duration}`) : caption);
  return sock.sendMessage(jid, {
    video: compatible.buffer,
    caption: finalCaption,
    mimetype: 'video/mp4',
  }, { quoted });
}

// ─────────────────────────────────────────────
// runPlaySearch — fluxo play/play2/play3
// Estrutura EXACTA do código de referência (case 'play'),
// adaptada ao contexto do caseHandler + fallbacks robustos.
// ─────────────────────────────────────────────

// ── v7.77: cartão do play (extraído do runPlaySearch p/ reusar na escolha) ──
async function enviarCardPlay(sock, m, msg, video, prefix, Q, bodyExtra, toxic, footer) {
  const { ButtonV2 } = require('@systemzero/baileys/lib/MB.cjs');
  if (toxic) {
    await systemZeroPlay.sendToxicPlayCard(sock, m.chat, video, prefix, msg);
    return;
  }
  let sent = false;
  try {
    const msgBtn = new ButtonV2(sock);
    msgBtn.setTitle(`${video.title}`.slice(0, 60));
    msgBtn.setBody(
      `\u{1F464} ${video.author || 'Desconhecido'}\n` +
      `\u23F1\uFE0F ${video.duration || '?'} \u2022 \u{1F441}\uFE0F ${Number(video.views || 0).toLocaleString('pt-BR')}\n\n` +
      bodyExtra
    );
    msgBtn.setFooter(footer);
    if (video.thumbnail) {
      try { msgBtn.setThumbnail(video.thumbnail); } catch {}
    }
    msgBtn.addButton(`\uD83C\uDFB5 Baixar \u00C1udio (${Q.audio})`, `${prefix}ytd ${video.youtube_url} | ${Q.audio}`);
    msgBtn.addButton(`\uD83C\uDFAC Baixar V\u00EDdeo (${Q.video}p)`, `${prefix}gyt ${video.youtube_url} | mp4 | ${Q.video} | ${video.duration || ''}`);
    await msgBtn.send(m.chat, { quoted: msg });
    sent = true;
  } catch (e) {
    console.warn('[PLAY] ButtonV2 falhou, a usar cascata:', e.message?.slice(0, 80));
  }
  if (!sent) {
    await systemZeroPlay.sendPlayCard(sock, m.chat, video, prefix, msg, bodyExtra.trim());
  }
}

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

    const resultados = searchData.resultados || [];
    const footer = config.footer || (config.bot?.name ? `${config.bot.name} 🕸️ DARK BOT` : '© DARK BOT v6');
    const video = resultados[Math.min(resultIndex, resultados.length - 1)];
    const bodyExtra =
      resultIndex === 0 ? '✦ ݁˖ Selecione o formato desejado. .✦ ݁˖\n\n'
      : resultIndex === 1 ? '✦ ݁˖ Resultado alternativo (#2) ✦ ݁˖\n\n'
      : `✦ ݁˖ Resultado #${resultIndex + 1} ✦ ݁˖\n\n`;

    await enviarCardPlay(sock, m, msg, video, prefix, Q, bodyExtra, quality.toxic, footer);
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
        // A URL externa pode expirar ou bloquear o servidor no momento do
        // envio. Nesse caso, não basta ter obtido a URL: tenta o fallback
        // local também quando a entrega do buffer falhar.
        await sendAudioCard(sock, ctx.remoteJid, msg, r);
      } catch (firstError) {
        r = await ytdl.getAudio(url, quality);
        if (!r || !r.buffer || r.buffer.length < 1024) throw new Error('audio vazio');
        await sendAudioCard(sock, ctx.remoteJid, msg, r);
      }
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
    // Os botões de !play incluem a duração como quarto campo; URLs manuais
    // continuam compatíveis e simplesmente deixam este valor vazio.
    const selectedDuration = parts[3] || '';
    if (!url) return reply('🎬 Uso: ' + prefix + 'gyt <url>');

    react('⏳');
    try {
      let r;
      // O motor local prioriza MP4 AVC/AAC. A API externa às vezes devolvia
      // um MP4 com codec que o WhatsApp Android recebia, mas não conseguia abrir.
      try {
        r = await ytdl.getVideo(url, resolution);
      } catch (localError) {
        r = await systemZeroPlay.ytVideo(url, resolution);
        if (!r.buffer && r.url) r.buffer = await mediaHandler.fetchBuffer(r.url);
      }
      if (!r || !r.buffer || r.buffer.length < 4096) throw new Error('video vazio');
      const duration = r.duration || selectedDuration || '?';
      const cap = '🎬 *' + (r.title || 'Video') + '*\n👤 ' + (r.author || '') + '\n⏱️ ' + duration + ' | 📺 ' + (r.quality || resolution + 'p');
      await sendVideoFile(sock, ctx.remoteJid, msg, r.buffer, cap, r.title, {
        duration,
        maxHeight: Number(String(resolution).replace(/\D/g, '')) || 480,
      });
      react('✅');
    } catch (e) {
      react('❌');
      return reply('❌ Falha no download de video: ' + (e.message || '').slice(0, 100));
    }
  });

  // ════════════════════════════════════════════════
  // case 'video' — vídeo HD 720p directo
  // ════════════════════════════════════════════════
  // v7.77: !video com LISTA — nome → escolhe o número; URL → direto
  async function runVideoLista({ sock, msg, ctx, text, prefix, reply, react }, maxH, etiqueta) {
    react('⏳');
    try {
      if (!/^https?:\/\//i.test(text || '')) {
        const achados = await ytdl.searchVideoList(text, 8);
        if (!achados?.length) throw new Error('Sem resultados');
        if (achados.length > 1) {
          const lista = require('../listaEscolha');
          await lista.mostrar(sock, msg, ctx, {
            titulo: `🎬 *${achados.length} resultados* — ${String(text).slice(0, 40)}`,
            linhas: achados.map((v) => `*${String(v.title || '?').slice(0, 55)}*\n   ⏱️ ${v.duration || '?'} • 👤 ${String(v.author || '?').slice(0, 30)}`),
            itens: achados, tipo: 'video',
            aoEscolher: async ({ item }) => {
              const r = await ytdl.getVideo(item.url, maxH);
              const cap = `🎬 *${r.title}*\n👤 ${r.author || ''} | ⏱️ ${r.duration || '?'} | 📺 ${etiqueta}`;
              await sendVideoFile(sock, ctx.remoteJid, msg, r.buffer, cap, r.title);
              react('✅');
            },
          });
          react('✅');
          return;
        }
      }
      const r   = await ytdl.getVideo(text, maxH);
      const cap = `🎬 *${r.title}*\n👤 ${r.author || ''} | ⏱️ ${r.duration || '?'} | 📺 ${etiqueta}`;
      await sendVideoFile(sock, ctx.remoteJid, msg, r.buffer, cap, r.title);
      react('✅');
    } catch (e) {
      react('❌');
      return reply('❌ Falha no download de vídeo.');
    }
  }

  registerCase(['video', 'vid', 'ytmp4', 'yt4'], async (a) => {
    if (!a.text) return a.reply(
      `🎬 *Exemplo:* \`${a.prefix}video Naruto AMV\`\n\n` +
      `• \`${a.prefix}video\`  — 720p HD\n` +
      `• \`${a.prefix}video2\` — 1080p FHD`
    );
    return runVideoLista(a, '720', '720p HD');
  });

  // ════════════════════════════════════════════════
  // case 'video2' — vídeo FHD 1080p
  // ════════════════════════════════════════════════
  registerCase(['video2', 'vid2', 'fhd', 'fullhd'], async (a) => {
    if (!a.text) return a.reply(`🎬 *Full HD (1080p)*\n\nExemplo: \`${a.prefix}video2 nome do vídeo\``);
    return runVideoLista(a, '1080', '1080p FHD');
  });
};
