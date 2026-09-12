const mongoose = require('mongoose');

const RPGPlayerSchema = new mongoose.Schema({
  whatsappNumber: { type: String, required: true, unique: true, index: true },

  // Identidade
  name:      { type: String, default: 'Aventureiro' },
  character: { type: String, default: null },  // naruto, luffy, gojo, etc.
  universe:  { type: String, default: null },  // naruto, onepiece, etc.
  title:     { type: String, default: '' },

  // ── v6.87: raça e classe ────────────────────────────────────
  // O !rpgstart e a ficha (.rg) liam p.race/p.class desde sempre, mas
  // estes campos NÃO existiam no schema — com o `strict: true` do
  // Mongoose a atribuição era ignorada em silêncio e NENHUM jogador
  // chegou a ter raça ou classe guardada (a ficha caía sempre no
  // fallback "humano guerreiro"). Sem isto o gerador por selecção não
  // tem onde guardar a escolha.
  race:      { type: String, default: 'humano' },
  class:     { type: String, default: 'guerreiro' },
  // O bónus da raça aplica-se UMA vez, na criação — sem esta marca,
  // cada !rpgstart somava outra vez os mesmos pontos aos stats.
  raceBonusApplied: { type: Boolean, default: false },
  faction:   { type: String, default: null },
  guild:     { type: String, default: null },

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

  // ── v6.90: MUNDO ────────────────────────────────────────────
  // O que o jogador já viu do mapa. Sem isto o !world era uma lista
  // estática de biomas — igual para quem acabou de começar e para quem
  // já tinha andado por todo o lado.
  world: {
    visited:     [{ type: String }],          // biomas já percorridos
    discoveries: { type: Number, default: 0 }, // 1ª visita a cada bioma
    lastTravel:  { type: Date, default: null },
    bossDefeated: [{ type: String }],         // bosses de mundo abatidos
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
