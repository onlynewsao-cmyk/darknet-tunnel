'use strict';
/**
 * v12.9.43 — FONTE ÚNICA do mute/unmute 🎚️
 * Antes existiam DOIS handlers: o de grupos.js (tirava o registo) e o de
 * audioAdmin2.js (`.desmute`/`.desmutar`/`.tirarmute`) que só tentava
 * RE-ADICIONAR a pessoa ao grupo — o registo de mute ficava na base e o bot
 * continuava a apagar tudo o que ela mandava (o "unmute não funciona").
 * Agora todos os caminhos passam por aqui.
 */

const GroupSettings = () => require('../database/models/GroupSettings');

function _cacheUpdate(groupJid, jid, untilMs) {
  try { require('./messageListener').mutedCacheUpdate(String(groupJid), String(jid), untilMs); } catch {}
}

/** Está silenciado neste grupo? Devolve o registo ou null. */
async function temMute(groupJid, jid) {
  try {
    const gs = await GroupSettings().findOne({ groupJid: String(groupJid) });
    const lista = (gs && gs.mutedUsers) || [];
    return lista.find((m) => m.jid === String(jid)) || null;
  } catch { return null; }
}

/**
 * Tira o silêncio. Idempotente: devolve { ok, estava } — estava=false quando
 * a pessoa nem estava silenciada (o chamador decide o que fazer a seguir).
 */
async function tirarMute(groupJid, jid) {
  const alvo = String(jid || '');
  if (!alvo) return { ok: false, estava: false, erro: 'sem alvo' };
  try {
    const gs = await GroupSettings().findOne({ groupJid: String(groupJid) });
    const antes = ((gs && gs.mutedUsers) || []).length;
    if (!gs || !antes) { _cacheUpdate(groupJid, alvo, -1); return { ok: true, estava: false }; }
    gs.mutedUsers = (gs.mutedUsers || []).filter((m) => m.jid !== alvo);
    gs.markModified && gs.markModified('mutedUsers');
    await gs.save();
    _cacheUpdate(groupJid, alvo, -1);
    return { ok: true, estava: gs.mutedUsers.length < antes };
  } catch (e) {
    _cacheUpdate(groupJid, alvo, -1);
    return { ok: false, estava: false, erro: String(e.message || e).slice(0, 90) };
  }
}

/** Aplica o silêncio (com duração opcional em ms) — usado pelo .mute/.silenciar. */
async function porMute(groupJid, jid, { until = null, by = '', motivo = '' } = {}) {
  const alvo = String(jid || '');
  if (!alvo) return { ok: false, erro: 'sem alvo' };
  try {
    const GS = GroupSettings();
    const gs = (await GS.findOneAndUpdate(
      { groupJid: String(groupJid) },
      { $setOnInsert: { groupJid: String(groupJid) } },
      { upsert: true, new: true }
    )) || null;
    if (!gs) return { ok: false, erro: 'sem documento do grupo' };
    gs.mutedUsers = (gs.mutedUsers || []).filter((m) => m.jid !== alvo);
    gs.mutedUsers.push({ jid: alvo, until: until ? new Date(until) : null, by: String(by || ''), motivo: String(motivo || ''), at: new Date() });
    gs.markModified && gs.markModified('mutedUsers');
    await gs.save();
    _cacheUpdate(groupJid, alvo, until ? until.getTime() : null);
    return { ok: true };
  } catch (e) { return { ok: false, erro: String(e.message || e).slice(0, 90) }; }
}

module.exports = { temMute, tirarMute, porMute };
