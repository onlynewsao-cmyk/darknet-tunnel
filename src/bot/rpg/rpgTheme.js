'use strict';
/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║   RPG THEME — Visual Independente do Bot                        ║
 * ║   O RPG TEM O SEU PRÓPRIO ESTILO. NÃO MUDA COM O CHANGE!       ║
 * ║   Bordas douradas, font épica, atmosfera de RPG medieval        ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

const { applyFont } = require('../botPersonality');

// ══════════════════════════════════════════════════════════════
// TEMA RPG FIXO — NUNCA MUDA COM O CHANGE
// ══════════════════════════════════════════════════════════════
const RPG_THEME = {
  icon: '⚔️',
  font: 'smallcaps',
  bullet: '◆',
  vibe: '⚔️ RPG DarkNet · O Teu Destino',
  frame: ['╔', '╗', '╚', '╝', '═', '║'],
  topBorder: '╔═══════════════════════════════╗\n║ {ICON} {TITLE}\n╚═══════════════════════════════╝',
  bottomBorder: '{ICON} DarkNet RPG · {BOT}',
  linePrefix: '║◆ ',
  sectionSep: '╠══ {TITLE} ══╣',
  sectionTop: '╠══ {TITLE} ══╣',
};

// ══════════════════════════════════════════════════════════════
// RENDERIZADOR RPG — INDEPENDENTE DO CHANGE
// ══════════════════════════════════════════════════════════════

function rpgRender(title, lines = []) {
  const t = RPG_THEME;
  const icon = t.icon;
  const V = t.frame[5];
  const H = t.frame[4];
  const bullet = t.bullet;
  const linePfx = `${V}${bullet} `;

  const top = `${t.frame[0]}${H.repeat(3)} ${icon} ${(title || 'RPG').toUpperCase()} ${H.repeat(3)}${t.frame[1]}`;
  const bot = `${t.frame[2]}${H.repeat(30)}${t.frame[3]}`;

  const out = [top];
  for (const line of lines) {
    out.push(linePfx + line);
  }
  out.push(bot);
  out.push(`> ${t.vibe}`);
  return out.join('\n');
}

// ══════════════════════════════════════════════════════════════
// ENVIO DE MENSAGENS COM TEMA RPG
// ══════════════════════════════════════════════════════════════

async function rpgReply(sock, msg, ctx, title, lines) {
  const text = rpgRender(title, lines);
  return sock.sendMessage(ctx.remoteJid, { text }, { quoted: msg });
}

async function rpgBotoes(sock, msg, ctx, corpo, botoes) {
  try {
    const { generateWAMessageFromContent, proto } = require('@systemzero/baileys');
    const corpoRPG = rpgRender('', [corpo]);
    const m = generateWAMessageFromContent(ctx.remoteJid, {
      interactiveMessage: proto.Message.InteractiveMessage.fromObject({
        body: { text: corpoRPG },
        footer: { text: '⚔️ DarkNet RPG · Escolhe o teu destino' },
        header: { title: '', hasMediaAttachment: false },
        nativeFlowMessage: {
          buttons: botoes.map(b => ({
            name: 'quick_reply',
            buttonParamsJson: JSON.stringify({ display_text: b.text, id: b.id }),
          })),
        },
      }),
    }, { userJid: sock.user?.id, quoted: msg });
    await sock.relayMessage(ctx.remoteJid, m.message, {
      messageId: m.key.id,
      additionalNodes: [{ tag: 'biz', attrs: {}, content: [{
        tag: 'interactive', attrs: { type: 'native_flow', v: '1' },
        content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }],
      }] }],
    });
    return true;
  } catch { return false; }
}

async function rpgLista(sock, msg, ctx, titulo, rows, corpo) {
  try {
    const { generateWAMessageFromContent, proto } = require('@systemzero/baileys');
    const corpoRPG = rpgRender('', [corpo]);
    const m = generateWAMessageFromContent(ctx.remoteJid, {
      interactiveMessage: proto.Message.InteractiveMessage.fromObject({
        body: { text: corpoRPG },
        footer: { text: '⚔️ DarkNet RPG · Escolhe o teu destino' },
        header: { title: '', hasMediaAttachment: false },
        nativeFlowMessage: {
          buttons: [{
            name: 'single_select',
            buttonParamsJson: JSON.stringify({ title: titulo, sections: [{ title: titulo, rows }] }),
          }],
        },
      }),
    }, { userJid: sock.user?.id, quoted: msg });
    await sock.relayMessage(ctx.remoteJid, m.message, {
      messageId: m.key.id,
      additionalNodes: [{ tag: 'biz', attrs: {}, content: [{
        tag: 'interactive', attrs: { type: 'native_flow', v: '1' },
        content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }],
      }] }],
    });
    return true;
  } catch { return false; }
}

async function rpgImagem(sock, msg, ctx, imagePath, caption, botoes) {
  try {
    const fs = require('fs');
    if (fs.existsSync(imagePath)) {
      const buffer = fs.readFileSync(imagePath);
      const captionRPG = rpgRender('', [caption]);
      await sock.sendMessage(ctx.remoteJid, { image: buffer, caption: captionRPG }, { quoted: msg });
      if (botoes && botoes.length) {
        await rpgBotoes(sock, msg, ctx, '👆 Escolhe:', botoes);
      }
      return true;
    }
  } catch {}
  await rpgReply(sock, msg, ctx, '📖', [caption]);
  if (botoes && botoes.length) await rpgBotoes(sock, msg, ctx, '👆 Escolhe:', botoes);
  return false;
}

module.exports = {
  RPG_THEME,
  rpgRender,
  rpgReply,
  rpgBotoes,
  rpgLista,
  rpgImagem,
};
