'use strict';
/** Regression: !play uses the official native InteractiveMessage, keeps audio delivery and falls back to text. */
const assert = require('assert');
const Module = require('module');
const originalRequire = Module.prototype.require;
let audioFails = false;
let primaryReturnsDeadUrl = false;
let localFallbackCalls = 0;
let transportFails = false;
let audioTransportFails = false;
let headerImageUploads = 0;
const fakeAudio = Buffer.alloc(4096, 1);
const fakeMediaHandler = {
  isAudioBytes: () => true,
  fetchBuffer: async (url) => {
    if (url === 'https://expired.example/audio.mp3') throw new Error('URL expirada');
    return fakeAudio;
  },
};
const fromObject = (obj) => obj;
const fakeBaileys = {
  proto: { Message: { InteractiveMessage: {
    fromObject,
    Header: { fromObject },
    Body: { fromObject },
    Footer: { fromObject },
    NativeFlowMessage: { fromObject },
    CarouselCard: { fromObject },
  } } },
  generateWAMessageFromContent: (jid, message, options) => ({
    key: { id: 'native-card' }, message: { ...message, __options: options, __jid: jid },
  }),
  prepareWAMessageMedia: async (payload) => {
    if (payload?.image) headerImageUploads++;
    return { imageMessage: {} };
  },
};

const results = [
  { title: 'Faixa Um', author: 'Artista Um', duration: '3:21', views: 12345, youtube_url: 'https://youtu.be/AAAAAAAAAAA', thumbnail: 'https://img.example/one.jpg' },
  { title: 'Faixa Dois', author: 'Artista Dois', duration: '4:02', views: 23456, youtube_url: 'https://youtu.be/BBBBBBBBBBB' },
  { title: 'Faixa Três', author: 'Artista Três', duration: '5:43', views: 34567, youtube_url: 'https://youtu.be/CCCCCCCCCCC' },
];
const fakeYtdl = {
  getAudio: async (_url, quality) => {
    localFallbackCalls++;
    if (audioFails) throw new Error('mock local engine unavailable');
    return { buffer: fakeAudio, title: 'Faixa Um', mimetype: 'audio/mpeg', quality, source: 'Piped' };
  },
};
const fakeSystemZeroPlay = {
  ytsearch: async () => ({ resultados: results }),
  ytAudio: async (_url, quality) => {
    if (audioFails) throw new Error('mock provider unavailable');
    if (primaryReturnsDeadUrl) return { url: 'https://expired.example/audio.mp3', title: 'Faixa Um', mimetype: 'audio/mpeg', quality };
    return { buffer: fakeAudio, title: 'Faixa Um', mimetype: 'audio/mpeg', quality };
  },
  sendPlayCard: async () => { throw new Error('unexpected legacy card fallback'); },
  sendToxicPlayCard: async () => { throw new Error('!play3 must not use the DARK TOXIC card'); },
};

Module.prototype.require = function (id) {
  if (id === '../../config' || id === '../config') return { footer: 'DARK BOT', bot: { name: 'DARK BOT' } };
  if (id === '../systemZeroPlay') return fakeSystemZeroPlay;
  if (id === '../ytdl') return fakeYtdl;
  if (id === '../mediaHandler' || id === './mediaHandler') return fakeMediaHandler;
  if (id === 'baileys-v6') return fakeBaileys;
  return originalRequire.apply(this, arguments);
};

(async () => {
  const register = require('../src/bot/cases/downloads');
  const handlers = new Map();
  register((names, fn) => [].concat(names).forEach(name => handlers.set(name, fn)));
  const jid = 'test@s.whatsapp.net';
  const sent = [];
  const relays = [];
  const sock = {
    sendMessage: async (to, payload, opts) => {
      if (audioTransportFails && payload?.audio) throw new Error('mock audio upload rejected');
      sent.push({ to, payload, opts }); return { key: { id: 'mock' } };
    },
    relayMessage: async (to, message, opts) => {
      if (transportFails) throw new Error('mock relay unavailable');
      relays.push({ to, message, opts });
      return { key: { id: 'relay' } };
    },
  };
  const msg = { key: { id: 'm1', remoteJid: jid }, message: {} };
  const m = { chat: jid, key: msg.key, reply: async text => sent.push({ reply: text }) };
  const nativeCards = () => relays.map((relay) => {
    const interactive = relay.message?.viewOnceMessage?.message?.interactiveMessage
      || relay.message?.interactiveMessage;
    return {
      body: interactive?.body?.text || '',
      footer: interactive?.footer?.text || '',
      buttons: interactive?.nativeFlowMessage?.buttons || [],
      quoted: relay.message?.__options?.quoted,
      header: interactive?.header || {},
      to: relay.to,
    };
  });
  const button = (card, pattern) => card.buttons.find((b) => pattern.test(JSON.parse(b.buttonParamsJson || '{}').display_text || ''));
  const buttonId = (item) => JSON.parse(item?.buttonParamsJson || '{}').id;
  async function run(command) {
    sent.length = 0;
    relays.length = 0;
    headerImageUploads = 0;
    await handlers.get(command)({ sock, m, msg, ctx: { remoteJid: jid }, text: 'faixa de teste', prefix: '!', command });
    return { sent: [...sent], cards: nativeCards(), headerImageUploads };
  }

  let r = await run('play');
  assert.strictEqual(r.cards.length, 1, '!play sends one official native card');
  let card = r.cards[0];
  assert.ok(card.body.includes('Faixa Um'), '!play keeps the first search result');
  assert.ok(card.body.length <= 190, 'native card body stays compact');
  for (const detail of ['Artista Um', '3:21', '12.345']) assert.ok(card.body.includes(detail), `card includes ${detail}`);
  assert.ok(card.body.includes('Áudio automático (128k)'), 'card says audio is automatic');
  assert.ok(!/toxic|ataque/i.test(card.body), '!play stays simple, not DARK TOXIC');
  assert.strictEqual(card.buttons.length, 1, '!play mantém apenas o botão de vídeo');
  assert.ok(!/Repetir áudio/i.test(card.body), '!play não mostra repetir áudio');
  assert.ok(buttonId(button(card, /Vídeo/)).includes('!gyt https://youtu.be/AAAAAAAAAAA | mp4 | 480 | 3:21'));
  assert.ok(r.headerImageUploads > 0 && card.header?.imageMessage, '!play anexa thumbnail no card');
  assert.strictEqual(card.quoted, null, '!play card is not a reply to the command');
  assert.ok(r.sent.some(x => x.payload?.audio?.equals(fakeAudio) && x.payload.mimetype === 'audio/mpeg' && x.payload.ptt === false && x.opts?.quoted === msg),
    '!play audio is the only successful output replying to the command');

  r = await run('play2');
  assert.strictEqual(r.cards.length, 1, '!play2 sends one native card');
  card = r.cards[0];
  assert.ok(card.body.includes('Faixa Dois') && card.body.includes('Resultado #2'), '!play2 remains the second search result');
  assert.strictEqual(card.buttons.length, 2, '!play2 keeps audio and video buttons');
  assert.strictEqual(card.quoted, msg, '!play2 keeps its usual quoted card');
  assert.ok(buttonId(button(card, /Áudio/)).endsWith('| 192k'), '!play2 keeps medium-quality audio');
  assert.ok(buttonId(button(card, /Vídeo/)).includes('| mp4 | 720 | 4:02'), '!play2 keeps medium-quality video');
  assert.ok(!r.sent.some(x => x.payload?.audio), '!play2 does not auto-send audio');

  r = await run('play3');
  assert.strictEqual(r.cards.length, 1, '!play3 sends one native card');
  card = r.cards[0];
  assert.ok(card.body.includes('Faixa Três') && card.body.includes('Resultado #3'), '!play3 remains the third result');
  assert.ok(card.body.includes('Áudio automático (320k)') && card.body.includes('1080p'), 'play3 uses high-quality values');
  assert.strictEqual(card.buttons.length, 1, 'play3 também não tem repetir áudio');
  assert.ok(buttonId(button(card, /Vídeo/)).includes('| mp4 | 1080 | 5:43'), 'play3 retains high-quality video');
  assert.ok(r.sent.some(x => x.payload?.audio?.equals(fakeAudio) && x.opts?.quoted === msg), 'play3 audio remains a quoted reply');

  // If native relay is unavailable, the official helper itself falls back to clear text commands.
  transportFails = true;
  r = await run('play');
  const fallbackMessage = r.sent.find(x => x.payload?.text);
  const fallback = fallbackMessage?.payload.text || '';
  assert.strictEqual(r.cards.length, 0, 'no fake native delivery is claimed after transport failure');
  assert.ok(fallback.includes('!gyt https://youtu.be/AAAAAAAAAAA | mp4 | 480 | 3:21'), 'text fallback retains the video command');
  assert.ok(!fallback.includes('!ytd https://youtu.be/AAAAAAAAAAA | 128k'), 'text fallback também não oferece repetir áudio');
  assert.strictEqual(fallbackMessage?.opts?.quoted, null, 'fallback card is not a reply to the command');
  assert.ok(r.sent.some(x => x.payload?.audio?.equals(fakeAudio) && x.opts?.quoted === msg), 'audio still sends as the quoted reply after UI fallback');
  transportFails = false;

  primaryReturnsDeadUrl = true;
  localFallbackCalls = 0;
  r = await run('play');
  assert.strictEqual(localFallbackCalls, 1, '!play retries with local engine after a dead provider URL');
  assert.ok(r.sent.some(x => x.payload?.audio?.equals(fakeAudio) && x.opts?.quoted === msg), '!play delivers local audio after URL expiry');
  primaryReturnsDeadUrl = false;
  // Caso WhatsApp recuse o player de áudio, o mesmo MP3 chega como ficheiro.
  audioTransportFails = true;
  r = await run('play');
  assert.ok(r.sent.some(x => x.payload?.document?.equals(fakeAudio) && /garantir a entrega/.test(x.payload?.caption || '')),
    'rejeição do player envia o MP3 como ficheiro');
  audioTransportFails = false;
  audioFails = true;
  r = await run('play');
  assert.strictEqual(r.cards.length, 1, 'video card survives audio-provider failure');
  assert.ok(!r.sent.some(x => x.payload?.audio), 'no fake audio is sent after provider failure');
  assert.ok(r.sent.some(x => /não consegui entregar o áudio/i.test(x.reply || '')), 'audio failure is reported honestly');
  assert.ok(r.sent.some(x => x.payload?.react?.text === '⚠️'), 'failure uses a warning reaction, not success');

  console.log('PLAY FLOW: official native card, audio delivery and text fallback passed.');
})().catch(error => {
  console.error('PLAY FLOW: FAIL:', error.stack || error.message);
  process.exitCode = 1;
}).finally(() => {
  Module.prototype.require = originalRequire;
});
