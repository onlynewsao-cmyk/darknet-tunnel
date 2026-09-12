/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║   DARK BOT v6 — Render Engine 🕸️                              ║
 * ║   Liga o change ao output real do bot                         ║
 * ║   Cada mensagem passa por aqui → sai com o visual do change   ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */
'use strict';

const changeThemes = require('./changeThemes');
const { applyFont, getFont, getPersonality, formatResponse } = require('./botPersonality');
const themeResolver = require('./themeResolver');

/**
 * Resolve o tema activo para um contexto (grupo ou global)
 */
async function getTheme(groupJid) {
  return themeResolver.getThemeForContext(groupJid);
}

/**
 * Renderiza um bloco de texto com as bordas decorativas do change.
 * Usa topBorder/bottomBorder/linePrefix/font do tema se disponíveis,
 * senão usa o frame clássico.
 */
function renderBlock(theme, title, lines = [], opts = {}) {
  const t = theme || changeThemes.getTheme('dark');
  const f = t.font || 'smallcaps';
  const icon = t.icon || '🕸️';
  const bullet = t.bullet || '▸';
  const V = t.frame?.[5] || '│';
  const H = t.frame?.[4] || '─';

  // Bordas decorativas (v5.6+) ou frame clássico
  const hasNewBorders = t.topBorder || t.bottomBorder;
  const top = hasNewBorders
    ? (t.topBorder || '').replace(/{TITLE}/g, applyFont(title || '', f)).replace(/{ICON}/g, icon).replace(/{BOT}/g, opts.botName || 'DARK BOT')
    : `${t.frame?.[0] || '╭'}${H.repeat(3)} ${icon} ${applyFont((title || 'MENU').toUpperCase(), f)} ${H.repeat(3)}${t.frame?.[1] || '╮'}`;

  const bot = hasNewBorders
    ? (t.bottomBorder || '').replace(/{ICON}/g, icon).replace(/{BOT}/g, opts.botName || 'DARK BOT')
    : `${t.frame?.[2] || '╰'}${H.repeat(30)}${t.frame?.[3] || '╯'}`;

  const linePfx = t.linePrefix || `${V}${bullet} `;
  const sep = t.sectionSep || t.sectionTop || '';

  const out = [top];
  if (sep && title) out.push(sep.replace(/{TITLE}/g, applyFont(title, f)).replace(/{ICON}/g, icon));

  for (const line of lines) {
    out.push(linePfx + line);
  }

  out.push(bot);
  if (t.vibe) out.push(`> ${t.vibe}`);
  return out.join('\n');
}

/**
 * Renderiza uma lista de comandos (submenu) com o visual do change.
 */
function renderSubmenu(theme, title, commands = [], opts = {}) {
  const t = theme || changeThemes.getTheme('dark');
  const f = t.font || 'smallcaps';
  const icon = t.icon || '🕸️';
  const prefix = opts.prefix || '!';

  // v7.24: agrupa por sub-categoria (group) — o submenu deixa de ser uma
  // lista plana gigante e passa a ter secções com título.
  let lines;
  if (commands.some(c => c.group)) {
    const grupos = new Map();
    for (const c of commands) {
      const g = c.group || 'Geral';
      if (!grupos.has(g)) grupos.set(g, []);
      grupos.get(g).push(c);
    }
    lines = [];
    let primeiro = true;
    for (const [g, itens] of grupos) {
      if (!primeiro) lines.push('');
      primeiro = false;
      lines.push(`*« ${g} »*`);
      for (const c of itens) {
        const cmd = `${prefix}${c.name || c.cmd || ''}`;
        const desc = c.desc || c.description || getDefaultDesc(c.cmd || c.name);
        lines.push(`*${cmd}* — _${desc}_`);
      }
    }
  } else {
    lines = commands.map(c => {
      const cmd = `${prefix}${c.name || c.cmd || ''}`;
      const desc = c.desc || c.description || getDefaultDesc(c.cmd || c.name);
      return `*${cmd}* — _${desc}_`;
    });
  }
  
  function getDefaultDesc(cmd) {
    if (!cmd) return 'Comando do bot';
    const descriptions = {
      // Info
      ping: 'Testar latência', info: 'Info do bot', dono: 'Contacto do dono',
      perfil: 'Teu perfil', status: 'Estado do bot', stats: 'Estatísticas',
      uptime: 'Tempo online', aiapis: 'Estado das APIs',
      // Grupos
      link: 'Link do grupo', linkgp: 'Link do grupo', todos: 'Marcar todos',
      hidetag: 'Marcar oculto', admins: 'Ver admins', regras: 'Ver regras',
      antilink: 'Anti-link on/off', antispam: 'Anti-spam on/off',
      welcome: 'Boas-vindas on/off', open: 'Abrir grupo', close: 'Fechar grupo',
      // Economia
      daily: 'Recompensa diária', saldo: 'Ver saldo', coins: 'Ver moedas',
      carteira: 'Carteira', inventario: 'Inventário', inv: 'Inventário',
      trabalhar: 'Trabalhar', crime: 'Cometer crime', roubar: 'Roubar',
      depositar: 'Depositar', sacar: 'Sacar', transferir: 'Transferir',
      // Interações
      abracar: 'Abraçar', beijar: 'Beijar', tapa: 'Dar tapa', soco: 'Dar soco',
      matar: 'Matar', dancar: 'Dançar', cantar: 'Cantar', rir: 'Rir', chorar: 'Chorar',
      // Jogos
      dado: 'Jogar dado', moeda: 'Jogar moeda', quiz: 'Quiz', forca: 'Jogo da forca',
      adivinha: 'Adivinhar', blackjack: 'Blackjack', cassino: 'Cassino', slots: 'Slots',
      // Utilidades
      clima: 'Ver clima', tempo: 'Previsão do tempo', pesquisar: 'Pesquisar',
      encurtar: 'Encurtar URL', traduzir: 'Traduzir', calc: 'Calculadora',
      // Zoeira
      gay: 'Medidor gay', lindo: 'Medidor beleza', burro: 'Medidor burrice',
      rico: 'Medidor riqueza', corno: 'Medidor chifres', safado: 'Medidor safadeza',
      gostoso: 'Medidor gostosura', nerd: 'Medidor nerd', otaku: 'Medidor otaku',
      // Áudio
      bass: 'Efeito bass', reverb: 'Efeito reverb', '8d': 'Efeito 8D',
      slowed: 'Slowed', nightcore: 'Nightcore', vaporwave: 'Vaporwave',
      // Dono
      restart: 'Reiniciar bot', broadcast: 'Mensagem em massa', eval: 'Executar código',
      setprefix: 'Mudar prefixo', settheme: 'Mudar tema',
    };
    return descriptions[cmd] || 'Comando do bot';
  }

  return renderBlock(t, title, lines, opts);
}

/**
 * Renderiza o cabeçalho de info (perfil, status, ping) com o visual do change.
 */
function renderInfo(theme, fields = [], opts = {}) {
  const t = theme || changeThemes.getTheme('dark');
  const f = t.font || 'smallcaps';
  const icon = t.icon || '🕸️';

  // Usa infoLine do tema se disponível (ex: RoninRPG)
  const linePfx = t.infoLine || t.linePrefix || `┃${icon} `;

  const lines = fields.map(([label, value]) => {
    const fl = label; // sem font no card (WhatsApp não suporta bold math)
    return `${fl}: ${value}`;
  });

  return renderBlock(t, opts.title || 'INFO', lines, opts);
}

/**
 * Renderiza uma resposta com personalidade (erro, sucesso, sugestão, uso).
 */
function renderResponse(theme, type, data, ctx = {}) {
  return formatResponse(theme, data, type, ctx);
}

/**
 * Renderiza o texto do card do menu carousel com o visual do change.
 */
function renderMenuCard(theme, info = {}, opts = {}) {
  const t = theme || changeThemes.getTheme('dark');
  const f = t.font || 'smallcaps';
  const icon = t.icon || '🕸️';

  const botName = opts.botName || 'DARK BOT';
  const userName = info.pushName || 'Utilizador';
  const cargo = info.cargo || 'Membro';
  const vip = info.vip || 'INATIVO ❌';
  const prefix = info.prefix || '!';

  // Aplica a fonte do change a cada campo
  const lines = [
    `${applyFont('BOT', f)}: ${botName}`,
    `${applyFont('USUÁRIO', f)}: ${userName}`,
    `${applyFont('CARGO', f)}: ${cargo}`,
    `${applyFont('VIP', f)}: ${vip}`,
    `${applyFont('PREFIXO', f)}: 『${prefix}』`,
  ];

  return lines.join('\n');
}

/**
 * Footer do menu com o visual do change.
 */
function renderMenuFooter(theme, botName = 'DARK BOT') {
  const t = theme || changeThemes.getTheme('dark');
  return `${t.icon || '🕸️'} ${botName} · ${t.vibe || 'Dark Engine'}`;
}



/**
 * v6.7: Aplica o visual do change a QUALQUER texto de resposta.
 * Se o texto já tem bordas do tema, não duplica.
 * Senão, adiciona o linePrefix do tema a cada linha.
 */
async function themeText(text, groupJid) {
  if (!text || typeof text !== 'string') return text;
  const t = await getTheme(groupJid);
  const pfx = t.linePrefix || (t.frame?.[5] || '│') + (t.bullet || '▸') + ' ';
  const top = t.topBorder || '';
  const bot = t.bottomBorder || '';
  
  // Se já tem bordas/estrutura visual, não duplicar
  // Detecta: começa com caracter de borda OU contém linePrefix OU contém vibe
  const borderChars = ['╭','╔','┌','','┏','╰','╚','└','│','║','┃','╎','┊'];
  const firstChar = text.trim()[0];
  if (borderChars.includes(firstChar)) return text;
  // Se tem 3+ linhas e a maioria começa com caracter decorativo → já formatado
  const tLines = text.split('\n');
  if (tLines.length >= 3) {
    const decorated = tLines.filter(l => borderChars.includes(l.trim()[0]) || l.trim().startsWith('>') || l.trim() === '').length;
    if (decorated >= tLines.length * 0.5) return text;
  }
  if (pfx && text.includes(pfx)) return text;
  if (t.vibe && text.includes(t.vibe)) return text;
  if (top && text.includes(top.slice(0, 8))) return text;
  
  // Envolver cada linha com o linePrefix do tema
  const lines = text.split('\n');
  const themed = lines.map(l => l.trim() ? pfx + l : l).join('\n');
  
  // Adicionar bordas se o tema tiver
  const parts = [];
  if (top) parts.push(top.replace(/{TITLE}/g, '').replace(/{ICON}/g, t.icon || '🕸️').replace(/{BOT}/g, ''));
  parts.push(themed);
  if (bot) parts.push(bot.replace(/{ICON}/g, t.icon || '🕸️').replace(/{BOT}/g, ''));
  if (t.vibe) parts.push('> ' + t.vibe);
  
  return parts.join('\n');
}

module.exports = {
  themeText,
  getTheme,
  renderBlock,
  renderSubmenu,
  renderInfo,
  renderResponse,
  renderMenuCard,
  renderMenuFooter,
};
