#!/usr/bin/env node
/**
 * DARK BOT — AURA ETAPA 5 — VER O GRUPO / FALAR COM ALGUÉM
 *
 * Cobre:
 *   • Cérebro: quem_escreveu, o_que_escreveu, falar_com, falar_com_todos
 *     (e os negativos: "fala com todos" continua a ser modo; "responde a
 *     toda a gente" não é falar_com).
 *   • Permissões: as consultas são livres; falar_com/falar_com_todos só Dono.
 *   • auraHistorico com messageCache real preenchido:
 *     - quem escreveu isso? (citado) → autor 100% certo
 *     - quem escreveu X? → autor + texto exacto
 *     - quem escreveu Y (sem match) → "ninguém" definitivo
 *     - o que é que o João escreveu? → últimas mensagens dele
 *     - fala só com o João → menciona SÓ ele
 *     - fala com todos → menciona todos (menos o bot)
 *   • auraExec liga os casos aos executores.
 *
 * Uso: node scripts/test-aura-etapa5.js
 */
'use strict';

process.env.OWNER_NUMBER = '244945280380';

const brain = require('../src/aura/auraBrain');
const hist = require('../src/aura/auraHistorico');
const exec = require('../src/aura/auraExec');

let ok = 0, fail = 0;
const t = (n, c, e) => { e = e || ''; c ? ok++ : fail++; console.log('  ' + (c ? '✅' : '❌') + ' ' + n + (e ? ' → ' + String(e).slice(0, 70) : '')); };
const cap = (frase) => { const r = brain.detectarCapacidade(frase); return r ? r.id : null; };

const G = '123456789@g.us';
function encherCache() {
  const { messageCache } = require('../src/bot/messageListener');
  messageCache.clear();
  let ts = 1700000000;
  const add = (participant, pushName, text) => {
    ts += 60;
    messageCache.set('m' + ts, {
      key: { remoteJid: G, id: 'm' + ts, fromMe: false, participant },
      pushName, messageTimestamp: ts,
      message: { conversation: text },
    });
  };
  add('244945280380@s.whatsapp.net', 'João Silva', 'amanhã tem jogo no campo às 20h');
  add('244912345678@s.whatsapp.net', 'Maria Costa', 'eu levo as bebidas');
  add('244945280380@s.whatsapp.net', 'João Silva', 'alguém confirma?');
  add('244923456789@s.whatsapp.net', 'Pedro Mendes', 'confirmado, estou dentro');
  return messageCache;
}

const ctxGrupo = () => ({ remoteJid: G, isGroup: true, groupMeta: { participants: [] } });

(async () => {
  console.log('\n╔═══ 1. Cérebro — detecção ═══╗');
  {
    const casos = [
      ['quem escreveu isso?', 'quem_escreveu'],
      ['quem mandou essa mensagem?', 'quem_escreveu'],
      ['quem disse que amanhã tem jogo?', 'quem_escreveu'],
      ['o que é que o João escreveu?', 'o_que_escreveu'],
      ['o que o João mandou?', 'o_que_escreveu'],
      ['mostra o que a Maria falou', 'o_que_escreveu'],
      ['fala só com o João', 'falar_com'],
      ['responde apenas ao João', 'falar_com'],
      ['responde ao João', 'falar_com'],
      ['fala com o João que amanhã tem jogo', 'falar_com'],
      ['diz a todos que amanhã tem jogo', 'falar_com_todos'],
      ['avisa todos do grupo', 'falar_com_todos'],
      ['chama todos', 'falar_com_todos'],
      ['fala com todos que amanhã tem jogo', 'falar_com_todos'],
    ];
    for (const [f, esperado] of casos) t(`"${f}" → ${esperado}`, cap(f) === esperado, cap(f));

    const neg = [
      ['fala com todos', 'modo_todos'],
      ['responde a toda a gente', 'modo_todos'],
      ['volta a responder a toda a gente', null],
      ['status do grupo', null],
    ];
    for (const [f, esperado] of neg) t(`"${f}" NÃO vira falar_com`, cap(f) === esperado, cap(f));
  }

  console.log('\n╔═══ 2. Permissões ═══╗');
  {
    t('quem_escreveu é livre', brain.POR_ID.get('quem_escreveu').nivel === 'todos');
    t('o_que_escreveu é livre', brain.POR_ID.get('o_que_escreveu').nivel === 'todos');
    t('falar_com é só do Dono', brain.POR_ID.get('falar_com').nivel === 'dono');
    t('falar_com_todos é só do Dono', brain.POR_ID.get('falar_com_todos').nivel === 'dono');
    t('não-Dono não fala com todos',
      brain.podeFazer(brain.POR_ID.get('falar_com_todos'), { isOwner: false, isAdmin: false }).pode === false);
  }

  console.log('\n╔═══ 3. quemEscreveu — sem dúvida ═══╗');
  {
    encherCache();
    let r = await hist.quemEscreveu(null, ctxGrupo(), 'quem escreveu isso?', {
      message: { extendedTextMessage: { contextInfo: { participant: '244912345678@s.whatsapp.net', quotedMessage: { conversation: 'eu levo as bebidas' } } } },
    });
    t('citado → autor certo', r.ok && r.msg.includes('Maria Costa') && r.mencionar?.[0] === '244912345678@s.whatsapp.net');

    r = await hist.quemEscreveu(null, ctxGrupo(), 'quem escreveu amanhã tem jogo?', { message: {} });
    t('busca → autor + texto exacto', r.ok && r.msg.includes('João Silva') && r.msg.includes('amanhã tem jogo'));

    r = await hist.quemEscreveu(null, ctxGrupo(), 'quem escreveu zzz nada disto existe', { message: {} });
    t('sem match → responde com certeza', r.ok && /ninguém|ninguem/i.test(r.msg));

    r = await hist.quemEscreveu(null, ctxGrupo(), 'quem escreveu isso?', { message: {} });
    t('sem citação nem termo → não inventa', r.ok === false && !r.msg);
  }

  console.log('\n╔═══ 4. oQueEscreveu — histórias de alguém ═══╗');
  {
    let r = await hist.oQueEscreveu(null, ctxGrupo(), 'o que é que o João escreveu?', { message: {} });
    t('resolv eu por nome → lista as msgs', r.ok && r.msg.includes('João Silva') && r.msg.includes('alguém confirma?'));
    t('menciona a pessoa', r.mencionar?.[0] === '244945280380@s.whatsapp.net');

    r = await hist.oQueEscreveu(null, ctxGrupo(), 'o que é que o Zé escreveu?', { message: {} });
    t('nome inexistente → pede o nome certo', r.ok && /não encontrei|nao encontrei/i.test(r.msg));

    r = await hist.oQueEscreveu(null, ctxGrupo(), 'o que o 244923456789 mandou?', { message: {} });
    t('resolv eu por número', r.ok && r.msg.includes('Pedro Mendes'));
  }

  console.log('\n╔═══ 5. falarCom / falarComTodos ═══╗');
  {
    let r = await hist.falarCom(null, ctxGrupo(), 'fala só com o João que amanhã tem jogo', { message: {} });
    t('fala só com o João — menciona SÓ ele', r.ok && r.mencionar?.length === 1 && r.mencionar[0] === '244945280380@s.whatsapp.net' && r.msg.includes('amanhã tem jogo'));

    r = await hist.falarCom(null, ctxGrupo(), 'responde ao @244912345678', { message: {} });
    t('menção directa → fala com ela', r.ok && r.mencionar?.[0] === '244912345678@s.whatsapp.net');

    const sockFake = { user: { id: '99999@s.whatsapp.net' } };
    const ctxTodos = () => ({ remoteJid: G, isGroup: true, groupMeta: { participants: [
      { id: '244945280380@s.whatsapp.net' }, { id: '244912345678@s.whatsapp.net' },
      { id: '244923456789@s.whatsapp.net' }, { id: '99999@s.whatsapp.net' },
    ] } });
    r = await hist.falarComTodos(sockFake, ctxTodos(), 'diz a todos que amanhã tem jogo', { message: {} });
    t('fala com todos — menciona todos (3, sem o bot)', r.ok && r.mencionar?.length === 3 && !r.mencionar.includes('99999@s.whatsapp.net') && r.msg.includes('amanhã tem jogo'));
  }

  console.log('\n╔═══ 6. auraExec — casos ligados ═══╗');
  {
    encherCache();
    const sock = { user: { id: '99999@s.whatsapp.net' } };
    const base = { sock, msg: { message: {} }, ctx: { remoteJid: G, isGroup: true, groupMeta: { participants: [] } }, isOwner: true, isAdmin: false };

    let r = await exec.executar('quem_escreveu', null, { ...base, texto: 'quem escreveu eu levo as bebidas?' });
    t('auraExec quem_escreveu', r.ok && r.msg.includes('Maria Costa'));
    r = await exec.executar('o_que_escreveu', null, { ...base, texto: 'o que é que o João escreveu?' });
    t('auraExec o_que_escreveu', r.ok && r.msg.includes('João Silva'));
    r = await exec.executar('falar_com', null, { ...base, texto: 'fala só com o João que tá tudo?' });
    t('auraExec falar_com', r.ok && r.mencionar?.[0] === '244945280380@s.whatsapp.net');
  }

  console.log('\n╔═══ 7. Gate de voz ═══╗');
  {
    t('"fala só com o João" passa o gate', brain.pareceOrdem('fala só com o João') === true);
    t('"diz a todos que amanhã tem jogo" passa o gate', brain.pareceOrdem('diz a todos que amanhã tem jogo') === true);
    t('"avisa todos do grupo" passa o gate', brain.pareceOrdem('avisa todos do grupo') === true);
  }

  console.log(`\n${fail === 0 ? '🎉' : '⚠️ '} ETAPA 5: ${ok} OK / ${fail} FALHOU\n`);
  process.exit(fail ? 1 : 0);
})();
