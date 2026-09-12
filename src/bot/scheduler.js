const Schedule = require('../database/models/Schedule');
const GroupSettings = require('../database/models/GroupSettings');
const GroupMemberActivity = require('../database/models/GroupMemberActivity');
const mediaHandler = require('./mediaHandler');
const { getBot } = require('./whatsapp');
const ai = require('./ai');

let interval = null;
let lastInactivitySweep = 0;
const INACTIVITY_SWEEP_MS = 6 * 60 * 60 * 1000; // 6h

function start() {
  if (interval) return;
  interval = setInterval(tick, 30000); // checa a cada 30s
  console.log('⏰ Scheduler iniciado');
}

async function tick() {
  try {
    const now = new Date();
    const due = await Schedule.find({ scheduledFor: { $lte: now }, sent: false });
    for (const item of due) await send(item);

    const recurring = await Schedule.find({ repeat: { $ne: 'none' }, sent: true });
    for (const item of recurring) {
      const last = item.lastSentAt || item.scheduledFor;
      const next = nextRunAt(last, item.repeat);
      if (next && next <= now) await send(item, true);
    }

    if (Date.now() - lastInactivitySweep > INACTIVITY_SWEEP_MS) {
      lastInactivitySweep = Date.now();
      runDarkSideGroupAutomation().catch(e => console.error('DarkSide automation:', e.message));
    }
  } catch (err) { console.error('Scheduler tick:', err); }
}

async function send(item, recurring = false) {
  const bot = getBot();
  if (!bot.sock || bot.connectionStatus !== 'connected') return;
  try {
    if (item.mediaUrl && item.mediaType) {
      const buf = await mediaHandler.fetchBuffer(item.mediaUrl);
      const payload = item.mediaType === 'image' || item.mediaType === 'gif' ? { image: buf, caption: item.message }
        : item.mediaType === 'video' ? { video: buf, caption: item.message }
        : item.mediaType === 'audio' ? { audio: buf, mimetype: 'audio/mp4' }
        : { text: item.message };
      await bot.sock.sendMessage(item.targetJid, payload);
    } else {
      await bot.sock.sendMessage(item.targetJid, { text: item.message });
    }
    item.sent = true;
    item.lastSentAt = new Date();
    await item.save();
    bot.log('success', `📅 Agendamento enviado: ${item.title}`);
  } catch (err) {
    bot.log('error', `Agendamento falhou: ${err.message}`);
  }
}

function nextRunAt(last, repeat) {
  const d = new Date(last);
  switch (repeat) {
    case 'daily': d.setDate(d.getDate() + 1); break;
    case 'weekly': d.setDate(d.getDate() + 7); break;
    case 'monthly': d.setMonth(d.getMonth() + 1); break;
    default: return null;
  }
  return d;
}

async function runDarkSideGroupAutomation() {
  const bot = getBot();
  const sock = bot.sock;
  if (!sock || bot.connectionStatus !== 'connected') return;

  const groups = await GroupSettings.find({ $or: [{ inactiveEnabled: true }, { idleNudgeEnabled: true }] }).limit(250);
  for (const gs of groups) {
    try {
      await maybeNudgeIdleGroup(sock, gs);
      await maybeHandleInactiveMembers(sock, gs);
    } catch (e) {
      console.error('[DarkSideGroupAutomation]', gs.groupJid, e.message);
    }
  }
}

async function maybeNudgeIdleGroup(sock, gs) {
  if (!gs.idleNudgeEnabled || !gs.idleNudgeExplicit) return;
  const hours = Math.max(1, Number(gs.idleNudgeHours) || 24);
  const last = gs.lastActivity ? new Date(gs.lastActivity).getTime() : 0;
  if (!last || Date.now() - last < hours * 3600000) return;
  if (gs.lastIdleNudgeAt && Date.now() - new Date(gs.lastIdleNudgeAt).getTime() < hours * 3600000) return;

  const meta = await sock.groupMetadata(gs.groupJid);
  const mentions = meta.participants.map(p => p.id);
  const desc = gs.rulesText || meta.desc || 'grupo sem descrição definida';
  let motivation = '';
  try {
    motivation = await ai.chat(
      `O grupo de WhatsApp ficou parado por ${hours}h. Crie uma mensagem curta de reativação, estilo Dark Side Engine, mencionando respeito às regras e motivando conversa. Nome: ${meta.subject}. Descrição/regras: ${desc}`,
      'Português, máximo 900 caracteres, tom energético e respeitoso.'
    );
  } catch (e) {}
  const text = `⚡ *DARK SIDE ENGINE — GRUPO PARADO*\n\n${motivation || 'A energia do grupo ficou silenciosa, mas o motor ainda está ligado. Vamos puxar assunto, partilhar ideias e manter a comunidade viva com respeito.'}\n\n📜 *Regras/descrição:*\n${String(desc).slice(0, 1200)}\n\n` + mentions.map(j => '@' + j.split('@')[0]).join(' ');
  await sock.sendMessage(gs.groupJid, { text, mentions }).catch(() => {});
  gs.lastIdleNudgeAt = new Date();
  await gs.save().catch(() => {});
}

async function maybeHandleInactiveMembers(sock, gs) {
  if (!gs.inactiveEnabled) return;
  const warnDays = Math.max(1, Number(gs.inactiveWarnDays) || 7);
  const banDays = Math.max(warnDays + 1, Number(gs.inactiveBanDays) || 30);
  const now = Date.now();
  const warnCutoff = new Date(now - warnDays * 86400000);
  const banCutoff = new Date(now - banDays * 86400000);
  const meta = await sock.groupMetadata(gs.groupJid);
  const memberSet = new Set(meta.participants.map(p => p.id));
  const botCanBan = meta.participants.some(p => {
    const botIds = [sock.user?.id, sock.user?.lid, sock.user?.jid].map(x => String(x || '').split(':')[0].split('@')[0]);
    const n = String(p.id || '').split(':')[0].split('@')[0];
    return botIds.includes(n) && (p.admin === 'admin' || p.admin === 'superadmin');
  });

  const candidates = await GroupMemberActivity.find({ groupJid: gs.groupJid, lastMessageAt: { $lt: warnCutoff } }).limit(120);
  const warnList = [];
  const banList = [];

  for (const rec of candidates) {
    if (!memberSet.has(rec.memberJid)) continue;
    const isAdmin = meta.participants.some(p => p.id === rec.memberJid && (p.admin === 'admin' || p.admin === 'superadmin'));
    if (isAdmin) continue;

    if (gs.inactiveAction === 'ban' && rec.lastMessageAt < banCutoff) {
      if (!rec.lastBannedInactiveAt || now - new Date(rec.lastBannedInactiveAt).getTime() > 7 * 86400000) banList.push(rec);
    } else {
      if (!rec.lastWarnedInactiveAt || now - new Date(rec.lastWarnedInactiveAt).getTime() > 3 * 86400000) warnList.push(rec);
    }
  }

  if (warnList.length && gs.inactiveNotifyGroup) {
    const mentions = warnList.map(r => r.memberJid);
    const text = `⚠️ *AVISO DE INATIVIDADE*\n\nOs membros abaixo estão há ${warnDays}+ dia(s) sem interagir. Participem para evitar remoção quando a regra de ban estiver ativa.\n\n` + mentions.map((j, i) => `${i + 1}. @${j.split('@')[0]}`).join('\n');
    await sock.sendMessage(gs.groupJid, { text, mentions }).catch(() => {});
  }

  for (const rec of warnList) {
    if (gs.inactiveNotifyPv) {
      await sock.sendMessage(rec.memberJid, { text: `⚠️ Você está inativo(a) no grupo *${meta.subject}* há ${warnDays}+ dia(s).\n\nVolte a participar para não ser removido(a).\n\n⚡ Dark Side Engine` }).catch(() => {});
    }
    rec.lastWarnedInactiveAt = new Date();
    await rec.save().catch(() => {});
  }

  if (banList.length && botCanBan) {
    const targets = banList.map(r => r.memberJid);
    if (gs.inactiveNotifyGroup) {
      await sock.sendMessage(gs.groupJid, {
        text: `🚫 *BAN POR INATIVIDADE*\n\nRemovendo ${targets.length} membro(s) com ${banDays}+ dia(s) sem atividade.\n` + targets.map(j => '@' + j.split('@')[0]).join(' '),
        mentions: targets,
      }).catch(() => {});
    }
    for (const rec of banList) {
      if (gs.inactiveNotifyPv) await sock.sendMessage(rec.memberJid, { text: `🚫 Você foi removido(a) de *${meta.subject}* por ${banDays}+ dia(s) de inatividade.\n\n⚡ Dark Side Engine` }).catch(() => {});
      await sock.groupParticipantsUpdate(gs.groupJid, [rec.memberJid], 'remove').catch(() => {});
      rec.lastBannedInactiveAt = new Date();
      await rec.save().catch(() => {});
    }
  }
}

module.exports = { start, runDarkSideGroupAutomation };
