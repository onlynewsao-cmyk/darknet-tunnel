'use strict';

const participantIdentity = require('./participantIdentity');
const { hasActiveEntitlement } = require('./groupEntitlement');

/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║   DARK BOT — Auto-apresentação v1 (incoming-cases)          ║
 * ║   Port nativo de "auto-apresetacão.txt"                     ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * Novo membro tem 5 minutos para enviar uma mensagem no grupo,
 * com lembretes a cada minuto. Se não falar, é removido.
 * Admins são isentos. Exige bot admin + `autoapresentar` ligado.
 * Estado em memória (timers); flag persistida no GroupSettings.
 */

const PRAZO_MINUTOS = 5;
const MINUTO_MS = Math.max(50, Number(process.env.AUTOAP_MINUTO_MS) || 60000);

// grupoId => Map(token => pendencia)
const pendentes = new Map();

function somenteDigitos(v) {
  return participantIdentity.jidNumber(v);
}

function textoMencao(numero, fallback = 'Membro') {
  return numero ? `@${numero}` : `*${fallback}*`;
}

function botName() {
  try { return require('./darkUtils').botName || require('../config').bot.name || 'DARK BOT'; }
  catch { return 'DARK BOT'; }
}

function painel(linhas) {
  return [`╔━◈『 *${botName()}* 』◈`, `┃`, ...linhas.map(l => `┃ 𝄞 ${l}`), `┗━◈`].join('\n');
}

function mapaDoGrupo(grupoId, criar = false) {
  let mapa = pendentes.get(grupoId);
  if (!mapa && criar) { mapa = new Map(); pendentes.set(grupoId, mapa); }
  return mapa;
}

function cancelarTimers(p) {
  if (!p) return;
  p.cancelada = true;
  if (p.timer) clearTimeout(p.timer);
  for (const t of p.timers || []) clearTimeout(t);
  p.timer = null;
  p.timers = [];
}

function apagarPendencia(grupoId, token) {
  const mapa = mapaDoGrupo(grupoId);
  if (!mapa) return null;
  const p = mapa.get(token);
  cancelarTimers(p);
  mapa.delete(token);
  if (mapa.size === 0) pendentes.delete(grupoId);
  return p || null;
}

function cancelarPendenciasDoGrupo(grupoId) {
  const mapa = mapaDoGrupo(grupoId);
  if (!mapa) return 0;
  const n = mapa.size;
  for (const p of mapa.values()) cancelarTimers(p);
  pendentes.delete(grupoId);
  return n;
}

function jidsDe(p) {
  if (!p) return [];
  if (typeof p === 'string') return [p];
  return [p.id, p.jid, p.lid, p.phoneNumber, p.pn, p.pnJid].filter(v => typeof v === 'string' && v);
}

function ehAdmin(p) {
  return p?.admin === 'admin' || p?.admin === 'superadmin';
}

async function getSettings(groupJid) {
  try {
    const GroupSettings = require('../database/models/GroupSettings');
    return await GroupSettings.findOne({ groupJid }).lean().catch(() => null);
  } catch { return null; }
}

function botJidNumero(sock) {
  return somenteDigitos(sock?.user?.id || '');
}

function botEAdminNoMeta(sock, meta) {
  const botNum = botJidNumero(sock);
  if (!botNum) return false;
  return (meta?.participants || []).some(p =>
    ehAdmin(p) && jidsDe(p).some(j => somenteDigitos(j) === botNum));
}

// ── Remoção ──────────────────────────────────────────────────────

async function enviarLembrete(sock, grupoId, token, minutoPassado) {
  const p = mapaDoGrupo(grupoId)?.get(token);
  if (!p || p.cancelada) return;
  // Trial/aluguel pode expirar e o bot pode perder admin enquanto o timer
  // está vivo. Nesse caso cancelar é sempre mais seguro do que continuar a
  // avisar ou punir num grupo que já não tem o serviço activo.
  const gs = await getSettings(grupoId);
  const meta = await sock.groupMetadata(grupoId).catch(() => null);
  if (!gs?.autoapresentar || !hasActiveEntitlement(gs) || !botEAdminNoMeta(sock, meta)) {
    apagarPendencia(grupoId, token);
    return;
  }
  const restam = PRAZO_MINUTOS - minutoPassado;
  await sock.sendMessage(grupoId, {
    text: painel([
      `*Alerta  »* ⏰ ${textoMencao(p.numero, 'Novo membro')}`,
      `*Tempo   »* ${minutoPassado} ${minutoPassado === 1 ? 'minuto passado' : 'minutos passados'}`,
      `*Restam  »* ${restam} ${restam === 1 ? 'minuto' : 'minutos'}`,
      `*Ação    »* Envia uma mensagem para não seres removido.`,
    ]),
    mentions: [p.jid],
  }).catch(e => console.error('[autoapresentar] lembrete:', e.message?.slice(0, 60)));
}

async function removerSeNaoApresentou(sock, grupoId, token) {
  const mapa = mapaDoGrupo(grupoId);
  const p = mapa?.get(token);
  if (!p) return;
  const gs = await getSettings(grupoId);
  if (!gs?.autoapresentar || !hasActiveEntitlement(gs)) {
    apagarPendencia(grupoId, token);
    return;
  }
  apagarPendencia(grupoId, token); // retira primeiro (anti-corrida)
  try {
    const meta = await sock.groupMetadata(grupoId);
    const membros = meta?.participants || [];
    const membro = membros.find(m => jidsDe(m).some(j => p.jids.has(j)))
      || membros.find(m => somenteDigitos(jidsDe(m)[0]) === p.numero && p.numero);
    if (!membro) return;                       // saiu sozinho
    if (ehAdmin(membro)) return;                // promovido entretanto
    const bot = membros.find(m => jidsDe(m).some(j => somenteDigitos(j) === botJidNumero(sock)));
    // Perdeu admin durante o prazo: fica silencioso, sem ameaçar/remeter
    // culpa ao grupo por uma acção que já não pode executar.
    if (!ehAdmin(bot)) return;
    const jidRemocao = membro.phoneNumber || membro.pn || membro.pnJid || membro.id || membro.jid || membro.lid || p.jid;
    await sock.groupParticipantsUpdate(grupoId, [jidRemocao], 'remove');
    await sock.sendMessage(grupoId, {
      text: painel([
        `*Ação    »* 🚫 Membro removido`,
        `*Membro  »* ${textoMencao(p.numero, 'Membro')}`,
        `*Motivo  »* Não enviou mensagem em ${PRAZO_MINUTOS} minutos.`,
      ]),
      mentions: [p.jid],
    }).catch(() => {});
  } catch (e) {
    console.error('[autoapresentar] remoção:', e.message?.slice(0, 80));
    await sock.sendMessage(grupoId, {
      text: painel([
        `*Aviso   »* ⚠️ Falha na remoção`,
        `*Membro  »* ${textoMencao(p.numero, 'Membro')}`,
        `*Motivo  »* Verifica se o bot é administrador.`,
      ]),
      mentions: [p.jid],
    }).catch(() => {});
  }
}

async function criarPendencia(sock, grupoId, participante, membros) {
  const ids = jidsDe(participante);
  const membro = (membros || []).find(m => jidsDe(m).some(j => ids.includes(j)));
  const jid = participante?.pnJid || participante?.phoneNumber || membro?.phoneNumber || membro?.pn || membro?.pnJid || membro?.id || membro?.jid || ids[0];
  if (!jid) return;
  if (ehAdmin(membro)) return; // admins isentos
  const numero = somenteDigitos(membro?.phoneNumber || membro?.pn || membro?.pnJid || participante?.phoneNumber || participante?.pnJid || jid);
  if (numero && numero === botJidNumero(sock)) return; // o próprio bot

  const jids = new Set([...jidsDe(membro || participante), jid]);
  const mapa = mapaDoGrupo(grupoId, true);
  for (const [tok, atual] of mapa.entries()) {
    if ([...atual.jids].some(id => jids.has(id))) apagarPendencia(grupoId, tok);
  }
  const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const p = { participante, jid, numero, jids, timer: null, timers: [], cancelada: false };
  mapa.set(token, p);

  try {
    await sock.sendMessage(grupoId, {
      text: painel([
        `*Aviso   »* ⚠️ ${textoMencao(numero, 'Novo membro')}`,
        `*Ação    »* Apresenta-te ao grupo.`,
        `*Prazo   »* ${PRAZO_MINUTOS} minutos`,
        `*Alertas »* A cada 1 minuto.`,
        `*Punição »* Remoção automática.`,
      ]),
      mentions: [jid],
    });
  } catch (e) {
    apagarPendencia(grupoId, token);
    throw e;
  }

  const viva = mapaDoGrupo(grupoId)?.get(token);
  if (!viva) return; // falou enquanto o aviso era enviado
  for (let minuto = 1; minuto < PRAZO_MINUTOS; minuto++) {
    const t = setTimeout(() => enviarLembrete(sock, grupoId, token, minuto)
      .catch(e => console.error('[autoapresentar] timer:', e.message?.slice(0, 60))), minuto * MINUTO_MS);
    t.unref?.();
    viva.timers.push(t);
  }
  viva.timer = setTimeout(() => removerSeNaoApresentou(sock, grupoId, token)
    .catch(e => console.error('[autoapresentar] timer:', e.message?.slice(0, 60))), PRAZO_MINUTOS * MINUTO_MS);
  viva.timer.unref?.();
}

// ── Entradas públicas ────────────────────────────────────────────

/** groupEvents: add → cria pendência; remove → cancela. */
async function onParticipantsUpdate(sock, groupJid, participants, action, meta) {
  try {
    if (!groupJid?.endsWith('@g.us')) return;
    if (action === 'remove') {
      const mapa = mapaDoGrupo(groupJid);
      if (!mapa?.size) return;
      const idsSaida = new Set((participants || []).flatMap(jidsDe));
      for (const [tok, p] of [...mapa.entries()]) {
        if ([...p.jids].some(j => idsSaida.has(j))) apagarPendencia(groupJid, tok);
      }
      return;
    }
    if (action !== 'add') return;
    const gs = await getSettings(groupJid);
    const metadata = meta || await sock.groupMetadata(groupJid).catch(() => null);
    // Nunca inicia contagens/regras automáticas num grupo sem trial/aluguel
    // válido. Também exige o bot admin antes do primeiro aviso: sem esse
    // poder, avisar alguém sobre uma remoção que não pode acontecer é ruído.
    if (!gs?.autoapresentar || !hasActiveEntitlement(gs) || !botEAdminNoMeta(sock, metadata)) {
      cancelarPendenciasDoGrupo(groupJid);
      return;
    }
    for (const participante of participants || []) {
      try { await criapPendenciaSafe(sock, groupJid, participante, metadata?.participants || []); }
      catch (e) { console.error('[autoapresentar] aviso:', e.message?.slice(0, 60)); }
    }
  } catch (e) {
    console.error('[autoapresentar]', e?.message?.slice(0, 80));
  }
}

async function criapPendenciaSafe(sock, grupoId, participante, membros) {
  return criarPendencia(sock, grupoId, participante, membros);
}

/** messageRouter: membro falou → cancela a pendência dele (barato). */
function onMessage(sock, msg) {
  try {
    const grupoId = msg?.key?.remoteJid || '';
    if (!grupoId.endsWith('@g.us') || msg.key?.fromMe) return false;
    const mapa = mapaDoGrupo(grupoId);
    if (!mapa?.size) return false;
    const remetente = msg.key?.participant || grupoId;
    const numRem = somenteDigitos(remetente);
    for (const [tok, p] of [...mapa.entries()]) {
      if (p.jids.has(remetente) || (numRem && p.numero && numRem === p.numero)) {
        apagarPendencia(grupoId, tok);
        return true;
      }
    }
    return false;
  } catch { return false; }
}

module.exports = {
  onParticipantsUpdate, onMessage, cancelarPendenciasDoGrupo,
  PRAZO_MINUTOS,
  _internals: { pendentes, apagarPendencia, removerSeNaoApresentou, botEAdminNoMeta },
};
