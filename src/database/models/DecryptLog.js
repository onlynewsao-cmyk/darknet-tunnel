const mongoose = require('mongoose');

const DecryptLogSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  username: { type: String, default: '' },
  whatsappNumber: { type: String, default: '' },
  fileName: { type: String, default: '' },
  format: { type: String, default: '' }, // ehi, hat, npv4, etc
  success: { type: Boolean, default: true },
  source: { type: String, enum: ['dashboard', 'whatsapp'], default: 'dashboard' },
  extracted: { type: mongoose.Schema.Types.Mixed }, // dados extraídos
  error: { type: String, default: '' },
}, { timestamps: true });

DecryptLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('DecryptLog', DecryptLogSchema);
