#!/usr/bin/env node
'use strict';

const grupo = require('../src/aura/auraGrupo');
const brain = require('../src/aura/auraBrain');
const cmds = require('../src/aura/auraCommands');

let failed = 0;
function ok(name, cond, extra = '') {
  if (cond) console.log('  ✅', name);
  else { failed++; console.log('  ❌', name, extra); }
}

console.log('test-aura-grupo');

const frases = [
  'Me adiciona com ADM',
  'Aura me adiciona com ADM',
  'quero ser ADM',
  'Sim quero ser ADM',
  'me põe admin',
  'agora adiciona',
  'promove o @244',
];
for (const f of frases) {
  const d = grupo.detectarPedidoGrupo(f);
  ok('detecta: ' + f, d && d.acao === 'promote', JSON.stringify(d));
}

ok('não é promote: oi', !grupo.detectarPedidoGrupo('oi tudo bem'));
ok('não é promote: fecha o grupo', !grupo.detectarPedidoGrupo('fecha o grupo'));

ok('brain me adiciona', (brain.detectarCapacidade('me adiciona com adm') || {}).id === 'promover_admin');
ok('brain quero ser adm', (brain.detectarCapacidade('quero ser adm') || {}).id === 'promover_admin');
ok('brain agora adiciona', (brain.detectarCapacidade('agora adiciona') || {}).id === 'promover_admin');
ok('brain lista admins', (brain.detectarCapacidade('quem sao os admins') || {}).id === 'listar_admins');

ok('comando promote', (cmds.detectarComando('me adiciona com ADM') || {}).comando === 'promote');
ok('comando quero ser', (cmds.detectarComando('quero ser admin') || {}).comando === 'promote');

// Execução honesta: bot NÃO é admin → não mente que promoveu
(async () => {
  const updates = [];
  const sock = {
    user: { id: '244949926074:1@s.whatsapp.net' },
    groupMetadata: async () => ({
      participants: [
        { id: '244945280380@s.whatsapp.net', admin: null },
        { id: '244949926074@s.whatsapp.net', admin: null },
      ],
    }),
    groupParticipantsUpdate: async (g, j, a) => { updates.push({ g, j, a }); },
  };
  const ctx = {
    isGroup: true,
    remoteJid: '120363@g.us',
    senderJid: '244945280380@s.whatsapp.net',
    senderNumber: '244945280380',
  };
  const r = await grupo.executarPedido(sock, {
    ctx, msg: {}, texto: 'me adiciona com ADM',
    pedido: { acao: 'promote', deSi: true },
  });
  ok('sem admin do bot: NÃO chama WhatsApp', updates.length === 0, JSON.stringify(updates));
  ok('sem admin do bot: não mente', r.ok === false && /não sou admin/i.test(r.msg), r.msg);
  ok('fica pendente', !!grupo.verPendente(ctx.remoteJid));

  const insiste = grupo.detectarPedidoGrupo('Podes sim o que passa', { temPendente: true });
  ok('insiste após recusa', insiste && insiste.acao === 'promote', JSON.stringify(insiste));

  // Agora o bot É admin → promove de verdade
  sock.groupMetadata = async () => ({
    participants: [
      { id: '244945280380@s.whatsapp.net', admin: null },
      { id: '244949926074@s.whatsapp.net', admin: 'admin' },
    ],
  });
  const r2 = await grupo.executarPedido(sock, {
    ctx, msg: {}, texto: 'agora adiciona',
    pedido: { acao: 'promote', deSi: true },
  });
  ok('com admin: chama promote', updates.length === 1 && updates[0].a === 'promote', JSON.stringify(updates));
  ok('com admin: diz que fez', r2.ok === true && /admin/i.test(r2.msg), r2.msg);
  ok('menciona o Dark', (r2.mencionar || []).some(j => j.includes('244945280380')));

  // Já era admin
  updates.length = 0;
  sock.groupMetadata = async () => ({
    participants: [
      { id: '244945280380@s.whatsapp.net', admin: 'admin' },
      { id: '244949926074@s.whatsapp.net', admin: 'admin' },
    ],
  });
  const r3 = await grupo.executarPedido(sock, {
    ctx, msg: {}, texto: 'quero ser ADM',
    pedido: { acao: 'promote', deSi: true },
  });
  ok('já era admin: não chama de novo', updates.length === 0);
  ok('já era admin: diz a verdade', r3.ok && /já/i.test(r3.msg), r3.msg);

  if (failed) { console.log('\nFALHOU:', failed); process.exit(1); }
  console.log('\nOK  —  0 falhas');
})().catch(e => { console.error(e); process.exit(1); });
