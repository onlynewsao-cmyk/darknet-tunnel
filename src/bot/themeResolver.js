/**
 * DARK BOT v5.3 — Theme Resolver
 * Resolve o tema activo por contexto (grupo ou global).
 * "Camuflagem 100%" — o tema aplica-se a TUDO neste grupo.
 */
'use strict';

const changeThemes = require('./changeThemes');
const botConfigCache = require('./botConfigCache');
const GroupSettings = require('../database/models/GroupSettings');
const { mongoose } = require('../database/connection');

// Cache por grupo (TTL 60s)
const _groupThemeCache = new Map();
const TTL = 60_000;

async function getThemeForContext(groupJid = null) {
  // 1. Tema por grupo (override)
  if (groupJid?.endsWith('@g.us') && mongoose.connection.readyState === 1) {
    const now = Date.now();
    const cached = _groupThemeCache.get(groupJid);
    if (cached && now - cached.ts < TTL) {
      if (cached.theme) return cached.theme;
    } else {
      try {
        const gs = await GroupSettings.findOne({ groupJid }).lean().catch(() => null);
        if (gs?.groupTheme) {
          const t = changeThemes.getTheme(gs.groupTheme);
          if (t) {
            _groupThemeCache.set(groupJid, { theme: t, ts: now });
            return t;
          }
        }
        _groupThemeCache.set(groupJid, { theme: null, ts: now });
      } catch {}
    }
  }

  // 2. Tema global
  const name = await botConfigCache.get('active_theme', 'dark').catch(() => 'dark');
  return changeThemes.getTheme(name || 'dark');
}

function clearCache() { _groupThemeCache.clear(); }

module.exports = { getThemeForContext, clearCache };
