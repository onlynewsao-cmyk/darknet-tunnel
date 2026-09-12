/**
 * DARK BOT — Safe Forensic Engine
 *
 * Ferramenta auxiliar do decrypter. Ela NÃO inventa dados; só promove campos
 * quando há evidência real com score suficiente. Para arquivos locked, retorna
 * auditoria/estatísticas e os melhores candidatos do brute sem fingir sucesso.
 */
const {
  utilExtractStrings,
  extractFieldsFromText,
  extractUrlsFromText,
  shannonEntropy,
} = require('./formats/_util');
const { forensicBruteBuffer } = require('./brute');

function hasValue(v) {
  return v !== undefined && v !== null && String(v).trim() !== '';
}

function normalizeFields(fields = {}) {
  const host = fields.host || fields.sshHost || fields.proxyHost || fields.possibleHosts?.[0] || fields.possibleIPs?.[0] || '';
  const port = fields.port || fields.sshPort || fields.proxyPort || '';
  const sni = fields.sni || fields.bugHost || '';
  return {
    host,
    port,
    sni,
    bugHost: fields.bugHost || sni || '',
    payload: fields.payload || '',
    ssh: (fields.sshHost || fields.sshUser || fields.sshPass) ? {
      host: fields.sshHost || host || '',
      port: fields.sshPort || port || '',
      user: fields.sshUser || '',
      pass: fields.sshPass || '',
    } : null,
    proxy: (fields.proxyHost || fields.proxyPort) ? {
      host: fields.proxyHost || '',
      port: fields.proxyPort || '',
      type: 'HTTP',
    } : null,
    dns: fields.dns ? [fields.dns] : [],
    uuid: fields.uuid || '',
    path: fields.path || '',
  };
}

function detectProtocol(text, fields = {}) {
  const t = String(text || '').toLowerCase();
  if (/vmess:\/\//i.test(text) || t.includes('vmess')) return 'V2Ray / VMess';
  if (/vless:\/\//i.test(text) || t.includes('vless')) return 'V2Ray / VLess';
  if (/trojan:\/\//i.test(text) || t.includes('trojan')) return 'Trojan';
  if (/ss:\/\//i.test(text) || t.includes('shadowsocks')) return 'Shadowsocks';
  if (t.includes('[interface]') && t.includes('privatekey')) return 'WireGuard';
  if (/\bclient\b[\s\S]+\bremote\s+\S+/i.test(text)) return 'OpenVPN';
  if (fields.sni || fields.bugHost || String(fields.port) === '443') return 'TLS / SNI';
  if (fields.proxyHost || fields.payload || /CONNECT|GET|POST|Host:/i.test(text)) return 'HTTP Proxy / Payload';
  if (fields.sshHost || fields.sshUser) return 'SSH';
  return '';
}

async function analyze(buffer, fileName = 'config.bin', options = {}) {
  const input = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || '');
  const strings = utilExtractStrings(input, 4);
  const text = strings.join('\n');
  const fields = extractFieldsFromText(text);
  const urls = extractUrlsFromText(text);
  const entropy = shannonEntropy(input);
  const brute = forensicBruteBuffer(input, { keep: options.keep || 8, minScore: options.minScore || 55 });

  const bruteFields = brute.found && brute.best?.fields ? brute.best.fields : {};
  const mergedFields = { ...fields, ...bruteFields };
  const normalized = normalizeFields(mergedFields);
  const protocol = detectProtocol(brute.best?.preview || text, mergedFields);

  const found = brute.found || Object.values(normalized).some(v => {
    if (Array.isArray(v)) return v.length > 0;
    if (v && typeof v === 'object') return Object.values(v).some(hasValue);
    return hasValue(v);
  });

  return {
    fileName,
    found,
    protected: entropy > 7.5 && !brute.found,
    entropy,
    printableStrings: strings.length,
    urls,
    protocol,
    ...normalized,
    brute,
    evidence: strings
      .filter(s => /host|server|sni|payload|proxy|ssh|user|pass|CONNECT|HTTP|vmess|vless|trojan|wireguard|openvpn/i.test(s))
      .slice(0, 60),
    rawFields: fields,
  };
}

module.exports = { analyze, normalizeFields, detectProtocol };
