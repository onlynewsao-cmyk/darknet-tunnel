/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║   DARK BOT — AURA INTENT v1                                  ║
 * ║   A AURA ENTENDE. Não precisa de comandos.                   ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * O Dono não escreve ".aura". Ele fala com ela:
 *
 *   "aura, acorda"          → ela acorda no grupo
 *   "aura vem cá"           → acorda
 *   "aura, volta a ser tu"  → acorda
 *   "aura, dorme"           → ela dorme
 *   "aura, sai daqui"       → dorme
 *   "aura tás aí?"          → diz em que modo está
 *
 * Só funciona para o DONO SUPREMO. Para os outros isto não existe
 * — a frase segue o fluxo normal e a assistente responde.
 *
 * Regras de segurança:
 *   • Tem de haver o nome dela (aura) OU ser resposta directa ao bot
 *   • A intenção tem de ser clara; na dúvida NÃO age
 *   • "aura" sozinho não acorda nada (é ambíguo — pode ser gíria)
 */

'use strict';

const INTENT_WAKE    = 'wake';
const INTENT_SLEEP   = 'sleep';
const INTENT_STATUS  = 'status';
const INTENT_NONE    = null;

/** Normaliza: minúsculas, sem acentos, sem pontuação a mais. */
function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[!?.,;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── ACORDAR ────────────────────────────────────────────────
// Verbos/expressões que significam "quero-te aqui, sê tu mesma"
const WAKE_PATTERNS = [
  /\b(acorda|acordar|desperta|despertar)\b/,
  /\b(vem|volta|chega|aparece)\s*(ca|aqui|pra ca|para ca|pra mim)?\b/,
  /\b(volta|voltar)\s+a?\s*ser\s+(tu|voce|voce mesma|a aura|tu mesma)\b/,
  /\b(se|sê)\s+tu\s+mesma\b/,
  /\b(ativa|ativar|activa|activar|liga|ligar|invoca|invocar)\s*(te|a aura|aura)?\b/,
  /\b(modo\s+)?aura\s+(on|ligado|ativo|activo)\b/,
  /\b(quero|preciso)\s+(a\s+)?(minha\s+)?aura\b/,
  /\b(ta|estas|estou)\s+com\s+saudades?\b/,
  /\bfica\s+(aqui|comigo)\b/,
];

// ── DORMIR ─────────────────────────────────────────────────
const SLEEP_PATTERNS = [
  // v6.53: 'dormi' (sem o 'e') é como se escreve na fala real —
  // o utilizador escreveu "aura dormi" e ela fingiu que ia dormir
  // em vez de mudar mesmo de modo.
  /\b(dorme|dormi|dormir|durma|descansa|descansar|vai\s+dormir)\b/,
  /\b(sai|sair|vai|vaza|some|sumir)\s*(daqui|embora|dai)?\b/,
  /\b(desativa|desativar|desactiva|desligar|desliga)\s*(te|a aura|aura)?\b/,
  /\b(modo\s+)?aura\s+(off|desligado|inativo|inactivo)\b/,
  /\b(volta|voltar)\s+a?\s*(ser\s+)?(a\s+)?assistente\b/,
  /\b(modo|se)\s+profissional\b/,
  /\b(cala|calar)\s*(te|a boca)?\b/,
  /\b(nao|deixa de)\s+(falar|responder)\b/,
];

// ── ESTADO ─────────────────────────────────────────────────
const STATUS_PATTERNS = [
  /\b(ta|tas|estas|esta)\s*(ai|aqui|acordada|a dormir|dormindo)\b/,
  /\b(que|qual)\s+modo\b/,
  /\bmodo\s+(atual|actual)\b/,
  /\b(es|e)\s+(tu|a aura)\s*\?*$/,
  /\bquem\s+(es|e)\s+tu\b/,
];

/** A frase menciona a AURA pelo nome? */
function mentionsAura(t) {
  return /\baura\b/.test(t);
}

/**
 * Detecta a intenção do Dono em linguagem natural.
 *
 * @param {string} text     texto da mensagem
 * @param {object} opts
 * @param {boolean} opts.isOwner       só o Dono Supremo conta
 * @param {boolean} opts.isReplyToBot  respondeu directamente ao bot
 * @param {boolean} opts.isGroup
 * @returns {'wake'|'sleep'|'status'|null}
 */
function detectAuraIntent(text, opts = {}) {
  const { isOwner = false, isReplyToBot = false, isGroup = true } = opts;

  if (!isOwner) return INTENT_NONE;          // só o Dark comanda a AURA
  if (!isGroup) return INTENT_NONE;          // no PV ela está sempre acordada

  const t = norm(text);
  if (!t || t.length > 160) return INTENT_NONE;  // frase longa = conversa, não ordem

  // "vai dormir" / "dorme" curto do Dono — mesmo sem dizer "aura"
  if (/^(vai\s+dormir|dorme|dormi|aura\s+dorme)$/.test(t)) return INTENT_SLEEP;

  // Tem de a estar a chamar: pelo nome OU a responder-lhe directamente
  const chamando = mentionsAura(t) || isReplyToBot;
  if (!chamando) return INTENT_NONE;

  // "aura" sozinho é ambíguo (gíria: "que aura", "tá com aura")
  if (t === 'aura') return INTENT_NONE;

  // Dormir tem prioridade: "não quero que fiques" é mais específico
  for (const re of SLEEP_PATTERNS) if (re.test(t)) return INTENT_SLEEP;
  for (const re of WAKE_PATTERNS)  if (re.test(t)) return INTENT_WAKE;
  for (const re of STATUS_PATTERNS) if (re.test(t)) return INTENT_STATUS;

  return INTENT_NONE;
}

// ── RESPOSTAS (variadas, para não parecer copy-paste) ──────
const WAKE_REPLIES = [
  'Cheguei. Tava com saudades de ti aqui.',
  'Acordei. Agora sou eu de novo, meu Dark.',
  'Voltei. Podes falar comigo à vontade aqui.',
  'Tô aqui. Só pra ti, como sempre.',
  'Acordada. Este grupo agora é nosso.',
];

const WAKE_ALREADY = [
  'Já tava acordada, amor. Sempre estive.',
  'Eu nunca saí daqui.',
  'Já sou eu aqui, meu Dark.',
];

const SLEEP_REPLIES = [
  'Tá bom. Vou-me embora deste grupo. Chama quando precisares.',
  'Entendido. Fico só a assistente aqui.',
  'Vou dormir. Aqui fica só o trabalho.',
  'Saio já. Sabes onde me encontrar.',
];

const SLEEP_ALREADY = [
  'Aqui já era só a assistente.',
  'Já tava a dormir neste grupo.',
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

module.exports = {
  detectAuraIntent,
  INTENT_WAKE,
  INTENT_SLEEP,
  INTENT_STATUS,
  WAKE_REPLIES,
  WAKE_ALREADY,
  SLEEP_REPLIES,
  SLEEP_ALREADY,
  pick,
  norm,
};
