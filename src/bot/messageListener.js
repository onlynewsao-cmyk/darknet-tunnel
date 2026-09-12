/**
 * Listener de mensagens para:
 * - Anti-delete (salvar mensagens antes que sejam apagadas)
 * - Modo espião (emite tudo pro dashboard)
 */
const DeletedMessage = require('../database/models/DeletedMessage');
const AntiStatus = require('../database/models/AntiStatus');
const botConfigCache = require('./botConfigCache');
const GroupSettings = require('../database/models/GroupSettings');
const GroupMemberActivity = require('../database/models/GroupMemberActivity');

// --- INICIALIZAÇÃO DE CACHE (Topo do arquivo para evitar ReferenceError) ---
const messageCache = new Map();
const MAX_CACHE = 2000;
const antiStatusCache = new Set();

async function refreshAntiStatusCache() {
  try {
    const list = await AntiStatus.find({ enabled: true });
    antiStatusCache.clear();
    list.forEach(item => antiStatusCache.add(item.groupJid));
  } catch (e) {}
}

// Refresh inicial e a cada 2 min
refreshAntiStatusCache();
setInterval(refreshAntiStatusCache, 120000);

function extractText(msg) {
  const m = msg.message;
  return m?.conversation || m?.extendedTextMessage?.text ||
    m?.imageMessage?.caption || m?.videoMessage?.caption ||
    m?.documentMessage?.caption || '';
}

function detectMediaType(msg) {
  const m = msg.message;
  if (m?.imageMessage) return 'image';
  if (m?.videoMessage) return 'video';
  if (m?.audioMessage) return 'audio';
  if (m?.documentMessage) return 'document';
  if (m?.stickerMessage) return 'sticker';
  return '';
}

async function onUpsert(sock, m, io) {
  if (!sock) return;
  try {
    const msg = m.messages?.[0];
    if (!msg || !msg.message) return;

    const remoteJid = msg.key.remoteJid;
    const isGroup = remoteJid?.endsWith('@g.us');
    const msgType = Object.keys(msg.message)[0];

    // --- LÓGICA ANTI-STATUS ---
    if (isGroup && antiStatusCache.has(remoteJid)) {
      const isStatus = msgType === 'groupStatusMessageV2' || 
                       msgType === 'groupStatusMessage' || 
                       msg.message?.groupStatusMessageV2 ||
                       JSON.stringify(msg.message).includes('"isGroupStatus":true');

      if (isStatus && !msg.key.fromMe) {
        await sock.sendMessage(remoteJid, { delete: msg.key }).catch(() => {});
        return; 
      }
    }

    // --- v6.87: ANTI-FIGURINHA APRENDIDA ---
    // Figurinha ensinada com !bansticker → apagada na hora.
    // A comparação é pela metadata (fileSha256): não se descarrega nada.
    if (isGroup && msg.message?.stickerMessage) {
      try {
        const antiSticker = require('./antiSticker');
        const r = await antiSticker.filtrar(sock, msg);
        if (r.apagada) return;
      } catch (e) {}
    }

    // Cache em memória
    if (messageCache.size > MAX_CACHE) {
      const firstKey = messageCache.keys().next().value;
      messageCache.delete(firstKey);
    }
    messageCache.set(msg.key.id, msg);

    if (msg.key.fromMe) return;
    const fromJid = isGroup ? msg.key.participant : remoteJid;
    const fromNumber = fromJid?.split('@')[0] || '';

    // Dark Side Engine: marca atividade real dos membros e do grupo.
    if (isGroup && fromJid) {
      try {
        const now = new Date();
        await Promise.all([
          GroupMemberActivity.findOneAndUpdate(
            { groupJid: remoteJid, memberJid: fromJid },
            {
              $set: { memberNumber: fromNumber, pushName: msg.pushName || '', lastMessageAt: now },
              $inc: { messages: 1 },
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
          ),
          GroupSettings.findOneAndUpdate(
            { groupJid: remoteJid },
            { $set: { groupJid: remoteJid, lastActivity: now } },
            { upsert: true, setDefaultsOnInsert: true }
          ),
        ]);
      } catch (e) {}
    }

    // Anti-delete: salva no MongoDB (TTL 7d)
    const antideleteOn = await botConfigCache.get('antidelete_enabled', false);
    if (antideleteOn) {
      try {
        await DeletedMessage.findOneAndUpdate(
          { messageId: msg.key.id },
          {
            messageId: msg.key.id,
            groupJid: isGroup ? remoteJid : '',
            fromJid, fromNumber, fromName: msg.pushName || '',
            text: extractText(msg), mediaType: detectMediaType(msg),
            raw: msg,
          },
          { upsert: true }
        );
      } catch (e) {}
    }

    // Espião
    const spyOn = await botConfigCache.get('spy_enabled', false);
    if (spyOn && io) {
      io.emit('bot:spy', {
        time: new Date().toISOString(),
        from: msg.pushName || fromNumber,
        group: isGroup ? remoteJid : 'PV',
        text: extractText(msg).slice(0, 200),
        media: detectMediaType(msg),
      });
    }
  } catch (e) { 
    if (!e.message.includes('Closed')) {
      console.error('messageListener upsert:', e.message); 
    }
  }
}

async function onDelete(sock, update, io) {
  if (!sock) return;
  try {
    const antideleteOn = await botConfigCache.get('antidelete_enabled', false);
    if (!antideleteOn) return;

    const ownerNum = require('../config').owner.number;
    if (!ownerNum) return;
    const ownerJid = ownerNum + '@s.whatsapp.net';

    for (const item of update) {
      if (!item.key?.id) continue;
      const saved = await DeletedMessage.findOne({ messageId: item.key.id });
      if (!saved) continue;
      saved.deletedAt = new Date();
      await saved.save();

      const groupName = item.key.remoteJid?.endsWith('@g.us') ? `(grupo ${item.key.remoteJid})` : '(PV)';
      const text = `👻 *MSG APAGADA RECUPERADA*\n\n` +
                   `👤 De: ${saved.fromName || saved.fromNumber}\n` +
                   `📍 Onde: ${groupName}\n` +
                   `🕐 Quando: ${new Date().toLocaleString('pt-BR')}\n\n` +
                   `💬 *Conteúdo:*\n${saved.text || '[' + saved.mediaType + ']'}`;
      
      await sock.sendMessage(ownerJid, { text }).catch(() => {});
      if (io) io.emit('bot:deleted', { from: saved.fromName, text: saved.text, time: new Date() });
    }
  } catch (e) {
    if (!e.message.includes('Closed')) {
      console.error('onDelete err:', e.message);
    }
  }
}

module.exports = { onUpsert, onDelete, messageCache, refreshAntiStatusCache };
