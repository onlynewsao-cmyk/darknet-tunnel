const fs = require('fs');
let code = fs.readFileSync('src/bot/portal18.js', 'utf8');

// Replace searchBooks function
const start = code.indexOf('async function searchBooks(');
const searchEnd = code.indexOf("throw new Error('Não encontrei livros para: ' + q);");
const end = code.indexOf(';', searchEnd) + 1;

const newFn = `async function searchBooks(query = '', count = 5) {
  const q = cleanQuery(query || 'romance erotic adult passion desire');

  // Gutendex (Project Gutenberg) — tem download directo EPUB/TXT
  try {
    const url = 'https://gutendex.com/books/?search=' + encodeURIComponent(q) + '&languages=en,pt';
    const data = await fetchJ(url, 15000);
    if (data?.results?.length) {
      return data.results.slice(0, count).map(b => {
        const formats = b.formats || {};
        const downloadUrl = formats['application/epub+zip'] ||
          formats['text/plain; charset=utf-8'] || formats['text/plain'] ||
          formats['text/html; charset=utf-8'] || formats['text/html'] || '';
        const downloadExt = downloadUrl.includes('epub') ? 'epub' : downloadUrl.includes('html') ? 'html' : 'txt';
        return {
          title:  b.title || 'Sem titulo',
          author: b.authors?.[0]?.name || 'Desconhecido',
          year:   b.id || '?',
          cover:  null,
          key:    String(b.id || ''),
          link:   downloadUrl,
          downloadUrl,
          downloadExt,
          source: 'Project Gutenberg',
        };
      });
    }
  } catch {}

  // OpenLibrary fallback
  try {
    const url = 'https://openlibrary.org/search.json?q=' + encodeURIComponent(q) + '&limit=' + (count + 3) + '&fields=title,author_name,key,cover_i,first_publish_year,subject';
    const data = await fetchJ(url, 15000);
    if (data?.docs?.length) {
      return data.docs.slice(0, count).map(b => ({
        title:   b.title || 'Sem titulo',
        author:  b.author_name?.[0] || 'Desconhecido',
        year:    b.first_publish_year || '?',
        cover:   b.cover_i ? 'https://covers.openlibrary.org/b/id/' + b.cover_i + '-M.jpg' : null,
        key:     b.key || '',
        link:    b.key ? 'https://openlibrary.org' + b.key : '',
        source:  'OpenLibrary',
      }));
    }
  } catch {}

  throw new Error('Nao encontrei livros para: ' + q);
}`;

code = code.slice(0, start) + newFn + code.slice(end);

// Add more genres
code = code.replace(
  "'erotic romance desire passion', 'adult romance passionate love',",
  "'erotic romance desire passion', 'adult romance passionate love',\n  'desenho arte nude nu adulto', 'historia sem censura erotico', 'conto erotico adulto',\n  'romance forbidden love affair explicit', 'mature adult fiction desire',"
);

fs.writeFileSync('src/bot/portal18.js', code);
console.log('✅ portal18.js — searchBooks com download');
