/**
 * Sabe quem está a falar COM ela vs quem parou.
 * Janela de conversa: 3 minutos. Depois considera que a pessoa saiu.
 */
'use strict';

const JANELA = 3 * 60 * 1000;
const _fala = new Map(); // `${jid}:${num}` → ts

function key(jid, num) {
  return String(jid || '') + ':' + String(num || '');
}

function marcarFala(jid, num) {
  _fala.set(key(jid, num), Date.now());
}

function estaAFalar(jid, num) {
  const ts = _fala.get(key(jid, num));
  return !!(ts && Date.now() - ts < JANELA);
}

function parou(jid, num) {
  _fala.delete(key(jid, num));
}

function limparExpirados() {
  const agora = Date.now();
  for (const [k, ts] of _fala) {
    if (agora - ts >= JANELA) _fala.delete(k);
  }
}

module.exports = { marcarFala, estaAFalar, parou, limparExpirados, JANELA };
