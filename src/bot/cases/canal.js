'use strict';
/**
 * DARK BOT v7.60 — Gestão de CANAIS (motor AURA ⚡)
 *
 * Expõe para comandos aquilo que a Aura já sabia fazer por IA
 * (src/aura/auraCanais.js + auraAgenda.js): postar, info, stats,
 * criar, adotar, renomear, foto, agendar, perguntar, seguir/deixar.
 *
 * Leitura (info/stats/meu/agenda/respostas): todos.
 * Escrita (postar/criar/nome/foto/...): só dono.
 */

function canais() { return require('../../aura/auraCanais'); }

async function alvoMeu() {
  try {
    const meu = await canais().meuCanal();
    return meu?.jid || null;
  } catch { return null; }
}

function fmtResult(r) {
  if (!r) return '❌ Sem resposta do motor.';
  if (r.ok === false) return '❌ ' + (r.msg || 'Falhou.');
  if (r.msg) return '✅ ' + r.msg;
  if (typeof r === 'string') return r;
  return '✅ Feito.';
}

module.exports = function registerCanalCases(registerCase) {
  registerCase(['canal', 'canais', 'channel'], async ({ sock, m, msg, ctx, args, text, prefix, isOwner, reply }) => {
    let sub = String(args[0] || '').toLowerCase();
    let resto = (text || '').slice((args[0] || '').length).trim();
    const C = canais();
    // v7.76 SUPER — alvo por comando: `!canal @2 postar ...` / `!canal @loja stats`
    let alvoRef = null;
    if (/^[@#]/.test(sub) && args[1]) {
      // v7.77: vários casam → lista para desempatar (re-executa com @N)
      const matches = await C.procurarCanais(sub).catch(() => []);
      if (!matches?.length) return reply(`❌ Não achei o canal \`${args[0]}\`. Vê: \`${prefix}canal lista\``);
      if (matches.length > 1) {
        const d = await C.listarCanais().catch(() => ({ lista: [] }));
        const linhas = matches.map((mch) => {
          const n = (d.lista || []).findIndex(c => c.jid === mch.jid) + 1;
          return `*${n}.* ${mch.name || 'Canal'} _(via \`@${n}\`)_`;
        });
        return reply(`🔍 *${matches.length} canais* casam com \`${args[0]}\`:\n\n${linhas.join('\n')}\n\n> Sê específico: \`${prefix}canal @<nº> ${args.slice(1).join(' ')}\``);
      }
      alvoRef = matches[0].jid;
      const i0 = (text || '').indexOf(args[0]);
      const i1 = (text || '').indexOf(args[1], i0 + String(args[0]).length);
      resto = (text || '').slice(i1 + String(args[1]).length).trim();
      sub = String(args[1] || '').toLowerCase();
    }
    const escolherAlvo = async () => alvoRef || alvoMeu();

    const HELP =
      `📢 *AURA CANAIS* ⚡\n\n` +
      `*Leitura (todos):*\n` +
      `• \`${prefix}canal meu\` — qual o canal ativo\n` +
      `• \`${prefix}canal lista\` — todos os canais\n` +
      `• \`${prefix}canal painel\` — dashboard: seguidores + agendados\n` +
      `• \`${prefix}canal info\` — dados do canal\n` +
      `• \`${prefix}canal stats\` — estatísticas\n` +
      `• \`${prefix}canal agenda\` — posts agendados\n` +
      `• \`${prefix}canal respostas\` — respostas dos seguidores\n\n` +
      `*Escrita (só dono):*\n` +
      `• \`${prefix}canal postar <texto>\` — publica agora (ou responde a foto/vídeo)\n` +
      `• \`${prefix}canal divulgar\` — (responde a msg) divulga no canal\n` +
      `• \`${prefix}canal resumo\` — (no grupo) resume e publica\n` +
      `• \`${prefix}canal usar <n>\` — muda o canal ativo\n` +
      `• \`${prefix}canal criar <nome> | <descrição>\` — cria canal\n` +
      `• \`${prefix}canal adotar <link>\` — adota um canal teu\n` +
      `• \`${prefix}canal nome <novo nome>\`\n` +
      `• \`${prefix}canal desc <nova descrição>\`\n` +
      `• \`${prefix}canal foto\` — (responde a uma imagem)\n` +
      `• \`${prefix}canal agendar <pedido>\` — ex: notícias 2x ao dia\n` +
      `• \`${prefix}canal parar\` — pára agendamentos\n` +
      `• \`${prefix}canal perguntar <pergunta> | <op1> | <op2>\`\n` +
      `• \`${prefix}canal seguir <link>\` — segue um canal\n` +
      `• \`${prefix}canal deixar\` — deixa o canal adotado\n` +
      `• \`${prefix}canal apagar SIM\` — ⚠️ apaga o canal\n\n` +
      `*Reacções (v9.20):*\n` +
      `• \`${prefix}canal reagir <emoji>\` — reage a todos os posts recentes\n` +
      `• \`${prefix}canal reagir 🖤❤️🔥\` — roda entre emojis (inflação)\n\n` +
      `*Multi-canal (SUPER):*\n` +
      `• \`${prefix}canal @<nº|nome> <comando>\` — age noutro canal sem trocar o ativo\n` +
      `• \`${prefix}super <texto>\` — publica em *todos* os canais (+ \`grupos\` avisa os grupos)`;

    if (!sub) {
      const meu = await C.meuCanal().catch(() => null);
      const linha = meu?.jid ? `\n\n📌 Adotado: *${meu.name || 'sem nome'}*` : `\n\n📌 Nenhum canal adotado. Usa \`${prefix}canal criar\` ou \`${prefix}canal adotar <link>\`.`;
      return reply(HELP + linha);
    }

    // ── leitura ──
    if (sub === 'meu') {
      const meu = await C.meuCanal().catch(() => null);
      if (!meu?.jid) return reply(`📌 Nenhum canal adotado.\nCria: \`${prefix}canal criar Nome | Descrição\`\nOu adota: \`${prefix}canal adotar <link>\``);
      return reply(`📌 *${meu.name || 'Canal'}*\n🆔 \`${meu.jid}\`\n📝 ${meu.description || '—'}\n🔗 ${meu.invite || '—'}`);
    }
    if (sub === 'info') {
      const alvo = await escolherAlvo();
      if (!alvo) return reply(`❌ Sem canal adotado. \`${prefix}canal adotar <link>\``);
      return reply(fmtResult(await C.infoCanal(sock, alvo)));
    }
    if (sub === 'stats' || sub === 'estatisticas') {
      const alvo = await escolherAlvo();
      if (!alvo) return reply(`❌ Sem canal adotado. \`${prefix}canal adotar <link>\``);
      return reply(fmtResult(await C.estatisticasCanal(sock, alvo)));
    }
    if (sub === 'agenda') {
      const alvo = await escolherAlvo();
      if (!alvo) return reply(`❌ Sem canal adotado. \`${prefix}canal adotar <link>\``);
      try {
        const ag = require('../../aura/auraAgenda');
        const lista = await ag.listar(alvo);
        if (!lista?.length) return reply(`🗓️ Sem agendamentos neste canal.\nCria: \`${prefix}canal agendar notícias de hora em hora\``);
        const linhas = lista.map((a, i) => `${i + 1}. *${a.tema || '?'}* — a cada ${a.intervaloMin || '?'}min\n   ⏭️ próximo: ${a.proxima ? new Date(a.proxima).toLocaleString('pt-AO') : '?'}`);
        return reply(`🗓️ *AGENDADOS* (${lista.length}):\n\n${linhas.join('\n')}`);
      } catch (e) { return reply('❌ Agendamento indisponível: ' + String(e?.message || e).slice(0, 80)); }
    }
    if (sub === 'respostas') {
      const alvo = await escolherAlvo();
      if (!alvo) return reply(`❌ Sem canal adotado. \`${prefix}canal adotar <link>\``);
      return reply(fmtResult(await C.lerRespostasCanal(sock, alvo)));
    }
    if (sub === 'lista' || sub === 'listar') {
      const d = await C.listarCanais().catch(() => null);
      if (!d?.lista?.length) return reply(`📌 Nenhum canal adotado.\nCria: \`${prefix}canal criar Nome | Descrição\`\nOu adota: \`${prefix}canal adotar <link>\``);
      const linhas = d.lista.map((c, i) => `${c.jid === d.ativo ? '📌' : '•'} *${i + 1}. ${c.name || 'Canal'}*\n   🆔 \`${c.jid}\``);
      return reply(`📢 *CANAIS* (${d.lista.length}):\n\n${linhas.join('\n')}`);
    }

    if (sub === 'painel' || sub === 'dashboard' || sub === 'meta') {
      const p = await C.painelCanais(sock).catch(() => null);
      if (!p || p.ok === false) return reply(`📌 Nenhum canal adotado.\nCria: \`${prefix}canal criar Nome | Descrição\`\nOu adota: \`${prefix}canal adotar <link>\``);
      const linhas = p.canais.map((c, i) => `${c.ativo ? '📌' : '•'} *${i + 1}. ${c.name}*${c.ativo ? ' _(ativo)_' : ''}\n   👥 ${c.seguidores ?? '?'} seguidores · 🗓️ ${c.agendados} agendado${c.agendados === 1 ? '' : 's'}\n   🆔 \`${c.jid}\``);
      return reply(`📊 *PAINEL* (${p.canais.length} ${p.canais.length === 1 ? 'canal' : 'canais'}):\n\n${linhas.join('\n')}\n\n💡 Age em qualquer um sem trocar o ativo: \`${prefix}canal @<nº|nome> <comando>\``);
    }

    // ── escrita: só dono ──
    if (!isOwner) return reply('🚫 Só o *dono* pode gerir canais.');

    if (sub === 'postar' || sub === 'publicar' || sub === 'post') {
      const alvo = await escolherAlvo();
      if (!alvo) return reply(`❌ Sem canal adotado. \`${prefix}canal adotar <link>\``);
      // v7.73 PRO: respondeu a foto/vídeo? publica a mídia (resto = legenda)
      const raw = m.msg?.message || msg?.message || {};
      const q = raw.extendedTextMessage?.contextInfo?.quotedMessage;
      const midia = raw.imageMessage ? { k: 'image', m: (m.msg || msg) }
        : raw.videoMessage ? { k: 'video', m: (m.msg || msg) }
        : q?.imageMessage ? { k: 'image', m: { message: q } }
        : q?.videoMessage ? { k: 'video', m: { message: q } } : null;
      if (midia) {
        try {
          const mh = require('../mediaHandler');
          const buf = await mh.downloadFromMessage(midia.m);
          return reply(fmtResult(await C.postarMidiaCanal(sock, alvo, buf, midia.k, resto)));
        } catch (e) { return reply('❌ Não consegui ler a mídia: ' + String(e?.message || e).slice(0, 80)); }
      }
      if (!resto) return reply(`❓ Usa: \`${prefix}canal postar <texto>\``);
      return reply(fmtResult(await C.postarCanal(sock, alvo, resto)));
    }
    if (sub === 'divulgar' || sub === 'partilhar' || sub === 'crosspost') {
      const alvo = await escolherAlvo();
      if (!alvo) return reply(`❌ Sem canal adotado. \`${prefix}canal adotar <link>\``);
      const raw = m.msg?.message || msg?.message || {};
      const quoted = raw.extendedTextMessage?.contextInfo?.quotedMessage;
      if (!quoted) return reply(`❓ Responde à mensagem com \`${prefix}canal divulgar\``);
      return reply(fmtResult(await C.divulgarNoCanal(sock, { message: quoted }, alvo)));
    }
    if (sub === 'resumo' || sub === 'resumir') {
      const alvo = await escolherAlvo();
      if (!alvo) return reply(`❌ Sem canal adotado. \`${prefix}canal adotar <link>\``);
      if (!ctx.isGroup) return reply(`❓ Corre este comando *dentro do grupo* que queres resumir.`);
      return reply(fmtResult(await C.resumoGrupoParaCanal(sock, ctx.remoteJid, alvo)));
    }
    if (sub === 'usar' || sub === 'ativo' || sub === 'ativar' || sub === 'mudar') {
      if (!resto) return reply(`❓ Usa: \`${prefix}canal usar <nº|nome>\`\nVê: \`${prefix}canal lista\``);
      // v7.77: nome ambíguo → lista para desempatar
      if (!/^\d+$/.test(resto.trim())) {
        const matches = await C.procurarCanais(resto).catch(() => []);
        if (matches.length > 1) {
          const d = await C.listarCanais().catch(() => ({ lista: [] }));
          const linhas = matches.map((mch) => {
            const n = (d.lista || []).findIndex(c => c.jid === mch.jid) + 1;
            return `*${n}.* ${mch.name || 'Canal'}`;
          });
          return reply(`🔍 *${matches.length} canais* casam com \`${resto}\`:\n\n${linhas.join('\n')}\n\n> Escolhe: \`${prefix}canal usar <nº>\``);
        }
      }
      return reply(fmtResult(await C.ativarCanal(resto)));
    }
    if (sub === 'criar') {
      const [nome, desc] = resto.split('|').map(s => s.trim());
      if (!nome) return reply(`❓ Usa: \`${prefix}canal criar <nome> | <descrição>\``);
      const r = await C.criarCanalSeguro(sock, nome, desc || '');
      if (!r || r.ok === false) return reply('❌ ' + (r?.msg || 'Não consegui criar o canal.'));
      try { await C.guardarCanal({ jid: r.jid || r.id, name: nome, description: desc || '', invite: r.invite || '', criadoEm: Date.now() }); } catch {}
      return reply(`✅ Canal *${nome}* criado e adotado! 📢`);
    }
    if (sub === 'adotar' || sub === 'assumir') {
      if (!resto) return reply(`❓ Usa: \`${prefix}canal adotar <link do canal>\``);
      return reply(fmtResult(await C.adotarCanal(sock, resto)));
    }
    if (sub === 'nome' || sub === 'renomear') {
      if (!resto) return reply(`❓ Usa: \`${prefix}canal nome <novo nome>\``);
      const alvo = await escolherAlvo();
      if (!alvo) return reply(`❌ Sem canal adotado.`);
      return reply(fmtResult(await C.renomearCanal(sock, alvo, resto)));
    }
    if (sub === 'desc' || sub === 'descricao' || sub === 'descrever') {
      if (!resto) return reply(`❓ Usa: \`${prefix}canal desc <nova descrição>\``);
      const alvo = await escolherAlvo();
      if (!alvo) return reply(`❌ Sem canal adotado.`);
      return reply(fmtResult(await C.descreverCanal(sock, alvo, resto)));
    }
    if (sub === 'foto') {
      const alvo = await escolherAlvo();
      if (!alvo) return reply(`❌ Sem canal adotado.`);
      const raw = m.msg?.message || msg?.message || {};
      const quoted = raw.extendedTextMessage?.contextInfo?.quotedMessage;
      const srcMsg = raw.imageMessage ? (m.msg || msg) : (quoted?.imageMessage ? { message: quoted } : null);
      if (!srcMsg) return reply(`❓ Responde a uma *imagem* com \`${prefix}canal foto\``);
      try {
        const mh = require('../mediaHandler');
        const buf = await mh.downloadFromMessage(srcMsg);
        return reply(fmtResult(await C.fotoCanal(sock, alvo, buf)));
      } catch (e) { return reply('❌ Não consegui ler a imagem: ' + String(e?.message || e).slice(0, 80)); }
    }
    if (sub === 'agendar') {
      if (!resto) return reply(`❓ Usa: \`${prefix}canal agendar <pedido>\`\nEx: \`${prefix}canal agendar notícias de hora em hora\``);
      const alvo = await escolherAlvo();
      if (!alvo) return reply(`❌ Sem canal adotado.`);
      try {
        const ag = require('../../aura/auraAgenda');
        return reply(fmtResult(await ag.criar(resto, { jid: alvo, fonte: ctx.isGroup ? ctx.remoteJid : null })));
      } catch (e) { return reply('❌ Agendamento indisponível: ' + String(e?.message || e).slice(0, 80)); }
    }
    if (sub === 'parar') {
      const alvo = await escolherAlvo();
      if (!alvo) return reply(`❌ Sem canal adotado.`);
      try {
        const ag = require('../../aura/auraAgenda');
        return reply(fmtResult(await ag.parar(alvo)));
      } catch (e) { return reply('❌ ' + String(e?.message || e).slice(0, 80)); }
    }
    if (sub === 'perguntar' || sub === 'enquete' || sub === 'poll') {
      if (!resto) return reply(`❓ Usa: \`${prefix}canal perguntar <pergunta> | <op1> | <op2>\``);
      const alvo = await escolherAlvo();
      if (!alvo) return reply(`❌ Sem canal adotado.`);
      return reply(fmtResult(await C.perguntarSeguidores(sock, alvo, resto)));
    }
    if (sub === 'seguir' || sub === 'entrar') {
      if (!resto) return reply(`❓ Usa: \`${prefix}canal seguir <link do canal>\``);
      return reply(fmtResult(await C.aceitarConviteCanal(sock, resto, ctx)));
    }
    if (sub === 'deixar' || sub === 'sair') {
      const alvo = await escolherAlvo();
      if (!alvo) return reply(`❌ Sem canal adotado.`);
      const r = await C.deixarCanal(sock, alvo);
      if (r?.ok !== false) { try { if (alvoRef) await C.esquecerCanal(alvo); else await C.guardarCanal(null); } catch {} }
      return reply(fmtResult(r));
    }
    if (sub === 'apagar' || sub === 'deletar') {
      if (resto.toUpperCase() !== 'SIM') return reply(`⚠️ Isto *APAGA o canal* para sempre!\nConfirma: \`${prefix}canal apagar SIM\``);
      const alvo = await escolherAlvo();
      if (!alvo) return reply(`❌ Sem canal adotado.`);
      const r = await C.apagarCanal(sock, alvo);
      if (r?.ok !== false) { try { if (alvoRef) await C.esquecerCanal(alvo); else await C.guardarCanal(null); } catch {} }
      return reply(fmtResult(r));
    }

    // ═══════════════════════════════════════════════════════════
    // v9.20 — REACÇÕES DE CANAL (inflação de engagement)
    // Suporta múltiplos emojis: !canal reagir 🖤❤️🔥🕷️
    // Roda entre os emojis em cada post para variar as reacções.
    // ═══════════════════════════════════════════════════════════
    if (sub === 'reagir' || sub === 'react') {
      if (!resto) return reply(`❓ Usa: \`${prefix}canal reagir <emoji>\` ou \`${prefix}canal reagir 🖤❤️🔥\`\nReage a todas as publicações recentes do canal.`);
      const alvo = await escolherAlvo();
      if (!alvo) return reply(`❌ Sem canal adotado. \`${prefix}canal adotar <link>\``);
      // separa emojis unicode (suporta múltiplos colados ou separados por espaço)
      const emojiInput = (resto || '').trim();
      const emojiMatches = emojiInput.match(/\p{Emoji_Presentation}|\p{Emoji}\uFE0F/gu) || [emojiInput.split(/\s/)[0] || '🕸️'];
      const emojiList = [...new Set(emojiMatches)];
      if (emojiList.length > 1) {
        return reply(fmtResult(await C.reagirTudoCanal(sock, alvo, emojiList[0], 30, { emojis: emojiList })));
      }
      return reply(fmtResult(await C.reagirTudoCanal(sock, alvo, emojiList[0], 30)));
    }

    return reply(`❓ Subcomando desconhecido: \`${sub}\`\nVê: \`${prefix}canal\``);
  });
};
