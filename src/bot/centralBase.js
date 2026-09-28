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

function guardar() {
  state.UpdatedAt = Date.now();
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(BASE_FILE, JSON.stringify(state, null, 1));
  } catch (e) { console.warn('[CENTRAL] save:', e.message); }
  clearTimeout(_t);
  _t = setTimeout(() => {
    try { require('../database/models/BotConfig').set('central_base', { contactos: state.contactos, grupos: state.grupos, UpdatedAt: state.UpdatedAt }).catch(() => {}); } catch {}
  }, 600);
}
let _t = null;

// ── v12.9.23 — DDD & PAÍS 🌍 ────────────────────────────────
// O "DDD" internacional = país + código de área. Tabela dos códigos
// mais comuns na base (Angola, Brasil, Portugal, etc.).
const PAISES = [
  { ddi: '244', pais: 'Angola', ddds: { '9': 'Móvel', '2': 'Fixo' } },
  { ddi: '55', pais: 'Brasil', ddds: null }, // Brasil: 2 dígitos de DDD após o 55 (11–99)
  { ddi: '351', pais: 'Portugal', ddds: { '9': 'Móvel', '2': 'Fixo' } },
  { ddi: '243', pais: 'RD Congo', ddds: { '8': 'Móvel', '9': 'Móvel' } },
  { ddi: '242', pais: 'Congo', ddds: { '0': 'Móvel' } },
  { ddi: '245', pais: 'Guiné-Bissau', ddds: { '9': 'Móvel' } },
  { ddi: '238', pais: 'Cabo Verde', ddds: { '9': 'Móvel', '2': 'Fixo' } },
  { ddi: '258', pais: 'Moçambique', ddds: { '8': 'Móvel', '2': 'Fixo' } },
  { ddi: '239', pais: 'S. Tomé e Príncipe', ddds: null },
  { ddi: '1', pais: 'EUA/Canadá', ddds: null },
  { ddi: '33', pais: 'França', ddds: null },
  { ddi: '35', pais: 'Europa (varios)', ddds: null },
];
function dddDe(num) {
  const s = String(num || '').replace(/\D/g, '');
  for (const p of PAISES) {
    if (s.startsWith(p.ddi)) {
      const resto = s.slice(p.ddi.length);
      if (!resto) continue;
      let area = '';
      if (p.ddi === '55' && resto.length >= 2) area = resto.slice(0, 2);            // Brasil: DDD de 2 dígitos
      else if (p.ddis) {
        const primeiro = resto[0];
        if (!p.ddis[primeiro]) area = resto.slice(0, 2);
        else area = (primeiro === '9' && p.ddi === '244' && resto.length >= 2) ? resto.slice(0, 2) : primeiro; // AO móvel: 9 + operador (92=Unitel, 99=Africell…)
      }
      else area = resto.slice(0, 2);
      return { ddi: p.ddi, pais: p.pais, ddd: area || '-', rotulo: `+${p.ddi} ${area || ''}`.trim() };
    }
  }
  return { ddi: '?', pais: 'Desconhecido', ddd: s.slice(0, 2) || '-', rotulo: s.slice(0, 2) || '-' };
}

// meta do Baileys: { id, subject, participants: [{ id: '2449...@s.whatsapp.net' | 'xxx@lid', notify?, name? }] }
function capturarGrupo(jid, meta, { fonte = '', slot = null } = {}) {
  carregar();
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
      if (slot) ex.slots = ex.slots || {}; ex.slots[slot] = Date.now(); // v12.9.23: por qual NÚMERO foi visto
      ex.ts = Date.now();
    } else {
      novos++;
      state.contactos[num] = { nome: nomeP, jid: jidP, grupos: { [jid]: nome }, addedAt: Date.now(), ts: Date.now(), ddd: dddDe(num), ...(slot ? { slots: { [slot]: Date.now() } } : {}) };
    }
  }
  guardar();
  return { novos, duplicados, total: (meta?.participants || []).length, nome };
}

function stats() {
  carregar();
  const nGrupos = Object.keys(state.grupos).length;
  const porGrupo = Object.entries(state.grupos)
    .map(([jid, g]) => {
      const membros = Object.values(state.contactos).filter(c => c.grupos && c.grupos[jid]).length;
      return { jid, nome: g.nome, membros, capturados: membros, ts: g.ts };
    })
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
function capturarContactos(nums, jidGrupo, nomeGrupo, { slot = null } = {}) {
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
    }
  }
  state.grupos[jidGrupo].membros = Object.values(state.contactos).filter(c => c.grupos && c.grupos[jidGrupo]).length;
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

module.exports = { carregar, guardar, capturarGrupo, capturarContactos, stats, fonteParaAdd, fontePorDdd, remover, limpar, filhosComunidade, dddDe, contactosPorDdd, PAISES };
