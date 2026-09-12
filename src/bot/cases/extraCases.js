/**
 * DARK BOT v6.58 — CASES EXTRAS (adaptados de outros bots)
 * claude, copilot, manga, addai, ttkstalk, ytplay4
 */
'use strict';

const axios = require('axios');

module.exports = function registerExtraCases(registerCase) {

  // ═══ CLAUDE IA (via SystemZone) ═══
  registerCase(['claude'], async ({ sock, msg, ctx, text, reply }) => {
    if (!text) return reply('_Por favor, informe o texto que deseja enviar ao Claude._');
    sock.sendMessage(ctx.remoteJid, { react: { text: '🤖', key: msg.key } });
    const sessionId = ctx.isGroup ? ctx.remoteJid : ctx.senderJid;
    try {
      const { data } = await axios.get(
        `https://systemzone.store/api/ia/claude-haiku?apikey=freekey&text=${encodeURIComponent(text)}&id=${sessionId}`,
        { timeout: 30000 }
      );
      if (!data?.text) throw new Error('Sem resposta do Claude');
      await sock.sendMessage(ctx.remoteJid, { text: data.text }, { quoted: msg });
      sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } });
    } catch (e) {
      sock.sendMessage(ctx.remoteJid, { react: { text: '💔', key: msg.key } });
      reply('_Erro ao consultar Claude. Tente novamente._');
    }
  });

  // ═══ COPILOT GPT-5 (via SystemZone) ═══
  registerCase(['copilot'], async ({ sock, msg, ctx, text, prefix, reply }) => {
    if (!text) return reply(`cadê a pergunta?\nExemplo: *${prefix}copilot Qual a capital do Brasil?*`);
    try {
      sock.sendMessage(ctx.remoteJid, { react: { text: '👀', key: msg.key } });
      const { data } = await axios.get('https://systemzone.store/api/copilot2', {
        params: { text, model: 'gpt-5' },
        timeout: 30000,
      });
      if (!data?.status || !data?.result) throw new Error('Sem resposta');
      await sock.sendMessage(ctx.remoteJid, { text: data.result }, { quoted: msg });
      sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } });
    } catch (e) {
      sock.sendMessage(ctx.remoteJid, { react: { text: '💔', key: msg.key } });
      reply('Erro ao consultar o Copilot.');
    }
  });

  // ═══ ADD META AI AO GRUPO ═══
  registerCase(['addai', 'addmetaai', 'metaai'], async ({ sock, msg, ctx, reply }) => {
    if (!ctx.isGroup) return reply('👥 Só em grupos.');
    try {
      await sock.groupParticipantsUpdate(ctx.remoteJid, ['867051314767696@bot'], 'add');
      reply('✅ Meta AI foi adicionada ao grupo com sucesso.');
    } catch (e) {
      reply('❌ Não foi possível adicionar a Meta AI ao grupo.');
    }
  });

  // ═══ TIKTOK STALKER ═══
  registerCase(['ttkstalk', 'tiktokstalk', 'ttstalk'], async ({ sock, msg, ctx, text, reply }) => {
    if (!text) return reply('Exemplo: .ttkstalk neymar');
    try {
      await reply('🔍 Consultando perfil...');
      const { data } = await axios.get(
        `https://systemzone.store/api/tiktok/stalk?user=${encodeURIComponent(text.trim())}`,
        { timeout: 15000 }
      );
      if (!data || !data.status) return reply('❌ Usuário não encontrado.');
      const txt = [
        `👤 *${data.nickname}* (@${data.username})`,
        ``,
        `📝 ${data.bio || 'Sem bio'}`,
        ``,
        `🔒 Privado: ${data.privado || 'Não'}`,
        `✔️ Verificado: ${data.verificado || 'Não'}`,
        ``,
        `👥 Seguidores: ${data.estatisticas?.seguidores || '?'}`,
        `➡️ Seguindo: ${data.estatisticas?.seguindo || '?'}`,
        `❤️ Likes: ${data.estatisticas?.likes || '?'}`,
        `📽️ Vídeos: ${data.estatisticas?.videos || '?'}`,
        ``,
        `🔗 ${data.link || ''}`,
      ].join('\n');
      if (data.avatar) {
        await sock.sendMessage(ctx.remoteJid, { image: { url: data.avatar }, caption: txt }, { quoted: msg });
      } else {
        await reply(txt);
      }
    } catch (e) {
      reply('❌ Erro ao consultar API.');
    }
  });

  // ═══ YOUTUBE VÍDEO 1080p (via SystemZone) ═══
  registerCase(['ytplay4', 'ytmp4hd', 'ythd'], async ({ sock, msg, ctx, text, prefix, reply }) => {
    if (!text) return reply(`Informe uma URL do YouTube.\n\nExemplo:\n${prefix}ytplay4 https://youtu.be/TxfFHeQkb7k`);
    await reply('⬇️ Baixando vídeo em HD...');
    try {
      const res = await fetch(`https://systemzone.store/v1/exp?url=${encodeURIComponent(text)}&quality=1080`);
      const gab = await res.json();
      if (!gab.status) return reply('❌ Não foi possível baixar este vídeo.');
      await sock.sendMessage(ctx.remoteJid, {
        video: { url: gab.download_url },
        mimetype: 'video/mp4',
        caption: `🎬 *${gab.title}*\n\n• *Duração:* ${gab.duration}\n• *Qualidade:* ${gab.quality}\n• *Tamanho:* ${gab.size}`,
        gifPlayback: false,
      }, { quoted: msg });
    } catch (err) {
      reply('❌ Erro ao baixar o vídeo.');
    }
  });

  // ═══ MANGÁ — Leitor com PDF (simplificado) ═══
  registerCase(['manga', 'mangá', 'lermanga'], async ({ sock, msg, ctx, text, prefix, reply }) => {
    if (!text) return reply(`📚 *Como usar:*\n\n${prefix}manga <nome do mangá>\n\n📌 *Exemplos:*\n${prefix}manga one piece\n${prefix}manga naruto`);
    try {
      sock.sendMessage(ctx.remoteJid, { react: { text: '🔍', key: msg.key } });
      const slug = text.trim().toLowerCase().replace(/\s+/g, '-');
      const url = `https://mangalivre.blog/manga/${slug}/`;
      const { data } = await axios.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        timeout: 15000,
      });
      // Parse simples com regex (sem cheerio)
      const titleMatch = data.match(/<h1[^>]*>(.*?)<\/h1>/i) || data.match(/<title>(.*?)<\/title>/i);
      const titulo = (titleMatch?.[1] || slug).replace(/<[^>]+>/g, '').trim().replace(/ - Mangá Livre/, '');
      
      // Extrair capítulos
      const capMatches = [...data.matchAll(/href="(https:\/\/mangalivre\.blog\/ler\/[^"]+)"[^>]*>[\s\S]*?<span[^>]*>([\d.]+)<\/span>/gi)];
      const capitulos = capMatches.slice(0, 20).map((m, i) => ({
        numero: m[2] || String(i + 1),
        url: m[1],
      }));

      if (!capitulos.length) {
        // Tenta outro padrão
        const capMatches2 = [...data.matchAll(/href="(\/ler\/[^"]+capitulo[^"]*)"[^>]*>[\s\S]*?(\d+[\d.]*)/gi)];
        for (const m of capMatches2.slice(0, 20)) {
          capitulos.push({ numero: m[2], url: 'https://mangalivre.blog' + m[1] });
        }
      }

      if (!capitulos.length) {
        sock.sendMessage(ctx.remoteJid, { react: { text: '❌', key: msg.key } });
        return reply(`⚠️ Nenhum capítulo encontrado para "${text}".\nTente o nome exacto do mangá.`);
      }

      const list = capitulos.map((c, i) => `${i + 1}. Capítulo ${c.numero}`).join('\n');
      const txt = `📚 *${titulo}*\n📖 ${capitulos.length} capítulos encontrados\n\n${list}\n\n💡 Para ler, usa:\n${prefix}mangacap <número do capítulo>`;
      
      await sock.sendMessage(ctx.remoteJid, { text: txt }, { quoted: msg });
      sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } });
    } catch (e) {
      sock.sendMessage(ctx.remoteJid, { react: { text: '❌', key: msg.key } });
      reply(`❌ Erro: ${e.message}`);
    }
  });

  // ═══ MANGÁ CAP — Baixar capítulo como imagens ═══
  registerCase(['mangacap', 'capitulo', 'lercap'], async ({ sock, msg, ctx, text, args, prefix, reply }) => {
    if (!text) return reply(`Uso: ${prefix}mangacap <url do capítulo>\nOu responde a uma mensagem com o link.`);
    try {
      sock.sendMessage(ctx.remoteJid, { react: { text: '⏳', key: msg.key } });
      const url = text.match(/https?:\/\/\S+/)?.[0] || text;
      const { data } = await axios.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Referer': 'https://mangalivre.blog/' },
        timeout: 20000,
      });
      // Extrair imagens das páginas
      const imgMatches = [...data.matchAll(/(?:src|data-src|data-lazy-src)="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp))"/gi)];
      const paginas = [...new Set(imgMatches.map(m => m[1]))].filter(u => !u.includes('avatar') && !u.includes('logo') && !u.includes('banner') && !u.includes('ads'));

      if (!paginas.length) {
        sock.sendMessage(ctx.remoteJid, { react: { text: '❌', key: msg.key } });
        return reply('❌ Nenhuma página encontrada neste capítulo.');
      }

      await reply(`📖 Encontradas ${paginas.length} páginas. A enviar...`);
      
      // Envia as primeiras 10 páginas como imagens
      const maxPages = Math.min(paginas.length, 10);
      for (let i = 0; i < maxPages; i++) {
        try {
          await sock.sendMessage(ctx.remoteJid, { image: { url: paginas[i] }, caption: `📖 Página ${i + 1}/${paginas.length}` }, { quoted: msg });
        } catch (e) { continue; }
      }
      
      if (paginas.length > 10) {
        await reply(`📖 Enviadas 10/${paginas.length} páginas. Restantes não enviadas por limite.`);
      }
      
      sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } });
    } catch (e) {
      sock.sendMessage(ctx.remoteJid, { react: { text: '❌', key: msg.key } });
      reply(`❌ Erro: ${e.message}`);
    }
  });
};
