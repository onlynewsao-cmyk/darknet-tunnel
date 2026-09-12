/**
 * Utilitários compartilhados entre parsers — v2.0
 */
const crypto = require('crypto');

function utilExtractStrings(buffer, minLen = 6) {
  const result = [];
  let cur = '';
  for (const b of buffer) {
    if (b >= 32 && b <= 126) cur += String.fromCharCode(b);
    else { if (cur.length >= minLen) result.push(cur); cur = ''; }
  }
  if (cur.length >= minLen) result.push(cur);
  return result.slice(0, 300);
}

/**
 * Busca recursiva profunda em objetos JSON (até 5 níveis)
 */
function findInJson(data, maxDepth = 5) {
  return (...keys) => {
    if (!data || typeof data !== 'object') return '';
    return deepFind(data, keys, 0, maxDepth);
  };
}

function deepFind(obj, keys, depth, maxDepth) {
  if (!obj || typeof obj !== 'object' || depth > maxDepth) return '';
  for (const k of keys) {
    // Direto
    if (obj[k] !== undefined && obj[k] !== null && obj[k] !== '') return obj[k];
    // Case insensitive
    const lk = Object.keys(obj).find(x => x.toLowerCase() === k.toLowerCase());
    if (lk && obj[lk] !== '' && obj[lk] !== null && obj[lk] !== undefined) return obj[lk];
    // Snake_case <-> camelCase
    const snake = k.replace(/([A-Z])/g, '_$1').toLowerCase();
    const camel = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    for (const alt of [snake, camel]) {
      if (obj[alt] !== undefined && obj[alt] !== null && obj[alt] !== '') return obj[alt];
    }
  }
  // Busca recursiva em sub-objetos
  for (const objKey of Object.keys(obj)) {
    if (obj[objKey] && typeof obj[objKey] === 'object' && !Array.isArray(obj[objKey])) {
      const r = deepFind(obj[objKey], keys, depth + 1, maxDepth);
      if (r !== '') return r;
    }
  }
  return '';
}

function tryXor(buffer, key) {
  try {
    const out = Buffer.alloc(buffer.length);
    for (let i = 0; i < buffer.length; i++) out[i] = buffer[i] ^ key[i % key.length];
    return out.toString('utf-8');
  } catch (e) { return null; }
}

function tryXorBuf(buffer, key) {
  const out = Buffer.alloc(buffer.length);
  for (let i = 0; i < buffer.length; i++) out[i] = buffer[i] ^ key[i % key.length];
  return out;
}

function tryAesCbc(data, password, ivInput) {
  try {
    const key = typeof password === 'string'
      ? crypto.createHash('sha256').update(password).digest()
      : password;
    const iv = ivInput || Buffer.alloc(16, 0);
    const d = crypto.createDecipheriv('aes-256-cbc', key, iv);
    d.setAutoPadding(true);
    return Buffer.concat([d.update(data), d.final()]);
  } catch (e) { return null; }
}

function tryAes128Cbc(data, password, ivInput) {
  try {
    const key = typeof password === 'string'
      ? crypto.createHash('md5').update(password).digest()
      : password.slice(0, 16);
    const iv = ivInput || Buffer.alloc(16, 0);
    const d = crypto.createDecipheriv('aes-128-cbc', key, iv);
    d.setAutoPadding(true);
    return Buffer.concat([d.update(data), d.final()]);
  } catch (e) { return null; }
}

/** Ratio de chars imprimíveis (0-1) */
function printableRatio(buffer) {
  if (!buffer || buffer.length === 0) return 0;
  let p = 0;
  for (const b of buffer) if (b >= 32 && b <= 126) p++;
  return p / buffer.length;
}

/** Extrai JSON de uma string suja */
function extractJson(str) {
  const start = str.indexOf('{');
  const end = str.lastIndexOf('}');
  if (start >= 0 && end > start) {
    const candidate = str.slice(start, end + 1);
    try { JSON.parse(candidate); return candidate; } catch (e) {}
  }
  // Tenta arrays
  const a1 = str.indexOf('[');
  const a2 = str.lastIndexOf(']');
  if (a1 >= 0 && a2 > a1) {
    const candidate = str.slice(a1, a2 + 1);
    try { JSON.parse(candidate); return candidate; } catch (e) {}
  }
  return null;
}

/** Extrai campos de conexão de texto livre usando regex */
function extractFieldsFromText(text) {
  const fields = {};
  const patterns = {
    host: /(?:^|[\s,{;])(?:host|server|server[_\s]?host|remote[_\s]?host|address|addr|ip)\s*[:=]\s*([a-zA-Z0-9._-]+(?:\.[a-zA-Z]{2,})?|(?:\d{1,3}\.){3}\d{1,3})/i,
    port: /(?:^|[\s,{;])(?:port|server[_\s]?port|remote[_\s]?port)\s*[:=]\s*(\d{1,5})/i,
    sshHost: /(?:ssh[_\s]?(?:host|server)|sshHost|ssh_server)\s*[:=]\s*([a-zA-Z0-9._-]+)/i,
    sshPort: /(?:ssh[_\s]?(?:port|serverPort)|sshPort|ssh_port)\s*[:=]\s*(\d{1,5})/i,
    sshUser: /(?:ssh[_\s]?user(?:name)?|sshUsername|ssh_user|user(?:name)?|login)\s*[:=]\s*([^\s,;}\]"']+)/i,
    sshPass: /(?:ssh[_\s]?pass(?:word)?|sshPassword|ssh_pass|pass(?:word)?|pwd)\s*[:=]\s*([^\s,;}\]"']+)/i,
    sni: /(?:sni|bug[_\s]?host|serverName|sni[_\s]?host|ssl[_\s]?sni|tls[_\s]?sni)\s*[:=]\s*([a-zA-Z0-9._-]+)/i,
    bugHost: /(?:bug[_\s]?host|bughost|sni|host_header)\s*[:=]\s*([a-zA-Z0-9._-]+)/i,
    payload: /(?:payload|custom[_\s]?payload|request[_\s]?payload|rawPayload)\s*[:=]\s*([\s\S]{1,5000})/i,
    dns: /(?:dns|dns[_\s]?server|dns1)\s*[:=]\s*([0-9a-zA-Z:., _-]+)/i,
    proxyHost: /(?:proxy[_\s]?(?:host|ip|server)|realProxyHost|httpProxy)\s*[:=]\s*([a-zA-Z0-9._-]+)/i,
    proxyPort: /(?:proxy[_\s]?port|realProxyPort|httpProxyPort)\s*[:=]\s*(\d{1,5})/i,
    uuid: /(?:uuid|id|alterId)\s*[:=]\s*([a-f0-9-]{8,})/i,
    path: /(?:path|ws[_\s]?path|websocket[_\s]?path)\s*[:=]\s*([^\s,;}\]"']+)/i,
  };
  for (const [key, re] of Object.entries(patterns)) {
    const m = text.match(re);
    if (m) fields[key] = m[1].trim();
  }
  // Também busca IPs e domínios soltos
  const hosts = text.match(/[a-zA-Z0-9][-a-zA-Z0-9]*\.[a-z]{2,}(?:\.[a-z]{2,})?/g) || [];
  if (!fields.host && hosts.length) fields.possibleHosts = [...new Set(hosts)];

  const ips = text.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g) || [];
  if (ips.length) fields.possibleIPs = [...new Set(ips)];

  if (!fields.bugHost && fields.payload) {
    const m = String(fields.payload).match(/(?:^|\r?\n)Host:\s*([^\r\n]+)/i) || String(fields.payload).match(/CONNECT\s+([^\s:]+)(?::\d+)?\s+HTTP/i);
    if (m) fields.bugHost = m[1].trim();
  }

  return fields;
}

/** Flatten de JSON profundo para objeto plano */
function flattenJson(obj, prefix = '', result = {}) {
  if (!obj || typeof obj !== 'object') return result;
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      flattenJson(v, key, result);
    } else {
      result[key] = v;
    }
  }
  return result;
}

function shannonEntropy(buffer) {
  if (!buffer?.length) return 0;
  const freq = new Array(256).fill(0);
  for (const b of buffer) freq[b]++;
  let entropy = 0;
  for (const count of freq) {
    if (!count) continue;
    const p = count / buffer.length;
    entropy -= p * Math.log2(p);
  }
  return Number(entropy.toFixed(4));
}

function extractUrlsFromText(text) {
  if (!text) return [];
  return [...new Set((String(text).match(/https?:\/\/[^\s"'<>`]+/g) || []).map(s => s.trim()))].slice(0, 50);
}

module.exports = {
  utilExtractStrings, findInJson, tryXor, tryXorBuf,
  tryAesCbc, tryAes128Cbc, printableRatio,
  extractJson, extractFieldsFromText, flattenJson,
  shannonEntropy, extractUrlsFromText,
};
