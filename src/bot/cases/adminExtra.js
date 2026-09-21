/**
 * DARK BOT v11.2.2 — Admin extra (ex-stubs do audioAdmin2.miscAdmin)
 *
 * Implementação REAL dos comandos que antes só respondiam
 * «Comando registado / Funcionalidade activa».
 *
 * Regras: Dono do bot OU admin WA do grupo (requireSenderAdmin).
 * Mods do bot (gs.mods) podem usar cmds em gs.modCommands + set básico.
 */
'use strict';

const GroupSettings = require('../../database/models/GroupSettings');
const GroupMemberActivity = require('../../database/models/GroupMemberActivity');
const BotConfig = require('../../database/models/BotConfig');
const botConfigCache = require('../botConfigCache');

module.exports = function registerAdminExtra(registerCase) {

  async function getMeta(sock, ctx) {
    try { return await sock.groupMetadata(ctx.remoteJid); }
    catch { return ctx.groupMeta || null; }
  }

  async function senderIsAdmOrOwner(sock, ctx) {
    if (ctx.isOwner) return true;
    if (!ctx.isGroup) return false;
    try {
      const meta = await getMeta(sock, ctx);
      if (!meta?.participants) return false;
      const snum = String(ctx.senderNumber || '').replace(/\D/g, '');
      return meta.participants.some(p => {
        const pNum = String(p.id || '').split(':')[0].split('@')[0].replace(/\D/g, '');
        return pNum === snum && (p.admin === 'admin' || p.admin === 'superadmin');
      });
    } catch { return false; }
  }

  async function isBotMod(ctx) {
    try {
      const gs = await GroupSettings.findOne({ groupJid: ctx.remoteJid }).lean();
      const snum = String(ctx.senderNumber || '').replace(/\D/g, '');
      return !!(gs?.mods || []).some(m => String(m).replace(/\D/g, '') === snum);
    } catch { return false; }
  }

  async function requirePower(sock, ctx, reply, { allowMod = false } = {}) {
    if (!ctx.isGroup && !ctx.isOwner) { await reply('👥 Só em grupos.'); return false; }
    if (ctx.isOwner) return true;
    if (await senderIsAdmOrOwner(sock, ctx)) return true;
    if (allowMod && await isBotMod(ctx)) return true;
    await reply('🚫 Só o *Dono*, *Admins* do grupo' + (allowMod ? ' ou *Mods* do bot' : '') + '.');
    return false;
  }


  async function say(sock, msg, ctx, text, mentions = []) {
    const payload = { text };
    if (mentions && mentions.length) payload.mentions = mentions;
    return sock.sendMessage(ctx.remoteJid, payload, { quoted: msg });
  }

  async function gsUp(jid) {
    return GroupSettings.findOneAndUpdate(
      { groupJid: jid },
      { $setOnInsert: { groupJid: jid } },
      { upsert: true, new: true },
    );
  }

  function mentionsOf(msg) {
    return msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid
      || msg?.message?.interactiveResponseMessage?.contextInfo?.mentionedJid
      || [];
  }

  function numOf(jidOrNum) {
    return String(jidOrNum || '').split(':')[0].split('@')[0].replace(/\D/g, '');
  }

  function tag(jid) { return '@' + numOf(jid); }

  function parseOnOff(v) {
    const s = String(v || '').toLowerCase();
    if (['on', 'ativar', 'ligar', '1', 'true', 'sim'].includes(s)) return true;
    if (['off', 'desativar', 'desligar', '0', 'false', 'nao', 'não'].includes(s)) return false;
    return null;
  }

  async function tryAct(sock, ctx, reply, fn) {
    try { await fn(); return true; }
    catch (e) {
      const m = String(e?.message || e || '');
      if (/not admin|forbidden|403/i.test(m)) {
        await reply('⚠️ Preciso ser *admin* do grupo para isto. Promove-me!');
      } else await reply('❌ ' + m.slice(0, 180));
      return false;
    }
  }

  // ── helpers alvo: menção, quote, ou número nos args ──
  function resolveTargets(msg, args, ctx) {
    const out = [];
    for (const j of mentionsOf(msg)) out.push(j);
    const q = msg?.message?.extendedTextMessage?.contextInfo;
    if (q?.participant) out.push(q.participant);
    for (const a of args) {
      const n = String(a).replace(/\D/g, '');
      if (n.length >= 8) out.push(n + '@s.whatsapp.net');
    }
    // unique by number
    const seen = new Set();
    return out.filter(j => {
      const n = numOf(j);
      if (!n || seen.has(n)) return false;
      seen.add(n);
      return true;
    });
  }

  // ══════════════════════════════════════════════════════════
  // SOLICITAÇÕES — aprovar / recusar / aceitar todos
  // ══════════════════════════════════════════════════════════
  registerCase(['aprovar', 'accept', 'aceitar'], async ({ sock, msg, ctx, args, reply }) => {
    if (!await requirePower(sock, ctx, reply)) return;
    const targets = resolveTargets(msg, args, ctx);
    if (!targets.length) return reply(`❌ Marca quem queres aprovar.\nEx: \`${ctx.prefix}aprovar @user\``);
    await tryAct(sock, ctx, reply, async () => {
      // Baileys: groupRequestParticipantsUpdate (approve)
      if (typeof sock.groupRequestParticipantsUpdate === 'function') {
        await sock.groupRequestParticipantsUpdate(ctx.remoteJid, targets, 'approve');
      } else {
        await sock.groupParticipantsUpdate(ctx.remoteJid, targets, 'add');
      }
      await say(sock, msg, ctx, `✅ Aprovado(s): ${targets.map(tag).join(' ')}`, targets);
    });
  });

  registerCase(['recusarsolic', 'recusar', 'reject'], async ({ sock, msg, ctx, args, reply }) => {
    if (!await requirePower(sock, ctx, reply)) return;
    const targets = resolveTargets(msg, args, ctx);
    if (!targets.length) return reply(`❌ Marca quem queres recusar.\nEx: \`${ctx.prefix}recusarsolic @user\``);
    await tryAct(sock, ctx, reply, async () => {
      if (typeof sock.groupRequestParticipantsUpdate === 'function') {
        await sock.groupRequestParticipantsUpdate(ctx.remoteJid, targets, 'reject');
      } else {
        return reply('⚠️ Este cliente não expõe recusa de solicitações. Actualiza o Baileys.');
      }
      await say(sock, msg, ctx, `🚫 Recusado(s): ${targets.map(tag).join(' ')}`, targets);
    });
  });

  registerCase(['aceitatodos', 'aprovarall', 'acceptall'], async ({ sock, msg, ctx, reply }) => {
    if (!await requirePower(sock, ctx, reply)) return;
    await tryAct(sock, ctx, reply, async () => {
      let list = [];
      if (typeof sock.groupRequestParticipantsList === 'function') {
        list = await sock.groupRequestParticipantsList(ctx.remoteJid).catch(() => []) || [];
      }
      const jids = (list || []).map(p => p.jid || p.id || p).filter(Boolean);
      if (!jids.length) return reply('📋 Sem solicitações pendentes.');
      if (typeof sock.groupRequestParticipantsUpdate === 'function') {
        await sock.groupRequestParticipantsUpdate(ctx.remoteJid, jids, 'approve');
      }
      await reply(`✅ *${jids.length}* solicitação(ões) aprovada(s).`);
    });
  });

  // ══════════════════════════════════════════════════════════
  // BLACKLIST do grupo
  // ══════════════════════════════════════════════════════════
  registerCase(['addblacklist', 'blacklistadd'], async ({ sock, msg, ctx, args, reply }) => {
    if (!await requirePower(sock, ctx, reply)) return;
    const targets = resolveTargets(msg, args, ctx).map(numOf).filter(Boolean);
    if (!targets.length) return reply(`❌ Uso: \`${ctx.prefix}addblacklist @user|número\``);
    const gs = await gsUp(ctx.remoteJid);
    const set = new Set([...(gs.blacklist || []), ...(gs.blockedUsers || [])].map(numOf));
    targets.forEach(n => set.add(n));
    gs.blacklist = [...set];
    gs.blockedUsers = [...set];
    await gs.save();
    await say(sock, msg, ctx, `🚫 Blacklist +${targets.length}: ${targets.map(n => '@' + n).join(' ')}\nTotal: *${set.size}*`, targets.map(n => n + '@s.whatsapp.net'));
  });

  registerCase(['delblacklist', 'blacklistrem', 'unblacklist'], async ({ sock, msg, ctx, args, reply }) => {
    if (!await requirePower(sock, ctx, reply)) return;
    const targets = resolveTargets(msg, args, ctx).map(numOf).filter(Boolean);
    if (!targets.length) return reply(`❌ Uso: \`${ctx.prefix}delblacklist @user|número\``);
    const gs = await gsUp(ctx.remoteJid);
    const kill = new Set(targets);
    gs.blacklist = (gs.blacklist || []).map(numOf).filter(n => !kill.has(n));
    gs.blockedUsers = (gs.blockedUsers || []).map(numOf).filter(n => !kill.has(n));
    await gs.save();
    await reply(`✅ Removido(s) da blacklist: ${targets.map(n => '@' + n).join(' ')}`);
  });

  registerCase(['listblacklist', 'blacklist'], async ({ sock, msg, ctx, reply }) => {
    if (!ctx.isGroup) return reply('👥 Só em grupos.');
    const gs = await GroupSettings.findOne({ groupJid: ctx.remoteJid }).lean().catch(() => null);
    const list = [...new Set([...(gs?.blacklist || []), ...(gs?.blockedUsers || [])].map(numOf).filter(Boolean))];
    if (!list.length) return reply('📋 Blacklist vazia.');
    await say(sock, msg, ctx, `🚫 *BLACKLIST* (${list.length})\n\n` + list.map((n, i) => `${i + 1}. @${n}`).join('\n'), list.map(n => n + '@s.whatsapp.net'));
  });

  // blockuser / unblockuser — atalhos da blacklist + kick opcional
  registerCase(['blockuser', 'bloquearuser'], async ({ sock, msg, ctx, args, reply }) => {
    if (!await requirePower(sock, ctx, reply)) return;
    const targets = resolveTargets(msg, args, ctx);
    if (!targets.length) return reply(`❌ Uso: \`${ctx.prefix}blockuser @user\``);
    const gs = await gsUp(ctx.remoteJid);
    const set = new Set([...(gs.blacklist || [])].map(numOf));
    targets.forEach(j => set.add(numOf(j)));
    gs.blacklist = [...set];
    gs.blockedUsers = [...set];
    await gs.save();
    await tryAct(sock, ctx, reply, async () => {
      await sock.groupParticipantsUpdate(ctx.remoteJid, targets, 'remove').catch(() => {});
    });
    await say(sock, msg, ctx, `🔒 Bloqueado(s) + removido(s): ${targets.map(tag).join(' ')}`, targets);
  });

  registerCase(['unblockuser', 'desbloquearuser'], async ({ sock, msg, ctx, args, reply }) => {
    if (!await requirePower(sock, ctx, reply)) return;
    const targets = resolveTargets(msg, args, ctx).map(numOf);
    if (!targets.length) return reply(`❌ Uso: \`${ctx.prefix}unblockuser @user|número\``);
    const gs = await gsUp(ctx.remoteJid);
    const kill = new Set(targets);
    gs.blacklist = (gs.blacklist || []).map(numOf).filter(n => !kill.has(n));
    gs.blockedUsers = (gs.blockedUsers || []).map(numOf).filter(n => !kill.has(n));
    await gs.save();
    await reply(`🔓 Desbloqueado(s): ${targets.map(n => '@' + n).join(' ')}`);
  });

  // ══════════════════════════════════════════════════════════
  // BLOCK CMD / UNBLOCK CMD
  // ══════════════════════════════════════════════════════════
  registerCase(['blockcmd', 'bloquearcmd'], async ({ sock, msg, ctx, args, reply }) => {
    if (!await requirePower(sock, ctx, reply)) return;
    const cmds = args.map(a => String(a).toLowerCase().replace(/^\./, '').replace(/^!/, '').trim()).filter(Boolean);
    if (!cmds.length) return reply(`❌ Uso: \`${ctx.prefix}blockcmd play sticker ia\``);
    const gs = await gsUp(ctx.remoteJid);
    const set = new Set([...(gs.blockedCommands || []).map(String)]);
    cmds.forEach(c => set.add(c));
    gs.blockedCommands = [...set];
    await gs.save();
    await reply(`🛑 Comandos bloqueados neste grupo:\n${[...set].map(c => '• ' + c).join('\n') || '—'}`);
  });

  registerCase(['unblockcmd', 'desbloquearcmd'], async ({ sock, msg, ctx, args, reply }) => {
    if (!await requirePower(sock, ctx, reply)) return;
    const cmds = args.map(a => String(a).toLowerCase().replace(/^\./, '').replace(/^!/, '').trim()).filter(Boolean);
    if (!cmds.length) return reply(`❌ Uso: \`${ctx.prefix}unblockcmd play\``);
    const gs = await gsUp(ctx.remoteJid);
    const kill = new Set(cmds);
    gs.blockedCommands = (gs.blockedCommands || []).filter(c => !kill.has(String(c).toLowerCase()));
    await gs.save();
    await reply(`✅ Desbloqueados: ${cmds.join(', ')}\nAinda bloqueados: ${(gs.blockedCommands || []).join(', ') || 'nenhum'}`);
  });

  // ══════════════════════════════════════════════════════════
  // MODS do bot
  // ══════════════════════════════════════════════════════════
  registerCase(['addmod', 'modadd'], async ({ sock, msg, ctx, args, reply }) => {
    if (!await requirePower(sock, ctx, reply)) return;
    const targets = resolveTargets(msg, args, ctx).map(numOf).filter(Boolean);
    if (!targets.length) return reply(`❌ Uso: \`${ctx.prefix}addmod @user\``);
    const gs = await gsUp(ctx.remoteJid);
    const set = new Set((gs.mods || []).map(numOf));
    targets.forEach(n => set.add(n));
    gs.mods = [...set];
    await gs.save();
    await say(sock, msg, ctx, `⭐ Mod(s) adicionados: ${targets.map(n => '@' + n).join(' ')}\nTotal mods: *${set.size}*`, targets.map(n => n + '@s.whatsapp.net'));
  });

  registerCase(['delmod', 'rmmod', 'moddel'], async ({ sock, msg, ctx, args, reply }) => {
    if (!await requirePower(sock, ctx, reply)) return;
    const targets = resolveTargets(msg, args, ctx).map(numOf).filter(Boolean);
    if (!targets.length) return reply(`❌ Uso: \`${ctx.prefix}delmod @user\``);
    const gs = await gsUp(ctx.remoteJid);
    const kill = new Set(targets);
    gs.mods = (gs.mods || []).map(numOf).filter(n => !kill.has(n));
    await gs.save();
    await reply(`✅ Mod removido. Restam: *${(gs.mods || []).length}*`);
  });

  registerCase(['listmods', 'mods'], async ({ sock, msg, ctx, reply }) => {
    if (!ctx.isGroup) return reply('👥 Só em grupos.');
    const gs = await GroupSettings.findOne({ groupJid: ctx.remoteJid }).lean().catch(() => null);
    const mods = (gs?.mods || []).map(numOf).filter(Boolean);
    if (!mods.length) return reply('⭐ Sem mods do bot neste grupo.\nAdiciona com `!addmod @user`');
    await say(sock, msg, ctx, `⭐ *MODS DO BOT* (${mods.length})\n\n` + mods.map((n, i) => `${i + 1}. @${n}`).join('\n'), mods.map(n => n + '@s.whatsapp.net'));
  });

  registerCase(['grantmodcmd', 'modcmd'], async ({ sock, msg, ctx, args, reply }) => {
    if (!await requirePower(sock, ctx, reply)) return;
    const cmds = args.map(a => String(a).toLowerCase().replace(/^[!.]/, '')).filter(Boolean);
    if (!cmds.length) return reply(`❌ Uso: \`${ctx.prefix}grantmodcmd ban kick warn\``);
    const gs = await gsUp(ctx.remoteJid);
    const set = new Set((gs.modCommands || []).map(String));
    cmds.forEach(c => set.add(c));
    gs.modCommands = [...set];
    await gs.save();
    await reply(`✅ Comandos de mod:\n${[...set].map(c => '• ' + c).join('\n')}`);
  });

  registerCase(['revokemodcmd', 'unmodcmd'], async ({ sock, msg, ctx, args, reply }) => {
    if (!await requirePower(sock, ctx, reply)) return;
    const cmds = args.map(a => String(a).toLowerCase().replace(/^[!.]/, '')).filter(Boolean);
    if (!cmds.length) return reply(`❌ Uso: \`${ctx.prefix}revokemodcmd ban\``);
    const gs = await gsUp(ctx.remoteJid);
    const kill = new Set(cmds);
    gs.modCommands = (gs.modCommands || []).filter(c => !kill.has(String(c).toLowerCase()));
    await gs.save();
    await reply(`✅ Revogados. Restam: ${(gs.modCommands || []).join(', ') || 'nenhum'}`);
  });

  registerCase(['listmodcmds', 'modcmds'], async ({ sock, msg, ctx, reply }) => {
    const gs = await GroupSettings.findOne({ groupJid: ctx.remoteJid }).lean().catch(() => null);
    const list = gs?.modCommands || [];
    await reply(`📋 *CMDS DE MOD*\n${list.length ? list.map(c => '• ' + c).join('\n') : '_nenhum_'}`);
  });

  // ══════════════════════════════════════════════════════════
  // ADV / RMADV — aliases de warn
  // ══════════════════════════════════════════════════════════
  registerCase(['adv'], async (cc) => {
    // reusa lógica inline idêntica a warn
    const { sock, msg, ctx, args, reply, m } = cc;
    if (!await requirePower(sock, ctx, reply, { allowMod: true })) return;
    const mentioned = resolveTargets(msg, args, ctx);
    const motivo = args.filter(a => !a.startsWith('@') && !/^\d{8,}$/.test(a)).join(' ') || 'Sem motivo';
    if (!mentioned.length) return reply(`❌ Uso: \`${ctx.prefix}adv @user <motivo>\``);
    const gs = await gsUp(ctx.remoteJid);
    const warnLimit = gs.warnLimit || gs.maxWarns || 3;
    const warnKey = `warn_${ctx.remoteJid}_${numOf(mentioned[0])}`;
    const current = (await BotConfig.get(warnKey, 0).catch(() => 0)) + 1;
    await BotConfig.set(warnKey, current);
    const t = tag(mentioned[0]);
    await sock.sendMessage(ctx.remoteJid, {
      text: `⚠️ *AVISO ${current}/${warnLimit}*\n\n${t} advertido.\n📋 ${motivo}`,
      mentions: mentioned,
    }, { quoted: msg });
    if (current >= warnLimit) {
      await tryAct(sock, ctx, reply, async () => {
        await sock.groupParticipantsUpdate(ctx.remoteJid, mentioned, 'remove');
        const banMsg = gs.banMsg || `🚫 ${t} removido após ${warnLimit} avisos.`;
        await sock.sendMessage(ctx.remoteJid, { text: banMsg, mentions: mentioned });
      });
      await BotConfig.set(warnKey, 0);
    }
  });

  registerCase(['rmadv'], async ({ sock, msg, ctx, args, reply }) => {
    if (!await requirePower(sock, ctx, reply, { allowMod: true })) return;
    const mentioned = resolveTargets(msg, args, ctx);
    if (!mentioned.length) return reply('❌ Marca o utilizador.');
    const warnKey = `warn_${ctx.remoteJid}_${numOf(mentioned[0])}`;
    await BotConfig.set(warnKey, 0);
    await reply(`✅ Avisos de ${tag(mentioned[0])} limpos.`);
  });

  // ══════════════════════════════════════════════════════════
  // AUTO-ADM
  // ══════════════════════════════════════════════════════════
  registerCase(['addautoadm', 'autoadm'], async ({ sock, msg, ctx, args, reply }) => {
    if (!await requirePower(sock, ctx, reply)) return;
    const targets = resolveTargets(msg, args, ctx).map(numOf).filter(Boolean);
    if (!targets.length) return reply(`❌ Uso: \`${ctx.prefix}addautoadm @user\`\nQuando entrar, o bot promove-o a admin.`);
    const gs = await gsUp(ctx.remoteJid);
    const set = new Set((gs.autoAdmins || []).map(numOf));
    targets.forEach(n => set.add(n));
    gs.autoAdmins = [...set];
    await gs.save();
    await say(sock, msg, ctx, `🤖 Auto-ADM activo para: ${targets.map(n => '@' + n).join(' ')}\nTotal: *${set.size}*`, targets.map(n => n + '@s.whatsapp.net'));
  });

  registerCase(['addautoadmidia'], async ({ sock, msg, ctx, args, reply }) => {
    if (!await requirePower(sock, ctx, reply)) return;
    const gs = await gsUp(ctx.remoteJid);
    const on = parseOnOff(args[0]);
    gs.autoAdmMedia = on === null ? !gs.autoAdmMedia : on;
    await gs.save();
    await reply(`🖼️ Auto-ADM mídia: ${gs.autoAdmMedia ? '🟢 ON' : '🔴 OFF'}`);
  });

  registerCase(['delautoadm', 'rmautoadm'], async ({ sock, msg, ctx, args, reply }) => {
    if (!await requirePower(sock, ctx, reply)) return;
    const targets = resolveTargets(msg, args, ctx).map(numOf);
    const gs = await gsUp(ctx.remoteJid);
    if (!targets.length) {
      gs.autoAdmins = [];
      await gs.save();
      return reply('🗑️ Lista de auto-ADM limpa.');
    }
    const kill = new Set(targets);
    gs.autoAdmins = (gs.autoAdmins || []).map(numOf).filter(n => !kill.has(n));
    await gs.save();
    await reply(`✅ Removido(s) do auto-ADM. Restam: *${(gs.autoAdmins || []).length}*`);
  });

  registerCase(['listautoadm'], async ({ sock, msg, ctx, reply }) => {
    const gs = await GroupSettings.findOne({ groupJid: ctx.remoteJid }).lean().catch(() => null);
    const list = (gs?.autoAdmins || []).map(numOf).filter(Boolean);
    await say(sock, msg, ctx, `🤖 *AUTO-ADM*\nMídia: ${gs?.autoAdmMedia ? 'ON' : 'OFF'}\n\n` +
      (list.length ? list.map((n, i) => `${i + 1}. @${n}`).join('\n') : '_lista vazia_'), list.map(n => n + '@s.whatsapp.net'),);
  });

  // ══════════════════════════════════════════════════════════
  // PARCERIAS (whitelist antilink de grupos)
  // ══════════════════════════════════════════════════════════
  registerCase(['addparceria', 'parceriaadd'], async ({ sock, msg, ctx, args, reply }) => {
    if (!await requirePower(sock, ctx, reply)) return;
    const val = args.join(' ').trim();
    if (!val) return reply(`❌ Uso: \`${ctx.prefix}addparceria https://chat.whatsapp.com/XXX\``);
    const gs = await gsUp(ctx.remoteJid);
    const set = new Set(gs.parcerias || []);
    set.add(val);
    // também mete domínio na whitelist antilink se for link
    gs.parcerias = [...set];
    if (/chat\.whatsapp\.com/i.test(val)) {
      const wl = new Set(gs.antilinkWhitelist || []);
      wl.add('chat.whatsapp.com');
      gs.antilinkWhitelist = [...wl];
    }
    gs.modoparceria = true;
    await gs.save();
    await reply(`🤝 Parceria adicionada.\nTotal: *${set.size}*\nModo parceria: 🟢`);
  });

  registerCase(['delparceria', 'parceriarem'], async ({ sock, msg, ctx, args, reply }) => {
    if (!await requirePower(sock, ctx, reply)) return;
    const val = args.join(' ').trim();
    const gs = await gsUp(ctx.remoteJid);
    if (!val) {
      gs.parcerias = [];
      await gs.save();
      return reply('🗑️ Parcerias limpas.');
    }
    gs.parcerias = (gs.parcerias || []).filter(p => p !== val && !p.includes(val));
    await gs.save();
    await reply(`✅ Parceria removida. Restam: *${(gs.parcerias || []).length}*`);
  });

  registerCase(['parcerias', 'listparcerias'], async ({ sock, msg, ctx, reply }) => {
    const gs = await GroupSettings.findOne({ groupJid: ctx.remoteJid }).lean().catch(() => null);
    const list = gs?.parcerias || [];
    await reply(`🤝 *PARCERIAS* (${list.length})\n\n` + (list.length ? list.map((p, i) => `${i + 1}. ${p}`).join('\n') : '_nenhuma_'));
  });

  // ══════════════════════════════════════════════════════════
  // X9 / CAPTCHA / ANTITOXIC / AUTOREPO / MULTIPREFIXO
  // ══════════════════════════════════════════════════════════
  for (const [cmds, campo, label] of [
    [['x9', 'espiao', 'espião'], 'x9', '🕵️ *X9*'],
    [['captcha'], 'captcha', '🧩 *CAPTCHA*'],
    [['antitoxic', 'antitoxico'], 'antitoxic', '☠️ *ANTI-TÓXICO*'],
    [['autorepo'], 'autorepo', '♻️ *AUTO-REPO*'],
    [['multiprefixo', 'multiprefix'], 'multiprefixo', '🔣 *MULTI-PREFIXO*'],
  ]) {
    registerCase(cmds, async ({ sock, msg, ctx, args, reply, prefix }) => {
      if (!await requirePower(sock, ctx, reply)) return;
      const gs = await gsUp(ctx.remoteJid);
      const on = parseOnOff(args[0]);
      if (on === null) gs[campo] = !gs[campo];
      else gs[campo] = on;
      await gs.save();
      await reply(`${label} ${gs[campo] ? '🟢 ON' : '🔴 OFF'}\n\`${prefix || '!'}${cmds[0]} on|off\``);
    });
  }

  // ══════════════════════════════════════════════════════════
  // RANK reset
  // ══════════════════════════════════════════════════════════
  registerCase(['resetrank', 'limparrank', 'rankreset'], async ({ sock, msg, ctx, reply }) => {
    if (!await requirePower(sock, ctx, reply)) return;
    const r = await GroupMemberActivity.updateMany(
      { groupJid: ctx.remoteJid },
      { $set: { messages: 0, commands: 0, weeks: {} } },
    );
    await reply(`📊 Rank do grupo limpo.\nDocs afectados: *${r.modifiedCount || r.nModified || 0}*`);
  });

  // ══════════════════════════════════════════════════════════
  // setbammsg / proibir / em / linkgp / emprego / listadd*
  // ══════════════════════════════════════════════════════════
  registerCase(['setbammsg', 'setbanmsg', 'banmsg'], async ({ sock, msg, ctx, args, reply, prefix }) => {
    if (!await requirePower(sock, ctx, reply)) return;
    const gs = await gsUp(ctx.remoteJid);
    const t = args.join(' ').trim();
    if (!t) {
      return reply(`💀 *MSG DE BAN*\nActual: _${(gs.banMsg || 'padrão').slice(0, 120)}_\n\nUso: \`${prefix}setbammsg {user} foi banido de {grupo}\`\nVars: {user} {grupo} {bot}`);
    }
    if (['reset', 'limpar', 'off'].includes(t.toLowerCase())) {
      gs.banMsg = ''; await gs.save();
      return reply('✅ Msg de ban reposta ao padrão.');
    }
    gs.banMsg = t.slice(0, 500); await gs.save();
    await reply(`✅ Msg de ban guardada:\n_${gs.banMsg}_`);
  });

  registerCase(['proibir', 'addproibir'], async ({ sock, msg, ctx, args, reply, prefix }) => {
    if (!await requirePower(sock, ctx, reply)) return;
    const word = args.join(' ').trim().toLowerCase();
    if (!word) return reply(`❌ Uso: \`${prefix}proibir palavra\`\nLista: \`${prefix}palavras\``);
    const gs = await gsUp(ctx.remoteJid);
    const set = new Set((gs.palavrasProibidas || []).map(w => String(w).toLowerCase()));
    set.add(word);
    gs.palavrasProibidas = [...set];
    gs.antipalavra = true;
    await gs.save();
    await reply(`🚫 Palavra proibida: *${word}*\nAnti-palavra: 🟢 ON\nTotal: *${set.size}*`);
  });

  registerCase(['em', 'emojigp', 'setemoji'], async ({ sock, msg, ctx, args, reply, prefix }) => {
    if (!await requirePower(sock, ctx, reply)) return;
    const em = args[0] || '';
    if (!em) return reply(`❌ Uso: \`${prefix}em 🔥\` — define emoji do grupo (guardado no tema/nota).`);
    const gs = await gsUp(ctx.remoteJid);
    gs.groupEmoji = em.slice(0, 8);
    await gs.save();
    await reply(`✅ Emoji do grupo: ${gs.groupEmoji}`);
  });

  registerCase(['linkgp'], async ({ sock, msg, ctx, reply }) => {
    // alias de !link
    if (!await requirePower(sock, ctx, reply)) return;
    try {
      const code = await sock.groupInviteCode(ctx.remoteJid);
      await reply(`🔗 *Link do grupo:*\nhttps://chat.whatsapp.com/${code}`);
    } catch (e) {
      if (/not admin|forbidden|403/i.test(String(e?.message || e))) {
        return reply('⚠️ Preciso ser admin para gerar o link.');
      }
      return reply('❌ ' + String(e?.message || e).slice(0, 120));
    }
  });

  registerCase(['emprego', 'job'], async ({ sock, msg, ctx, args, reply, prefix }) => {
    // atalho para economia: trabalhar OU definir emprego do grupo
    const sub = String(args[0] || '').toLowerCase();
    if (['set', 'definir'].includes(sub)) {
      if (!await requirePower(sock, ctx, reply)) return;
      const nome = args.slice(1).join(' ').trim();
      if (!nome) return reply(`❌ Uso: \`${prefix}emprego set Mineiro\``);
      const gs = await gsUp(ctx.remoteJid);
      gs.empregoNome = nome.slice(0, 40);
      await gs.save();
      return reply(`💼 Emprego do grupo: *${gs.empregoNome}*`);
    }
    // delega visualmente ao work
    try {
      const economy = require('../packages/economy');
      if (typeof economy.trabalhar === 'function') {
        return economy.trabalhar({ sock, msg, ctx, args, reply, prefix });
      }
    } catch {}
    try {
      // fallback: case work via caseHandler recursion avoided — simple reply
      return reply(`💼 Usa \`${prefix}trabalhar\` ou \`${prefix}work\` para ganhar moedas.\nAdmin: \`${prefix}emprego set <nome>\``);
    } catch (e) {
      return reply('❌ ' + e.message);
    }
  });

  registerCase(['listaddd', 'listaddi', 'listadd'], async ({ sock, msg, ctx, reply }) => {
    if (!ctx.isGroup) return reply('👥 Só em grupos.');
    const gs = await GroupSettings.findOne({ groupJid: ctx.remoteJid }).lean().catch(() => null);
    const bl = [...new Set([...(gs?.blacklist || []), ...(gs?.blockedUsers || [])].map(numOf).filter(Boolean))];
    const mods = (gs?.mods || []).map(numOf).filter(Boolean);
    const auto = (gs?.autoAdmins || []).map(numOf).filter(Boolean);
    await say(sock, msg, ctx, `📋 *LISTAS DO GRUPO*\n\n` +
      `🚫 Blacklist (${bl.length}): ${bl.map(n => '@' + n).join(' ') || '—'}\n` +
      `⭐ Mods (${mods.length}): ${mods.map(n => '@' + n).join(' ') || '—'}\n` +
      `🤖 Auto-ADM (${auto.length}): ${auto.map(n => '@' + n).join(' ') || '—'}\n` +
      `🛑 Cmds bloqueados: ${(gs?.blockedCommands || []).join(', ') || '—'}\n` +
      `🧩 Captcha: ${gs?.captcha ? 'ON' : 'OFF'} · 🕵️ X9: ${gs?.x9 ? 'ON' : 'OFF'} · ☠️ Toxic: ${gs?.antitoxic ? 'ON' : 'OFF'}`, [...bl, ...mods, ...auto].map(n => n + '@s.whatsapp.net'),);
  });
};
