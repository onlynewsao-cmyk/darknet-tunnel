/**
 * AURA MEGA ACTIONS — +100 Funcionalidades
 * Funções avançadas que a Aura pode executar no WhatsApp
 */

const fs = require('fs');
const path = require('path');

// ══════════════════════════════════════════════════════════════
// 1. GRUPOS AVANÇADOS (1-15)
// ══════════════════════════════════════════════════════════════

async function addParticipant(sock, groupJid, participantJid) {
  try {
    await sock.groupParticipantsUpdate(groupJid, [participantJid], 'add');
    return { success: true, message: `Participante adicionado ao grupo` };
  } catch (e) { return { success: false, message: e.message }; }
}

async function removeParticipant(sock, groupJid, participantJid) {
  try {
    await sock.groupParticipantsUpdate(groupJid, [participantJid], 'remove');
    return { success: true, message: `Participante removido` };
  } catch (e) { return { success: false, message: e.message }; }
}

async function promoteToAdmin(sock, groupJid, participantJid) {
  try {
    await sock.groupParticipantsUpdate(groupJid, [participantJid], 'promote');
    return { success: true, message: `Promovido a admin` };
  } catch (e) { return { success: false, message: e.message }; }
}

async function demoteFromAdmin(sock, groupJid, participantJid) {
  try {
    await sock.groupParticipantsUpdate(groupJid, [participantJid], 'demote');
    return { success: true, message: `Rebaixado de admin` };
  } catch (e) { return { success: false, message: e.message }; }
}

async function setGroupPhoto(sock, groupJid, imageBuffer) {
  try {
    await sock.updateProfilePicture(groupJid, imageBuffer);
    return { success: true, message: `Foto do grupo atualizada` };
  } catch (e) { return { success: false, message: e.message }; }
}

async function setGroupName(sock, groupJid, name) {
  try {
    await sock.groupUpdateSubject(groupJid, name);
    return { success: true, message: `Nome alterado para: ${name}` };
  } catch (e) { return { success: false, message: e.message }; }
}

async function setGroupDescription(sock, groupJid, desc) {
  try {
    await sock.groupUpdateDescription(groupJid, desc);
    return { success: true, message: `Descrição atualizada` };
  } catch (e) { return { success: false, message: e.message }; }
}

async function getGroupInfo(sock, groupJid) {
  try {
    const meta = await sock.groupMetadata(groupJid);
    return { success: true, info: {
      name: meta.subject,
      desc: meta.desc,
      owner: meta.owner,
      participants: meta.participants?.length || 0,
      admins: meta.participants?.filter(p => p.admin).length || 0,
      creation: meta.creation,
    }};
  } catch (e) { return { success: false, message: e.message }; }
}

async function listGroupAdmins(sock, groupJid) {
  try {
    const meta = await sock.groupMetadata(groupJid);
    const admins = meta.participants?.filter(p => p.admin) || [];
    return { success: true, admins: admins.map(a => ({ name: a.id.split('@')[0], admin: a.admin })) };
  } catch (e) { return { success: false, message: e.message }; }
}

async function listGroupMembers(sock, groupJid) {
  try {
    const meta = await sock.groupMetadata(groupJid);
    const members = meta.participants?.map(p => ({ id: p.id, admin: p.admin || false })) || [];
    return { success: true, members, total: members.length };
  } catch (e) { return { success: false, message: e.message }; }
}

async function getGroupInviteLink(sock, groupJid) {
  try {
    const code = await sock.groupInviteCode(groupJid);
    return { success: true, link: `https://chat.whatsapp.com/${code}` };
  } catch (e) { return { success: false, message: e.message }; }
}

async function revokeGroupInviteLink(sock, groupJid) {
  try {
    await sock.groupRevokeInvite(groupJid);
    return { success: true, message: `Link revogado` };
  } catch (e) { return { success: false, message: e.message }; }
}

async function leaveGroup(sock, groupJid) {
  try {
    await sock.groupLeave(groupJid);
    return { success: true, message: `Saí do grupo` };
  } catch (e) { return { success: false, message: e.message }; }
}

async function createGroup(sock, name, participants = []) {
  try {
    const group = await sock.groupCreate(name, participants);
    return { success: true, message: `Grupo "${name}" criado`, groupJid: group.id };
  } catch (e) { return { success: false, message: e.message }; }
}

async function closeGroup(sock, groupJid) {
  try {
    await sock.groupSettingUpdate(groupJid, 'announcement');
    return { success: true, message: `Grupo fechado` };
  } catch (e) { return { success: false, message: e.message }; }
}

// ══════════════════════════════════════════════════════════════
// 2. MÍDIA AVANÇADA (16-35)
// ══════════════════════════════════════════════════════════════

async function sendImage(sock, jid, imageBuffer, caption = '') {
  try {
    await sock.sendMessage(jid, { image: imageBuffer, caption });
    return { success: true };
  } catch (e) { return { success: false, message: e.message }; }
}

async function sendVideo(sock, jid, videoBuffer, caption = '') {
  try {
    await sock.sendMessage(jid, { video: videoBuffer, caption });
    return { success: true };
  } catch (e) { return { success: false, message: e.message }; }
}

async function sendAudio(sock, jid, audioBuffer, mimetype = 'audio/mpeg') {
  try {
    await sock.sendMessage(jid, { audio: audioBuffer, mimetype });
    return { success: true };
  } catch (e) { return { success: false, message: e.message }; }
}

async function sendVoiceNote(sock, jid, audioBuffer) {
  try {
    await sock.sendMessage(jid, { audio: audioBuffer, mimetype: 'audio/ogg; codecs=opus', ptt: true });
    return { success: true };
  } catch (e) { return { success: false, message: e.message }; }
}

async function sendSticker(sock, jid, stickerBuffer) {
  try {
    await sock.sendMessage(jid, { sticker: stickerBuffer });
    return { success: true };
  } catch (e) { return { success: false, message: e.message }; }
}

async function sendGif(sock, jid, gifBuffer, caption = '') {
  try {
    await sock.sendMessage(jid, { video: gifBuffer, caption, gifPlayback: true });
    return { success: true };
  } catch (e) { return { success: false, message: e.message }; }
}

async function sendDocument(sock, jid, buffer, fileName, mimetype) {
  try {
    await sock.sendMessage(jid, { document: buffer, fileName, mimetype });
    return { success: true };
  } catch (e) { return { success: false, message: e.message }; }
}

async function sendContact(sock, jid, name, number) {
  try {
    await sock.sendMessage(jid, {
      contacts: { displayName: name, contacts: [{ vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:${name}\nTEL;type=CELL:${number}\nEND:VCARD` }] },
    });
    return { success: true };
  } catch (e) { return { success: false, message: e.message }; }
}

async function sendLocation(sock, jid, lat, lng, caption = '') {
  try {
    await sock.sendMessage(jid, { location: { degreesLatitude: lat, degreesLongitude: lng, caption } });
    return { success: true };
  } catch (e) { return { success: false, message: e.message }; }
}

async function sendPoll(sock, jid, question, options) {
  try {
    await sock.sendMessage(jid, { poll: { name: question, selectableOptionsCount: 1, options } });
    return { success: true };
  } catch (e) { return { success: false, message: e.message }; }
}

async function sendReaction(sock, msg, emoji) {
  try {
    await sock.sendMessage(msg.key.remoteJid, { react: { text: emoji, key: msg.key } });
    return { success: true };
  } catch (e) { return { success: false, message: e.message }; }
}

async function sendReply(sock, jid, text, quotedMsg) {
  try {
    await sock.sendMessage(jid, { text }, { quoted: quotedMsg });
    return { success: true };
  } catch (e) { return { success: false, message: e.message }; }
}

async function sendMention(sock, jid, text, mentions) {
  try {
    await sock.sendMessage(jid, { text, mentions });
    return { success: true };
  } catch (e) { return { success: false, message: e.message }; }
}

async function sendDisappearingMessage(sock, jid, text, duration = 86400) {
  try {
    await sock.sendMessage(jid, { text, disappearingMessagesInChat: duration });
    return { success: true };
  } catch (e) { return { success: false, message: e.message }; }
}

async function sendButtons(sock, jid, text, buttons, footer = '') {
  try {
    await sock.sendMessage(jid, { text, buttons, footer });
    return { success: true };
  } catch (e) { return { success: false, message: e.message }; }
}

async function sendList(sock, jid, title, text, sections, buttonText = 'Abrir') {
  try {
    await sock.sendMessage(jid, { title, text, sections, buttonText });
    return { success: true };
  } catch (e) { return { success: false, message: e.message }; }
}

async function sendTemplateButtons(sock, jid, text, templates) {
  try {
    await sock.sendMessage(jid, { text, templateButtons: templates });
    return { success: true };
  } catch (e) { return { success: false, message: e.message }; }
}

// ══════════════════════════════════════════════════════════════
// 3. PERFIL E STATUS (36-50)
// ══════════════════════════════════════════════════════════════

async function setProfilePicture(sock, imageBuffer) {
  try {
    await sock.updateProfilePicture(sock.user.id, imageBuffer);
    return { success: true, message: `Foto de perfil alterada` };
  } catch (e) { return { success: false, message: e.message }; }
}

async function setProfileName(sock, name) {
  try {
    await sock.updateProfileName(name);
    return { success: true, message: `Nome alterado para: ${name}` };
  } catch (e) { return { success: false, message: e.message }; }
}

async function setProfileStatus(sock, status) {
  try {
    await sock.updateProfileStatus(status);
    return { success: true, message: `Status alterado` };
  } catch (e) { return { success: false, message: e.message }; }
}

async function postStatus(sock, text, mediaBuffer = null, mediaType = 'text') {
  try {
    const jid = 'status@broadcast';
    if (mediaType === 'text') await sock.sendMessage(jid, { text });
    else if (mediaType === 'image') await sock.sendMessage(jid, { image: mediaBuffer, caption: text });
    else if (mediaType === 'video') await sock.sendMessage(jid, { video: mediaBuffer, caption: text });
    return { success: true, message: `Status postado` };
  } catch (e) { return { success: false, message: e.message }; }
}

async function postStatusToGroups(sock, text, groupJids = []) {
  const results = [];
  for (const jid of groupJids) {
    try { await sock.sendMessage(jid, { text }); results.push({ jid, success: true }); }
    catch { results.push({ jid, success: false }); }
    // v7.45 anti-restrição: 6–10 s entre destinatários
    await new Promise(r => setTimeout(r, 6000 + Math.floor(Math.random() * 4000)));
  }
  return { success: true, results };
}

async function followChannel(sock, channelJid) {
  try {
    await sock.newsletterFollow(channelJid);
    return { success: true, message: `Canal seguido` };
  } catch (e) { return { success: false, message: e.message }; }
}

async function unfollowChannel(sock, channelJid) {
  try {
    await sock.newsletterUnfollow(channelJid);
    return { success: true, message: `Canal deixado de seguir` };
  } catch (e) { return { success: false, message: e.message }; }
}

async function blockUser(sock, jid) {
  try {
    await sock.updateBlockStatus(jid, 'block');
    return { success: true, message: `Usuário bloqueado` };
  } catch (e) { return { success: false, message: e.message }; }
}

async function unblockUser(sock, jid) {
  try {
    await sock.updateBlockStatus(jid, 'unblock');
    return { success: true, message: `Usuário desbloqueado` };
  } catch (e) { return { success: false, message: e.message }; }
}

async function getProfilePicture(sock, jid) {
  try {
    const url = await sock.profilePictureUrl(jid, 'image');
    return { success: true, url };
  } catch (e) { return { success: false, message: e.message }; }
}

async function getPresence(sock, jid) {
  try {
    const presence = await sock.presenceSubscribe(jid);
    return { success: true, presence };
  } catch (e) { return { success: false, message: e.message }; }
}

async function getBusinessProfile(sock, jid) {
  try {
    const profile = await sock.getBusinessProfile(jid);
    return { success: true, profile };
  } catch (e) { return { success: false, message: e.message }; }
}

// ══════════════════════════════════════════════════════════════
// 4. CONVERSAS E CHAT (51-70)
// ══════════════════════════════════════════════════════════════

async function pinChat(sock, jid) {
  try {
    await sock.chatModify({ pin: true }, jid);
    return { success: true, message: `Conversa fixada` };
  } catch (e) { return { success: false, message: e.message }; }
}

async function unpinChat(sock, jid) {
  try {
    await sock.chatModify({ pin: false }, jid);
    return { success: true, message: `Conversa desfixada` };
  } catch (e) { return { success: false, message: e.message }; }
}

async function archiveChat(sock, jid) {
  try {
    await sock.chatModify({ archive: true }, jid);
    return { success: true, message: `Conversa arquivada` };
  } catch (e) { return { success: false, message: e.message }; }
}

async function unarchiveChat(sock, jid) {
  try {
    await sock.chatModify({ archive: false }, jid);
    return { success: true, message: `Conversa desarquivada` };
  } catch (e) { return { success: false, message: e.message }; }
}

async function clearChat(sock, jid) {
  try {
    await sock.chatModify({ delete: true, lastMessages: [{ key: { fromMe: true }, messageTimestamp: Date.now() }] }, jid);
    return { success: true, message: `Chat limpo` };
  } catch (e) { return { success: false, message: e.message }; }
}

async function muteChat(sock, jid, duration) {
  try {
    await sock.chatModify({ mute: duration }, jid);
    return { success: true, message: `Chat silenciado` };
  } catch (e) { return { success: false, message: e.message }; }
}

async function unmuteChat(sock, jid) {
  try {
    await sock.chatModify({ mute: null }, jid);
    return { success: true, message: `Chat desilenciado` };
  } catch (e) { return { success: false, message: e.message }; }
}

async function markAsRead(sock, jid, msgKey) {
  try {
    await sock.readMessages([{ remoteJid: jid, id: msgKey.id, fromMe: msgKey.fromMe, participant: msgKey.participant }]);
    return { success: true };
  } catch (e) { return { success: false, message: e.message }; }
}

async function markAsUnread(sock, jid) {
  try {
    await sock.chatModify({ markUnread: true }, jid);
    return { success: true };
  } catch (e) { return { success: false, message: e.message }; }
}

async function deleteMessage(sock, msg) {
  try {
    await sock.sendMessage(msg.key.remoteJid, { delete: msg.key });
    return { success: true };
  } catch (e) { return { success: false, message: e.message }; }
}

async function forwardMessage(sock, toJid, msg) {
  try {
    await sock.relayMessage(toJid, msg.message || {}, { messageId: msg.key.id });
    return { success: true };
  } catch (e) { return { success: false, message: e.message }; }
}

async function starMessage(sock, msg) {
  try {
    await sock.chatModify({ star: true }, msg.key.remoteJid, [{ id: msg.key.id, fromMe: msg.key.fromMe }]);
    return { success: true };
  } catch (e) { return { success: false, message: e.message }; }
}

async function unstarMessage(sock, msg) {
  try {
    await sock.chatModify({ star: false }, msg.key.remoteJid, [{ id: msg.key.id, fromMe: msg.key.fromMe }]);
    return { success: true };
  } catch (e) { return { success: false, message: e.message }; }
}

async function getChatHistory(sock, jid, limit = 50) {
  try {
    const messages = await sock.messages.fetch(jid, { limit }) || [];
    return { success: true, messages: Array.from(messages.values()) };
  } catch (e) { return { success: false, message: e.message }; }
}

async function searchMessages(sock, jid, query, limit = 20) {
  try {
    const messages = await sock.messages.fetch(jid, { limit }) || [];
    const results = Array.from(messages.values()).filter(m => {
      const text = m.message?.conversation || m.message?.extendedTextMessage?.text || '';
      return text.toLowerCase().includes(query.toLowerCase());
    });
    return { success: true, results };
  } catch (e) { return { success: false, message: e.message }; }
}

async function getMessageById(sock, jid, msgId) {
  try {
    const messages = await sock.messages.fetch(jid, { limit: 100 }) || [];
    const found = Array.from(messages.values()).find(m => m.key.id === msgId);
    return { success: !!found, message: found };
  } catch (e) { return { success: false, message: e.message }; }
}

async function reactToMessage(sock, msg, emoji) {
  try {
    await sock.sendMessage(msg.key.remoteJid, { react: { text: emoji, key: msg.key } });
    return { success: true };
  } catch (e) { return { success: false, message: e.message }; }
}

async function removeReaction(sock, msg) {
  try {
    await sock.sendMessage(msg.key.remoteJid, { react: { text: '', key: msg.key } });
    return { success: true };
  } catch (e) { return { success: false, message: e.message }; }
}

async function sendEphemeralMessage(sock, jid, text, expireSeconds = 86400) {
  try {
    await sock.sendMessage(jid, { text, disappearingMessagesInChat: expireSeconds });
    return { success: true };
  } catch (e) { return { success: false, message: e.message }; }
}

// ══════════════════════════════════════════════════════════════
// 5. PRIVACIDADE E SEGURANÇA (71-85)
// ══════════════════════════════════════════════════════════════

async function setLastSeenPrivacy(sock, privacy = 'contacts') {
  try {
    await sock.updateLastSeenPrivacy(privacy);
    return { success: true };
  } catch (e) { return { success: false, message: e.message }; }
}

async function setProfilePhotoPrivacy(sock, privacy = 'contacts') {
  try {
    await sock.updateProfilePhotoPrivacy(privacy);
    return { success: true };
  } catch (e) { return { success: false, message: e.message }; }
}

async function setStatusPrivacy(sock, privacy = 'contacts') {
  try {
    await sock.updateStatusPrivacy(privacy);
    return { success: true };
  } catch (e) { return { success: false, message: e.message }; }
}

async function setReadReceiptsPrivacy(sock, enabled = false) {
  try {
    await sock.updateReadReceiptsPrivacy(enabled);
    return { success: true };
  } catch (e) { return { success: false, message: e.message }; }
}

async function setGroupsPrivacy(sock, privacy = 'contacts') {
  try {
    await sock.updateGroupsAddPrivacy(privacy);
    return { success: true };
  } catch (e) { return { success: false, message: e.message }; }
}

async function setOnlinePrivacy(sock, privacy = 'match_last_seen') {
  try {
    await sock.updateOnlinePrivacy(privacy);
    return { success: true };
  } catch (e) { return { success: false, message: e.message }; }
}

async function setDisappearingMessages(sock, jid, duration = 86400) {
  try {
    await sock.sendMessage(jid, { disappearingMessagesInChat: duration });
    return { success: true };
  } catch (e) { return { success: false, message: e.message }; }
}

async function getBlockList(sock) {
  try {
    const blocklist = await sock.fetchBlocklist();
    return { success: true, blocklist };
  } catch (e) { return { success: false, message: e.message }; }
}

async function isBlocked(sock, jid) {
  try {
    const blocklist = await sock.fetchBlocklist();
    return { success: true, blocked: blocklist?.includes(jid) || false };
  } catch (e) { return { success: false, message: e.message }; }
}

async function reportUser(sock, jid, reason = 'spam') {
  try {
    await sock.updateBlockStatus(jid, 'block');
    return { success: true, message: `Usuário reportado e bloqueado` };
  } catch (e) { return { success: false, message: e.message }; }
}

async function clearAllChats(sock) {
  try {
    const chats = await sock.chatFetchAllParticipating();
    for (const jid of Object.keys(chats)) {
      await sock.chatModify({ delete: true }, jid);
    }
    return { success: true, message: `Todas as conversas limpas` };
  } catch (e) { return { success: false, message: e.message }; }
}

async function deleteAllMessages(sock, jid) {
  try {
    await sock.chatModify({ delete: true }, jid);
    return { success: true, message: `Mensagens apagadas` };
  } catch (e) { return { success: false, message: e.message }; }
}

async function exportChat(sock, jid, limit = 1000) {
  try {
    const messages = await sock.messages.fetch(jid, { limit }) || [];
    const chat = Array.from(messages.values()).map(m => ({
      from: m.key.fromMe ? 'me' : m.key.participant || m.key.remoteJid,
      text: m.message?.conversation || m.message?.extendedTextMessage?.text || '',
      timestamp: m.messageTimestamp,
    }));
    return { success: true, chat };
  } catch (e) { return { success: false, message: e.message }; }
}

async function getChatStats(sock, jid) {
  try {
    const messages = await sock.messages.fetch(jid, { limit: 1000 }) || [];
    const msgs = Array.from(messages.values());
    const total = msgs.length;
    const fromMe = msgs.filter(m => m.key.fromMe).length;
    const fromOther = total - fromMe;
    return { success: true, stats: { total, fromMe, fromOther } };
  } catch (e) { return { success: false, message: e.message }; }
}

// ══════════════════════════════════════════════════════════════
// 6. UTILITÁRIOS (86-100)
// ══════════════════════════════════════════════════════════════

async function getBatteryLevel(sock) {
  try {
    return { success: true, battery: sock.user?.battery || 'unknown' };
  } catch (e) { return { success: false, message: e.message }; }
}

async function getConnectionState(sock) {
  try {
    return { success: true, state: sock.ws?.readyState || 'unknown' };
  } catch (e) { return { success: false, message: e.message }; }
}

async function getGroups(sock) {
  try {
    const groups = await sock.groupFetchAllParticipating();
    return { success: true, groups: Object.keys(groups), total: Object.keys(groups).length };
  } catch (e) { return { success: false, message: e.message }; }
}

async function getContacts(sock) {
  try {
    const contacts = await sock.contacts.fetchAll();
    return { success: true, contacts, total: contacts.length };
  } catch (e) { return { success: false, message: e.message }; }
}

async function getContactInfo(sock, jid) {
  try {
    const contact = await sock.contacts[jid];
    return { success: true, contact };
  } catch (e) { return { success: false, message: e.message }; }
}

async function saveContact(sock, jid, name) {
  try {
    sock.contacts[jid] = { id: jid, name };
    return { success: true };
  } catch (e) { return { success: false, message: e.message }; }
}

async function deleteContact(sock, jid) {
  try {
    delete sock.contacts[jid];
    return { success: true };
  } catch (e) { return { success: false, message: e.message }; }
}

async function getProfilePicUrl(sock, jid) {
  try {
    const url = await sock.profilePictureUrl(jid, 'image');
    return { success: true, url };
  } catch (e) { return { success: false, message: e.message }; }
}

async function isOnWhatsApp(sock, jid) {
  try {
    const result = await sock.onWhatsApp(jid);
    return { success: true, registered: result?.[0]?.exists || false };
  } catch (e) { return { success: false, message: e.message }; }
}

async function requestPhoneNumber(sock, jid) {
  try {
    await sock.requestPhoneNumber(jid);
    return { success: true };
  } catch (e) { return { success: false, message: e.message }; }
}

async function sendInviteLink(sock, jid, groupJid) {
  try {
    const code = await sock.groupInviteCode(groupJid);
    await sock.sendMessage(jid, { text: `Link do grupo: https://chat.whatsapp.com/${code}` });
    return { success: true };
  } catch (e) { return { success: false, message: e.message }; }
}

async function acceptInvite(sock, inviteCode) {
  try {
    const groupJid = await sock.groupAcceptInvite(inviteCode);
    return { success: true, groupJid };
  } catch (e) { return { success: false, message: e.message }; }
}

async function rejectInvite(sock, inviteCode) {
  try {
    await sock.groupRejectInvite(inviteCode);
    return { success: true };
  } catch (e) { return { success: false, message: e.message }; }
}

async function getInviteInfo(sock, inviteCode) {
  try {
    const info = await sock.groupGetInviteInfo(inviteCode);
    return { success: true, info };
  } catch (e) { return { success: false, message: e.message }; }
}

async function logout(sock) {
  try {
    await sock.logout();
    return { success: true, message: `Logout realizado` };
  } catch (e) { return { success: false, message: e.message }; }
}

// ══════════════════════════════════════════════════════════════
// 7. EXTRA FUNCIONALIDADES (100+)
// ══════════════════════════════════════════════════════════════

async function sendBroadcast(sock, jids, text) {
  const results = [];
  for (const jid of jids) {
    try { await sock.sendMessage(jid, { text }); results.push({ jid, success: true }); }
    catch { results.push({ jid, success: false }); }
    // v7.45 anti-restrição: 6–10 s entre destinatários
    await new Promise(r => setTimeout(r, 6000 + Math.floor(Math.random() * 4000)));
  }
  return { success: true, results };
}

async function sendScheduledMessage(sock, jid, text, timestamp) {
  const delay = timestamp - Date.now();
  if (delay > 0) {
    setTimeout(async () => {
      try { await sock.sendMessage(jid, { text }); } catch {}
    }, delay);
    return { success: true, message: `Mensagem agendada para ${new Date(timestamp).toLocaleString()}` };
  }
  return { success: false, message: 'Tempo inválido' };
}

async function getUnreadMessages(sock) {
  try {
    const chats = await sock.chatFetchAllParticipating();
    const unread = [];
    for (const [jid, chat] of Object.entries(chats)) {
      if (chat.unreadCount > 0) unread.push({ jid, unread: chat.unreadCount });
    }
    return { success: true, unread };
  } catch (e) { return { success: false, message: e.message }; }
}

async function markAllAsRead(sock) {
  try {
    const chats = await sock.chatFetchAllParticipating();
    for (const jid of Object.keys(chats)) {
      await sock.chatModify({ markUnread: false }, jid);
    }
    return { success: true };
  } catch (e) { return { success: false, message: e.message }; }
}

async function getGroupMetadata(sock, groupJid) {
  try {
    const meta = await sock.groupMetadata(groupJid);
    return { success: true, metadata: meta };
  } catch (e) { return { success: false, message: e.message }; }
}

async function requestPayment(sock, jid, amount, currency = 'AOA') {
  try {
    await sock.sendMessage(jid, {
      requestPayment: { currency, amount: amount * 100, requestFrom: sock.user.id },
    });
    return { success: true };
  } catch (e) { return { success: false, message: e.message }; }
}

async function acceptPayment(sock, msg) {
  try {
    await sock.sendMessage(msg.key.remoteJid, {
      acceptPaymentRequest: { key: msg.key },
    });
    return { success: true };
  } catch (e) { return { success: false, message: e.message }; }
}

async function sendLiveLocation(sock, jid, lat, lng, caption = '') {
  try {
    await sock.sendMessage(jid, {
      liveLocation: { degreesLatitude: lat, degreesLongitude: lng, caption },
    });
    return { success: true };
  } catch (e) { return { success: false, message: e.message }; }
}

async function sendGroupInvite(sock, jid, groupJid, description = '') {
  try {
    const code = await sock.groupInviteCode(groupJid);
    await sock.sendMessage(jid, {
      groupInviteMessage: { groupJid, inviteCode: code, inviteExpiration: Date.now() + 86400000, groupName: description || 'Grupo', caption: description },
    });
    return { success: true };
  } catch (e) { return { success: false, message: e.message }; }
}

async function revokeGroupInvite(sock, groupJid) {
  try {
    await sock.groupRevokeInvite(groupJid);
    return { success: true, message: `Link revogado` };
  } catch (e) { return { success: false, message: e.message }; }
}

// ══════════════════════════════════════════════════════════════
// 8. VOZ (ElevenLabs TTS)
// ══════════════════════════════════════════════════════════════

async function sendVoiceMessage(sock, jid, text, voiceId = '21m00Tcm4TlvDq8ikWAM') {
  try {
    const ai = require('../bot/ai');
    const audioBuffer = await ai.speakWithFallback(text, voiceId);
    if (audioBuffer && audioBuffer.length > 500) {
      await sock.sendMessage(jid, { audio: audioBuffer, mimetype: 'audio/ogg; codecs=opus', ptt: true });
      return { success: true, message: 'Mensagem de voz enviada' };
    }
    throw new Error('Áudio vazio');
  } catch (e) {
    return { success: false, message: 'Erro ao enviar voz: ' + e.message };
  }
}

async function sendVoiceToGroup(sock, groupJid, text) {
  return sendVoiceMessage(sock, groupJid, text);
}

async function replyWithVoice(sock, msg, text) {
  const jid = msg.key.remoteJid;
  return sendVoiceMessage(sock, jid, text);
}

// AURA fala em resposta a mensagem
async function auraSpeakResponse(sock, msg, text) {
  const jid = msg.key.remoteJid;
  const response = await sendVoiceMessage(sock, jid, text);
  if (!response.success) {
    // Fallback para texto se voz falhar
    await sock.sendMessage(jid, { text: `_🎤 ${text}_` }, { quoted: msg });
  }
  return response;
}

// AURA canta uma música (versão texto)
async function auraSing(sock, jid, songName) {
  const lyrics = `🎵 _Aura canta: ${songName}_

🎶 La la la... 🎶
_Desculpa, ainda não sei cantar de verdade... Mas um dia aprendo! 🌹`;
  await sock.sendMessage(jid, { text: lyrics });
  return { success: true };
}

// AURA sussurra (estilo sussurro)
async function auraWhisper(sock, jid, text) {
  await sock.sendMessage(jid, { text: `_suspira_ ...${text}...` });
  return { success: true };
}

// AURA grita (estilo grito)
async function auraShout(sock, jid, text) {
  await sock.sendMessage(jid, { text: `_grita_ ${text.toUpperCase()}!!!` });
  return { success: true };
}

// AURA ri
async function auraLaugh(sock, jid) {
  const laughs = ['_ri_ 😂', '_ri muito_ 🤣🤣🤣', '_gargalha_ 😂😂😂', '_sorri_ 😊'];
  const laugh = laughs[Math.floor(Math.random() * laughs.length)];
  await sock.sendMessage(jid, { text: laugh });
  return { success: true };
}

// AURA chora
async function auraCry(sock, jid) {
  await sock.sendMessage(jid, { text: '_chora_ 😢😢😢' });
  return { success: true };
}

// ══════════════════════════════════════════════════════════════
// 9. EXPORT
// ══════════════════════════════════════════════════════════════

module.exports = {
  // Grupos (1-15)
  addParticipant, removeParticipant, promoteToAdmin, demoteFromAdmin,
  setGroupPhoto, setGroupName, setGroupDescription, getGroupInfo,
  listGroupAdmins, listGroupMembers, getGroupInviteLink, revokeGroupInviteLink,
  leaveGroup, createGroup, closeGroup,
  // Mídia (16-35)
  sendImage, sendVideo, sendAudio, sendVoiceNote, sendSticker, sendGif,
  sendDocument, sendContact, sendLocation, sendPoll, sendReaction, sendReply,
  sendMention, sendDisappearingMessage, sendButtons, sendList, sendTemplateButtons,
  // Perfil (36-50)
  setProfilePicture, setProfileName, setProfileStatus, postStatus, postStatusToGroups,
  followChannel, unfollowChannel, blockUser, unblockUser, getProfilePicture,
  getPresence, getBusinessProfile,
  // Conversas (51-70)
  pinChat, unpinChat, archiveChat, unarchiveChat, clearChat, muteChat, unmuteChat,
  markAsRead, markAsUnread, deleteMessage, forwardMessage, starMessage, unstarMessage,
  getChatHistory, searchMessages, getMessageById, reactToMessage, removeReaction,
  sendEphemeralMessage,
  // Privacidade (71-85)
  setLastSeenPrivacy, setProfilePhotoPrivacy, setStatusPrivacy, setReadReceiptsPrivacy,
  setGroupsPrivacy, setOnlinePrivacy, setDisappearingMessages, getBlockList, isBlocked,
  reportUser, clearAllChats, deleteAllMessages, exportChat, getChatStats,
  // Utilitários (86-100)
  getBatteryLevel, getConnectionState, getGroups, getContacts, getContactInfo,
  saveContact, deleteContact, getProfilePicUrl, isOnWhatsApp, requestPhoneNumber,
  sendInviteLink, acceptInvite, rejectInvite, getInviteInfo, logout,
  // Extras (100+)
  sendBroadcast, sendScheduledMessage, getUnreadMessages, markAllAsRead,
  getGroupMetadata, requestPayment, acceptPayment, sendLiveLocation,
  sendGroupInvite, revokeGroupInvite,
  // Voz
  sendVoiceMessage, sendVoiceToGroup, replyWithVoice,
  auraSpeakResponse, auraSing, auraWhisper, auraShout, auraLaugh, auraCry,
};
