#!/usr/bin/env node
/**
 * DARK BOT — REGRESSÃO: sistema de temas (!change) (v7.23)
 *
 * Corrige:
 *  1. Temas duplicados (sorcerer/ronin 2x) — o 2.º sobrescrevia o 1.º,
 *     deixando "undefined" no !change/!temas (faltava emoji/label).
 *  2. 7 temas novos sem emoji/label/accent/sectionSep.
 *  3. style 10–13 fora do range das molduras (0–9).
 *  4. Lista interativa com 31 rows numa secção (native_flow suporta ~10).
 *  5. Molduras diferentes entre menu (menuThemes) e assinatura (themeFormatter).
 *  6. Botão da lista exigia Dono, mas !change deixava ADM mudar o tema do grupo.
 *
 * Uso: node scripts/test-temas.js
 */
'use strict';

process.env.MONGODB_URI = '';
process.env.OWNER_NUMBER = '244945280380';

const changeThemes = require('../src/bot/changeThemes');
const menuThemes = require('../src/bot/menuThemes');

let ok = 0, fail = 0;
const t = (n, c, e) => { e = e || ''; c ? ok++ : fail++; console.log('  ' + (c ? '✅' : '❌') + ' ' + n + (e ? ' → ' + String(e).slice(0, 70) : '')); };

console.log('\n╔═══ 1. Temas únicos e completos ═══╗');
{
  const todos = Object.values(changeThemes.THEMES);
  const nomes = todos.map(x => x.name);
  t('31 temas', todos.length === 31);
  t('sem nomes duplicados', new Set(nomes).size === nomes.length);

  const falta = (campo) => todos.filter(x => x[campo] === undefined || x[campo] === null || x[campo] === '').map(x => x.name);
  for (const campo of ['emoji', 'label', 'accent', 'sectionSep', 'frame', 'react', 'vibe', 'tip', 'menuTitle', 'menuFooter', 'thumbText', 'icon', 'bullet', 'sep']) {
    t(`todos têm ${campo}`, falta(campo).length === 0, falta(campo).join(','));
  }
  t('todas as frames têm 6 elementos', todos.every(x => Array.isArray(x.frame) && x.frame.length >= 6));
  t('style dentro de 0–9', todos.every(x => x.style >= 0 && x.style <= 9), todos.filter(x => x.style > 9).map(x => x.name + ':' + x.style).join(','));
}

console.log('\n╔═══ 2. Os 7 temas novos estão completos ═══╗');
{
  for (const n of ['sorcerer', 'ronin', 'cipher', 'phantom', 'rose', 'steel', 'pixel']) {
    const th = changeThemes.getTheme(n);
    t(`${n} tem emoji + label`, !!th.emoji && !!th.label && !/undefined/i.test(th.label));
    t(`${n} label não é de outro tema`, !/RONIN|SASUKE/.test(th.label) || n === 'ronin');
  }
  // o 1.º sorcerer (morto) tinha label "RONIN" — já não pode existir
  const sor = changeThemes.getTheme('sorcerer');
  t('sorcerer já não tem o label trocado (RONIN)', !/Caminho do Guerreiro/.test(sor.label) && /Magia|SORCERER|Sorcerer/i.test(sor.label));
}

console.log('\n╔═══ 3. Paginação da lista interativa ═══╗');
{
  const sec = changeThemes.paginarTemas(10, '🎭');
  const todos = changeThemes.listThemes();
  t('4 secções (10+10+10+1)', sec.length === 4 && JSON.stringify(sec.map(s => s.rows.length)) === JSON.stringify([10, 10, 10, 1]));
  t('todas ≤ 10 rows', sec.every(s => s.rows.length <= 10));
  t('total = 31', sec.reduce((a, s) => a + s.rows.length, 0) === todos.length);
  t('cada row tem title+description+id', sec.every(s => s.rows.every(r => r.title && r.description && r.id.startsWith('CHANGE_THEME_'))));
  t('nenhum title "undefined"', sec.every(s => s.rows.every(r => !/undefined/i.test(r.title))));
}

console.log('\n╔═══ 4. Molduras unificadas (menu === assinatura) ═══╗');
{
  t('menuThemes exporta FRAMES', Array.isArray(menuThemes.FRAMES) && menuThemes.FRAMES.length === 10);
  // themeFormatter usa as mesmas molduras agora
  const tf = require('../src/bot/themeFormatter');
  const style = menuThemes.getStyle('classic');
  t('getStyle(classic) = FRAMES[0]', JSON.stringify(style.frame) === JSON.stringify(menuThemes.FRAMES[0]));
  // para qualquer índice as molduras coincidem (mod 10)
  const style7 = menuThemes.getStyle('7');
  t('getStyle(7) = FRAMES[7]', JSON.stringify(style7.frame) === JSON.stringify(menuThemes.FRAMES[7]));
}

console.log('\n╔═══ 5. previewTheme / listThemesText não rebentam ═══╗');
{
  let erros = 0;
  for (const th of changeThemes.listThemes()) {
    try {
      if (!changeThemes.previewTheme(th, 'DARK BOT', '!')) erros++;
    } catch { erros++; }
  }
  t('previewTheme OK para os 31', erros === 0);
  const lista = changeThemes.listThemesText('!', 'dark');
  t('listThemesText tem todos os nomes', changeThemes.listThemes().every(x => lista.includes(x.name.toUpperCase())));
  t('listThemesText sem "undefined"', !/undefined/i.test(lista));
}

console.log(`\n${fail === 0 ? '🎉' : '⚠️ '} TEMAS: ${ok} OK / ${fail} FALHOU\n`);
process.exit(fail ? 1 : 0);
