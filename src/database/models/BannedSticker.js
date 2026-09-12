/**
 * DARK BOT v6.87 — STICKER BANIDO POR APRENDIZAGEM 🕸️
 *
 * O admin responde a uma figurinha com !bansticker e o bot APRENDE-a:
 * guarda a identidade dessa figurinha e passa a apagá-la sempre que
 * alguém a voltar a mandar naquele grupo.
 *
 * ── PORQUE É QUE ISTO NÃO CUSTA NADA ──────────────────────────
 * A identidade NÃO é a imagem — é o `fileSha256` que o WhatsApp já
 * traz na metadata do `stickerMessage`. Ou seja:
 *   • zero downloads (não se baixa a figurinha para a comparar)
 *   • zero CPU (não há hashing de bytes nossos)
 *   • zero falsos positivos por compressão (é o hash do próprio WA)
 * O mesmo sticker reenviado por outra pessoa tem o MESMO fileSha256,
 * porque o WhatsApp não re-codifica o ficheiro no reenvio.
 *
 * `hashEnc` (fileEncSha256) fica guardado como segunda chave porque
 * em mensagens antigas/encaminhadas um dos dois pode vir vazio.
 */
const mongoose = require('mongoose');

const BannedStickerSchema = new mongoose.Schema({
  groupJid: { type: String, required: true, index: true },

  // Identidade da figurinha (base64, tal como vem do WhatsApp)
  hash:    { type: String, required: true },
  hashEnc: { type: String, default: '' },

  animated: { type: Boolean, default: false },

  // Quem ensinou
  addedBy:     { type: String, default: '' },   // número
  addedByName: { type: String, default: '' },   // pushName
  reason:      { type: String, default: '' },

  // Estatística de acertos (quantas vezes a apanhou)
  hits:      { type: Number, default: 0 },
  lastHitAt: { type: Date, default: null },

  createdAt: { type: Date, default: Date.now },
});

// A mesma figurinha só pode estar aprendida uma vez por grupo
BannedStickerSchema.index({ groupJid: 1, hash: 1 }, { unique: true });

module.exports = mongoose.model('BannedSticker', BannedStickerSchema);
