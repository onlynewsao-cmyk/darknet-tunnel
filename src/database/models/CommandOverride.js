/**
 * Permite sobrescrever propriedades de comandos NATIVOS via dashboard
 * (sem alterar o código fonte)
 */
const mongoose = require('mongoose');

const CommandOverrideSchema = new mongoose.Schema({
  commandName: { type: String, required: true, unique: true, index: true },

  // Sobrescritas
  displayName: { type: String, default: '' },     // Nome customizado no menu
  description: { type: String, default: '' },
  category: { type: String, default: '' },
  emoji: { type: String, default: '' },

  enabled: { type: Boolean, default: true },
  accessLevel: { type: String, enum: ['all', 'premium', 'owner'], default: 'all' },

  // Mídias anexadas (Cloudinary URLs)
  mediaUrl: { type: String, default: '' },
  mediaType: { type: String, enum: ['', 'image', 'video', 'gif', 'audio'], default: '' },

  // Aliases adicionais
  aliases: [{ type: String, lowercase: true }],

  // Resposta customizada (opcional — sobrescreve a resposta padrão)
  customResponse: { type: String, default: '' },
  useCustomResponse: { type: Boolean, default: false },

  // Ordem no menu (drag-and-drop)
  order: { type: Number, default: 0 },

  // Stats
  usageCount: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('CommandOverride', CommandOverrideSchema);
