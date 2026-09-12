#!/usr/bin/env node
/**
 * DARK BOT — REGRESSÃO: pair code "sem ligação" (v7.17)
 *
 * Bug: a última alteração ao pair code (da656f1) trocou a espera pela
 * ligação por um `delay(2000)` cego. O requestPairingCode → sendNode →
 * sendRawMessage atira "Connection Closed" se `ws.isOpen` for false — e
 * no Render free o websocket muitas vezes ainda não abriu aos 2s. O bot
 * ficava "sem ligação" e o código nunca aparecia.
 *
 * Fix: esperar o WEBSOCKET abrir (waitForSocketOpen), NÃO a conexão
 * completa 'open' (essa só dispara depois do emparelhamento).
 *
 * Cobre _esperarWsAberto do WhatsAppBot e do CallBaileys:
 *   • resolve imediato se ws.isOpen
 *   • usa waitForSocketOpen quando existe (resolve/reject)
 *   • fallback por poll quando não há waitForSocketOpen
 *   • timeout em vez de ficar pendurado para sempre
 *
 * Uso: node scripts/test-paircode-conexao.js
 */
'use strict';

process.env.MONGODB_URI = '';

const { WhatsAppBot } = require('../src/bot/whatsapp');
const { CallBaileys } = require('../src/bot/callSocket');

let ok = 0, fail = 0;
const t = (n, c, e) => { e = e || ''; c ? ok++ : fail++; console.log('  ' + (c ? '✅' : '❌') + ' ' + n + (e ? ' → ' + String(e).slice(0, 70) : '')); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const bot = new WhatsAppBot();

  console.log('\n╔═══ 1. WhatsAppBot._esperarWsAberto ═══╗');
  {
    // 1a. ws já aberto → imediato
    bot.sock = { ws: { isOpen: true } };
    t('ws aberto → resolve imediato', (await bot._esperarWsAberto(2000)) === true);

    // 1b. waitForSocketOpen resolve (caso real do fork)
    bot.sock = { ws: { isOpen: false }, waitForSocketOpen: async () => { await sleep(50); } };
    t('waitForSocketOpen resolve → ok', (await bot._esperarWsAberto(2000)) === true);

    // 1c. waitForSocketOpen rejeita (ws fechou) → rejeita
    bot.sock = { ws: { isOpen: false }, waitForSocketOpen: async () => { throw new Error('Connection Closed'); } };
    let rejeitou = false;
    try { await bot._esperarWsAberto(2000); } catch (e) { rejeitou = /Connection Closed/.test(e.message); }
    t('waitForSocketOpen rejeita → propaga o erro', rejeitou);

    // 1d. waitForSocketOpen pendurado → timeout (não fica preso)
    bot.sock = { ws: { isOpen: false }, waitForSocketOpen: async () => new Promise(() => {}) };
    let timeout = false;
    const t0 = Date.now();
    try { await bot._esperarWsAberto(600); } catch (e) { timeout = /Timeout|sem ligação/i.test(e.message); }
    t('pendurado → timeout em vez de infinito', timeout && (Date.now() - t0) < 3000);

    // 1e. sem waitForSocketOpen → fallback por poll até abrir
    const wsFake = { isOpen: false, isClosed: false };
    bot.sock = { ws: wsFake };
    setTimeout(() => { wsFake.isOpen = true; }, 400);
    t('sem waitForSocketOpen → poll até abrir', (await bot._esperarWsAberto(2000)) === true);

    // 1f. fallback com ws fechado → rejeita logo
    bot.sock = { ws: { isOpen: false, isClosed: true } };
    let fechou = false;
    try { await bot._esperarWsAberto(2000); } catch (e) { fechou = /sem ligação|Timeout/i.test(e.message); }
    t('ws fechado → rejeita (sem ligação)', fechou);
  }

  console.log('\n╔═══ 2. CallBaileys._esperarWsAberto ═══╗');
  {
    const call = new CallBaileys();
    call.sock = { ws: { isOpen: true } };
    t('calls: ws aberto → imediato', (await call._esperarWsAberto(2000)) === true);

    call.sock = { ws: { isOpen: false }, waitForSocketOpen: async () => { await sleep(30); } };
    t('calls: waitForSocketOpen resolve → ok', (await call._esperarWsAberto(2000)) === true);

    call.sock = { ws: { isOpen: false }, waitForSocketOpen: async () => new Promise(() => {}) };
    let timeout = false;
    try { await call._esperarWsAberto(500); } catch (e) { timeout = /Timeout|sem ligação/i.test(e.message); }
    t('calls: pendurado → timeout', timeout);
  }

  console.log('\n╔═══ 3. O pedido só sai com o ws aberto (simulação) ═══╗');
  {
    // reproduz a ordem correcta: esperar ws → requestPairingCode
    const ordem = [];
    bot.sock = {
      ws: { isOpen: false },
      waitForSocketOpen: async () => { await sleep(100); ordem.push('ws-open'); },
      requestPairingCode: async () => { ordem.push('pair'); return '1234-5678'; },
    };
    await bot._esperarWsAberto(2000);
    await bot.sock.requestPairingCode('244999999999');
    t('requestPairingCode só depois do ws abrir', ordem[0] === 'ws-open' && ordem[1] === 'pair');
  }

  console.log('\n╔═══ 4. _esperarProntoParaPair (v7.18 — servidor pronto) ═══╗');
  {
    const mkEv = () => {
      const handlers = new Set();
      return { handlers, on: (e, fn) => handlers.add(fn), off: (e, fn) => handlers.delete(fn), emit: (u) => { for (const fn of handlers) fn(u); } };
    };

    // 4a. resolve no evento qr (servidor mandou pair-device)
    const ev = mkEv();
    bot.sock = { ws: { isOpen: true }, ev };
    setTimeout(() => ev.emit({ qr: 'ref,keys' }), 40);
    t('resolve no evento qr (servidor pronto)', (await bot._esperarProntoParaPair(2000)) === true);

    // 4b. resolve se já conectou (open)
    const ev2 = mkEv();
    bot.sock = { ws: { isOpen: true }, ev: ev2 };
    setTimeout(() => ev2.emit({ connection: 'open' }), 40);
    t('resolve se connection open', (await bot._esperarProntoParaPair(2000)) === true);

    // 4c. rejeita se a ligação fechar (versão rejeitada)
    const ev3 = mkEv();
    bot.sock = { ws: { isOpen: true }, ev: ev3 };
    setTimeout(() => ev3.emit({ connection: 'close', lastDisconnect: { error: { output: { statusCode: 403 } } } }), 40);
    let fechou = false;
    try { await bot._esperarProntoParaPair(2000); } catch (e) { fechou = /fechada|403/.test(e.message); }
    t('rejeita se a ligação fechar (403)', fechou);

    // 4d. timeout se o servidor nunca responder
    const ev4 = mkEv();
    bot.sock = { ws: { isOpen: true }, ev: ev4 };
    let t0 = Date.now();
    let timeout = false;
    try { await bot._esperarProntoParaPair(500); } catch (e) { timeout = /Timeout|não respondeu/i.test(e.message); }
    t('timeout se o servidor nunca responder', timeout && (Date.now() - t0) < 3000);
  }

  console.log('\n╔═══ 5. Sequência completa do pair code ═══╗');
  {
    // ws abre → servidor manda qr → requestPairingCode
    const ordem = [];
    const ev = (() => { const s = new Set(); return { on: (e, fn) => s.add(fn), off: (e, fn) => s.delete(fn), fire: (u) => { for (const fn of [...s]) fn(u); } }; })();
    bot.sock = {
      ws: { isOpen: false },
      ev,
      waitForSocketOpen: async () => { await sleep(30); },
      requestPairingCode: async () => { ordem.push('pair'); return '1234-5678'; },
    };
    // simula: ws abre, e depois o servidor manda qr
    setTimeout(() => ev.fire({ qr: 'x' }), 150);
    await bot._esperarWsAberto(2000);
    await bot._esperarProntoParaPair(2000);
    await bot.sock.requestPairingCode('244999999999');
    t('pair só depois do servidor ficar pronto', ordem[0] === 'pair');
  }

  console.log(`\n${fail === 0 ? '🎉' : '⚠️ '} PAIR CODE: ${ok} OK / ${fail} FALHOU\n`);
  process.exit(fail ? 1 : 0);
})();
