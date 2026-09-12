/**
 * AnyTunnel (.any)
 * Geralmente JSON em base64 ou XOR leve
 */
const zlib = require('zlib');
const { utilExtractStrings, findInJson, tryXor } = require('./_util');

const XOR_KEYS = [
  Buffer.from('anytunnel2022'),
  Buffer.from('AnyTunnel@SecretKey'),
  Buffer.from([0x41, 0x4E, 0x59, 0x54]),
];

async function parse(buffer, fileName) {
  let body = buffer;
  if (buffer.slice(0,3).toString() === 'ANY') body = buffer.slice(3);

  let json = null;

  // JSON direto
  try {
    const s = body.toString('utf-8');
    const idx = s.indexOf('{');
    if (idx >= 0) {
      const cand = s.slice(idx, s.lastIndexOf('}') + 1);
      JSON.parse(cand);
      json = cand;
    }
  } catch (e) {}

  // Base64
  if (!json) {
    try {
      const dec = Buffer.from(body.toString('utf-8').trim(), 'base64');
      const s = dec.toString('utf-8');
      if (s.includes('{')) json = s;
    } catch (e) {}
  }

  // XOR
  if (!json) {
    for (const k of XOR_KEYS) {
      const r = tryXor(body, k);
      if (r && r.includes('{')) { json = r; break; }
    }
  }

  // Gzip
  if (!json) { try { json = zlib.gunzipSync(body).toString('utf-8'); } catch (e) {} }

  if (!json) {
    return {
      configName: (fileName || "config").replace(/\.any$/i, ''),
      configType: 'AnyTunnel',
      appName: 'AnyTunnel Lite',
      note: '⚠️ Decryptação parcial',
      allFields: { extractedStrings: utilExtractStrings(body) },
    };
  }

  const data = JSON.parse(json.match(/\{[\s\S]*\}/)?.[0] || json);
  const find = findInJson(data);

  return {
    configName: find('name', 'configName') || (fileName || "config").replace(/\.any$/i, ''),
    configType: 'AnyTunnel',
    appName: 'AnyTunnel Lite',
    mode: find('mode', 'type'),
    note: find('note'),

    host: find('host', 'proxyHost', 'server'),
    port: find('port', 'proxyPort', 'serverPort'),

    ssh: {
      host: find('sshHost', 'ssh_host'),
      port: find('sshPort', 'ssh_port'),
      user: find('sshUser', 'username'),
      pass: find('sshPass', 'password'),
    },

    proxy: {
      host: find('proxyHost'),
      port: find('proxyPort'),
      type: find('proxyType') || 'HTTP',
    },

    payload: find('payload', 'customPayload'),
    sni: find('sni'),
    dns: [find('dns')].filter(Boolean),
    raw: data, allFields: data,
  };
}

module.exports = { parse };
