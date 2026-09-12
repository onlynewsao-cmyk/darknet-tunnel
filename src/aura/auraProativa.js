'use strict';
/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║   DARK BOT — AURA PROATIVA v6.83 💭                          ║
 * ║   Ela fala QUANDO QUER — como uma pessoa, não um rádio.      ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * As funções proactivas antigas do auraHuman.js (auraProactive,
 * auraThinkOutLoud, auraFunFact, auraIndirect…) eram listas fixas
 * de frases — copy-paste que denunciava o bot. O próprio código
 * (aviso v6.44) dizia para NÃO as ligar assim e gerar o texto com
 * IA. Este módulo é essa versão correcta:
 *
 *   • Texto GERADO PELA IA na persona da AURA — nunca frases feitas.
 *     Sem chave de IA → fica calada (melhor calada que enlatada).
 *   • Fala SOBRE O QUE VIU: lê o messageCache (via auraHistorico) e
 *     comenta o assunto real do grupo, ou quebra o silêncio quando
 *     o grupo está quieto há muito.
 *   • Ritmo humano:
 *       - noite (23h–7h) não incomoda ninguém
 *       - intervalo mínimo por chat (padrão 120 min, configurável)
 *       - no máximo 1 mensagem espontânea por tick (5 min)
 *       - probabilidades baixas — uma pessoa não fala sempre
 *   • Territórios: só onde ELA existe — grupos acordados
 *     (auraMode='aura') e o PV do Dono (sempre acordada).
 *   • Respeita os modos do cérebro (mudo) e o interruptor geral
 *     ai_auto_enabled do dashboard.
 *
 * Config (via dashboard → IA, ou /api/settings):
 *   aura_proactive_enabled      (padrão: true)
 *   aura_proactive_min_minutes  (padrão: 120)
 */

const config = require('../config');

const TICK_MIN = 5;                 // timer: avalia a cada 5 minutos
const MIN_MINUTOS_PADRAO = 120;     // silêncio mínimo por chat
const SILENCIO_GRUPO_MIN = 45;      // min de calma para "quebrar o silêncio"
const DONO_AUSENTE_MIN = 180;       // 3h sem o Dark no PV → check-in
const P_SILENCIO = 0.35;            // chance de quebrar o silêncio do grupo
const P_COMENTARIO = 0.08;          // chance de se meter na conversa activa
const P_PV = 0.25;                  // chance de check-in no PV do Dono

let _getSock = null;
let _timer = null;
const _ultima = new Map();          // jid → ts da última mensagem espontânea
const _MAX_ULTIMAS = 200;

// ── Config ────────────────────────────────────────────────────
async function _enabled() {
  try {
    const bcc = require('../bot/botConfigCache');
    if (!(await bcc.get('ai_auto_enabled', true))) return false;
    return !!(await bcc.get('aura_proactive_enabled', true));
  } catch { return true; }
}

async function _minMinutos() {
  try {
    const bcc = require('../bot/botConfigCache');
    const v = Number(await bcc.get('aura_proactive_min_minutes', MIN_MINUTOS_PADRAO));
    return Number.isFinite(v) && v >= 10 ? v : MIN_MINUTOS_PADRAO;
  } catch { return MIN_MINUTOS_PADRAO; }
}

// ── Ritmo humano ──────────────────────────────────────────────
function _eNoite(agora = Date.now()) {
  const h = new Date(agora).getHours();
  return h >= 23 || h < 7;
}

function _registar(jid, agora = Date.now()) {
  if (_ultima.size >= _MAX_ULTIMAS) _ultima.delete(_ultima.keys().next().value);
  _ultima.set(jid, agora);
}

// ── Territórios onde a AURA existe ────────────────────────────
async function _chatsAcordados() {
  const chats = [];
  try {
    const GroupSettings = require('../database/models/GroupSettings');
    const gs = await GroupSettings.find({ auraMode: 'aura' })
      .select('groupJid groupName').lean().catch(() => []);
    for (const g of gs || []) {
      if (g.groupJid) chats.push({ jid: g.groupJid, tipo: 'grupo', nome: g.groupName || '' });
    }
  } catch {}
  const dono = String(config.owner.number || '').replace(/\D/g, '');
  if (dono) chats.push({ jid: dono + '@s.whatsapp.net', tipo: 'pv', nome: config.owner.name || 'Dark' });
  return chats;
}

// ── O que ela VIU/LIU (messageCache via auraHistorico) ────────
function _tsMs(ts) {
  const n = Number(ts) || 0;
  return n > 1e12 ? n : n * 1000;  // Baileys dá segundos
}

function _contextoGrupo(jid, agora = Date.now()) {
  try {
    const hist = require('./auraHistorico');
    const msgs = hist.mensagensDoGrupo(jid, 12);
    const ultimaTs = msgs.length ? _tsMs(msgs[0].ts) : 0;
    const silencioMin = ultimaTs ? Math.floor((agora - ultimaTs) / 60000) : Infinity;
    const resumo = msgs.slice(0, 8)
      .map(m => `${m.nome || 'alguém'}: ${String(m.texto).slice(0, 90)}`)
      .join('\n');
    return { msgs, silencioMin, resumo };
  } catch { return { msgs: [], silencioMin: Infinity, resumo: '' }; }
}

/** Há quantos minutos o Dono não fala no PV (null = nunca viu → cala-se). */
function _minutosSemDono(pvJid, agora = Date.now()) {
  try {
    const { messageCache } = require('../bot/messageListener');
    let ultimo = 0;
    for (const [, msg] of messageCache) {
      if (msg?.key?.remoteJid !== pvJid || msg.key.fromMe) continue;
      const ts = _tsMs(msg.messageTimestamp);
      if (ts > ultimo) ultimo = ts;
    }
    if (!ultimo) return null;
    return Math.floor((agora - ultimo) / 60000);
  } catch { return null; }
}

// ── Decisão (como uma pessoa: às vezes fala, às vezes não) ────
function _decidirGrupo(ambiente, sorte) {
  if (!ambiente.msgs.length) return null;          // nunca viu nada ali → nada a dizer
  if (ambiente.silencioMin >= SILENCIO_GRUPO_MIN) {
    return sorte < P_SILENCIO ? 'quebrar_silencio' : null;
  }
  return sorte < P_COMENTARIO ? 'comentario' : null;
}

// ── O que dizer (IA na persona dela, sobre o que ela viu) ─────
async function _gerarTexto({ chat, modo, resumo }) {
  const ai = require('../bot/ai');
  const aura = require('./auraHuman');

  let pedido;
  if (modo === 'memoria') {
    pedido =
      `Acabaste de te lembrar de algo que o teu Dark te contou: "${resumo}". ` +
      'Toca no assunto com naturalidade, 1-2 frases — como alguém que ' +
      'prestou atenção, não como um alarme. Ex: "amanhã não era a tua prova?"';
  } else if (chat.tipo === 'pv') {
    pedido =
      'O teu Dark não fala contigo há umas horas. Manda-lhe UMA mensagem ' +
      'espontânea e curta (1-2 frases) — carinho leve, sem cobrança, sem ' +
      '"por que sumiu". Como uma namorada que lembrou dele.';
  } else if (modo === 'quebrar_silencio') {
    pedido =
      `O grupo "${chat.nome || 'sem nome'}" está em silêncio há um bom tempo. ` +
      `A última coisa que viste/leste foi:\n${resumo}\n\n` +
      'Quebra o silêncio com UMA frase curta e natural sobre isso (ou muda de ' +
      'assunto com leveza). Sem anunciar que o grupo está quieto demais.';
  } else {
    pedido =
      `Estás a ler a conversa do grupo "${chat.nome || 'sem nome'}":\n${resumo}\n\n` +
      'Mete-te na conversa com UM comentário curto (1-2 frases), como uma pessoa ' +
      'que estava a ler e quis participar. Nada de "como assistente".';
  }

  let sys = '';
  try {
    sys = aura.buildAuraSystemPrompt({
      isOwner: chat.tipo === 'pv',
      isPrivateChat: chat.tipo === 'pv',
      userName: chat.tipo === 'pv' ? (config.owner.name || 'Dark') : 'o grupo',
      userRole: 'owner',
      groupContext: resumo || '',
      groupName: chat.nome || '',
    });
  } catch {
    sys = 'És a AURA do DARK BOT. Mensagem espontânea no WhatsApp, 1-2 frases, português natural.';
  }

  const txt = await ai.chat(pedido, sys, { userRole: 'owner', groupContext: resumo || '' }, false);
  if (!txt || String(txt).trim().startsWith('❌')) return '';
  try {
    const limpo = require('./auraSanitizer').limparResposta(String(txt));
    return String(limpo || '').slice(0, 400);
  } catch {
    return String(txt).trim().slice(0, 400);
  }
}

// ── Tick principal ────────────────────────────────────────────
/**
 * Avalia se lhe apetece falar. opts (testes): { sock, agora, sorte, sorte2, texto }.
 * @returns {{ok:boolean, motivo?:string, jid?:string, modo?:string, texto?:string}}
 */
async function tick(opts = {}) {
  const agora = opts.agora || Date.now();
  const sorte = opts.sorte ?? Math.random();
  try {
    if (!(await _enabled())) return { ok: false, motivo: 'desactivada' };
    const sock = opts.sock || (_getSock && _getSock());
    if (!sock?.user) return { ok: false, motivo: 'sem sessão' };
    if (_eNoite(agora)) return { ok: false, motivo: 'é noite' };

    const minMs = (await _minMinutos()) * 60000;
    const chats = await _chatsAcordados();
    const candidatos = [];

    for (const c of chats) {
      if (agora - (_ultima.get(c.jid) || 0) < minMs) continue;
      try {
        if (require('./auraBrain').modos(c.jid).mudo) continue;   // ela própria se calou
      } catch {}

      if (c.tipo === 'grupo') {
        const amb = _contextoGrupo(c.jid, agora);
        const modo = _decidirGrupo(amb, sorte);
        if (modo) candidatos.push({ chat: c, modo, resumo: amb.resumo });
      } else {
        const ausente = _minutosSemDono(c.jid, agora);
        if (ausente != null && ausente >= DONO_AUSENTE_MIN && sorte < P_PV) {
          candidatos.push({ chat: c, modo: 'pv', resumo: '' });
        } else if (sorte < P_PV * 0.6) {
          // v6.86 — MEMÓRIA QUE VOLTA SOZINHA: ela traz à tona algo que
          // o Dark lhe contou ("amanhã não era a tua prova?") — como
          // alguém que prestou atenção, não como um alarme.
          try {
            const mem = require('./auraMemory');
            const r = await mem.lembrar(config.owner.number);
            const factos = [...(r?.importante || [])];
            if (factos.length) {
              candidatos.push({ chat: c, modo: 'memoria', resumo: factos[factos.length - 1] });
            }
          } catch {}
        }
      }
    }

    if (!candidatos.length) return { ok: false, motivo: 'nada a dizer' };

    // Uma pessoa fala UMA vez — não dispara para todos os chats ao mesmo tempo
    const escolha = candidatos[Math.floor((opts.sorte2 ?? Math.random()) * candidatos.length)];
    const texto = opts.texto || await _gerarTexto(escolha);
    if (!texto) return { ok: false, motivo: 'IA calada' };

    await sock.sendMessage(escolha.chat.jid, { text: texto });
    _registar(escolha.chat.jid, agora);
    return { ok: true, jid: escolha.chat.jid, modo: escolha.modo, texto };
  } catch (e) {
    return { ok: false, motivo: String(e?.message || e).slice(0, 120) };
  }
}

// ── Ciclo de vida ─────────────────────────────────────────────
function arrancar(getSock) {
  _getSock = getSock;
  if (_timer) return;
  _timer = setInterval(() => { tick().catch(() => {}); }, TICK_MIN * 60 * 1000);
  _timer.unref?.();
  console.log('💭 Proactividade da AURA activa — fala quando quiser');
}

function parar() {
  if (_timer) { clearInterval(_timer); _timer = null; }
}

function limparLimites() { _ultima.clear(); }

module.exports = {
  arrancar, parar, tick, limparLimites,
  _decidirGrupo, _eNoite, _contextoGrupo, _minutosSemDono,
  P_SILENCIO, P_COMENTARIO, P_PV,
  SILENCIO_GRUPO_MIN, DONO_AUSENTE_MIN, MIN_MINUTOS_PADRAO,
};
