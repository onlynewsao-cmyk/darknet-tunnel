/**
 * Pacote de INTERAÇÕES v4.1 — GIFs MP4 espelho da ação (gifHelper multi-fonte)
 * GIFs compatíveis com WhatsApp (gifPlayback: true)
 */
const Economy = require('../../database/models/Economy');
const { sendWithGif } = require('../gifHelper');

function getMentions(msg) {
  return msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
}
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
const reply = (sock, msg, ctx, text, mentions = []) => sock.sendMessage(ctx.remoteJid, { text, mentions }, { quoted: msg });

// v7.27: comando → AÇÃO canónica do gifHelper (espelho do que o comando faz).
// Antes eram frases Tenor em inglês; a Tenor foi descontinuada e as frases
// caíam em categorias erradas. Ver gifHelper.ACTIONS para a lista completa.
const GIF_QUERIES = {
  // ── Amor / Carinho ───────────────────────────────────────────────
  abracar: 'hug', beijar: 'kiss', cafune: 'pat', declarar: 'love', flertar: 'flirt',
  paparico: 'spoil', dancar: 'dance', chocolate: 'chocolate',
  // ── Luta / Violência ─────────────────────────────────────────────
  tapa: 'slap', soco: 'punch', chute: 'kick', tiro: 'shoot', facada: 'stab', matar: 'kill',
  bater: 'beat', morder: 'bite', cuspir: 'spit', empurrar: 'push', envenenar: 'poison',
  espancar: 'beat', bullying: 'bully', amaldicoar: 'curse',
  // ── Emoções / Estados ────────────────────────────────────────────
  mimimi: 'cry', fofocar: 'gossip', acordar: 'wake', cuidar: 'care', bencao: 'bless',
  pensar: 'think', dormir: 'sleep', correr: 'run', timido: 'shy', chorar: 'cry', rir: 'laugh',
  wave: 'wave', highfive: 'highfive', comer: 'eat', cafe: 'coffee',
  // ── Habilidades / Actividades ────────────────────────────────────
  aura: 'aura', godadm: 'power', meditar: 'meditate', treinar: 'strong', estudar: 'study',
  cantar: 'sing', programar: 'code', gamer: 'game', banho: 'bath', trabalhar: 'work',
  cozinhar: 'cook', hallobat: 'bat',
  // Fallback
  default: 'shocked',
};

// Bordas visuais
const B = {
  love:  { t: '╔══ ˚₊‧ 💕 ‧₊˚ ══╗', b: '╚══════════════════╝' },
  fight: { t: '╔══ ˚₊‧ ⚔️  ‧₊˚ ══╗', b: '╚══════════════════╝' },
  fun:   { t: '╔══ ˚₊‧ ✨ ‧₊˚ ══╗', b: '╚══════════════════╝' },
  dark:  { t: '╔══ ˚₊‧ 💀 ‧₊˚ ══╗', b: '╚══════════════════╝' },
};


async function addAura(number, name, amount = 1) {
  try {
    const eco = await Economy.getOrCreate(number, name);
    eco.aura = (eco.aura || 0) + amount;
    eco.xp = (eco.xp || 0) + Math.max(1, Math.floor(amount / 2));
    await eco.save();
    return eco;
  } catch { return null; }
}

function auraForAction({ damage = 0, targets = 1, cat = 'fun' }) {
  const base = cat === 'love' ? 4 : cat === 'dark' ? 7 : cat === 'fight' ? 5 : 3;
  return Math.min(50, base + Math.floor(Math.max(0, damage) / 5) + Math.max(0, targets - 1));
}

function epStatus(eco) {
  const pct = Math.max(0, Math.round((eco.hp / eco.maxHp) * 100));
  const bar = '█'.repeat(Math.floor(pct / 10)) + '░'.repeat(10 - Math.floor(pct / 10));
  const state = pct <= 0 ? '☠️ DESMAIADO' : pct < 30 ? '🩸 FRACO' : pct < 70 ? '⚡ FIRME' : '💪 FORTE';
  return { pct, bar, state };
}

async function ensureCanFight(sock, msg, ctx, sender, target, damage, border, tenorQuery) {
  if (damage <= 0) return null;
  const actor = await Economy.getOrCreate(sender.split('@')[0], ctx.pushName);
  if (actor.hp <= 0) {
    const st = epStatus(actor);
    const text = `${border.t}\n║ ☠️ *SEM ENERGIA*\n║\n║ @${sender.split('@')[0]} está desmaiado e não consegue atacar.\n║ EP: ${st.state} [${st.bar}] ${st.pct}%\n║\n║ Use *${ctx.prefix || '!'}heal* para voltar.\n${border.b}`;
    await sendWithGif(sock, msg, ctx, text, [sender], 'faint');
    return false;
  }
  const targetEco = await Economy.getOrCreate(target.split('@')[0]);
  if (targetEco.hp <= 0) {
    const st = epStatus(targetEco);
    const text = `${border.t}\n║ ☠️ *ALVO JÁ DESMAIADO*\n║\n║ @${target.split('@')[0]} não aguenta outro ataque agora.\n║ EP: ${st.state} [${st.bar}] ${st.pct}%\n${border.b}`;
    await sendWithGif(sock, msg, ctx, text, [target], 'faint');
    return false;
  }
  return true;
}


/**
 * Factory de comandos de ação social (com GIF + dano de HP)
 */
function action({ name, emoji, verbs, soloVerbs = ['está sozinho 🥲'], damage = 0, cat = 'fun', gif = null }) {
  return async ({ sock, msg, ctx }) => {
    const rawTargets = getMentions(msg);
    const sender = ctx.senderJid;
    const border = B[cat] || B.fun;
    const gifKey = gif || name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s/g, '').toLowerCase();
    const tenorQuery = GIF_QUERIES[gifKey] || GIF_QUERIES[name.toLowerCase()] || GIF_QUERIES.default || 'shocked';

    if (!rawTargets.length) {
      const aura = auraForAction({ damage, targets: 1, cat });
      const eco = await addAura(sender.split('@')[0], ctx.pushName, aura);
      const text = `${border.t}\n║ ${emoji} ⌁ *${name.toUpperCase()}*\n║\n║ @${sender.split('@')[0]} ${pick(soloVerbs)}\n║ ⚡ Aura: +${aura}${eco ? ` (total ${eco.aura || 0})` : ''}\n${border.b}`;
      return sendWithGif(sock, msg, ctx, text, [sender], tenorQuery);
    }

    const targets = [...new Set(rawTargets)].filter(t => t && t !== sender).slice(0, 10);
    if (!targets.length) {
      return sock.sendMessage(ctx.remoteJid, {
        text: `${border.t}\n║ 🤡 @${sender.split('@')[0]} tentou\n║ ${name} a si mesmo... 💀\n${border.b}`,
        mentions: [sender],
      }, { quoted: msg });
    }

    const okTargets = [];
    const hpLines = [];
    for (const target of targets) {
      const canFight = await ensureCanFight(sock, msg, ctx, sender, target, damage, border, tenorQuery);
      if (canFight === false) continue;
      okTargets.push(target);
      if (damage > 0) {
        try {
          const eco = await Economy.getOrCreate(target.split('@')[0]);
          eco.hp = Math.max(0, eco.hp - damage);
          await eco.save();
          const st = epStatus(eco);
          hpLines.push(`║ @${target.split('@')[0]} HP: [${st.bar}] ${eco.hp}/${eco.maxHp}${eco.hp === 0 ? ' ☠️' : ''}`);
        } catch {}
      }
    }
    if (!okTargets.length) return;

    const aura = auraForAction({ damage, targets: okTargets.length, cat });
    const ecoActor = await addAura(sender.split('@')[0], ctx.pushName, aura);
    for (const t of okTargets) await addAura(t.split('@')[0], '', Math.max(1, Math.floor(aura / 3)));
    const verb = pick(verbs);
    const targetsText = okTargets.map(t => `@${t.split('@')[0]}`).join(', ');
    const multi = okTargets.length > 1 ? `\n║ Alvos: *${okTargets.length}* / máx 10` : '';
    const hpBlock = hpLines.length ? `\n║\n${hpLines.join('\n')}` : '';
    const text = `${border.t}\n║ ${emoji} ⌁ *${name.toUpperCase()}*${multi}\n║\n║ @${sender.split('@')[0]}\n║ ${verb}\n║ ${targetsText}\n║ ⚡ Aura: +${aura}${ecoActor ? ` (total ${ecoActor.aura || 0})` : ''}${hpBlock}\n${border.b}`;
    return sendWithGif(sock, msg, ctx, text, [sender, ...okTargets], tenorQuery);
  };
}

/**
 * Factory de comandos percentuais — agora com GIF também!
 */
function percentage({ name, emoji, adj, gifQuery }) {
  return async ({ sock, msg, ctx }) => {
    const targets = getMentions(msg);
    const target = targets[0] || ctx.senderJid;
    const pct = randInt(0, 100);
    const filled = Math.floor(pct / 10);
    const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);
    const reaction = pct >= 80 ? '🔥 *NÍVEL MÁXIMO!*' : pct >= 50 ? '😏 *Considerável...*' : pct >= 20 ? '😐 *Hmm...*' : '🤷 *Quase nada*';
    const aura = Math.max(1, Math.floor(pct / 20));
    await addAura(target.split('@')[0], target === ctx.senderJid ? ctx.pushName : '', aura);
    const text = `╔══ ˚₊‧ ${emoji} ‧₊˚ ══╗\n║ 📊 *MEDIDOR DE ${name.toUpperCase()}*\n║\n║ 👤 @${target.split('@')[0]}\n║ ${emoji} ${adj}: *${pct}%*\n║ ┃${bar}┃\n║\n║ ${reaction}\n║ ⚡ Aura gerada: +${aura}\n╚══════════════════╝`;
    return sendWithGif(sock, msg, ctx, text, [target], gifQuery || null);
  };
}

function rankPercentage({ name, emoji, adj, gifQuery }) {
  return async ({ sock, msg, ctx }) => {
    if (!ctx.isGroup) return reply(sock, msg, ctx, '👥 Ranking só em grupos.');
    const participants = (ctx.groupMeta?.participants || []).map(p => p.id).filter(Boolean);
    const sample = participants.sort(() => Math.random() - 0.5).slice(0, Math.min(10, participants.length));
    if (!sample.length) return reply(sock, msg, ctx, '❌ Sem participantes para ranking.');
    const rows = sample.map((jid, i) => ({ jid, pct: randInt(1, 100), pos: i + 1 })).sort((a,b)=>b.pct-a.pct);
    const mentions = rows.map(r => r.jid);
    const topAura = Math.max(1, Math.floor((rows[0]?.pct || 0) / 20));
    if (rows[0]) await addAura(rows[0].jid.split('@')[0], '', topAura);
    const text = `╔══ ˚₊‧ ${emoji} ‧₊˚ ══╗\n║ 🏆 *RANK ${name.toUpperCase()}*\n║\n` +
      rows.map((r, i) => `║ ${i+1}. @${r.jid.split('@')[0]} — *${r.pct}%* ${adj}`).join('\n') +
      `\n╚══════════════════╝`;
    return sendWithGif(sock, msg, ctx, text, mentions, gifQuery || null);
  };
}

module.exports = {
  // ═══ AMOR / CARINHO ═══
  abracar: action({ name: 'abraçar', emoji: '🤗', cat: 'love', gif: 'abracar',
    verbs: ['deu um abraço apertado em', 'envolveu carinhosamente', 'esmagou de carinho'],
    soloVerbs: ['precisa de um abraço 🥺'] }),
  beijar: action({ name: 'beijar', emoji: '💋', cat: 'love', gif: 'beijar',
    verbs: ['deu um beijão em', 'roubou um beijo de', 'beijou apaixonadamente'],
    soloVerbs: ['tá precisando de carinho 💋'] }),
  cafune: action({ name: 'fazer cafuné', emoji: '🥰', cat: 'love', gif: 'cafune',
    verbs: ['fez cafuné em', 'acariciou a cabecinha de', 'mimou com carinho'] }),
  declarar: action({ name: 'declarar amor', emoji: '💌', cat: 'love', gif: 'declarar',
    verbs: ['se declarou para', 'mandou carta de amor para', 'jurou amor eterno a'] }),
  flertar: action({ name: 'flertar', emoji: '😏', cat: 'love', gif: 'flertar',
    verbs: ['deu uma piscadinha para', 'flertou descaradamente com', 'mandou olhar 43 para'] }),
  paparico: action({ name: 'paparicar', emoji: '✨', cat: 'love', gif: 'paparico',
    verbs: ['paparicou', 'mimou demais', 'tratou como realeza'] }),


  cafe: action({ name: 'tomar café', emoji: '☕', cat: 'fun', gif: 'cafe',
    verbs: ['tomou um café quente com', 'brindou cafeína com', 'dividiu um espresso com'],
    soloVerbs: ['tomou um café e ativou foco ☕', 'bebeu café e ganhou energia', 'virou a caneca do Dark Café'] }),
  cafezinho: async (a) => module.exports.cafe(a),
  aura: action({ name: 'ativar aura', emoji: '⚡', cat: 'dark', gif: 'aura',
    verbs: ['ativou aura perto de', 'liberou energia sombria em', 'elevou o ki junto de'],
    soloVerbs: ['ativou a própria AURA máxima ⚡', 'entrou em modo aura infinita ♾️'] }),
  godadm: action({ name: 'god aura', emoji: '👑', cat: 'dark', gif: 'godadm',
    verbs: ['entrou em modo GOD ADM diante de', 'liberou aura suprema em', 'dominou o território com'],
    soloVerbs: ['entrou em GOD MODE ADM 👑⚡', 'ativou aura suprema de administrador'] }),
  meditar: action({ name: 'meditar', emoji: '🧘', cat: 'fun', gif: 'meditar',
    verbs: ['meditou em silêncio com', 'alinhou a energia com', 'entrou em paz junto de'],
    soloVerbs: ['meditou e recuperou a mente 🧘', 'alinhou chakra e aura'] }),
  treinar: action({ name: 'treinar', emoji: '🏋️', cat: 'fun', gif: 'treinar',
    verbs: ['foi treinar com', 'puxou treino pesado com', 'evoluiu no treino com'],
    soloVerbs: ['treinou pesado e ficou mais forte', 'fez treino Dark Fitness'] }),
  estudar: action({ name: 'estudar', emoji: '📚', cat: 'fun', gif: 'estudar',
    verbs: ['estudou estratégia com', 'abriu os livros com', 'ganhou conhecimento com'],
    soloVerbs: ['estudou e ganhou sabedoria', 'leu grimórios do Dark Bot'] }),
  cantar: action({ name: 'cantar', emoji: '🎤', cat: 'fun', gif: 'cantar',
    verbs: ['cantou para', 'fez show particular para', 'soltou a voz com'],
    soloVerbs: ['cantou sozinho no palco Dark 🎤'] }),
  programar: action({ name: 'programar', emoji: '💻', cat: 'fun', gif: 'programar',
    verbs: ['codou um sistema com', 'debugou a matrix com', 'programou até de madrugada com'],
    soloVerbs: ['programou no modo hacker 💻', 'debugou a própria vida'] }),
  gamer: action({ name: 'jogar game', emoji: '🎮', cat: 'fun', gif: 'gamer',
    verbs: ['jogou uma partida com', 'foi duo com', 'carregou o lobby com'],
    soloVerbs: ['abriu o game e ganhou +aura 🎮'] }),
  rir: action({ name: 'rir', emoji: '😂', cat: 'fun', gif: 'rir',
    verbs: ['riu muito com', 'caiu na risada com', 'rachou o bico com'],
    soloVerbs: ['riu sozinho igual vilão 😂'] }),
  chorar: action({ name: 'chorar', emoji: '😭', cat: 'fun', gif: 'chorar',
    verbs: ['chorou no ombro de', 'desabafou com', 'se emocionou com'],
    soloVerbs: ['chorou no canto e ganhou drama aura 😭'] }),

  // ═══ VIOLÊNCIA (com GIF + dano HP) ═══
  tapa: action({ name: 'dar tapa', emoji: '👋', cat: 'fight', gif: 'tapa',
    verbs: ['deu um TAPA na cara de', 'mandou um chinelão em', 'estalou a mão em'], damage: 5 }),
  soco: action({ name: 'dar soco', emoji: '👊', cat: 'fight', gif: 'soco',
    verbs: ['deu um SOCO em', 'mandou um direto em', 'acertou um cruzado em'], damage: 10 }),
  chutar: action({ name: 'dar chute', emoji: '🦵', cat: 'fight', gif: 'chute',
    verbs: ['deu uma VOADORA em', 'chutou com tudo', 'mandou um roundhouse kick em'], damage: 8 }),
  pontape: action({ name: 'dar pontapé', emoji: '🦵', cat: 'fight', gif: 'chute',
    verbs: ['deu um pontapé em', 'mandou uma bicuda em', 'chutou com estilo'], damage: 8 }),
  tiro: action({ name: 'atirar', emoji: '🔫', cat: 'dark', gif: 'tiro',
    verbs: ['deu um TIRO em', 'metralhou', 'atirou pra matar em'], damage: 25 }),
  facada: action({ name: 'esfaquear', emoji: '🔪', cat: 'dark', gif: 'facada',
    verbs: ['deu uma FACADA em', 'esfaqueou pelas costas', 'cortou'], damage: 20 }),
  matar: action({ name: 'matar', emoji: '💀', cat: 'dark', gif: 'matar',
    verbs: ['MATOU', 'eliminou', 'despachou', 'mandou pro além'], damage: 50 }),
  bater: action({ name: 'bater', emoji: '🤜', cat: 'fight', gif: 'bater',
    verbs: ['bateu em', 'deu porrada em', 'surrou'], damage: 7 }),
  morder: action({ name: 'morder', emoji: '🧛', cat: 'fight', gif: 'morder',
    verbs: ['mordeu', 'cravou os dentes em', 'deu uma mordida vampírica em'], damage: 6 }),
  cuspir: action({ name: 'cuspir', emoji: '💦', cat: 'fight', gif: 'cuspir',
    verbs: ['cuspiu em', 'mandou um cuspe em', 'acertou um molhado em'], damage: 2 }),
  empurrar: action({ name: 'empurrar', emoji: '🫸', cat: 'fight', gif: 'empurrar',
    verbs: ['empurrou', 'jogou no chão', 'derrubou'], damage: 4 }),
  envenenar: action({ name: 'envenenar', emoji: '☠️', cat: 'dark', gif: 'envenenar',
    verbs: ['envenenou', 'colocou veneno na comida de', 'drogou'], damage: 30 }),
  espancar: action({ name: 'espancar', emoji: '💥', cat: 'dark', gif: 'espancar',
    verbs: ['espancou', 'deu uma surra em', 'acabou com'], damage: 15 }),
  bullying: action({ name: 'fazer bullying', emoji: '🫵', cat: 'fight', gif: 'bullying',
    verbs: ['fez bullying com', 'zoou', 'humilhou publicamente'], damage: 3 }),

  // ═══ GERAL / FUN ═══
  mimimi: action({ name: 'mimimi', emoji: '😭', cat: 'fun', gif: 'mimimi',
    verbs: ['fez mimimi pra', 'chorou no colo de', 'reclamou pra'],
    soloVerbs: ['tá fazendo mimimi sozinho 😭'] }),
  fofocar: action({ name: 'fofocar', emoji: '🗣️', cat: 'fun', gif: 'fofocar',
    verbs: ['fofocou sobre', 'espalhou rumores de', 'contou o segredo de'] }),
  acordar: action({ name: 'acordar', emoji: '⏰', cat: 'fun', gif: 'acordar',
    verbs: ['acordou', 'jogou água gelada em', 'gritou no ouvido de'] }),
  cuidar: action({ name: 'cuidar', emoji: '🩹', cat: 'love', gif: 'cuidar',
    verbs: ['cuidou de', 'fez curativo em', 'tratou com carinho'] }),
  bencao: action({ name: 'abençoar', emoji: '🙏', cat: 'love', gif: 'bencao',
    verbs: ['abençoou', 'mandou bênçãos para', 'orou por'] }),
  amaldicoar: action({ name: 'amaldiçoar', emoji: '🧿', cat: 'dark', gif: 'amaldicoar',
    verbs: ['amaldiçoou', 'rogou praga em', 'lançou maldição em'], damage: 15 }),
  dancar: action({ name: 'dançar', emoji: '💃', cat: 'fun', gif: 'dancar',
    verbs: ['dançou com', 'chamou pra dançar', 'fez um passinho com'],
    soloVerbs: ['tá dançando sozinho 💃🕺'] }),
  pensar: action({ name: 'pensar', emoji: '🤔', cat: 'fun', gif: 'pensar', verbs: ['ficou pensando com', 'analisou a vida junto de'] }),
  dormir: action({ name: 'dormir', emoji: '😴', cat: 'fun', gif: 'dormir', verbs: ['tirou uma soneca com', 'dormiu encostado em'] }),
  comer: action({ name: 'comer', emoji: '🍜', cat: 'fun', gif: 'comer', verbs: ['foi comer com', 'dividiu comida com'] }),
  chocolate: action({ name: 'dar chocolate', emoji: '🍫', cat: 'love', gif: 'chocolate', verbs: ['deu chocolate para', 'adoçou o dia de'] }),
  correr: action({ name: 'correr', emoji: '🏃', cat: 'fun', gif: 'correr', verbs: ['correu com', 'chamou para correr'] }),
  timido: action({ name: 'ficar tímido', emoji: '😳', cat: 'fun', gif: 'timido', verbs: ['ficou tímido perto de', 'corou olhando para'] }),
  wave: action({ name: 'acenar', emoji: '👋', cat: 'fun', gif: 'wave', verbs: ['acenou para', 'mandou um salve para'] }),
  highfive: action({ name: 'high five', emoji: '🙏', cat: 'fun', gif: 'highfive', verbs: ['bateu na mão de', 'mandou high five para'] }),

  // ═══ PERCENTUAIS — com GIF! ═══
  gay:      percentage({ name: 'GAY',       emoji: '🏳️‍🌈', adj: 'Gay',       gifQuery: 'gay' }),
  rankgay:  rankPercentage({ name: 'GAY', emoji: '🏳️‍🌈', adj: 'gay', gifQuery: 'gay' }),
  lindo:    percentage({ name: 'BELEZA',    emoji: '✨',    adj: 'Lindo(a)',   gifQuery: 'beautiful' }),
  ranklindo: rankPercentage({ name: 'BELEZA', emoji: '✨', adj: 'beleza', gifQuery: 'beautiful' }),
  feio:     percentage({ name: 'FEIÚRA',    emoji: '🤢',    adj: 'Feio(a)',    gifQuery: 'ugly' }),
  burro:    percentage({ name: 'BURRICE',   emoji: '🧠',    adj: 'Burro(a)',   gifQuery: 'dumb' }),
  corno:    percentage({ name: 'CHIFRES',   emoji: '🦌',    adj: 'Corno(a)',   gifQuery: 'betrayal' }),
  rico:     percentage({ name: 'RIQUEZA',   emoji: '💰',    adj: 'Rico(a)',    gifQuery: 'rich' }),
  rankrico: rankPercentage({ name: 'RIQUEZA', emoji: '💰', adj: 'rico', gifQuery: 'rich' }),
  safado:   percentage({ name: 'SAFADEZA',  emoji: '🔥',    adj: 'Safado(a)', gifQuery: 'flirt' }),
  doido:    percentage({ name: 'LOUCURA',   emoji: '🤪',    adj: 'Doido(a)',  gifQuery: 'crazy' }),
  gostoso:  percentage({ name: 'GOSTOSURA', emoji: '🥵',    adj: 'Gostoso(a)',gifQuery: 'hot' }),
  malucao:  percentage({ name: 'MALUQUICE', emoji: '🃏',    adj: 'Malucão',   gifQuery: 'crazy' }),
  crente:   percentage({ name: 'CRENTE',    emoji: '⛪',    adj: 'Crente',    gifQuery: 'prayer' }),
  ateu:     percentage({ name: 'ATEU',      emoji: '🙅',    adj: 'Ateu',      gifQuery: 'skeptic' }),
  ateia:    percentage({ name: 'ATEIA',     emoji: '🙅‍♀️',    adj: 'Ateia',     gifQuery: 'skeptic' }),

  // ═══ ZOEIRA & MEDIDORES (completo — antes eram fake %) ═══
  atleta:     percentage({ name: 'ATLETA',     emoji: '⚽', adj: 'Atleta',     gifQuery: 'sports' }),
  bebado2:    percentage({ name: 'BÊBADO',     emoji: '🍺', adj: 'Bêbado(a)',  gifQuery: 'drunk' }),
  ciumao:     percentage({ name: 'CIÚME',      emoji: '😤', adj: 'Ciumento',   gifQuery: 'jealous' }),
  desapegado: percentage({ name: 'DESAPEGO',   emoji: '🧊', adj: 'Desapegado', gifQuery: 'cold' }),
  dorminhoco2: percentage({ name: 'DORMINHOCO', emoji: '😴', adj: 'Dorminhoco', gifQuery: 'sleep' }),
  fraco:      percentage({ name: 'FORÇA',      emoji: '🤏', adj: 'Fraco(a)',   gifQuery: 'weak' }),
  insone:     percentage({ name: 'INSÓNIA',    emoji: '🌙', adj: 'Insone',     gifQuery: 'tired' }),
  inveja:     percentage({ name: 'INVEJA',     emoji: '🐍', adj: 'Invejoso(a)', gifQuery: 'jealous' }),
  pecador:    percentage({ name: 'PECADOR',    emoji: '😈', adj: 'Pecador(a)', gifQuery: 'naughty' }),
  pirocudo:   percentage({ name: 'PIROCUDO',   emoji: '🍆', adj: 'Pirocudo',   gifQuery: 'confident' }),
  possessivo: percentage({ name: 'POSSESSIVO', emoji: '💍', adj: 'Possessivo(a)', gifQuery: 'possessive' }),
  sono:       percentage({ name: 'SONO',       emoji: '💤', adj: 'Sonolento(a)', gifQuery: 'sleep' }),
  sorte:      percentage({ name: 'SORTE',      emoji: '🍀', adj: 'Sortudo(a)', gifQuery: 'lucky' }),
  viciado:    percentage({ name: 'VICIADO',    emoji: '📱', adj: 'Viciado(a)', gifQuery: 'addicted' }),

  // aliases das variantes (burro2 = burro, feio2 = feio, …)
  burro2:   async (a) => module.exports.burro(a),
  feio2:    async (a) => module.exports.feio(a),
  gay2:     async (a) => module.exports.gay(a),
  lindo2:   async (a) => module.exports.lindo(a),
  invejosa: async (a) => module.exports.inveja(a),
  invejoso: async (a) => module.exports.inveja(a),
  pirokudo: async (a) => module.exports.pirocudo(a),
  sortudo2: async (a) => module.exports.sorte(a),
  viciada:  async (a) => module.exports.viciado(a),
  viciadao: async (a) => module.exports.viciado(a),

  // ═══ ALIASES (variantes RPG dos mesmos gestos) ═══
  abracarrpg: async (a) => module.exports.abracar(a),
  beijarrpg: async (a) => module.exports.beijar(a),
  hallobat: action({ name: 'halloween bat', emoji: '🦇', cat: 'dark', gif: 'hallobat',
    verbs: ['soltou um morcego em', 'invocou o exército de morcegos em', 'assombrou'],
    soloVerbs: ['virou o morcegão do Dark 🦇'] }),
};

/**
 * ═══ COMANDOS SENSÍVEIS (suic / suicidio) ═══
 * Não são jogo nem brincadeira. Respondem com acolhimento e recursos de
 * apoio. Estes handlers são registados no commandHandler directamente
 * (ver registration abaixo), porque os packages são resolvidos por
 * nome de chave — aqui ficam como referência do comportamento.
 */
const _suporte = (a) => {
  const { sock, msg, ctx } = a;
  return reply(sock, msg, ctx,
    '💜 *Se estás a passar por um momento difícil, não estás sozinho.*\n\n' +
    'Fala com alguém de confiança agora. Pedir ajuda é um acto de coragem, não de fraqueza.\n\n' +
    '🫂 O Dark Bot está aqui para conversar — usa *!ia <o que sentes>* e desabafa.\n' +
    '📞 Se precisares de apoio profissional urgente, procura a linha de ajuda da tua região.');
};
module.exports.suic = _suporte;
module.exports.suicidio = _suporte;
