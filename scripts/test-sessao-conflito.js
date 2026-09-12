/**
 * DARK BOT — CONFLITO DE SESSÃO (v6.70)
 *
 * O Dono reportou DUAS VEZES que a AURA não responde a nada — texto,
 * voz, marcação, PV, grupos, chamadas. Mas todos os testes passam e
 * o /status diz "connected".
 *
 * CAUSA REAL (diagnosticada em produção):
 *   O /status mostrava "Mensagens: 32" e, logo a seguir a eu correr
 *   o bot no sandbox com as MESMAS credenciais do MongoDB, passou a
 *   "Mensagens: 0 | Uptime: 8s". O Render tinha sido derrubado.
 *
 *   Duas instâncias com as mesmas creds roubam a ligação uma à
 *   outra em ciclo (código 440 = connectionReplaced). Cada uma
 *   reconecta e derruba a outra. Sintoma: "online mas mudo".
 *
 * O código antigo reconectava com backoff normal (3s→48s), o que
 * ALIMENTAVA o ciclo. Agora detecta 440, espera 60s e desiste ao
 * fim de 3 conflitos para não queimar o número.
 *
 * Uso: node scripts/test-sessao-conflito.js
 */
'use strict';

const path = require('path');
const fs = require('fs');
let ok = 0, fail = 0;
const t = (n, c, e) => { e = e || ''; c ? ok++ : fail++; console.log('  ' + (c ? '✅' : '❌') + ' ' + n + (e ? ' → ' + String(e).slice(0, 72) : '')); };

(async () => {
  console.log('\n╔═══ CONFLITO DE SESSÃO — "online mas mudo" ═══╗');

  // ── A. O código do Baileys ──────────────────────────────────
  console.log('\n▸ A. Código de conflito do WhatsApp');
  const { DisconnectReason } = require('@systemzero/baileys');
  t('connectionReplaced é 440', DisconnectReason.connectionReplaced === 440, String(DisconnectReason.connectionReplaced));
  t('loggedOut é 401 (diferente)', DisconnectReason.loggedOut === 401, String(DisconnectReason.loggedOut));

  // ── B. O handler trata o 440 ────────────────────────────────
  console.log('\n▸ B. whatsapp.js reage ao conflito');
  const wa = fs.readFileSync(path.join(__dirname, '..', 'src', 'bot', 'whatsapp.js'), 'utf8');
  t('Detecta connectionReplaced/440', /connectionReplaced|code === 440/.test(wa), '');
  t('Conta os conflitos', /_conflitos/.test(wa), '');
  t('Desiste ao 3º (não queima o número)', /_conflitos >= 3/.test(wa), '');
  t('Espera 60s (não o backoff de 3s)', /}, 60000\)/.test(wa), '');
  t('Reset do contador em ligação normal', /this\._conflitos = 0;/.test(wa), '');
  t('Avisa que há outra instância', /outra instância/i.test(wa), '');

  // ── C. A lógica em si ───────────────────────────────────────
  console.log('\n▸ C. Simulação da decisão');
  function decidir(code, reason, conflitosAntes) {
    const isLoggedOut = code === 401;
    const isConflito = code === 440 || /conflict|replaced/i.test(reason || '');
    if (isConflito) {
      const n = conflitosAntes + 1;
      return n >= 3 ? { accao: 'parar', conflitos: n } : { accao: 'esperar60s', conflitos: n };
    }
    if (isLoggedOut) return { accao: 'limparSessao', conflitos: 0 };
    return { accao: 'reconectar', conflitos: 0 };
  }
  t('440 → espera 60s', decidir(440, 'Connection Replaced', 0).accao === 'esperar60s', '');
  t('440 três vezes → PARA', decidir(440, 'x', 2).accao === 'parar', 'conflitos=' + decidir(440, 'x', 2).conflitos);
  t('401 → limpa sessão', decidir(401, 'logged out', 0).accao === 'limparSessao', '');
  t('428 (queda normal) → reconecta', decidir(428, 'closed', 0).accao === 'reconectar', '');
  t('Queda normal zera o contador', decidir(428, 'closed', 2).conflitos === 0, '');

  // ── D. /diag existe e denuncia o problema ───────────────────
  console.log('\n▸ D. Rota /diag');
  const idx = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.js'), 'utf8');
  t('Rota /diag existe', /app\.get\('\/diag'/.test(idx), '');
  t('Mostra o commit em execução', /out\.commit/.test(idx), '');
  t('Verifica se as correcções estão no código', /out\.correccoes/.test(idx), '');
  t('Mostra as guardas (ai_auto, disabled_*)', /ai_auto_enabled/.test(idx) && /disabled_groups/.test(idx), '');
  t('Expõe conflitos de sessão', /conflitos_de_sessao/.test(idx), '');
  t('Avisa se está mudo há muito tempo', /AVISO_SILENCIO/.test(idx), '');

  console.log('\n  ' + ok + ' OK / ' + fail + ' FALHOU\n');
  process.exit(fail ? 1 : 0);
})();
