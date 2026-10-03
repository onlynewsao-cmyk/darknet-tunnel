'use strict';
/** Mercado internacional DARK RPG — escrow de itens entre regiões. */

const rpg = require('./engine');

function numero(value) {
  return String(value || '').replace(/\D/g, '');
}
function normalizar(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim().replace(/\s+/g, ' ');
}
function codigo(trade) {
  return String(trade?._id || '').slice(-6).toUpperCase();
}
function itemNoInventario(player, requested) {
  const wanted = normalizar(requested);
  return (player?.inventory || []).find(item => normalizar(item) === wanted) || null;
}
function tirarItem(player, item) {
  const index = (player?.inventory || []).findIndex(value => value === item);
  if (index < 0) return false;
  player.inventory.splice(index, 1);
  return true;
}
function linhaDaOferta(trade) {
  const origem = trade.sellerCountry ? ` · ${trade.sellerCountry}` : '';
  return `#${codigo(trade)} · ${trade.sellerName || 'Aventureiro'}${origem}\n` +
    `oferece *${trade.offerItem}* → procura *${trade.wantedItem}*`;
}

async function _tradeModel() {
  return require('../../database/models/RPGTrade');
}
async function _lean(query) {
  if (!query) return null;
  if (typeof query.lean === 'function') return query.lean();
  return query;
}

async function _findByCode(id, sellerNumber = null) {
  const text = String(id || '').trim();
  if (!text) return null;
  const Trade = await _tradeModel();
  // ID completo: consulta directa/indexada.
  if (/^[a-f0-9]{24}$/i.test(text)) {
    const q = { _id: text };
    if (sellerNumber) q.sellerNumber = numero(sellerNumber);
    return Trade.findOne(q);
  }
  // Código curto mostrado no chat: procura apenas ofertas abertas recentes.
  let query = Trade.find({ status: 'open', ...(sellerNumber ? { sellerNumber: numero(sellerNumber) } : {}) });
  if (query?.sort) query = query.sort({ createdAt: -1 }).limit(100);
  const trades = await _lean(query);
  return (Array.isArray(trades) ? trades : []).find(trade => codigo(trade).toLowerCase() === text.toLowerCase()) || null;
}

/** Cria oferta e põe o item do vendedor em escrow. */
async function criarOferta({ sellerNumber, sellerName, sellerCountry, offerItem, wantedItem }) {
  const offered = String(offerItem || '').trim().slice(0, 60);
  const wanted = String(wantedItem || '').trim().slice(0, 60);
  if (!offered || !wanted) return { ok: false, error: 'Uso: !trocar oferecer <teu item> por <item desejado>.' };
  if (normalizar(offered) === normalizar(wanted)) return { ok: false, error: 'Escolhe dois itens diferentes.' };

  const seller = await rpg.getPlayer(sellerNumber);
  const realOffer = itemNoInventario(seller, offered);
  if (!realOffer) return { ok: false, error: `Não tens *${offered}* no inventário.` };

  const Trade = await _tradeModel();
  try {
    const abertos = await Trade.countDocuments({ sellerNumber: numero(sellerNumber), status: 'open' });
    if (abertos >= 5) return { ok: false, error: 'Tens 5 ofertas abertas. Aceita ou cancela uma antes de abrir outra.' };
  } catch {}

  // Remove primeiro: se o servidor cair, o inventário jamais contém uma cópia
  // simultânea da oferta. Se a criação falhar, devolvemos abaixo.
  tirarItem(seller, realOffer);
  await rpg.savePlayer(seller);
  try {
    const trade = await Trade.create({
      sellerNumber: numero(sellerNumber),
      sellerName: String(sellerName || seller.name || 'Aventureiro').slice(0, 40),
      sellerCountry: String(sellerCountry || '').slice(0, 40),
      offerItem: realOffer,
      wantedItem: wanted,
    });
    return { ok: true, trade };
  } catch (e) {
    seller.inventory.push(realOffer);
    await rpg.savePlayer(seller);
    return { ok: false, error: 'Não consegui abrir a oferta: ' + (e.message || 'erro') };
  }
}

async function listarOfertas(limit = 10) {
  const Trade = await _tradeModel();
  let query = Trade.find({ status: 'open' });
  if (query?.sort) query = query.sort({ createdAt: -1 }).limit(Math.max(1, Math.min(20, limit)));
  const trades = await _lean(query);
  return Array.isArray(trades) ? trades : [];
}

async function minhasOfertas(sellerNumber, limit = 10) {
  const Trade = await _tradeModel();
  let query = Trade.find({ sellerNumber: numero(sellerNumber), status: 'open' });
  if (query?.sort) query = query.sort({ createdAt: -1 }).limit(Math.max(1, Math.min(20, limit)));
  const trades = await _lean(query);
  return Array.isArray(trades) ? trades : [];
}

/** Aceita uma oferta. O lock status=processing impede dupla aceitação. */
async function aceitarOferta({ buyerNumber, buyerName, id }) {
  const found = await _findByCode(id);
  if (!found) return { ok: false, error: 'Oferta não encontrada ou já foi encerrada.' };
  if (numero(found.sellerNumber) === numero(buyerNumber)) return { ok: false, error: 'Não podes aceitar a tua própria oferta.' };

  const Trade = await _tradeModel();
  const trade = await Trade.findOneAndUpdate(
    { _id: found._id, status: 'open' },
    { $set: { status: 'processing', buyerNumber: numero(buyerNumber), buyerName: String(buyerName || '').slice(0, 40) } },
    { new: true },
  );
  if (!trade) return { ok: false, error: 'Outra pessoa acabou de aceitar esta oferta.' };

  const buyer = await rpg.getPlayer(buyerNumber);
  const seller = await rpg.getPlayer(trade.sellerNumber);
  const wanted = itemNoInventario(buyer, trade.wantedItem);
  if (!wanted) {
    await Trade.updateOne({ _id: trade._id, status: 'processing' }, { $set: { status: 'open', buyerNumber: '', buyerName: '' } });
    return { ok: false, error: `Não tens *${trade.wantedItem}* no inventário para esta troca.` };
  }

  // A oferta já estava guardada no escrow. Só o item do comprador sai agora.
  tirarItem(buyer, wanted);
  seller.inventory.push(wanted);
  buyer.inventory.push(trade.offerItem);
  try {
    await Promise.all([rpg.savePlayer(seller), rpg.savePlayer(buyer)]);
    await Trade.updateOne(
      { _id: trade._id, status: 'processing' },
      { $set: { status: 'completed', completedAt: new Date() } },
    );
    return { ok: true, trade, buyer, seller, received: trade.offerItem, delivered: wanted };
  } catch (e) {
    // Melhor esforço de recuperação local; a oferta volta a abrir para não
    // ficar invisível caso a DB rejeite a gravação.
    tirarItem(seller, wanted);
    tirarItem(buyer, trade.offerItem);
    buyer.inventory.push(wanted);
    await Promise.allSettled([rpg.savePlayer(seller), rpg.savePlayer(buyer)]);
    await Trade.updateOne({ _id: trade._id }, { $set: { status: 'open', buyerNumber: '', buyerName: '' } });
    return { ok: false, error: 'A troca não foi concluída: ' + (e.message || 'erro') };
  }
}

/** Cancela oferta aberta e devolve o item que estava em escrow. */
async function cancelarOferta({ sellerNumber, id }) {
  const found = await _findByCode(id, sellerNumber);
  if (!found) return { ok: false, error: 'Não encontrei uma oferta tua aberta com esse código.' };
  const Trade = await _tradeModel();
  const trade = await Trade.findOneAndUpdate(
    { _id: found._id, status: 'open', sellerNumber: numero(sellerNumber) },
    { $set: { status: 'cancelled', cancelledAt: new Date() } },
    { new: true },
  );
  if (!trade) return { ok: false, error: 'A oferta já não está disponível para cancelar.' };
  const seller = await rpg.getPlayer(sellerNumber);
  seller.inventory.push(trade.offerItem);
  await rpg.savePlayer(seller);
  return { ok: true, trade };
}

module.exports = {
  codigo,
  linhaDaOferta,
  normalizar,
  itemNoInventario,
  criarOferta,
  listarOfertas,
  minhasOfertas,
  aceitarOferta,
  cancelarOferta,
};
