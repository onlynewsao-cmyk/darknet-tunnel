/**
 * DARK BOT v5.1 — Button Handler ULTRA 🕸️
 * Motor completo de interactividade via @systemzero/baileys
 *
 * ── PORQUE É QUE OS BOTÕES NÃO APARECIAM ANTES ────────────────
 * 1. A cascata antiga tentava PRIMEIRO o interactiveMessage SEM
 *    wrapper `viewOnceMessage` + `messageContextInfo`. O WhatsApp
 *    não renderiza botões assim — mas o relayMessage "sucesso"
 *    impedia o fallback correcto de correr.
 * 2. Faltava o `additionalNodes` biz/interactive (native_flow v9)
 *    que o servidor do WhatsApp usa para converter a mensagem.
 *
 * ── CASCATA NOVA (ordem de robustez) ──────────────────────────
 *  sendButtons() tenta:
 *   1º sendInteractive()  — viewOnce + messageContextInfo +
 *                           nativeFlow quick_reply + additionalNodes
 *   2º sendButtonV2()     — ButtonV2 nativo do @systemzero (MB.cjs)
 *   3º sendNativeDirect() — interactiveMessage simples
 *   4º TEXTO formatado    — sempre funciona
 *
 * Métodos disponíveis:
 *  sendButtonV2()   — ButtonV2 nativo do @systemzero (botões clicáveis reais)
 *  sendCarousel()   — Carousel com cards + imagem + botões
 *  sendButtons()    — cascata automática acima
 *  sendList()       — single_select interactivo
 *  sendUrlButton()  — botão de link (cta_url)
 *  sendCopyButton() — botão de copiar (cta_copy)
 *  sendCallButton() — botão de chamada (cta_call)
 */

'use strict';

const {
  generateWAMessageFromContent,
  proto,
  prepareWAMessageMedia,
} = require('@systemzero/baileys');

// ── Lazy load MB.cjs ────────────────────────────────────────
let _MB = null;
function getMB() {
  if (_MB) return _MB;
  try { _MB = require('@systemzero/baileys/lib/MB.cjs'); } catch {}
  return _MB;
}

// ── additionalNodes — o "truque" native_flow do servidor WA ─
const NATIVE_FLOW_NODES = [
  {
    tag: 'biz',
    attrs: {},
    content: [
      {
        tag: 'interactive',
        attrs: { type: 'native_flow', v: '1' },
        content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }],
      },
    ],
  },
];

// ─────────────────────────────────────────────
// FALLBACK TEXTO — sempre funciona
// ─────────────────────────────────────────────
function buttonsText(title, footer, buttons = []) {
  const rows = buttons.map((b, i) =>
    `┃ ${String(i + 1).padStart(2, '0')} • *${b.text}*` +
    (String(b.id || '').startsWith('!') || String(b.id || '').match(/^[^a-z0-9]*[a-z]/i)
      ? `\n┃     ↳ \`${b.id}\``
      : '')
  ).join('\n');
  return (
    `╭━━━〔 🕸️ DARK SIDE 〕━━━╮\n` +
    `${title}\n` +
    `┣━━━━━━━━━━━━━━━━━━━━\n${rows}\n` +
    `╰━━━〔 ⚡ ${footer || (require('../config').bot.name + ' 🕸️')} 〕━━━╯\n\n` +
    `💡 *Toca numa opção ou digita o comando com o prefixo.*`
  );
}

function normalizeButtons(btns = [], max = 8) {
  return (btns || [])
    .filter((b) => b?.id && b?.text)
    .slice(0, max)
    .map((b) => ({ id: String(b.id).trim().slice(0, 250), text: String(b.text).slice(0, 24) }));
}

// ─────────────────────────────────────────────
// HEADER COM IMAGEM
// ─────────────────────────────────────────────
async function buildHeader(sock, image) {
  const empty = proto.Message.InteractiveMessage.Header.fromObject({
    title: '', subtitle: '', hasMediaAttachment: false,
  });
  if (!image) return empty;
  try {
    let buf = image;
    if (!Buffer.isBuffer(image)) {
      const { fetchBuffer } = require('./mediaHandler');
      buf = await fetchBuffer(image);
    }
    if (!buf || buf.length < 100) return empty;
    const media = await prepareWAMessageMedia({ image: buf }, { upload: sock.waUploadToServer });
    return proto.Message.InteractiveMessage.Header.fromObject({
      title: '', subtitle: '', hasMediaAttachment: true,
      imageMessage: media.imageMessage,
    });
  } catch {
    return empty;
  }
}

// ─────────────────────────────────────────────
// 1º MÉTODO — INTERACTIVE VIEWONCE (o mais compatível)
// viewOnceMessage + messageContextInfo + additionalNodes
// ─────────────────────────────────────────────
async function sendInteractive(sock, jid, title, footer, buttons, quoted = null, opts = {}) {
  const btns = buttons.map((b) => ({
    name: 'quick_reply',
    buttonParamsJson: JSON.stringify({ display_text: b.text, id: b.id }),
  }));

  const header = await buildHeader(sock, opts.image);

  const interactive = {
    body: proto.Message.InteractiveMessage.Body.fromObject({ text: title }),
    footer: proto.Message.InteractiveMessage.Footer.fromObject({ text: footer || (require('../config').bot.name + ' 🕸️') }),
    header,
    nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
      buttons: btns,
      messageParamsJson: '',
    }),
  };

  const m = generateWAMessageFromContent(
    jid,
    {
      viewOnceMessage: {
        message: {
          messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
          interactiveMessage: proto.Message.InteractiveMessage.fromObject(interactive),
        },
      },
    },
    { userJid: sock.user?.id, quoted }
  );

  return sock.relayMessage(jid, m.message, {
    messageId: m.key.id,
    additionalNodes: NATIVE_FLOW_NODES,
  });
}

// ─────────────────────────────────────────────
// 2º MÉTODO — BUTTONV2 nativo @systemzero (MB.cjs)
// ─────────────────────────────────────────────
/**
 * Envia mensagem com botões ButtonV2 reais.
 * @param {string}   title     — título do card (setTitle)
 * @param {string}   body      — corpo do card (setBody)
 * @param {string}   footer    — rodapé (setFooter)
 * @param {Array}    buttons   — [{text, id}]
 * @param {string}   thumbnail — URL ou Buffer da imagem (opcional)
 * @param {object}   quoted    — mensagem original para citar
 */
async function sendButtonV2(sock, jid, title, body, footer, buttons, thumbnail = null, quoted = null) {
  const MB = getMB();
  if (!MB?.ButtonV2) throw new Error('ButtonV2 indisponível');

  const build = (withThumb) => {
    const msg = new MB.ButtonV2(sock);
    if (title) msg.setTitle(String(title).slice(0, 60));
    msg.setBody(String(body || title || ''));
    if (footer) msg.setFooter(String(footer));
    if (withThumb && thumbnail) {
      try { msg.setThumbnail(thumbnail); } catch {}
    }
    for (const btn of normalizeButtons(buttons)) msg.addButton(btn.text, btn.id);
    return msg;
  };

  try {
    return await build(true).send(jid, { quoted });
  } catch (e1) {
    // Thumbnail pode falhar (URL offline, resize) — tenta sem imagem
    try {
      return await build(false).send(jid, { quoted });
    } catch (e2) {
      throw e2;
    }
  }
}

// ─────────────────────────────────────────────
// CAROUSEL — cards com imagem + botões
// ─────────────────────────────────────────────
async function sendCarousel(sock, jid, cards, quoted = null) {
  const MB = getMB();
  if (!MB?.Carousel) throw new Error('Carousel indisponível');

  const carousel = new MB.Carousel(sock);

  for (const card of cards) {
    const btns = normalizeButtons(card.buttons || []);
    const nativeBtns = btns.map((b) => ({
      name: 'quick_reply',
      buttonParamsJson: JSON.stringify({ display_text: b.text, id: b.id }),
    }));

    let header = { hasMediaAttachment: false };
    if (card.thumbnail) {
      try {
        let buf = card.thumbnail;
        if (!Buffer.isBuffer(card.thumbnail)) {
          const { fetchBuffer } = require('./mediaHandler');
          buf = await fetchBuffer(card.thumbnail);
        }
        if (buf && buf.length > 100) {
          const media = await prepareWAMessageMedia({ image: buf }, { upload: sock.waUploadToServer });
          if (media?.imageMessage) header = { hasMediaAttachment: true, imageMessage: media.imageMessage };
        }
      } catch {}
    }

    carousel.addCard({
      header,
      body: { text: card.body || card.title || '' },
      footer: { text: card.footer || (require('../config').bot.name + ' 🕸️') },
      nativeFlowMessage: { buttons: nativeBtns },
    });
  }

  return carousel.send(jid, { quoted });
}

// ─────────────────────────────────────────────
// 3º MÉTODO — NATIVEFLOW DIRECTO
// ─────────────────────────────────────────────
async function sendNativeDirect(sock, jid, title, footer, buttons, quoted, opts = {}) {
  const btns = buttons.map((b) => ({
    name: 'quick_reply',
    buttonParamsJson: JSON.stringify({ display_text: b.text, id: b.id }),
  }));
  const header = await buildHeader(sock, opts.image);
  const content = {
    interactiveMessage: proto.Message.InteractiveMessage.fromObject({
      body: proto.Message.InteractiveMessage.Body.fromObject({ text: title }),
      footer: proto.Message.InteractiveMessage.Footer.fromObject({ text: footer || (require('../config').bot.name + ' 🕸️') }),
      header,
      nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({ buttons: btns }),
    }),
  };
  const m = generateWAMessageFromContent(jid, content, { userJid: sock.user?.id, quoted });
  return sock.relayMessage(jid, m.message, {
    messageId: m.key.id,
    additionalNodes: NATIVE_FLOW_NODES,
  });
}

// ─────────────────────────────────────────────
// SEND BUTTONS — cascata automática CORRIGIDA
// ordem: Interactive(viewOnce) → ButtonV2 → Direct → Texto
// ─────────────────────────────────────────────
async function sendButtons(sock, jid, title, footer, buttons, quoted = null, opts = {}) {
  const clean = normalizeButtons(buttons);
  if (!clean.length) return sock.sendMessage(jid, { text: title }, { quoted });

  // Modo forçado
  if (opts.mode === 'text') {
    return sock.sendMessage(jid, { text: buttonsText(title, footer, clean) }, { quoted });
  }

  // 1º — interactive viewOnce (botões clicáveis na maioria dos clientes)
  try { return await sendInteractive(sock, jid, title, footer, clean, quoted, opts); } catch {}
  // 2º — ButtonV2 nativo (MB.cjs)
  try { return await sendButtonV2(sock, jid, '', title, footer, clean, opts.image, quoted); } catch {}
  // 3º — interactive directo
  try { return await sendNativeDirect(sock, jid, title, footer, clean, quoted, opts); } catch {}
  // 4º — texto (sempre funciona)
  return sock.sendMessage(jid, { text: buttonsText(title, footer, clean) }, { quoted });
}

async function sendButtonsWithImage(sock, jid, title, footer, image, buttons, quoted = null) {
  return sendButtons(sock, jid, title, footer, buttons, quoted, { image });
}

// ─────────────────────────────────────────────
// LISTA INTERACTIVA (single_select)
// ─────────────────────────────────────────────
async function sendListDirect(sock, jid, title, text, buttonText, sections, quoted = null) {
  const m = generateWAMessageFromContent(jid, {
    viewOnceMessage: {
      message: {
        messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
        interactiveMessage: proto.Message.InteractiveMessage.fromObject({
          body: proto.Message.InteractiveMessage.Body.fromObject({ text }),
          footer: proto.Message.InteractiveMessage.Footer.fromObject({ text: title || '' }),
          header: proto.Message.InteractiveMessage.Header.fromObject({ title: '', hasMediaAttachment: false }),
          nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
            buttons: [{
              name: 'single_select',
              buttonParamsJson: JSON.stringify({ title: buttonText, sections }),
            }],
          }),
        }),
      },
    },
  }, { userJid: sock.user?.id, quoted });
  return sock.relayMessage(jid, m.message, {
    messageId: m.key.id,
    additionalNodes: NATIVE_FLOW_NODES,
  });
}

async function sendList(sock, jid, title, text, buttonText, sections, quoted = null, opts = {}) {
  if (opts.mode === 'text') {
    const rows = (sections || []).flatMap((s) => (s.rows || []).map((r) => `• *${r.title}* — ${r.description || r.id}`)).join('\n');
    return sock.sendMessage(jid, { text: `*${title}*\n\n${rows}` }, { quoted });
  }
  try { return await sendListDirect(sock, jid, title, text, buttonText, sections, quoted); } catch {}
  const rows = (sections || []).flatMap((s) => (s.rows || []).map((r) => `• *${r.title}* — ${r.description || ''}`)).join('\n');
  return sock.sendMessage(jid, { text: `*${title}*\n\n${rows}` }, { quoted });
}

async function sendListWithImage(sock, jid, title, text, buttonText, image, sections, quoted = null) {
  return sendList(sock, jid, title, text, buttonText, sections, quoted, { image });
}

// ─────────────────────────────────────────────
// BOTÕES ESPECIAIS (CTA)
// ─────────────────────────────────────────────
async function _sendCTA(sock, jid, text, footer, btnName, btnParams, quoted = null) {
  const m = generateWAMessageFromContent(jid, {
    viewOnceMessage: {
      message: {
        messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
        interactiveMessage: proto.Message.InteractiveMessage.fromObject({
          body: proto.Message.InteractiveMessage.Body.fromObject({ text }),
          footer: proto.Message.InteractiveMessage.Footer.fromObject({ text: footer || (require('../config').bot.name + ' 🕸️') }),
          header: proto.Message.InteractiveMessage.Header.fromObject({ title: '', hasMediaAttachment: false }),
          nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
            buttons: [{ name: btnName, buttonParamsJson: JSON.stringify(btnParams) }],
          }),
        }),
      },
    },
  }, { userJid: sock.user?.id, quoted });
  return sock.relayMessage(jid, m.message, {
    messageId: m.key.id,
    additionalNodes: NATIVE_FLOW_NODES,
  });
}

/** Botão de URL (abre link) */
async function sendUrlButton(sock, jid, text, displayText, url, quoted = null) {
  try {
    return await _sendCTA(sock, jid, text, 'DARK BOT 🕸️', 'cta_url', {
      display_text: displayText, url, merchant_url: url,
    }, quoted);
  } catch {
    return sock.sendMessage(jid, { text: `${text}\n\n🔗 ${displayText}: ${url}` }, { quoted });
  }
}

/** Botão de copiar código/texto */
async function sendCopyButton(sock, jid, text, displayText, copyCode, quoted = null) {
  try {
    return await _sendCTA(sock, jid, text, 'DARK BOT 🕸️', 'cta_copy', {
      display_text: displayText, copy_code: copyCode,
    }, quoted);
  } catch {
    return sock.sendMessage(jid, { text: `${text}\n\n📋 ${displayText}:\n\`${copyCode}\`` }, { quoted });
  }
}

/** Botão de chamada telefónica */
async function sendCallButton(sock, jid, text, displayText, phoneNumber, quoted = null) {
  try {
    return await _sendCTA(sock, jid, text, 'DARK BOT 🕸️', 'cta_call', {
      display_text: displayText, phone_number: phoneNumber,
    }, quoted);
  } catch {
    return sock.sendMessage(jid, { text: `${text}\n\n📞 ${displayText}: +${phoneNumber}` }, { quoted });
  }
}

// ─────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────
module.exports = {
  // Principais
  sendInteractive,
  sendButtonV2,
  sendCarousel,
  sendButtons,
  sendButtonsWithImage,
  sendList,
  sendListWithImage,
  sendUrlButton,
  sendCopyButton,
  sendCallButton,
  // Helpers
  buttonsText,
  normalizeButtons,
};
