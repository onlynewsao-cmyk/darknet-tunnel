'use strict';

/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  DARK BOT — ANTI-TIPOS v7.46 🛡️                              ║
 * ║  Aplica DE VERDADE os toggles anti-X por tipo de mensagem.    ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * Até à v7.45 os comandos `.antistatus`, `.antiflood`, `.antidoc`… só
 * gravavam a flag no GroupSettings — NADA no pipeline as lia. Este
 * módulo é o executor: corre no messageRouter a par do antiLink/antiSpam.
 *
 * Protecções (flag GroupSettings → o que apanha):
 *   antistatus     → menção de estado (statusMentionMessage / groupStatusMentionMessage)
 *                    e "mencionou-te no estado" reenviado para o grupo
 *   antimencao     → menção em massa: ≥ N @s numa mensagem (padrão 8) ou @todos
 *                    (groupMentionedMessage) por quem não é admin
 *   antipagamento  → pedidos/envios de pagamento do WhatsApp Pay
 *                    (requestPaymentMessage / sendPaymentMessage / paymentInviteMessage)
 *   antiinvisivel  → mensagens "vazias"/invisíveis: só caracteres de largura zero,
 *                    RTL/LTR overrides, U+2800, corpo vazio com contextInfo, texto
 *                    gigante só de espaços; e mensagens com > 3500 caracteres de
 *                    "lixo" unicode (crash-messages)
 *   antiflood      → o mesmo texto repetido ≥ 4× em 30 s, ou mensagem > 6000 chars,
 *                    ou > 12 linhas iguais
 *   antidoc        → documentos (documentMessage / documentWithCaption)
 *   antiloc        → localização (locationMessage / liveLocationMessage)
 *   antifigurinha / antifig → stickers (autocolantes)
 *   antibtn        → mensagens de botões/listas/interactivas/polls enviadas por bots
 *   antipalavra    → palavras da lista `palavrasProibidas` do grupo
 *   antitoxic      → insultos pesados (lista interna PT/AO) — aviso + apaga
 *   antiporn       → media marcada como viewOnce de bots ou texto com termos explícitos
 *                    (não analisa a imagem — sem visão aqui)
 *   antilinkhard/soft/gp/canal → delegados ao antiLink (modos); aqui só se
 *                    garante que a flag "hard" força kick e "soft" força só apagar
 *
 * Acção padrão: apagar a mensagem + aviso (1 por pessoa a cada 20 s) →
 * ao 3.º aviso remove (se o bot for admin). Admins e Dono imunes.
 * Sem bot admin: não faz nada (não consegue apagar msgs de outros).
 *
 * Tudo com ritmo humano: os avisos passam pelo humanizer (sendMessage
 * embrulhado) e há cooldown por pessoa para nunca responder em rajada.
 */

const config = require('../config');
const GroupSettings = require('../database/models/GroupSettings');

const MAX_WARNS_PADRAO = 3;
const WARN_TTL_MS = 30 * 60 * 1000;
const NOTIFY_COOLDOWN_MS = 20 * 1000;
const MENCAO_MASSA_PADRAO = 8;

const warns = new Map();           // `${grupo}:${num}` → { count, ts }
const notifyCd = new Map();        // `${grupo}:${num}` → ts
const floodHist = new Map();       // `${grupo}:${num}` → [{ hash, ts }]
const metaCache = new Map();       // grupo → { meta, ts }
const META_TTL = 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of warns) if (now - v.ts > WARN_TTL_MS) warns.delete(k);
  for (const [k, ts] of notifyCd) if (now - ts > 5 * 60 * 1000) notifyCd.delete(k);
  for (const [k, arr] of floodHist) { const f = arr.filter(e => now - e.ts < 60 * 1000); f.length ? floodHist.set(k, f) : floodHist.delete(k); }
}, 60 * 1000).unref?.();

const jidNum = (j = '') => String(j).split('@')[0].split(':')[0].replace(/\D/g, '');
const isAdminPart = (p) => p?.admin === 'admin' || p?.admin === 'superadmin';

async function getMeta(sock, jid) {
  const c = metaCache.get(jid);
  if (c && Date.now() - c.ts < META_TTL) return c.meta;
  try { const meta = await sock.groupMetadata(jid); metaCache.set(jid, { meta, ts: Date.now() }); return meta; }
  catch { return c?.meta || null; }
}
const isAdmin = (meta, jid) => { const n = jidNum(jid); return !!meta?.participants?.some(p => jidNum(p.id) === n && isAdminPart(p)); };
const botIsAdmin = (sock, meta) => {
  const nums = [sock.user?.id, sock.user?.lid, sock.user?.jid].map(jidNum).filter(Boolean);
  return !!meta?.participants?.some(p => nums.includes(jidNum(p.id)) && isAdminPart(p));
};

/** desembrulha ephemeral/viewOnce/edited para chegar à mensagem real */
function inner(m) {
  let x = m || {};
  for (let i = 0; i < 4; i++) {
    const k = Object.keys(x).find(k => /^(ephemeralMessage|viewOnceMessage|viewOnceMessageV2|viewOnceMessageV2Extension|documentWithCaptionMessage|editedMessage|deviceSentMessage)$/.test(k));
    if (!k || !x[k]?.message) break;
    x = x[k].message;
  }
  return x;
}

function textoDe(m) {
  return m.conversation || m.extendedTextMessage?.text || m.imageMessage?.caption ||
         m.videoMessage?.caption || m.documentMessage?.caption || '';
}

function ctxInfo(m) {
  for (const k of Object.keys(m)) if (m[k]?.contextInfo) return m[k].contextInfo;
  return null;
}

// ── detectores ────────────────────────────────────────────────
const RE_INVISIVEL = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF\u2800\u3164\u115F\u1160\uFFA0\u00AD]/g;
const RE_ZALGO = /[\u0300-\u036F\u0483-\u0489\u0591-\u05BD\u0610-\u061A\u064B-\u065F\u0e31\u0e34-\u0e3a\u0e47-\u0e4e]/g;

function ehInvisivel(m, texto) {
  const keys = Object.keys(m);
  // corpo vazio mas com contextInfo/mentions (mensagem "fantasma")
  if (m.extendedTextMessage && !String(m.extendedTextMessage.text || '').trim() && (m.extendedTextMessage.contextInfo?.mentionedJid?.length)) return 'fantasma';
  if (!texto) return null;
  const semInv = texto.replace(RE_INVISIVEL, '').replace(/\s+/g, '');
  if (texto.length >= 3 && semInv.length === 0) return 'invisivel';
  const inv = (texto.match(RE_INVISIVEL) || []).length;
  if (inv >= 200 || (inv >= 50 && inv / texto.length > 0.5)) return 'invisivel_massa';
  const zalgo = (texto.match(RE_ZALGO) || []).length;
  if (zalgo >= 300 || (zalgo >= 80 && zalgo / texto.length > 0.5)) return 'zalgo';
  if (texto.length > 3500 && semInv.replace(/[\p{L}\p{N}\p{P}]/gu, '').length / texto.length > 0.6) return 'lixo_unicode';
  return null;
}

function ehFlood(chave, texto) {
  if (!texto) return null;
  if (texto.length > 6000) return 'gigante';
  const linhas = texto.split('\n').map(l => l.trim()).filter(Boolean);
  if (linhas.length >= 12) {
    const cnt = new Map();
    for (const l of linhas) cnt.set(l, (cnt.get(l) || 0) + 1);
    if (Math.max(...cnt.values()) >= 12) return 'linhas_repetidas';
  }
  const hash = texto.slice(0, 200).toLowerCase().replace(/\s+/g, ' ');
  const now = Date.now();
  const arr = (floodHist.get(chave) || []).filter(e => now - e.ts < 30 * 1000);
  arr.push({ hash, ts: now });
  floodHist.set(chave, arr);
  if (arr.filter(e => e.hash === hash).length >= 4) { floodHist.set(chave, []); return 'repetido'; }
  return null;
}

const TOXIC = [
  /\bfilh[oa]s? d[ae] (puta|merda)\b/i, /\bvai(s)? (tomar no c[uú]|pro caralho|te foder|se foder)\b/i,
  /\bfod[ae]-?se\b/i, /\bput[ao] (que (te|o|a) pariu)\b/i, /\bcabr[aã]o\b/i, /\bpaneleir[oa]\b/i,
  /\bmacac[oa]\b(?!.*(banana|zool|s[eé]rie|filme))/i, /\bcorno\b.*\bm[aã]e\b/i, /\bvadia\b/i, /\bpiranha\b/i,
  /\bretardad[oa]\b/i, /\bmongol[oó]ide\b/i, /\bmatar?-?te\b|\bvou te matar\b/i,
];
const PORN = [/\bporn[oô]?\b/i, /\bxvideos?\b/i, /\bxnxx\b/i, /\bonlyfans\b/i, /\bpornhub\b/i, /\bputaria\b/i, /\bnudes?\b/i, /\bsexo (ao vivo|gr[aá]tis|expl[ií]cito)\b/i, /\bcam4\b/i, /\bbrazzers\b/i];

function temPalavra(texto, lista = []) {
  if (!texto || !lista.length) return null;
  const t = texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const p of lista) {
    const w = String(p || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    if (!w) continue;
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\p{L}\\p{N}]|$)`, 'iu');
    if (re.test(t)) return w;
  }
  return null;
}

/**
 * Avalia a mensagem contra as flags do grupo.
 * @returns {null | { flag, motivo, label }}
 */
function detectar(msg, gs, opts = {}) {
  const m = inner(msg.message);
  const keys = Object.keys(m);
  const texto = textoDe(m);
  const ci = ctxInfo(m);
  const chave = `${msg.key.remoteJid}:${jidNum(msg.key.participant)}`;

  if (gs.antistatus && (keys.includes('statusMentionMessage') || keys.includes('groupStatusMentionMessage') || keys.includes('groupStatusMessage') || ci?.statusSourceType != null || m.protocolMessage?.type === 'STATUS_MENTION'))
    return { flag: 'antistatus', motivo: 'menção de estado', label: 'ANTI-STATUS' };

  if (gs.antipagamento && keys.some(k => /^(requestPaymentMessage|sendPaymentMessage|paymentInviteMessage|declinePaymentRequestMessage|cancelPaymentRequestMessage)$/.test(k)))
    return { flag: 'antipagamento', motivo: 'pedido de pagamento', label: 'ANTI-PAGAMENTO' };

  if (gs.antimencao) {
    const n = (ci?.mentionedJid || []).length;
    const lim = Number(gs.antimencaoMax) || MENCAO_MASSA_PADRAO;
    if (keys.includes('groupMentionedMessage') || (ci?.groupMentions || []).length || n >= lim)
      return { flag: 'antimencao', motivo: n ? `${n} menções numa mensagem` : 'menção ao grupo inteiro', label: 'ANTI-MENÇÃO' };
  }

  if (gs.antiinvisivel) {
    const r = ehInvisivel(m, texto);
    if (r) return { flag: 'antiinvisivel', motivo: { fantasma: 'mensagem fantasma', invisivel: 'mensagem invisível', invisivel_massa: 'caracteres invisíveis em massa', zalgo: 'texto zalgo', lixo_unicode: 'lixo unicode (crash)' }[r], label: 'ANTI-INVISÍVEL' };
  }

  if (gs.antiflood) {
    const r = ehFlood(chave, texto);
    if (r) return { flag: 'antiflood', motivo: { gigante: 'mensagem gigante', linhas_repetidas: 'linhas repetidas', repetido: 'mesma mensagem repetida' }[r], label: 'ANTI-FLOOD' };
  }

  if (gs.antidoc && (keys.includes('documentMessage') || keys.includes('documentWithCaptionMessage')))
    return { flag: 'antidoc', motivo: 'documento', label: 'ANTI-DOC' };

  if (gs.antiloc && (keys.includes('locationMessage') || keys.includes('liveLocationMessage')))
    return { flag: 'antiloc', motivo: 'localização', label: 'ANTI-LOC' };

  if ((gs.antifigurinha || gs.antifig) && keys.includes('stickerMessage'))
    return { flag: 'antifigurinha', motivo: 'figurinha', label: 'ANTI-FIGURINHA' };

  if (gs.antibtn && keys.some(k => /^(buttonsMessage|templateMessage|listMessage|interactiveMessage|buttonsResponseMessage|listResponseMessage|templateButtonReplyMessage|interactiveResponseMessage|botInvokeMessage)$/.test(k)))
    return { flag: 'antibtn', motivo: 'mensagem de botões/bot', label: 'ANTI-BOTÕES' };

  if (gs.antipalavra) {
    const w = temPalavra(texto, gs.palavrasProibidas || []);
    if (w) return { flag: 'antipalavra', motivo: `palavra proibida "${w}"`, label: 'ANTI-PALAVRA' };
  }

  if (gs.antitoxic && texto && TOXIC.some(re => re.test(texto)))
    return { flag: 'antitoxic', motivo: 'linguagem tóxica', label: 'ANTI-TÓXICO' };

  if (gs.antiporn) {
    if (texto && PORN.some(re => re.test(texto))) return { flag: 'antiporn', motivo: 'conteúdo adulto', label: 'ANTI-PORN' };
    if (opts.viewOnce && (m.imageMessage || m.videoMessage) && !opts.senderKnown) return { flag: 'antiporn', motivo: 'media única de desconhecido', label: 'ANTI-PORN' };
  }

  return null;
}

function addWarn(k) {
  const e = warns.get(k);
  if (!e || Date.now() - e.ts > WARN_TTL_MS) { warns.set(k, { count: 1, ts: Date.now() }); return 1; }
  e.count++; e.ts = Date.now(); return e.count;
}

async function check(sock, msg) {
  try {
    const remoteJid = msg?.key?.remoteJid;
    if (!remoteJid?.endsWith('@g.us') || msg.key.fromMe) return false;
    const senderJid = msg.key.participant;
    if (!senderJid) return false;
    const senderNum = jidNum(senderJid);
    const ownerNum = String(config.owner.number || '').replace(/\D/g, '');
    if (ownerNum && senderNum === ownerNum) return false;

    const gs = await GroupSettings.findOne({ groupJid: remoteJid }).lean().catch(() => null);
    if (!gs) return false;
    const algumaFlag = ['antistatus', 'antimencao', 'antipagamento', 'antiinvisivel', 'antiflood', 'antidoc', 'antiloc', 'antifigurinha', 'antifig', 'antibtn', 'antipalavra', 'antitoxic', 'antiporn'].some(f => gs[f]);
    if (!algumaFlag) return false;

    const raw = msg.message || {};
    const viewOnce = !!(raw.viewOnceMessage || raw.viewOnceMessageV2 || raw.viewOnceMessageV2Extension || inner(raw).imageMessage?.viewOnce || inner(raw).videoMessage?.viewOnce);
    const hit = detectar(msg, gs, { viewOnce, senderKnown: true });
    if (!hit) return false;

    const meta = await getMeta(sock, remoteJid);
    if (!meta) return false;
    if (isAdmin(meta, senderJid)) return false;
    if (!botIsAdmin(sock, meta)) return false;

    // apaga sempre
    try { await sock.sendMessage(remoteJid, { delete: msg.key }); } catch {}

    const k = `${remoteJid}:${senderNum}`;
    const maxWarns = Number(gs.antitiposMaxWarns) || MAX_WARNS_PADRAO;
    const w = addWarn(k);

    try { require('./liveBroadcaster').antilinkAction?.({ user: senderNum, action: w >= maxWarns ? 'kick' : 'delete', type: hit.flag, group: remoteJid }); } catch {}

    if (w >= maxWarns) {
      await sock.sendMessage(remoteJid, {
        text: `🚫 *DARK ${hit.label}* 🕸️\n\n@${senderNum} removido após ${w} avisos (${hit.motivo}).`,
        mentions: [senderJid],
      }).catch(() => {});
      try { await sock.groupParticipantsUpdate(remoteJid, [senderJid], 'remove'); } catch {}
      warns.delete(k);
      return true;
    }

    const last = notifyCd.get(k) || 0;
    if (Date.now() - last > NOTIFY_COOLDOWN_MS && gs.antitiposNotify !== false) {
      notifyCd.set(k, Date.now());
      await sock.sendMessage(remoteJid, {
        text: `⚠️ *DARK ${hit.label}* 🕸️\n\n@${senderNum}, aqui não pode: *${hit.motivo}*.\nAviso *${w}/${maxWarns}*.`,
        mentions: [senderJid],
      }).catch(() => {});
    }
    return true;
  } catch (e) {
    console.warn('[AntiTipos]', e?.message?.slice(0, 80));
    return false;
  }
}

function clearWarnings(groupJid, num) {
  if (num) warns.delete(`${groupJid}:${jidNum(num)}`);
  else for (const k of [...warns.keys()]) if (k.startsWith(groupJid + ':')) warns.delete(k);
}

module.exports = { check, detectar, clearWarnings, ehInvisivel, ehFlood, temPalavra, inner, _reset: () => { warns.clear(); notifyCd.clear(); floodHist.clear(); metaCache.clear(); } };
