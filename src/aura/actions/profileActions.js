/**
 * AURA PROFILE & ADVANCED ACTIONS
 * Funções reais usando @systemzero/baileys
 * Apenas o Dark pode usar estas funções
 */

const fs = require('fs');
const path = require('path');

async function changeProfilePicture(sock, imageBuffer) {
  try {
    await sock.updateProfilePicture(sock.user.id, imageBuffer);
    return { success: true, message: 'Foto de perfil alterada com sucesso.' };
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
    return { success: true, message: `Status alterado para: ${newStatus}` };
  } catch (e) {
    return { success: false, message: 'Erro ao mudar status: ' + e.message };
  }
}

async function createGroup(sock, subject, participants = []) {
  try {
    const group = await sock.groupCreate(subject, participants);
    return { 
      success: true, 
      message: `Grupo "${subject}" criado com sucesso.`,
      groupJid: group.id 
    };
  } catch (e) {
    return { success: false, message: 'Erro ao criar grupo: ' + e.message };
  }
}

async function sendMessageToJid(sock, jid, text) {
  try {
    await sock.sendMessage(jid, { text });
    return { success: true, message: `Mensagem enviada para ${jid}` };
  } catch (e) {
    return { success: false, message: 'Erro ao enviar mensagem: ' + e.message };
  }
}

async function postStatus(sock, text, mediaBuffer = null, mediaType = 'text') {
  try {
    const jid = 'status@broadcast';
    let message = {};

    if (mediaType === 'text') {
      message = { text };
    } else if (mediaType === 'image' && mediaBuffer) {
      message = { image: mediaBuffer, caption: text };
    } else if (mediaType === 'video' && mediaBuffer) {
      message = { video: mediaBuffer, caption: text };
    }

    await sock.sendMessage(jid, message);
    return { success: true, message: 'Status postado com sucesso.' };
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
    } catch (e) {
      results.push({ jid, success: false, error: e.message });
    }
  }
  return { success: true, results };
}

async function followChannel(sock, channelJid) {
  try {
    await sock.newsletterFollow(channelJid);
    return { success: true, message: 'Canal seguido com sucesso.' };
  } catch (e) {
    return { success: false, message: 'Erro ao seguir canal: ' + e.message };
  }
}

module.exports = {
  changeProfilePicture,
  changeProfileName,
  changeProfileStatus,
  createGroup,
  sendMessageToJid,
  postStatus,
  postStatusToGroups,
  followChannel
};