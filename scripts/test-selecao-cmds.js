'use strict';
// v7.29: audita todos os comandos 'sel' (clicáveis nos submenus) — cada um deve produzir efeito real sem argumentos
process.env.OWNER_NUMBER='244900000001';
const Module = require('module'); const orig = Module.prototype.require;
const store = new Map();
const w = (v) => { const p = Promise.resolve(v); p.lean = () => p; p.select = () => p; p.sort = () => p; p.limit = () => p; p.catch = () => p; return p; };
const fakeDoc = () => { const d = store.get('gs') || { groupJid:'g', save: async function(){ store.set('gs', this); }, antilinkWhitelist: [] }; store.set('gs', d); return d; };
Module.prototype.require = function (id) {
  if (/models[\/\\]GroupSettings/.test(id)) return { findOne: () => w(fakeDoc()), findOneAndUpdate: async (q, u) => { const d = fakeDoc(); const set = u.$set || u; for (const [k,v] of Object.entries(set)) if (!k.startsWith('$')) d[k]=v; return d; }, updateOne: async (q,u)=>{ const d=fakeDoc(); Object.assign(d, u.$set||u); }, create: async () => fakeDoc() };
  if (/models[\/\\]/.test(id)) return { find: () => w([]), findOne: () => w(null), findOneAndUpdate: async () => null, countDocuments: async () => 0, create: async () => ({}), updateOne: async () => ({}), deleteMany: async () => ({}), deleteOne: async () => ({}), getOrCreate: async () => ({ save: async()=>{}, hp: 100, maxHp: 100, coins: 0, inventory: [] }), get: async (k, d) => d, set: async()=>{} };
  if (id.endsWith('botConfigCache')) return { get: async (k, d) => d, set: async () => {}, clear: () => {}, refresh: async () => {} };
  return orig.apply(this, arguments);
};
const R = (p) => require('/home/user/dark-bot/src/bot/' + p);
const sd = R('submenuData'); const ch = R('caseHandler'); ch.loadCases();
const nc = R('nativeCommands');
const pkg = { ...R('packages/interactions'), ...R('packages/family'), ...R('packages/economy'), ...R('packages/games'), ...R('packages/cheats') };
const all = [...new Set([...ch.CASES.keys(), ...Object.keys(nc), ...Object.keys(pkg)])];
const subs = sd.getAllSubmenus(all);
(async () => {
  const usoOnly = [];
  for (const [c, data] of Object.entries(subs)) for (const it of data.items.filter(i => i.sel)) {
    const sent = [];
    const sock = { user: { id: '244900000002:1@s.whatsapp.net' }, sendMessage: async (j, content) => { sent.push(content.text || content.caption || JSON.stringify(content).slice(0,80)); return { key:{id:'x'} }; }, groupMetadata: async () => ({ subject:'G', participants: [{ id: '244900000001@s.whatsapp.net', admin: 'superadmin' }] }), relayMessage: async () => {} };
    const msg = { key: { remoteJid: '120363@g.us', participant: '244900000001@s.whatsapp.net', id: 'M' }, pushName: 'Dono', message: { conversation: '!' + it.cmd } };
    const ctx = { remoteJid: '120363@g.us', isGroup: true, senderJid: '244900000001@s.whatsapp.net', senderNumber: '244900000001', pushName: 'Dono', isOwner: true, isPrimaryOwner: true, isAdmin: true, prefix: '!', sock, groupMeta: { participants: [{ id: '244900000001@s.whatsapp.net', admin: 'superadmin' }] } };
    const reply = (t) => sock.sendMessage(ctx.remoteJid, { text: t });
    try {
      const ran = await Promise.race([ch.runCase(it.cmd, { sock, msg, ctx, args: [], text: '', q: '', prefix: '!', isOwner: true, reply, command: it.cmd, from: ctx.remoteJid, sender: ctx.senderJid }), new Promise(r => setTimeout(() => r('timeout'), 4000))]);
      if (!ran && (nc[it.cmd] || pkg[it.cmd])) await Promise.race([(nc[it.cmd] || pkg[it.cmd])({ sock, msg, ctx, args: [], isOwner: true, fillVars: (t)=>t, config: { bot: { prefix: '!', name: 'DARK BOT' }, owner:{} } }), new Promise(r => setTimeout(r, 4000))]);
    } catch (e) { sent.push('ERR ' + e.message); }
    const out = sent.join(' | ');
    const flag = (/uso:|use\s*!|on\|off/i.test(out) && !/🟢|🔴|ACTIV|DESATIV/i.test(out)) ? '⚠️ SÓ USO' : (sent.length ? '✅' : '❓ nada');
    if (flag !== '✅') usoOnly.push(`${c}:${it.cmd}`);
    console.log(flag.padEnd(9), `${c}:${it.cmd}`.padEnd(24), out.replace(/\n/g, ' ').slice(0, 90));
  }
  console.log('\nSEL sem efeito real ao clicar:', usoOnly.length, '\n', usoOnly.join(' '));
  process.exit(usoOnly.length ? 1 : 0);
})();
