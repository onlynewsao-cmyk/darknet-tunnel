'use strict';
/**
 * v9.14 — CENTRAL DE SESSÕES (failover automático, 4 slots, 1 ativa)
 *
 * O pedido, desmontado:
 *  · o bot insiste ~2 DIAS nas sessões novas antes de as dar como mortas;
 *  · a sessão que ESTÁ A FUNCIONAR vai sempre para o slot 1;
 *  · com 2+ sessões vivas SÓ corre a do slot 1 — as outras ficam lá
 *    guardadas (o bot só as «tocas» para manter a ligação registada);
 *  · tudo gerido no DASHBOARD sem mexer no «conectar bot» de sempre.
 *
 * Como está montado:
 *  · slot 1 = docs ${''}:creds (o que já existia — zero migração);
 *  · slot N>1 = docs `slotN:<fileName>` na MESMA coleção Session
 *    (o useMongoAuthState já aceita prefix desde a v1);
 *  · probes: socket temporário mínimo por slot (é só fazer o contacto);
 *  · promoção: troca atómica de prefixos via prefixo rascunho `tmpswap:`;
 *  · on('promover') → o whatsapp.js reinicia o socket principal.
 *
 * A fábrica de sockets é INJECTÁVEL (_definirFabrica) — os testes usam
 * um socket falso e verificam a lógica toda sem rede.
 */

const { EventEmitter } = require('events');
const Session = require('../database/models/Session');
const SessionSlot = require('../database/models/SessionSlot');

const SLOTS = 4;
const RETRY_MS = 2 * 24 * 60 * 60 * 1000;        // 2 dias a insistir
const PROBE_TIMEOUT_MS = 12_000;
const PAIR_TIMEOUT_MS = 90_000;
const TMP = 'tmpswap';

const eventos = new EventEmitter();
let _fabrica = null;   // (prefixo) => Promise<{ sock, state }>

function _definirFabrica(fn) { _fabrica = fn; }

async function _fabricaPadrao(prefixo) {
  const baileys = require('@systemzero/baileys');
  const makeWASocket = baileys.default || baileys.makeWASocket || baileys;
  const { useMongoAuthState } = require('./mongoAuthState');
  const { state, saveCreds } = await useMongoAuthState({ prefix: prefixo });
  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    syncFullHistory: false,
    markOnlineOnConnect: false,
    generateHighQualityLinkPreview: false,
    browser: ['DARK BOT', 'Chrome', '2.0'],
  });
  sock.ev.on('creds.update', saveCreds);
  return { sock, state };
}
async function _novoSock(prefixo) { return (_fabrica || _fabricaPadrao)(prefixo); }

// ── helpers ────────────────────────────────────────────────
const _prefixo = (n) => (n === 1 ? '' : `slot${n}`);
const _agora = () => new Date();

/** Garante os 4 docs de slot (idempotente). */
async function _mapa() {
  const mapa = [];
  for (let n = 1; n <= SLOTS; n++) {
    let d = await SessionSlot.findOne({ slot: n }).catch(() => null);
    if (!d) {
      d = await SessionSlot.create({ slot: n, prefixo: _prefixo(n), estado: 'vazia' }).catch(() => null);
    }
    if (d) mapa.push(d);
  }
  return mapa;
}
const _slotDoc = async (n) => (await _mapa()).find((d) => d.slot === n) || null;

/** A sessão ACTIVA está no slot 1? */
async function slotAtual() {
  const d = await _slotDoc(1).catch(() => null);
  return d && d.estado === 'ativa' ? { slot: 1, numero: d.numero } : null;
}

/** Visão do dashboard: os 4 slots + síntese. */
async function estadoDetalhado() {
  const mapa = await _mapa();
  return mapa.map((d) => ({
    slot: d.slot,
    estado: d.estado,
    numero: d.numero || '(sem número)',
    motivo: d.motivo || '',
    tentativas: d.tentativas || 0,
    ultimaViva: d.ultimaViva || null,
    ultimaProva: d.ultimaProva || null,
    retryAte: d.retryAte || null,
    emRetry: !!(d.retryAte && d.retryAte.getTime() > Date.now()),
  }));
}

// ── hooks do socket principal (whatsapp.js chama estes) ────
/** Chamado quando o bot liga com sucesso: a viva está no slot 1. */
async function registarSucesso(numero) {
  try {
    const d = await _slotDoc(1);
    if (!d) return;
    d.estado = 'ativa';
    d.numero = String(numero || '').replace(/@.*$/, '') || d.numero;
    d.motivo = '';
    d.tentativas = 0;
    d.retryAte = null;
    d.ultimaViva = _agora();
    if (!d.desde) d.desde = _agora();
    await d.save();
  } catch {}
}

/** A sessão activa morreu (logout/403/ban): comatosa por 2 dias + failover. */
async function falhou(motivo) {
  try {
    const d = await _slotDoc(1);
    if (d) {
      d.estado = 'morta';
      d.motivo = String(motivo || '').slice(0, 120);
      d.retryAte = new Date(Date.now() + RETRY_MS);   // 2 dias de insistência
      await d.save();
    }
    return await tentarFailover();
  } catch (e) { return { ok: false, motivo: e.message }; }
}

// ── probe leve: «é só fazer o contacto» ────────────────────
function _esperaAbertura(sock, timeoutMs) {
  return new Promise((resolve) => {
    let feito = false;
    const fim = (ok) => { if (!feito) { feito = true; clearTimeout(t); resolve(ok); } };
    const t = setTimeout(() => fim(false), timeoutMs);
    try {
      sock.ev.on('connection.update', (u) => {
        if (u?.connection === 'open') fim(true);
        // fecho prematuro ANTES de abrir = sessão inválida/outra
        if (u?.connection === 'close' && !u?.isNewLogin) fim(false);
      });
    } catch { fim(false); }
  });
}

/** Testa a sessão guardada dum prefixo. Devolve {ok, numero?}. */
async function _provar(prefixo) {
  let sock = null;
  try {
    ({ sock } = await _novoSock(prefixo));
    const ok = await _esperaAbertura(sock, PROBE_TIMEOUT_MS);
    const numero = ok ? String(sock?.user?.id || '').replace(/@.*$/, '') : '';
    return { ok, numero };
  } catch { return { ok: false }; }
  finally { try { sock?.end?.(); } catch {} try { sock?.ev?.removeAllListeners?.(); } catch {} }
}

// ── promoção: swap atómico de prefixos ─────────────────────
/** Lista os fileNames dum prefixo na coleção Session. */
async function _docsDe(prefixo) {
  const re = prefixo === '' ? /^[^:]+$/ : new RegExp(`^${prefixo}:`);
  const docs = await Session.find({ fileName: { $regex: re } }).select('fileName').lean().catch(() => []);
  // defesa extra: as sessões de CHAMADAS (call:*) nunca participam
  return docs.map((d) => d.fileName).filter((f) => !/^call:/.test(f));
}

/** fileName com prefixo trocado. */
const _trocarPref = (f, de, para) => (de === '' ? `${para}:${f}` : f.replace(`${de}:`, para ? `${para}:` : ''));

async function _renomearTodos(de, para) {
  const fs = await _docsDe(de);
  for (const f of fs) {
    await Session.findOneAndUpdate({ fileName: f }, { fileName: _trocarPref(f, de, para) }).catch(() => {});
  }
  return fs.length;
}

/**
 * A sessão do slot N passa a ser a slot 1 (vai pro 1º porque ESTÁ VIVA):
 *  · apagarAtual=true → descarta os docs do slot 1 (sessão lixo: ban/logout)
 *  · apagarAtual=false → estaciona os docs actuais no prefixo do slot N
 *    (ficam guardados — era o que «ainda permanece lá»)
 */
async function promover(slotN, { apagarAtual = true } = {}) {
  if (slotN === 1) return { ok: false, motivo: 'ja-e-ativa' };
  const dN = await _slotDoc(slotN);
  if (!dN || (dN.estado !== 'guardada' && dN.estado !== 'ativa')) return { ok: false, motivo: 'sem-sessao-guardada' };
  const pref = _prefixo(slotN);
  const d1 = await _slotDoc(1);

  if (apagarAtual) {
    // docs do slot 1 são lixo (ban/logout) — primeiro afasta o slot
    // promovido para rascunho, ANTES de limpar a casa
    await _renomearTodos(pref, TMP);
    for (const f of await _docsDe('')) await Session.deleteOne({ fileName: f }).catch(() => {});
    await _renomearTodos(TMP, '');
  } else {
    await _renomearTodos('', TMP);                      // slot1 → rascunho
    await _renomearTodos(pref, '');                     // slotN → slot 1
    await _renomearTodos(TMP, pref);                    // rascunho → slot N (guardada)
  }
  // registos: o antigo slot 1 muda PRIMEIRO para o N (únicos não colidem)
  if (d1) {
    d1.slot = slotN; d1.prefixo = pref;
    if (apagarAtual) { d1.estado = 'vazia'; d1.numero = ''; d1.motivo = ''; }
    else { d1.estado = 'guardada'; d1.ultimaProva = _agora(); }
    await d1.save();
  }
  dN.slot = 1; dN.prefixo = ''; dN.estado = 'ativa'; dN.ultimaViva = _agora(); dN.motivo = '';
  await dN.save();
  eventos.emit('promover', { slot: slotN, numero: dN.numero });
  return { ok: true, slot: slotN, numero: dN.numero };
}

/** Percurso clássico: a viva morreu → sonda os slots 2..4 e promove a 1ª viva. */
async function tentarFailover() {
  for (let n = 2; n <= SLOTS; n++) {
    const d = await _slotDoc(n).catch(() => null);
    if (!d || d.estado !== 'guardada') continue;
    const p = await _provar(_prefixo(n));
    d.ultimaProva = _agora();
    if (p.ok) {
      d.numero = d.numero || p.numero;
      await d.save();
      const r = await promover(n, { apagarAtual: true });
      if (r.ok) return { ok: true, promovida: n, numero: r.numero };
    } else {
      d.tentativas = (d.tentativas || 0) + 1;
      // 2 dias de insistência: dentro da janela segue comatosa, fora morre
      if (d.retryAte && d.retryAte.getTime() < Date.now()) { d.estado = 'morta'; d.motivo = 'probe falhou após 2 dias'; }
      await d.save();
    }
  }
  return { ok: false, motivo: 'sem-suplente' };
}

/** BOTÃO do dashboard: rodar manualmente (a viva actual fica guardada). */
async function rodarAgora() {
  for (let n = 2; n <= SLOTS; n++) {
    const d = await _slotDoc(n).catch(() => null);
    if (!d || d.estado !== 'guardada') continue;
    const p = await _provar(_prefixo(n));
    d.ultimaProva = _agora();
    await d.save();
    if (p.ok) {
      const r = await promover(n, { apagarAtual: false });
      if (r.ok) return { ok: true, promovida: n, numero: r.numero };
    }
  }
  return { ok: false, motivo: 'sem-suplente-viva' };
}

/** BOTÃO: adicionar sessão nova (pairing) — devolve o código na hora. */
async function novaSessao(numeroRaw) {
  const numero = String(numeroRaw || '').replace(/\D/g, '');
  if (numero.length < 8) return { ok: false, motivo: 'numero-invalido' };
  let slotLivre = null;
  for (let n = 2; n <= SLOTS; n++) {
    const d = await _slotDoc(n);
    if (d && d.estado === 'vazia') { slotLivre = n; break; }
  }
  if (!slotLivre) return { ok: false, motivo: 'sem-slot-livre' };
  const pref = _prefixo(slotLivre);
  const dN = await _slotDoc(slotLivre);
  dN.estado = 'ligacao'; dN.numero = numero; dN.motivo = '';
  dN.retryAte = new Date(Date.now() + RETRY_MS);      // 2 dias de insistência
  dN.tentativas = 0; await dN.save();

  let sock;
  try { ({ sock } = await _novoSock(pref)); }
  catch (e) { dN.estado = 'vazia'; await dN.save().catch(() => {}); return { ok: false, motivo: e.message }; }
  let codigo = '';
  try { codigo = await sock.requestPairingCode(numero); } catch (e) {
    dN.estado = 'vazia'; await dN.save().catch(() => {});
    try { sock?.end?.(); } catch {}
    return { ok: false, motivo: e.message };
  }
  // vigia do pairing: se abrir, guarda e PROMOVE (a que funciona vai pro 1)
  _vigiarPair(slotLivre, sock).catch(() => {});
  return { ok: true, slot: slotLivre, codigo, timeoutMs: PAIR_TIMEOUT_MS };
}

async function _vigiarPair(slotN, sock) {
  const ok = await _esperaAbertura(sock, PAIR_TIMEOUT_MS);
  const dN = await _slotDoc(slotN).catch(() => null);
  try { sock?.end?.(); } catch {}
  try { sock?.ev?.removeAllListeners?.(); } catch {}
  if (!dN) return;
  if (ok) {
    dN.estado = 'guardada'; dN.ultimaViva = _agora(); dN.motivo = '';
    await dN.save();
    await promover(slotN, { apagarAtual: false });   // actual segue guardada (emit dentro)
  } else {
    dN.estado = 'vazia'; dN.numero = ''; dN.motivo = 'pairing expirou sem scan';
    await dN.save();
    for (const f of await _docsDe(_prefixo(slotN))) await Session.deleteOne({ fileName: f }).catch(() => {});
  }
}

/** BOTÃO: remover um slot (a actual não se remove). */
async function remover(slotN) {
  if (slotN === 1) return { ok: false, motivo: 'ativa-nao-se-remove' };
  const d = await _slotDoc(slotN);
  if (!d) return { ok: false, motivo: 'slot-inexistente' };
  for (const f of await _docsDe(_prefixo(slotN))) await Session.deleteOne({ fileName: f }).catch(() => {});
  d.estado = 'vazia'; d.numero = ''; d.motivo = ''; d.tentativas = 0;
  d.retryAte = null; d.ultimaViva = null; await d.save();
  return { ok: true, slot: slotN };
}

// ── vigia em fundo: «fazer o contacto» para manter vivas ───
// v12.6: se o bot principal estiver CAÍDO (disconnected/restricted)
// há mais de 10 min, tenta a rotação SOZINHO — a slot guardada viva
// assume e o evento 'promover' reinicia o socket principal.
let _botCaidoDesde = null;
async function _vigiarBotCaido() {
  try {
    const { getBot } = require('./whatsapp');
    const st = typeof getBot === 'function' ? getBot()?.getStatus?.() : null;
    if (st && (st.status === 'disconnected' || st.status === 'restricted')) {
      if (!_botCaidoDesde) _botCaidoDesde = Date.now();
      if (Date.now() - _botCaidoDesde > 10 * 60 * 1000) {
        _botCaidoDesde = Date.now();          // não martelar a cada ronda
        const r = await tentarFailover();
        if (r?.ok) console.log(`[Sessões] AUTO-FAILOVER: bot caído >10min → slot ${r.promovida} (${r.numero || '?'}) assumiu.`);
        else console.log('[Sessões] Bot caído >10min, mas nenhuma slot guardada está viva.');
      }
    } else {
      _botCaidoDesde = null;
    }
  } catch {}
}

async function _ronda() {
  _vigiarBotCaido().catch(() => {});
  for (let n = 2; n <= SLOTS; n++) {
    const d = await _slotDoc(n).catch(() => null);
    if (!d || d.estado !== 'guardada') continue;
    const p = await _provar(_prefixo(n));
    d.ultimaProva = _agora();
    if (p.ok) { d.tentativas = 0; d.motivo = ''; }
    else {
      d.tentativas = (d.tentativas || 0) + 1;
      if (d.retryAte && d.retryAte.getTime() < Date.now()) {
        d.estado = 'morta'; d.motivo = `sem contacto por 2 dias (${d.tentativas}x)`;
      }
    }
    await d.save().catch(() => {});
  }
}
let _timer = null;
function arrancarVigia(intervaloMs = 30 * 60 * 1000) {
  if (_timer) return;
  _timer = setInterval(() => _ronda().catch(() => {}), intervaloMs);
  if (_timer.unref) _timer.unref();
}

module.exports = {
  on: (...a) => eventos.on(...a),
  slotAtual, estadoDetalhado, registarSucesso, falhou,
  tentarFailover, rodarAgora, promover, novaSessao, remover,
  arrancarVigia,
  _definirFabrica,
  _debug: { _mapa, _slotDoc, _docsDe, _renomearTodos, _provar, _prefixo, RETRY_MS, PROBE_TIMEOUT_MS },
};
