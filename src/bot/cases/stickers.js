/**
 * DARK BOT v5 — Cases de Stickers
 * sticker, sfull, toimg, attp, ttp, figubug, figubug2, stickerrename
 */
'use strict';

const mediaHandler = require('../mediaHandler');
const stickerMaker = require('../stickerMaker');
const config       = require('../../config');
const ai           = require('../ai');

module.exports = function registerStickerCases(registerCase) {

  // ── !sticker / !s — Foto/Vídeo → Sticker ─────────────────────────
  registerCase(['sticker', 's', 'fig', 'figurinha'], async ({ m, sock, ctx, isOwner, reply, react }) => {
    const raw = m.msg?.message || {};
    const quoted = raw.extendedTextMessage?.contextInfo?.quotedMessage;
    const srcMsg = (raw.imageMessage || raw.videoMessage)
      ? m.msg
      : (quoted?.imageMessage || quoted?.videoMessage)
        ? { message: quoted }
        : null;
    if (!srcMsg) return reply('🎨 Envie ou responda uma foto/vídeo com *!sticker*');
    react('⏳');
    try {
      const buf = await mediaHandler.downloadFromMessage(srcMsg);
      const mime = stickerMaker.detectMime ? stickerMaker.detectMime(buf) : 'image/jpeg';
      const isAnimated = !!(srcMsg.message?.videoMessage || quoted?.videoMessage) || mime === 'image/gif';
      const stk = await stickerMaker.create(buf, {
        botName: config.bot.name, ownerName: config.owner.name,
        userName: ctx.pushName, groupName: ctx.groupName || 'PV', isVideo: isAnimated,
      });
      if (!stk || stk.length < 50) throw new Error('Sticker inválido');
      await sock.sendMessage(ctx.remoteJid, { sticker: stk }, { quoted: m.msg });
      react('✅');
    } catch (e) { react('❌'); reply('❌ ' + e.message); }
  });

  // ── !sfull — Sticker sem cortar ───────────────────────────────────
  registerCase(['sfull', 'stickerful', 'fullsticker'], async ({ m, sock, ctx, reply, react }) => {
    const raw = m.msg?.message || {};
    const quoted = raw.extendedTextMessage?.contextInfo?.quotedMessage;
    const srcMsg = (raw.imageMessage || raw.stickerMessage)
      ? m.msg
      : (quoted?.imageMessage || quoted?.stickerMessage)
        ? { message: quoted }
        : null;
    if (!srcMsg) return reply('🖼️ Responda uma imagem/sticker com *!sfull*');
    react('⏳');
    try {
      const buf = await mediaHandler.downloadFromMessage(srcMsg);
      const stk = await stickerMaker.create(buf, {
        botName: config.bot.name, ownerName: config.owner.name,
        userName: ctx.pushName, groupName: ctx.groupName || 'PV', isVideo: false, full: true,
      });
      await sock.sendMessage(ctx.remoteJid, { sticker: stk }, { quoted: m.msg });
      react('✅');
    } catch (e) { react('❌'); reply('❌ ' + e.message); }
  });

  // ── !toimg — Sticker → Imagem ─────────────────────────────────────
  registerCase(['toimg', 'stickertoimg', 'sticker2img'], async ({ m, sock, ctx, reply, react }) => {
    const raw = m.msg?.message || {};
    const quoted = raw.extendedTextMessage?.contextInfo?.quotedMessage;
    const stkMsg = raw.stickerMessage
      ? m.msg
      : quoted?.stickerMessage ? { message: quoted } : null;
    if (!stkMsg) return reply('🖼️ Responda um sticker com *!toimg*');
    react('⏳');
    try {
      const buf = await mediaHandler.downloadFromMessage(stkMsg);
      await sock.sendMessage(ctx.remoteJid, { image: buf, caption: '🖼️ Sticker convertido!' }, { quoted: m.msg });
      react('✅');
    } catch (e) { react('❌'); reply('❌ ' + e.message); }
  });

  // ── !figubug2 — Sticker IA ────────────────────────────────────────
  registerCase(['figubug2', 'aisticker', 'iatig'], async ({ m, sock, ctx, args, reply, react }) => {
    const prompt = args.join(' ').trim() || `DARK BOT logo sticker, cyberpunk purple neon, ${ctx.pushName}`;
    react('🎨');
    try {
      const img = await ai.generateImage(prompt);
      const stk = await stickerMaker.create(img, {
        botName: config.bot.name, ownerName: config.owner.name,
        userName: ctx.pushName, groupName: ctx.groupName || 'PV', isVideo: false, full: true,
      });
      await sock.sendMessage(ctx.remoteJid, { sticker: stk }, { quoted: m.msg });
      react('✅');
    } catch (e) { react('❌'); reply('❌ ' + e.message); }
  });

  // ── !stickerrename — Renomear pack de QUALQUER sticker ─────────────
  // v7.1 — agora reescreve só os metadados do webp original (sem
  // re-encodar): preserva animação e funciona com stickers de qualquer
  // pessoa, em grupo ou PV.
  // v7.6 — removido 'rename' daqui: no RPG, 'rename' é o alias de 'nome' (personagem).
  // Para renomear stickers usa: stickerrename / renomear / trocarnome / packname.
  registerCase(['stickerrename', 'renamesticker', 'packname', 'renomear', 'renomesticker', 'renamestick', 'trocarnome'], async ({ m, sock, ctx, args, prefix, reply, react }) => {
    return require('../stickerRename').renomear({ sock, ctx, m, args, prefix, reply, react });
  });

  // ── !attp — Texto em sticker (animado) ────────────────────────────
  registerCase(['attp', 'textosticker', 'txtsticker'], async ({ m, sock, ctx, args, prefix, reply, react }) => {
    const text = args.join(' ').trim();
    if (!text) return reply(`✍️ Uso: *${prefix}attp* <texto>\nEx: *${prefix}attp* Dark Bot 🕸️`);
    react('⏳');
    try {
      // API de texto em imagem → sticker
      const url = `https://api.memegen.link/images/custom/_/${encodeURIComponent(text)}.png?font=impact&width=512&height=512&background=000000&color=ffffff`;
      const buf = await mediaHandler.fetchBuffer(url, 15000);
      if (!buf || buf.length < 500) throw new Error('sem imagem');
      const stk = await stickerMaker.create(buf, {
        botName: config.bot.name, ownerName: config.owner.name,
        userName: ctx.pushName, groupName: ctx.groupName || 'PV', isVideo: false, full: true,
      });
      await sock.sendMessage(ctx.remoteJid, { sticker: stk }, { quoted: m.msg });
      react('✅');
    } catch {
      try {
        const url2 = `https://fakeimg.pl/512x512/000000/ffffff/?text=${encodeURIComponent(text)}&font_size=60`;
        const buf2 = await mediaHandler.fetchBuffer(url2, 15000);
        const stk2 = await stickerMaker.create(buf2, {
          botName: config.bot.name, ownerName: config.owner.name,
          userName: ctx.pushName, groupName: ctx.groupName || 'PV', isVideo: false, full: true,
        });
        await sock.sendMessage(ctx.remoteJid, { sticker: stk2 }, { quoted: m.msg });
        react('✅');
      } catch (e) {
        react('❌');
        reply('❌ Falha a criar sticker de texto: ' + e.message);
      }
    }
  });

  // ── !definestickwm — marca d'água/descrição dos stickers DESTE grupo
  registerCase(['defpack', 'definestickpack', 'setpack', 'packlink', 'verpack', 'definestickwm', 'setstickwm', 'stickwmgrupo', 'definirmarca'], async ({ sock, ctx, args, prefix, reply, react, isOwner, isAdminFn }) => {
    const wm = require('../stickerWm');
    const jid = ctx.remoteJid;
    const p = prefix || '.';

    if (ctx.isGroup && !isOwner) {
      let ok = false;
      try { ok = typeof isAdminFn === 'function' ? await isAdminFn() : false; } catch {}
      if (!ok) {
        try {
          const meta = ctx.groupMeta || await sock.groupMetadata(jid);
          const snum = String(ctx.senderNumber || '').replace(/\D/g, '');
          ok = !!(meta?.participants || []).some(part => {
            const n = String(part.id || '').split(':')[0].split('@')[0].replace(/\D/g, '');
            return n === snum && (part.admin === 'admin' || part.admin === 'superadmin');
          });
        } catch {}
      }
      if (!ok) return reply('🚫 Só o *Dono* ou *Admins* do grupo podem definir a marca dos stickers.');
    }

    const raw = args.join(' ').trim();
    const sub = (args[0] || '').toLowerCase();

    if (!raw || ['status', 'ver', 'info'].includes(sub)) {
      const saved = await wm.getForJid(jid);
      const glob = await wm.getGlobalDefault().catch(() => null);
      let txt = wm.statusText(saved, p);
      if (glob?.channelUrl) {
        txt += `\n\nDefault global («Ver pacote» se o chat não tiver o seu):\n${glob.channelUrl}`;
      }
      return reply(txt);
    }

    if (['off', 'reset', 'limpar', 'clear', 'remover'].includes(sub)) {
      await wm.clearForJid(jid);
      return reply('✅ Pack deste chat *apagado*. «Ver pacote» volta ao default global.');
    }

    if (['global', 'default', 'padrao', 'padrão'].includes(sub)) {
      if (!isOwner) return reply('🚫 Só o *Dono* define o pack default de todos os chats.');
      const rest = args.slice(1).join(' ').trim();
      if (!rest || ['off', 'reset'].includes(rest.toLowerCase())) {
        await wm.saveGlobalDefault({ link: wm.DEFAULT_PACK_URL });
        return reply('✅ Default global resetado para o canal DARK NET.');
      }
      const detected = await wm.resolveAnyLink(rest, sock).catch(() => null);
      if (!detected?.url) return reply(`Cola o link: *${p}defpack global* https://whatsapp.com/channel/...`);
      const saved = await wm.saveGlobalDefault({
        brand: wm.DEFAULT_BRAND,
        slogan: wm.DEFAULT_SLOGAN,
        link: detected.url,
        cta: wm.DEFAULT_CTA,
        channelName: detected.name || '',
      });
      return reply(
        `✅ *Default global* do «Ver pacote»:\n` +
        `Nome: *${saved.packName}*\n` +
        `Link: ${saved.channelUrl}\n` +
        (detected.name ? '' : `\nSe o nome não veio, usa *${p}defpack nome* Nome do Canal`)
      );
    }

    const current = await wm.getForJid(jid);
    if (['author', 'autor', 'marca'].includes(sub)) {
      const val = args.slice(1).join(' ').trim();
      if (!val) return reply(`Usa: *${p}definestickwm author* DARK NET 🕸️`);
      const saved = await wm.saveForJid(jid, {
        brand: val,
        slogan: current?.slogan,
        channelUrl: current?.channelUrl || '',
        cta: current?.cta,
        channelName: current?.channelName || '',
        linkType: current?.linkType || '',
      });
      return reply(wm.statusText(saved, p));
    }

    if (['nome', 'name', 'canal', 'titulo', 'título'].includes(sub)) {
      const val = args.slice(1).join(' ').trim();
      if (!val) return reply(`Usa: *${p}defpack nome* Nome do Canal`);
      const saved = await wm.saveForJid(jid, {
        brand: current?.brand,
        slogan: current?.slogan,
        channelUrl: current?.channelUrl || '',
        cta: current?.cta,
        channelName: val,
        linkType: current?.linkType || '',
      });
      return reply(
        `✅ Nome do canal no «Ver pacote»: *${val}*\n\n` +
        wm.statusText(saved, p)
      );
    }

    if (['slogan', 'frase'].includes(sub)) {
      const val = args.slice(1).join(' ').trim();
      if (!val) return reply(`Usa: *${p}definestickwm slogan* O melhor canal do mundo`);
      const saved = await wm.saveForJid(jid, {
        brand: current?.brand,
        slogan: val,
        channelUrl: current?.channelUrl || '',
        cta: current?.cta,
        channelName: current?.channelName || '',
        linkType: current?.linkType || '',
      });
      return reply(wm.statusText(saved, p));
    }

    react('⏳');
    const detected = await wm.resolveAnyLink(raw, sock).catch(() => null);
    if (detected?.url) {
      const kind = detected.type === 'group' ? 'grupo' : 'canal';
      const saved = await wm.saveForJid(jid, {
        brand: current?.brand || wm.DEFAULT_BRAND,
        slogan: current?.slogan || wm.DEFAULT_SLOGAN,
        channelUrl: detected.url,
        cta: current?.cta || wm.DEFAULT_CTA,
        channelName: detected.name || '',
        linkType: detected.type || '',
      });
      react('✅');
      return reply(
        `✅ Link de *${kind}* detectado.\n` +
        `Título: *${saved.packName}*\n` +
        `Publisher: ${saved.authorName}\n` +
        (detected.name ? '' : `Não apanhei o nome. Usa *${p}defpack nome* Nome do Canal\n\n`) +
        wm.statusText(saved, p)
      );
    }

    // Nome (sem link): activa e tenta o convite DESTE grupo
    let groupUrl = current?.channelUrl || '';
    if (ctx.isGroup) {
      const fresh = await wm.groupInviteUrl(sock, jid);
      if (fresh) groupUrl = fresh;
    }
    const saved = await wm.saveForJid(jid, {
      brand: current?.brand || wm.DEFAULT_BRAND,
      slogan: current?.slogan || wm.DEFAULT_SLOGAN,
      channelUrl: groupUrl,
      cta: current?.cta || wm.DEFAULT_CTA,
      channelName: '',
      linkType: groupUrl.includes('chat.whatsapp.com') ? 'group' : (current?.linkType || ''),
    });
    react('✅');
    return reply(
      `✅ Marca *activada* neste grupo.\n` +
      (groupUrl ? `Link usado: o convite deste grupo.\n\n` : `Cola um link de canal/grupo se quiseres esse URL na descrição.\n\n`) +
      wm.statusText(saved, p)
    );
  });

  // ── !ttp — Texto em sticker (fundo dark) ─────────────────────────
  registerCase(['ttp', 'texto', 'textsticker'], async ({ m, sock, ctx, args, prefix, reply, react }) => {
    const text = args.join(' ').trim();
    if (!text) return reply(`✍️ Uso: *${prefix}ttp* <texto>`);
    react('⏳');
    try {
      const url = `https://fakeimg.pl/512x512/1a1a2e/8B5CF6/?text=${encodeURIComponent(text)}&font_size=55`;
      const buf = await mediaHandler.fetchBuffer(url, 15000);
      if (!buf || buf.length < 500) throw new Error('sem imagem');
      const stk = await stickerMaker.create(buf, {
        botName: config.bot.name, ownerName: config.owner.name,
        userName: ctx.pushName, groupName: ctx.groupName || 'PV', isVideo: false, full: true,
      });
      await sock.sendMessage(ctx.remoteJid, { sticker: stk }, { quoted: m.msg });
      react('✅');
    } catch (e) { react('❌'); reply('❌ ' + e.message); }
  });
};
