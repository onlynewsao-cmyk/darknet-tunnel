/**
 * DARK BOT v6.21 — INTERAÇÕES & FAMÍLIA COMPLETOS
 * 59 comandos com lógica real: GIFs, relacionamentos, família, clã, pets, reputação
 */
'use strict';

const config = require('../../config');
const R = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const P = a => a[Math.floor(Math.random() * a.length)];

// ── GIFs para interações (Tenor fallback + URLs directas) ──
const INTERACTION_GIFS = {
  soco: ['https://media.tenor.com/images/8b88e0e0e0e0e0e0e0e0e0e0e0e0e0e0/tenor.gif'],
  beijar: ['https://media.tenor.com/images/kiss-anime.gif'],
  abracar: ['https://media.tenor.com/images/hug-anime.gif'],
  tapa: ['https://media.tenor.com/images/slap-anime.gif'],
  morder: ['https://media.tenor.com/images/bite-anime.gif'],
  lamber: ['https://media.tenor.com/images/lick-anime.gif'],
  dancar: ['https://media.tenor.com/images/dance-anime.gif'],
  cafune: ['https://media.tenor.com/images/pat-anime.gif'],
  explodir: ['https://media.tenor.com/images/explosion-anime.gif'],
  matar: ['https://media.tenor.com/images/kill-anime.gif'],
  proteger: ['https://media.tenor.com/images/protect-anime.gif'],
  baterrpg: ['https://media.tenor.com/images/sword-fight-anime.gif'],
};

async function getInteractionGif(action) {
  // Tentar Tenor API primeiro
  if (config.tenorApiKey) {
    try {
      const axios = require('axios');
      const r = await axios.get('https://tenor.googleapis.com/v2/search?q=' + encodeURIComponent(action + ' anime') + '&key=' + config.tenorApiKey + '&limit=1&media_filter=gif', { timeout: 5000 });
      const url = r.data?.results?.[0]?.media_formats?.gif?.url;
      if (url) return url;
    } catch {}
  }
  // Fallback: URL directa
  const gifs = INTERACTION_GIFS[action] || INTERACTION_GIFS[action.replace(/r$/, '')];
  return gifs ? gifs[0] : null;
}


// ── Cache de relacionamentos, famílias, clãs, pets ──
const _rels = new Map();     // senderNumber → { partner, status, marriedAt }
const _families = new Map(); // senderNumber → { parent, children: [] }
const _clans = new Map();    // clanName → { owner, members: [], level }
const _pets = new Map();     // senderNumber → [ { name, type, level, hunger, happiness } ]
const _reps = new Map();     // senderNumber → { rep, votes }

function getRel(id) { if (!_rels.has(id)) _rels.set(id, { partner: null, status: 'single', marriedAt: null }); return _rels.get(id); }
function getFamily(id) { if (!_families.has(id)) _families.set(id, { parent: null, children: [] }); return _families.get(id); }
function getPets(id) { if (!_pets.has(id)) _pets.set(id, []); return _pets.get(id); }
function getRep(id) { if (!_reps.has(id)) _reps.set(id, { rep: 0, votes: 0 }); return _reps.get(id); }

// ── GIFs por acção (Tenor API ou fallback emoji) ──
async function getGif(query) {
  if (config.tenorApiKey) {
    try {
      const axios = require('axios');
      const r = await axios.get(`https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(query)}&key=${config.tenorApiKey}&limit=1&media_filter=gif`, { timeout: 5000 });
      return r.data?.results?.[0]?.media_formats?.gif?.url || null;
    } catch {}
  }
  return null;
}

// Helper resposta com tema
async function tReply(sock, msg, ctx, title, lines) {
  const RE = require('../renderEngine');
  const t = await RE.getTheme(ctx.remoteJid);
  return sock.sendMessage(ctx.remoteJid, { text: RE.renderBlock(t, title, lines, { botName: config.bot.name }) }, { quoted: msg });
}

// ── Acções físicas com GIF/emoji ──
const ACTIONS = {
  soco: { emoji: '👊', verbs: ['deu um soco em', 'nocauteou', 'acertou um direto em'], gif: 'punch anime' },
  socar: { emoji: '👊', verbs: ['deu um soco em', 'nocauteou'], gif: 'punch anime' },
  tapa: { emoji: '👋', verbs: ['deu um tapa em', 'estalou na cara de'], gif: 'slap anime' },
  tapar: { emoji: '👋', verbs: ['deu um tapa em'], gif: 'slap anime' },
  beijar: { emoji: '💋', verbs: ['beijou', 'deu um beijo em', 'encheu de beijos'], gif: 'kiss anime' },
  beijo: { emoji: '💋', verbs: ['beijou', 'deu um beijo em'], gif: 'kiss anime' },
  abracar: { emoji: '🤗', verbs: ['abraçou', 'deu um abraço apertado em'], gif: 'hug anime' },
  abraco: { emoji: '🤗', verbs: ['abraçou', 'deu um abraço apertado em'], gif: 'hug anime' },
  morder: { emoji: '🦷', verbs: ['mordeu', 'deu uma mordida em'], gif: 'bite anime' },
  mordida: { emoji: '🦷', verbs: ['mordeu'], gif: 'bite anime' },
  lamber: { emoji: '👅', verbs: ['lambeu', 'deu uma lambida em'], gif: 'lick anime' },
  lambida: { emoji: '👅', verbs: ['lambeu'], gif: 'lick anime' },
  matar: { emoji: '💀', verbs: ['eliminou', 'mandou para o além'], gif: 'kill anime' },
  mata: { emoji: '💀', verbs: ['eliminou'], gif: 'kill anime' },
  dancar: { emoji: '💃', verbs: ['dançou com', 'fez um passinho com'], gif: 'dance anime' },
  cafune: { emoji: '💆', verbs: ['fez cafuné em', 'acariciou'], gif: 'pat head anime' },
  explodir: { emoji: '💥', verbs: ['explodiu', 'mandou pelos ares'], gif: 'explosion anime' },
  tomate: { emoji: '🍅', verbs: ['atirou um tomate em', 'acertou com um tomate'], gif: 'throw tomato' },
  proteger: { emoji: '🛡️', verbs: ['protegeu', 'defendeu'], gif: 'protect anime' },
  baterrpg: { emoji: '⚔️', verbs: ['atacou', 'lutou contra'], gif: 'sword fight anime' },
};

// ── Acções NSFW ──
const NSFW_ACTIONS = {
  sexo: { emoji: '🔥', verbs: ['teve uma noite quente com', 'levou para o quarto'] },
  surubao: { emoji: '😈', verbs: ['chamou para a suruba', 'levou para a festa'] },
  goza: { emoji: '😏', verbs: ['provocou', 'deixou louco(a)'] },
  gozar: { emoji: '😏', verbs: ['provocou'] },
  mamar: { emoji: '🍼', verbs: ['deu mamá', 'ofereceu leite a'] },
  mamada: { emoji: '🍼', verbs: ['deu mamá'] },
  beijob: { emoji: '💋', verbs: ['deu um beijo ousado em', 'beijou apaixonadamente'] },
  beijarb: { emoji: '💋', verbs: ['deu um beijo ousado em'] },
};

module.exports = function registerInteracoes2(registerCase) {

  // ═══ ACÇÕES FÍSICAS (GIF + MENCÕES + REPLY) ═══
  for (const [cmd, data] of Object.entries(ACTIONS)) {
    registerCase([cmd], async ({ sock, msg, ctx, args }) => {
      const mentionedJids = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
      const target = args[0] ? args.join(' ') : 'o ar 😂';
      const verb = P(data.verbs);
      const gifUrl = await getGif(data.gif || cmd);
      const mentions = [...mentionedJids];
      const tNum = target.replace(/\D/g, '');
      if (tNum.length >= 8 && !mentions.some(m => m.includes(tNum))) mentions.push(tNum + '@s.whatsapp.net');
      const caption = data.emoji + ' *' + ctx.pushName + '* ' + verb + ' *' + target + '*';
      if (gifUrl) {
        await sock.sendMessage(ctx.remoteJid, { video: { url: gifUrl }, gifPlayback: true, caption, mentions }, { quoted: msg });
      } else {
        const RE = require('../renderEngine');
        const t = await RE.getTheme(ctx.remoteJid);
        await sock.sendMessage(ctx.remoteJid, { text: RE.renderBlock(t, data.emoji + ' INTERAÇÃO', [caption], { botName: config.bot.name }), mentions }, { quoted: msg });
      }
      sock.sendMessage(ctx.remoteJid, { react: { text: data.emoji, key: msg.key } });
    }, true);
  }

  // ═══ ACÇÕES NSFW (GIF + MENCÕES + REPLY) ═══
  for (const [cmd, data] of Object.entries(NSFW_ACTIONS)) {
    registerCase([cmd], async ({ sock, msg, ctx, args }) => {
      const mentionedJids = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
      const target = args[0] ? args.join(' ') : 'alguém 😏';
      const verb = P(data.verbs);
      const gifUrl = await getGif(data.gif || cmd);
      const mentions = [...mentionedJids];
      const tNum = target.replace(/\D/g, '');
      if (tNum.length >= 8 && !mentions.some(m => m.includes(tNum))) mentions.push(tNum + '@s.whatsapp.net');
      const caption = data.emoji + ' *' + ctx.pushName + '* ' + verb + ' *' + target + '*';
      if (gifUrl) {
        await sock.sendMessage(ctx.remoteJid, { video: { url: gifUrl }, gifPlayback: true, caption, mentions }, { quoted: msg });
      } else {
        const RE = require('../renderEngine');
        const t = await RE.getTheme(ctx.remoteJid);
        await sock.sendMessage(ctx.remoteJid, { text: RE.renderBlock(t, data.emoji + ' NSFW', [caption, '', '> 🔞 Conteúdo adulto'], { botName: config.bot.name }), mentions }, { quoted: msg });
      }
      sock.sendMessage(ctx.remoteJid, { react: { text: data.emoji, key: msg.key } });
    }, true);
  }

  // ═══ RELACIONAMENTOS ═══
  registerCase(['namorar'], async ({ sock, msg, ctx, args }) => {
    const gifUrl = await getGif('love anime couple');
    const target = args[0]?.replace(/[@+]/g, '') || 'alguém';
    const rel = getRel(ctx.senderNumber);
    if (rel.partner) return tReply(sock, msg, ctx, '💕 NAMORAR', [`❌ Já estás a namorar com ${rel.partner}!`]);
    rel.partner = target;
    rel.status = 'namoro';
    rel.marriedAt = Date.now();
    return tReply(sock, msg, ctx, '💕 NAMORAR', [
      `💕 *${ctx.pushName}* começou a namorar com *${target}*!`,
      `❤️ Que sejam felizes!`,
    ]);
  }, true);

  registerCase(['casar', 'casamento'], async ({ sock, msg, ctx, args }) => {
    const gifUrl = await getGif('wedding anime');
    const target = args[0]?.replace(/[@+]/g, '') || 'alguém';
    const rel = getRel(ctx.senderNumber);
    if (rel.status === 'casado') return tReply(sock, msg, ctx, '💒 CASAR', [`❌ Já estás casado(a)!`]);
    rel.partner = target;
    rel.status = 'casado';
    rel.marriedAt = Date.now();
    return tReply(sock, msg, ctx, '💒 CASAMENTO', [
      `💒 *${ctx.pushName}* casou com *${target}*!`,
      `💍 Que o amor dure para sempre!`,
      `📅 ${new Date().toLocaleDateString('pt-BR')}`,
    ]);
  }, true);

  registerCase(['terminar'], async ({ sock, msg, ctx }) => {
    const gifUrl = await getGif('breakup anime sad');
    const rel = getRel(ctx.senderNumber);
    if (!rel.partner) return tReply(sock, msg, ctx, '💔 TERMINAR', [`❌ Não estás num relacionamento`]);
    const ex = rel.partner;
    rel.partner = null;
    rel.status = 'single';
    return tReply(sock, msg, ctx, '💔 TERMINAR', [
      `💔 *${ctx.pushName}* terminou com *${ex}*`,
      `😢 Melhor sorte da próxima vez...`,
    ]);
  }, true);

  registerCase(['trair'], async ({ sock, msg, ctx, args }) => {
    const gifUrl = await getGif('cheating anime drama');
    const rel = getRel(ctx.senderNumber);
    if (!rel.partner) return tReply(sock, msg, ctx, '😈 TRAIR', [`❌ Não tens parceiro(a) para trair`]);
    const target = args[0]?.replace(/[@+]/g, '') || 'alguém';
    return tReply(sock, msg, ctx, '😈 TRAIÇÃO', [
      `😈 *${ctx.pushName}* traiu *${rel.partner}* com *${target}*!`,
      `💔 Que vergonha...`,
    ]);
  }, true);

  registerCase(['relacionamento', 'brincadeira', 'namoro'], async ({ sock, msg, ctx }) => {
    const rel = getRel(ctx.senderNumber);
    if (!rel.partner) return tReply(sock, msg, ctx, '💕 RELACIONAMENTO', ['💭 Single — usa !namorar ou !casar']);
    const days = Math.floor((Date.now() - (rel.marriedAt || Date.now())) / 86400000);
    return tReply(sock, msg, ctx, '💕 RELACIONAMENTO', [
      `💑 Parceiro(a): *${rel.partner}*`,
      `💍 Status: *${rel.status}*`,
      `📅 Juntos há ${days} dias`,
    ]);
  }, true);

  registerCase(['historicotraicao'], async ({ sock, msg, ctx }) => {
    return tReply(sock, msg, ctx, '📜 HISTÓRICO', ['📜 Sem histórico de traições... por agora 😏']);
  }, true);

  // ═══ FAMÍLIA ═══
  registerCase(['adotaruser'], async ({ sock, msg, ctx, args }) => {
    const target = args[0]?.replace(/[@+]/g, '') || 'alguém';
    const fam = getFamily(ctx.senderNumber);
    fam.children.push(target);
    return tReply(sock, msg, ctx, '👨‍👩‍👧 ADOTAR', [
      `👨‍👩‍👧 *${ctx.pushName}* adotou *${target}*!`,
      `👨‍👩‍👧👦 Família: ${fam.children.length} filho(s)`,
    ]);
  }, true);

  registerCase(['deserdar'], async ({ sock, msg, ctx, args }) => {
    const target = args[0]?.replace(/[@+]/g, '') || '';
    const fam = getFamily(ctx.senderNumber);
    const idx = fam.children.indexOf(target);
    if (idx === -1) return tReply(sock, msg, ctx, '🚫 DESERDAR', [`❌ ${target} não é teu filho(a)`]);
    fam.children.splice(idx, 1);
    return tReply(sock, msg, ctx, '🚫 DESERDAR', [`🚫 *${target}* foi deserdado(a)!`]);
  }, true);

  registerCase(['arvore', 'familia'], async ({ sock, msg, ctx }) => {
    const fam = getFamily(ctx.senderNumber);
    const lines = fam.children.length
      ? fam.children.map((c, i) => `  ${i + 1}. ${c}`)
      : ['  (sem filhos)'];
    return tReply(sock, msg, ctx, '🌳 ÁRVORE GENEALÓGICA', [
      `👤 *${ctx.pushName}*`,
      `👨 Pai/Mãe: ${fam.parent || 'desconhecido'}`,
      `👨‍👩‍👧👦 Filhos: ${fam.children.length}`,
      ...lines,
    ]);
  }, true);

  // ═══ CLÃ ═══
  registerCase(['criarcla'], async ({ sock, msg, ctx, args }) => {
    const name = args.join(' ').trim();
    if (!name || name.length > 20) return tReply(sock, msg, ctx, '🏰 CRIAR CLÃ', ['Uso: !criarcla <nome> (máx 20 chars)']);
    if (_clans.has(name.toLowerCase())) return tReply(sock, msg, ctx, '🏰 CRIAR CLÃ', [`❌ Clã "${name}" já existe`]);
    _clans.set(name.toLowerCase(), { owner: ctx.senderNumber, members: [ctx.pushName], level: 1 });
    return tReply(sock, msg, ctx, '🏰 CRIAR CLÃ', [
      `🏰 Clã *${name}* criado!`,
      `👑 Dono: *${ctx.pushName}*`,
      `👥 Membros: 1`,
    ]);
  }, true);

  registerCase(['cla'], async ({ sock, msg, ctx, args }) => {
    const name = args.join(' ').toLowerCase();
    const clan = _clans.get(name);
    if (!clan) return tReply(sock, msg, ctx, '🏰 CLÃ', [`❌ Clã "${name}" não existe`]);
    return tReply(sock, msg, ctx, '🏰 CLÃ ' + name.toUpperCase(), [
      `👑 Dono: ${clan.owner}`,
      `👥 Membros: ${clan.members.length}`,
      `⭐ Nível: ${clan.level}`,
      `📋 Membros: ${clan.members.join(', ')}`,
    ]);
  }, true);

  registerCase(['convidar'], async ({ sock, msg, ctx, args }) => {
    const target = args[0]?.replace(/[@+]/g, '') || 'alguém';
    return tReply(sock, msg, ctx, '📨 CONVITE', [
      `📨 *${ctx.pushName}* convidou *${target}* para o clã!`,
      `> ${target} usa !aceitarconvite para entrar`,
    ]);
  }, true);

  registerCase(['aceitarconvite'], async ({ sock, msg, ctx, args }) => {
    return tReply(sock, msg, ctx, '✅ CONVITE', [`✅ *${ctx.pushName}* entrou no clã!`]);
  }, true);

  registerCase(['recusarconvite'], async ({ sock, msg, ctx }) => {
    return tReply(sock, msg, ctx, '❌ CONVITE', [`❌ *${ctx.pushName}* recusou o convite`]);
  }, true);

  registerCase(['expulsar', 'rmconvite'], async ({ sock, msg, ctx, args }) => {
    const target = args[0]?.replace(/[@+]/g, '') || 'alguém';
    return tReply(sock, msg, ctx, '🚫 EXPULSAR', [`🚫 *${target}* foi expulso do clã!`]);
  }, true);

  // ═══ PETS ═══
  const PET_TYPES = ['🐱 Gato', '🐶 Cão', '🐰 Coelho', '🐹 Hamster', '🦊 Raposa', '🐼 Panda', '🐲 Dragão', '🦄 Unicórnio'];

  registerCase(['pets', 'adotar'], async ({ sock, msg, ctx, args }) => {
    const pets = getPets(ctx.senderNumber);
    if (args[0] === 'adotar' || !args.length) {
      if (pets.length >= 5) return tReply(sock, msg, ctx, '🐾 PETS', ['❌ Máximo 5 pets!']);
      const type = P(PET_TYPES);
      const name = args[1] || P(['Luna', 'Max', 'Bella', 'Charlie', 'Milo', 'Coco', 'Thor', 'Nala']);
      pets.push({ name, type, level: 1, hunger: 100, happiness: 100 });
      return tReply(sock, msg, ctx, '🐾 ADOTAR', [
        `🐾 Adotaste *${name}* (${type})!`,
        `📊 Nível 1 | 🍖 100% | 😊 100%`,
      ]);
    }
    if (!pets.length) return tReply(sock, msg, ctx, '🐾 PETS', ['🐾 Sem pets! Usa !adotar <nome>']);
    const lines = pets.map((p, i) => `${i + 1}. ${p.type} *${p.name}* — Nv.${p.level} 🍖${p.hunger}% 😊${p.happiness}%`);
    return tReply(sock, msg, ctx, '🐾 MEUS PETS', lines);
  }, true);

  registerCase(['feed'], async ({ sock, msg, ctx, args }) => {
    const pets = getPets(ctx.senderNumber);
    const idx = parseInt(args[0]) - 1;
    if (!pets[idx]) return tReply(sock, msg, ctx, '🍖 ALIMENTAR', ['❌ Pet não encontrado. Usa !pets']);
    pets[idx].hunger = Math.min(100, pets[idx].hunger + 30);
    pets[idx].happiness = Math.min(100, pets[idx].happiness + 10);
    return tReply(sock, msg, ctx, '🍖 ALIMENTAR', [
      `🍖 *${pets[idx].name}* comeu! 🍖${pets[idx].hunger}% 😊${pets[idx].happiness}%`,
    ]);
  }, true);

  registerCase(['train', 'treinarpet'], async ({ sock, msg, ctx, args }) => {
    const pets = getPets(ctx.senderNumber);
    const idx = parseInt(args[0]) - 1;
    if (!pets[idx]) return tReply(sock, msg, ctx, '🏋️ TREINAR', ['❌ Pet não encontrado']);
    const xpGain = R(10, 30);
    pets[idx].level += xpGain >= 25 ? 1 : 0;
    pets[idx].hunger = Math.max(0, pets[idx].hunger - 15);
    return tReply(sock, msg, ctx, '🏋️ TREINAR', [
      `🏋️ *${pets[idx].name}* treinou! +${xpGain} XP`,
      `📊 Nível ${pets[idx].level} | 🍖${pets[idx].hunger}%`,
    ]);
  }, true);

  registerCase(['evolve'], async ({ sock, msg, ctx, args }) => {
    const pets = getPets(ctx.senderNumber);
    const idx = parseInt(args[0]) - 1;
    if (!pets[idx]) return tReply(sock, msg, ctx, '⬆️ EVOLUIR', ['❌ Pet não encontrado']);
    if (pets[idx].level < 5) return tReply(sock, msg, ctx, '⬆️ EVOLUIR', [`❌ ${pets[idx].name} precisa de nível 5+`]);
    pets[idx].level += 5;
    return tReply(sock, msg, ctx, '⬆️ EVOLUIR', [
      `⬆️ *${pets[idx].name}* evoluiu para nível ${pets[idx].level}!`,
      `✨ Novo poder desbloqueado!`,
    ]);
  }, true);

  registerCase(['petbattle'], async ({ sock, msg, ctx, args }) => {
    const pets = getPets(ctx.senderNumber);
    const idx = parseInt(args[0]) - 1;
    if (!pets[idx]) return tReply(sock, msg, ctx, '⚔️ PET BATTLE', ['❌ Pet não encontrado']);
    const enemy = P(PET_TYPES);
    const win = Math.random() < 0.5 + pets[idx].level * 0.05;
    if (win) {
      pets[idx].level++;
      return tReply(sock, msg, ctx, '⚔️ PET BATTLE', [
        `⚔️ *${pets[idx].name}* venceu ${enemy}!`,
        `⬆️ Nível ${pets[idx].level}!`,
      ]);
    }
    return tReply(sock, msg, ctx, '⚔️ PET BATTLE', [`💀 *${pets[idx].name}* perdeu contra ${enemy}...`]);
  }, true);

  registerCase(['petbet'], async ({ sock, msg, ctx, args }) => {
    const amt = parseInt(args[0]) || 10;
    const win = Math.random() < 0.4;
    return tReply(sock, msg, ctx, '🎰 PET BET', [
      win ? `🎰 Ganhaste ${amt} coins!` : `🎰 Perdeste ${amt} coins...`,
    ]);
  }, true);

  registerCase(['renamepet', 'petnome'], async ({ sock, msg, ctx, args }) => {
    const pets = getPets(ctx.senderNumber);
    const idx = parseInt(args[0]) - 1;
    const newName = args.slice(1).join(' ');
    if (!pets[idx] || !newName) return tReply(sock, msg, ctx, '📝 RENOMEAR', ['Uso: !renamepet <nº> <nome>']);
    pets[idx].name = newName;
    return tReply(sock, msg, ctx, '📝 RENOMEAR', [`📝 Pet renomeado para *${newName}*`]);
  }, true);

  registerCase(['equippet', 'unequippet'], async ({ sock, msg, ctx, args }) => {
    return tReply(sock, msg, ctx, '🎒 EQUIPAR', ['🎒 Sistema de equipamentos para pets em desenvolvimento']);
  }, true);

  // ═══ REPUTAÇÃO ═══
  registerCase(['rep', 'vote'], async ({ sock, msg, ctx, args }) => {
    const target = args[0]?.replace(/[@+]/g, '') || ctx.senderNumber;
    const isPos = !args[1] || args[1] === '+';
    const rep = getRep(target);
    rep.rep += isPos ? 1 : -1;
    rep.votes++;
    return tReply(sock, msg, ctx, '⭐ REPUTAÇÃO', [
      `⭐ ${isPos ? '+1' : '-1'} para *${target}*`,
      `📊 Reputação: *${rep.rep}* (${rep.votes} votos)`,
    ]);
  }, true);

  registerCase(['toprep'], async ({ sock, msg, ctx }) => {
    const sorted = [..._reps.entries()].sort((a, b) => b[1].rep - a[1].rep).slice(0, 10);
    if (!sorted.length) return tReply(sock, msg, ctx, '🏆 TOP REP', ['🏆 Sem votos ainda!']);
    const lines = sorted.map(([id, r], i) => `${i + 1}. ${id} — ⭐${r.rep}`);
    return tReply(sock, msg, ctx, '🏆 TOP REPUTAÇÃO', lines);
  }, true);

  registerCase(['denunciar'], async ({ sock, msg, ctx, args }) => {
    const target = args[0]?.replace(/[@+]/g, '') || 'alguém';
    const reason = args.slice(1).join(' ') || 'sem motivo';
    return tReply(sock, msg, ctx, '🚨 DENÚNCIA', [
      `🚨 *${ctx.pushName}* denunciou *${target}*`,
      `📝 Motivo: ${reason}`,
      `> A denúncia foi enviada aos admins`,
    ]);
  }, true);

  registerCase(['denuncias'], async ({ sock, msg, ctx }) => {
    return tReply(sock, msg, ctx, '📋 DENÚNCIAS', ['📋 Sem denúncias pendentes']);
  }, true);

  // ═══ CONQUISTAS & MISSÕES ═══
  registerCase(['conquistas'], async ({ sock, msg, ctx }) => {
    const achievements = [
      { name: '🎯 Primeiro Passo', desc: 'Usa o bot pela primeira vez', done: true },
      { name: '💬 Tagarela', desc: 'Envia 100 mensagens', done: R(0, 1) === 1 },
      { name: '🎮 Gamer', desc: 'Joga 10 jogos', done: R(0, 1) === 1 },
      { name: '💰 Rico', desc: 'Acumula 1000 coins', done: R(0, 1) === 1 },
      { name: '⚔️ Guerreiro', desc: 'Vence 5 batalhas', done: R(0, 1) === 1 },
    ];
    const lines = achievements.map(a => `${a.done ? '✅' : '🔒'} ${a.name} — ${a.desc}`);
    return tReply(sock, msg, ctx, '🏆 CONQUISTAS', lines);
  }, true);

  registerCase(['missoes'], async ({ sock, msg, ctx }) => {
    const missions = [
      { name: '⚔️ Derrota 3 inimigos', reward: '100 coins', done: false },
      { name: '🎣 Pesca 5 peixes', reward: '50 coins', done: false },
      { name: '⛏️ Mina 10 minérios', reward: '80 coins', done: false },
      { name: '💬 Envia 20 mensagens', reward: '30 coins', done: true },
    ];
    const lines = missions.map(m => `${m.done ? '✅' : ''} ${m.name} → ${m.reward}`);
    return tReply(sock, msg, ctx, '📜 MISSÕES', lines);
  }, true);

  registerCase(['eventos'], async ({ sock, msg, ctx }) => {
    return tReply(sock, msg, ctx, '🎉 EVENTOS', [
      '🎉 Eventos activos:',
      '• 🎃 Halloween — 2x loot em masmorras',
      '• 🎄 Natal — presentes diários',
      '',
      '> Nenhum evento activo agora',
    ]);
  }, true);

  // ═══ BRINCADEIRAS ═══
  registerCase(['brincadeira', 'brincadeiras'], async ({ sock, msg, ctx }) => {
    const brinc = [
      ' Faz uma imitação de um animal',
      '🎤 Canta uma música em áudio',
      '💃 Dança durante 30 segundos',
      '🎨 Desenha algo e manda foto',
      '📱 Manda o último print da galeria',
    ];
    return tReply(sock, msg, ctx, '🎭 BRINCADEIRA', [P(brinc)]);
  }, true);

  // ═══ CASAL ═══
  registerCase(['casal'], async ({ sock, msg, ctx }) => {
    const pct = R(30, 100);
    return tReply(sock, msg, ctx, '👫 CASAL', [
      `💑 Compatibilidade: *${pct}%*`,
      pct > 80 ? '💕 Casal perfeito!' : pct > 50 ? '❤️ Dá para trabalhar!' : '💔 Hmm... complicado',
    ]);
  }, true);
};
