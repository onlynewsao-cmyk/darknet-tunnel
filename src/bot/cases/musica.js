/**
 * DARK BOT — case 'som' (cartão de música descartável, v7.21)
 * =============================================================
 *   !som Parabéns kizomba
 *
 * Mostra a CAPA da música + título/duração/views/publicação/canal e
 * espera o utilizador responder com o número:
 *   01 → áudio 🎧    02 → documento 📁    03 → voz 🎤
 *
 * v7.22: !somcode envia o CÓDIGO COMPLETO da case (portável para
 * outros bots) como ficheiro .js.
 */
'use strict';

const musicaCard = require('../musicaCard');

module.exports = function registerMusica(registerCase) {
  registerCase(['som', 'song', 'faixa', 'track', 'musik', 'disco'], async ({
    sock, m, msg, ctx, text, prefix, react,
  }) => {
    const q = String(text || '').trim();
    if (!q) {
      return m.reply([
        '🎵 *Buscar música*',
        '',
        'Exemplo: `' + prefix + 'som Parabéns kizomba`',
        '',
        'Depois responde *01*, *02* ou *03* para o formato.',
      ].join('\n'));
    }

    react('⏳').catch(() => {});
    try {
      const v = await musicaCard.buscar(q);
      await musicaCard.mostrar(sock, msg, ctx, v);
      react('✅').catch(() => {});
    } catch (e) {
      react('❌').catch(() => {});
      return m.reply('❌ ' + String(e?.message || e).slice(0, 120));
    }
  });

  // ═══ v7.22: código completo da case (para outros bots) ═══
  registerCase(['somcode', 'codsom', 'codesom'], async ({ sock, m, msg, ctx, isOwner }) => {
    if (!isOwner) return m.reply('🚫 Só o Dono.');
    try {
      const fs = require('fs');
      const path = require('path');
      const ficheiro = path.join(__dirname, '..', '..', 'exports', 'case-som-portavel.js');
      const buf = fs.readFileSync(ficheiro);
      await sock.sendMessage(ctx.remoteJid, {
        document: buf,
        fileName: 'case-som-portavel.js',
        mimetype: 'application/javascript',
        caption: '📦 *CASE `som` — CÓDIGO COMPLETO (portável)*\n\n' +
          'Cola noutro bot Baileys. Adapta só o que está marcado com *ADAPTE AQUI* (fonte, download, prefixo) — o resto funciona como está.\n\n' +
          'Comandos: `!som` busca + capa; responde *01*/*02*/*03* para o formato.',
      }, { quoted: msg });
    } catch (e) {
      return m.reply('❌ ' + String(e?.message || e).slice(0, 120));
    }
  });
};
