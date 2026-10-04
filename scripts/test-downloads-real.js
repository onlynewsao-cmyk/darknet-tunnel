#!/usr/bin/env node
/**
 * DARK BOT — Downloads que entregam (v7.4) — regressão
 *
 * Garante que os comandos de download que dependiam de APIs mortas
 * agora têm fallback funcional (yt-dlp) e que as descrições certas
 * são usadas.
 *
 * Uso: node scripts/test-downloads-real.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

let ok = 0, fail = 0;
const t = (n, c, e) => { e = e || ''; c ? ok++ : fail++; console.log('  ' + (c ? '✅' : '❌') + ' ' + n + (e ? ' → ' + String(e).slice(0, 90) : '')); };

const ROOT = path.join(__dirname, '..', 'src', 'bot');

// ── 1. Redes sociais mantêm fallback; Spotify é estritamente oficial ──
console.log('\n╔═══ 1. Fontes por plataforma ═══╗');
{
  const src = fs.readFileSync(path.join(ROOT, 'dl', 'others.js'), 'utf8');
  const fn = (nome) => {
    const i = src.indexOf('async function ' + nome + '(');
    if (i < 0) return '';
    const next = src.indexOf('\nasync function ', i + 1);
    return src.slice(i, next > i ? next : src.length);
  };
  for (const nome of ['instagram', 'facebook', 'twitter', 'soundcloud']) {
    t(`${nome} → fallback downloader (yt-dlp)`, fn(nome).includes("require('../downloader')"), '');
  }
  const spotify = fn('spotify');
  t('spotify → somente referência oficial', spotify.includes("source: 'spotify-official'") && spotify.includes('isOfficialSpotifyUrl'), '');
  t('spotify não cai em fonte alternativa', !/require\('\.\.\/downloader'\)|cobalt|spotifydown|youtube|yt-dlp/i.test(spotify), '');
}

// ── 2. downloader.twitter tem fallback yt-dlp ──
console.log('\n╔═══ 2. Twitter/X com yt-dlp ═══╗');
{
  const src = fs.readFileSync(path.join(ROOT, 'downloader.js'), 'utf8');
  const i = src.indexOf('async function twitter(');
  const j = src.indexOf('async function instagram(', i);
  const body = src.slice(i, j > i ? j : i + 2000);
  t('twitter usa ytdlpSocialVideo como fallback', body.includes('ytdlpSocialVideo'), '');
  t('ytdlpSocialVideo exportado', /ytdlpSocialVideo,?\s*\n\s*tiktok,/.test(src) || /module\.exports\s*=\s*\{[^}]*ytdlpSocialVideo[^}]*\}/s.test(src), '');
}

// ── 3. kwai com fallback yt-dlp ──
console.log('\n╔═══ 3. Kwai ═══╗');
{
  const src = fs.readFileSync(path.join(ROOT, 'cases', 'downloads2.js'), 'utf8');
  t('kwai usa scrape dl.kwai primeiro', /registerCase\(\['kwai'\][\s\S]{0,800}dl\.kwai\(/.test(src), '');
  t('kwai mantém ytdlpSocialVideo como 2.º', /registerCase\(\['kwai'\][\s\S]{0,1600}ytdlpSocialVideo/.test(src), '');
  t('kwai sem zahwazein viva (morta)', !/zahwazein\.xyz\/downloader\/kwai/.test(src), '');
}

// ── 4. tiktokstalk/tiktoktxt com fallback real (tiktokSearch) ──
console.log('\n╔═══ 4. TikTok stalk ═══╗');
{
  const src = fs.readFileSync(path.join(ROOT, 'cases', 'downloads2.js'), 'utf8');
  const i = src.indexOf("registerCase(['tiktoktxt'");
  const body = src.slice(i, i + 1500);
  t('aliases incluem tiktokstalk/ttstalk', body.includes("'tiktokstalk'") && body.includes("'ttstalk'"), '');
  t('usa tiktokSearch como fallback real', body.includes('tiktokSearch'), '');
  t('já não depende de zahwazein stalker', !body.includes('zahwazein'), '');
}

// ── 5. shazam real + descrição certa ──
console.log('\n╔═══ 5. Shazam ═══╗');
{
  const src = fs.readFileSync(path.join(ROOT, 'cases', 'downloads2.js'), 'utf8');
  const i = src.indexOf("registerCase(['shazam'");
  const body = src.slice(i, i + 5000); // v7.64: handler cresceu (Whisper + fallback)
  t('shazam usa IA (ai.chat) para identificar', body.includes('ai.chat'), '');
  t('shazam trata áudio citado via Whisper', body.includes('audioMessage') && body.includes('transcribeAudio'), '');
  t('shazam tem fallback honesto no áudio', body.includes('Não consegui ouvir'), '');
  t('shazam letra tem fallback grátis', body.includes('lyrics.ovh'), '');

  const { describe } = require(path.join(ROOT, 'commandDescriptions'));
  const d = describe('shazam', 'downloads');
  t('descrição do shazam já não é "Codifica"', !/Codifica/i.test(d), d);
  t('descrição do shazam fala de música', /m[úu]sica|letra/i.test(d), d);
  t('md5 continua "Codifica ou descodifica"', /Codifica/i.test(describe('md5', 'downloads')), describe('md5', 'downloads'));
}

console.log('\n───────────────────────────────');
console.log((fail === 0 ? '✅' : '❌') + ` ${ok} OK / ${fail} FALHOU\n`);
process.exit(fail === 0 ? 0 : 1);
