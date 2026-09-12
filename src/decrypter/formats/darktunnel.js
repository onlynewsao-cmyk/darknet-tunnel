/**
 * DarkTunnel (.dark / .darkt)
 * Geralmente: Base64 + JSON, ou JSON puro
 */
const zlib = require('zlib');
const { utilExtractStrings, findInJson } = require('./_util');

async function parse(buffer, fileName) {
  let json = null;
  let body = buffer;

  // Strip headers
  const head = buffer.slice(0, 4).toString();
  if (head === 'DARK' || head === 'DTNL') body = buffer.slice(4);

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
      else {
        const gz = zlib.gunzipSync(dec).toString('utf-8');
        if (gz.includes('{')) json = gz;
      }
    } catch (e) {}
  }

  // Gzip direto
  if (!json) { try { json = zlib.gunzipSync(body).toString('utf-8'); } catch (e) {} }

  if (!json) {
    return {
      configName: (fileName || "config").replace(/\.(dark|darkt)$/i, ''),
      configType: 'DarkTunnel',
      appName: 'DarkTunnel',
      note: '⚠️ Decryptação parcial',
      allFields: { extractedStrings: utilExtractStrings(body) },
    };
  }

  const data = JSON.parse(json.match(/\{[\s\S]*\}/)?.[0] || json);
  const find = findInJson(data);

  return {
    configName: find('name', 'configName') || (fileName || "config").replace(/\.(dark|darkt)$/i, ''),
    configType: 'DarkTunnel',
    appName: 'DarkTunnel',
    mode: find('mode', 'type', 'connectionType'),
    note: find('note', 'description'),

    host: find('host', 'server', 'proxyHost'),
    port: find('port', 'serverPort', 'proxyPort'),

    ssh: {
      host: find('sshHost', 'ssh_host'),
      port: find('sshPort', 'ssh_port'),
      user: find('sshUser', 'ssh_user', 'username'),
      pass: find('sshPass', 'ssh_pass', 'password'),
    },

    proxy: {
      host: find('proxyHost'),
      port: find('proxyPort'),
      type: find('proxyType') || 'HTTP',
      user: find('proxyUser'),
      pass: find('proxyPass'),
    },

    payload: find('payload', 'customPayload', 'requestPayload'),
    sni: find('sni', 'sniHost'),
    dns: [find('dns')].filter(Boolean),
    raw: data, allFields: data,
  };
}

module.exports = { parse };
