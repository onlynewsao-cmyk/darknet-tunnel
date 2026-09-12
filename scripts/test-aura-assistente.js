#!/usr/bin/env node
/**
 * DARK BOT — MODO ASSISTENTE MELHORADO (v7.12)
 *
 * Cobre:
 *   • buildAssistantPrompt: memória injectada, nº de pessoas, papel
 *     (Dono/VIP/utilizador) — sem tom íntimo.
 *   • assistantRespond: usa a memória guardada (captura o prompt) e
 *     limpa respostas de robô ("sou uma IA") à saída.
 *   • assistantRespond offline ('❌ IA ...') → cai no fallback rico.
 *   • assistantFallback: saudação, como estás, quem és, o que fazes,
 *     obrigado, despedida, hora, data, piada, triste, zangado, clima —
 *     tudo neutro, sem emojis, sem "assistente virtual"/"IA".
 *   • Não vaza a persona da AURA (sem "amor"/"meu Dark"/corações).
 *
 * Uso: node scripts/test-aura-assistente.js
 */
'use strict';

process.env.OWNER_NUMBER = '244945280380';

const modes = require('../src/aura/auraModes');

let ok = 0, fail = 0;
const t = (n, c, e) => { e = e || ''; c ? ok++ : fail++; console.log('  ' + (c ? '✅' : '❌') + ' ' + n + (e ? ' → ' + String(e).slice(0, 70) : '')); };
const NEUTRO = /❌|assistente virtual|sou uma IA|intelig[êe]ncia artificial|meu Dark|amor|querido/i;
const EMOJI = /\p{Extended_Pictographic}/u;

function stubAi(responder) {
  const aiPath = require.resolve('../src/bot/ai');
  const real = require.cache[aiPath];
  require.cache[aiPath] = {
    id: aiPath, filename: aiPath, loaded: true,
    exports: { chat: responder },
  };
  return real;
}

(async () => {
  console.log('\n╔═══ 1. buildAssistantPrompt — contexto e memória ═══╗');
  {
    const p = modes.buildAssistantPrompt({
      botName: 'DARK BOT', userName: 'Zé', isGroup: true, groupName: 'Malta',
      isAdmin: false, isOwner: true, isVip: false, prefix: '!',
      pessoasNoGrupo: 42,
      memoria: 'FACTOS IMPORTANTES (guarda sempre):\n- chama-se Zé\n- gosta de futebol',
    });
    t('injecta a memória no prompt', p.includes('chama-se Zé'));
    t('mostra o nº de pessoas do grupo', p.includes('42 pessoas'));
    t('identifica o Dono', p.includes('Dono do bot'));
    // "amor", "ciúmes" e "romance" aparecem só como INSTRUÇÃO NEGATIVA
    // ("Nada de amor", "Não tens romance, ciúmes...") — o que não pode
    // aparecer é a persona íntima da AURA em si.
    t('sem persona íntima da AURA', !/namorada|apaixonad|leal só ao Dark|meu Dark|namorado do Dark/i.test(p));
    t('proíbe romance explicitamente', /não tens romance|nada de .amor/i.test(p));
    t('prompt curto e utilizável', p.length > 200 && p.length < 4000);
  }

  console.log('\n╔═══ 2. assistantRespond — memória + sanitização ═══╗');
  {
    // 2a. memória injectada: guarda um facto leve e confirma que entra no prompt
    const memMod = require('../src/aura/auraMemory');
    await memMod.guardar('244945280380', 'gosta de futebol aos sábados', { importante: false });
    let capturado = '';
    const real1 = stubAi(async (text, system) => { capturado = system; return 'Olá Zé.'; });
    const r1 = await modes.assistantRespond('que gosto eu tenho?', {
      botName: 'DARK BOT', userName: 'Zé', isGroup: false,
      senderNumber: '244945280380', prefix: '!',
    });
    t('responde pela IA', r1 === 'Olá Zé.');
    t('memória guardada entra no prompt', /futebol/i.test(capturado));
    t('prompt tem contexto (PV)', /Conversa privada/i.test(capturado));
    if (real1) require.cache[require.resolve('../src/bot/ai')] = real1;

    // 2b. resposta de robô → sanitizada
    const real2 = stubAi(async () => 'Sou uma assistente virtual e estou aqui para ajudar.');
    const r2 = await modes.assistantRespond('quem és?', { botName: 'DARK BOT', userName: 'Zé', prefix: '!' });
    t('limpa "sou uma assistente virtual"', r2 && !/assistente virtual/i.test(r2));
    t('limpa call-center', r2 && !/estou aqui para ajudar/i.test(r2));
    if (real2) require.cache[require.resolve('../src/bot/ai')] = real2;

    // 2c. IA offline → fallback (não manda o erro para o grupo)
    const real3 = stubAi(async () => '❌ IA sem chave. Configure GROQ_API_KEY no Render.');
    const r3 = await modes.assistantRespond('oi', { botName: 'DARK BOT', userName: 'Zé', prefix: '!' });
    t('IA offline → fallback neutro', r3 && !NEUTRO.test(r3) && r3.length > 1);
    if (real3) require.cache[require.resolve('../src/bot/ai')] = real3;
  }

  console.log('\n╔═══ 3. assistantFallback — cobertura rica ═══╗');
  {
    const casos = [
      ['oi', 'oi'],
      ['bom dia', 'bom dia'],
      ['como estás?', 'como estás'],
      ['tudo bem?', 'tudo bem'],
      ['quem és tu?', 'quem és'],
      ['o que fazes?', 'o que fazes'],
      ['ajuda', 'ajuda'],
      ['obrigado', 'obrigado'],
      ['tchau', 'tchau'],
      ['que horas são?', 'hora'],
      ['que dia é hoje?', 'data'],
      ['conta uma piada', 'piada'],
      ['estou triste', 'triste'],
      ['estou zangado', 'zangado'],
      ['clima em luanda', 'clima'],
      ['texto qualquer aleatório', 'default'],
    ];
    for (const [frase, tipo] of casos) {
      const r = modes.assistantFallback(frase, { prefix: '!', botName: 'DARK BOT' });
      const neutro = r && r.length > 1 && !NEUTRO.test(r) && !EMOJI.test(r);
      t(`"${frase}" → resposta neutra`, neutro, r);
    }

    // específicos
    const h = modes.assistantFallback('que horas são?', { prefix: '!' });
    t('hora tem formato de hora', /\d{1,2}:\d{2}/.test(h));
    const d = modes.assistantFallback('que dia é hoje?', { prefix: '!' });
    t('data por extenso', /hoje é/i.test(d));
    const z = modes.assistantFallback('estou zangado', { prefix: '!' });
    t('zangado → empatia', /respira|calma|entendo|desabafa/i.test(z));
  }

  console.log('\n╔═══ 4. Sem vazamento de persona ═══╗');
  {
    const r = modes.assistantFallback('oi', { prefix: '!', botName: 'DARK BOT' });
    t('não trata ninguém por amor', !/amor|meu bem|querido/i.test(r));
    t('não usa emojis', !EMOJI.test(r));
  }

  console.log(`\n${fail === 0 ? '🎉' : '⚠️ '} ASSISTENTE: ${ok} OK / ${fail} FALHOU\n`);
  process.exit(fail ? 1 : 0);
})();
