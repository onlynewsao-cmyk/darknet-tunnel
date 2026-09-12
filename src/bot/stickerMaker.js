/**
 * StickerMaker v5.0 — Stickers quadrados, sem falhas, sem distorção
 *
 * PROBLEMA ANTERIOR:
 *  - FULL (contain) → barras pretas + não preenche o quadrado
 *  - Fallback wa-sticker-formatter sem parâmetros → artefactos/riscos em vídeos
 *
 * SOLUÇÃO:
 *  - Imagem estática: sharp cover 512x512 → sem barras, sem distorção
 *  - GIF animado:     sharp animated cover 512x512 → sem ffmpeg, sem artefactos
 *  - Vídeo MP4/WebM:  ffmpeg com filtros precisos → cover 512x512 limpo
 *  - Fallback seguro: wa-sticker-formatter CROPPED (cover, não contain)
 *
 * REGRA: NUNCA usar fit:contain (barras pretas) — sempre fit:cover (corta bordas)
 */

const { execSync, execFileSync } = require('child_process');
let _Sticker, _StickerTypes;
function waSticker() {
  if (!_Sticker) {
    const m = require('wa-sticker-formatter');
    _Sticker = m.Sticker;
    _StickerTypes = m.StickerTypes;
  }
  return { Sticker: _Sticker, StickerTypes: _StickerTypes };
}
const crypto = require('crypto');
const fs   = require('fs');
const os   = require('os');
const path = require('path');

/** ID estável: o mesmo seed dá SEMPRE o mesmo pack (WhatsApp agrupa). */
function makePackId(seed = '') {
  const base = String(seed || 'dark-net-default').replace(/\s+/g, ' ').trim().slice(0, 120);
  const h = crypto.createHash('md5')
    .update('darkbot-pack|' + base)
    .digest('hex')
    .slice(0, 16);
  return `com.darkbot.pack.${h}`;
}

/**
 * EXIF completo do WhatsApp.
 * android/ios-app-store-link = o que o "Ver pacote" abre
 * se a pessoa ainda não tiver o pack guardado.
 */
function buildStickerExifJson({ packId, pack, author, url, emojis } = {}) {
  const link = String(url || '').trim();
  const pub = String(author || 'DARK NET 🕸️').split('\n')[0].slice(0, 128);
  return {
    'sticker-pack-id': packId || makePackId(pack || link || 'dark'),
    'sticker-pack-name': String(pack || 'DARK NET 🕸️').slice(0, 128),
    'sticker-pack-publisher': pub,
    'android-app-store-link': link,
    'ios-app-store-link': link,
    'android-play-store-link': link,
    'sticker-pack-publisher-website': link,
    'publisher-website': link,
    emojis: Array.isArray(emojis) && emojis.length ? emojis : ['✨'],
  };
}

async function writeStickerExif(webpBuf, meta = {}) {
  if (!webpBuf || !webpBuf.length) return webpBuf;
  const json = JSON.stringify(buildStickerExifJson(meta));
  const exif = Buffer.concat([
    Buffer.from([
      0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57,
      0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00,
    ]),
    Buffer.from(json, 'utf-8'),
  ]);
  exif.writeUIntLE(Buffer.byteLength(json), 14, 4);
  try {
    const { Image } = require('node-webpmux');
    const img = new Image();
    await img.load(webpBuf);
    img.exif = exif;
    const out = await img.save(null);
    return out && out.length > 50 ? out : webpBuf;
  } catch {
    return webpBuf;
  }
}

/* ─── ffmpeg disponível? ──────────────────────────────────────── */
function getFfmpegBin() {
  try { return require('ffmpeg-static') || 'ffmpeg'; } catch { return 'ffmpeg'; }
}
function hasFfmpeg() {
  try { execSync(`"${getFfmpegBin()}" -version`, { stdio: 'ignore', shell: true }); return true; } catch { return false; }
}
const FFMPEG_BIN = getFfmpegBin();
const FFMPEG_OK = hasFfmpeg();

/* ─── Detecta tipo pelo magic bytes ──────────────────────────── */
function detectMime(buffer) {
  if (!buffer || buffer.length < 12) return 'image/jpeg';
  const h = buffer.slice(0, 12);
  if (h[0] === 0x89 && h[1] === 0x50)                                            return 'image/png';
  if (h[0] === 0xFF && h[1] === 0xD8)                                            return 'image/jpeg';
  if (h.slice(0,4).toString()==='RIFF' && h.slice(8,12).toString()==='WEBP')     return 'image/webp';
  if (h.slice(0,6).toString()==='GIF89a' || h.slice(0,6).toString()==='GIF87a') return 'image/gif';
  if (h.slice(4,8).toString() === 'ftyp')                                         return 'video/mp4';
  if (h[0] === 0x1A && h[1] === 0x45)                                            return 'video/webm';
  if (h.slice(0,4).toString() === 'RIFF')                                        return 'video/avi';
  return 'image/jpeg';
}


function escapeXml(s = '') {
  return String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[ch]));
}

function watermarkSvg(text = '') {
  const safe = escapeXml(String(text || '').slice(0, 32));
  if (!safe) return null;
  return Buffer.from(`<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
    <defs><filter id="shadow"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000" flood-opacity="0.75"/></filter></defs>
    <rect x="0" y="458" width="512" height="54" rx="0" fill="rgba(0,0,0,0.42)"/>
    <text x="256" y="492" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="26" font-weight="900" fill="#ffffff" filter="url(#shadow)">${safe}</text>
  </svg>`);
}

/* ─── GIF animado → WebP animado 512x512 cover (via sharp) ───── */
async function gifToWebpSquare(buffer) {
  const sharp = require('sharp');

  // sharp com animated:true processa todos os frames
  // fit:cover = preenche 512x512 cortando bordas → SEM barras pretas, SEM distorção
  return sharp(buffer, { animated: true })
    .resize(512, 512, {
      fit: 'cover',
      position: 'centre',
      withoutEnlargement: false,
    })
    .webp({
      quality: 85,
      lossless: false,
      loop: 0,        // loop infinito
      delay: [],      // mantém delays originais dos frames
    })
    .toBuffer();
}

/* ─── Vídeo MP4/WebM → WebP animado 512x512 cover (via ffmpeg) ─ */
function videoToWebpSquare(inputBuf, maxSec = Number(process.env.STICKER_VIDEO_MAX_SEC || 8)) {
  const tmp     = path.join(os.tmpdir(), `stk_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  const inFile  = `${tmp}.in`;
  const outFile = `${tmp}.webp`;

  try {
    fs.writeFileSync(inFile, inputBuf);

    /*
     * FILTRO CORRECTO para sticker quadrado SEM artefactos:
     * maxSec aumentado para 13 segundos conforme solicitado.
     */
    execFileSync(FFMPEG_BIN, [
      '-y',
      '-t', String(maxSec),
      '-i', inFile,
      '-vf', [
        'scale=w=512:h=512:force_original_aspect_ratio=increase',
        'crop=512:512',
        'fps=10',
        'format=rgba',
      ].join(','),
      '-vcodec',            'libwebp_anim',
      '-lossless',          '0',
      '-quality',           '58',
      '-compression_level', '3',
      '-loop',              '0',
      '-vsync',             'vfr',
      '-an',
      outFile,
    ], { timeout: 90000, stdio: 'ignore' });

    const result = fs.readFileSync(outFile);
    if (!result || result.length < 200) throw new Error('WebP vazio');
    return result;

  } finally {
    try { fs.unlinkSync(inFile);  } catch {}
    try { fs.unlinkSync(outFile); } catch {}
  }
}

/* ─── Imagem estática → WebP 512x512 cover (via sharp) ────────── */
async function imageToWebpSquare(buffer, watermarkText = '') {
  const sharp = require('sharp');
  let img = sharp(buffer)
    .resize(512, 512, {
      fit: 'cover',          // preenche 512x512 cortando bordas
      position: 'centre',
      withoutEnlargement: false,
    });
  const wm = watermarkSvg(watermarkText);
  if (wm) img = img.composite([{ input: wm, left: 0, top: 0 }]);
  return img.webp({ quality: 88, lossless: false }).toBuffer();
}

/* ─── Injeta metadados via Sticker (pack/author) ─────────────── */
function packStickerOpts(pack, author, packId, type, quality = 100) {
  const { StickerTypes } = waSticker();
  type = type || StickerTypes.FULL;
  return {
    pack,
    author,
    type,
    quality,
    id: packId || `darkbot-${Date.now()}`,
    categories: ['✨'],
  };
}

async function injectMeta(webpBuf, pack, author, packId, packUrl = '') {
  const id = packId || makePackId(pack || packUrl || 'dark');
  const written = await writeStickerExif(webpBuf, {
    packId: id, pack, author, url: packUrl,
  });
  if (written && written !== webpBuf && written.length > 50) return written;
  const { Sticker, StickerTypes } = waSticker();
  const stk = new Sticker(webpBuf, packStickerOpts(pack, author, id, StickerTypes.FULL, 100));
  const fallback = await stk.toBuffer();
  return writeStickerExif(fallback, { packId: id, pack, author, url: packUrl });
}

/**
 * Renomeia o pack/author de um sticker JÁ PRONTO (webp) sem re-encodar.
 * Escreve só os metadados EXIF → preserva animação, qualidade e frames.
 * Funciona com qualquer sticker: estático ou animado, de quem quer que seja.
 * @param {Buffer} webpBuf  sticker original (webp)
 * @param {{packName?:string, authorName?:string, packUrl?:string}} opts
 */
async function renameMeta(webpBuf, { packName = '', authorName = '', packUrl = '' } = {}) {
  if (!webpBuf || webpBuf.length < 100) throw new Error('sticker inválido');
  const pack = String(packName || 'DARK NET 🕸️').trim().slice(0, 128);
  const author = String(authorName || 'DARK NET 🕸️').trim().slice(0, 128);
  const url = String(packUrl || '').trim();
  const id = makePackId((url || '') + '|' + pack);
  const out = await injectMeta(webpBuf, pack, author, id, url);
  if (out && out.length > 50) return out;
  throw new Error('não consegui renomear o sticker');
}

/* ─── API PÚBLICA ─────────────────────────────────────────────── */
/**
 * Cria sticker WhatsApp 512x512 quadrado.
 *
 * @param {Buffer} buffer     - imagem, vídeo ou GIF
 * @param {object} opts
 * @param {string} opts.botName
 * @param {string} opts.ownerName
 * @param {string} opts.userName
 * @param {string} opts.groupName
 * @param {boolean} opts.isVideo  - true se for vídeo/GIF
 */
async function create(buffer, rawOpts = {}) {
  let opts = rawOpts;
  try { opts = await require('./stickerWm').apply(rawOpts); } catch {}
  const { botName, ownerName, userName, groupName, isVideo, packName = '', authorName = '', watermarkText = '', visibleWatermark = false, packId = null, packUrl = '' } = opts;
  const pack   = packName || `${botName} • ${ownerName}`;
  const author = authorName || `${userName} | ${groupName || 'PV'}`;
  const idPack = packId || makePackId((packUrl || '') + '|' + pack);
  const urlPack = packUrl || '';
  const { Sticker, StickerTypes } = waSticker();

  const mime   = detectMime(buffer);
  const isGif  = mime === 'image/gif';
  const isVid  = isVideo || mime === 'video/mp4' || mime === 'video/webm' || mime === 'video/avi';
  const isAnim = isGif || isVid;

  /* ── GIF animado (processado pelo sharp — sem ffmpeg, sem artefactos) ── */
  if (isGif) {
    try {
      const webpAnim = await gifToWebpSquare(buffer);
      const out = await injectMeta(webpAnim, pack, author, idPack, urlPack);
      if (out && out.length > 200) return out;
    } catch (e) {
      // sharp falhou com este GIF → fallback
    }

    // Fallback: wa-sticker-formatter CROPPED (cover, não contain)
    try {
      const raw = await new Sticker(buffer, packStickerOpts(pack, author, idPack, StickerTypes.CROPPED, 80)).toBuffer();
      return injectMeta(raw, pack, author, idPack, urlPack);
    } catch (e2) {
      throw new Error('Sticker GIF falhou: ' + e2.message);
    }
  }

  /* ── Vídeo MP4/WebM (precisa de ffmpeg para converter) ── */
  if (isVid) {
    if (FFMPEG_OK) {
      try {
        const webpAnim = videoToWebpSquare(buffer);
        const out = await injectMeta(webpAnim, pack, author, idPack, urlPack);
        if (out && out.length > 200) return out;
      } catch (e) {
        // ffmpeg falhou → fallback
      }
    }

    // Fallback: wa-sticker-formatter CROPPED
    // (o wa-sticker-formatter usa ffmpeg internamente para converter MP4→GIF→WebP)
    try {
      const raw = await new Sticker(buffer, packStickerOpts(pack, author, idPack, StickerTypes.CROPPED, 80)).toBuffer();
      return injectMeta(raw, pack, author, idPack, urlPack);
    } catch (e2) {
      throw new Error('Sticker vídeo falhou: ' + e2.message);
    }
  }

  /* ── Imagem estática (JPEG, PNG, WebP) ── */
  try {
    const webp = await imageToWebpSquare(buffer, visibleWatermark ? watermarkText : '');
    const out  = await injectMeta(webp, pack, author, idPack, urlPack);
    if (out && out.length > 200) return out;
    throw new Error('output vazio');
  } catch (e) {
    // Fallback CROPPED para imagens também
    try {
      const raw = await new Sticker(buffer, packStickerOpts(pack, author, idPack, StickerTypes.CROPPED, 85)).toBuffer();
      return injectMeta(raw, pack, author, idPack, urlPack);
    } catch (e2) {
      throw new Error('Sticker imagem falhou: ' + e2.message);
    }
  }
}


/* ─── SFull: mantém a imagem/vídeo inteiro no sticker (contain + fundo transparente) ─── */
async function imageToWebpFull(buffer, watermarkText = '') {
  const sharp = require('sharp');
  let img = sharp(buffer)
    .resize(512, 512, {
      fit: 'contain',
      position: 'centre',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      withoutEnlargement: false,
    });
  const wm = watermarkSvg(watermarkText);
  if (wm) img = img.composite([{ input: wm, left: 0, top: 0 }]);
  return img.webp({ quality: 90, lossless: false }).toBuffer();
}

function videoToWebpFull(inputBuf, maxSec = Number(process.env.STICKER_VIDEO_MAX_SEC || 8)) {
  const tmp = path.join(os.tmpdir(), `stkfull_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  const inFile = `${tmp}.in`;
  const outFile = `${tmp}.webp`;
  try {
    fs.writeFileSync(inFile, inputBuf);
    execFileSync(FFMPEG_BIN, [
      '-y', '-t', String(maxSec), '-i', inFile,
      '-vf', [
        'scale=w=512:h=512:force_original_aspect_ratio=decrease',
        'pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000',
        'fps=10',
        'format=rgba',
      ].join(','),
      '-vcodec', 'libwebp_anim',
      '-lossless', '0', '-quality', '72', '-compression_level', '3',
      '-loop', '0', '-vsync', 'vfr', '-an', outFile,
    ], { timeout: 90000, stdio: 'ignore' });
    const result = fs.readFileSync(outFile);
    if (!result || result.length < 200) throw new Error('WebP vazio');
    return result;
  } finally {
    try { fs.unlinkSync(inFile); } catch {}
    try { fs.unlinkSync(outFile); } catch {}
  }
}

async function createFull(buffer, rawOpts = {}) {
  let opts = rawOpts;
  try { opts = await require('./stickerWm').apply(rawOpts); } catch {}
  const { botName, ownerName, userName, groupName, isVideo, packName = '', authorName = '', watermarkText = '', visibleWatermark = false, packId, packUrl = '' } = opts;
  const pack = packName || `${botName} • ${ownerName}`;
  const author = authorName || `${userName} | ${groupName || 'PV'} • SFULL`;
  const idPack = packId || makePackId((packUrl || '') + '|' + pack);
  const urlPack = packUrl || '';
  const { Sticker, StickerTypes } = waSticker();
  const mime = detectMime(buffer);
  const isGif = mime === 'image/gif';
  const isVid = isVideo || mime === 'video/mp4' || mime === 'video/webm' || mime === 'video/avi';

  if ((isGif || isVid) && FFMPEG_OK) {
    try {
      const webp = videoToWebpFull(buffer);
      const out = await injectMeta(webp, pack, author, idPack, urlPack);
      if (out && out.length > 200) return out;
    } catch (e) {}
  }

  try {
    const webp = await imageToWebpFull(buffer, visibleWatermark ? watermarkText : '');
    const out = await injectMeta(webp, pack, author, idPack, urlPack);
    if (out && out.length > 200) return out;
  } catch (e) {}

  return injectMeta(
    await new Sticker(buffer, packStickerOpts(pack, author, idPack, StickerTypes.FULL, 90)).toBuffer(),
    pack, author, idPack, urlPack
  );
}

/** Regrava pack/author/id no WebP já pronto (ex: pack + definestickwm). */
async function stampPack(stickers, { pack, author, packId, packUrl } = {}) {
  const out = [];
  for (const buf of stickers || []) {
    if (!buf || !buf.length) continue;
    try {
      const next = await injectMeta(buf, pack, author, packId, packUrl);
      out.push(next && next.length > 50 ? next : buf);
    } catch {
      out.push(buf);
    }
  }
  return out;
}

module.exports = {
  create,
  createFull,
  detectMime,
  FFMPEG_OK,
  makePackId,
  injectMeta,
  renameMeta,
  stampPack,
  packStickerOpts,
  buildStickerExifJson,
  writeStickerExif,
};

