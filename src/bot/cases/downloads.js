/**
 * DARK BOT — Cases de Downloads 🎵
 *
 * play   → áudio automático 128k + card com capa e vídeo 480p — resultado #1
 * play2  → card normal de áudio/vídeo — resultado alternativo #2
 * play3  → mesmo fluxo/botões de play, áudio 320k + vídeo 1080p — resultado #3
 * ytd    → áudio MP3 por URL
 * gyt    → vídeo MP4 por URL
 *
 * O resultado #1 privilegia rapidez e entrega o áudio automaticamente;
 * com interactive oficial e fallback de texto mantendo a opção de vídeo.
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

// Eventos de música também chegam ao Console Live do Dashboard da instância
// conectada. Em testes/mocks, o log continua no stdout sem depender do bot.
function logMusic(sock, level, message) {
  try {
    if (typeof sock?.__darkBotLog === 'function') {
      sock.__darkBotLog(level, message);
      return;
    }
  } catch {}
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  fn(`[${level.toUpperCase()}] ${message}`);
}

// ── Helper: envia áudio com card de metadados ─────────────────
async function sendAudioCard(sock, jid, quoted, r) {
  // Áudio real primeiro: o mime e a extensão são derivados dos bytes, não da
  // resposta do provider (que por vezes marca M4A/OGG como MP3).
  const title = r.title || 'Áudio';
  const declaredMime = r.mimetype || 'audio/mpeg';
  let audioBuffer = r.buffer && Buffer.isBuffer(r.buffer) ? r.buffer : null;
  // Não delegar uma URL efémera directamente ao WhatsApp. Alguns providers
  // devolvem link que parece válido, mas expira/recusa o fetch do Baileys e a
  // mensagem acaba sem áudio para o utilizador. Só confirmamos sucesso depois
  // de obter e validar os bytes; assim o chamador pode trocar de provider.
  if (!audioBuffer) audioBuffer = await mediaHandler.fetchBuffer(r.url, { timeout: 25000 });
  if (!mediaHandler.isAudioBytes(audioBuffer)) throw new Error('áudio vazio ou inválido');

  const mime = mediaHandler.audioMimeFromBytes?.(audioBuffer, declaredMime) || declaredMime;
  const ext = mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : mime.includes('wav') ? 'wav' : 'mp3';
  const fileName = `${title.replace(/[/\\?%*:|"<>]/g, '-').slice(0, 60)}.${ext}`;
  const details = `jid=${jid} bytes=${audioBuffer.length} mime=${mime} source=${r.source || r.quality || 'desconhecida'}`;
  logMusic(sock, 'info', `[MUSIC-SEND] pronto ${details}`);

  try {
    const result = await sock.sendMessage(jid, { audio: audioBuffer, mimetype: mime, fileName, ptt: false }, { quoted });
    logMusic(sock, 'success', `[MUSIC-SEND] entregue como áudio ${details}`);
    return result;
  } catch (audioSendError) {
    // O upload de áudio é recusado ocasionalmente por clientes/servidores que
    // aceitam o mesmo byte como ficheiro. Entregar como documento é preferível
    // a mostrar sucesso no card sem nenhuma música chegar ao utilizador.
    logMusic(sock, 'warn', `[MUSIC-SEND] áudio recusado; fallback documento jid=${jid} erro=${String(audioSendError.message || '').slice(0, 90)}`);
    try {
      const result = await sock.sendMessage(jid, {
        document: audioBuffer,
        mimetype: mime,
        fileName,
        caption: `🎵 ${title}\n📎 Enviado como ficheiro para garantir a entrega.`,
      }, { quoted });
      logMusic(sock, 'success', `[MUSIC-SEND] entregue como documento ${details}`);
      return result;
    } catch (documentSendError) {
      logMusic(sock, 'error', `[MUSIC-SEND] documento também falhou jid=${jid} erro=${String(documentSendError.message || '').slice(0, 90)}`);
      throw documentSendError;
    }
  }
}
// ── Helper: envia vídeo MP4 reproduzível no WhatsApp ─────────
async function sendVideoFile(sock, jid, quoted, buf, caption, title, opts = {}) {
  if (!buf || buf.length < 4096) throw new Error('vídeo vazio');
  const compatible = await require('../videoCompat').prepareForWhatsApp(buf, {
    maxHeight: opts.maxHeight || 480,
  });
  const duration = compatible.duration || opts.duration || '';
  const actualQuality = compatible.dimensions?.height
    ? `${compatible.dimensions.height}p`
    : 'resolução não verificada';
  const measuredCaption = String(caption || '').replace(/📺\s*[^\n]*/u, `📺 ${actualQuality}`);
  const finalCaption = duration && !/⏱️\s*(?:\?|—)?\s*(?:\||$)/.test(measuredCaption)
    ? measuredCaption
    : (duration ? measuredCaption.replace(/⏱️\s*(?:\?|—)?/, `⏱️ ${duration}`) : measuredCaption);
  try {
    return await sock.sendMessage(jid, {
      video: compatible.buffer,
      caption: finalCaption,
      mimetype: 'video/mp4',
    }, { quoted });
  } catch (videoSendError) {
    // Tal como no áudio, o documento mantém a entrega quando um cliente
    // recusa renderizar o vídeo inline depois do upload.
    console.warn('[VIDEO-SEND] player recusado; a entregar ficheiro:', videoSendError.message?.slice(0, 90));
    return sock.sendMessage(jid, {
      document: compatible.buffer,
      mimetype: 'video/mp4',
      fileName: `${String(title || 'video').replace(/[/\?%*:|"<>]/g, '-').slice(0, 60)}.mp4`,
      caption: finalCaption + '\n\n📎 Enviado como ficheiro para garantir a entrega.',
    }, { quoted });
  }
}

// ─────────────────────────────────────────────
// runPlaySearch — fluxo play/play2/play3
// Estrutura EXACTA do código de referência (case 'play'),
// adaptada ao contexto do caseHandler + fallbacks robustos.
// ─────────────────────────────────────────────

// ── Thumbnail do card: busca local/API nem sempre devolve uma capa, mas o
// vídeo YouTube tem uma capa pública determinística pelo seu ID.
function playThumbnail(video = {}) {
  const received = String(video.thumbnail || video.image || '').trim();
  if (/^https:\/\//i.test(received)) return received;
  const source = String(video.youtube_url || video.url || '');
  const id = source.match(/[?&]v=([\w-]{11})|youtu\.be\/([\w-]{11})|\/shorts\/([\w-]{11})/)?.slice(1).find(Boolean);
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : '';
}

// ── Card de resultado; o áudio automático não cria botão de repetição ──
async function enviarCardPlay(sock, m, msg, video, prefix, Q, bodyExtra, footer, options = {}) {
  const mediaUrl = String(video.youtube_url || video.url || '').trim();
  if (!mediaUrl) throw new Error('resultado sem URL de mídia');

  const author = String(video.author || 'Canal desconhecido').slice(0, 44);
  const duration = String(video.duration || '?').slice(0, 12);
  const views = Number(video.views || 0).toLocaleString('pt-BR');
  const qualityLine = options.videoOnly
    ? `🎵 Áudio ${options.autoAudio ? 'automático' : 'enviado'} (${Q.audio})  ·  🎬 ${Q.video}p`
    : `🎵 ${Q.audio}  ·  🎬 ${Q.video}p`;
  const lines = [
    bodyExtra ? `🔎 ${bodyExtra}` : '',
    `👤 ${author}`,
    `⏱️ ${duration}  ·  👁️ ${views}`,
    qualityLine,
  ].filter(Boolean);
  const body = lines.join('\n');
  const audioCmd = `${prefix}ytd ${mediaUrl} | ${Q.audio}`;
  const videoCmd = `${prefix}gyt ${mediaUrl} | mp4 | ${Q.video} | ${video.duration || ''}`;

  // Baileys oficial: InteractiveMessage nativo, sem dependência de MB.cjs.
  // O fallback do helper é texto apenas se o transporte não aceitar relay.
  const fallbackFooter = options.videoOnly
    ? 'DARK BOT · áudio automático + vídeo'
    : 'DARK BOT · escolhe áudio ou vídeo';
  const buttons = [];
  if (!options.videoOnly) buttons.push({ text: `🎵 Áudio ${Q.audio}`, id: audioCmd });
  buttons.push({ text: `🎬 Vídeo ${Q.video}p`, id: videoCmd });
  try {
    const { sendButtons } = require('../buttonHandler');
    await sendButtons(
      sock,
      m.chat,
      `🎵 *${String(video.title || 'Música').slice(0, 60)}*\n${body}`,
      String(footer || fallbackFooter).slice(0, 64),
      buttons,
      options.autoAudio ? null : msg,
      { image: playThumbnail(video) },
    );
    return;
  } catch (e) {
    console.warn('[PLAY] interactive oficial falhou; a enviar opções em texto:', e.message?.slice(0, 80));
  }

  // Fallback simples mantém a opção de vídeo mesmo sem a biblioteca de botões.
  const actionsText = options.videoOnly
    ? `Áudio ${options.autoAudio ? 'automático' : 'enviado'} (${Q.audio})\nVídeo: ${videoCmd}`
    : `Áudio: ${audioCmd}\nVídeo: ${videoCmd}`;
  await sock.sendMessage(m.chat, {
    text: `🎵 *${String(video.title || 'Música').slice(0, 60)}*\n${body}\n\n${actionsText}`,
  }, options.autoAudio ? {} : { quoted: msg });
}

async function enviarAudioResultado(sock, jid, msg, video, quality) {
  const mediaUrl = String(video.youtube_url || video.url || '').trim();
  if (!mediaUrl) throw new Error('resultado sem URL de áudio');

  // A API de busca pode devolver uma URL de download expirada. Antes este
  // erro terminava o !play, mesmo com o motor local/Piped ainda disponível.
  // A entrega faz parte do provider: se não conseguimos enviar os bytes,
  // tentamos um segundo motor e só então declaramos falha.
  let primaryError;
  try {
    const result = await systemZeroPlay.ytAudio(mediaUrl, quality);
    if (!result || (!result.buffer && !result.url)) throw new Error('provider não devolveu áudio');
    await sendAudioCard(sock, jid, msg, {
      ...result,
      title: result.title || video.title || 'Áudio',
      author: result.author || video.author || '',
      duration: result.duration || video.duration || '',
      mimetype: result.mimetype || 'audio/mpeg',
    });
    return;
  } catch (error) {
    primaryError = error;
    logMusic(sock, 'warn', `[PLAY AUDIO] primário não entregou jid=${jid}; a tentar motor local: ${String(error.message || '').slice(0, 100)}`);
  }

  try {
    const fallback = await ytdl.getAudio(mediaUrl, quality);
    if (!fallback?.buffer) throw new Error('motor local não devolveu buffer');
    await sendAudioCard(sock, jid, msg, {
      ...fallback,
      title: fallback.title || video.title || 'Áudio',
      author: fallback.author || video.author || '',
      duration: fallback.duration || video.duration || '',
      mimetype: fallback.mimetype || 'audio/mpeg',
    });
  } catch (fallbackError) {
    const primary = primaryError?.message ? `primário: ${primaryError.message}; ` : '';
    throw new Error(primary + 'fallback: ' + (fallbackError.message || 'falhou'));
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
    const searchData = await systemZeroPlay.ytsearch(text);
    if (!searchData?.resultados?.length) {
      sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
      return m.reply('Nenhum resultado encontrado.');
    }

    const resultados = searchData.resultados || [];
    const footer = config.footer || (config.bot?.name ? `${config.bot.name} 🕸️ DARK BOT` : '© DARK BOT v6');
    const video = resultados[Math.min(resultIndex, resultados.length - 1)];
    const bodyExtra = resultIndex > 0 ? `Resultado #${resultIndex + 1}` : '';
    let audioFailed = false;

    if (quality.autoAudio) {
      // O card de vídeo chega sem esperar pelo provider; o áudio acompanha automaticamente.
      await enviarCardPlay(sock, m, msg, video, prefix, Q, bodyExtra, footer, {
        videoOnly: true, autoAudio: true,
      });
      try {
        await enviarAudioResultado(sock, m.chat, msg, video, Q.audio);
      } catch (audioError) {
        audioFailed = true;
        logMusic(sock, 'error', `[PLAY AUDIO] falha final jid=${m.chat}: ${String(audioError.message || '').slice(0, 100)}`);
        await m.reply('⚠️ O card de vídeo foi enviado, mas não consegui entregar o áudio desta vez.');
      }
    } else {
      await enviarCardPlay(sock, m, msg, video, prefix, Q, bodyExtra, footer);
    }
    sock.sendMessage(m.chat, { react: { text: audioFailed ? '⚠️' : '✅', key: m.key } });
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
  // case 'play' — áudio automático e card simples só com vídeo (#1)
  // ════════════════════════════════════════════════
  registerCase(['play', 'music', 'musica', 'yt', 'ytmp3'], (caseCtx) =>
    runPlaySearch(caseCtx, 0, { audio: '128k', video: '480', label: 'Rápido', autoAudio: true }));

  // ════════════════════════════════════════════════
  // case 'play2' — card normal de áudio/vídeo, resultado alternativo (#2)
  // ════════════════════════════════════════════════
  registerCase(['play2', 'music2'], (caseCtx) =>
    runPlaySearch(caseCtx, 1, { audio: '192k', video: '720', label: 'Medium' }));

  // ════════════════════════════════════════════════
  // case 'play3' — mesmo cartão, mesmos botões e fluxo do play; só muda a qualidade
  // ════════════════════════════════════════════════
  registerCase(['play3', 'music3'], (caseCtx) =>
    runPlaySearch(caseCtx, 2, { audio: '320k', video: '1080', label: 'High Quality', autoAudio: true }));

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
