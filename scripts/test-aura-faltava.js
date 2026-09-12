#!/usr/bin/env node
/**
 * DARK BOT — REGRESSÃO: "o que faltava" na AURA/assistente (v7.16)
 *
 * Auditoria encontrou:
 *  1. "traduz X" → mapeava para um comando `traduzir` que NÃO existia
 *     (o menu até anunciava `translate`). Agora há case real.
 *  2. "letra da música X" → ia parar ao JOGO DA FORCA (`letra` é o
 *     comando da forca). Removido do MAPA — cai para a IA.
 *  3. "rebaixa o joao" → não era detectado (faltava 'rebaixa').
 *  4. "manda/envia o video X" → não era detectado (só 'baixa').
 *  5. "adiciona 244945280380" → exigia "no grupo" (faltava número).
 *
 * Uso: node scripts/test-aura-faltava.js
 */
'use strict';

process.env.MONGODB_URI = '';
process.env.OWNER_NUMBER = '244945280380';

const cmds = require('../src/aura/auraCommands');

let ok = 0, fail = 0;
const t = (n, c, e) => { e = e || ''; c ? ok++ : fail++; console.log('  ' + (c ? '✅' : '❌') + ' ' + n + (e ? ' → ' + String(e).slice(0, 70) : '')); };
const cmd = (f) => { const r = cmds.detectarComando(f); return r ? r.comando : null; };

console.log('\n╔═══ 1. MAPA — detecção corrigida ═══╗');
{
  t('"traduz hello para português" → traduzir', cmd('traduz hello para português') === 'traduzir');
  t('"traduz oi" → traduzir', cmd('traduz oi') === 'traduzir');
  t('"rebaixa o joao" → demote', cmd('rebaixa o joao') === 'demote');
  t('"rebaixar o joao" → demote', cmd('rebaixar o joao') === 'demote');
  t('"manda o video despacito" → video', cmd('manda o video despacito') === 'video');
  t('"envia o video despacito" → video', cmd('envia o video despacito') === 'video');
  t('"adiciona 244945280380" → add', cmd('adiciona 244945280380') === 'add');
  t('"adiciona o joao no grupo" → add', cmd('adiciona o joao no grupo') === 'add');
  t('"letra da música despacito" NÃO é forca', cmd('letra da música despacito') === null);
  t('"lyrics de despacito" NÃO é forca', cmd('lyrics de despacito') === null);
  // não partir o que já funcionava
  t('"toca shakira" → play', cmd('toca shakira') === 'play');
  t('"fecha o grupo" → fechar', cmd('fecha o grupo') === 'fechar');
  t('"promove o joao" → promote', cmd('promove o joao') === 'promote');
  t('"baixa o video de despacito" → video', cmd('baixa o video de despacito') === 'video');
}

console.log('\n╔═══ 2. Permissões ═══╗');
{
  t('"traduzir" é livre (qualquer pessoa)', cmds.podeExecutar('traduzir', { isOwner: false, isVip: false, isAdmin: false }).pode === true);
  t('"demote" exige admin', cmds.podeExecutar('demote', { isOwner: false, isVip: false, isAdmin: false }).pode === false);
  t('"add" exige admin', cmds.podeExecutar('add', { isOwner: false, isVip: false, isAdmin: false }).pode === false);
}

console.log('\n╔═══ 3. Case traduzir/translate registado ═══╗');
{
  // carregamento real dos cases (sem MongoDB)
  const caseHandler = require('../src/bot/caseHandler');
  caseHandler.init();
  // espera o load síncrono dos ficheiros (loadCases é síncrono)
  const { CASES } = caseHandler;
  t('case traduzir existe', CASES.has('traduzir'));
  t('case translate existe', CASES.has('translate'));
}

console.log(`\n${fail === 0 ? '🎉' : '⚠️ '} FALTAVA: ${ok} OK / ${fail} FALHOU\n`);
process.exit(fail ? 1 : 0);
