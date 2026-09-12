const mongoose = require('mongoose');

const LogSchema = new mongoose.Schema({
  type: { type: String, enum: ['command', 'message', 'event', 'error'], default: 'command' },
  command: { type: String, default: '' },
  user: { type: String, default: '' },
  number: { type: String, default: '' },
  group: { type: String, default: '' },
  groupJid: { type: String, default: '' },
  content: { type: String, default: '' },
  success: { type: Boolean, default: true },
}, { timestamps: true });

LogSchema.index({ createdAt: -1 });
LogSchema.index({ command: 1 });
LogSchema.index({ number: 1 });

module.exports = mongoose.model('Log', LogSchema);
