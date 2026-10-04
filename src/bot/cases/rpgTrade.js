'use strict';
/** Mercado internacional de DARK VILLE — trocas de itens em escrow. */

const trade = require('../rpg/trade');
const regions = require('../rpg/regions');
const visuals = require('../rpg/visuals');

async function tReply(sock, msg, ctx, title, lines) {
  return require('../rpg/rpgTheme').rpgReply(sock, msg, ctx, title, lines);
}

// A cena é local, em cache e opcional: qualquer falha de media mantém o
// mercado textual funcional. Enviamos apenas nas portas principais do fluxo.
async function marketReply(sock, msg, ctx, title, lines) {
  const sent = await tReply(sock, msg, ctx, title, lines);
  await visuals.sendScene(sock, msg, ctx, 'market').catch(() => {});
  return sent;
}

function separarOferta(args) {
  const words = Array.isArray(args) ? args : [];
  const pos = words.findIndex(word => /^por$/i.test(String(word)));
  if (pos <= 1 || pos === words.length - 1) return null;
  return {
    offerItem: words.slice(1, pos).join(' ').trim(),
    wantedItem: words.slice(pos + 1).join(' ').trim(),
  };
}

module.exports = function registerRPGTrade(registerCase) {
  registerCase(['trocar', 'trade', 'troca', 'mercadorpg'], async ({ sock, msg, ctx, args, prefix }) => {
    const p = prefix || '!';
    const sub = String(args[0] || '').toLowerCase();

    if (!sub || sub === 'ajuda' || sub === 'help') {
      return marketReply(sock, msg, ctx, '💱 MERCADO INTERNACIONAL', [
        'DARK VILLE liga todas as cidades e países do RPG.',
        '',
        `• *${p}trocar ofertas* — ver ofertas abertas`,
        `• *${p}trocar oferecer <item> por <item>* — pôr um item no mercado`,
        `• *${p}trocar aceitar <código>* — fechar uma troca`,
        `• *${p}trocar minhas* — ver as tuas ofertas`,
        `• *${p}trocar cancelar <código>* — recuperar item em escrow`,
        '',
        'Exemplo: *!trocar oferecer ferro por poção de vida*',
        '⚠️ Quando crias a oferta, o teu item fica protegido no mercado até aceitar/cancelar.',
      ]);
    }

    if (['ofertas', 'lista', 'list', 'mercado'].includes(sub)) {
      const offers = await trade.listarOfertas(10);
      if (!offers.length) return marketReply(sock, msg, ctx, '💱 MERCADO INTERNACIONAL', [
        'Não há ofertas abertas agora.',
        `Sê o primeiro: *${p}trocar oferecer <item> por <item>*`,
      ]);
      return marketReply(sock, msg, ctx, '💱 OFERTAS INTERNACIONAIS', [
        ...offers.flatMap(offer => [trade.linhaDaOferta(offer), '']),
        `Aceita: *${p}trocar aceitar <código>*`,
      ]);
    }

    if (['oferecer', 'oferta', 'listar', 'criar'].includes(sub)) {
      const parsed = separarOferta(args);
      if (!parsed) return tReply(sock, msg, ctx, '💱 NOVA OFERTA', [
        `Uso: *${p}trocar oferecer <teu item> por <item desejado>*`,
        `Ex.: *${p}trocar oferecer ferro por poção de vida*`,
        'Vê os teus itens com *!inventario*.',
      ]);
      const country = ctx.isGroup ? await regions.getCountryForGroup(ctx.remoteJid, ctx.groupName) : null;
      const result = await trade.criarOferta({
        sellerNumber: ctx.senderNumber,
        sellerName: ctx.pushName,
        sellerCountry: country?.name || '',
        ...parsed,
      });
      if (!result.ok) return tReply(sock, msg, ctx, '⚠️ MERCADO', [result.error]);
      return tReply(sock, msg, ctx, '💱 OFERTA ABERTA', [
        trade.linhaDaOferta(result.trade),
        '',
        '🔒 O item oferecido ficou em escrow: não será duplicado nem usado por acidente.',
        `🌐 Jogadores de todas as regiões podem aceitar com *${p}trocar aceitar ${trade.codigo(result.trade)}*.`,
      ]);
    }

    if (['aceitar', 'accept'].includes(sub)) {
      const result = await trade.aceitarOferta({
        buyerNumber: ctx.senderNumber,
        buyerName: ctx.pushName,
        id: args[1],
      });
      if (!result.ok) return tReply(sock, msg, ctx, '⚠️ TROCA', [result.error]);
      return tReply(sock, msg, ctx, '✅ TROCA CONCLUÍDA', [
        `Recebeste: *${result.received}*`,
        `Entregaste: *${result.delivered}*`,
        `🤝 Troca internacional com *${result.seller.name || result.trade.sellerName}*.`,
      ]);
    }

    if (['minhas', 'meus', 'minha'].includes(sub)) {
      const offers = await trade.minhasOfertas(ctx.senderNumber, 10);
      if (!offers.length) return tReply(sock, msg, ctx, '💱 AS TUAS OFERTAS', [
        'Não tens ofertas abertas.',
        `Cria uma com *${p}trocar oferecer <item> por <item>*.`,
      ]);
      return tReply(sock, msg, ctx, '💱 AS TUAS OFERTAS', [
        ...offers.flatMap(offer => [trade.linhaDaOferta(offer), '']),
        `Para recuperar um item: *${p}trocar cancelar <código>*`,
      ]);
    }

    if (['cancelar', 'cancel'].includes(sub)) {
      const result = await trade.cancelarOferta({ sellerNumber: ctx.senderNumber, id: args[1] });
      if (!result.ok) return tReply(sock, msg, ctx, '⚠️ TROCA', [result.error]);
      return tReply(sock, msg, ctx, '↩️ OFERTA CANCELADA', [
        `*${result.trade.offerItem}* voltou para o teu inventário.`,
      ]);
    }

    return tReply(sock, msg, ctx, '💱 MERCADO', [
      'Não reconheci essa ação.',
      `Usa *${p}trocar ajuda* para ver o mercado internacional.`,
    ]);
  }, true);
};
