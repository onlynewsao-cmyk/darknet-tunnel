#!/usr/bin/env node
/**
 * v6.86 — AURA AVANÇADA: consciência social, aprendizagem,
 * anti-repetição, memória temporal e multi-intenção.
 */
'use strict';
process.env.NODE_ENV = 'development';
process.env.OWNER_NUMBER = '244945280380';
process.env.BOT_NUMBER = '244949926074';

const mongoose = require('mongoose');
mongoose.set('bufferTimeoutMS', 150);

let ok = 0, fail = 0;
const t = (n, c, e) => { c ? ok++ : fail++; console.log(`  ${c ? '✅' : '❌'} ${n}${e ? ' → ' + String(e).slice(0, 78) : ''}`); };

const G = '120363777@g.us';
const { messageCache } = require('../src/bot/messageListener');
const av = require('../src/aura/auraAvancada');

function _msg(id, texto, nome, num, minAtras = 2) {
  return {
    key: { id, remoteJid: G, fromMe: false, participant: num + '@s.whatsapp.net' },
    pushName: nome, message: { conversation: texto },
    messageTimestamp: Math.floor((Date.now() - minAtras * 60000) / 1000),
  };
}

(async () => {
  console.log('\n═══ 1. CONSCIÊNCIA SOCIAL — quem fala, tom, assunto ═══');
  messageCache.clear();
  messageCache.set('a1', _msg('a1', 'kkkkk mano esse jogo foi louco', 'Zeca', '244923111222', 3));
  messageCache.set('a2', _msg('a2', 'kkkk o gajo falhou um penalti', 'Ana', '244900000111', 2));
  messageCache.set('a3', _msg('a3', 'kkkkk não acredito', 'Zeca', '244923111222', 1));
  const cs = av.contextoSocial(G);
  t('identifica quem fala (topo = Zeca)', cs.falantes[0]?.nome === 'Zeca', JSON.stringify(cs.falantes));
  t('conta mensagens por pessoa', cs.falantes[0]?.n === 2, JSON.stringify(cs.falantes));
  t('tom da conversa = zoeira (kkk)', cs.tom === 'zoeira', cs.tom);
  t('silêncio curto medido', cs.silencioMin != null && cs.silencioMin <= 2, cs.silencioMin);
  const pp = av.contextoParaPrompt(G);
  t('prompt social menciona falantes', /A falar:.*Zeca/.test(pp), pp.slice(0, 80));

  console.log('\n═══ 2. APRENDE COM CORRECÇÕES ═══');
  const r1 = await av.aprenderRegra(G, 'aura não mandes emojis grandes');
  t('correcção vira regra', r1 != null, r1);
  const r2 = await av.aprenderRegra(G, 'bom dia pessoal');
  t('conversa normal NÃO vira regra', r2 === null, r2);
  const regras = await av.regrasDe(G);
  t('regrasDe devolve a regra', regras.includes('aura não mandes emojis grandes'), JSON.stringify(regras));

  console.log('\n═══ 3. ANTI-REPETIÇÃO ═══');
  av.registarFala(G, 'Oi amor, tô aqui 🖤');
  av.registarFala(G, 'Hehe 😊');
  const minhas = av.ultimasFalas(G);
  t('guarda as últimas falas dela', minhas.length === 2 && minhas[1] === 'Hehe 😊', JSON.stringify(minhas));

  console.log('\n═══ 4. FACTOS COM TEMPO ═══');
  const f1 = av.factoTemporal('meu aniversário é em março');
  t('aniversário detectado', f1?.tipo === 'aniversário' && /mar/.test(f1.quando), JSON.stringify(f1));
  const f2 = av.factoTemporal('amanhã tenho prova de matemática');
  t('evento de amanhã detectado', f2 != null && /amanh/.test(f2.quando), JSON.stringify(f2));
  t('facto sem tempo → null', av.factoTemporal('gosto de anime') === null);

  console.log('\n═══ 5. MULTI-INTENÇÃO ═══');
  const brain = require('../src/aura/auraBrain');
  const m1 = av.detectarMulti('reage com 🔥 a isso e ignora essa pessoa', brain);
  t('duas intenções na mesma frase', m1.length === 2, m1.map(x => x.id).join('+'));
  t('ordens certas', m1.some(x => x.id === 'reagir_msg') && m1.some(x => x.id === 'ignorar_pessoa'), m1.map(x => x.id).join('+'));
  const m2 = av.detectarMulti('bom dia pessoal', brain);
  t('conversa normal → 0 intenções', m2.length === 0, m2.length);

  console.log('\n═══ 6. CONSCIÊNCIA ENTRA NO PROMPT DA AURA ═══');
  const ai = require('../src/bot/ai');
  const origChat = ai.chat;
  let captured = '';
  ai.chat = async (texto, system) => { captured = system; return 'ok capturado'; };
  const aura = require('../src/aura/auraHuman');
  await aura.auraRespond('oi aura', {
    isOwner: true, isGroup: true, pushName: 'Dark', senderNumber: '244945280380',
    remoteJid: G, consciencia: 'REGRAS QUE APRENDESTES NESTE CHAT (obedeces-lhes):\n- aura não mandes emojis grandes',
  });
  ai.chat = origChat;
  t('prompt recebe as regras aprendidas', /não mandes emojis grandes/.test(captured));
  t('prompt recebe anti-repetição (falas dela)', /AS TUAS ÚLTIMAS FALAS|não repitas/i.test(captured) || !av.ultimasFalas(G).length);

  console.log('\n═══ 7. LEMBRAR COM TEMPO (memória que volta) ═══');
  const mem = require('../src/aura/auraMemory');
  const origGuardar = mem.guardar;
  const guardados = [];
  mem.guardar = async (num, texto, o) => { guardados.push(texto); return origGuardar(num, texto, o).catch(() => {}); };
  const exec = require('../src/aura/auraExec');
  const rl = await exec.executar('lembrar', 'que o meu aniversário é em março', {
    sock: null, ctx: { senderNumber: '244945280380', remoteJid: G }, texto: '', isOwner: true,
  });
  mem.guardar = origGuardar;
  t('confirma com o QUANDO', /vou lembrar-te/.test(rl.msg), rl.msg);
  t('facto temporal marcado na memória', guardados.some(g => /\[aniversário/.test(g)), JSON.stringify(guardados));

  console.log('\n══════════════════════════════════════════');
  console.log(fail === 0 ? `🎉 AURA AVANÇADA: ${ok} OK / 0 FALHOU` : `FALHOU: ${fail}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERRO:', e); process.exit(1); });
