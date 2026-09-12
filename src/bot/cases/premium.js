/**
 * DARK BOT v5 — Cases Premium / VIP / Prefixo
 * vip, assinar, meuplano, setprefix, prefixos
 */
'use strict';

const config = require('../../config');
const BotConfig = require('../../database/models/BotConfig');
const botConfigCache = require('../botConfigCache');
const prefixManager  = require('../prefixManager');

module.exports = function registerPremiumCases(registerCase) {

  // ══════════════════════════════════════════════════════════
  // case 'vip' / 'assinar' / 'planos'
  // Carousel com os planos de assinatura + botão para contactar
  // ══════════════════════════════════════════════════════════
  registerCase(['vip', 'assinar', 'premium', 'meuplano'], async ({   // v7.30: 'planos' tem submenu próprio (rental2.js)
    sock, msg, ctx, prefix, reply, react,
  }) => {
    const ownerNum   = String(config.owner.number || '').replace(/\D/g, '');
    const ownerLink  = `https://wa.me/${ownerNum}`;
    const channelUrl = config.channelUrl || 'https://whatsapp.com/channel/0029VbC8voN4Y9lszc9VuT2D';

    const { generateWAMessageFromContent, prepareWAMessageMedia } = require('@systemzero/baileys');
    const path = require('path');
    const fs   = require('fs');
    const logoPath = path.join(__dirname, '../../public/img/logo.jpg');

    // Planos
    const planos = [
      {
        nome:    '🆓 FREE',
        preco:   'Gratuito',
        dias:    null,
        emoji:   '🆓',
        desc:    '50 cmds/dia no PV\nComandos básicos\nSem downloads de alta qualidade\nSem IA avançada',
        btns:    [
          { text: '📋 Usar agora', id: `${prefix}menu` },
          { text: '⬆️ Upgrade', id: `${prefix}vip` },
        ],
      },
      {
        nome:    '⭐ PREMIUM — 7 dias',
        preco:   'Contacta o Dono',
        dias:    7,
        emoji:   '⭐',
        desc:    'Comandos ilimitados\nDownloads HD/320kbps\nIA com memória completa\nPrioridade de resposta\nSuporte VIP',
        btns:    [
          { text: '📲 Contratar', id: `PREMIUM_7_${ctx.senderNumber}` },
          { text: '👑 Falar Dono', id: `CTA_URL_${ownerLink}` },
        ],
      },
      {
        nome:    '💎 PREMIUM — 30 dias',
        preco:   'Contacta o Dono',
        dias:    30,
        emoji:   '💎',
        desc:    'Tudo do Premium 7 dias\n+Alugar bot em grupos\n+Comandos VIP exclusivos\n+Portal 18+ desbloqueado\n+Badge VIP permanente',
        btns:    [
          { text: '📲 Contratar', id: `PREMIUM_30_${ctx.senderNumber}` },
          { text: '👑 Falar Dono', id: `CTA_URL_${ownerLink}` },
        ],
      },
      {
        nome:    '🏆 PREMIUM — 90 dias',
        preco:   'Melhor custo/benefício',
        dias:    90,
        emoji:   '🏆',
        desc:    'Tudo do Premium 30 dias\n+Prioridade máxima\n+Sem limites em grupos\n+Suporte 24/7\n+Planos de alugar incluídos',
        btns:    [
          { text: '📲 Contratar', id: `PREMIUM_90_${ctx.senderNumber}` },
          { text: '🔗 Canal',     id: `CTA_URL_${channelUrl}` },
        ],
      },
    ];

    // Tenta Carousel
    let carouselOk = false;
    try {
      let logoImg = null;
      if (fs.existsSync(logoPath)) {
        try {
          const media = await prepareWAMessageMedia({ image: { url: logoPath } }, { upload: sock.waUploadToServer });
          logoImg = media?.imageMessage || null;
        } catch {}
      }

      const cards = planos.map(pl => {
        const nativeBtns = pl.btns.map(b => {
          if (b.id.startsWith('CTA_URL_')) {
            const u = b.id.replace('CTA_URL_', '');
            return { name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: b.text, url: u, merchant_url: u }) };
          }
          return { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: b.text, id: b.id }) };
        });
        return {
          header: logoImg ? { hasMediaAttachment: true, imageMessage: logoImg } : { hasMediaAttachment: false },
          body:   { text: `${pl.emoji} *${pl.nome}*\n\n${pl.desc}` },
          footer: { text: pl.preco + ` • ${config.bot.name} 🕸️` },
          nativeFlowMessage: { buttons: nativeBtns },
        };
      });

      const msgObj = generateWAMessageFromContent(ctx.remoteJid, {
        interactiveMessage: {
          contextInfo: { participant: ctx.senderJid },
          body:   { text: `⭐ *PLANOS PREMIUM — ${config.bot.name}*\n\nEscolhe o teu plano abaixo 👇` },
          footer: { text: `👑 ${config.owner.name} · wa.me/${ownerNum}` },
          carouselMessage: { cards },
        },
      }, { userJid: sock.user?.id, quoted: msg });

      await sock.relayMessage(ctx.remoteJid, msgObj.message, { messageId: msgObj.key.id });
      carouselOk = true;
    } catch (e) {
      console.warn('[VIP Carousel]', e.message?.slice(0, 50));
    }

    if (!carouselOk) {
      // Fallback texto
      await reply(
        `╭━━━〔 ⭐ *PLANOS PREMIUM* 〕━━━╮\n` +
        planos.map(pl =>
          `┃ ${pl.emoji} *${pl.nome}*\n` +
          pl.desc.split('\n').map(l => `┃   ${l}`).join('\n')
        ).join('\n┣━━━━━━━━━━━━━━━━━━━━━━━━┫\n') +
        `\n╰━━━━━━━━━━━━━━━━━━━━━━━━╯\n\n` +
        `📲 Contacta: wa.me/${ownerNum}\n` +
        `👁️ Canal: ${channelUrl}`
      );
    }
  });

  // ══════════════════════════════════════════════════════════
  // ══════════════════════════════════════════════════════════
  // !setprefix — muda o prefixo (só Dono, apenas 1 prefixo)
  // ══════════════════════════════════════════════════════════
  registerCase(['setprefix', 'changeprefix'], async ({
    args, isOwner, prefix, reply,
  }) => {
    if (!isOwner) return reply('🚫 Só o Dono pode mudar o prefixo do bot.');

    // Pega apenas o primeiro token — prefixo único
    const newP = args[0]?.trim();
    if (!newP) return reply(
      `⚙️ *Mudar Prefixo do Bot*\n\n` +
      `Uso: *${prefix}setprefix <novo>*\n` +
      `Ex: *${prefix}setprefix !*\n` +
      `Ex: *${prefix}setprefix $*\n` +
      `Ex: *${prefix}setprefix /*\n\n` +
      `Prefixo actual: *${prefix}*\n` +
      `_Nota: apenas 1 prefixo é aceite._`
    );

    // Validar — não aceita espaços nem caracteres de controlo
    if (/\s/.test(newP) || newP.length > 5) {
      return reply(`❌ Prefixo inválido. Use 1 a 5 caracteres sem espaços.\nEx: *!*, *$*, */*, *.*`);
    }

    await prefixManager.setPrefixes([newP]);
    botConfigCache.clear();

    return reply(
      `✅ *Prefixo alterado com sucesso!*\n\n` +
      `🔑 Novo prefixo: *${newP}*\n\n` +
      `Agora todos os comandos usam *${newP}*\n` +
      `Ex: *${newP}menu* · *${newP}play* · *${newP}ia*`
    );
  });

  // ── !prefixo — ver prefixo actual ─────────────────────────
  registerCase(['prefixo', 'prefixos', 'getprefix'], async ({ prefix, reply }) => {
    return reply(
      `🔑 *Prefixo actual: *${prefix}**\n\n` +
      `Todos os comandos começam com *${prefix}*\n` +
      `Ex: *${prefix}menu* · *${prefix}play* · *${prefix}ia*\n\n` +
      `_Só o Dono pode mudar: ${prefix}setprefix <novo>_`
    );
  });

  // ── !maiscmds — painel de mais comandos (admin/vip/dono) ───
  registerCase(['maiscmds', 'morecmds', 'advanced'], async ({
    sock, msg, ctx, prefix, isOwner, reply,
  }) => {
    const User = require('../../database/models/User');
    const u    = await User.findOne({ whatsappNumber: ctx.senderNumber }).catch(() => null);
    const isVip = u && u.isPremium && u.isPremium();
    const isAdm = ctx.isOwner || isOwner;

    if (!isAdm && !isVip) return reply('🚫 Este painel é para ADM, VIP ou Dono.');

    const sections = [];

    // Secção para todos (ADM/VIP)
    sections.push({
      title: '🔧 AVANÇADOS',
      rows: [
        { title: '🏠 Alugar Bot',     description: 'hospedar em grupos',       id: prefix + 'alugar' },
        { title: '📊 Status Aluguel', description: 'ver estado da hospedagem', id: prefix + 'statusalugar' },
        { title: '📁 Media UP',       description: 'guardar mídia no bot',      id: prefix + 'mediaup' },
        { title: '📂 Media LIST',     description: 'listar mídias guardadas',   id: prefix + 'medialist' },
        { title: '🗑️ Media DEL',     description: 'apagar mídia guardada',     id: prefix + 'mediadel' },
        { title: '⭐ VIP Planos',     description: 'ver e gerir planos',        id: prefix + 'vip' },
        { title: '🧠 Memória IA',     description: 'ver memória da IA',         id: prefix + 'aimemoria' },
        { title: '🗑️ Resetar IA',    description: 'apagar memória',            id: prefix + 'airesetar' },
        { title: '🔌 Status APIs IA', description: 'ver chaves/modelos activos',id: prefix + 'iaapis' },
        { title: '🎨 Sticker WM',     description: 'marca d\'agua dos stickers',id: prefix + 'stickerwm' },
      ],
    });

    // Secção só para Dono
    if (isAdm) {
      sections.push({
        title: '👑 DONO',
        rows: [
          { title: '📢 Broadcast',   description: 'mensagem para todos os grupos', id: prefix + 'broadcast' },
          { title: '🔑 Prefixo',     description: 'mudar prefixo global',           id: prefix + 'prefixos' },
          { title: '👥 Listar Grupos', description: 'grupos onde o bot está',       id: prefix + 'grupos' },
          { title: '📋 Stats',       description: 'estatísticas do bot',            id: prefix + 'stats' },
          { title: '🩺 Diagnóstico', description: 'estado real do bot',             id: prefix + 'diagnostico' },
          { title: '🕳️ Cmds Ocultos',description: 'portal privado',               id: prefix + 'cmdsocultos' },
        ],
      });
    }

    try {
      const { generateWAMessageFromContent } = require('@systemzero/baileys');
      const listaParams = { title: '🔧 + CMDS', sections };
      const nativeBtns = [
        { name: 'single_select', buttonParamsJson: JSON.stringify(listaParams) },
      ];
      const msgObj = generateWAMessageFromContent(ctx.remoteJid, {
        interactiveMessage: {
          body:   { text: `🔧 *MAIS COMANDOS*\n👤 ${ctx.pushName}` },
          footer: { text: config.bot.name + ' 🕸️' },
          header: { hasMediaAttachment: false },
          nativeFlowMessage: { buttons: nativeBtns },
        },
      }, { userJid: sock.user?.id, quoted: msg });
      await sock.relayMessage(ctx.remoteJid, msgObj.message, { messageId: msgObj.key.id });
    } catch {
      // Fallback texto
      const allItems = sections.flatMap(s => s.rows);
      await reply(
        `╭━━━〔 🔧 *MAIS CMDS* 〕━━━╮\n` +
        allItems.map((r,i) => `┃ ${String(i+1).padStart(2,'0')} • *${r.title}*\n┃     ${r.description}`).join('\n') +
        `\n╰━━━━━━━━━━━━━━━━━━━━━━━━╯`
      );
    }
  });
};
