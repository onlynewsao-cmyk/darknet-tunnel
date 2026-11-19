#!/usr/bin/env node
'use strict';
const assert = require('assert/strict');

(async () => {
  const rpg = {};
  require('../src/bot/cases/rpgCommunity')((names, handler) => {
    for (const name of [].concat(names)) rpg[name] = handler;
  });
  assert.equal(typeof rpg.rpg, 'function', '!rpg abre o menu RPG, não uma sugestão para !rg');
  assert.equal(rpg.rpg, rpg.menurpg, '!rpg e !menurpg usam o mesmo painel');

  const groups = {};
  require('../src/bot/cases/grupos')((names, handler) => {
    for (const name of [].concat(names)) groups[name] = handler;
  });
  const calls = [];
  const replies = [];
  const ctx = {
    isGroup: true,
    isOwner: false,
    senderNumber: '244900000001',
    remoteJid: '120363-test@g.us',
  };
  const m = { key: { id: 'HIDE-1', remoteJid: ctx.remoteJid, participant: '244900000001@s.whatsapp.net' } };
  const sock = {
    groupMetadata: async () => ({ participants: [
      { id: '244900000001@s.whatsapp.net', admin: 'admin' },
      { id: '244900000002@s.whatsapp.net', admin: null },
    ] }),
    sendMessage: async (...args) => { calls.push(args); return {}; },
  };
  await groups.hidetag({ m, sock, ctx, args: ['big'], reply: async text => replies.push(text) });
  assert.deepEqual(replies, []);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].length, 2, 'hidetag não envia quoted nem aparece como resposta ao comando');
  assert.equal(calls[0][1].text, 'big');
  assert.deepEqual(calls[0][1].mentions, ['244900000001@s.whatsapp.net', '244900000002@s.whatsapp.net']);
  assert.deepEqual(calls[1], [ctx.remoteJid, { delete: m.key }], 'hidetag apaga o comando do admin depois de publicar');
  console.log('✅ !rpg abre o menu e !hidetag publica sem citação e apaga o comando.');
})().catch(error => { console.error(error); process.exit(1); });
