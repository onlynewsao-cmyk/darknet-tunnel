/**
 * Converte um sticker WhatsApp (WebP estático ou animado) em
 * fotogramas PNG para a Aura VER o que está na figurinha.
 *
 * Gemini Vision trata WebP animado como 1 frame (ou recusa).
 * Por isso extraímos vários fotogramas em sequência.
 */
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

function isWebp(buf) {
  return !!(buf && buf.length >= 12
    && buf.slice(0, 4).toString() === 'RIFF'
    && buf.slice(8, 12).toString() === 'WEBP');
}

function isGif(buf) {
  const s = buf && buf.length >= 6 ? buf.slice(0, 6).toString() : '';
  return s === 'GIF89a' || s === 'GIF87a';
}

function isProbablyJson(buf) {
  if (!buf || buf.length < 2) return false;
  const start = String(buf.slice(0, 40)).trimStart();
  return start.startsWith('{') || start.startsWith('[');
}

/** Bit de animação no chunk VP8X, ou presença do chunk ANIM. */
function isAnimatedWebp(buf) {
  if (!isWebp(buf)) return false;
  if (buf.includes(Buffer.from('ANIM'))) return true;
  const i = buf.indexOf(Buffer.from('VP8X'));
  if (i >= 0 && i + 8 < buf.length) {
    return !!(buf[i + 8] & 0x02);
  }
  return false;
}

function pickFrameIndexes(total, max = 4) {
  const nTotal = Math.max(1, Number(total) || 1);
  const cap = Math.min(Math.max(1, Number(max) || 1), nTotal);
  if (cap === 1) return [0];
  const out = [];
  for (let i = 0; i < cap; i++) {
    out.push(Math.round((i * (nTotal - 1)) / (cap - 1)));
  }
  return [...new Set(out)];
}

function detectStickerKind(buf, stickerMsg = {}) {
  if (stickerMsg?.isLottie || isProbablyJson(buf)) {
    return { kind: 'lottie', animated: true };
  }
  const flagged = !!(stickerMsg?.isAnimated);
  if (isAnimatedWebp(buf) || isGif(buf) || (flagged && isWebp(buf))) {
    return { kind: 'animated', animated: true };
  }
  return { kind: 'static', animated: false };
}

function getFfmpegBin() {
  try { return require('ffmpeg-static') || 'ffmpeg'; } catch { return 'ffmpeg'; }
}

function ffmpegExtractPngs(buf, count = 4) {
  const bin = getFfmpegBin();
  const dir = path.join(os.tmpdir(), `stkvis_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  const inFile = path.join(dir, 'in.webp');
  fs.mkdirSync(dir, { recursive: true });
  try {
    fs.writeFileSync(inFile, buf);
    execFileSync(bin, [
      '-y', '-i', inFile,
      '-vf', 'fps=6,scale=512:512:force_original_aspect_ratio=decrease',
      '-vframes', String(Math.max(1, count)),
      path.join(dir, 'f_%02d.png'),
    ], { timeout: 20000, stdio: 'ignore' });
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.png')).sort();
    const frames = [];
    for (const f of files) {
      const png = fs.readFileSync(path.join(dir, f));
      if (png && png.length > 80) frames.push(png);
    }
    return frames;
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
}

async function extractFramePng(buf, page) {
  const sharp = require('sharp');
  return sharp(buf, { animated: true, page, limitInputPixels: false })
    .rotate()
    .resize(512, 512, { fit: 'inside', withoutEnlargement: true, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 6 })
    .toBuffer();
}

/**
 * @param {Buffer} buf
 * @param {object} [stickerMsg] — stickerMessage do Baileys (isAnimated, isLottie)
 * @returns {Promise<{ok:boolean, animated:boolean, kind:string, frames:Buffer[], pages?:number, reason?:string}>}
 */
async function stickerToVision(buf, stickerMsg = {}) {
  const info = detectStickerKind(buf, stickerMsg);
  if (!buf || buf.length < 40) {
    return { ...info, frames: [], ok: false, reason: 'vazio' };
  }
  if (info.kind === 'lottie') {
    return { ...info, frames: [], ok: false, reason: 'lottie' };
  }

  try {
    const sharp = require('sharp');
    const meta = await sharp(buf, { animated: true, limitInputPixels: false }).metadata();
    const pages = Math.max(1, Number(meta.pages) || 1);
    const animated = info.animated || pages > 1;
    const indexes = pickFrameIndexes(pages, animated ? 4 : 1);
    const frames = [];
    for (const i of indexes) {
      try {
        const png = await extractFramePng(buf, i);
        if (png && png.length > 80) frames.push(png);
      } catch { /* frame isolado falhou */ }
    }
    if (!frames.length) {
      const one = await sharp(buf, { limitInputPixels: false }).png().toBuffer();
      if (one && one.length > 80) frames.push(one);
    }
    if (frames.length) {
      return { kind: animated ? 'animated' : 'static', animated, frames, pages, ok: true };
    }
  } catch { /* cai no ffmpeg */ }

  try {
    const frames = ffmpegExtractPngs(buf, info.animated ? 4 : 1);
    if (frames.length) {
      return {
        kind: info.animated || frames.length > 1 ? 'animated' : 'static',
        animated: info.animated || frames.length > 1,
        frames,
        pages: frames.length,
        ok: true,
      };
    }
  } catch { /* sem ffmpeg / ficheiro inválido */ }

  // Último recurso: o WebP cru (Gemini aceita image/webp estático)
  if (isWebp(buf) || isGif(buf)) {
    return { ...info, frames: [buf], ok: true, reason: 'raw' };
  }
  return { ...info, frames: [], ok: false, reason: 'sem-frames' };
}

function visionPromptForSticker({ animated = false, frames = 1, quoted = false } = {}) {
  const onde = quoted ? 'figurinha citada (a que estás a responder)' : 'figurinha que te mandaram agora';
  if (animated) {
    return `[ESTÁS A VER UM STICKER ANIMADO — ${onde}.
São ${Math.max(1, frames)} fotogramas em sequência (do início ao fim da animação).
Olha para o DESENHO e para o MOVIMENTO:
• o que está desenhado / quem aparece
• expressão, emoção, acção entre os frames
• texto escrito na figurinha
• se for personagem/famoso e tiveres a certeza, diz o nome
Comenta como quem está a olhar para a figurinha. NUNCA digas que não vês, que é "só um sticker" ou que estás só a conversar por texto.]`;
  }
  return `[ESTÁS A VER UM STICKER (figurinha) — ${onde}.
Analisa o desenho/foto:
• o que está lá, expressão, emoção
• texto escrito na figurinha
• se for personagem/famoso e tiveres a certeza, diz o nome
Comenta o que te salta à vista. NUNCA digas que não vês ou que é "só um sticker".]`;
}

module.exports = {
  isWebp,
  isGif,
  isAnimatedWebp,
  isProbablyJson,
  pickFrameIndexes,
  detectStickerKind,
  stickerToVision,
  visionPromptForSticker,
};
