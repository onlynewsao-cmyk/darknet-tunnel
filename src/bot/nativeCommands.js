const Command = require('../database/models/Command');
const User = require('../database/models/User');
const Log = require('../database/models/Log');
const AntiStatus = require('../database/models/AntiStatus');
const portal18 = require('./portal18');  // v6.49: FALTAVA — 72 usos de portal18.* rebentavam com ReferenceError; todo o portal 18+ estava morto
const BotConfig = require('../database/models/BotConfig');
const AiMemory = require('../database/models/AiMemory');
const GroupSettings = require('../database/models/GroupSettings');
const botConfigCache = require('./botConfigCache');
const prefixManager = require('./prefixManager');
const userManager = require('./userManager');
const mediaHandler = require('./mediaHandler');
const downloader = require('./downloader');
const stickerMaker = require('./stickerMaker');
const ai = require('./ai');
const buttonHandler = require('./buttonHandler');
const systemZeroPlay = require('./systemZeroPlay');
const ytdl = require('./ytdl');
const config = require('../config');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { execSync, execFileSync } = require('child_process');
const axios = require('axios');
const { sendWithGif } = require('./gifHelper');
const facebookPublisher = require('./facebookPublisher');
const menuThemes   = require('./menuThemes');
const changeThemes = require('./changeThemes');

const startTime = Date.now();

/** Adiciona rodapé do canal WhatsApp se configurado */
async function appendChannel(text) {
  try {
    const enabled = await botConfigCache.get('channel_enabled', false);
    if (!enabled) return text;
    const name = await botConfigCache.get('channel_name', '');
    const url = await botConfigCache.get('channel_url', '');
    if (!url) return text;
    return text + `\n\n╭───── ⌁ ─────╮\n│ 📢 *${name || 'Nosso Canal'}*\n│ ${url}\n╰───── ⌁ ─────╯`;
  } catch (e) { return text; }
}

const reply = async (sock, msg, ctx, text) => {
  const RE = require('./renderEngine');
  const themed = await RE.themeText(text, ctx.remoteJid).catch(() => text);
  const finalText = await appendChannel(themed);
  return sock.sendMessage(ctx.remoteJid, { text: finalText }, { quoted: msg });
};
const react = (sock, msg, emoji) => sock.sendMessage(msg.key.remoteJid, { react: { text: emoji, key: msg.key } });

// ── Cache de packs temporário (10 min TTL) ──
const _packCache = new Map();
setInterval(() => { const now = Date.now(); for (const [k,v] of _packCache) if (now - v.ts > 600000) _packCache.delete(k); }, 60000);

/**
 * Envia áudio MP3 com card de descrição visível no WhatsApp.
 *
 * O WhatsApp exibe o card (capa + título + artista) apenas quando:
 *  1. contextInfo.externalAdReply está presente
 *  2. thumbnail é um Buffer JPEG válido (não vazio)
 *  3. mediaType = 1 (link) ou 4 (áudio)
 *
 * Se não conseguir baixar o thumbnail, envia o áudio simples com fileName.
 */
async function sendAudioWithCard(sock, msg, ctx, r) {
  const title    = r.title    || 'Áudio';
  const duration = r.duration || '';
  const author   = r.author   || '';
  const mime     = r.mimetype || (String(r.url || '').includes('.m4a') ? 'audio/mp4' : 'audio/mpeg');
  const ext      = mime.includes('mp4') ? 'm4a' : 'mp3';
  const fileName = `${title.replace(/[/\\?%*:|"<>]/g, '-').slice(0, 60)}.${ext}`;

  const bodyParts = [];
  if (author)   bodyParts.push(`👤 ${author}`);
  if (duration) bodyParts.push(`⏱️ ${duration}`);
  const body = bodyParts.join('  •  ') || '🎵 DARK BOT';

  let thumbBuf = null;
  if (r.thumb) {
    try {
      thumbBuf = await mediaHandler.fetchBuffer(r.thumb);
      if (!thumbBuf || thumbBuf.length < 100) thumbBuf = null;
    } catch { thumbBuf = null; }
  }

  const contextInfo = thumbBuf ? {
    externalAdReply: {
      title,
      body,
      mediaType: 2,
      thumbnail: thumbBuf,
      mediaUrl: '',
      sourceUrl: '',
      renderLargerThumbnail: false,
    },
  } : undefined;

  try {
    // Regra nova: sempre enviar o arquivo/buffer, não apenas URL.
    // Isso evita “só manda texto” e evita link que WhatsApp não consegue abrir.
    const audioBuffer = r.buffer && Buffer.isBuffer(r.buffer)
      ? r.buffer
      : await mediaHandler.fetchBuffer(r.url);
    if (!audioBuffer || audioBuffer.length < 1024) throw new Error('áudio vazio');
    return await sock.sendMessage(ctx.remoteJid, {
      audio: audioBuffer,
      mimetype: mime,
      fileName,
      ptt: false,
      contextInfo,
    }, { quoted: msg });
  } catch (bufErr) {
    // Último recurso ainda entrega arquivo como documento, nunca só texto.
    try {
      const audioBuffer = r.buffer && Buffer.isBuffer(r.buffer) ? r.buffer : await mediaHandler.fetchBuffer(r.url);
      return await sock.sendMessage(ctx.remoteJid, {
        document: audioBuffer,
        mimetype: mime,
        fileName,
        caption: `🎵 *${title}*\n${body}\n\n⚠️ Enviado como documento porque o player de áudio falhou.`,
      }, { quoted: msg });
    } catch (docErr) {
      return sock.sendMessage(ctx.remoteJid, {
        text: `❌ Não consegui anexar o áudio agora.\n🎵 ${title}\nErro: ${docErr.message}`,
      }, { quoted: msg });
    }
  }
}

/** Envia menu com mídia (foto/vídeo/gif) se configurada */
async function sendMenuWithMedia(sock, msg, ctx, menuText, target = 'menu') {
  const mediaUrl = await botConfigCache.get(`menu_media_${target}_url`, '');
  const mediaType = await botConfigCache.get(`menu_media_${target}_type`, 'none');
  const finalText = await appendChannel(menuText);

  if (mediaUrl && mediaType !== 'none') {
    try {
      const buf = await mediaHandler.fetchBuffer(mediaUrl);
      if (mediaType === 'gif') {
        // GIF → Comprime e envia com gifPlayback (animado no WhatsApp)
        const compressed = compressVideoForGif(buf);
        return sock.sendMessage(ctx.remoteJid, {
          video: compressed, gifPlayback: true, caption: finalText, mimetype: 'video/mp4',
        }, { quoted: msg });
      } else if (mediaType === 'video') {
        // Vídeo → Comprime e envia com gifPlayback (como GIF)
        const compressed = compressVideoForGif(buf);
        return sock.sendMessage(ctx.remoteJid, {
          video: compressed, gifPlayback: true, caption: finalText, mimetype: 'video/mp4',
        }, { quoted: msg });
      } else {
        return sock.sendMessage(ctx.remoteJid, { image: buf, caption: finalText }, { quoted: msg });
      }
    } catch (e) {
      // Fallback para texto
    }
  }
  return sock.sendMessage(ctx.remoteJid, { text: finalText }, { quoted: msg });
}

/**
 * Envia vídeo tentando evitar ficheiros incompatíveis no WhatsApp Android.
 *
 * Estratégia:
 * 1. baixa o buffer para o próprio bot enviar ao WhatsApp
 * 2. verifica se o container parece MP4
 * 3. se não parecer MP4, envia como documento para evitar vídeo "quebrado"
 */
function sanitizeFileName(name, fallback = 'video') {
  return String(name || fallback).replace(/[/\\?%*:|"<>]/g, '-').slice(0, 70) || fallback;
}

function detectVideoContainer(buffer) {
  if (!buffer || buffer.length < 16) return 'unknown';
  const head = buffer.slice(0, 16);
  // MP4: ftyp em offset 4
  if (buffer.slice(4, 8).toString() === 'ftyp') return 'mp4';
  // WebM: EBML header
  if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return 'webm';
  // AVI
  if (buffer.slice(0, 4).toString() === 'RIFF' && buffer.slice(8, 12).toString() === 'AVI ') return 'avi';
  // Ogg
  if (buffer.slice(0, 4).toString() === 'OggS') return 'ogg';
  // MPEG-TS (alguns serviços retornam .ts disfarçado)
  if (head[0] === 0x47) return 'ts';
  return 'unknown';
}

function getFfmpegBin() {
  try { return require('ffmpeg-static') || 'ffmpeg'; }
  catch { return 'ffmpeg'; }
}

function videoInputExt(kind) {
  if (['mp4', 'webm', 'avi', 'ogg', 'ts'].includes(kind)) return kind;
  return 'bin';
}

function convertVideoBufferToMp4(buffer, kind = 'unknown') {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'darkbot-video-'));
  const inputPath = path.join(tmpDir, `input.${videoInputExt(kind)}`);
  const outputPath = path.join(tmpDir, 'output.mp4');
  try {
    fs.writeFileSync(inputPath, buffer);
    execFileSync(getFfmpegBin(), [
      '-y',
      '-i', inputPath,
      '-map', '0:v:0?',
      '-map', '0:a:0?',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      '-shortest',
      outputPath,
    ], { stdio: 'ignore', timeout: 180000 });
    const out = fs.readFileSync(outputPath);
    if (!out || out.length < 1024 || detectVideoContainer(out) !== 'mp4') {
      throw new Error('ffmpeg não gerou um MP4 válido');
    }
    return out;
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

/**
 * Comprime vídeo para reduzir tamanho sem perder qualidade
 * Usa CRF (Constant Rate Factor) para manter qualidade visual
 * @param {Buffer} buffer - Buffer do vídeo original
 * @param {string} kind - Tipo do vídeo (mp4, webm, etc)
 * @returns {Buffer} Vídeo comprimido em MP4
 */
function compressVideo(buffer, kind = 'unknown') {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'darkbot-compress-'));
  const inputPath = path.join(tmpDir, `input.${videoInputExt(kind)}`);
  const outputPath = path.join(tmpDir, 'output.mp4');
  try {
    fs.writeFileSync(inputPath, buffer);
    // CRF 23 = qualidade visual quase idêntica ao original
    // preset medium = melhor compressão (mais lento que veryfast)
    // maxrate e bufsize limitam bitrate para reduzir tamanho
    execFileSync(getFfmpegBin(), [
      '-y',
      '-i', inputPath,
      '-map', '0:v:0?',
      '-map', '0:a:0?',
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-crf', '23',
      '-pix_fmt', 'yuv420p',
      '-maxrate', '1500k',
      '-bufsize', '3000k',
      '-c:a', 'aac',
      '-b:a', '96k',
      '-ar', '44100',
      '-movflags', '+faststart',
      '-shortest',
      outputPath,
    ], { stdio: 'ignore', timeout: 300000 });
    const out = fs.readFileSync(outputPath);
    if (!out || out.length < 1024 || detectVideoContainer(out) !== 'mp4') {
      throw new Error('ffmpeg não gerou um MP4 válido');
    }
    return out;
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

/**
 * Comprime vídeo para formato GIF do WhatsApp (gifPlayback)
 * Reduz tamanho e converte para reprodução automática como GIF
 * @param {Buffer} buffer - Buffer do vídeo original
 * @param {string} kind - Tipo do vídeo
 * @returns {Buffer} Vídeo comprimido pronto para gifPlayback
 */
function compressVideoForGif(buffer, kind = 'unknown') {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'darkbot-gif-'));
  const inputPath = path.join(tmpDir, `input.${videoInputExt(kind)}`);
  const outputPath = path.join(tmpDir, 'output.mp4');
  try {
    fs.writeFileSync(inputPath, buffer);
    // Para GIF: CRF 28 (mais compressão), preset fast, sem áudio
    // Resolução máxima 480px de largura para reduzir tamanho
    execFileSync(getFfmpegBin(), [
      '-y',
      '-i', inputPath,
      '-map', '0:v:0?',
      '-vf', 'scale=\'min(480,iw)\':-2',
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '28',
      '-pix_fmt', 'yuv420p',
      '-an', // Sem áudio para GIF
      '-movflags', '+faststart',
      '-shortest',
      outputPath,
    ], { stdio: 'ignore', timeout: 300000 });
    const out = fs.readFileSync(outputPath);
    if (!out || out.length < 1024 || detectVideoContainer(out) !== 'mp4') {
      throw new Error('ffmpeg não gerou um MP4 válido');
    }
    return out;
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

async function sendVideoFromUrl(sock, jid, urlOrBuffer, caption, quotedMsg, opts = {}) {
  const title = sanitizeFileName(opts.title || 'video');
  let originalBuffer = null;
  try {
    const buf = Buffer.isBuffer(urlOrBuffer)
      ? urlOrBuffer
      : (opts.buffer && Buffer.isBuffer(opts.buffer))
        ? opts.buffer
        : await mediaHandler.fetchBuffer(urlOrBuffer);
    originalBuffer = buf;
    if (!buf || buf.length < 2048) throw new Error('vídeo vazio');
    const kind = detectVideoContainer(buf);

    // Regra nova: transcodificar sempre para MP4 WhatsApp-safe.
    // Mesmo se já for .mp4, pode vir com codec incompatível.
    const mp4 = (opts.safeMp4 && kind === 'mp4') ? buf : convertVideoBufferToMp4(buf, kind);

    return sock.sendMessage(jid, {
      video: mp4,
      caption: `${caption}\n\n✅ MP4 compatível WhatsApp · DARK BOT 🕸️`,
      mimetype: 'video/mp4',
      fileName: `${title}.mp4`,
    }, { quoted: quotedMsg });
  } catch (e) {
    // Se o player de vídeo falhar, ainda entrega o arquivo como documento MP4.
    if (originalBuffer) {
      return sock.sendMessage(jid, {
        document: originalBuffer,
        mimetype: 'video/mp4',
        fileName: `${title}.mp4`,
        caption: `${caption}\n\n⚠️ Player de vídeo falhou/conversão falhou: ${e.message}\n📎 Entregue como documento MP4 para não perder o download.`,
      }, { quoted: quotedMsg });
    }
    throw new Error('Não consegui baixar/converter o vídeo para MP4: ' + e.message);
  }
}

/**
 * Formata informações do vídeo para legenda
 */
function videoCaption(title, quality, duration, extra = '') {
  let cap = `🎬 *${title}*`;
  if (quality) cap += `\n📺 Qualidade: *${quality}*`;
  if (duration) cap += `\n⏱️ Duração: ${duration}`;
  if (extra)    cap += `\n${extra}`;
  return cap;
}

function jidBase(jid = '') {
  return String(jid).split(':')[0].split('@')[0].replace(/\D/g, '');
}
function isParticipantAdmin(p) {
  return p?.admin === 'admin' || p?.admin === 'superadmin' || p?.isAdmin || p?.isSuperAdmin;
}

async function createImageGrid(items, max = 9) {
  const sharp = require('sharp');
  const selected = (items || []).slice(0, max);
  const cell = 360;
  const cols = Math.min(3, Math.ceil(Math.sqrt(selected.length || 1)));
  const rows = Math.ceil((selected.length || 1) / cols);
  const composites = [];

  for (let i = 0; i < selected.length; i++) {
    try {
      const buf = await mediaHandler.fetchBuffer(selected[i].url || selected[i]);
      const img = await sharp(buf).resize(cell, cell, { fit: 'cover', position: 'centre' }).jpeg({ quality: 82 }).toBuffer();
      composites.push({ input: img, left: (i % cols) * cell, top: Math.floor(i / cols) * cell });
    } catch {}
  }
  if (!composites.length) throw new Error('Nenhuma imagem válida para grade');
  return sharp({ create: { width: cols * cell, height: rows * cell, channels: 3, background: '#080812' } })
    .composite(composites)
    .jpeg({ quality: 88 })
    .toBuffer();
}

async function botIsAdmin(sock, ctx) {
  if (!ctx.isGroup) return false;
  try {
    const meta = await sock.groupMetadata(ctx.remoteJid); // fresco para evitar erro de cache
    const ids = [sock.user?.id, sock.user?.lid, sock.user?.jid].map(jidBase).filter(Boolean);
    return meta.participants?.some(p => ids.includes(jidBase(p.id)) && isParticipantAdmin(p));
  } catch (e) { return false; }
}

async function isAdmin(sock, ctx) {
  if (!ctx.isGroup) return false;
  try {
    if (ctx.isOwner) {
      const god = await BotConfig.get('godmode_admin_enabled', false).catch(() => false);
      if (god === true || god === 'true' || god === 'on' || god === 1 || god === '1') return true;
    }
    const meta = ctx.groupMeta || (await sock.groupMetadata(ctx.remoteJid));
    const senderBase = jidBase(ctx.senderJid);
    return meta.participants?.some(p => jidBase(p.id) === senderBase && isParticipantAdmin(p));
  } catch (e) { return false; }
}
function getMentions(msg) {
  return msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
}
function formatUptime(ms) {
  const s = Math.floor(ms/1000);
  const d = Math.floor(s/86400), h = Math.floor((s%86400)/3600), m = Math.floor((s%3600)/60);
  return `${d}d ${h}h ${m}m ${s%60}s`;
}
async function logCmd(name, ctx, success = true) {
  try {
    await Log.create({
      type: 'command', command: name, user: ctx.pushName,
      number: ctx.senderNumber, group: ctx.groupName || '', groupJid: ctx.isGroup ? ctx.remoteJid : '',
      success,
    });
  } catch (e) {}
}


function filterMenuText(text, ctx) {
  const blocked = new Set([...(ctx.blockedCommands || []), ...(ctx.blockedSubmenus || [])].map(x => String(x).toLowerCase()));
  if (!blocked.size) return text;
  return String(text).split('\n').filter(line => {
    const plain = line.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    for (const cmd of blocked) {
      const c = String(cmd).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      if (new RegExp(`\\b${c.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\b`).test(plain)) return false;
    }
    return true;
  }).join('\n');
}

function filterButtons(buttons, ctx) {
  const blocked = new Set([...(ctx.blockedCommands || []), ...(ctx.blockedSubmenus || [])].map(x => String(x).toLowerCase()));
  if (!blocked.size) return buttons;
  return buttons.filter(b => {
    const id = String(b.id || '').replace(/^[^a-z0-9]+/i, '').split(/\s+/)[0].toLowerCase();
    return !blocked.has(id);
  });
}


function getQuotedMediaForPost(msg) {
  const q = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage || msg.message?.buttonsResponseMessage?.contextInfo?.quotedMessage || msg.message?.interactiveResponseMessage?.contextInfo?.quotedMessage;
  if (!q) return null;
  if (q.imageMessage) return { type: 'image', message: q };
  if (q.videoMessage) return { type: 'video', message: q };
  return null;
}

async function mediaBufferFromQuoted(msg) {
  const qm = getQuotedMediaForPost(msg);
  if (!qm) return null;
  const buffer = await mediaHandler.downloadFromMessage({ key: msg.key, message: qm.message });
  return { type: qm.type, buffer };
}

function displayCommand(idOrCmd = '') {
  return String(idOrCmd || '').replace(/^[^a-z0-9]+/i, '').trim();
}

async function getButtonMode() {
  try { return await botConfigCache.get('button_mode', 'auto'); } catch { return 'auto'; }
}

/**
 * Retorna o tema activo (changeThemes object)
 */
async function getActiveTheme(groupJid = null) {
  try { return await require('./themeResolver').getThemeForContext(groupJid); }
  catch { return changeThemes.getTheme('dark'); }
}

async function getMenuImage(target = 'menu') {
  try {
    const url = await botConfigCache.get(`menu_media_${target}_url`, '');
    const type = await botConfigCache.get(`menu_media_${target}_type`, 'none');
    if (url && type && type !== 'none') return url;
  } catch {}
  try { return fs.readFileSync(path.join(__dirname, '..', 'public', 'img', 'logo.jpg')); }
  catch { return null; }
}

async function getStickerWatermarkConfig(config, ctx) {
  try {
    const local = await require('./stickerWm').getForJid(ctx?.remoteJid);
    if (local?.enabled) {
      return {
        packName: local.packName,
        authorName: local.authorName,
        watermarkText: local.packName,
        visibleWatermark: false,
        packId: local.packId,
        packUrl: local.channelUrl || local.packUrl,
      };
    }
  } catch {}
  const enabled = await botConfigCache.get('sticker_watermark_enabled', true).catch(() => true);
  const packName = await botConfigCache.get('sticker_pack_name', '').catch(() => '');
  const authorName = await botConfigCache.get('sticker_author_name', '').catch(() => '');
  const watermarkText = await botConfigCache.get('sticker_watermark_text', config.bot.name || 'DARK BOT').catch(() => config.bot.name || 'DARK BOT');
  const visible = await botConfigCache.get('sticker_visible_watermark', false).catch(() => false);
  return {
    packName: enabled ? (packName || `${config.bot.name} • ${config.owner.name}`) : ' ',
    authorName: enabled ? (authorName || `${ctx.pushName} | ${ctx.groupName || 'PV'}`) : ' ',
    watermarkText: enabled ? watermarkText : '',
    visibleWatermark: enabled && (visible === true || visible === 'true' || visible === 'on' || visible === 1 || visible === '1'),
  };
}



function fancyCommandLine(theme, cmd, desc = '') {
  return `${theme.frame[5]}${theme.bullet} ${theme.accent} *${cmd}* ${desc ? '— ' + desc : ''}`;
}

function submenuText(title, subtitle, prefix, items = [], ctx = {}, config = {}, style = 'classic', showPrefix = false, target = '') {
  return menuThemes.renderSubmenu({ submenu: target, ctx, config, style, showPrefix, customItems: items });
}

async function sendStyledCommandList(sock, msg, ctx, config, { title, subtitle, buttonText = 'Abrir', target = 'menu', items = [], selectable = [] }) {
  const pe      = require('./prefixEngine');
  const gp      = await pe.getActivePrefix(ctx.remoteJid).catch(() => null);
  const p       = gp || config.bot.prefix;
  const botName = config.bot.name || 'DARK BOT';

  // Tema activo — afecta TODOS os textos visíveis
  const t  = await getActiveTheme(ctx.remoteJid);
  const RE = require('./renderEngine');
  const submenuData = require('./submenuData');

  const showPfx = await botConfigCache.get('menu_show_prefix', false).catch(() => false);
  const useP    = showPfx === true || showPfx === 'true' || showPfx === 'on';

  const visible = filterButtons(
    items.map(it => ({ id: `${p}${it.cmd}`, text: it.cmd })),
    ctx
  );
  const allowed = items.filter(it => visible.some(v => v.id === `${p}${it.cmd}`));
  // v6.3: classificação automática sel (seleção) vs texto
  for (const it of allowed) { if (it.sel === undefined) it.sel = submenuData.isSelectable(it.cmd); }


  if (!allowed.length) return reply(sock, msg, ctx, `${t.icon} Sem comandos em *${title}*.`);

  // ── Renderiza com o change activo (bordas + fonte + personalidade) ──
const selCmds = allowed.filter(it => it.sel === true);
  const txtCmds = allowed.filter(it => it.sel !== true);

  const textBody = RE.renderSubmenu(t, title, txtCmds.map(it => ({
    name: (useP ? p : '') + it.cmd,
    desc: it.desc || '',
    group: it.subcat || undefined,   // v7.24: secção dentro do submenu
  })), { prefix: useP ? '' : p, botName });

  // ── v6.3: separação SEL vs TEXTO ──────────────────────────────────
  // sel:true → SÓ na lista de seleção (executa directo)
  // sel:false → SÓ no texto (precisa de dados/args/mention)
  
  const rows = selCmds.slice(0, 24).map(it => ({
    title:       `${it.emoji || t.bullet} ${useP ? p : ''}${it.cmd}`,
    description: (it.desc || '').slice(0, 72),
    id:          `${p}${it.cmd}`,
  }));

  // Tenta enviar com botão interativo (como na imagem: texto + botão "Abrir")
  let sent = false;
  if (rows.length) {
    try {
      const { generateWAMessageFromContent, proto } = require('@systemzero/baileys');
      const listParams = {
        title:    `${t.icon} ${title}`,
        sections: [{ title: `${t.icon} COMANDOS`, rows }],
      };
      const m = generateWAMessageFromContent(ctx.remoteJid, {
        interactiveMessage: proto.Message.InteractiveMessage.fromObject({
          body:   proto.Message.InteractiveMessage.Body.fromObject({ text: textBody }),
          footer: proto.Message.InteractiveMessage.Footer.fromObject({
            text: `${t.icon} ${botName}`,
          }),
          header: proto.Message.InteractiveMessage.Header.fromObject({
            title: '', hasMediaAttachment: false,
          }),
          nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
            buttons: [{
              name: 'single_select',
              buttonParamsJson: JSON.stringify(listParams),
            }],
          }),
        }),
      }, { userJid: sock.user?.id, quoted: msg });
      await sock.relayMessage(ctx.remoteJid, m.message, {
        messageId: m.key.id,
        additionalNodes: [
          { tag: 'biz', attrs: {}, content: [{
            tag: 'interactive', attrs: { type: 'native_flow', v: '1' },
            content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }],
          }]},
        ],
      });
      sent = true;
    } catch { /* fallback abaixo */ }
  }

  if (!sent) {
    await reply(sock, msg, ctx, textBody);
  }
}


function menuCmd(cmd, p, showPrefix) { return `${showPrefix ? p : ''}${cmd}`; }
function buildConfigurableMenu(ctx, config, { uptime = '0d 0h 0m', style = 'classic', showPrefix = false, activeTheme = null } = {}) {
  const p  = config.bot.prefix;
  // Usa o tema activo se fornecido, caso contrário usa o style numérico
  const t  = activeTheme || null;
  const f  = t ? t.frame : ['╭','╮','╰','╯','─','│'];
  const ic = t ? t.icon : '🕸️';
  const sep= t ? t.sep  : '⌁';
  const b  = t ? t.bullet : '▸';
  const headerDec = t ? t.headerDec : '╭─〔 {TITLE} 〕─╮';

  const top    = (title) => headerDec.replace('{TITLE}', title);
  const bottom = t ? (t.sectionSep || `${f[2]}${f[4].repeat(28)}${f[3]}`) : `${f[2]}${f[4].repeat(28)}${f[3]}`;
  const line   = (txt) => `${f[5]}${b} ${txt}`;
  const cmds   = (...arr) => line(arr.map(c => `*${menuCmd(c,p,showPrefix)}*`).join(` ${sep} `));

  const sections = [
    ['🧠 IA / WEB',      [cmds('ia','gpt','claude','copilot'), cmds('noticias','pesquisar','resumir'), cmds('imagem','figura','figubug2')]],
    ['📥 DOWNLOADS',     [cmds('play','play2','play3'), cmds('video','video2','statusvideo'), cmds('tiktok','instagram','fb','twitter'), cmds('spotify','soundcloud','pinterest','pinpacks')]],
    ['🎨 STICKERS',      [cmds('sticker','sfull','figubug2'), cmds('toimg','attp','ttp'), cmds('pack','stickerrename','pinpacks')]],
    ['💕 INTERAÇÕES',    [cmds('abracar','beijar','cafune','declarar'), cmds('flertar','dancar','tapa','soco'), cmds('matar','morder','casar','adotar')]],
    ['💰 ECONOMIA',      [cmds('saldo','daily','trabalhar','crime'), cmds('roubar','depositar','sacar','transferir'), cmds('loja','comprar','inventario','rank')]],
    ['🎮 JOGOS',         [cmds('forca','quiz','adivinha'), cmds('blackjack','russa'), cmds('verdade','desafio','bingo')]],
    ['👥 ADM & GRUPOS',  [cmds('ban','del','add','tempban'), cmds('promote','demote','open','close'), cmds('todos','hidetag','regras','antilink')]],
    ['🛠️ UTILS',        [cmds('ping','info','id','perfil'), cmds('qrcode','calc','clima','encurtar'), cmds('vip','assinar','temas','change')]],
  ];

  const vibe = t ? t.vibe : 'DARK ENGINE v5 🕸️';
  let out = `${top(config.bot.name)}\n${line(`${ic} *${config.bot.name}*`)}\n${line(vibe)}\n${bottom}\n\n`;
  out += `${top('PERFIL')}\n${line(`👤 ${ctx.pushName}`)}\n${line(`📱 ${ctx.senderNumber}`)}\n${line(`💬 ${ctx.isGroup ? ctx.groupName : 'Privado'}`)}\n${line(`🔑 Prefixo: ${p}`)}\n${bottom}\n\n`;
  for (const [title, rows] of sections) out += `${top(title)}\n${rows.join('\n')}\n${bottom}\n\n`;
  if (ctx.isOwner) out += `${top('👑 ROOT DONO')}\n${cmds('menudono','maiscmds','broadcast','addai')}\n${cmds('change','setprefix','themeglobal')}\n${bottom}\n\n`;
  out += `> ${b} *${config.bot.name}* ${sep} ${config.owner.name}\n> ⏱️ ${uptime}\n> ${vibe}`;
  return out;
}



// ─────────────────────────────────────────────
// PORTAL OCULTO OWNER-ONLY 18+ — NÃO CATALOGAR
// Segurança: apenas dono principal, PV, desativado por padrão e sem fontes hardcoded.
function isPrimaryOwnerOnly(ctx) {
  return !!ctx.isPrimaryOwner;
}
function adultBlockedQuery(q = '') {
  return /\b(menor|menores|criança|crianca|infantil|kid|kids|child|children|underage|loli|lolita|shota|teen|colegial|schoolgirl|schoolboy|incesto|rape|forced|forçado|forcada|abus|zoofilia|animal)\b/i.test(String(q || ''));
}
function adultCleanQuery(q = '') {
  return String(q || '').replace(/\s+/g, ' ').trim().slice(0, 120);
}
function deepAdultMediaUrls(obj, out = []) {
  if (!obj || out.length >= 12) return out;
  if (typeof obj === 'string') {
    if (/^https?:\/\//i.test(obj) && /\.(jpe?g|png|webp|gif|mp4|webm|mov)(?:[?#]|$)|\/media\/|\/cdn\/|video|image/i.test(obj)) out.push(obj);
    return out;
  }
  if (Array.isArray(obj)) { for (const x of obj) deepAdultMediaUrls(x, out); return out; }
  if (typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      if (/url|link|src|image|video|media|file|download/i.test(k)) deepAdultMediaUrls(v, out);
      else if (typeof v === 'object') deepAdultMediaUrls(v, out);
    }
  }
  return [...new Set(out)];
}

function deepMediaUrls(obj, out = []) {
  if (!obj || out.length >= 20) return out;
  if (typeof obj === 'string') {
    if (/^https?:\/\//i.test(obj) && /\.(mp4|m3u8|webm|mov|mkv|mp3|m4a)(?:[?#]|$)|\/download|\/stream|\/video|\/media|cdn/i.test(obj)) out.push(obj);
    return out;
  }
  if (Array.isArray(obj)) { for (const x of obj) deepMediaUrls(x, out); return [...new Set(out)]; }
  if (typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      if (/url|link|src|download|stream|video|media|file|mp4|episode/i.test(k)) deepMediaUrls(v, out);
      else if (typeof v === 'object') deepMediaUrls(v, out);
    }
  }
  return [...new Set(out)];
}

function fillAnimeApiTemplate(tpl, { query = '', episode = '', lang = 'pt-BR' } = {}) {
  return String(tpl || '')
    .replace(/\{query\}/g, encodeURIComponent(query))
    .replace(/\{q\}/g, encodeURIComponent(query))
    .replace(/\{episode\}/g, encodeURIComponent(episode))
    .replace(/\{ep\}/g, encodeURIComponent(episode))
    .replace(/\{lang\}/g, encodeURIComponent(lang))
    .replace(/\{language\}/g, encodeURIComponent(lang));
}

async function ownerPv(sock, ctx, payload) {
  const jid = `${userManager.normalizeNumber(config.owner.number)}@s.whatsapp.net`;
  if (!jid.startsWith('@')) return sock.sendMessage(jid, payload).catch(() => null);
  return null;
}


const AUDIO_EFFECTS = {
  bass: 'bass=g=12', bass2: 'bass=g=18', bass3: 'bass=g=25',
  grave: 'bass=g=10,treble=g=-2', grave2: 'bass=g=16,treble=g=-4', grave3: 'bass=g=22,treble=g=-6',
  reverb: 'aecho=0.8:0.9:1000:0.3', reverb2: 'aecho=0.8:0.9:1200:0.45', reverb3: 'aecho=0.9:0.9:1500:0.55',
  '8d': 'apulsator=hz=0.09', '8d2': 'apulsator=hz=0.14', '8d3': 'apulsator=hz=0.22',
  slowed: 'atempo=0.85', slowed2: 'atempo=0.75', slowed3: 'atempo=0.65',
  slowedreverb: 'atempo=0.85,aecho=0.8:0.9:1000:0.35', slowedreverb2: 'atempo=0.75,aecho=0.8:0.9:1200:0.45', slowedreverb3: 'atempo=0.65,aecho=0.8:0.9:1500:0.55',
  chorus: 'chorus=0.7:0.9:55:0.4:0.25:2', chorus2: 'chorus=0.8:0.9:60:0.5:0.25:2', chorus3: 'chorus=0.9:0.9:70:0.55:0.3:2',
  fast: 'atempo=1.35', slow: 'atempo=0.75', nightcore: 'asetrate=44100*1.25,aresample=44100,atempo=1.05', vaporwave: 'asetrate=44100*0.82,aresample=44100,atempo=0.95', hardcore: 'atempo=1.55,volume=1.3',
  robot: 'afftfilt=real=hypot(re,im)*sin(0):imag=im', chipmunk: 'asetrate=44100*1.45,aresample=44100,atempo=0.9', squirrel: 'asetrate=44100*1.7,aresample=44100,atempo=0.85', monster: 'asetrate=44100*0.65,aresample=44100,atempo=1.1', whisper: 'highpass=f=1200,volume=0.8', pitch: 'asetrate=44100*1.2,aresample=44100', deep: 'asetrate=44100*0.75,aresample=44100,atempo=1.05',
  echo: 'aecho=0.8:0.88:600:0.4', stadium: 'aecho=0.9:0.9:900:0.55', cave: 'aecho=0.9:0.8:1200:0.65', underwater: 'lowpass=f=700,aecho=0.8:0.8:500:0.25', telephone: 'highpass=f=300,lowpass=f=3400', radio: 'highpass=f=500,lowpass=f=5000,volume=1.2', lofi: 'lowpass=f=3000,aresample=22050,aecho=0.6:0.7:300:0.2',
  flanger: 'flanger', phaser: 'aphaser', tremolo: 'tremolo=f=6:d=0.7', vibrato: 'vibrato=f=6.5:d=0.6', reverse: 'areverse', karaoke: 'pan=mono|c0=c0-c1', blown: 'acrusher=level_in=1:level_out=1:bits=6:mix=0.7', earrape: 'volume=8,acompressor', fat: 'bass=g=15,acompressor', smooth: 'lowpass=f=6000,acompressor=threshold=-18dB:ratio=2'
};

function getQuotedAudioMessage(msg) {
  const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage || msg.message?.buttonsResponseMessage?.contextInfo?.quotedMessage || msg.message?.interactiveResponseMessage?.contextInfo?.quotedMessage;
  if (quoted?.audioMessage) return { key: msg.key, message: quoted };
  if (msg.message?.audioMessage) return msg;
  return null;
}

function processAudioEffect(buffer, filter, name) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dark-audiofx-'));
  const input = path.join(tmpDir, 'input.bin');
  const output = path.join(tmpDir, `${name}.mp3`);
  try {
    fs.writeFileSync(input, buffer);
    execFileSync(getFfmpegBin(), ['-y', '-i', input, '-af', filter, '-vn', '-b:a', '160k', '-ar', '44100', '-f', 'mp3', output], { stdio: 'ignore', timeout: 120000 });
    const out = fs.readFileSync(output);
    if (!out || out.length < 1024) throw new Error('áudio vazio');
    if (out.length > 16 * 1024 * 1024) throw new Error('áudio muito grande após efeito');
    return out;
  } finally { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {} }
}


/**
 * v6.8: Submenu dinâmico — lê TODOS os comandos da categoria
 * do submenuData e passa para sendStyledCommandList.
 */
async function dynamicSubmenu(sock, msg, ctx, config, category) {
  const sd = require('./submenuData');
  const meta = sd.SUBMENU_META[category];
  if (!meta) return reply(sock, msg, ctx, '❌ Categoria não encontrada.');
  
  // Obter TODOS os comandos registados
  const ch = require('./caseHandler');
  const allCmds = [...ch.CASES.keys()];
  const items = sd.buildItems(allCmds, category);
  
  if (!items.length) return reply(sock, msg, ctx, meta.icon + ' Sem comandos nesta categoria.');
  
  return sendStyledCommandList(sock, msg, ctx, config, {
    title: meta.title,
    subtitle: meta.sub,
    buttonText: meta.btn,
    target: 'menu_' + category,
    items,
  });
}


const stickerPack = require('./stickerPack');
const sendNativeStickerPack = stickerPack.sendNativeStickerPack;

module.exports = {
  // ============ INFO ============
  async start({ sock, msg, ctx, config: cfg }) {
    const localConfig = cfg || config;
    const p = localConfig.bot.prefix;
    const style = await botConfigCache.get('menu_style', 'classic').catch(() => 'classic');
    const st    = menuThemes.getStyle(style);
    const { frame: f, palette: pl } = st;

    // Card de boas-vindas visual
    const card = [
      `${f[0]}${f[4].repeat(8)}〔 ${pl.icon} ${localConfig.bot.name} ${pl.icon} 〕${f[4].repeat(8)}${f[1]}`,
      `${f[5]} ${pl.vibe}`,
      `${f[5]} ${f[4].repeat(30)}`,
      `${f[5]} 👋 Olá, *${ctx.treatment || ctx.pushName}*!`,
      `${f[5]} Eu sou o *${localConfig.bot.name}* 🕸️`,
      `${f[5]} Criado por *${localConfig.owner.name}*`,
      `${f[5]} ${f[4].repeat(30)}`,
      `${f[5]} ${pl.bullet} *${p}menu*     — Menu completo`,
      `${f[5]} ${pl.bullet} *${p}menu*     — Menu interactivo`,
      `${f[5]} ${pl.bullet} *${p}ia* <pergunta> — Perguntar à IA`,
      `${f[5]} ${pl.bullet} *${p}play* <música>  — Baixar música`,
      `${f[5]} ${pl.bullet} *${p}ping*     — Testar latência`,
      `${f[5]} ${pl.bullet} *${p}aiapis*   — Estado da IA`,
      `${f[2]}${f[4].repeat(36)}${f[3]}`,
    ].join('\n');

    await reply(sock, msg, ctx, card);

    // Botões interactivos a seguir
    try {
      await buttonHandler.sendButtons(sock, ctx.remoteJid,
        `${pl.icon} ${localConfig.bot.name}`,
        `${pl.vibe}  ×  ${localConfig.owner.name}`,
        [
          { id: `${p}menu`,  text: '📜 Menu' },
          { id: `${p}ia`,    text: '🧠 IA' },
          { id: `${p}play`,  text: '🎵 Música' },
          { id: `${p}vip`,   text: '⭐ VIP' },
        ],
        msg
      );
    } catch {}

    logCmd('start', ctx);
  },

  // ──────────────────────────────────────────────────────────
  // !menu — Menu completo com todos os comandos do bot
  // Organizado por categoria, rico em símbolos e formatação
  // ──────────────────────────────────────────────────────────
  async menu({ sock, msg, ctx, config: cfg, isOwner }) {
    const localConfig = cfg || config;
    const pe          = require('./prefixEngine');
    const gp          = await pe.getActivePrefix(ctx.remoteJid).catch(() => null);
    const p           = gp || localConfig.bot.prefix;
    const botName     = localConfig.bot.name   || 'DARK BOT';
    const channelUrl  = localConfig.channelUrl || 'https://whatsapp.com/channel/0029VbC8voN4Y9lszc9VuT2D';


    // ── Tema activo — o menu acompanha o !change / !temas ──
    let t = { icon: '🕸️', vibe: 'Dark Engine', bullet: '▸' };
    try { t = await getActiveTheme(ctx.remoteJid); } catch {}

    // ── Reacção com emoji do change activo ──
    await sock.sendMessage(ctx.remoteJid, { react: { text: t.react || t.icon || '🕸️', key: msg.key } }).catch(() => {});

    // ── Dados do utilizador (cargo + VIP) — fonte ÚNICA de verdade ──
    // v6.40: usa roleResolver (👑 Dono > 💎 VIP > 🛡️ Admin > 🆓 Free)
    // Corrige o bug do TDZ: havia um `const User` mais abaixo que sombreava
    // o `User` do topo do ficheiro e rebentava o try → cargo caía sempre em FREE.
    const roleResolver = require('./roleResolver');
    const roleInfo = await roleResolver.resolveRole({ ctx, msg, sock })
      .catch(() => ({ cargo: '🆓 FREE', vip: 'INATIVO ❌', isOwner: false, isVip: false, isAdmin: false, role: 'free' }));

    const isCargo    = roleInfo.cargo;   // 👑 DONO SUPREMO | 💎 VIP | 🛡️ ADMIN | 🆓 FREE
    const isChVip    = roleInfo.vip;     // ATIVO ✅ | INATIVO ❌
    const isOwnerUser = roleInfo.isOwner;
    const isVip       = roleInfo.isVip;
    const isAdminUser = roleInfo.isAdmin;
    const userRole    = roleInfo.role;
    
    // Função para verificar se pode ver o submenu
    function canSee(category) {
      const publicMenus = ['downloads', 'stickers', 'ia', 'jogos', 'economia', 'interacoes', 'zoeira', 'texto', 'search', 'audio', 'info', 'rpg', 'logos'];
      const vipMenus = ['menu18', 'cmdsocultos'];
      const ownerMenus = ['menudono'];
      
      if (publicMenus.includes(category)) return true;
      if (vipMenus.includes(category) && isVip) return true;
      if (ownerMenus.includes(category) && isOwnerUser) return true;
      return false;
    }
    
    // Construir seções dinamicamente
    const secMenusDiversos = [];
    const secExtras = [];
    
    // Menu públicos (todos veem)
    if (canSee('downloads')) secMenusDiversos.push({ header: `${t.icon} ᴅᴏᴡɴʟᴏᴅs`, title: '_música, vídeo, redes sociais._', id: p + 'down' });
    if (canSee('stickers')) secMenusDiversos.push({ header: `${t.icon} ғɪɢᴜʀɴʜᴀs`, title: '_stickers, packs, arte visual._', id: p + 'menufigurinhas' });
    if (canSee('ia')) secMenusDiversos.push({ header: `${t.icon} ɪᴀ & ᴄʜᴀᴛᴏᴛs`, title: '_IA com memória, GPT, Claude._', id: p + 'menuia' });
    if (canSee('jogos')) secMenusDiversos.push({ header: `${t.icon} ᴊᴏᴏs & sᴏᴄɪᴀ`, title: '_quiz, forca, casino, mini-games._', id: p + 'menujogos' });
    if (canSee('economia')) secMenusDiversos.push({ header: `${t.icon} ᴇᴄᴏɴᴏᴍᴀ & ʀɢ`, title: '_coins, bank, RPG, crafting._', id: p + 'menueconomia' });
    if (canSee('interacoes')) secMenusDiversos.push({ header: `${t.icon} ɪɴᴛᴇʀᴀᴄçõᴇs`, title: '_abraçar, beijar, casar, família._', id: p + 'menuinteracoes' });
    if (canSee('zoeira')) secMenusDiversos.push({ header: `${t.icon} ᴢᴏɪʀ & ʀɴᴋ`, title: '_medidores, rankings, brincadeiras._', id: p + 'menuzoeira' });
    if (canSee('texto')) secMenusDiversos.push({ header: `${t.icon} ᴛᴇxᴛᴏ & ғᴏɴᴛᴇs`, title: '_bold, mini, glitch, calc, frases._', id: p + 'menutexto' });
    if (canSee('search')) secMenusDiversos.push({ header: `${t.icon} sᴇᴀʀᴄʜ & sᴛᴀʟ`, title: '_pesquisas, stalk, consultas._', id: p + 'menusearch' });
    
    // Extras
    if (canSee('audio')) secExtras.push({ header: `${t.icon} ᴀᴜᴅɪᴏ & ғᴇᴛᴏs`, title: '_bass, reverb, 8d, slowed, voz._', id: p + 'menuaudio' });
    if (canSee('logos')) secExtras.push({ header: `${t.icon} ʟᴏɢᴏs & ᴇғᴇɪᴛᴏs`, title: '_naruto, rainbow, neon, graffiti._', id: p + 'menulogos' });
    secExtras.push({ header: `${t.icon} ᴀᴅᴍ & ɢʀᴜᴘᴏs`, title: '_moderação, regras, automação._', id: p + 'menuadm' });
    secExtras.push({ header: `${t.icon} ɪɴғᴏ & sᴛᴀᴛs`, title: '_ping, perfil, diagnóstico._', id: p + 'menustatus' });
    if (canSee('rpg')) secExtras.push({ header: `${t.icon} ʀᴘɢ & ᴀᴠᴇɴᴛᴜʀᴀ`, title: '_trabalhar, minerar, explorar._', id: p + 'submenuRPG' });
    
    // VIP menus
    if (canSee('menu18')) secExtras.push({ header: `${t.icon} ᴍᴇɴᴜ+18`, title: '_conteúdo adulto, só VIPs._', id: p + 'menu18' });
    if (canSee('cmdsocultos')) secExtras.push({ header: `${t.icon} ᴄᴍᴅs ᴄᴜʟᴛᴏs`, title: '_comandos secretos._', id: p + 'cmdsocultos' });
    
    // Dono menus
    secExtras.push({ header: `${t.icon} ᴄʀɪᴀᴅᴏʀ`, title: '_informações do criador._', id: p + 'criador' });
    secExtras.push({ header: `${t.icon} ᴠɪᴘ & ᴀʟᴜɢᴀ`, title: '_planos premium e hospedagem._', id: p + 'vip' });
    if (canSee('menudono')) secExtras.push({ header: `${t.icon} ᴅᴏɴᴏ & sʏsᴛᴇᴍ`, title: '_broadcast, eval, config, cases._', id: p + 'menudono' });
    
    // ── Lista de menus (estrutura EXACTA do código de referência, versão DARK) ──
    const listaMenus = {
      title: 'ᴍᴇɴᴜ',
      sections: [
        { title: 'ᴍᴇɴᴜs ᴅɪᴠᴇʀsᴏs ', highlight_label: (botName || 'DARK BOT') + '|DEV', rows: secMenusDiversos },
        { title: 'ғᴜɴᴄ̧ᴏᴇs ᴇxᴛʀᴀs ', highlight_label: (botName || 'DARK BOT') + '|DEV', rows: secExtras },
      ],
    };

    // ── Botões: lista interactiva + canal ──
    const botoes = [
      { name: 'single_select', buttonParamsJson: JSON.stringify(listaMenus) },
      { name: 'cta_url', buttonParamsJson: JSON.stringify({
          display_text: 'ᴄᴀɴᴀʟ',
          url:          channelUrl,
          merchant_url: channelUrl,
      })},
    ];

    // ── Corpo do card — usa o change activo (fonte + personalidade) ──
    const RE = require('./renderEngine');
    const textok = RE.renderMenuCard(t, {
      pushName: ctx.pushName || 'Desconhecido',
      cargo: isCargo,
      vip: isChVip,
      prefix: p,
    }, { botName });

    const footerCard = RE.renderMenuFooter(t, botName);

    // ═══ 1º — CAROUSEL com mídia (vídeo GIF preferido, imagem fallback) ═══
    try {
      const { generateWAMessageFromContent, prepareWAMessageMedia } = require('@systemzero/baileys');
      const fs2  = require('fs');
      const path = require('path');
      const root = path.join(__dirname, '..', '..');

      const caminhoVideo = [
        path.join(root, 'configs', 'LOGOS', 'fotomenu.mp4'),
        path.join(__dirname, '..', 'public', 'img', 'fotomenu.mp4'),
      ].find(f => fs2.existsSync(f));

      let mediaMenu = null;
      if (caminhoVideo) {
        // Comprime o vídeo antes de enviar (reduz tamanho, mantém qualidade)
        const videoBuffer = fs2.readFileSync(caminhoVideo);
        const compressedVideo = compressVideoForGif(videoBuffer, 'mp4');
        // Salva o vídeo comprimido temporariamente
        const tmpCompressed = path.join(os.tmpdir(), `menu-compressed-${Date.now()}.mp4`);
        fs2.writeFileSync(tmpCompressed, compressedVideo);
        try {
          mediaMenu = await prepareWAMessageMedia(
            { video: { url: tmpCompressed }, mimetype: 'video/mp4', gifPlayback: true, seconds: 8 },
            { upload: sock.waUploadToServer }
          );
        } finally {
          try { fs2.unlinkSync(tmpCompressed); } catch {}
        }
      } else {
        const caminhoImagem = [
          path.join(root, 'configs', 'LOGOS', 'fotomenu.png'),
          path.join(root, 'configs', 'LOGOS', 'fotomenu.jpg'),
          path.join(__dirname, '..', 'public', 'img', 'logo.jpg'),
        ].find(f => fs2.existsSync(f));
        if (caminhoImagem) {
          mediaMenu = await prepareWAMessageMedia(
            { image: { url: caminhoImagem } },
            { upload: sock.waUploadToServer }
          );
        }
      }

      const cardHeader = mediaMenu?.videoMessage
        ? { hasMediaAttachment: true, videoMessage: mediaMenu.videoMessage }
        : mediaMenu?.imageMessage
          ? { hasMediaAttachment: true, imageMessage: mediaMenu.imageMessage }
          : { hasMediaAttachment: false };

      const carouselMessage = {
        cards: [{
          header: cardHeader,
          headerType: mediaMenu?.videoMessage ? 'VIDEO' : 'IMAGE',
          body:   { text: textok },
          footer: { text: footerCard },
          nativeFlowMessage: { buttons: botoes },
        }],
      };

      const msgObj = generateWAMessageFromContent(ctx.remoteJid, {
        interactiveMessage: {
          contextInfo: {
            participant:   ctx.senderJid,
            quotedMessage: { conversation: '░⃟⃛🕸️ ᴍᴇɴᴜ 🕸️' },
          },
          body: { text: '*ᴍᴇɴᴜ*' },
          carouselMessage,
        },
      }, { userJid: sock.user && sock.user.id });

      // additionalNodes: converte o carousel em botões reais nos clientes novos
      await sock.relayMessage(ctx.remoteJid, msgObj.message, {
        messageId: msgObj.key.id,
        additionalNodes: [
          {
            tag: 'biz', attrs: {},
            content: [{
              tag: 'interactive', attrs: { type: 'native_flow', v: '1' },
              content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }],
            }],
          },
        ],
      });
      logCmd('menu', ctx);
      return;
    } catch (error) {
      console.error('Erro menu carousel:', (error.message || '').slice(0, 120));
    }

    // ═══ 2º Fallback — lista interactiva ═══
    try {
      await buttonHandler.sendList(
        sock, ctx.remoteJid,
        t.icon + ' ' + botName,
        textok,
        t.icon + ' Abrir',
        listaMenus.sections,
        msg
      );
      logCmd('menu', ctx);
      return;
    } catch {}

    // ═══ 3º Fallback — texto rico (sempre funciona) ═══
    try {
      const style      = await botConfigCache.get('menu_style', '0').catch(() => '0');
      const showPrefix = await botConfigCache.get('menu_show_prefix', false).catch(() => false);
      const uptime     = formatUptime(Date.now() - startTime);
      const menuText   = menuThemes.renderMainMenu({
        ctx: Object.assign({}, ctx, { isOwner }),
        config: localConfig,
        stats:  { uptime },
        style,
        showPrefix: showPrefix === true || showPrefix === 'true' || showPrefix === 'on',
      });
      await reply(sock, msg, ctx, menuText);
      logCmd('menu', ctx);
    } catch (e2) {
      await reply(sock, msg, ctx, t.icon + ' *ᴍᴇɴᴜ*\n\nErro ao montar o menu: ' + String(e2.message || '').slice(0, 80));
    }
  },

 async menudono({ sock, msg, ctx, config, isOwner }) {
    if (!isOwner) return reply(sock, msg, ctx, '🚫 Só o Dono.');
    const text = `╔══ ˚₊‧ 👑 ᴅᴀʀᴋ ᴏᴡɴᴇʀ ‧₊˚ ══╗
║
║ *TRAPAÇAS (CHEATS)* 😈
║ ▹ godmode ⌁ winforca
║ ▹ winquiz ⌁ winadivinha
║ ▹ forjar @user <msg>
║ ▹ simular @user <cmd>
║
║ *TRAVAS SEGURAS DO BOT* 🛡️
║ ▹ trava1 ⌁ trava2
║ ▹ trava3 ⌁ bomb
║ _simulações/diagnóstico — só dono_
║
║ *CONTROLE DO SISTEMA* 🖥️
║ ▹ panel ⌁ stats ⌁ restart
║ ▹ autodecrypt ⌁ prefixos
║ ▹ broadcast ⌁ send
║ ▹ fbpost ⌁ fbfoto ⌁ fbvideo
║ ▹ fbstory ⌁ fbstatus
║ ▹ blacklist ⌁ unblacklist
║ ▹ espiao ⌁ antidelete
║ ▹ eval ⌁ shell
║ ▹ cmdsocultos ⌁ portal18
║
╚══════════════════════╝`;
    return reply(sock, msg, ctx, text);
  },

  async figubug({ sock, msg, ctx, config }) {
    // Stickers de alta qualidade com metadados pesados
    const m = msg.message;
    const quoted = m?.extendedTextMessage?.contextInfo?.quotedMessage;
    const srcMsg = (m?.imageMessage || m?.videoMessage) ? msg : (quoted?.imageMessage || quoted?.videoMessage) ? { message: quoted } : null;

    if (!srcMsg) return reply(sock, msg, ctx, '👾 Envie mídia com *!figubug* para gerar um sticker lendário.');

    await react(sock, msg, '👾');
    try {
      const buffer = await mediaHandler.downloadFromMessage(srcMsg);
      const isAnimated = !!(srcMsg.message?.videoMessage || quoted?.videoMessage);
      
      const stk = await stickerMaker.create(buffer, {
        botName: "LENDÁRIO BUG",
        ownerName: config.owner.name || "Dark Net",
        userName: ctx.pushName,
        groupName: "DARK BUG",
        isVideo: isAnimated,
        ...(await getStickerWatermarkConfig(config, ctx)),
      });

      // Envia como sticker mas com flag de visualização única as vezes ou alta prioridade
      await sock.sendMessage(ctx.remoteJid, { sticker: stk });
      await react(sock, msg, '✨');
    } catch (e) {
      await react(sock, msg, '❌');
      return reply(sock, msg, ctx, `❌ ${e.message}`);
    }
  },

  async figubug2({ sock, msg, ctx, args, config }) {
    const prompt = args.join(' ').trim() || `DARK BOT logo sticker, cyberpunk purple neon, ${ctx.pushName}`;
    await react(sock, msg, '🎨');
    try {
      const img = await ai.generateImage(prompt);
      const stk = await stickerMaker.create(img, {
        botName: config.bot.name,
        ownerName: 'DARK BOT 🕸️',
        userName: ctx.pushName,
        groupName: ctx.groupName || 'PV',
        isVideo: false,
        ...(await getStickerWatermarkConfig(config, ctx)),
      });
      await sock.sendMessage(ctx.remoteJid, { sticker: stk });
      await react(sock, msg, '✅');
    } catch (e) {
      await react(sock, msg, '❌');
      return reply(sock, msg, ctx, '❌ figubug2 falhou: ' + e.message);
    }
  },

  // ══════════════════════════════════════════════════════════════════════
  // !menu — Carousel interactivo com @systemzero/baileys
  // Formato idêntico ao código original do repositório:
  //   Carousel com card (vídeo/imagem) + single_select + cta_url canal
  // ══════════════════════════════════════════════════════════════════════


  async menudownload(a) { return dynamicSubmenu(a.sock, a.msg, a.ctx, a.cfg || a.config, 'downloads'); },

  // ── !menup — Menu Principal ──────────────────────────────────────────


  // ── !down — Menu Downloads (alias de menudownload) ────────────────
  async down(a) { return module.exports.menudownload(a); },

  // ── !menufigurinhas — Menu Stickers ──────────────────────────────
  async menufigurinhas(a) { return module.exports.menustickers(a); },

  // ── !brincadeiras — Menu Diversão + Interações ───────────────────
  async brincadeiras({ sock, msg, ctx, config: cfg }) {
    const localConfig = cfg || config;
    return sendStyledCommandList(sock, msg, ctx, localConfig, {
      title: '🕸️ BRINCADEIRAS & DIVERSÃO', target: 'brincadeiras',
      subtitle: 'Diversão, zoeira e interações para grupo.',
      buttonText: '🕸️ Abrir',
      items: [
        { cmd: 'dado',      emoji: '🎲', desc: 'jogar dado' },
        { cmd: 'moeda',     emoji: '🪙', desc: 'cara ou coroa' },
        { cmd: 'piada',     emoji: '😂', desc: 'piada aleatória' },
        { cmd: 'frase',     emoji: '💭', desc: 'frase motivacional' },
        { cmd: 'ppt',       emoji: '🎮', desc: 'pedra papel tesoura' },
        { cmd: 'gay',       emoji: '🏳️‍🌈', desc: 'medidor gay' },
        { cmd: 'lindo',     emoji: '✨', desc: 'medidor de beleza' },
        { cmd: 'feio',      emoji: '🥶', desc: 'medidor de feiúra' },
        { cmd: 'rico',      emoji: '💰', desc: 'medidor de riqueza' },
        { cmd: 'corno',     emoji: '🦌', desc: 'medidor cornudo' },
        { cmd: 'safado',    emoji: '😏', desc: 'medidor safadeza' },
        { cmd: 'ship',      emoji: '💕', desc: 'combinar duas pessoas' },
        { cmd: 'casal',     emoji: '👫', desc: 'casal do grupo' },
        { cmd: 'roleta',    emoji: '🎰', desc: 'roleta do grupo' },
        { cmd: 'verdade',   emoji: '❓', desc: 'verdade ou desafio' },
        { cmd: 'desafio',   emoji: '🔥', desc: 'desafio aleatório' },
        { cmd: 'horoscopo', emoji: '🔮', desc: 'horóscopo do signo' },
        { cmd: 'abracar',   emoji: '🤗', desc: 'abraçar @alguém' },
        { cmd: 'beijar',    emoji: '💋', desc: 'beijar @alguém' },
        { cmd: 'tapa',      emoji: '👋', desc: 'dar tapa @alguém' },
        { cmd: 'soco',      emoji: '👊', desc: 'dar soco @alguém' },
        { cmd: 'dancar',    emoji: '💃', desc: 'dançar @alguém' },
        { cmd: 'aura',      emoji: '⚡', desc: 'activar aura' },
      ],
    });
  },

  // ── !menucoins — Economia Dark Bank ──────────────────────────────
  async menucoins(a) { return module.exports.menueconomia(a); },

  // ── !alteradores — Efeitos de Áudio ──────────────────────────────
  async alteradores({ sock, msg, ctx, config: cfg }) {
    const localConfig = cfg || config;
    return sendStyledCommandList(sock, msg, ctx, localConfig, {
      title: '🕸️ ALTERADORES DE ÁUDIO', target: 'alteradores',
      subtitle: 'Efeitos de áudio para transformar músicas.',
      buttonText: '🕸️ Escolher efeito',
      items: [
        { cmd: 'bass',        emoji: '🔊', desc: 'grave intenso' },
        { cmd: 'reverb',      emoji: '🌀', desc: 'eco e reverb' },
        { cmd: '8d',          emoji: '🎧', desc: 'áudio 8D' },
        { cmd: 'slowed',      emoji: '🐢', desc: 'slowed' },
        { cmd: 'slowedreverb',emoji: '🌊', desc: 'slowed + reverb' },
        { cmd: 'nightcore',   emoji: '⚡', desc: 'nightcore' },
        { cmd: 'vaporwave',   emoji: '🌸', desc: 'vaporwave' },
        { cmd: 'robot',       emoji: '🤖', desc: 'voz de robô' },
        { cmd: 'chipmunk',    emoji: '🐿️', desc: 'voz chipmunk' },
        { cmd: 'echo',        emoji: '📢', desc: 'eco' },
        { cmd: 'lofi',        emoji: '📻', desc: 'lo-fi' },
        { cmd: 'karaoke',     emoji: '🎤', desc: 'karaoke' },
        { cmd: 'reverse',     emoji: '🔄', desc: 'ao contrário' },
        { cmd: 'fast',        emoji: '⏩', desc: 'acelerado' },
        { cmd: 'slow',        emoji: '⏪', desc: 'lento' },
        { cmd: 'deep',        emoji: '🎵', desc: 'voz grave' },
        { cmd: 'menuaudio',   emoji: '🎛️', desc: 'todos os efeitos' },
      ],
    });
  },

  // ── !menulogos — Stickers e Imagens ──────────────────────────────
  async menulogos({ sock, msg, ctx, config: cfg }) {
    const localConfig = cfg || config;
    return sendStyledCommandList(sock, msg, ctx, localConfig, {
      title: '🕸️ LOGOS & IMAGENS', target: 'menulogos',
      subtitle: 'Criação de stickers, logos e imagens.',
      buttonText: '🕸️ Criar',
      items: [
        { cmd: 'sticker',  emoji: '🎨', desc: 'foto → sticker' },
        { cmd: 'sfull',    emoji: '🖼️', desc: 'sticker sem cortar' },
        { cmd: 'figubug',  emoji: '👾', desc: 'sticker lendário' },
        { cmd: 'figubug2', emoji: '✨', desc: 'sticker com IA' },
        { cmd: 'toimg',    emoji: '🖼️', desc: 'sticker → imagem' },
        { cmd: 'attp',     emoji: '✍️', desc: 'texto animado' },
        { cmd: 'ttp',      emoji: '📝', desc: 'texto em sticker' },
        { cmd: 'imagem',   emoji: '🎨', desc: 'gerar imagem com IA' },
        { cmd: 'figura',   emoji: '✨', desc: 'imagem IA → sticker' },
        { cmd: 'gimage',   emoji: '🔍', desc: 'busca imagens Google' },
        { cmd: 'pinterest',emoji: '📌', desc: 'imagens Pinterest' },
        { cmd: 'pinpacks', emoji: '📌', desc: 'packs de stickers' },
        { cmd: 'stickerrename',emoji:'💧',desc:'renomear sticker' },
        { cmd: 'pack',         emoji:'📦',desc:'configurar pack (nome/autor/link)' },
        { cmd: 'naruto',       emoji:'🍥',desc:'logo estilo Naruto' },
        { cmd: 'neon',         emoji:'💡',desc:'logo neon' },
        { cmd: 'rainbow',      emoji:'🌈',desc:'logo arco-íris' },
        { cmd: 'graffiti',     emoji:'🎨',desc:'logo graffiti' },
        { cmd: 'fire',         emoji:'🔥',desc:'logo em fogo' },
        { cmd: 'water',        emoji:'💧',desc:'logo água' },
        { cmd: 'gold',         emoji:'🥇',desc:'logo dourado' },
        { cmd: 'galaxy',       emoji:'🌌',desc:'logo galáxia' },
        { cmd: 'retro',        emoji:'📼',desc:'logo retro' },
        { cmd: 'halloween',    emoji:'🎃',desc:'logo halloween' },
        { cmd: 'harrypotter',  emoji:'⚡',desc:'logo Harry Potter' },
        { cmd: 'blackpink',    emoji:'💗',desc:'logo Blackpink' },
        { cmd: 'pubg',         emoji:'🎖️',desc:'logo PUBG' },
        { cmd: 'avengers',     emoji:'🛡️',desc:'logo Avengers' },
        { cmd: 'pixel',        emoji:'👾',desc:'logo pixelado' },
        { cmd: 'typography',   emoji:'🔤',desc:'logo tipografia' },
        { cmd: 'lava',         emoji:'🌋',desc:'logo lava' },
        { cmd: 'candy',        emoji:'🍬',desc:'logo candy' },
        { cmd: 'techstyle',    emoji:'💻',desc:'logo tech/cyber' },
      ],
    });
  },

  // ── !menu18 — Portal 18+ (só VIP) ───────────────────────────────
  async menu18({ sock, msg, ctx, config: cfg }) {
    const localConfig = cfg || config;
    const p = localConfig.bot.prefix;
    const u = await User.findOne({ whatsappNumber: ctx.senderNumber }).catch(() => null);
    const isVip = u && u.isPremium && u.isPremium();
    const isPrimaryOwner = ctx.senderNumber === String(localConfig.owner.number || '').replace(/\D/g, '');

    if (!isVip && !ctx.isOwner) {
      const RE = require('./renderEngine');
      const t = await RE.getTheme(ctx.remoteJid);
      return reply(sock, msg, ctx, RE.renderBlock(t, '🔞 MENU +18', [
        '⚠️ *Conteúdo exclusivo para VIPs*',
        '',
        '⭐ Acede com *' + p + 'vip*',
        '📲 Ou contacta: wa.me/' + String(localConfig.owner.number || '').replace(/\D/g, ''),
      ], { botName: localConfig.bot.name }));
    }

    const RE = require('./renderEngine');
    const t = await RE.getTheme(ctx.remoteJid);
    const menuText = RE.renderBlock(t, '🔞 PORTAL 18+ COMPLETO', [
      // v6.48: o menu prometia mais do que entregava — duas correcções.
      // (1) Anunciava 9 comandos INEXISTENTES (nekos, yande, kona, e621,
      //     xvideodl, livro, fig18, pack18, adultstats): quem os
      //     escrevesse levava "comando não encontrado". Removidos.
      // (2) Dizia "exclusivo VIP/Dono" e abria para VIP, mas 8 dos 10
      //     comandos têm isPrimaryOwnerOnly() — o VIP via a lista e
      //     nada funcionava. Agora cada linha diz quem pode usar.
      isPrimaryOwner
        ? '👑 *Acesso total — Dono Supremo*'
        : '⚠️ *Como VIP tens acesso limitado.* Os itens marcados 👑 são só do Dono.',
      '',
      '📸 *IMAGENS ADULTAS*',
      '👑 ' + p + 'hentai [tags] — anime adulto aleatório',
      '👑 ' + p + 'ximg [tags] — busca por tags específicas',
      '👑 ' + p + 'adultsearch [t] — busca multi-fonte',
      // v6.49: reposto — as funções já existiam no portal18.js e
      // entregam imagens reais; só faltavam os comandos que as chamam.
      '👑 ' + p + 'yande [tags] — yande.re, alta resolução',
      '👑 ' + p + 'kona [tags] — konachan.com',
      '👑 ' + p + 'e621 [tags] — e621.net (imagem/gif/webm)',
      '👑 ' + p + 'nekos [tipo] — nekos.life',
      '💎 ' + p + 'erome <nome> — busca erome.com',
      '💎 ' + p + 'erome <nome> <qtd> — com quantidade',
      '💎 ' + p + 'eromevid <nome> — vídeos erome',
      '',
      '🎬 *VÍDEOS*',
      '👑 ' + p + 'xvideo [termo] — busca vídeo adulto',
      '👑 ' + p + 'adultvideo [termo] — fonte alternativa',
      '👑 ' + p + 'xvideodl <url> — baixa vídeo de um link',
      '',
      // v6.50: implementados — usam portal18 → fetchBuffer → stickerMaker
      // v6.51: busca por nome, GIFs animados e figurinhas animadas
      '🔎 *BUSCA POR NOME*',
      '👑 ' + p + 'buscar18 <nome> — procura personagem/tema',
      '👑 ' + p + 'figbusca <nome> — figurinha desse nome',
      '👑 ' + p + 'packbusca <nome> [qtd] — pack desse nome',
      '',
      '🎞️ *GIFs & SHORTS*',
      '👑 ' + p + 'gif18 [tipo] — GIF animado 18+',
      '👑 ' + p + 'shorts18 [nome] — vídeos curtos animados',
      '',
      '🎭 *FIGURINHAS 18+*',
      '👑 ' + p + 'fig18 [tags] — figurinha 18+',
      '👑 ' + p + 'pack18 [tags] [qtd] — pack até 8 figurinhas',
      '👑 ' + p + 'figgif [tipo] — figurinha ANIMADA',
      '💎 ' + p + 'sly <nome> — sticker.ly adulto',
      '💎 ' + p + 'slypack <nome> — pack sticker.ly',
      '💎 ' + p + 'packname <nome> — pack por nome',
      '💎 ' + p + 'takepack <id> — baixa pack por ID',
      '',
      '💬 *CHAT HOT COM IA*',
      '👑 ' + p + 'hotchat [tema] — chat sensual',
      '👑 ' + p + 'hotchat [t] picante — mais ousado',
      '👑 ' + p + 'hotchat [t] conto — conto erótico',
      '👑 ' + p + 'hotchat [t] roleplay — roleplay',
      '',
      '📚 *LIVROS*',
      '👑 ' + p + 'buscalivro [nome] — busca livros',
      '👑 ' + p + 'livros18 — top livros 18+',
      '',
      '⚙️ *CONTROLO (só Dono)*',
      '👑 ' + p + 'adultmode on/off — liga/desliga o portal',
      '👑 ' + p + 'adultapi <url> — configura API de vídeo',
      '👑 ' + p + 'adultstats — estado do portal e das fontes',
      '',
      '> 👑 = só Dono   💎 = VIP e Dono',
      '> ⚠️ O portal tem de estar ON (' + p + 'adultmode on)',
      '> 🔞 Conteúdo enviado no PV por segurança',
    ], { botName: localConfig.bot.name });

    // PV robusto: tenta múltiplos formatos de JID
    const pvJids = [
      ctx.senderJid,
      ctx.senderNumber + '@s.whatsapp.net',
      ctx.senderNumber.replace(/\D/g, '') + '@s.whatsapp.net',
    ];

    let pvSent = false;
    for (const jid of pvJids) {
      try {
        await sock.sendMessage(jid, { text: menuText });
        pvSent = true;
        // v6.52: memoriza o JID que funcionou — os outros comandos 18+
        // (ownerPv) passam a usá-lo em vez de o construir do .env.
        portal18.setOwnerJid(jid);
        break;
      } catch {}
    }

    if (pvSent) {
      await sock.sendMessage(ctx.remoteJid, {
        text: '🔞 *Menu 18+ enviado no teu PV!*\n📬 Verifica as tuas mensagens privadas.',
        mentions: [ctx.senderJid],
      }, { quoted: msg });
    } else if (isPrimaryOwner) {
      await reply(sock, msg, ctx, menuText);
    } else {
      await reply(sock, msg, ctx, '❌ Não consegui enviar no PV.\n💡 Abre o chat comigo primeiro e tenta de novo!');
    }
  },

  // ── !menuadm — Menu ADM de grupo ─────────────────────────────────
  async menuadm(a) { return module.exports.menugrupo(a); },

  // ── !criador — Informações do criador ────────────────────────────
  async criador({ sock, msg, ctx, config: cfg }) {
    const localConfig = cfg || config;
    const RE = require('./renderEngine');
    const t = await RE.getTheme(ctx.remoteJid);
    const num = localConfig.owner.number;
    const waLink = 'https://wa.me/' + num;
    const channelUrl = localConfig.channelUrl || 'https://whatsapp.com/channel/0029VbC8voN4Y9lszc9VuT2D';

    const { generateWAMessageFromContent, proto, prepareWAMessageMedia } = require('@systemzero/baileys');
    let headerMedia = null;
    try {
      const fs2 = require('fs');
      const path = require('path');
      const imgPath = path.join(__dirname, '..', 'public', 'img', 'logo.jpg');
      if (fs2.existsSync(imgPath)) {
        const imgBuf = fs2.readFileSync(imgPath);
        const media = await prepareWAMessageMedia({ image: imgBuf }, { upload: sock.waUploadToServer });
        headerMedia = media?.imageMessage;
      }
    } catch {}

    const body = RE.renderBlock(t, 'CRIADOR', [
      '\uD83D\uDC51 *Nome:* ' + localConfig.owner.name,
      '\uD83E\uDD16 *Bot:* ' + localConfig.bot.name,
      '\uD83D\uDCBB *Role:* Dono & Desenvolvedor',
      '',
      '\uD83D\uDCF1 *WhatsApp:* wa.me/' + num,
      '\uD83D\uDCE2 *Canal:* WhatsApp Channel',
      '',
      '> ' + (t.vibe || 'Dark Engine'),
    ], { botName: localConfig.bot.name });

    const msgContent = {
      interactiveMessage: proto.Message.InteractiveMessage.fromObject({
        header: headerMedia
          ? proto.Message.InteractiveMessage.Header.fromObject({ hasMediaAttachment: true, imageMessage: headerMedia })
          : proto.Message.InteractiveMessage.Header.fromObject({ hasMediaAttachment: false, title: '\uD83D\uDC51 ' + localConfig.owner.name }),
        body: proto.Message.InteractiveMessage.Body.fromObject({ text: body }),
        footer: proto.Message.InteractiveMessage.Footer.fromObject({ text: (t.icon || '\uD83D\uDD78\uFE0F') + ' ' + localConfig.bot.name }),
        nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
          buttons: [
            { name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: '\uD83D\uDCF1 WhatsApp', url: waLink, merchant_url: waLink }) },
            { name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: '\uD83D\uDCE2 Canal', url: channelUrl, merchant_url: channelUrl }) },
          ],
        }),
      }),
    };

    try {
      const m = generateWAMessageFromContent(ctx.remoteJid, msgContent, { userJid: sock.user?.id, quoted: msg });
      await sock.relayMessage(ctx.remoteJid, m.message, {
        messageId: m.key.id,
        additionalNodes: [{ tag: 'biz', attrs: {}, content: [{ tag: 'interactive', attrs: { type: 'native_flow', v: '1' }, content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }] }] }],
      });
    } catch {
      await reply(sock, msg, ctx, body);
    }
  },


    async menujogos({ sock, msg, ctx, config }) {
    return sendStyledCommandList(sock, msg, ctx, config, {
      title: '🎮 JOGOS & SOCIAL', target: 'menujogos', subtitle: 'Diversão, quiz e economia para membros.', buttonText: '🎮 Escolher jogo',
      items: [
        { cmd: 'quiz', emoji: '🧠', desc: 'pergunta infinita' },
        { cmd: 'resp', args: 'resposta', emoji: '✅', desc: 'responder quiz' },
        { cmd: 'forca', emoji: '🔤', desc: 'jogo da forca' },
        { cmd: 'adivinha', emoji: '🎯', desc: 'adivinhar número' },
        { cmd: 'blackjack', args: '100', emoji: '🃏', desc: 'aposta blackjack' },
        { cmd: 'truco', args: '1', emoji: '🃏', desc: 'truco com aposta' },
        { cmd: 'russa', emoji: '🔫', desc: 'roleta russa' },
        { cmd: 'verdade', emoji: '❓', desc: 'verdade' },
        { cmd: 'desafio', emoji: '🔥', desc: 'desafio' },
        { cmd: 'saldo', emoji: '💰', desc: 'ver moedas' },
        { cmd: 'daily', emoji: '🎁', desc: 'recompensa diária' },
        { cmd: 'familia', emoji: '👨‍👩‍👧', desc: 'ver família' },
      ],
    });
  },

  // ── !menueconomia / !menucoins ────────────────────────────────────────
  async menueconomia({ sock, msg, ctx, config: cfg }) {
    return sendStyledCommandList(sock, msg, ctx, cfg || config, {
      title: '💰 ECONOMIA & AURA', target: 'menueconomia',
      subtitle: 'Coins • Bank • Loja • Ranking',
      buttonText: '💰 Selecionar',
      items: [
        { cmd: 'saldo',      emoji: '💰', desc: 'Ver saldo de coins' },
        { cmd: 'daily',      emoji: '🎁', desc: 'Recompensa diária' },
        { cmd: 'trabalhar',  emoji: '💼', desc: 'Trabalhar para ganhar coins' },
        { cmd: 'crime',      emoji: '🔫', desc: 'Cometer um crime (risco)' },
        { cmd: 'roubar',     emoji: '💸', desc: 'Roubar coins de alguém' },
        { cmd: 'depositar',  emoji: '🏦', desc: 'Depositar no banco' },
        { cmd: 'sacar',      emoji: '💵', desc: 'Sacar do banco' },
        { cmd: 'transferir', emoji: '↔️', desc: 'Transferir para outro user' },
        { cmd: 'apostar',    emoji: '🎲', desc: 'Apostar coins' },
        { cmd: 'loja',       emoji: '🏪', desc: 'Ver itens da loja' },
        { cmd: 'comprar',    emoji: '🛒', desc: 'Comprar item da loja' },
        { cmd: 'inventario', emoji: '🎒', desc: 'Ver inventário' },
        { cmd: 'ranking',    emoji: '🏆', desc: 'Ranking do grupo' },
        { cmd: 'rank',       emoji: '⚡', desc: 'Ranking de aura' },
        { cmd: 'rankcoins',  emoji: '💰', desc: 'Ranking de coins' },
        { cmd: 'aura',       emoji: '⚡', desc: 'Activar aura (+energia)' },
        { cmd: 'heal',       emoji: '💊', desc: 'Recuperar HP' },
      ],
    });
  },

  // ── !menufamilia ──────────────────────────────────────────────────────
  // ── !menuinteracoes ───────────────────────────────────────────────────
  async menuinteracoes({ sock, msg, ctx, config: cfg }) {
    return sendStyledCommandList(sock, msg, ctx, cfg || config, {
      title: '💕 INTERAÇÕES & FAMÍLIA', target: 'menuinteracoes',
      subtitle: 'Abraçar • Beijar • Casar • Família',
      buttonText: '💕 Selecionar',
      items: [
        { cmd: 'abracar',   emoji: '🤗', desc: 'Abraçar @alguém' },
        { cmd: 'beijar',    emoji: '💋', desc: 'Beijar @alguém' },
        { cmd: 'cafune',    emoji: '🥰', desc: 'Fazer cafuné em @alguém' },
        { cmd: 'declarar',  emoji: '💌', desc: 'Declarar amor a @alguém' },
        { cmd: 'flertar',   emoji: '😏', desc: 'Flertar com @alguém' },
        { cmd: 'dancar',    emoji: '💃', desc: 'Dançar com @alguém' },
        { cmd: 'tapa',      emoji: '👋', desc: 'Dar tapa em @alguém' },
        { cmd: 'soco',      emoji: '👊', desc: 'Socar @alguém' },
        { cmd: 'chutar',    emoji: '🦵', desc: 'Chutar @alguém' },
        { cmd: 'morder',    emoji: '🦷', desc: 'Morder @alguém' },
        { cmd: 'empurrar',  emoji: '🫷', desc: 'Empurrar @alguém' },
        { cmd: 'matar',     emoji: '💀', desc: 'Matar @alguém (zoeira)' },
        { cmd: 'aura',      emoji: '⚡', desc: 'Ver minha aura' },
        { cmd: 'cafe',      emoji: '☕', desc: 'Oferecer café a @alguém' },
        { cmd: 'casar',     emoji: '💍', desc: 'Pedir casamento' },
        { cmd: 'divorciar', emoji: '💔', desc: 'Pedir divórcio' },
        { cmd: 'adotar',    emoji: '👶', desc: 'Adotar @alguém' },
        { cmd: 'familia',   emoji: '👨‍👩‍👧', desc: 'Ver família' },
      ],
    });
  },

  async menufamilia({ sock, msg, ctx, config: cfg }) {
    return sendStyledCommandList(sock, msg, ctx, cfg || config, {
      title: '👨‍👩‍👧 FAMÍLIA', target: 'menufamilia',
      subtitle: 'Casamento • Família • Laços',
      buttonText: '👨‍👩‍👧 Selecionar',
      items: [
        { cmd: 'casar',     emoji: '💍', desc: 'Pedir casamento a @alguém' },
        { cmd: 'aceitar',   emoji: '✅', desc: 'Aceitar pedido de casamento' },
        { cmd: 'recusar',   emoji: '❌', desc: 'Recusar pedido' },
        { cmd: 'divorciar', emoji: '💔', desc: 'Pedir divórcio' },
        { cmd: 'esposa',    emoji: '👰', desc: 'Ver cônjuge' },
        { cmd: 'adotar',    emoji: '👶', desc: 'Adotar @alguém como filho' },
        { cmd: 'expulsar',  emoji: '🚪', desc: 'Expulsar filho da família' },
        { cmd: 'familia',   emoji: '👨‍👩‍👧', desc: 'Ver árvore familiar' },
      ],
    });
  },

  // ── !menudiversao ─────────────────────────────────────────────────────
  async menudiversao({ sock, msg, ctx, config: cfg }) {
    return sendStyledCommandList(sock, msg, ctx, cfg || config, {
      title: '😂 DIVERSÃO & ZOEIRA', target: 'menudiversao',
      subtitle: 'Medidores • Brincadeiras • Interações',
      buttonText: '😂 Selecionar',
      items: [
        { cmd: 'dado',      emoji: '🎲', desc: 'Jogar dado' },
        { cmd: 'moeda',     emoji: '🪙', desc: 'Cara ou coroa' },
        { cmd: 'piada',     emoji: '😂', desc: 'Piada aleatória' },
        { cmd: 'frase',     emoji: '💭', desc: 'Frase do dia' },
        { cmd: 'ppt',       emoji: '🎮', desc: 'Pedra papel tesoura' },
        { cmd: 'gay',       emoji: '🏳️‍🌈', desc: 'Medidor gay' },
        { cmd: 'lindo',     emoji: '✨', desc: 'Medidor de beleza' },
        { cmd: 'feio',      emoji: '🥶', desc: 'Medidor de feiúra' },
        { cmd: 'rico',      emoji: '💰', desc: 'Medidor de riqueza' },
        { cmd: 'corno',     emoji: '🦌', desc: 'Medidor cornudo' },
        { cmd: 'safado',    emoji: '🔥', desc: 'Medidor de safadeza' },
        { cmd: 'ship',      emoji: '💕', desc: 'Combinar dois utilizadores' },
        { cmd: 'casal',     emoji: '👫', desc: 'Casal do grupo' },
        { cmd: 'roleta',    emoji: '🎰', desc: 'Roleta aleatória' },
        { cmd: 'verdade',   emoji: '❓', desc: 'Verdade ou desafio' },
        { cmd: 'horoscopo', emoji: '🔮', desc: 'Horóscopo do signo' },
        { cmd: 'fofocar',   emoji: '🗣️', desc: 'Fofocar sobre alguém' },
        { cmd: 'aura',      emoji: '⚡', desc: 'Activar aura' },
        { cmd: 'abracar',   emoji: '🤗', desc: 'Abraçar @alguém' },
        { cmd: 'beijar',    emoji: '💋', desc: 'Beijar @alguém' },
        { cmd: 'dancar',    emoji: '💃', desc: 'Dançar' },
      ],
    });
  },



  async menuia({ sock, msg, ctx, config: cfg }) {
    return sendStyledCommandList(sock, msg, ctx, cfg || config, {
      title: '🧠 IA & WEB', target: 'menuia',
      subtitle: 'Inteligência Artificial com Memória',
      buttonText: '🧠 Selecionar',
      items: [
        { cmd: 'ia',        emoji: '🧠', desc: 'Chat com IA (tem memória de ti!)' },
        { cmd: 'gpt',       emoji: '🤖', desc: 'Alias da IA' },
        { cmd: 'deepsearch',emoji: '🔍', desc: 'Pesquisa online aprofundada' },
        { cmd: 'pesquisar', emoji: '🔎', desc: 'Pesquisa rápida na web' },
        { cmd: 'noticias',  emoji: '📰', desc: 'Notícias actualizadas do dia' },
        { cmd: 'resumir',   emoji: '📝', desc: 'Resume textos ou mensagens' },
        { cmd: 'imagem',    emoji: '🎨', desc: 'Gerar imagem com IA' },
        { cmd: 'figura',    emoji: '✨', desc: 'Imagem IA → sticker' },
        { cmd: 'figubug2',  emoji: '👾', desc: 'Sticker IA lendário' },
        { cmd: 'aimemoria', emoji: '🧬', desc: 'Ver o que a IA sabe de ti' },
        { cmd: 'airesetar', emoji: '🗑️', desc: 'Apagar memória da IA' },
        { cmd: 'aiapis',    emoji: '🔌', desc: 'Estado das APIs de IA' },
      ],
    });
  },

  async menustickers(a) { return dynamicSubmenu(a.sock, a.msg, a.ctx, a.cfg || a.config, 'stickers'); },

  async menugrupo({ sock, msg, ctx, config: cfg }) {
    return sendStyledCommandList(sock, msg, ctx, cfg || config, {
      title: '👥 ADM & GRUPOS', target: 'menugrupo',
      subtitle: 'Moderação • Regras • Automação',
      buttonText: '👥 Selecionar',
      items: [
        // selectable: false → precisa de @menção ou mensagem citada (não funciona directamente da lista)
        { cmd: 'ban',          emoji: '🚫', desc: 'Banir @membro',                selectable: false },
        { cmd: 'kick',         emoji: '🦶', desc: 'Expulsar @membro',             selectable: false },
        { cmd: 'promote',      emoji: '👑', desc: 'Promover @membro a admin',     selectable: false },
        { cmd: 'demote',       emoji: '⬇️', desc: 'Remover admin @membro',       selectable: false },
        { cmd: 'add',          emoji: '➕', desc: 'Adicionar número',              selectable: false },
        { cmd: 'tempban',      emoji: '⏳', desc: 'Ban temporário @membro Xm',    selectable: false },
        { cmd: 'warn',         emoji: '⚠️', desc: 'Advertir @membro',            selectable: false },
        { cmd: 'unwarn',       emoji: '✅', desc: 'Remover aviso @membro',        selectable: false },
        { cmd: 'del',          emoji: '🗑️', desc: 'Apagar msg (citar a msg)',    selectable: false },
        { cmd: 'silenciar',    emoji: '🔇', desc: 'Silenciar @membro Xm',         selectable: false },
        { cmd: 'setregras',    emoji: '📝', desc: 'Definir regras do grupo',       selectable: false },
        // selectable: true → funcionam directamente sem contexto extra
        { cmd: 'todos',        emoji: '📢', desc: 'Marcar todos c/ mensagem',     selectable: true },
        { cmd: 'hidetag',      emoji: '👻', desc: 'Marcar todos silenciosamente', selectable: true },
        { cmd: 'open',         emoji: '🔓', desc: 'Abrir o grupo',                selectable: true },
        { cmd: 'close',        emoji: '🔒', desc: 'Fechar o grupo',               selectable: true },
        { cmd: 'link',         emoji: '🔗', desc: 'Ver link de convite',          selectable: true },
        { cmd: 'revoke',       emoji: '🔄', desc: 'Resetar link de convite',      selectable: true },
        { cmd: 'regras',       emoji: '📜', desc: 'Mostrar regras do grupo',      selectable: true },
        { cmd: 'antilink',     emoji: '🛡️', desc: 'Anti-link on/off',            selectable: true },
        { cmd: 'antispam',     emoji: '🛡️', desc: 'Anti-spam on/off',            selectable: true },
        { cmd: 'welcome',      emoji: '👋', desc: 'Configurar boas-vindas',       selectable: true },
        { cmd: 'alugar',       emoji: '🏠', desc: 'Ver planos de hospedagem',     selectable: true },
        { cmd: 'statusalugar', emoji: '📊', desc: 'Ver estado do aluguel',        selectable: true },
        { cmd: 'participantes',emoji: '👥', desc: 'Listar membros do grupo',      selectable: true },
        { cmd: 'admins',       emoji: '⭐', desc: 'Listar admins do grupo',        selectable: true },
      ],
    });
  },

  async menustatus({ sock, msg, ctx, config }) {
    return sendStyledCommandList(sock, msg, ctx, config, {
      title: 'ℹ️ STATUS & INFO', target: 'menustatus', subtitle: 'Informação, clima, utilidades e diagnóstico.', buttonText: 'ℹ️ Abrir status',
      items: [
        { cmd: 'ping', emoji: '🏓', desc: 'latência' }, { cmd: 'perfil', emoji: '👤', desc: 'perfil' }, { cmd: 'diagnostico', emoji: '🩺', desc: 'diagnóstico do bot' },
        { cmd: 'info', emoji: 'ℹ️', desc: 'info do bot' }, { cmd: 'id', emoji: '🆔', desc: 'seus IDs' },
        { cmd: 'dono', emoji: '👑', desc: 'contato dono' }, { cmd: 'clima', args: 'Luanda', emoji: '🌦️', desc: 'clima' },
        { cmd: 'qrcode', args: 'texto', emoji: '📱', desc: 'gerar QR' }, { cmd: 'calc', args: '10+5', emoji: '🧮', desc: 'calculadora' },
        { cmd: 'translate', args: 'en texto', emoji: '🌍', desc: 'tradução' }, { cmd: 'encurtar', args: 'url', emoji: '🔗', desc: 'encurtar link' },
        { cmd: 'apigratis', emoji: '🌐', desc: 'ferramentas API grátis' },
        { cmd: 'conselho', emoji: '💡', desc: 'conselho aleatório' },
        { cmd: 'pais', args: 'Angola', emoji: '🌍', desc: 'informação de país' },
        { cmd: 'cambio', args: 'USD', emoji: '💱', desc: 'câmbio atual' },
        { cmd: 'cripto', args: 'btc', emoji: '🪙', desc: 'preço cripto' },
        { cmd: 'dog', emoji: '🐶', desc: 'foto dog' },
        { cmd: 'cat', emoji: '🐱', desc: 'foto cat' },
        { cmd: 'iawhatsapp', emoji: '🤖', desc: 'adicionar Meta AI/outras IAs' },
        { cmd: 'aiapis', emoji: '🔌', desc: 'status APIs IA' },
        { cmd: 'noticias', emoji: '📰', desc: 'notícias do dia sem key extra' },
        { cmd: 'menustyle', emoji: '🎭', desc: 'alterar visual dos menus' },
        { cmd: 'buttonmode', emoji: '🔘', desc: 'alterar modo de botões' },
      ],
    });
  },


  async audiomeme({ sock, msg, ctx, args }) {
    const q = args.join(' ').trim();
    if (!q) return reply(sock, msg, ctx, '🔊 Use: audiomeme gatos 3');
    const parts = q.split(/\s+/);
    const last = Number(parts[parts.length - 1]);
    const qtd = Math.min(Number.isFinite(last) && last > 0 ? last : 1, 5);
    const search = Number.isFinite(last) ? parts.slice(0, -1).join(' ') : q;
    await react(sock, msg, '🔎');

    // 1.º — MyInstants (fonte viva de áudios meme em 2026)
    try {
      const axios = require('axios');
      const r = await axios.get(`https://www.myinstants.com/api/search/?term=${encodeURIComponent(search)}`, { timeout: 12000 });
      const results = r.data?.results || [];
      if (results.length) {
        const enviados = Math.min(results.length, qtd);
        for (let i = 0; i < enviados; i++) {
          const item = results[i];
          const mp3Url = `https://www.myinstants.com${item.mp3}`;
          const buf = await mediaHandler.fetchBuffer(mp3Url).catch(() => null);
          if (buf && buf.length > 500) {
            await sock.sendMessage(ctx.remoteJid, { audio: buf, mimetype: 'audio/mpeg', fileName: `${item.name || 'audiomeme'}.mp3`, ptt: true }, { quoted: msg });
          }
        }
        await react(sock, msg, '✅');
        return;
      }
    } catch (e) { console.log('[audiomeme] myinstants falhou:', e.message?.slice(0, 60)); }

    // 2.º — fallback (systemzone, se voltar)
    try {
      const data = await mediaHandler.fetchJson(`https://systemzone.store/api/audiomemes?search=${encodeURIComponent(search)}`, 30000);
      const list = (data?.results || []).slice(0, qtd);
      if (!data?.status || !list.length) throw new Error('sem resultados');
      for (const item of list) {
        await sock.sendMessage(ctx.remoteJid, { audio: { url: item.download_url }, mimetype: 'audio/mpeg', fileName: `${item.title || 'audiomeme'}.mp3`, ptt: false }, { quoted: msg });
      }
      await react(sock, msg, '✅');
      return;
    } catch (e) { await react(sock, msg, '❌'); return reply(sock, msg, ctx, '🔊 Nenhum áudio meme encontrado. Tenta outro termo (ex: audiomeme gato).'); }
  },
  async ameme(a) { return module.exports.audiomeme(a); },

  async gimage({ sock, msg, ctx, args }) {
    const raw = args.join(' ').trim();
    if (!raw) return reply(sock, msg, ctx, '🖼️ Use: gimage gatos|5');
    let [busca, qtd] = raw.split('|');
    busca = (busca || '').trim();
    const limite = Math.max(1, Math.min(10, Number(qtd) || 1));
    await react(sock, msg, '🖼️');
    try {
      const data = await mediaHandler.fetchJson(`https://systemzone.store/api/search/gimage2?query=${encodeURIComponent(busca)}&limite=${limite}&apikey=freekey`, 30000);
      const arr = data?.resultados || data?.results || [];
      if (!data?.status || !arr.length) throw new Error('sem imagem');
      for (let i = 0; i < Math.min(arr.length, limite); i++) {
        await sock.sendMessage(ctx.remoteJid, { image: { url: arr[i].url }, caption: `╭━〔 🖼️ DARK IMAGE 〕━╮\n┃ Busca: ${busca}\n┃ ${i + 1}/${Math.min(arr.length, limite)}\n┃ ${arr[i].title || ''}\n╰━━━━━━━━━━━━╯` }, { quoted: msg });
      }
      await react(sock, msg, '✅');
    } catch (e) { await react(sock, msg, '❌'); return reply(sock, msg, ctx, '❌ Não encontrei imagens.'); }
  },
  async img(a) { return module.exports.gimage(a); },

  async neymar({ sock, msg, ctx, args }) {
    const text = args.join(' ').trim();
    if (!text) return reply(sock, msg, ctx, '✍️ Use: neymar Salve família Dark');
    await react(sock, msg, '✍️');
    try {
      const data = await mediaHandler.fetchJson(`https://systemzone.store/v1/placas/neymar-placa?texto=${encodeURIComponent(text)}`, 30000);
      if (!data?.status || !data?.imagem) throw new Error('API falhou');
      await sock.sendMessage(ctx.remoteJid, { image: { url: data.imagem }, caption: `╭━〔 ⚽ NEYMAR DARK 〕━╮\n┃ ${text}\n╰━━━━━━━━━━━━╯` }, { quoted: msg });
      await react(sock, msg, '✅');
    } catch (e) { await react(sock, msg, '❌'); return reply(sock, msg, ctx, '❌ Erro ao gerar placa.'); }
  },
  async placaneymar(a) { return module.exports.neymar(a); },


  async participantes({ sock, msg, ctx, args }) {
    if (!ctx.isGroup) return reply(sock, msg, ctx, '👥 Só em grupos.');
    const meta = ctx.groupMeta || await sock.groupMetadata(ctx.remoteJid);
    const limit = Math.min(Math.max(Number(args[0]) || 50, 5), 100);
    const list = meta.participants.slice(0, limit);
    const text = `╭━━━〔 👥 PARTICIPANTES 〕━━━╮\n` +
      `┃ Grupo: *${meta.subject}*\n┃ Total: *${meta.participants.length}*\n┣━━━━━━━━━━━━━━━━━━━━\n` +
      list.map((p, i) => `┃ ${String(i + 1).padStart(2, '0')} ${isParticipantAdmin(p) ? '👑' : '👤'} @${p.id.split('@')[0]}`).join('\n') +
      (meta.participants.length > limit ? `\n┃ ... +${meta.participants.length - limit} membro(s)` : '') +
      `\n╰━━━〔 ᴅᴀʀᴋ sɪᴅᴇ ⚡ 〕━━━╯`;
    await sock.sendMessage(ctx.remoteJid, { text, mentions: list.map(p => p.id) }, { quoted: msg });
  },
  async membros(a) { return module.exports.participantes(a); },

  async limpar({ sock, msg, ctx, args }) {
    if (!ctx.isGroup) return reply(sock, msg, ctx, '👥 Só em grupos.');
    if (!(await isAdmin(sock, ctx))) return reply(sock, msg, ctx, '🚫 Só admins.');
    if (!(await botIsAdmin(sock, ctx))) return reply(sock, msg, ctx, '⚠️ Preciso ser admin.');
    const n = Math.min(Math.max(Number(args[0]) || 20, 1), 50);
    const { messageCache } = require('./messageListener');
    const recent = [...messageCache.values()].filter(m => m?.key?.remoteJid === ctx.remoteJid).slice(-n);
    let ok = 0;
    for (const m of recent) {
      try { await sock.sendMessage(ctx.remoteJid, { delete: m.key }); ok++; await new Promise(r => setTimeout(r, 120)); } catch {}
    }
    return reply(sock, msg, ctx, `🧹 *DARK CLEAN*\n\nTentei apagar ${recent.length} mensagens recentes do cache.\n✅ Apagadas: ${ok}\n\nObs: WhatsApp só permite apagar mensagens dentro das regras/tempo da plataforma.`);
  },
  async clean(a) { return module.exports.limpar(a); },
  async limpartudo(a) { return module.exports.limpar(a); },


  async invokedono({ sock, msg, ctx, args, config }) {
    if (!ctx.isGroup) return reply(sock, msg, ctx, '👑 Invocação do dono só funciona em grupos.');
    const reason = args.join(' ').trim() || 'O grupo pediu presença do Dono Supremo.';
    const ownerNumber = userManager.normalizeNumber(config.owner.number);
    if (!ownerNumber) return reply(sock, msg, ctx, '⚠️ OWNER_NUMBER não configurado no Render.');
    const ownerJid = `${ownerNumber}@s.whatsapp.net`;
    const meta = ctx.groupMeta || await sock.groupMetadata(ctx.remoteJid);
    const admins = (meta.participants || []).filter(p => isParticipantAdmin(p)).map(p => p.id);
    const invocationId = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    let inviteLink = '';
    try { if (await botIsAdmin(sock, ctx)) inviteLink = `https://chat.whatsapp.com/${await sock.groupInviteCode(ctx.remoteJid)}`; } catch {}
    const payload = {
      id: invocationId,
      groupJid: ctx.remoteJid,
      groupName: meta.subject || ctx.groupName || '',
      invokerJid: ctx.senderJid,
      invokerNumber: ctx.senderNumber,
      invokerName: ctx.pushName,
      reason,
      inviteLink,
      createdAt: new Date().toISOString(),
      status: 'pending',
    };
    await BotConfig.set(`owner_invocation_${invocationId}`, payload);
    const groupText = `╔═══〔 👑⚡ INVOCAR DONO ⚡👑 〕═══╗\n` +
      `║ @${ctx.senderNumber} abriu o ritual.\n` +
      `║ Dono Supremo: *${config.owner.name}*\n` +
      `║ Grupo: *${meta.subject || ctx.groupName}*\n` +
      `║ Motivo: ${reason}\n` +
      `╚═══〔 +9999999 AURA ACTIVADA 〕═══╝\n\n` +
      `🛡️ ADMs/Subdonos/VIP, preparem o território. O pedido foi enviado no PV do dono.`;
    await sendWithGif(sock, msg, ctx, groupText, [ctx.senderJid, ...admins], 'summon');

    const pvText = `╭━━━〔 👑 INVOCAÇÃO DARKSIDE 〕━━━╮\n` +
      `┃ Grupo: *${meta.subject || ctx.groupName}*\n` +
      `┃ Quem invocou: *${ctx.pushName}* (+${ctx.senderNumber})\n` +
      `┃ Motivo: ${reason}\n` +
      `┃ Convite: ${inviteLink || 'bot tentará adicionar automaticamente'}\n` +
      `┃ ID: ${invocationId}\n` +
      `╰━━━〔 ACEITAR OU RECUSAR 〕━━━╯`;
    await sock.sendMessage(ownerJid, { text: pvText }, { quoted: msg }).catch(() => {});
    await buttonHandler.sendButtons(sock, ownerJid, '👑 Aceitar invocação?', 'Dark Side Engine ⚡', [
      { id: `${config.bot.prefix}aceitarinvocacao ${invocationId}`, text: '✅ Aceitar' },
      { id: `${config.bot.prefix}recusarinvocacao ${invocationId}`, text: '❌ Recusar' },
    ], null).catch(() => {});
    return true;
  },

  async aceitarinvocacao({ sock, msg, ctx, args, isOwner, config }) {
    if (!isOwner) return reply(sock, msg, ctx, '🚫 Só o Dono pode aceitar invocação.');
    const id = args[0];
    if (!id) return reply(sock, msg, ctx, 'Use: aceitarinvocacao <id>');
    const key = `owner_invocation_${id}`;
    const inv = await BotConfig.get(key, null);
    if (!inv) return reply(sock, msg, ctx, '⚠️ Invocação não encontrada ou expirada.');
    const ownerJid = `${userManager.normalizeNumber(config.owner.number)}@s.whatsapp.net`;
    let added = false;
    try { await sock.groupParticipantsUpdate(inv.groupJid, [ownerJid], 'add'); added = true; } catch {}
    if (!added && inv.inviteLink) await sock.sendMessage(ownerJid, { text: `🔗 Link do grupo para entrar:\n${inv.inviteLink}` }).catch(() => {});
    const text = `╔═══〔 👑 DONO ACEITOU 〕═══╗\n` +
      `║ O Dono Supremo *${config.owner.name}* respondeu à invocação.\n` +
      `║ Invocador: @${inv.invokerNumber}\n` +
      `║ Status: ${added ? 'adicionado ao grupo' : 'link enviado no PV'}\n` +
      `╚═══〔 DARK SIDE REIGN ⚡♾️ 〕═══╝`;
    await sock.sendMessage(inv.groupJid, { text, mentions: [`${inv.invokerNumber}@s.whatsapp.net`, ownerJid] }).catch(() => {});
    inv.status = 'accepted'; inv.acceptedAt = new Date().toISOString();
    await BotConfig.set(key, inv);
    return reply(sock, msg, ctx, added ? '✅ Aceitei e fui adicionado ao grupo.' : '✅ Aceitei. Recebi o link do grupo no PV.');
  },

  async recusarinvocacao({ sock, msg, ctx, args, isOwner, config }) {
    if (!isOwner) return reply(sock, msg, ctx, '🚫 Só o Dono pode recusar invocação.');
    const id = args[0];
    if (!id) return reply(sock, msg, ctx, 'Use: recusarinvocacao <id>');
    const key = `owner_invocation_${id}`;
    const inv = await BotConfig.get(key, null);
    if (!inv) return reply(sock, msg, ctx, '⚠️ Invocação não encontrada ou expirada.');
    inv.status = 'rejected'; inv.rejectedAt = new Date().toISOString();
    await BotConfig.set(key, inv);
    await sock.sendMessage(inv.groupJid, { text: `🌑 *Invocação recusada*\n\nO Dono Supremo recebeu o chamado, mas não entrará agora.\nInvocador: @${inv.invokerNumber}`, mentions: [`${inv.invokerNumber}@s.whatsapp.net`] }).catch(() => {});
    return reply(sock, msg, ctx, '🌑 Invocação recusada.');
  },

  async vipcmds({ sock, msg, ctx, args, isOwner }) {
    const defaults = ['decrypt','play3','video2','statusvideo','figubug2','gimage','audiomeme','vinil','sfull','noticias','pesquisar','resumir'];
    if (isOwner && args.length) {
      const list = args.join(' ').split(/[\s,]+/).map(x => x.trim().toLowerCase()).filter(Boolean);
      await BotConfig.set('vip_commands', list);
      botConfigCache.clear();
      return reply(sock, msg, ctx, `⭐ Comandos VIP atualizados:\n${list.map(x => '• ' + x).join('\n')}`);
    }
    const list = await BotConfig.get('vip_commands', defaults).catch(() => defaults);
    return reply(sock, msg, ctx, `╭━━━〔 ⭐ VIP TOP COMMANDS 〕━━━╮\n${(Array.isArray(list) ? list : defaults).map(x => `┃ ⚡ ${x}`).join('\n')}\n╰━━━〔 +9999999 AURA 〕━━━╯\n\nDono pode alterar: vipcmds play3 video2 ...`);
  },

  // v7.6 — addcmdvip era stub ("Comando registado" fake).
  // Agora adiciona um comando à lista VIP (delcmdvip remove).
  async addcmdvip({ sock, msg, ctx, args, isOwner }) {
    if (!isOwner) return reply(sock, msg, ctx, '🚫 Só Dono.');
    const cmd = (args[0] || '').toLowerCase().trim().replace(/^[!.\/]/, '');
    if (!cmd) return reply(sock, msg, ctx, '⭐ Use: addcmdvip <comando>\nEx: addcmdvip decrypt\n\nLista: vipcmds');
    const defaults = ['decrypt','play3','video2','statusvideo','figubug2','gimage','audiomeme','vinil','sfull','noticias','pesquisar','resumir'];
    const atual = await BotConfig.get('vip_commands', defaults).catch(() => defaults);
    const list = new Set(Array.isArray(atual) ? atual : defaults);
    list.add(cmd);
    await BotConfig.set('vip_commands', [...list]);
    botConfigCache.clear();
    return reply(sock, msg, ctx, `⭐ Comando *${cmd}* adicionado à lista VIP.\n\nLista actual:\n${[...list].map(x => '• ' + x).join('\n')}`);
  },

  async delcmdvip({ sock, msg, ctx, args, isOwner }) {
    if (!isOwner) return reply(sock, msg, ctx, '🚫 Só Dono.');
    const cmd = (args[0] || '').toLowerCase().trim().replace(/^[!.\/]/, '');
    if (!cmd) return reply(sock, msg, ctx, '⭐ Use: delcmdvip <comando>');
    const defaults = ['decrypt','play3','video2','statusvideo','figubug2','gimage','audiomeme','vinil','sfull','noticias','pesquisar','resumir'];
    const atual = await BotConfig.get('vip_commands', defaults).catch(() => defaults);
    const list = new Set(Array.isArray(atual) ? atual : defaults);
    list.delete(cmd);
    await BotConfig.set('vip_commands', [...list]);
    botConfigCache.clear();
    return reply(sock, msg, ctx, `⭐ Comando *${cmd}* removido da lista VIP.\n\nLista actual:\n${[...list].map(x => '• ' + x).join('\n')}`);
  },


  async menustyle({ sock, msg, ctx, args, isOwner }) {
    if (!isOwner) return reply(sock, msg, ctx, '🚫 Só Dono.');
    const action = (args[0] || 'status').toLowerCase();
    if (['status','ver'].includes(action)) {
      const style = await BotConfig.get('menu_style', 'classic');
      const show = await BotConfig.get('menu_show_prefix', false);
      const mode = await BotConfig.get('button_mode', 'auto');
      return reply(sock, msg, ctx, `🎭 *MENU STYLE*\n\nEstilo: *${style}*\nPrefixo visual: *${show ? 'ON' : 'OFF'}*\nBotões: *${mode}*\n\nComandos:\nmenustyle set dark-1\nmenustyle prefix on/off\nbuttonmode auto|direct|native|wabase|text`);
    }
    if (action === 'set') {
      const style = args[1] || 'classic';
      await BotConfig.set('menu_style', style); botConfigCache.clear();
      return reply(sock, msg, ctx, `✅ Estilo do menu alterado para *${style}*.`);
    }
    if (action === 'prefix') {
      const on = ['on','sim','true','1'].includes((args[1] || '').toLowerCase());
      await BotConfig.set('menu_show_prefix', on); botConfigCache.clear();
      return reply(sock, msg, ctx, `✅ Prefixo visual no menu: *${on ? 'ON' : 'OFF'}*.`);
    }
    return reply(sock, msg, ctx, 'Use: menustyle set dark-1 | menustyle prefix on/off');
  },

  async buttonmode({ sock, msg, ctx, args, isOwner }) {
    if (!isOwner) return reply(sock, msg, ctx, '🚫 Só Dono.');
    const mode = (args[0] || '').toLowerCase();
    const allowed = ['auto','direct','native','wabase','text'];
    if (!allowed.includes(mode)) return reply(sock, msg, ctx, `🔘 Use: buttonmode ${allowed.join('|')}`);
    await BotConfig.set('button_mode', mode); botConfigCache.clear();
    return reply(sock, msg, ctx, `✅ Modo dos botões definido: *${mode}*.`);
  },

  async stickerwm({ sock, msg, ctx, args, isOwner, config }) {
    if (!isOwner) return reply(sock, msg, ctx, '🚫 Só Dono.');
    const action = (args[0] || 'status').toLowerCase();
    if (['status','ver'].includes(action)) {
      const enabled = await BotConfig.get('sticker_watermark_enabled', true);
      const visible = await BotConfig.get('sticker_visible_watermark', false);
      const pack = await BotConfig.get('sticker_pack_name', `${config.bot.name} • ${config.owner.name}`);
      const author = await BotConfig.get('sticker_author_name', 'auto');
      const text = await BotConfig.get('sticker_watermark_text', config.bot.name);
      return reply(sock, msg, ctx, `🎨 *STICKER WATERMARK*\n\nStatus: ${enabled ? '✅ ON' : '🛑 OFF'}\nVisível: ${visible ? '✅ ON' : '🛑 OFF'}\nPack: *${pack}*\nAuthor: *${author}*\nTexto visível: *${text}*\n\nComandos:\nstickerwm on/off\nstickerwm visible on/off\nstickerwm pack Nome\nstickerwm author Nome\nstickerwm text Marca`);
    }
    if (['on','off'].includes(action)) {
      await BotConfig.set('sticker_watermark_enabled', action === 'on'); botConfigCache.clear();
      return reply(sock, msg, ctx, `✅ Marca d'água metadata: *${action.toUpperCase()}*.`);
    }
    if (action === 'visible') {
      const on = ['on','sim','true','1'].includes((args[1] || '').toLowerCase());
      await BotConfig.set('sticker_visible_watermark', on); botConfigCache.clear();
      return reply(sock, msg, ctx, `✅ Marca d'água visível: *${on ? 'ON' : 'OFF'}*.`);
    }
    if (action === 'pack') {
      const val = args.slice(1).join(' ').trim(); if (!val) return reply(sock, msg, ctx, 'Use: stickerwm pack DARK BOT');
      await BotConfig.set('sticker_pack_name', val.slice(0, 80)); botConfigCache.clear();
      return reply(sock, msg, ctx, `✅ Pack dos stickers: *${val.slice(0,80)}*`);
    }
    if (action === 'author') {
      const val = args.slice(1).join(' ').trim(); if (!val) return reply(sock, msg, ctx, 'Use: stickerwm author Dark Net');
      await BotConfig.set('sticker_author_name', val.slice(0, 80)); botConfigCache.clear();
      return reply(sock, msg, ctx, `✅ Author dos stickers: *${val.slice(0,80)}*`);
    }
    if (action === 'text') {
      const val = args.slice(1).join(' ').trim(); if (!val) return reply(sock, msg, ctx, 'Use: stickerwm text DARK BOT');
      await BotConfig.set('sticker_watermark_text', val.slice(0, 32)); botConfigCache.clear();
      return reply(sock, msg, ctx, `✅ Texto da marca visível: *${val.slice(0,32)}*`);
    }
    return module.exports.stickerwm({ sock, msg, ctx, args: ['status'], isOwner, config });
  },


  // ══════════════════════════════════════════════════════
  // PORTAL 18+ — DARK SIDE PRIVATE ENGINE
  // Exclusivo para o Dono Principal (isPrimaryOwner)
  // TODO o conteúdo vai APENAS para o PV do dono
  // ══════════════════════════════════════════════════════

  async cmdsocultos({ sock, msg, ctx, config: cfg }) {
    if (!isPrimaryOwnerOnly(ctx)) {
      // Para todos os outros: invisível — não revela nem confirma existência
      if (ctx.isGroup) await sock.sendMessage(ctx.remoteJid, { react: { text: '🕳️', key: msg.key } }).catch(() => {});
      return true;
    }
    const localConfig = cfg || config;
    const p = localConfig.bot.prefix;
    const enabled   = await BotConfig.get('adult_mode_enabled', false).catch(() => false);
    const apiUrl    = await BotConfig.get('adult_search_api_url', '').catch(() => '');
    const menuText  = portal18.portalMenuText(localConfig.owner.name, enabled, !!apiUrl, p);
    await portal18.ownerPv(sock, { text: menuText }, ctx);
    if (!ctx.isGroup) await sock.sendMessage(ctx.remoteJid, { text: menuText }, { quoted: msg });
    return true;
  },

  async adultmode({ sock, msg, ctx, args }) {
    if (!isPrimaryOwnerOnly(ctx)) return true;
    const v = (args[0] || '').toLowerCase();
    if (!['on', 'off'].includes(v)) {
      const cur = await BotConfig.get('adult_mode_enabled', false).catch(() => false);
      await portal18.ownerPv(sock, { text: `🕳️ Portal 18+: *${cur ? 'ACTIVO 🟢' : 'INACTIVO 🔴'}*\n\nUse: adultmode on/off` }, ctx);
      return true;
    }
    await BotConfig.set('adult_mode_enabled', v === 'on');
    botConfigCache.clear();
    await portal18.ownerPv(sock, { text: `✅ Portal 18+: *${v === 'on' ? 'ACTIVADO 🟢' : 'DESACTIVADO 🔴'}*` }, ctx);
    if (!ctx.isGroup) await sock.sendMessage(ctx.remoteJid, { text: `✅ Portal 18+: ${v.toUpperCase()}` }, { quoted: msg });
    return true;
  },

  async adultapi({ sock, msg, ctx, args }) {
    if (!isPrimaryOwnerOnly(ctx)) return true;
    const url = args.join(' ').trim();
    if (!/^https?:\/\//i.test(url) || !url.includes('{query}')) {
      await portal18.ownerPv(sock, { text:
        `⚙️ *Configurar API de Vídeo 18+*\n\n` +
        `Formato: adultapi https://suaapi.com/search?q={query}\n\n` +
        `A API deve retornar JSON com URLs de vídeo MP4.\n` +
        `Substitua {query} onde vai a pesquisa.`
      }, ctx);
      return true;
    }
    await BotConfig.set('adult_search_api_url', url);
    botConfigCache.clear();
    await portal18.ownerPv(sock, { text: `✅ API de vídeo 18+ configurada.\nConteúdo vai apenas para o teu PV.` }, ctx);
    return true;
  },

  // !hentai [tags] — imagem anime adulta aleatória
  async hentai({ sock, msg, ctx, args }) {
    if (!isPrimaryOwnerOnly(ctx)) return true;
    const enabled = await BotConfig.get('adult_mode_enabled', false).catch(() => false);
    if (!enabled) { await portal18.ownerPv(sock, { text: '🛑 Portal OFF. Use: adultmode on' }, ctx); return true; }
    const tags = portal18.cleanQuery(args.join(' ') || 'nude rating:e');
    if (portal18.isBlocked(tags)) { await portal18.ownerPv(sock, { text: '🚫 Termo bloqueado por segurança.' }, ctx); return true; }
    await portal18.ownerPv(sock, { text: `🔍 A buscar: *${tags}*...` }, ctx);
    try {
      const imgs = await portal18.searchImages(tags, 3);
      for (let i = 0; i < imgs.length; i++) {
        const img = imgs[i];
        await portal18.ownerPv(sock, {
          image: { url: img.url },
          caption: `🕳️ *Hentai ${i+1}/${imgs.length}*\n🏷️ ${img.tags.slice(0,80)}\n⭐ Score: ${img.score}\n📡 ${img.source}`,
        }, ctx);
        await new Promise(r => setTimeout(r, 700));
      }
    } catch (e) {
      await portal18.ownerPv(sock, { text: `❌ Erro: ${e.message}` }, ctx);
    }
    return true;
  },

  // !ximg [tags] — busca imagem adulta por tags (qualquer fonte)
  async ximg({ sock, msg, ctx, args }) {
    if (!isPrimaryOwnerOnly(ctx)) return true;
    const enabled = await BotConfig.get('adult_mode_enabled', false).catch(() => false);
    if (!enabled) { await portal18.ownerPv(sock, { text: '🛑 Portal OFF. Use: adultmode on' }, ctx); return true; }
    const tags = portal18.cleanQuery(args.join(' ') || 'nude');
    if (portal18.isBlocked(tags)) { await portal18.ownerPv(sock, { text: '🚫 Termo bloqueado.' }, ctx); return true; }
    await portal18.ownerPv(sock, { text: `🔍 A buscar imagens: *${tags}*...` }, ctx);
    try {
      const imgs = await portal18.searchImages(tags, 4);
      for (let i = 0; i < imgs.length; i++) {
        const img = imgs[i];
        await portal18.ownerPv(sock, {
          image: { url: img.url },
          caption: `📸 *xImg ${i+1}/${imgs.length}*\n🏷️ ${img.tags.slice(0,80)}\n📡 ${img.source}`,
        }, ctx);
        await new Promise(r => setTimeout(r, 700));
      }
    } catch (e) {
      await portal18.ownerPv(sock, { text: `❌ ${e.message}` }, ctx);
    }
    return true;
  },

  // ══════════════════════════════════════════════════════════
  // v6.49: COMANDOS 18+ QUE FALTAVAM
  // O portal18.js já tinha yandeImages/konachanImages/e621Images/
  // nekosLifeImage prontas e a funcionar (testado: as 4 devolvem
  // imagens reais, 200KB–3MB), mas NÃO havia comando para as chamar.
  // O menu anunciava-os e dava "comando não encontrado".
  // ══════════════════════════════════════════════════════════

  // Helper partilhado: valida acesso e envia as imagens no PV
  async _adultSend(sock, ctx, { titulo, tags, fetcher, count = 3 }) {
    const enabled = await BotConfig.get('adult_mode_enabled', false).catch(() => false);
    if (!enabled) { await portal18.ownerPv(sock, { text: '🛑 Portal OFF. Usa: adultmode on' }, ctx); return true; }
    const q = portal18.cleanQuery(tags);
    if (portal18.isBlocked(q)) { await portal18.ownerPv(sock, { text: '🚫 Termo bloqueado por segurança.' }, ctx); return true; }

    // v6.52: se o PV não estiver acessível, avisa NO GRUPO em vez de
    // fingir que enviou. Era isto que fazia o bot confirmar e não
    // chegar nada — o utilizador ficava à espera de algo que não vinha.
    const pvOk = await portal18.ownerPv(sock, { text: `🔍 ${titulo}: *${q}*...` }, ctx);
    if (pvOk === false) {
      const alvo = ctx?.remoteJid;
      if (alvo) {
        await sock.sendMessage(alvo, {
          text: '⚠️ *Não consegui enviar no teu PV.*\n\n' +
                'Manda-me uma mensagem no privado primeiro (basta um "oi") ' +
                'e tenta outra vez — o WhatsApp só deixa o bot iniciar conversa depois disso.',
        }).catch(() => {});
      }
      return true;
    }

    try {
      const imgs = await fetcher(q, count);
      if (!imgs || !imgs.length) { await portal18.ownerPv(sock, { text: '😕 Sem resultados. Tenta outras tags.' }, ctx); return true; }
      for (let i = 0; i < imgs.length; i++) {
        const img = imgs[i];
        const isVid = /\.(webm|mp4|gif)$/i.test(String(img.url || ''));
        const legenda = `${titulo} *${i + 1}/${imgs.length}*\n🏷️ ${String(img.tags || '').slice(0, 80)}` +
                        `${img.score ? `\n⭐ ${img.score}` : ''}\n📡 ${img.source || '—'}`;
        try {
          await portal18.ownerPv(sock, isVid
            ? { video: { url: img.url }, caption: legenda, gifPlayback: /\.gif$/i.test(img.url) }
            : { image: { url: img.url }, caption: legenda });
        } catch {
          // Se a mídia falhar (URL morta, formato recusado) manda o link
          await portal18.ownerPv(sock, { text: `${legenda}\n🔗 ${img.url}` }, ctx);
        }
        await new Promise(r => setTimeout(r, 700));
      }
    } catch (e) {
      await portal18.ownerPv(sock, { text: `❌ ${String(e.message).slice(0, 120)}` }, ctx);
    }
    return true;
  },

  // !yande [tags] — yande.re, anime em alta resolução
  async yande({ sock, ctx, args }) {
    if (!isPrimaryOwnerOnly(ctx)) return true;
    return module.exports._adultSend(sock, ctx, {
      titulo: '🌸 yande.re', tags: args.join(' ') || 'nude',
      fetcher: (q, n) => portal18.yandeImages(q, n),
    });
  },

  // !kona [tags] — konachan.com, wallpapers anime
  async kona({ sock, ctx, args }) {
    if (!isPrimaryOwnerOnly(ctx)) return true;
    return module.exports._adultSend(sock, ctx, {
      titulo: '🍥 konachan', tags: args.join(' ') || 'nude',
      fetcher: (q, n) => portal18.konachanImages(q, n),
    });
  },

  // !e621 [tags] — e621.net (suporta webm/gif)
  async e621({ sock, ctx, args }) {
    if (!isPrimaryOwnerOnly(ctx)) return true;
    return module.exports._adultSend(sock, ctx, {
      titulo: '🐾 e621', tags: args.join(' ') || 'rating:e',
      fetcher: (q, n) => portal18.e621Images(q, n),
    });
  },

  // !nekos [tipo] — nekos.life
  async nekos({ sock, ctx, args }) {
    if (!isPrimaryOwnerOnly(ctx)) return true;
    const tipo = (args[0] || 'lewd').toLowerCase().replace(/[^a-z]/g, '');
    return module.exports._adultSend(sock, ctx, {
      titulo: '🐱 nekos.life', tags: tipo,
      fetcher: (q) => portal18.nekosLifeImage(q || 'lewd'),
    });
  },

  // ══════════════════════════════════════════════════════════
  // v6.51 — BUSCA POR NOME · GIFs · FIGURINHAS ANIMADAS
  // Testado ao vivo: purrbot e nekos.life entregam GIF real
  // (349KB, magic bytes 'GIF'); e621/yande suportam a tag
  // 'animated' para procurar animados por personagem.
  // Nota: tenor, giphy e waifu.im estão fechadas (401/403).
  // ══════════════════════════════════════════════════════════

  // !buscar <nome> — procura por personagem/tema em 4 boorus
  async buscar18({ sock, ctx, args }) {
    if (!isPrimaryOwnerOnly(ctx)) return true;
    const nome = args.join(' ').trim();
    if (!nome) { await portal18.ownerPv(sock, { text: '🔎 Uso: *buscar18 <nome>*\nEx: buscar18 hatsune miku' }, ctx); return true; }
    return module.exports._adultSend(sock, ctx, {
      titulo: `🔎 ${nome}`, tags: nome, count: 4,
      fetcher: (q, n) => portal18.searchByName(q, n),
    });
  },

  // !gif18 [tipo] — GIF animado 18+
  async gif18({ sock, ctx, args }) {
    if (!isPrimaryOwnerOnly(ctx)) return true;
    const tipo = (args[0] || 'neko').toLowerCase().replace(/[^a-z]/g, '');
    return module.exports._adultSend(sock, ctx, {
      titulo: `🎞️ GIF ${tipo}`, tags: tipo, count: 1,
      fetcher: (q) => portal18.purrbotGif(q || 'neko', true),
    });
  },

  // !gif [tipo] — GIF de reacção (SFW: kiss, hug, pat...)
  async gifreact({ sock, ctx, args }) {
    if (!isPrimaryOwnerOnly(ctx)) return true;
    const tipo = (args[0] || 'kiss').toLowerCase().replace(/[^a-z]/g, '');
    return module.exports._adultSend(sock, ctx, {
      titulo: `🎞️ ${tipo}`, tags: tipo, count: 1,
      fetcher: async (q) => {
        try { return await portal18.nekosGif(q || 'kiss'); }
        catch { return portal18.purrbotGif(q || 'neko', false); }
      },
    });
  },

  // !shorts [nome] — vídeos curtos animados (gif/webm/mp4)
  async shorts18({ sock, ctx, args }) {
    if (!isPrimaryOwnerOnly(ctx)) return true;
    const nome = args.join(' ').trim();
    return module.exports._adultSend(sock, ctx, {
      titulo: nome ? `🎬 shorts: ${nome}` : '🎬 shorts', tags: nome || 'random', count: 3,
      fetcher: (q, n) => portal18.searchAnimated(q === 'random' ? '' : q, n),
    });
  },

  // !figbusca <nome> — figurinha a partir de uma busca por nome
  async figbusca({ sock, ctx, args, config: cfg }) {
    if (!isPrimaryOwnerOnly(ctx)) return true;
    const localConfig = cfg || config;
    const enabled = await BotConfig.get('adult_mode_enabled', false).catch(() => false);
    if (!enabled) { await portal18.ownerPv(sock, { text: '🛑 Portal OFF. Usa: adultmode on' }, ctx); return true; }

    const nome = portal18.cleanQuery(args.join(' ').trim());
    if (!nome) { await portal18.ownerPv(sock, { text: '🎭 Uso: *figbusca <nome>*' }, ctx); return true; }
    if (portal18.isBlocked(nome)) { await portal18.ownerPv(sock, { text: '🚫 Termo bloqueado.' }, ctx); return true; }

    await portal18.ownerPv(sock, { text: `🎭 A procurar *${nome}* e a criar figurinha...` }, ctx);
    try {
      const imgs = await portal18.searchByName(nome, 1);
      const buf = await mediaHandler.fetchBuffer(imgs[0].url);
      const fig = await stickerMaker.create(buf, {
        botName: localConfig.bot.name, ownerName: localConfig.owner.name,
        userName: ctx.pushName || 'Dark', groupName: 'PV',
        packName: `🔞 ${nome}`, authorName: localConfig.owner.name,
      });
      if (!fig) throw new Error('não consegui converter');
      await portal18.ownerPv(sock, { sticker: fig }, ctx);
    } catch (e) {
      await portal18.ownerPv(sock, { text: `❌ ${String(e.message).slice(0, 110)}` }, ctx);
    }
    return true;
  },

  // !figgif [tipo] — figurinha ANIMADA a partir de um GIF
  async figgif({ sock, ctx, args, config: cfg }) {
    if (!isPrimaryOwnerOnly(ctx)) return true;
    const localConfig = cfg || config;
    const enabled = await BotConfig.get('adult_mode_enabled', false).catch(() => false);
    if (!enabled) { await portal18.ownerPv(sock, { text: '🛑 Portal OFF. Usa: adultmode on' }, ctx); return true; }

    const tipo = (args[0] || 'neko').toLowerCase().replace(/[^a-z]/g, '');
    await portal18.ownerPv(sock, { text: `🎞️ A criar figurinha animada (*${tipo}*)...` }, ctx);
    try {
      let gif;
      try { gif = await portal18.purrbotGif(tipo, true); }
      catch { gif = await portal18.nekosGif(tipo); }

      const buf = await mediaHandler.fetchBuffer(gif[0].url);
      if (!buf || buf.length < 1000) throw new Error('GIF vazio');

      const fig = await stickerMaker.create(buf, {
        botName: localConfig.bot.name, ownerName: localConfig.owner.name,
        userName: ctx.pushName || 'Dark', groupName: 'PV',
        packName: `🔞 ${localConfig.bot.name} GIF`, authorName: localConfig.owner.name,
        isVideo: true,
      });
      if (fig) { await portal18.ownerPv(sock, { sticker: fig }, ctx); return true; }

      // Sem ffmpeg não dá para animar → manda o GIF como vídeo
      await portal18.ownerPv(sock, {
        video: buf, gifPlayback: true,
        caption: `🎞️ *${tipo}*\n⚠️ Sem ffmpeg não converti em figurinha animada — vai como GIF.`,
      }, ctx);
    } catch (e) {
      await portal18.ownerPv(sock, { text: `❌ ${String(e.message).slice(0, 110)}` }, ctx);
    }
    return true;
  },

  // !packbusca <nome> [qtd] — pack de figurinhas por nome
  async packbusca({ sock, ctx, args, config: cfg }) {
    if (!isPrimaryOwnerOnly(ctx)) return true;
    const localConfig = cfg || config;
    const enabled = await BotConfig.get('adult_mode_enabled', false).catch(() => false);
    if (!enabled) { await portal18.ownerPv(sock, { text: '🛑 Portal OFF. Usa: adultmode on' }, ctx); return true; }

    const argv = [...args];
    let qtd = 12;
    if (argv.length > 1 && /^\d+$/.test(argv[argv.length - 1])) {
      qtd = Math.min(24, Math.max(1, parseInt(argv.pop(), 10)));
    }
    const nome = portal18.cleanQuery(argv.join(' ').trim());
    if (!nome) { await portal18.ownerPv(sock, { text: '🎭 Uso: *packbusca <nome> [qtd]*' }, ctx); return true; }
    if (portal18.isBlocked(nome)) { await portal18.ownerPv(sock, { text: '🚫 Termo bloqueado.' }, ctx); return true; }

    await portal18.ownerPv(sock, { text: `🎭 Pack amplo de *${qtd}* figurinhas de *${nome}* (estático + animado)...` }, ctx);
    let feitas = 0;
    try {
      const packId = stickerMaker.makePackId ? stickerMaker.makePackId(nome) : `packbusca-${Date.now()}`;
      const stickers = [];
      const imgs = await (portal18.searchByNameWide || portal18.searchByName)(nome, qtd);
      for (const img of imgs) {
        try {
          const buf = await mediaHandler.fetchBuffer(img.url);
          if (!buf || buf.length < 1000) continue;
          const isAnim = !!(img.animated || img.isVideo || /\.(gif|webm|mp4)$/i.test(img.url || ''));
          const fig = await stickerMaker.create(buf, {
            botName: localConfig.bot.name, ownerName: localConfig.owner.name,
            userName: ctx.pushName || 'Dark', groupName: 'PV',
            packName: nome, searchQuery: nome, packId,
            remoteJid: ctx.remoteJid, skipGroupWm: true,
            isVideo: isAnim,
          });
          if (fig) stickers.push(fig);
        } catch { /* salta e continua */ }
      }
      if (!stickers.length) {
        await portal18.ownerPv(sock, { text: '😕 Não consegui criar nenhuma.' }, ctx);
      } else {
        const target = ctx.senderJid || (String(ctx.senderNumber || '').replace(/\D/g, '') + '@s.whatsapp.net');
        const finished = await stickerPack.sendFinishedPack(sock, target, stickers, { query: nome, packId });
        feitas = finished.stickers.length;
        await portal18.ownerPv(sock, { text: `✅ *${feitas}/${qtd}* figurinhas de *${nome}*.\n\n${finished.description}` }, ctx);
      }
    } catch (e) {
      await portal18.ownerPv(sock, { text: `❌ ${String(e.message).slice(0, 110)}` }, ctx);
    }
    return true;
  },

  // ── v6.50: FIGURINHAS 18+ (fig18 / pack18) ────────────────
  // Estavam anunciados no menu original mas nunca foram feitos.
  // Agora usam a mesma cadeia dos outros: portal18 → fetchBuffer →
  // stickerMaker.create. Testado: 218KB de imagem → 47KB de WebP.

  // !fig18 [tags] — uma figurinha 18+
  async fig18({ sock, ctx, args, config: cfg }) {
    if (!isPrimaryOwnerOnly(ctx)) return true;
    const localConfig = cfg || config;
    const enabled = await BotConfig.get('adult_mode_enabled', false).catch(() => false);
    if (!enabled) { await portal18.ownerPv(sock, { text: '🛑 Portal OFF. Usa: adultmode on' }, ctx); return true; }

    const tags = portal18.cleanQuery(args.join(' ') || 'nude');
    if (portal18.isBlocked(tags)) { await portal18.ownerPv(sock, { text: '🚫 Termo bloqueado por segurança.' }, ctx); return true; }

    await portal18.ownerPv(sock, { text: `🎭 A criar figurinha: *${tags}*...` }, ctx);
    try {
      const imgs = await portal18.searchImages(tags, 1);
      if (!imgs?.length) { await portal18.ownerPv(sock, { text: '😕 Sem resultados.' }, ctx); return true; }

      const buf = await mediaHandler.fetchBuffer(imgs[0].url);
      if (!buf || buf.length < 1000) throw new Error('imagem vazia');

      const fig = await stickerMaker.create(buf, {
        botName: localConfig.bot.name, ownerName: localConfig.owner.name,
        userName: ctx.pushName || 'Dark', groupName: 'PV',
        packName: `🔞 ${localConfig.bot.name} 18+`, authorName: localConfig.owner.name,
      });
      if (!fig) throw new Error('não consegui converter em figurinha');
      await portal18.ownerPv(sock, { sticker: fig }, ctx);
    } catch (e) {
      await portal18.ownerPv(sock, { text: `❌ ${String(e.message).slice(0, 110)}` }, ctx);
    }
    return true;
  },

  // !pack18 [tags] [qtd] — pack de figurinhas 18+ (máx 8)
  async pack18({ sock, ctx, args, config: cfg }) {
    if (!isPrimaryOwnerOnly(ctx)) return true;
    const localConfig = cfg || config;
    const enabled = await BotConfig.get('adult_mode_enabled', false).catch(() => false);
    if (!enabled) { await portal18.ownerPv(sock, { text: '🛑 Portal OFF. Usa: adultmode on' }, ctx); return true; }

    // último argumento numérico = quantidade
    const argv = [...args];
    let qtd = 12;
    if (argv.length && /^\d+$/.test(argv[argv.length - 1])) {
      qtd = Math.min(24, Math.max(1, parseInt(argv.pop(), 10)));
    }
    const tags = portal18.cleanQuery(argv.join(' ') || 'nude');
    if (portal18.isBlocked(tags)) { await portal18.ownerPv(sock, { text: '🚫 Termo bloqueado por segurança.' }, ctx); return true; }

    await portal18.ownerPv(sock, { text: `🎭 Pack amplo de *${qtd}* figurinhas: *${tags}* (estático + animado)...` }, ctx);
    let feitas = 0;
    try {
      const packId = stickerMaker.makePackId ? stickerMaker.makePackId(tags) : `pack18-${Date.now()}`;
      const stickers = [];
      const wide = portal18.searchByNameWide || portal18.searchByName;
      const imgs = await wide(tags, qtd).catch(() => portal18.searchImages(tags, qtd));
      for (const img of imgs) {
        try {
          const buf = await mediaHandler.fetchBuffer(img.url);
          if (!buf || buf.length < 1000) continue;
          const isAnim = !!(img.animated || img.isVideo || /\.(gif|webm|mp4)$/i.test(img.url || ''));
          const fig = await stickerMaker.create(buf, {
            botName: localConfig.bot.name, ownerName: localConfig.owner.name,
            userName: ctx.pushName || 'Dark', groupName: 'PV',
            packName: tags, searchQuery: tags, packId,
            remoteJid: ctx.remoteJid, skipGroupWm: true,
            isVideo: isAnim,
          });
          if (fig) stickers.push(fig);
        } catch { /* salta a que falhar e continua o pack */ }
      }
      if (!stickers.length) {
        await portal18.ownerPv(sock, { text: '😕 Não consegui criar nenhuma.' }, ctx);
      } else {
        const target = ctx.senderJid || (String(ctx.senderNumber || '').replace(/\D/g, '') + '@s.whatsapp.net');
        const finished = await stickerPack.sendFinishedPack(sock, target, stickers, { query: tags, packId });
        feitas = finished.stickers.length;
        await portal18.ownerPv(sock, {
          text: `✅ Pack pronto — *${feitas}/${qtd}* figurinhas.\n\n${finished.description}`,
        }, ctx);
      }
    } catch (e) {
      await portal18.ownerPv(sock, { text: `❌ ${String(e.message).slice(0, 110)}` }, ctx);
    }
    return true;
  },

  // !xvideodl <url> — envia o vídeo a partir de um link directo
  async xvideodl({ sock, ctx, args }) {
    if (!isPrimaryOwnerOnly(ctx)) return true;
    const enabled = await BotConfig.get('adult_mode_enabled', false).catch(() => false);
    if (!enabled) { await portal18.ownerPv(sock, { text: '🛑 Portal OFF. Usa: adultmode on' }, ctx); return true; }

    const url = (args[0] || '').trim();
    if (!/^https?:\/\//i.test(url)) {
      await portal18.ownerPv(sock, { text: '📎 Uso: *xvideodl <url do vídeo>*' }, ctx);
      return true;
    }
    await portal18.ownerPv(sock, { text: '⬇️ A baixar o vídeo...' }, ctx);
    try {
      const buf = await mediaHandler.fetchBuffer(url);
      if (!buf || buf.length < 10000) throw new Error('ficheiro vazio ou demasiado pequeno');
      // WhatsApp recusa vídeos muito grandes — avisa em vez de falhar em silêncio
      if (buf.length > 60 * 1024 * 1024) {
        await portal18.ownerPv(sock, { text: `⚠️ Vídeo grande demais (${(buf.length / 1048576).toFixed(1)}MB).\n🔗 ${url}` }, ctx);
        return true;
      }
      await portal18.ownerPv(sock, {
        video: buf,
        caption: `🎬 *Download concluído*\n📦 ${(buf.length / 1048576).toFixed(1)}MB`,
      }, ctx);
    } catch (e) {
      await portal18.ownerPv(sock, { text: `❌ ${String(e.message).slice(0, 100)}\n🔗 ${url}` }, ctx);
    }
    return true;
  },

  // !adultstats — estado do portal (só dono)
  async adultstats({ sock, ctx }) {
    if (!isPrimaryOwnerOnly(ctx)) return true;
    const enabled = await BotConfig.get('adult_mode_enabled', false).catch(() => false);
    const apiUrl = await BotConfig.get('adult_video_api', '').catch(() => '');
    const usos = await BotConfig.get('adult_uses', 0).catch(() => 0);

    // Testa as fontes ao vivo, em paralelo
    const fontes = [
      ['yande.re',   () => portal18.yandeImages('nude', 1)],
      ['konachan',   () => portal18.konachanImages('nude', 1)],
      ['e621',       () => portal18.e621Images('rating:e', 1)],
      ['nekos.life', () => portal18.nekosLifeImage('lewd')],
    ];
    const estado = await Promise.all(fontes.map(async ([nome, fn]) => {
      const t0 = Date.now();
      try { const r = await fn(); return `${r?.length ? '✅' : '⚠️'} ${nome} — ${Date.now() - t0}ms`; }
      catch { return `❌ ${nome} — fora de serviço`; }
    }));

    await portal18.ownerPv(sock, { text: [
      '📊 *ESTADO DO PORTAL 18+*',
      '',
      `${enabled ? '🟢' : '🔴'} Portal: *${enabled ? 'LIGADO' : 'DESLIGADO'}*`,
      `${apiUrl ? '🟢' : '⬜'} API de vídeo: ${apiUrl ? 'configurada' : 'não configurada'}`,
      `🔢 Utilizações: *${usos}*`,
      '',
      '*FONTES DE IMAGEM*',
      ...estado,
      '',
      '> Conteúdo entregue sempre no PV do Dono.',
    ].join('\n') }, ctx);
    return true;
  },

  // !adultsearch [tags] — multi-fonte
  async adultsearch({ sock, msg, ctx, args }) {
    if (!isPrimaryOwnerOnly(ctx)) return true;
    const enabled = await BotConfig.get('adult_mode_enabled', false).catch(() => false);
    if (!enabled) { await portal18.ownerPv(sock, { text: '🛑 Portal OFF. Use: adultmode on' }, ctx); return true; }
    const query = portal18.cleanQuery(args.join(' ') || 'nude');
    if (portal18.isBlocked(query)) { await portal18.ownerPv(sock, { text: '🚫 Termo bloqueado.' }, ctx); return true; }
    await portal18.ownerPv(sock, { text: `🔍 Pesquisando em múltiplas fontes: *${query}*...` }, ctx);
    // Busca em paralelo em 2 fontes
    const results = await Promise.allSettled([
      portal18.yandeImages(query, 2),
      portal18.konachanImages(query, 2),
    ]);
    const imgs = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
    if (!imgs.length) {
      await portal18.ownerPv(sock, { text: `❌ Sem resultados para: ${query}` }, ctx);
      return true;
    }
    for (let i = 0; i < imgs.length; i++) {
      const img = imgs[i];
      await portal18.ownerPv(sock, {
        image: { url: img.url },
        caption: `🔍 *Busca ${i+1}/${imgs.length}*\n🏷️ ${img.tags.slice(0,80)}\n📡 ${img.source}`,
      }, ctx);
      await new Promise(r => setTimeout(r, 700));
    }
    return true;
  },

  // !adultvideo [termo] — vídeo via API configurável
  async adultvideo({ sock, msg, ctx, args }) {
    if (!isPrimaryOwnerOnly(ctx)) return true;
    const enabled = await BotConfig.get('adult_mode_enabled', false).catch(() => false);
    if (!enabled) { await portal18.ownerPv(sock, { text: '🛑 Portal OFF. Use: adultmode on' }, ctx); return true; }
    const q = portal18.cleanQuery(args.join(' ') || 'adult video');
    if (portal18.isBlocked(q)) { await portal18.ownerPv(sock, { text: '🚫 Termo bloqueado.' }, ctx); return true; }
    const apiTpl = await BotConfig.get('adult_search_api_url', '').catch(() => '');
    if (!apiTpl) {
      await portal18.ownerPv(sock, { text: `⚠️ API de vídeo não configurada.\nUse: adultapi https://suaapi.com/search?q={query}` }, ctx);
      return true;
    }
    await portal18.ownerPv(sock, { text: `🎬 Buscando vídeos: *${q}*...` }, ctx);
    try {
      const urls = await portal18.fetchAdultVideo(q, apiTpl);
      for (let i = 0; i < urls.length; i++) {
        await portal18.ownerPv(sock, {
          video: { url: urls[i] },
          caption: `🎬 *Vídeo ${i+1}/${urls.length}*\n🔎 ${q}`,
        }, ctx);
        await new Promise(r => setTimeout(r, 1000));
      }
    } catch (e) {
      await portal18.ownerPv(sock, { text: `❌ ${e.message}` }, ctx);
    }
    return true;
  },
  async xvideo(a) { return module.exports.adultvideo(a); },

  // !hotchat [tema] [estilo?] — chat adulto com IA
  async hotchat({ sock, msg, ctx, args }) {
    if (!isPrimaryOwnerOnly(ctx)) return true;
    const enabled = await BotConfig.get('adult_mode_enabled', false).catch(() => false);
    if (!enabled) { await portal18.ownerPv(sock, { text: '🛑 Portal OFF. Use: adultmode on' }, ctx); return true; }

    // Último argumento pode ser o estilo
    const styles = ['sensual', 'picante', 'romantico', 'conto', 'conversa'];
    const lastArg = (args[args.length - 1] || '').toLowerCase();
    let style = 'sensual';
    let themeArgs = args;
    if (styles.includes(lastArg)) {
      style = lastArg;
      themeArgs = args.slice(0, -1);
    }
    const tema = portal18.cleanQuery(themeArgs.join(' ') || 'sedução e desejo adulto');
    if (portal18.isBlocked(tema)) { await portal18.ownerPv(sock, { text: '🚫 Tema bloqueado.' }, ctx); return true; }

    await portal18.ownerPv(sock, { text: `🔥 Gerando chat 18+ [${style}]...` }, ctx);
    try {
      const out = await portal18.hotChatIA(tema, style);
      await portal18.ownerPv(sock, { text: `🥵 *HOTCHAT 18+ — ${style.toUpperCase()}*\n🎭 Tema: _${tema}_\n\n${out}` }, ctx);
    } catch (e) {
      await portal18.ownerPv(sock, { text: `❌ HotChat falhou: ${e.message}` }, ctx);
    }
    return true;
  },

  // !buscalivro [nome] — busca e BAIXA livros
  async buscalivro({ sock, msg, ctx, args }) {
    if (!isPrimaryOwnerOnly(ctx)) return true;
    const enabled = await BotConfig.get('adult_mode_enabled', false).catch(() => false);
    if (!enabled) { await portal18.ownerPv(sock, { text: '🛑 Portal OFF. Use: adultmode on' }, ctx); return true; }
    const query = portal18.cleanQuery(args.join(' ') || 'romance adult passion desire');
    await portal18.ownerPv(sock, { text: '📚 Buscando livros: *' + query + '*...' }, ctx);
    try {
      const books = await portal18.searchBooks(query, 5);
      if (!books.length) throw new Error('Nenhum livro encontrado');

      // Tenta baixar e enviar o primeiro livro com link de download
      let downloaded = false;
      for (const b of books) {
        if (b.downloadUrl) {
          try {
            await portal18.ownerPv(sock, { text: '📥 A baixar: *' + b.title + '* (' + b.downloadExt + ')...' }, ctx);
            const mediaHandler = require('./mediaHandler');
            const buf = await mediaHandler.fetchBuffer(b.downloadUrl, 30000);
            if (buf && buf.length > 500) {
              const ext = b.downloadExt || 'txt';
              const mime = ext === 'epub' ? 'application/epub+zip' : ext === 'html' ? 'text/html' : 'text/plain';
              const fileName = (b.title || 'livro').replace(/[/\\?%*:|"<>]/g, '-').slice(0, 60) + '.' + ext;
              await sock.sendMessage(ctx.senderJid, {
                document: buf,
                fileName,
                mimetype: mime,
                caption: '📚 *' + b.title + '*\n👤 ' + b.author + '\n📡 ' + b.source,
              });
              downloaded = true;
              break;
            }
          } catch {}
        }
      }

      // Se não conseguiu baixar, envia a lista com links
      if (!downloaded) {
        let text = '📚 *LIVROS ENCONTRADOS*\n🔎 Busca: _' + query + '_\n\n';

        for (let i = 0; i < books.length; i++) {
          const b = books[i];
          text += (i+1) + '. *' + b.title + '*\n';
          text += '   👤 ' + b.author + (b.year !== '?' ? '  📅 ' + b.year : '') + '\n';
          if (b.downloadUrl) text += '   📥 ' + b.downloadUrl + '\n';
          else if (b.link) text += '   🔗 ' + b.link + '\n';
          text += '   📡 ' + b.source + '\n\n';
        }
        await portal18.ownerPv(sock, { text: text.trim() }, ctx);
      }
    } catch (e) {
      await portal18.ownerPv(sock, { text: '❌ ' + e.message }, ctx);
    }
    return true;
  },
  // !livros18 — livros adultos populares
  async livros18({ sock, msg, ctx }) {
    if (!isPrimaryOwnerOnly(ctx)) return true;
    const enabled = await BotConfig.get('adult_mode_enabled', false).catch(() => false);
    if (!enabled) { await portal18.ownerPv(sock, { text: '🛑 Portal OFF. Use: adultmode on' }, ctx); return true; }
    await portal18.ownerPv(sock, { text: '📚 Carregando livros 18+ populares...' }, ctx);
    try {
      const books = await portal18.popularBooks18(6);
      let text = `📚 *TOP LIVROS ADULTOS 18+*\n\n`;
      for (let i = 0; i < books.length; i++) {
        const b = books[i];
        text += `${i+1}. *${b.title}*\n   👤 ${b.author}\n`;
        if (b.link) text += `   🔗 ${b.link}\n`;
        text += `\n`;
      }
      text += `📡 Fonte: ${books[0]?.source || 'OpenLibrary'}`;
      await portal18.ownerPv(sock, { text }, ctx);
    } catch (e) {
      await portal18.ownerPv(sock, { text: `❌ ${e.message}` }, ctx);
    }
    return true;
  },




  // ══════════════════════════════════════════════════════════════════════
  // !alugar — Sistema de aluguel de grupos
  // ══════════════════════════════════════════════════════════════════════
  async alugar({ sock, msg, ctx, args, isOwner, config: cfg }) {
    const localConfig = cfg || config;
    const p = localConfig.bot.prefix;

    // Lê lista de donos extra
    const extraOwners = await botConfigCache.get('owner_numbers', []).catch(() => []);
    const ownerNums   = [localConfig.owner.number, ...(Array.isArray(extraOwners) ? extraOwners : [])].map(n => String(n).replace(/\D/g,''));
    const isSubDono   = isOwner || ownerNums.includes(ctx.senderNumber);

    // VIP também pode alugar com limite
    const u = await User.findOne({ whatsappNumber: ctx.senderNumber }).catch(() => null);
    const isVip = u && u.isPremium && u.isPremium();

    if (!isSubDono && !isVip) {
      return reply(sock, msg, ctx,
        `🏠 *Aluguel de Grupo*\n\n` +
        `Este comando só pode ser usado pelo Dono, SubDonos ou utilizadores VIP.\n` +
        `Contacta: wa.me/${localConfig.owner.number}`
      );
    }

    // Formato: !alugar <dias> ou !alugar <jid> <dias>
    let targetJid = ctx.isGroup ? ctx.remoteJid : null;
    let dias = 0;
    if (args.length >= 2 && args[0].includes('@g.us')) {
      targetJid = args[0]; dias = parseInt(args[1]) || 0;
    } else if (args.length >= 1) {
      dias = parseInt(args[0]) || 0;
    }

    if (!targetJid) return reply(sock, msg, ctx, `🏠 Use em grupo ou: ${p}alugar <jid_do_grupo> <dias>`);
    if (dias < 1 || dias > 3650) return reply(sock, msg, ctx, `❌ Uso: ${localConfig.bot.prefix}alugar <dias> (1-3650)\nEx: ${localConfig.bot.prefix}alugar 30`);

    // Verifica limite VIP
    if (!isSubDono && isVip) {
      const vipLimit = u.vipGroupLimit || 3;
      const added    = u.vipGroupsAdded || 0;
      if (added >= vipLimit) {
        return reply(sock, msg, ctx,
          `❌ Limite VIP atingido: *${added}/${vipLimit}* grupos.\n` +
          `Contacta o dono para aumentar o limite.`
        );
      }
      // Incrementa contador do VIP
      await User.findOneAndUpdate(
        { whatsappNumber: ctx.senderNumber },
        { $inc: { vipGroupsAdded: 1 } }
      ).catch(() => {});
    }

    const until = new Date(Date.now() + dias * 24 * 60 * 60 * 1000);
    await GroupSettings.findOneAndUpdate(
      { groupJid: targetJid },
      {
        isHosted:    true,
        hostedUntil: until,
        trialExpiresAt: new Date(0),
        rentedBy:    ctx.senderNumber,
        rentedAt:    new Date(),
        groupName:   ctx.groupName || '',
      },
      { upsert: true, new: true }
    );

    const msg2 =
      `✅ *Aluguel activado!*\n\n` +
      `📋 Grupo: *${ctx.groupName || targetJid}*\n` +
      `⏰ Validade: *${dias} dia(s)*\n` +
      `📅 Expira: *${until.toLocaleDateString('pt-PT')}*\n` +
      `👤 Activado por: *${ctx.pushName}*\n\n` +
      `🚀 Todos os comandos estão agora *ILIMITADOS*!`;

    await reply(sock, msg, ctx, msg2);

    // Avisa no grupo alvo se for diferente
    if (targetJid !== ctx.remoteJid) {
      await sock.sendMessage(targetJid, { text: msg2 }).catch(() => {});
    }
  },

  // Alias: !hospedar
  async hospedar(a) { return module.exports.alugar(a); },

  // !statusalugar — ver estado do aluguel do grupo
  async statusalugar({ sock, msg, ctx }) {
    if (!ctx.isGroup) return reply(sock, msg, ctx, '👥 Só em grupos.');
    const gs = await GroupSettings.findOne({ groupJid: ctx.remoteJid }).lean().catch(() => null);
    if (!gs) return reply(sock, msg, ctx, '❌ Grupo sem configuração.');
    const hosted  = gs.isHosted && (!gs.hostedUntil || new Date(gs.hostedUntil) > new Date());
    const expires = gs.hostedUntil ? new Date(gs.hostedUntil).toLocaleDateString('pt-PT') : '—';
    const cmdsLeft = Math.max(0, 500 - (gs.commandsUsedToday || 0));
    return reply(sock, msg, ctx,
      `╭━━━〔 🏠 ALUGUEL 〕━━━╮\n` +
      `┃ Estado:    ${hosted ? '🟢 ACTIVO' : '🔴 INACTIVO'}\n` +
      `┃ Expira:    ${expires}\n` +
      `┃ Activado:  ${gs.rentedBy || '—'}\n` +
      `┃ Cmds hoje: ${gs.commandsUsedToday || 0}${!hosted ? ` / 500 (${cmdsLeft} restantes)` : ' (ilimitado)'}\n` +
      `╰━━━━━━━━━━━━━━━━━━━━╯`
    );
  },

  // ══════════════════════════════════════════════════════════════════════
  // !mediaup / !mediadown / !medialist — Armazenamento de mídias
  // ══════════════════════════════════════════════════════════════════════

  // ═══ EROME.COM v7 ═══
  async erome({ sock, msg, ctx, args }) {
    const query = args.filter(a => !/^\d+$/.test(a)).join(' ').trim();
    const limit = parseInt(args.find(a => /^\d+$/.test(a))) || 5;
    if (!query) return reply(sock, msg, ctx, '🔍 Uso: *!erome <nome>* [qtd]');
    await sock.sendMessage(ctx.remoteJid, { react: { text: '🔍', key: msg.key } });
    try {
      const erome = require('./erome');
      const results = await erome.search(query);
      if (!results.length) throw new Error('Nenhum resultado para: ' + query);
      await sock.sendMessage(ctx.remoteJid, { text: '🔍 *' + results.length + '* resultados para *' + query + '*' }, { quoted: msg });
      const result = await erome.searchAndDownload(query, Math.min(limit, 20));
      if (!result.media.length) throw new Error('Sem mídias no álbum');
      let sent = 0;
      for (const m of result.media) {
        try {
          if (m.type === 'photo') {
            await sock.sendMessage(ctx.remoteJid, { image: m.buf, caption: sent === 0 ? '📸 *' + result.name + '*' : '' }, { quoted: msg });
          } else if (m.type === 'video') {
            await sock.sendMessage(ctx.remoteJid, { video: m.buf, mimetype: 'video/mp4', caption: '🎬 *' + result.name + '*' }, { quoted: msg });
          }
          sent++;
          await new Promise(r => setTimeout(r, 500));
        } catch {}
      }
      await sock.sendMessage(ctx.remoteJid, { text: '✅ *' + sent + ' mídias enviadas*\n📸 ' + result.totalPhotos + ' fotos | 🎬 ' + result.totalVideos + ' vídeos' }, { quoted: msg });
      await sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } });
    } catch (e) {
      await sock.sendMessage(ctx.remoteJid, { react: { text: '❌', key: msg.key } });
      return reply(sock, msg, ctx, '❌ Erome: ' + e.message);
    }
  },

  async eromevid({ sock, msg, ctx, args }) {
    const query = args.filter(a => !/^\d+$/.test(a)).join(' ').trim();
    const limit = parseInt(args.find(a => /^\d+$/.test(a))) || 3;
    if (!query) return reply(sock, msg, ctx, '🎬 Uso: *!eromevid <nome>* [qtd]');
    await sock.sendMessage(ctx.remoteJid, { react: { text: '🎬', key: msg.key } });
    try {
      const erome = require('./erome');
      const videos = await erome.searchVideos(query, Math.min(limit, 10));
      if (!videos.length) throw new Error('Nenhum vídeo encontrado');
      for (const v of videos) {
        try {
          await sock.sendMessage(ctx.remoteJid, { video: v.buf, mimetype: 'video/mp4', caption: '🎬 *' + (v.name || query) + '*' }, { quoted: msg });
          await new Promise(r => setTimeout(r, 500));
        } catch {}
      }
      await sock.sendMessage(ctx.remoteJid, { text: '✅ *' + videos.length + ' vídeos enviados*' }, { quoted: msg });
      await sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } });
    } catch (e) {
      await sock.sendMessage(ctx.remoteJid, { react: { text: '❌', key: msg.key } });
      return reply(sock, msg, ctx, '❌ Erome: ' + e.message);
    }
  },
  async mediaup({ sock, msg, ctx, args, isOwner, config: cfg }) {
    if (!isOwner) return reply(sock, msg, ctx, '🚫 Só Dono.');
    const localConfig = cfg || config;
    const cloudinary = require('cloudinary').v2;
    const m = msg.message || {};
    const mediaMsg = m.imageMessage || m.videoMessage || m.audioMessage || m.documentMessage
      || m.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage
      || m.extendedTextMessage?.contextInfo?.quotedMessage?.videoMessage;
    if (!mediaMsg) return reply(sock, msg, ctx, '📁 Responde/envias uma mídia com este comando para fazer upload.');
    const name = args.join(' ').trim() || `media_${Date.now()}`;
    await react(sock, msg, '⏳');
    try {
      const buf  = await mediaHandler.downloadFromMessage({ message: { imageMessage: mediaMsg, videoMessage: mediaMsg, audioMessage: mediaMsg } });
      const type = m.imageMessage ? 'image' : m.videoMessage ? 'video' : 'auto';
      const result = await cloudinary.uploader.upload(
        'data:' + (mediaMsg.mimetype || 'image/jpeg') + ';base64,' + buf.toString('base64'),
        { folder: 'darkbot-media', public_id: name.replace(/\s/g,'_'), resource_type: type }
      );
      const Media = require('../database/models/Media');
      await Media.findOneAndUpdate(
        { name },
        { name, type, url: result.secure_url, publicId: result.public_id, size: result.bytes || 0 },
        { upsert: true, new: true }
      );
      await react(sock, msg, '✅');
      return reply(sock, msg, ctx, `✅ *Mídia guardada!*\n\n📂 Nome: *${name}*\n🔗 URL: ${result.secure_url}\n\nUsa: *!mediadown ${name}*`);
    } catch (e) { await react(sock, msg, '❌'); return reply(sock, msg, ctx, '❌ Upload falhou: ' + e.message); }
  },

  async mediadown({ sock, msg, ctx, args }) {
    const name = args.join(' ').trim();
    if (!name) return reply(sock, msg, ctx, '📁 Use: !mediadown <nome>\n\nVer lista: !medialist');
    try {
      const Media = require('../database/models/Media');
      const media = await Media.findOne({ name: { $regex: new RegExp('^' + name, 'i') } });
      if (!media) return reply(sock, msg, ctx, `❌ Mídia "*${name}*" não encontrada.\n\nUsa !medialist para ver a lista.`);
      await react(sock, msg, '⏳');
      const payload = media.type === 'image'
        ? { image: { url: media.url }, caption: `📁 *${media.name}*` }
        : media.type === 'video'
        ? { video: { url: media.url }, caption: `📁 *${media.name}*` }
        : media.type === 'audio'
        ? { audio: { url: media.url }, mimetype: 'audio/mpeg' }
        : { document: { url: media.url }, fileName: media.name };
      await sock.sendMessage(ctx.remoteJid, payload, { quoted: msg });
      await react(sock, msg, '✅');
    } catch (e) { await react(sock, msg, '❌'); return reply(sock, msg, ctx, '❌ ' + e.message); }
  },

  async medialist({ sock, msg, ctx, isOwner }) {
    try {
      const Media = require('../database/models/Media');
      const items = await Media.find().sort({ createdAt: -1 }).limit(30).lean();
      if (!items.length) return reply(sock, msg, ctx, '📭 Nenhuma mídia guardada ainda.\n\nUsa !mediaup para guardar mídias.');
      let text = `╭━━━〔 📁 MEDIA STORAGE 〕━━━╮\n┃ ${items.length} mídias guardadas\n╠━━━━━━━━━━━━━━━━━━━━━━━━━╣\n`;
      items.forEach((m, i) => { text += `┃ ${i+1}. *${m.name}* [${m.type}]\n`; });
      text += `╰━━━━━━━━━━━━━━━━━━━━━━━━━╯\n\n📥 Usar: !mediadown <nome>`;
      if (isOwner) text += `\n📤 Enviar: !mediaup <nome>`;
      return reply(sock, msg, ctx, text);
    } catch (e) { return reply(sock, msg, ctx, '❌ ' + e.message); }
  },

  // !compress [qualidade] — comprime imagem/vídeo marcado
  // Qualidade: 10-100 para imagens (padrão 60), 360/480/720 para vídeo
  async compress({ sock, msg, ctx, args, isOwner }) {
    if (!isOwner) return reply(sock, msg, ctx, '🚫 Só o Dono.');
    await react(sock, msg, '⏳');
    try {
      const compressor = require('./compressor');
      const mediaHandler = require('./mediaHandler');

      // Pega a mídia da mensagem ou da mensagem citada
      const targetMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage || msg.message;
      const imgMsg = targetMsg?.imageMessage;
      const vidMsg = targetMsg?.videoMessage;
      const audMsg = targetMsg?.audioMessage || targetMsg?.documentMessage?.mimetype?.startsWith('audio') ? targetMsg?.documentMessage : null;

      if (!imgMsg && !vidMsg && !audMsg) {
        return reply(sock, msg, ctx, '📦 Uso: *' + (ctx.prefix || '!') + 'compress* [qualidade]\nMarca ou responde a uma imagem/vídeo/áudio.\n\nImagens: qualidade 10-100 (padrão 60)\nVídeos: resolução 360/480/720 (padrão 480)\nÁudio: bitrate 64k/96k/128k (padrão 96k)');
      }

      const quality = args[0] || null;
      const buf = await mediaHandler.downloadFromMessage({ message: targetMsg });
      if (!buf || buf.length < 100) throw new Error('Mídia vazia');

      const originalSize = buf.length;
      const { buf: compressed, type } = compressor.autoCompress(buf, quality);
      const newSize = compressed.length;
      const saved = ((1 - newSize / originalSize) * 100).toFixed(0);

      const caption = '📦 *Compressão OK*\n📏 Original: ' + (originalSize / 1024).toFixed(0) + ' KB\n📉 Comprimido: ' + (newSize / 1024).toFixed(0) + ' KB\n💾 Economia: ' + saved + '%';

      if (type === 'image') {
        await sock.sendMessage(ctx.remoteJid, { image: compressed, caption }, { quoted: msg });
      } else if (type === 'video') {
        await sock.sendMessage(ctx.remoteJid, { video: compressed, mimetype: 'video/mp4', caption }, { quoted: msg });
      } else if (type === 'audio') {
        await sock.sendMessage(ctx.remoteJid, { audio: compressed, mimetype: 'audio/mpeg', ptt: false, caption }, { quoted: msg });
      }

      await react(sock, msg, '✅');
    } catch (e) {
      await react(sock, msg, '❌');
      return reply(sock, msg, ctx, '❌ Compressão falhou: ' + e.message);
    }
  },

  async mediadel({ sock, msg, ctx, args, isOwner }) {
    if (!isOwner) return reply(sock, msg, ctx, '🚫 Só Dono.');
    const name = args.join(' ').trim();
    if (!name) return reply(sock, msg, ctx, '📁 Use: !mediadel <nome>');
    try {
      const Media = require('../database/models/Media');
      const media = await Media.findOne({ name: { $regex: new RegExp('^' + name, 'i') } });
      if (!media) return reply(sock, msg, ctx, '❌ Não encontrado.');
      // Tenta apagar do Cloudinary
      if (media.publicId) {
        const cloudinary = require('cloudinary').v2;
        await cloudinary.uploader.destroy(media.publicId, { resource_type: media.type === 'video' ? 'video' : 'image' }).catch(() => {});
      }
      await media.deleteOne();
      return reply(sock, msg, ctx, `✅ Mídia *${name}* apagada.`);
    } catch (e) { return reply(sock, msg, ctx, '❌ ' + e.message); }
  },

  // ══════════════════════════════════════════════════════════════════════
  // !stickerrename / !renomear — renomear QUALQUER sticker (pack + autor)
  // v7.1 — reescreve só os metadados do webp original: preserva animação.
  // ══════════════════════════════════════════════════════════════════════
  async stickerrename({ sock, msg, ctx, args }) {
    return require('./stickerRename').renomear({
      sock, ctx,
      m: { msg },
      args,
      prefix: (config.bot && config.bot.prefix) || '!',
      reply: (t) => reply(sock, msg, ctx, t),
      react: (e) => react(sock, msg, e),
    });
  },

  // !pinterest <busca> — Carousel com imagens do Pinterest
  // Cada card: imagem + descrição + botão Criar Sticker + botão Abrir Link
  async pinterest({ sock, msg, ctx, args, config: cfg }) {
    const localConfig = cfg || config;
    const p = localConfig.bot.prefix;
    const query = args.join(' ').trim();

    if (!query) return reply(sock, msg, ctx,
      `╔━᳀『 📌 *PINTEREST* 』═᳀\n` +
      `\n  ⌬ *Uso:* ${p}pinterest <busca>\n` +
      `  ⌬ *Ex:* ${p}pinterest anime dark aesthetic\n` +
      `  ⌬ *Ex:* ${p}pinterest peaky blinders\n\n` +
      `  ⌬ ${p}pinpacks <busca> — pack de stickers\n` +
      `  ⌬ ${p}pinmp4 <link>   — vídeo do Pinterest\n` +
      `╚═━═━═━═━═━═━═━═━═━═᳀`
    );

    await react(sock, msg, '⏳');

    try {
      const SZ = 'https://api.siputzx.my.id/api';
      const r  = await mediaHandler.fetchJson(`${SZ}/s/pinterest?query=${encodeURIComponent(query)}`, 20000);
      const items = (r?.data || [])
        .filter(x => x?.image_url && /^https?/i.test(x.image_url))
        .slice(0, 8);

      if (!items.length) throw new Error('Sem imagens encontradas.');

      const { generateWAMessageFromContent, prepareWAMessageMedia } = require('@systemzero/baileys');

      const cards = [];
      for (const item of items) {
        // Prepara imagem do card
        let imageMessage = null;
        try {
          const media = await prepareWAMessageMedia(
            { image: { url: item.image_url } },
            { upload: sock.waUploadToServer }
          );
          imageMessage = media?.imageMessage || null;
        } catch {}

        const desc = (item.description || item.grid_title || query).slice(0, 80);
        const pinUrl = item.pin || item.image_url;

        cards.push({
          header: imageMessage
            ? { hasMediaAttachment: true, imageMessage }
            : { hasMediaAttachment: false },
          body:   { text: desc },
          footer: { text: `📌 Pinterest × ${localConfig.bot.name}` },
          nativeFlowMessage: {
            buttons: [
              // Botão 1: Criar Sticker desta imagem
              {
                name: 'quick_reply',
                buttonParamsJson: JSON.stringify({
                  display_text: '🎨 Criar Sticker',
                  id: `${p}pinsticker ${item.image_url}`,
                }),
              },
              // Botão 2: Abrir link no Pinterest
              {
                name: 'cta_url',
                buttonParamsJson: JSON.stringify({
                  display_text: '🔗 Abrir link',
                  url: pinUrl,
                  merchant_url: pinUrl,
                }),
              },
            ],
          },
        });
      }

      const msgObj = generateWAMessageFromContent(ctx.remoteJid, {
        interactiveMessage: {
          body:   { text: `📌 *Pinterest — ${query}*\n${items.length} imagens encontradas` },
          footer: { text: localConfig.bot.name + ' 🕸️' },
          carouselMessage: { cards },
        },
      }, { userJid: sock.user?.id, quoted: msg });

      await sock.relayMessage(ctx.remoteJid, msgObj.message, {
        messageId: msgObj.key.id,
        additionalNodes: [{ tag: 'biz', attrs: {}, content: [{
          tag: 'interactive', attrs: { type: 'native_flow', v: '1' },
          content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }],
        }]}],
      });
      await react(sock, msg, '✅');

    } catch (e) {
      // Fallback: envia individualmente
      try {
        const SZ = 'https://api.siputzx.my.id/api';
        const r2 = await mediaHandler.fetchJson(`${SZ}/s/pinterest?query=${encodeURIComponent(query)}`, 20000);
        const imgs = (r2?.data || []).filter(x => x?.image_url).slice(0, 5);
        if (imgs.length) {
          await reply(sock, msg, ctx, `📌 *Pinterest* — ${query}\n${imgs.length} imagens`);
          for (let i = 0; i < imgs.length; i++) {
            await sock.sendMessage(ctx.remoteJid, {
              image: { url: imgs[i].image_url },
              caption: `📌 ${i+1}/${imgs.length} — ${(imgs[i].description||query).slice(0,60)}\n\n🎨 *${localConfig.bot.prefix}pinsticker ${imgs[i].image_url}*`,
            }, { quoted: msg });
            await new Promise(r => setTimeout(r, 500));
          }
          await react(sock, msg, '✅');
          return;
        }
      } catch {}
      await react(sock, msg, '❌');
      return reply(sock, msg, ctx, '❌ Pinterest falhou. Tente de novo.');
    }
  },

  // !pinsticker <url> — converte imagem do Pinterest em sticker
  async pinsticker({ sock, msg, ctx, args, config: cfg }) {
    const localConfig = cfg || config;
    const url = args.join(' ').trim();
    if (!url || !/^https?/i.test(url)) return reply(sock, msg, ctx, `🎨 Uso: ${(cfg||config).bot.prefix}pinsticker <url da imagem>`);
    await react(sock, msg, '⏳');
    try {
      const buf = await mediaHandler.fetchBuffer(url);
      if (!buf || buf.length < 500) throw new Error('imagem vazia');
      const stk = await stickerMaker.create(buf, {
        botName:   localConfig.bot.name,
        ownerName: localConfig.owner.name,
        userName:  ctx.pushName,
        groupName: ctx.groupName || 'PV',
        isVideo:   false,
        full:      true,   // sfull — preenche formato completo sem cortar
      });
      await sock.sendMessage(ctx.remoteJid, { sticker: stk });
      await react(sock, msg, '✅');
    } catch (e) {
      await react(sock, msg, '❌');
      return reply(sock, msg, ctx, '❌ Falha ao criar sticker: ' + e.message);
    }
  },

    // !pinpacks <nome> — busca pack de stickers no Pinterest
  async pinpacks({ sock, msg, ctx, args, config: cfg }) {
    const localConfig = cfg || config;
    const query = args.join(' ').trim();
    const RE = require('./renderEngine');
    const t = await RE.getTheme(ctx.remoteJid);
    const pe = require('./prefixEngine');
    const pfx = await pe.getActivePrefix(ctx.remoteJid).catch(() => localConfig.bot.prefix);

    if (!query) return reply(sock, msg, ctx,
      RE.renderBlock(t, 'PINPACKS', [
        'Busca no Pinterest e manda',
        'o *pack completo de uma vez*.',
        '',
        `*${pfx}pinpacks* <nome>`,
        `Ex: *${pfx}pinpacks* Neymar`,
        '',
        `Se o grupo tiver *${pfx}definestickwm*,`,
        'a marca entra no pack pronto.',
      ], { botName: localConfig.bot.name })
    );

    await react(sock, msg, t.react || '⏳');
    // Título do PACOTE (como "Neymar" na imagem) — não o nome do canal
    const packName = String(query).replace(/\s+/g, ' ').trim().slice(0, 32) || 'DARK PACK';
    const wmMod = require('./stickerWm');
    let packAuthor = wmMod.DEFAULT_BRAND || 'DARK NET 🕸️';
    let packDescription = packAuthor;
    let groupWm = null;
    try {
      groupWm = await wmMod.getForJid(ctx.remoteJid);
      if (groupWm?.enabled) {
        packAuthor = groupWm.authorName || packAuthor;
        packDescription = groupWm.description || packAuthor;
      }
    } catch {}
    // UM pack ID para TODOS os stickers → WhatsApp abre "Adicionar às suas figurinhas"
    const packId = typeof stickerMaker.makePackId === 'function'
      ? stickerMaker.makePackId(query)
      : `com.darkbot.pack.${Date.now().toString(16)}`;

    const progMsg = await sock.sendMessage(ctx.remoteJid, {
      text: RE.renderBlock(t, 'PINPACKS', [`Pack: *${query}*`, '⏳ A buscar imagens...'], { botName: localConfig.bot.name }),
    }, { quoted: msg });

    try {
      let items = [];
      const apis = [
        { url: 'https://api.siputzx.my.id/api/s/pinterest?query=', ext: r => r?.data },
        { url: 'https://api.lolhuman.xyz/api/pinterest?query=', key: '&apikey=darkbot', ext: r => r?.result },
      ];
      for (const api of apis) {
        try {
          const r = await mediaHandler.fetchJson(api.url + encodeURIComponent(query + ' aesthetic') + (api.key || ''), 15000);
          items = (api.ext(r) || []).filter(x => x?.image_url && /^https?/i.test(x.image_url) && x.type !== 'video');
          if (items.length >= 4) break;
        } catch {}
      }
      items = items.slice(0, 29);
      if (!items.length) throw new Error('Sem imagens encontradas.');

      await sock.sendMessage(ctx.remoteJid, {
        text: RE.renderBlock(t, 'PINPACKS', [`Pack: *${query}*`, `📥 ${items.length} imagens`, '⚙️ A converter...'], { botName: localConfig.bot.name }),
        edit: progMsg.key,
      });

      const stickers = [];
      const thumbBufs = [];
      const total = items.length;
      for (let i = 0; i < total; i++) {
        try {
          const imgBuf = await mediaHandler.fetchBuffer(items[i].image_url);
          if (!imgBuf || imgBuf.length < 1000) continue;
          const stk = await stickerMaker.create(imgBuf, {
            packName, authorName: packAuthor,
            botName: localConfig.bot.name, ownerName: localConfig.owner.name,
            userName: ctx.pushName, groupName: ctx.groupName || 'Pack', isVideo: false,
            packId,
            searchQuery: packName,
            remoteJid: ctx.remoteJid,
            skipGroupWm: true,
          });
          if (stk && stk.length > 50) {
            stickers.push(stk);
            if (thumbBufs.length < 4) thumbBufs.push(imgBuf);
          }
        } catch {}
        // Barra de progresso visual
        if ((i + 1) % 3 === 0 || i === total - 1) {
          const pct = Math.round(((i + 1) / total) * 100);
          const filled = Math.round(pct / 5);
          const bar = '█'.repeat(filled) + '░'.repeat(20 - filled);
          await sock.sendMessage(ctx.remoteJid, {
            text: RE.renderBlock(t, 'PINPACKS', [
              '⏳ Montando pack de *' + query + '*',
              '[' + bar + '] ' + pct + '% (' + (i + 1) + '/' + total + ')',
            ], { botName: localConfig.bot.name }),
            edit: progMsg.key,
          }).catch(() => {});
        }
      }
      if (!stickers.length) throw new Error('Nenhuma imagem convertida.');

      // Pack pronto: nome da pesquisa na descrição + .definestickwm se o grupo tiver
      const finished = await stickerPack.finishSearchPack(stickers, {
        query: packName, jid: ctx.remoteJid, packId,
      });
      stickers.splice(0, stickers.length, ...finished.stickers);
      packAuthor = finished.authorName;
      packDescription = finished.description;
      groupWm = finished.wm;

      // Cache para takepack
      _packCache.set(finished.packId, { stickers, info: { name: finished.name, author: packAuthor, query, count: stickers.length }, ts: Date.now() });

      const sentAsPack = await sendNativeStickerPack(sock, ctx.remoteJid, stickers, {
        name: finished.name,
        publisher: finished.publisher,
        description: finished.description,
        packId: finished.packId,
        quoted: msg,
      });
      if (!sentAsPack) {
        await Promise.all(stickers.map((stk) => sock.sendMessage(ctx.remoteJid, { sticker: stk })));
      }

      const doneLines = [
        '✅ Pacote *' + finished.name + '* enviado de uma vez',
        stickers.length + ' figurinha(s) dentro do pack',
        '',
        'Descrição:',
        finished.description,
      ];
      doneLines.push('', 'Toque no pack → *Adicionar às suas figurinhas*');

      await sock.sendMessage(ctx.remoteJid, {
        text: RE.renderBlock(t, 'PINPACKS', doneLines, { botName: localConfig.bot.name }),
      }, { quoted: msg });

      await react(sock, msg, t.react || '✅');
    } catch (e) {
      await sock.sendMessage(ctx.remoteJid, {
        text: RE.renderBlock(t, 'ERRO', ['❌ ' + e.message], { botName: localConfig.bot.name }),
        edit: progMsg.key,
      });
      await react(sock, msg, '❌');
    }
  },

  // ── takepack: envia os stickers do cache ──
  async takepack({ sock, msg, ctx, args, config: cfg }) {
    const localConfig = cfg || config;
    const packId = args[0]?.trim();
    if (!packId || !_packCache.has(packId)) return reply(sock, msg, ctx, '❌ Pack expirado. Usa !pinpacks <nome> para criar um novo.');
    const { stickers, info } = _packCache.get(packId);
    await react(sock, msg, '📦');
    for (let i = 0; i < stickers.length; i++) {
      await sock.sendMessage(ctx.remoteJid, { sticker: stickers[i], packId: packId, isPremium: false });
      // Sem delay — WhatsApp agrupa como pack instantaneamente
    }
    const RE = require('./renderEngine');
    const t = await RE.getTheme(ctx.remoteJid);
    await reply(sock, msg, ctx, RE.renderBlock(t, 'PACK ENVIADO', [`📦 *${info.name}*`, `🎨 ${info.count} stickers`, `👤 ${info.author}`, '', '💡 Guarda qualquer sticker para ver o pack completo!'], { botName: localConfig.bot.name }));
    _packCache.delete(packId);
  },

  // !pinvd <nome> — busca vídeo no Pinterest por nome
  async pinvd({ sock, msg, ctx, args }) {
    const query = args.join(' ').trim();
    if (!query) return reply(sock, msg, ctx, '🎬 Use: !pinvd <nome>\nEx: !pinvd anime fight scene');
    await react(sock, msg, '⏳');
    try {
      const results = await downloader.pinterestSearch(query);
      if (!results?.length) throw new Error('Sem resultados');
      // Filtra por resultados com URL de vídeo
      const vids = results.filter(r => r?.url && /\.mp4|\.m4v|video/i.test(r.url)).slice(0, 2);
      if (!vids.length) {
        // Tenta via URL directa — busca link do Pinterest e tenta !pinmp4
        const firstUrl = results[0]?.sourceUrl || results[0]?.url || '';
        if (/pinterest\.com/i.test(firstUrl)) {
          const r = await downloader.pinterest(firstUrl);
          if (r?.url) {
            await sendVideoFromUrl(sock, ctx.remoteJid, r.buffer || r.url, `🎬 *${query}*`, msg, { title: query });
            await react(sock, msg, '✅'); return;
          }
        }
        throw new Error('Nenhum vídeo MP4 encontrado. Tenta com url directa: !pinmp4 <url>');
      }
      for (const vid of vids) {
        await sendVideoFromUrl(sock, ctx.remoteJid, vid.url, `🎬 *${query}*`, msg, { title: query });
        await new Promise(r => setTimeout(r, 800));
      }
      await react(sock, msg, '✅');
    } catch (e) { await react(sock, msg, '❌'); return reply(sock, msg, ctx, '❌ ' + e.message); }
  },

  // !rank — ranking geral de aura/coins do grupo
  async rank({ sock, msg, ctx }) {
    if (!ctx.isGroup) return reply(sock, msg, ctx, '👥 Ranking só funciona em grupos.');
    try {
      const Economy = require('../database/models/Economy');
      const meta = ctx.groupMeta || await sock.groupMetadata(ctx.remoteJid);
      const memberNums = (meta.participants || []).map(p => p.id.split('@')[0].replace(/\D/g,''));
      const ecos = await Economy.find({ whatsappNumber: { $in: memberNums } })
        .sort({ aura: -1 }).limit(15).lean();
      if (!ecos.length) return reply(sock, msg, ctx, '📊 Nenhum utilizador com dados de aura neste grupo ainda.');
      const mentions = ecos.map(e => `${e.whatsappNumber}@s.whatsapp.net`);
      let text = `╭━━━〔 ⚡ RANK AURA — ${ctx.groupName} 〕━━━╮\n`;
      ecos.forEach((e, i) => {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}.`;
        text += `┃ ${medal} @${e.whatsappNumber} — ⚡ *${e.aura || 0}* aura | 💰 *${e.coins || 0}*\n`;
      });
      text += `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`;
      return sock.sendMessage(ctx.remoteJid, { text, mentions }, { quoted: msg });
    } catch (e) { return reply(sock, msg, ctx, '❌ Ranking falhou: ' + e.message); }
  },

  // !rankcoins — ranking de moedas
  async rankcoins({ sock, msg, ctx }) {
    if (!ctx.isGroup) return reply(sock, msg, ctx, '👥 Só em grupos.');
    try {
      const Economy = require('../database/models/Economy');
      const meta = ctx.groupMeta || await sock.groupMetadata(ctx.remoteJid);
      const nums = (meta.participants || []).map(p => p.id.split('@')[0].replace(/\D/g,''));
      const ecos = await Economy.find({ whatsappNumber: { $in: nums } }).sort({ coins: -1 }).limit(10).lean();
      const mentions = ecos.map(e => `${e.whatsappNumber}@s.whatsapp.net`);
      let text = `╭━━━〔 💰 RANK COINS — ${ctx.groupName} 〕━━━╮\n`;
      ecos.forEach((e, i) => {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}.`;
        text += `┃ ${medal} @${e.whatsappNumber} — 💰 *${e.coins || 0}* coins\n`;
      });
      text += `╰━━━━━━━━━━━━━━━━━━━━━━━━━╯`;
      return sock.sendMessage(ctx.remoteJid, { text, mentions }, { quoted: msg });
    } catch (e) { return reply(sock, msg, ctx, '❌ ' + e.message); }
  },

  // Aliases
  async mup(a) { return module.exports.mediaup(a); },
  async mdown(a) { return module.exports.mediadown(a); },
  async mlist(a) { return module.exports.medialist(a); },
  async mdel(a) { return module.exports.mediadel(a); },

  // ══════════════════════════════════════════════════════════════════════

    async animeapi({ sock, msg, ctx, args, isOwner }) {
    if (!isOwner) return reply(sock, msg, ctx, '🚫 Só Dono pode configurar API de anime.');
    const url = args.join(' ').trim();
    if (!url || !/^https?:\/\//i.test(url) || !/(\{query\}|\{q\})/i.test(url)) {
      return reply(sock, msg, ctx,
        '📺 *Configurar API de anime dublado*\n\n' +
        'Use uma URL template que retorne JSON com link MP4/M3U8.\n\n' +
        'Exemplo:\n' +
        'animeapi https://api.exemplo.com/anime?search={query}&ep={episode}&lang={lang}\n\n' +
        'Variáveis: {query}, {episode}, {lang}.');
    }
    await BotConfig.set('anime_download_api_url', url);
    botConfigCache.clear();
    return reply(sock, msg, ctx, '✅ API de anime configurada. Teste com: animedl Naruto | 1');
  },

  async animedl({ sock, msg, ctx, args, isOwner }) {
    const raw = args.join(' ').trim();
    if (!raw) return reply(sock, msg, ctx, '📺 Use: animedl Naruto | 1\nOu: animedl One Piece | 1089 | pt-BR');
    const allowed = isOwner || (ctx.userData && ctx.userData.isPremium && ctx.userData.isPremium());
    if (!allowed) return reply(sock, msg, ctx, '⭐ Download de episódio é Premium/Owner. Use vip para liberar.');
    const tpl = await BotConfig.get('anime_download_api_url', '').catch(() => '');
    if (!tpl) return reply(sock, msg, ctx, '⚠️ API de anime não configurada. Dono use: animeapi <url com {query}>');
    const parts = raw.split('|').map(x => x.trim()).filter(Boolean);
    const query = parts[0] || '';
    const episode = parts[1] || '1';
    const lang = parts[2] || 'pt-BR';
    if (!query) return reply(sock, msg, ctx, '📺 Informe o nome do anime. Ex: animedl Naruto | 1');
    await react(sock, msg, '📺');
    try {
      const apiUrl = fillAnimeApiTemplate(tpl, { query, episode, lang });
      const data = await mediaHandler.fetchJson(apiUrl, 45000);
      const urls = deepMediaUrls(data);
      const mediaUrl = urls.find(u => /\.(mp4|m3u8|webm|mov|mkv)(?:[?#]|$)|video|stream|download/i.test(u));
      if (!mediaUrl) throw new Error('API não retornou link de vídeo válido');
      const title = data?.title || data?.anime?.title || data?.name || `${query} EP ${episode}`;
      const caption = `╭━━━〔 📺 ANIME DUBLADO 〕━━━╮\n` +
        `┃ Anime: *${query}*\n` +
        `┃ Episódio: *${episode}*\n` +
        `┃ Idioma: *${lang}*\n` +
        `┃ Fonte: API configurada pelo dono\n` +
        `╰━━━〔 DARK STREAM TEST ⚡ 〕━━━╯`;
      if (/\.m3u8(?:[?#]|$)/i.test(mediaUrl)) {
        await sock.sendMessage(ctx.remoteJid, { text: `${caption}\n\n🔗 Stream HLS:\n${mediaUrl}` }, { quoted: msg });
      } else {
        await sendVideoFromUrl(sock, ctx.remoteJid, mediaUrl, caption, msg, { title, safeMp4: false });
      }
      await react(sock, msg, '✅');
    } catch (e) {
      await react(sock, msg, '❌');
      return reply(sock, msg, ctx, `❌ Anime download falhou: ${e.message}\nVerifique se a API retorna JSON com link MP4/M3U8.`);
    }
  },
  async animedub(a) { return module.exports.animedl(a); },
  async animebr(a) { return module.exports.animedl(a); },

  async apigratis({ sock, msg, ctx }) {
    return reply(sock, msg, ctx, `╭━━━〔 🌐 FREE API TOOLS 〕━━━╮\n` +
      `┃ conselho — conselho aleatório\n` +
      `┃ fato — curiosidade aleatória\n` +
      `┃ pais <nome> — info de país\n` +
      `┃ cambio <moeda> — câmbio atual\n` +
      `┃ cripto [btc|eth|sol] — preço cripto\n` +
      `┃ dog — foto de cachorro\n` +
      `┃ cat — foto de gato\n` +
      `┃ ipinfo <ip> — informação de IP\n` +
      `╰━━━〔 ᴅᴀʀᴋ ᴡᴇʙ ᴛᴏᴏʟs ⚡ 〕━━━╯`);
  },

  async conselho({ sock, msg, ctx }) {
    try {
      const r = await mediaHandler.fetchJson('https://api.adviceslip.com/advice', 12000);
      return reply(sock, msg, ctx, `💡 *CONSELHO DARK*\n\n${r?.slip?.advice || 'Siga com foco e disciplina.'}`);
    } catch { return reply(sock, msg, ctx, '❌ Conselho indisponível agora.'); }
  },

  async fato({ sock, msg, ctx }) {
    try {
      const r = await mediaHandler.fetchJson('https://uselessfacts.jsph.pl/api/v2/facts/random?language=en', 12000);
      return reply(sock, msg, ctx, `🧠 *FATO ALEATÓRIO*\n\n${r?.text || 'Sem fato agora.'}`);
    } catch { return reply(sock, msg, ctx, '❌ Fatos indisponíveis agora.'); }
  },

  async pais({ sock, msg, ctx, args }) {
    const q = args.join(' ').trim();
    if (!q) return reply(sock, msg, ctx, '🌍 Use: pais Angola');
    try {
      const arr = await mediaHandler.fetchJson(`https://restcountries.com/v3.1/name/${encodeURIComponent(q)}?fields=name,capital,region,subregion,population,currencies,languages,flags`, 15000);
      const c = Array.isArray(arr) ? arr[0] : null;
      if (!c) throw new Error('não encontrado');
      const currencies = c.currencies ? Object.entries(c.currencies).map(([k,v]) => `${k} (${v.name})`).join(', ') : '—';
      const langs = c.languages ? Object.values(c.languages).join(', ') : '—';
      const text = `╭━━━〔 🌍 PAÍS 〕━━━╮\n` +
        `┃ Nome: *${c.name?.common || q}*\n` +
        `┃ Capital: *${(c.capital || ['—'])[0]}*\n` +
        `┃ Região: *${c.region || '—'}* / ${c.subregion || '—'}\n` +
        `┃ População: *${Number(c.population || 0).toLocaleString('pt-BR')}*\n` +
        `┃ Moeda: *${currencies}*\n` +
        `┃ Línguas: *${langs}*\n` +
        `╰━━━〔 ᴅᴀʀᴋ ɢᴇᴏ ⚡ 〕━━━╯`;
      if (c.flags?.png) return sock.sendMessage(ctx.remoteJid, { image: { url: c.flags.png }, caption: text }, { quoted: msg });
      return reply(sock, msg, ctx, text);
    } catch { return reply(sock, msg, ctx, '❌ País não encontrado.'); }
  },

  async cambio({ sock, msg, ctx, args }) {
    const base = (args[0] || 'USD').toUpperCase();
    try {
      const r = await mediaHandler.fetchJson(`https://open.er-api.com/v6/latest/${encodeURIComponent(base)}`, 15000);
      if (r?.result !== 'success') throw new Error('falhou');
      const rates = r.rates || {};
      const keys = ['AOA','BRL','EUR','USD','GBP','ZAR','CNY'];
      const lines = keys.filter(k => rates[k]).map(k => `┃ ${base} → ${k}: *${Number(rates[k]).toLocaleString('pt-BR', { maximumFractionDigits: 4 })}*`);
      return reply(sock, msg, ctx, `╭━━━〔 💱 CÂMBIO 〕━━━╮\n${lines.join('\n')}\n╰━━━〔 Atualização: ${r.time_last_update_utc || 'agora'} 〕━━━╯`);
    } catch { return reply(sock, msg, ctx, '❌ Câmbio indisponível agora.'); }
  },

  async cripto({ sock, msg, ctx, args }) {
    const map = { btc: 'bitcoin', bitcoin: 'bitcoin', eth: 'ethereum', ethereum: 'ethereum', sol: 'solana', solana: 'solana', bnb: 'binancecoin', doge: 'dogecoin' };
    const id = map[(args[0] || 'btc').toLowerCase()] || (args[0] || 'bitcoin').toLowerCase();
    try {
      const r = await mediaHandler.fetchJson(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=usd,eur,brl&include_24hr_change=true`, 15000);
      const d = r[id]; if (!d) throw new Error('não encontrado');
      return reply(sock, msg, ctx, `╭━━━〔 🪙 CRIPTO 〕━━━╮\n┃ Ativo: *${id}*\n┃ USD: *$${d.usd}*\n┃ EUR: *€${d.eur}*\n┃ BRL: *R$${d.brl}*\n┃ 24h: *${Number(d.usd_24h_change || 0).toFixed(2)}%*\n╰━━━〔 CoinGecko Free 〕━━━╯`);
    } catch { return reply(sock, msg, ctx, '❌ Cripto indisponível agora.'); }
  },

  async dog({ sock, msg, ctx }) {
    try { const r = await mediaHandler.fetchJson('https://dog.ceo/api/breeds/image/random', 12000); return sock.sendMessage(ctx.remoteJid, { image: { url: r.message }, caption: '🐶 *DOG API*' }, { quoted: msg }); }
    catch { return reply(sock, msg, ctx, '❌ Dog API falhou.'); }
  },

  async cat({ sock, msg, ctx }) {
    try { const r = await mediaHandler.fetchJson('https://api.thecatapi.com/v1/images/search', 12000); return sock.sendMessage(ctx.remoteJid, { image: { url: r?.[0]?.url }, caption: '🐱 *CAT API*' }, { quoted: msg }); }
    catch { return reply(sock, msg, ctx, '❌ Cat API falhou.'); }
  },

  async ipinfo({ sock, msg, ctx, args }) {
    const ip = args[0] || '';
    if (!ip) return reply(sock, msg, ctx, '🌐 Use: ipinfo 8.8.8.8');
    try {
      const r = await mediaHandler.fetchJson(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,message,query,country,regionName,city,isp,org,as,lat,lon,timezone`, 12000);
      if (r.status !== 'success') throw new Error(r.message || 'falhou');
      return reply(sock, msg, ctx, `╭━━━〔 🌐 IP INFO 〕━━━╮\n┃ IP: *${r.query}*\n┃ País: *${r.country}*\n┃ Cidade: *${r.city || '—'}*\n┃ Região: *${r.regionName || '—'}*\n┃ ISP: *${r.isp || '—'}*\n┃ Org: *${r.org || '—'}*\n┃ AS: *${r.as || '—'}*\n┃ TZ: *${r.timezone || '—'}*\n╰━━━━━━━━━━━━━━╯`);
    } catch { return reply(sock, msg, ctx, '❌ IP info indisponível.'); }
  },

  async adultvideo({ sock, msg, ctx, args }) {
    if (!isPrimaryOwnerOnly(ctx)) return true;
    const q = adultCleanQuery(args.join(' '));
    if (!q) { await ownerPv(sock, ctx, { text: 'Use: adultvideo <termo adulto legal>' }); return true; }
    if (adultBlockedQuery(q)) { await ownerPv(sock, ctx, { text: '🚫 Termo bloqueado por segurança/legalidade.' }); return true; }
    const enabled = await BotConfig.get('adult_mode_enabled', false).catch(() => false);
    if (!enabled) { await ownerPv(sock, ctx, { text: '🛑 Portal 18+ OFF. Use: adultmode on' }); return true; }
    const apiTpl = await BotConfig.get('adult_search_api_url', '').catch(() => '');
    if (!apiTpl) { await ownerPv(sock, ctx, { text: '⚠️ Configure uma API legal: adultapi https://...{query}' }); return true; }
    try {
      const data = await mediaHandler.fetchJson(apiTpl.replace(/\{query\}/g, encodeURIComponent(q)), 20000);
      const urls = deepAdultMediaUrls(data).filter(u => /\.(mp4|webm|mov)(?:[?#]|$)|video/i.test(u)).slice(0, 3);
      if (!urls.length) throw new Error('sem vídeos');
      for (let i = 0; i < urls.length; i++) await ownerPv(sock, ctx, { video: { url: urls[i] }, caption: `🔞 Adult video ${i+1}/${urls.length}\n🔎 ${q}` });
    } catch (e) { await ownerPv(sock, ctx, { text: `❌ adultvideo falhou: ${e.message}` }); }
    return true;
  },


  async themeglobal({ sock, msg, ctx, args, isOwner }) {
    if (!isOwner) return reply(sock, msg, ctx, '🚫 Só Dono.');
    const v = (args[0] || 'status').toLowerCase();
    if (!['on','off'].includes(v)) {
      const cur = await BotConfig.get('theme_apply_all', false).catch(() => false);
      return reply(sock, msg, ctx, `🎭 *Tema global nas respostas*\n\nStatus: *${cur ? 'ON' : 'OFF'}*\n\nUse:\nthemeglobal on\nthemeglobal off`);
    }
    await BotConfig.set('theme_apply_all', v === 'on'); botConfigCache.clear();
    return reply(sock, msg, ctx, `✅ Tema global nas respostas: *${v.toUpperCase()}*`);
  },


  async menuaudio({ sock, msg, ctx }) {
    return reply(sock, msg, ctx, `╔━᳀『 *EFEITOS DE ÁUDIO* 』═᳀\n\n⌬ _Marque um áudio e use o comando_\n\n╔━᳀『 *🔊 Bass* 』\n⌬ bass / bass2 / bass3\n\n╔━᳀『 *🎸 Grave* 』\n⌬ grave / grave2 / grave3\n\n╔━᳀『 *🌀 Reverb* 』\n⌬ reverb / reverb2 / reverb3\n\n╔━᳀『 *🎧 8D* 』\n⌬ 8d / 8d2 / 8d3\n\n╔━᳀『 *🐢 Slowed* 』\n⌬ slowed / slowed2 / slowed3\n\n╔━᳀『 *🌊 Slowed + Reverb* 』\n⌬ slowedreverb / slowedreverb2 / slowedreverb3\n\n╔━᳀『 *🎤 Chorus* 』\n⌬ chorus / chorus2 / chorus3\n\n╔━᳀『 *⚡ Velocidade* 』\n⌬ fast / slow / nightcore / vaporwave / hardcore\n\n╔━᳀『 *🎭 Voz* 』\n⌬ robot / chipmunk / squirrel / monster / whisper / pitch / deep\n\n╔━᳀『 *🌊 Ambiente* 』\n⌬ echo / stadium / cave / underwater / telephone / radio / lofi\n\n╔━᳀『 *🎛️ Modulação* 』\n⌬ flanger / phaser / tremolo / vibrato / reverse / karaoke / blown / earrape / fat / smooth\n\n╚═━═━═━═━═━═━═━═━═━═᳀\n\n> Dark bot`);
  },

  async audiofx({ sock, msg, ctx, args }) {
    const effect = (args[0] || '').toLowerCase();
    if (!AUDIO_EFFECTS[effect]) return module.exports.menuaudio({ sock, msg, ctx });
    const src = getQuotedAudioMessage(msg);
    if (!src) return reply(sock, msg, ctx, `🎧 Responda/marque um áudio com *${effect}*.`);
    await react(sock, msg, '🎛️');
    try {
      const input = await mediaHandler.downloadFromMessage(src);
      const out = processAudioEffect(input, AUDIO_EFFECTS[effect], effect);
      await sock.sendMessage(ctx.remoteJid, { audio: out, mimetype: 'audio/mpeg', fileName: `dark-${effect}.mp3`, ptt: false }, { quoted: msg });
      await react(sock, msg, '✅');
    } catch (e) { await react(sock, msg, '❌'); return reply(sock, msg, ctx, `❌ Efeito falhou: ${e.message}`); }
  },
  async bass(a) { a.args = ['bass', ...(a.args || [])]; return module.exports.audiofx(a); },
  async bass2(a) { a.args = ['bass2', ...(a.args || [])]; return module.exports.audiofx(a); },
  async bass3(a) { a.args = ['bass3', ...(a.args || [])]; return module.exports.audiofx(a); },
  async grave(a) { a.args = ['grave', ...(a.args || [])]; return module.exports.audiofx(a); },
  async grave2(a) { a.args = ['grave2', ...(a.args || [])]; return module.exports.audiofx(a); },
  async grave3(a) { a.args = ['grave3', ...(a.args || [])]; return module.exports.audiofx(a); },
  async reverb(a) { a.args = ['reverb', ...(a.args || [])]; return module.exports.audiofx(a); },
  async reverb2(a) { a.args = ['reverb2', ...(a.args || [])]; return module.exports.audiofx(a); },
  async reverb3(a) { a.args = ['reverb3', ...(a.args || [])]; return module.exports.audiofx(a); },
  '8d': async (a) => { a.args = ['8d', ...(a.args || [])]; return module.exports.audiofx(a); },
  '8d2': async (a) => { a.args = ['8d2', ...(a.args || [])]; return module.exports.audiofx(a); },
  '8d3': async (a) => { a.args = ['8d3', ...(a.args || [])]; return module.exports.audiofx(a); },
  async slowed(a) { a.args = ['slowed', ...(a.args || [])]; return module.exports.audiofx(a); },
  async slowed2(a) { a.args = ['slowed2', ...(a.args || [])]; return module.exports.audiofx(a); },
  async slowed3(a) { a.args = ['slowed3', ...(a.args || [])]; return module.exports.audiofx(a); },
  async slowedreverb(a) { a.args = ['slowedreverb', ...(a.args || [])]; return module.exports.audiofx(a); },
  async slowedreverb2(a) { a.args = ['slowedreverb2', ...(a.args || [])]; return module.exports.audiofx(a); },
  async slowedreverb3(a) { a.args = ['slowedreverb3', ...(a.args || [])]; return module.exports.audiofx(a); },
  async chorus(a) { a.args = ['chorus', ...(a.args || [])]; return module.exports.audiofx(a); },
  async chorus2(a) { a.args = ['chorus2', ...(a.args || [])]; return module.exports.audiofx(a); },
  async chorus3(a) { a.args = ['chorus3', ...(a.args || [])]; return module.exports.audiofx(a); },
  async fast(a) { a.args = ['fast', ...(a.args || [])]; return module.exports.audiofx(a); },
  async slow(a) { a.args = ['slow', ...(a.args || [])]; return module.exports.audiofx(a); },
  async nightcore(a) { a.args = ['nightcore', ...(a.args || [])]; return module.exports.audiofx(a); },
  async vaporwave(a) { a.args = ['vaporwave', ...(a.args || [])]; return module.exports.audiofx(a); },
  async hardcore(a) { a.args = ['hardcore', ...(a.args || [])]; return module.exports.audiofx(a); },
  async robot(a) { a.args = ['robot', ...(a.args || [])]; return module.exports.audiofx(a); },
  async chipmunk(a) { a.args = ['chipmunk', ...(a.args || [])]; return module.exports.audiofx(a); },
  async squirrel(a) { a.args = ['squirrel', ...(a.args || [])]; return module.exports.audiofx(a); },
  async monster(a) { a.args = ['monster', ...(a.args || [])]; return module.exports.audiofx(a); },
  async whisper(a) { a.args = ['whisper', ...(a.args || [])]; return module.exports.audiofx(a); },
  async pitch(a) { a.args = ['pitch', ...(a.args || [])]; return module.exports.audiofx(a); },
  async deep(a) { a.args = ['deep', ...(a.args || [])]; return module.exports.audiofx(a); },
  async echo(a) { a.args = ['echo', ...(a.args || [])]; return module.exports.audiofx(a); },
  async stadium(a) { a.args = ['stadium', ...(a.args || [])]; return module.exports.audiofx(a); },
  async cave(a) { a.args = ['cave', ...(a.args || [])]; return module.exports.audiofx(a); },
  async underwater(a) { a.args = ['underwater', ...(a.args || [])]; return module.exports.audiofx(a); },
  async telephone(a) { a.args = ['telephone', ...(a.args || [])]; return module.exports.audiofx(a); },
  async radio(a) { a.args = ['radio', ...(a.args || [])]; return module.exports.audiofx(a); },
  async lofi(a) { a.args = ['lofi', ...(a.args || [])]; return module.exports.audiofx(a); },
  async flanger(a) { a.args = ['flanger', ...(a.args || [])]; return module.exports.audiofx(a); },
  async phaser(a) { a.args = ['phaser', ...(a.args || [])]; return module.exports.audiofx(a); },
  async tremolo(a) { a.args = ['tremolo', ...(a.args || [])]; return module.exports.audiofx(a); },
  async vibrato(a) { a.args = ['vibrato', ...(a.args || [])]; return module.exports.audiofx(a); },
  async reverse(a) { a.args = ['reverse', ...(a.args || [])]; return module.exports.audiofx(a); },
  async karaoke(a) { a.args = ['karaoke', ...(a.args || [])]; return module.exports.audiofx(a); },
  async blown(a) { a.args = ['blown', ...(a.args || [])]; return module.exports.audiofx(a); },
  async earrape(a) { a.args = ['earrape', ...(a.args || [])]; return module.exports.audiofx(a); },
  async fat(a) { a.args = ['fat', ...(a.args || [])]; return module.exports.audiofx(a); },
  async smooth(a) { a.args = ['smooth', ...(a.args || [])]; return module.exports.audiofx(a); },


  async iawhatsapp({ sock, msg, ctx, args, isOwner }) {
    if (!ctx.isGroup) return reply(sock, msg, ctx, '🤖 Use em grupos para adicionar IAs como membros.');
    if (!isOwner && !(await isAdmin(sock, ctx))) return reply(sock, msg, ctx, '🚫 Só admin/dono.');
    const action = (args[0] || 'status').toLowerCase();
    let list = await BotConfig.get('ai_member_numbers', []).catch(() => []);
    if (!Array.isArray(list)) list = [];
    if (['add','adicionar','set'].includes(action)) {
      const nums = args.slice(1).join(' ').split(/[\s,]+/).map(userManager.normalizeNumber).filter(n => n.length >= 8);
      if (!nums.length) return reply(sock, msg, ctx, 'Use: iawhatsapp add 551199999999 2449xxxxxxx');
      for (const n of nums) if (!list.includes(n)) list.push(n);
      await BotConfig.set('ai_member_numbers', list); botConfigCache.clear();
      return reply(sock, msg, ctx, `✅ IAs WhatsApp salvas:\n${list.map(n => '• +' + n).join('\n')}`);
    }
    if (['remove','remover'].includes(action)) {
      const nums = args.slice(1).map(userManager.normalizeNumber).filter(Boolean);
      list = list.filter(n => !nums.includes(n));
      await BotConfig.set('ai_member_numbers', list); botConfigCache.clear();
      return reply(sock, msg, ctx, `✅ Lista atual:\n${list.length ? list.map(n => '• +' + n).join('\n') : 'vazia'}`);
    }
    if (['entrar','join','convocar'].includes(action)) {
      if (!(await botIsAdmin(sock, ctx))) return reply(sock, msg, ctx, '⚠️ Preciso ser admin para adicionar membros.');
      if (!list.length) return reply(sock, msg, ctx, 'Configure primeiro: iawhatsapp add <numero-da-ia>');
      const jids = list.map(n => `${n}@s.whatsapp.net`);
      await sock.groupParticipantsUpdate(ctx.remoteJid, jids, 'add').catch(() => {});
      return reply(sock, msg, ctx, `🤖 Tentativa de adicionar IAs ao grupo:\n${list.map(n => '• +' + n).join('\n')}\n\nObs: algumas IAs como Meta AI podem não aceitar adição por número em todos países.`);
    }
    return reply(sock, msg, ctx, `╭━━━〔 🤖 IA WHATSAPP MEMBERS 〕━━━╮\n┃ Configure números de IAs oficiais/assistentes\n┃ e tente adicionar ao grupo.\n╰━━━━━━━━━━━━━━━━━━━━╯\n\nLista atual:\n${list.length ? list.map(n => '• +' + n).join('\n') : 'vazia'}\n\nComandos:\niawhatsapp add <numero>\niawhatsapp remove <numero>\niawhatsapp entrar`);
  },
  async addia(a) { return module.exports.iawhatsapp(a); },
  async metai(a) { return module.exports.iawhatsapp(a); },


  async anime({ sock, msg, ctx, args }) {
    const query = args.join(' ').trim();
    if (!query) return reply(sock, msg, ctx, '❌ Digite o nome do anime.\nEx: anime Naruto');
    await react(sock, msg, '📺');
    try {
      const data = await mediaHandler.fetchJson(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=1`, 20000);
      const anime = data?.data?.[0];
      if (!anime) return reply(sock, msg, ctx, '❌ Anime não encontrado.');
      const clean = (txt = '') => String(txt || '')
        .replace(/\[Written by MAL Rewrite\]/gi, '')
        .replace(/\[.*?\]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      const sinopse = clean(anime.synopsis).slice(0, 700) || 'Sem descrição.';
      const genres = (anime.genres || []).map(g => g.name).slice(0, 5).join(', ') || 'N/A';
      const studios = (anime.studios || []).map(x => x.name).slice(0, 3).join(', ') || 'N/A';
      const trailer = anime.trailer?.url || '';
      const msgTxt =
`┌─*̥˚˚*ੈ‧₊˚୨୧⋆ ˚｡⋆『📺』⋆ ˚｡⋆୨୧˚*ੈ‧₊˚*̥˚─┐
┊ ❖『 📺 』❖ 𝐈𝐍𝐅𝐎 𝐀𝐍𝐈𝐌𝐄 ❖『 📺 』❖
└─*̥˚˚*ੈ‧₊˚୨୧⋆ ˚｡⋆『📺』⋆ ˚｡⋆୨୧˚*ੈ‧₊˚*̥˚─┘
╎ ⛧ 𝐓𝐢́𝐭𝐮𝐥𝐨: ${anime.title || 'N/A'}
╎ ⛧ 𝐉𝐚𝐩𝐨𝐧𝐞̂𝐬: ${anime.title_japanese || 'N/A'}
╎ ⛧ 𝐒𝐜𝐨𝐫𝐞: ${anime.score || 'N/A'}
╎ ⛧ 𝐑𝐚𝐧𝐤: ${anime.rank ? '#' + anime.rank : 'N/A'}
╎ ⛧ 𝐏𝐨𝐩𝐮𝐥𝐚𝐫𝐢𝐝𝐚𝐝𝐞: ${anime.popularity ? '#' + anime.popularity : 'N/A'}
╎ ⛧ 𝐓𝐢𝐩𝐨: ${anime.type || 'N/A'}
╎ ⛧ 𝐄𝐩𝐢𝐬𝐨́𝐝𝐢𝐨𝐬: ${anime.episodes || 'N/A'}
╎ ⛧ 𝐀𝐧𝐨: ${anime.year || anime.aired?.prop?.from?.year || 'N/A'}
╎ ⛧ 𝐒𝐭𝐚𝐭𝐮𝐬: ${anime.status || 'N/A'}
╎ ⛧ 𝐆𝐞̂𝐧𝐞𝐫𝐨𝐬: ${genres}
╎ ⛧ 𝐄𝐬𝐭𝐮́𝐝𝐢𝐨: ${studios}
┌─*̥˚˚*ੈ‧₊˚୨୧⋆ ˚｡⋆『📖』⋆ ˚｡⋆୨୧˚*ੈ‧₊˚*̥˚─┐
┊ ✦『 📖 』✦ 𝐒𝐈𝐍𝐎𝐏𝐒𝐄 ✦『 📖 』✦
└─*̥˚˚*ੈ‧₊˚୨୧⋆ ˚｡⋆『📖』⋆ ˚｡⋆୨୧˚*ੈ‧₊˚*̥˚─┘
╎ ${sinopse}${sinopse.length >= 700 ? '...' : ''}
${trailer ? `\n╎ 🎬 𝐓𝐫𝐚𝐢𝐥𝐞𝐫: ${trailer}` : ''}
┌─*̥˚˚*ੈ‧₊˚୨୧⋆ ˚｡⋆『☩』⋆ ˚｡⋆୨୧˚*ੈ‧₊˚*̥˚─┐
┊ ✦『 ☩ 』✦ ${anime.title || query} ✦『 ☩ 』✦
└─*̥˚˚*ੈ‧₊˚୨୧⋆ ˚｡⋆『☩』⋆ ˚｡⋆୨୧˚*ੈ‧₊˚*̥˚─┘
> Fonte: Jikan/MAL · DarkSide Engine ⚡`;
      const img = anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url || anime.images?.webp?.large_image_url;
      if (img) await sock.sendMessage(ctx.remoteJid, { image: { url: img }, caption: msgTxt }, { quoted: msg });
      else await reply(sock, msg, ctx, msgTxt);
      await react(sock, msg, '✅');
    } catch (e) {
      console.error('[ANIME]', e.message);
      await react(sock, msg, '❌');
      return reply(sock, msg, ctx, '❌ Erro ao buscar anime. Tente outro nome.');
    }
  },



  async animeeps({ sock, msg, ctx, args }) {
    const query = args.join(' ').trim();
    if (!query) return reply(sock, msg, ctx, '📺 Use: animeeps Naruto\nMostra episódios/lista legal via MyAnimeList/Jikan.');
    await react(sock, msg, '📺');
    try {
      const search = await mediaHandler.fetchJson(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=1`, 20000);
      const anime = search?.data?.[0];
      if (!anime?.mal_id) return reply(sock, msg, ctx, '❌ Anime não encontrado.');
      const eps = await mediaHandler.fetchJson(`https://api.jikan.moe/v4/anime/${anime.mal_id}/episodes`, 20000).catch(() => null);
      const list = (eps?.data || []).slice(0, 20);
      const rows = list.map(e => `┃ ${String(e.mal_id || '').padStart(2, '0')} • ${e.title || e.title_japanese || 'Episódio'}${e.aired ? `\n┃     ${new Date(e.aired).toLocaleDateString('pt-BR')}` : ''}`).join('\n');
      const text = `╭━━━〔 📺 ANIME EPISÓDIOS 〕━━━╮\n` +
        `┃ Anime: *${anime.title}*\n` +
        `┃ Score: *${anime.score || 'N/A'}*\n` +
        `┃ Total: *${anime.episodes || 'N/A'}*\n` +
        `┣━━━━━━━━━━━━━━━━━━━━\n` +
        `${rows || '┃ Sem lista de episódios disponível.'}\n` +
        `╰━━━〔 Fonte: Jikan/MAL 〕━━━╯\n\n` +
        `⚠️ Não baixo episódios protegidos por copyright. Use plataformas oficiais/licenciadas.\n` +
        `${anime.url ? `🔗 MAL: ${anime.url}` : ''}`;
      const img = anime.images?.jpg?.image_url || anime.images?.webp?.image_url;
      if (img) await sock.sendMessage(ctx.remoteJid, { image: { url: img }, caption: text }, { quoted: msg });
      else await reply(sock, msg, ctx, text);
      await react(sock, msg, '✅');
    } catch (e) {
      await react(sock, msg, '❌');
      return reply(sock, msg, ctx, '❌ Erro ao buscar episódios do anime.');
    }
  },
  async animeepisodios(a) { return module.exports.animeeps(a); },
  async episodiosanime(a) { return module.exports.animeeps(a); },


  async fbset({ sock, msg, ctx, args, isOwner }) {
    if (!isOwner) return reply(sock, msg, ctx, '🚫 Só Dono.');
    const [pageId, token] = args;
    if (!pageId || !token) return reply(sock, msg, ctx, '📘 Use: fbset <PAGE_ID> <PAGE_ACCESS_TOKEN>\nOu configure FB_PAGE_ID e FB_PAGE_ACCESS_TOKEN no Render.');
    await BotConfig.set('fb_page_id', pageId.trim());
    await BotConfig.set('fb_page_access_token', token.trim());
    botConfigCache.clear();
    return reply(sock, msg, ctx, '✅ Facebook Page configurado. Teste: fbpost Olá DarkSide');
  },

  async fbpost({ sock, msg, ctx, args, isOwner }) {
    if (!isOwner) return reply(sock, msg, ctx, '🚫 Só Dono.');
    const text = args.join(' ').trim();
    if (!text) return reply(sock, msg, ctx, '📘 Use: fbpost sua legenda/texto');
    await react(sock, msg, '📘');
    try {
      const r = await facebookPublisher.publishText(text);
      await react(sock, msg, '✅');
      return reply(sock, msg, ctx, `✅ Post publicado no Facebook.\n${facebookPublisher.resultLink(r)}`);
    } catch (e) { await react(sock, msg, '❌'); return reply(sock, msg, ctx, '❌ Facebook post falhou: ' + e.message); }
  },

  async fbfoto({ sock, msg, ctx, args, isOwner }) {
    if (!isOwner) return reply(sock, msg, ctx, '🚫 Só Dono.');
    const caption = args.join(' ').trim();
    const urlArg = args.find(a => /^https?:\/\//i.test(a));
    await react(sock, msg, '📸');
    try {
      let payload = { caption };
      if (urlArg) payload.url = urlArg;
      else {
        const media = await mediaBufferFromQuoted(msg);
        if (!media || media.type !== 'image') return reply(sock, msg, ctx, '📸 Responda uma foto ou use: fbfoto <url> legenda');
        payload.buffer = media.buffer; payload.fileName = 'dark-facebook-photo.jpg';
      }
      const r = await facebookPublisher.publishPhoto(payload);
      await react(sock, msg, '✅');
      return reply(sock, msg, ctx, `✅ Foto publicada no Facebook.\n${facebookPublisher.resultLink(r)}`);
    } catch (e) { await react(sock, msg, '❌'); return reply(sock, msg, ctx, '❌ Facebook foto falhou: ' + e.message); }
  },
  async fbphoto(a) { return module.exports.fbfoto(a); },

  async fbvideo({ sock, msg, ctx, args, isOwner }) {
    if (!isOwner) return reply(sock, msg, ctx, '🚫 Só Dono.');
    const description = args.join(' ').trim();
    const urlArg = args.find(a => /^https?:\/\//i.test(a));
    await react(sock, msg, '🎬');
    try {
      let payload = { description };
      if (urlArg) payload.url = urlArg;
      else {
        const media = await mediaBufferFromQuoted(msg);
        if (!media || media.type !== 'video') return reply(sock, msg, ctx, '🎬 Responda um vídeo ou use: fbvideo <url> legenda');
        payload.buffer = media.buffer; payload.fileName = 'dark-facebook-video.mp4';
      }
      const r = await facebookPublisher.publishVideo(payload);
      await react(sock, msg, '✅');
      return reply(sock, msg, ctx, `✅ Vídeo publicado no Facebook.\n${facebookPublisher.resultLink(r)}`);
    } catch (e) { await react(sock, msg, '❌'); return reply(sock, msg, ctx, '❌ Facebook vídeo falhou: ' + e.message); }
  },

  async fbstory({ sock, msg, ctx, args, isOwner }) {
    if (!isOwner) return reply(sock, msg, ctx, '🚫 Só Dono.');
    const caption = args.join(' ').trim();
    const urlArg = args.find(a => /^https?:\/\//i.test(a));
    await react(sock, msg, '📲');
    try {
      let r;
      if (urlArg) {
        const isVid = /\.(mp4|webm|mov)(?:[?#]|$)/i.test(urlArg);
        r = isVid ? await facebookPublisher.publishVideoStory({ description: caption, url: urlArg }) : await facebookPublisher.publishPhotoStory({ caption, url: urlArg });
      } else {
        const media = await mediaBufferFromQuoted(msg);
        if (!media) return reply(sock, msg, ctx, '📲 Responda foto/vídeo ou use: fbstory <url> legenda');
        r = media.type === 'video'
          ? await facebookPublisher.publishVideoStory({ description: caption, buffer: media.buffer })
          : await facebookPublisher.publishPhotoStory({ caption, buffer: media.buffer });
      }
      await react(sock, msg, '✅');
      return reply(sock, msg, ctx, `✅ Story enviado/tentado no Facebook.\n${facebookPublisher.resultLink(r)}${r.storyWarning ? '\n⚠️ Story endpoint avisou: ' + r.storyWarning : ''}`);
    } catch (e) { await react(sock, msg, '❌'); return reply(sock, msg, ctx, '❌ Facebook story falhou: ' + e.message); }
  },

  async fbstatus({ sock, msg, ctx, isOwner }) {
    if (!isOwner) return reply(sock, msg, ctx, '🚫 Só Dono.');
    const c = await facebookPublisher.getFbConfig();
    return reply(sock, msg, ctx, `📘 *FACEBOOK CONFIG*\n\nPage ID: ${c.pageId ? '✅ configurado' : '❌ vazio'}\nToken: ${c.token ? '✅ configurado' : '❌ vazio'}\n\nComandos:\nfbset <page_id> <token>\nfbpost texto\nfbfoto legenda (responda foto)\nfbvideo legenda (responda vídeo)\nfbstory legenda (responda mídia)`);
  },

};
