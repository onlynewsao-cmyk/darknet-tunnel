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

/** Criações em curso: senderNumber → { step, name, gender, age, race, class, bio, appearance, stats, pointsLeft, expira } */
const _pendentes = new Map();
const TTL = 5 * 60 * 1000; // 5 minutos para completar

// Uma criação abandonada não pode aceitar um botão velho horas depois.
setInterval(() => {
  const agora = Date.now();
  for (const [num, pend] of _pendentes) if (!pend?.expira || agora > pend.expira) _pendentes.delete(num);
}, 60 * 1000).unref?.();

const _prefixo = (ctx) => ctx?.prefix || '!';

async function _avisar(sock, msg, ctx, texto) {
  return sock.sendMessage(ctx.remoteJid, { text: texto }, { quoted: msg }).catch(() => {});
}

/** Sessão válida e na etapa certa; evita cliques antigos saltarem/repetirem etapas. */
async function _pendente(sock, msg, ctx, etapa) {
  const pend = _pendentes.get(ctx.senderNumber);
  if (!pend || !pend.expira || Date.now() > pend.expira) {
    _pendentes.delete(ctx.senderNumber);
    await _avisar(sock, msg, ctx, '⌛ Esta criação expirou. Recomeça com *' + _prefixo(ctx) + 'rpgstart*.');
    return null;
  }
  if (pend.chatJid && pend.chatJid !== ctx.remoteJid) {
    await _avisar(sock, msg, ctx, '⚠️ A criação está a decorrer noutro chat. Continua lá ou recomeça aqui com *' + _prefixo(ctx) + 'rpgstart*.');
    return null;
  }
  if (etapa && pend.step !== etapa) {
    await _avisar(sock, msg, ctx, '⚠️ Esta escolha já não é da etapa actual (*' + pend.step + '*). Usa os botões/lista mais recentes ou *' + _prefixo(ctx) + 'rpgselecionar <número>*.');
    return null;
  }
  pend.expira = Date.now() + TTL; // cada acção válida renova os 5 min
  return pend;
}

function _nomeValido(valor) {
  const nome = String(valor || '').replace(/\s+/g, ' ').trim();
  if (nome.length < 2 || nome.length > 24 || /[\r\n]/.test(nome)) return '';
  return nome;
}

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
  { key: 'nobre', emoji: '👑', label: 'Nobre Caído', desc: 'Perdeu tudo, busca vingança ou redenção. +2 INT' },
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
  // Toda interface tem plano B escrito. Antes, quando a lista/carrossel não
  // renderizava, só saía o texto da pergunta — sem opções nem comando para avançar.
  const numeradas = (rows || []).map((r, i) => `${i + 1}. ${r.title}${r.description ? ` — ${r.description}` : ''}`).join('\n');
  const corpoComFallback = [
    corpo,
    '',
    numeradas,
    '',
    `👇 Toca numa opção. Se não aparecer botão/lista, escreve *${_prefixo(ctx)}rpgselecionar <número>*`,
  ].filter(Boolean).join('\n');

  // Carrossel com fotos. O corpo leva as opções numeradas para continuar a
  // funcionar em clientes que exibem o carrossel mas não devolvem o clique.
  if (Array.isArray(cards) && cards.length && sock.waUploadToServer) {
    try {
      const ok = await require('./carousel').enviarCarrossel(sock, msg, ctx, { corpo: corpoComFallback, rodape, cards });
      if (ok) return 'carousel';
    } catch {}
  }

  // Lista single_select — com TEMA RPG independente
  try {
    const corpoTema = rpgTheme.rpgRender('', [corpoComFallback]);
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

  // Fallback texto realmente seleccionável por .rpgselecionar <número>.
  await sock.sendMessage(ctx.remoteJid, { text: corpoComFallback }, { quoted: msg }).catch(() => {});
  return false;
}

// ══════════════════════════════════════════════════════════════
// WIZARD STEPS
// ══════════════════════════════════════════════════════════════

/** STEP 1: pede explicitamente o nome — nunca usa o pushName sem consentimento. */
async function _pedirNome(sock, msg, ctx) {
  const pend = { step: 'nome', chatJid: ctx.remoteJid, expira: Date.now() + TTL };
  _pendentes.set(ctx.senderNumber, pend);
  const p = _prefixo(ctx);
  return _avisar(sock, msg, ctx, [
    '🎭 *CRIAÇÃO DE PERSONAGEM — PASSO 1/7*',
    '',
    '🌌 Antes das listas, botões e carrosséis, escolhe o nome da tua personagem.',
    'O teu nome do WhatsApp não será usado automaticamente.',
    '',
    `Escreve: *${p}rpgnome <teu nome>*`,
    `Exemplo: *${p}rpgnome Kael Storm*`,
    '',
    '⌛ Tens 5 minutos para continuar.',
  ].join('\n'));
}

/** Nome recebido por comando → só agora abre a primeira lista (género). */
async function _stepNome(sock, msg, ctx, nome) {
  const pend = await _pendente(sock, msg, ctx, 'nome');
  if (!pend) return false;
  const name = _nomeValido(nome);
  if (!name) {
    await _avisar(sock, msg, ctx, '❌ O nome deve ter entre *2 e 24 caracteres*. Usa: *' + _prefixo(ctx) + 'rpgnome <nome>*.');
    return false;
  }
  pend.name = name;
  pend.stats = { str: 6, dex: 6, int: 6, vit: 6, luk: 6 };
  pend.pointsLeft = POINT_BUY_TOTAL;
  pend.step = 'genero';

  const corpo = [
    '🎭 *CRIAÇÃO DE PERSONAGEM — PASSO 2/7*',
    '',
    `📝 Nome: *${name}*`,
    '',
    'Escolhe o teu género:',
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
  const pend = await _pendente(sock, msg, ctx, 'genero');
  if (!pend) return false;
  const g = GENEROS.find(x => x.key === generoKey);
  if (!g) { await _avisar(sock, msg, ctx, '❌ Género inválido. Usa a lista mais recente.'); return false; }
  pend.gender = generoKey;
  pend.step = 'idade';
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
  const pend = await _pendente(sock, msg, ctx, 'idade');
  if (!pend) return false;
  const bonusIdade = IDADES.find(i => i.key === idadeKey);
  if (!bonusIdade) { await _avisar(sock, msg, ctx, '❌ Faixa etária inválida. Usa a lista mais recente.'); return false; }
  pend.ageKey = idadeKey;
  pend.age = idadeKey === 'jovem' ? 17 : idadeKey === 'adulto' ? 25 : idadeKey === 'maduro' ? 45 : 60;
  pend.step = 'raca';

  // Aplicar bónus de idade UMA vez; clique velho não passa da guarda de etapa.
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
  const pend = await _pendente(sock, msg, ctx, 'raca');
  if (!pend) return false;
  if (!rpg.RACES[raceKey]) { await _avisar(sock, msg, ctx, '❌ Raça inválida. Usa a lista/carrossel mais recente.'); return false; }
  pend.race = raceKey;
  pend.step = 'classe';

  // Aplicar bónus de raça. Algumas tabelas só expõem RACES.bonus;
  // outras têm ORIGINS.bonus. Aceita ambas sem aplicar duas vezes.
  const race = rpg.RACES[raceKey] || {};
  const bonusRaca = race.bonus || rpg.ORIGINS?.[raceKey]?.bonus;
  if (bonusRaca) {
    for (const [k, v] of Object.entries(bonusRaca)) {
      if (Object.prototype.hasOwnProperty.call(STAT_NAMES, k)) pend.stats[k] = (pend.stats[k] || 6) + Number(v || 0);
    }
  }
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
  const pend = await _pendente(sock, msg, ctx, 'classe');
  if (!pend) return false;
  if (!rpg.CLASSES[classKey]) { await _avisar(sock, msg, ctx, '❌ Classe inválida. Usa a lista/carrossel mais recente.'); return false; }
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
  const pend = await _pendente(sock, msg, ctx, 'bio');
  if (!pend) return false;

  const bioInfo = BIOS.find(b => b.key === bioKey);
  if (!bioInfo) { await _avisar(sock, msg, ctx, '❌ História inválida. Usa a lista mais recente.'); return false; }

  // "Escrever a minha" antes avançava directamente com esse texto como bio,
  // sem nunca dar ao jogador uma hipótese de a escrever.
  if (bioKey === 'custom') {
    pend.bioKey = 'custom';
    pend.step = 'bio_custom';
    const p = _prefixo(ctx);
    await _avisar(sock, msg, ctx, [
      '✏️ *A TUA BIOGRAFIA*',
      '',
      'Escreve uma história curta da tua personagem (4–260 caracteres).',
      `Usa: *${p}rpgbio <a tua história>*`,
      `Exemplo: *${p}rpgbio Fugi do reino e procuro a minha irmã perdida.*`,
    ].join('\n'));
    return true;
  }

  pend.bioKey = bioKey;
  pend.bio = bioInfo.label;
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

/** Recebe a biografia que o jogador optou por escrever. */
async function definirBio({ sock, msg, ctx, args }) {
  const pend = await _pendente(sock, msg, ctx, 'bio_custom');
  if (!pend) return false;
  const bio = String((args || []).join(' ')).replace(/\s+/g, ' ').trim();
  if (bio.length < 4 || bio.length > 260 || /[\r\n]/.test(bio)) {
    await _avisar(sock, msg, ctx, '❌ A biografia deve ter entre *4 e 260 caracteres*. Usa: *' + _prefixo(ctx) + 'rpgbio <história>*.');
    return false;
  }
  pend.bio = bio;
  pend.bioKey = 'custom';
  pend.step = 'stats';
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
    `> Usa: *${_prefixo(ctx)}rpgcr +str* / *${_prefixo(ctx)}rpgcr +dex* / *${_prefixo(ctx)}rpgcr -str* etc.`,
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
  const pend = await _pendente(sock, msg, ctx, 'stats');
  if (!pend) return false;

  const p = await rpg.getPlayer(ctx.senderNumber);
  p.name = pend.name;
  p.gender = pend.gender;
  p.age = pend.age;
  p.race = pend.race;
  p.class = pend.class;
  p.started = true;

  // Bio
  const bioInfo = BIOS.find(b => b.key === pend.bioKey);
  p.bio = pend.bio || (bioInfo ? bioInfo.label : 'Aventureiro');

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
    `> 🎮 Usa *${_prefixo(ctx)}status* para veres tudo.`,
    `> ⚔️ *${_prefixo(ctx)}lutar* — combate! | 🗺️ *${_prefixo(ctx)}viajar floresta* — explora!`,
    `> 🏋️ *${_prefixo(ctx)}treinar* — fica mais forte`,
    `> 🌌 *${_prefixo(ctx)}personagens* — os heróis do multiverso`,
    `> ✨ *${_prefixo(ctx)}tecnicas* — aprende os poderes deles`,
    `> 📖 *${_prefixo(ctx)}historia* — 8 mundos para viveres`,
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

  // O primeiro passo é sempre explícito: o jogador escolhe o nome num comando
  // próprio, antes de receber listas, botões ou carrosséis.
  return _pedirNome(sock, msg, ctx);
}

/** Comando !rpgnome <nome> — recebe o primeiro dado do wizard. */
async function definirNome({ sock, msg, ctx, args }) {
  return _stepNome(sock, msg, ctx, (args || []).join(' '));
}

/** Processa cliques dos botões/listas */
async function pick({ sock, msg, ctx, token }) {
  // Alguns clientes ainda devolvem IDs dos primeiros carrosséis
  // (RPGPICK_R_/RPGPICK_C_). Normaliza-os antes de processar os IDs actuais.
  const tk = String(token || '').trim().split(/\s+/)[0].replace(/^RPGPICK_/, 'RPGCR_');

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
    if (statKey === 'confirm') {
      await _stepFinalizar(sock, msg, ctx);
      return true;
    }
    const pend = await _pendente(sock, msg, ctx, 'stats');
    if (!pend) return true;
    if (!Object.prototype.hasOwnProperty.call(STAT_NAMES, statKey)) {
      await _avisar(sock, msg, ctx, '❌ Esse atributo não existe. Usa a lista de stats actual.');
      return true;
    }

    // +1 no stat
    if (pend.pointsLeft > 0 && pend.stats[statKey] !== undefined && pend.stats[statKey] < STAT_MAX) {
      pend.stats[statKey]++;
      pend.pointsLeft--;
      await _mostrarPointBuy(sock, msg, ctx, pend);
    } else {
      await _avisar(sock, msg, ctx, pend.pointsLeft <= 0 ? '❌ Sem pontos livres!' : `❌ ${STAT_NAMES[statKey]} já está no máximo (${STAT_MAX})!`);
    }
    return true;
  }

  return false;
}

/** Fallback escrito das listas/carrosséis: !rpgselecionar <número>. */
async function escolherNumero(sock, msg, ctx, numero) {
  // Se não há wizard deste jogador, deixa o !rpgescolher normal do RPG UI agir.
  if (!_pendentes.has(ctx.senderNumber)) return false;
  const pend = await _pendente(sock, msg, ctx);
  if (!pend) return true;
  const idx = Number(numero) - 1;
  if (!Number.isInteger(idx) || idx < 0) {
    await _avisar(sock, msg, ctx, '❌ Escolhe um número válido da lista actual.');
    return true;
  }

  if (pend.step === 'nome') {
    await _avisar(sock, msg, ctx, '📝 Primeiro define o nome: *' + _prefixo(ctx) + 'rpgnome <nome>*.');
    return true;
  }
  if (pend.step === 'genero') {
    if (!GENEROS[idx]) { await _avisar(sock, msg, ctx, '❌ Género inválido — escolhe entre 1 e ' + GENEROS.length + '.'); return true; }
    await _stepGenero(sock, msg, ctx, GENEROS[idx].key);
    return true;
  }
  if (pend.step === 'idade') {
    if (!IDADES[idx]) { await _avisar(sock, msg, ctx, '❌ Idade inválida — escolhe entre 1 e ' + IDADES.length + '.'); return true; }
    await _stepIdade(sock, msg, ctx, IDADES[idx].key);
    return true;
  }
  if (pend.step === 'raca') {
    const keys = Object.keys(rpg.RACES);
    if (!keys[idx]) { await _avisar(sock, msg, ctx, '❌ Raça inválida — escolhe entre 1 e ' + keys.length + '.'); return true; }
    await _stepRaca(sock, msg, ctx, keys[idx]);
    return true;
  }
  if (pend.step === 'classe') {
    const keys = Object.keys(rpg.CLASSES);
    if (!keys[idx]) { await _avisar(sock, msg, ctx, '❌ Classe inválida — escolhe entre 1 e ' + keys.length + '.'); return true; }
    await _stepClasse(sock, msg, ctx, keys[idx]);
    return true;
  }
  if (pend.step === 'bio') {
    if (!BIOS[idx]) { await _avisar(sock, msg, ctx, '❌ História inválida — escolhe entre 1 e ' + BIOS.length + '.'); return true; }
    await _stepBio(sock, msg, ctx, BIOS[idx].key);
    return true;
  }
  if (pend.step === 'bio_custom') {
    await _avisar(sock, msg, ctx, '✏️ Escreve a tua história com *' + _prefixo(ctx) + 'rpgbio <história>*.');
    return true;
  }
  if (pend.step === 'stats') {
    const stats = Object.keys(STAT_NAMES);
    if (idx === stats.length) { await _stepFinalizar(sock, msg, ctx); return true; }
    if (!stats[idx]) { await _avisar(sock, msg, ctx, '❌ Escolhe 1–' + (stats.length + 1) + ' na lista de stats.'); return true; }
    return pick({ sock, msg, ctx, token: 'RPGCR_S_' + stats[idx] });
  }
  await _avisar(sock, msg, ctx, '⚠️ Não reconheci a etapa actual. Recomeça com *' + _prefixo(ctx) + 'rpgstart*.');
  return true;
}

/** Comando escrito: !rpgcr +str / !rpgcr -dex */
async function ajustarStat(sock, msg, ctx, args) {
  const pend = await _pendente(sock, msg, ctx, 'stats');
  if (!pend) return;

  const arg = (args[0] || '').toLowerCase();
  const match = arg.match(/^([+-])(str|dex|int|vit|luk)$/);
  if (!match) {
    await sock.sendMessage(ctx.remoteJid, { text: '❓ Usa: ' + _prefixo(ctx) + 'rpgcr +str / ' + _prefixo(ctx) + 'rpgcr -dex / etc.' }, { quoted: msg }).catch(() => {});
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

module.exports = { start, definirNome, definirBio, pick, escolherNumero, ajustarStat, pendentes };
