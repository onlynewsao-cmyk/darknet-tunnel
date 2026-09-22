'use strict';
/**
 * DARK BOT v11.2.9 — LISTAS COM ESCOLHA POR NÚMERO + PAGINAÇÃO + ANTI-DUPLICADO
 *
 * Mostra TODOS os resultados, 10 por página. Se houver mais:
 *   responde "mais" / "avança" / "next" / ">"  → próxima página
 *   responde "volta" / "antes" / "prev" / "<"  → página anterior
 *   responde 1–10 (relativo à página actual) → escolhe o item
 *   anti-duplicado: não reenvia mesmo nº, expira enviados
 */
const TTL = 3 * 60 * 1000;
const PAGE = 10;
const _pendentes = new Map();

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
  for (let i = 0; i < n; i++) {
    const globalIdx = start + i;
    const ja = state.enviados?.has(globalIdx);
    numeradas.push(`*${i + 1}.* ${ja ? '✅ ' : ''}${sliceLinhas[i]}${ja ? ' · já enviado' : ''}`);
  }

  const pageInfo = pages > 1
    ? `\n📄 Página *${page + 1}/${pages}* · itens ${start + 1}–${end} de *${total}*`
    : `\n📋 *${total}* resultado${total === 1 ? '' : 's'}`;
  const nav = pages > 1
    ? `\n> ▶️ *mais* / *avança* · ◀️ *volta*`
    : '';
  const enviadosInfo = state.enviados?.size ? `\n> ✅ Já enviados: ${[...state.enviados].map(i=>i+1).join(', ')} (expiram, não repetem)` : '';

  const texto =
    `${state.titulo}\n${state.intro ? state.intro + '\n' : ''}\n` +
    `${numeradas.join('\n')}${pageInfo}${nav}${enviadosInfo}\n\n` +
    `> Responde com o *número* (1–${n})${state.dica ? '\n' + state.dica : ''}`;

  const corpoCurto =
    `${state.titulo}\n${state.intro ? state.intro + '\n' : ''}` +
    `📄 *${page + 1}/${pages}* · ${total} resultados${state.enviados?.size ? ` · ✅ ${state.enviados.size} já` : ''}\n` +
    `> Toca em *ESCOLHER* ▾ ou responde *1–${n}*` +
    (pages > 1 ? `\n> *mais* = próxima página` : '');

  state.ts = Date.now();
  state.page = page;
  _pendentes.set(_key(ctx), state);

  try {
    const { generateWAMessageFromContent, proto } = require('@systemzero/baileys');
    const rows = [];
    for (let i = 0; i < n; i++) {
      const partes = String(sliceLinhas[i]).split('\n');
      const globalIdx = start + i;
      const ja = state.enviados?.has(globalIdx);
      rows.push({
        title: `${ja ? '✅ ' : ''}${limpaSafe(partes[0]).slice(0, 22) || `Opção ${i + 1}`}${ja ? ' · já' : ''}`,
        id: ja ? `LISTA_SENT_${i+1}` : `LISTANUM_${i + 1}`,
        description: limpaSafe(partes.slice(1).join(' ')).slice(0, 70) || (ja ? 'Já enviado — escolhe outro' : ''),
      });
    }
    if (pages > 1 && page + 1 < pages) {
      rows.push({ title: '▶️ Mais resultados', id: 'LISTANAV_NEXT', description: `Página ${page + 2}/${pages}` });
    }
    if (pages > 1 && page > 0) {
      rows.push({ title: '◀️ Página anterior', id: 'LISTANAV_PREV', description: `Página ${page}/${pages}` });
    }

    const m = generateWAMessageFromContent(ctx.remoteJid, {
      interactiveMessage: proto.Message.InteractiveMessage.fromObject({
        body: { text: corpoCurto },
        footer: { text: `📋 ${state.tipo} · pág ${page + 1}/${pages} · ${total}${state.enviados?.size ? ` · ✅ ${state.enviados.size}` : ''}` },
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

async function mostrar(sock, msg, ctx, { titulo, intro = '', linhas = [], itens = [], tipo = 'lista', aoEscolher, dica = '', pageSize } = {}) {
  _limpar();
  const total = Math.min(linhas.length, itens.length);
  if (!total || typeof aoEscolher !== 'function') throw new Error('lista vazia');
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
    enviados: new Set(),
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

async function tentarNumero(sock, msg, ctx, text) {
  _limpar();
  const raw = String(text || '').trim();

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
    const pinTs = require('./pinAlbum')._pendentes?.get(key)?.ts || 0;
    if (pinTs > p.ts) return false;
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
  if (p.enviados?.has(globalIdx)) {
    await sock.sendMessage(ctx.remoteJid, {
      text: `⚠️ *Já enviei o nº ${globalIdx+1}* — não repito.\n> Escolhe outro, *mais*, ou *sair*.\n> ✅ Já: ${[...p.enviados].map(i=>i+1).join(', ')}`,
    }, { quoted: msg }).catch(() => {});
    return true;
  }
  const item = p.itens[globalIdx];
  try {
    await sock.sendMessage(ctx.remoteJid, { react: { text: '⏳', key: msg.key } }).catch(() => {});
    await p.aoEscolher({ sock, msg, ctx, item, idx: globalIdx });
    if (!p.enviados) p.enviados = new Set();
    p.enviados.add(globalIdx);
    p.ts = Date.now();
    _pendentes.set(key, p);
    const { page, pages, total } = _pageSlice(p);
    const restantes = total - p.enviados.size;
    if (restantes > 0) {
      await sock.sendMessage(ctx.remoteJid, {
        text: `✅ Nº ${globalIdx+1} enviado e expirado ✅ (não repete).\n📌 ${total} itens, pág ${page+1}/${pages} · ✅ ${p.enviados.size} enviados · ${restantes} restantes\n> Escolhe outro número, *mais*, ou *sair* para fechar.`,
      }, { quoted: msg }).catch(() => {});
      await new Promise(r => setTimeout(r, 800));
      await _renderPage(sock, msg, ctx, p).catch(()=>{});
    } else {
      await sock.sendMessage(ctx.remoteJid, {
        text: `✅ Todos os ${total} itens enviados! Pesquisa encerrada.`,
      }, { quoted: msg }).catch(() => {});
      _pendentes.delete(key);
    }
  } catch (e) {
    await sock.sendMessage(ctx.remoteJid, { text: `❌ ${String(e?.message || e).slice(0, 120)}` }, { quoted: msg }).catch(() => {});
    // mantém viva mesmo com erro
    p.ts = Date.now();
    _pendentes.set(key, p);
  }
  return true;
}

async function tentarToken(sock, msg, ctx, text) {
  const t = String(text || '').trim();
  if (/^LISTANAV_NEXT$/i.test(t)) return _nav(sock, msg, ctx, 'next');
  if (/^LISTANAV_PREV$/i.test(t)) return _nav(sock, msg, ctx, 'prev');
  if (/^LISTA_SENT_/i.test(t)) {
    const key = _key(ctx);
    const p = _pendentes.get(key);
    if (p) {
      await sock.sendMessage(ctx.remoteJid, { text: `⚠️ Já enviado — escolhe outro. ✅ Já: ${[...p.enviados].map(i=>i+1).join(', ')}` }, { quoted: msg }).catch(() => {});
    }
    return true;
  }
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
