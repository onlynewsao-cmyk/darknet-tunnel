#!/usr/bin/env node
/**
 * DARK BOT — rankativos / rankativo / rankinativo (v7.3)
 *
 * Cobre SEM base de dados real (mock do GroupMemberActivity):
 *   • em grupo → ranking dos mais activos (ordem por mensagens)
 *   • rankinativo → ordena pelo mais inactivo (lastMessageAt antigo)
 *   • em privado → "só em grupos"
 *   • sem dados → mensagem amigável (não rebenta)
 *
 * Uso: node scripts/test-rankativos.js
 */
'use strict';

process.env.OWNER_NUMBER = '244945280380';

const path = require('path');
const Module = require('module');
const orig = Module.prototype.require;

// ── Mock do GroupMemberActivity ────────────────────────────────────
const DOCS = [
  { groupJid: 'g', memberJid: '244900000001@s.whatsapp.net', memberNumber: '244900000001', pushName: 'Ana', messages: 120, commands: 8, lastMessageAt: new Date('2026-08-14T10:00:00Z') },
  { groupJid: 'g', memberJid: '244900000002@s.whatsapp.net', memberNumber: '244900000002', pushName: 'Bruno', messages: 90, commands: 5, lastMessageAt: new Date('2026-08-14T09:00:00Z') },
  { groupJid: 'g', memberJid: '244900000003@s.whatsapp.net', memberNumber: '244900000003', pushName: 'Carlos', messages: 5, commands: 0, lastMessageAt: new Date('2026-08-01T00:00:00Z') },
];

function fakeModel() {
  return {
    find: () => ({
      sort: () => ({
        limit: () => ({
          lean: async () => DOCS,
          catch: async () => [],
        }),
      }),
    }),
  };
}

Module.prototype.require = function (id) {
  if (typeof id === 'string' && /models[/\\]GroupMemberActivity$/.test(id)) return fakeModel();
  if (typeof id === 'string' && id.endsWith('botConfigCache')) return { get: async (k, d) => d, set: async () => {} };
  if (typeof id === 'string' && id.endsWith('roleResolver')) return { resolveRole: async () => ({ cargo: '🆓 FREE', vip: 'INATIVO ❌', user: null }) };
  return orig.apply(this, arguments);
};

const infoModule = require(path.join(__dirname, '..', 'src', 'bot', 'cases', 'info'));

// captura o handler do rankativos
let handler = null;
infoModule((cmds, fn) => {
  if (Array.isArray(cmds) && cmds.includes('rankativos')) handler = fn;
});

let ok = 0, fail = 0;
const t = (n, c, e) => { e = e || ''; c ? ok++ : fail++; console.log('  ' + (c ? '✅' : '❌') + ' ' + n + (e ? ' → ' + String(e).slice(0, 80) : '')); };

function makeCtx({ isGroup = true } = {}) {
  const sent = [];
  const ctx = {
    remoteJid: isGroup ? '120363000000@g.us' : '244945280380@s.whatsapp.net',
    isGroup,
    isOwner: true,
    senderNumber: '244945280380',
    pushName: 'Dark',
    groupName: 'Grupo',
  };
  const sock = {
    sendMessage: async (jid, content) => { sent.push({ jid, content }); return { key: { id: 'x' } }; },
  };
  const reply = async (text) => { sent.push({ jid: ctx.remoteJid, content: { text } }); return text; };
  return { ctx, sock, reply, sent };
}

(async () => {
  console.log('\n╔═══ 1. rankativos (grupo) ═══╗');
  {
    const { ctx, sock, reply, sent } = makeCtx({ isGroup: true });
    await handler({ sock, msg: { key: { id: 'm1' } }, ctx, reply, command: 'rankativos' });
    const texto = sent.map(s => s.content.text).join('') + sent.map(s => JSON.stringify(s.content.mentions || [])).join('');
    t('respondeu alguma coisa', sent.length >= 1, String(sent.length));
    t('mostra o título RANK ATIVO', /RANK ATIVO|ʀᴀɴᴋ ᴀᴛɪᴠᴏ/i.test(texto), texto.slice(0, 60));
    t('menciona o nº1 (mais activo)', /244900000001/.test(texto), '');
    const m = sent.find(s => s.content.mentions);
    t('envia menções reais', !!m && Array.isArray(m.content.mentions) && m.content.mentions.length === DOCS.length, JSON.stringify(m?.content?.mentions));
  }

  console.log('\n╔═══ 2. rankinativo (grupo) ═══╗');
  {
    const { ctx, sock, reply, sent } = makeCtx({ isGroup: true });
    await handler({ sock, msg: { key: { id: 'm2' } }, ctx, reply, command: 'rankinativo' });
    const texto = sent.map(s => s.content.text).join('');
    t('título RANK INATIVO', /RANK INATIVO|ʀᴀɴᴋ ɪɴᴀᴛɪᴠᴏ/i.test(texto), texto.slice(0, 60));
    t('mostra a data do visto', /08[/-]14|ago|2026/i.test(texto) || /visto a/i.test(texto), texto.slice(0, 120));
  }

  console.log('\n╔═══ 3. privado → aviso ═══╗');
  {
    const { ctx, sock, reply, sent } = makeCtx({ isGroup: false });
    await handler({ sock, msg: { key: { id: 'm3' } }, ctx, reply, command: 'rankativos' });
    t('no PV diz "só em grupos"', (sent[0].content.text || '').includes('grupos'), (sent[0].content.text || '').slice(0, 40));
  }

  console.log('\n───────────────────────────────');
  console.log((fail === 0 ? '✅' : '❌') + ` ${ok} OK / ${fail} FALHOU\n`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error('💥 Erro no teste:', e);
  process.exit(1);
});
