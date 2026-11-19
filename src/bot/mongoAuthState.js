/**
 * Auth state do Baileys persistido no MongoDB.
 * prefix: '' → sessão principal (creds)
 * prefix: 'call' → Baileys secundário de chamadas (call:creds)
 * As duas sessões NÃO se misturam — são dois aparelhos ligados.
 */
const { proto, initAuthCreds, BufferJSON } = require('baileys-v6');
const Session = require('../database/models/Session');

function keyName(prefix, fileName) {
  return prefix ? `${prefix}:${fileName}` : fileName;
}

/** v7.91 — MIGRAÇÃO ÚNICA: o repo antigo (sytem-dark-bot v1.0.0) guardava a
 * sessão na COLECÇÃO CRUA `baileys_auth` (docs {_id, value}); o nosso modelo
 * é Session {fileName, content}. Copiamos 1 vez e a sessão do WhatsApp
 * SOBREVIVE à troca de código — sem re-emparelhar. Idempotente. */
async function _migrarSessaoAntiga() {
  try {
    if (await Session.findOne({ fileName: 'creds' })) return; // já temos creds
    const mongoose = require('mongoose');
    const bd = mongoose.connection?.db;
    if (!bd) return;
    const col = bd.collection('baileys_auth');
    const docs = await col.find({}).limit(500).toArray().catch(() => []);
    if (!docs.length) return;
    let mig = 0;
    for (const d of docs) {
      const fn = String(d?._id || ''); const val = String(d?.value || '');
      if (!fn || !val) continue;
      await Session.findOneAndUpdate({ fileName: fn }, { content: val }, { upsert: true });
      mig++;
    }
    console.log(`[AUTH] ✅ sessão antiga migrada de baileys_auth (${mig} docs) — sem re-emparelhar`);
    try { await bd.collection('baileys_auth_migrada').insertMany(docs.map(d => ({ ...d, migradoEm: new Date() })), { ordered: false }); } catch {}
  } catch (e) { console.warn('[AUTH] migração sessão antiga: ' + String(e?.message || e).slice(0, 80)); }
}

async function useMongoAuthState({ prefix = '' } = {}) {
  const p = String(prefix || '');
  if (!p) await _migrarSessaoAntiga();   // só a sessão principal migra

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
