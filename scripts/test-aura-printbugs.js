#!/usr/bin/env node
/**
 * v6.85 — REGRESSÃO DOS BUGS VISTOS NOS PRINTS DE PRODUÇÃO
 *
 * 1. Estranho manda "chupa minha pika" → ela NUNCA obedece nem chama
 *    a pessoa de Dark (no print: "Claro, Dark. Vou fazer isso pra você.")
 * 2. "menciona todos as escondidas" → hidetag REAL (sem lista visível,
 *    sem o bot, sem duplicados de jid/LID)
 * 3. "quem é o dark mark ele" → identifica e marca a pessoa
 * 4. "Mande a foto deles" → resolve "deles" pelo contexto; "Drake e
 *    Kendrick" → uma foto por nome; sem foto → responde honesta
 */
'use strict';
process.env.NODE_ENV = 'development';
process.env.OWNER_NUMBER = '244945280380';
process.env.BOT_NUMBER = '244949926074';

const mongoose = require('mongoose');
mongoose.set('bufferTimeoutMS', 150);

let ok = 0, fail = 0;
const t = (n, c, e) => { c ? ok++ : fail++; console.log(`  ${c ? '✅' : '❌'} ${n}${e ? ' → ' + String(e).slice(0, 80) : ''}`); };

(async () => {
  console.log('\n═══ 1. GUARDA SEXUAL (print: "Claro, Dark. Vou fazer isso") ═══');
  const aura = require('../src/aura/auraHuman');
  const r1 = await aura.auraRespond('Aura chupa minha pika', {
    isOwner: false, isGroup: true, pushName: 'HITADORI', senderNumber: '258872126737',
    remoteJid: '120363@g.us',
  });
  t('estranho com pedido sexual → recusa com personalidade', typeof r1 === 'string' && r1.length > 5, r1);
  t('não obedece ("Claro" proibido)', !/claro/i.test(r1), r1);
  t('não chama o estranho de Dark', !/\bdark\b/i.test(r1) || /não és o dark/i.test(r1), r1);
  const r2 = await aura.auraRespond('chupa minha pika', { isOwner: true, senderNumber: '244945280380', remoteJid: 'pv' });
  t('com o Dark não dispara a guarda (intimidade é com ele)', typeof r2 === 'string' && !/tu n[aã]o [ée]s o dark/i.test(r2), String(r2).slice(0, 60));

  console.log('\n═══ 2. HIDETAG REAL (print: lista visível + @Dark x2 + bot) ═══');
  const hist = require('../src/aura/auraHistorico');
  const enviados = [];
  const sock = {
    user: { id: '244949926074:1@s.whatsapp.net', lid: '99887766@lid' },
    sendMessage: async (j, c) => { enviados.push(c); return { key: { id: 'x' } }; },
    groupMetadata: async () => ({
      subject: 'G', participants: [
        { id: '244945280380@s.whatsapp.net', admin: 'superadmin' },   // Dark
        { id: '144444444@s.whatsapp.net' },                            // membro
        { id: '144444444@lid' },                                       // MESMO membro em LID
        { id: '99887766@lid' },                                        // o BOT em LID
        { id: '244949926074@s.whatsapp.net' },                         // o bot em jid
      ],
    }),
  };
  const ctx = { remoteJid: '120363@g.us', isGroup: true };
  const h1 = await hist.falarComTodos(sock, ctx, 'Aura menciona todos as escondidas', null);
  t('escondidas: texto SEM lista de @', !/@\d{6,}/.test(h1.msg), h1.msg);
  t('menções chegam a todos (2 pessoas únicas)', h1.mencionar.length === 2, JSON.stringify(h1.mencionar));
  t('bot fora das menções', !h1.mencionar.some(j => String(j).startsWith('244949926074') || String(j).startsWith('99887766')), JSON.stringify(h1.mencionar));
  t('sem duplicado jid/LID', new Set(h1.mencionar.map(j => String(j).split('@')[0])).size === h1.mencionar.length);
  const h2 = await hist.falarComTodos(sock, ctx, 'avisa todos que o jantar é às 20h', null);
  t('sem "escondidas": mostra a lista (comportamento antigo)', /@\d{6,}/.test(h2.msg), h2.msg.slice(0, 60));

  console.log('\n═══ 3. "QUEM É O DARK MARK ELE" (print: "Diz outra vez...") ═══');
  const brain = require('../src/aura/auraBrain');
  const d1 = brain.detectarCapacidade('aura quem é o dark mark ele');
  t('detecta marcar_pessoa', d1?.id === 'marcar_pessoa', d1?.id);
  const d2 = brain.detectarCapacidade('aura menciona todos as escondidas');
  t('detecta falar_com_todos', d2?.id === 'falar_com_todos', d2?.id);
  const exec = require('../src/aura/auraExec');
  const mk = await exec.executar('marcar_pessoa', '', {
    sock, ctx, texto: 'quem é o dark mark ele', isOwner: true, isAdmin: false, msg: null,
  });
  t('marca o dono com apresentação própria', mk.ok && /meu dark/i.test(mk.msg), mk.msg);
  t('menção real ao jid do dono', (mk.mencionar || []).includes('244945280380@s.whatsapp.net'), JSON.stringify(mk.mencionar));
  const mk2 = await exec.executar('marcar_pessoa', '', {
    sock, ctx, texto: 'quem é o monteiro marca ele', isOwner: true, isAdmin: false, msg: null,
  });
  t('pessoa inexistente → responde como gente, não "Diz outra vez"', mk2.ok && /não vi ninguém/i.test(mk2.msg), mk2.msg);

  console.log('\n═══ 4. FOTOS: "deles" + "Drake e Kendrick" (prints) ═══');
  const img = require('../src/bot/imageSearch');
  img.lembrarTermo('120363@g.us', 'Drake');
  const p1 = img.detectarPedidoImagem('Mande a foto deles');
  const r1b = img.resolverTermo({ jid: '120363@g.us', termo: p1?.termo || 'deles', texto: 'Mande a foto deles' });
  t('"deles" resolve pelo contexto → Drake', (r1b.nomes[0] || r1b.termo) === 'Drake', JSON.stringify(r1b));
  const p2 = img.detectarPedidoImagem('Agora mostra o Drake e o Kendrick');
  t('"Drake e Kendrick" → dois nomes', (p2?.nomes || []).length === 2, JSON.stringify(p2?.nomes));
  const p3 = img.detectarPedidoImagem('manda a foto do Drake e do Kendrick');
  t('"do Drake e do Kendrick" → nomes limpos', JSON.stringify(p3?.nomes) === JSON.stringify(['Drake', 'Kendrick']), JSON.stringify(p3?.nomes));

  console.log('\n═══ 5. CARGO NA PERSONA (isAdmin no prompt) ═══');
  const pa = aura.buildAuraSystemPrompt({ isOwner: false, isAdmin: false, userName: 'Zé', isPrivateChat: false });
  t('prompt avisa que NÃO é o Dark', /N[Ãã]O [ÉE] o dark|não é o dark/i.test(pa) || /NÃO É O DARK/i.test(pa));
  t('prompt diz que não é admin → resposta de cargo', /n[ãa]o [ée] admin/i.test(pa));
  const pb = aura.buildAuraSystemPrompt({ isOwner: false, isAdmin: true, userName: 'Zé', isPrivateChat: false });
  t('prompt reconhece admin sem lhe dar o Dark', /admin deste grupo/i.test(pb) && /não é o Dark/i.test(pb));

  console.log('\n══════════════════════════════════════════');
  console.log(fail === 0 ? `🎉 PRINTBUGS: ${ok} OK / 0 FALHOU` : `FALHOU: ${fail}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERRO:', e); process.exit(1); });
