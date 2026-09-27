/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║  v12.9.11 — CENTRAL AVANÇADA DE GRUPOS 🕸️ (SÓ DONO)          ║
 * ║  .central (menu c/ botões) · .gruposbot (carrossel)           ║
 * ║  .capturar [n|jid] · .capturartodos · .contactos (stats)      ║
 * ║  .addcentral <dest> [de n|todos] — add em lote; quem falhar   ║
 * ║  o bot PERGUNTA (botões) se envia convite no PV               ║
 * ║  .addconvite sim|nao · .comunidade [n|jid] · .limparbase      ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */
'use strict';

const buttonHandler = require('../buttonHandler');
const ui = require('../centralUI');
const base = require('../centralBase');

// RAM por chat: última listagem de grupos + convites pendentes
const _last = new Map();   // chatId → [{ jid, nome, size, comunidade, pai }]
const _pend = new Map();   // chatId → { dest, falhados: [{jid,nome}], envJid, ts }

const only = (isOwner, reply) => isOwner ? true : (reply('👑 A Central é *SÓ DO DONO*.'), false);
const fmtN = n => n >= 1000 ? (n / 1000).toFixed(1) + 'K' : String(n);

async function listarGrupos(sock) {
  const all = await sock.groupFetchAllParticipating();
  const arr = Object.values(all || {}).map(g => ({
    jid: g.id,
    nome: g.subject || 'grupo',
    size: g.participants?.length || g.size || 0,
    comunidade: !!g.isParentGroup || /comunity|comunidade/i.test(g.subject || ''),
    pai: g.linkedParentJid || '',
    raw: g,
  })).sort((a, b) => b.size - a.size);
  return { arr, all };
}

function registrarListagem(chatId, arr) { _last.set(chatId, arr); }
// v12.9.11: se não houve listagem neste chat (ou expirou), busca fresca —
// o dono não é obrigado a correr gruposbot primeiro.
async function garantirListagem(sock, chatId) {
  let arr = _last.get(chatId);
  if (!arr || !arr.length) { const { arr: fresh } = await listarGrupos(sock); arr = fresh; registrarListagem(chatId, arr); }
  return arr;
}
async function pickGrupo(sock, chatId, arg) {
  const arr = await garantirListagem(sock, chatId);
  if (/^\d+$/.test(arg) && arr[+arg - 1]) return arr[+arg - 1];
  const jid = arg.includes('@g.us') ? arg : null;
  if (jid) return arr.find(g => g.jid === jid) || { jid, nome: 'grupo', size: 0 };
  return null;
}

module.exports = function registerCentralGrupos(registerCase) {
  const owner = true; // só dono em todos

  // ═══════════ MENU DA CENTRAL (botões) ═══════════
  registerCase(['central', 'centralgrupos'], async ({ sock, msg, ctx, prefix, isOwner, reply }) => {
    if (!only(isOwner, reply)) return;
    const s = base.stats();
    await buttonHandler.sendButtons(sock, ctx.remoteJid,
      `🕸️ *CENTRAL AVANÇADA DE GRUPOS* — SÓ DONO\n\n👥 ${s.nGrupos} grupos conhecidos\n📇 ${fmtN(s.total)} contactos únicos\n🕒 base: ${s.updatedAt ? new Date(s.updatedAt).toLocaleString('pt-PT') : 'vazia'}`,
      'Central v12.9.11 · captura → dashboard',
      [
        { id: `${prefix}gruposbot`, text: '📋 Grupos do bot' },
        { id: `${prefix}capturartodos`, text: '📥 Capturar TODOS' },
        { id: `${prefix}contactos`, text: '📊 Estatísticas' },
        { id: `${prefix}comunidade`, text: '🏘️ Comunidades' },
      ], msg);
  }, owner);

  // ═══════════ LISTA DE GRUPOS (carrossel se ≤8) ═══════════
  registerCase(['gruposbot', 'meusgrupos', 'gruposlista'], async ({ sock, msg, ctx, prefix, isOwner, reply }) => {
    if (!only(isOwner, reply)) return;
    const { arr } = await listarGrupos(sock);
    if (!arr.length) return reply('O bot não está em nenhum grupo.');
    registrarListagem(ctx.remoteJid, arr);
    // carrossel em páginas de 6 cards — MESMO formato do menu/pesquisa (cascata: carrossel→lista→botões→texto)
    const PG = 6, pags = Math.ceil(arr.length / PG);
    for (let pg = 0; pg < Math.min(pags, 3); pg++) {
      const fatia = arr.slice(pg * PG, pg * PG + PG);
      if (!fatia.length) break;
      await ui.carrosselSeguro(sock, ctx.remoteJid,
        `📋 *GRUPOS DO BOT (${arr.length})* — página ${pg + 1}/${pags}`,
        fatia.map((g, k) => {
          const i = pg * PG + k;
          return {
            title: `${i + 1}. ${g.nome.slice(0, 40)}`,
            body: `👥 ${g.size} membros${g.comunidade ? '\n🏘️ COMUNIDADE' : ''}${g.pai ? '\n↳ filho de comunidade' : ''}`,
            footer: g.jid,
            buttons: [
              { text: '📥 Capturar', id: `${prefix}capturar ${i + 1}` },
              { text: '➕ Addcentral', id: `${prefix}addcentral ${i + 1}` },
            ],
          };
        }),
        { footer: 'Central · só dono', quoted: msg, listaTitle: 'Grupos do bot' });
    }
    if (pags > 3) await sock.sendMessage(ctx.remoteJid, { text: `📋 Mostrando ${Math.min(pags, 3)} de ${pags} páginas (${arr.length} grupos).\n> Usa \`capturar <nº>\` · \`addcentral <dest> [de <nº|todos>]\`` }, { quoted: msg });
    await buttonHandler.sendButtons(sock, ctx.remoteJid, '⚡ *Acções rápidas da Central*', 'Central · só dono',
      [{ id: `${prefix}capturartodos`, text: '📥 Capturar TODOS' }, { id: `${prefix}contactos`, text: '📊 Base de contactos' }], msg);
  }, owner);

  // ═══════════ CAPTURAR 1 GRUPO (ou comunidade inteira) ═══════════
  registerCase(['capturar', 'capturargrupo'], async ({ sock, msg, ctx, args, isOwner, reply }) => {
    if (!only(isOwner, reply)) return;
    const alvo = String(args[0] || '').trim();
    if (!alvo) {
      const n = (_last.get(ctx.remoteJid) || []).length;
      return reply('Uso: *capturar <nº | jid>* — os números saem de *gruposbot* (ou usa o carrossel).\n💡 Se o nº for uma *comunidade*, capturo o pai + TODOS os subgrupos.');
    }
    const g = await pickGrupo(sock, ctx.remoteJid, alvo);
    if (!g) return reply(`Grupo "${alvo}" não encontrado — corre *gruposbot* para ver a lista.`);
    await sock.sendMessage(ctx.remoteJid, { react: { text: '⏳', key: msg.key } }).catch(() => {});
    // comunidade pai → filhos
    let jids = [g.jid];
    if (g.comunidade || g.raw?.isParentGroup) {
      try { const { all } = await listarGrupos(sock); jids = [g.jid, ...base.filhosComunidade(g.jid, all).map(x => x.id)]; } catch {}
    }
    let novos = 0, duplicados = 0, gruposN = 0;
    for (const jid of jids) {
      try {
        const meta = await sock.groupMetadata(jid);
        const r = base.capturarGrupo(jid, meta);
        novos += r.novos; duplicados += r.duplicados; gruposN++;
        await new Promise(res => setTimeout(res, 400));
      } catch (e) { return reply(`❌ ${jid}: ${e.message?.slice(0, 80)}`); }
    }
    const s = base.stats();
    await buttonHandler.sendButtons(sock, ctx.remoteJid,
      `📥 *CAPTURA CONCLUÍDA*\n\n👥 ${gruposN} grupo(s) · ✅ ${novos} novos\n♻️ ${duplicados} duplicados ignorados\n📇 Base: *${fmtN(s.total)}* contactos únicos`,
      'sem duplicados · visível no dashboard → Central',
      [{ id: '.capturartodos', text: '📥 Capturar TODOS' }, { id: '.contactos', text: '📊 Estatísticas' }], msg);
  }, owner);

  // ═══════════ CAPTURAR TODOS OS GRUPOS ═══════════
  registerCase(['capturartodos', 'capturargeral'], async ({ sock, msg, ctx, isOwner, reply }) => {
    if (!only(isOwner, reply)) return;
    const st = await reply('⏳ *CAPTURA GERAL* — a percorrer todos os grupos…');
    const { arr } = await listarGrupos(sock);
    let novos = 0, duplicados = 0, okN = 0, fail = [];
    for (let i = 0; i < arr.length; i++) {
      try {
        const meta = await sock.groupMetadata(arr[i].jid);
        const r = base.capturarGrupo(arr[i].jid, meta);
        novos += r.novos; duplicados += r.duplicados; okN++;
        if (i % 5 === 4) { try { await sock.sendMessage(ctx.remoteJid, { edit: st.key, text: `⏳ ${i + 1}/${arr.length} grupos… ✅ ${novos} novos` }); } catch {} }
        await new Promise(res => setTimeout(res, 500));
      } catch (e) { fail.push(`${arr[i].nome.slice(0, 20)}: ${e.message?.slice(0, 30)}`); }
    }
    const s = base.stats();
    return reply(`✅ *CAPTURA GERAL CONCLUÍDA*\n\n📋 ${okN}/${arr.length} grupos${fail.length ? ` · ❌ ${fail.length} falhados` : ''}\n✅ ${novos} contactos novos · ♻️ ${duplicados} duplicados ignorados\n📇 Base: *${fmtN(s.total)}* contactos únicos\n\n🌐 Tudo no *dashboard → Central de Contactos*${fail.length ? `\n> ${fail.slice(0, 3).join(' · ')}` : ''}`);
  }, owner);

  // ═══════════ STATS DA BASE ═══════════
  registerCase(['contactos', 'basecentral', 'centralbase'], async ({ sock, msg, ctx, prefix, isOwner, reply }) => {
    if (!only(isOwner, reply)) return;
    const s = base.stats();
    if (!s.total) return reply(`📇 Base vazia. Começa com *capturartodos* (ou *gruposbot* → capturar 1).`);
    const top = s.porGrupo.slice(0, 8).map((g, i) => `${i + 1}. ${g.nome.slice(0, 38)} — ${g.capturados} contactos`);
    await buttonHandler.sendButtons(sock, ctx.remoteJid,
      `📊 *BASE CENTRAL DE CONTACTOS*\n\n📇 ${fmtN(s.total)} contactos únicos · 📋 ${s.nGrupos} grupos\n🕒 ${new Date(s.updatedAt).toLocaleString('pt-PT')}\n\n🏆 *Top grupos:*\n${top.join('\n')}`,
      'lista completa no dashboard → Central',
      [{ id: `${prefix}capturartodos`, text: '📥 Capturar TODOS' }, { id: `${prefix}gruposbot`, text: '📋 Grupos' }, { id: `${prefix}central`, text: '🕸️ Menu' }], msg);
  }, owner);

  // ═══════════ LIMPAR BASE ═══════════
  registerCase(['limparbase', 'limparcontactos'], async ({ sock, msg, ctx, args, isOwner, reply }) => {
    if (!only(isOwner, reply)) return;
    if (String(args[0] || '').toLowerCase() !== 'confirmar') {
      const s = base.stats();
      return buttonHandler.sendButtons(sock, ctx.remoteJid, `⚠️ Apagar a base TODA (${fmtN(s.total)} contactos, ${s.nGrupos} grupos)?`, 'acção irreversível',
        [{ id: `${ctx.prefix}limparbase confirmar`, text: '🗑️ Sim, apagar' }, { id: `${ctx.prefix}contactos`, text: '❌ Cancelar' }], msg);
    }
    base.limpar();
    return reply('🗑️ Base limpa. (Os grupos no WhatsApp não são tocados — só os dados capturados.)');
  }, owner);

  // ═══════════ ADD CENTRAL — puxar a base para um grupo ═══════════
  // addcentral <jidDest|nº> [de <nº|todos>]   (default: todos os contactos)
  registerCase(['addcentral', 'puxarbase', 'addcontactos'], async ({ sock, msg, ctx, args, isOwner, reply }) => {
    if (!only(isOwner, reply)) return;
    const argDest = String(args[0] || '').trim();
    if (!argDest) {
      const n = (_last.get(ctx.remoteJid) || []).length;
      return reply(`Uso: *addcentral <jidDestino | nº do grupo> [de <nº|todos>]*\n\n• \`addcentral 3\` → adiciona a base TODA ao grupo 3 da listagem\n• \`addcentral 3 de 1\` → só os contactos capturados do grupo 1\n• \`addcentral 120363...@g.us de todos\`\n\n\n⚠️ O bot precisa de ser *admin* no grupo destino.`);
    }
    const gDest = await pickGrupo(sock, ctx.remoteJid, argDest);
    if (!gDest) return reply(`Destino "${argDest}" não encontrado — corre *gruposbot* para ver a lista.`);
    // fonte
    const argDe = args.length >= 2 && String(args[1]).toLowerCase() === 'de' ? String(args[2] || 'todos').toLowerCase() : 'todos';
    let filtro = 'todos';
    if (argDe !== 'todos') { const gf = await pickGrupo(sock, ctx.remoteJid, argDe); if (!gf) return reply(`Fonte "${argDe}" não encontrada na listagem.`); filtro = gf.jid; }
    const lista = base.fonteParaAdd(filtro);
    if (!lista.length) return reply('A base/fonte está vazia — corre *capturartodos* primeiro.');
    const L = await reply(`⏳ *ADD CENTRAL*\n🎯 destino: ${gDest.nome.slice(0, 40)}\n📇 fonte: ${filtro === 'todos' ? 'base TODA' : 'grupo ' + argDe} → *${lista.length}* contactos\n\n⚠️ Em lotes de 5 · pausa 3s. Quem não deixar adicionar-se (privacidade) fica na lista de convites.`);
    // bot admin no destino? (comparação por dígitos — JID vem com @s.whatsapp.net)
    try {
      const metaDest = await sock.groupMetadata(gDest.jid);
      const meuNum = String((sock.user?.id || '')).split('/')[0].split(':')[0].split('@')[0].replace(/\D/g, '');
      const souAdm = (metaDest.participants || []).some(p => {
        const num = String(p.id || '').split('@')[0].replace(/\D/g, '');
        return num === meuNum && (p.admin === 'admin' || p.admin === 'superadmin');
      });
      if (!souAdm) return buttonHandler.sendButtons(sock, ctx.remoteJid,
        `⚠️ Preciso ser *admin* de *${gDest.nome.slice(0, 40)}* para adicionar pessoas.`, 'Central',
        [{ id: ctx.prefix + 'gruposbot', text: '📋 Ver grupos' }], msg);
    } catch (e) { return reply(`❌ Não consegui ler o grupo destino: ${e.message?.slice(0, 80)}`); }
    // lote
    const okN = [], falharam = [];
    for (let i = 0; i < lista.length; i += 5) {
      const lote = lista.slice(i, i + 5);
      try {
        const res = await sock.groupParticipantsUpdate(gDest.jid, lote.map(x => x.jid), 'add');
        for (const r of (res || [])) {
          const info = lista.find(x => x.jid === r.jid || x.num === String(r.jid || '').split('@')[0]);
          if (!r || !r.status || r.status === '200') okN.push(info || { nome: r.jid });
          else falharam.push({ jid: r.jid, nome: info?.nome || '', status: r.status });
        }
      } catch (e) {
        // erro de lote inteiro → marcar todos como falhados se 403-ish
        const msg403 = /403|forbidden|not-authorized|conflict/i.test(e.message || '');
        for (const x of lote) falharam.push({ jid: x.jid, nome: x.nome, status: msg403 ? '403' : 'erro' });
      }
      if (i % 20 === 15) { try { await sock.sendMessage(ctx.remoteJid, { edit: L.key, text: `⏳ ${Math.min(i + 5, lista.length)}/${lista.length}… ✅ ${okN.length} · ❌ ${falharam.length}` }); } catch {} }
      await new Promise(r => setTimeout(r, 3000));
    }
    // resultado + PERGUNTA de convite (botões) — NUNCA automático
    _pend.set(ctx.remoteJid, { dest: gDest.jid, destNome: gDest.nome, falhados: falharam, ts: Date.now() });
    let texto = `✅ *ADD CENTRAL CONCLUÍDO*\n\n🎯 ${gDest.nome.slice(0, 40)}\n✅ adicionados: *${okN.length}*\n❌ não deixaram (privacidade/erro): *${falharam.length}*`;
    if (falharam.length) texto += `\n\n📨 Queres que eu mande o *convite no PV* dos ${falharam.length}?`;
    const bts = falharam.length
      ? [{ id: `${ctx.prefix}addconvite sim`, text: `📨 Convite PV (${falharam.length})` }, { id: `${ctx.prefix}addconvite nao`, text: '❌ Não enviar' }]
      : [{ id: `${ctx.prefix}contactos`, text: '📊 Ver base' }];
    return buttonHandler.sendButtons(sock, ctx.remoteJid, texto, 'convite SÓ com a tua confirmação', bts, msg);
  }, owner);

  // ═══════════ CONFIRMAÇÃO DO CONVITE ═══════════
  registerCase(['addconvite'], async ({ sock, msg, ctx, args, isOwner, reply }) => {
    if (!only(isOwner, reply)) return;
    const opc = String(args[0] || '').toLowerCase();
    const pend = _pend.get(ctx.remoteJid);
    if (!pend || Date.now() - pend.ts > 10 * 60e3) { _pend.delete(ctx.remoteJid); return reply('Não há nenhuma lista de convites pendente (ou expirou — 10 min). Corre *addcentral* de novo.'); }
    if (opc === 'nao' || opc === 'não') { _pend.delete(ctx.remoteJid); return reply('👌 Nada enviado. A lista de falhados foi descartada.'); }
    if (opc !== 'sim') return reply(`Uso: *addconvite sim|nao*`);
    // enviar convites no PV com rate
    let code = '';
    try { code = await sock.groupInviteCode(pend.dest); } catch (e) { return reply(`❌ Não consegui o link de convite: ${e.message?.slice(0, 70)} (preciso de ser admin).`); }
    const link = `https://chat.whatsapp.com/${code}`;
    const st = await reply(`📨 A enviar convite no PV de *${pend.falhados.length}* pessoas…`);
    let okN = 0, failN = 0;
    for (let i = 0; i < pend.falhados.length; i++) {
      const f = pend.falhados[i];
      const jidPV = String(f.jid || '').includes('@') ? f.jid : f.jid.replace('@lid', '') && String(f.jid);
      try {
        await sock.sendMessage(jidPV, {
          text: `🕸️ Olá${f.nome ? ' ' + f.nome : ''}! Convido-te para o grupo *${pend.destNome.slice(0, 60)}*.\n\n🔗 ${link}\n\n_(convite enviado pelo dono — se não quiseres, ignora)_`,
        });
        okN++;
      } catch { failN++; }
      if (i % 10 === 9) { try { await sock.sendMessage(ctx.remoteJid, { edit: st.key, text: `📨 ${i + 1}/${pend.falhados.length} convites…` }); } catch {} }
      await new Promise(r => setTimeout(r, 2500));
    }
    _pend.delete(ctx.remoteJid);
    return reply(`✅ Convites: *${okN}* enviados${failN ? ` · ❌ ${failN} falhados (PV bloqueado?)` : ''}\n🔗 ${link}`);
  }, owner);

  // ═══════════ COMUNIDADES ═══════════
  registerCase(['comunidade', 'comunidades'], async ({ sock, msg, ctx, args, prefix, isOwner, reply }) => {
    if (!only(isOwner, reply)) return;
    const { arr } = await listarGrupos(sock);
    registrarListagem(ctx.remoteJid, arr);
    const pais = arr.filter(g => g.comunidade || g.raw?.isParentGroup);
    const filhos = arr.filter(g => g.pai);
    if (!pais.length && !filhos.length) {
      return reply('🏘️ Nenhuma comunidade detectada entre os grupos do bot.\n\n> Detecção por *isParentGroup* e *linkedParentJid* do WhatsApp. Se o bot for membro de uma comunidade, corre *gruposbot* de novo (meta fresca).');
    }
    const secoes = [];
    if (pais.length) secoes.push({ titulo: '🏘️ Comunidades (pai)', linhas: pais.map((g, i) => ({ titulo: g.nome.slice(0, 40), descricao: `${g.size} membros · ver filhos`, id: `${prefix}comunidade ${arr.indexOf(g) + 1}` })) });
    if (filhos.length) secoes.push({ titulo: '↳ Grupos filhos de comunidade', linhas: filhos.map(g => ({ titulo: g.nome.slice(0, 40), descricao: 'ver a comunidade', id: `${prefix}comunidade ${arr.indexOf(g) + 1}` })) });
    const arg = String(args[0] || '').trim();
    if (arg) {
      const g = await pickGrupo(sock, ctx.remoteJid, arg);
      if (!g) return reply('Grupo não encontrado — corre *gruposbot*.');
      const filhosDele = arr.filter(x => x.pai === g.jid);
      let txt = `🏘️ *${g.nome.slice(0, 50)}*\n👥 ${g.size} membros\n${g.comunidade ? '🏘️ É COMUNIDADE (pai)' : g.pai ? `↳ filho da comunidade \`${g.pai}\`` : 'grupo simples'}`;
      if (g.comunidade) txt += filhosDele.length ? `\n\n↳ *${filhosDele.length} subgrupo(s):*\n${filhosDele.map((f, i) => `  ${i + 1}. ${f.nome.slice(0, 38)} · 👥 ${f.size}`).join('\n')}` : '\n(sem subgrupos com o bot dentro)';
      return buttonHandler.sendButtons(sock, ctx.remoteJid, txt, 'Central · comunidades',
        [{ id: `${prefix}capturar ${arr.indexOf(g) + 1}`, text: g.comunidade ? '📥 Capturar TUDO' : '📥 Capturar' }, { id: `${prefix}gruposbot`, text: '📋 Grupos' }], msg);
    }
    return ui.lista(sock, ctx.remoteJid,
      '🕸️ Central · Comunidades',
      `🏘️ *COMUNIDADES* — ${pais.length} pai(s) · ${filhos.length} filho(s)\n\nEscolhe para ver a hierarquia completa:`,
      '🕸️ Abrir comunidades',
      secoes.map(s => ({ title: s.titulo, rows: s.linhas.map(l => ({ header: l.titulo, title: l.descricao || 'ver', id: l.id })) })),
      { quoted: msg });
  }, owner);
};
