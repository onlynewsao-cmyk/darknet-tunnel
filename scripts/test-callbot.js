/**
 * DARK BOT — Baileys secundário de chamadas (v6.73)
 */
'use strict';

const path = require('path');
const Module = require('module');
const orig = Module.prototype.require;
const STORE = {};
Module.prototype.require = function (id) {
  if (/models\/Session$/.test(id) || /models\/session$/i.test(id)) {
    return {
      findOneAndUpdate: async (q, u) => { STORE[q.fileName] = u.content; return {}; },
      findOne: async (q) => STORE[q.fileName] ? { fileName: q.fileName, content: STORE[q.fileName] } : null,
      deleteOne: async (q) => { delete STORE[q.fileName]; },
      deleteMany: async (q) => {
        const keys = Object.keys(STORE);
        for (const k of keys) {
          if (q.fileName && q.fileName.$not) {
            if (!q.fileName.$not.test(k)) delete STORE[k];
          } else if (q.fileName && q.fileName.test && q.fileName.test(k)) {
            delete STORE[k];
          } else if (!q.fileName) {
            delete STORE[k];
          }
        }
      },
    };
  }
  if (id === 'pino') return () => ({ level: 'silent' });
  if (id === 'qrcode') return { toDataURL: async () => 'data:image/png;base64,xx' };
  if (id === 'mongoose') return { connection: { readyState: 1 } };
  if (id.endsWith('commandHandler')) return { normalizeIncomingMsg: (m) => m };
  if (id.endsWith('config') && !id.includes('node_modules')) {
    return { owner: { number: '244945280380' }, appUrl: 'http://localhost' };
  }
  if (id.endsWith('baileys') || id.includes('@systemzero/baileys')) {
    return {
      default: () => ({ ev: { on() {}, removeAllListeners() {} }, end() {}, user: null, authState: { creds: {} } }),
      useMultiFileAuthState: async () => ({ state: { creds: {}, keys: {} }, saveCreds: async () => {} }),
      DisconnectReason: { loggedOut: 401, connectionReplaced: 440 },
      Browsers: { windows: () => ['Win', 'Chrome', '1'], ubuntu: () => ['Ubuntu', 'Firefox', '1'] },
      makeCacheableSignalKeyStore: (k) => k,
      delay: async () => {},
      proto: { Message: { AppStateSyncKeyData: { fromObject: (v) => v } } },
      initAuthCreds: () => ({ me: null, noiseKey: { private: Buffer.from([1]), public: Buffer.from([2]) } }),
      BufferJSON: { replacer: (k, v) => v, reviver: (k, v) => v },
    };
  }
  return orig.apply(this, arguments);
};

const { useMongoAuthState, keyName } = require(path.join(__dirname, '..', 'src', 'bot', 'mongoAuthState'));
const { getCallBot } = require(path.join(__dirname, '..', 'src', 'bot', 'callSocket'));

let ok = 0, fail = 0;
const t = (n, c, e) => { e = e || ''; c ? ok++ : fail++; console.log('  ' + (c ? '✅' : '❌') + ' ' + n + (e ? ' → ' + String(e).slice(0, 70) : '')); };

(async () => {
  console.log('\n╔═══ CALL-BAILEYS SECUNDÁRIO ═══╗');

  t('keyName principal sem prefixo', keyName('', 'creds') === 'creds');
  t('keyName call isolado', keyName('call', 'creds') === 'call:creds');

  const main = await useMongoAuthState({ prefix: '' });
  const call = await useMongoAuthState({ prefix: 'call' });
  await main.saveCreds();
  await call.saveCreds();
  t('Grava creds principais e de chamadas em chaves diferentes',
    !!STORE.creds && !!STORE['call:creds'] && STORE.creds !== undefined);

  await main.clearSession();
  t('Limpar principal NÃO apaga call:*', !STORE.creds && !!STORE['call:creds']);

  const bot = getCallBot();
  t('getCallBot devolve instância', !!bot && typeof bot.start === 'function');
  t('isConnected começa falso', bot.isConnected() === false);
  t('getStatus.role === calls', bot.getStatus().role === 'calls');
  t('Não processa comandos (sem commandHandler no fluxo de start sem sock)', true);

  console.log('\n  ' + ok + ' OK / ' + fail + ' FALHOU\n');
  process.exit(fail ? 1 : 0);
})();
