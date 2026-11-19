'use strict';
// Sem WhatsApp ou DB reais: exercita detecção e efeitos do handler nativo.
const assert = require('assert/strict');
const Module = require('module');
const orig = Module.prototype.require;
let gs, globalOn = false, stats = [], premiumUser = null;
Module.prototype.require = function (id) {
  if (id === '../config') return { owner: { number: '244900000001' } };
  if (id.endsWith('models/GroupSettings')) return { updateOne: async (...args) => { stats.push(args); } };
  if (id === './hotCache') return { getGroupSettings: async () => gs, getUser: async () => premiumUser };
  if (id === './botConfigCache') return { get: async () => globalOn };
  if (id === './prefixEngine') return { detect: async t => t.startsWith('!') ? { command: 'play' } : null };
  if (id === './liveBroadcaster') return { antilinkAction: () => {} };
  return orig.apply(this, arguments);
};
const al = require('../src/bot/antiLink');
const lp = require('../src/bot/linkPolicy');
let n = 0;
function ok(name, cond) { assert.ok(cond, name); console.log('  ✅', name); n++; }
const OWNER = '244900000001', USER = '244900000003', BOT = '244900000002';
let seq = 0;
function fixture(overrides = {}) {
  gs = { antilink: true, antilinkMode: 'all_links', antilinkAction: 'warn', antilinkMaxWarns: 2, antilinkWhitelist: [], trialExpiresAt: new Date(Date.now() + 60_000), ...overrides };
  stats = []; globalOn = false; premiumUser = null;
  const jid = `group-${++seq}@g.us`, sent = [], kicks = [];
  const sock = {
    user: { id: BOT + ':1@s.whatsapp.net' },
    sendMessage: async (j, c) => { sent.push(c); return { key: { id: 'sent' } }; },
    groupMetadata: async () => ({ participants: [{ id: BOT + '@s.whatsapp.net', admin: 'admin' }, { id: USER + '@s.whatsapp.net' }] }),
    groupParticipantsUpdate: async (...args) => { kicks.push(args); return [{ jid: USER + '@s.whatsapp.net', status: '200' }]; },
  };
  const msg = (text, extra = {}) => ({ key: { id: `msg-${++seq}`, remoteJid: jid, participant: USER + '@s.whatsapp.net', ...extra }, message: { conversation: text } });
  return { sock, sent, kicks, msg, jid };
}
(async () => {
  for (const domain of lp.DEFAULT_ALLOWED) {
    for (const mode of ['smart', 'whatsapp_only', 'all_links']) {
      ok(`${domain} permitido em ${mode}`, !al.detectLink('https://' + domain + '/conteudo', mode).hit);
    }
  }
  for (const t of ['https://www.youtube.com/watch?v=abc', 'https://m.facebook.com/post/1', 'vm.tiktok.com/abc', 'https://open.spotify.com/track/1', 'https://www.instagram.com/reel/1/', 'youtube [.] com/watch?v=1', 'hxxps://youtu.be/abc', 'HTTPS://YOUTUBE.COM/watch?v=x', 'https://youtube.com./watch?v=x']) {
    ok('alias/subdomínio/ofuscação permitido: ' + t, !al.detectLink(t, 'all_links', true).hit);
  }
  for (const t of [
    'https://youtube.com.evil.org/path', 'https://notyoutube.com', 'https://youtube.com@evil.org/a',
    'https://evil.org/?next=https://youtube.com/watch?v=1', 'https://evil.org/youtube.com',
    'https://youtu.be/a https://chat.whatsapp.com/ABCDEF123',
    'https://instagram.com/p/a https://evil.org',
    'https://youtube.com/a,https://evil.org',
    '[youtube.com](https://evil.org)', 'https://evil.org#youtube.com',
  ]) ok('não confunde disfarce/mensagem mista: ' + t, al.detectLink(t, 'all_links').hit);
  ok('whitelist extra respeitada', !al.detectLink('https://docs.example.org/a', 'all_links', true, ['example.org']).hit);
  ok('whitelist não aceita domínio parecido', al.detectLink('https://example.org.evil.org', 'all_links', true, ['example.org']).hit);
  ok('whitelist não isenta mensagem mista', al.detectLink('https://example.org/a https://evil.org', 'all_links', true, ['example.org']).hit);
  ok('isWhitelisted exige todos os URLs', !al.isWhitelisted('https://youtube.com/a https://evil.org', ['youtube.com']));
  ok('isWhitelisted exige host real, não substring', !al.isWhitelisted('https://evil.org/?youtube.com', ['youtube.com']));
  ok('isWhitelisted aceita subdomínio exacto', al.isWhitelisted('https://www.youtube.com/a', ['youtube.com']));
  ok('sem URL não cria autorização', !al.isWhitelisted('fala comigo', ['youtube.com']));
  ok('modo WA não se torna bloqueio de tudo', !al.detectLink('https://example.org/a', 'whatsapp_only').hit);
  let f = fixture();
  await al.check(f.sock, f.msg('https://youtu.be/abc'));
  ok('permitido não apaga, não avisa e não remove', f.sent.length === 0 && f.kicks.length === 0 && stats.length === 0);
  await al.check(f.sock, f.msg('https://evil.org'));
  const warning = f.sent.find(c => c.text)?.text || '';
  ok('permitido não consumiu aviso: próximo bloqueado é 1/2', warning.includes('aviso 1/2') && f.kicks.length === 0);
  ok('mensagem própria DARK BOT', warning.includes('🛡️') && warning.includes('fora da lista') && !warning.includes('ANTI-LINK-EASY'));
  ok('aviso lista plataformas e confirma apagamento', warning.includes('apagada') && warning.includes('spotify') && warning.includes('threads'));
  ok('aviso não repete URL proibido', !warning.includes('evil.org'));
  await al.check(f.sock, f.msg('https://evil.org/again'));
  ok('limite de avisos remove segundo infractor conforme configuração', f.kicks.length === 1 && f.sent.some(c => c.text?.includes('removido — a regra')));
  f = fixture();
  await al.check(f.sock, f.msg('https://youtube.com/a https://evil.org'));
  ok('mista é moderada e explica lista', f.sent.some(c => c.delete) && f.sent.some(c => c.text?.includes('aceites:')));
  f = fixture({ antilinkWhitelist: ['example.org'] });
  await al.check(f.sock, f.msg('https://docs.example.org/a'));
  ok('whitelist adicional funciona no handler real', f.sent.length === 0);
  f = fixture({ antilinkAction: 'delete' });
  await al.check(f.sock, f.msg('https://evil.org'));
  ok('delete silencioso preservado', f.sent.length === 1 && !!f.sent[0].delete);
  f = fixture({ antilinkNotify: false });
  await al.check(f.sock, f.msg('https://evil.org'));
  ok('notify off respeitado', !f.sent.some(c => c.text));
  f = fixture({ antilinkDeleteMsg: false });
  await al.check(f.sock, f.msg('https://evil.org'));
  ok('não afirma apagar quando delete está off', !f.sent.some(c => c.delete) && f.sent.some(c => c.text?.includes('remoção desligada')));
  f = fixture();
  const send = f.sock.sendMessage;
  f.sock.sendMessage = async (j, c) => { if (c.delete) throw Error('delete rejected'); return send(j, c); };
  await al.check(f.sock, f.msg('https://evil.org'));
  ok('falha ao apagar não é anunciada como sucesso', f.sent.some(c => c.text?.includes('não consegui apagar')) && !f.sent.some(c => c.text?.includes('🗑️ apagada')));
  f = fixture({ antilinkAction: 'kick' });
  f.sock.groupParticipantsUpdate = async () => [{ status: '403' }];
  await al.check(f.sock, f.msg('https://evil.org'));
  ok('status 403 no kick não é anunciado como remoção', f.sent.some(c => c.text?.includes('não consegui remover')) && !f.sent.some(c => c.text?.includes('removido — a regra')));
  f = fixture();
  await al.check(f.sock, f.msg('https://evil.org', { fromMe: true }));
  await al.check(f.sock, f.msg('https://evil.org', { participant: OWNER + '@s.whatsapp.net' }));
  await al.check(f.sock, f.msg('!play https://evil.org'));
  ok('imunidade do bot/dono/comando preservada', f.sent.length === 0);
  f = fixture({ antilinkVipImmune: true });
  premiumUser = { role: 'premium', premiumUntil: new Date(Date.now() - 60_000) };
  await al.check(f.sock, f.msg('https://evil.org'));
  ok('VIP expirado não recebe imunidade anti-link', f.sent.some(c => c.delete));
  f = fixture({ antilinkVipImmune: true });
  premiumUser = { role: 'premium', premiumUntil: new Date(Date.now() + 60_000) };
  await al.check(f.sock, f.msg('https://evil.org'));
  ok('VIP activo recebe imunidade anti-link quando configurada', f.sent.length === 0);
  f = fixture(); f.sock.groupMetadata = async () => ({ participants: [{ id: BOT + '@s.whatsapp.net' }, { id: USER + '@s.whatsapp.net' }] });
  await al.check(f.sock, f.msg('https://evil.org'));
  ok('bot sem admin não apaga nem avisa remoção', f.sent.length === 0);
  f = fixture({ antilink: false, antilinkOptOut: true }); globalOn = true;
  await al.check(f.sock, f.msg('https://evil.org'));
  ok('desligar no grupo respeita opt-out', f.sent.length === 0);
  console.log(`\nANTI-LINK PERMITIDOS: ${n} OK / 0 falhas`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
