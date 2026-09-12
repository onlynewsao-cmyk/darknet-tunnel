#!/usr/bin/env node
/**
 * DARK BOT — Renomear QUALQUER sticker (.stickerrename / .renomear)
 *
 * Cobre SEM sessão real:
 *   • parseArgs: '<pack> | <autor>', args separados, sem autor, limite 80
 *   • extract: sticker directo, sticker citado, ausência → null
 *   • renomear: sem sticker → pede uso; sem pack → pede exemplo;
 *     buffer inválido → erro gracioso (não rebenta)
 *
 * Uso: node scripts/test-renomear.js
 */
'use strict';

const path = require('path');
const Module = require('module');
const orig = Module.prototype.require;

// Fake do mediaHandler (sem rede)
Module.prototype.require = function (id) {
  if (typeof id === 'string' && id.endsWith('mediaHandler')) {
    return { downloadFromMessage: async () => Buffer.alloc(50, 1) }; // 50 bytes → inválido p/ renameMeta
  }
  return orig.apply(this, arguments);
};

const sr = require(path.join(__dirname, '..', 'src', 'bot', 'stickerRename'));

let ok = 0, fail = 0;
const t = (n, c, e) => { e = e || ''; c ? ok++ : fail++; console.log('  ' + (c ? '✅' : '❌') + ' ' + n + (e ? ' → ' + String(e).slice(0, 90) : '')); };

(async () => {
  // ══════════════════════════════════════════════════════════
  console.log('\n╔═══ 1. parseArgs ═══╗');
  // ══════════════════════════════════════════════════════════
  {
    const a = sr.parseArgs(['Dark Pack', '|', 'Dark Net']);
    t('args separados por | → pack/autor', a.pack === 'Dark Pack' && a.author === 'Dark Net', JSON.stringify(a));
    const b = sr.parseArgs('Dark Pack | Dark Net');
    t('string única → pack/autor', b.pack === 'Dark Pack' && b.author === 'Dark Net', JSON.stringify(b));
    const c = sr.parseArgs(['Só Pack']);
    t('sem autor → author vazio', c.pack === 'Só Pack' && c.author === '', JSON.stringify(c));
    const d = sr.parseArgs([]);
    t('vazio → pack/autor vazios', d.pack === '' && d.author === '', JSON.stringify(d));
    const long = sr.parseArgs('x'.repeat(200) + ' | ' + 'y'.repeat(200));
    t('corta a 80 chars', long.pack.length <= 80 && long.author.length <= 80, long.pack.length + '/' + long.author.length);
  }

  // ══════════════════════════════════════════════════════════
  console.log('\n╔═══ 2. extract ═══╗');
  // ══════════════════════════════════════════════════════════
  {
    const directo = sr.extract({ message: { stickerMessage: { url: 'x', isAnimated: true } } });
    t('sticker directo extraído', !!directo?.stkMsg, '');
    t('animação detectada', directo.isAnimated === true, String(directo.isAnimated));

    const citado = sr.extract({ message: { extendedTextMessage: { contextInfo: { quotedMessage: { stickerMessage: { url: 'y', isAnimated: false } } } } } });
    t('sticker citado extraído', !!citado?.stkMsg && citado.isAnimated === false, '');

    const nada = sr.extract({ message: { conversation: 'oi' } });
    t('sem sticker → null', nada === null, String(nada));
  }

  // ══════════════════════════════════════════════════════════
  console.log('\n╔═══ 3. renomear (degradação graciosa) ═══╗');
  // ══════════════════════════════════════════════════════════
  {
    const ctxBase = {
      remoteJid: '120363000000@g.us', isGroup: true, isOwner: true, pushName: 'Dark', groupName: 'G',
    };
    const sock = { sendMessage: async () => ({}) };
    let out = '';
    const reply = async (text) => { out = text; return text; };
    const react = async () => {};

    await sr.renomear({ sock, ctx: ctxBase, m: { msg: { message: { conversation: 'oi' } } }, args: [], prefix: '.', reply, react });
    t('sem sticker → pede uso', out.includes('stickerrename') && out.includes('Responde a um sticker'), out.slice(0, 50));

    await sr.renomear({ sock, ctx: ctxBase, m: { msg: { message: { stickerMessage: { url: 'x' } } } }, args: [], prefix: '.', reply, react });
    t('com sticker mas sem nome → pede exemplo', out.includes('Dark Pack'), out.slice(0, 50));

    await sr.renomear({ sock, ctx: ctxBase, m: { msg: { message: { stickerMessage: { url: 'x' } } } }, args: ['Pacote Teste', '|', 'Autor'], prefix: '.', reply, react });
    t('buffer inválido → erro gracioso', out.startsWith('❌'), out.slice(0, 60));
  }

  console.log('\n───────────────────────────────');
  console.log((fail === 0 ? '✅' : '❌') + ` ${ok} OK / ${fail} FALHOU\n`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error('💥 Erro no teste:', e);
  process.exit(1);
});
