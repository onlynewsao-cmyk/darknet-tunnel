'use strict';
/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║   DARK BOT — AURA AVANÇADA v6.86 🧠                          
 * ║   Consciência social, aprendizagem e memória que volta       ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * O que acrescenta à Aura:
 *
 *  1. CONSCIÊNCIA SOCIAL (contextoSocial) — quem está a falar agora,
 *     quantas vezes, o tom da conversa (zoeira/discussão/calma) e o
 *     assunto. Entra no prompt: ela sabe SEMPRE o que se passa.
 *
 *  2. APRENDE COM CORRECÇÕES (aprenderRegra/regrasDe) — "aura não
 *     faças isso", "para de mandar emoji", "faz assim" viram regras
 *     por chat, persistidas, e entram no prompt. Ela não repete o
 *     erro duas vezes.
 *
 *  3. ANTI-REPETIÇÃO (registarFala/ultimasFalas) — guarda as últimas
 *     falas dela no chat; o prompt proíbe repeti-las. Acaba o
 *     copy-paste que denuncia bot.
 *
 *  4. FACTOS COM TEMPO (factoTemporal) — "meu aniversário é em
 *     março", "amanhã tenho prova" — marca o facto com o QUANDO,
 *     para ela poder trazer à tona sozinha depois.
 *
 *  5. MULTI-INTENÇÃO (detectarMulti) — "entra no canal e reage tudo"
 *     executa as DUAS coisas, em sequência.
 *
 * Tudo em memória + botConfigCache (sem Mongo → não bloqueia).
 */

// ── 1. CONSCIÊNCIA SOCIAL ─────────────────────────────────────
function contextoSocial(jid, { limite = 40 } = {}) {
  const out = { falantes: [], tom: 'calma', silencioMin: null, assunto: '' };
  try {
    const hist = require('./auraHistorico');
    const msgs = hist.mensagensDoGrupo(jid, limite);
    if (msgs.length) {
      const agora = Date.now();
      const ultimaTs = msgs[0].ts > 1e12 ? msgs[0].ts : msgs[0].ts * 1000;
      out.silencioMin = Math.floor((agora - ultimaTs) / 60000);

      const conta = new Map();
      for (const m of msgs) {
        const nome = m.nome || String(m.jid).split('@')[0];
        conta.set(nome, (conta.get(nome) || 0) + 1);
      }
      out.falantes = [...conta.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([nome, n]) => ({ nome, n }));

      // tom da conversa
      const juntos = msgs.slice(0, 15).map(m => m.texto).join(' ');
      const risos = (juntos.match(/\b(kk+|haha+|rsrs|😂||lol)\b/gi) || []).length;
      const caps = (juntos.match(/\b[A-ZÁÉÍÓÚÇÂÊÔ]{4,}[!?]?/g) || []).length;
      const briga = /\b(burro|idiota|cala|mentiroso|roub|ladrao|est[úu]pido|odeio)\b/i.test(juntos);
      out.tom = briga ? 'discussão' : risos >= 3 ? 'zoeira' : caps >= 3 ? 'animada' : 'calma';
    }
  } catch {}
  try {
    const ass = require('./auraAssunto');
    const a = ass.ler(jid);
    if (a?.assunto) out.assunto = a.assunto;
  } catch {}
  return out;
}

/** Texto pronto para o prompt — vazio se não há nada a dizer. */
function contextoParaPrompt(jid) {
  const c = contextoSocial(jid);
  if (!c.falantes.length && !c.assunto) return '';
  const linhas = ['O QUE SE PASSA NESTE GRUPO AGORA:'];
  if (c.falantes.length) {
    linhas.push('- A falar: ' + c.falantes.map(f => `${f.nome} (${f.n} msgs)`).join(', '));
  }
  if (c.tom !== 'calma') linhas.push('- Tom da conversa: ' + c.tom + '.');
  if (c.silencioMin != null && c.silencioMin >= 30) linhas.push(`- Está quieto há ${c.silencioMin} min.`);
  if (c.assunto) linhas.push('- Assunto do momento: ' + c.assunto + '.');
  return linhas.join('\n');
}

// ── 2. APRENDE COM CORRECÇÕES ─────────────────────────────────
const CORRECCAO_RE = /\b(n[ãa]o fa[cç]as?|n[ãa]o mandes?|n[ãa]o uses?|n[ãa]o digas?|para (de|com)|pára (de|com)|nunca mais|deixa de|proibido|faz assim|faz sempre|sempre que|a partir de agora)\b/i;

async function aprenderRegra(jid, texto) {
  const t = String(texto || '').trim();
  if (!t || t.length > 140 || !CORRECCAO_RE.test(t)) return null;
  try {
    const bcc = require('../bot/botConfigCache');
    const key = 'aura_regras_' + String(jid || '').replace(/\W/g, '');
    const cur = (await bcc.get(key, [])) || [];
    const arr = Array.isArray(cur) ? cur : [];
    if (arr.includes(t)) return t;
    arr.push(t);
    await bcc.set(key, arr.slice(-8));
    return t;
  } catch { return null; }
}

async function regrasDe(jid) {
  try {
    const bcc = require('../bot/botConfigCache');
    const cur = (await bcc.get('aura_regras_' + String(jid || '').replace(/\W/g, ''), [])) || [];
    return Array.isArray(cur) ? cur : [];
  } catch { return []; }
}

// ── 3. ANTI-REPETIÇÃO ─────────────────────────────────────────
const _falas = new Map(); // jid → [textos]
function registarFala(jid, texto) {
  const k = String(jid || '');
  const t = String(texto || '').trim();
  if (!k || t.length < 4) return;
  const arr = _falas.get(k) || [];
  arr.push(t);
  _falas.set(k, arr.slice(-6));
}
function ultimasFalas(jid) {
  return _falas.get(String(jid || '')) || [];
}

// ── 4. FACTOS COM TEMPO ───────────────────────────────────────
/** "meu aniversário é em março" → { quando: 'em março' } etc. */
function factoTemporal(texto) {
  const t = String(texto || '').toLowerCase();
  let m = t.match(/\b(anivers[áa]rio)\b[^àa\n]{0,20}?\b(em|no|na|dia|à?s)\s+([a-z0-9çãõáéíóú\/\- ]{2,20})/i);
  if (m) return { tipo: 'aniversário', quando: (m[2] + ' ' + m[3]).trim() };
  // (sem \b no fim: acentos como "ã" não são word-char em regex sem /u)
  m = t.match(/\b(amanh[ãa]|depois de amanh[ãa]|hoje à noite|esta noite|segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo|pr[óo]xima semana|que vem)(?=\s|,|!|\?|\.|:|$)/i);
  if (m) return { tipo: 'evento', quando: m[1] };
  m = t.match(/\b(prova|exame|entrevista|consulta|jogo|show|viagem)\b[^àa\n]{0,15}?\b(amanh[ãa]|hoje|segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo|em|no|na|dia)\s*([a-z0-9çãõáéíóú\/\- ]{0,15})/i);
  if (m) return { tipo: m[1], quando: (m[2] + ' ' + (m[3] || '')).trim() };
  return null;
}

// ── 5. MULTI-INTENÇÃO ─────────────────────────────────────────
/**
 * "entra no canal e reage tudo" → duas capacidades.
 * Divide nos conectores e devolve até 2 detecções distintas.
 */
function detectarMulti(texto, brain) {
  const b = brain || require('./auraBrain');
  const primeiro = b.detectarCapacidade(texto);
  if (!primeiro) return [];
  const partes = String(texto || '')
    .split(/\s+(?:e depois|e ent[ãa]o|e tamb[ée]m|e a seguir|e)\s+/i)
    .map(p => p.trim())
    .filter(p => p.length > 3);
  const achados = [primeiro];
  for (const p of partes) {
    if (p === String(texto).trim()) continue;
    const seg = b.detectarCapacidade(p);
    if (seg && seg.id !== achados[0].id) { achados.push(seg); break; }
  }
  return achados;
}

module.exports = {
  contextoSocial,
  contextoParaPrompt,
  aprenderRegra,
  regrasDe,
  registarFala,
  ultimasFalas,
  factoTemporal,
  detectarMulti,
};
