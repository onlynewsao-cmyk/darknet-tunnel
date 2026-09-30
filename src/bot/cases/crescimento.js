'use strict';
/**
 * v12.9.42 — COMANDOS DO SERVIÇO DE CRESCIMENTO 📈 (só dono)
 *  .divulgarbase <texto> [de todos|pais:angola(+brasil)|ddd:244 9|grupo 3]
 *  .divulgarbase (citando foto/vídeo) — divulga a mídia c/ legenda
 *  .convitar <link|nº grupo> [de …]  — convite por PV a segmentos da base
 *  .crescimento          — estado do serviço (fila, pool, janelas)
 *  .crescimento pausar|retomar|parar|cap <n>|esquecer
 */
module.exports = function registerCrescimento(registerCase) {
  const svc = () => require('../crescimento');
  const fmtN = (n) => (n >= 1000 ? (n / 1000).toFixed(1) + 'K' : String(n));
  const only = (isOwner, reply) => isOwner ? true : (reply('👑 O serviço de *crescimento* é SÓ DO DONO.'), false);

  // filtro partilhado: 'de …' nos args
  const filtroDe = (args) => {
    const i = args.findIndex(a => a.toLowerCase() === 'de');
    return i === -1 ? '' : args.slice(i + 1).join(' ').trim();
  };

  registerCase(['divulgarbase', 'massa'], async ({ sock, msg, ctx, args, isOwner, reply }) => {
    if (!only(isOwner, reply)) return;
    const s = svc();
    const filtro = filtroDe(args) || 'todos';
    // mídia citada?
    const q = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const qImg = q?.imageMessage, qVid = q?.videoMessage;
    let buf = null, mimetype = null;
    let texto = args.filter(a => a.toLowerCase() !== 'de').join(' ').trim();
    if (qImg || qVid) {
      try {
        const tipo = qImg ? 'imageMessage' : 'videoMessage';
        const m = qImg || qVid;
        const { downloadContentFromMessage } = require('baileys');
        const stream = downloadContentFromMessage(m, qImg ? 'image' : 'video');
        const chunks = [];
        for await (const ch of stream) chunks.push(ch);
        buf = Buffer.concat(chunks);
        mimetype = m.mimetype || (qImg ? 'image/jpeg' : 'video/mp4');
        if (!texto) texto = m.caption || '';
      } catch (e) { return reply('❌ Não consegui baixar a mídia citada: ' + String(e.message).slice(0, 70)); }
    }
    if (!texto && !buf) return reply(`Uso:\n• \`divulgarbase <texto> [de pais:angola]\`\n• cita uma FOTO/VÍDEO com \`divulgarbase <legenda> [de …]\`\n\nFiltros: \`todos\` · \`pais:angola+brasil\` · \`ddd:244 9\` · \`grupo 3\``);
    // preview do plano ANTES de arrancar
    const alvos = await s._alvos(filtro, { sock, recontactar: false });
    if (!alvos.length) return reply('Nenhum alvo novo nesse filtro (todos contactados <7 dias?). Usa o próximo comando com a base certa.');
    const r = buf
      ? await s.divulgar({ texto, buf, mimetype, filtro, sock })
      : await s.divulgar({ texto, filtro, sock });
    if (!r.ok) return reply('❌ ' + r.erro);
    const pool = r.pool || 1;
    const etaMin = Math.round((alvos.length * 35) / Math.max(1, pool) / 60);
    return reply(`📈 *DIVULGAÇÃO EM MASSA A CORRER*\n\n🎯 alvos: *${fmtN(alvos.length)}* contactos (filtro: ${filtro})\n📱 números no pool: *${pool}* (rodízio automático)\n🚦 ritmo: 20–50s por envio · café a cada 10 · cap ${s.estado().capHora}/h por número\n⏱️ ETA: ~${etaMin} min\n\n> \`.crescimento\` para ver o progresso · \`.crescimento parar\` para abortar${buf ? '\n🖼️ com mídia citada ✓' : ''}`);
  }, true);

  registerCase(['convitar', 'convitebase'], async ({ sock, msg, ctx, args, isOwner, reply }) => {
    if (!only(isOwner, reply)) return;
    const s = svc();
    const alvo0 = String(args[0] || '').trim();
    if (!alvo0) return reply(`Uso: \`convitar <link do grupo | nº do grupo> [de todos|pais:…|grupo 3]\`\nEx.: \`convitar 3 de pais:angola\` — manda o convite do grupo 3 por PV a toda a base angolana.`);
    const filtro = filtroDe(args) || 'todos';
    let link = alvo0, nomeDestino = '';
    if (!/^https:\/\/chat\.whatsapp\.com\//.test(alvo0)) {
      try {
        const all = Object.values(await sock.groupFetchAllParticipating().catch(() => ({})));
        const g = /^\d+$/.test(alvo0) ? all[parseInt(alvo0, 10) - 1] : all.find(x => x.id === alvo0);
        if (!g) return reply('Grupo não encontrado — corre *gruposbot* para ver os números.');
        const code = await sock.groupInviteCode(g.id);
        link = 'https://chat.whatsapp.com/' + code;
        nomeDestino = g.subject || '';
      } catch (e) { return reply('❌ Não consegui o link: ' + String(e.message).slice(0, 70) + '\n( Preciso de ser ADMIN no grupo para gerar convites. )'); }
    }
    const alvos = await s._alvos(filtro, { sock, recontactar: false });
    if (!alvos.length) return reply('Nenhum alvo novo nesse filtro.');
    const r = await s.convitar({ link, nomeDestino, filtro, sock });
    if (!r.ok) return reply('❌ ' + r.erro);
    const pool = r.pool || 1;
    const etaMin = Math.round((alvos.length * 35) / Math.max(1, pool) / 60);
    return reply(`📨 *CONVITES AUTOMÁTICOS A CORRER*\n\n🎯 alvos: *${fmtN(alvos.length)}* (filtro: ${filtro})\n🔗 ${link.slice(0, 60)}…\n📱 pool: *${pool}* números · ⏱️ ETA ~${etaMin} min\n\n> \`.crescimento\` progresso · \`.crescimento parar\` aborta`);
  }, true);

  registerCase(['crescimento', 'growth'], async ({ sock, msg, ctx, args, isOwner, reply }) => {
    if (!only(isOwner, reply)) return;
    const s = svc();
    const sub = String(args[0] || '').toLowerCase();
    if (sub === 'pausar') return reply(s.pausar() ? '⏸️ Campanha PAUSADA — retoma com `crescimento retomar`.' : 'Não há campanha a correr.');
    if (sub === 'retomar' || sub === 'resume') return reply(s.retomar() ? '▶️ Campanha RETOMADA.' : 'Não há campanha pausada.');
    if (sub === 'parar' || sub === 'stop') { const n = s.parar(); return reply(n ? `🛑 ${n} campanha(s) PARADA(S). O que já foi enviado, ficou.` : 'Nada a parar.'); }
    if (sub === 'cap') return reply('🚦 Cap por número/hora: *' + s.definirCap(args[1]) + '*');
    if (sub === 'esquecer') { s.esquecerContactados(); return reply('🧠 Memória de contactados limpa — todos voltam a ser elegíveis.'); }
    const e = s.estado();
    if (!e.activo && !e.fila) {
      return reply(`📈 *SERVIÇO DE CRESCIMENTO*\n\nEstado: *parado* (sem campanhas)\n📱 pool: ${e.pool.length ? e.pool.map(p => p.numero.slice(-4) + ' ' + p.enviadosHora + '/' + p.capHora).join(' · ') : 'só o bot principal (slots vivos entram sozinhos)'}\n🧠 contactados <7d: ${fmtN(e.contactados)}\n✅ campanhas feitas: ${e.jobsFeitos}\n\n> \`divulgarbase <texto> [de …]\` · \`convitar <link|nº> [de …]\``);
    }
    const a = e.activo;
    const pct = a.total ? Math.round((a.cursor / a.total) * 100) : 0;
    return reply(`📈 *CRESCIMENTO — ${a.estado.toUpperCase()}*${a.motivo ? '\n⚠️ ' + a.motivo : ''}\n\nTipo: ${a.tipo} · filtro: ${a.filtro}\n📊 ${a.cursor}/${a.total} (${pct}%)\n✅ enviados: *${a.enviados}* · ❌ falhados: ${a.falhados}${e.fila ? ` · ⏳ na fila: ${e.fila}` : ''}\n📱 pool: ${e.pool.map(p => '+' + p.numero.slice(0, -4) + ' ' + p.enviadosHora + '/' + p.capHora).join(' · ') || '—'}\n\n> retomar · pausar · parar · cap <n> · esquecer`);
  }, true);
};
