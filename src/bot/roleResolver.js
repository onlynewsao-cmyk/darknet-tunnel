/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║   DARK BOT — RoleResolver v1                             ║
 * ║   Fonte ÚNICA de verdade para identificar o cargo        ║
 * ╚══════════════════════════════════════════════════════════╝
 *
 * Resolve de forma consistente em TODO o bot:
 *
 *   👑 Dono   → cargo: '👑 DONO SUPREMO'   vip: 'ATIVO ✅'
 *   💎 VIP    → cargo: '💎 VIP'            vip: 'ATIVO ✅'
 *   🛡️ Admin  → cargo: '🛡️ ADMIN'          vip: 'INATIVO ❌'
 *   🆓 Free   → cargo: '🆓 FREE'           vip: 'INATIVO ❌'
 *
 * Fontes de dono (qualquer uma basta):
 *   1. ctx.isOwner (já calculado pelo commandHandler)
 *   2. .env OWNER_NUMBER
 *   3. BotConfig.owner_number (dashboard)
 *   4. BotConfig.owner_lid    (LID do WhatsApp)
 *   5. BotConfig.owner_numbers (subdonos / extra owners)
 *   6. MongoDB User.role === 'owner'
 *
 * Fontes de VIP:
 *   1. User.isPremium()  (role premium + premiumUntil válido)
 *   2. User.role === 'premium' | 'owner'
 *
 * Admin = admin/superadmin nos participantes do grupo.
 *
 * NUNCA lança excepção — em caso de falha total devolve FREE.
 */

const config = require('../config');

// ── Rótulos oficiais (usados em menu, perfil, cards, etc.) ──
const LABELS = {
  owner: '👑 DONO SUPREMO',
  vip:   '💎 VIP',
  admin: '🛡️ ADMIN',
  free:  '🆓 FREE',
};

const VIP_ON  = 'ATIVO ✅';
const VIP_OFF = 'INATIVO ❌';

/** Normaliza qualquer número/JID/LID para dígitos puros. */
function norm(v) {
  if (!v) return '';
  return String(v).split(':')[0].split('@')[0].replace(/\D/g, '');
}

/** Converte para lista de números normalizados. */
function normList(v) {
  if (!v) return [];
  const arr = Array.isArray(v) ? v : String(v).split(/[\s,;]+/);
  return arr.map(norm).filter(n => n.length >= 6);
}

/**
 * Resolve o cargo do remetente.
 *
 * @param {object} opts
 * @param {object} opts.ctx     — contexto do handler (senderNumber, senderJid, isGroup, isOwner, groupMeta)
 * @param {object} [opts.msg]   — mensagem crua (para extrair participant/LID)
 * @param {object} [opts.sock]  — socket (para groupMetadata quando ctx.groupMeta falta)
 * @param {object} [opts.user]  — documento User já carregado (evita nova query)
 *
 * @returns {Promise<{
 *   role:'owner'|'premium'|'admin'|'free',
 *   cargo:string, vip:string, vipAtivo:boolean,
 *   isOwner:boolean, isVip:boolean, isAdmin:boolean, isFree:boolean,
 *   premiumUntil:Date|null, user:object|null
 * }>}
 */
async function resolveRole({ ctx = {}, msg = null, sock = null, user = undefined } = {}) {
  const senderNum = norm(ctx.senderNumber || ctx.senderJid || '');
  const senderJid = String(
    ctx.senderJid || msg?.key?.participant || msg?.key?.remoteJid || ''
  );

  // ── 1. Dono via .env ──────────────────────────────────────
  const envOwnerNum = norm(config?.owner?.number);
  let isOwner = !!ctx.isOwner || (!!senderNum && senderNum === envOwnerNum);

  // ── 1b. v7.27: número do BOT = subdono ────────────────────
  if (!isOwner) {
    try {
      const botNum = norm(String(sock?.user?.id || ctx.sock?.user?.id || '').split(':')[0].split('@')[0]);
      const envBot = norm(config?.bot?.number);
      if (msg?.key?.fromMe || ctx.isBotSelf ||
          (botNum && senderNum === botNum) || (envBot && senderNum === envBot)) isOwner = true;
    } catch {}
  }

  // ── 2. Dono via dashboard (BotConfig) ─────────────────────
  if (!isOwner) {
    try {
      const botConfigCache = require('./botConfigCache');
      const [ownerNumDB, ownerLid, extraOwners] = await Promise.all([
        botConfigCache.get('owner_number', '').catch(() => ''),
        botConfigCache.get('owner_lid', '').catch(() => ''),
        botConfigCache.get('owner_numbers', []).catch(() => []),
      ]);

      const dbOwnerNum = norm(ownerNumDB);
      if (dbOwnerNum && senderNum === dbOwnerNum) isOwner = true;

      if (!isOwner && ownerLid) {
        const lidNum = norm(ownerLid);
        if ((lidNum && senderNum === lidNum) || (senderJid && senderJid.includes(String(ownerLid)))) {
          isOwner = true;
        }
      }

      if (!isOwner && normList(extraOwners).includes(senderNum)) isOwner = true;
    } catch { /* MongoDB indisponível → continua com o que já se sabe */ }
  }

  // ── 3. Utilizador no MongoDB (VIP / dono no banco) ────────
  let u = user;
  if (u === undefined) {
    u = null;
    try {
      const User = require('../database/models/User');
      u = await User.findOne({ whatsappNumber: senderNum }).catch(() => null);
      // fallback: número guardado noutro formato
      if (!u && senderNum) {
        u = await User.findOne({
          whatsappNumber: { $regex: `${senderNum}$` },
        }).catch(() => null);
      }
    } catch { u = null; }
  }

  if (u?.role === 'owner') isOwner = true;

  let isVip = isOwner;
  if (!isVip && u) {
    try {
      isVip = typeof u.isPremium === 'function'
        ? !!u.isPremium()
        : (u.role === 'premium' && (!u.premiumUntil || new Date(u.premiumUntil) > new Date()));
    } catch {
      isVip = u.role === 'premium';
    }
  }

  // ── 4. Admin do grupo ─────────────────────────────────────
  let isAdmin = false;
  if (!isOwner && ctx.isGroup) {
    try {
      const meta = ctx.groupMeta || (sock ? await sock.groupMetadata(ctx.remoteJid) : null);
      isAdmin = !!meta?.participants?.some(p => {
        const participantIds = [p?.id, p?.jid, p?.lid, p?.pn, p?.phoneNumber]
          .map(norm).filter(Boolean);
        return participantIds.includes(senderNum) &&
          (p?.admin === 'admin' || p?.admin === 'superadmin' || p?.isAdmin === true);
      });
      if (meta && !ctx.groupMeta) ctx.groupMeta = meta; // cacheia para o resto do fluxo
    } catch { isAdmin = false; }
  }

  // ── 5. Hierarquia final: Dono > VIP > Admin > Free ────────
  const role = isOwner ? 'owner' : isVip ? 'premium' : isAdmin ? 'admin' : 'free';

  const cargo = isOwner ? LABELS.owner
    : isVip   ? LABELS.vip
    : isAdmin ? LABELS.admin
    : LABELS.free;

  const vipAtivo = isOwner || isVip;

  // VIP com validade → mostra a data
  let vip = vipAtivo ? VIP_ON : VIP_OFF;
  if (!isOwner && isVip && u?.premiumUntil) {
    try {
      vip = `${VIP_ON} até ${new Date(u.premiumUntil).toLocaleDateString('pt-BR')}`;
    } catch {}
  }

  return {
    role,
    cargo,
    vip,
    vipAtivo,
    isOwner,
    isVip: vipAtivo,
    isAdmin,
    isFree: role === 'free',
    premiumUntil: u?.premiumUntil || null,
    user: u || null,
  };
}

/** Atalho: devolve apenas a string do cargo. */
async function getCargo(opts) {
  return (await resolveRole(opts)).cargo;
}

/** Atalho: true se o remetente pode ver conteúdo VIP. */
async function canSeeVip(opts) {
  return (await resolveRole(opts)).vipAtivo;
}

/** Atalho: true se o remetente pode ver conteúdo de dono. */
async function canSeeOwner(opts) {
  return (await resolveRole(opts)).isOwner;
}

module.exports = {
  resolveRole,
  getCargo,
  canSeeVip,
  canSeeOwner,
  LABELS,
  VIP_ON,
  VIP_OFF,
  norm,
  normList,
};
