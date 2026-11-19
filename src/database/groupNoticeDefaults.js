'use strict';

/**
 * Padrões únicos para os avisos operacionais de grupo.
 *
 * Os templates usam apenas variáveis resolvidas com segurança pelo motor de
 * eventos: {user}, {nome}, {grupo}, {membros}, {bot} e {dono}. Nunca contêm
 * um JID/LID cru.
 */

const NOTICE_DEFAULTS_VERSION = '2026-09-21-group-notices-off-v3';
const NOTICE_DEFAULTS_MARKER = `migration:${NOTICE_DEFAULTS_VERSION}`;
const STICKER_MODERATION_DEFAULTS_VERSION = '2026-11-06-sticker-moderation-v1';
const STICKER_MODERATION_DEFAULTS_MARKER = `migration:${STICKER_MODERATION_DEFAULTS_VERSION}`;

const DEFAULT_WELCOME_TEMPLATE = [
  '╭━━━〔 ✨ *BEM-VINDO(A)* 〕━━━╮',
  '┃ 👋 Olá, {user}!',
  '┃ 🌟 *{nome}*, agora fazes parte de',
  '┃    *{grupo}*',
  '┃ 👥 Comunidade: *{membros} membros*',
  '╰━━━━━━━━━━━━━━━━━━━━╯',
  '🤖 {bot}',
].join('\n');

const DEFAULT_GOODBYE_TEMPLATE = [
  '╭━━━〔 👋 *ATÉ BREVE* 〕━━━╮',
  '┃ {user} saiu de *{grupo}*.',
  '┃ Obrigado por fazeres parte',
  '┃ desta comunidade, *{nome}*.',
  '╰━━━━━━━━━━━━━━━━━━╯',
  '🤖 {bot}',
].join('\n');

/**
 * Default OFF escolhido pelo Dono para avisos de entrada/saída e X9.
 * Mantém templates e protecções no banco: se um admin voltar a ligar um
 * aviso, a personalização antiga continua disponível. Não altera Anti-Sticker
 * nem Anti-Fobados, que são mecanismos de segurança separados.
 */
function groupNoticeDefaultsPatch() {
  return {
    welcome: false,
    goodbye: false,
    welcomeEnabled: false,
    goodbyeEnabled: false,
    welcome2: false,
    welcm3: false,
    x9: false,
    botArrivalNotify: false,
    customWelcome: DEFAULT_WELCOME_TEMPLATE,
    customGoodbye: DEFAULT_GOODBYE_TEMPLATE,
    customWelcomeMsg: DEFAULT_WELCOME_TEMPLATE,
    customGoodbyeMsg: DEFAULT_GOODBYE_TEMPLATE,
  };
}

/**
 * Desactivação idempotente dos avisos de TODOS os grupos existentes.
 * É chamada uma única vez no boot seguinte ao deploy e marcada em BotConfig;
 * um restart não volta a desligar escolhas que um admin faça depois.
 */
async function applyApprovedGroupNoticeDefaults() {
  const GroupSettings = require('./models/GroupSettings');
  const BotConfig = require('./models/BotConfig');
  const alreadyApplied = await BotConfig.get(NOTICE_DEFAULTS_MARKER, null).catch(() => null);
  if (alreadyApplied?.version === NOTICE_DEFAULTS_VERSION) {
    return { applied: false, reason: 'already-applied', matched: 0, modified: 0 };
  }

  const result = await GroupSettings.updateMany({}, { $set: groupNoticeDefaultsPatch() });
  const summary = {
    version: NOTICE_DEFAULTS_VERSION,
    appliedAt: new Date().toISOString(),
    matched: Number(result?.matchedCount || result?.n || 0),
    modified: Number(result?.modifiedCount || result?.nModified || 0),
  };
  await BotConfig.set(NOTICE_DEFAULTS_MARKER, summary);
  return { applied: true, ...summary };
}

/** Activa só a moderação de stickers em bancos que já receberam o reset v1. */
async function applyApprovedStickerModerationDefaults() {
  const GroupSettings = require('./models/GroupSettings');
  const BotConfig = require('./models/BotConfig');
  const alreadyApplied = await BotConfig.get(STICKER_MODERATION_DEFAULTS_MARKER, null).catch(() => null);
  if (alreadyApplied?.version === STICKER_MODERATION_DEFAULTS_VERSION) {
    return { applied: false, reason: 'already-applied', matched: 0, modified: 0 };
  }
  const result = await GroupSettings.updateMany({}, { $set: { antisticker: true, antistickerNotify: true } });
  const summary = {
    version: STICKER_MODERATION_DEFAULTS_VERSION,
    appliedAt: new Date().toISOString(),
    matched: Number(result?.matchedCount || result?.n || 0),
    modified: Number(result?.modifiedCount || result?.nModified || 0),
  };
  await BotConfig.set(STICKER_MODERATION_DEFAULTS_MARKER, summary);
  return { applied: true, ...summary };
}

module.exports = {
  NOTICE_DEFAULTS_VERSION,
  NOTICE_DEFAULTS_MARKER,
  STICKER_MODERATION_DEFAULTS_VERSION,
  STICKER_MODERATION_DEFAULTS_MARKER,
  DEFAULT_WELCOME_TEMPLATE,
  DEFAULT_GOODBYE_TEMPLATE,
  groupNoticeDefaultsPatch,
  applyApprovedGroupNoticeDefaults,
  applyApprovedStickerModerationDefaults,
};
