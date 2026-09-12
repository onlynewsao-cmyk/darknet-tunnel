const fs = require('fs');
let code = fs.readFileSync('src/bot/nativeCommands.js', 'utf8');

// Find the buscalivro handler
const start = code.indexOf('  // !buscalivro');
const end = code.indexOf('  // !livros18');

if (start < 0 || end < 0) {
  console.log('❌ Section not found');
  process.exit(1);
}

const newHandler = `  // !buscalivro [nome] — busca e BAIXA livros
  async buscalivro({ sock, msg, ctx, args }) {
    if (!isPrimaryOwnerOnly(ctx)) return true;
    const enabled = await BotConfig.get('adult_mode_enabled', false).catch(() => false);
    if (!enabled) { await portal18.ownerPv(sock, { text: '🛑 Portal OFF. Use: adultmode on' }, ctx); return true; }
    const query = portal18.cleanQuery(args.join(' ') || 'romance adult passion desire');
    await portal18.ownerPv(sock, { text: '📚 Buscando livros: *' + query + '*...' }, ctx);
    try {
      const books = await portal18.searchBooks(query, 5);
      if (!books.length) throw new Error('Nenhum livro encontrado');

      // Tenta baixar e enviar o primeiro livro com link de download
      let downloaded = false;
      for (const b of books) {
        if (b.downloadUrl) {
          try {
            await portal18.ownerPv(sock, { text: '📥 A baixar: *' + b.title + '* (' + b.downloadExt + ')...' }, ctx);
            const mediaHandler = require('./mediaHandler');
            const buf = await mediaHandler.fetchBuffer(b.downloadUrl, 30000);
            if (buf && buf.length > 500) {
              const ext = b.downloadExt || 'txt';
              const mime = ext === 'epub' ? 'application/epub+zip' : ext === 'html' ? 'text/html' : 'text/plain';
              const fileName = (b.title || 'livro').replace(/[/\\\\?%*:|"<>]/g, '-').slice(0, 60) + '.' + ext;
              await sock.sendMessage(ctx.senderJid, {
                document: buf,
                fileName,
                mimetype: mime,
                caption: '📚 *' + b.title + '*\n👤 ' + b.author + '\n📡 ' + b.source,
              });
              downloaded = true;
              break;
            }
          } catch {}
        }
      }

      // Se não conseguiu baixar, envia a lista com links
      if (!downloaded) {
        let text = '📚 *LIVROS ENCONTRADOS*\n🔎 Busca: _' + query + '_\n\n';
        for (let i = 0; i < books.length; i++) {
          const b = books[i];
          text += (i+1) + '. *' + b.title + '*\n';
          text += '   👤 ' + b.author + (b.year !== '?' ? '  📅 ' + b.year : '') + '\n';
          if (b.downloadUrl) text += '   📥 ' + b.downloadUrl + '\n';
          else if (b.link) text += '   🔗 ' + b.link + '\n';
          text += '   📡 ' + b.source + '\n\n';
        }
        await portal18.ownerPv(sock, { text: text.trim() }, ctx);
      }
    } catch (e) {
      await portal18.ownerPv(sock, { text: '❌ ' + e.message }, ctx);
    }
    return true;
  },
`;

code = code.slice(0, start) + newHandler + code.slice(end);
fs.writeFileSync('src/bot/nativeCommands.js', code);
console.log('✅ buscalivro — agora baixa e envia livros');
