/**
 * SSH / SSL config files (.ssh / .ssl)
 * Formato livre: chave: valor por linha, ou JSON, ou URI ssh://
 */
async function parse(buffer, fileName) {
  const text = buffer.toString('utf-8').trim();

  // URI ssh://user:pass@host:port
  if (text.startsWith('ssh://')) {
    const m = text.match(/ssh:\/\/(?:([^:@]+)(?::([^@]+))?@)?([^:/?#]+)(?::(\d+))?/);
    if (m) {
      return {
        configName: fileName,
        configType: 'SSH URI',
        appName: 'SSH',
        host: m[3], port: m[4] || '22',
        ssh: { host: m[3], port: m[4] || '22', user: m[1] || '', pass: m[2] || '' },
        raw: text,
      };
    }
  }

  // JSON
  if (text.startsWith('{')) {
    try {
      const data = JSON.parse(text);
      return {
        configName: data.name || fileName,
        configType: 'SSH Config',
        appName: 'SSH',
        host: data.host || data.server,
        port: data.port || 22,
        ssh: {
          host: data.host || data.sshHost,
          port: data.port || data.sshPort || 22,
          user: data.user || data.username,
          pass: data.pass || data.password,
        },
        proxy: data.proxy ? { host: data.proxy.host, port: data.proxy.port, type: 'HTTP' } : null,
        payload: data.payload || '',
        sni: data.sni || '',
        raw: data, allFields: data,
      };
    } catch (e) {}
  }

  // Linha por linha (chave: valor)
  const fields = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([^:=]+)[:=]\s*(.+)$/);
    if (m) fields[m[1].trim().toLowerCase()] = m[2].trim();
  }

  return {
    configName: fileName,
    configType: 'SSH Config',
    appName: 'SSH',
    host: fields.host || fields.server,
    port: fields.port || 22,
    ssh: {
      host: fields.host || fields['ssh host'],
      port: fields.port || fields['ssh port'] || 22,
      user: fields.user || fields.username,
      pass: fields.pass || fields.password,
    },
    proxy: fields['proxy host'] ? { host: fields['proxy host'], port: fields['proxy port'], type: 'HTTP' } : null,
    payload: fields.payload || '',
    sni: fields.sni || '',
    raw: text, allFields: fields,
  };
}

module.exports = { parse };
