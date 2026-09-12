/**
 * DARK BOT — MUSICA CARD (v7.21)
 * ═══════════════════════════════════════════════════════════
 * Comando "descartável" tipo play: busca a música, mostra a CAPA
 * (imagem da capa) + os metadados, e o utilizador responde com um
 * NÚMERO para escolher o formato:
 *
 *   01 → baixar áudio (MP3)
 *   02 → baixar documento (.mp3)
 *   03 → baixar voz (nota de voz PTT / opus)
 *
 * O estado é "descartável": fica em memória 15 min (sobrevive a um
 * reinício do processo? não — é propositadamente leve e descartável).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const mediaHandler = require('./mediaHandler');

let _szp = null;
const systemZeroPlay = new Proxy({}, { get: (_, k) => (_szp ||= require('./systemZeroPlay'))[k] });

// pendente: `${remoteJid}::${senderNumber}` → { video, ts }
const _pendentes = new Map();
const TTL = 15 * 60 * 1000;

function _key(ctx) {
  return `${ctx?.remoteJid || ''}::${ctx?.senderNumber || ''}`;
}

function _limpar() {
  const agora = Date.now();
  for (const [k, v] of _pendentes) if (agora - v.ts > TTL) _pendentes.delete(k);
}

// ── ffmpeg (para converter MP3 → opus na nota de voz) ─────────
let _ffmpeg = null;
function _ffmpegBin() {
  if (_ffmpeg) return _ffmpeg;
  try { _ffmpeg = require('ffmpeg-static'); if (_ffmpeg) return _ffmpeg; } catch {}
  for (const p of ['/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg', 'ffmpeg']) {
    try {
      const r = spawnSync(p, ['-version'], { timeout: 3000, stdio: 'pipe' });
      if (r.status === 0) { _ffmpeg = p; return p; }
    } catch {}
  }
  _ffmpeg = 'ffmpeg';
  return _ffmpeg;
}

/** MP3 → opus (16 kHz mono) para nota de voz. */
function _paraOpus(buffer) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'darkbot-opus-'));
  const inP = path.join(tmp, 'in.mp3');
  const outP = path.join(tmp, 'out.ogg');
  try {
    fs.writeFileSync(inP, buffer);
    const r = spawnSync(_ffmpegBin(), [
      '-y', '-i', inP, '-c:a', 'libopus', '-b:a', '64k', '-ar', '16000', '-ac', '1', outP,
    ], { timeout: 90000, stdio: 'pipe' });
    if (!fs.existsSync(outP) || fs.statSync(outP).size < 512) {
      throw new Error('opus falhou: ' + (r.stderr?.toString().slice(-80) || ''));
    }
    return fs.readFileSync(outP);
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  }
}

// ── busca ─────────────────────────────────────────────────────

/**
 * Busca a 1.ª música. yt-search local primeiro (dá `ago`/canal/views/
 * duração — os campos do cartão), SystemZone como fallback.
 */
async function buscar(query) {
  try {
    const yts = require('yt-search');
    const r = await yts(query);
    const v = (r.videos || []).find(x => x.seconds > 10 && x.seconds <= 3600) || (r.videos || [])[0];
    if (v) {
      return {
        title: v.title,
        youtube_url: v.url || `https://www.youtube.com/watch?v=${v.videoId}`,
        thumbnail: v.thumbnail || v.image || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
        author: v.author?.name || v.author || '',
        views: v.views || 0,
        duration: v.duration?.timestamp || v.timestamp || '',
        ago: v.ago || '',
      };
    }
  } catch { /* fallback abaixo */ }

  const searchData = await systemZeroPlay.ytsearch(query);
  const v = searchData?.resultados?.[0];
  if (!v) throw new Error('Nenhum resultado encontrado.');
  return {
    title: v.title,
    youtube_url: v.youtube_url || v.url,
    thumbnail: v.thumbnail || v.image,
    author: v.author || v.channel || '',
    views: v.views || 0,
    duration: v.duration?.timestamp || v.timestamp || v.duration || '',
    ago: v.ago || v.published || '',
  };
}

/**
 * Legenda do cartão (o layout que o Dono pediu).
 * Os rótulos vêm do fancyText.ROTULOS — para mudar só a "fonte"
 * (letras/símbolos/emojis), edita src/bot/fancyText.js.
 */
function legenda(v) {
  const R = require('./fancyText').ROTULOS;
  const views = Number(v.views || 0).toLocaleString('en-US');
  const linhas = [
    `☘️ *${R.titulo}* : _${v.title || '—'}_`,
  ];
  if (v.duration) linhas.push(`▫️*⏱️ ${R.duracao}* ➟ _${v.duration}_`);
  if (views !== '0') linhas.push(`▫️*👀 ${R.views}* ➟ _${views}_`);
  if (v.ago) linhas.push(`▫️*📅 ${R.publicado}* ➟ _${v.ago}_`);
  if (v.author) linhas.push(`▫️*🎤 ${R.canal}* ➟ _${v.author}_`);

  linhas.push(
    '',
    `*☱ 🔢 ${R.replyNum} ☱*`,
    '',
    `*01 ❯❯ ${R.downAudio}🎧*`,
    `*02 ❯❯ ${R.downDoc}📁*`,
    `*03 ❯❯ ${R.downVoice}🎤*`,
  );
  return linhas.join('\n');
}

/** Envia o cartão (capa + legenda) e guarda o pendente. */
async function mostrar(sock, msg, ctx, v) {
  _limpar();
  _pendentes.set(_key(ctx), { video: v, ts: Date.now() });

  let thumbBuf = null;
  try {
    if (v.thumbnail) {
      const buf = await mediaHandler.fetchBuffer(v.thumbnail);
      if (buf && buf.length > 200) thumbBuf = buf;
    }
  } catch {}

  const caption = legenda(v);
  if (thumbBuf) {
    return sock.sendMessage(ctx.remoteJid, { image: thumbBuf, caption }, { quoted: msg });
  }
  if (v.thumbnail) {
    try {
      return await sock.sendMessage(ctx.remoteJid, { image: { url: v.thumbnail }, caption }, { quoted: msg });
    } catch {}
  }
  return sock.sendMessage(ctx.remoteJid, { text: caption }, { quoted: msg });
}

// ── download ──────────────────────────────────────────────────

async function _baixarAudio(v) {
  // 1º — SystemZone (rápido, devolve URL)
  try {
    const r = await systemZeroPlay.ytAudio(v.youtube_url);
    if (r?.buffer && r.buffer.length > 1024) return { buffer: r.buffer, title: r.title || v.title };
    if (r?.url) {
      const buf = await mediaHandler.fetchBuffer(r.url);
      if (buf && buf.length > 1024) return { buffer: buf, title: r.title || v.title };
    }
  } catch { /* segue para ytdl */ }

  // 2º — ytdl (escada completa: yt-dlp → ytdl-core → youtubei → loader → SZ)
  const ytdl = require('./ytdl');
  const r = await ytdl.getAudio(v.youtube_url, '128k');
  return { buffer: r.buffer, title: r.title || v.title, thumb: r.thumb };
}

function _nomeFicheiro(titulo) {
  return `${String(titulo || 'audio').replace(/[/\\?%*:|"<>]/g, '-').slice(0, 60)}.mp3`;
}

/**
 * Processa a resposta por número (01/02/03). Devolve true se tratou.
 */
async function tentarNumero(sock, msg, ctx, text) {
  _limpar();
  const m = String(text || '').trim().match(/^0?([1-3])(?:\s.*)?$/);
  if (!m) return false;

  const pendente = _pendentes.get(_key(ctx));
  if (!pendente) return false;      // não há cartão à espera → não é nosso

  const opcao = parseInt(m[1], 10);
  const v = pendente.video;
  _pendentes.delete(_key(ctx));     // descarta depois de usar (descartável)

  try {
    await sock.sendMessage(ctx.remoteJid, { react: { text: '⏳', key: msg.key } }).catch(() => {});

    const { buffer, title } = await _baixarAudio(v);
    if (!buffer || buffer.length < 1024) throw new Error('áudio vazio');

    if (opcao === 1) {
      await sock.sendMessage(ctx.remoteJid, {
        audio: buffer, mimetype: 'audio/mpeg', fileName: _nomeFicheiro(title), ptt: false,
      }, { quoted: msg });
      await sock.sendMessage(ctx.remoteJid, { react: { text: '🎧', key: msg.key } }).catch(() => {});
      return true;
    }

    if (opcao === 2) {
      await sock.sendMessage(ctx.remoteJid, {
        document: buffer, fileName: _nomeFicheiro(title), mimetype: 'audio/mpeg',
        caption: `📁 ${title}`,
      }, { quoted: msg });
      await sock.sendMessage(ctx.remoteJid, { react: { text: '📁', key: msg.key } }).catch(() => {});
      return true;
    }

    // opcao 3 — nota de voz (opus)
    let opus;
    try { opus = _paraOpus(buffer); } catch { /* sem ffmpeg → manda o mp3 como PTT */ }
    if (opus && opus.length > 500) {
      await sock.sendMessage(ctx.remoteJid, {
        audio: opus, mimetype: 'audio/ogg; codecs=opus', ptt: true,
      }, { quoted: msg });
    } else {
      await sock.sendMessage(ctx.remoteJid, {
        audio: buffer, mimetype: 'audio/mpeg', ptt: true,
      }, { quoted: msg });
    }
    await sock.sendMessage(ctx.remoteJid, { react: { text: '🎤', key: msg.key } }).catch(() => {});
    return true;
  } catch (e) {
    await sock.sendMessage(ctx.remoteJid, { react: { text: '❌', key: msg.key } }).catch(() => {});
    await sock.sendMessage(ctx.remoteJid, {
      text: `❌ Não consegui baixar: ${String(e?.message || e).slice(0, 120)}`,
    }, { quoted: msg });
    return true;   // tratámos (com erro) — não deixa cair para outro lado
  }
}

module.exports = { buscar, legenda, mostrar, tentarNumero, _pendentes };
