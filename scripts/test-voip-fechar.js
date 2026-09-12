#!/usr/bin/env node
/**
 * DARK BOT — REGRESSÃO: VoIP "não fecha a conexão" (v7.20)
 *
 * Dois bugs corrigidos:
 *
 * 1. emparelhar() tratava o fecho PÓS-pair-success como erro. O servidor
 *    emite `isNewLogin` e FECHA a ligação de propósito (espera o cliente
 *    reiniciar). Antes o código esperava `connection === 'open'` (que não
 *    chega nessa socket) e marcava erro → o VoIP nunca se religava.
 *    Agora `isNewLogin` é o sinal de sucesso e o close seguinte é ignorado.
 *
 * 2. "Desligar Voz Real" não fazia logout — só `sock.end()`, e o aparelho
 *    ficava para sempre em "Aparelhos conectados" do WhatsApp.
 *    Agora apagarSessao() chama _logoutWhatsApp() antes de apagar.
 *
 * Uso: node scripts/test-voip-fechar.js
 */
'use strict';

process.env.MONGODB_URI = '';

const voip = require('../src/bot/liveVoip');

let ok = 0, fail = 0;
const t = (n, c, e) => { e = e || ''; c ? ok++ : fail++; console.log('  ' + (c ? '✅' : '❌') + ' ' + n + (e ? ' → ' + String(e).slice(0, 70) : '')); };

(async () => {
  console.log('\n╔═══ 1. _decidirEmparelhar — par é sucesso, close pós-par é ignorado ═══╗');
  {
    const d1 = voip._decidirEmparelhar({ isNewLogin: true, qr: undefined }, false);
    t('isNewLogin → sucesso (emparelhou)', d1.r === 'sucesso' && d1.novoLogin === true);

    const d2 = voip._decidirEmparelhar({ connection: 'open' }, false);
    t('open → sucesso', d2.r === 'sucesso');

    const d3 = voip._decidirEmparelhar({ connection: 'close', lastDisconnect: { error: { output: { statusCode: 515 } } } }, false);
    t('close SEM novo login → erro (515)', d3.r === 'erro' && d3.code === 515);

    const d4 = voip._decidirEmparelhar({ connection: 'close' }, true);
    t('close DEPOIS do isNewLogin → ignora (restart esperado)', d4.r === 'ignora');

    const d5 = voip._decidirEmparelhar({ connection: 'connecting' }, false);
    t('connecting → ignora', d5.r === 'ignora');
  }

  console.log('\n╔═══ 2. _logoutWhatsApp ═══╗');
  {
    // sem sessão no disco → devolve false rápido (não fica pendurado)
    const t0 = Date.now();
    const r = await voip._logoutWhatsApp();
    t('sem sessão → false imediato', r === false && (Date.now() - t0) < 2000);
  }

  console.log('\n╔═══ 3. apagarSessao não rebenta (sem sessão, sem Mongo) ═══╗');
  {
    let rebentou = false;
    try { await voip.apagarSessao(); } catch (e) { rebentou = true; }
    t('apagarSessao() conclui sem rebentar', !rebentou);
    t('estado final off', voip.getStatus().estado === 'off');
  }

  console.log(`\n${fail === 0 ? '🎉' : '⚠️ '} VOIP FECHAR: ${ok} OK / ${fail} FALHOU\n`);
  process.exit(fail ? 1 : 0);
})();
