'use strict';
/**
 * v7.90 — RPG UI 🎮 BOTÕES + LISTAS CLICÁVEIS
 *
 * Uma coisa que facilita o RPG inteiro: em vez de escrever comandos, o
 * jogador TOCA — confirmar/negar (✅ Sim / ❌ Não), escolher de uma
 * lista, tudo com o efeito a correr no clique.
 *
 * Mecânica = a do RPGPICK_/CHANGE_THEME_ (provada em produção):
 *  - o clique volta como TEXTO (selectedButtonId / selectedRowId):
 *      RPGSIM_<tok>       → confirmou SIM
 *      RPGNAO_<tok>       → negou
 *      RPGSEL_<tok>_<idx> → escolheu a opção idx da lista
 *  - o commandHandler intercepta esses tokens ANTES do parser de comandos
 *  - o pendente vive NA MEMÓRIA por remetente (3 min), UM por pessoa —
 *    respondeu → executa 1× e morre (clique duplo não cobra duas vezes).
 *
 * Fallback escrito (quando o cliente não renderiza botões/lista):
 *  - !rpgsim / !rpgnao        → decide a última confirmação
 *  - !rpgescolher <número>    → escolhe da última lista
 */

const buttonHandler = require('../buttonHandler');

const _pend = new Map();            // senderNumber → { tok, tipo, expira, dados }
const TTL = 3 * 60 * 1000;

setInterval(() => {
  const agora = Date.now();
  for (const [k, v] of _pend) if (agora > v.expira) _pend.delete(k);
}, 60 * 1000).unref?.();

const _tok = () => Math.random().toString(36).slice(2, 8);

// ════════════════════════════════════════════════════════════
// 1. CONFIRMAR / NEGAR — dois botões, corre o efeito na escolha
// ════════════════════════════════════════════════════════════
/**
 * confirmar(sock, msg, ctx, {
 *   titulo, linhas,              // o que se pergunta
 *   onSim, onNao,                // async ({sock,msg,ctx}) — o efeito
 *   txtSim, txtNao,              // rótulos dos botões (máx. 24 chars)
 * })
 */
async function confirmar(sock, msg, ctx, { titulo, linhas = [], onSim, onNao, txtSim = '✅ Sim', txtNao = '❌ Não', expira = TTL }) {
  const tok = _tok();
  _pend.set(ctx.senderNumber, { tok, tipo: 'confirm', expira: Date.now() + expira, dados: { onSim, onNao } });
  const corpo = [titulo, ...linhas, '', '👇 Toca, ou escreve *!rpgsim* / *!rpgnao*'].filter(x => x !== undefined).join('\n');
  await buttonHandler.sendButtons(sock, ctx.remoteJid, corpo, '🎮 RPG · tens 3 min para decidir', [
    { id: `RPGSIM_${tok}`, text: txtSim },
    { id: `RPGNAO_${tok}`, text: txtNao },
  ], msg).catch(async () => {
    await sock.sendMessage(ctx.remoteJid, { text: corpo }, { quoted: msg }).catch(() => {});
  });
  return true;
}

// ════════════════════════════════════════════════════════════
// 2. LISTA DE ESCOLHA — single_select, corre o efeito no toque
// ════════════════════════════════════════════════════════════
/**
 * escolher(sock, msg, ctx, {
 *   titulo, subtitulo, linhas,
 *   opcoes: [{ label, desc }],   // até ~10
 *   onEscolha: async (idx, {sock,msg,ctx}),
 * })
 */
async function escolher(sock, msg, ctx, { titulo, subtitulo, linhas = [], opcoes, onEscolha, expira = TTL }) {
  const tok = _tok();
  _pend.set(ctx.senderNumber, { tok, tipo: 'sel', expira: Date.now() + expira, dados: { onEscolha, n: opcoes.length } });
  const rows = opcoes.map((o, i) => ({
    title: String(o.label).slice(0, 24),
    id: `RPGSEL_${tok}_${i}`,   // v7.93: `id` (formato do menu) — com rowId a lista abria mas não seleccionava.
    description: String(o.desc || '').slice(0, 72),
  }));
  const numerado = opcoes.map((o, i) => `${i + 1}. ${o.label}${o.desc ? ' — ' + o.desc : ''}`).join('\n');
  const texto = [...linhas, '', numerado, '', '👇 Toca, ou escreve *!rpgescolher <número>*'].join('\n');
  // v7.92 — corpo curto: as opções aparecem DENTRO da lista (no toque).
  const corpoCurto = [...linhas, '', `👆 Toca em *${String(titulo).slice(0, 30)}* ▾ — tens ${opcoes.length} opções 【ou escreve !rpgescolher <número>】`].join('\n');
  try {
    const { generateWAMessageFromContent, proto } = require('baileys-v6');
    const m = generateWAMessageFromContent(ctx.remoteJid, {
      interactiveMessage: proto.Message.InteractiveMessage.fromObject({
        body: { text: corpoCurto },
        footer: { text: '🎮 RPG · tens 3 min para escolher' },
        header: { title: '', hasMediaAttachment: false },
        nativeFlowMessage: {
          buttons: [{
            name: 'single_select',
            buttonParamsJson: JSON.stringify({
              title: String(titulo).slice(0, 60),
              sections: [{ title: String(subtitulo || titulo).slice(0, 24), rows }],
            }),
          }],
        },
      }),
    }, { userJid: sock.user?.id, quoted: msg });
    await sock.relayMessage(ctx.remoteJid, m.message, {
      messageId: m.key.id,
      additionalNodes: [{ tag: 'biz', attrs: {}, content: [{
        tag: 'interactive', attrs: { type: 'native_flow', v: '1' },
        content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }],
      }] }],
    });
    return true;
  } catch (_) {}
  await sock.sendMessage(ctx.remoteJid, { text: texto }, { quoted: msg }).catch(() => {});
  return false;
}

// ════════════════════════════════════════════════════════════
// 3. RESOLUÇÃO — o commandHandler chama com o token do clique
// ════════════════════════════════════════════════════════════
async function resolver(sock, msg, ctx, token) {
  const tk = String(token || '');
  let m;

  if ((m = tk.match(/^RPGSIM_([a-z0-9]+)$/i)) || (m = tk.match(/^RPGNAO_([a-z0-9]+)$/i))) {
    const sim = tk.toUpperCase().startsWith('RPGSIM');
    const pend = _pend.get(ctx.senderNumber);
    if (!pend || pend.tipo !== 'confirm' || Date.now() > pend.expira || pend.tok.toLowerCase() !== m[1].toLowerCase()) {
      await sock.sendMessage(ctx.remoteJid, { text: '⏳ Essa confirmação já não é tua / expirou — lança o comando de novo.' }, { quoted: msg }).catch(() => {});
      return true;
    }
    _pend.delete(ctx.senderNumber);
    const fn = sim ? pend.dados.onSim : pend.dados.onNao;
    if (typeof fn === 'function') await fn({ sock, msg, ctx });
    return true;
  }

  if ((m = tk.match(/^RPGSEL_([a-z0-9]+)_(\d+)$/i))) {
    const tok = m[1], idx = Number(m[2]);
    const pend = _pend.get(ctx.senderNumber);
    if (!pend || pend.tipo !== 'sel' || Date.now() > pend.expira || pend.tok.toLowerCase() !== tok.toLowerCase() || idx >= pend.dados.n) {
      await sock.sendMessage(ctx.remoteJid, { text: '⏳ Essa lista já expirou — pede outra vez.' }, { quoted: msg }).catch(() => {});
      return true;
    }
    _pend.delete(ctx.senderNumber);
    await pend.dados.onEscolha(idx, { sock, msg, ctx });
    return true;
  }

  return false;
}

// ════════════════════════════════════════════════════════════
// 4. FALLBACK ESCRITO — !rpgsim / !rpgnao / !rpgescolher <n>
// ════════════════════════════════════════════════════════════
async function decidirPorTexto(sock, msg, ctx, aceitar) {
  const pend = _pend.get(ctx.senderNumber);
  if (!pend || pend.tipo !== 'confirm' || Date.now() > pend.expira) {
    await sock.sendMessage(ctx.remoteJid, { text: '🤔 Não tens confirmações pendentes.' }, { quoted: msg }).catch(() => {});
    return true;
  }
  _pend.delete(ctx.senderNumber);
  const fn = aceitar ? pend.dados.onSim : pend.dados.onNao;
  if (typeof fn === 'function') await fn({ sock, msg, ctx });
  return true;
}

async function escolherPorTexto(sock, msg, ctx, n) {
  const pend = _pend.get(ctx.senderNumber);
  if (!pend || pend.tipo !== 'sel' || Date.now() > pend.expira) {
    await sock.sendMessage(ctx.remoteJid, { text: '🤔 Não tens listas pendentes — pede de novo.' }, { quoted: msg }).catch(() => {});
    return true;
  }
  const idx = Number(n) - 1;
  if (!Number.isInteger(idx) || idx < 0 || idx >= pend.dados.n) {
    await sock.sendMessage(ctx.remoteJid, { text: `❌ Opção inválida — escolhe entre 1 e ${pend.dados.n}.` }, { quoted: msg }).catch(() => {});
    return true;
  }
  _pend.delete(ctx.senderNumber);
  await pend.dados.onEscolha(idx, { sock, msg, ctx });
  return true;
}

function pendentes() { return _pend; }   // testes/depuração

module.exports = { confirmar, escolher, resolver, decidirPorTexto, escolherPorTexto, pendentes };
