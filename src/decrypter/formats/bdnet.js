/**
 * BD Net VPN (bdnet://) — DECRYPT FUNCIONAL!
 * Chave universal: "4%PdXch>fkP]" (12 bytes XOR cíclica)
 * Funciona também para APNA Tunnel Lite (mesmo SDK)
 */
const { utilExtractStrings } = require('./_util');

const MASTER_KEY = Buffer.from('342550645863683e666b505d', 'hex'); // "4%PdXch>fkP]"

function hexToBuffer(s) {
  let h = String(s).replace(/^bdnet:\/\//i, '').replace(/^apnalite:\/\//i, '').replace(/^apna:\/\//i, '').trim().replace(/\s+/g, '');
  if (!/^[0-9a-fA-F]+$/.test(h)) throw new Error('Conteúdo inválido (não é hex)');
  if (h.length % 2 !== 0) h = h.slice(0, h.length - 1);
  return Buffer.from(h, 'hex');
}

function xor(buffer, key) {
  const out = Buffer.alloc(buffer.length);
  for (let i = 0; i < buffer.length; i++) out[i] = buffer[i] ^ key[i % key.length];
  return out;
}

function decryptPayloadHex(hexStr) {
  try {
    const buf = Buffer.from(hexStr, 'hex');
    const dec = xor(buf, MASTER_KEY);
    const s = dec.toString('utf-8');
    // Verifica se parece texto legível
    let printable = 0;
    for (const c of s) if (c.charCodeAt(0) >= 32 && c.charCodeAt(0) <= 126) printable++;
    if (printable / s.length > 0.7) return s;
  } catch (e) {}
  return hexStr; // retorna hex original se não decryptar
}

function extractJsonFields(text) {
  const fields = {};
  const re = /"(\w[\w_]{0,40})"\s*:\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m[1].length > 0 && m[1].length < 50) fields[m[1]] = m[2];
  }
  // Tenta também boolean/number fields: "key":true, "key":123
  const re2 = /"(\w[\w_]{0,40})"\s*:\s*(true|false|\d+)/g;
  while ((m = re2.exec(text)) !== null) {
    if (!fields[m[1]]) fields[m[1]] = m[2];
  }
  return fields;
}

async function parse(input, fileName) {
  let raw;
  if (Buffer.isBuffer(input)) {
    const s = input.toString('utf-8').trim();
    if (s.startsWith('bdnet://') || s.startsWith('apnalite://') || s.startsWith('apna://') || /^[0-9a-fA-F]{40,}$/.test(s)) {
      raw = hexToBuffer(s);
    } else {
      raw = input;
    }
  } else {
    raw = hexToBuffer(String(input));
  }

  // Skip header de 40 bytes se existir (como no formato original)
  let body = raw;
  // Tenta decrypt com header de 40 bytes
  const dec40 = xor(raw.slice(40), MASTER_KEY);
  const decFull = xor(raw, MASTER_KEY);
  
  let bestDec, bestText, usedOffset;
  
  // Testa qual dá melhor resultado
  const text40 = dec40.toString('utf-8');
  const textFull = decFull.toString('utf-8');
  
  if (text40.includes('{"') && text40.includes('":"')) {
    bestDec = dec40; bestText = text40; usedOffset = 40;
  } else if (textFull.includes('{"') && textFull.includes('":"')) {
    bestDec = decFull; bestText = textFull; usedOffset = 0;
  } else {
    // Tenta sem header
    bestDec = decFull; bestText = textFull; usedOffset = 0;
  }

  // Extrai campos JSON
  const fields = extractJsonFields(bestText);

  // Decrypta o payload se for hex
  let payload = fields.payload || '';
  if (payload && /^[0-9a-fA-F]{10,}$/.test(payload)) {
    payload = decryptPayloadHex(payload);
  }

  // Formata payload com [crlf] → quebras visuais
  const payloadFormatted = payload
    .replace(/\[crlf\]/gi, '\n')
    .replace(/\\r\\n/g, '\n')
    .trim();

  const inferredSni = fields.sni || fields.dothost || fields.sausage || fields.custom_sni || fields.server_sni || '';
  const inferredHost = fields.host || fields.server || fields.server_ip || '';

  const result = {
    configName: fields.friendly_name || fields.name || fields.config_name ||
                fileName?.replace(/\.(bdnet|apnalite|apna|txt)$/i, '') || 'BD Net Config',
    configType: 'BD Net VPN',
    appName: 'BD Net VPN',
    mode: fields.method || fields.mode || 'HTTP',

    host: inferredHost,
    port: fields.port || '',

    ssh: (fields.ssh_host || inferredHost) ? {
      host: fields.ssh_host || inferredHost || '',
      port: fields.ssh_port || fields.port || '443',
      user: fields.ssh_user || fields.username || '',
      pass: fields.ssh_pass || fields.password || '',
    } : null,

    proxy: inferredHost ? {
      host: inferredHost,
      port: fields.port || '80',
      type: (fields.method || 'HTTP').toUpperCase(),
    } : null,

    sni: inferredSni,
    payload: payloadFormatted || '',
    payloadMethod: (fields.method || 'HTTP').toUpperCase(),

    dns: [],

    note: Object.keys(fields).length > 3
      ? `✅ Decrypt completo (chave universal 12 bytes)`
      : Object.keys(fields).length > 0
      ? `⚠️ Decrypt parcial (${Object.keys(fields).length} campos)`
      : `❌ Não conseguiu decryptar — formato pode ser diferente`,

    raw: {
      totalBytes: raw.length,
      decryptionMethod: 'XOR-12b-universal',
      keyHex: MASTER_KEY.toString('hex'),
      decryptedPreview: bestText.slice(0, 600).replace(/[^\x20-\x7E\n\r\t]/g, '·'),
      decryptOffset: usedOffset,
    },
    allFields: {
      ...fields,
      _payloadDecrypted: payloadFormatted,
      _expiresAt: fields.tweak_expiry || '',
      _message: fields.message || '',
      _category: fields.category || '',
      _sslws: fields.sslws || '',
      _tlsVersion: fields.tlsVersion || '',
      _reconnectSeconds: fields.reconnectSeconds || '',
      _mobileDataOnly: fields.mobile_data_only || '',
      _blockRooted: fields.block_rooted || '',
      _isAutoSelect: fields.isAutoSelect || '',
      _isHostResolve: fields.isHostResolve || '',
      _allowInsecure: fields.allowInsecure || '',
    },
  };

  return result;
}

module.exports = { parse };
