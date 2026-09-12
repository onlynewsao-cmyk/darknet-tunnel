const mongoose = require('mongoose');

const GroupSettingsSchema = new mongoose.Schema({
  groupJid: { type: String, required: true, unique: true, index: true },
  groupName: { type: String, default: '' },

  botEnabled: { type: Boolean, default: true },

  // ── Anti-link ──────────────────────────────────────────
  antilink: { type: Boolean, default: false },
  antilinkOptOut: { type: Boolean, default: false },   // v7.35: grupo desligou explicitamente (ignora global do dashboard)
  antispamOptOut: { type: Boolean, default: false },
  antilinkMode: {
    type: String,
    // smart=só WA/Telegram | all_links=qualquer link | whatsapp_only=só invite WA
    enum: ['smart', 'whatsapp_only', 'all_links'],
    default: 'smart'
  },
  antilinkAction: { type: String, enum: ['warn', 'kick', 'delete'], default: 'warn' },
  antilinkWhitelist: [{ type: String }],  // ex: ['youtube.com', 'github.com']
  antilinkMaxWarns: { type: Number, default: 2 },
  antilinkDeleteMsg: { type: Boolean, default: true },  // apagar a msg com link
  antilinkNotify: { type: Boolean, default: true },     // avisar no grupo
  // DarkShield v2 (v5.1)
  antilinkStrict: { type: Boolean, default: true },     // detecta links ofuscados (hxxp, [.] ...)
  antilinkVipImmune: { type: Boolean, default: false }, // premium imune
  antilinkStats: {
    deleted:    { type: Number, default: 0 },
    warns:      { type: Number, default: 0 },
    kicks:      { type: Number, default: 0 },
    lastAction: { type: Date, default: null },
  },

  // ── Anti-figurinha aprendida (v6.87) ────────────────────────
  // O admin responde a uma figurinha com !bansticker e o bot aprende-a
  // (identidade = fileSha256 da metadata, sem download). Ver antiSticker.js.
  antisticker: { type: Boolean, default: false },
  antistickerNotify: { type: Boolean, default: true },
  antistickerStats: {
    deleted:    { type: Number, default: 0 },
    lastAction: { type: Date, default: null },
  },

  // ── Anti-spam ────────────────────────────────────────
  antispam: { type: Boolean, default: false },
  antispamWindowMs: { type: Number, default: 5000 },  // janela de 5s
  antispamMaxMsgs: { type: Number, default: 5 },      // max msgs na janela
  antispamMaxWarns: { type: Number, default: 3 },

  maxWarns: { type: Number, default: 3 },

  welcome: { type: Boolean, default: true },
  goodbye: { type: Boolean, default: true },

  customWelcome: { type: String, default: '' },
  customGoodbye: { type: String, default: '' },

  onlyAdmins: { type: Boolean, default: false },
  blockedCommands: [{ type: String }],
  blockedSubmenus: [{ type: String }],
  // ── Prefixo por grupo (v5.2) ─────────────────────────────────
  groupPrefix: { type: String, default: null },  // ex: '/' — override do global neste grupo
  // ── Tema por grupo (v5.3) ────────────────────────────────────
  groupTheme: { type: String, default: null },   // ex: 'cyber' — override do global neste grupo

  // ── Modo da AURA por grupo (v6.43) ───────────────────────────
  // 'assistant' → assistente profissional neutro (padrão, estilo Meta AI)
  // 'aura'      → AURA original, só onde o Dono Supremo a invocou
  auraMode:      { type: String, enum: ['assistant', 'aura', 'sleep'], default: 'assistant', index: true },
  auraInvokedBy: { type: String, default: '' },   // número do dono que a invocou
  auraInvokedAt: { type: Date,   default: null },

  participantsCount: { type: Number, default: 0 },
  totalMessages: { type: Number, default: 0 },
  totalCommands: { type: Number, default: 0 },

  lastActivity: { type: Date, default: Date.now },
  lastIdleNudgeAt: { type: Date, default: null },

  // Dark Side Engine — regras, atividade e moderação automática
  rulesText: { type: String, default: '' },
  inactiveEnabled: { type: Boolean, default: false },
  inactiveWarnDays: { type: Number, default: 7 },
  inactiveBanDays: { type: Number, default: 30 },
  inactiveAction: { type: String, enum: ['warn', 'ban'], default: 'warn' },
  inactiveNotifyPv: { type: Boolean, default: true },
  inactiveNotifyGroup: { type: Boolean, default: true },
  idleNudgeEnabled: { type: Boolean, default: false },
  idleNudgeExplicit: { type: Boolean, default: false },
  idleNudgeHours: { type: Number, default: 24 },
  warnLimit: { type: Number, default: 3 },

  // ── Hospedagem / Aluguel ──────────────────────────────────
  isHosted: { type: Boolean, default: false },
  trialExpiresAt: { type: Date, default: () => new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) }, // 3 dias trial
  hostedUntil: { type: Date, default: null },
  commandsUsedToday: { type: Number, default: 0 },
  lastResetDate: { type: String, default: () => new Date().toISOString().split('T')[0] },

  // Quem adicionou o aluguel (número do dono/subdono/vip)
  rentedBy: { type: String, default: '' },
  rentedAt: { type: Date, default: null },

  // ── Welcome / Goodbye por grupo ───────────────────────────
  welcomeEnabled: { type: Boolean, default: true },
  goodbyeEnabled: { type: Boolean, default: true },
  customWelcomeMsg: { type: String, default: '' },  // {user} {grupo} {bot}
  customGoodbyeMsg: { type: String, default: '' },
  welcomeWithPhoto: { type: Boolean, default: true },
  welcomeWithMedia: { type: String, default: '' },  // URL de imagem de boas-vindas

  // ── Sticker pack / marca d'água por grupo ─────────────────
  stickerPackName:     { type: String, default: '' },
  stickerAuthorName:   { type: String, default: '' },
  stickerWmEnabled:    { type: Boolean, default: false },
  stickerChannelUrl:   { type: String, default: '' },
  stickerChannelName:  { type: String, default: '' },
  stickerWmBrand:      { type: String, default: 'DARK NET 🕸️' },
  stickerWmSlogan:     { type: String, default: 'O melhor canal do mundo' },
  stickerWmCta:        { type: String, default: 'Siga o canal' },
  stickerWmLinkType:   { type: String, default: '' },
  stickerPackId:       { type: String, default: '' },

  // ── Limites free por grupo ────────────────────────────────
  freePvDailyLimit:  { type: Number, default: 20 },  // comandos PV para free por dia


  // ── v7.46 Anti-tipos (executados por antiTipos.js) ─────────
  antistatus:     { type: Boolean, default: false },
  antimencao:     { type: Boolean, default: false },
  antimencaoMax:  { type: Number,  default: 8 },
  antipagamento:  { type: Boolean, default: false },
  antiinvisivel:  { type: Boolean, default: false },
  antiflood:      { type: Boolean, default: false },
  antidoc:        { type: Boolean, default: false },
  antiloc:        { type: Boolean, default: false },
  antifigurinha:  { type: Boolean, default: false },
  antifig:        { type: Boolean, default: false },
  antibtn:        { type: Boolean, default: false },
  antipalavra:    { type: Boolean, default: false },
  palavrasProibidas: [{ type: String }],
  antitoxic:      { type: Boolean, default: false },
  antiporn:       { type: Boolean, default: false },
  antitiposMaxWarns: { type: Number, default: 3 },
  antitiposNotify:   { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('GroupSettings', GroupSettingsSchema);
