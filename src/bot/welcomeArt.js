'use strict';
/**
 * DARK BOT v11.2.4 — Arte de entrada (welcome2/welcm3) + cartão de herói
 *
 *  welcome2  → cartão limpo 1080×540, foto de perfil NÍTIDA (320px),
 *              NOME (não número), tipografia básica e elegante.
 *  welcm3    → GIF/mp4 gifPlayback com pan suave + anel + faíscas.
 *  RG card   → mesmo motor para o herói do RPG.
 *
 * Fundo: pollinations.ai com fallback gradiente local (sempre bonito).
 */
const sharp = require('sharp');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const execFileAsync = require('util').promisify(execFile);

// Cartão maior e mais legível no WhatsApp
const W = 1080;
const H = 540;
const PP_SIZE = 320;          // foto de perfil nítida
const PP_LEFT = 72;
const PP_TOP = Math.round((H - PP_SIZE) / 2);
const POLLI = 'https://image.pollinations.ai/prompt';

const PROMPTS = {
  welcome: 'elegant dark purple gradient abstract background, soft violet light, subtle silk texture, cinematic bokeh, minimal, no text, no letters, no watermark, no people',
  hero: 'elegant dark fantasy hall soft violet glow, obsidian marble, cinematic light, minimal, no text, no letters, no watermark',
};

function _defaults(opts, seedOffset = 0) {
  return {
    name: String(opts.name || 'Novo membro').trim() || 'Novo membro',
    sub1: opts.sub1 || '',
    sub2: opts.sub2 || '',
    footer: opts.footer || 'DARK BOT',
    accent: opts.accent || '#a78bfa',
    sub: opts.sub || '#c4b5fd',
    seed: (opts.seed || Date.now() % 100000) + seedOffset,
    kind: opts.kind || 'welcome',
  };
}

function esc(t) {
  return String(t || '').replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
}

async function _fetch(url, opts = {}) {
  if (opts.fetchFn) return opts.fetchFn(url);
  try {
    const axios = require('axios');
    const r = await axios.get(url, { responseType: 'arraybuffer', timeout: 45000, maxRedirects: 4 });
    const ct = String(r.headers?.['content-type'] || '').toLowerCase();
    const b = Buffer.from(r.data || []);
    if (!ct.startsWith('image/') || b.length < 512) return null;
    return b;
  } catch { return null; }
}

/** Fundo IA ou gradiente elegante local. */
async function fundo(o, opts) {
  const url = `${POLLI}/${encodeURIComponent(PROMPTS[o.kind] || PROMPTS.welcome)}?width=${W}&height=${H}&seed=${o.seed}&nologo=true`;
  const b = await _fetch(url, opts).catch(() => null);
  if (b && b.length > 3000) {
    try {
      return await sharp(b).resize(W, H, { fit: 'cover', kernel: sharp.kernel.lanczos3 }).jpeg({ quality: 92 }).toBuffer();
    } catch {}
  }
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#0b0b12"/>
        <stop offset="0.45" stop-color="#161022"/>
        <stop offset="1" stop-color="#2a1848"/>
      </linearGradient>
      <radialGradient id="v" cx="0.18" cy="0.5" r="0.7">
        <stop offset="0" stop-color="${o.accent}" stop-opacity="0.45"/>
        <stop offset="1" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="v2" cx="0.92" cy="0.2" r="0.5">
        <stop offset="0" stop-color="#6366f1" stop-opacity="0.25"/>
        <stop offset="1" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#g)"/>
    <rect width="${W}" height="${H}" fill="url(#v)"/>
    <rect width="${W}" height="${H}" fill="url(#v2)"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

function _circleMask(size) {
  return Buffer.from(
    `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`,
  );
}

/**
 * Foto de perfil circular NÍTIDA:
 *  - upscale/lanczos3
 *  - sharpen leve
 *  - anel duplo limpo (sem sombra pesada por cima da cara)
 */
async function _ppCircle(ppBuf, sizePx, opts = {}) {
  const accent = opts.accent || '#a78bfa';
  let face;
  if (ppBuf && ppBuf.length > 200) {
    face = await sharp(ppBuf)
      .resize(sizePx, sizePx, { fit: 'cover', position: 'centre', kernel: sharp.kernel.lanczos3 })
      .sharpen({ sigma: 0.9, m1: 0.6, m2: 0.3 })
      .modulate({ brightness: 1.04, saturation: 1.05 })
      .png()
      .toBuffer();
  } else {
    // placeholder com inicial
    const initial = esc(String(opts.initial || opts.name || '·').trim().charAt(0).toUpperCase() || '·');
    face = await sharp(Buffer.from(`<svg width="${sizePx}" height="${sizePx}" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#1e1b2e"/><stop offset="1" stop-color="#3b0764"/>
      </linearGradient></defs>
      <rect width="${sizePx}" height="${sizePx}" fill="url(#g)"/>
      <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle"
        font-family="Arial Black, Arial, sans-serif" font-size="${Math.round(sizePx * 0.42)}"
        font-weight="900" fill="#e9d5ff">${initial}</text>
    </svg>`)).png().toBuffer();
  }

  const mask = _circleMask(sizePx);
  const circular = await sharp(face)
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();

  // canvas com anel (foto + borda exterior)
  const ringPad = 14;
  const canvas = sizePx + ringPad * 2;
  const ringSvg = Buffer.from(`<svg width="${canvas}" height="${canvas}" xmlns="http://www.w3.org/2000/svg">
    <circle cx="${canvas / 2}" cy="${canvas / 2}" r="${sizePx / 2 + 8}" fill="none" stroke="${accent}" stroke-width="5" opacity="0.95"/>
    <circle cx="${canvas / 2}" cy="${canvas / 2}" r="${sizePx / 2 + 14}" fill="none" stroke="#ffffff" stroke-width="1.5" opacity="0.35"/>
  </svg>`);

  return sharp({
    create: { width: canvas, height: canvas, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      { input: circular, left: ringPad, top: ringPad },
      { input: ringSvg, left: 0, top: 0 },
    ])
    .png()
    .toBuffer();
}

/** Overlay de texto limpo (sem molduras de tema). */
function overlaySvg(o, frame = null) {
  const ringR = frame?.ringR ?? (PP_SIZE / 2 + 8);
  const ppCX = PP_LEFT + 14 + PP_SIZE / 2;
  const ppCY = PP_TOP + 14 + PP_SIZE / 2;
  let spark = '';
  if (frame?.sparkles) {
    for (const s of frame.sparkles) {
      spark += `<circle cx="${s.x}" cy="${s.y}" r="${s.r}" fill="${o.accent}" opacity="${s.a}"/>`;
    }
  }

  // Nome: title case, não força ALL CAPS se já tiver maiúsculas mistas
  let title = String(o.name || 'Novo membro').trim();
  if (title === title.toLowerCase()) {
    title = title.replace(/\b\w/g, c => c.toUpperCase());
  }
  title = title.slice(0, 28);

  const textX = PP_LEFT + PP_SIZE + 56;
  const texts = `
    <text x="${textX}" y="175" font-family="Arial, Helvetica, sans-serif" font-size="22"
      fill="${o.accent}" font-weight="600" letter-spacing="3">BEM-VINDO(A)</text>
    <text x="${textX}" y="250" font-family="Arial Black, Arial, sans-serif" font-size="52"
      font-weight="900" fill="#ffffff">${esc(title)}</text>
    ${o.sub1 ? `<text x="${textX}" y="310" font-family="Arial, sans-serif" font-size="26" fill="#e2e8f0" font-weight="600">${esc(o.sub1.slice(0, 48))}</text>` : ''}
    ${o.sub2 ? `<text x="${textX}" y="360" font-family="Arial, sans-serif" font-size="22" fill="${o.sub}">${esc(o.sub2.slice(0, 52))}</text>` : ''}
    <text x="${textX}" y="${H - 48}" font-family="Arial, sans-serif" font-size="18" fill="#94a3b8">${esc(String(o.footer || '').slice(0, 42))}</text>
  `;

  // sombra suave só no lado do texto (não cobre a foto)
  return Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="shade" x1="0.25" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#000" stop-opacity="0"/>
        <stop offset="0.28" stop-color="#000" stop-opacity="0.55"/>
        <stop offset="1" stop-color="#000" stop-opacity="0.25"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#shade)"/>
    ${spark}
    ${frame ? `<circle cx="${ppCX}" cy="${ppCY}" r="${ringR}" fill="none" stroke="${o.accent}" stroke-width="4" opacity="0.9"/>` : ''}
    ${texts}
  </svg>`);
}

/** ▸ FOTO (welcome2): PNG 1080×540. */
async function artCard(opts = {}) {
  const o = _defaults(opts);
  const bg = await fundo(o, opts);
  const ppBuf = opts.profilePicUrl ? await _fetch(opts.profilePicUrl, opts).catch(() => null) : null;
  const pp = await _ppCircle(ppBuf, PP_SIZE, { ...o, initial: o.name });
  const ringPad = 14;
  const overlay = overlaySvg(o, null);
  const out = await sharp(bg)
    .composite([
      { input: pp, left: PP_LEFT - ringPad, top: PP_TOP - ringPad },
      { input: overlay, left: 0, top: 0 },
    ])
    .png({ compressionLevel: 8 })
    .toBuffer();
  return out;
}

/** ▸ GIF (welcm3): mp4 gifPlayback — pan, anel, faíscas. */
async function artGif(opts = {}) {
  const o = _defaults(opts);
  const frames = Math.min(16, Math.max(8, opts.frames || 12));
  const bigW = Math.round(W * 1.12);
  const bgFull = await (async () => {
    const url = `${POLLI}/${encodeURIComponent(PROMPTS[o.kind] || PROMPTS.welcome)}?width=${bigW}&height=${H}&seed=${o.seed}&nologo=true`;
    const b = await _fetch(url, opts).catch(() => null);
    if (b && b.length > 3000) {
      try {
        return await sharp(b).resize(bigW, H, { fit: 'cover', kernel: sharp.kernel.lanczos3 }).jpeg({ quality: 90 }).toBuffer();
      } catch {}
    }
    const svg = `<svg width="${bigW}" height="${H}" xmlns="http://www.w3.org/2000/svg"><defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#0b0b12"/><stop offset="0.5" stop-color="#161022"/>
        <stop offset="1" stop-color="#2a1848"/></linearGradient></defs>
      <rect width="${bigW}" height="${H}" fill="url(#g)"/></svg>`;
    return sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
  })();

  const ppBuf = opts.profilePicUrl ? await _fetch(opts.profilePicUrl, opts).catch(() => null) : null;
  const pp = await _ppCircle(ppBuf, PP_SIZE, { ...o, initial: o.name });
  const ringPad = 14;

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'darkart-'));
  try {
    const maxPan = bigW - W;
    for (let f = 0; f < frames; f++) {
      const t = f / frames;
      const pan = Math.round(maxPan * (0.5 - 0.5 * Math.cos(2 * Math.PI * t)));
      const ringR = PP_SIZE / 2 + 8 + Math.round(6 * Math.sin(2 * Math.PI * t * 2));
      const sparkles = [];
      for (let k = 0; k < 8; k++) {
        const ph = (t + k / 8) % 1;
        sparkles.push({
          x: 40 + ((k * 137) % (W - 80)),
          y: Math.round(H - ph * H),
          r: 2.2 + (k % 3),
          a: (0.2 + 0.55 * Math.abs(Math.sin(k * 1.7 + ph * 6.28))).toFixed(2),
        });
      }
      const crop = await sharp(bgFull).extract({ left: pan, top: 0, width: W, height: H }).toBuffer();
      const frameBuf = await sharp(crop)
        .composite([
          { input: pp, left: PP_LEFT - ringPad, top: PP_TOP - ringPad },
          { input: overlaySvg(o, { ringR, sparkles }), left: 0, top: 0 },
        ])
        .png()
        .toBuffer();
      fs.writeFileSync(path.join(dir, `f${String(f).padStart(2, '0')}.png`), frameBuf);
    }
    let ffmpeg = 'ffmpeg';
    try { ffmpeg = require('ffmpeg-static') || 'ffmpeg'; } catch {}
    if (process.env.FFMPEG_PATH) ffmpeg = process.env.FFMPEG_PATH;
    const out = path.join(dir, 'art.mp4');
    await execFileAsync(ffmpeg, [
      '-y', '-framerate', '8', '-i', path.join(dir, 'f%02d.png'),
      '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart', out,
    ], { stdio: 'pipe', timeout: 240000 });
    return fs.readFileSync(out);
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
}

function cardOptsFromPlayer(p, jid, botName) {
  const sub1 = `Nv.${p.level || 1} · ${String(p.race || 'humano')} ${String(p.class || 'guerreiro')}`;
  const sub2 = `HP ${p.hp ?? 0}/${p.maxHp ?? 100} · MP ${p.mp ?? 0}/${p.maxMp ?? 80} · ${p.coins ?? 0} coins`;
  return {
    name: p.name || 'Aventureiro', sub1, sub2,
    footer: `${botName || 'DARK BOT'} · DARK VILLE`, kind: 'hero', accent: '#a78bfa',
  };
}
async function heroCard(player, opts = {}) {
  return artCard({ ...cardOptsFromPlayer(player, opts.jid, opts.botName || 'DARK BOT'), ...opts });
}
async function heroGif(player, opts = {}) {
  return artGif({ ...cardOptsFromPlayer(player, opts.jid, opts.botName || 'DARK BOT'), ...opts });
}

module.exports = { artCard, artGif, heroCard, heroGif, PROMPTS, W, H, PP_SIZE };
