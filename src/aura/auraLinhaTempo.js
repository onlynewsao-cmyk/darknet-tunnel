/**
 * DARK BOT v7.42 — LINHA DO TEMPO DO GRUPO
 *
 * "quem fez, faz, fez quando": ela regista tudo o que ACONTECE no grupo
 * (não só o que se escreve) — entradas, saídas, remoções, promoções,
 * despromoções, grupo fechado/aberto, nome/descrição mudados, e o que
 * ELA própria executou por ordem de alguém (bans, mutes, antilink…).
 *
 * Cada evento: { ts, tipo, quem (autor), alvo, detalhe }.
 * Responde a "quem promoveu o João?", "quem saiu ontem?", "quem fechou
 * o grupo?", "o que aconteceu aqui hoje?" — sempre COM data/hora.
 *
 * Persistência: BotConfig `aura_timeline_<jid>` (últimos 400 eventos).
 */
'use strict';

const MAX = 400;
const _tl = new Map();        // jid → [{ts,tipo,quem,alvo,detalhe}]
const _dirty = new Set();
let _persistTimer = null;

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
const num = (j) => String(j || '').split(':')[0].split('@')[0].replace(/\D/g, '');

const TIPOS = {
  entrou:     { verbo: 'entrou',            emoji: '📥' },
  saiu:       { verbo: 'saiu',              emoji: '📤' },
  removido:   { verbo: 'foi removido',      emoji: '🚫' },
  promovido:  { verbo: 'foi promovido a admin', emoji: '⭐' },
  despromovido:{ verbo: 'deixou de ser admin', emoji: '⬇️' },
  fechou:     { verbo: 'fechou o grupo',    emoji: '🔒' },
  abriu:      { verbo: 'abriu o grupo',     emoji: '🔓' },
  nome:       { verbo: 'mudou o nome do grupo', emoji: '✏️' },
  descricao:  { verbo: 'mudou a descrição', emoji: '📝' },
  foto:       { verbo: 'mudou a foto',      emoji: '🖼️' },
  comando:    { verbo: 'pediu',             emoji: '⚙️' },
  bot_entrou: { verbo: 'o bot entrou',      emoji: '🤖' },
};

async function _carregar(jid) {
  if (_tl.has(jid)) return _tl.get(jid);
  let lista = [];
  try {
    const BotConfig = require('../database/models/BotConfig');
    const v = await BotConfig.get('aura_timeline_' + jid, null);
    if (Array.isArray(v)) lista = v;
  } catch {}
  _tl.set(jid, lista);
  return lista;
}

function _agendarPersist() {
  if (_persistTimer) return;
  _persistTimer = setTimeout(async () => {
    _persistTimer = null;
    const jids = [..._dirty]; _dirty.clear();
    let BotConfig; try { BotConfig = require('../database/models/BotConfig'); } catch { return; }
    for (const j of jids) {
      try { await BotConfig.set('aura_timeline_' + j, _tl.get(j) || []); } catch {}
    }
  }, 4000);
}

/**
 * Regista um evento.
 * @param {string} jid grupo
 * @param {{tipo:string, quem?:string, quemNome?:string, alvo?:string, alvoNome?:string, detalhe?:string, ts?:number}} ev
 */
async function registar(jid, ev) {
  if (!jid || !ev?.tipo) return;
  const lista = await _carregar(jid);
  lista.push({
    ts: ev.ts || Date.now(),
    tipo: ev.tipo,
    quem: num(ev.quem), quemNome: String(ev.quemNome || '').slice(0, 40),
    alvo: num(ev.alvo), alvoNome: String(ev.alvoNome || '').slice(0, 40),
    detalhe: String(ev.detalhe || '').slice(0, 120),
  });
  if (lista.length > MAX) lista.splice(0, lista.length - MAX);
  _dirty.add(jid);
  _agendarPersist();
}

/** Do evento Baileys `group-participants.update`. */
async function doEventoParticipantes(sock, event, meta) {
  const { id: jid, participants = [], action, author } = event || {};
  if (!jid) return;
  const botNum = num(sock?.user?.id);
  const nomeDe = (j) => meta?.participants?.find(p => num(p.id) === num(j))?.notify || '';
  const mapa = { add: 'entrou', remove: 'saiu', promote: 'promovido', demote: 'despromovido' };
  for (const p of participants) {
    const alvo = num(p);
    let tipo = mapa[action];
    if (!tipo) continue;
    if (action === 'add' && alvo === botNum) tipo = 'bot_entrou';
    // remove com autor ≠ alvo = foi removido por alguém
    if (action === 'remove' && author && num(author) !== alvo) tipo = 'removido';
    await registar(jid, { tipo, quem: author || (action === 'add' || action === 'remove' ? p : ''), quemNome: nomeDe(author), alvo: p, alvoNome: nomeDe(p) });
  }
}

/** Do evento Baileys `groups.update` (announce/subject/desc). */
async function doEventoGrupo(update) {
  const jid = update?.id; if (!jid) return;
  if (typeof update.announce === 'boolean') await registar(jid, { tipo: update.announce ? 'fechou' : 'abriu', quem: update.author });
  if (update.subject) await registar(jid, { tipo: 'nome', quem: update.author, detalhe: update.subject });
  if (update.desc !== undefined) await registar(jid, { tipo: 'descricao', quem: update.author });
}

/** O que ela executou por ordem de alguém ("aura bane o X"). */
async function doComando(jid, { quem, quemNome, cmd, args, alvo, alvoNome }) {
  await registar(jid, { tipo: 'comando', quem, quemNome, alvo, alvoNome, detalhe: (cmd + ' ' + (args || '')).trim() });
}

// ── Consulta ─────────────────────────────────────────────────────
const RE_PERGUNTA = /\b(quem|o que|que)\b.{0,30}\b(entrou|saiu|sairam|saíram|foi removido|removeu|removido|expulso|expulsou|baniu|promoveu|promovido|virou admin|deu adm|tirou (o )?adm|despromoveu|fechou|abriu|mudou o nome|mudou a desc|aconteceu|se passou|rolou|fez|fizeram|mexeu)\b/;
const RE_QUANDO = /\b(quando|a que horas|que dia|ha quanto tempo|há quanto tempo)\b.{0,30}\b(entrou|saiu|foi removido|promovido|virou admin|fechou|abriu|mudou)\b/;

function pareceConsulta(texto) {
  const t = norm(texto);
  return RE_PERGUNTA.test(t) || RE_QUANDO.test(t);
}

function _janela(t) {
  const agora = new Date();
  const ini = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };
  if (/\bhoje\b/.test(t)) return { de: ini(agora), rot: 'hoje' };
  if (/\bontem\b/.test(t)) { const y = new Date(agora); y.setDate(y.getDate() - 1); return { de: ini(y), ate: ini(agora), rot: 'ontem' }; }
  if (/\b(esta|essa) semana|ultimos 7 dias|últimos 7 dias\b/.test(t)) return { de: Date.now() - 7 * 864e5, rot: 'esta semana' };
  if (/\b(este|esse) mes|último mês|ultimo mes\b/.test(t)) return { de: Date.now() - 30 * 864e5, rot: 'este mês' };
  return { de: 0, rot: '' };
}

function _tiposDe(t) {
  const out = new Set();
  if (/\bentrou|entraram|chegou\b/.test(t)) out.add('entrou').add('bot_entrou');
  if (/\bsaiu|sairam|saíram|abandonou\b/.test(t)) out.add('saiu');
  if (/\bremov|expuls|baniu|banido|kick\b/.test(t)) out.add('removido').add('comando');
  if (/\bpromov|virou admin|deu adm|adm\b/.test(t)) out.add('promovido');
  if (/\bdespromov|tirou (o )?adm|deixou de ser admin\b/.test(t)) out.add('despromovido');
  if (/\bfechou|trancou\b/.test(t)) out.add('fechou');
  if (/\babriu|destrancou\b/.test(t)) out.add('abriu');
  if (/\bnome\b/.test(t)) out.add('nome');
  if (/\bdesc\b/.test(t)) out.add('descricao');
  if (/\bfez|fizeram|mexeu|pediu|mandou fazer\b/.test(t)) out.add('comando');
  return out; // vazio = todos
}

/**
 * Responde a uma pergunta sobre a linha do tempo. { ok, msg, mencionar }.
 */
async function responder(jid, texto, { quandoFoi } = {}) {
  const t = norm(texto);
  const lista = await _carregar(jid);
  const q = quandoFoi || (require('./auraUniversal').quandoFoi);
  if (!lista.length) return { ok: true, msg: 'Ainda não vi nada acontecer aqui desde que comecei a tomar nota. Daqui para a frente fico atenta. 👀' };
  const jan = _janela(t);
  const tipos = _tiposDe(t);
  const alvoNome = (t.match(/\b(?:o|a|ao|do|da)\s+@?([a-z0-9_.\-]{3,25})\b/) || [])[1];
  let evs = lista.filter(e => e.ts >= jan.de && (!jan.ate || e.ts < jan.ate));
  if (tipos.size) evs = evs.filter(e => tipos.has(e.tipo));
  if (alvoNome && !/^(grupo|admin|adm|bot|aura)$/.test(alvoNome)) {
    const a = norm(alvoNome);
    const f = evs.filter(e => norm(e.alvoNome).includes(a) || norm(e.quemNome).includes(a) || e.alvo.endsWith(a) || e.quem.endsWith(a));
    if (f.length) evs = f;
  }
  evs = evs.slice(-8).reverse();
  if (!evs.length) {
    return { ok: true, msg: `Não tenho nada disso registado${jan.rot ? ' ' + jan.rot : ''}. Ou não aconteceu, ou foi antes de eu começar a tomar nota.` };
  }
  const menc = new Set();
  const linhas = evs.map(e => {
    const T = TIPOS[e.tipo] || { verbo: e.tipo, emoji: '•' };
    const quem = e.quem ? `@${e.quem}` : '';
    const alvo = e.alvo ? `@${e.alvo}` : '';
    if (e.quem) menc.add(e.quem + '@s.whatsapp.net');
    if (e.alvo) menc.add(e.alvo + '@s.whatsapp.net');
    let frase;
    switch (e.tipo) {
      case 'entrou': frase = e.quem && e.quem !== e.alvo ? `${quem} adicionou ${alvo}` : `${alvo} entrou`; break;
      case 'saiu': frase = `${alvo} saiu`; break;
      case 'removido': frase = `${quem} removeu ${alvo}`; break;
      case 'promovido': frase = `${quem || 'alguém'} promoveu ${alvo} a admin`; break;
      case 'despromovido': frase = `${quem || 'alguém'} tirou o admin a ${alvo}`; break;
      case 'nome': frase = `${quem || 'alguém'} mudou o nome para "${e.detalhe}"`; break;
      case 'comando': frase = `${quem} pediu-me "${e.detalhe}"${alvo ? ' → ' + alvo : ''}`; break;
      default: frase = `${quem || 'alguém'} ${T.verbo}`;
    }
    return `${T.emoji} ${frase} — _${q(e.ts)}_`;
  });
  return { ok: true, msg: (jan.rot ? `O que vi ${jan.rot}:\n\n` : '') + linhas.join('\n'), mencionar: [...menc] };
}

/** Resumo curto para o prompt (últimos eventos), para ela "saber" antes de responder. */
async function paraPrompt(jid, n = 6) {
  const lista = await _carregar(jid);
  if (!lista.length) return '';
  const q = require('./auraUniversal').quandoFoi;
  const ult = lista.slice(-n).map(e => {
    const Q = e.quemNome || (e.quem ? '+' + e.quem : 'alguém');
    const A = e.alvoNome || (e.alvo ? '+' + e.alvo : '');
    let f;
    switch (e.tipo) {
      case 'entrou': f = e.quem && e.quem !== e.alvo ? `${Q} adicionou ${A}` : `${A} entrou`; break;
      case 'saiu': f = `${A} saiu`; break;
      case 'removido': f = `${Q} removeu ${A}`; break;
      case 'promovido': f = `${Q} promoveu ${A} a admin`; break;
      case 'despromovido': f = `${Q} tirou o admin a ${A}`; break;
      case 'comando': f = `${Q} pediu-me "${e.detalhe}"${A ? ' sobre ' + A : ''}`; break;
      case 'nome': f = `${Q} mudou o nome para "${e.detalhe}"`; break;
      default: f = `${Q} ${(TIPOS[e.tipo] || { verbo: e.tipo }).verbo}`;
    }
    return `• ${q(e.ts)}: ${f}`;
  });
  return 'ÚLTIMOS ACONTECIMENTOS NESTE GRUPO (factos, com data — usa-os se perguntarem quem fez o quê):\n' + ult.join('\n');
}

module.exports = { registar, doEventoParticipantes, doEventoGrupo, doComando, pareceConsulta, responder, paraPrompt, TIPOS };
