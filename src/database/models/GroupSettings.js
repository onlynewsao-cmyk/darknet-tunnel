const mongoose = require('mongoose');

const GroupSettingsSchema = new mongoose.Schema({
  groupJid: { type: String, required: true, unique: true, index: true },
  groupName: { type: String, default: '' },

  botEnabled: { type: Boolean, default: true },

  // ── v7.61 MODOS por categoria (undefined = ON, fail-open) ──
  modeDownloads:  { type: Boolean, default: true },
  modeStickers:   { type: Boolean, default: true },
  modeIa:         { type: Boolean, default: true },
  modeJogos:      { type: Boolean, default: true },
  modeEconomia:   { type: Boolean, default: true },
  modeInteracoes: { type: Boolean, default: true },
  modeTexto:      { type: Boolean, default: true },
  modeSearch:     { type: Boolean, default: true },
  modeAudio:      { type: Boolean, default: true },
  modeLogos:      { type: Boolean, default: true },
  modeZoeira:     { type: Boolean, default: true },

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
  trialExpiresAt: { type: Date, default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }, // v7.67: 7 dias trial
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
  goodbyeWithMedia: { type: String, default: '' },  // URL de imagem de despedida
  welcome2: { type: Boolean, default: false },   // v8.4: foto IA de entrada (PIP)
  welcm3: { type: Boolean, default: false },     // v8.4: GIF animado de entrada

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

  // ── v7.86 Antis de mídia + AUTO-VISU1 ──────────────────────
  // v7.89 FIX: estavam FORA do schema — o mongoose (strict) apagava-os
  // ao gravar, o `!antifoto on` dizia "ON" mas nada persistia e os
  // antis NUNCA disparavam ao vivo. Agora gravam de verdade.
  antifoto:       { type: Boolean, default: false },
  antivideo:      { type: Boolean, default: false },
  antiaudio:      { type: Boolean, default: false },
  antitexto:      { type: Boolean, default: false },
  anticontacto:   { type: Boolean, default: false },
  autoVisu1:      { type: Boolean, default: true },   // converte foto/vídeo em ver-uma-vez
  autoDl:         { type: Boolean, default: false },  // v7.84: links aceites baixam sozinhos

  // ── v7.87/7.88: mundo RPG do grupo (rpg/gate.js lê gs.modorpg) ──
  modorpg:        { type: Boolean, default: false },

  // ── toggles de admin históricos: agora persistem (sem leitor ainda) ──
  antidemote:     { type: Boolean, default: false },
  automsg:        { type: Boolean, default: false },
  autosticker:    { type: Boolean, default: false },
  assistente:     { type: Boolean, default: false },
  modobn:         { type: Boolean, default: false },
  modolite:       { type: Boolean, default: false },
  modoparceria:   { type: Boolean, default: false },
  modoraid:       { type: Boolean, default: false },
  invisible:      { type: Boolean, default: false },
  banghost:       { type: Boolean, default: false },
  cmdlimit:       { type: Boolean, default: false },
  minmessage:     { type: Boolean, default: false },
  limitmessage:   { type: Boolean, default: false },
  dellimitmessage:{ type: Boolean, default: false },
  mantercontador: { type: Boolean, default: false },
  infoperso:      { type: Boolean, default: false },
  fotomenugrupo:  { type: Boolean, default: false },

  // ── v7.75 Grupos PRO: modo lento (segundos entre msgs por membro; 0 = off)
  slowmode: { type: Number, default: 0 },

  // ── v7.47 incoming-cases: anti-fobados / auto-apresentação / abrir-fechar ──
  antifoba:       { type: Boolean, default: false },   // divulgação oculta + DDI blacklist (ban imediato)
  fobaBlacklist:  [{ type: String }],                  // DDIs bloqueados à entrada (ex: ['63'])
  autoapresentar: { type: Boolean, default: false },   // novo membro tem 5 min para falar
  aberturaHora:   { type: String, default: '' },       // 'HH:MM' Africa/Luanda — abrir grupo
  fechamentoHora: { type: String, default: '' },       // 'HH:MM' Africa/Luanda — fechar grupo
  // ── v11.2.2 Admin extra (ex-stubs audioAdmin2) ──────────────
  blacklist:       [{ type: String }],   // números bloqueados neste grupo
  blockedUsers:    [{ type: String }],   // alias operacional de blacklist
  mods:            [{ type: String }],   // moderadores do bot (não precisam ser WA-admin)
  modCommands:     [{ type: String }],   // cmds extra concedidos a mods
  autoAdmins:      [{ type: String }],   // promovidos a admin WA ao entrar
  autoAdmMedia:    { type: Boolean, default: false }, // auto-adm também em midia/status
  parcerias:       [{ type: String }],   // links/JIDs de grupos parceiros (whitelist antilink)
  x9:              { type: Boolean, default: false }, // avisa promote/demote/add/remove
  captcha:         { type: Boolean, default: false }, // exige resposta simples a novos
  multiprefixo:    { type: Boolean, default: false }, // aceita prefixos globais + do grupo
  groupEmoji:      { type: String, default: '' },
  empregoNome:     { type: String, default: '' },
  banMsg:          { type: String, default: '' },     // msg custom ao banir (!setbammsg)
  autorepo:        { type: Boolean, default: false }, // repor regras/aviso periódico
  captchaPending:  { type: Map, of: String, default: undefined }, // runtime-ish (opcional)

  horariosExecuted: {                                   // último dia executado (evita repetir)
    abertura:   { type: String, default: '' },
    fechamento: { type: String, default: '' },
  },
}, { timestamps: true });

module.exports = mongoose.model('GroupSettings', GroupSettingsSchema);
