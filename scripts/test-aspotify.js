'use strict';
/**
 * Contrato Spotify estrito:
 * - o bot só partilha URL do Spotify e metadados públicos;
 * - não envia buffer/audio para faixa, álbum, EP, CD ou playlist;
 * - não usa YouTube, Cobalt, spotifydown ou outro fallback no caminho Spotify.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const tiers = require('../src/bot/spotifyTiers');
const downloader = require('../src/bot/downloader');
const others = require('../src/bot/dl/others');

let checks = 0;
function ok(condition, label) {
  assert.ok(condition, label);
  checks++;
  console.log('✔', label);
}

function mockSock(sent) {
  return {
    sendMessage: async (_jid, content) => {
      sent.push(content);
      return { key: { id: 'sent' } };
    },
  };
}

(async () => {
  console.log('=== Spotify oficial estrito ===');

  // ── URLs oficiais e canonização ──────────────────────────────
  const faixa = 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=x';
  const album = 'https://open.spotify.com/intl-pt/album/4LH4d3cOWNNsVw41Gqt2kv'; // álbum / EP / CD
  const playlist = 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M';
  ok(tiers.isOfficialSpotifyUrl(faixa), 'aceita open.spotify.com');
  ok(tiers.isOfficialSpotifyUrl('https://spotify.link/abc123'), 'aceita spotify.link oficial');
  ok(!tiers.isOfficialSpotifyUrl('https://notspotify.com/track/AAAA'), 'rejeita domínio parecido');
  ok(!tiers.isOfficialSpotifyUrl('https://youtu.be/abc'), 'rejeita YouTube');
  ok(tiers.parseSpotifyLink(faixa).tipo === 'track', 'interpreta faixa');
  ok(tiers.parseSpotifyLink(album).tipo === 'album', 'interpreta álbum, EP e CD como album');
  ok(tiers.parseSpotifyLink(playlist).tipo === 'playlist', 'interpreta playlist');

  // ── Metadados vêm exclusivamente de open.spotify.com ─────────
  const urlsLidas = [];
  const embed = '<script id="__NEXT_DATA__" type="application/json">' + JSON.stringify({
    props: { pageProps: { state: { data: { entity: { title: 'EP Oficial', trackList: [
      { uri: 'spotify:track:AAA', title: 'Faixa Um', subtitle: 'Artista' },
      { uri: 'spotify:track:BBB', title: 'Faixa Dois', subtitle: 'Artista' },
    ] } } } } } }) + '</script>';
  const col = await tiers.colecaoSpotify(album, { tipo: 'album', id: '4LH4d3cOWNNsVw41Gqt2kv' }, {
    fetchHtml: async (url) => { urlsLidas.push(url); return embed; },
  });
  ok(col.fonte === 'open.spotify.com', 'coleção é identificada como fonte oficial');
  ok(col.faixas.length === 2 && col.faixas[0].nome === 'Faixa Um', 'lê as faixas do embed Spotify');
  ok(urlsLidas.every(url => /^https:\/\/open\.spotify\.com\//.test(url)), 'metadados só consultam open.spotify.com');

  // ── Adaptadores legados continuam seguros ─────────────────────
  const dFaixa = await downloader.spotify(faixa);
  ok(dFaixa.isOfficialLink && dFaixa.source === 'spotify-official', 'downloader marca faixa como Spotify oficial');
  ok(!dFaixa.buffer && dFaixa.officialUrl === 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC', 'downloader não entrega buffer/MP3');
  const dBusca = await downloader.spotify('Rick Astley');
  ok(dBusca.officialUrl === 'https://open.spotify.com/search/Rick%20Astley', 'nome abre pesquisa oficial Spotify');
  const oPlaylist = await others.spotify(playlist);
  ok(oPlaylist.isOfficialLink && oPlaylist.officialUrl === playlist, 'adaptador dl/others preserva playlist oficial');

  // ── O comando nunca envia áudio ───────────────────────────────
  const comandos = {};
  require('../src/bot/cases/downloads2')((nomes, fn) => nomes.forEach(nome => { comandos[nome] = fn; }));
  ok(['spotify', 'spotify1', 'sp', 'spotify2', 'spotify3'].every(nome => comandos[nome]), 'todos os aliases Spotify estão registados');

  const ctx = { remoteJid: 'grupo@g.us' };
  const msg = { key: { id: 'm1', remoteJid: ctx.remoteJid } };
  let sent = [];
  await comandos.spotify2({ sock: mockSock(sent), msg, ctx, args: [faixa], prefix: '!', command: 'spotify2', reply: async () => {} });
  const textoFaixa = sent.find(x => x.text)?.text || '';
  ok(/SPOTIFY OFICIAL/.test(textoFaixa) && textoFaixa.includes('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC'), 'faixa retorna link canónico oficial');
  ok(!sent.some(x => x.audio || x.document || x.video), 'faixa não envia mídia binária de outra origem');

  const originalColecao = tiers.colecaoSpotify;
  tiers.colecaoSpotify = async () => ({ nome: 'CD Oficial', faixas: [{ nome: 'A', artista: 'B' }, { nome: 'C', artista: 'D' }], fonte: 'open.spotify.com' });
  sent = [];
  await comandos.spotify3({ sock: mockSock(sent), msg, ctx, args: [album], prefix: '!', command: 'spotify3', reply: async () => {} });
  const textoAlbum = sent.find(x => x.text)?.text || '';
  ok(/CD Oficial/.test(textoAlbum) && /1\. A — B/.test(textoAlbum), 'álbum/EP/CD retorna metadados e link oficial');
  ok(!sent.some(x => x.audio || x.document || x.video), 'álbum/EP/CD não envia MP3');

  sent = [];
  await comandos.spotify({ sock: mockSock(sent), msg, ctx, args: [playlist], prefix: '!', command: 'spotify', reply: async () => {} });
  const textoPlaylist = sent.find(x => x.text)?.text || '';
  ok(textoPlaylist.includes(playlist) && /CD Oficial/.test(textoPlaylist), 'playlist retorna link oficial e faixas');
  tiers.colecaoSpotify = originalColecao;

  sent = [];
  await comandos.sp({ sock: mockSock(sent), msg, ctx, args: ['minha', 'busca'], prefix: '!', command: 'sp', reply: async () => {} });
  const textoBusca = sent.find(x => x.text)?.text || '';
  ok(textoBusca.includes('https://open.spotify.com/search/minha%20busca'), 'busca textual abre pesquisa no catálogo Spotify');

  // ── Auditoria estática dos caminhos Spotify ───────────────────
  const root = path.join(__dirname, '..', 'src', 'bot');
  const commandSrc = fs.readFileSync(path.join(root, 'cases', 'downloads2.js'), 'utf8');
  const spotifySlice = commandSrc.slice(commandSrc.indexOf('SPOTIFY OFICIAL'), commandSrc.indexOf('// ═══ SOUNDCLOUD'));
  ok(!/getAudio|sendAudio|yt-search|youtubeAudio|cobalt|spotifydown|downloadAudioFile/i.test(spotifySlice), 'comando Spotify não possui fallback de download');
  for (const rel of ['downloader.js', path.join('dl', 'others.js')]) {
    const src = fs.readFileSync(path.join(root, rel), 'utf8');
    const at = src.indexOf('async function spotify(');
    const scope = src.slice(at, src.indexOf('async function soundcloud(', at));
    ok(!/yt-dlp|youtube|cobalt|spotifydown|downloadAudioFile|fetchMediaBuffer/i.test(scope), `${rel}: caminho Spotify sem fonte alternativa`);
  }
  const autoSrc = fs.readFileSync(path.join(root, 'autoDl.js'), 'utf8');
  const autoAt = autoSrc.indexOf("if (plataforma === 'spotify')");
  const autoScope = autoSrc.slice(autoAt, autoSrc.indexOf('const r =', autoAt));
  ok(!/yt-dlp|youtube|cobalt|spotifydown|downloadAudioFile|fetchMediaBuffer/i.test(autoScope), 'autoDl: Spotify só partilha referência oficial');

  console.log(`\nOK / test-aspotify — ${checks} verificações Spotify oficial estrito`);
})().catch(error => { console.error('ERRO FATAL:', error); process.exit(1); });
