/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║   DARK BOT — Comandos de CHAMADAS (v6.68)                   ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 *   .chamadas            → ver o modo actual e o estado
 *   .chamadas atender    → a AURA atende e conversa por voz
 *   .chamadas rejeitar   → rejeita com mensagem educada
 *   .chamadas ignorar    → deixa tocar, não faz nada
 *   .desligar            → termina a conversa de voz activa
 */
'use strict';

const config = require('../../config');

module.exports = function registerChamadas(registerCase) {

  registerCase(['chamadas', 'calls', 'modochamadas'], async ({ sock, msg, ctx, args, isOwner }) => {
    const call = require('../callHandler');
    const alvo = ctx.remoteJid;
    const acao = String(args?.[0] || '').toLowerCase();

    if (!acao) {
      const modo = await call.getMode(alvo, isOwner);
      const activa = call.chamadaActiva(alvo);
      const desc = {
        atender: '📞 *ATENDER* — eu atendo e converso por voz contigo',
        rejeitar: '🚫 *REJEITAR* — rejeito e peço para deixarem mensagem',
        ignorar: '🔕 *IGNORAR* — deixo tocar, não faço nada',
      };
      return sock.sendMessage(alvo, {
        text: '📞 *CHAMADAS — DARK BOT*\n' +
          '━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
          `Modo actual: ${desc[modo] || modo}\n` +
          (activa ? `\n🟢 *Conversa de voz activa* (${activa.turnos} turnos)\n` : '') +
          '\n*Mudar:*\n' +
          '• `.chamadas atender`\n' +
          '• `.chamadas rejeitar`\n' +
          '• `.chamadas ignorar`\n' +
          '• `.desligar` — termina a conversa activa\n\n' +
          '━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
          'ℹ️ *Como funciona o modo atender:*\n' +
          'O WhatsApp Web não deixa um bot entrar no áudio da\n' +
          'chamada (não há WebRTC no Baileys). O que eu faço é\n' +
          'assumir a chamada e falar contigo por notas de voz:\n' +
          'atendo, falo, ouço o que dizes, percebo e respondo\n' +
          'em áudio — conversa a sério, só que em PTT.',
      }, { quoted: msg });
    }

    if (!isOwner) {
      return sock.sendMessage(alvo, { text: '🚫 Só o Dono muda o modo das chamadas.' }, { quoted: msg });
    }

    const r = await call.setMode(alvo, acao);
    if (!r.ok) return sock.sendMessage(alvo, { text: '❌ ' + r.error }, { quoted: msg });

    const conf = {
      atender: '📞 A partir de agora *atendo* as chamadas e converso por voz.',
      rejeitar: '🚫 A partir de agora *rejeito* as chamadas com uma mensagem educada.',
      ignorar: '🔕 A partir de agora *ignoro* as chamadas.',
    };
    return sock.sendMessage(alvo, { text: conf[r.modo] }, { quoted: msg });
  }, true);

  // ── LIGAR — a AURA faz uma chamada (deep link) ────────────
  // O Baileys não tem WebRTC, por isso não há stream de áudio real.
  // O que fazemos: gerar um link `https://call.whatsapp.com/...` que a
  // pessoa clica e a chamada abre no WhatsApp dela para o nosso número.
  // v7.43: 'ligar'/'call' sem número são tratados em chamadaVoz.js (VoIP
  // real). Aqui fica o caminho antigo por NÚMERO: .ligarnum <número>.
  registerCase(['ligarnum', 'ligarnumero', 'callnum'], async ({ sock, msg, ctx, args, isOwner }) => {
    if (!isOwner) return sock.sendMessage(ctx.remoteJid, { text: '🚫 Só o Dono pode fazer chamadas.' }, { quoted: msg });

    const call = require('../callHandler');
    const numero = String(args?.[0] || '').replace(/\D/g, '');
    if (!numero || numero.length < 9) {
      return sock.sendMessage(ctx.remoteJid, {
        text: '📞 Uso: `.ligar <número>`\n\nEx: `.ligar 244912345678`\n\nGera um link de chamada que a pessoa clica para te ligar de volta.',
      }, { quoted: msg });
    }

    const jid = numero + '@s.whatsapp.net';
    const r = await call.ligar(sock, jid, { pushName: args.slice(1).join(' ') || numero });

    if (!r.ok) {
      return sock.sendMessage(ctx.remoteJid, { text: `❌ Não consegui criar a chamada: ${r.error}` }, { quoted: msg });
    }

    const comoFoi = r.tocou
      ? `📞 *A tocar!*\n\nEstou a ligar para ${numero} agora. O telemóvel está a tocar.`
      : `📞 *Chamada criada!*\n\nEnviei o link ao número ${numero}. Quando ele clicar, a chamada abre.`;

    return sock.sendMessage(ctx.remoteJid, {
      text: `${comoFoi}\n\nTipo: ${r.tipo === 'video' ? '📹 vídeo' : '📞 voz'}`,
    }, { quoted: msg });
  }, true);

  // ── VÍDEO — igual mas vídeo ───────────────────────────────
  // v6.70: 'video' ja e usado pelo downloads.js (ytmp4). Usa-se 'videocall'.
  registerCase(['videocall', 'chamada-video', 'vcall'], async ({ sock, msg, ctx, args, isOwner }) => {
    if (!isOwner) return sock.sendMessage(ctx.remoteJid, { text: '🚫 Só o Dono.' }, { quoted: msg });

    const call = require('../callHandler');
    const numero = String(args?.[0] || '').replace(/\D/g, '');
    if (!numero || numero.length < 9) {
      return sock.sendMessage(ctx.remoteJid, { text: '📹 Uso: `.video <número>`\n\nEx: `.video 244912345678`' }, { quoted: msg });
    }

    const jid = numero + '@s.whatsapp.net';
    const r = await call.ligar(sock, jid, { tipo: 'video', pushName: numero });

    if (!r.ok) {
      return sock.sendMessage(ctx.remoteJid, { text: `❌ Não consegui: ${r.error}` }, { quoted: msg });
    }

    return sock.sendMessage(ctx.remoteJid, {
      text: `📹 *Chamada de vídeo criada!*\n\nEnviei o link ao ${numero}.`,
    }, { quoted: msg });
  }, true);

  registerCase(['encerrar', 'desligarptt'], async ({ sock, msg, ctx }) => {   // v7.43: 'desligar' é da chamadaVoz
    const call = require('../callHandler');
    const c = call.terminar(ctx.remoteJid);
    return sock.sendMessage(ctx.remoteJid, {
      text: c
        ? `📞 Conversa terminada. Falámos ${c.turnos} ${c.turnos === 1 ? 'vez' : 'vezes'}.`
        : '📞 Não há nenhuma conversa de voz activa.',
    }, { quoted: msg });
  }, true);
};
