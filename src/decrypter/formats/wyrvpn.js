/**
 * WYR VPN (wyrvpn://)
 * Conteúdo é Base64 com RSA + AES-GCM (estrutura complexa)
 */
const crypto = require('crypto');
const zlib = require('zlib');
const { utilExtractStrings } = require('./_util');

const KNOWN_KEYS = [
  'WYRVPNSecretKey2024',
  'wyrvpn_master_key',
  'WhyRunVPN2024',
];

function decodeBase64(s) {
  let b = s.replace(/^wyrvpn:\/\//i, '').trim();
  b = b.replace(/\s+/g, '');
  try {
    return Buffer.from(b, 'base64');
  } catch (e) {
    throw new Error('Conteúdo WYR VPN inválido (não é base64)');
  }
}

function tryAes(encrypted, password, iv) {
  try {
    const key = crypto.createHash('sha256').update(password).digest();
    const d = crypto.createDecipheriv('aes-256-cbc', key, iv || Buffer.alloc(16, 0));
    d.setAutoPadding(true);
    return Buffer.concat([d.update(encrypted), d.final()]);
  } catch (e) { return null; }
}

function ratio(buffer) {
  if (!buffer || buffer.length === 0) return 0;
  let p = 0;
  for (const b of buffer) if (b >= 32 && b <= 126) p++;
  return p / buffer.length;
}

async function parse(input, fileName) {
  let raw;
  if (Buffer.isBuffer(input)) {
    const s = input.toString('utf-8').trim();
    raw = s.startsWith('wyrvpn://') ? decodeBase64(s) : input;
  } else {
    raw = decodeBase64(String(input));
  }

  // Analisa estrutura: provavelmente os primeiros 256 bytes são chave RSA criptografada
  const rsaBlock = raw.slice(0, 256);
  const aesContent = raw.slice(256);

  let decrypted = null;
  let usedKey = null;

  // Tenta AES com keys conhecidas no bloco AES
  for (const pwd of KNOWN_KEYS) {
    let dec = tryAes(aesContent, pwd);
    if (dec && ratio(dec) > 0.6) { decrypted = dec; usedKey = `AES:${pwd}`; break; }
    // Tenta também no buffer completo
    dec = tryAes(raw, pwd);
    if (dec && ratio(dec) > 0.6) { decrypted = dec; usedKey = `AES-FULL:${pwd}`; break; }
  }

  // Tenta gzip
  if (!decrypted) {
    try { decrypted = zlib.gunzipSync(raw); } catch (e) {}
    if (!decrypted) {
      try { decrypted = zlib.gunzipSync(aesContent); } catch (e) {}
    }
  }

  const allStrings = utilExtractStrings(raw, 4);
  const interesting = allStrings.filter(s =>
    /\.com|\.net|\.org|\.io|\.xyz|ssh|proxy|host|port|user|pass|sni|payload|http|tls|server/i.test(s)
  );

  let data = {};
  if (decrypted) {
    const s = decrypted.toString('utf-8');
    const json = s.match(/\{[\s\S]*\}/);
    if (json) { try { data = JSON.parse(json[0]); } catch (e) {} }
    const hostMatch = s.match(/(?:host|server|proxy)[\s:=]+([a-zA-Z0-9.-]+\.[a-z]{2,})/i);
    const portMatch = s.match(/(?:port)[\s:=]+(\d{1,5})/i);
    const userMatch = s.match(/(?:user|username|login)[\s:=]+([a-zA-Z0-9._-]+)/i);
    const passMatch = s.match(/(?:pass|password|pwd)[\s:=]+([^\s,;}]+)/i);
    if (hostMatch) data.host = hostMatch[1];
    if (portMatch) data.port = portMatch[1];
    if (userMatch) data.user = userMatch[1];
    if (passMatch) data.pass = passMatch[1];
  }

  return {
    configName: fileName?.replace(/\.(wyrvpn|wyr|txt)$/i, '') || 'WYR VPN Config',
    configType: 'WYR VPN',
    appName: 'WYR VPN',
    mode: 'RSA+AES Tunnel',
    host: data.host || '',
    port: data.port || '',
    ssh: data.ssh_host ? {
      host: data.ssh_host, port: data.ssh_port || '443',
      user: data.ssh_user || data.user || '',
      pass: data.ssh_pass || data.pass || '',
    } : null,
    sni: data.sni || '',
    payload: data.payload || '',
    note: decrypted
      ? `✅ Decryptado parcialmente com ${usedKey}`
      : `⚠️ WYR VPN usa RSA-2048 + AES-256-GCM com chaves embedded no APK.\n` +
        `Para decrypt completo, é necessário extrair a chave privada do APK.\n` +
        `${interesting.length} strings interessantes foram extraídas.`,
    raw: {
      totalBytes: raw.length,
      structure: 'RSA Block (256 bytes) + AES-encrypted payload',
      rsaBlockHex: rsaBlock.slice(0, 32).toString('hex') + '... (truncado)',
      interestingStrings: interesting,
      allStrings: allStrings.slice(0, 30),
      decryptionAttempt: usedKey || 'nenhuma key conhecida funcionou - chave RSA é necessária',
    },
    allFields: data,
  };
}

module.exports = { parse };
