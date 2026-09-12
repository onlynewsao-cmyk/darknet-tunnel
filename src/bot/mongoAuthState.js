/**
 * Auth state do Baileys persistido no MongoDB.
 * prefix: '' → sessão principal (creds)
 * prefix: 'call' → Baileys secundário de chamadas (call:creds)
 * As duas sessões NÃO se misturam — são dois aparelhos ligados.
 */
const { proto, initAuthCreds, BufferJSON } = require('@systemzero/baileys');
const Session = require('../database/models/Session');

function keyName(prefix, fileName) {
  return prefix ? `${prefix}:${fileName}` : fileName;
}

async function useMongoAuthState({ prefix = '' } = {}) {
  const p = String(prefix || '');

  async function writeData(data, fileName) {
    const content = JSON.stringify(data, BufferJSON.replacer);
    await Session.findOneAndUpdate(
      { fileName: keyName(p, fileName) },
      { content },
      { upsert: true }
    );
  }

  async function readData(fileName) {
    try {
      const doc = await Session.findOne({ fileName: keyName(p, fileName) });
      if (!doc) return null;
      return JSON.parse(doc.content, BufferJSON.reviver);
    } catch { return null; }
  }

  async function removeData(fileName) {
    try { await Session.deleteOne({ fileName: keyName(p, fileName) }); } catch {}
  }

  const creds = (await readData('creds')) || initAuthCreds();

  return {
    prefix: p,
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          await Promise.all(ids.map(async (id) => {
            let value = await readData(`${type}-${id}`);
            if (type === 'app-state-sync-key' && value) {
              value = proto.Message.AppStateSyncKeyData.fromObject(value);
            }
            data[id] = value;
          }));
          return data;
        },
        set: async (data) => {
          const tasks = [];
          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id];
              const fileName = `${category}-${id}`;
              tasks.push(value ? writeData(value, fileName) : removeData(fileName));
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: async () => writeData(creds, 'creds'),
    clearSession: async () => {
      if (p) {
        console.log(`🧹 Limpando sessão ${p}:* no MongoDB...`);
        await Session.deleteMany({ fileName: new RegExp('^' + p + ':') });
      } else {
        console.log('🧹 Limpando sessão principal do WhatsApp (sem prefixo)...');
        await Session.deleteMany({ fileName: { $not: /:/ } });
      }
    },
  };
}

module.exports = { useMongoAuthState, keyName };
