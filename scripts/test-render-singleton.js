'use strict';
const assert = require('assert/strict');
const path = require('path');
const load = require('./helpers/load-isolated');
const base = path.join(__dirname, '..');
let groups = 0;

function fixture() {
  const realInterval = global.setInterval;
  const realClear = global.clearInterval;
  const timers = [];
  let whatsapp, reentries = 0, backups = 0, queries = 0;
  const query = value => {
    if (++queries > 150) throw new Error('unexpected query loop');
    const promise = Promise.resolve(value);
    return { then: (...a) => promise.then(...a), catch: (...a) => promise.catch(...a),
      lean: () => promise, sort() { return this; }, select() { return this; } };
  };
  const slot = { find: () => query([]), findOne: ({ slot: n }) => query({ slot: n, estado: 'vazia', prefixo: n === 1 ? '' : `slot${n}` }) };
  const sessions = { findOne: () => query(null), find: () => query([]) };
  const sc = load(path.join(base, 'src/bot/sessionCenter.js'), (id, req) => {
    if (id === '../database/models/Session') return sessions;
    if (id === '../database/models/SessionSlot') return slot;
    if (id === './whatsapp') return { getBot: (...a) => {
      // Bound the old bug so a regression fails instead of exhausting the real stack.
      if (++reentries > 4) throw new Error('recursive bot construction');
      return whatsapp.getBot(...a);
    } };
    return req(id);
  });
  const listeners = [];
  const originalOn = sc.on;
  sc.on = (event, fn) => { listeners.push({ event, fn }); return originalOn(event, fn); };
  whatsapp = load(path.join(base, 'src/bot/whatsapp.js'), (id, req) => {
    if (id === 'baileys-v6') return {};
    if (id === 'pino') return () => ({});
    if (id === 'qrcode') return {};
    if (id === 'fs') return { existsSync: () => true };
    if (id === 'mongoose') return { connection: { readyState: 0 } };
    if (id === '../config') return { bot: {}, owner: {} };
    if (id === './sessionCenter') return sc;
    if (id === './sessionBackup') return { arrancar: () => { backups++; } };
    if (id.startsWith('.')) return {};
    return req(id);
  });
  global.setInterval = (fn, ms) => { const timer = { fn, ms, unref() {} }; timers.push(timer); return timer; };
  global.clearInterval = () => {};
  return { whatsapp, sc, timers, listeners, counts: () => ({ backups, reentries, queries }),
    restore: () => { global.setInterval = realInterval; global.clearInterval = realClear; } };
}

async function test(name, run) { await run(); groups++; console.log('✓', name); }
(async () => {
  await test('The real session watcher sees the already published singleton, without constructing another bot', async () => {
    const f = fixture();
    try {
      const io = { fixture: 'io' }, bot = f.whatsapp.getBot(io);
      assert.equal(f.counts().reentries, 1, 'watcher re-entered an unpublished singleton');
      assert.equal(f.counts().backups, 1, 'duplicate bot construction started duplicate backups');
      assert.equal(f.listeners.length, 1, 'duplicate promover listeners');
      assert.equal(f.timers.length, 3, 'expected only session round, session health and bot health timers');
      assert.equal(bot.io, io);
      assert.equal(f.whatsapp.getBot(), bot);
      await Promise.resolve(); await Promise.resolve();
    } finally { f.restore(); }
  });
  await test('Repeated health/dashboard access does not create more timers or listeners', async () => {
    const f = fixture();
    try {
      const bot = f.whatsapp.getBot(); const before = f.timers.length;
      for (let n = 0; n < 25; n++) assert.equal(f.whatsapp.getBot(), bot);
      const io = {}; assert.equal(f.whatsapp.getBot(io).io, io);
      assert.equal(f.timers.length, before); assert.equal(f.listeners.length, 1); assert.equal(f.counts().backups, 1);
      await Promise.resolve(); await Promise.resolve();
    } finally { f.restore(); }
  });
  await test('Starting the session watcher first remains reentrancy-safe and idempotent', async () => {
    const f = fixture();
    try {
      f.sc.arrancarVigia(); const bot = f.whatsapp.getBot();
      f.sc.arrancarVigia();
      assert.equal(f.whatsapp.getBot(), bot);
      assert.equal(f.listeners.length, 1); assert.equal(f.counts().backups, 1);
      assert.equal(f.timers.length, 3, 'session watcher registered duplicate timers during re-entry');
      await Promise.resolve(); await Promise.resolve();
    } finally { f.restore(); }
  });
  console.log(`RENDER SINGLETON: ${groups} groups OK / 0 falhas; real watcher, mocked DB/socket/timers`);
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
