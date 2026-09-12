/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║   DARK BOT — AURA RULES ENGINE (v6.90)                       ║
 * ║   Ela aprende QUALQUER regra por conversa e executa sozinha   ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * ENSINAR (só o Dono):
 *   "quando eu disser pizza vc responde UHUL PIZZA"
 *   "se alguém mandar link avisa a pessoa"
 *   "quando alguém disser bom dia reage com ☀️"
 *   "se eu mandar a palavra código envia o link do grupo"
 *   "quando eu responder com este sticker remove a pessoa"  (sticker citado)
 *
 * GESTIONAR (só o Dono):
 *   "que regras te ensinei?"      → lista numerada
 *   "cancela a regra do pizza"    → apaga por palavra-chave
 *   "cancela a regra 2"           → apaga por número
 *   "esquece todas as regras"     → limpa tudo
 *
 * EXECUÇÃO (automática, qualquer mensagem livre sem prefixo):
 *   gatilho  → acção, com cooldown por regra+chat (15 s) para não
 *   virar spam. Mensagens de comando (com prefixo) nunca disparam.
 *
 * SEGURANÇA:
 *   - Só o Dono ensina/cancela (isOwner).
 *   - 'remover' só em grupo, nunca contra o Dono nem o bot.
 *   - Máx. 20 regras. Persistidas em BotConfig ('aura_rules') —
 *     sobrevivem a restarts do Render. Sem DB → memória.
 */
'use strict';

const _CHAVE = 'aura_rules';
const MAX_REGRAS = 20;
const COOLDOWN_MS = 15 * 1000;

let _regras = null;          // array | null (lazy)
const _ultimoDisparo = new Map(); // `${id}:${chat}` → ts

const _norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

async function _carregar() {
  if (_regras) return _regras;
  try {
    const BotConfig = require('../database/models/BotConfig');
    const v = await BotConfig.get(_CHAVE, null);
    _regras = Array.isArray(v) ? v : [];
  } catch (_) { _regras = []; }
  return _regras;
}

async function _guardar() {
  try {
    const BotConfig = require('../database/models/BotConfig');
    await BotConfig.set(_CHAVE, _regras);
  } catch (_) {}
}

// ═══════════════════════ PARSE DA FRASE DE ENSINO ═══════════════════════

const RE_ENSINO = /^\s*(se|quando)\b/i;
const RE_GATILHO_VERBO = /\b(disser|dizer|mandar|mandares|enviar|enviares|escrever|escreveres|reagir|responder|responderes)\b/i;
const RE_ALGUEM = /\b(algu[eé]m|alguem|qualquer pessoa|qualquer um|todos|a gente|gente)\b/i;
const RE_EU = /\b(eu)\b/i;

// acções, por ordem de especificidade
const ACOES = [
  { re: /\b(link do grupo|o link do grupo)\b/i, tipo: 'link' },
  { re: /\b(apaga|apagar|deleta|deletar|elimina)\b[^.?!]{0,20}\b(mensagem|msg|isso|isso aí)\b/i, tipo: 'apagar' },
  { re: /\b(remove|remover|removes|bane|banir|expulsa|expulsar|kick|chuta)\b/i, tipo: 'remover' },
  { re: /\b(avisa|avisar|adverte|alerta)\b/i, tipo: 'avisar' },
  { re: /\b(reage|reagir|reages)\b/i, tipo: 'reagir' },
  { re: /\b(responde|responder|respondes|diz|dizer|dizes|fala|falar|manda mensagem)\b/i, tipo: 'responder' },
  { re: /\b(manda|mandar|envia|enviar|manda-me|envia-me)\b/i, tipo: 'responder' },
];

function _extrairAcao(t) {
  for (const a of ACOES) {
    if (a.re.test(t)) {
      const r = { tipo: a.tipo };
      if (a.tipo === 'reagir') {
        // sem \b antes do emoji — pictogramas não são "word chars".
        // Captura o emoji COMPLETO: variation selector (☀️ = U+2600+FE0F),
        // ZWJ e sequências (👩‍💻).
        const m = t.match(/(?:reage|reagir|reages)[^.?!]{0,20}?\s(?:com\s+|o\s+|a\s+|esse\s+)?([\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{1F900}-\u{1F9FF}][\u{FE00}-\u{FE0F}\u{200D}\u{1F000}-\u{1FAFF}]*)/u);
        r.emoji = m ? m[1] : '👀';
      }
      if (a.tipo === 'responder') {
        // texto depois do verbo de resposta
        const m = t.match(/\b(?:responde(?:r|s)?|diz(?:er|es)?|fala(?:r)?|manda(?:r)?|envia(?:r)?|manda-me|envia-me|manda mensagem)\s+(?:com\s+|o\s+|a\s+|um\s+|uma\s+|me\s+)?(.{1,120})$/i);
        let txt = (m ? m[1] : '').replace(/^["'«»\s-]+|["'«»\s-]+$/g, '').trim();
        if (/^(isso|ele|ela|o link|a mensagem|a foto|a pessoa)\b/i.test(txt)) txt = '';
        r.texto = txt;
      }
      return r;
    }
  }
  return null;
}

// palavras que TERMINAM o gatilho (início da acção ou ligação)
const _STOP_RE = /^(vc|você|voce|vocês|tu|ela|ele|envia|enviar|manda|mandar|responde|responder|reage|reagir|reages|apaga|apagar|deleta|deletar|elimina|remove|remover|bane|banir|expulsa|expulsar|avisa|avisar|adverte|diz|dizer|dizes|fala|falar|link|grupo|mensagem|pessoa|com|me|o|a|um|uma)$/i;

/** Junta palavras do gatilho até bater num verbo de acção (máx. 3). */
function _cortaGatilho(words) {
  const out = [];
  for (const w of words) {
    if (STOP_TEST(w)) break;
    out.push(w);
    if (out.length >= 3) break;
  }
  return out.join(' ');
}
const STOP_TEST = w => _STOP_RE.test(w);

function _soDonoDaFrase(t) {
  // "eu disser" → só o Dono · "alguém disser" → qualquer pessoa
  if (RE_ALGUEM.test(t)) return false;
  const antes = (t.split(/\b(?:vc|você|vocês|tu)\b/i)[0] || t);
  return RE_EU.test(antes);
}

function _extrairGatilho(t) {
  // 1. sticker
  if (/\b(este|esse|o) (sticker|figurinha)\b/i.test(t)) {
    return { tipo: 'sticker', texto: '', soDono: _soDonoDaFrase(t) };
  }
  // 2. palavra entre aspas — prioridade máxima
  let m = t.match(/["'«]([^"'»]{1,60})["'»]/);
  if (m) return { tipo: 'palavra', texto: m[1].trim(), soDono: _soDonoDaFrase(t) };
  // 3. "a palavra/ frase/ código/ termo X"
  m = t.match(/\b(?:a\s+|o\s+)?(?:palavra|frase|c[oó]digo|termo)\s+([\wÀ-ÿ!?]+(?:\s+[\wÀ-ÿ!?]+){0,3})/i);
  if (m) {
    const texto = _cortaGatilho(m[1].split(/\s+/));
    if (texto.length >= 2) return { tipo: 'palavra', texto, soDono: _soDonoDaFrase(t) };
  }
  // 4. link
  if (/\b(mandar|enviar|disser|dizer|puser|p[oó]r|colocar|mandares)\b[^.?!]{0,20}\b(um\s+|o\s+|a\s+)?link\b/i.test(t) || /\blink\b[^.?!]{0,15}\b(algu[eé]m|pessoa|grupo)\b/i.test(t)) {
    return { tipo: 'link', texto: '', soDono: _soDonoDaFrase(t) };
  }
  // 5. depois do verbo de gatilho: "quando eu disser bom dia reage…"
  m = t.match(/\b(?:disser|dizer|mandar|mandares|enviar|enviares|escrever|escreveres)\s+(?:a\s+palavra\s+)?([\wÀ-ÿ!?]+)/i);
  if (m) {
    const restantes = t.slice(m.index + m[0].length).trim().split(/\s+/);
    const texto = _cortaGatilho([m[1], ...restantes]);
    if (texto.length >= 2) return { tipo: 'palavra', texto: texto.replace(/[!?.,;:]+$/, ''), soDono: _soDonoDaFrase(t) };
  }
  return null;
}

function _hashStickerCitado(msg) {
  try {
    const ci = msg?.message?.extendedTextMessage?.contextInfo ||
               msg?.message?.imageMessage?.contextInfo ||
               msg?.message?.videoMessage?.contextInfo;
    const st = ci?.quotedMessage?.stickerMessage;
    if (st?.fileSha256) {
      const buf = Buffer.isBuffer(st.fileSha256) ? st.fileSha256 : Buffer.from(st.fileSha256);
      return buf.toString('hex');
    }
  } catch (_) {}
  return '';
}

function _descrever(r) {
  const quem = r.gatilho.soDono ? 'TU' : 'alguém';
  switch (r.gatilho.tipo) {
    case 'palavra': return `Quando ${quem} disser "${r.gatilho.texto}"`;
    case 'link':    return `Quando ${quem} mandar um link`;
    case 'sticker': return `Quando ${quem} responder com o sticker registado`;
  }
  return '?';
}

function _descreverAcao(r) {
  switch (r.acao.tipo) {
    case 'responder': return `eu respondo: ${r.acao.texto || '(nada)'}`;
    case 'reagir':    return `eu reajo com ${r.acao.emoji}`;
    case 'remover':   return 'eu removo a pessoa do grupo';
    case 'avisar':    return 'eu aviso a pessoa';
    case 'link':      return 'eu mando o link do grupo';
    case 'apagar':    return 'eu apago a mensagem';
  }
  return '?';
}

// ═══════════════════════ ENSINO / GESTÃO ═══════════════════════

/** "que regras te ensinei?" / "cancela a regra X" / "esquece todas" */
async function gerir({ sock, msg, ctx, texto, isOwner }) {
  if (!isOwner) return false;
  const t = String(texto || '').trim();
  if (!t || t.length > 200) return false;
  const regras = await _carregar();

  // listar
  if (/\b(que|quais|quantas)\b[^.?!]{0,20}\bregras\b/i.test(t) || /\blista[r]?\s+(as\s+|todas\s+as\s+)?regras\b/i.test(t)) {
    if (!regras.length) {
      await sock.sendMessage(ctx.remoteJid, { text: 'Não me ensinaste nenhuma regra ainda. Diz, por exemplo: "quando eu disser pizza vc responde UHUL". 🖤' }, { quoted: msg }).catch(() => {});
      return true;
    }
    const linhas = regras.map((r, i) => `${i + 1}. ${_descrever(r)} → ${_descreverAcao(r)}${r.chat === '*' ? ' (em todo o lado)' : ''}`);
    await sock.sendMessage(ctx.remoteJid, {
      text: `📖 *AS MINHAS REGRAS (${regras.length}):*\n\n${linhas.join('\n')}\n\n> Cancela com: "cancela a regra <nº ou palavra>"`,
    }, { quoted: msg }).catch(() => {});
    return true;
  }

  // esquecer todas
  if (/\b(esquece|apaga|limpa|cancela)\b[^.?!]{0,25}\b(todas|tudo)\b[^.?!]{0,15}\bregras\b/i.test(t)) {
    _regras = [];
    await _guardar();
    await sock.sendMessage(ctx.remoteJid, { text: 'Livrei-me de todas as regras. Página em branco de novo. 🌙' }, { quoted: msg }).catch(() => {});
    return true;
  }

  // cancelar uma: "cancela a regra do pizza" / "cancela a regra 2"
  const mc = t.match(/\b(cancela|cancelar|apaga|apagar|remove|remover|esquece)\b[^.?!]{0,20}\bregras?\b\s*(?:d[oea|o])?\s*(.+)$/i);
  if (mc) {
    const alvo = (mc[2] || '').trim().toLowerCase();
    const mn = alvo.match(/^#?(\d{1,2})$/);
    let idx = -1;
    if (mn) idx = parseInt(mn[1], 10) - 1;
    else idx = regras.findIndex(r => (_norm(r.gatilho.texto) && _norm(alvo).includes(_norm(r.gatilho.texto))) || _norm(_descrever(r) + ' ' + _descreverAcao(r)).includes(_norm(alvo)));
    if (idx < 0 || idx >= regras.length) {
      await sock.sendMessage(ctx.remoteJid, { text: 'Não encontrei essa regra. Diz "que regras te ensinei?" para veres os números.' }, { quoted: msg }).catch(() => {});
      return true;
    }
    const [r] = _regras.splice(idx, 1);
    await _guardar();
    await sock.sendMessage(ctx.remoteJid, { text: `Cancelada: ${_descrever(r)} → ${_descreverAcao(r)}. 🌙` }, { quoted: msg }).catch(() => {});
    return true;
  }

  return false;
}

/** Ensinar: "se/quando [gatilho] [acção]". */
async function aprender({ sock, msg, ctx, texto, isOwner }) {
  if (!isOwner) return false;
  const t = String(texto || '').trim();
  if (!t || t.length > 300 || !RE_ENSINO.test(t)) return false;

  const acao = _extrairAcao(t);
  if (!acao) return false;
  const gatilho = _extrairGatilho(t);
  if (!gatilho) {
    await sock.sendMessage(ctx.remoteJid, {
      text: 'Quase. Diz-me o gatilho assim: "quando eu disser <palavra> vc <o que faço>". 🖤',
    }, { quoted: msg }).catch(() => {});
    return true;
  }

  const regras = await _carregar();
  if (regras.length >= MAX_REGRAS) {
    await sock.sendMessage(ctx.remoteJid, { text: `Já tenho ${MAX_REGRAS} regras na cabeça. Cancela alguma primeiro ("que regras te ensinei?").` }, { quoted: msg }).catch(() => {});
    return true;
  }

  const regra = {
    id: Date.now(),
    gatilho,
    acao,
    por: ctx.senderNumber,
    chat: ctx.isGroup ? ctx.remoteJid : '*',
    criadaEm: Date.now(),
  };

  if (gatilho.tipo === 'sticker') {
    const hash = _hashStickerCitado(msg);
    if (!hash) {
      await sock.sendMessage(ctx.remoteJid, {
        text: 'Para a regra do sticker, cita o sticker na mensagem (responde ao sticker com a instrução). 🖤',
      }, { quoted: msg }).catch(() => {});
      return true;
    }
    regra.gatilho.hash = hash;
  }

  if (gatilho.tipo === 'palavra' && (!gatilho.texto || gatilho.texto.length < 2)) {
    await sock.sendMessage(ctx.remoteJid, { text: 'Não apanhei a palavra do gatilho. Põe entre aspas: quando eu disser "pizza" … 🖤' }, { quoted: msg }).catch(() => {});
    return true;
  }

  _regras.push(regra);
  await _guardar();
  const onde = regra.chat === '*' ? '' : ' (neste grupo)';
  await sock.sendMessage(ctx.remoteJid, {
    text: `Tá. ${_descrever(regra)} → ${_descreverAcao(regra)}${onde}. 🖤`,
  }, { quoted: msg }).catch(() => {});
  return true;
}

// ═══════════════════════ EXECUÇÃO ═══════════════════════

function _disparaGatilho(r, texto, msg, ctx, isOwner) {
  if (r.gatilho.soDono && !isOwner) return false;
  if (r.gatilho.tipo === 'palavra') {
    const g = _norm(r.gatilho.texto).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^\\p{L}])${g}([^\\p{L}]|$)`, 'iu').test(_norm(texto));
  }
  if (r.gatilho.tipo === 'link') return /https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|pt|ao|co)\b/i.test(texto);
  if (r.gatilho.tipo === 'sticker') {
    if (!msg?.message?.stickerMessage) return false;
    try {
      const st = msg.message.stickerMessage;
      const buf = Buffer.isBuffer(st.fileSha256) ? st.fileSha256 : Buffer.from(st.fileSha256 || '');
      return buf.toString('hex') === r.gatilho.hash;
    } catch (_) { return false; }
  }
  return false;
}

/**
 * Aplica as regras a uma mensagem livre (sem prefixo).
 * @returns {Promise<boolean>} true se consumiu a mensagem.
 */
async function aplicar({ sock, msg, ctx, texto, isOwner, isCommandLike }) {
  if (msg?.key?.fromMe) return false;
  if (isCommandLike) return false;
  const regras = await _carregar();
  if (!regras.length) return false;
  const t = String(texto || '');

  for (const r of regras) {
    if (r.chat !== '*' && r.chat !== ctx.remoteJid) continue;
    if (!_disparaGatilho(r, t, msg, ctx, isOwner)) continue;

    // cooldown por regra+chat (remover/apagar não esperam)
    const key = r.id + ':' + ctx.remoteJid;
    const agora = Date.now();
    if (r.acao.tipo !== 'remover' && r.acao.tipo !== 'apagar') {
      if (agora - (_ultimoDisparo.get(key) || 0) < COOLDOWN_MS) continue;
      _ultimoDisparo.set(key, agora);
    }

    switch (r.acao.tipo) {
      case 'responder':
        if (!r.acao.texto) break;
        await sock.sendMessage(ctx.remoteJid, { text: r.acao.texto }, { quoted: msg }).catch(() => {});
        return true;

      case 'reagir':
        await sock.sendMessage(ctx.remoteJid, { react: { text: r.acao.emoji || '👀', key: msg.key } }).catch(() => {});
        break; // não consome — a conversa continua

      case 'avisar':
        await sock.sendMessage(ctx.remoteJid, {
          text: `⚠️ @${ctx.senderNumber} — isso não! Regra deste chat.`,
          mentions: [ctx.senderJid || `${ctx.senderNumber}@s.whatsapp.net`],
        }, { quoted: msg }).catch(() => {});
        return true;

      case 'link': {
        let link = '';
        try { link = 'https://chat.whatsapp.com/' + await sock.groupInviteCode(ctx.remoteJid); } catch (_) {}
        await sock.sendMessage(ctx.remoteJid, { text: link ? `🔗 ${link}` : 'Não consegui buscar o link deste grupo.' }, { quoted: msg }).catch(() => {});
        return true;
      }

      case 'apagar':
        try {
          await sock.sendMessage(ctx.remoteJid, { delete: msg.key });
          return true;
        } catch (_) { break; }

      case 'remover': {
        if (!ctx.isGroup) break;
        const config = require('../config');
        const alvoNum = String(ctx.senderNumber || '').replace(/\D/g, '');
        const donoNum = String(config.owner.number || '').replace(/\D/g, '');
        const botNum = String((sock.user?.id || '').split(':')[0]).replace(/\D/g, '') || String(process.env.BOT_NUMBER || '').replace(/\D/g, '');
        if (alvoNum === donoNum || alvoNum === botNum) break; // nunca o Dono nem o bot
        try {
          await sock.groupParticipantsUpdate(ctx.remoteJid, [ctx.senderJid || `${ctx.senderNumber}@s.whatsapp.net`], 'remove');
          await sock.sendMessage(ctx.remoteJid, { text: '🩸 Regra cumprida.' }, { quoted: msg }).catch(() => {});
        } catch (_) {
          await sock.sendMessage(ctx.remoteJid, { text: 'Regra mandava remover, mas não consegui — verifica se sou admin. 🥀' }, { quoted: msg }).catch(() => {});
        }
        return true;
      }
    }
  }
  return false;
}

/** Diagnóstico/testes. */
async function listar() { return await _carregar(); }
async function _reset() { _regras = []; _ultimoDisparo.clear(); await _guardar(); }

module.exports = { aprender, gerir, aplicar, listar, _reset };
