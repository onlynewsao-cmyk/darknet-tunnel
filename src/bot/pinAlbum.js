'use strict';
/**
 * DARK BOT v11.2.8 — PIN ALBUM PERSISTENTE
 * Módulo igual do pin de enviar várias fotos por álbum se aparecer na pesquisa
 * e se for uma foto a pesquisa continua viva pra poder escolher outra depois.
 *
 * - Álbum/galeria (erome, xhamster-photos gallery, tipo album/gallery) → envia VÁRIAS fotos (até maxAlbum)
 * - Foto única (sex.com API REAL imagex1.sx.cdn.live, pornpics cdni, etc) → envia 1 e MANTÉM a pesquisa viva
 * - Comandos: número 1-10 escolhe, "mais"/"avança" próxima página, "volta" anterior, "sair"/"fechar" fecha
 *
 * Usa adultSources real-only (sem furry/animal) e respeita adultMode (grupo ON → grupo, senão PV)
 */

const GroupSettings = require('../database/models/GroupSettings');
const BotConfig = require('../database/models/BotConfig');
const mediaHandler = require('./mediaHandler');

const TTL = 5 * 60 * 1000; // 5 min para poder escolher várias
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

async function resolveAdultDest(sock, ctx) {
  try {
    if (ctx?.isGroup && ctx.remoteJid) {
      const gs = await GroupSettings.findOne({ groupJid: ctx.remoteJid }).lean().catch(() => null);
      if (gs?.adultMode) return ctx.remoteJid;
    }
  } catch {}
  return ctx.senderJid || (String(ctx.senderNumber || '').replace(/\D/g, '') + '@s.whatsapp.net');
}

async function sendAdultMediaPersist(sock, ctx, payload, quotedMsg) {
  const dest = await resolveAdultDest(sock, ctx);
  await sock.sendMessage(dest, payload, quotedMsg ? { quoted: quotedMsg } : {});
  if (ctx.isGroup && dest !== ctx.remoteJid) {
    await sock.sendMessage(ctx.remoteJid, {
      text: '📬 Conteúdo 18+ enviado no teu *PV* (pesquisa ainda viva aqui). Digita outro número ou *sair*.',
      mentions: [ctx.senderJid],
    }, { quoted: quotedMsg }).catch(() => {});
  }
  return dest;
}

function isAlbumItem(item = {}) {
  const t = String(item.type || '').toLowerCase();
  const src = String(item.source || '').toLowerCase();
  const url = String(item.url || '');
  if (t === 'album' || t === 'gallery') return true;
  if (src === 'erome' || src.includes('xhamster')) return true;
  if (/xhamster\.com\/photos\/gallery/i.test(url)) return true;
  if (/erome\.com\/a\//i.test(url)) return true;
  return false;
}

async function defaultResolver(item, maxAlbum = 8) {
  const adult = require('./adultSources');
  if (!item) throw new Error('item vazio');
  // Álbum → várias fotos
  if (isAlbumItem(item)) {
    try {
      const many = await adult.cosplayDownloadMany(item, maxAlbum);
      const arr = Array.isArray(many) ? many : [many];
      return arr.filter(m => m?.buf).map(m => ({
        buf: m.buf,
        type: m.type || 'photo',
        title: m.title || item.title || 'album',
        source: m.source || item.source || 'album',
        url: m.url || item.url,
      }));
    } catch (e) {
      // fallback single
      const one = await adult.cosplayDownload(item);
      const single = Array.isArray(one) ? one[0] : one;
      if (!single?.buf) throw e;
      return [{ buf: single.buf, type: single.type || 'photo', title: single.title || item.title, source: single.source || item.source, url: single.url || item.url }];
    }
  }
  // Foto única sex.com REAL
  if (item.source === 'sex.com' || /imagex1\.sx\.cdn\.live|pinporn/i.test(item.url || '')) {
    const m = await adult.sexcomResolve(item);
    return [{ buf: m.buf, type: m.type || 'photo', title: m.title || item.title, source: m.source, url: m.url }];
  }
  if (item.source === 'pornpics' || /pornpics\.com/i.test(item.url || '')) {
    const m = await adult.pornpicsDownload(item);
    return [{ buf: m.buf, type: m.type || 'photo', title: m.title || item.title, source: m.source, url: m.url }];
  }
  if (item.source === 'xhamster-photos') {
    const arr = await adult.xhamsterPhotoDownload(item);
    return (Array.isArray(arr) ? arr : [arr]).map(m => ({ buf: m.buf, type: m.type || 'photo', title: m.title || item.title, source: m.source, url: m.url }));
  }
  // URL direta imagem
  if (/\.(jpe?g|png|webp)(\?|$)/i.test(item.url || '')) {
    const buf = await mediaHandler.fetchBuffer(item.url, 15000).catch(() => null);
    if (!buf) throw new Error('download falhou');
    return [{ buf, type: 'photo', title: item.title || 'foto', source: item.source || 'direct', url: item.url }];
  }
  // último recurso: tenta resolver genérico
  if (item.url) {
    const buf = await mediaHandler.fetchBuffer(item.url, 15000).catch(() => null);
    if (buf) return [{ buf, type: 'photo', title: item.title || 'foto', source: item.source || 'direct', url: item.url }];
  }
  throw new Error('não consegui baixar este item');
}

async function _renderPage(sock, msg, ctx, state) {
  const { page, pages, start, end, total, sliceItens, sliceLinhas } = _pageSlice(state);
  const n = sliceItens.length;
  if (!n) throw new Error('lista vazia');

  const numeradas = [];
  for (let i = 0; i < n; i++) {
    const it = sliceItens[i];
    const albumMark = isAlbumItem(it) ? '📚 ÁLBUM' : '📸 FOTO';
    numeradas.push(`*${i + 1}.* ${albumMark} — ${sliceLinhas[i]}`);
  }

  const pageInfo = pages > 1
    ? `\n📄 Página *${page + 1}/${pages}* · ${start + 1}–${end} de *${total}*`
    : `\n📋 *${total}* resultado${total === 1 ? '' : 's'}`;

  const nav = pages > 1 ? `\n> ▶️ *mais* / *avança* · ◀️ *volta*` : '';
  const persistInfo = state.manterVivo
    ? `\n> 📸 Foto = pesquisa continua viva | 📚 Álbum = envia várias | *sair* fecha`
    : `\n> Digite *sair* para fechar`;

  const texto =
    `${state.titulo}\n${state.intro ? state.intro + '\n' : ''}\n` +
    `${numeradas.join('\n')}${pageInfo}${nav}${persistInfo}\n\n` +
    `> Responde com o *número* (1–${n})${state.dica ? '\n' + state.dica : ''}`;

  const corpoCurto =
    `${state.titulo}\n${state.intro ? state.intro + '\n' : ''}` +
    `📄 *${page + 1}/${pages}* · ${total} resultados\n` +
    `> 📸 foto mantém viva | 📚 álbum envia várias\n` +
    `> Toca em *ESCOLHER* ▾ ou responde *1–${n}*` +
    (pages > 1 ? `\n> *mais* = próxima página` : '') +
    `\n> *sair* fecha`;

  state.ts = Date.now();
  state.page = page;
  _pendentes.set(_key(ctx), state);

  try {
    const { generateWAMessageFromContent, proto } = require('@systemzero/baileys');
    const rows = [];
    for (let i = 0; i < n; i++) {
      const partes = String(sliceLinhas[i]).split('\n');
      const it = sliceItens[i];
      const mark = isAlbumItem(it) ? '📚' : '📸';
      rows.push({
        title: `${mark} ${limpaSafe(partes[0]).slice(0, 22) || `Opção ${i + 1}`}`,
        id: `PINNUM_${i + 1}`,
        description: limpaSafe(partes.slice(1).join(' ')).slice(0, 68) || (isAlbumItem(it) ? 'Álbum — várias fotos' : 'Foto — pesquisa continua viva'),
      });
    }
    if (pages > 1 && page + 1 < pages) {
      rows.push({ title: '▶️ Mais resultados', id: 'PINNAV_NEXT', description: `Página ${page + 2}/${pages}` });
    }
    if (pages > 1 && page > 0) {
      rows.push({ title: '◀️ Página anterior', id: 'PINNAV_PREV', description: `Página ${page}/${pages}` });
    }
    rows.push({ title: '❌ Fechar pesquisa', id: 'PINNAV_CLOSE', description: 'Encerra a lista' });

    const m = generateWAMessageFromContent(ctx.remoteJid, {
      interactiveMessage: proto.Message.InteractiveMessage.fromObject({
        body: { text: corpoCurto },
        footer: { text: `📌 ${state.tipo} · pág ${page + 1}/${pages} · ${total} · viva 5min` },
        header: { title: '', hasMediaAttachment: false },
        nativeFlowMessage: {
          buttons: [{
            name: 'single_select',
            buttonParamsJson: JSON.stringify({
              title: limpaSafe(state.titulo).slice(0, 28) || 'ESCOLHER',
              sections: [{ title: limpaSafe(state.titulo).slice(0, 22) || 'Opções', rows }],
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

async function mostrar(sock, msg, ctx, { titulo, intro = '', linhas = [], itens = [], tipo = 'pin', dica = '', manterVivo = true, maxAlbum = 8, resolver = null } = {}) {
  _limpar();
  const total = Math.min(linhas.length, itens.length);
  if (!total || (typeof resolver !== 'function' && !itens[0]?.url)) throw new Error('lista vazia ou sem resolver');
  const state = {
    itens: itens.slice(0, total),
    linhas: linhas.slice(0, total),
    ts: Date.now(),
    tipo,
    titulo,
    intro,
    dica,
    page: 0,
    manterVivo: !!manterVivo,
    maxAlbum: Math.min(Math.max(Number(maxAlbum) || 8, 1), 20),
    resolver: resolver || defaultResolver,
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
      await sock.sendMessage(ctx.remoteJid, { text: '📄 Última página já.' }, { quoted: msg }).catch(() => {});
      return true;
    }
    p.page += 1;
  } else if (dir === 'prev') {
    if (p.page <= 0) {
      await sock.sendMessage(ctx.remoteJid, { text: '📄 Primeira página já.' }, { quoted: msg }).catch(() => {});
      return true;
    }
    p.page -= 1;
  } else if (dir === 'close') {
    _pendentes.delete(key);
    await sock.sendMessage(ctx.remoteJid, { text: '✅ Pesquisa fechada.' }, { quoted: msg }).catch(() => {});
    return true;
  } else return false;
  await _renderPage(sock, msg, ctx, p);
  return true;
}

async function tentarNumero(sock, msg, ctx, text) {
  _limpar();
  const raw = String(text || '').trim();

  if (/^(sair|fechar|fecha|cancelar|stop|exit|close)$/i.test(raw)) {
    const key = _key(ctx);
    if (_pendentes.has(key)) {
      _pendentes.delete(key);
      await sock.sendMessage(ctx.remoteJid, { text: '✅ Pesquisa fechada. Use o comando de novo para nova busca.' }, { quoted: msg }).catch(() => {});
      return true;
    }
    return false;
  }

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

  // Evita conflito se música card for mais novo
  try {
    const somTs = require('./musicaCard')._pendentes?.get(key)?.ts || 0;
    if (somTs > p.ts) return false;
  } catch {}

  const { start, sliceItens } = _pageSlice(p);
  const localIdx = parseInt(m[1], 10) - 1;
  if (localIdx < 0 || localIdx >= sliceItens.length) {
    await sock.sendMessage(ctx.remoteJid, {
      text: `❌ Escolhe 1–${sliceItens.length} desta página.`,
    }, { quoted: msg }).catch(() => {});
    return true;
  }
  const globalIdx = start + localIdx;
  const item = p.itens[globalIdx];

  try {
    await sock.sendMessage(ctx.remoteJid, { react: { text: '⏳', key: msg.key } }).catch(() => {});

    const medias = await p.resolver(item, p.maxAlbum);
    const arr = Array.isArray(medias) ? medias : [medias];
    let sent = 0;
    const isAlbum = arr.length > 1 || isAlbumItem(item);

    for (const med of arr) {
      if (!med?.buf) continue;
      const cap = sent === 0
        ? `${isAlbum ? '📚 *ÁLBUM*' : '📸 *FOTO*'} — *${String(med.title || item.title || '').slice(0, 60)}*\n📡 ${med.source || item.source || ''}${isAlbum ? ` · ${arr.length} fotos` : ' · pesquisa viva'}`
        : `📡 ${med.source || ''}`;
      if (med.type === 'video') {
        await sendAdultMediaPersist(sock, ctx, { video: med.buf, mimetype: 'video/mp4', caption: cap }, msg);
      } else if (med.type === 'gif' && med.buf.slice(0, 3).toString() === 'GIF') {
        await sendAdultMediaPersist(sock, ctx, { video: med.buf, gifPlayback: true, caption: cap }, msg).catch(async () => {
          await sendAdultMediaPersist(sock, ctx, { image: med.buf, caption: cap }, msg);
        });
      } else {
        await sendAdultMediaPersist(sock, ctx, { image: med.buf, caption: cap }, msg);
      }
      sent++;
      await new Promise(r => setTimeout(r, isAlbum ? 500 : 300));
    }
    if (!sent) throw new Error('download vazio');

    if (p.manterVivo) {
      // Mantém viva — atualiza timestamp e re-renderiza dica
      p.ts = Date.now();
      _pendentes.set(key, p);
      const { page, pages, total } = _pageSlice(p);
      await sock.sendMessage(ctx.remoteJid, {
        text: `✅ *${sent} ${isAlbum ? 'fotos do álbum' : 'foto'} enviada${sent > 1 ? 's' : ''}*!\n📌 Pesquisa ainda viva — *${total}* itens, pág ${page + 1}/${pages}\n> Escolhe outro número (1–10), *mais* para próxima, ou *sair* para fechar.`,
      }, { quoted: msg }).catch(() => {});
    } else {
      _pendentes.delete(key);
    }
  } catch (e) {
    await sock.sendMessage(ctx.remoteJid, { text: `❌ ${String(e?.message || e).slice(0, 150)}` }, { quoted: msg }).catch(() => {});
    // Em caso de erro, mantém viva se configurado
    if (p.manterVivo) {
      p.ts = Date.now();
      _pendentes.set(key, p);
    } else {
      _pendentes.delete(key);
    }
  }
  return true;
}

async function tentarToken(sock, msg, ctx, text) {
  const t = String(text || '').trim();
  if (/^PINNAV_NEXT$/i.test(t)) return _nav(sock, msg, ctx, 'next');
  if (/^PINNAV_PREV$/i.test(t)) return _nav(sock, msg, ctx, 'prev');
  if (/^PINNAV_CLOSE$/i.test(t)) return _nav(sock, msg, ctx, 'close');
  const m = t.match(/^PINNUM_(10|[1-9])$/i);
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
  isAlbumItem,
  defaultResolver,
  resolveAdultDest,
  sendAdultMediaPersist,
};
