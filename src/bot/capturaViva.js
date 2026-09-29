/**
 * v12.9.35 — GRUPOS DO BOT AO VIVO 🎯
 * O dashboard lê TODOS os grupos em que o bot está e captura:
 *   · UM grupo específico (sync, devolve já);
 *   · UMA COMUNIDADE inteira (pai + todos os subgrupos);
 *   · TODOS os grupos — em SEGUNDO PLANO com progresso
 *     (com 1000+ grupos o HTTP síncrono morria a meio).
 * Usa o socket do NÚMERO PRINCIPAL (slot 1) — o mesmo que o dono
 * vê no WhatsApp. Sem duplicados (centralBase decide).
 */
'use strict';
const base = require('./centralBase');

const _estado = { emCurso: false, modo: '', feitos: 0, total: 0, novos: 0, grupo: '', resultados: null, fim: null, iniciado: null };
const progresso = () => ({ ..._estado });

function _sock() {
  const { getBot } = require('./whatsapp');
  const bot = getBot();
  if (!bot || bot.getStatus().status !== 'connected' || !bot.sock) return null;
  return bot.sock;
}

/** Lista TODOS os grupos do bot (mesma detecção do .comunidade no WhatsApp). */
async function listarVivos() {
  const sock = _sock();
  if (!sock) return { ok: false, motivo: 'bot-nao-conectado' };
  const all = await sock.groupFetchAllParticipating().catch(() => ({}));
  const grupos = Object.values(all || {}).map((g) => ({
    jid: g.id,
    nome: g.subject || 'grupo',
    size: g.participants?.length || g.size || 0,
    comunidade: !!g.isParentGroup || /comunity|comunidade/i.test(g.subject || ''),
    pai: g.linkedParentJid || '',
  })).sort((a, b) => b.size - a.size);
  return { ok: true, total: grupos.length, grupos };
}

/** Captura UM grupo (sync — uma chamada groupMetadata, devolve na hora). */
async function capturarUm(jid) {
  const sock = _sock();
  if (!sock) return { ok: false, motivo: 'bot-nao-conectado' };
  const meta = await sock.groupMetadata(jid).catch((e) => null);
  if (!meta) return { ok: false, motivo: 'grupo-indisponivel' };
  const r = base.capturarGrupo(jid, meta, { fonte: 'dashboard' });
  const s = base.stats();
  return { ok: true, nome: r.nome, novos: r.novos, duplicados: r.duplicados, totalBase: s.total };
}

/** Loop interno de captura (comunidade ou todos) com pausas humanas. */
async function _capturarLista(jids, modo) {
  _estado.emCurso = true; _estado.modo = modo; _estado.feitos = 0;
  _estado.total = jids.length; _estado.novos = 0; _estado.resultados = null;
  _estado.iniciado = Date.now(); _estado.fim = null;
  const sock = _sock();
  if (!sock) { _estado.emCurso = false; _estado.fim = Date.now(); _estado.resultados = { ok: false, motivo: 'bot-nao-conectado' }; return; }
  const resultados = [];
  let novos = 0, feitos = 0, falharam = 0;
  base.carregar();
  for (const jid of jids) {
    try {
      const meta = await sock.groupMetadata(jid);
      const r = base.capturarGrupo(jid, meta, { fonte: 'dashboard', persistir: false });
      novos += r.novos;
      resultados.push({ jid, nome: r.nome, novos: r.novos, duplicados: r.duplicados });
    } catch (e) {
      falharam++;
      resultados.push({ jid, erro: String(e.message || e).slice(0, 60) });
    }
    feitos++;
    if (feitos % 25 === 0) base.guardar();   // lote a cada 25 grupos
    _estado.feitos = feitos; _estado.novos = novos; _estado.grupo = (resultados[resultados.length - 1] || {}).nome || '';
    await new Promise((x) => setTimeout(x, 350 + Math.floor(Math.random() * 250)));   // ritmo humano
  }
  base.guardar();
  const s = base.stats();
  _estado.emCurso = false; _estado.fim = Date.now();
  _estado.resultados = { ok: true, grupos: feitos - falharam, falharam, novos, totalBase: s.total, detalhes: resultados };
}

/** Captura em FUNDO: { todos: true } ou { comunidade: jid } (pai + filhos). */
async function capturarFundo(opts = {}) {
  if (_estado.emCurso) return { ok: false, motivo: 'captura-ja-em-curso', progresso: progresso() };
  const sock = _sock();
  if (!sock) return { ok: false, motivo: 'bot-nao-conectado' };
  let jids = null, modo = '';
  if (opts.comunidade) {
    const { grupos } = await listarVivos();
    const pai = grupos.find((g) => g.jid === opts.comunidade);
    if (!pai) return { ok: false, motivo: 'grupo-indisponivel' };
    const filhos = grupos.filter((g) => g.pai === opts.comunidade).map((g) => g.jid);
    jids = [...new Set([opts.comunidade, ...filhos])];
    modo = 'comunidade';
  } else {
    const { grupos } = await listarVivos();
    jids = grupos.map((g) => g.jid);
    modo = 'todos';
  }
  if (!jids.length) return { ok: false, motivo: 'sem-grupos' };
  _capturarLista(jids, modo).catch(() => { _estado.emCurso = false; _estado.fim = Date.now(); });
  return { ok: true, fundo: true, total: jids.length, progresso: progresso() };
}

module.exports = { listarVivos, capturarUm, capturarFundo, progresso };
