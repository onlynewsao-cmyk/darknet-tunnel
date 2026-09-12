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
  const RE = require('../renderEngine');
  const t = await RE.getTheme(ctx.remoteJid);
  return sock.sendMessage(ctx.remoteJid, { text: RE.renderBlock(t, title, lines, { botName: config.bot.name }) }, { quoted: msg });
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
      '🏰 *1. CRIAR GRUPO RPG:*',
      '   !criargrupo DARKRPG — Cria o grupo principal',
      '   !setnomegrupo DARKRPG ⚔️ — Define o nome',
      '   !setdesc Grupo oficial do DARKRPG — Descrição',
      '',
      '📢 *2. CRIAR CANAL:*',
      '   !criarcanal DARKRPG — Cria o canal de notícias',
      '',
      '🎮 *3. CONFIGURAR RPG:*',
      '   !darkrpg ativar — Ativa o sistema RPG no grupo',
      '   !welcome on — Ativa boas-vindas',
      '   !antilink on — Protege contra links',
      '',
      '⚔️ *4. MODERAÇÃO:*',
      '   !regras — Mostra as regras da comunidade',
      '   !warn @user — Avisa um membro',
      '   !kick @user — Remove do grupo',
      '   !ban @user — Bane permanentemente',
      '',
      '🎭 *5. AURA MODERADORA:*',
      '   !aura on — Ativa a AURA no grupo',
      '   !aura batalha — Narra batalhas com efeitos',
      '   !aura ranking — Mostra ranking público',
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
  registerCase(['ranking', 'leaderboard', 'toprpg'], async ({ sock, msg, ctx, args }) => {
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

    const action = (args[0] || '').toLowerCase();
    if (action === 'on' || action === 'ativar') {
      return tReply(sock, msg, ctx, '✅ Boas-vindas', ['✅ Mensagens de boas-vindas ativadas!', 'Quando alguém entrar no grupo, receberá uma mensagem de boas-vindas.']);
    }
    if (action === 'off' || action === 'desativar') {
      return tReply(sock, msg, ctx, '❌ Boas-vindas', ['❌ Mensagens de boas-vindas desativadas!']);
    }

    // Mostra preview
    const welcomeMsg = community.generateWelcomeMessage(ctx.pushName || 'Novo Membro');
    return sock.sendMessage(ctx.remoteJid, { text: welcomeMsg }, { quoted: msg });
  }, true);

  // ═══ EVENTOS ═══
  registerCase(['evento', 'event', 'eventos'], async ({ sock, msg, ctx, args, isOwner }) => {
    if (!isOwner) return tReply(sock, msg, ctx, '🚫 Acesso', ['Só o dono pode criar eventos.']);

    const eventType = (args[0] || '').toLowerCase();

    if (!eventType) {
      const events = Object.entries(community.EVENTS).map(([key, ev]) =>
        `• *${key}* — ${ev.name}\n  ${ev.desc}\n  ⏱️ ${ev.duration / 60000} min`
      );
      return tReply(sock, msg, ctx, '🐲 EVENTOS DARKRPG', [
        'Eventos disponíveis:',
        ...events,
        '',
        `> Uso: !evento <tipo>`,
      ]);
    }

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
      return tReply(sock, msg, ctx, '⚔️ AURA — Modo Batalha', [
        '🎭 *AURA agora modera as batalhas!*',
        '',
        'Quando dois jogadores duelarem:',
        '• AURA narra cada turno com efeitos visuais',
        '• Gera imagens dos personagens em batalha',
        '• Calcula dano, crítico, habilidades',
        '• Declara o vencedor automaticamente',
        '',
        `> Use !x1 @user para iniciar um duelo`,
        `> A AURA cuida do resto!`,
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

    return sock.sendMessage(ctx.remoteJid, {
      text: `━━━ ⚔️ *MENU DARKRPG* ⚔️ ━━━

🎭 *PERSONAGEM:*
• ${p}despertar — Inicie sua jornada
• ${p}perfil — Veja seus status
• ${p}nome <nome> — Mude seu nome
• ${p}racas — Veja as 6 origens
• ${p}vidas — Veja suas vidas

⚔️ *BATALHA:*
• ${p}portal entrar — Enfrente bosses
• ${p}lutar — Combate PvE
• ${p}x1 @user — Duelo PvP
• ${p}arena — Torneio

🃏 *COLEÇÃO:*
• ${p}gacha — Invocar cartas (300 berries)
• ${p}cartas — Ver álbum
• ${p}loja — Comprar itens
• ${p}forja — Refinar armas

🏰 *SOCIAL:*
• ${p}guilda — Criar/ver clã
• ${p}raid — Boss mundial
• ${p}mercado — Compra/venda
• ${p}ranking — Leaderboard

📊 *INFO:*
• ${p}regras — Regras da comunidade
• ${p}darkrpg — Setup completo
• ${p}evento — Criar eventos`
    }, { quoted: msg });
  }, true);
};
