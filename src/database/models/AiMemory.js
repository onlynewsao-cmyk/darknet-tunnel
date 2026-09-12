/**
 * DARK BOT — AiMemory
 * Armazena memória de conversação por utilizador.
 * A IA recorda conversas anteriores, preferências e contexto.
 * Reset automático a cada 7 dias (configurável).
 */
const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  role:    { type: String, enum: ['user', 'assistant'], required: true },
  content: { type: String, required: true, maxlength: 2000 },
  ts:      { type: Date, default: Date.now },
}, { _id: false });

const AiMemorySchema = new mongoose.Schema({
  // Identificador único: para grupos = groupJid, para PV = número do utilizador
  // Formato: "GROUP:120363XXX@g.us" ou "PV:244XXXXXXXXX"
  contextId: { type: String, required: true, index: true },

  // Número do utilizador (para PV e para memória individual em grupo)
  userNumber: { type: String, default: '', index: true },

  // Histórico de mensagens (últimas 40 por defeito)
  history: { type: [MessageSchema], default: [] },

  // Perfil aprendido sobre o utilizador
  profile: {
    name:      { type: String, default: '' },
    interests: [{ type: String }],    // ex: ['música', 'tecnologia', 'Angola']
    gender:    { type: String, default: '' },
    tone:      { type: String, default: '' },  // tom preferido detectado
    notes:     { type: String, default: '' },  // notas importantes memoradas
  },

  // Metadados
  lastInteraction: { type: Date, default: Date.now },
  resetAt:         { type: Date, default: null },
  totalMessages:   { type: Number, default: 0 },

}, { timestamps: true });

// Índice TTL — limpa automaticamente entradas com mais de 7 dias sem interacção
AiMemorySchema.index({ lastInteraction: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

// Métodos de instância
AiMemorySchema.methods.addMessage = function (role, content) {
  const MAX = 40;
  this.history.push({ role, content: String(content || '').slice(0, 2000), ts: new Date() });
  if (this.history.length > MAX) this.history = this.history.slice(-MAX);
  this.lastInteraction = new Date();
  this.totalMessages = (this.totalMessages || 0) + 1;
};

AiMemorySchema.methods.getContextWindow = function (maxMessages = 12) {
  return this.history.slice(-maxMessages);
};

AiMemorySchema.methods.resetHistory = function () {
  this.history = [];
  this.resetAt = new Date();
};

// getOrCreate por contextId (grupo ou PV)
// Para grupos: contextId = "GROUP:" + groupJid
// Para PV:     contextId = "PV:" + userNumber
AiMemorySchema.statics.getOrCreate = async function (userNumber, groupJid = null) {
  const contextId = groupJid ? `GROUP:${groupJid}` : `PV:${userNumber}`;
  let mem = await this.findOne({ contextId });
  if (!mem) mem = await this.create({ contextId, userNumber });
  else if (!mem.userNumber && userNumber) {
    mem.userNumber = userNumber;
    await mem.save().catch(() => {});
  }
  return mem;
};

module.exports = mongoose.model('AiMemory', AiMemorySchema);
