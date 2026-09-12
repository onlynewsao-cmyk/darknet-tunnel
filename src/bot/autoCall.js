/**
 * autoCall.js — Liga para o Dono ao arrancar e depois de X em X minutos.
 *
 * v6.79. Pedido explícito do Dono: "quando o bot inicia, o meu número toca
 * no mesmo instante, e a cada 5 min faz isso".
 *
 * TRAVÃO DE SEGURANÇA (importante):
 * Chamadas repetidas para o mesmo número são um sinal forte de spam para a
 * Meta e podem custar o banimento do número do bot. Por isso este módulo
 * desliga-se sozinho ao fim de N falhas seguidas (MAX_FALHAS), em vez de
 * ficar a martelar o servidor de 5 em 5 minutos para sempre.
 *
 * Controlo:
 *   AUTO_CALL=on|off         (env, por omissão OFF)
 *   AUTO_CALL_MIN=30         (env, minutos entre chamadas)
 *   autoCall.parar()/arrancar()  em código
 */
'use strict';

const config = require('../config');

const MIN_PADRAO = Number(process.env.AUTO_CALL_MIN || 30);
const MAX_FALHAS = 3;          // falhas seguidas antes de desistir
const ATRASO_ARRANQUE_MS = 8000; // deixa a sessão assentar antes da 1ª chamada

let _timer = null;
let _falhasSeguidas = 0;
let _ligado = false;
let _historico = [];           // últimas 20 tentativas

function _registar(ev) {
  _historico.unshift({ quando: new Date().toISOString(), ...ev });
  if (_historico.length > 20) _historico.pop();
}

function estado() {
  return {
    ligado: _ligado,
    intervaloMin: MIN_PADRAO,
    falhasSeguidas: _falhasSeguidas,
    maxFalhas: MAX_FALHAS,
    proxima: _timer ? 'agendada' : 'nenhuma',
    historico: _historico.slice(0, 5),
  };
}

async function _ligarAgora(getSock, motivo) {
  const sock = typeof getSock === 'function' ? getSock() : getSock;
  if (!sock) {
    _falhasSeguidas += 1;
    _registar({ motivo, ok: false, erro: 'sem_socket' });
    return { ok: false, erro: 'sem_socket' };
  }

  const numero = String(config.owner?.number || '').replace(/\D/g, '');
  if (!numero || numero.length < 9) {
    _falhasSeguidas += 1;
    _registar({ motivo, ok: false, erro: 'owner_invalido' });
    return { ok: false, erro: 'owner_invalido' };
  }

  try {
    // v7.0 — PRIMEIRO tenta a VOZ REAL (RTP) via baileys-caller: a Aura
    // liga, FALA de verdade (saudação) e OUVE de verdade (transcreve e
    // responde). Se não houver sessão VoIP (3.º aparelho) ou o pacote não
    // estiver instalado, cai no realCall (sinalização) como sempre.
    try {
      const live = require('./liveVoip');
      const alvo = numero + '@s.whatsapp.net';
      const rv = await Promise.race([
        live.ligarAoVivo(numero, {
          saudacao: 'Oi meu Dark, sou eu, a Aura. Estou na linha.',
          onEscuta: async (wavBuf) => {
            try {
              const ch = require('./callHandler');
              ch.marcarActiva(alvo, { id: 'vozrtp-' + Date.now(), isVideo: false }, true);
              await ch.continuarConversa(sock, alvo, wavBuf, { pushName: 'Dark' });
            } catch {}
          },
        }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout voip 25s')), 25000)),
      ]);
      if (rv?.ok) {
        _falhasSeguidas = 0;
        try {
          require('./callHandler').marcarActiva(alvo, { id: rv.callId, isVideo: false }, true);
        } catch {}
        _registar({ motivo, ok: true, tocou: true, metodo: 'rtp_vivo', callId: rv.callId });
        console.log(`[autoCall] VOZ REAL (RTP) para ${numero} — Aura fala e ouve`);
        return { ok: true, metodo: 'rtp_vivo', callId: rv.callId };
      }
      // sem sessão/lib → fallback silencioso para realCall (não é falha)
      if (rv?.motivo === 'sem_sessao_voip' || rv?.motivo === 'nao_instalado') {
        _registar({ motivo, ok: false, metodo: 'rtp_vivo', fallback: rv.motivo });
      }
    } catch (e) {
      _registar({ motivo, ok: false, metodo: 'rtp_vivo', erro: String(e?.message || e).slice(0, 80) });
    }

    // Usamos realCall directamente, e NÃO o callBridge: a escada do bridge
    // cai em fallbacks que enviam mensagens (link de chamada, wa.me) em vez
    // de tocar. Num ciclo automático de 5 em 5 min isso seria spam contra o
    // próprio Dono. Aqui: ou toca, ou falha e regista porquê.
    const realCall = require('./realCall');
    const res = await realCall.ligar(sock, numero + '@s.whatsapp.net', { isVideo: false });
    const r = res?.ok
      ? { ok: true, tocou: true, metodo: 'realCall', callId: res.callId }
      : { ok: false, tocou: false, metodo: 'realCall',
          erro: res?.motivo + (res?.codigo ? ' (' + res.codigo + ')' : '') };

    // ATENÇÃO: r.ok=true não chega. A escada do callBridge cai em métodos de
    // recurso (createCallLink, wa.me+ptt) que só ENVIAM UMA MENSAGEM e nunca
    // fazem o telemóvel tocar. Se contássemos isso como sucesso, o bot ficava
    // a enviar-te uma mensagem de link de 5 em 5 minutos para sempre.
    // Só o telemóvel a tocar (r.tocou) conta como sucesso.
    if (r?.ok && r?.tocou) {
      _falhasSeguidas = 0;

      // Abre a janela de conversa da AURA para esta chamada. Sem isto, as
      // notas de voz que o Dono mande a seguir são tratadas como mensagens
      // normais (comandos/menu) em vez de turnos de conversa da chamada.
      try {
        require('./callHandler').marcarActiva(
          numero + '@s.whatsapp.net',
          { id: r.callId, isVideo: false },
          true
        );
      } catch (e) {
        console.warn('[autoCall] nao abriu janela da Aura:', String(e?.message || e).slice(0, 60));
      }

      _registar({ motivo, ok: true, tocou: true, metodo: r.metodo, callId: r.callId });
      console.log(`[autoCall] chamada a tocar (${r.metodo}) para ${numero} — Aura à escuta`);
      return { ok: true, metodo: r.metodo, callId: r.callId };
    }

    if (r?.ok && !r?.tocou) {
      _falhasSeguidas += 1;
      _registar({ motivo, ok: false, tocou: false, metodo: r.metodo, erro: 'nao_tocou' });
      console.warn(
        `[autoCall] "${r.metodo}" não faz tocar, só manda mensagem ` +
        `(${_falhasSeguidas}/${MAX_FALHAS})`
      );
      return { ok: false, erro: 'nao_tocou', metodo: r.metodo };
    }

    _falhasSeguidas += 1;
    _registar({ motivo, ok: false, erro: r?.erro || 'falhou', metodo: r?.metodo });
    console.warn(`[autoCall] falhou (${_falhasSeguidas}/${MAX_FALHAS})`);
    return { ok: false, erro: r?.erro || 'falhou' };
  } catch (e) {
    _falhasSeguidas += 1;
    _registar({ motivo, ok: false, erro: String(e?.message || e).slice(0, 120) });
    console.warn('[autoCall] erro:', String(e?.message || e).slice(0, 100));
    return { ok: false, erro: String(e?.message || e).slice(0, 120) };
  }
}

function parar(porque = 'manual') {
  if (_timer) { clearInterval(_timer); _timer = null; }
  _ligado = false;
  _registar({ motivo: 'parado:' + porque, ok: true });
  console.log('[autoCall] parado (' + porque + ')');
}

/**
 * Arranca o ciclo: 1ª chamada quase já, depois de X em X minutos.
 * @param {function|object} getSock função que devolve o socket vivo
 */
function arrancar(getSock) {
  // Proteção: chamadas automáticas ficam DESLIGADAS por omissão.
  // Só são activadas com AUTO_CALL=on de forma deliberada.
  if (String(process.env.AUTO_CALL || 'off').toLowerCase() === 'off') {
    console.log('[autoCall] desligado por AUTO_CALL=off');
    return { ok: false, motivo: 'desligado_por_env' };
  }
  if (_ligado) return { ok: true, jaLigado: true };

  _ligado = true;
  _falhasSeguidas = 0;

  // 1ª chamada logo que o bot arranca
  setTimeout(() => {
    if (!_ligado) return;
    _ligarAgora(getSock, 'arranque');
  }, ATRASO_ARRANQUE_MS);

  // e depois de X em X minutos
  _timer = setInterval(async () => {
    if (!_ligado) return;
    if (_falhasSeguidas >= MAX_FALHAS) {
      parar('demasiadas_falhas');
      console.warn(
        '[autoCall] PARADO: ' + MAX_FALHAS + ' falhas seguidas. ' +
        'Insistir de 5 em 5 min com chamadas rejeitadas arrisca o banimento ' +
        'do número. Corrige a causa e volta a activar.'
      );
      return;
    }
    await _ligarAgora(getSock, 'intervalo');
  }, MIN_PADRAO * 60 * 1000);

  if (_timer.unref) _timer.unref();
  console.log(`[autoCall] activo: 1ª chamada em ${ATRASO_ARRANQUE_MS / 1000}s, depois cada ${MIN_PADRAO} min`);
  return { ok: true, intervaloMin: MIN_PADRAO };
}

module.exports = { arrancar, parar, estado, _ligarAgora };
