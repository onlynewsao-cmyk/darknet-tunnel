/**
 * DARK RPG — fluxo de comunidade + convite + !meadm (mock Baileys)
 *
 * Este teste não tenta criar grupos no WhatsApp sem uma sessão conectada.
 * Em vez disso confirma os stanzas/métodos que o bot chamará numa sessão
 * real: comunidade, seis subgrupos ligados, convite, entrada e promoção.
 *
 * Uso: node scripts/test-rpg-community-onboarding.js
 */
'use strict';

const Module = require('module');
const originalRequire = Module.prototype.require;
const STORE = {};
Module.prototype.require = function (id) {
  if (id.endsWith('botConfigCache')) {
    return {
      get: async (key, fallback) => (key in STORE ? STORE[key] : fallback),
      set: async (key, value) => { STORE[key] = value; },
    };
  }
  return originalRequire.apply(this, arguments);
};

const community = require('../src/bot/rpg/community');
const OWNER = '244945280380@s.whatsapp.net';
const COMMUNITY = 'dark-ville@g.us';
let ok = 0;
let fail = 0;
function check(label, condition, details = '') {
  if (condition) ok++;
  else fail++;
  console.log(`  ${condition ? '✅' : '❌'} ${label}${details ? ' → ' + details : ''}`);
}

(async () => {
  console.log('\n╔══ DARK RPG — COMUNIDADE, CONVITE E !MEADM ══╗');
  await community.forgetCommunity();

  const calls = { groups: [], participants: [], descriptions: [] };
  let groupNo = 0;
  const sockSetup = {
    // Não há comunidade anterior: !darkrpg criar deve criar tudo.
    groupFetchAllParticipating: async () => ({}),
    communityCreate: async () => ({ id: COMMUNITY }),
    communityMetadata: async () => ({ subject: 'DARK VILLE', participants: [] }),
    communityInviteCode: async jid => (jid === COMMUNITY ? 'DARKRPG-INVITE' : null),
    communityCreateGroup: async (name, members, parentJid) => {
      calls.groups.push({ name, members, parentJid });
      return { id: `dark-group-${++groupNo}@g.us` };
    },
    groupParticipantsUpdate: async (jid, members, action) => {
      calls.participants.push({ jid, members, action });
      // Simula privacidade: o dono só entra pelo convite.
      if (jid === COMMUNITY && action === 'add') return [{ status: '403' }];
      return [{ status: '200' }];
    },
    groupUpdateDescription: async (jid, description) => {
      calls.descriptions.push({ jid, description });
    },
  };

  console.log('\n▸ A. !darkrpg criar — comunidade e subgrupos');
  const setup = await community.initCommunity(sockSetup, OWNER, {
    criarSeNaoExistir: true,
    rescan: true,
    delayMs: 0,
  });
  const comm = setup.find(row => row.type === 'community');
  const groupRows = setup.filter(row => community.COMMUNITY_GROUPS[row.type]);
  check('Comunidade DARK VILLE criada', comm?.ok && comm.jid === COMMUNITY, comm?.jid);
  check('Os 8 espaços RPG foram criados', groupRows.length === 8 && groupRows.every(row => row.ok), `${groupRows.filter(row => row.ok).length}/8`);
  check('Cada grupo foi criado dentro da comunidade',
    calls.groups.length === 8 && calls.groups.every(g => g.parentJid === COMMUNITY),
    calls.groups.map(g => g.parentJid).join(', '));
  check('Todos os grupos são reportados como ligados', groupRows.every(row => row.linked), groupRows.map(row => row.linked).join(', '));
  check('Link de convite é obtido', comm?.convite === 'https://chat.whatsapp.com/DARKRPG-INVITE', comm?.convite);
  check('Privacidade 403 não é reportada como entrada', comm?.dono?.dentro === false && comm?.dono?.admin === false,
    JSON.stringify(comm?.dono));
  check('Estado de comunidade/grupos fica persistido',
    STORE.darkrpg_community_v1?.communityJid === COMMUNITY && Object.keys(STORE.darkrpg_community_v1?.groups || {}).length === 8,
    JSON.stringify(STORE.darkrpg_community_v1 || {}).slice(0, 90));

  console.log('\n▸ B. Dono entra pelo convite e usa !meadm');
  const promoted = [];
  const sockJoined = {
    communityMetadata: async jid => ({
      id: jid,
      subject: 'DARK VILLE',
      participants: [{ id: OWNER, admin: null }],
    }),
    groupParticipantsUpdate: async (jid, members, action) => {
      promoted.push({ jid, members, action });
      return [{ status: '200' }];
    },
    communityInviteCode: async () => 'DARKRPG-INVITE',
  };
  const promotedResult = await community.promoteCommunityMember(sockJoined, COMMUNITY, OWNER);
  check('!meadm promove quem já entrou', promotedResult.ok && promotedResult.admin, JSON.stringify(promotedResult));
  check('Promoção é feita na comunidade correcta', promoted.length === 1 && promoted[0].jid === COMMUNITY && promoted[0].action === 'promote', JSON.stringify(promoted[0]));

  const alreadyAdmin = await community.promoteCommunityMember({
    communityMetadata: async () => ({ participants: [{ id: OWNER, admin: 'admin' }] }),
  }, COMMUNITY, OWNER);
  check('!meadm é idempotente para admin existente', alreadyAdmin.ok && alreadyAdmin.jaEraAdmin, JSON.stringify(alreadyAdmin));

  const notJoined = await community.promoteCommunityMember({
    communityMetadata: async () => ({ participants: [] }),
    communityInviteCode: async () => 'DARKRPG-INVITE',
  }, COMMUNITY, OWNER);
  check('!meadm sem entrada devolve o convite', !notJoined.ok && notJoined.convite?.includes('DARKRPG-INVITE'), notJoined.error);

  console.log('\n▸ C. Fallback seguro: criar normal e ligar depois');
  const linked = [];
  const fallback = await community.createNamedGroup({
    groupCreate: async () => ({ id: 'fallback@g.us' }),
    communityLinkGroup: async (groupJid, communityJid) => linked.push({ groupJid, communityJid }),
  }, '⚔️ Arena fallback', OWNER, COMMUNITY, { delayMs: 0 });
  check('Fallback liga o grupo em vez de o fingir ligado', fallback.ok && fallback.ligado, JSON.stringify(fallback));
  check('Ligação usa JID de grupo e JID da comunidade',
    linked.length === 1 && linked[0].groupJid === 'fallback@g.us' && linked[0].communityJid === COMMUNITY,
    JSON.stringify(linked[0]));

  console.log('\n▸ D. O comando !meadm está registado e chama a promoção');
  let meadmHandler = null;
  require('../src/bot/cases/rpgCommunity')((aliases, handler) => {
    if (aliases.includes('meadm')) meadmHandler = handler;
  });
  const commandPromotions = [];
  const commandReplies = [];
  const sockCommand = {
    // Em PV não há metadata de grupo; o handler deve recuperar a
    // comunidade persistida e promovê-lo nela.
    groupMetadata: async () => { throw new Error('não é grupo'); },
    communityMetadata: async () => ({
      subject: 'DARK VILLE',
      participants: [{ id: OWNER, admin: null }],
    }),
    groupParticipantsUpdate: async (jid, members, action) => {
      commandPromotions.push({ jid, members, action });
      return [{ status: '200' }];
    },
    sendMessage: async (jid, content) => { commandReplies.push({ jid, content }); },
  };
  check('Alias !meadm está registado', typeof meadmHandler === 'function');
  if (meadmHandler) {
    await meadmHandler({
      sock: sockCommand,
      msg: { key: { remoteJid: OWNER, id: 'meadm-test' }, message: { conversation: '!meadm' } },
      ctx: { remoteJid: OWNER, senderJid: OWNER, senderNumber: OWNER.split('@')[0], isGroup: false },
      isOwner: true,
    });
  }
  check('Handler !meadm promove o dono na comunidade guardada',
    commandPromotions.length === 1 && commandPromotions[0].jid === COMMUNITY && commandPromotions[0].action === 'promote',
    JSON.stringify(commandPromotions[0]));
  check('Handler confirma a promoção ao dono',
    commandReplies.some(r => /PROMOÇÃO CONCLUÍDA|PROMOÇÃO CONCLUÍDA|ADMIN DARK VILLE/i.test(r.content?.text || '')),
    String(commandReplies[0]?.content?.text || '').slice(0, 90));

  console.log(`\n  ${ok} OK / ${fail} FALHOU\n`);
  process.exit(fail ? 1 : 0);
})();
