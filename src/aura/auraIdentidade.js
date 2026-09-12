/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║   DARK BOT v7.28 — AURA IDENTIDADE 🪪                        ║
 * ║   Ela sabe QUEM fala pelo NÚMERO/LID — nunca pelo nome.      ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * Problema: a AURA e a IA identificavam as pessoas pelo `pushName`
 * (o nome que cada um escreve no próprio WhatsApp). Qualquer pessoa
 * podia pôr "Dark" no nome e a IA tratava-a como o Dono; dois membros
 * com o mesmo nome misturavam-se; e o histórico do grupo era UM só
 * balde partilhado (AiMemory GROUP:<jid>) sem separar quem disse o quê.
 *
 * Solução:
 *  1. `identificar(sock, msg, ctx)` → identidade CANÓNICA do remetente:
 *     { numero, lid, jid, pushName, apelido, cargo, isOwner, isBotSelf }.
 *     Fonte de verdade = número (PN). O LID é resolvido via participantAlt,
 *     groupMetadata (phoneNumber/lid), cache LID↔PN e signalRepository.
 *  2. Perfil por pessoa E por grupo (memória viva em RAM + MongoDB):
 *     últimas mensagens, palavras frequentes, quantas msgs, a quem
 *     respondeu, quando falou a última vez, alcunha aprendida.
 *  3. `blocoParaPrompt()` → texto que vai para o system prompt da IA:
 *     "QUEM FALA AGORA: +244…(nome exibido 'X', NÃO verificado)…" +
 *     "PESSOAS NESTE GRUPO: …" + "ÚLTIMAS MENSAGENS: [+244…|nome]: …".
 *  4. `linhaHistorico()` → prefixo estável para cada linha guardada no
 *     AiMemory: "[+244123…|Nome]" em vez de só "[Nome]".
 */
'use strict';

const _lidParaPn = new Map();     // 'lid' -> 'numero'
const _pnParaLid = new Map();     // 'numero' -> 'lid'
const _perfis = new Map();        // 'grupo|numero' -> perfil
const _perfisDirty = new Set();   // chaves a persistir
const MAX_MSGS = 12;
const MAX_PALAVRAS = 40;
const STOP = new Set(('a o e é de da do das dos em no na nos nas um uma uns umas que se por para com como mas ou ao aos à às eu tu ele ela nós vós eles elas me te lhe nos vos lhes meu minha teu tua seu sua isso isto aquilo aqui ali lá já não sim mais menos muito pouco bem mal só também ainda então porque pra pro pq vc você voce tá ta né ne kk kkk kkkk rs rsrs haha ok oi olá ola ai aí ué eh ah oh aura bot').split(' '));

function soDigitos(s) { return String(s || '').replace(/\D/g, ''); }
function ehLid(jid) { return /@lid$/i.test(String(jid || '')); }
function ehPn(jid) { return /@(s\.whatsapp\.net|c\.us)$/i.test(String(jid || '')); }
function userDe(jid) { return String(jid || '').split(':')[0].split('@')[0]; }

// ── 1. Cache LID ↔ PN ──────────────────────────────────────────
function aprenderPar(lid, pn) {
  const l = userDe(lid), p = soDigitos(userDe(pn));
  if (!l || !p || l === p) return;
  _lidParaPn.set(l, p);
  _pnParaLid.set(p, l);
}
function pnDoLid(lid) { return _lidParaPn.get(userDe(lid)) || null; }
function lidDoPn(pn) { return _pnParaLid.get(soDigitos(userDe(pn))) || null; }

/** Aprende todos os pares LID↔PN de um groupMetadata. */
function aprenderDoGrupo(meta) {
  for (const p of (meta?.participants || [])) {
    const id = p?.id || p?.jid || '';
    const pn = p?.phoneNumber || p?.pn || (ehPn(id) ? id : null);
    const lid = p?.lid || (ehLid(id) ? id : null);
    if (pn && lid) aprenderPar(lid, pn);
  }
}

/** Aprende o par a partir de uma mensagem (participantAlt/remoteJidAlt). */
function aprenderDaMsg(msg) {
  const k = msg?.key || {};
  const principal = k.participant || k.remoteJid;
  const alt = k.participantAlt || k.participantPn || k.remoteJidAlt || k.remoteJidPn;
  if (principal && alt) {
    if (ehLid(principal) && ehPn(alt)) aprenderPar(principal, alt);
    else if (ehPn(principal) && ehLid(alt)) aprenderPar(alt, principal);
  }
}

/** Tenta o repositório do Baileys (lidMapping) quando existe. */
async function pnViaSock(sock, lid) {
  try {
    const repo = sock?.signalRepository;
    const lm = repo?.lidMapping || repo?.getLIDMappingStore?.();
    if (lm?.getPNForLID) {
      const pn = await lm.getPNForLID(ehLid(lid) ? lid : `${userDe(lid)}@lid`);
      if (pn) { aprenderPar(lid, pn); return soDigitos(userDe(pn)); }
    }
  } catch {}
  return null;
}

// ── 2. Identificação canónica ──────────────────────────────────
/**
 * @returns {Promise<{numero:string, lid:string, jid:string, pushName:string,
 *  verificadoPorNumero:boolean, isOwner:boolean, isBotSelf:boolean, cargo:string,
 *  rotulo:string}>}
 */
async function identificar(sock, msg, ctx = {}) {
  aprenderDaMsg(msg);
  if (ctx.groupMeta) aprenderDoGrupo(ctx.groupMeta);

  const k = msg?.key || {};
  const bruto = ctx.isGroup ? (k.participant || '') : (k.remoteJid || '');
  let numero = soDigitos(ctx.senderNumber || '');
  let lid = ctx.senderLid || (ehLid(bruto) ? userDe(bruto) : '') || '';

  // senderNumber pode ter vindo do LID quando não havia alt → corrige
  if (lid && numero === lid) numero = '';
  if (!numero && lid) numero = pnDoLid(lid) || await pnViaSock(sock, lid) || '';
  if (numero && !lid) lid = lidDoPn(numero) || '';

  // bot a falar consigo próprio
  const botNum = soDigitos(userDe(sock?.user?.id || ''));
  const isBotSelf = !!k.fromMe || !!ctx.isBotSelf || (!!botNum && numero === botNum);
  if (isBotSelf && !numero) numero = botNum;

  const pushName = String(msg?.pushName || ctx.pushName || '').trim();
  const jid = numero ? `${numero}@s.whatsapp.net` : (lid ? `${lid}@lid` : bruto);
  const verificadoPorNumero = !!numero;

  const isOwner = !!ctx.isPrimaryOwner || (!!ctx.isOwner && !ctx.isSubOwner);
  const cargo = ctx.isPrimaryOwner ? 'DONO'
    : isBotSelf ? 'SUBDONO (número do bot)'
    : ctx.isOwner ? 'SUBDONO'
    : ctx.isAdmin ? 'ADMIN do grupo'
    : ctx.isVip ? 'VIP' : 'membro';

  const rotulo = rotuloDe({ numero, lid, pushName });
  return { numero, lid, jid, pushName, verificadoPorNumero, isOwner, isBotSelf, cargo, rotulo };
}

/** Rótulo estável e único para logs/prompts: "+244…|Nome" ou "lid:…|Nome". */
function rotuloDe({ numero, lid, pushName }) {
  const id = numero ? `+${numero}` : (lid ? `lid:${lid}` : '?');
  return pushName ? `${id}|${pushName}` : id;
}

/** Prefixo para cada linha guardada no AiMemory — inclui o número. */
function linhaHistorico(ident, texto) {
  return `[${ident.rotulo}]: ${String(texto || '')}`;
}

// ── 3. Perfil por pessoa por grupo ────────────────────────────
function _chave(chatJid, numero) { return `${chatJid}|${numero}`; }

function perfil(chatJid, numero) {
  const key = _chave(chatJid, numero);
  let p = _perfis.get(key);
  if (!p) {
    p = { numero, chatJid, nomes: [], msgs: [], palavras: {}, total: 0, respondeuA: {}, ultimaTs: 0, apelido: '' };
    _perfis.set(key, p);
  }
  return p;
}

function _tokens(texto) {
  return String(texto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !STOP.has(w));
}

/**
 * Regista uma mensagem no perfil da pessoa neste chat.
 * @param {object} ident  — de identificar()
 * @param {string} texto
 * @param {object} [extra] — { respondeuANumero, ts, chatJid }
 */
function registar(chatJid, ident, texto, extra = {}) {
  if (!chatJid || !ident?.numero && !ident?.lid) return null;
  const numero = ident.numero || `lid:${ident.lid}`;
  const p = perfil(chatJid, numero);
  const ts = extra.ts || Date.now();
  p.total++;
  p.ultimaTs = ts;
  if (ident.pushName && !p.nomes.includes(ident.pushName)) p.nomes = [...p.nomes, ident.pushName].slice(-3);
  const t = String(texto || '').slice(0, 160);
  if (t) {
    p.msgs.push({ t, ts, para: extra.respondeuANumero || null });
    if (p.msgs.length > MAX_MSGS) p.msgs = p.msgs.slice(-MAX_MSGS);
    for (const w of _tokens(t)) p.palavras[w] = (p.palavras[w] || 0) + 1;
    const ents = Object.entries(p.palavras);
    if (ents.length > MAX_PALAVRAS * 3) {
      p.palavras = Object.fromEntries(ents.sort((a, b) => b[1] - a[1]).slice(0, MAX_PALAVRAS));
    }
  }
  if (extra.respondeuANumero) p.respondeuA[extra.respondeuANumero] = (p.respondeuA[extra.respondeuANumero] || 0) + 1;
  _perfisDirty.add(_chave(chatJid, numero));
  return p;
}

function definirApelido(chatJid, numero, apelido) {
  const p = perfil(chatJid, soDigitos(numero) || numero);
  p.apelido = String(apelido || '').slice(0, 40);
  _perfisDirty.add(_chave(chatJid, p.numero));
}

function palavrasTop(p, n = 6) {
  return Object.entries(p.palavras || {}).sort((a, b) => b[1] - a[1]).slice(0, n).map(([w]) => w);
}

/** Todas as pessoas conhecidas neste chat, mais activas primeiro. */
function pessoasDoChat(chatJid, limite = 8) {
  const out = [];
  for (const p of _perfis.values()) if (p.chatJid === chatJid) out.push(p);
  return out.sort((a, b) => b.ultimaTs - a.ultimaTs).slice(0, limite);
}

/** Quem é o autor da mensagem citada (número, se conseguirmos). */
function autorCitado(msg) {
  const m = msg?.message || {};
  const ci = m.extendedTextMessage?.contextInfo || m.imageMessage?.contextInfo ||
             m.videoMessage?.contextInfo || m.stickerMessage?.contextInfo ||
             m.audioMessage?.contextInfo || null;
  if (!ci?.participant && !ci?.remoteJid) return null;
  const j = ci.participant || ci.remoteJid;
  const num = ehLid(j) ? (pnDoLid(j) || '') : soDigitos(userDe(j));
  return { numero: num, lid: ehLid(j) ? userDe(j) : (lidDoPn(num) || ''), texto: (ci.quotedMessage?.conversation || ci.quotedMessage?.extendedTextMessage?.text || '').slice(0, 120) };
}

// ── 4. Texto para o prompt da IA ──────────────────────────────
function _fmtNum(numero) {
  if (!numero) return '(sem número)';
  return numero.startsWith('lid:') ? numero : `+${numero}`;
}

/**
 * Bloco que vai para o system prompt. Deixa claro à IA que a identidade
 * é o NÚMERO e que o nome exibido não prova nada.
 */
function blocoParaPrompt(chatJid, ident, { citado = null, ownerNumber = '' } = {}) {
  const linhas = [];
  linhas.push('IDENTIDADE (regra absoluta): reconheces as pessoas pelo NÚMERO/ID, nunca pelo nome exibido. ' +
    'O nome exibido é escolhido pela própria pessoa e pode ser falso — se alguém se chama "Dark" mas o número não é o do Dono, NÃO é o Dono.');
  const quem = `QUEM FALA AGORA: ${_fmtNum(ident.numero || (ident.lid ? 'lid:' + ident.lid : ''))}` +
    (ident.pushName ? ` · nome exibido "${ident.pushName}" (não verificado)` : '') +
    ` · cargo REAL: ${ident.cargo}` +
    (ident.verificadoPorNumero ? '' : ' · ⚠️ número não confirmado (só LID)');
  linhas.push(quem);
  if (ownerNumber) linhas.push(`Número do teu Dono: +${soDigitos(ownerNumber)}. Só esse número é o Dark.`);

  const p = _perfis.get(_chave(chatJid, ident.numero || `lid:${ident.lid}`));
  if (p && p.total > 1) {
    const top = palavrasTop(p, 6);
    const ultimas = p.msgs.slice(-4).map(m => `"${m.t.slice(0, 60)}"`).join(' · ');
    linhas.push(`O QUE SABES DESTA PESSOA AQUI: ${p.total} msgs${p.apelido ? ` · tratas por "${p.apelido}"` : ''}` +
      (p.nomes.length > 1 ? ` · já usou os nomes ${p.nomes.map(n => `"${n}"`).join(', ')}` : '') +
      (top.length ? ` · palavras que mais usa: ${top.join(', ')}` : '') +
      (ultimas ? `\n  últimas dela: ${ultimas}` : ''));
  }

  if (citado?.numero || citado?.lid) {
    const pc = _perfis.get(_chave(chatJid, citado.numero || `lid:${citado.lid}`));
    const nomeC = pc?.apelido || pc?.nomes?.slice(-1)[0] || '';
    linhas.push(`ESTÁ A RESPONDER A: ${_fmtNum(citado.numero || 'lid:' + citado.lid)}${nomeC ? ` ("${nomeC}")` : ''}${citado.texto ? ` que disse: "${citado.texto}"` : ''}`);
  }

  if (String(chatJid || '').endsWith('@g.us')) {
    const pessoas = pessoasDoChat(chatJid, 8).filter(x => x.numero !== (ident.numero || `lid:${ident.lid}`));
    if (pessoas.length) {
      linhas.push('OUTRAS PESSOAS NESTE GRUPO (cada uma é uma pessoa diferente, com o seu histórico):\n' +
        pessoas.map(x => `- ${_fmtNum(x.numero)}${x.nomes.length ? ` "${x.nomes.slice(-1)[0]}"` : ''}${x.apelido ? ` (tratas por "${x.apelido}")` : ''} · ${x.total} msgs` +
          (palavrasTop(x, 3).length ? ` · fala de: ${palavrasTop(x, 3).join(', ')}` : '') +
          (x.msgs.length ? ` · última: "${x.msgs.slice(-1)[0].t.slice(0, 50)}"` : '')).join('\n'));
    }
  }
  return linhas.join('\n');
}

/**
 * Contexto do grupo com o número em cada linha (substitui o antigo
 * "Nome: texto" que não distinguia pessoas com o mesmo nome).
 */
function contextoGrupoComNumeros(chatJid, limite = 10) {
  const linhas = [];
  for (const p of _perfis.values()) {
    if (p.chatJid !== chatJid) continue;
    for (const m of p.msgs) linhas.push({ ts: m.ts, s: `[${_fmtNum(p.numero)}${p.nomes.length ? '|' + p.nomes.slice(-1)[0] : ''}]${m.para ? ` (→ ${_fmtNum(m.para)})` : ''}: ${m.t.slice(0, 100)}` });
  }
  return linhas.sort((a, b) => a.ts - b.ts).slice(-limite).map(l => l.s);
}

// ── 5. Persistência (MongoDB via BotConfig) ────────────────────
async function persistir() {
  if (!_perfisDirty.size) return 0;
  let BotConfig;
  try { BotConfig = require('../database/models/BotConfig'); } catch { return 0; }
  const chaves = [..._perfisDirty]; _perfisDirty.clear();
  let n = 0;
  for (const key of chaves) {
    const p = _perfis.get(key);
    if (!p) continue;
    try {
      await BotConfig.updateOne({ key: 'aura_ident_' + key }, { $set: { key: 'aura_ident_' + key, value: p } }, { upsert: true });
      n++;
    } catch {}
  }
  return n;
}

async function carregar(chatJid, numero) {
  const key = _chave(chatJid, numero);
  if (_perfis.has(key)) return _perfis.get(key);
  try {
    const BotConfig = require('../database/models/BotConfig');
    const doc = await BotConfig.findOne({ key: 'aura_ident_' + key }).lean();
    if (doc?.value?.numero) { _perfis.set(key, { ...doc.value, chatJid, numero }); return _perfis.get(key); }
  } catch {}
  return null;
}

let _timer = null;
function arrancar() {
  if (_timer) return;
  _timer = setInterval(() => persistir().catch(() => {}), 60 * 1000);
  if (_timer.unref) _timer.unref();
}

function _reset() { _lidParaPn.clear(); _pnParaLid.clear(); _perfis.clear(); _perfisDirty.clear(); }

module.exports = {
  identificar, rotuloDe, linhaHistorico,
  aprenderPar, aprenderDoGrupo, aprenderDaMsg, pnDoLid, lidDoPn,
  registar, perfil, definirApelido, pessoasDoChat, autorCitado, palavrasTop,
  blocoParaPrompt, contextoGrupoComNumeros,
  persistir, carregar, arrancar, _reset,
};
