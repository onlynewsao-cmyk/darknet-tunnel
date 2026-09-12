/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║   DARK BOT — Portal 18+ v3 ULTRA                            ║
 * ║   Sistema completo de conteúdo adulto owner-only            ║
 * ║   Todas as APIs são gratuitas, sem key, sem cadastro        ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * ⚠️  RESTRITO: apenas dono principal (isPrimaryOwner)
 * ⚠️  Todo o conteúdo é enviado EXCLUSIVAMENTE no PV do dono
 * ⚠️  Protecção legal: bloqueia termos de menores, violência, etc.
 *
 * APIs GRATUITAS USADAS:
 *  📸 Imagens:  yande.re | konachan.com | e621.net | nekos.life
 *  🎬 Vídeos:   via query personalizada na API do dono (configurável)
 *  📚 Livros:   OpenLibrary | Gutendex (Project Gutenberg)
 *  🔍 Busca:    yande.re tags | konachan tags | e621 tags
 *  💬 ChatHot:  Groq / Gemini / fallback local
 *
 * COMANDOS (todos owner-only, só no PV do dono):
 *  !cmdsocultos        — menu do portal
 *  !adultmode on/off   — liga/desliga o portal
 *  !hentai [tags]      — imagem hentai aleatória
 *  !ximg [tags]        — imagem adulta por tags
 *  !xvideo [termo]     — vídeo via API configurável
 *  !adultsearch [tags] — busca múltiplas imagens
 *  !adultapi <url>     — configura API de vídeo externa
 *  !hotchat [tema]     — chat adulto com IA
 *  !buscalivro [nome]  — busca livros adultos/romance
 *  !livro <id>         — link de download do livro
 *  !livros18           — livros 18+ populares
 */

const mediaHandler = require('./mediaHandler');
const config       = require('../config');
const BotConfig    = require('../database/models/BotConfig');
const botConfigCache = require('./botConfigCache');
const ai           = require('./ai');

// ─────────────────────────────────────────────
// SEGURANÇA — listas de termos bloqueados
// ─────────────────────────────────────────────
// v7.1: filtro ALIVIADO — só bloqueia o que é realmente ilegal/perigoso.
// Removidos termos demasiado amplos: 'teen', 'colegial', 'schoolgirl',
// 'blood', 'dead', 'animal', 'forced' — são comuns em anime/manga
// normal e bloqueiam pesquisas legítimas. O filtro de tags (-loli -cub)
// nas APIs já trata do conteúdo proibido.
// v6.62: o commit 74b1438 aliviou o filtro para tirar falsos
// positivos (animal, blood, morto, forced) — faz sentido.
// Mas levou também teen/colegial/schoolgirl/schoolboy, que são
// proteção legal, não conveniência. Repostos.
// Os falsos positivos que retiraste continuam fora.
const BLOCKED_TERMS = /\b(menor|menores|criança|crianca|infantil|kid|kids|child|children|underage|loli|lolita|shota|teen|teens|colegial|schoolgirl|schoolboy|incesto|incest|rape|abuso|abuse|abus|zoofilia|bestiality|snuff|gore|scat|necro|necrophilia)\b/i;

function isBlocked(q = '') {
  return BLOCKED_TERMS.test(String(q || ''));
}

function cleanQuery(q = '') {
  return String(q || '').replace(/\s+/g, ' ').trim().slice(0, 120);
}

// ─────────────────────────────────────────────
// OWNER PV — envia exclusivamente no PV do dono
// ─────────────────────────────────────────────
// v6.52: o ownerPv construía o JID a partir do .env
// (`244945280380@s.whatsapp.net`). No WhatsApp moderno o dono pode
// estar identificado por LID (`…@lid`) ou ter o JID noutro formato —
// a mensagem ia para um destino inexistente e o `.catch` engolia o
// erro em silêncio. Resultado: o bot confirmava "enviado no teu PV"
// e não chegava nada.
//
// Agora:
//   1. Usa o JID REAL de quem chamou o comando (ctx.senderJid),
//      que é o que o WhatsApp acabou de nos entregar e existe de certeza
//   2. Tenta vários formatos em cascata
//   3. Devolve true/false para o chamador saber se chegou mesmo
let _pvJidOk = null;   // memoriza o formato que funcionou

function setOwnerJid(jid) {
  if (jid && typeof jid === 'string') _pvJidOk = jid;
}

async function ownerPv(sock, payload, ctx = null) {
  const num = String(config.owner.number || '').replace(/\D/g, '');

  // Ordem de tentativa: o que já funcionou → JID real do chamador → .env
  const candidatos = [
    _pvJidOk,
    ctx?.senderJid,
    ctx?.senderNumber ? `${String(ctx.senderNumber).replace(/\D/g, '')}@s.whatsapp.net` : null,
    num ? `${num}@s.whatsapp.net` : null,
  ].filter(Boolean);

  const tentados = new Set();
  let ultimoErro = null;

  for (const jid of candidatos) {
    if (tentados.has(jid)) continue;
    tentados.add(jid);
    try {
      await sock.sendMessage(jid, payload);
      _pvJidOk = jid;         // memoriza para as próximas
      return true;
    } catch (e) {
      ultimoErro = e;
    }
  }

  console.warn('[Portal18] ownerPv NÃO entregou:',
    ultimoErro?.message?.slice(0, 80) || 'nenhum JID válido',
    '| tentados:', [...tentados].join(', '));
  return false;
}


// ─────────────────────────────────────────────
// HELPER — paginação aleatória
// ─────────────────────────────────────────────
function randPage(max = 300) {
  return Math.ceil(Math.random() * max);
}

// ─────────────────────────────────────────────
// HELPER — extrai URLs de imagem de objectos JSON aninhados
// ─────────────────────────────────────────────
function extractImageUrls(obj, max = 6) {
  const out = [];
  function walk(x) {
    if (out.length >= max) return;
    if (!x) return;
    if (typeof x === 'string') {
      if (/^https?:\/\//i.test(x) && /\.(jpe?g|png|webp|gif|mp4|webm)(?:[?#]|$)/i.test(x)) {
        out.push(x);
      }
      return;
    }
    if (Array.isArray(x)) { x.forEach(walk); return; }
    if (typeof x === 'object') {
      const keys = ['file_url', 'jpeg_url', 'sample_url', 'large_file_url', 'url', 'image_url', 'src', 'link', 'download'];
      for (const k of keys) { if (x[k]) walk(x[k]); }
      for (const v of Object.values(x)) {
        if (typeof v === 'object') walk(v);
      }
    }
  }
  walk(obj);
  return [...new Set(out)].slice(0, max);
}

// ─────────────────────────────────────────────
// SAFE FETCH JSON
// ─────────────────────────────────────────────
async function fetchJ(url, timeoutMs = 15000) {
  return mediaHandler.fetchJson(url, timeoutMs);
}

// ─────────────────────────────────────────────
// FONTE 1 — yande.re (imagens Anime adulto)
// ─────────────────────────────────────────────
async function yandeImages(tags = 'nude', count = 3) {
  const safeTags = (tags || 'nude')
    .replace(/loli|shota|child|minor/gi, '')
    .trim() + ' -loli -shota -cub';
  const page = randPage(400);
  const url = `https://yande.re/post.json?limit=${count + 2}&tags=${encodeURIComponent(safeTags.trim())}&page=${page}`;
  const data = await fetchJ(url);
  if (!Array.isArray(data) || !data.length) throw new Error('Sem resultados no yande.re');
  return data.slice(0, count).map(p => ({
    url: p.file_url || p.jpeg_url || p.sample_url || '',
    tags: (p.tags || '').split(' ').slice(0, 6).join(', '),
    score: p.score || 0,
    source: 'yande.re',
  })).filter(p => p.url);
}

// ─────────────────────────────────────────────
// FONTE 2 — konachan.com (imagens Anime adulto)
// ─────────────────────────────────────────────
async function konachanImages(tags = 'nude', count = 3) {
  const safeTags = (tags || 'nude')
    .replace(/loli|shota|child|minor/gi, '')
    .trim() + ' -loli -shota';
  const page = randPage(500);
  const url = `https://konachan.com/post.json?limit=${count + 2}&tags=${encodeURIComponent(safeTags.trim())}&page=${page}`;
  const data = await fetchJ(url);
  if (!Array.isArray(data) || !data.length) throw new Error('Sem resultados no konachan.com');
  return data.slice(0, count).map(p => ({
    url: p.file_url || p.sample_url || p.preview_url || '',
    tags: (p.tags || '').split(' ').slice(0, 6).join(', '),
    score: p.score || 0,
    source: 'konachan.com',
  })).filter(p => p.url);
}

// ─────────────────────────────────────────────
// FONTE 3 — e621.net (funciona sem key, ampla variedade)
// ─────────────────────────────────────────────
async function e621Images(tags = 'rating:e', count = 3) {
  const safeTags = (String(tags || 'rating:e'))
    .replace(/loli|cub|child|minor|shota|gore|scat/gi, '')
    .trim() + ' -loli -cub -scat -gore order:random';
  const url = `https://e621.net/posts.json?tags=${encodeURIComponent(safeTags.trim())}&limit=${count + 3}`;
  const data = await fetchJ(url, 12000);
  const posts = (data?.posts || []).filter(p => p.file?.url && ['jpg','png','gif','webm'].includes(p.file?.ext));
  if (!posts.length) throw new Error('Sem resultados no e621.net');
  return posts.slice(0, count).map(p => ({
    url: p.file.url,
    previewUrl: p.preview?.url || p.file.url,
    tags: [...(p.tags?.character||[]), ...(p.tags?.general||[])].slice(0, 5).join(', '),
    score: p.score?.total || 0,
    source: 'e621.net',
    isVideo: p.file.ext === 'webm',
  })).filter(p => p.url);
}

// ─────────────────────────────────────────────
// FONTE 4 — nekos.life (SFW neko / lewd)
// ─────────────────────────────────────────────
const NEKOS_LIFE_TYPES = {
  sfw:  ['neko', 'kitsune', 'cuddle', 'kiss', 'hug', 'pat', 'feed', 'wink', 'dance', 'smug'],
  nsfw: ['lewd'],  // o que ainda funciona sem 500
};

async function nekosLifeImage(type = 'lewd') {
  const url = `https://nekos.life/api/v2/img/${type}`;
  const data = await fetchJ(url, 8000);
  if (!data?.url) throw new Error('nekos.life sem URL');
  return [{ url: data.url, tags: type, score: 0, source: 'nekos.life' }];
}

// ─────────────────────────────────────────────
// FONTE 5 — safebooru.org (v6.50)
// Testada: as outras candidatas estão fechadas —
//   waifu.pics  → domínio morto (ENOTFOUND)
//   nekos.best  → HTTP 403
//   danbooru    → HTTP 403
//   gelbooru    → HTTP 401
//   rule34.xxx  → exige chave de API
// A safebooru responde e entrega bytes reais (testado: 103KB
// image/jpeg). É SFW, por isso serve de rede de segurança quando
// as fontes adultas falham — melhor devolver algo do que nada.
// ─────────────────────────────────────────────
async function safebooruImages(tags = '', count = 3) {
  const safe = String(tags || '').replace(/loli|shota|child|minor/gi, '').trim();
  const q = (safe ? safe + ' ' : '') + 'sort:random';
  const url = `https://safebooru.org/index.php?page=dapi&s=post&q=index&json=1&limit=${count + 2}&tags=${encodeURIComponent(q)}`;
  const data = await fetchJ(url, 12000);
  if (!Array.isArray(data) || !data.length) throw new Error('Sem resultados no safebooru');
  return data.slice(0, count).map(p => ({
    // a API devolve directory+image, não a URL completa
    url: `https://safebooru.org/images/${p.directory}/${p.image}`,
    tags: String(p.tags || '').split(' ').slice(0, 6).join(', '),
    score: p.score || 0,
    source: 'safebooru.org',
  })).filter(x => x.url && !/undefined/.test(x.url));
}

// ─────────────────────────────────────────────
// FONTE 6 — purrbot.site (v6.51) — GIFs animados
// Testada: entrega GIF real (349KB, image/gif, magic bytes 'GIF').
// Tem SFW e NSFW, organizado por tipo (neko, kiss, hug, cuddle...).
// É das poucas ainda abertas: tenor/giphy/waifu.im devolvem 401/403.
// ─────────────────────────────────────────────
const PURRBOT_SFW  = ['neko', 'kiss', 'hug', 'cuddle', 'pat', 'slap', 'tickle', 'poke', 'lick', 'bite', 'dance', 'kitsune', 'holo', 'senko', 'okami', 'shiro'];
const PURRBOT_NSFW = ['neko', 'blowjob', 'cum', 'fuck', 'pussylick', 'solo', 'threesome', 'yuri', 'anal'];

async function purrbotGif(tipo = 'neko', nsfw = false) {
  const lista = nsfw ? PURRBOT_NSFW : PURRBOT_SFW;
  const t = lista.includes(String(tipo).toLowerCase()) ? String(tipo).toLowerCase() : lista[0];
  const url = `https://purrbot.site/api/img/${nsfw ? 'nsfw' : 'sfw'}/${t}/gif`;
  const data = await fetchJ(url, 10000);
  if (!data?.link) throw new Error('purrbot sem resultado');
  return [{ url: data.link, tags: t, score: 0, source: 'purrbot.site', animated: true }];
}

// ─────────────────────────────────────────────
// FONTE 7 — nekos.life GIF por tipo (v6.51)
// O nekosLifeImage já existia mas só devolvia imagem estática.
// Estes tipos devolvem GIF: kiss, hug, cuddle, pat, slap, tickle…
// ─────────────────────────────────────────────
const NEKOS_GIF_TYPES = ['kiss', 'hug', 'cuddle', 'pat', 'slap', 'tickle', 'poke', 'feed', 'smug', 'baka', 'wink', 'dance'];

async function nekosGif(tipo = 'kiss') {
  const t = NEKOS_GIF_TYPES.includes(String(tipo).toLowerCase()) ? String(tipo).toLowerCase() : 'kiss';
  const data = await fetchJ(`https://nekos.life/api/v2/img/${t}`, 8000);
  if (!data?.url) throw new Error('nekos.life sem resultado');
  return [{ url: data.url, tags: t, score: 0, source: 'nekos.life', animated: true }];
}

// ─────────────────────────────────────────────
// BUSCA DE ANIMADOS POR NOME (v6.51)
// e621 e yande.re suportam a tag 'animated' — dá para procurar
// GIF/webm por personagem ou tema, em vez de aleatório.
// ─────────────────────────────────────────────
async function searchAnimated(nome = '', count = 3) {
  const limpo = String(nome || '').replace(/loli|shota|child|minor/gi, '').trim();
  const termo = limpo.replace(/\s+/g, '_');

  const tentativas = [
    // e621: melhor cobertura de animado
    async () => {
      const tags = `${termo ? termo + ' ' : ''}animated -loli -cub -scat -gore order:random`;
      const d = await fetchJ(`https://e621.net/posts.json?tags=${encodeURIComponent(tags)}&limit=${count + 3}`, 12000);
      const posts = (d?.posts || []).filter(x => x.file?.url && ['gif', 'webm', 'mp4'].includes(x.file?.ext));
      if (!posts.length) throw new Error('sem animados no e621');
      return posts.slice(0, count).map(x => ({
        url: x.file.url,
        tags: [...(x.tags?.character || []), ...(x.tags?.general || [])].slice(0, 5).join(', '),
        score: x.score?.total || 0, source: 'e621.net',
        animated: true, ext: x.file.ext,
      }));
    },
    // yande.re com tag animated
    async () => {
      const tags = `${termo ? termo + ' ' : ''}animated -loli -shota`;
      const d = await fetchJ(`https://yande.re/post.json?limit=${count + 2}&tags=${encodeURIComponent(tags)}`, 12000);
      if (!Array.isArray(d) || !d.length) throw new Error('sem animados no yande');
      return d.slice(0, count).map(x => ({
        url: x.file_url || x.sample_url, tags: String(x.tags || '').split(' ').slice(0, 5).join(', '),
        score: x.score || 0, source: 'yande.re', animated: true,
      }));
    },
    // último recurso: GIF aleatório do purrbot
    async () => purrbotGif('neko', true),
  ];

  for (const fn of tentativas) {
    try { const r = await fn(); if (r?.length) return r; } catch {}
  }
  throw new Error('Nenhuma fonte devolveu animados para: ' + (nome || 'aleatório'));
}

// ─────────────────────────────────────────────
// BUSCA POR NOME/PERSONAGEM (v6.51)
// Converte "hatsune miku" → "hatsune_miku" (formato dos boorus)
// e procura em cascata. Confirmado a funcionar nas 3 fontes.
// ─────────────────────────────────────────────
async function searchByName(nome = '', count = 3) {
  const limpo = String(nome || '').replace(/loli|shota|child|minor/gi, '').trim();
  if (!limpo) throw new Error('Diz um nome para procurar');
  return searchByNameWide(limpo, count);
}

/** Pesquisa ampla: todas as fontes em paralelo + animados (gif/webm). */
async function searchByNameWide(nome = '', count = 8) {
  const limpo = String(nome || '').replace(/loli|shota|child|minor/gi, '').trim();
  if (!limpo) throw new Error('Diz um nome para procurar');
  const termo = limpo.replace(/\s+/g, '_');
  const want = Math.max(4, Math.min(24, Number(count) || 8));

  const jobs = [
    () => yandeImages(termo, want),
    () => konachanImages(termo, want),
    () => e621Images(`${termo} order:random`, want),
    () => safebooruImages(termo, want),
    () => searchAnimated(limpo, Math.max(3, Math.ceil(want / 2))),
    async () => {
      try {
        const sexcom = require('./sexcom');
        return (await sexcom.searchImages(limpo, want)) || [];
      } catch { return []; }
    },
    async () => {
      try {
        const sexcom = require('./sexcom');
        const r = await sexcom.searchGifs(limpo, Math.ceil(want / 2));
        return (r || []).map(g => ({ ...g, animated: true, source: g.source || 'sex.com' }));
      } catch { return []; }
    },
  ];

  const settled = await Promise.allSettled(jobs.map((fn) => fn()));
  const seen = new Set();
  const all = [];
  for (const s of settled) {
    if (s.status !== 'fulfilled' || !s.value?.length) continue;
    for (const item of s.value) {
      const url = item?.url;
      if (!url || seen.has(url)) continue;
      seen.add(url);
      const anim = !!(item.animated || item.isVideo || /\.(gif|webm|mp4)$/i.test(url));
      all.push({ ...item, animated: anim });
    }
  }
  if (!all.length) throw new Error(`Não encontrei nada para: ${limpo}`);

  const anim = all.filter((x) => x.animated);
  const still = all.filter((x) => !x.animated);
  const mixed = [];
  while (mixed.length < want && (still.length || anim.length)) {
    if (still.length) mixed.push(still.shift());
    if (mixed.length < want && anim.length) mixed.push(anim.shift());
  }
  return mixed.slice(0, want);
}

// ─────────────────────────────────────────────
// BUSCA MULTI-FONTE — tenta em cascata COM RANDOMIZAÇÃO
// v7.2: inclui sex.com, randomiza ordem das fontes, nunca repete
// ─────────────────────────────────────────────

// Cache de URLs já enviadas (anti-repetição, TTL 30min)
const _sentUrls = new Map();
const SENT_TTL = 30 * 60 * 1000;

function wasRecentlySent(url) {
  const ts = _sentUrls.get(url);
  if (!ts) return false;
  if (Date.now() - ts > SENT_TTL) { _sentUrls.delete(url); return false; }
  return true;
}

function markSent(url) {
  _sentUrls.set(url, Date.now());
  // Limita cache a 500 entradas
  if (_sentUrls.size > 500) {
    const oldest = [..._sentUrls.entries()].sort((a, b) => a[1] - b[1]).slice(0, 200);
    for (const [k] of oldest) _sentUrls.delete(k);
  }
}

function filterNewUrls(items) {
  return items.filter(i => !wasRecentlySent(i.url));
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function searchImages(tags = '', count = 3) {
  const safe = (tags || 'nude').replace(/loli|shota|child|minor/gi, '').trim();

  // Randomiza a ordem das fontes — nunca repete a mesma sequência
  const sources = shuffle([
    { name: 'yande.re', fn: () => yandeImages(safe, count) },
    { name: 'konachan', fn: () => konachanImages(safe, count) },
    { name: 'e621', fn: () => e621Images(safe, count) },
    { name: 'sex.com', fn: async () => {
      try {
        const sexcom = require('./sexcom');
        const r = await sexcom.searchImages(safe, count);
        if (r?.length) return r;
      } catch {}
      throw new Error('sex.com falhou');
    }},
    { name: 'sex.com-gifs', fn: async () => {
      try {
        const sexcom = require('./sexcom');
        const r = await sexcom.searchGifs(safe, count);
        if (r?.length) return r.map(g => ({ ...g, source: 'sex.com', animated: true }));
      } catch {}
      throw new Error('sex.com gifs falhou');
    }},
    { name: 'nekos.life', fn: () => nekosLifeImage('lewd') },
    { name: 'safebooru', fn: () => safebooruImages(safe, count) },
  ]);

  const allResults = [];
  for (const src of sources) {
    try {
      const imgs = await src.fn();
      if (imgs?.length) {
        const fresh = filterNewUrls(imgs);
        allResults.push(...fresh);
      }
    } catch {}
  }

  if (!allResults.length) throw new Error('Todas as fontes falharam. Tente de novo.');

  // Randomiza e limita
  const result = shuffle(allResults).slice(0, count);
  for (const r of result) markSent(r.url);
  return result;
}

// ─────────────────────────────────────────────
// LIVROS — OpenLibrary + Gutendex
// ─────────────────────────────────────────────
async function searchBooks(query = '', count = 5) {
  const q = cleanQuery(query || 'romance erotic adult passion desire');

  // Gutendex (Project Gutenberg) — tem download directo EPUB/TXT
  try {
    const url = 'https://gutendex.com/books/?search=' + encodeURIComponent(q) + '&languages=en,pt';
    const data = await fetchJ(url, 15000);
    if (data?.results?.length) {
      return data.results.slice(0, count).map(b => {
        const formats = b.formats || {};
        const downloadUrl = formats['application/epub+zip'] ||
          formats['text/plain; charset=utf-8'] || formats['text/plain'] ||
          formats['text/html; charset=utf-8'] || formats['text/html'] || '';
        const downloadExt = downloadUrl.includes('epub') ? 'epub' : downloadUrl.includes('html') ? 'html' : 'txt';
        return {
          title:  b.title || 'Sem titulo',
          author: b.authors?.[0]?.name || 'Desconhecido',
          year:   b.id || '?',
          cover:  null,
          key:    String(b.id || ''),
          link:   downloadUrl,
          downloadUrl,
          downloadExt,
          source: 'Project Gutenberg',
        };
      });
    }
  } catch {}

  // OpenLibrary fallback
  try {
    const url = 'https://openlibrary.org/search.json?q=' + encodeURIComponent(q) + '&limit=' + (count + 3) + '&fields=title,author_name,key,cover_i,first_publish_year,subject';
    const data = await fetchJ(url, 15000);
    if (data?.docs?.length) {
      return data.docs.slice(0, count).map(b => ({
        title:   b.title || 'Sem titulo',
        author:  b.author_name?.[0] || 'Desconhecido',
        year:    b.first_publish_year || '?',
        cover:   b.cover_i ? 'https://covers.openlibrary.org/b/id/' + b.cover_i + '-M.jpg' : null,
        key:     b.key || '',
        link:    b.key ? 'https://openlibrary.org' + b.key : '',
        source:  'OpenLibrary',
      }));
    }
  } catch {}

  throw new Error('Nao encontrei livros para: ' + q);
}

// Géneros de livros 18+
const BOOK_GENRES_18 = [
  'erotic romance desire passion', 'adult romance passionate love',
  'desenho arte nude nu adulto', 'historia sem censura erotico', 'conto erotico adulto',
  'romance forbidden love affair explicit', 'mature adult fiction desire',
  'sensual adult fiction mature', 'romance forbidden love affair',
  'desire passion adult story', 'romance drama adult novels',
  'hot romance steamy fiction', 'mature adult love story',
];

async function popularBooks18(count = 6) {
  const genre = BOOK_GENRES_18[Math.floor(Math.random() * BOOK_GENRES_18.length)];
  return searchBooks(genre, count);
}

// ─────────────────────────────────────────────
// CHAT HOT — IA com prompt adulto
// ─────────────────────────────────────────────
const HOT_CHAT_SYSTEM = `Você é uma IA de entretenimento adulto 18+ para maiores de idade. Crie mensagens sensuais, picantes e provocantes em português. Seja elegante, sedutor e ousado. Nunca envolva menores, violência, conteúdo ilegal ou não-consensual. Responda sempre em português. Máx 200 palavras.`;

async function hotChatIA(tema = 'sedução', style = 'sensual') {
  const styles = {
    sensual: 'tom elegante e sedutor, provocante mas sofisticado',
    picante: 'tom ousado e directo, adulto e sem rodeios mas consensual',
    romantico: 'tom romântico e apaixonado, com tensão sexual',
    conto: 'em forma de conto curto/história adulta de 3 parágrafos',
    conversa: 'em forma de conversa/flerte adulto como se fosse uma pessoa real',
  };
  const styleDesc = styles[style] || styles.sensual;
  const prompt = `Escreva uma mensagem adulta 18+ com ${styleDesc}. Tema: "${tema}". Sem menores, sem violência, totalmente consensual.`;

  // Tenta IA configurada primeiro
  try {
    const out = await ai.chat(prompt, HOT_CHAT_SYSTEM);
    if (out && out.length > 20) return out;
  } catch {}

  // Fallback local — textos pré-feitos por categoria
  const fallbacks = {
    sensual: [
      `✨ Há momentos em que as palavras não conseguem descrever o que o olhar já confessou. Naquela noite, o ar entre nós era pesado de antecipação — cada gesto, cada susurro uma promessa silenciosa de algo inevitável...`,
      `🌙 A sedução não começa com o toque. Começa com aquele olhar que diz tudo sem pronunciar uma única sílaba. É o arrepio que percorre a espinha antes de qualquer contacto...`,
      `🥂 Entre o primeiro e o segundo copo de vinho, algo mudou. A conversa tornou-se mais lenta, os risos mais suaves, e a distância entre nós foi diminuindo de forma imperceptível mas absolutamente intencional...`,
    ],
    picante: [
      `🔥 Directo ao ponto: aquela noite foi intensa. Sem rodeios, sem fingimentos — apenas dois adultos que souberam exactamente o que queriam e não tiveram vergonha de o dizer...`,
      `💋 Às vezes o desejo é simples: é querer alguém completamente. É essa vontade crua e honesta que transforma uma noite comum em algo memorável...`,
    ],
    romantico: [
      `💕 A tensão acumulou-se ao longo de semanas. Cada mensagem, cada encontro casual onde os dedos se roçavam por acidente — nada era por acidente. E quando finalmente aconteceu, foi como respirar fundo depois de muito tempo sem ar...`,
    ],
  };
  const pool = fallbacks[style] || fallbacks.sensual;
  return pool[Math.floor(Math.random() * pool.length)];
}

// ─────────────────────────────────────────────
// VÍDEO — via API externa configurável pelo dono
// ─────────────────────────────────────────────
async function fetchAdultVideo(query = '', apiTpl = '') {
  if (!apiTpl || !apiTpl.includes('{query}')) {
    throw new Error('API de vídeo não configurada. Use: !adultapi <url com {query}>');
  }
  const url = apiTpl.replace(/\{query\}/g, encodeURIComponent(query));
  const data = await fetchJ(url, 20000);
  const urls = extractImageUrls(data, 4).filter(u => /\.(mp4|webm|mov)(?:[?#]|$)|video/i.test(u));
  if (!urls.length) throw new Error('API não retornou vídeos válidos.');
  return urls;
}

// ─────────────────────────────────────────────
// MENU DO PORTAL — card visual rico
// ─────────────────────────────────────────────
function portalMenuText(ownerName, enabled, apiConfigured, prefix) {
  const st = enabled ? '🟢 ACTIVO' : '🔴 DESATIVADO';
  const ap = apiConfigured ? '✅ configurada' : '⚠️ não configurada';
  return (
    `╔══〔 🕳️ PORTAL OCULTO 18+ 〕══╗\n` +
    `║  👑 Dono: *${ownerName}*\n` +
    `║  Status: *${st}*\n` +
    `║  API vídeo: *${ap}*\n` +
    `╠══════════════════════════╣\n` +
    `║  ⚠️ *18+ EXCLUSIVO — ADULTOS*\n` +
    `║  Só PV do Dono • Sem menores\n` +
    `║  Sem violência • Consensual\n` +
    `╠══════════════════════════╣\n` +
    `║  📸 *IMAGENS*\n` +
    `║  ${prefix}hentai [tags]    — anime adulto\n` +
    `║  ${prefix}ximg [tags]      — busca por tags\n` +
    `║  ${prefix}adultsearch [t]  — busca multi-fonte\n` +
    `╠══════════════════════════╣\n` +
    `║  🎬 *VÍDEOS*\n` +
    `║  ${prefix}xvideo [termo]   — busca vídeo\n` +
    `║  ${prefix}adultapi <url>   — configura API\n` +
    `╠══════════════════════════╣\n` +
    `║  💬 *CHAT HOT*\n` +
    `║  ${prefix}hotchat [tema]   — chat sensual\n` +
    `║  ${prefix}hotchat [t] picante  — mais ousado\n` +
    `║  ${prefix}hotchat [t] conto    — conto 18+\n` +
    `║  ${prefix}hotchat [t] conversa — flerte\n` +
    `╠══════════════════════════╣\n` +
    `║  📚 *LIVROS ADULTOS*\n` +
    `║  ${prefix}buscalivro [nome] — busca livros\n` +
    `║  ${prefix}livros18          — top 18+\n` +
    `╠══════════════════════════╣\n` +
    `║  ⚙️ *CONTROLO*\n` +
    `║  ${prefix}adultmode on/off  — liga/desliga\n` +
    `╚══════════════════════════╝`
  );
}

// ─────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────
module.exports = {
  isBlocked,
  cleanQuery,
  ownerPv,
  setOwnerJid,
  yandeImages,
  konachanImages,
  e621Images,
  nekosLifeImage,
  safebooruImages,
  purrbotGif,
  nekosGif,
  searchAnimated,
  searchByName,
  searchByNameWide,
  PURRBOT_SFW,
  PURRBOT_NSFW,
  NEKOS_GIF_TYPES,
  searchImages,
  searchBooks,
  popularBooks18,
  hotChatIA,
  fetchAdultVideo,
  portalMenuText,
  NEKOS_LIFE_TYPES,
  // v7.2
  wasRecentlySent,
  markSent,
  filterNewUrls,
  shuffle,
};
