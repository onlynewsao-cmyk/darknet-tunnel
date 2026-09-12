/**
 * DARK BOT v6.32 — WATERMARK AVANÇADO + BRAT CORRIGIDO
 * Watermark estilo referência: bot + dono + criador + grupo com fontes fancy
 * brat = texto em fundo branco (estático)
 * brat2 = texto animado (GIF → WebP animado)
 */
'use strict';

const config = require('../config');
const stickerMaker = require('./stickerMaker');

// ── Fontes fancy para watermark ──
const FANCY = {
  bold_italic: t => {
    const m = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    const f = '𝑨𝑪𝑫𝑬𝑭𝑮𝑯𝑰𝑱𝑲𝑳𝑴𝑵𝑶𝑷𝑸𝑹𝑻𝑼𝑽𝑾𝑿𝒀𝒁𝒂𝒃𝒄𝒅𝒆𝒇𝒈𝒊𝒋𝒌𝒍𝒎𝒏𝒐𝒑𝒒𝒓𝒔𝒕𝒖𝒗𝒘𝒙𝒚𝒛';
    return t.split('').map(c => { const i = m.indexOf(c); return i >= 0 ? f[i] : c; }).join('');
  },
  small_caps: t => {
    const m = 'abcdefghijklmnopqrstuvwxyz';
    const f = 'ᴀʙᴄᴅᴇɢʜɪᴊᴋʟᴍɴᴏᴘqʀꜱᴛᴜᴠᴡxʏᴢ';
    return t.split('').map(c => { const i = m.indexOf(c); return i >= 0 ? f[i] : c; }).join('');
  },
  monospace: t => {
    const m = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    const f = '𝙰𝙲𝙴𝙶𝙸𝙹𝙺𝙻𝙼𝙽𝙾𝚀𝚁𝚂𝚃𝚄𝚅𝚆𝚇𝚈𝚉𝚊𝚋𝚌𝚍𝚎𝚏𝚐𝚑𝚒𝚓𝚔𝚕𝚖𝚗𝚘𝚙𝚚𝚛𝚜𝚝𝚞𝚟𝚠𝚡𝚢𝚣';
    return t.split('').map(c => { const i = m.indexOf(c); return i >= 0 ? f[i] : c; }).join('');
  },
  cursive: t => {
    const m = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    const f = '𝒜ℬ𝒞𝒟ℰℱ𝒢ℋℐ𝒥𝒦ℒℳ𝒩𝒪𝒫𝒬ℛ𝒮𝒯𝒰𝒱𝒲𝒳𝒴𝒵𝒶𝒷𝒸𝒹ℯ𝒻ℊ𝒽𝒾𝒿𝓀𝓁𝓂𝓃ℴ𝓅𝓆𝓇𝓈𝓉𝓊𝓋𝓌𝓍𝓎𝓏';
    return t.split('').map(c => { const i = m.indexOf(c); return i >= 0 ? f[i] : c; }).join('');
  },
  double: t => {
    const m = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    const f = '𝔸ℂ𝔻𝔼𝔽𝔾ℍ𝕁𝕂𝕃𝕄ℕ𝕆ℙℚℝ𝕊𝕋𝕌𝕍𝕎𝕏𝕐ℤ𝕒𝕓𝕔𝕕𝕖𝕘𝕙𝕛𝕜𝕝𝕞𝕟𝕠𝕡𝕢𝕣𝕤𝕥𝕦𝕧𝕨𝕩𝕪𝕫';
    return t.split('').map(c => { const i = m.indexOf(c); return i >= 0 ? f[i] : c; }).join('');
  },
};

/**
 * Gera SVG de watermark estilo referência
 * Mostra: Bot, Dono, Criador, Grupo com fontes fancy e emojis
 */
function generateWatermarkSvg({ botName, ownerName, userName, groupName, width = 512, height = 280 }) {
  const botFancy = FANCY.bold_italic(botName || 'DARK BOT');
  const ownerFancy = FANCY.cursive(ownerName || 'Dark Net');
  const userFancy = FANCY.small_caps(userName || 'User');
  const groupFancy = FANCY.monospace(groupName || 'PV');

  return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:#0a0a0a;stop-opacity:0.95"/>
        <stop offset="100%" style="stop-color:#1a0a2e;stop-opacity:0.95"/>
      </linearGradient>
      <filter id="glow"><feGaussianBlur stdDeviation="1" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>
    <rect width="100%" height="100%" fill="url(#bg)" rx="12"/>
    <rect x="8" y="8" width="${width-16}" height="${height-16}" fill="none" stroke="#8B5CF6" stroke-width="1" rx="8" opacity="0.5"/>

    <text x="${width/2}" y="38" text-anchor="middle" font-family="Arial" font-size="18" font-style="italic" font-weight="bold" fill="#E879F9" filter="url(#glow)">⇨ Criada por: 💖</text>
    <text x="${width/2}" y="62" text-anchor="middle" font-family="Arial" font-size="16" fill="#C4B5FD">↳ 『 ${botFancy} 』</text>

    <text x="${width/2}" y="100" text-anchor="middle" font-family="Arial" font-size="18" font-style="italic" font-weight="bold" fill="#FBBF24" filter="url(#glow)">⇨ Nick Dono: 👑</text>
    <text x="${width/2}" y="124" text-anchor="middle" font-family="Arial" font-size="16" fill="#FDE68A">↳ 『 ${ownerFancy} 』</text>

    <line x1="${width*0.2}" y1="145" x2="${width*0.45}" y2="145" stroke="#666" stroke-width="1"/>
    <circle cx="${width/2}" cy="145" r="3" fill="#8B5CF6"/>
    <line x1="${width*0.55}" y1="145" x2="${width*0.8}" y2="145" stroke="#666" stroke-width="1"/>

    <text x="${width/2}" y="175" text-anchor="middle" font-family="Arial" font-size="18" font-style="italic" font-weight="bold" fill="#67E8F9" filter="url(#glow)">⇨ Feita Por: 💎</text>
    <text x="${width/2}" y="199" text-anchor="middle" font-family="Arial" font-size="16" fill="#A5F3FC">↳ 『 ${userFancy} 』</text>

    <text x="${width/2}" y="237" text-anchor="middle" font-family="Arial" font-size="18" font-style="italic" font-weight="bold" fill="#86EFAC" filter="url(#glow)">⇨ Grupo: </text>
    <text x="${width/2}" y="261" text-anchor="middle" font-family="Arial" font-size="14" fill="#BBF7D0">↳ 『 ${groupFancy.slice(0, 25)} 』</text>
  </svg>`);
}

/**
 * Cria sticker com watermark abaixo da imagem
 */
async function createStickerWithWatermark(imageBuf, { botName, ownerName, userName, groupName, packId } = {}) {
  const sharp = require('sharp');

  // Redimensionar imagem para 512x512
  const imgResized = await sharp(imageBuf).resize(512, 512, { fit: 'cover' }).toBuffer();

  // Gerar watermark SVG
  const wmSvg = generateWatermarkSvg({ botName, ownerName, userName, groupName, width: 512, height: 280 });
  const wmPng = await sharp(wmSvg).png().toBuffer();

  // Criar canvas 512 x (512+280) = 512x792
  // Mas stickers devem ser 512x512, então vamos fazer overlay na parte inferior
  // Ou criar um sticker 512x512 com a imagem em cima e watermark em baixo
  const canvasHeight = 512;
  const imgHeight = 340; // imagem ocupa 340px
  const wmHeight = 172; // watermark ocupa 172px

  const imgTop = await sharp(imageBuf).resize(512, imgHeight, { fit: 'cover' }).toBuffer();
  const wmResized = await sharp(wmSvg).resize(512, wmHeight, { fit: 'cover' }).toBuffer();

  const final = await sharp({
    create: { width: 512, height: canvasHeight, channels: 4, background: { r: 10, g: 10, b: 10, alpha: 1 } }
  })
    .composite([
      { input: imgTop, left: 0, top: 0 },
      { input: wmResized, left: 0, top: imgHeight },
    ])
    .webp({ quality: 85 })
    .toBuffer();

  return stickerMaker.create(final, {
    botName: botName || config.bot.name,
    ownerName: ownerName || config.owner.name,
    userName: userName || 'User',
    groupName: groupName || 'PV',
    isVideo: false,
    packId,
  });
}

module.exports = { generateWatermarkSvg, createStickerWithWatermark, FANCY };
