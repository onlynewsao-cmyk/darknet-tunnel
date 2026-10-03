'use strict';
/** DARK RPG — países, cidades e região internacional. */

const regions = require('../rpg/regions');
const rpg = require('../rpg/engine');

async function tReply(sock, msg, ctx, title, lines) {
  return require('../rpg/rpgTheme').rpgReply(sock, msg, ctx, title, lines);
}

function descricao(country) {
  return `${country.flag} *${country.name}* — ${country.city}\n` +
    `└ 🗺️ ${country.biome}`;
}

module.exports = function registerRPGRegions(registerCase) {
  registerCase(['pais', 'país', 'regiaorpg', 'região-rpg'], async ({ sock, msg, ctx, args, isOwner, isAdminFn }) => {
    const sub = String(args[0] || '').toLowerCase();

    if (sub === 'definir' || sub === 'set') {
      if (!ctx.isGroup) return tReply(sock, msg, ctx, '🌍 REGIÃO', ['Este comando só funciona dentro de um grupo.']);
      let admin = !!isOwner;
      if (!admin && typeof isAdminFn === 'function') {
        try { admin = await isAdminFn(); } catch {}
      }
      if (!admin) return tReply(sock, msg, ctx, '🚫 REGIÃO', ['Só admins podem definir o país do grupo RPG.']);
      const wanted = args.slice(1).join(' ');
      if (!wanted) return tReply(sock, msg, ctx, '🌍 DEFINIR PAÍS', [
        'Uso: *!pais definir <país>*',
        'Ex.: *!pais definir Angola*',
        'Usa *!paises* para ver os territórios livres/activos.',
      ]);
      const result = await regions.ensureGroupCountry(ctx.remoteJid, wanted);
      if (!result.ok) return tReply(sock, msg, ctx, '⚠️ REGIÃO', [result.error]);
      return tReply(sock, msg, ctx, '🌍 REGIÃO DEFINIDA', [
        descricao(result.country),
        '',
        'Este grupo é agora uma cidade desta região no mundo DARK RPG.',
        '💱 O inventário e o mercado continuam ligados a DARK VILLE internacional.',
      ]);
    }

    const country = ctx.isGroup ? await regions.getCountryForGroup(ctx.remoteJid) : null;
    if (sub === 'entrar' || sub === 'visitar') {
      if (!country) return tReply(sock, msg, ctx, '🌍 PORTAL REGIONAL', [
        'Este grupo ainda não tem uma região RPG.',
        'Um admin abre o mundo com *!modorpg on*.',
      ]);
      const player = await rpg.getPlayer(ctx.senderNumber);
      regions.marcarJogadorNoPais(player, country);
      await rpg.savePlayer(player);
      return tReply(sock, msg, ctx, '🧭 REGIÃO REGISTADA', [
        descricao(country),
        '',
        `🪶 ${player.name}, a tua origem é agora *${country.name}*.`,
        'Viaja, luta e negocia: DARK VILLE liga todas as regiões.',
      ]);
    }

    if (!country) {
      return tReply(sock, msg, ctx, '🏰 DARK VILLE — CENTRO INTERNACIONAL', [
        ...regions.citiesOfTheCommunity(),
        '',
        'Cada grupo com *!modorpg on* recebe um país e uma cidade própria.',
        'Usa *!paises* para ver as regiões activas ou *!trocar ofertas* para o mercado global.',
      ]);
    }

    return tReply(sock, msg, ctx, '🌍 REGIÃO DO GRUPO', [
      descricao(country),
      '',
      '🎮 Aqui podes jogar o RPG desta região.',
      '💱 O mercado é internacional: *!trocar ofertas*.',
      '🧭 Para tornar esta cidade a tua origem: *!pais entrar*.',
      '📊 Regiões activas: *!paises*.',
    ]);
  }, true);

  registerCase(['paises', 'países', 'statuspaises', 'statuspaíses', 'regioesrpg'], async ({ sock, msg, ctx }) => {
    const active = await regions.activeRegions(30);
    const lines = [
      ...regions.citiesOfTheCommunity(),
      '',
      '🌐 *REGIÕES ACTIVAS*',
    ];
    if (!active.length) {
      lines.push('Ainda não há cidades regionais activas.', 'Um admin abre uma com *!modorpg on* num grupo.');
    } else {
      for (const entry of active) {
        const c = entry.country;
        lines.push(`${c.flag} *${c.name}* — ${c.city}${entry.active ? ' · 🎮 mundo aberto' : ''}`);
      }
    }
    lines.push('', '💱 *Mercado internacional:* !trocar ofertas');
    return tReply(sock, msg, ctx, '🌍 DARK VILLE INTERNACIONAL', lines);
  }, true);
};
