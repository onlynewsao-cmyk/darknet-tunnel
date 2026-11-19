'use strict';
/**
 * Opt-in network smoke test for real media bytes flowing through download handlers.
 * Providers and WhatsApp transport are deliberately mocked; see final output.
 */
const assert = require('assert');
const Module = require('module');
const originalRequire = Module.prototype.require;
const samples = {};
const relays = [];
const fromObject = (obj) => obj;
const fakeBaileys = {
  downloadMediaMessage: async () => Buffer.alloc(0),
  proto: { Message: { InteractiveMessage: {
    fromObject, Header: { fromObject }, Body: { fromObject }, Footer: { fromObject },
    NativeFlowMessage: { fromObject }, CarouselCard: { fromObject },
  } } },
  generateWAMessageFromContent: (jid, message, options) => ({
    key: { id: 'native-card' }, message: { ...message, __jid: jid, __options: options },
  }),
  prepareWAMessageMedia: async () => ({ imageMessage: {} }),
};

const searchResult = {
  title: 'CC0 smoke media', author: 'MDN', duration: '0:05', views: 1,
  youtube_url: 'https://youtu.be/AAAAAAAAAAA',
};
const fakeSystemZeroPlay = {
  ytsearch: async () => ({ resultados: [searchResult] }),
  ytAudio: async () => ({ buffer: samples.mp3, title: searchResult.title, mimetype: 'audio/mpeg' }),
  sendPlayCard: async () => { throw new Error('unexpected legacy card fallback'); },
  sendToxicPlayCard: async () => { throw new Error('unexpected toxic card'); },
};
const fakeYtdl = {
  getAudio: async () => ({ buffer: samples.mp3, title: searchResult.title, mimetype: 'audio/mpeg' }),
  getVideo: async () => ({
    buffer: samples.mp4, title: searchResult.title, mimetype: 'video/mp4',
    duration: '0:05', quality: 'smoke',
  }),
};
const fakeSocialProviders = {
  tiktok: async () => ({ video: true, buffer: samples.mp4, title: searchResult.title, mimetype: 'video/mp4' }),
  instagram: async () => ({ type: 'video', buffer: samples.mp4, title: searchResult.title, mimetype: 'video/mp4' }),
  facebook: async () => ({ buffer: samples.mp4, title: searchResult.title, mimetype: 'video/mp4' }),
  twitter: async () => ({ buffer: samples.mp4, title: searchResult.title, mimetype: 'video/mp4' }),
  soundcloud: async () => ({ buffer: samples.mp3, title: searchResult.title, mimetype: 'audio/mpeg' }),
  pinterest: async () => ({ video: true, buffer: samples.mp4, title: searchResult.title, mimetype: 'video/mp4' }),
};
const fakeDownloader = {
  kwai: async () => ({ buffer: samples.mp4, title: searchResult.title, mimetype: 'video/mp4' }),
  ytdlpSocialVideo: async () => ({ buffer: samples.mp4, title: searchResult.title, mimetype: 'video/mp4' }),
};

Module.prototype.require = function (id) {
  if (id === 'baileys-v6') return fakeBaileys;
  if (id === '../../config') return { footer: 'DARK BOT', bot: { name: 'DARK BOT', prefix: '!' } };
  if (id === '../systemZeroPlay') return fakeSystemZeroPlay;
  if (id === '../ytdl') return fakeYtdl;
  if (id === '../dl/others') return fakeSocialProviders;
  if (id === '../downloader') return fakeDownloader;
  return originalRequire.apply(this, arguments);
};

(async () => {
  const media = require('../src/bot/mediaHandler');
  const videoCompat = require('../src/bot/videoCompat');
  samples.mp3 = await media.fetchBuffer(
    'https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3',
    5, { timeout: 30000 },
  );
  samples.mp4 = await media.fetchBuffer(
    'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
    5, { timeout: 30000 },
  );
  assert(media.isAudioBytes(samples.mp3), 'downloaded sample must contain valid audio bytes');
  assert(videoCompat.isMp4(samples.mp4), 'downloaded sample must contain a valid MP4');

  const jid = 'download-smoke@s.whatsapp.net';
  const msg = { key: { id: 'download-smoke', remoteJid: jid }, message: {} };
  const m = { chat: jid, key: msg.key, reply: async text => { throw new Error(`unexpected reply: ${text}`); } };
  const ctx = { remoteJid: jid };
  const sent = [];
  const sock = {
    sendMessage: async (_jid, payload) => {
      sent.push(payload);
      return { key: { id: 'mock-send' } };
    },
    relayMessage: async (relayJid, message, options) => {
      relays.push({ jid: relayJid, message, options });
      return { key: { id: 'mock-relay' } };
    },
  };
  const register = modulePath => {
    const cases = new Map();
    require(modulePath)((names, handler) => [].concat(names).forEach(name => cases.set(name, handler)));
    return cases;
  };
  const playCases = register('../src/bot/cases/downloads');
  const socialCases = register('../src/bot/cases/downloads2');
  const run = async (cases, command, extra = {}) => {
    sent.length = 0;
    const handler = cases.get(command);
    assert.strictEqual(typeof handler, 'function', `${command} handler must exist`);
    await handler({
      sock, msg, m, ctx, args: [], text: '', prefix: '!', command,
      reply: async text => { throw new Error(`unexpected reply: ${text}`); },
      react: () => {}, ...extra,
    });
    return sent.filter(payload => payload.audio || payload.video || payload.image || payload.document || payload.text);
  };
  const passed = [];

  relays.length = 0;
  await playCases.get('play')({ sock, msg, m, ctx, text: 'smoke media', prefix: '!', command: 'play' });
  assert.strictEqual(relays.length, 1, '!play must return one official native card');
  const interactive = relays[0].message?.viewOnceMessage?.message?.interactiveMessage;
  const quickReplies = interactive?.nativeFlowMessage?.buttons || [];
  const ids = quickReplies.map(button => JSON.parse(button.buttonParamsJson || '{}').id);
  assert(ids.some(id => String(id).startsWith('!gyt ')), 'card must offer video');
  assert(!ids.some(id => String(id).startsWith('!ytd ')),
    'automatic play card must not expose a repeat-audio button');
  assert(sent.some(payload => payload.audio?.equals(samples.mp3) && payload.mimetype === 'audio/mpeg'),
    '!play must auto-send the real MP3 bytes');
  passed.push('!play: áudio MP3 real automático + botão de vídeo');

  let out = await run(playCases, 'ytd', { text: 'https://youtu.be/AAAAAAAAAAA | 128k' });
  assert(out.some(payload => payload.audio?.equals(samples.mp3)
    && payload.mimetype === 'audio/mpeg' && payload.ptt === false), '!ytd must build a real MP3 payload');
  passed.push('!ytd: bytes MP3 reais no payload');

  out = await run(playCases, 'gyt', { text: 'https://youtu.be/AAAAAAAAAAA | mp4 | 480 | 0:05' });
  // Com ffmpeg disponível (como no container) o vídeo é normalizado para o
  // WhatsApp; sem ffmpeg segue o original. Ambos têm de ser MP4 reais.
  assert(out.some(payload => Buffer.isBuffer(payload.video) && payload.video.length > 1024
    && (payload.video.equals(samples.mp4) || payload.video.slice(4, 8).toString() === 'ftyp')
    && payload.mimetype === 'video/mp4'), '!gyt must build a real MP4 payload');
  passed.push('!gyt: bytes MP4 reais no payload');

  const videoRoutes = [
    ['tiktok', ['https://www.tiktok.com/@sample/video/1']],
    ['instagram', ['https://www.instagram.com/reel/sample/']],
    ['facebook', ['https://www.facebook.com/watch/?v=1']],
    ['twitter', ['https://x.com/sample/status/1']],
    ['pinterest2', ['https://www.pinterest.com/pin/1']],
    ['kwai', ['https://www.kwai.com/@sample/video/1']],
  ];
  for (const [command, args] of videoRoutes) {
    out = await run(socialCases, command, { args });
    const sentVideo = out.find(payload => Buffer.isBuffer(payload.video) && payload.mimetype === 'video/mp4');
    assert(sentVideo && videoCompat.isMp4(sentVideo.video), `${command} must build a real MP4 payload`);
    if (command !== 'facebook') assert(sentVideo.video.equals(samples.mp4), `${command} preserves the provider bytes`);
    passed.push(`${command}: bytes MP4 reais no payload`);
  }

  const downloads2Source = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'bot', 'cases', 'downloads2.js'), 'utf8');
  assert(downloads2Source.includes('normalizeForWhatsApp: true, maxHeight: 720'), 'Facebook must normalize MP4 before WhatsApp delivery');
  passed.push('facebook: normalização H.264/AAC/yuv420p antes do envio');

  out = await run(socialCases, 'soundcloud', { args: ['https://soundcloud.com/sample/track'] });
  assert(out.some(payload => payload.audio?.equals(samples.mp3)
    && payload.mimetype === 'audio/mpeg'), 'soundcloud must build a real MP3 payload');
  passed.push('soundcloud: bytes MP3 reais no payload');

  out = await run(socialCases, 'spotify', { args: ['https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC'] });
  assert(out.some(payload => /open\.spotify\.com\/track\//.test(payload.text || '')),
    'Spotify must return an official link');
  assert(!out.some(payload => payload.audio || payload.video || payload.document),
    'Spotify must not be reported as an MP3 download');
  passed.push('spotify: referência oficial (sem MP3)');

  console.log(`Smoke de bytes reais: MP3 ${samples.mp3.length} B; MP4 ${samples.mp4.length} B.`);
  for (const line of passed) console.log(`PASS: ${line}`);
  console.log('Limite: bytes baixados de amostras públicas reais; providers e sock.sendMessage simulados.');
  console.log('Este teste NÃO verifica providers YouTube/redes sociais nem entrega real pelo WhatsApp.');
})().catch(error => {
  console.error('DOWNLOAD DELIVERY SMOKE: FAIL:', error.stack || error.message);
  process.exitCode = 1;
}).finally(() => {
  Module.prototype.require = originalRequire;
});
