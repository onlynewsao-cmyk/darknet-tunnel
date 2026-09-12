const fs = require('fs');
let code = fs.readFileSync('src/bot/nativeCommands.js', 'utf8');

// Find the medialist handler end
const medialistEnd = code.indexOf('\n  async medialist(');
const afterMedialist = code.indexOf('\n  },', medialistEnd) + 4;

const compressCmd = `

  // !compress [qualidade] — comprime imagem/vídeo marcado
  // Qualidade: 10-100 para imagens (padrão 60), 360/480/720 para vídeo
  async compress({ sock, msg, ctx, args, isOwner }) {
    if (!isOwner) return reply(sock, msg, ctx, '🚫 Só o Dono.');
    await react(sock, msg, '⏳');
    try {
      const compressor = require('./compressor');
      const mediaHandler = require('./mediaHandler');

      // Pega a mídia da mensagem ou da mensagem citada
      const targetMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage || msg.message;
      const imgMsg = targetMsg?.imageMessage;
      const vidMsg = targetMsg?.videoMessage;
      const audMsg = targetMsg?.audioMessage || targetMsg?.documentMessage?.mimetype?.startsWith('audio') ? targetMsg?.documentMessage : null;

      if (!imgMsg && !vidMsg && !audMsg) {
        return reply(sock, msg, ctx, '📦 Uso: *' + (ctx.prefix || '!') + 'compress* [qualidade]\\nMarca ou responde a uma imagem/vídeo/áudio.\\n\\nImagens: qualidade 10-100 (padrão 60)\\nVídeos: resolução 360/480/720 (padrão 480)\\nÁudio: bitrate 64k/96k/128k (padrão 96k)');
      }

      const quality = args[0] || null;
      const buf = await mediaHandler.downloadFromMessage({ message: targetMsg });
      if (!buf || buf.length < 100) throw new Error('Mídia vazia');

      const originalSize = buf.length;
      const { buf: compressed, type } = compressor.autoCompress(buf, quality);
      const newSize = compressed.length;
      const saved = ((1 - newSize / originalSize) * 100).toFixed(0);

      const caption = '📦 *Compressão OK*\\n📏 Original: ' + (originalSize / 1024).toFixed(0) + ' KB\\n📉 Comprimido: ' + (newSize / 1024).toFixed(0) + ' KB\\n💾 Economia: ' + saved + '%';

      if (type === 'image') {
        await sock.sendMessage(ctx.remoteJid, { image: compressed, caption }, { quoted: msg });
      } else if (type === 'video') {
        await sock.sendMessage(ctx.remoteJid, { video: compressed, mimetype: 'video/mp4', caption }, { quoted: msg });
      } else if (type === 'audio') {
        await sock.sendMessage(ctx.remoteJid, { audio: compressed, mimetype: 'audio/mpeg', ptt: false, caption }, { quoted: msg });
      }

      await react(sock, msg, '✅');
    } catch (e) {
      await react(sock, msg, '❌');
      return reply(sock, msg, ctx, '❌ Compressão falhou: ' + e.message);
    }
  },
`;

code = code.slice(0, afterMedialist) + compressCmd + code.slice(afterMedialist);
fs.writeFileSync('src/bot/nativeCommands.js', code);
console.log('✅ compress command added');
