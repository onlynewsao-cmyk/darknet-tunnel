const mongoose = require('mongoose');

const AntiStatusSchema = new mongoose.Schema({
  groupJid: { type: String, required: true, unique: true },
  enabled: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('AntiStatus', AntiStatusSchema);
