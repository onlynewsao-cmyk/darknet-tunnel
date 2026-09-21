#!/usr/bin/env node
/**
 * DARK BOT — Welcome / Welcome2 / Welcm3 / Goodbye (regressão)
 *
 * Garante:
 *  1. cases registados (welcome, goodbye, legendabv, fotobv, welcome2, welcm3…)
 *  2. audioAdmin2 NÃO rouba mais bv/legendabv com stubs
 *  3. toggles gravam em GroupSettings (não em botConfigCache solto)
 *  4. groupEvents.onJoin respeita welcomeEnabled + welcome2/welcm3/custom media
 *  5. groupEvents.onLeave respeita goodbyeEnabled + customGoodbyeMsg + foto
 *  6. welcome2 ⇆ welcm3 exclusivos
 */
'use strict';

const assert = require('assert');
const Module = require('module');
const path = require('path');
const fs = require('fs');

process.env.MONGODB_URI = '';

// ── mocks ────────────────────────────────────────────────────
const _orig = Module.prototype.require;
let _gsDoc = null;
let _gsUpdates = [];
let _cache = new Map();

function leanDoc(d) {
  return d ? { ...d } : null;
}

class FakeGS {
  constructor(data) { Object.assign(this, data); }
  async save() { _gsDoc = { ...this }; return this; }
}

Module.prototype.require = function (id) {
  const s = String(id);
  // deps pesadas / nativas — stubs leves
  if (s === 'mongoose' || s.endsWith('/mongoose')) {
    const fakeSchema = function () { return { index() { return this; }, pre() { return this; }, methods: {}, statics: {} }; };
    fakeSchema.Types = { ObjectId: String, Mixed: Object };
    return {
      Schema: fakeSchema,
      model: (n, s) => ({ modelName: n, findOne() { return { lean: async () => null, then: (r) => r(null) }; }, findOneAndUpdate: async () => ({}), create: async (d) => d }),
      models: {},
      connect: async () => ({}),
    };
  }
  if (s === 'cloudinary' || s.endsWith('cloudinary')) {
    return { v2: { config: () => ({}), uploader: { upload_stream: () => ({ end() {} }) } } };
  }
  if (s === 'sharp') {
    const chain = {
      resize() { return chain; }, jpeg() { return chain; }, png() { return chain; },
      composite() { return chain; }, toBuffer: async () => Buffer.alloc(100), metadata: async () => ({ width: 1, height: 1 }),
    };
    const sharp = () => chain;
    sharp.mock = true;
    return sharp;
  }
  if (s.endsWith('models/Economy') || s.endsWith('Economy')) {
    return { findOne: async () => null, findOneAndUpdate: async () => ({}) };
  }
  if (s.endsWith('botConfigCache') || s.endsWith('/botConfigCache')) {
    // handled below too — keep single path
  }
  if (s.endsWith('GroupSettings') || s.endsWith('models/GroupSettings')) {
    return {
      findOne: (q) => ({
        lean: async () => leanDoc(_gsDoc),
        then: (r, j) => Promise.resolve(_gsDoc ? new FakeGS({ ..._gsDoc }) : null).then(r, j),
        catch: () => Promise.resolve(null),
      }),
      findOneAndUpdate: async (q, u, opts) => {
        _gsUpdates.push([q, u, opts]);
        const base = { ...(_gsDoc || { groupJid: q.groupJid }) };
        if (u && u.$setOnInsert && !_gsDoc) Object.assign(base, u.$setOnInsert);
        if (u && !u.$setOnInsert && !u.$set && !u.$push) Object.assign(base, u);
        if (u && u.$set) Object.assign(base, u.$set);
        _gsDoc = { ...base };
        return new FakeGS({ ..._gsDoc });
      },
      create: async (d) => { _gsDoc = { ...d }; return new FakeGS(d); },
    };
  }
  if (s.endsWith('botConfigCache') || s.endsWith('/botConfigCache')) {
    return {
      get: async (k, def) => (_cache.has(k) ? _cache.get(k) : def),
      set: async (k, v) => { _cache.set(k, v); },
    };
  }
  if (s.endsWith('renderEngine') || s.endsWith('/renderEngine')) {
    return {
      getTheme: async () => ({ icon: '🕸️', frame: ['╭', '╮', '╰', '╯', '─', '│'], bullet: '•', vibe: 'dark' }),
      renderBlock: (t, title, lines) => `*${title}*\n${(lines || []).join('\n')}`,
      themeText: async (x) => x,
    };
  }
  if (s.endsWith('changeThemes') || s.endsWith('/changeThemes')) {
    return {
      getTheme: () => ({
        name: 'dark', emoji: '🕸️', icon: '🕸️', vibe: 'sombra',
        frame: ['╭', '╮', '╰', '╯', '─', '│'], bullet: '•',
      }),
    };
  }
  if (s.endsWith('welcomeImage') || s.endsWith('/welcomeImage')) {
    return { generateWelcomeImage: async () => null }; // força fallback texto nos testes de evento
  }
  if (s.endsWith('welcomeArt') || s.endsWith('/welcomeArt')) {
    return {
      artCard: async () => Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0].concat(Array(3000).fill(1))),
      artGif: async () => Buffer.concat([Buffer.from('xxxxftyp'), Buffer.alloc(3000)]),
      heroCard: async () => Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      heroGif: async () => Buffer.from('xxxxftypmp4'),
    };
  }
  if (s.endsWith('mediaHandler') || s.endsWith('/mediaHandler')) {
    return {
      downloadFromMessage: async () => Buffer.alloc(500, 7),
      fetchBuffer: async (url) => {
        if (String(url).startsWith('local:')) return Buffer.alloc(800, 3);
        return Buffer.alloc(800, 3);
      },
    };
  }
  if (s.endsWith('antiFoba') || s.endsWith('/antiFoba')) {
    return { onJoin: async () => [] };
  }
  if (s.endsWith('autoApresentar') || s.endsWith('/autoApresentar')) {
    return { onParticipantsUpdate: async () => {} };
  }
  if (s.endsWith('liveBroadcaster') || s.endsWith('/liveBroadcaster')) {
    return { groupEvent: () => {} };
  }
  if (s.endsWith('GroupMemberActivity') || s.endsWith('models/GroupMemberActivity')) {
    return {
      findOne: () => ({
        sort: () => ({ lean: async () => null, catch: async () => null }),
        lean: async () => null,
        catch: async () => null,
      }),
    };
  }
  if (s.endsWith('Economy') || s.endsWith('models/Economy')) {
    return { findOne: () => ({ lean: async () => null, catch: async () => null }) };
  }
  if (s.endsWith('/config') || s.endsWith('src/config')) {
    return {
      bot: { name: 'DARK BOT', prefix: '!' },
      owner: { name: 'Dark', number: '244900000000' },
      cloudinary: {},
    };
  }
  return _orig.apply(this, arguments);
};

const sent = [];
const sock = {
  user: { id: '999@s.whatsapp.net' },
  groupMetadata: async () => ({
    subject: 'Grupo Teste',
    participants: [
      { id: '111@s.whatsapp.net', admin: 'superadmin' },
      { id: '222@s.whatsapp.net', admin: null },
      { id: '999@s.whatsapp.net', admin: 'admin' },
    ],
  }),
  profilePictureUrl: async () => null,
  sendMessage: async (jid, content) => {
    sent.push({ jid, ...content });
    return { key: { id: 'x' } };
  },
};

function CTX(extra = {}) {
  return {
    remoteJid: '120363TEST@g.us',
    senderNumber: '111',
    senderJid: '111@s.whatsapp.net',
    isGroup: true,
    isOwner: false,
    pushName: 'Admin',
    prefix: '!',
    groupMeta: null,
    ...extra,
  };
}

async function reply(text) {
  sent.push({ text });
  return text;
}

let ok = 0, fail = 0;
function t(name, cond, extra = '') {
  if (cond) { ok++; console.log('  ✔', name); }
  else { fail++; console.log('  ❌', name, extra); }
}

(async () => {
  console.log('\n=== 1. Registo de cases (grupos + welcm + audioAdmin2 limpo) ===');
  const reg = new Map();
  function registerCase(cmds, fn, flag) {
    for (const c of [].concat(cmds)) {
      const k = String(c).toLowerCase();
      // simula onlyIfNew
      if (flag === true && reg.has(k)) return;
      reg.set(k, { fn, flag, file: registerCase._file });
    }
  }

  // audioAdmin2: só verificamos no SOURCE que os stubs de welcome saíram
  // (carregar o módulo puxa ffmpeg/filters pesados sem node_modules).
  const audioSrc = fs.readFileSync(path.join(__dirname, '../src/bot/cases/audioAdmin2.js'), 'utf8');
  const miscMatch = audioSrc.match(/const miscAdmin = \[([\s\S]*?)\];/);
  const miscBody = miscMatch ? miscMatch[1] : '';
  t('audioAdmin2 miscAdmin SEM boasvindas', !/['"]boasvindas['"]/.test(miscBody));
  t('audioAdmin2 miscAdmin SEM legendabv', !/['"]legendabv['"]/.test(miscBody));
  t('audioAdmin2 miscAdmin SEM fotobv', !/['"]fotobv['"]/.test(miscBody));
  t('audioAdmin2 miscAdmin SEM saida stubs', !/['"]legendasaiu['"]/.test(miscBody));

  // ordem: finalizar (onlyIfNew) → grupos (overwrite) → welcm
  const files = [
    ['finalizar', '../src/bot/cases/finalizar'],
    ['grupos', '../src/bot/cases/grupos'],
    ['welcm', '../src/bot/cases/welcm'],
  ];
  for (const [name, rel] of files) {
    registerCase._file = name;
    const mod = require(rel);
    if (typeof mod === 'function') mod(registerCase);
  }

  const must = [
    'welcome', 'boasvindas', 'bv', 'bemvindo',
    'goodbye', 'saida', 'despedida',
    'legendabv', 'legendasaiu',
    'fotobv', 'rmfotobv', 'fotosaiu', 'rmfotosaiu',
    'welcome2', 'welcm3', 'bv2', 'bv3',
  ];
  for (const c of must) t(`regista ${c}`, reg.has(c), `missing`);

  // bv/boasvindas NÃO podem vir do audioAdmin2 (stub)
  t('bv vem de grupos (não stub audioAdmin2)', reg.get('bv')?.file === 'grupos', `file=${reg.get('bv')?.file}`);
  t('legendabv vem de grupos', reg.get('legendabv')?.file === 'grupos', `file=${reg.get('legendabv')?.file}`);
  t('legendasaiu vem de grupos', reg.get('legendasaiu')?.file === 'grupos');
  t('welcome2 vem de welcm', reg.get('welcome2')?.file === 'welcm');
  t('saida existe (grupos ou finalizar)', reg.has('saida'));
  // saida: grupos carrega depois de finalizar e SOBRESCREVE (sem onlyIfNew)
  t('saida vencedor = grupos', reg.get('saida')?.file === 'grupos', `file=${reg.get('saida')?.file}`);

  console.log('\n=== 2. Toggles gravam GroupSettings ===');
  sent.length = 0; _gsDoc = null; _gsUpdates = [];
  await reg.get('welcome').fn({
    sock, msg: { key: { id: '1' }, message: {} }, ctx: CTX(), args: ['on'],
    prefix: '!', reply, isOwner: false,
  });
  t('welcome on → welcomeEnabled true', _gsDoc?.welcomeEnabled === true, JSON.stringify(_gsDoc));

  sent.length = 0;
  await reg.get('welcome').fn({
    sock, msg: { key: { id: '2' }, message: {} }, ctx: CTX(), args: ['texto', 'Olá', '{user}!'],
    prefix: '!', reply,
  });
  t('welcome texto grava customWelcomeMsg', /Olá \{user\}!/.test(_gsDoc?.customWelcomeMsg || ''), _gsDoc?.customWelcomeMsg);

  sent.length = 0; _gsDoc = { groupJid: '120363TEST@g.us', welcomeEnabled: true };
  await reg.get('goodbye').fn({
    sock, msg: { key: { id: '3' }, message: {} }, ctx: CTX(), args: ['on'],
    prefix: '!', reply,
  });
  t('goodbye on → goodbyeEnabled true', _gsDoc?.goodbyeEnabled === true);

  sent.length = 0;
  await reg.get('legendasaiu').fn({
    sock, msg: { key: { id: '4' }, message: {} }, ctx: CTX(),
    args: ['{user}', 'foi-se', 'embora'], prefix: '!', reply,
  });
  t('legendasaiu grava customGoodbyeMsg', /foi-se/.test(_gsDoc?.customGoodbyeMsg || ''), _gsDoc?.customGoodbyeMsg);
  t('legendasaiu liga goodbyeEnabled', _gsDoc?.goodbyeEnabled === true);

  sent.length = 0; _gsUpdates = []; _gsDoc = { welcm3: true };
  await reg.get('welcome2').fn({
    sock, msg: { key: { id: '5' }, message: {} }, ctx: CTX(), args: ['on'],
    prefix: '!', isOwner: true, isAdminFn: async () => true,
  });
  const u2 = _gsUpdates[_gsUpdates.length - 1]?.[1] || {};
  t('welcome2 on grava welcome2:true', u2.welcome2 === true, JSON.stringify(u2));
  t('welcome2 on desliga welcm3', u2.welcm3 === false);

  sent.length = 0; _gsUpdates = []; _gsDoc = { welcome2: true };
  await reg.get('welcm3').fn({
    sock, msg: { key: { id: '6' }, message: {} }, ctx: CTX(), args: ['on'],
    prefix: '!', isOwner: true, isAdminFn: async () => true,
  });
  const u3 = _gsUpdates[_gsUpdates.length - 1]?.[1] || {};
  t('welcm3 on grava welcm3:true', u3.welcm3 === true);
  t('welcm3 on desliga welcome2', u3.welcome2 === false);

  // membro comum bloqueado no welcome2
  sent.length = 0; _gsUpdates = [];
  await reg.get('welcome2').fn({
    sock, msg: { key: { id: '7' }, message: {} }, ctx: CTX(), args: ['on'],
    prefix: '!', isOwner: false, isAdminFn: async () => false,
  });
  t('welcome2 bloqueia não-admin', sent.some(s => /SÓ ADMINS/i.test(s.text || '')), JSON.stringify(sent[0]));

  console.log('\n=== 3. groupEvents onJoin / onLeave ===');
  // Reset anti-ban window
  delete require.cache[require.resolve('../src/bot/groupEvents')];
  const ge = require('../src/bot/groupEvents');

  // welcome clássico (texto fallback)
  sent.length = 0;
  _gsDoc = {
    groupJid: '120363TEST@g.us',
    welcomeEnabled: true,
    goodbyeEnabled: true,
    welcome2: false,
    welcm3: false,
    customWelcomeMsg: 'Oi {user} no {grupo}!',
    customGoodbyeMsg: 'Tchau {user} de {grupo}',
  };
  _cache.set('welcome_enabled', true);
  _cache.set('welcome_image_enabled', false); // força texto

  await ge.handle(sock, {
    id: '120363TEST@g.us',
    participants: ['222@s.whatsapp.net'],
    action: 'add',
  });
  t('onJoin envia mensagem', sent.length >= 1, `sent=${sent.length}`);
  t('onJoin usa customWelcomeMsg', sent.some(s => /Oi @222 no Grupo Teste/.test(s.text || s.caption || '')), JSON.stringify(sent[0]));
  t('onJoin menciona o membro', sent.some(s => Array.isArray(s.mentions) && s.mentions.includes('222@s.whatsapp.net')));

  // welcome OFF
  sent.length = 0;
  _gsDoc.welcomeEnabled = false;
  // limpar janela anti-ban
  ge._welDebug._ultimoWel.clear();
  await ge.handle(sock, {
    id: '120363TEST@g.us',
    participants: ['333@s.whatsapp.net'],
    action: 'add',
  });
  t('welcomeEnabled=false → silêncio', sent.length === 0, `sent=${sent.length}`);

  // welcome2
  sent.length = 0;
  _gsDoc.welcomeEnabled = true;
  _gsDoc.welcome2 = true;
  _gsDoc.welcm3 = false;
  ge._welDebug._ultimoWel.clear();
  await ge.handle(sock, {
    id: '120363TEST@g.us',
    participants: ['444@s.whatsapp.net'],
    action: 'add',
  });
  t('welcome2 envia image', sent.some(s => s.image), JSON.stringify(Object.keys(sent[0] || {})));

  // welcm3
  sent.length = 0;
  _gsDoc.welcome2 = false;
  _gsDoc.welcm3 = true;
  ge._welDebug._ultimoWel.clear();
  await ge.handle(sock, {
    id: '120363TEST@g.us',
    participants: ['555@s.whatsapp.net'],
    action: 'add',
  });
  t('welcm3 envia video/gifPlayback', sent.some(s => s.video && s.gifPlayback), JSON.stringify(sent[0] && Object.keys(sent[0])));

  // goodbye
  sent.length = 0;
  _gsDoc.goodbyeEnabled = true;
  await ge.handle(sock, {
    id: '120363TEST@g.us',
    participants: ['222@s.whatsapp.net'],
    action: 'remove',
  });
  t('onLeave envia despedida', sent.some(s => /Tchau @222 de Grupo Teste/.test(s.text || s.caption || '')), JSON.stringify(sent[0]));

  // goodbye OFF
  sent.length = 0;
  _gsDoc.goodbyeEnabled = false;
  await ge.handle(sock, {
    id: '120363TEST@g.us',
    participants: ['222@s.whatsapp.net'],
    action: 'remove',
  });
  t('goodbyeEnabled=false → silêncio', sent.length === 0, `sent=${sent.length}`);

  // goodbye com foto local
  sent.length = 0;
  _gsDoc.goodbyeEnabled = true;
  _gsDoc.goodbyeWithMedia = 'local:group-media/x-goodbye.jpg';
  await ge.handle(sock, {
    id: '120363TEST@g.us',
    participants: ['222@s.whatsapp.net'],
    action: 'remove',
  });
  t('goodbye com foto envia image', sent.some(s => s.image), JSON.stringify(sent[0] && Object.keys(sent[0])));

  console.log('\n=== 4. Schema tem campos ===');
  const schemaSrc = fs.readFileSync(path.join(__dirname, '../src/database/models/GroupSettings.js'), 'utf8');
  for (const f of ['welcomeEnabled', 'goodbyeEnabled', 'customWelcomeMsg', 'customGoodbyeMsg', 'welcome2', 'welcm3', 'welcomeWithMedia', 'goodbyeWithMedia']) {
    t(`schema.${f}`, schemaSrc.includes(f + ':'), f);
  }

  console.log('\n=== 5. whatsapp.js liga group-participants.update ===');
  const wa = fs.readFileSync(path.join(__dirname, '../src/bot/whatsapp.js'), 'utf8');
  t('event group-participants.update', /group-participants\.update/.test(wa));
  t('chama groupEvents.handle', /groupEvents\.handle/.test(wa));

  console.log('\n───────────────────────────────');
  console.log((fail === 0 ? '✅' : '❌') + ` ${ok} OK / ${fail} FALHOU\n`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
