/**
 * NetMod Channeler / NetMod Syna (.nm / .nmess)
 */
const zlib = require('zlib');
const { utilExtractStrings, findInJson, tryXor } = require('./_util');

const XOR_KEYS = [
  Buffer.from('netmodsecret2022'),
  Buffer.from('NETMOD_KEY'),
];

async function parse(buffer, fileName) {
  let body = buffer;
  if (buffer.slice(0,3).toString() === 'NMM') body = buffer.slice(3);

  let json = null;
  try {
    const s = body.toString('utf-8');
    const idx = s.indexOf('{');
    if (idx >= 0) { const cand = s.slice(idx, s.lastIndexOf('}') + 1); JSON.parse(cand); json = cand; }
  } catch (e) {}

  if (!json) {
    try { json = Buffer.from(body.toString('utf-8').trim(), 'base64').toString('utf-8'); if (!json.includes('{')) json = null; } catch (e) {}
  }
  if (!json) for (const k of XOR_KEYS) { const r = tryXor(body, k); if (r?.includes('{')) { json = r; break; } }
  if (!json) { try { json = zlib.gunzipSync(body).toString('utf-8'); } catch (e) {} }

  if (!json) {
    return {
      configName: (fileName || "config").replace(/\.(nm|nmess)$/i, ''),
      configType: 'NetMod',
      appName: 'NetMod Channeler',
      note: '⚠️ Decryptação parcial',
      allFields: { extractedStrings: utilExtractStrings(body) },
    };
  }

  const data = JSON.parse(json.match(/\{[\s\S]*\}/)?.[0] || json);
  const find = findInJson(data);
  return {
    configName: find('name', 'configName') || (fileName || "config").replace(/\.(nm|nmess)$/i, ''),
    configType: 'NetMod', appName: 'NetMod Channeler',
    mode: find('mode', 'type'),
    host: find('host', 'proxyHost', 'remoteHost'),
    port: find('port', 'proxyPort'),
    ssh: { host: find('sshHost'), port: find('sshPort'), user: find('sshUser','username'), pass: find('sshPass','password') },
    proxy: { host: find('proxyHost'), port: find('proxyPort'), type: find('proxyType') || 'HTTP' },
    payload: find('payload', 'customPayload', 'requestPayload'),
    sni: find('sni'),
    dns: [find('dns')].filter(Boolean),
    raw: data, allFields: data,
  };
}

module.exports = { parse };
