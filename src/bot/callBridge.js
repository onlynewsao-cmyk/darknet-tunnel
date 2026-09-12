/**
 * API interna de chamadas — tenta TODOS os métodos de saída.
 * O Baileys não tem WebRTC; o que existe é sinalizar a chamada
 * (offer / call link) e conversar por voz. Nunca diz "não posso".
 */
'use strict';

const callHandler = require('./callHandler');
const realCall = require('./realCall');

function detectarPedidoChamada(texto) {
  const t = String(texto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (!t) return null;
  const video = /\b(video|v[ií]deo|videocall|videochamada)\b/.test(t);
  const grupo = /\b(grupo|aqui no grupo|no grupo|chamada em grupo)\b/.test(t);
  const liga = /\b(me liga|liga-?me|liga pra mim|liga para mim|faz uma chamada|faz uma call|liga agora|atende|chamada de voz|chamada de video)\b/.test(t);
  if (!liga && !/\bligar?\b/.test(t)) return null;
  return { tipo: video ? 'video' : 'voice', grupo };
}

async function tentarLigar(sock, alvoJid, { tipo = 'voice', pushName = '' } = {}) {
  const tentativas = [];
  const isVideo = tipo === 'video';

  // 1. RTP ao vivo (só voz 1:1, só SAÍDA, só se houver sessão voip isolada).
  // v7.0 — a AURA agora FALA de verdade (saudação por TTS) e OUVE de verdade
  // (evento 'audio' → WAV → transcrição → resposta). O que ela ouve é
  // transcrito e respondido pela mesma conversa do callHandler (PTT).
  if (!isVideo) {
    try {
      const live = require('./liveVoip');
      const num = String(alvoJid).split('@')[0].replace(/\D/g, '');
      const alvo = alvoJid;
      const r = await Promise.race([
        live.ligarAoVivo(num, {
          saudacao: 'Oi, sou a Aura. Estou na linha.',
          onEscuta: async (wavBuf) => {
            try {
              const ch = require('./callHandler');
              ch.marcarActiva(alvo, { id: 'vozrtp-' + Date.now(), isVideo: false }, true);
              await ch.continuarConversa(sock, alvo, wavBuf, { pushName });
            } catch {}
          },
        }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout voip 30s')), 30000)),
      ]);
      tentativas.push({ metodo: 'rtp_vivo', ok: !!r.ok, detalhe: r.motivo || r.metodo });
      if (r.ok) {
        try { require('./callHandler').marcarActiva(alvo, { id: r.callId, isVideo: false }, true); } catch {}
        return { ok: true, tocou: true, metodo: 'rtp_vivo', tipo: 'voice', tentativas };
      }
    } catch (e) {
      tentativas.push({ metodo: 'rtp_vivo', ok: false, erro: String(e.message || e).slice(0, 70) });
    }
  }

  const tryFn = async (nome, fn) => {
    try {
      const r = await fn();
      tentativas.push({ metodo: nome, ok: true });
      return r || { ok: true, metodo: nome };
    } catch (e) {
      tentativas.push({ metodo: nome, ok: false, erro: String(e.message || e).slice(0, 70) });
      return null;
    }
  };

  // Chamada REAL (o telemóvel toca): monta o stanza <call><offer> a partir dos
  // internos que o socket já expõe. Substitui o antigo sock.offerCall, que não
  // existe nesta lib e falhava sempre.
  if (realCall.suportado(sock)) {
    const r = await tryFn('realCall', async () => {
      const res = await realCall.ligar(sock, alvoJid, { isVideo });
      if (!res.ok) throw new Error(res.motivo + (res.detalhe ? ': ' + res.detalhe : ''));
      return res;
    });
    if (r) {
      // Abre a janela de conversa da Aura para esta chamada de SAÍDA.
      // (marcarActiva espera o objecto da chamada com 'id', não 'callId'.)
      try {
        callHandler.marcarActiva?.(alvoJid, { id: r.callId, isVideo }, true);
      } catch {}
      return { ok: true, tocou: true, metodo: 'realCall', callId: r.callId, tipo, tentativas };
    }
  }

  if (typeof sock.offerCall === 'function') {
    const r = await tryFn('offerCall', () => sock.offerCall(alvoJid, { isVideo }));
    if (r) return { ok: true, tocou: true, metodo: 'offerCall', tipo, tentativas };
  }

  if (typeof sock.createCallLink === 'function') {
    const r = await tryFn('createCallLink', async () => {
      const token = await sock.createCallLink(isVideo ? 'video' : 'audio');
      const url = String(token || '').startsWith('http')
        ? String(token)
        : `https://call.whatsapp.com/${isVideo ? 'video' : 'voice'}/${token}`;
      await sock.sendMessage(alvoJid, { text: `📞 Entra na chamada:\n${url}` });
      return { url };
    });
    if (r) return { ok: true, tocou: false, metodo: 'createCallLink', tipo, tentativas, url: r.url };
  }

  const viaHandler = await tryFn('callHandler.ligar', () => callHandler.ligar(sock, alvoJid, { tipo, pushName }));
  if (viaHandler && viaHandler.ok) return { tocou: false, ...viaHandler, tentativas };

  const num = String(alvoJid).split('@')[0].replace(/\D/g, '');
  const url = `https://wa.me/${num}`;
  await sock.sendMessage(alvoJid, {
    text: `📞 Estou a ligar. Se a chamada não abrir sozinha, toca aqui: ${url}`,
  }).catch(() => {});
  callHandler._activas.set(String(alvoJid), {
    id: 'out-' + Date.now(), from: alvoJid, isVideo, inicio: Date.now(),
    ultimo: Date.now(), turnos: 0, isOwner: true,
  });
  return { ok: true, tocou: false, metodo: 'wa.me+ptt', tipo, tentativas, url };
}

async function ligarGrupo(sock, groupJid) {
  if (typeof sock.createCallLink === 'function') {
    try {
      const token = await sock.createCallLink('audio');
      const url = String(token || '').startsWith('http')
        ? String(token)
        : `https://call.whatsapp.com/voice/${token}`;
      await sock.sendMessage(groupJid, { text: `📞 Chamada de grupo — entram aqui:\n${url}` });
      return { ok: true, metodo: 'createCallLink', url };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }
  await sock.sendMessage(groupJid, {
    text: '📞 Chamada de grupo: usem o botão de chamada do WhatsApp neste grupo. Eu fico na linha por voz.',
  });
  return { ok: true, metodo: 'aviso' };
}

module.exports = { detectarPedidoChamada, tentarLigar, ligarGrupo };
