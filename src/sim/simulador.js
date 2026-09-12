/**
 * simulador.js — Motor de simulação.
 *
 * Liga o fakeSock ao código REAL do bot:
 *   - mensagens  -> commandHandler.handle()
 *   - chamada recebida -> callHandler.onCall()
 *   - chamada de saída -> realCall.ligar() / callHandler.ligar()
 *
 * Nada aqui imita respostas: quem responde é o bot verdadeiro.
 */
'use strict';

const { criarFakeSock, criarMensagem, criarChamada } = require('./fakeSock');

let _sock = null;
const _historico = [];

function sock() {
  if (!_sock) _sock = criarFakeSock();
  return _sock;
}

function _reg(entrada) {
  _historico.push({ ...entrada, quando: new Date().toISOString() });
  if (_historico.length > 200) _historico.shift();
  return entrada;
}

function reset() {
  _sock = criarFakeSock();
  _historico.length = 0;
  try { require('../bot/callHandler')._activas?.clear?.(); } catch {}
  return { ok: true };
}

/**
 * Envia uma mensagem ao bot e devolve o que ele respondeu.
 */
async function enviarMensagem({ texto, de = '244945280380', grupo = null, pushName = 'Dono' }) {
  const s = sock();
  const antes = s._sim.enviadas.length;
  const msg = criarMensagem({ texto, de, grupo, pushName });

  const t0 = Date.now();
  let erro = null;
  try {
    const ch = require('../bot/commandHandler');
    try { require('../bot/caseHandler').loadCases(); } catch {}
    await ch.handle(s, msg);
  } catch (e) {
    erro = e?.message || String(e);
  }
  const ms = Date.now() - t0;

  const respostas = s._sim.enviadas.slice(antes);
  return _reg({
    accao: 'mensagem',
    entrada: { texto, de, grupo: grupo || null },
    respostas,
    ms,
    erro
  });
}

/**
 * Simula uma chamada RECEBIDA (alguém liga ao bot).
 */
async function chamadaRecebida({ de = '244945280380', isVideo = false, isGroup = false }) {
  const s = sock();
  const antes = s._sim.enviadas.length;
  const call = criarChamada({ de, isVideo, isGroup });

  const t0 = Date.now();
  let resultado = null, erro = null;
  try {
    const cH = require('../bot/callHandler');
    resultado = await cH.onCall(s, call, {
      ownerJid: '244945280380@s.whatsapp.net',
      ownerNumber: '244945280380',
      isOwner: String(de).replace(/\D/g, '') === '244945280380'
    });
  } catch (e) {
    erro = e?.message || String(e);
  }
  const ms = Date.now() - t0;

  return _reg({
    accao: 'chamada_recebida',
    entrada: { de, tipo: isVideo ? 'video' : 'voz', isGroup },
    callId: call.id,
    resultado,
    respostas: s._sim.enviadas.slice(antes),
    ms,
    erro
  });
}

/**
 * Simula uma chamada de SAÍDA (o bot liga a alguém).
 * Exercita o realCall verdadeiro e mostra o stanza <call><offer> gerado.
 */
async function chamadaSaida({ para = '244945280380', isVideo = false, via = 'realCall' }) {
  const s = sock();
  const antesMsg = s._sim.enviadas.length;
  const antesStz = s._sim.stanzas.length;

  const t0 = Date.now();
  let resultado = null, erro = null;
  try {
    if (via === 'callHandler') {
      resultado = await require('../bot/callHandler')
        .ligar(s, String(para).replace(/\D/g, '') + '@s.whatsapp.net', { tipo: isVideo ? 'video' : 'voice' });
    } else if (via === 'callBridge') {
      resultado = await require('../bot/callBridge')
        .tentarLigar(s, para, { tipo: isVideo ? 'video' : 'voice', pushName: 'Sim' });
    } else {
      resultado = await require('../bot/realCall').ligar(s, para, { isVideo });
    }
  } catch (e) {
    erro = e?.message || String(e);
  }
  const ms = Date.now() - t0;

  // Descreve o stanza gerado, para se ver o que iria para a rede
  const novos = s._sim.stanzas.slice(antesStz);
  const offer = novos.find(n => n?.tag === 'call' && (n.content || [])[0]?.tag === 'offer');
  let detalheOffer = null;
  if (offer) {
    const o = offer.content[0];
    const dest = (o.content || []).find(c => c.tag === 'destination');
    detalheOffer = {
      to: offer.attrs?.to,
      callId: o.attrs?.['call-id'],
      criador: o.attrs?.['call-creator'],
      elementos: (o.content || []).map(c => c.tag),
      dispositivos: dest ? (dest.content || []).length : 0,
      temDeviceIdentity: (o.content || []).some(c => c.tag === 'device-identity'),
      temVideo: (o.content || []).some(c => c.tag === 'video')
    };
  }

  return _reg({
    accao: 'chamada_saida',
    entrada: { para, tipo: isVideo ? 'video' : 'voz', via },
    resultado,
    offer: detalheOffer,
    stanzas: novos.map(n => n?.tag),
    respostas: s._sim.enviadas.slice(antesMsg),
    ms,
    erro
  });
}

function historico() { return _historico.slice().reverse(); }

function estado() {
  const s = sock();
  let rc = null;
  try { rc = require('../bot/realCall').suportado(s); } catch {}
  return {
    mensagensEnviadas: s._sim.enviadas.length,
    stanzas: s._sim.stanzas.length,
    realCallSuportado: rc,
    accoes: _historico.length
  };
}

module.exports = {
  reset, enviarMensagem, chamadaRecebida, chamadaSaida, historico, estado, sock
};
