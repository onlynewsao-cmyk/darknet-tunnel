/**
 * AURA USER CONTEXT SYSTEM
 * Permite que a Aura entenda quem está falando com ela
 * Detecta: Dono, Subdono, VIP, Free, ADM do grupo, Conhecido, Desconhecido
 * Usado para decidir como tratar cada pessoa de forma inteligente
 */

const User = require('../../database/models/User');
const config = require('../../config');

// v7.27: sem números fixos no código — vêm do env. O número do BOT é subdono.
const OWNER_NUMBERS = [String(config.owner.number || '').replace(/\D/g, '')].filter(Boolean);
const SUBOWNER_NUMBERS = [String(config.bot.number || '').replace(/\D/g, '')].filter(Boolean);

async function getUserRole(number, isGroup = false, groupMeta = null) {
  const num = String(number).replace(/\D/g, '');

  // Dono Supremo
  if (OWNER_NUMBERS.includes(num)) {
    return { role: 'dono', level: 100, isOwner: true };
  }

  // Subdonos
  if (SUBOWNER_NUMBERS.includes(num)) {
    return { role: 'subdono', level: 90, isOwner: false };
  }

  // Verifica se é admin do grupo
  let isGroupAdmin = false;
  if (isGroup && groupMeta) {
    const participant = groupMeta.participants?.find(p => 
      p.id.split('@')[0].replace(/\D/g, '') === num
    );
    if (participant && (participant.admin === 'admin' || participant.admin === 'superadmin')) {
      isGroupAdmin = true;
    }
  }

  // Verifica no banco de dados
  try {
    const user = await User.findOne({ whatsappNumber: num }).lean();
    if (user) {
      if (user.role === 'premium' || user.isPremium?.()) {
        return { 
          role: 'vip', 
          level: isGroupAdmin ? 70 : 60, 
          isOwner: false,
          isGroupAdmin 
        };
      }
      if (user.role === 'owner') {
        return { role: 'subdono', level: 85, isOwner: false };
      }
    }
  } catch {}

  // Usuário normal / free
  return { 
    role: 'free', 
    level: isGroupAdmin ? 40 : 20, 
    isOwner: false,
    isGroupAdmin 
  };
}

async function isKnownUser(number) {
  const num = String(number).replace(/\D/g, '');
  try {
    const user = await User.findOne({ whatsappNumber: num }).lean();
    return !!user;
  } catch {
    return false;
  }
}

async function getUserContext(number, isGroup = false, groupMeta = null) {
  const roleInfo = await getUserRole(number, isGroup, groupMeta);
  const known = await isKnownUser(number);

  return {
    number,
    role: roleInfo.role,
    level: roleInfo.level,
    isOwner: roleInfo.isOwner,
    isGroupAdmin: roleInfo.isGroupAdmin || false,
    isKnown: known,
    treatment: getTreatmentStyle(roleInfo.role, roleInfo.isGroupAdmin, known)
  };
}

function getTreatmentStyle(role, isGroupAdmin, isKnown) {
  if (role === 'dono') return 'intimate';
  if (role === 'subdono') return 'respectful';
  if (role === 'vip') return isKnown ? 'friendly' : 'professional';
  if (isGroupAdmin) return 'respectful';
  if (isKnown) return 'neutral';
  return 'distant';
}

module.exports = {
  getUserContext,
  getUserRole,
  isKnownUser,
  OWNER_NUMBERS,
  SUBOWNER_NUMBERS,
};
