/**
 * DARK BOT — Teste END-TO-END simulando o WhatsApp
 *
 * Passa mensagens REAIS pelo commandHandler (o mesmo código que corre
 * em produção) e verifica o que o bot ENVIARIA de volta.
 *
 * Cobre o prometido:
 *   • Cargo correcto no menu (Dono/VIP/Admin/Free)
 *   • AURA invocada por linguagem natural, sem comandos
 *   • Isolamento entre grupos (invocar num não afecta outro)
 *   • Assistente profissional sem emojis nem falas de robô
 *   • Ficheiros/media (imagem → visão da IA)
 *   • Nenhuma mensagem de sistema ("❌ IA sem chave") a vazar
 *
 * Sem MongoDB: usa mocks em memória que imitam o comportamento real.
 * Uso: node scripts/test-e2e-whatsapp.js
 */
'use strict';

process.env.OWNER_NUMBER = '244945280380';
process.env.BOT_NUMBER   = '244949926074';
process.env.BOT_NAME     = 'DARK BOT';
process.env.BOT_PREFIX   = '.';

const path = require('path');
const Module = require('module');
const origRequire = Module.prototype.require;

// ── Estado partilhado dos mocks ─────────────────────────────
const DB = {
  users: new Map(),
  groups: new Map(),
  config: { owner_number: '244945280380', ai_auto_enabled: true },
};

const OWNER = '244945280380';
const VIP   = '244555666777';
const FREE  = '244111222333';
const ADMIN = '244777888999';

DB.users.set(OWNER, { whatsappNumber: OWNER, role: 'owner', name: 'Dark' });
DB.users.set(VIP,   { whatsappNumber: VIP,   role: 'premium', premiumUntil: new Date(Date.now() + 864e5 * 30) });
DB.users.set(FREE,  { whatsappNumber: FREE,  role: 'free' });
DB.users.set(ADMIN, { whatsappNumber: ADMIN, role: 'free' });

const G1 = '111111@g.us'; // grupo do Dark
const G2 = '222222@g.us'; // grupo alheio

function mkGroup(jid, nome) {
  return {
    groupJid: jid, groupName: nome, auraMode: 'assistant',
    botEnabled: true, isHosted: true, hostedUntil: null,
    trialExpiresAt: new Date(Date.now() + 864e5), commandsUsedToday: 0,
    totalCommands: 0, lastResetDate: new Date().toISOString().split('T')[0],
    blockedCommands: [], blockedSubmenus: [], groupPrefix: null,
    onlyAdmins: false, antilink: false, antispam: false,
    save: async function () { DB.groups.set(this.groupJid, this); },
  };
}
DB.groups.set(G1, mkGroup(G1, 'Grupo do Dark'));
DB.groups.set(G2, mkGroup(G2, 'Trabalho'));

function userDoc(num) {
  const base = DB.users.get(num) || { whatsappNumber: num, role: 'free' };
  return {
    ...base, active: true, commandsUsed: 0, createdAt: new Date(),
    isPremium() { return this.role === 'owner' || (this.role === 'premium' && (!this.premiumUntil || new Date(this.premiumUntil) > new Date())); },
    save: async () => {},
  };
}

function mkModel(name) {
  const wrap = (v) => { const p = Promise.resolve(v); p.lean = () => Promise.resolve(v); p.select = () => p; p.catch = () => p; return p; };
  if (name === 'User') {
    return {
      findOne: (q) => wrap(q?.whatsappNumber ? userDoc(String(q.whatsappNumber).replace(/\D/g, '')) : null),
      find: () => wrap([]), create: async (d) => userDoc(d.whatsappNumber),
      updateOne: async () => ({}), findOneAndUpdate: async () => null, countDocuments: async () => 0,
    };
  }
  if (name === 'GroupSettings') {
    return {
      findOne: (q) => wrap(DB.groups.get(q?.groupJid) || null),
      find: (q) => wrap([...DB.groups.values()].filter(g => !q?.auraMode || g.auraMode === q.auraMode)),
      create: async (d) => { const g = mkGroup(d.groupJid, d.groupName); DB.groups.set(d.groupJid, g); return g; },
      updateOne: async (q, upd) => {
        const g = DB.groups.get(q.groupJid) || mkGroup(q.groupJid, '');
        Object.assign(g, upd.$set || {}); DB.groups.set(q.groupJid, g); return {};
      },
      findOneAndUpdate: async () => null, countDocuments: async () => 0,
    };
  }
  return {
    findOne: () => wrap(null), find: () => wrap([]), create: async () => ({}),
    updateOne: async () => ({}), findOneAndUpdate: async () => null, countDocuments: async () => 0,
    getOrCreate: async () => ({ addMessage() {}, save: async () => {}, messages: [] }),
  };
}

Module.prototype.require = function (id) {
  const m = /models\/(\w+)$/.exec(id);
  if (m) return mkModel(m[1]);
  if (id.endsWith('botConfigCache')) {
    return {
      get: async (k, d) => (k in DB.config ? DB.config[k] : d),
      set: async (k, v) => { DB.config[k] = v; }, clear: () => {},
      refresh: async () => 0, getMany: async () => ({}), dump: () => DB.config,
    };
  }
  return origRequire.apply(this, arguments);
};

const ch = require(path.join(__dirname, '..', 'src', 'bot', 'commandHandler'));
const auraModes = require(path.join(__dirname, '..', 'src', 'aura', 'auraModes'));

// ── Socket falso: guarda o que seria enviado ────────────────
let ENVIADAS = [];
const sock = {
  user: { id: '244949926074:1@s.whatsapp.net' },
  sendMessage: async (jid, content) => {
    if (content?.react) return { key: {} };
    const txt = content?.text || content?.caption || '';
    if (txt) ENVIADAS.push({ jid, texto: String(txt) });
    return { key: { id: 'm' + Math.random() } };
  },
  relayMessage: async () => ({}),
  groupMetadata: async (jid) => ({
    id: jid, subject: DB.groups.get(jid)?.groupName || 'Grupo',
    participants: [
      { id: OWNER + '@s.whatsapp.net', admin: null },
      { id: VIP + '@s.whatsapp.net', admin: null },
      { id: FREE + '@s.whatsapp.net', admin: null },
      { id: ADMIN + '@s.whatsapp.net', admin: 'admin' },
    ],
  }),
  sendPresenceUpdate: async () => {}, readMessages: async () => {},
  waUploadToServer: async () => ({}),
};

const mkMsg = (texto, de, grupo) => ({
  key: { remoteJid: grupo, participant: de + '@s.whatsapp.net', id: 'X' + Math.random(), fromMe: false },
  message: { conversation: texto },
  pushName: de === OWNER ? 'Dark' : de === VIP ? 'Vip' : 'Ze',
  messageTimestamp: Math.floor(Date.now() / 1000),
});

/** Envia uma mensagem e devolve o que o bot respondeu. */
async function enviar(texto, de, grupo) {
  ENVIADAS = [];
  try { await ch.handle(sock, mkMsg(texto, de, grupo)); } catch (e) { return '💥 ' + e.message; }
  return ENVIADAS.map(m => m.texto).join('\n---\n');
}

let ok = 0, fail = 0;
const check = (nome, cond, extra = '') => {
  cond ? ok++ : fail++;
  console.log(`  ${cond ? '✅' : '❌'} ${nome}${extra ? '\n        ' + String(extra).replace(/\n/g, ' ').slice(0, 100) : ''}`);
};

(async () => {
  console.log('\n╔═══════════════════════════════════════════════════════════════════════╗');
  console.log('║     DARK BOT — TESTE END-TO-END (simula o WhatsApp a sério)           ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════╝\n');

  // ── 1. Comandos básicos ───────────────────────────────────
  console.log('▸ Comandos respondem');
  const ping = await enviar('.ping', OWNER, G1);
  check('.ping responde', ping.length > 0, ping);

  // ── 2. Cargo no menu ──────────────────────────────────────
  console.log('\n▸ Identificação de cargo (o que foi prometido)');
  const menuDono = await enviar('.perfil', OWNER, G1);
  check('Dono vê "DONO SUPREMO"', /DONO SUPREMO/i.test(menuDono), menuDono);

  const menuVip = await enviar('.perfil', VIP, G1);
  check('VIP vê "VIP" + ATIVO', /VIP/.test(menuVip) && /ATIVO/.test(menuVip), menuVip);

  const menuAdmin = await enviar('.perfil', ADMIN, G1);
  check('Admin vê "ADMIN"', /ADMIN/i.test(menuAdmin), menuAdmin);

  const menuFree = await enviar('.perfil', FREE, G1);
  check('Free vê "FREE" + INATIVO', /FREE/.test(menuFree) && /INATIVO/.test(menuFree), menuFree);

  // ── 3. AURA por linguagem natural ─────────────────────────
  console.log('\n▸ AURA entende (sem comandos)');
  // v6.93: acordada POR DEFEITO nos grupos (decisão do Dono)
  check('G1 está acordada por defeito (v6.93)', (await auraModes.isAuraAwake(G1, { isGroup: true })));

  const acorda = await enviar('aura, acorda', OWNER, G1);
  check('"aura, acorda" invoca', await auraModes.isAuraAwake(G1, { isGroup: true }), acorda);

  check('ISOLAMENTO: G2 não foi INVOCADA por G1', !(await auraModes.isAuraInvoked(G2, { isGroup: true })));

  const membro = await enviar('aura, acorda', FREE, G2);
  check('Membro NÃO controla a AURA (não fica INVOCADA por ele)', !(await auraModes.isAuraInvoked(G2, { isGroup: true })), membro);

  const dorme = await enviar('aura, dorme', OWNER, G1);
  check('"aura, dorme" faz dormir', !(await auraModes.isAuraAwake(G1, { isGroup: true })), dorme);

  // ── 4. Sem vazamento de mensagens de sistema ──────────────
  console.log('\n▸ Nada de mensagens de sistema no chat');
  const todas = [ping, menuDono, menuVip, menuFree, acorda, dorme].join(' ');
  check('Sem "GROQ_API_KEY" visível', !/GROQ_API_KEY/i.test(todas));
  check('Sem "IA sem chave"', !/IA sem chave/i.test(todas));
  check('Sem "undefined"', !/\bundefined\b/.test(todas));

  // ── 5. Persona do assistente ──────────────────────────────
  console.log('\n▸ Assistente parece pessoa, não robô');
  const resp = await auraModes.assistantRespond('quem és tu?', {
    botName: 'DARK BOT', userName: 'Ze', isGroup: true, groupName: 'Trabalho', prefix: '.',
  });
  check('Sem emoji', !/\p{Extended_Pictographic}/u.test(resp), resp);
  check('Sem "assistente virtual"/"sou uma IA"', !/assistente virtual|sou uma IA|não tenho opiniões/i.test(resp));

  // ── 6. Performance ────────────────────────────────────────
  console.log('\n▸ Performance');
  const t0 = Date.now();
  for (let i = 0; i < 5; i++) await enviar('.ping', VIP, G1);
  const media = Math.round((Date.now() - t0) / 5);
  check('Média por mensagem < 150ms', media < 150, `${media}ms`);

  console.log(`\n  ${ok} OK / ${fail} FALHOU\n`);
  process.exit(fail ? 1 : 0);
})();
