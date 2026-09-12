'use strict';

// Perfis oficiais de entrega. Mantemos os valores antigos dos comandos
// para não quebrar botões/links já enviados.
const AUDIO = Object.freeze({
  low: '96k',
  medium: '192k',
  high: '320k',
});

const VIDEO = Object.freeze({
  low: '360',
  medium: '720',
  high: '1080',
});

function audioQuality(value = '128k') {
  const raw = String(value || '').toLowerCase().trim();
  if (raw === 'low' || raw === 'baixa' || raw === 'rápida' || raw === 'rapida') return AUDIO.low;
  if (raw === 'medium' || raw === 'média' || raw === 'media') return AUDIO.medium;
  if (raw === 'high' || raw === 'alta') return AUDIO.high;
  const m = raw.match(/^(\d{2,3})\s*k?$/);
  if (m) return `${Math.max(64, Math.min(320, Number(m[1])))}k`;
  return '128k';
}

function videoHeight(value = '720') {
  const raw = String(value || '').toLowerCase().trim();
  if (raw === 'low' || raw === 'baixa' || raw === 'rápida' || raw === 'rapida') return VIDEO.low;
  if (raw === 'medium' || raw === 'média' || raw === 'media') return VIDEO.medium;
  if (raw === 'high' || raw === 'alta') return VIDEO.high;
  const m = raw.match(/^(\d{3,4})\s*p?$/);
  if (m) {
    const n = Number(m[1]);
    if (n <= 480) return '360';
    if (n <= 720) return '720';
    return '1080';
  }
  return '720';
}

function profile(audio = '128k', video = '720') {
  const a = audioQuality(audio);
  const v = videoHeight(video);
  return {
    audio: a,
    video: v,
    // parâmetros pequenos e explícitos permitem que APIs compatíveis
    // escolham uma fonte mais rápida sem alterar o fallback local.
    apiAudio: a.replace('k', ''),
    apiVideo: `${v}p`,
  };
}

module.exports = { AUDIO, VIDEO, audioQuality, videoHeight, profile };
