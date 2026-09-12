/**
 * TLS Tunnel (.tls)
 */
const zlib = require('zlib');
const { utilExtractStrings, findInJson, tryXor } = require('./_util');

const XOR_KEYS = [
  Buffer.from('TLSTunnel2021'),
  Buffer.from('tls_tunnel_secret'),
];

async function parse(buffer, fileName) {
  let body = buffer;
  if (buffer.slice(0,3).toString() === 'TLS') body = buffer.slice(3);

  let json = null;
  try {
    const s = body.toString('utf-8');
    const idx = s.indexOf('{');
    if (idx >= 0) { const cand = s.slice(idx, s.lastIndexOf('}') + 1); JSON.parse(cand); json = cand; }
  } catch (e) {}

  if (!json) {
    try {
      const dec = Buffer.from(body.toString('utf-8').trim(), 'base64');
      const s = dec.toString('utf-8');
      if (s.includes('{')) json = s;
    } catch (e) {}
  }
  if (!json) for (const k of XOR_KEYS) { const r = tryXor(body, k); if (r?.includes('{')) { json = r; break; } }
  if (!json) { try { json = zlib.gunzipSync(body).toString('utf-8'); } catch (e) {} }

  if (!json) {
    return {
      configName: (fileName || "config").replace(/\.tls$/i, ''),
      configType: 'TLS Tunnel',
      appName: 'TLS Tunnel',
      note: '⚠️ Decryptação parcial',
      allFields: { extractedStrings: utilExtractStrings(body) },
    };
  }

  const data = JSON.parse(json.match(/\{[\s\S]*\}/)?.[0] || json);
  const find = findInJson(data);
  return {
    configName: find('name') || (fileName || "config").replace(/\.tls$/i, ''),
    configType: 'TLS Tunnel', appName: 'TLS Tunnel',
    mode: find('mode'),
    host: find('proxyHost', 'host'), port: find('proxyPort', 'port'),
    ssh: { host: find('sshHost'), port: find('sshPort'), user: find('sshUser','username'), pass: find('sshPass','password') },
    proxy: { host: find('proxyHost'), port: find('proxyPort'), type: 'HTTP' },
    payload: find('payload'),
    sni: find('sni'),
    dns: [find('dns')].filter(Boolean),
    raw: data, allFields: data,
  };
}

module.exports = { parse };
