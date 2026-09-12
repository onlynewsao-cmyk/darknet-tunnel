/**
 * WireGuard (.conf)
 * Formato INI: [Interface] e [Peer]
 */
async function parse(buffer, fileName) {
  const text = buffer.toString('utf-8');
  const sections = parseINI(text);

  const iface = sections['Interface'] || {};
  const peer = sections['Peer'] || {};

  return {
    configName: (fileName || 'wg0').replace(/\.conf$/i, ''),
    configType: 'WireGuard',
    appName: 'WireGuard',
    mode: 'WireGuard',

    host: (peer.Endpoint || '').split(':')[0] || '',
    port: (peer.Endpoint || '').split(':')[1] || '',

    wireguard: {
      privateKey: iface.PrivateKey || '',
      publicKey: peer.PublicKey || '',
      presharedKey: peer.PresharedKey || '',
      address: iface.Address || '',
      dns: iface.DNS || '',
      mtu: iface.MTU || '',
      endpoint: peer.Endpoint || '',
      allowedIPs: peer.AllowedIPs || '',
      persistentKeepalive: peer.PersistentKeepalive || '',
    },

    dns: (iface.DNS || '').split(',').map(s => s.trim()).filter(Boolean),
    raw: text,
    allFields: { Interface: iface, Peer: peer },
  };
}

function parseINI(text) {
  const result = {};
  let cur = null;
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#') || t.startsWith(';')) continue;
    const sec = t.match(/^\[(.+)\]$/);
    if (sec) { cur = sec[1].trim(); result[cur] = {}; continue; }
    const kv = t.split('=');
    if (kv.length >= 2 && cur) {
      result[cur][kv[0].trim()] = kv.slice(1).join('=').trim();
    }
  }
  return result;
}

module.exports = { parse };
