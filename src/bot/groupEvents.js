/**
 * DARK BOT v5 — Group Events
 * Welcome/Goodbye por grupo + Trial 3 dias ao entrar
 * + Imagem de boas-vindas gerada com sharp (foto + número do membro)
 */
'use strict';

const config          = require('../config');
const botConfigCache  = require('./botConfigCache');
const GroupSettings   = require('../database/models/GroupSettings');
const changeThemes    = require('./changeThemes');
const { generateWelcomeImage } = require('./welcomeImage');

function fillVars(text, { userName, groupName, botName, ownerName, number } = {}) {
  return String(text || '')
    .replace(/\{user\}/gi,  `@${number}`)
    .replace(/\{nome\}/gi,  userName  || '')
    .replace(/\{grupo\}/gi, groupName || '')
    .replace(/\{bot\}/gi,   botName   || 'DARK BOT')
    .replace(/\{dono\}/gi,  ownerName || 'Dark Net')
    .trim();
}

async function ownerPv(sock, text) {
  const num = String(config.owner.number || '').replace(/\D/g, '');
  if (!num) return;
  return sock.sendMessage(`${num}@s.whatsapp.net`, { text }).catch(() => {});
}

async function handle(sock, event) {
  try {
    const { id: groupJid, participants, action } = event;
    if (!groupJid?.endsWith('@g.us')) return;

    const meta      = await sock.groupMetadata(groupJid).catch(() => null);
    const groupName = meta?.subject || 'grupo';

    // v6.82: feed live do dashboard (página Grupos). Emite para todas
    // as acções (add/remove/promote/demote), mesmo quando o bot não
    // tem welcome activo — o evento é do grupo, não do bot.
    try {
      require('./liveBroadcaster').groupEvent({
        type: action,
        group: { jid: groupJid, name: groupName },
        participants: (participants || []).map(p => ({
          jid: p,
          number: String(p).split('@')[0].replace(/\D/g, ''),
        })),
      });
    } catch (e) {}

    const botNum    = String(sock.user?.id || '').split(':')[0].split('@')[0];
    const botJids   = [sock.user?.id, sock.user?.lid, `${botNum}@s.whatsapp.net`].filter(Boolean);
    const botAdded  = action === 'add' && participants.some(p =>
      botJids.some(j => p.split(':')[0].split('@')[0] === j.split(':')[0].split('@')[0])
    );

    if (botAdded) {
      await onBotAdded(sock, groupJid, groupName, meta);
      return;
    }

    const gs = await GroupSettings.findOne({ groupJid }).lean().catch(() => null);
    for (const participant of participants) {
      const number = participant.split('@')[0].replace(/\D/g, '');
      const isBot  = botJids.some(j => j.split(':')[0].split('@')[0] === number);
      if (isBot) continue;
      if (action === 'add')    await onJoin(sock, groupJid, participant, number, groupName, gs, meta);
      if (action === 'remove') await onLeave(sock, groupJid, participant, number, groupName, gs);
    }
  } catch (e) {
    console.error('[GroupEvents]', e?.message);
  }
}

async function onBotAdded(sock, groupJid, groupName, meta) {
  // Criar GroupSettings com 3 dias de trial
  const trialEnd = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  let gs = await GroupSettings.findOne({ groupJid }).catch(() => null);
  if (!gs) {
    gs = await GroupSettings.create({
      groupJid,
      groupName,
      isHosted:        false,
      trialExpiresAt:  trialEnd,
      hostedUntil:     null,
      commandsUsedToday: 0,
      welcomeEnabled:  true,
      goodbyeEnabled:  true,
    }).catch(() => null);
  } else {
    // Reset trial se for nova entrada
    gs.trialExpiresAt = trialEnd;
    gs.groupName = groupName;
    await gs.save().catch(() => {});
  }

  const p = config.bot.prefix;
  const trialDays = 3;

  const arrival =
    `🕸️ *${config.bot.name}* chegou!\n\n` +
    `╭━━━〔 🎁 *TRIAL GRATUITO* 〕━━━╮\n` +
    `┃ ⏰ *${trialDays} dias* de acesso completo!\n` +
    `┃ 📅 Expira: *${trialEnd.toLocaleDateString('pt-PT')}*\n` +
    `┣━━━━━━━━━━━━━━━━━━━━━━━━━━┫\n` +
    `┃ 📋 *Comandos iniciais:*\n` +
    `┃  • *${p}menubtn* — menu interactivo\n` +
    `┃  • *${p}play* <música> — baixar música\n` +
    `┃  • *${p}ia* <pergunta> — IA com memória\n` +
    `┃  • *${p}alugar* — ver planos de hospedagem\n` +
    `┃  • *${p}ping* — testar o bot\n` +
    `┣━━━━━━━━━━━━━━━━━━━━━━━━━━┫\n` +
    `┃ 💡 Após o trial: *${p}alugar <dias>*\n` +
    `┃ 👑 Suporte: wa.me/${config.owner.number}\n` +
    `╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯`;

  await sock.sendMessage(groupJid, { text: arrival }).catch(() => {});

  // Notificar o dono
  const admins = (meta?.participants || [])
    .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
    .map(p => p.id.split('@')[0]).join(', ');

  await ownerPv(sock,
    `🆕 *Bot adicionado!*\n\n` +
    `📋 Grupo: *${groupName}*\n` +
    `🔑 JID: \`${groupJid}\`\n` +
    `👑 Admins: ${admins || '?'}\n` +
    `🎁 Trial: *${trialDays} dias* activos\n\n` +
    `Para hospedar permanentemente:\n` +
    `*${p}alugar ${groupJid} 30*`
  );
}

async function onJoin(sock, groupJid, participantJid, number, groupName, gs, meta) {
  if (gs?.welcomeEnabled === false) return;
  const globalOn = await botConfigCache.get('welcome_enabled', true).catch(() => true);
  if (!globalOn) return;

  // Número ordinal do membro no grupo
  const memberCount = (meta?.participants?.length) || 0;

  // Obter tema activo para a imagem
  let themeName = 'dark', themeEmoji = '🕸️';
  try {
    const tn = await botConfigCache.get('active_theme', 'dark').catch(() => 'dark');
    const t  = changeThemes.getTheme(tn || 'dark');
    themeName  = t.name;
    themeEmoji = t.emoji;
  } catch {}

  // Foto de perfil
  let ppUrl = null;
  try { ppUrl = await sock.profilePictureUrl(participantJid, 'image').catch(() => null); } catch {}

  // Push name do membro
  const pushName = number; // fallback se não tiver nome

  // Caption do welcome (usa template custom ou padrão)
  const t = changeThemes.getTheme(themeName);
  const f = t.frame;
  const defaultMsg =
    `${f[0]}${f[4].repeat(22)}${f[1]}\n` +
    `${f[5]}  ${t.icon} *BEM-VINDO(A)!*  ${f[5]}\n` +
    `${f[2]}${f[4].repeat(22)}${f[3]}\n\n` +
    `${t.bullet} 👤 @${number}\n` +
    `${t.bullet} 🎉 Entrou em *${groupName}*\n` +
    `${t.bullet} 👥 Membro nº *${memberCount}*\n` +
    `${t.bullet} 🤖 *${config.bot.name}*\n\n` +
    `> ${t.vibe}`;

  const template = gs?.customWelcomeMsg || defaultMsg;
  const caption = fillVars(template, {
    userName: number, groupName, botName: config.bot.name,
    ownerName: config.owner.name, number,
  });

  // ── Tentar gerar imagem com sharp ──────────────────────────────────
  // Se imagem custom definida no grupo → usa ela
  const welcomeImg = gs?.welcomeWithMedia;
  if (welcomeImg) {
    await sock.sendMessage(groupJid, {
      image: { url: welcomeImg }, caption, mentions: [participantJid],
    }).catch(() => {});
    return;
  }

  // Gera imagem com foto de perfil + número de membro
  const welcomeImageEnabled = await botConfigCache.get('welcome_image_enabled', true).catch(() => true);

  if (welcomeImageEnabled !== false) {
    try {
      const imgBuf = await generateWelcomeImage({
        profilePicUrl: ppUrl,
        memberName:    number,
        memberNum:     memberCount,
        groupName,
        themeName,
        themeEmoji,
        botName:       config.bot.name,
      });
      if (imgBuf) {
        await sock.sendMessage(groupJid, {
          image: imgBuf, caption, mentions: [participantJid],
        });
        return;
      }
    } catch (e) {
      console.warn('[Welcome Image]', e.message);
    }
  }

  // Fallback: só texto
  await sock.sendMessage(groupJid, { text: caption, mentions: [participantJid] }).catch(() => {});
}

async function onLeave(sock, groupJid, participantJid, number, groupName, gs) {
  if (gs?.goodbyeEnabled === false) return;
  const globalOn = await botConfigCache.get('welcome_enabled', true).catch(() => true);
  if (!globalOn) return;

  const defaultMsg = `👋 @${number} saiu de *${groupName}*. Até à próxima!`;
  const template = gs?.customGoodbyeMsg || defaultMsg;
  const text = fillVars(template, {
    userName: number, groupName, botName: config.bot.name,
    ownerName: config.owner.name, number,
  });
  await sock.sendMessage(groupJid, { text, mentions: [participantJid] }).catch(() => {});
}

module.exports = { handle };
