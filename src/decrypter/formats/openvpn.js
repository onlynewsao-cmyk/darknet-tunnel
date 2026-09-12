/**
 * OpenVPN (.ovpn)
 */
async function parse(buffer, fileName) {
  const text = buffer.toString('utf-8');
  const lines = text.split(/\r?\n/);

  const directives = {};
  let inline = {};
  let currentInline = null;
  let currentContent = [];

  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('#') || t.startsWith(';')) continue;
    if (t.startsWith('<') && t.endsWith('>')) {
      const tag = t.slice(1, -1);
      if (tag.startsWith('/')) {
        if (currentInline === tag.slice(1)) {
          inline[currentInline] = currentContent.join('\n');
          currentInline = null;
          currentContent = [];
        }
      } else { currentInline = tag; currentContent = []; }
      continue;
    }
    if (currentInline) { currentContent.push(line); continue; }
    const parts = t.split(/\s+/);
    const key = parts[0];
    const val = parts.slice(1).join(' ');
    directives[key] = val;
  }

  const remote = (directives.remote || '').split(/\s+/);
  return {
    configName: (fileName || 'vpn').replace(/\.ovpn$/i, ''),
    configType: 'OpenVPN',
    appName: 'OpenVPN',
    mode: directives.dev || 'tun',

    host: remote[0] || '',
    port: remote[1] || '',

    openvpn: {
      proto: directives.proto || 'udp',
      remote: directives.remote || '',
      cipher: directives.cipher || '',
      auth: directives.auth || '',
      tlsAuth: !!directives['tls-auth'],
      authUserPass: !!directives['auth-user-pass'],
      ca: inline.ca || '',
      cert: inline.cert || '',
      key: inline.key || '',
      tlsCrypt: inline['tls-crypt'] || '',
      tlsAuthKey: inline['tls-auth'] || '',
    },

    dns: (directives['dhcp-option'] || '').includes('DNS')
      ? [directives['dhcp-option'].replace('DNS ', '')] : [],

    raw: text,
    allFields: { directives, inline },
  };
}

module.exports = { parse };
