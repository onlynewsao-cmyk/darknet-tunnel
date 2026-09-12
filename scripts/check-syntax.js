#!/usr/bin/env node
/**
 * DARK BOT — Verificação de sintaxe JS
 * Roda todos os arquivos .js do src/ e reporta erros
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const SRC = path.join(__dirname, '..', 'src');

function walk(dir) {
  const result = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...walk(full));
    else if (entry.name.endsWith('.js')) result.push(full);
  }
  return result;
}

const files = walk(SRC);
let errors = 0;

for (const f of files) {
  try {
    execSync(`node --check "${f}"`, { stdio: 'pipe' });
  } catch (e) {
    console.error(`❌ ERRO em ${path.relative(process.cwd(), f)}`);
    console.error(e.stderr?.toString() || e.message);
    errors++;
  }
}

if (errors === 0) {
  console.log(`✅ ${files.length} arquivos verificados — sem erros de sintaxe.`);
  process.exit(0);
} else {
  console.error(`\n❌ ${errors} arquivo(s) com erro.`);
  process.exit(1);
}
