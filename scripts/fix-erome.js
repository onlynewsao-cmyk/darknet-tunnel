const fs = require('fs');
let code = fs.readFileSync('src/bot/nativeCommands.js', 'utf8');

const start = code.indexOf('  // ═══ EROME.COM ═══');
const end = code.indexOf('\n  async mediaup(');

if (start < 0 || end < 0) {
  console.log('❌ Section not found');
  process.exit(1);
}

const NEW_SECTION = [
  '  // ═══ EROME.COM v7 ═══',
  '  async erome({ sock, msg, ctx, args }) {',
  '    const query = args.filter(a => !/^\\d+$/.test(a)).join(\' \').trim();',
  '    const limit = parseInt(args.find(a => /^\\d+$/.test(a))) || 5;',
  '    if (!query) return reply(sock, msg, ctx, \'🔍 Uso: *!erome <nome>* [qtd]\');',
  '    await sock.sendMessage(ctx.remoteJid, { react: { text: \'🔍\', key: msg.key } });',
  '    try {',
  '      const erome = require(\'../erome\');',
  '      const results = await erome.search(query);',
  '      if (!results.length) throw new Error(\'Nenhum resultado para: \' + query);',
  '      await sock.sendMessage(ctx.remoteJid, { text: \'🔍 *\' + results.length + \'* resultados para *\' + query + \'*\' }, { quoted: msg });',
  '      const result = await erome.searchAndDownload(query, Math.min(limit, 20));',
  '      if (!result.media.length) throw new Error(\'Sem mídias no álbum\');',
  '      let sent = 0;',
  '      for (const m of result.media) {',
  '        try {',
  '          if (m.type === \'photo\') {',
  '            await sock.sendMessage(ctx.remoteJid, { image: m.buf, caption: sent === 0 ? \'📸 *\' + result.name + \'*\' : \'\' }, { quoted: msg });',
  '          } else if (m.type === \'video\') {',
  '            await sock.sendMessage(ctx.remoteJid, { video: m.buf, mimetype: \'video/mp4\', caption: \'🎬 *\' + result.name + \'*\' }, { quoted: msg });',
  '          }',
  '          sent++;',
  '          await new Promise(r => setTimeout(r, 500));',
  '        } catch {}',
  '      }',
  '      await sock.sendMessage(ctx.remoteJid, { text: \'✅ *\' + sent + \' mídias enviadas*\\n📸 \' + result.totalPhotos + \' fotos | 🎬 \' + result.totalVideos + \' vídeos\' }, { quoted: msg });',
  '      await sock.sendMessage(ctx.remoteJid, { react: { text: \'✅\', key: msg.key } });',
  '    } catch (e) {',
  '      await sock.sendMessage(ctx.remoteJid, { react: { text: \'❌\', key: msg.key } });',
  '      return reply(sock, msg, ctx, \'❌ Erome: \' + e.message);',
  '    }',
  '  },',
  '',
  '  async eromevid({ sock, msg, ctx, args }) {',
  '    const query = args.filter(a => !/^\\d+$/.test(a)).join(\' \').trim();',
  '    const limit = parseInt(args.find(a => /^\\d+$/.test(a))) || 3;',
  '    if (!query) return reply(sock, msg, ctx, \'🎬 Uso: *!eromevid <nome>* [qtd]\');',
  '    await sock.sendMessage(ctx.remoteJid, { react: { text: \'🎬\', key: msg.key } });',
  '    try {',
  '      const erome = require(\'../erome\');',
  '      const videos = await erome.searchVideos(query, Math.min(limit, 10));',
  '      if (!videos.length) throw new Error(\'Nenhum vídeo encontrado\');',
  '      for (const v of videos) {',
  '        try {',
  '          await sock.sendMessage(ctx.remoteJid, { video: v.buf, mimetype: \'video/mp4\', caption: \'🎬 *\' + (v.name || query) + \'*\' }, { quoted: msg });',
  '          await new Promise(r => setTimeout(r, 500));',
  '        } catch {}',
  '      }',
  '      await sock.sendMessage(ctx.remoteJid, { text: \'✅ *\' + videos.length + \' vídeos enviados*\' }, { quoted: msg });',
  '      await sock.sendMessage(ctx.remoteJid, { react: { text: \'✅\', key: msg.key } });',
  '    } catch (e) {',
  '      await sock.sendMessage(ctx.remoteJid, { react: { text: \'❌\', key: msg.key } });',
  '      return reply(sock, msg, ctx, \'❌ Erome: \' + e.message);',
  '    }',
  '  },',
  '',
].join('\n');

code = code.slice(0, start) + NEW_SECTION + code.slice(end + 1);
fs.writeFileSync('src/bot/nativeCommands.js', code);
console.log('✅ erome/eromevid v7');
