/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║  DARK BOT v6.87 — GUARDA DE INSTRUÇÕES 🕸️                    ║
 * ║  "instruções ≠ comandos"                                      ║
 * ╚═══════════════════════════════════════════════════════════════╝
 *
 * ── O PROBLEMA ────────────────────────────────────────────────
 * A AURA executa comandos a partir de linguagem natural
 * (auraCommands.MAPA). Os padrões são verbos soltos, por isso
 * CONVERSA que só *menciona* a acção era executada como ORDEM:
 *
 *   "o ban foi injusto"        → corria `.ban`      (substantivo!)
 *   "ele marca golos"          → corria `.tagall`   (relato)
 *   "não bana o rapaz"         → corria `.ban`      (negação!)
 *   "quem é que ele expulsou?" → corria `.ban`      (pergunta)
 *   "o antilink ativa sozinho" → corria `.antilink` (relato)
 *   "se ele apaga, eu aviso"   → corria `.del`      (hipótese)
 *
 * ── A REGRA ───────────────────────────────────────────────────
 * Uma frase só é ORDEM se o verbo estiver no IMPERATIVO — ou seja,
 * se nada antes dele o transformar noutra coisa. Tudo o que estiver
 * ANTES do verbo é o que decide:
 *
 *   pergunta · negação · relato no passado · sujeito na 3ª pessoa ·
 *   determinante (→ substantivo) · condicional · citação ·
 *   referência ao próprio comando · verbo tarde de mais na frase
 *
 * ── PORQUE SÓ PARA OS SENSÍVEIS ───────────────────────────────
 * Comandos de leitura ("qual é o meu saldo?", "quem são os admins?")
 * SÃO perguntas e têm de continuar a funcionar — o teste
 * test:auracmds exige isso. A guarda aplica-se apenas aos comandos
 * que mexem em TERCEIROS ou no grupo: nesses, na dúvida, ela não
 * age e pergunta (que é o que o prompt já lhe manda fazer).
 */
'use strict';

// ── Comandos que mexem em terceiros ou no grupo ───────────────
// (nomes verificados contra o MAPA de auraCommands.js)
const SENSIVEIS = new Set([
  'ban', 'kick', 'promote', 'demote',
  'fechar', 'abrir', 'tagall', 'warn', 'mute', 'unmute',
  'antilink', 'antispam', 'welcome',
  'del', 'add', 'revoke', 'setnomegrupo', 'setdesc', 'adultmode',
]);

// ── 1. PERGUNTA ──────────────────────────────────────────────
// Interrogativa no início, ou ponto de interrogação no fim.
const RE_INTERROGATIVA = /^(quem|qual|quais|quando|onde|como|porque|por\s*que|porquê|quanto|quanta|quantos|quantas|será|sera|achas|acha|sabes|sabe|conheces|lembras|podes|pode|devo|devemos)\b/i;

// ── 2. NEGAÇÃO / PROIBIÇÃO ───────────────────────────────────
// "não bana", "nunca apagues", "para de marcar"
const RE_NEGACAO = /\b(não|nao|nunca|jamais|proibido|proibida|para de|pare de|pares de|deixa de|deixe de|evita|evitar|sem|nem)\b/i;

// ── 3. RELATO NO PASSADO ─────────────────────────────────────
// "ele FOI banido", "JÁ apagaram", "ESTAVA a marcar"
const RE_RELATO = /\b(foi|foram|era|eram|estava|estavam|esteve|estiveram|tinha|tinham|teve|acabou de|acabaram de|já|ja)\b/i;

// ── 4. SUJEITO NA 3ª PESSOA (é relato, não ordem) ────────────
// "ELE marca golos", "NINGUÉM cala ele", "A LOJA fecha às 20h"
// Nota: "eu"/"tu"/"você" NÃO estão aqui — "eu quero que banes" É ordem.
const RE_SUJEITO_3P = /\b(ele|ela|eles|elas|ninguém|ninguem|todo o mundo|toda a gente|a pessoa|o rapaz|a rapariga|o gajo|a gaja|aquilo|isto|isso|esse|essa|esses|essas|este|esta|aquele|aquela|o bot|a aura|o sistema|o grupo|a loja|ele mesmo|ela mesma|o admin|o dono)\s*$/i;

// ── 5. DETERMINANTE → a palavra é SUBSTANTIVO, não verbo ─────
// "O ban foi injusto", "ISSO remove a mancha", "UMA warning a mais"
const RE_DETERMINANTE = /\b(o|a|os|as|um|uma|uns|umas|esse|essa|esses|essas|este|esta|isto|isso|aquele|aquela|do|da|dos|das|no|na|nos|nas|meu|minha|teu|tua|seu|sua|dele|dela|tal|outro|outra|cada|todo|toda|todos|todas|muito|muita|pouco|pouca|qualquer|mais|menos)\s*$/i;

// ── 6. CONDICIONAL / HIPÓTESE ────────────────────────────────
// "SE ele bane", "QUANDO ela apaga", "eu IA marcar"
const RE_CONDICIONAL = /\b(se|caso|assim que|logo que|quando|enquanto|ia|iam|iria|iriam|poderia|podia|devia|deveria|gostava|queria|seria|imaginemos|suponhamos)\b/i;

// ── 7. REFERÊNCIA AO PRÓPRIO COMANDO ─────────────────────────
// "o que faz o COMANDO ban", "para que serve o !ban"
const RE_META = /\b(comando|comandos|cmd|cmds)\b/i;
const RE_COMANDO_CITADO = /[!.$#?/][a-zà-ú]{2,}/i;

// ── 8. VERBO TARDE DE MAIS ───────────────────────────────────
// Numa ordem o verbo vem cedo. Se há muita prosa antes dele, é texto.
const MAX_PALAVRAS_ANTES = 6;

/**
 * Classifica a frase.
 *
 * @param {string} texto  — frase já sem o nome dela ("aura …" → "…")
 * @param {{comando?:string, regex?:RegExp}} [opts]
 *   `regex` é o padrão do MAPA que casou — serve para saber ONDE está
 *   o verbo e olhar só para o que vem antes dele.
 * @returns {{ordem:boolean, regra:string, comando?:string}}
 */
function classificar(texto, opts = {}) {
  const t = String(texto || '').trim();
  const comando = String(opts.comando || '').toLowerCase();

  if (!t) return { ordem: false, regra: 'vazio', comando };

  // Comandos de leitura ficam de fora: "qual é o meu saldo?" É uma
  // pergunta e tem de continuar a devolver o saldo.
  if (!SENSIVEIS.has(comando)) return { ordem: true, regra: 'informativo', comando };

  // Onde é que o verbo casou? Tudo o que decide está ANTES dele.
  let corte = t.length;
  const re = opts.regex;
  if (re && typeof re.exec === 'function') {
    try { re.lastIndex = 0; const m = re.exec(t); if (m) corte = m.index; } catch {}
  }
  const antes = t.slice(0, corte).trim();

  // 1. pergunta
  if (RE_INTERROGATIVA.test(t) || /[?？]\s*$/.test(t)) {
    return { ordem: false, regra: 'pergunta', comando };
  }
  // 2. negação / proibição
  if (antes && RE_NEGACAO.test(antes)) {
    return { ordem: false, regra: 'negacao', comando };
  }
  // 3. relato no passado
  if (antes && RE_RELATO.test(antes)) {
    return { ordem: false, regra: 'relato', comando };
  }
  // 4. sujeito na 3ª pessoa → está a contar, não a mandar
  if (antes && RE_SUJEITO_3P.test(antes)) {
    return { ordem: false, regra: 'sujeito3p', comando };
  }
  // 5. determinante antes → a palavra é substantivo
  if (antes && RE_DETERMINANTE.test(antes)) {
    return { ordem: false, regra: 'substantivo', comando };
  }
  // 6. condicional / hipótese
  if (antes && RE_CONDICIONAL.test(antes)) {
    return { ordem: false, regra: 'condicional', comando };
  }
  // 7. citação — o verbo está dentro de aspas
  const aspasAntes = (t.slice(0, corte).match(/["'«»“”]/g) || []).length;
  if (aspasAntes % 2 === 1) {
    return { ordem: false, regra: 'citacao', comando };
  }
  // 8. está a falar DO comando
  if ((antes && RE_META.test(antes)) || RE_COMANDO_CITADO.test(t)) {
    return { ordem: false, regra: 'meta-comando', comando };
  }
  // 9. verbo tarde de mais na frase
  const palavrasAntes = antes ? antes.split(/\s+/).filter(Boolean).length : 0;
  if (palavrasAntes > MAX_PALAVRAS_ANTES) {
    return { ordem: false, regra: 'verbo-tarde', comando };
  }

  return { ordem: true, regra: 'ordem', comando };
}

/** Atalho booleano. */
function eOrdem(texto, opts = {}) {
  return classificar(texto, opts).ordem;
}

/** True se este comando está sujeito à guarda. */
function eSensivel(cmd) {
  return SENSIVEIS.has(String(cmd || '').toLowerCase());
}

module.exports = {
  classificar,
  eOrdem,
  eSensivel,
  SENSIVEIS,
  MAX_PALAVRAS_ANTES,
};
