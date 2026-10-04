#!/usr/bin/env node
'use strict';
/** Regressão: cenas locais, fallback visual e comandos de galeria do DARK RPG. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const visuals = require('../src/bot/rpg/visuals');

(async () => {
  const sceneKeys = ['arena', 'market', 'portals'];
  for (const key of sceneKeys) {
    const file = visuals.assetPath(key);
    const asset = visuals.image(key);
    assert(fs.existsSync(file), `${key} tem asset local`);
    assert(asset?.length > 100000, `${key} não pode ser um placeholder vazio`);
    assert(asset.slice(0, 2).equals(Buffer.from([0xff, 0xd8])), `${key} é JPEG pronto para WhatsApp`);
    assert(fs.statSync(file).size < 600000, `${key} permanece leve para envio rápido`);
  }

  const sent = [];
  const sock = {
    waUploadToServer: async () => ({}),
    sendMessage: async (_jid, content) => { sent.push(content); return {}; },
  };
  const ctx = { remoteJid: 'grupo@g.us', senderJid: '244900000001@s.whatsapp.net' };
  assert.strictEqual(await visuals.sendScene(sock, {}, ctx, 'arena'), true, 'cena envia quando media está disponível');
  assert(Buffer.isBuffer(sent[0].image), 'a arena é enviada como buffer local');
  assert(/Arena das Sombras/i.test(sent[0].caption), 'a legenda descreve a cena RPG');
  assert.strictEqual(await visuals.sendScene({ sendMessage: async () => {} }, {}, ctx, 'market'), false, 'sem uploader não bloqueia o comando');

  const commands = new Map();
  require('../src/bot/cases/rpgVisuals')((names, handler) => {
    for (const name of [].concat(names)) commands.set(name, handler);
  });
  for (const cmd of ['cenariosrpg', 'rpgcard', 'rpggif']) {
    assert(commands.has(cmd), `${cmd} está registado`);
  }
  const gate = require('../src/bot/rpg/gate');
  assert(gate.LIVRE_CHAR.has('cenariosrpg'), 'a galeria pode ser vista antes de criar personagem');
  assert(gate.RPG_CMDS.has('rpgcard') && gate.RPG_CMDS.has('rpggif'), 'card e GIF respeitam o modo RPG e a ficha');

  console.log('✓ Visuais RPG: 3 cenas compactas, envio seguro e comandos de card/GIF/galeria validados.');
})().catch(err => { console.error('✗ RPG visuals failed:', err.stack || err); process.exit(1); });
