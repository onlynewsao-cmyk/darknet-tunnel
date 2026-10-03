'use strict';
/**
 * DARK RPG — regiões internacionais
 *
 * Cada grupo que abre o Modo RPG recebe um país/uma cidade do mundo.
 * A comunidade DARK VILLE continua a ser o centro: o mesmo herói,
 * inventário e mercado existem em todas as regiões.
 */

const COUNTRIES = [
  { id: 'angola', name: 'Angola', flag: '🇦🇴', city: 'Luanda Obsidiana', biome: 'Savanas de Ferro', accent: '#e63946' },
  { id: 'brasil', name: 'Brasil', flag: '🇧🇷', city: 'São Paulo Neon', biome: 'Mata dos Ancestrais', accent: '#39b54a' },
  { id: 'portugal', name: 'Portugal', flag: '🇵🇹', city: 'Lisboa Arcana', biome: 'Costa das Brumas', accent: '#1c75bc' },
  { id: 'mocambique', name: 'Moçambique', flag: '🇲🇿', city: 'Maputo das Marés', biome: 'Ilhas Rubras', accent: '#f7b733' },
  { id: 'caboverde', name: 'Cabo Verde', flag: '🇨🇻', city: 'Praia Celeste', biome: 'Arquipélago Solar', accent: '#2d9cdb' },
  { id: 'saotome', name: 'São Tomé e Príncipe', flag: '🇸🇹', city: 'São Tomé Esmeralda', biome: 'Selva das Especiarias', accent: '#27ae60' },
  { id: 'guinebissau', name: 'Guiné-Bissau', flag: '🇬🇼', city: 'Bissau dos Rios', biome: 'Mangais do Eclipse', accent: '#c0392b' },
  { id: 'timorleste', name: 'Timor-Leste', flag: '🇹🇱', city: 'Díli do Amanhecer', biome: 'Montes da Aurora', accent: '#f2c94c' },
  { id: 'africadosul', name: 'África do Sul', flag: '🇿🇦', city: 'Cidade do Cabo Astral', biome: 'Montanha da Mesa', accent: '#8e44ad' },
  { id: 'nigeria', name: 'Nigéria', flag: '🇳🇬', city: 'Lagos Luminar', biome: 'Delta do Trovão', accent: '#168f4e' },
  { id: 'rdcongo', name: 'República Democrática do Congo', flag: '🇨🇩', city: 'Kinshasa Profunda', biome: 'Selva do Congo', accent: '#ef476f' },
  { id: 'franca', name: 'França', flag: '🇫🇷', city: 'Paris das Runas', biome: 'Bosque de Cristal', accent: '#3f51b5' },
  { id: 'espanha', name: 'Espanha', flag: '🇪🇸', city: 'Madrid do Sol', biome: 'Planícies Carmesim', accent: '#f2994a' },
  { id: 'reino_unido', name: 'Reino Unido', flag: '🇬🇧', city: 'Londres Nebulosa', biome: 'Pântano de Avalon', accent: '#6c5ce7' },
  { id: 'eua', name: 'Estados Unidos', flag: '🇺🇸', city: 'Nova Iorque Nexus', biome: 'Torres do Multiverso', accent: '#e74c3c' },
  { id: 'canada', name: 'Canadá', flag: '🇨🇦', city: 'Toronto Boreal', biome: 'Floresta de Gelo', accent: '#d63031' },
  { id: 'mexico', name: 'México', flag: '🇲🇽', city: 'Cidade do México Solar', biome: 'Templos de Jade', accent: '#16a085' },
  { id: 'argentina', name: 'Argentina', flag: '🇦🇷', city: 'Buenos Aires Lunar', biome: 'Pampas do Vento', accent: '#74b9ff' },
  { id: 'japao', name: 'Japão', flag: '🇯🇵', city: 'Tóquio dos Portais', biome: 'Jardim de Sakura Sombria', accent: '#fd79a8' },
  { id: 'coreiadosul', name: 'Coreia do Sul', flag: '🇰🇷', city: 'Seul das Sombras', biome: 'Distrito dos Caçadores', accent: '#6c5ce7' },
  { id: 'india', name: 'Índia', flag: '🇮🇳', city: 'Nova Deli de Safira', biome: 'Deserto dos Monges', accent: '#f39c12' },
  { id: 'turquia', name: 'Turquia', flag: '🇹🇷', city: 'Istambul das Pontes', biome: 'Bazar dos Djinns', accent: '#e74c3c' },
  { id: 'alemanha', name: 'Alemanha', flag: '🇩🇪', city: 'Berlim Mecânica', biome: 'Floresta Negra', accent: '#2d3436' },
  { id: 'italia', name: 'Itália', flag: '🇮🇹', city: 'Roma Eterna', biome: 'Ruínas do Império', accent: '#27ae60' },
  { id: 'australia', name: 'Austrália', flag: '🇦🇺', city: 'Sydney Coral', biome: 'Outback dos Dragões', accent: '#0984e3' },
];

const BY_ID = new Map(COUNTRIES.map(country => [country.id, country]));
const CACHE_TTL = 60 * 1000;
const _groupCache = new Map(); // jid -> { country, at }

function normalizar(value) {
  return String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '');
}

function countryById(value) {
  const n = normalizar(value);
  if (!n) return null;
  return COUNTRIES.find(country => normalizar(country.id) === n || normalizar(country.name) === n) || null;
}

function clone(country) {
  return country ? { ...country } : null;
}

async function _lean(query) {
  if (!query) return null;
  if (typeof query.lean === 'function') return query.lean();
  return query;
}

// Mongoose faz buffer de queries durante ~10s sem ligação. Região é um
// extra visual, portanto não pode atrasar um comando nem o setup do RPG.
function _dbPronto(Model) {
  const state = Model?.db?.readyState;
  return state === undefined || state === 1;
}

async function _usedCountries(exceptJid = '') {
  try {
    const GroupSettings = require('../../database/models/GroupSettings');
    if (!_dbPronto(GroupSettings)) return new Set();
    let query = GroupSettings.find({ rpgCountry: { $exists: true, $ne: '' } });
    if (query?.select) query = query.select('groupJid rpgCountry');
    const docs = await _lean(query);
    return new Set((Array.isArray(docs) ? docs : [])
      .filter(doc => String(doc.groupJid || '') !== String(exceptJid || ''))
      .map(doc => String(doc.rpgCountry || ''))
      .filter(Boolean));
  } catch {
    return new Set();
  }
}

function _remember(groupJid, country) {
  if (groupJid && country) _groupCache.set(String(groupJid), { country: clone(country), at: Date.now() });
  return clone(country);
}

/** Lê a região de um grupo com cache curto; não cria nem altera nada. */
async function getCountryForGroup(groupJid) {
  const jid = String(groupJid || '');
  if (!jid) return null;
  const cached = _groupCache.get(jid);
  if (cached && Date.now() - cached.at < CACHE_TTL) return clone(cached.country);
  try {
    const GroupSettings = require('../../database/models/GroupSettings');
    if (!_dbPronto(GroupSettings)) return null;
    const doc = await _lean(GroupSettings.findOne({ groupJid: jid }));
    const country = countryById(doc?.rpgCountry);
    return country ? _remember(jid, country) : null;
  } catch {
    return null;
  }
}

/**
 * Garante que um grupo tem um território. Países já usados são evitados
 * enquanto houver opções. Um admin pode pedir outro país com `!pais definir`.
 */
async function ensureGroupCountry(groupJid, preferred = null) {
  const jid = String(groupJid || '');
  if (!jid) return { ok: false, error: 'Grupo inválido.' };

  const existing = await getCountryForGroup(jid);
  if (existing && !preferred) return { ok: true, country: existing, existing: true };

  const requested = preferred ? countryById(preferred) : null;
  if (preferred && !requested) {
    return { ok: false, error: 'País inválido. Usa !paises para ver as regiões disponíveis.' };
  }

  const used = await _usedCountries(jid);
  if (requested && used.has(requested.id)) {
    return { ok: false, error: `${requested.flag} ${requested.name} já pertence a outro grupo RPG.` };
  }

  // Se a lista esgotar, volta ao início: a comunidade pode crescer sem
  // bloquear o Modo RPG, mas cada um dos primeiros grupos fica único.
  const chosen = requested || COUNTRIES.find(country => !used.has(country.id)) || COUNTRIES[0];
  try {
    const GroupSettings = require('../../database/models/GroupSettings');
    if (!_dbPronto(GroupSettings)) return { ok: false, error: 'Base de dados indisponível para guardar a região.' };
    await GroupSettings.findOneAndUpdate(
      { groupJid: jid },
      {
        $set: {
          rpgCountry: chosen.id,
          rpgCity: chosen.city,
          rpgCountryAssignedAt: new Date(),
        },
        $setOnInsert: { groupJid: jid },
      },
      { upsert: true, new: true },
    );
    try { require('../hotCache').forgetGroup(jid); } catch {}
    return { ok: true, country: _remember(jid, chosen), existing: !!existing };
  } catch (e) {
    return { ok: false, error: 'Não consegui guardar a região: ' + (e.message || 'erro') };
  }
}

/** Regista a cidade de origem/visita sem escrita adicional se já existir. */
function marcarJogadorNoPais(player, country) {
  if (!player || !country) return false;
  let changed = false;
  if (!player.homeCountry) {
    player.homeCountry = country.id;
    changed = true;
  }
  if (!Array.isArray(player.visitedCountries)) player.visitedCountries = [];
  if (!player.visitedCountries.includes(country.id)) {
    player.visitedCountries.push(country.id);
    changed = true;
  }
  return changed;
}

/** Lista as regiões que já têm grupos RPG activos/configurados. */
async function activeRegions(limit = 30) {
  try {
    const GroupSettings = require('../../database/models/GroupSettings');
    if (!_dbPronto(GroupSettings)) return [];
    let query = GroupSettings.find({ rpgCountry: { $exists: true, $ne: '' } });
    if (query?.select) query = query.select('groupJid rpgCountry rpgCity modorpg').limit(limit);
    const docs = await _lean(query);
    return (Array.isArray(docs) ? docs : []).map(doc => ({
      groupJid: doc.groupJid,
      active: !!doc.modorpg,
      country: countryById(doc.rpgCountry),
    })).filter(entry => entry.country);
  } catch {
    return [];
  }
}

function citiesOfTheCommunity() {
  return [
    '🏰 *Cidade Nexus* — centro internacional, portais e guildas',
    '💱 *Mercado de DARK VILLE* — ofertas entre todas as regiões',
    '⚔️ *Arena Mundial* — batalhas e rankings globais',
    '🗺️ *Portais Regionais* — entrada nas cidades de cada país',
  ];
}

module.exports = {
  COUNTRIES,
  countryById,
  normalizar,
  getCountryForGroup,
  ensureGroupCountry,
  marcarJogadorNoPais,
  activeRegions,
  citiesOfTheCommunity,
  _groupCache,
};
