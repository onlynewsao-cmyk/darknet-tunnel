/**
 * DARK RPG — países internacionais, mercado e arte temática.
 * Uso: node scripts/test-rpg-internacional.js
 */
'use strict';

const Module = require('module');
const originalRequire = Module.prototype.require;
const settings = [];
const trades = [];
const players = new Map([
  ['244900000001', { whatsappNumber: '244900000001', name: 'Kito', inventory: ['ferro', 'poção de vida'], level: 8, coins: 400 }],
  ['5511999999999', { whatsappNumber: '5511999999999', name: 'Lia', inventory: ['poção de mana', 'poção de vida'], level: 17, coins: 800 }],
]);
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));

function query(value) {
  return {
    select() { return this; },
    sort() { return this; },
    limit() { return this; },
    lean: async () => clone(value),
  };
}
const GroupSettings = {
  findOne: ({ groupJid }) => query(settings.find(s => s.groupJid === groupJid) || null),
  find: () => query(settings),
  findOneAndUpdate: async ({ groupJid }, update) => {
    let doc = settings.find(s => s.groupJid === groupJid);
    if (!doc) { doc = { groupJid }; settings.push(doc); }
    Object.assign(doc, update.$setOnInsert || {}, update.$set || {});
    return clone(doc);
  },
};
const RPGTrade = {
  countDocuments: async (where) => trades.filter(t => t.sellerNumber === where.sellerNumber && t.status === where.status).length,
  create: async (data) => {
    const trade = { ...clone(data), _id: `${String(trades.length + 1).padStart(24, '0')}`, status: 'open', createdAt: new Date() };
    trades.push(trade); return clone(trade);
  },
  find: (where) => {
    let rows = trades.filter(t => Object.entries(where || {}).every(([k, v]) => t[k] === v));
    return {
      sort() { rows = [...rows].reverse(); return this; },
      limit(n) { rows = rows.slice(0, n); return this; },
      lean: async () => clone(rows),
    };
  },
  findOne: (where) => query(trades.find(t => Object.entries(where || {}).every(([k, v]) => t[k] === v)) || null),
  findOneAndUpdate: async (where, update) => {
    const trade = trades.find(t => Object.entries(where || {}).every(([k, v]) => t[k] === v));
    if (!trade) return null;
    Object.assign(trade, update.$set || {});
    return clone(trade);
  },
  updateOne: async (where, update) => {
    const trade = trades.find(t => Object.entries(where || {}).every(([k, v]) => t[k] === v));
    if (trade) Object.assign(trade, update.$set || {});
    return { modifiedCount: trade ? 1 : 0 };
  },
};
const engine = {
  getPlayer: async number => players.get(String(number).replace(/\D/g, '')),
  savePlayer: async () => {},
};

Module.prototype.require = function (id) {
  // O teste só valida a configuração do card; não renderiza PNG/MP4.
  if (id === 'sharp') return () => ({ resize: () => ({ jpeg: () => ({ toBuffer: async () => Buffer.alloc(0) }) }) });
  if (/database\/models\/GroupSettings$/.test(id)) return GroupSettings;
  if (/database\/models\/RPGTrade$/.test(id)) return RPGTrade;
  if (id === './engine' && /\/rpg\/trade\.js$/.test(this.filename)) return engine;
  return originalRequire.apply(this, arguments);
};

const regions = require('../src/bot/rpg/regions');
const trade = require('../src/bot/rpg/trade');
const gate = require('../src/bot/rpg/gate');
const art = require('../src/bot/welcomeArt');

let ok = 0, fail = 0;
function test(label, condition, details = '') {
  condition ? ok++ : fail++;
  console.log(`  ${condition ? '✅' : '❌'} ${label}${details ? ' → ' + details : ''}`);
}

(async () => {
  console.log('\n╔══ DARK RPG — MUNDO INTERNACIONAL ══╗');

  console.log('\n▸ A. Cada grupo com Modo RPG é um país-território');
  const luanda = await regions.ensureGroupCountry('grupo-angola@g.us', 'Reino Kwanza');
  const brasil = await regions.ensureGroupCountry('grupo-brasil@g.us', 'Império Aurora');
  test('O território usa o nome exacto do primeiro grupo', luanda.ok && luanda.country.name === 'Reino Kwanza', luanda.country?.name);
  test('O segundo grupo é outro território com o próprio nome', brasil.ok && brasil.country.name === 'Império Aurora', brasil.country?.name);
  const sameName = await regions.ensureGroupCountry('grupo-duplicado@g.us', 'Reino Kwanza');
  settings.forEach(s => { s.modorpg = true; });
  const active = await regions.activeRegions();
  test('Dois grupos podem ter o mesmo nome, mas são territórios separados', sameName.ok && sameName.country.id !== luanda.country.id, sameName.country?.id);
  test('Status internacional lista grupos com Modo RPG activo', active.length === 3 && active.every(x => x.country?.isGroupTerritory), String(active.length));

  console.log('\n▸ B. Inventário é global; mercado usa escrow');
  const offer = await trade.criarOferta({
    sellerNumber: '244900000001', sellerName: 'Kito', sellerCountry: luanda.country.name,
    offerItem: 'ferro', wantedItem: 'poção de mana',
  });
  test('Oferta remove item do vendedor para escrow', offer.ok && !players.get('244900000001').inventory.includes('ferro'), trade.codigo(offer.trade));
  const listed = await trade.listarOfertas();
  test('Oferta aparece no mercado global', listed.length === 1 && /ferro/.test(trade.linhaDaOferta(listed[0])), trade.linhaDaOferta(listed[0]));
  const accepted = await trade.aceitarOferta({ buyerNumber: '5511999999999', buyerName: 'Lia', id: trade.codigo(offer.trade) });
  test('Jogador de outra região aceita a oferta', accepted.ok && trades[0].status === 'completed', trades[0].status);
  test('Itens foram trocados sem duplicação',
    players.get('244900000001').inventory.includes('poção de mana') &&
    players.get('5511999999999').inventory.includes('ferro') &&
    !players.get('5511999999999').inventory.includes('poção de mana'),
    JSON.stringify([...players.values()].map(p => p.inventory)));

  const second = await trade.criarOferta({
    sellerNumber: '244900000001', sellerName: 'Kito', sellerCountry: luanda.country.name,
    offerItem: 'poção de vida', wantedItem: 'cristal',
  });
  const cancelled = await trade.cancelarOferta({ sellerNumber: '244900000001', id: trade.codigo(second.trade) });
  test('Cancelar devolve o escrow ao dono', cancelled.ok && players.get('244900000001').inventory.includes('poção de vida'), cancelled.trade?.status);

  console.log('\n▸ C. Visual único por nível, classe e grupo-território; comandos no gate');
  const level8 = art.cardOptsFromPlayer({ whatsappNumber: '244900000001', name: 'Kito', level: 8, race: 'humano', class: 'guerreiro' }, { region: luanda.country });
  const level17 = art.cardOptsFromPlayer({ whatsappNumber: '244900000001', name: 'Kito', level: 17, race: 'humano', class: 'guerreiro' }, { region: brasil.country });
  test('Prompt do card inclui o grupo-território e tier de nível', /Reino Kwanza/.test(level8.backgroundPrompt) && /level tier 2/.test(level17.backgroundPrompt));
  test('Card muda cache/seed quando nível ou região muda', level8.backgroundCacheKey !== level17.backgroundCacheKey && level8.seed !== level17.seed);
  test('Gate reconhece regiões e mercado RPG',
    gate.RPG_CMDS.has('paises') && gate.RPG_CMDS.has('trocar') && gate.LIVRE_CHAR.has('pais'));

  console.log(`\n  ${ok} OK / ${fail} FALHOU\n`);
  process.exit(fail ? 1 : 0);
})();
