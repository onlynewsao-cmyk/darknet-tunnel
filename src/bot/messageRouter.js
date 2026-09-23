'use strict';

/**
 * Entrada única de mensagens do WhatsApp.
 *
 * O listener antigo processava apenas m.messages[0]. Em eventos em lote,
 * mensagens privadas podiam chegar no socket e nunca passar pelo handler.
 * Este router processa cada mensagem individualmente, normaliza LID/PN,
 * ignora apenas ruído e regista falhas reais de resposta.
 *
 * v7.52 TURBO:
 *  - status@broadcast é ignorado ANTES de qualquer I/O (o feed de estados
 *    não é tratado por nada no pipeline; antes pagava DB+prefixo+antis+AURA);
 *  - mensagens do lote correm em PARALELO entre chats (sequencial dentro
 *    do mesmo chat, para não trocar a ordem das respostas);
 *  - tecto global de 8 mensagens em voo: com 1 vCPU, mais que isso é
 *    thrash — o resto espera em fila FIFO em vez de degradar tudo.
 */
const commandHandler = require('./commandHandler');
const messageListener = require('./messageListener');
const antiLink = require('./antiLink');
const antispam = require('./antiSpam');
const antiTipos = require('./antiTipos');
const antiFoba = require('./antiFoba');
const autoApresentar = require('./autoApresentar');
const prefixEngine = require('./prefixEngine');
const humanizer = require('./humanizer');

// ── Semáforo global (1 vCPU: 8 em voo, resto em fila) ──────────
// NOTA: a função principal também se chama `process` e faz sombra ao
// global `process` neste módulo — por isso usa-se globalThis aqui.
const MAX_VOO = Number(globalThis.process.env.ROUTER_MAX_VOO || 8);
let _voando = 0;
const _fila = [];
async function _adquirir() {
  if (_voando < MAX_VOO) { _voando++; return; }
  await new Promise(res => _fila.push(res));
  _voando++;
}
function _libertar() {
  _voando--;
  const next = _fila.shift();
  if (next) next();
}

// ── v7.82: dedup de mensagens ─────────────────────────────
// O Baileys re-emite (history-sync 'append', retries de rede). Sem isto
// a mesma mensagem era processada 2x — e como a IA é estocástica, cada
// cópia podia seguir um caminho diferente (print: duas respostas
// contraditórias no mesmo minuto). Chave: chat|id|participante.
const _vistos = new Set();
function _chaveMsg(msg) {
  const k = msg?.key || {};
  return `${k.remoteJid || ''}|${k.id || ''}|${k.participant || ''}`;
}

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
  if (!keys.length) return true;
  // v12.2: reactionMessage NÃO é ruído — Aura vê quem reagiu com emoji!
  const ignore = [
    'protocolMessage', 'senderKeyDistributionMessage',
    'encReactionMessage', 'keepInChatMessage', 'pinInChatMessage',
    'messageContextInfo',
  ];
  // Se só tem keys de ignore, é ruído. Se tem reactionMessage, NÃO é ruído
  if (keys.includes('reactionMessage')) return false;
  return keys.every(k => ignore.includes(k));
}

function maskJid(jid = '') {
  const s = String(jid);
  if (s.endsWith('@g.us')) return `grupo·${s.slice(-8)}`;
  return `pv·${s.replace(/\D/g, '').slice(-6)}`;
}

async function _tratarUma(bot, batch, raw) {
  if (!raw?.message) return;
  if (raw?.key?.id) { // v7.82: re-emissão → ignora (barato, antes do semáforo)
    const _k = _chaveMsg(raw);
    if (_vistos.has(_k)) return;
    _vistos.add(_k);
    if (_vistos.size > 2000) _vistos.clear();
  }
  let msg = raw;
  await _adquirir();
  try {
    if (typeof commandHandler.normalizeIncomingMsg === 'function') {
      msg = commandHandler.normalizeIncomingMsg(raw);
    }
    // v7.52: feed de estados — nada no pipeline o trata; sair antes de I/O.
    if (msg.key?.remoteJid === 'status@broadcast') return;
    bot.msgCount = (bot.msgCount || 0) + 1;
    const entry = {
      ts: new Date().toISOString().slice(11, 19),
      chat: maskJid(msg.key?.remoteJid),
      de: maskJid(msg.key?.participant || msg.key?.remoteJid),
      tipo: (Object.keys(msg.message || {}).find(k => !/contextInfo|messageContextInfo/.test(k)) || '?').slice(0, 22),
      tratada: null,
    };
    bot.recentInbox = Array.isArray(bot.recentInbox) ? bot.recentInbox : [];
    bot.recentInbox.push(entry);
    if (bot.recentInbox.length > 20) bot.recentInbox.shift();

    // v12.2: REAÇÕES — Aura vê quem reagiu com emoji!
    if (msg.message?.reactionMessage) {
      try {
        const auraReaction = require('../aura/auraReaction');
        const ctx = { remoteJid: msg.key?.remoteJid, senderNumber: (msg.key?.participant || msg.key?.remoteJid || '').split('@')[0] };
        await auraReaction.handleReaction(bot.sock, msg, ctx);
      } catch (e) { console.warn('[Reaction]', e.message?.slice(0,60)); }
      entry.tratada = true;
      entry.tipo = 'reaction';
      return;
    }

    // v12.2: VIEW-ONCE — Aura vê e salva antes de desaparecer!
    if (msg.message?.viewOnceMessage || msg.message?.viewOnceMessageV2 || msg.message?.viewOnceMessageV2Extension ||
        msg.message?.imageMessage?.viewOnce || msg.message?.videoMessage?.viewOnce) {
      try {
        const viewOnceMod = require('../aura/auraViewOnce');
        await viewOnceMod.handleViewOnce(bot.sock, msg, { isOwner: false });
        console.log('[Router ViewOnce] salvo');
      } catch (e) { console.warn('[Router ViewOnce]', e.message?.slice(0,60)); }
      // Não retorna — deixa passar pro commandHandler também ver
    }

    if (isNoise(msg)) { entry.tratada = false; return; }

    // Mensagens próprias: só COMANDOS com prefixo (subdono no telemóvel).
    // Respostas do bot não têm prefixo → ignoradas → sem loop infinito.
    if (msg.key?.fromMe) {
      if (!(await ehComandoProprio(msg))) { entry.tratada = false; return; }
      entry.de = 'bot·self';
      const tratada = await commandHandler.handle(bot.sock, msg).catch((err) => {
        console.error('[COMMAND] handler(self):', err?.stack || err?.message || err);
        return false;
      });
      entry.tratada = !!tratada;
      if (tratada) bot.cmdCount = (bot.cmdCount || 0) + 1;
      return;
    }

    // v7.45 — humanizador: regista a msg recebida (para "lido" + "a escrever…" antes de responder)
    humanizer.notaRecebida(msg);

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
      // v7.84 — ESCUDO VIVO: links permitidos ativam o download automático
      require('./autoDl').check(bot.sock, msg).catch((err) => {
        if (!/Closed/i.test(String(err?.message || err))) console.error('[AUTODL]', err?.message || err);
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
      // v7.47 incoming-cases — anti-fobados (divulgação oculta + DDI blacklist)
      antiFoba.check(bot.sock, msg).catch((err) => {
        if (!/Closed/i.test(String(err?.message || err))) console.error('[ANTIFOBA]', err?.message || err);
        return false;
      }),
    ]);
    // v7.47 incoming-cases — auto-apresentação: membro falou → cancela remoção (síncrono, barato)
    try { autoApresentar.onMessage(bot.sock, msg); } catch {}
    entry.tratada = !!results[0];
    if (results[0]) bot.cmdCount = (bot.cmdCount || 0) + 1;
    // PV sem resposta: uma pessoa lê na mesma (marca lido com atraso natural)
    if (!results[0]) humanizer.lerSemResponder(bot.sock, msg);
  } catch (err) {
    console.error('[MESSAGE_ROUTER]', err?.stack || err?.message || err);
  } finally {
    _libertar();
  }
}

async function process(bot, batch) {
  // v7.82: só 'notify' é mensagem nova; 'append'/histórico não se responde
  // (type ausente = testes/chamadas directas → processa na mesma).
  if (batch && batch.type && batch.type !== 'notify') return;
  const messages = Array.isArray(batch?.messages) ? batch.messages : [];
  if (messages.length <= 1) {
    for (const raw of messages) await _tratarUma(bot, batch, raw);
    return;
  }
  // v7.52: sequencial por chat (ordem das respostas), paralelo entre chats.
  const porChat = new Map();
  for (const raw of messages) {
    const chat = raw?.key?.remoteJid || '?';
    if (!porChat.has(chat)) porChat.set(chat, []);
    porChat.get(chat).push(raw);
  }
  await Promise.all([...porChat.values()].map(async (lista) => {
    for (const raw of lista) await _tratarUma(bot, batch, raw);
  }));
}

module.exports = { process, isNoise, maskJid, _vistos };
