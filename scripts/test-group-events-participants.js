#!/usr/bin/env node
/**
 * v11.2.3 — group-participants.update com OBJECTOS Baileys
 * (regressão: add/remove sem welcome/goodbye)
 */
'use strict';
process.env.MONGODB_URI = '';
const assert = require('assert');
const Module = require('module');
const _orig = Module.prototype.require;

let _gs = {
  groupJid: '120363TEST@g.us',
  welcomeEnabled: true,
  goodbyeEnabled: true,
  welcome2: false,
  welcm3: false,
  x9: true,
  customWelcomeMsg: 'OI {user} no {grupo}',
  customGoodbyeMsg: 'TCHAU {user} de {grupo}',
};

Module.prototype.require = function (id) {
  const s = String(id);
  if (s === 'mongoose' || s.endsWith('/mongoose')) {
    const Sch = function () { return { index() { return this; } }; };
    Sch.Types = { Mixed: Object };
    return { Schema: Sch, model: () => ({}), models: {}, connect: async () => ({}) };
  }
  if (s.endsWith('GroupSettings') || s.endsWith('models/GroupSettings')) {
    return {
      findOne: () => ({ lean: async () => ({ ..._gs }), catch: async () => null }),
      create: async (d) => d,
    };
  }
  if (s.endsWith('botConfigCache')) {
    return { get: async (k, d) => (k === 'welcome_image_enabled' ? false : d), set: async () => {} };
  }
  if (s.endsWith('changeThemes')) {
    return { getTheme: () => ({ name: 'dark', emoji: '🕸️', icon: '🕸️', vibe: 'x', frame: ['╭','╮','╰','╯','─','│'], bullet: '•' }) };
  }
  if (s.endsWith('welcomeImage')) return { generateWelcomeImage: async () => null };
  if (s.endsWith('welcomeArt')) return { artCard: async () => null, artGif: async () => null };
  if (s.endsWith('antiFoba')) return { onJoin: async () => [] };
  if (s.endsWith('autoApresentar')) return { onParticipantsUpdate: async () => {} };
  if (s.endsWith('liveBroadcaster')) return { groupEvent: () => {} };
  if (s.endsWith('/config') || s.endsWith('src/config')) {
    return { bot: { name: 'DARK BOT', prefix: '!' }, owner: { name: 'Dark', number: '244900000' } };
  }
  return _orig.apply(this, arguments);
};

const sent = [];
const sock = {
  user: { id: '999:1@s.whatsapp.net', lid: '999@lid' },
  groupMetadata: async () => ({
    subject: 'Grupo Teste',
    participants: [
      { id: '111@s.whatsapp.net', admin: 'superadmin' },
      { id: '222@s.whatsapp.net' },
      { id: '999@s.whatsapp.net', admin: 'admin' },
    ],
  }),
  profilePictureUrl: async () => null,
  groupParticipantsUpdate: async () => ({}),
  sendMessage: async (jid, c) => { sent.push({ jid, ...c }); return { key: { id: 'k' } }; },
};

(async () => {
  console.log('=== normalizeParticipant + handle com OBJECTOS ===\n');
  // fresh module
  delete require.cache[require.resolve('../src/bot/groupEvents')];
  const ge = require('../src/bot/groupEvents');

  // 1) normalize
  const a = ge.normalizeParticipant('244912345678@s.whatsapp.net');
  assert.strictEqual(a.number, '244912345678');
  assert.ok(a.jid.includes('244912345678'));
  console.log('✔ string legacy ok');

  const b = ge.normalizeParticipant({
    id: '1234567890@lid',
    phoneNumber: '244999887766@s.whatsapp.net',
    lid: '1234567890@lid',
  });
  assert.strictEqual(b.number, '244999887766');
  assert.ok(b.pnJid.endsWith('@s.whatsapp.net'));
  assert.ok(b.jid.includes('244999887766') || b.pnJid.includes('244999887766'));
  console.log('✔ object Baileys (id=lid + phoneNumber) ok');

  const c = ge.normalizeParticipant({ id: '244111222333@s.whatsapp.net', admin: null });
  assert.strictEqual(c.number, '244111222333');
  console.log('✔ object com id PN ok');

  // 2) ADD com objecto → welcome
  sent.length = 0;
  ge._welDebug._ultimoWel.clear();
  ge._welDebug._comboWel.clear();
  await ge.handle(sock, {
    id: '120363TEST@g.us',
    action: 'add',
    participants: [
      { id: '999888777@lid', phoneNumber: '244555666777@s.whatsapp.net', lid: '999888777@lid' },
    ],
  });
  assert.ok(sent.length >= 1, 'devia enviar welcome, sent=' + sent.length);
  const wel = sent.find(s => /OI @244555666777 no Grupo Teste/.test(s.text || s.caption || ''));
  assert.ok(wel, 'welcome custom: ' + JSON.stringify(sent[0]));
  assert.ok((wel.mentions || []).some(m => String(m).includes('244555666777')), 'menção PN');
  console.log('✔ ADD object → welcome com número real + menção');

  // 3) X9 no add
  assert.ok(sent.some(s => /X9:.*entrou/.test(s.text || '')), 'x9 no add');
  console.log('✔ X9 anuncia entrada');

  // 4) REMOVE object → goodbye
  sent.length = 0;
  await ge.handle(sock, {
    id: '120363TEST@g.us',
    action: 'remove',
    participants: [
      { id: '999888777@lid', phoneNumber: '244555666777@s.whatsapp.net' },
    ],
  });
  assert.ok(sent.some(s => /TCHAU @244555666777 de Grupo Teste/.test(s.text || s.caption || '')), 'goodbye: ' + JSON.stringify(sent));
  console.log('✔ REMOVE object → goodbye');

  // 5) ADD string legacy ainda funciona
  sent.length = 0;
  ge._welDebug._ultimoWel.clear();
  await ge.handle(sock, {
    id: '120363TEST@g.us',
    action: 'add',
    participants: ['244123123123@s.whatsapp.net'],
  });
  assert.ok(sent.some(s => /OI @244123123123/.test(s.text || s.caption || '')), 'legacy string welcome');
  console.log('✔ ADD string legacy ok');

  // 6) bot add não dispara welcome de membro
  sent.length = 0;
  ge._welDebug._ultimoWel.clear();
  await ge.handle(sock, {
    id: '120363TEST@g.us',
    action: 'add',
    participants: [{ id: '999@s.whatsapp.net', phoneNumber: '999@s.whatsapp.net' }],
  });
  // onBotAdded envia trial text — não OI welcome
  assert.ok(!sent.some(s => /OI @/.test(s.text || '')), 'bot add não é welcome de membro');
  console.log('✔ bot adicionado → onBotAdded (não welcome membro)');

  console.log('\n✅ group-events participants OK\n');
})().catch((e) => { console.error(e); process.exit(1); });
