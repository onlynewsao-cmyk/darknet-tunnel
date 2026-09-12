const mongoose = require('mongoose');

/**
 * Modelo exclusivo para persistir a conexão do WhatsApp (Baileys).
 * Coleção separada para evitar conflito com sessões web.
 */
const WhatsappSessionSchema = new mongoose.Schema({
  fileName: { type: String, required: true, unique: true },
  content: { type: String, required: true },
}, { 
  timestamps: true, 
  collection: 'whatsapp_sessions' // Nome físico da tabela no MongoDB
});

module.exports = mongoose.model('WhatsappSession', WhatsappSessionSchema);
