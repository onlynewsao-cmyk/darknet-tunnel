/**
 * DARK BOT v7.3 — YT Download Engine
 * ─────────────────────────────────────────────────────────────
 * Estratégia multi-fallback (por ordem de prioridade):
 *  1. yt-dlp local (se instalado — funciona no Render)
 *  2. @distube/ytdl-core (stream directo)
 *  3. youtubei.js (stream directo)
 *  4. Loader.to (serviço externo — funciona em qualquer lado)
 *  5. SystemZone /api/ytmp4 (quando disponível)
 *
 * Áudio: baixa M4A/MP4 → extrai MP3 com ffmpeg
 * Vídeo: baixa MP4 directo
 */
'use strict';

const path       = require('path');
const fs         = require('fs');
const os         = require('os');
const { spawnSync } = require('child_process');
const yts        = require('yt-search');

const SZ_URL = (process.env.SYSTEMZONE_API_URL || 'https://systemzone.store').replace(/\/$/, '');
const SZ_KEY = process.env.SYSTEMZONE_API_KEY || 'freekey';
const MAX_SEC = Number(process.env.MAX_YOUTUBE_SECONDS || 5400);

// ─── ffmpeg ──────────────────────────────────────────────────
let _ffmpeg = null;
function ffmpegBin() {
  if (_ffmpeg) return _ffmpeg;
  try { _ffmpeg = require('ffmpeg-static'); if (_ffmpeg) return _ffmpeg; } catch {}
  for (const p of ['/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg', 'ffmpeg']) {
    try { const r = spawnSync(p, ['-version'], { timeout: 3000, stdio: 'pipe' }); if (r.status === 0) { _ffmpeg = p; return p; } } catch {}
  }
  _ffmpeg = 'ffmpeg'; return _ffmpeg;
}

// ─── yt-dlp ──────────────────────────────────────────────────
let _ytdlp = null;
function ytdlpBin() {
  if (_ytdlp !== null) return _ytdlp;
  for (const p of ['yt-dlp', '/usr/bin/yt-dlp', '/usr/local/bin/yt-dlp']) {
    try { const r = spawnSync(p, ['--version'], { timeout: 3000, stdio: 'pipe' }); if (r.status === 0) { _ytdlp = p; return p; } } catch {}
  }
  _ytdlp = ''; return '';
}

// ─── Helpers ─────────────────────────────────────────────────
function isUrl(s) { return /^https?:\/\//i.test(String(s || '')); }

function safeTitle(s = '') {
  return String(s).replace(/[/\\?%*:|"<>]/g, '-').trim().slice(0, 60) || 'audio';
}

function parseDuration(s = '') {
  if (typeof s === 'number') return s;
  const p = String(s || '').split(':').map(Number);
  if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
  if (p.length === 2) return p[0] * 60 + p[1];
  return p[0] || 0;
}

async function fetchBuf(url, timeoutMs = 120000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'pt-BR,pt;q=0.9',
        'Referer': 'https://www.youtube.com/',
      },
    });
    if (!r.ok) throw new Error('HTTP ' + r.status + ' em ' + url.slice(0, 60));
    return Buffer.from(await r.arrayBuffer());
  } finally { clearTimeout(t); }
}

async function fetchJson(url, timeoutMs = 30000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'DarkBot/7.3', 'Accept': 'application/json' },
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  } finally { clearTimeout(t); }
}

// ─── Busca de vídeo ──────────────────────────────────────────
async function searchVideo(query) {
  if (isUrl(query)) {
    const m = String(query).match(/[?&v=]([a-zA-Z0-9_-]{11})|youtu\.be\/([a-zA-Z0-9_-]{11})/);
    const vid = m?.[1] || m?.[2] || '';
    return {
      url: query, videoId: vid,
      title: query, author: '', duration: '', seconds: 0,
      thumb: vid ? `https://i.ytimg.com/vi/${vid}/hqdefault.jpg` : '',
    };
  }

  // 1. yt-search (rápido, sem key)
  try {
    const res = await yts(query);
    const v = res.videos?.find(v => v.seconds > 10 && v.seconds <= MAX_SEC) || res.videos?.[0];
    if (v) return {
      url: v.url, videoId: v.videoId, title: v.title,
      author: v.author?.name || '', duration: v.duration?.timestamp || '',
      seconds: v.seconds || 0,
      thumb: v.thumbnail || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
    };
  } catch {}

  throw new Error('Nenhum resultado encontrado para: ' + query);
}

// ═══════════════════════════════════════════════════════════════
// MÉTODO 1: yt-dlp local
// ═══════════════════════════════════════════════════════════════
async function ytdlpDownload(videoUrl, audioOnly = true, quality = '128k', maxHeight = '720') {
  const bin = ytdlpBin();
  if (!bin) throw new Error('yt-dlp não instalado');

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'darkbot-ytdlp-'));
  const outTpl = path.join(tmp, '%(title)s.%(ext)s');

  // v7.4: ffmpeg-location É OBRIGATÓRIO para converter WebM → MP3
  // Sem isto, yt-dlp baixa WebM bruto e o WhatsApp não reproduz
  const ffmpegPath = ffmpegBin();
  const ffmpegDir = path.dirname(ffmpegPath);

  const args = ['--no-playlist', '--max-filesize', '50m', '-o', outTpl, '--no-part', '--quiet',
    '--ffmpeg-location', ffmpegDir];

  if (audioOnly) {
    args.push('-x', '--audio-format', 'mp3', '--audio-quality', String(quality || '128k').toUpperCase());
  } else {
    // v7.4: formato inteligente — limita tamanho para WhatsApp (~15MB)
    // Usa AV1 quando disponível (menor tamanho) senão H.264
    const maxH = Number.parseInt(String(maxHeight).replace(/\D/g, ''), 10) || 720;
    args.push('-f',
      `bestvideo[height<=${maxH}][ext=mp4][filesize<15M]+bestaudio[ext=m4a]/` +
      `bestvideo[height<=${maxH}][ext=mp4]+bestaudio[ext=m4a]/` +
      `best[height<=${maxH}][ext=mp4]/` +
      `best[height<=${maxH}]`
    );
    args.push('--merge-output-format', 'mp4');
  }
  args.push(videoUrl);

  try {
    spawnSync(bin, args, { timeout: 120000, stdio: 'pipe' });
    const files = fs.readdirSync(tmp);
    if (!files.length) throw new Error('yt-dlp não gerou ficheiro');
    const outFile = path.join(tmp, files[0]);
    const buf = fs.readFileSync(outFile);
    if (!buf || buf.length < 1024) throw new Error('ficheiro vazio');

    // v7.4: VERIFICA se o ficheiro é realmente MP3/MP4 (não WebM)
    if (audioOnly) {
      const isWebM = buf.slice(0, 4).toString('hex') === '1a45dfa3';
      if (isWebM) throw new Error('yt-dlp gerou WebM em vez de MP3 — ffmpeg não converteu');
      const ext = path.extname(files[0]).toLowerCase();
      if (ext === '.webm' || ext === '.mka') throw new Error('yt-dlp gerou ' + ext + ' em vez de .mp3');
    } else {
      // v7.4: Se vídeo > 15MB, comprime para caber no WhatsApp
      if (buf.length > 15 * 1024 * 1024) {
        console.log('[ytdl] Video ' + (buf.length / 1048576).toFixed(0) + 'MB — comprimindo...');
        const compressed = await compressVideoForWhatsApp(buf);
        if (compressed && compressed.length < buf.length) {
          return compressed;
        }
      }
    }

    return buf;
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  }
}

// ═══════════════════════════════════════════════════════════════
// MÉTODO 2: @distube/ytdl-core stream
// ═══════════════════════════════════════════════════════════════
async function distubeDlAudio(videoUrl) {
  const ytdl = require('@distube/ytdl-core');
  const info = await ytdl.getInfo(videoUrl, {
    requestOptions: {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Accept-Language': 'pt-BR,pt;q=0.9' },
    },
  });

  const audio = info.formats.filter(f => f.hasAudio && !f.hasVideo && f.url);
  if (!audio.length) throw new Error('Nenhum formato de áudio disponível');

  audio.sort((a, b) => (b.audioBitrate || 0) - (a.audioBitrate || 0));
  const fmt = audio[0];
  const buf = await fetchBuf(fmt.url, 120000);
  if (!buf || buf.length < 1024) throw new Error('stream de áudio vazio');
  return { buf, fmt };
}

// ═══════════════════════════════════════════════════════════════
// MÉTODO 3: youtubei.js stream
// ═══════════════════════════════════════════════════════════════
async function youtubeijsStream(videoId, audioOnly = true) {
  const { Innertube } = require('youtubei.js');
  const yt = await Innertube.create({ generate_session_locally: true });
  const stream = await yt.download(videoId, {
    type: audioOnly ? 'audio' : 'video',
    quality: 'best',
    format: 'mp4',
  });
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
    if (chunks.reduce((a, c) => a + c.length, 0) > 50 * 1024 * 1024) break;
  }
  const buf = Buffer.concat(chunks);
  if (!buf || buf.length < 1024) throw new Error('stream youtubei.js vazio');
  return buf;
}

// ═══════════════════════════════════════════════════════════════
// MÉTODO 4: Loader.to (serviço externo — funciona em qualquer lado)
// ═══════════════════════════════════════════════════════════════
const LOADER_TO = 'https://loader.to';
const LOADER_PROGRESS = 'https://lto2.affadaffa.com/api/progress';

async function loaderDownload(videoUrl, format = 'mp3') {
  // 1. Iniciar conversão
  const startUrl = `${LOADER_TO}/ajax/download.php?format=${format}&url=${encodeURIComponent(videoUrl)}&add_info=1`;
  const startResp = await fetchJson(startUrl, 30000);

  if (!startResp?.id) throw new Error('Loader.to: sem task ID');

  const taskId = startResp.id;
  const title = startResp.title || 'YouTube';
  const info = startResp.info || {};

  // 2. Polling até ficar pronto (máx 90s)
  const progressUrl = startResp.progress_url || `${LOADER_PROGRESS}?id=${taskId}`;
  let downloadUrl = '';

  for (let i = 0; i < 18; i++) {
    await new Promise(r => setTimeout(r, 5000));
    try {
      const pr = await fetchJson(progressUrl, 10000);
      if (pr.success === 1 && pr.download_url) {
        downloadUrl = pr.download_url;
        break;
      }
    } catch {}
  }

  if (!downloadUrl) throw new Error('Loader.to: timeout na conversão');

  // 3. Download do ficheiro
  const buffer = await fetchBuf(downloadUrl, 180000);
  if (!buffer || buffer.length < 1024) throw new Error('Loader.to: ficheiro vazio');

  return {
    title,
    buffer,
    url: downloadUrl,
    author: info.uploader || '',
    thumbnail: info.image || '',
  };
}

// ═══════════════════════════════════════════════════════════════
// MÉTODO 5: SystemZone (opcional)
// ═══════════════════════════════════════════════════════════════
async function szDownloadMP4(videoUrl) {
  const r = await fetch(
    `${SZ_URL}/api/ytmp4?text=${encodeURIComponent(videoUrl)}&apikey=${SZ_KEY}`,
    { headers: { 'User-Agent': 'DarkBot/7.3' }, signal: AbortSignal.timeout(40000) }
  );
  const text = await r.text();
  // Verifica se é JSON (não HTML)
  if (!text.trim().startsWith('{')) throw new Error('SystemZone: resposta não é JSON');
  const d = JSON.parse(text);
  const url = d?.result?.download || d?.download_url || d?.url;
  if (!d?.status || !url) throw new Error('SZ: ' + (d?.error || 'sem URL'));
  return { url, title: d?.result?.title || d?.title || '', quality: d?.result?.quality || '720p' };
}

// ─── Comprimir vídeo para WhatsApp (máx ~15MB) ──────────────
async function compressVideoForWhatsApp(inputBuf) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'darkbot-compress-'));
  const inPath = path.join(tmp, 'input.mp4');
  const outPath = path.join(tmp, 'output.mp4');
  try {
    fs.writeFileSync(inPath, inputBuf);
    // Comprime: 480p, CRF 28, áudio 96k
    const r = spawnSync(ffmpegBin(), [
      '-y', '-i', inPath,
      '-vf', 'scale=-2:480',
      '-c:v', 'libx264', '-crf', '28', '-preset', 'fast',
      '-c:a', 'aac', '-b:a', '96k',
      '-movflags', '+faststart',
      outPath,
    ], { timeout: 180000, stdio: 'pipe' });
    if (!fs.existsSync(outPath) || fs.statSync(outPath).size < 1024) {
      throw new Error('compressao falhou');
    }
    return fs.readFileSync(outPath);
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  }
}

// ─── Extrai MP3 de buffer M4A/MP4 ────────────────────────────
function extractAudioFromBuffer(inputBuf, bitrate = '128k') {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'darkbot-audio-'));
  const inPath = path.join(tmp, 'input.m4a');
  const outPath = path.join(tmp, 'audio.mp3');
  try {
    fs.writeFileSync(inPath, inputBuf);
    const r = spawnSync(ffmpegBin(), [
      '-y', '-i', inPath,
      '-vn', '-ar', '44100', '-ac', '2', '-b:a', bitrate,
      outPath,
    ], { timeout: 120000, stdio: 'pipe' });
    if (!fs.existsSync(outPath) || fs.statSync(outPath).size < 1024) {
      throw new Error('ffmpeg falhou: ' + (r.stderr?.toString().slice(-150) || ''));
    }
    return fs.readFileSync(outPath);
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  }
}

// ═══════════════════════════════════════════════════════════════
// API PÚBLICA
// ═══════════════════════════════════════════════════════════════

/** Busca + baixa áudio MP3 — 5 fallbacks */
async function getAudio(query, quality = '128k') {
  const meta = await searchVideo(query);
  if (meta.seconds > MAX_SEC) {
    throw new Error('⏱️ Vídeo muito longo (' + Math.floor(meta.seconds / 60) + ' min). Limite: ' + Math.floor(MAX_SEC / 60) + ' min.');
  }

  const errors = [];

  // 1. yt-dlp
  try {
    const buf = await ytdlpDownload(meta.url, true, quality, '720');
    return { ...meta, buffer: buf, mimetype: 'audio/mpeg', ext: 'mp3', quality, source: 'yt-dlp' };
  } catch (e) { errors.push('yt-dlp: ' + e.message?.slice(0, 60)); }

  // 2. @distube/ytdl-core
  try {
    const { buf } = await distubeDlAudio(meta.url);
    const mp3buf = extractAudioFromBuffer(buf, quality);
    return { ...meta, buffer: mp3buf, mimetype: 'audio/mpeg', ext: 'mp3', quality, source: 'ytdl-core' };
  } catch (e) { errors.push('ytdl-core: ' + e.message?.slice(0, 60)); }

  // 3. youtubei.js
  if (meta.videoId) {
    try {
      const m4abuf = await youtubeijsStream(meta.videoId, true);
      const mp3buf = extractAudioFromBuffer(m4abuf, quality);
      return { ...meta, buffer: mp3buf, mimetype: 'audio/mpeg', ext: 'mp3', quality, source: 'youtubei.js' };
    } catch (e) { errors.push('youtubei: ' + e.message?.slice(0, 60)); }
  }

  // 4. Loader.to
  try {
    const r = await loaderDownload(meta.url, 'mp3');
    // Loader.to pode ignorar o bitrate pedido; normalizamos sempre com
    // FFmpeg para que 96k/192k/320k sejam reais também no fallback.
    const mp3buf = extractAudioFromBuffer(r.buffer, quality);
    return { ...meta, title: r.title || meta.title, buffer: mp3buf, mimetype: 'audio/mpeg', ext: 'mp3', quality, source: 'loader.to' };
  } catch (e) { errors.push('loader.to: ' + e.message?.slice(0, 60)); }

  // 5. SystemZone
  try {
    const info = await szDownloadMP4(meta.url);
    const mp4buf = await fetchBuf(info.url, 120000);
    if (mp4buf && mp4buf.length > 10240) {
      const mp3buf = extractAudioFromBuffer(mp4buf, quality);
      return { ...meta, title: info.title || meta.title, buffer: mp3buf, mimetype: 'audio/mpeg', ext: 'mp3', quality, source: 'SystemZone' };
    }
  } catch (e) { errors.push('SZ: ' + e.message?.slice(0, 60)); }

  console.error('[ytdl.getAudio] ' + errors.length + ' métodos falharam:', errors.join(' | '));
  throw new Error('❌ Download indisponível. Tenta de novo.\n\n🎵 Link: ' + meta.url);
}

/** Busca + baixa vídeo MP4 — 5 fallbacks */
async function getVideo(query, maxHeight = '720') {
  const meta = await searchVideo(query);
  if (meta.seconds > MAX_SEC) {
    throw new Error('⏱️ Vídeo muito longo (' + Math.floor(meta.seconds / 60) + ' min). Limite: ' + Math.floor(MAX_SEC / 60) + ' min.');
  }

  const errors = [];

  // 1. yt-dlp
  try {
    const buf = await ytdlpDownload(meta.url, false, '128k', maxHeight);
    return { ...meta, buffer: buf, mimetype: 'video/mp4', ext: 'mp4', quality: maxHeight + 'p', source: 'yt-dlp' };
  } catch (e) { errors.push('yt-dlp: ' + e.message?.slice(0, 60)); }

  // 2. youtubei.js
  if (meta.videoId) {
    try {
      const buf = await youtubeijsStream(meta.videoId, false);
      return { ...meta, buffer: buf, mimetype: 'video/mp4', ext: 'mp4', quality: maxHeight + 'p', source: 'youtubei.js' };
    } catch (e) { errors.push('youtubei: ' + e.message?.slice(0, 60)); }
  }

  // 3. Loader.to
  try {
    const r = await loaderDownload(meta.url, maxHeight === '360' ? '360' : maxHeight === '480' ? '480' : '720');
    return { ...meta, title: r.title || meta.title, buffer: r.buffer, mimetype: 'video/mp4', ext: 'mp4', quality: maxHeight + 'p', source: 'loader.to' };
  } catch (e) { errors.push('loader.to: ' + e.message?.slice(0, 60)); }

  // 4. SystemZone
  try {
    const info = await szDownloadMP4(meta.url);
    const buf = await fetchBuf(info.url, 180000);
    if (buf && buf.length > 10240) {
      return { ...meta, title: info.title || meta.title, buffer: buf, mimetype: 'video/mp4', ext: 'mp4', quality: info.quality || maxHeight + 'p', source: 'SystemZone' };
    }
  } catch (e) { errors.push('SZ: ' + e.message?.slice(0, 60)); }

  console.error('[ytdl.getVideo] ' + errors.length + ' métodos falharam:', errors.join(' | '));
  throw new Error('❌ Download de vídeo indisponível.\n\n🎬 Link: ' + meta.url);
}

/** Só busca, sem download */
async function search(query) { return searchVideo(query); }

module.exports = { getAudio, getVideo, search, searchVideo };
