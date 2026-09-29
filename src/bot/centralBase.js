/**
 * v12.9.11 — BASE CENTRAL DE CONTACTOS 🕸️
 * Contactos capturados dos grupos (sem duplicados) + grupos conhecidos.
 * Persistência: data/central/base.json + espelho em BotConfig
 * (o dashboard lê a mesma base — ambos os lados actualizados).
 */
'use strict';
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data', 'central');
const BASE_FILE = path.join(DATA_DIR, 'base.json');

const state = { grupos: {}, contactos: {}, UpdatedAt: 0 };
let _loaded = false;

function carregar() {
  if (_loaded) return state;
  _loaded = true;
  try {
    if (fs.existsSync(BASE_FILE)) Object.assign(state, JSON.parse(fs.readFileSync(BASE_FILE, 'utf8')));
  } catch (e) { console.warn('[CENTRAL] base corrompida, a recomeçar:', e.message); }
  return state;
}

// ═══ v12.9.36 — ESCALA 1M+ ═══════════════════════════════════
// JSON.stringify de 1M contactos ≈ 500MB numa string → rebenta. A base
// passa a persistir no MONGODB (bulkWrite dos SÓ os alterados, em lotes);
// o ficheiro JSON fica como fallback apenas para bases pequenas (<150k).
let _modoMongo = false;
const _dirty = new Set();           // nums alterados desde o último flush
let _flushT = null;
let _avisoFile = false;
function _marcarSujo(num) { _dirty.add(num); }

async function _flushMongo() {
  clearTimeout(_flushT); _flushT = null;
  if (!_modoMongo || !_dirty.size) return;
  const CC = require('../database/models/CentralContacto');
  const nums = [..._dirty]; _dirty.clear();
  const ops = [];
  for (const num of nums) {
    const c = state.contactos[num];
    if (!c) { ops.push({ deleteOne: { filter: { num } } }); continue; }
    ops.push({ updateOne: { filter: { num }, update: { $set: { num, nome: c.nome || '', jid: c.jid || '', grupos: c.grupos || {}, slots: c.slots || {}, ddi: c.ddd?.ddi || '?', pais: c.ddd?.pais || 'Desconhecido', ddd: c.ddd?.ddd || '-', addedAt: c.addedAt || 0, ts: c.ts || 0 } }, upsert: true } });
  }
  for (let i = 0; i < ops.length; i += 500) {
    try { await CC.bulkWrite(ops.slice(i, i + 500), { ordered: false }); }
    catch (e) { console.warn('[CENTRAL] flush mongo:', String(e.message).slice(0, 60)); }
  }
}

function guardar() {
  state.UpdatedAt = Date.now();
  if (_modoMongo) {
    // lotes de 500 dos alterados — nunca serializa a base inteira
    if (!_flushT) _flushT = setTimeout(() => { _flushT = null; _flushMongo().catch(() => {}); }, 2000);
    return;
  }
  if (Object.keys(state.contactos).length > 150000) {
    if (!_avisoFile) { _avisoFile = true; console.warn('[CENTRAL] base >150k e sem mongo — file save ignorado (protecção RAM). Liga o MongoDB.'); }
    return;
  }
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(BASE_FILE + '.tmp', JSON.stringify(state));
    fs.renameSync(BASE_FILE + '.tmp', BASE_FILE);   // v12.9.34: atómica — base grande nunca corrompida a meio
  } catch (e) { console.warn('[CENTRAL] save:', e.message); }
  clearTimeout(_t);
  _t = setTimeout(() => {
    try { require('../database/models/BotConfig').set('central_base', { contactos: state.contactos, grupos: state.grupos, UpdatedAt: state.UpdatedAt }).catch(() => {}); } catch {}
  }, 600);
}
let _t = null;

// arranque (chamado do index.js depois do connectDB): carrega TODOS os
// contactos do mongo por CURSOR (streaming — sem string gigante)
async function carregarMongo() {
  try {
    const mongoose = require('mongoose');
    if (mongoose.connection?.readyState !== 1) return false;
    const CC = require('../database/models/CentralContacto');
    const total = await CC.countDocuments();
    if (!total) { _modoMongo = true; return true; }
    const cursor = CC.find({}).lean().cursor();
    let n = 0;
    for (let doc = await cursor.next(); doc; doc = await cursor.next()) {
      state.contactos[doc.num] = { nome: doc.nome || '', jid: doc.jid || doc.num + '@s.whatsapp.net', grupos: doc.grupos || {}, slots: doc.slots || {}, addedAt: doc.addedAt || 0, ts: doc.ts || 0, ddd: { ddi: doc.ddi || '?', pais: doc.pais || 'Desconhecido', ddd: doc.ddd || '-', rotulo: ('+' + (doc.ddi || '?') + ' ' + (doc.ddd || '')).trim() } };
      n++;
    }
    _modoMongo = true; _loaded = true;
    console.log('[CENTRAL] base do MONGODB: ' + n + ' contactos (escala 1M+ ok)');
    return true;
  } catch (e) { console.warn('[CENTRAL] carregarMongo:', String(e.message).slice(0, 60)); return false; }
}
function modoMongo() { return _modoMongo; }

// ── v12.9.23 — DDD & PAÍS 🌍 ────────────────────────────────
// O "DDD" internacional = país + código de área. Tabela dos códigos
// mais comuns na base (Angola, Brasil, Portugal, etc.).
// v12.9.36: 66 países REAIS (ddi correctos; 3-dígitos primeiro — o matching é startsWith)
// Ordinais importam: nunca pôr '1' antes de '124…' etc. '35' genérico REMOVIDO (era falso).
const PAISES = [
  { ddi: '244', pais: 'Angola', ddds: { '9': 'Móvel', '2': 'Fixo' } },
  { ddi: '55', pais: 'Brasil', ddds: null }, // 2 dígitos de DDD após o 55
  { ddi: '351', pais: 'Portugal', ddds: { '9': 'Móvel', '2': 'Fixo' } },
  { ddi: '243', pais: 'RD Congo', ddds: { '8': 'Móvel', '9': 'Móvel' } },
  { ddi: '242', pais: 'Congo', ddds: { '0': 'Móvel' } },
  { ddi: '245', pais: 'Guiné-Bissau', ddds: { '9': 'Móvel', '6': 'Móvel' } },
  { ddi: '238', pais: 'Cabo Verde', ddds: { '9': 'Móvel', '2': 'Fixo' } },
  { ddi: '258', pais: 'Moçambique', ddds: { '8': 'Móvel', '2': 'Fixo' } },
  { ddi: '239', pais: 'S. Tomé e Príncipe', ddds: { '9': 'Móvel' } },
  { ddi: '264', pais: 'Namíbia', ddds: { '8': 'Móvel' } },
  { ddi: '27', pais: 'África do Sul', ddds: null },
  { ddi: '234', pais: 'Nigéria', ddds: { '7': 'Móvel', '8': 'Móvel', '9': 'Móvel' } },
  { ddi: '233', pais: 'Gana', ddds: { '2': 'Móvel', '5': 'Móvel' } },
  { ddi: '225', pais: 'Costa do Marfim', ddds: { '0': 'Móvel' } },
  { ddi: '221', pais: 'Senegal', ddds: { '7': 'Móvel' } },
  { ddi: '237', pais: 'Camarões', ddds: { '6': 'Móvel' } },
  { ddi: '241', pais: 'Gabão', ddds: { '6': 'Móvel', '7': 'Móvel' } },
  { ddi: '212', pais: 'Marrocos', ddds: { '6': 'Móvel', '7': 'Móvel' } },
  { ddi: '213', pais: 'Argélia', ddds: { '5': 'Móvel', '6': 'Móvel', '7': 'Móvel' } },
  { ddi: '216', pais: 'Tunísia', ddds: { '2': 'Móvel', '9': 'Móvel' } },
  { ddi: '20', pais: 'Egipto', ddds: { '1': 'Móvel' } },
  { ddi: '254', pais: 'Quénia', ddds: { '7': 'Móvel', '1': 'Móvel' } },
  { ddi: '255', pais: 'Tanzânia', ddds: { '6': 'Móvel', '7': 'Móvel' } },
  { ddi: '256', pais: 'Uganda', ddds: { '7': 'Móvel' } },
  { ddi: '251', pais: 'Etiópia', ddds: { '9': 'Móvel', '7': 'Móvel' } },
  { ddi: '260', pais: 'Zâmbia', ddds: { '9': 'Móvel', '7': 'Móvel' } },
  { ddi: '263', pais: 'Zimbabué', ddds: { '7': 'Móvel' } },
  { ddi: '267', pais: 'Botswana', ddds: { '7': 'Móvel' } },
  { ddi: '230', pais: 'Maurícias', ddds: { '5': 'Móvel' } },
  { ddi: '223', pais: 'Mali', ddds: { '7': 'Móvel', '8': 'Móvel', '9': 'Móvel' } },
  { ddi: '226', pais: 'Burquina Faso', ddds: { '6': 'Móvel', '7': 'Móvel' } },
  { ddi: '227', pais: 'Níger', ddds: { '8': 'Móvel', '9': 'Móvel' } },
  { ddi: '228', pais: 'Togo', ddds: { '9': 'Móvel' } },
  { ddi: '229', pais: 'Benim', ddds: { '9': 'Móvel' } },
  { ddi: '249', pais: 'Sudão', ddds: { '9': 'Móvel' } },
  { ddi: '252', pais: 'Somália', ddds: { '6': 'Móvel', '7': 'Móvel' } },
  { ddi: '1', pais: 'EUA/Canadá', ddds: null },
  { ddi: '44', pais: 'Reino Unido', ddds: { '7': 'Móvel' } },
  { ddi: '33', pais: 'França', ddds: { '6': 'Móvel', '7': 'Móvel' } },
  { ddi: '34', pais: 'Espanha', ddds: { '6': 'Móvel', '7': 'Móvel' } },
  { ddi: '39', pais: 'Itália', ddds: { '3': 'Móvel' } },
  { ddi: '49', pais: 'Alemanha', ddds: { '15': 'Móvel', '16': 'Móvel', '17': 'Móvel' } },
  { ddi: '31', pais: 'Holanda', ddds: { '6': 'Móvel' } },
  { ddi: '32', pais: 'Bélgica', ddds: { '4': 'Móvel' } },
  { ddi: '352', pais: 'Luxemburgo', ddds: { '6': 'Móvel' } },
  { ddi: '353', pais: 'Irlanda', ddds: { '8': 'Móvel' } },
  { ddi: '358', pais: 'Finlândia', ddds: { '4': 'Móvel', '5': 'Móvel' } },
  { ddi: '41', pais: 'Suíça', ddds: { '7': 'Móvel' } },
  { ddi: '43', pais: 'Áustria', ddds: { '6': 'Móvel' } },
  { ddi: '46', pais: 'Suécia', ddds: { '7': 'Móvel' } },
  { ddi: '47', pais: 'Noruega', ddds: { '4': 'Móvel', '9': 'Móvel' } },
  { ddi: '45', pais: 'Dinamarca', ddds: { '2': 'Móvel', '3': 'Móvel' } },
  { ddi: '48', pais: 'Polónia', ddds: { '5': 'Móvel', '6': 'Móvel', '7': 'Móvel' } },
  { ddi: '40', pais: 'Roménia', ddds: { '7': 'Móvel' } },
  { ddi: '380', pais: 'Ucrânia', ddds: { '6': 'Móvel', '7': 'Móvel', '9': 'Móvel' } },
  { ddi: '7', pais: 'Rússia/Cazaquistão', ddds: { '9': 'Móvel', '7': 'Móvel' } },
  { ddi: '90', pais: 'Turquia', ddds: { '5': 'Móvel' } },
  { ddi: '86', pais: 'China', ddds: { '1': 'Móvel' } },
  { ddi: '91', pais: 'Índia', ddds: { '6': 'Móvel', '7': 'Móvel', '8': 'Móvel', '9': 'Móvel' } },
  { ddi: '92', pais: 'Paquistão', ddds: { '3': 'Móvel' } },
  { ddi: '971', pais: 'E.A.U.', ddds: { '5': 'Móvel' } },
  { ddi: '966', pais: 'Arábia Saudita', ddds: { '5': 'Móvel' } },
  { ddi: '974', pais: 'Catar', ddds: { '3': 'Móvel', '6': 'Móvel', '7': 'Móvel' } },
  { ddi: '52', pais: 'México', ddds: null },
  { ddi: '54', pais: 'Argentina', ddds: { '9': 'Móvel' } },
  { ddi: '57', pais: 'Colômbia', ddds: { '3': 'Móvel' } },
  { ddi: '56', pais: 'Chile', ddds: { '9': 'Móvel' } },
  { ddi: '51', pais: 'Perú', ddds: { '9': 'Móvel' } },
  { ddi: '58', pais: 'Venezuela', ddds: { '4': 'Móvel' } },
  { ddi: '593', pais: 'Equador', ddds: { '9': 'Móvel' } },
  { ddi: '61', pais: 'Austrália', ddds: { '4': 'Móvel' } },
  { ddi: '65', pais: 'Singapura', ddds: { '8': 'Móvel', '9': 'Móvel' } },
  { ddi: '60', pais: 'Malásia', ddds: { '1': 'Móvel' } },
  { ddi: '62', pais: 'Indonésia', ddds: { '8': 'Móvel' } },
  { ddi: '66', pais: 'Tailândia', ddds: { '6': 'Móvel', '8': 'Móvel', '9': 'Móvel' } },
  { ddi: '81', pais: 'Japão', ddds: { '7': 'Móvel', '8': 'Móvel', '9': 'Móvel' } },
  { ddi: '82', pais: 'Coreia do Sul', ddds: { '1': 'Móvel' } },
  { ddi: '852', pais: 'Hong Kong', ddds: { '5': 'Móvel', '6': 'Móvel', '9': 'Móvel' } },
];
function dddDe(num) {
  const s = String(num || '').replace(/\D/g, '');
  for (const p of PAISES) {
    if (s.startsWith(p.ddi)) {
      const resto = s.slice(p.ddi.length);
      if (!resto) continue;
      let area = '';
      if (p.ddi === '55' && resto.length >= 2) area = resto.slice(0, 2);            // Brasil: DDD de 2 dígitos
      else if (p.ddds) {
        const primeiro = resto[0];
        if (!p.ddds[primeiro]) area = resto.slice(0, 2);
        else area = (primeiro === '9' && p.ddi === '244' && resto.length >= 2) ? resto.slice(0, 2) : primeiro; // AO móvel: 9 + operador (92=Unitel, 99=Africell…)
      }
      else area = resto.slice(0, 2);
      return { ddi: p.ddi, pais: p.pais, ddd: area || '-', rotulo: `+${p.ddi} ${area || ''}`.trim() };
    }
  }
  return { ddi: '?', pais: 'Desconhecido', ddd: s.slice(0, 2) || '-', rotulo: s.slice(0, 2) || '-' };
}

// meta do Baileys: { id, subject, participants: [{ id: '2449...@s.whatsapp.net' | 'xxx@lid', notify?, name? }] }
function capturarGrupo(jid, meta, { fonte = '', slot = null, persistir = true } = {}) {
  // v12.9.34: persistir=false → memória só (captura em LOTES feita pelo chamador;
  // com 1000+ grupos, carregar+guardar a base completa POR GRUPO era O(n²))
  if (persistir) carregar();
  const nome = String(meta?.subject || '').slice(0, 120) || 'grupo';
  state.grupos[jid] = { nome, membros: (meta?.participants || []).length, nomeFonte: fonte, ts: Date.now() };
  let novos = 0, duplicados = 0;
  for (const p of (meta?.participants || [])) {
    const jidP = String(p?.id || '');
    if (!jidP || /@g\.us$/.test(jidP)) continue;
    const num = jidP.split('@')[0];
    if (!num || num.length < 7) continue;
    const nomeP = String(p.notify || p.name || p.verifiedName || '').slice(0, 80);
    const ex = state.contactos[num];
    if (ex) {
      duplicados++;
      ex.grupos = ex.grupos || {};
      if (!ex.grupos[jid]) ex.grupos[jid] = nome;
      if (nomeP && !ex.nome) ex.nome = nomeP;
      // v12.9.35 FIX: o `if` só guardava a 1ª instrução — ex.slots[slot]=… corria SEMPRE
      // e rebentava em contacto repetido sem slot (era o crash silencioso do .capturar!)
      if (slot) { ex.slots = ex.slots || {}; ex.slots[slot] = Date.now(); } // v12.9.23: por qual NÚMERO foi visto
      ex.ts = Date.now();
    } else {
      novos++;
      state.contactos[num] = { nome: nomeP, jid: jidP, grupos: { [jid]: nome }, addedAt: Date.now(), ts: Date.now(), ddd: dddDe(num), ...(slot ? { slots: { [slot]: Date.now() } } : {}) };
      _marcarSujo(num);
    }
  }
  guardar();
  return { novos, duplicados, total: (meta?.participants || []).length, nome };
}

function stats() {
  carregar();
  const nGrupos = Object.keys(state.grupos).length;
  // v12.9.36: porGrupo numa ÚNICA passada (antes: 1 scan completo POR GRUPO
  // = 1e9 operações com 1M contactos × 1000 grupos)
  const _porGrupoTally = {};
  for (const c of Object.values(state.contactos)) {
    for (const jid of Object.keys(c.grupos || {})) _porGrupoTally[jid] = (_porGrupoTally[jid] || 0) + 1;
  }
  const porGrupo = Object.entries(state.grupos)
    .map(([jid, g]) => ({ jid, nome: g.nome, membros: _porGrupoTally[jid] || 0, capturados: _porGrupoTally[jid] || 0, ts: g.ts }))
    .sort((a, b) => b.capturados - a.capturados);
  // v12.9.23: resumo por DDD/país + por slot de captura
  const _ddd = {};
  const _slots = {};
  for (const [num, c] of Object.entries(state.contactos)) {
    const d = c.ddd || dddDe(num);
    const chave = `+${d.ddi} ${d.ddd}`.trim();
    _ddd[chave] = _ddd[chave] || { rotulo: chave, pais: d.pais, ddi: d.ddi, ddd: d.ddd, total: 0 };
    _ddd[chave].total++;
    for (const sl of Object.keys(c.slots || {})) { _slots[sl] = _slots[sl] || { slot: sl, total: 0 }; _slots[sl].total++; }
  }
  const ddds = Object.values(_ddd).sort((a, b) => b.total - a.total);
  const slots = Object.values(_slots).sort((a, b) => b.total - a.total);
  return { total: Object.keys(state.contactos).length, nGrupos, porGrupo, ddds, slots, updatedAt: state.UpdatedAt };
}

// fonte para addcentral: 'todos' → base inteira; jid de grupo → só quem está nesse grupo
function fonteParaAdd(filtroJid) {
  carregar();
  const out = [];
  for (const [num, c] of Object.entries(state.contactos)) {
    if (filtroJid && filtroJid !== 'todos' && !(c.grupos && c.grupos[filtroJid])) continue;
    out.push({ num, jid: c.jid || num + '@s.whatsapp.net', nome: c.nome || '' });
  }
  return out;
}

/**
 * v12.9.24: captura DIRECTA de números (passiva — entrada/saída em grupos).
 * Igual ao capturarGrupo mas recebe os números prontos.
 */
function capturarContactos(nums, jidGrupo, nomeGrupo, opts = {}) {
  const { slot = null } = opts || {};   // v12.9.36: tolera opts=null (era crash silencioso)
  carregar();
  let novos = 0, duplicados = 0;
  state.grupos[jidGrupo] = state.grupos[jidGrupo] || { nome: String(nomeGrupo || '').slice(0, 120), membros: 0, nomeFonte: 'passiva', ts: Date.now() };
  state.grupos[jidGrupo].ts = Date.now();
  for (const num0 of nums) {
    const num = String(num0 || '').replace(/\D/g, '');
    if (!num || num.length < 7) continue;
    const ex = state.contactos[num];
    if (ex) {
      duplicados++;
      ex.grupos = ex.grupos || {};
      if (!ex.grupos[jidGrupo]) ex.grupos[jidGrupo] = state.grupos[jidGrupo].nome;
      if (slot) { ex.slots = ex.slots || {}; ex.slots[slot] = Date.now(); }
      ex.ts = Date.now();
    } else {
      novos++;
      state.contactos[num] = { nome: '', jid: num + '@s.whatsapp.net', grupos: { [jidGrupo]: state.grupos[jidGrupo].nome }, addedAt: Date.now(), ts: Date.now(), ddd: dddDe(num), ...(slot ? { slots: { [slot]: Date.now() } } : {}) };
      _marcarSujo(num);
    }
  }
  // v12.9.36: membros INCREMENTAL — o scan completo da base por chamada
  // custava O(base) POR LOTE (250M operações a 500k contactos!)
  state.grupos[jidGrupo].membros = (state.grupos[jidGrupo].membros || 0) + novos;
  guardar();
  return { novos, duplicados };
}

/** v12.9.23: lista os contactos de um DDD ('244 9', '55 11', …) ou de um país ('+244'). */
function contactosPorDdd(filtro) {
  carregar();
  let f = String(filtro || '').trim().toLowerCase();
  if (f && !f.startsWith('+') && /^\d/.test(f)) f = '+' + f; // aceita "244 9" e "+244 9"
  const out = [];
  for (const [num, c] of Object.entries(state.contactos)) {
    const d = c.ddd || dddDe(num);
    const rot = `+${d.ddi} ${d.ddd}`.trim().toLowerCase();
    const rotP = `+${d.ddi} ${String(d.ddd).slice(0, 1)}`.toLowerCase();
    if (rot === f || rotP === f || ('+' + String(d.ddi)) === f || String(d.pais).toLowerCase() === f) {
      out.push({ num, jid: c.jid || num + '@s.whatsapp.net', nome: c.nome || '', ddd: d });
    }
  }
  return out;
}

/** v12.9.24: fonte para addcentral filtrada por DDD/país — mesma regra do contactosPorDdd. */
function fontePorDdd(filtro) {
  return contactosPorDdd(filtro).map(x => ({ num: x.num, jid: x.jid, nome: x.nome }));
}

function remover(num) {
  carregar();
  const had = !!state.contactos[num];
  delete state.contactos[num];
  guardar();
  return had;
}

function limpar() {
  state.contactos = {};
  state.grupos = {};
  guardar();
  return true;
}

// comunidade: grupos filhos do pai (linkedParentJid) a partir da lista viva do bot
function filhosComunidade(jidPai, allMeta) {
  return Object.values(allMeta || {}).filter(g => g && String(g.linkedParentJid || '') === String(jidPai));
}

module.exports = { carregar, guardar, capturarGrupo, capturarContactos, stats, fonteParaAdd, fontePorDdd, remover, limpar, filhosComunidade, dddDe, contactosPorDdd, PAISES, carregarMongo, modoMongo };
