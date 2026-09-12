/**
 * DARK BOT v7.30 — C∆P (Capture) ENGINE
 * ─────────────────────────────────────────────────────────────
 * Monitoriza perfis de redes sociais (fase 1: Instagram) e captura
 * automaticamente posts, reels, carrosséis, textos e stories.
 *
 *  • Alvos configuráveis (plataforma + username)
 *  • Verificação periódica (padrão 30 min) — só baixa o que é NOVO
 *  • Detecta se baixou ou não (tamanho, mimetype, erro) e regista log
 *  • Destinos: grupos/PV/canal do WhatsApp + galeria em disco
 *  • "Capture all": baixa tudo o que está disponível do perfil
 *  • Stories: só com sessão IG (cap login <sessionid>) — degrada com aviso
 *
 * Estado persistido em data/cap/cap.json (+ espelho em BotConfig quando
 * a BD está ligada).  Nenhum segredo vai para ficheiros versionados —
 * data/ está no .gitignore.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

const DATA_DIR = path.join(__dirname, '../../data/cap');
const STATE_FILE = path.join(DATA_DIR, 'cap.json');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const IG_APP_ID = '936619743392459';
const DEFAULT_INTERVAL_MIN = 30;
const MAX_LOG = 200;
const MAX_SEEN_PER_TARGET = 2000;

// ─────────────────────────────────────────────────────────────
// ESTADO
// ─────────────────────────────────────────────────────────────
const state = {
  targets: {},      // key "ig:veigh" → { platform, username, destinos:[jid], guardar, auto, intervaloMin, lastCheck, addedBy, addedAt, userId, stats }
  seen: {},         // key → { [itemId]: ts }
  log: [],          // { ts, target, item, tipo, status:'baixado'|'falhou'|'enviado'|'erro', detalhe }
  session: { ig: '' },
};
let _loaded = false;

function ensureDir(p) { try { fs.mkdirSync(p, { recursive: true }); } catch {} }

function load() {
  if (_loaded) return state;
  _loaded = true;
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      Object.assign(state, { targets: {}, seen: {}, log: [], session: { ig: '' } }, raw);
    }
  } catch (e) { console.warn('[CAP] estado corrompido, a recomeçar:', e.message); }
  return state;
}

let _saveTimer = null;
function save() {
  ensureDir(DATA_DIR);
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 1)); } catch (e) { console.warn('[CAP] save:', e.message); }
  // espelho em BotConfig (best-effort, sem bloquear)
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    try {
      const BotConfig = require('../database/models/BotConfig');
      BotConfig.set('cap_state', { targets: state.targets, session: state.session }).catch(() => {});
    } catch {}
  }, 500);
}

async function arrancar() {
  load();
  // se o disco estiver vazio mas a BD tiver espelho, restaura alvos/sessão
  if (!Object.keys(state.targets).length) {
    try {
      const BotConfig = require('../database/models/BotConfig');
      const mirror = await BotConfig.get('cap_state', null);
      if (mirror?.targets) { state.targets = mirror.targets; state.session = mirror.session || state.session; save(); }
    } catch {}
  }
  carregarEnv();
  return state;
}

function _reset() {
  state.targets = {}; state.seen = {}; state.log = []; state.session = { ig: '', igPool: [] };
  _loaded = true;
}

// ─────────────────────────────────────────────────────────────
// HTTP
// ─────────────────────────────────────────────────────────────
// Proxy opcional: CAP_PROXY=http://user:pass@host:port (ou HTTPS_PROXY). Usado só para o Instagram.
let _proxyAgent = null; let _proxyTried = false;
function proxyAgent() {
  if (_proxyTried) return _proxyAgent; _proxyTried = true;
  const p = process.env.CAP_PROXY || process.env.HTTPS_PROXY || process.env.https_proxy || '';
  if (!p) return null;
  try { const { HttpsProxyAgent } = require('https-proxy-agent'); _proxyAgent = new HttpsProxyAgent(p); console.log('[CAP] proxy activo'); }
  catch { console.warn('[CAP] CAP_PROXY definido mas pacote https-proxy-agent não instalado (npm i https-proxy-agent)'); }
  return _proxyAgent;
}
function httpGet(url, { headers = {}, timeout = 25000, redirects = 5, proxy = true } = {}) {
  return new Promise((resolve, reject) => {
    const ag = proxy && /instagram\.com/.test(url) ? proxyAgent() : null;
    const req = https.get(url, { headers: { 'User-Agent': UA, ...headers }, timeout, ...(ag ? { agent: ag } : {}) }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
        const next = res.headers.location.startsWith('http') ? res.headers.location : new URL(res.headers.location, url).href;
        res.resume();
        return httpGet(next, { headers, timeout, redirects: redirects - 1 }).then(resolve, reject);
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// ── Sessões IG: pool (state.session.igPool = [{sid, user, ok, addedAt, lastErr}]) + compat state.session.ig ──
const UAS = [
  UA,
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
];
let _rr = 0;
function sessionsAtivas() {
  const pool = Array.isArray(state.session?.igPool) ? state.session.igPool : [];
  const list = pool.filter(s => s && s.sid && s.ok !== false);
  if (!list.length && state.session?.ig) list.push({ sid: state.session.ig, user: '' });
  return list;
}
function pickSession() { const l = sessionsAtivas(); if (!l.length) return null; return l[(_rr++) % l.length]; }
function igHeaders(sess) {
  const h = { 'x-ig-app-id': IG_APP_ID, 'Accept': '*/*', 'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8', 'Referer': 'https://www.instagram.com/', 'User-Agent': UAS[_rr % UAS.length], 'X-Requested-With': 'XMLHttpRequest' };
  const s = sess === undefined ? pickSession() : sess;
  const sid = String(s?.sid || '').trim();
  if (sid) h.Cookie = `sessionid=${sid}; ds_user_id=${sid.split('%3A')[0].split(':')[0]}`;
  return h;
}
function marcarSessaoInvalida(sid, motivo) {
  const pool = Array.isArray(state.session?.igPool) ? state.session.igPool : [];
  const s = pool.find(x => x.sid === sid);
  if (s) { s.ok = false; s.lastErr = motivo; s.errAt = Date.now(); }
  if (state.session.ig === sid) state.session.ig = '';
  registar({ target: '-', item: '-', tipo: 'sessao', status: 'erro', detalhe: `sessão ${s?.user || sid.slice(0, 8)} inválida: ${motivo}` });
  save();
}
// Valida um sessionid: devolve { ok, user, id } ou { ok:false, erro }
async function validarSessao(sid) {
  const sess = { sid: String(sid || '').trim() };
  if (!sess.sid || sess.sid.length < 20) return { ok: false, erro: 'sessionid demasiado curto' };
  try {
    const r = await httpGet('https://www.instagram.com/api/v1/accounts/current_user/?edit=true', { headers: igHeaders(sess), timeout: 20000 });
    if (r.status === 200) {
      let j; try { j = JSON.parse(r.body.toString('utf8')); } catch { return { ok: false, erro: 'resposta inválida' }; }
      const u = j?.user; if (u?.username) return { ok: true, user: u.username, id: String(u.pk || u.id || '') };
      return { ok: false, erro: 'sem utilizador na resposta' };
    }
    if (r.status === 401 || r.status === 403) return { ok: false, erro: 'sessionid inválido ou expirado (' + r.status + ')' };
    if (r.status === 429) return { ok: false, erro: 'rate-limit 429 ao validar — tenta daqui a uns minutos', temporario: true };
    return { ok: false, erro: 'HTTP ' + r.status };
  } catch (e) { return { ok: false, erro: e.message, temporario: true }; }
}
async function addSessao(sid, { validar = true } = {}) {
  load();
  state.session.igPool = Array.isArray(state.session.igPool) ? state.session.igPool : [];
  let info = { ok: true, user: '', id: '' };
  if (validar) { info = await validarSessao(sid); if (!info.ok && !info.temporario) return info; }
  const ex = state.session.igPool.find(x => x.sid === sid);
  if (ex) Object.assign(ex, { ok: true, user: info.user || ex.user, lastErr: '' });
  else state.session.igPool.push({ sid: String(sid).trim(), user: info.user || '', id: info.id || '', ok: true, addedAt: Date.now() });
  state.session.ig = String(sid).trim();
  save();
  return { ok: true, user: info.user, id: info.id, validado: !info.temporario, aviso: info.temporario ? info.erro : '' };
}
function delSessao(qual) {
  load();
  const pool = Array.isArray(state.session.igPool) ? state.session.igPool : [];
  const before = pool.length;
  state.session.igPool = qual && qual !== 'all' && qual !== 'tudo' ? pool.filter(x => x.user !== String(qual).replace(/^@/, '') && x.sid !== qual) : [];
  if (!state.session.igPool.some(x => x.sid === state.session.ig)) state.session.ig = state.session.igPool[0]?.sid || '';
  save();
  return before - state.session.igPool.length;
}
function listSessoes() { load(); return (Array.isArray(state.session.igPool) ? state.session.igPool : []).map(s => ({ user: s.user, ok: s.ok !== false, lastErr: s.lastErr || '', addedAt: s.addedAt })); }
// arranque: carregar IG_SESSIONID do .env se não houver nenhuma
function carregarEnv() {
  const env = String(process.env.IG_SESSIONID || '').trim();
  if (env && !sessionsAtivas().length) { state.session.igPool = [{ sid: env, user: '', ok: true, addedAt: Date.now(), fonte: 'env' }]; state.session.ig = env; }
}

// ─────────────────────────────────────────────────────────────
// INSTAGRAM PROVIDER
// ─────────────────────────────────────────────────────────────
function normUser(u) { return String(u || '').trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/[\/?#].*$/, '').toLowerCase(); }

function nodeToItem(n, username) {
  const caption = n.edge_media_to_caption?.edges?.[0]?.node?.text || n.caption?.text || '';
  const ts = (n.taken_at_timestamp || n.taken_at || 0) * 1000;
  const medias = [];
  const children = n.edge_sidecar_to_children?.edges;
  if (children && children.length) {
    for (const { node: c } of children) medias.push({ url: c.is_video ? (c.video_url || c.display_url) : c.display_url, isVideo: !!c.is_video && !!c.video_url });
  } else if (n.carousel_media) {
    for (const c of n.carousel_media) {
      const v = c.video_versions?.[0]?.url; const i = c.image_versions2?.candidates?.[0]?.url;
      medias.push({ url: v || i, isVideo: !!v });
    }
  } else {
    const v = n.video_url || n.video_versions?.[0]?.url;
    const i = n.display_url || n.image_versions2?.candidates?.[0]?.url;
    medias.push({ url: v || i, isVideo: !!v });
  }
  const shortcode = n.shortcode || n.code || String(n.id || n.pk);
  const type = n.product_type === 'clips' || (medias.length === 1 && medias[0].isVideo) ? 'reel' : medias.length > 1 ? 'carrossel' : medias[0]?.isVideo ? 'video' : 'post';
  return {
    id: `p_${shortcode}`, shortcode, tipo: type, ts, caption,
    link: `https://www.instagram.com/p/${shortcode}/`,
    medias: medias.filter(m => m.url), username,
  };
}

const IG_HOSTS = ['https://www.instagram.com', 'https://i.instagram.com'];
let _hostIdx = 0;
// GET com rotação de host/UA/sessão e retry em 429 (backoff curto). Marca sessão inválida em login_required.
async function igGet(pathAndQuery, { tentativas = 3 } = {}) {
  let last = null;
  for (let i = 0; i < tentativas; i++) {
    const sess = pickSession();
    const host = IG_HOSTS[(_hostIdx++) % IG_HOSTS.length];
    const r = await httpGet(host + pathAndQuery, { headers: igHeaders(sess) });
    last = r;
    if (r.status === 200) return r;
    const body = r.body?.toString('utf8').slice(0, 300) || '';
    if (sess && (r.status === 401 || r.status === 403) && /login_required|logged out|checkpoint/i.test(body)) { marcarSessaoInvalida(sess.sid, 'login_required'); continue; }
    if (r.status === 429 || (r.status === 401 && /wait a few minutes/i.test(body))) { await new Promise(res => setTimeout(res, 1500 * (i + 1))); continue; }
    return r;
  }
  return last;
}

async function igProfile(username) {
  const u = normUser(username);
  const r = await igGet(`/api/v1/users/web_profile_info/?username=${encodeURIComponent(u)}`);
  if (r.status === 404) throw new Error(`Perfil @${u} não existe`);
  if (r.status === 429) throw new Error(`Instagram respondeu HTTP 429 — IP do servidor limitado${sessionsAtivas().length ? ' (mesmo com sessão; define CAP_PROXY no .env ou espera 30-60 min)' : '. Faz cap login <sessionid> (limite muito maior) ou define CAP_PROXY no .env'}`);
  if (r.status !== 200) throw new Error(`Instagram respondeu HTTP ${r.status}${r.status === 401 || r.status === 403 ? ' (rate-limit/login)' : ''}`);
  let j; try { j = JSON.parse(r.body.toString('utf8')); } catch { throw new Error('Resposta do Instagram não é JSON (bloqueio temporário?)'); }
  const d = j?.data?.user;
  if (!d) throw new Error(`Perfil @${u} indisponível`);
  const edges = d.edge_owner_to_timeline_media?.edges || [];
  return {
    id: d.id, username: u, nome: d.full_name, bio: d.biography || '', privado: !!d.is_private,
    seguidores: d.edge_followed_by?.count || 0, seguindo: d.edge_follow?.count || 0, posts: d.edge_owner_to_timeline_media?.count || 0,
    highlights: d.highlight_reel_count || 0, temReels: !!d.has_clips,
    foto: d.profile_pic_url_hd || d.profile_pic_url || '',
    items: edges.map(e => nodeToItem(e.node, u)).sort((a, b) => a.ts - b.ts),
    hasMore: !!d.edge_owner_to_timeline_media?.page_info?.has_next_page,
    endCursor: d.edge_owner_to_timeline_media?.page_info?.end_cursor || '',
  };
}

// Paginação completa — só funciona com sessão; sem sessão devolve [] silenciosamente.
async function igFeedAll(userId, username, maxPages = 15) {
  if (!sessionsAtivas().length) return { items: [], needsLogin: true };
  const out = []; let maxId = '';
  for (let i = 0; i < maxPages; i++) {
    const r = await igGet(`/api/v1/feed/user/${userId}/?count=33${maxId ? `&max_id=${encodeURIComponent(maxId)}` : ''}`);
    if (r.status !== 200) break;
    let j; try { j = JSON.parse(r.body.toString('utf8')); } catch { break; }
    const items = j.items || [];
    if (!items.length) break;
    for (const it of items) out.push(nodeToItem(it, username));
    if (!j.more_available || !j.next_max_id) break;
    maxId = j.next_max_id;
    await new Promise(r => setTimeout(r, 1200));
  }
  return { items: out.sort((a, b) => a.ts - b.ts), needsLogin: false };
}

async function igStories(userId, username) {
  if (!sessionsAtivas().length) return { items: [], needsLogin: true };
  const r = await igGet(`/api/v1/feed/reels_media/?reel_ids=${userId}`);
  if (r.status !== 200) return { items: [], needsLogin: r.status === 401 || r.status === 403, error: `HTTP ${r.status}` };
  let j; try { j = JSON.parse(r.body.toString('utf8')); } catch { return { items: [], error: 'JSON' }; }
  const reel = j.reels?.[userId] || j.reels_media?.[0];
  const items = (reel?.items || []).map(s => {
    const v = s.video_versions?.[0]?.url; const i = s.image_versions2?.candidates?.[0]?.url;
    return { id: `s_${s.pk || s.id}`, shortcode: String(s.pk || s.id), tipo: 'story', ts: (s.taken_at || 0) * 1000, caption: s.caption?.text || '', link: `https://www.instagram.com/stories/${username}/${s.pk || s.id}/`, medias: [{ url: v || i, isVideo: !!v }], username, expira: (s.expiring_at || 0) * 1000 };
  }).filter(s => s.medias[0].url);
  return { items, needsLogin: false };
}

async function igHighlights(userId, username) {
  if (!sessionsAtivas().length) return { items: [], needsLogin: true };
  const r = await igGet(`/api/v1/highlights/${userId}/highlights_tray/`);
  if (r.status !== 200) return { items: [], needsLogin: r.status === 401 || r.status === 403 || r.status === 302, error: `HTTP ${r.status}` };
  let j; try { j = JSON.parse(r.body.toString('utf8')); } catch { return { items: [], error: 'JSON' }; }
  const trays = j.tray || [];
  const items = [];
  for (const tr of trays.slice(0, 20)) {
    const rid = String(tr.id || '').replace('highlight:', '');
    const rr = await igGet(`/api/v1/feed/reels_media/?reel_ids=highlight%3A${rid}`).catch(() => null);
    if (!rr || rr.status !== 200) continue;
    let jj; try { jj = JSON.parse(rr.body.toString('utf8')); } catch { continue; }
    const reel = jj.reels?.[`highlight:${rid}`] || jj.reels_media?.[0];
    for (const s of reel?.items || []) {
      const v = s.video_versions?.[0]?.url; const i = s.image_versions2?.candidates?.[0]?.url;
      if (v || i) items.push({ id: `h_${s.pk || s.id}`, shortcode: String(s.pk || s.id), tipo: 'highlight', ts: (s.taken_at || 0) * 1000, caption: tr.title || '', link: `https://www.instagram.com/stories/highlights/${rid}/`, medias: [{ url: v || i, isVideo: !!v }], username });
    }
    await new Promise(r => setTimeout(r, 600));
  }
  return { items, needsLogin: false, albuns: trays.map(t => t.title) };
}

const PROVIDERS = {
  ig: { nome: 'Instagram', profile: igProfile, feedAll: igFeedAll, stories: igStories, highlights: igHighlights, normUser },
};

// ─────────────────────────────────────────────────────────────
// DOWNLOAD + VERIFICAÇÃO
// ─────────────────────────────────────────────────────────────
function sniffMime(buf, fallbackVideo) {
  if (!buf || buf.length < 12) return '';
  if (buf[0] === 0xFF && buf[1] === 0xD8) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
  if (buf.slice(4, 8).toString() === 'ftyp') return 'video/mp4';
  if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'image/webp';
  if (buf.slice(0, 3).toString() === 'GIF') return 'image/gif';
  return fallbackVideo ? 'video/mp4' : '';
}

// Fallback: yt-dlp resolve um post/reel pelo link mesmo quando o IP está em 429 na API web
async function ytdlpItem(link) {
  const { execFile } = require('child_process');
  const run = (bin, args) => new Promise((res, rej) => execFile(bin, args, { timeout: 60000, maxBuffer: 20 * 1024 * 1024 }, (e, out, err) => e ? rej(new Error((err || e.message).split('\n')[0].slice(0, 120))) : res(out)));
  const args = ['-j', '--no-warnings', '--no-playlist', link];
  let out;
  try { out = await run('yt-dlp', args); } catch (e1) { try { out = await run('python3', ['-m', 'yt_dlp', ...args]); } catch (e2) { throw new Error('yt-dlp: ' + e2.message); } }
  const j = JSON.parse(out.trim().split('\n')[0]);
  const url = j.url || (j.formats || []).filter(f => f.url && (f.vcodec !== 'none' || f.ext === 'mp4')).sort((a, b) => (b.height || 0) - (a.height || 0))[0]?.url || j.thumbnail;
  if (!url) throw new Error('yt-dlp sem URL');
  return { url, isVideo: !/\.(jpe?g|png|webp)(\?|$)/i.test(url) && j.ext !== 'jpg', caption: j.description || '', ts: (j.timestamp || 0) * 1000, uploader: j.channel || j.uploader_id || '' };
}

async function baixarMedia(m) {
  const r = await httpGet(m.url, { timeout: 90000, headers: { Referer: 'https://www.instagram.com/' } });
  if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
  const buf = r.body;
  if (!buf || buf.length < 1024) throw new Error(`ficheiro vazio (${buf?.length || 0} bytes)`);
  const mime = sniffMime(buf, m.isVideo) || (r.headers['content-type'] || '').split(';')[0];
  if (!/^(image|video)\//.test(mime)) throw new Error(`tipo inválido: ${mime || '?'}`);
  if (buf.length > 95 * 1024 * 1024) throw new Error('ficheiro > 95 MB');
  return { buffer: buf, mime, bytes: buf.length, isVideo: mime.startsWith('video/') };
}

function extFor(mime) { return mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : mime === 'image/gif' ? 'gif' : mime.startsWith('video/') ? 'mp4' : 'jpg'; }

function guardarNoDisco(key, item, idx, file) {
  const dir = path.join(DATA_DIR, key.replace(/[^a-z0-9_.-]/gi, '_'));
  ensureDir(dir);
  const d = new Date(item.ts || Date.now());
  const stamp = isNaN(d) ? 'sem-data' : d.toISOString().slice(0, 10);
  const name = `${stamp}_${item.tipo}_${item.shortcode}${item.medias.length > 1 ? `_${idx + 1}` : ''}.${extFor(file.mime)}`;
  const full = path.join(dir, name);
  fs.writeFileSync(full, file.buffer);
  if (item.caption && idx === 0) { try { fs.writeFileSync(full.replace(/\.[a-z0-9]+$/, '.txt'), `${item.link}\n\n${item.caption}\n`); } catch {} }
  return full;
}

function listarGaleria(key) {
  const dir = path.join(DATA_DIR, key.replace(/[^a-z0-9_.-]/gi, '_'));
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => !f.endsWith('.txt')).sort().reverse().map(f => ({ nome: f, path: path.join(dir, f), bytes: fs.statSync(path.join(dir, f)).size }));
}

// ─────────────────────────────────────────────────────────────
// LOG
// ─────────────────────────────────────────────────────────────
function registar(entry) {
  state.log.unshift({ ts: Date.now(), ...entry });
  if (state.log.length > MAX_LOG) state.log.length = MAX_LOG;
}

function marcarVisto(key, id) {
  state.seen[key] = state.seen[key] || {};
  state.seen[key][id] = Date.now();
  const ids = Object.keys(state.seen[key]);
  if (ids.length > MAX_SEEN_PER_TARGET) for (const old of ids.slice(0, ids.length - MAX_SEEN_PER_TARGET)) delete state.seen[key][old];
}
function jaVisto(key, id) { return !!state.seen[key]?.[id]; }

// ─────────────────────────────────────────────────────────────
// ALVOS
// ─────────────────────────────────────────────────────────────
function keyOf(platform, username) { return `${platform}:${PROVIDERS[platform] ? PROVIDERS[platform].normUser(username) : String(username).toLowerCase()}`; }

function parseTargetArg(arg) {
  // aceita "veigh", "@veigh", "ig:veigh", "instagram.com/veigh"
  let platform = 'ig'; let user = String(arg || '');
  const m = user.match(/^(ig|insta|instagram|tt|tiktok|x|twitter|fb|facebook):(.+)$/i);
  if (m) { platform = { insta: 'ig', instagram: 'ig', tiktok: 'tt', twitter: 'x', facebook: 'fb' }[m[1].toLowerCase()] || m[1].toLowerCase(); user = m[2]; }
  else if (/tiktok\.com/i.test(user)) platform = 'tt';
  else if (/(twitter|x)\.com/i.test(user)) platform = 'x';
  return { platform, username: PROVIDERS[platform] ? PROVIDERS[platform].normUser(user) : user.replace(/^@/, '').toLowerCase() };
}

function getTarget(arg) { const { platform, username } = parseTargetArg(arg); return state.targets[keyOf(platform, username)] || null; }

function addTarget(arg, { destino, addedBy } = {}) {
  load();
  const { platform, username } = parseTargetArg(arg);
  if (!PROVIDERS[platform]) throw new Error(`Plataforma "${platform}" ainda não suportada (fase 1: Instagram)`);
  if (!username || !/^[a-z0-9._]{1,30}$/.test(username)) throw new Error('Username inválido');
  const key = keyOf(platform, username);
  const existente = state.targets[key];
  const t = existente || {
    key, platform, username, destinos: [], guardar: true, auto: true, stories: true,
    intervaloMin: DEFAULT_INTERVAL_MIN, lastCheck: 0, addedBy: addedBy || '', addedAt: Date.now(), userId: '',
    stats: { baixados: 0, falhados: 0, enviados: 0 }, primed: false,
  };
  if (destino && !t.destinos.includes(destino)) t.destinos.push(destino);
  state.targets[key] = t;
  save();
  return { target: t, novo: !existente };
}

function delTarget(arg) { load(); const { platform, username } = parseTargetArg(arg); const key = keyOf(platform, username); const had = !!state.targets[key]; delete state.targets[key]; save(); return had; }
function listTargets() { load(); return Object.values(state.targets); }
function setTargetOpt(arg, patch) { const t = getTarget(arg); if (!t) throw new Error('Alvo não encontrado'); Object.assign(t, patch); save(); return t; }
function setSession(platform, value) { load(); if (!value) { state.session.ig = ''; state.session.igPool = []; } else { state.session.igPool = [{ sid: String(value).trim(), user: '', ok: true, addedAt: Date.now() }]; state.session.ig = String(value).trim(); } save(); }
function hasSession(platform = 'ig') { load(); return sessionsAtivas().length > 0; }

// ─────────────────────────────────────────────────────────────
// ENVIO PARA WHATSAPP
// ─────────────────────────────────────────────────────────────
function legenda(t, item, idx, total) {
  const prov = PROVIDERS[t.platform]?.nome || t.platform;
  const tipo = { reel: '🎬 Reel', video: '🎬 Vídeo', carrossel: '🖼️ Carrossel', post: '📸 Post', story: '⏳ Story', highlight: '⭐ Highlight' }[item.tipo] || '📎';
  const data = item.ts ? new Date(item.ts).toLocaleString('pt-PT', { timeZone: 'Africa/Luanda' }) : '';
  const parte = total > 1 ? ` (${idx + 1}/${total})` : '';
  const cap = item.caption ? `\n\n${item.caption.slice(0, 900)}${item.caption.length > 900 ? '…' : ''}` : '';
  return `╭─ C∆P · ${prov}\n│ @${t.username} · ${tipo}${parte}\n│ 📅 ${data}\n╰─ 🔗 ${item.link}${cap}`;
}

async function enviarItem(sock, t, item, files, destinos) {
  let ok = 0, fail = 0;
  for (const jid of destinos) {
    try {
      if (!files.length) {
        await sock.sendMessage(jid, { text: legenda(t, item, 0, 1) });
      } else {
        for (let i = 0; i < files.length; i++) {
          const f = files[i];
          const caption = i === 0 ? legenda(t, item, i, files.length) : (files.length > 1 ? `@${t.username} · ${i + 1}/${files.length}` : '');
          const content = f.isVideo ? { video: f.buffer, mimetype: 'video/mp4', caption } : { image: f.buffer, caption };
          const res = await sock.sendMessage(jid, content);
          if (!res?.key) throw new Error('sem confirmação de envio');
        }
      }
      ok++;
      registar({ target: t.key, item: item.shortcode, tipo: item.tipo, status: 'enviado', detalhe: jid });
    } catch (e) {
      fail++;
      registar({ target: t.key, item: item.shortcode, tipo: item.tipo, status: 'erro', detalhe: `envio ${jid}: ${e.message?.slice(0, 80)}` });
    }
  }
  return { ok, fail };
}

// Processa 1 item: baixa todas as medias, verifica, guarda, envia, marca visto.
async function processarItem(sock, t, item, { destinos, guardar = t.guardar, forcar = false } = {}) {
  if (!forcar && jaVisto(t.key, item.id)) return { skipped: true };
  const files = []; const erros = [];
  for (let i = 0; i < item.medias.length; i++) {
    try {
      let f;
      try { f = await baixarMedia(item.medias[i]); }
      catch (e0) {
        // fallback yt-dlp (só faz sentido para a 1.ª media / reels; carrosséis só devolvem 1 item)
        if (i === 0 && item.link && /instagram\.com\/(p|reel|tv)\//.test(item.link)) {
          const alt = await ytdlpItem(item.link);
          f = await baixarMedia({ url: alt.url, isVideo: alt.isVideo });
          f.viaYtdlp = true;
        } else throw e0;
      }
      files.push(f);
      if (guardar) { try { f.path = guardarNoDisco(t.key, item, i, f); } catch (e) { erros.push(`disco: ${e.message}`); } }
    } catch (e) { erros.push(`media ${i + 1}: ${e.message}`); }
  }
  const baixou = files.length > 0 && files.length === item.medias.length;
  const parcial = files.length > 0 && !baixou;
  t.stats = t.stats || { baixados: 0, falhados: 0, enviados: 0 };
  if (baixou || parcial) { t.stats.baixados++; registar({ target: t.key, item: item.shortcode, tipo: item.tipo, status: parcial ? 'parcial' : 'baixado', detalhe: `${files.length}/${item.medias.length} · ${(files.reduce((a, f) => a + f.bytes, 0) / 1048576).toFixed(1)} MB${erros.length ? ' · ' + erros.join('; ') : ''}` }); }
  else { t.stats.falhados++; registar({ target: t.key, item: item.shortcode, tipo: item.tipo, status: 'falhou', detalhe: erros.join('; ') || 'sem media' }); }

  let envio = { ok: 0, fail: 0 };
  const dest = destinos || t.destinos || [];
  // envia só se há media baixada, ou se o item é texto puro (sem media); falha total → só log
  const textoPuro = item.medias.length === 0 && !!item.caption;
  if (sock && dest.length && (files.length || textoPuro)) {
    envio = await enviarItem(sock, t, item, files, dest);
    t.stats.enviados += envio.ok;
  }
  // marca visto mesmo se falhou o download (evita loop); falhas ficam no log
  marcarVisto(t.key, item.id);
  save();
  return { skipped: false, baixou, parcial, files: files.length, total: item.medias.length, erros, envio, bytes: files.reduce((a, f) => a + f.bytes, 0) };
}

// ─────────────────────────────────────────────────────────────
// VERIFICAÇÃO DE UM ALVO
// ─────────────────────────────────────────────────────────────
async function verificarAlvo(sock, t, { forcar = false, incluirStories = t.stories !== false } = {}) {
  const prov = PROVIDERS[t.platform];
  if (!prov) throw new Error('provider inexistente');
  const res = { alvo: t.key, novos: 0, baixados: 0, falhados: 0, enviados: 0, stories: 0, storiesNeedLogin: false, erro: null, perfil: null };
  try {
    const perfil = await prov.profile(t.username);
    t.userId = perfil.id; t.nome = perfil.nome; t.privado = perfil.privado; t.totalPosts = perfil.posts;
    res.perfil = perfil;
    if (perfil.privado && !sessionsAtivas().length) { res.erro = 'perfil privado — requer login'; t.lastCheck = Date.now(); save(); return res; }

    let items = perfil.items;
    if (incluirStories) {
      const st = await prov.stories(perfil.id, t.username).catch(e => ({ items: [], error: e.message }));
      res.storiesNeedLogin = !!st.needsLogin;
      items = items.concat(st.items || []);
    }

    // 1.ª verificação: por defeito NÃO despeja o histórico todo — só marca como visto
    // (o utilizador usa `cap all` para puxar tudo). Excepto se forcar.
    if (!t.primed && !forcar) {
      for (const it of items) marcarVisto(t.key, it.id);
      t.primed = true; t.lastCheck = Date.now(); save();
      res.primed = true; res.marcados = items.length;
      return res;
    }

    for (const it of items) {
      if (!forcar && jaVisto(t.key, it.id)) continue;
      res.novos++;
      const r = await processarItem(sock, t, it, { forcar });
      if (r.skipped) continue;
      if (r.baixou || r.parcial) res.baixados++; else res.falhados++;
      res.enviados += r.envio.ok;
      if (it.tipo === 'story') res.stories++;
      await new Promise(r => setTimeout(r, 800));
    }
    t.primed = true;
  } catch (e) {
    res.erro = e.message;
    registar({ target: t.key, item: '-', tipo: 'check', status: 'erro', detalhe: e.message?.slice(0, 120) });
  }
  t.lastCheck = Date.now(); t.lastResult = { ts: Date.now(), novos: res.novos, baixados: res.baixados, falhados: res.falhados, erro: res.erro };
  // backoff: rate-limit (429/401/403) → espera o dobro do intervalo antes de tentar de novo
  if (res.erro && /429|401|403|rate-limit|bloqueio/i.test(res.erro)) t.lastCheck = Date.now() + Math.max(5, t.intervaloMin || DEFAULT_INTERVAL_MIN) * 60000;
  save();
  return res;
}

// "Capture all": baixa tudo o que estiver acessível (12 sem login; tudo com sessão) e envia para destinos.
async function capturarTudo(sock, t, { destinos, limite = 200, onProgress } = {}) {
  const prov = PROVIDERS[t.platform];
  const perfil = await prov.profile(t.username);
  t.userId = perfil.id; t.nome = perfil.nome;
  let items = perfil.items;
  let completo = !perfil.hasMore;
  const full = await prov.feedAll(perfil.id, t.username).catch(() => ({ items: [], needsLogin: true }));
  if (full.items?.length > items.length) { items = full.items; completo = true; }
  const st = await prov.stories(perfil.id, t.username).catch(() => ({ items: [] }));
  items = items.concat(st.items || []);
  items = items.slice(-limite);
  const res = { total: items.length, baixados: 0, falhados: 0, enviados: 0, bytes: 0, completo, needsLogin: !!full.needsLogin, perfil };
  for (let i = 0; i < items.length; i++) {
    const r = await processarItem(sock, t, items[i], { destinos, forcar: true });
    if (r.baixou || r.parcial) res.baixados++; else res.falhados++;
    res.enviados += r.envio?.ok || 0; res.bytes += r.bytes || 0;
    if (onProgress && (i % 5 === 4 || i === items.length - 1)) { try { await onProgress(i + 1, items.length, res); } catch {} }
    await new Promise(r => setTimeout(r, 1000));
  }
  t.primed = true; t.lastCheck = Date.now(); save();
  return res;
}

// ─────────────────────────────────────────────────────────────
// SCHEDULER
// ─────────────────────────────────────────────────────────────
let _timer = null; let _running = false; let _getSock = null;
function start(getSock, tickMs = 60000) {
  _getSock = getSock; load();
  if (_timer) return;
  _timer = setInterval(tick, tickMs);
  console.log('🎯 C∆P scheduler iniciado');
}
function stop() { clearInterval(_timer); _timer = null; }

async function tick() {
  if (_running) return; _running = true;
  try {
    const sock = typeof _getSock === 'function' ? _getSock() : null;
    if (!sock) return;
    const now = Date.now();
    // aviso ao dono quando uma sessão ficou inválida (1x por sessão)
    const pool = Array.isArray(state.session?.igPool) ? state.session.igPool : [];
    for (const sx of pool) {
      if (sx.ok === false && !sx.avisado) {
        sx.avisado = true; save();
        const owner = String(process.env.OWNER_NUMBER || '').replace(/\D/g, '');
        if (owner) sock.sendMessage(`${owner}@s.whatsapp.net`, { text: `🔐 C∆P: a sessão Instagram${sx.user ? ' @' + sx.user : ''} expirou (${sx.lastErr || 'login_required'}).\nRefaz: cap login <sessionid>` }).catch(() => {});
      }
    }
    for (const t of Object.values(state.targets)) {
      if (!t.auto) continue;
      const iv = Math.max(5, t.intervaloMin || DEFAULT_INTERVAL_MIN) * 60000;
      if (now - (t.lastCheck || 0) < iv) continue;
      const r = await verificarAlvo(sock, t).catch(e => ({ erro: e.message }));
      if (r.novos || r.erro) console.log(`[CAP] ${t.key}: novos=${r.novos || 0} baixados=${r.baixados || 0} falhados=${r.falhados || 0}${r.erro ? ' erro=' + r.erro : ''}`);
    }
  } catch (e) { console.error('[CAP] tick:', e.message); }
  finally { _running = false; }
}

module.exports = {
  PROVIDERS, DATA_DIR, DEFAULT_INTERVAL_MIN,
  load, save, arrancar, _reset, state,
  parseTargetArg, keyOf, addTarget, delTarget, getTarget, listTargets, setTargetOpt, setSession, hasSession,
  validarSessao, addSessao, delSessao, listSessoes, sessionsAtivas, marcarSessaoInvalida, igGet, carregarEnv,
  igProfile, igFeedAll, igStories, igHighlights, nodeToItem, ytdlpItem, sniffMime, baixarMedia,
  processarItem, verificarAlvo, capturarTudo, listarGaleria, legenda,
  registar, jaVisto, marcarVisto,
  start, stop, tick,
};
