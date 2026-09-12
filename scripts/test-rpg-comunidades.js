/**
 * DARK BOT — RPG + Comunidades WhatsApp
 *
 * Auditoria no mesmo estilo da das APIs: não basta o comando existir,
 * tem de ENTREGAR alguma coisa.
 *
 *   1. RPG — cada comando devolve conteúdo real?
 *   2. Comunidades — o bot consegue criar comunidade e grupos lá dentro?
 *
 * O bot NUNCA tinha implementado comunidades: a API do Baileys
 * (communityCreate / communityCreateGroup / communityLinkGroup)
 * existe há muito, mas nenhum comando a chamava.
 *
 * Uso: node scripts/test-rpg-comunidades.js
 */
'use strict';

process.env.OWNER_NUMBER = '244945280380';
process.env.BOT_PREFIX = '.';

const path = require('path');
const Module = require('module');
const origRequire = Module.prototype.require;

const OWNER = '244945280380';
const G = '111111@g.us';

// ── Mocks ───────────────────────────────────────────────────
Module.prototype.require = function (id) {
  const m = /models\/(\w+)$/.exec(id);
  if (m) {
    const doc = {
      whatsappNumber: OWNER, role: 'owner', active: true, isPremium() { return true; },
      save: async () => {}, coins: 1000, bank: 0, level: 1, xp: 0, hp: 100,
      groupJid: G, botEnabled: true, isHosted: true, hostedUntil: null,
      trialExpiresAt: new Date(Date.now() + 864e5), commandsUsedToday: 0, totalCommands: 0,
      lastResetDate: new Date().toISOString().split('T')[0],
      blockedCommands: [], blockedSubmenus: [], auraMode: 'assistant', onlyAdmins: false,
    };
    const w = (v) => {
      const p = Promise.resolve(v);
      p.lean = () => Promise.resolve(v); p.select = () => p; p.catch = () => p;
      p.sort = () => p; p.limit = () => p;
      return p;
    };
    return {
      findOne: () => w(doc), find: () => w([doc]), create: async () => doc,
      updateOne: async () => ({}), findOneAndUpdate: async () => doc,
      countDocuments: async () => 1, getOrCreate: async () => doc,
      deleteMany: async () => ({}), deleteOne: async () => ({}),
    };
  }
  if (id.endsWith('botConfigCache')) {
    const c = { owner_number: OWNER, ai_auto_enabled: false };
    return {
      get: async (k, d) => (k in c ? c[k] : d), set: async () => {}, clear: () => {},
      refresh: async () => 0, getMany: async () => ({}), dump: () => c,
    };
  }
  return origRequire.apply(this, arguments);
};

let ok = 0, fail = 0;
const check = (nome, cond, extra = '') => {
  cond ? ok++ : fail++;
  console.log(`  ${cond ? '✅' : '❌'} ${nome}${extra ? ' → ' + String(extra).replace(/\n/g, ' ').slice(0, 62) : ''}`);
};

(async () => {
  console.log('\n╔═══════════════════════════════════════════════════════════════════╗');
  console.log('║        DARK BOT — RPG + COMUNIDADES WHATSAPP                      ║');
  console.log('╚═══════════════════════════════════════════════════════════════════╝\n');

  // ══ 1. RPG ════════════════════════════════════════════════
  console.log('▸ RPG: os comandos entregam conteúdo?');
  const ch = require(path.join(__dirname, '..', 'src', 'bot', 'caseHandler'));
  ch.loadCases();
  const nc = require(path.join(__dirname, '..', 'src', 'bot', 'nativeCommands'));

  let OUT = [];
  const sock = {
    user: { id: '244949926074:1@s.whatsapp.net' },
    sendMessage: async (j, c) => {
      if (c?.react) return { key: {} };
      const t = c?.text || c?.caption || '';
      if (t) OUT.push(t);
      if (c?.image) OUT.push('[IMG]');
      return { key: { id: 'm' } };
    },
    // v6.87: os botões/listas interactivas vão por relayMessage — a sonda
    // só olhava para o sendMessage, por isso um comando que respondia com
    // botões contava como "vazio". O texto do corpo interactivo é conteúdo
    // como qualquer outro, e é isso que se regista aqui.
    relayMessage: async (j, message) => {
      const corpo = message?.viewOnceMessage?.message?.interactiveMessage?.body?.text
        || message?.interactiveMessage?.body?.text || '';
      OUT.push(corpo || '[INTERACTIVO]');
      return {};
    },
    groupMetadata: async () => ({ id: G, subject: 'T', participants: [{ id: OWNER + '@s.whatsapp.net', admin: 'admin' }] }),
    sendPresenceUpdate: async () => {}, readMessages: async () => {}, waUploadToServer: async () => ({}),
  };
  const msg = { key: { remoteJid: G, participant: OWNER + '@s.whatsapp.net', id: 'X' }, message: {} };
  const ctx = { remoteJid: G, senderNumber: OWNER, senderJid: OWNER + '@s.whatsapp.net', isGroup: true, pushName: 'Dark', isOwner: true, isPrimaryOwner: true };
  const cfg = { bot: { prefix: '.', name: 'DARK BOT' }, owner: { name: 'Dark', number: OWNER } };

  const cmds = ['rpgstart', 'rpgmenu', 'rpginfo', 'inventario', 'trabalhar', 'minerar',
                'pescar', 'explorar', 'dungeon', 'arena', 'rankrpg', 'classes',
                'forge', 'aventura', 'rpgstats'];
  const falhados = [];
  for (const c of cmds) {
    OUT = [];
    try {
      const corr = await ch.runCase(c, { sock, msg, ctx, args: [], text: '', prefix: '.', isOwner: true, config: cfg });
      if (!corr && typeof nc[c] === 'function') {
        await nc[c]({ sock, msg, ctx, args: [], isOwner: true, config: cfg });
      }
    } catch (e) { falhados.push(`${c}(${e.message.slice(0, 25)})`); continue; }
    // v6.62: "Erro no case" também é falha — antes contava como
    // sucesso só por ter havido resposta, e mascarava 7 comandos partidos.
    const saida = OUT.join(' ');
    if (saida.trim().length < 10) falhados.push(c + '(vazio)');
    else if (/Erro no case|is not a function|Cannot read|Cannot convert|is not defined/i.test(saida)) {
      falhados.push(c + '(erro)');
    }
  }
  check(`${cmds.length} comandos RPG respondem`, falhados.length === 0,
    falhados.length ? falhados.join(', ') : `${cmds.length}/${cmds.length}`);

  const eng = require(path.join(__dirname, '..', 'src', 'bot', 'rpg', 'engine'));
  check('Engine tem raças e classes',
    Object.keys(eng.RACES || {}).length > 0 && Object.keys(eng.CLASSES || {}).length > 0,
    `${Object.keys(eng.RACES || {}).length} raças, ${Object.keys(eng.CLASSES || {}).length} classes`);

  // v6.62: o engine v7 substituiu o modelo antigo e partiu 7 comandos.
  const compat = ['RACES', 'CLASSES', 'BIOMES', 'QUESTS', 'NPCS', 'RECIPES'];
  const semCompat = compat.filter(k => !eng[k] || Object.keys(eng[k]).length === 0);
  check('Camada de compatibilidade completa', semCompat.length === 0,
    semCompat.join(', ') || compat.join(', '));
  check('generateEnemy funciona', typeof eng.generateEnemy === 'function' && eng.generateEnemy(5)?.hp > 0);
  check('generateEnemy usa bosses em nível alto', eng.generateEnemy(30)?.hp > eng.generateEnemy(5)?.hp);
  check('calcDamage funciona', typeof eng.calcDamage === 'function' && eng.calcDamage({ atk: 20 }, { def: 5 })?.dano > 0);

  // ══ 2. COMUNIDADES — a API existe? ════════════════════════
  console.log('\n▸ Comunidades: a API do Baileys suporta?');
  const dts = require('fs').readFileSync(
    path.join(__dirname, '..', 'node_modules', '@systemzero', 'baileys', 'lib', 'Socket', 'communities.d.ts'), 'utf8');
  check('communityCreate existe', /communityCreate:/.test(dts));
  check('communityCreateGroup existe', /communityCreateGroup:/.test(dts));
  check('communityLinkGroup existe', /communityLinkGroup:/.test(dts));

  // ══ 3. A AURA sabe usá-las? ═══════════════════════════════
  console.log('\n▸ A AURA cria comunidades por conversa');
  const ACT = require(path.join(__dirname, '..', 'src', 'aura', 'auraActions'));

  const casos = [
    ['cria uma comunidade chamada Dark Net', 'criarComunidade', 'Dark Net'],
    ['cria um grupo na comunidade chamado Avisos', 'grupoNaComunidade', 'Avisos'],
    ['adiciona um grupo na comunidade chamado Suporte', 'ligarGrupoNomeado', 'Suporte'],
    ['liga este grupo a comunidade', 'ligarComunidade', undefined],
  ];
  const erros = casos.filter(([t, a, v]) => {
    const r = ACT.detectarAcao(t);
    return !r || r.acao !== a || (v !== undefined && r.valor !== v);
  });
  check('Detecta as ordens de comunidade', erros.length === 0,
    erros.length ? erros.map(e => e[0]).join(' | ') : `${casos.length}/${casos.length}`);

  // não confunde com grupo/canal normais
  check('"cria um grupo chamado X" continua grupo',
    ACT.detectarAcao('cria um grupo chamado Familia')?.acao === 'criarGrupo');
  check('"cria um canal chamado X" continua canal',
    ACT.detectarAcao('cria um canal chamado News')?.acao === 'criarCanal');
  check('"abre o grupo" continua abrir',
    ACT.detectarAcao('abre o grupo')?.acao === 'abrirGrupo');

  // ══ 4. Execução completa ══════════════════════════════════
  console.log('\n▸ Fluxo completo (comunidade → grupo dentro)');
  const chamadas = [];
  const sockC = {
    communityCreate: async (n) => { chamadas.push('create:' + n); return { id: '999@g.us', subject: n }; },
    communityCreateGroup: async (n, p, c) => { chamadas.push('group:' + n + '@' + c); return { id: '888@g.us', subject: n }; },
    communityLinkGroup: async (g, c) => { chamadas.push('link:' + g + '->' + c); },
    communityInviteCode: async () => 'COMM123',
    groupInviteCode: async () => 'GRP456',
    groupMetadata: async () => ({ linkedParent: '' }),
    sendMessage: async () => ({ key: {} }),
  };
  const ctxC = { remoteJid: G, senderNumber: OWNER, senderJid: OWNER + '@s.whatsapp.net', isGroup: true, botName: 'DARK BOT' };

  const r1 = await ACT.executar('criarComunidade', 'Dark Net', { sock: sockC, ctx: ctxC });
  check('Cria a comunidade', r1.ok, r1.msg);

  const r2 = await ACT.executar('grupoNaComunidade', 'Avisos', { sock: sockC, ctx: ctxC });
  check('Cria grupo DENTRO da comunidade', r2.ok, r2.msg);
  check('Usou a comunidade certa', chamadas.some(c => c.startsWith('group:Avisos@999@g.us')),
    chamadas.find(c => c.startsWith('group:')) || '—');

  const r3 = await ACT.executar('ligarComunidade', null, { sock: sockC, ctx: ctxC });
  check('Liga grupo existente à comunidade', r3.ok, r3.msg);

  // sem comunidade criada → avisa em vez de rebentar
  ACT._ultimaComunidade.clear();
  const r4 = await ACT.executar('grupoNaComunidade', 'X', {
    sock: { ...sockC, groupMetadata: async () => ({}) }, ctx: { ...ctxC, isGroup: false },
  });
  check('Sem comunidade avisa (não rebenta)', r4.ok === false && !!r4.msg, r4.msg);

  console.log(`\n  ${ok} OK / ${fail} FALHOU\n`);
  process.exit(fail ? 1 : 0);
})();
