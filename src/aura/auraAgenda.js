'use strict';
/**
 * AURA AGENDA — v6.81
 * ═══════════════════════════════════════════════════════════
 * Publicações periódicas: conselhos, orações, dicas, daily,
 * notícias, motivação... A AURA gera o conteúdo com a IA na
 * hora, por isso nunca repete o mesmo texto.
 *
 * Persiste no MongoDB (`aura_agenda`): o Render free reinicia
 * e dorme, e sem isto perdia-se tudo a cada arranque.
 *
 * VELOCIDADE: um único `setInterval` de 60 s para TODAS as
 * agendas. Não toca no caminho das mensagens.
 */

const CHAVE = 'aura_agenda';
let _timer = null;
let _getSock = null;
let _cache = null;          // [{jid, tema, intervaloMin, proxima, criadaEm}]
let _cacheTs = 0;
const CACHE_TTL = 60 * 1000;

// Temas que o Dark pediu, com o tom de cada um.
const TEMAS = {
  conselhos:  'um conselho de vida curto e prático',
  oracoes:    'uma oração curta, sentida e respeitosa',
  dicas:      'uma dica útil do dia-a-dia',
  daily:      'a mensagem do dia — motivação para começar bem',
  noticias:   'um resumo curto do que se passa no mundo hoje',
  motivacao:  'uma mensagem de motivação forte',
  comunidade: 'uma mensagem para unir e animar a comunidade',
  curiosidade:'uma curiosidade fascinante',
  versiculo:  'um versículo bíblico com uma frase de reflexão',
  humor:      'uma piada ou algo com muita graça',
};

function detectarTema(texto) {
  const t = String(texto || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/\borac|reza|prece\b/.test(t)) return 'oracoes';
  if (/\bconselho/.test(t)) return 'conselhos';
  if (/\bdica/.test(t)) return 'dicas';
  if (/\bdaily|mensagem do dia|bom dia\b/.test(t)) return 'daily';
  if (/\bnoticia|news\b/.test(t)) return 'noticias';
  if (/\bmotiva/.test(t)) return 'motivacao';
  if (/\bcomunidade\b/.test(t)) return 'comunidade';
  if (/\bcuriosidade/.test(t)) return 'curiosidade';
  if (/\bversiculo|biblia\b/.test(t)) return 'versiculo';
  if (/\bpiada|humor|graca\b/.test(t)) return 'humor';
  return 'daily';
}

/** "de 2 em 2 horas", "todos os dias", "de manhã" → minutos. */
function detectarIntervalo(texto) {
  const t = String(texto || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const mh = t.match(/de (\d+) em (\d+) horas?/) || t.match(/cada (\d+) horas?/);
  if (mh) return Math.max(1, parseInt(mh[1], 10)) * 60;
  const mm = t.match(/de (\d+) em (\d+) minutos?/) || t.match(/cada (\d+) minutos?/);
  if (mm) return Math.max(15, parseInt(mm[1], 10));
  if (/\bde hora em hora|cada hora|a cada hora\b/.test(t)) return 60;
  if (/\btodos os dias|diariamente|todo dia|de manha|todas as manhas\b/.test(t)) return 24 * 60;
  if (/\btoda semana|semanalmente\b/.test(t)) return 7 * 24 * 60;
  return 24 * 60;
}

async function _ler() {
  const agora = Date.now();
  if (_cache && agora - _cacheTs < CACHE_TTL) return _cache;
  try {
    const BotConfig = require('../database/models/BotConfig');
    const doc = await BotConfig.findOne({ key: CHAVE }).lean().catch(() => null);
    _cache = Array.isArray(doc?.value) ? doc.value : [];
  } catch {
    _cache = [];
  }
  _cacheTs = agora;
  return _cache;
}

async function _gravar(lista) {
  _cache = lista;
  _cacheTs = Date.now();
  try {
    const BotConfig = require('../database/models/BotConfig');
    await BotConfig.updateOne({ key: CHAVE }, { $set: { key: CHAVE, value: lista } }, { upsert: true });
  } catch {}
}

/** Cria (ou substitui) a agenda deste chat. */
async function criar(pedido, { jid }) {
  const tema = detectarTema(pedido);
  const intervaloMin = detectarIntervalo(pedido);
  const lista = (await _ler()).filter(a => !(a.jid === jid && a.tema === tema));
  lista.push({
    jid, tema, intervaloMin,
    proxima: Date.now() + intervaloMin * 60 * 1000,
    criadaEm: Date.now(),
  });
  await _gravar(lista.slice(-100));

  const quando = intervaloMin >= 1440
    ? (intervaloMin === 1440 ? 'todos os dias' : `de ${Math.round(intervaloMin / 1440)} em ${Math.round(intervaloMin / 1440)} dias`)
    : intervaloMin >= 60 ? `de ${Math.round(intervaloMin / 60)} em ${Math.round(intervaloMin / 60)} horas`
    : `de ${intervaloMin} em ${intervaloMin} minutos`;
  return { ok: true, msg: `Agendado: ${tema} ${quando}. Começo já a seguir. ✅` };
}

async function parar(jid) {
  const lista = await _ler();
  const ficam = lista.filter(a => a.jid !== jid);
  const n = lista.length - ficam.length;
  await _gravar(ficam);
  return n > 0
    ? { ok: true, msg: `Parei ${n} agendamento${n > 1 ? 's' : ''} aqui.` }
    : { ok: true, msg: 'Não havia nada agendado aqui.' };
}

async function listar(jid) {
  return (await _ler()).filter(a => a.jid === jid);
}

/** Gera o conteúdo com a IA e publica. */
async function _publicar(a, sock) {
  try {
    const ai = require('../bot/ai');
    const desc = TEMAS[a.tema] || TEMAS.daily;
    const sys = 'És a AURA, assistente do DARK BOT. Escreves posts curtos para WhatsApp, em português de Angola, com emojis a sério e formatação (*negrito*). Só o post, sem introduções nem aspas.';
    const texto = await ai.chat(`Escreve ${desc}. Máximo 6 linhas. Diferente do habitual, criativo.`, sys, { userRole: 'owner' }, false);
    if (texto && texto.trim()) {
      await sock.sendMessage(a.jid, { text: texto.trim() });
    }
  } catch (e) {
    console.warn('[Agenda]', e.message?.slice(0, 60));
  }
}

/** Corre de minuto a minuto; só age quando há algo vencido. */
async function _tick() {
  try {
    if (!_getSock) return;
    const sock = _getSock();
    if (!sock?.user) return;                    // desligada: não faz nada
    const lista = await _ler();
    if (!lista.length) return;

    const agora = Date.now();
    const vencidas = lista.filter(a => a.proxima <= agora);
    if (!vencidas.length) return;

    for (const a of vencidas) {
      await _publicar(a, sock);
      a.proxima = agora + a.intervaloMin * 60 * 1000;
    }
    await _gravar(lista);
  } catch (e) {
    console.warn('[Agenda tick]', e.message?.slice(0, 60));
  }
}

function arrancar(getSock) {
  _getSock = getSock;
  if (_timer) return;
  _timer = setInterval(_tick, 60 * 1000);
  _timer.unref?.();
  console.log('🗓️  Agenda da AURA activa');
}

function parar_tudo() {
  if (_timer) { clearInterval(_timer); _timer = null; }
}

module.exports = { criar, parar, listar, arrancar, parar_tudo, detectarTema, detectarIntervalo, TEMAS, _tick };
