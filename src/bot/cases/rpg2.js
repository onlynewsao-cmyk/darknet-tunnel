/**
 * DARK BOT v6.22 — RPG COMANDOS RICOS
 * Personagens, combate narrativo, guildas, quests com história
 */
'use strict';

const config = require('../../config');
const rpg = require('../rpg/engine');
const R = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const P = a => a[Math.floor(Math.random() * a.length)];

// ═══ SISTEMA DE COOLDOWN / ENERGIA ═══
const _rpgCooldowns = new Map(); // key: senderNumber_action → timestamp

function checkCooldown(sender, action, seconds) {
  const key = sender + '_' + action;
  const last = _rpgCooldowns.get(key) || 0;
  const now = Date.now();
  const elapsed = (now - last) / 1000;
  if (elapsed < seconds) {
    const remaining = Math.ceil(seconds - elapsed);
    return { blocked: true, remaining };
  }
  _rpgCooldowns.set(key, now);
  return { blocked: false, remaining: 0 };
}

function cooldownMsg(action, remaining) {
  const emojis = { battle: '⚔️', quest: '📜', train: '🏋️', explore: '🗺️', craft: '🔨', default: '⏳' };
  const emoji = emojis[action] || emojis.default;
  const names = { battle: 'combate', quest: 'quest', train: 'treino', explore: 'exploração', craft: 'crafting', default: 'acção' };
  const name = names[action] || names.default;
  return emoji + ' *Cooldown:* Espera *' + remaining + 's* para próximo ' + name + '.\n💡 _Descansa um pouco, guerreiro._';
}

// Limpa cooldowns antigos a cada 10 min
setInterval(() => {
  const now = Date.now();
  for (const [key, ts] of _rpgCooldowns) {
    if (now - ts > 600000) _rpgCooldowns.delete(key);
  }
}, 600000);


async function tReply(sock, msg, ctx, title, lines) {
  const RE = require('../renderEngine');
  const t = await RE.getTheme(ctx.remoteJid);
  return sock.sendMessage(ctx.remoteJid, { text: RE.renderBlock(t, title, lines, { botName: config.bot.name }) }, { quoted: msg });
}

module.exports = function registerRPG2(registerCase) {

  // ═══ CRIAR PERSONAGEM ═══
  // v6.89: por SELECÇÃO — !rpgstart abre lista clicável de RAÇAS →
  // CLASSES → ficha pronta. O caminho escrito continua a funcionar:
  // !rpgstart Nome raça classe (agora cria mesmo, antes só listava).
  registerCase(['criarpersonagem', 'newchar', 'rpgstart'], async ({ sock, msg, ctx, args }) => {
    const createFlow = require('../rpg/createFlow');
    return createFlow.start({ sock, msg, ctx, args });
  }, true);

  // ═══ PERFIL RPG COMPLETO ═══
  registerCase(['rg', 'ficha', 'perfilrpg'], async ({ sock, msg, ctx }) => {
    const p = await rpg.getPlayer(ctx.senderNumber);
    const race = rpg.RACES[p.race] || rpg.RACES.humano;
    const cls = rpg.CLASSES[p.class] || rpg.CLASSES.guerreiro;
    const hpBar = '❤️'.repeat(Math.ceil(p.hp / p.maxHp * 10)) + '🖤'.repeat(10 - Math.ceil(p.hp / p.maxHp * 10));
    const mpBar = '💙'.repeat(Math.ceil(p.mp / p.maxMp * 10)) + '🖤'.repeat(10 - Math.ceil(p.mp / p.maxMp * 10));
    const xpPct = Math.floor(p.xp / p.xpNext * 100);

    await rpg.savePlayer(p);


    return tReply(sock, msg, ctx, `${race.emoji} ${p.name.toUpperCase()}`, [
      `${race.emoji} *${p.name}* — ${p.race} ${cls.emoji} ${p.class}`,
      `${p.title ? `🏅 ${p.title}` : ''}`,
      `📊 Nível *${p.level}* | XP: ${p.xp}/${p.xpNext} (${xpPct}%)`,
      '',
      `${hpBar} HP: ${p.hp}/${p.maxHp}`,
      `${mpBar} MP: ${p.mp}/${p.maxMp}`,
      '',
      `⚔️ STR: ${p.stats.str} | 🏃 DEX: ${p.stats.dex}`,
      `🔮 INT: ${p.stats.int} | 🛡️ VIT: ${p.stats.vit}`,
      `🍀 LUK: ${p.stats.luk}`,
      '',
      `💰 ${p.coins} coins | 🏦 ${p.bank} no banco`,
      `🎒 ${p.inventory.length} itens | 💀 ${p.deaths} mortes`,
      `⚔️ ${p.kills} kills | ⭐ ${p.reputation} rep`,
      `❤️ Vidas: ${'♥️'.repeat(p.lives)}${'🖤'.repeat(Math.max(0, 3 - p.lives))}`,
      p.guild ? `🏰 Guilda: *${p.guild}*` : '',
      p.quest?.current ? `📜 Quest: *${p.quest.current}*` : '',
    ].filter(Boolean));
  }, true);

  // ═══ QUEST NARRATIVA ═══
  registerCase(['quest', 'historia', 'aventura'], async ({ sock, msg, ctx, args }) => {
    // v6.90: este `if` tinha perdido as chavetas — o `return` corria SEMPRE
    // e todo o sistema de quests era código morto (respondia "COOLDOWN" a
    // toda a gente, com 0s). Pior: o `savePlayer(p)` estava ANTES do
    // `const p`, pelo que com o cooldown activo rebentava com
    // "Cannot access 'p' before initialization".
    const p = await rpg.getPlayer(ctx.senderNumber);
    const cd = checkCooldown(ctx.senderNumber, 'quest', 60);
    if (cd.blocked) {
      return tReply(sock, msg, ctx, '⏳ COOLDOWN', [cooldownMsg('quest', cd.remaining)]);
    }
    // v6.90: os campos reais do motor são titulo/texto/escolhas/txt/next/xp.
    // Este código lia title/chapter/story/choices/text/reward — campos que
    // NÃO existem no engine, pelo que mesmo sem o bug das chavetas o
    // .quest rebentava em `q.choices.map`. E começava em 'prologo', um id
    // que não existe (o primeiro é 'inicio'), o que o punha em loop.
    const quest = rpg.QUESTS.find(q => q.id === (p.quest?.current || 'inicio'))
      || rpg.QUESTS[0];
    const capitulo = (q) => Math.max(1, rpg.QUESTS.indexOf(q) + 1);

    const mostrar = (q) => tReply(sock, msg, ctx, q.titulo, [
      `📖 Capítulo ${capitulo(q)} de ${rpg.QUESTS.length}`,
      '',
      q.texto,
      '',
      ...q.escolhas.map((c, i) => `${i + 1}️⃣ ${c.txt}${c.xp ? `  _(+${c.xp} XP)_` : ''}`),
      '',
      `> Escolhe: !quest <número>`,
    ]);

    // Sem quest activa → começa a primeira
    if (!p.quest?.current) {
      p.quest = { current: quest.id, step: 0, completed: p.quest?.completed || [] };
      await rpg.savePlayer(p);
      return mostrar(quest);
    }

    // Sem número (ou número inválido) → mostra a quest em que está
    const choiceIdx = parseInt(args[0]) - 1;
    if (Number.isNaN(choiceIdx) || choiceIdx < 0 || !quest.escolhas?.[choiceIdx]) {
      return mostrar(quest);
    }

    const choice = quest.escolhas[choiceIdx];
    const rewardText = [];
    if (choice.xp) {
      const leveled = rpg.addXP(p, choice.xp);
      rewardText.push(`⭐ +${choice.xp} XP${leveled ? ' → NÍVEL ' + p.level + '!' : ''}`);
    }
    if (choice.coins) { p.coins += choice.coins; rewardText.push(`💰 +${choice.coins} coins`); }
    if (choice.item) { p.inventory.push(choice.item); rewardText.push(`🎒 +${choice.item}`); }
    if (choice.title) { p.title = choice.title; rewardText.push(`🏅 Título: ${choice.title}`); }

    p.quest.completed = [...(p.quest.completed || []), quest.id];
    p.quest.current = choice.next || null;
    p.quest.step = (p.quest.step || 0) + 1;
    await rpg.savePlayer(p);

    const next = choice.next ? rpg.QUESTS.find(q => q.id === choice.next) : null;
    const linhas = [`✅ Escolha: *${choice.txt}*`, ...rewardText];

    if (next) {
      linhas.push('', '─'.repeat(20), '', next.texto, '',
        ...next.escolhas.map((c, i) => `${i + 1}️⃣ ${c.txt}`),
        '', `> Escolhe: !quest <número>`);
      return tReply(sock, msg, ctx, `${quest.titulo} → ${next.titulo}`, linhas);
    }

    linhas.push('', '🎉 *Capítulo terminado!* Usa !quest para uma nova história.');
    return tReply(sock, msg, ctx, quest.titulo, linhas);
  }, true);

  // ═══ COMBATE NARRATIVO ═══
  registerCase(['lutar', 'fight', 'combate'], async ({ sock, msg, ctx, args }) => {
    const p = await rpg.getPlayer(ctx.senderNumber);
    // v6.90: o `return` estava fora do `if` (chavetas perdidas) — o comando
    // respondia sempre esta mensagem e nunca fazia nada.
    if (p.hp <= 0) {
      return tReply(sock, msg, ctx, '💀 MORTO', ['💀 Estás morto! Usa !descansar ou !poção']);
    }
    // v6.90: o `return` estava fora do `if` (chavetas perdidas) — o comando
    // respondia sempre esta mensagem e nunca fazia nada.
    if (p.lives <= 0) {
      return tReply(sock, msg, ctx, '💀 SEM VIDAS', ['💀 Sem vidas! Espera respawn ou usa !reviver']);
    }

    const enemyType = args[0] === 'boss' ? 'boss' : args[0] === 'elite' ? 'elite' : 'normal';
    const enemy = rpg.generateEnemy(p.level + R(-1, 2), enemyType);

    // Combate por turnos (simplificado — 3 rounds)
    const rounds = [];
    let pHp = p.hp;
    let eHp = enemy.hp;

    for (let i = 0; i < 5; i++) {
      if (pHp <= 0 || eHp <= 0) break;
      // Jogador ataca
      const skills = ['basic', 'heavy', 'magic'];
      const pSkill = P(skills);
      const pAtk = rpg.calcDamage(p, enemy, pSkill);
      eHp -= pAtk.dmg;
      rounds.push(`${pAtk.crit ? '💥 CRÍTICO!' : '⚔️'} ${p.name} usa *${pSkill}* → ${pAtk.dmg} dmg`);

      if (eHp <= 0) break;

      // Inimigo ataca
      const eAtk = rpg.calcDamage(enemy, p, 'basic');
      pHp -= eAtk.dmg;
      rounds.push(`${eAtk.crit ? '💥' : '🗡️'} ${enemy.name} ataca → ${eAtk.dmg} dmg`);
    }

    p.hp = Math.max(0, pHp);
    const win = eHp <= 0;

    if (win) {
      const loot = R(10, 50) * (enemyType === 'boss' ? 10 : enemyType === 'elite' ? 3 : 1);
      const xp = R(20, 60) * (enemyType === 'boss' ? 5 : enemyType === 'elite' ? 2 : 1);
      p.coins += loot;
      p.kills++;
      const leveled = rpg.addXP(p, xp);
      const items = enemyType === 'boss' ? ['💎 Gema Lendária'] : enemyType === 'elite' && Math.random() < 0.3 ? ['⚔️ Arma Rara'] : [];
      items.forEach(i => p.inventory.push(i));

      await rpg.savePlayer(p);


      return tReply(sock, msg, ctx, `⚔️ VITÓRIA vs ${enemy.name}`, [
        `⚔️ *${enemy.name}* (Nv.${enemy.level}) DERROTADO!`,
        '',
        ...rounds,
        '',
        `💰 +${loot} coins | ⭐ +${xp} XP`,
        ...items.map(i => `🎒 +${i}`),
        leveled ? `🎉 *NÍVEL ${p.level}!*` : '',
        `❤️ HP: ${p.hp}/${p.maxHp}`,
      ].filter(Boolean));
    }

    // Derrota
    p.deaths++;
    p.lives = Math.max(0, p.lives - 1);
    await rpg.savePlayer(p);

    return tReply(sock, msg, ctx, `💀 DERROTA vs ${enemy.name}`, [
      `💀 *${enemy.name}* venceu!`,
      '',
      ...rounds,
      '',
      `❤️ HP: ${p.hp}/${p.maxHp}`,
      `♥️ Vidas: ${p.lives}/3`,
      p.lives <= 0 ? '⚠️ *SEM VIDAS!* Usa !reviver ou espera 1h' : '',
    ].filter(Boolean));
  }, true);

  // ═══ EXPLORAÇÃO NARRATIVA ═══
  registerCase(['explorar', 'explore'], async ({ sock, msg, ctx, args }) => {
    // v6.90: mesmo bug do .quest — return sem chavetas + `p` antes de existir.
    const p = await rpg.getPlayer(ctx.senderNumber);
    const cd = checkCooldown(ctx.senderNumber, 'explore', 45);
    if (cd.blocked) {
      return tReply(sock, msg, ctx, '⏳ COOLDOWN', [cooldownMsg('explore', cd.remaining)]);
    }
    const biomeKey = args[0]?.toLowerCase() || P(Object.keys(rpg.BIOMES));
    const biome = rpg.BIOMES[biomeKey] || rpg.BIOMES.floresta;

    const events = [
      { text: `Encontras um ${P(['baú antigo', 'cofre escondido', 'saco de coins'])}!`, coins: R(10, 50) * biome.danger, xp: R(5, 20) },
      { text: `Um ${P(['lobo', 'goblin', 'esqueleto', 'bandido'])} aparece!`, combat: true },
      // v6.90: NPCS é um OBJECTO — P(NPCS) devolvia undefined e o .explorar
      // rebentava ao construir a lista de eventos.
      { text: `Encontras ${P(Object.values(rpg.NPCS)).name.split(',')[0]}!`, npc: true },
      { text: `Descobres uma ${P(['erva rara', 'pedra preciosa', 'relíquia antiga'])}!`, item: P(['erva medicinal', 'pedra preciosa', 'amuleto antigo']), xp: R(10, 30) },
      { text: `Paisagem deslumbrante. ${biome.desc}`, xp: R(5, 15), hp_restore: R(5, 15) },
      { text: `Cais numa armadilha!`, hp_cost: R(5, 15) * biome.danger, xp: R(5, 10) },
    ];

    // Biomas perigosos têm mais combates
    const event = biome.danger >= 3 && Math.random() < 0.5 ? events[1] : P(events);
    const lines = [`${biome.emoji} *${biomeKey.toUpperCase()}* — Perigo: ${'⚠️'.repeat(biome.danger)}`, '', event.text];

    if (event.coins) { p.coins += event.coins; lines.push(`💰 +${event.coins} coins`); }
    if (event.xp) { const lv = rpg.addXP(p, event.xp); lines.push(`⭐ +${event.xp} XP${lv ? ' → NÍVEL ' + p.level : ''}`); }
    if (event.item) { p.inventory.push(event.item); lines.push(`🎒 +${event.item}`); }
    if (event.hp_cost) { p.hp = Math.max(0, p.hp - event.hp_cost); lines.push(`❤️ -${event.hp_cost} HP`); }
    if (event.hp_restore) { p.hp = Math.min(p.maxHp, p.hp + event.hp_restore); lines.push(`❤️ +${event.hp_restore} HP`); }
    if (event.combat) { lines.push('', '> Usa !lutar para combater!'); }
    if (event.npc) { const npc = P(Object.values(rpg.NPCS)); lines.push('', `${npc.emoji} *${npc.name}*:`, `"${P(npc.dialogues)}"`); }

    await rpg.savePlayer(p);


    return tReply(sock, msg, ctx, `${biome.emoji} EXPLORAR`, lines);
  }, true);

  // ═══ DESCANSAR ═══
  registerCase(['descansar', 'rest'], async ({ sock, msg, ctx }) => {
    const p = await rpg.getPlayer(ctx.senderNumber);
    p.hp = p.maxHp;
    p.mp = p.maxMp;
    await rpg.savePlayer(p);

    return tReply(sock, msg, ctx, '🛏️ DESCANSAR', [
      '🛏️ Descansaste na taverna.',
      `❤️ HP: ${p.hp}/${p.maxHp} | 💙 MP: ${p.mp}/${p.maxMp}`,
    ]);
  }, true);

  // ═══ POÇÃO ═══
  registerCase(['pocao', 'potion'], async ({ sock, msg, ctx, args }) => {
    const p = await rpg.getPlayer(ctx.senderNumber);
    const idx = p.inventory.indexOf('poção de vida');
    // v6.90: o `return` estava fora do `if` (chavetas perdidas) — o comando
    // respondia sempre esta mensagem e nunca fazia nada.
    if (idx === -1) {
      return tReply(sock, msg, ctx, '🧪 POÇÃO', ['❌ Sem poções! Compra no mercador.']);
    }
    p.inventory.splice(idx, 1);
    p.hp = Math.min(p.maxHp, p.hp + 50);
    await rpg.savePlayer(p);

    return tReply(sock, msg, ctx, '🧪 POÇÃO', [`🧪 +50 HP! ❤️ ${p.hp}/${p.maxHp}`]);
  }, true);

  // ═══ REVIVER ═══
  registerCase(['reviver', 'revive'], async ({ sock, msg, ctx }) => {
    const p = await rpg.getPlayer(ctx.senderNumber);
    // v6.90: o `return` estava fora do `if` (chavetas perdidas) — o comando
    // respondia sempre esta mensagem e nunca fazia nada.
    if (p.lives > 0) {
      return tReply(sock, msg, ctx, '💫 REVIVER', ['❌ Ainda tens vidas!']);
    }
    // v6.90: o `return` estava fora do `if` (chavetas perdidas) — o comando
    // respondia sempre esta mensagem e nunca fazia nada.
    if (p.coins < 500) {
      return tReply(sock, msg, ctx, '💫 REVIVER', ['❌ Precisas de 500 coins para reviver']);
    }
    p.coins -= 500;
    p.lives = 3;
    p.hp = p.maxHp;
    await rpg.savePlayer(p);

    return tReply(sock, msg, ctx, '💫 REVIVER', ['💫 Reviveste! ♥️♥️♥️ | -500 coins']);
  }, true);

  // ═══ GUILDA ═══
  registerCase(['guilda', 'guild', 'criarguilda'], async ({ sock, msg, ctx, args }) => {
    const p = await rpg.getPlayer(ctx.senderNumber);
    if (args[0] === 'criar') {
      const name = args.slice(1).join(' ');
      // v6.90: o `return` estava fora do `if` (chavetas perdidas) — o comando
      // respondia sempre esta mensagem e nunca fazia nada.
      if (!name || name.length > 20) {
        return tReply(sock, msg, ctx, '🏰 GUILDA', ['Uso: !guilda criar <nome>']);
      }
      // v6.90: o `return` estava fora do `if` (chavetas perdidas) — o comando
      // respondia sempre esta mensagem e nunca fazia nada.
      if (p.guild) {
        return tReply(sock, msg, ctx, '🏰 GUILDA', [`❌ Já estás na guilda ${p.guild}`]);
      }
      // v6.90: o `return` estava fora do `if` (chavetas perdidas) — o comando
      // respondia sempre esta mensagem e nunca fazia nada.
      if (p.coins < 1000) {
        return tReply(sock, msg, ctx, '🏰 GUILDA', ['❌ Precisas de 1000 coins']);
      }
      p.coins -= 1000;
      p.guild = name;
      p.title = 'Fundador';
      await rpg.savePlayer(p);

      return tReply(sock, msg, ctx, '🏰 GUILDA CRIADA', [
        `🏰 *${name}* fundada por *${p.name}*!`,
        `👑 Título: Fundador`,
        `💰 -1000 coins`,
      ]);
    }
    if (p.guild) {
      await rpg.savePlayer(p);

      return tReply(sock, msg, ctx, '🏰 ' + p.guild.toUpperCase(), [
        `👑 ${p.name} — ${p.title || 'Membro'}`,
        `> Usa !guilda info para ver detalhes`,
      ]);
    }
    await rpg.savePlayer(p);

    return tReply(sock, msg, ctx, '🏰 GUILDA', [
      'Sem guilda.',
      '> !guilda criar <nome> (1000 coins)',
      '> !guilda entrar <nome>',
    ]);
  }, true);

  // ═══ RANKING RPG ═══
  registerCase(['rankrpg', 'toprpg', 'rankglobal'], async ({ sock, msg, ctx }) => {
    // v6.62: `rpg._players` não existe no engine v7 (é `_cache`), e
    // havia um savePlayer(p) com `p` inexistente. Além disso o `if`
    // sem chavetas fazia o return correr SEMPRE — o ranking nunca
    // aparecia, mesmo com jogadores.
    const fonte = rpg._cache || rpg._players || new Map();
    const sorted = [...fonte.entries()]
      .sort((a, b) => (b[1]?.level || 0) - (a[1]?.level || 0) || (b[1]?.kills || 0) - (a[1]?.kills || 0))
      .slice(0, 10);
    if (!sorted.length) {
      return tReply(sock, msg, ctx, '🏆 RANKING', ['🏆 Sem jogadores ainda!']);
    }
    const lines = sorted.map(([id, p], i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
      return `${medal} *${p.name}* — Nv.${p.level} ⚔️${p.kills} 💀${p.deaths}`;
    });
    // v6.62: o `p` aqui era o do .map() acima, já fora de escopo.
    // Um ranking não grava nada — só lista.

    return tReply(sock, msg, ctx, '🏆 RANKING RPG', lines);
  }, true);

  // ═══ INVENTÁRIO ═══
  registerCase(['inventario', 'inv', 'bau'], async ({ sock, msg, ctx }) => {
    const p = await rpg.getPlayer(ctx.senderNumber);
    // v6.62: `p.inventory` podia ser undefined, e o `if` sem chavetas
    // fazia o return correr SEMPRE — o inventário nunca aparecia.
    if (!p || !Array.isArray(p.inventory) || !p.inventory.length) {
      return tReply(sock, msg, ctx, '🎒 INVENTÁRIO', ['🎒 Vazio!']);
    }
    const counts = {};
    p.inventory.forEach(i => counts[i] = (counts[i] || 0) + 1);
    const lines = Object.entries(counts).map(([k, v]) => `• ${k} x${v}`);
    await rpg.savePlayer(p);

    return tReply(sock, msg, ctx, '🎒 INVENTÁRIO', lines);
  }, true);

  // ═══ LOJA ═══

  // ═══ TRABALHAR (narrativo) ═══

  // ═══ NPC INTERACTION ═══
  registerCase(['npc', 'falar', 'talk'], async ({ sock, msg, ctx, args }) => {
    const npcKey = args[0]?.toLowerCase() || P(Object.keys(rpg.NPCS));
    const npc = rpg.NPCS[npcKey] || P(Object.values(rpg.NPCS));
    // v6.62: savePlayer(p) com `p` inexistente — este comando só mostra.

    return tReply(sock, msg, ctx, `${npc.emoji} ${npc.name}`, [
      `"${P(npc.dialogues)}"`,
      '',
      `> NPCs: ${Object.keys(rpg.NPCS).join(', ')}`,
    ]);
  }, true);

  // ═══ BIOMAS (ver mapa) ═══
  // v6.90: o mapa passou para cases/rpgWorld.js — era uma lista estática
  // de biomas, agora o mundo tem estado (sítios visitados, viagens,
  // ranking mundial). Os comandos são os mesmos: !mapa / !biomas / !world.

  // ═══ STATUS / VIDAS ═══
  registerCase(['vidas', 'lives', 'status'], async ({ sock, msg, ctx }) => {
    const p = await rpg.getPlayer(ctx.senderNumber);
    await rpg.savePlayer(p);

    return tReply(sock, msg, ctx, '❤️ STATUS', [
      `❤️ HP: ${p.hp}/${p.maxHp}`,
      `💙 MP: ${p.mp}/${p.maxMp}`,
      `♥️ Vidas: ${'♥️'.repeat(p.lives)}${'🖤'.repeat(Math.max(0, 3 - p.lives))}`,
      `💀 Mortes: ${p.deaths} | ⚔️ Kills: ${p.kills}`,
      `⭐ Reputação: ${p.reputation}`,
    ]);
  }, true);

  // ═══ CLASSE & RAÇA INFO ═══
  registerCase(['racas', 'classes', 'rpginfo'], async ({ sock, msg, ctx }) => {
    const races = Object.entries(rpg.RACES).map(([k, v]) => `${v.emoji} *${k}* — STR+${v.bonus.str} DEX+${v.bonus.dex} INT+${v.bonus.int} VIT+${v.bonus.vit} LUK+${v.bonus.luk}`).join('\n');
    const classes = Object.entries(rpg.CLASSES).map(([k, v]) => `${v.emoji} *${k}* (${v.primary})`).join('\n');
    // v6.62: havia um `await rpg.savePlayer(p)` aqui com `p` inexistente.
    // Este comando só MOSTRA informação — não há nada para gravar.

    return tReply(sock, msg, ctx, '📖 INFO RPG', ['🧬 RAÇAS:', races, '', '⚔️ CLASSES:', classes]);
  }, true);

  // ═══ NOME RPG ═══
  registerCase(['nome', 'rename'], async ({ sock, msg, ctx, args }) => {
    const name = args.join(' ').trim();
    // v6.90: chavetas repostas + `savePlayer(p)` com `p` ainda por definir.
    if (!name || name.length > 20) {
      return tReply(sock, msg, ctx, '📝 NOME', ['Uso: !nome <nome>']);
    }
    const p = await rpg.getPlayer(ctx.senderNumber);
    p.name = name;
    await rpg.savePlayer(p);

    return tReply(sock, msg, ctx, '📝 NOME', [`✅ Nome: *${name}*`]);
  }, true);
};

// v6.90: gancho para a auditoria (scripts/test-rpg-audit.js). Os cooldowns
// vivem num Map do módulo; sem forma de os limpar, a auditoria apanha os
// cooldowns deixados pela passagem anterior e reporta "COOLDOWN" como bug.
module.exports._resetCooldowns = () => _rpgCooldowns.clear();
