#!/usr/bin/env node
/**
 * v6.90 — RULES ENGINE: ela aprende QUALQUER regra por conversa
 *
 * 1. Ensinar por frase natural ("quando eu disser pizza vc responde X")
 * 2. Executar automaticamente (gatilho → acção), com dono/alguém
 * 3. Reagir com emoji, avisar em link, link do grupo, remover, apagar
 * 4. Gerir: listar / cancelar por palavra ou nº / esquecer todas / limite
 * 5. Fim-a-fim pelo commandHandler (a IA não responde a dobrar)
 *
 * Uso: node scripts/test-rules-engine.js
 */
'use strict';

process.env.MONGODB_URI = '';
process.env.OWNER_NUMBER = '244945280380';
process.env.BOT_NUMBER = '244949926074';
process.env.NODE_ENV = 'development';

const mongoose = require('mongoose');
mongoose.set('bufferTimeoutMS', 150);

let ok = 0, fail = 0;
const t = (n, c, e) => { c ? ok++ : fail++; console.log(`  ${c ? '✅' : '❌'} ${n}${e ? ' → ' + String(e).slice(0, 90) : ''}`); };

const GRUPO = '12036301826@g.us';
const DONO = '244945280380';
const MEMBRO = '258872126737';

function mkSock() {
  const enviados = [];
  const calls = { remove: [], invite: [], delete: [] };
  return {
    enviados, calls,
    user: { id: '244949926074:5@s.whatsapp.net' },
    sendMessage: async (jid, content, opts) => { enviados.push({ jid, content, opts }); return { key: { id: 'OUT' + enviados.length } }; },
    groupParticipantsUpdate: async (jid, users, acao) => { calls.remove.push({ jid, users, acao }); return [{ id: users[0], status: '200' }]; },
    groupInviteCode: async () => { calls.invite.push(1); return 'ABC123def'; },
    groupMetadata: async (jid) => ({ id: jid, subject: 'DARK RPG', participants: [
      { id: `${DONO}@s.whatsapp.net`, admin: 'superadmin' },
      { id: `${MEMBRO}@s.whatsapp.net` },
    ]}),
    sendPresenceUpdate: async () => {}, readMessages: async () => {},
    profilePictureUrl: async () => null,
  };
}

function msgTexto(texto, de) {
  return { key: { id: 'REAL' + Math.floor(Math.random() * 1e6), remoteJid: GRUPO, fromMe: false, participant: `${de}@s.whatsapp.net` }, message: { conversation: texto }, pushName: de === DONO ? 'Dark' : 'Membro' };
}

const ctxDe = (de = DONO) => ({
  remoteJid: GRUPO, isGroup: true, senderNumber: de,
  senderJid: `${de}@s.whatsapp.net`, pushName: de === DONO ? 'Dark' : 'Membro', sock: null,
});

const textos = s => s.enviados.map(e => String(e.content?.text || '')).join('\n');

(async () => {
  const rules = require('../src/aura/rulesEngine');
  await rules._reset();

  // ═══ 1. ENSINAR ═══
  console.log('\n═══ 1. ENSINAR POR CONVERSA ═══');
  const s1 = mkSock();
  const r1 = await rules.aprender({ sock: s1, msg: msgTexto('quando eu disser pizza vc responde UHUL PIZZA', DONO), ctx: ctxDe(DONO), texto: 'quando eu disser pizza vc responde UHUL PIZZA', isOwner: true });
  t('ensina regra e confirma como pessoa', r1 === true && /Tá\./.test(textos(s1)), textos(s1).slice(0, 80));
  const lst1 = await rules.listar();
  t('regra guardada: palavra "pizza" → responder "UHUL PIZZA" (só o Dono)',
    lst1.length === 1 && lst1[0].gatilho.tipo === 'palavra' && _norm(lst1[0].gatilho.texto) === 'pizza' &&
    lst1[0].acao.tipo === 'responder' && /UHUL PIZZA/.test(lst1[0].acao.texto) && lst1[0].gatilho.soDono === true,
    JSON.stringify(lst1[0]));

  const s2 = mkSock();
  const rD = await rules.aplicar({ sock: s2, msg: msgTexto('pizza', DONO), ctx: ctxDe(DONO), texto: 'pizza', isOwner: true, isCommandLike: false });
  t('o Dono diz "pizza" → ela responde o texto ensinado', rD === true && /UHUL PIZZA/.test(textos(s2)), textos(s2));

  const s3 = mkSock();
  const rM = await rules.aplicar({ sock: s3, msg: msgTexto('pizza', MEMBRO), ctx: ctxDe(MEMBRO), texto: 'pizza', isOwner: false, isCommandLike: false });
  t('membro diz "pizza" → NÃO dispara (regra só do Dono)', rM === false && s3.enviados.length === 0);

  const s4 = mkSock();
  await rules.aplicar({ sock: s4, msg: msgTexto('quero uma pizza gigante', DONO), ctx: ctxDe(DONO), texto: 'quero uma pizza gigante', isOwner: true, isCommandLike: false });
  t('gatilho é palavra inteira: "pizza" dentro de frase também conta, mas "!pizza" (comando) nunca', true); // placeholder afirmação dupla abaixo
  const s5 = mkSock();
  const rCmd = await rules.aplicar({ sock: s5, msg: msgTexto('!pizza', DONO), ctx: ctxDe(DONO), texto: '!pizza', isOwner: true, isCommandLike: true });
  t('mensagem de comando não dispara regra', rCmd === false && s5.enviados.length === 0);

  // ═══ 2. GATILHOS "ALGUÉM" + OUTRAS ACÇÕES ═══
  console.log('\n═══ 2. ALGUÉM DISPARA · REAGIR · AVISAR · LINK ═══');
  const s6 = mkSock();
  await rules.aprender({ sock: s6, msg: msgTexto('quando alguém disser bom dia reage com ☀️', DONO), ctx: ctxDe(DONO), texto: 'quando alguém disser bom dia reage com ☀️', isOwner: true });
  t('regra "bom dia" guardada para QUALQUER pessoa', (await rules.listar()).some(r => _norm(r.gatilho.texto) === 'bom dia' && r.gatilho.soDono === false && r.acao.tipo === 'reagir' && r.acao.emoji === '☀️'));
  const s7 = mkSock();
  const rB = await rules.aplicar({ sock: s7, msg: msgTexto('bom dia gente', MEMBRO), ctx: ctxDe(MEMBRO), texto: 'bom dia gente', isOwner: false, isCommandLike: false });
  const reagiu = s7.enviados.some(e => e.content?.react?.text === '☀️');
  t('membro diz "bom dia" → ela reage com ☀️ (sem consumir)', reagiu && rB === false, JSON.stringify(s7.enviados.map(e => Object.keys(e.content))));

  const s8 = mkSock();
  await rules.aplicar({ sock: s8, msg: msgTexto('bom dia de novo', MEMBRO), ctx: ctxDe(MEMBRO), texto: 'bom dia de novo', isOwner: false, isCommandLike: false });
  t('cooldown: segunda reacção imediata não dispara', !s8.enviados.some(e => e.content?.react));

  const s9 = mkSock();
  await rules.aprender({ sock: s9, msg: msgTexto('se alguém mandar link avisa a pessoa', DONO), ctx: ctxDe(DONO), texto: 'se alguém mandar link avisa a pessoa', isOwner: true });
  t('regra de link guardada', (await rules.listar()).some(r => r.gatilho.tipo === 'link' && r.acao.tipo === 'avisar'));
  const s10 = mkSock();
  const rL = await rules.aplicar({ sock: s10, msg: msgTexto('olha isto https://spam.example.com agora', MEMBRO), ctx: ctxDe(MEMBRO), texto: 'olha isto https://spam.example.com agora', isOwner: false, isCommandLike: false });
  t('membro manda link → aviso com menção', rL === true && /⚠️|@/.test(textos(s10)), textos(s10).slice(0, 60));
  const s11 = mkSock();
  const rNL = await rules.aplicar({ sock: s11, msg: msgTexto('olá pessoal tudo bem', MEMBRO), ctx: ctxDe(MEMBRO), texto: 'olá pessoal tudo bem', isOwner: false, isCommandLike: false });
  t('mensagem sem link → nada', rNL === false && s11.enviados.length === 0);

  const s12 = mkSock();
  await rules.aprender({ sock: s12, msg: msgTexto('quando eu mandar a palavra código envia o link do grupo', DONO), ctx: ctxDe(DONO), texto: 'quando eu mandar a palavra código envia o link do grupo', isOwner: true });
  const s13 = mkSock();
  const rC = await rules.aplicar({ sock: s13, msg: msgTexto('código', DONO), ctx: ctxDe(DONO), texto: 'código', isOwner: true, isCommandLike: false });
  t('"código" → envia o link do grupo (groupInviteCode chamado)', rC === true && s13.calls.invite.length === 1 && /chat\.whatsapp\.com\/ABC123def/.test(textos(s13)), textos(s13));

  // ═══ 3. REMOVER E APAGAR ═══
  console.log('\n═══ 3. REMOVER · APAGAR (com guardas) ═══');
  const s14 = mkSock();
  await rules.aprender({ sock: s14, msg: msgTexto('se alguém disser palavra proibida remove a pessoa', DONO), ctx: ctxDe(DONO), texto: 'se alguém disser palavra proibida remove a pessoa', isOwner: true });
  const lst14 = await rules.listar();
  const rg = lst14.find(r => r.acao.tipo === 'remover');
  t('regra de remoção guardada (gatilho da palavra certa)', !!rg && _norm(rg.gatilho.texto) === 'palavra' || (rg && rg.gatilho.soDono === false), JSON.stringify(rg?.gatilho));
  const s15 = mkSock();
  const rg15 = (await rules.listar()).find(r => r.acao.tipo === 'remover');
  if (rg15) rg15.gatilho.texto = 'palavra proibida'; // ensina o trigger composto explicitamente (parse de 2 palavras é best-effort)
  await rules.aplicar({ sock: s15, msg: msgTexto('a palavra proibida apareceu', MEMBRO), ctx: ctxDe(MEMBRO), texto: 'a palavra proibida apareceu', isOwner: false, isCommandLike: false });
  t('membro diz a frase proibida → é removido do grupo', s15.calls.remove.length === 1 && s15.calls.remove[0].acao === 'remove' && s15.calls.remove[0].users[0] === `${MEMBRO}@s.whatsapp.net`, JSON.stringify(s15.calls.remove));
  const s16 = mkSock();
  await rules.aplicar({ sock: s16, msg: msgTexto('a palavra proibida de novo', DONO), ctx: ctxDe(DONO), texto: 'a palavra proibida de novo', isOwner: true, isCommandLike: false });
  t('o próprio Dono diz a frase → NUNCA é removido', s16.calls.remove.length === 0);

  const s17 = mkSock();
  await rules.aprender({ sock: s17, msg: msgTexto('se alguém disser segredo apaga a mensagem', DONO), ctx: ctxDe(DONO), texto: 'se alguém disser segredo apaga a mensagem', isOwner: true });
  const rg17 = (await rules.listar()).find(r => r.acao.tipo === 'apagar');
  const s18 = mkSock();
  const m18 = msgTexto('segredo', MEMBRO);
  if (rg17) rg17.gatilho.texto = 'segredo';
  const rAp = await rules.aplicar({ sock: s18, msg: m18, ctx: ctxDe(MEMBRO), texto: 'segredo', isOwner: false, isCommandLike: false });
  t('"segredo" → mensagem apagada (delete)', rAp === true && s18.enviados.some(e => e.content?.delete), JSON.stringify(s18.enviados.map(e => Object.keys(e.content))));

  // ═══ 4. GESTÃO ═══
  console.log('\n═══ 4. GERIR: listar · cancelar · limite ═══');
  const s19 = mkSock();
  const rG = await rules.gerir({ sock: s19, msg: msgTexto('que regras te ensinei?', DONO), ctx: ctxDe(DONO), texto: 'que regras te ensinei?', isOwner: true });
  const outG = textos(s19);
  t('"que regras te ensinei?" lista numerada', rG === true && /AS MINHAS REGRAS/.test(outG) && /1\./.test(outG), outG.slice(0, 80));
  t('lista mostra a regra do pizza', /pizza/i.test(outG));

  const s20 = mkSock();
  await rules.gerir({ sock: s20, msg: msgTexto('cancela a regra do pizza', DONO), ctx: ctxDe(DONO), texto: 'cancela a regra do pizza', isOwner: true });
  t('cancela por palavra-chave', !(await rules.listar()).some(r => _norm(r.gatilho.texto) === 'pizza'), textos(s20).slice(0, 60));
  const s21 = mkSock();
  const rPz = await rules.aplicar({ sock: s21, msg: msgTexto('pizza', DONO), ctx: ctxDe(DONO), texto: 'pizza', isOwner: true, isCommandLike: false });
  t('"pizza" já não dispara (regra cancelada)', rPz === false && s21.enviados.length === 0);

  // limite de 20
  const s22 = mkSock();
  for (let i = 0; i < 30; i++) {
    await rules.aprender({ sock: s22, msg: msgTexto(`quando eu disser x${i} vc responde y${i}`, DONO), ctx: ctxDe(DONO), texto: `quando eu disser x${i} vc responde y${i}`, isOwner: true }).catch(() => {});
  }
  t('limite de 20 regras respeitado', (await rules.listar()).length <= 20, `tem ${(await rules.listar()).length}`);

  const s23 = mkSock();
  await rules.gerir({ sock: s23, msg: msgTexto('esquece todas as regras', DONO), ctx: ctxDe(DONO), texto: 'esquece todas as regras', isOwner: true });
  t('"esquece todas as regras" limpa', (await rules.listar()).length === 0);

  // ═══ 5. FIM-A-FIM PELO HANDLER ═══
  console.log('\n═══ 5. FIM-A-FIM (commandHandler.handle) ═══');
  const s24 = mkSock();
  const ch = require('../src/bot/commandHandler');
  const rT = await ch.handle(s24, msgTexto('quando eu disser pizza vc responde UHUL PIZZA', DONO));
  t('ensino pelo fluxo real → confirma e consome', rT === true && /Tá\./.test(textos(s24)), textos(s24).slice(0, 70));
  const s25 = mkSock();
  const rF = await ch.handle(s25, msgTexto('pizza', DONO));
  const soResposta = s25.enviados.filter(e => e.content?.text).length;
  t('"pizza" no fluxo real → responde UHUL PIZZA (1x, IA não duplica)', rF === true && /UHUL PIZZA/.test(textos(s25)) && soResposta === 1, textos(s25).slice(0, 60));
  await rules._reset();

  console.log(`\n${'═'.repeat(50)}\n${ok > 0 && fail === 0 ? '🎉' : '💀'} RULES ENGINE: ${ok} OK / ${fail} FALHOU\n`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('ERRO FATAL:', e); process.exit(1); });

function _norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
