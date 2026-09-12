/**
 * ╔═══════════════════════════════════════════════════════════════════════╗
 * ║   PERFORMANCE ENGINE v1 — MAIS RÁPIDO QUE O FLASH ⚡🚀               ║
 * ║   Cache agressivo, lazy loading, parallel processing, pre-compute   ║
 * ║   O bot mais rápido que já existiu no WhatsApp                      ║
 * ╚═══════════════════════════════════════════════════════════════════════╝
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════
// CACHE ULTRA-RÁPIDO (LRU com TTL)
// ═══════════════════════════════════════════════════════════════════════
class UltraCache {
  constructor(maxSize = 1000, defaultTTL = 60000) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.defaultTTL = defaultTTL;
    this.hits = 0;
    this.misses = 0;
  }

  get(key) {
    const entry = this.cache.get(key);
    if (!entry) {
      this.misses++;
      return undefined;
    }
    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      this.misses++;
      return undefined;
    }
    // Move para o fim (LRU)
    this.cache.delete(key);
    this.cache.set(key, entry);
    this.hits++;
    return entry.value;
  }

  set(key, value, ttl = this.defaultTTL) {
    if (this.cache.has(key)) this.cache.delete(key);
    else if (this.cache.size >= this.maxSize) {
      // Remove o mais antigo (primeiro)
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, { value, expiry: Date.now() + ttl });
  }

  has(key) {
    return this.get(key) !== undefined;
  }

  delete(key) {
    this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  stats() {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? (this.hits / total * 100).toFixed(2) + '%' : '0%',
    };
  }
}

// Caches globais
const caches = {
  groupMeta: new UltraCache(500, 30000),        // 30s
  groupSettings: new UltraCache(500, 60000),     // 60s
  userProfiles: new UltraCache(2000, 120000),    // 2min
  themes: new UltraCache(100, 300000),           // 5min
  prefixes: new UltraCache(500, 60000),          // 60s
  auraPrompts: new UltraCache(100, 600000),      // 10min
  regexPatterns: new UltraCache(500, 0),         // Sem TTL (permanente)
  botConfig: new UltraCache(200, 30000),         // 30s
  mediaBuffers: new UltraCache(100, 300000),     // 5min
  aiResponses: new UltraCache(500, 60000),       // 1min
};

// ═══════════════════════════════════════════════════════════════════════
// PRE-COMPUTED REGEX PATTERNS (compilados uma vez)
// ═══════════════════════════════════════════════════════════════════════
const precompiledRegex = {
  // Prefixo separado
  prefixWithSpace: /^\s+/,
  
  // Aura triggers
  auraTriggers: [
    /^aura\s/i,
    /^oi aura/i,
    /^ola aura/i,
    /^olá aura/i,
    /^bom dia aura/i,
    /^boa tarde aura/i,
    /^boa noite aura/i,
    /\ba aura\b/i,
    /\bda aura\b/i,
    /\bpra aura\b/i,
    /\bcom a aura\b/i,
  ],
  
  // Dark attack patterns
  darkAttackWords: /(lixo|idiota|burro|feio|merda|nojo|ódio|odeio|ruim|péssimo|horrível|falso|mentiroso|golpista|ladrão|inútil|bosta|fdp|puta|cuzão)/i,
  
  // Media types
  isImage: /imageMessage/i,
  isVideo: /videoMessage/i,
  isAudio: /audioMessage/i,
  isSticker: /stickerMessage/i,
  
  // Number extraction
  extractNumber: /\d+/g,
  
  // URL detection
  hasUrl: /https?:\/\//i,
  
  // Emoji strip
  emojiStrip: /^[\u{1F000}-\u{1FFFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F300}-\u{1F9FF}]+/u,
};

// ═══════════════════════════════════════════════════════════════════════
// PARALLEL EXECUTION HELPERS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Executa múltiplas promises em paralelo com timeout individual
 */
async function parallelWithTimeout(promises, timeoutMs = 5000) {
  const wrapped = promises.map(p => 
    Promise.race([
      p,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs))
    ]).catch(() => null)
  );
  return Promise.all(wrapped);
}

/**
 * Race com fallback — retorna o primeiro resultado válido
 */
async function raceWithFallback(promises, fallback = null) {
  try {
    return await Promise.any(promises);
  } catch {
    return fallback;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// LAZY LOADING (carrega módulos só quando necessário)
// ═══════════════════════════════════════════════════════════════════════
const lazyModules = new Map();

function lazyRequire(modulePath) {
  if (!lazyModules.has(modulePath)) {
    lazyModules.set(modulePath, null); // Placeholder
    try {
      const mod = require(modulePath);
      lazyModules.set(modulePath, mod);
    } catch (e) {
      console.warn(`[LazyLoad] Falha: ${modulePath}`, e.message);
    }
  }
  return lazyModules.get(modulePath);
}

// ═══════════════════════════════════════════════════════════════════════
// DEBOUNCE / THROTTLE (evita processamento desnecessário)
// ═══════════════════════════════════════════════════════════════════════
const debounceMap = new Map();
const throttleMap = new Map();

function debounce(key, fn, delay = 100) {
  if (debounceMap.has(key)) clearTimeout(debounceMap.get(key));
  debounceMap.set(key, setTimeout(() => {
    fn();
    debounceMap.delete(key);
  }, delay));
}

function throttle(key, fn, limit = 100) {
  const now = Date.now();
  const last = throttleMap.get(key) || 0;
  if (now - last >= limit) {
    throttleMap.set(key, now);
    fn();
  }
}

// ═══════════════════════════════════════════════════════════════════════
// STRING OPTIMIZATIONS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Fast string matching (mais rápido que includes para múltiplos padrões)
 */
function fastIncludes(str, patterns) {
  const lower = str.toLowerCase();
  for (const p of patterns) {
    if (lower.includes(p)) return true;
  }
  return false;
}

/**
 * Fast number extraction (sem regex)
 */
function fastExtractNumber(str) {
  let num = '';
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c >= 48 && c <= 57) num += str[i]; // 0-9
  }
  return num;
}

// ═══════════════════════════════════════════════════════════════════════
// AURA-SPECIFIC OPTIMIZATIONS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Cache de system prompts da Aura (pré-computados por tipo de utilizador)
 */
const auraPromptCache = {
  owner: null,
  vip: null,
  normal: null,
  lastUpdate: 0,
};

function getCachedAuraPrompt(userType) {
  const now = Date.now();
  // Cache válido por 10 minutos
  if (auraPromptCache[userType] && now - auraPromptCache.lastUpdate < 600000) {
    return auraPromptCache[userType];
  }
  return null;
}

function setCachedAuraPrompt(userType, prompt) {
  auraPromptCache[userType] = prompt;
  auraPromptCache.lastUpdate = Date.now();
}

/**
 * Fast aura trigger detection (sem regex para casos simples)
 */
function fastAuraTrigger(text) {
  const lower = text.toLowerCase().trim();
  // Casos mais comuns primeiro (fast path)
  if (lower === 'aura' || lower.startsWith('aura ')) return true;
  if (lower.startsWith('oi aura') || lower.startsWith('ola aura') || lower.startsWith('olá aura')) return true;
  if (lower.includes('a aura') || lower.includes('da aura') || lower.includes('pra aura')) return true;
  // Fallback para regex
  return precompiledRegex.auraTriggers.some(r => r.test(lower));
}

// ═══════════════════════════════════════════════════════════════════════
// MEMORY OPTIMIZATION
// ═══════════════════════════════════════════════════════════════════════

/**
 * Limpa caches periodicamente (a cada 5 minutos)
 */
setInterval(() => {
  for (const [name, cache] of Object.entries(caches)) {
    if (cache.size > cache.maxSize * 0.8) {
      // Limpa 20% dos mais antigos
      const toDelete = Math.floor(cache.size * 0.2);
      let deleted = 0;
      for (const key of cache.cache.keys()) {
        if (deleted >= toDelete) break;
        cache.cache.delete(key);
        deleted++;
      }
    }
  }
}, 300000); // 5 minutos

// ═══════════════════════════════════════════════════════════════════════
// PERFORMANCE MONITORING
// ═══════════════════════════════════════════════════════════════════════
const perfMetrics = {
  messageProcessed: 0,
  avgResponseTime: 0,
  totalResponseTime: 0,
  cacheHits: 0,
  cacheMisses: 0,
  startTime: Date.now(),
};

function trackResponse(responseTimeMs) {
  perfMetrics.messageProcessed++;
  perfMetrics.totalResponseTime += responseTimeMs;
  perfMetrics.avgResponseTime = perfMetrics.totalResponseTime / perfMetrics.messageProcessed;
}

function getPerfStats() {
  const uptime = Date.now() - perfMetrics.startTime;
  return {
    uptime: `${Math.floor(uptime / 1000 / 60)}min`,
    messagesProcessed: perfMetrics.messageProcessed,
    avgResponseTime: `${perfMetrics.avgResponseTime.toFixed(2)}ms`,
    caches: Object.fromEntries(
      Object.entries(caches).map(([k, v]) => [k, v.stats()])
    ),
  };
}

// ═══════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════
module.exports = {
  UltraCache,
  caches,
  precompiledRegex,
  parallelWithTimeout,
  raceWithFallback,
  lazyRequire,
  debounce,
  throttle,
  fastIncludes,
  fastExtractNumber,
  getCachedAuraPrompt,
  setCachedAuraPrompt,
  fastAuraTrigger,
  trackResponse,
  getPerfStats,
  perfMetrics,
};
