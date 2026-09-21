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

// ── ANTI-BAN: saudação combinada em tempestade de entradas (v9.13) ──
// Convidar membros em massa (ou um link partilhado que rebenta) fazia o
// bot disparar um welcome com IMAGEM por cada entrada — assinatura
// clássica de automação. Agora: 1 welcome por grupo por janela de 40s;
// os que entram durante a janela são agregados e saem juntos num único
// cartão de TEXTO combinado, 12s depois (debounce) — uma mensagem em
// vez de dez. Menciona todos (máx. 6 escritos, resto «… e mais N»).
const WEL_JANELA_MS       = Math.max(1, Number(process.env.WEL_JANELA_MS) || 40000);
const WEL_COMBO_DEBOUNCE  = Math.max(1, Number(process.env.WEL_COMBO_DEBOUNCE) || 12000);
const WEL_COMBO_MAX_NOMES = 6;
const _ultimoWel = new Map();   // groupJid → ts do último welcome enviado
const _comboWel  = new Map();   // groupJid → { timer, pessoas:[{jid,num}], grupo }

function _comboEncaixa(sock, groupJid, participantJid, number, groupName) {
  let combo = _comboWel.get(groupJid);
  if (!combo) {
    combo = { timer: null, pessoas: [], grupo: groupName };
    _comboWel.set(groupJid, combo);
  }
  if (!combo.pessoas.some((p) => p.jid === participantJid)) {
    combo.pessoas.push({ jid: participantJid, num: number });
  }
  if (!combo.timer) {
    combo.timer = setTimeout(() => { _comboDispara(sock, groupJid).catch(() => {}); }, WEL_COMBO_DEBOUNCE);
    if (combo.timer.unref) combo.timer.unref();
  }
}

async function _comboDispara(sock, groupJid) {
  const combo = _comboWel.get(groupJid);
  _comboWel.delete(groupJid);
  if (!combo || !combo.pessoas.length) return;
  const mostrados = combo.pessoas.slice(0, WEL_COMBO_MAX_NOMES);
  const resto = combo.pessoas.length - mostrados.length;
  const nomes = mostrados.map((p) => `@${p.num}`).join(' ');
  let t;
  try { t = changeThemes.getTheme(await botConfigCache.get('active_theme', 'dark').catch(() => 'dark')); } catch { t = null; }
  const icone = t?.icon || '🕸️';
  const nomeBot = config.bot?.name || 'DARK BOT';
  const texto =
    `${icone} *BEM-VINDOS(AS)!* 🎉\n\n` +
    `👥 ${nomes}${resto > 0 ? ` … e mais ${resto}` : ''}\n` +
    `🎉 entraram juntos em *${combo.grupo}*\n\n` +
    `🕷️ uma saudação só para não parecer robô de spam · *${nomeBot}*`;
  _ultimoWel.set(groupJid, Date.now());
  await sock.sendMessage(groupJid, {
    text: texto,
    mentions: mostrados.map((p) => p.jid),
  }).catch(() => {});
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

    // v7.47 incoming-cases: anti-fobados bane DDIs na blacklist ANTES do
    // welcome (banidos não recebem boas-vindas); auto-apresentação arma o
    // prazo de 5 min para quem entrou e cancela para quem saiu.
    let banidosFoba = [];
    if (action === 'add') {
      try { banidosFoba = await require('./antiFoba').onJoin(sock, groupJid, participants, meta) || []; } catch {}
      try { await require('./autoApresentar').onParticipantsUpdate(sock, groupJid, participants, action, meta); } catch {}
    }
    if (action === 'remove') {
      try { await require('./autoApresentar').onParticipantsUpdate(sock, groupJid, participants, action, meta); } catch {}
    }

    for (const participant of participants) {
      const number = participant.split('@')[0].replace(/\D/g, '');
      const isBot  = botJids.some(j => j.split(':')[0].split('@')[0] === number);
      if (isBot) continue;
      if (banidosFoba.includes(participant)) continue;
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

  // v9.13 anti-ban: tempestade de entradas → agrega em saudação
  // combinada em vez de 1 imagem por cabeça (assinatura de automação)
  const agora = Date.now();
  if (agora - (_ultimoWel.get(groupJid) || 0) < WEL_JANELA_MS) {
    _comboEncaixa(sock, groupJid, participantJid, number, groupName);
    return;
  }
  _ultimoWel.set(groupJid, agora);

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

  const template = gs?.customWelcomeMsg || gs?.customWelcome || defaultMsg;
  const caption = fillVars(template, {
    userName: number, groupName, botName: config.bot.name,
    ownerName: config.owner.name, number,
  });

  // ── Tentar gerar imagem com sharp ──────────────────────────────────
  // Se imagem custom definida no grupo → usa ela
  const welcomeImg = gs?.welcomeWithMedia;
  if (welcomeImg) {
    try {
      if (String(welcomeImg).startsWith('local:')) {
        const mediaHandler = require('./mediaHandler');
        const buf = await mediaHandler.fetchBuffer(welcomeImg);
        if (buf?.length > 200) {
          await sock.sendMessage(groupJid, {
            image: buf, caption, mentions: [participantJid],
          }).catch(() => {});
          return;
        }
      } else {
        await sock.sendMessage(groupJid, {
          image: { url: welcomeImg }, caption, mentions: [participantJid],
        }).catch(() => {});
        return;
      }
    } catch (e) { console.warn('[Welcome custom media]', e.message); }
  }

  // ── v8.4 WELCM3: GIF de super animação (arte IA + foto perfil) ─────
  if (gs?.welcm3) {
    try {
      const wa = require('./welcomeArt');
      const bio = ['🎞️WELCM3 — bem-vindo(a)!', `👤 @${number} · membro nº ${memberCount}`, `🎉 entrou em ${groupName}`];
      const mp4 = await wa.artGif({
        profilePicUrl: ppUrl, name: number, sub1: `Entrou em ${groupName}`.slice(0, 44),
        sub2: `Membro nº ${memberCount} 🕸️`, footer: `🕸️ ${config.bot.name} · WELCM3`, kind: 'welcome', frames: 12,
      });
      if (mp4?.length > 2048) {
        await sock.sendMessage(groupJid, { video: mp4, gifPlayback: true, mimetype: 'video/mp4', caption, mentions: [participantJid] }).catch(() => {});
        return;
      }
    } catch (e) { console.warn('[Welcome GIF]', e.message); }
  }
  // ── v8.4 WELCOME2: fotografia IA de entrada (PIP) ────────────────────
  if (gs?.welcome2) {
    try {
      const wa = require('./welcomeArt');
      const png = await wa.artCard({
        profilePicUrl: ppUrl, name: number, sub1: `Entrou em ${groupName}`.slice(0, 44),
        sub2: `Membro nº ${memberCount} 🕸️`, footer: `🕸️ ${config.bot.name} · WELCOME2`, kind: 'welcome',
      });
      if (png?.length > 2048) {
        await sock.sendMessage(groupJid, { image: png, caption, mentions: [participantJid] }).catch(() => {});
        return;
      }
    } catch (e) { console.warn('[Welcome2 art]', e.message); }
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
  // Aceita goodbyeEnabled (novo) e o campo legado `goodbye`
  if (gs?.goodbyeEnabled === false) return;
  if (gs?.goodbye === false && gs?.goodbyeEnabled == null) return;
  const globalOn = await botConfigCache.get('welcome_enabled', true).catch(() => true);
  if (!globalOn) return;

  // Fallback legado: customGoodbye (sem Msg)
  const defaultMsg = `👋 @${number} saiu de *${groupName}*. Até à próxima!`;
  const template = gs?.customGoodbyeMsg || gs?.customGoodbye || defaultMsg;
  const text = fillVars(template, {
    userName: number, groupName, botName: config.bot.name,
    ownerName: config.owner.name, number,
  });

  // Foto custom de despedida (se definida com !fotosaiu)
  const byeImg = gs?.goodbyeWithMedia;
  if (byeImg) {
    try {
      if (String(byeImg).startsWith('local:')) {
        const mediaHandler = require('./mediaHandler');
        const buf = await mediaHandler.fetchBuffer(byeImg);
        if (buf?.length > 200) {
          await sock.sendMessage(groupJid, {
            image: buf, caption: text, mentions: [participantJid],
          }).catch(() => {});
          return;
        }
      } else {
        await sock.sendMessage(groupJid, {
          image: { url: byeImg }, caption: text, mentions: [participantJid],
        }).catch(() => {});
        return;
      }
    } catch (e) { console.warn('[Goodbye Image]', e.message); }
  }

  await sock.sendMessage(groupJid, { text, mentions: [participantJid] }).catch(() => {});
}

module.exports = { handle, _welDebug: { _ultimoWel, _comboWel, WEL_JANELA_MS, WEL_COMBO_DEBOUNCE, _comboEncaixa, _comboDispara } };
