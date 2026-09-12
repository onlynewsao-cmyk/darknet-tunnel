#!/usr/bin/env node
'use strict';

const img = require('../src/bot/imageSearch');
let failed = 0;
function ok(name, cond, extra = '') {
  if (cond) console.log('  ✅', name);
  else { failed++; console.log('  ❌', name, extra); }
}

console.log('test-aura-media');

const c = img.detectarPedidoImagem('Aura monstra o Cristiano');
ok('monstra Cristiano', c && c.termo && /cristiano/i.test(c.termo), JSON.stringify(c));

const m = img.detectarPedidoImagem('Aura mostra o Messi');
ok('mostra Messi', m && /messi/i.test(m.termo), JSON.stringify(m));

const f = img.detectarPedidoImagem('Aura manda uma foto do Neymar');
ok('foto Neymar', f && /neymar/i.test(f.termo), JSON.stringify(f));

ok('não é imagem: link', !img.detectarPedidoImagem('Aura mostra o link do grupo'));
ok('não é imagem: áudio', !img.detectarPedidoImagem('Aura manda um áudio'));

const falsa = img.extrairAcaoFalsa('_envia uma foto do jogador Cristiano Ronaldo, com um sorriso_');
ok('falsa foto CR7', falsa && falsa.tipo === 'imagem' && /cristiano/i.test(falsa.termo), JSON.stringify(falsa));

const falsaM = img.extrairAcaoFalsa('_envia uma foto do Lionel Messi, sorrindo e com a camisa_');
ok('falsa foto Messi', falsaM && falsaM.tipo === 'imagem' && /messi/i.test(falsaM.termo), JSON.stringify(falsaM));

const falsaA = img.extrairAcaoFalsa('_envia um áudio dizendo oi Dark_');
ok('falsa áudio', falsaA && falsaA.tipo === 'audio', JSON.stringify(falsaA));

const falsaS = img.extrairAcaoFalsa('*envia um sticker de uma pessoa com uma expressão de surpresa*');
ok('falsa sticker', falsaS && falsaS.tipo === 'sticker' && /pessoa|surpresa/i.test(falsaS.termo), JSON.stringify(falsaS));

if (failed) {
  console.log('\nFALHOU:', failed);
  process.exit(1);
}
console.log('\nOK  —  0 falhas');
