/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║   DARK BOT — RPG CREATE FLOW (v9.23)                         ║
 * ║   Wizard completo: Nome → Género → Idade → Raça → Classe    ║
 * ║   → Bio → Aparência → Point-Buy Stats → Ficha final         ║
 * ║                                                               ║
 * ║   Tudo com botões/listas clicáveis + fallback escrito        ║
 * ╚══════════════════════════════════════════════════════════════╝
 */
'use strict';

const config = require('../../config');
const rpg = require('./engine');
const ui = require('./ui');
const rpgTheme = require('./rpgTheme');

/** Criações em curso: senderNumber → { step, name, gender, age, race, class, bio, appearance, stats, pointsLeft } */
const _pendentes = new Map();
const TTL = 5 * 60 * 1000; // 5 minutos para completar

function _norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function _acharRaca(txt) {
  const n = _norm(txt);
  if (!n) return '';
  if (rpg.RACES[n]) return n;
  for (const k of Object.keys(rpg.RACES)) if (_norm(k) === n) return k;
  return '';
}
function _acharClasse(txt) {
  const n = _norm(txt);
  if (!n) return '';
  if (rpg.CLASSES[n]) return n;
  for (const k of Object.keys(rpg.CLASSES)) if (_norm(k) === n) return k;
  return '';
}

// ══════════════════════════════════════════════════════════════
// GÉNEROS
// ══════════════════════════════════════════════════════════════
const GENEROS = [
  { key: 'masculino', emoji: '👨', label: 'Masculino', desc: 'Guerreiro, mago ou qualquer coisa — tu decides.' },
  { key: 'feminino',  emoji: '👩', label: 'Feminino',  desc: 'Guerreira, maga ou qualquer coisa — tu decides.' },
  { key: 'outro',     emoji: '🧑', label: 'Outro',     desc: 'Para além das categorias — livre como o vento.' },
];

// ══════════════════════════════════════════════════════════════
// IDADES (ranges)
// ══════════════════════════════════════════════════════════════
const IDADES = [
  { key: 'jovem', emoji: '🌱', label: 'Jovem (14-19)', desc: 'Inexperiente mas cheio de energia. +2 DEX, +1 LUK' },
  { key: 'adulto', emoji: '⚔️', label: 'Adulto (20-35)', desc: 'No auge da força. +2 STR, +1 VIT' },
  { key: 'maduro', emoji: '🧙', label: 'Maduro (36-55)', desc: 'Sabedoria e experiência. +2 INT, +1 VIT' },
  { key: 'anciao', emoji: '👴', label: 'Ancião (56+)', desc: 'Conhecimento profundo. +3 INT, +1 LUK, -1 STR' },
];

// ══════════════════════════════════════════════════════════════
// BIOS PRÉ-PRONTAS (o jogador pode escrever a dele)
// ══════════════════════════════════════════════════════════════
const BIOS = [
  { key: 'orfao', emoji: '💔', label: 'Órfão das Ruas', desc: 'Cresceu sozinho, aprendeu a sobreviver. +2 DEX, +1 LUK' },
  { key: 'nobre', emoji: '👑', label: 'Nobre Caído', desc: 'Perdeu tudo, busca vingança ou redenção. +2 INT, +1 CHA' },
  { key: 'soldado', emoji: '🎖️', label: 'Veterano de Guerra', desc: 'Viu batalhas, cicatrizes contam histórias. +2 STR, +1 VIT' },
  { key: 'sabio', emoji: '📚', label: 'Erudito', desc: 'Passou a vida entre livros e pergaminhos. +3 INT' },
  { key: 'viajante', emoji: '🗺️', label: 'Viajante', desc: 'Conhece terras distantes e culturas. +1 em tudo' },
  { key: 'ladrão', emoji: '🗝️', label: 'Ladrão Arrependido', desc: 'Das sombras para a luz. +2 DEX, +1 LUK' },
  { key: 'custom', emoji: '✏️', label: 'Escrever a minha', desc: 'Cria a tua própria história!' },
];

// ══════════════════════════════════════════════════════════════
// POINT-BUY SYSTEM (D&D style simplificado)
// ══════════════════════════════════════════════════════════════
const POINT_BUY_TOTAL = 12; // pontos livres para distribuir
const STAT_MIN = 3;
const STAT_MAX = 15;
const STAT_NAMES = { str: '⚔️ Força (STR)', dex: '🏃 Destreza (DEX)', int: '🔮 Inteligência (INT)', vit: '🛡️ Vitalidade (VIT)', luk: '🍀 Sorte (LUK)' };

// ══════════════════════════════════════════════════════════════
// ENVIO DE LISTAS
// ══════════════════════════════════════════════════════════════
async function _enviarLista(sock, msg, ctx, titulo, subtitulo, corpo, rows, rodape, cards) {
  // Carrossel com fotos
  if (Array.isArray(cards) && cards.length && sock.waUploadToServer) {
    try {
      const ok = await require('./carousel').enviarCarrossel(sock, msg, ctx, { corpo, rodape, cards });
      if (ok) return 'carousel';
    } catch {}
  }

  // Lista single_select — com TEMA RPG independente
  try {
    const corpoTema = rpgTheme.rpgRender('', [corpo]);
    const { generateWAMessageFromContent, proto } = require('@systemzero/baileys');
    const m = generateWAMessageFromContent(ctx.remoteJid, {
      interactiveMessage: proto.Message.InteractiveMessage.fromObject({
        body: proto.Message.InteractiveMessage.Body.fromObject({ text: corpoTema }),
        footer: proto.Message.InteractiveMessage.Footer.fromObject({ text: '⚔️ DarkNet RPG · O Teu Destino' }),
        header: proto.Message.InteractiveMessage.Header.fromObject({ title: '', hasMediaAttachment: false }),
        nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
          buttons: [{
            name: 'single_select',
            buttonParamsJson: JSON.stringify({
              title: titulo,
              sections: [{ title: subtitulo, rows }],
            }),
          }],
        }),
      }),
    }, { userJid: sock.user?.id, quoted: msg });
    await sock.relayMessage(ctx.remoteJid, m.message, {
      messageId: m.key.id,
      additionalNodes: [{ tag: 'biz', attrs: {}, content: [{
        tag: 'interactive', attrs: { type: 'native_flow', v: '1' },
        content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }],
      }]}],
    });
    return true;
  } catch (_) {}

  // Fallback texto
  await sock.sendMessage(ctx.remoteJid, { text: corpo }, { quoted: msg }).catch(() => {});
  return false;
}

// ══════════════════════════════════════════════════════════════
// WIZARD STEPS
// ══════════════════════════════════════════════════════════════

/** STEP 1: Pede o nome */
async function _stepNome(sock, msg, ctx, args) {
  const name = (args || []).join(' ').trim() || ctx.pushName || 'Aventureiro';
  const pend = { step: 'genero', name, stats: { str: 6, dex: 6, int: 6, vit: 6, luk: 6 }, pointsLeft: POINT_BUY_TOTAL };
  _pendentes.set(ctx.senderNumber, pend);

  const corpo = [
    `🎭 *CRIAÇÃO DE PERSONAGEM*`,
    ``,
    `📝 Nome: *${name}*`,
    ``,
    `Escolhe o teu género:`,
  ].join('\n');

  const rows = GENEROS.map(g => ({
    title: `${g.emoji} ${g.label}`,
    description: g.desc.slice(0, 72),
    id: `RPGCR_G_${g.key}`,
  }));

  return _enviarLista(sock, msg, ctx, '👨 GÉNERO', 'GÉNERO', corpo, rows, `🎭 ${config.bot.name} · RPG`);
}

/** STEP 2: Género escolhido → pede idade */
async function _stepGenero(sock, msg, ctx, generoKey) {
  const pend = _pendentes.get(ctx.senderNumber);
  if (!pend) return _stepNome(sock, msg, ctx, []);
  pend.gender = generoKey;
  pend.step = 'idade';

  const g = GENEROS.find(x => x.key === generoKey) || GENEROS[0];
  const corpo = [
    `🎭 *CRIAÇÃO DE PERSONAGEM*`,
    ``,
    `📝 Nome: *${pend.name}*`,
    `${g.emoji} Género: *${g.label}*`,
    ``,
    `Escolhe a tua faixa etária:`,
  ].join('\n');

  const rows = IDADES.map(i => ({
    title: `${i.emoji} ${i.label}`,
    description: i.desc.slice(0, 72),
    id: `RPGCR_I_${i.key}`,
  }));

  return _enviarLista(sock, msg, ctx, '🎂 IDADE', 'IDADE', corpo, rows, `🎭 ${config.bot.name} · RPG`);
}

/** STEP 3: Idade escolhida → pede raça */
async function _stepIdade(sock, msg, ctx, idadeKey) {
  const pend = _pendentes.get(ctx.senderNumber);
  if (!pend) return _stepNome(sock, msg, ctx, []);
  pend.ageKey = idadeKey;
  pend.age = idadeKey === 'jovem' ? 17 : idadeKey === 'adulto' ? 25 : idadeKey === 'maduro' ? 45 : 60;
  pend.step = 'raca';

  // Aplicar bónus de idade
  const bonusIdade = IDADES.find(i => i.key === idadeKey);
  if (bonusIdade) {
    if (idadeKey === 'jovem') { pend.stats.dex += 2; pend.stats.luk += 1; }
    else if (idadeKey === 'adulto') { pend.stats.str += 2; pend.stats.vit += 1; }
    else if (idadeKey === 'maduro') { pend.stats.int += 2; pend.stats.vit += 1; }
    else if (idadeKey === 'anciao') { pend.stats.int += 3; pend.stats.luk += 1; pend.stats.str -= 1; }
  }

  const corpo = [
    `🎭 *CRIAÇÃO DE PERSONAGEM*`,
    ``,
    `📝 Nome: *${pend.name}*`,
    `${GENEROS.find(g => g.key === pend.gender)?.emoji || '🧑'} ${GENEROS.find(g => g.key === pend.gender)?.label || pend.gender} · ${pend.age} anos`,
    ``,
    `Escolhe a tua raça:`,
  ].join('\n');

  const rows = Object.entries(rpg.RACES).map(([k, v]) => ({
    title: `${v.emoji} ${k.charAt(0).toUpperCase() + k.slice(1)}`,
    description: (v.desc || '').slice(0, 72),
    id: `RPGCR_R_${k}`,
  }));

  // Cards para carrossel
  const cards = Object.entries(rpg.RACES).map(([k, v]) => ({
    corpo: `${v.emoji} *${k.toUpperCase()}*\n${v.desc || ''}\n\n> Bónus: STR+${v.bonus?.str || 0} DEX+${v.bonus?.dex || 0} INT+${v.bonus?.int || 0} VIT+${v.bonus?.vit || 0} LUK+${v.bonus?.luk || 0}`,
    rodape: `🎭 ${config.bot.name} · RPG`,
    promptImg: `${k} fantasy RPG race portrait, dark epic anime style`,
    cacheKey: `race_${k}`,
    botoes: [{ texto: `${v.emoji} Ser ${k}`, id: `RPGCR_R_${k}` }],
  }));

  return _enviarLista(sock, msg, ctx, '🧬 RAÇA', 'RAÇAS', corpo, rows, `🎭 ${config.bot.name} · RPG`, cards);
}

/** STEP 4: Raça escolhida → pede classe */
async function _stepRaca(sock, msg, ctx, raceKey) {
  const pend = _pendentes.get(ctx.senderNumber);
  if (!pend) return _stepNome(sock, msg, ctx, []);
  pend.race = raceKey;
  pend.step = 'classe';

  // Aplicar bónus de raça
  const origem = rpg.ORIGINS?.[raceKey];
  if (origem?.bonus) {
    for (const [k, v] of Object.entries(origem.bonus)) {
      pend.stats[k] = (pend.stats[k] || 6) + v;
    }
  }

  const race = rpg.RACES[raceKey] || {};
  const corpo = [
    `🎭 *CRIAÇÃO DE PERSONAGEM*`,
    ``,
    `📝 Nome: *${pend.name}*`,
    `${GENEROS.find(g => g.key === pend.gender)?.emoji || '🧑'} ${pend.age}anos · ${race.emoji || '🧬'} ${raceKey}`,
    ``,
    `⚔️ Stats atuais: STR ${pend.stats.str} | DEX ${pend.stats.dex} | INT ${pend.stats.int} | VIT ${pend.stats.vit} | LUK ${pend.stats.luk}`,
    ``,
    `Escolhe a tua classe:`,
  ].join('\n');

  const rows = Object.entries(rpg.CLASSES).map(([k, v]) => ({
    title: `${v.emoji} ${k.charAt(0).toUpperCase() + k.slice(1)}`,
    description: (v.desc || '').slice(0, 72),
    id: `RPGCR_C_${k}`,
  }));

  const cards = Object.entries(rpg.CLASSES).map(([k, v]) => ({
    corpo: `${v.emoji} *${k.toUpperCase()}*\n${v.desc || ''}\n\n> Stat principal: ${STAT_NAMES[v.primary] || v.primary}`,
    rodape: `🎭 ${config.bot.name} · RPG`,
    promptImg: `${k} fantasy RPG hero class, dark epic anime style`,
    cacheKey: `classe_${k}`,
    botoes: [{ texto: `${v.emoji} Ser ${k}`, id: `RPGCR_C_${k}` }],
  }));

  return _enviarLista(sock, msg, ctx, '⚔️ CLASSE', 'CLASSES', corpo, rows, `🎭 ${config.bot.name} · RPG`, cards);
}

/** STEP 5: Classe escolhida → pede bio */
async function _stepClasse(sock, msg, ctx, classKey) {
  const pend = _pendentes.get(ctx.senderNumber);
  if (!pend) return _stepNome(sock, msg, ctx, []);
  pend.class = classKey;
  pend.step = 'bio';

  const cls = rpg.CLASSES[classKey] || {};
  const race = rpg.RACES[pend.race] || {};

  const corpo = [
    `🎭 *CRIAÇÃO DE PERSONAGEM*`,
    ``,
    `📝 *${pend.name}* · ${pend.age}anos`,
    `${GENEROS.find(g => g.key === pend.gender)?.emoji || '🧑'} ${race.emoji || '🧬'} ${pend.race} ${cls.emoji || '⚔️'} ${classKey}`,
    ``,
    `⚔️ STR ${pend.stats.str} | 🏃 DEX ${pend.stats.dex} | 🔮 INT ${pend.stats.int}`,
    `🛡️ VIT ${pend.stats.vit} | 🍀 LUK ${pend.stats.luk}`,
    ``,
    `Escolhe a tua história de fundo:`,
  ].join('\n');

  const rows = BIOS.map(b => ({
    title: `${b.emoji} ${b.label}`,
    description: b.desc.slice(0, 72),
    id: `RPGCR_B_${b.key}`,
  }));

  return _enviarLista(sock, msg, ctx, '📖 BIOGRAFIA', 'HISTÓRIA', corpo, rows, `🎭 ${config.bot.name} · RPG`);
}

/** STEP 6: Bio escolhida → point-buy stats */
async function _stepBio(sock, msg, ctx, bioKey) {
  const pend = _pendentes.get(ctx.senderNumber);
  if (!pend) return _stepNome(sock, msg, ctx, []);

  const bioInfo = BIOS.find(b => b.key === bioKey);
  pend.bioKey = bioKey;
  pend.bio = bioInfo ? bioInfo.label : 'Aventureiro';
  pend.step = 'stats';

  // Aplicar bónus de bio
  if (bioKey === 'orfao') { pend.stats.dex += 2; pend.stats.luk += 1; }
  else if (bioKey === 'nobre') { pend.stats.int += 2; }
  else if (bioKey === 'soldado') { pend.stats.str += 2; pend.stats.vit += 1; }
  else if (bioKey === 'sabio') { pend.stats.int += 3; }
  else if (bioKey === 'viajante') { pend.stats.str += 1; pend.stats.dex += 1; pend.stats.int += 1; pend.stats.vit += 1; pend.stats.luk += 1; }
  else if (bioKey === 'ladrão') { pend.stats.dex += 2; pend.stats.luk += 1; }

  return _mostrarPointBuy(sock, msg, ctx, pend);
}

/** Mostra a interface de point-buy */
async function _mostrarPointBuy(sock, msg, ctx, pend) {
  const statsTexto = Object.entries(pend.stats)
    .map(([k, v]) => `${STAT_NAMES[k] || k}: *${v}*`)
    .join('\n');

  const corpo = [
    `🎭 *ALOCAÇÃO DE STATS*`,
    ``,
    `📝 *${pend.name}* · ${pend.race} ${pend.class}`,
    ``,
    statsTexto,
    ``,
    `💎 Pontos livres: *${pend.pointsLeft}*`,
    ``,
    `> Usa: *!rpgcr +str* / *!rpgcr +dex* / *!rpgcr -str* etc.`,
    `> Ou toca numa opção abaixo para +1`,
  ].join('\n');

  const rows = Object.entries(STAT_NAMES).map(([k, label]) => ({
    title: `${label}: ${pend.stats[k]}`,
    description: `+1 ${label.split(' ')[1]} (${pend.pointsLeft} pts restantes)`,
    id: `RPGCR_S_${k}`,
  }));
  rows.push({
    title: '✅ Confirmar Stats',
    description: `Continuar com ${pend.pointsLeft} pontos por distribuir`,
    id: 'RPGCR_S_CONFIRM',
  });

  return _enviarLista(sock, msg, ctx, '💎 POINT-BUY', 'STATS', corpo, rows, `🎭 ${config.bot.name} · RPG`);
}

/** STEP 7: Stats confirmados → ficha final */
async function _stepFinalizar(sock, msg, ctx) {
  const pend = _pendentes.get(ctx.senderNumber);
  if (!pend) return;

  const p = await rpg.getPlayer(ctx.senderNumber);
  p.name = pend.name;
  p.gender = pend.gender;
  p.age = pend.age;
  p.race = pend.race;
  p.class = pend.class;
  p.started = true;

  // Bio
  const bioInfo = BIOS.find(b => b.key === pend.bioKey);
  p.bio = bioInfo ? bioInfo.label : 'Aventureiro';

  // Stats finais
  p.stats = { ...pend.stats };
  p.statPoints = pend.pointsLeft;

  // HP/MP baseados em stats
  p.maxHp = 100 + (p.stats.vit || 6) * 10;
  p.hp = p.maxHp;
  p.maxMp = 50 + (p.stats.int || 6) * 5;
  p.mp = p.maxMp;

  // Marcar bónus de raça como aplicado
  p.raceBonusApplied = true;

  // Equipamento inicial baseado na classe
  const equipInicial = {
    shinobi: { weapon: 'kunai', armor: null },
    pirata: { weapon: 'katana', armor: null },
    cacador: { weapon: 'kasaka', armor: null },
    feiticeiro: { weapon: 'cajado_gojo', armor: null },
    hashira: { weapon: 'nichirin', armor: null },
    saiyajin: { weapon: null, armor: null },
  };
  const eq = equipInicial[p.class] || {};
  if (eq.weapon && !p.equipment.weapon) p.equipment.weapon = eq.weapon;
  if (eq.armor && !p.equipment.armor) p.equipment.armor = eq.armor;

  // Skills iniciais da classe
  const skillsClasse = rpg.SKILLS?.[p.class];
  if (Array.isArray(skillsClasse) && !p.skills.length) {
    p.skills = skillsClasse.slice(0, 3).map(s => s.name);
  }

  await rpg.savePlayer(p);
  _pendentes.delete(ctx.senderNumber);

  // Mostrar ficha final
  const race = rpg.RACES[p.race] || {};
  const cls = rpg.CLASSES[p.class] || {};
  const rank = rpg.getRank(p.level);
  const g = GENEROS.find(x => x.key === p.gender);

  const linhas = [
    `${race.emoji || '🧬'} *${p.name.toUpperCase()}*`,
    `${g?.emoji || '🧑'} ${g?.label || ''} · ${p.age || '?'} anos`,
    `${race.emoji || '🧬'} ${p.race} ${cls.emoji || '⚔️'} ${p.class}`,
    `${rank.emoji} Rank ${rank.name} · Nível ${p.level}`,
    '',
    `❤️ ${p.maxHp} HP · 💙 ${p.maxMp} MP`,
    `⚔️ STR ${p.stats.str} · 🏃 DEX ${p.stats.dex} · 🔮 INT ${p.stats.int}`,
    `🛡️ VIT ${p.stats.vit} · 🍀 LUK ${p.stats.luk}`,
    '',
    `📖 Bio: *${p.bio}*`,
    `🎒 Equipamento: ${p.equipment.weapon || 'punhos'} ${p.equipment.armor || ''}`,
    `✨ Skills: ${p.skills.length ? p.skills.join(', ') : 'nenhuma'}`,
    '',
    `💰 ${p.coins} coins`,
    '',
    '> 🎮 Personagem criado! Usa *.rg* para ver a ficha.',
    '> ⚔️ Usa *!lutar* para combater!',
    '> 🗺️ Usa *!viajar floresta* para explorar!',
  ];

  await rpgTheme.rpgReply(sock, msg, ctx, '🎭 PERSONAGEM CRIADO', linhas);
}

// ══════════════════════════════════════════════════════════════
// API PRINCIPAL
// ══════════════════════════════════════════════════════════════

/** `!rpgstart [Nome]` — inicia o wizard */
async function start({ sock, msg, ctx, args, _forcar = false }) {
  // Verificar se já tem personagem
  if (!_forcar) {
    try {
      const atual = await rpg.peekPlayer(ctx.senderNumber);
      const tem = atual && (atual.started || atual.raceBonusApplied || (atual.name && atual.name !== 'Aventureiro'));
      if (tem) {
        return ui.confirmar(sock, msg, ctx, {
          titulo: `🎭 *${String(atual.name).toUpperCase()} JÁ EXISTE*`,
          linhas: [
            `${atual.race || '?'} ${atual.class || ''} · Nv.${atual.level || 1}`,
            `${atual.gender || '?'} · ${atual.age || '?'} anos`,
            'Refazer apaga tudo — recomeças do zero.',
          ],
          txtSim: '🔁 Refazer',
          txtNao: '🛡️ Manter',
          onSim: async ({ sock, msg, ctx }) => start({ sock, msg, ctx, args, _forcar: true }),
          onNao: async ({ sock, msg, ctx }) => {
            await sock.sendMessage(ctx.remoteJid, {
              text: `🛡️ *${atual.name}* continua intacto — personagem mantida.`,
            }, { quoted: msg }).catch(() => {});
          },
        });
      }
    } catch {}
  }

  return _stepNome(sock, msg, ctx, args);
}

/** Processa cliques dos botões/listas */
async function pick({ sock, msg, ctx, token }) {
  const tk = String(token || '');

  // Género
  let m = tk.match(/^RPGCR_G_(.+)$/i);
  if (m) {
    await _stepGenero(sock, msg, ctx, m[1].toLowerCase());
    return true;
  }

  // Idade
  m = tk.match(/^RPGCR_I_(.+)$/i);
  if (m) {
    await _stepIdade(sock, msg, ctx, m[1].toLowerCase());
    return true;
  }

  // Raça
  m = tk.match(/^RPGCR_R_(.+)$/i);
  if (m) {
    const race = _acharRaca(m[1]) || m[1].toLowerCase();
    await _stepRaca(sock, msg, ctx, race);
    return true;
  }

  // Classe
  m = tk.match(/^RPGCR_C_(.+)$/i);
  if (m) {
    const cls = _acharClasse(m[1]) || m[1].toLowerCase();
    await _stepClasse(sock, msg, ctx, cls);
    return true;
  }

  // Bio
  m = tk.match(/^RPGCR_B_(.+)$/i);
  if (m) {
    await _stepBio(sock, msg, ctx, m[1].toLowerCase());
    return true;
  }

  // Stats (point-buy)
  m = tk.match(/^RPGCR_S_(.+)$/i);
  if (m) {
    const statKey = m[1].toLowerCase();
    const pend = _pendentes.get(ctx.senderNumber);
    if (!pend) return false;

    if (statKey === 'confirm') {
      await _stepFinalizar(sock, msg, ctx);
      return true;
    }

    // +1 no stat
    if (pend.pointsLeft > 0 && pend.stats[statKey] !== undefined && pend.stats[statKey] < STAT_MAX) {
      pend.stats[statKey]++;
      pend.pointsLeft--;
      await _mostrarPointBuy(sock, msg, ctx, pend);
    } else {
      await sock.sendMessage(ctx.remoteJid, {
        text: pend.pointsLeft <= 0 ? '❌ Sem pontos livres!' : `❌ ${STAT_NAMES[statKey]} já está no máximo (${STAT_MAX})!`,
      }, { quoted: msg }).catch(() => {});
    }
    return true;
  }

  return false;
}

/** Comando escrito: !rpgcr +str / !rpgcr -dex */
async function ajustarStat(sock, msg, ctx, args) {
  const pend = _pendentes.get(ctx.senderNumber);
  if (!pend || pend.step !== 'stats') {
    await sock.sendMessage(ctx.remoteJid, { text: '🤔 Não estás na fase de stats. Usa !rpgstart primeiro.' }, { quoted: msg }).catch(() => {});
    return;
  }

  const arg = (args[0] || '').toLowerCase();
  const match = arg.match(/^([+-])(str|dex|int|vit|luk)$/);
  if (!match) {
    await sock.sendMessage(ctx.remoteJid, { text: '❓ Usa: !rpgcr +str / !rpgcr -dex / etc.' }, { quoted: msg }).catch(() => {});
    return;
  }

  const [, op, stat] = match;
  if (op === '+' && pend.pointsLeft > 0 && pend.stats[stat] < STAT_MAX) {
    pend.stats[stat]++;
    pend.pointsLeft--;
  } else if (op === '-' && pend.stats[stat] > STAT_MIN) {
    pend.stats[stat]--;
    pend.pointsLeft++;
  } else {
    await sock.sendMessage(ctx.remoteJid, {
      text: op === '+' ? '❌ Sem pontos ou stat no máximo!' : '❌ Stat no mínimo!',
    }, { quoted: msg }).catch(() => {});
    return;
  }

  await _mostrarPointBuy(sock, msg, ctx, pend);
}

function pendentes() { return _pendentes; }

module.exports = { start, pick, ajustarStat, pendentes };
