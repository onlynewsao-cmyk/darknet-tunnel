/**
 * User Manager v2 — Atômico, sem race conditions
 *
 * Regra: 1 número WhatsApp = 1 usuário ÚNICO
 *
 * Usa findOneAndUpdate com upsert para evitar duplicate key errors em concorrência
 */
const User = require('../database/models/User');
const config = require('../config');
const bcrypt = require('bcryptjs');

/**
 * Normaliza número (remove tudo que não é dígito, ignora sufixos :XX)
 */
function normalizeNumber(num) {
  if (!num) return '';
  return String(num).split(':')[0].split('@')[0].replace(/\D/g, '');
}

/**
 * Identifica usuário pelo número do WhatsApp — ATÔMICO.
 * NUNCA cria duplicata mesmo com requests paralelas.
 */
async function identifyByWhatsApp(whatsappNumber, pushName = '') {
  const number = normalizeNumber(whatsappNumber);
  if (!number) return null;

  const ownerNum = normalizeNumber(config.owner.number);
  const isOwner = number === ownerNum;

  // 1) BUSCA por whatsappNumber primeiro (rápido)
  let user = await User.findOne({ whatsappNumber: number }).catch(() => null);
  if (user) {
    // Atualiza role se for owner e nome se vazio
    let changed = false;
    if (isOwner && user.role !== 'owner') { user.role = 'owner'; changed = true; }
    if (pushName && (!user.name || user.name.startsWith('User '))) { user.name = pushName; changed = true; }
    if (changed) await user.save().catch(() => {});
    return user;
  }

  // 2) BUSCA por username legado 'wa_<numero>'
  user = await User.findOne({ username: 'wa_' + number }).catch(() => null);
  if (user) {
    // Vincula whatsappNumber atomicamente
    try {
      user.whatsappNumber = number;
      if (isOwner && user.role !== 'owner') user.role = 'owner';
      if (pushName && !user.name) user.name = pushName;
      await user.save();
    } catch (e) {
      // Ignora erro de duplicate (outra request já fez)
      if (e.code !== 11000) console.error('userManager save:', e.message);
    }
    return user;
  }

  // 3) Cria com UPSERT ATÔMICO (não dá duplicate error)
  // Pré-hash da senha (pra evitar issue com pre('save'))
  const hashedPwd = await bcrypt.hash(Math.random().toString(36) + Date.now(), 10);

  try {
    // Tenta criar com username = wa_<numero> ou owner.username
    const username = isOwner ? config.owner.username.toLowerCase().trim() : `wa_${number}`;

    // findOneAndUpdate é ATÔMICO — se já existir, retorna o existente
    user = await User.findOneAndUpdate(
      { whatsappNumber: number },
      {
        $setOnInsert: {
          username,
          password: hashedPwd,
          name: pushName || `User ${number}`,
          whatsappNumber: number,
          role: isOwner ? 'owner' : 'free',
          autoCreated: true,
          createdAt: new Date(),
        },
        $set: {
          lastSeenAt: new Date(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return user;
  } catch (e) {
    // Se der duplicate em username (alguém criou com mesmo nome), tenta de novo com sufixo random
    if (e.code === 11000) {
      try {
        const fallbackUsername = `wa_${number}_${Math.random().toString(36).slice(2, 6)}`;
        user = await User.findOneAndUpdate(
          { whatsappNumber: number },
          {
            $setOnInsert: {
              username: fallbackUsername,
              password: hashedPwd,
              name: pushName || `User ${number}`,
              whatsappNumber: number,
              role: isOwner ? 'owner' : 'free',
              autoCreated: true,
            },
            $set: { lastSeenAt: new Date() },
          },
          { upsert: true, new: true }
        );
        return user;
      } catch (e2) {
        // Última tentativa: só busca pelo número (talvez já foi criado em paralelo)
        const existing = await User.findOne({ whatsappNumber: number }).catch(() => null);
        if (existing) return existing;
        console.error('userManager fatal:', e2.message);
        return null;
      }
    }
    console.error('userManager err:', e.message);
    return null;
  }
}

/**
 * Procura usuário pelo username (login no dashboard) ou número
 */
async function findOrCreate({ username, password, name, whatsappNumber, role = 'free' }) {
  const number = normalizeNumber(whatsappNumber);

  if (number) {
    let user = await User.findOne({ whatsappNumber: number });
    if (user) {
      if (password) user.password = password;
      if (name) user.name = name;
      if (username && user.username.startsWith('wa_')) user.username = username.toLowerCase().trim();
      await user.save();
      return user;
    }
  }

  if (username) {
    let user = await User.findOne({ username: username.toLowerCase().trim() });
    if (user) {
      if (password) user.password = password;
      if (name && !user.name) user.name = name;
      if (number && !user.whatsappNumber) user.whatsappNumber = number;
      await user.save();
      return user;
    }
  }

  return User.create({
    username: (username || `wa_${number || Date.now()}`).toLowerCase().trim(),
    password: password || (Math.random().toString(36) + Date.now()),
    name: name || `User ${number || ''}`,
    whatsappNumber: number,
    role,
  });
}

/**
 * Mescla duplicatas existentes (mesmo whatsappNumber)
 */
async function deduplicateUsers() {
  try {
    const all = await User.find({ whatsappNumber: { $ne: '', $exists: true } });
    const byNumber = {};
    for (const u of all) {
      const num = normalizeNumber(u.whatsappNumber);
      if (!num) continue;
      if (!byNumber[num]) byNumber[num] = [];
      byNumber[num].push(u);
    }

    let merged = 0;
    for (const [num, users] of Object.entries(byNumber)) {
      if (users.length <= 1) continue;
      users.sort((a, b) => {
        if (a.role === 'owner') return -1;
        if (b.role === 'owner') return 1;
        return new Date(a.createdAt) - new Date(b.createdAt);
      });
      const keep = users[0];
      const remove = users.slice(1);

      for (const r of remove) {
        keep.commandsUsed = (keep.commandsUsed || 0) + (r.commandsUsed || 0);
        if (!keep.name && r.name) keep.name = r.name;
        if (r.role === 'premium' && keep.role === 'free') {
          keep.role = 'premium';
          keep.premiumUntil = r.premiumUntil;
        }
      }
      try { await keep.save(); } catch (e) {}
      try { await User.deleteMany({ _id: { $in: remove.map(r => r._id) } }); } catch (e) {}
      merged += remove.length;
    }

    if (merged > 0) console.log(`🔄 Dedup: ${merged} usuários duplicados mesclados`);
    return merged;
  } catch (e) {
    console.error('Dedup error:', e.message);
    return 0;
  }
}

/**
 * Limpa usuários "fantasma" — autoCreated + sem comandos usados em muito tempo
 */
async function cleanupGhostUsers(daysOld = 90) {
  try {
    const cutoff = new Date(Date.now() - daysOld * 86400000);
    const result = await User.deleteMany({
      autoCreated: true,
      commandsUsed: { $lte: 1 },
      lastSeenAt: { $lt: cutoff },
      role: 'free',
    });
    if (result.deletedCount > 0) console.log(`🧹 Removidos ${result.deletedCount} usuários fantasma`);
    return result.deletedCount;
  } catch (e) { return 0; }
}

module.exports = { identifyByWhatsApp, findOrCreate, deduplicateUsers, cleanupGhostUsers, normalizeNumber };
