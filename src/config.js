/**
 * DARK BOT v5 — Configuração Central
 * Todas as variáveis vêm do Render → Environment
 * NUNCA coloque segredos aqui.
 */
'use strict';

require('dotenv').config();

function env(key, fallback = '') {
  const v = process.env[key];
  if (v == null) return fallback;
  return String(v).trim().replace(/^['"]|['"]$/g, '');
}
function num(key, fallback) {
  const v = Number(env(key, String(fallback)));
  return Number.isFinite(v) ? v : fallback;
}
function digits(key, fallback = '') {
  return env(key, fallback).replace(/\D/g, '');
}

const port    = num('PORT', 3000);
const nodeEnv = env('NODE_ENV', 'development');

module.exports = {
  port,
  nodeEnv,
  // Mantém os dois nomes por compatibilidade: o bootstrap usa isProduction,
  // enquanto módulos antigos usam isProd.
  isProd: nodeEnv === 'production',
  isProduction: nodeEnv === 'production',

  sessionSecret: env('SESSION_SECRET', 'dark-secret-change-me-2025'),
  appUrl:        env('APP_URL', `http://localhost:${port}`),

  // Canal WhatsApp (aparece no menu)
  channelUrl: env('WHATSAPP_CHANNEL_URL', 'https://whatsapp.com/channel/0029VbC8voN4Y9lszc9VuT2D'),

  owner: {
    name:     env('OWNER_NAME',     'Dark Net'),
    number:   digits('OWNER_NUMBER', ''),
    username: env('OWNER_USERNAME', 'darknet').toLowerCase(),
    password: env('OWNER_PASSWORD', ''),
  },

  bot: {
    name:   env('BOT_NAME',   'DARK BOT'),
    number: digits('BOT_NUMBER', ''),
    // O prefixo documentado e usado no deploy é o ponto.
    prefix: env('BOT_PREFIX', '.'),
  },

  mongodb: { uri: env('MONGODB_URI', '') },

  cloudinary: {
    cloud_name: env('CLOUDINARY_CLOUD_NAME', ''),
    api_key:    env('CLOUDINARY_API_KEY', ''),
    api_secret: env('CLOUDINARY_API_SECRET', ''),
  },

  ai: {
    // Modelos actualizados Julho 2026
    groqApiKey:       env('GROQ_API_KEY', ''),
    geminiApiKey:     env('GEMINI_API_KEY', ''),
    openrouterApiKey: env('OPENROUTER_API_KEY', ''),
    openaiApiKey:     env('OPENAI_API_KEY', ''),
    model:            env('AI_MODEL', ''),
    // v6.55: Novos providers
    cerebrasApiKey:   env('CEREBRAS_API_KEY', ''),
    apifreellmKey:    env('APIFREELLM_KEY', ''),
    assemblyaiKey:    env('ASSEMBLYAI_API_KEY', ''),
    elevenlabsKey:    env('ELEVENLABS_API_KEY', ''),
    tavilyKey:        env('TAVILY_API_KEY', ''),
    huggingfaceKey:   env('HUGGINGFACE_API_KEY', ''),
    // aliases para compatibilidade
    groqKey:       env('GROQ_API_KEY', ''),
    geminiKey:     env('GEMINI_API_KEY', ''),
    openaiKey:     env('OPENAI_API_KEY', ''),
    openrouterKey: env('OPENROUTER_API_KEY', ''),
  },

  tenorApiKey: env('TENOR_API_KEY', ''),

  // Limites
  maxYoutubeSeconds: num('MAX_YOUTUBE_SECONDS', 5400),
  stickerVideoMaxSec: num('STICKER_VIDEO_MAX_SEC', 8),
};
