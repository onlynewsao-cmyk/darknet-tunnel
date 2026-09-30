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

// ═══ v12.9.40: MENU ADD CENTRAL (comando .add — não é submenu) ═══
async function _menuAdd(sock, msg, ctx) {
  const s = base.stats();
  const ehGrupo = /@g\.us$/.test(ctx.remoteJid || '');
  const top = ehGrupo ? (s.paises || []).slice(0, 3) : [];
  const bts = [];
  if (ehGrupo) {
    bts.push({ id: ctx.prefix + 'addpre todos', text: '➕ Base TODA aqui (' + fmtN(s.total) + ')' });
    for (const p of top) bts.push({ id: ctx.prefix + 'addpre pais:' + p.pais, text: '🌍 ' + p.pais + ' (' + fmtN(p.total) + ')' });
  }
  bts.push({ id: ctx.prefix + 'gruposbot', text: '📋 Grupos do bot' });
  bts.push({ id: ctx.prefix + 'contactos', text: '📊 Estatísticas' });
  let txt = '➕ *ADD CENTRAL — contactos → grupos/comunidades*\n\n📇 ' + fmtN(s.total) + ' contactos · 📋 ' + s.nGrupos + ' grupos';
  if ((s.paises || []).length) txt += '\n🌐 ' + (s.paises || []).slice(0, 4).map(p => p.pais + ' ' + fmtN(p.total)).join(' · ');
  txt += '\n\n• \`' + ctx.prefix + 'add <dest> de todos\` — a base TODA'
    + '\n• \`' + ctx.prefix + 'add <dest> de 3\` — de 1 grupo'
    + '\n• \`' + ctx.prefix + 'add <dest> de 3 5\` — de 2 grupos'
    + '\n• \`' + ctx.prefix + 'add <dest> de pais:angola\` — de 1 país'
    + '\n• \`' + ctx.prefix + 'add <dest> de pais:angola+brasil\` — de 2 países'
    + '\n• \`' + ctx.prefix + 'add <dest> de ddd:244 9\` — por operadora'
    + '\n• \`' + ctx.prefix + 'add 244912345678\` — adiciona 1 pessoa AQUI'
    + '\n\n⚠️ O bot precisa de ser *admin* no grupo destino.'
    + (ehGrupo ? '\n💡 Os botões adicionam a ESTE grupo (pedem confirmação).' : '\n👉 Usa o comando DENTRO do grupo destino para ver os botões rápidos.');
  return buttonHandler.sendButtons(sock, ctx.remoteJid, txt, 'Central · só dono', bts, msg);
}

// fonte de contactos p/ ADD: 'todos' | 'ddd:…' | 'pais:x' | 'pais:a+b' (2 países)
// | '<nº grupo>' | '<n1> <n2>' (2 grupos) | jid — tudo com dedup
async function parseFonte(sock, chatId, argDeRaw) {
  const argDe = String(argDeRaw || 'todos').toLowerCase().trim();
  if (argDe === 'todos') return { lista: base.fonteParaAdd('todos'), desc: 'base TODA' };
  if (argDe.startsWith('ddd:') || argDe.startsWith('pais:')) {
    const val = argDe.includes(':') ? argDe.split(':').slice(1).join(':').trim() : '';
    // 2 países: pais:a+b | pais:a,b | pais:a pais:b  ('ddd:' NÃO se parte — 'ddd:244 9' é 1 filtro)
    const partes = argDe.startsWith('pais:') ? val.split(/\s*\+\s*|\s*,\s*|\s+pais:\s*/).map(x => x.trim()).filter(Boolean) : [val];
    let lista = [];
    for (const p of partes) lista = lista.concat(base.fontePorDdd(p));
    const vistos = new Set();
    lista = lista.filter(x => !vistos.has(x.num) && vistos.add(x.num));
    return { lista, desc: partes.length > 1 ? 'países ' + partes.join(' + ') : 'SEGMENTO ' + val.toUpperCase() };
  }
  // 1 ou 2 grupos: '3' | '3 5' | '3,5' | jid
  const toks = argDe.split(/[\s,]+/).filter(Boolean).slice(0, 2);
  let lista = [];
  const nomes = [];
  for (const t of toks) {
    const gf = await pickGrupo(sock, chatId, t);
    if (!gf) return { lista: null, erro: 'Fonte "' + t + '" não encontrada na listagem — corre *gruposbot*.' };
    lista = lista.concat(base.fonteParaAdd(gf.jid));
    nomes.push(String(gf.nome || 'grupo').slice(0, 25));
  }
  const vistos = new Set();
  lista = lista.filter(x => !vistos.has(x.num) && vistos.add(x.num));
  return { lista, desc: 'grupo' + (nomes.length > 1 ? 's ' : ' ') + nomes.join(' + ') };
}

// motor do ADD (addcentral e addgo partilham): admin check → lotes de 5 →
// resultado com PERGUNTA de convite (nunca automático)
// ═══ v12.9.41: motor do ADD À PROVA DE BAN ═══
// • respeita o LIMITE do grupo (1024 membros) e as vagas reais
// • NÃO tenta adicionar quem já é membro (menos acções = menos risco)
// • comunidade PAI não aceita add directo (avisar em vez de falhar)
// • ritmo HUMANO: lotes de 3–5 + pausas aleatórias 3–8s (nada mecânico)
// • DISJUNTOR: 15 recusas seguidas → para o número e devolve o parcial
async function executarAddCentral(sock, msg, ctx, reply, gDest, fonteDesc, lista, L) {
  let metaDest = null;
  try {
    metaDest = await sock.groupMetadata(gDest.jid);
    const meuNum = String((sock.user?.id || '')).split('/')[0].split(':')[0].split('@')[0].replace(/\D/g, '');
    const souAdm = (metaDest.participants || []).some(p => {
      const num = String(p.id || '').split('@')[0].replace(/\D/g, '');
      return num === meuNum && (p.admin === 'admin' || p.admin === 'superadmin');
    });
    if (!souAdm) return buttonHandler.sendButtons(sock, ctx.remoteJid,
      '⚠️ Preciso ser *admin* de *' + String(gDest.nome).slice(0, 40) + '* para adicionar pessoas.', 'Central',
      [{ id: ctx.prefix + 'gruposbot', text: '📋 Ver grupos' }], msg);
  } catch (e) { return reply('❌ Não consegui ler o grupo destino: ' + (e.message || '').slice(0, 80)); }

  // comunidade PAI (grupo de anúncios) não aceita add directo
  if (metaDest.isParentGroup || /comunity|comunidade/i.test(metaDest.subject || '')) {
    const filhos = (metaDest.participants || []).length;
    return buttonHandler.sendButtons(sock, ctx.remoteJid,
      '🏘️ *' + String(gDest.nome).slice(0, 40) + '* é uma COMUNIDADE (grupo de anúncios) — o WhatsApp não deixa adicionar membros directamente.\n\n👉 Usa um dos *subgrupos* como destino: `gruposbot` e vê os ↳ filhos.', 'Central',
      [{ id: ctx.prefix + 'gruposbot', text: '📋 Ver grupos' }], msg);
  }

  // quem JÁ é membro fica fora (poupa acções = menos risco de ban)
  const jaMembros = new Set((metaDest.participants || []).map(p => String(p.id || '').split('@')[0].replace(/\D/g, '')));
  const unicos = new Set();
  const fila = (lista || []).filter(x => !unicos.has(x.num) && unicos.add(x.num)).filter(x => !jaMembros.has(x.num));
  const jaMembrosN = (lista || []).length - fila.length;

  // LIMITE do grupo (WhatsApp: 1024 membros)
  const MAX_GRUPO = 1024;
  const atuais = (metaDest.participants || []).length;
  const vagas = Math.max(0, MAX_GRUPO - atuais);
  if (!vagas) return reply('🚫 *' + String(gDest.nome).slice(0, 40) + '* está CHEIO (' + atuais + '/' + MAX_GRUPO + '). O WhatsApp não deixa passar de ' + MAX_GRUPO + ' membros.');
  const alvo = fila.slice(0, vagas);
  if (!alvo.length) return reply('✅ Ninguém a adicionar — todos os ' + (lista || []).length + ' contactos da fonte já são membros deste grupo.');

  const est = '👥 ' + atuais + '/' + MAX_GRUPO + ' · vagas: ' + vagas + (jaMembrosN ? ' · já membros: ' + jaMembrosN : '');
  if (fila.length > vagas) await reply('⚠️ Base tem *' + fila.length + '* mas o grupo só tem *' + vagas + ' vagas* — adiciono ' + vagas + ' agora (o resto fica para quando houver espaço).');
  const okN = [], falharam = [];
  let recusasSeguidas = 0, abortado = false;
  for (let i = 0; i < alvo.length;) {   // lotes de 3–5 (tamanho sorteado 1× por lote!)
    const tamLote = 3 + Math.floor(Math.random() * 3);
    if (recusasSeguidas >= 15) {
      abortado = true;
      await reply('🛑 *PAREI por segurança:* ' + recusasSeguidas + ' recusas seguidas. Continuar pode queimar o número — espera umas horas ou usa `addconvite` (link no PV).');
      break;
    }
    const lote = alvo.slice(i, i + tamLote);
    i += lote.length;
    try {
      const res = await sock.groupParticipantsUpdate(gDest.jid, lote.map(x => x.jid), 'add');
      for (const r of (res || [])) {
        const info = alvo.find(x => x.jid === r.jid || x.num === String(r.jid || '').split('@')[0]);
        if (!r || !r.status || r.status === '200') { okN.push(info || { nome: r.jid }); recusasSeguidas = 0; }
        else { falharam.push({ jid: r.jid, nome: (info && info.nome) || '', status: r.status }); recusasSeguidas++; }
      }
    } catch (e) {
      const msg403 = /403|forbidden|not-authorized|conflict/i.test(e.message || '');
      for (const x of lote) falharam.push({ jid: x.jid, nome: x.nome, status: msg403 ? '403' : 'erro' });
      if (msg403) recusasSeguidas += lote.length; else recusasSeguidas += 1;
    }
    if (i % 20 === 15 && L && L.key) { try { await sock.sendMessage(ctx.remoteJid, { edit: L.key, text: '⏳ ' + Math.min(i + 5, alvo.length) + '/' + alvo.length + '… ✅ ' + okN.length + ' · ❌ ' + falharam.length + '\n' + est }); } catch {} }
    await new Promise(r => setTimeout(r, 3000 + Math.floor(Math.random() * 5000)));   // 3–8s humano
  }
  _pend.set(ctx.remoteJid, { dest: gDest.jid, destNome: gDest.nome, falhados: falharam, ts: Date.now() });
  let texto = '✅ *ADD CENTRAL CONCLUÍDO*' + (abortado ? ' (parcial — parado por segurança)' : '') + '\n\n🎯 ' + String(gDest.nome).slice(0, 40) + '\n👥 ' + (atuais + okN.length) + '/' + MAX_GRUPO + ' membros\n✅ adicionados: *' + okN.length + '*' + (jaMembrosN ? '\n♻️ já eram membros: ' + jaMembrosN : '') + '\n❌ não deixaram (privacidade/erro): *' + falharam.length + '*';
  if (fila.length > vagas + okN.length) texto += '\n📦 restaram na fila: ' + (fila.length - okN.length - falharam.length) + ' (sem vagas — corre de novo depois)';
  if (falharam.length) texto += '\n\n📨 Queres que eu mande o *convite no PV* dos ' + falharam.length + '?';
  const bts = falharam.length
    ? [{ id: ctx.prefix + 'addconvite sim', text: '📨 Convite PV (' + falharam.length + ')' }, { id: ctx.prefix + 'addconvite nao', text: '❌ Não enviar' }]
    : [{ id: ctx.prefix + 'contactos', text: '📊 Ver base' }];
  return buttonHandler.sendButtons(sock, ctx.remoteJid, texto, 'convite SÓ com a tua confirmação', bts, msg);
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
    // v12.9.35: LISTA EM TEXTO NUMERADO — o WhatsApp novo deixa de renderizar
    // o carrossel (sem erro, simplesmente não aparece no telefone). Texto
    // renderiza SEMPRE e alimenta `capturar <nº>` / `addcentral <dest> de <nº>`.
    const { listaTexto } = require('../centralTexto');
    await listaTexto(sock, ctx.remoteJid,
      `📋 *GRUPOS DO BOT (${arr.length})*`,
      arr.map((g, i) => ({
        num: i + 1,
        titulo: g.nome.slice(0, 55),
        detalhe: `👥 ${g.size}${g.comunidade ? ' · 🏘️ COMUNIDADE' : ''}${g.pai ? ' · ↳ filho de comunidade' : ''}`,
        marcador: '',
      })),
      { quoted: msg, nota: '> `capturar <nº>` · `addcentral <dest> de <nº>` · `comunidade` para ver hierarquias' });
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
  // v12.9.40: .add/.adicionar = MENU ADD CENTRAL (não é submenu — comando próprio, como .central)
  registerCase(['addcentral', 'puxarbase', 'addcontactos', 'add', 'adicionar'], async ({ sock, msg, ctx, args, isOwner, reply }) => {
    if (!only(isOwner, reply)) return;
    const argDest = String(args[0] || '').trim();
    if (!argDest) {
      return _menuAdd(sock, msg, ctx);
    }
    // .add <número> → adiciona 1 pessoa AO GRUPO ACTUAL (comportamento .add clássico)
    if (/^\+?\d{7,15}$/.test(argDest) && !args.slice(1).includes('de')) {
      if (!/@g\.us$/.test(ctx.remoteJid || '')) return reply('Para adicionar 1 pessoa, usa o comando DENTRO do grupo. Para puxar a base: *add <dest> de …*');
      const num = argDest.replace(/\D/g, '');
      try {
        await sock.groupParticipantsUpdate(ctx.remoteJid, [num + '@s.whatsapp.net'], 'add');
        return reply('✅ +' + num + ' adicionado ao grupo!');
      } catch (e) {
        if (/not admin|forbidden|403/i.test(e?.message || '')) return reply('⚠️ Preciso ser *admin* do grupo! Promove-me.');
        return reply('❌ ' + (e?.message || 'erro').slice(0, 80));
      }
    }
    const gDest = await pickGrupo(sock, ctx.remoteJid, argDest);
    if (!gDest) return reply(`Destino "${argDest}" não encontrado — corre *gruposbot* para ver a lista.`);
    // fonte — v12.9.40: 1/2 grupos · 1/2 países · ddd · todos
    const argDeRaw = args.length >= 3 && String(args[1]).toLowerCase() === 'de' ? args.slice(2).join(' ').trim() : 'todos';
    const _fonte = await parseFonte(sock, ctx.remoteJid, argDeRaw);
    if (_fonte.erro) return reply(_fonte.erro);
    const fonteDesc = _fonte.desc;
    const lista = _fonte.lista;
    if (!lista || !lista.length) return reply('A base/fonte está vazia — corre *capturartodos* primeiro.');
    const L = await reply(`⏳ *ADD CENTRAL*\n🎯 destino: ${gDest.nome.slice(0, 40)}\n📇 fonte: ${fonteDesc} → *${lista.length}* contactos\n\n⚠️ Em lotes de 5 · pausa 3s. Quem não deixar adicionar-se (privacidade) fica na lista de convites.`);
    return executarAddCentral(sock, msg, ctx, reply, gDest, fonteDesc, lista, L);
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

    // v12.9.35: lista em TEXTO — o carrossel/lista interactiva deixa de renderizar nos clientes novos
    const { listaTexto } = require('../centralTexto');
    await listaTexto(sock, ctx.remoteJid,
      `🏘️ *COMUNIDADES* — ${pais.length} pai(s) · ${filhos.length} filho(s)`,
      [
        ...pais.map((g) => ({ num: arr.indexOf(g) + 1, titulo: g.nome.slice(0, 55), detalhe: `🏘️ pai · 👥 ${g.size} · \`.comunidade ${arr.indexOf(g) + 1}\` para ver os filhos`, marcador: '🏘️' })),
        ...filhos.map((g) => ({ num: arr.indexOf(g) + 1, titulo: g.nome.slice(0, 55), detalhe: `↳ filho de comunidade · 👥 ${g.size}`, marcador: '' })),
      ],
      { quoted: msg, nota: '> \`capturar <nº>\` captura a comunidade INTEIRA (pai + subgrupos) quando o nº é um pai' });
  }, owner);

  // ═══ ADD AQUI — botões do menu .add usados DENTRO do grupo destino ═══
  registerCase(['addpre'], async ({ sock, msg, ctx, args, isOwner, reply }) => {
    if (!only(isOwner, reply)) return;
    if (!/@g\.us$/.test(ctx.remoteJid || '')) return reply('Este atalho é para usar DENTRO do grupo destino.');
    const fonte = args.join(' ').trim() || 'todos';
    const { lista, desc, erro } = await parseFonte(sock, ctx.remoteJid, fonte);
    if (erro) return reply(erro);
    if (!lista || !lista.length) return reply('Nada na base para *' + fonte + '* — captura primeiro (*capturartodos*).');
    return buttonHandler.sendButtons(sock, ctx.remoteJid,
      '⚠️ Adicionar *' + lista.length + '* contactos (' + desc + ') a ESTE grupo?',
      'o bot precisa de ser admin aqui',
      [{ id: ctx.prefix + 'addgo ' + fonte, text: '✅ Adicionar ' + lista.length }, { id: ctx.prefix + 'contactos', text: '❌ Cancelar' }], msg);
  }, owner);

  registerCase(['addgo'], async ({ sock, msg, ctx, args, isOwner, reply }) => {
    if (!only(isOwner, reply)) return;
    if (!/@g\.us$/.test(ctx.remoteJid || '')) return reply('Este atalho é para usar DENTRO do grupo destino.');
    const fonte = args.join(' ').trim() || 'todos';
    const { lista, desc, erro } = await parseFonte(sock, ctx.remoteJid, fonte);
    if (erro) return reply(erro);
    if (!lista || !lista.length) return reply('Nada na base para *' + fonte + '*.');
    const L = await reply('⏳ *ADD CENTRAL*\n🎯 destino: ESTE grupo\n📇 fonte: ' + desc + ' → *' + lista.length + '* contactos');
    return executarAddCentral(sock, msg, ctx, reply, { jid: ctx.remoteJid, nome: 'este grupo' }, desc, lista, L);
  }, owner);
};
