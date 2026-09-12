const mongoose = require('mongoose');

const PaymentSchema = new mongoose.Schema({
  user:            { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  username:        { type: String, default: '' },
  whatsappNumber:  { type: String, default: '' },
  amount:          { type: Number, default: 0 },          // em Kz — não required
  currency:        { type: String, default: 'AOA' },
  method:          { type: String, default: 'multicaixa' },
  plan:            { type: String, default: '1mes' },      // sem enum para aceitar qualquer string
  receipt:         { type: String, default: '' },         // URL do comprovante (Cloudinary)
  reference:       { type: String, default: '' },
  status:          { type: String, enum: ['pendente', 'aprovado', 'rejeitado'], default: 'pendente' },
  notes:           { type: String, default: '' },
  approvedAt:      { type: Date, default: null },
  approvedBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = mongoose.model('Payment', PaymentSchema);
