/**
 * test-gif-espelho.js — v7.27
 * Verifica que CADA comando com GIF (interações, medidores/zoeira, economia,
 * família, nativos) resolve para uma ação que é ESPELHO do que o comando faz,
 * e que essa ação tem reação em pelo menos 2 fontes diferentes.
 *
 * Offline por defeito. Com GIF_LIVE=1 também busca 1 GIF real de uma amostra
 * e confirma que sai MP4 válido para o WhatsApp.
 */
'use strict';
const path = require('path');
const gif = require('../src/bot/gifHelper');
const { M } = require('../src/bot/cases/medidores');

let ok = 0, fail = 0;
const check = (label, cond, extra = '') => {
  if (cond) { ok++; console.log(`  ✅ ${label}${extra ? ' → ' + extra : ''}`); }
  else { fail++; console.log(`  ❌ ${label}${extra ? ' → ' + extra : ''}`); }
};

console.log('\n══════ 1) INTERAÇÕES → ação espelho ══════');
// comando → ação esperada (o que o GIF TEM de mostrar)
const ESPERADO_INTERACOES = {
  abracar: 'hug', beijar: 'kiss', cafune: 'pat', declarar: 'love', flertar: 'flirt', paparico: 'spoil',
  chocolate: 'chocolate', tapa: 'slap', soco: 'punch', chute: 'kick', tiro: 'shoot', facada: 'stab',
  matar: 'kill', bater: 'beat', morder: 'bite', cuspir: 'spit', empurrar: 'push', envenenar: 'poison',
  espancar: 'beat', bullying: 'bully', amaldicoar: 'curse', mimimi: 'cry', fofocar: 'gossip',
  acordar: 'wake', cuidar: 'care', bencao: 'bless', pensar: 'think', dormir: 'sleep', correr: 'run',
  timido: 'shy', chorar: 'cry', rir: 'laugh', wave: 'wave', highfive: 'highfive', comer: 'eat',
  cafe: 'coffee', aura: 'aura', godadm: 'power', meditar: 'meditate', treinar: 'strong', estudar: 'study',
  cantar: 'sing', programar: 'code', gamer: 'game', banho: 'bath', trabalhar: 'work', cozinhar: 'cook',
  dancar: 'dance', hallobat: 'bat',
};
// As interações passam a query em INGLÊS (GIF_QUERIES). Testamos as duas vias:
// a chave portuguesa (comando) e a query inglesa que o pacote realmente envia.
const interSrc = require('fs').readFileSync(path.join(__dirname, '../src/bot/packages/interactions.js'), 'utf8');
const gq = {};
for (const m of interSrc.matchAll(/^\s{2}([a-z0-9_]+):\s*'([^']+)'/gm)) gq[m[1]] = m[2];
for (const [cmd, esperado] of Object.entries(ESPERADO_INTERACOES)) {
  const viaCmd = gif.resolveAction(cmd);
  const viaQuery = gq[cmd] ? gif.resolveAction(gq[cmd]) : viaCmd;
  check(`${cmd} (query "${gq[cmd] || cmd}")`, viaCmd === esperado && viaQuery === esperado, `${viaCmd}/${viaQuery} esperado ${esperado}`);
}

console.log('\n══════ 2) MEDIDORES / ZOEIRA (cases/medidores.js) ══════');
// todo medidor precisa de: ação ≠ fallback genérico E ≥2 fontes com reação
const kinds = [...new Set(M.map(m => m[3]))];
const semFonte = [];
for (const kind of kinds) {
  const cat = gif.resolveCategory(kind);
  const fontes = [
    cat.otaku.length ? 'otaku' : null, cat.nekos ? 'nekos.best' : null, cat.purr ? 'purr' : null,
    cat.waifu ? 'waifu' : null, cat.sra ? 'sra' : null, cat.life ? 'life' : null,
  ].filter(Boolean);
  const okKind = gif.ACTIONS[cat.action] && fontes.length >= 2;
  if (!okKind) semFonte.push(`${kind}→${cat.action}(${fontes.join(',')})`);
}
check(`${kinds.length} categorias de medidor com ação própria e ≥2 fontes`, semFonte.length === 0, semFonte.join(' | ') || 'todas');

// percentuais do pacote interactions (gifQuery em inglês)
console.log('\n══════ 3) PERCENTUAIS do pacote (gifQuery) ══════');
const ESPERADO_PCT = {
  gay: 'gay', beautiful: 'beautiful', ugly: 'ugly', dumb: 'dumb', betrayal: 'betrayal', rich: 'rich',
  flirt: 'flirt', crazy: 'crazy', hot: 'hot', prayer: 'prayer', skeptic: 'skeptic', sports: 'sports',
  drunk: 'drunk', jealous: 'jealous', cold: 'cold', sleep: 'sleep', weak: 'weak', tired: 'tired',
  naughty: 'naughty', confident: 'confident', possessive: 'possessive', lucky: 'lucky', addicted: 'addicted',
  // frases antigas (compatibilidade com cases dinâmicos que ainda passem texto livre)
  'anime sparkle beautiful': 'beautiful', 'anime rainbow pride': 'rainbow',
  'anime wink smirk': 'flirt', 'anime crazy wild': 'crazy', 'anime hot attractive': 'hot',
  'anime joker laugh': 'crazy', 'anime church prayer': 'prayer', 'anime skeptic face': 'skeptic',
  'anime sports athlete': 'sports', 'anime drunk funny': 'drunk', 'anime jealous angry': 'jealous',
  'anime cool cold': 'cold', 'anime sleepy yawn': 'sleep', 'anime weak tired': 'weak',
  'anime insomnia night': 'tired', 'anime envy jealous': 'jealous', 'anime devil smirk': 'naughty',
  'anime confident smirk': 'confident', 'anime yandere possessive': 'possessive', 'anime sleepy tired': 'sleep',
  'anime lucky clover': 'lucky', 'anime phone addiction': 'phone',
};
for (const [q, esp] of Object.entries(ESPERADO_PCT)) {
  const got = gif.resolveAction(q);
  check(`"${q}"`, got === esp, `${got}${got !== esp ? ' esperado ' + esp : ''}`);
}

console.log('\n══════ 4) ECONOMIA / FAMÍLIA / NATIVOS ══════');
const ESPERADO_OUTROS = {
  faint: 'faint', summon: 'summon', thief: 'thief', evil: 'evil', work: 'work', gamble: 'gamble', gift: 'gift',
  winner: 'winner', loser: 'loser', shopping: 'shopping', marry: 'marry', family: 'family', divorce: 'divorce', yeet: 'yeet',
  'anime faint tired': 'faint', 'anime summon dark magic portal': 'summon', 'anime thief run': 'thief',
  'anime evil laugh': 'evil', 'anime gambling': 'gamble', 'anime gift present': 'gift', 'anime wedding': 'marry',
  'anime breakup': 'divorce', 'anime cry sad': 'cry',
};
for (const [q, esp] of Object.entries(ESPERADO_OUTROS)) {
  const got = gif.resolveAction(q);
  check(`"${q}"`, got === esp, `${got}${got !== esp ? ' esperado ' + esp : ''}`);
}

console.log('\n══════ 5) Sem bloqueio de conteúdo ══════');
const src = require('fs').readFileSync(path.join(__dirname, '../src/bot/gifHelper.js'), 'utf8');
check('Tenor sem contentfilter=medium/high', !/contentfilter=(medium|high|low)/.test(src));
check('Giphy com rating=r (sem g/pg)', !/rating=(g|pg|pg-13)\b/.test(src));
check('Fontes consultadas em paralelo (Promise.allSettled)', /Promise\.allSettled/.test(src));
check('nekos.best com User-Agent de bot', /nekos\.best[\s\S]{0,200}User-Agent/.test(src));

(async () => {
  if (process.env.GIF_LIVE === '1') {
    console.log('\n══════ 6) LIVE — buscar GIF real (amostra) ══════');
    const amostra = ['tapa', 'abracar', 'beijar', 'rico', 'burro', 'psicopata', 'dancar', 'anime money rich'];
    for (const q of amostra) {
      const t0 = Date.now();
      try {
        const { list, action } = await gif.fetchCandidates(q);
        const buf = await gif.fetchGifBuffer(q);
        const isMp4 = buf && buf.slice(4, 8).toString() === 'ftyp';
        check(`${q} → ${action}`, !!isMp4, `${list.length} candidatos [${[...new Set(list.map(c => c.src))].join(',')}] ${buf ? (buf.length / 1024 | 0) + 'KB' : 'null'} em ${Date.now() - t0}ms`);
      } catch (e) { check(`${q}`, false, e.message); }
    }
  }
  console.log(`\n══════════════════════════════════════════\n🎞️ GIF ESPELHO: ${ok} OK / ${fail} FALHOU\n`);
  process.exit(fail ? 1 : 0);
})();
