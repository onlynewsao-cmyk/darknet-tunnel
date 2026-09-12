/**
 * DARK BOT v5 — Cases de IA
 * ia, gpt, imagem, noticias, pesquisar, resumir, deepsearch
 */
'use strict';

const ai     = require('../ai');
const config = require('../../config');
const { sanitizeAI } = require('../aiSanitizer');

module.exports = function registerIACases(registerCase) {

  // case 'ia' / 'gpt'
  registerCase(['ia', 'gpt', 'chat', 'ask', 'pergunta'], async ({
    sock, msg, ctx, text, args, prefix, reply, react,
  }) => {
    const AiMemory = require('../../database/models/AiMemory');
    const User     = require('../../database/models/User');

    if (!text) return reply(
      `🧠 *${prefix}ia* <pergunta>\n\n` +
      `Ex: *${prefix}ia* explique a economia de Angola\n\n` +
      `*${prefix}aimemoria* — ver memória\n` +
      `*${prefix}airesetar* — apagar memória\n` +
      `*${prefix}aiapis*   — estado das APIs`
    );

    const hasAI = !!(config.ai.groqApiKey || config.ai.geminiApiKey || config.ai.openrouterApiKey || config.ai.openaiApiKey);
    if (!hasAI) return reply('❌ IA sem chave. Configure GROQ_API_KEY no Render.');

    react('🤔');
    try {
      const mem  = await AiMemory.getOrCreate(ctx.senderNumber).catch(() => null);
      const u    = await User.findOne({ whatsappNumber: ctx.senderNumber }).lean().catch(() => null);
      const memOpts = {
        history:     mem ? mem.getContextWindow(12) : [],
        userTone:    u?.aiTone || '',
        userProfile: { name: ctx.pushName, gender: u?.gender || '' },
      };

      if (mem) { mem.addMessage('user', text); await mem.save().catch(() => {}); }

      const answer = await Promise.race([
        ai.chat(text, '', memOpts),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 28000)),
      ]);

      if (mem) { mem.addMessage('assistant', answer); await mem.save().catch(() => {}); }

      react('✅');
      return reply('🧠 *' + config.bot.name + ' IA:*\n\n' + sanitizeAI(answer));
    } catch (e) {
      react('❌');
      return reply('❌ Erro na IA. Tente novamente.');
    }
  });

  // case 'noticias'
  registerCase(['noticias', 'news', 'jornal'], async ({ text, reply, react }) => {
    react('📰');
    try {
      const digest = await ai.getPrettyNewsDigest(text || '');
      react('✅');
      return reply(sanitizeAI(digest));
    } catch {
      react('❌');
      return reply('❌ Notícias indisponíveis agora.');
    }
  });

  // case 'pesquisar'
  registerCase(['pesquisar', 'search', 'google', 'procurar'], async ({
    text, prefix, reply, react,
  }) => {
    if (!text) return reply(`🔎 Uso: *${prefix}pesquisar* <assunto>`);
    react('🔎');
    try {
      const r = await ai.getWebDigest(text);
      react('✅');
      return reply(sanitizeAI(r));
    } catch {
      react('❌');
      return reply('❌ Pesquisa falhou.');
    }
  });

  // case 'deepsearch'
  registerCase(['deepsearch', 'deep', 'deepai'], async ({
    text, prefix, reply, react,
  }) => {
    if (!text) return reply(`🧠 Uso: *${prefix}deepsearch* <pergunta detalhada>`);
    react('⏳');
    try {
      const r = await Promise.race([
        ai.chat(text + ' (responda detalhadamente com fontes e contexto)'),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 30000)),
      ]);
      react('✅');
      return reply('🧠 *DeepSearch:*\n\n' + sanitizeAI(r, { maxLength: 4000 }));
    } catch {
      react('❌');
      return reply('❌ Falha na pesquisa.');
    }
  });

  // case 'imagem'
  registerCase(['imagem', 'img', 'iaimg', 'imagine'], async ({
    sock, msg, ctx, text, prefix, reply, react,
  }) => {
    if (!text) return reply(`🎨 Uso: *${prefix}imagem* <descrição>`);
    react('🎨');
    try {
      const buf = await ai.generateImage(text);
      await sock.sendMessage(ctx.remoteJid, { image: buf, caption: `🎨 ${text}` }, { quoted: msg });
      react('✅');
    } catch {
      react('❌');
      return reply('❌ Falha a gerar imagem.');
    }
  });

  // case 'aimemoria'
  registerCase(['aimemoria', 'iamemoria', 'mymemory'], async ({ ctx, reply }) => {
    const AiMemory = require('../../database/models/AiMemory');
    try {
      const mem  = await AiMemory.getOrCreate(ctx.senderNumber);
      const hist = mem.getContextWindow(6);
      if (!hist.length) return reply('🧠 A IA ainda não tem memória de ti. Usa *!ia*!');
      let txt = `🧠 *MEMÓRIA DA IA — ${ctx.pushName}*\n\n`;
      txt += `📊 Total: *${mem.totalMessages || 0}* mensagens\n`;
      txt += `⏰ Última: *${mem.lastInteraction ? new Date(mem.lastInteraction).toLocaleString('pt-PT') : 'nunca'}*\n\n`;
      txt += `📜 *Últimas ${hist.length} trocas:*\n`;
      for (const h of hist) {
        txt += `${h.role === 'user' ? '👤' : '🤖'} ${String(h.content).slice(0, 80)}...\n`;
      }
      txt += `\n💡 Apaga com *!airesetar*`;
      return reply(txt);
    } catch {
      return reply('❌ Erro ao ler memória.');
    }
  });

  // case 'airesetar'
  registerCase(['airesetar', 'resetia', 'clearmemory'], async ({ ctx, reply }) => {
    const AiMemory = require('../../database/models/AiMemory');
    try {
      const mem = await AiMemory.getOrCreate(ctx.senderNumber);
      mem.resetHistory();
      await mem.save();
      return reply('🗑️ Memória da IA apagada! A IA começa do zero.');
    } catch {
      return reply('❌ Erro ao apagar memória.');
    }
  });
};
