const fs = require('fs');
let code = fs.readFileSync('src/bot/nativeCommands.js', 'utf8');

// Fix the broken caption strings
code = code.replace(
  "caption: '📚 *' + b.title + '*\n👤 ' + b.author + '\n📡 ' + b.source,",
  "caption: '📚 *' + b.title + '*\\n👤 ' + b.author + '\\n📡 ' + b.source,"
);

code = code.replace(
  "text: '📚 *LIVROS ENCONTRADOS*\n🔎 Busca: _' + query + '_\n\n';",
  "text: '📚 *LIVROS ENCONTRADOS*\\n🔎 Busca: _' + query + '_\\n\\n';"
);

code = code.replace(
  "text += (i+1) + '. *' + b.title + '*\n';",
  "text += (i+1) + '. *' + b.title + '*\\n';"
);

code = code.replace(
  "text += '   👤 ' + b.author + (b.year !== '?' ? '  📅 ' + b.year : '') + '\n';",
  "text += '   👤 ' + b.author + (b.year !== '?' ? '  📅 ' + b.year : '') + '\\n';"
);

code = code.replace(
  "text += '   📥 ' + b.downloadUrl + '\n';",
  "text += '   📥 ' + b.downloadUrl + '\\n';"
);

code = code.replace(
  "text += '   🔗 ' + b.link + '\n';",
  "text += '   🔗 ' + b.link + '\\n';"
);

code = code.replace(
  "text += '   📡 ' + b.source + '\n\n';",
  "text += '   📡 ' + b.source + '\\n\\n';"
);

fs.writeFileSync('src/bot/nativeCommands.js', code);
console.log('✅ Strings fixadas');
