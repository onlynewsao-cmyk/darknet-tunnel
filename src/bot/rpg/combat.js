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

  return {
    str: base.str || 6,
    dex: base.dex || 6,
    int: base.int || 6,
    vit: base.vit || 6,
    luk: base.luk || 6,
    atkBonus: bonusAtk,
    defBonus: bonusDef,
    totalAtk: (8 + (p.level || 1) * 2 + (base.str || 6) * 1.5 + bonusAtk) * atkMult,
    totalDef: (3 + (p.level || 1) + (base.vit || 6) * 0.5 + bonusDef) * defMult,
    critChance: 0.08 + (base.luk || 6) * 0.01 + (base.dex || 6) * 0.005 + (strat?.critBonus || 0),
    dodgeChance: Math.min(0.6, 0.05 + (base.dex || 6) * 0.01 + (strat?.dodgeBonus || 0)),
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

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of _combates) if (now > v.expira) _combates.delete(k);
}, 60000).unref?.();

// ══════════════════════════════════════════════════════════════
// INICIAR COMBATE
// ══════════════════════════════════════════════════════════════

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
    log: [],
    defending: false,
    buffs: {},
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

  const enemyHpPct = Math.max(0, Math.min(10, Math.round((c.enemy.hp / c.enemy.maxHp) * 10)));
  const playerHpPct = Math.max(0, Math.min(10, Math.round((c.playerHp / c.maxHp) * 10)));

  const hpBar = (cur, max, len = 8) => {
    const filled = Math.max(0, Math.min(len, Math.round((cur / max) * len)));
    return '█'.repeat(filled) + '░'.repeat(len - filled);
  };

  // Skills disponíveis
  const skillsDisponiveis = (rpg.SKILLS?.[p.class] || []).slice(0, 4);
  const skillNames = skillsDisponiveis.map(s => s.name).slice(0, 3);

  // Items úteis
  const temPocao = p.inventory?.includes('poção de vida');

  const strat = rpg.getStrategy ? rpg.getStrategy(p.strategy) : null;
  const linhas = [
    `⚔️ *ROUND ${c.round} — COMBATE*`,
    strat ? `🧠 Estratégia: *${strat.emoji} ${strat.name}*` : '',
    ``,
    `${c.enemy.emoji} *${c.enemy.name}* (Nv.${c.enemy.level})${c.enemy.boss ? ' 👑 BOSS' : ''}`,
    `❤️ ${hpBar(c.enemy.hp, c.enemy.maxHp)} ${c.enemy.hp}/${c.enemy.maxHp}`,
    `⚔️ ATK: ${c.enemy.atk} | 🛡️ DEF: ${c.enemy.def}`,
    ``,
    `${p.race ? rpg.RACES[p.race]?.emoji || '🧑' : '🧑'} *${p.name}* (Nv.${p.level})`,
    `❤️ ${hpBar(c.playerHp, c.maxHp)} ${c.playerHp}/${c.maxHp}`,
    `💙 ${c.playerMp}/${c.maxMp} MP`,
    ``,
    ...c.log.slice(-4).map(l => `  ${l}`),
    ``,
    `> Escolhe a tua acção 👇`,
  ].filter(l => l !== '');

  // Botões de acção
  const botoes = [
    { id: 'RPGFIGHT_basic', text: '⚔️ Atacar' },
    { id: 'RPGFIGHT_skill', text: `✨ Skill${skillNames.length ? ' (' + skillNames[0] + ')' : ''}` },
  ];
  if (temPocao) botoes.push({ id: 'RPGFIGHT_item', text: '🧪 Poção' });
  botoes.push({ id: 'RPGFIGHT_defend', text: '🛡️ Defender' });
  botoes.push({ id: 'RPGFIGHT_flee', text: '🏃 Fugir' });

  // Se tem mais skills, adicionar botão de skill extra
  if (skillsDisponiveis.length > 1) {
    botoes.push({ id: 'RPGFIGHT_skill2', text: `✨ ${skillsDisponiveis[1].name}` });
  }

  const corpo = linhas.join('\n');

  try {
    await ui._enviarBotoes?.(sock, msg, ctx, corpo, botoes) ||
    await _enviarBotoes(sock, msg, ctx, corpo, botoes);
  } catch {
    await sock.sendMessage(ctx.remoteJid, { text: corpo }, { quoted: msg }).catch(() => {});
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
  const stats = c.stats;

  // ═══ TURNO DO JOGADOR ═══
  let danoJogador = 0;
  let msgJogador = '';
  let custoMp = 0;
  c.defending = false;

  const skillsClasse = rpg.SKILLS?.[p.class] || [];

  switch (acao) {
    case 'basic': {
      const resultado = calcDamage({ ...stats, level: p.level, critChance: stats.critChance }, c.enemy);
      danoJogador = resultado.dano;
      if (resultado.dodge) msgJogador = `⚔️ ${p.name} ataca mas ${c.enemy.name} esquiva!`;
      else if (resultado.critico) msgJogador = `💥 CRÍTICO! ${p.name} → ${danoJogador} dmg!`;
      else msgJogador = `⚔️ ${p.name} ataca → ${danoJogador} dmg`;
      break;
    }
    case 'skill': {
      const skill = skillsClasse[0];
      if (!skill) {
        msgJogador = '❌ Sem skills! Ataca normalmente.';
        const r = calcDamage({ ...stats, level: p.level }, c.enemy);
        danoJogador = r.dano;
      } else if (c.playerMp < (skill.cost || 10)) {
        msgJogador = `💙 Sem MP para ${skill.name}! Atacas normalmente.`;
        const r = calcDamage({ ...stats, level: p.level }, c.enemy);
        danoJogador = r.dano;
      } else {
        custoMp = skill.cost || 10;
        if (skill.type === 'atk') {
          const r = calcDamage({ ...stats, level: p.level, totalAtk: stats.totalAtk + (skill.power || 0) * 0.3 }, c.enemy);
          danoJogador = r.dano;
          msgJogador = `${skill.emoji} *${skill.name}* → ${danoJogador} dmg! (-${custoMp} MP)`;
          if (r.critico) msgJogador = `💥 ${skill.emoji} *${skill.name}* CRÍTICO → ${danoJogador} dmg!`;
        } else if (skill.type === 'buff') {
          c.buffs.atkBuff = (c.buffs.atkBuff || 0) + (skill.power || 30);
          msgJogador = `${skill.emoji} *${skill.name}* activo! +${skill.power || 30}% ATK (-${custoMp} MP)`;
        } else if (skill.type === 'def') {
          c.defending = true;
          c.buffs.defBuff = (c.buffs.defBuff || 0) + 50;
          msgJogador = `${skill.emoji} *${skill.name}* activo! Defesa aumentada (-${custoMp} MP)`;
        } else {
          const r = calcDamage({ ...stats, level: p.level, totalAtk: stats.totalAtk * 1.5 }, c.enemy);
          danoJogador = r.dano;
          msgJogador = `${skill.emoji} *${skill.name}* → ${danoJogador} dmg! (-${custoMp} MP)`;
        }
      }
      break;
    }
    case 'skill2': {
      const skill = skillsClasse[1];
      if (!skill || c.playerMp < (skill.cost || 15)) {
        msgJogador = skill ? `💙 Sem MP para ${skill.name}!` : '❌ Sem skill extra!';
        const r = calcDamage({ ...stats, level: p.level }, c.enemy);
        danoJogador = r.dano;
        if (!skill) msgJogador += ` Atacas → ${danoJogador} dmg`;
      } else {
        custoMp = skill.cost || 15;
        if (skill.type === 'atk') {
          const r = calcDamage({ ...stats, level: p.level, totalAtk: stats.totalAtk + (skill.power || 0) * 0.3 }, c.enemy);
          danoJogador = r.dano;
          msgJogador = `${skill.emoji} *${skill.name}* → ${danoJogador} dmg! (-${custoMp} MP)`;
        } else {
          const r = calcDamage({ ...stats, level: p.level, totalAtk: stats.totalAtk * 1.4 }, c.enemy);
          danoJogador = r.dano;
          msgJogador = `${skill.emoji} *${skill.name}* → ${danoJogador} dmg! (-${custoMp} MP)`;
        }
      }
      break;
    }
    case 'item': {
      const idx = p.inventory?.indexOf('poção de vida');
      if (idx === -1 || idx === undefined) {
        msgJogador = '🧪 Sem poções! Atacas em desespero.';
        const r = calcDamage({ ...stats, level: p.level }, c.enemy);
        danoJogador = r.dano;
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
      // Pequeno contra-ataque
      const r = calcDamage({ ...stats, level: p.level }, c.enemy);
      danoJogador = Math.round(r.dano * 0.3);
      if (danoJogador > 0) msgJogador += ` (contra-ataque: ${danoJogador} dmg)`;
      break;
    }
    case 'flee': {
      const chance = 0.3 + (stats.dex * 0.02) + (stats.luk * 0.01);
      if (Math.random() < chance || c.enemy.boss === false) {
        _combates.delete(ctx.senderNumber);
        await rpg.savePlayer(p);
        return tReply(sock, msg, ctx, '🏃 FUGA', [
          `${p.name} fugiu do combate!`,
          '💚 Sobreveves para lutar outro dia.',
        ]);
      }
      msgJogador = `🏃 Tentaste fugir mas ${c.enemy.name} bloqueou o caminho!`;
      break;
    }
  }

  // Aplicar dano ao inimigo
  c.enemy.hp = Math.max(0, c.enemy.hp - danoJogador);
  c.playerMp = Math.max(0, c.playerMp - custoMp);
  c.log.push(msgJogador);

  // ═══ VERIFICAR VITÓRIA ═══
  if (c.enemy.hp <= 0) {
    return _vitoria(sock, msg, ctx, p, c);
  }

  // ═══ TURNO DO INIMIGO ═══
  const defMult = c.defending ? 0.5 : 1;
  const defBuffMult = c.buffs.defBuff ? (1 - c.buffs.defBuff / 100) : 1;
  const eAtk = calcDamage(c.enemy, { totalDef: stats.totalDef, dodgeChance: stats.dodgeChance });
  let danoInimigo = Math.round(eAtk.dano * defMult * defBuffMult);

  if (eAtk.dodge) {
    c.log.push(`🏃 ${p.name} esquiva do ataque de ${c.enemy.name}!`);
  } else if (eAtk.critico) {
    c.playerHp = Math.max(0, c.playerHp - danoInimigo);
    c.log.push(`💥 ${c.enemy.name} CRÍTICO → ${danoInimigo} dmg!`);
  } else {
    c.playerHp = Math.max(0, c.playerHp - danoInimigo);
    c.log.push(`${c.enemy.emoji} ${c.enemy.name} ataca → ${danoInimigo} dmg${c.defending ? ' (defendido!)' : ''}`);
  }

  c.round++;
  c.defending = false;
  c.buffs.defBuff = 0;

  // ═══ VERIFICAR DERROTA ═══
  if (c.playerHp <= 0) {
    return _derrota(sock, msg, ctx, p, c);
  }

  // Salvar HP/MP do jogador
  p.hp = c.playerHp;
  p.mp = c.playerMp;
  await rpg.savePlayer(p);

  // Próximo turno
  return _mostrarEstado(sock, msg, ctx, p);
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

  return tReply(sock, msg, ctx, `⚔️ VITÓRIA vs ${c.enemy.name}`, [
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
  const m = tk.match(/^RPGFIGHT_(.+)$/i);
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
  processarEscolha,
  resolverBotao,
  getEffectiveStats,
  calcDamage,
  _combates,
};
