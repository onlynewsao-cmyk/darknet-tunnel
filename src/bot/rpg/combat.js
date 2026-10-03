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
    momentoPendente: null,
    eventosVistos: [],
    eventosResolvidos: 0,
    tactical: null,
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
    momentoPendente: null,
    eventosVistos: [],
    eventosResolvidos: 0,
    tactical: null,
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
  const skillNames = skillsDisponiveis.map(s => s.name).slice(0, 3);
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
  ].filter(Boolean).join('\n');

  const narrativa = [
    '📜 *BATALHA*',
    ...c.log.slice(-4).map(l => `• ${l}`),
    momento ? `🎭 *MOMENTO ÚNICO — ${momento.titulo}*` : '',
    momento ? momento.texto : '',
    momento ? '> A tua decisão muda o rumo desta batalha.' : '',
  ].filter(Boolean).join('\n');

  let botoes;
  if (momento) {
    botoes = momento.escolhas.map((texto, index) => ({
      id: 'RPGFIGHT_EVENT_' + momento.id + '_' + (index + 1),
      text: texto.slice(0, 32),
    }));
  } else {
    botoes = [
      { id: 'RPGFIGHT_basic', text: '⚔️ Atacar' },
      { id: 'RPGFIGHT_skill', text: `✨ Skill${skillNames.length ? ' (' + skillNames[0] + ')' : ''}` },
    ];
    if (temPocao) botoes.push({ id: 'RPGFIGHT_item', text: '🧪 Poção' });
    botoes.push({ id: 'RPGFIGHT_defend', text: '🛡️ Defender' });
    botoes.push({ id: 'RPGFIGHT_flee', text: '🏃 Fugir' });
    if (skillsDisponiveis.length > 1) botoes.push({ id: 'RPGFIGHT_skill2', text: `✨ ${skillsDisponiveis[1].name}` });
  }

  const controlos = momento
    ? '🎭 *DECISÃO TÁTICA*\n> Escolhe uma opção nos botões abaixo.'
    : '🎮 *AÇÕES DE COMBATE*\n> Escolhe a tua ação nos botões abaixo.';

  // Não juntar estas sessões: a ordem torna o combate legível no WhatsApp.
  await sock.sendMessage(ctx.remoteJid, { text: status }, { quoted: msg }).catch(() => {});
  await sock.sendMessage(ctx.remoteJid, { text: narrativa || '📜 *BATALHA*\n> O combate continua…' }, { quoted: msg }).catch(() => {});
  try {
    const enviado = await ui._enviarBotoes?.(sock, msg, ctx, controlos, botoes) || await _enviarBotoes(sock, msg, ctx, controlos, botoes);
    if (!enviado) await sock.sendMessage(ctx.remoteJid, { text: controlos }, { quoted: msg }).catch(() => {});
  } catch {
    await sock.sendMessage(ctx.remoteJid, { text: controlos }, { quoted: msg }).catch(() => {});
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

async function processarEscolha(sock, msg, ctx, acao) {
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
      if (!skill || c.playerMp < (skill.cost || 10)) {
        msgJogador = skill ? `💙 Sem MP para ${skill.name}! Atacas normalmente.` : '❌ Sem skills! Ataca normalmente.';
        danoJogador = calcDamage(stats, enemy).dano;
      } else {
        custoMp = skill.cost || 10;
        if (skill.type === 'atk') {
          const r = calcDamage({ ...stats, totalAtk: stats.totalAtk + (skill.power || 0) * 0.3 }, enemy);
          danoJogador = r.dano;
          msgJogador = r.critico ? `💥 ${skill.emoji} *${skill.name}* CRÍTICO → ${danoJogador} dmg!` : `${skill.emoji} *${skill.name}* → ${danoJogador} dmg! (-${custoMp} MP)`;
        } else if (skill.type === 'buff') {
          c.buffs.atkBuff = (c.buffs.atkBuff || 0) + (skill.power || 30);
          msgJogador = `${skill.emoji} *${skill.name}* activo! +${skill.power || 30}% ATK (-${custoMp} MP)`;
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
      if (!skill || c.playerMp < (skill.cost || 15)) {
        msgJogador = skill ? `💙 Sem MP para ${skill.name}!` : '❌ Sem skill extra!';
        danoJogador = calcDamage(stats, enemy).dano;
        if (!skill) msgJogador += ` Atacas → ${danoJogador} dmg`;
      } else {
        custoMp = skill.cost || 15;
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
  _expirarEfeitoTatico(c);
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

async function resolverBotao(sock, msg, ctx, token) {
  const tk = String(token || '');
  let m = tk.match(/^RPGFIGHT_EVENT_([a-z0-9_]+)_(\d+)$/i);
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
