/**
 * DARK BOT — Teste de performance do caminho crítico
 *
 * Mede as operações de I/O feitas por UMA mensagem e garante que
 * não voltamos a introduzir leituras duplicadas.
 *
 * Corre sem MongoDB (mocks em memória com latência simulada).
 * Uso: node scripts/test-perf.js
 */
'use strict';

process.env.OWNER_NUMBER = '244945280380';

const path = require('path');
const Module = require('module');
const origRequire = Module.prototype.require;

const counts = new Map();
const bump = (k) => counts.set(k, (counts.get(k) || 0) + 1);
const LAT = 40; // MongoDB Atlas free: ~40ms por query
const slow = (v) => new Promise((r) => setTimeout(() => r(v), LAT));

function mkModel(name) {
  const doc = {
    _id: 'x', whatsappNumber: '244111222333', role: 'premium',
    groupJid: '123@g.us', premiumUntil: new Date(Date.now() + 864e5 * 30),
    isPremium() { return true; }, save: async () => { bump(name + '.save'); },
    commandsUsed: 0, botEnabled: true, active: true, commandsUsedToday: 0,
    totalCommands: 0, isHosted: true, hostedUntil: null,
    trialExpiresAt: new Date(Date.now() + 864e5),
    lastResetDate: new Date().toISOString().split('T')[0],
    blockedCommands: [], blockedSubmenus: [], auraMode: 'assistant',
    messages: [], addMessage() {}, warns: [],
  };
  const q = (m) => {
    bump(`${name}.${m}`);
    const p = slow(doc);
    p.lean = () => { const r = slow(doc); r.catch = () => r; return r; };
    p.select = () => p; p.catch = () => p;
    return p;
  };
  return {
    findOne: () => q('findOne'),
    find: () => { bump(name + '.find'); const p = slow([]); p.lean = () => slow([]); p.select = () => p; p.catch = () => p; return p; },
    create: async () => { bump(name + '.create'); return doc; },
    updateOne: async () => { bump(name + '.updateOne'); return {}; },
    findOneAndUpdate: async () => { bump(name + '.findOneAndUpdate'); return doc; },
    countDocuments: async () => { bump(name + '.count'); return 0; },
    getOrCreate: async () => { bump(name + '.getOrCreate'); return { addMessage() {}, save: async () => {}, messages: [] }; },
  };
}

Module.prototype.require = function (id) {
  const m = /models\/(\w+)$/.exec(id);
  if (m) return mkModel(m[1]);
  if (id.endsWith('botConfigCache')) {
    return {
      get: async (k, d) => {
        bump('config:' + k);
        await new Promise((r) => setTimeout(r, LAT));
        if (k === 'owner_number') return '244945280380';
        if (k === 'ai_auto_enabled') return true;
        return d;
      },
      set: async () => {}, invalidate: () => {}, warmUp: async () => {},
    };
  }
  return origRequire.apply(this, arguments);
};

const ch = require(path.join(__dirname, '..', 'src', 'bot', 'commandHandler'));
const rc = require(path.join(__dirname, '..', 'src', 'bot', 'requestCache'));

const sock = {
  user: { id: '244949926074:1@s.whatsapp.net' },
  sendMessage: async () => ({ key: {} }),
  groupMetadata: async () => { bump('WA.groupMetadata'); await new Promise(r => setTimeout(r, LAT)); return { subject: 'G', participants: [{ id: '244111222333@s.whatsapp.net', admin: null }] }; },
  sendPresenceUpdate: async () => {}, readMessages: async () => {},
};

const mkMsg = (t) => ({
  key: { remoteJid: '123@g.us', participant: '244111222333@s.whatsapp.net', id: 'X' + Math.random(), fromMe: false },
  message: { conversation: t }, pushName: 'Ze', messageTimestamp: Math.floor(Date.now() / 1000),
});

let ok = 0, fail = 0;
const check = (nome, cond, extra = '') => {
  cond ? ok++ : fail++;
  console.log(`  ${cond ? '✅' : '❌'} ${nome}${extra ? ' → ' + extra : ''}`);
};

(async () => {
  console.log('\n╔═══════════════════════════════════════════════════════════════════╗');
  console.log('║        DARK BOT — PERFORMANCE DO CAMINHO CRÍTICO                  ║');
  console.log('╚═══════════════════════════════════════════════════════════════════╝\n');

  // ── RequestCache ────────────────────────────────────────────
  console.log('▸ RequestCache');
  let calls = 0;
  const loader = async () => { calls++; await new Promise(r => setTimeout(r, 20)); return { id: 1 }; };

  rc.begin();
  await rc.remember('k', loader); await rc.remember('k', loader); await rc.remember('k', loader);
  check('3 leituras iguais = 1 query', calls === 1, `${calls} query(s)`);
  rc.end();

  calls = 0; rc.begin();
  const t0 = Date.now();
  await Promise.all([rc.remember('x', loader), rc.remember('x', loader), rc.remember('x', loader)]);
  const dt = Date.now() - t0;
  check('Dedup de pedidos concorrentes', calls === 1 && dt < 50, `${calls} query em ${dt}ms`);
  rc.end();

  calls = 0;
  rc.begin(); await rc.remember('y', loader); rc.end();
  rc.begin(); await rc.remember('y', loader); rc.end();
  check('Cache NÃO vaza entre mensagens', calls === 2, `${calls} queries`);

  calls = 0; rc.begin();
  const bad = async () => { calls++; throw new Error('falhou'); };
  await rc.remember('z', bad).catch(() => {});
  await rc.remember('z', bad).catch(() => {});
  check('Erro não fica memorizado', calls === 2, `${calls} tentativas`);
  rc.end();

  check('Sem âmbito activo não rebenta', (rc.end(), typeof (await rc.remember('w', loader)) === 'object'));

  // ── Caminho crítico ─────────────────────────────────────────
  console.log('\n▸ Uma mensagem = quantas idas à base?');
  await ch.handle(sock, mkMsg('aquece')).catch(() => {});
  counts.clear();

  const t1 = Date.now();
  await ch.handle(sock, mkMsg('ping')).catch(() => {});
  const ms = Date.now() - t1;

  const users  = counts.get('User.findOne') || 0;
  const groups = counts.get('GroupSettings.findOne') || 0;
  const total  = [...counts.values()].reduce((a, b) => a + b, 0);

  console.log(`     (${total} operações, ${ms}ms com ${LAT}ms de latência simulada)`);
  check('User lido no máximo 1x', users <= 1, `${users}x`);
  check('GroupSettings lido no máximo 1x', groups <= 1, `${groups}x`);
  check('Total de I/O <= 12', total <= 12, `${total} ops`);
  check('Latência abaixo de 120ms', ms < 120, `${ms}ms`);

  console.log('\n  Detalhe:');
  [...counts].sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`    ${String(v).padStart(2)}x ${k}`));

  console.log(`\n  ${ok} OK / ${fail} FALHOU\n`);
  process.exit(fail ? 1 : 0);
})();
