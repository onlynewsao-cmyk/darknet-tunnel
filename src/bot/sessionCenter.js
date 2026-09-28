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
// v12.9.22 SLOTS ENUMERADOS FIXOS: cada slot GUARDA o seu número para
// sempre — os creds é que viajam entre prefixos na promoção; o doc sabe
// sempre onde estão os seus (campo prefixo). Nunca se renumera nada.
const _prefixo = (n) => (n === 1 ? '' : `slot${n}`);
async function _prefDe(n) {
  const d = await _slotDoc(n).catch(() => null);
  return d?.prefixo != null ? d.prefixo : _prefixo(n);
}
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

/** A sessão EM USO (creds no prefixo principal '') — pode ser qualquer slot. */
async function slotAtual() {
  const mapa = await _mapa();
  const d = mapa.find((x) => x.prefixo === '' && x.estado === 'ativa');
  return d ? { slot: d.slot, numero: d.numero } : null;
}

/** Visão do dashboard: 4 slots FIXOS + quem está EM USO + próximo da fila. */
async function estadoDetalhado() {
  const mapa = await _mapa();
  const fila = await _filaEquilibrada();
  const proximoSlot = fila[0]?.slot ?? null;
  return mapa.map((d) => ({
    slot: d.slot,
    estado: d.estado,
    emUso: d.estado === 'ativa',
    proxima: d.estado === 'guardada' && d.slot === proximoSlot,
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
/** Chamado quando o bot liga com sucesso: marca a EM USO (prefixo ''). */
async function registarSucesso(numero) {
  try {
    const mapa = await _mapa();
    const d = mapa.find((x) => x.prefixo === '');
    if (!d) return;
    for (const x of mapa) {
      if (x.slot !== d.slot && x.estado === 'ativa') { x.estado = 'guardada'; await x.save().catch(() => {}); }
    }
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
    const mapa = await _mapa();
    const d = mapa.find((x) => x.prefixo === '') || (await _slotDoc(1));
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
  } catch (e) { if (process.env.DEBUG_PROBE) console.error('[probe ERRO]', e.message); return { ok: false }; }
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
  const pref = dN.prefixo != null ? dN.prefixo : _prefixo(slotN);
  // v12.9.22: quem sai de EM USO é quem TEM os creds no principal (prefixo '')
  // — pode ser qualquer slot, não é sempre o slot 1
  const mapaProm = await _mapa();
  const d1 = mapaProm.find((x) => x.prefixo === '' && x.slot !== slotN) || (await _slotDoc(1));

  if (apagarAtual) {
    // creds do slot 1 são lixo (ban/logout) — afasta o promovido p/ rascunho
    // ANTES de limpar a casa; os números dos slots NUNCA mudam
    await _renomearTodos(pref, TMP);
    for (const f of await _docsDe('')) await Session.deleteOne({ fileName: f }).catch(() => {});
    await _renomearTodos(TMP, '');
  } else {
    await _renomearTodos('', TMP);                      // creds EM USO → rascunho
    await _renomearTodos(pref, '');                     // creds do slot N → PRINCIPAL
    await _renomearTodos(TMP, pref);                    // as antigas → guardadas no prefixo do slot 1
  }
  // v12.9.22: os docs MANTÊM slot e numero — só prefixo (onde estão os creds) e estado andam
  if (d1) {
    d1.prefixo = pref;
    if (apagarAtual) { d1.estado = 'vazia'; d1.numero = ''; d1.motivo = ''; }
    else { d1.estado = 'guardada'; d1.ultimaProva = _agora(); }
    await d1.save();
  }
  dN.prefixo = ''; dN.estado = 'ativa'; dN.ultimaViva = _agora(); dN.motivo = '';
  await dN.save();
  eventos.emit('promover', { slot: slotN, numero: dN.numero });
  return { ok: true, slot: slotN, numero: dN.numero };
}

/**
 * v12.9.22 FAILOVER EQUILIBRADO: em vez de sonda sempre 2→3→4 (a slot 2
 * levava todo o desgaste), a fila ordena por antiguidade de prova — quem
 * espera há mais tempo assume primeiro. Desgaste repartido, sistema justo.
 */
async function _filaEquilibrada() {
  const mapa = await _mapa();
  return mapa
    .filter((d) => d.estado === 'guardada')
    .sort((a, b) => ((a.ultimaProva?.getTime?.() || 0) - (b.ultimaProva?.getTime?.() || 0)));
}

/** Percurso: a EM USO morreu → sonda a fila equilibrada e promove a 1ª viva. */
async function tentarFailover() {
  for (const d of await _filaEquilibrada()) {
    const p = await _provar(d.prefixo != null ? d.prefixo : _prefixo(d.slot));
    d.ultimaProva = _agora();
    if (p.ok) {
      d.numero = d.numero || p.numero;
      await d.save();
      const r = await promover(d.slot, { apagarAtual: true });
      if (r.ok) return { ok: true, promovida: d.slot, numero: r.numero };
    } else {
      d.tentativas = (d.tentativas || 0) + 1;
      // 2 dias de insistência: dentro da janela segue comatosa, fora morre
      if (d.retryAte && d.retryAte.getTime() < Date.now()) { d.estado = 'morta'; d.motivo = 'probe falhou após 2 dias'; }
      await d.save();
    }
  }
  return { ok: false, motivo: 'sem-suplente' };
}

/**
 * v12.9.23 — CAPTURA COM TODOS OS SLOTS 🕸️
 * Liga UM socket temporário a cada número (EM USO + guardadas vivas) e
 * captura os membros dos grupos DE CADA NÚMERO para a base central.
 * Um contacto visto por números diferentes mantém-se único, mas fica
 * marcado com TODOS os slots que o viram (ex.slots).
 */
async function capturarComTodosOsSlots({ pausaMs = [1500, 3000] } = {}) {
  const base = require('./centralBase'); base.carregar();
  const mapa = await _mapa();
  const resultados = [];
  for (const d of mapa) {
    if (d.estado !== 'ativa' && d.estado !== 'guardada') continue;
    const pref = d.prefixo != null ? d.prefixo : _prefixo(d.slot);
    let sock = null;
    const r = { slot: d.slot, numero: d.numero || '', grupos: 0, novos: 0, duplicados: 0, erro: '' };
    try {
      ({ sock } = await _novoSock(pref));
      const aberto = await _esperaAbertura(sock, PROBE_TIMEOUT_MS);
      if (!aberto) throw new Error('não abriu (sessão fria/morta)');
      r.numero = String(sock?.user?.id || '').replace(/@.*$/, '') || r.numero;
      const chats = await sock.groupFetchAllParticipating().catch(() => ({}));
      const metas = Object.entries(chats || {});
      for (const [jid, meta] of metas) {
        try {
          const rr = base.capturarGrupo(jid, meta, { slot: d.slot });
          r.grupos++; r.novos += rr.novos; r.duplicados += rr.duplicados;
        } catch {}
        await new Promise(x => setTimeout(x, 300 + Math.floor(Math.random() * 250))); // ritmo humano
      }
    } catch (e) { r.erro = String(e.message || e).slice(0, 80); }
    finally { try { sock?.end?.(); } catch {} try { sock?.ev?.removeAllListeners?.(); } catch {} }
    resultados.push(r);
    await new Promise(x => setTimeout(x, pausaMs[0] + Math.floor(Math.random() * (pausaMs[1] - pausaMs[0]))));
  }
  const s = base.stats();
  try {
    const { getBot } = require('./whatsapp');
    getBot()?.emit?.('central:multicaptura', { resultados, total: s.total });
  } catch {}
  return { ok: resultados.some(x => !x.erro && x.grupos > 0), totalContactos: s.total, ddds: s.ddds, slots: s.slots, resultados };
}

/** BOTÃO: rodar manualmente (equilibrado — a fila decide quem assume). */
async function rodarAgora() {
  for (const d of await _filaEquilibrada()) {
    const p = await _provar(d.prefixo != null ? d.prefixo : _prefixo(d.slot));
    d.ultimaProva = _agora();
    await d.save();
    if (p.ok) {
      const r = await promover(d.slot, { apagarAtual: false });
      if (r.ok) return { ok: true, promovida: d.slot, numero: r.numero };
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
  const pref = await _prefDe(slotLivre);
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
  // v12.9.22: MESMO formato E MESMO VALOR do Connect — XXXX-XXXX-XXXX-XXXX
  // e publicado no estado do bot: a página Connect passa a mostrar O MESMO
  // código em tempo real (uma só verdade, zero códigos desencontrados).
  const codigoFmt = String(codigo || '').match(/.{1,4}/g)?.join('-') || codigo;
  try {
    const { getBot } = require('./whatsapp');
    const b = getBot();
    b.pairingCode = codigoFmt;
    b.emit('bot:status', { status: b.status, pairingCode: codigoFmt, phoneNumber: numero });
  } catch {}
  // vigia do pairing: se abrir, guarda e PROMOVE (a que funciona fica EM USO)
  _vigiarPair(slotLivre, sock, codigoFmt).catch(() => {});
  return { ok: true, slot: slotLivre, codigo: codigoFmt, timeoutMs: PAIR_TIMEOUT_MS };
}

async function _vigiarPair(slotN, sock, codigoFmt) {
  const ok = await _esperaAbertura(sock, PAIR_TIMEOUT_MS);
  const dN = await _slotDoc(slotN).catch(() => null);
  try { sock?.end?.(); } catch {}
  try { sock?.ev?.removeAllListeners?.(); } catch {}
  // limpa o código partilhado com o Connect (só se ainda for o deste pairing)
  try {
    const { getBot } = require('./whatsapp');
    const b = getBot();
    if (b && b.pairingCode === codigoFmt) { b.pairingCode = null; b.emit('bot:status', { status: b.status, pairingCode: null }); }
  } catch {}
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
  for (const f of await _docsDe(d.prefixo != null ? d.prefixo : _prefixo(slotN))) await Session.deleteOne({ fileName: f }).catch(() => {});
  d.estado = 'vazia'; d.numero = ''; d.motivo = ''; d.tentativas = 0;
  d.prefixo = _prefixo(slotN);
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
  tentarFailover, rodarAgora, promover, novaSessao, remover, capturarComTodosOsSlots,
  arrancarVigia,
  _definirFabrica,
  _debug: { _mapa, _slotDoc, _docsDe, _renomearTodos, _provar, _prefixo, RETRY_MS, PROBE_TIMEOUT_MS },
};
