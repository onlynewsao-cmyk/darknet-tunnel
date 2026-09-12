'use strict';

/**
 * Entrada única de mensagens do WhatsApp.
 *
 * O listener antigo processava apenas m.messages[0]. Em eventos em lote,
 * mensagens privadas podiam chegar no socket e nunca passar pelo handler.
 * Este router processa cada mensagem individualmente, normaliza LID/PN,
 * ignora apenas ruído e regista falhas reais de resposta.
 */
const commandHandler = require('./commandHandler');
const messageListener = require('./messageListener');
const antiLink = require('./antiLink');
const antispam = require('./antiSpam');
const antiTipos = require('./antiTipos');
const prefixEngine = require('./prefixEngine');
const humanizer = require('./humanizer');

/**
 * v7.27: o número do bot é SUBDONO. As mensagens `fromMe` (escritas no
 * telemóvel onde o bot está ligado) entram no pipeline SÓ quando começam
 * por um prefixo activo — ou seja, quando são um comando. Tudo o que o
 * próprio bot envia (respostas, cards, áudios, botões) nunca tem prefixo
 * no início do texto, logo continua a ser ignorado → sem loop.
 */
async function ehComandoProprio(msg) {
  try {
    const texto = String(commandHandler.extractText(msg) || '').trimStart();
    if (!texto) return false;
    const prefixes = await prefixEngine.getAllActivePrefixes(msg.key?.remoteJid);
    if (!prefixes.some(p => p && texto.startsWith(p))) return false;
    // tem de haver um nome de comando logo a seguir ao prefixo (evita "..." ou "!!!")
    const p = prefixes.find(p => texto.startsWith(p));
    return /^[a-z0-9]/i.test(texto.slice(p.length));
  } catch { return false; }
}

function isNoise(msg) {
  const keys = Object.keys(msg?.message || {});
  return !keys.length || keys.every(k => [
    'protocolMessage', 'senderKeyDistributionMessage', 'reactionMessage',
    'encReactionMessage', 'keepInChatMessage', 'pinInChatMessage',
    'messageContextInfo',
  ].includes(k));
}

function maskJid(jid = '') {
  const s = String(jid);
  if (s.endsWith('@g.us')) return `grupo·${s.slice(-8)}`;
  return `pv·${s.replace(/\D/g, '').slice(-6)}`;
}

async function process(bot, batch) {
  const messages = Array.isArray(batch?.messages) ? batch.messages : [];
  for (const raw of messages) {
    if (!raw?.message) continue;
    let msg = raw;
    try {
      if (typeof commandHandler.normalizeIncomingMsg === 'function') {
        msg = commandHandler.normalizeIncomingMsg(raw);
      }
      bot.msgCount = (bot.msgCount || 0) + 1;
      const entry = {
        ts: new Date().toISOString().slice(11, 19),
        chat: msg.key?.remoteJid === 'status@broadcast' ? 'status' : maskJid(msg.key?.remoteJid),
        de: maskJid(msg.key?.participant || msg.key?.remoteJid),
        tipo: (Object.keys(msg.message || {}).find(k => !/contextInfo|messageContextInfo/.test(k)) || '?').slice(0, 22),
        tratada: null,
      };
      bot.recentInbox = Array.isArray(bot.recentInbox) ? bot.recentInbox : [];
      bot.recentInbox.push(entry);
      if (bot.recentInbox.length > 20) bot.recentInbox.shift();

      if (isNoise(msg)) { entry.tratada = false; continue; }

      // Mensagens próprias: só COMANDOS com prefixo (subdono no telemóvel).
      // Respostas do bot não têm prefixo → ignoradas → sem loop infinito.
      if (msg.key?.fromMe) {
        if (!(await ehComandoProprio(msg))) { entry.tratada = false; continue; }
        entry.de = 'bot·self';
        const tratada = await commandHandler.handle(bot.sock, msg).catch((err) => {
          console.error('[COMMAND] handler(self):', err?.stack || err?.message || err);
          return false;
        });
        entry.tratada = !!tratada;
        if (tratada) bot.cmdCount = (bot.cmdCount || 0) + 1;
        continue;
      }

      // v7.45 — humanizador: regista a msg recebida (para "lido" + "a escrever…" antes de responder)
      if (msg.key?.remoteJid !== 'status@broadcast') humanizer.notaRecebida(msg);

      messageListener.onUpsert(bot.sock, { ...batch, messages: [msg] }, bot.io).catch((err) => {
        if (!/Closed/i.test(String(err?.message || err))) console.error('[MESSAGE_LISTENER]', err?.stack || err);
      });

      const results = await Promise.all([
        commandHandler.handle(bot.sock, msg).catch((err) => {
          console.error('[COMMAND] handler:', err?.stack || err?.message || err);
          return false;
        }),
        antiLink.check(bot.sock, msg).catch((err) => {
          if (!/Closed/i.test(String(err?.message || err))) console.error('[ANTILINK]', err?.message || err);
          return false;
        }),
        antispam.check(bot.sock, msg).catch((err) => {
          if (!/Closed/i.test(String(err?.message || err))) console.error('[ANTISPAM]', err?.message || err);
          return false;
        }),
        // v7.46 — antistatus / antimencao / antipagamento / antiinvisivel / antiflood / antidoc / …
        antiTipos.check(bot.sock, msg).catch((err) => {
          if (!/Closed/i.test(String(err?.message || err))) console.error('[ANTITIPOS]', err?.message || err);
          return false;
        }),
      ]);
      entry.tratada = !!results[0];
      if (results[0]) bot.cmdCount = (bot.cmdCount || 0) + 1;
      // PV sem resposta: uma pessoa lê na mesma (marca lido com atraso natural)
      if (!results[0]) humanizer.lerSemResponder(bot.sock, msg);
    } catch (err) {
      console.error('[MESSAGE_ROUTER]', err?.stack || err?.message || err);
    }
  }
}

module.exports = { process, isNoise, maskJid };
