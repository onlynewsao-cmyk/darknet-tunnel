'use strict';
const assert = require('assert/strict');
const path = require('path');
const loadIsolated = require('./helpers/load-isolated');
const { withTimeout } = require('../src/bot/aiTimeout');
const { runAbortable, isAbort } = require('../src/bot/aiCancellation');
const { createConversationControls } = require('../src/aura/auraConversation');
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function fixture(capacity = '1', interrupt = false) {
  const controls = createConversationControls({ storage: { load: () => ({}), save: () => {} } });
  const actor = msg => ({ remoteJid: msg.key.remoteJid, senderJid: msg.key.participant || msg.key.remoteJid });
  const before = process.env.ROUTER_MAX_VOO; process.env.ROUTER_MAX_VOO = capacity;
  const state = { controls: 0, cancelled: 0, arrivals: [], paused: false, normal: 0, autoDl: 0, moderation: 0, active: 0, max: 0, starts: [], slowStarted: deferred(), releaseSlow: deferred() };
  const cmd = {
    extractText: msg => msg.message?.conversation || '', normalizeIncomingMsg: msg => msg,
    getSenderInfo: msg => ({ remoteJid: msg.key.remoteJid, senderJid: msg.key.participant || msg.key.remoteJid }),
    noteIncomingConversation(_sock, msg) {
      state.arrivals.push(msg.key.id);
      if (interrupt) controls.noteIncoming(actor(msg), { messageId: msg.key.id });
    },
    async handleConversationControl(_sock, msg) {
      const text = cmd.extractText(msg);
      if (!['ignora-me', 'volta a responder'].includes(text)) return false;
      state.controls++; state.paused = text === 'ignora-me'; return true;
    },
    async handle(_sock, msg) {
      state.normal++; state.active++; state.max = Math.max(state.max, state.active); state.starts.push(msg.key.id);
      const turn = interrupt ? controls.begin(actor(msg), { messageId: msg.key.id }) : null;
      if (turn) turn.conversational = true;
      try {
        if (interrupt && msg.key.id === 'slow') {
          state.slowStarted.resolve();
          await runAbortable(() => new Promise(() => {}), { signal: turn.signal });
        } else if (msg.key.id === 'slow') { state.slowStarted.resolve(); await state.releaseSlow.promise; }
        else await new Promise(resolve => setImmediate(resolve));
        return true;
      } catch (error) {
        if (!isAbort(error)) throw error;
        state.cancelled++; return false;
      } finally { if (turn) controls.finish(turn); state.active--; }
    },
  };
  const router = loadIsolated(path.join(__dirname, '../src/bot/messageRouter.js'), (id, req) => {
    if (id === './commandHandler') return cmd;
    if (id === '../aura/auraConversation') return { isPaused: () => state.paused };
    if (id === './messageListener') return { onUpsert: async () => {} };
    if (id === './autoDl') return { check: async () => { state.autoDl++; return false; } };
    if (id === './antiLink') return { check: async () => { state.moderation++; return false; } };
    if (id === './autoApresentar') return { onMessage() {} };
    if (id === './humanizer') return { notaRecebida() {}, lerSemResponder() {} };
    if (id === './prefixEngine') return { getAllActivePrefixes: async () => ['.'] };
    if (id.startsWith('.')) return { check: async () => false };
    return req(id);
  });
  if (before === undefined) delete process.env.ROUTER_MAX_VOO; else process.env.ROUTER_MAX_VOO = before;
  return { state, router, bot: { sock: {} } };
}
function message(id, text = 'ordinary conversation', chat = id + '@s.whatsapp.net') {
  return { key: { id, remoteJid: chat }, message: { conversation: text } };
}
const batch = (...messages) => ({ type: 'notify', messages });
(async () => {
  const a = fixture();
  const busy = a.router.process(a.bot, batch(message('slow')));
  await a.state.slowStarted.promise;
  await withTimeout(a.router.process(a.bot, batch(message('pause', 'ignora-me'))), 500);
  assert.equal(a.state.controls, 1); assert.equal(a.state.paused, true); assert.equal(a.state.active, 1);
  await a.router.process(a.bot, batch(message('pause', 'ignora-me')));
  assert.equal(a.state.controls, 1, 'a replayed control must not produce a second acknowledgement');
  a.state.releaseSlow.resolve(); await busy;
  const dl = a.state.autoDl, moderation = a.state.moderation;
  await a.router.process(a.bot, batch(message('paused-conversation')));
  assert.equal(a.state.autoDl, dl); assert.equal(a.state.moderation, moderation + 1, 'self-pause does not disable group safety checks');
  const b = fixture();
  await b.router.process(b.bot, batch(message('earlier', 'normal', 'same@s.whatsapp.net'), message('control-later', 'ignora-me', 'same@s.whatsapp.net')));
  assert.equal(b.state.controls, 1); assert.equal(b.state.autoDl, 0, 'a later pause in a batch is applied before earlier expensive work');
  // O mesmo evento chega por vezes como LID e em seguida como PN. Deve
  // percorrer o handler apenas uma vez, mesmo com chat bruto diferente.
  const aliases = fixture();
  const lidCopy = { key: { id: 'same-event', remoteJid: '998877665544@lid', remoteJidAlt: '244911111111@s.whatsapp.net' }, message: { conversation: 'oi' } };
  const pnCopy = { key: { id: 'same-event', remoteJid: '244911111111@s.whatsapp.net' }, message: { conversation: 'oi' } };
  await aliases.router.process(aliases.bot, batch(lidCopy));
  await aliases.router.process(aliases.bot, batch(pnCopy));
  assert.equal(aliases.state.normal, 1, 'LID e PN alternativos do mesmo evento não podem gerar resposta duplicada');

  const c = fixture();
  await Promise.all(Array.from({ length: 12 }, (_, n) => c.router.process(c.bot, batch(message('fifo-' + n)))));
  assert.equal(c.state.max, 1); assert.deepEqual(c.state.starts, Array.from({ length: 12 }, (_, n) => 'fifo-' + n));
  for (const capacity of ['0', 'invalid', '-2', 'Infinity']) {
    const d = fixture(capacity);
    await withTimeout(Promise.all(Array.from({ length: 10 }, (_, n) => d.router.process(d.bot, batch(message('invalid-' + n))))), 1000);
    assert.ok(d.state.max <= 8); assert.equal(d.state.normal, 10);
    const before = d.state.normal;
    await d.router.process(d.bot, { type: 'append', messages: [message('history')] });
    assert.equal(d.state.normal, before);
  }
  const ordered = fixture();
  const olderBatch = ordered.router.process(ordered.bot, batch(message('batch-A-1'), message('batch-A-2')));
  const newerBatch = ordered.router.process(ordered.bot, batch(message('batch-B')));
  await Promise.all([olderBatch, newerBatch]);
  assert.deepEqual(ordered.state.arrivals, ['batch-A-1', 'batch-A-2', 'batch-B']);
  const interrupted = fixture('1', true);
  const busyChat = 'same-chat@s.whatsapp.net';
  const first = interrupted.router.process(interrupted.bot, batch(message('slow', 'first question', busyChat)));
  await interrupted.state.slowStarted.promise;
  const second = interrupted.router.process(interrupted.bot, batch(message('newest', 'new question', busyChat)));
  await withTimeout(Promise.all([first, second]), 1000);
  assert.equal(interrupted.state.cancelled, 1);
  assert.equal(interrupted.state.max, 1);
  assert.deepEqual(interrupted.state.arrivals, ['slow', 'newest']);
  assert.deepEqual(interrupted.state.starts, ['slow', 'newest']);
  console.log('MESSAGE ROUTER CONTROLS: priority under saturation, same-batch pause, replay dedup, moderation, FIFO, arrival cancellation under a full queue and 4 invalid capacity values OK');
})().catch(err => { console.error(err); process.exitCode = 1; });
