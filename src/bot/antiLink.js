/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║   DARK BOT — DarkShield Anti-Link v2 🛡️🕸️                ║
 * ║   Sistema dedicado de protecção de grupos contra links   ║
 * ╚══════════════════════════════════════════════════════════╝
 *
 * NOVIDADES v2 (vs. antigo bloco dentro do antiSpam):
 *  ✅ Fluxo de controlo correcto — o bug `goto_spam:` foi eliminado
 *     (antes o bot apagava/kickava MESMO quando não era admin ou
 *      quando o remetente era admin)
 *  ✅ Comandos do bot são IGNORADOS (ex: `!ytd https://...` já não
 *     é apagado pelo próprio anti-link)
 *  ✅ Detecção de links OFUSCADOS: `hxxp://`, `youtube [.] com`,
 *     `instagram (dot) com`, `wa(ponto)me`, espaços internos, etc.
 *  ✅ Mais padrões: IPs directos, Discord, Instagram, TikTok,
 *     Facebook, Kwai, +30 encurtadores
 *  ✅ Avisos progressivos com EXPIRAÇÃO automática (10 min)
 *  ✅ Imunidade: admins + dono (+ premium opcional via `vip on`)
 *  ✅ Estatísticas persistidas por grupo (apagados/avisos/kicks)
 *  ✅ Só age quando o bot É admin (antes tentava sempre)
 *
 * MODOS:
 *   smart (padrão) — WA + Telegram + Discord + encurtadores + IP
 *   wa             — só convites de WhatsApp
 *   all            — QUALQUER link (http/www/ofuscado/IP)
 *
 * ACÇÕES:
 *   warn   — apaga + avisa progressivamente (padrão)
 *   kick   — apaga + remove na hora
 *   delete — apaga em silêncio, sem avisar
 *
 * COMANDOS (ver cases/grupos.js):
 *   !antilink on|off · modo smart|wa|all · acao warn|kick|delete
 *   !antilink strict on|off · vip on|off · maxwarns <n>
 *   !antilink delete on|off · notify on|off
 *   !antilink whitelist add|del|list <dominio>
 */

'use strict';

const config = require('../config');
const GroupSettings = require('../database/models/GroupSettings');

// ─────────────────────────────────────────────
// PADRÕES DE DETECÇÃO
// ─────────────────────────────────────────────

// Convites WhatsApp
const RE_WA = /(chat\.whatsapp\.com\/[a-zA-Z0-9]{6,}|wa\.me\/\d{6,}|whatsapp\.com\/channel\/[a-zA-Z0-9]{6,})/i;

// Telegram
const RE_TG = /(t\.me\/[a-zA-Z0-9_+]+|telegram\.me\/[a-zA-Z0-9_+]+|telegram\.dog\/[a-zA-Z0-9_+]+)/i;

// Discord
const RE_DISCORD = /(discord\.(gg|com\/invite|app\.com\/invite)\/[a-zA-Z0-9-]+)/i;

// Redes sociais usadas para "fuga" do grupo
const RE_SOCIAL = /(instagram\.com\/[a-zA-Z0-9_.]+|tiktok\.com\/@[a-zA-Z0-9_.]+|vm\.tiktok\.com\/\S+|facebook\.com\/\S+|fb\.watch\/\S+|kwai\.com\/\S+|threads\.net\/\S+)/i;

// Encurtadores (+30)
const RE_SHORT = /\b(bit\.ly|tinyurl\.com|t\.ly|cutt\.ly|cutt\.us|is\.gd|v\.gd|buff\.ly|adf\.ly|ow\.ly|goo\.gl|goo\.su|rb\.gy|tiny\.cc|qr\.ae|lnkd\.in|link\.ly|shorte\.st|bc\.vc|soo\.gd|s2r\.co|y2u\.be|youtu\.be|shorturl\.at|encurtador\.com\.br|bit\.do|rebrand\.ly|tiny\.ie|clk\.sh|sh\.st|ouo\.io|exe\.io|fc\.lc|cpmlink\.net|shrinkme\.io|linkvertise\.com)\b\/?\S*/i;

// IP directo (ex: 192.168.1.1:8080) — só com porta ou scheme para evitar falsos positivos
const RE_IP = /((https?:\/\/)?\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d{1,5})?(\/\S*)?)/;

// Link HTTP/HTTPS ou www.
const RE_HTTP = /(https?:\/\/\S+|www\.[a-zA-Z0-9-]+\.\S{2,})/i;

// Ofuscação comum: hxxp, [.] , (dot), " dot ", [@], (arroba)
function deobfuscate(text) {
  return String(text || '')
    .replace(/hxxps?/gi, (m) => m.replace(/xx/gi, 'tt'))
    .replace(/\s*\[\.\]\s*|\s*\(\.\)\s*|\s*\(dot\)\s*|\s*\bdot\b\s*|\s*\[dot\]\s*|\s*\(ponto\)\s*|\s*\[ponto\]\s*|\s*\bponto\b\s*/gi, '.')
    .replace(/\s*\[@\]\s*|\s*\(at\)\s*|\s*\(arroba\)\s*|\s*\[at\]\s*/gi, '@')
    .replace(/\s*\[\/\]\s*/gi, '/')
    // "youtube . com" / "wa . me" com espaços à volta do ponto
    .replace(/([a-zA-Z0-9])\s*\.\s*([a-zA-Z0-9])/g, '$1.$2');
}

/**
 * Detecta links no texto.
 * @param {string} text — texto da mensagem
 * @param {string} mode — 'smart' | 'whatsapp_only' | 'all_links'
 * @param {boolean} strict — também detecta ofuscação (smart+)
 * @returns {{hit: boolean, kind: string}}
 */
function detectLink(text, mode = 'smart', strict = true) {
  const raw = String(text || '');
  if (!raw.trim()) return { hit: false, kind: '' };

  const t = strict ? `${raw}\n${deobfuscate(raw)}` : raw;

  if (mode === 'whatsapp_only') {
    return RE_WA.test(t) ? { hit: true, kind: 'whatsapp' } : { hit: false, kind: '' };
  }

  if (RE_WA.test(t)) return { hit: true, kind: 'whatsapp' };

  if (mode === 'all_links') {
    if (RE_HTTP.test(t)) return { hit: true, kind: 'http' };
    if (RE_IP.test(t)) return { hit: true, kind: 'ip' };
  }

  // smart + all: perigosos para o grupo
  if (RE_TG.test(t)) return { hit: true, kind: 'telegram' };
  if (RE_DISCORD.test(t)) return { hit: true, kind: 'discord' };
  if (RE_SHORT.test(t)) return { hit: true, kind: 'shortener' };
  if (RE_SOCIAL.test(t)) return { hit: true, kind: 'social' };
  if (RE_IP.test(t) && /:\d{2,5}/.test(t)) return { hit: true, kind: 'ip' };

  // Ofuscação = intenção de evasão (hxxp, [.] , "ponto com", espaços).
  // Se o texto foi alterado pela limpeza E revela um link/domínio → flag.
  if (strict) {
    const deob = deobfuscate(raw);
    if (deob !== raw) {
      if (/\bh\s*t\s*t\s*p/i.test(raw)) return { hit: true, kind: 'obfuscated' };
      if (RE_WA.test(deob)) return { hit: true, kind: 'obfuscated' };
      if (RE_HTTP.test(deob)) return { hit: true, kind: 'obfuscated' };
      if (/\b[a-zA-Z0-9-]+\.(com|net|org|xyz|app|io|tv|cc|top|site|online|info|live|me|co)\b(\/\S*)?/i.test(deob)) {
        return { hit: true, kind: 'domain' };
      }
    }
  }

  if (mode === 'all_links') {
    // domínio simples sem esquema em modo all
    if (/\b[a-zA-Z0-9-]+\.(com|net|org|xyz|app|io|tv|cc|top|site|online|info|live|me|co)\b(\/\S*)?/i.test(deobfuscate(raw))) {
      return { hit: true, kind: 'domain' };
    }
  }

  return { hit: false, kind: '' };
}

/**
 * Domínio na whitelist? (match parcial, ex: 'youtube.com' cobre youtu.be? não — só substring)
 */
function isWhitelisted(text, whitelist = []) {
  if (!Array.isArray(whitelist) || !whitelist.length) return false;
  const lower = String(text || '').toLowerCase();
  return whitelist.some((d) => {
    const dom = String(d || '').toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    return dom.length > 2 && lower.includes(dom);
  });
}

// ─────────────────────────────────────────────
// CACHES EM MEMÓRIA
// ─────────────────────────────────────────────

const warnCount = new Map();      // `jid:group` → { count, lastTs }
const warnCooldown = new Map();   // `group:jid` → lastNotifyTs
const groupMetaCache = new Map(); // groupJid → { meta, ts }

const WARN_TTL = 10 * 60 * 1000;        // avisos expiram após 10 min
const NOTIFY_COOLDOWN = 20 * 1000;      // máx. 1 notificação / 20s por utilizador
const GROUP_META_TTL = 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of warnCount.entries()) if (now - v.lastTs > WARN_TTL) warnCount.delete(k);
  for (const [k, ts] of warnCooldown.entries()) if (now - ts > 15 * 60 * 1000) warnCooldown.delete(k);
  for (const [k, e] of groupMetaCache.entries()) if (now - e.ts > GROUP_META_TTL * 5) groupMetaCache.delete(k);
}, 60 * 1000);

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

function canNotify(senderJid, groupJid) {
  const key = `${groupJid}:${senderJid}`;
  const last = warnCooldown.get(key) || 0;
  if (Date.now() - last < NOTIFY_COOLDOWN) return false;
  warnCooldown.set(key, Date.now());
  return true;
}

function addWarn(senderJid, groupJid) {
  const key = `${senderJid}:${groupJid}`;
  const entry = warnCount.get(key);
  if (!entry || Date.now() - entry.lastTs > WARN_TTL) {
    warnCount.set(key, { count: 1, lastTs: Date.now() });
    return 1;
  }
  entry.count += 1;
  entry.lastTs = Date.now();
  return entry.count;
}

function resetWarn(senderJid, groupJid) {
  warnCount.delete(`${senderJid}:${groupJid}`);
}

function extractText(msg) {
  const m = msg.message;
  return (
    m?.conversation ||
    m?.extendedTextMessage?.text ||
    m?.imageMessage?.caption ||
    m?.videoMessage?.caption ||
    m?.documentMessage?.caption ||
    m?.documentWithCaptionMessage?.message?.documentMessage?.caption ||
    ''
  );
}

async function bumpStats(groupJid, field) {
  try {
    await GroupSettings.updateOne(
      { groupJid },
      { $inc: { [`antilinkStats.${field}`]: 1 }, $set: { 'antilinkStats.lastAction': new Date() } }
    );
  } catch {}
}

// ─────────────────────────────────────────────
// HANDLER PRINCIPAL — chamado a cada mensagem
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

    // Config do grupo
    const gs = await GroupSettings.findOne({ groupJid: remoteJid }).lean().catch(() => null);
    // v7.35: interruptor global do dashboard (antilink_enabled) — liga em todos os grupos
    // que não desligaram explicitamente; se o grupo definiu, o grupo manda.
    let ativo = !!gs?.antilink;
    if (!ativo && !gs?.antilinkOptOut) {
      try { ativo = !!(await require('./botConfigCache').get('antilink_enabled', false)); } catch { ativo = false; }
    }
    if (!ativo) return false;

    const text = extractText(msg);
    if (!text) return false;

    // 🛡️ Comandos do bot são ignorados (ex: !ytd https://... | botão play)
    // Usa prefixEngine para respeitar prefixo por grupo
    const pe = require('./prefixEngine');
    const detected = await pe.detect(text, remoteJid).catch(() => null);
    if (detected) return false; // é um comando → ignora

    const mode = gs.antilinkMode || 'smart';
    const strict = gs.antilinkStrict !== false;
    const detection = detectLink(text, mode, strict);
    if (!detection.hit) return false;

    // Whitelist por domínio
    if (isWhitelisted(text, gs.antilinkWhitelist || [])) return false;

    // Metadados do grupo
    const meta = await getGroupMeta(sock, remoteJid);
    if (!meta) return false;

    // Admins são imunes
    if (participantIsAdmin(meta, senderJid)) return false;

    // Premium imune (opcional, desligado por padrão)
    if (gs.antilinkVipImmune) {
      try {
        const User = require('../database/models/User');
        const u = await User.findOne({ whatsappNumber: senderNum }).lean();
        const isPrem = u && (u.role === 'premium' || (u.premiumUntil && new Date(u.premiumUntil) > new Date()));
        if (isPrem) return false;
      } catch {}
    }

    // Bot precisa SER admin para agir
    if (!botIsAdmin(sock, meta)) return false;

    const action = gs.antilinkAction || 'warn';
    const maxWarns = gs.antilinkMaxWarns ?? 2;
    const doDelete = gs.antilinkDeleteMsg !== false;
    const doNotify = gs.antilinkNotify !== false;

    // Apaga a mensagem (em todas as acções, se activado)
    if (doDelete) {
      try {
        await sock.sendMessage(remoteJid, { delete: msg.key });
        await bumpStats(remoteJid, 'deleted');
      } catch {}
    }

    // Acção: delete silencioso — só apaga, nada mais
    if (action === 'delete') {
      // kindLabel ainda não existe neste ponto — usa o tipo cru da detecção
      try { require('./liveBroadcaster').antilinkAction({ user: senderNum, action: 'delete', type: detection?.kind || 'link', group: remoteJid }); } catch (e) {}
      return true;
    }

    const w = addWarn(senderJid, remoteJid);
    const kindLabel = {
      whatsapp: 'convite de WhatsApp', telegram: 'link de Telegram', discord: 'convite de Discord',
      shortener: 'link encurtado', social: 'link de rede social', ip: 'endereço IP',
      http: 'link', domain: 'domínio', obfuscated: 'link ofuscado',
    }[detection.kind] || 'link';

    // Kick directo OU avisos esgotados
    if (action === 'kick' || w >= maxWarns) {
      if (doNotify) {
        await sock.sendMessage(remoteJid, {
          text:
            `🚫 *DARKSHIELD ANTI-LINK v2* 🕸️\n\n` +
            `@${senderNum} foi *removido* por enviar ${kindLabel}${w > 1 ? ` (${w}ª infracção)` : ''}.\n\n` +
            `_Modo: ${mode} · Avisos: ${w}/${maxWarns}_`,
          mentions: [senderJid],
        }).catch(() => {});
      }
      try {
        await sock.groupParticipantsUpdate(remoteJid, [senderJid], 'remove');
        await bumpStats(remoteJid, 'kicks');
        try { require('./liveBroadcaster').antilinkAction({ user: senderNum, action: 'kick', type: kindLabel, group: remoteJid }); } catch (e) {}
      } catch (e) {
        console.warn('[DarkShield] Falha ao remover:', e.message);
      }
      resetWarn(senderJid, remoteJid);
      return true;
    }

    // Aviso progressivo
    if (doNotify && canNotify(senderJid, remoteJid)) {
      const remaining = maxWarns - w;
      await sock.sendMessage(remoteJid, {
        text:
          `⚠️ *DARKSHIELD ANTI-LINK v2* 🕸️\n\n` +
          `@${senderNum}, ${kindLabel}s não são permitidos aqui!\n` +
          `Aviso *${w}/${maxWarns}* — mais ${remaining} e serás removido.`,
        mentions: [senderJid],
      }).catch(() => {});
      await bumpStats(remoteJid, 'warns');
      try { require('./liveBroadcaster').antilinkAction({ user: senderNum, action: 'warn', type: kindLabel, group: remoteJid, warns: w }); } catch (e) {}
    }

    return true;
  } catch (err) {
    console.error('[DarkShield]', err?.message || err);
    return false;
  }
}

function clearWarnings(jid, groupJid) {
  if (groupJid) {
    warnCount.delete(`${jid}:${groupJid}`);
  } else {
    for (const k of warnCount.keys()) if (k.startsWith(`${jid}:`)) warnCount.delete(k);
  }
}

module.exports = { check, clearWarnings, detectLink, deobfuscate, isWhitelisted };
