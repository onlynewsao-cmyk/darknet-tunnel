/**
 * DARK BOT v7.7 — Medidores & Rankings (bulk)
 *
 * Converte TODOS os medidores de zoeira (hZ) e rankings (hR) que eram
 * stubs fake (% aleatória sem GIF) em medidores REAIS com GIF + aura,
 * e rankings reais do grupo.
 */
'use strict';

const Economy = require('../../database/models/Economy');
const { sendWithGif } = require('../gifHelper');

const reply = (sock, msg, ctx, text, mentions = []) =>
  sock.sendMessage(ctx.remoteJid, { text, mentions }, { quoted: msg });
const pick = a => a[Math.floor(Math.random() * a.length)];
const randInt = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;

function getMentions(msg) {
  return msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
}

async function addAura(number, name, amount = 1) {
  try {
    const eco = await Economy.getOrCreate(number, name);
    eco.aura = (eco.aura || 0) + amount;
    eco.xp = (eco.xp || 0) + Math.max(1, Math.floor(amount / 2));
    await eco.save();
    return eco;
  } catch { return null; }
}

// ── [comando, emoji, adjectivo, categoria-gif] ──
const M = [
  ['analogica', '📼', 'Analógica', 'retro'], ['analogico', '📼', 'Analógico', 'retro'],
  ['antisocial', '🚪', 'Antissocial', 'lonely'], ['aventureira', '🗺️', 'Aventureira', 'adventure'], ['aventureiro', '🗺️', 'Aventureiro', 'adventure'],
  ['azarada', '🖤', 'Azarada', 'unlucky'], ['azarado', '🖤', 'Azarado', 'unlucky'],
  ['bagunceira', '🌀', 'Bagunceira', 'messy'], ['bagunceiro', '🌀', 'Bagunceiro', 'messy'],
  ['bebada', '🍺', 'Bêbada', 'drunk'], ['bebado', '🍺', 'Bêbado', 'drunk'],
  ['bilionaria', '🤑', 'Bilionária', 'rich'], ['billionario', '🤑', 'Bilionário', 'rich'],
  ['boba', '🤪', 'Boba', 'silly'], ['bobo', '🤪', 'Bobo', 'silly'],
  ['bolsonarista', '🟢', 'Bolsonarista', 'flag'], ['bombada', '💪', 'Bombada', 'muscle'], ['bombado', '💪', 'Bombado', 'muscle'],
  ['braba', '🔥', 'Braba', 'fierce'], ['brabo', '🔥', 'Brabo', 'fierce'],
  ['brincalhao', '🎈', 'Brincalhão', 'playful'], ['brincalhona', '🎈', 'Brincalhona', 'playful'],
  ['bucetuda', '🍑', 'Bucetuda', 'hot'], ['burra', '🧠', 'Burra', 'dumb'],
  ['cachorra', '🐶', 'Cachorra', 'dog'], ['cachorro', '🐶', 'Cachorro', 'dog'],
  ['calma', '😌', 'Calma', 'calm'], ['calmo', '😌', 'Calmo', 'calm'],
  ['carinhosa', '💗', 'Carinhosa', 'affectionate'], ['carinhoso', '💗', 'Carinhoso', 'affectionate'],
  ['caseira', '🏠', 'Caseira', 'home'], ['caseiro', '🏠', 'Caseiro', 'home'],
  ['cetica', '🤨', 'Cética', 'skeptic'], ['cetico', '🤨', 'Cético', 'skeptic'],
  ['charmosa', '✨', 'Charmosa', 'charming'], ['charmoso', '✨', 'Charmoso', 'charming'],
  ['chata', '🙄', 'Chata', 'annoying'], ['chato', '🙄', 'Chato', 'annoying'],
  ['chefe', '👔', 'Chefe', 'boss'], ['chorao', '😭', 'Chorão', 'cry'], ['chorona', '😭', 'Chorona', 'cry'],
  ['ciumenta', '😤', 'Ciumenta', 'jealous'], ['ciumento', '😤', 'Ciumento', 'jealous'],
  ['comedia', '🎭', 'Comédia', 'comedy'], ['comilao', '🍔', 'Comilão', 'eating'], ['comilona', '🍔', 'Comilona', 'eating'],
  ['comunista', '☭', 'Comunista', 'flag'], ['confiante', '😎', 'Confiante', 'confident'],
  ['conservador', '🏛️', 'Conservador', 'formal'], ['conservadora', '🏛️', 'Conservadora', 'formal'],
  ['cosmopolita', '🌆', 'Cosmopolita', 'city'], ['covarde', '🐔', 'Covarde', 'scared'],
  ['criativa', '🎨', 'Criativa', 'creative'], ['criativo', '🎨', 'Criativo', 'creative'],
  ['desumilde', '😏', 'Desumilde', 'arrogant'], ['digital', '💻', 'Digital', 'tech'],
  ['doente', '🤒', 'Doente', 'sick'], ['dorminhoca', '😴', 'Dorminhoca', 'sleepy'], ['dorminhoco', '😴', 'Dorminhoco', 'sleepy'],
  ['economica', '💸', 'Económica', 'money'], ['economico', '💸', 'Económico', 'money'],
  ['engracada', '😂', 'Engraçada', 'funny'], ['engracado', '😂', 'Engraçado', 'funny'],
  ['esperta', '🧠', 'Esperta', 'smart'], ['esperto', '🧠', 'Esperto', 'smart'],
  ['estudiosa', '📚', 'Estudiosa', 'study'], ['estudioso', '📚', 'Estudioso', 'study'],
  ['extrovertida', '🎉', 'Extrovertida', 'party'], ['extrovertido', '🎉', 'Extrovertido', 'party'],
  ['feia', '🤢', 'Feia', 'ugly'], ['fiel', '💍', 'Fiel', 'loyal'],
  ['fofoqueira', '🗣️', 'Fofoqueira', 'gossip'], ['fofoqueiro', '🗣️', 'Fofoqueiro', 'gossip'],
  ['fortao', '🏋️', 'Fortão', 'muscle'], ['forte', '💪', 'Forte', 'strong'], ['fortona', '🏋️', 'Fortona', 'muscle'],
  ['fraca', '🍃', 'Fraca', 'weak'], ['gada', '🐄', 'Gada', 'simp'], ['gado', '🐄', 'Gado', 'simp'],
  ['gastador', '💳', 'Gastador', 'spending'], ['gastadora', '💳', 'Gastadora', 'spending'],
  ['global', '🌍', 'Global', 'world'], ['gostosa', '🥵', 'Gostosa', 'hot'],
  ['homofobica', '🚫', 'Homofóbica', 'angry'], ['homofobico', '🚫', 'Homofóbico', 'angry'],
  ['humilde', '🙏', 'Humilde', 'humble'], ['independente', '🦅', 'Independente', 'freedom'],
  ['infantil', '🧸', 'Infantil', 'childish'], ['infiel', '🦌', 'Infiel', 'betrayal'],
  ['insegura', '😟', 'Insegura', 'anxious'], ['inseguro', '😟', 'Inseguro', 'anxious'],
  ['inteligente', '🧠', 'Inteligente', 'genius'], ['introvertida', '🌙', 'Introvertida', 'quiet'], ['introvertido', '🌙', 'Introvertido', 'quiet'],
  ['irresponsavel', '🤷', 'Irresponsável', 'careless'],
  ['ladra', '🦹‍♀️', 'Ladra', 'thief'], ['ladrao', '🦹', 'Ladrão', 'thief'],
  ['lesbica', '🏳️‍🌈', 'Lésbica', 'rainbow'], ['liberal', '🕊️', 'Liberal', 'freedom'],
  ['linda', '✨', 'Linda', 'beautiful'], ['local', '📍', 'Local', 'local'],
  ['lulista', '🔴', 'Lulista', 'flag'], ['machista', '🚹', 'Machista', 'angry'], ['macho', '🦁', 'Macho', 'manly'],
  ['madura', '🍷', 'Madura', 'mature'], ['maduro', '🍷', 'Maduro', 'mature'],
  ['magrela', '🦴', 'Magrela', 'skinny'], ['magrelo', '🦴', 'Magrelo', 'skinny'],
  ['malandra', '😏', 'Malandra', 'sly'], ['malandro', '😏', 'Malandro', 'sly'],
  ['misteriosa', '🔮', 'Misteriosa', 'mysterious'], ['misterioso', '🔮', 'Misterioso', 'mysterious'],
  ['mito', '🐐', 'Mito', 'legend'], ['moderna', '📱', 'Moderna', 'modern'], ['moderno', '📱', 'Moderno', 'modern'],
  ['nazista', '⚠️', 'Nazista', 'angry'], ['nerd', '🤓', 'Nerd', 'nerd'], ['nerd2', '🤓', 'Nerd²', 'nerd'],
  ['nervosa', '😬', 'Nervosa', 'nervous'], ['nervoso', '😬', 'Nervoso', 'nervous'],
  ['offline', '📴', 'Offline', 'offline'], ['online', '📶', 'Online', 'online'],
  ['organizada', '🗂️', 'Organizada', 'organized'], ['organizado', '🗂️', 'Organizado', 'organized'],
  ['otaku', '⛩️', 'Otaku', 'otaku'], ['otaria', '🤡', 'Otária', 'clown'], ['otario', '🤡', 'Otário', 'clown'],
  ['otimista', '🌞', 'Otimista', 'optimistic'], ['padrao', '⭐', 'Padrão', 'standard'],
  ['patrao', '👑', 'Patrão', 'boss'], ['patriotica', '🇦🇴', 'Patriótica', 'flag'], ['patriotico', '🇦🇴', 'Patriótico', 'flag'],
  ['patroa', '👑', 'Patroa', 'boss'], ['pegador', '😎', 'Pegador', 'player'], ['pegadora', '😎', 'Pegadora', 'player'],
  ['pessimista', '🌧️', 'Pessimista', 'pessimistic'], ['petista', '🔴', 'Petista', 'flag'],
  ['pilantra', '🎭', 'Pilantra', 'trickster'], ['pobre', '🪙', 'Pobre', 'poor'],
  ['poderosa', '⚡', 'Poderosa', 'powerful'], ['poderoso', '⚡', 'Poderoso', 'powerful'],
  ['popular', '🌟', 'Popular', 'popular'], ['pratica', '🧰', 'Prática', 'practical'], ['pratico', '🧰', 'Prático', 'practical'],
  ['preguicosa', '🦥', 'Preguiçosa', 'lazy'], ['preguicoso', '🦥', 'Preguiçoso', 'lazy'],
  ['presidenta', '🏛️', 'Presidenta', 'president'], ['presidente', '🏛️', 'Presidente', 'president'],
  ['programador', '💻', 'Programador', 'coder'], ['programadora', '💻', 'Programadora', 'coder'],
  ['psicopata', '🔪', 'Psicopata', 'psycho'], ['racista', '⚠️', 'Racista', 'angry'],
  ['rainha', '👑', 'Rainha', 'queen'], ['realista', '🎯', 'Realista', 'realistic'],
  ['rei', '👑', 'Rei', 'king'], ['religiosa', '⛪', 'Religiosa', 'prayer'], ['religioso', '⛪', 'Religioso', 'prayer'],
  ['rica', '💎', 'Rica', 'rich'], ['romantica', '🌹', 'Romântica', 'romantic'], ['romantico', '🌹', 'Romântico', 'romantic'],
  ['rural', '🌾', 'Rural', 'farm'], ['safada', '🔥', 'Safada', 'naughty'],
  ['saudavel', '🥗', 'Saudável', 'healthy'], ['sedentaria', '🛋️', 'Sedentária', 'couch'], ['sedentario', '🛋️', 'Sedentário', 'couch'],
  ['seguidor', '🙋', 'Seguidor', 'follower'], ['seguidora', '🙋', 'Seguidora', 'follower'],
  ['senhor', '🎩', 'Senhor', 'gentleman'], ['senhora', '👒', 'Senhora', 'lady'],
  ['seria', '🗿', 'Séria', 'serious'], ['serio', '🗿', 'Sério', 'serious'],
  ['simpatica', '😊', 'Simpática', 'friendly'], ['simpatico', '😊', 'Simpático', 'friendly'],
  ['social', '👥', 'Social', 'social'], ['solitaria', '🌧️', 'Solitária', 'lonely'], ['solitario', '🌧️', 'Solitário', 'lonely'],
  ['sonhador', '🌠', 'Sonhador', 'dreamer'], ['sonhadora', '🌠', 'Sonhadora', 'dreamer'],
  ['sortuda', '🍀', 'Sortuda', 'lucky'], ['sortudo', '🍀', 'Sortudo', 'lucky'],
  ['supersticiosa', '🧿', 'Supersticiosa', 'superstitious'], ['supersticioso', '🧿', 'Supersticioso', 'superstitious'],
  ['talarica', '🦊', 'Talarica', 'sneaky'], ['talarico', '🦊', 'Talarico', 'sneaky'],
  ['tecnologico', '🤖', 'Tecnológico', 'tech'], ['trabalhador', '⚒️', 'Trabalhador', 'worker'], ['trabalhadora', '⚒️', 'Trabalhadora', 'worker'],
  ['tradicional', '📜', 'Tradicional', 'traditional'], ['traidor', '🗡️', 'Traidor', 'traitor'], ['traidora', '🗡️', 'Traidora', 'traitor'],
  ['urbana', '🏙️', 'Urbana', 'city'], ['urbano', '🏙️', 'Urbano', 'city'],
  ['vagabunda', '😤', 'Vagabunda', 'angry'], ['vagabundo', '😤', 'Vagabundo', 'angry'],
  ['vencedor', '🏆', 'Vencedor', 'winner'], ['vencedora', '🏆', 'Vencedora', 'winner'],
  ['vesga', '👀', 'Vesga', 'funny'], ['vesgo', '👀', 'Vesgo', 'funny'],
  ['viajante', '🧳', 'Viajante', 'travel'], ['visionaria', '🔭', 'Visionária', 'visionary'], ['visionario', '🔭', 'Visionário', 'visionary'],
  ['zueira', '🤣', 'Zueira', 'funny'], ['zueiro', '🤣', 'Zueiro', 'funny'],
  ['dependente', '🍼', 'Dependente', 'dependent'],
  ['corajosa', '🦁', 'Corajosa', 'fierce'], ['corajoso', '🦁', 'Corajoso', 'fierce'],
  ['corna', '🦌', 'Corna', 'betrayal'], ['responsavel', '🧭', 'Responsável', 'practical'],
  ['tecnologica', '🤖', 'Tecnológica', 'tech'], ['bandido', '🕶️', 'Bandido', 'thief'], ['bandida', '🕶️', 'Bandida', 'thief'],
];

const GIF_QUERY = {
  retro: 'anime retro old', lonely: 'anime lonely sad', adventure: 'anime adventure explore',
  unlucky: 'anime unlucky sad', messy: 'anime messy chaotic', drunk: 'anime drunk funny',
  rich: 'anime money rich', silly: 'anime silly funny', flag: 'anime flag patriotic',
  muscle: 'anime muscle strong', fierce: 'anime fierce angry', playful: 'anime playful happy',
  hot: 'anime hot attractive', dumb: 'anime confused dumb', dog: 'anime dog cute',
  calm: 'anime calm peaceful', affectionate: 'anime affection cute', home: 'anime home cozy',
  skeptic: 'anime skeptic face', charming: 'anime charming smile', annoying: 'anime annoyed',
  boss: 'anime boss cool', cry: 'anime crying sad', jealous: 'anime jealous angry',
  comedy: 'anime comedy laugh', eating: 'anime eating food', confident: 'anime confident smirk',
  formal: 'anime formal suit', city: 'anime city urban', scared: 'anime scared afraid',
  creative: 'anime creative art', arrogant: 'anime arrogant smug', tech: 'anime technology',
  sick: 'anime sick ill', sleepy: 'anime sleepy yawn', money: 'anime money coins',
  funny: 'anime funny laugh', smart: 'anime smart genius', study: 'anime studying books',
  party: 'anime party celebrate', ugly: 'anime ugly funny', loyal: 'anime loyal friend',
  gossip: 'anime gossip whisper', strong: 'anime strong power', weak: 'anime weak tired',
  simp: 'anime simp blush', spending: 'anime spending shopping', world: 'anime world travel',
  angry: 'anime angry furious', humble: 'anime humble bow', freedom: 'anime freedom bird',
  childish: 'anime childish cute', betrayal: 'anime betrayal sad', anxious: 'anime anxious worry',
  genius: 'anime genius smart', quiet: 'anime quiet shy', careless: 'anime careless lazy',
  thief: 'anime thief sneaky', rainbow: 'anime rainbow colorful', beautiful: 'anime beautiful sparkle',
  local: 'anime local neighborhood', manly: 'anime manly cool', mature: 'anime mature elegant',
  skinny: 'anime skinny funny', sly: 'anime sly smirk', mysterious: 'anime mysterious dark',
  legend: 'anime legend hero', modern: 'anime modern style', nerd: 'anime nerd glasses',
  nervous: 'anime nervous sweat', offline: 'anime offline sleep', online: 'anime online connect',
  organized: 'anime organized neat', otaku: 'anime otaku fan', clown: 'anime clown funny',
  optimistic: 'anime optimistic sunny', standard: 'anime standard normal', player: 'anime player flirty',
  pessimistic: 'anime pessimistic rain', trickster: 'anime trickster smug', poor: 'anime poor sad',
  powerful: 'anime powerful aura', popular: 'anime popular crowd', practical: 'anime practical work',
  lazy: 'anime lazy relax', president: 'anime president formal', coder: 'anime coding hacker',
  psycho: 'anime psycho dark', queen: 'anime queen royal', realistic: 'anime realistic calm',
  king: 'anime king royal', prayer: 'anime prayer faith', romantic: 'anime romantic love',
  farm: 'anime farm nature', naughty: 'anime naughty wink', healthy: 'anime healthy sport',
  couch: 'anime couch relax', follower: 'anime follower group', gentleman: 'anime gentleman suit',
  lady: 'anime lady elegant', serious: 'anime serious stern', friendly: 'anime friendly wave',
  social: 'anime social friends', dreamer: 'anime dreamer stars', lucky: 'anime lucky clover',
  superstitious: 'anime superstitious charm', sneaky: 'anime sneaky ninja', worker: 'anime worker hard',
  traditional: 'anime traditional japan', traitor: 'anime traitor dark', winner: 'anime winner trophy',
  travel: 'anime travel journey', visionary: 'anime visionary future', dependent: 'anime dependent clingy',
};

// v7.27: a categoria JÁ É a ação canónica do gifHelper (rich, dumb, psycho…).
// Passa-se directamente para o GIF ser espelho do medidor.
function gifFor(kind) {
  return kind || GIF_QUERY[kind] || 'shocked';
}

function makePercentage(cmd, emoji, adj, kind) {
  return async ({ sock, msg, ctx }) => {
    const targets = getMentions(msg);
    const target = targets[0] || ctx.senderJid;
    const pct = randInt(0, 100);
    const filled = Math.floor(pct / 10);
    const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);
    const reaction = pct >= 80 ? '🔥 *NÍVEL MÁXIMO!*' : pct >= 50 ? '😏 *Considerável...*' : pct >= 20 ? '😐 *Hmm...*' : '🤷 *Quase nada*';
    const aura = Math.max(1, Math.floor(pct / 20));
    await addAura(target.split('@')[0], target === ctx.senderJid ? ctx.pushName : '', aura);
    const text = `╔══ ˚₊‧ ${emoji} ‧₊˚ ══╗\n║ 📊 *MEDIDOR DE ${adj.toUpperCase()}*\n║\n║ 👤 @${target.split('@')[0]}\n║ ${emoji} ${adj}: *${pct}%*\n║ ┃${bar}┃\n║\n║ ${reaction}\n║ ⚡ Aura gerada: +${aura}\n╚══════════════════╝`;
    return sendWithGif(sock, msg, ctx, text, [target], gifFor(kind));
  };
}

function makeRank(cmd, emoji, adj, kind) {
  return async ({ sock, msg, ctx }) => {
    if (!ctx.isGroup) return reply(sock, msg, ctx, '👥 Ranking só em grupos.');
    const participants = (ctx.groupMeta?.participants || []).map(p => p.id).filter(Boolean);
    const sample = participants.sort(() => Math.random() - 0.5).slice(0, Math.min(10, participants.length));
    if (!sample.length) return reply(sock, msg, ctx, '❌ Sem participantes para ranking.');
    const rows = sample.map((jid, i) => ({ jid, pct: randInt(1, 100) })).sort((a, b) => b.pct - a.pct);
    const mentions = rows.map(r => r.jid);
    if (rows[0]) await addAura(rows[0].jid.split('@')[0], '', Math.max(1, Math.floor((rows[0].pct) / 20)));
    const text = `╔══ ˚₊‧ ${emoji} ‧₊˚ ══╗\n║ 🏆 *RANK ${adj.toUpperCase()}*\n║\n` +
      rows.map((r, i) => `║ ${i + 1}. @${r.jid.split('@')[0]} — *${r.pct}%* ${adj.toLowerCase()}`).join('\n') +
      `\n╚══════════════════╝`;
    return sendWithGif(sock, msg, ctx, text, mentions, gifFor(kind));
  };
}

module.exports = function registerMedidores(registerCase) {
  const cmds = new Set();
  for (const [cmd, emoji, adj, kind] of M) {
    cmds.add(cmd);
    registerCase([cmd], makePercentage(cmd, emoji, adj, kind), true);
    // rank singular + plural (rankX / rankXs)
    registerCase(['rank' + cmd], makeRank(cmd, emoji, adj, kind), true);
    registerCase(['rank' + cmd + 's'], makeRank(cmd, emoji, adj, kind), true);
  }
  // aliases com typos conhecidos
  registerCase(['rankfiels'], makeRank('fiel', '💍', 'Fiel', 'loyal'), true);
  registerCase(['rankgays'], makeRank('gay', '🏳️‍🌈', 'Gay', 'rainbow'), true);
  registerCase(['rankgads'], makeRank('gado', '🐄', 'Gado', 'simp'), true);
  registerCase(['rankrg'], makeRank('rico', '💎', 'Rico', 'rich'), true);
};

module.exports.M = M;
