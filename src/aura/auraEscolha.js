/**
 * DARK BOT — Aura Escolha (v7.96) ▾
 * Lista de seleção IGUAL à do menu (single_select pelo generateWAMessageFromContent
 * + relayMessage — provado em produção em dynamicSubmenus/rpg-ui), mas com tokens
 * AURASEL_ para a Aura levar decisões ao Dono (convites, renovações, etc.).
 *
 *   enviar(sock, ctx, {
 *     titulo, linhas,                              // contexto mostrado ANTES
 *     opcoes: [{ label, desc }],                   // até ~10 — dentro da lista
 *     botao, footer, expira,                       // opcionais
 *     dados: { do: 'convite-aceitar', ... },       // gravado: sobrevive a restarts
 *   })
 *   → guarda pendente e manda a lista clicável + 1 linha com os números
 *
 * O commandHandler intercepta tokens AURASEL_ e chama resolver(); cada
 * `dados.do` é tratado no módulo que emitiu o cartão (aqui: a Vigilante).
 */
'use strict';

const _pendentes = new Map(); // tok → { expira, dados, chatJid, autor }
const TTL = 10 * 60 * 1000;   // 10 min para decidir

function _tok() {
  return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
}

/** Lê o pendente SEM apagar (resolver decide). */
function espreitar(tok) {
  const p = _pendentes.get(tok);
  if (!p) return null;
  if (Date.now() > p.expira) { _pendentes.delete(tok); return null; }
  return p;
}

function consumir(tok) {
  const p = espreitar(tok);
  if (p) _pendentes.delete(tok);
  return p;
}

/**
 * Envia o cartão com lista de selecção (formato = o mesmo do menu).
 * @returns {Promise<string>} tok criado ('' se falhou a lista — o texto
 *          com os números já vai na mensagem de fallback).
 */
async function enviar(sock, ctx, { titulo, linhas = [], opcoes, botao, footer, expira = TTL, dados = {}, textoExtra = '' }) {
  const tok = _tok();
  _pendentes.set(tok, { expira: Date.now() + expira, dados, chatJid: ctx.remoteJid, autor: ctx.senderNumber });

  const rows = (opcoes || []).map((o) => ({
    title: String(o.label).slice(0, 24),
    id: `AURASEL_${tok}_${(opcoes.indexOf(o))}`,          // single_select exige `id` (regra do menu)
    description: String(o.desc || '').slice(0, 72),
  }));
  const numerado = (opcoes || []).map((o, i) => `*${i + 1}.* ${o.label}${o.desc ? ' — ' + o.desc : ''}`).join('\n');
  const corpo = [String(titulo || ''), ...linhas, '', numerado, textoExtra].filter(x => x !== undefined && x !== null && x !== '').join('\n') || numerado || ' ';
  const corpoCurto = [String(titulo || ''), ...linhas, '', `👆 Toca em *${String(botao || 'Escolher').slice(0, 30)}* ▾ — ${rows.length} opções ${textoExtra}`.trim()].filter(Boolean).join('\n');

  try {
    const { generateWAMessageFromContent, proto } = require('baileys-v6');
    const m = generateWAMessageFromContent(ctx.remoteJid, {
      interactiveMessage: proto.Message.InteractiveMessage.fromObject({
        body: { text: corpoCurto },
        footer: { text: String(footer || 'Aura · tens 10 min para decidir') },
        nativeFlowMessage: {
          buttons: [{
            name: 'single_select',
            buttonParamsJson: JSON.stringify({
              title: String(botao || 'Escolher'),
              sections: [{ rows }],
            }),
          }],
        },
      }),
    }, { userJid: ctx.remoteJid });
    // v9.5: selo biz/native_flow — as decisões AURASEL também rendem ghost
    await sock.relayMessage(ctx.remoteJid, m.message, {
      messageId: m.key.id,
      additionalNodes: [{ tag: 'biz', attrs: {}, content: [{
        tag: 'interactive', attrs: { type: 'native_flow', v: '1' },
        content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }],
      }] }] });
  } catch (e) {
    // fallback: texto numerado serve na mesma (resolver aceita números)
    await sock.sendMessage(ctx.remoteJid, { text: corpo }).catch(() => {});
  }

  // limpeza barata de caducados
  if (_pendentes.size > 200) {
    for (const [k, v] of _pendentes) if (Date.now() > v.expira) _pendentes.delete(k);
  }
  return tok;
}

/**
 * Resolve um toque AURASEL_<tok>_<idx> ou número escrito com pendente.
 * @returns {Promise<boolean>} true quando um pendente foi consumido.
 */
async function resolver(sock, msg, ctx, token, despachar) {
  const tkFull = String(token || '').trim();
  let m = tkFull.match(/^AURASEL_([a-z0-9]+)_(\d+)$/i);
  if (!m) return false;
  const p = consumir(m[1]);
  if (!p) {
    await sock.sendMessage(ctx.remoteJid, { text: '⌛ Esse cartão já caducou — pede de novo à Aura.' }, { quoted: msg }).catch(() => {});
    return true;
  }
  const idx = parseInt(m[2], 10);
  if (typeof despachar === 'function') {
    try { await despachar(p.dados, idx, { sock, msg, ctx }); } catch (e) { console.warn('[AuraEscolha]', e.message?.slice(0, 60)); }
  }
  return true;
}

module.exports = {
  enviar, resolver, espreitar, consumir, TTL,
  _pendentes,
};
