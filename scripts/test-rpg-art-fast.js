/** Verifica card temático local e fallback seguro do GIF quando não há ffmpeg. */
'use strict';
const art = require('../src/bot/welcomeArt');

let ok = 0, fail = 0;
function t(label, yes, extra = '') {
  yes ? ok++ : fail++;
  console.log(`  ${yes ? '✅' : '❌'} ${label}${extra ? ' → ' + extra : ''}`);
}

(async () => {
  console.log('\n╔══ DARK RPG — CARD & GIF RESILIENTES ══╗');
  const player = {
    whatsappNumber: '244900000001', name: 'Kito', level: 17,
    race: 'humano', class: 'guerreiro', hp: 130, maxHp: 160,
    mp: 60, maxMp: 80, coins: 700,
  };
  const region = { id: 'angola', name: 'Angola', flag: '🇦🇴', city: 'Luanda Obsidiana', biome: 'Savanas de Ferro' };
  const local = { region, fetchFn: async () => null, cache: false };

  const card = await art.heroCard(player, local);
  t('Card de herói renderiza sem rede externa', Buffer.isBuffer(card) && card.length > 2048, card?.length);

  const gif = await art.heroGif(player, { ...local, frames: 8 });
  // Em host com ffmpeg há MP4; sem ele o helper devolve null rapidamente e
  // o case envia o card estático, em vez de uma mensagem quebrada.
  t('GIF é MP4 válido ou cai para fallback seguro', gif === null || (Buffer.isBuffer(gif) && gif.length > 2048), gif ? gif.length : 'fallback-card');

  console.log(`\n  ${ok} OK / ${fail} FALHOU\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
