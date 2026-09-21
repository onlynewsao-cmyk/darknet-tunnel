/**
 * DARK BOT v11.2.4 — Group Events
 * Welcome/Goodbye + Trial + cartões (nome real, PP nítida, caption limpa, X9 pro)
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
    .replace(/\{nome\}/gi,  userName  || number || '')
    .replace(/\{grupo\}/gi, groupName || '')
    .replace(/\{bot\}/gi,   botName   || 'DARK BOT')
    .replace(/\{dono\}/gi,  ownerName || 'Dark Net')
    .trim();
}

/**
 * v11.2.3 — Baileys moderno manda participants como OBJECTOS
 *   { id, lid?, phoneNumber?, admin?, notify?, name? }  (Contact / GroupParticipant)
 * e NÃO como strings "244…@s.whatsapp.net".
 *
 * Devolve sempre { jid, pnJid, number, raw, notify?, name? } com jid preferindo o PN.
 */
function normalizeParticipant(p) {
  if (!p) return null;
  if (typeof p === 'string') {
    const jid = p;
    const number = String(jid).split(':')[0].split('@')[0].replace(/\D/g, '');
    return {
      jid,
      pnJid: jid.includes('@s.whatsapp.net') ? jid : (number ? number + '@s.whatsapp.net' : jid),
      number,
      raw: p,
    };
  }
  if (typeof p === 'object') {
    const id = p.id || p.jid || '';
    const lid = p.lid || (String(id).includes('@lid') ? id : '');
    const phone = p.phoneNumber || p.pn || '';
    let pnJid = '';
    if (typeof phone === 'string' && phone.includes('@')) pnJid = phone;
    else if (typeof phone === 'string' && phone.replace(/\D/g, '').length >= 8) pnJid = phone.replace(/\D/g, '') + '@s.whatsapp.net';
    else if (typeof id === 'string' && id.includes('@s.whatsapp.net')) pnJid = id;
    const jid = pnJid || id || lid || '';
    let number = '';
    if (pnJid) number = pnJid.split(':')[0].split('@')[0].replace(/\D/g, '');
    if (!number && phone) number = String(phone).replace(/\D/g, '');
    if (!number && id && !String(id).includes('@lid')) number = String(id).split(':')[0].split('@')[0].replace(/\D/g, '');
    return {
      jid,
      pnJid: pnJid || jid,
      number,
      lid,
      notify: p.notify || p.pushName || '',
      name: p.name || p.verifiedName || '',
      raw: p,
    };
  }
  return null;
}

function jidNum(j) {
  return String(j || '').split(':')[0].split('@')[0].replace(/\D/g, '');
}

/** True se o texto parece só um número de telefone (não um nome). */
function looksLikePhone(s) {
  const t = String(s || '').trim();
  if (!t) return true;
  const digits = t.replace(/\D/g, '');
  if (digits.length >= 8 && digits.length >= t.replace(/[\s+\-().]/g, '').length * 0.8) return true;
  return false;
}

function prettyName(s) {
  let n = String(s || '').trim();
  if (!n) return '';
  if (n === n.toLowerCase()) n = n.replace(/\b\w/g, c => c.toUpperCase());
  return n.slice(0, 40);
}

/**
 * Resolve o nome legível do membro (nunca o número se houver alternativa).
 * Ordem: notify/name do participant → meta.participants → sock.contacts
 * → GroupMemberActivity → Economy → fallback número.
 */
async function resolveDisplayName(sock, { number, mentionJid, part, meta } = {}) {
  const tryName = (v) => {
    const s = String(v || '').trim();
    if (!s || looksLikePhone(s)) return '';
    return prettyName(s);
  };

  // 1) do objecto do evento
  let n = tryName(part?.notify) || tryName(part?.name) || tryName(part?.raw?.notify) || tryName(part?.raw?.name) || tryName(part?.raw?.verifiedName);
  if (n) return n;

  // 2) meta do grupo (participants Contact)
  try {
    const list = meta?.participants || [];
    const hit = list.find((x) => {
      const ids = [x.id, x.phoneNumber, x.lid, x.jid].filter(Boolean).map(String);
      const nums = ids.map(jidNum).filter(Boolean);
      return (mentionJid && ids.includes(mentionJid))
        || (part?.jid && ids.includes(part.jid))
        || (part?.pnJid && ids.includes(part.pnJid))
        || (number && nums.includes(String(number)));
    });
    n = tryName(hit?.notify) || tryName(hit?.name) || tryName(hit?.verifiedName);
    if (n) return n;
  } catch {}

  // 3) store de contactos Baileys (se existir)
  try {
    const cands = [mentionJid, part?.pnJid, part?.jid, part?.lid, number && `${number}@s.whatsapp.net`].filter(Boolean);
    const maps = [sock?.contacts, sock?.store?.contacts, sock?.contactCache].filter(Boolean);
    for (const map of maps) {
      for (const j of cands) {
        const c = (typeof map.get === 'function' ? map.get(j) : map[j]) || null;
        if (!c) continue;
        n = tryName(c.notify) || tryName(c.name) || tryName(c.verifiedName) || tryName(c.pushName);
        if (n) return n;
      }
    }
  } catch {}

  // 4) actividade recente / economy (DB)
  if (number) {
    try {
      const GMA = require('../database/models/GroupMemberActivity');
      const row = await GMA.findOne({ memberNumber: String(number) }).sort({ lastMessageAt: -1 }).lean().catch(() => null);
      n = tryName(row?.pushName);
      if (n) return n;
    } catch {}
    try {
      const Economy = require('../database/models/Economy');
      const eco = await Economy.findOne({
        $or: [
          { whatsappNumber: String(number) },
          { number: String(number) },
        ],
      }).lean().catch(() => null);
      n = tryName(eco?.name) || tryName(eco?.nickname);
      if (n) return n;
    } catch {}
  }

  // fallback: número (só se não houver nome)
  return String(number || 'Membro');
}

// ── ANTI-BAN: saudação combinada em tempestade de entradas (v9.13) ──
const WEL_JANELA_MS       = Math.max(1, Number(process.env.WEL_JANELA_MS) || 40000);
const WEL_COMBO_DEBOUNCE  = Math.max(1, Number(process.env.WEL_COMBO_DEBOUNCE) || 12000);
const WEL_COMBO_MAX_NOMES = 6;
const _ultimoWel = new Map();   // groupJid → ts do último welcome enviado
const _comboWel  = new Map();   // groupJid → { timer, pessoas:[{jid,num,name}], grupo }

function _comboEncaixa(sock, groupJid, participantJid, number, groupName, displayName) {
  let combo = _comboWel.get(groupJid);
  if (!combo) {
    combo = { timer: null, pessoas: [], grupo: groupName };
    _comboWel.set(groupJid, combo);
  }
  if (!combo.pessoas.some((p) => p.jid === participantJid)) {
    combo.pessoas.push({ jid: participantJid, num: number, name: displayName || number });
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
  const nomes = mostrados.map((p) => {
    const label = p.name && !looksLikePhone(p.name) && p.name !== p.num
      ? `*${p.name}* (@${p.num})`
      : `@${p.num}`;
    return label;
  }).join(', ');
  const nomeBot = config.bot?.name || 'DARK BOT';
  const texto =
    `🎉 *Bem-vindos(as)!*\n\n` +
    `${nomes}${resto > 0 ? ` … e mais ${resto}` : ''}\n` +
    `entraram juntos em *${combo.grupo}*.\n\n` +
    `— ${nomeBot}`;
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

/** X9 profissional (sem one-liner amador). */
function buildX9Text(action, number, displayName) {
  const verbs = {
    add:     { icon: '➕', label: 'Entrou no grupo' },
    remove:  { icon: '➖', label: 'Saiu do grupo' },
    promote: { icon: '⬆️', label: 'Promovido a administrador' },
    demote:  { icon: '⬇️', label: 'Removido da administração' },
  };
  const v = verbs[action] || { icon: '•', label: action };
  const showName = displayName && !looksLikePhone(displayName) && String(displayName) !== String(number);
  const who = showName
    ? `*${displayName}*\n@${number}`
    : `@${number || 'membro'}`;
  return (
    `📡 *X9 · actividade*\n` +
    `${v.icon} ${v.label}\n` +
    `${who}`
  );
}

async function handle(sock, event) {
  try {
    const { id: groupJid, action } = event;
    if (!groupJid?.endsWith('@g.us')) return;

    // v11.2.3: normaliza participants (string LEGACY ou objecto Baileys actual)
    const rawParts = Array.isArray(event.participants) ? event.participants : [];
    const parts = rawParts.map(normalizeParticipant).filter(Boolean);
    if (!parts.length && rawParts.length) {
      console.warn('[GroupEvents] participants ilegíveis:', typeof rawParts[0], JSON.stringify(rawParts[0]).slice(0, 120));
    }

    const meta      = await sock.groupMetadata(groupJid).catch(() => null);
    const groupName = meta?.subject || 'grupo';

    // v6.82: feed live do dashboard (página Grupos).
    try {
      require('./liveBroadcaster').groupEvent({
        type: action,
        group: { jid: groupJid, name: groupName },
        participants: parts.map(p => ({ jid: p.jid, number: p.number })),
      });
    } catch (e) {}

    const botNum  = jidNum(sock.user?.id);
    const botNums = new Set(
      [sock.user?.id, sock.user?.lid, sock.user?.phoneNumber, botNum && (botNum + '@s.whatsapp.net')]
        .filter(Boolean)
        .map(jidNum)
        .filter(Boolean),
    );

    const botAdded = action === 'add' && parts.some(p => p.number && botNums.has(p.number));
    if (botAdded) {
      await onBotAdded(sock, groupJid, groupName, meta);
      return;
    }

    const gs = await GroupSettings.findOne({ groupJid }).lean().catch(() => null);

    // anti-fobados / auto-apresentação (aceitam string OU objecto)
    let banidosFoba = [];
    if (action === 'add') {
      try { banidosFoba = await require('./antiFoba').onJoin(sock, groupJid, rawParts, meta) || []; } catch {}
      try { await require('./autoApresentar').onParticipantsUpdate(sock, groupJid, rawParts, action, meta); } catch {}
    }
    if (action === 'remove') {
      try { await require('./autoApresentar').onParticipantsUpdate(sock, groupJid, rawParts, action, meta); } catch {}
    }
    const banidosSet = new Set((banidosFoba || []).map(b => {
      if (typeof b === 'string') return b;
      const n = normalizeParticipant(b);
      return n?.jid || n?.pnJid || '';
    }).filter(Boolean));

    for (const p of parts) {
      if (!p.jid && !p.pnJid) continue;
      if (p.number && botNums.has(p.number)) continue;
      const mentionJid = p.pnJid || p.jid;
      const actJid = p.jid || p.pnJid;
      if (banidosSet.has(p.jid) || banidosSet.has(p.pnJid) || banidosSet.has(actJid)) continue;

      const number = p.number || jidNum(mentionJid);
      const displayName = await resolveDisplayName(sock, { number, mentionJid, part: p, meta });

      if (action === 'add') {
        await onJoin(sock, groupJid, mentionJid, number, groupName, gs, meta, displayName);
        // auto-ADM
        try {
          const autos = (gs?.autoAdmins || []).map(n => String(n).replace(/\D/g, ''));
          if (p.number && autos.includes(p.number)) {
            await sock.groupParticipantsUpdate(groupJid, [actJid], 'promote').catch(() => {});
            await sock.sendMessage(groupJid, {
              text: `🤖 Auto-ADM: @${p.number} promovido.`,
              mentions: [mentionJid],
            }).catch(() => {});
          }
        } catch {}
      }
      if (action === 'remove') {
        await onLeave(sock, groupJid, mentionJid, number, groupName, gs, displayName);
      }
      // X9 profissional
      if (gs?.x9 && ['add', 'remove', 'promote', 'demote'].includes(action)) {
        try {
          await sock.sendMessage(groupJid, {
            text: buildX9Text(action, number, displayName),
            mentions: number ? [mentionJid] : [],
          }).catch(() => {});
        } catch {}
      }
    }
  } catch (e) {
    console.error('[GroupEvents]', e?.message || e);
  }
}

async function onBotAdded(sock, groupJid, groupName, meta) {
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

  const admins = (meta?.participants || [])
    .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
    .map(p => String(p.id || '').split('@')[0]).join(', ');

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

async function onJoin(sock, groupJid, participantJid, number, groupName, gs, meta, displayName) {
  if (gs?.welcomeEnabled === false) return;
  const globalOn = await botConfigCache.get('welcome_enabled', true).catch(() => true);
  if (!globalOn) return;

  const memberName = (displayName && !looksLikePhone(displayName)) ? displayName : String(number || 'Membro');

  // v9.13 anti-ban: tempestade de entradas → agrega
  const agora = Date.now();
  if (agora - (_ultimoWel.get(groupJid) || 0) < WEL_JANELA_MS) {
    _comboEncaixa(sock, groupJid, participantJid, number, groupName, memberName);
    return;
  }
  _ultimoWel.set(groupJid, agora);

  const memberCount = (meta?.participants?.length) || 0;

  let themeName = 'dark';
  try {
    const tn = await botConfigCache.get('active_theme', 'dark').catch(() => 'dark');
    const t  = changeThemes.getTheme(tn || 'dark');
    themeName = t?.name || tn || 'dark';
  } catch {}

  // Foto de perfil
  let ppUrl = null;
  try { ppUrl = await sock.profilePictureUrl(participantJid, 'image').catch(() => null); } catch {}

  // Caption limpa (sem molduras/vibe de tema) — custom do grupo mantém-se
  const defaultMsg =
    `🎉 *Bem-vindo(a)!*\n\n` +
    `👤 @${number}\n` +
    (memberName && memberName !== String(number) ? `✨ *${memberName}*\n` : '') +
    `🏠 Entrou em *${groupName}*\n` +
    `👥 Membro nº *${memberCount}*\n\n` +
    `— ${config.bot.name}`;

  const template = gs?.customWelcomeMsg || gs?.customWelcome || defaultMsg;
  const caption = fillVars(template, {
    userName: memberName, groupName, botName: config.bot.name,
    ownerName: config.owner.name, number,
  });

  // Media custom do grupo
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

  // WELCM3 — GIF
  if (gs?.welcm3) {
    try {
      const wa = require('./welcomeArt');
      const mp4 = await wa.artGif({
        profilePicUrl: ppUrl,
        name: memberName,
        sub1: `Entrou em ${groupName}`.slice(0, 44),
        sub2: `Membro nº ${memberCount}`,
        footer: `${config.bot.name}`,
        kind: 'welcome',
        frames: 12,
      });
      if (mp4?.length > 2048) {
        await sock.sendMessage(groupJid, {
          video: mp4, gifPlayback: true, mimetype: 'video/mp4',
          caption, mentions: [participantJid],
        }).catch(() => {});
        return;
      }
    } catch (e) { console.warn('[Welcome GIF]', e.message); }
  }

  // WELCOME2 — cartão IA
  if (gs?.welcome2) {
    try {
      const wa = require('./welcomeArt');
      const png = await wa.artCard({
        profilePicUrl: ppUrl,
        name: memberName,
        sub1: `Entrou em ${groupName}`.slice(0, 44),
        sub2: `Membro nº ${memberCount}`,
        footer: `${config.bot.name}`,
        kind: 'welcome',
      });
      if (png?.length > 2048) {
        await sock.sendMessage(groupJid, {
          image: png, caption, mentions: [participantJid],
        }).catch(() => {});
        return;
      }
    } catch (e) { console.warn('[Welcome2 art]', e.message); }
  }

  // Imagem clássica (foto + nome)
  const welcomeImageEnabled = await botConfigCache.get('welcome_image_enabled', true).catch(() => true);

  if (welcomeImageEnabled !== false) {
    try {
      const imgBuf = await generateWelcomeImage({
        profilePicUrl: ppUrl,
        memberName,
        memberNum:     memberCount,
        groupName,
        themeName,
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

  await sock.sendMessage(groupJid, { text: caption, mentions: [participantJid] }).catch(() => {});
}

async function onLeave(sock, groupJid, participantJid, number, groupName, gs, displayName) {
  if (gs?.goodbyeEnabled === false) return;
  if (gs?.goodbye === false && gs?.goodbyeEnabled == null) return;
  const globalOn = await botConfigCache.get('welcome_enabled', true).catch(() => true);
  if (!globalOn) return;

  const memberName = (displayName && !looksLikePhone(displayName)) ? displayName : String(number || 'Membro');

  const defaultMsg = memberName && memberName !== String(number)
    ? `👋 *${memberName}* (@${number}) saiu de *${groupName}*. Até à próxima!`
    : `👋 @${number} saiu de *${groupName}*. Até à próxima!`;
  const template = gs?.customGoodbyeMsg || gs?.customGoodbye || defaultMsg;
  const text = fillVars(template, {
    userName: memberName, groupName, botName: config.bot.name,
    ownerName: config.owner.name, number,
  });

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

module.exports = {
  handle,
  normalizeParticipant,
  resolveDisplayName,
  buildX9Text,
  _welDebug: { _ultimoWel, _comboWel, WEL_JANELA_MS, WEL_COMBO_DEBOUNCE, _comboEncaixa, _comboDispara },
};
