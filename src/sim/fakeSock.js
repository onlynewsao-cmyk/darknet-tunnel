/**
 * fakeSock.js — Socket Baileys falso, fiel ao real.
 *
 * Serve para exercitar o código VERDADEIRO (commandHandler, callHandler,
 * realCall, callBridge) sem WhatsApp ligado e sem risco de ban.
 *
 * Regista tudo o que passa: mensagens enviadas e stanzas <call> emitidos.
 * Assim vê-se exactamente o que o bot mandaria para a rede.
 */
'use strict';

const { EventEmitter } = require('events');
const { randomBytes } = require('crypto');

function criarFakeSock(opts = {}) {
  const botNumber = String(opts.botNumber || '244949926074').replace(/\D/g, '');
  const meId = `${botNumber}:1@s.whatsapp.net`;

  const enviadas = [];   // mensagens sendMessage
  const stanzas = [];    // nodes passados a query()
  const eventos = [];    // trilho de diagnóstico

  const ev = new EventEmitter();
  ev.setMaxListeners(50);

  const log = (tipo, dados) => {
    const e = { t: Date.now(), tipo, ...dados };
    eventos.push(e);
    if (eventos.length > 500) eventos.shift();
    return e;
  };

  const sock = {
    ev,
    type: 'md',
    user: { id: meId, name: opts.botName || 'DARK BOT' },
    authState: {
      creds: {
        me: { id: meId, lid: opts.botLid || '213907088089212@lid' },
        account: { details: new Uint8Array([1, 2, 3]), accountSignature: new Uint8Array(64) }
      }
    },

    // ── envio de mensagens ────────────────────────────────
    sendMessage: async (jid, content, options = {}) => {
      const item = {
        jid,
        texto: content?.text || content?.caption || null,
        tipo: content?.audio ? 'audio'
          : content?.image ? 'image'
          : content?.video ? 'video'
          : content?.sticker ? 'sticker'
          : content?.document ? 'document'
          : content?.text ? 'text' : 'outro',
        ptt: !!content?.ptt,
        quoted: !!options?.quoted,
        quando: new Date().toISOString()
      };
      enviadas.push(item);
      log('sendMessage', { jid, tipo: item.tipo, texto: (item.texto || '').slice(0, 120) });
      return { key: { id: randomBytes(8).toString('hex').toUpperCase(), remoteJid: jid, fromMe: true } };
    },

    // ── internos usados pelo realCall ─────────────────────
    query: async (node) => {
      stanzas.push(node);
      log('query', { tag: node?.tag, to: node?.attrs?.to, filhos: (node?.content || []).map(c => c?.tag) });

      if (node?.tag === 'call') {
        const filho = (node.content || [])[0];
        if (filho?.tag === 'offer') {
          // O servidor real responde com <call><relaylatency/></call>
          return {
            tag: 'call',
            attrs: { from: node.attrs.to, id: node.attrs.id },
            content: [{ tag: 'relaylatency', attrs: {}, content: undefined }]
          };
        }
        if (filho?.tag === 'terminate') {
          return { tag: 'call', attrs: { from: node.attrs.to, id: node.attrs.id }, content: undefined };
        }
      }
      return { tag: 'iq', attrs: { type: 'result', id: node?.attrs?.id }, content: undefined };
    },

    generateMessageTag: () => randomBytes(8).toString('hex').toUpperCase(),

    // Baileys real tem sendNode (fire-and-forget, sem esperar resposta).
    // O handshake de atendimento usa-o para ack/receipt/preaccept/accept.
    sendNode: async (node) => {
      stanzas.push(node);
      return undefined;
    },

    getUSyncDevices: async (jids) => {
      // simula 2 dispositivos por destino (telemóvel + web), como o real
      const out = [];
      for (const j of jids) {
        const user = String(j).split('@')[0].split(':')[0];
        out.push({ user, device: 0 });
        out.push({ user, device: 12 });
      }
      return out;
    },

    assertSessions: async () => true,

    createParticipantNodes: async (jids, message, extraAttrs) => ({
      nodes: jids.map(j => ({
        tag: 'to',
        attrs: { jid: j },
        content: [{
          tag: 'enc',
          attrs: { v: '2', type: 'pkmsg', ...(extraAttrs || {}) },
          content: new Uint8Array([9, 9, 9])
        }]
      })),
      shouldIncludeDeviceIdentity: true
    }),

    // ── chamadas ──────────────────────────────────────────
    createCallLink: async (tipo) => 'SIMTOKEN_' + String(tipo).toUpperCase(),
    rejectCall: async (callId, from) => { log('rejectCall', { callId, from }); return true; },

    // ── auxiliares comuns ─────────────────────────────────
    groupMetadata: async (jid) => ({
      id: jid,
      subject: 'Grupo de Teste',
      owner: `${botNumber}@s.whatsapp.net`,
      participants: [
        { id: `${botNumber}@s.whatsapp.net`, admin: 'superadmin' },
        { id: '244945280380@s.whatsapp.net', admin: 'admin' },
        { id: '244900000001@s.whatsapp.net', admin: null }
      ]
    }),
    sendPresenceUpdate: async () => {},
    readMessages: async () => {},
    profilePictureUrl: async () => null,
    onWhatsApp: async (n) => [{ exists: true, jid: String(n).replace(/\D/g, '') + '@s.whatsapp.net' }],
    updateMediaMessage: async (m) => m,
    sendReceipt: async () => {},
    presenceSubscribe: async () => {},

    // ── inspecção ─────────────────────────────────────────
    _sim: {
      enviadas, stanzas, eventos,
      limpar() { enviadas.length = 0; stanzas.length = 0; eventos.length = 0; }
    }
  };

  return sock;
}

/**
 * Constrói uma mensagem no formato exacto do Baileys.
 */
function criarMensagem({ texto = 'oi', de = '244945280380', grupo = null, pushName = 'Dono', fromMe = false } = {}) {
  const autor = String(de).replace(/\D/g, '') + '@s.whatsapp.net';
  const remoteJid = grupo ? grupo : autor;
  return {
    key: {
      id: randomBytes(8).toString('hex').toUpperCase(),
      remoteJid,
      fromMe,
      ...(grupo ? { participant: autor } : {})
    },
    pushName,
    messageTimestamp: Math.floor(Date.now() / 1000),
    message: { conversation: texto }
  };
}

/**
 * Constrói um evento de chamada recebida, como o Baileys emite.
 */
function criarChamada({ de = '244945280380', isVideo = false, status = 'offer', isGroup = false } = {}) {
  const from = String(de).includes('@') ? de : String(de).replace(/\D/g, '') + '@s.whatsapp.net';
  return {
    chatId: from,
    from,
    id: randomBytes(16).toString('hex').toUpperCase(),
    date: new Date(),
    offline: false,
    status,
    isVideo,
    isGroup
  };
}

module.exports = { criarFakeSock, criarMensagem, criarChamada };
