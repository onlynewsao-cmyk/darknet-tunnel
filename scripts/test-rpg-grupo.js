#!/usr/bin/env node
/**
 * DARK BOT — v7.25
 *
 * 1. SELECCIONAR GRUPO DA COMUNIDADE (RPG):
 *    - discoverCommunityForGroup: parent do grupo → guardada → varrimento.
 *    - adoptGroupAs: registra o grupo, renomeia, descreve, liga e promove.
 *    - casos setarena/setdungeons/settrocas/setcavernas/setlazer/setarsenal
 *      + setgrupo registados.
 *
 * 2. AURA NÃO responde a comandos de bots:
 *    - pareceComando deteta QUALQUER prefixo de comando (! . / $ # ? * - …).
 *    - "oi", "toca shakira" continuam a ser conversa.
 *
 * Uso: node scripts/test-rpg-grupo.js
 */
'use strict';

process.env.MONGODB_URI = '';
process.env.OWNER_NUMBER = '244945280380';

const community = require('../src/bot/rpg/community');
const caseHandler = require('../src/bot/caseHandler');
const ch = require('../src/bot/commandHandler');

let ok = 0, fail = 0;
const t = (n, c, e) => { e = e || ''; c ? ok++ : fail++; console.log('  ' + (c ? '✅' : '❌') + ' ' + n + (e ? ' → ' + String(e).slice(0, 70) : '')); };

/** Mock de sock para adoptGroupAs — regista as chamadas. */
function mkSock(opts = {}) {
  const log = [];
  const sock = {
    log,
    groupMetadata: async (jid) => ({
      id: jid,
      subject: opts.subject ?? 'Grupo Aleatório',
      linkedParent: opts.linkedParent ?? null,
      participants: [
        { id: '244945280380@s.whatsapp.net', admin: opts.ownerAdmin ? 'admin' : null },
      ],
    }),
    communityMetadata: async (jid) => ({ id: jid, subject: 'DARK VILLE' }),
    groupUpdateSubject: async (jid, nome) => { log.push(['subject', jid, nome]); },
    groupUpdateDescription: async (jid, desc) => { log.push(['desc', jid, desc]); },
    groupParticipantsUpdate: async (jid, users, acao) => { log.push(['promote', jid, users, acao]); },
    communityLinkGroup: async (jid, comm) => { log.push(['link', jid, comm]); },
    groupFetchAllParticipating: async () => ({
      'c1': { id: 'comu@g.us', subject: 'DARK VILLE', isCommunity: true },
      'g1': { id: 'grp@g.us', subject: 'Grupo Aleatório', linkedParent: 'comu@g.us' },
    }),
  };
  return sock;
}

(async () => {
  console.log('\n╔═══ 1. discoverCommunityForGroup ═══╗');
  {
    // grupo ligado → parent
    let sock = mkSock({ linkedParent: 'comu@g.us' });
    let r = await community.discoverCommunityForGroup(sock, 'grp@g.us');
    t('grupo ligado → devolve o parent', r.jid === 'comu@g.us');

    // sem parent → guardada (loadState vazio aqui) → varrimento
    community.forgetCommunity();
    sock = mkSock({ linkedParent: null });
    r = await community.discoverCommunityForGroup(sock, 'grp@g.us');
    t('sem parent → varrimento encontra a comunidade', r.jid === 'comu@g.us');
  }

  console.log('\n╔═══ 2. adoptGroupAs — regista, renomeia, descreve, promove ═══╗');
  {
    community.forgetCommunity();
    const sock = mkSock({ subject: 'Grupo Aleatório' });
    const r = await community.adoptGroupAs(sock, 'arena', 'grp@g.us', '244945280380@s.whatsapp.net');
    t('adoptGroupAs ok', r.ok === true && r.nome === 'Arena das Sombras');
    t('renomeia para o nome canónico', sock.log.some(l => l[0] === 'subject' && l[2] === 'Arena das Sombras'));
    t('põe a descrição', sock.log.some(l => l[0] === 'desc' && /Batalhas PvP/.test(l[2])));
    t('promove o dono', sock.log.some(l => l[0] === 'promote' && l[3] === 'promote'));
    t('guarda no cache do RPG', community._groupCache.get('arena') === 'grp@g.us');

    // tipo inválido
    const bad = await community.adoptGroupAs(sock, 'xyz', 'grp@g.us', '244945280380@s.whatsapp.net');
    t('tipo inválido → erro claro', bad.ok === false && /arena, dungeons/.test(bad.error));

    // grupo já com o nome certo → não renomeia 2x
    const sock2 = mkSock({ subject: 'Arena das Sombras' });
    community.forgetCommunity();
    await community.adoptGroupAs(sock2, 'arena', 'grp@g.us', '244945280380@s.whatsapp.net');
    t('nome certo → não renomeia de novo', !sock2.log.some(l => l[0] === 'subject'));

    community.forgetCommunity();
  }

  console.log('\n╔═══ 3. Casos registados ═══╗');
  {
    caseHandler.init();
    const { CASES } = caseHandler;
    for (const c of ['setarena', 'setdungeons', 'settrocas', 'setcavernas', 'setlazer', 'setarsenal', 'setgrupo']) {
      t(`case ${c} registado`, CASES.has(c));
    }
  }

  console.log('\n╔═══ 4. AURA não responde a comandos ═══╗');
  {
    t('"!menu" é comando', ch.pareceComando('!menu') === true);
    t('".play" é comando', ch.pareceComando('.play') === true);
    t('"$saldo" é comando', ch.pareceComando('$saldo') === true);
    t('"#vip" é comando', ch.pareceComando('#vip') === true);
    t('"?ping" é comando', ch.pareceComando('?ping') === true);
    t('"*sticker" é comando', ch.pareceComando('*sticker') === true);
    t('"-regras" é comando', ch.pareceComando('-regras') === true);
    t('"/help" é comando', ch.pareceComando('/help') === true);
    t('"  !menu" (espaços antes) é comando', ch.pareceComando('  !menu') === true);
    t('"oi tudo bem" NÃO é comando', ch.pareceComando('oi tudo bem') === false);
    t('"toca shakira" NÃO é comando (conversa→comando)', ch.pareceComando('toca shakira') === false);
    t('"como vais?" NÃO é comando', ch.pareceComando('como vais?') === false);
  }

  console.log(`\n${fail === 0 ? '🎉' : '⚠️ '} RPG GRUPO + AURA: ${ok} OK / ${fail} FALHOU\n`);
  process.exit(fail ? 1 : 0);
})();
