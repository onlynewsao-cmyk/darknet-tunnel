/**
 * Só ATENDER a chamada. Sem conversa, sem PTT, sem foto.
 *
 * Sequência WACRG (incoming 1:1 / grupo):
 *   1. ack do stanza
 *   2. receipt do offer
 *   3. preaccept (a tocar)
 *   4. accept (atendeu)
 *   5. terminate quando desligares
 *
 * Isto é sinalização. Sem SRTP o telemóvel pode cair ao fim de segundos —
 * mas o toque PARA e a chamada fica ATENDIDA no ecrã. É o primeiro passo.
 */
'use strict';

function tag(sock) {
  if (typeof sock.generateMessageTag === 'function') return sock.generateMessageTag();
  return String(Date.now()) + Math.random().toString(16).slice(2, 6);
}

function campos(call) {
  const from = call.from || call.chatId || '';
  const callId = call.id || call.callId || '';
  const creator = call.creator || call.callCreator || call['call-creator'] || from;
  const isVideo = !!(call.isVideo || call.video || call.media === 'video');
  const isGroup = !!(call.isGroup || call.group || String(from).endsWith('@g.us'));
  const grupoJid = call.groupJid || call.chatId || (isGroup ? from : '');
  // v7.0 — a expressão antiga tinha precedência errada (punha null mesmo
  // quando havia stanzaId). id do ack é opcional; se existir, usa.
  const stanzaId = call.stanzaId || call.nodeId || null;
  return { from, callId, creator, isVideo, isGroup, grupoJid, stanzaId };
}

async function enviar(sock, node, nome, log) {
  try {
    if (typeof sock.sendNode === 'function') {
      await sock.sendNode(node);
      log.push({ passo: nome, via: 'sendNode', ok: true });
      return true;
    }
  } catch (e) {
    log.push({ passo: nome, via: 'sendNode', ok: false, erro: String(e.message || e).slice(0, 60) });
  }
  try {
    if (typeof sock.query === 'function') {
      await sock.query(node);
      log.push({ passo: nome, via: 'query', ok: true });
      return true;
    }
  } catch (e) {
    log.push({ passo: nome, via: 'query', ok: false, erro: String(e.message || e).slice(0, 60) });
  }
  log.push({ passo: nome, via: 'nenhum', ok: false });
  return false;
}

function nodeAck(from, stanzaId) {
  return {
    tag: 'ack',
    attrs: { class: 'call', to: from, ...(stanzaId ? { id: stanzaId } : {}) },
  };
}

function nodeReceipt(from, callId, creator) {
  return {
    tag: 'receipt',
    attrs: { to: from, id: String(Date.now()) },
    content: [{
      tag: 'offer',
      attrs: { 'call-id': callId, 'call-creator': creator },
    }],
  };
}

function nodePreaccept(from, callId, creator, isVideo) {
  return {
    tag: 'call',
    attrs: { to: from },
    content: [{
      tag: 'preaccept',
      attrs: { 'call-id': callId, 'call-creator': creator },
      content: [
        { tag: 'audio', attrs: { enc: 'opus', rate: '16000' } },
        ...(isVideo ? [{ tag: 'video', attrs: {} }] : []),
        { tag: 'net', attrs: { medium: '3' } },
        { tag: 'capability', attrs: { ver: '1' } },
      ],
    }],
  };
}

function nodeAccept(from, callId, creator, isVideo) {
  return {
    tag: 'call',
    attrs: { to: from },
    content: [{
      tag: 'accept',
      attrs: { 'call-id': callId, 'call-creator': creator },
      content: [
        { tag: 'audio', attrs: { enc: 'opus', rate: '16000' } },
        { tag: 'audio', attrs: { enc: 'opus', rate: '8000' } },
        ...(isVideo ? [{ tag: 'video', attrs: {} }] : []),
        { tag: 'net', attrs: { medium: '2' } },
        { tag: 'encopt', attrs: { keygen: '2' } },
      ],
    }],
  };
}

function nodeTerminate(from, callId, creator) {
  return {
    tag: 'call',
    attrs: { to: from },
    content: [{
      tag: 'terminate',
      attrs: { 'call-id': callId, 'call-creator': creator, reason: 'ended' },
    }],
  };
}

function esperar(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Detecta e ATENDE. Não fala.
 * @returns {{ok:boolean, atendeu:boolean, tipo:string, grupo:boolean, passos:object[]}}
 */
async function atender(sock, call) {
  const c = campos(call);
  const passos = [];
  if (!c.from || !c.callId) {
    return { ok: false, atendeu: false, motivo: 'offer_incompleto', passos };
  }

  if (typeof sock.acceptCall === 'function') {
    try {
      await sock.acceptCall(c.callId, c.from);
      passos.push({ passo: 'acceptCall_api', ok: true });
    } catch (e) {
      passos.push({ passo: 'acceptCall_api', ok: false, erro: String(e.message || e).slice(0, 50) });
    }
  }

  await enviar(sock, nodeAck(c.from, c.stanzaId), 'ack', passos);
  await enviar(sock, nodeReceipt(c.from, c.callId, c.creator), 'receipt_offer', passos);
  await enviar(sock, nodePreaccept(c.from, c.callId, c.creator, c.isVideo), 'preaccept', passos);
  await esperar(180);
  const okAccept = await enviar(sock, nodeAccept(c.from, c.callId, c.creator, c.isVideo), 'accept', passos);

  // grupo: também manda accept ao jid do grupo se for diferente
  if (c.isGroup && c.grupoJid && c.grupoJid !== c.from) {
    await enviar(sock, nodeAccept(c.grupoJid, c.callId, c.creator, c.isVideo), 'accept_grupo', passos);
  }

  return {
    ok: true,
    atendeu: okAccept || passos.some(p => p.ok && /accept/i.test(p.passo)),
    tipo: c.isVideo ? 'video' : 'voz',
    grupo: c.isGroup,
    callId: c.callId,
    from: c.from,
    creator: c.creator,
    passos,
  };
}

async function desligar(sock, callOuJid) {
  const c = typeof callOuJid === 'string'
    ? { from: callOuJid, callId: '', creator: callOuJid }
    : campos(callOuJid);
  if (!c.from || !c.callId) return { ok: false, motivo: 'sem_chamada' };
  const passos = [];
  await enviar(sock, nodeTerminate(c.from, c.callId, c.creator), 'terminate', passos);
  if (typeof sock.rejectCall === 'function' && c.callId) {
    try { await sock.rejectCall(c.callId, c.from); } catch {}
  }
  return { ok: true, passos };
}

module.exports = {
  atender,
  desligar,
  campos,
  nodeAck,
  nodeReceipt,
  nodePreaccept,
  nodeAccept,
  nodeTerminate,
};
