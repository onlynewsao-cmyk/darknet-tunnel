/**
 * v12.9.36 — CONTACTO DA CENTRAL (escala 1M+)
 * A base de contactos passa a persistir em MONGODB por documento
 * (bulkWrite em lotes dos alterados) — o JSON gigante morria:
 * JSON.stringify de 1M contactos ≈ 500MB em string (limite do Node).
 * O Mongo aguenta milhões/milhões com índice único no número.
 */
'use strict';
const mongoose = require('mongoose');

const CentralContactoSchema = new mongoose.Schema(
  {
    num: { type: String, required: true, unique: true, index: true }, // só dígitos
    nome: { type: String, default: '' },
    jid: { type: String, default: '' },
    grupos: { type: Object, default: {} },   // jid → nome
    slots: { type: Object, default: {} },    // slot → ts da última captura
    ddi: { type: String, default: '?' },
    pais: { type: String, default: 'Desconhecido' },
    ddd: { type: String, default: '-' },
    addedAt: { type: Number, default: 0 },
    ts: { type: Number, default: 0 },
  },
  { timestamps: true, collection: 'central_contactos', minimize: false }
);

module.exports = mongoose.models.CentralContacto || mongoose.model('CentralContacto', CentralContactoSchema);
