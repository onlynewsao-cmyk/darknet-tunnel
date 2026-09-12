/**
 * DARK BOT — Renomear QUALQUER sticker (pack + autor)
 *
 * Responde a um sticker (de quem quer que seja — grupo ou PV) e reescreve
 * só os METADADOS (EXIF) do webp original. Sem re-encodar → preserva
 * animação, qualidade e frames. Muito mais rápido que recriar o sticker.
 *
 *   .stickerrename <pack> | <autor>
 *   .renomear      <pack> | <autor>
 *   .rename        <pack> | <autor>
 *   .trocarnome    <pack> | <autor>
 */
'use strict';

const mediaHandler = require('./mediaHandler');
const stickerMaker = require('./stickerMaker');

/**
 * '<pack> | <autor>' → { pack, author }. Puro e testável.
 * Aceita args já separados (['Dark Pack','|','Dark Net']) ou juntos.
 */
function parseArgs(args) {
  const raw = String(Array.isArray(args) ? args.join(' ') : (args || ''));
  const parts = raw.split('|').map(x => String(x).trim());
  return {
    pack: (parts[0] || '').slice(0, 80),
    author: (parts[1] || '').slice(0, 80),
  };
}

/**
 * Extrai o sticker da mensagem do comando ou da mensagem citada.
 * @returns {{ stkMsg:object, isAnimated:boolean }|null}
 */
function extract(rawMsg) {
  const message = rawMsg?.message || rawMsg || {};
  const quoted = message.extendedTextMessage?.contextInfo?.quotedMessage;
  const stkMsg = message.stickerMessage || quoted?.stickerMessage;
  if (!stkMsg) return null;
  const isAnimated = !!stkMsg.isAnimated;
  return { stkMsg, isAnimated };
}

/**
 * Fluxo completo: extrai → download → injectMeta → envia.
 * @param {{sock,ctx,m,args,prefix,reply,react}} ctx
 */
async function renomear({ sock, ctx, m, args, prefix, reply, react }) {
  const p = prefix || '.';
  const ex = extract(m?.msg);
  if (!ex) {
    return reply(`🎨 Responde a um sticker com: *${p}stickerrename* <pack> | <autor>\nEx: *${p}stickerrename* Dark Pack | Dark Net`);
  }
  const { pack, author } = parseArgs(args);
  if (!pack) {
    return reply(`🎨 Ex: *${p}stickerrename* Dark Pack | Dark Net\n\nUsa \`|\` para o autor:\n*${p}stickerrename* Meu Pack | Dark Net`);
  }
  try { react('⏳'); } catch {}
  try {
    const buf = await mediaHandler.downloadFromMessage({ message: { stickerMessage: ex.stkMsg } });
    const novo = await stickerMaker.renameMeta(buf, {
      packName: pack,
      authorName: author || ctx?.pushName || 'DARK NET 🕸️',
    });
    await sock.sendMessage(ctx.remoteJid, { sticker: novo }, { quoted: m?.msg || m?.key });
    try { react('✅'); } catch {}
    return reply(
      `✅ Sticker renomeado!\n` +
      `📦 Pack: *${pack}*\n` +
      `👤 Autor: *${author || ctx?.pushName || '—'}*\n` +
      (ex.isAnimated ? `🎞️ Animação preservada.` : ``)
    );
  } catch (e) {
    try { react('❌'); } catch {}
    return reply('❌ ' + (e.message || e));
  }
}

module.exports = { parseArgs, extract, renomear };
