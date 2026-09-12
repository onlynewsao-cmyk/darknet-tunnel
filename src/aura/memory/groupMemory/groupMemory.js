/**
 * AURA GROUP MEMORY SYSTEM
 * A Aura lembra quem é quem nos grupos
 * Ex: quem é ADM, quem é amigo, quem costuma spamar, etc.
 */

const groupMemory = new Map(); // groupJid -> { members: Map, lastUpdate }

function initGroup(groupJid) {
  if (!groupMemory.has(groupJid)) {
    groupMemory.set(groupJid, {
      members: new Map(),
      lastUpdate: new Date()
    });
  }
  return groupMemory.get(groupJid);
}

function rememberMember(groupJid, number, data = {}) {
  const group = initGroup(groupJid);
  const existing = group.members.get(number) || {};

  group.members.set(number, {
    ...existing,
    ...data,
    lastSeen: new Date(),
    interactions: (existing.interactions || 0) + 1
  });
}

function getMemberInfo(groupJid, number) {
  const group = initGroup(groupJid);
  return group.members.get(number) || null;
}

function markAsSpammer(groupJid, number) {
  rememberMember(groupJid, number, { isSpammer: true });
}

function markAsAdmin(groupJid, number) {
  rememberMember(groupJid, number, { isAdmin: true });
}

function getKnownMembers(groupJid) {
  const group = initGroup(groupJid);
  return Array.from(group.members.entries());
}

module.exports = {
  rememberMember,
  getMemberInfo,
  markAsSpammer,
  markAsAdmin,
  getKnownMembers
};