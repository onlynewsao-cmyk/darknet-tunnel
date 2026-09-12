/**
 * DARK BOT — AURA + COMUNIDADE ÚNICA (v6.66)
 *
 * O utilizador apagou as outras comunidades e deixou UMA. Pediu:
 *   "já me adiciona ou manda o convite da comunidade, a aura cria
 *    os grupos e ela adiciona na comunidade"
 *
 * Bugs reais que isto apanha:
 *   • A AURA só sabia da comunidade se a TIVESSE CRIADO nessa sessão
 *     (_ultimaComunidade era um Map em RAM). O Render reinicia e ela
 *     respondia "Não sei em que comunidade".
 *   • O communityCreateGroup gasta 5 queries (rate-overlimit).
 *   • Nunca metia o Dono dentro da comunidade nem mandava convite.
 *
 * Uso: node scripts/test-aura-comunidade.js
 */
'use strict';

process.env.OWNER_NUMBER = '244945280380';
const path = require('path');
const Module = require('module');
const orig = Module.prototype.require;
const STORE = {};
Module.prototype.require = function (id) {
  if (/models\//.test(id)) {
    const w = v => { const p = Promise.resolve(v); p.lean = () => Promise.resolve(v); p.sort = () => p; p.limit = () => p; return p; };
    return { find: () => w([]), findOne: () => w(null), countDocuments: async () => 0 };
  }
  if (id.endsWith('botConfigCache')) return { get: async (k, d) => (k in STORE ? STORE[k] : d), set: async (k, v) => { STORE[k] = v; } };
  return orig.apply(this, arguments);
};

const A = require(path.join(__dirname, '..', 'src', 'aura', 'auraActions'));
const C = require(path.join(__dirname, '..', 'src', 'bot', 'rpg', 'community'));
const OWNER = '244945280380@s.whatsapp.net';
const BOT = '244949926074@s.whatsapp.net';
let ok = 0, fail = 0;
const t = (n, c, e = '') => { c ? ok++ : fail++; console.log(`  ${c ? '✅' : '❌'} ${n}${e ? ' → ' + String(e).replace(/\n/g, ' | ').slice(0, 78) : ''}`); };

/** UMA comunidade, como o utilizador deixou. */
function mundo({ donoDentro = false, donoAdmin = false, addFunciona = true, temInvite = true } = {}) {
  const q = [];
  const parts = [{ id: BOT, admin: 'superadmin' }];
  if (donoDentro) parts.push({ id: OWNER, admin: donoAdmin ? 'admin' : null });
  const grupos = {
    'comm1@g.us': { id: 'comm1@g.us', subject: 'DARK VILLE', isCommunity: true, creation: 1, participants: parts },
    'geral@g.us': { id: 'geral@g.us', subject: 'DARK VILLE', isCommunityAnnounce: true, linkedParent: 'comm1@g.us', participants: [] },
  };
  let n = 0;
  return {
    q, grupos,
    groupFetchAllParticipating: async () => { q.push('fetchAll'); return grupos; },
    communityMetadata: async (j) => { q.push('commMeta'); return grupos[j]; },
    groupMetadata: async (j) => { q.push('groupMeta'); return grupos[j] || { id: j, participants: [] }; },
    groupParticipantsUpdate: async (j, p, a) => {
      q.push(a);
      if (a === 'add' && !addFunciona) return [{ status: '403', jid: p[0] }];
      if (a === 'add') { parts.push({ id: p[0], admin: null }); }
      if (a === 'promote') { const x = parts.find(v => v.id === p[0]); if (x) x.admin = 'admin'; }
      return [{ status: '200', jid: p[0] }];
    },
    communityInviteCode: async () => { q.push('invite'); if (!temInvite) throw new Error('not admin'); return 'ABC123'; },
    groupInviteCode: async () => { q.push('gInvite'); return 'GRP999'; },
    query: async (node) => {
      q.push('create');
      const kids = node.content?.[0]?.content || [];
      const lp = kids.find(k => k.tag === 'linked_parent');
      n++;
      grupos['n' + n + '@g.us'] = { id: 'n' + n + '@g.us', subject: node.content[0].attrs.subject, linkedParent: lp?.attrs?.jid };
      return { tag: 'iq', attrs: {}, content: [{ tag: 'group', attrs: { id: 'n' + n }, content: [] }] };
    },
    communityLinkGroup: async () => { q.push('link'); },
  };
}
const ctxPV = { remoteJid: OWNER, senderJid: OWNER, senderNumber: '244945280380', isGroup: false, botName: 'DARK BOT' };

(async () => {
  console.log('\n╔═══ AURA + COMUNIDADE ÚNICA ═══╗');

  console.log('\n▸ A. Reconhece as ordens em português');
  const frases = [
    ['cria um grupo na comunidade chamado Avisos', 'grupoNaComunidade'],
    ['manda o convite da comunidade', 'conviteComunidade'],
    ['adiciona-me a comunidade', 'conviteComunidade'],
    ['quero o link da comunidade', 'conviteComunidade'],
    ['liga este grupo a comunidade', 'ligarComunidade'],
    ['cria um grupo chamado Familia', 'criarGrupo'],
  ];
  let bons = 0;
  for (const [f, esperado] of frases) if (A.detectarAcao(f)?.acao === esperado) bons++;
  t('Detecta as 6 ordens', bons === 6, bons + '/6');

  console.log('\n▸ B. Convite: dono FORA e WhatsApp recusa adicionar');
  A._ultimaComunidade.clear(); C._groupCache.clear();
  const s1 = mundo({ donoDentro: false, addFunciona: false });
  const r1 = await A.executar('conviteComunidade', null, { sock: s1, ctx: ctxPV });
  t('Manda o link em vez de falhar', r1.ok && /chat\.whatsapp\.com\/ABC123/.test(r1.msg), r1.msg);
  t('Diz que ainda não está lá', /ainda não estás/i.test(r1.msg), '');

  console.log('\n▸ C. Convite: dono FORA mas o add funciona');
  A._ultimaComunidade.clear();
  const s2 = mundo({ donoDentro: false, addFunciona: true });
  const r2 = await A.executar('conviteComunidade', null, { sock: s2, ctx: ctxPV });
  t('Adiciona o dono', s2.q.includes('add'), s2.q.join(','));
  t('E promove-o a admin', s2.q.includes('promote'), s2.q.join(','));

  console.log('\n▸ D. AURA cria grupo NA comunidade (sem a ter criado)');
  A._ultimaComunidade.clear(); C._groupCache.clear();
  const s3 = mundo({ donoDentro: true, donoAdmin: true });
  const r3 = await A.executar('grupoNaComunidade', 'Avisos', { sock: s3, ctx: ctxPV });
  t('Cria o grupo', r3.ok && /Avisos/.test(r3.msg), r3.msg);
  const novo = Object.values(s3.grupos).find(g => g.subject === 'Avisos');
  t('Nasce DENTRO da comunidade', novo?.linkedParent === 'comm1@g.us', novo?.linkedParent);
  t('Só 1 query de criação (não 5)', s3.q.filter(x => x === 'create').length === 1, s3.q.join(','));

  console.log('\n▸ E. O bug antigo: reinício do Render');
  // _ultimaComunidade vazio E sem estado no Mongo → tem de varrer.
  A._ultimaComunidade.clear(); C._groupCache.clear();
  delete STORE['darkrpg_community_v1'];
  const s4 = mundo({ donoDentro: true, donoAdmin: true });
  const r4 = await A.executar('grupoNaComunidade', 'Regras', { sock: s4, ctx: ctxPV });
  t('Encontra a comunidade sozinha', r4.ok, r4.msg);
  t('Usou o varrimento', s4.q.includes('fetchAll'), s4.q.join(','));

  console.log('\n▸ F. Comunidade adoptada fica guardada (0 varrimentos)');
  C._groupCache.clear();
  const ad = await C.adoptCommunity(mundo({ donoDentro: true, donoAdmin: true }), OWNER);
  t('Adopta e guarda no Mongo', ad.ok && !!STORE['darkrpg_community_v1'], ad.nome);
  const s5 = mundo({ donoDentro: true, donoAdmin: true });
  const r5 = await A.executar('grupoNaComunidade', 'Loja', { sock: s5, ctx: ctxPV });
  t('Já não precisa de varrer', r5.ok && !s5.q.includes('fetchAll'), s5.q.join(','));

  console.log('\n▸ G. "cria um grupo chamado X" também cai na comunidade');
  const s6 = mundo({ donoDentro: true, donoAdmin: true });
  const r6 = await A.executar('criarGrupo', 'Off-Topic', { sock: s6, ctx: ctxPV });
  const g6 = Object.values(s6.grupos).find(g => g.subject === 'Off-Topic');
  t('Grupo simples entra na comunidade', r6.ok && g6?.linkedParent === 'comm1@g.us', r6.msg);

  console.log('\n▸ H. Dentro dum grupo da comunidade usa a mãe');
  const s7 = mundo({ donoDentro: true, donoAdmin: true });
  const ctxG = { remoteJid: 'geral@g.us', senderJid: OWNER, senderNumber: '244945280380', isGroup: true };
  const r7 = await A.executar('grupoNaComunidade', 'Suporte', { sock: s7, ctx: ctxG });
  t('Usa o linkedParent do grupo actual', r7.ok && !s7.q.includes('fetchAll'), s7.q.join(','));

  console.log('\n▸ I. rate-overlimit → mensagem humana');
  A._ultimaComunidade.clear();
  const s8 = mundo({ donoDentro: true, donoAdmin: true });
  s8.query = async () => { const e = new Error('rate-overlimit'); throw e; };
  s8.communityCreateGroup = async () => { throw new Error('rate-overlimit'); };
  const r8 = await A.executar('grupoNaComunidade', 'Teste', { sock: s8, ctx: ctxPV });
  t('Explica em vez de vomitar o erro', !r8.ok && /espera ~1h/i.test(r8.msg), r8.msg);

  console.log('\n▸ J. Sem comunidade nenhuma');
  A._ultimaComunidade.clear(); C._groupCache.clear();
  delete STORE['darkrpg_community_v1'];
  // O modulo guarda _communityJid em memoria; sem isto o teste anterior
  // contamina este (o loadState so le do Mongo uma vez).
  await C.forgetCommunity();
  delete STORE['darkrpg_community_v1'];
  const vazio = {
    groupFetchAllParticipating: async () => ({}),
    groupMetadata: async () => ({ participants: [] }),
    groupCreate: async () => { throw new Error('nao devia ser chamado'); },
    query: async () => { throw new Error('nao devia ser chamado'); },
  };
  const r9 = await A.executar('grupoNaComunidade', 'X', { sock: vazio, ctx: ctxPV });
  t('Diz o que fazer (e nao cria solto)', !r9.ok && /adiciona-me à comunidade/i.test(r9.msg), r9.msg);

  console.log('\n▸ K. Comunidade APAGADA pelo Dono → esquece o JID morto');
  C._groupCache.clear();
  // finge que havia uma guardada, mas ja nao existe no WhatsApp
  STORE['darkrpg_community_v1'] = { communityJid: 'morta@g.us', groups: {}, clans: {} };
  const s10 = mundo({ donoDentro: true, donoAdmin: true });
  const origMeta = s10.communityMetadata;
  s10.communityMetadata = async (j) => {
    if (j === 'morta@g.us') throw new Error('item-not-found');
    return origMeta(j);
  };
  const r10 = await A.executar('grupoNaComunidade', 'Nova', { sock: s10, ctx: ctxPV });
  t('Nao fica preso a comunidade apagada', r10.ok && /DARK VILLE/.test(r10.msg), r10.msg);
  const gNova = Object.values(s10.grupos).find(g => g.subject === 'Nova');
  t('Cria na comunidade viva', gNova?.linkedParent === 'comm1@g.us', gNova?.linkedParent);

  console.log(`\n  ${ok} OK / ${fail} FALHOU\n`);
  process.exit(fail ? 1 : 0);
})();
