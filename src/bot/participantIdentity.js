'use strict';

/**
 * Identidade de participantes WhatsApp — PN <-> LID sem expor o LID.
 *
 * O `@lid` é um identificador interno de privacidade, não é um número de
 * telefone e nunca deve ser convertido em dígitos para exibição ou menção
 * textual. Quando o Baileys fornecer apenas LID, tenta-se a resolução local
 * oficial `signalRepository.lidMapping.getPNForLID()`; sem mapeamento, a
 * identidade fica deliberadamente sem número em vez de inventar um.
 */

function string(v) { return typeof v === 'string' ? v.trim() : ''; }
function isLid(value) { return /@lid$/i.test(string(value)); }

function jidNumber(value) {
  const jid = string(value);
  if (!jid || isLid(jid)) return '';
  return jid.split(':')[0].split('@')[0].replace(/\D/g, '');
}

function pnJid(value) {
  const raw = string(value);
  if (!raw || isLid(raw)) return '';
  const number = jidNumber(raw);
  return number ? `${number}@s.whatsapp.net` : '';
}

function valuesOf(participant) {
  if (!participant) return [];
  if (typeof participant === 'string') return [participant];
  return [
    participant.phoneNumber, participant.pn, participant.pnJid,
    participant.id, participant.jid, participant.lid,
  ].filter(v => typeof v === 'string' && v);
}

/**
 * Normalização síncrona e conservadora. Um LID sem PN mantém `number` vazio.
 */
function normalizeParticipant(participant) {
  if (!participant) return null;
  const raw = participant;
  if (typeof participant === 'string') {
    const lid = isLid(participant) ? participant : '';
    const resolvedPn = lid ? '' : pnJid(participant);
    return {
      jid: resolvedPn || participant,
      pnJid: resolvedPn,
      phoneNumber: resolvedPn,
      number: resolvedPn ? jidNumber(resolvedPn) : '',
      lid,
      raw,
    };
  }
  if (typeof participant !== 'object') return null;

  const all = valuesOf(participant);
  const lid = string(participant.lid) || all.find(isLid) || '';
  const phoneCandidate = [participant.phoneNumber, participant.pn, participant.pnJid]
    .find(v => string(v) && !isLid(v));
  const idCandidate = [participant.id, participant.jid].find(v => string(v) && !isLid(v));
  const resolvedPn = pnJid(phoneCandidate || idCandidate || '');
  const originalId = string(participant.id || participant.jid || lid);

  return {
    // Para operações, PN é preferido. Sem PN, conserva-se o LID para o
    // protocolo, mas `number` continua vazio e não será interpolado no texto.
    jid: resolvedPn || originalId || lid,
    pnJid: resolvedPn,
    phoneNumber: resolvedPn,
    number: resolvedPn ? jidNumber(resolvedPn) : '',
    lid,
    notify: participant.notify || participant.pushName || '',
    name: participant.name || participant.verifiedName || '',
    raw,
  };
}

function sameParticipant(a, b) {
  const left = normalizeParticipant(a);
  const right = normalizeParticipant(b);
  if (!left || !right) return false;
  // Objectos internos já resolvidos (por exemplo o sujeito do X9) podem
  // transportar só `{ number }`; esse campo nunca é criado de um @lid.
  const explicitLeft = (a && typeof a === 'object' && /^[0-9]{7,}$/.test(String(a.number || ''))) ? String(a.number) : '';
  const explicitRight = (b && typeof b === 'object' && /^[0-9]{7,}$/.test(String(b.number || ''))) ? String(b.number) : '';
  const leftNumber = left.number || explicitLeft;
  const rightNumber = right.number || explicitRight;
  if (leftNumber && rightNumber) return leftNumber === rightNumber;
  const idsA = new Set([left.jid, left.pnJid, left.lid].filter(Boolean).map(x => String(x).toLowerCase()));
  return [right.jid, right.pnJid, right.lid]
    .filter(Boolean)
    .some(x => idsA.has(String(x).toLowerCase()));
}

function compatibleMetadataParticipant(identity, metadata) {
  const list = metadata?.participants || [];
  return list.find((candidate) => sameParticipant(identity, candidate)) || null;
}

async function mappedPnForLid(sock, lid) {
  if (!lid || !isLid(lid)) return '';
  try {
    const map = sock?.signalRepository?.lidMapping;
    if (!map || typeof map.getPNForLID !== 'function') return '';
    const mapped = await map.getPNForLID(lid);
    // Algumas versões devolvem string, outras devolvem um objecto JID.
    const candidate = typeof mapped === 'object'
      ? (mapped?.phoneNumber || mapped?.pn || mapped?.jid || mapped?.id || '')
      : mapped;
    return pnJid(candidate);
  } catch {
    return '';
  }
}

/**
 * Resolve PN de um participante sem nunca usar os dígitos do LID como
 * fallback. O metadata é consultado primeiro (não há I/O adicional), depois
 * a tabela de mapeamento privada do Signal local ao socket.
 */
async function resolveParticipant(sock, participant, metadata) {
  const identity = normalizeParticipant(participant);
  if (!identity || identity.number) return identity;

  const fromMetadata = compatibleMetadataParticipant(identity, metadata);
  const metaIdentity = fromMetadata && normalizeParticipant(fromMetadata);
  if (metaIdentity?.number) {
    return {
      ...identity,
      ...metaIdentity,
      // Prioriza nomes recebidos no evento; metadata completa os campos.
      notify: identity.notify || metaIdentity.notify,
      name: identity.name || metaIdentity.name,
      raw: identity.raw,
    };
  }

  const mapped = await mappedPnForLid(sock, identity.lid);
  if (!mapped) return identity;
  return {
    ...identity,
    jid: mapped,
    pnJid: mapped,
    phoneNumber: mapped,
    number: jidNumber(mapped),
  };
}

/** Enriquecimento reutilizável para group-participants.update. */
async function resolveGroupParticipantsEvent(sock, event, metadata) {
  if (!event || typeof event !== 'object') return event;
  const participants = Array.isArray(event.participants) ? event.participants : [];
  const resolvedParticipants = await Promise.all(
    participants.map(p => resolveParticipant(sock, p, metadata)),
  );
  const authorInfo = event.author ? await resolveParticipant(sock, event.author, metadata) : null;
  return {
    ...event,
    participants: resolvedParticipants.filter(Boolean),
    // Preservar o LID quando não há PN é útil para o protocolo; se houver
    // mapeamento seguro, o resto do bot recebe o PN canónico.
    author: authorInfo?.pnJid || event.author,
    authorInfo,
  };
}

module.exports = {
  isLid,
  jidNumber,
  pnJid,
  valuesOf,
  normalizeParticipant,
  sameParticipant,
  resolveParticipant,
  resolveGroupParticipantsEvent,
};
