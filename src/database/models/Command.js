const mongoose = require('mongoose');

const CommandSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true, lowercase: true },
    aliases: [{ type: String, lowercase: true, index: true }],  // v6.45: usado em findOne($or)
    category: { type: String, default: 'geral' },
    description: { type: String, default: '' },
    response: { type: String, default: '' }, // texto da resposta (suporta variáveis: {user}, {bot}, {owner}, {group})
    mediaUrl: { type: String, default: '' }, // URL Cloudinary (imagem, vídeo, gif)
    mediaType: { type: String, enum: ['', 'image', 'video', 'gif', 'audio', 'sticker'], default: '' },
    accessLevel: { type: String, enum: ['all', 'premium', 'owner'], default: 'all' },
    enabled: { type: Boolean, default: true },
    isSubmenu: { type: Boolean, default: false },
    parentCommand: { type: String, default: '' },
    usageCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// v6.45: a resolução de comandos faz findOne({$or:[{name},{aliases}]})
// em cada comando executado — 'enabled' entra no filtro, por isso
// um índice composto evita ler documentos desactivados.
CommandSchema.index({ enabled: 1, name: 1 });

module.exports = mongoose.model('Command', CommandSchema);
