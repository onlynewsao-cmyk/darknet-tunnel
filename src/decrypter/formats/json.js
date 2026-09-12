/**
 * JSON genérico - tenta detectar campos comuns
 */
const { findInJson } = require('./_util');

async function parse(buffer, fileName) {
  const data = JSON.parse(buffer.toString('utf-8'));
  const find = findInJson(data);

  // Detecta V2Ray / VMess JSON
  if (data.v || data.vnext || data.outbounds) {
    return parseV2Ray(data, fileName);
  }

  return {
    configName: find('name', 'configName', 'profile_name') || fileName,
    configType: 'JSON',
    appName: find('app', 'appName') || 'Genérico',
    mode: find('mode', 'type', 'protocol'),
    note: find('note', 'description'),

    host: find('host', 'server', 'proxy_host', 'proxy_ip', 'address', 'remote_proxy'),
    port: find('port', 'serverPort', 'proxyPort', 'proxy_port'),

    ssh: {
      host: find('sshHost', 'ssh_host'),
      port: find('sshPort', 'ssh_port'),
      user: find('sshUser', 'ssh_user', 'username'),
      pass: find('sshPass', 'ssh_pass', 'password'),
    },

    proxy: {
      host: find('proxyHost', 'proxy_host'),
      port: find('proxyPort', 'proxy_port'),
      type: find('proxyType', 'proxy_type') || 'HTTP',
      user: find('proxyUser', 'proxy_user'),
      pass: find('proxyPass', 'proxy_pass'),
    },

    payload: find('payload', 'custom_payload', 'request_payload'),
    sni: find('sni', 'sni_host', 'tls_sni'),
    dns: [find('dns', 'dnsServer')].filter(Boolean),

    raw: data, allFields: data,
  };
}

function parseV2Ray(data, fileName) {
  const out = data.outbounds?.[0] || data;
  const vnext = out.settings?.vnext?.[0] || data.vnext?.[0];
  const user = vnext?.users?.[0] || {};
  return {
    configName: fileName,
    configType: 'V2Ray Config',
    appName: 'V2Ray',
    mode: out.protocol || 'vmess',
    host: vnext?.address || '',
    port: vnext?.port || '',
    vmess: {
      uuid: user.id || '',
      alterId: user.alterId,
      security: user.security || 'auto',
      network: out.streamSettings?.network || 'tcp',
      tls: out.streamSettings?.security || 'none',
      sni: out.streamSettings?.tlsSettings?.serverName || '',
      path: out.streamSettings?.wsSettings?.path || '',
      host: out.streamSettings?.wsSettings?.headers?.Host || '',
    },
    sni: out.streamSettings?.tlsSettings?.serverName || '',
    raw: data, allFields: data,
  };
}

module.exports = { parse };
