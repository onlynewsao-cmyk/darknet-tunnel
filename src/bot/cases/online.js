/**
 * DARK BOT v5 — Cases Online / APIs externas
 * Baseados nos ficheiros enviados:
 *   claude.txt  → !claude — IA Claude via SystemZone
 *   copilot.txt → !copilot — Copilot GPT-5 via SystemZone
 *   yrmp4.txt   → !ytplay4 — Download YouTube MP4
 *   tiktok stalker.txt → !ttkstalk — Perfil TikTok
 *   meta.txt    → !addai — Adiciona Meta AI ao grupo
 */

'use strict';

const axios = require('axios');
const SZ    = 'https://systemzone.store';
const KEY   = process.env.SYSTEMZONE_API_KEY || 'freekey';

module.exports = function registerOnlineCases(registerCase) {

  // ══════════════════════════════════════════════════════════════════
  // !claude — IA Claude Haiku via SystemZone (com sessão por chat)
  // ══════════════════════════════════════════════════════════════════
  registerCase(['claude', 'claude-haiku', 'claudeai'], async ({ m, sock, ctx, text, prefix, react }) => {
    if (!text) return m.reply(
      `🤖 *Claude Haiku*\n\n` +
      `Uso: *${prefix}claude* <pergunta>\nEx: *${prefix}claude* Explica quantum computing`
    );

    react('🤖');
    try {
      const sessionId = ctx.isGroup ? ctx.remoteJid : ctx.senderNumber;
      const { data } = await axios.get(
        `${SZ}/api/ia/claude-haiku?apikey=${KEY}&text=${encodeURIComponent(text)}&id=${encodeURIComponent(sessionId)}`,
        { timeout: 30000 }
      );

      if (!data?.text) throw new Error('Sem resposta do Claude');

      // Processa blocos de código se existirem
      const resp = data.text;
      await sock.sendMessage(ctx.remoteJid, { text: resp }, { quoted: m.msg });
      react('✅');

    } catch (e) {
      console.error('[CLAUDE]', e?.message);
      react('💔');
      m.reply('❌ Erro ao consultar o Claude. Tente novamente.');
    }
  });

  // ══════════════════════════════════════════════════════════════════
  // !copilot — Microsoft Copilot GPT-5 via SystemZone
  // ══════════════════════════════════════════════════════════════════
  registerCase(['copilot', 'gpt5', 'microsoft-ai'], async ({ m, sock, ctx, text, prefix, react }) => {
    if (!text) return m.reply(
      `💡 *Copilot GPT-5*\n\n` +
      `Uso: *${prefix}copilot* <pergunta>\nEx: *${prefix}copilot* Qual a capital do Brasil?`
    );

    react('👀');
    try {
      const { data } = await axios.get(`${SZ}/api/copilot2`, {
        params: { text, model: 'gpt-5', apikey: KEY },
        timeout: 30000,
      });

      if (!data?.status || !data?.result) throw new Error('Sem resposta');

      await sock.sendMessage(ctx.remoteJid, { text: data.result }, { quoted: m.msg });
      react('✅');

    } catch (e) {
      console.error('[COPILOT]', e?.message);
      react('💔');
      m.reply('❌ Erro ao consultar o Copilot.');
    }
  });

  // ══════════════════════════════════════════════════════════════════
  // !ytplay4 — Download YouTube MP4 FHD via SystemZone /v1/exp
  // ══════════════════════════════════════════════════════════════════
  registerCase(['ytfhd'], async ({ m, sock, ctx, text, args, prefix, react }) => {
    const url = text?.trim() || args[0];
    if (!url || !/^https?:\/\//i.test(url)) return m.reply(
      `🎬 Uso: *${prefix}ytplay4* <url YouTube>\nEx: *${prefix}ytplay4* https://youtu.be/TxfFHeQkb7k`
    );

    await m.reply('⏳ Baixando o teu vídeo...');
    try {
      const res  = await fetch(`${SZ}/v1/exp?url=${encodeURIComponent(url)}&quality=1080`, { signal: AbortSignal.timeout(60000) });
      const gab  = await res.json();

      if (!gab?.status || !gab?.download_url) return m.reply('❌ Não foi possível baixar este vídeo.');

      await sock.sendMessage(ctx.remoteJid, {
        video:     { url: gab.download_url },
        mimetype:  'video/mp4',
        caption:   `🎬 *${gab.title || 'Vídeo'}*\n\n• *Duração:* ${gab.duration || '?'}\n• *Qualidade:* ${gab.quality || '1080p'}\n• *Tamanho:* ${gab.size || '?'}`,
        gifPlayback: false,
      }, { quoted: m.msg });

    } catch (e) {
      console.error('[YTPLAY4]', e?.message);
      m.reply('❌ Erro ao baixar o vídeo: ' + e.message?.slice(0, 80));
    }
  });

  // ══════════════════════════════════════════════════════════════════
  // !ttkstalk — Stalker de perfil TikTok via SystemZone
  // ══════════════════════════════════════════════════════════════════
  registerCase(['ttkstalk', 'tiktokstalk', 'tikstalk', 'stalktk'], async ({ m, sock, ctx, text, args, prefix, react }) => {
    const user = (text?.trim() || args[0] || '').replace('@', '');
    if (!user) return m.reply(`📱 Uso: *${prefix}ttkstalk* <usuario>\nEx: *${prefix}ttkstalk* neymar`);

    await m.reply('🔍 Consultando perfil TikTok...');
    try {
      const { data } = await axios.get(
        `${SZ}/api/tiktok/stalk?user=${encodeURIComponent(user)}&apikey=${KEY}`,
        { timeout: 15000 }
      );

      if (!data?.status) return m.reply('❌ Utilizador não encontrado.');

      const txt =
        `╔━᳀『 📱 *TIKTOK STALK* 』═᳀\n` +
        `\n👤 *${data.nickname || '?'}* (@${data.username || user})\n` +
        `\n📝 _${data.bio || 'Sem bio'}_\n` +
        `\n━━━━━━━━━━━━━━━━━━━━\n` +
        `🔒 Privado:    *${data.privado ? 'Sim' : 'Não'}*\n` +
        `✔️ Verificado: *${data.verificado ? 'Sim' : 'Não'}*\n` +
        `\n👥 Seguidores: *${(data.estatisticas?.seguidores || 0).toLocaleString()}*\n` +
        `➡️ Seguindo:   *${(data.estatisticas?.seguindo   || 0).toLocaleString()}*\n` +
        `❤️ Likes:      *${(data.estatisticas?.likes      || 0).toLocaleString()}*\n` +
        `📽️ Vídeos:    *${(data.estatisticas?.videos      || data.estatisticas?.likes || 0).toLocaleString()}*\n` +
        `\n🔗 ${data.link || `https://tiktok.com/@${user}`}\n` +
        `\n╚═━═━═━═━═━═━═━═᳀`;

      if (data.avatar) {
        await sock.sendMessage(ctx.remoteJid, {
          image:   { url: data.avatar },
          caption: txt,
        }, { quoted: m.msg });
      } else {
        await sock.sendMessage(ctx.remoteJid, { text: txt }, { quoted: m.msg });
      }

    } catch (e) {
      console.error('[TTKSTALK]', e?.message);
      m.reply('❌ Erro ao consultar o perfil TikTok.');
    }
  });

  // ══════════════════════════════════════════════════════════════════
  // !addai — Adiciona Meta AI ao grupo
  // ══════════════════════════════════════════════════════════════════
  registerCase(['addai', 'metaai', 'addmetaai'], async ({ m, sock, ctx, isOwner, isAdminFn, reply }) => {
    if (!ctx.isGroup) return m.reply('👥 Só funciona em grupos.');
    const isAdm = isOwner || await isAdminFn();
    if (!isAdm) return m.reply('🚫 Só admins podem usar este comando.');
    try {
      await sock.groupParticipantsUpdate(ctx.remoteJid, ['867051314767696@bot'], 'add');
      m.reply('✅ *Meta AI* foi adicionada ao grupo com sucesso!\n\nChama-a com @Meta AI nas mensagens.');
    } catch (e) {
      console.error('[ADDAI]', e?.message);
      m.reply('❌ Não foi possível adicionar a Meta AI ao grupo.\n_Pode ser que já esteja no grupo ou que o grupo não suporte bots externos._');
    }
  });

  // ══════════════════════════════════════════════════════════════════
  // !ytaudio — Download áudio YouTube via SystemZone (complemento ao play)
  // ══════════════════════════════════════════════════════════════════
  registerCase(['ytaudio'], async ({ m, sock, ctx, text, args, prefix, react }) => {
    const url = text?.trim() || args[0];
    if (!url || !/^https?:\/\//i.test(url)) return m.reply(
      `🎵 Uso: *${prefix}ytaudio* <url YouTube>\nPara busca por nome usa: *${prefix}play* <nome>`
    );

    react('⏳');
    try {
      const res  = await fetch(`${SZ}/api/ytmp3?text=${encodeURIComponent(url)}&apikey=${KEY}`, { signal: AbortSignal.timeout(60000) });
      const data = await res.json();
      const dl   = data?.result?.download || data?.download_url;
      if (!dl) throw new Error('Sem URL de download');

      await sock.sendMessage(ctx.remoteJid, {
        audio:    { url: dl },
        mimetype: 'audio/mpeg',
        ptt:      false,
      }, { quoted: m.msg });
      react('✅');
    } catch (e) {
      react('❌');
      m.reply('❌ Falha no download de áudio: ' + e.message?.slice(0, 80));
    }
  });
};
