/**
 * ╔═══════════════════════════════════════════════════════════════════╗
 * ║   DARK BOT — PrefixEngine v2 🕸️                                  ║
 * ║   Deteção avançada de prefixo: por grupo, rigorosa, profissional ║
 * ═══════════════════════════════════════════════════════════════════╝
 *
 * PROBLEMAS RESOLVIDOS (v5.1):
 *  ❌ Antes: "?play" era tratado como botão "play" → sugeria "$play"
 *  ❌ Antes: prefixo era global — mudar afectava todos os grupos
 *  ❌ Antes: qualquer símbolo era tratado como prefixo potencial
 *
 * AGORA:
 *  ✅ Prefixo POR GRUPO — o dono muda num grupo sem afectar os outros
 *  ✅ Deteção RIGOROSA — só reconhece o prefixo ACTIVO do grupo
 *  ✅ Símbolo errado = SILÊNCIO TOTAL (sem sugestão, sem resposta)
 *  ✅ IDs de botões com namespace "DB_" — só o bot entende
 *  ✅ Botões sem prefixo (exactos) só funcionam se vierem de clique
 *
 * FLUXO DE DETEÇÃO:
 *  1. Verifica prefixo do grupo (GroupSettings.groupPrefix)
 *  2. Se não tem → usa prefixos globais (BotConfig 'prefixes')
 *  3. Se texto começa com o prefixo activo → retorna { prefix, rest }
 *  4. Se texto começa com SÍMBOLO que NÃO é o prefixo activo → null (silêncio)
 *  5. Se texto é um ID de botão (DB_xxx ou exacto sem prefixo) → internal
 *  6. Caso contrário → null (silêncio total)
 */

'use strict';

const config = require('../config');
const BotConfig = require('../database/models/BotConfig');
const GroupSettings = require('../database/models/GroupSettings');
const { mongoose } = require('../database/connection');

function _dbUp() { return mongoose.connection.readyState === 1; }

// ── Cache ────────────────────────────────────────────────
let _globalCache = null;
let _globalTs = 0;
const groupPrefixCache = new Map(); // groupJid → { prefix, ts }
const TTL_GLOBAL = 30_000;
const TTL_GROUP = 60_000;

// Símbolos comuns que as pessoas usam como prefixo (mas podem não ser o activo)
const COMMON_PREFIX_CHARS = new Set([
  '!', '$', '.', '/', '#', '?', '*', '>', '+', '-', '=', '~', '%', '&', '|', '\\',
]);

// ── Prefixos globais ─────────────────────────────────────
async function getGlobalPrefixes() {
  const now = Date.now();
  if (_globalCache && now - _globalTs < TTL_GLOBAL) return _globalCache;
  if (!_dbUp()) return [config.bot.prefix || '!']; // sem Mongo → config
  try {
    const stored = await BotConfig.findOne({ key: 'prefixes' }).lean();
    let prefixes;
    if (stored?.value) {
      prefixes = Array.isArray(stored.value)
        ? stored.value
        : String(stored.value).split(/[\s,]+/).filter(Boolean);
    } else {
      prefixes = [config.bot.prefix || '!'];
    }
    _globalCache = prefixes.filter(Boolean).slice(0, 5);
    _globalTs = now;
    return _globalCache;
  } catch {
    return [config.bot.prefix || '!'];
  }
}

// ── Prefixo do grupo (per-group override) ────────────────
async function getGroupPrefix(groupJid) {
  if (!groupJid?.endsWith('@g.us')) return null;
  if (!_dbUp()) return null; // sem Mongo → sem prefixo de grupo
  const now = Date.now();
  const cached = groupPrefixCache.get(groupJid);
  if (cached && now - cached.ts < TTL_GROUP) return cached.prefix;
  try {
    const gs = await GroupSettings.findOne({ groupJid }).lean().catch(() => null);
    const p = gs?.groupPrefix || null;
    groupPrefixCache.set(groupJid, { prefix: p, ts: now });
    return p;
  } catch {
    return null;
  }
}

async function setGroupPrefix(groupJid, prefix) {
  const p = String(prefix || '').trim().slice(0, 3); // máx 3 chars
  if (!p) throw new Error('Prefixo vazio');
  await GroupSettings.findOneAndUpdate(
    { groupJid },
    { groupPrefix: p },
    { upsert: true }
  );
  groupPrefixCache.set(groupJid, { prefix: p, ts: Date.now() });
  return p;
}

async function clearGroupPrefix(groupJid) {
  await GroupSettings.findOneAndUpdate(
    { groupJid },
    { $unset: { groupPrefix: 1 } },
    { upsert: true }
  );
  groupPrefixCache.set(groupJid, { prefix: null, ts: Date.now() });
}

// ── IDs de botões (namespace DB_) ────────────────────────
// Formato: DB_<comando> ou DB_<comando>_<arg>
// Só o bot entende — texto natural nunca bate com isto
const BTN_NS = 'DB_';

function isButtonId(text) {
  return String(text || '').startsWith(BTN_NS);
}

function parseButtonId(text) {
  const raw = String(text || '');
  if (!raw.startsWith(BTN_NS)) return null;
  const payload = raw.slice(BTN_NS.length);
  // DB_play → { command: 'play', args: '' }
  // DB_ytd_https://... → { command: 'ytd', args: 'https://...' }
  const idx = payload.indexOf('_');
  if (idx === -1) return { command: payload.toLowerCase(), args: '' };
  return { command: payload.slice(0, idx).toLowerCase(), args: payload.slice(idx + 1) };
}

function makeButtonId(command, args = '') {
  return args ? `${BTN_NS}${command}_${args}` : `${BTN_NS}${command}`;
}

// ── IDs exactos de botões (sem namespace, compatibilidade) ─
// Estes são IDs que os botões enviam SEM prefixo e SEM namespace.
// Só são reconhecidos quando o texto é EXACTAMENTE este ID
// (sem caracteres extras antes — "?play" NÃO é "play")
const EXACT_BTN_IDS = new Set([
  'menu', 'menup', 'down', 'menudownload', 'menuia', 'menustickers',
  'menufigurinhas', 'menujogos', 'menueconomia', 'menucoins', 'menufamilia',
  'menudiversao', 'menuinteracoes', 'brincadeiras', 'alteradores', 'menulogos',
  'menuadm', 'menugrupo', 'menustatus', 'menudono', 'maiscmds', 'cmdsocultos',
  'menu18', 'criador', 'alugar', 'statusalugar', 'vip', 'donos', 'ping',
  'start', 'temas', 'change', 'play', 'play2', 'play3', 'video', 'video2',
  'sticker', 'sfull', 'ia', 'gpt', 'noticias', 'saldo', 'daily', 'quiz',
  'forca', 'rank', 'rankcoins', 'perfil', 'info', 'dono', 'id', 'menuaudio',
  'antilink', 'antispam', 'welcome', 'ban', 'kick', 'promote', 'link', 'todos',
  'aimemoria', 'airesetar', 'aiapis', 'imagem', 'figura', 'figubug', 'figubug2',
  'toimg', 'mediaup', 'medialist', 'mediadel', 'pinpacks', 'pinterest', 'pinmp4',
  'tiktok', 'instagram', 'fb', 'twitter', 'spotify', 'soundcloud',
  'help', 'cmds', 'comandos', 'pinsticker',
]);

// ── DETECÇÃO PRINCIPAL ───────────────────────────────────
/**
 * Detecta prefixo de forma rigorosa.
 * @param {string} text — texto da mensagem
 * @param {string} [groupJid] — JID do grupo (para prefixo per-group)
 * @returns {{ prefix: string, rest: string, source: string } | null}
 *   source: 'group' | 'global' | 'button_ns' | 'button_exact' | null
 */
async function detect(text, groupJid = null) {
  if (!text || typeof text !== 'string') return null;
  const trimmed = text.trimStart();
  if (!trimmed) return null;

  // 1. ID de botão com namespace (DB_xxx) — sempre válido
  if (isButtonId(trimmed)) {
    const parsed = parseButtonId(trimmed);
    if (parsed) {
      return { prefix: BTN_NS, rest: `${parsed.command} ${parsed.args}`.trim(), source: 'button_ns' };
    }
  }

  // 2. Determinar prefixos activos para este contexto
  const groupPrefix = await getGroupPrefix(groupJid);
  const activePrefixes = groupPrefix
    ? [groupPrefix]                              // grupo tem prefixo próprio → só esse
    : await getGlobalPrefixes();                 // senão → globais

  // 3. Tentar detectar o prefixo activo no início do texto
  const sorted = [...activePrefixes].sort((a, b) => b.length - a.length);
  for (const p of sorted) {
    if (trimmed.startsWith(p)) {
      // v6.39: NÃO faz trimLeft no rest — ". Play" deve ter rest=" Play" (com espaço)
      // para que o commandHandler detecte e rejeite (prefixo separado do comando)
      return { prefix: p, rest: trimmed.slice(p.length).trimEnd(), source: groupPrefix ? 'group' : 'global' };
    }
  }

  // 4. O texto começa com um símbolo de prefixo comum MAS não é o activo?
  //    → SILÊNCIO TOTAL (não sugere, não responde, não trata como botão)
  const firstChar = trimmed[0];
  if (COMMON_PREFIX_CHARS.has(firstChar)) {
    // É alguém a tentar usar um prefixo errado → ignorar completamente
    return null;
  }

  // 5. IDs exactos de botão — DESACTIVADO (v5.3)
  //    Antes: "Play" ou "Ping" sem prefixo activavam comandos (bug!)
  //    Agora: SÓ prefixo activo ou namespace DB_ funcionam.
  //    Botões dos menus já incluem o prefixo (ex: "$menup") ou DB_.
  //    Texto natural NUNCA activa comandos.

  // 6. Nada detectado → silêncio
  return null;
}

/**
 * Retorna o prefixo activo para exibição (dashboard, !prefixo, etc.)
 */
async function getActivePrefix(groupJid = null) {
  const gp = await getGroupPrefix(groupJid);
  if (gp) return gp;
  const list = await getGlobalPrefixes();
  return list[0] || config.bot.prefix || '!';
}

async function getAllActivePrefixes(groupJid = null) {
  const gp = await getGroupPrefix(groupJid);
  if (gp) return [gp];
  return getGlobalPrefixes();
}

async function setGlobalPrefixes(prefixes) {
  const arr = (Array.isArray(prefixes) ? prefixes : String(prefixes).split(/[\s,]+/))
    .map(p => String(p).trim()).filter(Boolean).slice(0, 5);
  if (!arr.length) arr.push('!');
  await BotConfig.findOneAndUpdate({ key: 'prefixes' }, { key: 'prefixes', value: arr }, { upsert: true, new: true });
  _globalCache = arr;
  _globalTs = Date.now();
  return arr;
}

function clearCaches() {
  _globalCache = null;
  _globalTs = 0;
  groupPrefixCache.clear();
}

module.exports = {
  detect,
  getGlobalPrefixes,
  getGroupPrefix,
  setGroupPrefix,
  clearGroupPrefix,
  getActivePrefix,
  getAllActivePrefixes,
  setGlobalPrefixes,
  isButtonId,
  parseButtonId,
  makeButtonId,
  clearCaches,
  BTN_NS,
  EXACT_BTN_IDS,
};
