'use strict';
/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║   DARK BOT — RPG COMBAT SYSTEM v9.23                        ║
 * ║   Combate interactivo com botões: Atacar, Skill, Item,      ║
 * ║   Defender, Fugir. Cada turno o jogador ESCOLHE.            ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

const rpg = require('./engine');
const ui = require('./ui');
const config = require('../../config');
const rpgTheme = require('./rpgTheme');
const catalog = require('./catalog');
const visuals = require('./visuals');

const R = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const P = (a) => a[Math.floor(Math.random() * a.length)];

// ══════════════════════════════════════════════════════════════
// CALCULAR STATS REAIS (com equipamento)
// ══════════════════════════════════════════════════════════════

function getEffectiveStats(p) {
  const base = { ...p.stats };
  let bonusAtk = 0, bonusDef = 0;

  // Arma
  if (p.equipment?.weapon) {
    const arma = rpg.WEAPONS?.[p.equipment.weapon];
    if (arma) bonusAtk += arma.base_atk || 0;
  }

  // Armadura (por enquanto não há catálogo de armaduras, mas预留)
  // Futuramente: bonusDef += armor.def

  // v11.1: estratégia do jogador (escolhida com !estrategia)
  const strat = rpg.getStrategy ? rpg.getStrategy(p.strategy) : rpg.STRATEGIES?.equilibrada;
  const atkMult = strat?.atkMult ?? 1;
  const defMult = strat?.defMult ?? 1;

  // v11.2: bónus passivos de aliados recrutados + técnicas aprendidas
  const ab = catalog.allyBonus(p);
  const tb = catalog.techBonus(p);
  const allyAtk = ab.atk || 0;
  const allyHp = ab.hp || 0;
  const techAtkPct = tb.atk || 0;
  const techDefPct = tb.def || 0;
  const techCrit = tb.crit || 0;
  const techDodge = tb.dodge || 0;

  const baseAtk = 8 + (p.level || 1) * 2 + (base.str || 6) * 1.5 + bonusAtk + allyAtk;
  const baseDef = 3 + (p.level || 1) + (base.vit || 6) * 0.5 + bonusDef;

  return {
    str: base.str || 6,
    dex: base.dex || 6,
    int: base.int || 6,
    vit: base.vit || 6,
    luk: base.luk || 6,
    atkBonus: bonusAtk + allyAtk,
    defBonus: bonusDef,
    totalAtk: baseAtk * atkMult * (1 + techAtkPct),
    totalDef: baseDef * defMult * (1 + techDefPct),
    critChance: Math.min(0.6, 0.08 + (base.luk || 6) * 0.01 + (base.dex || 6) * 0.005 + (strat?.critBonus || 0) + techCrit),
    dodgeChance: Math.min(0.65, 0.05 + (base.dex || 6) * 0.01 + (strat?.dodgeBonus || 0) + techDodge),
    allyHp: allyHp, // exibido na ficha
  };
}

// ══════════════════════════════════════════════════════════════
// CALCULAR DANO (com stats reais)
// ══════════════════════════════════════════════════════════════

function calcDamage(atacante, alvo, tipo = 'basic') {
  const atk = Number(
    atacante?.totalAtk ?? atacante?.atk ?? atacante?.str ??
    (atacante?.stats ? 8 + (atacante.level || 1) * 2 + (atacante.stats.str || 0) * 1.5 : 10)
  );
  const def = Number(
    alvo?.totalDef ?? alvo?.def ?? alvo?.vit ??
    (alvo?.stats ? 3 + (alvo.level || 1) + (alvo.stats.vit || 0) * 0.5 : 5)
  );

  const mults = {
    basic: 1.0,
    heavy: 1.6,
    skill: 1.8,
    ultimate: 2.5,
    magic: 1.4,
    counter: 1.3,
    defend: 0, // não causa dano
  };
  const mult = mults[tipo] || 1;

  const base = Math.max(1, atk * mult - def * 0.4);
  const variacao = 0.85 + Math.random() * 0.3;
  const critChance = atacante?.critChance || 0.1;
  const critico = Math.random() < critChance;
  const dodgeChance = alvo?.dodgeChance || 0.05;
  const dodge = Math.random() < dodgeChance;

  if (dodge) return { dano: 0, critico: false, dodge: true, tipo };

  const dano = Math.max(1, Math.round(base * variacao * (critico ? 1.8 : 1)));
  return { dano, critico, dodge: false, tipo };
}

// ══════════════════════════════════════════════════════════════
// ESTADO DE COMBATE EM CURSO
// ══════════════════════════════════════════════════════════════

const _combates = new Map(); // senderNumber → { enemy, playerHp, playerMp, round, log, defending, buffs }
const COMBAT_TTL = 3 * 60 * 1000;


// Momentos táticos: interrompem brevemente o turno e dão uma decisão real ao
// jogador. As opções podem criar vantagem, custo, armadilha ou risco.
const MOMENTOS_BATALHA = [
  {
    id: 'ponte_fracturada', emoji: '🪤', titulo: 'Piso em Ruínas',
    texto: 'O golpe abre fendas no chão. Pedras soltas caem e o inimigo avança por entre a poeira.',
    escolhas: ['🛡️ Firmar posição', '🏃 Saltar para a abertura', '⚔️ Usar os destroços'],
  },
  {
    id: 'runa_explosiva', emoji: '🔮', titulo: 'Runa Escondida',
    texto: 'Uma runa acende-se sob os teus pés. Há energia suficiente para ferir os dois lados.',
    escolhas: ['🧠 Desarmar a runa', '🛡️ Absorver o impacto', '🔥 Atravessar a explosão'],
  },
  {
    id: 'eco_aliado', emoji: '🕯️', titulo: 'Eco de um Aliado',
    texto: 'Uma voz do passado atravessa o campo de batalha e revela por um instante uma brecha na defesa inimiga.',
    escolhas: ['🤝 Seguir a voz', '👁️ Estudar a brecha', '💰 Recolher o talismã'],
  },
  {
    id: 'nevoa_maldicao', emoji: '🌑', titulo: 'Névoa da Maldição',
    texto: 'Uma névoa fria envolve a arena. Ela promete poder imediato, mas cobra um preço a cada respiração.',
    escolhas: ['✨ Purificar a névoa', '⚡ Aceitar o poder', '🍀 Quebrar o foco inimigo'],
  },
];

function _narrativaEntrada(enemy, p) {
  if (enemy.boss) return '📖 O ar pesa quando *' + enemy.name + '* entra na arena. Esta vitória pode mudar o teu destino.';
  const cenas = [
    '📖 O terreno estremece. ' + enemy.name + ' observa cada movimento de ' + p.name + '.',
    '📖 Um silêncio estranho cai sobre a arena. Algo neste combate não será comum.',
    '📖 Marcas antigas brilham no chão: há perigos e oportunidades escondidos aqui.',
  ];
  return P(cenas);
}

function _efeitoTatico(c, efeito) {
  c.tactical = {
    nome: efeito.nome,
    emoji: efeito.emoji || '✨',
    atkMult: efeito.atkMult || 1,
    defMult: efeito.defMult || 1,
    dodgeBonus: efeito.dodgeBonus || 0,
    enemyDefMult: efeito.enemyDefMult || 1,
    turns: Math.max(1, efeito.turns || 2),
  };
}

function _statsTaticos(c, p) {
  const t = c.tactical || {};
  const atkBuff = 1 + ((c.buffs?.atkBuff || 0) / 100);
  return {
    ...c.stats,
    level: p.level,
    totalAtk: c.stats.totalAtk * atkBuff * (t.atkMult || 1),
    totalDef: c.stats.totalDef * (t.defMult || 1),
    critChance: Math.min(0.8, (c.stats.critChance || 0.1) + (t.critBonus || 0)),
    dodgeChance: Math.min(0.75, (c.stats.dodgeChance || 0.05) + (t.dodgeBonus || 0)),
  };
}

function _inimigoTatico(c) {
  const t = c.tactical || {};
  return { ...c.enemy, def: Math.max(0, c.enemy.def * (t.enemyDefMult || 1)) };
}

function _testeAtributo(stats, atributo, base = 0.35) {
  const valor = Number(stats?.[atributo] || 0);
  const sorte = Number(stats?.luk || 0);
  return Math.random() < Math.min(0.9, base + valor / 28 + sorte / 120);
}

function _talvezMomento(c) {
  if (c.momentoPendente) return;
  if (!Array.isArray(c.eventosVistos)) c.eventosVistos = [];
  c.eventosResolvidos = c.eventosResolvidos || 0;
  const limite = c.enemy.boss ? 3 : 2;
  if (c.eventosResolvidos >= limite) return;
  const primeiro = c.round === 2 && c.eventosResolvidos === 0;
  const recorrente = c.round >= 4 && c.round % 3 === 0 && Math.random() < (c.enemy.boss ? 0.75 : 0.5);
  if (!primeiro && !recorrente) return;
  const disponiveis = MOMENTOS_BATALHA.filter(e => !c.eventosVistos.includes(e.id));
  const momento = P(disponiveis.length ? disponiveis : MOMENTOS_BATALHA);
  c.momentoPendente = momento;
  c.eventosVistos.push(momento.id);
}

function _expirarEfeitoTatico(c) {
  if (!c.tactical) return;
  c.tactical.turns--;
  if (c.tactical.turns <= 0) {
    c.log.push('⌛ A vantagem *' + c.tactical.nome + '* desapareceu.');
    c.tactical = null;
  }
}

// Skills não podem ser repetidas no clique seguinte. A recarga é curta para
// manter o combate rápido, mas força alternância entre ataque, defesa e MP.
function _recargaRestante(c, chave) {
  const valor = c.cooldowns?.[chave];
  return Math.max(0, Number(typeof valor === 'object' ? valor.turns : valor) || 0);
}

function _iniciarRecarga(c, chave, skill) {
  if (!c.cooldowns) c.cooldowns = {};
  const base = Number(skill?.cooldown || (Number(skill?.cost || 0) >= 35 ? 2 : 1));
  const turnos = Math.min(3, Math.max(1, base));
  // +1 porque a contagem avança no fim do turno que lançou a técnica.
  c.cooldowns[chave] = { turns: turnos + 1, nome: skill?.name || 'Skill' };
}

function _avancarRecargas(c) {
  if (!c.cooldowns) return;
  for (const [chave, valor] of Object.entries(c.cooldowns)) {
    const dados = typeof valor === 'object' ? valor : { turns: Number(valor) || 0, nome: chave };
    dados.turns--;
    if (dados.turns <= 0) {
      delete c.cooldowns[chave];
      c.log.push(`✨ *${dados.nome}* está pronta novamente.`);
    } else c.cooldowns[chave] = dados;
  }
}

function _expirarBuffsDeSkill(c) {
  if (!c.buffs?.atkBuffTurns) return;
  c.buffs.atkBuffTurns--;
  if (c.buffs.atkBuffTurns <= 0) {
    c.buffs.atkBuff = 0;
    delete c.buffs.atkBuffTurns;
    c.log.push('⌛ O reforço de ataque da tua skill desapareceu.');
  }
}

function _resumoEfeitoTatico(tatico) {
  if (!tatico) return '';
  const efeitos = [];
  const pct = (n) => Math.round((n - 1) * 100);
  if (tatico.atkMult && tatico.atkMult !== 1) efeitos.push(`ATK ${pct(tatico.atkMult) >= 0 ? '+' : ''}${pct(tatico.atkMult)}%`);
  if (tatico.defMult && tatico.defMult !== 1) efeitos.push(`DEF ${pct(tatico.defMult) >= 0 ? '+' : ''}${pct(tatico.defMult)}%`);
  if (tatico.dodgeBonus) efeitos.push(`ESQ +${Math.round(tatico.dodgeBonus * 100)}%`);
  if (tatico.enemyDefMult && tatico.enemyDefMult !== 1) efeitos.push(`DEF inimigo ${pct(tatico.enemyDefMult)}%`);
  return efeitos.length ? `${tatico.emoji} ${efeitos.join(' · ')}` : '';
}

function _avisoRisco(c) {
  const referencia = Math.max(1, c.enemy.atk || 1);
  const proporcao = c.playerHp / referencia;
  if (proporcao <= 2) return '☠️ *PERIGO CRÍTICO* — defender ou usar poção pode salvar-te.';
  if (proporcao <= 4) return '⚠️ *Perigo alto* — o próximo golpe pode decidir a luta.';
  return '🟢 *Risco controlado* — mantém a pressão.';
}

function _rotuloSkill(c, chave, skill, fallback = 'Skill') {
  if (!skill) return `✨ ${fallback}`;
  const cd = _recargaRestante(c, chave);
  const nome = `${skill.emoji || '✨'} ${skill.name || fallback}`.slice(0, 21);
  return cd ? `⌛ ${nome} · ${cd}T` : `${nome} · ${skill.cost || 0}MP`;
}

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of _combates) if (now > v.expira) _combates.delete(k);
}, 60000).unref?.();

// ══════════════════════════════════════════════════════════════
// INICIAR COMBATE
// ══════════════════════════════════════════════════════════════

/**
 * Inicia combate contra um boss definido pela história. Mantém o mesmo motor
 * de turnos, mas não substitui o inimigo por um mob aleatório.
 */
async function iniciarCombateBoss(sock, msg, ctx, boss = {}, onVictory = null) {
  const p = await rpg.getPlayer(ctx.senderNumber);
  if (p.hp <= 0) return tReply(sock, msg, ctx, '💀 MORTO', ['💀 Estás morto! Usa ' + (ctx.prefix || '!') + 'descansar ou ' + (ctx.prefix || '!') + 'pocao']);
  if (p.lives <= 0) return tReply(sock, msg, ctx, '💀 SEM VIDAS', ['💀 Sem vidas! Usa ' + (ctx.prefix || '!') + 'reviver']);
  if (!boss.nome || !Number(boss.hp) || !Number(boss.atk)) return tReply(sock, msg, ctx, '❌ BOSS', ['Este boss não está configurado correctamente.']);

  const enemy = {
    name: String(boss.nome), emoji: boss.emoji || '👑',
    level: Number(boss.level || p.level || 1), boss: true,
    hp: Math.max(1, Number(boss.hp)), maxHp: Math.max(1, Number(boss.hp)),
    atk: Math.max(1, Number(boss.atk)), def: Math.max(0, Number(boss.def || 0)),
    habilidades: Array.isArray(boss.habilidades) ? boss.habilidades : [],
  };
  _combates.set(ctx.senderNumber, {
    enemy,
    playerHp: p.hp,
    playerMp: p.mp || 80,
    maxHp: p.maxHp,
    maxMp: p.maxMp,
    round: 1,
    log: [_narrativaEntrada(enemy, p)],
    defending: false,
    buffs: {},
    cooldowns: {},
    processando: false,
    momentoPendente: null,
    eventosVistos: [],
    eventosResolvidos: 0,
    tactical: null,
    // A imagem sai só depois das duas mensagens textuais e dos controlos.
    // Conserva a sequência que torna o combate legível e não bloqueia o turno.
    visualPendente: true,
    expira: Date.now() + COMBAT_TTL,
    stats: getEffectiveStats(p),
    onVictory: typeof onVictory === 'function' ? onVictory : null,
  });
  return _mostrarEstado(sock, msg, ctx, p);
}

async function iniciarCombate(sock, msg, ctx, tipo = 'normal') {
  const p = await rpg.getPlayer(ctx.senderNumber);
  if (p.hp <= 0) {
    return tReply(sock, msg, ctx, '💀 MORTO', ['💀 Estás morto! Usa !descansar ou !pocao']);
  }
  if (p.lives <= 0) {
    return tReply(sock, msg, ctx, '💀 SEM VIDAS', ['💀 Sem vidas! Usa !reviver']);
  }

  const nivelInimigo = Math.max(1, p.level + R(-2, 3));
  const enemy = rpg.generateEnemy(nivelInimigo, tipo);
  const stats = getEffectiveStats(p);

  _combates.set(ctx.senderNumber, {
    enemy,
    playerHp: p.hp,
    playerMp: p.mp || 80,
    maxHp: p.maxHp,
    maxMp: p.maxMp,
    round: 1,
    log: [_narrativaEntrada(enemy, p)],
    defending: false,
    buffs: {},
    cooldowns: {},
    processando: false,
    momentoPendente: null,
    eventosVistos: [],
    eventosResolvidos: 0,
    tactical: null,
    // Enviada uma vez por combate, já depois do status/narrativa/botões.
    visualPendente: true,
    expira: Date.now() + COMBAT_TTL,
    stats,
  });

  return _mostrarEstado(sock, msg, ctx, p);
}

// ══════════════════════════════════════════════════════════════
// MOSTRAR ESTADO DO COMBATE (com botões)
// ══════════════════════════════════════════════════════════════

async function _mostrarEstado(sock, msg, ctx, p) {
  const c = _combates.get(ctx.senderNumber);
  if (!c) return;

  const hpBar = (cur, max, len = 8) => {
    const filled = Math.max(0, Math.min(len, Math.round((cur / max) * len)));
    return '█'.repeat(filled) + '░'.repeat(len - filled);
  };
  const skillsDisponiveis = (rpg.SKILLS?.[p.class] || []).slice(0, 4);
  const skillPrimaria = skillsDisponiveis[0];
  const skillSecundaria = skillsDisponiveis[1];
  const temPocao = p.inventory?.includes('poção de vida');
  const strat = rpg.getStrategy ? rpg.getStrategy(p.strategy) : null;
  const momento = c.momentoPendente;

  // O combate é entregue em três mensagens, sempre na mesma ordem:
  // 1) status, 2) narrativa/resultados do turno, 3) acções clicáveis.
  // Assim os textos da batalha não se perdem no meio da ficha e os botões
  // ficam numa mensagem limpa, sem repetir as opções no corpo.
  const status = [
    `⚔️ *ROUND ${c.round} — COMBATE*`,
    strat ? `🧠 Estratégia: *${strat.emoji} ${strat.name}*` : '',
    '',
    `${c.enemy.emoji} *${c.enemy.name}* (Nv.${c.enemy.level})${c.enemy.boss ? ' 👑 BOSS' : ''}`,
    `❤️ ${hpBar(c.enemy.hp, c.enemy.maxHp)} ${c.enemy.hp}/${c.enemy.maxHp}`,
    `⚔️ ATK: ${c.enemy.atk} | 🛡️ DEF: ${c.enemy.def}`,
    '',
    `${p.race ? rpg.RACES[p.race]?.emoji || '🧑' : '🧑'} *${p.name}* (Nv.${p.level})`,
    `❤️ ${hpBar(c.playerHp, c.maxHp)} ${c.playerHp}/${c.maxHp}`,
    `💙 ${c.playerMp}/${c.maxMp} MP`,
    c.tactical ? `${c.tactical.emoji} *Vantagem: ${c.tactical.nome}* · ${c.tactical.turns} turno(s)` : '',
    _resumoEfeitoTatico(c.tactical),
    _recargaRestante(c, 'skill') ? `⌛ ${skillPrimaria?.name || 'Skill'}: ${_recargaRestante(c, 'skill')} turno(s)` : '',
    _recargaRestante(c, 'skill2') ? `⌛ ${skillSecundaria?.name || 'Skill extra'}: ${_recargaRestante(c, 'skill2')} turno(s)` : '',
    '',
    _avisoRisco(c),
  ].filter(Boolean).join('\n');

  const narrativa = [
    '📜 *BATALHA*',
    ...c.log.slice(-4).map(l => `• ${l}`),
    momento ? `🎭 *MOMENTO ÚNICO — ${momento.titulo}*` : '',
    momento ? momento.texto : '',
    momento ? '> A tua decisão muda o rumo desta batalha.' : '',
  ].filter(Boolean).join('\n');

  const turnoId = `T${c.round}_`;
  let botoes;
  if (momento) {
    botoes = momento.escolhas.map((texto, index) => ({
      id: 'RPGFIGHT_EVENT_' + turnoId + momento.id + '_' + (index + 1),
      text: texto.slice(0, 32),
    }));
  } else {
    botoes = [
      { id: 'RPGFIGHT_' + turnoId + 'basic', text: '⚔️ Atacar' },
      { id: 'RPGFIGHT_' + turnoId + 'skill', text: _rotuloSkill(c, 'skill', skillPrimaria) },
    ];
    if (temPocao) botoes.push({ id: 'RPGFIGHT_' + turnoId + 'item', text: '🧪 Poção (+HP)' });
    botoes.push({ id: 'RPGFIGHT_' + turnoId + 'defend', text: '🛡️ Defender (-50%)' });
    botoes.push({ id: 'RPGFIGHT_' + turnoId + 'flee', text: '🏃 Fugir' });
    if (skillSecundaria) botoes.push({ id: 'RPGFIGHT_' + turnoId + 'skill2', text: _rotuloSkill(c, 'skill2', skillSecundaria, 'Skill extra') });
  }

  const controlos = momento
    ? '🎭 *DECISÃO TÁTICA*\n> Escolhe uma opção nos botões abaixo.'
    : '🎮 *AÇÕES DE COMBATE*\n> Escolhe a tua ação nos botões abaixo. Skills usam MP e têm recarga.';

  // Não juntar estas sessões: a ordem torna o combate legível no WhatsApp.
  await sock.sendMessage(ctx.remoteJid, { text: status }, { quoted: msg }).catch(() => {});
  await sock.sendMessage(ctx.remoteJid, { text: narrativa || '📜 *BATALHA*\n> O combate continua…' }, { quoted: msg }).catch(() => {});
  try {
    const enviado = await ui._enviarBotoes?.(sock, msg, ctx, controlos, botoes) || await _enviarBotoes(sock, msg, ctx, controlos, botoes);
    if (!enviado) await sock.sendMessage(ctx.remoteJid, { text: controlos }, { quoted: msg }).catch(() => {});
  } catch {
    await sock.sendMessage(ctx.remoteJid, { text: controlos }, { quoted: msg }).catch(() => {});
  }

  // Não antecede nem substitui as três sessões do combate. O asset é local e
  // tem falha silenciosa: sem upload/media, a aventura continua imediatamente.
  if (c.visualPendente) {
    c.visualPendente = false;
    await visuals.sendCombatScene(sock, msg, ctx, p, c.enemy).catch(() => {});
  }
}

// Enviar botões (helper)
async function _enviarBotoes(sock, msg, ctx, corpo, botoes) {
  try {
    const { generateWAMessageFromContent, proto } = require('@systemzero/baileys');
    const m = generateWAMessageFromContent(ctx.remoteJid, {
      interactiveMessage: proto.Message.InteractiveMessage.fromObject({
        body: { text: corpo },
        footer: { text: '⚔️ RPG Combat · escolhe rápido!' },
        header: { title: '', hasMediaAttachment: false },
        nativeFlowMessage: {
          buttons: botoes.map(b => ({
            name: 'quick_reply',
            buttonParamsJson: JSON.stringify({ display_text: b.text, id: b.id }),
          })),
        },
      }),
    }, { userJid: sock.user?.id, quoted: msg });
    await sock.relayMessage(ctx.remoteJid, m.message, {
      messageId: m.key.id,
      additionalNodes: [{ tag: 'biz', attrs: {}, content: [{
        tag: 'interactive', attrs: { type: 'native_flow', v: '1' },
        content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }],
      }] }],
    });
    return true;
  } catch { return false; }
}

// ══════════════════════════════════════════════════════════════
// PROCESSAR ESCOLHA DO JOGADOR
// ══════════════════════════════════════════════════════════════

// Impede clique duplo de resolver dois turnos em paralelo enquanto o primeiro
// ainda está a guardar o jogador ou a enviar as três sessões.
async function processarEscolha(sock, msg, ctx, acao) {
  const c = _combates.get(ctx.senderNumber);
  if (!c) return _processarEscolha(sock, msg, ctx, acao);
  if (c.processando) {
    await sock.sendMessage(ctx.remoteJid, { text: '⏳ A ação anterior ainda está a ser resolvida.' }, { quoted: msg }).catch(() => {});
    return true;
  }
  c.processando = true;
  try {
    return await _processarEscolha(sock, msg, ctx, acao);
  } finally {
    if (_combates.get(ctx.senderNumber) === c) c.processando = false;
  }
}

async function _processarEscolha(sock, msg, ctx, acao) {
  const c = _combates.get(ctx.senderNumber);
  if (!c) {
    await sock.sendMessage(ctx.remoteJid, { text: '⏳ Não tens combate em curso. Usa *!lutar*' }, { quoted: msg }).catch(() => {});
    return;
  }
  const p = await rpg.getPlayer(ctx.senderNumber);
  if (c.momentoPendente) return _mostrarEstado(sock, msg, ctx, p);

  const stats = _statsTaticos(c, p);
  const enemy = _inimigoTatico(c);
  let danoJogador = 0;
  let msgJogador = '';
  let custoMp = 0;
  c.defending = false;
  const skillsClasse = rpg.SKILLS?.[p.class] || [];

  switch (acao) {
    case 'basic': {
      const resultado = calcDamage({ ...stats, critChance: stats.critChance }, enemy);
      danoJogador = resultado.dano;
      if (resultado.dodge) msgJogador = `⚔️ ${p.name} ataca mas ${c.enemy.name} esquiva!`;
      else if (resultado.critico) msgJogador = `💥 CRÍTICO! ${p.name} → ${danoJogador} dmg!`;
      else msgJogador = `⚔️ ${p.name} ataca → ${danoJogador} dmg`;
      break;
    }
    case 'skill': {
      const skill = skillsClasse[0];
      const recarga = _recargaRestante(c, 'skill');
      if (!skill || c.playerMp < (skill.cost || 10)) {
        msgJogador = skill ? `💙 Sem MP para ${skill.name}! Atacas normalmente.` : '❌ Sem skills! Ataca normalmente.';
        danoJogador = calcDamage(stats, enemy).dano;
      } else if (recarga) {
        danoJogador = calcDamage(stats, enemy).dano;
        msgJogador = `⌛ *${skill.name}* recarrega por mais ${recarga} turno(s). Atacas → ${danoJogador} dmg.`;
      } else {
        custoMp = skill.cost || 10;
        _iniciarRecarga(c, 'skill', skill);
        if (skill.type === 'atk') {
          const r = calcDamage({ ...stats, totalAtk: stats.totalAtk + (skill.power || 0) * 0.3 }, enemy);
          danoJogador = r.dano;
          msgJogador = r.critico ? `💥 ${skill.emoji} *${skill.name}* CRÍTICO → ${danoJogador} dmg!` : `${skill.emoji} *${skill.name}* → ${danoJogador} dmg! (-${custoMp} MP)`;
        } else if (skill.type === 'buff') {
          c.buffs.atkBuff = (c.buffs.atkBuff || 0) + (skill.power || 30);
          c.buffs.atkBuffTurns = Math.max(c.buffs.atkBuffTurns || 0, 3);
          msgJogador = `${skill.emoji} *${skill.name}* activo! +${skill.power || 30}% ATK por 2 turnos (-${custoMp} MP)`;
        } else if (skill.type === 'def') {
          c.defending = true;
          c.buffs.defBuff = (c.buffs.defBuff || 0) + 50;
          msgJogador = `${skill.emoji} *${skill.name}* activo! Defesa aumentada (-${custoMp} MP)`;
        } else {
          danoJogador = calcDamage({ ...stats, totalAtk: stats.totalAtk * 1.5 }, enemy).dano;
          msgJogador = `${skill.emoji} *${skill.name}* → ${danoJogador} dmg! (-${custoMp} MP)`;
        }
      }
      break;
    }
    case 'skill2': {
      const skill = skillsClasse[1];
      const recarga = _recargaRestante(c, 'skill2');
      if (!skill || c.playerMp < (skill.cost || 15)) {
        msgJogador = skill ? `💙 Sem MP para ${skill.name}! Atacas normalmente.` : '❌ Sem skill extra! Atacas normalmente.';
        danoJogador = calcDamage(stats, enemy).dano;
      } else if (recarga) {
        danoJogador = calcDamage(stats, enemy).dano;
        msgJogador = `⌛ *${skill.name}* recarrega por mais ${recarga} turno(s). Atacas → ${danoJogador} dmg.`;
      } else {
        custoMp = skill.cost || 15;
        _iniciarRecarga(c, 'skill2', skill);
        const mult = skill.type === 'atk' ? 0.3 : 0.4;
        danoJogador = calcDamage({ ...stats, totalAtk: stats.totalAtk + (skill.power || 0) * mult }, enemy).dano;
        msgJogador = `${skill.emoji} *${skill.name}* → ${danoJogador} dmg! (-${custoMp} MP)`;
      }
      break;
    }
    case 'item': {
      const idx = p.inventory?.indexOf('poção de vida');
      if (idx === -1 || idx === undefined) {
        msgJogador = '🧪 Sem poções! Atacas em desespero.';
        danoJogador = calcDamage(stats, enemy).dano;
      } else {
        p.inventory.splice(idx, 1);
        const cura = Math.min(60, c.maxHp - c.playerHp);
        c.playerHp += cura;
        msgJogador = `🧪 Poção usada! +${cura} HP ❤️`;
      }
      break;
    }
    case 'defend': {
      c.defending = true;
      msgJogador = `🛡️ ${p.name} levanta a guarda! -50% dano neste turno.`;
      danoJogador = Math.round(calcDamage(stats, enemy).dano * 0.3);
      if (danoJogador > 0) msgJogador += ` (contra-ataque: ${danoJogador} dmg)`;
      break;
    }
    case 'flee': {
      const chance = 0.3 + (stats.dex * 0.02) + (stats.luk * 0.01);
      if (Math.random() < chance || c.enemy.boss === false) {
        _combates.delete(ctx.senderNumber);
        await rpg.savePlayer(p);
        return tReply(sock, msg, ctx, '🏃 FUGA', [`${p.name} fugiu do combate!`, '💚 Sobreveves para lutar outro dia.']);
      }
      msgJogador = `🏃 Tentaste fugir mas ${c.enemy.name} bloqueou o caminho!`;
      break;
    }
    default:
      return _mostrarEstado(sock, msg, ctx, p);
  }

  c.enemy.hp = Math.max(0, c.enemy.hp - danoJogador);
  c.playerMp = Math.max(0, c.playerMp - custoMp);
  if (msgJogador) c.log.push(msgJogador);
  if (c.enemy.hp <= 0) return _vitoria(sock, msg, ctx, p, c);

  const defMult = c.defending ? 0.5 : 1;
  const defBuffMult = c.buffs.defBuff ? (1 - c.buffs.defBuff / 100) : 1;
  const eAtk = calcDamage(c.enemy, { totalDef: stats.totalDef, dodgeChance: stats.dodgeChance });
  const danoInimigo = Math.max(0, Math.round(eAtk.dano * defMult * defBuffMult));
  if (eAtk.dodge) c.log.push(`🏃 ${p.name} esquiva do ataque de ${c.enemy.name}!`);
  else {
    c.playerHp = Math.max(0, c.playerHp - danoInimigo);
    c.log.push(eAtk.critico ? `💥 ${c.enemy.name} CRÍTICO → ${danoInimigo} dmg!` : `${c.enemy.emoji} ${c.enemy.name} ataca → ${danoInimigo} dmg${c.defending ? ' (defendido!)' : ''}`);
  }

  c.round++;
  c.defending = false;
  c.buffs.defBuff = 0;
  _expirarBuffsDeSkill(c);
  _expirarEfeitoTatico(c);
  _avancarRecargas(c);
  if (c.playerHp <= 0) return _derrota(sock, msg, ctx, p, c);
  _talvezMomento(c);
  p.hp = c.playerHp;
  p.mp = c.playerMp;
  await rpg.savePlayer(p);
  return _mostrarEstado(sock, msg, ctx, p);
}

async function processarMomento(sock, msg, ctx, momentId, choiceNumber) {
  const c = _combates.get(ctx.senderNumber);
  if (!c) return false;
  if (c.processando) {
    await sock.sendMessage(ctx.remoteJid, { text: '⏳ A decisão anterior ainda está a ser resolvida.' }, { quoted: msg }).catch(() => {});
    return true;
  }
  c.processando = true;
  try {
    return await _processarMomento(sock, msg, ctx, momentId, choiceNumber);
  } finally {
    if (_combates.get(ctx.senderNumber) === c) c.processando = false;
  }
}

async function _processarMomento(sock, msg, ctx, momentId, choiceNumber) {
  const c = _combates.get(ctx.senderNumber);
  if (!c) return false;
  const p = await rpg.getPlayer(ctx.senderNumber);
  const momento = c.momentoPendente;
  const choiceIdx = Number(choiceNumber) - 1;
  if (!momento || momento.id !== momentId || choiceIdx < 0 || choiceIdx >= momento.escolhas.length) {
    await _mostrarEstado(sock, msg, ctx, p);
    return true;
  }

  const stats = _statsTaticos(c, p);
  const danoArmadilha = Math.max(8, Math.round(c.enemy.atk * 0.22));
  let resultado = '';
  const darEfeito = (nome, efeito, texto) => { _efeitoTatico(c, { nome, emoji: momento.emoji, ...efeito }); resultado = texto; };

  if (momento.id === 'ponte_fracturada') {
    if (choiceIdx === 0) darEfeito('Posição Defensiva', { defMult: 1.35, dodgeBonus: 0.12, turns: 2 }, '🛡️ Encontras apoio entre as pedras: defesa e esquiva aumentadas.');
    if (choiceIdx === 1) {
      if (_testeAtributo(stats, 'dex', 0.28)) darEfeito('Ângulo Perfeito', { atkMult: 1.3, enemyDefMult: 0.75, turns: 2 }, '🏃 Saltas a fenda e apanhas o inimigo num ângulo perfeito!');
      else { c.playerHp = Math.max(1, c.playerHp - danoArmadilha); darEfeito('Passo Instável', { defMult: 0.88, turns: 1 }, '💥 A pedra cedeu: -' + danoArmadilha + ' HP, mas recuperaste a posição.'); }
    }
    if (choiceIdx === 2) darEfeito('Arma Improvisada', { atkMult: 1.22, defMult: 0.92, turns: 2 }, '⚔️ Usas os destroços como arma: mais dano, menos protecção.');
  } else if (momento.id === 'runa_explosiva') {
    if (choiceIdx === 0) {
      if (_testeAtributo(stats, 'int', 0.3) || _testeAtributo(stats, 'dex', 0.22)) darEfeito('Runa Revertida', { enemyDefMult: 0.6, turns: 2 }, '🧠 Reverteste a runa; a energia expôs a defesa inimiga.');
      else { c.playerHp = Math.max(1, c.playerHp - danoArmadilha); resultado = '💥 A runa explodiu: -' + danoArmadilha + ' HP. Não há vantagem desta vez.'; }
    }
    if (choiceIdx === 1) darEfeito('Escudo Rúnico', { defMult: 1.45, turns: 2 }, '🛡️ Absorveste a energia e criaste um escudo temporário.');
    if (choiceIdx === 2) { c.playerHp = Math.max(1, c.playerHp - Math.ceil(danoArmadilha / 2)); darEfeito('Fúria Ardente', { atkMult: 1.4, defMult: 0.85, turns: 2 }, '🔥 Atravessaste as chamas: poder enorme, mas -' + Math.ceil(danoArmadilha / 2) + ' HP.'); }
  } else if (momento.id === 'eco_aliado') {
    if (choiceIdx === 0) { const cura = Math.min(35, c.maxHp - c.playerHp); c.playerHp += cura; darEfeito('Coragem Partilhada', { atkMult: 1.18, turns: 2 }, '🤝 O eco protege-te: +' + cura + ' HP e coragem renovada.'); }
    if (choiceIdx === 1) darEfeito('Brecha Revelada', { enemyDefMult: 0.58, turns: 2 }, '👁️ Leste o movimento inimigo; a sua defesa está exposta.');
    if (choiceIdx === 2) { p.coins = (p.coins || 0) + 35; darEfeito('Talismã Antigo', { dodgeBonus: 0.1, turns: 2 }, '💰 Encontraste 35 coins e um talismã que melhora a esquiva.'); }
  } else if (momento.id === 'nevoa_maldicao') {
    if (choiceIdx === 0) {
      if (c.playerMp >= 15) { c.playerMp -= 15; darEfeito('Névoa Purificada', { defMult: 1.3, enemyDefMult: 0.8, turns: 2 }, '✨ Gastaste 15 MP para purificar a névoa e enfraquecer o inimigo.'); }
      else resultado = '💙 Tentaste purificar a névoa, mas faltou MP. A maldição dissipou-se sem efeito.';
    }
    if (choiceIdx === 1) darEfeito('Poder Proibido', { atkMult: 1.5, defMult: 0.78, turns: 2 }, '⚡ Aceitaste o poder proibido: dano alto, defesa reduzida.');
    if (choiceIdx === 2) {
      if (_testeAtributo(stats, 'luk', 0.32)) darEfeito('Sorte do Guerreiro', { dodgeBonus: 0.2, enemyDefMult: 0.75, turns: 2 }, '🍀 Quebraste o foco do inimigo e a sorte virou a teu favor.');
      else { c.playerHp = Math.max(1, c.playerHp - Math.ceil(danoArmadilha / 2)); resultado = '🌑 A névoa reagiu: -' + Math.ceil(danoArmadilha / 2) + ' HP, mas continuas de pé.'; }
    }
  }

  c.momentoPendente = null;
  c.eventosResolvidos = (c.eventosResolvidos || 0) + 1;
  c.log.push(resultado || '🎭 A decisão mudou o ritmo da batalha.');
  p.hp = c.playerHp;
  p.mp = c.playerMp;
  await rpg.savePlayer(p);
  if (c.enemy.hp <= 0) return _vitoria(sock, msg, ctx, p, c);
  await _mostrarEstado(sock, msg, ctx, p);
  return true;
}


// ══════════════════════════════════════════════════════════════
// VITÓRIA
// ══════════════════════════════════════════════════════════════

async function _vitoria(sock, msg, ctx, p, c) {
  _combates.delete(ctx.senderNumber);

  const multTipo = c.enemy.boss ? 5 : 1;
  const loot = R(10, 50) * multTipo;
  const xp = R(20, 60) * multTipo;
  p.coins += loot;
  p.kills++;
  if (c.enemy.boss) p.bossKills++;
  const leveled = rpg.addXP(p, xp);

  // Loot items
  const lootItems = rpg.generateLoot(c.enemy, p.level);
  if (Array.isArray(lootItems)) {
    lootItems.forEach(i => { if (typeof i === 'string') p.inventory.push(i); });
  }

  // Verificar achievements
  const achLines = [];
  if (p.kills === 1) achLines.push('🏆 Achievement: *Primeiro Abate*! +50 XP');
  if (p.kills === 10 && !p.achievements?.includes('boss_slayer')) achLines.push('🏆 Achievement: *Caçador*!');

  p.hp = c.playerHp;
  p.mp = c.playerMp;
  await rpg.savePlayer(p);

  const rank = rpg.getRank(p.level);

  await tReply(sock, msg, ctx, `⚔️ VITÓRIA vs ${c.enemy.name}`, [
    `⚔️ *${c.enemy.name}* (Nv.${c.enemy.level}) DERROTADO!`,
    '',
    ...c.log.slice(-3),
    '',
    `💰 +${loot} coins | ⭐ +${xp} XP`,
    ...lootItems.slice(0, 3).map(i => typeof i === 'string' ? `🎒 +${i}` : ''),
    leveled ? `🎉 *NÍVEL ${p.level}!* Rank ${rank.emoji} ${rank.name}` : '',
    `❤️ HP: ${c.playerHp}/${c.maxHp} | 💙 MP: ${c.playerMp}/${c.maxMp}`,
    ...achLines,
  ].filter(Boolean));
  // Bosses narrativos devolvem o jogador exactamente ao próximo nó da história.
  if (typeof c.onVictory === 'function') return c.onVictory({ sock, msg, ctx, p, enemy: c.enemy });
}

// ══════════════════════════════════════════════════════════════
// DERROTA
// ══════════════════════════════════════════════════════════════

async function _derrota(sock, msg, ctx, p, c) {
  _combates.delete(ctx.senderNumber);

  p.deaths++;
  p.lives = Math.max(0, p.lives - 1);
  p.hp = Math.max(1, Math.round(p.maxHp * 0.1)); // revive com 10%
  await rpg.savePlayer(p);

  return tReply(sock, msg, ctx, `💀 DERROTA vs ${c.enemy.name}`, [
    `💀 *${c.enemy.name}* venceu!`,
    '',
    ...c.log.slice(-3),
    '',
    `❤️ HP: ${p.hp}/${p.maxHp}`,
    `♥️ Vidas: ${'♥️'.repeat(p.lives)}${'🖤'.repeat(Math.max(0, 3 - p.lives))}`,
    '',
    p.lives <= 0 ? '⚠️ *SEM VIDAS!* Usa *!reviver*' : '💤 Usa *!descansar* para recuperar',
  ]);
}

// ══════════════════════════════════════════════════════════════
// RESOLVER CLIQUE DE BOTÃO
// ══════════════════════════════════════════════════════════════

async function _painelExpirado(sock, msg, ctx) {
  await sock.sendMessage(ctx.remoteJid, {
    text: '⌛ Este painel é de um turno antigo. Usa os botões do estado mais recente da batalha.',
  }, { quoted: msg }).catch(() => {});
  return true;
}

async function resolverBotao(sock, msg, ctx, token) {
  const tk = String(token || '');
  const combate = _combates.get(ctx.senderNumber);
  let m = tk.match(/^RPGFIGHT_EVENT_T(\d+)_([a-z0-9_]+)_(\d+)$/i);
  if (m) {
    if (!combate || combate.round !== Number(m[1])) return _painelExpirado(sock, msg, ctx);
    return processarMomento(sock, msg, ctx, m[2].toLowerCase(), Number(m[3]));
  }

  m = tk.match(/^RPGFIGHT_T(\d+)_(basic|skill|skill2|item|defend|flee)$/i);
  if (m) {
    if (!combate || combate.round !== Number(m[1])) return _painelExpirado(sock, msg, ctx);
    await processarEscolha(sock, msg, ctx, m[2].toLowerCase());
    return true;
  }

  // Compatibilidade com painéis enviados antes da protecção por turno.
  m = tk.match(/^RPGFIGHT_EVENT_([a-z0-9_]+)_(\d+)$/i);
  if (m) return processarMomento(sock, msg, ctx, m[1].toLowerCase(), Number(m[2]));
  m = tk.match(/^RPGFIGHT_(.+)$/i);
  if (!m) return false;
  const acao = m[1].toLowerCase();
  if (!['basic', 'skill', 'skill2', 'item', 'defend', 'flee'].includes(acao)) return false;
  await processarEscolha(sock, msg, ctx, acao);
  return true;
}

async function tReply(sock, msg, ctx, title, lines) {
  return rpgTheme.rpgReply(sock, msg, ctx, title, lines);
}

module.exports = {
  iniciarCombate,
  iniciarCombateBoss,
  processarEscolha,
  resolverBotao,
  getEffectiveStats,
  calcDamage,
  processarMomento,
  MOMENTOS_BATALHA,
  _combates,
};
