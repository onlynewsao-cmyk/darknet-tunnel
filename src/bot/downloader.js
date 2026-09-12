/**
 * Downloader v9 — Delivery Engine simples e funcional (Junho 2026)
 *
 * Regra: poucas fontes, rápidas e testadas.
 * YouTube: SystemZone freekey → yt-dlp fallback local.
 * Social: APIs dedicadas que funcionam; sem Cobalt público/loader/keys quebradas.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, execSync } = require('child_process');
const yts = require('yt-search');
const mediaHandler = require('./mediaHandler');
const {
  systemZoneYtVideo,
  systemZoneSpotifySearch, systemZoneSpotifyDownload,
  systemZoneSoundCloudSearch, systemZoneSoundCloudDownload,
  systemZoneTwitter,
  tikwmDownload, spotifydownDownload,
  siputzxPinterest, siputzxPinterestSearch,
  fetchMediaBuffer,
} = require('./dl/helpers');

function safeTitle(name = 'media') {
  return String(name || 'media').replace(/[/\\?%*:|"<>]/g, '-').slice(0, 80) || 'media';
}

function isUrl(input) {
  return /^https?:\/\//i.test(String(input || ''));
}

const MAX_YOUTUBE_SECONDS = Number(process.env.MAX_YOUTUBE_SECONDS || 90 * 60); // 1h30

function parseDurationToSeconds(v = '') {
  if (typeof v === 'number') return v;
  const s = String(v || '').trim();
  if (!s) return 0;
  const parts = s.split(':').map(x => Number(x));
  if (parts.some(n => Number.isNaN(n))) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

function assertDurationAllowed(seconds, title = 'mídia') {
  if (seconds && seconds > MAX_YOUTUBE_SECONDS) {
    const maxMin = Math.floor(MAX_YOUTUBE_SECONDS / 60);
    throw new Error(`⏱️ Vídeo muito longo: ${title} tem ${Math.floor(seconds / 60)}min. Limite do bot: ${maxMin}min (1h30).`);
  }
}

function getFfmpegBin() {
  try { return require('ffmpeg-static') || 'ffmpeg'; }
  catch { return 'ffmpeg'; }
}

function findDownloadedFile(dir) {
  const files = fs.readdirSync(dir)
    .filter(f => !f.endsWith('.part') && !f.endsWith('.ytdl') && !f.endsWith('.json'))
    .map(f => path.join(dir, f))
    .filter(f => fs.statSync(f).isFile())
    .sort((a, b) => fs.statSync(b).size - fs.statSync(a).size);
  return files[0] || null;
}

// ==================== BUSCA YOUTUBE ====================
async function youtubeSearch(query) {
  if (isUrl(query)) {
    return { url: query, title: query, thumb: '', duration: '', author: '', seconds: 0 };
  }

  async function searchOnce(q, maxSeconds = 12 * 60) {
    const r = await yts(q);
    const videos = (r.videos || []).filter(v => v?.url && v.seconds > 0);
    return videos.find(v => v.seconds >= 30 && v.seconds <= maxSeconds) || null;
  }

  let v = await searchOnce(query, MAX_YOUTUBE_SECONDS);
  if (!v) v = await searchOnce(`${query} song short`, MAX_YOUTUBE_SECONDS);
  if (!v) v = await searchOnce(query, MAX_YOUTUBE_SECONDS);

  if (!v) throw new Error(`🔍 Não encontrei \"${query}\" no YouTube dentro do limite de 1h30.`);
  assertDurationAllowed(v.seconds || 0, v.title);
  return {
    url: v.url, title: v.title, id: v.videoId,
    thumb: v.thumbnail || `https://img.youtube.com/vi/${v.videoId}/hqdefault.jpg`,
    duration: v.timestamp || '', seconds: v.seconds || 0,
    author: v.author?.name || v.author || '', views: v.views || 0,
  };
}

async function resolveMedia(input) {
  if (isUrl(input)) return { url: input, title: input, duration: '', author: '', thumb: '', seconds: 0 };
  return youtubeSearch(input);
}

// ==================== yt-dlp (fallback robusto) ====================
function findNodeBin() {
  if (process.env.NODE_BIN) return process.env.NODE_BIN;
  try { return execFileSync('which', ['node'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { return 'node'; }
}

function writeYtCookies(tmpDir) {
  const raw = process.env.YTDLP_COOKIES_BASE64 || process.env.YT_COOKIES_BASE64 || '';
  if (!raw) return '';
  try {
    const cookiePath = path.join(tmpDir || os.tmpdir(), `ytcookies_${Date.now()}.txt`);
    fs.writeFileSync(cookiePath, Buffer.from(raw, 'base64').toString('utf8'));
    return cookiePath;
  } catch { return ''; }
}

function withYtDlpHardening(args, tmpDir = '') {
  const out = [
    '--no-playlist',
    '--force-ipv4',
    '--geo-bypass',
    '--no-check-certificate',
    '--user-agent', process.env.YTDLP_USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
    '--add-header', 'Accept-Language:en-US,en;q=0.9,pt;q=0.8',
    // YouTube 2026: yt-dlp precisa de runtime JS/remote EJS para resolver assinatura/n-challenge.
    '--js-runtimes', `node:${findNodeBin()}`,
    '--remote-components', 'ejs:npm',
    '--extractor-args', process.env.YTDLP_EXTRACTOR_ARGS || 'youtube:player_client=default,web_creator,android_vr',
  ];
  if (process.env.YTDLP_PROXY) out.push('--proxy', process.env.YTDLP_PROXY);
  const cookies = writeYtCookies(tmpDir);
  if (cookies) out.push('--cookies', cookies);
  return [...out, ...args];
}

function runYtDlp(args, timeoutMs = 180000, tmpDir = '') {
  const runners = [];
  if (process.env.YTDLP_BIN) runners.push({ cmd: process.env.YTDLP_BIN, prefix: [] });
  runners.push({ cmd: 'python3', prefix: ['-m', 'yt_dlp'] });
  runners.push({ cmd: 'yt-dlp', prefix: [] });

  const hardenedArgs = withYtDlpHardening(args, tmpDir);
  const errors = [];
  for (const runner of runners) {
    try {
      return execFileSync(runner.cmd, [...runner.prefix, ...hardenedArgs], {
        encoding: 'utf8', timeout: timeoutMs, maxBuffer: 20 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin' },
      });
    } catch (e) {
      errors.push(`${runner.cmd}: ${String(e.stderr?.toString?.() || e.message).replace(/\s+/g, ' ').slice(0, 260)}`);
    }
  }
  throw new Error('yt-dlp falhou: ' + errors.slice(0, 3).join(' | '));
}

function extractAudioFromVideoBuffer(videoBuffer, bitrate = '128k') {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'darkbot-video2audio-'));
  const input = path.join(tmpDir, 'input.mp4');
  const out = path.join(tmpDir, 'audio.mp3');
  try {
    fs.writeFileSync(input, videoBuffer);
    execFileSync(getFfmpegBin(), ['-y', '-i', input, '-vn', '-b:a', bitrate, '-ar', '44100', '-ac', '2', '-f', 'mp3', out], { stdio: 'ignore', timeout: 160000 });
    const buf = fs.readFileSync(out);
    if (!buf || buf.length < 2048) throw new Error('áudio extraído vazio');
    return buf;
  } finally { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {} }
}


async function ytdlpAudio(media, bitrate, label, timeoutMs) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'darkbot-audio-'));
  const outTpl = path.join(tmpDir, 'source.%(ext)s');
  try {
    const ffLoc = getFfmpegBin();
    const ffArgs = ['--no-playlist', '--no-warnings', '--force-overwrites', '--no-part',
      '--retries', '1', '--socket-timeout', '20', '--max-filesize', '35M', '-f', 'bestaudio/best', '-o', outTpl];
    if (ffLoc && ffLoc !== 'ffmpeg') ffArgs.push('--ffmpeg-location', path.dirname(ffLoc));
    ffArgs.push(media.url);
    runYtDlp(ffArgs, timeoutMs, tmpDir);
    const input = findDownloadedFile(tmpDir);
    if (!input) throw new Error('yt-dlp não gerou arquivo');
    const out = path.join(tmpDir, 'audio.mp3');
    execFileSync(getFfmpegBin(), ['-y', '-i', input, '-vn', '-b:a', bitrate, '-ar', '44100', '-ac', '2', '-f', 'mp3', out], { stdio: 'ignore', timeout: 150000 });
    const buffer = fs.readFileSync(out);
    if (!buffer || buffer.length < 2048) throw new Error('áudio vazio');
    return { title: media.title, duration: media.duration, author: media?.author || '', thumb: media.thumb, url: '', buffer, mimetype: 'audio/mpeg', quality: `${label} · yt-dlp`, fileName: `${safeTitle(media.title)}.mp3` };
  } finally { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {} }
}

async function ytdlpVideo(media, height, label, timeoutMs) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'darkbot-video-'));
  const outTpl = path.join(tmpDir, 'source.%(ext)s');
  try {
    const format = `bestvideo[height<=${height}]+bestaudio/best[height<=${height}]/best`;
    const ffLoc = getFfmpegBin();
    const ffArgs = ['--no-playlist', '--no-warnings', '--force-overwrites', '--no-part',
      '--retries', '1', '--socket-timeout', '20', '--max-filesize', height >= 1080 ? '140M' : '90M', '-f', format, '-o', outTpl];
    if (ffLoc && ffLoc !== 'ffmpeg') ffArgs.push('--ffmpeg-location', path.dirname(ffLoc));
    ffArgs.push(media.url);
    runYtDlp(ffArgs, timeoutMs, tmpDir);
    const input = findDownloadedFile(tmpDir);
    if (!input) throw new Error('yt-dlp não gerou arquivo');
    const out = path.join(tmpDir, 'video.mp4');
    execFileSync(getFfmpegBin(), ['-y', '-i', input, '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out], { stdio: 'ignore', timeout: 240000 });
    const buffer = fs.readFileSync(out);
    if (!buffer || buffer.length < 4096) throw new Error('vídeo vazio');
    return { title: media.title, duration: media.duration, author: media?.author || '', thumb: media.thumb, url: '', buffer, mimetype: 'video/mp4', quality: `${label} · yt-dlp`, fileName: `${safeTitle(media.title)}.mp4` };
  } finally { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {} }
}

// ==================== DOWNLOAD AUDIO ====================
async function downloadAudioFile(query, { bitrate = '128k', label = 'áudio', timeoutMs = 180000 } = {}) {
  try {
    const z = await systemZoneYtVideo(query);
    if (z?.url) {
      assertDurationAllowed(parseDurationToSeconds(z.duration), z.title || String(query));
      const videoBuffer = await fetchMediaBuffer(z.url, 90000);
      if (videoBuffer && videoBuffer.length > 4096) {
        const buffer = extractAudioFromVideoBuffer(videoBuffer, bitrate);
        return {
          title: z.title || String(query),
          duration: z.duration || '',
          author: '',
          thumb: z.thumbnail || '',
          url: '',
          buffer,
          mimetype: 'audio/mpeg',
          quality: `${label} · SystemKey`,
          fileName: `${safeTitle(z.title || String(query))}.mp3`,
        };
      }
    }
  } catch (e) { console.log('[DL-AUDIO] SystemZone falhou:', e.message); }
  throw new Error('❌ Não consegui entregar o áudio agora pela SystemKey. Tente outro termo/link ou verifique SYSTEMZONE_API_KEY.');
}

// ==================== DOWNLOAD VIDEO ====================
async function downloadVideoFile(query, { height = 720, label = '720p', timeoutMs = 260000 } = {}) {
  try {
    const z = await systemZoneYtVideo(query);
    if (z?.url) {
      assertDurationAllowed(parseDurationToSeconds(z.duration), z.title || String(query));
      const buffer = await fetchMediaBuffer(z.url, 120000);
      if (buffer && buffer.length > 4096) {
        return {
          title: z.title || String(query),
          duration: z.duration || '',
          author: '',
          thumb: z.thumbnail || '',
          url: '',
          buffer,
          mimetype: 'video/mp4',
          quality: z.quality || `${label} · SystemKey`,
          fileName: `${safeTitle(z.title || String(query))}.mp4`,
        };
      }
    }
  } catch (e) { console.log('[DL-VIDEO] SystemZone falhou:', e.message); }
  throw new Error('❌ Não consegui entregar o vídeo agora pela SystemKey. Tente outro termo/link ou verifique SYSTEMZONE_API_KEY.');
}

// ==================== COMANDOS YOUTUBE ====================
async function youtubeAudio(query) { return downloadAudioFile(query, { bitrate: '96k', label: 'baixo 96kbps' }); }
async function youtubeAudioSavefrom(query) { return downloadAudioFile(query, { bitrate: '160k', label: 'médio 160kbps' }); }
async function youtubeAudioAuto(query) { return downloadAudioFile(query, { bitrate: '320k', label: 'alta 320kbps' }); }
async function youtubeVideo(query) { return downloadVideoFile(query, { height: 720, label: '720p HD' }); }
async function youtubeVideoSavefrom(query) { return downloadVideoFile(query, { height: 1080, label: '1080p FHD', timeoutMs: 320000 }); }


async function ytdlpSocialVideo(url, label = 'social HD', timeoutMs = 220000) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'darkbot-social-'));
  const outTpl = path.join(tmpDir, 'source.%(ext)s');
  try {
    runYtDlp(['--no-warnings', '--force-overwrites', '--no-part', '--retries', '1', '--socket-timeout', '25', '--max-filesize', '120M', '-f', 'bestvideo+bestaudio/best', '-o', outTpl, url], timeoutMs, tmpDir);
    const input = findDownloadedFile(tmpDir);
    if (!input) throw new Error('yt-dlp não gerou arquivo social');
    const out = path.join(tmpDir, 'social.mp4');
    execFileSync(getFfmpegBin(), ['-y', '-i', input, '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out], { stdio: 'ignore', timeout: 220000 });
    const buffer = fs.readFileSync(out);
    if (!buffer || buffer.length < 4096) throw new Error('vídeo social vazio');
    return { title: label, url: '', buffer, mimetype: 'video/mp4', quality: label, fileName: `${safeTitle(label)}.mp4` };
  } finally { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {} }
}

// ==================== SOCIAL VIDEO ====================
async function tiktok(url) {
  if (!isUrl(url)) throw new Error('❌ Envie link do TikTok.');

  // 1. TikWM (melhor para TikTok)
  const tikwmResult = await tikwmDownload(url);
  if (tikwmResult) {
    try {
      const buffer = await fetchMediaBuffer(tikwmResult.noWatermark || tikwmResult.url, 60000);
      if (buffer && buffer.length > 4096) {
        return { title: tikwmResult.title, url: '', buffer, mimetype: 'video/mp4', quality: 'TikTok MP4', fileName: `${safeTitle(tikwmResult.title)}.mp4` };
      }
    } catch (e) {}
    return { title: tikwmResult.title, url: tikwmResult.noWatermark || tikwmResult.url };
  }
  throw new Error('❌ Não consegui baixar o TikTok.');
}

async function facebook(url) {
  if (!isUrl(url)) throw new Error('❌ Envie link do Facebook.');
  try { return await ytdlpSocialVideo(url, 'Facebook HD'); }
  catch (e) { console.log('[FB] yt-dlp falhou:', e.message); }
  throw new Error('❌ Não consegui baixar do Facebook. O link pode ser privado/restrito.');
}

async function twitter(url) {
  if (!isUrl(url)) throw new Error('❌ Envie link do X/Twitter.');
  const ztw = await systemZoneTwitter(url);
  if (ztw?.url) return { url: ztw.url, type: ztw.type, quality: ztw.quality };
  // Fallback yt-dlp (vídeos públicos do X)
  try { return await ytdlpSocialVideo(url, 'Twitter/X HD'); }
  catch (e) { console.log('[TW] yt-dlp falhou:', e.message); }
  throw new Error('❌ Não consegui baixar do X/Twitter.');
}

async function instagram(url) {
  if (!isUrl(url)) throw new Error('❌ Envie link do Instagram.');
  try { const r = await ytdlpSocialVideo(url, 'Instagram HD'); return { ...r, type: 'video' }; }
  catch (e) { console.log('[IG] yt-dlp falhou:', e.message); }
  throw new Error('❌ Não consegui baixar do Instagram. Link pode ser privado, stories/reels podem exigir login.');
}

// ==================== SPOTIFY / SOUNDCLOUD ====================
async function spotify(queryOrUrl) {
  if (!isUrl(queryOrUrl)) {
    const found = await systemZoneSpotifySearch(queryOrUrl, 8);
    if (found?.[0]?.url) queryOrUrl = found[0].url;
  }
  if (isUrl(queryOrUrl) && /spotify\.com/.test(queryOrUrl)) {
    const z = await systemZoneSpotifyDownload(queryOrUrl);
    if (z?.url) {
      const buffer = await fetchMediaBuffer(z.url, 90000);
      if (buffer && buffer.length > 2048) return { title: z.title, author: z.author, thumb: z.thumbnail, url: '', buffer, mimetype: 'audio/mpeg', quality: 'Spotify · SystemZone', fileName: `${safeTitle(z.title)}.mp3` };
      return { title: z.title, url: z.url, author: z.author };
    }
    const spotResult = await spotifydownDownload(queryOrUrl);
    if (spotResult && spotResult.url) {
      try {
        const buffer = await fetchMediaBuffer(spotResult.url, 60000);
        if (buffer && buffer.length > 2048) {
          return { title: spotResult.title, author: spotResult.author, thumb: spotResult.thumbnail, url: '', buffer, mimetype: 'audio/mpeg', quality: 'Spotify 160kbps', fileName: `${safeTitle(spotResult.title)}.mp3` };
        }
      } catch (e) {}
      return { title: spotResult.title, url: spotResult.url, author: spotResult.author };
    }
  }
  const query = isUrl(queryOrUrl) ? queryOrUrl : `${queryOrUrl} audio`;
  try { return await downloadAudioFile(query, { bitrate: '160k', label: 'Spotify fallback' }); }
  catch { return downloadAudioFile(String(queryOrUrl).replace(/https?:\/\/\S+/g, '').trim() || 'spotify', { bitrate: '160k', label: 'Spotify fallback' }); }
}

async function soundcloud(queryOrUrl) {
  if (!isUrl(queryOrUrl)) {
    const found = await systemZoneSoundCloudSearch(queryOrUrl);
    const first = found?.[0];
    if (first?.sc_url || first?.url) queryOrUrl = first.sc_url || first.url;
  }
  if (isUrl(queryOrUrl)) {
    const z = await systemZoneSoundCloudDownload(queryOrUrl);
    if (z?.url) {
      const buffer = await fetchMediaBuffer(z.url, 90000);
      if (buffer && buffer.length > 2048) return { title: z.title, author: z.author, url: '', buffer, mimetype: 'audio/mpeg', quality: 'SoundCloud · SystemZone', fileName: `${safeTitle(z.title)}.mp3` };
      return { title: z.title, url: z.url, author: z.author };
    }
  }
  try {
    if (isUrl(queryOrUrl)) return await downloadAudioFile(queryOrUrl, { bitrate: '160k', label: 'SoundCloud' });
    return await downloadAudioFile(`${queryOrUrl} song short`, { bitrate: '160k', label: 'SoundCloud' });
  } catch { return downloadAudioFile(queryOrUrl, { bitrate: '160k', label: 'fallback' }); }
}

// ==================== PINTEREST ====================
async function pinterest(url) {
  if (!isUrl(url)) return (await pinterestSearch(url))[0];
  const pinResult = await siputzxPinterest(url);
  if (pinResult && pinResult.url) return pinResult;
  return { url };
}

async function pinterestSearch(query) {
  const sipResults = await siputzxPinterestSearch(query);
  if (sipResults && sipResults.length) return sipResults;
  try {
    const r = await mediaHandler.fetchJson('https://api.siputzx.my.id/api/s/pinterest?query=' + encodeURIComponent(query), 25000);
    const arr = r?.data || r?.result || r?.results;
    if (Array.isArray(arr) && arr.length) {
      return arr.map(p => { const u = typeof p === 'string' ? p : (p.image_url || p.image || p.url || p.src); return u ? { url: u } : null; }).filter(Boolean).slice(0, 10);
    }
  } catch (e) {}
  throw new Error('❌ Pinterest sem resultados.');
}

// ==================== MEDIAFIRE / APK ====================
async function mediafire(url) {
  if (!/mediafire\.com/i.test(url)) throw new Error('❌ Envie um link do MediaFire.');
  try {
    const html = execSync(`curl -sL "${url}" -H "User-Agent: Mozilla/5.0"`, { timeout: 15000 }).toString();
    const match = html.match(/href="(https:\/\/download\d+\.mediafire\.com\/[^"]+)"/);
    if (match) {
      const fileName = decodeURIComponent(match[1].split('/').pop() || 'mediafire_file');
      const fileSize = html.match(/class="details"[^>]*>\s*\(([^)]+)\)/)?.[1] || '';
      return { url: match[1], title: fileName, size: fileSize };
    }
    throw new Error('Link não encontrado.');
  } catch (e) { throw new Error('❌ Não consegui acessar o MediaFire.\n' + e.message); }
}

async function liteapks(query) {
  const results = [];
  try {
    const html = execSync(`curl -sL "https://liteapks.com/?s=${encodeURIComponent(query)}" -H "User-Agent: Mozilla/5.0" --max-time 10`, { timeout: 15000 }).toString();
    const regex = /href="(https:\/\/liteapks\.com\/[a-z0-9]+-?[a-z0-9-]*\.html)"/g;
    let m;
    while ((m = regex.exec(html)) !== null && results.length < 4) {
      const url = m[1];
      if (!url.includes('page/') && !results.find(r => r.url === url)) {
        results.push({ name: url.split('/').pop().replace('.html', '').replace(/-/g, ' '), url, source: 'LiteAPKs' });
      }
    }
  } catch {}
  if (!results.length) throw new Error(`❌ Não encontrei "${query}".`);
  return results;
}

async function apkDownload(query) {
  const results = await liteapks(query);
  const first = results[0];
  return { isPage: true, title: first.name, url: first.url, source: first.source };
}

// Compatibilidade
async function play160(q) { return youtubeAudio(q); }
async function playMedium(q) { return youtubeAudioSavefrom(q); }
async function play320(q) { return youtubeAudioAuto(q); }
async function videoHD(q) { return youtubeVideo(q); }
async function videoFHD(q) { return youtubeVideoSavefrom(q); }
async function youtubeYtdlp(q, type = 'audio', quality = '720') {
  return type === 'audio' ? downloadAudioFile(q, { bitrate: '160k', label: 'audio' }) : downloadVideoFile(q, { height: Number(quality) || 720, label: `${quality}p` });
}

module.exports = {
  youtubeAudio, youtubeAudioSavefrom, youtubeAudioAuto,
  youtubeVideo, youtubeVideoSavefrom, youtubeSearch,
  play160, playMedium, play320, videoHD, videoFHD, youtubeYtdlp,
  ytdlpSocialVideo,
  tiktok, instagram, facebook, twitter,
  spotify, soundcloud, pinterest, pinterestSearch,
  mediafire, liteapks, apkDownload,
};
