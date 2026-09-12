const express = require('express');
const router = express.Router();
const { requireLogin, requireOwner } = require('../middleware/auth');
const User = require('../database/models/User');
const Command = require('../database/models/Command');
const Media = require('../database/models/Media');
const BotConfig = require('../database/models/BotConfig');
const Schedule = require('../database/models/Schedule');
const Payment = require('../database/models/Payment');
const Log = require('../database/models/Log');
const DecryptLog = require('../database/models/DecryptLog');
const { getBot } = require('../bot/whatsapp');
const config = require('../config');
const commandCatalog = require('../bot/commandCatalog');
const CommandOverride = require('../database/models/CommandOverride');

router.use(requireLogin);

router.get('/', async (req, res) => {
  const bot = getBot();
  const botState = bot.getStatus();
  const stats = {
    botStatus: botState.status,
    totalUsers: await User.countDocuments().catch(() => 0),
    premiumUsers: await User.countDocuments({ role: 'premium' }).catch(() => 0),
    totalCommands: await Command.countDocuments().catch(() => 0),
    totalMedia: await Media.countDocuments().catch(() => 0),
    messageCount: botState.messageCount || 0,
  };
  res.render('dashboard/home', { title: 'Dashboard', stats });
});

router.get('/connect', requireOwner, async (req, res) => {
  res.render('dashboard/connect', {
    title: 'Conectar Bot',
    botState: getBot().getStatus(),
  });
});

// Painel de Controle (owner)
router.get('/control', requireOwner, async (req, res) => {
  const bot = getBot();
  const botState = bot.getStatus();
  const all = await BotConfig.find().catch(() => []);
  const settings = {};
  all.forEach(c => { settings[c.key] = c.value; });
  const envStatus = {
    groq: !!config.ai.groqApiKey,
    gemini: !!config.ai.geminiApiKey,
    appUrl: config.appUrl || 'não definido',
  };
  let themes = []; try { themes = require('../bot/changeThemes').listThemes().map(t => ({ id: t.name, name: t.label || t.name, icon: t.emoji || '' })); } catch {}
  res.render('dashboard/control', { title: 'Controle', botState, settings, envStatus, themes });
});
router.get('/console', requireOwner, async (req, res) => {
  const all = await BotConfig.find().catch(() => []);
  const settings = {};
  all.forEach(c => { settings[c.key] = c.value; });
  res.render('dashboard/console', { title: 'Console Live', botState: getBot().getStatus(), settings });
});

router.get('/broadcast', requireOwner, async (req, res) => {
  const medias = await Media.find().sort({ createdAt: -1 }).limit(100).catch(() => []);
  res.render('dashboard/broadcast', { title: 'Broadcast', medias });
});

router.get('/schedule', requireOwner, async (req, res) => {
  const schedules = await Schedule.find().sort({ scheduledFor: 1 }).catch(() => []);
  const medias = await Media.find().sort({ createdAt: -1 }).limit(100).catch(() => []);
  res.render('dashboard/schedule', { title: 'Agendamentos', schedules, medias });
});

// v7.34: C∆P — capturas de redes sociais (sessões IG + alvos)
router.get('/cap', requireOwner, async (req, res) => {
  const cap = require('../cap/capEngine'); cap.load();
  res.render('dashboard/cap', { title: 'C∆P Capture', sessoes: cap.listSessoes(), alvos: cap.listTargets(), log: cap.state.log.slice(0, 30) });
});

router.get('/settings', requireOwner, async (req, res) => {
  const all = await BotConfig.find().catch(() => []);
  const settings = {};
  all.forEach(c => { settings[c.key] = c.value; });
  res.render('dashboard/settings', { title: 'Configurações', settings });
});

router.get('/ia', requireOwner, async (req, res) => {
  const all = await BotConfig.find().catch(() => []);
  const settings = {};
  all.forEach(c => { settings[c.key] = c.value; });
  res.render('dashboard/ia', { title: 'IA', settings });
});

router.get('/commands', requireOwner, async (req, res) => {
  const nativeCatalog = commandCatalog.getAll ? commandCatalog.getAll() : (commandCatalog.CATALOG || []);
  const overrides = await CommandOverride.find().lean().catch(() => []);
  const ovMap = {}; overrides.forEach(o => { ovMap[o.commandName] = o; });
  res.render('dashboard/commands', { title: 'Comandos', commands: await Command.find().sort({ category: 1, name: 1 }), nativeCatalog, overrides: ovMap });
});

router.get('/board', requireOwner, async (req, res) => {
  const nativeCatalog = commandCatalog.getAll ? commandCatalog.getAll() : (commandCatalog.CATALOG || []);
  const overrides = await CommandOverride.find().lean().catch(() => []);
  const ovMap = {}; overrides.forEach(o => { ovMap[o.commandName] = o; });
  const customCommands = await Command.find().sort({ category: 1, name: 1 }).lean().catch(() => []);
  const medias = await Media.find().sort({ createdAt: -1 }).limit(100).lean().catch(() => []);
  const all = await BotConfig.find().catch(() => []);
  const settings = {}; all.forEach(c => { settings[c.key] = c.value; });
  res.render('dashboard/board', { title: 'Command Board', nativeCatalog, overrides: ovMap, customCommands, medias, settings });
});
router.get('/commands/new', requireOwner, async (req, res) => {
  const medias = await Media.find().sort({ createdAt: -1 }).limit(100).catch(() => []);
  res.render('dashboard/command-edit', { title: 'Novo Comando', cmd: null, medias });
});
router.get('/commands/:id/edit', requireOwner, async (req, res) => {
  const cmd = await Command.findById(req.params.id);
  if (!cmd) return res.redirect('/dashboard/commands');
  const medias = await Media.find().sort({ createdAt: -1 }).limit(100).catch(() => []);
  res.render('dashboard/command-edit', { title: 'Editar', cmd, medias });
});

router.get('/media', requireOwner, async (req, res) => res.render('dashboard/media', { title: 'Mídias', medias: await Media.find().sort({ createdAt: -1 }) }));
router.get('/users', requireOwner, async (req, res) => res.render('dashboard/users', { title: 'Usuários', users: await User.find().sort({ createdAt: -1 }) }));

router.get('/payments', requireOwner, async (req, res) => {
  const payments = await Payment.find().sort({ createdAt: -1 }).limit(200);
  const all = await Payment.find();
  const stats = {
    pending: all.filter(p => p.status === 'pendente').length,
    approved: all.filter(p => p.status === 'aprovado').length,
    rejected: all.filter(p => p.status === 'rejeitado').length,
    totalRevenue: all.filter(p => p.status === 'aprovado').reduce((s,p) => s + (p.amount||0), 0),
  };
  res.render('dashboard/payments', { title: 'Pagamentos', payments, stats });
});

router.get('/stats', requireOwner, async (req, res) => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAgo = new Date(now.getTime() - 7*86400000);
  const monthAgo = new Date(now.getTime() - 30*86400000);
  const stats = {
    today: await Log.countDocuments({ createdAt: { $gte: today } }).catch(()=>0),
    week: await Log.countDocuments({ createdAt: { $gte: weekAgo } }).catch(()=>0),
    month: await Log.countDocuments({ createdAt: { $gte: monthAgo } }).catch(()=>0),
    total: await Log.countDocuments().catch(()=>0),
  };
  const topCommands = await Log.aggregate([
    { $match: { command: { $ne: '' } } },
    { $group: { _id: '$command', count: { $sum: 1 } } },
    { $sort: { count: -1 } }, { $limit: 10 },
  ]).catch(()=>[]);
  const topUsers = await Log.aggregate([
    { $match: { user: { $ne: '' } } },
    { $group: { _id: '$user', count: { $sum: 1 } } },
    { $sort: { count: -1 } }, { $limit: 10 },
  ]).catch(()=>[]);
  const daysData = await Log.aggregate([
    { $match: { createdAt: { $gte: new Date(now.getTime() - 14*86400000) } } },
    { $group: { _id: { $dateToString: { format: '%d/%m', date: '$createdAt' } }, count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]).catch(()=>[]);
  res.render('dashboard/stats', { title: 'Estatísticas', stats, topCommands, topUsers, daysData });
});

router.get('/backup', requireOwner, (req, res) => res.render('dashboard/backup', { title: 'Backup' }));

// ===== GRUPOS (owner) =====
router.get('/groups', requireOwner, async (req, res) => {
  let groups = [];
  try {
    const bot = getBot();
    if (bot.getStatus().status === 'connected') {
      const chats = await bot.sock.groupFetchAllParticipating();
      groups = Object.values(chats).map(g => ({
        id: g.id, subject: g.subject, size: g.participants?.length || 0,
        desc: g.desc || '', creation: g.creation, owner: g.owner,
        participants: g.participants,
      }));
    }
  } catch (e) {}
  const GroupSettings = require('../database/models/GroupSettings');
  const allSettings = await GroupSettings.find().catch(() => []);
  const settingsMap = {};
  allSettings.forEach(s => { settingsMap[s.groupJid] = s; });
  const medias = await Media.find().sort({ createdAt: -1 }).limit(100).catch(() => []);
  res.render('dashboard/groups', { title: 'Grupos', groups, settingsMap, medias });
});

// ===== ATUALIZAÇÕES + CONFIGS (owner) =====
router.get('/internet', requireOwner, async (req, res) => {
  const updates = await BotConfig.get('internet_updates', []);
  const configs = await BotConfig.get('clipboard_configs', []);
  const all = await BotConfig.find().catch(() => []);
  const settings = {};
  all.forEach(c => { settings[c.key] = c.value; });
  res.render('dashboard/internet', { title: 'Internet & Configs', updates, configs, settings });
});

// ===== DECRYPTER =====
router.get('/decrypter', requireLogin, async (req, res) => {
  try {
    const userData = await User.findById(req.session.user.id);
    const isPremium = userData?.role === 'owner' || (userData && userData.isPremium());
    const filter = userData?.role === 'owner' ? {} : { user: userData?._id };
    const logs = await DecryptLog.find(filter).sort({ createdAt: -1 }).limit(50).catch(() => []);
    res.render('dashboard/decrypter', { title: 'VPN Decrypter', logs, isPremium });
  } catch (e) { res.render('dashboard/decrypter', { title: 'VPN Decrypter', logs: [], isPremium: false }); }
});

router.get('/profile', requireLogin, async (req, res) => {
  try {
    const userData = await User.findById(req.session.user.id);
    if (!userData) return res.redirect('/login');
    res.render('dashboard/profile', { title: 'Meu Perfil', userData });
  } catch (e) { res.redirect('/dashboard'); }
});

router.get('/subscribe', requireLogin, async (req, res) => {
  try {
    const userData = await User.findById(req.session.user.id);
    if (!userData) return res.redirect('/login');
    const myPayment = await Payment.findOne({ user: req.session.user.id }).sort({ createdAt: -1 }).catch(() => null);
    res.render('dashboard/subscribe', { title: 'Assinar Premium', userData, myPayment });
  } catch (e) { res.redirect('/dashboard'); }
});

router.get('/add-bot', requireLogin, async (req, res) => {
  res.render('dashboard/add-bot', { title: 'Adicionar Bot ao Grupo' });
});

module.exports = router;
