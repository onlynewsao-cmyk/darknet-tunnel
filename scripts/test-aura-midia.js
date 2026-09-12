#!/usr/bin/env node
/**
 * DARK BOT — AURA MULTIMODAL (Etapa 1) — testes de lógica pura
 *
 * Cobre SEM rede:
 *   • unwrap: desembrulha viewOnce/ephemeral/edited
 *   • detectarTipo: imagem, vídeo, áudio, documento, sticker, ptv
 *   • extrairUrl: detecta links (e limpa pontuação)
 *   • eTexto: distingue txt/md/csv de PDF/binário
 *   • auraMemory.eImportante + guardarMedia (importante vs recente)
 *
 * Uso: node scripts/test-aura-midia.js
 */
'use strict';

process.env.OWNER_NUMBER = '244945280380';

const Module = require('module');
const orig = Module.prototype.require;
const DB = {}; // simula o MongoDB em memória
// findOne devolve um objecto com .lean() que devolve uma Promise (como o mongoose)
const fakeFindOne = ({ key }) => ({ lean: () => Promise.resolve(key in DB ? { key, value: DB[key] } : null) });
Module.prototype.require = function (id) {
  if (typeof id === 'string' && /models[\/\\]/.test(id)) {
    return {
      findOne: fakeFindOne,
      findOneAndUpdate: async ({ key }, { $set }) => { DB[key] = $set.value; return null; },
      updateOne: async ({ key }, { $set }) => { DB[key] = $set.value; return null; },
      find: () => Promise.resolve([]),
      countDocuments: async () => 0,
    };
  }
  if (typeof id === 'string' && id.endsWith('botConfigCache')) return { get: async (k, d) => (k in DB ? DB[k] : d), set: async (k, v) => { DB[k] = v; }, clear: () => {} };
  return orig.apply(this, arguments);
};

const am = require('../src/aura/auraMedia');
const mem = require('../src/aura/auraMemory');

let ok = 0, fail = 0;
const t = (n, c, e) => { e = e || ''; c ? ok++ : fail++; console.log('  ' + (c ? '✅' : '❌') + ' ' + n + (e ? ' → ' + String(e).slice(0, 70) : '')); };

(async () => {
  console.log('\n╔═══ 1. unwrap (view-once / ephemeral / edited) ═══╗');
  {
    const viewOnce = { viewOnceMessage: { message: { imageMessage: { caption: 'x' } } } };
    t('viewOnce → imagem', am.unwrap(viewOnce).imageMessage !== undefined, '');
    const ephemeral = { ephemeralMessage: { message: { audioMessage: {} } } };
    t('ephemeral → áudio', am.unwrap(ephemeral).audioMessage !== undefined, '');
    const edited = { editedMessage: { message: { conversation: 'editado' } } };
    t('edited → texto', am.unwrap(edited).conversation === 'editado', '');
    const aninhado = { viewOnceMessage: { message: { ephemeralMessage: { message: { videoMessage: {} } } } } };
    t('aninhado viewOnce+ephemeral → vídeo', am.unwrap(aninhado).videoMessage !== undefined, '');
  }

  console.log('\n╔═══ 2. detectarTipo ═══╗');
  {
    t('imagem', am.detectarTipo({ imageMessage: {} }).tipo === 'imagem', '');
    t('vídeo', am.detectarTipo({ videoMessage: {} }).tipo === 'video', '');
    t('ptv', am.detectarTipo({ ptvMessage: {} }).tipo === 'video', '');
    t('áudio', am.detectarTipo({ audioMessage: {} }).tipo === 'audio', '');
    t('documento', am.detectarTipo({ documentMessage: {} }).tipo === 'documento', '');
    t('sticker', am.detectarTipo({ stickerMessage: {} }).tipo === 'sticker', '');
    t('viewOnce → documento', am.detectarTipo({ viewOnceMessage: { message: { documentMessage: {} } } }).tipo === 'documento', '');
    t('nada', am.detectarTipo({ conversation: 'oi' }).tipo === 'nenhum', '');
  }

  console.log('\n╔═══ 3. extrairUrl ═══╗');
  {
    t('link simples', am.extrairUrl('vê isto https://example.com/x') === 'https://example.com/x', am.extrairUrl('vê isto https://example.com/x'));
    t('limpa pontuação', am.extrairUrl('https://ex.com/a.') === 'https://ex.com/a', am.extrairUrl('https://ex.com/a.'));
    t('sem link → vazio', am.extrairUrl('sem link aqui') === '', '');
  }

  console.log('\n╔═══ 4. eTexto (txt vs PDF) ═══╗');
  {
    t('txt é texto', am.eTexto('notas.txt', 'text/plain') === true, '');
    t('md é texto', am.eTexto('README.md', '') === true, '');
    t('csv é texto', am.eTexto('dados.csv', 'text/csv') === true, '');
    t('json é texto', am.eTexto('x.json', 'application/json') === true, '');
    t('pdf NÃO é texto', am.eTexto('doc.pdf', 'application/pdf') === false, '');
    t('zip NÃO é texto', am.eTexto('x.zip', 'application/zip') === false, '');
  }

  console.log('\n╔═══ 5. Memória (importante vs recente) ═══╗');
  {
    t('facto importante', mem.eImportante('o meu nome é João') === true, '');
    t('dado sensível importante', mem.eImportante('a minha conta é 123456') === true, '');
    t('mídia com resumo longo importante', mem.eImportante('[DOC] ficheiro: contrato de aluguer com cláusula de rescisão') === true, '');
    t('conversa curta não é importante', mem.eImportante('oi') === false, '');
    t('mídia curta não é importante', mem.eImportante('[FOTO] x') === false, '');

    await mem.guardarMedia('244900000001', '[DOC] contrato: o arrendatário paga 50000 kz por mês');
    const l = await mem.lembrar('244900000001');
    t('resumo importante guardado', (l.importante || []).some(x => /contrato/.test(x)), JSON.stringify(l.importante).slice(0, 60));

    await mem.guardarMedia('244900000002', '[FOTO] x');
    const l2 = await mem.lembrar('244900000002');
    t('resumo curto vai para o recente (não importante)', !(l2.importante || []).length, '');
  }

  console.log('\n───────────────────────────────');
  console.log((fail === 0 ? '✅' : '❌') + ` ${ok} OK / ${fail} FALHOU\n`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('💥', e); process.exit(1); });
