const mongoose = require('mongoose');

// Para o anti-delete (trapaça do dono)
const DeletedMessageSchema = new mongoose.Schema({
  groupJid: { type: String, index: true },
  fromJid: { type: String },
  fromNumber: { type: String },
  fromName: { type: String },
  messageId: { type: String, unique: true },
  text: { type: String, default: '' },
  mediaType: { type: String, default: '' },
  mediaUrl: { type: String, default: '' },
  timestamp: { type: Date, default: Date.now },
  deletedAt: { type: Date, default: null },
  raw: { type: mongoose.Schema.Types.Mixed },
}, { timestamps: true });

DeletedMessageSchema.index({ createdAt: -1 });
// Auto-delete após 7 dias
DeletedMessageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7 * 86400 });

module.exports = mongoose.model('DeletedMessage', DeletedMessageSchema);
