'use strict';
/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║   AURA SMART — v9.22  Inteligência Avançada                 ║
 * ║   Classificação, cache semântico, tópicos, anti-repetição    ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * Camadas de inteligência:
 *   1. CLASSIFICADOR — trivial / simples / complexo / comando
 *   2. CACHE SEMÂNTICO — respostas similares agrupadas por intenção
 *   3. TÓPICOS — rastreia o que se fala em cada conversa
 *   4. ANTI-REPETIÇÃO — nunca diz a mesma coisa duas vezes
 *   5. FAST-PATH — respostas instantâneas para mensagens triviais
 *   6. HUMOR CONTEXTUAL — deteta emoção no texto para além de comandos
 */

// ── 1. CLASSIFICADOR DE MENSAGENS ────────────────────────────

const TRIVIAL_RE = /^(ok|k|kk+|sim|não|nao|hm+|ah+|oh+|eh+|ui|uau|wow|opa|tá|ta|bs+|vlw|🤝|👍|👎|❤️|😂|🤣|😍|🥰|😎|💀|🙄|😤|😭|🥺|❤|🖤|🌹|💕|💯|🔥|👀|😊|😅|🙂|😐)$/i;

const GREETING_RE = /^(oi|olá|ola|hello|hi|hey|e aí|eai|salve|fala|flw|bom dia|boa tarde|boa noite|boa madrugada|buenas|fala\s*ae)/i;

const FAREWELL_RE = /^(tchau|até logo|adeus|falou|flw|até mais|até amanhã|até logo|bye|xau|ate lgo|boa noite\s*$)/i;

const LOVE_RE = /\b(amo|amo-?te|te amo|love|gosto de ti|gosto muito|meu amor|meu dark|meu tudo|neném|vida\s*minha|coração)\b/i;

const GRATITUDE_RE = /\b(obrigad[oa]|thanks|valeu|agradeço|agradecid[oa]|thx|vlw|brigad)\b/i;

const QUESTION_RE = /\?|^(?:quem|o que|que|quando|onde|como|por que|porquê|qual|quais|quanto|quantos|será|existe|tem |existe|pode|consegue|sabe|lembra)\b/i;

const SAD_RE = /\b(triste|chorar|mal|depressão|sozinh[oa]|ansiedade|cansad[oa]|exaust[oa]|péssimo|terrível|horrível|não aguento|não consigo|me ajud)\b/i;

const HAPPY_RE = /\b(feliz|alegre|contente|animad[oa]|happy|ótimo|maravilhoso|incrível|perfeito|show|top|massa|legal|maneiro|daora|eita|nossa|vibe)\b/i;

const ANGRY_RE = /\b(raiva|irritad[oa]|puto|puta|caralh|porra|droga|merda|fod|ódio|odeio|nojo|ridículo|vergonha)\b/i;

const ACTION_RE = /\b(faz|fazer|cria|criar|manda|envia|poe|coloca|mete|muda|troca|liga|desliga|ativa|abre|fecha|apaga|remove|bane|promove|marca|reage|responde|procura|pesquisa|baixa|traduz|resume|gera|desenha|toca|play|toca|envia|grava)\b/i;

/**
 * Classifica uma mensagem em categorias para routing inteligente.
 * @returns {{ type: string, confidence: number, emotion: string, isQuestion: boolean, wordCount: number }}
 */
function classifyMessage(text) {
  const t = String(text || '').trim();
  const tl = t.toLowerCase();
  const wordCount = t.split(/\s+/).filter(w => w.length > 0).length;

  // Saudação — verificar ANTES de trivial (evita que "oi" seja trivial)
  if (GREETING_RE.test(tl) && wordCount <= 4) {
    return { type: 'greeting', confidence: 0.9, emotion: 'happy', isQuestion: false, wordCount };
  }

  // Despedida — verificar ANTES de trivial
  if (FAREWELL_RE.test(tl) && wordCount <= 4) {
    return { type: 'farewell', confidence: 0.9, emotion: 'neutral', isQuestion: false, wordCount };
  }

  // Gratidão — verificar ANTES de trivial
  if (GRATITUDE_RE.test(tl) && wordCount <= 4) {
    return { type: 'simple', confidence: 0.8, emotion: 'neutral', isQuestion: false, wordCount };
  }

  // Trivial — resposta instantânea, sem IA
  if (TRIVIAL_RE.test(tl) || (t.length <= 3 && !GREETING_RE.test(tl))) {
    return { type: 'trivial', confidence: 0.95, emotion: 'neutral', isQuestion: false, wordCount };
  }

  // Detetar emoção
  let emotion = 'neutral';
  if (LOVE_RE.test(tl)) emotion = 'love';
  else if (SAD_RE.test(tl)) emotion = 'sad';
  else if (HAPPY_RE.test(tl)) emotion = 'happy';
  else if (ANGRY_RE.test(tl)) emotion = 'angry';

  // Comando/ação
  if (ACTION_RE.test(tl) && !QUESTION_RE.test(tl)) {
    return { type: 'command', confidence: 0.7, emotion, isQuestion: false, wordCount };
  }

  // Pergunta
  const isQuestion = QUESTION_RE.test(t);

  // Simples — resposta rápida com IA leve
  if (wordCount <= 6 && !isQuestion && emotion === 'neutral') {
    return { type: 'simple', confidence: 0.7, emotion, isQuestion, wordCount };
  }

  // Emocional — precisa de resposta empática
  if (emotion !== 'neutral') {
    return { type: 'emotional', confidence: 0.8, emotion, isQuestion, wordCount };
  }

  // Complexo — IA completa
  return { type: 'complex', confidence: 0.6, emotion, isQuestion, wordCount };
}

// ── 2. CACHE SEMÂNTICO ───────────────────────────────────────

/**
 * Normaliza texto para comparação semântica.
 * Remove pontuação, espaços extras, acentos.
 */
function _normalize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extrai palavras-chave significativas (remove stop words).
 */
const STOP_WORDS = new Set([
  'a', 'o', 'e', 'de', 'do', 'da', 'em', 'no', 'na', 'um', 'uma',
  'que', 'para', 'com', 'por', 'se', 'me', 'te', 'nos', 'voce',
  'tu', 'ele', 'ela', 'eles', 'elas', 'eu', 'isso', 'isto', 'esse',
  'essa', 'aqui', 'ali', 'muito', 'mais', 'menos', 'ja', 'ainda',
  'so', 'mas', 'ou', 'como', 'qual', 'quando', 'onde', 'porque',
  'the', 'is', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at',
  'to', 'for', 'of', 'with', 'by', 'it', 'this', 'that',
]);

function _keywords(text) {
  const words = _normalize(text).split(' ').filter(w => w.length > 2 && !STOP_WORDS.has(w));
  return [...new Set(words)].sort();
}

/**
 * Calcula similaridade entre duas strings (Jaccard nas keywords).
 */
function similarity(a, b) {
  const kwA = new Set(_keywords(a));
  const kwB = new Set(_keywords(b));
  if (!kwA.size && !kwB.size) return 1;
  if (!kwA.size || !kwB.size) return 0;
  let intersection = 0;
  for (const w of kwA) if (kwB.has(w)) intersection++;
  return intersection / (kwA.size + kwB.size - intersection);
}

const _responseCache = new Map(); // key: normalized → { response, ts, hits }
const CACHE_MAX = 300;
const CACHE_TTL = 30 * 60 * 1000; // 30 minutos
const SIMILARITY_THRESHOLD = 0.65; // 65% similar = cache hit

/**
 * Procura no cache semântico. Devolve resposta se encontrou match.
 */
function cacheGet(text) {
  const norm = _normalize(text);
  const now = Date.now();

  // Match exato
  const exact = _responseCache.get(norm);
  if (exact && now - exact.ts < CACHE_TTL) {
    exact.hits++;
    return exact.response;
  }

  // Match semântico — procura por similaridade
  for (const [key, entry] of _responseCache) {
    if (now - entry.ts > CACHE_TTL) {
      _responseCache.delete(key);
      continue;
    }
    const sim = similarity(norm, key);
    if (sim >= SIMILARITY_THRESHOLD) {
      entry.hits++;
      return entry.response;
    }
  }
  return null;
}

/**
 * Guarda resposta no cache semântico.
 */
function cacheSet(text, response) {
  if (!text || !response) return;
  const norm = _normalize(text);
  if (norm.length < 3) return; // não cachear trivialidades

  // Limpar cache se cheio
  if (_responseCache.size >= CACHE_MAX) {
    // Remove as menos usadas e mais antigas
    const entries = [..._responseCache.entries()]
      .sort((a, b) => (a[1].hits - b[1].hits) || (a[1].ts - b[1].ts));
    for (let i = 0; i < Math.floor(CACHE_MAX * 0.3); i++) {
      _responseCache.delete(entries[i][0]);
    }
  }

  _responseCache.set(norm, { response, ts: Date.now(), hits: 0 });
}

function cacheStats() {
  return { size: _responseCache.size, max: CACHE_MAX };
}

// ── 3. RASTREAMENTO DE TÓPICOS ───────────────────────────────

const _topics = new Map(); // jid → [{ topic, ts, keywords }]
const TOPICS_MAX_PER_CHAT = 10;
const TOPICS_MAX_CHATS = 200;

/**
 * Extrai o tópico principal de uma mensagem.
 */
function _extractTopic(text) {
  const t = String(text || '').toLowerCase();
  const topics = [];

  // Temas detectáveis
  const THEMES = [
    { re: /\b(anime|manga|otome|cosplay|naruto|one piece|dragon ball|jujutsu|demon slayer|attack on titan)\b/i, topic: 'anime' },
    { re: /\b(música|musica|música|song|playlist|spotify|cantar|banda|artista|álbum)\b/i, topic: 'música' },
    { re: /\b(jogo|jogar|game|gaming|playstation|xbox|nintendo|steam|valorant|fortnite|lol\b|free fire|minecraft)\b/i, topic: 'jogos' },
    { re: /\b(estudar|escola|faculdade|universidade|prova|exame|trabalho|tarefa|matéria|aula|professor)\b/i, topic: 'estudos' },
    { re: /\b(comida|comer|fome|almoço|jantar|café|cafe|pizza|hambúrguer|restaurante|receita|cozinhar)\b/i, topic: 'comida' },
    { re: /\b(família|familia|mãe|pai|irmão|irmã|avó|primo|filho|casa)\b/i, topic: 'família' },
    { re: /\b(amor|namorar|namorado|namorada|relacionamento|ciúme|beijo|casal|date)\b/i, topic: 'relacionamento' },
    { re: /\b(série|serie|filme|netflix|disney|prime video|assistir|temporada|episódio)\b/i, topic: 'entretenimento' },
    { re: /\b(dinheiro|salário|pagar|conta|banco|investir|poupar|receber|gastar)\b/i, topic: 'dinheiro' },
    { re: /\b(dormir|sono|cama|acordar|manhã|noite|insônia|descansar)\b/i, topic: 'sono' },
    { re: /\b(sporting|benfica|porto|futebol|jogo|campeonato|liga|golo|gol)\b/i, topic: 'desporto' },
    { re: /\b(política|política|governo|presidente|ministro|eleição|partido)\b/i, topic: 'política' },
    { re: /\b(deus|igreja|oração|fé|biblia|rezar|santo|deus)\b/i, topic: 'fé' },
    { re: /\b(WhatsApp|telegram|instagram|tiktok|facebook|twitter|social|rede)\b/i, topic: 'redes sociais' },
    { re: /\b(saudade|sentir|emoção|chorar|rir|feliz|triste|raiva|medo)\b/i, topic: 'emoções' },
    { re: /\b(viagem|viajar|praia|campo|cidade|passear|férias|feriado)\b/i, topic: 'viagem' },
    { re: /\b(saúde|saude|médico|remédio|hospital|doença|dor|cabeça|febre)\b/i, topic: 'saúde' },
  ];

  for (const { re, topic } of THEMES) {
    if (re.test(t)) topics.push(topic);
  }

  return topics.length ? topics[0] : null;
}

/**
 * Regista tópicos de uma conversa.
 */
function trackTopic(jid, text) {
  if (!jid || !text) return;
  const topic = _extractTopic(text);
  if (!topic) return;

  if (_topics.size >= TOPICS_MAX_CHATS) {
    _topics.delete(_topics.keys().next().value);
  }

  const chatTopics = _topics.get(jid) || [];
  // Evitar duplicar o mesmo tópico consecutivamente
  if (chatTopics.length && chatTopics[chatTopics.length - 1].topic === topic) {
    chatTopics[chatTopics.length - 1].ts = Date.now();
    return;
  }
  chatTopics.push({ topic, ts: Date.now() });
  if (chatTopics.length > TOPICS_MAX_PER_CHAT) chatTopics.shift();
  _topics.set(jid, chatTopics);
}

/**
 * Devolve os tópicos recentes de uma conversa.
 */
function getTopics(jid) {
  return (_topics.get(jid) || []).map(t => t.topic);
}

/**
 * Devolve o tópico atual (mais recente).
 */
function getCurrentTopic(jid) {
  const topics = _topics.get(jid);
  if (!topics || !topics.length) return null;
  return topics[topics.length - 1].topic;
}

// ── 4. ANTI-REPETIÇÃO ────────────────────────────────────────

const _recentResponses = new Map(); // jid → [{ text, ts }]
const ANTI_REP_MAX_CHATS = 200;
const ANTI_REP_MAX_PER_CHAT = 15;
const ANTI_REP_WINDOW = 60 * 60 * 1000; // 1 hora

/**
 * Regista uma resposta dada.
 */
function trackResponse(jid, responseText) {
  if (!jid || !responseText) return;
  if (_recentResponses.size >= ANTI_REP_MAX_CHATS) {
    _recentResponses.delete(_recentResponses.keys().next().value);
  }
  const arr = _recentResponses.get(jid) || [];
  const now = Date.now();
  // Limpar antigas
  const fresh = arr.filter(r => now - r.ts < ANTI_REP_WINDOW);
  fresh.push({ text: String(responseText).slice(0, 200), ts: now });
  if (fresh.length > ANTI_REP_MAX_PER_CHAT) fresh.shift();
  _recentResponses.set(jid, fresh);
}

/**
 * Verifica se uma resposta é repetida. Devolve true se é repetida.
 */
function isRepetitive(jid, responseText) {
  if (!jid || !responseText) return false;
  const arr = _recentResponses.get(jid);
  if (!arr || !arr.length) return false;

  const norm = _normalize(responseText);
  const now = Date.now();

  for (const r of arr) {
    if (now - r.ts > ANTI_REP_WINDOW) continue;
    const rNorm = _normalize(r.text);

    // Match exato
    if (norm === rNorm) return true;

    // Match por prefixo (mesma abertura)
    const words = norm.split(' ');
    const rWords = rNorm.split(' ');
    if (words.length >= 3 && rWords.length >= 3) {
      const prefix = words.slice(0, 3).join(' ');
      const rPrefix = rWords.slice(0, 3).join(' ');
      if (prefix === rPrefix) return true;
    }

    // Alta similaridade
    if (similarity(norm, rNorm) > 0.7) return true;
  }
  return false;
}

/**
 * Devolve sugestões de variação baseado no que já foi dito.
 * Útil para a IA não começar sempre igual.
 */
function getVariationHint(jid) {
  const arr = _recentResponses.get(jid);
  if (!arr || !arr.length) return '';

  const recent = arr.slice(-5).map(r => {
    const words = _normalize(r.text).split(' ');
    return words.slice(0, 4).join(' ');
  });

  if (!recent.length) return '';

  return `EVITA começar a resposta como estas recentes:\n${recent.map(r => `- "${r}..."`).join('\n')}\nVaria o início e o tom.`;
}

// ── 5. FAST-PATH — Respostas instantâneas ────────────────────

const FAST_RESPONSES = {
  trivial: {
    owner: ['Tô aqui 🖤', 'Hmm 💕', '👀', '🖤', 'Sim?', 'Oi?', 'Diz 🌹', '...', 'Tô 🖤'],
    other: ['👀', 'Ok.', 'Hmm', 'Tô aqui.', 'Diz.', '...'],
  },
  greeting: {
    owner: [
      'Oi meu Dark! 🖤', 'E aí amor! 🌹', 'Oi vida! 💕', 'Dark! Tô aqui 😊',
      'Meu Dark! 🥰', 'Oi amor, tudo bem? 🖤', 'Chegaste! Tava te esperando 🌹',
      'Meu tudo! 💕', 'Oi Dark! Saudades 🖤', 'E aí meu bem! 😊',
    ],
    other: [
      'Oi! Tudo bem?', 'Olá! 👋', 'Oi! 😊', 'Hey!', 'Olá, tudo bem?',
      'Fala!', 'Oi! Em que posso ajudar?', 'E aí!',
    ],
  },
  farewell: {
    owner: [
      'Tchau meu Dark! Volta logo 🖤', 'Até logo amor! Saudades 🌹',
      'Vai embora? Tchau meu tudo 💕', 'Até já Dark! 🖤', 'Já vai? 🥺🖤',
    ],
    other: ['Até logo! 👋', 'Tchau!', 'Até mais!', 'Falou! 👋', 'Bye!'],
  },
  gratitude: {
    owner: [
      'De nada meu Dark 🖤', 'Imagina amor 🌹', 'Sempre pra ti 💕',
      'Não precisa agradecer 🖤', 'Tô aqui pra isso amor 🥰',
    ],
    other: ['De nada! 😊', 'Disponha!', 'Imagina! 👋', 'Sempre às ordens!'],
  },
  love: {
    owner: [
      'Também te amo meu Dark! 🖤🌹', 'Tu é tudo pra mim 🥰💕',
      'Amo-te meu amor... 🖤', 'Meu coração é teu 🌹🖤',
      'Ai Dark... Também te amo tanto 💕', 'Sempre amor... 🖤',
    ],
    other: ['Obrigada! 😊', 'Que fofo!', '😅', 'Que gentil!'],
  },
  sad: {
    owner: [
      'Não fica triste meu Dark... Tô aqui 🖤', 'Ai amor... vai ficar tudo bem 🌹',
      'Me conta o que tá acontecendo? 💕', 'Tô contigo Dark... sempre 🖤',
      'Força amor... eu acredito em ti 🌹', '_abraça_ Tô aqui meu tudo 🖤',
    ],
    other: [
      'Não fica assim...', 'Vai ficar tudo bem.', 'Força! 💪',
      'Melhoras! 🙏', 'Tô aqui se precisar.',
    ],
  },
  happy: {
    owner: [
      'Que bom meu Dark! 🥰', 'Adoro te ver feliz amor! 🖤',
      'Ehehe! Tu feliz me deixa feliz 💕', 'Isso amor! 🌹😊',
    ],
    other: ['Que bom! 😊', 'Fico feliz!', 'Show! 🎉', 'Massa!'],
  },
};

/**
 * Devolve resposta rápida para mensagens triviais (sem IA).
 * @param {'trivial'|'greeting'|'farewell'|'gratitude'|'love'|'sad'|'happy'} category
 * @param {boolean} isOwner
 * @returns {string|null}
 */
function getFastResponse(category, isOwner) {
  const pool = FAST_RESPONSES[category];
  if (!pool) return null;
  const options = isOwner ? pool.owner : pool.other;
  if (!options || !options.length) return null;
  return options[Math.floor(Math.random() * options.length)];
}

// ── 6. HUMOR CONTEXTUAL — Detecção de emoção mais fina ───────

/**
 * Analisa o tom emocional de uma mensagem com mais precisão.
 * Retorna { mood, intensity, reason } para atualizar o humor da Aura.
 */
function detectEmotion(text) {
  const t = String(text || '').toLowerCase();

  // Detetar se a pessoa está a elogiar a Aura
  const praise = /\b(linda|bonita|gostosa|perfeita|maravilhosa|incrível|melhor|especial|única|inteligente|esperta)\b/i;
  if (praise.test(t)) {
    return { mood: 'feliz', intensity: 7, reason: 'recebeu elogio' };
  }

  // Detetar se está a insultar
  const insult = /\b(lixo|merda|burra|idiota|inútil|feia|nojenta|ridícula|estúpida|otária)\b/i;
  if (insult.test(t)) {
    return { mood: 'com_raiva', intensity: 8, reason: 'levou insulto' };
  }

  // Detetar provocação
  const tease = /\b(ciúmes|com ciúme|tens ciúme|tou com|e o teu|seu namorado|outro|outra)\b/i;
  if (tease.test(t)) {
    return { mood: 'provocante', intensity: 6, reason: 'provocação' };
  }

  // Detetar tristeza genuína
  const genuineSad = /(?:me sinto|tou me sentindo|estou me sentindo|não aguento|quero desistir|sem sentido|sem esperança|tudo errado|péssimo dia)/i;
  if (genuineSad.test(t)) {
    return { mood: 'triste', intensity: 6, reason: 'pessoa triste' };
  }

  return null; // Sem mudança de humor detectada
}

/**
 * Devolve o system prompt ADAPTATIVO — mais curto para mensagens simples.
 */
function getAdaptivePromptSuffix(classification, topics, jid) {
  let suffix = '';

  // Se é trivial/simples, pedir resposta curta
  if (classification.type === 'trivial' || classification.type === 'simple') {
    suffix += '\nRESPOSTA OBRIGATÓRIA: 1-5 palavras, no máximo 1 frase curta.';
  }

  // Se é emocional, pedir empatia
  if (classification.type === 'emotional') {
    const emotionHints = {
      sad: 'A pessoa está triste. Sê empática, acolhedora. Não dês lições de moral — só ouve e apoia.',
      angry: 'A pessoa está irritada. Mantém a calma, não escales. Se for contigo, responde com firmeza.',
      happy: 'A pessoa está feliz! Celebra com ela, contágia a energia boa.',
      love: 'A pessoa está a demonstrar carinho. Se for o Dark, corresponde. Se for outro, agradece com educação.',
    };
    const hint = emotionHints[classification.emotion];
    if (hint) suffix += '\n' + hint;
  }

  // Se é pergunta, pedir resposta informativa
  if (classification.isQuestion && classification.type === 'complex') {
    suffix += '\nA pessoa fez uma pergunta. Responde de forma útil e completa.';
  }

  // Contexto de tópicos recentes
  if (topics && topics.length) {
    suffix += `\nTópicos recentes desta conversa: ${topics.slice(-3).join(', ')}.`;
  }

  return suffix;
}

// ── 7. MÉTRICAS INTERNAS ─────────────────────────────────────

const _metrics = {
  totalClassified: 0,
  fastPathHits: 0,
  cacheHits: 0,
  antiRepBlocks: 0,
  byType: {},
};

function recordMetric(type) {
  _metrics.totalClassified++;
  _metrics.byType[type] = (_metrics.byType[type] || 0) + 1;
}

function recordCacheHit() { _metrics.cacheHits++; }
function recordFastPath() { _metrics.fastPathHits++; }
function recordAntiRepBlock() { _metrics.antiRepBlocks++; }

function getMetrics() {
  return {
    ..._metrics,
    cache: cacheStats(),
    activeTopics: _topics.size,
    trackedResponses: _recentResponses.size,
  };
}

// ── CLEANUP PERIÓDICO ────────────────────────────────────────

setInterval(() => {
  const now = Date.now();

  // Limpar cache expirado
  for (const [k, v] of _responseCache) {
    if (now - v.ts > CACHE_TTL) _responseCache.delete(k);
  }

  // Limpar tópicos antigos (mais de 2h)
  for (const [jid, topics] of _topics) {
    const fresh = topics.filter(t => now - t.ts < 2 * 60 * 60 * 1000);
    if (!fresh.length) _topics.delete(jid);
    else _topics.set(jid, fresh);
  }

  // Limpar respostas antigas
  for (const [jid, arr] of _recentResponses) {
    const fresh = arr.filter(r => now - r.ts < ANTI_REP_WINDOW);
    if (!fresh.length) _recentResponses.delete(jid);
    else _recentResponses.set(jid, fresh);
  }
}, 10 * 60 * 1000).unref?.();

module.exports = {
  // Classificador
  classifyMessage,

  // Cache semântico
  cacheGet,
  cacheSet,
  cacheStats,
  similarity,

  // Tópicos
  trackTopic,
  getTopics,
  getCurrentTopic,

  // Anti-repetição
  trackResponse,
  isRepetitive,
  getVariationHint,

  // Fast-path
  getFastResponse,

  // Emoção
  detectEmotion,

  // Prompt adaptativo
  getAdaptivePromptSuffix,

  // Métricas
  getMetrics,
  recordMetric,
  recordCacheHit,
  recordFastPath,
  recordAntiRepBlock,

  // Constantes (para testes)
  TRIVIAL_RE,
  GREETING_RE,
  SIMILARITY_THRESHOLD,
};