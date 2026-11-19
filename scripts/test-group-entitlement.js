#!/usr/bin/env node
'use strict';
/**
 * Regressões de grupos inactivos:
 * - !onlyadm/!adm1 é a única configuração local permitida sem serviço;
 * - só admin/subdono/dono altera, a escolha fica persistida;
 * - após activação, onlyAdmins silencia comandos, AURA e controlos de membro;
 * - a elegibilidade reconhece trial, aluguel temporário e aluguel permanente.
 */
process.env.OWNER_NUMBER = '244900000001';
process.env.BOT_NUMBER = '244900000002';
process.env.BOT_PREFIX = '!';

const Module = require('module');
const originalRequire = Module.prototype.require;
const GROUP = '120363-entitlement@g.us';
const OWNER = '244900000001@s.whatsapp.net';
const ADMIN = '244900000003@s.whatsapp.net';
const ADMIN_LID = '244900000005@lid';
const SUBOWNER = '244900000006@s.whatsapp.net';
const MEMBER = '244900000004@s.whatsapp.net';
const BOT = '244900000002@s.whatsapp.net';
let saves = 0;
let groupSettingUpdates = [];

const group = {
  groupJid: GROUP,
  groupName: 'Grupo de Teste',
  isHosted: false,
  hostedUntil: null,
  trialExpiresAt: null,
  onlyAdmins: false,
  blockedCommands: [], blockedSubmenus: [],
  commandsUsedToday: 0, totalCommands: 0,
  lastResetDate: new Date().toISOString().slice(0, 10),
  auraMode: 'sleep',
  save: async function () { saves++; return this; },
};
const freeUser = { whatsappNumber: '244900000003', active: true, role: 'free', save: async () => {} };
const w = (value) => {
  const p = Promise.resolve(value);
  p.lean = () => Promise.resolve(value);
  p.select = () => p;
  p.sort = () => p;
  p.limit = () => p;
  p.catch = () => p;
  return p;
};

Module.prototype.require = function patchedRequire(id) {
  const name = String(id);
  if (/models[\\/]GroupSettings$/.test(name)) {
    return {
      findOne: () => w(group),
      create: async () => group,
      findOneAndUpdate: async (_query, update = {}) => {
        if (update?.$set?.onlyAdmins !== undefined) group.onlyAdmins = update.$set.onlyAdmins;
        return group;
      },
      updateOne: async () => ({}),
      find: () => w([]),
    };
  }
  if (/models[\\/]User$/.test(name)) {
    return { findOne: () => w(freeUser), findOneAndUpdate: async () => freeUser, create: async () => freeUser };
  }
  if (/models[\\/]/.test(name)) {
    return {
      findOne: () => w(null), find: () => w([]), findOneAndUpdate: async () => null,
      updateOne: async () => ({}), create: async () => ({}), countDocuments: async () => 0,
      deleteOne: async () => ({}), deleteMany: async () => ({}),
    };
  }
  if (name.endsWith('botConfigCache')) {
    return {
      get: async (key, fallback) => key === 'owner_numbers' ? [SUBOWNER.split('@')[0]] : fallback,
      getMany: async () => ({}), set: async () => {}, clear: () => {}, refresh: async () => 0,
    };
  }
  return originalRequire.apply(this, arguments);
};

const handler = require('../src/bot/commandHandler');
const out = [];
const sock = {
  user: { id: '244900000002:1@s.whatsapp.net', lid: '244900000002@lid' },
  groupMetadata: async () => ({
    id: GROUP, subject: group.groupName,
    participants: [
      { id: OWNER, admin: 'superadmin' },
      { id: ADMIN, admin: 'admin' },
      { id: ADMIN_LID, admin: 'admin' },
      { id: SUBOWNER, admin: null },
      { id: MEMBER, admin: null },
      { id: BOT, admin: 'admin' },
    ],
  }),
  sendMessage: async (jid, content) => {
    out.push({ jid, text: content.text || '', content });
    return { key: { id: 'OUT' + out.length, remoteJid: jid, fromMe: true } };
  },
  groupSettingUpdate: async (jid, setting) => { groupSettingUpdates.push({ jid, setting }); },
  sendPresenceUpdate: async () => {}, readMessages: async () => {},
};

function message(text, participant = ADMIN) {
  return {
    key: { remoteJid: GROUP, participant, id: 'M' + Math.random().toString(36).slice(2), fromMe: false },
    pushName: participant === MEMBER ? 'Membro' : 'Admin',
    messageTimestamp: Math.floor(Date.now() / 1000),
    message: { conversation: text },
  };
}

let ok = 0, fail = 0;
function test(name, pass, detail = '') {
  if (pass) ok++; else fail++;
  console.log(`  ${pass ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
}
async function run(text, participant = ADMIN) {
  out.length = 0;
  const result = await handler.handle(sock, message(text, participant));
  return { result, out: [...out] };
}
const said = (r, re) => r.out.some(item => re.test(item.text || ''));

(async () => {
  const entitlement = require('../src/bot/groupEntitlement');
  test('aluguel permanente é elegível', entitlement.hasActiveEntitlement({ isHosted: true }) === true);
  test('data inválida não vira aluguel permanente por acidente', entitlement.hasActiveEntitlement({ isHosted: true, hostedUntil: 'data-inválida' }) === false);
  test('aluguel expirado não é elegível', entitlement.hasActiveEntitlement({ isHosted: true, hostedUntil: new Date(Date.now() - 1) }) === false);
  test('trial válido é elegível', entitlement.hasActiveEntitlement({ trialExpiresAt: new Date(Date.now() + 60_000) }) === true);

  let r = await run('!adm1 on');
  test('!adm1 de admin funciona sem aluguel/trial', group.onlyAdmins === true && saves >= 1 && said(r, /BOT SÓ PARA ADMINS: ON/), JSON.stringify(r));

  r = await run('!onlyadm off', MEMBER);
  test('onlyAdmins silencia membro comum até no comando de configuração', group.onlyAdmins === true && r.result === false && r.out.length === 0, JSON.stringify(r));

  r = await run('aura, olá', OWNER);
  test('AURA não responde nem ao Dono sem serviço no grupo', r.result === false && r.out.length === 0, JSON.stringify(r));

  // Depois de activar serviço, a mesma política protege comandos, AURA e
  // o controlo prioritário antes de os restantes fluxos poderem responder.
  group.isHosted = true;
  group.hostedUntil = new Date(Date.now() + 60_000);
  r = await run('!ping', MEMBER);
  test('onlyAdmins persistido bloqueia comando de membro', r.result === false && r.out.length === 0, JSON.stringify(r));

  r = await run('aura, diz olá', MEMBER);
  test('onlyAdmins bloqueia resposta AURA de membro', r.result === false && r.out.length === 0, JSON.stringify(r));

  out.length = 0;
  const controlBlocked = await handler.handleConversationControl(sock, message('ignore-me', MEMBER));
  test('onlyAdmins bloqueia o atalho prioritário de controlo AURA', controlBlocked === true && out.length === 0, JSON.stringify({ controlBlocked, out }));

  r = await run('!onlyadm status', ADMIN);
  test('onlyAdmins mantém resposta para administrador', r.result === true && said(r, /BOT SÓ PARA ADMINS: ON/), JSON.stringify(r));

  r = await run('!onlyadm status', OWNER);
  test('onlyAdmins mantém resposta para o Dono', r.result === true && said(r, /BOT SÓ PARA ADMINS: ON/), JSON.stringify(r));

  r = await run('!onlyadm status', SUBOWNER);
  test('onlyAdmins mantém resposta para subdono configurado', r.result === true && said(r, /BOT SÓ PARA ADMINS: ON/), JSON.stringify(r));

  r = await run('!onlyadm off');
  test('!onlyadm off persiste e libera o bot', group.onlyAdmins === false && saves >= 2 && said(r, /BOT SÓ PARA ADMINS: OFF/), JSON.stringify(r));

  // !soadm é o alias histórico da MESMA política do bot. Ao contrário de
  // !fechar, nunca chama groupSettingUpdate nem muda quem pode falar no chat.
  groupSettingUpdates = [];
  r = await run('!soadm on', MEMBER);
  test('membro comum não pode activar !soadm', group.onlyAdmins === false && groupSettingUpdates.length === 0 && said(r, /Só administradores/), JSON.stringify(r));

  r = await run('!soadm on', ADMIN_LID);
  test('!soadm de admin LID activa a mesma política sem fechar o WhatsApp',
    group.onlyAdmins === true && groupSettingUpdates.length === 0 && said(r, /BOT SÓ PARA ADMINS: ACTIVO/), JSON.stringify(r));

  r = await run('!ping', MEMBER);
  test('!soadm silencia comandos de membro porque partilha onlyAdmins', r.result === false && r.out.length === 0, JSON.stringify(r));

  r = await run('!onlyadm off', ADMIN);
  test('!onlyadm off desactiva a política ligada por !soadm', group.onlyAdmins === false && groupSettingUpdates.length === 0 && said(r, /BOT SÓ PARA ADMINS: OFF/), JSON.stringify(r));

  r = await run('!soadm on', ADMIN);
  r = await run('!soadm off', ADMIN);
  test('!soadm off também desactiva a política sem abrir/fechar o chat', group.onlyAdmins === false && groupSettingUpdates.length === 0 && said(r, /BOT SÓ PARA ADMINS: DESACTIVADO/), JSON.stringify(r));

  console.log(`\n${fail ? '❌' : '🎉'} GROUP-ENTITLEMENT: ${ok} OK / ${fail} FALHOU`);
  Module.prototype.require = originalRequire;
  process.exit(fail ? 1 : 0);
})().catch((error) => {
  Module.prototype.require = originalRequire;
  console.error(error);
  process.exit(1);
});
