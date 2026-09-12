/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║     DARK BOT — AntiSpam v3 (módulo limpo)                ║
 * ╚══════════════════════════════════════════════════════════╝
 *
 * NOTA v5.1: A parte de ANTI-LINK foi movida para `antiLink.js`
 * (DarkShield v2). O antigo código continha um bug grave de fluxo
 * (`goto_spam: { break goto_spam; }` não salta — é um no-op),
 * que fazia o bot apagar mensagens e kickar utilizadores MESMO
 * quando não era admin ou quando o remetente era admin.
 *
 * Este módulo agora trata SÓ de spam:
 *  - Janela deslizante configurável (padrão: 5 msgs em 5s)
 *  - Avisos progressivos antes de remover
 *  - Admins + dono imunes; bot precisa de ser admin
 *  - Comandos do bot (com prefixo) não contam como spam
 *
 * COMANDOS:
 *  !antispam on/off — Liga/desliga o anti-spam
 */

'use strict';

const config = require('../config');
const GroupSettings = require('../database/models/GroupSettings');

// ─────────────────────────────────────────────
// CACHE EM MEMÓRIA
// ─────────────────────────────────────────────

const userActivity = new Map();   // jid → [timestamps]
const warnCount = new Map();      // `spam:jid:group` → count
const warnCooldown = new Map();   // `group:jid` → lastTs
const groupMetaCache = new Map(); // groupJid → { meta, ts }

const GROUP_META_TTL = 60_000;

// Limpeza automática a cada 60s
setInterval(() => {
  const now = Date.now();
  for (const [k, times] of userActivity.entries()) {
    const fresh = times.filter((t) => now - t < 60_000);
    if (!fresh.length) userActivity.delete(k);
    else userActivity.set(k, fresh);
  }
  for (const [k, ts] of warnCooldown.entries()) {
    if (now - ts > 15 * 60_000) warnCooldown.delete(k);
  }
  for (const [k, e] of groupMetaCache.entries()) {
    if (now - e.ts > GROUP_META_TTL * 5) groupMetaCache.delete(k);
  }
}, 60_000);

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function jidNum(jid = '') {
  return String(jid || '').split(':')[0].split('@')[0].replace(/\D/g, '');
}

const isAdminPart = (p) => p?.admin === 'admin' || p?.admin === 'superadmin';

async function getGroupMeta(sock, groupJid) {
  const c = groupMetaCache.get(groupJid);
  if (c && Date.now() - c.ts < GROUP_META_TTL) return c.meta;
  try {
    const meta = await sock.groupMetadata(groupJid);
    groupMetaCache.set(groupJid, { meta, ts: Date.now() });
    return meta;
  } catch {
    return c?.meta || null;
  }
}

function participantIsAdmin(meta, jid) {
  const n = jidNum(jid);
  return !!meta?.participants?.some((p) => jidNum(p.id) === n && isAdminPart(p));
}

function botIsAdmin(sock, meta) {
  const botNums = [sock.user?.id, sock.user?.lid, sock.user?.jid].map(jidNum).filter(Boolean);
  return !!meta?.participants?.some((p) => botNums.includes(jidNum(p.id)) && isAdminPart(p));
}

function canWarn(senderJid, groupJid, minIntervalMs = 8_000) {
  const key = `${groupJid}:${senderJid}`;
  const last = warnCooldown.get(key) || 0;
  if (Date.now() - last < minIntervalMs) return false;
  warnCooldown.set(key, Date.now());
  return true;
}

function getWarn(key) { return warnCount.get(key) || 0; }
function addWarn(key) { const v = getWarn(key) + 1; warnCount.set(key, v); return v; }
function resetWarn(key) { warnCount.delete(key); }

// ─────────────────────────────────────────────
// HANDLER PRINCIPAL — só anti-spam
// ─────────────────────────────────────────────

async function check(sock, msg) {
  try {
    const remoteJid = msg.key.remoteJid;
    if (!remoteJid?.endsWith('@g.us')) return false; // só grupos
    if (msg.key.fromMe) return false;

    const senderJid = msg.key.participant;
    if (!senderJid) return false;

    const senderNum = jidNum(senderJid);
    const ownerNum = String(config.owner.number || '').replace(/\D/g, '');
    if (ownerNum && senderNum === ownerNum) return false; // dono imune

    const gs = await GroupSettings.findOne({ groupJid: remoteJid }).lean().catch(() => null);
    // v7.35: interruptor global do dashboard (antispam_enabled) como padrão quando o grupo não definiu
    let ativo = !!gs?.antispam;
    if (!ativo && !gs?.antispamOptOut) {
      try { ativo = !!(await require('./botConfigCache').get('antispam_enabled', false)); } catch { ativo = false; }
    }
    if (!ativo) return false;

    // Comandos do bot não contam como spam
    const text =
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      msg.message?.imageMessage?.caption ||
      msg.message?.videoMessage?.caption || '';
    try {
      const pe = require('./prefixEngine');
      const detected = await pe.detect(text, remoteJid).catch(() => null);
      if (detected) return false; // é um comando → não conta como spam
    } catch {}

    const windowMs = gs.antispamWindowMs || 5_000;
    const maxMsgs = gs.antispamMaxMsgs || 5;
    const maxWarns = gs.antispamMaxWarns || 3;

    const now = Date.now();
    const acts = (userActivity.get(senderJid) || []).filter((t) => now - t < windowMs);
    acts.push(now);
    userActivity.set(senderJid, acts);

    if (acts.length < maxMsgs) return false;

    // Limiares atingido — verifica permissões ANTES de agir (fluxo correcto)
    const meta = await getGroupMeta(sock, remoteJid);
    if (!meta) return false;
    if (participantIsAdmin(meta, senderJid)) { userActivity.set(senderJid, []); return false; }
    if (!botIsAdmin(sock, meta)) { userActivity.set(senderJid, []); return false; }

    const wkey = `spam:${senderJid}:${remoteJid}`;
    const w = addWarn(wkey);
    userActivity.set(senderJid, []); // reset da actividade

    if (w >= maxWarns) {
      try {
        await sock.sendMessage(remoteJid, {
          text: `🚫 *DARK ANTI-SPAM* 🕸️\n\n@${senderNum} removido por spam excessivo após ${w} avisos.`,
          mentions: [senderJid],
        }).catch(() => {});
        await sock.groupParticipantsUpdate(remoteJid, [senderJid], 'remove');
        resetWarn(wkey);
      } catch (e) {
        console.warn('[AntiSpam] Falha ao remover:', e.message);
      }
    } else if (canWarn(senderJid, remoteJid)) {
      await sock.sendMessage(remoteJid, {
        text:
          `⚠️ *DARK ANTI-SPAM* 🕸️\n\n@${senderNum}, para de fazer spam!\n` +
          `Aviso *${w}/${maxWarns}*.`,
        mentions: [senderJid],
      }).catch(() => {});
    }

    return true;
  } catch (err) {
    console.error('[AntiSpam]', err?.message || err);
    return false;
  }
}

function clearWarnings(jid, groupJid) {
  if (groupJid) {
    warnCount.delete(`spam:${jid}:${groupJid}`);
  } else {
    for (const k of warnCount.keys()) if (k.includes(jid)) warnCount.delete(k);
  }
  userActivity.delete(jid);
}

// Compatibilidade: quem importava detectLink/isWhitelisted daqui continua a funcionar
const antiLink = require('./antiLink');

module.exports = {
  check,
  clearWarnings,
  detectLink: antiLink.detectLink,
  isWhitelisted: antiLink.isWhitelisted,
};
