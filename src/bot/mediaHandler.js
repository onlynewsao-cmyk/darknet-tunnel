const { downloadMediaMessage } = require('@systemzero/baileys');
const https = require('https');
const http = require('http');

async function downloadFromMessage(msg) {
  return downloadMediaMessage(msg, 'buffer', {});
}

const DEFAULT_UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36';

// v7.27: `opts` opcional — { headers, timeout }. Algumas APIs de GIF
// (nekos.best) rejeitam User-Agent de browser e exigem um UA de bot.
function fetchBuffer(url, redirects = 5, opts = {}) {
  if (redirects && typeof redirects === 'object') { opts = redirects; redirects = 5; }
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

module.exports = { downloadFromMessage, fetchBuffer, fetchJson, fetchJsonPost };
