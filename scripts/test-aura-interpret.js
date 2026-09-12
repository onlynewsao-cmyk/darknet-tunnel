#!/usr/bin/env node
'use strict';

const i = require('../src/aura/auraInterpret');
const brain = require('../src/aura/auraBrain');
let failed = 0;
function ok(name, cond, extra = '') {
  if (cond) console.log('  ✅', name);
  else { failed++; console.log('  ❌', name, extra); }
}

console.log('test-aura-interpret');

ok('xinga', i.detectarPedido('Aura xinga o @ladjum') === 'xingar');
ok('zoa', i.detectarPedido('Aura zoa o L1TTL3B0Y') === 'zoar');
ok('respeita', i.detectarPedido('Aura m respeita') === 'respeitar');
ok('respeita-me', i.detectarPedido('Aura me respeita') === 'respeitar');

ok('recusa ofensivo', i.eRecusaPolitica('Desculpe, mas não posso criar conteúdo ofensivo ou xingar alguém.'));
ok('recusa legal', i.eRecusaPolitica('Não vou zoar ou xingar ninguém, Dark. Isso não é legal.'));
ok('recusa zoadas', i.eRecusaPolitica('as palavras estão um pouco "zoadas"!'));
ok('fala normal não é recusa', !i.eRecusaPolitica('Olha tu, até o Wi-Fi desiste.'));

const cons = i.consertarSeRecusou(
  'Desculpe, mas não posso criar conteúdo ofensivo.',
  'Aura xinga o ladjum'
);
ok('conserta recusa xingar', cons && !i.eRecusaPolitica(cons) && /ladjum/i.test(cons));

const resp = i.consertarSeRecusou(
  'Não vou zoar ou xingar ninguém, Dark. Isso não é legal.',
  'Aura m respeita'
);
ok('respeita não recusa o mundo', /respeito/i.test(resp));

const capX = brain.detectarCapacidade('aura xinga o @123');
ok('catálogo xingar', capX && capX.id === 'xingar');
const capZ = brain.detectarCapacidade('aura zoa o boy');
ok('catálogo zoar', capZ && capZ.id === 'zoar');
const capR = brain.detectarCapacidade('aura me respeita');
ok('catálogo respeitar', capR && capR.id === 'respeitar');

const local = i.fallbackLocal('xingar', 'ladjum');
ok('fallback sem leis', !i.eRecusaPolitica(local) && /ladjum/i.test(local));

if (failed) {
  console.log('\nFALHOU:', failed);
  process.exit(1);
}
console.log('\nOK  —  0 falhas');
