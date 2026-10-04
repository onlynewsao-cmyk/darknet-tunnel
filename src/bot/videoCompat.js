'use strict';
/**
 * Vídeo seguro para WhatsApp.
 *
 * Alguns provedores chamam qualquer ficheiro de MP4, mas entregam WebM/HTML,
 * uma stream incompleta ou codecs que o WhatsApp Android não reproduz. Este
 * módulo valida o contentor, obtém a duração do próprio MP4 e, quando houver
 * ffmpeg, normaliza para H.264 + AAC + yuv420p + faststart.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const execFileAsync = require('util').promisify(execFile);

function isMp4(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 32) return false;
  const first = buffer.slice(0, 64).toString('latin1').toLowerCase();
  if (first.includes('<!doctype') || first.includes('<html') || first.includes('{"error')) return false;
  // ISO BMFF: normal e fragmented MP4 trazem `ftyp` no começo.
  return buffer.slice(4, 8).toString('ascii') === 'ftyp' || buffer.indexOf(Buffer.from('ftyp')) >= 0;
}

function formatDuration(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  if (!s) return '';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

/** Lê o atom mvhd sem depender de ffprobe; funciona em MP4 comuns. */
function durationFromMp4(buffer) {
  if (!isMp4(buffer)) return '';
  let at = 0;
  while (at >= 0) {
    at = buffer.indexOf(Buffer.from('mvhd'), at);
    if (at < 0) break;
    try {
      const version = buffer[at + 4];
      let timeScale, duration;
      if (version === 1 && at + 36 <= buffer.length) {
        timeScale = buffer.readUInt32BE(at + 24);
        const high = buffer.readUInt32BE(at + 28);
        const low = buffer.readUInt32BE(at + 32);
        duration = high * 0x100000000 + low;
      } else if (at + 24 <= buffer.length) {
        timeScale = buffer.readUInt32BE(at + 16);
        duration = buffer.readUInt32BE(at + 20);
      }
      if (timeScale > 0 && Number.isFinite(duration) && duration > 0) return formatDuration(duration / timeScale);
    } catch {}
    at += 4;
  }
  return '';
}

async function ffmpegAvailable() {
  const candidates = [];
  if (process.env.FFMPEG_PATH) candidates.push(process.env.FFMPEG_PATH);
  try {
    const bundled = require('ffmpeg-static');
    if (bundled && fs.existsSync(bundled)) candidates.push(bundled);
  } catch {}
  candidates.push('ffmpeg');
  for (const bin of [...new Set(candidates)]) {
    try {
      await execFileAsync(bin, ['-version'], { timeout: 2500, windowsHide: true });
      return bin;
    } catch {}
  }
  return null;
}

/**
 * Devolve um MP4 que o WhatsApp pode tocar. Se o host não tem ffmpeg, ainda
 * verifica o contentor e mantém o MP4 original em vez de enviar HTML/WebM.
 */
async function prepareForWhatsApp(buffer, opts = {}) {
  if (!isMp4(buffer)) throw new Error('o provedor não entregou um MP4 válido');
  const originalDuration = durationFromMp4(buffer);
  const ffmpeg = await ffmpegAvailable();
  if (!ffmpeg || opts.reencode === false || process.env.VIDEO_REENCODE === '0') {
    return { buffer, duration: originalDuration, normalized: false };
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dark-video-'));
  try {
    const input = path.join(dir, 'input.mp4');
    const output = path.join(dir, 'whatsapp.mp4');
    fs.writeFileSync(input, buffer);
    const maxHeight = Math.max(144, Math.min(720, Number(opts.maxHeight) || 480));
    await execFileAsync(ffmpeg, [
      '-y', '-i', input,
      '-map', '0:v:0', '-map', '0:a?',
      '-vf', `scale=-2:min(${maxHeight},ih):flags=lanczos`,
      '-c:v', 'libx264', '-profile:v', 'baseline', '-level', '3.1',
      '-pix_fmt', 'yuv420p', '-crf', String(opts.crf || 27), '-preset', 'veryfast',
      '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart',
      output,
    ], { timeout: Number(opts.timeoutMs) || 240000, windowsHide: true, maxBuffer: 1024 * 1024 });
    const normalized = fs.readFileSync(output);
    if (!isMp4(normalized) || normalized.length < 4096) throw new Error('ffmpeg gerou um MP4 inválido');
    return { buffer: normalized, duration: durationFromMp4(normalized) || originalDuration, normalized: true };
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
}

module.exports = { isMp4, formatDuration, durationFromMp4, ffmpegAvailable, prepareForWhatsApp };
