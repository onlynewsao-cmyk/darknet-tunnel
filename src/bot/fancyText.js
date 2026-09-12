/**
 * DARK BOT — FANCY TEXT (v7.22)
 * ═══════════════════════════════════════════════════════════
 * Letras/símbolos/signos/caracteres estilizados para os cartões
 * (small caps, negrito matemático, monospace matemático).
 *
 * A "fonte" é adaptável: se quiseres outro estilo, muda a tabela
 * `PEQUENAS` ou os code points de `NEGRITO`/`MONO` — o resto do
 * cartão não mexe.
 */
'use strict';

// small caps (a→ᴀ, b→ʙ, …). Faltam apenas 'q' (usa ǫ) e 'x' (fica x).
const PEQUENAS = {
  a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ꜰ', g: 'ɢ', h: 'ʜ',
  i: 'ɪ', j: 'ᴊ', k: 'ᴋ', l: 'ʟ', m: 'ᴍ', n: 'ɴ', o: 'ᴏ', p: 'ᴘ',
  q: 'ǫ', r: 'ʀ', s: 'ꜱ', t: 'ᴛ', u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', x: 'x',
  y: 'ʏ', z: 'ᴢ',
};

// code points: negrito (sans-serif bold) e monospace matemáticos
const BASE_NEGRITO_MAI = 0x1D5D4; // 𝗔…𝗭
const BASE_NEGRITO_MIN = 0x1D5EE; // 𝗮…𝘇
const BASE_MONO_MAI    = 0x1D670; // 𝙰…𝚉
const BASE_MONO_MIN    = 0x1D68A; // 𝚊…𝚣

/** Converte texto para um estilo. */
function estilizar(texto, estilo = 'cartao') {
  const t = String(texto || '');

  if (estilo === 'mono') {
    return t.replace(/[A-Za-z]/g, (c) => {
      const mai = c === c.toUpperCase();
      return String.fromCodePoint((mai ? BASE_MONO_MAI : BASE_MONO_MIN) + c.toUpperCase().charCodeAt(0) - 65);
    });
  }
  if (estilo === 'negrito') {
    return t.replace(/[A-Za-z]/g, (c) => {
      const mai = c === c.toUpperCase();
      return String.fromCodePoint((mai ? BASE_NEGRITO_MAI : BASE_NEGRITO_MIN) + c.toUpperCase().charCodeAt(0) - 65);
    });
  }
  if (estilo === 'pequenas') {
    return t.toLowerCase().replace(/[a-z]/g, (c) => PEQUENAS[c] || c);
  }

  // 'cartao' — híbrido: 1.ª letra a negrito, resto em small caps
  // (é o estilo do cartão: 𝗗ᴜʀᴀᴛɪᴏɴ, 𝗩ɪᴇᴡꜱ, 𝗣ᴜʙʟɪꜱʜᴇᴅ, 𝗖ʜᴀɴɴᴇʟ)
  return t.toLowerCase().split(' ').map((w) => {
    if (!w) return w;
    const first = w[0];
    const bold = /[a-z]/.test(first)
      ? String.fromCodePoint(BASE_NEGRITO_MAI + first.toUpperCase().charCodeAt(0) - 65)
      : first;
    return bold + w.slice(1).replace(/[a-z]/g, (c) => PEQUENAS[c] || c);
  }).join(' ');
}

/**
 * Rótulos prontos do cartão de música (formato exacto pedido).
 * Se quiseres mudar só a fonte, altera o 2.º argumento de estilizar.
 */
const ROTULOS = {
  titulo:     estilizar('title', 'pequenas'),          // ᴛɪᴛʟᴇ
  duracao:    estilizar('duration', 'cartao'),         // 𝗗ᴜʀᴀᴛɪᴏɴ
  views:      estilizar('views', 'cartao'),            // 𝗩ɪᴇᴡꜱ
  publicado:  estilizar('published', 'cartao'),        // 𝗣ᴜʙʟɪꜱʜᴇᴅ
  canal:      estilizar('channel', 'cartao'),          // 𝗖ʜᴀɴɴᴇʟ
  replyNum:   estilizar('REPLY WITH NUMBER', 'mono'),  // 𝚁𝙴𝙿𝙻𝚈 𝚆𝙸𝚃𝙷 𝙽𝚄𝙼𝙱𝙴𝚁
  downAudio:  estilizar('download audio', 'pequenas'), // ᴅᴏᴡɴʟᴏᴀᴅ ᴀᴜᴅɪᴏ
  downDoc:    estilizar('download document', 'pequenas'),
  downVoice:  estilizar('download voice', 'pequenas'),
};

module.exports = { estilizar, PEQUENAS, ROTULOS };
