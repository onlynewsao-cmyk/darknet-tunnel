/**
 * DARK BOT v5 — Cases Extras
 * Exemplos de cases avançados usando o wrapper "m"
 *
 * Referência de contexto disponível em cada case:
 *   m.reply(texto)          — responde à mensagem
 *   m.react(emoji)          — reage com emoji
 *   m.chat                  — JID do chat
 *   m.sender                — JID do remetente
 *   m.quoted                — mensagem citada (ou null)
 *   m.quoted.id             — ID da mensagem citada
 *   m.quoted.sender         — JID do autor da mensagem citada
 *   m.quoted.text           — texto da mensagem citada
 *   m.quoted.isImage        — é imagem?
 *   sock                    — socket do Baileys
 *   text                    — texto após o comando
 *   args                    — array de argumentos
 *   isOwner                 — boolean
 *   isAdminFn()             — async function → boolean
 */

'use strict';

module.exports = function registerExtraCases(registerCase) {

  // ══════════════════════════════════════════════════════════════════════
  // case 'fakemsg' — edita mensagem citada (simula edição pelo bot)
  // Uso: responde a uma mensagem com !fakemsg <novo texto>
  // ══════════════════════════════════════════════════════════════════════
  registerCase(['fakemsg', 'editarmsg', 'fakeedit'], async ({ m, sock, text }) => {
    if (!m.quoted) return m.reply('❌ Responde a uma mensagem com este comando.');
    if (!text)     return m.reply('❌ Falta o texto novo.\nUso: !fakemsg <texto>');

    const stanzaId    = m.quoted.id;
    const participante = m.quoted.sender || m.quoted.participant;

    try {
      // 1. Envia mensagem temporária vazia
      const msgTemp = await sock.sendMessage(m.chat, { text: ' ' });
      const idTemp  = msgTemp.key.id;

      // 2. Edita a temporária com o novo texto (usando o ID da original como referência)
      await sock.sendMessage(m.chat, {
        text: text.trim(),
        edit: { id: idTemp },
      }, { messageId: stanzaId });

      // 3. Apaga tudo (temp + original + comando)
      await Promise.all([
        sock.sendMessage(m.chat, { delete: { remoteJid: m.chat, id: idTemp, fromMe: true } }).catch(() => {}),
        sock.sendMessage(m.chat, { delete: { remoteJid: m.chat, id: stanzaId, fromMe: false, participant: participante } }).catch(() => {}),
        sock.sendMessage(m.chat, { delete: m.key }).catch(() => {}),
      ]);

    } catch (e) {
      console.error('[fakemsg]', e.message);
      m.reply('❌ Erro: ' + e.message);
    }
  });

  // ══════════════════════════════════════════════════════════════════════
  // case 'apagar' — apaga a mensagem citada (se o bot for admin)
  // ══════════════════════════════════════════════════════════════════════
  registerCase(['apagar', 'delmsg', 'deletarmsg'], async ({ m, sock, isOwner, isAdminFn }) => {
    const isAdm = isOwner || await isAdminFn();
    if (!isAdm) return m.reply('🚫 Só admins podem usar este comando.');
    if (!m.quoted) return m.reply('❌ Responde à mensagem que queres apagar.');

    try {
      await sock.sendMessage(m.chat, {
        delete: {
          remoteJid:   m.chat,
          id:          m.quoted.id,
          fromMe:      false,
          participant: m.quoted.sender,
        },
      });
      // Apaga também o comando
      await sock.sendMessage(m.chat, { delete: m.key }).catch(() => {});
    } catch (e) {
      m.reply('❌ Não consegui apagar. O bot precisa de ser admin.');
    }
  });

  // ══════════════════════════════════════════════════════════════════════
  // case 'copiar' — copia o texto de uma mensagem citada
  // ══════════════════════════════════════════════════════════════════════
  registerCase(['copiar', 'copymsg', 'citar'], async ({ m }) => {
    if (!m.quoted) return m.reply('❌ Responde a uma mensagem para copiar o texto.');
    if (!m.quoted.text) return m.reply('❌ A mensagem citada não tem texto.');
    return m.reply(`📋 *Texto copiado:*\n\n${m.quoted.text}`);
  });

  // ══════════════════════════════════════════════════════════════════════
  // case 'marcar' — menciona todos os membros do grupo
  // Alias de !todos mas estilo case
  // ══════════════════════════════════════════════════════════════════════
  registerCase(['marcar', 'tagall', 'chamar'], async ({ m, sock, text, isAdminFn, isOwner }) => {
    if (!m.isGroup) return m.reply('👥 Só em grupos.');
    const isAdm = isOwner || await isAdminFn();
    if (!isAdm) return m.reply('🚫 Só admins.');
    try {
      const meta     = await sock.groupMetadata(m.chat);
      const mentions = meta.participants.map(p => p.id);
      const txt      = (text || '📢 Atenção!') + '\n\n' + mentions.map(j => `@${j.split('@')[0]}`).join(' ');
      await sock.sendMessage(m.chat, { text: txt, mentions }, { quoted: m });
    } catch (e) {
      m.reply('❌ ' + e.message);
    }
  });

  // ══════════════════════════════════════════════════════════════════════
  // case 'info-msg' — mostra info técnica da mensagem citada
  // ══════════════════════════════════════════════════════════════════════
  registerCase(['info-msg', 'msginfo', 'msgid'], async ({ m }) => {
    if (!m.quoted) return m.reply('❌ Responde a uma mensagem.');
    const q = m.quoted;
    return m.reply(
      `╔━᳀『 ℹ️ INFO MENSAGEM 』═᳀\n` +
      `\n  ⌬ *ID:* \`${q.id}\`` +
      `\n  ⌬ *Sender:* \`${q.sender}\`` +
      `\n  ⌬ *Tipo:* ${q.isImage ? 'Imagem' : q.isVideo ? 'Vídeo' : q.isAudio ? 'Áudio' : q.isSticker ? 'Sticker' : q.isDoc ? 'Documento' : 'Texto'}` +
      `\n  ⌬ *Texto:* ${q.text ? q.text.slice(0, 80) : '—'}\n` +
      `\n╚═━═━═━═━═━═━═━═᳀`
    );
  });
};
