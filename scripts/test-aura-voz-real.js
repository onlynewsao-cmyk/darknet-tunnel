#!/usr/bin/env node
/**
 * DARK BOT — AURA VOZ REAL (RTP) — testes da lógica do liveVoip
 *
 * Cobre SEM sessão real de WhatsApp (não liga para ninguém):
 *   • pcmParaWav → WAV válido (RIFF/WAVE, cabeçalho, amostras 16-bit)
 *   • _criarEscuta → deteta voz → silêncio → emite WAV uma vez;
 *     áudio curto de menos é ignorado; janela máxima emite.
 *   • ligarAoVivo → número inválido recusado; sem sessão → sem_sessao_voip
 *   • disponivel() → booleano sem rebentar
 *   • gravarTtsTemp → grava ficheiro e devolve caminho existente
 *
 * Uso: node scripts/test-aura-voz-real.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const live = require('../src/bot/liveVoip');

let ok = 0, fail = 0;
const t = (n, c, e) => { e = e || ''; c ? ok++ : fail++; console.log('  ' + (c ? '✅' : '❌') + ' ' + n + (e ? ' → ' + String(e).slice(0, 80) : '')); };

(async () => {
  // ══════════════════════════════════════════════════════════
  console.log('\n╔═══ 1. PCM → WAV ═══╗');
  // ══════════════════════════════════════════════════════════
  {
    const sr = 16000;
    const samples = new Float32Array(sr); // 1 segundo de silêncio
    samples[0] = 0.5; samples[1] = -0.5;
    const wav = live.pcmParaWav(samples, sr);
    t('WAV tem cabeçalho RIFF/WAVE', wav.length >= 44 && wav.toString('ascii', 0, 4) === 'RIFF' && wav.toString('ascii', 8, 12) === 'WAVE', '');
    t('Comprimento = 44 + n*2', wav.length === 44 + sr * 2, wav.length + ' vs ' + (44 + sr * 2));
    t('Taxa de amostragem gravada = 16000', wav.readUInt32LE(24) === sr, String(wav.readUInt32LE(24)));
    t('Mono + PCM 16-bit', wav.readUInt16LE(20) === 1 && wav.readUInt16LE(22) === 1 && wav.readUInt16LE(34) === 16, '');
    t('Amostra +0.5 vira ~16384', Math.abs(wav.readInt16LE(44) - 16384) <= 2, String(wav.readInt16LE(44)));
    t('Amostra -0.5 vira ~-16384', Math.abs(wav.readInt16LE(46) + 16384) <= 2, String(wav.readInt16LE(46)));
    const clamp = live.pcmParaWav(new Float32Array([5.0, -5.0]), 8000);
    t('Clamp +5 → 32767', clamp.readInt16LE(44) === 32767, String(clamp.readInt16LE(44)));
    t('Clamp -5 → ~-32767', clamp.readInt16LE(46) <= -32766, String(clamp.readInt16LE(46)));
  }

  // ══════════════════════════════════════════════════════════
  console.log('\n╔═══ 2. Escuta (voz → silêncio → WAV) ═══╗');
  // ══════════════════════════════════════════════════════════
  {
    const sr = 16000;
    const chunkMs = 20;
    const chunkLen = (sr * chunkMs) / 1000;
    const ton = () => { const f = new Float32Array(chunkLen); for (let i = 0; i < chunkLen; i++) f[i] = 0.3 * Math.sin(2 * Math.PI * 440 * i / sr); return f; };
    const sil = () => new Float32Array(chunkLen);

    let emitido = 0, duracao = 0;
    const esc = live._criarEscuta((wav, info) => { emitido++; duracao = info.duracaoMs; }, { limiarRms: 0.05, silencioMs: 400, minMs: 100 });

    for (let i = 0; i < 25; i++) esc.push(ton());   // 500 ms de voz
    for (let i = 0; i < 30; i++) esc.push(sil());   // 600 ms de silêncio
    t('Emite 1 WAV após voz + silêncio', emitido === 1, 'emitido=' + emitido);
    // 500 ms de voz + 400 ms de silêncio até disparar o limiar
    t('Duração ≈ 900 ms (voz + cauda)', duracao >= 800 && duracao <= 1000, duracao + 'ms');

    let emitido2 = 0;
    const esc2 = live._criarEscuta(() => { emitido2++; }, { limiarRms: 0.05, silencioMs: 1000, minMs: 100 });
    for (let i = 0; i < 3; i++) esc2.push(ton());   // 60 ms — abaixo do mínimo
    for (let i = 0; i < 60; i++) esc2.push(sil());
    t('Áudio curto demais é ignorado', emitido2 === 0, 'emitido=' + emitido2);

    let emitido3 = 0;
    const esc3 = live._criarEscuta(() => { emitido3++; }, { limiarRms: 0.05, silencioMs: 100000, minMs: 100, maxMs: 600 });
    for (let i = 0; i < 100; i++) esc3.push(ton()); // 2 s — passa do maxMs
    t('Janela máxima força emissão', emitido3 >= 1, 'emitido=' + emitido3);
  }

  // ══════════════════════════════════════════════════════════
  console.log('\n╔═══ 3. Degradação graciosa do ligarAoVivo ═══╗');
  // ══════════════════════════════════════════════════════════
  {
    const invalido = await live.ligarAoVivo('12');
    t('Número inválido recusado', invalido.ok === false && invalido.motivo === 'numero_invalido', invalido.motivo);

    // Sem creds.json na sandbox → devolve sem_sessao_voip ANTES de conectar
    const semSessao = await live.ligarAoVivo('244945280380');
    t('Sem sessão VoIP → sem_sessao_voip', semSessao.ok === false && semSessao.motivo === 'sem_sessao_voip', semSessao.motivo);

    const d = await live.disponivel();
    t('disponivel() devolve booleano', typeof d === 'boolean', typeof d);
    t('getStatus() tem limites correctos', live.getStatus().limites.inbound === false && live.getStatus().limites.outboundVoz === true, '');
  }

  // ══════════════════════════════════════════════════════════
  console.log('\n╔═══ 3b. Pair code + persistência Mongo (sem sessão real) ═══╗');
  // ══════════════════════════════════════════════════════════
  {
    const par = await live.emparelhar('1');
    t('Pair code: número inválido recusado', par.ok === false && par.motivo === 'numero_invalido', par.motivo);

    // Sem MongoDB ligado na sandbox → mirror devolve false sem rebentar
    const salvou = await live._salvarNoMongo();
    t('_salvarNoMongo sem Mongo → false', salvou === false, String(salvou));
    const restaurou = await live._restaurarDoMongo();
    t('_restaurarDoMongo sem Mongo → false', restaurou === false, String(restaurou));

    // apagarSessao sem Mongo não rebenta e põe estado off
    await live.apagarSessao();
    t('apagarSessao limpa e fica off', live.getStatus().estado === 'off', live.getStatus().estado);
  }

  // ══════════════════════════════════════════════════════════
  console.log('\n╔═══ 4. TTS temp ═══╗');
  // ══════════════════════════════════════════════════════════
  {
    const nada = await live.gravarTtsTemp(Buffer.from('x'));
    t('Buffer pequeno → null', nada === null, String(nada));

    const p = await live.gravarTtsTemp(Buffer.alloc(600, 1));
    const existe = !!p && fs.existsSync(p);
    t('Grava ficheiro temp', existe, String(p));
    if (p) { try { fs.unlinkSync(p); } catch {} }
  }

  console.log('\n───────────────────────────────');
  console.log((fail === 0 ? '✅' : '❌') + ` ${ok} OK / ${fail} FALHOU\n`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error('💥 Erro no teste:', e);
  process.exit(1);
});
