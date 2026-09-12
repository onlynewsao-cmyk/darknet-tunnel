/**
 * HA Tunnel Plus (.hat) — v2.0
 * Múltiplas variações de criptografia + melhor extração de dados
 */
const crypto = require('crypto');
const zlib = require('zlib');
const { utilExtractStrings, tryXorBuf, tryAesCbc, tryAes128Cbc, extractJson, extractFieldsFromText, printableRatio } = require('./_util');

const XOR_KEYS = [
  Buffer.from('hatunelplus2020'),
  Buffer.from('HATunnel@2021'),
  Buffer.from('ha_tunnel_plus_secret_key'),
  Buffer.from('HATunnelPlus'),
  Buffer.from('hatunnel2022'),
  Buffer.from('hatplus2023'),
  Buffer.from('hattunnel'),
  Buffer.from([0x48, 0x41, 0x54, 0x55, 0x4E, 0x4E, 0x45, 0x4C, 0x50, 0x4C, 0x55, 0x53]),
  Buffer.from([0x48, 0x41, 0x54]),
];

const AES_KEYS = [
  'HATunnelPlusSecretKey2021',
  'hatunnel_secret_2022',
  'HATunnel@Plus#2023',
  'ha_tunnel_key_2024',
];

async function parse(buffer, fileName) {
  let body = buffer;
  // Remove magic bytes — ordem importa: mais longo primeiro
  const heads = ['HATP', 'HAT', 'HA\x00'];
  for (const h of heads) {
    if (body.slice(0, h.length).toString() === h) { body = body.slice(h.length); break; }
  }

  let json = null;

  // 1) JSON direto
  json = extractJson(body.toString('utf-8'));

  // 2) Gzip
  if (!json) {
    try { json = extractJson(zlib.gunzipSync(body).toString('utf-8')); } catch (e) {}
  }

  // 3) XOR variations
  if (!json) {
    for (const k of XOR_KEYS) {
      const dec = tryXorBuf(body, k);
      // JSON direto
      const j = extractJson(dec.toString('utf-8'));
      if (j) { json = j; break; }
      // Gzip após XOR
      try {
        const gz = zlib.gunzipSync(dec).toString('utf-8');
        const j2 = extractJson(gz);
        if (j2) { json = j2; break; }
      } catch (e) {}
    }
  }

  // 4) Base64 → JSON ou Gzip → JSON  (múltiplas tentativas)
  if (!json) {
    const b64str = body.toString('utf-8').trim();
    try {
      const dec = Buffer.from(b64str, 'base64');
      // JSON directo depois de b64
      json = extractJson(dec.toString('utf-8'));
      if (!json) {
        // Gzip depois de b64
        try { json = extractJson(zlib.gunzipSync(dec).toString('utf-8')); } catch (e) {}
      }
      if (!json) {
        // Double b64
        try { json = extractJson(Buffer.from(dec.toString('utf-8').trim(), 'base64').toString('utf-8')); } catch (e) {}
      }
    } catch (e) {}
    // Tenta também o body raw como gzip directo
    if (!json) {
      try { json = extractJson(zlib.gunzipSync(body).toString('utf-8')); } catch (e) {}
    }
  }

  // 5) AES
  if (!json) {
    const b64 = body.toString('utf-8').trim();
    let data;
    try { data = Buffer.from(b64, 'base64'); } catch (e) { data = body; }
    for (const k of AES_KEYS) {
      const dec = tryAesCbc(data, k);
      if (dec) { const j = extractJson(dec.toString('utf-8')); if (j) { json = j; break; } }
      const dec2 = tryAes128Cbc(data, k);
      if (dec2) { const j = extractJson(dec2.toString('utf-8')); if (j) { json = j; break; } }
    }
  }

  // 6) XOR em base64 decoded
  if (!json) {
    try {
      const dec = Buffer.from(body.toString('utf-8').trim(), 'base64');
      for (const k of XOR_KEYS) {
        const xd = tryXorBuf(dec, k);
        if (printableRatio(xd) > 0.7) {
          const j = extractJson(xd.toString('utf-8'));
          if (j) { json = j; break; }
        }
      }
    } catch (e) {}
  }

  if (!json) {
    const strings = utilExtractStrings(body, 4);
    const textFields = extractFieldsFromText(strings.join('\n'));
    return {
      configName: (fileName || "config").replace(/\.hat$/i, ''),
      configType: 'HA Tunnel Plus',
      appName: 'HA Tunnel Plus',
      note: '⚠️ Decryptação parcial — versão pode usar criptografia nova',
      host: textFields.host || textFields.possibleHosts?.[0] || '',
      port: textFields.port || '',
      sni: textFields.sni || '',
      ssh: (textFields.sshUser || textFields.sshHost) ? {
        host: textFields.sshHost || '', port: textFields.sshPort || '22',
        user: textFields.sshUser || '', pass: textFields.sshPass || '',
      } : null,
      allFields: { extractedStrings: strings, detectedFields: textFields },
    };
  }

  let data;
  try { data = JSON.parse(json); }
  catch (e) {
    return { configName: (fileName || "config").replace(/\.hat$/i, ''), configType: 'HA Tunnel Plus', note: 'JSON malformado', raw: json };
  }

  return parseHatJson(data, fileName);
}

function parseHatJson(data, fileName) {
  const find = (...keys) => {
    for (const k of keys) {
      if (data[k] !== undefined && data[k] !== null && data[k] !== '') return data[k];
      const lk = Object.keys(data).find(x => x.toLowerCase() === k.toLowerCase());
      if (lk && data[lk] !== undefined && data[lk] !== null && data[lk] !== '') return data[lk];
      // Sub-objetos
      for (const v of Object.values(data)) {
        if (v && typeof v === 'object' && !Array.isArray(v)) {
          if (v[k] !== undefined && v[k] !== null && v[k] !== '') return v[k];
        }
      }
    }
    return '';
  };

  // Decode payload se base64
  let payload = find('customPayload', 'payload', 'rawPayload', 'requestPayload', 'custom_payload');
  if (payload && /^[A-Za-z0-9+/=]{20,}$/.test(String(payload))) {
    try {
      const dec = Buffer.from(String(payload), 'base64').toString('utf-8');
      if (dec.includes('HTTP') || dec.includes('Host') || dec.includes('CONNECT')) payload = dec;
    } catch (e) {}
  }

  return {
    configName: find('configName', 'name', 'config_name', 'profileName') || (fileName || "config").replace(/\.hat$/i, ''),
    configType: 'HA Tunnel Plus',
    appName: 'HA Tunnel Plus',
    appVersion: find('appVersion', 'version', 'app_version'),
    mode: find('connectionMode', 'mode', 'connectionType', 'connection_mode', 'conn_mode'),
    note: find('note', 'configNote', 'description', 'config_note'),

    host: find('proxyHost', 'host', 'sshHost', 'server', 'sshServer', 'proxy_host', 'ssh_server'),
    port: find('proxyPort', 'port', 'sshPort', 'server_port', 'sshServerPort', 'proxy_port'),

    ssh: {
      host: find('sshHost', 'ssh_host', 'sshServer', 'server', 'ssh_server'),
      port: find('sshPort', 'ssh_port', 'sshServerPort', 'server_port'),
      user: find('sshUsername', 'username', 'sshUser', 'ssh_user', 'ssh_username', 'user'),
      pass: find('sshPassword', 'password', 'sshPass', 'ssh_pass', 'ssh_password', 'pass'),
    },

    proxy: {
      host: find('proxyHost', 'proxy_host', 'realProxyHost'),
      port: find('proxyPort', 'proxy_port', 'realProxyPort'),
      type: find('proxyType', 'proxy_type') || 'HTTP',
      user: find('proxyUsername', 'proxyUser', 'proxy_user'),
      pass: find('proxyPassword', 'proxyPass', 'proxy_pass'),
    },

    payload,
    payloadMethod: find('payloadMethod', 'method', 'payload_method') || (payload ? 'CONNECT' : ''),

    sni: find('sni', 'sniHost', 'tlsSni', 'sni_host', 'ssl_sni'),
    tlsVersion: find('tlsVersion', 'tls_version'),

    udpgw: find('udpgw', 'udpgwHost'),
    dns: [find('dns', 'dnsServer', 'dns1'), find('dns2')].filter(Boolean),

    raw: data,
    allFields: data,
  };
}

module.exports = { parse };
