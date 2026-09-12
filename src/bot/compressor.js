/**
 * DARK BOT v7 — Media Compressor
 * Reduz qualidade/tamanho de imagens e vídeos sem danificar
 *
 * !compress [qualidade] — comprime a imagem/vídeo marcado
 * !reduce [qualidade]   — alias
 * Qualidade: 1-100 (padrão 60 para imagens, 720p para vídeo)
 */
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Detecta ffmpeg
let _ffmpeg = null;
function ffmpegBin() {
  if (_ffmpeg) return _ffmpeg;
  try { _ffmpeg = require('ffmpeg-static'); if (_ffmpeg) return _ffmpeg; } catch {}
  for (const p of ['/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg', 'ffmpeg']) {
    try { const r = spawnSync(p, ['-version'], { timeout: 3000, stdio: 'pipe' }); if (r.status === 0) { _ffmpeg = p; return p; } } catch {}
  }
  _ffmpeg = 'ffmpeg'; return _ffmpeg;
}

/**
 * Comprime imagem (JPEG/WebP/PNG)
 * @param {Buffer} inputBuf - buffer da imagem original
 * @param {number} quality - qualidade 1-100 (padrão 60)
 * @returns {Buffer} buffer comprimido
 */
function compressImage(inputBuf, quality = 60) {
  const sharp = require('sharp');
  const q = Math.max(10, Math.min(100, quality));

  // Detecta formato
  const isJpeg = inputBuf[0] === 0xFF && inputBuf[1] === 0xD8;
  const isPng = inputBuf[0] === 0x89 && inputBuf[1] === 0x50;

  let pipeline = sharp(inputBuf);

  // Reduz dimensões se muito grande
  pipeline = pipeline.resize(1920, 1920, { fit: 'inside', withoutEnlargement: true });

  if (isJpeg) {
    pipeline = pipeline.jpeg({ quality: q, mozjpeg: true });
  } else if (isPng) {
    pipeline = pipeline.png({ quality: q, compressionLevel: 9 });
  } else {
    pipeline = pipeline.webp({ quality: q });
  }

  return pipeline.toBuffer();
}

/**
 * Comprime vídeo
 * @param {Buffer} inputBuf - buffer do vídeo original
 * @param {string} resolution - resolução alvo (360, 480, 720)
 * @returns {Buffer} buffer comprimido
 */
function compressVideo(inputBuf, resolution = '480') {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'darkbot-compress-'));
  const inPath = path.join(tmp, 'input.mp4');
  const outPath = path.join(tmp, 'output.mp4');

  try {
    fs.writeFileSync(inPath, inputBuf);

    const res = parseInt(resolution) || 480;
    const crf = res <= 360 ? '28' : res <= 480 ? '26' : '24';
    const preset = res <= 480 ? 'fast' : 'medium';

    const r = spawnSync(ffmpegBin(), [
      '-y', '-i', inPath,
      '-vf', `scale=-2:${res}`,
      '-c:v', 'libx264', '-crf', crf, '-preset', preset,
      '-c:a', 'aac', '-b:a', '96k',
      '-movflags', '+faststart',
      outPath,
    ], { timeout: 120000, stdio: 'pipe' });

    if (!fs.existsSync(outPath) || fs.statSync(outPath).size < 1024) {
      throw new Error('ffmpeg falhou: ' + (r.stderr?.toString().slice(-100) || ''));
    }

    return fs.readFileSync(outPath);
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  }
}

/**
 * Comprime áudio
 * @param {Buffer} inputBuf - buffer do áudio original
 * @param {string} bitrate - bitrate alvo (64k, 96k, 128k)
 * @returns {Buffer} buffer comprimido
 */
function compressAudio(inputBuf, bitrate = '96k') {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'darkbot-compress-'));
  const inPath = path.join(tmp, 'input');
  const outPath = path.join(tmp, 'output.mp3');

  try {
    fs.writeFileSync(inPath, inputBuf);

    const r = spawnSync(ffmpegBin(), [
      '-y', '-i', inPath,
      '-c:a', 'libmp3lame', '-b:a', bitrate,
      '-ar', '22050',
      outPath,
    ], { timeout: 60000, stdio: 'pipe' });

    if (!fs.existsSync(outPath) || fs.statSync(outPath).size < 512) {
      throw new Error('ffmpeg falhou');
    }

    return fs.readFileSync(outPath);
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  }
}

/**
 * Detecta tipo de mídia e comprime adequadamente
 */
function autoCompress(inputBuf, quality) {
  const isJpeg = inputBuf[0] === 0xFF && inputBuf[1] === 0xD8;
  const isPng = inputBuf[0] === 0x89 && inputBuf[1] === 0x50;
  const isWebp = inputBuf[8] === 0x57 && inputBuf[9] === 0x45;
  const isMp4 = inputBuf.slice(4, 8).toString() === 'ftyp';
  const isGif = inputBuf[0] === 0x47 && inputBuf[1] === 0x49;
  const isAudio = inputBuf[0] === 0xFF && inputBuf[1] === 0xFB;

  if (isJpeg || isPng || isWebp) {
    return { buf: compressImage(inputBuf, quality || 60), type: 'image' };
  }
  if (isMp4 || isGif) {
    return { buf: compressVideo(inputBuf, quality || '480'), type: 'video' };
  }
  if (isAudio) {
    return { buf: compressAudio(inputBuf, quality || '96k'), type: 'audio' };
  }

  // Tenta como imagem por defeito
  try {
    return { buf: compressImage(inputBuf, quality || 60), type: 'image' };
  } catch {
    throw new Error('Formato não suportado para compressão');
  }
}

module.exports = { compressImage, compressVideo, compressAudio, autoCompress };
