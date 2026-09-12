/**
 * Texto genérico — extrai URIs vmess://, vless://, trojan://, ss://, ssh://
 */
const { findInJson } = require('./_util');

async function parse(buffer, fileName) {
  const text = buffer.toString('utf-8').trim();

  // vmess://
  if (text.startsWith('vmess://')) {
    try {
      const b64 = text.replace('vmess://', '').trim();
      const data = JSON.parse(Buffer.from(b64, 'base64').toString('utf-8'));
      return {
        configName: data.ps || fileName,
        configType: 'VMess URI',
        appName: 'V2Ray',
        host: data.add, port: data.port,
        vmess: {
          uuid: data.id, alterId: data.aid, security: data.scy || 'auto',
          network: data.net || 'tcp', tls: data.tls || '',
          sni: data.sni || '', path: data.path || '', host: data.host || '',
        },
        sni: data.sni || '', raw: data, allFields: data,
      };
    } catch (e) {}
  }

  // vless://
  if (text.startsWith('vless://')) {
    const m = text.match(/^vless:\/\/([^@]+)@([^:]+):(\d+)\??(.*?)(?:#(.+))?$/);
    if (m) {
      const params = parseQs(m[4]);
      return {
        configName: decodeURIComponent(m[5] || ''),
        configType: 'VLess URI', appName: 'V2Ray',
        host: m[2], port: m[3],
        vless: {
          uuid: m[1], encryption: params.encryption || 'none',
          security: params.security || '', sni: params.sni || '',
          type: params.type || 'tcp', host: params.host || '', path: params.path || '',
          fp: params.fp || '', flow: params.flow || '',
        },
        sni: params.sni || '', allFields: params,
      };
    }
  }

  // trojan://
  if (text.startsWith('trojan://')) {
    const m = text.match(/^trojan:\/\/([^@]+)@([^:]+):(\d+)\??(.*?)(?:#(.+))?$/);
    if (m) {
      const params = parseQs(m[4]);
      return {
        configName: decodeURIComponent(m[5] || ''),
        configType: 'Trojan URI', appName: 'Trojan',
        host: m[2], port: m[3],
        trojan: { password: m[1], sni: params.sni || params.peer || '', type: params.type || 'tcp' },
        sni: params.sni || params.peer || '', allFields: params,
      };
    }
  }

  // ss://
  if (text.startsWith('ss://')) {
    const m = text.match(/^ss:\/\/([^@]+)@([^:]+):(\d+)(?:#(.+))?$/);
    if (m) {
      let cred = m[1];
      try { cred = Buffer.from(cred, 'base64').toString('utf-8'); } catch (e) {}
      const [method, password] = cred.split(':');
      return {
        configName: decodeURIComponent(m[4] || ''),
        configType: 'Shadowsocks URI', appName: 'Shadowsocks',
        host: m[2], port: m[3],
        shadowsocks: { method, password, server: m[2], port: m[3] },
      };
    }
  }

  // ssh://
  if (text.startsWith('ssh://')) {
    const m = text.match(/ssh:\/\/(?:([^:@]+)(?::([^@]+))?@)?([^:/?#]+)(?::(\d+))?/);
    if (m) {
      return {
        configName: fileName, configType: 'SSH URI', appName: 'SSH',
        host: m[3], port: m[4] || '22',
        ssh: { host: m[3], port: m[4] || '22', user: m[1] || '', pass: m[2] || '' },
      };
    }
  }

  // Texto livre - tenta extrair campos
  const fields = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([^:=]+)[:=]\s*(.+)$/);
    if (m) fields[m[1].trim().toLowerCase()] = m[2].trim();
  }
  if (Object.keys(fields).length) {
    return {
      configName: fileName, configType: 'Texto', appName: 'Genérico',
      host: fields.host || fields.server || '',
      port: fields.port || '',
      ssh: { host: fields.host, port: fields.port, user: fields.user || fields.username, pass: fields.pass || fields.password },
      proxy: fields['proxy host'] ? { host: fields['proxy host'], port: fields['proxy port'] || '8080' } : null,
      payload: fields.payload || '',
      sni: fields.sni || '',
      allFields: fields, raw: text,
    };
  }

  return {
    configName: fileName, configType: 'Texto', appName: 'Desconhecido',
    note: 'Formato de texto livre - nenhum padrão reconhecido',
    raw: text.slice(0, 5000),
  };
}

function parseQs(qs) {
  const out = {};
  if (!qs) return out;
  for (const pair of qs.split('&')) {
    const [k, v] = pair.split('=');
    if (k) out[decodeURIComponent(k)] = decodeURIComponent(v || '');
  }
  return out;
}

module.exports = { parse };
