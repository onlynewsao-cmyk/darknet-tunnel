const ehi = require('./formats/ehi');
const hat = require('./formats/hat');
const npv = require('./formats/npv');
const darktunnel = require('./formats/darktunnel');
const tlstunnel = require('./formats/tlstunnel');
const openvpn = require('./formats/openvpn');
const ssh = require('./formats/ssh');
const jsonFormat = require('./formats/json');
const netmod = require('./formats/netmod');
const anytunnel = require('./formats/anytunnel');
const bdnet = require('./formats/bdnet');
const wyrvpn = require('./formats/wyrvpn');
const wireguard = require('./formats/wireguard');
const textFormat = require('./formats/text');
const apnalite = require('./formats/apnalite');
const forensicEngine = require('./engine');
const crypto = require('crypto');
const { utilExtractStrings, extractFieldsFromText, extractUrlsFromText, shannonEntropy } = require('./formats/_util');

const resultCache = new Map();
const CACHE_MAX = 50;
function cacheKey(fileName, buffer) {
  return `${fileName}:${crypto.createHash('sha256').update(buffer).digest('hex')}`;
}
function cacheSet(key, value) {
  resultCache.set(key, value);
  if (resultCache.size > CACHE_MAX) resultCache.delete(resultCache.keys().next().value);
}

/**
 * MASTER DECRYPTER CORE v6
 * Suporta TODOS os formatos VPN conhecidos.
 * Reconhecimento automático por extensão E por conteúdo (blind decrypt).
 */

// Mapa completo de extensão → parser
const EXT_MAP = {
  // HTTP Injector
  ehi: ehi, ehic: ehi,
  // HA Tunnel Plus
  hat: hat,
  // NPV Tunnel
  npv: npv, npv4: npv, npv7: npv, npv8: npv, npvt: npv,
  // DarkTunnel
  dark: darktunnel, darkt: darktunnel,
  // TLS Tunnel
  tls: tlstunnel,
  // OpenVPN / WireGuard
  ovpn: openvpn, conf: wireguard,
  // SSH / SSL
  ssh: ssh, ssl: ssh,
  // JSON genérico
  json: jsonFormat,
  // NetMod
  nm: netmod, nmess: netmod,
  // AnyTunnel
  any: anytunnel,
  // BD/APNA/WYR VPN
  bdnet: bdnet, bd: bdnet,
  apnalite: apnalite, apna: apnalite,
  wyrvpn: wyrvpn, wyr: wyrvpn,
  // Aliases comuns
  wg: wireguard, wireguard: wireguard,
  // Texto/URI
  txt: textFormat, log: textFormat, cfg: textFormat, ini: textFormat,
};

// Mapa de URI scheme → parser (para detecção em texto/clipboard)
const URI_MAP = {
  'bdnet://': bdnet,
  'bd://': bdnet,
  'apnalite://': apnalite,
  'apna://': apnalite,
  'wyrvpn://': wyrvpn,
  'wyr://': wyrvpn,
  'vmess://': textFormat,
  'vless://': textFormat,
  'trojan://': textFormat,
  'ss://': textFormat,
  'ssr://': textFormat,
  'ssh://': ssh,
  'hysteria://': textFormat,
  'hysteria2://': textFormat,
  'tuic://': textFormat,
  'warp://': textFormat,
};

/**
 * Detecta formato por conteúdo (magic bytes, estrutura, etc)
 */
function detectByContent(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return null;

  const str = buffer.toString('utf8').trim();

  // Hex puro do BDNet (começa com 4f07...)
  if (/^[0-9a-fA-F]{50,}$/.test(str) && str.startsWith('4f07')) return bdnet;

  // JSON válido
  if ((str.startsWith('{') && str.endsWith('}')) || (str.startsWith('[') && str.endsWith(']'))) {
    try {
      JSON.parse(str);
      return jsonFormat;
    } catch {}
  }

  // WireGuard INI
  if (str.includes('[Interface]') && str.includes('PrivateKey')) return wireguard;

  // OpenVPN
  if (str.includes('client') && (str.includes('remote ') || str.includes('dev tun'))) return openvpn;

  // SSH config
  if (str.includes('Host=') || str.includes('Port=') || str.includes('ssh_host')) return ssh;

  // URI schemes no texto
  for (const [prefix, parser] of Object.entries(URI_MAP)) {
    if (str.toLowerCase().startsWith(prefix)) return parser;
  }

  // Base64 encoded JSON (comum em vários tunnels)
  try {
    const decoded = Buffer.from(str, 'base64').toString('utf8');
    if (decoded.startsWith('{') || decoded.includes('"host"')) return jsonFormat;
  } catch {}

  return null;
}

/**
 * Função principal de decryptação.
 * @param {string} fileName - Nome do ficheiro (com extensão)
 * @param {Buffer} buffer - Conteúdo binário
 */
async function decrypt(fileName, buffer) {
  const key = cacheKey(fileName, buffer);
  const cached = resultCache.get(key);
  if (cached) return { ...cached, cached: true };

  const ext = fileName.split('.').pop().toLowerCase();
  let result = null;
  let usedFormat = ext.toUpperCase();

  try {
    // 1. Tentar por extensão (match exacto)
    const parser = EXT_MAP[ext];
    if (parser) {
      try {
        result = await parser.parse(buffer);
        if (result) usedFormat = result.format || ext.toUpperCase();
      } catch (e) {
        // Parser da extensão falhou — tentar detecção por conteúdo
      }
    }

    // 2. Se falhou, tentar detecção automática por conteúdo
    if (!result) {
      const detected = detectByContent(buffer);
      if (detected) {
        try {
          result = await detected.parse(buffer);
          if (result) usedFormat = result.format || 'AUTO-DETECT';
        } catch (e) {}
      }
    }

    // 3. Se ainda falhou, brute/blind decrypt (tenta todos e escolhe o melhor candidato)
    if (!result) {
      result = await blindDecrypt(buffer);
      if (result) usedFormat = result.format || 'BRUTE-FORCE';
    }

    // 4. Último recurso: motor forense seguro para não devolver vazio
    if (!result) {
      try {
        const audit = await forensicEngine.analyze(buffer, fileName);
        result = resultFromAudit(fileName, ext, audit);
      } catch {
        result = forensicFallback(fileName, buffer, ext);
      }
      usedFormat = 'FORENSE / BRUTE-FORCE';
    }

    const finalResult = {
      fileName,
      format: usedFormat,
      extractedAt: new Date().toISOString(),
      ...result,
      success: !(result.partial || result.protected),
      partial: !!result.partial,
      protected: !!result.protected,
    };
    cacheSet(key, finalResult);
    return finalResult;
  } catch (err) {
    throw new Error(`Falha na Extração: ${err.message}`);
  }
}

/**
 * Detecta se um texto contém URI de VPN válida
 * @param {string} text - Texto a analisar
 * @returns {{ scheme: string, parser: object } | null}
 */
function detectURI(text) {
  const t = (text || '').trim().toLowerCase();
  for (const [prefix, parser] of Object.entries(URI_MAP)) {
    if (t.startsWith(prefix)) {
      return { scheme: prefix.replace('://', ''), parser };
    }
  }
  return null;
}

function scoreResult(res) {
  if (!res || typeof res !== 'object') return 0;
  let score = 0;
  const add = (v, n) => { if (v !== undefined && v !== null && String(v).trim() !== '') score += n; };
  add(res.host, 12); add(res.port, 6); add(res.sni, 8); add(res.payload, 10);
  add(res.ssh?.host, 8); add(res.ssh?.user, 8); add(res.ssh?.pass, 8);
  add(res.proxy?.host, 8); add(res.proxy?.port, 4);
  add(res.vmess, 20); add(res.vless, 20); add(res.trojan, 18); add(res.shadowsocks, 16);
  add(res.wireguard, 18); add(res.openvpn, 18);
  if (res.allFields && typeof res.allFields === 'object') score += Math.min(Object.keys(res.allFields).length, 25);
  if (res.partial) score -= 3;
  if (res.protected) score -= 2;
  return score;
}

/**
 * Tenta todos os decrypters por ordem e escolhe o resultado com maior score.
 * Isso funciona como brute force estrutural: mesmo com extensão errada, o bot tenta todos.
 */
async function blindDecrypt(buffer) {
  const allParsers = [
    ehi, hat, npv, darktunnel, tlstunnel,
    jsonFormat, netmod, anytunnel, apnalite,
    bdnet, wyrvpn, ssh, openvpn, wireguard, textFormat,
  ];
  const candidates = [];
  for (const f of allParsers) {
    try {
      const res = await f.parse(buffer);
      if (res) candidates.push({ res, score: scoreResult(res) });
    } catch (e) {}
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.res || null;
}

function resultFromAudit(fileName, ext, audit = {}) {
  return {
    partial: !audit.found,
    protected: !!audit.protected,
    configName: fileName,
    configType: `Forense .${ext}`,
    appName: 'DARK Forensic Engine',
    mode: audit.protocol || 'Forensic',
    note: audit.found
      ? '✅ Campos extraídos pelo motor forense/brute force.'
      : '⚠️ Nenhum campo VPN confiável foi aberto; relatório forense anexado.',
    host: audit.host || '',
    port: audit.port || '',
    sni: audit.sni || '',
    payload: audit.payload || '',
    ssh: audit.ssh || null,
    proxy: audit.proxy || null,
    dns: audit.dns || [],
    uuid: audit.uuid || '',
    path: audit.path || '',
    allFields: {
      forensicAudit: audit,
      bruteForce: audit.brute,
      evidence: audit.evidence,
      urls: audit.urls,
      rawFields: audit.rawFields,
    },
    protection: audit.protected ? {
      format: 'FORENSIC_PROTECTED',
      entropy: audit.entropy,
      printableStrings: audit.printableStrings,
      bruteAttempts: audit.brute?.attempts,
      bruteTopCandidates: audit.brute?.topCandidates,
    } : null,
  };
}

function forensicFallback(fileName, buffer, ext) {
  const strings = utilExtractStrings(buffer, 4);
  const joined = strings.join('\n');
  const fields = extractFieldsFromText(joined);
  const urls = extractUrlsFromText(joined);
  const possiblePayload = strings.find(s => /(?:CONNECT|GET|POST|Host:|Upgrade:|WebSocket|HTTP\/1\.)/i.test(s)) || fields.payload || '';

  return {
    partial: true,
    protected: true,
    configName: fileName,
    configType: `Desconhecido .${ext}`,
    appName: 'Auto/Forense',
    note: 'Formato não decifrado totalmente. Resultado gerado por brute force forense de strings/campos.',
    host: fields.host || fields.sshHost || fields.proxyHost || fields.possibleHosts?.[0] || fields.possibleIPs?.[0] || '',
    port: fields.port || fields.sshPort || fields.proxyPort || '',
    sni: fields.sni || '',
    payload: possiblePayload,
    ssh: (fields.sshHost || fields.sshUser || fields.sshPass) ? {
      host: fields.sshHost || fields.host || '',
      port: fields.sshPort || fields.port || '',
      user: fields.sshUser || '',
      pass: fields.sshPass || '',
    } : null,
    proxy: (fields.proxyHost || fields.proxyPort) ? {
      host: fields.proxyHost || '',
      port: fields.proxyPort || '',
      type: 'HTTP',
    } : null,
    allFields: {
      detectedFields: fields,
      urls,
      entropy: shannonEntropy(buffer),
      extractedStrings: strings.slice(0, 120),
      totalStrings: strings.length,
      fileSize: buffer.length,
    },
  };
}

/**
 * Lista de todas as extensões suportadas (para UI)
 */
const SUPPORTED_EXTENSIONS = [...new Set(Object.keys(EXT_MAP))].sort();
const SUPPORTED_URIS = Object.keys(URI_MAP);

function clearCache() { resultCache.clear(); }

module.exports = { decrypt, detectURI, blindDecrypt, SUPPORTED_EXTENSIONS, SUPPORTED_URIS, clearCache };
