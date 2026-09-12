/**
 * DARK BOT — ADOPÇÃO DE COMUNIDADE JÁ CRIADA (v6.65)
 *
 * O utilizador criou a comunidade pela app do WhatsApp (com o "Geral"
 * e o "Comunicados" que o WhatsApp gera sozinho) e pediu: o bot deve
 * IDENTIFICAR essa comunidade, meter o dono lá dentro como admin,
 * criar os grupos do RPG e ligá-los à comunidade.
 *
 * Criar pela app custa 0 queries ao bot — é a via que não apanha
 * rate-overlimit.
 *
 * Uso: node scripts/test-comunidade-adopcao.js
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

const C = require(path.join(__dirname, '..', 'src', 'bot', 'rpg', 'community'));
const OWNER = '244945280380@s.whatsapp.net';
let ok = 0, fail = 0;
const t = (n, c, e = '') => { c ? ok++ : fail++; console.log(`  ${c ? '✅' : '❌'} ${n}${e ? ' → ' + String(e).slice(0, 74) : ''}`); };

/** Simula o WhatsApp: comunidade criada à mão, com Geral + Comunicados. */
function mundo({ donoDentro = true, donoAdmin = false, extra = [] } = {}) {
  const q = [];
  const participants = [{ id: '244949926074@s.whatsapp.net', admin: 'superadmin' }];
  if (donoDentro) participants.push({ id: OWNER, admin: donoAdmin ? 'admin' : null });

  const grupos = {
    'comm1@g.us': { id: 'comm1@g.us', subject: 'DARK VILLE', isCommunity: true, creation: 100, participants },
    'geral@g.us': { id: 'geral@g.us', subject: 'DARK VILLE', isCommunity: false, isCommunityAnnounce: true, linkedParent: 'comm1@g.us', participants: [] },
    'avisos@g.us': { id: 'avisos@g.us', subject: 'Comunicados', isCommunity: false, linkedParent: 'comm1@g.us', participants: [] },
    'solto@g.us': { id: 'solto@g.us', subject: 'Grupo Solto', isCommunity: false, participants: [] },
  };
  for (const g of extra) grupos[g.id] = g;

  let n = 0;
  return {
    q,
    contar: () => q.length,
    groupFetchAllParticipating: async () => { q.push('fetchAll'); return grupos; },
    groupParticipantsUpdate: async (jid, p, action) => { q.push(action + ':' + jid); return [{ status: '200', jid: p[0] }]; },
    query: async (node) => {
      q.push('create');
      const kids = node.content?.[0]?.content || [];
      const lp = kids.find(k => k.tag === 'linked_parent');
      n++;
      const id = 'novo' + n;
      grupos[id + '@g.us'] = { id: id + '@g.us', subject: node.content[0].attrs.subject, linkedParent: lp?.attrs?.jid };
      return { tag: 'iq', attrs: {}, content: [{ tag: 'group', attrs: { id }, content: [] }] };
    },
    groupUpdateDescription: async () => { q.push('desc'); },
    grupos,
  };
}

(async () => {
  console.log('\n╔═══ ADOPÇÃO DA COMUNIDADE CRIADA À MÃO ═══╗');

  console.log('\n▸ A. Encontra a comunidade que o dono criou');
  C._groupCache.clear();
  const s = mundo({ donoDentro: true, donoAdmin: false });
  const ad = await C.adoptCommunity(s, OWNER);
  t('Identifica a comunidade', ad.ok && ad.jid === 'comm1@g.us', ad.nome || ad.error);
  t('Custa 1 query para varrer tudo', s.q.filter(x => x === 'fetchAll').length === 1, s.q.join(', '));
  t('Não confunde com grupo solto', !ad.existentes.some(g => g.nome === 'Grupo Solto'), JSON.stringify(ad.existentes.map(g => g.nome)));

  console.log('\n▸ B. Reconhece o Geral e o Comunicados');
  t('Regista o Geral', C._groupCache.get('geral') === 'geral@g.us', C._groupCache.get('geral'));
  t('Usa Comunicados como Arsenal', C._groupCache.get('arsenal') === 'avisos@g.us', C._groupCache.get('arsenal'));

  console.log('\n▸ C. Mete o dono lá dentro e dá-lhe admin');
  t('Detecta que o dono já está dentro', ad.dono.dentro, JSON.stringify(ad.dono.acoes));
  t('Promove o dono a admin', ad.dono.admin, JSON.stringify(ad.dono.acoes));
  t('Não repete o add à toa', !s.q.some(x => x.startsWith('add:')), s.q.join(', '));

  console.log('\n▸ D. Dono fora da comunidade → adiciona e promove');
  C._groupCache.clear();
  const s2 = mundo({ donoDentro: false });
  const ad2 = await C.adoptCommunity(s2, OWNER);
  t('Adiciona o dono', ad2.dono.dentro && s2.q.some(x => x.startsWith('add:')), JSON.stringify(ad2.dono.acoes));
  t('E promove a seguir', ad2.dono.admin && s2.q.some(x => x.startsWith('promote:')), s2.q.join(', '));

  console.log('\n▸ E. Já é admin → não faz nada de supérfluo');
  C._groupCache.clear();
  const s3 = mundo({ donoDentro: true, donoAdmin: true });
  const ad3 = await C.adoptCommunity(s3, OWNER);
  t('Reconhece que já é admin', ad3.dono.admin && ad3.dono.acoes.length === 0, JSON.stringify(ad3.dono.acoes));
  t('Só gastou a query do scan', s3.contar() === 1, s3.q.join(', '));

  console.log('\n▸ F. Fluxo completo: adopta + cria os 6 grupos do RPG');
  C._groupCache.clear();
  const s4 = mundo({ donoDentro: true, donoAdmin: true });
  const R = await C.initCommunity(s4, OWNER, { rescan: true });
  const comm = R.find(r => r.type === 'community');
  t('Adoptou em vez de criar', comm.ok && /adoptada/.test(comm.name), comm.name);
  t('Não chamou communityCreate', !s4.q.includes('communityCreate'), 'ok');
  const criados = R.filter(r => r.ok && r.type !== 'community').length;
  t('Criou os 6 grupos do RPG', criados === 6, criados + '/6');
  // O Arsenal reaproveita o "Comunicados" que já existia, por isso só
  // 5 grupos NOVOS são criados: 2 originais + 5 novos = 7 ligados.
  const dentro = Object.values(s4.grupos).filter(g => g.linkedParent === 'comm1@g.us').length;
  t('Todos ligados à comunidade', dentro === 7, dentro + ' (2 originais + 5 novos)');
  t('Arsenal reaproveitou o Comunicados', C._groupCache.get('arsenal') === 'avisos@g.us', C._groupCache.get('arsenal'));
  t('Novos grupos nasceram DENTRO da comunidade',
    Object.values(s4.grupos).filter(g => /Arena das Sombras|Lazer e Memes/.test(g.subject || '')).every(g => g.linkedParent === 'comm1@g.us'), 'ok');

  console.log('\n▸ G. Correr 2x não duplica');
  // reaproveita o estado do teste F (o _groupCache já tem os 6)
  const s5 = mundo({ donoDentro: true, donoAdmin: true });
  const R2 = await C.initCommunity(s5, OWNER, { rescan: true });
  const novos = s5.q.filter(x => x === 'create').length;
  t('Não cria nada de novo', novos === 0, novos + ' grupos criados');

  console.log('\n▸ H. Sem comunidade nenhuma → explica o que fazer');
  C._groupCache.clear();
  const vazio = { groupFetchAllParticipating: async () => ({ 'x@g.us': { id: 'x@g.us', subject: 'Só um grupo', isCommunity: false } }) };
  const ad4 = await C.adoptCommunity(vazio, OWNER);
  t('Avisa que não há comunidade', !ad4.ok && /não encontrei nenhuma comunidade/i.test(ad4.error), ad4.error);

  console.log('\n▸ I. Várias comunidades → escolhe por nome');
  C._groupCache.clear();
  const multi = { groupFetchAllParticipating: async () => ({
    a: { id: 'a@g.us', subject: 'Família', isCommunity: true, creation: 1, participants: [{ id: OWNER, admin: 'admin' }] },
    b: { id: 'b@g.us', subject: 'DARK VILLE', isCommunity: true, creation: 2, participants: [{ id: OWNER, admin: 'admin' }] },
  }), groupParticipantsUpdate: async () => [{ status: '200' }] };
  const ad5 = await C.adoptCommunity(multi, OWNER);
  t('Prefere a que tem DARK no nome', ad5.jid === 'b@g.us', ad5.nome);
  C._groupCache.clear();
  const ad6 = await C.adoptCommunity(multi, OWNER, 'Família');
  t('!darkrpg <nome> escolhe outra', ad6.jid === 'a@g.us', ad6.nome);

  console.log(`\n  ${ok} OK / ${fail} FALHOU\n`);
  process.exit(fail ? 1 : 0);
})();
