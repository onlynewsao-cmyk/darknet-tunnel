/**
 * AURA INTENT & COMMAND HANDLER
 * Permite que a Aura execute comandos por vontade própria
 * Baseado no contexto do usuário (Dono, VIP, Free, ADM, etc.)
 */

const { getUserContext } = require('../context/userContext');
const caseHandler = require('../../bot/caseHandler');

// Comandos que cada tipo de usuário pode pedir à Aura
const PERMISSIONS = {
  owner: {
    commands: ['*'], // Todos os comandos
    auraActions: ['*'], // Todas as ações da Aura
    description: 'Dono pode pedir qualquer coisa'
  },
  subdono: {
    commands: ['*'],
    auraActions: ['*'],
    description: 'Subdono pode pedir qualquer coisa'
  },
  vip: {
    commands: ['play', 'video', 'sticker', 'ia', 'imagem', 'menu', 'ping', 'info', 'dono', 'perfil', 'clima', 'pesquisar', 'resumir'],
    auraActions: ['play', 'video', 'sticker', 'ia', 'imagem', 'menu'],
    description: 'VIP pode pedir comandos comuns'
  },
  group_admin: {
    commands: ['ban', 'kick', 'promote', 'demote', 'close', 'open', 'mute', 'warn', 'antilink', 'antispam', 'welcome'],
    auraActions: ['ban', 'kick', 'promote', 'demote', 'close', 'open', 'mute'],
    description: 'ADM pode pedir ações de grupo'
  },
  free: {
    commands: ['menu', 'ping', 'info', 'dono', 'start', 'vip'],
    auraActions: ['menu', 'ping'],
    description: 'Free só pode comandos públicos'
  }
};

async function shouldExecuteCommand(userNumber, command, isGroup = false, groupMeta = null) {
  const ctx = await getUserContext(userNumber, isGroup, groupMeta);

  // Dono e Subdonos podem mandar executar qualquer coisa
  if (ctx.isOwner || ctx.role === 'subdono') {
    return { execute: true, reason: 'owner', context: ctx };
  }

  // VIPs podem pedir comandos comuns
  if (ctx.role === 'vip') {
    const vipCmds = PERMISSIONS.vip.commands;
    if (vipCmds.includes('*') || vipCmds.includes(command.toLowerCase())) {
      return { execute: true, reason: 'vip', context: ctx };
    }
    return { execute: false, reason: 'vip_limitado', context: ctx };
  }

  // ADM do grupo pode pedir ações de grupo
  if (ctx.isGroupAdmin) {
    const adminCmds = PERMISSIONS.group_admin.commands;
    if (adminCmds.includes('*') || adminCmds.includes(command.toLowerCase())) {
      return { execute: true, reason: 'group_admin', context: ctx };
    }
  }

  // Free / Desconhecido → só comandos públicos
  const publicCmds = PERMISSIONS.free.commands;
  if (publicCmds.includes('*') || publicCmds.includes(command.toLowerCase())) {
    return { execute: true, reason: 'public', context: ctx };
  }

  return { execute: false, reason: 'insufficient_permission', context: ctx };
}

async function auraExecuteCommand(sock, msg, ctx, command, args = []) {
  const userCtx = await getUserContext(ctx.senderNumber, ctx.isGroup, ctx.groupMeta);
  
  const decision = await shouldExecuteCommand(
    ctx.senderNumber, 
    command, 
    ctx.isGroup, 
    ctx.groupMeta
  );

  if (!decision.execute) {
    return { 
      executed: false, 
      message: `Não posso executar "${command}" para você.`,
      context: decision.context
    };
  }

  // Executa o comando via caseHandler
  try {
    const caseCtx = {
      sock,
      msg,
      ctx,
      args,
      text: args.join(' '),
      prefix: ctx.prefix || '.',
      command: command.toLowerCase(),
      isOwner: userCtx.isOwner,
      config: {}
    };

    const result = await caseHandler.runCase(command.toLowerCase(), caseCtx);
    return { 
      executed: true, 
      reason: decision.reason,
      result,
      context: decision.context
    };
  } catch (e) {
    return { 
      executed: false, 
      message: 'Erro ao executar comando: ' + e.message,
      context: decision.context
    };
  }
}

// ── DETECÇÃO DE INTENÇÃO ───────────────────────────────
function detectIntent(text) {
  const t = String(text || '').toLowerCase().trim().replace(/^(aura|a aura|da aura|pra aura|com a aura)\s*/i, '');
  
  // Ações de grupo
  if (/^(cria|criar|faz|fazer)\s*(um)?\s*grupo/i.test(t)) return { intent: 'create_group', confidence: 0.9 };
  if (/^(sai|sair)\s*(desse|do|deste)\s*grupo/i.test(t)) return { intent: 'leave_group', confidence: 0.9 };
  if (/^(pega|pegar|mostra|ver|envia)\s*(o)?\s*link/i.test(t)) return { intent: 'get_link', confidence: 0.8 };
  if (/^(revoga|revogar|trocar|mudar)\s*(o)?\s*link/i.test(t)) return { intent: 'revoke_link', confidence: 0.8 };
  if (/^(muda|mudar|altera|alterar)\s*(o)?\s*nome/i.test(t)) return { intent: 'set_subject', confidence: 0.8 };
  if (/^(muda|mudar|altera|alterar)\s*(a)?\s*descrição/i.test(t)) return { intent: 'set_description', confidence: 0.8 };
  if (/^(bloqueia|bloquear)\s*(o|a)?\s*\w+/i.test(t)) return { intent: 'block_user', confidence: 0.8 };
  if (/^(desbloqueia|desbloquear)\s*(o|a)?\s*\w+/i.test(t)) return { intent: 'unblock_user', confidence: 0.8 };
  
  // Ações de mensagem
  if (/^(manda|envia|mandar|enviar)\s*(uma)?\s*localização/i.test(t)) return { intent: 'send_location', confidence: 0.8 };
  if (/^(cria|criar|faz|fazer)\s*(uma)?\s*enquete/i.test(t)) return { intent: 'send_poll', confidence: 0.8 };
  if (/^(encaminha|encaminhar|reenviar|reenvia)/i.test(t)) return { intent: 'forward_message', confidence: 0.8 };
  if (/^(fixa|fixar|pinar)/i.test(t)) return { intent: 'pin_chat', confidence: 0.7 };
  if (/^(desfixa|desfixar|despinar)/i.test(t)) return { intent: 'unpin_chat', confidence: 0.7 };
  if (/^(arquiva|arquivar)/i.test(t)) return { intent: 'archive_chat', confidence: 0.7 };
  if (/^(desarquiva|desarquivar)/i.test(t)) return { intent: 'unarchive_chat', confidence: 0.7 };
  if (/^(limpa|limpar)\s*(o)?\s*chat/i.test(t)) return { intent: 'clear_chat', confidence: 0.8 };
  if (/^(silencia|silenciar)\s*(o)?\s*chat/i.test(t)) return { intent: 'mute_chat', confidence: 0.8 };
  
  // Ações de status
  if (/^(posta|postar|publicar)\s*(um)?\s*status/i.test(t)) return { intent: 'post_status', confidence: 0.8 };
  if (/^(segue|seguir)\s*(o)?\s*canal/i.test(t)) return { intent: 'follow_channel', confidence: 0.8 };
  
  // Ações de perfil
  if (/^(muda|mudar|altera|alterar)\s*(a)?\s*foto/i.test(t)) return { intent: 'change_photo', confidence: 0.8 };
  if (/^(muda|mudar|altera|alterar)\s*(o)?\s*nome/i.test(t)) return { intent: 'change_name', confidence: 0.8 };
  if (/^(muda|mudar|altera|alterar)\s*(o)?\s*status/i.test(t)) return { intent: 'change_status', confidence: 0.8 };
  
  // Reações
  if (/^(reage|reagir)\s*(com)?\s*/i.test(t)) return { intent: 'react', confidence: 0.7 };
  
  return { intent: 'unknown', confidence: 0 };
}

module.exports = {
  shouldExecuteCommand,
  auraExecuteCommand,
  detectIntent,
  PERMISSIONS,
};
