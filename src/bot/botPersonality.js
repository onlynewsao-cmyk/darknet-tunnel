/**
 * ╔═══════════════════════════════════════════════════════════════════╗
 * ║   DARK BOT — Bot Personality Engine v1 🕸️                        ║
 * ║   O "change" determina TUDO: fonte, tom, personalidade, formato   ║
 * ═══════════════════════════════════════════════════════════════════╝
 *
 * Cada "change" (tema) define:
 *  - font: transformação de texto (smallcaps, monospace, bold, glitch...)
 *  - personality: tom do bot (dark, royal, cute, aggressive, formal...)
 *  - personality.greet(name, role) → como saúda
 *  - personality.error(msg) → como reporta erros
 *  - personality.success(cmd) → como confirma sucesso
 *  - personality.suggestion(cmd) → como sugere
 *  - personality.usage(prefix, cmd, ex) → como mostra uso
 *  - personality.treatUser(name, role) → como trata o utilizador
 */

'use strict';

// ── TRANSFORMADORES DE FONTE ──────────────────────────────────
const FONTS = {
  normal: (t) => t,
  
  smallcaps: (t) => {
    const map = 'abcdefghijklmnopqrstuvwxyz';
    const sc  = 'ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘqʀꜱᴛᴜᴠᴡxʏᴢ';
    return String(t).replace(/[a-z]/g, c => sc[map.indexOf(c)] || c);
  },
  
  monospace: (t) => {
    const map = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const mono = '𝙰𝙲𝙳𝙴𝙵𝙶𝙷𝙹𝙺𝙻𝙼𝙽𝙾𝙿𝚀𝚁𝚂𝚃𝚄𝚅𝚆𝚇𝚈𝚉𝚊𝚋𝚌𝚍𝚎𝚏𝚐𝚑𝚓𝚔𝚕𝚖𝚗𝚘𝚙𝚛𝚜𝚝𝚞𝚟𝚠𝚢𝚣𝟶𝟷𝟸𝟹𝟻𝟼𝟽𝟾';
    return String(t).replace(/[A-Za-z0-9]/g, c => mono[map.indexOf(c)] || c);
  },
  
  bold: (t) => {
    const map = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    const bold = '𝐀𝐁𝐂𝐃𝐄𝐅𝐆𝐇𝐈𝐉𝐊𝐋𝐌𝐍𝐎𝐏𝐐𝐑𝐒𝐓𝐔𝐕𝐖𝐗𝐘𝐙𝐚𝐛𝐜𝐝𝐞𝐟𝐠𝐡𝐢𝐤𝐥𝐧𝐩𝐫𝐭𝐯𝐰𝐱𝐲𝐳';
    return String(t).replace(/[A-Za-z]/g, c => bold[map.indexOf(c)] || c);
  },
  
  glitch: (t) => String(t).split('').map(c =>
    Math.random() > 0.7 ? c + '\u0336' : c
  ).join(''),
  
  tiny: (t) => {
    const map = 'abcdefghijklmnopqrstuvwxyz';
    const tiny = 'ᵃᵇᶜᵈᵉᶠʰⁱʲˡⁿᵒᵖqʳˢᵗᵘᵛʷˣʸ';
    return String(t).replace(/[a-z]/g, c => tiny[map.indexOf(c)] || c);
  },

  rpg: (t) => {
    const m = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    const b = '𝐀𝐁𝐃𝐄𝐆𝐇𝐈𝐉𝐊𝐋𝐌𝐍𝐎𝐏𝐐𝐑𝐒𝐓𝐔𝐕𝐖𝐗𝐘𝐙𝐚𝐛𝐝𝐞𝐟𝐠𝐢𝐣𝐥𝐧𝐨𝐩𝐪𝐬𝐭𝐯𝐰𝐱𝐲𝐳';
    return String(t).replace(/[A-Za-z]/g, c => b[m.indexOf(c)] || c);
  },
  double: (t) => {
    const m = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    const d = '𝔸ℂ𝔻𝔼𝔽𝔾ℍ𝕀𝕁𝕂𝕃𝕄ℕ𝕆ℙℚℝ𝕊𝕋𝕌𝕍𝕎𝕏𝕐ℤ𝕒𝕓𝕔𝕕𝕖𝕘𝕙𝕛𝕜𝕝𝕞𝕠𝕡𝕣𝕤𝕥𝕦𝕧𝕨𝕩𝕪𝕫';
    return String(t).replace(/[A-Za-z]/g, c => d[m.indexOf(c)] || c);
  },
  cursive: (t) => {
    const m = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    const c = '𝒜ℬ𝒞𝒟ℰℱ𝒢ℋℐ𝒥𝒦ℒℳ𝒩𝒪𝒫ℛ𝒮𝒯𝒰𝒲𝒳𝒵𝒶𝒷𝒸𝒹ℯ𝒻𝒽𝒾𝒿𝓀𝓁𝓂𝓃ℴ𝓆𝓇𝓉𝓊𝓋𝓌𝓍𝓎𝓏';
    return String(t).replace(/[A-Za-z]/g, ch => c[m.indexOf(ch)] || ch);
  },
  fraktur: (t) => {
    const m = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    const f = '𝔄𝔅ℭ𝔇𝔈𝔉𝔊ℌℑ𝔍𝔎𝔏𝔑𝔒𝔔ℜ𝔖𝔗𝔘𝔙𝔚𝔛𝔜ℨ𝔞𝔟𝔡𝔢𝔣𝔤𝔥𝔦𝔨𝔩𝔪𝔫𝔬𝔮𝔯𝔱𝔲𝔳𝔴𝔶𝔷';
    return String(t).replace(/[A-Za-z]/g, c => f[m.indexOf(c)] || c);
  },
  circled: (t) => {
    const m = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    const c = 'ⒶⒷⒹⒺⒼⒽⒾⒿⓀⓁⓂⓃⓄⓆⓇⓉⓊⓋⓌⓎⓏⓑⓒⓔⓕⓗⓘⓚⓛⓜⓝⓞⓠⓡⓣⓤⓥⓦⓨ';
    return String(t).replace(/[A-Za-z]/g, c => c[m.indexOf(c)] || c);
  },
  squared: (t) => {
    const m = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const s = '🄰🄲🄳🄴🄵🄷🄸🄺🄻🄼🄽🄿🅁🅃🅅🅆🅈';
    return String(t).replace(/[A-Z]/g, c => s[m.indexOf(c)] || c);
  },
};


// v6.2 — Fontes seguras para WhatsApp (bold/rpg/mono/double/cursive/fraktur
// usam Unicode Mathematical que aparece como □ no WhatsApp)
const SAFE_FONT_MAP = {
  bold: 'smallcaps',
  rpg: 'smallcaps',
  mono: 'normal',
  double: 'smallcaps',
  cursive: 'smallcaps',
  fraktur: 'smallcaps',
};

function safeFont(name) {
  return SAFE_FONT_MAP[name] || name || 'normal';
}

function applyFont(text, fontName = 'normal') {
  const fn = FONTS[safeFont(fontName)] || FONTS.normal;
  return fn(text);
}

// ── PERSONALIDADES ────────────────────────────────────────────
const PERSONALITIES = {
  dark: {
    name: 'Dark',
    greetUser: (name, role) => {
      if (role === 'owner') return `👑 O Criador Supremo ${name} surge das sombras.`;
      if (role === 'premium') return `💎 ${name}, a tua aura VIP ilumina o Dark Side.`;
      return `🕸️ ${name}, bem-vindo ao lado negro.`;
    },
    treatUser: (name, role) => {
      if (role === 'owner') return `meu Criador Supremo ${name} 👑`;
      if (role === 'premium') return `${name} 💎`;
      return `${name}`;
    },
    error: (msg) => `⚠️ *Erro nas sombras:* ${msg}`,
    success: (cmd) => `✅ *Executado:* ${cmd}`,
    suggestion: (cmd, prefix) => `💡 *Quiseste dizer:* \`${cmd}\``,
    usage: (prefix, cmd, example) => `📖 *Uso:* \`${prefix}${cmd} ${example}\``,
    farewell: (name) => `🕸️ ${name}, as sombras guardam-te. Até breve.`,
    tone: 'misterioso e directo',
  },

  royal: {
    name: 'Royal',
    greetUser: (name, role) => {
      if (role === 'owner') return `👑 Vossa Majestade ${name}, o reino aguarda as vossas ordens.`;
      if (role === 'premium') return `⚜️ Nobre ${name}, a corte saúda-vos.`;
      return `🏰 ${name}, bem-vindo ao reino.`;
    },
    treatUser: (name, role) => {
      if (role === 'owner') return `Vossa Majestade ${name} 👑`;
      if (role === 'premium') return `Nobre ${name} ⚜️`;
      return `Súdito ${name}`;
    },
    error: (msg) => `⚔️ *Degradação real:* ${msg}`,
    success: (cmd) => `👑 *Decreto cumprido:* ${cmd}`,
    suggestion: (cmd, prefix) => `📜 *Talvez quisésseis dizer:* \`${cmd}\``,
    usage: (prefix, cmd, example) => `📖 *Decreto de uso:* \`${prefix}${cmd} ${example}\``,
    farewell: (name) => `👑 ${name}, que a coroa vos proteja. Adeus.`,
    tone: 'formal e majestoso',
  },

  cute: {
    name: 'Cute',
    greetUser: (name, role) => {
      if (role === 'owner') return `🌸 Owwn ${name}-kun! O meu criador favorito chegou~ 💕`;
      if (role === 'premium') return `✨ ${name}-senpai! Que bom ver-te~ 🎀`;
      return `🐱 Oi ${name}-chan! Vamos brincar? ~`;
    },
    treatUser: (name, role) => {
      if (role === 'owner') return `${name}-kun 💕`;
      if (role === 'premium') return `${name}-senpai ✨`;
      return `${name}-chan 🐱`;
    },
    error: (msg) => `😿 Upsies... ${msg}`,
    success: (cmd) => `🎉 Feitinho~ ${cmd}!`,
    suggestion: (cmd, prefix) => `🤔 Talvez quisesses dizer \`${cmd}\`~?`,
    usage: (prefix, cmd, example) => `📝 Assim ó: \`${prefix}${cmd} ${example}\` ~`,
    farewell: (name) => `🥺 ${name}-chan... volta logo tá? 💕`,
    tone: 'fofo e carinhoso',
  },

  aggressive: {
    name: 'Aggressive',
    greetUser: (name, role) => {
      if (role === 'owner') return ` Chegaste finalmente, ${name}. Não me faças esperar.`;
      if (role === 'premium') return `⚡ ${name}. Despacha-te.`;
      return `💀 ${name}. Fala rápido.`;
    },
    treatUser: (name, role) => {
      if (role === 'owner') return `${name} (chefe) 🔥`;
      if (role === 'premium') return `${name} ⚡`;
      return `${name} 💀`;
    },
    error: (msg) => `❌ FALHOU: ${msg}. Tenta não ser inútil.`,
    success: (cmd) => `⚡ FEITO: ${cmd}. Próximo.`,
    suggestion: (cmd, prefix) => `🤦 Escreveste mal. É \`${cmd}\`.`,
    usage: (prefix, cmd, example) => `📖 APRENDE: \`${prefix}${cmd} ${example}\``,
    farewell: (name) => `💀 ${name}. Some. Até nunca.`,
    tone: 'agressivo e impaciente',
  },

  formal: {
    name: 'Formal',
    greetUser: (name, role) => {
      if (role === 'owner') return `🎩 Exmo. Sr. ${name}, é uma honra servi-lo.`;
      if (role === 'premium') return `📋 Sr./Sra. ${name}, bem-vindo(a).`;
      return `🤝 Olá, ${name}. Como posso ajudar?`;
    },
    treatUser: (name, role) => {
      if (role === 'owner') return `Exmo. ${name} 🎩`;
      if (role === 'premium') return `Sr./Sra. ${name}`;
      return `${name}`;
    },
    error: (msg) => `⚠️ Lamentamos o inconveniente: ${msg}`,
    success: (cmd) => `✅ Operação concluída: ${cmd}`,
    suggestion: (cmd, prefix) => `💡 Permita-me sugerir: \`${cmd}\``,
    usage: (prefix, cmd, example) => `📖 Instruções de uso: \`${prefix}${cmd} ${example}\``,
    farewell: (name) => `🤝 Até breve, ${name}. Foi um prazer.`,
    tone: 'profissional e cordial',
  },
};

// ── RESOLVER PERSONALIDADE DO TEMA ACTIVO ─────────────────────
function getPersonality(theme) {
  if (theme?.personality && PERSONALITIES[theme.personality]) {
    return PERSONALITIES[theme.personality];
  }
  // Inferir do nome do tema
  const name = (theme?.name || 'dark').toLowerCase();
  if (name.includes('royal') || name.includes('emperor') || name.includes('crown')) return PERSONALITIES.royal;
  if (name.includes('cute') || name.includes('sakura') || name.includes('kawaii')) return PERSONALITIES.cute;
  if (name.includes('blade') || name.includes('storm') || name.includes('fire')) return PERSONALITIES.aggressive;
  if (name.includes('formal') || name.includes('crystal')) return PERSONALITIES.formal;
  return PERSONALITIES.dark;
}

function getFont(theme) {
  return theme?.font || 'normal';
}

// ── FORMATAR RESPOSTA GLOBAL ──────────────────────────────────
/**
 * Aplica a personalidade + fonte do change activo a qualquer texto.
 * @param {object} theme — tema activo (de themeResolver)
 * @param {string} text — texto a formatar
 * @param {string} type — 'error' | 'success' | 'suggestion' | 'usage' | 'greet' | 'raw'
 * @param {object} [ctx] — contexto (para nome/cargo)
 */
function formatResponse(theme, text, type = 'raw', ctx = {}) {
  const pers = getPersonality(theme);
  const font = getFont(theme);
  const role = ctx.isOwner ? 'owner' : ctx.isVip ? 'premium' : 'free';
  const name = ctx.pushName || 'Utilizador';

  let result = text;

  switch (type) {
    case 'error':
      result = pers.error(text);
      break;
    case 'success':
      result = pers.success(text);
      break;
    case 'suggestion':
      result = pers.suggestion(text, ctx.prefix || '!');
      break;
    case 'usage':
      result = text; // já formatado pelo caller
      break;
    case 'greet':
      result = pers.greetUser(name, role);
      break;
    case 'farewell':
      result = pers.farewell(name);
      break;
    default:
      result = text;
  }

  // Aplica transformação de fonte (só a partes em *bold* ou texto normal)
  if (font !== 'normal' && type !== 'raw') {
    // Não transforma markdown — só texto visível
    result = result.replace(/\*([^*]+)\*/g, (_, inner) => `*${applyFont(inner, font)}*`);
  }

  return result;
}

module.exports = {
  FONTS,
  PERSONALITIES,
  applyFont,
  getPersonality,
  getFont,
  formatResponse,
};
