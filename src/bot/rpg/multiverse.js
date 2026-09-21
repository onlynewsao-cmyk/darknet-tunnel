'use strict';
/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║   DARK BOT v11.2 — MULTIVERSO RPG                               ║
 * ║   Personagens Famosos · Recrutar · Técnicas · Treino            ║
 * ║                                                                  ║
 * ║   O jogador é ALGUÉM NOVO neste universo. Os heróis dos animes   ║
 * ║   existem aqui — recrutá-los, aprender os seus poderes e         ║
 * ║   treinar é como ele se torna mais forte.                        ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

const rpg = require('./engine');
const catalog = require('./catalog');
const rpgTheme = require('./rpgTheme');

const R = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;

const RECRUTAR_CUSTO = 500;
const TREINO_CUSTO = 150;
const TREINO_COOLDOWN = 30 * 60 * 1000; // 30 min por tipo
const TREINO_XP = 120;
const TREINO_SESSOES_POR_STAT = 3; // +1 stat a cada 3 sessões

const TREINOS = {
  str: { name: 'Força', emoji: '⚔️', desc: 'Martelear troncos, carregar rochas. Aumenta STR.' },
  dex: { name: 'Destreza', emoji: '🏃', desc: 'Corridas, equilíbrio, reflexos. Aumenta DEX.' },
  int: { name: 'Inteligência', emoji: '🔮', desc: 'Estudar técnica, meditar, controlar energia. Aumenta INT.' },
  vit: { name: 'Vitalidade', emoji: '🛡️', desc: 'Resistência, fôlego, pele de aço. Aumenta VIT.' },
  luk: { name: 'Sorte', emoji: '🍀', desc: 'Catar coices de burro (cogumelos raros). Aumenta LUK.' },
};

// ══════════════════════════════════════════════════════════════
// PERSONAGENS — vitrine de todos os mundos
// ══════════════════════════════════════════════════════════════

async function listarPersonagens(sock, msg, ctx) {
  const p = await rpg.getPlayer(ctx.senderNumber);
  const owned = new Set(Array.isArray(p.characters) ? p.characters : []);
  const sections = [];
  // Títulos de secção: máx. 24 chars (limite WhatsApp)
  const worldInfo = {
    naruto: '🍥 Naruto', onepiece: '🏴‍☠️ One Piece',
    sololeveling: '⚔️ Solo Leveling', jjk: '👁️ Jujutsu Kaisen',
    dragonball: '🐉 Dragon Ball', demonslayer: '🗡️ Demon Slayer',
    dmc: '😈 Devil May Cry', bleach: '👻 Bleach',
  };
  for (const [wid, wname] of Object.entries(worldInfo)) {
    const chars = catalog.charByWorld(wid);
    const rows = chars.map(c => ({
      title: `${catalog.RARITY[c.rarity].emoji} ${c.name}`.slice(0, 24),
      description: `${c.rarity} · ${c.poder}${owned.has(c.id) ? ' · ✅' : ''}`.slice(0, 72),
      id: 'RPGCHAR_' + c.id,
    }));
    sections.push({ title: wname.slice(0, 24), rows });
  }
  const ab = catalog.allyBonus(p);
  const corpo = [
    '🌌 *O MULTIVERSO*',
    '',
    'Tu és ALGUÉM NOVO neste universo.',
    'Os heróis que conheces existem aqui —',
    'recruta-os e eles lutam ao teu lado!',
    '',
    `👥 Aliados: *${ab.n}* | Bónus: +${ab.atk} ATK, +${ab.hp} HP`,
    `🎰 *!recrutar* — ${RECRUTAR_CUSTO} coins (Mítico 3% · Lendário 12% · Épico 35% · Raro 50%)`,
    '',
    '> Toca num mundo para ver os personagens!',
  ].join('\n');
  await rpgTheme.rpgLista(sock, msg, ctx, '🌌 PERSONAGENS', sections, corpo);
}

async function verPersonagem(sock, msg, ctx, charId) {
  const p = await rpg.getPlayer(ctx.senderNumber);
  const c = catalog.charById(charId);
  if (!c) return rpgTheme.rpgReply(sock, msg, ctx, '❌', ['Personagem não encontrado.']);
  const owned = (Array.isArray(p.characters) ? p.characters : []).includes(c.id);
  const r = catalog.RARITY[c.rarity];
  const botoes = [];
  if (!owned) botoes.push({ text: `🎰 Gacha (-${RECRUTAR_CUSTO}c)`, id: 'RPGGACHA' });
  botoes.push({ text: '👥 Meus Aliados', id: 'RPGALIA' });
  const corpo = [
    `${c.emoji} *${c.name.toUpperCase()}*`,
    `${r.emoji} *${c.rarity}* · ${c.world === 'sololeveling' ? 'Solo Leveling' : c.world}`,
    '',
    `💬 "${c.quote}"`,
    '',
    '*— PODER ASSINATURA —*',
    `✨ *${c.poder}*`,
    '',
    '*— BÓNUS COMO ALIADO —*',
    `⚔️ +${c.atk} ATK | ❤️ +${c.hp} HP`,
    '',
    owned ? '✅ *JÁ RECRUTADO* — luta ao teu lado em todos os combates.'
          : '🎰 Recruta-o e ele passa a dar bónus em TODOS os combates.',
  ].join('\n');
  return rpgTheme.rpgBotoes(sock, msg, ctx, corpo, botoes);
}

// ══════════════════════════════════════════════════════════════
// RECRUTAR — gacha de personagens
// ══════════════════════════════════════════════════════════════

async function recrutar(sock, msg, ctx) {
  const p = await rpg.getPlayer(ctx.senderNumber);
  if (p.coins < RECRUTAR_CUSTO) {
    return rpgTheme.rpgReply(sock, msg, ctx, '💰 COINS INSUFICIENTES', [
      `Recrutar custa *${RECRUTAR_CUSTO}* coins. Tens *${p.coins}*.`,
      '> !trabalhar · !loja · !historia (recompensas)',
    ]);
  }
  p.coins -= RECRUTAR_CUSTO;
  const owned = Array.isArray(p.characters) ? p.characters : [];
  let char = catalog.rollCharacter(owned);
  let duplicado = false;
  // Se todos já tiver → duplicado
  if (char && owned.includes(char.id)) { char = catalog.rollCharacter([]); duplicado = true; }
  if (!char) {
    // Coleção completa! Recompensa extra
    p.coins += 5000;
    await rpg.savePlayer(p);
    return rpgTheme.rpgReply(sock, msg, ctx, '🏆 COLEÇÃO COMPLETA!', [
      'Tens TODOS os personagens do multiverso!',
      '💰 +5000 coins de bónus!',
      '👑 Título: *Colecionador do Multiverso*',
    ]);
  }
  owned.push(char.id);
  p.characters = owned;
  rpg.addXP(p, 150);
  await rpg.savePlayer(p);
  const r = catalog.RARITY[char.rarity];
  const linhas = [
    `🎰 *RECRUTAMENTO! -${RECRUTAR_CUSTO} coins*`,
    '',
    `${r.emoji} *${char.rarity}*`,
    '',
    `${char.emoji} *${char.name}*`,
    `✨ Poder: ${char.poder}`,
    `💬 "${char.quote}"`,
    '',
    `⚔️ +${char.atk} ATK | ❤️ +${char.hp} HP`,
    '',
    `👥 Aliados: ${owned.length}/${catalog.CHARACTERS.length}`,
    '⭐ +150 XP',
  ];
  return rpgTheme.rpgReply(sock, msg, ctx, duplicado ? '🎰 RECRUTAMENTO (DUPLICADO)' : '🎰 RECRUTAMENTO!', linhas);
}

// ══════════════════════════════════════════════════════════════
// ALIADOS — coleção + bónus total
// ══════════════════════════════════════════════════════════════

async function mostrarAliados(sock, msg, ctx) {
  const p = await rpg.getPlayer(ctx.senderNumber);
  const owned = Array.isArray(p.characters) ? p.characters : [];
  const ab = catalog.allyBonus(p);
  if (!owned.length) {
    return rpgTheme.rpgReply(sock, msg, ctx, '👥 ALIADOS', [
      'Ainda não tens aliados.',
      `> Usa *!recrutar* (${RECRUTAR_CUSTO} coins) para recrutar o teu primeiro!`,
      '> Os heróis do multiverso esperam por ti.',
    ]);
  }
  const linhas = [];
  for (const id of owned) {
    const c = catalog.charById(id);
    if (!c) continue;
    linhas.push(`${catalog.RARITY[c.rarity].emoji} ${c.emoji} *${c.name}* — ${c.poder}`);
  }
  return rpgTheme.rpgReply(sock, msg, ctx, '👥 OS TEUS ALIADOS', [
    `*${owned.length}/${catalog.CHARACTERS.length}* personagens recrutados`,
    '',
    ...linhas,
    '',
    `*BÓNUS TOTAL: +${ab.atk} ATK · +${ab.hp} HP*`,
    '> Aplicado automaticamente em TODOS os combates.',
  ]);
}

// ══════════════════════════════════════════════════════════════
// TÉCNICAS / PODERES — catálogo + aprender
// ══════════════════════════════════════════════════════════════

async function listarTecnicas(sock, msg, ctx) {
  const p = await rpg.getPlayer(ctx.senderNumber);
  const learned = new Set(Array.isArray(p.techniques) ? p.techniques : []);
  const tb = catalog.techBonus(p);
  const sections = [];
  const worldInfo = {
    naruto: '🍥 Naruto', onepiece: '🏴‍☠️ One Piece', sololeveling: '⚔️ Solo Leveling',
    jjk: '👁️ JJK', dragonball: '🐉 Dragon Ball', demonslayer: '🗡️ Demon Slayer',
    dmc: '😈 Devil May Cry', bleach: '👻 Bleach',
  };
  for (const [wid, wname] of Object.entries(worldInfo)) {
    const techs = catalog.techByWorld(wid);
    const rows = techs.map(t => ({
      title: `${t.emoji} ${t.name}`.slice(0, 32),
      description: `Nv.${t.nivel} · ${t.custo}c${learned.has(t.id) ? ' · ✅ APRENDIDA' : ''}`.slice(0, 72),
      id: 'RPGTEC_' + t.id,
    }));
    sections.push({ title: wname, rows });
  }
  const corpo = [
    '✨ *TÉCNICAS & PODERES*',
    '',
    'Aprende os poderes dos heróis de cada mundo.',
    'Cada técnica dá um *passivo permanente*:',
    '+ATK · +DEF · +crítico · +esquiva · +HP',
    '',
    `📚 Aprendidas: *${tb.n}/40*`,
    `📊 Bónus: +${Math.round(tb.atk * 100)}% ATK · +${Math.round(tb.def * 100)}% DEF · +${Math.round(tb.crit * 100)}% crit · +${Math.round(tb.dodge * 100)}% esquiva`,
    '',
    '> Toca numa técnica para detalhes/ aprender!',
  ].join('\n');
  await rpgTheme.rpgLista(sock, msg, ctx, '✨ TÉCNICAS', sections, corpo);
}

async function verTecnica(sock, msg, ctx, techId) {
  const p = await rpg.getPlayer(ctx.senderNumber);
  const t = catalog.techById(techId);
  if (!t) return rpgTheme.rpgReply(sock, msg, ctx, '❌', ['Técnica não encontrada.']);
  const learned = (Array.isArray(p.techniques) ? p.techniques : []).includes(t.id);
  const prog = p.storyProgress?.[t.world];
  const testePassado = prog?.testePassado === true;
  const nivelOk = p.level >= t.nivel;
  const botoes = [];
  if (learned) {
    botoes.push({ text: '✅ Aprendida', id: 'RPGTEC_MENU' });
  } else {
    if (testePassado && nivelOk && p.coins >= t.custo) {
      botoes.push({ text: `📚 Aprender (-${t.custo}c)`, id: 'RPGTEC_' + t.id });
    } else {
      botoes.push({
        text: nivelOk ? (testePassado ? '💰 Sem coins' : '🔒 Faz o teste do mundo') : `🔒 Nv.${t.nivel} necessário`,
        id: 'RPGTEC_MENU',
      });
    }
  }
  botoes.push({ text: '📚 Todas', id: 'RPGTEC_MENU' });
  return rpgTheme.rpgBotoes(sock, msg, ctx, [
    `${t.emoji} *${t.name}*`,
    `Mundo: *${t.world === 'sololeveling' ? 'Solo Leveling' : t.world}*`,
    '',
    t.desc,
    '',
    `🔓 Requer: Nv.${t.nivel} + Teste do mundo`,
    `💰 Custo: *${t.custo}* coins`,
    '',
    learned ? '✅ *APRENDIDA* — passivo activo em todos os combates.'
            : '📖 Não aprendida ainda.',
  ].join('\n'), botoes);
}

async function aprenderTecnica(sock, msg, ctx, techId) {
  const p = await rpg.getPlayer(ctx.senderNumber);
  const t = catalog.techById(techId);
  if (!t) return rpgTheme.rpgReply(sock, msg, ctx, '❌', ['Técnica não encontrada.']);
  const owned = Array.isArray(p.techniques) ? p.techniques : [];
  if (owned.includes(t.id)) return rpgTheme.rpgReply(sock, msg, ctx, '📚 JÁ APRENDIDA', [`${t.emoji} *${t.name}* está na tua lista.`]);
  const prog = p.storyProgress?.[t.world];
  if (prog?.testePassado !== true) {
    return rpgTheme.rpgReply(sock, msg, ctx, '🔒 TESTE PENDENTE', [
      `Para aprender *${t.name}*, precisas de passar o teste do mundo.`,
      '> Usa *!historia* e faz o teste de iniciante.',
    ]);
  }
  if (p.level < t.nivel) {
    return rpgTheme.rpgReply(sock, msg, ctx, '🔒 NÍVEL BAIXO', [
      `${t.emoji} *${t.name}* requer nível *${t.nivel}*.`,
      `Tens nível *${p.level}* — continua a treinar e jogar!`,
    ]);
  }
  if (p.coins < t.custo) {
    return rpgTheme.rpgReply(sock, msg, ctx, '💰 COINS', [
      `Aprender custa *${t.custo}* coins. Tens *${p.coins}*.`,
    ]);
  }
  p.coins -= t.custo;
  owned.push(t.id);
  p.techniques = owned;
  const tb = catalog.techBonus(p);
  rpg.addXP(p, 200);
  await rpg.savePlayer(p);
  return rpgTheme.rpgReply(sock, msg, ctx, '📚 TÉCNICA APRENDIDA!', [
    `${t.emoji} *${t.name}*`,
    t.desc,
    '',
    '⭐ +200 XP',
    `📚 Total: ${tb.n}/40 técnicas`,
    `📊 Bónus: +${Math.round(tb.atk * 100)}% ATK · +${Math.round(tb.def * 100)}% DEF · +${Math.round(tb.crit * 100)}% crit · +${Math.round(tb.dodge * 100)}% esquiva`,
    '',
    '> O passivo já está activo em todos os combates!',
  ]);
}

// ══════════════════════════════════════════════════════════════
// TREINO — torna-te mais forte no caminho
// ══════════════════════════════════════════════════════════════

async function menuTreino(sock, msg, ctx) {
  const p = await rpg.getPlayer(ctx.senderNumber);
  if (!p.training || typeof p.training !== 'object') p.training = {};
  const agora = Date.now();
  const botoes = Object.entries(TREINOS).map(([k, t]) => {
    const st = p.training[k] || { last: 0, sessions: 0 };
    const cd = st.last + TREINO_COOLDOWN - agora;
    const label = cd > 0 ? `⏳ ${t.name} (${Math.ceil(cd / 60000)}min)` : `${t.emoji} ${t.name}`;
    return { text: label.slice(0, 24), id: 'RPGTRN_' + k };
  });
  const corpo = [
    '🏋️ *GINÁSIO DO MULTIVERSO*',
    '',
    'Treina, luta, fica mais forte —',
    'é assim que o teu caminho te faz crescer.',
    '',
    `💰 Custo: *${TREINO_CUSTO}* coins por sessão`,
    `⭐ +${TREINO_XP} XP | +1 stat a cada ${TREINO_SESSOES_POR_STAT} sessões`,
    `⏳ Cooldown: ${TREINO_COOLDOWN / 60000} min por tipo`,
    '',
    '> Toca num treino para começar!',
  ].join('\n');
  return rpgTheme.rpgBotoes(sock, msg, ctx, corpo, botoes);
}

async function treinar(sock, msg, ctx, statKey) {
  const p = await rpg.getPlayer(ctx.senderNumber);
  const t = TREINOS[statKey];
  if (!t) return rpgTheme.rpgReply(sock, msg, ctx, '❌', ['Treino inválido.']);
  if (!p.training || typeof p.training !== 'object') p.training = {};
  const agora = Date.now();
  const st = p.training[statKey] || { last: 0, sessions: 0 };
  const cd = st.last + TREINO_COOLDOWN - agora;
  if (cd > 0) {
    return rpgTheme.rpgReply(sock, msg, ctx, '⏳ EM REPOUSO', [
      `${t.emoji} *${t.name}* — volta em *${Math.ceil(cd / 60000)} min*.`,
      'O corpo precisa de descansar para crescer.',
    ]);
  }
  if (p.coins < TREINO_CUSTO) {
    return rpgTheme.rpgReply(sock, msg, ctx, '💰 COINS', [
      `Treinar custa *${TREINO_CUSTO}* coins. Tens *${p.coins}*.`,
    ]);
  }
  p.coins -= TREINO_CUSTO;
  st.sessions += 1;
  st.last = agora;
  p.training[statKey] = st;

  let ganhoStat = 0;
  if (st.sessions % TREINO_SESSOES_POR_STAT === 0) {
    if (!p.stats || typeof p.stats !== 'object') p.stats = { str: 6, dex: 6, int: 6, vit: 6, luk: 6 };
    p.stats[statKey] = (p.stats[statKey] || 6) + 1;
    ganhoStat = 1;
  }
  const maxed = rpg.addXP(p, TREINO_XP);
  await rpg.savePlayer(p);

  const frases = {
    str: ['Levantas a pedra — ela move-se. Tu também.', 'O tronco parte. O teu braço sente. Bom.', 'A forja queima. A tua força cresce.'],
    dex: ['Corres entre os pinheiros — ninguém te vê.', 'O alvo cai antes de o veres atingir.', 'O reflexo é perfeito.'],
    int: ['A energia flui como um rio calmo.', 'Lês o manual. Vês o que os outros não veem.', 'Meditas — o mundo fica em silêncio.'],
    vit: ['A pancada dói menos do que ontem.', 'O ar queima nos pulmões... e fica mais fundo.', 'A pele agarra o golpe.'],
    luk: ['Achaste um cogumelo raro. O karma sorri.', 'Uma moeda cai do céu no teu bolso.', 'O destino anda contigo.'],
  };
  const linhas = [
    `${t.emoji} *TREINO: ${t.name.toUpperCase()}*`,
    `💬 "${frases[statKey][Math.floor(Math.random() * frases[statKey].length)]}"`,
    '',
    `💰 -${TREINO_CUSTO} coins | ⭐ +${TREINO_XP} XP`,
    ganhoStat ? `${t.emoji} *+1 ${t.name.toUpperCase()}!* (${p.stats[statKey]})` : `📊 Sessão ${st.sessions % TREINO_SESSOES_POR_STAT === 0 ? TREINO_SESSOES_POR_STAT : st.sessions} — +1 stat a cada ${TREINO_SESSOES_POR_STAT} sessões`,
    maxed ? `🎉 *NÍVEL ${p.level}!*` : `⭐ Nv.${p.level} · ${p.xp}/${p.xpNext} XP`,
  ];
  return rpgTheme.rpgReply(sock, msg, ctx, '🏋️ TREINO COMPLETO', linhas);
}

// ══════════════════════════════════════════════════════════════
// TOKENS DE BOTÃO
// ══════════════════════════════════════════════════════════════

async function resolverToken(sock, msg, ctx, token) {
  const tk = String(token || '');
  if (tk === 'RPGTEC_MENU') { await listarTecnicas(sock, msg, ctx); return true; }
  let m = tk.match(/^RPGTEC_([a-z0-9_]+)$/i);
  if (m) {
    // Token de "aprender" — mas o mesmo id é usado na vitrine;
    // tentar aprender, e se falhar (já aprendida/bloqueada) mostra detalhes.
    const r = await aprenderTecnica(sock, msg, ctx, m[1]);
    return true;
  }
  m = tk.match(/^RPGTRN_([a-z]+)$/i);
  if (m) { await treinar(sock, msg, ctx, m[1].toLowerCase()); return true; }
  m = tk.match(/^RPGGACHA$/i);
  if (m) { await recrutar(sock, msg, ctx); return true; }
  // Personagem directo (vitrine)
  m = tk.match(/^RPGCHAR_([a-z0-9_]+)$/i);
  if (m) { await verPersonagem(sock, msg, ctx, m[1]); return true; }
  // Botão "Meus Aliados"
  if (tk === 'RPGALIA') { await mostrarAliados(sock, msg, ctx); return true; }
  return false;
}

module.exports = {
  RECRUTAR_CUSTO, TREINO_CUSTO, TREINOS,
  listarPersonagens, verPersonagem, recrutar, mostrarAliados,
  listarTecnicas, verTecnica, aprenderTecnica,
  menuTreino, treinar, resolverToken,
};
