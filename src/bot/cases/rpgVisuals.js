'use strict';
/** Cenas, cards e animação locais do DARK RPG. */

const rpg = require('../rpg/engine');
const regions = require('../rpg/regions');
const visuals = require('../rpg/visuals');

async function tReply(sock, msg, ctx, title, lines) {
  return require('../rpg/rpgTheme').rpgReply(sock, msg, ctx, title, lines);
}

async function regionOf(ctx) {
  if (!ctx.isGroup) return null;
  try { return await regions.getCountryForGroup(ctx.remoteJid); } catch { return null; }
}

module.exports = function registerRPGVisuals(registerCase) {
  // Galeria utiliza o mesmo carrossel nativo que raça/Pinterest, mas as três
  // pinturas são assets locais (sem pesquisa, latência ou dependência externa).
  registerCase(['cenariosrpg', 'cenáriosrpg', 'galeriarpg', 'rpgcenarios', 'rpgcenas'], async ({ sock, msg, ctx, prefix }) => {
    const p = prefix || ctx.prefix || '!';
    const sent = await visuals.sendGallery(sock, msg, ctx, p).catch(() => false);
    if (sent) return;
    return tReply(sock, msg, ctx, '🖼️ CENÁRIOS DO DARK RPG', [
      '⚔️ *Arena das Sombras* — a cena de cada batalha.',
      '💱 *Mercado Internacional* — trocas entre regiões.',
      '🌍 *Portais Regionais* — viagens pelo mundo DARK VILLE.',
      '',
      `Usa *${p}lutar*, *${p}trocar ofertas* ou *${p}paises* para entrar em cada cenário.`,
    ]);
  }, true);

  // Arte estática, 100% local e rápida. Útil quando o jogador quer guardar o
  // retrato sem aguardar um vídeo ou uma imagem remota.
  registerCase(['rpgcard', 'herocard', 'cartaoheroi', 'cardrpg'], async ({ sock, msg, ctx, prefix }) => {
    const player = await rpg.getPlayer(ctx.senderNumber);
    const region = await regionOf(ctx);
    try {
      const art = require('../welcomeArt');
      const card = await art.heroCard(player, {
        profilePicUrl: null,
        region,
        jid: ctx.remoteJid,
        botName: 'DARK BOT',
        fetchFn: async () => null,
      });
      await sock.sendMessage(ctx.remoteJid, {
        image: card,
        caption: `🪶 *${player.name}* — card do herói\n> Nível ${player.level || 1} · ${region ? region.flag + ' ' + region.city : 'DARK VILLE internacional'}`,
      }, { quoted: msg });
    } catch {
      return tReply(sock, msg, ctx, '🪶 CARD DO HERÓI', [
        `*${player.name}* · Nv.${player.level || 1}`,
        'A arte está indisponível neste host neste momento, mas a tua aventura continua.',
        `Tenta novamente: *${prefix || ctx.prefix || '!'}rpgcard*.`,
      ]);
    }
  }, true);

  // Primeiro tenta MP4 em reprodução GIF. Em hosts sem ffmpeg, a função envia
  // sem atraso um card PNG válido — nunca falha a experiência do jogador.
  registerCase(['rpggif', 'herogif', 'gifrpg', 'animarrpg'], async ({ sock, msg, ctx, prefix }) => {
    const player = await rpg.getPlayer(ctx.senderNumber);
    const region = await regionOf(ctx);
    try {
      await visuals.sendHeroAnimation(sock, msg, ctx, player, { region, prefix: prefix || ctx.prefix || '!' });
    } catch {
      return tReply(sock, msg, ctx, '🎞️ ANIMAÇÃO RPG', [
        'Não consegui preparar a animação agora.',
        `Usa *${prefix || ctx.prefix || '!'}rpgcard* para receber o teu card sem esperar.`,
      ]);
    }
  }, true);
};
