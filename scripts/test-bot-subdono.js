/**
 * test-bot-subdono.js — v7.27
 * O número do próprio bot é SUBDONO:
 *   1. mensagens `fromMe` com prefixo entram no pipeline (messageRouter);
 *   2. mensagens `fromMe` SEM prefixo (respostas do bot) continuam ignoradas → sem loop;
 *   3. roleResolver dá isOwner=true ao número do bot, mas NÃO isPrimaryOwner;
 *   4. whatsapp.js liga emitOwnEvents.
 */
'use strict';
process.env.OWNER_NUMBER = process.env.OWNER_NUMBER || '244900000001';
process.env.BOT_NUMBER = process.env.BOT_NUMBER || '244900000002';
process.env.BOT_PREFIX = process.env.BOT_PREFIX || '!';

const fs = require('fs');
const path = require('path');
let ok = 0, fail = 0;
const check = (l, c, e = '') => { if (c) { ok++; console.log(`  ✅ ${l}`); } else { fail++; console.log(`  ❌ ${l} ${e}`); } };

(async () => {
  const BOT = '244900000002';
  const botJid = BOT + '@s.whatsapp.net';
  const mkMsg = (texto, fromMe, grupo = null) => ({
    key: { id: Math.random().toString(16).slice(2).toUpperCase(), remoteJid: grupo || botJid, fromMe, ...(grupo ? { participant: botJid } : {}) },
    pushName: 'DARK BOT', messageTimestamp: Date.now() / 1000 | 0, message: { conversation: texto },
  });

  console.log('\n══════ 1) messageRouter — fromMe ══════');
  // intercepta o commandHandler para ver se é chamado
  const ch = require('../src/bot/commandHandler');
  const chamadas = [];
  const origHandle = ch.handle;
  ch.handle = async (sock, msg) => { chamadas.push(ch.extractText(msg)); return true; };
  // neutraliza anti-link/anti-spam/listener
  for (const m of ['../src/bot/antiLink', '../src/bot/antiSpam']) { const x = require(m); x.check = async () => false; }
  require('../src/bot/messageListener').onUpsert = async () => {};
  const pe = require('../src/bot/prefixEngine');
  pe.getAllActivePrefixes = async () => ['!', '.'];
  delete require.cache[require.resolve('../src/bot/messageRouter')];
  const router = require('../src/bot/messageRouter');
  const bot = { sock: { user: { id: BOT + ':1@s.whatsapp.net' } }, io: null };

  await router.process(bot, { messages: [mkMsg('!menu', true)] });
  check('fromMe "!menu" → entra no handler', chamadas.includes('!menu'));
  await router.process(bot, { messages: [mkMsg('.play imagine dragons', true, '120363000000@g.us')] });
  check('fromMe ".play …" em grupo → entra no handler', chamadas.some(t => t.startsWith('.play')));
  const antes = chamadas.length;
  await router.process(bot, { messages: [
    mkMsg('╔══ resposta do bot ══╗\n!menu está aqui', true),
    mkMsg('Olá! eu sou a AURA 🖤', true),
    mkMsg('!!!', true), mkMsg('...', true), mkMsg('', true),
  ] });
  check('fromMe sem prefixo / só pontuação → IGNORADO (sem loop)', chamadas.length === antes, `entraram ${chamadas.length - antes}`);
  await router.process(bot, { messages: [mkMsg('!ping', false)] });
  check('mensagem normal (não fromMe) continua a passar', chamadas.includes('!ping'));
  check('inbox marca origem bot·self', (bot.recentInbox || []).some(e => e.de === 'bot·self'));
  ch.handle = origHandle;

  console.log('\n══════ 2) roleResolver — número do bot ══════');
  const rr = require('../src/bot/roleResolver');
  const sock = { user: { id: BOT + ':7@s.whatsapp.net', lid: '111222333@lid' } };
  const r1 = await rr.resolveRole({ ctx: { senderNumber: BOT, senderJid: botJid, isGroup: false }, sock, user: null });
  check('número do bot → isOwner (subdono)', r1.isOwner === true, JSON.stringify(r1.role));
  const r2 = await rr.resolveRole({ ctx: { senderNumber: '244911111111', senderJid: '244911111111@s.whatsapp.net' }, msg: { key: { fromMe: true } }, sock, user: null });
  check('msg fromMe → isOwner (subdono)', r2.isOwner === true);
  const r3 = await rr.resolveRole({ ctx: { senderNumber: '244922222222', senderJid: '244922222222@s.whatsapp.net' }, sock, user: null });
  check('número qualquer → NÃO é dono', r3.isOwner === false);

  console.log('\n══════ 3) commandHandler — flags ══════');
  const src = fs.readFileSync(path.join(__dirname, '../src/bot/commandHandler.js'), 'utf8');
  check('isBotSelf considera fromMe, sock.user.id, BOT_NUMBER e LID', /isBotSelf\s*=\s*!!msg\.key\?\.fromMe[\s\S]{0,400}botSelfLid/.test(src));
  check('isOwner inclui isBotSelf', /isOwner = [\s\S]{0,400}\|\|\s*isBotSelf;/.test(src));
  check('isPrimaryOwner NÃO inclui o bot (só OWNER_NUMBER/dashboard)', /ctx\.isPrimaryOwner = ctx\.senderNumber === envOwnerNum \|\| \(dbOwnerNum && ctx\.senderNumber === dbOwnerNum\);/.test(src));
  check('ctx.isSubOwner exposto', /ctx\.isSubOwner\s*=/.test(src));

  console.log('\n══════ 4) whatsapp.js / aura ══════');
  const wa = fs.readFileSync(path.join(__dirname, '../src/bot/whatsapp.js'), 'utf8');
  check('emitOwnEvents: true', /emitOwnEvents:\s*true/.test(wa));
  const uc = fs.readFileSync(path.join(__dirname, '../src/aura/context/userContext.js'), 'utf8');
  check('userContext sem números hardcoded', !/\['244\d+'/.test(uc) && /config\.bot\.number/.test(uc));
  const ucm = require('../src/aura/context/userContext');
  check('userContext: BOT_NUMBER é subdono', ucm.SUBOWNER_NUMBERS.includes(BOT));

  console.log(`\n══════════════════════════════════════════\n🤖 BOT SUBDONO: ${ok} OK / ${fail} FALHOU\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
