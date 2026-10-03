'use strict';

const mongoose = require('mongoose');

/**
 * Oferta internacional de itens RPG.
 * O item oferecido sai do inventário no momento da criação e fica em
 * escrow no documento. Assim a mesma espada/poção não pode ser vendida
 * duas vezes enquanto a oferta estiver aberta.
 */
const RPGTradeSchema = new mongoose.Schema({
  sellerNumber: { type: String, required: true, index: true },
  sellerName:   { type: String, default: 'Aventureiro' },
  sellerCountry:{ type: String, default: '' },
  offerItem:    { type: String, required: true },
  wantedItem:   { type: String, required: true },
  status: {
    type: String,
    enum: ['open', 'processing', 'completed', 'cancelled'],
    default: 'open',
    index: true,
  },
  buyerNumber:  { type: String, default: '' },
  buyerName:    { type: String, default: '' },
  completedAt:  { type: Date, default: null },
  cancelledAt:  { type: Date, default: null },
}, { timestamps: true });

RPGTradeSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.models.RPGTrade || mongoose.model('RPGTrade', RPGTradeSchema);
