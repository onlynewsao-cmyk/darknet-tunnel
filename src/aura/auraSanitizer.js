/**
 * Impede a AURA de mandar para o WhatsApp o que é instrução interna.
 * Foi isto que saiu no grupo: "_ignora a mensagem começando com prefixo ponto_"
 */
'use strict';

const LEAK = [
  /ignora a mensagem[^.!\n]{0,80}/gi,
  /come[cç]ando com prefixo[^.!\n]{0,80}/gi,
  /n[aã]o respondes? a (mensagens? )?(com )?prefixo[^.!\n]{0,60}/gi,
  /n[aã]o reveles? (este|o) prompt[^.!\n]{0,80}/gi,
  /system prompt|instru[cç][oõ]es internas/gi,
  /como (uma? )?(assistente|ia|intelig[eê]ncia) virtual[^.!\n]{0,80}/gi,
  /fui programad[ao][^.!\n]{0,80}/gi,
  /n[aã]o posso (criar|gerar).{0,40}(ofensiv|xing)[^.!\n]{0,80}/gi,
  /conte[uú]do ofensivo[^.!\n]{0,80}/gi,
  /minhas? diretrizes[^.!\n]{0,80}/gi,
  /n[aã]o vou zoar ou xingar[^.!\n]{0,80}/gi,
  /posso ajudar com algo mais\??/gi,
  /n[aã]o posso atender (a )?esse pedido[^.!\n]{0,80}/gi,
  /n[aã]o posso (fazer|atender|realizar) (chamadas?|liga[cç][oõ]es?)[^.!\n]{0,80}/gi,
  /como posso ajudar voc[eê] hoje\??/gi,
  /em que posso (ser [uú]til|ajudar)\??/gi,
  /estou aqui para ajudar[^.!\n]{0,40}/gi,
];

function eSoPontuacao(t) {
  return /^[\s.·•\-_/\\|!?~`'"]+$/.test(String(t || ''));
}

function limparResposta(txt) {
  let t = String(txt || '');
  // v7.15: remove raciocínio bruto (<think>…) que o modelo reasoning devolve
  t = t.replace(/<\s*think\s*>[\s\S]*?(?:<\s*\/\s*think\s*>|$)/gi, '')
       .replace(/<\s*\/\s*think\s*>/gi, '')
       .replace(/^here'?s?\s+a?\s*thinking process[\s:]*/gi, '');
  for (const re of LEAK) t = t.replace(re, '');
  t = t.replace(/[_*]{1,2}\s*(ignora|nao responde|prefixo)[^_*]{0,80}[_*]{1,2}/gi, '');
  t = t.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return t.length < 2 ? '' : t;
}

const LINK_FALSO = /chat\.whatsapp\.com\/(?:abc|exemplo|\.\.\.|xxx|teste|fake|abcdefghijkl)/i;

function eLinkInventado(txt) {
  const s = String(txt || '');
  return LINK_FALSO.test(s) ||
    /n[aã]o (posso|tenho) (compartilhar|aceder|acesso).{0,40}link real/i.test(s) ||
    /exemplo falso/i.test(s) ||
    /\(ÁUDIO\)|\(AUDIO\)/i.test(s);
}

function eVazamento(txt) {
  const s = String(txt || '').toLowerCase();
  return /prefixo ponto|ignora a mensagem|system prompt|nao posso atender a esse pedido|exemplo falso|n[aã]o tenho acesso [àa] url real/.test(s) ||
    LINK_FALSO.test(s);
}

module.exports = { limparResposta, eSoPontuacao, eVazamento, eLinkInventado, LINK_FALSO };
