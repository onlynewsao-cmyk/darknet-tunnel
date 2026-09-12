/**
 * DARK BOT v7.30 — C∆P (Capture) — comandos
 * Monitoriza perfis (Instagram) e captura posts/reels/stories → WhatsApp + galeria.
 * Acesso: Dono / SubDono (a lista de alvos é global do bot).
 */
'use strict';

const config = require('../../config');
const cap = require('../../cap/capEngine');

async function tReply(sock, msg, ctx, title, lines) {
  const RE = require('../renderEngine');
  const t = await RE.getTheme(ctx.remoteJid);
  return sock.sendMessage(ctx.remoteJid, { text: RE.renderBlock(t, title, lines.filter(l => l !== null && l !== undefined), { botName: config.bot.name }) }, { quoted: msg });
}

async function isDonoOuSub(ctx, isOwner) {
  if (isOwner || ctx.isOwner || ctx.isSubOwner) return true;
  try {
    const botConfigCache = require('../botConfigCache');
    const extra = await botConfigCache.get('owner_numbers', []).catch(() => []);
    const nums = [config.owner.number, ...(Array.isArray(extra) ? extra : [])].map(n => String(n).replace(/\D/g, ''));
    return nums.includes(String(ctx.senderNumber || '').replace(/\D/g, ''));
  } catch { return false; }
}

function resolveDestino(arg, ctx) {
  if (!arg || /^(aqui|here|este|esse)$/i.test(arg)) return ctx.remoteJid;
  if (/@(g\.us|s\.whatsapp\.net|newsletter|lid)$/.test(arg)) return arg;
  if (/^\d{8,}$/.test(arg)) return `${arg}@s.whatsapp.net`;
  if (/^\d{15,}-?\d*$/.test(arg)) return `${arg}@g.us`;
  return null;
}

function fmtAlvo(t, p) {
  const ultimo = t.lastCheck ? new Date(t.lastCheck).toLocaleString('pt-PT', { timeZone: 'Africa/Luanda' }) : 'nunca';
  const s = t.stats || {};
  return [
    `🎯 *@${t.username}* (${cap.PROVIDERS[t.platform]?.nome || t.platform})${t.nome ? ` — ${t.nome}` : ''}`,
    `   ${t.auto ? '🟢 auto' : '⏸️ pausado'} · a cada ${t.intervaloMin || cap.DEFAULT_INTERVAL_MIN} min · galeria ${t.guardar ? 'ON' : 'OFF'} · stories ${t.stories !== false ? 'ON' : 'OFF'}`,
    `   📤 destinos: ${t.destinos?.length ? t.destinos.map(d => d.split('@')[0]).join(', ') : '— (usa ' + p + 'cap destino @' + t.username + ' aqui)'}`,
    `   📊 baixados ${s.baixados || 0} · falhados ${s.falhados || 0} · enviados ${s.enviados || 0} · última: ${ultimo}${t.lastResult?.erro ? ' ⚠️ ' + t.lastResult.erro.slice(0, 40) : ''}`,
  ];
}

const AJUDA = (p) => [
  '📡 *C∆P — Capture de redes sociais*',
  '_Monitoriza perfis e baixa posts, reels, carrosséis, textos e stories automaticamente._',
  '',
  `▸ ${p}cap add @veigh [aqui|jid] — monitorizar perfil (envia novidades para este chat)`,
  `▸ ${p}cap del @veigh — parar de monitorizar`,
  `▸ ${p}cap lista — alvos e estatísticas`,
  `▸ ${p}cap ver @veigh — perfil + últimos posts`,
  `▸ ${p}cap check [@veigh] — verificar agora (só novos)`,
  `▸ ${p}cap all @veigh [aqui|jid] [limite] — *capture all*: baixa tudo e manda no grupo`,
  `▸ ${p}cap ultimo @veigh — baixa e envia o post mais recente`,
  `▸ ${p}cap link <url> — baixa um post/reel pelo link (funciona mesmo com 429 no perfil)`,
  `▸ ${p}cap reels|highlights|storys @veigh [n] — só esse separador (como no sssinstagram)`,
  `▸ ${p}cap destino @veigh aqui|<jid>|remover — para onde enviar`,
  `▸ ${p}cap guardar @veigh on|off — guardar na galeria do servidor`,
  `▸ ${p}cap auto @veigh on|off · ${p}cap intervalo @veigh <min>`,
  `▸ ${p}cap galeria @veigh [n] — reenvia os últimos n ficheiros guardados`,
  `▸ ${p}cap log — últimas capturas (baixou / falhou / enviou)`,
  `▸ ${p}cap login <sessionid> — sessão IG (stories, highlights, feed completo) · ${p}cap sessoes · ${p}cap testar · ${p}cap logout [@conta|all]`,
  '',
  `> Stories e feed completo exigem sessão. Sem sessão: últimos 12 posts públicos.`,
];

module.exports = function registerCap(registerCase) {
  registerCase(['cap', 'capture', 'captura', 'c∆p'], async ({ sock, msg, ctx, args, isOwner, prefix }) => {
    const p = prefix || config.bot.prefix;
    if (!await isDonoOuSub(ctx, isOwner)) return tReply(sock, msg, ctx, '📡 C∆P', ['❌ Só Dono/SubDono podem gerir capturas.']);
    cap.load();
    const sub = String(args[0] || '').toLowerCase();
    const alvoArg = args[1] || '';

    if (!sub || sub === 'help' || sub === 'ajuda' || sub === 'menu') return tReply(sock, msg, ctx, '📡 C∆P', AJUDA(p));

    // ── login/logout ──
    if (sub === 'login') {
      let sid = args.slice(1).join(' ').trim();
      // aceita "sessionid=xxx" ou cookie inteiro colado
      const mm = sid.match(/sessionid=([^;\s]+)/i); if (mm) sid = mm[1];
      if (!sid) return tReply(sock, msg, ctx, '🔐 C∆P LOGIN', [
        `Uso: ${p}cap login <sessionid>`,
        `Ou:  ${p}cap login <utilizador> <senha>  (só no PV; a senha não é guardada)`,
        `Ou pelo painel web: /dashboard/cap`,
        '',
        '*Como obter o sessionid:*',
        '1️⃣ Cria uma conta Instagram secundária (não a principal).',
        '2️⃣ No Chrome do PC: instagram.com → login → F12 → Application → Cookies → instagram.com → copia o valor de *sessionid*.',
        '3️⃣ No telemóvel: Kiwi Browser / Firefox + extensão "Cookie Editor".',
        '',
        '> Podes adicionar várias contas (pool com rotação — menos 429).',
        '> Alternativa: variável IG_SESSIONID no .env do servidor.',
        '> Fica guardado só na base de dados do bot; a mensagem é apagada.',
      ]);
      try { await sock.sendMessage(ctx.remoteJid, { delete: msg.key }); } catch {}
      // "cap login utilizador senha" → login real; senão trata como sessionid
      if (args.length >= 3 && !/%3A|:/.test(args[1]) && args[1].length < 31) {
        if (ctx.isGroup) return tReply(sock, msg, ctx, '🔐 C∆P LOGIN', ['❌ Login com senha só no PV do bot (a mensagem foi apagada).']);
        await sock.sendMessage(ctx.remoteJid, { text: `🔐 A entrar como @${args[1]}…` }).catch(() => {});
        const lg = await require('../../cap/igLogin').loginComSenha(args[1], args.slice(2).join(' '));
        if (!lg.ok) return tReply(sock, msg, ctx, '🔐 C∆P LOGIN', [`❌ ${lg.erro}`, '', `> Alternativa segura: ${p}cap login <sessionid> (guia: ${p}cap login)`]);
        sid = lg.sid;
      }
      await sock.sendMessage(ctx.remoteJid, { text: '🔐 A validar sessão…' }).catch(() => {});
      const r = await cap.addSessao(sid);
      if (!r.ok) return tReply(sock, msg, ctx, '🔐 C∆P LOGIN', [`❌ ${r.erro}`, '> Copia o cookie de novo (sem espaços) e tenta outra vez.']);
      const n = cap.listSessoes().length;
      return tReply(sock, msg, ctx, '🔐 C∆P LOGIN', [
        r.validado ? `✅ Logado como *@${r.user}*` : `🟡 Sessão guardada sem validar (${r.aviso})`,
        `🔑 Sessões no pool: ${n}`,
        '⏳ Stories, ⭐ highlights, feed completo e perfis privados (que a conta siga) activos.',
        '🗑️ A tua mensagem com o cookie foi apagada.',
      ]);
    }
    if (sub === 'logout') {
      const n = cap.delSessao(args[1] || 'all');
      return tReply(sock, msg, ctx, '🔐 C∆P', [n ? `✅ ${n} sessão(ões) removida(s).` : '❌ Nenhuma sessão para remover.', cap.hasSession('ig') ? `🔑 Restam ${cap.listSessoes().length}` : '⏳ Stories desactivados.']);
    }
    if (sub === 'sessoes' || sub === 'sessões' || sub === 'sessions' || sub === 'contas') {
      const ss = cap.listSessoes();
      if (!ss.length) return tReply(sock, msg, ctx, '🔐 C∆P SESSÕES', ['Nenhuma sessão.', `> ${p}cap login <sessionid>`]);
      return tReply(sock, msg, ctx, '🔐 C∆P SESSÕES', ss.map((x, i) => `${x.ok ? '🟢' : '🔴'} ${i + 1}. @${x.user || '?'}${x.ok ? '' : ' — ' + x.lastErr} · ${new Date(x.addedAt).toLocaleDateString('pt-PT')}`).concat(['', `> ${p}cap logout @conta · ${p}cap logout all`]));
    }
    if (sub === 'testar' || sub === 'test') {
      const ss = cap.sessionsAtivas();
      if (!ss.length) return tReply(sock, msg, ctx, '🔐 C∆P', ['❌ Sem sessões para testar.']);
      const out = [];
      for (const x of ss) { const v = await cap.validarSessao(x.sid); out.push(`${v.ok ? '🟢' : '🔴'} @${x.user || v.user || '?'} — ${v.ok ? 'OK' : v.erro}`); if (!v.ok && !v.temporario) cap.marcarSessaoInvalida(x.sid, v.erro); }
      return tReply(sock, msg, ctx, '🔐 C∆P TESTE', out);
    }

    // ── lista ──
    if (sub === 'lista' || sub === 'list' || sub === 'alvos') {
      const ts = cap.listTargets();
      if (!ts.length) return tReply(sock, msg, ctx, '📡 C∆P — ALVOS', ['Nenhum alvo.', `> ${p}cap add @veigh`]);
      const lines = ts.flatMap(t => [...fmtAlvo(t, p), '']);
      lines.push(`🔐 Sessões IG: ${cap.hasSession('ig') ? '✅ ' + cap.listSessoes().filter(x => x.ok).map(x => '@' + (x.user || '?')).join(', ') : '❌ sem login (stories off, limite 429 baixo)'}`);
      return tReply(sock, msg, ctx, `📡 C∆P — ${ts.length} ALVO(S)`, lines);
    }

    // ── log ──
    if (sub === 'log' || sub === 'historico') {
      const n = Math.min(parseInt(args[1]) || 15, 40);
      const log = cap.state.log.slice(0, n);
      if (!log.length) return tReply(sock, msg, ctx, '📜 C∆P LOG', ['Sem registos ainda.']);
      const ico = { baixado: '✅', parcial: '🟡', falhou: '❌', enviado: '📤', erro: '⚠️' };
      return tReply(sock, msg, ctx, '📜 C∆P LOG', log.map(l => `${ico[l.status] || '•'} ${new Date(l.ts).toLocaleTimeString('pt-PT', { timeZone: 'Africa/Luanda', hour: '2-digit', minute: '2-digit' })} ${l.target.split(':')[1]} ${l.tipo} ${l.item} — ${l.status}${l.detalhe ? ' · ' + String(l.detalhe).slice(0, 60) : ''}`));
    }

    // ── add ──
    if (sub === 'add' || sub === 'seguir' || sub === 'monitorar' || sub === 'monitorizar') {
      if (!alvoArg) return tReply(sock, msg, ctx, '📡 C∆P', [`Uso: ${p}cap add @veigh [aqui|jid]`]);
      const destino = resolveDestino(args[2] || 'aqui', ctx);
      let r;
      try { r = cap.addTarget(alvoArg, { destino, addedBy: ctx.senderNumber }); } catch (e) { return tReply(sock, msg, ctx, '📡 C∆P', [`❌ ${e.message}`]); }
      const t = r.target;
      await sock.sendMessage(ctx.remoteJid, { react: { text: '📡', key: msg.key } }).catch(() => {});
      // validar perfil já
      let perfilInfo = [];
      try {
        const perfil = await cap.PROVIDERS[t.platform].profile(t.username);
        t.userId = perfil.id; t.nome = perfil.nome; t.privado = perfil.privado; t.totalPosts = perfil.posts;
        // 1.ª verificação: marca o histórico como visto (só novidades a partir de agora)
        for (const it of perfil.items) cap.marcarVisto(t.key, it.id);
        t.primed = true; t.lastCheck = Date.now(); cap.save();
        perfilInfo = [
          `👤 ${perfil.nome || '@' + t.username} · ${perfil.seguidores.toLocaleString('pt-PT')} seguidores · ${perfil.posts} posts${perfil.privado ? ' · 🔒 privado' : ''}`,
          `🕒 Último post: ${perfil.items.length ? new Date(perfil.items[perfil.items.length - 1].ts).toLocaleString('pt-PT', { timeZone: 'Africa/Luanda' }) : '—'}`,
        ];
      } catch (e) { perfilInfo = [`⚠️ Não consegui ler o perfil agora: ${e.message}`, '> Fica na lista; o bot tenta de novo na próxima verificação.']; }
      return tReply(sock, msg, ctx, r.novo ? '✅ C∆P — ALVO ADICIONADO' : '📡 C∆P — ALVO ACTUALIZADO', [
        `🎯 @${t.username} (${cap.PROVIDERS[t.platform].nome})`,
        ...perfilInfo,
        `📤 Destino: ${destino === ctx.remoteJid ? 'este chat' : destino}`,
        `⏱️ Verifica a cada ${t.intervaloMin} min · galeria ${t.guardar ? 'ON' : 'OFF'}`,
        cap.hasSession('ig') ? '⏳ Stories: ON' : `⏳ Stories: precisa de ${p}cap login <sessionid>`,
        '',
        `> Novidades a partir de agora chegam aqui. Para puxar o histórico: ${p}cap all @${t.username}`,
      ]);
    }

    // ── del ──
    if (sub === 'del' || sub === 'remover' || sub === 'rm' || sub === 'parar') {
      if (!alvoArg) return tReply(sock, msg, ctx, '📡 C∆P', [`Uso: ${p}cap del @veigh`]);
      return tReply(sock, msg, ctx, '📡 C∆P', [cap.delTarget(alvoArg) ? `🗑️ @${cap.parseTargetArg(alvoArg).username} removido.` : '❌ Alvo não encontrado.']);
    }

    // ── ver ──
    if (sub === 'ver' || sub === 'perfil' || sub === 'info') {
      if (!alvoArg) return tReply(sock, msg, ctx, '📡 C∆P', [`Uso: ${p}cap ver @veigh`]);
      const { platform, username } = cap.parseTargetArg(alvoArg);
      if (!cap.PROVIDERS[platform]) return tReply(sock, msg, ctx, '📡 C∆P', ['❌ Plataforma não suportada (fase 1: Instagram).']);
      try {
        const perfil = await cap.PROVIDERS[platform].profile(username);
        const ult = perfil.items.slice(-6).reverse();
        const reels = perfil.items.filter(i => i.tipo === 'reel');
        const posts = perfil.items.filter(i => i.tipo !== 'reel');
        const fmtN = (n) => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(n);
        const sess = cap.hasSession('ig');
        const lines = [
          `👤 *${perfil.nome || '@' + username}* · @${username}${perfil.privado ? ' 🔒' : ''}`,
          `📸 ${perfil.posts} posts · 👥 ${fmtN(perfil.seguidores)} followers · ➡️ ${fmtN(perfil.seguindo || 0)} following`,
          perfil.bio ? `📝 ${perfil.bio.slice(0, 160).replace(/\n+/g, ' ')}` : null,
          '',
          `📸 POSTS (${posts.length}) · 🎬 REELS (${reels.length}) · ⏳ STORIES (${sess ? 'on' : 'login'}) · ⭐ HIGHLIGHTS (${perfil.highlights || 0}${sess ? '' : ' · login'})`,
          '',
          `🕒 *Últimos ${ult.length}:*`,
          ...ult.map(it => `• ${new Date(it.ts).toLocaleDateString('pt-PT')} ${{ reel: '🎬', video: '🎬', carrossel: '🖼️', post: '📸' }[it.tipo]} ${it.tipo}${it.medias.length > 1 ? ` (${it.medias.length})` : ''} — ${it.caption.slice(0, 40).replace(/\n+/g, ' ') || it.link}`),
          '',
          `▸ ${p}cap reels @${username} · ${p}cap highlights @${username} · ${p}cap all @${username}`,
          cap.getTarget(alvoArg) ? '📡 Este perfil já está a ser monitorizado.' : `> ${p}cap add @${username} para monitorizar`,
        ];
        if (perfil.foto) { try { const f = await cap.baixarMedia({ url: perfil.foto, isVideo: false }); const RE = require('../renderEngine'); const th = await RE.getTheme(ctx.remoteJid); return sock.sendMessage(ctx.remoteJid, { image: f.buffer, caption: RE.renderBlock(th, '📡 C∆P — PERFIL', lines.filter(Boolean), { botName: config.bot.name }) }, { quoted: msg }); } catch {} }
        return tReply(sock, msg, ctx, '📡 C∆P — PERFIL', lines);
      } catch (e) { return tReply(sock, msg, ctx, '📡 C∆P', [`❌ ${e.message}`]); }
    }

    // ── check ──
    if (sub === 'check' || sub === 'verificar' || sub === 'agora') {
      const ts = alvoArg ? [cap.getTarget(alvoArg)].filter(Boolean) : cap.listTargets();
      if (!ts.length) return tReply(sock, msg, ctx, '📡 C∆P', ['❌ Nenhum alvo (ou alvo não encontrado).']);
      await sock.sendMessage(ctx.remoteJid, { react: { text: '🔎', key: msg.key } }).catch(() => {});
      const out = [];
      for (const t of ts) {
        const r = await cap.verificarAlvo(sock, t, { forcar: false });
        if (r.erro) out.push(`⚠️ @${t.username}: ${r.erro}`);
        else if (r.primed) out.push(`📌 @${t.username}: primeira verificação — ${r.marcados} itens marcados como vistos (usa ${p}cap all para puxar).`);
        else out.push(`${r.novos ? '🆕' : '✅'} @${t.username}: ${r.novos} novo(s) · ✅ ${r.baixados} baixado(s) · ❌ ${r.falhados} falhado(s) · 📤 ${r.enviados} enviado(s)${r.stories ? ` · ⏳ ${r.stories} story` : ''}${r.storiesNeedLogin ? ' · stories: sem login' : ''}`);
      }
      return tReply(sock, msg, ctx, '🔎 C∆P — VERIFICAÇÃO', out);
    }

    // ── link: baixa um post/reel pelo URL (funciona mesmo com o perfil em 429) ──
    if (sub === 'link' || sub === 'url' || /^https?:\/\//i.test(sub)) {
      const url = /^https?:\/\//i.test(sub) ? sub : (args[1] || '');
      const m = url.match(/instagram\.com\/(?:[^/]+\/)?(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
      if (!m) return tReply(sock, msg, ctx, '📡 C∆P', [`Uso: ${p}cap link https://www.instagram.com/p/XXXX/`]);
      const shortcode = m[2];
      await sock.sendMessage(ctx.remoteJid, { react: { text: '⬇️', key: msg.key } }).catch(() => {});
      try {
        const alt = await cap.ytdlpItem(`https://www.instagram.com/p/${shortcode}/`);
        const t = { key: 'ig:_links', platform: 'ig', username: alt.uploader || 'instagram', destinos: [], guardar: false, stats: {} };
        const item = { id: `p_${shortcode}`, shortcode, tipo: alt.isVideo ? 'reel' : 'post', ts: alt.ts || Date.now(), caption: alt.caption, link: `https://www.instagram.com/p/${shortcode}/`, medias: [{ url: alt.url, isVideo: alt.isVideo }], username: t.username };
        const r = await cap.processarItem(sock, t, item, { destinos: [ctx.remoteJid], forcar: true, guardar: false });
        if (!r.files) return tReply(sock, msg, ctx, '📡 C∆P', [`❌ Não consegui baixar: ${r.erros.join('; ')}`]);
        return sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } }).catch(() => {});
      } catch (e) { return tReply(sock, msg, ctx, '📡 C∆P', [`❌ ${e.message}`]); }
    }

    // ── ultimo ──
    if (sub === 'ultimo' || sub === 'último' || sub === 'last') {
      if (!alvoArg) return tReply(sock, msg, ctx, '📡 C∆P', [`Uso: ${p}cap ultimo @veigh`]);
      const { platform, username } = cap.parseTargetArg(alvoArg);
      const t = cap.getTarget(alvoArg) || { key: cap.keyOf(platform, username), platform, username, destinos: [], guardar: false, stats: {} };
      try {
        const perfil = await cap.PROVIDERS[platform].profile(username);
        const it = perfil.items[perfil.items.length - 1];
        if (!it) return tReply(sock, msg, ctx, '📡 C∆P', ['❌ Sem posts públicos.']);
        await sock.sendMessage(ctx.remoteJid, { react: { text: '⬇️', key: msg.key } }).catch(() => {});
        const r = await cap.processarItem(sock, t, it, { destinos: [ctx.remoteJid], forcar: true, guardar: !!cap.getTarget(alvoArg)?.guardar });
        if (!r.files) return tReply(sock, msg, ctx, '📡 C∆P', [`❌ Não consegui baixar: ${r.erros.join('; ')}`, it.link]);
        return sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } }).catch(() => {});
      } catch (e) { return tReply(sock, msg, ctx, '📡 C∆P', [`❌ ${e.message}`]); }
    }

    // ── all (capture all) ──
    if (sub === 'all' || sub === 'tudo' || sub === 'captureall') {
      if (!alvoArg) return tReply(sock, msg, ctx, '📡 C∆P', [`Uso: ${p}cap all @veigh [aqui|jid] [limite]`]);
      const destArg = args[2] && !/^\d{1,3}$/.test(args[2]) ? args[2] : 'aqui';
      const limite = Math.min(parseInt(args[3] || (/^\d{1,3}$/.test(args[2] || '') ? args[2] : '')) || 60, 300);
      const destino = resolveDestino(destArg, ctx);
      if (!destino) return tReply(sock, msg, ctx, '📡 C∆P', ['❌ Destino inválido. Usa `aqui` ou um JID (…@g.us).']);
      const { platform, username } = cap.parseTargetArg(alvoArg);
      if (!cap.PROVIDERS[platform]) return tReply(sock, msg, ctx, '📡 C∆P', ['❌ Plataforma não suportada.']);
      const t = cap.getTarget(alvoArg) || cap.addTarget(alvoArg, { addedBy: ctx.senderNumber }).target;
      await tReply(sock, msg, ctx, '📥 C∆P — CAPTURE ALL', [`🎯 @${username} → ${destino === ctx.remoteJid ? 'este chat' : destino}`, `📦 Limite: ${limite} itens`, cap.hasSession('ig') ? '🔐 Sessão IG: feed completo' : '⚠️ Sem sessão: só os últimos 12 posts públicos', '', '⏳ A baixar… envio progresso a cada 5 itens.']);
      let lastMsg = 0;
      const r = await cap.capturarTudo(sock, t, {
        destinos: [destino], limite,
        onProgress: async (i, n) => { if (Date.now() - lastMsg > 15000) { lastMsg = Date.now(); await sock.sendMessage(ctx.remoteJid, { text: `📥 C∆P @${username}: ${i}/${n}…` }).catch(() => {}); } },
      }).catch(e => ({ erro: e.message }));
      if (r.erro) return tReply(sock, msg, ctx, '📥 C∆P — CAPTURE ALL', [`❌ ${r.erro}`]);
      return tReply(sock, msg, ctx, '✅ C∆P — CAPTURE ALL CONCLUÍDO', [
        `🎯 @${username} · ${r.total} itens processados`,
        `✅ Baixados: ${r.baixados} · ❌ Falhados: ${r.falhados} · 📤 Enviados: ${r.enviados}`,
        `💾 ${(r.bytes / 1048576).toFixed(1)} MB${t.guardar ? ` · guardado em galeria` : ''}`,
        r.completo ? '📚 Perfil completo capturado.' : `⚠️ Só os posts visíveis sem login (${r.total}). Para tudo: ${p}cap login <sessionid>`,
        `> Falhas detalhadas em ${p}cap log`,
      ]);
    }

    // ── reels / highlights / stories (baixar só esse separador, como no sssinstagram) ──
    if (['reels', 'highlights', 'destaques', 'storiesnow', 'storys'].includes(sub)) {
      if (!alvoArg) return tReply(sock, msg, ctx, '📡 C∆P', [`Uso: ${p}cap ${sub} @veigh [limite]`]);
      const { platform, username } = cap.parseTargetArg(alvoArg);
      const prov = cap.PROVIDERS[platform];
      if (!prov) return tReply(sock, msg, ctx, '📡 C∆P', ['❌ Plataforma não suportada.']);
      const limite = Math.min(parseInt(args[2]) || 12, 60);
      const t = cap.getTarget(alvoArg) || { key: cap.keyOf(platform, username), platform, username, destinos: [], guardar: false, stats: {} };
      try {
        const perfil = await prov.profile(username);
        let items = []; let aviso = '';
        if (sub === 'reels') items = perfil.items.filter(i => i.tipo === 'reel');
        else if (sub === 'highlights' || sub === 'destaques') { const h = await prov.highlights(perfil.id, username); items = h.items; if (h.needsLogin) aviso = `⭐ Highlights exigem sessão: ${p}cap login <sessionid>`; }
        else { const st = await prov.stories(perfil.id, username); items = st.items; if (st.needsLogin) aviso = `⏳ Stories exigem sessão: ${p}cap login <sessionid>`; }
        if (aviso) return tReply(sock, msg, ctx, '📡 C∆P', [aviso]);
        if (!items.length) return tReply(sock, msg, ctx, '📡 C∆P', [`Nada em ${sub} para @${username}${sub === 'reels' && perfil.hasMore && !cap.hasSession('ig') ? ' (nos últimos 12 posts públicos)' : ''}.`]);
        items = items.slice(-limite);
        await sock.sendMessage(ctx.remoteJid, { react: { text: '⬇️', key: msg.key } }).catch(() => {});
        let okN = 0, failN = 0;
        for (const it of items) { const r = await cap.processarItem(sock, t, it, { destinos: [ctx.remoteJid], forcar: true, guardar: !!cap.getTarget(alvoArg)?.guardar }); if (r.files) okN++; else failN++; }
        return tReply(sock, msg, ctx, `✅ C∆P — ${sub.toUpperCase()} @${username}`, [`✅ ${okN} baixado(s) · ❌ ${failN} falhado(s)`, failN ? `> Detalhes: ${p}cap log` : null]);
      } catch (e) { return tReply(sock, msg, ctx, '📡 C∆P', [`❌ ${e.message}`]); }
    }

    // ── destino ──
    if (sub === 'destino' || sub === 'dest' || sub === 'enviar') {
      const t = cap.getTarget(alvoArg);
      if (!t) return tReply(sock, msg, ctx, '📡 C∆P', [`❌ Alvo não encontrado. Uso: ${p}cap destino @veigh aqui|<jid>|remover`]);
      const val = args[2] || 'aqui';
      if (/^(remover|limpar|clear|off)$/i.test(val)) { cap.setTargetOpt(alvoArg, { destinos: [] }); return tReply(sock, msg, ctx, '📡 C∆P', [`📤 Destinos de @${t.username} limpos (só galeria).`]); }
      const jid = resolveDestino(val, ctx);
      if (!jid) return tReply(sock, msg, ctx, '📡 C∆P', ['❌ Destino inválido.']);
      if (!t.destinos.includes(jid)) t.destinos.push(jid);
      cap.save();
      return tReply(sock, msg, ctx, '📡 C∆P', [`📤 @${t.username} → ${t.destinos.map(d => d.split('@')[0]).join(', ')}`]);
    }

    // ── toggles ──
    if (['guardar', 'galeriaon', 'auto', 'stories', 'story'].includes(sub)) {
      const t = cap.getTarget(alvoArg);
      if (!t) return tReply(sock, msg, ctx, '📡 C∆P', [`❌ Alvo não encontrado. Uso: ${p}cap ${sub} @veigh on|off`]);
      const v = String(args[2] || '').toLowerCase();
      const field = sub === 'guardar' || sub === 'galeriaon' ? 'guardar' : sub === 'auto' ? 'auto' : 'stories';
      const cur = t[field] !== false;
      const nv = v === 'on' ? true : v === 'off' ? false : !cur;
      cap.setTargetOpt(alvoArg, { [field]: nv });
      return tReply(sock, msg, ctx, '📡 C∆P', [`${field === 'guardar' ? '💾 Galeria' : field === 'auto' ? '🔁 Auto' : '⏳ Stories'} de @${t.username}: ${nv ? '🟢 ON' : '🔴 OFF'}`]);
    }
    if (sub === 'intervalo' || sub === 'interval') {
      const t = cap.getTarget(alvoArg);
      const min = parseInt(args[2]);
      if (!t || !min) return tReply(sock, msg, ctx, '📡 C∆P', [`Uso: ${p}cap intervalo @veigh <minutos ≥5>`]);
      cap.setTargetOpt(alvoArg, { intervaloMin: Math.max(5, Math.min(min, 1440)) });
      return tReply(sock, msg, ctx, '📡 C∆P', [`⏱️ @${t.username}: verifica a cada ${Math.max(5, Math.min(min, 1440))} min`]);
    }

    // ── galeria ──
    if (sub === 'galeria' || sub === 'gallery') {
      const { platform, username } = cap.parseTargetArg(alvoArg);
      if (!username) return tReply(sock, msg, ctx, '📡 C∆P', [`Uso: ${p}cap galeria @veigh [n]`]);
      const files = cap.listarGaleria(cap.keyOf(platform, username));
      if (!files.length) return tReply(sock, msg, ctx, '💾 C∆P GALERIA', [`Nada guardado para @${username}.`]);
      const n = Math.min(parseInt(args[2]) || 5, 20);
      await tReply(sock, msg, ctx, '💾 C∆P GALERIA', [`@${username}: ${files.length} ficheiro(s) · ${(files.reduce((a, f) => a + f.bytes, 0) / 1048576).toFixed(1)} MB`, `📤 A enviar os últimos ${Math.min(n, files.length)}…`]);
      const fs = require('fs');
      for (const f of files.slice(0, n)) {
        try {
          const buf = fs.readFileSync(f.path);
          const isVid = /\.mp4$/i.test(f.nome);
          await sock.sendMessage(ctx.remoteJid, isVid ? { video: buf, mimetype: 'video/mp4', caption: `💾 ${f.nome}` } : { image: buf, caption: `💾 ${f.nome}` });
        } catch (e) { await sock.sendMessage(ctx.remoteJid, { text: `❌ ${f.nome}: ${e.message}` }).catch(() => {}); }
      }
      return;
    }

    return tReply(sock, msg, ctx, '📡 C∆P', [`❓ Subcomando "${sub}" desconhecido.`, '', ...AJUDA(p)]);
  });
};
