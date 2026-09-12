#!/usr/bin/env node
/**
 * DARK BOT — REGRESSÃO: "<think> vazou" + "aceita o link do canal" (v7.15)
 *
 * Bug 1: o modelo reasoning devolvia o raciocínio bruto (`<think>Here's a
 *   thinking process…</think>`) e isso ia parar ao WhatsApp — nada o removia.
 * Bug 2: "Aura aceita o link de convite do canal" respondia "Já entrei"
 *   SEM entrar — a ordem do prompt ("o sistema já executou") fazia-a mentir.
 *
 * Cobre:
 *   • stripThinking (ai.js): remove think pareado, maiúsculo, sem fecho.
 *   • limparResposta (auraSanitizer) e _sanitize (auraModes) também limpam.
 *   • detectarCapacidade: "aceita o link/convite do canal" → aceitar_convite_canal.
 *   • aceitarConviteCanal: link no texto / link no cache / sem link (honesto).
 *   • RE_CANAL aceita wa.me/channel.
 *   • auraExec liga o caso.
 *
 * Uso: node scripts/test-aura-aceitarconvite.js
 */
'use strict';

process.env.OWNER_NUMBER = '244945280380';

const ai = require('../src/bot/ai');
const san = require('../src/aura/auraSanitizer');
const brain = require('../src/aura/auraBrain');
const canais = require('../src/aura/auraCanais');
const modes = require('../src/aura/auraModes');
const exec = require('../src/aura/auraExec');

let ok = 0, fail = 0;
const t = (n, c, e) => { e = e || ''; c ? ok++ : fail++; console.log('  ' + (c ? '✅' : '❌') + ' ' + n + (e ? ' → ' + String(e).slice(0, 70) : '')); };
const cap = (frase) => { const r = brain.detectarCapacidade(frase); return r ? r.id : null; };

(async () => {
  console.log('\n╔═══ 1. stripThinking — o <think> nunca chega ao WhatsApp ═══╗');
  {
    const leak = "<think>\nHere's a thinking process…\n1. Analyze…\n2. Draft…\n</think>\n\nJá entrei, meu Dark! 🖤";
    const r = ai.stripThinking(leak);
    t('remove <think>…</think> pareado', !/think/i.test(r) && r.includes('Já entrei'));
    t('não apaga a resposta real', r.trim() === 'Já entrei, meu Dark! 🖤');

    t('maiúsculas <THINK>', ai.stripThinking('<THINK>x</THINK>ok') === 'ok');
    t('sem fecho </think>', !/think/i.test(ai.stripThinking('<think>raciocínio sem fim…')) && ai.stripThinking('<think>raciocínio sem fim…') === '');
    t('texto normal intacto', ai.stripThinking('Olá, tudo bem?') === 'Olá, tudo bem?');
    t('"Here\u2019s a thinking process" isolado', ai.stripThinking("Here's a thinking process: oi") === 'oi');

    // sanitizer da AURA
    t('limparResposta remove think', !/think/i.test(san.limparResposta(leak)) && san.limparResposta(leak).includes('Já entrei'));
  }

  console.log('\n╔═══ 2. _sanitize do assistente também limpa ═══╗');
  {
    const aiPath = require.resolve('../src/bot/ai');
    const real = require.cache[aiPath];
    require.cache[aiPath] = {
      id: aiPath, filename: aiPath, loaded: true,
      exports: { chat: async () => "<think>pensando…</think>Olá, sou a assistente do DARK BOT." },
    };
    const r = await modes.assistantRespond('quem és?', { botName: 'DARK BOT', userName: 'Zé', prefix: '!' });
    t('assistente devolve sem <think>', r && !/think/i.test(r) && r.includes('assistente'));
    if (real) require.cache[aiPath] = real; else delete require.cache[aiPath];
  }

  console.log('\n╔═══ 3. Cérebro — "aceita o link do canal" ═══╗');
  {
    t('"aceita o link de convite do canal" → aceitar_convite_canal', cap('aceita o link de convite do canal') === 'aceitar_convite_canal');
    t('"aceita o convite do canal" → aceitar_convite_canal', cap('aceita o convite do canal') === 'aceitar_convite_canal');
    t('"aceita o link" → aceitar_convite_canal', cap('aceita o link') === 'aceitar_convite_canal');
    t('"entra nesse canal <link>" continua → entrar_link', cap('entra nesse canal https://whatsapp.com/channel/abc123456789012345') === 'entrar_link');
    t('é só do Dono', brain.POR_ID.get('aceitar_convite_canal').nivel === 'dono');
  }

  console.log('\n╔═══ 4. aceitarConviteCanal — executa de verdade ═══╗');
  {
    const { messageCache } = require('../src/bot/messageListener');
    const G = '123456789@g.us';
    const log = [];
    const sock = {
      user: { id: '5511999999999@s.whatsapp.net' },
      newsletterMetadata: async () => ({ id: '0029Canal@newsletter', name: 'Meu Canal', description: 'x', invite: 'conv1' }),
      newsletterFollow: async (jid) => { log.push(jid); },
    };

    let r = await canais.aceitarConviteCanal(sock, 'aceita https://whatsapp.com/channel/abc123456789012345', { remoteJid: G });
    t('link na mensagem → segue', r.ok && r.tipo === 'canal' && log.includes('0029Canal@newsletter'));

    // convite enviado antes, numa mensagem separada (cache)
    messageCache.clear();
    messageCache.set('m1', {
      key: { remoteJid: G, id: 'm1', fromMe: false }, pushName: 'Dark',
      messageTimestamp: 1700001000, message: { conversation: 'https://wa.me/channel/abc123456789012345' },
    });
    log.length = 0;
    r = await canais.aceitarConviteCanal(sock, 'aceita o link de convite do canal', { remoteJid: G });
    t('sem link no texto → acha o convite no chat (wa.me)', r.ok && log.includes('0029Canal@newsletter'));

    // sem link nenhum → NÃO finge
    messageCache.clear();
    log.length = 0;
    r = await canais.aceitarConviteCanal(sock, 'aceita o link de convite do canal', { remoteJid: G });
    t('sem link nenhum → pede o link (não finge "já entrei")', !r.ok && /manda o link|link do canal/i.test(r.msg) && log.length === 0);
  }

  console.log('\n╔═══ 5. auraExec — caso ligado ═══╗');
  {
    const log = [];
    const sock = {
      user: { id: '5511999999999@s.whatsapp.net' },
      newsletterMetadata: async () => ({ id: '0029Canal@newsletter', name: 'Meu Canal', invite: 'conv1' }),
      newsletterFollow: async (jid) => { log.push(jid); },
    };
    const r = await exec.executar('aceitar_convite_canal', null, {
      sock, msg: null, ctx: { remoteJid: 'pv@s.whatsapp.net', isGroup: false },
      texto: 'aceita https://whatsapp.com/channel/abc123456789012345', isOwner: true, isAdmin: false,
    });
    t('auraExec segue o canal', r.ok && log.includes('0029Canal@newsletter'));
  }

  console.log(`\n${fail === 0 ? '🎉' : '⚠️ '} ACEITAR CONVITE: ${ok} OK / ${fail} FALHOU\n`);
  process.exit(fail ? 1 : 0);
})();
