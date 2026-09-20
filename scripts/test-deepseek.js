#!/usr/bin/env node
/**
 * test-deepseek.js — v9.20: Testes do DeepSeek + Cache IA + Circuit Breaker
 */
'use strict';

let ok = 0, fail = 0;
const assert = (cond, msg) => { if (cond) { ok++; console.log(`  ✅ ${msg}`); } else { fail++; console.error(`  ❌ ${msg}`); } };

console.log('\n🧪 test-deepseek — v9.20\n');

// 1. Config tem DeepSeek
try {
  const config = require('../src/config');
  assert(typeof config.ai.deepseekApiKey === 'string', 'config.ai.deepseekApiKey existe');
  assert(typeof config.ai.deepseekKey === 'string', 'config.ai.deepseekKey alias existe');
} catch (e) { fail++; console.error(`  ❌ config: ${e.message}`); }

// 2. AI module carrega e tem DeepSeek
try {
  const ai = require('../src/bot/ai');
  assert(typeof ai.chatDeepSeek === 'function', 'chatDeepSeek é função');
  assert(Array.isArray(ai.DEEPSEEK_MODELS), 'DEEPSEEK_MODELS é array');
  assert(ai.DEEPSEEK_MODELS.length >= 2, 'DEEPSEEK_MODELS tem 2+ modelos');
  assert(ai.DEEPSEEK_MODELS.includes('deepseek-chat'), 'deepseek-chat na lista');
  assert(ai.DEEPSEEK_MODELS.includes('deepseek-reasoner'), 'deepseek-reasoner na lista');
} catch (e) { fail++; console.error(`  ❌ ai module: ${e.message}`); }

// 3. Circuit breaker com backoff exponencial
try {
  const ai = require('../src/bot/ai');
  // Reset estado
  ai.providerReset('testprov');
  assert(ai.providerUp('testprov'), 'providerUp inicial = true');
  // Primeira falha
  ai.providerFail('testprov', new Error('timeout'));
  assert(!ai.providerUp('testprov'), 'providerUp após falha = false');
  const st1 = ai.providerStatus();
  assert(st1.testprov && st1.testprov.fails === 1, 'fails=1 após 1ª falha');
  assert(st1.testprov && st1.testprov.seconds >= 55, 'backoff ~60s após 1ª falha');
  // Segunda falha (deve duplicar)
  ai.providerFail('testprov', new Error('timeout'));
  const st2 = ai.providerStatus();
  assert(st2.testprov && st2.testprov.fails === 2, 'fails=2 após 2ª falha');
  assert(st2.testprov && st2.testprov.seconds >= 110, 'backoff ~120s após 2ª falha');
  // Reset
  ai.providerReset('testprov');
  assert(ai.providerUp('testprov'), 'providerUp após reset = true');
  const st3 = ai.providerStatus();
  assert(!st3.testprov, 'providerStatus vazio após reset');
} catch (e) { fail++; console.error(`  ❌ circuit breaker: ${e.message}`); }

// 4. Cache de respostas
try {
  const ai = require('../src/bot/ai');
  // Cache miss
  const c1 = ai.aiCacheGet('pergunta teste', 'system teste');
  assert(c1 === null, 'cache miss inicial');
  // Set
  ai.aiCacheSet('pergunta teste', 'system teste', 'resposta teste');
  const c2 = ai.aiCacheGet('pergunta teste', 'system teste');
  assert(c2 === 'resposta teste', 'cache hit após set');
  // Não cachear erros
  ai.aiCacheSet('pergunta erro', 'system', '❌ Erro');
  const c3 = ai.aiCacheGet('pergunta erro', 'system');
  assert(c3 === null, 'erros não são cacheados');
  // TTL (simulado — não espera 10min)
  assert(typeof ai.aiCacheSet === 'function', 'aiCacheSet é função');
} catch (e) { fail++; console.error(`  ❌ cache: ${e.message}`); }

// 5. Provider status inclui DeepSeek no cálculo
try {
  const ai = require('../src/bot/ai');
  ai.providerFail('deepseek', new Error('timeout'));
  const st = ai.providerStatus();
  assert(st.deepseek, 'deepseek aparece no providerStatus');
  assert(st.deepseek.fails >= 1, 'deepseek fails contabilizado');
  ai.providerReset('deepseek');
} catch (e) { fail++; console.error(`  ❌ provider status: ${e.message}`); }

// 6. Syntax check de todos os ficheiros modificados
try {
  require('../src/config');
  require('../src/bot/ai');
  require('../src/bot/cases/info');
  assert(true, 'módulos carregam sem erro');
} catch (e) { fail++; console.error(`  ❌ require: ${e.message}`); }

console.log(`\n${ok} OK / ${fail} FALHOU\n`);
process.exit(fail > 0 ? 1 : 0);