#!/usr/bin/env node
'use strict';
/**
 * Contrato da migração segura do runtime WhatsApp.
 * Garante que todo import do bot resolve no Baileys oficial v6 (alias npm),
 * que o fork removido não voltou ao código e que os payloads nativos geram.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const B = require('baileys-v6');
const lock = require(path.join(ROOT, 'package-lock.json'));
const OPTIONAL_GUARDED = new Set(['encryptPollVote']);
const REMOVED_PACKAGE = ['@systemzero', 'baileys'].join('/');

function filesUnder(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(full) : (entry.name.endsWith('.js') ? [full] : []);
  });
}

function importedKeys(text) {
  const keys = new Set();
  const re = /const\s*\{([\s\S]{0,300}?)\}\s*=\s*require\('baileys-v6'\)/g;
  for (const match of text.matchAll(re)) {
    for (const part of match[1].split(',')) {
      const key = part.trim().split(':')[0].trim();
      if (/^[A-Za-z_$][\w$]*$/.test(key)) keys.add(key);
    }
  }
  return keys;
}

(async () => {
  const sources = [...filesUnder(path.join(ROOT, 'src')), ...filesUnder(path.join(ROOT, 'scripts'))];
  const referenced = new Set();
  for (const file of sources) {
    const text = fs.readFileSync(file, 'utf8');
    assert(!text.includes(REMOVED_PACKAGE), `import malicioso/removido reapareceu: ${path.relative(ROOT, file)}`);
    for (const key of importedKeys(text)) referenced.add(key);
  }

  const missing = [...referenced]
    .filter((key) => !OPTIONAL_GUARDED.has(key) && B[key] === undefined)
    .sort();
  assert.deepStrictEqual(missing, [], `exports oficiais em falta: ${missing.join(', ')}`);
  assert.strictEqual(typeof B.default, 'function', 'makeWASocket oficial deve existir');
  assert.strictEqual(typeof B.proto?.Message?.InteractiveMessage?.fromObject, 'function', 'protobuf InteractiveMessage deve existir');
  assert.strictEqual(typeof B.generateWAMessageFromContent, 'function', 'gerador oficial deve existir');
  assert.strictEqual(typeof B.decryptPollVote, 'function', 'leitura de votos oficial deve existir');
  assert.strictEqual(typeof B.encryptPollVote, 'undefined', 'voto manual não suportado deve permanecer guardado');

  assert.strictEqual(lock.packages[`node_modules/${REMOVED_PACKAGE}`], undefined, 'lockfile não pode conter o pacote removido');
  assert.strictEqual(lock.packages['node_modules/baileys-v6']?.version, '6.7.24', 'alias deve fixar Baileys oficial v6.7.24');

  const { sendButtons, sendCarousel } = require(path.join(ROOT, 'src', 'bot', 'buttonHandler'));
  const sent = [];
  const sock = {
    user: { id: '244900000000@s.whatsapp.net' },
    waUploadToServer: async () => ({}),
    relayMessage: async (jid, message, options) => { sent.push({ jid, message, options }); return 'ok'; },
    sendMessage: async () => { throw new Error('não devia cair no fallback de texto'); },
  };
  await sendButtons(sock, '244911111111@s.whatsapp.net', 'Teste', 'DARK', [{ text: 'Abrir', id: '!menu' }]);
  assert(sent[0]?.message?.viewOnceMessage?.message?.interactiveMessage, 'botão deve ser InteractiveMessage oficial');
  await sendCarousel(sock, '244911111111@s.whatsapp.net', [{
    title: 'Carta', body: 'Corpo', footer: 'DARK', buttons: [{ text: 'Escolher', id: 'escolher_1' }],
  }]);
  assert.strictEqual(sent[1]?.message?.interactiveMessage?.carouselMessage?.cards?.length, 1, 'carrossel deve usar protobuf oficial');

  console.log(`BAILEYS MIGRATION: Baileys oficial ${require('baileys-v6/package.json').version}; ${referenced.size} exports verificados; InteractiveMessage e carrossel aprovados.`);
})().catch((error) => {
  console.error('BAILEYS MIGRATION: FAIL:', error.stack || error.message);
  process.exitCode = 1;
});
