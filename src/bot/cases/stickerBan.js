/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║  DARK BOT v6.87 — STICKER BAN POR APRENDIZAGEM 🕸️            ║
 * ╚═══════════════════════════════════════════════════════════════╝
 *
 * Comandos:
 *   !antisticker on|off|status  — interruptor do grupo (admin/dono)
 *   !bansticker [motivo]        — responde à figurinha: ele aprende-a
 *   !unbansticker [nº]          — desaprende (pela figurinha ou pelo nº)
 *   !banstickers                — o que este grupo já ensinou
 *
 * A identidade da figurinha é o fileSha256 que o WhatsApp já traz na
 * metadata — por isso aprender e reconhecer não custa um único
 * download. Detalhes em src/bot/antiSticker.js.
 */
'use strict';

const antiSticker = require('../antiSticker');

/** A figurinha citada (ou a própria mensagem, se o comando for legenda). */
function stickerDoContexto(m, msg) {
  if (m.quoted?.isSticker && m.quoted?.message?.stickerMessage) {
    return m.quoted.message;
  }
  if (msg?.message?.stickerMessage) return msg.message;
  return null;
}

module.exports = function registerStickerBan(registerCase) {

  // ═══ INTERRUPTOR ═══
  registerCase(['antisticker', 'antifigban'], async ({ m, ctx, args, isOwner, isAdminFn, prefix }) => {
    if (!ctx.isGroup) return m.reply('🚫 O anti-figurinha só funciona em grupos.');
    const isAdm = isOwner || await isAdminFn();
    if (!isAdm) return m.reply('🚫 Só o Dono ou um admin do grupo liga isto.');

    const op = String(args[0] || 'status').toLowerCase();

    // !antisticker notify on|off — avisa no grupo quando apaga?
    if (op === 'notify' || op === 'avisar' || op === 'aviso') {
      const v = /^(on|liga|ligar|sim|ativa)$/i.test(String(args[1] || 'on'));
      await antiSticker.setAviso(ctx.remoteJid, v);
      return m.reply(v
        ? '📢 Vou avisar no grupo de cada vez que apagar uma figurinha aprendida.'
        : '🤫 Apago em silêncio, sem avisar.');
    }

    if (op === 'on' || op === 'ligar' || op === 'ativa' || op === 'ativar') {
      await antiSticker.setActivo(ctx.remoteJid, true);
      return m.reply(
        '✅ *Anti-figurinha aprendida: LIGADO*\n\n' +
        `Agora responde a uma figurinha com *${prefix}bansticker* e eu aprendo-a — ` +
        'da próxima vez que alguém a mandar, apago-a na hora.'
      );
    }
    if (op === 'off' || op === 'desligar' || op === 'desativa' || op === 'desativar') {
      await antiSticker.setActivo(ctx.remoteJid, false);
      return m.reply('🔕 *Anti-figurinha aprendida: DESLIGADO*\n\nO que já aprendi fica guardado — volto a usar se ligares outra vez.');
    }

    const ligado = await antiSticker.estaActivo(ctx.remoteJid);
    const lista = await antiSticker.listaDe(ctx.remoteJid);
    return m.reply(
      `🎭 *ANTI-FIGURINHA APRENDIDA*\n\n` +
      `Interruptor: ${ligado ? '✅ ligado' : '❌ desligado'}\n` +
      `Figurinhas aprendidas: *${lista.length}*\n\n` +
      `${prefix}antisticker on — ligar\n` +
        `${prefix}antisticker notify off — apagar em silêncio\n` +
      `${prefix}bansticker — aprender a figurinha citada\n` +
      `${prefix}banstickers — ver a lista`
    );
  }, true);

  // ═══ APRENDER ═══
  registerCase(['bansticker', 'banfig', 'banfigurinha', 'aprendersticker', 'aprenderfig'],
    async ({ m, msg, ctx, args, isOwner, isAdminFn, prefix }) => {
      if (!ctx.isGroup) return m.reply('🚫 Só em grupos — em PV não há figurinhas para proibir.');
      const isAdm = isOwner || await isAdminFn();
      if (!isAdm) return m.reply('🚫 Só o Dono ou um admin do grupo ensina o que é proibido.');

      const comFig = stickerDoContexto(m, msg);
      if (!comFig) {
        return m.reply(
          `🎭 *Responde à figurinha* com *${prefix}bansticker*.\n\n` +
          'Assim eu vejo exactamente qual é e aprendo-a — não preciso de a descarregar, ' +
          'o WhatsApp já me dá a identidade dela.'
        );
      }

      const id = antiSticker.identidadeDe(comFig);
      if (!id) {
        return m.reply('⚠️ Essa figurinha não traz identidade (hash) — não consigo aprendê-la de forma fiável.');
      }

      const r = await antiSticker.aprender({
        groupJid: ctx.remoteJid,
        hash: id.hash, hashEnc: id.hashEnc, animated: id.animated,
        addedBy: ctx.senderNumber || '', addedByName: ctx.pushName || m.pushName || '',
        reason: args.join(' ').trim(),
      });
      if (!r.ok) return m.reply(`⚠️ Não consegui aprender: ${r.motivo}`);

      // aprender com o interruptor desligado não serve de nada — avisa
      const ligado = await antiSticker.estaActivo(ctx.remoteJid);
      await m.react('🎭');
      return m.reply(
        `${r.jaSabia ? '🔁 *Já a conhecia*' : '🎭 *Aprendida*'} — ${id.animated ? 'figurinha animada' : 'figurinha'}.\n\n` +
        `De cada vez que alguém a mandar aqui, eu apago-a.\n` +
        (ligado
          ? `➖ Desaprender: *${prefix}unbansticker* (respondendo-lhe)`
          : `⚠️ O interruptor está desligado — liga com *${prefix}antisticker on* para eu começar a agir.`)
      );
    }, true);

  // ═══ DESAPRENDER ═══
  registerCase(['unbansticker', 'desbansticker', 'esquecersticker', 'esquecerfig', 'unbanfig'],
    async ({ m, msg, ctx, args, isOwner, isAdminFn, prefix }) => {
      if (!ctx.isGroup) return m.reply('🚫 Só em grupos.');
      const isAdm = isOwner || await isAdminFn();
      if (!isAdm) return m.reply('🚫 Só o Dono ou um admin.');

      const comFig = stickerDoContexto(m, msg);
      const id = comFig ? antiSticker.identidadeDe(comFig) : null;
      const indice = /^\d+$/.test(String(args[0] || '')) ? Number(args[0]) : null;

      if (!id && !indice) {
        return m.reply(
          `🎭 *Como desaprender:*\n\n` +
          `• responde à figurinha com *${prefix}unbansticker*\n` +
          `• ou usa o número da lista: *${prefix}unbansticker 2*\n\n` +
          `Vê a lista com *${prefix}banstickers*.`
        );
      }

      const r = await antiSticker.esquecer(ctx.remoteJid, {
        hash: id?.hash || id?.hashEnc || '', indice,
      });
      if (!r.ok) return m.reply(`⚠️ ${r.motivo}`);
      await m.react('🧹');
      return m.reply('🧹 *Esquecida* — essa figurinha volta a poder entrar neste grupo.');
    }, true);

  // ═══ LISTA ═══
  registerCase(['banstickers', 'stickerbans', 'listabansticker'],
    async ({ m, ctx, prefix }) => {
      if (!ctx.isGroup) return m.reply('🚫 Só em grupos.');
      const lista = await antiSticker.listaDe(ctx.remoteJid);
      const ligado = await antiSticker.estaActivo(ctx.remoteJid);

      if (!lista.length) {
        return m.reply(
          `🎭 *Nada aprendido ainda.*\n\n` +
          `Responde a uma figurinha com *${prefix}bansticker* e eu passo a apagá-la.`
        );
      }

      const linhas = lista.slice(0, 20).map((s, i) => {
        const quando = s.createdAt ? new Date(s.createdAt).toLocaleDateString('pt-PT') : '';
        return `*${i + 1}.* ${s.animated ? '🎞️ animada' : '🖼️ estática'}` +
          `${s.addedByName ? ` · por ${s.addedByName}` : ''}` +
          `${s.hits ? ` · ${s.hits}× apagada` : ''}` +
          `${quando ? ` · ${quando}` : ''}\n     \`${String(s.hash).slice(0, 18)}…\``;
      });

      return m.reply(
        `🎭 *FIGURINHAS APRENDIDAS (${lista.length})*\n` +
        `Interruptor: ${ligado ? '✅ ligado' : '❌ desligado'}\n\n` +
        linhas.join('\n') +
        (lista.length > 20 ? `\n\n_… e mais ${lista.length - 20}_` : '') +
        `\n\n➖ Desaprender: *${prefix}unbansticker <nº>*`
      );
    }, true);
};
