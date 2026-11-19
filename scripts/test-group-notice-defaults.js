#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const {
  NOTICE_DEFAULTS_VERSION,
  NOTICE_DEFAULTS_MARKER,
  DEFAULT_WELCOME_TEMPLATE,
  DEFAULT_GOODBYE_TEMPLATE,
  groupNoticeDefaultsPatch,
  applyApprovedGroupNoticeDefaults,
} = require('../src/database/groupNoticeDefaults');

(async () => {
  const patch = groupNoticeDefaultsPatch();

  assert.ok(NOTICE_DEFAULTS_VERSION.includes('group-notices'));
  assert.ok(DEFAULT_WELCOME_TEMPLATE.includes('{user}'));
  assert.ok(DEFAULT_WELCOME_TEMPLATE.includes('{membros}'));
  assert.ok(DEFAULT_GOODBYE_TEMPLATE.includes('{user}'));
  assert.ok(!/@lid|@\d{12,}/i.test(DEFAULT_WELCOME_TEMPLATE), 'padrão nunca traz JID/LID estático');
  assert.ok(!/@lid|@\d{12,}/i.test(DEFAULT_GOODBYE_TEMPLATE), 'padrão nunca traz JID/LID estático');

  for (const key of ['welcome', 'goodbye', 'welcomeEnabled', 'goodbyeEnabled', 'x9', 'welcome2', 'welcm3', 'botArrivalNotify']) {
    assert.strictEqual(patch[key], false, `${key} deve iniciar desligado`);
  }
  // O reset aprovado substitui as mensagens personalizadas pelos padrões,
  // mas não liga/desliga protecções de moderação.
  for (const key of ['autoapresentar', 'antifoba', 'antisticker', 'antistickerNotify', 'fobaBlacklist']) {
    assert.ok(!(key in patch), `${key} não deve ser alterado pelo reset de avisos`);
  }
  assert.strictEqual(patch.customWelcome, DEFAULT_WELCOME_TEMPLATE);
  assert.strictEqual(patch.customGoodbye, DEFAULT_GOODBYE_TEMPLATE);
  assert.strictEqual(patch.customWelcomeMsg, DEFAULT_WELCOME_TEMPLATE);
  assert.strictEqual(patch.customGoodbyeMsg, DEFAULT_GOODBYE_TEMPLATE);
  const schemaSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'database', 'models', 'GroupSettings.js'), 'utf8');
  for (const key of ['welcome', 'goodbye', 'welcomeEnabled', 'goodbyeEnabled', 'x9']) {
    assert.ok(new RegExp(`${key}:\\s*\\{ type: Boolean, default: false \}`).test(schemaSource), `${key} default do schema é OFF`);
  }

  // Sem Mongo real: prova que a reposição é global, destrutiva apenas uma vez
  // e não volta a apagar escolhas dos admins em reinícios posteriores.
  const originalRequire = Module.prototype.require;
  const markers = new Map();
  const updates = [];
  Module.prototype.require = function patchedRequire(id) {
    const path = String(id);
    if (path.endsWith('models/GroupSettings')) {
      return {
        updateMany: async (filter, operation) => {
          updates.push({ filter, operation });
          return { matchedCount: 7, modifiedCount: 7 };
        },
      };
    }
    if (path.endsWith('models/BotConfig')) {
      return {
        get: async (key) => markers.get(key) || null,
        set: async (key, value) => { markers.set(key, value); return value; },
      };
    }
    return originalRequire.apply(this, arguments);
  };
  try {
    const first = await applyApprovedGroupNoticeDefaults();
    assert.strictEqual(first.applied, true);
    assert.strictEqual(first.matched, 7);
    assert.deepStrictEqual(updates[0].filter, {});
    assert.deepStrictEqual(updates[0].operation.$set, patch);
    assert.strictEqual(markers.get(NOTICE_DEFAULTS_MARKER).version, NOTICE_DEFAULTS_VERSION);

    const second = await applyApprovedGroupNoticeDefaults();
    assert.deepStrictEqual(second, { applied: false, reason: 'already-applied', matched: 0, modified: 0 });
    assert.strictEqual(updates.length, 1, 'marcador impede uma segunda reposição');

  } finally {
    Module.prototype.require = originalRequire;
  }

  console.log('✅ group notice defaults OK');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
