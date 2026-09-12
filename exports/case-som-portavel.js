/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  CASE 'som' — CARTÃO DE MÚSICA (código COMPLETO e portável)  ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 *  O QUE FAZ
 *  ─────────
 *    !som <música>  →  busca a música, mostra a CAPA (imagem) com
 *    título, duração, views, publicado e canal — e espera a pessoa
 *    responder com um NÚMERO:
 *
 *      01 ❯❯ download audio   🎧   (MP3)
 *      02 ❯❯ download document📁   (.mp3 como ficheiro)
 *      03 ❯❯ download voice   🎤   (nota de voz PTT / opus)
 *
 *  COMO USAR NOUTRO BOT (Baileys)
 *  ──────────────────────────────
 *    Padrão A — com registerCase (como este bot):
 *      registerCase(['som', 'song'], som);
 *
 *    Padrão B — directo no teu handler:
 *      if (texto.startsWith(prefixo + 'som')) {
 *        const { som } = require('./case-som-portavel.js');
 *        await som({ sock, msg, ctx, text: resto, prefix: prefixo, reply: (t) => sock.sendMessage(ctx.remoteJid, { text: t }, { quoted: msg }) });
 *        return;
 *      }
 *
 *    E para as respostas por número, chama cedo no teu handler:
 *      const { tentarNumero } = require('./case-som-portavel.js');
 *      if (/^0?[1-3](?:\s|$)/.test(texto)) {
 *        if (await tentarNumero(sock, msg, ctx, texto)) return;
 *      }
 *
 *  O QUE ADAPTAR (tudo marcado com "ADAPTE AQUI")
 *  ────────────────────────────────────────────────
 *    1. FONTE     — as letras/símbolos/emojis do cartão (estilizar + tabelas)
 *    2. DOWNLOAD  — o teu downloader (o default usa @distube/ytdl-core)
 *    3. CONFIG    — prefixo, TTL, duração máxima
 *
 *  DEPENDÊNCIAS (npm)
 *  ─────────────────
 *    yt-search        — busca (sem API key)
 *    @distube/ytdl-core — download (default; troca por outro se quiseres)
 *    ffmpeg-static    — converter para MP3/opus (opcional: sem ele manda o cru)
 */
'use strict';

// ══════════════════════════════════════════════════════════════
// 1. CONFIGURAÇÃO — ADAPTE AQUI
// ══════════════════════════════════════════════════════════════
const CFG = {
  prefixo: '!',        // prefixo do comando
  ttlMin: 15,          // minutos que a resposta por número fica válida
  limiteMin: 60,       // duração máxima da música (minutos)
};

// ══════════════════════════════════════════════════════════════
// 2. FONTE — ADAPTE AQUI (letras, símbolos, signos, emojis)
//    Muda as tabelas/code points e o cartão muda de estilo sozinho.
// ══════════════════════════════════════════════════════════════
const PEQUENAS = {
  a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ꜰ', g: 'ɢ', h: 'ʜ',
  i: 'ɪ', j: 'ᴊ', k: 'ᴋ', l: 'ʟ', m: 'ᴍ', n: 'ɴ', o: 'ᴏ', p: 'ᴘ',
  q: 'ǫ', r: 'ʀ', s: 'ꜱ', t: 'ᴛ', u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', x: 'x',
  y: 'ʏ', z: 'ᴢ',
};
const BASE_NEGRITO_MAI = 0x1D5D4; // 𝗔…𝗭
const BASE_NEGRITO_MIN = 0x1D5EE; // 𝗮…𝘇
const BASE_MONO_MAI    = 0x1D670; // 𝙰…𝚉
const BASE_MONO_MIN    = 0x1D68A; // 𝚊…𝚣

function estilizar(texto, estilo = 'cartao') {
  const t = String(texto || '');
  if (estilo === 'mono') {
    return t.replace(/[A-Za-z]/g, (c) => String.fromCodePoint((c === c.toUpperCase() ? BASE_MONO_MAI : BASE_MONO_MIN) + c.toUpperCase().charCodeAt(0) - 65));
  }
  if (estilo === 'negrito') {
    return t.replace(/[A-Za-z]/g, (c) => String.fromCodePoint((c === c.toUpperCase() ? BASE_NEGRITO_MAI : BASE_NEGRITO_MIN) + c.toUpperCase().charCodeAt(0) - 65));
  }
  if (estilo === 'pequenas') {
    return t.toLowerCase().replace(/[a-z]/g, (c) => PEQUENAS[c] || c);
  }
  // 'cartao' — 1.ª letra a negrito, resto em small caps
  return t.toLowerCase().split(' ').map((w) => {
    if (!w) return w;
    const bold = /[a-z]/.test(w[0])
      ? String.fromCodePoint(BASE_NEGRITO_MAI + w[0].toUpperCase().charCodeAt(0) - 65)
      : w[0];
    return bold + w.slice(1).replace(/[a-z]/g, (c) => PEQUENAS[c] || c);
  }).join(' ');
}

const ROTULOS = {
  titulo:    estilizar('title', 'pequenas'),
  duracao:   estilizar('duration', 'cartao'),
  views:     estilizar('views', 'cartao'),
  publicado: estilizar('published', 'cartao'),
  canal:     estilizar('channel', 'cartao'),
  replyNum:  estilizar('REPLY WITH NUMBER', 'mono'),
  downAudio: estilizar('download audio', 'pequenas'),
  downDoc:   estilizar('download document', 'pequenas'),
  downVoice: estilizar('download voice', 'pequenas'),
};

// ══════════════════════════════════════════════════════════════
// 3. DOWNLOAD — ADAPTE AQUI (o teu downloader)
//    Default: @distube/ytdl-core → MP3 (ffmpeg) ou cru se não houver.
//    Troca `baixarAudio` pelo downloader do teu bot, se já tiveres um.
// ══════════════════════════════════════════════════════════════
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

let _ffmpeg = null;
function ffmpegBin() {
  if (_ffmpeg) return _ffmpeg;
  try { _ffmpeg = require('ffmpeg-static'); if (_ffmpeg) return _ffmpeg; } catch {}
  for (const p of ['/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg', 'ffmpeg']) {
    try { const r = spawnSync(p, ['-version'], { timeout: 3000, stdio: 'pipe' }); if (r.status === 0) { _ffmpeg = p; return p; } } catch {}
  }
  return null;
}

/** Descarta um mp3 do stream (default portável). */
async function baixarAudio(url) {
  const ytdl = require('@distube/ytdl-core');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'som-'));
  const rawPath = path.join(tmp, 'a');
  const mp3Path = path.join(tmp, 'a.mp3');
  try {
    const chunks = [];
    await new Promise((resolve, reject) => {
      ytdl(url, { filter: 'audioonly', quality: 'highestaudio' })
        .on('data', (c) => chunks.push(c))
        .on('end', resolve)
        .on('error', reject);
    });
    if (!chunks.length) throw new Error('stream vazio');
    const raw = Buffer.concat(chunks);
    fs.writeFileSync(rawPath, raw);

    const ff = ffmpegBin();
    if (ff) {
      const r = spawnSync(ff, ['-y', '-i', rawPath, '-c:a', 'libmp3lame', '-b:a', '128k', mp3Path], { timeout: 120000, stdio: 'pipe' });
      if (fs.existsSync(mp3Path) && fs.statSync(mp3Path).size > 512) return { buffer: fs.readFileSync(mp3Path), mp3: true };
    }
    return { buffer: raw, mp3: false };
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  }
}

/** MP3 → opus 16 kHz mono (para a nota de voz). */
function paraOpus(buffer) {
  const ff = ffmpegBin();
  if (!ff) return null;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'som-opus-'));
  try {
    const inP = path.join(tmp, 'in.mp3');
    const outP = path.join(tmp, 'out.ogg');
    fs.writeFileSync(inP, buffer);
    const r = spawnSync(ff, ['-y', '-i', inP, '-c:a', 'libopus', '-b:a', '64k', '-ar', '16000', '-ac', '1', outP], { timeout: 90000, stdio: 'pipe' });
    if (!fs.existsSync(outP) || fs.statSync(outP).size < 512) return null;
    return fs.readFileSync(outP);
  } catch { return null; }
  finally { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} }
}

// ══════════════════════════════════════════════════════════════
// 4. BUSCA (yt-search — sem API key)
// ══════════════════════════════════════════════════════════════
async function buscar(query) {
  const yts = require('yt-search');
  const r = await yts(query);
  const v = (r.videos || []).find((x) => x.seconds > 10 && x.seconds <= CFG.limiteMin * 60) || (r.videos || [])[0];
  if (!v) throw new Error('Nenhum resultado encontrado.');
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

// ══════════════════════════════════════════════════════════════
// 5. CARTÃO (capa + legenda)
// ══════════════════════════════════════════════════════════════
function legenda(v) {
  const views = Number(v.views || 0).toLocaleString('en-US');
  const linhas = [`☘️ *${ROTULOS.titulo}* : _${v.title || '—'}_`];
  if (v.duration) linhas.push(`▫️*⏱️ ${ROTULOS.duracao}* ➟ _${v.duration}_`);
  if (views !== '0') linhas.push(`▫️*👀 ${ROTULOS.views}* ➟ _${views}_`);
  if (v.ago) linhas.push(`▫️*📅 ${ROTULOS.publicado}* ➟ _${v.ago}_`);
  if (v.author) linhas.push(`▫️*🎤 ${ROTULOS.canal}* ➟ _${v.author}_`);
  linhas.push(
    '',
    `*☱ 🔢 ${ROTULOS.replyNum} ☱*`,
    '',
    `*01 ❯❯ ${ROTULOS.downAudio}🎧*`,
    `*02 ❯❯ ${ROTULOS.downDoc}📁*`,
    `*03 ❯❯ ${ROTULOS.downVoice}🎤*`,
  );
  return linhas.join('\n');
}

async function _fetchBuf(url) {
  const http = url.startsWith('https') ? require('https') : require('http');
  return new Promise((resolve) => {
    http.get(url, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', () => resolve(null));
  });
}

async function mostrar(sock, msg, ctx, v) {
  _limpar();
  _pendentes.set(_key(ctx), { video: v, ts: Date.now() });
  const caption = legenda(v);
  let thumb = null;
  try { thumb = await _fetchBuf(v.thumbnail); } catch {}
  if (thumb && thumb.length > 200) {
    return sock.sendMessage(ctx.remoteJid, { image: thumb, caption }, { quoted: msg });
  }
  if (v.thumbnail) {
    try { return await sock.sendMessage(ctx.remoteJid, { image: { url: v.thumbnail }, caption }, { quoted: msg }); } catch {}
  }
  return sock.sendMessage(ctx.remoteJid, { text: caption }, { quoted: msg });
}

// ══════════════════════════════════════════════════════════════
// 6. RESPOSTA POR NÚMERO (estado descartável em memória)
// ══════════════════════════════════════════════════════════════
const _pendentes = new Map();
const TTL = CFG.ttlMin * 60 * 1000;
const _key = (ctx) => `${ctx?.remoteJid || ''}::${ctx?.senderNumber || ''}`;
function _limpar() {
  const agora = Date.now();
  for (const [k, v] of _pendentes) if (agora - v.ts > TTL) _pendentes.delete(k);
}

function _nomeFicheiro(titulo) {
  return `${String(titulo || 'audio').replace(/[/\\?%*:|"<>]/g, '-').slice(0, 60)}.mp3`;
}

async function tentarNumero(sock, msg, ctx, text) {
  _limpar();
  const m = String(text || '').trim().match(/^0?([1-3])(?:\s.*)?$/);
  if (!m) return false;
  const pendente = _pendentes.get(_key(ctx));
  if (!pendente) return false;

  const opcao = parseInt(m[1], 10);
  const v = pendente.video;
  _pendentes.delete(_key(ctx));

  try {
    await sock.sendMessage(ctx.remoteJid, { react: { text: '⏳', key: msg.key } }).catch(() => {});
    const { buffer } = await baixarAudio(v.youtube_url);
    if (!buffer || buffer.length < 1024) throw new Error('áudio vazio');

    if (opcao === 1) {
      await sock.sendMessage(ctx.remoteJid, { audio: buffer, mimetype: 'audio/mpeg', fileName: _nomeFicheiro(v.title), ptt: false }, { quoted: msg });
      await sock.sendMessage(ctx.remoteJid, { react: { text: '🎧', key: msg.key } }).catch(() => {});
      return true;
    }
    if (opcao === 2) {
      await sock.sendMessage(ctx.remoteJid, { document: buffer, fileName: _nomeFicheiro(v.title), mimetype: 'audio/mpeg', caption: `📁 ${v.title}` }, { quoted: msg });
      await sock.sendMessage(ctx.remoteJid, { react: { text: '📁', key: msg.key } }).catch(() => {});
      return true;
    }
    // opção 3 — voz
    const opus = paraOpus(buffer);
    await sock.sendMessage(ctx.remoteJid, {
      audio: opus && opus.length > 500 ? opus : buffer,
      mimetype: opus && opus.length > 500 ? 'audio/ogg; codecs=opus' : 'audio/mpeg',
      ptt: true,
    }, { quoted: msg });
    await sock.sendMessage(ctx.remoteJid, { react: { text: '🎤', key: msg.key } }).catch(() => {});
    return true;
  } catch (e) {
    await sock.sendMessage(ctx.remoteJid, { react: { text: '❌', key: msg.key } }).catch(() => {});
    await sock.sendMessage(ctx.remoteJid, { text: `❌ Não consegui baixar: ${String(e?.message || e).slice(0, 120)}` }, { quoted: msg });
    return true;
  }
}

// ══════════════════════════════════════════════════════════════
// 7. HANDLER — registar como 'som' (e aliases que quiseres)
// ══════════════════════════════════════════════════════════════
async function som({ sock, msg, ctx, text, prefix, reply }) {
  const q = String(text || '').trim();
  if (!q) {
    return reply([
      '🎵 *Buscar música*',
      '',
      'Exemplo: `' + (prefix || CFG.prefixo) + 'som Parabéns kizomba`',
      '',
      'Depois responde *01*, *02* ou *03* para o formato.',
    ].join('\n'));
  }
  try {
    const v = await buscar(q);
    await mostrar(sock, msg, ctx, v);
  } catch (e) {
    return reply('❌ ' + String(e?.message || e).slice(0, 120));
  }
}

module.exports = { som, tentarNumero, buscar, legenda, mostrar, estilizar, PEQUENAS, ROTULOS, _pendentes };
