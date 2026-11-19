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
const auraCompreensao = require('../aura/auraCompreensao');

// Inicializa os cases ao arrancar
caseHandler.init();

// Todas as reacções conversacionais passam pelo selector semântico da AURA;
// o humor é específico deste chat e continua a ser apenas estilo de persona.
function chooseAuraReaction(text, ctx = {}) {
  const chatId = String(ctx?.remoteJid || '');
  let mood = 'normal';
  try { mood = require('../aura/auraHuman').getMood(chatId).mood || 'normal'; } catch {}
  try { return require('../aura/auraDecide').escolherReacao(text, { mood, chatId }); }
  catch { return '👀'; }
}

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
    ? { ...key, remoteJid: alternateJid, remoteJidLid: key.remoteJid }
    : key;

  if (inner === msg.message && normalizedKey === key) return msg;
  return { ...msg, key: normalizedKey, message: inner };
}

function hasMediaPayload(message) {
  const m = unwrapWhatsAppMessage(message || {});
  // v12.2: view-once também é mídia — Aura vê!
  return !!(
    m.audioMessage || m.imageMessage || m.videoMessage || m.stickerMessage ||
    m.documentMessage || m.documentWithCaptionMessage || m.ptvMessage ||
    m.albumMessage || m.stickerPackMessage
  );
}

function isViewOncePayload(message) {
  if (!message) return false;
  try {
    const raw = message || {};
    if (raw.viewOnceMessage || raw.viewOnceMessageV2 || raw.viewOnceMessageV2Extension) return true;
    const m = unwrapWhatsAppMessage(raw);
    return !!(m.imageMessage?.viewOnce || m.videoMessage?.viewOnce || m.audioMessage?.viewOnce);
  } catch { return false; }
}

function isIgnorableWhatsAppNoise(message) {
  if (!message) return true;
  const keys = Object.keys(message);
  if (!keys.length) return true;
  // v12.2: reactionMessage NÃO é ruído — ver auraReaction.js
  if (keys.includes('reactionMessage')) return false;
  const ignore = new Set([
    'protocolMessage', 'senderKeyDistributionMessage',
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

  // 1. Resposta de botão/lista/interactive SEMPRE PRIMEIRO
  // v12.9.15: se o utilizador clicou num botão ou item de lista, o ID do botão
  // (ex: .down, .play) tem SEMPRE prioridade sobre o texto/título exibido
  // (ex: "música, vídeo, redes sociais."), senão o WhatsApp manda o título
  // como conversation ou extendedTextMessage e o bot ignora o comando!
  const irm = m?.interactiveResponseMessage;
  if (irm) {
    if (irm.selectedButtonId) return irm.selectedButtonId;

    // paramsJson é o campo principal dos botões nativeFlow
    const paramsRaw = irm?.nativeFlowResponseMessage?.paramsJson || irm?.paramsJson || '';
    if (paramsRaw) {
      try {
        const p = typeof paramsRaw === 'string' ? JSON.parse(paramsRaw) : paramsRaw;
        const textBtn = p.id || p.selected_id || p.selectedRowId || p.rowId ||
               p.row_id || p.button_id || p.buttonId || p.value || '';
        if (textBtn) return textBtn;
      } catch {}
    }

    // body.text como fallback
    if (irm.body?.text) return irm.body.text;
  }

  // 2. Resposta de botão clássico (MD / template / list)
  let btnId =
    m?.buttonsResponseMessage?.selectedButtonId ||
    m?.templateButtonReplyMessage?.selectedId ||
    m?.listResponseMessage?.singleSelectReply?.selectedRowId || '';
  if (btnId) return btnId;

  // 3. Enquete
  if (m?.pollUpdateMessage?.vote?.selectedOptions?.length) {
    return m.pollUpdateMessage.vote.selectedOptions[0] || '';
  }

  // 4. Texto normal (só se não for clique em botão/lista)
  let text =
    m?.conversation ||
    m?.extendedTextMessage?.text ||
    m?.imageMessage?.caption ||
    m?.videoMessage?.caption ||
    m?.documentMessage?.caption ||
    m?.documentWithCaptionMessage?.message?.documentMessage?.caption || '';
  if (text) return text;

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

// v12.9.15: Mapeamento de títulos de menu para os comandos correspondentes
// Quando um utilizador clica numa opção do menu interativo e o WhatsApp envia
// apenas o título ou subtítulo do item em texto plano, mapeamos directamente para o comando.
const MENU_TITLES_MAP = {
  // Downloads
  'música, vídeo, redes sociais.': 'down',
  'música, vídeo, redes sociais': 'down',
  'musica, video, redes sociais.': 'down',
  'musica, video, redes sociais': 'down',
  'downlods': 'down',
  'downloads': 'down',
  'download': 'down',
  // Figurinhas
  'stickers, packs, arte visual.': 'menufigurinhas',
  'stickers, packs, arte visual': 'menufigurinhas',
  'figurinhas': 'menufigurinhas',
  'figurinhas & stickers': 'menufigurinhas',
  // IA & Chatbots
  'ia com memória, gpt, claude.': 'menuia',
  'ia com memória, gpt, claude': 'menuia',
  'ia com memoria, gpt, claude.': 'menuia',
  'ia com memoria, gpt, claude': 'menuia',
  'ia & chatbots': 'menuia',
  'ia & chatots': 'menuia',
  // Jogos & Social
  'quiz, forca, casino, mini-games.': 'menujogos',
  'quiz, forca, casino, mini-games': 'menujogos',
  'jogos & social': 'menujogos',
  'joos & socia': 'menujogos',
  // Economia & RPG
  'coins, bank, rpg, crafting.': 'menueconomia',
  'coins, bank, rpg, crafting': 'menueconomia',
  'economia & rpg': 'menueconomia',
  'eonoma & rg': 'menueconomia',
  // Interações
  'abraçar, beijar, casar, família.': 'menuinteracoes',
  'abraçar, beijar, casar, família': 'menuinteracoes',
  'abracar, beijar, casar, familia.': 'menuinteracoes',
  'abracar, beijar, casar, familia': 'menuinteracoes',
  'interacções': 'menuinteracoes',
  'interações': 'menuinteracoes',
  'interacoes': 'menuinteracoes',
  // Zoeira & Rank
  'medidores, rankings, brincadeiras.': 'menuzoeira',
  'medidores, rankings, brincadeiras': 'menuzoeira',
  'zoeira & rank': 'menuzoeira',
  'zoir & rnk': 'menuzoeira',
  // Texto & Fontes
  'bold, mini, glitch, calc, frases.': 'menutexto',
  'bold, mini, glitch, calc, frases': 'menutexto',
  'texto & fontes': 'menutexto',
  // Search & Stalk
  'pesquisas, stalk, consultas.': 'menusearch',
  'pesquisas, stalk, consultas': 'menusearch',
  'search & stalk': 'menusearch',
  // Audio & Efeitos
  'bass, reverb, 8d, slowed, voz.': 'menuaudio',
  'bass, reverb, 8d, slowed, voz': 'menuaudio',
  'audio & efeitos': 'menuaudio',
  // Logos & Efeitos
  'naruto, rainbow, neon, graffiti.': 'menulogos',
  'naruto, rainbow, neon, graffiti': 'menulogos',
  'logos & efeitos': 'menulogos',
  // Adm & Grupos
  'moderação, regras, automação.': 'menuadm',
  'moderação, regras, automação': 'menuadm',
  'moderacao, regras, automacao.': 'menuadm',
  'moderacao, regras, automacao': 'menuadm',
  'adm & grupos': 'menuadm',
  // Info & Stats
  'ping, perfil, diagnóstico.': 'menustatus',
  'ping, perfil, diagnóstico': 'menustatus',
  'ping, perfil, diagnostico.': 'menustatus',
  'ping, perfil, diagnostico': 'menustatus',
  'info & stats': 'menustatus',
  // RPG & Aventura
  'trabalhar, minerar, explorar.': 'submenuRPG',
  'trabalhar, minerar, explorar': 'submenuRPG',
  'rpg & aventura': 'submenuRPG',
  // Menu +18
  'conteúdo adulto, só vips.': 'menu18',
  'conteúdo adulto, só vips': 'menu18',
  'conteudo adulto, so vips.': 'menu18',
  'conteudo adulto, so vips': 'menu18',
  'menu+18': 'menu18',
  'menu 18': 'menu18',
  // Comandos Secretos
  'comandos secretos.': 'cmdsocultos',
  'comandos secretos': 'cmdsocultos',
  'cmds ocultos': 'cmdsocultos',
  'cmdsocultos': 'cmdsocultos',
  // Criador
  'informações do criador.': 'criador',
  'informações do criador': 'criador',
  'informacoes do criador.': 'criador',
  'informacoes do criador': 'criador',
  'criador': 'criador',
  // VIP & Aluga
  'planos premium e hospedagem.': 'vip',
  'planos premium e hospedagem': 'vip',
  'vip & aluga': 'vip',
  'vip': 'vip',
  // Dono & System
  'broadcast, eval, config, cases.': 'menudono',
  'broadcast, eval, config, cases': 'menudono',
  'dono & system': 'menudono',
  // Central de Grupos
  'central': 'central',
  'central de grupos': 'central',
};

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

function getSenderInfo(msg, sock) {
  const remoteJid = msg.key.remoteJid || '';
  const isGroup = remoteJid.endsWith('@g.us');
  const isChannel = remoteJid.endsWith('@newsletter');
  const isStatus = remoteJid === 'status@broadcast' || remoteJid.endsWith('@broadcast');
  const fromBot = msg.key.fromMe === true && !!sock?.user?.id;
  const rawSenderJid = fromBot ? String(sock.user.id).replace(/:\d+(?=@)/, '') : isGroup ? (msg.key.participant || remoteJid) : remoteJid;

  // v6.53: o WhatsApp moderno identifica contas por LID (`…@lid`) em vez
  // do número. No PV, senderNumber saía como '189234567890123' em vez de
  // '244945280380' — o isOwner falhava e a AURA respondia ao próprio Dono
  // com "Não respondo a desconhecidos".
  // O Baileys dá o número real em participantAlt/remoteJidAlt; usamos
  // esse quando o JID principal é um LID.
  const alt = fromBot ? '' : isGroup
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
  const senderLid = ehLid ? String(rawSenderJid).split(':')[0].split('@')[0] : !isGroup && !fromBot ? String(msg.key.remoteJidLid || '').split(':')[0].split('@')[0] : '';
  const pushName = msg.pushName || 'Usuário';

  return { remoteJid, isGroup, isChannel, isStatus, senderJid, senderNumber, senderLid, pushName };
}


function getMessageContextInfo(msg) {
  return auraCompreensao.contextInfo(msg);
}

function getCachedQuotedMessage(msg, ctxInfo = getMessageContextInfo(msg)) {
  if (!ctxInfo?.stanzaId) return null;
  try {
    const cached = require('./messageListener').messageCache.get(String(ctxInfo.stanzaId));
    if (!cached) return null;
    if (ctxInfo.remoteJid && cached.key?.remoteJid && ctxInfo.remoteJid !== cached.key.remoteJid) return null;
    const quoteAuthors = [ctxInfo.participant, ctxInfo.quotedParticipant, ctxInfo.participantAlt, ctxInfo.participantPn].filter(Boolean);
    const cachedAuthor = cached.key?.participant || cached.key?.participantAlt || cached.key?.participantPn || '';
    if (quoteAuthors.length && cachedAuthor) {
      let resolver = {};
      try { const id = require('../aura/auraIdentidade'); resolver = { pnDoLid: id.pnDoLid, lidDoPn: id.lidDoPn }; } catch {}
      if (!quoteAuthors.some(author => auraCompreensao.sameWhatsAppIdentity(author, cachedAuthor, resolver))) return null;
    }
    if (ctxInfo.fromMe === true && !cached.key?.fromMe) return null;
    return cached;
  } catch { return null; }
}

function getQuotedMessage(msg) {
  const ctxInfo = getMessageContextInfo(msg);
  if (ctxInfo.quotedMessage) return ctxInfo.quotedMessage;
  const cached = getCachedQuotedMessage(msg, ctxInfo);
  return cached?.message ? auraCompreensao.unwrapMessage(cached.message) : null;
}

function getDocumentFromMessageObject(messageObj) {
  const m = auraCompreensao.unwrapMessage(messageObj || {});
  return m?.documentMessage || m?.documentWithCaptionMessage?.message?.documentMessage || null;
}

function buildQuotedDownloadMessage(msg) {
  const ctxInfo = getMessageContextInfo(msg);
  const cached = getCachedQuotedMessage(msg, ctxInfo);
  const quotedMessage = ctxInfo.quotedMessage || cached?.message;
  if (!quotedMessage) return null;
  return {
    key: {
      // Numa resposta privada a uma mensagem de grupo, usa a conversa de
      // origem/quote do cache, nunca o PV actual por defeito.
      remoteJid: ctxInfo.remoteJid || cached?.key?.remoteJid || msg?.key?.remoteJid,
      id: ctxInfo.stanzaId || cached?.key?.id || msg?.key?.id,
      ...(ctxInfo.participant || ctxInfo.quotedParticipant || cached?.key?.participant ? { participant: ctxInfo.participant || ctxInfo.quotedParticipant || cached?.key?.participant } : {}),
      ...(ctxInfo.participantAlt || ctxInfo.participantPn || cached?.key?.participantAlt || cached?.key?.participantPn ? { participantAlt: ctxInfo.participantAlt || ctxInfo.participantPn || cached?.key?.participantAlt || cached?.key?.participantPn } : {}),
      fromMe: ctxInfo.fromMe === true || !!cached?.key?.fromMe,
    },
    message: auraCompreensao.unwrapMessage(quotedMessage),
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
async function userIsPremiumOrOwner(number, isOwner, msg) {
  if (isOwner) return true;
  const u = await require('./hotCache').getUser(msg, number); // v7.52: memo partilhado
  return checkIsPremium(u);
}

// No privado, a conta Free fica limitada à conversão normal de foto/vídeo
// em sticker. O gate vem antes de AURA, listas e fluxos conversacionais para
// não deixar uma rota lateral transformar o PV gratuito numa conta completa.
const PV_FREE_STICKER_COMMANDS = new Set(['sticker', 's', 'fig', 'f', 'figurinha']);
const _pvFreeNoticeAt = new Map();
const PV_FREE_NOTICE_MS = 24 * 60 * 60 * 1000;
const FREE_PV_AURA_LIMIT = 10;
const _freePvAuraUsage = new Map();

async function deveAvisarPvFree(chave, sender = '') {
  const key = String(chave || '');
  if (!key) return true;
  const now = Date.now();
  if (_pvFreeNoticeAt.size > 5000) {
    for (const [k, at] of _pvFreeNoticeAt) if (now - at > PV_FREE_NOTICE_MS) _pvFreeNoticeAt.delete(k);
  }
  if (now - (_pvFreeNoticeAt.get(key) || 0) < PV_FREE_NOTICE_MS) return false;

  // O mapa local cobre respostas repetidas no mesmo processo; a marca no
  // perfil cobre reinícios, deploys e mais de um worker. Sem PN verificável
  // (um LID sem mapeamento), não criamos um número: fica só no mapa local.
  const number = userManager.normalizeNumber(sender);
  if (number && User?.db?.readyState === 1) {
    try {
      const day = diaLuanda();
      const updated = await User.findOneAndUpdate(
        { whatsappNumber: number, freePvNoticeDate: { $ne: day } },
        { $set: { freePvNoticeDate: day } },
        { new: true }
      ).lean();
      if (!updated) {
        _pvFreeNoticeAt.set(key, now);
        return false;
      }
      require('./hotCache').forgetUser?.(number);
    } catch (error) {
      // Não abre o spam quando Mongo oscila; o limitador local ainda vale.
      console.warn('[PV Free] aviso persistente indisponível:', error.message?.slice(0, 80));
    }
  }
  _pvFreeNoticeAt.set(key, now);
  return true;
}

async function avisarPvFree(sock, msg, ctx, prefix, noticeKey, sender = '') {
  if (!(await deveAvisarPvFree(noticeKey, sender))) return;
  const owner = String(config.owner?.number || '').replace(/\D/g, '');
  await sock.sendMessage(ctx.remoteJid, {
    text:
      `🆓 *ACESSO FREE NO PRIVADO*\n\n` +
      `No PV, contas Free podem criar stickers e usar a AURA em modo assistente por até *${FREE_PV_AURA_LIMIT} perguntas de texto/dia*. Responde a uma foto ou vídeo com *${prefix || config.bot.prefix || '!'}sticker*.\n\n` +
      `⭐ Para usar todos os comandos, compra o *VIP*.\n` +
      `🏠 Para activar o bot no teu grupo, adiciona-o e usa o *trial de 7 dias* ou contrata o aluguel.\n` +
      (owner ? `📲 Contratação: wa.me/${owner}` : ''),
  }, { quoted: msg }).catch(() => {});
}

// Um PV moderno pode chegar apenas como LID. Antes de aplicar cobrança ou
// permissões, resolve-o pelo mapeamento oficial/cached do Baileys, sem supor
// números a partir do LID. Assim Dono e VIP continuam reconhecidos.
function diaLuanda() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Luanda', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

async function consumirCotaAuraFree(user, sender) {
  const number = userManager.normalizeNumber(sender);
  const day = diaLuanda();
  const key = `${number || 'anon'}:${day}`;

  // Em produção, o incremento é atómico: duas mensagens simultâneas (ou
  // dois workers) não podem transformar o limite 10 em 11. O filtro aceita
  // a primeira pergunta de um dia novo ou uma cota ainda abaixo do máximo.
  if (number && User?.db?.readyState === 1) {
    try {
      const sameDay = { $eq: [{ $ifNull: ['$freeAuraDate', ''] }, day] };
      const updated = await User.findOneAndUpdate(
        {
          whatsappNumber: number,
          $expr: {
            $or: [
              { $ne: [{ $ifNull: ['$freeAuraDate', ''] }, day] },
              { $lt: [{ $ifNull: ['$freeAuraUsed', 0] }, FREE_PV_AURA_LIMIT] },
            ],
          },
        },
        [{
          $set: {
            freeAuraDate: day,
            freeAuraUsed: {
              $cond: [
                sameDay,
                { $add: [{ $ifNull: ['$freeAuraUsed', 0] }, 1] },
                1,
              ],
            },
          },
        }],
        { new: true }
      ).lean();
      if (!updated) return { allowed: false, used: FREE_PV_AURA_LIMIT };
      const used = Math.max(0, Number(updated.freeAuraUsed) || 0);
      _freePvAuraUsage.set(key, { used });
      require('./hotCache').forgetUser?.(number);
      return { allowed: true, used };
    } catch (error) {
      // Uma indisponibilidade breve do Mongo não deixa o PV ilimitado: cai
      // para a cota local até a persistência voltar, sem atrasar a resposta.
      console.warn('[PV Free] contador persistente indisponível:', error.message?.slice(0, 80));
    }
  }

  let entry = _freePvAuraUsage.get(key);
  if (!entry) {
    const storedDay = String(user?.freeAuraDate || '');
    const saved = Number(user?.freeAuraUsed || 0);
    entry = { used: storedDay === day && Number.isFinite(saved) ? Math.max(0, saved) : 0 };
  }
  if (entry.used >= FREE_PV_AURA_LIMIT) return { allowed: false, used: entry.used };
  entry.used += 1;
  _freePvAuraUsage.set(key, entry);
  return { allowed: true, used: entry.used };
}

async function responderAuraFreeLimitada(sock, msg, ctx, text, user, sender) {
  const quota = await consumirCotaAuraFree(user, sender);
  if (!quota.allowed) {
    // Partilha a mesma chave da conversa com os comandos bloqueados: uma
    // conta não recebe uma segunda peça comercial por ter atingido a cota.
    await avisarPvFree(sock, msg, ctx, null, String(ctx?.remoteJid || ctx?.senderLid || sender || 'free-pv'), sender);
    return;
  }
  const auraModes = require('../aura/auraModes');
  const resposta = await auraModes.assistantRespond(String(text).slice(0, 700), {
    botName: config.bot?.name || 'DARK BOT', userName: ctx.pushName || 'utilizador',
    isGroup: false, remoteJid: ctx.remoteJid, senderNumber: sender,
    isOwner: false, isVip: false, isAdmin: false, prefix: config.bot?.prefix || '!',
    historyArray: [], groupContext: '', freePvLimited: true,
  });
  await sock.sendMessage(ctx.remoteJid, { text: String(resposta || 'Não consegui responder agora. Tenta novamente mais tarde.') }, { quoted: msg });
}

async function normalizarIdentidadePv(sock, msg, ctx) {
  const fallback = userManager.normalizeNumber(ctx?.senderNumber);
  try {
    const ident = require('../aura/auraIdentidade');
    const resolved = await ident.identificar(sock, msg, ctx);
    const numero = userManager.normalizeNumber(resolved?.numero || fallback);
    if (numero) {
      ctx.senderNumber = numero;
      ctx.senderJid = resolved?.jid || `${numero}@s.whatsapp.net`;
    }
    if (resolved?.lid) ctx.senderLid = String(resolved.lid);
    return numero || fallback;
  } catch { return fallback; }
}

async function bloquearPvFreeForaSticker(sock, msg, ctx, text) {
  if (ctx?.isGroup || msg?.key?.fromMe) return false;
  const noticeKey = String(ctx?.remoteJid || ctx?.senderLid || ctx?.senderNumber || 'free-pv');
  try {
    const sender = await normalizarIdentidadePv(sock, msg, ctx);
    const [extraOwners, ownerNumDB, ownerLid] = await Promise.all([
      botConfigCache.get('owner_numbers', []).catch(() => []),
      botConfigCache.get('owner_number', '').catch(() => ''),
      botConfigCache.get('owner_lid', '').catch(() => ''),
    ]);
    const ownerNumbers = (Array.isArray(extraOwners) ? extraOwners : String(extraOwners || '').split(/[\s,]+/))
      .map(userManager.normalizeNumber)
      .filter(Boolean);
    const ownerFlags = require('./ownerIdentity').resolveOwnerFlags({
      ctx, msg: msg || {}, sock, config,
      dbOwnerNum: userManager.normalizeNumber(ownerNumDB), ownerLid, ownerNumbers,
    });
    Object.assign(ctx, ownerFlags);
    if (ownerFlags.isOwner) return false;

    let user = await require('./hotCache').getUser(msg, sender).catch(() => null);
    // Este gate vem antes do normalizador que cria o perfil do remetente.
    // Criamos o registo Free apenas quando Mongo está disponível para a
    // contagem sobreviver a reinícios; sem base, a protecção em memória vale.
    if (!user && sender && User?.db?.readyState === 1) {
      user = await userManager.identifyByWhatsApp(sender, ctx.pushName).catch(() => null);
    }
    if (checkIsPremium(user)) return false;

    const detected = await prefixEngine.detect(text, ctx.remoteJid).catch(() => null);
    const command = String(detected?.rest || '').trim().split(/\s+/)[0].toLowerCase();
    if (command && PV_FREE_STICKER_COMMANDS.has(command)) return false;

    const perguntaLivre = String(text || '').trim();
    if (!detected && perguntaLivre && perguntaLivre.length <= 700 && !pareceComando(perguntaLivre) && !hasMediaPayload(msg?.message)) {
      // Free fala com AURA apenas no modo Assistente: texto, sem comandos,
      // mídia, automações ou acções de WhatsApp, até 10 perguntas/dia.
      await responderAuraFreeLimitada(sock, msg, ctx, perguntaLivre, user, sender);
      return true;
    }

    // A orientação comercial só é entregue uma vez por conta/24h para não
    // transformar tentativas repetidas em spam. O gate continua fechado.
    await avisarPvFree(sock, msg, ctx, detected?.prefix, noticeKey, sender);
    return true;
  } catch {
    // Falha fechada para Free no PV: não abre AURA/comandos; se possível,
    // deixa apenas o mesmo aviso comercial com o limitador anti-spam.
    await avisarPvFree(sock, msg, ctx, null, noticeKey, ctx?.senderNumber).catch(() => {});
    return true;
  }
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
    // v7.67: texto estilo System Zero — funil directo para o !alugar.
    const pfx = ctx?.prefix || '!';
    const bName = config.bot?.name || 'DARK BOT';
    await sock.sendMessage(ctx.remoteJid, {
      text:
        '🔷 O bot não está *ativado* neste grupo.\n' +
        '\n' +
        `Digite *${pfx}alugar* para ver os planos e ativar o ${bName} aqui.\n` +
        `🆓 Ou *${pfx}trial* para 7 dias grátis.`,
    }, { quoted: msg }).catch(() => {});
  } catch (_) {}
}

/**
 * Bloqueia ANTES da AURA, botões pendentes e fluxos conversacionais. O gate
 * antigo ficava demasiado abaixo no handler: Dono/VIP e algumas automações
 * textuais ainda conseguiam falar num grupo já sem serviço.
 *
 * Só o funil de contratação e a preferência local !onlyadm/!adm1/!soadm
 * permanecem disponíveis. Não inferimos comandos de texto livre, para a AURA não voltar
 * a responder a conversa casual num grupo inactivo.
 */
async function _allowInactiveGroupInput(msg, ctx, text) {
  if (!ctx?.isGroup) return true;
  let settings = null;
  try { settings = await require('./hotCache').getGroupSettings(msg, ctx.remoteJid); } catch {}
  if (require('./groupEntitlement').hasActiveEntitlement(settings)) return true;
  // IDs de botão do próprio funil Premium não levam prefixo, mas só abrem o
  // pedido de plano; devem continuar a funcionar num grupo ainda inactivo.
  if (/^PREMIUM_(?:7|30|90)_\d+$/i.test(String(text || '').trim())) return true;

  let detected = null;
  try { detected = await prefixEngine.detect(text, ctx.remoteJid); } catch {}
  const prefix = detected?.prefix || config.bot.prefix || '!';
  let rental = false;
  try { rental = !!detected && require('./cases/rental2').gateAllows(text, prefix); } catch {}
  // !soadm é compatível com !onlyadm/!adm1: ambos mudam a mesma política
  // local do bot, sem fechar o chat nativo do WhatsApp.
  const localAdminControl = !!detected && /^\s*(?:onlyadm|adm1|soadm)(?:\s|$)/i.test(detected.rest || '');
  return rental || localAdminControl;
}

/**
 * Política única de “bot só para admins”. !onlyadm/!adm1 e !soadm são duas
 * formas de configurar a mesma opção `onlyAdmins`; o comando !fechar continua
 * a ser a acção explícita para fechar o chat do WhatsApp. O gate fica antes
 * da AURA, menus, comandos e fluxos conversacionais para um membro comum não
 * receber resposta por um caminho secundário.
 */
async function _adminsOnlyBlocksSender(sock, msg, ctx) {
  if (!ctx?.isGroup) return false;
  let gs = null;
  try { gs = await require('./hotCache').getGroupSettings(msg, ctx.remoteJid); } catch {}
  if (gs?.onlyAdmins !== true) return false;

  try {
    const [ownerLid, extraOwners, ownerNumDB] = await Promise.all([
      botConfigCache.get('owner_lid', ''),
      botConfigCache.get('owner_numbers', []),
      botConfigCache.get('owner_number', ''),
    ]);
    const ownerNumbers = Array.isArray(extraOwners)
      ? extraOwners.map(userManager.normalizeNumber).filter(Boolean)
      : String(extraOwners || '').split(/[\s,]+/).map(userManager.normalizeNumber).filter(Boolean);
    const flags = require('./ownerIdentity').resolveOwnerFlags({
      ctx, msg, sock, config,
      dbOwnerNum: userManager.normalizeNumber(String(ownerNumDB || '')),
      ownerLid,
      ownerNumbers,
    });
    if (flags.isOwner) return false;
  } catch {}

  return !(await isGroupAdminForHandler(sock, ctx));
}

async function _handleInner(sock, msg, turn) {
  let text = extractText(msg).trim();
  const hasIncomingMedia = hasMediaPayload(msg.message);
  if (!text && !hasIncomingMedia) return false;
  try {
    const { eSoPontuacao } = require('../aura/auraSanitizer');
    if (eSoPontuacao(text) && !hasIncomingMedia) return false;
  } catch {}

  const ctx = getSenderInfo(msg, sock);
  // v12.9.50: Canais (@newsletter) e feeds de status nunca são processados como mensagens de chat/PV/comandos
  if (ctx.isChannel || ctx.isStatus) return false;
  // Política comercial do PV: Free não usa AURA/listas/comandos, excepto a
  // conversão normal para sticker; Premium e Dono mantêm acesso completo.
  if (await bloquearPvFreeForaSticker(sock, msg, ctx, text)) return true;
  // Modo só-admin: AURA, menus e comandos ficam reservados a admins,
  // subdonos e Dono — sem depender de fechar o chat no WhatsApp.
  if (await _adminsOnlyBlocksSender(sock, msg, ctx)) return false;
  // Grupo sem serviço não é uma versão reduzida para Dono/VIP: é inactivo.
  // Isto barra a AURA e fluxos antigos antes de poderem responder; apenas o
  // funil de trial/aluguel e !onlyadm/!adm1 chegam ao resto do handler.
  if (ctx.isGroup && !(await _allowInactiveGroupInput(msg, ctx, text))) {
    if (pareceComando(text)) {
      const detected = await prefixEngine.detect(text, ctx.remoteJid).catch(() => null);
      ctx.prefix = detected?.prefix || config.bot.prefix || '!';
      await _avisoSemAluguel(sock, msg, ctx);
    }
    return false;
  }
  const conversation = require('../aura/auraConversation');
  try {
    const control = conversation.process(text, ctx);
    if (control.handled) {
      if (control.reply) await sock.sendMessage(ctx.remoteJid, { text: control.reply }, { quoted: msg });
      return true;
    }
  } catch (e) {
    console.warn('[Aura pausa] Estado indisponível; mensagem não executada.');
    return false;
  }
  sock = conversation.guardSock(sock, ctx, turn);
  try { require('./stickerWm').bind(ctx); } catch {}

  // ── v7.77: listas com escolha por número (play/sly/spotify/...) ──
  // Tenta primeiro a lista pendente (ela cede ao !som se o cartão for
  // mais novo); depois o cartão de música. "1".."10", com ou sem zero.
  // v11.2.8: pinAlbum persistente — foto mantém viva, álbum envia várias
  try {
    // v11.2.9: listas + pinAlbum com anti-duplicado + GIF fix
    if (/^LISTANUM_(10|[1-9])$/i.test(text) || /^LISTA_SENT_/i.test(text) || /^LISTANAV_/i.test(text)) {
      const lista = require('./listaEscolha');
      if (await lista.tentarToken(sock, msg, ctx, text)) return true;
    }
    if (/^PINNUM_(10|[1-9])$/i.test(text) || /^PINNAV_/i.test(text) || /^PIN_SENT_/i.test(text)) {
      const pinAlbum = require('./pinAlbum');
      if (await pinAlbum.tentarToken(sock, msg, ctx, text)) return true;
    }
    if (/^0?(10|[1-9])(?:\s|$)/.test(text)) {
      const lista = require('./listaEscolha');
      if (await lista.tentarNumero(sock, msg, ctx, text)) return true;
      const pinAlbum = require('./pinAlbum');
      if (await pinAlbum.tentarNumero(sock, msg, ctx, text)) return true;
      const musicaCard = require('./musicaCard');
      if (await musicaCard.tentarNumero(sock, msg, ctx, text)) return true;
    }
    // v11.2.9: fechar pesquisa persistente por texto livre + anti-duplicado global
    if (/^(sair|fechar|fecha|cancelar|stop|exit|close)$/i.test(text.trim())) {
      const pinAlbum = require('./pinAlbum');
      if (await pinAlbum.tentarNumero(sock, msg, ctx, text)) return true;
      const lista = require('./listaEscolha');
      if (await lista.tentarNumero(sock, msg, ctx, text)) return true;
    }
    if (/^(mais|avança|avanca|volta|next|prev|proxima|anterior)$/i.test(text.trim())) {
      const pinAlbum = require('./pinAlbum');
      if (await pinAlbum.tentarNumero(sock, msg, ctx, text)) return true;
      const lista = require('./listaEscolha');
      if (await lista.tentarNumero(sock, msg, ctx, text)) return true;
    }
  } catch {}

  // ── v9.11: DIVULGAÇÃO — assistente ESCRITO dos 4 passos ─────────
  // O dono responde com texto simples (número de vezes, "c", visivel,
  // invisivel) ou `.cancelar`. Só consome com sessão viva (chat+dono).
  try {
    const dv = require('./cases/divulgacao');
    if (dv.consumir && await dv.consumir(sock, msg, ctx, text)) return true;
  } catch (e) { console.warn('[divulgacao-flow]', e.message?.slice(0, 60)); }

  const prefixes = await prefixEngine.getAllActivePrefixes(ctx.remoteJid);

  // ── RPG CREATE legado — cliques de listas/carrosséis antigos ───────
  // Algumas mensagens já entregues usam RPGPICK_. Aceita chaves com _/- e
  // deixa createFlow normalizar para RPGCR_, sem inutilizar o carrossel antigo.
  if (/^RPGPICK_[RC]_[a-z0-9_-]+$/i.test(text.split(/\s+/)[0] || '')) {
    try {
      const flow = require('./rpg/createFlow');
      if (await flow.pick({ sock, msg, ctx, token: text.split(/\s+/)[0] })) return true;
    } catch (e) { console.warn('[RPG pick]', e.message?.slice(0, 60)); }
  }

  // ── v7.90: RPG UI — cliques SIM/NÃO e escolha de opção ─────────────
  // Mesmo mecanismo do RPGPICK: RPGSIM_/RPGNAO_/RPGSEL_ chegam como
  // selectedButtonId/selectedRowId e executam o efeito pendente.
  if (/^RPG(?:SIM|NAO|SEL)_[a-z0-9_]+$/i.test(text.split(/\s+/)[0] || '')) {
    try {
      const ui = require('./rpg/ui');
      if (await ui.resolver(sock, msg, ctx, text.split(/\s+/)[0])) return true;
    } catch (e) { console.warn('[RPG ui]', e.message?.slice(0, 60)); }
  }

  // ── v9.23: RPG COMBAT — botões de combate (RPGFIGHT_) ─────────────
  if (/^RPGFIGHT_[a-z0-9_]+$/i.test(text.split(/\s+/)[0] || '')) {
    try {
      const combat = require('./rpg/combat');
      if (await combat.resolverBotao(sock, msg, ctx, text.split(/\s+/)[0])) return true;
    } catch (e) { console.warn('[RPG combat]', e.message?.slice(0, 60)); }
  }

  // ── RPG QUEST — escolhas narrativas em até três botões ─────────────
  if (/^RPGQUEST_[a-z0-9_]+_\d+$/i.test(text.split(/\s+/)[0] || '')) {
    try {
      const rpg2 = require('./cases/rpg2');
      if (await rpg2.resolverQuestClique(sock, msg, ctx, text.split(/\s+/)[0])) return true;
    } catch (e) { console.warn('[RPG quest]', e.message?.slice(0, 60)); }
  }

  // ── v9.23: RPG CREATE — botões de criação (RPGCR_) ─────────────────
  // Aceita IDs de quick-reply, lista e carrossel; chaves de raça/classe podem
  // conter _ ou -. Antes esses cliques eram ignorados silenciosamente.
  if (/^RPGCR_[A-Z]_[a-z0-9_-]+$/i.test(text.split(/\s+/)[0] || '')) {
    try {
      const createFlow = require('./rpg/createFlow');
      if (await createFlow.pick({ sock, msg, ctx, token: text.split(/\s+/)[0] })) return true;
    } catch (e) { console.warn('[RPG create]', e.message?.slice(0, 60)); }
  }

  // ── STORY MODE — mundo, testes, escolhas, próximos nós e bosses ─
  if (/^(?:STORY(?:C|N|B)?_[a-z0-9_]+|STESTE_[a-z]+|STESTQ_[a-z]+_\d+|STESTA_[a-z]+_\d+_\d+|SINFO_[a-z]+)$/i.test(text.split(/\s+/)[0] || '')) {
    try {
      const storyMode = require('./rpg/storyMode');
      if (await storyMode.resolverClique(sock, msg, ctx, text.split(/\s+/)[0])) return true;
    } catch (e) { console.warn('[RPG story]', e.message?.slice(0, 60)); }
  }

  // ── v11.1: RPG STRATEGY — botões de estratégia (RPGSTRAT_) ─────
  if (/^RPGSTRAT_([a-z]+)$/i.test(text.split(/\s+/)[0] || '')) {
    try {
      const rpg = require('./rpg/engine');
      const rpgTheme = require('./rpg/rpgTheme');
      const stratId = (text.split(/\s+/)[0].match(/^RPGSTRAT_([a-z]+)$/i) || [])[1]?.toLowerCase();
      const strat = stratId && rpg.STRATEGIES[stratId];
      if (strat) {
        const p = await rpg.getPlayer(ctx.senderNumber);
        p.strategy = strat.id;
        await rpg.savePlayer(p);
        await rpgTheme.rpgReply(sock, msg, ctx, strat.emoji + ' ESTRATÉGIA ATIVA', [
          `*${strat.emoji} ${strat.name}*`,
          strat.desc,
          '',
          '> Vais usar este estilo em todos os combates.',
          '> Usa *!estrategia* para mudar.',
        ]);
      }
      return true;
    } catch (e) { console.warn('[RPG strat]', e.message?.slice(0, 60)); }
  }

  // ── v11.1: RPG TEAM RAID — botões de missões de equipa (RTEAM_) ──
  if (/^RTEAM[A-Z]*_[a-z0-9_]+$/i.test(text.split(/\s+/)[0] || '')) {
    try {
      const storyMode = require('./rpg/storyMode');
      if (await storyMode.resolverCliqueTeam(sock, msg, ctx, text.split(/\s+/)[0])) return true;
    } catch (e) { console.warn('[RPG team]', e.message?.slice(0, 60)); }
  }

  // ── v11.2: MULTIVERSO — personagens/técnicas/treino/gacha ──────
  if (/^(RPGCHAR_[a-z0-9_]+|RPGTEC_[a-z0-9_]+|RPGTRN_[a-z]+|RPGGACHA|RPGALIA)$/i.test(text.split(/\s+/)[0] || '')) {
    try {
      const multiverse = require('./rpg/multiverse');
      if (await multiverse.resolverToken(sock, msg, ctx, text.split(/\s+/)[0])) return true;
    } catch (e) { console.warn('[RPG multiverse]', e.message?.slice(0, 60)); }
  }

  // ── v7.96: AURA VIGILANTE — decisões dos cartões (AURASEL_) ────────
  if (/^AURASEL_[a-z0-9]+_\d+$/i.test(text.split(/\s+/)[0] || '')) {
    try {
      const escolha = require('../aura/auraEscolha');
      const avisos = require('../aura/auraAvisos');
      if (await escolha.resolver(sock, msg, ctx, text.split(/\s+/)[0],
        (d, i, p) => avisos.despachar(d, i, { ...p, config }))) return true;
    } catch (e) { console.warn('[AuraEscolha]', e.message?.slice(0, 60)); }
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
        const gDoc = await GroupSettings.findOne({ groupJid: ctx.remoteJid }).select('groupTheme').lean().catch(() => null);
        const prevGrupo = (gDoc && gDoc.groupTheme) || 'dark';
        await GroupSettings.findOneAndUpdate(
          { groupJid: ctx.remoteJid },
          { groupTheme: found.name },
          { upsert: true }
        );
        // v9.15 — CHANGE/não: o cartão curto com botões manda no assunto
        try {
          await require('./changeConfirm').pedirConfirmacao(sock, ctx.remoteJid, msg,
            { prev: prevGrupo, grupo: true, tema: found, who: senderNum });
        } catch {
          await sock.sendMessage(ctx.remoteJid, {
            text: `${found.icon} Tema do grupo → *${found.name.toUpperCase()}*\nResponde \`!change nao\` para voltar a ${prevGrupo}.`,
          }, { quoted: msg });
        }
        return true;
      }

      const prevGlobal = await botConfigCache.get('active_theme', 'dark').catch(() => 'dark');
      const prevStyleGlobal = await botConfigCache.get('menu_style', '0').catch(() => '0');
      await BotConfig.set('active_theme', found.name);
      await BotConfig.set('menu_style', String(found.style));
      botConfigCache.clear();
      try {
        await require('./changeConfirm').pedirConfirmacao(sock, ctx.remoteJid, msg,
          { prev: prevGlobal, prevStyle: prevStyleGlobal, grupo: false, tema: found, who: senderNum });
      } catch {}
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

  // ── v12.9.15: MAPEAMENTO DE TÍTULOS DE MENU / BOTÕES ──────────────
  // Quando o utilizador clica num item de lista ou botão do menu (ex: "música, vídeo, redes sociais."),
  // certos clientes WhatsApp enviam o título do item como texto. Mapeamos directamente
  // para o comando correspondente (.down, .menufigurinhas, .menuia, etc.).
  if (text) {
    const norm = text.replace(/[_*~`]/g, '').trim().toLowerCase();
    const mappedCmd = MENU_TITLES_MAP[norm];
    if (mappedCmd) {
      const p = config.bot.prefix || '.';
      text = p + mappedCmd;
    }
  }

  // ── PrefixEngine v2 — deteção rigorosa por grupo ──────────────
  // Substitui o antigo noPrefixBtnIds/firstTokenNoPrefix que causava
  // o bug: "?play" era tratado como botão "play" → sugeria "$play"
  let prefixInfo = await prefixEngine.detect(text, ctx.remoteJid);

  // ── v12.9.1: PREFIXO TROCADO (@cap, !cap, /cap, #cap, +cap…) ──────────────
  // v12.9.6: SÓ funciona com MULTIPREFIXO activo no chat! Sem isso o bot
  // respondia a @cap ©cap etc. sem ninguém ter activado (bug reportado).
  // v12.9.15: No PV (!ctx.isGroup) ou para o Dono, prefixos comuns (+ ! / # $ * .)
  // são aceites se seguidos de comando conhecido (ex: +down, +central).
  // Se começou com símbolo de comando mas NÃO é comando conhecido, silêncio
  // (return false), nunca deixando vazar para a Aura!
  if (!prefixInfo) {
    const mAt = /^([@!#$&*+~^|=;°ºª\/©®™·•‣§¶¤])([a-zA-Z][\w-]{1,20})(?:\s|$)/.exec(text.trim());
    // Texto natural não é um comando sem prefixo. Ele precisa seguir para a
    // Aura, regras por conversa e respostas directas. O retorno precoce que
    // existia aqui silenciava TODO "aura, ..." e fazia a Aura parecer morta.
    // Só tratamos/ignoramos algo quando há realmente símbolo + possível comando.
    if (mAt) {
      const envOwnerNum = String(config.owner?.number || '').replace(/\D/g, '');
      const _multiOn = !ctx.isGroup || (envOwnerNum && ctx.senderNumber === envOwnerNum) || await prefixEngine.estaMultiprefixo(ctx.remoteJid).catch(() => false);
      if (!_multiOn) return false;
      const wGuess = mAt[2].toLowerCase();
      const _ch = require('./caseHandler');
      let _known = _ch.hasCase(wGuess);
      if (!_known) { try { _known = typeof require('./nativeCommands')[wGuess] === 'function'; } catch {} }
      if (!_known) { try { _known = !!(await Command.findOne({ $or: [{ name: wGuess }, { aliases: wGuess }], enabled: true }).select('_id').lean()); } catch {} }
      if (_known) {
        prefixInfo = { prefix: config.bot.prefix || '.', rest: text.trim().slice(1).trim(), source: 'prefixo-trocado' };
        console.log('[Prefixo] normalizado', mAt[1] + wGuess, '→', prefixInfo.prefix + wGuess);
      } else {
        return false;
      }
    }
  }
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

  const ownerNumbers = Array.isArray(extraOwners)
    ? extraOwners.map(userManager.normalizeNumber).filter(Boolean)
    : String(extraOwners || '').split(/[\s,]+/).map(userManager.normalizeNumber).filter(Boolean);
  const dbOwnerNum = userManager.normalizeNumber(String(ownerNumDB || ''));
  const ownerFlags = require('./ownerIdentity').resolveOwnerFlags({
    ctx, msg, sock, config, dbOwnerNum, ownerLid, ownerNumbers,
  });
  const isOwner = ownerFlags.isOwner;
  Object.assign(ctx, ownerFlags);

  if (text && !startsWithAnyPrefix(text, prefixes)) {
    if ((blacklist.includes(ctx.senderNumber) || (Array.isArray(disabledUsers) && disabledUsers.map(String).includes(ctx.senderNumber))) && !isOwner) return false;
    if (ctx.isGroup && Array.isArray(disabledGroups) && disabledGroups.includes(ctx.remoteJid) && !isOwner) return false;
    const language = require('../aura/auraDialogue');
    const literal = language.literalGreeting(text);
    const preference = language.deliveryPreference(text);
    let voiceMode = false;
    try { voiceMode = !!require('../aura/auraBrain').modos(ctx.remoteJid).soAudio; } catch (_) {}
    if (!ctx.isGroup && literal && preference !== 'audio' && (!voiceMode || preference === 'text')) {
      if (turn) turn.conversational = true;
      const result = await sock.sendMessage(ctx.remoteJid, { text: literal }, { quoted: msg });
      if (!result?.suppressed && typeof AiMemory.appendMessage === 'function') {
        await AiMemory.appendMessage(ctx.senderNumber, null, 'user', text).catch(() => {});
        await AiMemory.appendMessage(ctx.senderNumber, null, 'assistant', literal).catch(() => {});
      }
      return true;
    }
    const identity = conversation.identityReply(text, ctx);
    if (identity) {
      if (turn) turn.conversational = true;
      await sock.sendMessage(ctx.remoteJid, { text: identity }, { quoted: msg });
      return true;
    }
    const interpretation = require('../aura/auraInterpret');
    if (interpretation.isExplicitRequest(text)) {
      if (turn) turn.conversational = true;
      await sock.sendMessage(ctx.remoteJid, { text: interpretation.EXPLICIT_REPLY }, { quoted: msg });
      return true;
    }
  }

  // Confirmações da AURA são consumidas antes de regras/IA ou comandos,
  // sempre no mesmo chat e pelo mesmo Dono que pediu a acção.
  try {
    const confirmacaoAura = require('../aura/auraConfirmacao');
    if (await confirmacaoAura.processar({ sock, msg, ctx, texto: text, isOwner, isAdmin: ctx.isAdmin })) return true;
  } catch (e) { console.warn('[Aura confirmação]', e.message?.slice(0, 60)); }

  // Tarefas pontuais persistentes: agendamento e confirmação privada do Dono.
  try {
    if (text && !startsWithAnyPrefix(text, prefixes)) {
      const tarefas = require('../aura/memory/scheduledActions');
      if (await tarefas.handleMessage({ sock, msg, ctx, texto: text, isOwner })) return true;
    }
  } catch (e) { console.warn('[Aura tarefas]', e.message?.slice(0, 60)); }

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

  // ── v7.95: PERCEPÇÃO — a Aura lembra o que cada pessoa pediu ──────
  // Corre ANTES dos gates de decisão para que intenções atravessem
  // mensagens (ex.: «representa-me num sticker» → a foto seguinte
  // converte sem ninguém escrever comando; «manda em texto» desliga a
  // voz neste chat até alguém pedir voz de novo).
  const _perc = (() => { try { return require('../aura/auraPercepcao'); } catch { return null; } })();
  // Router de intenção usa contexto/destinatário já analisados. Não permite
  // que uma mera ocorrência de "Aura" ou "foto" transforme conversa alheia
  // num pedido de selfie.
  const _auraSuperIntent = (() => {
    try {
      const intent = require('../aura/auraIntent');
      return {
        analyzeIntent: (t, input = {}) => {
          const isGroup = !!input.isGroup;
          const isPrivate = !!input.isPrivate;
          const destination = ctx.dest || {};
          const explicitlyAddressed = !!(input.isBotMentioned || input.isReplyToAura || destination.vocativo || (isGroup && destination.directToAura));
          const direct = isGroup ? explicitlyAddressed : (isPrivate || !!destination.directToAura);
          const recentTexts = (ctx.recentMessages || []).map(m => m.texto || '').filter(Boolean);
          const quotedText = ctx.messageInfo?.citado?.texto || ctx.messageInfo?.citado?.caption || '';
          const result = intent.analyzeIntent(t, {
            isGroup,
            isPrivateChat: isPrivate,
            isReplyToAura: !!input.isReplyToAura,
            isOwner: !!input.isOwner,
            pushName: input.pushName || '',
            recentTexts,
            mentionedAuraInGroup: !!(input.isBotMentioned || input.isAuraTrigger),
            mentionedJids: input.mentionedJids || [],
            quotedParticipant: input.quotedParticipant || '',
            quotedText,
            botNum: input.botNum || '',
            botLid: input.botLid || '',
            botNames: [config.bot?.name || 'DARK BOT'],
            destination,
          });
          let intentName = result.intent;
          let confidence = result.intentConfidence;
          let details = result.intentDetails || {};
          const image = ctx.imageIntent;
          if (image?.requested && direct) {
            if (image.target === 'persona') {
              intentName = 'PHOTO_REQUEST'; confidence = 95;
              details = { ...details, photoTarget: 'persona', photoType: details.photoType || 'selfie' };
            } else if (image.target === 'content') {
              intentName = 'IMAGE_SEARCH_REQUEST'; confidence = 95;
              details = { photoTarget: 'content', query: image.query || '', searchQuery: image.searchQuery || '', gameRef: !!image.gameRef };
            } else {
              intentName = 'CLARIFY_IMAGE_REQUEST'; confidence = 80;
              details = { photoTarget: 'ambiguous' };
            }
          }
          const lower = String(t || '').toLowerCase();
          const isConversa = /\b(ver|mostra|mostrar|puxa|recupera|ve)\b.{0,16}\b(conversa|chat|historico|mensagens)\b|\b(o que|oq)\b.{0,12}\b(conversei|conversamos)\b|\b(mensagens?\s+antigas?)\b/i.test(lower);
          if (isConversa && intentName === 'GENERAL_CHAT') { intentName = 'VER_CONVERSA'; confidence = direct ? 90 : 70; }
          const directScore = direct ? Math.max(75, result.directScore || 0) : (destination.sobreMim ? 20 : Math.min(result.directScore || 0, 29));
          return {
            ...result,
            intent: intentName,
            intentConfidence: confidence,
            intentDetails: details,
            isDirectToAura: direct,
            directScore,
            isConversationBetweenOthers: isGroup && !direct,
            shouldRespond: !isGroup || direct,
            summary: `${direct ? 'DIRETO' : 'NÃO-DIRETO'} (${directScore}%) | ${intentName} (${confidence}%)`,
            type: details.photoType || 'selfie',
            isConversa,
          };
        },
      };
    } catch { return null; }
  })();
  let _pkAura = '';
  try {
    if (_perc) {
      _pkAura = _perc.chave(ctx.remoteJid, ctx.senderNumber);
      ctx._auraPk = _pkAura;
      const _semPrefixo = text && !startsWithAnyPrefix(text, prefixes);
      if (_semPrefixo) {
        if (_perc.pedeVoz(text)) { _perc.definirModoTexto(_pkAura, false); }
        else if (_perc.pedeTexto(text)) { _perc.definirModoTexto(_pkAura, true); }
      }
      // STICKER PENDENTE: a próxima foto/vídeo desta pessoa converte já.
      const _mmP = msg.message || {};
      if (_perc.temStickerPendente(_pkAura) && (_mmP.imageMessage || _mmP.videoMessage)) {
        _perc.consumirSticker(_pkAura);
        try {
          sock.sendMessage(ctx.remoteJid, { react: { text: '⏳', key: msg.key } }).catch(() => {});
          const _mh = require('./mediaHandler');
          const _bufP = await _mh.downloadFromMessage(msg).catch(() => null);
          if (_bufP && _bufP.length > 100) {
            const _mimeP = stickerMaker.detectMime ? stickerMaker.detectMime(_bufP) : 'image/jpeg';
            const _stkP = await stickerMaker.create(_bufP, {
              botName: config.bot.name, ownerName: config.owner.name,
              userName: ctx.pushName, groupName: ctx.groupName || 'PV',
              isVideo: !!_mmP.videoMessage || _mimeP === 'image/gif',
            });
            if (_stkP && _stkP.length > 50) {
              await require('./stickerPack').sendStickerWithPackLink(sock, ctx.remoteJid, _stkP, { quoted: msg });
              sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } }).catch(() => {});
              return true;
            }
          }
          throw new Error('mídia não deu para converter');
        } catch (e) {
          sock.sendMessage(ctx.remoteJid, { react: { text: '❌', key: msg.key } }).catch(() => {});
          await sock.sendMessage(ctx.remoteJid, {
            text: `😩 Não consegui transformar essa mídia em sticker — tenta responder-lhe com *${ctx.prefix || '!'}sticker*.`,
          }, { quoted: msg }).catch(() => {});
          return true;
        }
      }
    }
  } catch (e) { console.warn('[Percepção]', e.message?.slice(0, 60)); }

  // ── v7.96: VIGILANTE — ela vê tudo e conta ao Dark ──────────────────
  try {
    const vig = require('../aura/auraVigilante');
    const av = require('../aura/auraAvisos');
    if (ctx.isGroup) vig.contaMensagem(ctx.remoteJid);
    const _semP96 = text && !startsWithAnyPrefix(text, prefixes);

    // 1) Convite de grupo chegado em PV
    if (_semP96 && !ctx.isGroup) {
      const _code = vig.extrairConvite(text);
      if (_code) {
        if (isOwner) {
          // o Dark enviou o link → entra já (é ordem, não pedido).
          // v9.16: passa pelo motor — sabe a diferença entre entrou /
          // aprovação pendente / revogado / inválido (antes, undefined do
          // groupAcceptInvite era lido como falha → «link inválido»).
          let r = { ok: false, msg: 'motor indisponível' };
          try { r = await require('../aura/auraCanais').entrarPorLink(sock, text); }
          catch (e) { r = { ok: false, msg: String(e.message || e).slice(0, 80) }; }
          await sock.sendMessage(ctx.remoteJid, {
            text: r.ok ? (r.pendente ? `⏳ ${r.msg}` : `✅ ${r.msg}`) : `❌ ${r.msg}`,
          }, { quoted: msg }).catch(() => {});
          return true;
        }
        if (vig.deveEmitirConvite(_code, ctx.senderNumber)) {
          await av.avisarConvite(sock, config, { code: _code, numero: ctx.senderNumber, nome: ctx.pushName });
          await sock.sendMessage(ctx.remoteJid, { text: '💌 Encaminhei o teu convite ao Dono do bot; ele decide quando puder.' }, { quoted: msg }).catch(() => {});
        } else {
          await sock.sendMessage(ctx.remoteJid, { text: '💌 Esse convite já está com ele 🖤' }, { quoted: msg }).catch(() => {});
        }
        return true;
      }
    }

    // 2) O Dark pergunta balanços em conversa normal (PV ou grupo)
    if (_semP96 && isOwner) {
      const _q = vig.detectarPerguntaBalanço(text);
      if (_q) {
        const parte = await sock.groupFetchAllParticipating().catch(() => null);
        const gars = Object.values(parte || {}).map(g => ({ jid: g.id, subject: g.subject, size: g.participants?.length || 0 }));
        let comAluguel = [], comTrial = [];
        try {
          const GS = require('../database/models/GroupSettings');
          const agora = new Date();
          const hs = await GS.find({
            isHosted: true,
            $or: [
              { hostedUntil: null },
              { hostedUntil: { $exists: false } },
              { hostedUntil: '' },
              { hostedUntil: { $gt: agora } },
            ],
          }).lean().catch(() => []);
          comAluguel = (hs || []).map(g => g.groupJid).filter(Boolean);
          const tr = await GS.find({ isHosted: false, trialExpiresAt: { $gt: agora } }).lean().catch(() => []);
          comTrial = (tr || []).map(g => g.groupJid).filter(Boolean);
        } catch {}
        let resp = '';
        if (_q === 'geral') resp = vig.resumoGeral({ participantes: gars, comAluguel, comTrial });
        else if (_q === 'ativos' || _q === 'inativos') resp = vig.mesgGruposAtivos(gars);
        else if (_q === 'comandos') resp = vig.mesgComandosMaisUsados();
        else if (_q === 'comaluguel') resp = vig.linhasGrupos('🏠 *COM ALUGUEL ACTIVO*', comAluguel, gars);
        else if (_q === 'semaluguel') resp = vig.linhasGrupos('🧊 *SEM ALUGUEL (livres)*', gars.map(g => g.jid).filter(j => !comAluguel.includes(j)), gars);
        else if (_q === 'trial') resp = vig.linhasGrupos('🎁 *EM TRIAL*', comTrial, gars);
        if (resp) { await sock.sendMessage(ctx.remoteJid, { text: resp }, { quoted: msg }).catch(() => {}); return true; }
      }
    }

    // 3) Alguém demonstra interesse (quer alugar/VIP/procurou o Dark) em PV
    if (_semP96 && !isOwner && !ctx.isGroup) {
      const _tipo = vig.detectarInteresse(text);
      if (_tipo && vig.deveNotificarInteresse(`${_tipo}|${ctx.senderNumber}`)) {
        await av.avisarInteresse(sock, config, { tipo: _tipo, numero: ctx.senderNumber, nome: ctx.pushName, chat: 'PV', cita: text }).catch(() => {});
        if (_tipo === 'dono' && vig.perm('partilharnumero')) {
          const num = av.ownerNum(config);
          if (num) await sock.sendMessage(ctx.remoteJid, {
            contacts: {
              displayName: 'Dark (Dono do Bot)',
              contacts: [{ vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:Dark (Dono do Bot)\nTEL;type=CELL;waid=${num}:+${num}\nEND:VCARD` }],
            },
          }, { quoted: msg }).catch(() => {});
        }
        // não consome: a Aura ainda responde normalmente (vende com jeito 💛)
      }
    }
  } catch (e) { console.warn('[Vigilante]', e.message?.slice(0, 60)); }

  // v6.37: Regras de resposta por tipo de grupo
  // Grupo COM aluguel activo → responde a TODOS
  // Grupo SEM aluguel → só dono, subdono, VIP
  // Free sem trial → silêncio total
  // v7.53: groupMetadata arranca AQUI, em paralelo com as queries ao Mongo
  // da secção de aluguel (era sequencial: +60ms em cache-miss). O await
  // está abaixo, onde a meta é precisa. Com .catch + fallback intacto.
  let _gmP = null;
  if (ctx.isGroup && typeof sock?.groupMetadata === 'function') {
    _gmP = Promise.resolve().then(async () => {
      const _mc0 = groupMetaCache.get(ctx.remoteJid);
      if (_mc0 && (Date.now() - _mc0.ts) < GROUP_META_TTL) return _mc0.meta;
      const meta = await sock.groupMetadata(ctx.remoteJid);
      groupMetaCache.set(ctx.remoteJid, { meta, ts: Date.now() });
      try { require('../aura/auraIdentidade').aprenderDoGrupo(meta); } catch {}
      return meta;
    }).catch(() => null);
  }
  // ── v7.72: PREFIXO AUTO (estilo System Zero) — dizer "prefixo"/
  // "prefixos" (a palavra sozinha) mostra o cartão com botão de copiar.
  // Corre antes do gate de aluguel: é funil (info pública).
  if (!prefixInfo && !pareceComando(text) && require('./prefixCard').RE_PREFIXO_WORD.test(text || '')) {
    try {
      const pc = require('./prefixCard');
      const custom = ctx.isGroup ? await pc.isCustomGroupPrefix(msg, ctx.remoteJid) : false;
      await pc.sendPrefixCard(sock, ctx.remoteJid, { prefix, custom }, msg);
      return true;
    } catch (e) { console.warn('[Prefixo auto]', e.message?.slice(0, 60)); }
  }

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
        // v7.52: loader passa pelo hotCache → voo único partilhado com os antis
        () => require('./hotCache').getGroupDoc(msg, ctx.remoteJid)
      ).catch(() => null),
      requestCache.remember(
        requestCache.K.user(ctx.senderNumber) + ':doc',
        () => require('./hotCache').getUserDoc(msg, ctx.senderNumber)
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
        // v7.67: gate duro estilo System Zero — em grupo sem ativação SÓ
        // o funil de aluguel passa (alugar/trial/planos/paguei…); o resto
        // leva o aviso e fica bloqueado.
        let _gateOpen = false;
        try { _gateOpen = require('./cases/rental2').gateAllows(text, prefix); } catch {}
        // !onlyadm/!adm1/!soadm é uma escolha local do admin. Não activa
        // serviços nem automações; por isso continua acessível num grupo livre.
        const _onlyAdminsToggle = /^\s*(?:onlyadm|adm1|soadm)(?:\s|$)/i.test(prefixInfo?.rest || '');
        if (_gateOpen || _onlyAdminsToggle) {
          // passa — o case do funil ou a configuração local trata do resto
        } else {
          // v7.36: o aviso só faz sentido quando a pessoa TENTOU um comando.
          // Antes disparava em qualquer mensagem (conversa normal) de cada
          // membro → parecia spam e "respondia a toda a gente".
          if (prefixInfo || pareceComando(text)) await _avisoSemAluguel(sock, msg, ctx);
          return false;
        }
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
        () => require('./hotCache').getGroupDoc(msg, ctx.remoteJid) // v7.52: voo único
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

      // v7.53: veio em paralelo (ver _gmP acima); fallback intacto se falhou.
      let _metaG = _gmP ? await _gmP : null;
      if (!_metaG) {
        const cached = groupMetaCache.get(ctx.remoteJid);
        if (cached && (now - cached.ts) < GROUP_META_TTL) {
          _metaG = cached.meta;
        } else {
          _metaG = await sock.groupMetadata(ctx.remoteJid);
          groupMetaCache.set(ctx.remoteJid, { meta: _metaG, ts: now });
          try { require('../aura/auraIdentidade').aprenderDoGrupo(_metaG); } catch {}
        }
      }
      ctx.groupName = _metaG.subject;
      ctx.groupMeta = _metaG;

      ctx.blockedCommands = groupConfig.blockedCommands || [];
      // v11.2.2: blacklist POR GRUPO — silencia o membro listado
      if (!isOwner) {
        const gbl = [...(groupConfig.blacklist || []), ...(groupConfig.blockedUsers || [])]
          .map(x => String(x).replace(/\D/g, ''));
        if (gbl.includes(String(ctx.senderNumber || '').replace(/\D/g, ''))) return false;
      }
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
            for (const _vc of chunkString(_vf, 3800)) await sock.sendMessage(ctx.remoteJid, { text: _vc }, { quoted: msg });
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
  // AURA — assistente automatizada com persona goth e tom descontraído.
  // ════════════════════════════════════════════════════════════════════════
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
      const { downloadMediaMessage } = require('baileys-v6');
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

  // Ordens de controlo da AURA serão tratadas após resolver destinatário e citação.
  const botJid = sock.user?.id ? (sock.user.id.split(':')[0] + '@s.whatsapp.net') : '';
  const botLid = sock.user?.lid || '';
  const botNum = botJid.split('@')[0];
  const _identMod = require('../aura/auraIdentidade');
  const _identityResolver = { pnDoLid: _identMod.pnDoLid, lidDoPn: _identMod.lidDoPn };

  let _msgFacts = auraCompreensao.inspecionarMensagem(msg);
  // Se o quote está no cache, recupera nome/caption/tipo e confirma a origem
  // sem substituir o autor citado pelo remetente da resposta.
  try {
    if (_msgFacts.citado?.stanzaId) {
      const { messageCache } = require('./messageListener');
      _msgFacts = auraCompreensao.enrichQuotedMessage(_msgFacts, messageCache.get(_msgFacts.citado.stanzaId));
    }
  } catch {}
  ctx.messageInfo = _msgFacts;

  const allMentioned = _msgFacts.mentionedJids || [];
  const botIds = [botJid, botNum, botLid].filter(Boolean);
  const isBotMentioned = allMentioned.some(j => auraCompreensao.sameWhatsAppIdentity(j, botIds, _identityResolver));
  const _quotedParticipants = [_msgFacts.citado?.authorJid, _msgFacts.citado?.authorAltJid, _msgFacts.quotedParticipant].filter(Boolean);
  const ctxParticipant = _quotedParticipants.find(j => auraCompreensao.sameWhatsAppIdentity(j, botIds, _identityResolver)) || _quotedParticipants[0] || '';
  const isReplyToBot = !!_msgFacts.citado?.fromMe || _quotedParticipants.some(j => auraCompreensao.sameWhatsAppIdentity(j, botIds, _identityResolver)) ||
    (!!_msgFacts.contextInfo?.remoteJid && auraCompreensao.sameWhatsAppIdentity(_msgFacts.contextInfo.remoteJid, botIds, _identityResolver));
  ctx.isReplyToAura = isReplyToBot;
  ctx.isBotMentioned = isBotMentioned;

  // Destinatário determinístico: citação/menções são comparadas por PN/LID;
  // o Dono, outro participante e a AURA não são o mesmo alvo.
  const _knownNames = [config.owner?.name || ''];
  if (ctx.isGroup) {
    const _currentSenderIds = [ctx.senderJid, ctx.senderNumber, ctx.senderLid ? `${ctx.senderLid}@lid` : ''].filter(Boolean);
    try {
      const { messageCache } = require('./messageListener');
      for (const cached of messageCache.values()) {
        if (cached?.key?.remoteJid !== ctx.remoteJid || !cached.pushName || cached.key?.fromMe) continue;
        const author = cached.key?.participant || '';
        if (_currentSenderIds.length && author && auraCompreensao.sameWhatsAppIdentity(author, _currentSenderIds, _identityResolver)) continue;
        _knownNames.push(cached.pushName);
      }
    } catch {}
    try {
      const ownKey = ctx.senderNumber || (ctx.senderLid ? `lid:${ctx.senderLid}` : '');
      for (const p of _identMod.pessoasDoChat(ctx.remoteJid, 30)) {
        if (ownKey && [p.numero, p.lid ? `lid:${p.lid}` : ''].includes(ownKey)) continue;
        _knownNames.push(...(p.nomes || []));
      }
    } catch {}
  }
  const _destOptions = {
    isGroup: ctx.isGroup,
    isPrivate: !ctx.isGroup,
    messageInfo: _msgFacts,
    botNum, botJid, botLid,
    botName: config.bot?.name || 'DARK BOT',
    ownerName: config.owner?.name || 'Dark',
    ownerNumber: config.owner?.number || ownerNumDB || '',
    ownerNumbers,
    ownerLid,
    knownOtherNames: [...new Set(_knownNames)],
    identidadeResolver: _identityResolver,
  };
  ctx.dest = auraCompreensao.analisarDestinatario(text, _destOptions);
  ctx.citado = _identMod.autorCitado(msg) || ctx.citado || null;
  if (ctx.citado && _msgFacts.citado) {
    ctx.citado = { ...ctx.citado, authorName: _msgFacts.citado.authorName || ctx.citado.authorName, remoteJid: _msgFacts.citado.sourceRemoteJid || ctx.citado.remoteJid, tipo: _msgFacts.citado.tipo, media: _msgFacts.citado.media, caption: _msgFacts.citado.caption, links: _msgFacts.citado.links, encaminhamento: _msgFacts.citado.encaminhamento };
  }

  // Ordens de controlo da AURA: destinatário, menções e citação já estão
  // resolvidos. Não basta encontrar "silêncio", "voz" ou "revoltada" no texto.
  const _auraIntentPolicy = require('../aura/auraGrupo');
  const _auraIntentUniversal = require('../aura/auraUniversal');
  const _auraDirectedNow = !ctx.isGroup || _auraIntentPolicy.isDirectedToAura({
    isGroup: true, isBotMentioned, isReplyToAura: isReplyToBot, dest: ctx.dest,
  });

  // Silêncio activo: só uma ordem clara e dirigida do Dono o cancela.
  if (aura.isSilenced(ctx.senderNumber)) {
    const clearSilence = isOwner && _auraDirectedNow &&
      _auraIntentUniversal.isExplicitAuraControlCommand(text, 'resumeSilence');
    if (clearSilence) {
      aura.clearSilence(ctx.senderNumber);
      await sock.sendMessage(ctx.remoteJid, { text: 'Silêncio cancelado. A AURA volta a responder neste chat.' }, { quoted: msg });
      return true;
    }
    return false;
  }

  if (isOwner && _auraDirectedNow) {
    const t = String(text || '').toLowerCase();
    if (_auraIntentUniversal.isExplicitAuraControlCommand(text, 'silence')) {
      const sec = (t.match(/(\d+)\s*(min|seg)/) || [0, 60])[1] * (t.includes('seg') ? 1 : 60);
      aura.setSilence(ctx.senderNumber, sec || 60);
      await sock.sendMessage(ctx.remoteJid, { text: 'Entendido. A AURA ficará em silêncio durante o período configurado.' }, { quoted: msg });
      return true;
    }
    if (_auraIntentUniversal.isExplicitAuraControlCommand(text, 'moodAngry')) {
      aura.setMood('revoltada', 'ordem do Dono', ctx.remoteJid);
      await sock.sendMessage(ctx.remoteJid, { text: 'Tom de personagem alterado para mais irónico e firme.' }, { quoted: msg });
      return true;
    }
    if (_auraIntentUniversal.isExplicitAuraControlCommand(text, 'moodCalm') &&
        /revoltad|raiva|mau humor/.test(t + ' ' + (aura.getMood(ctx.remoteJid).mood || ''))) {
      aura.clearMood(ctx.remoteJid);
      await sock.sendMessage(ctx.remoteJid, { text: 'Tom de personagem restaurado para o modo normal.' }, { quoted: msg });
      return true;
    }

    // Só converte um pedido de voz explícito, dirigido e iniciado por verbo.
    const _ordemVoz = _auraIntentUniversal.isExplicitAuraControlCommand(text, 'voice');
    if (_ordemVoz) {
      try {
        const mConteudo = text.match(/\b(?:dizendo|a dizer|que diga|diga|dizer|falando|assim|isto|isso)\b[:,]?\s+([\s\S]{2,300})$/i)
          || text.match(/[:"“]\s*([^"”\n]{2,300})["”]?\s*$/);
        const textoFala = (mConteudo?.[1] || '').trim();
        if (textoFala) {
          // Pedido explícito com conteúdo: lê ESSE conteúdo.
          if (turn) turn.conversational = true;
          const buf = await require('./ai').speakWithFallback(textoFala, null, { signal: turn?.signal });
          const result = await sock.sendMessage(ctx.remoteJid,
            buf && buf.length > 500
              ? { audio: buf, mimetype: 'audio/mpeg', ptt: true }
              : { text: 'Não consegui gerar o áudio agora; envio em texto.\n\n' + textoFala },
            { quoted: msg });
          if (!result?.suppressed && typeof AiMemory.appendMessage === 'function') {
            const contextId = ctx.isGroup ? ctx.remoteJid : null;
            await AiMemory.appendMessage(ctx.senderNumber, contextId, 'user', text).catch(() => {});
            await AiMemory.appendMessage(ctx.senderNumber, contextId, 'assistant', textoFala).catch(() => {});
          }
          return true;
        }
      } catch (e) {
        if (turn?.signal?.aborted || require('./aiCancellation').isAbort(e)) return true;
        console.warn('[Aura voz-directa]', e.message?.slice(0, 60));
      }
    }

    if (_auraIntentUniversal.isExplicitAuraControlCommand(text, 'sing')) {
      const temaMusica = text.replace(/^\s*(?:aura[,\s]*)?(?:canta|cantar|cante|sing)\b/i, '').trim();
      const respostaCanto = temaMusica
        ? 'Posso escrever uma rima curta sobre esse tema, mas não produzo canto melódico em áudio.'
        : 'Não produzo canto melódico em áudio, mas posso escrever uma rima ou ajudar a encontrar uma música.';
      await sock.sendMessage(ctx.remoteJid, { text: respostaCanto }, { quoted: msg });
      return true;
    }
    if (_auraIntentUniversal.isExplicitAuraControlCommand(text, 'whisper')) {
      const sussurro = text.replace(/^\s*(?:aura[,\s]*)?(?:sussurra|sussurrar|whisper)\b/i, '').trim();
      await sock.sendMessage(ctx.remoteJid, {
        text: sussurro ? `🤫 AURA, por texto: ${sussurro}` : 'Não consigo sussurrar em áudio neste momento, mas posso responder por texto.',
      }, { quoted: msg });
      return true;
    }
    if (_auraIntentUniversal.isExplicitAuraControlCommand(text, 'laugh')) {
      const ri = ['_ri_ 😂', '_ri muito_ 🤣🤣🤣', '_gargalha_ 😂😂😂'];
      await sock.sendMessage(ctx.remoteJid, { text: ri[Math.floor(Math.random() * ri.length)] }, { quoted: msg });
      return true;
    }
  }

  // Um PTT enviado no PV é dirigido ao bot; em grupo, só o transcrevemos
  // quando a mensagem @menciona ou responde à AURA. Assim a voz participa
  // na detecção de intenção sem transformar áudios entre membros em ordens.
  let _voiceTranscript = '';
  const _audioEarly = msg.message?.audioMessage || (msg.message?.documentMessage && /^audio\//i.test(msg.message.documentMessage.mimetype || '') ? msg.message.documentMessage : null);
  let _audioConversationActive = false;
  if (ctx.isGroup && !isBotMentioned && !isReplyToBot) {
    try { _audioConversationActive = require('../aura/auraTalk').estaAFalar(ctx.remoteJid, ctx.senderNumber); } catch {}
  }
  if (!msg.key?.fromMe && _audioEarly && (!ctx.isGroup || isBotMentioned || isReplyToBot || _audioConversationActive)) {
    try {
      const { downloadMediaMessage } = require('baileys-v6');
      const _audioBuf = await downloadMediaMessage(msg, 'buffer', {});
      if (_audioBuf && _audioBuf.length > 500) {
        _voiceTranscript = String(await ai.transcribeAudio(_audioBuf, 'pt') || '').trim();
        if (_voiceTranscript) {
          const _textBeforeTranscript = text;
          ctx.audioTranscription = _voiceTranscript;
          ctx.transcribedOnly = !_textBeforeTranscript;
          text = _textBeforeTranscript ? `${_textBeforeTranscript} ${_voiceTranscript}` : _voiceTranscript;
          ctx.messageInfo = { ..._msgFacts, transcription: _voiceTranscript };
          if (!_textBeforeTranscript && ctx.identidade) {
            try { _identMod.registar(ctx.remoteJid, ctx.identidade, _voiceTranscript, { respondeuANumero: ctx.citado?.numero || null, ts: Date.now() }); } catch {}
          }
          ctx.dest = auraCompreensao.analisarDestinatario(text, { ..._destOptions, messageInfo: ctx.messageInfo });
        }
      }
    } catch (e) { console.warn('[Aura audio early]', String(e.message || e).slice(0, 60)); }
  }

  let _recentMessages = [];
  try {
    const { messageCache } = require('./messageListener');
    _recentMessages = auraCompreensao.mensagensDaConversa(messageCache, ctx.remoteJid, {
      limit: 16, excludeId: msg?.key?.id || '',
    });
  } catch {}
  const _recentTexts = _recentMessages.map(m => m.texto).filter(Boolean);
  ctx.recentMessages = _recentMessages;
  ctx.recentContext = auraCompreensao.formatRecentMessages(_recentMessages, { botJids: botIds });
  ctx.messageInfo = { ..._msgFacts, transcription: _voiceTranscript || '' };
  const _quotedImageContext = _msgFacts.citado?.texto || _msgFacts.citado?.caption || '';
  const _imageIntentFromCache = auraCompreensao.interpretarPedidoImagem({
    texto: text, quotedText: _quotedImageContext, recentMessages: _recentMessages,
    isDirectToAura: !!ctx.dest?.directToAura,
  });
  let _imageHistory = [];
  if (_imageIntentFromCache?.requested && (!ctx.isGroup || ctx.dest?.directToAura) &&
      /\b(jogo|game|jogando|jogar|partida)\b/i.test(text) &&
      (!_imageIntentFromCache.query || _imageIntentFromCache.target === 'ambiguous')) {
    try {
      const memImage = await AiMemory.getOrCreate(ctx.senderNumber, ctx.isGroup ? ctx.remoteJid : null);
      _imageHistory = memImage?.getContextWindow?.(16) || [];
    } catch {}
  }
  ctx.imageIntent = auraCompreensao.interpretarPedidoImagem({
    texto: text, quotedText: _quotedImageContext, recentMessages: _recentMessages,
    historyArray: _imageHistory,
    isDirectToAura: !!ctx.dest?.directToAura,
  });

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
    const grupoPolicy = require('../aura/auraGrupo');
    const auraCmdText = text.toLowerCase().trim();
    // Uma ordem de marcação total é auto-contida e inequívoca. Para admin/Dono,
    // ela vale como instrução directa mesmo sem repetir "AURA"; não abrimos a
    // excepção para acções ambíguas ou destrutivas.
    const explicitTagAll = /^(?:marca todos|tag all|chama todos|marca todo mundo|atenção todos|(?:marca|marcar|menciona|mencionar|chama|chamar)\s+(?:eles(?:\s+a[ií])?|elas(?:\s+a[ií])?|a[ií]|o pessoal|a galera|geral))(?:\s|$)/i.test(auraCmdText);
    const actionDirectedToAura = grupoPolicy.isDirectedToAura({
      isGroup: true,
      isBotMentioned,
      isReplyToAura: isReplyToBot,
      dest: ctx.dest,
    }) || explicitTagAll;
    const auraCandidate = actionDirectedToAura
      ? auraCmdText
          .replace(/^(?:aura|a aura|da aura|pra aura|com a aura)[\s,:;]*\s*/i, '')
          .replace(/^(?:por favor|please)[\s,:;]+/i, '')
          .replace(/[.!?]+\s*$/, '')
          .trim()
      : '';
    const auraClean = grupoPolicy.isClearActionText(auraCandidate) ? auraCandidate : '';
    const directGroupAction = grupoPolicy.detectarAcaoDireta(auraClean);

    // Promote/demote REAL — antes das regex estreitas. "me adiciona
    // com ADM" / "quero ser ADM" / "agora adiciona" não pode virar conversa.
    if (auraClean.length > 2) {
      try {
        const grupo = grupoPolicy;
        const actor = ctx.senderNumber || ctx.senderJid || ctx.senderLid || '';
        const pedidoG = grupo.detectarPedidoGrupo(auraClean, {
          pendente: grupo.verPendente(ctx.remoteJid, actor),
          hasMention: allMentioned.length > 0,
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
      
      if (directGroupAction === 'fechar_grupo') {
        auraAction = async () => {
          await sock.groupSettingUpdate(ctx.remoteJid, 'announcement');
          await sock.sendMessage(ctx.remoteJid, { text: '🔒 *Grupo fechado.* Só admins podem enviar agora.' }, { quoted: msg });
        };
      }
      else if (directGroupAction === 'abrir_grupo') {
        auraAction = async () => {
          await sock.groupSettingUpdate(ctx.remoteJid, 'not_announcement');
          await sock.sendMessage(ctx.remoteJid, { text: '🔓 *Grupo aberto.* Todos podem enviar mensagens.' }, { quoted: msg });
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
      // "Marca eles aí" é uma ordem natural para mencionar quem está neste
      // grupo. Como o bloco só roda para Dono/ADM, é seguro tratá-la como
      // tagall — antes ela caía na conversa genérica “Hmm, entendi”.
      else if (/^(marca todos|tag all|chama todos|marca todo mundo|atenção todos|(?:marca|marcar|menciona|mencionar|chama|chamar)\s+(?:eles(?:\s+a[ií])?|elas(?:\s+a[ií])?|a[ií]|o pessoal|a galera|geral))(?:\s|$)/i.test(auraClean)) {
        auraAction = async () => {
          const meta = ctx.groupMeta || await sock.groupMetadata(ctx.remoteJid);
          const bNum = String(sock.user?.id || '').split(':')[0].split('@')[0];
          const parts = meta.participants.filter(p => p.id.split('@')[0] !== bNum);
          const mentions = parts.map(p => p.id);
          const txtMsg = auraClean.replace(/^(marca todos|tag all|chama todos|marca todo mundo|atenção todos|(?:marca|marcar|menciona|mencionar|chama|chamar)\s+(?:eles(?:\s+a[ií])?|elas(?:\s+a[ií])?|a[ií]|o pessoal|a galera|geral))\s*/i, '').trim() || '📢 Atenção!';
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
      else if (directGroupAction === 'chamar_pv') {
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
            ? 'Recebi o teu pedido para continuar a conversa no PV. Sou a AURA, assistente automatizada do DARK BOT. Em que posso ajudar?'
            : `A AURA, assistente automatizada do DARK BOT, enviou esta mensagem a pedido de ${ctx.pushName}.`;
          await sock.sendMessage(pvJid, { text: pvMsg });
          await sock.sendMessage(ctx.remoteJid, { text: '📩 Enviei uma mensagem da AURA para o teu PV.' }, { quoted: msg });
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
          try { require('./centralBase').marcarGrupoInativo(ctx.remoteJid); } catch {}
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

  // A chamada pelo nome é validada pelo analisador de destinatário abaixo;
  // referências em 3.ª pessoa e "aura" como gíria não são invocações.
  // v12.9.1: mensagem é claramente um COMANDO (símbolo + palavra conhecida)?
  // ex.: "@cap login 123", "!ping", "/menu" — a Aura NÃO entra nisto.
  // ── v12.9.3: QUALQUER prefixo + palavra = COMANDO de algum bot → Aura cala ──
  // ".ping" ",ping" "/ping" "@cap" "©cap" "!play" "#menu"… nenhum bot de WhatsApp
  // usa prefixo sem estar colado a um comando. A Aura NÃO entra nisso — nem se
  // o comando não for dela (pode ser de OUTRO bot no grupo, ex: ,ping de outro).
  // Excepção única: @NomeCapitalizado seguido de frase = menção a CONTACTO humano
  // (ex: "@Maria oi tudo bem?") — aí a Aura pode (se estiver acordada).
  const _cmdLike = (() => {
    const t = String(text || '').trim();
    const m = /^([@!#$&*+~^|=;°ºª\/©®™·•‣§¶¤.,-])([a-zA-Z][\w-]{0,24})(\s|$|\n)/.exec(t);
    if (!m) return false;
    const simbolo = m[1], palavra = m[2];
    // prefixo REAL deste chat → é comando do NOSSO bot, com certeza
    if (prefixes.some((pp) => pp === simbolo || (pp && pp[0] === simbolo))) return true;
    // @Nome capitalizado + resto conversacional → menção a humano, NÃO é comando
    if (simbolo === '@' && /^[A-Z][a-zà-ú]/.test(palavra)) {
      const resto = t.slice(m[0].length).trim();
      // "@Maria" seco (só tag) ou frase de conversa → não é comando
      if (!resto || /\s/.test(t.slice(m[0].length - 1))) return false;
    }
    // símbolo de OUTRO bot + palavra (conhecida ou não) → comando de terceiros, Aura cala
    // (só escapa se for @ e passar no teste de menção acima)
    return true;
  })();
  // Usa o analisador de destinatário em vez de tratar qualquer ocorrência
  // da palavra "aura" como vocativo ("aura é fixe" é 3.ª pessoa/gíria).
  const isAuraTrigger = !startsWithAnyPrefix(text, prefixes) && !_cmdLike && (
    isBotMentioned || isReplyToBot || !!ctx.dest?.vocativo ||
    (ctx.isGroup && !!ctx.dest?.directToAura)
  );

  // ── v12.9.9: "prefixo" em TEXTO PURO → card na hora, SEM depender da
  // Aura/IA (roda antes de qualquer gate de IA; funciona com a Aura
  // dormida, sem chaves, em PV e em grupos).
  try {
    const _tPre = String(text || '').toLowerCase().trim();
    if (text && !prefixInfo && !startsWithAnyPrefix(text, prefixes) &&
        (/^(meu |o |qual (é |e |o )?)?(prefixo|prefixos|getprefix)[?!.]*$/.test(_tPre) ||
         /^qual (é |e )?o (meu )?prefixo[?!.]*$/.test(_tPre))) {
      const pcPre = require('./prefixCard');
      const customPre = ctx.isGroup ? await pcPre.isCustomGroupPrefix(msg, ctx.remoteJid) : false;
      await pcPre.sendPrefixCard(sock, ctx.remoteJid, { prefix, custom: customPre }, msg);
      return true;
    }
  } catch (ePre) { console.warn('[prefixo texto]', ePre.message?.slice(0, 60)); }

  const replyHasText = isReplyToBot && text.length > 0;
  const replyHasMedia = isReplyToBot && !!(msg.message?.imageMessage || msg.message?.videoMessage || msg.message?.audioMessage || msg.message?.stickerMessage);
  const mentionedWithMedia = isBotMentioned && !!(msg.message?.imageMessage || msg.message?.videoMessage || msg.message?.audioMessage || msg.message?.stickerMessage);

  const aiAutoOn = aiAutoOnValue;  // v6.45: já lido no Promise.all acima
  // O PV deve continuar a responder mesmo que o toggle de IA de grupos
  // esteja desligado. Antes um ai_auto_enabled=false silenciava a AURA
  // também no privado, embora o PV fosse anunciado como sempre ativo.
  const _autoIA = aiAutoOn === true || aiAutoOn === 'true' || aiAutoOn === 'on' || aiAutoOn === 1 || aiAutoOn === '1';

  // ── v6.43: modo do chat (AURA acordada vs assistente profissional) ──
  const _auraModes = require('../aura/auraModes');
  const _auraAwakeHere = await _auraModes.isAuraAwake(ctx.remoteJid, { isGroup: ctx.isGroup })
    .catch(() => false);

  // O toggle de iniciativa automática não pode calar atendimento solicitado.
  // Equivalente ao PV quando o grupo está acordado e há nome/reply/conversa/convite.
  // Dormir, bloqueios de utilizador/grupo e aluguer mantêm os seus gates.
  const _atendimentoPedido = _auraAwakeHere && (
    isAuraTrigger || isBotMentioned || isReplyToBot ||
    require('../aura/auraTalk').estaAFalar(ctx.remoteJid, ctx.senderNumber) ||
    require('../aura/auraContextual').activa(ctx.remoteJid)
  );
  const aiActive = !ctx.isGroup || _autoIA || _atendimentoPedido;

  // Contexto/resumos/verificação têm um caminho de leitura, sem executar acções da IA.
  if (aiActive && (!ctx.isGroup || _auraAwakeHere) && text && !prefixInfo && !pareceComando(text)) {
    try {
      if (await require('../aura/auraContextual').tratar({
        sock, msg, ctx, texto: text, isOwner,
        dirigida: isAuraTrigger || isBotMentioned || isReplyToBot,
      })) return true;
    } catch (e) {
      // Nunca deixa um pedido de resumo/verificação cair no executor de comandos.
      if (require('../aura/auraContextual').pedido(text)) {
        await sock.sendMessage(ctx.remoteJid, { text: 'Não consegui concluir esse pedido agora. Tenta novamente.' }, { quoted: msg });
        return true;
      }
    }
  }

  // v7.40: acordar/dormir/estado da AURA por CONVERSA ("aura acorda aqui",
  // "aura dorme", "aura estás acordada?"). Substitui os cases .aura/.aurasai/
  // .auramodo/.auragrupos, removidos. Só o dono; os outros seguem normal.
  if (isOwner && text && !startsWithAnyPrefix(text, prefixes)) {
    try {
      if (await require('../aura/auraUniversal').gerirPresenca({
        sock, msg, ctx, texto: text, isOwner,
        isBotMentioned, isReplyToAura: isReplyToBot,
      })) return true;
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
  // continua a decidir o REGISTO (persona AURA goth vs assistente sóbrio),
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
        if (!r.ok) {
          await sock.sendMessage(ctx.remoteJid, { text: 'Não consegui activar o modo AURA neste grupo. Tenta novamente.' }, { quoted: msg });
          return true;
        }
        const resposta = r.already
          ? _intent.pick(_intent.WAKE_ALREADY)
          : _intent.pick(_intent.WAKE_REPLIES);
        await sock.sendMessage(ctx.remoteJid, { react: { text: '🌹', key: msg.key } }).catch(() => {});
        await sock.sendMessage(ctx.remoteJid, { text: resposta }, { quoted: msg });
        return true;
      }

      if (intencao === _intent.INTENT_SLEEP) {
        const r = await _auraModes.dismissAura(ctx.remoteJid);
        if (!r.ok) {
          await sock.sendMessage(ctx.remoteJid, { text: 'Não consegui activar o modo Assistente neste grupo. Tenta novamente.' }, { quoted: msg });
          return true;
        }
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
            ? 'O modo AURA está activo neste grupo. O que precisas?'
            : 'Este grupo está em modo Assistente. O Dono pode activar a persona AURA se quiser.'
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
  // v6.67: PV DE TODOS — no privado a AURA pode responder a qualquer pessoa,
  // não só ao Dono. Em grupos mantêm-se as regras de menção/trigger para
  // evitar respostas não solicitadas e reduzir ruído.
  const isPv = !ctx.isGroup && !ctx.isChannel && !ctx.isStatus && (ctx.remoteJid?.endsWith('@s.whatsapp.net') || !ctx.remoteJid?.includes('@'));
  // v6.69: no PV o Dono é sempre ouvido (não depende do modo do chat);
  // em grupo mantém-se a regra de só onde ela está acordada, senão o
  // bot respondia a tudo o que ele escreve em grupos alheios.
  // v7.25: comandos (qualquer prefixo) NÃO são conversa — a AURA ficava
  // a responder a "!menu"/"$play"/".saldo" quando o prefixo usado não era
  // o activo (prefixEngine devolve null e o gate deixava passar).
  const _pareceCmd = !prefixInfo && pareceComando(text);
  const isOwnerFreeText = isOwner && !prefixInfo && !_pareceCmd && (text.length > 0 || hasIncomingMedia) && isPv;
  const pvDeTodos = isPv && !prefixInfo && !_pareceCmd && (text.length > 0 || hasIncomingMedia);
  let grupoAFalar = false;
  try {
    const talk = require('../aura/auraTalk');
    if (ctx.isGroup && _auraAwakeHere && talk.estaAFalar(ctx.remoteJid, ctx.senderNumber) && !prefixInfo && !_pareceCmd) {
      grupoAFalar = true;
    }
    if (isAuraTrigger || isReplyToBot || isBotMentioned) talk.marcarFala(ctx.remoteJid, ctx.senderNumber);
  } catch {}
  const _citContextual = require('../aura/auraHistorico').citado(msg);
  const _respostaAOutro = !!(ctx.isGroup && (ctx.dest?.replyToOther || (_citContextual?.jid && !isReplyToBot)));
  let _interacaoConvidada = false;
  if (aiActive && ctx.isGroup && _auraAwakeHere && !prefixInfo && !_pareceCmd) {
    const bm = require('../aura/auraBrain');
    const modos = bm.modos(ctx.remoteJid);
    if (!modos.mudo && !modos.soDono && !bm.estaIgnorado(ctx.remoteJid, ctx.senderNumber)) {
      _interacaoConvidada = require('../aura/auraContextual').reservarInteracao({
        jid: ctx.remoteJid, texto: text, respostaAOutro: _respostaAOutro,
      });
    }
  }
  const _dirigidaContextual = isBotMentioned || isAuraTrigger || isReplyToBot;
  const _forcarContextual = () => require('../aura/auraVontade').forcarRespostaDirecta({
    isGroup: ctx.isGroup, dirigida: _dirigidaContextual,
    emConversa: (grupoAFalar && !_respostaAOutro) || _interacaoConvidada,
    sat: require('../aura/auraVontade').saturacao(ctx.remoteJid, ctx.senderNumber),
  });
  // ── v12.0 AURA INTENT — decode user requests with confidence ──
  let _superIntent = null;
  let _isConversationBetweenOthers = false;
  try {
    if (_auraSuperIntent && text) {
      _superIntent = _auraSuperIntent.analyzeIntent(text, {
        isGroup: ctx.isGroup,
        isPrivate: isPv,
        isOwner,
        isReplyToAura: isReplyToBot,
        isBotMentioned,
        isAuraTrigger: auraTriggerActive,
        mentionedJids: allMentioned || [],
        quotedParticipant: ctxParticipant || '',
        pushName: ctx.pushName,
        botNum,
        botLid,
        remoteJid: ctx.remoteJid,
        senderNumber: ctx.senderNumber,
        isMedia: !!(msg.message?.imageMessage || msg.message?.videoMessage || msg.message?.audioMessage || msg.message?.stickerMessage),
      });
      ctx._superIntent = _superIntent;
      _isConversationBetweenOthers = _superIntent.isConversationBetweenOthers || _superIntent.intent === 'CONVERSATION_BETWEEN_OTHERS';
      // If it's clearly conversation between others with low direct score, don't reply
      if (_isConversationBetweenOthers && _superIntent.directScore < 20 && !isOwnerFreeText && !pvDeTodos) {
        console.log('[SuperIntent] Ignorando conversa entre outros:', _superIntent.summary);
      }
      // Photo request detection with high confidence
      if (_superIntent.intent === 'PHOTO_REQUEST' && _superIntent.intentConfidence >= 60) {
        ctx._photoIntent = _superIntent;
      }
    }
  } catch (e) { console.warn('[SuperIntent]', e.message?.slice(0,60)); }

  const _auraMayReplyRaw = isBotMentioned || replyHasText || replyHasMedia || mentionedWithMedia || auraTriggerActive || isOwnerFreeText || pvDeTodos || grupoAFalar || _interacaoConvidada;
  // Superintelligent gate: if superIntent says it's conversation between others and not direct, block
  let _auraMayReply = _auraMayReplyRaw;
  if (_superIntent) {
    if (_isConversationBetweenOthers && !_superIntent.isDirectToAura && !isOwner) {
      // In group, if directScore < 30 and it's conversation between others, silence
      if (_superIntent.directScore < 30 && ctx.isGroup) {
        _auraMayReply = false;
      }
    }
    // If directScore >= 50, force reply even if other gates said no (except blocked)
    if (_superIntent.isDirectToAura && _superIntent.directScore >= 70) {
      _auraMayReply = true;
    }
    // Owner always direct in PV or when mentioning (MAS NUNCA para comandos)
    if (isOwner && isPv && !_pareceCmd && _superIntent.directScore >= 20) {
      _auraMayReply = true;
    }
  }
  // v12.9.15: Comandos ou mensagens que começam com prefixo de comando NUNCA são conversa da Aura
  if (_pareceCmd || prefixInfo) {
    _auraMayReply = false;
  }
  // Log for debugging
  if (_superIntent && _superIntent.isDirectToAura) {
    console.log('[SuperIntent] Direct to Aura:', _superIntent.directScore, _superIntent.intent, _superIntent.summary);
  }
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
    const _sockAntesAura = sock;
    let _historyActive = false;
    const _rememberSent = async text => {
      if (_historyActive && typeof AiMemory.appendMessage === 'function')
        await AiMemory.appendMessage(ctx.senderNumber, ctx.isGroup ? ctx.remoteJid : null, 'assistant', text);
    };
    const _auraEntrega = require('../aura/auraDelivery').acompanhar(sock, {
      onResponse: async content => { if (content.text) await _rememberSent(content.text); },
    });
    sock = _auraEntrega.sock;
    try {
      let cleanText = text.replace(/@[0-9]+/g, '').replace(new RegExp('@' + botNum, 'g'), '').trim();
      try {
        const assunto = require('../aura/auraAssunto');
        assunto.actualizar(ctx.remoteJid, cleanText, { groupName: ctx.groupName });
        cleanText = assunto.resolver(cleanText, ctx.remoteJid, { groupName: ctx.groupName });
      } catch {}

      // ── v6.56: ELA DECIDE SE RESPONDE ────────────────────────
      // Evita respostas não solicitadas a todas as mensagens do grupo,
      // reduzindo ruído e interrupções; não tenta ocultar a automação.
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
          const _destinadaAura = !ctx.isGroup || !!ctx.dest?.directToAura;
          if (M.reagirTudo && _destinadaAura && !M.semReagir && Math.random() < 0.35) {
            setTimeout(() => {
              sock.sendMessage(ctx.remoteJid, {
                react: { text: chooseAuraReaction(text, ctx), key: msg.key },
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

          // v7.83: DESTINATÁRIO — quem fala com quem (paraMim/sobreMim/menções/resposta).
          if (!ctx.dest) {
            try {
              const DD = require('../aura/auraDestinatario');
              const _botName = String(config?.bot?.name || '').toLowerCase().trim();
              ctx.dest = DD.analisar({
                texto: text,
                mentionedJid: allMentioned || [],
                quotedParticipant: ctxParticipant || '',
                quotedTexto: (require('../aura/auraIdentidade').autorCitado(msg)?.texto || ''),
                botNum, botLid,
                tambemEu: _botName.length > 3 ? [_botName] : [],
                resolverNome: (j) => { try { return require('../aura/auraHistorico').nomeDoJid(j, ctx.remoteJid); } catch { return null; } },
              });
            } catch { ctx.dest = null; }
          }
          const d = decide.deveResponder({
            texto: text,
            respostaAOutro: _respostaAOutro,
            interacaoConvidada: _interacaoConvidada,
            isOwner,
            isGroup: ctx.isGroup,
            mencionada: isBotMentioned || isAuraTrigger,
            respostaAoBot: isReplyToBot,
            temMedia: !!(msg.message?.imageMessage || msg.message?.videoMessage || msg.message?.audioMessage || msg.message?.stickerMessage || getQuotedMessage(msg)?.stickerMessage),
            pessoasNoGrupo: nPessoas,
            msgsDesdeUltima: _msgsDesdeAura(ctx.remoteJid),
            senderNumber: ctx.senderNumber,
            remoteJid: ctx.remoteJid,
            dest: ctx.dest || null, // v7.83
          });
          ctx._tomLeve = !!d.leve; // v7.83: falam DELA (indirecto) → resposta leve

          // Consentimento de mídia: uma figurinha/foto/vídeo/documento solto
          // não é uma pergunta. Não acorda a AURA, não activa conversa nem
          // deixa uma descrição automática entrar no histórico/memória.
          const _msgMedia = msg.message || {};
          const _quotedMedia = getQuotedMessage(msg) || {};
          const _passiveMediaType = _msgMedia.imageMessage || _quotedMedia.imageMessage ? 'imagem'
            : _msgMedia.videoMessage || _quotedMedia.videoMessage ? 'video'
              : _msgMedia.stickerMessage || _quotedMedia.stickerMessage ? 'sticker'
                : _msgMedia.documentMessage || _quotedMedia.documentMessage ? 'documento' : '';
          const _passiveText = String(cleanText || text || '').trim();
          if (d.responde && _passiveMediaType && !_passiveText) {
            _contaMsg(ctx.remoteJid);
            return false;
          }

          // v7.40: sticker solto em grupo não puxa resposta (nem do Dark).
          // A menção/citação, por si, também não autoriza descrever o sticker:
          // só um pedido escrito de análise o fará no bloco de mídia abaixo.
          if (d.responde && ctx.isGroup && _msgMedia.stickerMessage && !isBotMentioned && !isReplyToBot) {
            const pol = require('../aura/auraUniversal').politicaSticker({ isGroup: true, isReplyToBot, mencionada: isBotMentioned, isOwner });
            if (!pol.responde) {
              if (pol.reagir) sock.sendMessage(ctx.remoteJid, { react: { text: chooseAuraReaction('sticker', ctx), key: msg.key } }).catch(() => {});
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
              // A vontade própria nunca ignora o Dono. Para os demais, PV e
              // conversa explicitamente dirigida também continuam respondíveis.
              if (!q.responde && !isOwner && !_forcarContextual() && !vont.forcarRespostaPV({ isOwner, isGroup: ctx.isGroup, sat: vont.saturacao(ctx.remoteJid, ctx.senderNumber) })) {
                if (q.reagir) sock.sendMessage(ctx.remoteJid, { react: { text: q.reagir, key: msg.key } }).catch(() => {});
                _contaMsg(ctx.remoteJid);
                return false;
              }
            } catch {}
          }

          if (!d.responde) {
            // Silêncio real: não envia texto nem reacção quando a análise
            // conclui que a mensagem não lhe foi dirigida.
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

      // Também no modo Assistente: anexo visual sozinho não inicia conversa.
      // Isto impede leitura/descrição automática fora do modo AURA acordado.
      const _silentMedia = msg.message?.imageMessage || msg.message?.videoMessage || msg.message?.stickerMessage || msg.message?.documentMessage || getQuotedMessage(msg)?.stickerMessage;
      if (_silentMedia && !String(cleanText || text || '').trim()) {
        _contaMsg(ctx.remoteJid);
        return false;
      }
      const hasMedia = !!(msg.message?.imageMessage || msg.message?.videoMessage || msg.message?.audioMessage || msg.message?.stickerMessage || getQuotedMessage(msg)?.stickerMessage);
      if (!isReplyToBot && !auraTriggerActive && !isOwnerFreeText && cleanText.length < 2 && !hasMedia) return false;

      // ── v7.95: PERCEPÇÃO — respostas sociais determinísticas (1 só mensagem) ──
      if (_perc && cleanText && !startsWithAnyPrefix(cleanText, prefixes)) {
        try {
          // «qual é o meu @?» / «diz o meu @» — responde o número real + menção
          if (_perc.perguntaMeuArroba(cleanText)) {
            const _numP = String(ctx.senderNumber || '').split('@')[0];
            if (_numP) {
              await sock.sendMessage(ctx.remoteJid, {
                text: `O teu @ é @${_numP} 📱💕`,
                mentions: [`${_numP}@s.whatsapp.net`],
              }, { quoted: msg }).catch(() => {});
              return true;
            }
          }
          // «representa-me num sticker» / «transforma-me em figurinha»
          if (_perc.pedidoStickerProprio(cleanText)) {
            const _mmS = msg.message || {};
            const _qS = getQuotedMessage(msg) || {};
            const _mS = (_mmS.imageMessage || _mmS.videoMessage) ? msg
              : (_qS.imageMessage || _qS.videoMessage) ? { message: _qS } : null;
            if (_mS) {
              // pediu com a mídia junta/citada → converte já
              try {
                sock.sendMessage(ctx.remoteJid, { react: { text: '⏳', key: msg.key } }).catch(() => {});
                const _mhS = require('./mediaHandler');
                const _bufS = await _mhS.downloadFromMessage(_mS).catch(() => null);
                if (_bufS && _bufS.length > 100) {
                  const _mimeS = stickerMaker.detectMime ? stickerMaker.detectMime(_bufS) : 'image/jpeg';
                  const _stkS = await stickerMaker.create(_bufS, {
                    botName: config.bot.name, ownerName: config.owner.name,
                    userName: ctx.pushName, groupName: ctx.groupName || 'PV',
                    isVideo: !!(_mS.message?.videoMessage) || _mimeS === 'image/gif',
                  });
                  if (_stkS && _stkS.length > 50) {
                    await require('./stickerPack').sendStickerWithPackLink(sock, ctx.remoteJid, _stkS, { quoted: msg });
                    sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } }).catch(() => {});
                    return true;
                  }
                }
              } catch (e) { console.warn('[Aura sticker-mim]', e.message?.slice(0, 60)); }
              // caiu: age como se fosse pedido sem mídia
            }
            // sem mídia: marca a intenção — a PRÓXIMA foto/vídeo converte
            _perc.marcarStickerPendente(_pkAura || _perc.chave(ctx.remoteJid, ctx.senderNumber));
            await sock.sendMessage(ctx.remoteJid, {
              text: `Manda a foto/vídeo nos próximos 2 minutos que eu transformo já em sticker pra ti 💕`,
            }, { quoted: msg }).catch(() => {});
            return true;
          }
        } catch (e) { console.warn('[Percepção social]', e.message?.slice(0, 60)); }
      }

      const _literalGreeting = require('../aura/auraDialogue').literalGreeting(cleanText);
      let prompt = cleanText;
      if (!prompt || prompt.length < 1) {
        if (isReplyToBot) prompt = '[Alguém respondeu à tua mensagem sem texto — reage de forma natural e breve, no teu estilo de assistente virtual]';
        else if (auraTriggerActive) prompt = 'Alguém chamou o teu nome. Responde naturalmente.';
        else if (isOwnerFreeText) prompt = '[O Dark escreveu: "' + cleanText + '" — Responde naturalmente no teu estilo de assistente virtual descontraída. Podes concordar, discordar, brincar, perguntar ou opinar conforme o contexto, sem fingir ser humana.]';
        else prompt = 'Olá!';
      }

      // Verifica se é VIP
      const userForPriority = user || await requestCache.remember(
        requestCache.K.user(ctx.senderNumber) + ':doc',
        () => userManager.identifyByWhatsApp(ctx.senderNumber, ctx.pushName)
      ).catch(() => null);
      const isVip = !!(userForPriority?.isPremium && userForPriority.isPremium());
      const isPriority = isOwner || isVip;

      // Contexto recente, por chat e com rótulos de autor/tipo. Inclui
      // mensagens anteriores da AURA (para resolver "o jogo que estás a jogar")
      // e citações com autor/origem/mídia, também quando chegam num PV.
      let groupContext = '';
      try {
        if (ctx.isGroup) {
          let identityLines = [];
          try { identityLines = require('../aura/auraIdentidade').contextoGrupoComNumeros(ctx.remoteJid, 10); } catch {}
          groupContext = `Grupo "${ctx.groupName || 'grupo'}" — mensagens recentes verificadas (AURA/BOT = mensagem enviada pelo assistente):\n`;
          if (identityLines.length) groupContext += `Identidades conhecidas no grupo ([número|nome]):\n${identityLines.join('\n')}\n`;
          groupContext += `${ctx.recentContext || '(sem histórico recente disponível)'}\n`;
        } else {
          groupContext = `PV com ${ctx.identidade?.rotulo || ctx.pushName || 'utilizador'}`;
          if (ctx.recentContext) groupContext += `\nMensagens recentes deste PV:\n${ctx.recentContext}`;
        }
        const quoteBlock = auraCompreensao.blocoCitacao(ctx.messageInfo);
        if (quoteBlock) groupContext += `\n${quoteBlock}\n`;
      } catch {}

      // Histórico de conversa
      let historyArray = [];
      try {
        const mem = await AiMemory.getOrCreate(ctx.senderNumber, ctx.isGroup ? ctx.remoteJid : null);
        historyArray = mem.getContextWindow(16);
        // v7.28: linha do histórico com número+nome ("[+244…|Nome]: …")
        await AiMemory.appendMessage(ctx.senderNumber, ctx.isGroup ? ctx.remoteJid : null, 'user', ctx.identidade
          ? require('../aura/auraIdentidade').linhaHistorico(ctx.identidade, prompt)
          : `[${ctx.pushName}]: ${prompt}`);
        _historyActive = true;
      } catch (e) { console.warn('[Aura memória] Histórico indisponível:', e?.name || 'Error'); }


      // Contexto de mídia — a Aura vê/ouve tudo v12.2: view-once + reconhecimento + reações
      let mediaContext = '';
      let _resumoMidia = '';
      let isAudio = false, isImage = false, isVideo = false, isSticker = false;
      let stickerVision = null;
      let _isViewOnce = false;
      const msgObj = msg.message;
      const quotedObj = getQuotedMessage(msg);
      const mediaConsent = require('../aura/auraMediaConsent');
      const mediaRequestText = String(cleanText || text || '');
      const allowImageAnalysis = !!msgObj?.imageMessage && mediaConsent.pediuAnaliseDeMidia({ texto: mediaRequestText, tipo: 'imagem' });
      const allowVideoAnalysis = !!msgObj?.videoMessage && mediaConsent.pediuAnaliseDeMidia({ texto: mediaRequestText, tipo: 'video' });
      const allowStickerAnalysis = !!(msgObj?.stickerMessage || quotedObj?.stickerMessage) && mediaConsent.pediuAnaliseDeMidia({ texto: mediaRequestText, tipo: 'sticker' });
      const allowDocumentAnalysis = !!msgObj?.documentMessage && mediaConsent.pediuAnaliseDeMidia({ texto: mediaRequestText, tipo: 'documento' });
      const allowVisualInspection = allowImageAnalysis || allowVideoAnalysis || allowStickerAnalysis || allowDocumentAnalysis;

      // View-once só é guardado/aberto quando a pessoa pediu análise. Receber
      // mídia de visualização única não é autorização para a AURA observá-la.
      try {
        if (allowVisualInspection && (isViewOncePayload(msg.message) || msgObj?.imageMessage?.viewOnce || msgObj?.videoMessage?.viewOnce)) {
          _isViewOnce = true;
          console.log('[ViewOnce] Detectado no commandHandler — salvando...');
          const voMod = require('../aura/auraViewOnce');
          await voMod.handleViewOnce(sock, msg, { isOwner }).catch(()=>{});
        }
      } catch (e) { console.warn('[ViewOnce] detect error', e.message?.slice(0,50)); }

      if (msgObj?.imageMessage && allowImageAnalysis) {
        isImage = true;
        const caption = msgObj.imageMessage.caption || '';
        const viewOncePrefix = _isViewOnce ? '👁️‍🗨️ VIEW-ONCE (visualização única) — tu SALVOU e VÊS! ' : '';
        // v7.8 — a AURA VÊ a foto de verdade (Gemini Vision) v12.2: reconhecimento completo
        try {
          const am = require('../aura/auraMedia');
          const r = await am.verImagem(msg, require('./ai'), caption);
          if (r.context) mediaContext = viewOncePrefix + r.context;
          if (r.resumo) _resumoMidia = (_isViewOnce ? '[VIEW-ONCE FOTO] ' : '') + r.resumo;
        } catch (e) {
          console.warn('[AuraFoto]', String(e.message || e).slice(0, 50));
        }
        if (!mediaContext) {
          mediaContext = `${viewOncePrefix}📸 Alguém enviou uma FOTO.${caption ? ` Legenda: "${caption}"` : ''} ${_isViewOnce ? 'Era view-once mas tu já salvou e vês!' : ''} Comenta apenas com base no conteúdo analisado; não inventes quem aparece nem detalhes que não sejam claros.`;
        }
      } else if (msgObj?.videoMessage && allowVideoAnalysis) {
        isVideo = true;
        const caption = msgObj.videoMessage.caption || '';
        const isGif = msgObj.videoMessage.gifPlayback;
        const viewOncePrefix = _isViewOnce ? '👁️‍🗨️ VIEW-ONCE VIDEO — salvo! ' : '';
        mediaContext = isGif
          ? `${viewOncePrefix}🎞️ Alguém enviou um GIF. Reage naturalmente.`
          : `${viewOncePrefix}🎬 Alguém enviou um VÍDEO.${caption ? ` Legenda: "${caption}"` : ''} ${_isViewOnce ? 'Era view-once mas tu salvou!' : ''} Comenta naturalmente com base na legenda e nos dados disponíveis.`;
      } else if (msgObj?.audioMessage || msgObj?.documentMessage?.mimetype?.startsWith('audio')) {
        isAudio = true;
        const isPtt = !!msgObj.audioMessage?.ptt;
        const transcribed = String(_voiceTranscript || '').trim();
        if (transcribed) {
          mediaContext = isPtt
            ? `🎧 ÁUDIO DE VOZ transcrito: "${transcribed}" — responde ao conteúdo transcrito, sem alegar que ouviste outros detalhes.`
            : `🎵 ÁUDIO transcrito: "${transcribed}" — comenta apenas o conteúdo disponível.`;
          prompt = (prompt || '') + ` [Transcrição do áudio recebido: "${transcribed}"]`;
          if (isPtt && !cleanText) {
            try {
              const brainVoz = require('../aura/auraBrain');
              const cmdsVoz = require('../aura/auraCommands');
              if (brainVoz.pareceOrdem(transcribed) || cmdsVoz.detectarComando(transcribed) || brainVoz.detectarCapacidade(transcribed)) {
                cleanText = transcribed;
              }
            } catch {}
          }
        } else {
          mediaContext = isPtt
            ? '🎧 Foi recebido um áudio de voz, mas não há transcrição disponível. Não finjas que conseguiste ouvir ou identificar o conteúdo.'
            : '🎵 Foi recebido um ficheiro de áudio sem transcrição disponível.';
        }
      } else if ((msgObj?.stickerMessage || quotedObj?.stickerMessage) && allowStickerAnalysis) {
        isSticker = true;
        const stkMeta = msgObj?.stickerMessage || quotedObj?.stickerMessage || {};
        const citado = !msgObj?.stickerMessage && !!quotedObj?.stickerMessage;
        try {
          const stickerVisionMod = require('./stickerVision');
          let stkBuf = null;
          const alvo = citado ? buildQuotedDownloadMessage(msg) : msg;
          try {
            const { downloadMediaMessage } = require('baileys-v6');
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
      } else if (msgObj?.documentMessage && allowDocumentAnalysis) {
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
      const allowLinkAnalysis = !!_urlNaMsg && mediaConsent.pediuAnaliseDeMidia({ texto: mediaRequestText, tipo: 'link' });
      if (!mediaContext && _urlNaMsg && allowLinkAnalysis) {
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
      
      systemPrompt += '\n\n' + require('../aura/auraContextual').contexto(ctx.remoteJid, msg.key?.id);

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
        const encontrados = require('../aura/auraAvancada').detectarMulti(cleanText, brain);
        const exec = require('../aura/auraExec');
        const grupoPolicy = require('../aura/auraGrupo');
        const actionDirectedToAura = !ctx.isGroup || grupoPolicy.isDirectedToAura({
          isGroup: true,
          isBotMentioned,
          isReplyToAura: isReplyToBot,
          dest: ctx.dest,
        });
        let achados = actionDirectedToAura
          ? encontrados.filter(a => exec.isClearExecutionIntent(a.id, a.texto || cleanText, a.cap, cleanText))
          : [];

        // A IA só entra se a mensagem completa, incluindo direcção e contexto,
        // passar o portão. Uma ocorrência lexical posterior não é uma ordem.
        if (!achados.length && actionDirectedToAura && brain.pareceOrdem(cleanText)) {
          const _pararIA = require('./humanizer').pensando(sock, ctx.remoteJid); // v7.53: "a escrever…" enquanto pensa
          let viaIA = null;
          try { viaIA = await brain.rotearComIA(cleanText, require('./ai')).catch(() => null); }
          finally { _pararIA(); }
          if (viaIA && exec.isClearExecutionIntent(viaIA.id, cleanText, viaIA.cap, cleanText)) {
            achados.push({ ...viaIA, texto: cleanText });
          }
        }

        if (achados.length) {
          // Uma acção destrutiva por pedido, sempre com confirmação explícita.
          // Se houver multi-intenção, não executa as restantes em paralelo.
          const destrutiva = achados.slice(0, 2).find(a => a.cap?.risco === 'destrutivo');
          if (destrutiva && brain.podeFazer(destrutiva.cap, { isOwner, isAdmin: ctx.isAdmin }).pode) {
            const pedido = require('../aura/auraConfirmacao').pedir({
              id: destrutiva.id, arg: destrutiva.arg, texto: cleanText, ctx, isOwner,
            });
            if (pedido.necessaria) {
              await sock.sendMessage(ctx.remoteJid, { text: pedido.mensagem }, { quoted: msg }).catch(() => {});
              return true;
            }
          }

          let executou = false;
          for (const achado of achados.slice(0, 2)) {
            const perm = brain.podeFazer(achado.cap, { isOwner, isAdmin: ctx.isAdmin });
            if (!perm.pode) continue;
            const r = await exec.executar(achado.id, achado.arg, {
              sock, msg, ctx, texto: achado.texto || cleanText, contextoTexto: cleanText,
              isOwner, isAdmin: ctx.isAdmin,
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
        const intentPolicy = require('../aura/auraGrupo');
        const intentUniversal = require('../aura/auraUniversal');
        const actionDirectedToAura = !ctx.isGroup || intentPolicy.isDirectedToAura({
          isGroup: true,
          isBotMentioned,
          isReplyToAura: isReplyToBot,
          dest: ctx.dest,
        });
        const explicitCallRequest = intentUniversal.isExplicitCallRequest(cleanText);
        try {
          const bridge = require('./callBridge');
          const pedidoCall = bridge.detectarPedidoChamada(cleanText);
          if (actionDirectedToAura && explicitCallRequest && pedidoCall) {
            const alvo = pedidoCall.grupo && ctx.isGroup
              ? ctx.remoteJid
              : (ctx.isGroup ? (ctx.senderJid || ctx.senderNumber + '@s.whatsapp.net') : ctx.remoteJid);
            const resultadoChamada = pedidoCall.grupo && ctx.isGroup
              ? await bridge.ligarGrupo(sock, ctx.remoteJid)
              : await bridge.tentarLigar(sock, alvo, { tipo: pedidoCall.tipo, pushName: ctx.pushName || '' });
            const tipo = pedidoCall.tipo === 'video' ? 'vídeo' : 'voz';
            let textoChamada;
            if (!resultadoChamada?.ok) {
              textoChamada = `Não consegui iniciar a chamada de ${tipo}. Tenta novamente mais tarde.`;
            } else if (pedidoCall.grupo && ctx.isGroup) {
              textoChamada = resultadoChamada.url
                ? 'Enviei ao grupo um link para iniciar a chamada.'
                : 'Enviei ao grupo as instruções disponíveis para iniciar uma chamada.';
            } else if (resultadoChamada.tocou) {
              textoChamada = `O WhatsApp iniciou uma chamada de ${tipo} para o teu contacto. A ligação só fica estabelecida se atenderes.`;
            } else if (/^https:\/\/call\.whatsapp\.com\//i.test(String(resultadoChamada.url || ''))) {
              textoChamada = `Criei um link de chamada de ${tipo} e enviei-o no PV.`;
            } else if (resultadoChamada.url) {
              textoChamada = 'A chamada automática não foi iniciada; enviei um link para abrir o teu contacto no WhatsApp.';
            } else {
              textoChamada = `Enviei um pedido de chamada de ${tipo} pelo WhatsApp. A ligação ainda depende de ser aceite.`;
            }
            await sock.sendMessage(ctx.remoteJid, { text: textoChamada }, { quoted: msg });
            return true;
          }
        } catch (e) {
          console.warn('[Aura call]', e.message?.slice(0, 60));
        }

        try {
          const acts = require('../aura/auraActions');
          const ordem = acts.detectarAcao(cleanText);
          const actionIntentClear = actionDirectedToAura &&
            intentUniversal.isExplicitLegacyAuraAction(cleanText, ordem?.acao);
          if (ordem && actionIntentClear) {
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

      if (turn) turn.conversational = true;
      if (!conversation.canDeliver(ctx, turn)) return true;
      let answer = _literalGreeting;
      if (!answer && isSticker && stickerVision?.ok && stickerVision.frames?.length) {
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
      } else if (!answer && isImage) {
        try {
          let imgBuf = null;
          // Tentativa 1: downloadMediaMessage
          try {
            const { downloadMediaMessage } = require('baileys-v6');
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
            // v12.2: USA TODAS CAPACIDADES JUNTAS — reconhecimento facial + memória + reações + view-once
            let _reactionCtx = '';
            let _viewOnceCtx = '';
            try {
              const ar = require('../aura/auraReaction');
              _reactionCtx = ar.reactionContextForPrompt(ctx.remoteJid) || '';
            } catch {}
            try {
              const vo = require('../aura/auraViewOnce');
              _viewOnceCtx = vo.viewOnceContextForPrompt(ctx.remoteJid) || '';
            } catch {}
            const visionPrompt = prompt + `

[ANÁLISE AUTOMÁTICA DA IMAGEM — usa apenas os dados fornecidos pela visão.
• Descreve os elementos visíveis, objectos e texto legível; se algo não estiver claro, diz que não tens certeza.
• PESSOAS: se aparecerem, indica quantas apenas quando a contagem for clara; não identifiques pessoas privadas nem infiras carácter ou factos pessoais.
• TEXTO: transcreve apenas o que estiver legível.
• LOCAL: descreve o cenário visível, sem adivinhar cidade, morada ou localização exacta.
• Podes descrever roupas e expressões sem inferir identidade ou carácter.
• Não afirmes conhecer alguém pela aparência. Usa memória apenas se houver uma correspondência explícita e fiável no contexto.
• Reacções/contexto disponível: ${_reactionCtx || 'nenhum'}
• Informação adicional de mídia: ${_viewOnceCtx || 'nenhuma'}
Responde com naturalidade e concisão, sem inventar detalhes e sem fingir ser uma pessoa a olhar para a imagem.]`;
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
            const regrasGlobais = await av.regrasGlobais();
            if (regrasGlobais.length) {
              partes.push('PREFERÊNCIAS GLOBAIS ENSINADAS PELO DONO (aplicam-se em todos os chats, quando relevantes; se houver contradição, segue a instrução mais recente):\n- ' + regrasGlobais.join('\n- '));
            }
            const regras = await av.regrasDe(ctx.remoteJid);
            if (regras.length) {
              partes.push('CORRECÇÕES LOCAIS DESTE CHAT (obedeces-lhes aqui):\n- ' + regras.join('\n- '));
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
              // v7.83: DESTINATÁRIO — ela vê quem respondeu a quem e quem marcou quem.
              try {
                if (ctx.dest) {
                  const DD = require('../aura/auraDestinatario');
                  partes.push(DD.blocoParaPrompt(ctx.dest));
                  if (ctx._tomLeve) partes.push('TOM: falam DE ti, não CONTIGO — reage leve e breve (1 linha, ou só um emoji se bastar). Não faças perguntas nem puxes conversa.');
                }
              } catch {}
              // Mapa único de remetente/destinatário/conteúdo/citação para a
              // AURA responder sem misturar autor actual, autor citado e origem.
              try {
                const mapaMensagem = auraCompreensao.blocoMensagem(ctx.messageInfo, {
                  textoActual: cleanText || text,
                  dest: ctx.dest,
                  senderLabel: ctx.identidade?.rotulo || ctx.pushName || '',
                  transcricao: !!ctx.audioTranscription,
                });
                if (mapaMensagem) partes.push(mapaMensagem);
              } catch {}
            } catch (e) { console.warn('[Aura cerebro]', e.message?.slice(0, 60)); }
            _consciencia = partes.join('\n\n');
            // Aprende com correcções: "não faças isso" vira regra
            if (/aura/i.test(cleanText) || isReplyToBot || !ctx.isGroup) {
              const reg = await av.aprenderRegra(ctx.remoteJid, cleanText, { isOwner });
              if (reg) _consciencia += `\n\n(ACABASTE DE GUARDAR ${isOwner ? 'uma preferência global ensinada pelo Dono' : 'uma correcção deste chat'}: "${reg}". Podes confirmar isso numa frase curta, sem dizer que o modelo foi treinado.)`;
            }
          } catch {}

          const _pararResp = require('./humanizer').pensando(sock, ctx.remoteJid); // v7.53: "a escrever…" durante a IA
          try {
          if (turn) turn.conversational = true;
          answer = await aura.auraRespondSmart(prompt, {
            isOwner: ctx.isPrimaryOwner,
            isSubOwner: !!ctx.isSubOwner,   // v7.28: número do bot / owner_numbers
            isVip,
            isAdmin: ctx.isAdmin,   // v6.85: ela sabe o cargo de quem fala
            pushName: ctx.pushName,
            senderNumber: ctx.senderNumber,
            isGroup: ctx.isGroup,
            groupName: ctx.groupName,
            groupContext,
            historyArray,
            quotedMessage: require('../aura/auraContext').extractQuoted(msg), signal: turn?.signal,
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
          } finally { _pararResp(); }
        } else {
          // v6.43: modo assistente profissional (estilo Meta AI)
          let _identBloco = '';
          try {
            if (ctx.identidade) _identBloco = require('../aura/auraIdentidade').blocoParaPrompt(ctx.remoteJid, ctx.identidade, { citado: ctx.citado, ownerNumber: config.owner.number });
          } catch {}
          if (turn) turn.conversational = true;
          answer = await auraModes.assistantRespond(prompt, {
            botName: config.bot.name, userName: ctx.pushName, identidade: _identBloco,
            isGroup: ctx.isGroup, groupName: ctx.groupName, remoteJid: ctx.remoteJid,
            groupContext, historyArray, prefix,
            quotedMessage: require('../aura/auraContext').extractQuoted(msg), signal: turn?.signal,
            isOwner: ctx.isPrimaryOwner, isVip, isAdmin: ctx.isAdmin,
            remoteJid: ctx.remoteJid, senderNumber: ctx.senderNumber,
            pessoasNoGrupo: ctx.groupMeta?.participants?.length || 0,
            mediaContext, isAudio, isImage, isVideo, isSticker,
          });
        }
      }

      if (!conversation.canDeliver(ctx, turn)) return true;
      // Validate before remembering a model answer or interpreting action tags.
      const responseSanitizer = require('../aura/auraSanitizer');
      answer = responseSanitizer.eVazamento(answer)
        ? 'Não consegui obter uma resposta coerente para esta mensagem.'
        : require('../aura/auraInterpret').consertarSeRecusou(responseSanitizer.limparResposta(answer), cleanText);

      answer = require('../aura/auraDialogue').constrainModelActions(answer, cleanText);

      // Assistant history is appended only after the actual delivery observer
      // sees the final, sanitized text (not raw action tags or stale output).

      // ⚡ Reacção automática de emoji (interacção contextual)
      // v6.43: só a AURA acordada reage. O assistente fica sóbrio.
      if (_awake && isOwner && !aura.isSilenced(ctx.senderNumber)) {  // v6.52: evita o erro anterior da variável de silêncio inexistente
        const rEmoji = chooseAuraReaction(cleanText || text, ctx);
        sock.sendMessage(ctx.remoteJid, { react: { text: rEmoji, key: msg.key } }).catch(() => {});
      } else if (_awake && !isOwner) {
        const rEmoji = chooseAuraReaction(cleanText || text, ctx);
        sock.sendMessage(ctx.remoteJid, { react: { text: rEmoji, key: msg.key } }).catch(() => {});
      }
      
      // Mantém uma resposta concisa; a transparência de identidade é definida no prompt.
      // ⚡ Parser de acções da Aura: [STICKER:xxx], [IMAGE:xxx], [CMD:xxx]
      // Do not execute model actions or send stale output after a pause/new turn.
      if (!conversation.canDeliver(ctx, turn)) return true;
      let finalAnswer = answer;
      // v7.37: a IA pode escolher calar-se / só reagir, pedir acções reais
      // e anotar o que aprendeu. Tudo com as permissões de sempre.
      let _acoesIA = [];
      try {
        const vont = require('../aura/auraVontade');
        const cer = require('../aura/auraCerebro');
        const v = vont.interpretarResposta(finalAnswer);
        // O Dono, um PV de cliente e uma conversa dirigida não podem ser
        // silenciados por decisão do modelo. Personalidade não sobrepõe ordem.
        const _pvForca = isOwner || _forcarContextual() || vont.forcarRespostaPV({ isOwner, isGroup: ctx.isGroup, sat: vont.saturacao(ctx.remoteJid, ctx.senderNumber) });
        if (v.silencio && !_pvForca) {
          if (v.reagir) sock.sendMessage(ctx.remoteJid, { react: { text: v.reagir, key: msg.key } }).catch(() => {});
          console.log('[Aura] escolheu não responder');
          return true;
        }
        if (v.reagir && v.texto.length < 2 && !_pvForca) {
          await sock.sendMessage(ctx.remoteJid, { react: { text: v.reagir, key: msg.key } }).catch(() => {});
          return true;
        }
        finalAnswer = (_pvForca && (v.silencio || v.texto.length < 2))
          ? `Estou aqui! 👋 Diz-me o que precisas — ou escreve *${ctx.prefix || '!'}menu* para veres tudo o que sei fazer.`
          : v.texto;
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
          let aguardaConfirmacaoDestrutiva = false;
          try {
            const brainConfirmacao = require('../aura/auraBrain');
            aguardaConfirmacaoDestrutiva = _acoesIA.some(a => {
              if (!a || String(a.id || '').startsWith('cmd_')) return false;
              const cap = brainConfirmacao.POR_ID.get(a.id);
              return cap?.risco === 'destrutivo' && brainConfirmacao.podeFazer(cap, { isOwner, isAdmin: !!_adm }).pode;
            });
          } catch {}
          if (aguardaConfirmacaoDestrutiva) finalAnswer = '';
          if (finalAnswer.length > 0) { await sock.sendMessage(ctx.remoteJid, { text: finalAnswer }, { quoted: msg }); finalAnswer = ''; }
          const r = await cer.executarAcoes(_acoesIA, {
            sock, msg, ctx, texto: cleanText, isOwner, isAdmin: !!_adm, isVip: _isVipA, caseHandler, config: commandConfig,
            runNativo: async (nome, { ctx: cmdCtx, args }) => {
              const fn = nativeCommands[nome] || packageCommands[nome];
              if (typeof fn !== 'function') return false;
              await fn({ sock, msg, ctx: cmdCtx, args, isOwner, fillVars, config: commandConfig });
              incrementUserCommand(ctx.senderNumber, ctx, nome).catch(() => {}); // v7.53: stats sem bloquear
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
        if (san.eVazamento(answer) || san.eVazamento(finalAnswer) || san.eLinkInventado(finalAnswer)) {
          finalAnswer = 'Não consegui obter uma resposta coerente para esta mensagem.';
        }
        finalAnswer = String(finalAnswer || '').replace(/\(ÁUDIO\)|\(AUDIO\)/gi, '').trim();
        try {
          const imgSearch = require('./imageSearch');
          const falsa = imgSearch.extrairAcaoFalsa(answer || finalAnswer);
          // v7.95: acções de mídia só com sinal do próprio utilizador —
          // elas deixam de sair "do nada" (sticker/foto surpresa) e a
          // voz respeita o «manda em texto» deste chat.
          const _mtA = !!(_perc && _perc.modoTexto(_pkAura || _perc.chave(ctx.remoteJid, ctx.senderNumber)));
          const _querStickerA = !!(_perc && (_perc.pedidoStickerTema(cleanText || text) || isSticker));
          const _querImagemA = /\b(?:manda|mande|envia|envie|mostra|cria|crie|faz|tira|gera|desenha)[\wÀ-ÿ]*\b[^.!?\n]{0,18}\b(?:fotos?|imagens?|desenhos?)\b/i.test(cleanText || text);
          if (falsa?.tipo === 'imagem' && falsa.termo && _querImagemA) {
            const imgs = await imgSearch.buscarImagens(falsa.termo, 1).catch(() => null);
            if (imgs?.length) {
              await sock.sendMessage(ctx.remoteJid, {
                image: { url: imgs[0].url },
                caption: falsa.termo,
              }, { quoted: msg });
              return true;
            }
          }
          if (falsa?.tipo === 'audio' && !_mtA) {   // v7.95: nunca em voz quando o chat pediu texto
            const vozMod = require('../aura/auraVoz');
            const cita = vozMod.extrairCitado(msg, groupContext);
            const fala = vozMod.textoParaFalar(falsa.termo || finalAnswer, {
              texto: cleanText, citado: cita, groupContext,
            });
            const voz = await require('./ai').speakWithFallback(fala, null, { signal: turn?.signal });
            if (voz && voz.length > 500) {
              const voiceResult = await sock.sendMessage(ctx.remoteJid, {
                audio: voz, mimetype: 'audio/mpeg', ptt: true,
              }, { quoted: msg });
              if (!voiceResult?.suppressed) await _rememberSent(fala);
              return true;
            }
          }
          if (falsa?.tipo === 'sticker' && falsa.termo && _querStickerA) {   // v7.95: sticker só se a pessoa pediu
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
                  await require('./stickerPack').sendStickerWithPackLink(sock, ctx.remoteJid, stk, { quoted: msg });
                  return true;
                }
              }
            }
          }
        } catch (e) {
          if (turn?.signal?.aborted || require('./aiCancellation').isAbort(e)) return true;
          console.warn('[Aura acção falsa]', e.message?.slice(0, 60));
        }
      } catch {}
      try {
        const memA = require('../aura/auraMemory');
        memA.guardar(ctx.senderNumber, cleanText).catch(() => {});
      } catch {}

      // v12.9.9: o card de "prefixo" agora corre ANTES da IA (ver trigger
      // cedo no handler) — aqui já não é preciso.
      const actionSticker = finalAnswer.match(/\[STICKER:([^\]]+)\]/);
      const actionImage = finalAnswer.match(/\[IMAGE:([^\]]+)\]/);
      
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
              incrementUserCommand(ctx.senderNumber, ctx, pedido.comando).catch(() => {}); // v7.53: stats sem bloquear
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
          const intentPolicyU = require('../aura/auraGrupo');
          const directedToAura = !ctx.isGroup || intentPolicyU.isDirectedToAura({
            isGroup: true,
            isBotMentioned,
            isReplyToAura: isReplyToBot,
            dest: ctx.dest,
          });
          // Guarda de instruções: "se alguém mandar link, bane" é regra, não ordem;
          // em grupo, a ordem também tem de ser explicitamente dirigida à AURA.
          const eOrdem = directedToAura && t0.length >= 4 && t0.length <= 220 && brainU.pareceOrdem(t0) && !require('../aura/auraCommands').eInstrucao(t0);
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
                  incrementUserCommand(ctx.senderNumber, ctx, escolha.cmd).catch(() => {}); // v7.53: stats sem bloquear
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

      // ── Imagem da persona virtual AURA — identificada como ficcional.
      // Conteúdo de jogo/assunto é tratado pela pesquisa acima; nunca chega
      // aqui como selfie por causa de um fallback lexical.
      const _personaPhotoIntent = !!(
        (ctx.imageIntent?.requested && ctx.imageIntent.target === 'persona') ||
        (ctx._superIntent?.intent === 'PHOTO_REQUEST' && ctx._superIntent?.intentDetails?.photoTarget === 'persona')
      );
      if (_personaPhotoIntent && (!ctx.isGroup || !!ctx.dest?.directToAura)) {
        try {
          const selfieMod = require('../aura/auraSelfie');
          const fs = require('fs');
          const path = require('path');
          const tLower = String(cleanText || text || '').toLowerCase();
          let tipo = 'selfie';
          if (/cosplay/.test(tLower)) tipo = 'cosplay';
          else if (/goth|dark|preta|look/.test(tLower)) tipo = 'goth';
          else if (/fofa|cute|linda|amor/.test(tLower)) tipo = 'cute';
          else if (/live|stream|jogando|game/.test(tLower)) tipo = 'stream';
          
          // Só entrega a imagem se o destinatário foi confirmado pelo router.
          const isDirect = !ctx.isGroup || !!ctx.dest?.directToAura;
          const confidence = ctx._superIntent?.intentConfidence || ctx._photoIntent?.intentConfidence || 80;
          
          if (isDirect && confidence >= 40) {
            console.log('[Aura visual] Enviando imagem da persona:', tipo, 'conf:', confidence);
            let buf = null;
            try {
              const avatarPath = await selfieMod.getSelfie(tipo);
              if (avatarPath && fs.existsSync(avatarPath)) buf = fs.readFileSync(avatarPath);
            } catch {}
            if (buf && buf.length > 500) {
              const caption = selfieMod.getCaptionForType(tipo, isOwner);
              await sock.sendMessage(ctx.remoteJid, { image: buf, caption }, { quoted: msg });
              if (isOwner && /perfil|profile|coloca|atualiza|foto do bot/i.test(cleanText || '')) {
                try {
                  await selfieMod.updateProfilePicture(sock, buf);
                  await sock.sendMessage(ctx.remoteJid, { text: 'Actualizei a foto de perfil do bot com uma imagem da personagem AURA.' }, { quoted: msg });
                } catch (e) { console.warn('[Selfie profile]', e.message?.slice(0,60)); }
              }
              return true;
            }
            // Fallback gera
            try {
              const aiMod = require('./ai');
              const promptMap = {
                selfie: 'stylized digital portrait of fictional virtual character AURA, goth aesthetic, black hair, dark makeup, purple lights, clearly illustrated, not photorealistic',
                cosplay: 'digital illustration of fictional character AURA in an anime-inspired black and purple cosplay, confident pose, clearly stylized',
                goth: 'illustrated avatar of fictional virtual assistant AURA, black hair, dark makeup, purple room lighting, goth fashion',
                cute: 'cute stylized illustration of fictional goth avatar AURA, soft smile, black hair, heart gesture, purple lights',
                stream: 'digital illustration of fictional virtual assistant AURA in a purple-lit gaming setup, headphones, clearly not a real livestream',
              };
              const imgBuf = await aiMod.generateImage(promptMap[tipo] || promptMap.selfie).catch(() => null);
              if (imgBuf && imgBuf.length > 500) {
                const caption = selfieMod.getCaptionForType(tipo, isOwner);
                await sock.sendMessage(ctx.remoteJid, { image: imgBuf, caption }, { quoted: msg });
                try {
                  const dir = selfieMod.SELFIE_DIR;
                  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                  fs.writeFileSync(path.join(dir, 'aura_virtual_' + tipo + '_' + Date.now() + '.jpg'), imgBuf);
                } catch {}
                return true;
              }
            } catch (e) { console.warn('[Selfie gen]', e.message?.slice(0,60)); }
          }
        } catch (e) { console.warn('[Aura visual]', e.message?.slice(0,80)); }
      }

      // v6.53: PEDIDO DE ÁUDIO — ela dizia "não posso enviar áudios"
      // mas o ElevenLabs funciona (testado: 30KB de MP3). Agora quando
      // pedem voz, ela envia MESMO em vez de recusar.
      // v6.53: apanha as formas reais de pedir — inclui o imperativo
      // ('mande', 'envie', 'faça'), que a versão anterior falhava.
      // v6.53: detecção simples e robusta — há um verbo de pedido E a
      // palavra áudio/voz na mesma frase. Tentei uma regex com
      // distância entre os termos, mas falhava com acentos.
      const _deliveryPref = require('../aura/auraDialogue').deliveryPreference(cleanText);
      const _pedidoExplicito = _deliveryPref === 'audio';

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

      // v7.95: «manda em texto / tem muito barulho» desliga a voz neste
      // chat (90 min) — só um pedido EXPLÍCITO de voz na própria
      // mensagem fura o silêncio.
      const _mtVoz = !!(_perc && _perc.modoTexto(_pkAura || _perc.chave(ctx.remoteJid, ctx.senderNumber)));
      const pediuAudio = (_modoSoAudio || _pedidoExplicito || _formato === 'audio' || (isAudio && (isOwner || isPv)))
        && _deliveryPref !== 'text' && !(_mtVoz && !_pedidoExplicito);

      // v6.81 (bug #2 da auditoria): o formato 'reacao' era calculado e deitado
      // fora — ela acabava por escrever texto na mesma. Agora reage mesmo:
      // mensagens que não pedem resposta (kkk, top, isso) levam só um emoji.
      // Respeita o modo "não reajas" do chat e nunca engole respostas longas.
      if (_formato === 'reacao' && !_forcarContextual() && !pediuAudio && finalAnswer.length < 120) {
        let _semReagir = false;
        try { _semReagir = !!require('../aura/auraBrain').modos(ctx.remoteJid).semReagir; } catch {}
        if (!_semReagir) {
          try {
            const emoji = chooseAuraReaction(cleanText, ctx);
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

          const voz = await aiVoz.speakWithFallback(paraFalar, null, { signal: turn?.signal });
          if (voz && voz.length > 500) {
            const voiceResult = await sock.sendMessage(ctx.remoteJid, {
              audio: voz, mimetype: 'audio/mpeg', ptt: true,
            }, { quoted: msg });
            if (!voiceResult?.suppressed) await _rememberSent(paraFalar);
            return true;   // já respondeu em voz, não repete em texto
          }
        } catch (e) {
          if (turn?.signal?.aborted || require('./aiCancellation').isAbort(e)) return true;
          console.warn('[Aura voz]', e.message?.slice(0, 60));
          // se a voz falhar, continua e manda o texto
        }
        finalAnswer = 'Não consegui gerar o áudio agora; envio em texto.\n\n' + finalAnswer;
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
        const sanCheck = require('../aura/auraSanitizer');
        if (sanCheck.eVazamento(finalAnswer)) {
          finalAnswer = isOwner ? 'Não consegui responder de forma fiável agora, Dark.' : 'Não consegui responder de forma fiável agora.';
        }
        await sock.sendMessage(ctx.remoteJid, { text: finalAnswer }, { quoted: msg });
        // v6.86 — anti-repetição: lembra o que ela própria acabou de
        // dizer neste chat, para não se repetir como um bot.
        try { require('../aura/auraAvancada').registarFala(ctx.remoteJid, finalAnswer); } catch {}
      }
      
      // Executa acções de mídia (sem bloquear se falhar)
      // v7.95: sticker/imagem por iniciativa da IA só sai quando a
      // PRÓPRIA pessoa pediu — caso contrário a resposta é só texto.
      const _querStk = !!(_perc && (_perc.pedidoStickerTema(cleanText || text) || isSticker));
      const _querImg = /\b(?:manda|mande|envia|envie|mostra|cria|crie|faz|tira|gera|desenha)[\wÀ-ÿ]*\b[^.!?\n]{0,18}\b(?:fotos?|imagens?|desenhos?)\b/i.test(cleanText || text);
      if (actionSticker && _querStk) {
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
              await require('./stickerPack').sendStickerWithPackLink(sock, ctx.remoteJid, stk, { quoted: msg });
            }
          }
        } catch (e) { /* silêncio — não quebra o fluxo */ }
      }
      
      if (actionImage && _querImg) {
        try {
          const ai2 = require('./ai');
          const desc = actionImage[1].trim();
          const imgBuf = await ai2.generateImage(desc);
          if (imgBuf && imgBuf.length > 100) {
            await sock.sendMessage(ctx.remoteJid, { image: imgBuf, caption: '' }, { quoted: msg });
          }
        } catch (e) { /* silêncio */ }
      }
      
      // Raw [CMD:] model output is rejected before response/action parsing.

      if (!_auraEntrega.respondeu() && _forcarContextual()) {
        await sock.sendMessage(ctx.remoteJid, { text: require('../aura/auraDelivery').TEXTO_FALHA }, { quoted: msg });
      }
      return true;

    } catch (e) {
      if (turn?.signal?.aborted || require('./aiCancellation').isAbort(e)) return true;
      // Diagnóstico sem expor o texto da conversa ou segredos do erro.
      console.warn('[Aura v6.39]', JSON.stringify({ etapa: 'resposta', chat: ctx.isGroup ? 'grupo' : 'pv', id: String(msg.key?.id || '').slice(0, 64), erro: e?.name || 'Error' }));
      if (_auraEntrega.respondeu()) return true;
      if (_forcarContextual()) {
        try {
          await sock.sendMessage(ctx.remoteJid, { text: require('../aura/auraDelivery').TEXTO_FALHA }, { quoted: msg });
          return true;
        } catch { console.warn('[Aura entrega] Não foi possível entregar o aviso de falha.'); }
      }
    } finally {
      sock = _sockAntesAura;
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
    // Restrição de uso de comandos — !adm1 mantém compatibilidade curta.
    adm1: 'onlyadm',
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
      const premUser = await require('./hotCache').getUser(msg, ctx.senderNumber); // v7.52: memo partilhado
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
    const okVip = await userIsPremiumOrOwner(ctx.senderNumber, isOwner, msg);
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
    const adminControlCmds = ['bloquearcmd','desbloquearcmd','cmdsgrupo','blockcmd','unblockcmd','setnomebot','inatividade','inativos','warn','unwarn','warnings','resetwarn','regras','setregras','motivacao','tagadmins','admins','setdesc','setnomegrupo','del','add','tempban','silenciar','limpar','onlyadm','soadm'];
    if (!isOwner && !adminControlCmds.includes(canonicalCommand) &&
        (blocked.includes(commandName) || blocked.includes(canonicalCommand) || blockedSubs.includes(commandName) || blockedSubs.includes(canonicalCommand))) {
      return false;
    }

    // !onlyadm / !adm1 configura quem pode usar o bot inteiro no grupo.
    // !soadm é o alias compatível da mesma política; !fechar controla apenas
    // o chat nativo do WhatsApp.
    if (canonicalCommand === 'onlyadm') {
      const ehAdmin = isOwner || await isGroupAdminForHandler(sock, ctx);
      if (!ehAdmin) {
        await sock.sendMessage(ctx.remoteJid, {
          text: '🛡️ Só administradores do grupo ou o Dono podem mudar esta opção.',
        }, { quoted: msg });
        return true;
      }
      const escolha = String(args[0] || '').trim().toLowerCase();
      let proximo;
      if (!escolha || ['toggle', 'alternar'].includes(escolha)) proximo = !groupConfig.onlyAdmins;
      else if (['on', 'ligar', 'ativo', 'activar', 'ativar', '1'].includes(escolha)) proximo = true;
      else if (['off', 'desligar', 'inativo', 'desactivar', 'desativar', '0'].includes(escolha)) proximo = false;
      else if (['status', 'estado'].includes(escolha)) proximo = !!groupConfig.onlyAdmins;
      else {
        await sock.sendMessage(ctx.remoteJid, {
          text: `Uso: *${prefix}onlyadm on* ou *${prefix}onlyadm off*\nTambém podes usar *${prefix}adm1* para alternar.`,
        }, { quoted: msg });
        return true;
      }
      if (!['status', 'estado'].includes(escolha)) {
        groupConfig.onlyAdmins = proximo;
        await groupConfig.save();
        require('./hotCache').forgetGroup(ctx.remoteJid);
      }
      await sock.sendMessage(ctx.remoteJid, {
        text: proximo
          ? '🛡️ *BOT SÓ PARA ADMINS: ON*\n\nA partir de agora, o DARK BOT e a AURA só respondem a admins do grupo, subdonos e ao Dono. Membros normais ficam sem resposta.\n\nPara liberar todos: *' + prefix + 'onlyadm off*\nAlias: *' + prefix + 'soadm*'
          : '🛡️ *BOT SÓ PARA ADMINS: OFF*\n\nOs membros voltam a poder usar o bot conforme as permissões do grupo.\n\nPara restringir: *' + prefix + 'onlyadm on*',
      }, { quoted: msg });
      return true;
    }

    if (groupConfig.onlyAdmins && !isOwner && !(await isGroupAdminForHandler(sock, ctx))) return false;
  }

  // ── v7.61: MODOS por categoria — grupo escolhe o que o bot faz ──
  // Dono passa sempre; PV não tem modos (só grupos).
  if (ctx.isGroup && groupConfig && !isOwner) {
    const gate = require('./modeGate').check(canonicalCommand, groupConfig);
    if (!gate.allowed) {
      const modeGate = require('./modeGate');
      await sock.sendMessage(ctx.remoteJid, { text: modeGate.lockedMessage(gate.mode, prefix) }, { quoted: msg });
      return true;
    }
  }

  // O antigo limite de 50 comandos/dia no PV foi substituído pelo acesso
  // Free somente para !sticker, aplicado antes de AURA e dos cases.

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
      incrementUserCommand(ctx.senderNumber, ctx, canonicalCommand).catch(() => {}); // v7.53: stats sem bloquear
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
      incrementUserCommand(ctx.senderNumber, ctx, canonicalCommand).catch(() => {}); // v7.53: stats sem bloquear
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
      incrementUserCommand(ctx.senderNumber, ctx, canonicalCommand).catch(() => {}); // v7.53: stats sem bloquear
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
        // v7.88: se o comando EXISTE (correu por outro prefixo/path), silêncio —
        // sugerir "rpgstart" a quem escreveu "rpgstart" era o vacilo da imagem.
        const tudoCmds = new Set([
          ...Object.keys(nativeCommands || {}),
          ...Object.keys(packageCommands || {}),
          ...[...caseHandler.CASES.keys()],
        ]);
        if (tudoCmds.has(commandName)) return false;

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
            const { generateWAMessageFromContent, proto } = require('baileys-v6');
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
    incrementUserCommand(ctx.senderNumber, ctx, canonicalCommand).catch(() => {}); // v7.53: stats sem bloquear
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
      text: `❌ *Erro ao decryptar*\n\n${err.message}\n\nFormatos suportados: .ehi, .ehic, .hat, .npv4, .dark, .any, .tls, .conf, .nm, .ovpn, .ssh, .json, .v2box`,
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


const DECRYPT_URL_EXT_RE = /\.(ehi|ehic|hat|npv|npv4|npv7|npv8|npvt|dark|darkt|any|tls|nm|nmess|ovpn|ssh|ssl|json|v2box|singbox|sb|conf|wg|wireguard|txt|bdnet|bd|apna|apnalite|wyrvpn|wyr)(?:[/?#]|$)/i;

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
    if (pedido?.gerar) return null; // geração explícita segue o fluxo próprio.

    const imageIntent = ctx.imageIntent;
    if (imageIntent?.requested) {
      // Um pedido no grupo só é nosso se houver vocativo, @AURA ou reply à AURA.
      if (ctx.isGroup && !ctx.dest?.directToAura) return null;
      if (imageIntent.target === 'persona') return null; // tratado pelo sender de persona.
      if (imageIntent.target === 'ambiguous' || (!imageIntent.query && !imageIntent.searchQuery && imageIntent.target === 'content')) {
        await sock.sendMessage(ctx.remoteJid, {
          text: imageIntent.clarification || 'Queres uma imagem da personagem virtual AURA ou de que assunto/objeto? Não vou adivinhar o alvo.',
        }, { quoted: msg });
        return 'falhou';
      }
      if (imageIntent.target === 'content') {
        const query = String(imageIntent.searchQuery || imageIntent.query || '').trim();
        if (!query) {
          await sock.sendMessage(ctx.remoteJid, {
            text: 'Não consegui identificar qual imagem queres. Diz o jogo ou assunto pelo nome, por favor.',
          }, { quoted: msg });
          return 'falhou';
        }
        const imgs = await imgSearch.buscarImagens(query, 1).catch(() => null);
        if (imgs?.length && /^https?:/i.test(String(imgs[0].url || ''))) {
          await sock.sendMessage(ctx.remoteJid, {
            image: { url: imgs[0].url },
            caption: imageIntent.caption || `Imagem de referência pesquisada sobre ${imageIntent.query || query}; não é uma captura verificada de uma live real.`,
          }, { quoted: msg });
          try { imgSearch.lembrarTermo(ctx.remoteJid, imageIntent.query || query); } catch {}
          return 'enviadas';
        }
        await sock.sendMessage(ctx.remoteJid, {
          text: `Não encontrei uma imagem de referência fiável sobre ${imageIntent.query || query} agora. Não vou substituir por uma selfie nem fingir que é uma captura real.`,
        }, { quoted: msg });
        return 'falhou';
      }
    }

    // Compatibilidade para pedidos antigos que o classificador novo não cobre.
    if (!pedido) return null;
    if (ctx.isGroup && !ctx.dest?.directToAura) return null;
    const { termo, nomes } = imgSearch.resolverTermo({
      jid: ctx.remoteJid, termo: pedido.termo, texto: cleanText,
    });
    const alvos = nomes.length ? nomes : [termo].filter(Boolean);
    if (!alvos.length) return null;

    const enviadas = [];
    for (const alvo of alvos) {
      const imgs = await imgSearch.buscarImagens(alvo, 1).catch(() => null);
      if (imgs?.length && /^https?:/i.test(String(imgs[0].url || ''))) {
        await sock.sendMessage(ctx.remoteJid, { image: { url: imgs[0].url }, caption: `Imagem pesquisada sobre ${alvo}; resultado de referência, não uma captura verificada.` }, { quoted: msg });
        enviadas.push(alvo);
        try { imgSearch.lembrarTermo(ctx.remoteJid, alvo); } catch {}
      }
    }
    if (enviadas.length) return 'enviadas';
    if (!/\b(foto|imagem|fotografia|retrato|picture|photo)\b/i.test(cleanText || '')) return null;
    await sock.sendMessage(ctx.remoteJid, { text: `Não encontrei uma imagem de ${alvos.join(' e ')} agora.` }, { quoted: msg });
    return 'falhou';
  } catch (e) {
    console.warn('[Aura imagem]', String(e?.message || e).slice(0, 60));
    return null;
  }
}

async function incrementUserCommand(number, ctx = null, commandName = '') {
  // v7.96: contador da Vigilante ("comandos mais usados" do Dark)
  try { require('../aura/auraVigilante').registaComando(commandName, ctx?.remoteJid); } catch {}
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
      const wk = require('./weekKey').buildWeekOps('c'); // v7.80: contador semanal
      await GroupMemberActivity.findOneAndUpdate(
        { groupJid: ctx.remoteJid, memberJid: ctx.senderJid },
        {
          $set: { memberNumber: ctx.senderNumber, pushName: ctx.pushName || '', lastCommandAt: new Date(), lastMessageAt: new Date() },
          $inc: { commands: 1, ...wk.inc },
          $unset: wk.unset,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    } catch (e) {}
  }
}

async function getStickerWatermarkConfigForHandler(ctx) {
  try {
    const pack = await require('./stickerWm').resolvePack(ctx?.remoteJid);
    return {
      packName: pack.channelName || pack.packName || pack.brand || 'Dark Net Ao',
      authorName: pack.brand || 'Dark Net Ao',
      brand: pack.brand || 'Dark Net Ao',
      channelName: pack.channelName || '',
      channelUrl: pack.channelUrl || '',
      publisherWebsite: pack.channelUrl || '',
      androidStoreUrl: pack.androidStoreUrl || '',
      iosStoreUrl: pack.iosStoreUrl || '',
      slogan: pack.slogan || '',
      watermarkText: pack.watermarkText || pack.brand || 'Dark Net Ao',
      visibleWatermark: !!pack.visibleWatermark,
      theme: pack.theme || 'darktoxic',
      packId: pack.packId,
      packUrl: pack.channelUrl || '',
    };
  } catch {
    return { packName: 'Dark Net Ao', authorName: 'Dark Net Ao', brand: 'Dark Net Ao' };
  }
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
    await require('./stickerPack').sendStickerWithPackLink(sock, ctx.remoteJid, stk, { quoted: msg });
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
/** Priority self-controls: the transport invokes this BEFORE its work semaphore. */
async function handleConversationControl(sock, raw) {
  if (!raw?.key || !raw.message || raw.key.fromMe || typeof sock?.sendMessage !== 'function') return false;
  const msg = normalizeIncomingMsg(raw);
  const ctx = getSenderInfo(msg, sock);
  if (ctx.isGroup === false && (ctx.isStatus || ctx.isChannel)) return false;
  const conversation = require('../aura/auraConversation');
  const text = extractText(msg).trim();
  if (!conversation.controlIntent(text)) return false;
  if (await bloquearPvFreeForaSticker(sock, msg, ctx, text)) return true;
  // Este caminho prioritário passa antes do handler normal; aplica a mesma
  // política só-admin para um membro não receber resposta por !pausar,
  // !retomar ou outro controlo conversacional.
  if (await _adminsOnlyBlocksSender(sock, msg, ctx)) return true;
  const turn = conversation.begin(ctx);
  try {
    const result = conversation.process(text, ctx);
    if (result.reply) await sock.sendMessage(ctx.remoteJid, { text: result.reply }, { quoted: msg });
    return !!result.handled;
  } catch (_) {
    console.warn('[Aura pausa] Não consegui processar o controlo prioritário.');
    return true; // Do not reinterpret a failed self-control as a third-party action.
  } finally { conversation.finish(turn); }
}

/** Arrival metadata only: invalidate old conversational work before waiting in the router queue. */
function noteIncomingConversation(sock, raw) {
  if (!raw?.key || !raw.message || raw.key.fromMe) return false;
  const msg = normalizeIncomingMsg(raw);
  const ctx = getSenderInfo(msg, sock);
  if (ctx.isStatus || ctx.isChannel || (!extractText(msg).trim() && !hasMediaPayload(msg.message))) return false;
  return require('../aura/auraConversation').noteIncoming(ctx, { messageId: msg.key.id, timestamp: msg.messageTimestamp });
}

async function handle(sock, msg) {
  if (!msg?.key || !msg.message || typeof sock?.sendMessage !== 'function') return false;
  return requestCache.run(async () => {
    const normalized = normalizeIncomingMsg(msg);
    const conversation = require('../aura/auraConversation');
    const turn = conversation.begin(getSenderInfo(normalized, sock), { timestamp: normalized.messageTimestamp, messageId: normalized.key.id });
    try { return await _handleInner(sock, normalized, turn); }
    finally { conversation.finish(turn); }
  });
}

module.exports = { handle, noteIncomingConversation, handleConversationControl, extractText, getSenderInfo, fillVars, unwrapWhatsAppMessage, normalizeIncomingMsg, pareceComando, bloquearPvFreeForaSticker, fotosPedidas: _fotosPedidas };
