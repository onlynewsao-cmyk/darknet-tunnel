const mongoose = require('mongoose');

const GroupMemberActivitySchema = new mongoose.Schema({
  groupJid: { type: String, required: true, index: true },
  memberJid: { type: String, required: true, index: true },
  memberNumber: { type: String, default: '', index: true },
  pushName: { type: String, default: '' },
  messages: { type: Number, default: 0 },
  commands: { type: Number, default: 0 },
  warnings: { type: Number, default: 0 },
  muted: { type: Boolean, default: false },
  lastMessageAt: { type: Date, default: Date.now, index: true },
  lastCommandAt: { type: Date, default: null },
  lastWarnedInactiveAt: { type: Date, default: null },
  lastBannedInactiveAt: { type: Date, default: null },
}, { timestamps: true });

GroupMemberActivitySchema.index({ groupJid: 1, memberJid: 1 }, { unique: true });
GroupMemberActivitySchema.index({ groupJid: 1, lastMessageAt: 1 });

module.exports = mongoose.model('GroupMemberActivity', GroupMemberActivitySchema);
