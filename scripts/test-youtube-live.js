#!/usr/bin/env node
'use strict';
/**
 * Verificação opt-in de uma fonte pública YouTube, sem cookies, proxy, chave
 * ou sessão. Não envia nada a WhatsApp: confirma busca, download e bytes que
 * o handler pode entregar. Uso: npm run test:youtube-live
 */
const assert = require('assert');

// Esta prova é deliberadamente independente de variáveis privadas.
for (const key of [
  'SYSTEMZONE_API_URL', 'SYSTEMZONE_API_KEY', 'YTDLP_PROXY',
  'YT_COOKIES_BASE64', 'YTDLP_COOKIES_BASE64', 'YTDLP_USER_AGENT',
]) delete process.env[key];

const ytdl = require('../src/bot/ytdl');
const media = require('../src/bot/mediaHandler');
const videoCompat = require('../src/bot/videoCompat');

const URL = 'https://www.youtube.com/watch?v=jNQXAC9IVRw'; // vídeo público curto

(async () => {
  const started = Date.now();
  const audio = await ytdl.getAudio(URL, '128k');
  assert(Buffer.isBuffer(audio.buffer) && media.isAudioBytes(audio.buffer), 'áudio público precisa conter bytes válidos');
  assert.equal(media.audioMimeFromBytes(audio.buffer, audio.mimetype), 'audio/mpeg', 'saída de áudio precisa ser MP3 reproduzível');

  const video = await ytdl.getVideo(URL, '360');
  assert(Buffer.isBuffer(video.buffer) && videoCompat.isMp4(video.buffer), 'vídeo público precisa conter bytes MP4 válidos');

  console.log(`✅ YouTube público sem credenciais: áudio ${audio.buffer.length} B (${audio.source}); vídeo ${video.buffer.length} B (${video.source}) em ${Date.now() - started} ms.`);
  console.log('Limite: este teste confirma busca/download/bytes no servidor; a entrega por WhatsApp continua a exigir observação dos logs de uma instância conectada.');
})().catch(error => {
  console.error('❌ YOUTUBE LIVE:', error.stack || error.message);
  process.exitCode = 1;
});
