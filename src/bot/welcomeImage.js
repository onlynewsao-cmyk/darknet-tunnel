/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║   DARK BOT v5 — welcomeImage.js                             ║
 * ║   Gerador de imagem de boas-vindas com sharp                ║
 * ║   • Foto de perfil circular                                 ║
 * ║   • Número do membro no grupo                               ║
 * ║   • Tema visual do bot (changeThemes)                       ║
 * ╚══════════════════════════════════════════════════════════════╝
 */
'use strict';

const sharp  = require('sharp');
const path   = require('path');
const fs     = require('fs');
const axios  = require('axios');

// Dimensões do banner
const W = 900, H = 320;

// Cores por tema
const THEME_COLORS = {
  dark:      { bg: '#0a0a0f', accent: '#8b00ff', text: '#ffffff', sub: '#888899', border: '#1a1a2e' },
  cyber:     { bg: '#050510', accent: '#00ffcc', text: '#ffffff', sub: '#66ffee', border: '#001a15' },
  royal:     { bg: '#0d0a00', accent: '#ffd700', text: '#ffffff', sub: '#ccaa00', border: '#1a1400' },
  shadow:    { bg: '#080808', accent: '#555555', text: '#cccccc', sub: '#777777', border: '#111111' },
  blade:     { bg: '#0a0505', accent: '#ff3333', text: '#ffffff', sub: '#cc2222', border: '#1a0505' },
  hacker:    { bg: '#000a00', accent: '#00ff41', text: '#00ff41', sub: '#00bb30', border: '#001500' },
  moonlight: { bg: '#05050f', accent: '#7777ff', text: '#ffffff', sub: '#5555cc', border: '#0a0a1f' },
  diamond:   { bg: '#050a10', accent: '#44ddff', text: '#ffffff', sub: '#33aacc', border: '#0a1520' },
  fire:      { bg: '#0f0500', accent: '#ff6600', text: '#ffffff', sub: '#cc4400', border: '#1f0a00' },
  spider:    { bg: '#0a0505', accent: '#cc0000', text: '#ffffff', sub: '#880000', border: '#1a0000' },
  dragon:    { bg: '#0a0005', accent: '#ff0044', text: '#ffffff', sub: '#cc0033', border: '#1a0010' },
  itadori:   { bg: '#05000a', accent: '#9900ff', text: '#ffffff', sub: '#6600cc', border: '#0f0015' },
  sasuke:    { bg: '#0a0000', accent: '#dd0000', text: '#ffffff', sub: '#aa0000', border: '#150000' },
  neon:      { bg: '#07000f', accent: '#cc00ff', text: '#ffffff', sub: '#9900cc', border: '#0f0015' },
  gothic:    { bg: '#050005', accent: '#6600aa', text: '#cccccc', sub: '#440077', border: '#0f000f' },
  alien:     { bg: '#000a05', accent: '#00ff88', text: '#ffffff', sub: '#00cc66', border: '#001509' },
};

function getThemeColors(themeName) {
  return THEME_COLORS[themeName] || THEME_COLORS.dark;
}

/**
 * Baixa imagem de URL e retorna Buffer
 */
async function fetchImage(url, timeoutMs = 8000) {
  try {
    const res = await axios.get(url, { responseType: 'arraybuffer', timeout: timeoutMs });
    return Buffer.from(res.data);
  } catch { return null; }
}

/**
 * Cria círculo máscara para foto de perfil
 */
function circleMask(size) {
  const r = size / 2;
  return Buffer.from(
    `<svg width="${size}" height="${size}">
      <circle cx="${r}" cy="${r}" r="${r}" fill="white"/>
    </svg>`
  );
}

/**
 * Cria anel decorativo em SVG
 */
function ringsvg(size, color, width = 4) {
  const r = size / 2;
  const ir = r - width;
  return Buffer.from(
    `<svg width="${size}" height="${size}">
      <circle cx="${r}" cy="${r}" r="${ir}" fill="none" stroke="${color}" stroke-width="${width}"/>
    </svg>`
  );
}

/**
 * Gera o SVG overlay com textos
 */
function buildTextOverlay(opts) {
  const { name, memberNum, groupName, themeName, themeEmoji, botName, colors } = opts;
  const shortName = (name || 'Membro').slice(0, 22);
  const shortGroup = (groupName || 'Grupo').slice(0, 28);

  return `
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:${colors.bg};stop-opacity:0.98"/>
      <stop offset="45%" style="stop-color:${colors.bg};stop-opacity:0.85"/>
      <stop offset="100%" style="stop-color:${colors.border};stop-opacity:0.7"/>
    </linearGradient>
    <linearGradient id="accentBar" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:${colors.accent};stop-opacity:1"/>
      <stop offset="100%" style="stop-color:${colors.accent};stop-opacity:0"/>
    </linearGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="3" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <!-- Background overlay -->
  <rect width="${W}" height="${H}" fill="url(#bg)"/>

  <!-- Barra de acento esquerda -->
  <rect x="330" y="0" width="3" height="${H}" fill="${colors.accent}" opacity="0.6"/>

  <!-- Linha decorativa topo -->
  <rect x="340" y="30" width="520" height="2" fill="url(#accentBar)" opacity="0.5"/>

  <!-- BEM-VINDO label -->
  <text x="360" y="80"
    font-family="Arial, sans-serif" font-size="13" font-weight="600"
    fill="${colors.accent}" letter-spacing="4" opacity="0.9">
    B E M - V I N D O ( A )
  </text>

  <!-- Nome do membro -->
  <text x="360" y="140"
    font-family="Arial Black, Arial, sans-serif" font-size="52" font-weight="900"
    fill="${colors.text}" filter="url(#glow)">
    ${shortName}
  </text>

  <!-- Linha separadora -->
  <rect x="360" y="155" width="80" height="3" fill="${colors.accent}" rx="2"/>

  <!-- Número do membro -->
  <text x="360" y="195"
    font-family="Arial, sans-serif" font-size="16" font-weight="700"
    fill="${colors.sub}">
    | Membro nº ${memberNum}
  </text>

  <!-- Grupo -->
  <text x="360" y="225"
    font-family="Arial, sans-serif" font-size="13" font-weight="400"
    fill="${colors.sub}" opacity="0.7">
    📍 ${shortGroup}
  </text>

  <!-- Linha decorativa rodapé -->
  <rect x="340" y="${H - 32}" width="520" height="1" fill="${colors.accent}" opacity="0.3"/>

  <!-- Assinatura bot -->
  <text x="360" y="${H - 12}"
    font-family="Arial, sans-serif" font-size="11"
    fill="${colors.sub}" opacity="0.5">
    ${themeEmoji} ${botName}
  </text>

  <!-- Pontos decorativos -->
  <circle cx="830" cy="60" r="3" fill="${colors.accent}" opacity="0.4"/>
  <circle cx="845" cy="60" r="3" fill="${colors.accent}" opacity="0.2"/>
  <circle cx="860" cy="60" r="3" fill="${colors.accent}" opacity="0.1"/>

  <circle cx="830" cy="${H - 60}" r="3" fill="${colors.accent}" opacity="0.4"/>
  <circle cx="845" cy="${H - 60}" r="3" fill="${colors.accent}" opacity="0.2"/>
  <circle cx="860" cy="${H - 60}" r="3" fill="${colors.accent}" opacity="0.1"/>
</svg>`;
}

/**
 * Gera a imagem de boas-vindas
 * @param {object} opts
 * @param {string} opts.profilePicUrl - URL da foto de perfil (pode ser null)
 * @param {string} opts.memberName    - nome do membro
 * @param {number} opts.memberNum     - número ordinal do membro no grupo
 * @param {string} opts.groupName     - nome do grupo
 * @param {string} opts.themeName     - nome do tema activo
 * @param {string} opts.themeEmoji    - emoji do tema
 * @param {string} opts.botName       - nome do bot
 * @returns {Promise<Buffer|null>}
 */
async function generateWelcomeImage(opts = {}) {
  const {
    profilePicUrl = null,
    memberName    = 'Membro',
    memberNum     = 1,
    groupName     = 'Grupo',
    themeName     = 'dark',
    themeEmoji    = '🕸️',
    botName       = 'DARK BOT',
  } = opts;

  try {
    const colors = getThemeColors(themeName);

    // ── Imagem de fundo base (cor sólida) ─────────────────
    const bgBuf = await sharp({
      create: { width: W, height: H, channels: 4,
        background: { r: parseInt(colors.bg.slice(1,3),16)||10,
                      g: parseInt(colors.bg.slice(3,5),16)||10,
                      b: parseInt(colors.bg.slice(5,7),16)||15, alpha: 1 } }
    }).png().toBuffer();

    // ── Partículas decorativas (pontos) ───────────────────
    const dotSvg = Buffer.from(`
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  ${Array.from({length: 40}, (_,i) => {
    const cx = Math.floor((i * 73 + 50) % W);
    const cy = Math.floor((i * 47 + 20) % H);
    const r  = i % 3 === 0 ? 1.5 : 1;
    const op = (0.05 + (i % 4) * 0.04).toFixed(2);
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${colors.accent}" opacity="${op}"/>`;
  }).join('')}
</svg>`);

    // ── Foto de perfil circular ───────────────────────────
    const PP_SIZE = 200;
    const PP_X    = 60;
    const PP_Y    = (H - PP_SIZE) / 2;  // centrada verticalmente

    let ppComposite = [];

    try {
      let ppBuf = null;
      if (profilePicUrl) {
        ppBuf = await fetchImage(profilePicUrl, 6000);
      }

      // Se não tem foto → usa placeholder com inicial
      if (!ppBuf) {
        const initial = (memberName || 'M')[0].toUpperCase();
        ppBuf = await sharp(Buffer.from(`
<svg width="${PP_SIZE}" height="${PP_SIZE}" xmlns="http://www.w3.org/2000/svg">
  <circle cx="${PP_SIZE/2}" cy="${PP_SIZE/2}" r="${PP_SIZE/2}" fill="${colors.border}"/>
  <text x="${PP_SIZE/2}" y="${PP_SIZE/2 + 18}" text-anchor="middle"
    font-family="Arial Black" font-size="80" font-weight="900" fill="${colors.accent}">
    ${initial}
  </text>
</svg>`)).png().toBuffer();
      }

      // Circular crop
      const mask = circleMask(PP_SIZE);
      const ppCircular = await sharp(ppBuf)
        .resize(PP_SIZE, PP_SIZE, { fit: 'cover', position: 'center' })
        .png()
        .composite([{ input: mask, blend: 'dest-in' }])
        .png()
        .toBuffer();

      // Anel decorativo
      const ring = await sharp(ringsvg(PP_SIZE + 8, colors.accent, 3))
        .png().toBuffer();

      ppComposite = [
        { input: ppCircular, top: Math.floor(PP_Y), left: Math.floor(PP_X) },
        { input: ring,       top: Math.floor(PP_Y - 4), left: Math.floor(PP_X - 4) },
      ];
    } catch (e) {
      // Foto falhou — continua sem ela
    }

    // ── Overlay de texto (SVG) ────────────────────────────
    const textSvgBuf = Buffer.from(buildTextOverlay({
      name: memberName, memberNum, groupName,
      themeName, themeEmoji, botName, colors,
    }));

    // ── Composição final ──────────────────────────────────
    const result = await sharp(bgBuf)
      .composite([
        { input: dotSvg,     blend: 'over' },
        ...ppComposite,
        { input: textSvgBuf, blend: 'over' },
      ])
      .jpeg({ quality: 88 })
      .toBuffer();

    return result;

  } catch (e) {
    console.error('[WelcomeImage]', e.message);
    return null;
  }
}

module.exports = { generateWelcomeImage };
