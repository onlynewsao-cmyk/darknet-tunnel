'use strict';
/**
 * AURA REACTION v12.2 💜 — Ela VÊ quem reage com emoji!
 * 
 * Antes: reactionMessage era ignorado como ruído (isNoise)
 * Agora: Aura vê quem reagiu, com que emoji, a que mensagem
 * e pode responder naturalmente.
 */

const reactionMemory = new Map(); // messageId -> [{emoji, sender, ts}]

// Quem reagiu com o que — memória por chat
const chatReactions = new Map(); // chatJid -> [{messageId, emoji, sender, senderName, ts}]

function getReactionInfo(msg) {
  try {
    const reaction = msg.message?.reactionMessage;
    if (!reaction) return null;
    
    const emoji = reaction.text || ''; // emoji ou vazio = removeu reação
    const targetKey = reaction.key || {};
    const targetId = targetKey.id || '';
    const senderJid = msg.key?.participant || msg.key?.remoteJid || '';
    const senderNumber = senderJid.split('@')[0].split(':')[0] || '';
    const pushName = msg.pushName || 'Alguém';
    const remoteJid = msg.key?.remoteJid || '';
    
    return {
      emoji,
      targetId,
      senderJid,
      senderNumber,
      pushName,
      remoteJid,
      isRemoval: !emoji, // removeu reação
      timestamp: Date.now(),
    };
  } catch (e) {
    console.warn('[AuraReaction] parse error', e.message?.slice(0,60));
    return null;
  }
}

function storeReaction(info) {
  if (!info || !info.targetId) return;
  
  // Por mensagem
  if (!reactionMemory.has(info.targetId)) reactionMemory.set(info.targetId, []);
  const list = reactionMemory.get(info.targetId);
  // Remove reação anterior do mesmo sender
  const existingIdx = list.findIndex(r => r.senderNumber === info.senderNumber);
  if (existingIdx >= 0) list.splice(existingIdx, 1);
  if (!info.isRemoval) list.push(info);
  if (list.length > 20) list.shift();
  
  // Por chat
  if (!chatReactions.has(info.remoteJid)) chatReactions.set(info.remoteJid, []);
  const chatList = chatReactions.get(info.remoteJid);
  if (existingIdx >=0) {
    const chatIdx = chatList.findIndex(r => r.senderNumber === info.senderNumber && r.targetId === info.targetId);
    if (chatIdx >=0) chatList.splice(chatIdx,1);
  }
  if (!info.isRemoval) {
    chatList.push(info);
    if (chatList.length > 50) chatList.shift();
  }
  
  // Limpeza
  if (reactionMemory.size > 500) reactionMemory.clear();
  if (chatReactions.size > 200) chatReactions.clear();
}

function getReactionsForMessage(messageId) {
  return reactionMemory.get(messageId) || [];
}

function getRecentReactionsForChat(chatJid, limit = 10) {
  const list = chatReactions.get(chatJid) || [];
  return list.slice(-limit);
}

function formatReactionForPrompt(info) {
  if (!info) return '';
  if (info.isRemoval) {
    return `${info.pushName} removeu a reação da mensagem`;
  }
  return `${info.pushName} reagiu com ${info.emoji} à mensagem`;
}

// Para Aura ver e reagir
function reactionContextForPrompt(chatJid) {
  const recent = getRecentReactionsForChat(chatJid, 5);
  if (!recent.length) return '';
  const lines = recent.map(r => {
    if (r.isRemoval) return `• ${r.pushName} removeu reação`;
    return `• ${r.pushName} reagiu ${r.emoji}`;
  });
  return `Reações recentes neste chat:\n${lines.join('\n')}`;
}

async function handleReaction(sock, msg, ctx) {
  const info = getReactionInfo(msg);
  if (!info) return false;
  
  storeReaction(info);
  
  console.log(`[AuraReaction] ${info.pushName} ${info.isRemoval ? 'removeu reação' : `reagiu ${info.emoji}`} em ${info.remoteJid}`);
  
  // Se reagiram à mensagem da Aura/bot, ela pode responder
  // Verifica se targetId é de mensagem dela
  try {
    const aura = require('./auraHuman');
    const isOwner = ctx?.isOwner || false;
    
    // Se é dono reagindo, Aura responde com carinho
    // Se é outra pessoa reagindo com emoji carinhoso, Aura nota
    const carinhosos = ['❤️','💜','🖤','😍','🥰','😘','😻','💕','💖','💗','😳','🥺'];
    const engracados = ['😂','🤣','😹','💀','🤭'];
    
    // Só responde se for reação à mensagem dela e for emoji carinhoso/engraçado
    // E com chance baixa pra não spammar
    if (info.emoji && !info.isRemoval) {
      const isCarinhoso = carinhosos.includes(info.emoji);
      const isEngracado = engracados.includes(info.emoji);
      
      // Guarda na memória da pessoa
      try {
        const identidade = require('./auraIdentidade');
        if (info.senderNumber) {
          identidade.registar(info.remoteJid, {
            numero: info.senderNumber,
            nome: info.pushName,
            jid: info.senderJid,
          }, `[reagiu com ${info.emoji}]`, { ts: Date.now() });
        }
      } catch {}
      
      // Se for dono reagindo com carinho à mensagem dela, ela responde
      if (isOwner && isCarinhoso && Math.random() < 0.4) {
        const respostas = [
          `hehe tu reagiu com ${info.emoji} na minha mensagem 🖤 rawr`,
          `${info.emoji} pra mim? 🥺💜`,
          `vi tua reação ${info.emoji} hehe`,
        ];
        const txt = respostas[Math.floor(Math.random()*respostas.length)];
        await sock.sendMessage(info.remoteJid, { text: txt }).catch(()=>{});
        return true;
      }
    }
  } catch (e) {
    console.warn('[AuraReaction] handle error', e.message?.slice(0,60));
  }
  
  return false; // não consome, só registra
}

module.exports = {
  getReactionInfo,
  storeReaction,
  getReactionsForMessage,
  getRecentReactionsForChat,
  formatReactionForPrompt,
  reactionContextForPrompt,
  handleReaction,
  _memory: reactionMemory,
  _chatMemory: chatReactions,
};
