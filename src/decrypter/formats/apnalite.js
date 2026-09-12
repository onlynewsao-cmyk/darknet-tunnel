/**
 * APNA Tunnel Lite (apnalite:// ou apna://) — v2.0
 *
 * Usa a MESMA chave XOR do BD Net VPN (mesmo SDK Android).
 * Mas tem campos extra próprios: slow_dns, dns_mode, server_ip,
 * custom_sni, allow_insecure, udp_mode, udp_port, etc.
 */
const bdnet = require('./bdnet');

// Campos extra específicos do APNA Lite (além dos do BD Net)
const APNA_EXTRA_FIELDS = [
  'slow_dns', 'dns_mode', 'server_ip', 'custom_sni',
  'udp_mode', 'udp_port', 'split_tunnel', 'apps_list',
  'allow_bgp', 'allow_udp', 'dns_server', 'dns_port',
  'obfs_type', 'obfs_param', 'network_mode', 'proxy_type',
  'proxy_host', 'proxy_port', 'proxy_user', 'proxy_pass',
  'ssh_host', 'ssh_port', 'ssh_user', 'ssh_pass', 'ssh_key',
  'v2ray_host', 'v2ray_port', 'v2ray_uuid', 'v2ray_path',
  'v2ray_tls', 'v2ray_net', 'v2ray_type',
  'trojan_host', 'trojan_port', 'trojan_pass', 'trojan_sni',
  'ss_host', 'ss_port', 'ss_method', 'ss_pass',
];

async function parse(input, fileName) {
  // Normaliza: remove prefixo URI se existir
  let normalizedInput = input;
  if (Buffer.isBuffer(input)) {
    const s = input.toString('utf-8').trim();
    if (s.startsWith('apnalite://') || s.startsWith('apna://')) {
      // Extrai a parte hex depois do ://
      const hex = s.replace(/^apnalite:\/\//i, '').replace(/^apna:\/\//i, '').trim();
      normalizedInput = Buffer.from(hex, 'hex').length > 0
        ? Buffer.from(hex, 'hex')
        : Buffer.from(hex);         // fallback: passa como texto
    }
  } else {
    const s = String(input).trim();
    const hex = s.replace(/^apnalite:\/\//i, '').replace(/^apna:\/\//i, '').trim();
    normalizedInput = Buffer.from(hex, 'hex').length > 0
      ? Buffer.from(hex, 'hex')
      : Buffer.from(hex);
  }

  // Reutiliza o parser BD Net (mesma chave)
  const result = await bdnet.parse(normalizedInput, fileName);

  // Identifica como APNA
  result.format     = 'APNALITE';
  result.configType = 'APNA Tunnel Lite';
  result.appName    = 'APNA Tunnel Lite';

  if (!result.configName || result.configName === 'BD Net Config') {
    result.configName = fileName?.replace(/\.(apnalite|apna|txt)$/i, '') || 'APNA Lite Config';
  }

  const af = result.allFields || {};

  // ── Extrai campos extras específicos do APNA ───────────────
  // SSH
  if (af.ssh_host || af.sshHost) {
    result.ssh = {
      host: af.ssh_host || af.sshHost || '',
      port: af.ssh_port || af.sshPort || '22',
      user: af.ssh_user || af.sshUser || af.username || '',
      pass: af.ssh_pass || af.sshPass || af.password || '',
    };
  }

  // Proxy extra
  if (af.proxy_host) {
    result.proxy = {
      host: af.proxy_host,
      port: af.proxy_port || '8080',
      type: (af.proxy_type || 'HTTP').toUpperCase(),
      user: af.proxy_user || '',
      pass: af.proxy_pass || '',
    };
  }

  // DNS
  const dnsEntries = [af.dns_server, af.slow_dns, af.dns].filter(Boolean);
  if (dnsEntries.length) result.dns = dnsEntries;

  // V2Ray
  if (af.v2ray_host || af.v2ray_uuid) {
    result.vmess = {
      uuid:     af.v2ray_uuid || '',
      network:  af.v2ray_net  || af.v2ray_type || '',
      tls:      af.v2ray_tls  || '',
      path:     af.v2ray_path || '',
      host:     af.v2ray_host || '',
      alterId:  af.v2ray_aid  || 0,
      security: af.v2ray_security || 'auto',
    };
  }

  // Trojan
  if (af.trojan_host || af.trojan_pass) {
    result.trojan = {
      password: af.trojan_pass || '',
      sni:      af.trojan_sni  || af.sni || '',
      host:     af.trojan_host || '',
      port:     af.trojan_port || '443',
    };
  }

  // Shadowsocks
  if (af.ss_host || af.ss_method) {
    result.shadowsocks = {
      server:   af.ss_host   || '',
      port:     af.ss_port   || '8388',
      method:   af.ss_method || '',
      password: af.ss_pass   || '',
    };
  }

  // SNI extra
  if (!result.sni && (af.custom_sni || af.sni || af.server_sni || af.dothost || af.sausage)) {
    result.sni = af.custom_sni || af.sni || af.server_sni || af.dothost || af.sausage || '';
  }

  // UDPGW
  if (af.udp_port) {
    result.udpgw = `${af.udp_host || '127.0.0.1'}:${af.udp_port}`;
  }

  // Campos extras no allFields
  const extraApna = {};
  for (const k of APNA_EXTRA_FIELDS) {
    if (af[k] !== undefined && af[k] !== '') extraApna[k] = af[k];
  }
  if (Object.keys(extraApna).length) {
    result.allFields = { ...af, ...extraApna };
  }

  // Nota
  result.note = Object.keys(af).filter(k => !k.startsWith('_')).length > 3
    ? '✅ Decrypt completo — APNA Tunnel Lite (chave XOR BD Net SDK)'
    : '⚠️ Decrypt parcial — poucos campos encontrados';

  return result;
}

module.exports = { parse };
