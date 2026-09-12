const mongoose = require('mongoose');

const MediaSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    type: { type: String, enum: ['image', 'video', 'gif', 'audio'], required: true },
    mediaMode: { type: String, enum: ['normal', 'circle'], default: 'normal' }, // vídeo normal ou vídeo circular/PTV
    url: { type: String, required: true }, // Cloudinary URL
    publicId: { type: String, required: true }, // para deletar do Cloudinary
    size: { type: Number, default: 0 },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    tags: [{ type: String }],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Media', MediaSchema);
