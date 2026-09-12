#!/usr/bin/env node
/**
 * AURA PROATIVA — teste do motor de espontaneidade (v6.83)
 * Sem rede e sem MongoDB: sock falso, messageCache injectado,
 * GroupSettings duck-typed. A IA nunca é chamada (texto injectado).
 */
'use strict';

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

let failed = 0;
function ok(name, cond, extra) {
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
  GroupSettings.find = () => ({
    select: () => ({ lean: async () => lista }),
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

  console.log('\n══════════════════════════════════════════════════');
  if (failed === 0) console.log('🎉 AURA PROATIVA: 22 OK / 0 FALHOU');
  else console.log(`FALHOU: ${failed}`);
  process.exit(failed === 0 ? 0 : 1);
})().catch(e => { console.error('ERRO:', e); process.exit(1); });
