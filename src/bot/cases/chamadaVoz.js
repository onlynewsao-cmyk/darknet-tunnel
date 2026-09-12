/**
 * DARK BOT v7.43 — CHAMADAS DE VOZ (VoIP real)
 *
 *   .call [@pessoa]    → liga para ti (PV) ou faz chamada de grupo (até 6)
 *   .tocar <música>    → toca a música na chamada activa
 *   .fala <texto>      → a Aura diz isso na chamada (voz dela)
 *   .pararmusica       → pára o que está a tocar
 *   .desligar          → termina a chamada
 *
 * Também por conversa: "aura liga-me", "toca X na call", "desliga".
 */
'use strict';

const voip = require('../callVoip');

module.exports = function registerChamadaVoz(registerCase) {

  registerCase(['call', 'ligar', 'liga', 'ligame', 'liga-me', 'chamada', 'ligacao'], async ({ sock, msg, ctx, args, reply, react, prefix, isOwner }) => {
    // com NÚMERO → caminho antigo (toca no telemóvel de outra pessoa)
    const numero = String(args?.[0] || '').replace(/\D/g, '');
    if (numero.length >= 9) return require('../caseHandler').runCase('ligarnum', { sock, msg, ctx, args, text: args.join(' '), prefix, isOwner, config: require('../../config') });
    if (!voip.suportado(sock)) return reply('Ainda não consigo ligar daqui — o servidor precisa da lib nova (@systemzero/baileys 1.1.4). Avisa o Dark. 😕');
    const grupo = ctx.isGroup;
    // v7.44: chamadas só a pedido do Dono (qualquer um a pedir "call" ao bot
    // multiplica chamadas automáticas = restrição da Meta).
    if (!isOwner) return reply('Ligar só quando o Dark pede. 😌 Mas podes mandar-me áudio que eu respondo.');
    if (voip.activa(ctx.remoteJid)) return reply('Já estamos em chamada. Diz *' + prefix + 'tocar <música>* ou *' + prefix + 'desligar*.');

    await react('📞');
    const aviso = await sock.sendMessage(ctx.remoteJid, { text: grupo ? 'A ligar para o grupo… entrem! 📞 (máx. 6 pessoas)' : 'A ligar… atende aí! 📞' }, { quoted: msg });
    const r = await voip.ligar(sock, ctx.remoteJid);
    const editar = (t) => sock.sendMessage(ctx.remoteJid, { text: t, edit: aviso?.key }).catch(() => sock.sendMessage(ctx.remoteJid, { text: t }));

    if (!r.ok) {
      await react('❌');
      if (/noutra chamada|limite|espera \d+s/.test(r.motivo)) return editar('Calma, Dark 😅 ' + r.motivo + '. É para não levarmos restrição outra vez.');
      return editar(/atendeu|recusou/.test(r.motivo) ? 'Não atendeste… fica para a próxima. 😕' : 'Não consegui ligar agora. ' + (isOwner ? '(' + r.motivo + ')' : ''));
    }
    await react('✅');
    await editar((grupo ? 'Chamada de grupo aberta! ' : 'Estou na chamada! 🎧 ') + `Pede uma música com *${prefix}tocar nome* ou diz-me o que quiseres ouvir. *${prefix}desligar* para terminar.`);
    // ela cumprimenta na própria chamada
    try {
      const saud = isOwner ? 'Oi, meu Dark. Estou aqui. O que queres ouvir?' : 'Olá! Sou a Aura. Diz-me que música queres que eu toque.';
      setTimeout(() => voip.falar(sock, ctx.remoteJid, saud).catch(() => {}), 1200);
    } catch {}
  });

  registerCase(['tocar', 'tocarcall', 'playcall', 'calltocar'], async ({ sock, msg, ctx, text, reply, react, prefix }) => {
    if (!voip.activa(ctx.remoteJid)) return reply(`Primeiro liga-me: *${prefix}call*. Depois é só pedir a música. 📞`);
    if (!text) return reply(`Qual música? Ex: *${prefix}tocar Shakira Waka Waka*`);
    await react('🔎');
    const st = await sock.sendMessage(ctx.remoteJid, { text: `A procurar "${text}"… um segundo. 🎵` }, { quoted: msg });
    const editar = (t) => sock.sendMessage(ctx.remoteJid, { text: t, edit: st?.key }).catch(() => sock.sendMessage(ctx.remoteJid, { text: t }));
    try {
      const r = await voip.tocarMusica(sock, ctx.remoteJid, text);
      if (!r.ok) { await react('❌'); return editar(/achei/.test(r.motivo) ? 'Não achei essa música. Tenta com o nome do artista. 😕' : /activa|ligada/.test(r.motivo) ? 'A chamada caiu. Liga outra vez com *' + prefix + 'call*.' : 'Não consegui tocar essa agora.'); }
      await react('🎶');
      const m = Math.floor((r.dur || 0) / 60), s = String((r.dur || 0) % 60).padStart(2, '0');
      await editar(`🎶 A tocar agora: *${r.titulo}*${r.dur ? ` (${m}:${s})` : ''}\n\n*${prefix}pararmusica* para parar · *${prefix}tocar outra* para trocar`);
    } catch (e) {
      console.warn('[tocar]', e.message?.slice(0, 80));
      await react('❌');
      await editar('Deu erro a tocar. Vê se a chamada ainda está ligada e tenta outra música.');
    }
  });

  registerCase(['fala', 'falacall', 'dizcall', 'falanacall'], async ({ sock, ctx, text, reply, react, prefix }) => {
    if (!voip.activa(ctx.remoteJid)) return reply(`Não estou em chamada aqui. *${prefix}call* primeiro.`);
    if (!text) return reply(`O que queres que eu diga na chamada? Ex: *${prefix}fala bom dia a todos*`);
    await react('🗣️');
    const r = await voip.falar(sock, ctx.remoteJid, text);
    if (!r.ok) return reply('Não consegui falar agora — a chamada ainda está ligada?');
    await react('✅');
  });

  registerCase(['pararmusica', 'paramusica', 'stopcall', 'pausa', 'para'], async ({ sock, ctx, reply, react, prefix }) => {
    if (!voip.activa(ctx.remoteJid)) return reply('Não há nada a tocar — não estamos em chamada.');
    voip.parar(sock, ctx.remoteJid);
    await react('⏹️');
    return reply(`Parei. Queres outra? *${prefix}tocar nome* 🎵`);
  }, true);

  registerCase(['desligar', 'desliga', 'desligacall', 'endcall', 'terminarchamada'], async ({ sock, ctx, reply, react }) => {
    if (!voip.activa(ctx.remoteJid)) {
      // conversa por notas de voz (callHandler antigo)?
      try { const c = require('../callHandler').terminar(ctx.remoteJid); if (c) return reply('Terminei a nossa conversa de voz. 🖤'); } catch {}
      return reply('Não estamos em chamada.');
    }
    await voip.desligar(sock, ctx.remoteJid);
    await react('📴');
    return reply('Desliguei. Foi bom ouvir-te. 🖤');
  }, true);

  registerCase(['callstatus', 'chamadas', 'callsativas'], async ({ reply, isOwner }) => {
    if (!isOwner) return;
    const t = voip.todas();
    if (!t.length) return reply('Nenhuma chamada activa.');
    return reply('📞 Chamadas activas:\n' + t.map(a => `• ${a.jid.split('@')[0]}${a.grupo ? ' (grupo)' : ''} — ${Math.round((Date.now() - a.desde) / 60000)} min${a.tocando ? ' · a tocar ' + a.tocando : ''}`).join('\n'));
  });
};
