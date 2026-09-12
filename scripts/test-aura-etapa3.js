#!/usr/bin/env node
/**
 * DARK BOT — AURA ETAPA 3 — STATUS, CANAIS E COMUNIDADES
 *
 * Cobre:
 *   • MAPA conversacional → comandos reais do bot:
 *     status do grupo → statusgp · status do bot → statusbot ·
 *     meu status → meustatus · sou vip → myvip · canal → ca ·
 *     ativos do grupo → checkativo · líderes → lider.
 *   • Cérebro (detectarCapacidade):
 *     ver_status (recado via USync), canal_info, canal_deixar,
 *     canal_seguir — e "status do grupo" NÃO vira ver_status.
 *   • auraActions: info/grupos da comunidade.
 *   • usync.lerStatus com socket mockado (PV, grupo, menção, sem recado).
 *   • auraCanais: infoCanal, deixarCanal, entrarPorLink (comunidade e grupo).
 *   • auraExec: os casos novos ligam às funções certas.
 *
 * Uso: node scripts/test-aura-etapa3.js
 */
'use strict';

process.env.OWNER_NUMBER = '244945280380';

const brain = require('../src/aura/auraBrain');
const cmds = require('../src/aura/auraCommands');
const acts = require('../src/aura/auraActions');
const usync = require('../src/bot/usync');
const canais = require('../src/aura/auraCanais');
const exec = require('../src/aura/auraExec');

let ok = 0, fail = 0;
const t = (n, c, e) => { e = e || ''; c ? ok++ : fail++; console.log('  ' + (c ? '✅' : '❌') + ' ' + n + (e ? ' → ' + String(e).slice(0, 70) : '')); };
const cmd = (frase) => { const r = cmds.detectarComando(frase); return r ? r.comando : null; };
const cap = (frase) => { const r = brain.detectarCapacidade(frase); return r ? r.id : null; };

(async () => {
  console.log('\n╔═══ 1. MAPA — status/informação → comandos reais ═══╗');
  {
    t('"status do grupo" → statusgp', cmd('status do grupo') === 'statusgp');
    t('"como está o grupo" → statusgp', cmd('como está o grupo') === 'statusgp');
    t('"status do bot" → statusbot', cmd('status do bot') === 'statusbot');
    t('"como vai o bot" → statusbot', cmd('como vai o bot') === 'statusbot');
    t('"o bot tá vivo?" → statusbot', cmd('o bot tá vivo?') === 'statusbot');
    t('"meu status" → meustatus', cmd('meu status') === 'meustatus');
    t('"como estou" → meustatus', cmd('como estou') === 'meustatus');
    t('"sou vip" → myvip', cmd('sou vip') === 'myvip');
    t('"qual é o teu canal" → ca', cmd('qual é o teu canal') === 'ca');
    t('"quem está ativo no grupo" → checkativo', cmd('quem está ativo no grupo') === 'checkativo');
    t('"líderes do grupo" → lider', cmd('líderes do grupo') === 'lider');
  }

  console.log('\n╔═══ 2. Permissão — informativos livres ═══╗');
  {
    const quem = { isOwner: false, isVip: false, isAdmin: false };
    for (const c of ['statusgp', 'statusbot', 'meustatus', 'myvip', 'ca', 'checkativo', 'lider', 'infoff']) {
      t(`"${c}" qualquer pessoa pode`, cmds.podeExecutar(c, quem).pode === true);
    }
  }

  console.log('\n╔═══ 3. Cérebro — ver_status / canal_info / canal_deixar ═══╗');
  {
    t('"qual é o meu recado" → ver_status', cap('qual é o meu recado') === 'ver_status');
    t('"qual é o teu status" → ver_status', cap('qual é o teu status') === 'ver_status');
    t('"status do João" → ver_status', cap('status do João') === 'ver_status');
    t('"status do grupo" NÃO é ver_status', cap('status do grupo') !== 'ver_status');
    t('"status do bot" NÃO é ver_status', cap('status do bot') !== 'ver_status');
    t('"como está o canal Dark News" → canal_info', cap('como está o canal Dark News') === 'canal_info');
    t('"info do canal" → canal_info', cap('info do canal') === 'canal_info');
    t('"deixa de seguir o canal X" → canal_deixar', cap('deixa de seguir o canal X') === 'canal_deixar');
    t('"deixa de seguir" NÃO é canal_seguir', cap('deixa de seguir o canal X') !== 'canal_seguir');
    t('"segue o canal X" → canal_seguir', cap('segue o canal X') === 'canal_seguir');
  }

  console.log('\n╔═══ 4. auraActions — informação da comunidade ═══╗');
  {
    const a1 = acts.detectarAcao('me dá informação da comunidade');
    t('"me dá informação da comunidade" → infoComunidade', a1?.acao === 'infoComunidade');
    const a2 = acts.detectarAcao('quais são os grupos da comunidade');
    t('"quais são os grupos da comunidade" → gruposComunidade', a2?.acao === 'gruposComunidade');
    const a3 = acts.detectarAcao('cria uma comunidade chamada Fans');
    t('"cria uma comunidade" continua a criar', a3?.acao === 'criarComunidade' && a3.valor === 'Fans');
  }

  console.log('\n╔═══ 5. usync.lerStatus (socket mockado) ═══╗');
  {
    const mk = (status, setAt) => ({
      user: { id: '5511999999999@s.whatsapp.net' },
      executeUSyncQuery: async () => ({ list: [{ id: 'x@s.whatsapp.net', status, setAt: setAt ? new Date(setAt) : null }] }),
    });
    let r = await usync.lerStatus(mk('Sou o Dark 🖤'), { ctx: { isGroup: false }, msg: null, texto: 'qual é o teu status' });
    t('PV — lê o meu recado', r.ok && r.msg.includes('Sou o Dark 🖤'));
    r = await usync.lerStatus(mk('Recado do dono'), { ctx: { isGroup: true, senderJid: '5511888888888@s.whatsapp.net' }, msg: null, texto: 'qual é o meu status' });
    t('grupo — lê o recado de quem perguntou', r.ok && r.msg.includes('Recado do dono'));
    r = await usync.lerStatus(mk(null), { ctx: { isGroup: false }, msg: null, texto: 'qual é o meu recado' });
    t('sem recado (null) → diz que não tem', r.ok && /não tenho recado/i.test(r.msg));
    r = await usync.lerStatus(mk('x'), { ctx: { isGroup: false }, msg: null, texto: 'status do João' });
    t('"status do João" sem menção → pede menção', !r.ok && /menciona/i.test(r.msg));
    r = await usync.lerStatus(mk('Recado do João'), {
      ctx: { isGroup: true, senderJid: 'x@s.whatsapp.net' },
      msg: { message: { extendedTextMessage: { contextInfo: { mentionedJid: ['5511777777777@s.whatsapp.net'] } } } },
      texto: 'status do João',
    });
    t('com menção → lê o recado da pessoa', r.ok && r.msg.includes('Recado do João'));
  }

  console.log('\n╔═══ 6. auraCanais — info / deixar / entrar ═══╗');
  {
    const sockCanal = {
      newsletterMetadata: async (type) => (type === 'invite'
        ? { id: '0029@newsletter', name: 'Dark News', description: 'Notícias', subscribers: 1234 }
        : { id: '0029@newsletter', name: 'Dark News', description: 'Notícias', subscribers: 1234 }),
    };
    let r = await canais.infoCanal(sockCanal, 'https://whatsapp.com/channel/abc123456789012345');
    t('infoCanal por link', r.ok && r.msg.includes('Dark News') && r.msg.includes('1234'));
    r = await canais.infoCanal(sockCanal, '0029@newsletter');
    t('infoCanal por jid', r.ok && r.msg.includes('Dark News'));

    const sockUnfollow = { newsletterUnfollow: async () => true, newsletterMetadata: async () => ({ id: '0029@newsletter', name: 'Dark News' }) };
    r = await canais.deixarCanal(sockUnfollow, 'https://whatsapp.com/channel/abc123456789012345');
    t('deixarCanal por link', r.ok);

    const sockCom = {
      communityGetInviteInfo: async () => ({ id: '123@g.us', subject: 'DARK VILLE', isCommunity: true }),
      communityAcceptInvite: async () => '123@g.us',
      groupGetInviteInfo: async () => ({ subject: 'grupo' }),
      groupAcceptInvite: async () => '456@g.us',
    };
    r = await canais.entrarPorLink(sockCom, 'entra https://chat.whatsapp.com/AbCdEfGhIjKlMnOpQrSt');
    t('entrarPorLink — comunidade', r.ok && r.tipo === 'comunidade' && r.nome === 'DARK VILLE');

    const sockGrupo = {
      communityGetInviteInfo: async () => { throw new Error('nope'); },
      communityAcceptInvite: async () => 'x@g.us',
      groupGetInviteInfo: async () => ({ subject: 'Amigos' }),
      groupAcceptInvite: async () => '456@g.us',
    };
    r = await canais.entrarPorLink(sockGrupo, 'entra https://chat.whatsapp.com/AbCdEfGhIjKlMnOpQrSt');
    t('entrarPorLink — grupo (fallback)', r.ok && r.tipo === 'grupo' && r.nome === 'Amigos');
  }

  console.log('\n╔═══ 7. auraExec — casos ligados ═══╗');
  {
    const sock = {
      user: { id: '5511999999999@s.whatsapp.net' },
      executeUSyncQuery: async () => ({ list: [{ id: 'x@s.whatsapp.net', status: 'Olá!', setAt: new Date() }] }),
      newsletterMetadata: async () => ({ id: '0029@newsletter', name: 'Dark News', description: 'd', subscribers: 5 }),
      newsletterUnfollow: async () => true,
    };
    const base = { sock, msg: null, ctx: { remoteJid: 'x@s.whatsapp.net', isGroup: false }, texto: '', isOwner: true, isAdmin: false };
    let r = await exec.executar('ver_status', null, { ...base, texto: 'qual é o teu status' });
    t('auraExec ver_status', r.ok && r.msg.includes('Olá!'));
    r = await exec.executar('canal_info', null, { ...base, texto: 'como está o canal https://whatsapp.com/channel/abc123456789012345' });
    t('auraExec canal_info', r.ok && r.msg.includes('Dark News'));
    r = await exec.executar('canal_deixar', null, { ...base, texto: 'deixa de seguir o canal https://whatsapp.com/channel/abc123456789012345' });
    t('auraExec canal_deixar', r.ok);
  }

  console.log(`\n${fail === 0 ? '🎉' : '⚠️ '} ETAPA 3: ${ok} OK / ${fail} FALHOU\n`);
  process.exit(fail ? 1 : 0);
})();
