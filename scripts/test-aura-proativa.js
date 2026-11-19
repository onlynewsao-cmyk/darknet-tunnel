#!/usr/bin/env node
/**
 * AURA PROATIVA — teste do motor de espontaneidade (v6.83)
 * Sem rede e sem MongoDB: sock falso, messageCache injectado,
 * GroupSettings duck-typed. A IA nunca é chamada (texto injectado).
 */
'use strict';

// Suite do comportamento legado: iniciativa por timer exige opt-in explícito.
process.env.AURA_PARTICIPATION = 'proactive';
process.env.NODE_ENV = 'development';
process.env.OWNER_NUMBER = '244945280380';
process.env.BOT_NUMBER = '244949926074';

const mongoose = require('mongoose');
mongoose.set('bufferTimeoutMS', 150); // falha rápido sem Mongo

const proativa = require('../src/aura/auraProativa');
const { messageCache } = require('../src/bot/messageListener');
const bcc = require('../src/bot/botConfigCache');
const GroupSettings = require('../src/database/models/GroupSettings');
const brain = require('../src/aura/auraBrain');
const config = require('../src/config');

const GRUPO = '120363000000@g.us';
const PV_DONO = config.owner.number + '@s.whatsapp.net';

let failed = 0, total = 0;
function ok(name, cond, extra) {
  total++;
  if (cond) console.log('  ✅', name);
  else { failed++; console.log('  ❌', name, extra || ''); }
}

// ── fakes ─────────────────────────────────────────────────────
const enviados = [];
const sock = {
  user: { id: '244949926074:1@s.whatsapp.net' },
  sendMessage: async (jid, c) => { enviados.push({ jid, text: c.text }); return { key: { id: 'x' } }; },
};
function _msg(id, jid, texto, tsMs, de = '244923111222@s.whatsapp.net', pushName = 'Zeca') {
  return {
    key: { id, remoteJid: jid, fromMe: false, participant: de },
    pushName, message: { conversation: texto },
    messageTimestamp: Math.floor(tsMs / 1000),
  };
}
const _origFind = GroupSettings.find.bind(GroupSettings);
function gruposAcordados(lista) {
  // A proactividade só pode existir em grupos com serviço activo.
  const activos = lista.map(g => ({
    isHosted: true, hostedUntil: new Date(Date.now() + 60_000), ...g,
  }));
  GroupSettings.find = () => ({
    select: () => ({ lean: async () => activos }),
  });
}
function semGrupos() {
  GroupSettings.find = () => ({ select: () => ({ lean: async () => [] }) });
}

const DIA = new Date(); DIA.setHours(15, 0, 0, 0);      // 15h — dia
const NOITE = new Date(); NOITE.setHours(23, 30, 0, 0);  // 23h30 — noite

(async () => {
  console.log('\n═══ 1. RITMO HUMANO (decisão) ═══');
  ok('23h é noite', proativa._eNoite(NOITE.getTime()) === true);
  ok('15h não é noite', proativa._eNoite(DIA.getTime()) === false);
  ok('sem histórico → nada a dizer', proativa._decidirGrupo({ msgs: [], silencioMin: 0 }, 0.01) === null);
  ok('grupo quieto 60min + apetece → quebrar_silencio',
    proativa._decidirGrupo({ msgs: [{}], silencioMin: 60 }, 0.1) === 'quebrar_silencio');
  ok('grupo quieto 60min + não apetece → calada',
    proativa._decidirGrupo({ msgs: [{}], silencioMin: 60 }, 0.9) === null);
  ok('grupo activo + sorte alta → não se mete',
    proativa._decidirGrupo({ msgs: [{}], silencioMin: 2 }, 0.5) === null);
  ok('grupo activo + apetece → comentario',
    proativa._decidirGrupo({ msgs: [{}], silencioMin: 2 }, 0.01) === 'comentario');

  console.log('\n═══ 2. SEM SESSÃO / NOITE / DESACTIVADA ═══');
  let r = await proativa.tick({ sock: {}, agora: DIA.getTime() });
  ok('sem sessão do WhatsApp → calada', r.ok === false && r.motivo === 'sem sessão', r.motivo);
  r = await proativa.tick({ sock, agora: NOITE.getTime(), sorte: 0 });
  ok('de noite → calada', r.ok === false && r.motivo === 'é noite', r.motivo);
  await bcc.set('aura_proactive_enabled', false);
  r = await proativa.tick({ sock, agora: DIA.getTime() });
  ok('interruptor desligado no dashboard → calada', r.ok === false && r.motivo === 'desactivada', r.motivo);
  await bcc.set('aura_proactive_enabled', true);

  console.log('\n═══ 3. QUEBRAR O SILÊNCIO NO GRUPO (onde está acordada) ═══');
  proativa.limparLimites();
  enviados.length = 0;
  messageCache.clear();
  gruposAcordados([{ groupJid: GRUPO, groupName: 'Grupo Teste' }]);
  // ela LEU isto há 60 minutos — e mais nada desde então
  messageCache.set('m1', _msg('m1', GRUPO, 'alguém viu o jogo ontem?', DIA.getTime() - 60 * 60000));
  messageCache.set('m2', _msg('m2', GRUPO, 'vi sim, esteve top', DIA.getTime() - 58 * 60000, '244900000111@s.whatsapp.net', 'Ana'));
  r = await proativa.tick({ sock, agora: DIA.getTime(), sorte: 0.1, texto: 'Esse jogo ontem... ainda estou a pensar naquela jogada. 😅' });
  ok('falou espontaneamente no grupo acordado', r.ok === true, JSON.stringify(r));
  ok('modo quebrar_silencio', r.modo === 'quebrar_silencio', r.modo);
  ok('mensagem foi para o grupo certo', enviados.length === 1 && enviados[0].jid === GRUPO, JSON.stringify(enviados));

  // Mesmo com opt-in global e histórico, um grupo que perdeu serviço não
  // entra na lista de candidatos e a AURA não inicia conversa lá.
  enviados.length = 0;
  GroupSettings.find = () => ({ select: () => ({ lean: async () => [{ groupJid: GRUPO, groupName: 'Expirado', isHosted: false }] }) });
  r = await proativa.tick({ sock, agora: DIA.getTime(), sorte: 0, sorteReacao: 0, texto: 'não enviar' });
  ok('grupo sem serviço: AURA proactiva permanece calada', r.ok === false && enviados.length === 0, JSON.stringify(r));
  gruposAcordados([{ groupJid: GRUPO, groupName: 'Grupo Teste' }]);

  console.log('\n═══ 4. LIMITE POR CHAT (não é rádio) ═══');
  r = await proativa.tick({ sock, agora: DIA.getTime() + 60000, sorte: 0.1, texto: 'outra vez' });
  ok('logo a seguir → respeita intervalo mínimo', r.ok === false && r.motivo === 'nada a dizer', JSON.stringify(r));
  r = await proativa.tick({ sock, agora: DIA.getTime() + (proativa.MIN_MINUTOS_PADRAO + 1) * 60000, sorte: 0.1, texto: 'passou o intervalo' });
  ok('passado o intervalo mínimo → volta a poder falar', r.ok === true, JSON.stringify(r));

  console.log('\n═══ 5. SEM HISTÓRICO → NUNCA INVENTA ═══');
  proativa.limparLimites();
  enviados.length = 0;
  messageCache.clear();   // ela não viu NADA naquele grupo
  r = await proativa.tick({ sock, agora: DIA.getTime(), sorte: 0.0, texto: 'não devia sair' });
  ok('grupo sem histórico → calada (não inventa)', r.ok === false && r.motivo === 'nada a dizer', JSON.stringify(r));
  ok('nada foi enviado', enviados.length === 0);

  console.log('\n═══ 6. MODO MUDO (ela própria se calou) ═══');
  proativa.limparLimites();
  messageCache.set('m3', _msg('m3', GRUPO, 'conversa qualquer', DIA.getTime() - 60 * 60000));
  brain.setModo(GRUPO, 'mudo', true);
  r = await proativa.tick({ sock, agora: DIA.getTime(), sorte: 0.1, texto: 'x' });
  ok('modo mudo activo → calada', r.ok === false, JSON.stringify(r));
  brain.setModo(GRUPO, 'mudo', false);

  console.log('\n═══ 7. PV DO DONO — check-in quando ele some ═══');
  proativa.limparLimites();
  enviados.length = 0;
  semGrupos();
  messageCache.clear();
  // Dark falou há 4h no PV
  messageCache.set('p1', _msg('p1', PV_DONO, 'oi amor', DIA.getTime() - 4 * 60 * 60000, '244945280380@s.whatsapp.net', 'Dark'));
  r = await proativa.tick({ sock, agora: DIA.getTime(), sorte: 0.1, texto: 'Meu Dark... sumiste. Tô aqui se precisares. 🖤' });
  ok('Dono ausente 4h → check-in no PV', r.ok === true && r.modo === 'pv', JSON.stringify(r));
  ok('mensagem foi para o PV do Dono', enviados.length === 1 && enviados[0].jid === PV_DONO, JSON.stringify(enviados));

  messageCache.clear();
  proativa.limparLimites();
  r = await proativa.tick({ sock, agora: DIA.getTime(), sorte: 0.1, texto: 'x' });
  ok('PV sem nenhuma mensagem vista antes → não dispara no vazio', r.ok === false, JSON.stringify(r));

  console.log('\n═══ 8. GRUPO ACTIVO — quase nunca se mete ═══');
  proativa.limparLimites();
  messageCache.clear();
  messageCache.set('m4', _msg('m4', GRUPO, 'agora mesmo', DIA.getTime() - 2 * 60000));
  r = await proativa.tick({ sock, agora: DIA.getTime(), sorte: 0.5, texto: 'x' });
  ok('conversa activa + sorte normal → deixa a conversa fluir', r.ok === false, JSON.stringify(r));

  console.log('\n═══ 9. TERRITÓRIO (v7.71) — todos menos quem dorme ═══');
  let _filtro = null;
  GroupSettings.find = (f) => { _filtro = f; return { select: () => ({ lean: async () => [] }) }; };
  await proativa.tick({ sock, agora: DIA.getTime(), sorte: 0.99, sorteReacao: 0.99 });
  ok('query exclui grupos adormecidos (sleep)', !!(_filtro && _filtro.auraMode && _filtro.auraMode.$ne === 'sleep'), JSON.stringify(_filtro));

  console.log('\n═══ 10. HUMOR MANDA (v7.71) ═══');
  const human = require('../src/aura/auraHuman');
  ok('mult feliz > normal > sonolenta', proativa._multHumor('feliz') === 1.5 && proativa._multHumor('normal') === 1 && proativa._multHumor('sonolenta') === 0.3);
  ok('decisão respeita mult (sonolenta cala)', proativa._decidirGrupo({ msgs: [{}], silencioMin: 60 }, 0.2, 0.3, proativa.NIVEIS.viva) === null);
  ok('decisão respeita mult (normal fala)', proativa._decidirGrupo({ msgs: [{}], silencioMin: 60 }, 0.2, 1, proativa.NIVEIS.viva) === 'quebrar_silencio');
  proativa.limparLimites();
  messageCache.clear();
  gruposAcordados([{ groupJid: GRUPO, groupName: 'Grupo Teste' }]);
  messageCache.set('mh', _msg('mh', GRUPO, 'e então?', DIA.getTime() - 60 * 60000));
  human.setMood('sonolenta', 'teste', GRUPO);
  r = await proativa.tick({ sock, agora: DIA.getTime(), sorte: 0.2, sorteReacao: 0.99, texto: 'x' });
  ok('sonolenta + sorte média → fica quieta', r.ok === false, JSON.stringify(r));
  human.setMood('normal', '', GRUPO);
  proativa.limparLimites();
  r = await proativa.tick({ sock, agora: DIA.getTime(), sorte: 0.2, sorteReacao: 0.99, texto: 'x' });
  ok('humor normal → volta a falar', r.ok === true && r.modo === 'quebrar_silencio', JSON.stringify(r));

  console.log('\n═══ 11. REACÇÃO ESPONTÂNEA (v7.71) ═══');
  proativa.limparLimites();
  enviados.length = 0;
  messageCache.clear();
  messageCache.set('mr', _msg('mr', GRUPO, 'que dia top, adorei', DIA.getTime() - 2 * 60000));
  r = await proativa.tick({ sock, agora: DIA.getTime(), sorte: 0.99, sorteReacao: 0.01 });
  ok('só reage (sem texto)', r.ok === true && r.modo === 'reacao' && r.reagiu?.jid === GRUPO, JSON.stringify(r));
  ok('react enviado ao grupo', enviados.length === 1 && enviados[0].jid === GRUPO && enviados[0].text === undefined, JSON.stringify(enviados));
  const n1 = enviados.length;
  r = await proativa.tick({ sock, agora: DIA.getTime() + 60000, sorte: 0.99, sorteReacao: 0.01 });
  ok('não repete reacção na mesma msg', enviados.length === n1, JSON.stringify(r));

  console.log('\n═══ 12. NÍVEL DE VIDA (v7.71) ═══');
  await bcc.set('aura_proactive_nivel', 'calma');
  proativa.limparLimites();
  messageCache.clear();
  messageCache.set('mn', _msg('mn', GRUPO, 'activa agora', DIA.getTime() - 2 * 60000));
  r = await proativa.tick({ sock, agora: DIA.getTime(), sorte: 0.2, sorteReacao: 0.99, texto: 'x' });
  ok('nível calma + conversa activa → não se mete', r.ok === false, JSON.stringify(r));
  await bcc.set('aura_proactive_nivel', 'viva');
  proativa.limparLimites();
  r = await proativa.tick({ sock, agora: DIA.getTime(), sorte: 0.2, sorteReacao: 0.99, texto: 'x' });
  ok('nível viva + mesma sorte → comenta', r.ok === true && r.modo === 'comentario', JSON.stringify(r));

  console.log('\n══════════════════════════════════════════════════');
  if (failed === 0) console.log(`🎉 AURA PROATIVA: ${total} OK / 0 FALHOU`);
  else console.log(`AURA PROATIVA: ${total - failed} OK / ${failed} FALHOU`);
  process.exit(failed === 0 ? 0 : 1);
})().catch(e => { console.error('ERRO:', e); process.exit(1); });
