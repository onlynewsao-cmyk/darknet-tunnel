/**
 * Pack de figurinhas: envio nativo de uma vez + marca do grupo.
 * Pesquisa (.pinpacks / .stickerly / .packbusca): o nome da busca
 * entra na descrição se o grupo tiver .definestickwm.
 */
'use strict';

async function sendNativeStickerPack(sock, jid, stickers, { name, publisher, description, packId, packUrl, quoted } = {}) {
  if (!sock || !jid || !stickers?.length) return false;
  const list = stickers.filter((b) => b && b.length > 50 && b.length < 1024 * 1024).slice(0, 60);
  if (!list.length) return false;
  const packName = name || 'DARK PACK';
  const packPublisher = publisher || 'DARK NET 🕸️';
  const packDesc = description || packPublisher;
  const link = packUrl || '';
  const payloadStickers = list.map((data) => ({ data, emojis: ['✨'] }));
  const attempts = [
    {
      cover: list[0],
      stickers: payloadStickers,
      name: packName,
      publisher: packPublisher,
      description: packDesc,
      packId,
      stickerPackId: packId,
      androidAppStoreLink: link,
      iosAppStoreLink: link,
    },
    {
      cover: list[0],
      stickers: payloadStickers,
      name: packName,
      publisher: packPublisher,
    },
    {
      stickerPack: {
        name: packName,
        publisher: packPublisher,
        description: packDesc,
        stickerPackId: packId,
        cover: list[0],
        stickers: payloadStickers.map((s) => ({ sticker: s.data, emojis: s.emojis })),
      },
    },
  ];
  for (const payload of attempts) {
    try {
      await sock.sendMessage(jid, payload, { quoted });
      return true;
    } catch (e) {
      console.warn('[stickerPack] nativo:', String(e.message || e).slice(0, 160));
    }
  }
  return false;
}

async function finishSearchPack(stickers, { query, jid, packId } = {}) {
  const wm = require('./stickerWm');
  const maker = require('./stickerMaker');
  const saved = jid ? await wm.getForJid(jid).catch(() => null) : null;
  const meta = wm.composeSearchPack(query, saved);
  const id = packId || (typeof maker.makePackId === 'function' ? maker.makePackId(query) : `com.darkbot.pack.${Date.now().toString(16)}`);
  let out = stickers || [];
  if (typeof maker.stampPack === 'function' && out.length) {
    out = await maker.stampPack(out, {
      pack: meta.packName,
      author: meta.authorName,
      packId: id,
    });
  }
  return {
    stickers: out,
    name: meta.packName,
    publisher: meta.publisher,
    description: meta.description,
    authorName: meta.authorName,
    packId: id,
    wm: saved,
  };
}

async function sendFinishedPack(sock, jid, stickers, opts = {}) {
  const finished = await finishSearchPack(stickers, { query: opts.query, jid, packId: opts.packId });
  const sent = await sendNativeStickerPack(sock, jid, finished.stickers, {
    name: finished.name,
    publisher: finished.publisher,
    description: finished.description,
    packId: finished.packId,
    packUrl: finished.packUrl,
    quoted: opts.quoted,
  });
  if (!sent) {
    await Promise.all(finished.stickers.map((stk) => sock.sendMessage(jid, { sticker: stk })));
  }
  return { ...finished, sentAsPack: sent };
}

module.exports = {
  sendNativeStickerPack,
  finishSearchPack,
  sendFinishedPack,
};
