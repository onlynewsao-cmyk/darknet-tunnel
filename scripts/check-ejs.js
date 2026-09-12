#!/usr/bin/env node
/**
 * DARK BOT — Verificação de templates EJS
 */
const fs = require('fs');
const path = require('path');

const VIEWS = path.join(__dirname, '..', 'src', 'views');
let errors = 0;
let total = 0;

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.ejs')) {
      total++;
      const content = fs.readFileSync(full, 'utf8');
      // Verifica abertura/fechamento básico de tags EJS
      const opens = (content.match(/<%/g) || []).length;
      const closes = (content.match(/%>/g) || []).length;
      if (opens !== closes) {
        console.error(`❌ ${path.relative(process.cwd(), full)} — tags desbalanceadas (<%: ${opens}, %>: ${closes})`);
        errors++;
      }
    }
  }
}

walk(VIEWS);

if (errors === 0) {
  console.log(`✅ ${total} templates EJS verificados — sem erros.`);
  process.exit(0);
} else {
  console.error(`\n❌ ${errors} template(s) com problema.`);
  process.exit(1);
}
