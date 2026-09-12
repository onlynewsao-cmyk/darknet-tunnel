#!/usr/bin/env node
/**
 * DARK BOT — CALLBACK com VOZ REAL (v7.2)
 *
 * Cobre SEM sessão real:
 *   • Dono + sessão VoIP → rejeita entrada e liga de volta (rtp_vivo_callback)
 *   • Sem sessão VoIP → cai no fluxo PTT (fala saudação por nota de voz)
 *   • Vídeo → nunca faz callback (cai no PTT)
 *   • Cooldown: 2.ª chamada em 60 s não volta a ligar
 *   • Não-dono sem modo explícito → não liga de volta (cai no PTT)
 *
 * Uso: node scripts/test-callback.js
 */
'use strict';

process.env.OWNER_NUMBER = '244945280380';

const path = require('path');
const Module = require('module');
const orig = Module.prototype.require;

// ── Fakes controláveis ─────────────────────────────────────────────
const fakeLive = {
  _disponivel: true,
  _sessao: true,
  _ligacoes: [],
  _resultado: null, // se definido, ligarAoVivo devolve isto
  async disponivel() { return this._disponivel; },
  temSessao() { return this._sessao; },
  async ligarAoVivo(numero, opts) {
    this._ligacoes.push({ numero, opts });
    return this._resultado || { ok: true, callId: 'cb-' + this._ligacoes.length, metodo: 'baileys-caller-rtp' };
  },
};

const fakeAi = {
  speakWithFallback: async () => Buffer.alloc(9000, 1),
  transcribeAudio: async () => 'oi',
  transcribeAssemblyAI: async () => ({ text: 'oi' }),
  chat: async () => 'resposta',
};

Module.prototype.require = function (id) {
  if (typeof id === 'string' && id.endsWith('liveVoip')) return fakeLive;
  if (typeof id === 'string' && id.endsWith('/ai')) return fakeAi;
  if (typeof id === 'string' && id.endsWith('botConfigCache')) {
    return { get: async (k, d) => d, set: async () => {} };
  }
  if (typeof id === 'string' && /models[/\\]/.test(id)) {
    const w = (v) => { const p = Promise.resolve(v); p.lean = () => p; p.sort = () => p; p.limit = () => p; return p; };
    return { find: () => w([]), findOne: () => w(null), countDocuments: async () => 0 };
  }
  return orig.apply(this, arguments);
};

const callHandler = require(path.join(__dirname, '..', 'src', 'bot', 'callHandler'));

let ok = 0, fail = 0;
const t = (n, c, e) => { e = e || ''; c ? ok++ : fail++; console.log('  ' + (c ? '✅' : '❌') + ' ' + n + (e ? ' → ' + String(e).slice(0, 90) : '')); };

// ── Sock fake ──────────────────────────────────────────────────────
function makeSock() {
  const sent = [];
  const rejected = [];
  return {
    sent,
    rejected,
    user: { id: '244949926074:79@s.whatsapp.net' },
    sendMessage: async (jid, content) => { sent.push({ jid, content }); return { key: { id: 'm' + sent.length } }; },
    rejectCall: async (callId, from) => { rejected.push({ callId, from }); },
    groupMetadata: async () => ({ participants: [] }),
  };
}

(async () => {
  // ══════════════════════════════════════════════════════════
  console.log('\n╔═══ 1. Dono + sessão VoIP → CALLBACK ═══╗');
  // ══════════════════════════════════════════════════════════
  {
    fakeLive._disponivel = true; fakeLive._sessao = true; fakeLive._ligacoes = []; fakeLive._resultado = null;
    callHandler._callbackCooldown.clear();
    const sock = makeSock();
    const r = await callHandler.onCall(sock,
      { id: 'c1', from: '244945280380@s.whatsapp.net', status: 'offer', isVideo: false },
      { ownerJid: '244945280380@s.whatsapp.net', ownerNumber: '244945280380', isOwner: true });
    t('modo atender', r.modo === 'atender', r.modo);
    t('fez callback de voz real', r.callback === true && r.metodo === 'rtp_vivo_callback', r.metodo);
    t('rejeitou a chamada de entrada', sock.rejected.length === 1 && sock.rejected[0].callId === 'c1', JSON.stringify(sock.rejected));
    t('ligou para o número certo', fakeLive._ligacoes.length === 1 && fakeLive._ligacoes[0].numero === '244945280380', JSON.stringify(fakeLive._ligacoes.map(x => x.numero)));
    t('saudação de callback (voz real)', (fakeLive._ligacoes[0].opts.saudacao || '').includes('na linha'), fakeLive._ligacoes[0].opts.saudacao);
  }

  // ══════════════════════════════════════════════════════════
  console.log('\n╔═══ 2. Sem sessão VoIP → PTT (fallback) ═══╗');
  // ══════════════════════════════════════════════════════════
  {
    fakeLive._disponivel = true; fakeLive._sessao = false; fakeLive._ligacoes = [];
    callHandler._callbackCooldown.clear();
    const sock = makeSock();
    const r = await callHandler.onCall(sock,
      { id: 'c2', from: '244945280380@s.whatsapp.net', status: 'offer', isVideo: false },
      { ownerJid: '244945280380@s.whatsapp.net', ownerNumber: '244945280380', isOwner: true });
    t('não fez callback', r.callback !== true, String(r.callback));
    t('falou a saudação por PTT', sock.sent.some(s => s.content.audio && s.content.ptt), JSON.stringify(sock.sent.map(s => Object.keys(s.content))));
  }

  // ══════════════════════════════════════════════════════════
  console.log('\n╔═══ 3. Vídeo → nunca callback ═══╗');
  // ══════════════════════════════════════════════════════════
  {
    fakeLive._disponivel = true; fakeLive._sessao = true; fakeLive._ligacoes = [];
    callHandler._callbackCooldown.clear();
    const sock = makeSock();
    const r = await callHandler.onCall(sock,
      { id: 'c3', from: '244945280380@s.whatsapp.net', status: 'offer', isVideo: true },
      { ownerJid: '244945280380@s.whatsapp.net', ownerNumber: '244945280380', isOwner: true });
    t('vídeo não faz callback', r.callback !== true, String(r.callback));
    t('vídeo → saudação PTT', sock.sent.some(s => s.content.audio && s.content.ptt), '');
  }

  // ══════════════════════════════════════════════════════════
  console.log('\n╔═══ 4. Cooldown 60s ═══╗');
  // ══════════════════════════════════════════════════════════
  {
    fakeLive._disponivel = true; fakeLive._sessao = true; fakeLive._ligacoes = [];
    callHandler._callbackCooldown.clear();
    const sock = makeSock();
    await callHandler.onCall(sock,
      { id: 'c4a', from: '244945280380@s.whatsapp.net', status: 'offer', isVideo: false },
      { ownerJid: '244945280380@s.whatsapp.net', ownerNumber: '244945280380', isOwner: true });
    const r2 = await callHandler.onCall(sock,
      { id: 'c4b', from: '244945280380@s.whatsapp.net', status: 'offer', isVideo: false },
      { ownerJid: '244945280380@s.whatsapp.net', ownerNumber: '244945280380', isOwner: true });
    t('1.ª ligou de volta', fakeLive._ligacoes.length === 1, String(fakeLive._ligacoes.length));
    t('2.ª dentro do cooldown não liga', r2.callback !== true, String(r2.callback));
  }

  // ══════════════════════════════════════════════════════════
  console.log('\n╔═══ 5. Não-dono sem modo explícito → PTT ═══╗');
  // ══════════════════════════════════════════════════════════
  {
    fakeLive._disponivel = true; fakeLive._sessao = true; fakeLive._ligacoes = [];
    callHandler._callbackCooldown.clear();
    const sock = makeSock();
    const r = await callHandler.onCall(sock,
      { id: 'c5', from: '244900000111@s.whatsapp.net', status: 'offer', isVideo: false },
      { ownerJid: '244945280380@s.whatsapp.net', ownerNumber: '244945280380', isOwner: false });
    t('estranho sem modo explícito não recebe callback', r.callback !== true, String(r.callback));
    // v7.44: desconhecido → rejeita em SILÊNCIO (sem PTT/texto) — anti-restrição Meta
    t('estranho desconhecido: rejeitado em silêncio (v7.44)', r.modo === 'silencio' && !sock.sent.some(s => s.content.audio || s.content.text), JSON.stringify(r));
  }

  // ══════════════════════════════════════════════════════════
  console.log('\n╔═══ 6. modoExplicito ═══╗');
  // ══════════════════════════════════════════════════════════
  {
    await callHandler.setMode('244900000222@s.whatsapp.net', 'atender');
    t('modo explícito detectado', callHandler.modoExplicito('244900000222@s.whatsapp.net') === true, '');
    t('modo não definido → false', callHandler.modoExplicito('244900000333@s.whatsapp.net') === false, '');
  }

  console.log('\n───────────────────────────────');
  console.log((fail === 0 ? '✅' : '❌') + ` ${ok} OK / ${fail} FALHOU\n`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error('💥 Erro no teste:', e);
  process.exit(1);
});
