/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║   DARK BOT v7 — RPG Image Generator                          ║
 * ║   Gera imagens para cards, perfis, bosses, armas, badges      ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */
'use strict';

const axios = require('axios');
const sharp = require('sharp');

// ══════════════════════════════════════════════════════════════
// POLLINATIONS API (gera imagens via IA)
// ══════════════════════════════════════════════════════════════
async function generateFromPrompt(prompt, width = 512, height = 512) {
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&nologo=true&enhance=true`;
  const r = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 });
  return Buffer.from(r.data);
}

// ══════════════════════════════════════════════════════════════
// GERAR CARD GACHA (com moldura e info)
// ══════════════════════════════════════════════════════════════
async function generateCardImage(card) {
  // 1. Gera a imagem base do personagem
  const prompt = `anime character ${card.name} from ${card.anime}, epic pose, detailed, high quality, manga style, dramatic lighting, ${card.rarity} rarity`;
  const baseImg = await generateFromPrompt(prompt, 400, 560);

  // 2. Cria a moldura SVG baseada na raridade
  const rarityColors = {
    'Mítico': { bg: '#1a0a0a', border: '#ff4444', glow: '#ff0000' },
    'Lendário': { bg: '#1a1a0a', border: '#ffcc00', glow: '#ffaa00' },
    'Épico': { bg: '#0a0a1a', border: '#aa44ff', glow: '#8800ff' },
    'Raro': { bg: '#0a1a1a', border: '#4488ff', glow: '#0066ff' },
  };
  const colors = rarityColors[card.rarity] || rarityColors['Raro'];

  const svg = `<svg width="440" height="620" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:${colors.bg};stop-opacity:1" />
        <stop offset="100%" style="stop-color:#000000;stop-opacity:1" />
      </linearGradient>
      <filter id="glow">
        <feGaussianBlur stdDeviation="3" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>
    <rect width="440" height="620" rx="15" fill="url(#bg)"/>
    <rect x="5" y="5" width="430" height="610" rx="12" fill="none" stroke="${colors.border}" stroke-width="3"/>
    <rect x="15" y="15" width="410" height="560" rx="10" fill="none" stroke="${colors.border}" stroke-width="1" opacity="0.5"/>
    <text x="220" y="48" text-anchor="middle" fill="${colors.border}" font-size="14" font-weight="bold" filter="url(#glow)">${card.rarity.toUpperCase()}</text>
    <text x="220" y="590" text-anchor="middle" fill="#ffffff" font-size="16" font-weight="bold">${card.name}</text>
    <text x="220" y="610" text-anchor="middle" fill="#aaaaaa" font-size="11">${card.anime}</text>
  </svg>`;

  const svgBuf = Buffer.from(svg);

  // 3. Compõe: moldura + imagem
  const composite = await sharp(svgBuf)
    .composite([{
      input: baseImg,
      top: 55,
      left: 20,
    }])
    .png()
    .toBuffer();

  return composite;
}

// ══════════════════════════════════════════════════════════════
// GERAR PERFIL DO JOGADOR
// ══════════════════════════════════════════════════════════════
async function generateProfileImage(player) {
  const rank = player.rank || 'E';
  const rankColors = {
    'E': '#888888', 'D': '#22cc44', 'C': '#4488ff', 'B': '#aa44ff',
    'A': '#ffcc00', 'S': '#ff4444', 'SS': '#ff8800', 'SSS': '#ff00ff',
  };
  const color = rankColors[rank] || '#888888';

  const originEmojis = {
    'shinobi': '🍥', 'pirata': '🏴‍☠️', 'cacador': '⚔️',
    'feiticeiro': '👁️', 'hashira': '🗡️', 'saiyajin': '🐉',
  };
  const emoji = originEmojis[player.origin] || '⚔️';

  const svg = `<svg width="600" height="400" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:#0a0a1a;stop-opacity:1"/>
        <stop offset="100%" style="stop-color:#1a0a2a;stop-opacity:1"/>
      </linearGradient>
    </defs>
    <rect width="600" height="400" rx="15" fill="url(#bg)"/>
    <rect x="5" y="5" width="590" height="390" rx="12" fill="none" stroke="${color}" stroke-width="2"/>
    
    <!-- Rank Badge -->
    <circle cx="60" cy="60" r="35" fill="none" stroke="${color}" stroke-width="3"/>
    <text x="60" y="70" text-anchor="middle" fill="${color}" font-size="28" font-weight="bold">${rank}</text>
    
    <!-- Name -->
    <text x="120" y="50" fill="#ffffff" font-size="22" font-weight="bold">${player.name || 'Aventureiro'}</text>
    <text x="120" y="72" fill="#aaaaaa" font-size="13">${emoji} ${player.origin || 'Caçador'} • Nível ${player.level || 1}</text>
    
    <!-- HP Bar -->
    <text x="30" y="120" fill="#ff4444" font-size="12">❤️ HP</text>
    <rect x="80" y="110" width="480" height="16" rx="8" fill="#1a1a1a"/>
    <rect x="80" y="110" width="${Math.round(480 * ((player.hp || 100) / (player.max_hp || 100)))}" height="16" rx="8" fill="#ff4444"/>
    <text x="570" y="123" text-anchor="end" fill="#ffffff" font-size="11">${player.hp || 100}/${player.max_hp || 100}</text>
    
    <!-- Energy Bar -->
    <text x="30" y="150" fill="#4488ff" font-size="12">⚡ EA</text>
    <rect x="80" y="140" width="480" height="16" rx="8" fill="#1a1a1a"/>
    <rect x="80" y="140" width="${Math.round(480 * ((player.energy || 50) / (player.max_energy || 50)))}" height="16" rx="8" fill="#4488ff"/>
    <text x="570" y="153" text-anchor="end" fill="#ffffff" font-size="11">${player.energy || 50}/${player.max_energy || 50}</text>
    
    <!-- Stats -->
    <text x="30" y="195" fill="#ffffff" font-size="14" font-weight="bold">📊 Atributos</text>
    <text x="30"  y="220" fill="#ff8888" font-size="12">💪 FOR: ${player.stat_str || 15}</text>
    <text x="170" y="220" fill="#88ff88" font-size="12">🏃 AGI: ${player.stat_agi || 15}</text>
    <text x="310" y="220" fill="#8888ff" font-size="12">🧠 INT: ${player.stat_int || 15}</text>
    <text x="450" y="220" fill="#ffff88" font-size="12">🛡️ VIT: ${player.stat_vit || 15}</text>
    
    <!-- Economy -->
    <text x="30"  y="260" fill="#ffcc00" font-size="13">💰 ${(player.berries || 0).toLocaleString()} Berries</text>
    <text x="250" y="260" fill="#aa44ff" font-size="13">💎 ${player.crystals || 0} Cristais</text>
    <text x="430" y="260" fill="#ff4444" font-size="13">🏴‍☠️ ${(player.bounty || 0).toLocaleString()} Bounty</text>
    
    <!-- Weapon -->
    <text x="30" y="300" fill="#ffffff" font-size="14" font-weight="bold">⚔️ Arma Equipada</text>
    <text x="30" y="322" fill="#aaaaaa" font-size="12">${player.weapon_name || 'Nenhuma arma equipada'}</text>
    
    <!-- Shadows -->
    <text x="30" y="360" fill="#ffffff" font-size="14" font-weight="bold">🌑 Sombras</text>
    <text x="200" y="360" fill="#aaaaaa" font-size="12">${player.shadow_count || 0} sombras extraídas</text>
  </svg>`;

  return Buffer.from(svg);
}

// ══════════════════════════════════════════════════════════════
// GERAR IMAGEM DE BOSS
// ══════════════════════════════════════════════════════════════
async function generateBossImage(boss) {
  const prompt = `anime villain ${boss.name} from ${boss.anime}, epic boss battle pose, dark aura, dramatic lighting, detailed, high quality, menacing`;
  return generateFromPrompt(prompt, 600, 400);
}

// ══════════════════════════════════════════════════════════════
// GERAR IMAGEM DE ARMA
// ══════════════════════════════════════════════════════════════
async function generateWeaponImage(weapon) {
  const prompt = `anime weapon ${weapon.name} from ${weapon.anime}, detailed, glowing, epic, high quality, dramatic lighting, floating`;
  return generateFromPrompt(prompt, 512, 512);
}

// ══════════════════════════════════════════════════════════════
// GERAR BADGE/CONQUISTA
// ══════════════════════════════════════════════════════════════
async function generateBadge(name, description) {
  const svg = `<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="gold" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:#ffd700;stop-opacity:1"/>
        <stop offset="100%" style="stop-color:#b8860b;stop-opacity:1"/>
      </linearGradient>
    </defs>
    <circle cx="100" cy="100" r="90" fill="url(#gold)" stroke="#ffd700" stroke-width="3"/>
    <circle cx="100" cy="100" r="75" fill="none" stroke="#b8860b" stroke-width="1"/>
    <text x="100" y="90" text-anchor="middle" fill="#1a1a1a" font-size="14" font-weight="bold">${name}</text>
    <text x="100" y="115" text-anchor="middle" fill="#1a1a1a" font-size="10">${description}</text>
  </svg>`;
  return Buffer.from(svg);
}

module.exports = {
  generateFromPrompt,
  generateCardImage,
  generateProfileImage,
  generateBossImage,
  generateWeaponImage,
  generateBadge,
};
