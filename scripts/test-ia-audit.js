#!/usr/bin/env node
/**
 * DARK BOT — Auditoria do menu IA & CHATBOTS (regressão)
 *
 * Garante que TODOS os comandos do submenu IA têm handler real
 * (case / native). Os nomes de modelo (claude, gpt4, llama, …) estão
 * registados em ia2.js via makeModelHandler; os aura* em auraInvoke.js;
 * os utilitários (corrigir, resumir, …) em ia2.js; imagem/news em ia.js.
 *
 * Uso: node scripts/test-ia-audit.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', 'src', 'bot');

function collectCommands() {
  const palavras = new Set();
  const dirs = ['cases', 'packages'];
  for (const d of dirs) {
    for (const f of fs.readdirSync(path.join(ROOT, d))) {
      if (!f.endsWith('.js')) continue;
      if (d === 'cases' && f === 'stubs.js') continue;
      let src; try { src = fs.readFileSync(path.join(ROOT, d, f), 'utf8'); } catch { continue; }
      const re = /\b([a-zA-Z][a-zA-Z0-9_-]{0,30})\b/g;
      let m;
      while ((m = re.exec(src)) !== null) palavras.add(m[1].toLowerCase());
    }
  }
  const nc = fs.readFileSync(path.join(ROOT, 'nativeCommands.js'), 'utf8');
  const ncRe = /^\s*async\s+([a-zA-Z0-9_]+)\s*\(/gm; let m2;
  while ((m2 = ncRe.exec(nc)) !== null) palavras.add(m2[1].toLowerCase());
  return palavras;
}

const reais = collectCommands();

const lista = 'acordaaura acordar addai addmetaai aimemoria airesetar ask aura auradorme auragrupos auralist auramodo auraoff auraon aurasai aurastatus baichuan chat claude claude-haiku claudeai clearmemory codegemma cog copilot copiloto corrigir debater deepai dormiraura explicar falcon gemma gemma2 gpt gpt4 gpt5 ia iaapis iaimg iamemoria iatig iawhatsapp ideias imagem imagine img jornal kimi kimik2 llama llama3 magistral marin microsoft-ai mistral modoaura mymemory nano nano2 news pergunta phi phi3 philosophy pplx qwen qwen2 qwen3 qwencoder rakutenai recomendar resetia resumir resumirchat resumirurl rocket swallow sys-img yi'.split(' ');

let ok = 0, fail = 0;
const mortos = [];
for (const c of lista) {
  if (reais.has(c.toLowerCase())) ok++; else { fail++; mortos.push(c); }
}

console.log(`\n🤖 IA & CHATBOTS: ${ok}/${lista.length} comandos com handler real\n`);
if (mortos.length) {
  console.log('❌ Sem handler (mortos):');
  mortos.forEach(c => console.log('   - ' + c));
  process.exit(1);
}
console.log('✅ Nenhum comando de IA & CHATBOTS está morto.\n');
