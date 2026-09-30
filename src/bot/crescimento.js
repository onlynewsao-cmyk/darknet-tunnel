'use strict';
/**
 * v12.9.42 — SERVIÇO DE CRESCIMENTO 📈
 * Divulgação em massa e convites por PV com RODÍZIO DE NÚMEROS:
 *  • pool = bot principal + slots vivos (sessionCenter) → round-robin
 *  • ritmo HUMANO: 20–50s entre envios · pausa "café" 3–5min a cada 10
 *  • CAP por número/hora (default 50) — número atingiu? passa ao próximo
 *  • não recontacta quem já recebeu há <7 dias (mapa persistido)
 *  • fila persistida (BotConfig) — reinício PAUSA (nunca arranca sozinho)
 *  • parar/pausar respeitado em fatias de 2s (nada mecânico, nada preso)
 */
const CST = 'crescimento_v1';
// CRESCIMENTO_VELOZ=1 → pausas de teste (0.3–0.8s). Em produção NUNCA ligar:
// o ritmo humano é a protecção anti-ban.
const VELOZ = process.env.CRESCIMENTO_VELOZ === '1';
const PAUSA = () => (VELOZ ? _rnd(300, 800) : _rnd(20, 50) * 1000);
const CAFE = () => (VELOZ ? 2000 : _rnd(180, 300) * 1000);

const _estado = { jobs: [], capHora: 50, contactados: {}, _carregado: false };
const _uso = {};          // num → { hora, n } (janela de 1h, em memória)
const _bufs = new Map();  // jobId → { buf, mimetype } (mídia só em RAM)
let _correndo = false;
let _idx = -1;            // rodízio
let _persT = null;

function _cache() { return require('./botConfigCache'); }

async function _carregar() {
  if (_estado._carregado) return _estado;
  try {
    const d = await _cache().get(CST, null);
    if (d) { _estado.jobs = d.jobs || []; _estado.capHora = d.capHora || 50; _estado.contactados = d.contactados || {}; }
  } catch {}
  // vindo de um reinício? PAUSA — nada arranca sozinho sem o dono
  let mudou = false;
  for (const j of _estado.jobs) if (j.estado === 'correr') { j.estado = 'pausado'; j.motivo = 'reinício — retoma com .crescimento retomar'; mudou = true; }
  _estado._carregado = true;
  if (mudou) _persistir();
  return _estado;
}

function _persistir() {
  clearTimeout(_persT);
  _persT = setTimeout(() => { _cache().set(CST, { jobs: _estado.jobs, capHora: _estado.capHora, contactados: _estado.contactados }).catch(() => {}); }, 1200);
}

const _rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

/** Pool de números vivos: bot principal + slots ativos (round-robin). */
async function _pool() {
  const out = [];
  try {
    const bot = require('./whatsapp').getBot();
    const s = bot?.sock;
    if (s?.user?.id && /connected/i.test(bot?.getStatus?.().status || '')) {
      out.push({ slot: 0, numero: String(s.user.id).split('@')[0].replace(/\D/g, ''), sock: s });
    }
  } catch {}
  try {
    const vivos = await require('./sessionCenter').socksVivos();
    for (const v of vivos) if (!out.some(x => x.numero === v.numero)) out.push(v);
  } catch {}
  return out;
}

function _janelaOk(num, cap) {
  const hora = Math.floor(Date.now() / 3600e3);
  const u = _uso[num];
  if (!u || u.hora !== hora) { _uso[num] = { hora, n: 0 }; return true; }
  return u.n < cap;
}

/** espera em fatias de 2s — aborta se o job sair de 'correr' */
async function _espera(ms, job) {
  const fim = Date.now() + ms;
  while (Date.now() < fim) {
    if (!job || job.estado !== 'correr') return false;
    await new Promise(r => setTimeout(r, 2000));
  }
  return job.estado === 'correr';
}

const SAUDACOES = ['Olá', 'Boas', 'Olá, tudo bem?', 'Oi'];

async function _enviarUm(sock, num, job) {
  const jid = num + '@s.whatsapp.net';
  if (job.tipo === 'convite') {
    const sa = SAUDACOES[_rnd(0, SAUDACOES.length - 1)];
    const txt = `${sa}${job.nomeAlvo ? ' ' + job.nomeAlvo : ''}! 👋\n\nConvido-te para o grupo *${job.nomeDestino}*\n\n🔗 ${job.link}\n\n_(se não quiseres entrar, só ignora esta mensagem)_`;
    await sock.sendMessage(jid, { text: txt });
    return;
  }
  const m = _bufs.get(job.id);
  if (m) {
    const pacote = /video/i.test(m.mimetype || '')
      ? { video: m.buf, caption: job.texto || undefined, mimetype: m.mimetype }
      : { image: m.buf, caption: job.texto || undefined };
    await sock.sendMessage(jid, pacote);
    return;
  }
  await sock.sendMessage(jid, { text: job.texto });
}

function _marcarEnviado(num) {
  const hora = Math.floor(Date.now() / 3600e3);
  const u = _uso[num] || { hora, n: 0 };
  if (u.hora !== hora) { u.hora = hora; u.n = 0; }
  u.n++;
  _uso[num] = u;
}

async function _ronda() {
  while (true) {
    const job = _estado.jobs.find(j => j.estado === 'correr');
    if (!job) return;
    if (job.tipo === 'midia' && !_bufs.has(job.id)) { job.estado = 'pausado'; job.motivo = 'mídia perdida no reinício — manda de novo'; _persistir(); continue; }
    const alvo = job.alvos[job.cursor];
    if (!alvo) { job.estado = 'feito'; job.fim = Date.now(); _persistir(); continue; }
    const pool = await _pool();
    if (!pool.length) { job.estado = 'pausado'; job.motivo = 'sem números vivos — liga um slot e retoma'; _persistir(); continue; }
    const cap = _estado.capHora;
    let num = null;
    for (let t = 0; t < pool.length; t++) {
      _idx = (_idx + 1) % pool.length;
      if (_janelaOk(pool[_idx].numero, cap)) { num = pool[_idx]; break; }
    }
    if (!num) { // todos no cap da hora → espera 60s (respeita parar)
      await _espera(60000, job);
      continue;
    }
    try {
      await _enviarUm(num.sock, alvo.num, job);
      job.enviados++;
      _marcarEnviado(num.numero);
      _estado.contactados[alvo.num] = Date.now();
    } catch {
      job.falhados++;
    }
    job.cursor++;
    job.ultimo = Date.now();
    job.poolN = pool.length;
    _persistir();
    if (job.cursor >= job.alvos.length) { job.estado = 'feito'; job.fim = Date.now(); _persistir(); continue; }
    // ritmo humano: a cada 10 envios, café 3–5min; senão 20–50s
    const seguiu = (job.enviados % 10 === 0)
      ? await _espera(CAFE(), job)
      : await _espera(PAUSA(), job);
    if (!seguiu) continue;
  }
}

function _marcar() { if (_correndo) return; _correndo = true; _ronda().catch(() => {}).finally(() => { _correndo = false; }); }

// ── filtragem da base ──
async function _alvos(filtroRaw, { sock, recontactar } = {}) {
  const base = require('./centralBase');
  const f = String(filtroRaw || 'todos').toLowerCase().trim();
  let lista;
  if (f.startsWith('ddd:') || f.startsWith('pais:')) {
    lista = base.fontePorDdd(f.includes(':') ? f.split(':').slice(1).join(':').trim() : '');
  } else if (f.startsWith('grupo')) {
    let jid = f.replace(/^grupo\s*/, '').trim();
    if (/^\d+$/.test(jid) && sock) {
      const all = Object.values(await sock.groupFetchAllParticipating().catch(() => ({})));
      const g = all[parseInt(jid, 10) - 1];
      jid = g?.id || '';
    }
    lista = jid ? base.fonteParaAdd(jid) : [];
  } else {
    lista = base.fonteParaAdd('todos');
  }
  const vistos = new Set();
  const corte = Date.now() - 7 * 86400e3;
  return lista
    .filter(x => !vistos.has(x.num) && vistos.add(x.num))
    .filter(x => recontactar || !_estado.contactados[x.num] || _estado.contactados[x.num] < corte)
    .map(x => ({ num: x.num, nome: x.nome || '' }));
}

// ── API pública ──
async function divulgar({ texto, buf, mimetype, filtro, sock, recontactar }) {
  await _carregar();
  const alvos = await _alvos(filtro, { sock, recontactar });
  if (!alvos.length) return { ok: false, erro: 'Nenhum alvo novo para esse filtro (base vazia ou todos contactados <7 dias — usa refazer p/ ignorar).' };
  const job = { id: 'd' + Date.now(), tipo: buf ? 'midia' : 'texto', texto: String(texto || '').slice(0, 2000), filtro: filtro || 'todos', alvos, cursor: 0, enviados: 0, falhados: 0, criado: Date.now(), estado: 'correr' };
  if (buf) _bufs.set(job.id, { buf, mimetype: mimetype || 'image/jpeg' });
  // se já há um a correr, este fica em fila (estado corre quando chegar a vez)
  if (_estado.jobs.some(j => j.estado === 'correr' || j.estado === 'fila')) job.estado = 'fila';
  _estado.jobs = [job, ..._estado.jobs.filter(j => j.estado !== 'feito')].slice(0, 20);
  _persistir();
  _marcar();
  return { ok: true, job, pool: (await _pool()).length };
}

async function convitar({ link, nomeDestino, filtro, sock, recontactar }) {
  await _carregar();
  if (!/^https:\/\/chat\.whatsapp\.com\/[\w-]+$/.test(link || '')) return { ok: false, erro: 'Link de convite inválido.' };
  const alvos = await _alvos(filtro, { sock, recontactar });
  if (!alvos.length) return { ok: false, erro: 'Nenhum alvo novo para esse filtro.' };
  const job = { id: 'c' + Date.now(), tipo: 'convite', link, nomeDestino: String(nomeDestino || 'do bot').slice(0, 60), filtro: filtro || 'todos', alvos, cursor: 0, enviados: 0, falhados: 0, criado: Date.now(), estado: 'correr' };
  if (_estado.jobs.some(j => j.estado === 'correr' || j.estado === 'fila')) job.estado = 'fila';
  _estado.jobs = [job, ..._estado.jobs.filter(j => j.estado !== 'feito')].slice(0, 20);
  _persistir();
  _marcar();
  return { ok: true, job, pool: (await _pool()).length };
}

function estado() {
  const at = _estado.jobs.find(j => j.estado === 'correr' || j.estado === 'pausado' || j.estado === 'fila');
  const usados = Object.keys(_uso).map(n => ({ numero: n, enviadosHora: _uso[n].n, capHora: _estado.capHora }));
  return {
    activo: at ? { id: at.id, tipo: at.tipo, estado: at.estado, motivo: at.motivo || '', filtro: at.filtro, total: at.alvos.length, cursor: at.cursor, enviados: at.enviados, falhados: at.falhados, restam: Math.max(0, at.alvos.length - at.cursor) } : null,
    fila: _estado.jobs.filter(j => j.estado === 'fila').length,
    capHora: _estado.capHora,
    pool: usados,
    contactados: Object.keys(_estado.contactados).length,
    jobsFeitos: _estado.jobs.filter(j => j.estado === 'feito').length,
  };
}

function pausar() { const j = _estado.jobs.find(x => x.estado === 'correr'); if (!j) return false; j.estado = 'pausado'; j.motivo = 'pelo dono'; _persistir(); return true; }
function retomar() { const j = _estado.jobs.find(x => x.estado === 'pausado'); if (!j) return false; j.estado = 'correr'; j.motivo = ''; _persistir(); _marcar(); return true; }
function parar() { let n = 0; for (const j of _estado.jobs) if (j.estado === 'correr' || j.estado === 'pausado' || j.estado === 'fila') { j.estado = 'parado'; n++; } _persistir(); return n; }
function definirCap(n) { _estado.capHora = Math.max(5, Math.min(500, Number(n) || 50)); _persistir(); return _estado.capHora; }
function esquecerContactados() { _estado.contactados = {}; _persistir(); return true; }
function emFila() { return _estado.jobs.filter(j => j.estado === 'correr' || j.estado === 'fila' || j.estado === 'pausado').length; }

_carregar().catch(() => {});

module.exports = { divulgar, convitar, estado, pausar, retomar, parar, definirCap, esquecerContactados, emFila, _alvos };
