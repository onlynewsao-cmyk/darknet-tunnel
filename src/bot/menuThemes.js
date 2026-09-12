/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║   DARK BOT — Menu Themes v5 ULTRA REESTRUTURADO         ║
 * ║   Menu completo, organizado, rico em símbolos           ║
 * ╚══════════════════════════════════════════════════════════╝
 *
 * Estilos (use !menustyle set <n>):
 *  0 classic  ╭╮╰╯─│   6 moonlight  ▛▜▙▟
 *  1 cyber    ┏┓┗┛━┃   7 diamond    ◢◣◥◤
 *  2 royal    ╔╗╚╝═║   8 fire       ✦✧━┃
 *  3 shadow   ┌┐└┘─│   9 spider     ⎔═║
 *  4 neon     ╒╕╘╛═│
 *  5 void     ╓╖╙╜─║
 */

'use strict';

const commandCatalog  = require('./commandCatalog');
const botConfigCache  = require('./botConfigCache');
const changeThemes    = require('./changeThemes');

// ── Molduras [TL,TR,BL,BR,H,V] ─────────────────────────────
const FRAMES = [
  ['╭','╮','╰','╯','─','│'],   // 0 classic
  ['┏','┓','┗','┛','━','┃'],   // 1 cyber
  ['╔','╗','╚','╝','═','║'],   // 2 royal
  ['┌','┐','└','┘','─','│'],   // 3 shadow
  ['╒','╕','╘','╛','═','│'],   // 4 neon
  ['╓','╖','╙','╜','─','║'],   // 5 void
  ['▛','▜','▙','▟','▀','▌'],   // 6 moonlight
  ['◢','◣','◥','◤','━','┃'],   // 7 diamond
  ['✦','✦','✧','✧','━','┃'],   // 8 fire
  ['⎔','⎔','⎔','⎔','═','║'],   // 9 spider
];

// ── Palettes ────────────────────────────────────────────────
const PALETTES = [
  { icon:'🕸️',  bullet:'▹', sep:'⌁',  accent:'⚡', vibe:'ᴅᴀʀᴋ sɪᴅᴇ ᴇɴɢɪɴᴇ 🌑' },
  { icon:'🧬',  bullet:'⌬', sep:'⟐',  accent:'◈', vibe:'░▒▓ NEURAL WEB ▓▒░' },
  { icon:'👑',  bullet:'◈', sep:'✦',  accent:'♾️', vibe:'+9999999 ᴀᴜʀᴀ ♾️' },
  { icon:'🌑',  bullet:'•',  sep:'·',   accent:'○', vibe:'minimal dark protocol' },
  { icon:'🗡️', bullet:'⫸', sep:'╱',  accent:'⚔️', vibe:'blade runner menu' },
  { icon:'💻',  bullet:'>',  sep:'::',  accent:'$', vibe:'root@darkbot:~#' },
  { icon:'🌙',  bullet:'☾',  sep:'⋆',  accent:'★', vibe:'moon system online 🌙' },
  { icon:'💎',  bullet:'◆',  sep:'✧',  accent:'◇', vibe:'premium access layer 💎' },
  { icon:'🔥',  bullet:'▸',  sep:'—',  accent:'🌶️',vibe:'ego mode activated 🔥' },
  { icon:'🕸️', bullet:'⛓',  sep:'⌁',  accent:'🕷️',vibe:'web automation core 🕸️' },
];

// ── Categorias — label, ícone, descrição ────────────────────
const CATEGORY_META = {
  info:       { label:'INFO & CORE',       icon:'ℹ️',  desc:'Menus, perfil e utilitários' },
  ia:         { label:'IA & WEB',          icon:'🧠',  desc:'IA com memória, pesquisa, imagens' },
  downloads:  { label:'DOWNLOADS',         icon:'📥',  desc:'Música, vídeos e redes sociais' },
  stickers:   { label:'STICKERS',          icon:'🎨',  desc:'Figurinhas, watermark e arte' },
  grupos:     { label:'ADM & GRUPOS',      icon:'👥',  desc:'Moderação, regras e controlo' },
  diversao:   { label:'DIVERSÃO',          icon:'😂',  desc:'Medidores, brincadeiras e zoeira' },
  interacoes: { label:'INTERAÇÕES',        icon:'💕',  desc:'Acções sociais com GIF e aura' },
  familia:    { label:'FAMÍLIA',           icon:'👨‍👩‍👧', desc:'Casamento, adoção e laços' },
  economia:   { label:'ECONOMIA / AURA',   icon:'💰',  desc:'Coins, banco, loja e ranking' },
  jogos:      { label:'JOGOS',             icon:'🎮',  desc:'Quiz, forca, blackjack e bingo' },
  utils:      { label:'UTILITÁRIOS',       icon:'🛠️', desc:'Ferramentas, clima, câmbio, QR' },
  premium:    { label:'PREMIUM / VIP',     icon:'⭐',  desc:'Planos e benefícios exclusivos' },
  vpn:        { label:'VPN DECRYPTER',     icon:'🔓',  desc:'Ferramentas premium de decrypt' },
  dono:       { label:'DONO / ROOT',       icon:'👑',  desc:'Painel do Criador Supremo' },
  trapacas:   { label:'OCULTOS / CHEATS',  icon:'🎭',  desc:'Owner-only — avançado' },
};

// ── Comandos ocultos do menu público ────────────────────────
const ALWAYS_HIDDEN = new Set([
  'cmdsocultos','portal18','maiscmds','menudono',
  'adultsearch','adultvideo','adultmode','adultapi',
  'hentai','ximg','xvideo','hotchat','buscalivro','livros18',
  // Botões/sticker de config só pelo dashboard ou dono
  'stickerwm','buttonmode','themeglobal','menustyle',
]);

// ── Ordem do menu principal ─────────────────────────────────
const MAIN_ORDER = [
  'info','ia','downloads','stickers','grupos',
  'interacoes','diversao','familia','economia',
  'jogos','utils','premium','vpn',
];

const SUBMENU_ALIASES = {
  menudownload:'downloads', menustickers:'stickers', menujogos:'jogos',
  menueconomia:'economia',  menufamilia:'familia',   menudiversao:'diversao',
  menuia:'ia',              menugrupo:'grupos',       menustatus:'utils',
  menudono:'dono',          maiscmds:'dono',
};

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
function styleIndex(s = 'classic') {
  if (!s || s === 'classic') return 0;
  const n = parseInt(String(s).replace(/\D/g, ''), 10);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function getStyle(style = 'classic') {
  const n = styleIndex(style);
  // Tenta ler o tema activo do changeThemes via cache em memória
  try {
    const cacheEntry = botConfigCache.dump ? botConfigCache.dump() : {};
    const activeThemeName = cacheEntry['active_theme'] || null;
    if (activeThemeName && activeThemeName !== 'dark') {
      const ct = changeThemes.getTheme(activeThemeName);
      if (ct && ct.frame && ct.frame.length >= 6) {
        const palette = PALETTES[ct.style % PALETTES.length] || PALETTES[0];
        const mergedPalette = {
          ...palette,
          bullet:  ct.bullet  || palette.bullet,
          sep:     ct.sep     || palette.sep,
          accent:  ct.accent  || palette.accent,
          icon:    ct.icon    || palette.icon,
          vibe:    ct.vibe    || palette.vibe,
        };
        return { n: ct.style, frame: ct.frame, palette: mergedPalette };
      }
    }
  } catch (_) {}
  return { n, frame: FRAMES[n % FRAMES.length], palette: PALETTES[n % PALETTES.length] };
}

function topBar(f, label, width = 30) {
  const pad = Math.max(0, Math.floor((width - label.length) / 2));
  return `${f[0]}${f[4].repeat(pad)}〔 ${label} 〕${f[4].repeat(Math.max(2, width - pad - label.length))}${f[1]}`;
}

function botBar(f, width = 30) {
  return `${f[2]}${f[4].repeat(width + 6)}${f[3]}`;
}

function line(f, text) {
  return `${f[5]} ${text}`;
}

// ─────────────────────────────────────────────
// COMANDOS VISÍVEIS
// ─────────────────────────────────────────────
function visibleCommands({ isOwner = false, includeOwner = false } = {}) {
  return commandCatalog.getAll().filter(c => {
    if (ALWAYS_HIDDEN.has(c.name)) return false;
    if ((c.category === 'dono' || c.category === 'trapacas') && !isOwner && !includeOwner) return false;
    if (c.ownerOnly && !isOwner && !includeOwner) return false;
    return true;
  });
}

function groupByCategory(cmds) {
  const out = {};
  for (const c of cmds) (out[c.category] = out[c.category] || []).push(c);
  return out;
}

// ─────────────────────────────────────────────
// MENU PRINCIPAL — reestruturado
// ─────────────────────────────────────────────
function renderMainMenu({ ctx = {}, config = {}, stats = {}, style = 'classic', showPrefix = false } = {}) {
  const st = getStyle(style);
  const { frame: f, palette: p } = st;
  const prefix  = config.bot?.prefix  || '!';
  const botName = config.bot?.name    || 'DARK BOT';
  const owner   = config.owner?.name  || 'Dark Net';
  const name    = ctx.pushName        || 'Utilizador';
  const num     = ctx.senderNumber    || '—';
  const chat    = ctx.isGroup ? (ctx.groupName || 'Grupo') : 'Privado';
  const uptime  = stats.uptime        || '—';
  const W = 30;

  const cmds    = visibleCommands({ isOwner: !!ctx.isOwner });
  const grouped = groupByCategory(cmds);
  const order   = [...MAIN_ORDER];
  if (ctx.isOwner) order.push('dono', 'trapacas');

  const sections = [];

  // ── Cabeçalho ───────────────────────────────
  sections.push([
    topBar(f, `${p.icon} ${botName}`, W),
    line(f, p.vibe),
    line(f, `${p.sep.repeat(W + 4)}`),
    line(f, `👤 *${name}*  •  📱 ${num}`),
    line(f, `💬 ${chat}  •  🔑 Prefixo: *${prefix}*`),
    line(f, `👑 Dono: ${owner}  •  ⏱️ ${uptime}`),
    line(f, `${p.sep.repeat(W + 4)}`),
    botBar(f, W),
  ].join('\n'));

  // ── Secções por categoria ────────────────────
  for (const cat of order) {
    const list = grouped[cat];
    if (!list?.length) continue;
    const meta  = CATEGORY_META[cat] || { label: cat.toUpperCase(), icon: p.icon, desc: '' };

    const rows = [];
    rows.push(topBar(f, `${meta.icon} ${meta.label}`, W));
    if (meta.desc) rows.push(line(f, `_${meta.desc}_`));

    // 3 comandos por linha
    for (let i = 0; i < list.length; i += 3) {
      const chunk = list.slice(i, i + 3);
      const txt = chunk.map(c => `${c.emoji || p.accent}${showPrefix ? prefix : ''}${c.name}`).join(`  ${p.sep}  `);
      rows.push(line(f, txt));
    }
    rows.push(botBar(f, W));
    sections.push(rows.join('\n'));
  }

  // ── Rodapé ───────────────────────────────────
  sections.push(
    `${p.bullet} *${prefix}menubtn*  — menu interactivo com botões\n` +
    `${p.bullet} *${prefix}ia* <pergunta>  — IA com memória\n` +
    `> ${p.icon} ${botName} × DARK BOT  |  ${p.vibe}`
  );

  return sections.join('\n\n');
}

// ─────────────────────────────────────────────
// SUBMENU POR CATEGORIA
// ─────────────────────────────────────────────
function renderSubmenu({ submenu = '', ctx = {}, config = {}, style = 'classic', showPrefix = false, customItems = null } = {}) {
  const st = getStyle(style);
  const { frame: f, palette: p } = st;
  const prefix  = config.bot?.prefix || '!';
  const botName = config.bot?.name   || 'DARK BOT';
  const W = 28;

  const cat  = SUBMENU_ALIASES[submenu] || submenu;
  const meta = CATEGORY_META[cat] || { label: cat.toUpperCase(), icon: p.icon, desc: '' };

  let cmds;
  if (customItems) {
    cmds = customItems.map(x => ({ name: x.cmd, emoji: x.emoji || p.bullet, description: x.desc || '' }));
  } else {
    cmds = visibleCommands({ isOwner: !!ctx.isOwner, includeOwner: cat === 'dono' || cat === 'trapacas' })
      .filter(c => c.category === cat);
  }

  const rows = [topBar(f, `${meta.icon} ${meta.label}`, W)];
  if (meta.desc) rows.push(line(f, `_${meta.desc}_`));

  if (!cmds.length) {
    rows.push(line(f, 'Sem comandos disponíveis.'));
  } else {
    for (const c of cmds.slice(0, 40)) {
      const nm  = `${showPrefix ? prefix : ''}${c.name}`;
      const dsc = c.description ? c.description.slice(0, 42) : '';
      rows.push(line(f, `${c.emoji || p.bullet} *${nm}*${dsc ? `  —  ${dsc}` : ''}`));
    }
  }

  rows.push(botBar(f, W));
  rows.push(`> ${p.icon} ${botName}  ×  ${p.vibe}`);
  return rows.join('\n');
}

// ─────────────────────────────────────────────
// BOTÕES DOS SUBMENUS
// ─────────────────────────────────────────────
function submenuButtons(prefix = '!') {
  return [
    { id: `${prefix}menudownload`,  text: '📥 Downloads' },
    { id: `${prefix}menuia`,        text: '🧠 IA' },
    { id: `${prefix}menustickers`,  text: '🎨 Stickers' },
    { id: `${prefix}menujogos`,     text: '🎮 Jogos' },
    { id: `${prefix}menueconomia`,  text: '💰 Economia' },
    { id: `${prefix}menufamilia`,   text: '👨‍👩‍👧 Família' },
    { id: `${prefix}menudiversao`,  text: '😂 Diversão' },
    { id: `${prefix}menugrupo`,     text: '👥 ADM' },
    { id: `${prefix}menustatus`,    text: '🛠️ Utils' },
  ];
}

module.exports = { getStyle, renderMainMenu, renderSubmenu, submenuButtons, visibleCommands, CATEGORY_META, ALWAYS_HIDDEN, FRAMES, PALETTES };
