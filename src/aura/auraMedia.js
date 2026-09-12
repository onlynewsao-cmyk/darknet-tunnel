/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║   DARK BOT v7.8 — AURA MULTIMODAL (Etapa 1)                   ║
 * ║                                                               ║
 * ║   A AURA agora VÊ, OUVE, LÊ e ENTENDE tudo o que recebe:      ║
 * ║   • FOTOS    → Gemini Vision (descreve o que está na imagem)  ║
 * ║   • VÍDEOS   → legenda + tipo (GIF/reel)                      ║
 * ║   • ÁUDIO    → Whisper (transcrição)                          ║
 * ║   • DOCUMENTOS → texto directo (.txt/.md/...) ou Gemini (PDF) ║
 * ║   • LINKS    → lê o conteúdo da página (web digest)           ║
 * ║   • VIEW-ONCE → desembrulha e processa o conteúdo real        ║
 * ║                                                               ║
 * ║   Tudo gera um CONTEXTO (para a conversa) e um RESUMO         ║
 * ║   (para a memória — o que importa fica, o resto some).        ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */
'use strict';

const { downloadMediaMessage } = require('@systemzero/baileys');

/* ══════════════════════════ Desembrulhar ══════════════════════════ */

const WRAP = [
  'ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2',
  'viewOnceMessageV2Extension', 'documentWithCaptionMessage',
  'editedMessage', 'associatedChildMessage',
];

function unwrap(message) {
  if (!message || typeof message !== 'object') return message || {};
  let cur = message;
  for (let i = 0; i < 6 && cur; i++) {
    let next = null;
    for (const w of WRAP) {
      if (cur[w]?.message) { next = cur[w].message; break; }
    }
    if (!next) break;
    cur = next;
  }
  return cur;
}

/** Detecta o tipo real de conteúdo (depois de desembrulhar view-once). */
function detectarTipo(message) {
  const m = unwrap(message || {});
  if (m.imageMessage) return { tipo: 'imagem', ctx: m.imageMessage };
  if (m.videoMessage) return { tipo: 'video', ctx: m.videoMessage };
  if (m.ptvMessage) return { tipo: 'video', ctx: m.ptvMessage };
  if (m.audioMessage) return { tipo: 'audio', ctx: m.audioMessage };
  const doc = m.documentMessage || m.documentWithCaptionMessage?.message?.documentMessage;
  if (doc) return { tipo: 'documento', ctx: doc };
  if (m.stickerMessage) return { tipo: 'sticker', ctx: m.stickerMessage };
  return { tipo: 'nenhum', ctx: null };
}

/* ══════════════════════════ Helpers de leitura ══════════════════════════ */

const URL_RE = /https?:\/\/[^\s<>()"']+/i;

function extrairUrl(texto) {
  const m = String(texto || '').match(URL_RE);
  return m ? m[0].replace(/[.,;!?]+$/, '') : '';
}

const TEXT_MIME = new Set([
  'text/plain', 'text/markdown', 'text/csv', 'application/json',
  'application/xml', 'text/xml', 'application/javascript', 'text/html',
  'application/x-yaml', 'text/yaml',
]);

function eTexto(fname = '', mime = '') {
  return TEXT_MIME.has(mime) || /\.(txt|md|csv|json|log|xml|html?|ya?ml|js|ts|ini|conf)$/i.test(fname);
}

/* ══════════════════════════ Processadores ══════════════════════════ */

/** FOTO → descrição real via Gemini Vision. */
async function verImagem(msg, ai, legenda = '') {
  try {
    const buf = await downloadMediaMessage(msg, 'buffer', {});
    if (!buf || buf.length < 100) return { context: '', resumo: '' };
    const desc = await ai.describeImage(buf, 'Descreve o que vês nesta imagem em 1-2 frases, como pessoa real.');
    const d = String(desc || '').trim();
    if (!d) return { context: '', resumo: '' };
    return {
      context: `📸 Alguém enviou uma FOTO. Tu VÊS: ${d}${legenda ? ` Legenda: "${legenda}"` : ''} Comenta naturalmente o que vês.`,
      resumo: `[FOTO] ${legenda ? `"${legenda}" — ` : ''}${d}`,
    };
  } catch (e) {
    console.warn('[AuraMedia:imagem]', String(e.message || e).slice(0, 60));
    return { context: '', resumo: '' };
  }
}

/** VÍDEO → tipo + legenda (frames num futuro próximo). */
async function verVideo(msg, ai, legenda = '') {
  const v = detectarTipo(msg.message).ctx;
  const isGif = !!(v?.gifPlayback || v?.gifAttribution);
  return {
    context: isGif
      ? `🎞️ Alguém enviou um GIF.${legenda ? ` Legenda: "${legenda}"` : ''} Reage naturalmente.`
      : `🎬 Alguém enviou um VÍDEO.${legenda ? ` Legenda: "${legenda}"` : ''} Comenta como pessoa real.`,
    resumo: `[VÍDEO] ${legenda ? `"${legenda}"` : '(sem legenda)'}`,
  };
}

/** ÁUDIO → transcrição Whisper. */
async function ouvirAudio(msg, ai, isPtt = true) {
  try {
    const buf = await downloadMediaMessage(msg, 'buffer', {});
    if (!buf || buf.length < 500) return { context: '', resumo: '' };
    const t = await ai.transcribeAudio(buf, 'pt');
    const txt = String(t || '').trim();
    if (!txt) return { context: '', resumo: '' };
    return {
      context: isPtt
        ? `🎧 ÁUDIO DE VOZ transcrito: "${txt}" — Responde ao que foi dito como pessoa real.`
        : `🎵 ÁUDIO/MÚSICA transcrito: "${txt}" — Comenta naturalmente.`,
      resumo: `[ÁUDIO] "${txt}"`,
    };
  } catch (e) {
    console.warn('[AuraMedia:audio]', String(e.message || e).slice(0, 60));
    return { context: '', resumo: '' };
  }
}

/** DOCUMENTO → texto directo (txt/md...) ou Gemini (PDF etc.). */
async function lerDocumento(msg, ai) {
  const doc = detectarTipo(msg.message).ctx;
  const fname = doc?.fileName || 'arquivo';
  const mime = doc?.mimetype || 'application/octet-stream';
  try {
    const buf = await downloadMediaMessage(msg, 'buffer', {});
    if (!buf || buf.length < 20) return { context: '', resumo: '' };

    // Texto simples → lê directo (rápido, sem custo de IA)
    if (eTexto(fname, mime)) {
      const texto = buf.toString('utf8').replace(/\0/g, '').slice(0, 3500);
      if (texto.trim().length < 4) return { context: '', resumo: '' };
      return {
        context: `📄 Alguém enviou o documento "${fname}". Conteúdo:\n"""\n${texto}\n"""\nComenta/comenta o que importa.`,
        resumo: `[DOC] ${fname}: ${texto.slice(0, 160)}`,
      };
    }

    // PDF e outros → Gemini lê (inlineData)
    try {
      const r = await ai.chatWithDocument(
        `Lê este documento ("${fname}") e resume o essencial em 3-5 pontos.`,
        'És a AURA. Lês documentos e resumem o que importa, como pessoa real.',
        buf, mime
      );
      const txt = String(r || '').trim();
      if (!txt) return { context: '', resumo: '' };
      return {
        context: `📄 Alguém enviou o documento "${fname}". Li e o essencial é:\n${txt}\nComenta como pessoa real.`,
        resumo: `[DOC] ${fname}: ${txt.slice(0, 160)}`,
      };
    } catch (e2) {
      console.warn('[AuraMedia:pdf]', String(e2.message || e2).slice(0, 60));
      return {
        context: `📄 Alguém enviou um DOCUMENTO: ${fname}. Não consegui ler o conteúdo — pede para reenviar em texto se precisares.`,
        resumo: '',
      };
    }
  } catch (e) {
    console.warn('[AuraMedia:documento]', String(e.message || e).slice(0, 60));
    return { context: '', resumo: '' };
  }
}

/** LINK → lê o conteúdo da página (web digest). */
async function lerLink(url, ai) {
  if (!url) return { context: '', resumo: '' };
  try {
    const dig = await ai.getWebDigest(url);
    const txt = String(dig || '').trim();
    if (!txt || txt.length < 10) return { context: '', resumo: `[LINK] ${url}` };
    return {
      context: `🔗 Alguém mandou o link ${url}. Li e o essencial é:\n${txt.slice(0, 1500)}\nComenta/age sobre isso como pessoa real.`,
      resumo: `[LINK] ${url} — ${txt.slice(0, 140)}`,
    };
  } catch (e) {
    console.warn('[AuraMedia:link]', String(e.message || e).slice(0, 60));
    return { context: '', resumo: `[LINK] ${url}` };
  }
}

/* ══════════════════════════ Orquestrador ══════════════════════════ */

/**
 * Processa TUDO o que chegou e devolve o contexto + resumo.
 * @returns {{context:string, resumo:string, tipo:string}}
 */
async function processar({ msg, ai, legenda = '', texto = '' }) {
  const { tipo } = detectarTipo(msg?.message);
  const url = extrairUrl(texto);

  switch (tipo) {
    case 'imagem': {
      const r = await verImagem(msg, ai, legenda);
      return { ...r, tipo: 'imagem' };
    }
    case 'video': {
      const r = await verVideo(msg, ai, legenda);
      return { ...r, tipo: 'video' };
    }
    case 'audio': {
      const isPtt = !!detectarTipo(msg.message).ctx?.ptt;
      const r = await ouvirAudio(msg, ai, isPtt);
      return { ...r, tipo: 'audio' };
    }
    case 'documento': {
      const r = await lerDocumento(msg, ai);
      return { ...r, tipo: 'documento' };
    }
    case 'sticker':
      // stickers já têm visão dedicada no commandHandler (stickerVision)
      return { context: '', resumo: '', tipo: 'sticker' };
    default: {
      if (url) {
        const r = await lerLink(url, ai);
        return { ...r, tipo: 'link' };
      }
      return { context: '', resumo: '', tipo: 'nenhum' };
    }
  }
}

module.exports = {
  unwrap,
  detectarTipo,
  extrairUrl,
  eTexto,
  verImagem,
  verVideo,
  ouvirAudio,
  lerDocumento,
  lerLink,
  processar,
  URL_RE,
};
