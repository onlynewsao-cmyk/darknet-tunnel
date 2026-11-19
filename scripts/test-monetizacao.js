'use strict';
/** v7.79 — MONETIZAÇÃO PRO: vendas, rejeitar, approvedAt */
let ok = 0, fail = 0;
const check = (n, c, x = '') => { if (c) { ok++; console.log('  ✅', n); } else { fail++; console.log('  ❌', n, x); } };

const Module = require('module');
const _orig = Module.prototype.require;
const D = 86400000, NOW = Date.now();
const approvedDocs = [
  { amount: 5000, plan: 'mensal', reference: 'DARK-00000001', status: 'aprovado', notes: 'grupo:G1@g.us|plano:mensal|dias:30|kz:5000|brl:15|gnome:G1|pago:244900:1:x', approvedAt: new Date(NOW - 2 * D), updatedAt: new Date(NOW - 2 * D) },
  { amount: 1500, plan: 'semanal', reference: 'DARK-00000002', status: 'aprovado', notes: 'grupo:G2@g.us|plano:semanal|dias:7|kz:1500|brl:5|gnome:G2', approvedAt: new Date(NOW - 40 * D), updatedAt: new Date(NOW - 40 * D) },
];
const pendDocs = [
  { reference: 'DARK-00000003', status: 'pendente', whatsappNumber: '244911', username: 'A', notes: 'grupo:G3@g.us|plano:mensal|dias:30|kz:5000|brl:15|gnome:G3|pago:244911:2:y', createdAt: new Date() },
  { reference: 'DARK-00000004', status: 'pendente', whatsappNumber: '244922', username: 'B', notes: 'grupo:G4@g.us|plano:semanal|dias:7|kz:1500|brl:5|gnome:G4', createdAt: new Date() },
];
const hostedDocs = [
  { groupJid: 'GA@g.us', groupName: 'GA', isHosted: true, hostedUntil: new Date(NOW + 30 * D) },
  { groupJid: 'GB@g.us', groupName: 'GB', isHosted: true, hostedUntil: new Date(NOW + 2 * D) },
  { groupJid: 'GP@g.us', groupName: 'GP', isHosted: true, hostedUntil: null },
  { groupJid: 'GC@g.us', groupName: 'GC', isHosted: true, hostedUntil: new Date(NOW - 1 * D) },
];
const got = {};
Module.prototype.require = function (id) {
  const s = String(id);
  if (s.endsWith('models/Payment')) return {
    find: (q) => ({ lean: async () => (q?.status === 'aprovado' ? approvedDocs : q?.status === 'pendente' ? pendDocs : []) }),
    findOne: () => ({ lean: async () => null }),
    findOneAndUpdate: async (f, u) => { got.payUpd = { f, u }; return {}; },
  };
  if (s.endsWith('models/GroupSettings')) return {
    find: () => ({ lean: async () => hostedDocs }),
    findOne: () => ({ lean: async () => null }),
    findOneAndUpdate: async () => ({}),
    countDocuments: async () => 3,
  };
  if (s.endsWith('botConfigCache')) return { get: async (k, d) => d };
  if (s.endsWith('hotCache')) return { forgetGroup: () => {} };
  return _orig.apply(this, arguments);
};

const cmds = {};
const rental = require('../src/bot/cases/rental2.js');
rental((names, fn) => names.forEach(n => { cmds[n] = fn; }));

const store = [];
const sock = { sendMessage: async (jid, content) => { store.push({ jid, ...content }); return { key: { id: 'x' } }; } };
const CTX = { remoteJid: 'PV@s.whatsapp.net', senderNumber: '244900000000', pushName: 'Dono' };
const MSG = { key: { id: 'm1' } };
const cfg = { bot: { prefix: '!' }, owner: { number: '244900000000' } };

(async () => {
  // vendas (dono)
  let out = '';
  await cmds['vendas']({ ctx: CTX, isOwner: true, config: cfg, reply: async (t) => { out = t; } });
  check('vendas soma Kz total', /6\.500 Kz|6500 Kz/.test(out), out.slice(0, 60));
  check('vendas soma BRL das notes', /R\$ 20/.test(out));
  check('vendas conta aprovados + por plano', /2/.test(out) && /mensal.*1/.test(out) && /semanal.*1/.test(out));
  check('vendas este mês só o recente', /Este mês: \*1\*/.test(out));
  check('vendas inclui aluguel permanente nos ativos/expirando/trials', /ativos: \*3\*/.test(out) && /expirar ≤3d/.test(out) && /Trials ativos: \*3\*/.test(out), out.slice(-120));
  check('vendas pendentes pagos a aguardar', /Pendentes: \*2\*/.test(out) && /1 pagos a aguardar/.test(out));
  // vendas bloqueia não-dono
  out = '';
  await cmds['vendas']({ ctx: { ...CTX, senderNumber: '244911111111' }, isOwner: false, config: cfg, reply: async (t) => { out = t; } });
  check('vendas bloqueia não-dono', /Só o \*dono\*/.test(out));
  // ativar grava approvedAt
  rental._pedidos.set('DARK-11111111', { reference: 'DARK-11111111', planId: 'mensal', dias: 30, amountKz: 5000, brl: 15, groupJid: 'GZ@g.us', groupName: 'GZ', byNumber: '244933', byName: 'Z', status: 'pendente', ts: NOW, paid: { by: '244933', ts: NOW, obs: '' } });
  out = '';
  await cmds['ativar']({ sock, msg: MSG, ctx: CTX, args: ['DARK-11111111'], isOwner: true, config: cfg, reply: async (t) => { out = t; } });
  check('ativar aprova', /aprovado/.test(out));
  check('ativar grava approvedAt', !!got.payUpd?.u?.approvedAt, JSON.stringify(got.payUpd?.u || {}).slice(0, 80));
  // rejeitar
  rental._pedidos.set('DARK-22222222', { reference: 'DARK-22222222', planId: 'semanal', dias: 7, amountKz: 1500, brl: 5, groupJid: 'GY@g.us', groupName: 'GY', byNumber: '244944', byName: 'Y', status: 'pendente', ts: NOW, paid: null });
  store.length = 0; out = '';
  await cmds['rejeitar']({ sock, msg: MSG, ctx: CTX, args: ['DARK-22222222', 'sem', 'comprovativo'], isOwner: true, config: cfg, reply: async (t) => { out = t; } });
  check('rejeitar confirma', /rejeitado/.test(out));
  check('rejeitar avisa o grupo + motivo', store.some(m => m.jid === 'GY@g.us' && /sem comprovativo/.test(m.text || '')));
  check('rejeitar persiste status', got.payUpd?.u?.status === 'rejeitado');
  out = '';
  await cmds['rejeitar']({ sock, msg: MSG, ctx: CTX, args: ['DARK-22222222'], isOwner: true, config: cfg, reply: async (t) => { out = t; } });
  check('rejeitar duplo avisa', /já estava rejeitado/.test(out));
  out = '';
  await cmds['rejeitar']({ sock, msg: MSG, ctx: CTX, args: ['DARK-11111111'], isOwner: true, config: cfg, reply: async (t) => { out = t; } });
  check('rejeitar aprovado bloqueia', /já foi aprovado/.test(out));

  console.log(`\n${fail ? '💥' : '🎉'} MONETIZAÇÃO: ${ok} OK / ${fail} FALHOU\n`);
  process.exit(fail ? 1 : 0);
})();
