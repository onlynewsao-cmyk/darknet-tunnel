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
  state.UpdatedAt = Date.now();
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
  await sincronizar(true);
  carregarEnv();
  return state;
}

// ── v12.9.9: SYNC disco ↔ Mongo (o mais novo ganha) ─────────────────
// O dashboard e o bot podem correr em processos/containers diferentes;
// quem grava por último espelha em BotConfig e o outro lado adota.
let _syncAt = 0;
async function sincronizar(forcar = false) {
  if (!forcar && Date.now() - _syncAt < 60e3) return state;
  _syncAt = Date.now();
  try {
    const BotConfig = require('../database/models/BotConfig');
    const mirror = await BotConfig.get('cap_state', null);
    if (!mirror) return state;
    const tsM = Number(mirror.UpdatedAt || 0);
    const tsD = Number(state.UpdatedAt || 0);
    if (tsM > tsD && (mirror.targets || mirror.session)) {
      state.targets = mirror.targets || state.targets;
      state.session = mirror.session || state.session;
      state.UpdatedAt = tsM;
      try { fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 1)); } catch {}
      console.log('[CAP] sync: adoptado estado mais novo da BD (', new Date(tsM).toISOString(), ')');
    }
  } catch {}
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
function httpReq(method, url, { headers = {}, timeout = 25000, redirects = 5, proxy = true, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const ag = proxy && /instagram\.com/.test(url) ? proxyAgent() : null;
    let u; try { u = new URL(url); } catch { return reject(new Error('URL inválida')); }
    const req = https.request({
      hostname: u.hostname, path: u.pathname + u.search, method,
      headers: { 'User-Agent': UA, ...headers, ...(body ? { 'Content-Type': headers['Content-Type'] || 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) } : {}) },
      timeout, ...(ag ? { agent: ag } : {}),
    }, (res) => {
      if (method === 'GET' && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
        const next = res.headers.location.startsWith('http') ? res.headers.location : new URL(res.headers.location, url).href;
        res.resume();
        return httpReq('GET', next, { headers, timeout, redirects: redirects - 1 }).then(resolve, reject);
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (body) req.write(body);
    req.end();
  });
}
function httpGet(url, opts = {}) { return httpReq('GET', url, opts); }

// ── Sessões IG: pool (state.session.igPool = [{sid, user, ok, addedAt, lastErr}]) + compat state.session.ig ──
const UA_APP = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 311.0.0.109.115';

// v12.9.16 — CANAL DA APP: UA + headers da aplicação oficial (iPhone).
// PROVADO: reels_media e users/search passam SEMPRE; feed/user deu 200 mesmo
// com IP queimado quando usa estes headers (com UA web → 401 "wait a few minutes").
function igGetApp(pathAndQuery, sess) {
  const s = sess === undefined ? pickSession() : sess;
  const sid = String(s?.sid || '').trim();
  let cookie = String(s?.cookies || '').trim();
  if (cookie && !/sessionid=/i.test(cookie)) cookie = `sessionid=${sid}; ` + cookie;
  const h = {
    'User-Agent': UA_APP, 'Accept': '*/*', 'Accept-Language': 'pt-BR, pt;q=0.9',
    'X-IG-Capabilities': '3w==', 'X-IG-App-ID': '1217981644879628',
    'X-Requested-With': 'XMLHttpRequest',
  };
  if (sid) h.Cookie = cookie || `sessionid=${sid}; ds_user_id=${sid.split('%3A')[0].split(':')[0]}`;
  return httpGet(`https://i.instagram.com${pathAndQuery}`, { headers: h, timeout: 20000 });
}

// feed de posts via CANAL DA APP (o mesmo endpoint da app oficial com a tua sessão)
// → devolve { items, hasMore, nextMaxId }
async function feedViaApp(userId, username, count = 33, maxId = '') {
  const r = await igGetApp(`/api/v1/feed/user/${userId}/?count=${count}${maxId ? `&max_id=${encodeURIComponent(maxId)}` : ''}`);
  if (r.status !== 200) throw new Error('app HTTP ' + r.status);
  const j = JSON.parse(r.body.toString('utf8'));
  const raw = (j.items || []).length ? j.items : (j.profile_grid_items || []).map(g => g.media || g).filter(Boolean);
  const items = raw.map(it => { try { return nodeToItem(it, username); } catch { return null; } }).filter(x => x?.medias?.length && x.medias[0].url);
  return { items, hasMore: !!j.more_available, nextMaxId: j.next_max_id || '' };
}
const UAS = [
  UA_APP,  // v12.9.9: UA de app primeiro — endpoints /api/v1 tratam app-UA melhor
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
// v12.9.12 ANTI-DETECÇÃO: escolha ALEATÓRIA (ciclo fixo delata bot)
// + sessões em cooldown (429) evitadas durante 3-8 min
function _rand(a, b) { return a + Math.random() * (b - a); }
function pickSession() {
  const boas = sessionsAtivas().filter(s => !(s.coolAte > Date.now()));
  const list = boas.length ? boas : sessionsAtivas();
  if (!list.length) return null;
  return list[Math.floor(Math.random() * list.length)];
}
// ── v12.9.9: JAR COMPLETO de cookies (não só sessionid) ──────────────
// Aceita: export JSON do EditThisCookie/Cookie-Editor, header "k=v; k=v",
// ou "sessionid=xxx". Devolve { sid, jar } — jar é header canónico.
function normalizarCookies(entrada) {
  let raw = String(entrada || '').trim();
  if (!raw) return { sid: '', jar: '' };
  // JSON (EditThisCookie / Cookie-Editor)
  if (raw.startsWith('[') || raw.startsWith('{')) {
    try {
      const arr = JSON.parse(raw);
      const list = Array.isArray(arr) ? arr : [arr];
      const pairs = list.filter(x => x && x.name && x.value != null).map(x => `${x.name}=${x.value}`);
      if (pairs.length) raw = pairs.join('; ');
    } catch {}
  }
  const pairs = raw.split(';').map(s => s.trim()).filter(s => s.includes('='));
  const jar = [];
  let sid = '';
  for (const p of pairs) {
    const eq = p.indexOf('=');
    const k = p.slice(0, eq).trim();
    let v = p.slice(eq + 1).trim().replace(/^"|"$/g, '');
    if (!k || !v) continue;
    if (k.toLowerCase() === 'sessionid') {
      // canónico: %3A único (mesma regra do carregarEnv v12.9.5)
      let s = v;
      while (/%253A/i.test(s)) s = s.replace(/%253A/gi, '%3A');
      if (/:/.test(s) && !/%3A/i.test(s)) s = s.replace(/:/g, '%3A');
      if (/^\d{5,}%3A/.test(s)) { sid = s; jar.push(`sessionid=${s}`); }
      continue;
    }
    if (/^(domain|path|expires|max-age|httponly|secure|samesite)$/i.test(k)) continue;
    jar.push(`${k}=${v}`);
  }
  // sessionid seco (só o valor, sem k=) — ex: ".cap login 65803996170%3A…"
  if (!sid) {
    let s = String(entrada || '').trim().replace(/^sessionid=/i, '');
    while (/%253A/i.test(s)) s = s.replace(/%253A/gi, '%3A');
    if (/:/.test(s) && !/%3A/i.test(s)) s = s.replace(/:/g, '%3A');
    if (/^\d{5,}%3A[A-Za-z0-9_-]+%3A\d+%3A[A-Za-z0-9_-]+$/.test(s)) { sid = s; if (!jar.some(x => x.startsWith('sessionid='))) jar.unshift(`sessionid=${s}`); }
  }
  if (false && !sid && pairs.length === 1 && !/^[A-Za-z_]+\s*=/.test(raw)) {
    let s = raw;
    while (/%253A/i.test(s)) s = s.replace(/%253A/gi, '%3A');
    if (/:/.test(s) && !/%3A/i.test(s)) s = s.replace(/:/g, '%3A');
    if (/^\d{5,}%3A/.test(s)) { sid = s; jar.unshift(`sessionid=${s}`); }
  }
  return { sid, jar: jar.join('; ') };
}

function igHeaders(sess) {
  const h = { 'x-ig-app-id': IG_APP_ID, 'Accept': '*/*', 'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8', 'Referer': 'https://www.instagram.com/', 'User-Agent': UAS[_rr % UAS.length], 'X-Requested-With': 'XMLHttpRequest' };
  const s = sess === undefined ? pickSession() : sess;
  const sid = String(s?.sid || '').trim();
  if (sid) {
    // v12.9.9: jar completo quando existe (parece navegador real — menos 429)
    let cookie = String(s?.cookies || '').trim();
    if (cookie && !/sessionid=/i.test(cookie)) cookie = `sessionid=${sid}; ` + cookie;
    h.Cookie = cookie || `sessionid=${sid}; ds_user_id=${sid.split('%3A')[0].split(':')[0]}`;
  }
  return h;
}
// v12.9.11c: completar o @user de uma sessão por-confirmar (best-effort, async)
async function inferirUsername(sid) {
  const uid = String(sid || '').split('%3A')[0].split(':')[0].replace(/\D/g, '');
  if (!uid) return '';
  // 1. search pelo uid (alguns IPs deixam)
  try {
    const r = await httpGet(`https://i.instagram.com/api/v1/users/search/?q=${uid}`, { headers: igHeaders(pickSession()), timeout: 12000 });
    if (r.status === 200) {
      const j = JSON.parse(r.body.toString('utf8'));
      const hit = (j.users || []).find(x => String(x.pk) === uid);
      if (hit?.username) return hit.username;
    }
  } catch {}
  // 2. se o uid for um username numérico raro — nada mais a fazer sem rede
  return '';
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
      let j; try { j = JSON.parse(r.body.toString('utf8')); } catch { return { ok: false, erro: 'resposta não-JSON (challenge/HTML?) — adiada', temporario: true }; }
      const u = j?.user; if (u?.username) return { ok: true, user: u.username, id: String(u.pk || u.id || '') };
      return { ok: false, erro: 'sem utilizador na resposta' };
    }
    if (r.status === 401 || r.status === 403) {
      // v12.9.5: distinguir sid morto de IP bloqueado — o corpo diz qual
      const corpo = r.body.toString('utf8').slice(0, 200);
      if (/login_required|Sorry|erro|Try again/i.test(corpo) && !/bad_sessionid|invalid/i.test(corpo)) {
        // 403 com "Ocorreu um erro" = IG a bloquear o IP do servidor, não a sessão
        return { ok: false, erro: 'IP do servidor bloqueado pelo IG (' + r.status + ') — sessão provavelmente BOA; valida por outro caminho', temporario: true };
      }
      return { ok: false, erro: 'sessionid inválido ou expirado (' + r.status + ')' };
    }
    if (r.status === 429) return { ok: false, erro: 'rate-limit 429 ao validar — tenta daqui a uns minutos', temporario: true };
    if (r.status === 400 || r.status === 404) return { ok: false, erro: 'HTTP ' + r.status + ' — endpoint bloqueado neste IP (sessão não testada)', temporario: true };
    return { ok: false, erro: 'HTTP ' + r.status };
  } catch (e) { return { ok: false, erro: e.message, temporario: true }; }
}
/**
 * v12.9.5: validação em DOIS caminhos — se o current_user falhar por
 * bloqueio de IP, tenta o endpoint das DMs (raremente bloqueado).
 * Sessão boa + IP bravo ≠ sessão inválida!
 */
async function validarSessaoDuplo(sid) {
  const primeira = await validarSessao(sid);
  if (primeira.ok) return primeira;
  if (!primeira.temporario) return primeira;
  const sess = { sid: String(sid || '').trim() };
  try {
    const r = await httpGet('https://i.instagram.com/api/v1/direct_v2/presence/?max_users=1', { headers: igHeaders(sess), timeout: 15000 });
    if (r.status === 200) {
      // chegou ao IG com a sessão — boa, só não conseguimos o username por este IP
      let j; try { j = JSON.parse(r.body.toString('utf8')); } catch { j = {}; }
      const u = j?.presence_events?.user_presence_list?.[0]?.user_id;
      return { ok: true, user: '', id: '', viaFallback: true };
    }
  } catch {}
  // 3ª perna: users/search com UA de app (a que provou 200 mesmo em IP castigado)
  try {
    const uid = sid.split('%3A')[0].split(':')[0];
    const rs = await httpGet(`https://i.instagram.com/api/v1/users/search/?q=${uid}`, {
      headers: { ...igHeaders(sess), 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 311.0.0.109.115' }, timeout: 15000,
    });
    if (rs.status === 200) return { ok: true, user: '', id: uid, viaSearch: true };
  } catch {}
  return primeira;
}
async function addSessao(sid, { validar = true, cookies = '' } = {}) {
  load();
  state.session.igPool = Array.isArray(state.session.igPool) ? state.session.igPool : [];
  // v12.9.9: pode vir o JAR todo (JSON/header); extrai sid + cookies
  if (!sid || /csrftoken|ds_user_id|mid=/i.test(String(cookies || '')) || /^[\[{"]/.test(String(sid).trim())) {
    const nc = normalizarCookies(String(sid).trim().startsWith('[') || String(sid).trim().startsWith('{') ? sid : (cookies || sid));
    if (nc.sid) { sid = nc.sid; cookies = nc.jar; }
  }
  let info = { ok: true, user: '', id: '' };
  if (validar) {
    info = await validarSessaoDuplo(sid);
    if (!info.ok && !info.temporario) {
      // v12.9.11c: endpoint disse "inválido" MAS o IG anda a bloquear endpoints
      // por IP inteiro — guardar como POR-CONFIRMAR em vez de recusar. O uso
      // real (download) é quem prova; se estiver morto, .cap testar marca.
      info = { ok: true, user: '', id: sid.split('%3A')[0].split(':')[0] || '', porConfirmar: true, avisoValidacao: info.erro };
    }
  }
  const ex = state.session.igPool.find(x => x.sid === sid);
  if (ex) Object.assign(ex, { ok: true, user: info.user || ex.user, lastErr: '', porConfirmar: !!info.porConfirmar, ...(info.id ? { id: info.id } : {}), ...(cookies ? { cookies } : {}) });
  else state.session.igPool.push({ sid: String(sid).trim(), user: info.user || '', id: info.id || (sid.split('%3A')[0].split(':')[0] || ''), ok: true, addedAt: Date.now(), porConfirmar: !!info.porConfirmar, ...(info.avisoValidacao ? { lastErr: info.avisoValidacao } : {}), ...(cookies ? { cookies } : {}) });
  state.session.ig = String(sid).trim();
  state.UpdatedAt = Date.now();
  save();
  return { ok: true, user: info.user, id: info.id || sid.split('%3A')[0].split(':')[0] || '', validado: !info.temporario && !info.porConfirmar, aviso: info.temporario ? info.erro : (info.avisoValidacao || '') };
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
function listSessoes() { load(); return (Array.isArray(state.session.igPool) ? state.session.igPool : []).map(s => ({ user: s.user, ok: s.ok !== false, lastErr: s.lastErr || '', addedAt: s.addedAt, id: s.id || String(s.sid || '').split('%3A')[0] || '', porConfirmar: !!s.porConfirmar, cool: !!(s.coolAte > Date.now()) })); }
// arranque: carregar IG_SESSIONID do .env se não houver nenhuma
// v12.9: valida em fundo (sem bloquear arranque) e preenche o @user da conta;
// se o .env tiver sessão mas o pool já tiver outra, mantém as DUAS (pool roda entre elas)
function carregarEnv() {
  // v12.9.4: aceita o valor em qualquer formato vindo da hospedagem
  // (Northflank/Render): com aspas, "sessionid=...", cookie inteiro,
  // espaços ou nova linha — normaliza antes de usar.
  const bruto = String(process.env.IG_SESSIONID || process.env.ig_sessionid || '').trim();
  let env = bruto.replace(/^["']|["']$/g, '').trim();
  const mCookie = /sessionid\s*=\s*([^;\s"']+)/i.exec(env);
  if (mCookie) env = mCookie[1];
  env = env.replace(/;.*$/, '').trim();
  if (env && /%253A|%25253A/i.test(env)) {
    // duplo/triplo-encode → descodifica até ficar com um único %3A
    let vezes = 0;
    while (/%25/i.test(env) && vezes < 3) { env = decodeURIComponent(env); vezes++; }
  }
  if (env && env.includes(':')) {
    // sid cru com ':' literal → codifica
    env = encodeURIComponent(env);
  }
  if (!env || env.length < 30) {
    if (bruto) console.warn('[CAP] IG_SESSIONID definido mas inválido (curto demais) — ignorado');
    return;
  }
  state.session.igPool = Array.isArray(state.session.igPool) ? state.session.igPool : [];
  const jaEsta = state.session.igPool.some((x) => x.sid === env);
  if (!jaEsta) {
    state.session.igPool.push({ sid: env, user: '', ok: true, addedAt: Date.now(), fonte: 'env' });
    if (!state.session.ig) state.session.ig = env;
    save();
    // valida em fundo: preenche user/id ou marca inválida
    validarSessaoDuplo(env).then((info) => {
      const s = state.session.igPool.find((x) => x.sid === env);
      if (!s) return;
      if (info.ok) { s.user = info.user; s.id = info.id; s.ok = true; console.log(`[CAP] sessão do .env validada: @${info.user}`); }
      else if (!info.temporario) { s.ok = false; s.lastErr = info.erro; console.warn('[CAP] sessão do .env inválida:', info.erro); }
      else { console.warn('[CAP] sessão do .env: validação adiada —', info.erro); }
      save();
    }).catch(() => {});
    console.log('[CAP] sessão IG do .env adicionada ao pool (validação em curso)');
  }
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

const IG_HOSTS = ['https://i.instagram.com', 'https://www.instagram.com']; // v12.9.8: app host primeiro
let _hostIdx = 0;
// GET com rotação de host/UA/sessão e retry em 429 (backoff curto). Marca sessão inválida em login_required.
async function igGet(pathAndQuery, { tentativas = 3 } = {}) {
  sincronizar().catch(() => {}); // v12.9.9: sessionid novo via dashboard chega aqui sem restart
  let last = null;
  for (let i = 0; i < tentativas; i++) {
    const sess = pickSession();
    const host = IG_HOSTS[(_hostIdx++) % IG_HOSTS.length];
    const r = await httpGet(host + pathAndQuery, { headers: igHeaders(sess) });
    last = r;
    if (r.status === 200) return r;
    const body = r.body?.toString('utf8').slice(0, 300) || '';
    if (sess && (r.status === 401 || r.status === 403) && /login_required|logged out|checkpoint/i.test(body)) { marcarSessaoInvalida(sess.sid, 'login_required'); continue; }
    if (r.status === 429 || (r.status === 401 && /wait a few minutes/i.test(body))) {
      if (sess) sess.coolAte = Date.now() + _rand(180e3, 480e3); // v12.9.12: sessão descansa 3-8 min
      await new Promise(res => setTimeout(res, _rand(1200, 3200)));
      continue;
    }
    return r;
  }
  return last;
}

// ── v12.9.8: fallback yt-dlp (o mesmo caminho do .cap link) quando a API privada está 429 ──
// O .cap link sempre funcionou porque yt-dlp usa outro rate-bucket (página web + graphql).
// Agora ver/ultimo/check/all também caem nesse caminho quando o IG limita o IP do servidor.
let _cookieFile = ''; let _cookieAt = 0; let _cookieSid = '';
function ytdlpCookieFile() {
  const sess = pickSession();
  const sid = String(sess?.sid || '').trim();
  if (!sid) return '';
  if (_cookieFile && Date.now() - _cookieAt < 3600e3 && _cookieSid === sid) return _cookieFile;
  try {
    const fs = require('fs'), path = require('path');
    const f = path.join(__dirname, '..', '..', 'data', 'cap', '.ig-cookies.txt');
    const uid = sid.split('%3A')[0].split(':')[0] || '';
    let out = '# Netscape HTTP Cookie File\n';
    // v12.9.9: TODOS os cookies do jar (parece navegador real)
    const extra = String(sess?.cookies || '').split(';').map(x => x.trim()).filter(x => x.includes('=') && !/^sessionid=/i.test(x));
    for (const par of extra) {
      const eq = par.indexOf('=');
      out += `.instagram.com\tTRUE\t/\tTRUE\t0\t${par.slice(0, eq).trim()}\t${par.slice(eq + 1).trim()}\n`;
    }
    out += `.instagram.com\tTRUE\t/\tTRUE\t0\tsessionid\t${sid}\n`;
    if (uid) out += `.instagram.com\tTRUE\t/\tTRUE\t0\tds_user_id\t${uid}\n`;
    fs.writeFileSync(f, out);
    _cookieFile = f; _cookieAt = Date.now(); _cookieSid = sid;
    return f;
  } catch { return ''; }
}
// ── v12.9.9: fallback EMBED (público, sem login) para .cap link ──
// https://www.instagram.com/p/<code>/embed/captioned/ traz a foto/vídeo
// mesmo quando a API e o yt-dlp estão bloqueados.
// ── v12.9.10: QUALQUER link do IG → mídia (a sessão vê dentro, o bot baixa) ──
// Aceita: /p/ /reel/ /reels/ /tv/ · /stories/<user>/<pk>/ · /stories/highlights/<rid>/
// e links de partilha: /share/…, /share_reel/…, ig.me/m/… (segue o redirect).
const IG_LINK_RE = /instagram\.com\/(?:[^/]+\/)?(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i;
const IG_STORY_RE = /instagram\.com\/stories\/([^/#?]+)\/([A-Za-z0-9_-]+)/i;
const IG_HL_RE = /instagram\.com\/stories\/highlights\/([A-Za-z0-9_-]+)/i;

async function resolverLink(link) {
  let url = String(link || '').trim();
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url.replace(/^\/+/, '');
  // links de partilha (redirect 30x) → destino final
  if (/instagram\.com\/share|ig\.me\/m\//i.test(url)) {
    let atual = url;
    for (let i = 0; i < 4; i++) {
      const r = await httpGet(atual, { redirects: 0, timeout: 15000 }).catch(() => null);
      if (r?.headers?.location) { atual = r.headers.location.startsWith('http') ? r.headers.location : new URL(r.headers.location, atual).href; continue; }
      // alguns share links respondem 200 com meta-refresh/HTML — extrair o link canónico do corpo
      if (r?.status === 200) {
        const corpo = r.body?.toString('utf8') || '';
        const canon = corpo.match(/(?:og:url|canonical)[^>]*(?:content|href)="(https:[^"]+instagram\.com[^"]+)"/i)
          || corpo.match(/content="0;\s*url=(https:[^"]+instagram\.com[^"]+)"/i)
          || corpo.match(/"(https:\/\/www\.instagram\.com\/(?:p|reel|reels|tv)\/[A-Za-z0-9_-]+\/)"/i);
        if (canon) { atual = canon[1].replace(/&amp;/g, '&'); continue; }
      }
      break;
    }
    url = atual;
  }
  let m = url.match(IG_HL_RE);
  if (m) return { tipo: 'highlight', id: m[1], url };
  m = url.match(IG_STORY_RE);
  if (m && m[1].toLowerCase() !== 'highlights') return { tipo: 'story', username: m[1], pk: m[2], url };
  m = url.match(IG_LINK_RE);
  if (m) return { tipo: m[1].toLowerCase() === 'tv' ? 'post' : (m[1].toLowerCase() === 'p' ? 'post' : 'reel'), shortcode: m[2], url };
  return null;
}

// link → item(s) pronto(s) para processarItem. Camadas: sessão (API app) → yt-dlp → embed.
async function itemDeLink(link) {
  const info = await resolverLink(link);
  if (!info) throw new Error('Link do Instagram não reconhecido');
  if (info.tipo === 'story') {
    // 1. sessão: stories activos do user → apanha o pk do link
    try {
      const us = await igProfile(info.username).catch(() => null);
      if (us?.id) {
        const st = await igStories(us.id, info.username);
        const hit = st.items?.find(x => String(x.shortcode) === String(info.pk));
        if (hit) return [hit];
        if (st.items?.length && !st.needsLogin) throw new Error(`Esse story de @${info.username} já expirou (não está nos activos)`);
      }
    } catch (e) { if (/expirou/.test(e.message)) throw e; }
    // 2. yt-dlp no URL do story
    try {
      const it = await ytdlpUrl(info.url);
      if (it?.medias?.[0]?.url) return [{ ...it, username: info.username }];
    } catch {}
    throw new Error(`Story de @${info.username} indisponível (expirou ou o IG bloqueou — tenta ${'{p}'}cap story @${info.username})`);
  }
  if (info.tipo === 'highlight') {
    // sessão: reels_media highlight:<rid>
    const sess = pickSession();
    if (sess) {
      const r = await igGet(`/api/v1/feed/reels_media/?reel_ids=highlight%3A${info.id}`).catch(() => null);
      if (r?.status === 200) {
        try {
          const j = JSON.parse(r.body.toString('utf8'));
          const items = [];
          for (const rid of Object.keys(j.reels || {})) {
            for (const cru of (j.reels[rid].items || [])) {
              const it = nodeToItem(cru, '');
              if (it?.medias?.length) items.push(it);
            }
          }
          if (items.length) return items;
        } catch {}
      }
    }
    // yt-dlp no URL do highlight
    try {
      const it = await ytdlpUrl(info.url);
      if (it?.medias?.[0]?.url) return [it];
    } catch {}
    throw new Error('Highlight indisponível (sessão precisa de estar válida — .cap login <cookies>)');
  }
  // post / reel / tv
  const erros = [];
  try {
    const it = await ytdlpUrl(info.url);
    if (it?.medias?.[0]?.url) return [it];
  } catch (e) { erros.push('yt-dlp: ' + e.message.slice(0, 60)); }
  try {
    const it = await embedItem(info.shortcode);
    if (it?.medias?.[0]?.url) return [it];
  } catch (e) { erros.push('embed: ' + e.message.slice(0, 60)); }
  // sessão: shortcode → media info via oEmbed (dá o pk) → /media/{pk}/info/
  try {
    const oe = await httpGet(`https://api.instagram.com/oembed/?url=${encodeURIComponent(info.url)}`, { headers: { 'User-Agent': UA }, timeout: 15000 });
    if (oe.status === 200) {
      const j = JSON.parse(oe.body.toString('utf8'));
      const mid = String(j.media_id || '').split('_')[0];
      if (mid) {
        const r = await igGet(`/api/v1/media/${mid}/info/`).catch(() => null);
        if (r?.status === 200) {
          const jm = JSON.parse(r.body.toString('utf8'));
          const cru = jm.items?.[0];
          if (cru) { const it = nodeToItem(cru, ''); if (it?.medias?.length) return [it]; }
        }
      }
    }
  } catch {}
  throw new Error(`Não consegui baixar o link (${erros.join(' · ')})`);
}

async function embedItem(shortcode) {
  const url = `https://www.instagram.com/p/${encodeURIComponent(shortcode)}/embed/captioned/`;
  const r = await httpGet(url, { headers: { 'User-Agent': UA, 'Referer': 'https://www.instagram.com/' }, timeout: 20000 });
  if (r.status !== 200) throw new Error(`embed HTTP ${r.status}`);
  const html = r.body.toString('utf8');
  // contextJSON (reels: tem video_url) ou a imagem clássica do embed
  let mediaUrl = '', isVideo = false, caption = '';
  const ctxM = html.match(/contextJSON\s*=\s*(\{.+?\});/s);
  if (ctxM) {
    try {
      const j = JSON.parse(ctxM[1].replace(/\\\\(\\")/g, '$1').replace(/\\\\u0026/g, '&').replace(/\\\\\\/g, '/'));
      mediaUrl = j.video_url || j.display_url || '';
      isVideo = !!j.video_url;
      caption = j.edge_media_to_caption?.edges?.[0]?.node?.text || '';
    } catch {}
  }
  if (!mediaUrl) {
    const imgM = html.match(/src="(https?:\/\/[^"]+\.(?:jpg|jpeg|webp)[^"]*)"/i)
      || html.match(/"display_url":"([^"]+)"/i) || html.match(/class="EmbeddedMediaImage"[^>]*src="([^"]+)"/i);
    if (imgM) { mediaUrl = imgM[1].replace(/&amp;/g, "&").replace("\\u0026", "&"); isVideo = false; }
  }
  if (!mediaUrl) {
    const vidM = html.match(/"video_url":"([^"]+)"/i);
    if (vidM) { mediaUrl = vidM[1].replace("\\u0026", "&"); isVideo = true; }
  }
  if (!mediaUrl) throw new Error('embed sem mídia (post apagado/privado?)');
  const capM = html.match(/class="Caption"[^>]*>([\s\S]{0,400}?)<\/div>/);
  if (!caption && capM) caption = capM[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return { id: `e_${shortcode}`, shortcode, tipo: isVideo ? 'reel' : 'post', ts: 0, caption: caption.slice(0, 300), link: `https://www.instagram.com/p/${shortcode}/`, medias: [{ url: mediaUrl, isVideo }], username: '' };
}

// 1 link (post/reel/story) → item, via yt-dlp
async function ytdlpUrl(link) {
  const it = await ytdlpItem(link);
  if (!it?.url) throw new Error('yt-dlp sem URL');
  const m = String(link).match(/\/(?:p|reel|reels|tv|stories(?:\/[^/]+)?)\/([A-Za-z0-9_-]+)/);
  return { id: `y_${m ? m[1] : Date.now()}`, shortcode: m ? m[1] : '', tipo: it.isVideo ? 'reel' : 'post', ts: it.ts || 0, caption: it.caption || '', link, medias: [{ url: it.url, isVideo: it.isVideo }], username: '' };
}

async function ytdlpProfile(username, maxPosts = 12) {
  const u = normUser(username);
  const { execFile } = require('child_process');
  const run = (bin, args) => new Promise((res, rej) => execFile(bin, args, { timeout: 45000, maxBuffer: 30 * 1024 * 1024 }, (e, out, err) => e ? rej(new Error((err || e.message).split('\n')[0].slice(0, 140))) : res(out)));
  const args = ['-j', '--flat-playlist', '--no-warnings', '--playlist-items', `1-${Math.max(2, maxPosts)}`];
  const cf = ytdlpCookieFile();
  if (cf) args.push('--cookies', cf);
  let out;
  try { out = await run('yt-dlp', [...args, `https://www.instagram.com/${u}/`]); }
  catch (e1) { try { out = await run('python3', ['-m', 'yt_dlp', ...args, `https://www.instagram.com/${u}/`]); } catch { return null; } }
  const entries = [];
  for (const line of String(out || '').trim().split('\n')) {
    if (!line.trim()) continue;
    try { const j = JSON.parse(line); if (j._type === 'playlist' && Array.isArray(j.entries)) entries.push(...j.entries); else if (j.id || j.url) entries.push(j); } catch {}
  }
  if (!entries.length) return null;
  const items = [];
  for (const en of entries.slice(0, maxPosts)) {
    const link = en.url || en.webpage_url || (en.id ? `https://www.instagram.com/p/${en.id}/` : '');
    if (!link) continue;
    try {
      const it = await ytdlpItem(link);
      if (!it?.url) continue;
      items.push({ id: `y_${en.id || items.length}`, shortcode: String(en.id || '').replace(/\/$/, ''), tipo: it.isVideo ? 'reel' : 'post', ts: it.ts || 0, caption: it.caption || '', link, medias: [{ url: it.url, isVideo: it.isVideo }], username: u });
    } catch {}
  }
  if (!items.length) return null;
  items.sort((a, b) => a.ts - b.ts);
  return { id: '', username: u, nome: '@' + u, bio: '', privado: false, seguidores: 0, seguindo: 0, posts: items.length, highlights: 0, temReels: items.some(i => i.tipo === 'reel'), foto: '', items, hasMore: false, endCursor: '', via: 'ytdlp' };
}

// cache de perfil (3 min) — o bot tinha-se auto-429 com spam de .cap ver
const _profCache = new Map();
// ── v12.9.12: FEED via graphql/query web (doc_id 9310670392322965) ──
// A /api/v1 está bloqueada por IP em datacenters; o graphql da WEB
// (com cookies de sessão) continua a servir o timeline — o mesmo canal
// dos stories do yt-dlp. Resposta: data.xdt_api__v1__feed__user_timeline_graphql_connection
async function feedViaGraphql(username, first = 12, after = '') {
  const u = normUser(username);
  const vars = { username: u, first };
  if (after) vars.after = after;
  const _parse = (body) => {
    const j = JSON.parse(body.toString('utf8'));
    const conn = j?.data?.xdt_api__v1__feed__user_timeline_graphql_connection;
    if (!conn && j?.errors) throw new Error('graphql execution error');
    const items = [];
    for (const e of (conn?.edges || [])) {
      const node = e?.node;
      if (!node || node.__typename === 'XDTGraphUser') continue;
      const it = nodeToItem(node, u);
      if (it?.medias?.length && it.medias[0].url) items.push(it);
    }
    return { items: items.sort((a, b) => a.ts - b.ts), hasMore: !!conn?.page_info?.has_next_page, endCursor: conn?.page_info?.end_cursor || '' };
  };
  const hG = igHeaders(pickSession());
  const base = {
    'User-Agent': UA, 'X-Requested-With': 'XMLHttpRequest', Accept: '*/*',
    Referer: `https://www.instagram.com/${u}/`,
    ...(hG.Cookie ? { Cookie: hG.Cookie } : {}),
    ...(hG['X-IG-App-ID'] ? { 'X-IG-App-ID': hG['X-IG-App-ID'] } : {}),
  };
  // 1) GET — canal documentado (scrapfly Set/2026)
  try {
    const q = `https://www.instagram.com/graphql/query/?doc_id=9310670392322965&variables=${encodeURIComponent(JSON.stringify(vars))}`;
    const r = await httpGet(q, { headers: base, timeout: 20000 });
    if (r.status === 200 && r.body && String(r.body.slice(0, 1)) !== '<') return _parse(r.body);
  } catch {}
  // 2) POST /api/graphql — EXACTAMENTE como o XHR do navegador: LSD da página + csrftoken do jar
  try {
    await new Promise(r2 => setTimeout(r2, _rand(700, 1600)));
    const hp = await htmlPayload(u);
    const csrf = (String(hG.Cookie || '').match(/csrftoken=([^;]+)/) || [])[1] || '';
    const lsd = hp.lsd || csrf;
    if (!lsd) throw new Error('sem LSD');
    const body = new URLSearchParams({
      lsd, fb_api_caller_class: 'RelayModern',
      fb_api_req_friendly_name: 'PolarisProfilePostsTabContentQuery_connection',
      variables: JSON.stringify(vars), doc_id: '9310670392322965', server_timestamps: 'true',
    }).toString();
    const r2 = await httpReq('POST', 'https://www.instagram.com/api/graphql', {
      headers: { ...base, 'X-FB-LSD': lsd, 'X-FB-Friendly-Name': 'PolarisProfilePostsTabContentQuery_connection', ...(csrf ? { 'X-CSRFToken': csrf } : {}) },
      timeout: 20000, body,
    });
    if (r2.status === 200 && r2.body && String(r2.body.slice(0, 1)) !== '<') return _parse(r2.body);
  } catch {}
  throw new Error('graphql GET+POST falharam');
}

// ─────────────────────────────────────────────────────────────
// v12.9.13 — API FUNDAMENTAL DE ESTATÍSTICAS 📊
// Garante NÚMEROS VERDADEIROS (seguidores/following/posts/bio/foto)
// combinando TODAS as fontes em cascata + merge + cache 5 min.
//   1. web_profile_info   (JSON completo)
//   2. HTML da página     (og:description: "8M Followers, 997 Following, 171 Posts")
//   3. usernameinfo app   (JSON por pk)
//   4. users/search       (pk + nome + follower_count)
// O que uma fonte não der, outra preenche. Nunca devolve 0 tendo dado para saber.
const _statsCache = new Map(); // 'p:username' → { at, v }
function _parseOgFollowers(html) {
  const m = (html.match(/og:description"\s+content="([^"]*)/) || html.match(/content="([^"]*)"[^>]*property="og:description"/) || [])[1] || '';
  const dec = m.replace(/&#[0-9]+;/g, (x) => String.fromCharCode(parseInt(x.slice(2, -1)))).replace(/&amp;/g, '&');
  const num = (s) => {
    if (!s) return 0;
    const mm = s.replace(/\s+/g, '').replace(/,(?=\d{3}\b)/g, '.').match(/^([\d.,]+)\s*([KMB])?/i);
    if (!mm) return 0;
    let n = parseFloat(String(mm[1]).replace(/\.(?=.*\.)/g, '').replace(',', '.'));
    if (isNaN(n)) return 0;
    const suf = (mm[2] || '').toUpperCase();
    if (suf === 'K') n *= 1e3; else if (suf === 'M') n *= 1e6; else if (suf === 'B') n *= 1e9;
    return Math.round(n);
  };
  const followers = num((dec.match(/([\d.,]+(?:\s\d{3})*\s*[KMB]?)\s*Followers/i) || [])[1]);
  const following = num((dec.match(/([\d.,]+(?:\s\d{3})*\s*[KMB]?)\s*Following/i) || [])[1]);
  const posts = num((dec.match(/([\d.,]+(?:\s\d{3})*\s*[KMB]?)\s*Posts/i) || [])[1]);
  const nome = (dec.match(/from\s+(.+?)\s*\(@/i) || [])[1] || '';
  const user = (dec.match(/\(@([^)]+)\)/i) || [])[1] || '';
  return { followers, following, posts, nome, user };
}

// ─────────────────────────────────────────────────────────────
// v12.9.14 — FONTE FUNDAMENTAL: a PRÓPRIA PÁGINA do perfil 📄
// O IG embute o utilizador completo no HTML (xig_user_by_username)
// e os contadores no og:description — é o que um navegador vê.
// Devolve { user, og, lsd, posts, status } — cache 5 min por username.
// payload real do IG anda a 15-25 níveis de nesting → profundidade 60 + orçamento de nós
function _digUser(obj, st) {
  if (!obj || typeof obj !== 'object') return null;
  st = st || { d: 0, n: 0 };
  if (++st.n > 400000 || ++st.d > 5000) { st.d--; return null; }
  if ((obj.username && (obj.follower_count != null || obj.edge_followed_by || obj.media_count != null)) || (obj.pk && obj.username && obj.full_name != null)) { st.d--; return obj; }
  for (const k of Object.keys(obj)) {
    try { const r = _digUser(obj[k], st); if (r) { st.d--; return r; } } catch {}
  }
  st.d--;
  return null;
}
function _digTimeline(obj, st) {
  if (!obj || typeof obj !== 'object') return null;
  st = st || { d: 0, n: 0 };
  if (++st.n > 400000 || ++st.d > 5000) { st.d--; return null; }
  if (obj.edges?.length) {
    const n0 = obj.edges[0]?.node || {};
    if (n0.shortcode || n0.code || (n0.id && n0.media_type)) { st.d--; return obj; }
  }
  for (const k of Object.keys(obj)) {
    try { const r = _digTimeline(obj[k], st); if (r) { st.d--; return r; } } catch {}
  }
  st.d--;
  return null;
}
const _htmlCache = new Map();
// foto na MÁXIMA qualidade: IG CDN traz /s150x150/, /s320x320/… → pedir 1080x1080
function fotoHD(u) { return String(u || '').replace(/\/s\d{2,4}x\d{2,4}\//g, '/s1080x1080/'); }
async function htmlPayload(username) {
  const u = normUser(username);
  const ck = 'h:' + u;
  const hit = _htmlCache.get(ck);
  if (hit && Date.now() - hit.at < 300e3) return hit.v;
  const _parse = (html) => {
    const o = { user: null, og: null, lsd: '', posts: [], status: 200 };
    const scripts = html.match(/<script[^>]*type="application\/json"[^>]*>[\s\S]*?<\/script>/g) || [];
    for (const s of scripts.slice(0, 40)) {
      if (!/xig_user_by_username|followed_by|media_count/.test(s)) continue;
      try {
        const j = JSON.parse(s.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, ''));
        if (!o.user) { const us = _digUser(j); if (us) o.user = us; }
      } catch {}
    }
    const og = _parseOgFollowers(html);
    if (og.followers || og.posts || og.nome) o.og = og;
    o.lsd = (html.match(/"LSD",\[\],\{"token":"([^"]+)"/) || [])[1] || '';
    for (const s of scripts.slice(0, 40)) {
      if (!/user_timeline_graphql_connection|shortcode/.test(s)) continue;
      try {
        const j = JSON.parse(s.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, ''));
        const tl = _digTimeline(j);
        if (tl?.edges?.length) { o.posts = tl.edges.map(e => e?.node).filter(Boolean); break; }
      } catch {}
    }
    return o;
  };
  const out = { user: null, og: null, lsd: '', posts: [], status: 0 };
  const _try = async (comCookie) => {
    try {
      const h = comCookie ? igHeaders(pickSession()) : {};
      const r = await httpGet(`https://www.instagram.com/${u}/`, {
        headers: {
          'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8', 'Upgrade-Insecure-Requests': '1',
          ...(h.Cookie ? { Cookie: h.Cookie } : {}), ...(h['X-IG-App-ID'] ? { 'X-IG-App-ID': h['X-IG-App-ID'] } : {}),
        }, timeout: 20000,
      });
      out.status = r.status;
      if (r.status === 200 && r.body) {
        const p = _parse(r.body.toString('utf8'));
        out.user = out.user || p.user;
        out.og = out.og || p.og;
        out.lsd = out.lsd || p.lsd;
        if (!out.posts.length) out.posts = p.posts;
      }
    } catch {}
  };
  // 1ª tentativa LOGADO (a vista de utilizador)
  const tinhaSessao = !!igHeaders(pickSession()).Cookie;
  await _try(true);
  // 2ª tentativa COMO VISITANTE (sem cookies) — é AQUI que o IG serve os números
  // (og:description + xig_user_by_username completos). A vista logada vem em modo app-shell.
  if (!out.user && !out.og && tinhaSessao) {
    await new Promise(r2 => setTimeout(r2, _rand(400, 1000)));
    await _try(false);
  }
  _htmlCache.set(ck, { at: Date.now(), v: out });
  return out;
}

async function perfilStats(username) {
  const u = normUser(username);
  const ck = 'p:' + u;
  const hit = _statsCache.get(ck);
  if (hit && Date.now() - hit.at < 300e3) return hit.v;
  const out = { username: u, nome: '', bio: '', seguidores: 0, seguindo: 0, posts: 0, privado: false, verificado: false, foto: '', id: '', fontes: [] };
  // FONTE 1: web_profile_info (APP-UA primeiro — v12.9.21)
  try {
    let r = await igGetApp(`/api/v1/users/web_profile_info/?username=${encodeURIComponent(u)}`);
    if (r.status !== 200) r = await igGet(`/api/v1/users/web_profile_info/?username=${encodeURIComponent(u)}`);
    if (r.status === 200) {
      const d = JSON.parse(r.body.toString('utf8'))?.data?.user;
      if (d) {
        out.id = String(d.id || ''); out.nome = d.full_name || ''; out.bio = d.biography || '';
        out.seguidores = d.edge_followed_by?.count || 0; out.seguindo = d.edge_follow?.count || 0;
        out.posts = d.edge_owner_to_timeline_media?.count || 0;
        out.privado = !!d.is_private; out.verificado = !!d.is_verified;
        out.foto = out.foto || fotoHD(d.profile_pic_url_hd || d.profile_pic_url || '');
        out.fontes.push('web_profile');
      }
    }
  } catch {}
  // FONTE 2: A PRÓPRIA PÁGINA (payload embutido xig_user_by_username + og:description)
  try {
    const hp = await htmlPayload(u);
    if (hp.user) {
      const ju = hp.user;
      out.id = out.id || String(ju.pk || ju.id || '');
      out.nome = out.nome || ju.full_name || '';
      out.bio = out.bio || ju.biography || '';
      out.seguidores = out.seguidores || ju.follower_count || ju.edge_followed_by?.count || 0;
      out.seguindo = out.seguindo || ju.following_count || ju.edge_follow?.count || 0;
      out.posts = out.posts || ju.media_count || ju.edge_owner_to_timeline_media?.count || 0;
      out.privado = out.privado || !!ju.is_private;
      out.verificado = out.verificado || !!ju.is_verified;
      out.foto = out.foto || fotoHD(ju.profile_pic_url_hd || ju.profile_pic_url || '');
      out.fontes.push('html-payload');
    }
    if (hp.og) {
      const og = hp.og;
      if (og.followers) { out.seguidores = out.seguidores || og.followers; out.fontes.push('og-html'); }
      if (og.following) out.seguindo = out.seguindo || og.following;
      if (og.posts) out.posts = out.posts || og.posts;
      if (!out.nome && og.nome) out.nome = og.nome;
      if (!out.username && og.user) out.username = og.user;
    }
  } catch {}
  // FONTE 3: usernameinfo app (se temos id) — bio completa
  if (!out.id) {
    try {
      const r3 = await igGetApp(`/api/v1/users/search/?q=${encodeURIComponent(u)}`).catch(() => null);
      if (r3.status === 200) {
        const us = (JSON.parse(r3.body.toString('utf8'))?.users || []).find(x => String(x.username).toLowerCase() === u);
        if (us) { out.id = String(us.pk); out.nome = out.nome || us.full_name || ''; out.seguidores = out.seguidores || us.follower_count || 0; out.privado = out.privado || !!us.is_private; out.foto = out.foto || fotoHD(us.profile_pic_url || ''); out.fontes.push('search'); }
      }
    } catch {}
  }
  if (out.id) {
    try {
      const r4 = await igGetApp(`/api/v1/users/${out.id}/usernameinfo/`).catch(() => null);
      if (r4.status === 200) {
        const ju = JSON.parse(r4.body.toString('utf8'))?.user;
        if (ju) {
          out.seguidores = out.seguidores || ju.follower_count || 0;
          out.seguindo = out.seguindo || ju.following_count || 0;
          out.posts = out.posts || ju.media_count || 0;
          out.bio = out.bio || ju.biography || '';
          out.verificado = out.verificado || !!ju.is_verified;
          out.foto = out.foto || fotoHD(ju.hd_profile_pic_url_info?.url || ju.profile_pic_url || '');
          out.fontes.push('usernameinfo');
        }
      }
    } catch {}
  }
  // v12.9.20: SNAPSHOT de crescimento (série histórica p/ /api/ig/crescimento)
  if (out.seguidores > 0) {
    try {
      const sk = 'ig:' + u;
      if (!state.snapshots) state.snapshots = {};
      const serie = state.snapshots[sk] || [];
      const hoje = new Date().toISOString().slice(0, 10);
      const ultimo = serie[serie.length - 1];
      const ponto = { t: Date.now(), s: out.seguidores, p: out.posts || 0, f: out.seguindo || 0, d: hoje };
      if (ultimo && ultimo.d === hoje) serie[serie.length - 1] = ponto; // 1 ponto por dia (refresh)
      else { serie.push(ponto); if (serie.length > 180) state.snapshots[sk] = serie.slice(-180); }
      save();
    } catch {}
  }
  _statsCache.set(ck, { at: Date.now(), v: out });
  return out;
}

// série de crescimento de um perfil (dos snapshots diários)
function crescimento(username, dias = 30) {
  load();
  const serie = ((state.snapshots || {})['ig:' + normUser(username)] || []).slice(-Math.min(dias, 180));
  if (!serie.length) return { username: normUser(username), serie: [], delta: 0, mediaDia: 0 };
  const primeiro = serie[0], ultimo = serie[serie.length - 1];
  const delta = (ultimo.s || 0) - (primeiro.s || 0);
  const d1 = serie.length > 1 ? Math.max(1, Math.round((ultimo.t - primeiro.t) / 86400e3)) : 1;
  return { username: normUser(username), serie, delta, mediaDia: Math.round(delta / d1), desde: primeiro.d, ate: ultimo.d };
}

// v12.9.17 — RESGATE TOTAL: se TODA a API falhar (web_profile 429, search 401,
// feed/user bloqueado), monta o perfil pelos canais web por USERNAME:
// graphql (GET→POST) + página embutida (visitante) + stats (og/search).
// O bot funciona DE QUALQUER FORMA ou falha com a verdade.
async function rescueProfile(u) {
  const un = normUser(u);
  let items = [];
  try { const g = await feedViaGraphql(un, 12); if (g.items?.length) { items.push(...g.items); items.sort((a, b) => a.ts - b.ts); } } catch {}
  if (!items.length) {
    try {
      const hp = await htmlPayload(un);
      const its = (hp.posts || []).map(n => { try { return nodeToItem(n, un); } catch { return null; } }).filter(x => x?.medias?.length && x.medias[0].url);
      if (its.length) { items.push(...its); items.sort((a, b) => a.ts - b.ts); }
    } catch {}
  }
  let st = {}; try { st = await perfilStats(un); } catch {}
  if (!items.length && !st.seguidores && !st.posts) return null;
  return {
    id: st.id || '', username: un, nome: st.nome || '@' + un, bio: st.bio || '',
    privado: !!st.privado, verificado: !!st.verificado,
    seguidores: st.seguidores || 0, seguindo: st.seguindo || 0, posts: st.posts || items.length,
    highlights: 0, temReels: items.some(i => i.tipo === 'reel'),
    foto: st.foto || '',
    items, hasMore: false, endCursor: '', via: items.length ? 'web-rescue' : 'stats-only',
  };
}

async function igProfile(username) {
  const u = normUser(username);
  const _ck = 'p:' + u;
  const _hit = _profCache.get(_ck);
  if (_hit && Date.now() - _hit.at < 180e3) return _hit.v;
  // v12.9.21: CANAL DA APP PRIMEIRO — web_profile_info (web-UA) é o mais
  // bloqueado de todos; users/search e feed/user com UA da APP provaram passar.
  let r = await igGetApp(`/api/v1/users/web_profile_info/?username=${encodeURIComponent(u)}`);
  if (r.status !== 200) r = await igGet(`/api/v1/users/web_profile_info/?username=${encodeURIComponent(u)}`);
  // v12.9.9: web_profile_info é o endpoint mais bloqueado; users/search
  // (endpoint app) provou responder 200 mesmo em IP castigado — dá pk,
  // nome, follower_count, foto e privado.
  if (r.status !== 200) {
    const rs = await igGetApp(`/api/v1/users/search/?q=${encodeURIComponent(u)}`).catch(() => null);
    const us = (() => { try { return JSON.parse(rs?.body?.toString('utf8') || '{}')?.users || []; } catch { return []; } })()
      .find(x => String(x.username || '').toLowerCase() === u);
    if (us?.pk) {
      // enriquece (seguidores/posts/bio) via usernameinfo app-UA — best-effort
      let _extra = {};
      try {
        const ri = await igGetApp(`/api/v1/users/${us.pk}/usernameinfo/`).catch(() => null);
        const ji = JSON.parse(ri.body.toString('utf8'));
        if (ji?.user) _extra = { seguidores: ji.user.follower_count || 0, seguindo: ji.user.following_count || 0, posts: ji.user.media_count || 0, bio: ji.user.biography || '', privado: !!ji.user.is_private };
      } catch {}
      // tenta feed app directo; se falhar, yt-dlp
      const rf = await igGet(`/api/v1/feed/user/${us.pk}/?count=12`).catch(() => null);
      const itensFeed = (() => { try { return JSON.parse(rf?.body?.toString('utf8') || '{}')?.items || []; } catch { return []; } })();
      const items = itensFeed.map(it => nodeToItem(it, u)).filter(x => x.medias?.length).sort((a, b) => a.ts - b.ts);
      if (!items.length) {
        // v12.9.16: CANAL DA APP — o mesmo request da app oficial c/ a tua sessão
        try {
          const a = await feedViaApp(String(us.pk), u, 12);
          if (a.items?.length) { items.push(...a.items); items.sort((x, y) => x.ts - y.ts); }
        } catch {}
      }
      if (!items.length) {
        // v12.9.12: graphql web (canal vivo) → posts reais
        try {
          const g = await feedViaGraphql(u, 12);
          if (g.items?.length) { items.push(...g.items); items.sort((a, b) => a.ts - b.ts); }
        } catch {}
        // v12.9.14: posts EMBUTIDOS na própria página do perfil (SSR)
        if (!items.length) {
          try {
            const hp = await htmlPayload(u);
            const its = (hp.posts || []).map(n => { try { return nodeToItem(n, u); } catch { return null; } }).filter(x => x?.medias?.length && x.medias[0].url);
            if (its.length) { items.push(...its); items.sort((a, b) => a.ts - b.ts); }
          } catch {}
        }
      }
      // v12.9.13: ESTATÍSTICAS VERDADEIRAS via perfilStats (og-html + usernameinfo + search)
      let _stats = {};
      try { _stats = await perfilStats(u); } catch {}
      const _ret = {
        id: String(us.pk), username: u, nome: us.full_name || _stats.nome || '@' + u, bio: _extra.bio || _stats.bio || '',
        privado: _extra.privado != null ? _extra.privado : !!us.is_private,
        seguidores: _stats.seguidores || _extra.seguidores || us.follower_count || 0,
        seguindo: _stats.seguindo || _extra.seguindo || 0,
        posts: _stats.posts || _extra.posts || items.length,
        highlights: 0, temReels: items.some(i => i.tipo === 'reel'),
        foto: fotoHD(us.profile_pic_url || _stats.foto || ''),
        verificado: _stats.verificado || false,
        items, hasMore: false, endCursor: '', via: items.length ? 'app-search' : 'search',
      };
      _profCache.set(_ck, { at: Date.now(), v: _ret });
      return _ret;
    }
  }
  if (r.status === 404) throw new Error(`Perfil @${u} não existe`);
  if (r.status !== 200) {
    // v12.9.17: RESGATE pelos canais web ANTES de desistir
    const res = await rescueProfile(u).catch(() => null);
    if (res) { _profCache.set(_ck, { at: Date.now(), v: res }); return res; }
    // v12.9.8: API limitada → yt-dlp (mesmo caminho do .cap link, comprovado no servidor)
    const alt = await ytdlpProfile(u, 12).catch(() => null);
    if (alt) { _profCache.set(_ck, { at: Date.now(), v: alt }); return alt; }
    if (r.status === 429) throw new Error(`Instagram respondeu HTTP 429 — IP limitado, canais web e yt-dlp falharam (define CAP_PROXY no .env ou espera 30-60 min)`);
    throw new Error(`Instagram respondeu HTTP ${r.status}${r.status === 401 || r.status === 403 ? ' (rate-limit/login)' : ''} — todos os canais falharam`);
  }
  let j; try { j = JSON.parse(r.body.toString('utf8')); } catch {
    const res = await rescueProfile(u).catch(() => null);
    if (res) { _profCache.set(_ck, { at: Date.now(), v: res }); return res; }
    const alt = await ytdlpProfile(u, 12).catch(() => null);
    if (alt) { _profCache.set(_ck, { at: Date.now(), v: alt }); return alt; }
    throw new Error('Resposta do Instagram não é JSON (bloqueio temporário?) — todos os canais falharam');
  }
  const d = j?.data?.user;
  if (!d) {
    const res = await rescueProfile(u).catch(() => null);
    if (res) { _profCache.set(_ck, { at: Date.now(), v: res }); return res; }
    const alt = await ytdlpProfile(u, 12).catch(() => null);
    if (alt) { _profCache.set(_ck, { at: Date.now(), v: alt }); return alt; }
    throw new Error(`Perfil @${u} indisponível`);
  }
  const edges = d.edge_owner_to_timeline_media?.edges || [];
  const ret = {
    id: d.id, username: u, nome: d.full_name, bio: d.biography || '', privado: !!d.is_private,
    seguidores: d.edge_followed_by?.count || 0, seguindo: d.edge_follow?.count || 0, posts: d.edge_owner_to_timeline_media?.count || 0,
    highlights: d.highlight_reel_count || 0, temReels: !!d.has_clips,
    foto: fotoHD(d.profile_pic_url_hd || d.profile_pic_url || ''),
    items: edges.map(e => nodeToItem(e.node, u)).sort((a, b) => a.ts - b.ts),
    hasMore: !!d.edge_owner_to_timeline_media?.page_info?.has_next_page,
    endCursor: d.edge_owner_to_timeline_media?.page_info?.end_cursor || '',
  };
  _profCache.set(_ck, { at: Date.now(), v: ret });
  return ret;
}

// Paginação completa — só funciona com sessão; sem sessão devolve [] silenciosamente.
async function igFeedAll(userId, username, maxPages = 15) {
  if (!sessionsAtivas().length) return { items: [], needsLogin: true };
  const out = []; let maxId = '';
  for (let i = 0; i < maxPages; i++) {
    // v12.9.21: CANAL DA APP PRIMEIRO (o web-UA leva 401 à primeira)
    let r = await igGetApp(`/api/v1/feed/user/${userId}/?count=33${maxId ? `&max_id=${encodeURIComponent(maxId)}` : ''}`);
    if (r.status !== 200) r = await igGet(`/api/v1/feed/user/${userId}/?count=33${maxId ? `&max_id=${encodeURIComponent(maxId)}` : ''}`);
    if (r.status !== 200 && i === 0) {
      // graphql web → yt-dlp (o canal da APP já foi tentado acima)
      try {
        let a = await feedViaApp(userId, username, 33);
        const all = [...a.items];
        let pgs = 0;
        while (a.hasMore && a.nextMaxId && pgs < 4) { await new Promise(r2 => setTimeout(r2, _rand(1200, 2600))); a = await feedViaApp(userId, username, 33, a.nextMaxId); all.push(...a.items); pgs++; }
        if (all.length) return { items: all.sort((x, y) => x.ts - y.ts), needsLogin: false };
      } catch {}
      try {
        let g = await feedViaGraphql(username, 33);
        const all = [...g.items];
        let pages = 0;
        while (g.hasMore && g.endCursor && pages < 4) { await new Promise(r2 => setTimeout(r2, _rand(1200, 2600))); g = await feedViaGraphql(username, 33, g.endCursor); all.push(...g.items); pages++; }
        if (all.length) return { items: all.sort((a, b) => a.ts - b.ts), needsLogin: false };
      } catch {}
      const alt = await ytdlpProfile(username, 33).catch(() => null);
      if (alt?.items?.length) return { items: alt.items, needsLogin: false };
      break;
    }
    if (r.status !== 200) break;
    let j; try { j = JSON.parse(r.body.toString('utf8')); } catch { break; }
    const items = j.items || [];
    if (!items.length) break;
    for (const it of items) out.push(nodeToItem(it, username));
    if (!j.more_available || !j.next_max_id) break;
    maxId = j.next_max_id;
    await new Promise(r => setTimeout(r, _rand(900, 2200)));  // v12.9.12 humano
  }
  if (!out.length) {
    // v12.9.12: graphql web → yt-dlp
    try {
      const g = await feedViaGraphql(username, 33);
      if (g.items?.length) return { items: g.items, needsLogin: false };
    } catch {}
    const alt = await ytdlpProfile(username, 33).catch(() => null);
    if (alt?.items?.length) return { items: alt.items, needsLogin: false };
  }
  return { items: out.sort((a, b) => a.ts - b.ts), needsLogin: false };
}

async function igStories(userId, username) {
  if (!sessionsAtivas().length) return { items: [], needsLogin: true };
  // v12.9.21: reels_media é o canal QUE FUNCIONA (200 até com IP queimado) —
  // mas ia com UA web! Agora primeiro com os headers DA APP (o estilo vencedor).
  let r = await igGetApp(`/api/v1/feed/reels_media/?reel_ids=${userId}`);
  if (r.status !== 200) r = await igGet(`/api/v1/feed/reels_media/?reel_ids=${userId}`);
  if (r.status !== 200) {
    // v12.9.9: yt-dlp saca stories activos com cookies (https://www.instagram.com/stories/<user>/)
    const alt = await ytdlpProfile(`stories/${normUser(username)}`, 20).catch(() => null)
      || await (async () => { try { return await ytdlpUrl(`https://www.instagram.com/stories/${normUser(username)}/`); } catch { return null; } })();
    if (alt?.items?.length) return { items: alt.items, needsLogin: false };
    return { items: [], needsLogin: r.status === 401 || r.status === 403, error: `HTTP ${r.status}` };
  }
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
// ─────────────────────────────────────────────────────────────
// v12.9.19 — WEBHOOKS: o CAP avisa os TEUS sistemas em tempo real 🪝
// Regista URLs; sempre que um item é capturado, POST JSON best-effort.
function addWebhook(url) {
  load();
  const u = String(url || '').trim();
  if (!/^https?:\/\//.test(u)) throw new Error('URL do webhook inválida (http/https)');
  if (!state.webhooks) state.webhooks = [];
  if (!state.webhookSecret) state.webhookSecret = require('crypto').randomBytes(24).toString('hex');
  if (!state.webhooks.includes(u)) state.webhooks.push(u);
  save();
  return { urls: state.webhooks.slice(), segredo: state.webhookSecret };
}
function delWebhook(url) {
  load();
  if (!state.webhooks) state.webhooks = [];
  state.webhooks = state.webhooks.filter(x => x !== String(url || '').trim());
  save();
  return state.webhooks.slice();
}
function listWebhooks() { load(); return (state.webhooks || []).slice(); }
function _whLog(entrada) {
  if (!state.webhookLog) state.webhookLog = [];
  state.webhookLog.push(entrada);
  if (state.webhookLog.length > 50) state.webhookLog = state.webhookLog.slice(-50);
  save();
}
function fireWebhooks(evento, dados) {
  const urls = (state.webhooks || []);
  if (!urls.length) return;
  const crypto = require('crypto');
  const corpo = JSON.stringify({ evento, dados, ts: new Date().toISOString() });
  const assinatura = crypto.createHmac('sha256', state.webhookSecret || '').update(corpo).digest('hex');
  for (const u of urls) {
    const envio = (tentativa) => httpReq('POST', u, {
      headers: {
        'Content-Type': 'application/json',
        'X-Dark-Evento': String(evento || '').slice(0, 40),
        'X-Dark-Assinatura': 'sha256=' + assinatura, // HMAC — o teu sistema valida que veio do bot
      }, body: corpo, timeout: 5000, proxy: false,
    }).then(r => { _whLog({ url: u.slice(0, 60), evento, status: r.status, tentativa, ts: Date.now() }); return r.status >= 200 && r.status < 300; })
      .catch(() => { _whLog({ url: u.slice(0, 60), evento, status: 0, tentativa, ts: Date.now() }); return false; });
    envio(1).then(ok => { if (!ok) setTimeout(() => envio(2), 20000 + Math.floor(Math.random() * 8000)); }); // retry 1×
  }
}

// v12.9.19 — limpar TODAS as caches (perfil/stats/html)
function limparCache() {
  const n = _profCache.size + _statsCache.size + _htmlCache.size;
  _profCache.clear(); _statsCache.clear(); _htmlCache.clear();
  return n;
}

async function processarItem(sock, t, item, { destinos, guardar = t.guardar, forcar = false } = {}) {
  if (!forcar && jaVisto(t.key, item.id)) return { skipped: true };
  const files = []; const erros = [];
  for (let i = 0; i < item.medias.length; i++) {
    try {
      let f;
      try { f = await baixarMedia(item.medias[i]); }
      catch (e0) {
        // v12.9.11: fallback UNIVERSAL — resolve pelo LINK com a cadeia
        // completa (yt-dlp → embed → oEmbed+sessão → stories/highlights
        // pela sessão). Monitoramento e links falam a mesma língua.
        if (i === 0 && item.link && /instagram\.com\//.test(item.link)) {
          try {
            const alts = await itemDeLink(item.link).catch(() => []);
            const alt = (alts || []).find(x => x?.medias?.[0]?.url);
            if (alt) { f = await baixarMedia(alt.medias[0]); f.viaLink = true; }
          } catch {}
          if (!f) {
            // última rede de segurança: yt-dlp directo (post/reel/tv)
            if (/instagram\.com\/(p|reel|tv)\//.test(item.link)) {
              const alt = await ytdlpItem(item.link);
              f = await baixarMedia({ url: alt.url, isVideo: alt.isVideo });
              f.viaYtdlp = true;
            } else throw e0;
          }
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
  // v12.9.19: webhook — avisa os sistemas externos do item capturado
  if (files.length) fireWebhooks('item.capturado', {
    alvo: t.username, plataforma: t.platform, tipo: item.tipo, shortcode: item.shortcode,
    legenda: String(item.caption || '').slice(0, 300), link: item.link,
    midias: files.map(f => ({ caminho: f.path || f.file || '', bytes: f.bytes, video: !!f.isVideo })),
    enviadoWhatsApp: envio.ok > 0,
  });
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
      await new Promise(r => setTimeout(r, _rand(700, 1900)));
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
    await new Promise(r => setTimeout(r, _rand(800, 2000)));
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
    // v12.9.12: ordem aleatória (nunca a mesma sequência) + jitter ±35%
    const alvos = Object.values(state.targets).sort(() => Math.random() - 0.5);
    for (const t of alvos) {
      if (!t.auto) continue;
      const base = Math.max(5, t.intervaloMin || DEFAULT_INTERVAL_MIN) * 60000;
      const iv = base * (t._jitter || 1);
      if (now - (t.lastCheck || 0) < iv) continue;
      t._jitter = 0.75 + Math.random() * 0.6; // próximo ciclo varia
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
  validarSessao, validarSessaoDuplo, addSessao, delSessao, listSessoes, sessionsAtivas, marcarSessaoInvalida, igGet, carregarEnv, sincronizar, inferirUsername, feedViaGraphql, feedViaApp, perfilStats, rescueProfile, addWebhook, delWebhook, listWebhooks, limparCache, crescimento, htmlPayload, fotoHD, igGetApp,
  igProfile, igFeedAll, igStories, igHighlights, nodeToItem, ytdlpItem, ytdlpProfile, ytdlpUrl, embedItem, resolverLink, itemDeLink, normalizarCookies, sniffMime, baixarMedia,
  processarItem, verificarAlvo, capturarTudo, listarGaleria, legenda,
  registar, jaVisto, marcarVisto,
  start, stop, tick,
};
