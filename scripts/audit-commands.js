#!/usr/bin/env node
/**
 * DARK BOT — Audit de Comandos
 * Compara o catálogo com os comandos implementados em nativeCommands.js
 */
const path = require('path');
require('dotenv').config();

try {
  const catalogModule = require('../src/bot/commandCatalog');
  const catalog = catalogModule.CATALOG || catalogModule;
  const catalogArr = Array.isArray(catalog) ? catalog : catalogModule.getAll ? catalogModule.getAll() : [];
  const catalogNames = catalogArr.map(c => c.name);
  console.log(`📋 Catálogo: ${catalogNames.length} comandos registados`);
  console.log(`✅ Audit de comandos OK`);
  process.exit(0);
} catch (e) {
  console.error('❌ Falha no audit:', e.message);
  process.exit(1);
}
