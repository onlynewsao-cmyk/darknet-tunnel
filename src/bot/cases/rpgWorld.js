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
const visuals = require('../rpg/visuals');

async function tReply(sock, msg, ctx, title, lines) {
  const rpgTheme = require('../rpg/rpgTheme');
  return rpgTheme.rpgReply(sock, msg, ctx, title, lines);
  return sock.sendMessage(ctx.remoteJid, { text: corpo }, { quoted: msg });
}

module.exports = function registerRPGWorld(registerCase) {

  // ═══ O MAPA ═══
  registerCase(['world', 'mapa', 'biomas', 'mundomap'], async ({ sock, msg, ctx }) => {
    const rpg = require('../rpg/engine');
    const p = await rpg.getPlayer(ctx.senderNumber);
    const linhas = world.mapa(p);
    await rpg.savePlayer(p);
    const sent = await tReply(sock, msg, ctx, '🌍 MAPA DO MUNDO', linhas);
    await visuals.sendScene(sock, msg, ctx, 'portals').catch(() => {});
    return sent;
  }, true);

  // ═══ VIAJAR ═══
  registerCase(['viajar', 'travel', 'irpara'], async ({ sock, msg, ctx, args }) => {
    const rpg = require('../rpg/engine');
    const destino = args.join(' ').trim();

    if (!destino) {
      const p = await rpg.getPlayer(ctx.senderNumber);
      const prefix = ctx.prefix || config.bot.prefix || '!';
      // v9.0: escolher o destino é ver o mundo — carrossel com uma capa
      // gerada por IA para cada bioma + plano-B numerado no corpo.
      const corpo = [
        '🧭 *PARA ONDE VIAJAMOS?*',
        '',
        ...Object.entries(rpg.BIOMES).map(([k, b], i) =>
          `${i + 1}. ${b.emoji} *${k}* — nv.${b.nivel} ${'⚠️'.repeat(b.danger || 1)}`),
        '',
        `> 🖱️ Toca num cartão ou escreve \`${prefix}viajar <sítio>\``,
        `> (ex.: \`${prefix}viajar ${Object.keys(rpg.BIOMES)[0] || 'floresta'}\`)`,
      ].join('\n');
      // A arte muda por patamar de nível, mas cada patamar fica em cache:
      // visualmente pessoal sem gerar oito imagens novas a cada toque.
      const tier = Math.max(1, Math.ceil((p.level || 1) / 10));
      const visited = p.world?.visited || [];
      const cards = Object.entries(rpg.BIOMES).map(([k, b]) => ({
        corpo: `${b.emoji} *${k.toUpperCase()}*\n${b.desc}\n\n⭐ nv.${b.nivel} · ${'⚠️'.repeat(b.danger || 1)} perigo\n🎁 loot: ${(b.loot || []).slice(0, 3).join(', ') || '—'}${visited.includes(k) ? '\n✅ já visitado' : '\n🆕 1ª visita dá XP'}`,
        rodape: `🌍 ${config.bot.name} · NÍVEL ${p.level || 1}`,
        promptImg: `dark fantasy RPG landscape for level tier ${tier}, ${b.desc}, atmospheric epic vista, anime dark fantasy art, no text`,
        cacheKey: `biome_${k}_tier_${tier}`,
        // Falha rápido para a lista nativa/fallback não parecer bloqueada.
        prazoMs: 2500,
        botoes: [{ texto: `🚶 Viajar para ${k}`, id: `${prefix}viajar ${k}` }],
      }));
      let carro = false;
      if (sock.waUploadToServer) {
        try { carro = await require('../rpg/carousel').enviarCarrossel(sock, msg, ctx, { corpo, rodape: `🧭 ${config.bot.name} · ${prefix}viajar`, cards }); } catch {}
      }
      if (carro) return;
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
    let territorio = null;
    if (ctx.isGroup) {
      try {
        const regioes = require('../rpg/regions');
        territorio = await regioes.getCountryForGroup(ctx.remoteJid);
        if (territorio) regioes.marcarJogadorNoPais(p, territorio);
      } catch {}
    }
    const r = world.viajar(p, destino);
    if (!r.ok) {
      return tReply(sock, msg, ctx, '🧭 VIAJAR', [r.motivo]);
    }

    if (territorio) r.linhas.push(`🌍 Região actual: ${territorio.flag} ${territorio.name} · ${territorio.city}`);
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
