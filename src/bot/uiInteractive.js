/**
 * v12.9.11 — UI INTERATIVA ⚡ botões, listas e carrossel (WhatsApp)
 * Formato interactiveMessage + native_flow (o mesmo padrão já provado
 * no commandHandler v5.3). Toda função cai em TEXTO simples se o
 * formato for rejeitado — nunca deixa o comando morrer.
 */
'use strict';

const NODES = () => ([{
  tag: 'biz', attrs: {}, content: [{
    tag: 'interactive', attrs: { type: 'native_flow', v: '1' },
    content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }],
  }],
}]);

async function _relay(sock, jid, conteudo, quoted) {
  const { generateWAMessageFromContent } = require('@systemzero/baileys');
  const msg = generateWAMessageFromContent(jid, conteudo, { userJid: sock.user?.id, quoted: quoted || undefined });
  await sock.relayMessage(jid, msg.message, { messageId: msg.key.id, additionalNodes: NODES() });
  return msg;
}

function _proto() {
  const { proto } = require('@systemzero/baileys');
  return proto;
}

// ── BOTÕES: [{ texto, id }] — o toque envia o `id` como mensagem ──
async function botoes(sock, jid, texto, listaBotoes, { footer = '', quoted = null } = {}) {
  try {
    const proto = _proto();
    return await _relay(sock, jid, {
      interactiveMessage: proto.Message.InteractiveMessage.fromObject({
        body: proto.Message.InteractiveMessage.Body.fromObject({ text: texto }),
        footer: proto.Message.InteractiveMessage.Footer.fromObject({ text: footer || 'DARK ENGINE 🕸️' }),
        nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
          buttons: listaBotoes.slice(0, 3).map(b => ({
            name: 'quick_reply',
            buttonParamsJson: JSON.stringify({ display_text: b.texto, id: b.id }),
          })),
        }),
      }),
    }, quoted);
  } catch (e) {
    // fallback honesto: instruções em texto puro
    await sock.sendMessage(jid, { text: `${texto}\n\n${listaBotoes.map((b, i) => `  ▸ [${i + 1}] ${b.texto} → responde *${b.id}*`).join('\n')}` }, { quoted: quoted || undefined });
  }
}

// ── LISTA: seções [{ titulo, linhas: [{ titulo, descricao, id }] }] ──
async function lista(sock, jid, texto, tituloBotao, secoes, { footer = '', quoted = null } = {}) {
  try {
    const proto = _proto();
    return await _relay(sock, jid, {
      interactiveMessage: proto.Message.InteractiveMessage.fromObject({
        body: proto.Message.InteractiveMessage.Body.fromObject({ text: texto }),
        footer: proto.Message.InteractiveMessage.Footer.fromObject({ text: footer || 'DARK ENGINE 🕸️' }),
        nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
          buttons: [{
            name: 'single_select',
            buttonParamsJson: JSON.stringify({
              has_multiple_sections: secoes.length > 1,
              button_text: tituloBotao || 'Abrir lista',
              sections: secoes.map(s => ({
                title: s.titulo,
                rows: s.linhas.slice(0, 100).map(l => ({ title: l.titulo, description: l.descricao || '', id: l.id })),
              })),
            }),
          }],
        }),
      }),
    }, quoted);
  } catch {
    const linhas = secoes.flatMap(s => [`▸ ${s.titulo}`, ...s.linhas.map(l => `  • ${l.titulo} → responde *${l.id}*`)]);
    await sock.sendMessage(jid, { text: `${texto}\n\n${linhas.join('\n')}` }, { quoted: quoted || undefined });
  }
}

// ── CARROSSEL: cartoes [{ titulo, descricao, botoes: [{texto, id}] }] ──
async function carrossel(sock, jid, texto, cartoes, { footer = '', quoted = null } = {}) {
  try {
    const proto = _proto();
    const cards = cartoes.slice(0, 10).map(c => proto.Message.InteractiveMessage.fromObject({
      body: proto.Message.InteractiveMessage.Body.fromObject({ text: `*${c.titulo}*${c.descricao ? '\n' + c.descricao : ''}` }),
      footer: proto.Message.InteractiveMessage.Footer.fromObject({ text: footer || 'DARK ENGINE 🕸️' }),
      nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
        buttons: (c.botoes || []).slice(0, 3).map(b => ({
          name: 'quick_reply',
          buttonParamsJson: JSON.stringify({ display_text: b.texto, id: b.id }),
        })),
      }),
    }));
    return await _relay(sock, jid, {
      viewOnceMessage: {
        message: {
          messageContextInfo: { deviceListMetadataVersion: 2, deviceListMetadata: {} },
          interactiveMessage: proto.Message.InteractiveMessage.fromObject({
            body: proto.Message.InteractiveMessage.Body.fromObject({ text: texto }),
            footer: proto.Message.InteractiveMessage.Footer.fromObject({ text: footer || 'DARK ENGINE 🕸️' }),
            carouselMessage: proto.Message.InteractiveMessage.CarouselMessage.fromObject({ cards }),
          }),
        },
      },
    }, quoted);
  } catch {
    const linhas = cartoes.map((c, i) => `▸ *${c.titulo}*${c.descricao ? '\n' + c.descricao : ''}${(c.botoes || [])[0] ? `\n  → responde *${c.botoes[0].id}*` : ''}`);
    await sock.sendMessage(jid, { text: `${texto}\n\n${linhas.join('\n\n')}` }, { quoted: quoted || undefined });
  }
}

module.exports = { botoes, lista, carrossel };
