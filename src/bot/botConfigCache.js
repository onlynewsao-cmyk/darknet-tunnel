/**
 * ╔═══════════════════════════════════════════╗
 * ║   DARK BOT — BotConfigCache v2 ULTRA     ║
 * ║   Cache em memória com TTL e warm-up     ║
 * ╚═══════════════════════════════════════════╝
 *
 * Evita queries MongoDB a cada mensagem.
 * - TTL: 5 min por chave
 * - Warm-up: carrega tudo de uma vez no início
 * - Writes: atualiza cache local imediatamente
 * - Fallback: retorna valor em cache mesmo após expirar se MongoDB falhar
 */

const BotConfig = require('../database/models/BotConfig');
const { mongoose } = require('../database/connection');

// v5.1: fail-fast quando o MongoDB não está ligado.
// Sem isto, cada query ficava 10s em buffer (mongoose bufferTimeoutMS),
// bloqueando TODOS os pedidos HTTP quando o Mongo caía no Render.
function _dbUp() {
  return mongoose.connection.readyState === 1;
}

// Cache principal: key → { value, ts }
const _cache = new Map();

// TTL padrão: 5 minutos
const TTL = 5 * 60 * 1000;

// Chaves que mudam raramente — TTL maior (30 min)
const LONG_TTL_KEYS = new Set([
  'bot_name', 'bot_prefix', 'owner_name', 'owner_number',
  'site_meta_title', 'site_meta_description', 'site_meta_keywords',
  'site_meta_image', 'channel_name', 'channel_url',
  'sticker_pack_name', 'sticker_pack_author',
]);

const LONG_TTL = 30 * 60 * 1000;

function _getTtl(key) {
  return LONG_TTL_KEYS.has(key) ? LONG_TTL : TTL;
}

function _isFresh(entry, key) {
  if (!entry) return false;
  return (Date.now() - entry.ts) < _getTtl(key);
}

/**
 * Lê uma config.
 * 1. Retorna do cache se fresco.
 * 2. Busca do MongoDB e atualiza cache.
 * 3. Se MongoDB falhar, retorna cache expirado como fallback.
 * 4. Se não há cache, retorna defaultValue.
 */
async function get(key, defaultValue = null) {
  const entry = _cache.get(key);

  // Cache fresco → retorna imediatamente (zero I/O)
  if (_isFresh(entry, key)) return entry.value;

  // Sem MongoDB → stale-while-error ou default (sem bloquear)
  if (!_dbUp()) return entry != null ? entry.value : defaultValue;

  try {
    const doc = await BotConfig.findOne({ key }).lean();
    const value = doc != null ? doc.value : defaultValue;
    _cache.set(key, { value, ts: Date.now() });
    return value;
  } catch {
    // MongoDB indisponível → usa cache expirado (stale-while-error)
    return entry != null ? entry.value : defaultValue;
  }
}

/**
 * Escreve uma config no MongoDB e atualiza cache local.
 */
async function set(key, value) {
  // Sem MongoDB → só cache local (não bloqueia)
  if (!_dbUp()) {
    _cache.set(key, { value, ts: Date.now() });
    return value;
  }
  try {
    await BotConfig.findOneAndUpdate(
      { key },
      { key, value },
      { upsert: true, new: true }
    );
    _cache.set(key, { value, ts: Date.now() });
    return value;
  } catch (err) {
    // Mesmo se o MongoDB falhar, atualiza o cache local
    _cache.set(key, { value, ts: Date.now() });
    console.error('[Cache] Erro ao persistir:', err.message);
  }
}

/**
 * Remove uma ou todas as entradas do cache em memória (não apaga do MongoDB).
 */
function clear(key) {
  if (key) _cache.delete(key);
  else _cache.clear();
}

/**
 * Força a leitura de todas as configs do MongoDB e reconstrói o cache.
 * Chamado no startup e a cada 5 min.
 */
async function refresh() {
  if (!_dbUp()) return 0;
  try {
    const docs = await BotConfig.find().lean();
    const now = Date.now();
    docs.forEach(d => _cache.set(d.key, { value: d.value, ts: now }));
    // não apaga entradas que não estejam no BD (valores locais/temporários)
    return docs.length;
  } catch (err) {
    console.warn('[Cache] Refresh falhou:', err.message);
    return 0;
  }
}

/**
 * Lê múltiplas configs de uma vez (batch) — 1 query ao invés de N.
 * Retorna um objeto { key: value, ... }
 */
async function getMany(keys, defaults = {}) {
  const result = {};
  const missing = [];

  // O que está fresco no cache
  for (const key of keys) {
    const entry = _cache.get(key);
    if (_isFresh(entry, key)) {
      result[key] = entry.value;
    } else {
      missing.push(key);
    }
  }

  if (missing.length === 0) return result;

  // Sem MongoDB → cache expirado ou defaults (sem bloquear)
  if (!_dbUp()) {
    for (const key of missing) {
      const entry = _cache.get(key);
      result[key] = entry ? entry.value : (defaults[key] !== undefined ? defaults[key] : null);
    }
    return result;
  }

  // Busca os que faltam num único round-trip
  try {
    const docs = await BotConfig.find({ key: { $in: missing } }).lean();
    const now = Date.now();
    const found = new Set();
    for (const doc of docs) {
      _cache.set(doc.key, { value: doc.value, ts: now });
      result[doc.key] = doc.value;
      found.add(doc.key);
    }
    // Para os que não foram encontrados, usa o default
    for (const key of missing) {
      if (!found.has(key)) {
        const def = defaults[key] !== undefined ? defaults[key] : null;
        result[key] = def;
        // Cacheia o default para não voltar ao BD enquanto não existir
        _cache.set(key, { value: def, ts: now });
      }
    }
  } catch {
    for (const key of missing) {
      const entry = _cache.get(key);
      result[key] = entry ? entry.value : (defaults[key] !== undefined ? defaults[key] : null);
    }
  }

  return result;
}

/**
 * Retorna todas as configs em cache (para debug/dashboard).
 */
function dump() {
  const out = {};
  for (const [k, v] of _cache.entries()) {
    out[k] = v.value;
  }
  return out;
}

module.exports = { get, set, clear, refresh, getMany, dump };
