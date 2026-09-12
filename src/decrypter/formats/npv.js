/**
 * NPV Tunnel (.npv4 / .npv7 / .npv8 / .npv) — v2.0
 * Suporta múltiplas versões de header e criptografia
 */
const crypto = require('crypto');
const zlib = require('zlib');
const { utilExtractStrings, tryAesCbc, tryAes128Cbc, tryXorBuf, extractJson, extractFieldsFromText, printableRatio } = require('./_util');

const NPV_KEYS = [
  'NPVTunnel2021KeySecret',
  'npv_tunnel_secret_key',
  'NPVAESKEY123456789NPVTUNNEL',
  '12345678901234567890123456789012',
  'npvtunnel4secretkey1234567890123',
  'NPVTunnel@2022SecretKey',
  'npvtunnel2023key',
  'npv_premium_key_2024',
  'N3tPr0t3ctVPN!',
  'NPV8SecretEncryptionKey2024',
];

const XOR_KEYS = [
  Buffer.from('NPVTunnel'),
  Buffer.from('npvtunnel2021'),
  Buffer.from('NPVKEY2022'),
  Buffer.from([0x4E, 0x50, 0x56]),
];

async function parse(buffer, fileName) {
  let json = null;
  let body = buffer;

  // Strip headers (NPVT1, NPV4, NPV7, NPV8, NPV)
  const headerStr = body.slice(0, 5).toString();
  let npvVersion = '';
  if (headerStr.startsWith('NPVT')) {
    npvVersion = 'NPVT';
    // NPVT format: "NPVT1\n<base64_block1>,<base64_block2>,<base64_block3>"
    const textBody = body.toString('utf-8');
    const nlIdx = textBody.indexOf('\n');
    if (nlIdx > 0) {
      npvVersion = textBody.slice(0, nlIdx); // "NPVT1"
      body = Buffer.from(textBody.slice(nlIdx + 1));
    } else {
      body = body.slice(5);
    }
  } else {
    const headers = ['NPV8', 'NPV7', 'NPV4', 'NPV'];
    for (const h of headers) {
      if (body.slice(0, h.length).toString() === h) { npvVersion = h; body = body.slice(h.length); break; }
    }
  }
  // Pula bytes nulos
  while (body.length > 0 && body[0] === 0) body = body.slice(1);

  // NPVT multi-block format: base64,base64,base64
  const bodyStr = body.toString('utf-8').trim();
  const commaParts = bodyStr.split(',');
  if (npvVersion.startsWith('NPVT') && commaParts.length >= 2) {
    return parseNpvtMultiBlock(commaParts, fileName, npvVersion);
  }

  // 1) JSON direto
  json = extractJson(body.toString('utf-8'));

  // 2) AES-256 com keys conhecidas
  if (!json) {
    const b64 = body.toString('utf-8').trim();
    let data;
    try { data = Buffer.from(b64, 'base64'); } catch (e) { data = body; }
    for (const k of NPV_KEYS) {
      const dec = tryAesCbc(data, k);
      if (dec) { const j = extractJson(dec.toString('utf-8')); if (j) { json = j; break; } }
    }
    // AES-128
    if (!json) {
      for (const k of NPV_KEYS) {
        const dec = tryAes128Cbc(data, k);
        if (dec) { const j = extractJson(dec.toString('utf-8')); if (j) { json = j; break; } }
      }
    }
  }

  // 3) XOR
  if (!json) {
    for (const k of XOR_KEYS) {
      const dec = tryXorBuf(body, k);
      if (printableRatio(dec) > 0.7) {
        const j = extractJson(dec.toString('utf-8'));
        if (j) { json = j; break; }
        try { const gz = zlib.gunzipSync(dec).toString('utf-8'); json = extractJson(gz); if (json) break; } catch (e) {}
      }
    }
  }

  // 4) Gzip
  if (!json) { try { json = extractJson(zlib.gunzipSync(body).toString('utf-8')); } catch (e) {} }

  // 5) Base64 puro
  if (!json) {
    try {
      const dec = Buffer.from(body.toString('utf-8').trim(), 'base64');
      json = extractJson(dec.toString('utf-8'));
      if (!json) { try { json = extractJson(zlib.gunzipSync(dec).toString('utf-8')); } catch (e) {} }
    } catch (e) {}
  }

  // 6) Double base64
  if (!json) {
    try {
      const d1 = Buffer.from(body.toString('utf-8').trim(), 'base64').toString('utf-8');
      const d2 = Buffer.from(d1, 'base64').toString('utf-8');
      json = extractJson(d2);
    } catch (e) {}
  }

  if (!json) {
    const strings = utilExtractStrings(body, 4);
    const textFields = extractFieldsFromText(strings.join('\n'));
    return {
      configName: (fileName || "config").replace(/\.npv\d*$/i, ''),
      configType: 'NPV Tunnel',
      appName: 'NPV Tunnel',
      note: '⚠️ Não decriptado completamente. Dados parciais extraídos.',
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
  try { data = JSON.parse(json.match(/\{[\s\S]*\}/)?.[0] || json); }
  catch (e) { data = { raw: json }; }

  return parseNpvJson(data, fileName);
}

function parseNpvJson(data, fileName) {
  const find = (...keys) => {
    for (const k of keys) {
      if (data[k] !== undefined && data[k] !== null && data[k] !== '') return data[k];
      const lk = Object.keys(data).find(x => x.toLowerCase() === k.toLowerCase());
      if (lk && data[lk] !== undefined && data[lk] !== null && data[lk] !== '') return data[lk];
      for (const v of Object.values(data)) {
        if (v && typeof v === 'object' && !Array.isArray(v)) {
          if (v[k] !== undefined && v[k] !== null && v[k] !== '') return v[k];
        }
      }
    }
    return '';
  };

  let payload = find('payload', 'custom_payload', 'request_payload', 'customPayload');
  if (payload && /^[A-Za-z0-9+/=]{20,}$/.test(String(payload))) {
    try {
      const dec = Buffer.from(String(payload), 'base64').toString('utf-8');
      if (dec.includes('HTTP') || dec.includes('Host')) payload = dec;
    } catch (e) {}
  }

  return {
    configName: find('name', 'configName', 'profile_name', 'config_name') || (fileName || "config").replace(/\.npv\d*$/i, ''),
    configType: 'NPV Tunnel',
    appName: 'NPV Tunnel',
    appVersion: find('version', 'app_version'),
    mode: find('mode', 'connection_mode', 'connectionMode', 'conn_mode'),
    note: find('note', 'description', 'config_note'),

    host: find('proxy_host', 'host', 'server_host', 'remote_host', 'proxyHost', 'server'),
    port: find('proxy_port', 'port', 'server_port', 'proxyPort'),

    ssh: {
      host: find('ssh_host', 'sshHost', 'ssh_server'),
      port: find('ssh_port', 'sshPort', 'ssh_server_port'),
      user: find('ssh_user', 'ssh_username', 'username', 'sshUser', 'sshUsername'),
      pass: find('ssh_pass', 'ssh_password', 'password', 'sshPass', 'sshPassword'),
    },

    proxy: {
      host: find('proxy_host', 'proxyHost'),
      port: find('proxy_port', 'proxyPort'),
      type: find('proxy_type', 'proxyType') || 'HTTP',
      user: find('proxy_user', 'proxy_username', 'proxyUser'),
      pass: find('proxy_pass', 'proxy_password', 'proxyPass'),
    },

    payload,
    payloadMethod: find('payload_method', 'payloadMethod'),

    sni: find('sni', 'sni_host', 'ssl_sni', 'sniHost', 'tlsSni'),
    tlsVersion: find('tls_version', 'tlsVersion'),

    dns: [find('dns', 'dns1'), find('dns2')].filter(Boolean),

    raw: data,
    allFields: data,
  };
}

/**
 * Parse NPVT multi-block format (NPVT1: salt,encrypted_data,signature)
 * Uses AES-256-CBC with key derived from app's embedded secret
 */
async function parseNpvtMultiBlock(parts, fileName, version) {
  const crypto = require('crypto');

  const blocks = parts.map(p => {
    try { return Buffer.from(p, 'base64'); } catch (e) { return Buffer.alloc(0); }
  });

  // Structure: block0=salt/IV (17 bytes), block1=encrypted_data, block2=encrypted_key/signature
  const salt = blocks[0];
  const encData = blocks[1];
  const keyBlock = blocks[2] || Buffer.alloc(0);

  // Entropy analysis
  function entropy(buf) {
    if (!buf.length) return 0;
    const freq = new Array(256).fill(0);
    for (const b of buf) freq[b]++;
    let e = 0;
    for (const f of freq) { if (f > 0) { const p = f / buf.length; e -= p * Math.log2(p); } }
    return e;
  }

  // Extended key attempts for NPVT
  const NPVT_KEYS = [
    ...NPV_KEYS,
    'NPVT1SecretKey2024', 'npvtunnel_secret', 'NPVTunnelPro2024',
    'NPVTunnelSecretEncryptionKey', 'npvt_master_key_2024',
    'com.npv.tunnel', 'com.npvtunnel.app', 'NPVTunnelPlus',
  ];

  let json = null;

  // Try AES-256 with each known key + salt as IV
  for (const k of NPVT_KEYS) {
    // Various key derivation approaches
    const keyVariants = [
      crypto.createHash('sha256').update(k).digest(),
      crypto.createHash('sha256').update(k + salt.toString('hex')).digest(),
      crypto.createHash('sha256').update(Buffer.concat([Buffer.from(k), salt])).digest(),
    ];
    const ivVariants = [
      Buffer.alloc(16),
      Buffer.concat([salt, Buffer.alloc(16)]).slice(0, 16),
      encData.slice(0, 16),
    ];

    for (const key of keyVariants) {
      for (const iv of ivVariants) {
        try {
          const dec = crypto.createDecipheriv('aes-256-cbc', key, iv);
          const data = iv === encData.slice(0, 16) ? encData.slice(16) : encData;
          const result = Buffer.concat([dec.update(data), dec.final()]);
          const s = result.toString('utf-8');
          json = extractJson(s);
          if (json) break;
        } catch (e) {}
      }
      if (json) break;
    }
    if (json) break;
  }

  // Try XOR with salt and key block
  if (!json) {
    for (const xorKey of [salt, keyBlock, Buffer.from(version || 'NPVT1')]) {
      const xored = tryXorBuf(encData, xorKey);
      if (printableRatio(xored) > 0.6) {
        json = extractJson(xored.toString('utf-8'));
        if (json) break;
        try {
          const gz = require('zlib').gunzipSync(xored);
          json = extractJson(gz.toString('utf-8'));
          if (json) break;
        } catch (e) {}
      }
    }
  }

  // Try to use keyBlock to decrypt
  if (!json && keyBlock.length >= 16) {
    const keyVariants = [
      keyBlock.slice(0, 32),
      crypto.createHash('sha256').update(keyBlock).digest(),
    ];
    for (const key of keyVariants) {
      try {
        const k = key.length >= 32 ? key.slice(0, 32) : Buffer.concat([key, Buffer.alloc(32)]).slice(0, 32);
        const dec = crypto.createDecipheriv('aes-256-cbc', k, Buffer.alloc(16));
        const result = Buffer.concat([dec.update(encData), dec.final()]);
        json = extractJson(result.toString('utf-8'));
        if (json) break;
      } catch (e) {}
    }
  }

  if (json) {
    let data;
    try { data = JSON.parse(json); } catch (e) { data = { raw: json }; }
    return parseNpvJson(data, fileName);
  }

  // Could not decrypt — return forensic analysis
  const dataEntropy = entropy(encData);
  const keyEntropy = entropy(keyBlock);

  return {
    partial: true,
    protected: true,
    protection: {
      format: version || 'NPVT',
      confidence: 'high',
      entropy: parseFloat(dataEntropy.toFixed(2)),
      encryptedBytes: encData.length + keyBlock.length,
      printableStrings: 0,
      urls: [],
      evidence: [],
    },
    configName: (fileName || "config").replace(/\.npv[t\d]*$/i, ''),
    configType: 'NPV Tunnel (' + (version || 'NPVT') + ')',
    appName: 'NPV Tunnel',
    appVersion: version || 'NPVT',
    mode: 'Encrypted',
    note: `🔒 *Ficheiro com criptografia proprietária do NPV Tunnel*\n\n` +
          `📋 *Análise Forense:*\n` +
          `├ Formato: ${version || 'NPVT'}\n` +
          `├ Blocos: ${parts.length} (salt + dados + assinatura)\n` +
          `├ Dados encriptados: ${encData.length} bytes\n` +
          `├ Entropia: ${dataEntropy.toFixed(1)}/8.0 (${dataEntropy > 7.5 ? 'AES-256 estimado' : 'parcialmente legível'})\n` +
          `└ Tamanho total: ${(encData.length + keyBlock.length)} bytes\n\n` +
          `💡 *Como obter os dados desta config:*\n` +
          `1️⃣ Abra o NPV Tunnel no celular\n` +
          `2️⃣ Importe esta config no app\n` +
          `3️⃣ Com a config ativa, vá em Configurações\n` +
          `4️⃣ Exporte como *.ehi* ou *.hat*\n` +
          `5️⃣ Envie o .ehi/.hat aqui para decriptar\n\n` +
          `⚠️ O NPV Tunnel (NapsternetV) v122+ usa\n` +
          `formato NPVT com chave AES embutida no APK\n` +
          `que muda entre versões.`,

    allFields: {
      format: version || 'NPVT',
      blocks: parts.length,
      blockSizes: blocks.map(b => b.length),
      saltHex: salt.toString('hex'),
      dataEntropy: parseFloat(dataEntropy.toFixed(2)),
      keyBlockEntropy: parseFloat(keyEntropy.toFixed(2)),
      encryptionType: dataEntropy > 7.5 ? 'AES-256 (estimado)' : 'Desconhecido',
      totalEncryptedBytes: encData.length + keyBlock.length,
    },
  };
}

module.exports = { parse };
