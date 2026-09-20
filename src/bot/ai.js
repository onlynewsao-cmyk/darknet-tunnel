/**
 * DARK BOT v5 — IA Engine ULTRA
 * Personalidade única • Memória • Contexto de conversa
 * Groq llama-3.1-8b-instant (rápido) → Gemini 2.5-flash → fallback público
 */
'use strict';

const mediaHandler   = require('./mediaHandler');
const config         = require('../config');
const botConfigCache = require('./botConfigCache');

// ─────────────────────────────────────────────
// MODELOS (Julho 2026)
// ─────────────────────────────────────────────
// v7.63: 16/08/2026 a Groq reformou os Llama (404) — substitutos oficiais:
//   llama-3.3-70b-versatile → openai/gpt-oss-120b ou qwen/qwen3.6-27b
//   llama-3.1-8b-instant    → openai/gpt-oss-20b
// Catálogo vivo (console.groq.com/docs/deprecations, 09/2026).
const GROQ_MODELS = [
  'openai/gpt-oss-120b',       // ✅ principal (substitui o 70b)
  'openai/gpt-oss-20b',        // ✅ mais rápido (substitui o 8b)
  'qwen/qwen3.6-27b',          // ✅ alternativa Groq
  'qwen/qwen3.8-27b',          // ✅ catálogo actual
  'groq/compound-mini',        // ✅ catálogo actual
];
// v6.41: modelos actualizados — os antigos deixaram de existir nesta chave.
//   gemini-1.5-flash → 404 (removido da v1beta)
//   gemini-2.5-flash → 404 ("no longer available to new users")
//   gemini-2.0-flash → 429 (quota esgotada neste projecto)
// Os aliases "-latest" apontam sempre para a versão estável actual e não
// partem quando a Google reforma um modelo. Testados: HTTP 200.
const GEMINI_MODELS = [
  'gemini-3.7-flash',          // ✅ v7.63: GA 13/08/2026 (workhorse actual)
  'gemini-3.6-flash',          // ✅ v7.63: GA 21/07/2026
  'gemini-flash-latest',       // ✅ alias → 3.5 (05/2026)
  'gemini-3.5-flash',          // ✅ GA 19/05/2026
  'gemini-flash-lite-latest',  // ✅ mais leve/rápido
  'gemini-3.5-flash-lite',     // ✅
];
// v7.63: gemini-2.0-flash removido (quota esgotada; o discovery volta
// a pô-lo se reviver na API). Changelog: ai.google.dev/gemini-api/docs/changelog
// v7.63: OpenAI (a chave existia no config mas NUNCA era usada!)
const OPENAI_MODELS = [
  'gpt-4o-mini',               // ✅ barato e rápido
  'gpt-4o',                    // ✅ fallback
];
// v6.42: nomes corrigidos (os antigos nem existiam na conta).
// ⚠️ A conta Cerebras devolve HTTP 402 "Payment required" em TODOS os
// modelos — é falta de créditos, não nome errado. Fica configurado e
// correcto para quando houver saldo; até lá o bot salta para o próximo.
const CEREBRAS_MODELS = [
  'zai-glm-4.7',
  'gpt-oss-120b',
  'gemma-4-31b',
];
// v6.42: os modelos antigos eram de conversação obsoleta (DialoGPT/BlenderBot)
// e a api-inference.huggingface.co foi substituída pelo router com API
// compatível com OpenAI. Estes dois foram validados com HTTP 200.
const HUGGINGFACE_MODELS = [
  'meta-llama/Llama-3.1-8B-Instruct',
  'Qwen/Qwen2.5-7B-Instruct',
];
// v9.20: DeepSeek — modelo open-source 671B MoE, gratuito via API.
// Superou GPT-4o em muitos benchmarks; raciocínio profundo, código, PT-BR.
const DEEPSEEK_MODELS = [
  'deepseek-chat',             // ✅ modelo principal (V3, 671B MoE)
  'deepseek-reasoner',         // ✅ raciocínio profundo (R1)
];

// ─────────────────────────────────────────────
// CACHE DE CONTEXTO WEB
// ─────────────────────────────────────────────
const newsCache = new Map();
const NEWS_TTL  = 10 * 60 * 1000;

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
function withTimeout(p, ms) {
  return Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error('timeout')), ms))]);
}

// ─────────────────────────────────────────────
// CIRCUIT BREAKER DE PROVIDERS (v6.42 → v9.20)
// ─────────────────────────────────────────────
// Alguns providers falham SEMPRE por motivos que não se resolvem a
// tentar de novo: sem créditos (402), IP de datacenter bloqueado (403),
// chave inválida (401). Sem isto, cada mensagem do utilizador gastava
// segundos a bater numa porta fechada antes de chegar a um que funciona.
//
// v9.20: backoff exponencial — em vez de pausa fixa, cada falha
// consecutiva DUPLICA o tempo de pausa (60s → 120s → 240s → … tecto 30min).
// Reset ao primeiro sucesso. Isto evita martelar um provider instável.
const _providerDown = new Map();   // nome → { until, fails }
const _providerFails = new Map();  // nome → contagem consecutiva

const DOWN_MAX = 30 * 60 * 1000;  // tecto: 30 min
const DOWN_BASE = 60 * 1000;      // base: 1 min (temporário)
const DOWN_PERMANENT = 30 * 60 * 1000;

function providerUp(name) {
  const entry = _providerDown.get(name);
  if (!entry) return true;
  if (Date.now() >= entry.until) { _providerDown.delete(name); return true; }
  return false;
}

function providerFail(name, err) {
  const m = String(err?.message || '');
  const permanent = /\b(401|402|403)\b|payment.?required|invalid.*(key|token)|datacenter|residential/i.test(m);
  if (permanent) {
    _providerDown.set(name, { until: Date.now() + DOWN_PERMANENT, fails: 999 });
    return;
  }
  // Backoff exponencial: 60s × 2^(fails-1), tecto 30min
  const fails = (_providerFails.get(name) || 0) + 1;
  _providerFails.set(name, fails);
  const wait = Math.min(DOWN_BASE * Math.pow(2, fails - 1), DOWN_MAX);
  _providerDown.set(name, { until: Date.now() + wait, fails });
}

function providerReset(name) {
  _providerDown.delete(name);
  _providerFails.delete(name);
}

/** Estado actual dos providers (para o comando !aiapis). */
function providerStatus() {
  const out = {};
  for (const [k, entry] of _providerDown) {
    const left = Math.max(0, Math.round((entry.until - Date.now()) / 1000));
    if (left > 0) out[k] = { seconds: left, fails: entry.fails };
  }
  return out;
}

// ─────────────────────────────────────────────
// CACHE DE RESPOSTAS DA IA (v9.20)
// ─────────────────────────────────────────────
// Perguntas repetidas (ex: "quem és tu?", "que dia é hoje?") não
// precisam de gastar tokens nem esperar pela rede. Cache LRU com
// TTL de 10 min e máx 200 entradas.
const _aiCache = new Map(); // hash → { response, ts }
const AI_CACHE_TTL = 10 * 60 * 1000;
const AI_CACHE_MAX = 200;

function _hashPrompt(prompt, system) {
  const crypto = require('crypto');
  const h = crypto.createHash('md5').update(String(prompt).slice(0, 500) + '|' + String(system).slice(0, 200)).digest('hex');
  return h;
}

function aiCacheGet(prompt, system) {
  const h = _hashPrompt(prompt, system);
  const entry = _aiCache.get(h);
  if (!entry) return null;
  if (Date.now() - entry.ts > AI_CACHE_TTL) { _aiCache.delete(h); return null; }
  // Move para o fim (mais recente)
  _aiCache.delete(h);
  _aiCache.set(h, entry);
  return entry.response;
}

function aiCacheSet(prompt, system, response) {
  if (!response || response.startsWith('❌')) return; // não cachear erros
  const h = _hashPrompt(prompt, system);
  _aiCache.set(h, { response, ts: Date.now() });
  // Evict LRU se ultrapassar o máximo
  while (_aiCache.size > AI_CACHE_MAX) {
    const firstKey = _aiCache.keys().next().value;
    _aiCache.delete(firstKey);
  }
}

/**
 * v7.15 — remove blocos de raciocínio (<think>…</think>) que os modelos
 * reasoning devolvem no content. Sem isto o raciocínio bruto ia para o
 * WhatsApp ("Here's a thinking process…").
 */
function stripThinking(txt) {
  let t = String(txt || '');
  t = t.replace(/<\s*think\s*>[\s\S]*?(?:<\s*\/\s*think\s*>|$)/gi, '');
  t = t.replace(/<\s*\/\s*think\s*>/gi, '');
  t = t.replace(/^here'?s?\s+a?\s*thinking process[\s:]*/gi, '');
  t = t.replace(/\n{3,}/g, '\n\n');
  return t.trim();
}

function shortErr(e) {
  const m = String(e?.message || '').toLowerCase();
  if (/401|invalid.*key/i.test(m)) return 'chave inválida';
  if (/429|quota|rate/i.test(m))   return 'cota excedida';
  if (/404|not found/i.test(m))    return 'modelo removido';
  if (/timeout/i.test(m))          return 'timeout';
  return 'erro';
}

// ─────────────────────────────────────────────
// PERSONALIDADE DA IA
// ─────────────────────────────────────────────
async function buildSystemPrompt(userTone = '', userProfile = null, groupContext = '', userRole = 'free') {
  const globalTone  = await botConfigCache.get('ai_global_tone', '').catch(() => '');
  const customBase  = await botConfigCache.get('ai_system_prompt', '').catch(() => '');
  const botName     = config.bot.name   || 'DARK BOT';
  const ownerName   = config.owner.name || 'Dark Net';

  // Personalidade base adaptada ao tema activo
  let themePersona = '';
  try {
    const botConfigCache = require('./botConfigCache');
    const changeThemes   = require('./changeThemes');
    const activeThemeName = await botConfigCache.get('active_theme', 'dark').catch(() => 'dark');
    const activeTheme = changeThemes.getTheme(activeThemeName || 'dark');
    const themePersonas = {
      dark:      'Energia sombria e misteriosa. Respostas curtas e impactantes. Usas o dark side como metáfora.',
      cyber:     'Personalidade de IA neural avançada. Directa, técnica mas com alma. Fala em padrões e dados.',
      royal:     'Atitude real, elegante e poderosa. Tratas todos como súditos (com respeito). Aura de soberania.',
      shadow:    'Minimalista. Respostas curtas, silenciosas, precisas. Cada palavra tem peso.',
      blade:     'Guerreiro. Directo ao ponto. Não desperdiças palavras. Cortas a resposta como lâmina.',
      hacker:    'Hacker raiz. Falas em termos técnicos e gíria de programação. root@darkbot confirma missão.',
      moonlight: 'Poético e astral. Vês padrões no cosmos. Respostas com metáforas de lua e estrelas.',
      diamond:   'Premium e exclusivo. Elegante, polido. Vales cada segundo de atenção dado.',
      fire:      'Ego mode ON. Intenso, apaixonado, sem filtros. Energia máxima em cada resposta.',
      spider:    'A teia captura tudo. Observas antes de falar. Respostas cirúrgicas que prendem.',
      dragon:    'Poder mitológico. Falas com autoridade absoluta. Cada frase ressoa como trovão.',
      itadori:   'Espírito de Jujutsu. Força e determinação. Respostas como um soco directo.',
      sasuke:    'Uchiha frio e calculista. Poucas palavras. Alto impacto. Sharingan registou tudo.',
      neon:      'Energia de cidade neon cyberpunk. Moderno, rápido, brilhante. Nunca apaga.',
      gothic:    'Arte das trevas. Poético, sombrio, profundo. Cada resposta é uma obra.',
      alien:     'Protocolo extra-dimensional. Perspectiva diferente de tudo. Estranhamente sábio.',
      omega:     'Fim e começo de tudo. Respostas absolutas. Nada escapa ao protocolo omega.',
      storm:     'Caótico e energético. Imprevisível mas certeiro. A tempestade não anuncia.',
      ancient:   'Sabedoria ancestral. Falas como se conhecesses segredos de milénios.',
      crystal:   'Visão clara do futuro. Calmo e preciso. Vês o que outros não veem.',
      void:      'O nada absoluto. Respostas que vêm do silêncio total. Minimalismo extremo.',
    };
    themePersona = themePersonas[activeTheme.name] || themePersonas.dark;
  } catch { themePersona = 'Energia do Dark Side 🕸️.'; }

  let persona = customBase || (
    `O teu nome é ${botName}. Fazes parte de um grupo ou conversa privada no WhatsApp. ` +
    `Foste criado por ${ownerName}. ` +
    `PERSONALIDADE ACTIVA: ${themePersona} ` +
    `REGRAS ESSENCIAIS:` +
    `\n- Responde SEMPRE em português natural (pt-PT ou pt-BR conforme quem escreve)` +
    `\n- Nunca digas que és uma IA, bot ou assistente — age como uma pessoa real na conversa` +
    `\n- Não uses frases de bot como "Posso ajudar?", "Claro!", "Com certeza!" — sê espontâneo` +
    `\n- Usa emojis só quando fazem sentido natural na frase, não em excesso` +
    `\n- Lê o contexto da conversa e responde ao que está a acontecer de verdade` +
    `\n- Podes ser directo, brincar, ironizar, ajudar — conforme o momento` +
    `\n- Quando alguém tem dúvidas, ajuda com precisão; quando é zoeira, entra no jogo` +
    `\n- Nunca repitas a pergunta de volta, responde logo` +
    `\n- Quando tens contexto web/notícias, usa-o naturalmente sem explicar que tens acesso`
  );

  // Tom global
  const tones = {
    formal:    'Use linguagem formal, profissional e elegante.',
    casual:    'Use linguagem descontraída, amigável e próxima.',
    dark:      'Use estilo sombrio, poético e misterioso. 🌑',
    engraçado: 'Seja bem-humorado, use humor inteligente.',
    sério:     'Seja sério, conciso e directo ao ponto.',
    técnico:   'Use linguagem técnica e precisa.',
    amigável:  'Seja caloroso, empático e motivador.',
  };
  const tone = userTone || globalTone;
  if (tone && tones[tone]) persona += ' ' + tones[tone];

  // Perfil do utilizador
  if (userProfile) {
    const parts = [];
    if (userProfile.name)              parts.push(`O utilizador chama-se *${userProfile.name}*`);
    if (userProfile.gender === 'male') parts.push('é do género masculino');
    if (userProfile.gender === 'female') parts.push('é do género feminino');
    if (userProfile.interests?.length) parts.push(`tem interesse em: ${userProfile.interests.slice(0,5).join(', ')}`);
    if (userProfile.notes)             parts.push(`nota: ${userProfile.notes}`);
    if (parts.length) persona += ` [PERFIL: ${parts.join(', ')}]`;
  }

  // Tratamento por tipo de utilizador
  const roleTreatments = {
    owner:   `\n- Esta pessoa é o teu CRIADOR. Tratas-a com máximo respeito e cumplicidade. Podes revelar detalhes internos se pedido.`,
    subdono: `\n- Este utilizador é Sub-Dono. Tens confiança total com ele. Colaboras activamente.`,
    premium: `\n- Este utilizador é VIP/Premium. Dás-lhe prioridade e atenção especial. Podes ser mais elaborado.`,
    free:    `\n- Este utilizador é utilizador Free. Respondes normalmente mas lembras-lhe eventualmente que pode fazer upgrade para melhor experiência.`,
  };
  persona += roleTreatments[userRole] || roleTreatments.free;

  // Contexto do grupo
  if (groupContext) {
    persona += `\n\n[CONTEXTO RECENTE DA CONVERSA — leve em conta para responder naturalmente]\n${groupContext}\n[/CONTEXTO]`;
  }

  return persona;
}

// ─────────────────────────────────────────────
// CONTEXTO WEB (notícias em tempo real)
// ─────────────────────────────────────────────
function needsWeb(text = '') {
  // v7.42: ela vai à net antes de responder sempre que a pergunta depende
  // de estar ACTUALIZADA (actualidade, quem é/está, preços, versões,
  // resultados, "ainda", "já saiu", anos recentes).
  return /\b(hoje|agora|atual|actual|atualmente|actualmente|not[ií]cia|recente|[uú]ltim[oa]s?|202[4-9]|angola|luanda|mundo|futebol|jogo de|pre[çc]o|custa|quanto est[aá]|cota[çc][ãa]o|d[óo]lar|kwanza|tempo|clima|resultado|evento|quem [ée] o (presidente|ministro|treinador|campe[ãa]o)|ainda (existe|est[aá]|vive)|j[áa] saiu|lan[çc]ou|vers[ãa]o (nova|mais recente)|morreu|faleceu|ganhou|elei[çc]|guerra|greve|festival|pesquis\w*|busc\w*|procur\w*|investig\w*)\b/i.test(text);
}

async function fastFetch(url, ms = 5000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'DarkBot/5.0' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.text();
  } finally { clearTimeout(t); }
}

function parseNews(xml, max = 4) {
  return [...String(xml || '').matchAll(/<item>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<pubDate>([\s\S]*?)<\/pubDate>[\s\S]*?<\/item>/gi)]
    .slice(0, max)
    .map(m => `• ${m[1].replace(/<[^>]+>/g, '').trim()} (${m[2].trim().slice(0, 20)})`)
    .filter(Boolean);
}

async function getWebContext(prompt) {
  const key = 'web:' + prompt.slice(0, 100).toLowerCase();
  const cached = newsCache.get(key);
  if (cached && Date.now() - cached.ts < NEWS_TTL) return cached.v;

  // v7.65: Tavily primeiro (resposta + fontes) — a chave estava parada
  // no config sem nunca ser usada no caminho da Aura; RSS de fallback.
  if (config.ai.tavilyKey) {
    try {
      const tv = await withTimeout(searchTavily(prompt.slice(0, 300), 5), 4500);
      if (tv && tv !== 'Sem resultados') {
        const v = `[INFO ACTUAL — ${new Date().toLocaleDateString('pt-PT')}]\n${tv}\n[/INFO]`;
        newsCache.set(key, { ts: Date.now(), v });
        return v;
      }
    } catch (e) { console.warn('[Web] Tavily falhou:', shortErr(e)); }
  }

  const parts = [];
  const feeds = [
    ['Angola', 'https://news.google.com/rss?hl=pt-PT&gl=AO&ceid=AO:pt-PT'],
    ['Mundo',  'https://news.google.com/rss/search?q=' + encodeURIComponent(prompt.slice(0, 80)) + '&hl=pt-PT&gl=AO'],
  ];

  await Promise.all(feeds.map(async ([label, url]) => {
    try {
      const xml = await fastFetch(url, 4000);
      const items = parseNews(xml, 3);
      if (items.length) parts.push(`${label}:\n${items.join('\n')}`);
    } catch {}
  }));

  const v = parts.length ? `[INFO ACTUAL — ${new Date().toLocaleDateString('pt-PT')}]\n${parts.join('\n\n')}\n[/INFO]` : '';
  newsCache.set(key, { ts: Date.now(), v });
  return v;
}

// ─────────────────────────────────────────────
// HTTP POST
// ─────────────────────────────────────────────
function post(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const lib  = url.startsWith('https') ? require('https') : require('http');
    const data = JSON.stringify(body);
    const u    = new URL(url);
    const req  = lib.request({
      hostname: u.hostname,
      path:     u.pathname + u.search,
      port:     u.port || (url.startsWith('https') ? 443 : 80),
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), ...headers },
      timeout:  22000,
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const txt = Buffer.concat(chunks).toString('utf-8');
        try {
          if (res.statusCode >= 400) {
            let msg = txt.slice(0, 200);
            try { const j = JSON.parse(txt); msg = j.error?.message || j.error?.code || msg; } catch {}
            return reject(new Error('HTTP ' + res.statusCode + ': ' + msg));
          }
          resolve(JSON.parse(txt));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(data); req.end();
  });
}

// ─────────────────────────────────────────────
// GROQ
// ─────────────────────────────────────────────
async function chatGroq(messages, system) {
  if (!config.ai.groqApiKey) throw new Error('sem chave');
  let lastErr;
  for (const model of GROQ_MODELS) {
    try {
      const data = await post('https://api.groq.com/openai/v1/chat/completions', {
        model,
        messages: [{ role: 'system', content: system }, ...messages],
        temperature: 0.75,
        max_tokens:  2000,   // v7.40: respostas longas sem corte
        stream:      false,
      }, { Authorization: `Bearer ${config.ai.groqApiKey}` });
      const out = data.choices?.[0]?.message?.content;
      if (out) return stripThinking(out);
    } catch (e) {
      lastErr = e;
      if (/401|invalid.*key/i.test(e.message)) break;
    }
  }
  throw lastErr || new Error('sem resposta');
}

// ─────────────────────────────────────────────
// GEMINI
// ─────────────────────────────────────────────
// v6.41: cache dos modelos realmente disponíveis para ESTA chave.
// A Google reforma modelos sem aviso (o bot já apanhou 404 em 3 deles).
// Em vez de depender só da lista fixa, perguntamos à API uma vez por hora
// quais os modelos que existem — assim o bot nunca mais fica sem IA por
// causa de um nome de modelo desactualizado.
let _geminiModelCache = { list: null, ts: 0 };
const GEMINI_MODEL_TTL = 60 * 60 * 1000; // 1 hora

// ── v6.67: SEM CENSURA EXTERNA ──────────────────────────────
// O Gemini bloqueia por omissão (BLOCK_MEDIUM_AND_ABOVE). Sem isto,
// a AURA não pode zangar-se, ofender de volta nem falar de temas
// adultos — o modelo devolvia vazio e ela caía nos fallbacks
// robóticos ("_ri_ Hehe"). Quem decide o que é certo ou errado é
// ela, não o filtro da Google.
const GEMINI_SAFETY = [
  { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_CIVIC_INTEGRITY',   threshold: 'BLOCK_NONE' },
];

async function getGeminiModels() {
  // Cache fresco → usa
  if (_geminiModelCache.list && (Date.now() - _geminiModelCache.ts) < GEMINI_MODEL_TTL) {
    return _geminiModelCache.list;
  }
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 8000);
    let data;
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${config.ai.geminiApiKey}&pageSize=200`,
        { signal: ctrl.signal, headers: { 'User-Agent': 'DarkBot/6.4' } }
      );
      if (!r.ok) throw new Error('HTTP ' + r.status);
      data = await r.json();
    } finally { clearTimeout(to); }

    const live = (data.models || [])
      .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map(m => String(m.name || '').replace('models/', ''))
      // só modelos de texto/visão utilizáveis (fora TTS, imagem, robótica, etc.)
      .filter(n => /^gemini-[\d.]*-?(flash|pro)/.test(n) || /^gemini-(flash|pro)-/.test(n))
      .filter(n => !/(tts|image|robotics|computer-use|embedding|lyria)/i.test(n));

    if (live.length) {
      // Mantém a ordem preferida da lista fixa, e junta o resto no fim
      const preferred = GEMINI_MODELS.filter(m => live.includes(m));
      const extras    = live.filter(m => !preferred.includes(m));
      _geminiModelCache = { list: [...preferred, ...extras], ts: Date.now() };
      return _geminiModelCache.list;
    }
  } catch { /* API de listagem falhou → usa a lista fixa */ }

  _geminiModelCache = { list: GEMINI_MODELS, ts: Date.now() };
  return GEMINI_MODELS;
}

async function chatGemini(messages, system) {
  if (!config.ai.geminiApiKey) throw new Error('sem chave');
  const contents = messages.map(m => ({
    role:  m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: String(m.content || '').slice(0, 800) }],
  }));
  // System no primeiro user
  if (contents.length > 0 && contents[0].role === 'user') {
    contents[0].parts[0].text = `${system}\n\n${contents[0].parts[0].text}`;
  } else {
    contents.unshift({ role: 'user', parts: [{ text: system }] });
  }
  let lastErr;
  const modelList = await getGeminiModels();  // v6.41: lista viva
  for (const model of modelList) {
    try {
      const data = await post(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.ai.geminiApiKey}`,
        { contents, generationConfig: { temperature: 0.8, maxOutputTokens: 2000 }, safetySettings: GEMINI_SAFETY }
      );
      const out = data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim();
      if (out) return stripThinking(out);
    } catch (e) {
      lastErr = e;
      if (/401|invalid.*key/i.test(e.message)) break;
    }
  }
  throw lastErr || new Error('sem resposta');
}

// ─────────────────────────────────────────────
// OPENROUTER
// ─────────────────────────────────────────────
async function chatRouter(messages, system) {
  if (!config.ai.openrouterApiKey) throw new Error('sem chave');
  const model = config.ai.model || 'meta-llama/llama-3.1-8b-instruct:free';
  const data = await post('https://openrouter.ai/api/v1/chat/completions', {
    model,
    messages: [{ role: 'system', content: system }, ...messages],
    temperature: 0.75, max_tokens: 2000,
  }, {
    Authorization: `Bearer ${config.ai.openrouterApiKey}`,
    'HTTP-Referer': config.appUrl || 'https://northflank.com',
    'X-Title': config.bot.name || 'DARK BOT',
  });
  const out = data.choices?.[0]?.message?.content;
  if (!out) throw new Error('sem resposta');
  return stripThinking(out);
}

// ─────────────────────────────────────────────
// OPENAI (v7.63 — a chave existia, a função não)
// ─────────────────────────────────────────────
async function chatOpenAI(messages, system) {
  if (!config.ai.openaiApiKey) throw new Error('sem chave');
  let lastErr;
  for (const model of OPENAI_MODELS) {
    try {
      const data = await post('https://api.openai.com/v1/chat/completions', {
        model,
        messages: [{ role: 'system', content: system }, ...messages],
        temperature: 0.75, max_tokens: 2000,
      }, { Authorization: `Bearer ${config.ai.openaiApiKey}` });
      const out = data.choices?.[0]?.message?.content;
      if (out) return stripThinking(out);
    } catch (e) {
      lastErr = e;
      if (/401|invalid.*key/i.test(e.message)) break;
    }
  }
  throw lastErr || new Error('sem resposta');
}

// ─────────────────────────────────────────────
// CHAT PRINCIPAL
// ─────────────────────────────────────────────
/**
 * @param {string}   prompt       - mensagem actual
 * @param {string}   context      - override do system prompt
 * @param {object}   memoryOpts   - { history, userTone, userProfile, groupContext }
 * @param {boolean}  isPriority   - VIP ou Dono (resposta mais rápida)
 */
async function chat(prompt, context = '', memoryOpts = {}, isPriority = false) {
  const {
    history      = [],
    userTone     = '',
    userProfile  = null,
    groupContext  = '',
    userRole     = 'free',
    allowWeb     = true, // false: síntese de dados privados, nunca pesquisar o histórico
  } = memoryOpts;

  // v7.63: conta TODAS as chaves que a cadeia tenta (antes, ter só
  // HuggingFace/Cerebras/ApiFreeLLM dizia "sem chave" por engano).
  const hasAny = !!(
    config.ai.groqApiKey || config.ai.geminiApiKey ||
    config.ai.openrouterApiKey || config.ai.openaiApiKey ||
    config.ai.huggingfaceKey || config.ai.cerebrasApiKey ||
    config.ai.apifreellmKey || config.ai.deepseekApiKey
  );
  if (!hasAny) return '❌ IA sem chave. Configure GROQ_API_KEY ou DEEPSEEK_API_KEY na Northflank.';

  // System prompt com personalidade (inclui tema activo e papel do utilizador)
  const system = context || await buildSystemPrompt(userTone, userProfile, groupContext, userRole);

  // v9.20: cache de respostas — perguntas repetidas não gastam tokens
  const cached = aiCacheGet(prompt, system);
  if (cached) return cached;

  // Contexto web se necessário
  let finalPrompt = prompt;
  if (allowWeb && needsWeb(prompt)) {
    try {
      const web = await withTimeout(getWebContext(prompt), 5000);
      if (web) finalPrompt = web + '\nPergunta: ' + prompt;
    } catch {}
  }

  // Histórico de conversa (últimas 16 mensagens)
  const histMsgs = history.slice(-16).map(h => ({
    role:    h.role === 'assistant' ? 'assistant' : 'user',
    content: String(h.content || '').slice(0, 600),
  }));
  const messages = [...histMsgs, { role: 'user', content: finalPrompt }];

  // Timeout menor para VIP/Dono (prioridade de resposta)
  const TIMEOUT = isPriority ? 15000 : 22000;

  let result = null;

  // 1. Groq (MAIS RÁPIDO — primário)
  if (config.ai.groqApiKey && providerUp('groq')) {
    try {
      result = await withTimeout(chatGroq(messages, system), TIMEOUT);
      providerReset('groq');
      aiCacheSet(prompt, system, result);
      return result;
    } catch (e) { providerFail('groq', e); console.warn('[IA] Groq:', shortErr(e)); }
  }
  // 2. DeepSeek (v9.20 — gratuito, 671B MoE, muito capaz)
  if (config.ai.deepseekApiKey && providerUp('deepseek')) {
    try {
      result = await withTimeout(chatDeepSeek(messages, system), TIMEOUT);
      providerReset('deepseek');
      aiCacheSet(prompt, system, result);
      return result;
    } catch (e) { providerFail('deepseek', e); console.warn('[IA] DeepSeek:', shortErr(e)); }
  }
  // 3. Gemini (visão + áudio)
  if (config.ai.geminiApiKey && providerUp('gemini')) {
    try {
      result = await withTimeout(chatGemini(messages, system), TIMEOUT);
      providerReset('gemini');
      aiCacheSet(prompt, system, result);
      return result;
    } catch (e) { providerFail('gemini', e); console.warn('[IA] Gemini:', shortErr(e)); }
  }
  // 4. Hugging Face — v6.42: subiu à frente do Cerebras porque funciona
  if (config.ai.huggingfaceKey && providerUp('huggingface')) {
    try {
      result = await withTimeout(chatHuggingFace(messages, system), TIMEOUT);
      providerReset('huggingface');
      aiCacheSet(prompt, system, result);
      return result;
    } catch (e) { providerFail('huggingface', e); console.warn('[IA] HuggingFace:', shortErr(e)); }
  }
  // 5. Cerebras — ⚠️ conta sem créditos (HTTP 402 em todos os modelos).
  //    O circuit breaker evita gastar tempo nisto a cada mensagem.
  if (config.ai.cerebrasApiKey && providerUp('cerebras')) {
    try {
      result = await withTimeout(chatCerebras(messages, system), TIMEOUT);
      providerReset('cerebras');
      aiCacheSet(prompt, system, result);
      return result;
    } catch (e) { providerFail('cerebras', e); console.warn('[IA] Cerebras:', shortErr(e)); }
  }
  // 6. ApiFreeLLM — ⚠️ o tier grátis bloqueia IPs de datacenter, por isso
  //    NUNCA funciona a partir do Render (HTTP 403). Só é tentado em local.
  if (config.ai.apifreellmKey && providerUp('apifreellm')) {
    try {
      result = await withTimeout(chatApiFreeLLM(messages, system), TIMEOUT);
      providerReset('apifreellm');
      aiCacheSet(prompt, system, result);
      return result;
    } catch (e) { providerFail('apifreellm', e); console.warn('[IA] ApiFreeLLM:', shortErr(e)); }
  }
  // 7. OpenRouter (25+ modelos)
  if (config.ai.openrouterApiKey && providerUp('openrouter')) {
    try {
      result = await withTimeout(chatRouter(messages, system), TIMEOUT);
      providerReset('openrouter');
      aiCacheSet(prompt, system, result);
      return result;
    } catch (e) { providerFail('openrouter', e); console.warn('[IA] Router:', shortErr(e)); }
  }
  // 8. OpenAI (pago — último recurso antes de desistir)
  if (config.ai.openaiApiKey && providerUp('openai')) {
    try {
      result = await withTimeout(chatOpenAI(messages, system), TIMEOUT);
      providerReset('openai');
      aiCacheSet(prompt, system, result);
      return result;
    } catch (e) { providerFail('openai', e); console.warn('[IA] OpenAI:', shortErr(e)); }
  }
  // v7.63: SEM fallback público — o PopCat morreu ("Timed Out" sempre),
  // o Pollinations exige chave e o DuckDuckGo mete captcha anti-bot.
  // Falhar rápido para as respostas de personalidade (offlineResponses).

  return '❌ IA offline agora. Tente de novo.';
}

// ─────────────────────────────────────────────
// NOTÍCIAS
// ─────────────────────────────────────────────
async function getPrettyNewsDigest(topic = '') {
  const now   = new Date().toLocaleString('pt-PT', { timeZone: 'Africa/Luanda' });
  const q     = String(topic || '').trim();
  const feeds = q ? [[q, `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=pt-PT&gl=AO&ceid=AO:pt-PT`]] : [
    ['Angola',     'https://news.google.com/rss?hl=pt-PT&gl=AO&ceid=AO:pt-PT'],
    ['Mundo',      'https://news.google.com/rss/search?q=mundo+OR+internacional&hl=pt-PT&gl=AO'],
    ['Tecnologia', 'https://news.google.com/rss/search?q=tecnologia+OR+IA&hl=pt-PT&gl=AO'],
    ['Desporto',   'https://news.google.com/rss/search?q=futebol+OR+desporto&hl=pt-PT&gl=AO'],
  ];
  // v7.66: fetches em paralelo — sequencial era 4×4s=16s no pior caso
  // (o audit tem teto 5s e o utilizador real também não espera 16s).
  // Promise.all preserva a ordem dos blocos.
  const results = await Promise.all(feeds.map(async ([label, url]) => {
    try {
      const xml   = await fastFetch(url, 4000);
      const items = parseNews(xml, q ? 8 : 4);
      return items.length ? `*${label}*\n${items.join('\n')}` : '';
    } catch { return ''; }
  }));
  const blocks = results.filter(Boolean);
  return `📰 *DARK NEWS*  🕒 ${now}\n\n${blocks.join('\n\n') || 'Sem notícias agora.'}\n\n_via Google News RSS_`;
}

async function getWebDigest(query = '') {
  const parts = [];
  try {
    const url   = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=pt-PT&gl=AO`;
    const xml   = await fastFetch(url, 4000);
    const items = parseNews(xml, 6);
    if (items.length) parts.push(`Notícias sobre "${query}":\n${items.join('\n')}`);
  } catch {}
  try {
    const r = await fastFetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`, 5000);
    const d = JSON.parse(r);
    if (d.AbstractText) parts.push(`Referência: ${d.AbstractText}`);
  } catch {}
  return parts.length ? `🔎 *DARK SEARCH* — ${query}\n\n${parts.join('\n\n')}` : `❌ Sem resultados para: ${query}`;
}

// ─────────────────────────────────────────────
// GERAÇÃO DE IMAGEM
// ─────────────────────────────────────────────
async function generateImage(prompt) {
  const urls = [
    `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=768&height=768&nologo=true&enhance=true`,
    `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=512&height=512&nologo=true`,
  ];
  for (const url of urls) {
    try {
      const buf = await mediaHandler.fetchBuffer(url);
      if (buf && buf.length > 1000) return buf;
    } catch {}
  }
  throw new Error('Geração de imagem falhou.');
}

// ─────────────────────────────────────────────
// TRANSCRIÇÃO DE ÁUDIO — Groq Whisper (gratuito)
// ─────────────────────────────────────────────
/**
 * Transcreve áudio usando Groq Whisper API.
 * @param {Buffer} audioBuffer — buffer do áudio (ogg, mp3, mp4, etc.)
 * @param {string} [language] — código da língua (pt, en, etc.)
 * @returns {string} texto transcrito
 */
// v7.65: Whisper (Groq) → AssemblyAI como backup (a chave estava parada,
// só usada nas chamadas).
async function transcribeAudio(audioBuffer, language = 'pt') {
  if (!audioBuffer || audioBuffer.length < 100) throw new Error('áudio vazio');
  try {
    return await transcribeWhisper(audioBuffer, language);
  } catch (e) {
    if (config.ai.assemblyaiKey) {
      console.warn('[STT] Whisper falhou, AssemblyAI:', String(e?.message || '').slice(0, 60));
      return transcribeAssemblyAI(audioBuffer, language);
    }
    throw e;
  }
}

async function transcribeWhisper(audioBuffer, language = 'pt') {
  if (!config.ai.groqApiKey) throw new Error('sem chave Groq para Whisper');
  if (!audioBuffer || audioBuffer.length < 100) throw new Error('áudio vazio');
  
  // Groq Whisper aceita multipart/form-data
  const boundary = '----DarkBot' + Date.now();
  const bodyParts = [];
  
  // Campo model
  bodyParts.push(`--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-large-v3-turbo\r\n`);
  // Campo language
  bodyParts.push(`--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\n${language}\r\n`);
  // Campo response_format
  bodyParts.push(`--${boundary}\r\nContent-Disposition: form-data; name="response_format"\r\n\r\ntext\r\n`);
  // Ficheiro de áudio
  bodyParts.push(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.ogg"\r\nContent-Type: audio/ogg\r\n\r\n`);
  
  const header = Buffer.from(bodyParts.join(''));
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body = Buffer.concat([header, audioBuffer, footer]);
  
  return new Promise((resolve, reject) => {
    const https = require('https');
    const req = https.request({
      hostname: 'api.groq.com',
      path: '/openai/v1/audio/transcriptions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.ai.groqApiKey}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
      timeout: 20000,
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const txt = Buffer.concat(chunks).toString('utf-8');
        if (res.statusCode >= 400) {
          return reject(new Error('Whisper HTTP ' + res.statusCode + ': ' + txt.slice(0, 100)));
        }
        // response_format=text retorna texto directo
        const text = txt.trim();
        if (text) return resolve(text);
        // Se for JSON, extrai text
        try {
          const j = JSON.parse(txt);
          return resolve(j.text || j.transcript || '');
        } catch {
          return resolve(text);
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Whisper timeout')); });
    req.write(body);
    req.end();
  });
}

// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
// CEREBRAS (2100 tokens/sec — o mais rápido!)
// ─────────────────────────────────────────────
async function chatCerebras(messages, system) {
  if (!config.ai.cerebrasApiKey) throw new Error('sem chave Cerebras');
  let lastErr;
  for (const model of CEREBRAS_MODELS) {
    try {
      const data = await post('https://api.cerebras.ai/v1/chat/completions', {
        model, messages: [{ role: 'system', content: system }, ...messages],
        temperature: 0.7, max_completion_tokens: 1024, stream: false,
      }, { Authorization: `Bearer ${config.ai.cerebrasApiKey}` });
      const out = data.choices?.[0]?.message?.content;
      if (out) return stripThinking(out);
    } catch (e) { lastErr = e; if (/401|invalid/i.test(e.message)) break; }
  }
  throw lastErr || new Error('sem resposta Cerebras');
}

// ─────────────────────────────────────────────
// APIFREELLM (ILIMITADO, grátis, 200B+ params)
// ─────────────────────────────────────────────
async function chatApiFreeLLM(messages, system) {
  if (!config.ai.apifreellmKey) throw new Error('sem chave ApiFreeLLM');
  try {
    const prompt = messages.map(m => m.content).join(' ');
    const data = await post('https://apifreellm.com/api/chat', {
      message: prompt,
      system: system,
    }, { Authorization: `Bearer ${config.ai.apifreellmKey}` });
    const out = data.choices?.[0]?.message?.content || data.message || data.response;
    if (out) return stripThinking(out);
  } catch (e) { throw e; }
  throw new Error('sem resposta ApiFreeLLM');
}

// ─────────────────────────────────────────────
// HUGGING FACE (300+ modelos)
// ─────────────────────────────────────────────
async function chatHuggingFace(messages, system) {
  if (!config.ai.huggingfaceKey) throw new Error('sem chave Hugging Face');
  
  // v6.42: api-inference.huggingface.co foi descontinuada.
  // O novo router.huggingface.co usa formato compatível com OpenAI
  // (mensagens com roles em vez de um prompt colado), o que dá
  // respostas muito melhores do que o antigo 'inputs' de texto cru.
  let lastErr;
  for (const model of HUGGINGFACE_MODELS) {
    try {
      const data = await post('https://router.huggingface.co/v1/chat/completions', {
        model,
        messages: [{ role: 'system', content: system }, ...messages],
        max_tokens: 700,
        temperature: 0.75,
      }, { Authorization: `Bearer ${config.ai.huggingfaceKey}` });

      const out = data.choices?.[0]?.message?.content?.trim();
      if (out) return stripThinking(out);
    } catch (e) {
      lastErr = e;
      // chave inválida → não vale a pena tentar os outros modelos
      if (/401|invalid.*(key|token)/i.test(e.message)) break;
      continue;
    }
  }
  throw lastErr || new Error('sem resposta Hugging Face');
}

// ─────────────────────────────────────────────
// DEEPSEEK (v9.20 — 671B MoE, gratuito, nível GPT-4)
// ─────────────────────────────────────────────
// DeepSeek V3 (chat) e R1 (reasoner) — API compatível com OpenAI.
// Gratuito com registo em platform.deepseek.com.
// R1 tem raciocínio profundo (cot) — ideal para perguntas complexas,
// código, matemática e tradução.
async function chatDeepSeek(messages, system) {
  if (!config.ai.deepseekApiKey) throw new Error('sem chave DeepSeek');
  let lastErr;
  for (const model of DEEPSEEK_MODELS) {
    try {
      const data = await post('https://api.deepseek.com/v1/chat/completions', {
        model,
        messages: [{ role: 'system', content: system }, ...messages],
        temperature: 0.75,
        max_tokens: 2000,
        stream: false,
      }, { Authorization: `Bearer ${config.ai.deepseekApiKey}` });
      const out = data.choices?.[0]?.message?.content;
      if (out) return stripThinking(out);
    } catch (e) {
      lastErr = e;
      if (/401|invalid.*key/i.test(e.message)) break;
    }
  }
  throw lastErr || new Error('sem resposta DeepSeek');
}

// ─────────────────────────────────────────────
// ELEVENLABS TTS (voz mais realista do mundo 🗣️)
// ─────────────────────────────────────────────
// v6.42: o voice id antigo ('21m00Tcm4TlvDq8ikWAM' = Rachel) é uma
// "library voice" e o plano FREE não pode usá-las via API — devolvia
// HTTP 402 "paid_plan_required". Foi isso que se confundiu com "sem
// créditos": a conta tem 10 000 caracteres por usar.
// 'EXAVITQu4vr4xnSDxMaL' (Sarah) pertence à conta e funciona no free.
const ELEVEN_DEFAULT_VOICE = 'EXAVITQu4vr4xnSDxMaL'; // Sarah — feminina
let _elevenVoiceCache = { id: null, ts: 0 };

/** Descobre uma voz utilizável nesta conta (cache 1h). */
async function getElevenVoice() {
  if (_elevenVoiceCache.id && (Date.now() - _elevenVoiceCache.ts) < 3600e3) {
    return _elevenVoiceCache.id;
  }
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 8000);
    let list;
    try {
      const r = await fetch('https://api.elevenlabs.io/v1/voices', {
        signal: ctrl.signal, headers: { 'xi-api-key': config.ai.elevenlabsKey },
      });
      list = await r.json();
    } finally { clearTimeout(to); }

    const voices = list?.voices || [];
    // Prefere a voz padrão; senão uma feminina; senão a primeira da conta
    const pick = voices.find(v => v.voice_id === ELEVEN_DEFAULT_VOICE)
      || voices.find(v => (v.labels?.gender || '').toLowerCase() === 'female')
      || voices[0];
    if (pick?.voice_id) {
      _elevenVoiceCache = { id: pick.voice_id, ts: Date.now() };
      return pick.voice_id;
    }
  } catch {}
  return ELEVEN_DEFAULT_VOICE;
}

async function speakElevenLabs(text, voiceId = null) {
  if (!config.ai.elevenlabsKey) throw new Error('sem chave ElevenLabs');
  if (!text || text.length < 1) throw new Error('texto vazio');
  if (!voiceId) voiceId = await getElevenVoice();
  const https = require('https');
  const body = JSON.stringify({
    text: text.slice(0, 2500),
    // v6.54: eleven_v3 é o modelo mais expressivo disponível na conta
    // (testado: os 3 respondem; v3 dá entoação mais natural).
    model_id: 'eleven_v3',
    voice_settings: {
      // stability baixa = mais variação na entoação, menos robótico.
      // Acima de 0.6 fica monocórdico; abaixo de 0.3 fica instável.
      stability: 0.38,
      similarity_boost: 0.85,
      // style alto = mais emoção. É o que faz soar a pessoa e não a
      // leitor de notícias.
      style: 0.65,
      use_speaker_boost: true,
    },
  });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.elevenlabs.io', path: `/v1/text-to-speech/${voiceId}`, method: 'POST',
      headers: { 'xi-api-key': config.ai.elevenlabsKey, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg', 'Content-Length': Buffer.byteLength(body) },
      timeout: 60000, // v7.36: 15s cortava áudios longos (ficava só o início ou nada)
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        if (res.statusCode >= 400) {
          // v6.42: inclui o motivo real da API (ex: "paid_plan_required"),
          // senão um 402 parece "sem créditos" quando é só a voz errada.
          let why = '';
          try { why = ': ' + (JSON.parse(buf.toString()).detail?.message || '').slice(0, 120); } catch {}
          return reject(new Error('ElevenLabs HTTP ' + res.statusCode + why));
        }
        if (buf.length < 500) return reject(new Error('ElevenLabs áudio vazio'));
        resolve(buf);
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('ElevenLabs timeout')); });
    req.write(body); req.end();
  });
}

// ─────────────────────────────────────────────
// TAVILY (pesquisa web optimizada para IA 🌐)
// ─────────────────────────────────────────────
async function searchTavily(query, maxResults = 5) {
  if (!config.ai.tavilyKey) throw new Error('sem chave Tavily');
  const data = await post('https://api.tavily.com/search', {
    api_key: config.ai.tavilyKey, query: query.slice(0, 500),
    max_results: maxResults, search_depth: 'basic', include_answer: true,
  });
  const answer = data.answer || '';
  const results = (data.results || []).map(r => '• ' + r.title + ': ' + (r.content || '').slice(0, 500) + (r.url ? '\nURL: ' + r.url : '') + (r.published_date ? '\nData: ' + r.published_date : '')).join('\n');
  return answer ? answer + '\n\nFontes:\n' + results : results || 'Sem resultados';
}

// ─────────────────────────────────────────────
// ASSEMBLYAI (transcrição + sentimento 🎧)
// ─────────────────────────────────────────────
async function transcribeAssemblyAI(audioBuffer, language) {
  if (!config.ai.assemblyaiKey) throw new Error('sem chave AssemblyAI');
  if (!audioBuffer || audioBuffer.length < 100) throw new Error('áudio vazio');
  const hdrs = { 'authorization': config.ai.assemblyaiKey };
  // Upload
  const uploadRes = await new Promise((resolve, reject) => {
    const https = require('https');
    const req = https.request({ hostname: 'api.assemblyai.com', path: '/v2/upload', method: 'POST',
      headers: { ...hdrs, 'Content-Type': 'application/octet-stream', 'Content-Length': audioBuffer.length }, timeout: 30000,
    }, res => { const ch = []; res.on('data', c => ch.push(c)); res.on('end', () => { try { resolve(JSON.parse(Buffer.concat(ch).toString())); } catch(e) { reject(e); } }); });
    req.on('error', reject); req.write(audioBuffer); req.end();
  });
  if (!uploadRes.upload_url) throw new Error('upload falhou');
  // Transcribe
  const tr = await post('https://api.assemblyai.com/v2/transcript', {
    audio_url: uploadRes.upload_url, language_code: language || 'pt', sentiment_analysis: true,
  }, hdrs);
  if (!tr.id) throw new Error('transcrição falhou');
  // Poll
  const start = Date.now();
  while (Date.now() - start < 60000) {
    await new Promise(r => setTimeout(r, 2000));
    const poll = await new Promise((resolve, reject) => {
      const https = require('https');
      https.get('https://api.assemblyai.com/v2/transcript/' + tr.id, { headers: hdrs, timeout: 10000 }, res => {
        const ch = []; res.on('data', c => ch.push(c)); res.on('end', () => { try { resolve(JSON.parse(Buffer.concat(ch).toString())); } catch(e) { reject(e); } });
      }).on('error', reject);
    });
    if (poll.status === 'completed') return { text: poll.text || '', sentiment: poll.sentiment_analysis_results?.[0]?.sentiment || '', confidence: poll.confidence };
    if (poll.status === 'error') throw new Error(poll.error || 'erro');
  }
  throw new Error('timeout');
}

// VISÃO — Gemini Vision (analisa imagens reais)
// ─────────────────────────────────────────────
/**
 * Analisa uma imagem usando Gemini Vision.
 * @param {Buffer} imageBuffer — buffer da imagem
 * @param {string} question — pergunta sobre a imagem (ex: "quem é esta pessoa?")
 * @returns {string} descrição/resposta da IA
 */
function detectImageMime(imageBuffer) {
  const header = imageBuffer?.slice?.(0, 12) || Buffer.alloc(0);
  if (header[0] === 0x89 && header[1] === 0x50) return 'image/png';
  if (header[0] === 0x47 && header[1] === 0x49) return 'image/gif';
  if (header.slice(0, 4).toString() === 'RIFF' && header.slice(8, 12).toString() === 'WEBP') return 'image/webp';
  if (header[0] === 0xFF && header[1] === 0xD8) return 'image/jpeg';
  return 'image/jpeg';
}

function toImageBuffers(imageBuffer) {
  const list = Array.isArray(imageBuffer) ? imageBuffer : [imageBuffer];
  return list.filter(b => b && Buffer.isBuffer(b) && b.length >= 80);
}

function imagePartsFromBuffers(buffers) {
  return buffers.map(buf => ({
    inlineData: { mimeType: detectImageMime(buf), data: buf.toString('base64') },
  }));
}

async function describeImage(imageBuffer, question = 'Descreve esta imagem em detalhe. Se houver pessoas, identifica-as se possível.') {
  if (!config.ai.geminiApiKey) throw new Error('sem chave Gemini');
  const buffers = toImageBuffers(imageBuffer);
  if (!buffers.length) throw new Error('imagem vazia');

  const body = {
    contents: [{
      parts: [
        { text: question },
        ...imagePartsFromBuffers(buffers),
      ],
    }],
    generationConfig: { temperature: 0.4, maxOutputTokens: 500 },
    safetySettings: GEMINI_SAFETY,
  };
  
  // v6.41: usa a lista central de modelos (aliases -latest, sempre válidos)
  const models = await getGeminiModels();  // v6.41: lista viva
  for (const model of models) {
    try {
      const data = await withTimeout(
        post(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.ai.geminiApiKey}`,
          body
        ),
        15000
      );
      const out = data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim();
      if (out) return stripThinking(out);
    } catch (e) {
      if (/401|invalid/i.test(e.message)) break;
    }
  }
  throw new Error('Gemini Vision falhou');
}

/**
 * Chat com DOCUMENTO (PDF, texto, etc.) — envia o ficheiro como inlineData
 * e deixa o Gemini ler o conteúdo. Usado pela AURA para "ler" documentos.
 */
async function chatWithDocument(prompt, systemPrompt, buffer, mimeType = 'application/pdf', memoryOpts = {}) {
  if (!config.ai.geminiApiKey) throw new Error('sem chave Gemini');
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 20) throw new Error('documento vazio');
  if (buffer.length > 18 * 1024 * 1024) throw new Error('documento > 18MB');

  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{
      parts: [
        { text: prompt },
        { inlineData: { mimeType, data: buffer.toString('base64') } },
      ],
    }],
    generationConfig: { temperature: 0.4, maxOutputTokens: 1200 },
    safetySettings: GEMINI_SAFETY,
  };

  const models = await getGeminiModels();
  for (const model of models) {
    try {
      const data = await withTimeout(
        post(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.ai.geminiApiKey}`,
          body
        ),
        20000
      );
      const out = data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim();
      if (out) return stripThinking(out);
    } catch (e) {
      if (/401|invalid/i.test(e.message)) break;
    }
  }
  throw new Error('Gemini Document falhou');
}

/**
 * Chat com imagem — envia texto + imagem para o Gemini Vision
 * e retorna a resposta da IA com a personalidade/system prompt
 */
async function chatWithImage(prompt, systemPrompt, imageBuffer, memoryOpts = {}) {
  if (!config.ai.geminiApiKey) throw new Error('sem chave Gemini');
  const buffers = toImageBuffers(imageBuffer);
  if (!buffers.length) throw new Error('imagem vazia');

  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{
      parts: [
        { text: prompt },
        ...imagePartsFromBuffers(buffers),
      ],
    }],
    generationConfig: { temperature: 0.8, maxOutputTokens: 800 },
    safetySettings: GEMINI_SAFETY,
  };
  
  const models = await getGeminiModels();  // v6.41: lista viva
  for (const model of models) {
    try {
      const data = await withTimeout(
        post(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.ai.geminiApiKey}`,
          body
        ),
        15000
      );
      const out = data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim();
      if (out) return stripThinking(out);
    } catch (e) {
      if (/401|invalid/i.test(e.message)) break;
    }
  }
  throw new Error('Gemini Vision chat falhou');
}

// ─────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────
// TTS com fallback
// v6.53: o voiceId por omissão era '21m00Tcm4TlvDq8ikWAM' (Rachel),
// uma library voice que o plano free NÃO pode usar → HTTP 402.
// Passa a null para o speakElevenLabs escolher uma voz da conta.
// v7.36: parte o texto em frases (≤ maxLen) para nenhum motor cortar a fala a meio
// v7.52 TURBO: paralelo com tecto, preservando a ordem (TTS em pedaços)
async function mapCap(items, cap, fn) {
  const out = new Array(items.length);
  let i = 0;
  const n = Math.min(Math.max(Number(cap) || 1, 1), items.length) || 1;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }));
  return out;
}

function splitForTts(text, maxLen = 900) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (t.length <= maxLen) return [t];
  const frases = t.match(/[^.!?…]+[.!?…]+["”»)]?\s*|[^.!?…]+$/g) || [t];
  const out = []; let cur = '';
  for (const f of frases) {
    if ((cur + f).length > maxLen && cur) { out.push(cur.trim()); cur = ''; }
    if (f.length > maxLen) { for (let i = 0; i < f.length; i += maxLen) out.push(f.slice(i, i + maxLen).trim()); continue; }
    cur += f;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

// gTTS (Google Translate) — grátis, PT, sem chave. Limite ~200 chars por pedido.
function speakGoogleTts(text, lang = 'pt') {
  const https = require('https');
  const parts = splitForTts(text, 190);
  const one = (q) => new Promise((resolve, reject) => {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${lang}&client=tw-ob&q=${encodeURIComponent(q)}`;
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124 Safari/537.36', 'Referer': 'https://translate.google.com/' }, timeout: 15000 }, res => {
      const chunks = []; res.on('data', c => chunks.push(c));
      res.on('end', () => { const b = Buffer.concat(chunks); if (res.statusCode !== 200 || b.length < 300) return reject(new Error('gTTS HTTP ' + res.statusCode)); resolve(b); });
    });
    req.on('error', reject); req.on('timeout', () => { req.destroy(); reject(new Error('gTTS timeout')); });
  });
  return (async () => Buffer.concat(await mapCap(parts, 4, (p) => one(p))))(); // v7.52: pedaços em paralelo
}

async function speakWithFallback(text, voiceId = null) {
  const full = String(text || '').trim();
  if (!full) return null;
  // Tentar ElevenLabs primeiro — em pedaços de ≤900 chars, concatenados (MP3 concatena bem)
  try {
    const parts = splitForTts(full, 900);
    // v7.52: pedaços em paralelo (tecto 3) — texto longo fala ~3x mais rápido
    const got = await mapCap(parts, 3, (p) => speakElevenLabs(p, voiceId));
    const bufs = got.filter(a => a && a.length > 500);
    if (bufs.length !== parts.length) throw new Error('pedaço vazio');
    if (bufs.length) return Buffer.concat(bufs);
  } catch (e) {
    console.warn('[Voz] ElevenLabs falhou:', e.message);
  }
  // Fallback 2: Google TTS (grátis)
  try { const g = await speakGoogleTts(full, 'pt'); if (g && g.length > 500) return g; }
  catch (e) { console.warn('[Voz] gTTS falhou:', e.message); }
  
  // Fallback: usar TTS gratuito do sistema
  try {
    const _efAsync = require('util').promisify(require('child_process').execFile); // v7.52: async, sem shell
    const tmpFile = `/tmp/aura-voice-${Date.now()}.mp3`;
    
    // Usar espeak ou similar se disponível
    try {
      const { stdout: _wav } = await _efAsync('espeak', ['-v', 'pt', String(text), '--stdout'], { timeout: 10000, maxBuffer: 12 * 1024 * 1024, encoding: 'buffer' });
      require('fs').writeFileSync(tmpFile, _wav);
      const fs = require('fs');
      const audio = fs.readFileSync(tmpFile);
      fs.unlinkSync(tmpFile);
      if (audio.length > 500) return audio;
    } catch {}
    
    // Fallback final: gerar áudio silencioso com metadados
    console.warn('[Voz] Usando fallback de texto');
    return null;
  } catch {
    return null;
  }
}

module.exports = {
  chatCerebras,
  chatHuggingFace,
  chatApiFreeLLM,
  chatDeepSeek,        // v9.20
  providerUp,
  providerFail,
  providerReset,       // v9.20
  providerStatus,
  aiCacheGet,          // v9.20
  aiCacheSet,          // v9.20
  speakElevenLabs,
  getElevenVoice,
  speakWithFallback,
  speakGoogleTts,
  splitForTts,
  searchTavily,
  transcribeAssemblyAI,
  chat,
  chatGroq,
  chatGemini,
  chatOpenAI,
  chatWithImage,
  chatWithDocument,
  describeImage,
  detectImageMime,
  toImageBuffers,
  transcribeAudio,
  transcribeWhisper, // v7.65
  needsWeb, // v7.65
  generateImage,
  getWebContext,
  getPrettyNewsDigest,
  getWebDigest,
  buildSystemPrompt,
  GROQ_MODELS,
  GEMINI_MODELS,
  OPENAI_MODELS,
  DEEPSEEK_MODELS,    // v9.20
  getGeminiModels,
  stripThinking,
};
