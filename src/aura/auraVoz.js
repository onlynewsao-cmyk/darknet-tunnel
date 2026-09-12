'use strict';
/**
 * AURA VOZ — fala do assunto, não descreve que está a gravar.
 *
 * O Dark pedia "manda um áudio, quero ouvir da tua voz isso"
 * e ela lia "claro Dark faz uma gravação de voz aqui está ouça".
 * Isso é rubrica de palco, não conversa. Aqui limpa-se o texto
 * e, se só restar meta, fala-se do tema (mensagem citada / ADM).
 */

function norm(s) {
  return String(s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ').trim();
}

function pediuAudio(texto) {
  const t = norm(texto);
  if (!t) return false;
  const temVoz = /\b(audio|voz|ptt|nota de voz|mensagem de voz)\b/.test(t);
  const temPedido = /\b(mand[ae]|envi[ae]|manda-?me|envia-?me|quero|quer|faz|faca|grav[ae]|poe|poem|diz|fala|responde|ouve|ouvir|escuta|escutar)\b/.test(t);
  return temVoz && temPedido;
}

/** Texto que o modelo escreve quando FINGE enviar voz. */
function eMetaVoz(texto) {
  const s = norm(texto);
  if (!s) return true;
  const meta = (
    /gravacao de voz/.test(s) ||
    /aqui est[aá] (o |a )?(audio|gravacao|nota)/.test(s) ||
    /faz(er)? uma gravacao/.test(s) ||
    /mando (um )?audio/.test(s) ||
    /enviei (um )?audio/.test(s) ||
    /vou (te )?enviar (um )?(audio|voz)/.test(s) ||
    /ouve( isto| isso)?$/.test(s) ||
    /^ou[cç]a\b/.test(s) ||
    /nota de voz aqui/.test(s)
  );
  if (!meta) return false;
  // Se o resto da frase tem conteúdo real, não é só meta
  const semMeta = s
    .replace(/claro[, ]*(dark[, ]*)?/g, ' ')
    .replace(/faz(er)? uma gravacao( de voz)?( aqui)?/g, ' ')
    .replace(/aqui est[aá][,.]?/g, ' ')
    .replace(/\b(ou[cç]a|ouve)\b/g, ' ')
    .replace(/\b(audio|voz|ptt|gravacao|nota de voz)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return semMeta.length < 12;
}

function limparParaTts(texto) {
  return String(texto || '')
    .replace(/_([^_]{1,120})_/g, ' ')
    .replace(/\(ÁUDIO\)|\(AUDIO\)/gi, ' ')
    .replace(/\[STICKER:[^\]]+\]/gi, ' ')
    .replace(/\[IMAGE:[^\]]+\]/gi, ' ')
    .replace(/\[CMD:[^\]]+\]/gi, ' ')
    .replace(/\[(?:FAZ|APRENDI|APRENDI_GRUPO|REAGIR|SILENCIO|SILÊNCIO|IGNORAR)[^\]]*\]/gi, ' ') // v7.37
    .replace(/claro[, ]+(dark[, ]+)?faz(er)? uma grava[cç][aã]o[^.!?]*/gi, ' ')
    .replace(/aqui est[aá][,.]?\s*(ou[cç]a|ouve)?/gi, ' ')
    .replace(/\p{Extended_Pictographic}[\uFE0F\u200D]*/gu, ' ')
    .replace(/[*_~`]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function extrairCitado(msg, groupContext) {
  const q = msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  const qtxt = q?.conversation || q?.extendedTextMessage?.text || '';
  if (qtxt) return String(qtxt).trim();
  const m = String(groupContext || '').match(/Respondendo a:\s*"([^"]{2,300})"/i);
  return m ? m[1].trim() : '';
}

function fallbackFala({ texto = '', citado = '', groupContext = '' } = {}) {
  const tema = norm(texto + ' ' + citado + ' ' + groupContext);
  if (/\b(adm|admin)\b/.test(tema)) {
    return 'Sobre o admin: se eu for admin do grupo, eu te promovo de verdade no WhatsApp. Não vou dizer que já te pus se o sistema não deixou. Promove-me e pede outra vez.';
  }
  if (citado) {
    const curto = citado.replace(/[_*]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180);
    return 'Sobre isso que marcaste: ' + curto;
  }
  return 'Tô aqui. Fala o que queres que eu te diga com a minha voz.';
}

function textoParaFalar(resposta, opts = {}) {
  const limpo = limparParaTts(resposta);
  // v7.36: era 500 chars → a Aura dizia só o início do que lhe mandavam. Agora fala tudo (até ~2 min de voz).
  if (limpo && !eMetaVoz(limpo) && limpo.length >= 8) return limpo.slice(0, 1800);
  return fallbackFala(opts);
}

/** Instrução para o modelo quando o áudio vai ser lido em voz. */
function instrucaoVoz({ citado = '', groupContext = '' } = {}) {
  let extra = '';
  if (citado) extra += `\nEstão a responder a esta mensagem: "${String(citado).slice(0, 240)}". Fala DISSO.`;
  else if (groupContext) extra += `\nContexto da conversa:\n${String(groupContext).slice(0, 400)}\nFala do assunto, não do facto de estares a gravar.`;
  return `
O Dark quer OUVIR a tua voz. O texto que escreveres vai ser LIDO em áudio.
Escreve só as palavras que saem da tua boca — 1 a 4 frases sobre o assunto desta conversa.
PROIBIDO escrever: "aqui está o áudio", "gravação de voz", "ouça", "claro faz uma gravação", "mando um áudio", rubricas do tipo _envia um áudio_.
Fala como no telemóvel, do tema. Se o tema é admin/ADM, fala disso com honestidade.${extra}`;
}

module.exports = {
  norm,
  pediuAudio,
  eMetaVoz,
  limparParaTts,
  extrairCitado,
  fallbackFala,
  textoParaFalar,
  instrucaoVoz,
};
