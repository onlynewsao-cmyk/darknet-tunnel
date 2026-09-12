#!/usr/bin/env node
/**
 * Testa o addcase com o case 'pin' real (systemZR + axios + album + if/try aninhados).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const {
  detectFormat,
  extractCaseCode,
  validateCase,
  compileCase,
  FORMAT,
} = require('../src/bot/caseHandler');

const fixture = fs.readFileSync(
  path.join(__dirname, 'fixtures/case-pin-systemzone.js'),
  'utf8'
);

let failed = 0;
function ok(name, cond, extra) {
  if (cond) console.log('  ✅', name);
  else {
    failed++;
    console.log('  ❌', name, extra || '');
  }
}

console.log('\n═══ 1. EXTRACTOR (o bug do }) ═══');

const oldBroken = (() => {
  let code = fixture.trim();
  code = code.replace(/^case\s+['"`][^'"`]+['"`]\s*:\s*\{?\s*/i, '');
  code = code.replace(/\bbreak\s*;?\s*$/i, '');
  code = code.replace(/^}\s*$/m, '');
  return code.trim();
})();

const extracted = extractCaseCode(fixture);
ok('detecta switch_case', detectFormat(fixture) === FORMAT.SWITCH_CASE, detectFormat(fixture));
ok('extractor NÃO come o } do if', extracted.includes("tipo = 'video'") && extracted.includes('catch (e)'));
ok('extractor tira case/break', !/^case\s/.test(extracted) && !/break\s*;?\s*$/.test(extracted));
ok('extractor devolve corpo utilizável', extracted.length > 500 && extracted.includes('albumMessage'));

try {
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  // eslint-disable-next-line no-new
  new AsyncFunction(extracted);
  ok('corpo extraído é JS válido', true);
} catch (e) {
  ok('corpo extraído é JS válido', false, e.message);
}

console.log('\n═══ 2. HTML ENTITIES (cola da web) ═══');
const htmlish = fixture
  .replace(/=>/g, '=&gt;')
  .replace(/<termo>/g, '&lt;termo&gt;');
const decoded = extractCaseCode(htmlish);
ok('decodifica =>', decoded.includes('p => p.trim()'), decoded.slice(0, 120));
ok('decodifica <termo>', decoded.includes('<termo>'));

console.log('\n═══ 3. COMPILAÇÃO addcase ═══');
const vFull = validateCase(fixture, 'pin');
ok('compila o case INTEIRO (com case/break)', vFull.valid, (vFull.errors || []).join(' | '));
const vBody = validateCase(extracted, 'pin');
ok('compila o corpo extraído', vBody.valid, (vBody.errors || []).join(' | '));

const fences = '```js\n' + fixture + '\n```';
ok('compila com ``` fences', validateCase(fences, 'pin').valid);

console.log('\n═══ 4. EXECUÇÃO do case (API real + fallback) ═══');

async function runLive() {
  const sent = [];
  const sock = {
    sendMessage: async (jid, content, opts) => {
      sent.push({ jid, content, opts });
      return { key: { id: 'fake' } };
    },
  };
  const replies = [];
  const msg = {
    key: { id: 'm1', remoteJid: '120363@g.us', fromMe: false },
    message: { conversation: '@pin Messi|vídeo' },
  };
  const ctx = {
    remoteJid: '120363@g.us',
    senderJid: '244945280380@s.whatsapp.net',
    senderNumber: '244945280380',
    isGroup: true,
    isOwner: true,
    pushName: 'Dark',
  };
  const m = {
    key: msg.key,
    chat: ctx.remoteJid,
    reply: async (t) => { replies.push(String(t)); return sock.sendMessage(ctx.remoteJid, { text: t }); },
    react: async () => {},
  };

  const fn = compileCase(fixture, 'pin');
  ok('compileCase devolve função', typeof fn === 'function');

  await fn({
    m, sock, msg, ctx,
    text: 'Messi|vídeo',
    args: ['Messi|vídeo'],
    prefix: '@',
    command: 'pin',
    isOwner: true,
    config: {},
    reply: (t) => m.reply(t),
    react: () => {},
    q: 'Messi|vídeo',
    from: ctx.remoteJid,
    info: msg,
    quoted: null,
  });

  const album = sent.find((x) => Array.isArray(x.content && x.content.albumMessage));
  const errTxt = replies.find((t) => /Erro ao buscar no Pinterest/i.test(t));
  const noneTxt = replies.find((t) => /Nenhum resultado/i.test(t));
  const helpTxt = replies.find((t) => /Use:/i.test(t));

  if (album) {
    const items = album.content.albumMessage;
    const vids = items.filter((i) => i.video);
    const imgs = items.filter((i) => i.image);
    ok('mandou albumMessage', items.length > 0, 'n=' + items.length);
    console.log('    álbum:', items.length, 'itens ·', vids.length, 'vídeo(s) ·', imgs.length, 'imagem(ns)');
    if (items[0]) {
      const u = (items[0].video && items[0].video.url) || (items[0].image && items[0].image.url);
      console.log('    1º url:', String(u || '').slice(0, 90));
    }
    ok('há pelo menos 1 vídeo OU imagem', vids.length + imgs.length > 0);
  } else if (errTxt) {
    ok('case correu sem 502 (fallback)', false, errTxt.slice(0, 180));
  } else if (noneTxt) {
    ok('API+fallback sem resultados (rede)', false, noneTxt);
  } else {
    ok('case enviou mídia ou erro claro', false, JSON.stringify({ replies, kinds: sent.map((x) => Object.keys(x.content || {})) }));
  }

  // help sem texto
  const sent2 = [];
  const sock2 = { sendMessage: async (j, c) => { sent2.push(c); return {}; } };
  const replies2 = [];
  const m2 = {
    key: msg.key, chat: ctx.remoteJid,
    reply: async (t) => { replies2.push(String(t)); },
  };
  await fn({
    m: m2, sock: sock2, msg, ctx, text: '', args: [], prefix: '@',
    command: 'pin', isOwner: true, config: {},
    reply: (t) => m2.reply(t), react: () => {}, q: '', from: ctx.remoteJid, info: msg, quoted: null,
  });
  const menu = replies2.join('\n');
  ok('sem termo mostra o menu', /termo/i.test(menu) || /Use/i.test(menu), menu.slice(0, 120));
}

runLive().then(() => {
  console.log('\n' + '═'.repeat(50));
  if (failed) {
    console.log('FALHOU:', failed);
    process.exit(1);
  }
  console.log('OK — addcase integra o case pin');
  process.exit(0);
}).catch((e) => {
  console.error('CRASH', e);
  process.exit(1);
});
