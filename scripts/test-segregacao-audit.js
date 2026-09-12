#!/usr/bin/env node
/**
 * DARK BOT — Segregação definitiva dos menus (regressão)
 *
 * v7.7 — Regras do Dono:
 *   • comandos 18+ ficam SÓ no menu18 (não aparecem em mais nenhum submenu)
 *   • acções directas (sel) = apenas toggles (on/off) e acções que iniciam
 *   • ADM só em admin · DONO só em owner (coberto por test:admin-dono)
 *
 * Uso: node scripts/test-segregacao-audit.js
 */
'use strict';

const sd = require('../src/bot/submenuData');

let ok = 0, fail = 0;
const t = (n, c, e) => { e = e || ''; c ? ok++ : fail++; if (!c) console.log('  ❌ ' + n + (e ? ' → ' + e : '')); };

console.log('\n╔═══ 1. 18+ ficam só no menu18 (categoria "18" = sem submenu) ═══╗');
const cmd18 = ['hentai','ximg','yande','kona','e621','nekos','erome','eromevid','livros18',
  'xvideo','xvideodl','adultvideo','adultsearch','adultapi','adultmode','adultstats',
  'buscar18','fig18','pack18','gif18','shorts18','hotchat','figbusca','packbusca','figgif','portal18','menu18'];
for (const c of cmd18) {
  t(`${c} → 18`, sd.categorize(c) === '18', `ficou em ${sd.categorize(c)}`);
}

console.log('\n╔═══ 2. Acções directas = toggles + iniciar acção ═══╗');
const deveSerSel = ['antilink','antiflood','welcome','open','close','adultmode','antidelete',
  'forca','quiz','dado','moeda','daily','trabalhar','saldo','coins','inventario','bingo'];
const naoDeveSerSel = ['ping','info','perfil','dono','donos','status','stats','uptime',
  'gay','lindo','feio','burro','corno','rico','safado','otaku','rank','rankglobal',
  'rankativos','menu','start','help','clima','cep'];
for (const c of deveSerSel) t(`${c} é sel`, sd.isSelectable(c) === true, 'não é sel');
for (const c of naoDeveSerSel) t(`${c} NÃO é sel`, sd.isSelectable(c) === false, 'é sel');

console.log('\n╔═══ 3. Donos continuam em owner · admins em admin ═══╗');
const donos = ['addcase','eval','shell','broadcast','send','runcase','downcase','espiao','godmode','dar','forjar'];
for (const c of donos) t(`${c} → owner`, sd.categorize(c) === 'owner', `ficou em ${sd.categorize(c)}`);
const admins = ['ban','kick','promote','demote','mute','warn','antilink','bemvindo','open','close','todos','hidetag','invokedono'];
for (const c of admins) t(`${c} → admin`, sd.categorize(c) === 'admin', `ficou em ${sd.categorize(c)}`);

console.log('\n───────────────────────────────');
console.log((fail === 0 ? '✅' : '❌') + ` ${ok} OK / ${fail} FALHOU\n`);
process.exit(fail === 0 ? 0 : 1);
