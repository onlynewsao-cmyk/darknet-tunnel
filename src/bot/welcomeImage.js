'use strict';
/**
 * DARK BOT v11.2.4 — welcomeImage (clássico)
 * Cartão 1080×540, foto de perfil nítida, NOME (não número), visual limpo.
 */
const sharp = require('sharp');
const axios = require('axios');

const W = 1080;
const H = 540;

const THEME_COLORS = {
  dark:   { bg: '#0b0b12', border: '#1e1b2e', accent: '#a78bfa', text: '#ffffff', muted: '#c4b5fd' },
  cyber:  { bg: '#061018', border: '#0c2a3a', accent: '#22d3ee', text: '#ffffff', muted: '#a5f3fc' },
  toxic:  { bg: '#0a1208', border: '#1a2e14', accent: '#a3e635', text: '#ffffff', muted: '#d9f99d' },
  blood:  { bg: '#12080a', border: '#2e1418', accent: '#f43f5e', text: '#ffffff', muted: '#fda4af' },
  moon:   { bg: '#0c0e18', border: '#1a1f33', accent: '#818cf8', text: '#ffffff', muted: '#c7d2fe' },
};

function getThemeColors(themeName) {
  return THEME_COLORS[themeName] || THEME_COLORS.dark;
}

async function fetchImage(url, timeoutMs = 8000) {
  try {
    const res = await axios.get(url, { responseType: 'arraybuffer', timeout: timeoutMs });
    return Buffer.from(res.data);
  } catch { return null; }
}

function circleMask(size) {
  const r = size / 2;
  return Buffer.from(
    `<svg width="${size}" height="${size}"><circle cx="${r}" cy="${r}" r="${r}" fill="white"/></svg>`,
  );
}

function esc(t) {
  return String(t || '').replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
}

function prettyName(name) {
  let n = String(name || 'Membro').trim() || 'Membro';
  if (n === n.toLowerCase()) n = n.replace(/\b\w/g, c => c.toUpperCase());
  return n.slice(0, 28);
}

function buildTextOverlay(opts) {
  const { name, memberNum, groupName, botName, colors } = opts;
  const shortName = prettyName(name);
  const shortGroup = String(groupName || 'Grupo').slice(0, 36);
  const textX = 430;

  return `
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="shade" x1="0.2" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${colors.bg}" stop-opacity="0"/>
      <stop offset="0.3" stop-color="${colors.bg}" stop-opacity="0.75"/>
      <stop offset="1" stop-color="${colors.bg}" stop-opacity="0.35"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#shade)"/>
  <text x="${textX}" y="170" font-family="Arial, Helvetica, sans-serif" font-size="22"
    fill="${colors.accent}" font-weight="600" letter-spacing="4">BEM-VINDO(A)</text>
  <text x="${textX}" y="250" font-family="Arial Black, Arial, sans-serif" font-size="52"
    font-weight="900" fill="${colors.text}">${esc(shortName)}</text>
  <rect x="${textX}" y="270" width="120" height="4" rx="2" fill="${colors.accent}" opacity="0.9"/>
  <text x="${textX}" y="330" font-family="Arial, sans-serif" font-size="26" fill="#e2e8f0" font-weight="600">
    ${esc(shortGroup)}
  </text>
  <text x="${textX}" y="380" font-family="Arial, sans-serif" font-size="22" fill="${colors.muted}">
    Membro nº ${Number(memberNum) || 1}
  </text>
  <text x="${textX}" y="${H - 48}" font-family="Arial, sans-serif" font-size="18" fill="#94a3b8">
    ${esc(botName || 'DARK BOT')}
  </text>
</svg>`;
}

/**
 * @param {object} opts
 * @param {string|null} opts.profilePicUrl
 * @param {string} opts.memberName  — NOME (não número)
 * @param {number} opts.memberNum
 * @param {string} opts.groupName
 * @param {string} opts.themeName
 * @param {string} opts.botName
 */
async function generateWelcomeImage(opts = {}) {
  const {
    profilePicUrl = null,
    memberName = 'Membro',
    memberNum = 1,
    groupName = 'Grupo',
    themeName = 'dark',
    botName = 'DARK BOT',
  } = opts;

  try {
    const colors = getThemeColors(themeName);

    const bgBuf = await sharp({
      create: {
        width: W, height: H, channels: 4,
        background: {
          r: parseInt(colors.bg.slice(1, 3), 16) || 10,
          g: parseInt(colors.bg.slice(3, 5), 16) || 10,
          b: parseInt(colors.bg.slice(5, 7), 16) || 15,
          alpha: 1,
        },
      },
    }).png().toBuffer();

    // glow suave
    const glowSvg = Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="g" cx="0.2" cy="0.5" r="0.65">
          <stop offset="0" stop-color="${colors.accent}" stop-opacity="0.35"/>
          <stop offset="1" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="${W}" height="${H}" fill="url(#g)"/>
    </svg>`);

    const PP_SIZE = 300;
    const PP_X = 80;
    const PP_Y = Math.round((H - PP_SIZE) / 2);
    let ppComposite = [];

    try {
      let ppBuf = null;
      if (profilePicUrl) ppBuf = await fetchImage(profilePicUrl, 8000);

      if (!ppBuf) {
        const initial = prettyName(memberName).charAt(0).toUpperCase() || 'M';
        ppBuf = await sharp(Buffer.from(`
<svg width="${PP_SIZE}" height="${PP_SIZE}" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#1e1b2e"/><stop offset="1" stop-color="#3b0764"/>
  </linearGradient></defs>
  <rect width="${PP_SIZE}" height="${PP_SIZE}" fill="url(#g)"/>
  <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle"
    font-family="Arial Black" font-size="140" font-weight="900" fill="${colors.accent}">${esc(initial)}</text>
</svg>`)).png().toBuffer();
      }

      const mask = circleMask(PP_SIZE);
      const ppCircular = await sharp(ppBuf)
        .resize(PP_SIZE, PP_SIZE, { fit: 'cover', position: 'centre', kernel: sharp.kernel.lanczos3 })
        .sharpen({ sigma: 0.9, m1: 0.6, m2: 0.3 })
        .modulate({ brightness: 1.04, saturation: 1.05 })
        .png()
        .composite([{ input: mask, blend: 'dest-in' }])
        .png()
        .toBuffer();

      const ringSize = PP_SIZE + 20;
      const ring = await sharp(Buffer.from(`
<svg width="${ringSize}" height="${ringSize}" xmlns="http://www.w3.org/2000/svg">
  <circle cx="${ringSize / 2}" cy="${ringSize / 2}" r="${PP_SIZE / 2 + 6}" fill="none"
    stroke="${colors.accent}" stroke-width="5" opacity="0.95"/>
  <circle cx="${ringSize / 2}" cy="${ringSize / 2}" r="${PP_SIZE / 2 + 12}" fill="none"
    stroke="#ffffff" stroke-width="1.5" opacity="0.3"/>
</svg>`)).png().toBuffer();

      ppComposite = [
        { input: ppCircular, top: Math.floor(PP_Y), left: Math.floor(PP_X) },
        { input: ring, top: Math.floor(PP_Y - 10), left: Math.floor(PP_X - 10) },
      ];
    } catch (_) { /* sem foto */ }

    const textSvgBuf = Buffer.from(buildTextOverlay({
      name: memberName, memberNum, groupName, botName, colors,
    }));

    return await sharp(bgBuf)
      .composite([
        { input: glowSvg, blend: 'over' },
        ...ppComposite,
        { input: textSvgBuf, blend: 'over' },
      ])
      .jpeg({ quality: 92 })
      .toBuffer();
  } catch (e) {
    console.error('[WelcomeImage]', e.message);
    return null;
  }
}

module.exports = { generateWelcomeImage, W, H };
