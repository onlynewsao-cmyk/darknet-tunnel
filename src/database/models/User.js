const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true, lowercase: true },
    password: { type: String, required: true },
    name: { type: String, default: '' },
    // v6.45: índice OBRIGATÓRIO — esta é a query mais executada do bot
    // (User.findOne({whatsappNumber}) corre em praticamente todas as
    // mensagens). Sem índice, o MongoDB fazia COLLSCAN: varria a
    // colecção inteira de cada vez, e o custo cresce com o nº de users.
    whatsappNumber: { type: String, default: '', index: true }, // ex: 244XXXXXXXXX
    role: { type: String, enum: ['owner', 'premium', 'free'], default: 'free' },
    gender: { type: String, enum: ['male', 'female', 'other', 'unknown'], default: 'unknown' },
    lastGenderChangeAt: { type: Date, default: null },
    active: { type: Boolean, default: true },
    premiumUntil: { type: Date, default: null },
    commandsUsed: { type: Number, default: 0 },
    lastLogin: { type: Date, default: null },
    lastSeenAt: { type: Date, default: null },
    autoCreated: { type: Boolean, default: false },

    // Limite de uso PV (free)
    pvCommandsToday:  { type: Number, default: 0 },
    pvCommandsDate:   { type: String, default: '' },

    // Plano VIP — número de grupos que pode adicionar com aluguel
    vipGroupLimit:    { type: Number, default: 0 },  // 0=não pode, >0 = max grupos
    vipGroupsAdded:   { type: Number, default: 0 },  // quantos grupos já adicionou

    // Tom da IA para este utilizador (definido pelo dono)
    aiTone: { type: String, default: '' },  // ex: 'formal', 'casual', 'engraçado', 'sério'

    // Memória da IA (ref ao AiMemory)
    aiMemoryId: { type: String, default: '' },
  },
  { timestamps: true }
);

UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

UserSchema.methods.comparePassword = function (plain) {
  return bcrypt.compare(plain, this.password);
};

UserSchema.methods.isPremium = function () {
  if (this.role === 'owner') return true;
  if (this.role !== 'premium') return false;
  if (!this.premiumUntil) return true;
  return new Date(this.premiumUntil) > new Date();
};

module.exports = mongoose.model('User', UserSchema);
