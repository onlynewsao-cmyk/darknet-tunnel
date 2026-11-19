'use strict';
/**
 * Identidade visual para cartões/fotos/GIFs.
 *
 * Obtém apenas a URL temporária da foto de perfil quando o WhatsApp já a
 * disponibiliza à sessão. Não força privacidade, não transforma dígitos de
 * LID em telefone e não grava foto/URL em banco ou disco.
 */
const { normalizeParticipant, resolveParticipant, pnJid } = require('./participantIdentity');

function _httpsUrl(value) {
  const url = String(value || '').trim();
  return /^https:\/\//i.test(url) ? url : '';
}

function _unique(values) {
  return [...new Set(values.filter(Boolean).map(v => String(v).trim()))];
}

/**
 * Resolve uma imagem de perfil que o próprio WhatsApp permite acessar.
 * `participant` pode ser PN, LID ou o participante do evento; em LID, usa
 * primeiro o mapeamento oficial local, sem inventar um número a partir dele.
 */
async function resolveVisualProfile(sock, participant, { metadata = null, fallbackJid = '' } = {}) {
  if (!sock || typeof sock.profilePictureUrl !== 'function') return { url: '', jid: '', reason: 'sem_suporte' };

  let identity = normalizeParticipant(participant);
  try { identity = await resolveParticipant(sock, participant, metadata); } catch {}

  const raw = typeof participant === 'string' ? participant.trim() : '';
  const rawPn = raw && !/@/i.test(raw) ? pnJid(raw) : '';
  // PN primeiro; LID só como fallback de protocolo. O LID nunca é exibido.
  const candidates = _unique([
    identity?.pnJid,
    identity?.jid,
    identity?.lid,
    rawPn,
    raw,
    fallbackJid,
  ]).filter(jid => !/@g\.us$/i.test(jid)); // nunca usa avatar do grupo como retrato da pessoa

  for (const jid of candidates) {
    try {
      const url = _httpsUrl(await sock.profilePictureUrl(jid, 'image'));
      if (url) return { url, jid, reason: 'ok' };
    } catch {}
  }
  return { url: '', jid: identity?.pnJid || identity?.jid || '', reason: 'indisponivel' };
}

module.exports = { resolveVisualProfile };
