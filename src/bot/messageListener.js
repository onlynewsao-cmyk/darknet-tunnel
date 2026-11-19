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
const { hasActiveEntitlement } = require('./groupEntitlement');

// --- INICIALIZAÇÃO DE CACHE (Topo do arquivo para evitar ReferenceError) ---
const messageCache = new Map();
const MAX_CACHE = 2000;
const antiStatusCache = new Set();

// ── v12.4: CACHE DE MUTADOS POR GRUPO ──────────────────────
// mutedCache: Map<groupJid, Map<jid, untilMs|null>>
// Enforcement: tudo que usuário mutado manda é APAGADO (o WhatsApp
// não tem mute individual na API — apagar é o mute real do bot).
const mutedCache = new Map();

async function refreshMutedCache() {
  try {
    const grupos = await GroupSettings.find({ mutedUsers: { $exists: true, $ne: [] } })
      .select('groupJid mutedUsers').lean();
    mutedCache.clear();
    for (const g of grupos) {
      const inner = new Map();
      for (const mu of (g.mutedUsers || [])) {
        // expirou? ignora
        if (mu.until && new Date(mu.until).getTime() <= Date.now()) continue;
        const num = String(mu.jid || '').split('@')[0].split(':')[0].replace(/\D/g, '');
        if (num) inner.set(num, mu.until ? new Date(mu.until).getTime() : null);
      }
      if (inner.size) mutedCache.set(g.groupJid, inner);
    }
  } catch (e) {}
}
refreshMutedCache();
setInterval(refreshMutedCache, 60000);

// Atualização instantânea vinda do case .mute (sem esperar o refresh de 60s)
// untilMs: número = expira em | null = permanente | -1 = remover mute
function mutedCacheUpdate(groupJid, jid, untilMs) {
  try {
    const num = String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '');
    if (!num || !groupJid) return;
    if (untilMs === -1) {
      if (mutedCache.has(groupJid)) {
        mutedCache.get(groupJid).delete(num);
        if (!mutedCache.get(groupJid).size) mutedCache.delete(groupJid);
      }
      return;
    }
    if (!mutedCache.has(groupJid)) mutedCache.set(groupJid, new Map());
    mutedCache.get(groupJid).set(num, untilMs);
  } catch (e) {}
}

function _numOf(jid) {
  return String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '');
}

async function refreshAntiStatusCache() {
  try {
    antiStatusCache.clear();
    const GroupSettings = require('../database/models/GroupSettings');
    const gsList = await GroupSettings.find({ antistatus: true }).lean().catch(() => []);
    (gsList || []).forEach(item => antiStatusCache.add(item.groupJid));
    const list = await AntiStatus.find({ enabled: true }).catch(() => []);
    (list || []).forEach(item => antiStatusCache.add(item.groupJid));
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
    const isChannel = remoteJid?.endsWith('@newsletter');
    const isStatusFeed = remoteJid === 'status@broadcast' || remoteJid?.endsWith('@broadcast');
    if (isChannel || isStatusFeed) return;
    const msgType = Object.keys(msg.message)[0];

    // --- LÓGICA ANTI-STATUS ---
    // O cache diz que a regra existe; a licença continua a mandar. Assim um
    // grupo expirado não perde mensagens enquanto aguarda o refresh do cache.
    const automacaoDeGrupoActiva = async () => {
      if (!isGroup) return false;
      try {
        const gs = await require('./hotCache').getGroupSettings(msg, remoteJid);
        return hasActiveEntitlement(gs);
      } catch { return false; }
    };
    if (isGroup && antiStatusCache.has(remoteJid) && await automacaoDeGrupoActiva()) {
      const mObj = msg.message || {};
      const innerMsg = mObj.ephemeralMessage?.message || mObj.viewOnceMessage?.message || mObj.viewOnceMessageV2?.message || mObj;
      const innerKeys = Object.keys(innerMsg);
      const ctxInfo = innerMsg.extendedTextMessage?.contextInfo || innerMsg[innerKeys[0]]?.contextInfo;
      const isStatus = msgType === 'groupStatusMessageV2' || 
                       msgType === 'groupStatusMessage' || 
                       mObj.groupStatusMessageV2 ||
                       innerKeys.includes('statusMentionMessage') ||
                       innerKeys.includes('groupStatusMentionMessage') ||
                       innerKeys.includes('groupStatusMessage') ||
                       innerKeys.includes('groupStatusMessageV2') ||
                       ctxInfo?.statusSourceType != null ||
                       innerMsg.protocolMessage?.type === 'STATUS_MENTION' ||
                       JSON.stringify(mObj).includes('"isGroupStatus":true');

      if (isStatus && !msg.key.fromMe) {
        let shouldDelete = true;
        try {
          const fromJid = msg.key.participant || msg.participant;
          const meta = await sock.groupMetadata(remoteJid).catch(() => null);
          if (meta) {
            const senderParticipant = meta.participants?.find(p => p.id === fromJid);
            const isSenderAdmin = senderParticipant?.admin === 'admin' || senderParticipant?.admin === 'superadmin';
            if (isSenderAdmin) shouldDelete = false; // Admins e donos podem postar status no grupo
            const botJid = sock.user?.id ? (sock.user.id.split(':')[0] + '@s.whatsapp.net') : null;
            const botParticipant = meta.participants?.find(p => p.id === botJid);
            const isBotAdmin = botParticipant?.admin === 'admin' || botParticipant?.admin === 'superadmin';
            if (!isBotAdmin) shouldDelete = false; // Se o bot não for admin, não tenta apagar
          }
        } catch (e) {}
        if (shouldDelete) {
          await sock.sendMessage(remoteJid, { delete: msg.key }).catch(() => {});
          return; 
        }
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

    // ── v12.4: MUTE ENFORCEMENT — apaga msg de usuário mutado ──
    if (isGroup && mutedCache.has(remoteJid) && await automacaoDeGrupoActiva()) {
      try {
        const inner = mutedCache.get(remoteJid);
        const candidates = [_numOf(fromJid), _numOf(msg.key.participantAlt || '')].filter(Boolean);
        const hit = candidates.find(c => inner.has(c));
        if (hit) {
          const until = inner.get(hit);
          if (until === null || until === undefined || until > Date.now()) {
            await sock.sendMessage(remoteJid, { delete: msg.key }).catch(() => {});
            console.log('[Mute] Msg apagada de usuário mutado:', hit);
            return; // não processa nada mais dessa msg
          } else {
            // expirou — limpa do cache (o refresh de 60s tira do banco via projeção)
            inner.delete(hit);
          }
        }
      } catch (e) {}
    }

    // Dark Side Engine: marca atividade real dos membros e do grupo.
    if (isGroup && fromJid) {
      try {
        const now = new Date();
        const wk = require('./weekKey').buildWeekOps('m', now); // v7.80: contador semanal
        await Promise.all([
          GroupMemberActivity.findOneAndUpdate(
            { groupJid: remoteJid, memberJid: fromJid },
            {
              $set: { memberNumber: fromNumber, pushName: msg.pushName || '', lastMessageAt: now },
              $inc: { messages: 1, ...wk.inc },
              $unset: wk.unset,
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

module.exports = { onUpsert, onDelete, messageCache, refreshAntiStatusCache, refreshMutedCache, mutedCacheUpdate, mutedCache, antiStatusCache };
