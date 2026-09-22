'use strict';
/**
 * DARK BOT v11.2.9 — PIN ALBUM PERSISTENTE + GIF FIX + ANTI-DUPLICADO + SHORTS
 * - Álbum/galeria → envia VÁRIAS fotos (até maxAlbum)
 * - Foto única → envia 1 e MANTÉM viva 5min
 * - GIF fix: webp animado / gif → converte para MP4 e envia com gifPlayback:true para reproduzir
 * - Anti-duplicado: rastreia enviados, não reenvia mesmo nº, mostra ✅ já enviados
 * - Comandos: número 1-10, mais/avança, volta, sair/fechar
 */

const GroupSettings = require('../database/models/GroupSettings');
const BotConfig = require('../database/models/BotConfig');
const mediaHandler = require('./mediaHandler');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

const TTL = 5 * 60 * 1000;
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

function isGifItem(item = {}, med = {}) {
  const t = String(item.type || med.type || '').toLowerCase();
  const src = String(item.source || med.source || '').toLowerCase();
  const url = String(item.url || med.url || '');
  if (t === 'gif' || t === 'short' || t === 'shorts') return true;
  if (/\.gif(\?|$)/i.test(url)) return true;
  if (/\.webp(\?|$)/i.test(url) && (t === 'gif' || /sex\.com|gifs/i.test(url + src))) return true;
  if (/imagex1.*\.webp/i.test(url)) return true; // sex.com gifs are webp
  return false;
}

function getFfmpegBin() {
  try { return require('ffmpeg-static') || 'ffmpeg'; } catch { return 'ffmpeg'; }
}

function detectKind(buf) {
  if (!buf || buf.length < 12) return 'unknown';
  const head = buf.slice(0,12);
  if (head.slice(0,3).toString() === 'GIF') return 'gif';
  if (head.slice(0,4).toString() === 'RIFF' && head.slice(8,12).toString() === 'WEBP') return 'webp';
  if (buf.slice(4,8).toString() === 'ftyp') return 'mp4';
  return 'unknown';
}

async function convertToMp4ForGif(buffer, kind = 'gif') {
  if (!buffer || buffer.length < 100) throw new Error('buffer vazio');
  if (buffer.length > 12 && buffer.slice(4,8).toString() === 'ftyp') return buffer;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dark-gif-'));
  try {
    // 1) Se for WEBP animado (sex.com GIFs são webp), converte para GIF via sharp primeiro
    let inputBuf = buffer;
    let inputExt = kind === 'webp' ? 'webp' : kind === 'gif' ? 'gif' : 'bin';
    const detected = detectKind(buffer);
    if (detected === 'webp' || kind === 'webp') {
      try {
        const sharp = require('sharp');
        // sharp animated webp -> gif
        const gifBuf = await sharp(buffer, { animated: true }).gif().toBuffer();
        if (gifBuf && gifBuf.length > 500) {
          inputBuf = gifBuf;
          inputExt = 'gif';
        }
      } catch (e) {
        // sharp falhou, tenta ffmpeg direto com webp
        console.warn('[GIF] sharp webp->gif falhou:', e.message?.slice(0,80));
      }
    }

    const inputPath = path.join(tmpDir, `input.${inputExt}`);
    const outputPath = path.join(tmpDir, 'output.mp4');
    fs.writeFileSync(inputPath, inputBuf);
    await execFileAsync(getFfmpegBin(), [
      '-y',
      '-i', inputPath,
      '-vf', "scale='min(480,iw)':-2:flags=lanczos,format=yuv420p",
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '26',
      '-an',
      '-movflags', '+faststart',
      '-t', '15',
      outputPath,
    ], { stdio: 'ignore', timeout: 60000 });
    const out = fs.readFileSync(outputPath);
    if (!out || out.length < 1000) throw new Error('ffmpeg não gerou mp4');
    return out;
  } catch (e) {
    // último fallback: se já é gif/webp, tenta retornar como está para tentar enviar como gifPlayback direto
    if (kind === 'gif' || kind === 'webp' || detectKind(buffer) !== 'unknown') {
      // tenta converter gif direto sem sharp se falhou antes
      try {
        const inputPath = path.join(tmpDir, 'input2.gif');
        const outputPath = path.join(tmpDir, 'output2.mp4');
        fs.writeFileSync(inputPath, buffer);
        await execFileAsync(getFfmpegBin(), [
          '-y','-i', inputPath,
          '-vf', "scale='min(480,iw)':-2:flags=lanczos,format=yuv420p",
          '-c:v','libx264','-preset','veryfast','-crf','28','-an','-movflags','+faststart',
          outputPath,
        ], { stdio: 'ignore', timeout: 60000 });
        const out2 = fs.readFileSync(outputPath);
        if (out2?.length > 1000) return out2;
      } catch {}
    }
    throw e;
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

async function defaultResolver(item, maxAlbum = 8) {
  const adult = require('./adultSources');
  if (!item) throw new Error('item vazio');
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
      const one = await adult.cosplayDownload(item);
      const single = Array.isArray(one) ? one[0] : one;
      if (!single?.buf) throw e;
      return [{ buf: single.buf, type: single.type || 'photo', title: single.title || item.title, source: single.source || item.source, url: single.url || item.url }];
    }
  }
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
  if (/\.(jpe?g|png|webp)(\?|$)/i.test(item.url || '')) {
    const buf = await mediaHandler.fetchBuffer(item.url, 15000).catch(() => null);
    if (!buf) throw new Error('download falhou');
    return [{ buf, type: 'photo', title: item.title || 'foto', source: item.source || 'direct', url: item.url }];
  }
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
    const globalIdx = start + i;
    const jaEnviado = state.enviados?.has(globalIdx);
    const albumMark = isAlbumItem(it) ? '📚 ÁLBUM' : isGifItem(it) ? '🎞️ GIF' : (it.type === 'video' || it.type === 'shorts' ? '🎬 VÍDEO' : '📸 FOTO');
    const check = jaEnviado ? '✅ ' : '';
    numeradas.push(`*${i + 1}.* ${check}${albumMark} — ${sliceLinhas[i]}${jaEnviado ? ' · já enviado' : ''}`);
  }

  const pageInfo = pages > 1
    ? `\n📄 Página *${page + 1}/${pages}* · ${start + 1}–${end} de *${total}*`
    : `\n📋 *${total}* resultado${total === 1 ? '' : 's'}`;
  const nav = pages > 1 ? `\n> ▶️ *mais* / *avança* · ◀️ *volta*` : '';
  const enviadosInfo = state.enviados?.size ? `\n> ✅ Já enviados: ${[...state.enviados].map(i=>i+1).join(', ')}` : '';
  const persistInfo = state.manterVivo
    ? `\n> 📸 Foto = viva | 📚 Álbum = várias | 🎞️ GIF reproduz | *sair* fecha${enviadosInfo}`
    : `\n> Digite *sair* para fechar${enviadosInfo}`;

  const texto =
    `${state.titulo}\n${state.intro ? state.intro + '\n' : ''}\n` +
    `${numeradas.join('\n')}${pageInfo}${nav}${persistInfo}\n\n` +
    `> Responde com o *número* (1–${n})${state.dica ? '\n' + state.dica : ''}`;

  const corpoCurto =
    `${state.titulo}\n${state.intro ? state.intro + '\n' : ''}` +
    `📄 *${page + 1}/${pages}* · ${total} resultados${state.enviados?.size ? ` · ✅ ${state.enviados.size} já` : ''}\n` +
    `> 📸 foto viva | 📚 álbum várias | 🎞️ GIF reproduz\n` +
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
      const globalIdx = start + i;
      const ja = state.enviados?.has(globalIdx);
      const mark = isAlbumItem(it) ? '📚' : isGifItem(it) ? '🎞️' : (it.type === 'video' || it.type === 'shorts' ? '🎬' : '📸');
      rows.push({
        title: `${ja ? '✅ ' : ''}${mark} ${limpaSafe(partes[0]).slice(0, 20) || `Opção ${i + 1}`}${ja ? ' · já' : ''}`,
        id: ja ? `PIN_SENT_${i+1}` : `PINNUM_${i + 1}`,
        description: limpaSafe(partes.slice(1).join(' ')).slice(0, 66) || (ja ? 'Já enviado — escolhe outro' : (isAlbumItem(it) ? 'Álbum — várias fotos' : isGifItem(it) ? 'GIF — reproduz' : 'Foto — pesquisa viva')),
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
        footer: { text: `📌 ${state.tipo} · pág ${page + 1}/${pages} · ${total} · viva 5min${state.enviados?.size ? ` · ${state.enviados.size} enviados` : ''}` },
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

  // ANTI-DUPLICADO: já enviado?
  if (p.enviados?.has(globalIdx)) {
    await sock.sendMessage(ctx.remoteJid, {
      text: `⚠️ *Já enviei o nº ${globalIdx + 1}* antes — não vou repetir.\n> Escolhe outro número (1–${sliceItens.length}), *mais* para próxima, ou *sair* para fechar.\n> ✅ Já enviados: ${[...p.enviados].map(i=>i+1).join(', ')}`,
    }, { quoted: msg }).catch(() => {});
    return true;
  }

  const item = p.itens[globalIdx];

  try {
    await sock.sendMessage(ctx.remoteJid, { react: { text: '⏳', key: msg.key } }).catch(() => {});

    const medias = await p.resolver(item, p.maxAlbum);
    const arr = Array.isArray(medias) ? medias : [medias];
    let sent = 0;
    const isAlbum = arr.length > 1 || isAlbumItem(item);
    const isGif = arr.some(m => m?.type === 'gif' || isGifItem(item, m));

    for (const med of arr) {
      if (!med?.buf) continue;
      const kind = detectKind(med.buf);
      const cap = sent === 0
        ? `${isAlbum ? '📚 *ÁLBUM*' : isGif ? '🎞️ *GIF*' : '📸 *FOTO*'} — *${String(med.title || item.title || '').slice(0, 60)}*\n📡 ${med.source || item.source || ''}${isAlbum ? ` · ${arr.length} fotos` : isGif ? ' · reproduz' : ' · viva' }`
        : `📡 ${med.source || ''}`;

      // GIF FIX: se for gif/webp animado → converte para mp4 e envia com gifPlayback
      if (med.type === 'gif' || isGifItem(item, med) || kind === 'gif' || kind === 'webp') {
        try {
          let mp4 = med.buf;
          if (kind === 'gif' || kind === 'webp') {
            mp4 = await convertToMp4ForGif(med.buf, kind).catch(() => med.buf);
          }
          const mp4Kind = detectKind(mp4);
          if (mp4Kind === 'mp4' || kind === 'gif' || kind === 'webp') {
            await sendAdultMediaPersist(sock, ctx, { video: mp4, mimetype: 'video/mp4', gifPlayback: true, caption: cap }, msg);
            sent++;
            await new Promise(r => setTimeout(r, 600));
            continue;
          }
        } catch {}
        // fallback: tenta como video gifPlayback direto
        try {
          await sendAdultMediaPersist(sock, ctx, { video: med.buf, gifPlayback: true, caption: cap }, msg);
          sent++;
          await new Promise(r => setTimeout(r, 600));
          continue;
        } catch {}
      }

      if (med.type === 'video' || med.type === 'shorts' || med.type === 'short') {
        await sendAdultMediaPersist(sock, ctx, { video: med.buf, mimetype: 'video/mp4', caption: cap }, msg);
      } else if (med.type === 'gif') {
        // último fallback gif
        try {
          await sendAdultMediaPersist(sock, ctx, { video: med.buf, mimetype: 'video/mp4', gifPlayback: true, caption: cap }, msg);
        } catch {
          await sendAdultMediaPersist(sock, ctx, { image: med.buf, caption: cap }, msg);
        }
      } else {
        await sendAdultMediaPersist(sock, ctx, { image: med.buf, caption: cap }, msg);
      }
      sent++;
      await new Promise(r => setTimeout(r, isAlbum ? 500 : 300));
    }
    if (!sent) throw new Error('download vazio');

    // marca como enviado - expira
    if (!p.enviados) p.enviados = new Set();
    p.enviados.add(globalIdx);

    if (p.manterVivo) {
      p.ts = Date.now();
      _pendentes.set(key, p);
      const { page, pages, total } = _pageSlice(p);
      const restantes = total - p.enviados.size;
      await sock.sendMessage(ctx.remoteJid, {
        text: `✅ *${sent} ${isAlbum ? 'fotos do álbum' : isGif ? 'GIF' : 'foto'} enviada${sent > 1 ? 's' : ''}*! (nº ${globalIdx+1} expira ✅, não repete)\n📌 Viva — *${total}* itens, pág ${page+1}/${pages} · ✅ ${p.enviados.size} enviados · ${restantes} restantes\n> Escolhe outro número (1–10), *mais* para próxima, ou *sair* para fechar.`,
      }, { quoted: msg }).catch(() => {});
      // re-renderiza lista com ✅
      if (restantes > 0) {
        await new Promise(r => setTimeout(r, 800));
        await _renderPage(sock, msg, ctx, p).catch(()=>{});
      } else {
        await sock.sendMessage(ctx.remoteJid, { text: `✅ Todos os ${total} itens enviados! Pesquisa encerrada.` }, { quoted: msg }).catch(()=>{});
        _pendentes.delete(key);
      }
    } else {
      _pendentes.delete(key);
    }
  } catch (e) {
    await sock.sendMessage(ctx.remoteJid, { text: `❌ ${String(e?.message || e).slice(0, 150)}` }, { quoted: msg }).catch(() => {});
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
  if (/^PIN_SENT_/i.test(t)) {
    const key = _key(ctx);
    const p = _pendentes.get(key);
    if (p) {
      await sock.sendMessage(ctx.remoteJid, { text: `⚠️ Esse item já foi enviado — escolhe outro número, *mais*, ou *sair*.\n✅ Já: ${[...p.enviados].map(i=>i+1).join(', ')}` }, { quoted: msg }).catch(() => {});
    }
    return true;
  }
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
  isGifItem,
  defaultResolver,
  resolveAdultDest,
  sendAdultMediaPersist,
  convertToMp4ForGif,
};
