/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║   DARK BOT — AURA DECIDE v1                                  ║
 * ║   Ela escolhe SE responde e COMO. Não reage a tudo.          ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * O PROBLEMA (reportado pelo Dark):
 *   "Ela tá parecendo um bot. Responde SEMPRE às minhas mensagens,
 *    mesmo o que não é pra ela."
 *
 *   Uma pessoa real num grupo não comenta tudo o que ouve. Lê,
 *   acha graça, e só fala quando faz sentido. O que a denunciava
 *   como bot não era o texto — era responder a 100% das mensagens.
 *
 * COMO DECIDE:
 *   Sempre → falam com ela (nome, menção, resposta directa, pergunta
 *            directa, ordem, pedido)
 *   Talvez → conversa de grupo onde ela pode meter-se
 *   Nunca  → conversa entre outros que não lhe diz respeito
 *
 * E escolhe o FORMATO: texto, áudio, figurinha ou reacção — como
 * uma pessoa que às vezes só manda um emoji em vez de escrever.
 */

'use strict';

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim();
}

// ── Sinais de que falam DIRECTAMENTE com ela ────────────────
const CHAMA_NOME = /\baura\b/i;
const PERGUNTA_DIRECTA = /\b(tu |voce |você |vc )?(achas|acha|pensas|pensa|sabes|sabe|podes|pode|queres|quer|consegues|consegue|viste|viu|lembras|lembra|gostas|gosta)\b/i;
const ORDEM = /\b(faz|fazer|manda|mande|envia|envie|toca|põe|poe|cria|criar|procura|busca|traz|mostra|diz|conta|explica|traduz|baixa|calcula)\b/i;
const SAUDACAO_DIRECTA = /^(oi|ola|olá|hey|bom dia|boa tarde|boa noite|e ai|eae)\b/i;
const AGRADECE = /\b(obrigad|valeu|brigad|thanks|tmj)\b/i;
// v6.93: saudação AO GRUPO ("bom dia malta") não é saudação A ELA —
// acordada por defeito não significa meter-se onde não é chamada.
const SAUDACAO_AO_GRUPO = /\b(malta|pessoal|gente|todos|toda a gente|galera|rapazes|raparigas|fam[ií]lia|mi[uú]dos|cambada)\b/i;
const DESPEDIDA = /\b(tchau|adeus|ate logo|até logo|ate amanha|boa noite|xau|falou)\b/i;

// ── Conversa entre OUTROS (não é com ela) ───────────────────
// Menciona outra pessoa por @, ou responde a alguém que não é o bot
const MENCIONA_OUTRO = /@\d{6,}/;

/**
 * Decide se a AURA deve responder.
 *
 * @param {object} o
 * @param {string} o.texto
 * @param {boolean} o.isOwner        é o Dark
 * @param {boolean} o.isGroup
 * @param {boolean} o.mencionada     @bot ou nome do bot
 * @param {boolean} o.respostaAoBot  respondeu a uma msg dela
 * @param {boolean} o.temMedia
 * @param {number}  o.pessoasNoGrupo
 * @param {number}  o.msgsDesdeUltima  mensagens desde a última vez que falou
 * @returns {{responde:boolean, motivo:string, chance:number}}
 */
function deveResponder(o = {}) {
  const {
    texto = '', isOwner = false, isGroup = false,
    mencionada = false, respostaAoBot = false, temMedia = false,
    pessoasNoGrupo = 0, msgsDesdeUltima = 0,
  } = o;

  const t = norm(texto);

  // ── SEMPRE responde ───────────────────────────────────────
  if (mencionada) return { responde: true, motivo: 'mencionada', chance: 1 };
  if (respostaAoBot) return { responde: true, motivo: 'responderam-lhe', chance: 1 };
  if (CHAMA_NOME.test(t)) return { responde: true, motivo: 'chamaram-na', chance: 1 };

  // PV é conversa a dois — responde sempre
  if (!isGroup) return { responde: true, motivo: 'conversa privada', chance: 1 };

  // v6.93: saudação AO GRUPO ("bom dia malta") nunca a puxa — nem no meio
  // de uma conversa com ela (a janela auraTalk não conta como menção).
  // Não é com ela que estão a falar.
  if (SAUDACAO_DIRECTA.test(t) && SAUDACAO_AO_GRUPO.test(t) &&
      !CHAMA_NOME.test(t) && !mencionada && !respostaAoBot) {
    return { responde: false, motivo: 'saudação ao grupo, não a ela', chance: 0.2 };
  }

  // Grupo acordado: se a pessoa está na conversa com ela, continua
  try {
    const talk = require('./auraTalk');
    if (o.senderNumber && talk.estaAFalar(o.remoteJid, o.senderNumber)) {
      return { responde: true, motivo: 'ainda está a falar com ela', chance: 1 };
    }
  } catch {}

  // ── No grupo, do Dark ─────────────────────────────────────
  if (isOwner) {
    // pergunta ou ordem dirigida → responde
    if (PERGUNTA_DIRECTA.test(t) || ORDEM.test(t) || t.includes('?')) {
      return { responde: true, motivo: 'pergunta/ordem do Dark', chance: 1 };
    }
    if (SAUDACAO_DIRECTA.test(t) || AGRADECE.test(t) || DESPEDIDA.test(t)) {
      // "bom dia malta" é para o grupo, não para ela — não se mete.
      if (SAUDACAO_AO_GRUPO.test(t) && !CHAMA_NOME.test(t)) {
        return { responde: false, motivo: 'saudação ao grupo, não a ela', chance: 0.2 };
      }
      return { responde: true, motivo: 'saudação do Dark', chance: 1 };
    }
    if (temMedia) return { responde: true, motivo: 'Dark mandou média', chance: 0.9 };

    // O DARK A FALAR COM OUTROS — o problema reportado.
    // Ela não se mete em tudo. Às vezes só reage, às vezes cala-se.
    if (MENCIONA_OUTRO.test(texto)) {
      return { responde: false, motivo: 'o Dark fala com outra pessoa', chance: 0.15 };
    }

    // Comentário solto num grupo com gente: ela nem sempre comenta.
    // Quanto mais gente, menos ela se intromete.
    const muitaGente = pessoasNoGrupo > 8;
    const faladoraDemais = msgsDesdeUltima < 2;   // acabou de falar
    let chance = muitaGente ? 0.35 : 0.6;
    if (faladoraDemais) chance *= 0.5;

    return {
      responde: Math.random() < chance,
      motivo: 'comentário solto do Dark',
      chance,
    };
  }

  // ── No grupo, de outra pessoa ─────────────────────────────
  // Sem a chamarem, ela não se mete na conversa dos outros.
  return { responde: false, motivo: 'conversa entre outros', chance: 0 };
}

/**
 * Escolhe COMO responder — como uma pessoa que às vezes manda áudio,
 * às vezes só um emoji.
 *
 * @returns {'texto'|'audio'|'reacao'}
 */
function comoResponder(o = {}) {
  const { texto = '', isOwner = false, isGroup = false, pediuAudio = false } = o;
  const t = norm(texto);

  // pedido explícito manda sempre
  if (pediuAudio) return 'audio';

  // Só reage (emoji) quando a mensagem não pede resposta:
  // elogios curtos, concordâncias, coisas fofas.
  const soReagir = /^(kk+|haha+|rs+|😂|❤|🖤|top|boa|isso|exato|exacto|verdade|concordo|amei|lindo|linda)\b/i.test(texto.trim())
    || texto.trim().length <= 3;
  if (isGroup && soReagir && Math.random() < 0.6) return 'reacao';

  // Áudio quando ELA quer. Não é só afectivo no PV — uma pessoa
  // às vezes manda voz para explicar, responder, ou porque lhe
  // apetece. Raro o suficiente para não virar rádio.
  const ordem = /\b(promove|ban|fecha|abre|sticker|play|menu|kick|adiciona com adm)\b/i.test(t);
  if (isOwner && !ordem) {
    const afectivo = /\b(saudades|amo|amor|beijo|carinho|te quero|falta|ouve|escuta)\b/i.test(t);
    const explicar = t.length > 36 || /\b(porque|explica|conta|como foi|o que)\b/i.test(t);
    let p = isGroup ? 0.06 : 0.14;
    if (afectivo) p += isGroup ? 0.10 : 0.22;
    if (explicar && !isGroup) p += 0.08;
    if (Math.random() < Math.min(0.42, p)) return 'audio';
  }

  return 'texto';
}

/** Emoji de reacção adequado ao que foi dito. */
function escolherReacao(texto) {
  const t = norm(texto);
  if (/\b(kk+|haha+|rs+|engracad|piada)\b/.test(t)) return '😂';
  if (/\b(amo|amor|saudades|beijo|carinho)\b/.test(t)) return '🖤';
  if (/\b(top|boa|otimo|ótimo|excelente|perfeito|amei)\b/.test(t)) return '🔥';
  if (/\b(triste|chateado|mal|dor)\b/.test(t)) return '🥺';
  if (/\b(verdade|exato|exacto|concordo|isso)\b/.test(t)) return '💯';
  return ['🖤', '🌹', '👀', '😌'][Math.floor(Math.random() * 4)];
}

module.exports = { deveResponder, comoResponder, escolherReacao, norm };
