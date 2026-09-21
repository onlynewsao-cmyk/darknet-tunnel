#!/usr/bin/env node
/**
 * v11.2.2 — Admin extra (ex-stubs) + ausência de «Funcionalidade activa»
 */
'use strict';
process.env.MONGODB_URI = '';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');

const _orig = Module.prototype.require;
let _gs = null;
let _gsUpdates = [];
let _botcfg = new Map();
let _gmaReset = 0;

Module.prototype.require = function (id) {
  const s = String(id);
  if (s === 'mongoose' || s.endsWith('/mongoose')) {
    const Sch = function () { return { index() { return this; }, pre() { return this; } }; };
    Sch.Types = { ObjectId: String, Mixed: Object, Map: Map };
    return { Schema: Sch, model: (n) => ({ modelName: n }), models: {}, connect: async () => ({}) };
  }
  if (s.endsWith('GroupSettings') || s.endsWith('models/GroupSettings')) {
    return {
      findOne: () => ({ lean: async () => (_gs ? { ..._gs } : null) }),
      findOneAndUpdate: async (q, u) => {
        _gsUpdates.push([q, u]);
        const base = { ...(_gs || { groupJid: q.groupJid }) };
        if (u?.$setOnInsert && !_gs) Object.assign(base, u.$setOnInsert);
        if (u && !u.$setOnInsert && !u.$set && !u.$push && !u.$addToSet && !u.$pull && !u.$unset) Object.assign(base, u);
        if (u?.$set) Object.assign(base, u.$set);
        _gs = { ...base };
        return {
          ..._gs,
          save: async function () { _gs = { ...this }; Object.keys(this).forEach(k => { if (k !== 'save') _gs[k] = this[k]; }); return this; },
        };
      },
    };
  }
  if (s.endsWith('GroupMemberActivity') || s.endsWith('models/GroupMemberActivity')) {
    return { updateMany: async () => { _gmaReset++; return { modifiedCount: 3 }; } };
  }
  if (s.endsWith('BotConfig') || s.endsWith('models/BotConfig')) {
    return {
      get: async (k, d) => (_botcfg.has(k) ? _botcfg.get(k) : d),
      set: async (k, v) => { _botcfg.set(k, v); },
    };
  }
  if (s.endsWith('botConfigCache')) {
    return { get: async (k, d) => d, set: async () => {} };
  }
  if (s.endsWith('packages/economy') || s.endsWith('/economy')) {
    return { trabalhar: async ({ reply }) => reply && reply('💼 work ok') };
  }
  return _orig.apply(this, arguments);
};

const sent = [];
const sock = {
  user: { id: '999@s.whatsapp.net' },
  groupMetadata: async () => ({
    subject: 'Test',
    participants: [
      { id: '111@s.whatsapp.net', admin: 'superadmin' },
      { id: '222@s.whatsapp.net', admin: null },
      { id: '999@s.whatsapp.net', admin: 'admin' },
    ],
  }),
  groupInviteCode: async () => 'ABC123LINK',
  groupParticipantsUpdate: async () => ({}),
  groupRequestParticipantsList: async () => [{ jid: '333@s.whatsapp.net' }, { jid: '444@s.whatsapp.net' }],
  groupRequestParticipantsUpdate: async () => ({}),
  sendMessage: async (jid, c) => { sent.push(c); return { key: { id: 'k' } }; },
};
const CTX = (e = {}) => ({
  remoteJid: '120363X@g.us', senderNumber: '111', senderJid: '111@s.whatsapp.net',
  isGroup: true, isOwner: false, prefix: '!', pushName: 'Adm', ...e,
});
const reply = async (t) => { sent.push({ text: t }); return t; };
const msg = (mentions = []) => ({
  key: { id: 'm1' },
  message: {
    extendedTextMessage: {
      text: 'x',
      contextInfo: { mentionedJid: mentions },
    },
  },
});

let ok = 0, fail = 0;
const t = (n, c, e = '') => { if (c) { ok++; console.log('  ✔', n); } else { fail++; console.log('  ❌', n, e); } };

(async () => {
  console.log('\n=== 1. Stubs mortos sumiram do audioAdmin2 ===');
  const audio = fs.readFileSync(path.join(__dirname, '../src/bot/cases/audioAdmin2.js'), 'utf8');
  t('sem Funcionalidade activa', !/Funcionalidade activa/.test(audio));
  t('sem miscAdmin loop', !/const miscAdmin\s*=/.test(audio));

  console.log('\n=== 2. adminExtra regista os 34 ex-stubs ===');
  const reg = new Map();
  require('../src/bot/cases/adminExtra')((cmds, fn) => {
    for (const c of [].concat(cmds)) reg.set(String(c).toLowerCase(), fn);
  });
  const must = [
    'aprovar', 'recusarsolic', 'aceitatodos',
    'addblacklist', 'delblacklist', 'listblacklist',
    'blockuser', 'unblockuser', 'blockcmd', 'unblockcmd',
    'addmod', 'delmod', 'listmods', 'grantmodcmd', 'revokemodcmd', 'listmodcmds',
    'adv', 'rmadv',
    'addautoadm', 'addautoadmidia', 'delautoadm', 'listautoadm',
    'addparceria', 'delparceria', 'parcerias',
    'x9', 'captcha', 'antitoxic', 'autorepo', 'multiprefixo',
    'resetrank', 'limparrank',
    'setbammsg', 'proibir', 'em', 'linkgp', 'emprego',
    'listaddd', 'listaddi',
  ];
  for (const c of must) t('regista ' + c, reg.has(c));

  console.log('\n=== 3. Comportamento real ===');
  // blacklist
  sent.length = 0; _gs = null; _gsUpdates = [];
  await reg.get('addblacklist')({
    sock, msg: msg(['222@s.whatsapp.net']), ctx: CTX(), args: [], reply,
  });
  t('addblacklist grava número', (_gs?.blacklist || []).map(String).some(x => x.includes('222')), JSON.stringify(_gs));

  sent.length = 0;
  await reg.get('blockcmd')({
    sock, msg: msg(), ctx: CTX(), args: ['play', 'sticker'], reply,
  });
  t('blockcmd grava play+sticker', (_gs?.blockedCommands || []).includes('play') && (_gs?.blockedCommands || []).includes('sticker'), JSON.stringify(_gs?.blockedCommands));

  sent.length = 0;
  await reg.get('addmod')({
    sock, msg: msg(['222@s.whatsapp.net']), ctx: CTX(), args: [], reply,
  });
  t('addmod grava 222', (_gs?.mods || []).some(m => String(m).includes('222')));

  sent.length = 0;
  await reg.get('x9')({ sock, msg: msg(), ctx: CTX(), args: ['on'], reply, prefix: '!' });
  t('x9 on', _gs?.x9 === true, JSON.stringify(_gs?.x9));

  sent.length = 0;
  await reg.get('antitoxic')({ sock, msg: msg(), ctx: CTX(), args: ['on'], reply, prefix: '!' });
  t('antitoxic on', _gs?.antitoxic === true);

  sent.length = 0; _gmaReset = 0;
  await reg.get('resetrank')({ sock, msg: msg(), ctx: CTX(), args: [], reply });
  t('resetrank chama updateMany', _gmaReset === 1);
  t('resetrank confirma', sent.some(s => /Rank.*limpo/i.test(s.text || '')));

  sent.length = 0;
  await reg.get('linkgp')({ sock, msg: msg(), ctx: CTX(), args: [], reply });
  t('linkgp devolve invite', sent.some(s => /chat\.whatsapp\.com\/ABC123LINK/.test(s.text || '')));

  sent.length = 0;
  await reg.get('aceitatodos')({ sock, msg: msg(), ctx: CTX(), args: [], reply });
  t('aceitatodos aprova lista', sent.some(s => /2.*solicit/i.test(s.text || '') || /aprovad/i.test(s.text || '')));

  sent.length = 0;
  await reg.get('setbammsg')({ sock, msg: msg(), ctx: CTX(), args: ['{user}', 'banido'], reply, prefix: '!' });
  t('setbammsg grava', /banido/.test(_gs?.banMsg || ''));

  sent.length = 0;
  await reg.get('proibir')({ sock, msg: msg(), ctx: CTX(), args: ['palavrao'], reply, prefix: '!' });
  t('proibir + antipalavra', (_gs?.palavrasProibidas || []).includes('palavrao') && _gs?.antipalavra === true);

  // membro comum bloqueado
  sent.length = 0; _gs = { mods: [] };
  await reg.get('addmod')({
    sock, msg: msg(['222@s.whatsapp.net']),
    ctx: CTX({ senderNumber: '222', isOwner: false }),
    args: [], reply,
  });
  t('não-admin bloqueado no addmod', sent.some(s => /Só o \*Dono\*/i.test(s.text || '') || /Admins/i.test(s.text || '')));

  console.log('\n=== 4. Schema campos novos ===');
  const sch = fs.readFileSync(path.join(__dirname, '../src/database/models/GroupSettings.js'), 'utf8');
  for (const f of ['blacklist', 'mods', 'modCommands', 'autoAdmins', 'parcerias', 'x9', 'captcha', 'multiprefixo', 'banMsg', 'groupEmoji']) {
    t('schema.' + f, sch.includes(f));
  }

  console.log('\n=== 5. groupEvents auto-adm + x9 ===');
  const ge = fs.readFileSync(path.join(__dirname, '../src/bot/groupEvents.js'), 'utf8');
  t('autoAdmins promote', /autoAdmins/.test(ge) && /promote/.test(ge));
  t('x9 announce', /gs\?\.x9/.test(ge));

  console.log('\n=== 6. prefix multiprefixo + cmd blacklist grupo ===');
  const pe = fs.readFileSync(path.join(__dirname, '../src/bot/prefixEngine.js'), 'utf8');
  t('prefixEngine multiprefixo', /multiprefixo/.test(pe));
  const ch = fs.readFileSync(path.join(__dirname, '../src/bot/commandHandler.js'), 'utf8');
  t('commandHandler group blacklist', /blacklist POR GRUPO/.test(ch));

  console.log('\n───────────────────────────────');
  console.log((fail === 0 ? '✅' : '❌') + ` ${ok} OK / ${fail} FALHOU\n`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
