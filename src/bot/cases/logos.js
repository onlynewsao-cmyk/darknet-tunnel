/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║   DARK BOT v7.6 — LOGOS & EFEITOS DE TEXTO (reais)           ║
 * ║                                                               ║
 * ║   naruto, rainbow, neon, graffiti, fire, water, ice, gold,    ║
 * ║   galaxy, retro, metal, +80 estilos… geram uma IMAGEM real    ║
 * ║   com o texto estilizado (SVG → PNG via sharp).               ║
 * ║                                                               ║
 * ║   Sem API externa → funciona no Render Free, offline.         ║
 * ║   Antes: eram stubs vazios ("Uso: <args>").                   ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */
'use strict';

const sharp = require('sharp');
const config = require('../../config');

/* ══════════════════════════ Estilos ══════════════════════════ */

// { bg:[c1,c2], text:[c1,c2,...], glow?:color, stroke?:color, font?:'bold'|'serif'|'mono', off?:bool }
const STYLES = {
  // ── Neon family ──
  neon:         { bg: ['#050014', '#0b0130'], text: ['#00fff0', '#0088ff'], glow: '#00fff0' },
  neon2:        { bg: ['#001a0a', '#00281a'], text: ['#39ff14', '#00e5a0'], glow: '#39ff14' },
  neonglow:     { bg: ['#14002a', '#2a0050'], text: ['#ff66ff', '#aa00ff'], glow: '#ff66ff' },
  neonmetalic:  { bg: ['#0a0a12', '#16161f'], text: ['#c8d6ff', '#6b8cff'], glow: '#8ab4ff' },
  neonparty:    { bg: ['#1a0033', '#330066'], text: ['#ff0066', '#ffcc00', '#00ffcc'], glow: '#ff0066' },

  // ── Rainbow / gradients ──
  rainbow:      { bg: ['#0d0d0d', '#1a1a1a'], text: ['#ff2a2a', '#ff8800', '#ffee00', '#00cc44', '#0088ff', '#aa00ff'] },
  gradient:     { bg: ['#050505', '#141414'], text: ['#ff0088', '#ffcc00', '#00ffcc'] },
  multicolor:   { bg: ['#101010', '#202020'], text: ['#ff4d4d', '#ffb84d', '#4dff4d', '#4db8ff', '#b84dff'] },
  glitter:      { bg: ['#0e0e0e', '#1a1a1a'], text: ['#ffe9a8', '#ffd700', '#ffffff'], glow: '#ffd700' },

  // ── Graffiti ──
  graffiti:     { bg: ['#141414', '#222222'], text: ['#ff2e63', '#ffd31d', '#08d9d6'], stroke: '#000' },
  graffitipaint:{ bg: ['#101010', '#1c1c1c'], text: ['#ff5722', '#ffeb3b', '#00e676'], stroke: '#000' },
  graffitistyle:{ bg: ['#111111', '#1e1e1e'], text: ['#e91e63', '#2196f3', '#ffc107'], stroke: '#000' },
  graffitiwall: { bg: ['#232323', '#3a3a3a'], text: ['#ff6f00', '#00bcd4', '#d500f9'], stroke: '#000' },

  // ── Anime / tema ──
  naruto:       { bg: ['#0a0a0a', '#1a1206'], text: ['#ff8c00', '#ffc400'], glow: '#ff8c00', stroke: '#000' },
  blackpink:    { bg: ['#0c0c0c', '#161616'], text: ['#ff6ec7', '#ffd700', '#000000'], stroke: '#ff6ec7' },
  harrypotter:  { bg: ['#0a0a14', '#1a1230'], text: ['#ffd700', '#9b6b43'], glow: '#ffd700' },
  thor:         { bg: ['#0a0f1a', '#16203a'], text: ['#6ecbff', '#ffffff'], glow: '#6ecbff' },
  deadpool:     { bg: ['#0a0000', '#1a0000'], text: ['#ff0000', '#300000'], stroke: '#000' },
  avengers:     { bg: ['#0a0a14', '#181828'], text: ['#c0c0ff', '#ffd700', '#ffffff'], glow: '#8899ff' },
  captainamerica:{ bg: ['#0a1220', '#182438'], text: ['#ff2a2a', '#ffffff', '#2a5cff'], glow: '#2a5cff' },
  captain:      { bg: ['#081018', '#10202e'], text: ['#3f8cff', '#ff2a2a', '#ffffff'], glow: '#3f8cff' },
  amongus:      { bg: ['#0a0a0a', '#141414'], text: ['#ff0000', '#ffffff', '#00e5ff'], glow: '#ff0000' },
  pubg:         { bg: ['#1a1404', '#2a2008'], text: ['#ffd400', '#ff8c00'], glow: '#ffd400', stroke: '#000' },
  battlefield:  { bg: ['#101418', '#1c2228'], text: ['#ffb300', '#5c7285'], glow: '#ffb300' },
  ffrose:       { bg: ['#140a14', '#261226'], text: ['#ff6ec7', '#8a2be2'], glow: '#ff6ec7' },
  ffgren:       { bg: ['#0a140a', '#122612'], text: ['#39ff14', '#00cc44'], glow: '#39ff14' },

  // ── Elementos ──
  fire:         { bg: ['#0a0000', '#1a0000'], text: ['#ff0000', '#ff6a00', '#ffd400'], glow: '#ff4400' },
  water:        { bg: ['#000a14', '#001626'], text: ['#00d4ff', '#0077ff'], glow: '#00bbff' },
  ice:          { bg: ['#001014', '#00222a'], text: ['#aef4ff', '#3fc1ff'], glow: '#9beaff' },
  blood:        { bg: ['#0a0000', '#140000'], text: ['#ff0022', '#8b0000'], glow: '#ff0022' },
  smoke:        { bg: ['#141414', '#242424'], text: ['#dddddd', '#888888'], glow: '#aaaaaa' },
  snow:         { bg: ['#081018', '#102030'], text: ['#ffffff', '#cfe8ff'], glow: '#e0f0ff' },
  stone3d:      { bg: ['#1a1a1a', '#2a2a2a'], text: ['#e6e6e6', '#999999'], stroke: '#000', off: true },
  '3dcrack':    { bg: ['#101010', '#1a1a1a'], text: ['#ffcc00', '#ff8800'], stroke: '#000', off: true },
  dragonfire:   { bg: ['#0a0200', '#1a0400'], text: ['#ff4400', '#ffcc00', '#ff0000'], glow: '#ff4400' },

  // ── Metais ──
  gold:         { bg: ['#0d0a00', '#1a1400'], text: ['#ffd700', '#ffaa00', '#fff3a0'], glow: '#ffcc00' },
  silver:       { bg: ['#0a0a0a', '#161616'], text: ['#e8e8e8', '#9aa0a6', '#ffffff'], glow: '#cccccc' },
  metal:        { bg: ['#0d0d0d', '#1a1a1a'], text: ['#c0c0c0', '#707070'], stroke: '#000' },
  metallic:     { bg: ['#101010', '#1e1e1e'], text: ['#e0e0e0', '#7f8c8d', '#ffffff'], stroke: '#000' },
  titanium:     { bg: ['#0f0f0f', '#1c1c1c'], text: ['#d8dee3', '#5c6b73'], stroke: '#000' },

  // ── Espaço ──
  galaxy:       { bg: ['#03001c', '#0d0040'], text: ['#b388ff', '#00e5ff', '#ff79b0'], glow: '#7c4dff' },
  'galaxy-light':{ bg: ['#0a0a20', '#1a1a40'], text: ['#ffffff', '#99ccff'], glow: '#66aaff' },
  stars:        { bg: ['#02020a', '#0a0a1a'], text: ['#ffffff', '#ffd700'], glow: '#ffffff' },
  shadowsky:    { bg: ['#0a0a14', '#161630'], text: ['#8899cc', '#445588'], glow: '#5566aa' },
  cloudsky:     { bg: ['#0e1622', '#1e2c40'], text: ['#ffffff', '#9fc4ff'], glow: '#9fc4ff' },

  // ── Retro / vintage ──
  retro:        { bg: ['#1a0a2e', '#2e0a4e'], text: ['#ff6ec7', '#ffd700'], glow: '#ff6ec7' },
  'retro-logo': { bg: ['#12081f', '#241040'], text: ['#ff9ff3', '#feca57'], glow: '#ff9ff3' },
  vintage3d:    { bg: ['#1c1208', '#2e1f0e'], text: ['#e8c07d', '#a67c52'], stroke: '#000', off: true },

  // ── Tech ──
  techstyle:    { bg: ['#000814', '#001d3d'], text: ['#00f0ff', '#0077ff'], glow: '#00e5ff' },
  pixel:        { bg: ['#0a0a0a', '#141414'], text: ['#00ff00', '#00cc00'], stroke: '#003300', font: 'mono' },
  typography:   { bg: ['#0e0e0e', '#1c1c1c'], text: ['#ffffff', '#cfcfcf'], stroke: '#000', font: 'serif' },
  ligatures:    { bg: ['#0c0c0c', '#181818'], text: ['#f5f5f5', '#a0a0a0'], stroke: '#000', font: 'serif' },
  write:        { bg: ['#0d0d0d', '#181818'], text: ['#e8e8e8', '#9a9a9a'], stroke: '#000', font: 'serif' },
  deleting:     { bg: ['#0a0a0a', '#141414'], text: ['#ff2a2a', '#660000'], glow: '#ff2a2a', font: 'mono' },
  darkgreen:    { bg: ['#030a03', '#071407'], text: ['#39ff14', '#00cc44'], glow: '#39ff14' },

  // ── Estações / temas ──
  halloween:    { bg: ['#0a0206', '#1a0510'], text: ['#ff8c00', '#c0392b', '#000000'], glow: '#ff8c00' },
  cemetery:     { bg: ['#05070a', '#0d1218'], text: ['#aab4bf', '#4a5560'], glow: '#8899aa' },
  frozen:       { bg: ['#04101a', '#082236'], text: ['#aef4ff', '#7fc8ff'], glow: '#aef4ff' },
  newyear:      { bg: ['#0a0a12', '#1a1428'], text: ['#ffd700', '#ff6ec7', '#ffffff'], glow: '#ffd700' },
  firework:     { bg: ['#02020a', '#0c0c1e'], text: ['#ffcc00', '#ff2a6a', '#00e5ff'], glow: '#ffcc00' },
  summerbeach:  { bg: ['#001a1a', '#003333'], text: ['#ffd400', '#ff8800', '#00e5ff'], glow: '#ffd400' },
  watercolor:   { bg: ['#0c0c14', '#16162a'], text: ['#a8c8ff', '#ff9ff3'], glow: '#8899ff' },
  royal:        { bg: ['#0a0612', '#1a0e24'], text: ['#ffd700', '#b8860b', '#ffffff'], glow: '#ffd700' },
  america:      { bg: ['#06060c', '#101020'], text: ['#ff2a2a', '#ffffff', '#2a5cff'], glow: '#2a5cff' },
  americanflag: { bg: ['#0a0a14', '#141428'], text: ['#ff2a2a', '#ffffff', '#2a5cff'], glow: '#ffffff' },
  flag:         { bg: ['#0a0a0a', '#181818'], text: ['#ff2a2a', '#ffffff', '#00cc44'], glow: '#ffffff' },

  // ── Bichos / diversão ──
  tiger:        { bg: ['#0d0600', '#1a0c00'], text: ['#ff8800', '#ffd400', '#000000'], glow: '#ff8800' },
  butterfly:    { bg: ['#0c0614', '#180c28'], text: ['#ff6ec7', '#00e5ff', '#b388ff'], glow: '#ff6ec7' },
  flaming:      { bg: ['#0a0000', '#180400'], text: ['#ff4400', '#ffcc00'], glow: '#ff4400' },
  ballon:       { bg: ['#0c0c14', '#181828'], text: ['#ff6ec7', '#00e5ff', '#ffd400'], glow: '#ff6ec7' },

  // ── Misc logos ──
  gradient2:    { bg: ['#050505', '#141414'], text: ['#ff0088', '#ffcc00', '#00ffcc'] },
  doubleexposure:{ bg: ['#0a0a14', '#161630'], text: ['#ffffff', '#8899cc'], glow: '#8899cc' },
  glitter2:     { bg: ['#0e0e0e', '#1a1a1a'], text: ['#ffe9a8', '#ffd700', '#ffffff'], glow: '#ffd700' },
  goldpink:     { bg: ['#12060f', '#240d1e'], text: ['#ffd700', '#ff6ec7', '#ffffff'], glow: '#ffd700' },
  phlogo:       { bg: ['#0a0a0a', '#161616'], text: ['#ffffff', '#cccccc'], stroke: '#000', font: 'serif' },
  lolavatar:    { bg: ['#081018', '#102028'], text: ['#00e5ff', '#ffd400'], glow: '#00e5ff' },
  mascote:      { bg: ['#0c0c0c', '#181818'], text: ['#ff8800', '#ffd400'], glow: '#ff8800' },
  mascoteneon:  { bg: ['#0a0a12', '#16162a'], text: ['#39ff14', '#00e5ff'], glow: '#39ff14' },
  mascotemetal: { bg: ['#0e0e0e', '#1a1a1a'], text: ['#e0e0e0', '#7f8c8d'], stroke: '#000' },
  eraser:       { bg: ['#0f0f0f', '#1a1a1a'], text: ['#ffffff', '#999999'], stroke: '#000' },
  skate:        { bg: ['#0a0a0e', '#16161e'], text: ['#ff2a6a', '#00e5ff'], glow: '#ff2a6a' },
  'skate-name': { bg: ['#0a0a0e', '#16161e'], text: ['#ff2a6a', '#00e5ff'], glow: '#ff2a6a' },

  // candy / cute / comic / cool / elegant / fluffy / fortune / lava / glossy / blue
  candy:        { bg: ['#12060f', '#240d1e'], text: ['#ff9ff3', '#ffd400', '#00e5ff'], glow: '#ff9ff3' },
  comic:        { bg: ['#0a0a0c', '#141418'], text: ['#ff2a2a', '#ffd400', '#2a7fff'], stroke: '#000' },
  cool:         { bg: ['#050a14', '#0c1628'], text: ['#00e5ff', '#7fc8ff'], glow: '#00e5ff' },
  elegant:      { bg: ['#0c0c0c', '#181818'], text: ['#ffd700', '#ffffff'], stroke: '#000', font: 'serif' },
  fluffy:       { bg: ['#0e0e10', '#1a1a1e'], text: ['#ffffff', '#ffd4f0'], glow: '#ffffff' },
  fortune:      { bg: ['#0a0612', '#1a0e24'], text: ['#ffd700', '#ff8800', '#ffffff'], glow: '#ffd700' },
  lava:         { bg: ['#0a0000', '#160300'], text: ['#ff4400', '#ff8800', '#ffcc00'], glow: '#ff4400' },
  glossy:       { bg: ['#0c0c0c', '#1a1a1a'], text: ['#ffffff', '#ffd700', '#00e5ff'], glow: '#ffffff' },
  blue:         { bg: ['#000a14', '#001626'], text: ['#2a7fff', '#00d4ff'], glow: '#2a7fff' },

  // ── v7.7 — logos que faltavam ──
  blackhzx:     { bg: ['#050505', '#0e0e0e'], text: ['#ff2a2a', '#7a0000'], glow: '#ff2a2a' },
  cemiterio:    { bg: ['#05070a', '#0d1218'], text: ['#aab4bf', '#4a5560'], glow: '#8899aa' },
  comics:       { bg: ['#0a0a0c', '#141418'], text: ['#ff2a2a', '#ffd400', '#2a7fff'], stroke: '#000' },
  ffavatar:     { bg: ['#0a1018', '#14202e'], text: ['#ff8c00', '#ffffff'], glow: '#ff8c00' },
  game:         { bg: ['#050a14', '#0c1628'], text: ['#00e5ff', '#ff2a6a'], glow: '#00e5ff' },
  perfilff:     { bg: ['#0a1018', '#14202e'], text: ['#ff8c00', '#ffffff'], glow: '#ff8c00' },
  playboy:      { bg: ['#0a0a0a', '#181818'], text: ['#ffffff', '#b8b8b8'], glow: '#ffffff' },
  pornhub:      { bg: ['#0a0500', '#180d00'], text: ['#ff8c00', '#ffd400', '#000000'], glow: '#ff8c00' },
  pubgavatar:   { bg: ['#1a1404', '#2a2008'], text: ['#ffd400', '#ff8c00'], glow: '#ffd400', stroke: '#000' },
  pubgvideo:    { bg: ['#1a1404', '#2a2008'], text: ['#ffd400', '#ff8c00'], glow: '#ffd400', stroke: '#000' },
  tecnologica:  { bg: ['#000814', '#001d3d'], text: ['#00f0ff', '#0077ff'], glow: '#00e5ff' },
  gradiente:    { bg: ['#050505', '#141414'], text: ['#ff0088', '#ffcc00', '#00ffcc'] },
};

// Aliases — comando → estilo base
const ALIASES = {
  'neon-logo': 'neon', 'fire-logo': 'fire', 'water-logo': 'water', 'ice-logo': 'ice',
  'gold-logo': 'gold', 'silver-logo': 'silver', 'blue-logo': 'blue',
  'candy-logo': 'candy', 'comic-logo': 'comic', 'cool-logo': 'cool',
  'elegant-logo': 'elegant', 'fluffy-logo': 'fluffy', 'fortune-logo': 'fortune',
  'lava-logo': 'lava', 'glossy-logo': 'glossy',
};

function styleFor(cmd) {
  const key = String(cmd).toLowerCase();
  if (STYLES[key]) return STYLES[key];
  if (ALIASES[key]) return STYLES[ALIASES[key]];
  return null;
}

/* ══════════════════════════ Renderização ══════════════════════════ */

const FONT_MAP = {
  bold: "DejaVu Sans, sans-serif",
  serif: "DejaVu Serif, serif",
  mono: "DejaVu Sans Mono, monospace",
};

function sanitizeText(t = '') {
  // mantém letras (com acentos), números e pontuação comum; remove emojis/tofu
  return String(t)
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{2B00}-\u{2BFF}\u{1F1E6}-\u{1F1FF}]/gu, '')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeXml(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function wrap(text, maxChars = 14) {
  const out = [];
  for (const raw of String(text).split('\n')) {
    const words = raw.split(' ');
    let line = '';
    for (const w of words) {
      const candidate = line ? line + ' ' + w : w;
      if (candidate.length > maxChars && line) {
        out.push(line);
        line = w;
      } else {
        line = candidate;
      }
    }
    if (line) out.push(line);
  }
  return out.length ? out : [' '];
}

function gradientStops(colors) {
  const n = colors.length;
  return colors.map((c, i) => {
    const offset = n === 1 ? 0 : Math.round((i / (n - 1)) * 100);
    return `<stop offset="${offset}%" stop-color="${c}"/>`;
  }).join('');
}

function buildSvg(lines, width, height, style, font) {
  const bgStops = gradientStops(style.bg);
  const txStops = gradientStops(style.text);
  const fontSize = 100;
  const lineH = 138;
  const startY = fontSize + 50;
  // contorno mais forte = aspeto de "logo" (ex: Naruto, Harry Potter, PUBG)
  const strokeWidth = style.stroke ? 6 : 0;

  const defs = [
    `<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">${bgStops}</linearGradient>`,
    `<linearGradient id="tx" x1="0" y1="0" x2="1" y2="0">${txStops}</linearGradient>`,
  ];
  if (style.glow) {
    defs.push(`<filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="9" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>`);
  }

  const strokeAttr = style.stroke ? ` stroke="${style.stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round" paint-order="stroke"` : '';
  const filterAttr = style.glow ? ' filter="url(#glow)"' : '';
  // letter-spacing dá o aspeto de letreiro (logo) em vez de texto corrido
  const spacingAttr = ' style="letter-spacing:3px"';

  let texts = '';
  lines.forEach((ln, i) => {
    const y = startY + i * lineH;
    const esc = escapeXml(ln);
    if (style.off) {
      // efeito 3D: sombra deslocada por trás
      texts += `<text x="${width / 2 + 7}" y="${y + 9}" text-anchor="middle" font-family="${font}" font-weight="bold" font-size="${fontSize}" fill="#000000" opacity="0.55">${esc}</text>`;
    }
    texts += `<text x="${width / 2}" y="${y}" text-anchor="middle" font-family="${font}" font-weight="bold" font-size="${fontSize}" fill="url(#tx)"${strokeAttr}${filterAttr}${spacingAttr}>${esc}</text>`;
  });

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>${defs.join('')}</defs>
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <rect width="${width}" height="${height}" fill="none" stroke="#ffffff" stroke-opacity="0.05" stroke-width="2"/>
  ${texts}
</svg>`;
}

/**
 * Gera um logo/efeito de texto em PNG.
 * @returns {Promise<Buffer>} PNG
 */
async function render(text, cmd) {
  const style = styleFor(cmd);
  if (!style) throw new Error(`Estilo desconhecido: ${cmd}`);
  // MAIÚSCULAS: letreiro de logo (como os títulos dos animes/jogos)
  const clean = sanitizeText(text).toUpperCase();
  const lines = wrap(clean || 'DARK BOT', 12);

  const maxLen = Math.max(...lines.map(l => l.length));
  const width = Math.max(720, Math.min(1400, Math.round(maxLen * 62 + 180)));
  const height = Math.round(140 + lines.length * 138);

  const font = FONT_MAP[style.font || 'bold'];
  const svg = buildSvg(lines, width, height, style, font);
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}

/* ══════════════════════════ Case ══════════════════════════ */

module.exports = function registerLogos(registerCase) {
  const cmds = [...Object.keys(STYLES), ...Object.keys(ALIASES)];

  for (const cmd of cmds) {
    registerCase([cmd], async ({ sock, msg, ctx, args, prefix, reply, react }) => {
      const text = args.join(' ').trim();
      if (!text) {
        return reply(`🖋️ Uso: \`${prefix}${cmd} teu texto\`\nEx: \`${prefix}${cmd} DARK BOT\``);
      }
      try { react('🎨'); } catch {}
      try {
        const buf = await render(text, cmd);
        await sock.sendMessage(ctx.remoteJid, {
          image: buf,
          caption: `🖋️ *${cmd.toUpperCase()}* — ${sanitizeText(text).slice(0, 80)}\n> ${config.bot.name}`,
        }, { quoted: msg });
        try { react('✅'); } catch {}
      } catch (e) {
        try { react('❌'); } catch {}
        return reply('❌ ' + (e.message || e));
      }
    }, true);
  }
};

module.exports.STYLES = STYLES;
module.exports.ALIASES = ALIASES;
module.exports.styleFor = styleFor;
module.exports.render = render;
module.exports.sanitizeText = sanitizeText;
module.exports.wrap = wrap;
module.exports.escapeXml = escapeXml;
