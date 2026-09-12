/**
 * ⚠️ TRAPAÇAS - SOMENTE DONO
 * Recursos avançados que quebram o jogo
 */
const Economy = require('../../database/models/Economy');
const GameSession = require('../../database/models/GameSession');
const DeletedMessage = require('../../database/models/DeletedMessage');
const botConfigCache = require('../botConfigCache');
const config = require('../../config');

const reply = (sock, msg, ctx, text, mentions = []) =>
  sock.sendMessage(ctx.remoteJid, { text, mentions }, { quoted: msg });

let _lastFlood = 0; // cooldown global do flood (anti-ban)

function getMentions(msg) {
  return msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
}

module.exports = {
  // ============ FORJAR MENSAGEM ============
  async forjar({ sock, msg, ctx, args, isOwner }) {
    if (!isOwner) return reply(sock, msg, ctx, '🚫 Só Dono');
    const targets = getMentions(msg);
    if (!targets.length) return reply(sock, msg, ctx, '👤 Use: !forjar @user <mensagem>');
    const target = targets[0];
    const cleanArgs = args.filter(a => !a.startsWith('@'));
    const text = cleanArgs.join(' ');
    if (!text) return reply(sock, msg, ctx, '❌ Forneça uma mensagem');

    // Cria uma mensagem citada falsa como se fosse a vítima
    const fakeQuoted = {
      key: {
        remoteJid: ctx.remoteJid,
        fromMe: false,
        id: 'FORGED_' + Date.now(),
        participant: target,
      },
      message: { conversation: text },
    };

    await sock.sendMessage(ctx.remoteJid, {
      text: `↑ Mensagem "enviada" por @${target.split('@')[0]}`,
      mentions: [target],
    }, { quoted: fakeQuoted });
    return reply(sock, msg, ctx, `👻 Mensagem forjada como @${target.split('@')[0]}!\n\n_Trapaça do dono_ 😈`, [target, ctx.senderJid]);
  },

  async simular({ sock, msg, ctx, args, isOwner }) {
    if (!isOwner) return reply(sock, msg, ctx, '🚫 Só Dono');
    const targets = getMentions(msg);
    if (!targets.length) return reply(sock, msg, ctx, '👤 Use: !simular @user <comando>');
    const target = targets[0];
    const cleanArgs = args.filter(a => !a.startsWith('@'));
    const cmdText = cleanArgs.join(' ');
    if (!cmdText) return reply(sock, msg, ctx, '❌ Forneça um comando');

    // Cria mensagem fake como se a vítima tivesse mandado
    const fakeMsg = {
      key: {
        remoteJid: ctx.remoteJid,
        fromMe: false,
        id: 'SIM_' + Date.now(),
        participant: target,
      },
      message: { conversation: cmdText },
      pushName: 'Vítima',
    };
    // Reenvia pelo command handler
    const ch = require('../commandHandler');
    await reply(sock, msg, ctx, `🎭 Simulando "${cmdText}" como @${target.split('@')[0]}...`, [target]);
    try { await ch.handle(sock, fakeMsg); } catch (e) {}
  },

  // ============ ANTI-DELETE (ver mensagens apagadas) ============
  async antidelete({ sock, msg, ctx, args, isOwner }) {
    if (!isOwner) return reply(sock, msg, ctx, '🚫 Só Dono');
    const on = args[0]?.toLowerCase() === 'on';
    await botConfigCache.set('antidelete_enabled', on);
    return reply(sock, msg, ctx, on ? '👁️ Anti-delete ATIVADO\n_Mensagens apagadas serão recuperadas_' : '🙈 Anti-delete DESATIVADO');
  },

  async apagadas({ sock, msg, ctx, args, isOwner }) {
    if (!isOwner) return reply(sock, msg, ctx, '🚫 Só Dono');
    const limit = parseInt(args[0]) || 10;
    const filter = ctx.isGroup ? { groupJid: ctx.remoteJid, deletedAt: { $ne: null } } : { deletedAt: { $ne: null } };
    const list = await DeletedMessage.find(filter).sort({ deletedAt: -1 }).limit(limit);
    if (!list.length) return reply(sock, msg, ctx, '🤷 Nenhuma mensagem apagada registrada');
    let text = `👻 *MENSAGENS APAGADAS* (últimas ${list.length})\n\n`;
    for (const m of list) {
      const time = new Date(m.deletedAt).toLocaleString('pt-BR');
      text += `🕐 ${time}\n👤 ${m.fromName || m.fromNumber}\n💬 ${m.text || `[${m.mediaType}]`}\n\n`;
    }
    return reply(sock, msg, ctx, text.slice(0, 4000));
  },

  // ============ ESPIÃO ============
  async espiao({ sock, msg, ctx, args, isOwner }) {
    if (!isOwner) return reply(sock, msg, ctx, '🚫 Só Dono');
    const on = args[0]?.toLowerCase() === 'on';
    await botConfigCache.set('spy_enabled', on);
    return reply(sock, msg, ctx, on ? '🕵️ Espião ATIVO\n_Todas as mensagens vão pro console do dashboard_' : '🙈 Espião DESATIVADO');
  },

  async grupos({ sock, msg, ctx, isOwner }) {
    if (!isOwner) return reply(sock, msg, ctx, '🚫 Só Dono');
    try {
      const chats = await sock.groupFetchAllParticipating();
      const arr = Object.values(chats);
      let text = `📋 *${arr.length} GRUPOS*\n\n`;
      arr.slice(0, 50).forEach((g, i) => {
        text += `${i+1}. *${g.subject}*\n   👥 ${g.participants?.length || 0} membros\n   🆔 \`${g.id}\`\n\n`;
      });
      return reply(sock, msg, ctx, text.slice(0, 4000));
    } catch (e) { return reply(sock, msg, ctx, '❌ ' + e.message); }
  },

  // ============ BROADCAST (mensagem para todos os grupos) ============
  // v7.6 — estava referenciado no menu DONO mas não existia.
  async broadcast({ sock, msg, ctx, args, isOwner }) {
    if (!isOwner) return reply(sock, msg, ctx, '🚫 Só Dono');
    const text = args.join(' ').trim();
    if (!text) return reply(sock, msg, ctx, '📢 Use: !broadcast <mensagem>\nEnvia para TODOS os grupos onde o bot está.');
    try {
      const chats = await sock.groupFetchAllParticipating();
      const arr = Object.values(chats);
      if (!arr.length) return reply(sock, msg, ctx, '📢 O bot não está em nenhum grupo.');
      let ok = 0, falhas = 0;
      for (const g of arr) {
        try {
          await sock.sendMessage(g.id, { text: `📢 *${config.bot?.name || 'DARK BOT'}*\n\n${text}` });
          ok++;
          await new Promise(r => setTimeout(r, 800)); // ritmo anti-ban
        } catch { falhas++; }
      }
      return reply(sock, msg, ctx, `📢 Broadcast concluído.\n✅ Enviado: ${ok} grupos\n❌ Falhou: ${falhas}`);
    } catch (e) { return reply(sock, msg, ctx, '❌ ' + e.message); }
  },

  async ver({ sock, msg, ctx, args, isOwner }) {
    if (!isOwner) return reply(sock, msg, ctx, '🚫 Só Dono');
    const jid = args[0];
    if (!jid) return reply(sock, msg, ctx, '🔍 Use: !ver <jid do grupo>');
    try {
      const meta = await sock.groupMetadata(jid);
      let text = `🔍 *${meta.subject}*\n\n🆔 ${meta.id}\n👥 ${meta.participants.length} membros\n📝 ${meta.desc || 'sem desc'}\n👑 Admins:\n`;
      meta.participants.filter(p => p.admin).forEach(p => text += `  • ${p.id.split('@')[0]}\n`);
      return reply(sock, msg, ctx, text);
    } catch (e) { return reply(sock, msg, ctx, '❌ ' + e.message); }
  },

  // ============ MAGIA NEGRA ============
  async godmode({ sock, msg, ctx, isOwner }) {
    if (!isOwner) return reply(sock, msg, ctx, '🚫 Só Dono');
    const eco = await Economy.getOrCreate(ctx.senderNumber, ctx.pushName);
    eco.coins = 999999999; eco.bank = 999999999;
    eco.level = 999; eco.xp = 0; eco.hp = 99999; eco.maxHp = 99999;
    eco.wins = 9999;
    await eco.save();
    return reply(sock, msg, ctx, `👑 *GODMODE ATIVADO*\n\n💰 Saldo infinito\n⭐ Level 999\n❤️ HP 99999\n\n_Cheating is fun_ 😈`);
  },

  async winforca({ sock, msg, ctx, isOwner }) {
    if (!isOwner) return reply(sock, msg, ctx, '🚫 Só Dono');
    const s = await GameSession.findOne({ groupJid: ctx.remoteJid, game: 'forca', active: true });
    if (!s) return reply(sock, msg, ctx, '🎮 Sem forca ativa');
    return reply(sock, msg, ctx, `👁️ *Resposta:* *${s.state.word}*\n💡 Dica: ${s.state.hint}\n\n_Trapaça ativada_ 😈`);
  },

  async winquiz({ sock, msg, ctx, isOwner }) {
    if (!isOwner) return reply(sock, msg, ctx, '🚫 Só Dono');
    const s = await GameSession.findOne({ groupJid: ctx.remoteJid, game: 'quiz', active: true });
    if (!s) return reply(sock, msg, ctx, '🎮 Sem quiz ativo');
    return reply(sock, msg, ctx, `👁️ *Resposta:* *${s.state.correct + 1}. ${s.state.options[s.state.correct]}*`);
  },

  async winadivinha({ sock, msg, ctx, isOwner }) {
    if (!isOwner) return reply(sock, msg, ctx, '🚫 Só Dono');
    const s = await GameSession.findOne({ groupJid: ctx.remoteJid, game: 'adivinha', active: true });
    if (!s) return reply(sock, msg, ctx, '🎮 Sem jogo ativo');
    return reply(sock, msg, ctx, `👁️ *Número:* *${s.state.number}*`);
  },

  // ============ TROLLAGEM ============
  async fakeban({ sock, msg, ctx, args, isOwner }) {
    if (!isOwner) return reply(sock, msg, ctx, '🚫 Só Dono');
    const targets = getMentions(msg);
    if (!targets.length) return reply(sock, msg, ctx, '👻 Use: !fakeban @user');
    const target = targets[0];
    return reply(sock, msg, ctx,
      `🚫 *USUÁRIO REMOVIDO*\n\n` +
      `👤 @${target.split('@')[0]} foi banido do grupo!\n` +
      `🤡 _(é mentira, calma)_`, [target]);
  },

  async fakelog({ sock, msg, ctx, args, isOwner }) {
    if (!isOwner) return reply(sock, msg, ctx, '🚫 Só Dono');
    const text = args.join(' ') || 'login no servidor';
    const fakes = [
      `🔐 ALERTA: alguém tentou ${text}`,
      `⚠️ Acesso suspeito detectado: ${text}`,
      `🚨 Hackeamento em andamento: ${text}`,
    ];
    return reply(sock, msg, ctx, `🖥️ *SYSTEM LOG*\n\n${fakes[Math.floor(Math.random()*fakes.length)]}\n\n_Apenas trolagem 😈_`);
  },

  async forcareacao({ sock, msg, ctx, args, isOwner }) {
    if (!isOwner) return reply(sock, msg, ctx, '🚫 Só Dono');
    const emoji = args[0] || '❤️';
    const quoted = msg.message?.extendedTextMessage?.contextInfo;
    if (!quoted?.stanzaId) return reply(sock, msg, ctx, '↩️ Responda uma mensagem!');
    await sock.sendMessage(ctx.remoteJid, {
      react: { text: emoji, key: { remoteJid: ctx.remoteJid, fromMe: false, id: quoted.stanzaId, participant: quoted.participant } }
    });
    return reply(sock, msg, ctx, `✅ Reação ${emoji} forçada`);
  },

  // ============ ENVIO REMOTO ============
  async send({ sock, msg, ctx, args, isOwner }) {
    if (!isOwner) return reply(sock, msg, ctx, '🚫 Só Dono');
    const num = args.shift();
    const text = args.join(' ');
    if (!num || !text) return reply(sock, msg, ctx, '📤 Use: !send <num> <mensagem>');
    try {
      const jid = num.replace(/\D/g,'') + '@s.whatsapp.net';
      await sock.sendMessage(jid, { text });
      return reply(sock, msg, ctx, `✅ Enviado para ${num}`);
    } catch (e) { return reply(sock, msg, ctx, '❌ ' + e.message); }
  },

  async sendgroup({ sock, msg, ctx, args, isOwner }) {
    if (!isOwner) return reply(sock, msg, ctx, '🚫 Só Dono');
    const jid = args.shift();
    const text = args.join(' ');
    if (!jid || !text) return reply(sock, msg, ctx, '📤 Use: !sendgroup <jid> <mensagem>');
    try {
      await sock.sendMessage(jid, { text });
      return reply(sock, msg, ctx, `✅ Enviado`);
    } catch (e) { return reply(sock, msg, ctx, '❌ ' + e.message); }
  },

  // ============ COMANDO ARBITRÁRIO ============
  async eval({ sock, msg, ctx, args, isOwner }) {
    if (!isOwner) return reply(sock, msg, ctx, '🚫 Só Dono');
    const code = args.join(' ');
    if (!code) return reply(sock, msg, ctx, '⚡ Use: !eval <código JS>');
    try {
      // eslint-disable-next-line no-new-func
      const result = await eval(`(async () => { ${code} })()`);
      return reply(sock, msg, ctx, `✅ Resultado:\n\`\`\`\n${String(result).slice(0,2000)}\n\`\`\``);
    } catch (err) { return reply(sock, msg, ctx, `❌ ${err.message}`); }
  },

  async shell({ sock, msg, ctx, args, isOwner }) {
    if (!isOwner) return reply(sock, msg, ctx, '🚫 Só Dono');
    const cmd = args.join(' ');
    if (!cmd) return reply(sock, msg, ctx, '🐚 Use: !shell <comando>');
    const { exec } = require('child_process');
    exec(cmd, { timeout: 10000 }, (err, stdout, stderr) => {
      const out = (stdout || stderr || err?.message || 'sem output').slice(0, 3000);
      reply(sock, msg, ctx, `🐚 *Output:*\n\`\`\`\n${out}\n\`\`\``);
    });
  },

  // ============ FLOOD (só Dono, com travões anti-ban) ============
  async flood({ sock, msg, ctx, args, isOwner }) {
    if (!isOwner) return reply(sock, msg, ctx, '🚫 Só Dono');
    const n = parseInt(args[0]);
    const text = args.slice(1).join(' ').trim();
    if (!Number.isFinite(n) || n < 1 || !text) {
      return reply(sock, msg, ctx, '💦 Use: !flood <nº> <mensagem>\n⛔ Máximo: 5 mensagens (anti-ban)');
    }
    const agora = Date.now();
    if (agora - _lastFlood < 20000) {
      return reply(sock, msg, ctx, '⏳ Flood em cooldown. Espera ~20s entre floods (protege o número).');
    }
    const total = Math.min(n, 5);
    _lastFlood = agora;
    for (let i = 0; i < total; i++) {
      await sock.sendMessage(ctx.remoteJid, { text });
      await new Promise(r => setTimeout(r, 1200));
    }
    return reply(sock, msg, ctx, `💦 ${total} mensagens enviadas.`);
  },
};
