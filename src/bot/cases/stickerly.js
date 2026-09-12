/**
 * DARK BOT — STICKER.LY + PIN
 * Pesquisa ampla (vários packs) + figurinhas estáticas e ANIMADAS.
 */
'use strict';

const config = require('../../config');
let _lz_stickerMaker;
const stickerMaker = new Proxy({}, { get: (_, k) => (_lz_stickerMaker ||= require('../stickerMaker'))[k] });

module.exports = function registerStickerlyCases(registerCase) {

  registerCase(['stickerly', 'sly', 'slypack'], async ({ sock, msg, ctx, args, prefix, reply }) => {
    const query = args.join(' ').trim();
    if (!query) {
      return reply(
        '🔍 *STICKER.LY*\n\n' +
        `*${prefix}stickerly* <nome>\n` +
        `*${prefix}slypack* Neymar\n` +
        `*${prefix}stickerly* Neymar gif — packs *animados*\n\n` +
        'Pesquisa ampla: junta packs estáticos e animados.'
      );
    }
    sock.sendMessage(ctx.remoteJid, { react: { text: '🔍', key: msg.key } });
    try {
      const sly = require('../stickerly');
      const found = await sly.collectStickers(query, { limit: 30 });
      if (!found.stickers.length) throw new Error('Pack sem stickers');

      const stickerPack = require('../stickerPack');
      const packId = stickerMaker.makePackId
        ? stickerMaker.makePackId(query)
        : 'sly-' + Date.now().toString(36);
      const searchName = String(found.title || query).replace(/\s+/g, ' ').trim().slice(0, 40);
      const stickers = [];
      let animCount = 0;
      for (const s of found.stickers) {
        try {
          const buf = await require('../mediaHandler').fetchBuffer(s.url);
          if (!buf || buf.length < 500) continue;
          const stk = await stickerMaker.create(buf, {
            botName: config.bot.name, ownerName: config.owner.name,
            userName: ctx.pushName, groupName: ctx.groupName || 'PV',
            isVideo: !!s.isAnimated,
            packName: searchName,
            searchQuery: searchName,
            remoteJid: ctx.remoteJid,
            packId,
            skipGroupWm: true,
          });
          if (stk && stk.length > 50) {
            stickers.push(stk);
            if (s.isAnimated) animCount++;
          }
        } catch {}
      }
      if (!stickers.length) throw new Error('Nenhuma figurinha convertida');
      const finished = await stickerPack.sendFinishedPack(sock, ctx.remoteJid, stickers, {
        query: searchName, packId, quoted: msg,
      });
      await sock.sendMessage(ctx.remoteJid, {
        text:
          '✅ Pack *' + searchName + '*\n' +
          '📦 ' + finished.stickers.length + ' figurinhas (' + animCount + ' animadas)\n' +
          '🔎 ' + found.totalFound + ' packs na pesquisa · ' + found.animatedPacks + ' animados\n\n' +
          finished.description,
      }, { quoted: msg });
      sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } });
    } catch (e) {
      sock.sendMessage(ctx.remoteJid, { react: { text: '❌', key: msg.key } });
      return reply('❌ sticker.ly: ' + e.message);
    }
  }, true);

  async function runPin({ sock, msg, ctx, args, prefix, reply, forceVideo = false }) {
    const text = args.join(' ').trim();
    if (!text) return reply(
      '╔━᳀『 ᴘɪɴᴛʀᴇsᴛ 』═᳀\n' +
      '⌬ Use: *' + prefix + 'pin <termo>*\n' +
      '⌬ Ex: *' + prefix + 'pin gatos*\n' +
      '⌬ Ex: *' + prefix + 'pin Messi|vídeo*\n' +
      '⌬ Ex: *' + prefix + 'pin gatos |6|vídeo*\n' +
      '⌬ Ex: *' + prefix + 'pin gatos |imagem*\n' +
      '⌬ *' + prefix + 'pinmp4 Messi* — só vídeo\n' +
      '⌬ Manda até 10 mídias\n' +
      '╚═━═━═━═━═━═━═━═᳀'
    );
    sock.sendMessage(ctx.remoteJid, { react: { text: '🔎', key: msg.key } });
    try {
      const pin = require('../pinterestSearch');
      const parsed = pin.parsePinArgs(text);
      if (forceVideo) parsed.type = 'video';
      if (!parsed.query) return reply('Uso: ' + prefix + 'pin <termo> |qtd|tipo');

      const results = await pin.searchPinterest(parsed.query, {
        type: parsed.type,
        limit: parsed.limit,
      });
      if (!results.length) {
        throw new Error(parsed.type === 'video'
          ? 'Nenhum vídeo encontrado. Tenta outro termo ou um link do pin.'
          : 'Nenhum resultado. A API do Pinterest está instável — tenta de novo.');
      }

      let sent = 0;
      for (const item of results) {
        const url = item.media_url || item.image_url || item.url;
        if (!url) continue;
        const isVid = item.type === 'video' || parsed.type === 'video' || /\.mp4/i.test(url);
        try {
          if (isVid) {
            const buf = await require('../mediaHandler').fetchBuffer(url);
            if (!buf || buf.length < 2000) continue;
            await sock.sendMessage(ctx.remoteJid, {
              video: buf, mimetype: 'video/mp4',
              caption: '📌 Pinterest — ' + parsed.query,
            }, { quoted: msg });
          } else {
            await sock.sendMessage(ctx.remoteJid, {
              image: { url },
              caption: '📌 Pinterest — ' + parsed.query,
            }, { quoted: msg });
          }
          sent++;
        } catch { /* item morto */ }
      }
      if (!sent) throw new Error('Encontrei pins mas nenhum ficheiro abriu. Tenta outro termo.');
      sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } });
    } catch (e) {
      sock.sendMessage(ctx.remoteJid, { react: { text: '❌', key: msg.key } });
      return reply('❌ Pinterest: ' + e.message);
    }
  }

  registerCase(['pin', 'polo'], async (c) => runPin(c), true);
  registerCase(['pinmp4', 'pinvd', 'pinvideo'], async (c) => runPin({ ...c, forceVideo: true }), true);
};
