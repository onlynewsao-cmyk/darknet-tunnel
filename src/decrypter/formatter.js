/**
 * Formatter forense do DARK BOT VPN Decrypter.
 * Mostra dados principais + estruturas específicas + campos brutos úteis.
 */

function val(...values) {
  for (const v of values) {
    if (v === undefined || v === null) continue;
    if (typeof v === 'string' && v.trim() === '') continue;
    if (Array.isArray(v) && !v.length) continue;
    if (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length) continue;
    return v;
  }
  return '';
}

function str(v) {
  if (v === undefined || v === null || v === '') return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try { return JSON.stringify(v, null, 2); } catch { return String(v); }
}

function clip(v, max = 3500) {
  const s = str(v);
  if (!s) return '';
  return s.length > max ? s.slice(0, max) + `\n... [truncado: ${s.length - max} chars]` : s;
}

function flatten(obj, prefix = '', out = {}) {
  if (!obj || typeof obj !== 'object') return out;
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Buffer)) flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}

function deepFind(obj, names) {
  const wanted = names.map(x => x.toLowerCase());
  const flat = flatten(obj || {});
  for (const [k, v] of Object.entries(flat)) {
    const nk = k.split('.').pop().toLowerCase().replace(/[_\-\s]/g, '');
    for (const w of wanted) {
      const nw = w.toLowerCase().replace(/[_\-\s]/g, '');
      if (nk === nw && val(v)) return v;
    }
  }
  return '';
}

function extractBugHost(res) {
  const payload = str(res.payload || deepFind(res.allFields, ['payload', 'customPayload', 'requestPayload']));
  const hostHeader = payload.match(/(?:^|\r?\n)Host:\s*([^\r\n]+)/i)?.[1];
  const connectHost = payload.match(/CONNECT\s+([^\s:]+)(?::\d+)?\s+HTTP/i)?.[1];
  const urlHost = payload.match(/https?:\/\/([^/\s]+)/i)?.[1];
  return val(res.bugHost, res.bughost, hostHeader, connectHost, urlHost, res.sni, res.vmess?.host, res.vless?.host);
}

function detectArchitecture(res) {
  const type = `${res.configType || ''} ${res.mode || ''} ${res.protocol || ''} ${res.format || ''}`.toLowerCase();
  if (res.vmess || type.includes('vmess')) return 'V2Ray / VMess';
  if (res.vless || type.includes('vless')) return 'V2Ray / VLess';
  if (res.trojan || type.includes('trojan')) return 'Trojan TLS';
  if (res.shadowsocks || type.includes('shadowsocks')) return 'Shadowsocks';
  if (res.wireguard || type.includes('wireguard')) return 'WireGuard';
  if (res.openvpn || type.includes('openvpn')) return 'OpenVPN';
  if (res.sni || String(res.port) === '443' || type.includes('tls') || type.includes('ssl')) return 'TLS / SSL SNI';
  if (res.proxy?.host || res.payload || type.includes('proxy')) return 'HTTP Proxy / Payload Injection';
  if (type.includes('dns') || String(res.port) === '53') return 'DNS / SlowDNS';
  if (res.ssh?.host || res.ssh?.user) return 'SSH Direct';
  return 'HTTP / SSH / Genérico';
}

function section(title, lines) {
  const clean = lines.filter(Boolean);
  if (!clean.length) return '';
  return `\n${title}\n${clean.join('\n')}\n`;
}

function codeBlock(label, content, max = 3500) {
  const c = clip(content, max);
  if (!c) return '';
  return `\n${label}\n\`\`\`\n${c}\n\`\`\`\n`;
}

function formatForWhatsApp(res = {}, config = {}) {
  const host = val(res.host, res.server?.host, res.ssh?.host, res.proxy?.host, deepFind(res.allFields, ['host', 'server', 'address', 'remoteHost', 'sshHost', 'proxyHost', 'proxy_ip']));
  const port = val(res.port, res.server?.port, res.ssh?.port, res.proxy?.port, deepFind(res.allFields, ['port', 'serverPort', 'remotePort', 'sshPort', 'proxyPort']));
  const sni = val(res.sni, res.tlsSni, res.vmess?.sni, res.vless?.sni, res.trojan?.sni, deepFind(res.allFields, ['sni', 'sniHost', 'tlsSni', 'sslSni', 'serverName']));
  const bugHost = extractBugHost({ ...res, sni });
  const proxyHost = val(res.proxy?.host, deepFind(res.allFields, ['proxyHost', 'proxy_ip', 'realProxyHost', 'httpProxyHost']));
  const proxyPort = val(res.proxy?.port, deepFind(res.allFields, ['proxyPort', 'realProxyPort', 'httpProxyPort']));
  const sshHost = val(res.ssh?.host, deepFind(res.allFields, ['sshHost', 'sshServer', 'ssh_host']));
  const sshPort = val(res.ssh?.port, deepFind(res.allFields, ['sshPort', 'sshServerPort', 'ssh_port']));
  const sshUser = val(res.ssh?.user, deepFind(res.allFields, ['sshUser', 'sshUsername', 'username', 'user', 'login']));
  const sshPass = val(res.ssh?.pass, deepFind(res.allFields, ['sshPass', 'sshPassword', 'password', 'pass', 'pwd']));
  const payload = val(res.payload, deepFind(res.allFields, ['payload', 'customPayload', 'requestPayload', 'rawPayload']));
  const dns = Array.isArray(res.dns) ? res.dns.filter(Boolean).join(', ') : val(res.dns, deepFind(res.allFields, ['dns', 'dns1', 'dns2']));
  const arch = detectArchitecture({ ...res, host, port, sni });

  const isPartial = res.success === false || res.partial || res.protected;
  let text = `🔓 *VPN DECRYPTER — DARK ENGINE*\n`;
  text += `━━━━━━━━━━━━━━━━━━━━\n`;
  text += `${isPartial ? '⚠️' : '✅'} *Status:* ${isPartial ? 'Parcial / protegido' : 'Extração concluída'}\n`;
  text += `📂 *Arquivo:* ${res.fileName || res.configName || 'clipboard'}\n`;
  text += `🛠️ *Formato:* ${res.format || res.configType || 'AUTO'}\n`;
  text += `📱 *App:* ${res.appName || res.configType || 'Indeterminado'}\n`;
  text += `🏗️ *Estrutura:* ${arch}\n`;
  if (res.note) text += `📝 *Nota:* ${clip(res.note, 500)}\n`;

  text += section('🌐 *SERVIDOR / REDE*', [
    host && `├ 🖥️ *Host/IP:* \`${host}\``,
    port && `├ 🔌 *Porta:* \`${port}\``,
    sni && `├ 🎯 *SNI:* \`${sni}\``,
    bugHost && `├ 🐞 *BugHost:* \`${bugHost}\``,
    dns && `├ 🧭 *DNS:* \`${dns}\``,
    res.mode && `├ 🔀 *Modo:* ${res.mode}`,
    res.protocol && `└ ⚙️ *Protocolo:* ${res.protocol}`,
  ]);

  text += section('🧩 *PROXY*', [
    (proxyHost || proxyPort) && `├ 🌍 *Proxy:* \`${proxyHost || '-'}:${proxyPort || '-'}\``,
    res.proxy?.type && `├ 🧱 *Tipo:* ${res.proxy.type}`,
    res.proxy?.user && `├ 👤 *Proxy User:* \`${res.proxy.user}\``,
    res.proxy?.pass && `└ 🔑 *Proxy Pass:* \`${res.proxy.pass}\``,
  ]);

  text += section('🔐 *SSH / LOGIN*', [
    (sshHost || sshPort) && `├ 🖥️ *SSH Host:* \`${sshHost || host || '-'}:${sshPort || port || '22'}\``,
    sshUser && `├ 👤 *User:* \`${sshUser}\``,
    sshPass && `└ 🔑 *Senha:* \`${sshPass}\``,
  ]);

  if (res.vmess) text += codeBlock('🧬 *VMess / V2Ray*', res.vmess, 1800);
  if (res.vless) text += codeBlock('🧬 *VLess / Xray*', res.vless, 1800);
  if (res.trojan) text += codeBlock('🧬 *Trojan*', res.trojan, 1600);
  if (res.shadowsocks) text += codeBlock('🧬 *Shadowsocks*', res.shadowsocks, 1600);
  if (res.wireguard) text += codeBlock('🧬 *WireGuard*', res.wireguard, 2200);
  if (res.openvpn) text += codeBlock('🧬 *OpenVPN*', res.openvpn, 2200);
  if (payload) text += codeBlock('📑 *PAYLOAD COMPLETO*', payload, 3500);

  const flat = flatten(res.allFields || res.rawConfig || res.raw || {});
  const important = Object.entries(flat)
    .filter(([k, v]) => val(v) && /host|server|ip|port|sni|payload|proxy|ssh|user|pass|uuid|id|path|bug|dns|mode|proto|tls|ssl|vless|vmess|trojan|wireguard|openvpn/i.test(k))
    .slice(0, 80)
    .map(([k, v]) => `${k}: ${str(v).replace(/\n/g, ' ').slice(0, 300)}`)
    .join('\n');
  if (important) text += codeBlock('🧾 *CAMPOS BRUTOS IMPORTANTES*', important, 3500);

  if (res.protection) text += codeBlock('🛡️ *PROTEÇÃO DETECTADA*', res.protection, 1200);

  text += `\n━━━━━━━━━━━━━━━━━━━━\n`;
  text += `⚡ *${config.bot?.name || 'DARK BOT'}* — ${config.owner?.name || 'Dark Net'}`;
  return text;
}

module.exports = { formatForWhatsApp };
