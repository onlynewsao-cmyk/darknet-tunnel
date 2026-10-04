'use strict';
/**
 * v7.84 — ESCUDO VIVO (autoDL)
 * O escudo de links não devia SÓ permitir: quando alguém partilha um
 * link de plataforma permitida (yt/tiktok/kwai/ig/fb/x/spotify...),
 * o bot ATIVA-SE e baixa o conteúdo sozinho. Grupos que não querem
 * download desligam com `!antilink autodl off` (default: ON).
 *
 * Regras de bom senso:
 *  - só grupos, só mensagens de outros (nunca fromMe);
 *  - comandos (!play …) não disparam (o dono do pedido é o comando);
 *  - cooldown de 20 s por grupo (não vira fábrica de media);
 *  - 1 link por mensagem (o primeiro suportado);
 *  - falha = 1 linha humana, nunca stack trace.
 */
const linkPolicy = require('./linkPolicy');

const EXTRA = [['soundcloud', /(soundcloud\.com|snd\.sc)$/]]; // fora do catálogo do escudo

/** @returns {'youtube'|'tiktok'|...|null} */
function plataformaDe(url) {
  const h = linkPolicy.host(url);
  if (!h) return null;
  for (const k of linkPolicy.ALL_REDES) {
    if (linkPolicy.PLATFORMS[k].doms.some(d => h === d || h.endsWith('.' + d))) return k;
  }
  for (const [nome, re] of EXTRA) if (re.test(h)) return nome;
  return null;
}

/** Primeiro link suportado num texto. Puro (testável). v7.85: respeita as redes do grupo. */
function primeiroSuportado(texto, redes = null) {
  const ok = (p) => !Array.isArray(redes) || redes.includes(p);
  for (const u of linkPolicy.links(texto)) {
    const p = plataformaDe(u);
    if (p && ok(p)) return { url: u, plataforma: p };
  }
  return null;
}

const _ultimo = new Map(); // jid → ts
const COOLDOWN_MS = 20000;

function textoDe(msg) {
  const m = msg?.message || {};
  return m.conversation || m.extendedTextMessage?.text ||
         m.imageMessage?.caption || m.videoMessage?.caption || '';
}

/** Corre a par do antiLink no messageRouter. Nunca lança. */
async function check(sock, msg) {
  try {
    const jid = msg.key?.remoteJid;
    if (!jid?.endsWith('@g.us') || msg.key.fromMe) return false;
    const texto = textoDe(msg);
    if (!texto || texto.length < 10) return false;

    const gs = (await require('./hotCache').getGroupSettings(msg, jid)) || {};
    if (gs.autoDl !== true) return false; // v7.86: default OFF — o grupo liga se quiser
    // v7.85: grupo sem redes aceites não tem o que baixar
    const redes = Array.isArray(gs.antilinkRedes) ? gs.antilinkRedes : null;
    if (redes && !redes.length) return false;

    // comando do bot (qualquer prefixo) não dispara o autoDL
    try {
      const pe = require('./prefixEngine');
      if (await pe.detect(texto, jid)) return false;
    } catch {}

    const achado = primeiroSuportado(texto, redes);
    if (!achado) return false;

    const last = _ultimo.get(jid) || 0;
    if (Date.now() - last < COOLDOWN_MS) return false;
    _ultimo.set(jid, Date.now());

    // não bloqueia o router — o download corre em paralelo
    _processar(sock, jid, msg, achado).catch(async (e) => {
      console.warn('[autoDL]', String(e?.message || e).slice(0, 80));
      try {
        await sock.sendMessage(jid, { text: '🥲 Vi o link mas não consegui baixar agora — tenta mais logo.' }, { quoted: msg });
      } catch {}
    });
    return true;
  } catch { return false; }
}

async function _processar(sock, jid, msg, { url, plataforma }) {
  const dl = require('./downloader');
  const mediaHandler = require('./mediaHandler');
  const AUD = new Set(['youtube', 'spotify', 'soundcloud']);

  // Spotify mantém a própria licença/DRM: o autoDL partilha a referência
  // oficial, em vez de transferir áudio de YouTube ou de qualquer intermediário.
  if (plataforma === 'spotify') {
    const r = await dl.spotify(url);
    if (!r?.officialUrl) throw new Error('link Spotify oficial indisponível');
    await sock.sendMessage(jid, {
      text: `💚 *SPOTIFY OFICIAL*\n▶️ Abre e reproduz no player Spotify.\n🔗 ${r.officialUrl}`,
    }, { quoted: msg });
    return;
  }

  const r = await (AUD.has(plataforma)
    ? dl[plataforma === 'youtube' ? 'youtubeAudio' : plataforma](url)
    : dl[plataforma](url));
  if (!r) throw new Error('sem resultado');

  if (AUD.has(plataforma)) {
    const buf = r.buffer || await mediaHandler.fetchBuffer(r.url);
    if (!buf || buf.length < 2048) throw new Error('áudio vazio');
    await sock.sendMessage(jid, {
      audio: buf, mimetype: 'audio/mpeg',
      fileName: r.fileName || 'dark-dl.mp3',
      caption: `🎧 *${(r.title || 'DARK DL').slice(0, 80)}*\n🕸️ _via DARK DL_`,
    }, { quoted: msg });
    return;
  }

  const buf = r.buffer || await mediaHandler.fetchBuffer(r.url || r.download || r.download_url);
  if (!buf || buf.length < 4096) throw new Error('vídeo vazio');
  const isMP4 = buf.slice(4, 8).toString() === 'ftyp';
  const cap = `🎬 *${(r.title || 'DARK DL').slice(0, 80)}*\n🕸️ _via DARK DL_`;
  if (isMP4) {
    await sock.sendMessage(jid, { video: buf, mimetype: 'video/mp4', caption: cap }, { quoted: msg });
  } else {
    await sock.sendMessage(jid, { document: buf, fileName: `${(r.title || 'video').slice(0, 50)}.mp4`, mimetype: 'video/mp4', caption: cap }, { quoted: msg });
  }
}

module.exports = { check, plataformaDe, primeiroSuportado, COOLDOWN_MS };
