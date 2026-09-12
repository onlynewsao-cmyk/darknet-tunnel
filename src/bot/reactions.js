/**
 * Sistema de reações automáticas por categoria de comando
 */

// Emojis de "processando" por categoria
const PROCESSING = {
  audio: '🎵', music: '🎵', play: '🎵', spotify: '🎵', soundcloud: '🎵',
  video: '🎬', tiktok: '🎬', instagram: '📸', fb: '📘', twitter: '🐦', pinterest: '📌',
  sticker: '🎨', s: '🎨', fig: '🎨', attp: '✨', ttp: '✨', toimg: '🖼️', figura: '🎨',
  ia: '🧠', gpt: '🧠', chatgpt: '🧠', ai: '🧠', llm: '🧠', imagem: '🎨', img: '🎨',
  decrypt: '🔓', vpn: '🔓', dec: '🔓', vpndec: '🔓',
  download: '📥', dl: '📥',
  ban: '🚫', kick: '🚫', promote: '👑', demote: '⬇️',
  forca: '🎮', quiz: '🧠', adivinha: '🎯', blackjack: '🎴', russa: '🔫',
  trabalhar: '💼', crime: '🦹', roubar: '🦹', daily: '🎁', apostar: '🎰',
  comprar: '🛒', loja: '🏪', transferir: '💸', depositar: '🏦', sacar: '🏦',
  broadcast: '📢', send: '📤', sendgroup: '📤',
  todos: '📢', hidetag: '📢',
  clima: '🌤️', translate: '🌐', qrcode: '📱', calc: '🧮', noticias: '📰', pesquisar: '🔎', resumir: '📝',
  cmdsocultos: '🕳️', adultsearch: '🔞', adultvideo: '🔞', hotchat: '🥵', adultmode: '🕳️', adultapi: '🕳️',
  invokedono: '👑', aceitarinvocacao: '✅', recusarinvocacao: '❌', vipcmds: '⭐',
  casar: '💍', divorciar: '💔', adotar: '👶',
  abracar: '🤗', beijar: '💋', cafune: '🥰', declarar: '💌', flertar: '😏', dancar: '💃',
  cafe: '☕', aura: '⚡', godadm: '👑', meditar: '🧘', treinar: '🏋️', estudar: '📚', cantar: '🎤', programar: '💻', gamer: '🎮', rir: '😂', chorar: '😭',
  tapa: '👋', soco: '👊', chutar: '🦵', tiro: '🔫', facada: '🔪', matar: '💀',
};

// Emojis de sucesso
const SUCCESS = '✅';
const ERROR = '❌';
const WAIT = '⏳';

function getProcessingEmoji(commandName) {
  if (!commandName) return WAIT;
  return PROCESSING[commandName.toLowerCase()] || WAIT;
}

function getSuccessEmoji(commandName) {
  return SUCCESS;
}

function getErrorEmoji(commandName) {
  return ERROR;
}

/**
 * Reage à mensagem com emoji apropriado
 */
async function reactionsAtivas() {
  try { const v = await require('./botConfigCache').get('reactions_enabled', true); return !(v === false || v === 'false'); } catch { return true; }
}
async function react(sock, msg, emoji) {
  // v7.35: respeita o interruptor "Auto-reações" do dashboard (reactions_enabled)
  if (!(await reactionsAtivas())) return;
  try {
    await sock.sendMessage(msg.key.remoteJid, {
      react: { text: emoji, key: msg.key }
    });
  } catch (e) { /* ignora */ }
}

// Comandos que NUNCA devem ter reação de ⏳ (são rápidos e de texto)
const NO_REACT_CMDS = new Set([
  'menu','menubtn','menup','menudono','maiscmds','cmdsocultos',
  'menudownload','menuia','menustickers','menufigurinhas','menujogos',
  'menueconomia','menucoins','menufamilia','menudiversao','menustatus',
  'menuaudio','menugrupo','menuadm','menulogos','alteradores','brincadeiras',
  'down','criador','donos','ping','info','id','perfil','genero','alterargenero',
  'jid','dono','start','vip','assinar','alugar','statusalugar','aiapis',
  'aimemoria','airesetar','aiton','prefixos','setprefix',
  'dado','moeda','piada','frase','horoscopo','listcases','addcase','delcase',
  'saldo','daily','inventario','loja','familia','esposa','regras',
  'link','grupo','admins','antilink','antispam','welcome',
  'rank','rankcoins',
]);

async function reactStart(sock, msg, commandName) {
  // Não reage em comandos de texto/menu (são imediatos)
  if (NO_REACT_CMDS.has((commandName || '').toLowerCase())) return;
  await react(sock, msg, getProcessingEmoji(commandName));
}

async function reactSuccess(sock, msg, commandName) {
  await react(sock, msg, getSuccessEmoji(commandName));
}

async function reactError(sock, msg, commandName) {
  await react(sock, msg, getErrorEmoji(commandName));
}

async function reactClear(sock, msg) {
  // Limpa a reação
  try {
    await sock.sendMessage(msg.key.remoteJid, {
      react: { text: '', key: msg.key }
    });
  } catch (e) {}
}

module.exports = {
  react, reactStart, reactSuccess, reactError, reactClear,
  getProcessingEmoji, getSuccessEmoji, getErrorEmoji,
  PROCESSING, SUCCESS, ERROR, WAIT,
};
