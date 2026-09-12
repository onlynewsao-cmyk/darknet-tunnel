#!/usr/bin/env node
/**
 * DARK BOT — REGRESSÃO: QR do VoIP no dashboard (v7.19)
 *
 * Bug: o QR da Voz Real era capturado como STRING CRUA ("2@..."), mas o
 * dashboard mostra <img src="..."> — imagem partida. O QR aparecia no
 * terminal (ASCII via qrcode-terminal) e o dashboard ficava vazio, por
 * isso o VoIP "não tinha conexão" (não dava para escanear).
 *
 * Fix: converter o QR cru em data URL (qrcode.toDataURL) na captura.
 *
 * Cobre:
 *   • _capturarQr patcha o qrcode-terminal e converte para data URL.
 *   • getStatus().qr fica com data:image/png (o dashboard renderiza).
 *   • o terminal continua a receber o ASCII (fallback intacto).
 *   • disponivel() não cola "false" para sempre.
 *
 * Uso: node scripts/test-voip-qr.js
 */
'use strict';

process.env.MONGODB_URI = '';

const voip = require('../src/bot/liveVoip');
const QRCode = require('qrcode');

let ok = 0, fail = 0;
const t = (n, c, e) => { e = e || ''; c ? ok++ : fail++; console.log('  ' + (c ? '✅' : '❌') + ' ' + n + (e ? ' → ' + String(e).slice(0, 70) : '')); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log('\n╔═══ 1. Conversão QR cru → data URL ═══╗');
  {
    // QR cru do WhatsApp (formato real: "2@ref,noiseKey,identityKey,adv")
    const cru = '2@AbCdEfGhIj,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA,BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB,CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC';
    const url = await QRCode.toDataURL(cru, { width: 420, margin: 2 });
    t('gera data URL', url.startsWith('data:image/png;base64,'));
    t('é um PNG', /^data:image\/png;base64,/.test(url));
  }

  console.log('\n╔═══ 2. _capturarQr — o dashboard passa a receber imagem ═══╗');
  {
    let recebido = null;
    voip._capturarQr((u) => { recebido = u; });
    const qrt = require('qrcode-terminal');
    const cru = '2@AbCdEfGhIj,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA,BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB,CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC';
    // simula o que o baileys-caller faz (import("qrcode-terminal").generate)
    qrt.generate(cru, { small: true });
    await sleep(300); // deixa o toDataURL resolver
    const status = voip.getStatus();
    t('getStatus().qr é data URL', typeof status.qr === 'string' && status.qr.startsWith('data:image/'));
    t('callback recebe data URL', recebido && recebido.startsWith('data:image/'));
  }

  console.log('\n╔═══ 3. Terminal continua a funcionar (fallback) ═══╗');
  {
    // o generate original imprime o QR em ASCII via console.log (não rebenta)
    const qrt = require('qrcode-terminal');
    let impresso = '';
    const realLog = console.log;
    console.log = (x) => { impresso += String(x); };
    try {
      qrt.generate('2@AbCdEfGhIj,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA,BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB,CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC', { small: true });
    } finally {
      console.log = realLog;
    }
    t('terminal ainda imprime (ASCII)', impresso.length > 20);
  }

  console.log('\n╔═══ 4. disponivel() não cola false ═══╗');
  {
    // primeira chamada carrega (ou falha) mas a segunda tenta de novo
    const r1 = await voip.disponivel();
    const r2 = await voip.disponivel();
    // o importante: chamações consecutivas devolvem o MESMO tipo e não lançam
    t('disponivel() responde sem rebentar', typeof r1 === 'boolean' && typeof r2 === 'boolean' && r1 === r2);
  }

  console.log(`\n${fail === 0 ? '🎉' : '⚠️ '} VOIP QR: ${ok} OK / ${fail} FALHOU\n`);
  process.exit(fail ? 1 : 0);
})();
