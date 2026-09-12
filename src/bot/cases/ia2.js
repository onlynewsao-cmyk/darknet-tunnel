/**
 * DARK BOT v6.18 — IA & CHATBOTS COMPLETOS
 * Todos os 58 comandos de IA com lógica real
 */
'use strict';

const config = require('../../config');
const ai = require('../ai');
const { sanitizeAI } = require('../aiSanitizer');

// ── Mapeamento modelo → API disponível ──
const MODEL_MAP = {
  // Groq models
  llama: 'llama-3.1-8b-instant', llama3: 'llama-3.3-70b-versatile',
  gemma: 'gemma2-9b-it', gemma2: 'gemma2-9b-it', codegemma: 'gemma2-9b-it',
  // Gemini models — v6.41: aliases '-latest' (os '2.5' devolviam 404)
  pplx: 'gemini-flash-latest', nano: 'gemini-flash-lite-latest', nano2: 'gemini-3.5-flash',
  // Default (Groq primary)
  gpt: 'llama-3.3-70b-versatile', gpt4: 'llama-3.3-70b-versatile', gpt5: 'llama-3.3-70b-versatile',
  claude: 'llama-3.3-70b-versatile', 'claude-haiku': 'llama-3.1-8b-instant', claudeai: 'llama-3.3-70b-versatile',
  copilot: 'llama-3.3-70b-versatile', copiloto: 'llama-3.3-70b-versatile',
  qwen: 'llama-3.3-70b-versatile', qwen2: 'llama-3.3-70b-versatile', qwen3: 'llama-3.3-70b-versatile', qwencoder: 'llama-3.3-70b-versatile',
  phi: 'llama-3.1-8b-instant', phi3: 'llama-3.1-8b-instant',
  yi: 'llama-3.1-8b-instant', kimi: 'llama-3.3-70b-versatile', kimik2: 'llama-3.3-70b-versatile',
  mistral: 'llama-3.3-70b-versatile', magistral: 'llama-3.3-70b-versatile',
  baichuan: 'llama-3.3-70b-versatile', marin: 'llama-3.3-70b-versatile',
  rakutenai: 'llama-3.3-70b-versatile', rocket: 'llama-3.3-70b-versatile',
  swallow: 'llama-3.3-70b-versatile', falcon: 'llama-3.3-70b-versatile', cog: 'llama-3.3-70b-versatile',
};

// ── System prompts por modelo ──
const MODEL_PERSONA = {
  claude: 'You are Claude, made by Anthropic. You are helpful, harmless, and honest.',
  'claude-haiku': 'You are Claude Haiku, a fast and efficient AI assistant by Anthropic.',
  copilot: 'You are GitHub Copilot, an AI coding assistant. Focus on code and technical help.',
  copiloto: 'Tu és o GitHub Copilot, um assistente de IA para programação.',
  gemma: 'You are Gemma, an open model built by Google DeepMind.',
  qwen: 'You are Qwen, a large multimodal model developed by Alibaba Cloud.',
  phi: 'You are Phi, a small language model by Microsoft Research.',
  yi: 'You are Yi, a large language model by 01.AI.',
  kimi: 'You are Kimi, an AI assistant by Moonshot AI.',
  mistral: 'You are Mistral, a large language model by Mistral AI.',
  llama: 'You are Llama, a large language model by Meta AI.',
};

// Helper: resposta com tema
async function themedReply(sock, msg, ctx, text) {
  const RE = require('../renderEngine');
  const t = await RE.getTheme(ctx.remoteJid);
  return sock.sendMessage(ctx.remoteJid, { text: RE.renderBlock(t, 'IA', [text], { botName: config.bot.name }) }, { quoted: msg });
}

// Handler genérico para modelos de IA
function makeModelHandler(modelName) {
  return async ({ sock, msg, ctx, args, prefix, command, reply }) => {
    const text = args.join(' ').trim();
    if (!text) return reply(`🤖 *${modelName.toUpperCase()}*\n\nUso: \`${prefix}${command} <pergunta>\`\n\n> Modelo: ${MODEL_MAP[modelName] || 'default'}`);
    
    sock.sendMessage(ctx.remoteJid, { react: { text: '🤖', key: msg.key } });
    
    try {
      const persona = MODEL_PERSONA[modelName] || `You are ${modelName}, an AI assistant.`;
      const fullPrompt = `[System: ${persona}]\n\nUser: ${text}`;
      const answer = await ai.chat(fullPrompt, '', {}, false);
      
      const RE = require('../renderEngine');
      const t = await RE.getTheme(ctx.remoteJid);
      const response = RE.renderBlock(t, modelName.toUpperCase(), [
        answer.slice(0, 800),
        ...(answer.length > 800 ? ['\n_... (resposta truncada)_'] : []),
      ], { botName: config.bot.name });
      
      await sock.sendMessage(ctx.remoteJid, { text: response }, { quoted: msg });
      sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } });
    } catch (e) {
      sock.sendMessage(ctx.remoteJid, { react: { text: '❌', key: msg.key } });
      return reply(`❌ ${modelName}: ${e.message}`);
    }
  };
}

module.exports = function registerIA2(registerCase) {

  // ═══ COMANDOS DE MODELO (todos com handler real) ═══
  const modelCmds = ['gpt', 'gpt4', 'gpt5', 'claude', 'claude-haiku', 'claudeai',
    'copilot', 'copiloto', 'gemma', 'gemma2', 'codegemma',
    'qwen', 'qwen2', 'qwen3', 'qwencoder',
    'llama', 'llama3', 'phi', 'phi3', 'yi', 'kimi', 'kimik2',
    'mistral', 'magistral', 'baichuan', 'marin', 'rakutenai', 'rocket', 'swallow', 'falcon', 'cog',
    'pplx', 'nano', 'nano2'];
  
  for (const cmd of modelCmds) {
    registerCase([cmd], makeModelHandler(cmd), true);
  }

  // ═══ IA PRINCIPAL (com memória) ═══
  registerCase(['ia', 'chat', 'ask'], async ({ sock, msg, ctx, args, prefix, reply }) => {
    const text = args.join(' ').trim();
    if (!text) return reply(`🧠 *IA com Memória*\n\nUso: \`${prefix}ia <pergunta>\`\n\n💡 A IA lembra do contexto da conversa!`);
    sock.sendMessage(ctx.remoteJid, { react: { text: '🧠', key: msg.key } });
    try {
      const answer = await ai.chat(text, '', {}, false);
      await sock.sendMessage(ctx.remoteJid, { text: sanitizeAI(answer) }, { quoted: msg });
      sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } });
    } catch (e) {
      sock.sendMessage(ctx.remoteJid, { react: { text: '❌', key: msg.key } });
      return reply('❌ IA: ' + e.message);
    }
  }, true);

  // ═══ UTILITÁRIOS DE IA ═══
  registerCase(['corrigir'], async ({ sock, msg, ctx, args, prefix, reply }) => {
    const text = args.join(' ').trim();
    if (!text) return reply(`✍️ Uso: \`${prefix}corrigir <texto>\``);
    sock.sendMessage(ctx.remoteJid, { react: { text: '✍️', key: msg.key } });
    try {
      const answer = await ai.chat(`Corrige os erros ortográficos e gramaticais do seguinte texto. Responde APENAS com o texto corrigido, sem explicações:\n\n${text}`, '', {}, false);
      await sock.sendMessage(ctx.remoteJid, { text: `✍️ *Corrigido:*\n\n${sanitizeAI(answer)}` }, { quoted: msg });
      sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } });
    } catch (e) { return reply('❌ ' + e.message); }
  }, true);

  registerCase(['explicar'], async ({ sock, msg, ctx, args, prefix, reply }) => {
    const text = args.join(' ').trim();
    if (!text) return reply(`📖 Uso: \`${prefix}explicar <conceito>\``);
    sock.sendMessage(ctx.remoteJid, { react: { text: '📖', key: msg.key } });
    try {
      const answer = await ai.chat(`Explica de forma clara e simples o seguinte conceito:\n\n${text}`, '', {}, false);
      await sock.sendMessage(ctx.remoteJid, { text: `📖 *Explicação:*\n\n${sanitizeAI(answer)}` }, { quoted: msg });
      sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } });
    } catch (e) { return reply('❌ ' + e.message); }
  }, true);

  // ── v7.16: tradução real — a MAPA conversacional mapeava "traduz X"
  // para um comando que NÃO existia (o menu até anunciava !translate).
  registerCase(['traduzir', 'translate', 'trad'], async ({ sock, msg, ctx, args, prefix, reply, isOwner }) => {
    const texto = (args || []).join(' ').trim();
    if (!texto || texto.length < 2) {
      return reply(`🌍 Uso: \`${prefix}traduzir <texto> para <língua>\`\n\nEx: *${prefix}traduzir hello para português*\n*${prefix}traduzir olá para inglês*`);
    }
    const LINGUAS = {
      en: 'inglês', english: 'inglês', ingles: 'inglês', inglês: 'inglês',
      pt: 'português', portugues: 'português', portuguese: 'português', português: 'português',
      es: 'espanhol', espanhol: 'espanhol', spanish: 'espanhol',
      fr: 'francês', frances: 'francês', francês: 'francês', french: 'francês',
      ar: 'árabe', arabe: 'árabe', árabe: 'árabe', arabic: 'árabe',
      de: 'alemão', alemao: 'alemão', alemão: 'alemão', german: 'alemão',
      it: 'italiano', italiano: 'italiano', italian: 'italiano',
      ru: 'russo', russo: 'russo', russian: 'russo',
      zh: 'chinês', chines: 'chinês', chinês: 'chinês', chinese: 'chinês',
      ja: 'japonês', japones: 'japonês', japonês: 'japonês', japanese: 'japonês',
      umbundo: 'umbundo', kimbundu: 'kimbundo', lingala: 'lingala', francesa: 'francês',
    };
    // "texto para/em/pra LÍNGUA"
    let destino = 'português';
    let conteudo = texto;
    const m = texto.match(/^(.*?)\s+(?:para|pra|em|to|in)\s+(.+)$/i);
    if (m) { conteudo = m[1].trim(); destino = m[2].trim().replace(/[?.!]+$/, ''); }
    const alvoNorm = destino.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    destino = LINGUAS[destino.toLowerCase()] || LINGUAS[alvoNorm] || destino;

    sock.sendMessage(ctx.remoteJid, { react: { text: '🌍', key: msg.key } }).catch(() => {});
    try {
      const sys = `És um tradutor. Traduz o texto para ${destino}. Devolve SÓ a tradução, sem aspas, sem "tradução:" nem explicações. Mantém o tom e a formatação.`;
      const resposta = await ai.chat(conteudo, sys, { userRole: isOwner ? 'owner' : 'free' }, !!isOwner);
      const limpo = String(sanitizeAI(resposta) || '').trim();
      if (!limpo || limpo.startsWith('❌')) throw new Error('tradução falhou');
      await sock.sendMessage(ctx.remoteJid, { text: `🌍 *${destino}:*\n\n${limpo}` }, { quoted: msg });
      sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } }).catch(() => {});
    } catch (e) {
      return reply('❌ Não consegui traduzir agora. Tenta outra vez.');
    }
  }, true);

  registerCase(['resumir'], async ({ sock, msg, ctx, args, prefix, reply }) => {
    const text = args.join(' ').trim();
    if (!text) return reply(`📝 Uso: \`${prefix}resumir <texto longo>\``);
    sock.sendMessage(ctx.remoteJid, { react: { text: '📝', key: msg.key } });
    try {
      const answer = await ai.chat(`Resume o seguinte texto em 3-5 pontos principais:\n\n${text}`, '', {}, false);
      await sock.sendMessage(ctx.remoteJid, { text: `📝 *Resumo:*\n\n${sanitizeAI(answer)}` }, { quoted: msg });
      sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } });
    } catch (e) { return reply('❌ ' + e.message); }
  }, true);

  registerCase(['resumirurl'], async ({ sock, msg, ctx, args, prefix, reply }) => {
    const url = args.join(' ').trim();
    if (!url || !/^https?:\/\//i.test(url)) return reply(`🔗 Uso: \`${prefix}resumirurl <url>\``);
    sock.sendMessage(ctx.remoteJid, { react: { text: '🔗', key: msg.key } });
    try {
      const axios = require('axios');
      const r = await axios.get(url, { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' } });
      const text = String(r.data).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 3000);
      const answer = await ai.chat(`Resume o conteúdo desta página web em 3-5 pontos:\n\n${text}`, '', {}, false);
      await sock.sendMessage(ctx.remoteJid, { text: `🔗 *Resumo de ${url.slice(0, 50)}...*\n\n${sanitizeAI(answer)}` }, { quoted: msg });
      sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } });
    } catch (e) { return reply('❌ ' + e.message); }
  }, true);

  registerCase(['resumirchat'], async ({ sock, msg, ctx, args, prefix, reply }) => {
    const n = parseInt(args[0]) || 20;
    sock.sendMessage(ctx.remoteJid, { react: { text: '💬', key: msg.key } });
    try {
      const { messageCache } = require('../messageListener');
      const msgs = [...messageCache.values()]
        .filter(m => m.key?.remoteJid === ctx.remoteJid)
        .slice(-n)
        .map(m => {
          const txt = m.message?.conversation || m.message?.extendedTextMessage?.text || '';
          return txt ? `${m.pushName || 'User'}: ${txt}` : '';
        })
        .filter(Boolean)
        .join('\n');
      if (!msgs) return reply('💬 Sem mensagens recentes para resumir.');
      const answer = await ai.chat(`Resume esta conversa de grupo em 3-5 pontos:\n\n${msgs}`, '', {}, false);
      await sock.sendMessage(ctx.remoteJid, { text: `💬 *Resumo das últimas ${n} mensagens:*\n\n${sanitizeAI(answer)}` }, { quoted: msg });
      sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } });
    } catch (e) { return reply('❌ ' + e.message); }
  }, true);

  registerCase(['ideias'], async ({ sock, msg, ctx, args, prefix, reply }) => {
    const topic = args.join(' ').trim() || 'criativo';
    sock.sendMessage(ctx.remoteJid, { react: { text: '💡', key: msg.key } });
    try {
      const answer = await ai.chat(`Dá-me 5 ideias criativas sobre: ${topic}`, '', {}, false);
      await sock.sendMessage(ctx.remoteJid, { text: `💡 *Ideias sobre ${topic}:*\n\n${sanitizeAI(answer)}` }, { quoted: msg });
      sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } });
    } catch (e) { return reply('❌ ' + e.message); }
  }, true);

  registerCase(['debater'], async ({ sock, msg, ctx, args, prefix, reply }) => {
    const topic = args.join(' ').trim();
    if (!topic) return reply(`⚔️ Uso: \`${prefix}debater <tema>\``);
    sock.sendMessage(ctx.remoteJid, { react: { text: '⚔️', key: msg.key } });
    try {
      const answer = await ai.chat(`Apresenta argumentos A FAVOR e CONTRA o seguinte tema, de forma equilibrada:\n\n${topic}`, '', {}, false);
      await sock.sendMessage(ctx.remoteJid, { text: `⚔️ *Debate: ${topic}*\n\n${sanitizeAI(answer)}` }, { quoted: msg });
      sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } });
    } catch (e) { return reply('❌ ' + e.message); }
  }, true);

  registerCase(['recomendar'], async ({ sock, msg, ctx, args, prefix, reply }) => {
    const text = args.join(' ').trim();
    if (!text) return reply(`🎯 Uso: \`${prefix}recomendar <tipo> <género>\`\nEx: \`${prefix}recomendar filme acção\``);
    sock.sendMessage(ctx.remoteJid, { react: { text: '🎯', key: msg.key } });
    try {
      const answer = await ai.chat(`Recomenda 5 ${text}. Para cada um dá: título, ano, e uma frase de descrição.`, '', {}, false);
      await sock.sendMessage(ctx.remoteJid, { text: `🎯 *Recomendações: ${text}*\n\n${sanitizeAI(answer)}` }, { quoted: msg });
      sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } });
    } catch (e) { return reply('❌ ' + e.message); }
  }, true);

  registerCase(['aventura'], async ({ sock, msg, ctx, args, prefix, reply }) => {
    const genre = args.join(' ').trim() || 'fantasia';
    sock.sendMessage(ctx.remoteJid, { react: { text: '📖', key: msg.key } });
    try {
      const answer = await ai.chat(`Cria o início de uma história interativa de ${genre}. Descreve a cena e dá 3 opções de acção (1, 2, 3). Máximo 200 palavras.`, '', {}, false);
      await sock.sendMessage(ctx.remoteJid, { text: `📖 *Aventura: ${genre}*\n\n${sanitizeAI(answer)}\n\n> Usa \`${prefix}aventura 1\` para escolher` }, { quoted: msg });
      sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } });
    } catch (e) { return reply('❌ ' + e.message); }
  }, true);

  // ═══ MEMÓRIA DA IA ═══
  registerCase(['aimemoria', 'iamemoria'], async ({ sock, msg, ctx, reply }) => {
    const RE = require('../renderEngine');
    const t = await RE.getTheme(ctx.remoteJid);
    return reply(RE.renderBlock(t, 'MEMÓRIA IA', [
      '🧠 A IA lembra do contexto da conversa.',
      '',
      `📊 Memória por grupo/PV`,
      `🔄 Reset: \`${(ctx.prefix || '!')}airesetar\``,
      '',
      `> ${t.vibe || 'Dark Engine'}`,
    ], { botName: config.bot.name }));
  }, true);

  registerCase(['airesetar', 'clearmemory'], async ({ sock, msg, ctx, reply, isOwner }) => {
    if (!isOwner && !ctx.isGroup) return reply('🚫 Só o dono ou em grupo.');
    try {
      const AiMemory = require('../../database/models/AiMemory');
      await AiMemory.deleteMany({ userId: ctx.senderNumber, groupId: ctx.isGroup ? ctx.remoteJid : null });
      return reply('🧠 Memória da IA resetada!');
    } catch (e) { return reply('❌ ' + e.message); }
  }, true);

  // ═══ CHECK IA / IA APIS ═══
  registerCase(['checkia', 'iaapis'], async ({ sock, msg, ctx, reply }) => {
    const hasGroq = !!config.ai.groq;
    const hasGemini = !!config.ai.gemini;
    const RE = require('../renderEngine');
    const t = await RE.getTheme(ctx.remoteJid);
    return reply(RE.renderBlock(t, 'STATUS IA', [
      `${hasGroq ? '✅' : '❌'} Groq: ${hasGroq ? 'Conectado' : 'Sem API key'}`,
      `${hasGemini ? '✅' : '❌'} Gemini: ${hasGemini ? 'Conectado' : 'Sem API key'}`,
      '',
      `🧠 Modelos Groq: ${ai.GROQ_MODELS?.slice(0, 2).join(', ') || 'N/A'}`,
      `🧠 Modelos Gemini: ${ai.GEMINI_MODELS?.slice(0, 2).join(', ') || 'N/A'}`,
      '',
      `> ${t.vibe || 'Dark Engine'}`,
    ], { botName: config.bot.name }));
  }, true);

  // ═══ SYS-IMG (system image) ═══
  registerCase(['sys-img'], async ({ sock, msg, ctx, args, prefix, reply }) => {
    const prompt = args.join(' ').trim();
    if (!prompt) return reply(`🖼️ Uso: \`${prefix}sys-img <descrição>\``);
    sock.sendMessage(ctx.remoteJid, { react: { text: '🖼️', key: msg.key } });
    try {
      const axios = require('axios');
      const r = await axios.get(`https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=512&height=512&nologo=true`, { responseType: 'arraybuffer', timeout: 30000 });
      if (r.data && r.data.byteLength > 1000) {
        await sock.sendMessage(ctx.remoteJid, { image: Buffer.from(r.data), caption: `🖼️ *${prompt}*` }, { quoted: msg });
        sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } });
      } else throw new Error('Imagem vazia');
    } catch (e) {
      sock.sendMessage(ctx.remoteJid, { react: { text: '❌', key: msg.key } });
      return reply('❌ sys-img: ' + e.message);
    }
  }, true);

  // ═══ IA IMG (alias de imagem) ═══
  registerCase(['iaimg'], async ({ sock, msg, ctx, args, prefix, reply }) => {
    const prompt = args.join(' ').trim();
    if (!prompt) return reply(`🎨 Uso: \`${prefix}iaimg <descrição>\``);
    sock.sendMessage(ctx.remoteJid, { react: { text: '🎨', key: msg.key } });
    try {
      const axios = require('axios');
      const r = await axios.get(`https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=512&height=512&nologo=true`, { responseType: 'arraybuffer', timeout: 30000 });
      if (r.data && r.data.byteLength > 1000) {
        await sock.sendMessage(ctx.remoteJid, { image: Buffer.from(r.data), caption: `🎨 *${prompt}*` }, { quoted: msg });
        sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } });
      } else throw new Error('Imagem vazia');
    } catch (e) {
      sock.sendMessage(ctx.remoteJid, { react: { text: '❌', key: msg.key } });
      return reply('❌ iaimg: ' + e.message);
    }
  }, true);

  // ═══ ADMIN: addai / addmetaai ═══
  registerCase(['addai', 'addmetaai'], async ({ sock, msg, ctx, args, prefix, reply, isOwner }) => {
    if (!isOwner) return reply('🚫 Só o dono.');
    return reply(`🤖 *Configurar IA*\n\nDefina as API keys no Render:\n• GROQ_API_KEY\n• GEMINI_API_KEY\n\n> ${config.bot.name}`);
  }, true);
};
