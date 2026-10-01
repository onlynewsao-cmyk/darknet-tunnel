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
const _addsEmCurso = new Set(); // destino → impede duas campanhas simultâneas e tentativas duplicadas

// O WhatsApp recente pode devolver um participante pelo número normal, por
// JID multi-device (244…:12@s.whatsapp.net) ou por LID (…@lid). Centralizar
// isto evita tanto um falso "não sou admin" como tentar re-adicionar alguém.
const numJid = (v) => String(v || '').split(':')[0].split('@')[0].replace(/\D/g, '');
const ehLid = (v) => /@lid$/i.test(String(v || ''));
const camposParticipante = (p) => p && typeof p === 'object'
  ? [p.id, p.jid, p.lid, p.phoneNumber, p.pn].filter(Boolean)
  : [p].filter(Boolean);
const eAdmin = (p) => p?.admin === 'admin' || p?.admin === 'superadmin' || p?.isAdmin === true;

/** Resolve um LID para número sem depender de uma única versão do Baileys. */
async function numeroDoLid(sock, lid) {
  if (!lid) return '';
  try {
    const ident = require('../../aura/auraIdentidade');
    const doCache = ident.pnDoLid?.(lid);
    if (doCache) return numJid(doCache);
  } catch {}
  try {
    const repo = sock?.signalRepository;
    const mapa = repo?.lidMapping || repo?.getLIDMappingStore?.();
    const pn = await mapa?.getPNForLID?.(ehLid(lid) ? lid : (numJid(lid) + '@lid'));
    if (pn) return numJid(pn);
  } catch {}
  return '';
}

/** Números que já pertencem ao grupo, mesmo quando a metadata vier por LID. */
async function numerosNoGrupo(sock, participantes) {
  const nums = new Set();
  const lids = new Set();
  try { require('../../aura/auraIdentidade').aprenderDoGrupo?.({ participants: participantes }); } catch {}
  for (const p of participantes || []) {
    for (const campo of camposParticipante(p)) {
      if (ehLid(campo)) lids.add(String(campo));
      else { const n = numJid(campo); if (n) nums.add(n); }
    }
  }
  // Só resolve LIDs sem número explícito. O mapeamento fica no cache do socket;
  // Promise.all não faz chamadas de rede e impede atrasar uma base grande.
  const resolvidos = await Promise.all([...lids].map(lid => numeroDoLid(sock, lid)));
  for (const n of resolvidos) if (n) nums.add(n);
  return nums;
}

/** Confirma que ESTE bot, não outro participante, é admin no destino. */
async function botEhAdmin(sock, meta) {
  const meu = camposParticipante(sock?.user || {});
  const meusBrutos = new Set(meu.map(v => String(v).toLowerCase()));
  const meuNum = meu.map(numJid).find(Boolean) || '';
  if (!meuNum && !meusBrutos.size) return false;
  try { require('../../aura/auraIdentidade').aprenderDoGrupo?.(meta); } catch {}

  for (const p of meta?.participants || []) {
    if (!eAdmin(p)) continue;
    const campos = camposParticipante(p);
    // Igualdade exacta cobre LID do próprio bot e JID normal.
    if (campos.some(v => meusBrutos.has(String(v).toLowerCase()))) return true;
    // Nunca compara o número cru de um LID (não é um telefone).
    if (campos.some(v => !ehLid(v) && numJid(v) === meuNum)) return true;
    for (const lid of campos.filter(ehLid)) {
      if ((await numeroDoLid(sock, lid)) === meuNum) return true;
    }
  }
  return false;
}

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
    + '\n• \`' + ctx.prefix + 'add <dest> 20 de todos\` — só 20 elegíveis (ex.: grupo 10: \`add 10 20 de todos\`)'
    + '\n• \`' + ctx.prefix + 'add <dest> de 3\` — de 1 grupo'
    + '\n• \`' + ctx.prefix + 'add <dest> de 3 5\` — de 2 grupos'
    + '\n• \`' + ctx.prefix + 'add <dest> de pais:angola\` — de 1 país'
    + '\n• \`' + ctx.prefix + 'add <dest> de pais:angola+brasil\` — de 2 países'
    + '\n• \`' + ctx.prefix + 'add <dest> de ddd:244 9\` — por operadora'
    + '\n• \`' + ctx.prefix + 'add 244912345678\` — adiciona 1 pessoa AQUI'
    + '\n\n🔎 Antes de cada add, o bot confirma admin, ignora repetidos da base e quem já está no grupo.'
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
async function executarAddCentral(sock, msg, ctx, reply, gDest, fonteDesc, lista, L, opcoes = {}) {
  const destino = String(gDest?.jid || '');
  if (!destino) return reply('❌ Grupo destino inválido. Corre `gruposbot` e usa o número da lista.');
  if (_addsEmCurso.has(destino)) return reply('⏳ Já há uma adição em curso para *' + String(gDest.nome || 'este grupo').slice(0, 40) + '*. Aguarda terminar para não duplicar tentativas.');
  _addsEmCurso.add(destino);
  try {
    return await _executarAddCentral(sock, msg, ctx, reply, gDest, fonteDesc, lista, L, opcoes);
  } finally {
    _addsEmCurso.delete(destino);
  }
}

async function _executarAddCentral(sock, msg, ctx, reply, gDest, fonteDesc, lista, L, opcoes = {}) {
  let metaDest = null;
  try {
    metaDest = await sock.groupMetadata(gDest.jid);
    const souAdm = await botEhAdmin(sock, metaDest);
    if (!souAdm) return buttonHandler.sendButtons(sock, ctx.remoteJid,
      '⚠️ Não consegui confirmar que este número é *admin* de *' + String(gDest.nome).slice(0, 40) + '*.\n\n🔎 Verifiquei número normal, JID multi-dispositivo e LID. Promove o bot a admin e tenta de novo — não fiz nenhuma tentativa de add.', 'Central',
      [{ id: ctx.prefix + 'gruposbot', text: '📋 Ver grupos' }], msg);
  } catch (e) { return reply('❌ Não consegui ler o grupo destino: ' + (e.message || '').slice(0, 80)); }

  // comunidade PAI (grupo de anúncios) não aceita add directo
  if (metaDest.isParentGroup || /comunity|comunidade/i.test(metaDest.subject || '')) {
    const filhos = (metaDest.participants || []).length;
    return buttonHandler.sendButtons(sock, ctx.remoteJid,
      '🏘️ *' + String(gDest.nome).slice(0, 40) + '* é uma COMUNIDADE (grupo de anúncios) — o WhatsApp não deixa adicionar membros directamente.\n\n👉 Usa um dos *subgrupos* como destino: `gruposbot` e vê os ↳ filhos.', 'Central',
      [{ id: ctx.prefix + 'gruposbot', text: '📋 Ver grupos' }], msg);
  }

  // Primeiro lê TODA a metadata e monta a fila segura. Assim, contactos que
  // estão na Central MAS já pertencem ao destino nunca chegam ao WhatsApp em
  // groupParticipantsUpdate. Suporta id normal, multi-dispositivo e LID.
  const jaMembros = await numerosNoGrupo(sock, metaDest.participants || []);
  const unicos = new Set();
  const baseUnica = [];
  let repetidosNaBase = 0;
  for (const contacto of (lista || [])) {
    const num = numJid(contacto?.num || contacto?.jid || '');
    if (!num || unicos.has(num)) { repetidosNaBase++; continue; }
    unicos.add(num);
    // Nunca usa um @lid como alvo do add; o WhatsApp recebe sempre o número.
    baseUnica.push({ ...contacto, num, jid: num + '@s.whatsapp.net' });
  }
  const jaMembrosLista = baseUnica.filter(x => jaMembros.has(x.num));
  const fila = baseUnica.filter(x => !jaMembros.has(x.num));
  const jaMembrosN = jaMembrosLista.length;

  // LIMITE do grupo (WhatsApp: 1024 membros)
  const MAX_GRUPO = 1024;
  const atuais = (metaDest.participants || []).length;
  const vagas = Math.max(0, MAX_GRUPO - atuais);
  if (!vagas) return reply('🚫 *' + String(gDest.nome).slice(0, 40) + '* está CHEIO (' + atuais + '/' + MAX_GRUPO + '). O WhatsApp não deixa passar de ' + MAX_GRUPO + ' membros.');
  const limitePedido = Math.max(0, Number(opcoes.limite) || 0);
  const limiteReal = limitePedido ? Math.min(limitePedido, vagas) : vagas;
  const alvo = fila.slice(0, limiteReal);
  if (!alvo.length) return reply('✅ Ninguém a adicionar — dos *' + (lista || []).length + '* contactos da fonte, *' + jaMembrosN + '* já são membros' + (repetidosNaBase ? ' e *' + repetidosNaBase + '* são repetidos na base' : '') + '. Não fiz nenhuma tentativa de add.');

  const est = '👥 ' + atuais + '/' + MAX_GRUPO + ' · vagas: ' + vagas + (jaMembrosN ? ' · já membros: ' + jaMembrosN : '') + (repetidosNaBase ? ' · repetidos base: ' + repetidosNaBase : '');
  const plano = '⏳ *ADD CENTRAL — FILA SEGURA*\n🎯 destino: ' + String(gDest.nome).slice(0, 40) + '\n📇 fonte: ' + fonteDesc + ' → ' + (lista || []).length + ' na base\n♻️ já estavam no grupo: *' + jaMembrosN + '*' + (repetidosNaBase ? '\n🧹 repetidos da base ignorados: *' + repetidosNaBase + '*' : '') + '\n✅ elegíveis: *' + fila.length + '* → vou tentar: *' + alvo.length + '*' + (limitePedido ? ' (limite pedido: ' + limitePedido + ')' : '') + '\n🚦 lotes humanos de 3–5 · pausa 3–8s';
  if (L?.key) { try { await sock.sendMessage(ctx.remoteJid, { edit: L.key, text: plano }); } catch {} }
  if (fila.length > limiteReal) await reply('⚠️ Há *' + fila.length + '* elegíveis, mas vou tentar só *' + alvo.length + '*' + (limitePedido ? ' pelo limite pedido' : ' pelas vagas do grupo') + '.');
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
  let texto = '✅ *ADD CENTRAL CONCLUÍDO*' + (abortado ? ' (parcial — parado por segurança)' : '') + '\n\n🎯 ' + String(gDest.nome).slice(0, 40) + '\n👥 ' + (atuais + okN.length) + '/' + MAX_GRUPO + ' membros\n✅ adicionados: *' + okN.length + '*' + (jaMembrosN ? '\n♻️ já eram membros (nem tentei): *' + jaMembrosN + '*' : '') + (repetidosNaBase ? '\n🧹 repetidos na base ignorados: ' + repetidosNaBase : '') + '\n❌ não deixaram (privacidade/erro): *' + falharam.length + '*';
  if (fila.length > alvo.length) texto += '\n📦 ficaram *' + (fila.length - alvo.length) + '* elegíveis sem tentar (limite/vagas) — corre de novo quando quiseres continuar.';
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
    // .add <número> → uma pessoa no grupo actual. Mesmo sendo só uma acção,
    // aplica as travas da Central: comunidade-pai, grupo cheio, membro existente
    // e reconhecimento robusto de admin (número/JID multi-device/LID).
    if (/^\+?\d{7,15}$/.test(argDest) && !args.slice(1).map(x => String(x).toLowerCase()).includes('de')) {
      if (!/@g\.us$/.test(ctx.remoteJid || '')) return reply('Para adicionar 1 pessoa, usa o comando DENTRO do grupo. Para puxar a base: *add <dest> de …*');
      const num = argDest.replace(/\D/g, '');
      try {
        const meta = await sock.groupMetadata(ctx.remoteJid);
        const participantes = meta?.participants || [];
        if (meta?.isParentGroup || /comunity|comunidade/i.test(meta?.subject || '')) {
          return reply('🏘️ Este é o grupo de anúncios de uma *COMUNIDADE*. O WhatsApp não permite adicionar membros directamente — usa um subgrupo.');
        }
        if (participantes.length >= 1024) return reply('🚫 Este grupo está CHEIO (' + participantes.length + '/1024). Remove alguém ou usa outro grupo.');
        if (!await botEhAdmin(sock, meta)) return reply('⚠️ Não consegui confirmar que sou *admin* neste grupo (verifiquei número, JID multi-dispositivo e LID). Promove-me e tenta de novo — não fiz tentativa de add.');
        if ((await numerosNoGrupo(sock, participantes)).has(num)) return reply('ℹ️ +' + num + ' já é membro deste grupo — não tentei adicionar de novo.');
        await sock.groupParticipantsUpdate(ctx.remoteJid, [num + '@s.whatsapp.net'], 'add');
        return reply('✅ +' + num + ' adicionado ao grupo!');
      } catch (e) {
        if (/not admin|forbidden|403/i.test(e?.message || '')) return reply('⚠️ Preciso ser *admin* do grupo! Promove-me.');
        return reply('❌ ' + (e?.message || 'erro').slice(0, 80));
      }
    }
    const gDest = await pickGrupo(sock, ctx.remoteJid, argDest);
    if (!gDest) return reply(`Destino "${argDest}" não encontrado — corre *gruposbot* para ver a lista.`);
    // Sintaxe de limite: .add <grupo> <quantidade> de <fonte>
    // Ex.: .add 10 20 de todos = grupo #10, no máximo 20 elegíveis.
    const indiceDe = args.findIndex(a => String(a).toLowerCase() === 'de');
    let limite = 0;
    if (indiceDe > 1) {
      if (!/^\d{1,4}$/.test(String(args[1] || ''))) return reply('❌ Quantidade inválida. Usa: `' + ctx.prefix + 'add <grupo> <1–1024> de todos`\nEx.: `' + ctx.prefix + 'add 10 20 de todos`');
      limite = Number(args[1]);
      if (limite < 1 || limite > 1024) return reply('❌ A quantidade deve ficar entre *1 e 1024*.');
    } else if (args.length > 1 && indiceDe < 0) {
      return reply('Uso: `' + ctx.prefix + 'add <grupo> [quantidade] de <fonte>`\nEx.: `' + ctx.prefix + 'add 10 20 de todos`');
    }
    // fonte — 1/2 grupos · 1/2 países · ddd · todos
    const argDeRaw = indiceDe >= 0 ? args.slice(indiceDe + 1).join(' ').trim() : 'todos';
    const _fonte = await parseFonte(sock, ctx.remoteJid, argDeRaw);
    if (_fonte.erro) return reply(_fonte.erro);
    const fonteDesc = _fonte.desc;
    const lista = _fonte.lista;
    if (!lista || !lista.length) return reply('A base/fonte está vazia — corre *capturartodos* primeiro.');
    const L = await reply(`🔎 *A VERIFICAR ADD CENTRAL*\n🎯 destino: ${gDest.nome.slice(0, 40)}\n📇 fonte: ${fonteDesc} → *${lista.length}* contactos${limite ? `\n🎚️ limite pedido: *${limite}* elegíveis` : ''}\n\nA confirmar primeiro: se sou admin, membros actuais, repetidos da base e vagas. Só depois tento adicionar.`);
    return executarAddCentral(sock, msg, ctx, reply, gDest, fonteDesc, lista, L, { limite });
    // v12.9.44: SEM o 3º argumento — 'owner'(=true) é lido pelo caseHandler como
    // onlyIfNew e o 'add' já vinha registado por outro ficheiro (a…/g…) → a central
    // ficava de fora. O gate de dono está no only() acima.
  });

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
