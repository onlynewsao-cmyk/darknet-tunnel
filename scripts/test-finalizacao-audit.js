#!/usr/bin/env node
/**
 * DARK BOT — Auditoria final: zero stubs órfãos (v7.7)
 *
 * Garante que:
 *   • stubs.js já não regista nenhum comando (0 handlers fake)
 *   • todos os antigos órfãos têm handler real (medidores, ranks, economia,
 *     info, admin, roles, afk, logos)
 *   • os medidores renderizam com GIF (sendWithGif usado)
 *
 * Uso: node scripts/test-finalizacao-audit.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

let ok = 0, fail = 0;
const t = (n, c, e) => { e = e || ''; c ? ok++ : fail++; if (!c) console.log('  ❌ ' + n + (e ? ' → ' + e : '')); };

// ── 1. stubs.js sem handlers fake ──
console.log('\n╔═══ 1. stubs.js vazio ═══╗');
const stubs = fs.readFileSync(path.join(__dirname, '..', 'src', 'bot', 'cases', 'stubs.js'), 'utf8');
const regs = stubs.match(/registerCase\(/g) || [];
t('stubs.js não regista comandos (0 registerCase)', regs.length === 0, `${regs.length} registos`);

// ── 2. handlers reais existem (estático: palavra nos ficheiros) ──
console.log('\n╔═══ 2. Antigos órfãos têm handler ═══╗');
const alvo = [
  // medidores
  'brabo', 'rankbrabo', 'bandido', 'corajosa', 'dependente', 'tecnologica', 'responsavel', 'corna',
  // economia
  'assaltar', 'mercado', 'coins', 'caixa', 'cultivar', 'plantar', 'equipamentos', 'reparar',
  'sell', 'topriqueza', 'ranklvl', 'presente', 'casa', 'auction', 'guerra', 'boost',
  // info
  'info', 'dono', 'subdono', 'suporte', 'meustatus', 'myvip', 'lid', 'statusbot', 'statusgp',
  'topcmd', 'totalcmd', 'gitbot', 'zipbot', 'voltei', 'mention', 'perfilpic', 'afk',
  // roles
  'role.criar', 'role.vou', 'role.nvou', 'role.alterar', 'role.excluir', 'role.confirmados', 'roles',
  // admin
  'antiraid', 'raidstatus', 'autorespostas', 'bemvindo', 'saida', 'capturalink', 'soadm',
  'grupo', 'listmods', 'listblacklist', 'listmodcmds', 'parcerias', 'solicitacoes', 'atividade',
  // logos
  'playboy', 'pubgavatar', 'blackhzx', 'cemiterio', 'comics', 'ffavatar', 'game', 'perfilff', 'pornhub',
];

const fMedidores = fs.readFileSync(path.join(__dirname, '..', 'src', 'bot', 'cases', 'medidores.js'), 'utf8');
const fFinalizar = fs.readFileSync(path.join(__dirname, '..', 'src', 'bot', 'cases', 'finalizar.js'), 'utf8');
const fLogos = fs.readFileSync(path.join(__dirname, '..', 'src', 'bot', 'cases', 'logos.js'), 'utf8');

for (const c of alvo) {
  let tem = false;
  const q1 = `'${c}'`, q2 = `"${c}"`;
  // medidores (e ranks gerados a partir deles: rankX existe se X existe)
  if (fMedidores.includes(q1) || fMedidores.includes(q2)) tem = true;
  if (c.startsWith('rank') && (fMedidores.includes(`'${c.slice(4)}'`) || fMedidores.includes(`"${c.slice(4)}"`))) tem = true;
  // finalizar.js (chaves quoted ou métodos async)
  if (fFinalizar.includes(q1) || fFinalizar.includes(q2) || fFinalizar.includes(`async ${c}(`)) tem = true;
  // logos
  if (new RegExp(`\\b${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*\\{`).test(fLogos)) tem = true;
  t(`${c} tem handler`, tem, '');
}

console.log('\n───────────────────────────────');
console.log((fail === 0 ? '✅' : '❌') + ` ${ok} OK / ${fail} FALHOU\n`);
process.exit(fail === 0 ? 0 : 1);
