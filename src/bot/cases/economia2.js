/**
 * DARK BOT v7 — ECONOMIA & RPG (MongoDB)
 * Todos os comandos usam o mesmo motor RPG com persistência
 * Eliminados duplicados — cada comando existe uma vez
 */
'use strict';

const config = require('../../config');
const rpg = require('../rpg/engine');
const R = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const P = a => a[Math.floor(Math.random() * a.length)];

async function tReply(sock, msg, ctx, title, lines) {
  const RE = require('../renderEngine');
  const t = await RE.getTheme(ctx.remoteJid);
  return sock.sendMessage(ctx.remoteJid, { text: RE.renderBlock(t, title, lines, { botName: config.bot.name }) }, { quoted: msg });
}

module.exports = function registerEconomia2(registerCase) {

  // ═══ BANCO ═══
  registerCase(['dep', 'depositar'], async ({ sock, msg, ctx, args }) => {
    const p = await rpg.getPlayer(ctx.senderNumber);
    const amt = args[0] === 'all' ? p.coins : parseInt(args[0]);
    if (!amt || amt <= 0 || amt > p.coins) return tReply(sock, msg, ctx, '🏦 DEPÓSITO', ['❌ Valor inválido. Tens ' + p.coins + ' coins.']);
    p.coins -= amt;
    p.bank += amt;
    await rpg.savePlayer(p);
    return tReply(sock, msg, ctx, '🏦 DEPÓSITO', ['✅ Depositaste *' + amt + '* coins', '🏦 Banco: *' + p.bank + '* | 💰 Carteira: *' + p.coins + '*']);
  }, true);

  registerCase(['levantar', 'sacar'], async ({ sock, msg, ctx, args }) => {
    const p = await rpg.getPlayer(ctx.senderNumber);
    const amt = args[0] === 'all' ? p.bank : parseInt(args[0]);
    if (!amt || amt <= 0 || amt > p.bank) return tReply(sock, msg, ctx, '🏦 LEVANTAR', ['❌ Banco: ' + p.bank]);
    p.bank -= amt;
    p.coins += amt;
    await rpg.savePlayer(p);
    return tReply(sock, msg, ctx, '🏦 LEVANTAR', ['✅ Levantaste *' + amt + '* coins', '🏦 Banco: *' + p.bank + '* | 💰 Carteira: *' + p.coins + '*']);
  }, true);

  registerCase(['doar'], async ({ sock, msg, ctx, args }) => {
    const amt = parseInt(args[0]);
    if (!amt || amt <= 0) return tReply(sock, msg, ctx, '💝 DOAR', ['Uso: !doar <valor>']);
    const p = await rpg.getPlayer(ctx.senderNumber);
    if (amt > p.coins) return tReply(sock, msg, ctx, '💝 DOAR', ['❌ Só tens ' + p.coins + ' coins']);
    p.coins -= amt;
    p.karma += Math.ceil(amt / 10);
    await rpg.savePlayer(p);
    return tReply(sock, msg, ctx, '💝 DOAR', ['✅ Doaste *' + amt + '* coins!', '🍀 +' + Math.ceil(amt / 10) + ' karma']);
  }, true);

  registerCase(['pix', 'transferir'], async ({ sock, msg, ctx, args }) => {
    const amt = parseInt(args[0]);
    if (!amt || amt <= 0) return tReply(sock, msg, ctx, '💸 PIX', ['Uso: !pix <valor>']);
    const p = await rpg.getPlayer(ctx.senderNumber);
    if (amt > p.coins) return tReply(sock, msg, ctx, '💸 PIX', ['❌ Só tens ' + p.coins + ' coins']);
    p.coins -= amt;
    await rpg.savePlayer(p);
    return tReply(sock, msg, ctx, '💸 PIX', ['✅ Transferiste *' + amt + '* coins!', '💰 Restante: *' + p.coins + '*']);
  }, true);

  // ═══ TRABALHOS ═══
  registerCase(['work', 'trabalhar'], async ({ sock, msg, ctx }) => {
    const p = await rpg.getPlayer(ctx.senderNumber);
    const now = Date.now();
    if (p.lastWork && (now - p.lastWork.getTime()) < 60000) {
      return tReply(sock, msg, ctx, '⚒️ TRABALHO', ['⏳ Espera 1 minuto!']);
    }
    const jobs = [
      { name: 'Caçador de recompensas', pay: R(40, 120), xp: R(15, 40), risk: 0.2 },
      { name: 'Guarda da cidade', pay: R(30, 80), xp: R(10, 25), risk: 0.05 },
      { name: 'Explorador de masmorras', pay: R(60, 200), xp: R(25, 60), risk: 0.4 },
      { name: 'Mercador ambulante', pay: R(20, 60), xp: R(5, 15), risk: 0 },
      { name: 'Ferreiro aprendiz', pay: R(25, 70), xp: R(10, 30), risk: 0.1 },
      { name: 'Pescador', pay: R(15, 50), xp: R(5, 12), risk: 0 },
    ];
    const job = P(jobs);
    p.lastWork = new Date(now);

    if (Math.random() < job.risk) {
      const dmg = R(10, 30);
      p.hp = Math.max(0, p.hp - dmg);
      await rpg.savePlayer(p);
      return tReply(sock, msg, ctx, '⚒️ ' + job.name.toUpperCase(), [
        'Algo correu mal!', '⚠️ -' + dmg + ' HP', '❤️ HP: ' + p.hp + '/' + p.maxHp,
      ]);
    }

    p.coins += job.pay;
    const lv = rpg.addXP(p, job.xp);
    p.reputation += 1;
    await rpg.savePlayer(p);
    const lines = ['💰 +' + job.pay + ' coins | ⭐ +' + job.xp + ' XP'];
    if (lv) lines.push('🎉 *NÍVEL ' + p.level + '!*');
    return tReply(sock, msg, ctx, '⚒️ ' + job.name.toUpperCase(), lines);
  }, true);

  // ═══ RECURSOS ═══
  registerCase(['mine', 'minerar'], async ({ sock, msg, ctx }) => {
    const p = await rpg.getPlayer(ctx.senderNumber);
    const biome = rpg.BIOMES.montanha;
    const finds = biome.loot.concat(['nada', 'nada']);
    const find = P(finds);
    if (find === 'nada') return tReply(sock, msg, ctx, '⛏️ MINERAR', ['⛏️ Nada desta vez...']);
    p.inventory.push(find);
    const lv = rpg.addXP(p, R(5, 15));
    await rpg.savePlayer(p);
    const lines = ['⛏️ Encontraste *' + find + '*!', '🎒 ' + p.inventory.length + ' itens'];
    if (lv) lines.push('🎉 Nível ' + p.level + '!');
    return tReply(sock, msg, ctx, '⛏️ MINERAR', lines);
  }, true);

  registerCase(['fish', 'pescar', 'coletar'], async ({ sock, msg, ctx }) => {
    const p = await rpg.getPlayer(ctx.senderNumber);
    const biome = rpg.BIOMES.praia;
    const catches = biome.loot.concat(['nada', 'bota velha']);
    const c = P(catches);
    if (c === 'nada' || c === 'bota velha') return tReply(sock, msg, ctx, '🎣 PESCAR', ['🎣 ' + (c === 'nada' ? 'Nada mordido...' : 'Pescaste uma bota velha 😂')]);
    p.inventory.push(c);
    rpg.addXP(p, R(3, 10));
    await rpg.savePlayer(p);
    return tReply(sock, msg, ctx, '🎣 PESCAR', ['🎣 Pescaste *' + c + '*!', '🎒 ' + p.inventory.length + ' itens']);
  }, true);

  registerCase(['colher'], async ({ sock, msg, ctx }) => {
    const p = await rpg.getPlayer(ctx.senderNumber);
    const biome = rpg.BIOMES.floresta;
    const harvest = P(biome.loot.concat(['nada']));
    if (harvest === 'nada') return tReply(sock, msg, ctx, '🌾 COLHER', ['🌾 Nada para colher...']);
    p.inventory.push(harvest);
    rpg.addXP(p, R(2, 8));
    await rpg.savePlayer(p);
    return tReply(sock, msg, ctx, '🌾 COLHER', ['🌾 Colheste *' + harvest + '*!']);
  }, true);

  // ═══ CRAFTING ═══
  // v7.6 — 'forjar' passou a ser o cheat do DONO (forja mensagem como outro).
  // O crafting fica só em 'forge'.
  registerCase(['forge'], async ({ sock, msg, ctx, args }) => {
    const item = args.join(' ').toLowerCase();
    if (!item) {
      const recipes = Object.entries(rpg.RECIPES).map(([k, v]) => {
        const ing = Object.entries(v.ingredients).map(([ik, iv]) => iv + 'x ' + ik).join(' + ');
        return '• ' + k + ' = ' + ing;
      });
      return tReply(sock, msg, ctx, '🔨 FORJA', ['Receitas disponíveis:', ...recipes.slice(0, 15), '', '> !forge <item>']);
    }
    const recipe = rpg.RECIPES[item];
    if (!recipe) return tReply(sock, msg, ctx, '🔨 FORJA', ['❌ Receita não encontrada: ' + item]);
    const p = await rpg.getPlayer(ctx.senderNumber);
    // Verifica ingredientes
    const missing = [];
    for (const [ing, qty] of Object.entries(recipe.ingredients)) {
      const count = p.inventory.filter(i => i === ing).length;
      if (count < qty) missing.push('  ❌ ' + ing + ' (' + count + '/' + qty + ')');
    }
    if (missing.length) return tReply(sock, msg, ctx, '🔨 FORJA', ['❌ Ingredientes em falta:', ...missing]);
    // Remove ingredientes
    for (const [ing, qty] of Object.entries(recipe.ingredients)) {
      let removed = 0;
      for (let i = p.inventory.length - 1; i >= 0 && removed < qty; i--) {
        if (p.inventory[i] === ing) { p.inventory.splice(i, 1); removed++; }
      }
    }
    p.inventory.push(recipe.result);
    p.craftingLevel = (p.craftingLevel || 1) + 1;
    if (!p.recipesKnown) p.recipesKnown = [];
    if (!p.recipesKnown.includes(item)) p.recipesKnown.push(item);
    rpg.addXP(p, R(20, 50));
    await rpg.savePlayer(p);
    return tReply(sock, msg, ctx, '🔨 FORJA', ['🔨 Forjaste *' + recipe.result + '*!', '📊 Crafting Nv.' + p.craftingLevel]);
  }, true);

  registerCase(['enchant', 'encantar'], async ({ sock, msg, ctx }) => {
    const p = await rpg.getPlayer(ctx.senderNumber);
    if (p.coins < 100) return tReply(sock, msg, ctx, '✨ ENCANTAR', ['❌ Precisas de 100 coins']);
    p.coins -= 100;
    const bonus = R(1, 5);
    if (p.equipment?.weapon) p.stats.str += bonus;
    else if (p.equipment?.armor) p.stats.vit += bonus;
    else p.stats.luk += bonus;
    await rpg.savePlayer(p);
    return tReply(sock, msg, ctx, '✨ ENCANTAR', ['✨ Encantado! +' + bonus + ' ao stat']);
  }, true);

  registerCase(['dismantle', 'desmontar'], async ({ sock, msg, ctx, args }) => {
    const item = args.join(' ').toLowerCase();
    const p = await rpg.getPlayer(ctx.senderNumber);
    const idx = p.inventory.indexOf(item);
    if (idx === -1) return tReply(sock, msg, ctx, '♻️ DESMONTAR', ['❌ Não tens "' + item + '"']);
    p.inventory.splice(idx, 1);
    const refund = Math.floor((rpg.ITEMS[item]?.price || 10) * 0.3);
    p.coins += refund;
    await rpg.savePlayer(p);
    return tReply(sock, msg, ctx, '♻️ DESMONTAR', ['♻️ Desmontaste *' + item + '* → +' + refund + ' coins']);
  }, true);

  // ═══ COMIDA ═══
  registerCase(['cook', 'cozinhar'], async ({ sock, msg, ctx, args }) => {
    const recipe = args.join(' ').toLowerCase();
    const recipes = { 'bolo': ['semente', 'semente'], 'sopa': ['erva medicinal', 'peixe'] };
    if (!recipe || !recipes[recipe]) return tReply(sock, msg, ctx, '🍳 COZINHAR', ['Receitas:', ...Object.entries(recipes).map(([k, v]) => '• ' + k + ' = ' + v.join(' + '))]);
    const p = await rpg.getPlayer(ctx.senderNumber);
    for (const ing of recipes[recipe]) {
      const idx = p.inventory.indexOf(ing);
      if (idx === -1) return tReply(sock, msg, ctx, '🍳 COZINHAR', ['❌ Falta: ' + ing]);
      p.inventory.splice(idx, 1);
    }
    p.inventory.push(recipe);
    await rpg.savePlayer(p);
    return tReply(sock, msg, ctx, '🍳 COZINHAR', ['🍳 Cozinhaste *' + recipe + '*!']);
  }, true);

  registerCase(['eat', 'comer'], async ({ sock, msg, ctx, args }) => {
    const food = args.join(' ').toLowerCase() || 'peixe';
    const p = await rpg.getPlayer(ctx.senderNumber);
    const idx = p.inventory.indexOf(food);
    const itemDef = rpg.ITEMS[food];
    if (idx === -1 || !itemDef?.effect?.hp) return tReply(sock, msg, ctx, '🍽️ COMER', ['❌ Não tens "' + food + '" ou não é comida']);
    p.inventory.splice(idx, 1);
    p.hp = Math.min(p.maxHp, p.hp + itemDef.effect.hp);
    await rpg.savePlayer(p);
    return tReply(sock, msg, ctx, '🍽️ COMER', ['🍽️ Comeste *' + food + '* → +' + itemDef.effect.hp + ' HP', '❤️ HP: ' + p.hp + '/' + p.maxHp]);
  }, true);

  // ═══ COMBATE ═══
  registerCase(['masmorra', 'dungeon'], async ({ sock, msg, ctx }) => {
    const p = await rpg.getPlayer(ctx.senderNumber);
    if (p.hp <= 0) return tReply(sock, msg, ctx, '💀 MORTO', ['💀 Estás morto! Usa !pocao ou !descansar']);
    const enemy = rpg.generateEnemy(p.level + R(-1, 2), 'normal');
    const result = rpg.calcDamage(p, enemy);
    const eResult = rpg.calcDamage(enemy, p);
    const win = result.dmg > eResult.dmg;
    if (win) {
      const loot = rpg.generateLoot(enemy, p.level);
      p.coins += R(20, 80);
      loot.forEach(i => p.inventory.push(i));
      const lv = rpg.addXP(p, R(15, 40));
      p.kills++;
      p.streak++;
      if (p.streak > (p.bestStreak || 0)) p.bestStreak = p.streak;
      await rpg.savePlayer(p);
      const lines = [enemy.emoji + ' *' + enemy.name + '* derrotado!', '💰 +' + R(20, 80) + ' coins'];
      if (loot.length) lines.push('🎒 Loot: ' + loot.join(', '));
      if (lv) lines.push('🎉 Nível ' + p.level + '!');
      return tReply(sock, msg, ctx, '🏰 MASMORRA', lines);
    }
    p.hp = Math.max(0, p.hp - eResult.dmg);
    p.streak = 0;
    if (p.hp <= 0) { p.deaths++; p.lives = Math.max(0, p.lives - 1); }
    await rpg.savePlayer(p);
    return tReply(sock, msg, ctx, '🏰 MASMORRA', [enemy.emoji + ' *' + enemy.name + '* venceu!', '❤️ HP: ' + p.hp + '/' + p.maxHp, '> Usa !pocao para curar']);
  }, true);

  registerCase(['bossrpg'], async ({ sock, msg, ctx }) => {
    const p = await rpg.getPlayer(ctx.senderNumber);
    if (p.hp <= 0) return tReply(sock, msg, ctx, '💀 MORTO', ['💀 Estás morto!']);
    const boss = rpg.generateEnemy(p.level + 5, 'boss');
    const result = rpg.calcDamage(p, boss);
    const eResult = rpg.calcDamage(boss, p);
    const win = result.dmg > eResult.dmg * 0.6;
    if (win) {
      const loot = rpg.generateLoot(boss, p.level);
      const coins = R(200, 1000);
      p.coins += coins;
      loot.forEach(i => p.inventory.push(i));
      rpg.addXP(p, R(50, 150));
      p.kills++;
      p.bossKills = (p.bossKills || 0) + 1;
      await rpg.savePlayer(p);
      return tReply(sock, msg, ctx, '👑 BOSS', [boss.emoji + ' *' + boss.name + '* DERROTADO!', '💰 +' + coins + ' coins', '🎒 Loot: ' + (loot.length ? loot.join(', ') : 'nenhum')]);
    }
    p.hp = Math.max(0, p.hp - eResult.dmg);
    if (p.hp <= 0) { p.deaths++; p.lives = Math.max(0, p.lives - 1); }
    await rpg.savePlayer(p);
    return tReply(sock, msg, ctx, '👑 BOSS', [boss.emoji + ' *' + boss.name + '* é demasiado forte!', '❤️ HP: ' + p.hp + '/' + p.maxHp]);
  }, true);

  registerCase(['duelrpg', 'duelar'], async ({ sock, msg, ctx, args }) => {
    const p = await rpg.getPlayer(ctx.senderNumber);
    const enemy = rpg.generateEnemy(p.level + R(-2, 3), Math.random() < 0.2 ? 'elite' : 'normal');
    const result = rpg.calcDamage(p, enemy);
    const eResult = rpg.calcDamage(enemy, p);
    const win = result.dmg > eResult.dmg;
    if (win) {
      const loot = R(30, 150);
      p.coins += loot;
      rpg.addXP(p, R(20, 60));
      p.kills++;
      await rpg.savePlayer(p);
      return tReply(sock, msg, ctx, '⚔️ DUELO', ['⚔️ Venceste *' + enemy.name + '*!', '💰 +' + loot + ' coins']);
    }
    p.hp = Math.max(0, p.hp - eResult.dmg);
    await rpg.savePlayer(p);
    return tReply(sock, msg, ctx, '⚔️ DUELO', ['💀 *' + enemy.name + '* venceu!', '❤️ HP: ' + p.hp + '/' + p.maxHp]);
  }, true);

  registerCase(['arena', 'torneio'], async ({ sock, msg, ctx }) => {
    const p = await rpg.getPlayer(ctx.senderNumber);
    const rounds = R(1, 4);
    let wins = 0;
    for (let i = 0; i < rounds; i++) {
      const enemy = rpg.generateEnemy(p.level + i, i === rounds - 1 ? 'elite' : 'normal');
      const result = rpg.calcDamage(p, enemy);
      const eResult = rpg.calcDamage(enemy, p);
      if (result.dmg > eResult.dmg) wins++;
    }
    const prize = wins * R(30, 80);
    if (prize > 0) p.coins += prize;
    rpg.addXP(p, wins * R(10, 30));
    await rpg.savePlayer(p);
    return tReply(sock, msg, ctx, '🏟️ ARENA', ['🏟️ ' + wins + '/' + rounds + ' rondas ganhas', prize > 0 ? '💰 +' + prize + ' coins' : '💀 Sem prêmio']);
  }, true);

  // ═══ ECONOMIA ═══
  registerCase(['vender'], async ({ sock, msg, ctx, args }) => {
    const item = args.join(' ').toLowerCase();
    const p = await rpg.getPlayer(ctx.senderNumber);
    const idx = p.inventory.indexOf(item);
    if (idx === -1) return tReply(sock, msg, ctx, '💰 VENDER', ['❌ Não tens "' + item + '"']);
    p.inventory.splice(idx, 1);
    const price = Math.floor((rpg.ITEMS[item]?.price || 10) * 0.5);
    p.coins += price;
    await rpg.savePlayer(p);
    return tReply(sock, msg, ctx, '💰 VENDER', ['💰 Vendeste *' + item + '* por ' + price + ' coins']);
  }, true);

  registerCase(['loja', 'shop', 'mercador'], async ({ sock, msg, ctx, args }) => {
    const item = args.join(' ').toLowerCase();
    const p = await rpg.getPlayer(ctx.senderNumber);
    if (item && rpg.ITEMS[item]) {
      const price = rpg.ITEMS[item].price;
      if (p.coins < price) return tReply(sock, msg, ctx, '🛒 LOJA', ['❌ ' + item + ' custa ' + price + ' (tens ' + p.coins + ')']);
      p.coins -= price;
      p.inventory.push(item);
      await rpg.savePlayer(p);
      return tReply(sock, msg, ctx, '🛒 LOJA', ['✅ Compraste *' + item + '* por ' + price + ' coins']);
    }
    const shop = Object.entries(rpg.ITEMS).slice(0, 15).map(([k, v]) => v.emoji + ' ' + k + ' — ' + v.price + ' coins');
    return tReply(sock, msg, ctx, '🛒 LOJA DO GRIMWALD', ['🧔 "Bem-vindo!"', ...shop, '', '💰 Tens: ' + p.coins + ' coins', '> !loja <item>']);
  }, true);

  registerCase(['investir'], async ({ sock, msg, ctx, args }) => {
    const amt = parseInt(args[0]);
    if (!amt || amt <= 0) return tReply(sock, msg, ctx, '📈 INVESTIR', ['Uso: !investir <valor>']);
    const p = await rpg.getPlayer(ctx.senderNumber);
    if (amt > p.coins) return tReply(sock, msg, ctx, '📈 INVESTIR', ['❌ Só tens ' + p.coins]);
    p.coins -= amt;
    const profit = Math.random() < 0.6 ? Math.floor(amt * (1 + Math.random() * 0.5)) : Math.floor(amt * 0.7);
    p.coins += profit;
    await rpg.savePlayer(p);
    return tReply(sock, msg, ctx, '📈 INVESTIR', [profit > amt ? '📈 +' + (profit - amt) + ' coins!' : '📉 -' + (amt - profit) + ' coins...', '💰 Total: ' + p.coins]);
  }, true);

  // ═══ PETS ═══
  registerCase(['pet', 'pets'], async ({ sock, msg, ctx, args }) => {
    const p = await rpg.getPlayer(ctx.senderNumber);
    if (!p.pets || p.pets.length === 0) {
      return tReply(sock, msg, ctx, '🐾 PETS', ['Sem pets. Captura um na exploração!', '> !explorar para encontrar']);
    }
    const lines = p.pets.map((pet, i) => {
      const def = rpg.PETS[pet.id] || {};
      return (pet.active ? '⭐' : '  ') + (def.emoji || '🐾') + ' *' + (pet.name || pet.id) + '* Nv.' + pet.level + ' HP:' + pet.hp + '/' + pet.maxHp;
    });
    return tReply(sock, msg, ctx, '🐾 PETS', lines);
  }, true);

  // ═══ STREAK ═══
  registerCase(['streak', 'diario'], async ({ sock, msg, ctx }) => {
    const p = await rpg.getPlayer(ctx.senderNumber);
    const now = Date.now();
    const last = p.lastDaily ? p.lastDaily.getTime() : 0;
    const diff = now - last;
    if (diff < 86400000) {
      const hours = Math.ceil((86400000 - diff) / 3600000);
      return tReply(sock, msg, ctx, '🔥 STREAK', ['🔥 Streak: *' + p.streak + '* dias', '⏰ Próximo daily em ' + hours + 'h']);
    }
    p.streak = diff < 172800000 ? p.streak + 1 : 1;
    p.lastDaily = new Date(now);
    const bonus = p.streak * 10;
    p.coins += bonus;
    await rpg.savePlayer(p);
    return tReply(sock, msg, ctx, '🔥 STREAK', ['🔥 *' + p.streak + ' dias* de streak!', '💰 +' + bonus + ' coins']);
  }, true);

  // ═══ EVOLUÇÃO ═══
  registerCase(['evoluir'], async ({ sock, msg, ctx }) => {
    const p = await rpg.getPlayer(ctx.senderNumber);
    const cost = p.level * 200;
    if (p.coins < cost) return tReply(sock, msg, ctx, '⬆️ EVOLUIR', ['❌ Precisas de ' + cost + ' coins (nv.' + p.level + ')']);
    p.coins -= cost;
    p.level++;
    p.maxHp += 15;
    p.hp = p.maxHp;
    rpg.addXP(p, 0); // recalcula xpNext
    await rpg.savePlayer(p);
    return tReply(sock, msg, ctx, '⬆️ EVOLUIR', ['⬆️ *NÍVEL ' + p.level + '!*', '❤️ HP: ' + p.maxHp + ' | 💰 -' + cost]);
  }, true);

  registerCase(['prestige'], async ({ sock, msg, ctx }) => {
    const p = await rpg.getPlayer(ctx.senderNumber);
    if (p.level < 10) return tReply(sock, msg, ctx, '🌟 PRESTIGE', ['❌ Precisas de nível 10+']);
    p.level = 1;
    p.xp = 0;
    p.xpNext = 100;
    p.prestige = (p.prestige || 0) + 1;
    p.maxHp = 100 + p.prestige * 50;
    p.hp = p.maxHp;
    await rpg.savePlayer(p);
    return tReply(sock, msg, ctx, '🌟 PRESTIGE', ['🌟 *PRESTIGE ' + p.prestige + '!*', 'Reset + bônus permanente']);
  }, true);

  // ═══ ADMIN RPG ═══
  registerCase(['rpgadd', 'rpgremove'], async ({ sock, msg, ctx, args, isOwner }) => {
    if (!isOwner) return tReply(sock, msg, ctx, '🔧 ADMIN', ['🚫 Só o dono']);
    const p = await rpg.getPlayer(ctx.senderNumber);
    const amt = parseInt(args[0]) || 100;
    if (args[0]?.startsWith('-')) p.coins -= Math.abs(amt); else p.coins += amt;
    await rpg.savePlayer(p);
    return tReply(sock, msg, ctx, '🔧 ADMIN', ['✅ Coins: ' + p.coins]);
  }, true);

  registerCase(['rpgsetlevel'], async ({ sock, msg, ctx, args, isOwner }) => {
    if (!isOwner) return tReply(sock, msg, ctx, '🔧 ADMIN', ['🚫 Só o dono']);
    const p = await rpg.getPlayer(ctx.senderNumber);
    p.level = parseInt(args[0]) || 1;
    await rpg.savePlayer(p);
    return tReply(sock, msg, ctx, '🔧 ADMIN', ['✅ Nível: ' + p.level]);
  }, true);

  registerCase(['rpgadditem', 'rpgremoveitem'], async ({ sock, msg, ctx, args, isOwner }) => {
    if (!isOwner) return tReply(sock, msg, ctx, '🔧 ADMIN', ['🚫 Só o dono']);
    const p = await rpg.getPlayer(ctx.senderNumber);
    p.inventory.push(args.join(' ') || 'item');
    await rpg.savePlayer(p);
    return tReply(sock, msg, ctx, '🔧 ADMIN', ['✅ Item adicionado']);
  }, true);

  registerCase(['rpgresetplayer'], async ({ sock, msg, ctx, isOwner }) => {
    if (!isOwner) return tReply(sock, msg, ctx, '🔧 ADMIN', ['🚫 Só o dono']);
    const RPGPlayer = require('../../database/models/RPGPlayer');
    await RPGPlayer.deleteOne({ whatsappNumber: ctx.senderNumber });
    rpg._cache.delete(ctx.senderNumber);
    return tReply(sock, msg, ctx, '🔧 ADMIN', ['✅ Player resetado']);
  }, true);

  registerCase(['rpgstats'], async ({ sock, msg, ctx, isOwner }) => {
    if (!isOwner) return tReply(sock, msg, ctx, '📊 RPG STATS', ['🚫 Só o dono']);
    const RPGPlayer = require('../../database/models/RPGPlayer');
    const count = await RPGPlayer.countDocuments();
    return tReply(sock, msg, ctx, '📊 RPG STATS', ['👥 Players: ' + count, '📋 Cache: ' + rpg._cache.size]);
  }, true);
};
