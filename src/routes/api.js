const express = require('express');
const multer = require('multer');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const cloudinary = require('cloudinary').v2;
const { requireApiAuth, requireApiOwner } = require('../middleware/auth');
const { getBot } = require('../bot/whatsapp');
const User = require('../database/models/User');
const Command = require('../database/models/Command');
const Media = require('../database/models/Media');
const BotConfig = require('../database/models/BotConfig');
const Schedule = require('../database/models/Schedule');
const Payment = require('../database/models/Payment');
const Log = require('../database/models/Log');
const mediaHandler = require('../bot/mediaHandler');
const DecryptLog = require('../database/models/DecryptLog');
const decrypter = require('../decrypter');
const { formatForWhatsApp } = require('../decrypter/formatter');
const config = require('../config');
const ai = require('../bot/ai');
const prefixManager = require('../bot/prefixManager');
const CommandOverride = require('../database/models/CommandOverride');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });


function decodePathPart(s) {
  try { return decodeURIComponent(String(s).replace(/\+/g, ' ')); }
  catch { return String(s).replace(/\+/g, ' '); }
}

const DECRYPT_URL_EXT_RE = /\.(ehi|ehic|hat|npv|npv4|npv7|npv8|npvt|dark|darkt|any|tls|nm|nmess|ovpn|ssh|ssl|json|conf|wg|wireguard|txt|bdnet|bd|apna|apnalite|wyrvpn|wyr)(?:[/?#]|$)/i;

function fileNameFromUrl(url, fallback = 'config.ehi') {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean).map(decodePathPart);
    const matched = parts.find(x => DECRYPT_URL_EXT_RE.test(x));
    return (matched || parts[parts.length - 1] || fallback).replace(/[\\/:*?"<>|]+/g, '_');
  } catch { return fallback; }
}

async function resolveMediaFireDirectUrl(url) {
  const html = (await mediaHandler.fetchBuffer(url)).toString('utf-8');
  const patterns = [
    /href=["'](https:\/\/download[^"'<>]+)["']/i,
    /id=["']downloadButton["'][^>]+href=["']([^"']+)["']/i,
    /"download_link"\s*:\s*"([^"]+)"/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return m[1].replace(/\\\//g, '/').replace(/&amp;/g, '&');
  }
  throw new Error('Link direto do MediaFire não encontrado');
}

async function fetchDecryptFileFromUrl(url) {
  let finalUrl = url;
  if (/mediafire\.com/i.test(url) && !/download\d+\.mediafire\.com/i.test(url)) {
    finalUrl = await resolveMediaFireDirectUrl(url);
  }
  const buffer = await mediaHandler.fetchBuffer(finalUrl);
  if (!buffer || buffer.length < 16) throw new Error('Arquivo vazio ou inválido');
  if (buffer.length > 30 * 1024 * 1024) throw new Error('Arquivo muito grande (máx. 30MB)');
  return { buffer, fileName: fileNameFromUrl(finalUrl, 'config.ehi'), finalUrl };
}

// ── Rate limit do envio via WhatsApp ─────────────────────────
// Protege o número do bot contra spam/ban: o endpoint envia mensagens
// reais e qualquer conta registada lhe chega. Conta por utilizador
// (não por IP) para não penalizar quem partilha a mesma rede.
// Em memória: sem I/O, sem impacto no tempo de resposta.
const sendWaLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  limit: 10,                // 10 envios/hora por conta
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => String(req.session?.user?.id || ipKeyGenerator(req)),
  skip: (req) => req.session?.user?.role === 'owner', // dono sem limite
  message: { error: 'Limite de envios atingido. Tente novamente dentro de 1 hora.' },
});

module.exports = function (io) {
  const router = express.Router();

  // ===== BOT =====
  router.get('/bot/status', requireApiAuth, (req, res) => res.json(getBot(io).getStatus()));

  // v7.44 — chamadas VoIP no socket principal (substitui callbot/liveVoip)
  router.get('/voip/calls', requireApiAuth, (req, res) => {
    const voip = require('../bot/callVoip');
    const bot = getBot(io);
    res.json({
      bot: bot.status,
      suportado: bot.sock ? voip.suportado(bot.sock) : null,
      activas: voip.todas().map(a => ({ jid: a.jid, grupo: !!a.grupo, desde: a.desde, tocando: !!a.tocando })),
      limites: { maxDuracaoMs: voip.MAX_DURACAO_MS, cooldownMs: voip.COOLDOWN_MS, maxPorHora: voip.MAX_POR_HORA },
    });
  });
  router.post('/voip/hangup', requireApiOwner, async (req, res) => {
    const voip = require('../bot/callVoip');
    const bot = getBot(io);
    let n = 0;
    for (const a of voip.todas()) { try { await voip.desligar(bot.sock, a.jid); n++; } catch {} }
    res.json({ ok: true, desligadas: n });
  });
  // ===== LIGAR-ME AGORA (botão do painel) =====
  // v6.78 — dispara uma chamada real para o Dono num clique. Usa o socket
  // principal (o callbot secundário está desligado) e a mesma escada do
  // .ligar, por isso beneficia do fix @lid -> número.
  router.post('/call/me', requireApiOwner, async (req, res) => {
    try {
      const sock = getBot(io)?.sock;
      if (!sock) return res.status(503).json({ ok: false, error: 'Bot não está ligado' });

      const numero = String(req.body?.numero || config.owner?.number || '').replace(/\D/g, '');
      if (!numero || numero.length < 9) {
        return res.status(400).json({ ok: false, error: 'Número do dono inválido' });
      }

      const tipo = req.body?.video ? 'video' : 'voice';
      const bridge = require('../bot/callBridge');
      const r = await bridge.tentarLigar(sock, numero + '@s.whatsapp.net', { tipo, pushName: 'Dark' });

      return res.json({
        ok: !!r.ok,
        metodo: r.metodo || null,
        callId: r.callId || null,
        tipo,
        para: numero,
        tentativas: r.tentativas || [],
        // honestidade: ACK do servidor != telemóvel tocou
        nota: 'ok=true significa que o WhatsApp aceitou o offer. A chamada não transporta áudio.',
      });
    } catch (err) {
      return res.status(500).json({ ok: false, error: String(err?.message || err).slice(0, 200) });
    }
  });

  async function startBot(req, res) {
    const mode = req.body.mode === 'pair' ? 'pair' : 'qr';
    const phoneNumber = String(req.body.phoneNumber || '').replace(/\D/g, '');
    const fresh = req.body.fresh === true || req.body.fresh === 'true' || mode === 'pair';

    if (mode === 'pair' && phoneNumber.length < 10) {
      return res.status(400).json({ error: 'Número inválido. Use DDI + número, sem + ou espaços.' });
    }

    const bot = getBot(io);
    try {
      bot.start({ mode, phoneNumber: phoneNumber || null, fresh })
        .catch(err => console.error('Start:', err.message));
      res.status(202).json({ ok: true, mode, fresh });
    } catch (err) { res.status(500).json({ error: err.message }); }
  }

  router.post('/bot/connect', requireApiOwner, startBot);

  router.post('/bot/logout', requireApiOwner, async (req, res) => {
    await getBot(io).logout();
    res.json({ ok: true });
  });

  router.post('/bot/reset', requireApiOwner, async (req, res) => {
    try {
      const bot = getBot(io);
      await bot.logout();
      // Limpa a sessão do MongoDB também
      try {
        const Session = require('../database/models/Session');
        await Session.deleteMany({ fileName: { $not: /^call:/ } });
      } catch (e) {}
      res.json({ ok: true, message: 'Sessão limpa completamente' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ===== COMANDOS =====
  router.get('/commands', requireApiAuth, async (req, res) => {
    res.json(await Command.find().sort({ category: 1, name: 1 }));
  });

  router.post('/commands', requireApiOwner, async (req, res) => {
    try {
      const data = req.body;
      if (data.aliases && typeof data.aliases === 'string') {
        data.aliases = data.aliases.split(',').map(s => s.trim()).filter(Boolean);
      }
      data.enabled = data.enabled === 'true' || data.enabled === true || data.enabled === 'on';
      data.isSubmenu = data.isSubmenu === 'true' || data.isSubmenu === true || data.isSubmenu === 'on';
      res.json(await Command.create(data));
    } catch (err) { res.status(400).json({ error: err.message }); }
  });

  router.put('/commands/:id', requireApiOwner, async (req, res) => {
    try {
      const data = req.body;
      if (data.aliases && typeof data.aliases === 'string') {
        data.aliases = data.aliases.split(',').map(s => s.trim()).filter(Boolean);
      }
      data.enabled = data.enabled === 'true' || data.enabled === true || data.enabled === 'on';
      data.isSubmenu = data.isSubmenu === 'true' || data.isSubmenu === true || data.isSubmenu === 'on';
      res.json(await Command.findByIdAndUpdate(req.params.id, data, { new: true }));
    } catch (err) { res.status(400).json({ error: err.message }); }
  });

  router.delete('/commands/:id', requireApiOwner, async (req, res) => {
    await Command.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  });



  // ===== COMMAND BOARD / OVERRIDES =====
  router.get('/command-board', requireApiOwner, async (req, res) => {
    const commandCatalog = require('../bot/commandCatalog');
    const nativeCatalog = commandCatalog.getAll ? commandCatalog.getAll() : (commandCatalog.CATALOG || []);
    const overrides = await CommandOverride.find().lean().catch(() => []);
    const customCommands = await Command.find().sort({ category: 1, name: 1 }).lean().catch(() => []);
    res.json({ nativeCatalog, overrides, customCommands });
  });

  router.put('/command-overrides/:name', requireApiOwner, async (req, res) => {
    try {
      const name = String(req.params.name || '').toLowerCase().trim();
      if (!name) return res.status(400).json({ error: 'Nome obrigatório' });
      const data = {};
      for (const k of ['displayName','description','category','emoji','accessLevel','mediaUrl','mediaType','customResponse']) {
        if (typeof req.body[k] !== 'undefined') data[k] = req.body[k];
      }
      if (typeof req.body.enabled !== 'undefined') data.enabled = req.body.enabled === true || req.body.enabled === 'true' || req.body.enabled === 'on';
      if (typeof req.body.useCustomResponse !== 'undefined') data.useCustomResponse = req.body.useCustomResponse === true || req.body.useCustomResponse === 'true' || req.body.useCustomResponse === 'on';
      if (typeof req.body.order !== 'undefined') data.order = Number(req.body.order) || 0;
      if (typeof req.body.aliases !== 'undefined') data.aliases = Array.isArray(req.body.aliases) ? req.body.aliases : String(req.body.aliases || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
      const doc = await CommandOverride.findOneAndUpdate({ commandName: name }, { $set: data, $setOnInsert: { commandName: name } }, { upsert: true, new: true });
      require('../bot/botConfigCache').clear();
      res.json(doc);
    } catch (err) { res.status(400).json({ error: err.message }); }
  });

  // ===== MÍDIAS =====
  router.post('/media/upload', requireApiOwner, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo' });
      const mime = req.file.mimetype;
      let resourceType = 'image', type = 'image';
      if (mime.startsWith('video')) { resourceType = 'video'; type = 'video'; }
      else if (mime.startsWith('audio')) { resourceType = 'video'; type = 'audio'; }
      else if (mime.includes('gif')) type = 'gif';
      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { resource_type: resourceType, folder: 'dark-bot' },
          (err, r) => err ? reject(err) : resolve(r)
        );
        stream.end(req.file.buffer);
      });
      const media = await Media.create({
        name: req.body.name || req.file.originalname,
        type, url: result.secure_url, publicId: result.public_id, size: req.file.size,
        uploadedBy: req.session.user.id,
        tags: (req.body.tags || '').split(',').map(s => s.trim()).filter(Boolean),
      });
      res.json(media);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.delete('/media/:id', requireApiOwner, async (req, res) => {
    const media = await Media.findById(req.params.id);
    if (!media) return res.status(404).json({ error: 'Não encontrado' });
    try {
      const rt = media.type === 'video' || media.type === 'audio' ? 'video' : 'image';
      await cloudinary.uploader.destroy(media.publicId, { resource_type: rt });
    } catch (e) {}
    await media.deleteOne();
    res.json({ ok: true });
  });

  // ===== USUÁRIOS =====
  router.get('/users', requireApiOwner, async (req, res) => {
    res.json(await User.find().sort({ createdAt: -1 }));
  });

  router.put('/users/:id', requireApiOwner, async (req, res) => {
    try {
      const { role, active, premiumUntil, name, whatsappNumber } = req.body;
      const user = await User.findById(req.params.id);
      if (!user) return res.status(404).json({ error: 'Não encontrado' });
      if (user.role === 'owner' && role && role !== 'owner') return res.status(400).json({ error: 'Não pode remover dono' });
      if (role) user.role = role;
      if (typeof active !== 'undefined') user.active = active === 'true' || active === true;
      if (premiumUntil) user.premiumUntil = new Date(premiumUntil);
      if (name) user.name = name;
      if (typeof whatsappNumber !== 'undefined') user.whatsappNumber = whatsappNumber.replace(/\D/g, '');
      await user.save();
      res.json(user);
    } catch (err) { res.status(400).json({ error: err.message }); }
  });

  router.delete('/users/:id', requireApiOwner, async (req, res) => {
    const u = await User.findById(req.params.id);
    if (!u) return res.status(404).json({ error: 'Não encontrado' });
    if (u.role === 'owner') return res.status(400).json({ error: 'Não pode deletar dono' });
    await u.deleteOne();
    res.json({ ok: true });
  });

  // ===== BROADCAST =====
  router.post('/broadcast', requireApiOwner, async (req, res) => {
    const { text, mediaUrl, mediaType, delay = 2 } = req.body;
    if (!text) return res.status(400).json({ error: 'Texto obrigatório' });
    const bot = getBot(io);
    if (bot.getStatus().status !== 'connected') return res.status(400).json({ error: 'Bot não conectado' });
    res.json({ ok: true });
    (async () => {
      try {
        const chats = await bot.sock.groupFetchAllParticipating();
        const ids = Object.keys(chats);
        let count = 0;
        for (let i = 0; i < ids.length; i++) {
          const id = ids[i];
          const name = chats[id]?.subject || id;
          try {
            io.emit('broadcast:progress', { current: i+1, total: ids.length, group: name });
            if (mediaUrl && mediaType) {
              const buf = await mediaHandler.fetchBuffer(mediaUrl);
              const payload = mediaType === 'image' || mediaType === 'gif' ? { image: buf, caption: text }
                : mediaType === 'video' ? { video: buf, caption: text }
                : mediaType === 'audio' ? { audio: buf, mimetype: 'audio/mp4' }
                : { text };
              await bot.sock.sendMessage(id, payload);
            } else { await bot.sock.sendMessage(id, { text }); }
            count++;
            // v7.45 anti-restrição: mínimo 6 s entre grupos + jitter aleatório (nunca ritmo de máquina)
            const base = Math.max(6, Number(delay) || 0) * 1000;
            await new Promise(r => setTimeout(r, base + Math.floor(Math.random() * 4000)));
          } catch (e) { io.emit('broadcast:error', { message: `${name}: ${e.message}` }); }
        }
        io.emit('broadcast:done', { count });
      } catch (err) { io.emit('broadcast:error', { message: err.message }); }
    })();
  });

  // ===== SCHEDULE =====
  router.post('/schedule', requireApiOwner, async (req, res) => {
    try {
      const data = { ...req.body, createdBy: req.session.user.id };
      data.scheduledFor = new Date(data.scheduledFor);
      res.json(await Schedule.create(data));
    } catch (err) { res.status(400).json({ error: err.message }); }
  });

  router.delete('/schedule/:id', requireApiOwner, async (req, res) => {
    await Schedule.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  });

  // ===== SETTINGS =====
  router.post('/settings', requireApiOwner, async (req, res) => {
    try {
      for (const [k, v] of Object.entries(req.body)) {
        if (k === 'prefixes') {
          await prefixManager.setPrefixes(v);
        } else {
          await BotConfig.set(k, v);
        }
      }
      try { require('../bot/botConfigCache').clear(); } catch {}
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ===== IA TEST =====
  router.post('/ia/test', requireApiOwner, async (req, res) => {
    try {
      const response = await ai.chat(req.body.prompt);
      res.json({ response });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ===== PAYMENTS =====
  router.post('/payments', requireApiAuth, upload.single('receipt'), async (req, res) => {
    try {
      const { plan, amount, method, reference, whatsappNumber, notes } = req.body;
      let receiptUrl = '';
      if (req.file) {
        const r = await new Promise((resolve, reject) => {
          const s = cloudinary.uploader.upload_stream(
            { folder: 'dark-bot/receipts' },
            (err, x) => err ? reject(err) : resolve(x)
          );
          s.end(req.file.buffer);
        });
        receiptUrl = r.secure_url;
      }
      const u = await User.findById(req.session.user.id);
      const p = await Payment.create({
        user: req.session.user.id,
        username: u.username,
        whatsappNumber: whatsappNumber || u.whatsappNumber,
        plan, amount: parseInt(amount), method, reference,
        receipt: receiptUrl, notes,
      });
      // Atualiza WhatsApp do usuário se foi informado
      if (whatsappNumber && !u.whatsappNumber) { u.whatsappNumber = whatsappNumber.replace(/\D/g, ''); await u.save(); }
      // Notifica via Socket.IO
      io.emit('payment:new', { plan, amount, username: u.username });
      res.json(p);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.post('/payments/:id/approve', requireApiOwner, async (req, res) => {
    try {
      const days = parseInt(req.body.days) || 30;
      const p = await Payment.findById(req.params.id);
      if (!p) return res.status(404).json({ error: 'Não encontrado' });
      p.status = 'aprovado';
      p.approvedAt = new Date();
      p.approvedBy = req.session.user.id;
      await p.save();
      // Promove o usuário
      const u = await User.findById(p.user);
      if (u) {
        u.role = 'premium';
        u.premiumUntil = days > 9999 ? null : new Date(Date.now() + days * 86400000);
        await u.save();
      }
      // Notifica via bot se possível
      try {
        const bot = getBot(io);
        if (bot.sock && p.whatsappNumber) {
          await bot.sock.sendMessage(p.whatsappNumber + '@s.whatsapp.net', {
            text: `🎉 *PAGAMENTO APROVADO*\n\nObrigado! Sua conta foi promovida para *PREMIUM* ⭐\n\n⏳ Válido por ${days >= 9999 ? 'sempre' : days + ' dias'}`,
          });
        }
      } catch (e) {}
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.post('/payments/:id/reject', requireApiOwner, async (req, res) => {
    try {
      const p = await Payment.findById(req.params.id);
      if (!p) return res.status(404).json({ error: 'Não encontrado' });
      p.status = 'rejeitado';
      p.notes = req.body.notes || '';
      await p.save();
      try {
        const bot = getBot(io);
        if (bot.sock && p.whatsappNumber) {
          await bot.sock.sendMessage(p.whatsappNumber + '@s.whatsapp.net', {
            text: `❌ *PAGAMENTO REJEITADO*\n\nMotivo: ${req.body.notes || 'não especificado'}\n\nFale com o Dono.`,
          });
        }
      } catch (e) {}
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ===== ATUALIZAÇÕES DE INTERNET =====
  router.get('/updates', requireApiAuth, async (req, res) => {
    const updates = await BotConfig.get('internet_updates', []);
    res.json(updates);
  });

  router.post('/updates', requireApiOwner, async (req, res) => {
    try {
      const updates = await BotConfig.get('internet_updates', []);
      const newUpdate = {
        id: Date.now().toString(),
        title: req.body.title || '',
        operator: req.body.operator || '',
        vpnApp: req.body.vpnApp || '',
        status: req.body.status || 'working', // working, slow, stopped
        note: req.body.note || '',
        date: new Date().toLocaleDateString('pt-BR'),
        createdAt: new Date().toISOString(),
      };
      updates.push(newUpdate);
      await BotConfig.set('internet_updates', updates);
      const botConfigCache = require('../bot/botConfigCache');
      botConfigCache.clear();
      res.json({ ok: true, update: newUpdate });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.delete('/updates/:id', requireApiOwner, async (req, res) => {
    let updates = await BotConfig.get('internet_updates', []);
    updates = updates.filter(u => u.id !== req.params.id);
    await BotConfig.set('internet_updates', updates);
    const botConfigCache = require('../bot/botConfigCache');
    botConfigCache.clear();
    res.json({ ok: true });
  });

  // ===== CONFIGS CLIPBOARD =====
  router.get('/clipboard-configs', requireApiAuth, async (req, res) => {
    const configs = await BotConfig.get('clipboard_configs', []);
    res.json(configs);
  });

  router.post('/clipboard-configs', requireApiOwner, async (req, res) => {
    try {
      const configs = await BotConfig.get('clipboard_configs', []);
      const newConfig = {
        id: Date.now().toString(),
        title: req.body.title || '',
        operator: req.body.operator || '',
        vpnApp: req.body.vpnApp || '',
        clipboard: req.body.clipboard || '', // texto para copiar/colar
        link: req.body.link || '', // link alternativo
        createdAt: new Date().toISOString(),
      };
      configs.push(newConfig);
      await BotConfig.set('clipboard_configs', configs);
      const botConfigCache = require('../bot/botConfigCache');
      botConfigCache.clear();
      res.json({ ok: true, config: newConfig });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.delete('/clipboard-configs/:id', requireApiOwner, async (req, res) => {
    let configs = await BotConfig.get('clipboard_configs', []);
    configs = configs.filter(c => c.id !== req.params.id);
    await BotConfig.set('clipboard_configs', configs);
    const botConfigCache = require('../bot/botConfigCache');
    botConfigCache.clear();
    res.json({ ok: true });
  });

  // ===== CONTROLE RÁPIDO =====
  router.post('/control/:action', requireApiOwner, async (req, res) => {
    const bot = getBot(io);
    const action = req.params.action;
    try {
      if (action === 'restart') {
        res.json({ ok: true, message: '🔄 Reiniciando...' });
        setTimeout(() => process.exit(0), 2000);
      } else if (action === 'reconnect') {
        if (bot.sock) { try { bot.sock.end(); } catch (e) {} }
        bot.starting = false;
        await bot.start({ mode: 'qr' });
        res.json({ ok: true, message: '🔌 Reconectando...' });
      } else if (action === 'clearLogs') {
        await Log.deleteMany({});
        res.json({ ok: true, message: '🗑️ Logs limpos' });
      } else if (action === 'clearCache') {
        const botConfigCache = require('../bot/botConfigCache');
        botConfigCache.clear();
        res.json({ ok: true, message: '♻️ Cache limpo' });
      } else {
        res.status(400).json({ error: 'Ação inválida' });
      }
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ===== CANAL WHATSAPP (nas respostas) =====
  router.post('/settings/channel', requireApiOwner, async (req, res) => {
    try {
      const { channelUrl, channelName, channelEnabled } = req.body;
      await BotConfig.set('channel_url', channelUrl || '');
      await BotConfig.set('channel_name', channelName || '');
      await BotConfig.set('channel_enabled', channelEnabled === true || channelEnabled === 'true');
      // Atualiza cache
      const botConfigCache = require('../bot/botConfigCache');
      botConfigCache.clear();
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });





  router.post('/settings/sticker-watermark', requireApiOwner, async (req, res) => {
    try {
      await BotConfig.set('sticker_watermark_enabled', req.body.enabled === true || req.body.enabled === 'true' || req.body.enabled === 'on');
      await BotConfig.set('sticker_visible_watermark', req.body.visible === true || req.body.visible === 'true' || req.body.visible === 'on');
      await BotConfig.set('sticker_pack_name', String(req.body.packName || '').slice(0, 80));
      await BotConfig.set('sticker_author_name', String(req.body.authorName || '').slice(0, 80));
      await BotConfig.set('sticker_watermark_text', String(req.body.watermarkText || '').slice(0, 32));
      require('../bot/botConfigCache').clear();
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.post('/settings/menu-style', requireApiOwner, async (req, res) => {
    try {
      await BotConfig.set('menu_style', req.body.menuStyle || 'classic');
      await BotConfig.set('menu_show_prefix', req.body.showPrefix === true || req.body.showPrefix === 'true' || req.body.showPrefix === 'on');
      await BotConfig.set('button_mode', req.body.buttonMode || 'auto');
      require('../bot/botConfigCache').clear();
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ===== MENU MEDIA (foto/vídeo/gif no menu) =====
  router.post('/settings/menu-media', requireApiOwner, upload.single('file'), async (req, res) => {
    try {
      let mediaUrl = req.body.mediaUrl || '';
      let mediaType = req.body.mediaType || 'none';
      if (req.file) {
        const mime = req.file.mimetype;
        let resourceType = 'image';
        if (mime.startsWith('video') || mime.includes('gif')) resourceType = 'video';
        const result = await new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            { resource_type: resourceType, folder: 'dark-bot/menu' },
            (err, r) => err ? reject(err) : resolve(r)
          );
          stream.end(req.file.buffer);
        });
        mediaUrl = result.secure_url;
        if (mime.includes('gif') || mime.startsWith('video')) mediaType = 'video';
        else mediaType = 'image';
      }
      const target = req.body.target || 'menu'; // menu, submenu_<name>, etc
      await BotConfig.set(`menu_media_${target}_url`, mediaUrl);
      await BotConfig.set(`menu_media_${target}_type`, mediaType);
      const botConfigCache = require('../bot/botConfigCache');
      botConfigCache.clear();
      res.json({ ok: true, url: mediaUrl, type: mediaType });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ===== DECRYPT (via dashboard) =====
  router.post('/decrypt', requireApiAuth, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
      const result = await decrypter.decrypt(req.file.originalname, req.file.buffer);
      res.json(result);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.post('/decrypt/url', requireApiAuth, async (req, res) => {
    try {
      const url = String(req.body.url || '').trim();
      if (!/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'URL inválida' });
      const file = await fetchDecryptFileFromUrl(url);
      const result = await decrypter.decrypt(file.fileName, file.buffer);
      res.json({ ...result, sourceUrl: url, finalUrl: file.finalUrl });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.post('/decrypt/send-wa', requireApiAuth, sendWaLimiter, async (req, res) => {
    try {
      const { number, data } = req.body;
      if (!number || !data) return res.status(400).json({ error: 'Número e dados obrigatórios' });
      const cleanNumber = String(number).replace(/\D/g, '');
      if (cleanNumber.length < 10 || cleanNumber.length > 15) {
        return res.status(400).json({ error: 'Número inválido' });
      }
      const bot = getBot(io);
      if (bot.getStatus().status !== 'connected') return res.status(400).json({ error: 'Bot não conectado' });
      const formatted = formatForWhatsApp(data, config);
      await bot.sock.sendMessage(cleanNumber + '@s.whatsapp.net', { text: formatted });
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ===== LINKS (para clientes) =====
  router.get('/links', requireApiAuth, async (req, res) => {
    res.json({
      ownerLink: await BotConfig.get('owner_link', `https://wa.me/${config.owner.number}`),
      groupLink: await BotConfig.get('group_link', ''),
      channelUrl: await BotConfig.get('channel_url', ''),
      channelName: await BotConfig.get('channel_name', ''),
    });
  });

  // ===== ADICIONAR BOT AO GRUPO (para clientes) =====
  router.get('/bot/invite-link', requireApiAuth, async (req, res) => {
    try {
      const bot = getBot(io);
      if (bot.getStatus().status !== 'connected') {
        return res.status(400).json({ error: 'Bot não está conectado' });
      }
      const botNumber = config.bot.number;
      const link = `https://wa.me/${botNumber}?text=${encodeURIComponent('Olá! Quero adicionar o bot no meu grupo.')}`;
      res.json({ ok: true, link, number: botNumber, botName: config.bot.name });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ===== GRUPOS (para dashboard do dono) =====
  router.get('/groups', requireApiOwner, async (req, res) => {
    try {
      const bot = getBot(io);
      if (bot.getStatus().status !== 'connected') return res.json([]);
      const chats = await bot.sock.groupFetchAllParticipating();
      const groups = Object.values(chats).map(g => ({
        id: g.id, subject: g.subject, size: g.participants?.length || 0,
        desc: g.desc || '', creation: g.creation,
        owner: g.owner,
      }));
      res.json(groups);
    } catch (err) { res.json([]); }
  });

  // ===== BACKUP =====
  router.get('/backup/export', requireApiOwner, async (req, res) => {
    try {
      const data = {
        exportedAt: new Date(),
        commands: await Command.find().lean(),
        users: (await User.find().lean()).map(u => ({ ...u, password: undefined })),
        media: await Media.find().lean(),
        settings: await BotConfig.find().lean(),
        schedules: await Schedule.find().lean(),
      };
      res.setHeader('Content-Disposition', `attachment; filename="dark-bot-backup-${Date.now()}.json"`);
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify(data, null, 2));
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.post('/backup/import', requireApiOwner, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'Arquivo obrigatório' });
      const data = JSON.parse(req.file.buffer.toString('utf-8'));
      const overwrite = req.body.overwrite === 'true' || req.body.overwrite === 'on';
      let count = 0;
      if (data.commands) {
        for (const c of data.commands) {
          const { _id, __v, ...rest } = c;
          if (overwrite) await Command.findOneAndUpdate({ name: rest.name }, rest, { upsert: true });
          else await Command.create(rest).catch(()=>{});
          count++;
        }
      }
      if (data.settings) {
        for (const s of data.settings) { await BotConfig.set(s.key, s.value); count++; }
      }
      res.json({ ok: true, imported: count });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.post('/backup/reset', requireApiOwner, async (req, res) => {
    try {
      await Command.deleteMany({});
      await Media.deleteMany({});
      await BotConfig.deleteMany({});
      await Schedule.deleteMany({});
      await Log.deleteMany({});
      await User.deleteMany({ role: { $ne: 'owner' } });
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ===== ALIASES DE COMPATIBILIDADE (views antigas) =====

  // connect.ejs chama /api/bot/start — alias para /bot/connect
  router.post('/bot/start', requireApiOwner, startBot);

  // users.ejs chama /api/users/:id/premium e /api/users/:id/free
  router.post('/users/:id/premium', requireApiOwner, async (req, res) => {
    try {
      const days = parseInt(req.body.days) || 30;
      const user = await User.findById(req.params.id);
      if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
      user.role = 'premium';
      user.premiumUntil = new Date(Date.now() + days * 86400000);
      await user.save();
      res.json({ ok: true, premiumUntil: user.premiumUntil });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.post('/users/:id/free', requireApiOwner, async (req, res) => {
    try {
      const user = await User.findById(req.params.id);
      if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
      if (user.role === 'owner') return res.status(400).json({ error: 'Não pode alterar dono' });
      user.role = 'free';
      user.premiumUntil = null;
      await user.save();
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // subscribe.ejs chama /api/payment/request
  router.post('/payment/request', requireApiAuth, async (req, res) => {
    try {
      const { plan, proof } = req.body;
      const u = await User.findById(req.session.user.id);
      // Mapeia plano para enum do modelo
      const planMap = {
        '1 mês': '1mes', '1mes': '1mes',
        '3 meses': '3meses', '3meses': '3meses',
        '6 meses': '6meses', '6meses': '6meses',
        '1 ano': '1ano', '1ano': '1ano',
        'vitalício': 'vitalicio', 'vitalicio': 'vitalicio',
      };
      const planKey = plan ? (planMap[plan.toLowerCase().split(' - ')[0].trim()] || '1mes') : '1mes';
      const amountMap = { '1mes': 1500, '3meses': 4000, '6meses': 7500, '1ano': 14000, 'vitalicio': 30000 };
      const payment = await Payment.create({
        user: req.session.user.id,
        username: u?.username || req.session.user.username,
        whatsappNumber: u?.whatsappNumber || '',
        plan: planKey,
        amount: amountMap[planKey] || 1500,
        method: 'multicaixa',
        notes: proof || '',
        status: 'pendente',
      });
      io.emit('payment:new', { plan: planKey, username: u?.username });
      res.json({ ok: true, id: payment._id });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // profile.ejs chama /api/profile
  router.post('/profile', requireApiAuth, async (req, res) => {
    try {
      const { name, whatsappNumber, newPassword, currentPassword } = req.body;
      const user = await User.findById(req.session.user.id);
      if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
      const ok = await user.comparePassword(currentPassword);
      if (!ok) return res.status(400).json({ error: 'Senha atual incorreta' });
      if (name) user.name = name;
      if (whatsappNumber) user.whatsappNumber = whatsappNumber.replace(/\D/g, '');
      if (newPassword && newPassword.length >= 6) user.password = newPassword;
      await user.save();
      req.session.user.name = user.name;
      res.json({ ok: true, message: 'Perfil atualizado!' });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // groups.ejs chama /api/groups/:jid/settings, /send, /members, /ban, /leave
  router.get('/groups/:jid/settings', requireApiOwner, async (req, res) => {
    try {
      const GroupSettings = require('../database/models/GroupSettings');
      const s = await GroupSettings.findOne({ groupJid: req.params.jid }) || {};
      res.json(s);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.post('/groups/:jid/settings', requireApiOwner, async (req, res) => {
    try {
      const GroupSettings = require('../database/models/GroupSettings');
      const s = await GroupSettings.findOneAndUpdate(
        { groupJid: req.params.jid },
        { groupJid: req.params.jid, ...req.body },
        { upsert: true, new: true }
      );
      res.json(s);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.post('/groups/:jid/send', requireApiOwner, async (req, res) => {
    try {
      const bot = getBot(io);
      if (bot.getStatus().status !== 'connected') return res.status(400).json({ error: 'Bot não conectado' });
      const { text, mediaUrl, mediaType } = req.body;
      if (!text && !mediaUrl) return res.status(400).json({ error: 'Mensagem vazia' });
      if (mediaUrl && mediaType) {
        const buf = await mediaHandler.fetchBuffer(mediaUrl);
        const payload = mediaType === 'image' ? { image: buf, caption: text || '' }
          : mediaType === 'video' ? { video: buf, caption: text || '' }
          : { text: text || '' };
        await bot.sock.sendMessage(req.params.jid, payload);
      } else {
        await bot.sock.sendMessage(req.params.jid, { text });
      }
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.get('/groups/:jid/members', requireApiOwner, async (req, res) => {
    try {
      const bot = getBot(io);
      if (bot.getStatus().status !== 'connected') return res.json([]);
      const meta = await bot.sock.groupMetadata(req.params.jid);
      res.json(meta.participants || []);
    } catch (err) { res.json([]); }
  });

  router.post('/groups/:jid/ban', requireApiOwner, async (req, res) => {
    try {
      const bot = getBot(io);
      if (bot.getStatus().status !== 'connected') return res.status(400).json({ error: 'Bot não conectado' });
      const { participant } = req.body;
      if (!participant) return res.status(400).json({ error: 'Participante obrigatório' });
      await bot.sock.groupParticipantsUpdate(req.params.jid, [participant], 'remove');
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.post('/groups/:jid/leave', requireApiOwner, async (req, res) => {
    try {
      const bot = getBot(io);
      if (bot.getStatus().status !== 'connected') return res.status(400).json({ error: 'Bot não conectado' });
      await bot.sock.groupLeave(req.params.jid);
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ═══ v7.34: C∆P API (dono) ═══
  const capE = () => { const c = require('../cap/capEngine'); c.load(); return c; };
  router.get('/cap/state', requireApiOwner, (req, res) => { const c = capE(); res.json({ sessoes: c.listSessoes(), alvos: c.listTargets(), log: c.state.log.slice(0, 50) }); });
  router.post('/cap/login', requireApiOwner, async (req, res) => {
    const c = capE();
    try {
      let sid = String(req.body.sessionid || '').trim();
      const mm = sid.match(/sessionid=([^;\s]+)/i); if (mm) sid = mm[1];
      if (!sid && req.body.username && req.body.password) {
        const lg = await require('../cap/igLogin').loginComSenha(req.body.username, req.body.password);
        if (!lg.ok) return res.status(400).json({ error: lg.erro, checkpoint: !!lg.checkpoint, twoFactor: !!lg.twoFactor });
        sid = lg.sid;
      }
      if (!sid) return res.status(400).json({ error: 'Envia sessionid ou username+password' });
      const r = await c.addSessao(sid);
      if (!r.ok) return res.status(400).json({ error: r.erro });
      res.json({ ok: true, user: r.user, validado: r.validado, aviso: r.aviso, sessoes: c.listSessoes() });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  router.post('/cap/logout', requireApiOwner, (req, res) => { const c = capE(); res.json({ removidas: c.delSessao(req.body.user || 'all'), sessoes: c.listSessoes() }); });
  router.post('/cap/testar', requireApiOwner, async (req, res) => {
    const c = capE(); const out = [];
    for (const x of c.sessionsAtivas()) { const v = await c.validarSessao(x.sid); out.push({ user: x.user || v.user, ok: v.ok, erro: v.erro || '' }); if (!v.ok && !v.temporario) c.marcarSessaoInvalida(x.sid, v.erro); }
    res.json({ resultados: out });
  });
  router.post('/cap/alvo', requireApiOwner, async (req, res) => {
    const c = capE();
    try {
      const { alvo, destino, acao } = req.body;
      if (acao === 'del') return res.json({ ok: c.delTarget(alvo), alvos: c.listTargets() });
      const r = c.addTarget(alvo, { destino: destino || undefined, addedBy: 'dashboard' });
      res.json({ ok: true, novo: r.novo, alvos: c.listTargets() });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });
  router.post('/cap/check', requireApiOwner, async (req, res) => {
    const c = capE(); const bot = getBot(io); const sock = bot.getSock?.() || bot.sock || null;
    const t = c.getTarget(req.body.alvo); if (!t) return res.status(404).json({ error: 'alvo não encontrado' });
    const r = await c.verificarAlvo(sock, t, { forcar: false }).catch(e => ({ erro: e.message }));
    res.json(r);
  });

  return router;
};
