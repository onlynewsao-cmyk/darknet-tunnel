/**
 * DARK BOT v6.17 — Stickers COMPLETOS
 * Handlers reais para todos os comandos de sticker
 */
'use strict';

const stickerMaker = require('../stickerMaker');
const mediaHandler = require('../mediaHandler');
const config = require('../../config');

// Helper: obter imagem da mensagem ou da citada
async function getImageBuffer(msg) {
  const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  const imgMsg = msg.message?.imageMessage || quoted?.imageMessage || msg.message?.stickerMessage || quoted?.stickerMessage;
  if (!imgMsg) return null;
  // Se é sticker, converter para imagem primeiro
  if (msg.message?.stickerMessage || quoted?.stickerMessage) {
    const stkMsg = msg.message?.stickerMessage ? msg : { message: quoted, key: msg.key };
    try {
      const { downloadMediaMessage } = require('baileys-v6');
      return await downloadMediaMessage(stkMsg, 'buffer', {});
    } catch { return null; }
  }
  try {
    const { downloadMediaMessage } = require('baileys-v6');
    return await downloadMediaMessage(msg.message?.imageMessage ? msg : { message: quoted, key: msg.key }, 'buffer', {});
  } catch { return null; }
}

// Helper: criar sticker com tema/estilo
async function makeThemedSticker(sock, msg, ctx, styleName, overlayText = '') {
  const buf = await getImageBuffer(msg);
  if (!buf) return sock.sendMessage(ctx.remoteJid, { text: '📸 Envie ou marque uma imagem!' }, { quoted: msg });
  
  const RE = require('../renderEngine');
  const t = await RE.getTheme(ctx.remoteJid);
  
  try {
    const stk = await stickerMaker.create(buf, {
      botName: config.bot.name,
      ownerName: config.owner.name,
      userName: ctx.pushName,
      groupName: ctx.groupName || 'PV',
      isVideo: false,
      packName: `${t.icon || '🕸️'} ${styleName}`,
      authorName: `${ctx.pushName} | ${config.bot.name}`,
    });
    if (stk && stk.length > 50) {
      await require('../stickerPack').sendStickerWithPackLink(sock, ctx.remoteJid, stk, { quoted: msg });
      sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } });
    } else throw new Error('Sticker vazio');
  } catch (e) {
    sock.sendMessage(ctx.remoteJid, { react: { text: '❌', key: msg.key } });
    return sock.sendMessage(ctx.remoteJid, { text: '❌ Erro: ' + e.message }, { quoted: msg });
  }
}

module.exports = function registerStickers2(registerCase) {

  // ═══ FIG TEMÁTICAS (sticker com estilo) ═══
  const figStyles = {
    figanime: 'Anime', figcoreana: 'Coreano', figdesenho: 'Desenho',
    figemoji: 'Emoji', figengracada: 'Engraçado', figmeme: 'Meme',
    figraiva: 'Raiva', figroblox: 'Roblox',
  };
  for (const [cmd, style] of Object.entries(figStyles)) {
    registerCase([cmd], async ({ sock, msg, ctx }) => {
      sock.sendMessage(ctx.remoteJid, { react: { text: '⏳', key: msg.key } });
      return makeThemedSticker(sock, msg, ctx, style);
    }, true);
  }

  // ═══ BRAT (fundo branco + auto-scale para não overflow) ═══
  registerCase(['brat'], async ({ sock, msg, ctx, args }) => {
    sock.sendMessage(ctx.remoteJid, { react: { text: '⏳', key: msg.key } });
    const text = args.join(' ').trim() || 'brat';
    try {
      const sharp = require('sharp');
      // Auto-scale: calcula font size para caber em 480px (margem 16px cada lado)
      const maxW = 480;
      let fontSize = 120;
      // Estimar largura: cada char ≈ 0.6 * fontSize
      while (text.length * fontSize * 0.6 > maxW && fontSize > 20) fontSize -= 4;
      // Se texto muito longo, reduzir mais
      if (text.length > 15) fontSize = Math.min(fontSize, 36);
      if (text.length > 20) fontSize = Math.min(fontSize, 28);

      const svgStr = '<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">' +
        '<rect width="512" height="512" fill="white"/>' +
        '<defs><filter id="blur"><feGaussianBlur stdDeviation="1.2"/></filter></defs>' +
        '<text x="256" y="256" text-anchor="middle" dominant-baseline="middle" ' +
        'font-family="Arial Black, Arial" font-size="' + fontSize + '" ' +
        'font-weight="900" fill="black" opacity="0.85" filter="url(#blur)" ' +
        'textLength="' + Math.min(text.length * fontSize * 0.6, maxW) + '" lengthAdjust="spacingAndGlyphs">' +
        text.slice(0, 25).toUpperCase() + '</text></svg>';
      const png = await sharp(Buffer.from(svgStr)).png().toBuffer();
      const stk = await stickerMaker.create(png, {
        botName: config.bot.name, ownerName: config.owner.name,
        userName: ctx.pushName, groupName: ctx.groupName || 'PV', isVideo: false,
        packName: ' brat', authorName: ctx.pushName,
      });
      await require('../stickerPack').sendStickerWithPackLink(sock, ctx.remoteJid, stk, { quoted: msg });
      sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } });
    } catch (e) {
      sock.sendMessage(ctx.remoteJid, { react: { text: '❌', key: msg.key } });
      return sock.sendMessage(ctx.remoteJid, { text: '❌ ' + e.message }, { quoted: msg });
    }
  }, true);

  // ═══ BRAT2 (typewriter ANIMADO — frames PNG → webp animado via ffmpeg) ═══
  registerCase(['brat2'], async ({ sock, msg, ctx, args }) => {
    sock.sendMessage(ctx.remoteJid, { react: { text: '⏳', key: msg.key } });
    const input = args.join(' ').trim() || 'brat';
    try {
      const sharp = require('sharp');
      const words = input.split(/\s+/);
      const text = input.toUpperCase().slice(0, 25);
      const maxW = 480;
      let fontSize = 100;
      while (text.length * fontSize * 0.6 > maxW && fontSize > 16) fontSize -= 4;
      if (text.length > 15) fontSize = Math.min(fontSize, 32);

      const frames = [];
      if (words.length === 1) {
        for (let i = 1; i <= text.length; i++) frames.push({ t: text.slice(0, i) + (i < text.length ? '|' : ''), n: 1 });
      } else {
        for (let i = 1; i <= words.length; i++) frames.push({ t: words.slice(0, i).join(' ').toUpperCase() + (i < words.length ? '|' : ''), n: 2 });
      }
      frames.push({ t: text, n: 5 }, { t: text, n: 5 }); // pausa final

      const render = async (frameText) => {
        const svgStr = '<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">' +
          '<rect width="512" height="512" fill="#84CC16"/>' +
          '<text x="256" y="256" text-anchor="middle" dominant-baseline="middle" ' +
          'font-family="Arial Black, Arial" font-size="' + fontSize + '" ' +
          'font-weight="900" fill="black" opacity="0.85" ' +
          'textLength="' + Math.min(frameText.length * fontSize * 0.55, maxW) + '" lengthAdjust="spacingAndGlyphs">' +
          frameText.slice(0, 25) + '</text></svg>';
        return sharp(Buffer.from(svgStr)).png().toBuffer();
      };

      // v7.50: antes passava 1 frame estático com isVideo:true → crash NATIVO
      // (free(): invalid size) que matava o bot para TODOS. Agora monta um
      // webp ANIMADO real; sem ffmpeg cai para o frame final estático.
      let finalBuf = null;
      try {
        const fs = require('fs'); const os = require('os'); const path = require('path');
        const execFileAsync = require('util').promisify(require('child_process').execFile); // v7.52 async
        const FF = (() => { try { return require('ffmpeg-static') || 'ffmpeg'; } catch { return 'ffmpeg'; } })();
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brat2-'));
        let fi = 0;
        for (const f of frames) {
          const png = await render(f.t);
          for (let k = 0; k < f.n; k++) fs.writeFileSync(path.join(dir, 'f' + String(fi++).padStart(3, '0') + '.png'), png);
        }
        const out = path.join(dir, 'out.webp');
        await execFileAsync(FF, ['-y', '-framerate', '8', '-i', path.join(dir, 'f%03d.png'), '-vcodec', 'libwebp', '-q', '68', '-loop', '0', '-an', out], { stdio: 'ignore' });
        finalBuf = fs.readFileSync(out);
        fs.rmSync(dir, { recursive: true, force: true });
        if (!finalBuf || finalBuf.length < 200) finalBuf = null;
      } catch { finalBuf = null; }

      let stk;
      if (finalBuf) {
        stk = await stickerMaker.create(finalBuf, {
          botName: config.bot.name, ownerName: config.owner.name,
          userName: ctx.pushName, groupName: ctx.groupName || 'PV', preAnimated: true,
          packName: ' brat2', authorName: ctx.pushName,
        });
      } else {
        const png = await render(text);
        stk = await stickerMaker.create(png, {
          botName: config.bot.name, ownerName: config.owner.name,
          userName: ctx.pushName, groupName: ctx.groupName || 'PV', isVideo: false,
          packName: ' brat2', authorName: ctx.pushName,
        });
      }
      await require('../stickerPack').sendStickerWithPackLink(sock, ctx.remoteJid, stk, { quoted: msg });
      sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } });
    } catch (e) {
      sock.sendMessage(ctx.remoteJid, { react: { text: '❌', key: msg.key } });
      return sock.sendMessage(ctx.remoteJid, { text: '❌ ' + e.message }, { quoted: msg });
    }
  }, true);

  // ═══ ESTILOS DE STICKER (faber, jeff, norian) ═══
  for (const cmd of ['faber', 'jeff', 'norian']) {
    registerCase([cmd], async ({ sock, msg, ctx }) => {
      sock.sendMessage(ctx.remoteJid, { react: { text: '⏳', key: msg.key } });
      return makeThemedSticker(sock, msg, ctx, cmd.toUpperCase());
    }, true);
  }

  // ═══ LEGENDA (sticker com texto) ═══
  registerCase(['legenda'], async ({ sock, msg, ctx, args }) => {
    const text = args.join(' ').trim();
    if (!text) return sock.sendMessage(ctx.remoteJid, { text: '✍️ Uso: `!legenda teu texto` + marca uma imagem' }, { quoted: msg });
    sock.sendMessage(ctx.remoteJid, { react: { text: '⏳', key: msg.key } });
    const buf = await getImageBuffer(msg);
    if (!buf) return sock.sendMessage(ctx.remoteJid, { text: '📸 Marca uma imagem!' }, { quoted: msg });
    try {
      const sharp = require('sharp');
      const base = await sharp(buf)
        .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png().toBuffer();
      const safeText = text.slice(0, 30).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[ch]));
      const svg = Buffer.from(`<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
        <rect y="412" width="512" height="100" fill="rgba(0,0,0,0.6)"/>
        <text x="256" y="472" font-family="Arial" font-size="32" fill="white" text-anchor="middle">${safeText}</text>
      </svg>`);
      const composited = await sharp(base).composite([{ input: svg, left: 0, top: 0 }]).webp({ quality: 80 }).toBuffer();
      const stk = await stickerMaker.create(composited, {
        botName: config.bot.name, ownerName: config.owner.name,
        userName: ctx.pushName, groupName: ctx.groupName || 'PV', isVideo: false,
      });
      await require('../stickerPack').sendStickerWithPackLink(sock, ctx.remoteJid, stk, { quoted: msg });
      sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } });
    } catch (e) {
      sock.sendMessage(ctx.remoteJid, { react: { text: '❌', key: msg.key } });
      return sock.sendMessage(ctx.remoteJid, { text: '❌ ' + e.message }, { quoted: msg });
    }
  }, true);

  // ═══ TOTEXT (OCR em sticker) ═══
  registerCase(['totext'], async ({ sock, msg, ctx, reply }) => {
    const buf = await getImageBuffer(msg);
    if (!buf) return reply('📸 Marca um sticker ou imagem para extrair texto.');
    // Sem API OCR gratuita fiável — resposta informativa
    const RE = require('../renderEngine');
    const t = await RE.getTheme(ctx.remoteJid);
    return reply(RE.renderBlock(t, 'TOTEXT', [
      ' OCR de stickers/imagens',
      '',
      '⚠️ Funcionalidade requer API de OCR.',
      '💡 Usa !imagem para gerar imagens com texto.',
      '',
      `> ${t.vibe || 'Dark Engine'}`,
    ], { botName: config.bot.name }));
  }, true);

  // ═══ GERARLINK (link para sticker) ═══
  registerCase(['gerarlink'], async ({ sock, msg, ctx, reply }) => {
    const RE = require('../renderEngine');
    const t = await RE.getTheme(ctx.remoteJid);
    return reply(RE.renderBlock(t, 'GERAR LINK', [
      '🔗 Para partilhar um sticker como link:',
      '',
      '1. Guarda o sticker no WhatsApp',
      '2. Abre o gestor de figurinhas',
      '3. Toca no pack → Partilhar',
      '',
      `> ${t.vibe || 'Dark Engine'}`,
    ], { botName: config.bot.name }));
  }, true);

  // ═══ PTVMSG (Picture-in-Picture Video) ═══
  registerCase(['ptvmsg'], async ({ sock, msg, ctx, reply }) => {
    const buf = await getImageBuffer(msg);
    if (!buf) return reply('📸 Marca uma imagem para criar PTV.');
    sock.sendMessage(ctx.remoteJid, { react: { text: '⏳', key: msg.key } });
    try {
      const sharp = require('sharp');
      const webpBuf = await sharp(buf).resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ quality: 80 }).toBuffer();
      // Enviar como PTV (video message com gifPlayback)
      await sock.sendMessage(ctx.remoteJid, {
        video: webpBuf, mimetype: 'video/mp4', gifPlayback: true,
        caption: '🎬 PTV Message',
      }, { quoted: msg });
      sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } });
    } catch (e) {
      sock.sendMessage(ctx.remoteJid, { react: { text: '❌', key: msg.key } });
      return reply('❌ ' + e.message);
    }
  }, true);

  // ═══ RVISU (efeito visual reverso) ═══
  registerCase(['rvisu'], async ({ sock, msg, ctx }) => {
    sock.sendMessage(ctx.remoteJid, { react: { text: '⏳', key: msg.key } });
    const buf = await getImageBuffer(msg);
    if (!buf) return sock.sendMessage(ctx.remoteJid, { text: '📸 Marca uma imagem!' }, { quoted: msg });
    try {
      const sharp = require('sharp');
      const processed = await sharp(buf)
        .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .negate() // inverter cores
        .modulate({ brightness: 1.2, saturation: 1.5 })
        .webp({ quality: 80 })
        .toBuffer();
      const stk = await stickerMaker.create(processed, {
        botName: config.bot.name, ownerName: config.owner.name,
        userName: ctx.pushName, groupName: ctx.groupName || 'PV', isVideo: false,
      });
      await require('../stickerPack').sendStickerWithPackLink(sock, ctx.remoteJid, stk, { quoted: msg });
      sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } });
    } catch (e) {
      sock.sendMessage(ctx.remoteJid, { react: { text: '❌', key: msg.key } });
      return sock.sendMessage(ctx.remoteJid, { text: '❌ ' + e.message }, { quoted: msg });
    }
  }, true);

  // ═══ IMAGEM (IA image generation) ═══
  registerCase(['imagem'], async ({ sock, msg, ctx, args, prefix, reply }) => {
    const prompt = args.join(' ').trim();
    if (!prompt) return reply(`🎨 Uso: \`${prefix}imagem <descrição>\``);
    sock.sendMessage(ctx.remoteJid, { react: { text: '⏳', key: msg.key } });
    try {
      const axios = require('axios');
      const r = await axios.get(`https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=512&height=512&nologo=true`, { responseType: 'arraybuffer', timeout: 30000 });
      if (r.data && r.data.byteLength > 1000) {
        await sock.sendMessage(ctx.remoteJid, { image: Buffer.from(r.data), caption: `🎨 *${prompt}*` }, { quoted: msg });
        sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } });
      } else throw new Error('Imagem vazia');
    } catch (e) {
      sock.sendMessage(ctx.remoteJid, { react: { text: '❌', key: msg.key } });
      return reply('❌ IA Imagem: ' + e.message);
    }
  }, true);
};
