#!/usr/bin/env node
/**
 * DARK BOT — REGRESSÃO: submenus organizados + temas limpos (v7.24)
 *
 * Corrige:
 *  1. 'outros' tinha 62 comandos mal classificados → agora 0.
 *  2. 'rank' (425) separava rank<adjetivo> do medidor → merge em zoeira.
 *  3. Aliases enchiam os submenus (play/music/musica/yt) → 1 só canónico.
 *  4. Comandos não podem estar em 2 submenus.
 *  5. Submenus sem categorias → agora com secções (subcat).
 *  6. Temas novos com molduras com caracteres de combinação (ruído de
 *     "fundo/skin") → molduras limpas de 1 carácter.
 *
 * Uso: node scripts/test-submenus-organizados.js
 */
'use strict';

process.env.MONGODB_URI = '';
process.env.OWNER_NUMBER = '244945280380';

const caseHandler = require('../src/bot/caseHandler');
caseHandler.init();

let ok = 0, fail = 0;
const t = (n, c, e) => { e = e || ''; c ? ok++ : fail++; console.log('  ' + (c ? '✅' : '❌') + ' ' + n + (e ? ' → ' + String(e).slice(0, 70) : '')); };

setTimeout(() => {
  const sd = require('../src/bot/submenuData');
  const RE = require('../src/bot/renderEngine');
  const ct = require('../src/bot/changeThemes');
  const allCmds = [...caseHandler.CASES.keys()];
  const sub = sd.getAllSubmenus(allCmds);

  console.log('\n╔═══ 1. Classificação — nada em "outros" nem "rank" ═══╗');
  {
    const outros = allCmds.filter(c => sd.categorize(c) === 'outros');
    t('"outros" vazio (62 → 0)', outros.length === 0, outros.slice(0, 5).join(','));
    const rank = allCmds.filter(c => sd.categorize(c) === 'rank');
    t('"rank" vazio (425 → zoeira)', rank.length === 0);
    t('som → downloads', sd.categorize('som') === 'downloads');
    t('traduzir → texto', sd.categorize('traduzir') === 'texto');
    t('help → info', sd.categorize('help') === 'info');
    t('hora → info', sd.categorize('hora') === 'info');
    t('rankgay → zoeira', sd.categorize('rankgay') === 'zoeira');
    t('defpack → stickers', sd.categorize('defpack') === 'stickers');
    t('rpgguia → economia', sd.categorize('rpgguia') === 'economia');
    t('robloxcode → search', sd.categorize('robloxcode') === 'search');
    t('call → info', sd.categorize('call') === 'info');
    t('auramod → ia', sd.categorize('auramod') === 'ia');
  }

  console.log('\n╔═══ 2. Nenhum comando em 2 submenus ═══╗');
  {
    const visto = new Map();
    for (const [cat, s] of Object.entries(sub)) for (const it of s.items) {
      if (!visto.has(it.cmd)) visto.set(it.cmd, []);
      visto.get(it.cmd).push(cat);
    }
    const dups = [...visto.entries()].filter(([, c]) => c.length > 1);
    t('0 duplicados entre submenus', dups.length === 0, dups.slice(0, 3).map(d => d[0]).join(','));
  }

  console.log('\n╔═══ 3. Aliases escondidos (só o canónico) ═══╗');
  {
    const aliases = allCmds.filter(c => sd.eAlias(c));
    t('há aliases a esconder (> 300)', aliases.length > 300);
    t('music é alias (fica só play)', sd.eAlias('music') === true);
    t('ytmp3 é alias', sd.eAlias('ytmp3') === true);
    t('figurinha é alias (fica só sticker)', sd.eAlias('figurinha') === true);
    t('play NÃO é alias (canónico)', sd.eAlias('play') === false);
    t('sticker NÃO é alias', sd.eAlias('sticker') === false);
    t('letra NÃO é escondida (é jogada da forca, não alias)', sd.eAlias('letra') === false);
    t('music não aparece em downloads', !sub.downloads.items.some(i => i.cmd === 'music'));
    t('play aparece em downloads', sub.downloads.items.some(i => i.cmd === 'play'));
  }

  console.log('\n╔═══ 4. Sub-categorias dentro dos submenus ═══╗');
  {
    const it = sub.downloads.items.find(i => i.cmd === 'play');
    t('play tem subcat 🎵 Música', it && it.subcat === '🎵 Música');
    const itv = sub.downloads.items.find(i => i.cmd === 'video');
    t('video tem subcat 🎬 Vídeo', itv && itv.subcat === '🎬 Vídeo');
    const itb = sub.admin.items.find(i => i.cmd === 'ban');
    t('ban tem subcat 🛡️ Moderação', itb && itb.subcat === '🛡️ Moderação');
    const ita = sub.admin.items.find(i => i.cmd === 'antilink');
    t('antilink tem subcat ⛔ Protecções', ita && ita.subcat === '⛔ Protecções (Anti-X)');
    const itz = sub.zoeira.items.find(i => i.cmd === 'analogica');
    t('analogica tem subcat 📏 Medidores', itz && itz.subcat === '📏 Medidores');
    const itr = sub.zoeira.items.find(i => i.cmd === 'rankanalogica');
    t('rankanalogica está com os medidores (zoeira)', !!itr);
  }

  console.log('\n╔═══ 5. renderSubmenu agrupa por secção ═══╗');
  {
    const t2 = ct.getTheme('dark');
    const out = RE.renderSubmenu(t2, 'DOWNLOADS', [
      { name: 'play', desc: 'Baixar música', group: '🎵 Música' },
      { name: 'video', desc: 'Baixar vídeo', group: '🎬 Vídeo' },
    ], { prefix: '!' });
    t('tem o cabeçalho da secção', out.includes('« 🎵 Música »') && out.includes('« 🎬 Vídeo »'));
    t('tem os comandos', out.includes('*!play*') && out.includes('*!video*'));
    const out2 = RE.renderSubmenu(t2, 'X', [{ name: 'ping', desc: 'latência' }], { prefix: '!' });
    t('sem group → flat (não rebenta)', out2.includes('*!ping*') && !out2.includes('«'));
  }

  console.log('\n╔═══ 6. Temas com molduras limpas (sem "fundo/skin") ═══╗');
  {
    const COMB = /[\u0300-\u036f\u0590-\u05cf\u0710-\u074f\u1ab0-\u1aff\u1dc0-\u1dff\u20d0-\u20ff\ufe20-\ufe2f]/;
    const sujos = [];
    for (const th of ct.listThemes()) {
      if (COMB.test((th.frame || []).join(''))) sujos.push(th.name);
    }
    t('nenhum tema com marcas de combinação na moldura', sujos.length === 0, sujos.join(','));
    t('31 temas com frame de 6 elementos', ct.listThemes().every(th => th.frame.length === 6));
    for (const n of ['ronin', 'cipher', 'sorcerer', 'phantom', 'rose', 'steel', 'pixel']) {
      const th = ct.getTheme(n);
      t(`${n} moldura limpa`, !COMB.test(th.frame.join('')) && th.frame.every(x => x.length >= 1));
    }
  }

  console.log(`\n${fail === 0 ? '🎉' : '⚠️ '} SUBMENUS ORGANIZADOS: ${ok} OK / ${fail} FALHOU\n`);
  process.exit(fail ? 1 : 0);
}, 3000);
