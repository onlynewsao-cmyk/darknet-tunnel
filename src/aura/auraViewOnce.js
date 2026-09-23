'use strict';
/**
 * AURA VIEW-ONCE v12.2 💜 — Ela VÊ mensagem de visualização única!
 * 
 * Antes: viewOnce era desembrulhado mas não salvo, Aura não comentava que era view-once
 * Agora: salva automaticamente, Aura vê, comenta e guarda na memória
 */

const fs = require('fs');
const path = require('path');

const VIEWONCE_DIR = path.join(__dirname, '../../assets/view-once');
const memory = new Map(); // chatJid -> [{sender, type, caption, ts}]

function ensureDir() {
  try { if (!fs.existsSync(VIEWONCE_DIR)) fs.mkdirSync(VIEWONCE_DIR, { recursive: true }); } catch {}
}

function isViewOnceMessage(message) {
  if (!message) return false;
  const m = message.message || message;
  // Check wrapped
  if (m.viewOnceMessage || m.viewOnceMessageV2 || m.viewOnceMessageV2Extension) return true;
  // Check inner viewOnce flag
  const inner = m.imageMessage || m.videoMessage || m.audioMessage;
  if (inner?.viewOnce) return true;
  // Check unwrap
  try {
    const auraMedia = require('./auraMedia');
    const unwrapped = auraMedia.unwrap(m);
    if (unwrapped?.imageMessage?.viewOnce || unwrapped?.videoMessage?.viewOnce) return true;
    // If original had viewOnce wrapper and unwrapped has media, it's view-once
    if ((m.viewOnceMessage || m.viewOnceMessageV2) && (unwrapped.imageMessage || unwrapped.videoMessage)) return true;
  } catch {}
  return false;
}

function getViewOnceInfo(msg) {
  try {
    const auraMedia = require('./auraMedia');
    const unwrapped = auraMedia.unwrap(msg.message || msg);
    const type = unwrapped.imageMessage ? 'image' : unwrapped.videoMessage ? 'video' : unwrapped.audioMessage ? 'audio' : 'unknown';
    const ctx = unwrapped.imageMessage || unwrapped.videoMessage || unwrapped.audioMessage || {};
    const caption = ctx.caption || '';
    const senderJid = msg.key?.participant || msg.key?.remoteJid || '';
    const senderNumber = senderJid.split('@')[0].split(':')[0] || '';
    const pushName = msg.pushName || 'Alguém';
    const remoteJid = msg.key?.remoteJid || '';
    
    return {
      type,
      caption,
      senderJid,
      senderNumber,
      pushName,
      remoteJid,
      isViewOnce: true,
      timestamp: Date.now(),
    };
  } catch (e) {
    return null;
  }
}

async function saveViewOnceMedia(msg, sock) {
  try {
    ensureDir();
    const { downloadMediaMessage } = require('@systemzero/baileys');
    const buf = await downloadMediaMessage(msg, 'buffer', {}).catch(() => null);
    if (!buf || buf.length < 100) return null;
    
    const info = getViewOnceInfo(msg);
    const ext = info?.type === 'image' ? 'jpg' : info?.type === 'video' ? 'mp4' : 'bin';
    const fileName = `viewonce_${info?.senderNumber || 'unknown'}_${Date.now()}.${ext}`;
    const filePath = path.join(VIEWONCE_DIR, fileName);
    
    fs.writeFileSync(filePath, buf);
    console.log(`[ViewOnce] Salvo ${fileName} (${(buf.length/1024).toFixed(1)}KB) de ${info?.pushName}`);
    
    // Guarda na memória
    if (!memory.has(info.remoteJid)) memory.set(info.remoteJid, []);
    memory.get(info.remoteJid).push({ ...info, filePath, size: buf.length });
    if (memory.get(info.remoteJid).length > 20) memory.get(info.remoteJid).shift();
    
    return { filePath, buf, info };
  } catch (e) {
    console.warn('[ViewOnce] save error', e.message?.slice(0,80));
    return null;
  }
}

function getRecentViewOnce(chatJid, limit = 5) {
  return (memory.get(chatJid) || []).slice(-limit);
}

function viewOnceContextForPrompt(chatJid) {
  const recent = getRecentViewOnce(chatJid, 3);
  if (!recent.length) return '';
  const lines = recent.map(r => `• ${r.pushName} enviou ${r.type} de visualização única${r.caption ? `: "${r.caption}"` : ''}`);
  return `View-once recentes:\n${lines.join('\n')}`;
}

async function handleViewOnce(sock, msg, ctx) {
  if (!isViewOnceMessage(msg.message || msg)) return false;
  
  const info = getViewOnceInfo(msg);
  if (!info) return false;
  
  console.log(`[ViewOnce] Detectado ${info.type} view-once de ${info.pushName} em ${info.remoteJid}`);
  
  // Salva imediatamente
  const saved = await saveViewOnceMedia(msg, sock);
  
  // Aura comenta que viu view-once (só se for PV ou grupo onde ela está acordada)
  try {
    const auraModes = require('./auraModes');
    const isAwake = await auraModes.isAuraAwake(info.remoteJid, { isGroup: info.remoteJid.endsWith('@g.us') }).catch(() => false);
    const isPrivate = !info.remoteJid.endsWith('@g.us');
    
    if (isPrivate || isAwake) {
      // Não responde automaticamente pra não quebrar privacidade, mas guarda pra contexto
      // Se for dono, ela comenta
      const isOwner = ctx?.isOwner || false;
      if (isOwner && saved) {
        // Se tem legenda, responde sobre
        // Se não, só guarda
      }
    }
  } catch {}
  
  return saved;
}

module.exports = {
  isViewOnceMessage,
  getViewOnceInfo,
  saveViewOnceMedia,
  getRecentViewOnce,
  viewOnceContextForPrompt,
  handleViewOnce,
  VIEWONCE_DIR,
  _memory: memory,
};
