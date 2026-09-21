'use strict';
/**
 * DARK BOT v11.2.5 — LISTAS COM ESCOLHA POR NÚMERO + PAGINAÇÃO 📋
 *
 * Mostra TODOS os resultados, 10 por página. Se houver mais:
 *   responde "mais" / "avança" / "next" / ">"  → próxima página
 *   responde "volta" / "antes" / "prev" / "<"  → página anterior
 *   responde 1–10 (relativo à página actual) → escolhe o item
 */
const TTL = 3 * 60 * 1000;
const PAGE = 10;
const _pendentes = new Map(); // `${remoteJid}::${senderNumber}` → state

function _key(ctx = {}) {
  return `${ctx.remoteJid || ctx.chat || ''}::${ctx.senderNumber || ctx.sender || ''}`;
}

function _limpar() {
  const agora = Date.now();
  for (const [k, v] of _pendentes) if (agora - v.ts > TTL) _pendentes.delete(k);
}

function limpaSafe(x) { return String(x || '').replace(/[*_`]/g, '').trim(); }

function _pageSlice(state) {
  const total = state.itens.length;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const page = Math.min(Math.max(0, state.page || 0), pages - 1);
  const start = page * PAGE;
  const end = Math.min(start + PAGE, total);
  return { page, pages, start, end, total, sliceItens: state.itens.slice(start, end), sliceLinhas: state.linhas.slice(start, end) };
}

async function _renderPage(sock, msg, ctx, state) {
  const { page, pages, start, end, total, sliceItens, sliceLinhas } = _pageSlice(state);
  const n = sliceItens.length;
  if (!n) throw new Error('lista vazia');

  const numeradas = [];
  for (let i = 0; i < n; i++) numeradas.push(`*${i + 1}.* ${sliceLinhas[i]}`);

  const pageInfo = pages > 1
    ? `\n📄 Página *${page + 1}/${pages}* · itens ${start + 1}–${end} de *${total}*`
    : `\n📋 *${total}* resultado${total === 1 ? '' : 's'}`;
  const nav = pages > 1
    ? `\n> ▶️ *mais* / *avança* · ◀️ *volta*${page > 0 ? '' : ''}`
    : '';

  const texto =
    `${state.titulo}\n${state.intro ? state.intro + '\n' : ''}\n` +
    `${numeradas.join('\n')}${pageInfo}${nav}\n\n` +
    `> Responde com o *número* (1–${n})${state.dica ? '\n' + state.dica : ''}`;

  const corpoCurto =
    `${state.titulo}\n${state.intro ? state.intro + '\n' : ''}` +
    `📄 *${page + 1}/${pages}* · ${total} resultados\n` +
    `> Toca em *ESCOLHER* ▾ ou responde *1–${n}*` +
    (pages > 1 ? `\n> *mais* = próxima página` : '');

  // guarda estado (todos os itens; page actual)
  state.ts = Date.now();
  state.page = page;
  _pendentes.set(_key(ctx), state);

  try {
    const { generateWAMessageFromContent, proto } = require('@systemzero/baileys');
    const rows = [];
    for (let i = 0; i < n; i++) {
      const partes = String(sliceLinhas[i]).split('\n');
      rows.push({
        title: limpaSafe(partes[0]).slice(0, 24) || `Opção ${i + 1}`,
        id: `LISTANUM_${i + 1}`,
        description: limpaSafe(partes.slice(1).join(' ')).slice(0, 72),
      });
    }
    // botões de navegação como rows extra se multi-página
    if (pages > 1 && page + 1 < pages) {
      rows.push({ title: '▶️ Mais resultados', id: 'LISTANAV_NEXT', description: `Página ${page + 2}/${pages}` });
    }
    if (pages > 1 && page > 0) {
      rows.push({ title: '◀️ Página anterior', id: 'LISTANAV_PREV', description: `Página ${page}/${pages}` });
    }

    const m = generateWAMessageFromContent(ctx.remoteJid, {
      interactiveMessage: proto.Message.InteractiveMessage.fromObject({
        body: { text: corpoCurto },
        footer: { text: `📋 ${state.tipo} · pág ${page + 1}/${pages} · ${total}` },
        header: { title: '', hasMediaAttachment: false },
        nativeFlowMessage: {
          buttons: [{
            name: 'single_select',
            buttonParamsJson: JSON.stringify({
              title: limpaSafe(state.titulo).slice(0, 30) || 'ESCOLHER',
              sections: [{ title: limpaSafe(state.titulo).slice(0, 24) || 'Opções', rows }],
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
    return n;
  } catch (_) {}

  await sock.sendMessage(ctx.remoteJid, { text: texto }, { quoted: msg });
  return n;
}

/**
 * Mostra a lista numerada (todos os itens guardados; 1.ª página = 10).
 */
async function mostrar(sock, msg, ctx, { titulo, intro = '', linhas = [], itens = [], tipo = 'lista', aoEscolher, dica = '', pageSize } = {}) {
  _limpar();
  const total = Math.min(linhas.length, itens.length);
  if (!total || typeof aoEscolher !== 'function') throw new Error('lista vazia');
  // guarda TODOS (não corta a 10)
  const state = {
    itens: itens.slice(0, total),
    linhas: linhas.slice(0, total),
    ts: Date.now(),
    tipo,
    aoEscolher,
    titulo,
    intro,
    dica,
    page: 0,
    pageSize: pageSize || PAGE,
  };
  return _renderPage(sock, msg, ctx, state);
}

async function _nav(sock, msg, ctx, dir) {
  _limpar();
  const key = _key(ctx);
  const p = _pendentes.get(key);
  if (!p) return false;
  const { pages } = _pageSlice(p);
  if (dir === 'next') {
    if (p.page + 1 >= pages) {
      await sock.sendMessage(ctx.remoteJid, { text: '📄 Já estás na última página.' }, { quoted: msg }).catch(() => {});
      return true;
    }
    p.page += 1;
  } else if (dir === 'prev') {
    if (p.page <= 0) {
      await sock.sendMessage(ctx.remoteJid, { text: '📄 Já estás na primeira página.' }, { quoted: msg }).catch(() => {});
      return true;
    }
    p.page -= 1;
  } else return false;
  await _renderPage(sock, msg, ctx, p);
  return true;
}

/**
 * Tenta tratar "1".."10" como escolha NA PÁGINA actual.
 */
async function tentarNumero(sock, msg, ctx, text) {
  _limpar();
  const raw = String(text || '').trim();

  // navegação por texto
  if (/^(mais|avança|avanca|next|próxima|proxima|>|>>|seguinte)$/i.test(raw)) {
    return _nav(sock, msg, ctx, 'next');
  }
  if (/^(volta|antes|prev|anterior|<|<<|voltar)$/i.test(raw)) {
    return _nav(sock, msg, ctx, 'prev');
  }

  const m = raw.match(/^0?(10|[1-9])(?:\s.*)?$/);
  if (!m) return false;
  const key = _key(ctx);
  const p = _pendentes.get(key);
  if (!p) return false;
  try {
    const somTs = require('./musicaCard')._pendentes?.get(key)?.ts || 0;
    if (somTs > p.ts) return false;
  } catch {}

  const { start, sliceItens } = _pageSlice(p);
  const localIdx = parseInt(m[1], 10) - 1;
  if (localIdx < 0 || localIdx >= sliceItens.length) {
    await sock.sendMessage(ctx.remoteJid, {
      text: `❌ Escolhe um número de *1* a *${sliceItens.length}* (desta página).`,
    }, { quoted: msg }).catch(() => {});
    return true;
  }
  const globalIdx = start + localIdx;
  const item = p.itens[globalIdx];
  _pendentes.delete(key);
  try {
    await sock.sendMessage(ctx.remoteJid, { react: { text: '⏳', key: msg.key } }).catch(() => {});
    await p.aoEscolher({ sock, msg, ctx, item, idx: globalIdx });
  } catch (e) {
    await sock.sendMessage(ctx.remoteJid, { text: `❌ ${String(e?.message || e).slice(0, 120)}` }, { quoted: msg }).catch(() => {});
  }
  return true;
}

/* clique LISTANUM_<n> ou LISTANAV_* */
async function tentarToken(sock, msg, ctx, text) {
  const t = String(text || '').trim();
  if (/^LISTANAV_NEXT$/i.test(t)) return _nav(sock, msg, ctx, 'next');
  if (/^LISTANAV_PREV$/i.test(t)) return _nav(sock, msg, ctx, 'prev');
  const m = t.match(/^LISTANUM_(10|[1-9])$/i);
  if (!m) return false;
  return tentarNumero(sock, msg, ctx, m[1]);
}

module.exports = {
  mostrar,
  tentarNumero,
  tentarToken,
  _pendentes,
  _key,
  PAGE,
  _pageSlice,
};
