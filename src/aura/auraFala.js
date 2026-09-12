/**
 * DARK BOT v7.41 — A VOZ DA AURA EM TUDO
 *
 * Auditoria: havia sítios onde ela falava como sistema:
 *   • "Não consegui: <erro técnico>"           (auraBrain/auraActions)
 *   • "Diz outra vez o que queres, sem rodeios."(auraInterpret)
 *   • "Entendi." / "Ok." / "👋"                  (fallback offline genérico)
 *   • "_confusa_ Ai... Não entendi muito bem"    (fallback offline do dono)
 *   • comandos executados por conversa a devolver "❌ Uso: !cmd <arg>"
 *
 * Este módulo dá-lhe SEMPRE uma resposta com o jeito dela, consoante
 * o que aconteceu (não percebeu / não conseguiu / faltou algo / o
 * comando falou como bot), quem fala (Dark vs outros) e o humor.
 * Nunca a mesma frase duas vezes seguidas no mesmo chat.
 */
'use strict';

const _ultima = new Map(); // jid → última frase usada

function _pick(jid, lista) {
  const prev = _ultima.get(jid);
  const opts = lista.length > 1 ? lista.filter(x => x !== prev) : lista;
  const r = opts[Math.floor(Math.random() * opts.length)];
  _ultima.set(jid, r);
  return r;
}

const F = {
  // não percebeu o que a pessoa quer
  naoPercebi: {
    dark: [
      'Não apanhei bem, Dark. Diz-me de outra forma? 🌹',
      'Hã? Perdi-me aí, amor. Repete devagar.',
      'Ficou meio solto isso… o que é que queres exactamente? 🖤',
      'Explica-me melhor que eu faço.',
    ],
    outros: [
      'Não percebi. Diz de outra forma?',
      'Como assim? Explica melhor.',
      'Perdi-me aí. O que é que queres?',
    ],
  },
  // percebeu mas não conseguiu fazer (erro técnico escondido)
  naoConsegui: {
    dark: [
      'Tentei, mas não me deixou, Dark. 😕 Tenta outra vez daqui a nada?',
      'Isso falhou do meu lado, amor. Não foi por falta de vontade. 🖤',
      'Hmm, não consegui agora. Se quiseres tento de outra maneira.',
    ],
    outros: [
      'Não consegui fazer isso agora.',
      'Falhou do meu lado. Tenta daqui a pouco.',
      'Não deu. Tenta outra vez mais tarde.',
    ],
  },
  // falta informação para executar (arg em falta)
  faltaAlgo: {
    dark: [
      'Faço já — só me falta {oque}. 🌹',
      'Claro, amor. Só preciso de {oque}.',
      'Tá, mas falta-me {oque}.',
    ],
    outros: [
      'Preciso de {oque} para isso.',
      'Diz-me {oque} e eu faço.',
    ],
  },
  // não pode (permissão)
  naoPodes: {
    outros: [
      'Isso não é para ti. 😌',
      'Isso só quem consegue {precisa}. 😌',
      'Para isso precisas de {precisa}.',
    ],
  },
  // IA indisponível / sem resposta gerada
  semCabeca: {
    dark: [
      'Dá-me um segundo, Dark, estou meio lenta agora. 🖤',
      'Fiquei sem palavras — literalmente. Já volto ao normal.',
      'Ouvi-te, amor. Só não me sai nada de jeito agora. Repete daqui a pouco?',
    ],
    outros: [
      'Dá-me um momento.',
      'Estou lenta agora, já volto.',
      'Repete daqui a pouco.',
    ],
  },
};

function _fill(s, vars = {}) {
  return s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

/**
 * Frase com o jeito dela.
 * @param {'naoPercebi'|'naoConsegui'|'faltaAlgo'|'naoPodes'|'semCabeca'} tipo
 * @param {{jid?:string,isOwner?:boolean,oque?:string,precisa?:string}} o
 */
function dizer(tipo, o = {}) {
  const grupo = F[tipo] || F.naoPercebi;
  const lista = (o.isOwner && grupo.dark) ? grupo.dark : (grupo.outros || grupo.dark);
  return _fill(_pick(o.jid || '_', lista), o);
}

/** Uma mensagem tem cara de sistema/bot? (erro técnico, "Uso:", stack…) */
const RE_BOT = /^(❌|⚠️|⛔|🚫|erro|error|uso:|usage|exception|typeerror|referenceerror|cannot read|undefined|null|failed|não consegui:|nao consegui:|s[oó] (o )?(dono|admin|adm|vip)s? pode|apenas (o )?(dono|admin|adm|vip)|comando (exclusivo|restrito|apenas))/i;
const RE_TEC = /\b(TypeError|ReferenceError|SyntaxError|RangeError|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|status code \d{3}|at \w+ \(|node_modules|\.js:\d+|request failed|axios|timeout of \d+ms)\b/i;
function pareceBot(texto) {
  const t = String(texto || '').trim();
  if (!t) return false;
  return RE_BOT.test(t) || RE_TEC.test(t);
}

/**
 * Reescreve uma resposta de sistema na voz dela. Mantém a informação útil
 * ("Uso: !ban @pessoa" → "só me falta a pessoa"), esconde o técnico.
 */
function humanizar(texto, o = {}) {
  const t = String(texto || '').trim();
  if (!t) return dizer('naoConsegui', o);
  if (!pareceBot(t)) return t;
  // pedido de argumento ("Uso: !cmd <x>" / "Marca a pessoa" / "Diz o nome")
  const uso = t.match(/uso:\s*\S+\s+(.+)/i);
  if (uso) {
    let oque = uso[1].replace(/[<>\[\]]/g, '').trim();
    oque = oque.replace(/@\w+/g, 'a pessoa (marca com @)').replace(/\|/g, ' ou ');
    return dizer('faltaAlgo', { ...o, oque });
  }
  if (/marca|menciona|@/i.test(t) && /pessoa|alguém|alguem|quem/i.test(t)) return dizer('faltaAlgo', { ...o, oque: 'saber quem é (marca com @ ou responde à mensagem)' });
  if (/link|url/i.test(t) && /manda|envia|coloca|diz/i.test(t)) return dizer('faltaAlgo', { ...o, oque: 'o link' });
  if (/permiss|só (o )?(dono|admin)|apenas (o )?(dono|admin)|not allowed|não tens/i.test(t)) return dizer('naoPodes', { ...o, precisa: /dono/i.test(t) ? 'ser o Dono' : 'ser admin' });
  // erro técnico → esconde, mas guarda uma pista curta se for legível
  const pista = t.replace(/^[❌⚠️⛔🚫]\s*/, '').replace(/[`*_]/g, '').split('\n')[0].slice(0, 70);
  const legivel = pista && !RE_TEC.test(pista) && !/^(erro|error)\b/i.test(pista) && pista.length > 6;
  return dizer('naoConsegui', o) + (legivel ? `\n> ${pista}` : '');
}

/**
 * Envolve o sock para que tudo o que um comando executado POR CONVERSA
 * envia com cara de bot saia na voz dela. Reacções e média passam intactas.
 */
function sockNaVozDela(sock, o = {}) {
  if (!sock || typeof sock.sendMessage !== 'function') return sock;
  const orig = sock.sendMessage.bind(sock);
  return new Proxy(sock, {
    get(t, k) {
      if (k !== 'sendMessage') return t[k];
      return async (jid, content, opts) => {
        try {
          if (content && typeof content.text === 'string' && pareceBot(content.text)) {
            content = { ...content, text: humanizar(content.text, { ...o, jid }) };
          }
        } catch {}
        return orig(jid, content, opts);
      };
    },
  });
}

module.exports = { dizer, humanizar, pareceBot, sockNaVozDela };
