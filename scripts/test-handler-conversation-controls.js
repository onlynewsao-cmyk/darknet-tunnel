'use strict';
const assert = require('assert/strict');
const path = require('path');
const loadIsolated = require('./helpers/load-isolated');
const conversation = require('../src/aura/auraConversation');
const controls = { ...conversation.createConversationControls({ storage: { load: () => ({}), save: () => {} } }), identityReply: conversation.identityReply, controlIntent: conversation.controlIntent };
const ownerIdentity = require('../src/bot/ownerIdentity');
const requestCache = require('../src/bot/requestCache');
const interpret = require('../src/aura/auraInterpret');
const values = { owner_number: '244900000001', owner_numbers: ['244900000002'], owner_lid: '555551234567890@lid' };
const cfg = { owner: { number: '244900000001' }, bot: { number: '244900000009', prefix: '.' } };
let prefixReads = 0, aiCalls = 0, listActions = 0;
const ch = loadIsolated(path.join(__dirname, '../src/bot/commandHandler.js'), (id, req) => {
  if (id === '../config') return cfg;
  if (id === './requestCache') return requestCache;
  if (id === './aiCancellation') return req(id);
  if (id === './ownerIdentity') return ownerIdentity;
  if (id === '../aura/auraConversation') return controls;
  if (id === '../aura/auraSanitizer') return req(id);
  if (id === '../aura/auraInterpret') return interpret;
  if (id === '../aura/auraDialogue') return req(id);
  if (id === './botConfigCache') return { get: async (key, fallback) => key in values ? values[key] : fallback };
  if (id === './caseHandler') return { init() {}, isInternalToken: () => false };
  if (id === './prefixEngine') return { getAllActivePrefixes: async () => { prefixReads++; return ['.', '!']; }, detect: async () => null };
  if (id === './userManager') return { normalizeNumber: value => String(value || '').replace(/\D/g, '') };
  if (id === './stickerWm') return { bind() {} };
  if (id === './ai') return { chat: async () => { aiCalls++; throw new Error('provider must not be reached'); } };
  if (id === './listaEscolha') return { tentarNumero: async () => { listActions++; return true; } };
  if (id === './hotCache') return { getUser: async () => null };
  // Este contrato testa controlos de conversa, não o gate comercial de grupo.
  // Mantém o grupo de fixture elegível para o fluxo chegar aos controlos.
  if (id === './groupEntitlement') return { hasActiveEntitlement: () => true };
  if (id.startsWith('.')) return {};
  return req(id);
});
const sent = [];
const sock = { user: { id: '244900000009:1@s.whatsapp.net' }, sendMessage: async (jid, content) => { sent.push({ jid, content }); return { key: { id: 'fixture' } }; } };
let sequence = 0, groups = 0;
function msg(text, sender = '244900000001', chat = '120000000000001@g.us') {
  return { key: { id: `fixture-${++sequence}`, remoteJid: chat, participant: `${sender}@s.whatsapp.net`, fromMe: false }, pushName: 'Dark', message: { conversation: text } };
}
async function test(name, fn) { await fn(); groups++; console.log('✓', name); }
(async () => {
  await test('Priority transport controls invalidate in-flight chat before waiting for work slots', async () => {
    const ctx = ch.getSenderInfo(msg('olá'), sock);
    const turn = controls.begin(ctx); turn.conversational = true;
    assert.equal(await ch.handleConversationControl(sock, msg('ignora-me')), true);
    assert.equal(controls.isPaused(ctx), true);
    assert.equal(await ch.handleConversationControl(sock, msg('volta a responder')), true);
    assert.equal(controls.canDeliver(ctx, turn), false);
    assert.equal(await ch.handle(sock, null), false);
  });
  await test('Pause is consumed before prefix routing, lists, reactions and model calls', async () => {
    const before = Date.now();
    assert.equal(await ch.handle(sock, msg('Ignore tudo que eu vou fazer a partir de agora')), true);
    assert.match(sent.at(-1).content.text, /Não vou responder/);
    assert.equal(prefixReads, 0); assert.equal(aiCalls, 0);
    const n = sent.length;
    await ch.handle(sock, msg('1'));
    await ch.handle(sock, msg('.menu'));
    assert.equal(listActions, 0); assert.equal(sent.length, n); assert.equal(prefixReads, 0);
    assert.ok(Date.now() - before < 1000, 'local control must not wait for a provider');
  });
  await test('Other participants cannot resume the Dark account; owner status never bypasses pause', async () => {
    await ch.handle(sock, msg('volta a responder', '244900000002'));
    const n = sent.length;
    await ch.handle(sock, msg('Quem sou eu?'));
    assert.equal(sent.length, n);
    await ch.handle(sock, msg('volta a responder'));
    await ch.handle(sock, msg('Quem sou eu?'));
    assert.match(sent.at(-1).content.text, /^És o Dark/);
  });
  await test('Display-name impostors, subowners and the bot account are not primary Dark', async () => {
    await ch.handle(sock, msg('Quem sou eu?', '244900000002'));
    assert.match(sent.at(-1).content.text, /subdono/);
    await ch.handle(sock, msg('Quem sou eu?', '244900000003'));
    assert.match(sent.at(-1).content.text, /Não identifiquei/);
    const outgoing = msg('Quem sou eu?', '244900000001', '244900000001@s.whatsapp.net'); outgoing.key.fromMe = true;
    await ch.handle(sock, outgoing);
    assert.match(sent.at(-1).content.text, /subdono/);
    assert.equal(ch.getSenderInfo(outgoing, sock).senderNumber, '244900000009');
  });
  await test('Normalizing a private LID preserves its verified identity', async () => {
    const raw = { key: { id: 'lid-fixture', remoteJid: '555551234567890@lid', remoteJidAlt: '244900000004@s.whatsapp.net' }, message: { conversation: 'Quem sou eu?' } };
    const normalized = ch.normalizeIncomingMsg(raw);
    assert.equal(normalized.key.remoteJid, raw.key.remoteJidAlt);
    assert.equal(ch.getSenderInfo(normalized).senderLid, '555551234567890');
    await ch.handle(sock, raw);
    assert.match(sent.at(-1).content.text, /^És o Dark/);
  });
  await test('A longer LID containing the configured digits is not an owner', async () => {
    const raw = { key: { remoteJid: '95555512345678900@lid', id: 'substring-fixture' }, message: { conversation: 'Quem sou eu?' } };
    const ctx = ch.getSenderInfo(raw, sock);
    assert.equal(ownerIdentity.matchesOwnerLid(ctx, raw, values.owner_lid), false);
    await ch.handle(sock, raw);
    assert.match(sent.at(-1).content.text, /ACESSO FREE NO PRIVADO/);
  });
  await test('Sensitive requests get a coherent boundary without invented targets or external access', async () => {
    await ch.handle(sock, msg('Me fazer gozar agora'));
    assert.equal(sent.at(-1).content.text, interpret.EXPLICIT_REPLY);
    assert.equal(aiCalls, 0);
  });
  await test('Diga oi is a literal text reply, without model/TTS calls; negations are not rewritten', async () => {
    const message = msg('Diga oi', '244900000001', '244900000001@s.whatsapp.net');
    await ch.handle(sock, message);
    assert.equal(sent.at(-1).content.text, 'Oi!');
    assert.equal(aiCalls, 0);
    const before = sent.length;
    const old = { ...message, key: { ...message.key, id: 'old-literal' }, messageTimestamp: Math.floor(Date.now() / 1000) - 1000 };
    await ch.handle(sock, old);
    assert.equal(sent.length, before, 'expired greeting cannot be delivered many minutes later');
    values.blacklist = ['244900000003'];
    await ch.handle(sock, msg('Diga oi', '244900000003', '120000000000002@g.us'));
    assert.equal(sent.length, before);
    delete values.blacklist;
  });
  await test('Private Free gate wins over conversation controls and explains the upgrade path', async () => {
    const privateMessage = msg('ignora-me', '244900000003', '244900000003@s.whatsapp.net');
    const before = sent.length;
    assert.equal(await ch.handle(sock, privateMessage), true);
    assert.equal(sent.length, before + 1);
    assert.match(sent.at(-1).content.text, /ACESSO FREE NO PRIVADO/);
  });
  await test('The real transport intake helper cancels only the verified sender/chat conversation', async () => {
    const chat = '120000000000099@g.us';
    const raw = msg('first question', '244900000001', chat);
    const ctx = ch.getSenderInfo(raw, sock);
    const first = controls.begin(ctx); first.conversational = true;
    assert.equal(ch.noteIncomingConversation(sock, msg('other participant', '244900000002', chat)), true);
    assert.equal(first.signal.aborted, false);
    const own = msg('bot echo', '244900000001', chat); own.key.fromMe = true;
    assert.equal(ch.noteIncomingConversation(sock, own), false);
    assert.equal(first.signal.aborted, false);
    assert.equal(ch.noteIncomingConversation(sock, msg('new question', '244900000001', chat)), true);
    assert.equal(first.signal.aborted, true);
  });
  // Execute the actual legacy direct-voice block without bootstrapping unrelated handlers.
  const source = require('fs').readFileSync(path.join(__dirname, '../src/bot/commandHandler.js'), 'utf8');
  // Bloco actual: pedido de voz explícito (auraUniversal) até ao pedido de canto.
  const voiceSource = source.slice(source.indexOf('    // Só converte um pedido de voz explícito'), source.indexOf("    if (_auraIntentUniversal.isExplicitAuraControlCommand(text, 'sing'))"));
  assert.ok(voiceSource.includes('speakWithFallback'));
  const _auraIntentUniversal = require('../src/aura/auraUniversal');
  const directVoice = new Function('require', 'AiMemory', '_auraIntentUniversal', `return async function(text, turn, sock, ctx, msg) { const t = text.toLowerCase(); ${voiceSource} }`);
  const voiceCtx = { remoteJid: 'fixture-voice', senderNumber: '244900000001', isGroup: false };
  const memory = [], delivered = [];
  let makeVoice = async () => Buffer.alloc(600);
  const voiceRun = directVoice(id => id === './ai' ? { speakWithFallback: (...args) => makeVoice(...args) } : require('../src/bot/aiCancellation'), { appendMessage: async (...args) => memory.push(args) }, _auraIntentUniversal);
  const voiceSock = { sendMessage: async (_jid, content) => { delivered.push(content); return {}; } };
  await test('Direct voice receives cancellation, uses the actual MP3 type and remembers delivered speech', async () => {
    const parent = new AbortController(), turn = { signal: parent.signal };
    makeVoice = async (text, _voice, options) => { assert.equal(text, 'Bom dia'); assert.equal(options.signal, parent.signal); return Buffer.alloc(600); };
    assert.equal(await voiceRun('Aura manda um áudio dizendo Bom dia', turn, voiceSock, voiceCtx, {}), true);
    assert.equal(turn.conversational, true); assert.equal(delivered.at(-1).mimetype, 'audio/mpeg');
    assert.equal(memory.at(-1)[2], 'assistant'); assert.equal(memory.at(-1)[3], 'Bom dia');
  });
  await test('Direct voice failure retains the requested literal content instead of inventing a reply', async () => {
    makeVoice = async () => null;
    await voiceRun('Aura manda um áudio dizendo Bom dia', {}, voiceSock, voiceCtx, {});
    assert.match(delivered.at(-1).text, /envio em texto\.\n\nBom dia$/);
  });
  await test('Cancelled direct voice produces neither a fallback nor a history append', async () => {
    const parent = new AbortController(); parent.abort();
    makeVoice = async (_text, _voice, options) => { require('../src/bot/aiCancellation').throwIfAborted(options.signal); };
    const before = [delivered.length, memory.length];
    assert.equal(await voiceRun('Aura manda um áudio dizendo Bom dia', { signal: parent.signal }, voiceSock, voiceCtx, {}), true);
    assert.deepEqual([delivered.length, memory.length], before);
  });
  await test('All handler TTS paths are linked to the conversational parent signal', async () => {
    const calls = source.split('\n').filter(line => line.includes('speakWithFallback('));
    assert.equal(calls.length, 3);
    for (const call of calls) assert.ok(call.includes('signal: turn?.signal'), call);
  });
  console.log(`HANDLER CONVERSATION CONTROLS: ${groups} groups OK / 0 falhas; no DB, providers or accounts`);
})().catch(err => { console.error(err); process.exitCode = 1; });
