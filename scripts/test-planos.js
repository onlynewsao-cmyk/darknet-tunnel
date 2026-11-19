'use strict';
/** v7.50 — SUBMENU PLANOS: fluxo de monetização (planos/vip/alugar/trial/status + PREMIUM_*). */
process.env.OWNER_NUMBER = '244900000001';
process.env.OWNER_NAME = 'Dark Net';
const Module = require('module'); const orig = Module.prototype.require;
const USERS = new Map(); const GROUPS = new Map();
const w = (v) => { const p = Promise.resolve(v); p.lean = () => p; p.select = () => p; p.sort = () => p; p.limit = () => p; p.catch = () => p; return p; };
function applyUpdate(doc, u) {
  for (const [k, v] of Object.entries(u || {})) {
    if (k === '$inc') for (const [f, n] of Object.entries(v)) doc[f] = (doc[f] || 0) + n;
    else if (k.startsWith('$')) continue;
    else doc[k] = v;
  }
  return doc;
}
Module.prototype.require = function (id) {
  if (/models[\\/\\\\]User/.test(id)) return {
    findOne: (q) => w(USERS.get(q.whatsappNumber) || null),
    findOneAndUpdate: async (q, u) => { const d = applyUpdate(USERS.get(q.whatsappNumber) || { whatsappNumber: q.whatsappNumber }, u); USERS.set(q.whatsappNumber, d); return d; },
  };
  if (/models[\\/\\\\]GroupSettings/.test(id)) return {
    findOne: (q) => w(GROUPS.get(q.groupJid) || null),
    findOneAndUpdate: async (q, u) => { const d = applyUpdate(GROUPS.get(q.groupJid) || { groupJid: q.groupJid }, u); GROUPS.set(q.groupJid, d); return d; },
  };
  if (/models[\\/\\\\]/.test(id)) return { find: () => w([]), findOne: () => w(null), findOneAndUpdate: async () => null, countDocuments: async () => 0, create: async () => ({}), get: async (k, d) => d, set: async () => {} };
  if (String(id).endsWith('botConfigCache')) return { get: async (k, d) => d, set: async () => {} };
  return orig.apply(this, arguments);
};
const ch = require('../src/bot/caseHandler'); ch.loadCases();
const nc = require('../src/bot/nativeCommands');
const config = require('../src/config');
const G = '120363@g.us', FREE = '244911111111', OWNER = '244900000001', VIP = '244922222222';
USERS.set(VIP, { whatsappNumber: VIP, role: 'premium', premiumUntil: new Date(Date.now() + 10 * 86400000), vipGroupLimit: 3, vipGroupsAdded: 0, isPremium: () => true });
USERS.set('244933333333', { whatsappNumber: '244933333333', role: 'premium', premiumUntil: new Date(Date.now() - 86400000), isPremium: () => false });
function mkCtx(num, group) {
  const owner = num === OWNER;
  return { remoteJid: group ? G : num + '@s.whatsapp.net', isGroup: group, senderJid: num + '@s.whatsapp.net', senderNumber: num, pushName: owner ? 'Dono' : 'Zeca', isOwner: owner, prefix: '!', groupName: group ? 'Grupo Teste' : '', groupMeta: group ? { subject: 'Grupo Teste', participants: [] } : null };
}
async function run(cmd, num, group, args = [], relayFails = false) {
  const sent = [], relays = [];
  const ctx = mkCtx(num, group);
  const sock = {
    user: { id: '1:2@s.whatsapp.net' },
    sendMessage: async (j, c) => { sent.push(c); return { key: { id: 'x' } }; },
    groupMetadata: async () => ({ subject: 'Grupo Teste', participants: [] }),
    relayMessage: async (j, m) => { if (relayFails) throw new Error('relay down'); relays.push(m); },
  };
  const msg = { key: { id: 'm' }, pushName: ctx.pushName, message: { conversation: '!' + cmd } };
  await ch.runCase(cmd, { sock, msg, ctx, args, text: args.join(' '), prefix: '!', isOwner: ctx.isOwner, command: cmd, from: ctx.remoteJid, sender: ctx.senderJid, config });
  return { sent, relays, txt: sent.map(s => s.text || s.caption || '').join('\n') };
}
(async () => {
  let ok = 0, fail = 0;
  const C = (n, c, x = '') => { if (c) ok++; else fail++; console.log(c ? '  ✅' : '  ❌', n, c ? '' : String(x).slice(0, 200)); };
  // ── !planos ──
  let r = await run('planos', FREE, true);
  C('planos free/grupo: mostra FREE + Sem aluguel', /FREE/.test(r.txt + JSON.stringify(r.relays)) || r.relays.length > 0, r.txt.slice(0, 120));
  r = await run('planos', FREE, true, [], true);
  C('planos fallback texto (relay down)', /PLANOS/.test(r.txt) && /FREE/.test(r.txt) && /Sem aluguel/.test(r.txt), r.txt.slice(0, 150));
  C('planos cita comandos reais', ['vip', 'alugar', 'trial', 'statusalugar'].every(c => r.txt.includes(config.bot.prefix + c)) && [ch.CASES.has('vip'), ch.CASES.has('alugar'), ch.CASES.has('trial'), ch.CASES.has('statusalugar')].every(Boolean));
  r = await run('planos', OWNER, true, [], true);
  C('planos dono: DONO acesso total', /DONO/.test(r.txt), r.txt.slice(0, 100));
  r = await run('planos', VIP, true, [], true);
  C('planos vip: VIP activo', /VIP activo/.test(r.txt), r.txt.slice(0, 100));
  r = await run('planos', '244933333333', true, [], true);
  C('planos vip expirado: volta a FREE', /FREE/.test(r.txt) && !/VIP activo/.test(r.txt), r.txt.slice(0, 100));
  r = await run('planos', FREE, false, [], true);
  C('planos no PV: grupo N/A', /só em grupos/.test(r.txt), r.txt.slice(0, 100));
  // ── !trial ──
  r = await run('trial', FREE, false);
  C('trial no PV recusa', /Só em grupos/.test(r.txt), r.txt);
  r = await run('trial', FREE, true);
  const trialFirst = GROUPS.get(G);
  const trialMs = new Date(trialFirst?.trialExpiresAt || 0).getTime() - Date.now();
  C('trial activa uma única vez por 7 dias', /TRIAL ACTIVADO/.test(r.txt) && trialFirst?.trialUsedAt && trialMs > 6.9 * 86400000, r.txt.slice(0, 120));
  r = await run('trial', FREE, true);
  C('trial repetido activo não renova prazo', /activo/.test(r.txt), r.txt);
  r = await run('statusalugar', FREE, true);
  C('status mostra TRIAL ACTIVO', /TRIAL ACTIVO/.test(r.txt), r.txt.slice(0, 120));
  r = await run('planos', FREE, true, [], true);
  C('planos reflete trial', /Trial/.test(r.txt), r.txt.slice(0, 120));
  GROUPS.get(G).trialExpiresAt = new Date(Date.now() - 1000);
  r = await run('trial', FREE, true);
  C('trial expirado não pode ser renovado de graça', /já usou o trial/.test(r.txt) && GROUPS.get(G)?.trialUsedAt, r.txt.slice(0, 120));
  // ── !alugar ──
  r = await run('alugar', FREE, true);
  C('alugar sem args: carrossel ou fallback', r.relays.length > 0 || /ALUGUEL/.test(r.txt), r.txt.slice(0, 100));
  r = await run('alugar', FREE, true, [], true);
  C('alugar fallback lista planos', /TRIAL/.test(r.txt) && /MENSAL/.test(r.txt), r.txt.slice(0, 150));
  r = await run('alugar', FREE, true, ['30']);
  C('alugar 30 free: recusa (só VIP/dono)', /Só Dono, SubDonos ou VIP/.test(r.txt), r.txt.slice(0, 120));
  r = await run('alugar', VIP, true, ['30']);
  C('alugar 30 vip: ACTIVA', /ALUGUEL ACTIVADO/.test(r.txt) && /30 dias/.test(r.txt), r.txt.slice(0, 150));
  C('alugar gravou GroupSettings', GROUPS.get(G)?.isHosted === true && GROUPS.get(G)?.rentedBy === VIP, JSON.stringify({ h: GROUPS.get(G)?.isHosted, by: GROUPS.get(G)?.rentedBy }));
  r = await run('statusalugar', FREE, true);
  C('status mostra ALUGUEL ACTIVO + dias restantes', /ALUGUEL ACTIVO/.test(r.txt) && /30 dias restantes/.test(r.txt), r.txt.slice(0, 200));
  r = await run('alugar', VIP, true, ['+7']);
  C('alugar +7: soma (37 dias)', /37 dias/.test(r.txt), r.txt.slice(0, 150));
  r = await run('alugar', VIP, true, ['-3']);
  C('alugar -3 vip: recusado (só dono/sub)', /subtrair/.test(r.txt), r.txt.slice(0, 120));
  r = await run('alugar', OWNER, true, ['-3']);
  C('alugar -3 dono: subtrai', /Subtraídos/.test(r.txt), r.txt.slice(0, 150));
  r = await run('alugar', OWNER, true, ['=10']);
  C('alugar =10: define exacto', /Definido/.test(r.txt) && /10 dias/.test(r.txt), r.txt.slice(0, 150));
  r = await run('alugar', VIP, true, ['abc']);
  C('alugar abc: mostra planos (não crasha)', r.relays.length > 0 || /ALUGUEL/.test(r.txt), r.txt.slice(0, 100));
  GROUPS.set(G, { ...GROUPS.get(G), isHosted: true, hostedUntil: null, trialExpiresAt: new Date(0) });
  r = await run('statusalugar', FREE, true);
  C('aluguel permanente aparece activo sem data falsa', /ALUGUEL ACTIVO/.test(r.txt) && /permanente/.test(r.txt), r.txt.slice(0, 160));
  r = await run('alugar', VIP, true, ['+7']);
  C('VIP não converte aluguel permanente em prazo', /permanente/.test(r.txt) && GROUPS.get(G)?.hostedUntil === null, r.txt.slice(0, 160));
  // VIP sem grupo novo: limite
  USERS.set(VIP, { ...USERS.get(VIP), vipGroupsAdded: 3 });
  GROUPS.delete(G);
  r = await run('alugar', VIP, true, ['7']);
  C('vip no limite (3/3): recusa novo grupo', /Limite VIP/.test(r.txt), r.txt.slice(0, 120));
  // ── !vip / PREMIUM_* ──
  r = await run('vip', FREE, true);
  C('vip: carrossel ou fallback', r.relays.length > 0 || /PREMIUM/.test(r.txt), r.txt.slice(0, 100));
  r = await run('vip', FREE, true, [], true);
  C('vip fallback: 4 planos + contacto', /7 dias/.test(r.txt) && /30 dias/.test(r.txt) && /90 dias/.test(r.txt) && /wa.me/.test(r.txt), r.txt.slice(0, 200));
  // clique PREMIUM_30 (via commandHandler)
  const cmdH = require('../src/bot/commandHandler');
  const sent2 = [];
  const sock2 = {
    user: { id: '244900000002:1@s.whatsapp.net' },
    sendMessage: async (j, c) => { sent2.push(c); return { key: { id: 'x' } }; },
    relayMessage: async () => {},
    groupMetadata: async () => ({ subject: 'Grupo Teste', participants: [{ id: `${FREE}@s.whatsapp.net` }] }),
  };
  const msg2 = { key: { remoteJid: G, id: 'm2', fromMe: false, participant: `${FREE}@s.whatsapp.net` }, pushName: 'Zeca', message: { conversation: `PREMIUM_30_${FREE}` } };
  let threw = null;
  try { await cmdH.handle(sock2, msg2); } catch (e) { threw = e.message; }
  C('clique Contratar 30d: pedido registado', !threw && sent2.some(s => /Pedido registado.*30 dias/.test(s.text || '')), (threw || sent2.map(s => (s.text || '').slice(0, 80)).join('|')).slice(0, 200));
  // ── dono/perfil ──
  r = await run('dono', FREE, true);
  C('dono entrega contacto', r.relays.length > 0 || /wa.me|dono/i.test(r.txt), r.txt.slice(0, 100));
  console.log(`\n${fail ? '💥' : '🎉'} PLANOS: ${ok} OK / ${fail} FALHOU\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERR', e); process.exit(1); });
