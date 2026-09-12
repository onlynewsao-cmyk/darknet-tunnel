const mongoose = require('mongoose');

const EconomySchema = new mongoose.Schema({
  whatsappNumber: { type: String, required: true, unique: true, index: true },
  name: { type: String, default: '' },
  nickname: { type: String, default: '' }, // apelido carinhoso/nomeado

  coins: { type: Number, default: 100 },      // dinheiro
  bank: { type: Number, default: 0 },          // banco (não rouba)
  xp: { type: Number, default: 0 },
  level: { type: Number, default: 1 },
  aura: { type: Number, default: 0 },
  reputation: { type: Number, default: 0 },
  businessTier: { type: String, default: 'iniciante' },

  // Status do bot RPG-style
  hp: { type: Number, default: 100 },
  maxHp: { type: Number, default: 100 },

  // Cooldowns
  lastWork: { type: Date, default: null },
  lastDaily: { type: Date, default: null },
  lastRob: { type: Date, default: null },
  lastCrime: { type: Date, default: null },
  lastBeg: { type: Date, default: null },
  lastHunt: { type: Date, default: null },

  // Stats
  wins: { type: Number, default: 0 },
  losses: { type: Number, default: 0 },
  totalEarned: { type: Number, default: 0 },
  totalSpent: { type: Number, default: 0 },

  // Inventário
  inventory: [{
    item: String,
    quantity: { type: Number, default: 1 },
    acquiredAt: { type: Date, default: Date.now },
  }],

  // Relacionamentos
  spouseNumber: { type: String, default: '' },
  marriedAt: { type: Date, default: null },
  children: [{ type: String }], // números dos "filhos"
  parents: [{ type: String }],  // números dos "pais"

  badges: [{ type: String }],
}, { timestamps: true });

// Helpers
EconomySchema.methods.addXp = function(amount) {
  this.xp += amount;
  while (this.xp >= this.level * 100) {
    this.xp -= this.level * 100;
    this.level++;
    this.aura = (this.aura || 0) + 100;
    this.maxHp += 10;
    this.hp = this.maxHp;
  }
};

EconomySchema.statics.getOrCreate = async function(number, name = '') {
  let u = await this.findOne({ whatsappNumber: number });
  if (!u) u = await this.create({ whatsappNumber: number, name });
  else if (name && !u.name) { u.name = name; await u.save(); }
  return u;
};

module.exports = mongoose.model('Economy', EconomySchema);
