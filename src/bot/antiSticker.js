/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║  DARK BOT v6.87 — ANTI-STICKER POR APRENDIZAGEM 🕸️           ║
 * ╚═══════════════════════════════════════════════════════════════╝
 *
 * O pedido: "quero poder banir uma figurinha — respondo-lhe com o
 * comando e ele aprende que aquela figurinha não entra mais".
 *
 * ── COMO APRENDE ──────────────────────────────────────────────
 * Cada figurinha do WhatsApp traz na metadata um `fileSha256` (e um
 * `fileEncSha256`). Esse par É a identidade da figurinha: o mesmo
 * ficheiro reenviado por outra pessoa, noutro grupo, mantém o mesmo
 * hash. Por isso:
 *
 *   !bansticker (respondendo à figurinha)
 *        └─► guarda { groupJid, fileSha256 } no Mongo + em cache
 *
 *   qualquer sticker que entre no grupo
 *        └─► lê a metadata (SEM download) → está na cache? → apaga
 *
 * ── PORQUE É SEGURO PARA A PERFORMANCE ────────────────────────
 * • Não baixa nada: a comparação é de duas strings base64.
 * • Cache em memória por grupo, refrescada a cada 60 s.
 * • Se o Mongo estiver em baixo, funciona só com a cache (degradado
 *   mas vivo) — e não rebenta o listener.
 * • Só corre em grupos com o interruptor ligado (!antisticker on).
 */
'use strict';

const { mongoose } = require('../database/connection');

let _Model = null;
function Model() {
  if (!_Model) _Model = require('../database/models/BannedSticker');
  return _Model;
}

// ── CACHE EM MEMÓRIA ────────────────────────────────────────
// groupJid → Map<chave, { hash, hashEnc, animated }>
// A chave é o fileSha256 (ou o fileEncSha256, se aquele vier vazio).
// Uma figurinha = UM registo: os dois hashes são a mesma identidade,
// não duas entradas. (Na 1ª versão eram dois hashes soltos num Set e
// o !unbansticker só apagava um deles — a figurinha continuava banida.)
const cache = new Map();
// groupJid → { on, notify, ts } (definições do grupo, com TTL)
const interruptor = new Map();

function _grupo(groupJid) {
  const jid = String(groupJid || '');
  if (!cache.has(jid)) cache.set(jid, new Map());
  return cache.get(jid);
}

/** Procura uma figurinha por qualquer um dos dois hashes. */
function _procura(groupJid, hash) {
  if (!hash) return null;
  const mapa = cache.get(String(groupJid || ''));
  if (!mapa || !mapa.size) return null;
  if (mapa.has(hash)) return { chave: hash, ...mapa.get(hash) };
  for (const [chave, reg] of mapa) {
    if (reg.hash === hash || reg.hashEnc === hash) return { chave, ...reg };
  }
  return null;
}

let _carregado = false;
let _aCarregar = null;

function _dbUp() { return mongoose.connection.readyState === 1; }

/** Carrega as figurinhas aprendidas do Mongo para a cache. */
async function carregar(force = false) {
  if (_carregado && !force) return true;
  if (_aCarregar) return _aCarregar;
  _aCarregar = (async () => {
    try {
      if (!_dbUp()) return false;            // sem Mongo → só cache
      const lista = await Model().find({}).lean();
      const nova = new Map();
      for (const b of lista) {
        if (!b.groupJid) continue;
        const chave = b.hash || b.hashEnc;
        if (!chave) continue;
        if (!nova.has(b.groupJid)) nova.set(b.groupJid, new Map());
        nova.get(b.groupJid).set(chave, {
          hash: b.hash || '', hashEnc: b.hashEnc || '', animated: !!b.animated,
        });
      }
      // MERGE, não substituição: o que foi aprendido enquanto o Mongo
      // estava em baixo não pode ser apagado pelo primeiro load.
      const antiga = new Map([...cache].map(([g, m]) => [g, new Map(m)]));
      cache.clear();
      for (const [g, m] of nova) cache.set(g, m);
      for (const [g, m] of antiga) {
        if (!cache.has(g)) cache.set(g, new Map());
        for (const [k, reg] of m) {
          if (!cache.get(g).has(k)) cache.get(g).set(k, reg);
        }
      }
      _carregado = true;
      return true;
    } catch {
      return false;
    } finally {
      _aCarregar = null;
    }
  })();
  return _aCarregar;
}

// Refresco periódico (mesmo padrão do anti-status)
setInterval(() => { carregar(true).catch(() => {}); }, 60000).unref?.();

// ── IDENTIDADE DA FIGURINHA ─────────────────────────────────
/**
 * Normaliza o hash que vem do WhatsApp para base64 comparável.
 * O Baileys devolve bytes (Buffer/Uint8Array) ou string, conforme
 * a mensagem veio descodificada ou de JSON.
 */
function normalizarHash(v) {
  if (!v) return '';
  if (Buffer.isBuffer(v)) return v.toString('base64');
  if (v instanceof Uint8Array) return Buffer.from(v).toString('base64');
  return String(v).trim();
}

/**
 * Extrai a identidade de um stickerMessage (ou de uma mensagem que
 * o contenha). Devolve { hash, hashEnc, animated } ou null.
 */
function identidadeDe(msg) {
  const m = msg?.message || msg || {};
  const stk = m.stickerMessage
    || m.extendedTextMessage?.contextInfo?.quotedMessage?.stickerMessage
    || null;
  if (!stk) return null;
  const hash = normalizarHash(stk.fileSha256);
  const hashEnc = normalizarHash(stk.fileEncSha256);
  if (!hash && !hashEnc) return null;
  return { hash, hashEnc, animated: !!stk.isAnimated };
}

// ── INTERRUPTOR POR GRUPO ───────────────────────────────────
// Cache com TTL de 60 s: o estado também pode ser mudado pelo
// dashboard, e uma cache eterna deixava o grupo a usar um valor velho.
const TTL_INTERRUPTOR = 60000;

async function _definissoes(groupJid) {
  const jid = String(groupJid || '');
  if (!jid.endsWith('@g.us')) return { on: false, notify: true };
  const c = interruptor.get(jid);
  if (c && Date.now() - c.ts < TTL_INTERRUPTOR) return c;
  if (!_dbUp()) return c ? { on: c.on, notify: c.notify } : { on: false, notify: true };
  try {
    const GroupSettings = require('../database/models/GroupSettings');
    const gs = await GroupSettings.findOne({ groupJid: jid }).lean();
    const def = { on: !!gs?.antisticker, notify: gs?.antistickerNotify !== false, ts: Date.now() };
    interruptor.set(jid, def);
    return def;
  } catch {
    return c ? { on: c.on, notify: c.notify } : { on: false, notify: true };
  }
}

async function estaActivo(groupJid) {
  return (await _definissoes(groupJid)).on;
}

/** O bot avisa o grupo quando apaga? (!antisticker notify on/off) */
async function avisa(groupJid) {
  return (await _definissoes(groupJid)).notify;
}

async function setActivo(groupJid, on) {
  const jid = String(groupJid || '');
  const valor = !!on;
  const anterior = interruptor.get(jid);
  interruptor.set(jid, { on: valor, notify: anterior?.notify !== false, ts: Date.now() });
  if (!_dbUp()) return valor;
  try {
    const GroupSettings = require('../database/models/GroupSettings');
    await GroupSettings.findOneAndUpdate(
      { groupJid: jid },
      { $set: { groupJid: jid, antisticker: valor } },
      { upsert: true, setDefaultsOnInsert: true }
    );
  } catch {}
  return valor;
}

async function setAviso(groupJid, on) {
  const jid = String(groupJid || '');
  const valor = !!on;
  const anterior = interruptor.get(jid);
  interruptor.set(jid, { on: anterior?.on ?? false, notify: valor, ts: Date.now() });
  if (!_dbUp()) return valor;
  try {
    const GroupSettings = require('../database/models/GroupSettings');
    await GroupSettings.findOneAndUpdate(
      { groupJid: jid },
      { $set: { groupJid: jid, antistickerNotify: valor } },
      { upsert: true, setDefaultsOnInsert: true }
    );
  } catch {}
  return valor;
}

// ── APRENDER / ESQUECER ─────────────────────────────────────
/**
 * Ensina o bot: aquela figurinha não entra mais neste grupo.
 * @returns {Promise<{ok:boolean, jaSabia?:boolean, motivo?:string}>}
 */
async function aprender(dados = {}) {
  const groupJid = String(dados.groupJid || '');
  const hash = normalizarHash(dados.hash);
  const hashEnc = normalizarHash(dados.hashEnc);
  if (!groupJid.endsWith('@g.us')) return { ok: false, motivo: 'só em grupos' };
  if (!hash && !hashEnc) return { ok: false, motivo: 'sem identidade' };
  const chave = hash || hashEnc;

  // cache primeiro — funciona mesmo sem Mongo
  const mapa = _grupo(groupJid);
  const anterior = _procura(groupJid, hash) || _procura(groupJid, hashEnc);
  const jaSabia = !!anterior;
  // se já a conhecia por outra chave, não fica um registo duplicado
  if (anterior && anterior.chave !== chave) mapa.delete(anterior.chave);
  mapa.set(chave, { hash, hashEnc, animated: !!dados.animated });

  if (_dbUp()) {
    try {
      await Model().findOneAndUpdate(
        { groupJid, hash: chave },
        {
          $set: {
            groupJid, hash: chave, hashEnc: hashEnc || '',
            animated: !!dados.animated,
            addedBy: String(dados.addedBy || ''),
            addedByName: String(dados.addedByName || ''),
            reason: String(dados.reason || '').slice(0, 200),
          },
        },
        { upsert: true, setDefaultsOnInsert: true }
      );
    } catch {
      // sem Mongo a aprendizagem fica só em memória (até ao restart)
    }
  }
  return { ok: true, jaSabia };
}

/**
 * Desaprende. Sem hash, desaprende pelo índice da lista (1-based).
 */
async function esquecer(groupJid, { hash, indice } = {}) {
  const jid = String(groupJid || '');
  let alvo = normalizarHash(hash);

  if (!alvo && indice) {
    const lista = await listaDe(jid);
    const item = lista[Number(indice) - 1];
    if (!item) return { ok: false, motivo: 'índice fora da lista' };
    alvo = item.hash;
  }
  if (!alvo) return { ok: false, motivo: 'diz qual figurinha (responde-lhe ou usa o nº da lista)' };

  const achado = _procura(jid, alvo);
  if (achado) cache.get(jid).delete(achado.chave);
  if (_dbUp()) {
    try {
      await Model().deleteMany({ groupJid: jid, $or: [{ hash: alvo }, { hashEnc: alvo }] });
    } catch {}
  }
  return { ok: true, hash: alvo };
}

/** Lista legível do que o grupo ensinou. */
async function listaDe(groupJid) {
  const jid = String(groupJid || '');
  if (_dbUp()) {
    try {
      const docs = await Model().find({ groupJid: jid }).sort({ createdAt: -1 }).lean();
      if (docs.length) {
        return docs.map(d => ({
          hash: d.hash, hashEnc: d.hashEnc || '', animated: !!d.animated,
          addedByName: d.addedByName || '', hits: d.hits || 0,
          createdAt: d.createdAt || null,
        }));
      }
    } catch {}
  }
  // fallback: cache (sem Mongo ou grupo sem registos)
  const mapa = cache.get(jid);
  if (!mapa) return [];
  return [...mapa.values()].map(r => ({
    hash: r.hash, hashEnc: r.hashEnc || '', animated: !!r.animated,
    addedByName: '', hits: 0, createdAt: null,
  }));
}

/** A figurinha está aprendida neste grupo? (só cache, síncrono) */
function estaBanidoSync(groupJid, hash) {
  return !!_procura(groupJid, hash);
}

/** Versão async: garante que a cache foi carregada do Mongo. */
async function estaBanido(groupJid, { hash, hashEnc } = {}) {
  if (!_carregado) await carregar();
  return estaBanidoSync(groupJid, hash) || estaBanidoSync(groupJid, hashEnc);
}

async function registarAcerto(groupJid, hash) {
  if (!_dbUp() || !hash) return;
  try {
    await Model().findOneAndUpdate(
      { groupJid: String(groupJid), hash },
      { $inc: { hits: 1 }, $set: { lastHitAt: new Date() } }
    );
  } catch {}
}

// ── O FILTRO (chamado pelo messageListener) ─────────────────
/**
 * Olha para uma mensagem que acabou de entrar. Se for uma figurinha
 * aprendida naquele grupo, apaga-a.
 *
 * @returns {Promise<{apagada:boolean, hash?:string, motivo?:string}>}
 */
async function filtrar(sock, msg, opts = {}) {
  try {
    const jid = msg?.key?.remoteJid;
    if (!jid || !jid.endsWith('@g.us')) return { apagada: false };
    if (msg.key?.fromMe) return { apagada: false };

    const id = identidadeDe(msg);
    if (!id) return { apagada: false };

    const def = await _definissoes(jid);
    if (!def.on) return { apagada: false };
    if (!(await estaBanido(jid, id))) return { apagada: false };

    let apagada = false;
    if (sock?.sendMessage) {
      try { await sock.sendMessage(jid, { delete: msg.key }); apagada = true; } catch {}
    }

    registarAcerto(jid, id.hash || id.hashEnc).catch?.(() => {});

    if (apagada && def.notify && opts.notify !== false && sock?.sendMessage) {
      const quem = msg.key?.participant ? `<@${String(msg.key.participant).split('@')[0]}>` : 'alguém';
      await sock.sendMessage(jid, {
        text: `🚫 *Figurinha aprendida* — já a conheço.\n${quem} essa não entra aqui.`,
        mentions: msg.key?.participant ? [msg.key.participant] : [],
      }).catch(() => {});
    }

    return { apagada, hash: id.hash || id.hashEnc };
  } catch (e) {
    // nunca deixa o listener cair por causa do filtro
    return { apagada: false, erro: e.message?.slice(0, 80) };
  }
}

/** Atalho para testes/diagnóstico: limpa tudo em memória. */
function _reset() {
  cache.clear();
  interruptor.clear();
  _carregado = false;
}

module.exports = {
  aprender,
  esquecer,
  listaDe,
  estaBanido,
  estaBanidoSync,
  estaActivo,
  setActivo,
  avisa,
  setAviso,
  filtrar,
  identidadeDe,
  normalizarHash,
  registarAcerto,
  carregar,
  _reset,
  _cache: cache,
};
