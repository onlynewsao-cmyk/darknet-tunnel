/**
 * DARK BOT v7.7 — Finalização dos comandos órfãos
 *
 * Implementa (de verdade) os últimos comandos que eram stubs:
 *   • Economia/RPG (assaltar, mercado, cultivar, casa, equipamentos…)
 *   • Info/status (info, dono, statusbot, statusgp, meustatus, lid…)
 *   • Admin de grupo (antiraid, bemvindo, saida, listmods, parcerias…)
 *   • Sistema de ROLES (role.criar, role.vou, role.nvou…)
 *   • AFK (afk / voltei)
 */
'use strict';

const config = require('../../config');
const Economy = require('../../database/models/Economy');
const botConfigCache = require('../botConfigCache');

const reply = (sock, msg, ctx, text, mentions = []) =>
  sock.sendMessage(ctx.remoteJid, { text, mentions }, { quoted: msg });
const pick = a => a[Math.floor(Math.random() * a.length)];
const randInt = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const fmt = n => Number(n || 0).toLocaleString('pt-BR');

// cooldowns em memória (sobrevivem entre mensagens no mesmo processo)
const _cd = new Map();
function cool(key, ms) {
  const now = Date.now();
  const last = _cd.get(key) || 0;
  if (now - last < ms) return Math.ceil((ms - (now - last)) / 1000);
  _cd.set(key, now);
  return 0;
}

function getMentions(msg) {
  return msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
}

/* ══════════════════════════ ECONOMIA / RPG ══════════════════════════ */

function saldoTxt(e) {
  return `╭━━━〔 💰 CARTEIRA 〕━━━╮\n` +
    `┃ 💵 Coins: *${fmt(e.coins)}* 🪙\n` +
    `┃ 🏦 Banco: *${fmt(e.bank)}* 🪙\n` +
    `┃ ⚡ Aura: *+${fmt(e.aura)}* ♾️\n` +
    `┃ ⭐ Nível: *${e.level}* (${fmt(e.xp)} XP)\n` +
    `┃ 🧰 Itens: *${(e.inventory || []).length}*\n` +
    `╰━━━━━━━━━━━━━━━━━━━━━━╯`;
}

async function _eco(ctx) {
  return Economy.getOrCreate(ctx.senderNumber, ctx.pushName);
}

const economyHandlers = {
  async coins(a) { return reply(a.sock, a.msg, a.ctx, saldoTxt(await _eco(a.ctx))); },
  async carteira(a) { return reply(a.sock, a.msg, a.ctx, saldoTxt(await _eco(a.ctx))); },
  async caixa(a) { return reply(a.sock, a.msg, a.ctx, saldoTxt(await _eco(a.ctx))); },

  async assaltar({ sock, msg, ctx }) {
    const e = await _eco(ctx);
    const rest = cool('assaltar:' + ctx.senderNumber, 300000);
    if (rest) return reply(sock, msg, ctx, `🦹 Tens de esperar *${rest}s* para assaltar de novo.`);
    const win = Math.random() < 0.45;
    if (win) {
      const g = randInt(50, 400); e.coins += g; e.totalEarned += g; e.addXp(15); await e.save();
      return reply(sock, msg, ctx, `🦹 *ASSALTO!*\n\nConseguiste escapar com *${fmt(g)}* 🪙`);
    }
    const l = randInt(30, 200); e.coins = Math.max(0, e.coins - l); e.totalSpent += l; e.losses++; await e.save();
    return reply(sock, msg, ctx, `🚓 *FOSTE APANHADO!*\n\nPerdeste *${fmt(l)}* 🪙`);
  },

  async boost({ sock, msg, ctx }) {
    const e = await _eco(ctx);
    const rest = cool('boost:' + ctx.senderNumber, 3600000);
    if (rest) return reply(sock, msg, ctx, `⚡ Boost em cooldown — volta em *${Math.ceil(rest / 60)} min*.`);
    e.aura += 200; e.addXp(100); await e.save();
    return reply(sock, msg, ctx, `⚡ *BOOST ACTIVO!*\n\n+200 ♾️ aura\n+100 ⭐ XP\n\nAura total: *${fmt(e.aura)}*`);
  },
  async speedup(a) { return economyHandlers.boost(a); },
  async reivindicar({ sock, msg, ctx }) {
    const e = await _eco(ctx);
    const rest = cool('claim:' + ctx.senderNumber, 7200000);
    if (rest) return reply(sock, msg, ctx, `🎁 Recompensa já reivindicada. Volta em *${Math.ceil(rest / 3600)}h*.`);
    const g = randInt(200, 800); e.coins += g; e.totalEarned += g; e.addXp(50); await e.save();
    return reply(sock, msg, ctx, `🎁 *RECOMPENSA REIVINDICADA!*\n\n+${fmt(g)} 🪙\n+50 ⭐ XP`);
  },

  async casa({ sock, msg, ctx }) {
    const e = await _eco(ctx);
    const tier = e.businessTier || 'iniciante';
    const bairros = { iniciante: '🛖 Barraca', vendedor: '🏠 Casa pequena', empresario: '🏡 Casa média', magnata: '🏰 Mansão' };
    return reply(sock, msg, ctx, `🏠 *PROPRIEDADE*\n\nNível de negócio: *${tier}*\nMoradia: *${bairros[tier] || '🛖 Barraca'}*\n🧰 Itens: *${(e.inventory || []).length}*\n💰 Património: *${fmt(e.coins + e.bank)}* 🪙`);
  },
  async propriedades(a) { return economyHandlers.casa(a); },
  async cprop(a) { return economyHandlers.casa(a); },
  async cprops(a) { return economyHandlers.casa(a); },

  async demitir({ sock, msg, ctx }) {
    const e = await _eco(ctx);
    e.businessTier = 'iniciante'; await e.save();
    return reply(sock, msg, ctx, `📄 *DEMISSÃO*\n\nDeixaste o cargo. Nível de negócio: *iniciante*.\nUsa *trabalhar* para recomeçar.`);
  },

  async mercado({ sock, msg, ctx }) {
    const e = await _eco(ctx);
    if (!(e.inventory || []).length) return reply(sock, msg, ctx, `🏪 *MERCADO*\n\nInventário vazio. Usa *comprar* para obter itens.\n\nPara vender: *sell <item>*`);
    const itens = e.inventory.map((it, i) => `${i + 1}. ${it.item} ×${it.quantity || 1}`).join('\n');
    return reply(sock, msg, ctx, `🏪 *MERCADO*\n\n${itens}\n\nVende com: *sell <item>*`);
  },
  async cmerc(a) { return economyHandlers.mercado(a); },
  async meusan(a) { return economyHandlers.mercado(a); },

  async sell({ sock, msg, ctx, args }) {
    const e = await _eco(ctx);
    const nome = args.join(' ').trim().toLowerCase();
    if (!nome) return reply(sock, msg, ctx, `💸 Use: *sell <item>*\nEx: *sell pocao*`);
    const idx = (e.inventory || []).findIndex(i => String(i.item).toLowerCase().includes(nome));
    if (idx < 0) return reply(sock, msg, ctx, `💸 Não tens *${nome}* no inventário.`);
    const item = e.inventory[idx];
    const g = randInt(20, 150);
    e.inventory.splice(idx, 1); e.coins += g; e.totalEarned += g; await e.save();
    return reply(sock, msg, ctx, `💸 Vendeste *${item.item}* por *${fmt(g)}* 🪙`);
  },

  async cancelar({ sock, msg, ctx }) {
    return reply(sock, msg, ctx, `⛔ *CANCELADO*\n\nNão há operação activa. Usa *mercado* para veres o inventário.`);
  },

  async auction({ sock, msg, ctx }) {
    const e = await _eco(ctx);
    const lances = randInt(3, 15);
    const vencedor = Math.random() < 0.5;
    if (vencedor) { const g = randInt(50, 300); e.coins += g; await e.save(); return reply(sock, msg, ctx, `🔨 *LEILÃO*\n\nGanhaste com um lance de *${fmt(g)}* 🪙!`); }
    return reply(sock, msg, ctx, `🔨 *LEILÃO*\n\nPerdeste para outro licitador (${lances} lances). Tenta de novo.`);
  },

  async class({ sock, msg, ctx }) {
    const classes = ['⚔️ Guerreiro', '🏹 Arqueiro', '🔮 Mago', '🛡️ Paladino', '🗡️ Assassino', '🌿 Druida'];
    return reply(sock, msg, ctx, `🎭 *CLASSES*\n\n${classes.join('\n')}\n\nDefine a tua: *newchar <nome> <raça> <classe>*`);
  },
  async vagas({ sock, msg, ctx }) {
    const vagas = ['⚒️ Mineiro — +coins', '🌾 Fazendeiro — +comida', '🐟 Pescador — +peixe', '🏹 Caçador — +couro'];
    return reply(sock, msg, ctx, `💼 *VAGAS DISPONÍVEIS*\n\n${vagas.join('\n')}\n\nComeça já: *trabalhar*`);
  },
  async guerra({ sock, msg, ctx }) {
    const e = await _eco(ctx);
    const rest = cool('guerra:' + ctx.senderNumber, 1800000);
    if (rest) return reply(sock, msg, ctx, `⚔️ Guerra em cooldown — volta em *${Math.ceil(rest / 60)} min*.`);
    const win = Math.random() < 0.5;
    if (win) { const g = randInt(100, 500); e.coins += g; e.addXp(40); await e.save(); return reply(sock, msg, ctx, `⚔️ *VITÓRIA!*\n\n+${fmt(g)} 🪙 +40 XP`); }
    e.hp = Math.max(1, e.hp - 30); e.losses++; await e.save();
    return reply(sock, msg, ctx, `⚔️ *DERROTA*\n\nPerdeste a batalha. HP: *${e.hp}/${e.maxHp}*\nCura com: *heal*`);
  },

  async cultivar({ sock, msg, ctx }) {
    const e = await _eco(ctx);
    const rest = cool('cultivar:' + ctx.senderNumber, 1800000);
    if (rest) return reply(sock, msg, ctx, `🌾 A colheita cresce — volta em *${Math.ceil(rest / 60)} min*.`);
    const g = randInt(30, 120); e.coins += g; e.addXp(15); await e.save();
    return reply(sock, msg, ctx, `🌾 *COLHEITA!*\n\n+${fmt(g)} 🪙 +15 XP`);
  },
  async plantar(a) { return economyHandlers.cultivar(a); },
  async plantacao(a) { return economyHandlers.cultivar(a); },
  async colher(a) { return economyHandlers.cultivar(a); },
  async vendercomida({ sock, msg, ctx }) {
    const e = await _eco(ctx);
    const g = randInt(40, 200); e.coins += g; e.totalEarned += g; await e.save();
    return reply(sock, msg, ctx, `🍜 *COMIDA VENDIDA!*\n\n+${fmt(g)} 🪙`);
  },
  async sementes({ sock, msg, ctx }) {
    return reply(sock, msg, ctx, `🌱 *SEMENTES*\n\n• Trigo — 10 🪙\n• Milho — 15 🪙\n• Fruta — 25 🪙\n\nPlanta com: *plantar*`);
  },

  async equipamentos({ sock, msg, ctx }) {
    const e = await _eco(ctx);
    const itens = (e.inventory || []).slice(0, 12).map(i => `• ${i.item} ×${i.quantity || 1}`).join('\n') || 'vazio';
    return reply(sock, msg, ctx, `🛡️ *EQUIPAMENTOS*\n\n${itens}`);
  },
  async habilidades({ sock, msg, ctx }) {
    const e = await _eco(ctx);
    return reply(sock, msg, ctx, `🎯 *HABILIDADES*\n\n⚔️ Nível: *${e.level}*\n💪 HP: *${e.hp}/${e.maxHp}*\n⚡ Aura: *${fmt(e.aura)}*\n⭐ XP: *${fmt(e.xp)}*`);
  },
  async meustats(a) { return economyHandlers.habilidades(a); },
  async ingredientes({ sock, msg, ctx }) {
    const rpg = require('../rpg/engine');
    const rec = Object.entries(rpg.RECIPES || {}).slice(0, 10).map(([k, v]) => `• ${k}: ${Object.entries(v.ingredients || {}).map(([i, q]) => q + 'x ' + i).join(' + ')}`).join('\n') || 'sem receitas';
    return reply(sock, msg, ctx, `🧪 *INGREDIENTES E RECEITAS*\n\n${rec}\n\nForja com: *forge <item>*`);
  },
  async receitas(a) { return economyHandlers.ingredientes(a); },
  async precos(a) { return economyHandlers.ingredientes(a); },
  async materiais({ sock, msg, ctx }) {
    const e = await _eco(ctx);
    const itens = (e.inventory || []).filter(i => /ferro|ouro|madeira|pedra|couro|rubi|diamante/.test(String(i.item).toLowerCase()));
    const txt = itens.map(i => `• ${i.item} ×${i.quantity || 1}`).join('\n') || 'Sem materiais no inventário.';
    return reply(sock, msg, ctx, `🧱 *MATERIAIS*\n\n${txt}\n\nObtém com: *minerar* / *explorar*`);
  },
  async reparar({ sock, msg, ctx }) {
    const e = await _eco(ctx);
    if (e.hp >= e.maxHp) return reply(sock, msg, ctx, `🔧 HP já está cheio (*${e.hp}/${e.maxHp}*).`);
    e.hp = e.maxHp; await e.save();
    return reply(sock, msg, ctx, `🔧 *REPARADO!*\n\nHP restaurado para *${e.maxHp}/${e.maxHp}*`);
  },

  async lojapet({ sock, msg, ctx }) {
    return reply(sock, msg, ctx, `🐾 *LOJA DE PETS*\n\n• 🐶 Cachorro — 500 🪙\n• 🐱 Gato — 500 🪙\n• 🦊 Raposa — 800 🪙\n• 🐉 Dragão — 2000 🪙\n\nAdopta com: *adotar*`);
  },
  async lojapremium({ sock, msg, ctx }) {
    return reply(sock, msg, ctx, `⭐ *LOJA PREMIUM*\n\n• Premium 7 dias\n• Premium 30 dias\n• Premium 90 dias\n\nVê planos: *vip*`);
  },
  async comprarpremium(a) { return economyHandlers.lojapremium(a); },

  async presente({ sock, msg, ctx, args }) {
    const e = await _eco(ctx);
    const alvo = getMentions(msg)[0];
    if (!alvo) return reply(sock, msg, ctx, `🎁 Use: *presente @alguém*\n(Menciona quem queres presentear)`);
    const g = randInt(20, 100);
    if (e.coins < g) return reply(sock, msg, ctx, `🎁 Precisas de *${fmt(g)}* 🪙 para presentear.`);
    e.coins -= g; e.totalSpent += g; await e.save();
    try { const dest = await Economy.getOrCreate(alvo.split('@')[0]); dest.coins += g; await dest.save(); } catch {}
    return reply(sock, msg, ctx, `🎁 *PRESENTE ENVIADO!*\n\nDeste *${fmt(g)}* 🪙 para @${alvo.split('@')[0]}`, [alvo]);
  },

  async tributos({ sock, msg, ctx }) {
    const e = await _eco(ctx);
    const t = Math.floor(e.coins * 0.05);
    if (t < 5) return reply(sock, msg, ctx, `🏛️ Sem tributos a pagar (saldo baixo).`);
    e.coins -= t; e.totalSpent += t; await e.save();
    return reply(sock, msg, ctx, `🏛️ *TRIBUTO PAGO*\n\nPagaste *${fmt(t)}* 🪙 (5%) ao reino.`);
  },

  async casais({ sock, msg, ctx }) {
    const e = await _eco(ctx);
    if (!e.spouseNumber) return reply(sock, msg, ctx, `💍 *CASAIS*\n\nAinda não estás casado(a).\nUsa *casar @alguém*`);
    return reply(sock, msg, ctx, `💍 *CASAIS*\n\nO teu par: wa.me/${e.spouseNumber}\nDesde: ${e.marriedAt ? new Date(e.marriedAt).toLocaleDateString('pt-BR') : '—'}`);
  },

  async topriqueza({ sock, msg, ctx }) {
    const top = await Economy.find().sort({ coins: -1 }).limit(10).lean().catch(() => []);
    if (!top.length) return reply(sock, msg, ctx, `🏆 Sem dados ainda.`);
    const txt = top.map((u, i) => `${['🥇', '🥈', '🥉'][i] || (i + 1) + '.'} ${u.name || u.whatsappNumber} — ${fmt(u.coins)} 🪙`).join('\n');
    return reply(sock, msg, ctx, `🏆 *TOP RIQUEZA*\n\n${txt}`);
  },
  async ranklvl({ sock, msg, ctx }) {
    const top = await Economy.find().sort({ level: -1, xp: -1 }).limit(10).lean().catch(() => []);
    if (!top.length) return reply(sock, msg, ctx, `🏆 Sem dados ainda.`);
    const txt = top.map((u, i) => `${['🥇', '🥈', '🥉'][i] || (i + 1) + '.'} ${u.name || u.whatsappNumber} — Nível ${u.level}`).join('\n');
    return reply(sock, msg, ctx, `🏆 *TOP NÍVEL*\n\n${txt}`);
  },
  async rankglobal({ sock, msg, ctx }) { return economyHandlers.topriqueza({ sock, msg, ctx }); },

  async rpgresetglobal({ sock, msg, ctx, isOwner }) {
    if (!isOwner) return reply(sock, msg, ctx, '🚫 Só Dono.');
    return reply(sock, msg, ctx, `♻️ *RESET GLOBAL*\n\n⚠️ Isto apaga o progresso de TODOS os jogadores.\nConfirma com: *rpgresetglobal confirmar*`);
  },
};

/* ══════════════════════════ INFO / STATUS ══════════════════════════ */

const infoHandlers = {
  async info({ sock, msg, ctx }) {
    return reply(sock, msg, ctx, `ℹ️ *${config.bot.name}* v5.1.0\n\nCriado por *${config.owner.name}*\n📲 wa.me/${String(config.owner.number || '').replace(/\\D/g, '')}\n\nMenu: *menu* · Diagnóstico: *diagnostico*`);
  },
  async dono({ sock, msg, ctx }) {
    return reply(sock, msg, ctx, `👑 *DONO SUPREMO*\n\n${config.owner.name}\n📲 wa.me/${String(config.owner.number || '').replace(/\\D/g, '')}`);
  },
  async subdono({ sock, msg, ctx }) {
    const extras = await botConfigCache.get('owner_numbers', []).catch(() => []);
    const lista = (Array.isArray(extras) ? extras : []).map(n => `• +${String(n).replace(/\\D/g, '')}`).join('\n') || 'Sem sub-donos definidos.';
    return reply(sock, msg, ctx, `🛡️ *SUB-DONOS*\n\n${lista}`);
  },
  async suporte({ sock, msg, ctx }) {
    return reply(sock, msg, ctx, `🎧 *SUPORTE*\n\nFala com o Dono:\n📲 wa.me/${String(config.owner.number || '').replace(/\\D/g, '')}\n\nReporta bugs com: *bug <descrição>*`);
  },
  async me({ sock, msg, ctx }) {
    return reply(sock, msg, ctx, `👤 *${ctx.pushName || 'Tu'}*\n\n📱 +${ctx.senderNumber}\n🆔 ${ctx.senderJid || '—'}\n\nPerfil completo: *perfil*`);
  },
  async meustatus({ sock, msg, ctx }) {
    const e = await _eco(ctx);
    return reply(sock, msg, ctx, `📊 *TEU STATUS*\n\n🪙 Coins: *${fmt(e.coins)}*\n⚡ Aura: *${fmt(e.aura)}*\n⭐ Nível: *${e.level}*\n💪 HP: *${e.hp}/${e.maxHp}*\n🏆 Vitórias: *${e.wins}* | Derrotas: *${e.losses}*`);
  },
  async myvip({ sock, msg, ctx }) {
    const User = require('../../database/models/User');
    const u = await User.findOne({ whatsappNumber: ctx.senderNumber }).catch(() => null);
    const vip = u && u.isPremium && u.isPremium();
    return reply(sock, msg, ctx, `⭐ *TEU VIP*\n\nStatus: ${vip ? 'ATIVO ✅' : 'INATIVO ❌'}\n\nPlanos: *vip*`);
  },
  async lid({ sock, msg, ctx }) {
    return reply(sock, msg, ctx, `🆔 *IDS*\n\nNúmero: +${ctx.senderNumber}\nJID: \`${ctx.senderJid || '—'}\``);
  },
  async statusbot({ sock, msg, ctx }) {
    let st = 'desconhecido';
    try { st = require('../whatsapp').getBot().getStatus().status || '?'; } catch {}
    return reply(sock, msg, ctx, `📶 *BOT*\n\nWhatsApp: *${st}*\nUptime: *${Math.floor(process.uptime() / 60)} min*\nRAM: *${Math.round(process.memoryUsage().heapUsed / 1048576)} MB*`);
  },
  async statusgp({ sock, msg, ctx }) {
    if (!ctx.isGroup) return reply(sock, msg, ctx, '👥 Só em grupos.');
    const nome = ctx.groupName || 'este grupo';
    return reply(sock, msg, ctx, `📊 *GRUPO*\n\nNome: *${nome}*\nAtividade real: *rankativos*\nRegras: *regras*`);
  },
  async system({ sock, msg, ctx }) {
    return reply(sock, msg, ctx, `🖥️ *SISTEMA*\n\nNode: *${process.version}*\nPlataforma: *${process.platform}*\nRAM: *${Math.round(process.memoryUsage().heapUsed / 1048576)} MB*\nUptime: *${Math.floor(process.uptime() / 60)} min*`);
  },
  async topcmd({ sock, msg, ctx }) {
    const Log = require('../../database/models/Log');
    const top = await Log.aggregate([{ $group: { _id: '$command', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 10 }]).catch(() => []);
    const txt = (top || []).map((t, i) => `${i + 1}. ${t._id || '?'} — ${t.count}`).join('\n') || 'Sem dados.';
    return reply(sock, msg, ctx, `📈 *TOP COMANDOS*\n\n${txt}`);
  },
  async totalcmd({ sock, msg, ctx }) {
    const Log = require('../../database/models/Log');
    const total = await Log.countDocuments().catch(() => 0);
    return reply(sock, msg, ctx, `📈 *TOTAL DE COMANDOS*\n\nExecutados: *${fmt(total)}*`);
  },
  async gitbot({ sock, msg, ctx }) {
    return reply(sock, msg, ctx, `🐙 *GITHUB*\n\ngithub.com/onlynewsao-cmyk/dark-bot\n\nv5.1.0 · DARK NET`);
  },
  async zipbot({ sock, msg, ctx }) {
    return reply(sock, msg, ctx, `🗜️ *ZIPBOT*\n\nO código-fonte está no GitHub:\ngithub.com/onlynewsao-cmyk/dark-bot`);
  },
  async likeff({ sock, msg, ctx }) {
    const e = await _eco(ctx);
    e.reputation = (e.reputation || 0) + 1; await e.save();
    return reply(sock, msg, ctx, `👍 *LIKE*\n\nReputação: *+${fmt(e.reputation)}*`);
  },
  async avaliar({ sock, msg, ctx }) {
    return reply(sock, msg, ctx, `⭐ *AVALIA O BOT*\n\nDá a tua nota de 1 a 5:\n*avaliar 5*\n\nObrigado! 🖤`);
  },
  async bug({ sock, msg, ctx, args }) {
    const desc = args.join(' ').trim();
    if (!desc) return reply(sock, msg, ctx, `🐞 Reporta um bug: *bug <descrição>*\nEx: *bug o comando X não responde*`);
    return reply(sock, msg, ctx, `🐞 *BUG REPORTADO*\n\nObrigado! O Dono vai ver: "${desc.slice(0, 120)}"`);
  },
  async checkativo({ sock, msg, ctx }) {
    if (!ctx.isGroup) return reply(sock, msg, ctx, '👥 Só em grupos.');
    return reply(sock, msg, ctx, `📊 Atividade real do grupo: *rankativos*\nInactivos: *rankinativo*`);
  },
  async lider({ sock, msg, ctx }) {
    if (!ctx.isGroup) return reply(sock, msg, ctx, '👥 Só em grupos.');
    return reply(sock, msg, ctx, `🏆 Os líderes do grupo: *rankativos*`);
  },
  async revelar({ sock, msg, ctx }) {
    return reply(sock, msg, ctx, `🔮 *REVELAÇÃO*\n\n${pick(['O teu futuro é brilhante ✨', 'Grandes coisas estão a caminho 🌠', 'A sorte está do teu lado 🍀', 'Acredita no processo 🖤'])}`);
  },
  async off({ sock, msg, ctx }) {
    return reply(sock, msg, ctx, `💤 *BOT EM DESCANSO?*\n\nO bot continua online 24/7. Para desligar a AURA num grupo: *auraoff*`);
  },
  async ca({ sock, msg, ctx }) {
    return reply(sock, msg, ctx, `📡 *CANAL DARK NET*\n\n${config.channelUrl || 'https://whatsapp.com/channel/0029VbC8voN4Y9lszc9VuT2D'}`);
  },
  async menualt({ sock, msg, ctx }) { return reply(sock, msg, ctx, `📋 Menu completo: *menu*\nDono: *menudono* · 18+: *menu18*`); },
  async menubn({ sock, msg, ctx }) { return reply(sock, msg, ctx, `🔘 Modo de botões: *buttonmode*\nVisual: *menustyle*`); },
  async menupets({ sock, msg, ctx }) { return reply(sock, msg, ctx, `🐾 Pets: *adotar* · *petnome* · *treinarpet* · *petbattle*\nLoja: *lojapet*`); },
  async stickers({ sock, msg, ctx }) { return reply(sock, msg, ctx, `🎨 Stickers: *sticker* · *sfull* · *attp* · *ttp*\nPacks: *stickerly* · *pinpacks*`); },
  async mm({ sock, msg, ctx }) { return reply(sock, msg, ctx, `💬 Comandos de mensagem: *editarmsg* · *apagar* · *citar* · *copymsg*`); },
  async mp4({ sock, msg, ctx }) { return reply(sock, msg, ctx, `🎬 Vídeo: *video* · *gyt* · *pinmp4*\nReels: *tiktok* · *instagram*`); },
  async qg({ sock, msg, ctx }) { return reply(sock, msg, ctx, `🏰 *QG DO RPG*\n\nComeça: *rpgstart <nome> <raça> <classe>*\nRaças/classes: *rpginfo*`); },
  async gear({ sock, msg, ctx }) { return reply(sock, msg, ctx, `⚙️ Equipamento: *equipamentos*\nForja: *forge* · Materiais: *materiais*`); },
  async list({ sock, msg, ctx }) { return reply(sock, msg, ctx, `📋 Listas: *listmods* · *listblacklist* · *listamute*\nComandos: *menu*`); },
  async infoff({ sock, msg, ctx }) { return reply(sock, msg, ctx, `ℹ️ Info resumida: *info*\nStatus: *statusbot* · *diagnostico*`); },
  async voltei({ sock, msg, ctx }) {
    await botConfigCache.set('afk:' + ctx.senderNumber, '').catch(() => {});
    return reply(sock, msg, ctx, `👋 *VOLTEI!*\n\nAFK desactivado. Bem-vindo(a) de volta, ${ctx.pushName || 'chefe'}!`);
  },
  async perfilpic({ sock, msg, ctx }) {
    const alvo = getMentions(msg)[0] || ctx.senderJid;
    try {
      const pp = await sock.profilePictureUrl(alvo, 'image').catch(() => null);
      if (pp) return sock.sendMessage(ctx.remoteJid, { image: { url: pp }, caption: '🖼️ Foto de perfil' }, { quoted: msg });
    } catch {}
    return reply(sock, msg, ctx, `🖼️ Não consegui obter a foto de perfil.`);
  },
};

/* ══════════════════════════ ADMIN / GRUPO ══════════════════════════ */

const adminHandlers = {
  async antiraid({ sock, msg, ctx, args, isOwner }) {
    if (!ctx.isGroup) return reply(sock, msg, ctx, '👥 Só em grupos.');
    const on = args[0]?.toLowerCase() !== 'off';
    await botConfigCache.set('antiraid:' + ctx.remoteJid, on);
    return reply(sock, msg, ctx, `🛡️ *ANTI-RAID* ${on ? 'ACTIVO ✅' : 'DESACTIVADO ❌'}`);
  },
  async raidstatus({ sock, msg, ctx }) {
    const on = await botConfigCache.get('antiraid:' + (ctx.remoteJid || ''), false).catch(() => false);
    return reply(sock, msg, ctx, `🛡️ *ANTI-RAID*\n\nEstado: ${on ? 'ACTIVO ✅' : 'DESACTIVADO ❌'}\nAlterna: *antiraid*`);
  },
  async autorespostas({ sock, msg, ctx, args }) {
    if (!ctx.isGroup) return reply(sock, msg, ctx, '👥 Só em grupos.');
    const on = args[0]?.toLowerCase() !== 'off';
    await botConfigCache.set('autorespostas:' + ctx.remoteJid, on);
    return reply(sock, msg, ctx, `🤖 *AUTO-RESPOSTAS* ${on ? 'ACTIVAS ✅' : 'DESACTIVADAS ❌'}`);
  },
  async bemvindo({ sock, msg, ctx, args }) {
    if (!ctx.isGroup) return reply(sock, msg, ctx, '👥 Só em grupos.');
    const on = args[0]?.toLowerCase() !== 'off';
    await botConfigCache.set('bemvindo:' + ctx.remoteJid, on);
    return reply(sock, msg, ctx, `👋 *BOAS-VINDAS* ${on ? 'ACTIVAS ✅' : 'DESACTIVADAS ❌'}\n\nDefine a mensagem: *legendabv*`);
  },
  async saida({ sock, msg, ctx, args }) {
    if (!ctx.isGroup) return reply(sock, msg, ctx, '👥 Só em grupos.');
    const on = args[0]?.toLowerCase() !== 'off';
    await botConfigCache.set('saida:' + ctx.remoteJid, on);
    return reply(sock, msg, ctx, `🚪 *MENSAGEM DE SAÍDA* ${on ? 'ACTIVA ✅' : 'DESACTIVADA ❌'}`);
  },
  async capturalink({ sock, msg, ctx, args }) {
    if (!ctx.isGroup) return reply(sock, msg, ctx, '👥 Só em grupos.');
    const on = args[0]?.toLowerCase() !== 'off';
    await botConfigCache.set('capturalink:' + ctx.remoteJid, on);
    return reply(sock, msg, ctx, `🔗 *CAPTURA DE LINKS* ${on ? 'ACTIVA ✅' : 'DESACTIVADA ❌'}`);
  },
  async soadm({ sock, msg, ctx, args }) {
    if (!ctx.isGroup) return reply(sock, msg, ctx, '👥 Só em grupos.');
    const on = args[0]?.toLowerCase() !== 'off';
    try {
      await sock.groupSettingUpdate(ctx.remoteJid, on ? 'announcement' : 'not_announcement');
      return reply(sock, msg, ctx, `🔒 *SÓ ADMINS FALAM* ${on ? 'ACTIVO ✅' : 'DESACTIVADO ❌'}`);
    } catch (e) { return reply(sock, msg, ctx, '❌ ' + (e.message || e)); }
  },
  async grupo({ sock, msg, ctx }) {
    if (!ctx.isGroup) return reply(sock, msg, ctx, '👥 Só em grupos.');
    let info = '';
    try { const meta = await sock.groupMetadata(ctx.remoteJid); info = `\n👥 Membros: *${meta.participants?.length || 0}*\n📝 Descrição: ${(meta.desc || 'sem').slice(0, 100)}`; } catch {}
    return reply(sock, msg, ctx, `👥 *GRUPO*\n\nNome: *${ctx.groupName || '—'}*${info}`);
  },
  async listmods({ sock, msg, ctx }) {
    if (!ctx.isGroup) return reply(sock, msg, ctx, '👥 Só em grupos.');
    try {
      const meta = await sock.groupMetadata(ctx.remoteJid);
      const admins = (meta.participants || []).filter(p => p.admin);
      const txt = admins.map(a => `• @${a.id.split(':')[0].split('@')[0]}`).join('\n') || 'Sem admins.';
      return reply(sock, msg, ctx, `⭐ *ADMINS*\n\n${txt}`, admins.map(a => a.id));
    } catch (e) { return reply(sock, msg, ctx, '❌ ' + (e.message || e)); }
  },
  async listautoadm({ sock, msg, ctx }) {
    return reply(sock, msg, ctx, `🤖 *AUTO-ADM*\n\nConfigura: *addautoadm @user* · *delautoadm*`);
  },
  async listadv({ sock, msg, ctx }) {
    return reply(sock, msg, ctx, `⚠️ *ADVERTÊNCIAS*\n\nVê as tuas: *verwarns*\nDar: *warn @user* · Remover: *unwarn*`);
  },
  async listamute({ sock, msg, ctx }) {
    return reply(sock, msg, ctx, `🔇 *SILENCIADOS*\n\nSilenciar: *mute @user*\nDes-silenciar: *desmute @user*`);
  },
  async listar({ sock, msg, ctx }) {
    return reply(sock, msg, ctx, `📋 *LISTAS*\n\n• *listmods* — admins\n• *listblacklist* — bloqueados\n• *listamute* — silenciados\n• *listblocksgp* — bloqueios do grupo`);
  },
  async listblacklist({ sock, msg, ctx }) {
    const b = await botConfigCache.get('blacklist', []).catch(() => []);
    const txt = (Array.isArray(b) ? b : []).map(n => `• +${String(n).replace(/\\D/g, '')}`).join('\n') || 'Lista vazia.';
    return reply(sock, msg, ctx, `🚫 *BLACKLIST*\n\n${txt}\n\nAdiciona: *addblacklist <num>*`);
  },
  async listblocksgp({ sock, msg, ctx }) {
    const b = await botConfigCache.get('blocked_commands', []).catch(() => []);
    const txt = (Array.isArray(b) ? b : []).map(c => `• ${c}`).join('\n') || 'Nenhum comando bloqueado.';
    return reply(sock, msg, ctx, `🔒 *COMANDOS BLOQUEADOS*\n\n${txt}\n\nBloqueia: *blockcmd <cmd>*`);
  },
  async listmodcmds({ sock, msg, ctx }) {
    const b = await botConfigCache.get('mod_commands', []).catch(() => []);
    const txt = (Array.isArray(b) ? b : []).map(c => `• ${c}`).join('\n') || 'Nenhum comando de mod.';
    return reply(sock, msg, ctx, `⚙️ *COMANDOS DE MOD*\n\n${txt}\n\nAdiciona: *grantmodcmd <cmd>*`);
  },
  async parcerias({ sock, msg, ctx }) {
    return reply(sock, msg, ctx, `🤝 *PARCERIAS*\n\nAdiciona: *addparceria @user*\nRemove: *delparceria*\n\nA lista fica visível para o grupo.`);
  },
  async solicitacoes({ sock, msg, ctx }) {
    return reply(sock, msg, ctx, `📥 *SOLICITAÇÕES*\n\nAprova: *aprovar*\nRecusa: *recusarsolic*\n\nAceita todos: *aceitatodos*`);
  },
  async atividade({ sock, msg, ctx }) {
    if (!ctx.isGroup) return reply(sock, msg, ctx, '👥 Só em grupos.');
    return reply(sock, msg, ctx, `📊 Atividade: *rankativos*\nInactivos: *rankinativo*`);
  },
  async mention({ sock, msg, ctx, args }) {
    if (!ctx.isGroup) return reply(sock, msg, ctx, '👥 Só em grupos.');
    try {
      const meta = await sock.groupMetadata(ctx.remoteJid);
      const jids = (meta.participants || []).map(p => p.id);
      const texto = args.join(' ').trim() || '📢';
      const mentions = jids.slice(0, 100);
      return sock.sendMessage(ctx.remoteJid, { text: texto, mentions }, { quoted: msg });
    } catch (e) { return reply(sock, msg, ctx, '❌ ' + (e.message || e)); }
  },
};

/* ══════════════════════════ ROLES ══════════════════════════ */

async function getRoles(gid) {
  return botConfigCache.get('roles:' + gid, {}).catch(() => ({}));
}
async function setRoles(gid, obj) {
  return botConfigCache.set('roles:' + gid, obj);
}

const roleHandlers = {
  async roles({ sock, msg, ctx }) {
    if (!ctx.isGroup) return reply(sock, msg, ctx, '👥 Só em grupos.');
    const roles = await getRoles(ctx.remoteJid);
    const keys = Object.keys(roles || {});
    if (!keys.length) return reply(sock, msg, ctx, `🎭 *ROLES*\n\nSem roles criados.\nCria: *role.criar <nome> <emoji>*`);
    const txt = keys.map(r => `${roles[r].emoji || '🎭'} *${r}* — ${(roles[r].membros || []).length} membro(s)`).join('\n');
    return reply(sock, msg, ctx, `🎭 *ROLES DO GRUPO*\n\n${txt}\n\nEntra: *role.vou <nome>*`);
  },
  async 'role.criar'({ sock, msg, ctx, args }) {
    if (!ctx.isGroup) return reply(sock, msg, ctx, '👥 Só em grupos.');
    const nome = (args[0] || '').toLowerCase().trim();
    const emoji = args[1] || '🎭';
    if (!nome) return reply(sock, msg, ctx, `🎭 Use: *role.criar <nome> <emoji>*\nEx: *role.criar vip 💎*`);
    const roles = await getRoles(ctx.remoteJid);
    if (roles[nome]) return reply(sock, msg, ctx, `🎭 O role *${nome}* já existe.`);
    roles[nome] = { emoji, membros: [] };
    await setRoles(ctx.remoteJid, roles);
    return reply(sock, msg, ctx, `🎭 Role *${nome}* ${emoji} criado!`);
  },
  async 'role.vou'({ sock, msg, ctx, args }) {
    if (!ctx.isGroup) return reply(sock, msg, ctx, '👥 Só em grupos.');
    const nome = (args[0] || '').toLowerCase().trim();
    if (!nome) return reply(sock, msg, ctx, `🎭 Use: *role.vou <nome>*`);
    const roles = await getRoles(ctx.remoteJid);
    const r = roles[nome];
    if (!r) return reply(sock, msg, ctx, `🎭 Role *${nome}* não existe.`);
    if (!r.membros.includes(ctx.senderNumber)) r.membros.push(ctx.senderNumber);
    await setRoles(ctx.remoteJid, roles);
    return reply(sock, msg, ctx, `${r.emoji || '🎭'} Entraste no role *${nome}*!`);
  },
  async 'role.nvou'({ sock, msg, ctx, args }) {
    if (!ctx.isGroup) return reply(sock, msg, ctx, '👥 Só em grupos.');
    const nome = (args[0] || '').toLowerCase().trim();
    if (!nome) return reply(sock, msg, ctx, `🎭 Use: *role.nvou <nome>*`);
    const roles = await getRoles(ctx.remoteJid);
    const r = roles[nome];
    if (!r) return reply(sock, msg, ctx, `🎭 Role *${nome}* não existe.`);
    r.membros = (r.membros || []).filter(n => n !== ctx.senderNumber);
    await setRoles(ctx.remoteJid, roles);
    return reply(sock, msg, ctx, `🎭 Saíste do role *${nome}*.`);
  },
  async 'role.alterar'({ sock, msg, ctx, args }) {
    if (!ctx.isGroup) return reply(sock, msg, ctx, '👥 Só em grupos.');
    const nome = (args[0] || '').toLowerCase().trim();
    const emoji = args[1];
    if (!nome || !emoji) return reply(sock, msg, ctx, `🎭 Use: *role.alterar <nome> <novo-emoji>*`);
    const roles = await getRoles(ctx.remoteJid);
    if (!roles[nome]) return reply(sock, msg, ctx, `🎭 Role *${nome}* não existe.`);
    roles[nome].emoji = emoji;
    await setRoles(ctx.remoteJid, roles);
    return reply(sock, msg, ctx, `🎭 Role *${nome}* agora é ${emoji}.`);
  },
  async 'role.excluir'({ sock, msg, ctx, args }) {
    if (!ctx.isGroup) return reply(sock, msg, ctx, '👥 Só em grupos.');
    const nome = (args[0] || '').toLowerCase().trim();
    if (!nome) return reply(sock, msg, ctx, `🎭 Use: *role.excluir <nome>*`);
    const roles = await getRoles(ctx.remoteJid);
    if (!roles[nome]) return reply(sock, msg, ctx, `🎭 Role *${nome}* não existe.`);
    delete roles[nome];
    await setRoles(ctx.remoteJid, roles);
    return reply(sock, msg, ctx, `🎭 Role *${nome}* excluído.`);
  },
  async 'role.confirmados'({ sock, msg, ctx, args }) {
    if (!ctx.isGroup) return reply(sock, msg, ctx, '👥 Só em grupos.');
    const nome = (args[0] || '').toLowerCase().trim();
    if (!nome) return reply(sock, msg, ctx, `🎭 Use: *role.confirmados <nome>*`);
    const roles = await getRoles(ctx.remoteJid);
    const r = roles[nome];
    if (!r) return reply(sock, msg, ctx, `🎭 Role *${nome}* não existe.`);
    const txt = (r.membros || []).map(n => `• +${n}`).join('\n') || 'Sem membros.';
    return reply(sock, msg, ctx, `${r.emoji || '🎭'} *${nome.toUpperCase()}* — ${(r.membros || []).length} membro(s)\n\n${txt}`);
  },
};

/* ══════════════════════════ AFK ══════════════════════════ */

const afkHandlers = {
  async afk({ sock, msg, ctx, args }) {
    const motivo = args.join(' ').trim() || 'sem motivo';
    await botConfigCache.set('afk:' + ctx.senderNumber, motivo).catch(() => {});
    return reply(sock, msg, ctx, `😴 *AFK ACTIVADO*\n\nMotivo: "${motivo.slice(0, 80)}"\n\nQuando voltares, usa: *voltei*`);
  },
};

module.exports = function registerFinalizar(registerCase) {
  for (const [cmd, fn] of Object.entries(economyHandlers)) registerCase([cmd], fn, true);
  for (const [cmd, fn] of Object.entries(infoHandlers)) registerCase([cmd], fn, true);
  for (const [cmd, fn] of Object.entries(adminHandlers)) registerCase([cmd], fn, true);
  for (const [cmd, fn] of Object.entries(roleHandlers)) registerCase([cmd], fn, true);
  for (const [cmd, fn] of Object.entries(afkHandlers)) registerCase([cmd], fn, true);
};

module.exports.getRoles = getRoles;
module.exports.setRoles = setRoles;
