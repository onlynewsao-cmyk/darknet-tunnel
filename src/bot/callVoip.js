/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║   DARK BOT v7.43 — CHAMADAS DE VOZ REAIS (VoIP)              ║
 * ║   @systemzero/baileys ≥ 1.1.3: sock.startCall / playCallAudio ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * O que a AURA precisava para fazer chamadas a sério:
 *   • lib com WebRTC/SRTP: @systemzero/baileys 1.1.4 (o bot estava em
 *     1.1.1, que só tinha rejectCall) — activa sozinha `setupVoip(sock)`.
 *   • opusscript (codec Opus) e ffmpeg (mp3 → PCM s16le 16 kHz mono).
 *
 * API real (lib 1.1.4):
 *   sock.startCall(jid)         → { callId }   (o telemóvel TOCA)
 *   sock.startGroupCall(gjid)   → { callId }   (até 6 pessoas)
 *   sock.playCallAudio(callId, pcmBuffer)      (PCM s16le 16 kHz mono)
 *   sock.stopCallAudio(callId) / sock.endCall(callId)
 *   estado em sock.calls[callId].status ('accept' quando atendem)
 *   ev 'call' → [{ id, status: 'accept'|'reject'|'timeout'|'terminate' }]
 *
 * Só ENVIA áudio (a lib não expõe o áudio recebido). Por isso a Aura
 * FALA na chamada (TTS) e toca música, mas ouve-te por notas de voz.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const activas = new Map(); // chatJid → { callId, desde, tocando, jid }

// v7.44 ANTI-RESTRIÇÃO: chamadas são o sinal mais forte de automação para
// a Meta. Limites duros: 1 chamada de cada vez, máx. 20 min, 2 min de
// intervalo entre chamadas, máx. 6 por hora.
const MAX_DURACAO_MS = 20 * 60 * 1000;
const COOLDOWN_MS = 2 * 60 * 1000;
const MAX_POR_HORA = 6;
let _ultimaChamada = 0;
const _historico = []; // timestamps

function suportado(sock) {
  return !!(sock && typeof sock.startCall === 'function' && typeof sock.playCallAudio === 'function');
}

function ffmpegBin() {
  // ffmpeg-static só tem o binário se o postinstall correu; senão usa o do sistema
  try { const p = require('ffmpeg-static'); if (p && fs.existsSync(p)) return p; } catch {}
  return process.env.FFMPEG_PATH || 'ffmpeg';
}

/** Qualquer áudio (mp3/ogg/m4a/wav) → PCM s16le mono 16 kHz (formato da lib). */
function paraPcm(inputBuf) {
  return new Promise((resolve, reject) => {
    const id = Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    const inP = path.join(os.tmpdir(), `call_${id}.in`);
    const outP = path.join(os.tmpdir(), `call_${id}.pcm`);
    fs.writeFileSync(inP, inputBuf);
    execFile(ffmpegBin(), ['-y', '-i', inP, '-vn', '-f', 's16le', '-ac', '1', '-ar', '16000', outP], { timeout: 120000 }, (err) => {
      let pcm = null;
      try { pcm = fs.readFileSync(outP); } catch {}
      try { fs.unlinkSync(inP); } catch {}
      try { fs.unlinkSync(outP); } catch {}
      if (err || !pcm || pcm.length < 3200) return reject(err || new Error('conversão vazia'));
      resolve(pcm);
    });
  });
}

/** Espera atenderem (ou recusarem). Resolve true se 'accept'. */
function esperarAtender(sock, callId, ms = 35000) {
  return new Promise((resolve) => {
    const fim = (v) => { clearTimeout(t); sock.ev.off('call', on); resolve(v); };
    const t = setTimeout(() => fim(false), ms);
    const on = (calls) => {
      for (const c of calls || []) {
        if (c.id !== callId) continue;
        if (c.status === 'accept') return fim(true);
        if (['reject', 'timeout', 'busy', 'offline', 'terminate'].includes(c.status)) return fim(false);
      }
    };
    sock.ev.on('call', on);
    // já atendida entretanto?
    if (sock.calls?.[callId]?.status === 'accept') fim(true);
  });
}

/** Ouve o fim da chamada para limpar o estado. */
function _vigiarFim(sock, chatJid, callId) {
  const on = (calls) => {
    for (const c of calls || []) {
      if (c.id === callId && ['reject', 'timeout', 'terminate'].includes(c.status)) {
        activas.delete(chatJid);
        sock.ev.off('call', on);
      }
    }
  };
  sock.ev.on('call', on);
}

/**
 * Liga para uma pessoa (PV) ou grupo e espera atenderem.
 * @returns {{ok:boolean, callId?:string, motivo?:string, grupo?:boolean}}
 */
async function ligar(sock, chatJid, { esperar = 35000 } = {}) {
  if (!suportado(sock)) return { ok: false, motivo: 'lib sem VoIP (precisa @systemzero/baileys ≥ 1.1.3)' };
  if (activas.has(chatJid)) return { ok: true, callId: activas.get(chatJid).callId, jaEstava: true };
  if (activas.size >= 1) return { ok: false, motivo: 'já estou noutra chamada' };
  const agora = Date.now();
  while (_historico.length && agora - _historico[0] > 3600e3) _historico.shift();
  if (_historico.length >= MAX_POR_HORA) return { ok: false, motivo: 'limite de chamadas por hora (protecção anti-restrição)' };
  if (agora - _ultimaChamada < COOLDOWN_MS) return { ok: false, motivo: `espera ${Math.ceil((COOLDOWN_MS - (agora - _ultimaChamada)) / 1000)}s entre chamadas` };
  _ultimaChamada = agora; _historico.push(agora);
  const grupo = String(chatJid).endsWith('@g.us');
  let callId;
  try {
    const r = grupo ? await sock.startGroupCall(chatJid, chatJid) : await sock.startCall(chatJid, chatJid);
    callId = r?.callId || r;
  } catch (e) {
    return { ok: false, motivo: 'não consegui iniciar: ' + String(e.message).slice(0, 80) };
  }
  if (!callId) return { ok: false, motivo: 'sem callId' };
  activas.set(chatJid, { callId, desde: Date.now(), tocando: null, jid: chatJid, grupo });
  _vigiarFim(sock, chatJid, callId);
  // tecto de duração
  setTimeout(() => { if (activas.get(chatJid)?.callId === callId) desligar(sock, chatJid).catch(() => {}); }, MAX_DURACAO_MS);
  if (grupo) return { ok: true, callId, grupo: true }; // em grupo não há 'accept' único
  const atendeu = await esperarAtender(sock, callId, esperar);
  if (!atendeu) {
    activas.delete(chatJid);
    try { await sock.endCall(callId); } catch {}
    return { ok: false, motivo: 'não atendeu ou recusou' };
  }
  return { ok: true, callId };
}

/** Toca um buffer de áudio (mp3/ogg…) na chamada activa deste chat. */
async function tocarBuffer(sock, chatJid, audioBuf, { titulo = '' } = {}) {
  const a = activas.get(chatJid);
  if (!a) return { ok: false, motivo: 'sem chamada activa' };
  const pcm = await paraPcm(audioBuf);
  const ok = sock.playCallAudio(a.callId, pcm);
  if (!ok) return { ok: false, motivo: 'a chamada já não está ligada' };
  a.tocando = titulo || 'áudio';
  a.dur = Math.round(pcm.length / 32000); // s16le mono 16k = 32000 B/s
  return { ok: true, dur: a.dur };
}

/** A Aura FALA na chamada (TTS → PCM). */
async function falar(sock, chatJid, texto) {
  const ai = require('./ai');
  const mp3 = await ai.speakWithFallback(String(texto || '').slice(0, 900));
  if (!mp3 || mp3.length < 500) return { ok: false, motivo: 'sem voz' };
  return tocarBuffer(sock, chatJid, mp3, { titulo: 'voz' });
}

/** Procura a música e toca na chamada. */
async function tocarMusica(sock, chatJid, query) {
  const a = activas.get(chatJid);
  if (!a) return { ok: false, motivo: 'sem chamada activa' };
  const szp = require('./systemZeroPlay');
  const r = await szp.ytAudio(query, '128k');
  let buf = r?.buffer;
  if (!buf && r?.url) buf = await require('./mediaHandler').fetchBuffer(r.url);
  if (!buf) return { ok: false, motivo: 'não achei essa música' };
  const t = await tocarBuffer(sock, chatJid, buf, { titulo: r.title || query });
  return { ...t, titulo: r.title || query, thumb: r.thumbnail || r.thumb || null };
}

function parar(sock, chatJid) {
  const a = activas.get(chatJid);
  if (!a) return false;
  try { sock.stopCallAudio(a.callId); } catch {}
  a.tocando = null;
  return true;
}

async function desligar(sock, chatJid) {
  const a = activas.get(chatJid);
  if (!a) return false;
  try { await sock.endCall(a.callId); } catch {}
  activas.delete(chatJid);
  return true;
}

function _resetLimites() { _ultimaChamada = 0; _historico.length = 0; }
function activa(chatJid) { return activas.get(chatJid) || null; }
function todas() { return [...activas.values()]; }

module.exports = { _resetLimites, MAX_DURACAO_MS, COOLDOWN_MS, MAX_POR_HORA, suportado, paraPcm, ligar, tocarBuffer, tocarMusica, falar, parar, desligar, activa, todas, esperarAtender };
