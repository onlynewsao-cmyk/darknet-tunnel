const express = require('express');
const multer = require('multer');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const cloudinary = require('cloudinary').v2;
const { requireApiAuth, requireApiOwner } = require('../middleware/auth');
const { getBot } = require('../bot/whatsapp');
const User = require('../database/models/User');
const Command = require('../database/models/Command');
const Media = require('../database/models/Media');
const CloudMedia = require('../database/models/CloudMedia');
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
  // v7.49 — apagar ficheiro da nuvem do bot
  router.delete('/nuvem/:id', requireApiOwner, async (req, res) => {
    const f = await CloudMedia.findByIdAndDelete(req.params.id);
    if (!f) return res.status(404).json({ error: 'Não encontrado' });
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
      try { require('../bot/hotCache').forgetUser(user.whatsappNumber); } catch {} // v7.53: fura o TTL
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
        try { require('../bot/hotCache').forgetUser(u.whatsappNumber); } catch {} // v7.53: fura o TTL
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
      const detail = {};
      if (data.commands) {
        for (const c of data.commands) {
          const { _id, __v, ...rest } = c;
          if (overwrite) await Command.findOneAndUpdate({ name: rest.name }, rest, { upsert: true });
          else await Command.create(rest).catch(()=>{});
          count++;
        }
        detail.commands = data.commands.length;
      }
      if (data.settings) {
        for (const s of data.settings) { await BotConfig.set(s.key, s.value); count++; }
        detail.settings = data.settings.length;
      }
      // ── v12.6: IMPORT DE USUÁRIOS em massa (bulkWrite — 1428+ numa passada) ──
      const rUsers = await _importarUsuarios(data.users, overwrite);
      if (rUsers) {
        detail.users = rUsers.importados;
        count += rUsers.importados;
        if (rUsers.ownersSkipped) detail.ownersSkipped = rUsers.ownersSkipped;
      }
      // ── v12.4: IMPORT DE MÍDIAS E AGENDA (também faltava) ──
      if (data.media && Array.isArray(data.media)) {
        for (const md of data.media) {
          const { _id, __v, ...rest } = md;
          try {
            if (overwrite) await Media.replaceOne({ _id }, rest, { upsert: true });
            else await Media.create(rest).catch(() => {});
            count++;
          } catch {}
        }
        detail.media = data.media.length;
      }
      if (data.schedules && Array.isArray(data.schedules)) {
        for (const sc of data.schedules) {
          const { _id, __v, ...rest } = sc;
          try {
            if (overwrite) await Schedule.replaceOne({ _id }, rest, { upsert: true });
            else await Schedule.create(rest).catch(() => {});
            count++;
          } catch {}
        }
        detail.schedules = data.schedules.length;
      }
      res.json({ ok: true, imported: count, detail });
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

  // ── v12.6: helper de import de usuários (bulk, rápido) ──
  async function _importarUsuarios(users, overwrite) {
    if (!Array.isArray(users) || !users.length) return null;
    const bcrypt = require('bcryptjs');
    const limpos = [];
    let skippedOwners = 0;
    let pwPadrao = null;
    for (const u of users) {
      try {
        const { _id, __v, ...rest } = u;
        // O owner LOCAL (login actual do dono) nunca é sobrescrito
        if (rest.role === 'owner') { skippedOwners++; continue; }
        if (!['owner', 'premium', 'free'].includes(rest.role)) rest.role = 'free';
        if (!['male', 'female', 'other', 'unknown'].includes(rest.gender)) rest.gender = 'unknown';
        // username obrigatório e único — gera a partir do número se faltar
        rest.username = String(rest.username || '').trim().toLowerCase() ||
                        'wa_' + String(rest.whatsappNumber || '').replace(/\D/g, '');
        // password: export vem SEM senha — aplica hash padrão 'dark123'
        if (!rest.password || !/^\$2[aby]\$/.test(rest.password)) {
          if (!pwPadrao) pwPadrao = bcrypt.hashSync('dark123', 10);
          rest.password = pwPadrao;
        }
        rest.active = rest.active !== false;
        limpos.push(rest);
      } catch {}
    }
    if (!limpos.length) return { importados: 0, ownersSkipped: skippedOwners };

    if (overwrite) {
      // sobrescreve por username (e preserva quem já existe com mesmo número?)
      // v12.6.1: um usuário pode ter mudado o username — casa TAMBÉM por número
      const ops = [];
      for (const u of limpos) {
        const filtro = u.whatsappNumber
          ? { $or: [{ username: u.username }, { whatsappNumber: u.whatsappNumber }] }
          : { username: u.username };
        ops.push({ replaceOne: { filter: filtro, replacement: u, upsert: true } });
      }
      // em lotes de 500 (limite saudável do bulkWrite)
      for (let i = 0; i < ops.length; i += 500) {
        await User.bulkWrite(ops.slice(i, i + 500), { ordered: false }).catch((e) => console.warn('[import users bulk]', e.message?.slice(0, 80)));
      }
    } else {
      // sem overwrite: só os que AINDA NÃO existem (por username ou número)
      const nums = limpos.map((u) => u.whatsappNumber).filter(Boolean);
      const existentes = new Set([
        ...(await User.find({ username: { $in: limpos.map((u) => u.username) } }).select('username').lean()).map((x) => x.username),
        ...(await User.find({ whatsappNumber: { $in: nums } }).select('whatsappNumber').lean()).map((x) => x.whatsappNumber),
      ]);
      const novos = limpos.filter((u) => !existentes.has(u.username) && !existentes.has(u.whatsappNumber));
      for (let i = 0; i < novos.length; i += 500) {
        await User.insertMany(novos.slice(i, i + 500), { ordered: false }).catch((e) => console.warn('[import users insert]', e.message?.slice(0, 80)));
      }
    }
    return { importados: limpos.length, ownersSkipped: skippedOwners };
  }

  // ── v12.6: IMPORT SÓ DE USUÁRIOS (o botão dedicado do backup) ──
  router.post('/backup/import-users', requireApiOwner, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'Arquivo obrigatório' });
      const data = JSON.parse(req.file.buffer.toString('utf-8'));
      const overwrite = req.body.overwrite === 'true' || req.body.overwrite === 'on';
      const r = await _importarUsuarios(data.users, overwrite);
      if (!r) return res.json({ ok: true, imported: 0, detail: { users: 0 }, aviso: 'O JSON não tem usuários.' });
      res.json({ ok: true, imported: r.importados, detail: { users: r.importados, ownersSkipped: r.ownersSkipped } });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ── v12.6: STATS pro painel de backup mostrar o que há no banco ──
  router.get('/backup/stats', requireApiOwner, async (req, res) => {
    try {
      const [users, premium, commands, media, settings, schedules] = await Promise.all([
        User.countDocuments({}).catch(() => 0),
        User.countDocuments({ $or: [{ role: 'premium' }, { role: 'owner' }] }).catch(() => 0),
        Command.countDocuments({}).catch(() => 0),
        Media.countDocuments({}).catch(() => 0),
        BotConfig.countDocuments({}).catch(() => 0),
        Schedule.countDocuments({}).catch(() => 0),
      ]);
      res.json({ ok: true, users, premium, commands, media, settings, schedules });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ===== ALIASES DE COMPATIBILIDADE (views antigas) =====

  // connect.ejs chama /api/bot/start — alias para /bot/connect
  router.post('/bot/start', requireApiOwner, startBot);

  // users.ejs chama /api/users/:id/premium e /api/users/:id/free
  // v12.9.36: CRIAR usuário do bot no dashboard (Usuários)
  router.post('/users/criar', requireApiOwner, async (req, res) => {
    try {
      const username = String(req.body?.username || '').trim().toLowerCase();
      const senha = String(req.body?.password || '').trim();
      if (!/^[a-z0-9_]{3,20}$/.test(username)) return res.json({ ok: false, erro: 'username: 3-20 letras/números/_' });
      if (senha.length < 4) return res.json({ ok: false, erro: 'senha mínima: 4 caracteres' });
      const User = require('../database/models/User');
      if (await User.findOne({ username }).lean()) return res.json({ ok: false, erro: 'username já existe' });
      const dados = { username, password: senha, name: String(req.body?.name || '').trim(), role: ['free', 'premium'].includes(req.body?.role) ? req.body.role : 'free', autoCreated: false };
      if (req.body?.whatsappNumber) {
        const wa = String(req.body.whatsappNumber).replace(/\D/g, '');
        if (wa.length >= 7) {
          if (await User.findOne({ whatsappNumber: wa }).lean()) return res.json({ ok: false, erro: 'esse WhatsApp já é usuário' });
          dados.whatsappNumber = wa;
        }
      }
      const u = await User.create(dados);
      res.json({ ok: true, id: u._id, username: u.username, nome: u.name });
    } catch (e) { res.json({ ok: false, erro: String(e.message || e).slice(0, 80) }); }
  });

  router.post('/users/:id/premium', requireApiOwner, async (req, res) => {
    try {
      const days = parseInt(req.body.days) || 30;
      const user = await User.findById(req.params.id);
      if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
      user.role = 'premium';
      user.premiumUntil = new Date(Date.now() + days * 86400000);
      await user.save();
      try { require('../bot/hotCache').forgetUser(user.whatsappNumber); } catch {} // v7.53: fura o TTL
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
      try { require('../bot/hotCache').forgetUser(user.whatsappNumber); } catch {} // v7.53: fura o TTL
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

  // ═══ v12.9.11: CENTRAL DE CONTACTOS API (dono) ═══
  const centralBase = () => require('../bot/centralBase');
  // v12.9.36: PAGINADO no servidor — /central/state de 1M contactos = resposta
  // de centenas de MB (morria). Agora: 1 página de cada vez (100/max 500).
  router.get('/central/state', requireApiOwner, (req, res) => {
    const cb = centralBase(); cb.carregar();
    const s = cb.stats();
    const busca = String(req.query.busca || '').toLowerCase().trim();
    const pais = String(req.query.pais || '').trim();
    const dddF = String(req.query.ddd || '').trim();
    const porPagina = Math.min(500, Math.max(10, Number(req.query.porPagina) || 100));
    let lista = [];
    for (const [num, c] of Object.entries(cb.carregar().contactos)) {
      const d = c.ddd || cb.dddDe(num);
      if (pais && d.pais !== pais) continue;
      const rotulo = `+${d.ddi} ${d.ddd}`.trim();
      if (dddF && rotulo !== dddF) continue;
      if (busca && !(num.includes(busca) || String(c.nome || '').toLowerCase().includes(busca))) continue;
      lista.push({ num, nome: c.nome || '', grupos: Object.values(c.grupos || {}).slice(0, 3).join(', '), nGrupos: Object.keys(c.grupos || {}).length, ts: c.ts || c.addedAt || 0, ddi: d.ddi, pais: d.pais, ddd: d.ddd, dddRotulo: rotulo, slots: Object.keys(c.slots || {}) });
    }
    lista.sort((a, b) => b.ts - a.ts);
    const paginas = Math.max(1, Math.ceil(lista.length / porPagina));
    const pagina = Math.min(Math.max(1, Number(req.query.pag) || 1), paginas);
    res.json({
      total: s.total, totalFiltrado: lista.length, nGrupos: s.nGrupos, updatedAt: s.updatedAt,
      grupos: s.porGrupo, ddds: s.ddds, slots: s.slots, pagina, paginas, porPagina,
      contactos: lista.slice((pagina - 1) * porPagina, pagina * porPagina),
    });
  });
  // v12.9.36: países REAIS da base com totais (p/ cartão Países e addcentral de pais:X)
  router.get('/central/paises', requireApiOwner, (req, res) => {
    const cb = centralBase(); cb.carregar();
    const contagem = {};
    for (const [num, c] of Object.entries(cb.carregar().contactos)) {
      const d = c.ddd || cb.dddDe(num);
      contagem[d.pais] = contagem[d.pais] || { pais: d.pais, ddi: d.ddi, total: 0 };
      contagem[d.pais].total++;
    }
    const naBase = Object.values(contagem).sort((a, b) => b.total - a.total);
    const naLista = cb.PAISES.map(p => ({ pais: p.pais, ddi: p.ddi, total: contagem[p.pais]?.total || 0 }));
    res.json({ ok: true, suportados: naLista, naBase, total: s_totalSafe(cb) });
  });
  function s_totalSafe(cb) { try { return cb.stats().total; } catch { return 0; } }
  // v12.9.36: ADICIONAR AOS USUÁRIOS DO BOT — cria User a partir da base
  router.post('/central/criar-usuario', requireApiOwner, async (req, res) => {
    try {
      const num = String(req.body?.num || '').replace(/\D/g, '');
      if (!num || num.length < 7) return res.json({ ok: false, erro: 'número inválido' });
      const User = require('../database/models/User');
      const jaExiste = await User.findOne({ $or: [{ username: num }, { whatsappNumber: num }] }).lean();
      if (jaExiste) return res.json({ ok: false, erro: 'já é usuário do bot (' + (jaExiste.username || jaExiste.whatsappNumber) + ')' });
      const senha = 'dk' + Math.random().toString(36).slice(2, 8) + Math.floor(Math.random() * 90 + 10);
      const cb2 = centralBase(); cb2.carregar();
      const info = cb2.carregar().contactos[num];
      const role = String(req.body?.role || 'free') === 'premium' ? 'premium' : 'free';
      const u = await User.create({ username: num, password: senha, name: String(req.body?.nome || info?.nome || 'Usuário ' + num.slice(-4)), whatsappNumber: num, role, autoCreated: true });
      res.json({ ok: true, id: u._id, username: num, senha, role: u.role, nome: u.name });
    } catch (e) { res.json({ ok: false, erro: String(e.message || e).slice(0, 80) }); }
  });
  router.post('/central/remover', requireApiOwner, (req, res) => {
    const cb = centralBase();
    res.json({ ok: cb.remover(String(req.body.num || '').replace(/\D/g, '')) });
  });
  router.post('/central/limpar', requireApiOwner, (req, res) => { const cb = centralBase(); cb.limpar(); res.json({ ok: true }); });
  // v12.9.36: CSV em STREAMING — nunca junta 1M linhas numa string
  router.get('/central/csv', requireApiOwner, (req, res) => {
    const cb = centralBase(); cb.carregar();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="central-contactos.csv"');
    res.write('numero,ddi,pais,ddd,nome,slots,grupos\n');
    let buffer = [];
    for (const [num, c] of Object.entries(cb.carregar().contactos)) {
      const d = c.ddd || cb.dddDe(num);
      const slotsStr = Object.keys(c.slots || {}).join('|');
      buffer.push(`${num},${d.ddi},${d.pais},${d.ddd},"${(c.nome || '').replace(/"/g, "'")}","${slotsStr}","${Object.values(c.grupos || {}).join(' | ').replace(/"/g, "'")}"`);
      if (buffer.length >= 5000) { res.write(buffer.join('\n') + '\n'); buffer = []; }
    }
    if (buffer.length) res.write(buffer.join('\n') + '\n');
    res.end();
  });

  // ═══ 🕸️ Central v12.9.23: DDDs + captura com TODOS os slots ═══
  router.get('/central/ddds', requireApiOwner, (req, res) => {
    const s = centralBase().stats();
    res.json({ ok: true, total: s.total, ddds: s.ddds, slots: s.slots });
  });

  router.get('/central/ddd/:filtro', requireApiOwner, (req, res) => {
    const cb = centralBase();
    const lista = cb.contactosPorDdd(decodeURIComponent(req.params.filtro));
    res.json({ ok: true, filtro: req.params.filtro, total: lista.length, contactos: lista });
  });

  router.post('/central/capturar-slots', requireApiOwner, async (req, res) => {
    try {
      const sc = require('../bot/sessionCenter');
      const r = await sc.capturarComTodosOsSlotsEmFundo();
      res.json(r);
    } catch (e) { res.json({ ok: false, erro: e.message }); }
  });

  // v12.9.34: progresso da captura em fundo (o dashboard consulta a cada 3s)
  router.get('/central/captura-progresso', requireApiOwner, (req, res) => {
    res.json(require('../bot/sessionCenter').capturaProgresso());
  });

  // ═══ v12.9.35: GRUPOS DO BOT AO VIVO — leitura e captura individual/todos/comunidade ═══
  const capViva = require('../bot/capturaViva');
  router.get('/central/grupos-vivos', requireApiOwner, async (req, res) => {
    try { res.json(await capViva.listarVivos()); }
    catch (e) { res.json({ ok: false, motivo: e.message }); }
  });
  // captura 1 grupo (sync — 1 chamada, devolve já)
  router.post('/central/capturar-vivo', requireApiOwner, async (req, res) => {
    try { res.json(await capViva.capturarUm(String(req.body?.jid || ''))); }
    catch (e) { res.json({ ok: false, motivo: e.message }); }
  });
  // captura em FUNDO: { comunidade: jid } (pai+filhos) ou { todos: true }
  router.post('/central/capturar-vivo-fundo', requireApiOwner, async (req, res) => {
    try {
      const r = await capViva.capturarFundo(req.body || {});
      res.json(r);
    } catch (e) { res.json({ ok: false, motivo: e.message }); }
  });
  router.get('/central/captura-viva-progresso', requireApiOwner, (req, res) => {
    res.json(capViva.progresso());
  });

  // ═══ v7.34: C∆P API (dono) ═══
  const capE = () => { const c = require('../cap/capEngine'); c.load(); return c; };
  router.get('/cap/state', requireApiOwner, async (req, res) => {
    const c = capE(); await c.sincronizar(true).catch(() => {});
    res.json({
      sessoes: (c.state.session.igPool || []).map(s => ({ user: s.user, ok: s.ok !== false, lastErr: s.lastErr || '', addedAt: s.addedAt, id: s.id || '', porConfirmar: !!s.porConfirmar, temJar: !!(s.cookies && s.cookies.length > 40), sid: s.sid.slice(0, 14) + '…' })),
      activa: (c.state.session.ig || '').slice(0, 14) + '…',
      alvos: c.listTargets(), log: c.state.log.slice(0, 50),
    });
  });
  router.post('/cap/login', requireApiOwner, async (req, res) => {
    const c = capE();
    try {
      let sid = String(req.body.sessionid || '').trim();
      let _jar = '';
      if (/^[\[{]/.test(sid) || /csrftoken=|ds_user_id=|ig_did=/i.test(sid)) {
        const nc = c.normalizarCookies(sid);
        if (nc.sid) { sid = nc.sid; _jar = nc.jar; }
      } else { const mm = sid.match(/sessionid=([^;\s]+)/i); if (mm) sid = mm[1]; }
      if (!sid && req.body.username && req.body.password) {
        const lg = await require('../cap/igLogin').loginComSenha(req.body.username, req.body.password);
        // ── v12.8: Instagram pediu código → painel pede ao dono ──
        if (!lg.ok && lg.precisaCodigo) {
          return res.json({ ok: false, precisaCodigo: true, tipo: lg.tipo, user: lg.user, dica: lg.dica || '', aviso: lg.aviso || '' });
        }
        if (!lg.ok) return res.status(400).json({ error: lg.erro, aviso: lg.aviso || '', checkpoint: !!lg.checkpoint, twoFactor: !!lg.twoFactor });
        if (lg.aviso) req.body._aviso = lg.aviso;
        sid = lg.sid;
      }
      if (!sid) return res.status(400).json({ error: 'Envia sessionid ou username+password' });
      const r = await c.addSessao(sid, { cookies: _jar });
      if (!r.ok) return res.status(400).json({ error: r.erro });
      res.json({ ok: true, user: r.user, validado: r.validado, aviso: r.aviso || req.body._aviso || '', sessoes: c.listSessoes() });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── v12.8: confirmar o código de verificação (checkpoint/2FA) ──
  router.post('/cap/codigo', requireApiOwner, async (req, res) => {
    try {
      const lg = require('../cap/igLogin');
      const pend = lg.estadoPendente();
      const alvo = String(req.body.username || '').trim() || (Array.isArray(pend) && pend.length ? pend[0].user : '');
      if (!alvo) return res.status(400).json({ error: 'Nenhum login à espera de código. Faz login primeiro.' });
      const r = await lg.confirmarCodigo(alvo, req.body.code);
      if (!r.ok) return res.status(400).json({ error: r.erro });
      const c = capE();
      const rAdd = await c.addSessao(r.sid);
      if (!rAdd.ok) return res.status(400).json({ error: 'Login OK mas validação falhou: ' + rAdd.erro });
      res.json({ ok: true, user: r.user || rAdd.user, aviso: rAdd.aviso || '', sessoes: c.listSessoes() });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── v12.8: logins pendentes de código ──
  router.get('/cap/pendentes', requireApiOwner, (req, res) => {
    res.json({ pendentes: require('../cap/igLogin').estadoPendente() || [] });
  });
  router.post('/cap/logout', requireApiOwner, (req, res) => { const c = capE(); res.json({ removidas: c.delSessao(req.body.user || 'all'), sessoes: c.listSessoes() }); });
  // v12.9.11c: remover por uid (id da sessão) — multi-contas
  router.post('/cap/sessao/remover', requireApiOwner, (req, res) => {
    const c = capE(); c.load();
    const uid = String(req.body.id || '').replace(/\D/g, '');
    const antes = (c.state.session.igPool || []).length;
    c.state.session.igPool = (c.state.session.igPool || []).filter(s => String(s.id || '') !== uid && String(s.sid || '').split('%3A')[0] !== uid);
    if (!c.state.session.igPool.some(x => x.sid === c.state.session.ig)) c.state.session.ig = c.state.session.igPool[0]?.sid || '';
    c.save();
    res.json({ ok: true, removidas: antes - c.state.session.igPool.length, sessoes: c.listSessoes() });
  });
  // activar uma sessão do pool (trocar a activa)
  router.post('/cap/sessao/activar', requireApiOwner, (req, res) => {
    const c = capE(); c.load();
    const uid = String(req.body.id || '').replace(/\D/g, '');
    const alvo = (c.state.session.igPool || []).find(s => String(s.id || '') === uid || String(s.sid || '').split('%3A')[0] === uid);
    if (!alvo) return res.status(404).json({ error: 'sessão não encontrada' });
    c.state.session.ig = alvo.sid; c.save();
    res.json({ ok: true, activa: alvo.user || uid });
  });
  // inferir usernames em falta (botão "resolver @users")
  router.post('/cap/sessao/inferir', requireApiOwner, async (req, res) => {
    const c = capE(); c.load();
    const out = [];
    for (const s of (c.state.session.igPool || [])) {
      if (s.user) continue;
      const u = await c.inferirUsername(s.sid).catch(() => '');
      if (u) { s.user = u; out.push({ id: s.id || '', user: u }); }
    }
    c.save();
    res.json({ ok: true, resolvidos: out, sessoes: c.listSessoes() });
  });
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


  // ═══ 🛠️ IG APIs — as NOSSAS APIs verdadeiras (dados REAIS do Instagram por todas as vias) ═══
  // Autenticação: sessão owner do painel (cookie). Todas honestas: {ok:false,erro} quando o IG fecha.
  const igE = () => { const c = require('../cap/capEngine'); c.load(); return c; };
  // ═══ 🔑 CHAVES DE API — consumo externo (X-API-Key ou ?key=) ═══
  const apiKeys = require('../cap/apiKeys');
  const _chaveDoPedido = (req) => req.get('X-API-Key') || req.query.key || (String(req.get('authorization') || '').match(/^Bearer\s+(dk_.+)$/i) || [])[1] || '';
  const requireApiKeyOrOwner = (escopo) => (req, res, next) => {
    if (req.session?.user?.role === 'owner') return next(); // painel: tudo
    const doc = apiKeys.verificar(_chaveDoPedido(req));
    if (!doc) return res.status(401).json({ ok: false, erro: 'Chave de API inválida ou ausente (X-API-Key)' });
    if (!apiKeys.temEscopo(doc, escopo)) return res.status(403).json({ ok: false, erro: `Chave sem escopo "${escopo}" (tem: ${doc.scopes.join(', ')})` });
    req.apiKey = doc;
    return next();
  };

  router.get('/chaves', requireApiOwner, (req, res) => res.json({ ok: true, total: apiKeys.listar().length, chaves: apiKeys.listar() }));
  router.post('/chaves', requireApiOwner, (req, res) => {
    const r = apiKeys.gerar(req.body.nome, req.body.scopes);
    res.json({ ok: true, nota: 'GUARDA A CHAVE AGORA — só se mostra esta vez', chave: r.chave, ...(() => { const { hash, ...doc } = r.doc; return { doc }; })() });
  });
  router.post('/chaves/revogar', requireApiOwner, (req, res) => res.json({ ok: apiKeys.revogar(String(req.body.id || '')) }));

  // proteger as famílias novas: sessão owner OU chave com escopo
  const _ig = requireApiKeyOrOwner('ig'), _wa = requireApiKeyOrOwner('wa'), _sys = requireApiKeyOrOwner('sistema'), _ia = requireApiKeyOrOwner('ia');
  const _prot = (router, metod, caminho, escopoMid, handler) => { /* no-op helper */ };

  const _hd = (u) => String(u || '').replace(/\/s\d{2,4}x\d{2,4}\//g, '/s1080x1080/');
  const _pFmt = (p) => ({
    username: p.username, id: p.id || '', nome: p.nome || '', bio: p.bio || '',
    verificado: !!p.verificado, privado: !!p.privado,
    seguidores: p.seguidores || 0, seguindo: p.seguindo || 0, posts: p.posts || 0,
    foto_hd: _hd(p.foto), via: p.via || '',
  });
  const _iFmt = (i) => ({ tipo: i.tipo, shortcode: i.shortcode, legenda: String(i.caption || '').slice(0, 140), data: i.ts ? new Date(i.ts).toISOString() : null, link: i.link, midias: (i.medias || []).map(m => ({ url: m.url, video: !!m.isVideo, largura: m.width || null, altura: m.height || null })) });

  router.get('/ig/perfil/:username', _ig, async (req, res) => {
    try {
      const c = igE(); const p = await c.PROVIDERS.ig.profile(req.params.username);
      const lim = parseInt(req.query.limit) || 6;
      res.json({ ok: true, fonte: p.via, perfil: _pFmt(p), ultimos_posts: (p.items || []).slice(-lim).reverse().map(_iFmt) });
    } catch (e) { res.json({ ok: false, erro: e.message, dica: 'A cache refresca a cada 3-5 min — tenta de novo' }); }
  });

  router.get('/ig/stats/:username', _ig, async (req, res) => {
    try {
      const c = igE(); const s = await c.perfilStats(req.params.username);
      const ok = !!(s.seguidores || s.posts || s.seguindo);
      res.json({ ok, fontes: s.fontes, stats: { username: s.username, nome: s.nome, verificado: !!s.verificado, privado: !!s.privado, seguidores: s.seguidores, seguindo: s.seguindo, posts: s.posts, foto_hd: _hd(s.foto) }, nota: ok ? undefined : 'IG não libertou números agora — tenta em 5-15 min' });
    } catch (e) { res.json({ ok: false, erro: e.message }); }
  });

  router.get('/ig/posts/:username', _ig, async (req, res) => {
    try {
      const c = igE(); const p = await c.PROVIDERS.ig.profile(req.params.username);
      const lim = Math.min(parseInt(req.query.limit) || 12, 50);
      const items = (p.items || []).filter(i => i.tipo !== 'reel').slice(-lim).reverse();
      res.json({ ok: items.length > 0, fonte: p.via, total: items.length, posts: items.map(_iFmt), erro: items.length ? undefined : 'Sem posts acessíveis agora' });
    } catch (e) { res.json({ ok: false, erro: e.message }); }
  });

  router.get('/ig/reels/:username', _ig, async (req, res) => {
    try {
      const c = igE(); const p = await c.PROVIDERS.ig.profile(req.params.username);
      const lim = Math.min(parseInt(req.query.limit) || 12, 50);
      const items = (p.items || []).filter(i => i.tipo === 'reel').slice(-lim).reverse();
      res.json({ ok: items.length > 0, fonte: p.via, total: items.length, reels: items.map(_iFmt), erro: items.length ? undefined : 'Sem reels acessíveis agora' });
    } catch (e) { res.json({ ok: false, erro: e.message }); }
  });

  router.get('/ig/stories/:username', _ig, async (req, res) => {
    try {
      const c = igE(); const p = await c.PROVIDERS.ig.profile(req.params.username);
      const st = await c.PROVIDERS.ig.stories(p.id, req.params.username);
      res.json({ ok: st.items.length > 0, total: st.items.length, stories: st.items.map(_iFmt), exige_login: !!st.needsLogin, erro: st.items.length ? undefined : 'Sem stories activos agora' });
    } catch (e) { res.json({ ok: false, erro: e.message }); }
  });

  router.get('/ig/highlights/:username', _ig, async (req, res) => {
    try {
      const c = igE(); const p = await c.PROVIDERS.ig.profile(req.params.username);
      const h = await c.PROVIDERS.ig.highlights(p.id, req.params.username);
      res.json({ ok: h.items.length > 0, total: h.items.length, albuns: h.albuns || [], highlights: h.items.map(_iFmt), exige_login: !!h.needsLogin });
    } catch (e) { res.json({ ok: false, erro: e.message }); }
  });

  router.get('/ig/tudo/:username', _ig, async (req, res) => {
    try {
      const c = igE();
      const p = await c.PROVIDERS.ig.profile(req.params.username);
      const [st, h] = await Promise.all([
        c.PROVIDERS.ig.stories(p.id, req.params.username).catch(() => ({ items: [] })),
        c.PROVIDERS.ig.highlights(p.id, req.params.username).catch(() => ({ items: [] })),
      ]);
      res.json({
        ok: true, fonte: p.via,
        perfil: _pFmt(p),
        posts: (p.items || []).filter(i => i.tipo !== 'reel').slice(-12).reverse().map(_iFmt),
        reels: (p.items || []).filter(i => i.tipo === 'reel').slice(-12).reverse().map(_iFmt),
        stories: st.items.map(_iFmt),
        highlights: (h.items || []).map(_iFmt),
      });
    } catch (e) { res.json({ ok: false, erro: e.message }); }
  });

  router.get('/ig/buscar/:q', _ig, async (req, res) => {
    try {
      const c = igE();
      const r = await c.igGetApp(`/api/v1/users/search/?q=${encodeURIComponent(req.params.q)}`);
      let jj = {}; try { jj = JSON.parse(r.body.toString('utf8')); } catch {}
      const us = (jj?.users || []).slice(0, 10).map(u => ({
        username: u.username, pk: String(u.pk), nome: u.full_name, verificado: !!u.is_verified, privado: !!u.is_private,
        seguidores: u.follower_count || 0, foto_hd: _hd(u.profile_pic_url),
      }));
      res.json({ ok: us.length > 0, total: us.length, resultados: us, erro: us.length ? undefined : `IG HTTP ${r.status} — busca indisponível agora` });
    } catch (e) { res.json({ ok: false, erro: e.message }); }
  });

  router.get('/ig/sessoes', _ig, (req, res) => {
    const c = igE();
    res.json({ ok: true, total: c.sessionsAtivas().length, sessoes: c.listSessoes() });
  });

  router.get('/ig/media', _ig, async (req, res) => {
    try {
      const url = String(req.query.url || '');
      let h; try { h = new URL(url).hostname; } catch { return res.status(400).json({ ok: false, erro: 'URL inválida' }); }
      if (!/(cdninstagram\.com|fbcdn\.net|instagram\.com)$/.test(h)) return res.status(403).json({ ok: false, erro: 'Só mídia do Instagram (cdninstagram/fbcdn)' });
      const c = igE();
      const f = await c.baixarMedia({ url, isVideo: req.query.video === '1' });
      res.set('Content-Type', f.mime || 'application/octet-stream');
      res.set('Cache-Control', 'public, max-age=3600');
      res.send(f.buffer);
    } catch (e) { res.status(502).json({ ok: false, erro: e.message }); }
  });


  // ═══ 📶 IG+ (lote, comparar, monitor, canal, webhooks, cache) ═══
  router.get('/ig/lote/:users', _ig, async (req, res) => {
    try {
      const c = igE();
      const users = String(req.params.users || '').split(',').map(u => u.trim().replace(/^@/, '')).filter(Boolean).slice(0, 10);
      if (!users.length) return res.status(400).json({ ok: false, erro: 'Passa usernames: /api/ig/lote/veigh,pinkchyu' });
      const out = [];
      for (let i = 0; i < users.length; i++) {
        try {
          const s = await c.perfilStats(users[i]);
          out.push({ username: s.username, ok: !!(s.seguidores || s.posts), nome: s.nome, verificado: !!s.verificado, privado: !!s.privado, seguidores: s.seguidores, seguindo: s.seguindo, posts: s.posts, foto_hd: _hd(s.foto) });
        } catch (e) { out.push({ username: users[i], ok: false, erro: e.message.slice(0, 80) }); }
        if (i < users.length - 1) await new Promise(r => setTimeout(r, 400 + Math.floor(Math.random() * 500))); // ritmo humano
      }
      res.json({ ok: out.some(x => x.ok), total: out.length, resultados: out });
    } catch (e) { res.json({ ok: false, erro: e.message }); }
  });

  router.get('/ig/comparar/:a/:b', _ig, async (req, res) => {
    try {
      const c = igE();
      const [A, B] = await Promise.all([c.perfilStats(req.params.a).catch(() => null), c.perfilStats(req.params.b).catch(() => null)]);
      if (!A && !B) return res.json({ ok: false, erro: 'Nenhum dos perfis respondeu agora' });
      const fmt = (x) => x ? { username: x.username, nome: x.nome, verificado: !!x.verificado, privado: !!x.privado, seguidores: x.seguidores, seguindo: x.seguindo, posts: x.posts, foto_hd: _hd(x.foto) } : null;
      const a = fmt(A), b = fmt(B);
      const dif = (A && B) ? { seguidores: (A.seguidores || 0) - (B.seguidores || 0), posts: (A.posts || 0) - (B.posts || 0) } : null;
      res.json({ ok: !!(A || B), a, b, vencedor: (A && B) ? ((A.seguidores || 0) >= (B.seguidores || 0) ? A.username : B.username) : null, diferenca: dif });
    } catch (e) { res.json({ ok: false, erro: e.message }); }
  });

  router.get('/ig/monitor', _ig, (req, res) => {
    const c = igE();
    res.json({ ok: true, total: c.listTargets().length, alvos: c.listTargets() });
  });

  router.post('/ig/monitor/add', _ig, (req, res) => {
    try {
      const c = igE();
      const r = c.addTarget(String(req.body.user || ''), { destino: req.body.destino || '', addedBy: 'api' });
      res.json({ ok: true, novo: r.novo, alvo: { username: r.target.username, destinos: r.target.destinos, stories: r.target.stories !== false, intervaloMin: r.target.intervaloMin } });
    } catch (e) { res.json({ ok: false, erro: e.message }); }
  });

  router.post('/ig/monitor/del', _ig, (req, res) => {
    const c = igE();
    res.json({ ok: c.delTarget(String(req.body.user || '')) });
  });

  router.get('/ig/canal/:user', _ig, async (req, res) => {
    try {
      const c = igE();
      const p = await c.PROVIDERS.ig.profile(req.params.user);
      for (const rota of [`/api/v1/channels/discovery/?pk=${p.id}`, `/api/v1/text_feed/${p.id}/`]) {
        const r = await c.igGetApp(rota).catch(() => null);
        let j = {}; try { j = JSON.parse(r?.body?.toString('utf8') || '{}'); } catch {}
        const items = (j.items || []).slice(0, 12).map(x => ({ texto: (x.text || '').slice(0, 200), ts: x.created_at ? new Date(x.created_at * 1000).toISOString() : null, midia: x.media?.image_versions2?.candidates?.[0]?.url || x.clip?.video_versions?.[0]?.url || null }));
        if (items.length) return res.json({ ok: true, canal: j.channel?.channel_title || null, total: items.length, itens: items });
      }
      res.json({ ok: false, erro: `@${p.username} não expõe canal de difusão por API (só pela app)` });
    } catch (e) { res.json({ ok: false, erro: e.message }); }
  });

  router.get('/ig/webhooks', _ig, (req, res) => {
    const c = igE(); c.load();
    res.json({ ok: true, total: (c.state.webhooks || []).length, urls: c.state.webhooks || [], segredo_hmac: c.state.webhookSecret || null, dica: 'Valida o header X-Dark-Assinatura com HMAC-SHA256 deste segredo sobre o corpo' });
  });
  router.post('/ig/webhook', _ig, (req, res) => {
    try { const r = igE().addWebhook(req.body.url); res.json({ ok: true, total: r.urls.length, urls: r.urls, segredo_hmac: r.segredo, nota: 'Valida X-Dark-Assinatura: HMAC-SHA256(segredo, corpo)' }); }
    catch (e) { res.json({ ok: false, erro: e.message }); }
  });
  router.post('/ig/webhook/remover', _ig, (req, res) => {
    const urls = igE().delWebhook(req.body.url);
    res.json({ ok: true, total: urls.length, urls });
  });

  router.post('/ig/cache/limpar', _ig, (req, res) => {
    res.json({ ok: true, entradas_limpas: igE().limparCache() });
  });

  // ═══ 💬 WHATSAPP (o bot responde às tuas apps) ═══
  const waBot = () => getBot();
  const _jid = (v) => {
    const s = String(v || '').trim();
    if (!s) return '';
    if (/@(s\.whatsapp\.net|g\.us)$/.test(s)) return s;
    const digitos = s.replace(/\D/g, '');
    return digitos ? `${digitos}@s.whatsapp.net` : '';
  };

  router.get('/wa/estado', _wa, (req, res) => {
    const st = waBot().getStatus();
    res.json({ ok: st.status === 'connected', status: st.status, ligadoComo: st.user ? (st.user.name || st.user.id || '') : null, mensagens: st.messageCount, comandos: st.commandCount, uptime_seg: st.uptime, ultimo_erro: st.lastError || null });
  });

  router.post('/wa/enviar', _wa, async (req, res) => {
    try {
      const bot = waBot();
      if (bot.getStatus().status !== 'connected') return res.status(400).json({ ok: false, erro: 'Bot não conectado' });
      const jid = _jid(req.body.para);
      if (!jid) return res.status(400).json({ ok: false, erro: 'Passa "para" (número ou jid)' });
      const texto = String(req.body.texto || '').slice(0, 4000);
      let payload;
      if (req.body.midia) {
        const buf = await mediaHandler.fetchBuffer(String(req.body.midia));
        const tipo = ['image', 'video', 'audio'].includes(req.body.tipo) ? req.body.tipo : 'image';
        payload = tipo === 'audio' ? { audio: buf, mimetype: 'audio/mp4' } : { [tipo]: buf, caption: texto };
      } else payload = { text: texto };
      const r = await bot.sock.sendMessage(jid, payload);
      res.json({ ok: true, para: jid, enviado: true, id: r?.key?.id || null });
    } catch (e) { res.json({ ok: false, erro: e.message }); }
  });

  router.get('/wa/grupos', _wa, async (req, res) => {
    try {
      const bot = waBot();
      if (bot.getStatus().status !== 'connected') return res.status(400).json({ ok: false, erro: 'Bot não conectado' });
      const chats = await bot.sock.groupFetchAllParticipating();
      const grupos = Object.entries(chats).map(([id, g]) => ({ id, nome: g.subject || id, participantes: (g.participants || []).length }));
      res.json({ ok: true, total: grupos.length, grupos });
    } catch (e) { res.json({ ok: false, erro: e.message }); }
  });

  router.get('/wa/contactos', _wa, (req, res) => {
    const cb = require('../bot/centralBase'); cb.carregar();
    const s = cb.stats();
    res.json({ ok: true, total: s.total, nGrupos: s.nGrupos, grupos: s.porGrupo, actualizado: s.updatedAt });
  });

  // ═══ 🖥️ SISTEMA ═══
  router.get('/sistema/estado', _sys, (req, res) => {
    const c = igE();
    const st = getBot().getStatus();
    res.json({
      ok: true,
      versao: (() => { try { return require('../package.json').version || null; } catch { return null; } })(),
      node: process.version, uptime_seg: Math.floor(process.uptime()),
      memoria_mb: Math.round(process.memoryUsage().rss / 1048576),
      whatsapp: { status: st.status, mensagens: st.messageCount },
      ig: { sessoes: c.sessionsAtivas().length, alvos: c.listTargets().length, webhooks: (c.state.webhooks || []).length },
    });
  });

  router.get('/sistema/log', _sys, (req, res) => {
    const c = igE();
    const n = Math.min(parseInt(req.query.n) || 50, 200);
    res.json({ ok: true, total: c.state.log.length, log: c.state.log.slice(-n).reverse() });
  });


  // ═══ 📈 CRESCIMENTO (série histórica automática) ═══
  router.get('/ig/crescimento/:username', _ig, (req, res) => {
    const c = igE();
    const dias = Math.min(parseInt(req.query.dias) || 30, 180);
    const r = c.crescimento(req.params.username, dias);
    res.json({ ok: r.serie.length > 0, ...r, nota: r.serie.length ? undefined : 'Ainda sem histórico — os snapshots são criados a cada consulta de stats (1 ponto/dia)' });
  });

  // ═══ 🪝 entregas webhook + segredo HMAC ═══
  router.get('/ig/webhook/entregas', _ig, (req, res) => {
    const c = igE(); c.load();
    res.json({ ok: true, segredo: c.state.webhookSecret || null, dica: 'Valida X-Dark-Assinatura: HMAC-SHA256(segredo, corpo) = "sha256="+hex', entregas: (c.state.webhookLog || []).slice(-50).reverse() });
  });

  // ═══ 🧠 IA — a inteligência do bot via API ═══
  router.post('/ia/perguntar', _ia, async (req, res) => {
    try {
      const pergunta = String(req.body.pergunta || '').trim();
      if (!pergunta) return res.status(400).json({ ok: false, erro: 'Passa "pergunta"' });
      const ai = require('../bot/ai');
      const r = await ai.chat(pergunta.slice(0, 2000), '', {}, true);
      res.json({ ok: true, pergunta: pergunta.slice(0, 100), resposta: String(r || '').slice(0, 4000) });
    } catch (e) { res.json({ ok: false, erro: 'IA indisponível: ' + e.message.slice(0, 80) }); }
  });

  router.get('/ia/estado', _ia, (req, res) => {
    try { res.json({ ok: true, providers: require('../bot/ai').providerStatus() }); }
    catch (e) { res.json({ ok: false, erro: e.message }); }
  });

  // ═══ 📚 OpenAPI — documentação legível por máquinas ═══
  router.get('/openapi.json', _sys, (req, res) => {
    const p = (sum, tag) => ({ summary: sum, tags: [tag] });
    res.json({
      openapi: '3.0.0', info: { title: 'DARK BOT — APIs verdadeiras', version: '12.9.20', description: 'Instagram (dados reais multi-canal + resgate), monitorização com webhooks assinados, WhatsApp, IA e sistema. Auth: cookie do painel (owner) OU X-API-Key com escopos.' },
      servers: [{ url: '/' }],
      components: { securitySchemes: { ApiKey: { type: 'apiKey', in: 'header', name: 'X-API-Key' }, Sessao: { type: 'apiKey', in: 'cookie', name: 'connect.sid' } } },
      security: [{ ApiKey: [] }, { Sessao: [] }],
      paths: {
        '/api/ig/perfil/{username}': p('Perfil completo + últimos posts', 'Instagram'),
        '/api/ig/stats/{username}': p('Números verdadeiros + fontes', 'Instagram'),
        '/api/ig/posts/{username}': p('Posts com URLs directos', 'Instagram'),
        '/api/ig/reels/{username}': p('Reels com URLs de vídeo', 'Instagram'),
        '/api/ig/stories/{username}': p('Stories activos', 'Instagram'),
        '/api/ig/highlights/{username}': p('Destaques', 'Instagram'),
        '/api/ig/tudo/{username}': p('MEGA: tudo de uma vez', 'Instagram'),
        '/api/ig/buscar/{q}': p('Pesquisar utilizadores', 'Instagram'),
        '/api/ig/lote/{users}': p('Stats em lote (10)', 'Instagram'),
        '/api/ig/comparar/{a}/{b}': p('Comparar 2 perfis', 'Instagram'),
        '/api/ig/canal/{user}': p('Canal de difusão', 'Instagram'),
        '/api/ig/crescimento/{username}': p('Série histórica de seguidores', 'Instagram'),
        '/api/ig/media?url=': p('Proxy de mídia CDN', 'Instagram'),
        '/api/ig/monitor': p('Alvos monitorizados', 'Monitorização'),
        '/api/ig/monitor/add': p('Adicionar alvo', 'Monitorização'),
        '/api/ig/monitor/del': p('Remover alvo', 'Monitorização'),
        '/api/ig/webhooks': p('Webhooks registados', 'Webhooks'),
        '/api/ig/webhook': p('Registar webhook (POST JSON por captura, assinado HMAC)', 'Webhooks'),
        '/api/ig/webhook/entregas': p('Log de entregas + segredo HMAC', 'Webhooks'),
        '/api/wa/estado': p('Estado do WhatsApp', 'WhatsApp'),
        '/api/wa/enviar': p('Enviar texto/mídia', 'WhatsApp'),
        '/api/wa/grupos': p('Grupos', 'WhatsApp'),
        '/api/wa/contactos': p('Central de contactos', 'WhatsApp'),
        '/api/ia/perguntar': p('Perguntar à IA do bot', 'IA'),
        '/api/ia/estado': p('Providers da IA', 'IA'),
        '/api/sistema/estado': p('Estado geral', 'Sistema'),
        '/api/sistema/log': p('Log do CAP', 'Sistema'),
        '/api/chaves': p('Listar chaves', 'Chaves'),
        '/api/chaves (POST)': p('Gerar chave (mostra 1×)', 'Chaves'),
        '/api/chaves/revogar': p('Revogar chave', 'Chaves'),
      },
    });
  });

  return router;
};
