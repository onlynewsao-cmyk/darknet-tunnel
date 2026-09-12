/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║   DARK BOT — AURA STICKER-BAN (v6.89)                        ║
 * ║   O Dark ensina por conversa; ela executa.                   ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * FLUXO (o do print):
 *   1. APRENDIZAGEM — o Dono diz, com um sticker anexado/citado
 *      (ou logo a seguir a ele):
 *        "Se eu responder alguém com este sticker de ban vc remove ele tá"
 *      Ela confirma como pessoa:
 *        "Tá. Responderes com o sticker de ban, eu removo a pessoa. 🖤"
 *      e guarda a regra + o hash do sticker.
 *
 *      Se a frase vier SEM sticker → a regra fica PENDENTE e o próximo
 *      sticker que o Dono mandar nesse chat fica registado:
 *        "Tá. Agora manda-me o sticker de ban para eu o reconhecer. 🖤"
 *
 *   2. EXECUÇÃO — o Dono RESPONDE a alguém com o sticker de ban →
 *      o bot remove a pessoa citada e confirma:
 *        "🩸 Removido por ordem do Dark."
 *
 * SEGURANÇA:
 *   - Só o Dono ensina e só o Dono dispara.
 *   - Nunca remove o próprio Dono nem o bot.
 *   - Nunca actua sem regra activa com hash conhecido.
 *   - Cancelamento por conversa: "cancela a regra do sticker de ban".
 *
 * PERSISTÊNCIA: BotConfig ('sticker_ban_rule') — sobrevive a restarts
 * do Render. Sem MongoDB, degrada para memória (regra perde-se ao
 * reiniciar, o resto funciona).
 */
'use strict';

const _CHAVE = 'sticker_ban_rule';

/** Estado em memória (write-through para o BotConfig). */
let _regra = {
  activa: false,
  pendente: false,   // true = regra aceite mas à espera do sticker
  hash: '',          // sha256 do sticker de ban (hex)
  chat: '',          // chat onde ficou pendente (captura do sticker)
  dono: '',          // número do Dono que ensinou
  criadaEm: 0,
};
let _carregada = false;

const crypto = require('crypto');

async function _carregar() {
  if (_carregada) return;
  _carregada = true;
  try {
    const BotConfig = require('../database/models/BotConfig');
    const salva = await BotConfig.get(_CHAVE, null);
    if (salva && typeof salva === 'object') _regra = { ..._regra, ...salva };
  } catch (_) { /* sem DB → memória */ }
}

async function _guardar() {
  try {
    const BotConfig = require('../database/models/BotConfig');
    await BotConfig.set(_CHAVE, _regra);
  } catch (_) { /* sem DB → memória */ }
}

// ── Hash do sticker ─────────────────────────────────────────
// Baileys dá-nos fileSha256 (Buffer) por sticker — estável por
// ficheiro. Fallback: hash do url se o sha256 vier vazio.
function _hashSticker(stickerMessage) {
  if (!stickerMessage) return '';
  try {
    if (stickerMessage.fileSha256) {
      const buf = Buffer.isBuffer(stickerMessage.fileSha256)
        ? stickerMessage.fileSha256
        : Buffer.from(stickerMessage.fileSha256);
      return buf.toString('hex');
    }
    if (stickerMessage.url) {
      return 'url:' + crypto.createHash('sha256').update(stickerMessage.url).digest('hex');
    }
  } catch (_) {}
  return '';
}

/** Hash do sticker da PRÓPRIA mensagem (se for sticker). */
function hashDaMsg(msg) {
  return _hashSticker(msg?.message?.stickerMessage);
}

/** Hash do sticker CITADO pela mensagem (se a resposta cita um sticker). */
function hashCitado(msg) {
  const ci = msg?.message?.extendedTextMessage?.contextInfo ||
             msg?.message?.stickerMessage?.contextInfo ||
             msg?.message?.imageMessage?.contextInfo ||
             msg?.message?.videoMessage?.contextInfo ||
             msg?.message?.documentMessage?.contextInfo;
  return _hashSticker(ci?.quotedMessage?.stickerMessage);
}

// ── Detecção por frase ──────────────────────────────────────
function _mencionaSticker(t) { return /\b(stickers?|figurinhas?|fig|adesivo)\b/i.test(t); }
function _mencionaRemocao(t) { return /\b(ban|banir|bane|remove|remover|expulsa|expulsar|kick|chuta)\b/i.test(t); }
function _mencionaResponder(t) { return /\b(responder|responde|responderei|reply|replicar)\b/i.test(t); }
function _eCancelamento(t) {
  return /\b(cancela|cancelar|desactiva|desativa|deslig|apaga|esquece|esquecer|remove)\b/i.test(t) &&
         /\b(sticker|figurinha|regra)\b/i.test(t);
}

/**
 * APRENDIZAGEM — o Dono ensina a regra por conversa.
 * @returns {Promise<boolean>} true se respondeu (fluxo consumido).
 */
async function aprender({ sock, msg, ctx, texto }) {
  const t = String(texto || '').trim();
  if (!t || t.length > 300) return false;
  if (!_mencionaSticker(t) || !_mencionaRemocao(t)) return false;
  // A frase do print: "Se eu RESPONDER alguém com este sticker de ban
  // vc remove ele". Exige sinal de resposta/condição para não colher
  // pedidos de ban normais ("bane o Zeca" não menciona sticker).
  if (!_mencionaResponder(t) && !/^\s*(se|quando|caso)\s+/i.test(t)) return false;

  // O sticker pode vir: na própria msg (impossível com texto, mas o
  // caption de media existe), citado pela msg, ou no próximo envio.
  const hash = hashCitado(msg) || hashDaMsg(msg);
  if (hash) {
    _regra = { activa: true, pendente: false, hash, chat: '', dono: ctx.senderNumber, criadaEm: Date.now() };
    await _guardar();
    await sock.sendMessage(ctx.remoteJid, {
      text: 'Tá. Responderes com o sticker de ban, eu removo a pessoa. 🖤',
    }, { quoted: msg }).catch(() => {});
    return true;
  }

  // sem sticker à mão → fica pendente: o próximo sticker do Dono
  // neste chat é o sticker de ban.
  _regra = { activa: true, pendente: true, hash: '', chat: ctx.remoteJid, dono: ctx.senderNumber, criadaEm: Date.now() };
  await _guardar();
  await sock.sendMessage(ctx.remoteJid, {
    text: 'Tá. Manda-me agora o sticker de ban para eu o reconhecer. 🖤',
  }, { quoted: msg }).catch(() => {});
  return true;
}

/**
 * CAPTURA — regra pendente: o próximo sticker do Dono fica registado.
 * @returns {Promise<boolean>}
 */
async function capturarPendente({ sock, msg, ctx, isOwner }) {
  await _carregar();
  if (!_regra.activa || !_regra.pendente || !isOwner) return false;
  const hash = hashDaMsg(msg);
  if (!hash) return false;
  if (_regra.chat && ctx.remoteJid !== _regra.chat) return false;

  _regra = { ..._regra, pendente: false, hash };
  await _guardar();
  await sock.sendMessage(ctx.remoteJid, {
    text: '🩸 Sticker de ban registado. Responde a alguém com ele e essa pessoa sai.',
  }, { quoted: msg }).catch(() => {});
  return true;
}

/**
 * EXECUÇÃO — o Dono responde a alguém com o sticker de ban → remove.
 * @returns {Promise<boolean>} true se consumiu a mensagem.
 */
async function executar({ sock, msg, ctx, isOwner }) {
  await _carregar();
  if (!isOwner || !ctx.isGroup) return false;
  if (!_regra.activa || _regra.pendente) return false;

  const sticker = msg?.message?.stickerMessage;
  if (!sticker) return false;
  const hash = _hashSticker(sticker);
  if (!hash || hash !== _regra.hash) return false;

  // tem de ser RESPOSTA a alguém (contextInfo com participant citado)
  const ci = sticker.contextInfo;
  const alvo = ci?.participant || '';
  if (!alvo || !ci?.stanzaId) return false;

  // ── Guardas: nunca o Dono, nunca o bot ────────────────────
  const config = require('../config');
  const botJid = (sock.user?.id || '').split(':')[0];
  // jids podem trazer sufixo de dispositivo (…:5@s.whatsapp.net)
  const alvoNum = String(alvo).split('@')[0].split(':')[0].replace(/\D/g, '');
  if (alvoNum === String(config.owner.number || '').replace(/\D/g, '')) return false;
  if (alvoNum === String(process.env.BOT_NUMBER || '').replace(/\D/g, '')) return false;
  if (alvoNum && alvoNum === String(ctx.senderNumber || '').replace(/\D/g, '')) return false;
  if (botJid && alvoNum === botJid.replace(/\D/g, '')) return false;

  try {
    const r = await sock.groupParticipantsUpdate(ctx.remoteJid, [alvo], 'remove');
    const falhou = Array.isArray(r) && r[0] && r[0].status &&
      !['200', 'ok', 'success'].includes(String(r[0].status));
    const nomeDono = config.owner.name || 'Dark';
    if (falhou) {
      await sock.sendMessage(ctx.remoteJid, {
        text: 'Não consegui remover — verifica se sou admin do grupo. 🥀',
      }, { quoted: msg }).catch(() => {});
    } else {
      await sock.sendMessage(ctx.remoteJid, {
        text: `🩸 Removido por ordem do ${nomeDono}.`,
      }, { quoted: msg }).catch(() => {});
    }
  } catch (e) {
    await sock.sendMessage(ctx.remoteJid, {
      text: 'Não consegui remover — verifica se sou admin do grupo. 🥀',
    }, { quoted: msg }).catch(() => {});
  }
  return true;
}

/**
 * CANCELAMENTO — "cancela a regra do sticker de ban".
 * @returns {Promise<boolean>}
 */
async function cancelar({ sock, msg, ctx, texto, isOwner }) {
  if (!isOwner) return false;
  const t = String(texto || '').trim();
  if (!t || t.length > 200) return false;
  if (!_eCancelamento(t) || !_mencionaRemocao(t)) return false;
  await _carregar();
  if (!_regra.activa && !_regra.pendente) return false;

  _regra = { activa: false, pendente: false, hash: '', chat: '', dono: '', criadaEm: 0 };
  await _guardar();
  await sock.sendMessage(ctx.remoteJid, {
    text: 'Regra do sticker de ban cancelada. Ninguém sai mais por sticker. 🌙',
  }, { quoted: msg }).catch(() => {});
  return true;
}

/** Diagnóstico (/diag, testes). */
async function estado() {
  await _carregar();
  return { ..._regra, hash: _regra.hash ? _regra.hash.slice(0, 12) + '…' : '' };
}

/** Reset total (testes). */
async function _reset() {
  _regra = { activa: false, pendente: false, hash: '', chat: '', dono: '', criadaEm: 0 };
  _carregada = true;
  await _guardar().catch(() => {});
}

module.exports = { aprender, capturarPendente, executar, cancelar, estado, _reset, hashDaMsg, hashCitado };
