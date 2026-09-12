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

// ── 1. dl/others.js tem fallback yt-dlp (downloader) nas 5 redes ──
console.log('\n╔═══ 1. Fallback yt-dlp nas redes sociais ═══╗');
{
  const src = fs.readFileSync(path.join(ROOT, 'dl', 'others.js'), 'utf8');
  const fn = (nome) => {
    const i = src.indexOf('async function ' + nome + '(');
    if (i < 0) return '';
    const j = src.indexOf('throw new Error', i);
    return src.slice(i, j > i ? j : i + 3000);
  };
  for (const nome of ['instagram', 'facebook', 'twitter', 'spotify', 'soundcloud']) {
    const body = fn(nome);
    t(`${nome} → fallback downloader (yt-dlp)`, body.includes("require('../downloader')"), '');
  }
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
  t('kwai usa ytdlpSocialVideo primeiro', /registerCase\(\['kwai'\][\s\S]{0,800}ytdlpSocialVideo/.test(src), '');
  t('kwai mantém zahwazein como 2.º', /registerCase\(\['kwai'\][\s\S]{0,1200}zahwazein/.test(src), '');
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
  const body = src.slice(i, i + 2500);
  t('shazam usa IA (ai.chat) para identificar', body.includes('ai.chat'), '');
  t('shazam trata áudio citado com aviso honesto', body.includes('audioMessage') && body.includes('AudD'), '');

  const { describe } = require(path.join(ROOT, 'commandDescriptions'));
  const d = describe('shazam', 'downloads');
  t('descrição do shazam já não é "Codifica"', !/Codifica/i.test(d), d);
  t('descrição do shazam fala de música', /m[úu]sica|letra/i.test(d), d);
  t('md5 continua "Codifica ou descodifica"', /Codifica/i.test(describe('md5', 'downloads')), describe('md5', 'downloads'));
}

console.log('\n───────────────────────────────');
console.log((fail === 0 ? '✅' : '❌') + ` ${ok} OK / ${fail} FALHOU\n`);
process.exit(fail === 0 ? 0 : 1);
