'use strict';
/**
 * DARK BOT — BACKUP DE GRUPO (v7.75 PRO)
 *
 * O admin tira uma fotografia da config do grupo (!backupgp) e aplica-a
 * noutro grupo (!restoregp SIM). O backup vive no slot pessoal do admin
 * (BotConfig `backup_gp_<numero>`).
 *
 * Só entram campos de CONFIG. Fora ficam: identidade (jid/nome),
 * contadores, datas, aluguel/trial, presença da Aura e estatísticas.
 */

const BACKUP_FIELDS = [
  // modos por categoria
  'modeDownloads', 'modeStickers', 'modeIa', 'modeJogos', 'modeEconomia',
  'modeInteracoes', 'modeTexto', 'modeSearch', 'modeAudio', 'modeLogos', 'modeZoeira',
  // anti-link / spam / sticker
  'antilink', 'antilinkOptOut', 'antispamOptOut', 'antilinkMode', 'antilinkAction',
  'antilinkWhitelist', 'antilinkMaxWarns', 'antilinkDeleteMsg', 'antilinkNotify',
  'antilinkStrict', 'antilinkVipImmune',
  'antisticker', 'antistickerNotify',
  'antispam', 'antispamWindowMs', 'antispamMaxMsgs', 'antispamMaxWarns',
  // moderação geral
  'maxWarns', 'warnLimit', 'onlyAdmins', 'blockedCommands', 'blockedSubmenus',
  'rulesText',
  'inactiveEnabled', 'inactiveWarnDays', 'inactiveBanDays', 'inactiveAction',
  'inactiveNotifyPv', 'inactiveNotifyGroup',
  'idleNudgeEnabled', 'idleNudgeExplicit', 'idleNudgeHours',
  // welcome/goodbye
  'welcome', 'goodbye', 'customWelcome', 'customGoodbye',
  'welcomeEnabled', 'goodbyeEnabled', 'customWelcomeMsg', 'customGoodbyeMsg',
  'welcomeWithMedia', 'goodbyeWithMedia', 'welcome2', 'welcm3',
  'welcomeWithPhoto', 'welcomeWithMedia',
  // marca de stickers
  'stickerPackName', 'stickerAuthorName', 'stickerWmEnabled', 'stickerChannelUrl',
  'stickerChannelName', 'stickerWmBrand', 'stickerWmSlogan', 'stickerWmCta',
  'stickerWmLinkType', 'stickerPackId',
  // limites
  'freePvDailyLimit',
  // anti-tipos
  'antistatus', 'antimencao', 'antimencaoMax', 'antipagamento', 'antiinvisivel',
  'antiflood', 'antidoc', 'antiloc', 'antifigurinha', 'antifig', 'antibtn',
  'antipalavra', 'palavrasProibidas', 'antitoxic', 'antiporn',
  'antitiposMaxWarns', 'antitiposNotify', 'slowmode',
  // fobados / horários
  'antifoba', 'fobaBlacklist', 'autoapresentar', 'aberturaHora', 'fechamentoHora',
  // prefixo e tema
  'groupPrefix', 'groupTheme', 'botEnabled',
];

/** Extrai só os campos de config (para JSON/BotConfig). */
function extrair(gs) {
  const o = {};
  const src = typeof gs?.toObject === 'function' ? gs.toObject() : (gs || {});
  for (const f of BACKUP_FIELDS) {
    if (src[f] !== undefined) o[f] = src[f];
  }
  return o;
}

function slotDe(numero) {
  return 'backup_gp_' + String(numero || '').replace(/\D/g, '');
}

module.exports = { BACKUP_FIELDS, extrair, slotDe };
