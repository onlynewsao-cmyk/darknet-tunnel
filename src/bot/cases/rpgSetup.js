/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║   DARK BOT v7 — DARKRPG Setup & Admin Commands              ║
 * ║   Comandos para criar, configurar e gerir a comunidade RPG   ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */
'use strict';

const config = require('../../config');
const rpg = require('../rpg/engine');
const community = require('../rpg/community');

async function tReply(sock, msg, ctx, title, lines) {
  const rpgTheme = require('../rpg/rpgTheme');
  return rpgTheme.rpgReply(sock, msg, ctx, title, lines);
}

module.exports = function registerRPGSetup(registerCase) {

  // ═══ SETUP DARKRPG ═══
  // v6.63: colidia com o !darkrpg de rpgCommunity.js (que cria a
  // comunidade a sério). Como rpgCommunity.js carrega primeiro e o
  // registerCase usa onlyIfNew, ESTE case estava morto — inalcançável.
  registerCase(['darkrpg-guia', 'rpgsetup', 'rpgguia'], async ({ sock, msg, ctx, isOwner }) => {
    if (!isOwner) return tReply(sock, msg, ctx, '🚫 Acesso', ['Só o dono pode configurar o DARKRPG.']);

    return tReply(sock, msg, ctx, '⚔️ DARKRPG — SETUP COMPLETO', [
      '━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '📋 *COMANDOS PARA CRIAR A COMUNIDADE:*',
      '',
      '🏰 *1. CRIAR A COMUNIDADE:*',
      '   Cria a comunidade pela app do WhatsApp (não gasta queries)',
      '   Adiciona o bot e dá-lhe admin',
      '   !darkrpg — O bot deteta-a e cria os grupos do RPG',
      '',
      '🎮 *2. ATIVAR OS GRUPOS:*',
      '   Entra em cada grupo e usa, do dono:',
      '   !setarena !setdungeons !settrocas',
      '   !setcavernas !setlazer !setarsenal',
      '',
      '📢 *3. CONFIGURAR O GRUPO:*',
      '   !setnomegrupo DARK VILLE ⚔️ — Define o nome',
      '   !setdesc Grupo oficial do RPG — Descrição',
      '   !welcome on — Boas-vindas (!bvrpg on no RPG)',
      '   !antilink on — Protege contra links',
      '',
      '⚔️ *4. MODERAÇÃO:*',
      '   !regrasrpg — Regras da comunidade RPG',
      '   !warn @user — Avisa um membro',
      '   !kick @user — Remove do grupo',
      '   !ban @user — Bane permanentemente',
      '',
      '🎭 *5. AURA NO GRUPO:*',
      '   "aura acorda aqui" — A AURA fica presente',
      '   !auramod batalha — Duelos com a AURA',
      '   !auramod ranking — Ranking público',
      '',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '💡 *Execute os comandos na ordem acima!*',
    ]);
  }, true);

  // ═══ REGRAS DA COMUNIDADE ═══
  // v6.63: 'regras'/'rules'/'normas' já são de cases/grupos.js
  // (carrega antes) — este case nunca corria. Renomeado.
  registerCase(['regrasrpg', 'regrasville', 'rpgregras'], async ({ sock, msg, ctx }) => {
    return sock.sendMessage(ctx.remoteJid, { text: community.COMMUNITY_RULES }, { quoted: msg });
  }, true);

  // ═══ RANKING PÚBLICO ═══
  // v7.47: 'toprpg' saiu daqui — o rpg2.js (rankrpg/toprpg/rankglobal)
  // carrega primeiro e é o dono; este alias estava morto.
  registerCase(['ranking', 'leaderboard'], async ({ sock, msg, ctx, args }) => {
    const type = (args[0] || 'level').toLowerCase();
    const validTypes = ['level', 'kills', 'berries', 'rep'];
    const category = validTypes.includes(type) ? type : 'level';

    await sock.sendMessage(ctx.remoteJid, { react: { text: '📊', key: msg.key } });

    try {
      const leaderboard = await community.generateLeaderboard(category);
      return sock.sendMessage(ctx.remoteJid, { text: leaderboard }, { quoted: msg });
    } catch (e) {
      return sock.sendMessage(ctx.remoteJid, { text: '❌ Erro ao gerar ranking: ' + e.message }, { quoted: msg });
    }
  }, true);

  // ═══ BOAS-VINDAS ═══
  // v6.63: 'welcome'/'boasvindas'/'bv' são de cases/grupos.js.
  // Este estava morto. Renomeado para não colidir.
  registerCase(['bvrpg', 'welcomerpg'], async ({ sock, msg, ctx, args, isOwner }) => {
    if (!isOwner) return tReply(sock, msg, ctx, '🚫 Acesso', ['Só o dono.']);
    if (!ctx.isGroup) return tReply(sock, msg, ctx, '👥 Grupo', ['Isto só funciona dentro do grupo.']);

    // v7.47: o on/off dizia "ativadas!" mas NÃO GRAVAVA nada (teatro). Agora
    // escreve o mesmo campo do !welcome real (grupos.js).
    const action = (args[0] || '').toLowerCase();
    if (action === 'on' || action === 'ativar' || action === 'off' || action === 'desativar') {
      const GroupSettings = require('../../database/models/GroupSettings');
      const gs = await GroupSettings.findOneAndUpdate(
        { groupJid: ctx.remoteJid },
        { $setOnInsert: { groupJid: ctx.remoteJid } },
        { upsert: true, new: true }
      );
      gs.welcomeEnabled = (action === 'on' || action === 'ativar');
      await gs.save();
      return tReply(sock, msg, ctx, gs.welcomeEnabled ? '✅ Boas-vindas' : '❌ Boas-vindas', [
        gs.welcomeEnabled
          ? '✅ Boas-vindas ATIVADAS neste grupo!'
          : '❌ Boas-vindas DESATIVADAS neste grupo!',
        'Quando alguém entrar, recebe a mensagem de boas-vindas.',
      ]);
    }

    // Mostra preview
    const welcomeMsg = community.generateWelcomeMessage(ctx.pushName || 'Novo Membro');
    return sock.sendMessage(ctx.remoteJid, { text: welcomeMsg }, { quoted: msg });
  }, true);

  // ═══ EVENTOS ═══
  // v7.47: 'eventos' saiu daqui — o interacoes2.js carrega primeiro e é o
  // dono do nome; este alias estava morto.
  registerCase(['evento', 'event'], async ({ sock, msg, ctx, args, isOwner }) => {
    const eventType = (args[0] || '').toLowerCase();

    // v7.47: ver a lista é público; só CRIAR é do dono. Antes um membro que
    // fazia !evento levava "Só o dono" sem sequer ver o que existia.
    if (!eventType) {
      const events = Object.entries(community.EVENTS).map(([key, ev]) =>
        `• *${key}* — ${ev.name}\n  ${ev.desc}\n  ⏱️ ${ev.duration / 60000} min`
      );
      return tReply(sock, msg, ctx, '🐲 EVENTOS DARKRPG', [
        'Eventos disponíveis:',
        ...events,
        '',
        isOwner ? `> Uso: !evento <tipo>` : `> O dono ativa com !evento <tipo>`,
      ]);
    }

    if (!isOwner) return tReply(sock, msg, ctx, '🚫 Acesso', ['Só o dono pode criar eventos.']);

    const event = community.EVENTS[eventType];
    if (!event) return tReply(sock, msg, ctx, '❌ Erro', ['Evento não encontrado: ' + eventType]);

    // Anuncia o evento
    const announcement = `🐲 *EVENTO DARKRPG ATIVADO!* 🐲

━━━━━━━━━━━━━━━━━━━━━━━━━━
${event.name}
${event.desc}
⏱️ Duração: ${event.duration / 60000} minutos
━━━━━━━━━━━━━━━━━━━━━━━━━━

🎮 *Participem! Recompensas especiais aguardam!*`;

    await sock.sendMessage(ctx.remoteJid, { text: announcement }, { quoted: msg });
    return tReply(sock, msg, ctx, '✅ Evento', [`Evento *${event.name}* ativado!`]);
  }, true);

  // ═══ AURA MODERADORA ═══
  registerCase(['auramod', 'aurarpg', 'moderar'], async ({ sock, msg, ctx, args, isOwner }) => {
    if (!isOwner) return tReply(sock, msg, ctx, '🚫 Acesso', ['Só o dono.']);

    const action = (args[0] || '').toLowerCase();

    if (action === 'batalha' || action === 'battle') {
      // v7.47: citava o !x1 (não existe) e prometia narração/imagens
      // automáticas (não existem). Texto honesto + duelo real.
      return tReply(sock, msg, ctx, '⚔️ AURA — Modo Batalha', [
        '🎭 *Modo batalha ativo neste grupo!*',
        '',
        'Duelos disponíveis agora:',
        '• !duelar — duelo rápido PvE',
        '• !lutar — combate por turnos (5 rondas)',
        '• !lutar boss — contra um boss',
        '• !arena — torneio de rondas',
        '',
        '> A narração da AURA turno-a-turno vem aí.',
      ]);
    }

    if (action === 'ranking' || action === 'rank') {
      const leaderboard = await community.generateLeaderboard('level');
      return sock.sendMessage(ctx.remoteJid, { text: leaderboard }, { quoted: msg });
    }

    return tReply(sock, msg, ctx, '🎭 AURA — Moderação', [
      'A AURA pode moderar:',
      '',
      '• !auramod batalha — Narra batalhas',
      '• !auramod ranking — Mostra ranking',
      '',
      'A AURA também pode:',
      '• Dar boas-vindas a novos membros',
      '• Responder dúvidas sobre o RPG',
      '• Narrar eventos especiais',
      '• Ajudar com comandos',
    ]);
  }, true);

  // ═══ DARKRPG MENU ═══
  // v6.63: colidia com o menu-rpg de rpgCommunity.js. Renomeado.
  registerCase(['menu-rpg2', 'menurpgfull'], async ({ sock, msg, ctx, prefix }) => {
    const p = prefix || '!';

    // v7.47: o menu citava despertar/portal/x1/gacha/cartas/forja/raid —
    // NENHUM existe (o utilizador escrevia e não acontecia nada). Só ficam
    // comandos reais (a forja é !forge, o duelo é !duelar, o boss é !bossrpg).
    return sock.sendMessage(ctx.remoteJid, {
      text: `━━━ ⚔️ *MENU DARKRPG* ⚔️ ━━━

🎭 *PERSONAGEM:*
• ${p}criarpersonagem — Começa a tua jornada
• ${p}rg — Ficha completa (raça, classe, stats)
• ${p}nome <nome> — Muda o teu nome
• ${p}racas — Vê raças e classes
• ${p}vidas — HP, MP e vidas

⚔️ *BATALHA:*
• ${p}lutar — Combate por turnos (!lutar boss)
• ${p}dungeon — Masmorra (loot)
• ${p}bossrpg — Boss (grande loot)
• ${p}duelar — Duelo rápido
• ${p}arena — Torneio de rondas

🗺️ *MUNDO:*
• ${p}quest — Missões com história
• ${p}explorar — Explora os biomas
• ${p}world — Mapa do mundo
• ${p}viajar <sítio> — Viaja e descobre
• ${p}npc — Fala com NPCs

🎒 *ITENS & OFÍCIOS:*
• ${p}inventario — O teu baú
• ${p}loja — Comprar itens
• ${p}vender <item> — Vende o loot
• ${p}forge — Forja armas e poções
• ${p}minerar — Minera • ${p}pescar — Pesca
• ${p}work — Trabalha por coins

🏰 *SOCIAL:*
• ${p}guilda — Criar/ver guilda
• ${p}criaclan <nome> — Criar clã (5000)
• ${p}ranking — Leaderboard
• ${p}regrasrpg — Regras da comunidade

📊 *INFO:*
• ${p}darkrpg — Comunidade DARK VILLE
• ${p}evento — Ver/criar eventos`
    }, { quoted: msg });
  }, true);
};
