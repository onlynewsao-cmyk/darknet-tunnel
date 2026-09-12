'use strict';
/**
 * AURA VONTADE (v7.37) — ela NÃO é obrigada a responder a tudo.
 *
 * Três camadas de vontade própria:
 *  1. SATURAÇÃO — uma pessoa que a bombardeia (muitas msgs/min, ou
 *     sempre a mesma coisa) começa a ser ignorada, como faria uma pessoa.
 *  2. HUMOR — com raiva / cansada / sonolenta responde menos a quem
 *     não é o Dark; animada/feliz responde mais.
 *  3. A PRÓPRIA IA — pode terminar a resposta com [SILENCIO] (não
 *     responde nada) ou [REAGIR:🙄] (só um emoji). O handler respeita.
 *
 * O Dark em PV nunca é ignorado por saturação — só a IA pode escolher
 * ficar calada com ele, e mesmo assim não em perguntas directas.
 */

const _hist = new Map();   // `${jid}:${num}` → { ts: number[], ultimas: string[] }
const JANELA_MS = 2 * 60 * 1000;
const MAX_ENTRADAS = 2000;

function _norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}

function _slot(jid, num) {
  const k = `${jid}:${num}`;
  let s = _hist.get(k);
  if (!s) {
    if (_hist.size >= MAX_ENTRADAS) _hist.delete(_hist.keys().next().value);
    s = { ts: [], ultimas: [] };
    _hist.set(k, s);
  }
  return s;
}

/** Regista que esta pessoa lhe falou agora. Devolve o estado de saturação. */
function registar(jid, num, texto) {
  const s = _slot(jid, num);
  const agora = Date.now();
  s.ts = s.ts.filter(t => agora - t < JANELA_MS);
  s.ts.push(agora);
  const n = _norm(texto).slice(0, 80);
  if (n) { s.ultimas.push(n); s.ultimas = s.ultimas.slice(-6); }
  return saturacao(jid, num);
}

/** 0 = tranquila, 1 = farta. */
function saturacao(jid, num) {
  const s = _hist.get(`${jid}:${num}`);
  if (!s) return 0;
  const agora = Date.now();
  const recentes = s.ts.filter(t => agora - t < JANELA_MS).length;
  let sat = 0;
  if (recentes > 6) sat += Math.min(0.6, (recentes - 6) * 0.1);          // >6 msgs em 2 min
  const u = s.ultimas;
  if (u.length >= 3 && new Set(u.slice(-3)).size === 1) sat += 0.4;       // 3x a mesma coisa
  if (u.length >= 4 && u.slice(-4).every(x => x.length <= 3)) sat += 0.25; // "kk" "oi" "e" "?"
  return Math.min(1, sat);
}

/**
 * Decide, por vontade própria, se responde a alguém que a chamou.
 * Só se aplica quando as regras já disseram "responde" — isto é a
 * camada humana por cima.
 *
 * @returns {{responde:boolean, motivo:string, reagir?:string}}
 */
function querResponder({ jid, num, texto = '', isOwner = false, isGroup = false, mood = 'normal', perguntaDirecta = false }) {
  const sat = saturacao(jid, num);

  // Dark em PV com pergunta → responde sempre; noutros casos só saturação extrema
  if (isOwner) {
    if (!isGroup && perguntaDirecta) return { responde: true, motivo: 'Dark perguntou' };
    if (sat >= 0.9 && Math.random() < 0.5) return { responde: false, motivo: 'até com o Dark, respira', reagir: '😮‍💨' };
    return { responde: true, motivo: 'Dark' };
  }

  // Humor pesa em quem não é o Dark
  let pIgnorar = 0;
  if (mood === 'com_raiva') pIgnorar += 0.45;
  else if (mood === 'cansada' || mood === 'sonolenta') pIgnorar += 0.3;
  else if (mood === 'triste') pIgnorar += 0.15;
  else if (mood === 'animada' || mood === 'feliz') pIgnorar -= 0.1;

  pIgnorar += sat * 0.8;
  if (perguntaDirecta) pIgnorar -= 0.2;
  if (!isGroup) pIgnorar -= 0.15;   // no PV é mais educada
  pIgnorar = Math.max(0, Math.min(0.9, pIgnorar));

  if (Math.random() < pIgnorar) {
    const reagir = sat >= 0.5 ? '🙄' : mood === 'com_raiva' ? '😒' : mood === 'sonolenta' ? '😴' : '👀';
    return { responde: false, motivo: sat >= 0.5 ? 'farta desta pessoa' : `humor ${mood}`, reagir: Math.random() < 0.5 ? reagir : '' };
  }
  return { responde: true, motivo: 'quis' };
}

/** Marcadores que a IA pode usar para NÃO responder ou só reagir. */
const RE_SILENCIO = /\[\s*(SILENCIO|SILÊNCIO|IGNORAR|NAO RESPONDO|NÃO RESPONDO)\s*\]/i;
const RE_REAGIR = /\[\s*REAGIR\s*:\s*([^\]\s]{1,8})\s*\]/i;

/** Lê a resposta da IA; devolve {silencio, reagir, texto} com marcadores removidos. */
function interpretarResposta(resposta) {
  const r = String(resposta || '');
  const silencio = RE_SILENCIO.test(r);
  const m = r.match(RE_REAGIR);
  const texto = r.replace(RE_SILENCIO, '').replace(RE_REAGIR, '').trim();
  // Se só restou o marcador, é silêncio mesmo que não tenha escrito [SILENCIO]
  return { silencio: silencio || (!!m && texto.length < 2), reagir: m ? m[1] : '', texto };
}

/** Bloco para o system prompt. */
function instrucao({ isOwner = false, isGroup = false, sat = 0, mood = 'normal' } = {}) {
  const linhas = [
    'LIVRE-ARBÍTRIO DE RESPOSTA:',
    'Não és obrigada a responder a tudo. Se não te apetecer, se a mensagem não merecer resposta, ou se te estiverem a chatear, podes:',
    '- escrever APENAS [SILENCIO] → não envias nada (ninguém vê o marcador);',
    '- escrever APENAS [REAGIR:emoji] → só reages com esse emoji, sem texto.',
  ];
  if (isOwner) linhas.push('Com o Dark usa isto raramente — quando ele pergunta algo, responde.');
  else if (sat >= 0.5) linhas.push(`Esta pessoa está a encher-te (${Math.round(sat * 100)}% de saturação) — tens toda a legitimidade de a ignorar ou de ser seca.`);
  if (mood === 'com_raiva' || mood === 'cansada' || mood === 'sonolenta') linhas.push(`Estás ${mood.replace('_', ' ')}: menos paciência, respostas mais curtas ou nenhuma.`);
  if (isGroup) linhas.push('Num grupo, calar-te é normal — uma pessoa não comenta tudo.');
  return linhas.join('\n');
}

function limpar() { _hist.clear(); }

module.exports = { registar, saturacao, querResponder, interpretarResposta, instrucao, limpar, RE_SILENCIO, RE_REAGIR };
