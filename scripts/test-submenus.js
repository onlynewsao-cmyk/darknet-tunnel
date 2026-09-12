/**
 * DARK BOT — Auditoria dos Submenus
 *
 * 1. ESTRUTURA — todos os itens têm descrição, emoji e categoria certa
 * 2. END-TO-END — abre cada submenu pelo WhatsApp e lê o que sai
 * 3. PERMISSÕES — Owner/VIP não aparecem para quem não deve ver
 *
 * Uso: node scripts/test-submenus.js
 */
'use strict';

process.env.OWNER_NUMBER = '244945280380';
process.env.BOT_NUMBER   = '244949926074';
process.env.BOT_NAME     = 'DARK BOT';
process.env.BOT_PREFIX   = '.';

const path = require('path');
const Module = require('module');
const origRequire = Module.prototype.require;

const OWNER = '244945280380';
const VIP   = '244555666777';
const FREE  = '244111222333';
const G1    = '111111@g.us';

const users = new Map([
  [OWNER, { whatsappNumber: OWNER, role: 'owner' }],
  [VIP,   { whatsappNumber: VIP,   role: 'premium', premiumUntil: new Date(Date.now() + 864e5 * 30) }],
  [FREE,  { whatsappNumber: FREE,  role: 'free' }],
]);

const grupo = {
  groupJid: G1, groupName: 'Teste', auraMode: 'assistant', botEnabled: true,
  isHosted: true, hostedUntil: null, trialExpiresAt: new Date(Date.now() + 864e5),
  commandsUsedToday: 0, totalCommands: 0,
  lastResetDate: new Date().toISOString().split('T')[0],
  blockedCommands: [], blockedSubmenus: [], groupPrefix: null,
  onlyAdmins: false, save: async () => {},
};

function userDoc(num) {
  const b = users.get(num) || { whatsappNumber: num, role: 'free' };
  return { ...b, active: true, commandsUsed: 0, createdAt: new Date(),
    isPremium() { return this.role === 'owner' || (this.role === 'premium' && (!this.premiumUntil || new Date(this.premiumUntil) > new Date())); },
    save: async () => {} };
}

Module.prototype.require = function (id) {
  const m = /models\/(\w+)$/.exec(id);
  if (m) {
    const wrap = (v) => { const p = Promise.resolve(v); p.lean = () => Promise.resolve(v); p.select = () => p; p.catch = () => p; return p; };
    if (m[1] === 'User') return { findOne: (q) => wrap(q?.whatsappNumber ? userDoc(String(q.whatsappNumber).replace(/\D/g, '')) : null), find: () => wrap([]), create: async () => userDoc(FREE), updateOne: async () => ({}), findOneAndUpdate: async () => null, countDocuments: async () => 0 };
    if (m[1] === 'GroupSettings') return { findOne: () => wrap(grupo), find: () => wrap([grupo]), create: async () => grupo, updateOne: async () => ({}), findOneAndUpdate: async () => null, countDocuments: async () => 0 };
    return { findOne: () => wrap(null), find: () => wrap([]), create: async () => ({}), updateOne: async () => ({}), findOneAndUpdate: async () => null, countDocuments: async () => 0, getOrCreate: async () => ({ addMessage() {}, save: async () => {}, messages: [] }) };
  }
  if (id.endsWith('botConfigCache')) {
    const cfg = { owner_number: OWNER, ai_auto_enabled: true };
    return { get: async (k, d) => (k in cfg ? cfg[k] : d), set: async () => {}, clear: () => {}, refresh: async () => 0, getMany: async () => ({}), dump: () => cfg };
  }
  return origRequire.apply(this, arguments);
};

const sd = require(path.join(__dirname, '..', 'src', 'bot', 'submenuData'));
const ch = require(path.join(__dirname, '..', 'src', 'bot', 'caseHandler'));
const cmdHandler = require(path.join(__dirname, '..', 'src', 'bot', 'commandHandler'));

let ok = 0, fail = 0;
const check = (nome, cond, extra = '') => {
  cond ? ok++ : fail++;
  console.log(`  ${cond ? '✅' : '❌'} ${nome}${extra ? ' → ' + String(extra).slice(0, 70) : ''}`);
};

// ── Socket falso ────────────────────────────────────────────
let ENVIADAS = [];
const sock = {
  user: { id: '244949926074:1@s.whatsapp.net' },
  sendMessage: async (jid, c) => { if (c?.react) return { key: {} }; const t = c?.text || c?.caption || ''; if (t) ENVIADAS.push(String(t)); return { key: { id: 'm' } }; },
  relayMessage: async (jid, msg) => {
    // submenus interactivos passam por aqui — extrai o corpo
    try {
      const b = msg?.interactiveMessage?.body?.text;
      if (b) ENVIADAS.push(String(b));
      const btns = msg?.interactiveMessage?.nativeFlowMessage?.buttons || [];
      for (const bt of btns) if (bt.buttonParamsJson) ENVIADAS.push('[LISTA]' + bt.buttonParamsJson);
    } catch {}
    return {};
  },
  groupMetadata: async () => ({ id: G1, subject: 'Teste', participants: [
    { id: OWNER + '@s.whatsapp.net', admin: null }, { id: VIP + '@s.whatsapp.net', admin: null }, { id: FREE + '@s.whatsapp.net', admin: null }] }),
  sendPresenceUpdate: async () => {}, readMessages: async () => {}, waUploadToServer: async () => ({}),
};

const mkMsg = (t, de) => ({ key: { remoteJid: G1, participant: de + '@s.whatsapp.net', id: 'X' + Math.random(), fromMe: false }, message: { conversation: t }, pushName: 'U', messageTimestamp: Math.floor(Date.now() / 1000) });

async function abrir(cmd, de) {
  ENVIADAS = [];
  try { await cmdHandler.handle(sock, mkMsg(cmd, de)); } catch (e) { return '💥 ' + e.message; }
  return ENVIADAS.join('\n');
}

(async () => {
  console.log('\n╔═══════════════════════════════════════════════════════════════════════╗');
  console.log('║            DARK BOT — AUDITORIA DOS SUBMENUS                          ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════╝\n');

  // ══ 1. ESTRUTURA ══════════════════════════════════════════
  console.log('▸ Estrutura dos 16 submenus');
  ch.loadCases();
  const nc = require(path.join(__dirname, '..', 'src', 'bot', 'nativeCommands'));
  const pk = { ...require(path.join(__dirname, '..', 'src', 'bot', 'packages', 'interactions')),
               ...require(path.join(__dirname, '..', 'src', 'bot', 'packages', 'family')),
               ...require(path.join(__dirname, '..', 'src', 'bot', 'packages', 'economy')),
               ...require(path.join(__dirname, '..', 'src', 'bot', 'packages', 'games')),
               ...require(path.join(__dirname, '..', 'src', 'bot', 'packages', 'cheats')) };
  const all = [...new Set([...ch.CASES.keys(), ...Object.keys(nc), ...Object.keys(pk)])];

  let semDesc = 0, semEmoji = 0, vazios = 0, comUndef = 0, total = 0;
  for (const cat of Object.keys(sd.SUBMENU_META)) {
    const items = sd.buildItems(all, cat);
    total += items.length;
    if (!items.length) vazios++;
    for (const i of items) {
      if (!i.desc || !String(i.desc).trim()) semDesc++;
      if (/undefined/i.test(String(i.desc)) || /undefined/i.test(String(i.cmd))) comUndef++;
      if (!i.emoji) semEmoji++;
    }
  }
  check('Nenhum submenu vazio', vazios === 0, `${vazios} vazios`);
  check('TODOS os itens têm descrição', semDesc === 0, `${semDesc} sem desc de ${total}`);
  check('Nenhum "undefined" visível', comUndef === 0, `${comUndef} casos`);
  check('Todos os itens têm emoji', semEmoji === 0, `${semEmoji} sem emoji`);

  // ══ 2. CATEGORIZAÇÃO ══════════════════════════════════════
  console.log('\n▸ Comandos no submenu certo');
  const esperado = { bass: 'audio', reverb: 'audio', play: 'downloads', tiktok: 'downloads',
    sticker: 'stickers', s: 'stickers', ia: 'ia', ban: 'admin', antilink: 'admin',
    forca: 'jogos', saldo: 'economia', abracar: 'interacoes', gay: 'zoeira',
    ping: 'info', broadcast: 'owner', wikipedia: 'search' };
  const errados = Object.entries(esperado).filter(([c, e]) => sd.categorize(c) !== e);
  check('Categorização correcta', errados.length === 0,
    errados.length ? errados.map(([c, e]) => `${c}→${sd.categorize(c)}≠${e}`).join(', ') : `${Object.keys(esperado).length}/${Object.keys(esperado).length}`);

  // ══ 3. AÇÃO DIRECTA ═══════════════════════════════════════
  // v7.7 — acção directa = apenas toggles (on/off) e acções que iniciam.
  // Info/status, medidores de zoeira e comandos com dados deixaram de ser sel.
  console.log('\n▸ "Ação directa" = toggle (on/off) ou acção que inicia');
  const acao = { antilink: true, saldo: true, dado: true, moeda: true, roleta: true,
                 daily: true, open: true, close: true,
                 ping: false, info: false, gay: false, cep: false, wikipedia: false,
                 play: false, sticker: false, ban: false, traduzir: false };
  const acErr = Object.entries(acao).filter(([c, e]) => sd.isSelectable(c) !== e);
  check('Classificação de ação directa', acErr.length === 0,
    acErr.length ? acErr.map(([c, e]) => `${c}=${sd.isSelectable(c)}≠${e}`).join(', ') : `${Object.keys(acao).length}/${Object.keys(acao).length}`);

  // ══ 4. DESCRIÇÕES DE QUALIDADE ════════════════════════════
  console.log('\n▸ Qualidade das descrições');
  const { describe } = require(path.join(__dirname, '..', 'src', 'bot', 'commandDescriptions'));
  check('.responsavel já não dá "undefined"', !/undefined/i.test(describe('responsavel', 'jogos')), describe('responsavel', 'jogos'));
  check('.bass tem descrição real', /grave/i.test(describe('bass', 'audio')), describe('bass', 'audio'));
  check('.play tem descrição real', /baixa|download/i.test(describe('play', 'downloads')), describe('play', 'downloads'));
  check('Comando desconhecido não inventa', describe('xyzabc123', 'outros').length > 0 && !/áudio|vídeo/i.test(describe('xyzabc123', 'outros')), describe('xyzabc123', 'outros'));
  check('Descrição cabe no limite do WhatsApp (72)', all.slice(0, 400).every(c => describe(c, 'outros').length <= 72));

  // ══ 5. END-TO-END: abrir submenus no WhatsApp ═════════════
  console.log('\n▸ Abrir submenus pelo WhatsApp (end-to-end)');
  const publicos = ['.menudownload', '.menustickers', '.menuia', '.menujogos', '.menueconomia', '.menuinteracoes', '.menutexto', '.menusearch'];
  let abriram = 0;
  for (const c of publicos) {
    const r = await abrir(c, FREE);
    if (r && r.length > 30 && !r.startsWith('💥')) abriram++;
  }
  check('Submenus públicos abrem para Free', abriram === publicos.length, `${abriram}/${publicos.length}`);

  const semUndef = [];
  for (const c of publicos) {
    const r = await abrir(c, FREE);
    if (/undefined/i.test(r)) semUndef.push(c);
  }
  check('Nenhum submenu mostra "undefined"', semUndef.length === 0, semUndef.join(', '));

  // ══ 6. PERMISSÕES ═════════════════════════════════════════
  console.log('\n▸ Permissões (Owner/VIP não vazam para Free)');
  const donoParaFree = await abrir('.menudono', FREE);
  check('Free NÃO vê submenu do dono', !donoParaFree || donoParaFree.length < 30 || /exclusiv|dono/i.test(donoParaFree), donoParaFree.slice(0, 50) || '(silêncio)');

  const maiscmdsFree = await abrir('.maiscmds', FREE);
  // Aceita qualquer recusa explícita (🚫/exclusivo/dono) ou silêncio total
  const recusou = /🚫|exclusiv|DONO SUPREMO|é para ADM/i.test(maiscmdsFree) || maiscmdsFree.length < 30;
  check('Free NÃO abre .maiscmds (era um buraco)', recusou, maiscmdsFree.replace(/\n/g,' ').slice(0, 55) || '(silêncio)');

  const donoParaDono = await abrir('.menudono', OWNER);
  check('Dono VÊ o submenu do dono', donoParaDono.length > 30, `${donoParaDono.length} chars`);

  const menu18Free = await abrir('.menu18', FREE);
  check('Free NÃO abre menu18 (VIP)', /VIP|exclusiv/i.test(menu18Free) || menu18Free.length < 30, menu18Free.slice(0, 50) || '(silêncio)');

  console.log(`\n  ${ok} OK / ${fail} FALHOU\n`);
  process.exit(fail ? 1 : 0);
})();
