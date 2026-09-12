/**
 * Sistema de Família v2.0 — com GIFs MP4 via Tenor
 */
const Economy = require('../../database/models/Economy');
const { sendWithGif } = require('../gifHelper');

const reply = (sock, msg, ctx, text, mentions = []) =>
  sock.sendMessage(ctx.remoteJid, { text, mentions }, { quoted: msg });

function getMentions(msg) {
  return msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
}

// Pendências em memória (expiram em 5 min)
const pendingProposals = new Map();
const pendingAdoptions = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of pendingProposals) if (now - v.time > 5 * 60 * 1000) pendingProposals.delete(k);
  for (const [k, v] of pendingAdoptions) if (now - v.time > 5 * 60 * 1000) pendingAdoptions.delete(k);
}, 60000);

// Queries GIF para cada momento da família
const GIF = {
  pedido:   'marry',
  casamento:'marry',
  divorcio: 'divorce',
  adocao:   'family',
  expulsar: 'yeet',
  familia:  'family',
  recusa:   'sad',
};

module.exports = {
  async casar({ sock, msg, ctx }) {
    if (!ctx.isGroup) return reply(sock, msg, ctx, '💍 Apenas em grupos!');
    const targets = getMentions(msg);
    if (!targets.length) return reply(sock, msg, ctx, '💍 Marque alguém para casar: *!casar @fulano*');

    const senderNum = ctx.senderNumber;
    const targetNum = targets[0].split('@')[0];
    if (targetNum === senderNum) return reply(sock, msg, ctx, '💀 Não pode casar consigo mesmo!');

    const me = await Economy.getOrCreate(senderNum, ctx.pushName);
    if (me.spouseNumber) return reply(sock, msg, ctx, `💔 Você já é casado com +${me.spouseNumber}!\nUse *!divorciar* antes.`);

    const them = await Economy.getOrCreate(targetNum);
    if (them.spouseNumber) return reply(sock, msg, ctx, `💔 @${targetNum} já é casado(a)!`, [targets[0]]);

    pendingProposals.set(targetNum, { from: senderNum, fromJid: ctx.senderJid, time: Date.now() });

    const text = `╔══ ˚₊‧ 💍 ‧₊˚ ══╗\n║ *PEDIDO DE CASAMENTO*\n║\n║ 💕 @${senderNum}\n║ pediu @${targetNum} em casamento!\n║\n║ @${targetNum}, responda:\n║ ✅ *!aceitar*\n║ ❌ *!recusar*\n║\n║ ⏳ Você tem 5 minutos\n╚══════════════════╝`;
    return sendWithGif(sock, msg, ctx, text, [ctx.senderJid, targets[0]], GIF.pedido);
  },

  async aceitar({ sock, msg, ctx }) {
    const pending = pendingProposals.get(ctx.senderNumber);
    if (!pending) {
      const adoption = pendingAdoptions.get(ctx.senderNumber);
      if (adoption) {
        const me = await Economy.getOrCreate(ctx.senderNumber, ctx.pushName);
        const parent = await Economy.getOrCreate(adoption.from);
        if (!me.parents.includes(adoption.from)) me.parents.push(adoption.from);
        if (!parent.children.includes(ctx.senderNumber)) parent.children.push(ctx.senderNumber);
        await me.save(); await parent.save();
        pendingAdoptions.delete(ctx.senderNumber);
        const text = `╔══ ˚₊‧ 👨‍👩‍👧 ‧₊˚ ══╗\n║ *ADOÇÃO CONCLUÍDA!*\n║\n║ @${adoption.from}\n║ agora é responsável por\n║ @${ctx.senderNumber}! 💕\n╚══════════════════╝`;
        return sendWithGif(sock, msg, ctx, text, [adoption.fromJid, ctx.senderJid], GIF.adocao);
      }
      return reply(sock, msg, ctx, '❌ Você não tem propostas pendentes');
    }

    const me = await Economy.getOrCreate(ctx.senderNumber, ctx.pushName);
    const them = await Economy.getOrCreate(pending.from);
    me.spouseNumber = pending.from; me.marriedAt = new Date();
    them.spouseNumber = ctx.senderNumber; them.marriedAt = new Date();
    await me.save(); await them.save();
    pendingProposals.delete(ctx.senderNumber);

    const text = `╔══ ˚₊‧ 💒 ‧₊˚ ══╗\n║ *CASAMENTO REALIZADO!*\n║\n║ 💕 @${pending.from}\n║   &\n║ 💕 @${ctx.senderNumber}\n║\n║ Agora são casados! 🥂\n║ Felicidades ao casal!\n╚══════════════════╝`;
    return sendWithGif(sock, msg, ctx, text, [pending.fromJid, ctx.senderJid], GIF.casamento);
  },

  async recusar({ sock, msg, ctx }) {
    const pending = pendingProposals.get(ctx.senderNumber);
    if (pending) {
      pendingProposals.delete(ctx.senderNumber);
      const text = `╔══ ˚₊‧ 💔 ‧₊˚ ══╗\n║ *PEDIDO RECUSADO*\n║\n║ @${ctx.senderNumber} recusou\n║ @${pending.from}...\n║\n║ 🥲 Fila do banco do amor\n╚══════════════════╝`;
      return sendWithGif(sock, msg, ctx, text, [ctx.senderJid, pending.fromJid], GIF.recusa);
    }
    const adoption = pendingAdoptions.get(ctx.senderNumber);
    if (adoption) {
      pendingAdoptions.delete(ctx.senderNumber);
      return reply(sock, msg, ctx, `🚫 @${ctx.senderNumber} recusou ser adotado por @${adoption.from}`, [ctx.senderJid, adoption.fromJid]);
    }
    return reply(sock, msg, ctx, '❌ Sem pedidos pendentes');
  },

  async divorciar({ sock, msg, ctx }) {
    const me = await Economy.getOrCreate(ctx.senderNumber, ctx.pushName);
    if (!me.spouseNumber) return reply(sock, msg, ctx, '💔 Você nem é casado, calma aí 😂');
    const spouseNum = me.spouseNumber;
    const them = await Economy.getOrCreate(spouseNum);
    me.spouseNumber = ''; me.marriedAt = null;
    them.spouseNumber = ''; them.marriedAt = null;
    me.coins = Math.max(0, me.coins - 500);
    await me.save(); await them.save();

    const text = `╔══ ˚₊‧ 💔 ‧₊˚ ══╗\n║ *DIVÓRCIO*\n║\n║ @${ctx.senderNumber}\n║ se divorciou de @${spouseNum}\n║\n║ 💸 Pensão: 500 🪙\n╚══════════════════╝`;
    return sendWithGif(sock, msg, ctx, text, [ctx.senderJid, spouseNum + '@s.whatsapp.net'], GIF.divorcio);
  },

  async esposa({ sock, msg, ctx }) {
    const me = await Economy.getOrCreate(ctx.senderNumber, ctx.pushName);
    if (!me.spouseNumber) return reply(sock, msg, ctx, '💔 Você é solteiro(a)! Use *!casar @alguém*');
    const days = me.marriedAt ? Math.floor((Date.now() - me.marriedAt) / 86400000) : 0;
    return reply(sock, msg, ctx, `💍 Casado(a) com @${me.spouseNumber}\n📅 Há ${days} dias juntos 💕`, [me.spouseNumber + '@s.whatsapp.net']);
  },

  async adotar({ sock, msg, ctx }) {
    const targets = getMentions(msg);
    if (!targets.length) return reply(sock, msg, ctx, '👶 Marque alguém: *!adotar @fulano*');
    const targetNum = targets[0].split('@')[0];
    if (targetNum === ctx.senderNumber) return reply(sock, msg, ctx, '🤡 Não pode se adotar!');
    pendingAdoptions.set(targetNum, { from: ctx.senderNumber, fromJid: ctx.senderJid, time: Date.now() });

    const text = `╔══ ˚₊‧ 👶 ‧₊˚ ══╗\n║ *PEDIDO DE ADOÇÃO*\n║\n║ @${ctx.senderNumber}\n║ quer adotar @${targetNum}!\n║\n║ @${targetNum}, responda:\n║ ✅ *!aceitar*\n║ ❌ *!recusar*\n╚══════════════════╝`;
    return sendWithGif(sock, msg, ctx, text, [ctx.senderJid, targets[0]], GIF.adocao);
  },

  async expulsar({ sock, msg, ctx }) {
    const targets = getMentions(msg);
    if (!targets.length) return reply(sock, msg, ctx, '🏃 Marque um filho: *!expulsar @filho*');
    const targetNum = targets[0].split('@')[0];
    const me = await Economy.getOrCreate(ctx.senderNumber, ctx.pushName);
    if (!me.children.includes(targetNum)) return reply(sock, msg, ctx, '❌ Esse não é seu filho!');
    me.children = me.children.filter(x => x !== targetNum);
    const child = await Economy.getOrCreate(targetNum);
    child.parents = child.parents.filter(x => x !== ctx.senderNumber);
    await me.save(); await child.save();

    const text = `╔══ ˚₊‧ 🏃 ‧₊˚ ══╗\n║ *EXPULSO DE CASA*\n║\n║ @${ctx.senderNumber} expulsou\n║ @${targetNum}!\n║ 💔 Que tristeza...\n╚══════════════════╝`;
    return sendWithGif(sock, msg, ctx, text, [ctx.senderJid, targets[0]], GIF.expulsar);
  },

  async familia({ sock, msg, ctx }) {
    const me = await Economy.getOrCreate(ctx.senderNumber, ctx.pushName);
    let text = `╔══ ˚₊‧ 👨‍👩‍👧 ‧₊˚ ══╗\n║ *MINHA FAMÍLIA*\n║\n║ 👤 ${me.nickname || ctx.pushName} (@${ctx.senderNumber})\n`;
    
    if (me.spouseNumber) {
      const spouse = await Economy.getOrCreate(me.spouseNumber);
      text += `║ 💍 Cônjuge: ${spouse.nickname || spouse.name || '@' + me.spouseNumber}\n`;
    } else {
      text += `║ 💔 Solteiro(a)\n`;
    }
    text += `║\n`;
    
    if (me.parents.length) {
      text += `║ 👴 Pais:\n`;
      for (const p of me.parents) {
        const parent = await Economy.findOne({ whatsappNumber: p });
        text += `║   • ${parent?.nickname || parent?.name || '@' + p}\n`;
      }
      text += `║\n`;
    }
    
    if (me.children.length) {
      text += `║ 👶 Filhos:\n`;
      for (const c of me.children) {
        const child = await Economy.findOne({ whatsappNumber: c });
        text += `║   • ${child?.nickname || child?.name || '@' + c}\n`;
      }
    }
    text += `╚══════════════════╝`;

    const mentions = [ctx.senderJid,
      ...me.parents.map(p => p + '@s.whatsapp.net'),
      ...me.children.map(c => c + '@s.whatsapp.net'),
    ];
    if (me.spouseNumber) mentions.push(me.spouseNumber + '@s.whatsapp.net');
    return sendWithGif(sock, msg, ctx, text, mentions, GIF.familia);
  },

  async nomear({ sock, msg, ctx, args }) {
    const targets = getMentions(msg);
    if (!targets.length) return reply(sock, msg, ctx, '✍️ Marque um parente e o nome: *!nomear @parente Nome*');
    
    const targetNum = targets[0].split('@')[0];
    const newName = args.slice(1).join(' ').trim();
    if (!newName) return reply(sock, msg, ctx, '✍️ Digite o nome ou apelido carinhoso.');

    // Filtro de nomes "tontos"
    const badWords = ['burro', 'feio', 'idiota', 'lixo', 'lixo', 'pobre', 'corno', 'gay', 'foda'];
    if (badWords.some(w => newName.toLowerCase().includes(w))) {
      return reply(sock, msg, ctx, '❌ Nome inválido. Escolha um apelido carinhoso e respeitoso! ✨');
    }

    const me = await Economy.getOrCreate(ctx.senderNumber);
    const isSpouse = me.spouseNumber === targetNum;
    const isChild = me.children.includes(targetNum);
    const isParent = me.parents.includes(targetNum);

    if (!isSpouse && !isChild && !isParent) {
      return reply(sock, msg, ctx, '❌ Você só pode dar apelidos para membros da sua família (cônjuge, pais ou filhos)!');
    }

    const them = await Economy.getOrCreate(targetNum);
    them.nickname = newName;
    await them.save();

    return reply(sock, msg, ctx, `✅ Agora @${targetNum} será conhecido na família como: *${newName}*! 💕`, [targets[0]]);
  },
};
