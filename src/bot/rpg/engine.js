/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║   DARK BOT v7 — ANIME RPG ENGINE MEGA                        ║
 * ║   Multiverso: Naruto, One Piece, Solo Leveling,              ║
 * ║   Jujutsu Kaisen, Demon Slayer, Dragon Ball, Bleach          ║
 * ║                                                               ║
 * ║   6 Origens | 8 Ranks | 20+ Armas | 15+ Bosses              ║
 * ║   50+ Cartas Gacha | Skills | Daily | Eventos | Achievements ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */
'use strict';

const R = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const P = a => a[Math.floor(Math.random() * a.length)];

// ══════════════════════════════════════════════════════════════
// ORIGENS
// ══════════════════════════════════════════════════════════════
const ORIGINS = {
  shinobi:    { emoji:'🍥', name:'Shinobi', desc:'Ninja de Konoha. Chakra e Jutsus.', bonus:{str:2,dex:3,int:2,vit:1,luk:2} },
  pirata:     { emoji:'🏴‍☠️', name:'Pirata do Mar', desc:'Grand Line. Haki e Akuma no Mi.', bonus:{str:3,dex:1,int:1,vit:3,luk:2} },
  cacador:    { emoji:'⚔️', name:'Caçador das Sombras', desc:'Rank S. Monarca das Sombras.', bonus:{str:3,dex:3,int:1,vit:1,luk:2} },
  feiticeiro: { emoji:'👁️', name:'Feiticeiro Jujutsu', desc:'Domínios e Maldições.', bonus:{str:1,dex:2,int:4,vit:1,luk:2} },
  hashira:    { emoji:'🗡️', name:'Hashira', desc:'Mestre da Respiração.', bonus:{str:2,dex:4,int:1,vit:2,luk:1} },
  saiyajin:   { emoji:'🐉', name:'Saiyajin', desc:'Guerreiro do espaço. Ki e Transformações.', bonus:{str:4,dex:2,int:1,vit:2,luk:1} },
};

// ══════════════════════════════════════════════════════════════
// RANKS
// ══════════════════════════════════════════════════════════════
const RANKS = [
  { name:'E', emoji:'⚪', min_level:1, mult:1.0 },
  { name:'D', emoji:'🟢', min_level:5, mult:1.2 },
  { name:'C', emoji:'🔵', min_level:10, mult:1.5 },
  { name:'B', emoji:'🟣', min_level:20, mult:2.0 },
  { name:'A', emoji:'🟡', min_level:30, mult:2.5 },
  { name:'S', emoji:'🔴', min_level:50, mult:3.5 },
  { name:'SS',emoji:'⭐', min_level:70, mult:5.0 },
  { name:'SSS',emoji:'💎',min_level:100, mult:8.0 },
];

function getRank(level) {
  let rank = RANKS[0];
  for (const r of RANKS) { if (level >= r.min_level) rank = r; }
  return rank;
}

// ══════════════════════════════════════════════════════════════
// SKILLS POR ORIGEM (10+ cada)
// ══════════════════════════════════════════════════════════════
const SKILLS = {
  shinobi: [
    { name:'Rasengan', emoji:'🍥', type:'atk', power:80, cost:20, desc:'Esfera de chakra rotativa' },
    { name:'Chidori', emoji:'⚡', type:'atk', power:75, cost:18, desc:'Raio na mão' },
    { name:'Sharingan', emoji:'👁️', type:'buff', power:0, cost:30, desc:'+50% crítico por 3 turnos' },
    { name:'Modo Sábio', emoji:'🐸', type:'buff', power:0, cost:40, desc:'+100% ATK por 2 turnos' },
    { name:'Rasenshuriken', emoji:'🌀', type:'atk', power:120, cost:35, desc:'Vórtice de chakra' },
    { name:'Kage Bunshin', emoji:'👥', type:'buff', power:0, cost:15, desc:'+30% esquiva' },
    { name:'Amaterasu', emoji:'🔥', type:'atk', power:100, cost:50, desc:'Chamas negras eternas' },
    { name:'Susanoo', emoji:'🛡️', type:'def', power:0, cost:60, desc:'-80% dano recebido por 2 turnos' },
    { name:'Bijuudama', emoji:'💥', type:'atk', power:150, cost:70, desc:'Bomba de bijuu' },
    { name:'Edo Tensei', emoji:'💀', type:'special', power:0, cost:80, desc:'Revive com 50% HP' },
  ],
  pirata: [
    { name:'Gomu Gomu no Pistol', emoji:'👊', type:'atk', power:60, cost:10, desc:'Soco de borracha' },
    { name:'Gear 2', emoji:'🔴', type:'buff', power:0, cost:25, desc:'+80% velocidade e ATK' },
    { name:'Gear 4', emoji:'💪', type:'buff', power:0, cost:40, desc:'+150% ATK por 3 turnos' },
    { name:'Gear 5', emoji:'🤍', type:'buff', power:0, cost:80, desc:'+300% tudo por 2 turnos' },
    { name:'Haki do Rei', emoji:'👑', type:'special', power:200, cost:60, desc:'Dano em área massivo' },
    { name:'Santoryu', emoji:'⚔️', type:'atk', power:110, cost:30, desc:'3 espadas simultâneas' },
    { name:'Gomu Gomu no Red Hawk', emoji:'🔥', type:'atk', power:95, cost:25, desc:'Soco de fogo' },
    { name:'Bara Bara no Mi', emoji:'✂️', type:'def', power:0, cost:20, desc:'Imune a cortes' },
    { name:'Gomu Gomu no King Kong Gun', emoji:'🦍', type:'atk', power:180, cost:55, desc:'Soco gigante' },
    { name:'Sulong', emoji:'🌙', type:'buff', power:0, cost:45, desc:'+200% ATK noturno' },
  ],
  cacador: [
    { name:'Adaga Dupla', emoji:'🗡️', type:'atk', power:70, cost:15, desc:'Ataque duplo' },
    { name:'Dominação', emoji:'👁️', type:'special', power:0, cost:30, desc:'Controla inimigo por 1 turno' },
    { name:'Arise', emoji:'🌑', type:'special', power:0, cost:50, desc:'Extrai sombra do boss' },
    { name:'Exército das Sombras', emoji:'💀', type:'atk', power:130, cost:45, desc:'Ataque de todas as sombras' },
    { name:'Passo Sombrio', emoji:'👣', type:'buff', power:0, cost:20, desc:'+90% esquiva por 2 turnos' },
    { name:'Corte do Monarca', emoji:'⚔️', type:'atk', power:160, cost:55, desc:'Corte que ignora defesa' },
    { name:'Berseker', emoji:'🪓', type:'buff', power:0, cost:35, desc:'+100% ATK, -50% defesa' },
    { name:'Teletransporte', emoji:'⚡', type:'buff', power:0, cost:25, desc:'Esquiva garantida 1x' },
    { name:'Ressurreição', emoji:'💀', type:'special', power:0, cost:100, desc:'Revive com 100% HP' },
    { name:'Monarca Absoluto', emoji:'👑', type:'special', power:300, cost:90, desc:'Dano devastador' },
  ],
  feiticeiro: [
    { name:'Infinito', emoji:'♾️', type:'def', power:0, cost:20, desc:'-90% dano recebido' },
    { name:'Vazio', emoji:'👁️', type:'atk', power:90, cost:25, desc:'Ataque de maldição' },
    { name:'Púrpura', emoji:'🟣', type:'atk', power:140, cost:40, desc:'Combinação azul+vermelho' },
    { name:'Domínio: Vazio Infinito', emoji:'🏛️', type:'special', power:0, cost:80, desc:'Inimigo atordoado 3 turnos' },
    { name:'Punho Negro', emoji:'👊', type:'atk', power:85, cost:15, desc:'Crítico garantido' },
    { name:'Black Flash', emoji:'⚡', type:'atk', power:120, cost:30, desc:'Dano dimensional' },
    { name:'Divergência', emoji:'🌊', type:'atk', power:70, cost:12, desc:'Ataque reverso' },
    { name:'Maldição', emoji:'💀', type:'debuff', power:0, cost:35, desc:'-50% ATK inimigo' },
    { name:'Sukuna Forma', emoji:'👹', type:'buff', power:0, cost:70, desc:'+200% ATK por 2 turnos' },
    { name:'Corte Espacial', emoji:'✂️', type:'atk', power:200, cost:60, desc:'Ignora tudo' },
  ],
  hashira: [
    { name:'Respiração da Água', emoji:'🌊', type:'atk', power:75, cost:15, desc:'Corte aquático' },
    { name:'Hinokami Kagura', emoji:'🔥', type:'atk', power:110, cost:30, desc:'Dança do fogo solar' },
    { name:'Respiração do Trovão', emoji:'⚡', type:'atk', power:85, cost:18, desc:'Corte instantâneo' },
    { name:'Respiração da Chama', emoji:'🔥', type:'atk', power:95, cost:22, desc:'Chamas devastadoras' },
    { name:'Espada Negra', emoji:'🖤', type:'buff', power:0, cost:25, desc:'+60% ATK vs demônios' },
    { name:'Marca Hashira', emoji:'⚔️', type:'buff', power:0, cost:40, desc:'+100% ATK por 3 turnos' },
    { name:'Verdadeira Respiração', emoji:'💨', type:'atk', power:140, cost:45, desc:'Todas as respirações' },
    { name:'Corte Transparente', emoji:'👁️', type:'atk', power:100, cost:28, desc:'Inimigo não vê' },
    { name:'Dança das Lâminas', emoji:'💃', type:'atk', power:120, cost:35, desc:'Múltiplos cortes' },
    { name:'Juramento', emoji:'🛡️', type:'special', power:0, cost:50, desc:'Sacrifica HP para +200% ATK' },
  ],
  saiyajin: [
    { name:'Kamehameha', emoji:'🐉', type:'atk', power:100, cost:25, desc:'Onda de energia clássica' },
    { name:'Super Saiyajin', emoji:'💛', type:'buff', power:0, cost:30, desc:'+100% todos os stats' },
    { name:'Final Flash', emoji:'💥', type:'atk', power:130, cost:35, desc:'Flash devastador' },
    { name:'Big Bang Attack', emoji:'🔵', type:'atk', power:90, cost:20, desc:'Esfera de energia' },
    { name:'Genkidama', emoji:'🌍', type:'atk', power:250, cost:80, desc:'Espírito da Terra' },
    { name:'Ultra Instinto', emoji:'⚪', type:'buff', power:0, cost:60, desc:'Esquiva automática +100%' },
    { name:'Ultra Ego', emoji:'💜', type:'buff', power:0, cost:60, desc:'+200% ATK quando ferido' },
    { name:'Kaioken', emoji:'🔴', type:'buff', power:0, cost:20, desc:'+50% ATK, -20% HP' },
    { name:'Transformação Oozaru', emoji:'🦍', type:'buff', power:0, cost:40, desc:'+150% ATK noturno' },
    { name:'Hakai', emoji:'💀', type:'special', power:500, cost:100, desc:'Destruição divina' },
  ],
};

// ══════════════════════════════════════════════════════════════
// ARMAS (20+)
// ══════════════════════════════════════════════════════════════
const WEAPONS = {
  'shuriken':       { name:'Shuriken', emoji:'⭐', base_atk:10, anime:'Naruto', effect:'Ataque rápido', price:50 },
  'kunai':          { name:'Kunai', emoji:'🗡️', base_atk:15, anime:'Naruto', effect:'Corte venenoso', price:100 },
  'katana':         { name:'Katana', emoji:'⚔️', base_atk:25, anime:'Demon Slayer', effect:'Corte limpo', price:300 },
  'enma':           { name:'Espada Enma', emoji:'⚔️', base_atk:55, anime:'One Piece', effect:'+40% com Haki', price:2000 },
  'samehada':       { name:'Samehada', emoji:'🦈', base_atk:40, anime:'Naruto', effect:'Rouba 15 CK', price:1500 },
  'zangetsu':       { name:'Zangetsu', emoji:'⚔️', base_atk:60, anime:'Bleach', effect:'Corte espiritual', price:3000 },
  'kasaka':         { name:'Espada de Kasaka', emoji:'🐍', base_atk:35, anime:'Solo Leveling', effect:'Sangramento +15%', price:800 },
  'lanca_ceu':      { name:'Lança do Céu', emoji:'🔱', base_atk:50, anime:'Jujutsu Kaisen', effect:'Anula defesas', price:2500 },
  'nichirin':       { name:'Espada Nichirin', emoji:'🗡️', base_atk:45, anime:'Demon Slayer', effect:'+50% vs demônios', price:1800 },
  'esfera_dragao':  { name:'Esfera do Dragão', emoji:'🔮', base_atk:100, anime:'Dragon Ball', effect:'+50% stats', price:50000 },
  'hilt_benimaru':  { name:'Hilt de Benimaru', emoji:'🔥', base_atk:38, anime:'Fire Force', effect:'Chama +20%', price:900 },
  'espada_madaras': { name:'Espada do Madara', emoji:'👁️', base_atk:75, anime:'Naruto', effect:'Sharingan: crítico +30%', price:5000 },
  'wado_ichimonji': { name:'Wado Ichimonji', emoji:'⚔️', base_atk:42, anime:'One Piece', effect:'Corte perfeito', price:1200 },
  'zangetsu_bankai':{ name:'Zangetsu Bankai', emoji:'⚔️', base_atk:80, anime:'Bleach', effect:'Bankai: +100% ATK', price:8000 },
  'lampiao':        { name:'Lampião de Sombra', emoji:'🌑', base_atk:30, anime:'Solo Leveling', effect:'Sombra: +25% ATK noturno', price:600 },
  'cajado_gojo':    { name:'Cajado de Gojo', emoji:'🪄', base_atk:55, anime:'Jujutsu Kaisen', effect:'Infinito: -30% dano', price:3000 },
  'machado_thor':   { name:'Machado do Thor', emoji:'🪓', base_atk:90, anime:'Marvel', effect:'Trovão: +50% vs bosses', price:12000 },
  'espada_kratos':  { name:'Espada do Kratos', emoji:'⚔️', base_atk:95, anime:'God of War', effect:'Fúria: +80% quando HP <30%', price:15000 },
  'vara_pescar':    { name:'Vara de Pescar', emoji:'🎣', base_atk:5, anime:'One Piece', effect:'Pesca: +50% loot', price:200 },
  'punhos_saitama': { name:'Punhos do Saitama', emoji:'👊', base_atk:999, anime:'One Punch Man', effect:'One Punch: kill instantâneo', price:999999 },
};

// ══════════════════════════════════════════════════════════════
// BOSSES (15+)
// ══════════════════════════════════════════════════════════════
const BOSSES = {
  'SSS': { name:'Madara Susanoo Perfeito', emoji:'👁️', anime:'Naruto', hp:5000, atk:200, def:80, xp:8000, berries:200000, shadowRank:'SSS' },
  'SS':  { name:'Kaido Forma Dragão', emoji:'🐉', anime:'One Piece', hp:3000, atk:150, def:60, xp:4000, berries:100000, shadowRank:'SS' },
  'S':   { name:'Ryomen Sukuna', emoji:'👹', anime:'Jujutsu Kaisen', hp:1200, atk:85, def:30, xp:1500, berries:50000, shadowRank:'S' },
  'A':   { name:'Muzan Kibutsuji', emoji:'🧛', anime:'Demon Slayer', hp:900, atk:70, def:45, xp:900, berries:30000, shadowRank:'A' },
  'B':   { name:'Pain / Nagato', emoji:'🍥', anime:'Naruto', hp:600, atk:55, def:20, xp:500, berries:15000, shadowRank:'B' },
  'C':   { name:'Frieza Forma Final', emoji:'👽', anime:'Dragon Ball', hp:500, atk:48, def:18, xp:400, berries:12000, shadowRank:'C' },
  'D':   { name:'Goblin King', emoji:'👺', anime:'Solo Leveling', hp:200, atk:25, def:10, xp:100, berries:3000, shadowRank:'D' },
};

// ══════════════════════════════════════════════════════════════
// CARTAS GACHA (50+)
// ══════════════════════════════════════════════════════════════
const CARD_CATALOG = [
  // ── MÍTICO (3%) ──
  { id:'luffy-g5', name:'Luffy Gear 5', anime:'One Piece', rarity:'Mítico', atk:40, hp:30, trait:'Toon Force: esquiva 30%' },
  { id:'gojo-inf', name:'Gojo Satoru', anime:'Jujutsu Kaisen', rarity:'Mítico', atk:35, hp:25, trait:'Infinito: -50% dano' },
  { id:'jinwoo', name:'Sung Jin-Woo', anime:'Solo Leveling', rarity:'Mítico', atk:38, hp:28, trait:'Arise: +1 sombra' },
  { id:'goku-ui', name:'Goku Ultra Instinto', anime:'Dragon Ball', rarity:'Mítico', atk:45, hp:25, trait:'Esquiva automática' },
  { id:'saitama', name:'Saitama', anime:'One Punch Man', rarity:'Mítico', atk:50, hp:20, trait:'One Punch: kill 1 turno' },
  // ── LENDÁRIO (12%) ──
  { id:'goku-ssj', name:'Goku SSJ', anime:'Dragon Ball', rarity:'Lendário', atk:30, hp:20, trait:'Kamehameha +50%' },
  { id:'naruto-kurama', name:'Naruto Kurama', anime:'Naruto', rarity:'Lendário', atk:28, hp:22, trait:'Rasenshuriken: crítico +20%' },
  { id:'zoro-3sword', name:'Zoro Santoryu', anime:'One Piece', rarity:'Lendário', atk:32, hp:18, trait:'3 cortes por turno' },
  { id:'sasuke-rinne', name:'Sasuke Rinnegan', anime:'Naruto', rarity:'Lendário', atk:30, hp:20, trait:'Amaterasu: queima' },
  { id:'jinwoo-shadow', name:'Jin-Woo Monarca', anime:'Solo Leveling', rarity:'Lendário', atk:33, hp:22, trait:'Exército das Sombras' },
  { id:'itadori-sukuna', name:'Itadori + Sukuna', anime:'Jujutsu Kaisen', rarity:'Lendário', atk:34, hp:20, trait:'Corte Espacial' },
  { id:'tanjiro-sun', name:'Tanjiro Solar', anime:'Demon Slayer', rarity:'Lendário', atk:28, hp:24, trait:'Hinokami Kagura' },
  { id:'vegeta-blue', name:'Vegeta SSB', anime:'Dragon Ball', rarity:'Lendário', atk:31, hp:19, trait:'Final Flash +40%' },
  { id:'ace-fire', name:'Portgas D. Ace', anime:'One Piece', rarity:'Lendário', atk:27, hp:21, trait:'Mera Mera no Mi' },
  { id:'kakashi-ms', name:'Kakashi MS', anime:'Naruto', rarity:'Lendário', atk:26, hp:20, trait:'Kamui: teleporta' },
  // ── ÉPICO (35%) ──
  { id:'tanjiro', name:'Tanjiro Hinokami', anime:'Demon Slayer', rarity:'Épico', atk:20, hp:15, trait:'Respiração: +25% ATK' },
  { id:'vegeta-ue', name:'Vegeta Ultra Ego', anime:'Dragon Ball', rarity:'Épico', atk:25, hp:20, trait:'Final Flash: +100% no último HP' },
  { id:'rengoku', name:'Rengoku', anime:'Demon Slayer', rarity:'Épico', atk:22, hp:18, trait:'Chama: +30% vs bosses' },
  { id:'sanji', name:'Sanji Diable Jambe', anime:'One Piece', rarity:'Épico', atk:21, hp:16, trait:'Fogo: +25% ATK' },
  { id:'hinata', name:'Hinata Byakugan', anime:'Naruto', rarity:'Épico', atk:18, hp:22, trait:'Gentle Fist: -20% def inimigo' },
  { id:'megumi', name:'Megumi + Mahoraga', anime:'Jujutsu Kaisen', rarity:'Épico', atk:24, hp:17, trait:'Invocação: +50% ATK' },
  { id:'cha-hae', name:'Cha Hae-In', anime:'Solo Leveling', rarity:'Épico', atk:20, hp:19, trait:'Espada: crítico +25%' },
  { id:'nezuko', name:'Nezuko', anime:'Demon Slayer', rarity:'Épico', atk:16, hp:25, trait:'Cura: +10% HP por turno' },
  { id:'luffy-g4', name:'Luffy Gear 4', anime:'One Piece', rarity:'Épico', atk:23, hp:17, trait:'Boundman: +40% ATK' },
  { id:'boruto', name:'Boruto Jougan', anime:'Boruto', rarity:'Épico', atk:19, hp:16, trait:'Jougan: vê fraquezas' },
  { id:'asta', name:'Asta Anti-Magia', anime:'Black Clover', rarity:'Épico', atk:22, hp:20, trait:'Anula magia inimiga' },
  { id:'ichigo', name:'Ichigo Bankai', anime:'Bleach', rarity:'Épico', atk:24, hp:18, trait:'Getsuga Tensho' },
  // ── RARO (50%) ──
  { id:'itadori-bf', name:'Itadori BF', anime:'Jujutsu Kaisen', rarity:'Raro', atk:15, hp:12, trait:'Black Flash: crítico garantido' },
  { id:'igris', name:'Igris', anime:'Solo Leveling', rarity:'Raro', atk:14, hp:14, trait:'Proteção: -20% dano' },
  { id:'usopp', name:'Usopp Sogeking', anime:'One Piece', rarity:'Raro', atk:12, hp:10, trait:'Tiro longo: +30% vs voadores' },
  { id:'sakura', name:'Sakura', anime:'Naruto', rarity:'Raro', atk:10, hp:20, trait:'Cura: +15% HP por turno' },
  { id:'nobara', name:'Nobara', anime:'Jujutsu Kaisen', rarity:'Raro', atk:13, hp:11, trait:'Boneca: dano contínuo' },
  { id:'zenitsu', name:'Zenitsu', anime:'Demon Slayer', rarity:'Raro', atk:16, hp:10, trait:'Thunder: ataque instantâneo' },
  { id:'krillin', name:'Krillin', anime:'Dragon Ball', rarity:'Raro', atk:11, hp:12, trait:'Destructo Disc: ignora def' },
  { id:'yajirobe', name:'Yajirobe', anime:'Dragon Ball', rarity:'Raro', atk:8, hp:15, trait:'Cura: +20% HP' },
  { id:'chopper', name:'Chopper', anime:'One Piece', rarity:'Raro', atk:9, hp:18, trait:'Monster Point: +50% ATK' },
  { id:'shikamaru', name:'Shikamaru', anime:'Naruto', rarity:'Raro', atk:12, hp:13, trait:'Estratégia: +20% crítico' },
];

// ══════════════════════════════════════════════════════════════
// DAILY REWARDS
// ══════════════════════════════════════════════════════════════
const DAILY_REWARDS = {
  1:  { berries:500, crystals:10, xp:50 },
  3:  { berries:1000, crystals:25, xp:150 },
  7:  { berries:3000, crystals:50, xp:500, item:'poção de vida' },
  14: { berries:5000, crystals:100, xp:1000, item:'pedra de proteção' },
  30: { berries:15000, crystals:300, xp:3000, item:'Espada de Kasaka' },
};

// ══════════════════════════════════════════════════════════════
// ACHIEVEMENTS
// ══════════════════════════════════════════════════════════════
const ACHIEVEMENTS = [
  { id:'first_kill', name:'Primeiro Abate', desc:'Derrote seu primeiro inimigo', reward:{xp:50} },
  { id:'level_10', name:'Veterano', desc:'Alcance nível 10', reward:{berries:1000} },
  { id:'level_50', name:'Lendário', desc:'Alcance nível 50', reward:{berries:10000, crystals:100} },
  { id:'boss_slayer', name:'Caçador de Bosses', desc:'Derrote 10 bosses', reward:{berries:5000} },
  { id:'gacha_10', name:'Colecionador', desc:'Tenha 10 cartas no álbum', reward:{berries:2000} },
  { id:'rich', name:'Milionário', desc:'Tenha 100.000 berries', reward:{crystals:200} },
  { id:'shadow_army', name:'Exército das Sombras', desc:'Tenha 5 sombras', reward:{berries:5000} },
  { id:'pvp_winner', name:'Arena Champion', desc:'Vença 5 duelos PvP', reward:{berries:3000} },
  { id:'streak_7', name:'Fogo Consistente', desc:'7 dias de streak', reward:{berries:2000, crystals:50} },
  { id:'craftsman', name:'Mestre Ferreiro', desc:'Refine uma arma para +5', reward:{berries:5000} },
];

// ══════════════════════════════════════════════════════════════
// LOJA
// ══════════════════════════════════════════════════════════════
const SHOP = {
  'pocao':   { id:'pocao_hp', name:'Poção de Vida Sênzu', price:300, desc:'Restaura 100% HP', type:'HEAL_HP' },
  'chakra':  { id:'pocao_ck', name:'Elixir de Chakra', price:250, desc:'Restaura 100% Energia', type:'HEAL_ENERGY' },
  'pedra':   { id:'pedra_protecao', name:'Pedra de Proteção', price:1500, desc:'Protege arma na forja', type:'PROTECTION' },
  'xp':      { id:'pocao_xp', name:'Poção de XP', price:500, desc:'+500 XP', type:'XP' },
  'gacha':   { id:'gacha_ticket', name:'Ticket Gacha', price:300, desc:'1 invocação de carta', type:'GACHA' },
  'revive':  { id:'revive', name:'Poção de Reviver', price:1000, desc:'Revive com 100% HP', type:'REVIVE' },
};

// ══════════════════════════════════════════════════════════════
// REFINAMENTO
// ══════════════════════════════════════════════════════════════
const REFINEMENT = [
  { target:1, cost:300, crystals:5, chance:95 },
  { target:2, cost:500, crystals:10, chance:85 },
  { target:3, cost:800, crystals:15, chance:75 },
  { target:4, cost:1200, crystals:20, chance:65 },
  { target:5, cost:2000, crystals:30, chance:50 },
  { target:6, cost:3500, crystals:45, chance:40 },
  { target:7, cost:5000, crystals:60, chance:30 },
  { target:8, cost:8000, crystals:80, chance:20 },
  { target:9, cost:12000, crystals:100, chance:15 },
  { target:10, cost:20000, crystals:150, chance:10 },
];

// ══════════════════════════════════════════════════════════════
// PLAYER (MongoDB)
// ══════════════════════════════════════════════════════════════
const _cache = new Map();

async function getPlayer(number) {
  const num = String(number).replace(/\D/g, '');
  if (_cache.has(num)) return _cache.get(num);
  const RPGPlayer = require('../../database/models/RPGPlayer');
  let p = await RPGPlayer.findOne({ whatsappNumber: num });
  if (!p) p = await RPGPlayer.getOrCreate(num);

  // v6.62: garante os campos que os cases assumem existir.
  // Jogadores criados por versões antigas do schema não tinham
  // `inventory` e o `.minerar` rebentava com
  // "Cannot read properties of undefined (reading 'push')".
  if (p) {
    if (!Array.isArray(p.inventory)) p.inventory = [];
    if (!Array.isArray(p.items)) p.items = [];
    if (typeof p.level !== 'number') p.level = 1;
    if (typeof p.xp !== 'number') p.xp = 0;
    if (typeof p.hp !== 'number') p.hp = 100;
    if (typeof p.maxHp !== 'number') p.maxHp = p.hp || 100;
    if (typeof p.kills !== 'number') p.kills = 0;
    if (typeof p.deaths !== 'number') p.deaths = 0;
    if (!p.name) p.name = 'Aventureiro';
  }

  _cache.set(num, p);
  return p;
}

async function savePlayer(p) {
  try {
    await p.save();
    _cache.set(String(p.whatsappNumber).replace(/\D/g, ''), p);
  } catch (e) {
    console.warn('[RPG] save:', e.message?.slice(0, 50));
  }
}

function addXP(p, amount) {
  p.xp += amount;
  let leveled = false;
  while (p.xp >= p.xpNext) {
    p.xp -= p.xpNext;
    p.level++;
    p.xpNext = p.level * 100 + p.level * p.level * 10;
    p.maxHp += 10 + (p.stats?.vit || 5) * 2;
    p.maxMp += 5 + (p.stats?.int || 5);
    p.hp = p.maxHp;
    p.mp = p.maxMp;
    const stats = ['str','dex','int','vit','luk'];
    p.stats[stats[Math.floor(Math.random() * stats.length)]]++;
    leveled = true;
  }
  return leveled;
}

function hpBar(current, max, len = 10) {
  const filled = Math.max(0, Math.min(len, Math.round((current / max) * len)));
  return '█'.repeat(filled) + '░'.repeat(len - filled);
}


// ══════════════════════════════════════════════════════════════
// v6.62 — CAMADA DE COMPATIBILIDADE
// O engine v7 (adaptado do NazumaMarce) trouxe ORIGINS/RANKS/SKILLS
// e substituiu o modelo antigo. Mas o cases/rpg2.js continua a usar
// RACES, CLASSES, BIOMES, QUESTS e generateEnemy — 13 referências.
// Sem isto, 7 comandos rebentavam em produção:
//   .minerar  → "Cannot read properties of undefined (reading 'montanha')"
//   .dungeon  → "rpg.generateEnemy is not a function"
//   .classes  → "Cannot convert undefined or null to object"
//   (+ pescar, arena, rankrpg, forjar)
// Em vez de reescrever o rpg2.js inteiro, mapeamos o que falta.
// ══════════════════════════════════════════════════════════════

// RACES ← derivadas das ORIGINS do v7
const RACES = {};
for (const [k, v] of Object.entries(ORIGINS || {})) {
  RACES[k] = {
    emoji: v.emoji || '🧬',
    desc: v.desc || v.name || k,
    bonus: v.bonus || { str: 1, dex: 1, int: 1, vit: 1, luk: 1 },
  };
}
if (!RACES.humano) {
  RACES.humano = { emoji: '🧑', desc: 'Equilibrado em tudo', bonus: { str: 2, dex: 2, int: 2, vit: 2, luk: 2 } };
}

// CLASSES ← as origens também servem de classe (o v7 fundiu os dois)
const CLASSES = {};
for (const [k, v] of Object.entries(ORIGINS || {})) {
  CLASSES[k] = {
    emoji: v.emoji || '⚔️',
    desc: v.desc || v.name || k,
    primary: v.primary || (v.bonus ? Object.entries(v.bonus).sort((a, b) => b[1] - a[1])[0][0] : 'str'),
  };
}
if (!CLASSES.guerreiro) {
  CLASSES.guerreiro = { emoji: '⚔️', desc: 'Força bruta e resistência', primary: 'str' };
}

// BIOMES — usados por .explorar, .minerar, .pescar e .biomas
const BIOMES = {
  floresta:  { emoji: '🌲', desc: 'Mata densa e silenciosa',   nivel: 1,  loot: ['madeira', 'erva', 'cogumelo'] },
  montanha:  { emoji: '⛰️', desc: 'Picos gelados e minas',      nivel: 5,  loot: ['ferro', 'carvão', 'pedra'] },
  praia:     { emoji: '🏖️', desc: 'Areia branca e maré calma',  nivel: 3,  loot: ['concha', 'peixe', 'pérola'] },
  caverna:   { emoji: '🕳️', desc: 'Escuridão e ecos',           nivel: 8,  loot: ['cristal', 'ouro', 'osso'] },
  deserto:   { emoji: '🏜️', desc: 'Sol implacável',             nivel: 12, loot: ['areia', 'cacto', 'relíquia'] },
  pantano:   { emoji: '🐊', desc: 'Lama e criaturas',           nivel: 15, loot: ['veneno', 'raiz', 'sanguessuga'] },
  vulcao:    { emoji: '🌋', desc: 'Lava e cinzas',              nivel: 20, loot: ['obsidiana', 'enxofre', 'rubi'] },
  abismo:    { emoji: '🌑', desc: 'O fundo do mundo',           nivel: 30, loot: ['fragmento sombrio', 'alma'] },
};
// .mapa usa v.danger para desenhar os avisos
for (const b of Object.values(BIOMES)) {
  b.danger = Math.max(1, Math.min(5, Math.ceil(b.nivel / 6)));
}

// NPCS — usados por .npc / .falar
// v6.90: `dialogues` acrescentado — o `.npc` fazia `P(npc.dialogues)` sobre
// um campo que não existia e rebentava com "Cannot read properties of
// undefined (reading 'length')". O `fala` mantém-se para quem já o usava.
const NPCS = {
  ferreiro:  { emoji: '🔨', name: 'Grom, o Ferreiro',   fala: 'Traz-me ferro e eu faço-te uma lâmina que corta a noite.',
    dialogues: ['Traz-me ferro e eu faço-te uma lâmina que corta a noite.',
                'Já forjei armas para heróis. E para tolos. O aço não distingue.',
                'Três ferros e uma madeira — é o que pede uma espada honesta.'] },
  taverneira:{ emoji: '🍺', name: 'Mara da Taverna',    fala: 'Senta-te. Ouvi coisas sobre as cavernas a norte...',
    dialogues: ['Senta-te. Ouvi coisas sobre as cavernas a norte...',
                'A primeira rodada é por minha conta. A segunda paga-se.',
                'O viajante de ontem voltou sem um braço. Bebe e vai-te embora.'] },
  mago:      { emoji: '🧙', name: 'Velho Aldric',       fala: 'O poder tem preço. Estás pronto para pagar?',
    dialogues: ['O poder tem preço. Estás pronto para pagar?',
                'Li o teu destino esta manhã. Não gostei do fim.',
                'A magia não é um dom — é um empréstimo. Cobra juros.'] },
  mercador:  { emoji: '💰', name: 'Zeno, o Mercador',   fala: 'Tudo tem preço, amigo. Até o silêncio.',
    dialogues: ['Tudo tem preço, amigo. Até o silêncio.',
                'Compro, vendo e finjo que não sei de onde vem.',
                'Para ti, um desconto. Para os outros, o dobro.'] },
  curandeira:{ emoji: '💚', name: 'Irmã Elina',         fala: 'Deixa-me ver essas feridas. Não sejas teimoso.',
    dialogues: ['Deixa-me ver essas feridas. Não sejas teimoso.',
                'Bebe a poção ANTES de precisares dela. Depois é tarde.',
                'Já enterrei heróis que achavam que descansavam mais tarde.'] },
  guarda:    { emoji: '🛡️', name: 'Capitão Rurik',      fala: 'Mantém-te longe de sarilhos e ficamos bem.',
    dialogues: ['Mantém-te longe de sarilhos e ficamos bem.',
                'Vi coisas no abismo que não digo em voz alta.',
                'Se ouvires o teu nome lá em baixo, não respondas.'] },
};

// ══════════════════════════════════════════════════════════
// v6.90 — CATÁLOGO DE ITENS
// O `.eat`, o `.vender` e a `.loja` liam `rpg.ITEMS[...]`, um catálogo que
// nunca existiu no motor (só havia SHOP, keyed por id curto e sem relação
// com os nomes que vão para o inventário). Resultado em produção:
//   .eat   → "Cannot read properties of undefined (reading 'peixe')"
//   .loja  → "Cannot convert undefined or null to object"
// As chaves são EXACTAMENTE os nomes que os biomas e as quests metem no
// inventário — senão o jogador apanha o loot e nunca o consegue vender.
// ══════════════════════════════════════════════════════════
const ITEMS = {
  // consumíveis
  'poção de vida':     { emoji: '🧪', price: 120, type: 'heal', effect: { hp: 60 } },
  'poção de mana':     { emoji: '💙', price: 140, type: 'heal', effect: { mp: 50 } },
  'erva medicinal':    { emoji: '🌿', price: 45,  type: 'food', effect: { hp: 20 } },
  'erva':              { emoji: '🌿', price: 18,  type: 'food', effect: { hp: 8 } },
  'peixe':             { emoji: '🐟', price: 35,  type: 'food', effect: { hp: 25 } },
  'cogumelo':          { emoji: '🍄', price: 25,  type: 'food', effect: { hp: 12 } },
  'pão':               { emoji: '🍞', price: 20,  type: 'food', effect: { hp: 15 } },
  'carne':             { emoji: '🍖', price: 55,  type: 'food', effect: { hp: 40 } },
  'concha':            { emoji: '🐚', price: 30,  type: 'food', effect: { hp: 10 } },
  // materiais (loot dos biomas)
  'madeira':           { emoji: '🪵', price: 15 },
  'ferro':             { emoji: '⛓️', price: 60 },
  'pedra':             { emoji: '🪨', price: 10 },
  'carvão':            { emoji: '⚫', price: 25 },
  'cristal':           { emoji: '💎', price: 180 },
  'ouro':              { emoji: '🟡', price: 220 },
  'osso':              { emoji: '🦴', price: 18 },
  'areia':             { emoji: '🏜️', price: 8 },
  'cacto':             { emoji: '🌵', price: 22 },
  'veneno':            { emoji: '☠️', price: 90 },
  'raiz':              { emoji: '🌱', price: 20 },
  'sanguessuga':       { emoji: '🪱', price: 35 },
  'obsidiana':         { emoji: '🌋', price: 300 },
  'enxofre':           { emoji: '🧨', price: 120 },
  'rubi':              { emoji: '🔴', price: 400 },
  'pérola':            { emoji: '🫧', price: 260 },
  'relíquia':          { emoji: '🏺', price: 500 },
  'fragmento sombrio': { emoji: '🌑', price: 700 },
  'alma':              { emoji: '👻', price: 900 },
  // raros
  'pedra preciosa':    { emoji: '💠', price: 350 },
  'amuleto antigo':    { emoji: '📿', price: 480 },
  'semente':           { emoji: '🌰', price: 12 },
};

// QUESTS — histórias curtas com escolhas
const QUESTS = [
  {
    id: 'inicio', titulo: 'O Chamado',
    texto: 'Um mensageiro encapuzado estende-te um pergaminho selado. "Só tu podes ler isto."',
    escolhas: [
      { txt: 'Abrir o pergaminho', next: 'pergaminho', xp: 20 },
      { txt: 'Recusar e ir embora', next: null, xp: 5 },
    ],
  },
  {
    id: 'pergaminho', titulo: 'O Selo Quebrado',
    texto: 'O papel arde ao toque. Uma marca fica-te na palma da mão.',
    escolhas: [
      { txt: 'Seguir a marca', next: null, xp: 50, item: 'marca antiga' },
      { txt: 'Tentar apagá-la', next: null, xp: 15 },
    ],
  },
];

/**
 * Gera um inimigo de acordo com o nível. Usa os BOSSES do v7 quando
 * o nível é alto; senão monta um inimigo comum.
 */
function generateEnemy(level = 1, tipo = null) {
  const lvl = Math.max(1, Math.floor(level));

  // nível alto → tenta um boss real do catálogo v7
  if (lvl >= 25 && BOSSES) {
    const pool = Array.isArray(BOSSES)
      ? BOSSES
      : Object.values(BOSSES).flat().filter(Boolean);
    if (pool.length) {
      const b = pool[Math.floor(Math.random() * pool.length)];
      if (b) {
        const nomeBoss = b.name || b.nome || 'Boss';
        return {
          // v6.62: o cases/rpg2.js usa .name/.level; outros usam
          // .nome/.nivel. Devolvemos os dois para não partir nenhum.
          nome: nomeBoss, name: nomeBoss,
          emoji: b.emoji || '💀',
          nivel: lvl, level: lvl,
          hp: b.hp || lvl * 40,
          maxHp: b.hp || lvl * 40,
          atk: b.atk || lvl * 6,
          def: b.def || lvl * 3,
          xp: b.xp || lvl * 30,
          gold: b.gold || lvl * 25,
          boss: true,
        };
      }
    }
  }

  const comuns = [
    { nome: 'Goblin',     emoji: '👺' }, { nome: 'Lobo Sombrio', emoji: '🐺' },
    { nome: 'Esqueleto',  emoji: '💀' }, { nome: 'Slime',        emoji: '🟢' },
    { nome: 'Bandido',    emoji: '🗡️' }, { nome: 'Aranha Gigante', emoji: '🕷️' },
    { nome: 'Espectro',   emoji: '👻' }, { nome: 'Ogro',         emoji: '👹' },
  ];
  const e = comuns[Math.floor(Math.random() * comuns.length)];
  const hp = lvl * 18 + 30;

  const nomeFinal = tipo && tipo !== 'normal' && tipo !== 'boss' && tipo !== 'elite' ? tipo : e.nome;
  return {
    nome: nomeFinal, name: nomeFinal,
    emoji: e.emoji, nivel: lvl, level: lvl,
    hp, maxHp: hp,
    atk: lvl * 4 + 5, def: lvl * 2 + 2,
    xp: lvl * 12 + 10, gold: lvl * 8 + 5,
    boss: false,
  };
}


/**
 * v6.62: calcDamage — usado por .dungeon e .arena.
 * O engine v7 não o trouxe e os dois comandos rebentavam com
 * "rpg.calcDamage is not a function".
 */
function calcDamage(atacante, alvo, skill = 'basic') {
  const atk = Number(atacante?.atk ?? atacante?.str ?? 10);
  const def = Number(alvo?.def ?? alvo?.vit ?? 5);

  // multiplicador por tipo de golpe
  const mult = skill === 'basic' ? 1
    : skill === 'forte' || skill === 'heavy' ? 1.6
    : skill === 'especial' || skill === 'ultimate' ? 2.2
    : 1.2;

  const base = Math.max(1, atk * mult - def * 0.5);
  const variacao = 0.85 + Math.random() * 0.3;      // ±15%
  const critico = Math.random() < 0.12;             // 12% de crítico

  const dano = Math.max(1, Math.round(base * variacao * (critico ? 1.8 : 1)));
  return { dano, dmg: dano, critico, crit: critico, skill };
}


// RECIPES — usadas por .forjar / .forge (cases/economia2.js).
// O engine v7 tem WEAPONS e REFINEMENT mas não receitas de crafting,
// e o comando rebentava com "Cannot convert undefined or null to object".
const RECIPES = {
  'espada de ferro':   { emoji: '⚔️', ingredients: { ferro: 3, madeira: 1 },            atk: 12, valor: 150 },
  'escudo de ferro':   { emoji: '🛡️', ingredients: { ferro: 4, madeira: 2 },            def: 10, valor: 140 },
  'arco longo':        { emoji: '🏹', ingredients: { madeira: 4, erva: 2 },             atk: 10, valor: 120 },
  'cajado arcano':     { emoji: '🔮', ingredients: { madeira: 2, cristal: 2 },          atk: 15, valor: 220 },
  'armadura de couro': { emoji: '🥋', ingredients: { couro: 5, ferro: 1 },              def: 8,  valor: 130 },
  'poção de vida':     { emoji: '🧪', ingredients: { erva: 3, cogumelo: 1 },            cura: 50, valor: 60 },
  'poção de mana':     { emoji: '💙', ingredients: { erva: 2, cristal: 1 },             mana: 40, valor: 70 },
  'lâmina sombria':    { emoji: '🗡️', ingredients: { obsidiana: 3, 'fragmento sombrio': 1 }, atk: 30, valor: 600 },
  'anel de sorte':     { emoji: '💍', ingredients: { ouro: 2, rubi: 1 },                luk: 5,  valor: 400 },
  'elmo de aço':       { emoji: '⛑️', ingredients: { ferro: 5, couro: 2 },              def: 12, valor: 180 },
};


/**
 * v6.62: generateLoot — só era chamado quando o jogador VENCIA o
 * combate, por isso o erro aparecia de forma intermitente (6 em 25
 * execuções do .dungeon). Fácil de não notar num teste único.
 */
function generateLoot(enemyOrLevel = 1, levelArg = 1) {
  // aceita as duas assinaturas usadas no código:
  //   generateLoot(enemy, playerLevel)   ← cases/economia2.js
  //   generateLoot(level, boss)
  const ehObjecto = enemyOrLevel && typeof enemyOrLevel === 'object';
  const level = ehObjecto
    ? (enemyOrLevel.nivel || enemyOrLevel.level || levelArg || 1)
    : (Number(enemyOrLevel) || 1);
  const boss = ehObjecto ? !!enemyOrLevel.boss : !!levelArg;

  const comuns  = ['erva', 'cogumelo', 'madeira', 'pedra', 'couro', 'osso'];
  const raros   = ['ferro', 'cristal', 'carvão', 'pérola', 'rubi'];
  const epicos  = ['obsidiana', 'fragmento sombrio', 'relíquia', 'alma'];

  const qtd = boss ? 3 : (Math.random() < 0.35 ? 2 : 1);
  const drops = [];

  for (let i = 0; i < qtd; i++) {
    const sorte = Math.random() + (level / 200) + (boss ? 0.25 : 0);
    const pool = sorte > 0.9 ? epicos : sorte > 0.6 ? raros : comuns;
    drops.push(pool[Math.floor(Math.random() * pool.length)]);
  }

  // v6.62: o cases/economia2.js faz `loot.forEach(i => inventory.push(i))`
  // — espera um ARRAY de itens. Devolvemos o array com as
  // propriedades gold/xp anexadas, para servir os dois usos.
  const resultado = drops.slice();
  resultado.items = drops;
  resultado.itens = drops;
  resultado.gold = Math.round((level * 8 + 5) * (boss ? 3 : 1) * (0.8 + Math.random() * 0.4));
  resultado.xp = Math.round((level * 12 + 10) * (boss ? 2.5 : 1));
  return resultado;
}

module.exports = {
  ORIGINS, RANKS, SKILLS, WEAPONS, BOSSES, CARD_CATALOG, RARITY_WEIGHTS: [
    { rarity:'Mítico', chance:3, emoji:'🔴' },
    { rarity:'Lendário', chance:12, emoji:'🟡' },
    { rarity:'Épico', chance:35, emoji:'🟣' },
    { rarity:'Raro', chance:100, emoji:'🔵' },
  ],
  SHOP, REFINEMENT, DAILY_REWARDS, ACHIEVEMENTS,
  ITEMS,   // v6.90: o catálogo que faltava (eat/vender/loja)
  // v6.62: compatibilidade com cases/rpg2.js
  RACES, CLASSES, BIOMES, QUESTS, NPCS, RECIPES, generateEnemy, calcDamage, generateLoot,
  getRank, addXP, hpBar,
  getPlayer, savePlayer,
  _cache,
};
