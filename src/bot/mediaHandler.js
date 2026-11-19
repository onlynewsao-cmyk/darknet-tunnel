const { downloadMediaMessage } = require('baileys-v6');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

async function downloadFromMessage(msg) {
  return downloadMediaMessage(msg, 'buffer', {});
}

const DEFAULT_UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36';

// v7.27: `opts` opcional — { headers, timeout }. Algumas APIs de GIF
// (nekos.best) rejeitam User-Agent de browser e exigem um UA de bot.
function fetchBuffer(url, redirects = 5, opts = {}) {
  if (redirects && typeof redirects === 'object') { opts = redirects; redirects = 5; }
  // v7.60: pseudo-URL local: — mídia do !setmenu (assets/menu-media/...)
  if (typeof url === 'string' && url.startsWith('local:')) {
    const rel = url.slice(6).split('?')[0].replace(/^\/+/, '');
    if (!rel || rel.includes('..')) return Promise.reject(new Error('caminho local inválido'));
    try {
      return Promise.resolve(fs.readFileSync(path.join(__dirname, '..', '..', 'assets', rel)));
    } catch (e) { return Promise.reject(e); }
  }
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, {
      headers: { 'User-Agent': DEFAULT_UA, ...(opts.headers || {}) },
      timeout: opts.timeout || 60000,
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        if (redirects <= 0) return reject(new Error('Too many redirects'));
        const next = res.headers.location.startsWith('http') ? res.headers.location : new URL(res.headers.location, url).href;
        return fetchBuffer(next, redirects - 1, opts).then(resolve, reject);
      }
      if (res.statusCode >= 400) return reject(new Error('HTTP ' + res.statusCode));
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function fetchJson(url, opts = {}) {
  const buf = await fetchBuffer(url, 5, opts);
  try { return JSON.parse(buf.toString('utf-8')); }
  catch (e) { throw new Error('JSON inválido'); }
}

/**
 * Faz POST com body (string ou objeto) e headers customizados.
 * Retorna JSON parseado.
 */
function fetchJsonPost(url, body, headers = {}, timeoutMs = 25000) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const lib = parsedUrl.protocol === 'https:' ? https : http;

    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);

    const defaultHeaders = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(bodyStr),
      'User-Agent': 'DARK-BOT/1.0',
      'Accept': 'application/json',
    };

    const mergedHeaders = { ...defaultHeaders, ...headers };
    // Recalculate Content-Length if headers overrode body
    if (mergedHeaders['Content-Type'] === 'application/json' || !mergedHeaders['Content-Length']) {
      mergedHeaders['Content-Length'] = Buffer.byteLength(bodyStr);
    }

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: mergedHeaders,
    };

    const req = lib.request(options, (res) => {
      // Follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const next = res.headers.location.startsWith('http') ? res.headers.location : new URL(res.headers.location, url).href;
        return fetchJsonPost(next, body, headers, timeoutMs).then(resolve, reject);
      }
      if (res.statusCode >= 400) {
        let errBody = '';
        res.on('data', c => errBody += c);
        res.on('end', () => reject(new Error('HTTP ' + res.statusCode + ': ' + errBody.slice(0, 200))));
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try {
          const text = Buffer.concat(chunks).toString('utf-8');
          resolve(JSON.parse(text));
        } catch (e) {
          reject(new Error('JSON inválido na resposta POST'));
        }
      });
      res.on('error', reject);
    });

    req.on('error', reject);
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('timeout POST')); });
    req.write(bodyStr);
    req.end();
  });
}

module.exports = { downloadFromMessage, fetchBuffer, fetchJson, fetchJsonPost, isAudioBytes, cleanThumb };

// v7.56: bytes de áudio válidos? (MP3/MP4-M4A/OGG/WAV)
// Envia-se lixo (HTML de erro, truncado) e alguns clientes não renderizam
// a mensagem — fica "invisível" para uns e visível para o bot.
function isAudioBytes(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 1024) return false;
  if (buf[0] === 0xFF && (buf[1] & 0xE0) === 0xE0) return true; // MP3 frame sync
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) return true; // ID3
  if (buf.toString('ascii', 4, 8) === 'ftyp') return true; // MP4/M4A
  if (buf[0] === 0x4F && buf[1] === 0x67 && buf[2] === 0x67 && buf[3] === 0x53) return true; // OggS
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) return true; // RIFF/WAV
  return false;
}

// v7.56: thumbnails grandes/quebrados no cartão partem a renderização
// nalguns clientes — só anexa JPEG/PNG pequeno, senão áudio limpo.
function cleanThumb(buf, maxBytes = 98304) {
  if (!Buffer.isBuffer(buf) || !buf.length || buf.length > maxBytes) return null;
  const isJpeg = buf[0] === 0xFF && buf[1] === 0xD8;
  const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47;
  return (isJpeg || isPng) ? buf : null;
}
