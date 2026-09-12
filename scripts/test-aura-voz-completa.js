#!/usr/bin/env node
/**
 * DARK BOT — AURA VOZ COMPLETA (Etapa 2) — testes de lógica pura
 *
 * Cobre:
 *   • O GATE de comandos por voz: uma transcrição é ordem/comando?
 *     (pareceOrdem OU detectarComando — regex, 0 ms, sem IA)
 *   • Os comandos que de facto executam a partir de voz:
 *     toca X → play · qual o meu saldo → saldo · promove → promote
 *   • Conversa NÃO é tratada como comando.
 *   • "manda um áudio" → resposta por voz (pediuAudio).
 *
 * Uso: node scripts/test-aura-voz-completa.js
 */
'use strict';

process.env.OWNER_NUMBER = '244945280380';

const brain = require('../src/aura/auraBrain');
const cmds = require('../src/aura/auraCommands');
const voz = require('../src/aura/auraVoz');

let ok = 0, fail = 0;
const t = (n, c, e) => { e = e || ''; c ? ok++ : fail++; console.log('  ' + (c ? '✅' : '❌') + ' ' + n + (e ? ' → ' + String(e).slice(0, 70) : '')); };

/** O gate real: o que o commandHandler usa para decidir se a
 *  transcrição vira comando. */
function gateVoz(transcricao) {
  // v7.26: pergunta-capacidade ("quem escreveu isso?") também passa
  return brain.pareceOrdem(transcricao) || !!cmds.detectarComando(transcricao) || !!brain.detectarCapacidade(transcricao);
}

(async () => {
  console.log('\n╔═══ 1. GATE — comandos por voz detectados ═══╗');
  {
    const ordens = [
      'cria um grupo chamado arena', 'toca shakira', 'qual o meu saldo',
      'manda um audio', 'promove o joao', 'apaga essa mensagem',
      'desliga o grupo', 'procura noticias de angola', 'baixa essa musica',
      'marca o joao', 'bane o pedro', 'muda o nome do grupo para teste',
    ];
    for (const o of ordens) t(`"${o}" é comando`, gateVoz(o), '');
  }

  console.log('\n╔═══ 2. GATE — conversa NÃO é comando ═══╗');
  {
    const conversa = ['oi tudo bem', 'gostei da foto', 'que horas sao', 'te amo', 'kkkk top', 'boa noite'];
    for (const c of conversa) t(`"${c}" é conversa`, gateVoz(c) === false, '');
  }

  console.log('\n╔═══ 3. O que executa a partir da voz ═══╗');
  {
    const r1 = cmds.detectarComando('toca shakira');
    t('"toca shakira" → play', r1?.comando === 'play' && r1.args === 'shakira', JSON.stringify(r1));
    const r2 = cmds.detectarComando('qual o meu saldo');
    t('"qual o meu saldo" → saldo', r2?.comando === 'saldo', JSON.stringify(r2));
    const r3 = cmds.detectarComando('promove o joao');
    t('"promove o joao" → promote', r3?.comando === 'promote', JSON.stringify(r3));
    const r4 = brain.detectarCapacidade('promove o joao');
    t('"promove o joao" → capacidade promover_admin', r4?.id === 'promover_admin', r4?.id);
    const r5 = cmds.detectarComando('procura noticias de angola');
    // "procura" é verbo de ordem → passa pelo GATE (pareceOrdem) e é
    // roteado pela IA (rotearComIA) para a capacidade certa.
    t('"procura noticias" passa no gate (ordem)', gateVoz('procura noticias de angola') === true, '');
  }

  console.log('\n╔═══ 4. Resposta por voz ═══╗');
  {
    t('"manda um audio" → pediuAudio', voz.pediuAudio('manda um audio') === true, '');
    t('"manda um áudio dizendo oi" → pediuAudio', voz.pediuAudio('manda um áudio dizendo oi') === true, '');
    t('"oi tudo bem" NÃO pede áudio', voz.pediuAudio('oi tudo bem') === false, '');
    t('textoParaFalar limpa meta', voz.textoParaFalar('Claro Dark, faz uma gravação de voz aqui está, ouça').length < 60, '');
  }

  console.log('\n───────────────────────────────');
  console.log((fail === 0 ? '✅' : '❌') + ` ${ok} OK / ${fail} FALHOU\n`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('💥', e); process.exit(1); });
