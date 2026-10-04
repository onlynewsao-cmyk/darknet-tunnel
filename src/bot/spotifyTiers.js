/**
 * DARK BOT — catálogo Spotify oficial 💚
 *
 * Os comandos spotify, spotify1, spotify2, spotify3 e sp aceitam nome ou
 * link de faixa, playlist, álbum, EP e CD. Eles partilham o endereço oficial
 * do Spotify e metadados públicos, sem converter nem buscar áudio noutro site.
 */
'use strict';

const NIVEIS = {
  1: { nome: 'SPOTIFY OFICIAL 💚', bit: '', dica: 'abre no player Spotify' },
  2: { nome: 'SPOTIFY OFICIAL 💚', bit: '', dica: 'abre no player Spotify' },
  3: { nome: 'SPOTIFY OFICIAL 💚', bit: '', dica: 'abre no player Spotify' },
};

/** Do nome do comando → nível. ('spotify', 'spotify1'/'sp' → 1, …) */
function nivelDoComando(cmd) {
  const c = String(cmd || '').toLowerCase();
  if (c === 'spotify3') return 3;
  if (c === 'spotify2') return 2;
  return 1;  // spotify, spotify1, sp
}

// ── Parsing dos links ─────────────────────────────────────────
const RE_SPOTIFY = /(?:open\.)?spotify\.com\/(?:intl-[a-z-]{2,16}\/)?(track|album|playlist|episode|show|artist|episode)\/([A-Za-z0-9]+)/i;
/**
 * @returns {{tipo:'track'|'album'|'playlist'|'episode'|'show'|'artist'|void, id:string}}
 */
function isOfficialSpotifyUrl(url) {
  try {
    const host = new URL(String(url || '')).hostname.toLowerCase();
    return host === 'spotify.com' || host === 'www.spotify.com' ||
      host === 'open.spotify.com' || host === 'spotify.link';
  } catch { return false; }
}

function parseSpotifyLink(url) {
  if (!isOfficialSpotifyUrl(url)) return { tipo: '', id: '' };
  const m = String(url || '').match(RE_SPOTIFY);
  if (!m) return { tipo: '', id: '' };
  return { tipo: m[1].toLowerCase(), id: m[2] };
}
const TIPOS_COLECAO = new Set(['album', 'playlist']);   // EP/CD = 'album'
const TIPOS_BLOQUEIO = { episode: 'episódio', show: 'podcast', artist: 'artista' };

// ── faixa normal ──────────────────────────────────────────────
function _faixa(nome, artista, ref = '') {
  nome = String(nome || '').trim();
  artista = String(artista || '').trim();
  if (!nome) return null;
  return { nome, artista, ref };
}

function normalizarFaixas(arr) {
  const vistos = new Set();
  const out = [];
  for (const f of arr || []) {
    if (!f?.nome) continue;
    const k = (f.nome + '|' + f.artista).toLowerCase();
    if (vistos.has(k)) continue;
    vistos.add(k);
    out.push(f);
    if (out.length >= 200) break;
  }
  return out;
}

// ── caminheiro de JSON (vive dentro do __NEXT_DATA__ e é tolerante) ──
function _artistas(obj) {
  const arrs = obj?.artists;
  const arr2 = Array.isArray(arrs) ? arrs : (arrs && Array.isArray(arrs.items) ? arrs.items : []);
  const nomes = (arr2 || []).map(a => a?.profile?.name || a?.name).filter(Boolean);
  return nomes.join(', ');
}

function vasculharFaixas(obj, saco, profundidade = 0) {
  if (!obj || typeof obj !== 'object' || profundidade > 14 || saco.length > 300) return;
  if (Array.isArray(obj)) {
    for (const it of obj) vasculharFaixas(it, saco, profundidade + 1);
    return;
  }
  // estilo faixa spotify (NEXT): uid/url uri spotify:track: + name + artists
  const nome = obj.name && String(obj.name);
  const artista = _artistas(obj);
  if (nome && artista && (obj.duration || obj.durationMs || obj.trackDuration || obj.uri || obj.url)) {
    const f = _faixa(nome, artista, obj.uri || '');
    if (f) saco.push(f);
  }
  for (const v of Object.values(obj)) {
    if (saco.length > 300) break;
    if (v && typeof v === 'object') vasculharFaixas(v, saco, profundidade + 1);
  }
}

/** Extrai __NEXT_DATA__/estado embebido e devolve { nome, faixas }. */
function colecaoDoHtml(html) {
  const saco = [];
  let nome = '';
  try {
    const m = String(html || '').match(/<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
    if (m) {
      const j = JSON.parse(m[1]);
      // v8.3: a página EMBED (open.spotify.com/embed/<tipo>/<id>) traz o
      // trackList completo: [{title, subtitle}] — a página normal, desde
      // o redesign, é só a shell do Web Player (sem dados).
      const enf = j?.props?.pageProps?.state?.data?.entity;
      const tl = enf?.trackList || enf?.children?.toplevelItems
        || j?.props?.pageProps?.state?.data?.trackList;
      if (Array.isArray(tl) && tl.length && tl[0]?.title) {
        for (const t of tl) {
          const f = _faixa(t.title, t.subtitle || '', (t.uri || '').replace('spotify:track:', ''));
          if (f) saco.push(f);
          if (saco.length > 200) break;
        }
        if (!nome) nome = enf?.title || enf?.name || j?.props?.pageProps?.state?.data?.name || '';
      } else {
        try {
          const stk = [j?.props?.pageProps?.state?.data?.entity, j];
          for (const s of stk) {
            const cand = s?.name || s?.data?.name || '';
            if (cand && typeof cand === 'string') { nome = cand; break; }
          }
        } catch {}
        vasculharFaixas(j, saco);
      }
    }
  } catch {}
  if (!saco.length) {
    // queda-último: pares "name":"X","artists":[{"name":"A"}] no HTML cru
    for (const mm of String(html || '').matchAll(/"name":"([^"\\]{2,80})"\s*,?\s*"artists":\s*\[\s*\{[^}]*?"name":"([^"\\]{2,60})"/g)) {
      const f = _faixa(mm[1], mm[2]);
      if (f) saco.push(f);
      if (saco.length > 200) break;
    }
    const t = String(html).match(/<title>([^<]{2,120})<\/title>/i);
    if (t && !nome) nome = t[1].replace(/\s*\|\s*Spotify.*$/i, '').trim();
  }
  return { nome, faixas: normalizarFaixas(saco) };
}

// ── Resolução oficial da colecção ───────────────────────────────
/**
 * Lê apenas páginas oficiais open.spotify.com. O embed é o formato de
 * partilha do próprio Spotify e contém o trackList público para álbuns e
 * playlists. Injecção `fetchHtml` existe para testes, sem fontes terceiras.
 */
async function colecaoSpotify(url, { tipo, id } = {}, opts = {}) {
  if (!TIPOS_COLECAO.has(tipo) || !id) throw new Error('Link Spotify de álbum ou playlist inválido.');
  const fHtml = opts.fetchHtml || (async (u) => {
    const b = await require('./mediaHandler').fetchBuffer(u, 5, {
      headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36' },
      timeout: 30000,
    });
    return b ? String(b) : '';
  });

  try {
    const html = await fHtml(`https://open.spotify.com/embed/${tipo}/${id}`);
    const r = colecaoDoHtml(html);
    if (r.faixas.length) return { ...r, fonte: 'open.spotify.com' };
  } catch {}

  // A página canónica ainda pode disponibilizar a lista em algumas regiões.
  try {
    const html = await fHtml(`https://open.spotify.com/${tipo}/${id}`);
    const r = colecaoDoHtml(html);
    if (r.faixas.length) return { ...r, fonte: 'open.spotify.com' };
  } catch {}

  throw new Error('Não consegui ler essa colecção oficial do Spotify; ela pode ser privada ou estar indisponível.');
}

module.exports = {
  NIVEIS, nivelDoComando, isOfficialSpotifyUrl, parseSpotifyLink,
  TIPOS_COLECAO, TIPOS_BLOQUEIO,
  normalizarFaixas, colecaoDoHtml, colecaoSpotify,
  MAX_FAIXAS: 20,
};
