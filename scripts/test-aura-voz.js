#!/usr/bin/env node
'use strict';

const voz = require('../src/aura/auraVoz');

let failed = 0;
function ok(name, cond, extra = '') {
  if (cond) console.log('  ✅', name);
  else { failed++; console.log('  ❌', name, extra); }
}

console.log('test-aura-voz');

ok('pediu áudio', voz.pediuAudio('Mande um áudio quero ouvir da tua voz isso'));
ok('pediu voz', voz.pediuAudio('Aura manda um áudio'));
ok('não pediu', !voz.pediuAudio('fala oi Dark'));

const meta = 'claro Dark faz uma gravação de voz aqui está ouça';
ok('meta voz', voz.eMetaVoz(meta));
ok('não é meta: assunto', !voz.eMetaVoz('Olha, ainda não sou admin. Promove-me e eu te ponho.'));

const fala = voz.textoParaFalar(meta, {
  texto: 'Mande um áudio quero ouvir da tua voz isso',
  citado: 'Não posso conceder a permissão de ADM para você, Dark. Só o dono do grupo pode fazer isso.',
});
ok('fallback fala do ADM, não da gravação',
  /admin/i.test(fala) && !/grava[cç][aã]o/i.test(fala),
  fala);

const real = voz.textoParaFalar('Olha Dark, sobre o admin: eu só te ponho se for admin de verdade.', {
  texto: 'manda um áudio',
});
ok('mantém fala real', /admin/i.test(real) && /ponho|promov/i.test(real), real);

const inst = voz.instrucaoVoz({ citado: 'Só o dono pode' });
ok('instrução proíbe rubrica', /PROIBIDO/i.test(inst) && /assunto|DISSO/i.test(inst));

if (failed) { console.log('\nFALHOU:', failed); process.exit(1); }
console.log('\nOK  —  0 falhas');
