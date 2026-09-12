#!/usr/bin/env node
/**
 * DARK BOT — Smoke Test Local
 * Verifica que todos os módulos carregam sem erro
 */
require('dotenv').config();

const modules = [
  '../src/config',
  '../src/bot/buttonHandler',
  '../src/bot/botConfigCache',
  '../src/bot/prefixManager',
  '../src/bot/antiSpam',
  '../src/bot/antiLink',
  '../src/bot/systemZeroPlay',
  '../src/bot/menuBuilder',
  '../src/bot/menuThemes',
  '../src/bot/scheduler',
  '../src/bot/stickerMaker',
  '../src/bot/gifHelper',
  '../src/bot/themeFormatter',
  '../src/bot/userManager',
  '../src/bot/reactions',
  '../src/bot/commandCatalog',
  '../src/decrypter',
];

let ok = 0;
let fail = 0;

for (const mod of modules) {
  try {
    require(mod);
    console.log(`  ✅ ${mod}`);
    ok++;
  } catch (e) {
    console.error(`  ❌ ${mod}: ${e.message}`);
    fail++;
  }
}

console.log(`\n${ok} OK / ${fail} FALHOU`);
process.exit(fail > 0 ? 1 : 0);
