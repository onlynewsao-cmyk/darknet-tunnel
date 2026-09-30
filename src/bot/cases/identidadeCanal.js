'use strict';
/**
 * v7.93 — IDENTIDADE (Dono): trocar link do canal + selo verificado.
 *  !setcanal <url>        → muda o link em menu/premium/botões...
 *  !setcanal off          → volta ao link padrão
 *  !canalinfo             → mostra o link actual
 *  !setselo <nome>|<num>  → muda o contacto "verificado ✓"
 *  !selo / !verificado    → envia o contacto verificado actual
 */
module.exports = function registerIdentidade(registerCase) {

  registerCase(['setcanal', 'mudarcanal', 'setlinkcanal'], async ({ sock, msg, ctx, args, isOwner }) => {
    if (!isOwner) return sock.sendMessage(ctx.remoteJid, { text: '🚫 Só o *Dono* muda o canal.' }, { quoted: msg });
    const id = require('../identidadeCanal');
    const raw = args.join(' ').trim();
    try {
      if (!raw || raw === 'off' || raw === 'padrao' || raw === 'padrão') {
        await id.setCanal('');
        return sock.sendMessage(ctx.remoteJid, { text: '🗑️ *Link do canal APAGADO* — não aparece no .canal, no rodapé das respostas nem nos botões.\n> Para pôr outro: `!setcanal <link>`' }, { quoted: msg });
      }
      if (!/^https?:\/\//i.test(raw)) return sock.sendMessage(ctx.remoteJid, { text: '❌ Uso: `!setcanal https://whatsapp.com/channel/XXXX...` (ou `off`)' }, { quoted: msg });
      await id.setCanal(raw);
      return sock.sendMessage(ctx.remoteJid, { text: `✅ *CANAL ACTUALIZADO*\n\n${raw}\n\n> Já usa em: menu 📡, !premium, botões de canal, etc.` }, { quoted: msg });
    } catch (e) {
      return sock.sendMessage(ctx.remoteJid, { text: '❌ Falha: ' + e.message }, { quoted: msg });
    }
  });

  registerCase(['canalinfo', 'linkcanal'], async ({ sock, msg, ctx }) => {
    const id = require('../identidadeCanal');
    const link = await id.canalLink();
    return sock.sendMessage(ctx.remoteJid, { text: `📡 *CANAL ACTUAL*\n\n${link}` }, { quoted: msg });
  });

  registerCase(['setselo', 'setverificado', 'setcontacto'], async ({ sock, msg, ctx, args, isOwner }) => {
    if (!isOwner) return sock.sendMessage(ctx.remoteJid, { text: '🚫 Só o *Dono* muda o selo.' }, { quoted: msg });
    const id = require('../identidadeCanal');
    const raw = args.join(' ').trim();
    try {
      if (!raw || raw === 'off' || raw === 'padrao' || raw === 'padrão') {
        await id.setSelo(id.SELO_DEF.nome, id.SELO_DEF.numero);
        return sock.sendMessage(ctx.remoteJid, { text: `✓ Selo de volta ao padrão: *${id.SELO_DEF.nome}* (${id.SELO_DEF.numero})` }, { quoted: msg });
      }
      // formato: NOME | NÚMERO   (o número pode vir com + e espaços)
      const [nomeP, numP] = raw.split('|').map(x => (x || '').trim());
      if (numP && !/^\d{6,}$/.test(numP.replace(/\D/g, ''))) {
        return sock.sendMessage(ctx.remoteJid, { text: '❌ Número inválido. Uso: `!setselo DARK BOT ✓ | 2449xxxxxxxx`' }, { quoted: msg });
      }
      const atual = await id.selo();
      const nome = nomeP || atual.nome;
      const numero = (numP || '').replace(/\D/g, '') || atual.numero;
      await id.setSelo(nome, numero);
      await sock.sendMessage(ctx.remoteJid, { text: `✅ *SELO ACTUALIZADO* — ${nome} (${numero})` }, { quoted: msg });
      return id.enviarSelo(sock, ctx.remoteJid, nome, numero, msg);
    } catch (e) {
      return sock.sendMessage(ctx.remoteJid, { text: '❌ Falha: ' + e.message }, { quoted: msg });
    }
  });

  // v7.94 — DESCRIÇÃO GERAL (About/estado) do bot: aparece em todo o lado
  registerCase(['setbio', 'setabout', 'setdescgeral'], async ({ sock, msg, ctx, args, isOwner }) => {
    if (!isOwner) return sock.sendMessage(ctx.remoteJid, { text: '🚫 Só o *Dono* edita a descrição geral.' }, { quoted: msg });
    const texto = args.join(' ').trim();
    try {
      if (!texto || texto === 'off' || texto === 'padrao' || texto === 'padrão') {
        return sock.sendMessage(ctx.remoteJid, { text: '❌ Uso: `!setbio <texto da descrição geral>` — fica visível no perfil do bot.' }, { quoted: msg });
      }
      await sock.updateProfileStatus(texto);
      return sock.sendMessage(ctx.remoteJid, { text: `✅ *DESCRIÇÃO GERAL ACTUALIZADA*\n\n"${texto}"\n\n> Visível no perfil do bot {{E em todo o lado onde o número aparece}}.` }, { quoted: msg });
    } catch (e) {
      return sock.sendMessage(ctx.remoteJid, { text: '❌ Falha ao editar a descrição: ' + e.message }, { quoted: msg });
    }
  });

  // ═══ v12.9.41: MANDAR STATUS NO CANAL ═══
  // .statuscanal <texto>            → publica o status no canal do bot (com assinatura ✓)
  // .statuscanal <texto> (citando)  → republica imagem/vídeo no canal com legenda
  registerCase(['statuscanal', 'postcanal'], async ({ sock, msg, ctx, args, isOwner }) => {
    if (!isOwner) return sock.sendMessage(ctx.remoteJid, { text: '🚫 Só o *Dono* publica no canal.' }, { quoted: msg });
    const canais = require('../../aura/auraCanais');
    const canal = await canais.meuCanal();
    if (!canal?.jid) return sock.sendMessage(ctx.remoteJid, { text: '❌ O bot não tem canal activo. Cria/gere com a *Aura* ou guarda o canal primeiro.' }, { quoted: msg });
    const id = require('../identidadeCanal');
    const selo = await id.selo();
    const assinatura = '\n\n\u2713 ' + selo.nome;
    const texto = args.join(' ').trim();
    try {
      // mídia citada → republica com legenda
      const q = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      const qImg = q?.imageMessage, qVid = q?.videoMessage;
      if (qImg || qVid) {
        const tipo = qImg ? 'image' : 'video';
        const m = qImg || qVid;
        const { downloadContentFromMessage } = require('baileys');
        const stream = downloadContentFromMessage(m, tipo);
        const chunks = [];
        for await (const ch of stream) chunks.push(ch);
        const buf = Buffer.concat(chunks);
        const legenda = (texto || m.caption || '') + assinatura;
        const pacote = tipo === 'image' ? { image: buf, caption: legenda } : { video: buf, caption: legenda, mimetype: m.mimetype || 'video/mp4' };
        await sock.sendMessage(canal.jid, pacote);
        return sock.sendMessage(ctx.remoteJid, { text: '✅ *STATUS publicado no canal* 📡\n' + String(canal.name || '').slice(0, 50) + '\n\n✓ assinado como ' + selo.nome }, { quoted: msg });
      }
      if (!texto) {
        return sock.sendMessage(ctx.remoteJid, { text: 'Uso:\n• `statuscanal <texto>` — publica texto no canal\n• `statuscanal <texto>` CITANDO uma foto/vídeo — publica a mídia\n\n📡 Canal activo: ' + String(canal.name || canal.jid).slice(0, 50) }, { quoted: msg });
      }
      await sock.sendMessage(canal.jid, { text: texto + assinatura });
      return sock.sendMessage(ctx.remoteJid, { text: '✅ *STATUS publicado no canal* 📡\n' + String(canal.name || '').slice(0, 50) + '\n\n✓ assinado como ' + selo.nome }, { quoted: msg });
    } catch (e) {
      return sock.sendMessage(ctx.remoteJid, { text: '❌ Falha ao publicar: ' + String(e?.message || e).slice(0, 100) }, { quoted: msg });
    }
  }, true);

  // ═══ v12.9.41: STATUSPG — estado do bot no chat (página web: /status) ═══
  registerCase(['statuspg', 'statuspage'], async ({ sock, msg, ctx }) => {
    const id = require('../identidadeCanal');
    const selo = await id.selo();
    let st = {}, up = 0, msgs = 0, ram = 0;
    try { const b = require('../whatsapp').getBot().getStatus(); st = b; up = b.uptime || 0; msgs = b.messageCount || 0; } catch {}
    try { ram = Math.round(process.memoryUsage().rss / 1048576); } catch {}
    const base = require('../centralBase').stats();
    const fmtU = (s) => { const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60); return (d ? d + 'd ' : '') + h + 'h ' + m + 'm'; };
    const txt = [
      '📊 *STATUS DO BOT*',
      '',
      (/connected/i.test(st.status || '') ? '🟢 *ONLINE*' : '🔴 ' + (st.status || 'offline')),
      '⏱️ uptime: *' + fmtU(up) + '*',
      '✓ ' + selo.nome,
      '👑 Dono: ✓ ' + (require('../../config').owner?.name || selo.nome),
      '',
      '💬 mensagens: *' + msgs + '*',
      '📇 base: *' + (base.total || 0).toLocaleString('pt-PT') + '* contactos · 📋 ' + (base.nGrupos || 0) + ' grupos',
      '🧠 RAM: *' + ram + ' MB*',
      '📡 canal: ' + (await id.canalLink()),
      '',
      '🖥️ página de status: */status*',
    ].join('\n');
    return sock.sendMessage(ctx.remoteJid, { text: txt }, { quoted: msg });
  }, true);

  registerCase(['selo', 'verificado', 'contacto'], async ({ sock, msg, ctx }) => {
    const id = require('../identidadeCanal');
    const s = await id.selo();
    await id.enviarSelo(sock, ctx.remoteJid, s.nome, s.numero, msg);
    return sock.sendMessage(ctx.remoteJid, { text: `🪪 *Contacto verificado:* ${s.nome}\n> Muda com \`!setselo <nome>|<número>\` (Dono)` }, { quoted: msg });
  });
};
