/**
 * DARK BOT v5.2 — Prefix Manager (wrapper compatível)
 * Delega no prefixEngine v2 (per-group + rigoroso).
 * Mantém a API antiga para não quebrar ficheiros existentes.
 */
'use strict';

const prefixEngine = require('./prefixEngine');
const config = require('../config');

async function getPrefixes() {
  return prefixEngine.getGlobalPrefixes();
}

async function setPrefixes(prefixes) {
  return prefixEngine.setGlobalPrefixes(prefixes);
}

async function detectPrefix(text) {
  // Sem groupJid → só detecta globais (compatibilidade antiga)
  return prefixEngine.detect(text, null);
}

async function getPrimaryPrefix() {
  const list = await prefixEngine.getGlobalPrefixes();
  return list[0] || config.bot.prefix || '!';
}

async function getPrefixDisplay() {
  const list = await prefixEngine.getGlobalPrefixes();
  return list.length > 1 ? list.join('  •  ') : list[0];
}

function clearCache() {
  prefixEngine.clearCaches();
}

module.exports = { getPrefixes, setPrefixes, detectPrefix, getPrimaryPrefix, getPrefixDisplay, clearCache };
