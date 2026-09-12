#!/usr/bin/env node
/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║  DARK BOT v6.87 — REGRESSÃO DAS 3 FUNCIONALIDADES 🕸️         ║
 * ╚═══════════════════════════════════════════════════════════════╝
 *
 * 1. STICKER BAN POR APRENDIZAGEM (!bansticker)
 *    A identidade é o fileSha256 da metadata — aprender e reconhecer
 *    não descarregam nada.
 *
 * 2. GUARDA DE INSTRUÇÕES ("instruções ≠ comandos")
 *    Conversa que só MENCIONA uma acção deixava a AURA executá-la:
 *    "o ban foi injusto" corria `.ban`. Agora só ordens a sério.
 *
 * 3. GERADOR DE PERSONAGENS RPG POR SELECÇÃO
 *    !rpgstart em botões (raça → classe → confirmar) e a escolha é
 *    MESMO guardada (race/class não existiam no schema).
 */
'use strict';

process.env.NODE_ENV = 'development';
process.env.OWNER_NUMBER = '244945280380';
process.env.BOT_NUMBER = '244949926074';

const path = require('path');
const mongoose = require('mongoose');
mongoose.set('bufferTimeoutMS', 150);

let ok = 0, fail = 0;
const t = (n, c, e) => {
  c ? ok++ : fail++;
  console.log(`  ${c ? '✅' : '❌'} ${n}${e ? ' → ' + String(e).slice(0, 90) : ''}`);
};

const GRUPO = '120363000000000000@g.us';

// ── sock falso: regista tudo o que o bot "envia" ──────────────
function sockFalso() {
  const enviados = [];
  return {
    enviados,
    user: { id: '244949926074@s.whatsapp.net' },
    sendMessage: async (jid, content, opts) => { enviados.push({ jid, content, opts }); return { key: { id: 'X' } }; },
    relayMessage: async (jid, message) => { enviados.push({ jid, message }); return 'ok'; },
    groupMetadata: async () => ({ participants: [] }),
  };
}
const dump = (s) => JSON.stringify(s.enviados);

function msgSticker(hashBase64, opts = {}) {
  return {
    key: { remoteJid: GRUPO, fromMe: false, id: 'STK' + Math.random().toString(36).slice(2, 8), participant: '258870000000@s.whatsapp.net' },
    message: {
      stickerMessage: {
        fileSha256: Buffer.from(hashBase64, 'base64'),
        fileEncSha256: Buffer.from('enc' + hashBase64, 'base64'),
        isAnimated: !!opts.animated,
        mimetype: 'image/webp',
      },
    },
  };
}

(async () => {
  console.log('\n═══ 1. STICKER BAN POR APRENDIZAGEM (!bansticker) ═══');
  const anti = require('../src/bot/antiSticker');
  anti._reset();

  // 1 — a identidade vem da metadata, normalizada para base64
  const bytes = Buffer.from('identidade-da-figurinha-01');
  const norm = anti.normalizarHash(bytes);
  t('normaliza o hash em bytes para base64 (sem descarregar)',
    typeof norm === 'string' && norm.length > 10 && Buffer.from(norm, 'base64').equals(bytes), norm);

  // 2 — identidadeDe lê o fileSha256 do stickerMessage
  const alvo = msgSticker(bytes.toString('base64'), { animated: true });
  const id = anti.identidadeDe(alvo);
  t('lê a identidade da figurinha pela metadata',
    !!id && id.hash === norm && id.animated === true, JSON.stringify(id)?.slice(0, 60));

  // 3 — aprender + reconhecer
  await anti.setActivo(GRUPO, true);
  const r1 = await anti.aprender({
    groupJid: GRUPO, hash: id.hash, hashEnc: id.hashEnc, animated: true,
    addedByName: 'Dark', reason: 'spam',
  });
  t('aprende a figurinha e passa a reconhecê-la',
    r1.ok === true && r1.jaSabia === false && (await anti.estaBanido(GRUPO, id)) === true);

  // 4 — aprender duas vezes não duplica
  const r2 = await anti.aprender({ groupJid: GRUPO, hash: id.hash, hashEnc: id.hashEnc });
  const lista = await anti.listaDe(GRUPO);
  t('aprender duas vezes não duplica (diz que já sabia)',
    r2.jaSabia === true && lista.filter(x => x.hash === id.hash).length === 1, `lista=${lista.length}`);

  // 5 — o filtro apaga a figurinha aprendida e só essa
  const s1 = sockFalso();
  const outra = msgSticker(Buffer.from('figurinha-inocente').toString('base64'));
  const f1 = await anti.filtrar(s1, alvo);
  const f2 = await anti.filtrar(s1, outra);
  const apagou = s1.enviados.some(e => e.content?.delete?.id === alvo.key.id);
  t('apaga a figurinha aprendida e deixa passar as outras',
    f1.apagada === true && apagou && f2.apagada === false,
    `aprendida=${f1.apagada} delete=${apagou} outra=${f2.apagada}`);

  // 6 — desaprender
  const r3 = await anti.esquecer(GRUPO, { hash: id.hash });
  t('desaprende: volta a poder entrar',
    r3.ok === true && (await anti.estaBanido(GRUPO, id)) === false);

  console.log('\n═══ 2. GUARDA DE INSTRUÇÕES ("instruções ≠ comandos") ═══');
  const C = require('../src/aura/auraCommands');
  const G = require('../src/aura/auraInstructionGuard');

  // 7 — substantivo: "O ban foi injusto" não é uma ordem
  // (a regra do MAPA é apanhada do próprio MAPA — sem duplicar o regex)
  const regraBan = C.MAPA.find(([, cmd]) => cmd === 'ban')?.[0];
  const veredictoBan = G.classificar('o ban foi injusto', { comando: 'ban', regex: regraBan });
  t('"o ban foi injusto" não corre .ban',
    C.detectarComando('o ban foi injusto') === null
    && veredictoBan.ordem === false && veredictoBan.regra === 'substantivo',
    JSON.stringify(veredictoBan));

  // 8 — relato, negação e pergunta
  const falsasOrdens = [
    'ele marca golos todos os domingos',
    'não bana o rapaz, ele não fez nada',
    'quem é que ele expulsou ontem?',
    'a loja fecha às oito da noite',
  ];
  const vazaram = falsasOrdens.filter(f => C.detectarComando(f) !== null);
  t('relato/negação/pergunta não viram comando', vazaram.length === 0,
    vazaram.join(' | ') || `${falsasOrdens.length}/${falsasOrdens.length}`);

  // 9 — condicional e referência ao próprio comando
  const hipoteses = [
    'se ele apaga a mensagem, eu aviso o admin',
    'o que faz o comando ban?',
    'o antilink ativa sozinho quando há link',
  ];
  const vazaram2 = hipoteses.filter(f => C.detectarComando(f) !== null);
  t('hipótese e "falar do comando" não viram comando', vazaram2.length === 0,
    vazaram2.join(' | ') || `${hipoteses.length}/${hipoteses.length}`);

  // 10 — ordens A SÉRIO continuam a funcionar
  const ordens = [
    ['bane ele', 'ban'],
    ['marca todos', 'tagall'],
    ['aura fecha o grupo', 'fechar'],
    ['apaga essa mensagem', 'del'],
  ];
  const falharam = ordens.filter(([f, cmd]) => C.detectarComando(f)?.comando !== cmd);
  t('ordens a sério continuam a executar', falharam.length === 0,
    falharam.map(f => f[0]).join(' | ') || `${ordens.length}/${ordens.length}`);

  // 11 — comandos de leitura em forma de pergunta (a guarda não os toca)
  const leitura = [
    ['qual é o meu saldo?', 'saldo'],
    ['quem são os admins?', 'admins'],
    ['mostra o menu', 'menu'],
  ];
  const falharamL = leitura.filter(([f, cmd]) => C.detectarComando(f)?.comando !== cmd);
  t('perguntas de leitura continuam a responder', falharamL.length === 0,
    falharamL.map(f => f[0]).join(' | ') || `${leitura.length}/${leitura.length}`);

  console.log('\n═══ 3. GERADOR DE PERSONAGENS RPG POR SELECÇÃO ═══');

  // 12 — o clique da lista volta como id reconhecível e está interceptado
  //      no commandHandler (mecanismo RPGPICK_ do v6.89, o mesmo do
  //      CHANGE_THEME_ — já provado em produção).
  const chSrc = require('fs').readFileSync(
    path.join(__dirname, '..', 'src', 'bot', 'commandHandler.js'), 'utf8');
  t('os cliques RPGPICK_ estão interceptados no commandHandler',
    /RPGPICK_\[RC\]/.test(chSrc) && /createFlow/.test(chSrc));

  // jogador falso — o motor é substituído para não precisar de Mongo,
  // mas o createFlow corre a sério.
  const rpg = require('../src/bot/rpg/engine');
  const jogador = {
    whatsappNumber: '244945280380', name: 'Aventureiro',
    stats: { str: 6, dex: 6, int: 6, vit: 6, luk: 6 },
    level: 1, xp: 0, hp: 150, maxHp: 150, mp: 80, maxMp: 80,
    inventory: [], kills: 0, deaths: 0,
    save: async () => {},
  };
  rpg.getPlayer = async () => jogador;
  rpg.savePlayer = async () => {};

  const flow = require('../src/bot/rpg/createFlow');
  const s2 = sockFalso();
  const ctxFluxo = {
    remoteJid: GRUPO, isGroup: true, senderJid: '244945280380@s.whatsapp.net',
    senderNumber: '244945280380', pushName: 'Dark', isOwner: true, prefix: '!',
  };
  const msgFluxo = { key: { remoteJid: GRUPO, fromMe: false, id: 'C1' }, message: {} };

  // Nota: com um sock de teste o `relayMessage` interactivo não está
  // disponível e o createFlow cai no fallback de texto (é a cascata
  // prevista). O que se afirma aqui é o comportamento que é igual nos
  // dois caminhos: as opções são apresentadas e a escolha fica pendente.
  flow.pendentes().clear();
  await flow.start({ sock: s2, msg: msgFluxo, ctx: ctxFluxo, args: ['Kira'] });
  const saidaRacas = dump(s2);
  const pend1 = flow.pendentes().get('244945280380');
  s2.enviados.length = 0;
  await flow.pick({ sock: s2, msg: msgFluxo, ctx: ctxFluxo, token: 'RPGPICK_R_shinobi' });
  const saidaClasses = dump(s2);
  const pend2 = flow.pendentes().get('244945280380');
  t('!rpgstart apresenta as raças e depois as classes',
    /shinobi/i.test(saidaRacas) && /pirata/i.test(saidaRacas) && pend1?.name === 'Kira'
    && /classe/i.test(saidaClasses) && pend2?.race === 'shinobi',
    `pendente1=${JSON.stringify(pend1)} pendente2=${JSON.stringify(pend2)}`);

  // 13 — escolher a classe cria mesmo o personagem
  s2.enviados.length = 0;
  await flow.pick({ sock: s2, msg: msgFluxo, ctx: ctxFluxo, token: 'RPGPICK_C_pirata' });
  t('escolher a classe cria o personagem',
    jogador.race === 'shinobi' && jogador.class === 'pirata',
    `race=${jogador.race} class=${jogador.class}`);

  // 14 — e sobrevive no documento (o schema tinha de ter os campos)
  const RPGPlayer = require('../src/database/models/RPGPlayer');
  const doc = new RPGPlayer({ whatsappNumber: '244945280380' });
  doc.race = jogador.race; doc.class = jogador.class;
  const gravado = doc.toObject();
  t('raça e classe sobrevivem no documento (schema)',
    gravado.race === 'shinobi' && gravado.class === 'pirata'
    && !!RPGPlayer.schema.path('race') && !!RPGPlayer.schema.path('class'),
    `documento: race=${gravado.race} class=${gravado.class}`);

  console.log(`\n  ${ok} OK / ${fail} FALHOU\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => {
  console.error('\n💥 teste rebentou:', e.message);
  process.exit(1);
});
