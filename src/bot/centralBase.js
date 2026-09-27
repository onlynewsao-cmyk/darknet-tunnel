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

// meta do Baileys: { id, subject, participants: [{ id: '2449...@s.whatsapp.net' | 'xxx@lid', notify?, name? }] }
function capturarGrupo(jid, meta, { fonte = '' } = {}) {
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
      ex.ts = Date.now();
    } else {
      novos++;
      state.contactos[num] = { nome: nomeP, jid: jidP, grupos: { [jid]: nome }, addedAt: Date.now(), ts: Date.now() };
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
  return { total: Object.keys(state.contactos).length, nGrupos, porGrupo, updatedAt: state.UpdatedAt };
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

module.exports = { carregar, guardar, capturarGrupo, stats, fonteParaAdd, remover, limpar, filhosComunidade };
