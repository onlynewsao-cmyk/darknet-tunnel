'use strict';
/**
 * Cenas visuais locais do DARK RPG.
 *
 * Não dependem de Pinterest/IA no momento do comando: são assets originais
 * compactos, em cache, para o RPG continuar rápido mesmo sem rede externa.
 */
const fs = require('fs');
const path = require('path');

const SCENES = {
  arena: {
    file: 'dark-ville-arena.jpg',
    title: '⚔️ ARENA DAS SOMBRAS',
    caption: 'A lua observa. As runas da Arena das Sombras estão acesas.',
  },
  market: {
    file: 'dark-ville-market.jpg',
    title: '💱 MERCADO INTERNACIONAL',
    caption: 'O Mercado de DARK VILLE liga aventureiros e itens de todas as regiões.',
  },
  portals: {
    file: 'dark-ville-portals.jpg',
    title: '🌍 PORTAIS REGIONAIS',
    caption: 'Cada portal liga DARK VILLE a um grupo-território do DARK RPG.',
  },
};

const _cache = new Map();
function assetPath(key) {
  const scene = SCENES[key];
  return scene ? path.join(__dirname, 'images', scene.file) : null;
}
function image(key) {
  if (!SCENES[key]) return null;
  if (_cache.has(key)) return _cache.get(key);
  try {
    const buffer = fs.readFileSync(assetPath(key));
    if (buffer.length < 1024) return null;
    _cache.set(key, buffer);
    return buffer;
  } catch { return null; }
}

/** Não força media em mocks/clients sem upload; o fluxo RPG mantém-se rápido. */
async function sendScene(sock, msg, ctx, key, caption, extra = {}) {
  const buffer = image(key);
  if (!buffer || !sock?.waUploadToServer) return false;
  try {
    await sock.sendMessage(ctx.remoteJid, {
      image: buffer,
      caption: caption || SCENES[key].caption,
      ...extra,
    }, { quoted: msg });
    return true;
  } catch { return false; }
}

async function sendCombatScene(sock, msg, ctx, player, enemy) {
  const boss = !!enemy?.boss;
  const title = boss ? '👑 PORTAL DO BOSS' : '⚔️ ARENA DAS SOMBRAS';
  const text = boss
    ? `👑 *${enemy.name}* atravessou o portal. ${player.name}, a cidade inteira observa.`
    : `⚔️ *${player.name}* desafia *${enemy?.name || 'um inimigo'}* na Arena das Sombras.`;
  return sendScene(sock, msg, ctx, boss ? 'portals' : 'arena', `${title}\n\n${text}`);
}

async function sendHeroAnimation(sock, msg, ctx, player, { region = null, prefix = '!' } = {}) {
  const art = require('../welcomeArt');
  let profilePicUrl = null;
  try { profilePicUrl = await sock.profilePictureUrl?.(ctx.senderJid || ctx.remoteJid, 'image'); } catch {}
  const opts = { profilePicUrl, region, jid: ctx.remoteJid, botName: 'DARK BOT', frames: 10 };
  const video = await art.heroGif(player, opts);
  if (video?.length > 2048) {
    await sock.sendMessage(ctx.remoteJid, {
      video, gifPlayback: true, mimetype: 'video/mp4',
      caption: `🎞️ *${player.name}* — avatar animado do DARK RPG`,
    }, { quoted: msg });
    return { ok: true, animated: true };
  }
  const card = await art.heroCard(player, { ...opts, profilePicUrl: null, fetchFn: async () => null });
  await sock.sendMessage(ctx.remoteJid, {
    image: card,
    caption: `🪶 *${player.name}* — card do herói\n> GIF indisponível neste host; enviei a arte personalizada sem atrasar a aventura.\n> Tenta novamente com *${prefix}rpggif* quando o host tiver ffmpeg.`,
  }, { quoted: msg });
  return { ok: true, animated: false };
}

async function sendGallery(sock, msg, ctx, prefix = '!') {
  const carousel = require('./carousel');
  const cards = [
    {
      titulo: SCENES.arena.title,
      corpo: SCENES.arena.caption,
      rodape: 'DARK VILLE · COMBATE',
      imagem: image('arena'),
      botoes: [{ texto: '⚔️ Entrar na arena', id: `${prefix}lutar` }],
    },
    {
      titulo: SCENES.market.title,
      corpo: SCENES.market.caption,
      rodape: 'DARK VILLE · TROCAS',
      imagem: image('market'),
      botoes: [{ texto: '💱 Ver ofertas', id: `${prefix}trocar ofertas` }],
    },
    {
      titulo: SCENES.portals.title,
      corpo: SCENES.portals.caption,
      rodape: 'DARK VILLE · REGIÕES',
      imagem: image('portals'),
      botoes: [{ texto: '🌍 Ver países', id: `${prefix}paises` }],
    },
  ];
  return carousel.enviarCarrossel(sock, msg, ctx, {
    corpo: '🖼️ *CENÁRIOS DO DARK RPG*\nToca numa cena para entrar no mundo.',
    rodape: 'DARK VILLE · VISUAIS',
    cards,
  });
}

module.exports = { SCENES, assetPath, image, sendScene, sendCombatScene, sendHeroAnimation, sendGallery, _cache };
