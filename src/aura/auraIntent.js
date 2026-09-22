'use strict';
/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║   AURA INTENT v1.0 — CÉREBRO SUPERINTELIGENTE 🧠💜          ║
 * ║   Ela entende como gente de verdade, não como bot.          ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * Problema: bots respondem tudo, até quando não é pra eles.
 * Pessoa real NÃO. Pessoa real:
 *  - Vê se falaram COM ela ou ENTRE si
 *  - Só age se tem CERTEZA do que querem
 *  - Decodifica intenção por contexto, não por palavra-chave
 *  - Sabe quando é indireta, quando é direta, quando é zoeira
 *
 * Este módulo faz isso.
 */

const NOME_AURA = ['aura', 'pinkchyu', 'pinkchyuwu', 'pinkchyu', 'gothchyu', 'lin', 'lin lamar', 'goth girl', 'goth baddie'];

// ── Helpers ─────────────────────────────────────────────────
function norm(s) {
  return String(s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ').trim();
}

function containsName(text) {
  const t = norm(text);
  return NOME_AURA.some(n => t.includes(n));
}

function isQuestion(text) {
  const t = String(text || '').trim();
  return t.includes('?') || /^(quem|o que|que|quando|onde|como|por que|porque|qual|quanto|cade|onde esta|o que e)\b/i.test(t);
}

function isCommand(text) {
  const t = norm(text);
  return /^(manda|envia|mostra|faz|cria|troca|muda|coloca|bota|posta|gera|me da|me manda|quero|preciso|pode)\b/.test(t);
}

// ── Análise de contexto de conversa ─────────────────────────
/**
 * Analisa se a conversa é entre outros usuários
 * @param {string[]} recentMessages - últimas mensagens do grupo (texto puro)
 * @param {string} currentSender - quem mandou agora
 * @returns {boolean} true se parece conversa entre outros
 */
function isConversationBetweenOthers(recentMessages = [], currentSender = '') {
  if (!recentMessages || recentMessages.length < 2) return false;
  // Se últimas 3 mensagens são de pessoas diferentes e nenhuma menciona Aura
  // e não há pergunta direta, provavelmente é conversa entre eles
  const last3 = recentMessages.slice(-3);
  const mentionsAura = last3.some(m => containsName(m));
  if (mentionsAura) return false;
  // Se última mensagem menciona outro usuário @ ou nome, e não é pergunta pra Aura
  const t = norm(last3[last3.length - 1] || '');
  if (/\b(ele|ela|vc|voce|tu|mano|bro|amigo|amiga)\b.*\b(falou|disse|fez|foi|vai)\b/.test(t)) {
    return true;
  }
  return false;
}

// ── Detector principal ──────────────────────────────────────
/**
 * @param {string} text - texto da mensagem atual
 * @param {object} ctx
 * @param {boolean} ctx.isGroup - está em grupo?
 * @param {boolean} ctx.isReplyToAura - respondeu mensagem da Aura?
 * @param {boolean} ctx.isPrivateChat - PV?
 * @param {string} ctx.pushName - nome de quem mandou
 * @param {string[]} ctx.recentTexts - últimas mensagens do chat (pra contexto)
 * @param {boolean} ctx.mentionedAuraInGroup - mencionaram Aura no grupo recentemente?
 * @param {string} ctx.groupContext - contexto do grupo
 * @param {boolean} ctx.isOwner - é o Dark?
 * @returns {object} análise completa
 */
function analyzeIntent(text, ctx = {}) {
  const {
    isGroup = false,
    isReplyToAura = false,
    isPrivateChat = false,
    pushName = '',
    recentTexts = [],
    mentionedAuraInGroup = false,
    isOwner = false,
    groupContext = '',
  } = ctx;

  const t = norm(text);
  const original = String(text || '');
  const lowerOrig = original.toLowerCase();

  // ── 1. É direto pra Aura? ─────────────────────────────────
  let directScore = 0; // 0-100
  let directReasons = [];

  if (isPrivateChat) {
    directScore += 80;
    directReasons.push('PV = sempre direto');
  }
  if (isOwner) {
    directScore += 20;
    directReasons.push('é o Dark');
  }
  if (isReplyToAura) {
    directScore += 90;
    directReasons.push('respondeu Aura diretamente');
  }
  if (containsName(original)) {
    directScore += 85;
    directReasons.push(`mencionou nome: ${NOME_AURA.find(n => t.includes(n))}`);
  }
  if (/^(aura|pinkchyu|lin)[,\s!?:]/i.test(original.trim())) {
    directScore += 95;
    directReasons.push('começa com nome dela');
  }
  // Segunda pessoa + contexto recente onde Aura falou
  if (/\b(voce|vc|tu|ce|cê)\b/.test(t) && (mentionedAuraInGroup || recentTexts.slice(-2).some(m => containsName(m)))) {
    directScore += 40;
    directReasons.push('segunda pessoa + contexto Aura');
  }
  // Pergunta/comando sem alvo específico em PV ou após Aura falar
  if ((isQuestion(original) || isCommand(original)) && !isGroup) {
    directScore += 30;
    directReasons.push('pergunta/comando em PV');
  }
  if ((isQuestion(original) || isCommand(original)) && isGroup && mentionedAuraInGroup) {
    directScore += 35;
    directReasons.push('pergunta/comando após menção Aura no grupo');
  }

  // Penalidades — conversa entre outros
  if (isGroup && !isReplyToAura && !containsName(original)) {
    if (isConversationBetweenOthers(recentTexts)) {
      directScore -= 50;
      directReasons.push('parece conversa entre outros');
    }
    // Se menciona outra pessoa @ ou nome específico que não é Aura
    if (/@\w+/.test(original) && !containsName(original)) {
      directScore -= 30;
      directReasons.push('menciona outra pessoa, não Aura');
    }
    // Se texto é continuação de assunto entre outros sem envolver Aura
    if (recentTexts.length >= 2) {
      const last = norm(recentTexts[recentTexts.length - 1] || '');
      const secondLast = norm(recentTexts[recentTexts.length - 2] || '');
      // Se últimas mensagens são do mesmo assunto entre outros e atual não quebra padrão
      if (last && secondLast && !containsName(last) && !containsName(secondLast) && !containsName(t)) {
        directScore -= 15;
        directReasons.push('continuidade de conversa sem Aura');
      }
    }
  }

  directScore = Math.max(0, Math.min(100, directScore));
  const isDirectToAura = directScore >= 50;

  // ── 2. O que o usuário QUER? (intenção) ────────────────────
  let intent = 'GENERAL_CHAT';
  let intentConfidence = 0;
  let intentDetails = {};

  // Foto dela
  if (/\b(foto|selfie|pic|imagem|foto sua|foto tua|manda foto|mostra.*foto|quero.*foto|tem foto|manda.*selfie|mostra.*rosto|cara|look|cosplay.*foto)\b/.test(t) &&
      (containsName(t) || /\b(tua|sua|vc|voce|tu|dela|aura|pinkchyu)\b/.test(t) || isPrivateChat || isReplyToAura)) {
    // Verifica se é foto DELA, não foto aleatória
    if (/\b(tua|sua|dela|aura|pinkchyu|seu rosto|seu cosplay|voce|vc)\b/.test(t) || containsName(t) || isReplyToAura) {
      intent = 'PHOTO_REQUEST';
      intentConfidence = 85;
      // Tipo de foto
      if (/cosplay/.test(t)) intentDetails.photoType = 'cosplay';
      else if (/goth|dark|preta/.test(t)) intentDetails.photoType = 'goth';
      else if (/selfie|rosto|cara|face/.test(t)) intentDetails.photoType = 'selfie';
      else intentDetails.photoType = 'random';
    }
  }

  // Trocar foto de perfil dela / do bot
  if (/\b(troca|muda|altera|coloca|bota|atualiza)\b.{0,20}\b(foto de perfil|perfil|foto tua|foto sua|foto do bot|foto do perfil|pfp|avatar)\b/.test(t) ||
      /\b(foto de perfil|perfil)\b.{0,20}\b(troca|muda|nova)\b/.test(t)) {
    intent = 'PROFILE_PIC_UPDATE';
    intentConfidence = 90;
    intentDetails = { wantsProfileUpdate: true };
  }

  // Foto de perfil pedida junto com foto
  if (intent === 'PHOTO_REQUEST' && /\b(perfil|bot|whatsapp)\b/.test(t)) {
    intent = 'PROFILE_PIC_UPDATE';
    intentConfidence = 80;
  }

  // Pergunta sobre ela (quem é, vida, etc)
  if (/\b(quem.*(voce|vc|tu|e|eh)|o que.*faz|onde.*mora|quantos anos|qual.*idade|de onde|nome verdadeiro|real name|pinkchyu.*quem|voce.*goth|cosplay.*faz|o que.*gosta)\b/.test(t)) {
    if (containsName(t) || isPrivateChat || isReplyToAura || isQuestion(original)) {
      // Só se for sobre ela, não sobre outra coisa
      if (!/^(quem.*(fez|escreveu|mandou|disse))/.test(t)) { // evita "quem escreveu isso"
        intent = 'QUESTION_ABOUT_HER';
        intentConfidence = 75;
      }
    }
  }

  // Pedido pra fazer algo (ação)
  if (isCommand(original) && isDirectToAura) {
    if (intent === 'GENERAL_CHAT') {
      intent = 'ACTION_REQUEST';
      intentConfidence = 60;
      intentDetails.rawCommand = original.slice(0, 200);
    }
  }

  // Conversa entre outros (não é pra ela)
  if (!isDirectToAura && isGroup) {
    intent = 'CONVERSATION_BETWEEN_OTHERS';
    intentConfidence = directScore < 30 ? 80 : 50;
  }

  // Flirt / carinho / provocação direta
  if (/\b(linda|gata|gostosa|te amo|amo voce|goth baddie|my goth|ur.*goth|favorita)\b/.test(t) && isDirectToAura) {
    intent = 'FLIRT_DIRECT';
    intentConfidence = 70;
  }

  // ── 3. Deve responder? ─────────────────────────────────────
  let shouldRespond = false;
  let shouldRespondReason = '';

  if (isPrivateChat) {
    shouldRespond = true;
    shouldRespondReason = 'PV sempre responde';
  } else if (isGroup) {
    if (isReplyToAura) {
      shouldRespond = true;
      shouldRespondReason = 'respondeu Aura direto no grupo';
    } else if (directScore >= 70) {
      shouldRespond = true;
      shouldRespondReason = `direto pra Aura (${directScore}%) - ${directReasons.join(', ')}`;
    } else if (directScore >= 50 && intentConfidence >= 60) {
      shouldRespond = true;
      shouldRespondReason = `provavelmente pra Aura (${directScore}%) + intenção clara (${intentConfidence}%)`;
    } else if (directScore < 30) {
      shouldRespond = false;
      shouldRespondReason = `conversa entre outros (${directScore}%) - fica quieta`;
    } else {
      // Zona cinzenta 30-50 — só responde se for muito claro ou se for owner
      if (isOwner && directScore >= 35) {
        shouldRespond = true;
        shouldRespondReason = 'zona cinzenta mas é o Dark';
      } else {
        shouldRespond = false;
        shouldRespondReason = `zona cinzenta (${directScore}%) - melhor não interromper`;
      }
    }
  }

  // ── 4. Confiança geral ─────────────────────────────────────
  const overallConfidence = Math.round((directScore * 0.6 + intentConfidence * 0.4));

  return {
    isDirectToAura,
    directScore,
    directReasons,
    intent,
    intentConfidence,
    intentDetails,
    shouldRespond,
    shouldRespondReason,
    overallConfidence,
    isQuestion: isQuestion(original),
    isCommand: isCommand(original),
    containsName: containsName(original),
    text: original.slice(0, 300),
    // Para logs
    summary: `${isDirectToAura ? 'DIRETO' : 'NÃO-DIRETO'} (${directScore}%) | ${intent} (${intentConfidence}%) | ${shouldRespond ? 'RESPONDE' : 'IGNORA'} | ${shouldRespondReason}`,
  };
}

// ── Versão rápida (sem contexto) pra usar no brain ──────────
function isDirectSimple(text, { isGroup = false, isReply = false } = {}) {
  if (!isGroup) return true;
  if (isReply) return true;
  return containsName(text);
}

module.exports = {
  analyzeIntent,
  isDirectSimple,
  containsName,
  NOME_AURA,
  isConversationBetweenOthers,
};
