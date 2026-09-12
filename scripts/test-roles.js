/**
 * DARK BOT — Teste do RoleResolver
 * Valida a identificação de cargo em todos os cenários.
 *
 *   👑 Dono  → "DONO SUPREMO" + "ATIVO ✅"
 *   💎 VIP   → "VIP"          + "ATIVO ✅"
 *   🛡️ Admin → "ADMIN"        + "INATIVO ❌"
 *   🆓 Free  → "FREE"         + "INATIVO ❌"
 *
 * Uso: node scripts/test-roles.js
 */
'use strict';

process.env.OWNER_NUMBER = process.env.OWNER_NUMBER || '244945280380';

const path = require('path');
const Module = require('module');
const origRequire = Module.prototype.require;

// ── Mocks (correm sem MongoDB) ──────────────────────────────
const mockCfg = {
  owner_number:  '244945280380',
  owner_lid:     '',
  owner_numbers: ['244900111222'],
};

const mockUsers = {
  '244555666777': { role: 'premium', premiumUntil: new Date(Date.now() + 86400e3 * 30), isPremium() { return true; } },
  '244999888777': { role: 'premium', premiumUntil: new Date(Date.now() - 86400e3),      isPremium() { return false; } },
  '244333222111': { role: 'owner',                                                       isPremium() { return true; } },
};

Module.prototype.require = function (id) {
  if (id.endsWith('botConfigCache')) {
    return { get: async (k, d) => (k in mockCfg ? mockCfg[k] : d) };
  }
  if (id.endsWith('models/User')) {
    return {
      findOne: (q) => {
        const u = (q && !q.whatsappNumber?.$regex && mockUsers[q.whatsappNumber]) || null;
        const p = Promise.resolve(u);
        p.lean = () => Promise.resolve(u);
        return p;
      },
    };
  }
  return origRequire.apply(this, arguments);
};

const rr = require(path.join(__dirname, '..', 'src', 'bot', 'roleResolver'));

const sock = {
  groupMetadata: async () => ({
    participants: [
      { id: '244777888999@s.whatsapp.net', admin: 'admin' },
      { id: '244111222333@s.whatsapp.net', admin: null },
    ],
  }),
};

const ctxOf = (num, group = true, isOwner = false) => ({
  senderNumber: num,
  senderJid: `${num}@s.whatsapp.net`,
  isGroup: group,
  remoteJid: group ? '123456@g.us' : `${num}@s.whatsapp.net`,
  isOwner,
});

// [nome, ctx, cargoEsperado, vipEsperado(prefixo)]
const CASOS = [
  ['Dono via .env',            ctxOf('244945280380'),            '👑 DONO SUPREMO', 'ATIVO ✅'],
  ['Dono via ctx.isOwner',     ctxOf('244000000001', true, true), '👑 DONO SUPREMO', 'ATIVO ✅'],
  ['Subdono (owner_numbers)',  ctxOf('244900111222'),            '👑 DONO SUPREMO', 'ATIVO ✅'],
  ['Dono via role no Mongo',   ctxOf('244333222111'),            '👑 DONO SUPREMO', 'ATIVO ✅'],
  ['VIP activo',               ctxOf('244555666777'),            '💎 VIP',          'ATIVO ✅'],
  ['VIP expirado → Free',      ctxOf('244999888777'),            '🆓 FREE',         'INATIVO ❌'],
  ['Admin do grupo',           ctxOf('244777888999'),            '🛡️ ADMIN',        'INATIVO ❌'],
  ['Free em grupo',            ctxOf('244111222333'),            '🆓 FREE',         'INATIVO ❌'],
  ['Free no privado',          ctxOf('244111222333', false),     '🆓 FREE',         'INATIVO ❌'],
  ['Dono no privado',          ctxOf('244945280380', false),     '👑 DONO SUPREMO', 'ATIVO ✅'],
];

(async () => {
  let ok = 0, fail = 0;

  console.log('\n╔═══════════════════════════════════════════════════════════════════════╗');
  console.log('║          DARK BOT — TESTE DE IDENTIFICAÇÃO DE CARGO                   ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════╝\n');

  for (const [nome, ctx, cargoEsp, vipEsp] of CASOS) {
    const msg = { key: { participant: ctx.senderJid, remoteJid: ctx.remoteJid } };
    const r = await rr.resolveRole({ ctx, msg, sock });

    const cargoOk = r.cargo === cargoEsp;
    const vipOk   = r.vip.startsWith(vipEsp);
    const pass    = cargoOk && vipOk;

    pass ? ok++ : fail++;
    console.log(
      `  ${pass ? '✅' : '❌'} ${nome.padEnd(26)} → ${r.cargo.padEnd(16)} | ${r.vip}`
    );
    if (!pass) console.log(`      esperado: ${cargoEsp} | ${vipEsp}`);
  }

  // Fallback: sem contexto nenhum nunca deve rebentar
  const fb = await rr.resolveRole({ ctx: {} });
  const fbOk = fb.cargo === '🆓 FREE' && fb.vip === 'INATIVO ❌';
  fbOk ? ok++ : fail++;
  console.log(`  ${fbOk ? '✅' : '❌'} ${'Fallback (ctx vazio)'.padEnd(26)} → ${fb.cargo.padEnd(16)} | ${fb.vip}`);

  // Hierarquia: dono nunca deve ser marcado como admin/free
  const dono = await rr.resolveRole({ ctx: ctxOf('244945280380'), sock });
  const hierOk = dono.isOwner && dono.isVip && !dono.isFree;
  hierOk ? ok++ : fail++;
  console.log(`  ${hierOk ? '✅' : '❌'} ${'Hierarquia Dono > VIP'.padEnd(26)} → isOwner=${dono.isOwner} isVip=${dono.isVip} isFree=${dono.isFree}`);

  console.log(`\n  ${ok} OK / ${fail} FALHOU\n`);
  process.exit(fail ? 1 : 0);
})();
