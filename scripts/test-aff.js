#!/usr/bin/env node
/**
 * v8.3 🔥 — Free Fire (comandos com API livre) + Spotify EMBED vivo
 *  • freefireapis.lat keyless → cartão do guerreiro (uid + região)
 *  • infoff/ffinfo legado agora tenta a API gratuita antes do token NYX
 *  • colecção Spotify: via EMBED (trackList {title,subtitle}) entre o
 *    fontes externas e a página clássica
 */
'use strict';

process.env.MONGODB_URI = '';

const assert = require('assert');

// ── mocks plásticos ───────────────────────────────────────────
const Module = require('module');
const _orig = Module.prototype.require;
let _jogador = null;     // resposta da API FF
let _urls = [];
Module.prototype.require = function (id) {
  const s = String(id);
  if (s.endsWith('hotCache')) return { getGroupSettings: async () => null, forgetGroup: () => {} };
  if (s.endsWith('mediaHandler')) {
    return {
      fetchJson: async (url) => { _urls.push(url); return _jogador || { success: false }; },
      fetchBuffer: async () => _jogador || Buffer.alloc(0),
      isAudioBytes: () => true, cleanThumb: (x) => x,
    };
  }
  return _orig.apply(this, arguments);
};

const sent = [];
const sockF = { sendMessage: async (j, c) => { sent.push(c); return { key: { id: 'k' } }; } };
const ctxF = { remoteJid: 'GRP@g.us', senderNumber: '2449', isGroup: true, prefix: '!' };

const FAKE_FF = { success: true, result: {
  basicInfo: {
    accountId: '228159683', nickname: 'DARK‿VAIDER', region: 'BR',
    level: 81, exp: '7.422.523', primeLevel: 8, seasonId: 53,
    rank: 'Desafiante IV', rankingPoints: '8.145', csRank: 'Ouro III', csRankingPoints: '33',
    maxRank: 'Diamante I', csMaxRank: 'Diamante III',
    liked: '1.527.319', badgeCnt: '175', hasElitePass: true,
    lastLoginAt: '19/09/2026 às 01:02:03', createAt: '11/05/2018 às 01:52:20',
    xpInfo: { currentInLevel: '41.199', totalInLevel: '661.829', rate: '6.2' },
  },
  petInfo: { name: 'JUBILEU', level: 7 },
  socialInfo: { signature: 'Nasce sombrio, vive lendário' },
  creditScoreInfo: { creditScore: 100 },
} };

(async () => {
  console.log('=== v8.3 — Free Fire + Spotify EMBED ===');

  const reg = {};
  require('../src/bot/cases/freefire')((nomes, fn) => { for (const n of [].concat(nomes)) reg[n] = fn; });
  assert.ok(reg.ff && reg.freefire && reg.ffplayer && reg.ffregioes, 'comandos FF registados');
  assert.ok(!reg.ffinfo, "'ffinfo' fica na casa do infoff (sem colisão)");

  // ── 1. Uso simpático sem uid ────────────────────────────────
  sent.length = 0;
  await reg.ff({ sock: sockF, msg: { key: { id: 'a1' } }, ctx: ctxF, args: [], prefix: '!' });
  assert.ok(sent.some(c => /INFO DO JOGADOR/.test(c.text || '') && /ffregioes/.test(c.text || '')), 'ajuda quando faltam dados');
  console.log('✔ sem UID: ajuda viva');

  // ── 2. Cartão completo ──────────────────────────────────────
  _jogador = FAKE_FF; sent.length = 0; _urls.length = 0;
  await reg.ff({ sock: sockF, msg: { key: { id: 'b1' } }, ctx: ctxF, args: ['228159683'], prefix: '!' });
  const card = sent.find(c => /CARTÃO DO GUERREIRO/.test(c.text || ''));
  assert.ok(card, 'cartão entregue');
  const tx = card.text;
  for (const frag of ['DARK‿VAIDER', '228159683', 'Nível *81*', 'Prime 8', 'Desafiante IV', 'Ouro III',
    'Diamante I', '1.527.319', '175', 'Elite Pass', 'JUBILEU', 'Nasce sombrio', 'credit score: 100',
    '19/09/2026', '11/05/2018', '▰', '▱']) {
    assert.ok(tx.includes(frag), `o cartão tem "${frag}"`);
  }
  assert.ok(/region=BR/.test(_urls[0]), 'região BR por omissão');
  console.log('✔ cartão completo com todos os campos vivos');

  // ── 3. Região pedida → muda a chamada ───────────────────────
  sent.length = 0; _urls.length = 0;
  await reg.ff({ sock: sockF, msg: { key: { id: 'c1' } }, ctx: ctxF, args: ['228159683', 'me'], prefix: '!' });
  assert.ok(/region=ME/.test(_urls[0]), 'região ME honrada');
  assert.ok(sent.some(c => /Médio Oriente/.test(c.text || '')), 'nome bonito da região');
  console.log('✔ região do utilizador respeitada (com 🌍 nome)');

  // ── 4. TOKEN_UNAVAILABLE → dica de região ──────────────────
  _jogador = { success: false, error: 'TOKEN_UNAVAILABLE', message: 'No valid token' };
  sent.length = 0;
  await reg.ff({ sock: sockF, msg: { key: { id: 'd1' } }, ctx: ctxF, args: ['228159683', 'us'], prefix: '!' });
  assert.ok(sent.some(c => /sem token/i.test(c.text || '') && /ffinfo 228159683 <região>/.test(c.text || '')), 'dica de troca de região');
  console.log('✔ região sem token: o bot orienta');

  // ── 5. ffregioes ────────────────────────────────────────────
  _jogador = null; sent.length = 0;
  await reg.ffregioes({ sock: sockF, msg: { key: { id: 'e1' } }, ctx: ctxF, args: [], prefix: '!' });
  const t5 = sent.find(c => /REGIÕES SUPORTADAS/.test(c.text || ''));
  assert.ok(t5 && /BR — Brasil/.test(t5.text) && /ME — Médio Oriente/.test(t5.text), '16 regiões catalogadas');
  console.log('✔ ffregioes completo');

  // ── 6. Spotify EMBED (via viva) ─────────────────────────────
  const tiers = require('../src/bot/spotifyTiers');
  const embedHtml = '<html><body><script id="__NEXT_DATA__" type="application/json">' + JSON.stringify({
    props: { pageProps: { state: { data: { entity: { title: 'The Dark Side of the Moon',
      trackList: [
        { uri: 'spotify:track:AAA', title: 'Speak to Me', subtitle: 'Pink Floyd' },
        { uri: 'spotify:track:BBB', title: 'Time', subtitle: 'Pink Floyd' },
        { uri: 'spotify:track:CCC', title: 'Money', subtitle: 'Pink Floyd' },
      ] } } } } } }) + '</script></body></html>';
  const chamadas = [];
  const col = await tiers.colecaoSpotify('https://open.spotify.com/album/X1', { tipo: 'album', id: 'X1' }, {
    fetchHtml: async (u) => { chamadas.push(u); return u.includes('/embed/') ? embedHtml : '<html><title>shell</title></html>'; },
  });
  assert.strictEqual(col.fonte, 'open.spotify.com', 'EMBED oficial é a fonte usada');
  assert.strictEqual(col.nome, 'The Dark Side of the Moon', 'nome da colecção');
  assert.strictEqual(col.faixas.length, 3, '3 faixas extraídas');
  assert.strictEqual(col.faixas[0].artista, 'Pink Floyd');
  assert.strictEqual(col.faixas[2].ref, 'CCC', 'ref do uri spotify:track:');
  assert.ok(chamadas[0].includes('/embed/'), 'embed vem antes da página clássica');
  console.log('✔ colecção Spotify: EMBED oficial');

  // ── 7. infoff legado tenta a gratuita primeiro ──────────────
  const fs2 = require('fs'), p2 = require('path');
  const incoming = fs2.readFileSync(p2.join(__dirname, '..', 'src', 'bot', 'cases', 'incomingTools.js'), 'utf8');
  assert.ok(/freefireapis\.lat/.test(incoming), 'infoff tenta a API gratuita');
  assert.ok(/TOKEN_UNAVAILABLE/.test(incoming), 'infoff orienta não-sem-token');
  console.log('✔ infoff/ffinfo legado: API livre 1º, NYX só de emergência');

  // ── 8. Estático ─────────────────────────────────────────────
  const ffSrc = fs2.readFileSync(p2.join(__dirname, '..', 'src', 'bot', 'cases', 'freefire.js'), 'utf8');
  assert.ok(/REGIOES/.test(ffSrc) && /cartaoFF/.test(ffSrc), 'cartão + regiões');
  const tiersSrc = fs2.readFileSync(p2.join(__dirname, '..', 'src', 'bot', 'spotifyTiers.js'), 'utf8');
  assert.ok(/embed\//.test(tiersSrc), 'colecaoSpotify tem a via embed');
  console.log('✔ ganchos do v8.3');

  console.log('\nOK / test-aff — Free Fire livre + Spotify EMBED (v8.3)');
  process.exit(0);
})().catch(e => { console.error('ERRO FATAL:', e); process.exit(1); });
