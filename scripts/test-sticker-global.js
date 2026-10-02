#!/usr/bin/env node
/** Verifica o único default global usado pelo criador de figurinhas. */
'use strict';
const path = require('path');
const Module = require('module');
const wmPath = path.join(__dirname, '..', 'src', 'bot', 'stickerWm.js');
const values = {
  sticker_pack_url: 'https://whatsapp.com/channel/AAAAAAAAAAAA',
  sticker_pack_brand: 'Marca Inicial',
  sticker_wm_slogan: 'Descrição inicial',
  sticker_wm_cta: 'Seguir',
};
const cache = {
  get: async (key, fallback) => Object.prototype.hasOwnProperty.call(values, key) ? values[key] : fallback,
  clear: () => {},
};
const BotConfig = { set: async (key, value) => { values[key] = value; } };
const original = Module.prototype.require;
Module.prototype.require = function patchedRequire(id) {
  if (id === './botConfigCache') return cache;
  if (id === '../database/models/BotConfig') return BotConfig;
  if (id === './stickerMaker') return { makePackId: (seed) => `test.${String(seed).length}` };
  return original.apply(this, arguments);
};

(async () => {
  const wm = require(wmPath);
  const assert = (condition, label) => {
    console.log(`${condition ? '✅' : '❌'} ${label}`);
    if (!condition) process.exitCode = 1;
  };

  const first = await wm.saveGlobalDefault({ channelName: 'Pacote Global' });
  assert(first.packName === 'Pacote Global', 'saveGlobalDefault grava o nome');
  assert(values.sticker_pack_name === 'Pacote Global' && values.sticker_pack_channel_name === 'Pacote Global', 'nome novo e legado ficam sincronizados');

  const second = await wm.saveGlobalDefault({ brand: 'Autor Global', authorName: 'Autor Global' });
  assert(second.packName === 'Pacote Global' && second.authorName === 'Autor Global', 'autor parcial preserva o nome existente');
  assert(values.sticker_pack_brand === 'Autor Global' && values.sticker_author_name === 'Autor Global', 'autor novo e legado ficam sincronizados');
  assert(values.sticker_pack_url === 'https://whatsapp.com/channel/AAAAAAAAAAAA', 'alteração parcial preserva o link');

  const resolved = await wm.getGlobalDefault();
  assert(resolved.packName === 'Pacote Global' && resolved.authorName === 'Autor Global', 'getGlobalDefault devolve os metadados escolhidos');
  const appliedWithoutCtx = await wm.apply({});
  assert(appliedWithoutCtx.packName === 'Pacote Global' && appliedWithoutCtx.authorName === 'Autor Global', 'create sem ctx também recebe o default global');

  Module.prototype.require = original;
  process.exit(process.exitCode || 0);
})().catch((err) => {
  Module.prototype.require = original;
  console.error('💥', err.stack || err.message);
  process.exit(1);
});
