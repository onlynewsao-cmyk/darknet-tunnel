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

// Limpa cooldowns antigos a cada 10 min (unref: não segura o processo)
setInterval(() => {
  const now = Date.now();
  for (const [key, ts] of _rpgCooldowns) {
    if (now - ts > 600000) _rpgCooldowns.delete(key);
  }
}, 600000).unref?.();


async function tReply(sock, msg, ctx, title, lines) {
  const rpgTheme = require('../rpg/rpgTheme');
  return rpgTheme.rpgReply(sock, msg, ctx, title, lines);
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

  // ═══ POINT-BUY STATS (v9.23) ═══
  registerCase(['rpgcr', 'rpgpoint', 'pointbuy'], async ({ sock, msg, ctx, args }) => {
    const createFlow = require('../rpg/createFlow');
    if (args[0] && /^[+-](str|dex|int|vit|luk)$/i.test(args[0])) {
      return createFlow.ajustarStat(sock, msg, ctx, args);
    }
    await sock.sendMessage(ctx.remoteJid, {
      text: '❓ Usa: *!rpgcr +str* / *!rpgcr -dex* para distribuir pontos.\nOu toca nos botões na tela de stats.',
    }, { quoted: msg }).catch(() => {});
  }, true);
  // ═══ PERFIL RPG COMPLETO ═══
  registerCase(['rg', 'ficha', 'perfilrpg'], async ({ sock, msg, ctx }) => {
    const p = await rpg.getPlayer(ctx.senderNumber);
    const race = rpg.RACES[p.race] || rpg.RACES.humano;
    const cls = rpg.CLASSES[p.class] || rpg.CLASSES.guerreiro;
    // v7.47: com hp>maxHp o repeat() recebia contagem negativa e o !rg
    // rebentava com RangeError. Barras limitadas a 0..10.
    const barra = (cur, max, cheio, vazio) => {
      const n = Math.max(0, Math.min(10, Math.ceil((cur || 0) / (max || 1) * 10)));
      return cheio.repeat(n) + vazio.repeat(10 - n);
    };
    const hpBar = barra(p.hp, p.maxHp, '❤️', '🖤');
    const mpBar = barra(p.mp, p.maxMp, '💙', '🖤');
    const xpPct = Math.floor(p.xp / p.xpNext * 100);

    await rpg.savePlayer(p);


    const gEmoji = p.gender === 'feminino' ? '👩' : p.gender === 'masculino' ? '👨' : '🧑';
    const gLabel = p.gender ? p.gender.charAt(0).toUpperCase() + p.gender.slice(1) : '';

    return tReply(sock, msg, ctx, `${race.emoji} ${p.name.toUpperCase()}`, [
      `${race.emoji} *${p.name}* — ${p.race} ${cls.emoji} ${p.class}`,
      p.gender || p.age ? `${gEmoji} ${gLabel}${p.age ? ' · ' + p.age + ' anos' : ''}` : '',
      p.title ? `🏅 ${p.title}` : '',
      p.bio ? `📖 ${p.bio}` : '',
      `📊 Nível *${p.level}* | Rank ${rpg.getRank(p.level).emoji} ${rpg.getRank(p.level).name} | XP: ${p.xp}/${p.xpNext} (${xpPct}%)`,
      '',
      `${hpBar} HP: ${p.hp}/${p.maxHp}`,
      `${mpBar} MP: ${p.mp}/${p.maxMp}`,
      '',
      `⚔️ STR: ${p.stats.str} | 🏃 DEX: ${p.stats.dex}`,
      `🔮 INT: ${p.stats.int} | 🛡️ VIT: ${p.stats.vit}`,
      `🍀 LUK: ${p.stats.luk}`,
      p.statPoints > 0 ? `💎 *${p.statPoints} pontos livres!* Usa \`!rpgcr +str\`` : '',
      '',
      `💰 ${p.coins} coins | 🏦 ${p.bank} no banco`,
      `🎒 ${p.inventory.length} itens | 💀 ${p.deaths} mortes`,
      `⚔️ ${p.kills} kills | ⭐ ${p.reputation} rep`,
      `❤️ Vidas: ${'♥️'.repeat(p.lives)}${'🖤'.repeat(Math.max(0, 3 - p.lives))}`,
      p.guild ? `🏰 Guilda: *${p.guild}*` : '',
      p.quest?.current ? `📜 Quest: *${p.quest.current}*` : '',
      p.skills?.length ? `✨ Skills: ${p.skills.slice(0, 3).join(', ')}` : '',
      p.equipment?.weapon ? `⚔️ Arma: ${p.equipment.weapon}` : '',
    ].filter(Boolean));
  }, true);

  // ═══ QUEST NARRATIVA ═══
  // v7.47: 'aventura' saiu daqui — o ia2.js carrega primeiro e é o dono
  // do nome; este alias estava morto e só confundia o catálogo.
  registerCase(['quest', 'historia'], async ({ sock, msg, ctx, args }) => {
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

  // ═══ MODO HISTORIA v11 — COM CARROSSEL, TESTES, EVOLUCAO ═══
  registerCase(['historia', 'story', 'mundo', 'worlds', 'mundos'], async ({ sock, msg, ctx, args }) => {
    const storyMode = require('../rpg/storyMode');
    const p = await rpg.getPlayer(ctx.senderNumber);
    if (!args[0]) return storyMode.listarMundos(sock, msg, ctx);
    const worldId = args[0].toLowerCase();
    if (worldId === 'status') return storyMode.mostrarStatus(sock, msg, ctx);
    return storyMode.jogarMundo(sock, msg, ctx, worldId);
  }, true);

  // ═══ STATUS RPG COMPLETO (v11.2) ═══
  // Sem onlyIfNew: o !status/!stats É o status do jogador agora.
  // O diagnóstico do bot fica em !diagnostico / !diag.
  registerCase(['status', 'stats', 'mystatus', 'estat'], async ({ sock, msg, ctx }) => {
    const storyMode = require('../rpg/storyMode');
    return storyMode.mostrarStatus(sock, msg, ctx);
  });

  // ═══ MISSOES DE EQUIPA / RAIDS (v11) ═══
  registerCase(['raid', 'raids', 'team'], async ({ sock, msg, ctx, args }) => {
    const storyMode = require('../rpg/storyMode');
    if (!args[0]) return storyMode.listarMissoesEquipa(sock, msg, ctx);
    if (args[0] === 'entrar' && args[1]) return storyMode.entrarEquipeRaid(sock, msg, ctx, args[1]);
    if (args[0] === 'iniciar') return storyMode.iniciarRaid(sock, msg, ctx);
    if (args[0] === 'criar' && args[1]) return storyMode.verDetalheRaid(sock, msg, ctx, args[1]);
    return storyMode.listarMissoesEquipa(sock, msg, ctx);
  }, true);

  // ═══ ESTRATÉGIA DE COMBATE (v11.1) ═══
  registerCase(['estrategia', 'strategy'], async ({ sock, msg, ctx, args }) => {
    const rpg = require('../rpg/engine');
    const rpgTheme = require('../rpg/rpgTheme');
    const p = await rpg.getPlayer(ctx.senderNumber);

    const escolha = (args[0] || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (escolha) {
      const strat = rpg.STRATEGIES[escolha];
      if (!strat) {
        return rpgTheme.rpgReply(sock, msg, ctx, '❌ ESTRATÉGIA', [
          `«${escolha}» não existe.`,
          '',
          'Opções: ' + Object.values(rpg.STRATEGIES).map(s => s.emoji + ' ' + s.id).join(' · '),
        ]);
      }
      p.strategy = strat.id;
      await rpg.savePlayer(p);
      return rpgTheme.rpgReply(sock, msg, ctx, strat.emoji + ' ESTRATÉGIA ATIVA', [
        `*${strat.emoji} ${strat.name}*`,
        strat.desc,
        '',
        '> Vais usar este estilo em todos os combates.',
        '> Usa *!estrategia* para mudar.',
      ]);
    }

    // Sem argumento → mostra as opções com botões
    const botoes = Object.values(rpg.STRATEGIES).map(s => ({
      text: `${s.emoji} ${s.name}`,
      id: `RPGSTRAT_${s.id}`,
    }));
    const atual = rpg.getStrategy(p.strategy);
    const corpo = [
      '🧠 *ESTRATÉGIAS DE COMBATE*',
      '',
      'Escolhe o teu estilo de luta. Muda o cálculo',
      'de dano em todos os combates:',
      '',
      `📌 Atual: *${atual.emoji} ${atual.name}*`,
      '',
      '> Toca numa estratégia para activá-la!',
    ].join('\n');
    await rpgTheme.rpgBotoes(sock, msg, ctx, corpo, botoes);
  }, true);

  // ═══ MULTIVERSO — PERSONAGENS FAMOSOS (v11.2) ═══
  registerCase(['personagens', 'personagem', 'heroes', 'heroi'], async ({ sock, msg, ctx, args }) => {
    const mv = require('../rpg/multiverse');
    if (args[0]) return mv.verPersonagem(sock, msg, ctx, args[0].toLowerCase());
    return mv.listarPersonagens(sock, msg, ctx);
  }, true);

  // ═══ RECRUTAR — GACHA DE PERSONAGENS (v11.2) ═══
  registerCase(['recrutar', 'gacha', 'invocar'], async ({ sock, msg, ctx }) => {
    const mv = require('../rpg/multiverse');
    return mv.recrutar(sock, msg, ctx);
  }, true);

  // ═══ ALIADOS — COLECÇÃO (v11.2) ═══
  registerCase(['aliados', 'equipepersonagens', 'coleccion'], async ({ sock, msg, ctx }) => {
    const mv = require('../rpg/multiverse');
    return mv.mostrarAliados(sock, msg, ctx);
  }, true);

  // ═══ TÉCNICAS & PODERES (v11.2) ═══
  registerCase(['tecnicas', 'poderes', 'skills'], async ({ sock, msg, ctx, args }) => {
    const mv = require('../rpg/multiverse');
    if (args[0]) {
      if (args[0].toLowerCase() === 'aprender' && args[1]) return mv.aprenderTecnica(sock, msg, ctx, args[1].toLowerCase());
      return mv.verTecnica(sock, msg, ctx, args[0].toLowerCase());
    }
    return mv.listarTecnicas(sock, msg, ctx);
  }, true);

  // ═══ APRENDER TÉCNICA (v11.2) ═══
  registerCase(['aprender', 'learn'], async ({ sock, msg, ctx, args }) => {
    const mv = require('../rpg/multiverse');
    if (args[0]) return mv.aprenderTecnica(sock, msg, ctx, args[0].toLowerCase());
    return mv.listarTecnicas(sock, msg, ctx);
  }, true);

  // ═══ TREINO — FICAR MAIS FORTE (v11.2) ═══
  registerCase(['treinar', 'treino', 'ginasio'], async ({ sock, msg, ctx, args }) => {
    const mv = require('../rpg/multiverse');
    if (args[0] && ['str', 'dex', 'int', 'vit', 'luk'].includes(args[0].toLowerCase())) {
      return mv.treinar(sock, msg, ctx, args[0].toLowerCase());
    }
    return mv.menuTreino(sock, msg, ctx);
  }, true);

  // ═══ COMBATE INTERACTIVO (v9.23 — com botões!) ═══
  registerCase(['lutar', 'fight', 'combate'], async ({ sock, msg, ctx, args }) => {
    const combat = require('../rpg/combat');
    const tipo = args[0] === 'boss' ? 'boss' : args[0] === 'elite' ? 'elite' : 'normal';
    return combat.iniciarCombate(sock, msg, ctx, tipo);
  }, true);

  // ═══ LOJA COM BOTÕES (v9.23) ═══
  registerCase(['loja', 'shop', 'mercado'], async ({ sock, msg, ctx }) => {
    const itens = Object.entries(rpg.ITEMS || {}).filter(([, v]) => v.price);
    if (!itens.length) return tReply(sock, msg, ctx, '🏪 LOJA', ['Sem itens à venda.']);

    const p = await rpg.getPlayer(ctx.senderNumber);
    const linhas = [
      `💰 Tens *${p.coins}* coins`,
      '',
      ...itens.slice(0, 8).map(([k, v]) => `${v.emoji || '📦'} *${k}* — ${v.price} coins`),
    ].join('\n');

    const opcoes = itens.slice(0, 10).map(([k, v]) => ({
      label: `${v.emoji || '📦'} ${k} — ${v.price}💰`,
      desc: v.type === 'heal' ? `Cura ${v.effect?.hp || 0} HP` : v.type === 'food' ? `Comida: +${v.effect?.hp || 0} HP` : 'Material',
    }));

    const uiMod = require('../rpg/ui');
    return uiMod.escolher(sock, msg, ctx, {
      titulo: '🏪 LOJA',
      subtitulo: 'COMPRAR',
      linhas: [`💰 Tens *${p.coins}* coins`, '', 'Escolhe o que comprar:'],
      opcoes,
      onEscolha: async (idx) => {
        const [nome, item] = itens[idx];
        const jogador = await rpg.getPlayer(ctx.senderNumber);
        if (jogador.coins < item.price) {
          return tReply(sock, msg, ctx, '🏪 LOJA', [`❌ Precisas de ${item.price} coins (tens ${jogador.coins})`]);
        }
        jogador.coins -= item.price;
        jogador.inventory.push(nome);
        await rpg.savePlayer(jogador);
        return tReply(sock, msg, ctx, '🏪 COMPRA', [
          `${item.emoji || '📦'} Compraste *${nome}* por ${item.price} coins!`,
          `💰 Saldo: ${jogador.coins} coins`,
        ]);
      },
    });
  }, true);

  // ═══ LEVEL UP — alocação de ponto ═══
  registerCase(['levelup', 'lvlup', 'subirnivel'], async ({ sock, msg, ctx, args }) => {
    const p = await rpg.getPlayer(ctx.senderNumber);
    if (!p.statPoints || p.statPoints <= 0) {
      return tReply(sock, msg, ctx, '📊 LEVEL UP', ['❌ Sem pontos livres. Sobe de nível primeiro!']);
    }
    const stat = (args[0] || '').toLowerCase();
    const validStats = ['str', 'dex', 'int', 'vit', 'luk'];
    if (!validStats.includes(stat)) {
      const uiMod = require('../rpg/ui');
      return uiMod.escolher(sock, msg, ctx, {
        titulo: `💎 ${p.statPoints} PONTOS LIVRES`,
        subtitulo: 'STATS',
        linhas: [
          `⚔️ STR: ${p.stats.str} | 🏃 DEX: ${p.stats.dex}`,
          `🔮 INT: ${p.stats.int} | 🛡️ VIT: ${p.stats.vit}`,
          `🍀 LUK: ${p.stats.luk}`,
        ],
        opcoes: validStats.map(s => ({
          label: `${{str:'⚔️',dex:'🏃',int:'🔮',vit:'🛡️',luk:'🍀'}[s]} ${s.toUpperCase()}: ${p.stats[s]}`,
          desc: `+1 ${s.toUpperCase()} (${p.statPoints} pts restantes)`,
        })),
        onEscolha: async (idx) => {
          const j = await rpg.getPlayer(ctx.senderNumber);
          if (!j.statPoints || j.statPoints <= 0) return tReply(sock, msg, ctx, '📊', ['Sem pontos!']);
          const s = validStats[idx];
          j.stats[s]++;
          j.statPoints--;
          // Recalcular HP/MP
          j.maxHp = 100 + (j.stats.vit || 6) * 10;
          j.maxMp = 50 + (j.stats.int || 6) * 5;
          await rpg.savePlayer(j);
          return tReply(sock, msg, ctx, '📊 STAT UP', [
            `✅ ${s.toUpperCase()} → ${j.stats[s]}`,
            `💎 Pontos restantes: ${j.statPoints}`,
            `❤️ HP máx: ${j.maxHp} | 💙 MP máx: ${j.maxMp}`,
          ]);
        },
      });
    }
    p.stats[stat]++;
    p.statPoints--;
    p.maxHp = 100 + (p.stats.vit || 6) * 10;
    p.maxMp = 50 + (p.stats.int || 6) * 5;
    await rpg.savePlayer(p);
    return tReply(sock, msg, ctx, '📊 STAT UP', [
      `✅ ${stat.toUpperCase()} → ${p.stats[stat]}`,
      `💎 Pontos restantes: ${p.statPoints}`,
    ]);
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
    // v7.90: confirmação por BOTÕES — ninguém gasta 500 coins sem querer.
    const ui = require('../rpg/ui');
    return ui.confirmar(sock, msg, ctx, {
      titulo: `💫 *REVIVER ${String(p.name).toUpperCase()}*`,
      linhas: [
        'Estás sem vidas. A reanimação devolve:',
        '❤️ 3 vidas e HP cheio',
        '💰 Custo: *500 coins*',
      ],
      onSim: async ({ sock, msg, ctx }) => {
        const q = await rpg.getPlayer(ctx.senderNumber);
        q.coins -= 500;
        q.lives = 3;
        q.hp = q.maxHp;
        await rpg.savePlayer(q);
        return tReply(sock, msg, ctx, '💫 REVIVIDO', [`❤️ ${q.name} voltou com 3 vidas e HP cheio!`, '💰 -500 coins']);
      },
      onNao: async ({ sock, msg, ctx }) => {
        return tReply(sock, msg, ctx, '💫 REVIVER', ['Cancelado — continuas à espera do respawn.']);
      },
    });
  }, true);

  // v7.90 — decisões de botões/listas POR ESCRITO (fallback)
  registerCase(['rpgsim'], async ({ sock, msg, ctx }) =>
    require('../rpg/ui').decidirPorTexto(sock, msg, ctx, true), true);
  registerCase(['rpgnao', 'rpgnão'], async ({ sock, msg, ctx }) =>
    require('../rpg/ui').decidirPorTexto(sock, msg, ctx, false), true);
  registerCase(['rpgescolher'], async ({ sock, msg, ctx, args }) =>
    require('../rpg/ui').escolherPorTexto(sock, msg, ctx, args[0]), true);

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
      // v7.90: confirmação por BOTÕES antes de fundar (1000 coins)
      return require('../rpg/ui').confirmar(sock, msg, ctx, {
        titulo: `🏰 *FUNDAR A GUILDA ${String(name).toUpperCase()}*`,
        linhas: [`Fundador: ${p.name}`, '💰 Custo: *1000 coins*', '👑 Título: Fundador'],
        onSim: async ({ sock, msg, ctx }) => {
          const q = await rpg.getPlayer(ctx.senderNumber);
          q.coins -= 1000;
          q.guild = name;
          q.title = 'Fundador';
          await rpg.savePlayer(q);
          return tReply(sock, msg, ctx, '🏰 GUILDA CRIADA', [
            `🏰 *${name}* fundada por *${q.name}*!`,
            '👑 Título: Fundador',
            '💰 -1000 coins',
          ]);
        },
        onNao: async ({ sock, msg, ctx }) => tReply(sock, msg, ctx, '🏰 GUILDA', ['Fundação cancelada.']),
      });
    }
    // v7.88: entrar numa guilda/clã local existente (RPG de um só grupo)
    if (args[0] === 'entrar') {
      const name = args.slice(1).join(' ').trim();
      if (!name) return tReply(sock, msg, ctx, '🏰 GUILDA', ['Uso: !guilda entrar <nome>']);
      if (p.guild) return tReply(sock, msg, ctx, '🏰 GUILDA', [`❌ Já estás na guilda *${p.guild}*.`]);
      let existe = false;
      try {
        const RPGPlayer = require('../../database/models/RPGPlayer');
        existe = !!(await RPGPlayer.findOne({ guild: name }));
      } catch {}
      if (!existe) return tReply(sock, msg, ctx, '🏰 GUILDA', [`❌ Não existe a guilda *${name}* neste mundo.`, '> Cria-a com !guilda criar ' + name]);
      p.guild = name;
      if (!p.title) p.title = 'Membro';
      await rpg.savePlayer(p);
      return tReply(sock, msg, ctx, '🏰 BEM-VINDO', [`⚔️ Entraste na guilda *${name}*. Bom combate, ${p.name}.`]);
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
    // v9.22: quando o cache está vazio (após restart), consulta o MongoDB
    // directamente — senão o ranking aparece sempre vazio.
    let sorted = [];
    const fonte = rpg._cache || rpg._players || new Map();
    if (fonte.size > 0) {
      sorted = [...fonte.entries()]
        .sort((a, b) => (b[1]?.level || 0) - (a[1]?.level || 0) || (b[1]?.kills || 0) - (a[1]?.kills || 0))
        .slice(0, 10);
    }
    if (!sorted.length) {
      try {
        const RPGPlayer = require('../../database/models/RPGPlayer');
        const tops = await RPGPlayer.find({})
          .sort({ level: -1, kills: -1 })
          .limit(10)
          .lean();
        if (tops?.length) {
          sorted = tops.map(p => [p.whatsappNumber, p]);
        }
      } catch {}
    }
    if (!sorted.length) {
      return tReply(sock, msg, ctx, '🏆 RANKING', ['🏆 Sem jogadores ainda!']);
    }
    const lines = sorted.map(([id, p], i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
      return `${medal} *${p.name || 'Aventureiro'}* — Nv.${p.level || 1} ⚔️${p.kills || 0} 💀${p.deaths || 0}`;
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
    // v7.77: sem nome → LISTA de NPCs (antes mandava um aleatório)
    if (!args[0]) {
      const lista = require('../listaEscolha');
      const chaves = Object.keys(rpg.NPCS || {});
      if (!chaves.length) return tReply(sock, msg, ctx, '🗣️ NPC', ['Sem NPCs por aqui.']);
      const itens = chaves.slice(0, 10);
      return lista.mostrar(sock, msg, ctx, {
        titulo: `🗣️ *NPCs* (${chaves.length})`,
        linhas: itens.map((k) => `${rpg.NPCS[k].emoji || '💬'} *${rpg.NPCS[k].name || k}*`),
        itens, tipo: 'npc',
        aoEscolher: async ({ item }) => {
          const npc = rpg.NPCS[item];
          await tReply(sock, msg, ctx, `${npc.emoji} ${npc.name}`, [`"${P(npc.dialogues)}"`]);
        },
      });
    }
    const npcKey = args[0]?.toLowerCase();
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
  // v7.47: 'status' saiu daqui — o info.js (diagnóstico do bot) é o dono do
  // nome; este alias estava morto. A ficha rápida fica em !vidas/!lives.
  registerCase(['vidas', 'lives'], async ({ sock, msg, ctx }) => {
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
