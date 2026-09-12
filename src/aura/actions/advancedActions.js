/**
 * AURA ADVANCED ACTIONS
 * Funções avançadas que a Aura pode executar no WhatsApp
 * Apenas o Dark pode usar estas funções
 */

const fs = require('fs');
const path = require('path');

// ── GRUPOS ─────────────────────────────────────────────
async function leaveGroup(sock, groupJid) {
  try {
    await sock.groupLeave(groupJid);
    return { success: true, message: `Saí do grupo ${groupJid}` };
  } catch (e) {
    return { success: false, message: 'Erro ao sair do grupo: ' + e.message };
  }
}

async function getGroupInviteLink(sock, groupJid) {
  try {
    const code = await sock.groupInviteCode(groupJid);
    return { success: true, link: `https://chat.whatsapp.com/${code}`, code };
  } catch (e) {
    return { success: false, message: 'Erro ao pegar link: ' + e.message };
  }
}

async function revokeInviteLink(sock, groupJid) {
  try {
    await sock.groupRevokeInvite(groupJid);
    return { success: true, message: 'Link revogado com sucesso' };
  } catch (e) {
    return { success: false, message: 'Erro ao revogar link: ' + e.message };
  }
}

async function setGroupDescription(sock, groupJid, description) {
  try {
    await sock.groupUpdateDescription(groupJid, description);
    return { success: true, message: 'Descrição atualizada' };
  } catch (e) {
    return { success: false, message: 'Erro ao mudar descrição: ' + e.message };
  }
}

async function setGroupSubject(sock, groupJid, subject) {
  try {
    await sock.groupUpdateSubject(groupJid, subject);
    return { success: true, message: `Nome do grupo alterado para: ${subject}` };
  } catch (e) {
    return { success: false, message: 'Erro ao mudar nome: ' + e.message };
  }
}

async function getGroupMetadata(sock, groupJid) {
  try {
    const meta = await sock.groupMetadata(groupJid);
    return { success: true, metadata: meta };
  } catch (e) {
    return { success: false, message: 'Erro ao obter metadata: ' + e.message };
  }
}

async function createGroup(sock, subject, participants = []) {
  try {
    const group = await sock.groupCreate(subject, participants);
    return { success: true, message: `Grupo "${subject}" criado!`, groupJid: group.id };
  } catch (e) {
    return { success: false, message: 'Erro ao criar grupo: ' + e.message };
  }
}

// ── PRIVACIDADE ────────────────────────────────────────
async function blockUser(sock, jid) {
  try {
    await sock.updateBlockStatus(jid, 'block');
    return { success: true, message: `Usuário ${jid} bloqueado` };
  } catch (e) {
    return { success: false, message: 'Erro ao bloquear: ' + e.message };
  }
}

async function unblockUser(sock, jid) {
  try {
    await sock.updateBlockStatus(jid, 'unblock');
    return { success: true, message: `Usuário ${jid} desbloqueado` };
  } catch (e) {
    return { success: false, message: 'Erro ao desbloquear: ' + e.message };
  }
}

// ── MENSAGENS ──────────────────────────────────────────
async function sendLocation(sock, jid, latitude, longitude, caption = '') {
  try {
    await sock.sendMessage(jid, {
      location: { degreesLatitude: latitude, degreesLongitude: longitude, caption },
    });
    return { success: true, message: 'Localização enviada' };
  } catch (e) {
    return { success: false, message: 'Erro ao enviar localização: ' + e.message };
  }
}

async function sendPoll(sock, jid, question, options) {
  try {
    await sock.sendMessage(jid, {
      poll: { name: question, selectableOptionsCount: 1, options },
    });
    return { success: true, message: 'Enquete enviada' };
  } catch (e) {
    return { success: false, message: 'Erro ao enviar enquete: ' + e.message };
  }
}

async function forwardMessage(sock, toJid, message) {
  try {
    await sock.relayMessage(toJid, message.message || {}, { messageId: message.key.id });
    return { success: true, message: 'Mensagem encaminhada' };
  } catch (e) {
    return { success: false, message: 'Erro ao encaminhar: ' + e.message };
  }
}

async function sendDocument(sock, jid, buffer, fileName, mimetype, caption = '') {
  try {
    await sock.sendMessage(jid, { document: buffer, fileName, mimetype, caption });
    return { success: true, message: 'Documento enviado' };
  } catch (e) {
    return { success: false, message: 'Erro ao enviar documento: ' + e.message };
  }
}

async function sendContact(sock, jid, contactName, contactJid) {
  try {
    await sock.sendMessage(jid, {
      contacts: { displayName: contactName, contacts: [{ vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:${contactName}\nTEL;type=CELL:${contactJid}@s.whatsapp.net\nEND:VCARD` }] },
    });
    return { success: true, message: 'Contato enviado' };
  } catch (e) {
    return { success: false, message: 'Erro ao enviar contato: ' + e.message };
  }
}

// ── CONVERSAS ──────────────────────────────────────────
async function pinChat(sock, jid) {
  try {
    await sock.chatModify({ pin: true }, jid);
    return { success: true, message: 'Conversa fixada' };
  } catch (e) {
    return { success: false, message: 'Erro ao fixar: ' + e.message };
  }
}

async function unpinChat(sock, jid) {
  try {
    await sock.chatModify({ pin: false }, jid);
    return { success: true, message: 'Conversa desfixada' };
  } catch (e) {
    return { success: false, message: 'Erro ao desfixar: ' + e.message };
  }
}

async function archiveChat(sock, jid) {
  try {
    await sock.chatModify({ archive: true }, jid);
    return { success: true, message: 'Conversa arquivada' };
  } catch (e) {
    return { success: false, message: 'Erro ao arquivar: ' + e.message };
  }
}

async function unarchiveChat(sock, jid) {
  try {
    await sock.chatModify({ archive: false }, jid);
    return { success: true, message: 'Conversa desarquivada' };
  } catch (e) {
    return { success: false, message: 'Erro ao desarquivar: ' + e.message };
  }
}

async function clearChat(sock, jid) {
  try {
    await sock.chatModify({ delete: true, lastMessages: [{ key: { fromMe: true }, messageTimestamp: Date.now() }] }, jid);
    return { success: true, message: 'Chat limpo' };
  } catch (e) {
    return { success: false, message: 'Erro ao limpar chat: ' + e.message };
  }
}

async function muteChat(sock, jid, duration) {
  try {
    await sock.chatModify({ mute: duration }, jid);
    return { success: true, message: `Chat silenciado` };
  } catch (e) {
    return { success: false, message: 'Erro ao silenciar: ' + e.message };
  }
}

// ── PERFIL ─────────────────────────────────────────────
async function changeProfilePicture(sock, imageBuffer) {
  try {
    await sock.updateProfilePicture(sock.user.id, imageBuffer);
    return { success: true, message: 'Foto de perfil alterada' };
  } catch (e) {
    return { success: false, message: 'Erro ao mudar foto: ' + e.message };
  }
}

async function changeProfileName(sock, newName) {
  try {
    await sock.updateProfileName(newName);
    return { success: true, message: `Nome alterado para: ${newName}` };
  } catch (e) {
    return { success: false, message: 'Erro ao mudar nome: ' + e.message };
  }
}

async function changeProfileStatus(sock, newStatus) {
  try {
    await sock.updateProfileStatus(newStatus);
    return { success: true, message: 'Status alterado' };
  } catch (e) {
    return { success: false, message: 'Erro ao mudar status: ' + e.message };
  }
}

// ── STATUS ─────────────────────────────────────────────
async function postStatus(sock, text, mediaBuffer = null, mediaType = 'text') {
  try {
    const jid = 'status@broadcast';
    if (mediaType === 'text') {
      await sock.sendMessage(jid, { text });
    } else if (mediaType === 'image' && mediaBuffer) {
      await sock.sendMessage(jid, { image: mediaBuffer, caption: text });
    } else if (mediaType === 'video' && mediaBuffer) {
      await sock.sendMessage(jid, { video: mediaBuffer, caption: text });
    }
    return { success: true, message: 'Status postado' };
  } catch (e) {
    return { success: false, message: 'Erro ao postar status: ' + e.message };
  }
}

async function postStatusToGroups(sock, text, groupJids = []) {
  const results = [];
  for (const jid of groupJids) {
    try {
      await sock.sendMessage(jid, { text });
      results.push({ jid, success: true });
    } catch {
      results.push({ jid, success: false });
    }
  }
  return { success: true, results };
}

// ── CANAIS ─────────────────────────────────────────────
async function followChannel(sock, channelJid) {
  try {
    await sock.newsletterFollow(channelJid);
    return { success: true, message: 'Canal seguido' };
  } catch (e) {
    return { success: false, message: 'Erro ao seguir canal: ' + e.message };
  }
}

// ── REAÇÕES ────────────────────────────────────────────
async function reactToMessage(sock, msg, emoji) {
  try {
    await sock.sendMessage(msg.key.remoteJid, { react: { text: emoji, key: msg.key } });
    return { success: true, message: `Reagiu com ${emoji}` };
  } catch (e) {
    return { success: false, message: 'Erro ao reagir: ' + e.message };
  }
}

module.exports = {
  leaveGroup,
  getGroupInviteLink,
  revokeInviteLink,
  setGroupDescription,
  setGroupSubject,
  getGroupMetadata,
  createGroup,
  blockUser,
  unblockUser,
  sendLocation,
  sendPoll,
  forwardMessage,
  sendDocument,
  sendContact,
  pinChat,
  unpinChat,
  archiveChat,
  unarchiveChat,
  clearChat,
  muteChat,
  changeProfilePicture,
  changeProfileName,
  changeProfileStatus,
  postStatus,
  postStatusToGroups,
  followChannel,
  reactToMessage,
};
