/**
 * v12.9.11b — UI da CENTRAL no MESMO padrão do menu real (nativeCommands):
 * carrossel interactiveMessage com N cards (sem imagem — texto-rich) →
 * lista single_select → botões quick_reply → texto. Nada depende do MB.cjs.
 */
'use strict';

const NODES = [{ tag: 'biz', attrs: {}, content: [{ tag: 'interactive', attrs: { type: 'native_flow', v: '1' }, content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }] }] }];

function _baileys() { return require('@systemzero/baileys'); }

// quoted só é válido p/ generate se tem key+message (senão o protobuf rebenta: msgType undefined)
function _q(quoted) { return quoted && quoted.key && quoted.message ? quoted : undefined; }

// cards: [{ title, body, footer, buttons: [{text,id}] }]
// (objecto literal — o MESMO formato do menu real em nativeCommands 1149)
async function carrossel(sock, jid, textoTopo, cards, { footer = '', quoted = null } = {}) {
  const { generateWAMessageFromContent } = _baileys();
  const _ctxInfo = quoted?.key?.participant ? { participant: quoted.key.participant, quotedMessage: { conversation: textoTopo.slice(0, 40) } } : {};
  const msg = generateWAMessageFromContent(jid, {
    interactiveMessage: {
      ...(_ctxInfo.participant ? { contextInfo: _ctxInfo } : {}),
      body: { text: textoTopo },
      carouselMessage: {
        cards: cards.slice(0, 8).map(c => ({
          body: { text: `*${c.title}*${c.body ? '\n' + c.body : ''}` },
          footer: { text: c.footer || footer || '🕸️ Central' },
          nativeFlowMessage: {
            buttons: (c.buttons || []).slice(0, 3).map(b => ({ name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: b.text, id: b.id }) })),
          },
        })),
      },
    },
  }, { userJid: sock.user?.id, quoted: _q(quoted) });
  return sock.relayMessage(jid, msg.message, { messageId: msg.key.id, additionalNodes: NODES });
}

// lista no formato EXACTO do menu: sections [{ title, rows: [{ header, title, id }] }]
async function lista(sock, jid, titulo, texto, btnTxt, sections, { quoted = null } = {}) {
  const { generateWAMessageFromContent, proto } = _baileys();
  const listaMenus = { title: btnTxt, sections: sections.map(s => ({ title: s.title, highlight_label: s.highlight || undefined, rows: s.rows.map(r => ({ header: r.header, title: r.title || '', description: r.description || '', id: r.id })) })) };
  const msg = generateWAMessageFromContent(jid, {
    interactiveMessage: {
      body: { text: texto },
      carouselMessage: { cards: [proto.Message.InteractiveMessage.fromObject({
        body: proto.Message.InteractiveMessage.Body.fromObject({ text: texto }),
        footer: proto.Message.InteractiveMessage.Footer.fromObject({ text: titulo }),
        nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
          buttons: [{ name: 'single_select', buttonParamsJson: JSON.stringify(listaMenus) }],
        }),
      })] },
    },
  }, { userJid: sock.user?.id, quoted: _q(quoted) });
  return sock.relayMessage(jid, msg.message, { messageId: msg.key.id, additionalNodes: NODES });
}

// cascata inteligente p/ carrossel: carrossel → lista (rows dos cards) → botões → texto
async function carrosselSeguro(sock, jid, textoTopo, cards, { footer = '', quoted = null, listaTitle = 'Escolhe' } = {}) {
  try { return await carrossel(sock, jid, textoTopo, cards, { footer, quoted }); }
  catch {
    try {
      return await lista(sock, jid, listaTitle, textoTopo + '\n\nEscolhe uma opção:', '🕸️ Abrir lista',
        [{ title: listaTitle, rows: cards.map((c, i) => ({ header: c.title, title: (c.body || '').split('\n')[0] || `opção ${i + 1}`, id: (c.buttons || [])[0]?.id || `#${i}` })) }], { quoted });
    } catch {
      const bh = require('./buttonHandler');
      return bh.sendButtons(sock, jid, textoTopo, footer, cards.flatMap((c, i) => (c.buttons || []).map(b => ({ text: `${i + 1}. ${b.text}`, id: b.id }))), quoted);
    }
  }
}

module.exports = { carrossel, lista, carrosselSeguro };
