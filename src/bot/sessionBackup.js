/**
 * v12.9.3 — GUARDAR SESSÃO (backup/restauro da sessão WhatsApp)
 * ═════════════════════════════════════════════════════════════
 * A sessão do WhatsApp (creds no MongoDB) é a coisa mais valiosa do bot:
 * perdê-la = re-emparelhar, QR de novo. Este módulo garante que NUNCA:
 *
 *  1. BACKUP AUTOMÁTICO — snapshot a cada 6h + no 'open' (1x/dia) para
 *     a colecção session_backups (rotativa: guarda as últimas 10).
 *  2. RESTAURO AUTOMÁTICO — se o bot arrancar e NÃO houver creds mas
 *     HOUVER backup, restaura sozinho (sem QR!).
 *  3. EXPORT/IMPORT — ficheiro JSON pra transferir entre servidores
 *     (.savesess gera, .loadsess restaura, ou pelo dashboard).
 *  4. INTEGRIDADE — valida que o backup tem noiseKey/signedIdentityKey
 *     antes de usar; backup corrupto é descartado.
 */
'use strict';

const Session = require('../database/models/Session');
const mongoose = require('mongoose');

const COLLECTION = 'session_backups';
const MAX_BACKUPS = 10;
const INTERVALO_MS = 6 * 60 * 60 * 1000; // 6h

function _modelo() {
  if (mongoose.models.SessionBackup) return mongoose.models.SessionBackup;
  const schema = new mongoose.Schema({
    criadoEm: { type: Date, default: Date.now, index: true },
    origem: { type: String, default: 'auto' },     // auto|manual|pre-clear|import
    numero: { type: String, default: '' },
    docs: { type: Number, default: 0 },
    valido: { type: Boolean, default: true },
    nota: { type: String, default: '' },
    dados: { type: Map, of: String },              // fileName → content
  }, { collection: COLLECTION });
  mongoose.model('SessionBackup', schema);
  return mongoose.models.SessionBackup;
}

/** Faz snapshot da sessão actual (creds + app-state + slots estacionadas). */
async function guardar(origem = 'auto', nota = '') {
  try {
    if (mongoose.connection.readyState !== 1) return { ok: false, motivo: 'sem-mongo' };
    const docs = await Session.find({}).lean();
    if (!docs.length) return { ok: false, motivo: 'sessao-vazia' };
    // valida: precisa dum doc creds com chaves de identidade
    const creds = docs.find((d) => /creds/.test(d.fileName));
    let valido = false;
    if (creds) {
      try {
        const j = JSON.parse(creds.content);
        valido = !!(j?.noiseKey && j?.signedIdentityKey);
      } catch { valido = false; }
    }
    const MB = _modelo();
    await MB.create({ origem, nota, valido, numero: '', docs: docs.length, dados: docs.map((d) => [d.fileName, d.content]) });
    // rotação: mantém só as últimas MAX_BACKUPS
    const velhos = await MB.find({}).sort({ criadoEm: -1 }).skip(MAX_BACKUPS).select('_id').lean();
    if (velhos.length) await MB.deleteMany({ _id: { $in: velhos.map((v) => v._id) } });
    console.log(`[SESSÃO-BACKUP] ✅ guardado (${docs.length} docs, ${valido ? 'válido' : 'SUSPEITO'}, origem: ${origem})`);
    return { ok: true, docs: docs.length, valido };
  } catch (e) { console.warn('[SESSÃO-BACKUP] erro ao guardar:', e.message); return { ok: false, motivo: e.message }; }
}

/** Lista os backups disponíveis (mais recentes primeiro). */
async function listar(limite = 10) {
  try {
    const MB = _modelo();
    return await MB.find({}).sort({ criadoEm: -1 }).limit(limite).select('criadoEm origem docs valido nota').lean();
  } catch { return []; }
}

/** Restaura o backup mais recente VÁLIDO (ou por id). Só se não houver creds! */
async function restaurar({ id = null, forcar = false } = {}) {
  try {
    if (mongoose.connection.readyState !== 1) return { ok: false, motivo: 'sem-mongo' };
    const temCreds = await Session.findOne({ fileName: 'creds' }).lean();
    if (temCreds && !forcar) return { ok: false, motivo: 'ja-tem-sessao', msg: 'O bot já tem sessão activa — nada restaurado (usa forcar=true pra sobrescrever).' };
    const MB = _modelo();
    const bk = id ? await MB.findById(id) : await MB.findOne({ valido: true }).sort({ criadoEm: -1 });
    if (!bk) return { ok: false, motivo: 'sem-backup' };
    let restaurados = 0;
    for (const [fileName, content] of (bk.dados || [])) {
      await Session.findOneAndUpdate({ fileName }, { content }, { upsert: true });
      restaurados++;
    }
    console.log(`[SESSÃO-BACKUP] ✅ restaurado backup de ${bk.criadoEm?.toISOString?.()} (${restaurados} docs)`);
    return { ok: true, restaurados, criadoEm: bk.criadoEm, origem: bk.origem };
  } catch (e) { return { ok: false, motivo: e.message }; }
}

/** Exporta a sessão como JSON portável (pro .savesess / dashboard). */
async function exportar() {
  if (mongoose.connection.readyState !== 1) return null;
  const docs = await Session.find({}).maxTimeMS(8000).lean().catch(() => []);
  if (!docs.length) return null;
  return { exportadoEm: new Date().toISOString(), tipo: 'darkbot-session', versao: 1, docs: docs.map((d) => ({ fileName: d.fileName, content: d.content })) };
}

/** Importa um JSON exportado (merge upsert). */
async function importar(data) {
  if (!data || data.tipo !== 'darkbot-session' || !Array.isArray(data.docs)) return { ok: false, motivo: 'formato-invalido' };
  let n = 0;
  for (const d of data.docs) {
    if (!d.fileName || !d.content) continue;
    await Session.findOneAndUpdate({ fileName: d.fileName }, { content: d.content }, { upsert: true });
    n++;
  }
  await guardar('import', `import com ${n} docs`);
  return { ok: true, importados: n };
}

let _timer = null;
let _ultimoAuto = 0;
/** Vigia: snapshot a cada 6h + no 'open' máx 1x/dia (chamar do connection=open). */
function arrancar() {
  if (_timer) return;
  _timer = setInterval(() => guardar('auto').catch(() => {}), INTERVALO_MS);
  if (_timer.unref) _timer.unref();
  // restaura no boot se preciso (async, sem bloquear)
  restaurar().then((r) => {
    if (r.ok) console.log('[SESSÃO-BACKUP] 🔁 sessão restaurada do backup no arranque — sem QR!');
  }).catch(() => {});
  guardar('auto').catch(() => {}); // primeiro snapshot
}

/** Gancho pro 'connection open' — no máx 1 snapshot/dia. */
function abrir() {
  const agora = Date.now();
  if (agora - _ultimoAuto > 24 * 60 * 60 * 1000) {
    _ultimoAuto = agora;
    guardar('open').catch(() => {});
  }
}

module.exports = { guardar, listar, restaurar, exportar, importar, arrancar, abrir };
