'use strict';

/**
 * Fonte única de verdade para automações de grupo pagas.
 *
 * Um grupo só pode executar automações que escrevem/apagam/removem quando
 * tem aluguel ativo ou trial ainda válido. Isto é deliberadamente separado
 * do acesso pessoal VIP/Owner aos comandos: privilégios de uma pessoa não
 * podem transformar um grupo sem ativação em um grupo moderado pelo bot.
 */
function toMs(value) {
  if (!value) return 0;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function hasActiveEntitlement(settings, now = Date.now()) {
  if (!settings) return false;
  const hosted = settings.isHosted === true;
  const hostedRaw = settings.hostedUntil;
  const hostedUntil = toMs(hostedRaw);
  const trialUntil = toMs(settings.trialExpiresAt);
  // Alguns alugueis legados são permanentes e não têm hostedUntil. Um valor
  // inválido, por outro lado, nunca pode transformar um grupo em activo.
  const permanentHosted = hostedRaw == null || hostedRaw === '';
  if (hosted && (permanentHosted || hostedUntil > now)) return true;
  return trialUntil > now;
}

/** Consulta curta para processos sem uma mensagem (timers/AURA agendada). */
async function groupHasActiveEntitlement(groupJid) {
  const jid = String(groupJid || '');
  if (!jid.endsWith('@g.us')) return false;
  try {
    const GroupSettings = require('../database/models/GroupSettings');
    let query = GroupSettings.findOne({ groupJid: jid });
    if (typeof query?.lean === 'function') query = query.lean();
    return hasActiveEntitlement(await query);
  } catch { return false; }
}

module.exports = { hasActiveEntitlement, groupHasActiveEntitlement, toMs };
