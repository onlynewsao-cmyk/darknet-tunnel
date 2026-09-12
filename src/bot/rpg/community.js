/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║   DARK BOT v7 — DARKRPG Community System v5 FINAL           ║
 * ║   Cria COMUNIDADE do WhatsApp + grupos dentro dela            ║
 * ║   Usa API oficial do Baileys: communityCreate, communityCreateGroup ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */
'use strict';

const config = require('../../config');
const rpg = require('./engine');

// ══════════════════════════════════════════════════════════════
// GRUPOS DA COMUNIDADE
// ══════════════════════════════════════════════════════════════
const COMMUNITY_GROUPS = {
  arena: {
    name: 'Arena das Sombras',
    desc: 'Batalhas PvP 1x1 e Torneios. O bot e o juiz.',
    emoji: '⚔️',
    ownerAdm: true,
  },
  dungeons: {
    name: 'Dungeons Proibidas',
    desc: 'Portais PvE, Bosses, Raids.',
    emoji: '🐉',
    ownerAdm: true,
  },
  trocas: {
    name: 'Ville de Trocas',
    desc: 'Mercado livre de itens, cartas e armas.',
    emoji: '💰',
    ownerAdm: true,
  },
  cavernas: {
    name: 'Cavernas Sombras',
    desc: 'Exploracao, mineracao, pesca, coleta.',
    emoji: '⛏️',
    ownerAdm: true,
  },
  lazer: {
    name: 'Lazer e Memes',
    desc: 'Diversao, zoeira, memes.',
    emoji: '😂',
    ownerAdm: true,
  },
  arsenal: {
    name: 'Arsenal da Fama',
    desc: 'Rankings, conquistas, comunicados.',
    emoji: '🏆',
    ownerAdm: true,
  },
};

// ══════════════════════════════════════════════════════════════
// CONVITE PERSONALIZADO RPG
// ══════════════════════════════════════════════════════════════
function generateInviteMessage(userName) {
  const greetings = [
    '⚔️ *' + userName + '!*',
    '🏰 *' + userName + ', a Aldeia te chama!*',
  ];
  const bodies = [
    'A comunidade *DARK VILLE* esta ativa e ha vagas para aventureiros.\n\nSe quiseres entrar, e so aceitar o convite. Sem pressao — a escolha e tua.',
  ];
  const closings = [
    '🎮 *Use !menu-rpg para ver os comandos*\n⚔️ *Use !despertar para comecar*',
  ];

  const g = greetings[Math.floor(Math.random() * greetings.length)];
  const b = bodies[Math.floor(Math.random() * bodies.length)];
  const c = closings[Math.floor(Math.random() * closings.length)];
  return g + '\n\n' + b + '\n\n' + c;
}

// ══════════════════════════════════════════════════════════════
// REGRAS / EVENTOS  (v6.63)
// O rpgSetup.js chamava community.COMMUNITY_RULES, community.EVENTS,
// community.generateLeaderboard e community.generateWelcomeMessage —
// nenhum deles existia. Resultado real: `.regras` mandava "undefined",
// `.ranking` respondia "generateLeaderboard is not a function" e
// `.evento` rebentava com "Cannot convert undefined or null to object".
// ══════════════════════════════════════════════════════════════
const COMMUNITY_RULES = [
  '📜 *REGRAS — DARK VILLE*',
  '━━━━━━━━━━━━━━━━━━━━━━━━━━',
  '',
  '1️⃣ Respeito acima de tudo. Sem insultos nem ataques pessoais.',
  '2️⃣ Nada de spam, flood ou divulgação sem autorização.',
  '3️⃣ Sem conteúdo +18 nos grupos gerais.',
  '4️⃣ Trapaça, bots externos ou multi-conta = banimento.',
  '5️⃣ Cada grupo tem o seu tema — usa o grupo certo.',
  '6️⃣ As decisões dos admins valem. Discute em privado.',
  '',
  '━━━━━━━━━━━━━━━━━━━━━━━━━━',
  '⚔️ *Quem quebra as regras perde o que conquistou.*',
].join('\n');

const EVENTS = {
  boss: {
    name: '🐲 Boss Mundial',
    desc: 'Um boss aparece. Todos atacam juntos até cair.',
    duration: 30 * 60000,
    reward: 'XP em dobro + loot lendário',
  },
  chuva: {
    name: '💰 Chuva de Berries',
    desc: 'Berries em dobro em tudo o que fizeres.',
    duration: 60 * 60000,
    reward: 'Berries x2',
  },
  caca: {
    name: '🏹 Caçada Aberta',
    desc: 'Inimigos aparecem sem parar. Mata o máximo que conseguires.',
    duration: 45 * 60000,
    reward: 'XP x1.5 + kills contam a dobrar',
  },
  torneio: {
    name: '⚔️ Torneio da Arena',
    desc: 'PvP eliminatório. Só sobra um.',
    duration: 90 * 60000,
    reward: 'Título exclusivo + 10000 berries',
  },
  gacha: {
    name: '🃏 Invocação Grátis',
    desc: 'Gacha sem custo enquanto durar o evento.',
    duration: 30 * 60000,
    reward: 'Cartas grátis',
  },
};

// ══════════════════════════════════════════════════════════════
// CACHE  (v6.63: agora persiste no MongoDB)
// Antes eram Maps em memória: o Render reinicia o processo a cada
// deploy/idle e o bot esquecia-se dos grupos. `.comunicado` deixava
// de encontrar o Arsenal e `.addglb` dizia sempre "grupo principal
// não encontrado".
// ══════════════════════════════════════════════════════════════
let _communityJid = null;
const _groupCache = new Map();
const _clanGroups = new Map();

const DB_KEY = 'darkrpg_community_v1';
let _loaded = false;

async function _persist() {
  try {
    const cache = require('../botConfigCache');
    await cache.set(DB_KEY, {
      communityJid: _communityJid,
      groups: Object.fromEntries(_groupCache),
      clans: Object.fromEntries(_clanGroups),
    });
  } catch (e) {
    console.warn('[DARKRPG] persist:', e.message?.slice(0, 60));
  }
}

/**
 * v6.66 — Esquece a comunidade guardada. Serve para quando o Dono a
 * apaga no WhatsApp: o JID em cache fica morto e tudo falharia com
 * "item-not-found" para sempre.
 */
async function forgetCommunity() {
  _communityJid = null;
  _groupCache.clear();
  await _persist();
}

async function loadState() {
  if (_loaded) return { communityJid: _communityJid, groups: _groupCache, clans: _clanGroups };
  _loaded = true;
  try {
    const cache = require('../botConfigCache');
    const s = await cache.get(DB_KEY, null);
    if (s && typeof s === 'object') {
      _communityJid = s.communityJid || null;
      for (const [k, v] of Object.entries(s.groups || {})) _groupCache.set(k, v);
      for (const [k, v] of Object.entries(s.clans || {})) _clanGroups.set(k, v);
    }
  } catch (e) {
    console.warn('[DARKRPG] load:', e.message?.slice(0, 60));
  }
  return { communityJid: _communityJid, groups: _groupCache, clans: _clanGroups };
}

// ══════════════════════════════════════════════════════════════
// 1. CRIAR COMUNIDADE DO WHATSAPP
// ══════════════════════════════════════════════════════════════
async function createWhatsAppCommunity(sock, ownerJid) {
  // v6.63: o communityCreate do Baileys faz parseGroupResult(), que
  // devolve o groupMetadata — e devolve `null` se o parse falhar,
  // mesmo quando a comunidade FOI criada no WhatsApp. Antes o código
  // lia só `community.id` e reportava "Nao foi possivel criar" numa
  // comunidade que existia. Agora aceita id/jid e faz fallback.
  if (typeof sock.communityCreate !== 'function') {
    return { ok: false, error: 'Esta versao do Baileys nao suporta comunidades' };
  }
  try {
    console.log('[DARKRPG] Criando comunidade DARK VILLE...');

    const community = await sock.communityCreate(
      'DARK VILLE',
      'Comunidade oficial DARK RPG — Batalhas, Rankings, Eventos, Clas'
    );

    let jid = community?.id || community?.jid || null;

    // Fallback: o parse devolveu null mas a comunidade pode existir.
    if (!jid && typeof sock.communityFetchAllParticipating === 'function') {
      try {
        const all = await sock.communityFetchAllParticipating();
        const hit = Object.values(all || {}).find(c => c?.subject === 'DARK VILLE');
        if (hit?.id) jid = hit.id;
      } catch {}
    }

    if (jid) {
      _communityJid = jid;
      await _persist();
      console.log('[DARKRPG] Comunidade criada: ' + jid);
      return { ok: true, jid, name: 'DARK VILLE' };
    }

    return { ok: false, error: 'O WhatsApp nao devolveu o ID da comunidade' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ══════════════════════════════════════════════════════════════
// 2. CRIAR GRUPO DENTRO DA COMUNIDADE
//
// ── v6.64: PORQUE É QUE DAVA SEMPRE rate-overlimit ─────────────
// O utilizador reportou: a AURA cria grupos bem (.criargrupo), mas
// o .darkrpg falhava nos 6 grupos com "rate-overlimit". A conta não
// estava limitada — o problema era o NÚMERO DE QUERIES.
//
// Contagem real (lida no código do @systemzero/baileys 1.1.1):
//
//   AURA → sock.groupCreate()
//     1. create ................................. 1 query
//     extractGroupMetadata() = parse LOCAL do XML  0 queries
//     TOTAL: 1 query  ✅
//
//   .darkrpg (antes) → sock.communityCreateGroup()
//     1. create ................................. 1
//     2. parseGroupResult() → sock.groupMetadata()  1  ← ESCONDIDA
//     3. groupUpdateDescription → groupMetadata()   1  ← ESCONDIDA
//     4. groupUpdateDescription → set ........... 1
//     5. groupParticipantsUpdate promote ........ 1
//     TOTAL: 5 queries × 6 grupos = 30 queries
//
// O communityCreateGroup do Baileys chama parseGroupResult(), que
// faz um groupMetadata() EXTRA só para converter a resposta — e o
// groupUpdateDescription faz outro. São 4 queries desperdiçadas por
// grupo. Ao 2º/3º grupo o WhatsApp corta com rate-overlimit, e como
// o retry também gastava 5 queries, nunca recuperava.
//
// Agora mandamos o stanza `create` em cru (mesmo XML que o Baileys
// manda) via sock.query e lemos o JID do XML de resposta — sem
// nenhuma query escondida. 1 query por grupo, igual à AURA.
// ══════════════════════════════════════════════════════════════

/** Lê o JID do grupo direto do XML de resposta — zero queries extra. */
function _jidDoResultado(result) {
  try {
    const B = require('@systemzero/baileys');
    const node = B.getBinaryNodeChild(result, 'group');
    const id = node?.attrs?.id;
    if (!id) return null;
    return String(id).includes('@') ? id : id + '@g.us';
  } catch { return null; }
}

/**
 * Cria o grupo com UMA query. Se houver comunidade, manda o
 * <linked_parent> no próprio stanza de criação — que é o que o
 * WhatsApp faz quando crias um grupo dentro de uma comunidade pela app.
 */
async function _criarGrupoCru(sock, subject, participants, communityJid) {
  const B = require('@systemzero/baileys');
  const content = participants.map(jid => ({ tag: 'participant', attrs: { jid } }));
  if (communityJid) content.push({ tag: 'linked_parent', attrs: { jid: communityJid } });

  const result = await sock.query({
    tag: 'iq',
    attrs: { type: 'set', xmlns: 'w:g2', to: '@g.us' },
    content: [{
      tag: 'create',
      attrs: { subject, key: B.generateMessageIDV2() },
      content,
    }],
  });

  return _jidDoResultado(result);
}

/**
 * v6.66 — Garante que o dono está DENTRO da comunidade e é admin.
 * Se o WhatsApp não deixar adicionar (privacidade), devolve o link
 * de convite para ele entrar sozinho.
 *
 * Devolve { dentro, admin, acoes[], convite }
 */
async function ensureOwnerInCommunity(sock, communityJid, ownerJid) {
  const onum = _num(ownerJid);
  const res = { dentro: false, admin: false, acoes: [], convite: null };

  // Estado actual (1 query)
  let meta = null;
  try {
    meta = typeof sock.communityMetadata === 'function'
      ? await sock.communityMetadata(communityJid)
      : await sock.groupMetadata(communityJid);
  } catch (e) {
    res.acoes.push('não consegui ler a comunidade: ' + e.message);
  }

  const eu = (meta?.participants || []).find(p => _num(p.id) === onum);
  if (eu) { res.dentro = true; res.admin = p_admin(eu); }

  if (!res.dentro) {
    try {
      const r = await sock.groupParticipantsUpdate(communityJid, [ownerJid], 'add');
      const st = Array.isArray(r) ? String(r[0]?.status || '200') : '200';
      if (st === '200') { res.dentro = true; res.acoes.push('adicionei-te à comunidade'); }
      else res.acoes.push('o WhatsApp não deixou adicionar-te (' + st + ')');
    } catch (e) {
      res.acoes.push('não consegui adicionar-te: ' + e.message);
    }
  }

  // Não entrou? Manda o convite — é o plano B que o utilizador pediu.
  if (!res.dentro) {
    res.convite = await getCommunityInvite(sock, communityJid);
    if (res.convite) res.acoes.push('mandei-te o link de convite');
  }

  if (res.dentro && !res.admin) {
    await new Promise(r => setTimeout(r, 2000));
    try {
      const r = await sock.groupParticipantsUpdate(communityJid, [ownerJid], 'promote');
      const st = Array.isArray(r) ? String(r[0]?.status || '200') : '200';
      if (st === '200') { res.admin = true; res.acoes.push('promovi-te a admin'); }
      else res.acoes.push('não consegui promover-te (' + st + ') — preciso de ser admin');
    } catch (e) {
      res.acoes.push('não consegui promover-te: ' + e.message);
    }
  }

  return res;
}

/** Link de convite da comunidade (ou do grupo). Null se não der. */
async function getCommunityInvite(sock, jid) {
  try {
    const code = typeof sock.communityInviteCode === 'function'
      ? await sock.communityInviteCode(jid)
      : await sock.groupInviteCode(jid);
    return code ? 'https://chat.whatsapp.com/' + code : null;
  } catch {
    try {
      const code = await sock.groupInviteCode(jid);
      return code ? 'https://chat.whatsapp.com/' + code : null;
    } catch { return null; }
  }
}

/**
 * v6.66 — Cria UM grupo com nome livre, dentro da comunidade.
 * É o que a AURA usa. 1 query, com <linked_parent> embutido.
 */
async function createNamedGroup(sock, nome, ownerJid, communityJid, opts = {}) {
  const via = [];
  let lastErr = 'desconhecido';

  // ── v6.67: TRÊS CAMINHOS, pela ordem que o utilizador pediu ──
  //   1. criar já dentro da comunidade (<linked_parent> no stanza)
  //   2. API communityCreateGroup
  //   3. criar grupo normal e DEPOIS ligá-lo (communityLinkGroup)
  // Antes, se o caminho 1 falhasse, desistia. Agora tenta os outros:
  // um grupo criado e ligado a seguir dá exactamente no mesmo.
  const tentativas = [];

  if (communityJid && typeof sock.query === 'function') {
    tentativas.push({
      nome: 'dentro da comunidade',
      run: () => _criarGrupoCru(sock, nome, [ownerJid], communityJid),
      ligado: true,
    });
  }
  if (communityJid && typeof sock.communityCreateGroup === 'function') {
    tentativas.push({
      nome: 'API de comunidade',
      run: async () => {
        const g = await sock.communityCreateGroup(nome, [ownerJid], communityJid);
        return g?.id || g?.jid || null;
      },
      ligado: true,
    });
  }
  // Criar solto — depois liga-se. Também serve sem comunidade nenhuma.
  tentativas.push({
    nome: communityJid ? 'criar e ligar depois' : 'grupo normal',
    run: async () => {
      if (typeof sock.query === 'function') {
        const j = await _criarGrupoCru(sock, nome, [ownerJid], null);
        if (j) return j;
      }
      const g = await sock.groupCreate(nome, [ownerJid]);
      return g?.id || g?.jid || null;
    },
    ligado: false,
  });

  for (const tent of tentativas) {
    try {
      const jid = await tent.run();
      if (!jid) throw new Error('o WhatsApp não devolveu o ID do grupo');

      let ligado = tent.ligado;

      // Não nasceu dentro? Liga-o agora — é o "adicionar grupo à
      // comunidade" que o utilizador pediu como passo 1.
      if (communityJid && !ligado && typeof sock.communityLinkGroup === 'function') {
        await new Promise(r => setTimeout(r, 1500));
        try {
          await sock.communityLinkGroup(jid, communityJid);
          ligado = true;
        } catch (e) {
          lastErr = 'criei o grupo mas não consegui ligá-lo: ' + e.message;
        }
      } else if (communityJid && ligado && opts.forcarLink && typeof sock.communityLinkGroup === 'function') {
        // reforço barato: se já estiver ligado o WhatsApp ignora
        try { await sock.communityLinkGroup(jid, communityJid); } catch {}
      }

      via.push(tent.nome);
      return { ok: true, jid, nome, ligado, via: tent.nome, avisoLink: ligado ? null : lastErr };
    } catch (e) {
      lastErr = e.message || String(e);
      via.push(tent.nome + ' ✗');

      // rate-overlimit: esperar não adianta em cadeia — sai já.
      if (/rate-overlimit|429/i.test(lastErr)) {
        return { ok: false, error: lastErr, nome, limitado: true, via };
      }
    }
  }

  return { ok: false, error: lastErr, nome, via };
}

/**
 * v6.67 — Liga um grupo que JÁ EXISTE à comunidade (pelo nome).
 * É o "ir a adicionar grupo à comunidade" do utilizador.
 */
async function linkExistingGroup(sock, nomeOuJid, communityJid) {
  if (typeof sock.communityLinkGroup !== 'function') {
    return { ok: false, error: 'esta versão do WhatsApp não deixa ligar grupos' };
  }

  let jid = /@g\.us$/.test(String(nomeOuJid)) ? String(nomeOuJid) : null;
  let nome = jid || nomeOuJid;

  if (!jid) {
    // procura pelo nome entre os grupos onde o bot está
    try {
      const todos = (await sock.groupFetchAllParticipating()) || {};
      const alvo = Object.values(todos).find(g =>
        !g?.isCommunity &&
        String(g?.subject || '').toLowerCase() === String(nomeOuJid).toLowerCase());
      if (alvo) { jid = alvo.id; nome = alvo.subject; }
    } catch (e) {
      return { ok: false, error: 'não consegui procurar o grupo: ' + e.message };
    }
  }

  if (!jid) return { ok: false, error: 'não encontrei nenhum grupo chamado "' + nomeOuJid + '"' };

  try {
    await sock.communityLinkGroup(jid, communityJid);
    return { ok: true, jid, nome };
  } catch (e) {
    return { ok: false, error: e.message, jid, nome };
  }
}

async function createGroupInCommunity(sock, groupType, ownerJid, communityJid) {
  const groupDef = COMMUNITY_GROUPS[groupType];
  if (!groupDef) return { ok: false, error: 'Tipo invalido: ' + groupType };

  let lastErr = 'desconhecido';

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      let groupJid = null;
      let dentroDaComunidade = false;

      // Caminho rápido: 1 query, com o linked_parent embutido.
      if (typeof sock.query === 'function') {
        console.log('[DARKRPG] Criando ' + groupDef.name + (communityJid ? ' (na comunidade)' : ''));
        groupJid = await _criarGrupoCru(sock, groupDef.name, [ownerJid], communityJid);
        dentroDaComunidade = !!communityJid;
      }

      // Fallback: Baileys sem sock.query exposto.
      if (!groupJid) {
        const g = communityJid && typeof sock.communityCreateGroup === 'function'
          ? await sock.communityCreateGroup(groupDef.name, [ownerJid], communityJid)
          : await sock.groupCreate(groupDef.name, [ownerJid]);
        groupJid = g?.id || g?.jid || null;
        dentroDaComunidade = !!communityJid;
      }

      if (!groupJid) throw new Error('WhatsApp nao devolveu o ID do grupo');

      _groupCache.set(groupType, groupJid);
      await _persist();
      console.log('[DARKRPG] Grupo criado: ' + groupDef.name + ' → ' + groupJid);

      // A descrição e o promote são OPCIONAIS: cada um custa queries
      // e o grupo já existe. Ficam para o passo 3 do initCommunity,
      // depois de todos os grupos estarem criados.
      return { ok: true, jid: groupJid, name: groupDef.name, linked: dentroDaComunidade };
    } catch (e) {
      lastErr = e.message || String(e);
      console.error('[DARKRPG] Tentativa ' + attempt + '/3 falhou: ' + lastErr);
      if (attempt < 3) {
        // rate-overlimit precisa de MUITO mais que 15s para acalmar.
        const wait = /rate-overlimit|429/i.test(lastErr) ? 60000 : 5000;
        console.log('[DARKRPG] A esperar ' + (wait / 1000) + 's...');
        await new Promise(r => setTimeout(r, wait));
      }
    }
  }
  return { ok: false, error: lastErr, name: groupDef.name };
}

/** Descrição + promote, feitos DEPOIS de todos os grupos existirem. */
async function _acabarGrupo(sock, groupType, groupJid, ownerJid) {
  const def = COMMUNITY_GROUPS[groupType];
  if (!def) return;
  try { await sock.groupUpdateDescription(groupJid, def.desc); } catch {}
  await new Promise(r => setTimeout(r, 3000));
  if (def.ownerAdm) {
    try { await sock.groupParticipantsUpdate(groupJid, [ownerJid], 'promote'); } catch {}
  }
}

// ══════════════════════════════════════════════════════════════
// 3. CRIAR CLA (fora da comunidade)
// ══════════════════════════════════════════════════════════════
async function createClanGroup(sock, clanName, leaderJid, members = []) {
  const groupName = 'Cla ' + clanName;
  const desc = 'Cla ' + clanName + '\nLider: ' + leaderJid.split('@')[0];

  try {
    const group = await sock.groupCreate(groupName, [leaderJid, ...members]);
    // v6.63: `group.id` rebentava se o Baileys devolvesse null — e o
    // dono perdia os 5000 berries à mesma, porque o case debitava
    // antes de confirmar. Agora falha limpo.
    const groupJid = group?.id || group?.jid || null;
    if (!groupJid) return { ok: false, error: 'WhatsApp nao devolveu o ID do grupo' };

    await new Promise(r => setTimeout(r, 1000));
    try { await sock.groupUpdateDescription(groupJid, desc); } catch {}
    await new Promise(r => setTimeout(r, 1000));
    try { await sock.groupParticipantsUpdate(groupJid, [leaderJid], 'promote'); } catch {}

    // Liga o clã à comunidade, se existir uma.
    if (_communityJid && typeof sock.communityLinkGroup === 'function') {
      await new Promise(r => setTimeout(r, 1000));
      try { await sock.communityLinkGroup(groupJid, _communityJid); } catch {}
    }

    _clanGroups.set(clanName, { jid: groupJid, leaderJid });
    await _persist();
    console.log('[DARKRPG] Cla criado: ' + clanName + ' → ' + groupJid);
    return { ok: true, jid: groupJid, name: groupName, leader: leaderJid };
  } catch (e) {
    console.error('[DARKRPG] Erro ao criar cla:', e.message);
    return { ok: false, error: e.message };
  }
}

// ══════════════════════════════════════════════════════════════
// 4. ADDGLB — ADICIONA TODOS AO GRUPO GERAL
// ══════════════════════════════════════════════════════════════
async function addAllUsersToMainGroup(sock, ownerJid, mainType) {
  await loadState();
  const User = require('../../database/models/User');
  const results = { added: [], invited: [], errors: [], group: null };

  // ── v6.63: BUG CRÍTICO ────────────────────────────────────
  // Procurava _groupCache.get('aldeia'), mas 'aldeia' NUNCA existiu
  // em COMMUNITY_GROUPS (as chaves são arena/dungeons/trocas/
  // cavernas/lazer/arsenal). O .addglb dava sempre
  // "Grupo principal nao encontrado" — 100% das vezes, mesmo com
  // a comunidade criada. Agora usa o primeiro grupo disponível.
  const mainJid =
    (mainType && _groupCache.get(mainType)) ||
    _groupCache.get('lazer') ||
    _groupCache.get('arena') ||
    [..._groupCache.values()][0] ||
    null;

  if (!mainJid) {
    results.errors.push('Nenhum grupo criado ainda. Corre !darkrpg primeiro.');
    return results;
  }
  results.group = mainJid;

  let users = [];
  try { users = await User.find({ active: { $ne: false } }).lean(); }
  catch (e) { results.errors.push('Erro DB: ' + e.message); return results; }

  if (!users.length) { results.errors.push('Nenhum usuario na base de dados.'); return results; }

  for (const user of users) {
    const num = String(user.whatsappNumber || '').replace(/\D/g, '');
    if (!num) continue;
    const jid = num + '@s.whatsapp.net';
    if (jid === ownerJid || num === String(ownerJid).split('@')[0]) continue;

    let entrou = false;
    try {
      // O Baileys NÃO atira erro quando o add falha: devolve
      // [{ status: '403'|'409'|'200', jid }]. O catch nunca disparava,
      // por isso ninguém recebia convite e o relatório mentia.
      const r = await sock.groupParticipantsUpdate(mainJid, [jid], 'add');
      const st = Array.isArray(r) ? String(r[0]?.status || '') : '200';
      if (st === '200') { results.added.push({ user: user.name || num }); entrou = true; }
    } catch (e) {
      results.errors.push((user.name || num) + ': ' + e.message);
    }

    if (!entrou) {
      try {
        await sock.sendMessage(jid, { text: generateInviteMessage(user.name || 'Aventureiro') });
        results.invited.push({ user: user.name || num });
      } catch (e2) {
        results.errors.push((user.name || num) + ': ' + e2.message);
      }
    }
    await new Promise(r => setTimeout(r, 800));
  }
  return results;
}

// ══════════════════════════════════════════════════════════════
// 5. INICIALIZAR COMUNIDADE COMPLETA
// ══════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════
// 4b. DETECTAR COMUNIDADE JÁ CRIADA À MÃO  (v6.65)
//
// O utilizador criou a comunidade pela app do WhatsApp (com o
// "Geral" e o "Comunicados" que o WhatsApp cria sozinho). Criar
// à mão custa ZERO queries ao bot — é a via que não apanha
// rate-overlimit. Agora o bot adopta o que existe em vez de
// tentar criar tudo de novo.
//
// UMA query (groupFetchAllParticipating) traz comunidades E grupos
// com metadata completa: isCommunity, linkedParent, participants.
// ══════════════════════════════════════════════════════════════

/** Normaliza um JID para comparar (tira :device e sufixos). */
function _num(jid) {
  return String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '');
}

/**
 * Varre o WhatsApp à procura de comunidades onde o bot está.
 * Devolve { comunidades: [...], porParent: Map(commJid -> [grupos]) }
 * Custo: 1 query.
 */
async function scanCommunities(sock) {
  let todos = {};
  try {
    todos = (await sock.groupFetchAllParticipating()) || {};
  } catch (e) {
    return { ok: false, error: e.message, comunidades: [], porParent: new Map() };
  }

  const lista = Object.values(todos);
  const comunidades = lista.filter(g => g?.isCommunity);
  const porParent = new Map();

  for (const g of lista) {
    if (!g?.linkedParent) continue;
    if (!porParent.has(g.linkedParent)) porParent.set(g.linkedParent, []);
    porParent.get(g.linkedParent).push(g);
  }

  return { ok: true, comunidades, porParent, todos: lista };
}

/**
 * Escolhe a comunidade a adoptar: a que tem "DARK" / "VILLE" no
 * nome; senão, se só houver uma, essa; senão a mais recente.
 */
function _escolherComunidade(comunidades) {
  if (!comunidades.length) return null;
  const preferida = comunidades.find(c => /dark|ville/i.test(c.subject || ''));
  if (preferida) return preferida;
  if (comunidades.length === 1) return comunidades[0];
  return [...comunidades].sort((a, b) => (b.creation || 0) - (a.creation || 0))[0];
}

/**
 * Adopta a comunidade que o dono criou à mão:
 *   1. Encontra-a (1 query)
 *   2. Regista os subgrupos que já lá estão (Geral, Comunicados...)
 *   3. Garante que o dono está lá dentro e é admin
 * Custo: 1 query + o mínimo para adicionar/promover o dono.
 */
async function adoptCommunity(sock, ownerJid, nomeAlvo) {
  await loadState();

  const scan = await scanCommunities(sock);
  if (!scan.ok) return { ok: false, error: 'Não consegui ler os teus grupos: ' + scan.error };
  if (!scan.comunidades.length) {
    return { ok: false, error: 'Não encontrei nenhuma comunidade onde eu esteja. Cria a comunidade e adiciona-me a ela primeiro.' };
  }

  const alvo = nomeAlvo
    ? scan.comunidades.find(c => (c.subject || '').toLowerCase().includes(String(nomeAlvo).toLowerCase()))
    : _escolherComunidade(scan.comunidades);

  if (!alvo) {
    return {
      ok: false,
      error: 'Não encontrei "' + nomeAlvo + '". Tenho estas: ' +
        scan.comunidades.map(c => c.subject).join(', '),
    };
  }

  _communityJid = alvo.id;

  // ── Subgrupos que já existem (o Geral e o Comunicados do WhatsApp)
  const subs = scan.porParent.get(alvo.id) || [];
  const existentes = subs.map(g => ({ jid: g.id, nome: g.subject || '' }));

  // O "Geral"/"Comunicados" servem de casa para o addglb.
  const geral = subs.find(g => g.isCommunityAnnounce)
    || subs.find(g => /geral|general/i.test(g.subject || ''));
  const avisos = subs.find(g => /comunicad|avis|announce|news/i.test(g.subject || ''));

  if (geral) _groupCache.set('geral', geral.id);
  if (avisos) _groupCache.set('arsenal', avisos.id);

  // Reconhece grupos DARKRPG que já lá estejam (se correres 2x).
  for (const [type, def] of Object.entries(COMMUNITY_GROUPS)) {
    if (_groupCache.get(type)) continue;
    const hit = subs.find(g => (g.subject || '').toLowerCase() === def.name.toLowerCase());
    if (hit) _groupCache.set(type, hit.id);
  }

  // ── O dono está lá dentro? É admin?
  const onum = _num(ownerJid);
  const dono = { dentro: false, admin: false, acoes: [] };

  const eu = (alvo.participants || []).find(p => _num(p.id) === onum);
  if (eu) {
    dono.dentro = true;
    dono.admin = p_admin(eu);
  }

  if (!dono.dentro) {
    try {
      const r = await sock.groupParticipantsUpdate(alvo.id, [ownerJid], 'add');
      const st = Array.isArray(r) ? String(r[0]?.status || '200') : '200';
      if (st === '200') { dono.dentro = true; dono.acoes.push('adicionado à comunidade'); }
      else dono.acoes.push('não consegui adicionar-te (status ' + st + ') — entra pelo link');
    } catch (e) {
      dono.acoes.push('não consegui adicionar-te: ' + e.message);
    }
  }

  if (dono.dentro && !dono.admin) {
    await new Promise(r => setTimeout(r, 2000));
    try {
      const r = await sock.groupParticipantsUpdate(alvo.id, [ownerJid], 'promote');
      const st = Array.isArray(r) ? String(r[0]?.status || '200') : '200';
      if (st === '200') { dono.admin = true; dono.acoes.push('promovido a admin'); }
      else dono.acoes.push('não consegui promover-te (status ' + st + ') — o bot pode não ser admin');
    } catch (e) {
      dono.acoes.push('não consegui promover-te: ' + e.message);
    }
  }

  await _persist();

  return {
    ok: true,
    jid: alvo.id,
    nome: alvo.subject || 'Comunidade',
    existentes,
    geral: geral ? geral.subject : null,
    avisos: avisos ? avisos.subject : null,
    dono,
    outras: scan.comunidades.filter(c => c.id !== alvo.id).map(c => c.subject),
  };
}

function p_admin(p) {
  return p?.admin === 'admin' || p?.admin === 'superadmin';
}

// ══════════════════════════════════════════════════════════════
// 5. INICIALIZAR COMUNIDADE COMPLETA
// ══════════════════════════════════════════════════════════════
async function initCommunity(sock, ownerJid, opts = {}) {
  await loadState();
  const results = [];

  // 1. v6.65: PRIMEIRO tenta adoptar uma comunidade já criada à mão.
  // Criar pela app custa 0 queries ao bot — é o caminho que não
  // apanha rate-overlimit. Só cria do zero se não houver nenhuma.
  let comm;
  if (_communityJid && !opts.rescan) {
    comm = { ok: true, jid: _communityJid, name: 'DARK VILLE (já existia)' };
  } else {
    const ad = await adoptCommunity(sock, ownerJid, opts.nome);
    if (ad.ok) {
      comm = { ok: true, jid: ad.jid, name: ad.nome + ' (adoptada)', adopcao: ad };
    } else if (opts.criarSeNaoExistir) {
      comm = await createWhatsAppCommunity(sock, ownerJid);
    } else {
      comm = { ok: false, error: ad.error };
    }
  }
  results.push({ type: 'community', ...comm });
  if (!comm.ok) return results;

  const cJid = comm.ok ? comm.jid : null;

  // A criação da comunidade já custou queries — deixa o WhatsApp
  // respirar antes de começar os grupos.
  if (comm.ok && !_communityJid_jaExistia(comm)) {
    await new Promise(r => setTimeout(r, 10000));
  }

  // 2. Cria grupos (1 query cada) — salta os que já existem.
  // v6.64: 15s entre grupos em vez de 8s. Com 6 grupos são ~90s,
  // mas é a diferença entre criar e apanhar rate-overlimit.
  const criados = [];
  for (const [type, def] of Object.entries(COMMUNITY_GROUPS)) {
    if (_groupCache.get(type)) {
      results.push({ type, ok: true, name: def.name + ' (já existia)', jid: _groupCache.get(type) });
      continue;
    }
    const r = await createGroupInCommunity(sock, type, ownerJid, cJid);
    results.push({ type, ...r });
    if (r.ok) criados.push([type, r.jid]);

    // Se levou rate-overlimit mesmo assim, para já: insistir só piora.
    if (!r.ok && /rate-overlimit|429/i.test(String(r.error))) {
      results.push({
        type: 'aviso', ok: false,
        error: 'WhatsApp limitou a conta. Espera ~1h e corre !darkrpg outra vez — os grupos já criados são reaproveitados.',
      });
      break;
    }

    await new Promise(r => setTimeout(r, 15000));
  }

  // 3. Descrição + promote só no fim, com os grupos já criados.
  // Se falhar aqui, o grupo existe na mesma — é só cosmética.
  for (const [type, jid] of criados) {
    await _acabarGrupo(sock, type, jid, ownerJid);
    await new Promise(r => setTimeout(r, 4000));
  }

  await _persist();
  return results;
}

function _communityJid_jaExistia(comm) {
  return typeof comm?.name === 'string' && comm.name.includes('já existia');
}

// ══════════════════════════════════════════════════════════════
// 5b. LEADERBOARD / BOAS-VINDAS  (v6.63 — não existiam)
// ══════════════════════════════════════════════════════════════
const _LB = {
  level:   { campo: 'level',      titulo: '🏆 TOP NÍVEL',   sufixo: p => 'Nv.' + (p.level || 1) },
  kills:   { campo: 'kills',      titulo: '⚔️ TOP KILLS',   sufixo: p => (p.kills || 0) + ' kills' },
  berries: { campo: 'coins',      titulo: '💰 TOP BERRIES', sufixo: p => (p.coins || 0).toLocaleString() + ' berries' },
  rep:     { campo: 'reputation', titulo: '⭐ TOP REPUTAÇÃO', sufixo: p => (p.reputation || 0) + ' rep' },
};

async function generateLeaderboard(tipo = 'level', limite = 10) {
  const cfg = _LB[String(tipo).toLowerCase()] || _LB.level;
  const RPGPlayer = require('../../database/models/RPGPlayer');

  let top = [];
  try {
    top = await RPGPlayer.find().sort({ [cfg.campo]: -1 }).limit(limite).lean();
  } catch (e) {
    return '❌ Não consegui ler o ranking: ' + e.message;
  }
  if (!Array.isArray(top) || !top.length) {
    return cfg.titulo + '\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n\nAinda não há jogadores.\nUsa *!criarpersonagem* para começares.';
  }

  const medalhas = ['🥇', '🥈', '🥉'];
  const linhas = top.map((p, i) =>
    (medalhas[i] || (i + 1) + '.') + ' *' + (p.name || 'Aventureiro') + '* — ' + cfg.sufixo(p)
  );

  return cfg.titulo + '\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
    linhas.join('\n') +
    '\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n🕸️ *DARK VILLE*';
}

function generateWelcomeMessage(userName, groupName) {
  const nome = userName || 'Aventureiro';
  return '🕸️ *Bem-vindo à DARK VILLE, ' + nome + '!*\n' +
    '━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
    (groupName ? '📍 Estás em: *' + groupName + '*\n\n' : '') +
    '⚔️ Aqui joga-se a sério. Começa assim:\n\n' +
    '• *!criarpersonagem* — cria a tua ficha\n' +
    '• *!menu-rpg* — vê tudo o que dá para fazer\n' +
    '• *!regras* — lê antes de te queixares\n\n' +
    '━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
    '🏰 *Boa sorte. Vais precisar.*';
}

// ══════════════════════════════════════════════════════════════
// 6. COMUNICADO (ranking)
// ══════════════════════════════════════════════════════════════
async function generateDailyReport() {
  const RPGPlayer = require('../../database/models/RPGPlayer');
  let r = '⚔️ *COMUNICADO DARK VILLE* ⚔️\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

  try {
    const top = await RPGPlayer.find().sort({ level: -1 }).limit(5).lean();
    if (top.length) {
      r += '🏆 *TOP NIVEL:*\n';
      const medals = ['🥇', '🥈', '🥉'];
      top.forEach((p, i) => {
        r += (medals[i] || (i+1) + '.') + ' *' + p.name + '* — Nv.' + p.level + '\n';
      });
      r += '\n';
    }
  } catch {}

  try {
    const rich = await RPGPlayer.find().sort({ coins: -1 }).limit(5).lean();
    if (rich.length) {
      r += '💰 *TOP BERRIES:*\n';
      const medals = ['🥇', '🥈', '🥉'];
      rich.forEach((p, i) => {
        r += (medals[i] || (i+1) + '.') + ' *' + p.name + '* — ' + (p.coins || 0).toLocaleString() + '\n';
      });
      r += '\n';
    }
  } catch {}

  try {
    const killers = await RPGPlayer.find().sort({ kills: -1 }).limit(5).lean();
    if (killers.length) {
      r += '⚔️ *TOP KILLS:*\n';
      const medals = ['🥇', '🥈', '🥉'];
      killers.forEach((p, i) => {
        r += (medals[i] || (i+1) + '.') + ' *' + p.name + '* — ' + (p.kills || 0) + ' kills\n';
      });
    }
  } catch {}

  r += '\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n🕸️ *DARK VILLE — A comunidade cresce!*';
  return r;
}

// ══════════════════════════════════════════════════════════════
// EXPORTS
// ══════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════
// v7.25 — SELECCIONAR UM GRUPO DA COMUNIDADE COMO GRUPO DO RPG
// ══════════════════════════════════════════════════════════════

/**
 * Descobre a comunidade a que um grupo pertence (ou a guardada).
 * Ordem: parent deste grupo → guardada no MongoDB → varrimento.
 */
async function discoverCommunityForGroup(sock, groupJid) {
  await loadState();

  // 1. o grupo já está ligado a uma comunidade?
  if (groupJid) {
    try {
      const meta = await sock.groupMetadata(groupJid);
      const parent = meta?.linkedParent || meta?.parentGroup;
      if (parent) return { jid: parent, nome: 'esta comunidade' };
    } catch {}
  }

  // 2. comunidade guardada (ainda viva?)
  if (_communityJid) {
    try {
      const m = typeof sock.communityMetadata === 'function'
        ? await sock.communityMetadata(_communityJid)
        : await sock.groupMetadata(_communityJid);
      if (m) return { jid: _communityJid, nome: m?.subject || 'DARK VILLE' };
    } catch {}
  }

  // 3. varrimento (1 query)
  const scan = await scanCommunities(sock);
  if (scan.ok) {
    const alvo = _escolherComunidade(scan.comunidades);
    if (alvo) return { jid: alvo.id, nome: alvo.subject || 'comunidade' };
  }

  return {
    jid: null,
    erro: 'Não encontrei a comunidade. Cria-a no WhatsApp, adiciona-me como admin e corre *!darkrpg <nome>*.',
  };
}

/**
 * Adopta um grupo JÁ EXISTENTE como um dos grupos do RPG:
 * registra no cache (persistido), renomeia, põe a descrição, liga à
 * comunidade e promove o dono — tudo automaticamente.
 */
async function adoptGroupAs(sock, groupType, groupJid, ownerJid) {
  const def = COMMUNITY_GROUPS[groupType];
  if (!def) {
    return { ok: false, error: 'Tipo inválido: ' + groupType + ' (arena, dungeons, trocas, cavernas, lazer, arsenal)' };
  }
  await loadState();

  const comm = await discoverCommunityForGroup(sock, groupJid);
  if (!comm.jid) return { ok: false, error: comm.erro };
  if (_communityJid !== comm.jid) { _communityJid = comm.jid; await _persist(); }

  // 1. registar o grupo como este tipo (o RPG passa a reconhecê-lo)
  _groupCache.set(groupType, groupJid);
  await _persist();

  const acoes = [];

  // 2. renomear para o nome canónico
  try {
    const meta = await sock.groupMetadata(groupJid);
    if ((meta?.subject || '').trim() !== def.name) {
      await sock.groupUpdateSubject(groupJid, def.name);
      acoes.push('Renomeei para *' + def.name + '*');
    } else {
      acoes.push('O nome já era *' + def.name + '*');
    }
  } catch (e) {
    acoes.push('Não consegui renomear: ' + String(e?.message || e).slice(0, 50));
  }

  // 3. descrição
  try { await sock.groupUpdateDescription(groupJid, def.desc); acoes.push('Descrição actualizada'); } catch {}

  // 4. ligar à comunidade (se ainda não estiver)
  try {
    const meta = await sock.groupMetadata(groupJid);
    if (!meta?.linkedParent && typeof sock.communityLinkGroup === 'function') {
      await sock.communityLinkGroup(groupJid, comm.jid);
      acoes.push('Liguei o grupo à comunidade');
    }
  } catch {}

  // 5. promover o dono
  if (def.ownerAdm && ownerJid) {
    try {
      const meta = await sock.groupMetadata(groupJid);
      const p = (meta?.participants || []).find(x => _num(x.id) === _num(ownerJid));
      if (p && p.admin !== 'admin' && p.admin !== 'superadmin') {
        await sock.groupParticipantsUpdate(groupJid, [ownerJid], 'promote');
        acoes.push('Promovi-te a admin');
      }
    } catch {}
  }

  return { ok: true, jid: groupJid, nome: def.name, emoji: def.emoji, desc: def.desc, acoes };
}

module.exports = {
  COMMUNITY_GROUPS,
  COMMUNITY_RULES,
  EVENTS,
  generateLeaderboard,
  generateWelcomeMessage,
  loadState,
  forgetCommunity,
  getCommunityJid: () => _communityJid,
  _communityJid: () => _communityJid,
  _groupCache,
  _clanGroups,
  createWhatsAppCommunity,
  scanCommunities,
  adoptCommunity,
  ensureOwnerInCommunity,
  getCommunityInvite,
  createNamedGroup,
  linkExistingGroup,
  createGroupInCommunity,
  discoverCommunityForGroup,
  adoptGroupAs,
  createClanGroup,
  addAllUsersToMainGroup,
  initCommunity,
  generateInviteMessage,
  generateDailyReport,
};
