#!/usr/bin/env node
'use strict';
/** Perfil visual — cartões de welcome e RPG sem burlar privacidade WhatsApp. */
const assert = require('assert');
const fs = require('fs');
const sharp = require('sharp');
const { resolveVisualProfile } = require('../src/bot/visualIdentity');
const art = require('../src/bot/welcomeArt');

let checks = 0;
function ok(name, value) { assert.ok(value, name); checks++; console.log('  ✅', name); }

(async () => {
  const seen = [];
  const viaPn = await resolveVisualProfile({
    signalRepository: { lidMapping: { getPNForLID: async lid => lid === '991@lid' ? '244900000001@s.whatsapp.net' : '' } },
    profilePictureUrl: async jid => { seen.push(jid); return 'https://mmg.whatsapp.net/photo.jpg'; },
  }, '991@lid');
  ok('LID é resolvido por mapeamento oficial antes de pedir a foto',
    viaPn.url.startsWith('https://') && viaPn.jid === '244900000001@s.whatsapp.net' && seen[0] === '244900000001@s.whatsapp.net');
  ok('nunca converte os dígitos do LID em telefone', !seen.some(jid => String(jid).startsWith('991@')));

  const attempts = [];
  const fallback = await resolveVisualProfile({
    profilePictureUrl: async jid => {
      attempts.push(jid);
      if (jid === '244900000002@s.whatsapp.net') throw new Error('foto privada');
      return jid === 'safe@lid' ? 'https://mmg.whatsapp.net/lid-photo.jpg' : null;
    },
  }, { id: 'safe@lid', pn: '244900000002@s.whatsapp.net' });
  ok('se a PN não tiver foto, tenta somente o identificador de protocolo original',
    fallback.url.endsWith('lid-photo.jpg') && attempts.join('|') === '244900000002@s.whatsapp.net|safe@lid');

  const blocked = await resolveVisualProfile({ profilePictureUrl: async () => 'http://unsafe.example/pic.jpg' }, '244900000003@s.whatsapp.net');
  ok('URL não HTTPS é ignorada', blocked.url === '' && blocked.reason === 'indisponivel');

  let groupAvatarAsked = false;
  await resolveVisualProfile({ profilePictureUrl: async () => { groupAvatarAsked = true; return 'https://mmg.whatsapp.net/group.jpg'; } }, '', { fallbackJid: '120363000@g.us' });
  ok('avatar do grupo nunca substitui a foto da pessoa', groupAvatarAsked === false);

  const avatar = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#845ec2' } }).png().toBuffer();
  const fetches = [];
  const card = await art.artCard({
    name: 'Ana', profilePicUrl: 'https://mmg.whatsapp.net/ana.jpg',
    localBackground: true, cache: false,
    fetchFn: async url => { fetches.push(url); return avatar; },
  });
  ok('fallback local mantém foto de perfil no card', card.length > 2000 && fetches.length === 1 && fetches[0].includes('ana.jpg'));

  const groupEvents = fs.readFileSync('src/bot/groupEvents.js', 'utf8');
  const rgcard = fs.readFileSync('src/bot/cases/welcm.js', 'utf8');
  const rpgVisuals = fs.readFileSync('src/bot/cases/rpgVisuals.js', 'utf8');
  const heroVisuals = fs.readFileSync('src/bot/rpg/visuals.js', 'utf8');
  ok('welcome usa o resolvedor visual comum', groupEvents.includes("require('./visualIdentity').resolveVisualProfile"));
  ok('todos os cartões e GIFs RPG usam foto quando o WhatsApp permitir',
    rgcard.includes("require('../visualIdentity').resolveVisualProfile") &&
    rpgVisuals.includes("require('../visualIdentity').resolveVisualProfile") &&
    heroVisuals.includes("require('../visualIdentity').resolveVisualProfile") &&
    heroVisuals.includes('localBackground: true'));

  console.log(`\nPERFIL VISUAL: ${checks} OK / 0 falhas`);
})().catch(error => { console.error(error); process.exitCode = 1; });
