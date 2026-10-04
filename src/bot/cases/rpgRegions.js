'use strict';
/** DARK RPG — países, cidades e região internacional. */

const regions = require('../rpg/regions');
const rpg = require('../rpg/engine');
const visuals = require('../rpg/visuals');

async function tReply(sock, msg, ctx, title, lines) {
  return require('../rpg/rpgTheme').rpgReply(sock, msg, ctx, title, lines);
}

async function portalReply(sock, msg, ctx, title, lines) {
  const sent = await tReply(sock, msg, ctx, title, lines);
  await visuals.sendScene(sock, msg, ctx, 'portals').catch(() => {});
  return sent;
}

function descricao(country) {
  return `${country.flag} *${country.name}* — grupo-território RPG\n` +
    `└ 🗺️ ${country.biome}`;
}

module.exports = function registerRPGRegions(registerCase) {
  registerCase(['pais', 'país', 'regiaorpg', 'região-rpg'], async ({ sock, msg, ctx, args, isOwner, isAdminFn }) => {
    const sub = String(args[0] || '').toLowerCase();

    if (sub === 'definir' || sub === 'set' || sub === 'sincronizar') {
      if (!ctx.isGroup) return tReply(sock, msg, ctx, '🌍 TERRITÓRIO', ['Este comando só funciona dentro de um grupo.']);
      let admin = !!isOwner;
      if (!admin && typeof isAdminFn === 'function') {
        try { admin = await isAdminFn(); } catch {}
      }
      if (!admin) return tReply(sock, msg, ctx, '🚫 TERRITÓRIO', ['Só admins podem sincronizar o território RPG do grupo.']);
      // O país é o próprio grupo: não se escolhe uma lista fixa. Para mudar
      // o território, muda o nome do grupo e usa este comando uma vez.
      const result = await regions.ensureGroupCountry(ctx.remoteJid, ctx.groupName);
      if (!result.ok) return tReply(sock, msg, ctx, '⚠️ TERRITÓRIO', [result.error]);
      return portalReply(sock, msg, ctx, '🌍 TERRITÓRIO SINCRONIZADO', [
        descricao(result.country),
        '',
        'Este grupo é o país desta região no mundo DARK RPG.',
        '💡 Se mudares o nome do grupo, usa *!pais sincronizar* para actualizar o território.',
        '💱 O inventário e o mercado continuam ligados a DARK VILLE internacional.',
      ]);
    }

    const country = ctx.isGroup ? await regions.getCountryForGroup(ctx.remoteJid, ctx.groupName) : null;
    if (sub === 'entrar' || sub === 'visitar') {
      if (!country) return tReply(sock, msg, ctx, '🌍 PORTAL REGIONAL', [
        'Este grupo ainda não tem uma região RPG.',
        'Um admin abre o mundo com *!modorpg on*.',
      ]);
      const player = await rpg.getPlayer(ctx.senderNumber);
      regions.marcarJogadorNoPais(player, country);
      await rpg.savePlayer(player);
      return portalReply(sock, msg, ctx, '🧭 REGIÃO REGISTADA', [
        descricao(country),
        '',
        `🪶 ${player.name}, a tua origem é agora *${country.name}*.`,
        'Viaja, luta e negocia: DARK VILLE liga todos os grupos-território.',
      ]);
    }

    if (!country) {
      return portalReply(sock, msg, ctx, '🏰 DARK VILLE — CENTRO INTERNACIONAL', [
        ...regions.citiesOfTheCommunity(),
        '',
        'Cada grupo com *!modorpg on* torna-se um país-território com o próprio nome.',
        'Usa *!paises* para ver os grupos-território activos ou *!trocar ofertas* para o mercado global.',
      ]);
    }

    return portalReply(sock, msg, ctx, '🌍 REGIÃO DO GRUPO', [
      descricao(country),
      '',
      '🎮 Aqui podes jogar o RPG deste grupo-território.',
      '💱 O mercado é internacional: *!trocar ofertas*.',
      '🧭 Para tornar este grupo a tua origem: *!pais entrar*.',
      '📊 Territórios activos: *!paises*.',
    ]);
  }, true);

  registerCase(['paises', 'países', 'statuspaises', 'statuspaíses', 'regioesrpg'], async ({ sock, msg, ctx }) => {
    const active = await regions.activeRegions(30);
    const lines = [
      ...regions.citiesOfTheCommunity(),
      '',
      '🌐 *GRUPOS-TERRITÓRIO ACTIVOS*',
    ];
    if (!active.length) {
      lines.push('Ainda não há grupos-território activos.', 'Um admin abre um com *!modorpg on* num grupo.');
    } else {
      for (const entry of active) {
        const c = entry.country;
        lines.push(`${c.flag} *${c.name}*${entry.active ? ' · 🎮 mundo aberto' : ''}`);
      }
    }
    lines.push('', '💱 *Mercado internacional:* !trocar ofertas');
    return portalReply(sock, msg, ctx, '🌍 DARK VILLE INTERNACIONAL', lines);
  }, true);
};
