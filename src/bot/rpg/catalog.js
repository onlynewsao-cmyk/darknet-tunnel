'use strict';
/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║   DARK BOT v11.2 — CATÁLOGO DO MULTIVERSO                      ║
 * ║   50+ Personagens Famosos · 40 Técnicas/Poderes · 8 Mundos      ║
 * ║                                                                  ║
 * ║   O jogador é ALGUÉM NOVO neste universo. Os heróis que conhece  ║
 * ║   existem aqui — e podem ser recrutados como aliados.           ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

// ══════════════════════════════════════════════════════════════
// RARIDADES
// ══════════════════════════════════════════════════════════════
const RARITY = {
  'Mítico':   { emoji: '🔴', chance: 3,  bonus: 5, desc: 'Lendário absoluto' },
  'Lendário': { emoji: '🟡', chance: 12, bonus: 3, desc: 'Poder extraordinário' },
  'Épico':    { emoji: '🟣', chance: 35, bonus: 2, desc: 'Muito forte' },
  'Raro':     { emoji: '🔵', chance: 100, bonus: 1, desc: 'Aliado útil' },
};

// ══════════════════════════════════════════════════════════════
// PERSONAGENS FAMOSOS — TODOS OS 8 MUNDOS
// ══════════════════════════════════════════════════════════════
const CHARACTERS = [
  // ── NARUTO 🍥 ──
  { id: 'naruto', name: 'Naruto Uzumaki', world: 'naruto', emoji: '🍥', rarity: 'Lendário', atk: 35, hp: 28, poder: 'Rasengan', quote: 'Eu nunca volto atrás na minha palavra. É o meu Camino Ninja!' },
  { id: 'sasuke', name: 'Sasuke Uchiha', world: 'naruto', emoji: '👁️', rarity: 'Lendário', atk: 38, hp: 24, poder: 'Chidori', quote: 'Eu fiz tudo o que foi preciso para chegar aqui.' },
  { id: 'kakashi', name: 'Kakashi Hatake', world: 'naruto', emoji: '⚡', rarity: 'Épico', atk: 30, hp: 26, poder: 'Kamui', quote: 'Num mundo ninja, quem abandona a missão é pior que um cadáver.' },
  { id: 'sakura', name: 'Sakura Haruno', world: 'naruto', emoji: '🌸', rarity: 'Raro', atk: 20, hp: 30, poder: 'Curar', quote: 'Vou protegê-los. Todos eles.' },
  { id: 'minato', name: 'Minato Namikaze', world: 'naruto', emoji: '🏆', rarity: 'Mítico', atk: 45, hp: 30, poder: 'Rasengan Selo', quote: 'O Hokage protege a vila com a sua própria vida.' },

  // ── ONE PIECE 🏴‍☠️ ──
  { id: 'luffy', name: 'Luffy (Gear 5)', world: 'onepiece', emoji: '👒', rarity: 'Mítico', atk: 50, hp: 32, poder: 'Hawkins', quote: 'Eu vou ser Rei dos Piratas!' },
  { id: 'zoro', name: 'Roronoa Zoro', world: 'onepiece', emoji: '⚔️', rarity: 'Lendário', atk: 42, hp: 28, poder: 'Three-Sword Style', quote: 'Sou eu que vou ser o maior espadachim do mundo.' },
  { id: 'shanks', name: 'Shanks', world: 'onepiece', emoji: '👹', rarity: 'Mítico', atk: 48, hp: 35, poder: 'Conquerdor', quote: 'O poder... não está em quanto tu tens, mas em quanto tu podes.' },
  { id: 'ace', name: 'Portgas D. Ace', world: 'onepiece', emoji: '🔥', rarity: 'Lendário', atk: 40, hp: 27, poder: 'Mera Mera', quote: 'Eu sou o irmão do Luffy. E sou livre.' },
  { id: 'robin', name: 'Nico Robin', world: 'onepiece', emoji: '🌺', rarity: 'Épico', atk: 26, hp: 24, poder: 'Hana Hana no Mi', quote: 'Eu quero viver. Nunca mais quero morrer.' },

  // ── SOLO LEVELING ⚔️ ──
  { id: 'jinwoo', name: 'Sung Jin-Woo', world: 'sololeveling', emoji: '🌑', rarity: 'Mítico', atk: 47, hp: 34, poder: 'Arise', quote: 'Eu sou o Monarca das Sombras.' },
  { id: 'cha', name: 'Cha Hae-In', world: 'sololeveling', emoji: '🗡️', rarity: 'Épico', atk: 30, hp: 26, poder: 'Espada Dupla', quote: 'Os Rank S não recuam.' },
  { id: 'igris', name: 'Igris', world: 'sololeveling', emoji: '🛡️', rarity: 'Raro', atk: 24, hp: 38, poder: 'Guardião', quote: 'O meu dever é proteger o Monarca.' },
  { id: 'beru', name: 'Beru', world: 'sololeveling', emoji: '🧊', rarity: 'Raro', atk: 22, hp: 30, poder: 'Congelar', quote: 'Beru não sente. Beru só mata.' },
  { id: 'antares', name: 'Antares', world: 'sololeveling', emoji: '👑', rarity: 'Mítico', atk: 44, hp: 36, poder: 'Olho do Rei', quote: 'O exército das sombras obedece a um só comando.' },

  // ── JUJUTSU KAISEN 👁️ ──
  { id: 'gojo', name: 'Gojo Satoru', world: 'jjk', emoji: '♾️', rarity: 'Mítico', atk: 48, hp: 33, poder: 'Limitless', quote: 'Eu sou o invencível. O mais forte do mundo.' },
  { id: 'sukuna', name: 'Ryomen Sukuna', world: 'jjk', emoji: '👹', rarity: 'Mítico', atk: 52, hp: 30, poder: 'Corte Espacial', quote: 'Eu sou o Rei das Maldições.' },
  { id: 'yuji', name: 'Yuji Itadori', world: 'jjk', emoji: '👊', rarity: 'Épico', atk: 32, hp: 34, poder: 'Black Flash', quote: 'Eu vivo para os outros. Mesmo que isso me mate.' },
  { id: 'megumi', name: 'Megumi Fushiguro', world: 'jjk', emoji: '🐺', rarity: 'Raro', atk: 28, hp: 26, poder: 'Invocação', quote: 'As técnicas de maldição são uma arma para sobreviver.' },
  { id: 'nobara', name: 'Nobara Kugisaki', world: 'jjk', emoji: '📌', rarity: 'Raro', atk: 26, hp: 22, poder: 'Boneca', quote: 'Não preciso de ser perfeita. Só preciso de ser eu.' },

  // ── DRAGON BALL 🐉 ──
  { id: 'goku', name: 'Goku (Ultra Instinto)', world: 'dragonball', emoji: '⚪', rarity: 'Mítico', atk: 55, hp: 35, poder: 'Kamehameha', quote: 'O meu limite? Ainda não o encontrei.' },
  { id: 'vegeta', name: 'Vegeta (Ultra Ego)', world: 'dragonball', emoji: '💜', rarity: 'Mítico', atk: 53, hp: 33, poder: 'Final Flash', quote: 'Eu sou o príncipe dos Saiyajin.' },
  { id: 'gohan', name: 'Gohan (Final)', world: 'dragonball', emoji: '📖', rarity: 'Lendário', atk: 44, hp: 30, poder: 'Potencial Total', quote: 'A minha raiva... nunca mais se repete.' },
  { id: 'piccolo', name: 'Piccolo', world: 'dragonball', emoji: '🟢', rarity: 'Lendário', atk: 38, hp: 34, poder: 'Final Kamehameha', quote: 'A força não vem do corpo. Vem da mente.' },
  { id: 'frieza', name: 'Frieza (Final)', world: 'dragonball', emoji: '👽', rarity: 'Mítico', atk: 50, hp: 32, poder: 'Galan', quote: 'Eu sou o imperador do universo.' },

  // ── DEMON SLAYER 🗡️ ──
  { id: 'tanjiro', name: 'Tanjiro Kamado', world: 'demonslayer', emoji: '🌊', rarity: 'Épico', atk: 33, hp: 32, poder: 'Hinokami Kagura', quote: 'Eu nunca vou desistir de ninguém. Nunca.' },
  { id: 'rengoku', name: 'Rengoku Kyojuro', world: 'demonslayer', emoji: '🔥', rarity: 'Lendário', atk: 40, hp: 33, poder: 'Respiração da Chama', quote: 'Vá até ao topo, olhe para lá de cima e sorria.' },
  { id: 'zenitsu', name: 'Zenitsu Agatsuma', world: 'demonslayer', emoji: '⚡', rarity: 'Raro', atk: 30, hp: 20, poder: 'Trovão Instantâneo', quote: 'A Respiração do Trovão... forma 1!' },
  { id: 'inosuke', name: 'Inosuke Hashibira', world: 'demonslayer', emoji: '🐗', rarity: 'Raro', atk: 31, hp: 28, poder: 'Lâminas Duplas', quote: 'Eu não tenho rosto! Ou tenho? Haha!' },
  { id: 'muzan', name: 'Muzan Kibutsuji', world: 'demonslayer', emoji: '🧛', rarity: 'Mítico', atk: 50, hp: 38, poder: 'Progenitor', quote: 'Eu sou a divindade dos demónios. Eternamente.' },

  // ── DEVIL MAY CRY 😈 ──
  { id: 'dante', name: 'Dante', world: 'dmc', emoji: '😈', rarity: 'Mítico', atk: 46, hp: 32, poder: 'Devil Trigger', quote: 'Eu sou o melhor caçador de demónios do mundo. Sempre fui.' },
  { id: 'vergil', name: 'Vergil', world: 'dmc', emoji: '🗡️', rarity: 'Mítico', atk: 48, hp: 30, poder: 'Yamato', quote: 'A força é tudo. E eu quero-a toda.' },
  { id: 'nero', name: 'Nero', world: 'dmc', emoji: '🔧', rarity: 'Épico', atk: 30, hp: 30, poder: 'Devil Breaker', quote: 'Eu não preciso de ser filho de alguém. Eu sou eu.' },
  { id: 'lady', name: 'Lady (Trish)', world: 'dmc', emoji: '💃', rarity: 'Épico', atk: 29, hp: 26, poder: 'Trish Infinita', quote: 'O estilo é tudo. Sem estilo, és nada.' },
  { id: 'sparda', name: 'Sparda', world: 'dmc', emoji: '⚔️', rarity: 'Mítico', atk: 52, hp: 40, poder: 'Rebellion', quote: 'A espada Sparda escolhe os dignos.' },

  // ── BLEACH 👻 ──
  { id: 'ichigo', name: 'Ichigo Kurosaki', world: 'bleach', emoji: '👺', rarity: 'Lendário', atk: 42, hp: 32, poder: 'Getsuga Tensho', quote: 'Eu protejo as pessoas que escolhi. Ponto.' },
  { id: 'byakuya', name: 'Byakuya Kuchiki', world: 'bleach', emoji: '❄️', rarity: 'Lendário', atk: 40, hp: 28, poder: 'Senbonzakura', quote: 'O meu destino é o da espada. Sempre foi.' },
  { id: 'rukia', name: 'Rukia Kuchiki', world: 'bleach', emoji: '🍂', rarity: 'Épico', atk: 28, hp: 28, poder: 'Katen Kyoko', quote: 'Deixa-me viver entre os humanos. Pelo menos por um tempo.' },
  { id: 'aizen', name: 'Sousuke Aizen', world: 'bleach', emoji: '🌀', rarity: 'Mítico', atk: 47, hp: 30, poder: 'Hado + Kyoka', quote: 'Nunca me deixem ler no meu relatório de progresso.' },
  { id: 'yamamoto', name: 'Genryusai Yamamoto', world: 'bleach', emoji: '🔥', rarity: 'Mítico', atk: 45, hp: 38, poder: 'Ryujin Jakka', quote: 'O fogo não perdoa. E eu também não.' },
];

// ══════════════════════════════════════════════════════════════
// TÉCNICAS / PODERES — 5 POR MUNDO (40 TOTAL)
// Cada técnica dá um PASSIVO permanente quando aprendida.
// ══════════════════════════════════════════════════════════════
const TECHNIQUES = [
  // ── NARUTO 🍥 ──
  { id: 'rasengan', name: 'Rasengan', world: 'naruto', emoji: '🍥', nivel: 5, custo: 500, atk: 0.04, desc: '+4% ATK — esfera de chakra rotativa' },
  { id: 'kage_bunshin', name: 'Kage Bunshin', world: 'naruto', emoji: '👥', nivel: 8, custo: 800, dodge: 0.05, desc: '+5% esquiva — clones sombrios' },
  { id: 'sharingan', name: 'Sharingan', world: 'naruto', emoji: '👁️', nivel: 12, custo: 1500, crit: 0.06, desc: '+6% crítico — vê o fluxo do chakra' },
  { id: 'modo_sabio', name: 'Modo Sábio', world: 'naruto', emoji: '🐸', nivel: 18, custo: 3000, atk: 0.05, def: 0.05, desc: '+5% ATK, +5% DEF — poder natural' },
  { id: 'kyuubi', name: 'Chakra da Kyuubi', world: 'naruto', emoji: '🦊', nivel: 25, custo: 6000, atk: 0.10, hp: 0.08, desc: '+10% ATK, +8% HP — cauda interior' },

  // ── ONE PIECE 🏴‍☠️ ──
  { id: 'haki_armas', name: 'Haki do Armamento', world: 'onepiece', emoji: '🌑', nivel: 8, custo: 800, atk: 0.05, desc: '+5% ATK — reveste o corpo' },
  { id: 'santoryu', name: 'Three-Sword Style', world: 'onepiece', emoji: '⚔️', nivel: 10, custo: 1200, crit: 0.05, desc: '+5% crítico — 3 espadas' },
  { id: 'haki_conquerdor', name: 'Haki do Conquerdor', world: 'onepiece', emoji: '👑', nivel: 20, custo: 4000, atk: 0.08, desc: '+8% ATK — vontade do rei' },
  { id: 'akuma_awaken', name: 'Akuma Awakened', world: 'onepiece', emoji: '🌀', nivel: 22, custo: 5000, atk: 0.06, def: 0.06, desc: '+6% ATK, +6% DEF — fruta desperta' },
  { id: 'gear5', name: 'Gear Fifth (Nika)', world: 'onepiece', emoji: '🤍', nivel: 28, custo: 8000, atk: 0.12, dodge: 0.08, desc: '+12% ATK, +8% esquiva — o mais livre' },

  // ── SOLO LEVELING ⚔️ ──
  { id: 'extrair_sombra', name: 'Extrair Sombra', world: 'sololeveling', emoji: '🌑', nivel: 12, custo: 1500, atk: 0.04, desc: '+4% ATK — invoca sombras' },
  { id: 'arise', name: 'Arise', world: 'sololeveling', emoji: '💀', nivel: 16, custo: 2500, atk: 0.06, desc: '+6% ATK — levanta os caídos' },
  { id: 'castelo_arquidemao', name: 'Castelo do Arquidemónio', world: 'sololeveling', emoji: '🏰', nivel: 22, custo: 4500, def: 0.08, desc: '+8% DEF — porta sombria' },
  { id: 'exército_sombras', name: 'Exército das Sombras', world: 'sololeveling', emoji: '🐺', nivel: 28, custo: 7000, atk: 0.10, desc: '+10% ATK — o exército obedece' },
  { id: 'monarca_sombras', name: 'Autoridade do Monarca', world: 'sololeveling', emoji: '👑', nivel: 35, custo: 12000, atk: 0.12, hp: 0.10, desc: '+12% ATK, +10% HP — o Rei das Sombras' },

  // ── JJK 👁️ ──
  { id: 'cleave', name: 'Cleave', world: 'jjk', emoji: '✂️', nivel: 15, custo: 2000, crit: 0.05, desc: '+5% crítico — golpe que corta' },
  { id: 'reversao', name: 'Técnica de Reversão', world: 'jjk', emoji: '🔄', nivel: 18, custo: 3000, def: 0.06, desc: '+6% DEF — maldição negativa vira positiva' },
  { id: 'black_flash_jjk', name: 'Black Flash', world: 'jjk', emoji: '⚡', nivel: 22, custo: 4500, crit: 0.08, desc: '+8% crítico — impacto dimensional' },
  { id: 'limitless', name: 'Limitless (Infinito)', world: 'jjk', emoji: '♾️', nivel: 28, custo: 8000, dodge: 0.10, desc: '+10% esquiva — o espaço infinito' },
  { id: 'dominio_jjk', name: 'Domain Expansion', world: 'jjk', emoji: '🏛️', nivel: 35, custo: 12000, atk: 0.15, desc: '+15% ATK — auto-acerto garantido' },

  // ── DRAGON BALL 🐉 ──
  { id: 'kaioken', name: 'Kaioken', world: 'dragonball', emoji: '🔴', nivel: 20, custo: 3000, atk: 0.08, desc: '+8% ATK — amplifica o ki' },
  { id: 'super_saiyajin', name: 'Super Saiyajin', world: 'dragonball', emoji: '💛', nivel: 25, custo: 5000, atk: 0.10, def: 0.05, desc: '+10% ATK, +5% DEF — o poder interior' },
  { id: 'instantaneo', name: 'Transmissão Instantânea', world: 'dragonball', emoji: '✨', nivel: 28, custo: 6000, dodge: 0.08, desc: '+8% esquiva — move-se num instante' },
  { id: 'genkidama', name: 'Genkidama', world: 'dragonball', emoji: '🌍', nivel: 32, custo: 9000, atk: 0.12, desc: '+12% ATK — espírito da Terra' },
  { id: 'ultra_instinto', name: 'Ultra Instinto', world: 'dragonball', emoji: '⚪', nivel: 40, custo: 15000, dodge: 0.12, crit: 0.10, desc: '+12% esquiva, +10% crítico — o corpo age sozinho' },

  // ── DEMON SLAYER 🗡️ ──
  { id: 'respiracao_agua', name: 'Respiração da Água', world: 'demonslayer', emoji: '🌊', nivel: 8, custo: 800, dodge: 0.05, desc: '+5% esquiva — fluxo fluído' },
  { id: 'respiracao_trovao', name: 'Respiração do Trovão', world: 'demonslayer', emoji: '⚡', nivel: 16, custo: 2500, crit: 0.06, desc: '+6% crítico — o corte mais rápido' },
  { id: 'hinokami', name: 'Hinokami Kagura', world: 'demonslayer', emoji: '☀️', nivel: 22, custo: 4500, atk: 0.08, desc: '+8% ATK — dança do sol' },
  { id: 'marca_hashira', name: 'Marca Hashira', world: 'demonslayer', emoji: '⚔️', nivel: 30, custo: 7000, atk: 0.10, hp: 0.06, desc: '+10% ATK, +6% HP — o juramento' },
  { id: 'respiracao_sol', name: 'Respiração do Sol', world: 'demonslayer', emoji: '🌞', nivel: 35, custo: 10000, atk: 0.12, crit: 0.08, desc: '+12% ATK, +8% crítico — a forma original' },

  // ── DEVIL MAY CRY 😈 ──
  { id: 'estilo_sss', name: 'Estilo SSS', world: 'dmc', emoji: '✨', nivel: 12, custo: 1500, crit: 0.05, dodge: 0.05, desc: '+5% crítico, +5% esquiva — o estilo perfeito' },
  { id: 'devil_trigger', name: 'Devil Trigger', world: 'dmc', emoji: '😈', nivel: 16, custo: 2500, atk: 0.08, desc: '+8% ATK — sangue de Sparda' },
  { id: 'trish_infinita', name: 'Trish Infinita', world: 'dmc', emoji: '💃', nivel: 20, custo: 4000, crit: 0.07, desc: '+7% crítico — 1000 cortes' },
  { id: 'devil_breaker', name: 'Devil Breaker', world: 'dmc', emoji: '🔧', nivel: 24, custo: 5500, def: 0.08, desc: '+8% DEF — braço demónio' },
  { id: 'filho_sparda', name: 'Herança de Sparda', world: 'dmc', emoji: '⚔️', nivel: 30, custo: 9000, atk: 0.12, hp: 0.08, desc: '+12% ATK, +8% HP — sangue do caçador' },

  // ── BLEACH 👻 ──
  { id: 'shunpo', name: 'Shunpo', world: 'bleach', emoji: '💨', nivel: 12, custo: 1500, dodge: 0.06, desc: '+6% esquiva — passo veloz' },
  { id: 'getsuga', name: 'Getsuga Tensho', world: 'bleach', emoji: '🌊', nivel: 18, custo: 3000, atk: 0.07, desc: '+7% ATK — lâmina espiritual' },
  { id: 'kenpachi', name: 'Espírito Kenpachi', world: 'bleach', emoji: '🩸', nivel: 25, custo: 5500, atk: 0.10, desc: '+10% ATK — a fome de batalha' },
  { id: 'bankai', name: 'Bankai', world: 'bleach', emoji: '🏮', nivel: 32, custo: 9000, atk: 0.10, def: 0.08, desc: '+10% ATK, +8% DEF — a libertação final' },
  { id: 'getsuga_final', name: 'Getsuga Tensho Final', world: 'bleach', emoji: '🌌', nivel: 40, custo: 14000, atk: 0.15, crit: 0.08, desc: '+15% ATK, +8% crítico — a lâmina que corta tudo' },
];

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════

function charById(id) {
  return CHARACTERS.find(c => c.id === id);
}
function charByWorld(world) {
  return CHARACTERS.filter(c => c.world === world);
}
function techById(id) {
  return TECHNIQUES.find(t => t.id === id);
}
function techByWorld(world) {
  return TECHNIQUES.filter(t => t.world === world);
}

/** Recruta um personagem aleatório (rarity-weighted) */
function rollCharacter(exclude = []) {
  const pool = CHARACTERS.filter(c => !exclude.includes(c.id));
  const totalChance = pool.reduce((s, c) => s + (RARITY[c.rarity]?.chance || 100), 0);
  let roll = Math.random() * totalChance;
  for (const c of pool) {
    roll -= (RARITY[c.rarity]?.chance || 100);
    if (roll <= 0) return c;
  }
  return pool[pool.length - 1];
}

/** Bonus passivo TOTAL de todos os aliados recrutados */
function allyBonus(p) {
  const ids = Array.isArray(p.characters) ? p.characters : [];
  let atk = 0, hp = 0;
  for (const id of ids) {
    const c = charById(id);
    if (c) { atk += (c.atk || 0); hp += (c.hp || 0); }
  }
  return { atk, hp, n: ids.length };
}

/** Bonus passivo TOTAL de todas as técnicas aprendidas */
function techBonus(p) {
  const ids = Array.isArray(p.techniques) ? p.techniques : [];
  let atk = 0, def = 0, crit = 0, dodge = 0, hp = 0;
  for (const id of ids) {
    const t = techById(id);
    if (!t) continue;
    atk += t.atk || 0;
    def += t.def || 0;
    crit += t.crit || 0;
    dodge += t.dodge || 0;
    hp += t.hp || 0;
  }
  return { atk, def, crit, dodge, hp, n: ids.length };
}

module.exports = {
  RARITY, CHARACTERS, TECHNIQUES,
  charById, charByWorld, techById, techByWorld,
  rollCharacter, allyBonus, techBonus,
};
