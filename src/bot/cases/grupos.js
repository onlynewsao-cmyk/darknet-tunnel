/**
 * DARK BOT v6.39 — Cases de Grupos/ADM REDEFINIDOS
 * ═══════════════════════════════════════════════════
 * 
 * REGRAS DE PODER (v6.39):
 *  ✅ Dono do bot → SEMPRE pode usar comandos de ADM (mesmo sem ser ADM do grupo)
 *  ✅ ADM do grupo → SEMPRE pode usar comandos de ADM
 *  ✅ Bot tenta executar → se falhar por falta de admin, avisa claramente
 *  ✅ Menções usam @número visível (JID normal), nunca LID
 *  ❌ Membro normal → "🚫 Só Dono ou Admins do grupo."
 */
'use strict';

const GroupSettings = require('../../database/models/GroupSettings');
const botConfigCache = require('../botConfigCache');

module.exports = function registerGroupCases(registerCase) {

  // ── Helper para obter metadata fresca ─────────────────────────────
  async function getGroupMeta(sock, ctx) {
    try { return await sock.groupMetadata(ctx.remoteJid); }
    catch { return ctx.groupMeta || null; }
  }

  // ── Helper: o SENDER é dono ou ADM do grupo? ────────────────────
  async function senderIsAdmOrOwner(sock, ctx) {
    // Dono sempre tem poder
    if (ctx.isOwner) return true;
    if (!ctx.isGroup) return false;
    try {
      const meta = await getGroupMeta(sock, ctx);
      if (!meta?.participants) return false;
      const snum = String(ctx.senderNumber || '').replace(/\D/g, '');
      return meta.participants.some(p => {
        const pNum = String(p.id || '').split(':')[0].split('@')[0].replace(/\D/g, '');
        return pNum === snum && (p.admin === 'admin' || p.admin === 'superadmin');
      });
    } catch { return false; }
  }

  // ── Helper: o BOT é admin? (só para info, não bloqueia) ──────────
  async function botIsAdm(sock, ctx) {
    try {
      const meta = await getGroupMeta(sock, ctx);
      if (!meta?.participants?.length) return false;
      const botNum = String(sock.user?.id || '').split(':')[0].split('@')[0];
      if (!botNum) return false;
      const botEntry = meta.participants.find(p => {
        const pNum = String(p.id || '').split(':')[0].split('@')[0];
        return pNum === botNum;
      });
      return !!(botEntry && (botEntry.admin === 'admin' || botEntry.admin === 'superadmin'));
    } catch { return false; }
  }

  // ── Helper: obtém mencionados (JID normal, nunca LID) ────────────
  function getMentions(msg) {
    const raw = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid ||
           msg.message?.interactiveResponseMessage?.contextInfo?.mentionedJid || [];
    // Converte LIDs para JIDs normais se necessário
    return raw.map(jid => {
      // Se é LID (termina com @lid), tenta converter
      if (jid.includes('@lid')) {
        // Não conseguimos converter LID→JID sem API adicional
        // Mas o WhatsApp já resolve internamente ao enviar
        return jid;
      }
      return jid;
    });
  }

  // ── Helper: formata menção visível (@número) ─────────────────────
  function mentionTag(jid) {
    // Extrai o número visível do JID
    const num = String(jid || '').split(':')[0].split('@')[0];
    return `@${num}`;
  }

  // ── Helper: verifica permissão do SENDER (não do bot) ────────────
  async function requireSenderAdmin(sock, ctx, reply) {
    if (!ctx.isGroup) { await reply('👥 Só em grupos.'); return false; }
    if (!await senderIsAdmOrOwner(sock, ctx)) {
      await reply('🚫 Só o *Dono* ou *Admins* do grupo podem usar este comando.');
      return false;
    }
    return true;
  }

  // ── Helper: tenta executar acção admin, avisa se bot não é admin ─
  async function tryAdminAction(sock, ctx, action, reply) {
    try {
      await action();
      return true;
    } catch (e) {
      const errMsg = String(e?.message || e || '');
      if (/not admin|forbidden|403|unauthorized|não.*admin|precisa.*admin/i.test(errMsg)) {
        await reply('⚠️ *Eu não sou admin deste grupo!*\n\nPromove-me a admin para eu poder executar esta acção. 🙏');
      } else {
        await reply('❌ ' + errMsg.slice(0, 200));
      }
      return false;
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // !del — Apaga mensagem citada
  // ══════════════════════════════════════════════════════════════════
  registerCase(['del', 'delete', 'apagar', 'deletar', 'd'], async ({ m, sock, ctx, isOwner, reply }) => {
    if (!ctx.isGroup && !isOwner) return reply('👥 Só em grupos.');
    if (!await senderIsAdmOrOwner(sock, ctx)) return reply('🚫 Só o *Dono* ou *Admins* podem apagar mensagens.');
    if (!m.quoted) return reply('❌ Responde à mensagem que queres apagar.');
    await tryAdminAction(sock, ctx, async () => {
      await sock.sendMessage(ctx.remoteJid, {
        delete: { remoteJid: ctx.remoteJid, id: m.quoted.id, fromMe: false, participant: m.quoted.sender },
      });
      await sock.sendMessage(ctx.remoteJid, { delete: m.key }).catch(() => {});
    }, reply);
  });

  // ══════════════════════════════════════════════════════════════════
  // !hidetag — Menciona todos sem aparecer
  // ══════════════════════════════════════════════════════════════════
  registerCase(['hidetag', 'invisible', 'silent-tag'], async ({ m, sock, ctx, args, isOwner, reply }) => {
    if (!await requireSenderAdmin(sock, ctx, reply)) return;
    try {
      const meta = ctx.groupMeta || await sock.groupMetadata(ctx.remoteJid);
      const mentions = meta.participants.map(p => p.id);
      const txt = args.join(' ') || '📢';
      await sock.sendMessage(ctx.remoteJid, { text: txt, mentions }, { quoted: m });
    } catch (e) { reply('❌ ' + e.message); }
  });

  // ══════════════════════════════════════════════════════════════════
  // !ban / !kick — Remove membro
  // ══════════════════════════════════════════════════════════════════
  registerCase(['ban', 'kick', 'remove'], async ({ m, sock, ctx, isOwner, reply }) => {
    if (!await requireSenderAdmin(sock, ctx, reply)) return;
    const mentioned = getMentions(m.msg || { message: {} });
    if (!mentioned.length) return reply('❌ Marca o utilizador com @.\nEx: `.ban @pessoa`');
    
    // Verifica se está a tentar banir o dono do grupo
    const meta = await getGroupMeta(sock, ctx);
    const ownerJid = meta?.owner || meta?.participants?.find(p => p.admin === 'superadmin')?.id;
    if (ownerJid && mentioned.includes(ownerJid) && !ctx.isOwner) {
      return reply('🚫 Não posso remover o *criador* do grupo!');
    }
    
    const tags = mentioned.map(mentionTag).join(' ');
    await tryAdminAction(sock, ctx, async () => {
      await sock.groupParticipantsUpdate(ctx.remoteJid, mentioned, 'remove');
      await reply(`✅ ${tags} *removido(s)* do grupo.`);
      await sock.sendMessage(ctx.remoteJid, { delete: m.key }).catch(() => {});
    }, reply);
  });

  // ══════════════════════════════════════════════════════════════════
  // !tempban — Remove temporariamente
  // ══════════════════════════════════════════════════════════════════
  registerCase(['tempban', 'tempkick', 'kicktemp'], async ({ m, sock, ctx, args, isOwner, reply }) => {
    if (!await requireSenderAdmin(sock, ctx, reply)) return;
    const mentioned = getMentions(m.msg || {});
    const minutos = parseInt(args.find(a => /^\d+$/.test(a)) || '5');
    if (!mentioned.length) return reply(`❌ Usa: \`${ctx.prefix}tempban @user <minutos>\`\nEx: \`${ctx.prefix}tempban @user 10\``);
    
    const tags = mentioned.map(mentionTag).join(' ');
    await tryAdminAction(sock, ctx, async () => {
      await sock.groupParticipantsUpdate(ctx.remoteJid, mentioned, 'remove');
      await reply(`⏳ ${tags} removido(s) por *${minutos} min*. Voltará automaticamente.`);
      setTimeout(async () => {
        try { await sock.groupParticipantsUpdate(ctx.remoteJid, mentioned, 'add'); } catch {}
      }, minutos * 60 * 1000);
    }, reply);
  });

  // ══════════════════════════════════════════════════════════════════
  // !add — Adiciona membro
  // ══════════════════════════════════════════════════════════════════
  registerCase(['add', 'adicionar', 'addmembro'], async ({ m, sock, ctx, args, isOwner, reply }) => {
    if (!await requireSenderAdmin(sock, ctx, reply)) return;
    const num = args[0]?.replace(/\D/g, '');
    if (!num || num.length < 8) return reply(`❌ Usa: \`${ctx.prefix}add 244XXXXXXXXX\``);
    await tryAdminAction(sock, ctx, async () => {
      const jid = num + '@s.whatsapp.net';
      await sock.groupParticipantsUpdate(ctx.remoteJid, [jid], 'add');
      await reply(`✅ +${num} adicionado ao grupo!`);
    }, reply);
  });

  // ══════════════════════════════════════════════════════════════════
  // !promote — Promove a admin
  // ══════════════════════════════════════════════════════════════════
  registerCase(['promote', 'admin', 'promover'], async ({ m, sock, ctx, isOwner, reply, msg }) => {
    if (!await requireSenderAdmin(sock, ctx, reply)) return;
    let mentioned = getMentions(m.msg || msg || {});
    if (!mentioned.length) {
      // "me adiciona com ADM" / sem @ → o próprio remetente
      try {
        const grupo = require('../../aura/auraGrupo');
        const meta = await getGroupMeta(sock, ctx);
        mentioned = grupo.resolverAlvos(sock, meta, ctx, msg || m.msg || {}, { acao: 'promote', deSi: true });
      } catch {
        mentioned = ctx.senderJid ? [ctx.senderJid] : [];
      }
    }
    if (!mentioned.length) return reply('❌ Marca o utilizador com @, ou diz "me põe admin".');
    const tags = mentioned.map(mentionTag).join(' ');
    await tryAdminAction(sock, ctx, async () => {
      await sock.groupParticipantsUpdate(ctx.remoteJid, mentioned, 'promote');
      await reply(`👑 ${tags} *promovido(s)* a admin!`);
    }, reply);
  });

  // ══════════════════════════════════════════════════════════════════
  // !demote — Remove admin
  // ══════════════════════════════════════════════════════════════════
  registerCase(['demote', 'unadmin', 'rebaixar'], async ({ m, sock, ctx, isOwner, reply }) => {
    if (!await requireSenderAdmin(sock, ctx, reply)) return;
    const mentioned = getMentions(m.msg || {});
    if (!mentioned.length) return reply('❌ Marca o utilizador com @.');
    
    // Não permite rebaixar o criador do grupo
    const meta = await getGroupMeta(sock, ctx);
    const ownerJid = meta?.owner || meta?.participants?.find(p => p.admin === 'superadmin')?.id;
    if (ownerJid && mentioned.includes(ownerJid) && !ctx.isOwner) {
      return reply('🚫 Não posso rebaixar o *criador* do grupo!');
    }
    
    const tags = mentioned.map(mentionTag).join(' ');
    await tryAdminAction(sock, ctx, async () => {
      await sock.groupParticipantsUpdate(ctx.remoteJid, mentioned, 'demote');
      await reply(`⬇️ ${tags} *rebaixado(s)* de admin.`);
    }, reply);
  });

  // ══════════════════════════════════════════════════════════════════
  // !open / !close — Abre ou fecha o grupo
  // ══════════════════════════════════════════════════════════════════
  registerCase(['open', 'abrir', 'abrir-grupo'], async ({ sock, ctx, isOwner, reply }) => {
    if (!await requireSenderAdmin(sock, ctx, reply)) return;
    await tryAdminAction(sock, ctx, async () => {
      await sock.groupSettingUpdate(ctx.remoteJid, 'not_announcement');
      await reply('🔓 Grupo *aberto*! Todos podem enviar mensagens.');
    }, reply);
  });

  registerCase(['close', 'fechar', 'fechar-grupo'], async ({ sock, ctx, isOwner, reply }) => {
    if (!await requireSenderAdmin(sock, ctx, reply)) return;
    await tryAdminAction(sock, ctx, async () => {
      await sock.groupSettingUpdate(ctx.remoteJid, 'announcement');
      await reply('🔒 Grupo *fechado*! Só admins podem enviar.');
    }, reply);
  });

  // ══════════════════════════════════════════════════════════════════
  // !silenciar — Liga/desliga modo só admins
  // ══════════════════════════════════════════════════════════════════
  registerCase(['silenciar', 'mute', 'unmute', 'calar'], async ({ sock, ctx, args, isOwner, reply }) => {
    if (!await requireSenderAdmin(sock, ctx, reply)) return;
    const on = ['on','sim','ligar','ativar','1'].includes((args[0]||'').toLowerCase());
    await tryAdminAction(sock, ctx, async () => {
      await sock.groupSettingUpdate(ctx.remoteJid, on ? 'announcement' : 'not_announcement');
      await reply(on ? '🔇 Grupo *silenciado*! Só admins falam.' : '🔊 Silêncio *removido*! Todos podem falar.');
    }, reply);
  });

  // ══════════════════════════════════════════════════════════════════
  // !revoke — Reseta o link do grupo
  // ══════════════════════════════════════════════════════════════════
  registerCase(['revoke', 'resetlink', 'novo-link'], async ({ sock, ctx, isOwner, reply }) => {
    if (!await requireSenderAdmin(sock, ctx, reply)) return;
    await tryAdminAction(sock, ctx, async () => {
      await sock.groupRevokeInvite(ctx.remoteJid);
      const newCode = await sock.groupInviteCode(ctx.remoteJid);
      await reply(`🔄 Link *renovado*!\nhttps://chat.whatsapp.com/${newCode}`);
    }, reply);
  });

  // ══════════════════════════════════════════════════════════════════
  // !link — Link de convite
  // ══════════════════════════════════════════════════════════════════
  registerCase(['link', 'convite', 'invite'], async ({ sock, ctx, isOwner, reply }) => {
    if (!ctx.isGroup) return reply('👥 Só em grupos.');
    if (!await senderIsAdmOrOwner(sock, ctx)) return reply('🚫 Só o *Dono* ou *Admins* podem ver o link.');
    try {
      const code = await sock.groupInviteCode(ctx.remoteJid);
      await reply(`🔗 *Link do grupo:*\nhttps://chat.whatsapp.com/${code}`);
    } catch (e) {
      if (/not admin|forbidden|403/i.test(e?.message || '')) {
        await reply('⚠️ Preciso ser admin para gerar o link. Promove-me!');
      } else {
        await reply('❌ ' + e.message);
      }
    }
  });

  // ══════════════════════════════════════════════════════════════════
  // !todos / !all — Marca todos (com @número visível)
  // ══════════════════════════════════════════════════════════════════
  registerCase(['todos', 'all', 'everyone', 'marcarall'], async ({ m, sock, ctx, args, isOwner, reply }) => {
    if (!await requireSenderAdmin(sock, ctx, reply)) return;
    try {
      const meta = ctx.groupMeta || await sock.groupMetadata(ctx.remoteJid);
      // Filtra o bot da lista
      const botNum = String(sock.user?.id || '').split(':')[0].split('@')[0];
      const participants = meta.participants.filter(p => {
        const pNum = String(p.id || '').split(':')[0].split('@')[0];
        return pNum !== botNum;
      });
      const mentions = participants.map(p => p.id);
      const txt = (args.join(' ') || '📢 Atenção!') + '\n\n' + mentions.map(j => mentionTag(j)).join(' ');
      await sock.sendMessage(ctx.remoteJid, { text: txt, mentions }, { quoted: m });
    } catch (e) { reply('❌ ' + e.message); }
  });

  // ══════════════════════════════════════════════════════════════════
  // !warn — Advertir membro (com @número visível)
  // ══════════════════════════════════════════════════════════════════
  registerCase(['warn', 'advertir', 'aviso'], async ({ m, sock, ctx, args, isOwner, reply }) => {
    if (!await requireSenderAdmin(sock, ctx, reply)) return;
    const mentioned = getMentions(m.msg || {});
    const motivo = args.filter(a => !a.startsWith('@')).join(' ') || 'Sem motivo especificado';
    if (!mentioned.length) return reply(`❌ Usa: \`${ctx.prefix}warn @user <motivo>\``);

    const gs = await GroupSettings.findOneAndUpdate(
      { groupJid: ctx.remoteJid },
      { $setOnInsert: { groupJid: ctx.remoteJid } },
      { upsert: true, new: true }
    );
    const warnLimit = gs?.warnLimit || 3;
    const BotConfig = require('../../database/models/BotConfig');
    const warnKey = `warn_${ctx.remoteJid}_${mentioned[0].split('@')[0]}`;
    const currentWarns = (await BotConfig.get(warnKey, 0).catch(() => 0)) + 1;
    await BotConfig.set(warnKey, currentWarns);

    const tag = mentionTag(mentioned[0]);
    const txt = `⚠️ *AVISO ${currentWarns}/${warnLimit}*\n\n${tag} foi advertido.\n📋 Motivo: _${motivo}_`;
    await sock.sendMessage(ctx.remoteJid, { text: txt, mentions: mentioned }, { quoted: m });

    if (currentWarns >= warnLimit) {
      await tryAdminAction(sock, ctx, async () => {
        await sock.groupParticipantsUpdate(ctx.remoteJid, mentioned, 'remove');
        await sock.sendMessage(ctx.remoteJid, { text: `🚫 ${tag} removido após ${warnLimit} avisos.`, mentions: mentioned });
      }, reply);
      await BotConfig.set(warnKey, 0);
    }
  });

  // !unwarn — Remove avisos
  registerCase(['unwarn', 'removeaviso', 'clearwarn'], async ({ m, sock, ctx, isOwner, reply }) => {
    if (!await requireSenderAdmin(sock, ctx, reply)) return;
    const mentioned = getMentions(m.msg || {});
    if (!mentioned.length) return reply('❌ Marca o utilizador com @.');
    const BotConfig = require('../../database/models/BotConfig');
    const warnKey = `warn_${ctx.remoteJid}_${mentioned[0].split('@')[0]}`;
    await BotConfig.set(warnKey, 0);
    const tag = mentionTag(mentioned[0]);
    await reply(`✅ Avisos de ${tag} *removidos*.`);
  });

  // !warnings — Ver avisos
  registerCase(['warnings', 'avisos', 'verwarns'], async ({ m, sock, ctx, isOwner, reply }) => {
    if (!ctx.isGroup) return reply('👥 Só em grupos.');
    const mentioned = getMentions(m.msg || {});
    const target = mentioned[0] || ctx.senderJid;
    const BotConfig = require('../../database/models/BotConfig');
    const gs = await GroupSettings.findOne({ groupJid: ctx.remoteJid }).lean().catch(() => null);
    const warnLimit = gs?.warnLimit || 3;
    const warnKey = `warn_${ctx.remoteJid}_${target.split('@')[0]}`;
    const warns = await BotConfig.get(warnKey, 0).catch(() => 0);
    const tag = mentionTag(target);
    await reply(`📋 ${tag}: *${warns}/${warnLimit}* avisos.`);
  });

  // ══════════════════════════════════════════════════════════════════
  // !regras — Mostrar regras do grupo
  // ══════════════════════════════════════════════════════════════════
  registerCase(['regras', 'rules', 'normas'], async ({ sock, ctx, reply }) => {
    if (!ctx.isGroup) return reply('👥 Só em grupos.');
    const gs = await GroupSettings.findOne({ groupJid: ctx.remoteJid }).lean().catch(() => null);
    if (!gs?.rulesText) return reply(`📜 Sem regras definidas.\nAdmin usa: *${ctx.prefix}setregras <texto>*`);
    await reply(`╔━᳀『 📜 REGRAS 』═᳀\n\n${gs.rulesText}\n\n╚═━═━═━═━═━═━═━═᳀`);
  });

  // !setregras — Definir regras
  registerCase(['setregras', 'setrules', 'definirregras'], async ({ sock, ctx, args, isOwner, reply }) => {
    if (!await requireSenderAdmin(sock, ctx, reply)) return;
    const txt = args.join(' ').trim();
    if (!txt) return reply(`❌ Usa: \`${ctx.prefix}setregras <regras do grupo>\``);
    await GroupSettings.findOneAndUpdate(
      { groupJid: ctx.remoteJid },
      { rulesText: txt.slice(0, 1000) },
      { upsert: true, new: true }
    );
    await reply(`✅ Regras definidas!\nUsa *${ctx.prefix}regras* para ver.`);
  });

  // ══════════════════════════════════════════════════════════════════
  // !antilink — Anti-link v2
  // ══════════════════════════════════════════════════════════════════
  registerCase(['antilink'], async ({ sock, ctx, args, prefix, reply }) => {
    if (!await requireSenderAdmin(sock, ctx, reply)) return;
    const gs = await GroupSettings.findOneAndUpdate(
      { groupJid: ctx.remoteJid },
      { $setOnInsert: { groupJid: ctx.remoteJid } },
      { upsert: true, new: true }
    );
    const sub = (args[0] || 'status').toLowerCase();
    let saved = false;
    let extra = '';

    if (['on','ativar','ligar'].includes(sub)) { gs.antilink = true; gs.antilinkOptOut = false; saved = true; }
    else if (['off','desativar','desligar'].includes(sub)) { gs.antilink = false; gs.antilinkOptOut = true; saved = true; }
    else if (['modo','mode'].includes(sub)) {
      const m2 = {'smart':'smart','wa':'whatsapp_only','whatsapp':'whatsapp_only','all':'all_links','todos':'all_links'}[args[1]?.toLowerCase()];
      if (!m2) return reply('❌ Modos: *smart* | *wa* | *all*');
      gs.antilinkMode = m2; saved = true;
    } else if (['acao','action'].includes(sub)) {
      if (!['warn','kick','delete'].includes(args[1]?.toLowerCase())) return reply('❌ Acções: *warn* | *kick* | *delete*');
      gs.antilinkAction = args[1].toLowerCase(); saved = true;
    } else if (['maxwarns','limit'].includes(sub)) {
      const n = parseInt(args[1], 10);
      if (!n || n < 1 || n > 10) return reply('❌ Uso: *' + prefix + 'antilink maxwarns <1-10>*');
      gs.antilinkMaxWarns = n; saved = true;
    } else if (sub === 'delete') {
      const v = (args[1] || '').toLowerCase();
      if (!['on','off'].includes(v)) return reply('❌ Uso: *' + prefix + 'antilink delete on|off*');
      gs.antilinkDeleteMsg = v === 'on'; saved = true;
    } else if (['notify','notificar'].includes(sub)) {
      const v = (args[1] || '').toLowerCase();
      if (!['on','off'].includes(v)) return reply('❌ Uso: *' + prefix + 'antilink notify on|off*');
      gs.antilinkNotify = v === 'on'; saved = true;
    } else if (sub === 'strict') {
      const v = (args[1] || '').toLowerCase();
      if (!['on','off'].includes(v)) return reply('❌ Uso: *' + prefix + 'antilink strict on|off*');
      gs.antilinkStrict = v === 'on'; saved = true;
    } else if (sub === 'vip') {
      const v = (args[1] || '').toLowerCase();
      if (!['on','off'].includes(v)) return reply('❌ Uso: *' + prefix + 'antilink vip on|off*');
      gs.antilinkVipImmune = v === 'on'; saved = true;
    } else if (['whitelist','wl','permitidos'].includes(sub)) {
      const act = (args[1] || 'list').toLowerCase();
      const list = Array.isArray(gs.antilinkWhitelist) ? gs.antilinkWhitelist : [];
      if (act === 'add') {
        const dom = (args[2] || '').toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').trim();
        if (!dom || dom.length < 3) return reply('❌ Uso: *' + prefix + 'antilink whitelist add youtube.com*');
        if (!list.includes(dom)) { list.push(dom); gs.antilinkWhitelist = list; saved = true; }
        extra = `✅ *${dom}* adicionado à whitelist.`;
      } else if (['del','remove','rm'].includes(act)) {
        const dom = (args[2] || '').toLowerCase().trim();
        gs.antilinkWhitelist = list.filter((d) => d !== dom); saved = true;
        extra = `🗑️ *${dom}* removido da whitelist.`;
      } else {
        return reply(
          `📋 *Whitelist de domínios:*\n\n` +
          (list.length ? list.map((d, i) => `${i + 1}. ${d}`).join('\n') : '_(vazia)_') +
          `\n\n➕ *${prefix}antilink whitelist add youtube.com*\n➖ *${prefix}antilink whitelist del youtube.com*`
        );
      }
    } else if (sub === 'status') {
      // mostra o estado actual (em baixo)
    } else {
      return reply(
        `🛡️ *DARKSHIELD ANTI-LINK v2* 🕸️\n\n` +
        `*${prefix}antilink on|off* — ligar/desligar\n` +
        `*${prefix}antilink modo smart|wa|all* — modo de detecção\n` +
        `*${prefix}antilink acao warn|kick|delete* — acção\n` +
        `*${prefix}antilink maxwarns <1-10>* — avisos antes do kick\n` +
        `*${prefix}antilink delete on|off* — apagar msg com link\n` +
        `*${prefix}antilink notify on|off* — avisar no grupo\n` +
        `*${prefix}antilink strict on|off* — links ofuscados\n` +
        `*${prefix}antilink vip on|off* — premium imune\n` +
        `*${prefix}antilink whitelist add|del|list* — domínios permitidos`
      );
    }

    if (saved) await gs.save();

    const st = gs.antilinkStats || {};
    await reply(
      (extra ? extra + '\n\n' : '') +
      `🛡️ *DARKSHIELD ANTI-LINK v2*\n${gs.antilink ? '🟢 ON  ━━━━●' : '🔴 OFF ●━━━━'}\n\n` +
      `⚙️ Modo: *${gs.antilinkMode || 'smart'}* | Acção: *${gs.antilinkAction || 'warn'}*\n` +
      `⚠️ Max avisos: *${gs.antilinkMaxWarns ?? 2}* | Apagar: *${gs.antilinkDeleteMsg !== false ? 'on' : 'off'}*\n` +
      `🔍 Strict (ofuscados): *${gs.antilinkStrict !== false ? 'on' : 'off'}* | VIP imune: *${gs.antilinkVipImmune ? 'on' : 'off'}*\n` +
      `📋 Whitelist: ${(gs.antilinkWhitelist || []).length ? gs.antilinkWhitelist.join(', ') : '—'}\n\n` +
      `📊 Stats: ️ ${st.deleted || 0} apagadas · ⚠️ ${st.warns || 0} avisos · 🚫 ${st.kicks || 0} kicks`
    );
  });

  // !antispam
  registerCase(['antispam'], async ({ sock, ctx, args, prefix, reply }) => {
    if (!await requireSenderAdmin(sock, ctx, reply)) return;
    const gs = await GroupSettings.findOneAndUpdate(
      { groupJid: ctx.remoteJid },
      { $setOnInsert: { groupJid: ctx.remoteJid } },
      { upsert: true, new: true }
    );
    const sub = (args[0]||'toggle').toLowerCase();
    if (['on','ativar'].includes(sub)) { gs.antispam = true; gs.antispamOptOut = false; await gs.save(); }
    else if (['off','desativar'].includes(sub)) { gs.antispam = false; gs.antispamOptOut = true; await gs.save(); }
    else if (sub === 'toggle') { gs.antispam = !gs.antispam; gs.antispamOptOut = !gs.antispam; await gs.save(); } // v7.29: clique no menu alterna
    await reply(`🛡️ *ANTI-SPAM*\n${gs.antispam ? '🟢 ON  ━━━●' : '🔴 OFF ●━━━━'}\n\n> Usa ${prefix}antispam on/off para alternar`);
  });

  // ── !setprefix — prefixo POR GRUPO (só dono) ──────────────────
  registerCase(['setprefix', 'prefixgrupo', 'groupprefix'], async ({ ctx, args, prefix, reply, isOwner }) => {
    if (!ctx.isGroup) return reply('👥 Só em grupos.');
    if (!isOwner) return reply('🚫 Só o *Dono* pode mudar o prefixo do grupo.');
    const pe = require('../prefixEngine');
    const sub = (args[0] || '').toLowerCase();

    if (['reset', 'limpar', 'default', 'global'].includes(sub)) {
      await pe.clearGroupPrefix(ctx.remoteJid);
      const global = await pe.getActivePrefix();
      return reply(`🔄 Prefixo deste grupo *resetado* para o global: *${global}*`);
    }

    const newPrefix = args[0] || '';
    if (!newPrefix || newPrefix.length > 3) {
      return reply(
        `🔑 *Prefixo por grupo*\n\n` +
        `Uso: *${prefix}setprefix <símbolo>*\n` +
        `Ex: *${prefix}setprefix /* → prefixo vira "/" neste grupo\n` +
        `Ex: *${prefix}setprefix reset* → volta ao prefixo global\n\n` +
        `⚠️ Não altera outros grupos. Máx 3 caracteres.`
      );
    }

    try {
      const set = await pe.setGroupPrefix(ctx.remoteJid, newPrefix);
      return reply(
        `✅ *Prefixo deste grupo alterado!*\n\n` +
        `🔑 Novo prefixo: *${set}*\n` +
        `📍 Grupo: *${ctx.groupName || ctx.remoteJid}*\n\n` +
        `Exemplo: *${set}menu* · *${set}play* · *${set}ia*\n\n` +
        `> Outros grupos continuam com o prefixo global.`
      );
    } catch (e) {
      return reply('❌ Erro: ' + e.message);
    }
  });

  // ── !out — Bot sai do grupo (só dono) ─────────────────────────
  registerCase(['out', 'sair', 'leave', 'bye'], async ({ sock, ctx, reply, isOwner, prefix }) => {
    if (!ctx.isGroup) return reply('👥 Só em grupos.');
    if (!isOwner) return reply('🚫 Só o *Dono* pode remover o bot do grupo.');
    const t = await require('../changeThemes').getTheme(
      await require('../botConfigCache').get('active_theme', 'dark').catch(() => 'dark')
    );
    const msg =
      `${t.icon} *${t.name.toUpperCase()} — DESPEDIDA*\n\n` +
      `${t.bullet} Fui chamado de volta às sombras.\n` +
      `${t.bullet} Obrigado por tudo, *${ctx.groupName || 'grupo'}*.\n` +
      `${t.bullet} Até à próxima invocação.\n\n` +
      `> ${t.vibe}`;
    await sock.sendMessage(ctx.remoteJid, { text: msg }).catch(() => {});
    await new Promise(r => setTimeout(r, 2000));
    try { await sock.groupLeave(ctx.remoteJid); } catch (e) {
      return reply('❌ Erro ao sair: ' + e.message);
    }
  });

  // ── !settheme — tema POR GRUPO (só dono) ──────────────────────
  registerCase(['settheme', 'temagrupo', 'grouptheme'], async ({ ctx, args, reply, isOwner, prefix }) => {
    if (!ctx.isGroup) return reply('👥 Só em grupos.');
    if (!isOwner) return reply('🚫 Só o *Dono* pode mudar o tema do grupo.');
    const ct = require('../changeThemes');
    const sub = (args[0] || '').toLowerCase();

    if (['reset', 'limpar', 'default', 'global'].includes(sub)) {
      await GroupSettings.findOneAndUpdate(
        { groupJid: ctx.remoteJid },
        { $unset: { groupTheme: 1 } },
        { upsert: true }
      );
      const global = await require('../botConfigCache').get('active_theme', 'dark').catch(() => 'dark');
      return reply(`🔄 Tema deste grupo *resetado* para o global: *${global}*`);
    }

    if (!sub) {
      const themes = ct.listThemes ? ct.listThemes() : [];
      const list = themes.map((t, i) => `${t.icon} *${t.name}*`).join(' · ');
      return reply(
        `🎨 *Temas disponíveis:*\n\n${list}\n\n` +
        `Uso: *${prefix}settheme <nome>*\n` +
        `Ex: *${prefix}settheme cyber*\n` +
        `Reset: *${prefix}settheme reset*\n\n` +
        `⚠️ Só altera ESTE grupo.`
      );
    }

    const found = ct.getTheme(sub);
    if (!found || found.name !== sub) {
      return reply(`❌ Tema "${sub}" não existe. Usa *${prefix}settheme* para ver a lista.`);
    }

    await GroupSettings.findOneAndUpdate(
      { groupJid: ctx.remoteJid },
      { groupTheme: found.name },
      { upsert: true }
    );
    try { require('../botConfigCache').clear(); } catch {}

    return reply(
      `${found.icon} *Tema deste grupo alterado!*\n\n` +
      `🎨 Novo tema: *${found.name.toUpperCase()}*\n` +
      `📍 Grupo: *${ctx.groupName || ctx.remoteJid}*\n` +
      `> ${found.vibe}\n\n` +
      `⚠️ Outros grupos continuam com o tema global.`
    );
  });

  // !welcome
  registerCase(['welcome', 'boasvindas', 'bv'], async ({ sock, ctx, args, prefix, reply }) => {
    if (!await requireSenderAdmin(sock, ctx, reply)) return;
    const gs = await GroupSettings.findOneAndUpdate(
      { groupJid: ctx.remoteJid },
      { $setOnInsert: { groupJid: ctx.remoteJid } },
      { upsert: true, new: true }
    );
    const sub = (args[0]||'status').toLowerCase();
    let saved = false;
    if (['on','ativar'].includes(sub)) { gs.welcomeEnabled = true; saved = true; }
    else if (['off','desativar'].includes(sub)) { gs.welcomeEnabled = false; saved = true; }
    else if (['texto','set'].includes(sub)) {
      const t = args.slice(1).join(' ').trim();
      if (!t) return reply(`Variáveis: {user} {grupo} {bot}\nEx: *${prefix}welcome texto* Olá {user}!`);
      gs.customWelcomeMsg = t.slice(0,500); saved = true;
    }
    if (saved) await gs.save();
    await reply(`👋 Welcome: ${gs.welcomeEnabled !== false ? '🟢 ON' : '🔴 OFF'}\nTexto: _${(gs.customWelcomeMsg||'padrão').slice(0,50)}_`);
  });

  // ══════════════════════════════════════════════════════════════════
  // !setnomegrupo — Altera nome do grupo
  // ══════════════════════════════════════════════════════════════════
  registerCase(['setnomegrupo', 'nomegp', 'setsubject'], async ({ sock, ctx, args, isOwner, reply }) => {
    if (!await requireSenderAdmin(sock, ctx, reply)) return;
    const name = args.join(' ').trim();
    if (!name) return reply(`❌ Usa: \`${ctx.prefix}setnomegrupo <novo nome>\``);
    await tryAdminAction(sock, ctx, async () => {
      await sock.groupUpdateSubject(ctx.remoteJid, name);
      await reply(`✅ Nome do grupo alterado para *${name}*`);
    }, reply);
  });

  // !setdesc — Altera descrição do grupo
  registerCase(['setdesc', 'setdescricao', 'descgrupo'], async ({ sock, ctx, args, isOwner, reply }) => {
    if (!await requireSenderAdmin(sock, ctx, reply)) return;
    const desc = args.join(' ').trim();
    if (!desc) return reply(`❌ Usa: \`${ctx.prefix}setdesc <descrição>\``);
    await tryAdminAction(sock, ctx, async () => {
      await sock.groupUpdateDescription(ctx.remoteJid, desc);
      await reply('✅ Descrição do grupo alterada!');
    }, reply);
  });

  // !tagadmins — Marca todos os admins
  registerCase(['tagadmins', 'admins', 'marcaradmins'], async ({ m, sock, ctx, reply }) => {
    if (!ctx.isGroup) return reply('👥 Só em grupos.');
    try {
      const meta = ctx.groupMeta || await sock.groupMetadata(ctx.remoteJid);
      const admins = meta.participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin');
      if (!admins.length) return reply('📋 Sem admins detectados.');
      const mentions = admins.map(p => p.id);
      const txt = '👑 *Admins do grupo:*\n\n' + admins.map(p => mentionTag(p.id)).join(' ');
      await sock.sendMessage(ctx.remoteJid, { text: txt, mentions }, { quoted: m });
    } catch (e) { reply('❌ ' + e.message); }
  });
};
