/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║  DARK BOT v6.90 — MUNDO DO RPG 🌍                             ║
 * ╚═══════════════════════════════════════════════════════════════╝
 *
 *   !world / !mapa / !biomas   — o mapa, com o que já viste e o que falta
 *   !viajar <sítio>            — desloca-te; a 1ª visita dá XP e há encontro
 *   !mundial                   — ranking mundial de todos os jogadores
 *
 * A lógica vive em src/bot/rpg/world.js (testável sem WhatsApp).
 */
'use strict';

const config = require('../../config');
const world = require('../rpg/world');

async function tReply(sock, msg, ctx, title, lines) {
  const RE = require('../renderEngine');
  const t = await RE.getTheme(ctx.remoteJid).catch(() => null);
  const corpo = t
    ? RE.renderBlock(t, title, lines, { botName: config.bot.name })
    : `*${title}*\n\n${(lines || []).join('\n')}`;
  return sock.sendMessage(ctx.remoteJid, { text: corpo }, { quoted: msg });
}

module.exports = function registerRPGWorld(registerCase) {

  // ═══ O MAPA ═══
  registerCase(['world', 'mapa', 'biomas', 'mundomap'], async ({ sock, msg, ctx }) => {
    const rpg = require('../rpg/engine');
    const p = await rpg.getPlayer(ctx.senderNumber);
    const linhas = world.mapa(p);
    await rpg.savePlayer(p);
    return tReply(sock, msg, ctx, '🌍 MAPA DO MUNDO', linhas);
  }, true);

  // ═══ VIAJAR ═══
  registerCase(['viajar', 'travel', 'irpara'], async ({ sock, msg, ctx, args }) => {
    const rpg = require('../rpg/engine');
    const destino = args.join(' ').trim();

    if (!destino) {
      const p = await rpg.getPlayer(ctx.senderNumber);
      return tReply(sock, msg, ctx, '🧭 PARA ONDE?', [
        'Diz-me o sítio: `!viajar <sítio>`',
        '',
        ...Object.entries(rpg.BIOMES).map(([k, b]) =>
          `${b.emoji} *${k}* — nv.${b.nivel} ${'⚠️'.repeat(b.danger || 1)}`),
        '',
        '> Vê o mapa completo com `!world`',
      ]);
    }

    const p = await rpg.getPlayer(ctx.senderNumber);
    const r = world.viajar(p, destino);
    if (!r.ok) {
      return tReply(sock, msg, ctx, '🧭 VIAJAR', [r.motivo]);
    }

    await rpg.savePlayer(p);
    return tReply(sock, msg, ctx,
      r.primeiraVez ? '🧭 NOVO TERRITÓRIO' : '🧭 VIAJAR', r.linhas);
  }, true);

  // ═══ RANKING MUNDIAL ═══
  registerCase(['mundial', 'rankmundial', 'worldrank', 'rankingmundial'],
    async ({ sock, msg, ctx }) => {
      const rpg = require('../rpg/engine');
      const r = await world.rankingMundial(10);
      if (!r.ok) {
        return tReply(sock, msg, ctx, '🌍 RANKING MUNDIAL', [`⚠️ ${r.motivo}`]);
      }

      const eu = await rpg.getPlayer(ctx.senderNumber);
      const prog = world.progresso(eu);
      return tReply(sock, msg, ctx, '🌍 RANKING MUNDIAL', [
        ...r.linhas,
        '',
        `🧭 O teu mundo: ${world.barra(prog.pct)} ${prog.pct}% explorado`,
        `📊 Nível *${eu.level || 1}* · ⭐${eu.reputation || 0} reputação`,
      ]);
    }, true);
};
