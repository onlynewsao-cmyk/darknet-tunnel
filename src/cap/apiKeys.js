// ─────────────────────────────────────────────────────────────
// v12.9.20 — CHAVES DE API 🔑: consumo EXTERNO das nossas APIs
// dk_<hex> · sha256 guardado (a chave só se vê UMA vez) · escopos
// ig | wa | sistema | ia | admin (admin passa em tudo) · contagem de usos
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FICHEIRO = path.join(process.cwd(), 'data', 'apikeys.json');
let _cache = null;

function carregar() {
  if (_cache) return _cache;
  try { _cache = JSON.parse(fs.readFileSync(FICHEIRO, 'utf8')); } catch { _cache = { chaves: [] }; }
  if (!_cache.chaves) _cache.chaves = [];
  return _cache;
}
function guardar() { try { fs.mkdirSync(path.dirname(FICHEIRO), { recursive: true }); fs.writeFileSync(FICHEIRO, JSON.stringify(_cache, null, 2)); } catch {} }

function gerar(nome, scopes) {
  const st = carregar();
  const chave = 'dk_' + crypto.randomBytes(24).toString('hex');
  const escopos = (Array.isArray(scopes) && scopes.length ? scopes : ['ig', 'wa', 'sistema', 'ia']).filter(s => ['ig', 'wa', 'sistema', 'ia', 'admin'].includes(s));
  const doc = {
    id: crypto.randomBytes(6).toString('hex'),
    nome: String(nome || 'chave').slice(0, 40),
    prefixo: chave.slice(0, 8) + '…' + chave.slice(-4),
    hash: crypto.createHash('sha256').update(chave).digest('hex'),
    scopes: escopos.includes('admin') ? ['admin'] : escopos,
    criada: Date.now(), ultimaVez: null, usos: 0, revogada: false,
  };
  st.chaves.push(doc);
  guardar();
  return { doc, chave };
}
function verificar(chave) {
  if (!chave || typeof chave !== 'string') return null;
  const h = crypto.createHash('sha256').update(chave).digest('hex');
  const st = carregar();
  const doc = st.chaves.find(k => k.hash === h && !k.revogada);
  if (!doc) return null;
  doc.usos++; doc.ultimaVez = Date.now();
  guardar();
  return doc;
}
function revogar(id) {
  const st = carregar();
  const doc = st.chaves.find(k => k.id === id);
  if (doc) { doc.revogada = true; guardar(); }
  return !!doc;
}
function listar() {
  return carregar().chaves.map(({ hash, ...r }) => r);
}
function temEscopo(doc, escopo) {
  if (!doc) return false;
  return doc.scopes.includes('admin') || doc.scopes.includes(escopo);
}
module.exports = { gerar, verificar, revogar, listar, temEscopo, carregar };
