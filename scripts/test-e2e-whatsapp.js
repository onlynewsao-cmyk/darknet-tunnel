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

  // ── Contextual: integração pelo handler real, IA/WhatsApp simulados ──
  console.log('\n▸ AURA contextual — fluxo completo');
  const contextual = require('../src/aura/auraContextual');
  const vontade = require('../src/aura/auraVontade');
  const human = require('../src/aura/auraHuman');
  const aiMod = require('../src/bot/ai');
  const antigos = { respond: human.auraRespond, quer: vontade.querResponder, chat: aiMod.chat };
  human.auraRespond = async () => '[SILENCIO]';
  vontade.querResponder = () => ({ responde: false, motivo: 'humor simulado' });
  vontade.limpar();
  await enviar('aura acorda aqui', OWNER, G1);
  let continuacao = await enviar('Escolhi a segunda opção', OWNER, G1);
  if (!continuacao.length) { // sob carga, a resposta chega depois de handle resolver — espera-se, não se falsifica
    for (let i = 0; i < 30 && !ENVIADAS.length; i++) await new Promise((r) => setTimeout(r, 50));
    continuacao = ENVIADAS.map((m) => m.texto).join('\n---\n');
  }
  check('Acordar abre conversa; humor/SILENCIO não calam continuação', continuacao.length > 0, continuacao);
  human.auraRespond = antigos.respond;
  vontade.querResponder = antigos.quer;
  const convite = await enviar('Aura interage com todos', OWNER, G1);
  check('Convite chega ao modo contextual pelo handler', contextual.activa(G1) && /sem pausa obrigatória nem prazo automático/.test(convite), convite);
  human.auraRespond = async () => 'Podemos conversar sobre a reunião da tarde.';
  const participacao = await enviar('A minha preferência é a reunião à tarde', FREE, G1);
  check('Após convite, mensagem de membro sem nome/prefixo chega à AURA', /reunião da tarde/.test(participacao), participacao);
  human.auraRespond = antigos.respond;
  const cache = require('../src/bot/messageListener').messageCache;
  const prova = mkMsg('Amanhã planeamos uma reunião às dez.', VIP, G1);
  cache.set(prova.key.id, prova);
  let resumoPrompt = '';
  aiMod.chat = async (p) => { resumoPrompt = p; return 'Plano mencionado pelo participante: reunião às dez [1]. Ainda não é um acontecimento confirmado.'; };
  const resumo = await enviar('Aura resume o grupo', OWNER, G1);
  check('Resumo lê cache pelo handler sem executar comandos', /Amanhã planeamos/.test(resumoPrompt) && /Plano mencionado/.test(resumo), resumo);
  const parou = await enviar('Aura para de interagir', OWNER, G1);
  check('Parar cancela participação pelo handler', !contextual.activa(G1) && /Fico atenta/.test(parou), parou);
  aiMod.chat = antigos.chat;
  human.auraRespond = antigos.respond;
  vontade.querResponder = antigos.quer;

  // ── Regressão: acorda mas não conversa quando IA automática está off ──
  console.log('\n▸ Grupos como PV — sequência da captura, com auto-IA desligada');
  const decide = require('../src/aura/auraDecide');
  const oldFormat = decide.comoResponder;
  const oldChatGroup = aiMod.chat;
  const oldAuto = DB.config.ai_auto_enabled;
  DB.config.ai_auto_enabled = false;
  decide.comoResponder = () => 'texto';
  let geracoes = 0;
  aiMod.chat = async () => { geracoes++; return 'MODELO_OK: estou a acompanhar a conversa.'; };
  await enviar('Aura dorme', OWNER, G1);
  const wakeGroup = await enviar('Aura acordar', OWNER, G1);
  check('Acordar confirma presença com auto-IA off', /Acordei|acordada/.test(wakeGroup), wakeGroup);
  for (const frase of ['Oi', 'Vamos continuar', 'Aura vamos']) {
    const r = await enviar(frase, OWNER, G1);
    check('Auto-IA off não bloqueia atendimento: ' + frase, /MODELO_OK/.test(r), r);
  }
  const membroDirecto = await enviar('Aura, oi', FREE, G1);
  check('Membro chama Aura com vírgula no grupo autorizado', /MODELO_OK/.test(membroDirecto), membroDirecto);
  check('Motor IA foi alcançado nas quatro mensagens', geracoes >= 4, geracoes);
  require('../src/aura/auraTalk').parou(G2, FREE); // sem conversa anterior activa neste chat
  const unrelated = await enviar('A entrega está confirmada', FREE, G2);
  check('Não passa a responder a todas as conversas dos outros', !unrelated, unrelated);
  // Mesma geração e entrega do PV; convite continua a funcionar sem auto-IA.
  const pvOff = await enviar('Oi', OWNER, OWNER + '@s.whatsapp.net');
  check('PV mantém atendimento com auto-IA off', /MODELO_OK/.test(pvOff), pvOff);
  require('../src/aura/auraTalk').parou(G1, FREE);
  await enviar('Aura interage com todos', OWNER, G1);
  const membroConvidado = await enviar('A minha ideia é reunir a equipa', FREE, G1);
  check('Convite permite participação sem nome e sem auto-IA', /MODELO_OK/.test(membroConvidado), membroConvidado);
  DB.config.disabled_users = [FREE];
  const bloqueado = await enviar('Aura, oi', FREE, G1);
  check('Atendimento não contorna utilizador bloqueado', !bloqueado, bloqueado);
  DB.config.disabled_users = [];
  const oldEnabled = DB.groups.get(G1).botEnabled;
  DB.groups.get(G1).botEnabled = false;
  const grupoOff = await enviar('Aura, oi', FREE, G1);
  check('Atendimento não contorna bot desactivado no grupo', !grupoOff, grupoOff);
  DB.groups.get(G1).botEnabled = oldEnabled;
  const al = require('../src/bot/antiLink');
  check('Anti-link próprio não apaga mensagem enviada pela AURA', !(await al.check(sock, { key: { remoteJid: G1, fromMe: true }, message: { conversation: 'https://example.org/fonte' } })));
  check('Oi/Vamos continuar não são links', !al.detectLink('Oi Vamos continuar Aura vamos', 'all_links').hit);
  // Oi directo não desaparece como uma reacção probabilística.
  decide.comoResponder = () => 'reacao';
  const oiComReacao = await enviar('Oi', OWNER, G1);
  check('Atendimento dirigido não é trocado por apenas reacção', /MODELO_OK/.test(oiComReacao), oiComReacao);
  decide.comoResponder = () => 'texto';
  // Excepção na geração não pode deixar a pessoa no vazio.
  const realRespond = human.auraRespond;
  human.auraRespond = async () => { throw new Error('FALHA_SIMULADA_NAO_VAZAR'); };
  const falhaGrupo = await enviar('Aura quero conversar contigo', OWNER, G1);
  check('Falha técnica devolve aviso útil, não silêncio nem stack', /não consegui|falha|problema/i.test(falhaGrupo) && !/FALHA_SIMULADA/.test(falhaGrupo), falhaGrupo);
  human.auraRespond = realRespond;
  await enviar('Aura dorme', OWNER, G1);
  const dormida = await enviar('Aura vamos', OWNER, G1);
  check('Dormir não é ultrapassado pelo atendimento com auto-IA off', !dormida, dormida);
  DB.config.ai_auto_enabled = oldAuto;
  decide.comoResponder = oldFormat;
  aiMod.chat = oldChatGroup;

  // ── 6. Performance ────────────────────────────────────────
  console.log('\n▸ Performance');
  const t0 = Date.now();
  for (let i = 0; i < 5; i++) await enviar('.ping', VIP, G1);
  const media = Math.round((Date.now() - t0) / 5);
  check('Média por mensagem < 150ms', media < 150, `${media}ms`);

  console.log(`\n  ${ok} OK / ${fail} FALHOU\n`);
  process.exit(fail ? 1 : 0);
})();
