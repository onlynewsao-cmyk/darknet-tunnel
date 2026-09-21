const mongoose = require('mongoose');

const RPGPlayerSchema = new mongoose.Schema({
  whatsappNumber: { type: String, required: true, unique: true, index: true },

  // Identidade
  name:      { type: String, default: 'Aventureiro' },
  character: { type: String, default: null },  // naruto, luffy, gojo, etc.
  universe:  { type: String, default: null },  // naruto, onepiece, etc.
  title:     { type: String, default: '' },

  // ── v6.87: raça e classe ────────────────────────────────────
  race:      { type: String, default: 'humano' },
  class:     { type: String, default: 'guerreiro' },
  raceBonusApplied: { type: Boolean, default: false },
  started:    { type: Boolean, default: false },
  faction:   { type: String, default: null },
  guild:     { type: String, default: null },

  // ── v9.23: Criação expandida (género, idade, bio, aparência) ──
  gender:    { type: String, default: null },  // masculino, feminino, outro
  age:       { type: Number, default: null },
  bio:       { type: String, default: '' },    // backstory do personagem
  appearance:{ type: String, default: '' },    // descrição física

  // Nível e XP
  level:  { type: Number, default: 1 },
  xp:     { type: Number, default: 0 },
  xpNext: { type: Number, default: 100 },

  // Vida e Mana
  hp:    { type: Number, default: 150 },
  maxHp: { type: Number, default: 150 },
  mp:    { type: Number, default: 80 },
  maxMp: { type: Number, default: 80 },
  lives: { type: Number, default: 3 },

  // Stats
  stats: {
    str: { type: Number, default: 6 },
    dex: { type: Number, default: 6 },
    int: { type: Number, default: 6 },
    vit: { type: Number, default: 6 },
    luk: { type: Number, default: 6 },
  },

  // ── v9.23: Pontos de stats livres (point-buy) ──
  statPoints: { type: Number, default: 0 },

  // Economia
  coins: { type: Number, default: 100 },
  bank:  { type: Number, default: 0 },

  // Inventário
  inventory: [{ type: String }],

  // Equipamento
  equipment: {
    weapon:    { type: String, default: null },
    armor:     { type: String, default: null },
    accessory: { type: String, default: null },
  },

  // Quest
  quest: {
    current:   { type: String, default: null },
    step:      { type: Number, default: 0 },
    completed: [{ type: String }],
  },

  // Mundo
  world: {
    visited:     [{ type: String }],
    discoveries: { type: Number, default: 0 },
    lastTravel:  { type: Date, default: null },
    bossDefeated: [{ type: String }],
  },

  // Skills desbloqueadas
  skills: [{ type: String }],

  // Transformações desbloqueadas
  transforms: [{ type: String }],

  // Estatísticas
  kills:      { type: Number, default: 0 },
  deaths:     { type: Number, default: 0 },
  bossKills:  { type: Number, default: 0 },
  streak:     { type: Number, default: 0 },
  bestStreak: { type: Number, default: 0 },
  karma:      { type: Number, default: 0 },
  reputation: { type: Number, default: 0 },

  // v7.47
  prestige:       { type: Number, default: 0 },
  winStreak:      { type: Number, default: 0 },
  craftingLevel:  { type: Number, default: 1 },
  recipesKnown:   [{ type: String }],

  // Story Mode Progress (v11.0)
  storyProgress: { type: mongoose.Schema.Types.Mixed, default: {} },
  _testState:    { type: mongoose.Schema.Types.Mixed, default: {} },

  // v11.1: Estratégia de combate activa
  // (agressiva | defensiva | equilibrada | evasiva | sorrateira)
  strategy: { type: String, default: 'equilibrada' },

  // Cooldowns
  lastDaily:   { type: Date, default: null },
  lastWork:    { type: Date, default: null },
  lastBattle:  { type: Date, default: null },
  lastExplore: { type: Date, default: null },
  lastQuest:   { type: Date, default: null },

}, { timestamps: true });

RPGPlayerSchema.statics.getOrCreate = async function(number, name = 'Aventureiro', character = null) {
  let p = await this.findOne({ whatsappNumber: number });
  if (p) return p;

  // Stats padrão
  const base = { str:6, dex:6, int:6, vit:6, luk:6 };

  p = await this.create({
    whatsappNumber: number,
    name,
    character,
    hp: 150, maxHp: 150,
    mp: 80, maxMp: 80,
    stats: base,
    inventory: ['poção de vida', 'poção de vida'],
  });
  return p;
};

module.exports = mongoose.model('RPGPlayer', RPGPlayerSchema);
