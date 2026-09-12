/**
 * DARK ENGINE — Forensic Brute Module
 *
 * Objetivo: tentar abrir configs VPN legítimos usando brute-force forense offline
 * com chaves/senhas comuns, variações de AES e análise de evidências.
 * Não promete quebrar criptografia forte: se o arquivo estiver locked com chave
 * privada/senha desconhecida, retorna relatório de tentativas e evidências.
 */
const crypto = require('crypto');
const zlib = require('zlib');
const {
  extractJson,
  extractFieldsFromText,
  extractUrlsFromText,
  printableRatio,
  shannonEntropy,
} = require('./formats/_util');

const COMMON_PASSWORDS = [
  '1234', '12345', '123456', '123456789', '0000', '1111',
  'admin', 'password', 'pass', 'pwd', 'p4ssw0rd',
  'darkbot', 'dark', 'darknet', 'DarkNet', 'DarkNet@2026',
  'free', 'vpn', 'ssh', 'injector', 'httpinjector', 'HTTPInjector',
  'ehi', 'hat', 'npv', 'tls', 'tunnel', 'config', 'locked',
  'angola', 'unitel', 'movicel', 'africell', 'internet',
  '2022', '2023', '2024', '2025', '2026', '666', '6969',
];

const COMMON_KEYS = [
  // public/community known or historical labels, not private secrets
  'NDk2MTQ4NDg3NjQ5NjY0OTYzNjY2NDQ5NDg=',
  '6f188e62d3669f60b923d8624628a87e',
  '8742c83a5d8af7e25b96e1a93b73c3a0',
  'b7e151628aed2a6abf7158809cf4f3c7',
  'HTTPInjectorConfig', 'httpinjector2023secretkey123456',
  'evozi', 'Evozi', 'HTTP Injector', 'HttpInjector',
  ...COMMON_PASSWORDS,
];

function uniq(arr) { return [...new Set(arr.filter(Boolean))]; }

function safePreview(text, max = 600) {
  return String(text || '')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '.')
    .slice(0, max);
}

function asBufferKey(secret) {
  const out = [];
  const s = String(secret || '');
  const raw = Buffer.from(s, 'utf8');
  out.push({ label: 'utf8', material: raw });

  if (/^[0-9a-f]{16,128}$/i.test(s) && s.length % 2 === 0) {
    try { out.push({ label: 'hex', material: Buffer.from(s, 'hex') }); } catch {}
  }
  if (/^[A-Za-z0-9+/=]{16,}$/.test(s)) {
    try {
      const b = Buffer.from(s, 'base64');
      if (b.length >= 8) out.push({ label: 'base64', material: b });
    } catch {}
  }
  out.push({ label: 'md5', material: crypto.createHash('md5').update(s).digest() });
  out.push({ label: 'sha1', material: crypto.createHash('sha1').update(s).digest() });
  out.push({ label: 'sha256', material: crypto.createHash('sha256').update(s).digest() });

  // remove duplicates by hex
  const seen = new Set();
  return out.filter(x => {
    const h = x.material.toString('hex');
    if (seen.has(h)) return false;
    seen.add(h);
    return true;
  });
}

function fitKey(material, len) {
  if (material.length === len) return material;
  if (material.length > len) return material.subarray(0, len);
  return crypto.createHash(len === 16 ? 'md5' : 'sha256').update(material).digest().subarray(0, len);
}

function ivCandidates(buffer, keyMaterial) {
  const ivs = [
    { label: 'zero', iv: Buffer.alloc(16, 0), data: buffer },
    { label: 'md5key', iv: crypto.createHash('md5').update(keyMaterial).digest(), data: buffer },
  ];
  if (buffer.length > 32) {
    ivs.push({ label: 'first16', iv: buffer.subarray(0, 16), data: buffer.subarray(16) });
    ivs.push({ label: 'last16', iv: buffer.subarray(buffer.length - 16), data: buffer.subarray(0, buffer.length - 16) });
  }
  return ivs;
}

function tryDecipher(algorithm, key, iv, data, autoPadding = true) {
  try {
    const decipher = crypto.createDecipheriv(algorithm, key, algorithm.includes('ecb') ? null : iv);
    if (algorithm.includes('cbc') || algorithm.includes('ecb')) decipher.setAutoPadding(autoPadding);
    return Buffer.concat([decipher.update(data), decipher.final()]);
  } catch { return null; }
}

function decodeVariants(buffer) {
  const variants = [{ label: 'raw', buffer }];
  for (const [label, fn] of [
    ['gunzip', zlib.gunzipSync],
    ['inflate', zlib.inflateSync],
    ['inflateRaw', zlib.inflateRawSync],
    ['brotli', zlib.brotliDecompressSync],
  ]) {
    try {
      const out = fn(buffer);
      if (out && out.length) variants.push({ label, buffer: out });
    } catch {}
  }

  // if raw is base64-ish text, decode and try zip again
  try {
    const txt = buffer.toString('utf8').trim();
    if (/^[A-Za-z0-9+/=\r\n]{80,}$/.test(txt)) {
      const b64 = Buffer.from(txt.replace(/\s+/g, ''), 'base64');
      if (b64.length > 16) {
        variants.push({ label: 'base64', buffer: b64 });
        for (const [label, fn] of [['base64+gunzip', zlib.gunzipSync], ['base64+inflate', zlib.inflateSync], ['base64+inflateRaw', zlib.inflateRawSync]]) {
          try {
            const out = fn(b64);
            if (out && out.length) variants.push({ label, buffer: out });
          } catch {}
        }
      }
    }
  } catch {}
  return variants;
}

function scoreText(text) {
  const fields = extractFieldsFromText(text);
  const urls = extractUrlsFromText(text);
  const json = extractJson(text);
  let score = 0;

  if (json) score += 120;
  if (urls.length) score += Math.min(30, urls.length * 5);

  const checks = [
    ['host', 18], ['port', 10], ['sshHost', 18], ['sshUser', 20], ['sshPass', 20],
    ['proxyHost', 18], ['proxyPort', 10], ['sni', 16], ['bugHost', 16],
    ['payload', 30], ['dns', 8], ['uuid', 18], ['path', 10],
  ];
  for (const [k, v] of checks) if (fields[k]) score += v;

  if (/\b(CONNECT|GET|POST|PUT|PATCH)\b[\s\S]{0,120}HTTP\/1\./i.test(text)) score += 35;
  if (/Host:\s*[^\r\n]+/i.test(text)) score += 18;
  if (/Upgrade:\s*websocket/i.test(text)) score += 15;
  if (/vmess:\/\/|vless:\/\/|trojan:\/\/|ss:\/\//i.test(text)) score += 45;
  if (/\[Interface\][\s\S]+PrivateKey/i.test(text)) score += 60;
  if (/client[\s\S]+remote\s+\S+\s+\d+/i.test(text)) score += 60;

  const pr = printableRatio(Buffer.from(text));
  if (pr > 0.85) score += 10;
  else if (pr < 0.45) score -= 15;

  return { score, fields, urls, json };
}

function makeCandidate(method, outputBuffer, meta = {}) {
  const variants = decodeVariants(outputBuffer);
  const candidates = [];
  for (const variant of variants) {
    const text = variant.buffer.toString('utf8');
    const scored = scoreText(text);
    if (scored.score >= 25) {
      candidates.push({
        method: `${method}${variant.label !== 'raw' ? '+' + variant.label : ''}`,
        score: scored.score,
        fields: scored.fields,
        urls: scored.urls,
        json: scored.json || null,
        preview: safePreview(scored.json || text),
        outputBytes: variant.buffer.length,
        ...meta,
      });
    }
  }
  return candidates;
}

function xorSingleByteCandidates(buffer) {
  const out = [];
  for (let key = 1; key < 256; key++) {
    const b = Buffer.allocUnsafe(buffer.length);
    for (let i = 0; i < buffer.length; i++) b[i] = buffer[i] ^ key;
    const c = makeCandidate(`xor-0x${key.toString(16).padStart(2, '0')}`, b, { keyLabel: `0x${key.toString(16)}` });
    out.push(...c);
  }
  return out;
}

function forensicBruteBuffer(buffer, opts = {}) {
  const started = Date.now();
  const data = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || '');
  const keys = uniq([...(opts.keys || []), ...COMMON_KEYS]);
  const candidates = [];
  let attempts = 0;

  // direct/plain variants first
  candidates.push(...makeCandidate('plain', data));
  attempts++;

  // AES attempts
  for (const secret of keys) {
    for (const km of asBufferKey(secret)) {
      const key16 = fitKey(km.material, 16);
      const key24 = fitKey(km.material, 24);
      const key32 = fitKey(km.material, 32);
      const ivs = ivCandidates(data, km.material);

      const modePlans = [
        ['aes-128-cbc', key16], ['aes-192-cbc', key24], ['aes-256-cbc', key32],
        ['aes-128-ctr', key16], ['aes-192-ctr', key24], ['aes-256-ctr', key32],
        ['aes-128-ecb', key16], ['aes-192-ecb', key24], ['aes-256-ecb', key32],
      ];

      for (const [alg, key] of modePlans) {
        const sourceIvs = alg.includes('ecb') ? [{ label: 'none', iv: null, data }] : ivs;
        for (const ivInfo of sourceIvs) {
          for (const autoPadding of [true, false]) {
            if (!(alg.includes('cbc') || alg.includes('ecb')) && autoPadding === false) continue;
            attempts++;
            const out = tryDecipher(alg, key, ivInfo.iv, ivInfo.data, autoPadding);
            if (!out) continue;
            candidates.push(...makeCandidate(`${alg}/key:${km.label}/iv:${ivInfo.label}/pad:${autoPadding}`, out, {
              keyLabel: String(secret).slice(0, 32),
            }));
          }
        }
      }
    }
  }

  // XOR single byte only for small/medium buffers; useful for weak obfuscation
  if (data.length <= 256 * 1024) {
    attempts += 255;
    candidates.push(...xorSingleByteCandidates(data));
  }

  // Sort and de-duplicate by preview/json/method
  candidates.sort((a, b) => b.score - a.score);
  const unique = [];
  const seen = new Set();
  for (const c of candidates) {
    const id = `${c.score}:${c.json || c.preview}`.slice(0, 500);
    if (seen.has(id)) continue;
    seen.add(id);
    unique.push(c);
    if (unique.length >= (opts.keep || 8)) break;
  }

  const best = unique[0] || null;
  return {
    found: !!(best && best.score >= (opts.minScore || 55)),
    attempts,
    elapsedMs: Date.now() - started,
    inputBytes: data.length,
    entropy: shannonEntropy(data),
    best,
    topCandidates: unique.map(c => ({
      method: c.method,
      score: c.score,
      keyLabel: c.keyLabel,
      fields: c.fields,
      urls: c.urls,
      outputBytes: c.outputBytes,
      preview: c.preview,
      hasJson: !!c.json,
    })),
  };
}

// Compat antiga
function tryDecryptWithPasswords(encryptedData, decryptFn) {
  for (const pwd of COMMON_PASSWORDS) {
    try {
      const result = decryptFn(encryptedData, pwd);
      if (result) return { result, password: pwd };
    } catch {}
  }
  return null;
}

module.exports = {
  tryDecryptWithPasswords,
  forensicBruteBuffer,
  COMMON_PASSWORDS,
  COMMON_KEYS,
};
