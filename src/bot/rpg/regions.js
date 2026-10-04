'use strict';
/**
 * DARK RPG — territórios por grupo.
 *
 * Um “país” não é uma lista fixa: é cada grupo que activou !modorpg on.
 * O nome do território acompanha exactamente o nome do grupo. DARK VILLE é
 * o centro internacional, com espaços próprios (reinos, portais, arena…).
 */

const CACHE_TTL = 60 * 1000;
const _groupCache = new Map(); // jid → { country, at }
const ACCENTS = ['#a78bfa', '#60a5fa', '#34d399', '#f59e0b', '#fb7185', '#22d3ee', '#f472b6'];

function normalizar(value) {
  return String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '');
}
function _hash(value) {
  let n = 2166136261;
  for (const ch of String(value || '')) { n ^= ch.charCodeAt(0); n = Math.imul(n, 16777619); }
  return n >>> 0;
}
function _cleanName(value, fallback = 'Território RPG') {
  const name = String(value || '').replace(/[\u0000-\u001f]/g, ' ').trim().replace(/\s+/g, ' ');
  return (name || fallback).slice(0, 80);
}
function clone(country) { return country ? { ...country } : null; }

// Compatibilidade de exportação para instalações antigas. Países físicos não
// são mais atribuídos; cada grupo é a região que representa.
const COUNTRIES = [];
function countryById() { return null; }

function _regionFromDoc(doc = {}, groupName = '') {
  const jid = String(doc.groupJid || '');
  const name = _cleanName(groupName || doc.rpgRegionName || doc.groupName || doc.rpgCity || doc.rpgCountry, 'Grupo RPG');
  return {
    id: `group:${jid || normalizar(name)}`,
    name,
    // O grupo é um território próprio, não um país real escolhido pelo bot.
    flag: '🏰',
    city: name,
    biome: `Território RPG de ${name}`,
    accent: ACCENTS[_hash(jid || name) % ACCENTS.length],
    groupJid: jid,
    isGroupTerritory: true,
  };
}

async function _lean(query) {
  if (!query) return null;
  if (typeof query.lean === 'function') return query.lean();
  return query;
}
function _dbPronto(Model) {
  const state = Model?.db?.readyState;
  return state === undefined || state === 1;
}
function _remember(groupJid, country) {
  if (groupJid && country) _groupCache.set(String(groupJid), { country: clone(country), at: Date.now() });
  return clone(country);
}

/** Lê a região de um grupo. groupName atualiza a apresentação sem I/O extra. */
async function getCountryForGroup(groupJid, groupName = '') {
  const jid = String(groupJid || '');
  if (!jid) return null;
  const cached = _groupCache.get(jid);
  if (cached && Date.now() - cached.at < CACHE_TTL) {
    return groupName ? { ...clone(cached.country), name: _cleanName(groupName), city: _cleanName(groupName) } : clone(cached.country);
  }
  try {
    const GroupSettings = require('../../database/models/GroupSettings');
    if (!_dbPronto(GroupSettings)) return null;
    const doc = await _lean(GroupSettings.findOne({ groupJid: jid }));
    // Só há país/território em grupos que efectivamente abriram o Modo RPG.
    // Registos antigos de subgrupos da comunidade são ignorados aqui.
    if (!doc?.modorpg) return null;
    return _remember(jid, _regionFromDoc(doc, groupName));
  } catch { return null; }
}

/**
 * Cria/sincroniza o território do grupo. O próprio JID é a identidade estável
 * e o nome é o assunto do grupo — dois grupos podem ter nomes iguais, mas
 * continuam territórios separados porque os grupos são separados.
 */
async function ensureGroupCountry(groupJid, groupName = '') {
  const jid = String(groupJid || '');
  if (!jid) return { ok: false, error: 'Grupo inválido.' };
  try {
    const GroupSettings = require('../../database/models/GroupSettings');
    if (!_dbPronto(GroupSettings)) return { ok: false, error: 'Base de dados indisponível para guardar o território.' };
    const old = await _lean(GroupSettings.findOne({ groupJid: jid }));
    const name = _cleanName(groupName || old?.rpgRegionName || old?.groupName || old?.rpgCity || 'Grupo RPG');
    await GroupSettings.findOneAndUpdate(
      { groupJid: jid },
      {
        $set: {
          groupName: name,
          rpgCountry: `group:${jid}`,
          rpgCity: name,
          rpgRegionName: name,
        },
        $setOnInsert: { groupJid: jid, rpgCountryAssignedAt: new Date() },
      },
      { upsert: true, new: true },
    );
    try { require('../hotCache').forgetGroup(jid); } catch {}
    return { ok: true, country: _remember(jid, _regionFromDoc({ groupJid: jid, groupName: name }, name)), existing: !!old?.rpgCountry };
  } catch (e) {
    return { ok: false, error: 'Não consegui guardar o território: ' + (e.message || 'erro') };
  }
}

/** Regista a origem/visita pelo JID estável da região-grupo. */
function marcarJogadorNoPais(player, country) {
  if (!player || !country) return false;
  let changed = false;
  if (!player.homeCountry) { player.homeCountry = country.id; changed = true; }
  if (!Array.isArray(player.visitedCountries)) player.visitedCountries = [];
  if (!player.visitedCountries.includes(country.id)) { player.visitedCountries.push(country.id); changed = true; }
  return changed;
}

/** Lista somente os grupos onde o Modo RPG está ligado. */
async function activeRegions(limit = 30) {
  try {
    const GroupSettings = require('../../database/models/GroupSettings');
    if (!_dbPronto(GroupSettings)) return [];
    let query = GroupSettings.find({ modorpg: true });
    if (query?.select) query = query.select('groupJid groupName rpgRegionName rpgCountry rpgCity modorpg').limit(limit);
    const docs = await _lean(query);
    return (Array.isArray(docs) ? docs : []).map(doc => ({
      groupJid: doc.groupJid,
      active: true,
      country: _regionFromDoc(doc),
    }));
  } catch { return []; }
}

function citiesOfTheCommunity() {
  return [
    '🏰 *DARK VILLE* — centro internacional e praça dos aventureiros',
    '👑 *Reinos & Embaixadas* — estados e alianças dos grupos-território',
    '🌀 *Portais Regionais* — passagem para cada grupo com Modo RPG',
    '⚔️ *Arena das Sombras* — batalhas e torneios separados',
    '🐉 *Dungeons Proibidas* — bosses, raids e expedições separados',
    '💱 *Mercado de DARK VILLE* — trocas entre todos os territórios',
  ];
}

module.exports = {
  COUNTRIES, countryById, normalizar,
  getCountryForGroup, ensureGroupCountry, marcarJogadorNoPais,
  activeRegions, citiesOfTheCommunity, _groupCache, _regionFromDoc,
};
