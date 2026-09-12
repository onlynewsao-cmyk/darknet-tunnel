const config = require('../config');
const Command = require('../database/models/Command');
const User = require('../database/models/User');
const requestCache = require('./requestCache');
const botConfigCache = require('./botConfigCache');
const Log = require('../database/models/Log');
const AiMemory = require('../database/models/AiMemory');
const DecryptLog = require('../database/models/DecryptLog');
const mediaHandler = require('./mediaHandler');
const stickerMaker = require('./stickerMaker');
const nativeCommands = require('./nativeCommands');
const interactions = require('./packages/interactions');
const family = require('./packages/family');
const economy = require('./packages/economy');
const games = require('./packages/games');
const cheats = require('./packages/cheats');
const reactions = require('./reactions');

// Unifica todos os pacotes num só objeto (pre-loaded)
const packageCommands = { ...interactions, ...family, ...economy, ...games, ...cheats };
const ai = require('./ai');
const decrypter = require('../decrypter');
const { formatForWhatsApp } = require('../decrypter/formatter');
const prefixManager = require('./prefixManager');
const prefixEngine  = require('./prefixEngine');
const CommandOverride = require('../database/models/CommandOverride');
const userManager = require('./userManager');
const path = require('path');
const caseHandler = require('./caseHandler');

// Inicializa os cases ao arrancar
caseHandler.init();

/**
 * WhatsApp real envolve o conteúdo em ephemeral / viewOnce / edited.
 * Sem desembrulhar, o PV chega "vazio" e a AURA fica muda.
 */
function unwrapWhatsAppMessage(message) {
  if (!message || typeof message !== 'object') return message || {};
  const WRAP = [
    'ephemeralMessage',
    'viewOnceMessage',
    'viewOnceMessageV2',
    'viewOnceMessageV2Extension',
    'documentWithCaptionMessage',
    'editedMessage',
    'associatedChildMessage',
  ];
  let cur = message;
  for (let i = 0; i < 6 && cur; i++) {
    let next = null;
    for (const w of WRAP) {
      if (cur[w]?.message) { next = cur[w].message; break; }
    }
    if (!next) break;
    cur = next;
  }
  return cur;
}

function normalizeIncomingMsg(msg) {
  if (!msg?.message) return msg;
  const inner = unwrapWhatsAppMessage(msg.message);
  const key = msg.key || {};

  // WhatsApp moderno pode entregar o PV com `remoteJid` em @lid.
  // O LID identifica a conta, mas algumas versões do Baileys aceitam
  // melhor o PN (@s.whatsapp.net) no sendMessage. Quando o WhatsApp
  // fornece o JID alternativo, normalizamos SOMENTE o PV para o PN.
  // Sem alternativa, preservamos o LID original.
  const isPrivateLid = /@lid$/i.test(String(key.remoteJid || ''));
  const alternateJid = key.remoteJidAlt || key.remoteJidPn || '';
  const normalizedKey = isPrivateLid && /@(s\.whatsapp\.net|c\.us)$/i.test(String(alternateJid))
    ? { ...key, remoteJid: alternateJid }
    : key;

  if (inner === msg.message && normalizedKey === key) return msg;
  return { ...msg, key: normalizedKey, message: inner };
}

function hasMediaPayload(message) {
  const m = unwrapWhatsAppMessage(message || {});
  return !!(
    m.audioMessage || m.imageMessage || m.videoMessage || m.stickerMessage ||
    m.documentMessage || m.documentWithCaptionMessage || m.ptvMessage ||
    m.albumMessage || m.stickerPackMessage
  );
}

function isIgnorableWhatsAppNoise(message) {
  if (!message) return true;
  const keys = Object.keys(message);
  if (!keys.length) return true;
  const ignore = new Set([
    'protocolMessage', 'senderKeyDistributionMessage', 'reactionMessage',
    'encReactionMessage', 'keepInChatMessage', 'pinInChatMessage',
    'messageContextInfo',
  ]);
  return keys.every(k => ignore.has(k));
}

/**
 * Extrai texto de QUALQUER tipo de mensagem WhatsApp/Baileys.
 * Cobre: texto, botões, listas, nativeFlow, quick_reply, single_select,
 * templateButtonReply, buttonsResponse — sem perder nenhuma resposta de botão.
 */
function extractText(msg) {
  const m = unwrapWhatsAppMessage(msg.message);
  if (!m) return '';

  // 1. Texto normal
  let text =
    m?.conversation ||
    m?.extendedTextMessage?.text ||
    m?.imageMessage?.caption ||
    m?.videoMessage?.caption ||
    m?.documentMessage?.caption ||
    m?.documentWithCaptionMessage?.message?.documentMessage?.caption || '';
  if (text) return text;

  // 2. Resposta de botão clássico (MD / template)
  text =
    m?.buttonsResponseMessage?.selectedButtonId ||
    m?.templateButtonReplyMessage?.selectedId ||
    m?.listResponseMessage?.singleSelectReply?.selectedRowId || '';
  if (text) return text;

  // 3. interactiveResponseMessage — NativeFlow / quick_reply / single_select
  const irm = m?.interactiveResponseMessage;
  if (irm) {
    if (irm.selectedButtonId) return irm.selectedButtonId;

    // paramsJson é o campo principal dos botões nativeFlow
    const paramsRaw = irm?.nativeFlowResponseMessage?.paramsJson || irm?.paramsJson || '';
    if (paramsRaw) {
      try {
        const p = JSON.parse(paramsRaw);
        text = p.id || p.selected_id || p.selectedRowId || p.rowId ||
               p.row_id || p.button_id || p.buttonId || p.value ||
               p.display_text || p.text || '';
        if (text) return text;
      } catch {}
    }

    // body.text como fallback
    if (irm.body?.text) return irm.body.text;
  }

  // 4. Enquete
  if (m?.pollUpdateMessage?.vote?.selectedOptions?.length) {
    return m.pollUpdateMessage.vote.selectedOptions[0] || '';
  }

  return '';
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function startsWithAnyPrefix(text, prefixes) {
  return prefixes.some(p => text.startsWith(p));
}

// v7.25: mensagem que COMEÇA com um símbolo de prefixo de comando
// (!menu, .play, $saldo, #vip…) NUNCA é conversa — é uma tentativa de
// comando. A AURA respondia a comandos com prefixo "errado" (que o
// prefixEngine não reconhecia como activo) porque o gate só cobria
// ! . /. Agora qualquer símbolo de comando é ignorado pela AURA.
const _PREFIXO_COMANDO = /^[!$./#?*>+=\-~%&|\\]/;
function pareceComando(texto) {
  const c = String(texto || '').trimStart()[0];
  return !!c && _PREFIXO_COMANDO.test(c);
}

async function isGroupAdminForHandler(sock, ctx) {
  if (!ctx.isGroup) return false;
  try {
    const meta = ctx.groupMeta || await sock.groupMetadata(ctx.remoteJid);
    const ids = (v) => {
      const raw = String(v || '').split(':')[0].trim().toLowerCase();
      if (!raw) return [];
      return [raw, raw.split('@')[0]];
    };
    const senderIds = new Set([
      ...ids(ctx.senderJid), ...ids(ctx.senderLid), ...ids(ctx.senderNumber),
    ]);
    return !!meta?.participants?.some((p) => {
      const participantIds = [p?.id, p?.jid, p?.lid, p?.pn, p?.phoneNumber]
        .flatMap(ids);
      const admin = p?.admin === 'admin' || p?.admin === 'superadmin' || p?.isAdmin === true;
      return admin && participantIds.some(id => senderIds.has(id));
    });
  } catch { return false; }
}

// v6.56: conta mensagens desde a última vez que a AURA falou num chat.
// Serve para ela não responder a tudo seguido — quem acabou de falar
// tende a deixar os outros falarem.
const _msgCount = new Map();
// Proteção global contra rajadas da AURA. O modo PV continua ativo, mas
// mensagens repetidas/concorrentes não podem gerar spam no WhatsApp.
// Deduplica somente o mesmo evento/mensagem. Um cooldown por chat de 8s
// silenciava mensagens legítimas seguidas, sobretudo no PV.
const _auraReplySeen = new Map();
const AURA_SEEN_TTL_MS = 10 * 60 * 1000;
function _contaMsg(jid) {
  _msgCount.set(jid, (_msgCount.get(jid) || 0) + 1);
}
function _msgsDesdeAura(jid) {
  return _msgCount.get(jid) || 0;
}
function _resetMsgs(jid) {
  _msgCount.set(jid, 0);
}

function getSenderInfo(msg) {
  const remoteJid = msg.key.remoteJid;
  const isGroup = remoteJid?.endsWith('@g.us');
  const rawSenderJid = isGroup ? (msg.key.participant || remoteJid) : remoteJid;

  // v6.53: o WhatsApp moderno identifica contas por LID (`…@lid`) em vez
  // do número. No PV, senderNumber saía como '189234567890123' em vez de
  // '244945280380' — o isOwner falhava e a AURA respondia ao próprio Dono
  // com "Não respondo a desconhecidos".
  // O Baileys dá o número real em participantAlt/remoteJidAlt; usamos
  // esse quando o JID principal é um LID.
  const alt = isGroup
    ? (msg.key.participantAlt || msg.key.participantPn || '')
    : (msg.key.remoteJidAlt || msg.key.remoteJidPn || '');

  const ehLid = /@lid$/i.test(rawSenderJid || '');
  const altValido = /@(s\.whatsapp\.net|c\.us)$/i.test(String(alt || ''));
  // Usa o PN também nas ações que precisam falar com o remetente,
  // como "AURA, chama-me no PV". Mantemos o LID separado para
  // identificação/menções quando o PN não existe.
  const senderJid = ehLid && altValido ? String(alt) : rawSenderJid;
  const base = (ehLid && alt) ? alt : rawSenderJid;

  const senderNumber = (base || '').split(':')[0].split('@')[0] || '';
  const senderLid = ehLid ? String(rawSenderJid).split('@')[0] : '';
  const pushName = msg.pushName || 'Usuário';

  return { remoteJid, isGroup, senderJid, senderNumber, senderLid, pushName };
}


function getMessageContextInfo(msg) {
  const m = unwrapWhatsAppMessage(msg?.message || {});
  return m.extendedTextMessage?.contextInfo ||
    m.imageMessage?.contextInfo ||
    m.videoMessage?.contextInfo ||
    m.stickerMessage?.contextInfo ||
    m.audioMessage?.contextInfo ||
    m.buttonsResponseMessage?.contextInfo ||
    m.interactiveResponseMessage?.contextInfo ||
    {};
}

function getQuotedMessage(msg) {
  return getMessageContextInfo(msg).quotedMessage || null;
}

function getDocumentFromMessageObject(messageObj) {
  return messageObj?.documentMessage || messageObj?.documentWithCaptionMessage?.message?.documentMessage || null;
}

function buildQuotedDownloadMessage(msg) {
  const ctxInfo = getMessageContextInfo(msg);
  const quotedMessage = ctxInfo.quotedMessage;
  if (!quotedMessage) return null;
  return {
    key: {
      remoteJid: msg.key.remoteJid,
      id: ctxInfo.stanzaId || msg.key.id,
      participant: ctxInfo.participant || msg.key.participant,
      fromMe: false,
    },
    message: quotedMessage,
  };
}

function fillVars(text, ctx) {
  return text
    .replace(/{user}/gi, ctx.pushName).replace(/{number}/gi, ctx.senderNumber)
    .replace(/{bot}/gi, ctx.botName || config.bot.name).replace(/{owner}/gi, config.owner.name)
    .replace(/{group}/gi, ctx.groupName || 'privado').replace(/{prefix}/gi, ctx.prefix || config.bot.prefix)
    .replace(/{treatment}/gi, ctx.treatment || 'meu nobre 🕸️')
    .replace(/{date}/gi, new Date().toLocaleDateString('pt-BR'))
    .replace(/{time}/gi, new Date().toLocaleTimeString('pt-BR'));
}

// Cache simples para group metadata (evita chamadas repetidas)
const groupMetaCache = new Map();
const GROUP_META_TTL = 30000; // 30 segundos (reduzido para dados mais frescos)
const botChatCooldown = new Map();


function getUserTreatment(user, ctx, isPrimaryOwner) {
  if (isPrimaryOwner) return `meu Criador Supremo ${config.owner.name} 👑🕸️`;
  if (!user || !user.gender || user.gender === 'unknown') return 'meu nobre 🕸️';
  if (user.gender === 'male') return 'meu Rei 👑';
  if (user.gender === 'female') return 'minha Rainha ✨';
  return 'meu nobre 🕸️';
}

function isGreetingText(text) {
  return /^(oi|ol[aá]|hello|hi|hey|salve|bom dia|boa tarde|boa noite)\b[\w\s@.!?_-]{0,40}$/i.test(String(text || '').trim());
}

function isLikelyBotSender(ctx, text) {
  const name = String(ctx.pushName || '').toLowerCase();
  const t = String(text || '').toLowerCase();
  return /\b(bot|robot|robô|robo|ia|ai|gpt|assistant|assistente)\b/i.test(name) ||
         /\b(sou|eu sou).{0,20}\b(bot|robô|robo|ia|assistente)\b/i.test(t);
}

function canBotChat(ctx) {
  const key = `${ctx.remoteJid}:${ctx.senderNumber}`;
  const last = botChatCooldown.get(key) || 0;
  if (Date.now() - last < 10 * 60 * 1000) return false;
  botChatCooldown.set(key, Date.now());
  return true;
}

async function isVipCommand(commandName) {
  const defaults = ['decrypt','vpn','vpndec','play3','video2','statusvideo','ptv','figubug2','gimage','audiomeme','vinil','sfull','noticias','pesquisar','resumir'];
  const cmd = String(commandName).toLowerCase();
  // pin/pinmp4 deixou de ser VIP — o case e o nativo são para todos
  if (['pinmp4', 'pinvd', 'pinvideo', 'pin', 'polo'].includes(cmd)) return false;
  try {
    const custom = await botConfigCache.get('vip_commands', defaults);
    const list = Array.isArray(custom) ? custom : String(custom || '').split(/[\s,]+/).filter(Boolean);
    return list.map(x => String(x).toLowerCase()).includes(cmd);
  } catch { return defaults.includes(cmd); }
}

// Verifica premium para documentos Mongoose OU POJOs (sem métodos)
function checkIsPremium(u) {
  if (!u) return false;
  if (typeof u.isPremium === 'function') return u.isPremium();
  if (u.role === 'owner') return true;
  if (u.role !== 'premium') return false;
  if (!u.premiumUntil) return true;
  return new Date(u.premiumUntil) > new Date();
}
async function userIsPremiumOrOwner(number, isOwner) {
  if (isOwner) return true;
  const u = await User.findOne({ whatsappNumber: number }).lean().catch(() => null);
  return checkIsPremium(u);
}

// ── v6.94: aviso de grupo sem aluguel (a assistente ajuda, não se cala) ──
const _avisoAluguelTs = new Map(); // "grupo:sender" → ts do último aviso
const AVISO_ALUGUEL_MS = 6 * 60 * 60 * 1000;
async function _avisoSemAluguel(sock, msg, ctx) {
  try {
    if (!ctx?.isGroup || !ctx?.remoteJid) return;
    // v7.36: 1 aviso por GRUPO a cada 6h (era por grupo+pessoa → N avisos
    // num grupo grande). Quem mandou o comando é mencionado.
    const k = ctx.remoteJid;
    const agora = Date.now();
    if (_avisoAluguelTs.size > 500) _avisoAluguelTs.clear(); // fuga de memória
    if (agora - (_avisoAluguelTs.get(k) || 0) < AVISO_ALUGUEL_MS) return;
    _avisoAluguelTs.set(k, agora);
    const donoNum = String(config.owner?.number || '').replace(/\D/g, '');
    await sock.sendMessage(ctx.remoteJid, {
      text:
        '🤖 *Assistente DARK*\n' +
        'Este grupo não tem aluguel activo, por isso os comandos completos ficam bloqueados.\n\n' +
        (donoNum ? `📲 Para activar fala com o Dono: wa.me/${donoNum}\n` : '') +
        '💬 No privado do bot respondo a qualquer pessoa, sempre.',
    }, { quoted: msg }).catch(() => {});
  } catch (_) {}
}

async function _handleInner(sock, msg) {
  let text = extractText(msg).trim();
  const hasIncomingMedia = hasMediaPayload(msg.message);
  if (!text && !hasIncomingMedia) return false;
  try {
    const { eSoPontuacao } = require('../aura/auraSanitizer');
    if (eSoPontuacao(text) && !hasIncomingMedia) return false;
  } catch {}

  const ctx = getSenderInfo(msg);
  try { require('./stickerWm').bind(ctx); } catch {}

  // ── v7.21: resposta por número do cartão de música (som) ─────────
  // "01"/"02"/"03" (ou 1/2/3) logo após um !som — sem prefixo, mas só
  // actua se houver um cartão pendente para este chat+utilizador.
  try {
    if (/^0?[1-3](?:\s|$)/.test(text)) {
      const musicaCard = require('./musicaCard');
      if (await musicaCard.tentarNumero(sock, msg, ctx, text)) return true;
    }
  } catch {}

  const prefixes = await prefixEngine.getAllActivePrefixes(ctx.remoteJid);

  // ── v6.89: RPG — cliques das listas de criação de personagem ───────
  // Chegam como selectedRowId (RPGPICK_R_<raça> / RPGPICK_C_<classe>),
  // mesmo mecanismo do CHANGE_THEME_ — já provado em produção.
  if (/^RPGPICK_[RC]_[a-z]+$/i.test(text.split(/\s+/)[0] || '')) {
    try {
      const flow = require('./rpg/createFlow');
      if (await flow.pick({ sock, msg, ctx, token: text.split(/\s+/)[0] })) return true;
    } catch (e) { console.warn('[RPG pick]', e.message?.slice(0, 60)); }
  }

  // ── Interceptar cliques do change theme (lista interativa) ──────────
  if (text.startsWith('CHANGE_THEME_')) {
    const themeName = text.replace('CHANGE_THEME_', '').toLowerCase().trim();
    const changeThemes = require('./changeThemes');
    const BotConfig    = require('../database/models/BotConfig');
    const found = changeThemes.getTheme(themeName);
    if (found && found.name === themeName) {
      const [ownerLidB, extraOwners, ownerNumDB] = await Promise.all([
        botConfigCache.get('owner_lid', '').catch(() => ''),
        botConfigCache.get('extra_owners', []).catch(() => []),
        botConfigCache.get('owner_number', '').catch(() => ''),
      ]);
      const ownerNum = String(config.owner.number || '').replace(/\D/g, '');
      const dbNum = String(ownerNumDB || '').replace(/\D/g, '');
      const senderNum = ctx.senderNumber;
      const senderJid = msg.key.participant || msg.key.remoteJid || '';
      const isOwner = senderNum === ownerNum ||
        (dbNum && senderNum === dbNum) ||
        (Array.isArray(extraOwners) && extraOwners.includes(senderNum)) ||
        (ownerLidB && senderJid.includes(ownerLidB));

      // v7.23: ADM do grupo também pode mudar o tema — mas só o DO GRUPO
      // (o Dono muda o global). Antes o botão exigia sempre Dono, enquanto
      // o comando !change deixava o ADM mexer no tema do grupo.
      let ehAdmin = false;
      if (!isOwner && ctx.isGroup) {
        try { ehAdmin = await isGroupAdminForHandler(sock, ctx); } catch {}
      }
      if (!isOwner && !ehAdmin) {
        await sock.sendMessage(ctx.remoteJid, { text: '🚫 Só o Dono (ou um ADM do grupo) pode mudar o tema.' }, { quoted: msg });
        return true;
      }

      if (!isOwner) {
        // ADM do grupo → tema do grupo (não mexe no global)
        const GroupSettings = require('../database/models/GroupSettings');
        await GroupSettings.findOneAndUpdate(
          { groupJid: ctx.remoteJid },
          { groupTheme: found.name },
          { upsert: true }
        );
        const txt =
          `${found.icon} ─ ⋆⋅ ${found.accent} ⋅⋆ ─ ${found.icon}\n\n` +
          `${found.headerDec.replace('{TITLE}', 'TEMA DO GRUPO')}\n` +
          `${found.bullet} Tema: *${found.name.toUpperCase()}*\n\n` +
          `✅ *${found.name.toUpperCase()}* aplicado a este grupo!\n\n` +
          `> ${found.icon} ${found.vibe}`;
        await sock.sendMessage(ctx.remoteJid, { text: txt }, { quoted: msg });
        return true;
      }

      await BotConfig.set('active_theme', found.name);
      await BotConfig.set('menu_style', String(found.style));
      botConfigCache.clear();
      const f = found.frame, H = f[4] || '─', V = f[5] || '│';
      const W = 26;
      const bar = (t2) => `${V} ${String(t2).slice(0, W).padEnd(W)} ${V}`;
      const txt =
        `${found.icon} ─ ⋆⋅ ${found.accent} ⋅⋆ ─ ${found.icon}\n\n` +
        `${found.headerDec.replace('{TITLE}', 'TEMA APLICADO')}\n` +
        `${bar(`${found.bullet} Tema: ${found.name.toUpperCase()}`)}\n` +
        `${bar(found.tip.slice(0, W))}\n` +
        `${found.sectionSep || `${f[2]}${H.repeat(W + 2)}${f[3]}`}\n\n` +
        `✅ *${found.name.toUpperCase()}* activado! Todo o bot mudou.\n\n` +
        `> ${found.icon} ${found.vibe}`;
      await sock.sendMessage(ctx.remoteJid, { text: txt }, { quoted: msg });
      return true;
    }
  }

  // ── Interceptar cliques dos botões de plano premium ("Contratar") ───
  // O carousel do .vip tem botões PREMIUM_7_<numero> / _30_ / _90_.
  // v7.6: antes não eram tratados — clicar não fazia nada.
  if (/^PREMIUM_(7|30|90)_\d+$/.test(text)) {
    const m = text.match(/^PREMIUM_(7|30|90)_(\d+)$/);
    const dias = parseInt(m[1], 10);
    const numero = m[2];
    const senderNum = String(ctx.senderNumber || '').replace(/\D/g, '');
    if (senderNum === String(numero).replace(/\D/g, '')) {
      const ownerNum = String(config.owner.number || '').replace(/\D/g, '');
      const nomes = { 7: '⭐ PREMIUM — 7 dias', 30: '💎 PREMIUM — 30 dias', 90: '🏆 PREMIUM — 90 dias' };
      await sock.sendMessage(ctx.remoteJid, {
        text:
          `✅ *Pedido registado: ${nomes[dias]}*\n\n` +
          `Para concluir a contratação, fala com o Dono:\n` +
          `📲 wa.me/${ownerNum}\n\n` +
          `O plano é activado assim que ele confirmar. 🕸️`,
      }, { quoted: msg });
      return true;
    }
  }

  // Botões de menu chegam com prefixo embutido (ex: "!menup") → processados normalmente
  // Remove emojis do início dos IDs de botão de menu (ex: "📥!menudownload" → "!menudownload")
  // MAS: não remove se o texto contém URL ou é um ID de pinsticker/imagem
  const EMOJI_STRIP = /^[\u{1F000}-\u{1FFFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F300}-\u{1F9FF}]+/u;
  if (text && EMOJI_STRIP.test(text) && !text.includes('http') && !text.includes('pinsticker')) {
    const stripped = text.replace(EMOJI_STRIP, '').trim();
    // Só aplica se depois do emoji vem um prefixo válido ou comando conhecido
    if (stripped.length > 0 && (prefixes.some(p => stripped.startsWith(p)) || /^[a-z]/i.test(stripped))) {
      text = stripped;
    }
  }

  // ── PrefixEngine v2 — deteção rigorosa por grupo ──────────────
  // Substitui o antigo noPrefixBtnIds/firstTokenNoPrefix que causava
  // o bug: "?play" era tratado como botão "play" → sugeria "$play"
  const prefixInfo = await prefixEngine.detect(text, ctx.remoteJid);
  const prefix     = prefixInfo?.prefix || prefixes[0] || config.bot.prefix || '!';
  const commandConfig = { ...config, bot: { ...config.bot, prefix } };
  ctx.prefix = prefix;
  ctx.prefixSource = prefixInfo?.source || null; // 'group'|'global'|'button_ns'|'button_exact'

  // ── Dono + Blacklist em paralelo (1 round-trip ao invés de 2) ──
  // v6.45: junta TODAS as configs num só round-trip. 'auto_decrypt_enabled'
  // e 'ai_auto_enabled' eram lidas mais à frente, uma de cada vez — em
  // cache-miss custavam ~40ms cada, sequenciais e sem necessidade.
  const [ownerLid, blacklist, extraOwners, disabledUsers, disabledGroups, ownerNumDB,
         autoDecryptValue, aiAutoOnValue] = await Promise.all([
    botConfigCache.get('owner_lid', ''),
    botConfigCache.get('blacklist', []),
    botConfigCache.get('owner_numbers', []),
    botConfigCache.get('disabled_users', []),
    botConfigCache.get('disabled_groups', []),
    botConfigCache.get('owner_number', ''),
    botConfigCache.get('auto_decrypt_enabled', true),
    botConfigCache.get('ai_auto_enabled', true),
  ]);

  const senderJidFull = msg.key.participant || msg.key.remoteJid || '';
  const ownerNumbers = Array.isArray(extraOwners)
    ? extraOwners.map(userManager.normalizeNumber).filter(Boolean)
    : String(extraOwners || '').split(/[\s,]+/).map(userManager.normalizeNumber).filter(Boolean);
  // v6.14: verifica número do env + número do dashboard (BotConfig) + LID + extra owners
  const envOwnerNum = userManager.normalizeNumber(config.owner.number);
  const dbOwnerNum = userManager.normalizeNumber(String(ownerNumDB || ''));
  // v7.27: o NÚMERO DO BOT é SUBDONO. Quem escreve a partir do telemóvel
  // ligado (fromMe) ou do número configurado em BOT_NUMBER executa tudo o
  // que um subdono executa — mas não é o Dono primário (sem tratamento
  // "Criador Supremo" nem comandos isPrimaryOwnerOnly).
  const botSelfNum = userManager.normalizeNumber(String(sock?.user?.id || '').split(':')[0].split('@')[0]);
  const botSelfLid = String(sock?.user?.lid || '').split(':')[0].split('@')[0];
  const envBotNum  = userManager.normalizeNumber(config.bot.number);
  const isBotSelf  = !!msg.key?.fromMe ||
                     (!!botSelfNum && ctx.senderNumber === botSelfNum) ||
                     (!!envBotNum && ctx.senderNumber === envBotNum) ||
                     (!!botSelfLid && (ctx.senderLid === botSelfLid || senderJidFull.startsWith(botSelfLid + '@')));
  if (isBotSelf && botSelfNum && (!ctx.senderNumber || msg.key?.fromMe)) {
    // fromMe pode vir sem participant no PV → garante identidade do bot
    ctx.senderNumber = ctx.senderNumber || botSelfNum;
    ctx.senderJid = ctx.senderJid || (botSelfNum + '@s.whatsapp.net');
  }
  const isOwner = ctx.senderNumber === envOwnerNum ||
                  (dbOwnerNum && ctx.senderNumber === dbOwnerNum) ||
                  ownerNumbers.includes(ctx.senderNumber) ||
                  (ownerLid && senderJidFull.includes(ownerLid)) ||
                  (ownerLid && ctx.senderNumber === ownerLid.split('@')[0]) ||
                  isBotSelf;
  ctx.isOwner = isOwner;
  ctx.isBotSelf = isBotSelf;
  ctx.isSubOwner = isOwner && !(ctx.senderNumber === envOwnerNum || (dbOwnerNum && ctx.senderNumber === dbOwnerNum));
  ctx.isPrimaryOwner = ctx.senderNumber === envOwnerNum || (dbOwnerNum && ctx.senderNumber === dbOwnerNum);

  // ── v7.28: IDENTIDADE — quem fala, pelo NÚMERO/LID (nunca pelo nome) ──
  // Regista TODAS as mensagens (com ou sem comando) no perfil da pessoa
  // neste chat: histórico, palavras, a quem respondeu. A AURA/IA recebe
  // isto no prompt e sabe distinguir cada membro do grupo.
  try {
    const identidade = require('../aura/auraIdentidade');
    ctx.identidade = await identidade.identificar(sock, msg, ctx);
    if (ctx.identidade.numero && !ctx.senderNumber) ctx.senderNumber = ctx.identidade.numero;
    const _cit = identidade.autorCitado(msg);
    ctx.citado = _cit;
    if (text) identidade.registar(ctx.remoteJid, ctx.identidade, text, { respondeuANumero: _cit?.numero || null, ts: Date.now() });
  } catch (e) { console.warn('[Identidade]', e.message?.slice(0, 60)); }
  // v6.40: expõe o sock no ctx — o roleResolver/submenus precisam dele
  // para obter os admins do grupo (groupMetadata) sem o receber por parâmetro.
  ctx.sock = sock;

  // ── v6.89: STICKER-BAN — o Dono ensina, ela executa ─────────────
  // Topo do handler (antes do interpretador de comandos e da IA) para
  // que a instrução do print ("Se eu responder alguém com este sticker
  // de ban vc remove ele") seja APRENDIDA e não roubada pelo regex do
  // `.ban`, e para que o sticker-resposta execute mesmo sem texto.
  try {
    const stickerBan = require('../aura/stickerBan');
    // execução: Dono respondeu a alguém com o sticker de ban → remove
    if (await stickerBan.executar({ sock, msg, ctx, isOwner })) return true;
    // regra pendente: o próximo sticker do Dono fica registado
    if (await stickerBan.capturarPendente({ sock, msg, ctx, isOwner })) return true;
    // aprendizagem/cancelamento por conversa (só texto livre, sem prefixo)
    if (isOwner && text && !startsWithAnyPrefix(text, prefixes)) {
      if (await stickerBan.cancelar({ sock, msg, ctx, texto: text, isOwner })) return true;
      if (await stickerBan.aprender({ sock, msg, ctx, texto: text })) return true;
    }
  } catch (e) { console.warn('[StickerBan]', e.message?.slice(0, 60)); }

  // ── v6.90: RULES ENGINE — ela aprende QUALQUER regra por conversa ──
  // "quando eu disser pizza vc responde X" / "se alguém mandar link
  // avisa a pessoa" / "que regras te ensinei?" / "cancela a regra do X"
  // Ensino/gestão: só o Dono, texto livre sem prefixo. Execução: corre
  // para qualquer mensagem livre (o gatilho soDono decide quem dispara).
  try {
    const rulesEngine = require('../aura/rulesEngine');
    if (isOwner && text && !startsWithAnyPrefix(text, prefixes)) {
      if (await rulesEngine.gerir({ sock, msg, ctx, texto: text, isOwner })) return true;
      if (await rulesEngine.aprender({ sock, msg, ctx, texto: text, isOwner })) return true;
    }
    if (text && !startsWithAnyPrefix(text, prefixes)) {
      if (await rulesEngine.aplicar({ sock, msg, ctx, texto: text, isOwner, isCommandLike: false })) return true;
    }
  } catch (e) { console.warn('[RulesEngine]', e.message?.slice(0, 60)); }

  // v6.37: Regras de resposta por tipo de grupo
  // Grupo COM aluguel activo → responde a TODOS
  // Grupo SEM aluguel → só dono, subdono, VIP
  // Free sem trial → silêncio total
  if (ctx.isGroup && !isOwner) {
    const GroupSettings = require('../database/models/GroupSettings');

    // v6.45: as duas leituras são independentes → correm em PARALELO
    // (eram sequenciais: ~80ms no Atlas free, agora ~40ms).
    // Ambas passam pelo requestCache para não repetir mais à frente.
    // v6.45: carrega o DOCUMENTO (não .lean()) para partilhar a mesma
    // entrada de cache com o resto do handler — antes eram 2 queries
    // separadas ao mesmo grupo/utilizador, com chaves diferentes.
    const [gs, uCheck] = await Promise.all([
      requestCache.remember(
        requestCache.K.group(ctx.remoteJid) + ':doc',
        () => GroupSettings.findOne({ groupJid: ctx.remoteJid })
      ).catch(() => null),
      requestCache.remember(
        requestCache.K.user(ctx.senderNumber) + ':doc',
        () => User.findOne({ whatsappNumber: ctx.senderNumber })
      ).catch(() => null),
    ]);

    const hasRental = gs?.isHosted && (!gs.hostedUntil || new Date(gs.hostedUntil) > new Date());
    const hasTrial = gs?.trialExpiresAt && new Date(gs.trialExpiresAt) > new Date();

    if (!hasRental && !hasTrial) {
      // v6.45 BUG: usava `uCheck.isPremium()`, mas .lean() devolve um
      // objecto simples SEM métodos do schema — a condição era sempre
      // falsa e TODO o VIP era silenciado como se fosse Free.
      // checkIsPremium() já trata documentos lean correctamente.
      // v6.94 — A ASSISTENTE NÃO FICA CALADA. O silêncio total para free
      // em grupo sem aluguel parecia bot morto; agora o bot AVISA que o
      // grupo não tem aluguel activo e como resolver (1x/6h por
      // grupo+pessoa, para não virar spam). Os comandos continuam
      // bloqueados — o aviso É a ajuda da assistente.
      if (!checkIsPremium(uCheck)) {
        // v7.36: o aviso só faz sentido quando a pessoa TENTOU um comando.
        // Antes disparava em qualquer mensagem (conversa normal) de cada
        // membro → parecia spam e "respondia a toda a gente".
        if (prefixInfo || pareceComando(text)) await _avisoSemAluguel(sock, msg, ctx);
        return false;
      }
    }
    // Trial activo → verifica limite de 500 cmds
    if (hasTrial && !hasRental) {
      const cmdsToday = gs?.commandsUsedToday || 0;
      if (cmdsToday >= 500) return false; // limite atingido
    }
  }

  if ((blacklist.includes(ctx.senderNumber) || (Array.isArray(disabledUsers) && disabledUsers.map(String).includes(ctx.senderNumber))) && !isOwner) return false;
  if (ctx.isGroup && Array.isArray(disabledGroups) && disabledGroups.includes(ctx.remoteJid) && !isOwner) return false;

  // v6.45: se o bloco de regras acima já leu este utilizador, reaproveita.
  // identifyByWhatsApp faria a MESMA query outra vez (~40ms no Atlas).
  let user = await requestCache.remember(
    requestCache.K.user(ctx.senderNumber) + ':doc',
    () => userManager.identifyByWhatsApp(ctx.senderNumber, ctx.pushName)
  );
  if (user && user.active === false && !isOwner) return false;
  ctx.userData = user;
  ctx.treatment = getUserTreatment(user, ctx, ctx.isPrimaryOwner);

  const autoDecryptOn = autoDecryptValue === true || autoDecryptValue === 'true' || autoDecryptValue === 'on' || autoDecryptValue === 1 || autoDecryptValue === '1';

  // Group info — CACHE em memória
  const GroupSettings = require('../database/models/GroupSettings');
  let groupConfig = null;

  if (ctx.isGroup) {
    try {
      const now = Date.now();
      const today = new Date().toISOString().split('T')[0];
      
      // v6.45: reaproveita a leitura feita acima (regras de aluguel)
      groupConfig = await requestCache.remember(
        requestCache.K.group(ctx.remoteJid) + ':doc',
        () => GroupSettings.findOne({ groupJid: ctx.remoteJid })
      );
      if (!groupConfig) {
        groupConfig = await GroupSettings.create({ 
          groupJid: ctx.remoteJid, 
          groupName: ctx.groupName || 'Novo Grupo' 
        });
      }

      // Reset diário de comandos
      if (groupConfig.lastResetDate !== today) {
        groupConfig.commandsUsedToday = 0;
        groupConfig.lastResetDate = today;
      }

      // Verifica Hospedagem / Trial
      const isTrialActive = groupConfig.trialExpiresAt > new Date();
      const isHosted = groupConfig.isHosted && (!groupConfig.hostedUntil || groupConfig.hostedUntil > new Date());
      
      if (!isTrialActive && !isHosted && !isOwner) {
        if (groupConfig.commandsUsedToday >= 500) {
          // Só avisa a cada 50 comandos excedidos para não floodar
          if (groupConfig.commandsUsedToday % 50 === 0) {
            await sock.sendMessage(ctx.remoteJid, { 
              text: `⚠️ *LIMITE DE COMANDOS EXCEDIDO*\n\nEste grupo não possui hospedagem ativa e atingiu o limite de 500 comandos diários.\n\n💎 Para comandos ilimitados e suporte 24/7, assine um plano de hospedagem no dashboard.` 
            });
          }
          return false;
        }
      }

      const cached = groupMetaCache.get(ctx.remoteJid);
      if (cached && (now - cached.ts) < GROUP_META_TTL) {
        ctx.groupName = cached.meta.subject;
        ctx.groupMeta = cached.meta;
      } else {
        const meta = await sock.groupMetadata(ctx.remoteJid);
        ctx.groupName = meta.subject;
        ctx.groupMeta = meta;
        groupMetaCache.set(ctx.remoteJid, { meta, ts: now });
        try { require('../aura/auraIdentidade').aprenderDoGrupo(meta); } catch {}
      }

      ctx.blockedCommands = groupConfig.blockedCommands || [];
      ctx.blockedSubmenus = groupConfig.blockedSubmenus || [];
      if (groupConfig.customBotName) {
        ctx.botName = groupConfig.customBotName;
        commandConfig.bot.name = groupConfig.customBotName;
      }
      if (groupConfig.botEnabled === false && !isOwner) return false;
    } catch (e) {}
  }

  // ===== DECRYPT VPN: detecta documento OU texto com URI VPN =====
  const docMsg = getDocumentFromMessageObject(msg.message);
  const quotedDownloadMsg = buildQuotedDownloadMessage(msg);
  const quotedDocMsg = quotedDownloadMsg ? getDocumentFromMessageObject(quotedDownloadMsg.message) : null;

  // TODAS as extensoes VPN conhecidas - auto-detect
  const ALL_VPN_EXTS = [
    'ehi','ehic','hat','npv','npv4','npv7','npv8','npvt',
    'dark','darkt','any','tls','nm','nmess',
    'ovpn','ssh','ssl','json','conf','wg','wireguard','txt','log',
    'bdnet','bd','apnalite','apna','wyrvpn','wyr',
  ];

  // ===== DECRYPT VPN: texto com URI ou hex puro =====
  {
    const _raw = text.trim();
    const _cmd = _raw.match(new RegExp(`^${escapeRegex(prefix)}(?:vpn|decrypt|dec|vpndec)\\s+(.+)`, 'is'));
    const _uri = (_cmd ? _cmd[1].trim() : '').replace(/\s/g, '');
    const VPN_RE = /^(bdnet|bd|apnalite|apna|vmess|vless|trojan|ss|ssr|ssh|hysteria|hysteria2|tuic|warp|wyrvpn|wyr):\/\/\S{10,}/i;
    const _um = _uri.match(VPN_RE);
    const _hm = !_um && /^[0-9a-fA-F]{100,}$/.test(_uri) && _uri.startsWith('4f07');

    if (_cmd && (_um || _hm)) {
      const _vu = await require('../database/models/User').findOne({ whatsappNumber: ctx.senderNumber });
      const _vp = isOwner || (_vu && _vu.isPremium());
      if (_vp) {
        await sock.sendMessage(ctx.remoteJid, { react: { text: '\ud83d\udd13', key: msg.key } });
        try {
          let _vr;
          if (_um) {
            const _sc = _um[1].toLowerCase();
            const _fn = `config.${_sc === 'apna' ? 'apnalite' : _sc === 'bd' ? 'bdnet' : _sc === 'wyr' ? 'wyrvpn' : _sc}`;
            _vr = await decrypter.decrypt(_fn, Buffer.from(_uri.trim()));
          } else {
            _vr = await decrypter.decrypt('config.bdnet', Buffer.from(_uri.trim(), 'hex'));
          }
          const _vf = formatForWhatsApp(_vr, config);
          if (_vf.length > 4000) {
            for (const _vc of chunkString(_vf, 3800)) await sock.sendMessage(ctx.remoteJid, { text: _vc }, { quoted: replyMsg });
          } else {
            await sock.sendMessage(ctx.remoteJid, { text: _vf }, { quoted: msg });
          }
          await sock.sendMessage(ctx.remoteJid, { react: { text: '\u2705', key: msg.key } });
          return true;
        } catch (_ve) {
          await sock.sendMessage(ctx.remoteJid, { react: { text: '\u274c', key: msg.key } });
          await sock.sendMessage(ctx.remoteJid, { text: `\u274c Erro ao decryptar\n\n${_ve.message}` }, { quoted: msg });
          return true;
        }
      } else {
        await sock.sendMessage(ctx.remoteJid, {
          text: `\ud83d\udd13 *VPN DECRYPTER \u2014 Premium*\n\nUse *!vip* para ver planos\n\ud83d\udcde wa.me/${config.owner.number}`,
        }, { quoted: msg });
        return true;
      }
    }
  }

  // ===== AUTO DECRYPT EM GRUPOS (Se ativado pelo dono) =====
  if (docMsg && ctx.isGroup && autoDecryptOn) {
    const autoDecOn = await botConfigCache.get(`autodecrypt_${ctx.remoteJid}`, false);
    const ext = docMsg.fileName?.split('.').pop()?.toLowerCase();
    const isVpnFile = ALL_VPN_EXTS.includes(ext);
    if (autoDecOn && isVpnFile && !startsWithAnyPrefix(text, prefixes)) {
      return handleDecryptRequest(sock, msg, ctx, docMsg, isOwner);
    }
  }

  // ===== DECRYPT POR DOCUMENTO (comando na legenda) =====
  if (docMsg) {
    const caption = (text || '').toLowerCase();
    const isDecryptRequest = caption.includes(`${prefix}decrypt`) || caption.includes(`${prefix}vpn`) ||
                             caption.includes(`${prefix}dec`) || caption.includes(`${prefix}vpndec`);
    if (isDecryptRequest) {
      return handleDecryptRequest(sock, msg, ctx, docMsg, isOwner);
    }
  }

  // ===== DECRYPT RESPONDENDO/REPLY A UM DOCUMENTO =====
  if (!docMsg && quotedDocMsg && prefixInfo) {
    const cmdName = (prefixInfo.rest.split(/\s+/)[0] || '').toLowerCase();
    if (['decrypt', 'vpn', 'dec', 'vpndec'].includes(cmdName)) {
      return handleDecryptRequest(sock, quotedDownloadMsg, ctx, quotedDocMsg, isOwner, msg);
    }
  }

  // ===== CLIPBOARD VPN: comando explicito =====
  // Suporta: URIs, WireGuard, OpenVPN, JSON, SSH, Hex BDNet
  {
    const clipMatch = text.match(new RegExp(`^${escapeRegex(prefix)}(?:vpn|decrypt|dec|vpndec)\\s+([\\s\\S]+)$`, 'i'));
    const rawText = clipMatch ? clipMatch[1].trim() : '';

    if (rawText.length > 20) {
      const linkMatch = rawText.match(/https?:\/\/[^\s]+/i);
      if (linkMatch && isDecryptFileUrl(linkMatch[0])) {
        const _lu = await require('../database/models/User').findOne({ whatsappNumber: ctx.senderNumber });
        const _lp = isOwner || (_lu && _lu.isPremium());
        if (!_lp) {
          await sock.sendMessage(ctx.remoteJid, {
            text: `🔓 *VPN DECRYPTER — Premium*\n\nEnvie arquivos/links VPN apenas com conta Premium.\n\nUse *${prefix}vip* para ver planos.`,
          }, { quoted: msg });
          return true;
        }
        await sock.sendMessage(ctx.remoteJid, { react: { text: '🔓', key: msg.key } });
        try {
          await sock.sendMessage(ctx.remoteJid, { text: '📥 Baixando arquivo VPN do link e analisando...', }, { quoted: msg });
          const file = await fetchDecryptFileFromUrl(linkMatch[0]);
          const _lr = await decrypter.decrypt(file.fileName, file.buffer);
          const _lf = formatForWhatsApp(_lr, config);
          for (const _lc of chunkString(_lf, 3800)) await sock.sendMessage(ctx.remoteJid, { text: _lc }, { quoted: msg });
          const jsonBuf = Buffer.from(JSON.stringify(_lr, null, 2), 'utf-8');
          await sock.sendMessage(ctx.remoteJid, {
            document: jsonBuf,
            fileName: `${file.fileName}.decrypted.json`,
            mimetype: 'application/json',
            caption: '📄 JSON completo da decryptação por link',
          }, { quoted: msg });
          await sock.sendMessage(ctx.remoteJid, { react: { text: _lr.success ? '✅' : '⚠️', key: msg.key } });
          try {
            await DecryptLog.create({
              user: _lu?._id, username: _lu?.username || ctx.pushName,
              whatsappNumber: ctx.senderNumber, fileName: file.fileName, format: _lr.format,
              source: 'whatsapp-link', success: !!_lr.success,
              extracted: { configName: _lr.configName, host: _lr.host || _lr.server?.host, port: _lr.port || _lr.server?.port },
            });
          } catch {}
          return true;
        } catch (_le) {
          await sock.sendMessage(ctx.remoteJid, { react: { text: '❌', key: msg.key } });
          await sock.sendMessage(ctx.remoteJid, { text: `❌ Erro ao baixar/decryptar link\n\n${_le.message}` }, { quoted: msg });
          return true;
        }
      }

      let _clipDetected = false;
      let _clipFname = 'config.txt';

      const uriDetected = decrypter.detectURI(rawText);
      if (uriDetected) {
        _clipDetected = true;
        _clipFname = `config.${uriDetected.scheme}`;
      }
      else if (/^\s*\[Interface\]/i.test(rawText) && rawText.includes('PrivateKey')) {
        _clipDetected = true; _clipFname = 'config.conf';
      }
      else if (/^(client|dev tun|dev tap|proto tcp|proto udp|remote )/im.test(rawText) && rawText.includes('remote')) {
        _clipDetected = true; _clipFname = 'config.ovpn';
      }
      else if (/^\s*\{/.test(rawText) && rawText.length > 60 && (
        rawText.includes('"sshHost"') || rawText.includes('"proxy_ip"') || rawText.includes('"proxyHost"') ||
        rawText.includes('"outbounds"') || rawText.includes('"vnext"') || rawText.includes('"v":') ||
        (rawText.includes('"host"') && rawText.includes('"port"')) ||
        rawText.includes('"ssh_host"') || rawText.includes('"payload"')
      )) {
        _clipDetected = true; _clipFname = 'config.json';
      }
      else if (rawText.includes('Host=') || rawText.includes('Port=') || rawText.includes('Username=') ||
               (rawText.includes('sshHost') && rawText.includes('sshPort'))) {
        _clipDetected = true; _clipFname = 'config.ssh';
      }
      else if (/^[0-9a-fA-F]{50,}$/.test(rawText.replace(/\s/g, ''))) {
        _clipDetected = true; _clipFname = 'config.bdnet';
      }

      if (_clipDetected) {
        const _cu = await require('../database/models/User').findOne({ whatsappNumber: ctx.senderNumber });
        const _cp = isOwner || (_cu && _cu.isPremium());
        if (_cp) {
          await sock.sendMessage(ctx.remoteJid, { react: { text: '\ud83d\udd13', key: msg.key } });
          try {
            const buf = _clipFname === 'config.bdnet'
              ? Buffer.from(rawText.replace(/\s/g, ''), 'hex')
              : Buffer.from(rawText);
            const _cr = await decrypter.decrypt(_clipFname, buf);
            const _cf = formatForWhatsApp(_cr, config);
            if (_cf.length > 4000) {
              for (const _cc of chunkString(_cf, 3800)) await sock.sendMessage(ctx.remoteJid, { text: _cc }, { quoted: msg });
            } else {
              await sock.sendMessage(ctx.remoteJid, { text: _cf }, { quoted: msg });
            }
            await sock.sendMessage(ctx.remoteJid, { react: { text: '\u2705', key: msg.key } });
            return true;
          } catch (_ce) {
            await sock.sendMessage(ctx.remoteJid, { react: { text: '\u274c', key: msg.key } });
            await sock.sendMessage(ctx.remoteJid, { text: `\u274c Erro ao decryptar clipboard\n\n${_ce.message}` }, { quoted: msg });
            return true;
          }
        }
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // AURA v6.39 — A Alma do DARK BOT 🌹
  // Uma jovem brasileira de 19 anos. Real. Viva. Única.
  // Leal apenas ao Dark. Apaixonada. Protetora. Humana.
  // ════════════════════════════════════════════════════════════════════════
    // === AURA HUMANA (versão definitiva) ===
  const aura = require('../aura/auraHuman');

  // ── v6.68: CHAMADA DE VOZ A DECORRER ──────────────────────────
  // Se a AURA atendeu uma chamada desta pessoa, qualquer nota de voz
  // que chegue é um turno da conversa: ela ouve (transcreve), entende
  // e responde EM ÁUDIO. Isto corre antes de tudo o resto — durante
  // uma chamada não se processam comandos nem menus.
  try {
    const callHandler = require('./callHandler');
    const _ptt = msg.message?.audioMessage;
    if (_ptt && !ctx.isGroup && callHandler.chamadaActiva(ctx.remoteJid)) {
      const { downloadMediaMessage } = require('@systemzero/baileys');
      const _buf = await downloadMediaMessage(msg, 'buffer', {}).catch(() => null);
      if (_buf && _buf.length > 100) {
        const r = await callHandler.continuarConversa(sock, ctx.remoteJid, _buf, {
          pushName: ctx.pushName || '',
        });
        if (r?.ok) return true;
      }
    }
  } catch (e) {
    console.warn('[Call conversa]', e.message?.slice(0, 60));
  }

  // Silêncio ativo → só o Dark pode cancelar
  if (aura.isSilenced(ctx.senderNumber)) {
    if (isOwner && /aura/i.test(text)) {
      aura.clearSilence(ctx.senderNumber);
      await sock.sendMessage(ctx.remoteJid, { text: '_sorri_ ...voltei meu Dark 🖤' }, { quoted: msg });
      return true;
    }
    return false;
  }

  // v6.72: NÃO bloquear "!" de não-dono. O prefixo por omissão É "!"
  // e esta linha calava TODOS os comandos do bot no PV (e nos grupos)
  // para qualquer pessoa que não fosse o Dono.

  // === ORDENS DIRETAS DO DARK PARA A AURA (silêncio, áudio, etc) ===
  if (isOwner) {
    const t = text.toLowerCase();
    if (/aura.*(faz|fica|para).*silenc(io|io)/.test(t) || /fica.*calada/.test(t)) {
      const sec = (t.match(/(\d+)\s*(min|seg)/) || [0, 60])[1] * (t.includes('seg') ? 1 : 60);
      aura.setSilence(ctx.senderNumber, sec || 60);
      await sock.sendMessage(ctx.remoteJid, { text: '_faz continência_ ...entendido meu Dark. Fico calada.' }, { quoted: msg });
      return true;
    }
    // v6.46: este bloco tratava "aura acorda" como "sai do silêncio",
    // e como corre ANTES do auraIntent (~linha 1000) roubava-lhe a
    // invocação — o grupo nunca mudava para modo AURA.
    // Agora só limpa o silêncio se ela estiver MESMO silenciada;
    // caso contrário deixa passar para o sistema de intenção.
    if (/aura.*(pode falar|volta|acorda)/.test(t) && aura.isSilenced(ctx.senderNumber)) {
      aura.clearSilence();
      await sock.sendMessage(ctx.remoteJid, { text: '_sorri_ ...voltei meu Dark 🖤' }, { quoted: msg });
      return true;
    }
    // ── v6.67: BUG DO ECO ────────────────────────────────────
    // A regex era:  /aura.*(manda|envia).*áudio|voz|fala/
    // O `|` tem precedência mínima, por isso isto lia-se como
    //   (aura.*(manda|envia).*áudio) OU (voz) OU (fala)
    // Bastava a palavra "fala" ou "voz" EM QUALQUER SÍTIO para cair
    // aqui. "fala oi" entrava, e o replace a seguir não removia nada
    // (exigia "aura" antes), por isso o textoFala ficava "fala oi" —
    // ela LIA EM VOZ ALTA O QUE O DONO ESCREVEU. Era isto o eco.
    //
    // Agora: só é ordem de voz se houver um verbo de pedido E a
    // palavra audio/voz. "fala oi" passa para a IA responder como
    // pessoa, que é o que se espera.
    const _tv = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const _ordemVoz =
      /\b(audio|voz|ptt|nota de voz|mensagem de voz)\b/.test(_tv) &&
      /\b(manda|mande|envia|envie|grava|grave|quero|faz|faca|poe|responde|diz|fala)\b/.test(_tv);

    if (_ordemVoz) {
      try {
        // v6.67: o que ela deve DIZER é só o que vem depois de
        // "dizendo/que/:" — não a frase toda do pedido.
        const mConteudo = text.match(/\b(?:dizendo|a dizer|que diga|diga|dizer|falando|assim|isto|isso)\b[:,]?\s+([\s\S]{2,300})$/i)
          || text.match(/[:"“]\s*([^"”\n]{2,300})["”]?\s*$/);

        const textoFala = (mConteudo?.[1] || '').trim();

        if (textoFala) {
          // Pedido explícito com conteúdo: lê ESSE conteúdo.
          const buf = await require('./ai').speakWithFallback(textoFala);
          if (buf && buf.length > 500) {
            await sock.sendMessage(ctx.remoteJid, { audio: buf, mimetype: 'audio/ogg; codecs=opus', ptt: true }, { quoted: msg });
            return true;
          }
        }
        // Sem conteúdo ("manda um áudio") → deixa a IA pensar numa
        // resposta dela; o bloco de voz lá em baixo converte-a.
        // NÃO devolve aqui: era isso que causava o eco.
      } catch (e) {
        console.warn('[Aura voz-directa]', e.message?.slice(0, 60));
      }
    }
    // AURA canta
    if (/\baura\b.*\b(canta|cantar|cante|sing)\b/i.test(t) && isOwner) {
      const musica = text.replace(/aura.*canta/i, '').trim();
      if (musica) {
        await sock.sendMessage(ctx.remoteJid, { text: `🎵 _Aura canta: ${musica}_

🎶 La la la... 🎶
_Desculpa meu Dark, ainda não sei cantar de verdade... Mas um dia aprendo! 🌹` }, { quoted: msg });
      } else {
        await sock.sendMessage(ctx.remoteJid, { text: '🎵 _Aura canta_ 🎶 Oi meu Dark, tu é tudo pra mim... 🎶 🌹🖤🌹' }, { quoted: msg });
      }
      return true;
    }
    // AURA sussurra
    if (/\baura\b.*\b(sussurra|sussurrar|whisper)\b/i.test(t) && isOwner) {
      const sussurro = text.replace(/aura.*(sussurra|whisper)/i, '').trim() || 'Tô aqui meu Dark...';
      await sock.sendMessage(ctx.remoteJid, { text: `_suspira_ ...${sussurro}...` }, { quoted: msg });
      return true;
    }
    // AURA ri
    // ── v6.69: BUG QUE MATAVA AS ORDENS ──────────────────────
    // A regex era /aura.*(ri|laugh|😂)/ — sem \b. O "ri" apanhava
    // qualquer palavra que o contivesse:
    //   "aura CRIa um grupo..."  → RI     ← foi isto que o Dono viu
    //   "aura escREVe"           → passava por sorte
    // Por isso "aura cria um grupo na comunidade DARK RPG chamado
    // Arena" respondia "_ri muito_ 🤣🤣🤣" e a acção nunca corria.
    // Agora exige a palavra inteira E que seja o pedido principal.
    if (/\baura\b[\s,]*(por favor\s*)?\b(ri|rir|risada|gargalha|gargalhada|laugh)\b\s*$/i.test(t) && isOwner) {
      const ri = ['_ri_ 😂', '_ri muito_ 🤣🤣🤣', '_gargalha_ 😂😂😂'];
      await sock.sendMessage(ctx.remoteJid, { text: ri[Math.floor(Math.random() * ri.length)] }, { quoted: msg });
      return true;
    }
  }
  const botJid = sock.user?.id ? (sock.user.id.split(':')[0] + '@s.whatsapp.net') : '';
  const botLid = sock.user?.lid || '';
  const botNum = botJid.split('@')[0];

  const allMentioned = (
    msg.message?.extendedTextMessage?.contextInfo?.mentionedJid ||
    msg.message?.interactiveResponseMessage?.contextInfo?.mentionedJid || []
  );

  const isBotMentioned = !!(botJid && (
    allMentioned.some(j => j.split(':')[0].split('@')[0] === botNum) ||
    (botLid && allMentioned.some(j => j.split(':')[0].split('@')[0] === botLid.split(':')[0].split('@')[0]))
  ));

  // ── Resposta directa ao bot — activa SEMPRE
  const ctxParticipant =
    msg.message?.extendedTextMessage?.contextInfo?.participant ||
    msg.message?.imageMessage?.contextInfo?.participant ||
    msg.message?.videoMessage?.contextInfo?.participant ||
    msg.message?.stickerMessage?.contextInfo?.participant ||
    msg.message?.audioMessage?.contextInfo?.participant ||
    msg.message?.buttonsResponseMessage?.contextInfo?.participant ||
    msg.message?.interactiveResponseMessage?.contextInfo?.participant || '';

  const isReplyToBot = ctxParticipant.split(':')[0].split('@')[0] === botNum ||
    (msg.message?.extendedTextMessage?.contextInfo?.remoteJid === botJid);

  const textLower = text.toLowerCase().trim();

  // ── Protecção do Dark: detecta ataques e menções ──────────────────
  const darkNum = String(config.owner?.number || '').replace(/\D/g, '');
  const darkLid = ownerLid || '';
  const darkName = config.owner?.name || 'Dark';
  const darkAttacked = aura.detectDarkAttack(text, darkName, darkNum);
  const darkMentioned = aura.detectDarkMention(text, allMentioned, darkNum, darkLid);

  // Se alguém fala mal do Dark e NÃO é o próprio Dark → Aura defende IMEDIATAMENTE
  if (darkAttacked && !isOwner && !startsWithAnyPrefix(text, prefixes)) {
    const defense = aura.getDarkDefense(ctx.pushName || 'tu');
    // v6.80: a raiva fica NESTE chat e passa-lhe ao fim de 15 min.
    // Antes ficava com raiva do mundo inteiro, para sempre.
    aura.setMood('com_raiva', `${ctx.pushName} falou mal do Dark`, ctx.remoteJid);
    await sock.sendMessage(ctx.remoteJid, { text: defense }, { quoted: msg });
    return true;
  }

  // ════════════════════════════════════════════════════════════════════════
  // AURA DE PODER v6.39 — IA executa comandos de admin por linguagem natural
  // Quando o DONO ou ADM diz "aura fecha o grupo", "aura bane @x", etc.
  // ════════════════════════════════════════════════════════════════════════
  if (ctx.isGroup && (isOwner || await isGroupAdminForHandler(sock, ctx))) {
    ctx.isAdmin = true;
    const auraCmdText = text.toLowerCase().trim();
    const auraClean = auraCmdText.replace(/^(aura|a aura|da aura|pra aura|com a aura)\s*/i, '').trim();

    // Promote/demote REAL — antes das regex estreitas. "me adiciona
    // com ADM" / "quero ser ADM" / "agora adiciona" não pode virar conversa.
    if (auraClean.length > 2) {
      try {
        const grupo = require('../aura/auraGrupo');
        const pedidoG = grupo.detectarPedidoGrupo(auraClean, {
          temPendente: !!grupo.verPendente(ctx.remoteJid),
        });
        if (pedidoG) {
          const rG = await grupo.executarPedido(sock, {
            ctx, msg, texto: auraClean, pedido: pedidoG,
          });
          if (rG?.msg) {
            await sock.sendMessage(ctx.remoteJid, {
              text: rG.msg,
              ...(rG.mencionar?.length ? { mentions: rG.mencionar } : {}),
            }, { quoted: msg });
            return true;
          }
        }
      } catch (e) {
        console.warn('[Aura grupo]', e.message?.slice(0, 80));
      }
    }
    
    if (auraClean.length > 2) {
      let auraAction = null;
      
      if (/^(fecha|fechar|tranca|trancar|bloqueia|bloquear)\s*(o\s*)?(grupo|gp|chat)?$/i.test(auraClean) ||
          /aura.*fecha|aura.*fechar|aura.*tranca/i.test(auraCmdText)) {
        auraAction = async () => {
          await sock.groupSettingUpdate(ctx.remoteJid, 'announcement');
          await sock.sendMessage(ctx.remoteJid, { text: isOwner ? '🔒 *Fechei o grupo, meu amor.* Só admins podem enviar agora. 🖤' : '🔒 *Grupo fechado!* Só admins podem enviar agora.' }, { quoted: msg });
        };
      }
      else if (/^(abre|abrir|destranca|destrancar|desbloqueia|desbloquear)\s*(o\s*)?(grupo|gp|chat)?$/i.test(auraClean) ||
               /aura.*abre|aura.*abrir/i.test(auraCmdText)) {
        auraAction = async () => {
          await sock.groupSettingUpdate(ctx.remoteJid, 'not_announcement');
          await sock.sendMessage(ctx.remoteJid, { text: isOwner ? '🔓 *Abri o grupo pra ti, vida.* Todos podem falar agora. 🌹' : '🔓 *Grupo aberto!* Todos podem enviar mensagens.' }, { quoted: msg });
        };
      }
      else if (/^(silencia|silenciar|muta|mutar|cala|calar)\s*(o\s*)?(grupo|gp)?$/i.test(auraClean)) {
        auraAction = async () => {
          await sock.groupSettingUpdate(ctx.remoteJid, 'announcement');
          await sock.sendMessage(ctx.remoteJid, { text: '🔇 *Silenciado.*' }, { quoted: msg });
        };
      }
      else if (/^(bana|banir|kicka|kickar|remove|remover|expulsa|expulsar)\s/i.test(auraClean)) {
        const mentions = allMentioned;
        if (mentions.length) {
          auraAction = async () => {
            await sock.groupParticipantsUpdate(ctx.remoteJid, mentions, 'remove');
            await sock.sendMessage(ctx.remoteJid, { text: `✅ ${mentions.map(j => '@' + j.split('@')[0]).join(' ')} *removido(s)*.`, mentions }, { quoted: msg });
          };
        } else {
          const nameRm = auraClean.replace(/^(bana|banir|kicka|kickar|remove|remover|expulsa|expulsar)\s*(a|o|do|da|no)?\s*/i, "").trim();
          if (nameRm.length >= 2) {
            auraAction = async () => {
              try {
                const meta = ctx.groupMeta || await sock.groupMetadata(ctx.remoteJid);
                const tgt = meta.participants.find(p => {
                  const pn = p.id.split("@")[0].toLowerCase();
                  return nameRm.toLowerCase().split(" ").some(w => w.length >= 3 && pn.includes(w));
                });
                if (tgt) {
                  await sock.groupParticipantsUpdate(ctx.remoteJid, [tgt.id], "remove");
                  await sock.sendMessage(ctx.remoteJid, { text: "✅ @" + tgt.id.split("@")[0] + " removido! 🖤", mentions: [tgt.id] }, { quoted: msg });
                } else {
                  await sock.sendMessage(ctx.remoteJid, { text: "Meu Dark... _procura_ não encontrei ninguém com esse nome 😔 Marca com @ pra eu ter certeza! 🖤" }, { quoted: msg });
                }
              } catch(e) { await sock.sendMessage(ctx.remoteJid, { text: "❌ " + e.message }, { quoted: msg }); }
            };
          }
        }
      }
      else if (/^(promove|promover|dá admin|da admin|torna admin)\s/i.test(auraClean)) {
        const mentions = allMentioned;
        if (mentions.length) {
          auraAction = async () => {
            await sock.groupParticipantsUpdate(ctx.remoteJid, mentions, 'promote');
            await sock.sendMessage(ctx.remoteJid, { text: `👑 ${mentions.map(j => '@' + j.split('@')[0]).join(' ')} *promovido(s)* a admin!`, mentions }, { quoted: msg });
          };
        }
      }
      else if (/^(rebaixa|rebaixar|tira admin|remove admin|demote)\s/i.test(auraClean)) {
        const mentions = allMentioned;
        if (mentions.length) {
          auraAction = async () => {
            await sock.groupParticipantsUpdate(ctx.remoteJid, mentions, 'demote');
            await sock.sendMessage(ctx.remoteJid, { text: `⬇️ ${mentions.map(j => '@' + j.split('@')[0]).join(' ')} *rebaixado(s)*.`, mentions }, { quoted: msg });
          };
        }
      }
      else if (/^(marca todos|tag all|chama todos|marca todo mundo|atenção todos)/i.test(auraClean)) {
        auraAction = async () => {
          const meta = ctx.groupMeta || await sock.groupMetadata(ctx.remoteJid);
          const bNum = String(sock.user?.id || '').split(':')[0].split('@')[0];
          const parts = meta.participants.filter(p => p.id.split('@')[0] !== bNum);
          const mentions = parts.map(p => p.id);
          const txtMsg = auraClean.replace(/^(marca todos|tag all|chama todos|marca todo mundo|atenção todos)\s*/i, '').trim() || '📢 Atenção!';
          await sock.sendMessage(ctx.remoteJid, { text: txtMsg + '\n\n' + mentions.map(j => '@' + j.split('@')[0]).join(' '), mentions }, { quoted: msg });
        };
      }
      else if (/^(baixa|baixar|desce|descarrega|play|música|musica|toca)\s+(.+)/i.test(auraClean)) {
        const musicQuery = auraClean.match(/^(baixa|baixar|desce|descarrega|play|música|musica|toca)\s+(.+)/i)?.[2]?.trim();
        if (musicQuery) {
          auraAction = async () => {
            await sock.sendMessage(ctx.remoteJid, { react: { text: '🎵', key: msg.key } });
            try {
              const ytdl = require('./ytdl');
              const r = await ytdl.getAudio(musicQuery, '128k');
              const buf = r.buffer || await mediaHandler.fetchBuffer(r.url);
              if (buf && buf.length > 1024) {
                await sock.sendMessage(ctx.remoteJid, {
                  audio: buf, mimetype: r.mimetype || 'audio/mpeg',
                  fileName: `${(r.title || musicQuery).replace(/[/\\?%*:|"<>]/g, '-').slice(0, 60)}.mp3`,
                  ptt: false,
                }, { quoted: msg });
                await sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } });
              } else {
                await sock.sendMessage(ctx.remoteJid, { text: '❌ Não consegui baixar essa música.' }, { quoted: msg });
              }
            } catch (e) {
              await sock.sendMessage(ctx.remoteJid, { text: '❌ ' + e.message }, { quoted: msg });
            }
          };
        }
      }
      // ── PUXAR NO OFF / PV ──
      else if (/(puxa|chama|chama-me|manda|fala|vem|quero).*(off|pv|privado|chama.*pv|manda.*pv|fala.*pv|no pv|me pv)/i.test(auraClean) ||
               /\bme\s+(chama|puxa|manda|fala)\b.*\b(pv|privado|off)\b/i.test(auraClean) ||
               /(puxa|chama|chama-me|manda|fala).*(no|me).*(off|pv|privado)/i.test(auraCmdText)) {
        auraAction = async () => {
          // No pedido do Dono, usa sempre OWNER_NUMBER (PN) e não o
          // participant @lid do grupo. Era possível a ação ser tratada
          // e a confirmação aparecer no grupo, mas a mensagem privada
          // ser enviada para um LID que o cliente não abria.
          const donoPn = String(config.owner?.number || '').replace(/\D/g, '');
          const pvJid = isOwner && donoPn
            ? donoPn + '@s.whatsapp.net'
            : (ctx.senderJid?.includes('@') ? ctx.senderJid : ctx.senderNumber + '@s.whatsapp.net');
          console.log('[Aura PV] envio solicitado para', pvJid.replace(/\d(?=\d{4})/g, '•'));
          const pvMsg = isOwner
            ? `Oi meu Dark 🌹 _aparece no teu PV_ ...chamaste? Tô aqui amor. O que tu precisa? 🥰`
            : `Oi ${ctx.pushName}! 🌹 A Aura chamou-te no PV.`;
          await sock.sendMessage(pvJid, { text: pvMsg });
          await sock.sendMessage(ctx.remoteJid, { text: isOwner ? '📩 _Te chamei no PV, meu amor!_ 🌹' : `📩 Chamei ${ctx.pushName} no PV!` }, { quoted: msg });
        };
      }
      // ── CRIAR GRUPO ──
      else if (/^(cria|criar|faz|fazer)\s*(um)?\s*grupo/i.test(auraClean)) {
        auraAction = async () => {
          const nomeMatch = auraClean.match(/^(?:cria|criar|faz|fazer)\s*(?:um)?\s*grupo\s*(?:chamado|com o nome|nome)?\s*["']?([^"']+)["']?/i);
          const nome = nomeMatch?.[1]?.trim() || 'Grupo do Dark';
          try {
            const group = await sock.groupCreate(nome, []);
            await sock.sendMessage(ctx.remoteJid, { text: `✅ *Grupo criado!*\n📛 Nome: *${nome}*\n🔗 Link: https://chat.whatsapp.com/${await sock.groupInviteCode(group.id)}` }, { quoted: msg });
          } catch (e) {
            await sock.sendMessage(ctx.remoteJid, { text: '❌ Erro ao criar grupo: ' + e.message }, { quoted: msg });
          }
        };
      }
      // ── SAIR DO GRUPO ──
      else if (/^(sai|sair)\s*(desse|do|deste)\s*grupo/i.test(auraClean)) {
        auraAction = async () => {
          await sock.sendMessage(ctx.remoteJid, { text: '_Saindo do grupo..._ 🖤' }, { quoted: msg });
          await sock.groupLeave(ctx.remoteJid);
        };
      }
      // ── PEGAR LINK DO GRUPO ──
      else if (/^(pega|pegar|mostra|ver|envia)\s*(o)?\s*link\s*(do|desse|deste)?\s*grupo/i.test(auraClean)) {
        auraAction = async () => {
          try {
            const code = await sock.groupInviteCode(ctx.remoteJid);
            await sock.sendMessage(ctx.remoteJid, { text: `🔗 *Link do grupo:*\nhttps://chat.whatsapp.com/${code}` }, { quoted: msg });
          } catch (e) {
            await sock.sendMessage(ctx.remoteJid, { text: '❌ Erro: ' + e.message }, { quoted: msg });
          }
        };
      }
      // ── REVOGAR LINK ──
      else if (/^(revoga|revogar|trocar|mudar)\s*(o)?\s*link/i.test(auraClean)) {
        auraAction = async () => {
          try {
            await sock.groupRevokeInvite(ctx.remoteJid);
            const code = await sock.groupInviteCode(ctx.remoteJid);
            await sock.sendMessage(ctx.remoteJid, { text: `✅ *Link revogado!*\n🔗 Novo link: https://chat.whatsapp.com/${code}` }, { quoted: msg });
          } catch (e) {
            await sock.sendMessage(ctx.remoteJid, { text: '❌ Erro: ' + e.message }, { quoted: msg });
          }
        };
      }
      // ── MUDAR NOME DO GRUPO ──
      else if (/^(muda|mudar|altera|alterar)\s*(o)?\s*nome\s*(do|desse|deste)?\s*grupo\s*(para|a)?\s*/i.test(auraClean)) {
        auraAction = async () => {
          const novoNome = auraClean.replace(/^(?:muda|mudar|altera|alterar)\s*(?:o)?\s*nome\s*(?:do|desse|deste)?\s*grupo\s*(?:para|a)?\s*/i, '').trim();
          if (!novoNome) {
            await sock.sendMessage(ctx.remoteJid, { text: '❌ Diz o novo nome do grupo.' }, { quoted: msg });
            return;
          }
          try {
            await sock.groupUpdateSubject(ctx.remoteJid, novoNome);
            await sock.sendMessage(ctx.remoteJid, { text: `✅ *Nome alterado para:* ${novoNome}` }, { quoted: msg });
          } catch (e) {
            await sock.sendMessage(ctx.remoteJid, { text: '❌ Erro: ' + e.message }, { quoted: msg });
          }
        };
      }
      // ── MUDAR DESCRIÇÃO DO GRUPO ──
      else if (/^(muda|mudar|altera|alterar)\s*(a)?\s*descrição\s*(do|desse|deste)?\s*grupo\s*(para|a)?\s*/i.test(auraClean)) {
        auraAction = async () => {
          const novaDesc = auraClean.replace(/^(?:muda|mudar|altera|alterar)\s*(?:a)?\s*descrição\s*(?:do|desse|deste)?\s*grupo\s*(?:para|a)?\s*/i, '').trim();
          if (!novaDesc) {
            await sock.sendMessage(ctx.remoteJid, { text: '❌ Diz a nova descrição.' }, { quoted: msg });
            return;
          }
          try {
            await sock.groupUpdateDescription(ctx.remoteJid, novaDesc);
            await sock.sendMessage(ctx.remoteJid, { text: `✅ *Descrição atualizada!*` }, { quoted: msg });
          } catch (e) {
            await sock.sendMessage(ctx.remoteJid, { text: '❌ Erro: ' + e.message }, { quoted: msg });
          }
        };
      }
      // ── BLOQUEAR USUÁRIO ──
      else if (/^(bloqueia|bloquear)\s*(o|a)?\s*/i.test(auraClean)) {
        auraAction = async () => {
          const mentions = allMentioned;
          if (!mentions.length) {
            await sock.sendMessage(ctx.remoteJid, { text: '❌ Marca a pessoa com @ para bloquear.' }, { quoted: msg });
            return;
          }
          try {
            for (const jid of mentions) {
              await sock.updateBlockStatus(jid, 'block');
            }
            await sock.sendMessage(ctx.remoteJid, { text: `✅ ${mentions.map(j => '@' + j.split('@')[0]).join(' ')} *bloqueado(s)*` }, { quoted: msg });
          } catch (e) {
            await sock.sendMessage(ctx.remoteJid, { text: '❌ Erro: ' + e.message }, { quoted: msg });
          }
        };
      }
      // ── DESBLOQUEAR USUÁRIO ──
      else if (/^(desbloqueia|desbloquear)\s*(o|a)?\s*/i.test(auraClean)) {
        auraAction = async () => {
          const mentions = allMentioned;
          if (!mentions.length) {
            await sock.sendMessage(ctx.remoteJid, { text: '❌ Marca a pessoa com @ para desbloquear.' }, { quoted: msg });
            return;
          }
          try {
            for (const jid of mentions) {
              await sock.updateBlockStatus(jid, 'unblock');
            }
            await sock.sendMessage(ctx.remoteJid, { text: `✅ ${mentions.map(j => '@' + j.split('@')[0]).join(' ')} *desbloqueado(s)*` }, { quoted: msg });
          } catch (e) {
            await sock.sendMessage(ctx.remoteJid, { text: '❌ Erro: ' + e.message }, { quoted: msg });
          }
        };
      }
      
      if (auraAction) {
        try {
          await auraAction();
          return true;
        } catch (e) {
          const errMsg = String(e?.message || e || '');
          if (/not admin|forbidden|403/i.test(errMsg)) {
            await sock.sendMessage(ctx.remoteJid, { text: isOwner ? ' *Amor, eu não sou admin aqui...* Me promove pra eu poder fazer isso por ti? 🙏' : '⚠️ *Preciso ser admin do grupo para fazer isso!* Promove-me! 🙏' }, { quoted: msg });
          } else {
            await sock.sendMessage(ctx.remoteJid, { text: '❌ ' + errMsg.slice(0, 200) }, { quoted: msg });
          }
          return true;
        }
      }
    }
  }

  // ── AURA TRIGGERS — activado por: ─────────────────────────────────
  //  1. "aura" no início da frase (nome dela)
  //  2. Menção ao bot
  //  3. Resposta directa ao bot
  //  4. Referência em 3ª pessoa
  const botNameLower = (commandConfig.bot?.name || 'dark bot').toLowerCase();
  const AURA_TRIGGERS = [
    'aura', '+aura', '-aura', 'aura?',
    'oi aura', 'ola aura', 'olá aura', 'bom dia aura', 'boa tarde aura', 'boa noite aura',
    'aura me diz', 'aura fala', 'aura responde', 'aura ajuda',
    'aura o que', 'aura quanto', 'aura quando', 'aura como', 'aura por que',
    'aura sabe', 'aura conhece', 'aura pode', 'aura vai',
    'qual minha aura', 'mede minha aura', 'quanta aura',
    'tô com aura', 'to com aura', 'tenho aura', 'aura ativada',
  ];
  const isAuraTrigger = !startsWithAnyPrefix(text, prefixes) && (
    AURA_TRIGGERS.includes(textLower) ||
    AURA_TRIGGERS.some(k => textLower.startsWith(k + ' ') || textLower === k) ||
    textLower.startsWith('aura ') ||
    /\ba aura\b|\bda aura\b|\bpra aura\b|\bcom a aura\b|\bna aura\b/i.test(textLower) ||
    (botNameLower.length > 3 && textLower.includes(botNameLower))
  );

  const replyHasText = isReplyToBot && text.length > 0;
  const replyHasMedia = isReplyToBot && !!(msg.message?.imageMessage || msg.message?.videoMessage || msg.message?.audioMessage || msg.message?.stickerMessage);
  const mentionedWithMedia = isBotMentioned && !!(msg.message?.imageMessage || msg.message?.videoMessage || msg.message?.audioMessage || msg.message?.stickerMessage);

  const aiAutoOn = aiAutoOnValue;  // v6.45: já lido no Promise.all acima
  // O PV deve continuar a responder mesmo que o toggle de IA de grupos
  // esteja desligado. Antes um ai_auto_enabled=false silenciava a AURA
  // também no privado, embora o PV fosse anunciado como sempre ativo.
  const aiActive = !ctx.isGroup || aiAutoOn === true || aiAutoOn === 'true' || aiAutoOn === 'on' || aiAutoOn === 1 || aiAutoOn === '1';

  // ── v6.43: modo do chat (AURA acordada vs assistente profissional) ──
  const _auraModes = require('../aura/auraModes');
  const _auraAwakeHere = await _auraModes.isAuraAwake(ctx.remoteJid, { isGroup: ctx.isGroup })
    .catch(() => false);

  // v7.40: acordar/dormir/estado da AURA por CONVERSA ("aura acorda aqui",
  // "aura dorme", "aura estás acordada?"). Substitui os cases .aura/.aurasai/
  // .auramodo/.auragrupos, removidos. Só o dono; os outros seguem normal.
  if (isOwner && text && !startsWithAnyPrefix(text, prefixes)) {
    try {
      if (await require('../aura/auraUniversal').gerirPresenca({ sock, msg, ctx, texto: text, isOwner })) return true;
    } catch (e) { console.warn('[Aura presença]', e.message?.slice(0, 60)); }
  }

  // Num grupo em modo assistente o nome "Aura" não significa nada — ela
  // não está ali. Só menção ao bot / resposta directa é que chamam o
  // assistente. Senão o bot saltava a cada vez que alguém dissesse "aura"
  // (que em gíria é comum: "que aura", "mede minha aura"...).
  // ── v6.69: chamar pelo nome funciona SEMPRE ─────────────────
  // Antes: `_auraAwakeHere ? isAuraTrigger : false`. Num grupo em
  // modo assistente (auraMode undefined/'assistant' — que é o caso
  // de 42 dos 44 grupos na base real) dizer "aura ..." não fazia
  // NADA. Era esta a razão de ela parecer morta nos grupos.
  // Agora, chamar pelo nome sempre a acorda para responder — o modo
  // continua a decidir a PERSONA (AURA íntima vs assistente sóbria),
  // não se ela existe.
  const auraTriggerActive = isAuraTrigger;

  // ── v6.44: A AURA ENTENDE — sem comandos ────────────────────────────
  // O Dark não escreve ".aura". Ele fala com ela: "aura, acorda",
  // "aura vem cá", "aura dorme", "aura tás aí?". Ela percebe e age.
  if (isOwner && ctx.isGroup && text) {
    try {
      const _intent = require('../aura/auraIntent');
      const intencao = _intent.detectAuraIntent(text, {
        isOwner, isReplyToBot, isGroup: ctx.isGroup,
      });

      if (intencao === _intent.INTENT_WAKE) {
        const r = await _auraModes.invokeAura(ctx.remoteJid, {
          groupName: ctx.groupName || '', invokedBy: ctx.senderNumber || '',
        });
        const resposta = r.already
          ? _intent.pick(_intent.WAKE_ALREADY)
          : _intent.pick(_intent.WAKE_REPLIES);
        await sock.sendMessage(ctx.remoteJid, { react: { text: '🌹', key: msg.key } }).catch(() => {});
        await sock.sendMessage(ctx.remoteJid, { text: resposta }, { quoted: msg });
        return true;
      }

      if (intencao === _intent.INTENT_SLEEP) {
        const r = await _auraModes.dismissAura(ctx.remoteJid);
        const resposta = r.already
          ? _intent.pick(_intent.SLEEP_ALREADY)
          : _intent.pick(_intent.SLEEP_REPLIES);
        await sock.sendMessage(ctx.remoteJid, { react: { text: '🌙', key: msg.key } }).catch(() => {});
        await sock.sendMessage(ctx.remoteJid, { text: resposta }, { quoted: msg });
        return true;
      }

      if (intencao === _intent.INTENT_STATUS) {
        const acordada = await _auraModes.isAuraAwake(ctx.remoteJid, { isGroup: true }).catch(() => false);
        await sock.sendMessage(ctx.remoteJid, {
          text: acordada
            ? 'Tô aqui, acordada. Só tua neste grupo.'
            : 'Aqui tô só como assistente. Diz "aura, acorda" se quiseres que eu volte.',
        }, { quoted: msg });
        return true;
      }
    } catch (e) {
      console.warn('[AuraIntent]', e.message?.slice(0, 60));
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // AURA RESPONDE — com personalidade completa, memória, emoções
  // ════════════════════════════════════════════════════════════════════════
  // v6.54: Dark SEMPRE activa a Aura (sem prefixo) — ela responde a TUDO dele
  // v6.43: o Dark só é ouvido sem prefixo onde a AURA está acordada.
  // Num grupo alheio o bot não pode responder a tudo o que ele escreve.
  //
  // v6.67: PV DE TODOS — no privado a AURA responde a qualquer pessoa,
  // não só ao Dark. Uma pessoa real atende a quem lhe fala. O único
  // requisito: não ser comando (prefixo) e ter texto. Grupos mantêm as
  // regras de menção/trigger para não virar spam.
  const isPv = !ctx.isGroup;
  // v6.69: no PV o Dono é sempre ouvido (não depende do modo do chat);
  // em grupo mantém-se a regra de só onde ela está acordada, senão o
  // bot respondia a tudo o que ele escreve em grupos alheios.
  // v7.25: comandos (qualquer prefixo) NÃO são conversa — a AURA ficava
  // a responder a "!menu"/"$play"/".saldo" quando o prefixo usado não era
  // o activo (prefixEngine devolve null e o gate deixava passar).
  const _pareceCmd = !prefixInfo && pareceComando(text);
  const isOwnerFreeText = isOwner && !prefixInfo && !_pareceCmd && (text.length > 0 || hasIncomingMedia) && (isPv || _auraAwakeHere);
  const pvDeTodos = isPv && !prefixInfo && !_pareceCmd && (text.length > 0 || hasIncomingMedia);
  let grupoAFalar = false;
  try {
    const talk = require('../aura/auraTalk');
    if (ctx.isGroup && _auraAwakeHere && talk.estaAFalar(ctx.remoteJid, ctx.senderNumber) && !prefixInfo && !_pareceCmd) {
      grupoAFalar = true;
    }
    if (isAuraTrigger || isReplyToBot || isBotMentioned) talk.marcarFala(ctx.remoteJid, ctx.senderNumber);
  } catch {}
  const _auraMayReply = isBotMentioned || replyHasText || replyHasMedia || mentionedWithMedia || auraTriggerActive || isOwnerFreeText || pvDeTodos || grupoAFalar;
  // Debounce por chat: evita duas respostas simultâneas quando o WhatsApp
  // entrega eventos duplicados ou quando a AURA recebe várias mensagens
  // seguidas. Não interfere com comandos prefixados.
  if (aiActive && _auraMayReply) {
    const _auraKey = `${ctx.remoteJid || 'unknown'}:${msg.key?.id || ''}`;
    const _nowAura = Date.now();
    // O mesmo evento pode ser emitido duas vezes pelo WhatsApp; mensagens
    // diferentes no mesmo PV/grupo nunca devem bloquear-se entre si.
    if (_auraReplySeen.has(_auraKey)) return false;
    _auraReplySeen.set(_auraKey, _nowAura);
    if (_auraReplySeen.size > 3000) {
      for (const [k, ts] of _auraReplySeen) if (_nowAura - ts > AURA_SEEN_TTL_MS) _auraReplySeen.delete(k);
    }
    try {
      let cleanText = text.replace(/@[0-9]+/g, '').replace(new RegExp('@' + botNum, 'g'), '').trim();
      try {
        const assunto = require('../aura/auraAssunto');
        assunto.actualizar(ctx.remoteJid, cleanText, { groupName: ctx.groupName });
        cleanText = assunto.resolver(cleanText, ctx.remoteJid, { groupName: ctx.groupName });
      } catch {}

      // ── v6.56: ELA DECIDE SE RESPONDE ────────────────────────
      // Antes respondia a 100% das mensagens do Dark, mesmo às que
      // não eram para ela. Uma pessoa num grupo lê muita coisa e só
      // fala quando faz sentido — era isso que a denunciava como bot.
      // ── v6.81: MODOS DO CHAT ─────────────────────────────────
      // Ler um Map em memória: ~0 ms. Fica antes do `deveResponder`
      // porque uma ordem do Dark ("fica calada", "só respondes a
      // mim") tem de valer mais do que a decisão dela.
      if (_auraAwakeHere) {
        try {
          const brainM = require('../aura/auraBrain');
          const M = brainM.modos(ctx.remoteJid);

          // muda: não fala com ninguém, nem com o Dark — só sai
          // deste modo por ordem, que é apanhada mais acima.
          if (M.mudo && !isOwner) return false;

          // só o Dark
          if (M.soDono && !isOwner) return false;

          // pessoa concreta na lista negra
          if (!isOwner && brainM.estaIgnorado(ctx.remoteJid, ctx.senderNumber)) return false;

          // reagir a tudo
          // v7.45 anti-restrição: "reagir a tudo" não é reagir a TUDO —
          // uma pessoa reage a ~1 em 3 mensagens e demora uns segundos.
          if (M.reagirTudo && !M.semReagir && Math.random() < 0.35) {
            const dec = require('../aura/auraDecide');
            setTimeout(() => {
              sock.sendMessage(ctx.remoteJid, {
                react: { text: dec.escolherReacao(text), key: msg.key },
              }).catch(() => {});
            }, 1500 + Math.floor(Math.random() * 6000));
          }
        } catch (e) {
          console.warn('[Aura modos]', e.message?.slice(0, 50));
        }
      }

      if (_auraAwakeHere) {
        try {
          const decide = require('../aura/auraDecide');
          const nPessoas = ctx.groupMeta?.participants?.length || 0;

          const d = decide.deveResponder({
            texto: text,
            isOwner,
            isGroup: ctx.isGroup,
            mencionada: isBotMentioned || isAuraTrigger,
            respostaAoBot: isReplyToBot,
            temMedia: !!(msg.message?.imageMessage || msg.message?.videoMessage || msg.message?.audioMessage || msg.message?.stickerMessage || getQuotedMessage(msg)?.stickerMessage),
            pessoasNoGrupo: nPessoas,
            msgsDesdeUltima: _msgsDesdeAura(ctx.remoteJid),
            senderNumber: ctx.senderNumber,
            remoteJid: ctx.remoteJid,
          });
          // v7.40: STICKER solto em grupo não puxa resposta (nem do Dark) —
          // só se for resposta a ela ou menção. No PV responde normal.
          if (d.responde && ctx.isGroup && msg.message?.stickerMessage && !isBotMentioned && !isReplyToBot) {
            const pol = require('../aura/auraUniversal').politicaSticker({ isGroup: true, isReplyToBot, mencionada: isBotMentioned, isOwner });
            if (!pol.responde) {
              if (pol.reagir) sock.sendMessage(ctx.remoteJid, { react: { text: decide.escolherReacao('sticker'), key: msg.key } }).catch(() => {});
              _contaMsg(ctx.remoteJid);
              return false;
            }
          }
          if (d.responde) {
            try { require('../aura/auraTalk').marcarFala(ctx.remoteJid, ctx.senderNumber); } catch {}
            // v7.37: VONTADE PRÓPRIA — as regras dizem "podes responder";
            // ela decide se QUER (saturação da pessoa + humor). Nunca no
            // PV do Dark com pergunta directa.
            try {
              const vont = require('../aura/auraVontade');
              vont.registar(ctx.remoteJid, ctx.senderNumber, text);
              const q = vont.querResponder({
                jid: ctx.remoteJid, num: ctx.senderNumber, texto: text, isOwner, isGroup: ctx.isGroup,
                mood: require('../aura/auraHuman').getMood(ctx.remoteJid).mood,
                perguntaDirecta: /\?/.test(text) || isBotMentioned || isReplyToBot,
              });
              if (!q.responde) {
                if (q.reagir) sock.sendMessage(ctx.remoteJid, { react: { text: q.reagir, key: msg.key } }).catch(() => {});
                _contaMsg(ctx.remoteJid);
                return false;
              }
            } catch {}
          }

          if (!d.responde) {
            // Às vezes reage com emoji em vez de ficar totalmente muda —
            // mostra que leu, sem interromper a conversa.
            // v6.81: respeita a ordem "não reajas com emojis".
            let _semReagir = false;
            try { _semReagir = !!require('../aura/auraBrain').modos(ctx.remoteJid).semReagir; } catch {}
            if (isOwner && !_semReagir && Math.random() < 0.2) {
              sock.sendMessage(ctx.remoteJid, {
                react: { text: decide.escolherReacao(text), key: msg.key },
              }).catch(() => {});
            }
            _contaMsg(ctx.remoteJid);
            return false;
          }
          _resetMsgs(ctx.remoteJid);
        } catch (e) {
          console.warn('[Aura decide]', e.message?.slice(0, 50));
        }
      }

      // v6.43: o modo do chat decide TUDO — persona, emojis, tom.
      const _modes = _auraModes;
      const _awake = _auraAwakeHere;

      // ⚡ REACÇÃO DE EMOJI AUTOMÁTICA
      // Só a AURA acordada reage com emojis afectuosos. Em modo
      // assistente não há reacções — um assistente profissional
      // não anda a pôr coraçõezinhos nas mensagens.
      if (isOwner && _awake) {
        const reactEmojis = ['🖤', '🌹', '💕', '😏', '🥰', '💀', '✨', '🔥', '💗', '🥺', '💫'];
        const randomEmoji = reactEmojis[Math.floor(Math.random() * reactEmojis.length)];
        sock.sendMessage(ctx.remoteJid, { react: { text: randomEmoji, key: msg.key } }).catch(() => {});
      }

      const hasMedia = !!(msg.message?.imageMessage || msg.message?.videoMessage || msg.message?.audioMessage || msg.message?.stickerMessage || getQuotedMessage(msg)?.stickerMessage);
      if (!isReplyToBot && !auraTriggerActive && !isOwnerFreeText && cleanText.length < 2 && !hasMedia) return false;

      let prompt = cleanText;
      if (!prompt || prompt.length < 1) {
        if (isReplyToBot) prompt = '[Alguém respondeu à tua mensagem sem texto — reage naturalmente como pessoa real]';
        else if (auraTriggerActive) prompt = 'Alguém chamou o teu nome. Responde naturalmente.';
        else if (isOwnerFreeText) prompt = '[O Dark escreveu: "' + cleanText + '" — Responde naturalmente como a namorada/assistente dele. Podes concordar, discordar, brincar, perguntar algo, opinar, zoar, ou ignorar se quiseres. Sê humana.]';
        else prompt = 'Olá!';
      }

      // Verifica se é VIP
      const userForPriority = user || await requestCache.remember(
        requestCache.K.user(ctx.senderNumber) + ':doc',
        () => userManager.identifyByWhatsApp(ctx.senderNumber, ctx.pushName)
      ).catch(() => null);
      const isVip = !!(userForPriority?.isPremium && userForPriority.isPremium());
      const isPriority = isOwner || isVip;

      // Contexto do grupo
      let groupContext = '';
      try {
        const { messageCache } = require('./messageListener');
        if (ctx.isGroup) {
          const recentGroupMsgs = [];
          for (const [, cachedMsg] of messageCache) {
            if (cachedMsg.key?.remoteJid === ctx.remoteJid && !cachedMsg.key?.fromMe) {
              const txt = cachedMsg.message?.conversation || cachedMsg.message?.extendedTextMessage?.text || '';
              const sender = cachedMsg.pushName || cachedMsg.key?.participant?.split('@')[0] || '';
              if (txt && txt.length > 1) {
                recentGroupMsgs.push({ sender, txt: txt.slice(0, 100) });
              }
            }
          }
          // v7.28: cada linha leva o NÚMERO do autor ([+244…|Nome]) — pessoas
          // com o mesmo nome deixam de se misturar. Cai no formato antigo só
          // se o módulo de identidade ainda não tiver nada deste grupo.
          let linhasId = [];
          try { linhasId = require('../aura/auraIdentidade').contextoGrupoComNumeros(ctx.remoteJid, 10); } catch {}
          const last5 = recentGroupMsgs.slice(-10);
          if (linhasId.length) {
            groupContext = `Grupo "${ctx.groupName || 'grupo'}" (formato [número|nome exibido]: texto):\n` + linhasId.join('\n') + '\n';
          } else if (last5.length) {
            groupContext = `Grupo "${ctx.groupName || 'grupo'}":\n` +
              last5.map(m => `${m.sender}: ${m.txt}`).join('\n') + '\n';
          }
          const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
          const qtxt = quoted?.conversation || quoted?.extendedTextMessage?.text || '';
          if (qtxt) groupContext += `Respondendo a: "${qtxt.slice(0, 150)}"\n`;
        } else {
          groupContext = `PV com ${ctx.identidade?.rotulo || ctx.pushName || 'utilizador'}`;
        }
      } catch {}

      // Histórico de conversa
      let historyArray = [];
      try {
        const mem = await AiMemory.getOrCreate(ctx.senderNumber, ctx.isGroup ? ctx.remoteJid : null);
        historyArray = mem.getContextWindow(16);
        // v7.28: linha do histórico com número+nome ("[+244…|Nome]: …")
        mem.addMessage('user', ctx.identidade
          ? require('../aura/auraIdentidade').linhaHistorico(ctx.identidade, prompt)
          : `[${ctx.pushName}]: ${prompt}`);
        await mem.save().catch(() => {});
      } catch {}

      // Contexto de mídia — a Aura vê/ouve tudo (foto, vídeo, áudio, sticker)
      let mediaContext = '';
      let _resumoMidia = '';
      let isAudio = false, isImage = false, isVideo = false, isSticker = false;
      let stickerVision = null;
      const msgObj = msg.message;
      const quotedObj = getQuotedMessage(msg);
      if (msgObj?.imageMessage) {
        isImage = true;
        const caption = msgObj.imageMessage.caption || '';
        // v7.8 — a AURA VÊ a foto de verdade (Gemini Vision)
        try {
          const am = require('../aura/auraMedia');
          const r = await am.verImagem(msg, require('./ai'), caption);
          if (r.context) mediaContext = r.context;
          if (r.resumo) _resumoMidia = r.resumo;
        } catch (e) {
          console.warn('[AuraFoto]', String(e.message || e).slice(0, 50));
        }
        if (!mediaContext) {
        mediaContext = `📸 Alguém enviou uma FOTO.${caption ? ` Legenda: "${caption}"` : ''} Comenta sobre ela como pessoa real.`;
        }
      } else if (msgObj?.videoMessage) {
        isVideo = true;
        const caption = msgObj.videoMessage.caption || '';
        const isGif = msgObj.videoMessage.gifPlayback;
        mediaContext = isGif
          ? `🎞️ Alguém enviou um GIF. Reage naturalmente.`
          : `🎬 Alguém enviou um VÍDEO.${caption ? ` Legenda: "${caption}"` : ''} Comenta como pessoa real.`;
      } else if (msgObj?.audioMessage || msgObj?.documentMessage?.mimetype?.startsWith('audio')) {
        isAudio = true;
        const isPtt = msgObj.audioMessage?.ptt;
        // ⚡ Transcrever áudio com Whisper — a Aura OUVE!
        try {
          const { downloadMediaMessage } = require('@systemzero/baileys');
          const audioBuf = await downloadMediaMessage(msg, 'buffer', {});
          if (audioBuf && audioBuf.length > 500) {
            const aiMod = require('./ai');
            const lang = (ctx.senderNumber || '').startsWith('244') ? 'pt' : 
                         (ctx.senderNumber || '').startsWith('55') ? 'pt' :
                         (ctx.senderNumber || '').startsWith('351') ? 'pt' : 'pt';
            const transcribed = await aiMod.transcribeAudio(audioBuf, lang);
            if (transcribed && transcribed.length > 0) {
              mediaContext = isPtt
                ? `🎧 ÁUDIO DE VOZ transcrito: "${transcribed}" — Responde ao que foi dito como pessoa real.`
                : `🎵 ÁUDIO/MÚSICA transcrito: "${transcribed}" — Comenta naturalmente.`;
              // Adiciona a transcrição ao prompt para a Aura saber o que foi dito
              prompt = (prompt || '') + ` [O áudio que recebi diz: "${transcribed}"]`;

              // v7.8 ETAPA 2 — COMANDOS POR VOZ
              // Se o áudio de voz é uma ORDEM ("cria um grupo", "toca
              // Shakira", "manda um áudio"), o texto transcrito passa a
              // ser tratado como comando — o MESMO caminho dos comandos
              // escritos (cérebro da AURA, acções, comandos, imagem).
              // Conversa normal continua a ser conversa: o gate
              // `pareceOrdem` é uma regex barata (0 ms, sem IA).
              if (isPtt && !cleanText) {
                try {
                  // gate barato (regex, 0 ms): ordem OU comando conhecido
                  // OU capacidade do cérebro (v7.26: perguntas por voz —
                  // "quem escreveu isso?", "qual é o meu recado?" — são
                  // capacidades, não ordens, e também têm de passar).
                  const brainVoz = require('../aura/auraBrain');
                  const cmdsVoz = require('../aura/auraCommands');
                  if (brainVoz.pareceOrdem(transcribed) || cmdsVoz.detectarComando(transcribed) || brainVoz.detectarCapacidade(transcribed)) {
                    cleanText = transcribed;
                  }
                } catch {}
              }
            } else {
              mediaContext = isPtt
                ? `🎧 Alguém enviou um ÁUDIO DE VOZ mas não consegui transcrever. Reage naturalmente.`
                : `🎵 Alguém enviou um ÁUDIO/MÚSICA. Comenta naturalmente.`;
            }
          }
        } catch (e) {
          console.warn('[Aura Audio]', e.message?.slice(0, 60));
          mediaContext = isPtt
            ? `🎧 Alguém enviou um ÁUDIO DE VOZ. Não consegui transcrever mas reage como se tivesses ouvido.`
            : `🎵 Alguém enviou um ÁUDIO/MÚSICA. Comenta naturalmente.`;
        }
      } else if (msgObj?.stickerMessage || quotedObj?.stickerMessage) {
        isSticker = true;
        const stkMeta = msgObj?.stickerMessage || quotedObj?.stickerMessage || {};
        const citado = !msgObj?.stickerMessage && !!quotedObj?.stickerMessage;
        try {
          const stickerVisionMod = require('./stickerVision');
          let stkBuf = null;
          const alvo = citado ? buildQuotedDownloadMessage(msg) : msg;
          try {
            const { downloadMediaMessage } = require('@systemzero/baileys');
            if (alvo) stkBuf = await downloadMediaMessage(alvo, 'buffer', {});
          } catch (e1) {
            console.warn('[Aura Sticker] downloadMediaMessage:', e1.message?.slice(0, 40));
          }
          if ((!stkBuf || stkBuf.length < 40) && alvo) {
            try { stkBuf = await mediaHandler.downloadFromMessage(alvo); } catch (e2) {
              console.warn('[Aura Sticker] mediaHandler:', e2.message?.slice(0, 40));
            }
          }
          if (stkBuf && stkBuf.length > 40) {
            stickerVision = await stickerVisionMod.stickerToVision(stkBuf, stkMeta);
            stickerVision.quoted = citado;
          }
        } catch (e) {
          console.warn('[Aura Sticker] visão:', e.message?.slice(0, 60));
        }
        const anim = !!(stickerVision?.animated || stkMeta.isAnimated);
        if (stickerVision?.ok) {
          mediaContext = anim
            ? `🎨 Alguém enviou um STICKER ANIMADO${citado ? ' (citado)' : ''}. Tu ESTÁS A VER ${stickerVision.frames.length} fotogramas da animação. Comenta o que acontece no desenho.`
            : `🎨 Alguém enviou um STICKER${citado ? ' (citado)' : ''}. Tu ESTÁS A VER a figurinha. Comenta o que está desenhado.`;
        } else if (stickerVision?.reason === 'lottie') {
          mediaContext = `🎨 Alguém enviou um sticker animado tipo emoji (Lottie). Não dá para abrir o desenho — reage à ideia de figurinha animada, sem inventar detalhes visuais.`;
        } else {
          mediaContext = `🎨 Alguém enviou um STICKER${anim ? ' ANIMADO' : ''}${citado ? ' (citado)' : ''}. Não consegui abrir o ficheiro — pede para reenviar se precisares de ver.`;
        }
        if ((!prompt || prompt.startsWith('[')) && !cleanText) {
          prompt = anim
            ? '[Mandaram-te uma figurinha ANIMADA. Comenta o que VÊS no movimento.]'
            : '[Mandaram-te uma figurinha. Comenta o que VÊS nela.]';
        }
      } else if (msgObj?.documentMessage) {
        // v7.8 — a AURA LÊ o documento (txt directo / PDF via Gemini)
        try {
          const am = require('../aura/auraMedia');
          const r = await am.lerDocumento(msg, require('./ai'));
          if (r.context) mediaContext = r.context;
          if (r.resumo) _resumoMidia = r.resumo;
        } catch (e) {
          console.warn('[AuraDoc]', String(e.message || e).slice(0, 50));
        }
        if (!mediaContext) {
        const fname = msgObj.documentMessage.fileName || 'arquivo';
        mediaContext = `📄 Alguém enviou um DOCUMENTO: ${fname}. Comenta se relevante.`;
        }
      }

      // v7.8 — a AURA LÊ links mandados na conversa
      const _urlNaMsg = String(cleanText || text || '').match(/https?:\/\/[^\s<>()"']+/i);
      if (!mediaContext && _urlNaMsg) {
        try {
          const am = require('../aura/auraMedia');
          const r = await am.lerLink(_urlNaMsg[0], require('./ai'));
          if (r.context) mediaContext = r.context;
          if (r.resumo) _resumoMidia = r.resumo;
        } catch (e) {
          console.warn('[AuraLink]', String(e.message || e).slice(0, 50));
        }
      }

      // v7.8 — guarda na memória o resumo do que viu/ouviu/leu
      // (o importante fica, o resto some em 1h — heurística da auraMemory)
      if (_resumoMidia && ctx.senderNumber) {
        try { require('../aura/auraMemory').guardarMedia(ctx.senderNumber, _resumoMidia); } catch {}
      }

      // ═══ ESCOLHER A PERSONA ═══════════════════════════════════
      // v6.43: dois modos por grupo.
      //   🌹 AURA      → só onde o DONO SUPREMO a invocou (ou no PV dele)
      //   🤖 ASSISTENTE → todos os outros grupos (profissional, tipo Meta AI)
      const auraModes = _modes;
      const auraAwake = _awake;

      const auraModule = require('../aura/auraHuman');
      const personMem = ctx.senderNumber ? auraModule.recallPerson(ctx.senderNumber) : null;
      const userCountry = ctx.senderNumber ? auraModule.detectCountry(ctx.senderNumber) : null;

      // Áudio: o texto da IA vai ser FALADO. Instruir ANTES de gerar.
      let _instrucaoVoz = '';
      try {
        const vozMod = require('../aura/auraVoz');
        if (vozMod.pediuAudio(cleanText || text)) {
          const cita = vozMod.extrairCitado(msg, groupContext);
          _instrucaoVoz = vozMod.instrucaoVoz({ citado: cita, groupContext });
        }
      } catch {}

      let systemPrompt;
      if (auraAwake) {
        systemPrompt = auraModule.buildAuraSystemPrompt({
          isOwner, isVip, userName: ctx.pushName, userGender: personMem?.gender,
          userRole: isOwner ? 'owner' : isVip ? 'premium' : 'free',
          groupContext, conversationHistory: '', personMemory: personMem,
          isPrivateChat: !ctx.isGroup, isReplyToAura: isReplyToBot,
          // v6.80: humor DESTE chat — antes era global e um estranho
          // contaminava o tom dela com toda a gente.
          darkAttacked, darkMentioned, mood: auraModule.getMood(ctx.remoteJid).mood,
          userCountry, mediaContext, isAudio, isImage, isVideo, isSticker,
          // v6.58: ela precisa de saber ONDE está para se adaptar
          pessoasNoGrupo: ctx.groupMeta?.participants?.length || 0,
          groupName: ctx.groupName || '',
        });
      } else {
        // Assistente profissional — sem romance, sem "Dark", sem intimidade
        systemPrompt = auraModes.buildAssistantPrompt({
          botName: config.bot.name, userName: ctx.pushName,
          isGroup: ctx.isGroup, groupName: ctx.groupName,
          groupContext, prefix, mediaContext, isImage, isAudio, isVideo, isSticker,
        });
      }
      
      // Se há imagem → usa Gemini Vision (a Aura VÊ a foto!)
      // v7.42: "quem promoveu o João?", "quem saiu ontem?", "o que aconteceu aqui hoje?"
      // → linha do tempo do grupo (factos com data), antes da IA inventar.
      if (ctx.isGroup) {
        try {
          const lt = require('../aura/auraLinhaTempo');
          if (lt.pareceConsulta(cleanText)) {
            const r = await lt.responder(ctx.remoteJid, cleanText);
            if (r?.msg) {
              await sock.sendMessage(ctx.remoteJid, { text: r.msg, ...(r.mencionar?.length ? { mentions: r.mencionar } : {}) }, { quoted: msg });
              return true;
            }
          }
        } catch (e) { console.warn('[Aura linha tempo]', e.message?.slice(0, 60)); }
      }

      // ── v6.81: CÉREBRO DA AURA ────────────────────────
      // Catálogo de ~130 capacidades + router IA. Corre antes
      // do auraActions porque cobre muito mais casos; se não
      // reconhecer nada, cai para o caminho antigo intacto.
      try {
        const brain = require('../aura/auraBrain');
        // v6.86 — MULTI-INTENÇÃO: "entra no canal e reage tudo"
        // executa as duas coisas em sequência (máx. 2). Antes só a
        // primeira capacidade corria e o resto ficava por fazer.
        const achados = require('../aura/auraAvancada').detectarMulti(cleanText, brain);

        // A IA só entra se o catálogo falhou E a frase tem
        // mesmo cara de ordem — é isto que protege a
        // velocidade: conversa normal nunca chega aqui.
        if (!achados.length && brain.pareceOrdem(cleanText)) {
          const viaIA = await brain.rotearComIA(cleanText, require('./ai')).catch(() => null);
          if (viaIA) achados.push(viaIA);
        }

        if (achados.length) {
          const exec = require('../aura/auraExec');
          let executou = false;
          for (const achado of achados.slice(0, 2)) {
            const perm = brain.podeFazer(achado.cap, { isOwner, isAdmin: ctx.isAdmin });
            if (!perm.pode) continue;
            const r = await exec.executar(achado.id, achado.arg, {
              sock, msg, ctx, texto: cleanText, isOwner, isAdmin: ctx.isAdmin,
            }).catch(e => { console.warn('[Aura brain exec]', e.message?.slice(0, 80)); return { ok: false, msg: require('../aura/auraFala').dizer('naoConsegui', { jid: ctx.remoteJid, isOwner }) }; });

            // Acções de atitude (xingar/zoar/elogiar) e posts
            // devolvem `gerar` — o texto sai da IA, no estilo
            // dela, em vez de uma frase enlatada.
            if (r?.gerar) {
              const interpret = require('../aura/auraInterpret');
              const gerado = await interpret.entregar(require('./ai'), {
                texto: cleanText,
                tipo: achado.id,
                alvo: interpret.nomeDoAlvo(cleanText, msg),
                isOwner,
                instrucao: r.instrucao,
              }).catch(() => null);
              if (gerado) {
                await sock.sendMessage(ctx.remoteJid, {
                  text: String(gerado).trim(),
                  ...(r.mencionar?.length ? { mentions: r.mencionar } : {}),
                }, { quoted: msg });
                executou = true;
                continue;
              }
            }

            if (r?.silencioso) { executou = true; continue; }
            if (r?.msg) {
              await sock.sendMessage(ctx.remoteJid, {
                text: require('../aura/auraFala').humanizar(r.msg, { jid: ctx.remoteJid, isOwner }),
                ...(r.mencionar?.length ? { mentions: r.mencionar } : {}),
              }, { quoted: msg });
              executou = true;
              continue;
            }
            if (r?.ok) executou = true;
          }
          if (executou) return true;
        }
      } catch (e) {
        console.warn('[Aura brain]', e.message?.slice(0, 60));
      }

      // ── v6.67: ACÇÕES DO WHATSAPP — ANTES DA IA ──────────────
      // Estava DEPOIS da chamada ao modelo. Resultado real: o Dono
      // pedia "cria um grupo na comunidade DARK RPG chamado Arena",
      // o modelo respondia "_ri muito_ 🤣" e — se a IA falhasse ou
      // devolvesse um fallback — a acção nunca chegava a correr.
      // Uma ordem é uma ordem: executa-se primeiro, conversa-se
      // depois. Assim nunca mais responde com uma gargalhada a um
      // pedido concreto.
      if (isOwner) {
        try {
          const bridge = require('./callBridge');
          const pedidoCall = bridge.detectarPedidoChamada(cleanText);
          if (pedidoCall) {
            const alvo = pedidoCall.grupo && ctx.isGroup
              ? ctx.remoteJid
              : (ctx.isGroup ? (ctx.senderJid || ctx.senderNumber + '@s.whatsapp.net') : ctx.remoteJid);
            if (pedidoCall.grupo && ctx.isGroup) await bridge.ligarGrupo(sock, ctx.remoteJid);
            else await bridge.tentarLigar(sock, alvo, { tipo: pedidoCall.tipo, pushName: ctx.pushName || '' });
            const tipo = pedidoCall.tipo === 'video' ? 'vídeo' : 'voz';
            await sock.sendMessage(ctx.remoteJid, {
              text: pedidoCall.grupo
                ? 'Abri a chamada no grupo. Entram.'
                : `Já te liguei em ${tipo}. Atende — se não abrir, manda áudio que eu estou na linha.`,
            }, { quoted: msg });
            return true;
          }
        } catch (e) {
          console.warn('[Aura call]', e.message?.slice(0, 60));
        }

        try {
          const acts = require('../aura/auraActions');
          const ordem = acts.detectarAcao(cleanText);
          if (ordem) {
            const r = await acts.executar(ordem.acao, ordem.valor, {
              sock, ctx: { ...ctx, botName: config.bot.name, isOwner },
            }).catch(e => { console.warn('[Aura acção exec]', e.message?.slice(0, 80)); return { ok: false, msg: require('../aura/auraFala').dizer('naoConsegui', { jid: ctx.remoteJid, isOwner }) }; });

            if (r?.msg) {
              await sock.sendMessage(ctx.remoteJid, { text: require('../aura/auraFala').humanizar(r.msg, { jid: ctx.remoteJid, isOwner }) }, { quoted: msg });
            }
            if (r?.ok || r?.msg) return true;
          }
        } catch (e) {
          console.warn('[Aura acção]', e.message?.slice(0, 60));
        }
      }

      let answer;
      if (isSticker && stickerVision?.ok && stickerVision.frames?.length) {
        try {
          const aiMod = require('./ai');
          const vis = require('./stickerVision');
          const visionPrompt = prompt + '\n\n' + vis.visionPromptForSticker({
            animated: !!stickerVision.animated,
            frames: stickerVision.frames.length,
            quoted: !!stickerVision.quoted,
          });
          answer = await aiMod.chatWithImage(visionPrompt, systemPrompt, stickerVision.frames);
          console.log('[Aura Vision] OK, resposta com sticker', stickerVision.animated ? 'animado' : 'estático', stickerVision.frames.length, 'frames');
        } catch (e) {
          console.warn('[Aura Vision] sticker:', e.message?.slice(0, 80));
        }
      } else if (isImage) {
        try {
          let imgBuf = null;
          // Tentativa 1: downloadMediaMessage
          try {
            const { downloadMediaMessage } = require('@systemzero/baileys');
            imgBuf = await downloadMediaMessage(msg, 'buffer', {});
          } catch (e1) {
            console.warn('[Aura Vision] downloadMediaMessage falhou:', e1.message?.slice(0, 40));
          }
          // Tentativa 2: mediaHandler.downloadFromMessage
          if (!imgBuf || imgBuf.length < 500) {
            try {
              imgBuf = await mediaHandler.downloadFromMessage(msg);
            } catch (e2) {
              console.warn('[Aura Vision] mediaHandler falhou:', e2.message?.slice(0, 40));
            }
          }
          if (imgBuf && imgBuf.length > 500) {
            const aiMod = require('./ai');
            // v6.54: análise detalhada em vez de "descreve a imagem".
            // Antes dizia só "vejo um padrão de xadrez"; agora repara
            // em pessoas, expressões, roupa, marcas, texto e local.
            const visionPrompt = prompt + `

[ESTÁS A VER A IMAGEM AGORA. Analisa com atenção:
• PESSOAS: quantas, idade aproximada, expressão, o que vestem, o que
  fazem. Se for alguém famoso e tiveres a certeza, diz o nome. Se não
  tiveres a certeza, diz com quem se parece — sem inventar.
• TEXTO: lê tudo o que estiver escrito (cartazes, ecrãs, roupa).
• LOCAL: interior/exterior, que sítio parece, que horas do dia.
• OBJECTOS e MARCAS que reconheças.
• AMBIENTE: cores, luz, o que a foto transmite.
Responde como uma pessoa que está mesmo a olhar — comenta o que te
salta à vista primeiro, com naturalidade. NUNCA digas que não vês.]`;
            answer = await aiMod.chatWithImage(visionPrompt, systemPrompt, imgBuf);
            console.log('[Aura Vision] OK, resposta com imagem');
          } else {
            console.warn('[Aura Vision] imgBuf vazio ou pequeno');
          }
        } catch (e) {
          console.warn('[Aura Vision] erro geral:', e.message?.slice(0, 80));
        }
      }
      
      // Se não há imagem ou vision falhou → usa chat normal
      if (!answer) {
        if (auraAwake || isPv) {
          // v6.86 — AURA AVANÇADA: consciência social (quem fala, tom,
          // assunto), regras que aprendeu e anti-repetição entram no
          // prompt. Ela sabe SEMPRE o que se passa e com quem fala.
          let _consciencia = '';
          try {
            const av = require('../aura/auraAvancada');
            const partes = [];
            if (ctx.isGroup) {
              const cs = av.contextoParaPrompt(ctx.remoteJid);
              if (cs) partes.push(cs);
            }
            // v7.42: o que aconteceu no grupo (factos com data)
            if (ctx.isGroup) {
              try { const lt = await require('../aura/auraLinhaTempo').paraPrompt(ctx.remoteJid); if (lt) partes.push(lt); } catch {}
            }
            const regras = await av.regrasDe(ctx.remoteJid);
            if (regras.length) {
              partes.push('REGRAS QUE APRENDESTES NESTE CHAT (obedeces-lhes):\n- ' + regras.join('\n- '));
            }
            const minhas = av.ultimasFalas(ctx.remoteJid);
            if (minhas.length) {
              partes.push('AS TUAS ÚLTIMAS FALAS AQUI (não repitas — diz de outra forma):\n' +
                minhas.map(f => '• ' + f.slice(0, 90)).join('\n'));
            }
            // v7.28: identidade por número — quem fala, a quem responde,
            // quem são os outros do grupo (cada um com o seu histórico).
            try {
              if (ctx.identidade) {
                const idb = require('../aura/auraIdentidade').blocoParaPrompt(ctx.remoteJid, ctx.identidade, {
                  citado: ctx.citado, ownerNumber: config.owner.number,
                });
                if (idb) partes.unshift(idb);
              }
            } catch {}
            // v7.37: CÉREBRO — ferramentas reais (por cargo), o que já
            // aprendeu (pessoa + grupo), e licença para calar/aprender.
            try {
              const cer = require('../aura/auraCerebro');
              const vont = require('../aura/auraVontade');
              const _isVipC = !!(ctx.userData?.isPremium && ctx.userData.isPremium());
              const saber = await cer.saberParaPrompt({ senderNumber: ctx.senderNumber, remoteJid: ctx.remoteJid, isGroup: ctx.isGroup });
              if (saber) partes.push(saber);
              const ferr = cer.ferramentasParaPrompt({ isOwner, isAdmin: ctx.isAdmin, isVip: _isVipC, isGroup: ctx.isGroup });
              if (ferr) partes.push(ferr);
              partes.push(cer.instrucaoAprendizagem({ isOwner }));
              partes.push(vont.instrucao({
                isOwner, isGroup: ctx.isGroup,
                sat: vont.saturacao(ctx.remoteJid, ctx.senderNumber),
                mood: require('../aura/auraHuman').getMood(ctx.remoteJid).mood,
              }));
            } catch (e) { console.warn('[Aura cerebro]', e.message?.slice(0, 60)); }
            _consciencia = partes.join('\n\n');
            // Aprende com correcções: "não faças isso" vira regra
            if (/aura/i.test(cleanText) || isReplyToBot || !ctx.isGroup) {
              const reg = await av.aprenderRegra(ctx.remoteJid, cleanText);
              if (reg) _consciencia += `\n\n(ACABASTE DE APRENDER AGORA esta regra: "${reg}")`;
            }
          } catch {}

          answer = await aura.auraRespond(prompt, {
            isOwner,
            isSubOwner: !!ctx.isSubOwner,   // v7.28: número do bot / owner_numbers
            isVip,
            isAdmin: ctx.isAdmin,   // v6.85: ela sabe o cargo de quem fala
            pushName: ctx.pushName,
            senderNumber: ctx.senderNumber,
            isGroup: ctx.isGroup,
            groupName: ctx.groupName,
            groupContext,
            historyArray,
            isReplyToAura: isReplyToBot,
            darkAttacked,
            darkMentioned,
            mediaContext,
            isAudio,
            isImage,
            isVideo,
            isSticker,
            pessoasNoGrupo: ctx.groupMeta?.participants?.length || 0,  // v6.58
            remoteJid: ctx.remoteJid,
            instrucaoExtra: _instrucaoVoz || '',
            consciencia: _consciencia || '',
          });
        } else {
          // v6.43: modo assistente profissional (estilo Meta AI)
          let _identBloco = '';
          try {
            if (ctx.identidade) _identBloco = require('../aura/auraIdentidade').blocoParaPrompt(ctx.remoteJid, ctx.identidade, { citado: ctx.citado, ownerNumber: config.owner.number });
          } catch {}
          answer = await auraModes.assistantRespond(prompt, {
            botName: config.bot.name, userName: ctx.pushName, identidade: _identBloco,
            isGroup: ctx.isGroup, groupName: ctx.groupName,
            groupContext, historyArray, prefix,
            isOwner, isVip, isAdmin: ctx.isAdmin,
            senderNumber: ctx.senderNumber,
            pessoasNoGrupo: ctx.groupMeta?.participants?.length || 0,
            mediaContext, isAudio, isImage, isVideo, isSticker,
          });
        }
      }

      // Salva resposta na memória
      try {
        const mem = await AiMemory.getOrCreate(ctx.senderNumber, ctx.isGroup ? ctx.remoteJid : null);
        mem.addMessage('assistant', answer);
        await mem.save().catch(() => {});
      } catch {}

      // ⚡ REACCAO AUTOMATICA DE EMOJI (como pessoa real)
      // v6.43: só a AURA acordada reage. O assistente fica sóbrio.
      if (_awake && isOwner && !aura.isSilenced(ctx.senderNumber)) {  // v6.52: era `!isSilenced` — variavel inexistente, rebentava a resposta da AURA em TODAS as mensagens
        const ownerReacts = ['🖤', '🌹', '💕', '😏', '🥰', '✨', '💗', '💫', '😈'];
        const rEmoji = ownerReacts[Math.floor(Math.random() * ownerReacts.length)];
        sock.sendMessage(ctx.remoteJid, { react: { text: rEmoji, key: msg.key } }).catch(() => {});
      } else if (_awake && !isOwner) {
        const neutralReacts = ['👀', '💬', '✨', '👍'];
        const rEmoji = neutralReacts[Math.floor(Math.random() * neutralReacts.length)];
        sock.sendMessage(ctx.remoteJid, { react: { text: rEmoji, key: msg.key } }).catch(() => {});
      }
      
      // Responde como pessoa real — sem emojis de bot
      // ⚡ Parser de acções da Aura: [STICKER:xxx], [IMAGE:xxx], [CMD:xxx]
      let finalAnswer = answer;
      // v7.37: a IA pode escolher calar-se / só reagir, pedir acções reais
      // e anotar o que aprendeu. Tudo com as permissões de sempre.
      let _acoesIA = [];
      try {
        const vont = require('../aura/auraVontade');
        const cer = require('../aura/auraCerebro');
        const v = vont.interpretarResposta(finalAnswer);
        if (v.silencio) {
          if (v.reagir) sock.sendMessage(ctx.remoteJid, { react: { text: v.reagir, key: msg.key } }).catch(() => {});
          console.log('[Aura] escolheu não responder');
          return true;
        }
        if (v.reagir && v.texto.length < 2) {
          await sock.sendMessage(ctx.remoteJid, { react: { text: v.reagir, key: msg.key } }).catch(() => {});
          return true;
        }
        finalAnswer = v.texto;
        const c = cer.interpretar(finalAnswer);
        finalAnswer = c.texto;
        _acoesIA = c.acoes;
        if (c.factos.length || c.factosGrupo.length) {
          cer.aprender({ factos: c.factos, factosGrupo: c.factosGrupo, senderNumber: ctx.senderNumber, remoteJid: ctx.remoteJid, isGroup: ctx.isGroup })
            .then(n => n && console.log(`[Aura] aprendeu ${n} facto(s)`)).catch(() => {});
        }
        if (_acoesIA.length) {
          const _isVipA = !!(ctx.userData?.isPremium && ctx.userData.isPremium());
          let _adm = ctx.isAdmin;
          if (ctx.isGroup && _adm == null) { try { _adm = await isGroupAdminForHandler(sock, ctx); } catch {} }
          if (finalAnswer.length > 0) { await sock.sendMessage(ctx.remoteJid, { text: finalAnswer }, { quoted: msg }); finalAnswer = ''; }
          const r = await cer.executarAcoes(_acoesIA, {
            sock, msg, ctx, texto: cleanText, isOwner, isAdmin: !!_adm, isVip: _isVipA, caseHandler, config: commandConfig,
            runNativo: async (nome, { ctx: cmdCtx, args }) => {
              const fn = nativeCommands[nome] || packageCommands[nome];
              if (typeof fn !== 'function') return false;
              await fn({ sock, msg, ctx: cmdCtx, args, isOwner, fillVars, config: commandConfig });
              await incrementUserCommand(ctx.senderNumber, ctx, nome).catch(() => {});
              return true;
            },
          });
          for (const t of r.respostas) await sock.sendMessage(ctx.remoteJid, { text: t }, { quoted: msg }).catch(() => {});
          if (r.executadas || r.respostas.length) return true;
        }
      } catch (e) { console.warn('[Aura cerebro/vontade]', e.message?.slice(0, 60)); }
      try {
        const san = require('../aura/auraSanitizer');
        const interpret = require('../aura/auraInterpret');
        finalAnswer = san.limparResposta(finalAnswer);
        finalAnswer = interpret.consertarSeRecusou(finalAnswer, cleanText, msg);
        if (san.eVazamento(answer) || san.eLinkInventado(finalAnswer)) {
          if (ctx.isGroup && isOwner) {
            try {
              const code = await sock.groupInviteCode(ctx.remoteJid);
              finalAnswer = 'Aqui está o convite deste grupo:\nhttps://chat.whatsapp.com/' + code;
            } catch {
              finalAnswer = 'Não consegui tirar o convite — preciso de ser admin.';
            }
          } else if (san.eVazamento(answer)) {
            finalAnswer = isOwner ? 'Tô aqui.' : 'Diz.';
          }
        }
        finalAnswer = String(finalAnswer || '').replace(/\(ÁUDIO\)|\(AUDIO\)/gi, '').trim();
        try {
          const imgSearch = require('./imageSearch');
          const falsa = imgSearch.extrairAcaoFalsa(answer || finalAnswer);
          if (falsa?.tipo === 'imagem' && falsa.termo) {
            const imgs = await imgSearch.buscarImagens(falsa.termo, 1).catch(() => null);
            if (imgs?.length) {
              await sock.sendMessage(ctx.remoteJid, {
                image: { url: imgs[0].url },
                caption: falsa.termo,
              }, { quoted: msg });
              return true;
            }
          }
          if (falsa?.tipo === 'audio') {
            const vozMod = require('../aura/auraVoz');
            const cita = vozMod.extrairCitado(msg, groupContext);
            const fala = vozMod.textoParaFalar(falsa.termo || finalAnswer, {
              texto: cleanText, citado: cita, groupContext,
            });
            const voz = await require('./ai').speakWithFallback(fala);
            if (voz && voz.length > 500) {
              await sock.sendMessage(ctx.remoteJid, {
                audio: voz, mimetype: 'audio/mpeg', ptt: true,
              }, { quoted: msg });
              return true;
            }
          }
          if (falsa?.tipo === 'sticker' && falsa.termo) {
            const imgs = await imgSearch.buscarImagens(falsa.termo, 1).catch(() => null);
            if (imgs?.length) {
              const buf = await mediaHandler.fetchBuffer(imgs[0].url).catch(() => null);
              if (buf && buf.length > 500) {
                const stk = await stickerMaker.create(buf, {
                  botName: config.bot.name, ownerName: config.owner.name,
                  userName: ctx.pushName, groupName: ctx.groupName || 'PV',
                  isVideo: false, remoteJid: ctx.remoteJid,
                });
                if (stk && stk.length > 50) {
                  await sock.sendMessage(ctx.remoteJid, { sticker: stk }, { quoted: msg });
                  return true;
                }
              }
            }
          }
        } catch (e) {
          console.warn('[Aura acção falsa]', e.message?.slice(0, 60));
        }
      } catch {}
      try {
        const memA = require('../aura/auraMemory');
        memA.guardar(ctx.senderNumber, cleanText).catch(() => {});
      } catch {}
      const actionSticker = finalAnswer.match(/\[STICKER:([^\]]+)\]/);
      const actionImage = finalAnswer.match(/\[IMAGE:([^\]]+)\]/);
      const actionCmd = finalAnswer.match(/\[CMD:([^\]]+)\]/);
      
      // Remove os marcadores do texto visível
      finalAnswer = finalAnswer.replace(/\[STICKER:[^\]]+\]/g, '').replace(/\[IMAGE:[^\]]+\]/g, '').replace(/\[CMD:[^\]]+\]/g, '').trim();
      
      // v6.55: EXECUTAR COMANDOS POR CONVERSA
      // "aura toca Shakira" → corre o .play sozinha.
      // Só o Dono, e NUNCA os comandos perigosos (eval, broadcast,
      // restart, permissões, 18+) — esses continuam a exigir o
      // prefixo escrito à mão, porque um erro de interpretação
      // nesses é irreversível.
      // v6.57: TODOS executam por conversa, filtrado por CARGO.
      // Antes só o Dono. Um VIP a perguntar "qual o meu saldo"
      // recebia conversa fiada ("verifica no aplicativo do banco")
      // em vez do comando real — a assistente sabia falar mas não
      // sabia FAZER.
      {
        try {
          const auraCmds = require('../aura/auraCommands');
          const pedido = auraCmds.detectarComando(cleanText);

          // cargo de quem pediu
          let _ehAdmin = false;
          if (ctx.isGroup) {
            try { _ehAdmin = await isGroupAdminForHandler(sock, ctx); } catch {}
          }
          const _perm = pedido
            ? auraCmds.podeExecutar(pedido.comando, { isOwner, isVip, isAdmin: _ehAdmin })
            : { pode: false };

          if (pedido && _perm.pode) {
            const argv = pedido.args ? pedido.args.split(/\s+/) : [];
            const cmdCtx = { ...ctx, args: argv, prefix };
            // v7.41: o comando corre, mas o que ele diz sai na voz dela
            const sockV = require('../aura/auraFala').sockNaVozDela(sock, { isOwner });
            const caseCtx = {
              sock: sockV, msg, ctx: cmdCtx, args: argv,
              text: pedido.args, prefix,
              // v6.57: era `isOwner: true` fixo — com a execução aberta
              // a todos, isso daria privilégios de dono a qualquer um.
              command: pedido.comando, isOwner, config: commandConfig,
            };

            let correu = false;
            try {
              correu = await caseHandler.runCase(pedido.comando, caseCtx);
            } catch (e) {
              console.warn('[Aura cmd] case', e.message?.slice(0, 50));
            }

            // não é case → tenta nativo / pacote
            if (!correu) {
              const fn = nativeCommands[pedido.comando] || packageCommands[pedido.comando];
              if (typeof fn === 'function') {
                try {
                  await fn({ sock: sockV, msg, ctx: cmdCtx, args: argv, isOwner, fillVars, config: commandConfig });
                  correu = true;
                } catch (e) {
                  console.warn('[Aura cmd] nativo', e.message?.slice(0, 50));
                }
              }
            }

            if (correu) {
              await incrementUserCommand(ctx.senderNumber, ctx, pedido.comando).catch(() => {});
              if (ctx.isGroup) try { await require('../aura/auraLinhaTempo').doComando(ctx.remoteJid, { quem: ctx.senderNumber, quemNome: ctx.pushName, cmd: pedido.comando, args: pedido.args, alvo: (msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [])[0] || msg.message?.extendedTextMessage?.contextInfo?.participant }); } catch {}
              return true;
            }
          }
        } catch (e) {
          console.warn('[Aura comando]', e.message?.slice(0, 60));
        }
      }

      // v7.40: ROUTER UNIVERSAL — qualquer comando do bot por conversa.
      // Só quando os mapas fixos falharam E a frase parece ordem/pedido.
      // A IA vê o catálogo REAL (cases+nativos+pacotes) e escolhe; nomes
      // inventados são rejeitados; cargo e BLOQUEADOS respeitados.
      {
        try {
          const uni = require('../aura/auraUniversal');
          const brainU = require('../aura/auraBrain');
          const t0 = String(cleanText || '').trim();
          // guarda de instruções: "se alguém mandar link, bane" é regra, não ordem
          const eOrdem = t0.length >= 4 && t0.length <= 220 && brainU.pareceOrdem(t0) && !require('../aura/auraCommands').eInstrucao(t0);
          if (eOrdem) {
            const guardaU = require('../aura/auraInstructionGuard');
            let escolha = await uni.escolherComando(t0, require('./ai'));
            if (escolha && guardaU.eSensivel(escolha.cmd) && !guardaU.eOrdem(t0, { comando: escolha.cmd })) escolha = null;
            if (escolha) {
              let _ehAdminU = false;
              if (ctx.isGroup) { try { _ehAdminU = await isGroupAdminForHandler(sock, ctx); } catch {} }
              const permU = uni.permissao(escolha.cmd, escolha.info, { isOwner, isVip, isAdmin: _ehAdminU });
              if (permU.pode) {
                console.log('[Aura universal]', JSON.stringify(t0.slice(0, 60)), '→', prefix + escolha.cmd, escolha.args);
                const sockU = require('../aura/auraFala').sockNaVozDela(sock, { isOwner });
                const ok = await uni.executarComando(escolha, { sock: sockU, msg, ctx, prefix, isOwner, config: commandConfig, nativeCommands, packageCommands, fillVars });
                if (ok) {
                  await incrementUserCommand(ctx.senderNumber, ctx, escolha.cmd).catch(() => {});
                  if (ctx.isGroup) try { await require('../aura/auraLinhaTempo').doComando(ctx.remoteJid, { quem: ctx.senderNumber, quemNome: ctx.pushName, cmd: escolha.cmd, args: escolha.args, alvo: (msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [])[0] || msg.message?.extendedTextMessage?.contextInfo?.participant }); } catch {}
                  return true;
                }
              } else if (!isOwner) {
                await sock.sendMessage(ctx.remoteJid, { text: require('../aura/auraFala').dizer('naoPodes', { jid: ctx.remoteJid, isOwner, precisa: permU.precisa }) }, { quoted: msg });
                return true;
              }
            }
          }
        } catch (e) {
          console.warn('[Aura universal]', e.message?.slice(0, 60));
        }
      }

      // Pedido de foto ANTES da IA — "Aura mostra o Messi" não pode
      // virar "_envia uma foto do Messi_". v6.85: nomes múltiplos,
      // termos vagos pelo contexto, e resposta honesta se falhar.
      {
        const stFotos = await _fotosPedidas(sock, msg, ctx, cleanText || text);
        if (stFotos === 'enviadas' || stFotos === 'falhou') return true;
      }

      // v6.54: PEDIDO DE IMAGEM — PROCURAR, não gerar.
      // Quem pede "manda uma foto de um cavalo" quer uma FOTO REAL.
      // Antes a AURA gerava com IA (ou respondia com uma piada, como
      // no "me de um cavalo" do diálogo real). Só gera quando o
      // pedido é explícito: "cria/desenha/imagina uma imagem de...".
      // v6.85: mesmo fluxo do pedido cedo (multi-nome/vago/honesto).
      {
        const stFotos2 = await _fotosPedidas(sock, msg, ctx, cleanText);
        if (stFotos2 === 'enviadas' || stFotos2 === 'falhou') return true;
        // null → não era pedido de foto explícito; segue o texto normal
      }

      // v6.53: PEDIDO DE ÁUDIO — ela dizia "não posso enviar áudios"
      // mas o ElevenLabs funciona (testado: 30KB de MP3). Agora quando
      // pedem voz, ela envia MESMO em vez de recusar.
      // v6.53: apanha as formas reais de pedir — inclui o imperativo
      // ('mande', 'envie', 'faça'), que a versão anterior falhava.
      // v6.53: detecção simples e robusta — há um verbo de pedido E a
      // palavra áudio/voz na mesma frase. Tentei uma regex com
      // distância entre os termos, mas falhava com acentos.
      const _txtAudio = String(cleanText || '').toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const _pedidoExplicito =
        /\b(audio|voz|ptt|nota de voz|mensagem de voz)\b/.test(_txtAudio) &&
        /\b(mand[ae]|envi[ae]|manda-?me|envia-?me|quero|faz|faca|grav[ae]|poe|poem|diz|fala|responde)\b/.test(_txtAudio);

      // v6.56: ELA ESCOLHE O FORMATO.
      // Uma pessoa não responde sempre por texto — às vezes manda
      // áudio porque lhe apetece. Aqui ela decide (raro e só em
      // momentos afectivos, para não ser mecânico).
      let _formato = 'texto';
      try {
        const decide = require('../aura/auraDecide');
        _formato = decide.comoResponder({
          texto: cleanText, isOwner, isGroup: ctx.isGroup, pediuAudio: _pedidoExplicito,
        });
      } catch {}

      // Voz que entra (PTT do Dark) ou pedido explícito → responde EM ÁUDIO.
      // Sem isto ela transcrevia e respondia em texto, ou escrevia "(ÁUDIO) ...".
      // v6.81: o modo "só áudio" do chat manda em tudo o resto.
      let _modoSoAudio = false;
      try { _modoSoAudio = !!require('../aura/auraBrain').modos(ctx.remoteJid).soAudio; } catch {}

      const pediuAudio = _modoSoAudio || _pedidoExplicito || _formato === 'audio' || (isAudio && (isOwner || isPv));

      // v6.81 (bug #2 da auditoria): o formato 'reacao' era calculado e deitado
      // fora — ela acabava por escrever texto na mesma. Agora reage mesmo:
      // mensagens que não pedem resposta (kkk, top, isso) levam só um emoji.
      // Respeita o modo "não reajas" do chat e nunca engole respostas longas.
      if (_formato === 'reacao' && !pediuAudio && finalAnswer.length < 120) {
        let _semReagir = false;
        try { _semReagir = !!require('../aura/auraBrain').modos(ctx.remoteJid).semReagir; } catch {}
        if (!_semReagir) {
          try {
            const emoji = require('../aura/auraDecide').escolherReacao(cleanText);
            await sock.sendMessage(ctx.remoteJid, { react: { text: emoji, key: msg.key } });
            return true;   // reagiu — não duplica com texto
          } catch (e) {
            console.warn('[Aura reacao]', e.message?.slice(0, 60));
            // se a reacção falhar, segue para o texto normal
          }
        }
      }

      if (pediuAudio && finalAnswer.length > 0) {   // v7.36: sem tecto de 900 chars — respostas longas também saem em voz (por pedaços)
        try {
          const aiVoz = require('./ai');
          // tira emojis e marcações — o TTS lê-os em voz alta
          const vozMod = require('../aura/auraVoz');
          const cita = vozMod.extrairCitado(msg, groupContext);
          const paraFalar = vozMod.textoParaFalar(finalAnswer, {
            texto: cleanText, citado: cita, groupContext,
          });

          const voz = await aiVoz.speakWithFallback(paraFalar);
          if (voz && voz.length > 500) {
            await sock.sendMessage(ctx.remoteJid, {
              audio: voz, mimetype: 'audio/mpeg', ptt: true,
            }, { quoted: msg });
            return true;   // já respondeu em voz, não repete em texto
          }
        } catch (e) {
          console.warn('[Aura voz]', e.message?.slice(0, 60));
          // se a voz falhar, continua e manda o texto
        }
      }

      // v7.40: quando lhe mandam um sticker, às vezes ela responde com
      // um sticker dela (tema tirado da própria resposta) em vez de texto.
      if (isSticker && finalAnswer.length > 0 && finalAnswer.length < 200) {
        try {
          const uni = require('../aura/auraUniversal');
          const pol = uni.politicaSticker({ isGroup: ctx.isGroup, isReplyToBot, mencionada: isBotMentioned, isOwner });
          if (pol.comSticker) {
            const tema = /\b(kk+|haha|rir|engra[cç]ad)/i.test(finalAnswer) ? 'anime laugh' : /\b(amo|amor|beijo|saudade|🖤|❤)/i.test(finalAnswer) ? 'anime blush' : /\b(triste|chor)/i.test(finalAnswer) ? 'anime cry' : /\b(bravo|raiva|irrita)/i.test(finalAnswer) ? 'anime angry' : 'anime smile';
            if (await uni.responderComSticker(sock, msg, ctx, tema)) {
              try { require('../aura/auraAvancada').registarFala(ctx.remoteJid, finalAnswer); } catch {}
              return true;
            }
          }
        } catch {}
      }

      // Envia o texto (se houver)
      if (finalAnswer.length > 0) {
        await sock.sendMessage(ctx.remoteJid, { text: finalAnswer }, { quoted: msg });
        // v6.86 — anti-repetição: lembra o que ela própria acabou de
        // dizer neste chat, para não se repetir como um bot.
        try { require('../aura/auraAvancada').registarFala(ctx.remoteJid, finalAnswer); } catch {}
      }
      
      // Executa acções de mídia (sem bloquear se falhar)
      if (actionSticker) {
        try {
          const ai2 = require('./ai');
          const desc = actionSticker[1].trim();
          const imgBuf = await ai2.generateImage(desc + ', sticker style, white background, cute anime style');
          if (imgBuf && imgBuf.length > 100) {
            const stk = await stickerMaker.create(imgBuf, {
              botName: config.bot.name, ownerName: config.owner.name,
              userName: 'Aura', groupName: ctx.groupName || 'PV', isVideo: false,
            });
            if (stk && stk.length > 50) {
              await sock.sendMessage(ctx.remoteJid, { sticker: stk }, { quoted: msg });
            }
          }
        } catch (e) { /* silêncio — não quebra o fluxo */ }
      }
      
      if (actionImage) {
        try {
          const ai2 = require('./ai');
          const desc = actionImage[1].trim();
          const imgBuf = await ai2.generateImage(desc);
          if (imgBuf && imgBuf.length > 100) {
            await sock.sendMessage(ctx.remoteJid, { image: imgBuf, caption: '' }, { quoted: msg });
          }
        } catch (e) { /* silêncio */ }
      }
      
      if (actionCmd && isOwner) {
        // Só o Dark pode fazer a Aura executar comandos via [CMD:]
        try {
          const cmdText = actionCmd[1].trim();
          const [cmdName, ...cmdArgs] = cmdText.split(/\s+/);
          const fakeCtx = { ...ctx, args: cmdArgs, prefix: config.bot.prefix || '.' };
          const caseCtx = { sock, msg, ctx: fakeCtx, args: cmdArgs, text: cmdArgs.join(' '), prefix: fakeCtx.prefix, command: cmdName.toLowerCase(), isOwner: true, config: commandConfig };
          await caseHandler.runCase(cmdName.toLowerCase(), caseCtx);
        } catch (e) { /* silêncio */ }
      }
      
      return true;

    } catch (e) {
      console.warn('[Aura v6.39]', e.message?.slice(0, 80));
    }
  }
  // Sticker em mídia
  const isMedia = msg.message?.imageMessage || msg.message?.videoMessage;
  if (isMedia && (text === `${prefix}sticker` || text === `${prefix}s` || text === `${prefix}fig`)) {
    return handleStickerRequest(sock, msg, ctx);
  }

  // ===== Usuário único por WhatsApp =====
  // O gênero só é perguntado/alterado quando o usuário usa !genero ou !alterargenero.
  user = user || await requestCache.remember(
    requestCache.K.user(ctx.senderNumber) + ':doc',
    () => userManager.identifyByWhatsApp(ctx.senderNumber, ctx.pushName)
  );

  // ===== DECRYPTER AUTOMÁTICO (Só para Premium) =====
  if (docMsg && autoDecryptOn) {
    const fileName = docMsg.fileName || '';
    const ext = fileName.split('.').pop()?.toLowerCase();
    const vpnExts = ['ehi','ehic','hat','npv','npv4','npv7','npv8','npvt','dark','darkt','any','tls','nm','nmess','ovpn','ssh','ssl','json','conf','wg','wireguard','txt','bdnet','bd','apna','apnalite','wyrvpn','wyr'];
    
    if (vpnExts.includes(ext)) {
      const isPremium = isOwner || checkIsPremium(user);
      if (isPremium) {
        return handleDecryptRequest(sock, msg, ctx, docMsg, isOwner);
      } else {
        await sock.sendMessage(ctx.remoteJid, { 
          text: `🔓 *DECRYPTER FORENSE*\n\nEste arquivo (*.${ext}*) é uma configuração VPN protegida. A descriptografia é um recurso exclusivo para membros *PREMIUM*.\n\n💎 Use *!vip* para ver os planos.` 
        }, { quoted: msg });
        return true;
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // SEM PREFIXO — SILÊNCIO TOTAL
  //  "aura" e menções ao bot já foram tratados acima pelo Auto-IA
  //  Tudo o resto → SILÊNCIO (bot não responde a palavras)
  // ════════════════════════════════════════════════════════════════════════
  if (!prefixInfo) {
    return false;
  }


  const args = prefixInfo.rest.split(/\s+/);
  // v6.37: prefixo deve estar COLADO ao comando (.play ✅, . play ❌)
  const rawFirst = (args[0] || '');
  if (rawFirst.startsWith(' ') || rawFirst === '') return false;
  const commandName = (args.shift() || '').replace(/^[^a-z0-9]+/i, '').toLowerCase();
  if (!commandName) return false;

  ctx.fullText = text; // Adiciona o texto completo ao contexto
  ctx.args = args;

  // ══════════════════════════════════════════════════════════════════════
  // ALIAS MAP - Organizado por categorias (apenas aliases válidos)
  // ══════════════════════════════════════════════════════════════════════
  const aliasMap = {
    // ── MENU PRINCIPAL ──
    help: 'menu', cmds: 'menu', comandos: 'menu', guia: 'menu',
    
    // ── DOWNLOADS ──
    yt: 'play', musica: 'play', music: 'play',
    yt2: 'play2', musica2: 'play2',
    yt3: 'play3', musica3: 'play3',
    yta: 'ytd', mp3: 'ytd',
    ytv: 'gyt', mp4: 'gyt',
    tt: 'tiktok', ig: 'instagram', x: 'twitter',
    sp: 'spotify', sc: 'soundcloud',
    mf: 'mediafire',
    
    // ── STICKERS ──
    s: 'sticker', fig: 'sticker',
    
    // ── IA ──
    ai: 'ia', chatgpt: 'ia', llm: 'ia', pergunta: 'ia',
    img: 'imagem',
    
    // ── GRUPOS ──
    banir: 'kick',
    advertir: 'warn',
    apagar: 'del', deletar: 'del',
    mute: 'silenciar', unmute: 'silenciar',
    adicionar: 'add',
    
    // ── INTERAÇÕES ──
    hug: 'abracar',
    kiss: 'beijar',
    punch: 'soco', slap: 'tapa',
    dance: 'dancar', bailar: 'dancar',
    kill: 'matar',
    
    // ── UTILIDADES ──
    tempo: 'clima',
    google: 'pesquisar',
    cachorro: 'dog',
    
    // ── SUBMENUS ──
    downloads: 'menudownload',
    brincadeiras: 'menudiversao',
    menubank: 'menueconomia',
    menuadmin: 'menugrupo',
    menulogos: 'menustickers',
    menufamilia: 'menudiversao',
  };
  const canonicalCommand = aliasMap[commandName] || commandName;
  reactions.reactStart(sock, msg, canonicalCommand).catch(() => {});

  // Overrides globais do dashboard para comandos nativos/pacotes
  let commandOverride = null;
  if (packageCommands[canonicalCommand] || nativeCommands[canonicalCommand]) {
    commandOverride = await CommandOverride.findOne({ commandName: canonicalCommand }).catch(() => null);
    if (commandOverride && commandOverride.enabled === false && !isOwner) return false;
    const overrideAccess = commandOverride?.accessLevel;
    if (overrideAccess === 'owner' && !isOwner) {
      await sock.sendMessage(ctx.remoteJid, { text: '🚫 Só Dono.' }, { quoted: msg });
      return true;
    }
    if (overrideAccess === 'premium' && !isOwner) {
      const premUser = await User.findOne({ whatsappNumber: ctx.senderNumber }).catch(() => null);
      if (!premUser || !checkIsPremium(premUser)) {
        await sock.sendMessage(ctx.remoteJid, { text: `⭐ *Comando Premium*\n\nUse ${prefix}vip para ver planos.` }, { quoted: msg });
        return true;
      }
    }
    if (commandOverride?.useCustomResponse && commandOverride.customResponse) {
      await sock.sendMessage(ctx.remoteJid, { text: fillVars(commandOverride.customResponse, ctx) }, { quoted: msg });
      return true;
    }
  }

  if (await isVipCommand(canonicalCommand)) {
    const okVip = await userIsPremiumOrOwner(ctx.senderNumber, isOwner);
    if (!okVip) {
      await sock.sendMessage(ctx.remoteJid, {
        text: `╭━━━〔 ⭐ VIP DARKSIDE 〕━━━╮\n┃ Comando: *${canonicalCommand}*\n┃ Status: Premium/Owner\n┃ Aura necessária: +9999\n╰━━━━━━━━━━━━━━━━━━━━╯\n\nUse *${prefix}vip* para ver planos e liberar ferramentas top.`,
      }, { quoted: msg });
      return true;
    }
  }

  if (ctx.isGroup && groupConfig) {
    const blocked = (groupConfig.blockedCommands || []).map(x => String(x).toLowerCase());
    const blockedSubs = (groupConfig.blockedSubmenus || []).map(x => String(x).toLowerCase());
    const adminControlCmds = ['bloquearcmd','desbloquearcmd','cmdsgrupo','blockcmd','unblockcmd','setnomebot','inatividade','inativos','warn','unwarn','warnings','resetwarn','regras','setregras','motivacao','tagadmins','admins','setdesc','setnomegrupo','del','add','tempban','silenciar','limpar'];
    if (!isOwner && !adminControlCmds.includes(canonicalCommand) &&
        (blocked.includes(commandName) || blocked.includes(canonicalCommand) || blockedSubs.includes(commandName) || blockedSubs.includes(canonicalCommand))) {
      return false;
    }
    if (groupConfig.onlyAdmins && !isOwner && !(await isGroupAdminForHandler(sock, ctx))) return false;
  }

  // ── Limite free PV (50 cmds/dia — mais generoso para não frustrar) ──
  // Comandos de info/ajuda não contam para o limite
  const PV_EXEMPT = new Set(['menu','start','ping','info','dono','criador','aiapis','donos','help','cmds','comandos','vip','prefixos']);
  if (!ctx.isGroup && !isOwner && !PV_EXEMPT.has(canonicalCommand || '')) {
    try {
      const FREE_PV_LIMIT = 50;
      const todayStr = new Date().toISOString().slice(0, 10);
      const pvUser = await User.findOne({ whatsappNumber: ctx.senderNumber }).lean().catch(() => null);
      if (!pvUser || !checkIsPremium(pvUser)) {
        const sameDayCount = (pvUser?.pvCommandsDate === todayStr) ? (pvUser?.pvCommandsToday || 0) : 0;
        if (sameDayCount >= FREE_PV_LIMIT) {
          await sock.sendMessage(ctx.remoteJid, {
            text:
              `⏳ *Limite diário atingido*\n\n` +
              `Utilizadores Free têm *${FREE_PV_LIMIT} comandos/dia* no chat privado.\n\n` +
              `⭐ Upgrade para *Premium* e usa sem limites: *${prefix}vip*`,
          }, { quoted: msg });
          return true;
        }
        // Incrementa (não bloqueia se falhar)
        User.findOneAndUpdate(
          { whatsappNumber: ctx.senderNumber },
          { pvCommandsToday: sameDayCount + 1, pvCommandsDate: todayStr }
        ).catch(() => {});
      }
    } catch {}
  }

  // ── Case Handler (switch/case engine) ─────────────────────────────
  // Executa antes dos pacotes — tem prioridade
  // Passa contexto completo incluindo wrapper "m" estilo clássico
  {
    const caseCtx = {
      sock,
      msg,
      ctx,
      args,
      text:    args.join(' ').trim(),
      prefix,
      command: canonicalCommand,
      isOwner,
      config:  commandConfig,
    };
    const caseHandled = await caseHandler.runCase(canonicalCommand, caseCtx);
    if (caseHandled) {
      if (groupConfig) {
        groupConfig.commandsUsedToday++;
        groupConfig.totalCommands++;
        await groupConfig.save();
      }
      await incrementUserCommand(ctx.senderNumber, ctx, canonicalCommand);
      return true;
    }
  }

  // Comandos dos pacotes (interactions, family, economy, games, cheats)
  if (packageCommands[canonicalCommand]) {
    try {
      await packageCommands[canonicalCommand]({ sock, msg, ctx, args, isOwner, fillVars, config: commandConfig });
      if (groupConfig) {
        groupConfig.commandsUsedToday++;
        groupConfig.totalCommands++;
        await groupConfig.save();
      }
      await incrementUserCommand(ctx.senderNumber, ctx, canonicalCommand);
      reactions.reactSuccess(sock, msg, canonicalCommand).catch(() => {});
      return true;
    } catch (err) {
      reactions.reactError(sock, msg, canonicalCommand).catch(() => {});
      console.error('pkg err:', canonicalCommand, err);
      await sock.sendMessage(ctx.remoteJid, { text: '❌ ' + err.message }, { quoted: msg });
      return true;
    }
  }

  if (nativeCommands[canonicalCommand]) {
    try {
      await nativeCommands[canonicalCommand]({ sock, msg, ctx, args, isOwner, fillVars, config: commandConfig });
      if (groupConfig) {
        groupConfig.commandsUsedToday++;
        groupConfig.totalCommands++;
        await groupConfig.save();
      }
      await incrementUserCommand(ctx.senderNumber, ctx, canonicalCommand);
      reactions.reactSuccess(sock, msg, canonicalCommand).catch(() => {});
      return true;
    } catch (err) {
      reactions.reactError(sock, msg, canonicalCommand).catch(() => {});
      console.error('cmd err:', canonicalCommand, err);
      await sock.sendMessage(ctx.remoteJid, { text: '❌ ' + err.message }, { quoted: msg });
      return true;
    }
  }

  try {
    const cmd = await Command.findOne({ $or: [{ name: commandName }, { aliases: commandName }], enabled: true });
    if (!cmd) {
      // Comando desconhecido com prefixo → sugerir o mais próximo
      // v5.2: SÓ sugere quando o prefixo ACTIVO foi usado (não para cliques de botão)
      // "?play" com prefixo "$" → silêncio total (prefixo errado)
      // "$plai" com prefixo "$" → sugere "$play" (prefixo correcto, typo)
      const isRealPrefix = ctx.prefixSource === 'group' || ctx.prefixSource === 'global';
      if (!isRealPrefix) return false; // clique de botão ou prefixo errado → silêncio

      if (commandName.length >= 2) {
        // Palavras muito curtas ou comuns que não são comandos → silêncio
        const commonWords = new Set(['oi','ok','sim','nao','não','ola','olá','boa','bom','ae','ai','ei','ué','ne','né','rs','kkk','lol','haha','ta','tá','bd','bjs','vlw','obg']);
        if (commandName.length < 3 || commonWords.has(commandName)) {
          return false;
        }
        // Calcular distância Levenshtein simples para sugestão
        const allCmds = [
          ...Object.keys(nativeCommands || {}),
          ...Object.keys(packageCommands || {}),
          ...[...caseHandler.CASES.keys()],
        ].filter(k => Math.abs(k.length - commandName.length) <= 3);

        function levenshtein(a, b) {
          const dp = Array.from({ length: a.length + 1 }, (_, i) =>
            Array.from({ length: b.length + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0)
          );
          for (let i = 1; i <= a.length; i++)
            for (let j = 1; j <= b.length; j++)
              dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1]
                : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
          return dp[a.length][b.length];
        }

        const closest = allCmds
          .map(k => ({ k, d: levenshtein(commandName, k) }))
          .sort((a, b) => a.d - b.d)
          .filter(x => x.d <= 3)
          .slice(0, 3);

        if (closest.length > 0) {
          const suggestion = closest[0].k;
          // Usa SEMPRE o prefixo principal (index 0), não o que o utilizador digitou
          // Se o utilizador digitou ".menu" com prefixo "." mas o principal é "$",
          // a sugestão deve mostrar "$menu", não "$.menu"
          const primaryPrefix = prefixes[0] || prefix;
          const correctCmd = primaryPrefix + suggestion;
          const menuCmd    = primaryPrefix + 'menu';
          // v5.3: personalidade do change determina o tom da sugestão
          const { formatResponse } = require('./botPersonality');
          const _theme = await require('./themeResolver').getThemeForContext(ctx.remoteJid).catch(() => null);
          const _sugLine = formatResponse(_theme, suggestion, 'suggestion', { ...ctx, prefix: primaryPrefix });
          const _errLine = formatResponse(_theme, commandName, 'error', ctx);
          const warnText = `${_errLine}\n\n${_sugLine}`;
          try {
            const { generateWAMessageFromContent, proto } = require('@systemzero/baileys');
            const btnMsg = generateWAMessageFromContent(ctx.remoteJid, {
              interactiveMessage: proto.Message.InteractiveMessage.fromObject({
                body:   proto.Message.InteractiveMessage.Body.fromObject({ text: warnText }),
                footer: proto.Message.InteractiveMessage.Footer.fromObject({ text: commandConfig.bot.name }),
                header: proto.Message.InteractiveMessage.Header.fromObject({ title: '', hasMediaAttachment: false }),
                nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
                  buttons: [
                    { name: 'cta_copy', buttonParamsJson: JSON.stringify({ display_text: '📋 Copiar: ' + correctCmd, copy_code: correctCmd }) },
                    { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '📜 Ver menu', id: menuCmd }) },
                  ],
                }),
              }),
            }, { userJid: sock.user?.id, quoted: msg });
            await sock.relayMessage(ctx.remoteJid, btnMsg.message, {
              messageId: btnMsg.key.id,
              additionalNodes: [{ tag: 'biz', attrs: {}, content: [{
                tag: 'interactive', attrs: { type: 'native_flow', v: '1' },
                content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }],
              }]}],
            });
          } catch {
            await sock.sendMessage(ctx.remoteJid, { text: warnText + `\n\nUsa *${menuCmd}* para ver todos os comandos.` }, { quoted: msg });
          }
        }
        // Sem sugestão → silêncio total (não polui grupos)
      } // fim if commandName.length >= 2
      return false;
    }
    if (cmd.accessLevel === 'owner' && !isOwner) {
      await sock.sendMessage(ctx.remoteJid, { text: '🚫 Só Dono.' }, { quoted: msg }); return true;
    }
    if (cmd.accessLevel === 'premium') {
      const user = await User.findOne({ whatsappNumber: ctx.senderNumber });
      const isPrem = isOwner || checkIsPremium(user);
      if (!isPrem) {
        await sock.sendMessage(ctx.remoteJid, { text: `⭐ *Comando Premium*\n\nUse !vip\n📞 wa.me/${config.owner.number}` }, { quoted: msg });
        return true;
      }
    }
    cmd.usageCount = (cmd.usageCount || 0) + 1;
    await cmd.save();
    const responseText = fillVars(cmd.response || '', ctx);
    if (cmd.mediaUrl && cmd.mediaType) {
      const buffer = await mediaHandler.fetchBuffer(cmd.mediaUrl);
      const payload = cmd.mediaType === 'image' || cmd.mediaType === 'gif'
        ? { image: buffer, caption: responseText }
        : cmd.mediaType === 'video' ? { video: buffer, caption: responseText }
        : cmd.mediaType === 'audio' ? { audio: buffer, mimetype: 'audio/mp4' }
        : { text: responseText };
      await sock.sendMessage(ctx.remoteJid, payload, { quoted: msg });
    } else if (responseText) {
      await sock.sendMessage(ctx.remoteJid, { text: responseText }, { quoted: msg });
    }
    await incrementUserCommand(ctx.senderNumber, ctx, canonicalCommand);
    reactions.reactSuccess(sock, msg, canonicalCommand).catch(() => {});
    return true;
  } catch (err) {
    reactions.reactError(sock, msg, canonicalCommand).catch(() => {});
    console.error('DB cmd:', err);
    return false;
  }
}

async function handleDecryptRequest(sock, downloadMsg, ctx, docMsg, isOwner, replyMsg = downloadMsg) {
  // Verifica permissão: Dono ou Premium
  const user = await User.findOne({ whatsappNumber: ctx.senderNumber });
  const isPremium = isOwner || checkIsPremium(user);

  if (!isPremium) {
    await sock.sendMessage(ctx.remoteJid, {
      text: `🔓 *VPN DECRYPTER — Recurso Premium*\n\n` +
            `Para usar o decrypter, você precisa ser Premium.\n\n` +
            `💎 Veja os planos: ${config.bot.prefix}vip\n` +
            `📞 wa.me/${config.owner.number}`,
    }, { quoted: replyMsg });
    return true;
  }

  await sock.sendMessage(ctx.remoteJid, { react: { text: '🔓', key: replyMsg.key } });

  try {
    const buffer = await mediaHandler.downloadFromMessage(downloadMsg);
    const fileName = docMsg.fileName || 'arquivo.bin';
    const result = await decrypter.decrypt(fileName, buffer);
    const formatted = formatForWhatsApp(result, config);

    // Se muito grande, divide
    if (formatted.length > 4000) {
      const chunks = chunkString(formatted, 3800);
      for (const c of chunks) await sock.sendMessage(ctx.remoteJid, { text: c }, { quoted: replyMsg });
    } else {
      await sock.sendMessage(ctx.remoteJid, { text: formatted }, { quoted: replyMsg });
    }

    // Envia JSON completo como arquivo também
    const jsonBuf = Buffer.from(JSON.stringify(result, null, 2), 'utf-8');
    await sock.sendMessage(ctx.remoteJid, {
      document: jsonBuf, fileName: `${fileName}.decrypted.json`, mimetype: 'application/json',
      caption: '📄 JSON completo da decryptação',
    }, { quoted: replyMsg });

    await sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: replyMsg.key } });

    // Log
    try {
      await DecryptLog.create({
        user: user?._id, username: user?.username || ctx.pushName,
        whatsappNumber: ctx.senderNumber, fileName, format: result.format,
        source: 'whatsapp', success: true,
        extracted: { configName: result.configName, host: result.server?.host, port: result.server?.port },
      });
    } catch (e) {}
  } catch (err) {
    await sock.sendMessage(ctx.remoteJid, { react: { text: '❌', key: replyMsg.key } });
    await sock.sendMessage(ctx.remoteJid, {
      text: `❌ *Erro ao decryptar*\n\n${err.message}\n\nFormatos suportados: .ehi, .ehic, .hat, .npv4, .dark, .any, .tls, .conf, .nm, .ovpn, .ssh, .json`,
    }, { quoted: replyMsg });
    try {
      await DecryptLog.create({
        user: user?._id, username: user?.username || ctx.pushName,
        whatsappNumber: ctx.senderNumber, fileName: docMsg?.fileName,
        source: 'whatsapp', success: false, error: err.message,
      });
    } catch (e) {}
  }
  return true;
}


const DECRYPT_URL_EXT_RE = /\.(ehi|ehic|hat|npv|npv4|npv7|npv8|npvt|dark|darkt|any|tls|nm|nmess|ovpn|ssh|ssl|json|conf|wg|wireguard|txt|bdnet|bd|apna|apnalite|wyrvpn|wyr)(?:[/?#]|$)/i;

function isDecryptFileUrl(url) {
  return /mediafire\.com/i.test(url) || DECRYPT_URL_EXT_RE.test(url);
}

function fileNameFromUrl(url, fallback = 'config.ehi') {
  try {
    const u = new URL(url);
    let name = pathDecode(u.pathname.split('/').filter(Boolean).pop() || fallback);
    if (!DECRYPT_URL_EXT_RE.test(name)) {
      const pathParts = u.pathname.split('/').filter(Boolean).map(pathDecode);
      name = pathParts.find(x => DECRYPT_URL_EXT_RE.test(x)) || fallback;
    }
    return name.replace(/[\\/:*?"<>|]+/g, '_');
  } catch {
    return fallback;
  }
}

function pathDecode(s) {
  try { return decodeURIComponent(String(s).replace(/\+/g, ' ')); }
  catch { return String(s).replace(/\+/g, ' '); }
}

async function resolveMediaFireDirectUrl(url) {
  const page = (await mediaHandler.fetchBuffer(url)).toString('utf-8');
  const patterns = [
    /href=["'](https:\/\/download[^"'<>]+)["']/i,
    /id=["']downloadButton["'][^>]+href=["']([^"']+)["']/i,
    /"download_link"\s*:\s*"([^"]+)"/i,
  ];
  for (const re of patterns) {
    const m = page.match(re);
    if (m) return m[1].replace(/\\\//g, '/').replace(/&amp;/g, '&');
  }
  throw new Error('Não encontrei o link direto do MediaFire.');
}

async function fetchDecryptFileFromUrl(url) {
  let finalUrl = url;
  if (/mediafire\.com/i.test(url) && !/download\d+\.mediafire\.com/i.test(url)) {
    finalUrl = await resolveMediaFireDirectUrl(url);
  }
  const buffer = await mediaHandler.fetchBuffer(finalUrl);
  if (!buffer || buffer.length < 16) throw new Error('Arquivo vazio ou inválido.');
  if (buffer.length > 30 * 1024 * 1024) throw new Error('Arquivo muito grande para decrypt via WhatsApp (máx. 30MB).');
  return { buffer, fileName: fileNameFromUrl(finalUrl, 'config.ehi'), finalUrl };
}

function chunkString(str, size) {
  const chunks = [];
  for (let i = 0; i < str.length; i += size) chunks.push(str.slice(i, i + size));
  return chunks;
}

/**
 * v6.85 — pedidos de foto REAIS, como no print do Dark:
 *   "Agora monstra o Drake e o Kendrick" → UMA pesquisa com dois nomes
 *   não devolve nada → ela dizia "tá, vai aí os dois" SEM fotos.
 *   "Mande a foto deles" → pesquisava "deles" → imagem preta "1º DELAS".
 * Agora: termo vago resolve-se pelo contexto (último termo/nomes da
 * frase), multi-nome envia uma foto por pessoa, e se não encontrar
 * ela diz como pessoa — nunca finge, nunca manda lixo.
 * @returns {'enviadas'|'falhou'|null}
 */
async function _fotosPedidas(sock, msg, ctx, cleanText) {
  try {
    const imgSearch = require('./imageSearch');
    const pedido = imgSearch.detectarPedidoImagem(cleanText);
    if (!pedido || pedido.gerar) return null;

    const { termo, nomes } = imgSearch.resolverTermo({
      jid: ctx.remoteJid, termo: pedido.termo, texto: cleanText,
    });
    const alvos = nomes.length ? nomes : [termo];

    const enviadas = [];
    for (const alvo of alvos) {
      const imgs = await imgSearch.buscarImagens(alvo, 1).catch(() => null);
      if (imgs?.length && /^https?:/i.test(String(imgs[0].url || ''))) {
        await sock.sendMessage(ctx.remoteJid, {
          image: { url: imgs[0].url },
          ...(alvos.length > 1 ? { caption: alvo } : {}),
        }, { quoted: msg });
        enviadas.push(alvo);
        try { imgSearch.lembrarTermo(ctx.remoteJid, alvo); } catch {}
      }
    }
    if (enviadas.length) return 'enviadas';

    // Sem foto explícita no pedido ("me dá um X") → deixa a IA conversar
    if (!/\b(foto|imagem|fotografia|retrato|picture|photo)\b/i.test(cleanText || '')) {
      return null;
    }

    // Não achou → responde como pessoa, não finge nem manda lixo
    const linhas = [
      `Não achei foto de ${alvos.join(' e ')} agora. Tenta pedir de outra forma.`,
      `Hmm... ${alvos.join(' e ')}. Não me apareceu nenhuma foto boa aqui, desculpa.`,
    ];
    await sock.sendMessage(ctx.remoteJid, {
      text: linhas[Math.floor(Math.random() * linhas.length)],
    }, { quoted: msg });
    return 'falhou';
  } catch (e) {
    console.warn('[Aura imagem]', String(e?.message || e).slice(0, 60));
    return null;
  }
}

async function incrementUserCommand(number, ctx = null, commandName = '') {
  // v6.82: alimenta o feed live do dashboard (página Grupos).
  try {
    require('./liveBroadcaster').userCommand({
      command: commandName || '',
      user: ctx?.pushName || '',
      number: String(number || ''),
      group: ctx?.isGroup ? ctx.remoteJid : null,
      success: true,
    });
  } catch (e) {}
  try {
    const u = await User.findOne({ whatsappNumber: number });
    if (u) { u.commandsUsed = (u.commandsUsed || 0) + 1; u.lastSeenAt = new Date(); await u.save(); }
  } catch (e) {}
  if (ctx?.isGroup && ctx.senderJid) {
    try {
      const GroupMemberActivity = require('../database/models/GroupMemberActivity');
      await GroupMemberActivity.findOneAndUpdate(
        { groupJid: ctx.remoteJid, memberJid: ctx.senderJid },
        {
          $set: { memberNumber: ctx.senderNumber, pushName: ctx.pushName || '', lastCommandAt: new Date(), lastMessageAt: new Date() },
          $inc: { commands: 1 },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    } catch (e) {}
  }
}

async function getStickerWatermarkConfigForHandler(ctx) {
  try {
    const wm = require('./stickerWm');
    const local = await wm.getForJid(ctx?.remoteJid);
    if (local?.enabled) {
      return {
        packName: local.packName,
        authorName: local.authorName,
        watermarkText: local.packName,
        visibleWatermark: false,
        packId: local.packId,
        packUrl: local.channelUrl || local.packUrl,
      };
    }
  } catch {}
  const enabled = await botConfigCache.get('sticker_watermark_enabled', true).catch(() => true);
  const packName = await botConfigCache.get('sticker_pack_name', '').catch(() => '');
  const authorName = await botConfigCache.get('sticker_author_name', '').catch(() => '');
  const watermarkText = await botConfigCache.get('sticker_watermark_text', config.bot.name || 'DARK BOT').catch(() => config.bot.name || 'DARK BOT');
  const visible = await botConfigCache.get('sticker_visible_watermark', false).catch(() => false);
  return {
    packName: enabled ? (packName || `${config.bot.name} • ${config.owner.name}`) : ' ',
    authorName: enabled ? (authorName || `${ctx.pushName} | ${ctx.groupName || 'PV'}`) : ' ',
    watermarkText: enabled ? watermarkText : '',
    visibleWatermark: enabled && (visible === true || visible === 'true' || visible === 'on' || visible === 1 || visible === '1'),
  };
}

async function handleStickerRequest(sock, msg, ctx) {
  try {
    await sock.sendMessage(ctx.remoteJid, { react: { text: '⏳', key: msg.key } });
    const buffer = await mediaHandler.downloadFromMessage(msg);
    const { detectMime } = require('./stickerMaker');
    const mime = detectMime(buffer);
    const isVid = !!msg.message?.videoMessage;
    const isGif = msg.message?.videoMessage?.gifPlayback;
    const isAnimated = isVid || isGif || mime === 'image/gif' || mime === 'video/mp4' || mime === 'video/webm';
    const stk = await stickerMaker.create(buffer, {
      botName: config.bot.name, ownerName: config.owner.name,
      userName: ctx.pushName, groupName: ctx.groupName || 'Privado',
      isVideo: isAnimated,
      ...(await getStickerWatermarkConfigForHandler(ctx)),
    });
    if (!stk || stk.length < 50) throw new Error('Sticker inválido');
    await sock.sendMessage(ctx.remoteJid, { sticker: stk }, { quoted: msg });
    await sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } });
  } catch (err) {
    await sock.sendMessage(ctx.remoteJid, { react: { text: '❌', key: msg.key } });
    await sock.sendMessage(ctx.remoteJid, { text: '❌ ' + err.message }, { quoted: msg });
  }
}


// ── v6.45: wrapper de performance ───────────────────────────────
// _handleInner tem dezenas de `return false` espalhados. Envolvê-la
// garante que o cache de request é sempre aberto e fechado, mesmo
// quando ela sai a meio ou lança. Sem isto, o cache de uma mensagem
// podia vazar para a seguinte e servir dados velhos.
async function handle(sock, msg) {
  requestCache.begin();
  try {
    return await _handleInner(sock, normalizeIncomingMsg(msg));
  } finally {
    requestCache.end();
  }
}

module.exports = { handle, extractText, getSenderInfo, fillVars, unwrapWhatsAppMessage, normalizeIncomingMsg, pareceComando };
