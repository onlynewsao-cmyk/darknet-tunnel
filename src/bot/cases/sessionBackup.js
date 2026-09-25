/**
 * v12.9.3 — GUARDAR/RESTAURAR SESSÃO (só Dono)
 * .savesess              → snapshot agora + mostra estatística dos backups
 * .savesess listar       → lista backups disponíveis
 * .loadsess              → restaura o backup mais recente (se a sessão morreu)
 * .loadsess forcar       → restaura sobrescrevendo a sessão actual
 */
'use strict';

async function tReply(sock, msg, ctx, title, lines) {
  const RE = require('../renderEngine');
  const t = await RE.getTheme(ctx.remoteJid);
  return sock.sendMessage(ctx.remoteJid, { text: RE.renderBlock(t, title, lines.filter(Boolean), { botName: require('../../config').bot.name }) }, { quoted: msg });
}

module.exports = function register(registerCase) {
  registerCase(['savesess', 'guardsess', 'backupsess'], async ({ sock, msg, ctx, args }) => {
    const sb = require('../sessionBackup');
    const sub = String(args[0] || '').toLowerCase();
    if (sub === 'listar' || sub === 'list') {
      const lista = await sb.listar();
      if (!lista.length) return tReply(sock, msg, ctx, '💾 SESSÕES GUARDADAS', ['Nenhum backup ainda. Usa *.savesess* pra criar o primeiro.']);
      return tReply(sock, msg, ctx, '💾 SESSÕES GUARDADAS', lista.map((b, i) =>
        `${i === 0 ? '⭐' : `${i + 1}.`} ${new Date(b.criadoEm).toLocaleString('pt-PT')} — ${b.valido ? '✅' : '⚠️'} ${b.docs} docs (${b.origem})${b.nota ? ' · ' + b.nota : ''}`
      ).concat(['', '> .loadsess restaura o mais recente']));
    }
    await sock.sendMessage(ctx.remoteJid, { react: { text: '💾', key: msg.key } });
    const r = await sb.guardar('manual', 'por .savesess');
    if (!r.ok) return tReply(sock, msg, ctx, '💾 GUARDAR SESSÃO', [`❌ ${r.motivo === 'sessao-vazia' ? 'não há sessão para guardar (bot não pareado?)' : r.motivo}`]);
    await tReply(sock, msg, ctx, '💾 SESSÃO GUARDADA', [
      `✅ Snapshot criado — *${r.docs} documentos* ${r.valido ? '✅ válidos' : '⚠️ suspeitos'}`,
      '🛡️ A sessão do WhatsApp agora sobrevive a: reset do servidor, troca de código, clearSession acidental.',
      '📜 Backups mantidos: últimos 10 (auto a cada 6h + no arranque diário)',
      '> .savesess listar · .loadsess restaura',
    ]);
    await sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } });
  });

  registerCase(['loadsess', 'restaursess', 'recuperarsess'], async ({ sock, msg, ctx, args }) => {
    const sb = require('../sessionBackup');
    const forcar = /forca|forçar|forcar|overwrite/i.test(args.join(' '));
    await sock.sendMessage(ctx.remoteJid, { react: { text: '⏳', key: msg.key } });
    const r = await sb.restaurar({ forcar });
    if (!r.ok) {
      if (r.motivo === 'ja-tem-sessao') return tReply(sock, msg, ctx, '🔁 RESTAURAR SESSÃO', ['ℹ️ ' + r.msg]);
      if (r.motivo === 'sem-backup') return tReply(sock, msg, ctx, '🔁 RESTAURAR SESSÃO', ['❌ Nenhum backup válido.', '> Cria um com *.savesess* enquanto a sessão está viva.']);
      return tReply(sock, msg, ctx, '🔁 RESTAURAR SESSÃO', ['❌ ' + r.motivo]);
    }
    await tReply(sock, msg, ctx, '🔁 SESSÃO RESTAURADA', [
      `✅ ${r.restaurados} documentos restaurados (backup de ${new Date(r.criadoEm).toLocaleString('pt-PT')})`,
      '🔄 Reinicia o bot pra ligar com a sessão restaurada — deve conectar SEM QR.',
    ]);
    await sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } });
  });
};
