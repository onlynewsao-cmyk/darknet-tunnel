const mongoose = require('mongoose');

const GameSessionSchema = new mongoose.Schema({
  groupJid: { type: String, required: true, index: true },
  game: { type: String, required: true }, // forca, quiz, bingo, blackjack, etc
  active: { type: Boolean, default: true },
  startedBy: { type: String, default: '' },
  startedAt: { type: Date, default: Date.now },
  endedAt: { type: Date, default: null },

  // State genérico (depende do jogo)
  state: { type: mongoose.Schema.Types.Mixed, default: {} },

  // Players
  players: [{
    number: String,
    name: String,
    score: { type: Number, default: 0 },
    data: mongoose.Schema.Types.Mixed,
  }],

  bet: { type: Number, default: 0 },
  pot: { type: Number, default: 0 },
  winner: { type: String, default: '' },
}, { timestamps: true });

GameSessionSchema.index({ groupJid: 1, game: 1, active: 1 });

module.exports = mongoose.model('GameSession', GameSessionSchema);
