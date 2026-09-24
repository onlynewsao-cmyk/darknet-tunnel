/**
 * C∆P — Login Instagram por utilizador/senha (web login ajax). v12.8
 * Devolve sessionid para o pool. Trata checkpoint/2FA COM FLUXO DE CÓDIGO:
 * quando o Instagram pede verificação, o bot GUARDA o estado pendente e
 * pede o código ao dono (.cap codigo 123456 no WhatsApp ou no painel).
 * Nunca guarda a senha — só o sessionid resultante.
 */
'use strict';

const https = require('https');
const crypto = require('crypto');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const APP_ID = '936619743392459';
const PENDENTE_TTL = 15 * 60 * 1000; // 15 min para digitar o código

// ── logins à espera do código de verificação ──
// chave: username normalizado → { tipo:'checkpoint'|'2fa', jar, csrf, guid,
//         checkpointPath, identificador, dica, ts }
const pendentes = new Map();

function _limparExpirados() {
  const agora = Date.now();
  for (const [k, p] of pendentes) if (agora - p.ts > PENDENTE_TTL) pendentes.delete(k);
}

function _normUser(u) {
  return String(u || '').trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/[\s]+/g, '').replace(/[/?#].*$/, '').toLowerCase();
}

function req(method, url, { headers = {}, body = null, timeout = 25000 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const r = https.request({ method, hostname: u.hostname, path: u.pathname + u.search, headers: { 'User-Agent': UA, ...headers }, timeout }, (res) => {
      const chunks = []; res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    r.on('error', reject); r.on('timeout', () => { r.destroy(); reject(new Error('timeout')); });
    if (body) r.write(body); r.end();
  });
}
const cookiesOf = (res) => [].concat(res.headers['set-cookie'] || []).map(c => c.split(';')[0]);
const pick = (cookies, name) => (cookies.find(c => c.startsWith(name + '=')) || '').split('=').slice(1).join('=');

/** Faz o POST de login ajax com o jar/csrf dados. Devolve { status, j, all } */
async function _postLogin(user, pw, csrf, jar, guid) {
  const enc = `#PWD_INSTAGRAM_BROWSER:0:${Math.floor(Date.now() / 1000)}:${pw}`;
  const form = new URLSearchParams({
    username: user, enc_password: enc, queryParams: '{}', optIntoOneTap: 'false',
    trustedDeviceRecords: '{}', guid: guid || crypto.randomBytes(16).toString('hex'),
    phone_id: crypto.randomBytes(16).toString('hex'),
  }).toString();
  const r1 = await req('POST', 'https://www.instagram.com/api/v1/web/accounts/login/ajax/', {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(form),
      'X-CSRFToken': csrf, 'X-IG-App-ID': APP_ID, 'X-Requested-With': 'XMLHttpRequest', 'X-Instagram-AJAX': '1',
      'Referer': 'https://www.instagram.com/accounts/login/', 'Origin': 'https://www.instagram.com', 'Cookie': jar.join('; '),
    }, body: form,
  });
  let j = {}; try { j = JSON.parse(r1.body); } catch {}
  return { status: r1.status, j, all: jar.concat(cookiesOf(r1)), setCookie: cookiesOf(r1) };
}

async function loginComSenha(username, password) {
  const raw = String(username || '').trim().replace(/^@/, '');
  const user = _normUser(raw);
  const pw = String(password || '');
  if (!user || !pw) return { ok: false, erro: 'utilizador e senha obrigatórios' };
  const aviso = raw.replace(/\s+/g, '') !== raw || user !== raw
    ? `usernames não têm espaços/maiúsculas — usei "${user}"` : '';

  const guid = crypto.randomBytes(16).toString('hex');

  // 1) csrftoken + cookies iniciais
  let jar = [];
  try {
    const r0 = await req('GET', 'https://i.instagram.com/api/v1/si/fetch_headers/?challenge_type=signup&guid=' + guid);
    jar = cookiesOf(r0);
  } catch (e) { return { ok: false, erro: 'sem ligação ao Instagram: ' + e.message }; }
  const csrf = pick(jar, 'csrftoken');
  if (!csrf) return { ok: false, erro: 'não obtive csrftoken (IP bloqueado?)' };

  // 2) POST login ajax
  let r1;
  try { r1 = await _postLogin(user, pw, csrf, jar, guid); }
  catch (e) { return { ok: false, erro: 'falha no pedido de login: ' + e.message }; }

  if (r1.status === 429) return { ok: false, erro: 'Instagram limitou o IP do servidor (429) — usa o sessionid do browser ou CAP_PROXY', temporario: true };
  const j = r1.j;
  const sid = pick(r1.all, 'sessionid');

  if (j.two_factor_required) {
    // ── v12.8: 2FA — guarda pendente e pede o código ao dono ──
    const ident = String(j.two_factor_info?.two_factor_identifier || '');
    const metodos = [];
    if (j.two_factor_info?.sms_on) metodos.push('SMS ' + (j.two_factor_info?.obfuscated_phone_number || ''));
    if (j.two_factor_info?.totp_two_factor_on) metodos.push('app autenticador');
    if (j.two_factor_info?.whatsapp_on) metodos.push('WhatsApp');
    pendentes.set(user, { tipo: '2fa', jar: r1.all, csrf, guid, identificador: ident, dica: metodos.join(' ou ') || 'SMS/app', pw, ts: Date.now() });
    return { ok: false, precisaCodigo: true, tipo: '2fa', user, dica: metodos.join(' ou ') || 'SMS/app', aviso };
  }
  if (j.checkpoint_url || j.message === 'checkpoint_required') {
    // ── v12.8b: desafio NOVO anti-bot (auth_platform) — não aceita código
    // por HTTP (é verificação JS do browser). Mensagem honesta + sessionid. ──
    if (/auth_platform/i.test(String(j.checkpoint_url || ''))) {
      return { ok: false, erro: 'Instagram bloqueou o login por senha deste IP (desafio anti-bot novo, auth_platform) — só aceita login com browser real. Não há código que resolva por aqui: usa o *sessionid* do browser (guia: .cap login) — funciona na mesma para stories/captura', authPlatform: true, aviso };
    }
    // ── v12.8: checkpoint clássico — abre o desafio e pede código ──
    const url = String(j.checkpoint_url || '');
    const mm = url.match(/\/challenge\/([\w/]+)/) || url.match(/\/checkout\/([\w/]+)/);
    const path = mm ? mm[1] : '';
    if (path) {
      const aberto = await _abrirChallenge(user, path, csrf, r1.all, guid, pw);
      if (aberto) {
        return { ok: false, precisaCodigo: true, tipo: 'checkpoint', user, dica: aberto.contactPoint ? `código enviado para ${aberto.contactPoint}` : 'SMS ou email da conta', aviso };
      }
    }
    return { ok: false, erro: 'Instagram pediu verificação (checkpoint) que não consegui abrir por aqui. Confirma "fui eu" no telemóvel e tenta de novo — ou usa o sessionid do browser', checkpoint: true, aviso };
  }
  if (j.authenticated === false || (j.user === false)) return { ok: false, erro: j.user === false ? 'utilizador não existe' : 'senha incorrecta', aviso };
  if (j.spam) return { ok: false, erro: 'Instagram marcou como suspeito (spam) — espera e tenta pelo sessionid do browser', aviso };
  if (j.authenticated && sid) return { ok: true, sid, user, userId: String(j.userId || ''), aviso };
  return { ok: false, erro: `resposta inesperada (${r1.status}${j.message ? ': ' + j.message : ''})`, aviso };
}

/** Abre o challenge e pede o envio do código (choice 0 = SMS/email). */
async function _abrirChallenge(user, path, csrf, jar, guid, pw) {
  try {
    const form = new URLSearchParams({ choice: '0', guid: guid || '' }).toString();
    const r = await req('POST', `https://i.instagram.com/api/v1/challenge/${path}/`, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(form),
        'X-CSRFToken': csrf, 'X-IG-App-ID': APP_ID, 'X-Requested-With': 'XMLHttpRequest',
        'Referer': 'https://www.instagram.com/', 'Cookie': jar.join('; '),
      }, body: form,
    });
    let j = {}; try { j = JSON.parse(r.body); } catch {}
    const step = String(j.step_name || '');
    const contact = j.step_data?.contact_point || j.step_data?.email || '';
    if (step === 'verify_code' || step === 'select_verify_method' || j.status === 'ok') {
      pendentes.set(user, { tipo: 'checkpoint', jar, csrf, guid, checkpointPath: path, dica: contact ? `código para ${contact}` : 'SMS ou email', pw, ts: Date.now() });
      return { contactPoint: contact };
    }
    return null;
  } catch { return null; }
}

/** Estado dum login pendente (pro painel/WhatsApp mostrar). */
function estadoPendente(username) {
  _limparExpirados();
  const user = _normUser(username);
  if (user) { const p = pendentes.get(user); return p ? { user, ...p, jar: undefined, csrf: undefined, guid: undefined } : null; }
  const keys = [...pendentes.keys()];
  return keys.map((k) => ({ user: k, tipo: pendentes.get(k).tipo, dica: pendentes.get(k).dica, ts: pendentes.get(k).ts }));
}

function cancelarPendente(username) {
  const user = _normUser(username);
  return pendentes.delete(user);
}

/**
 * Confirma o código de verificação e conclui o login.
 * Devolve { ok:true, sid, user } ou { ok:false, erro }.
 */
async function confirmarCodigo(username, codigo) {
  _limparExpirados();
  const user = _normUser(username);
  const code = String(codigo || '').replace(/\D/g, '');
  if (!code || code.length < 4) return { ok: false, erro: 'código inválido — manda os dígitos que o Instagram enviou' };
  const p = pendentes.get(user);
  if (!p) return { ok: false, erro: 'não há login à espera de código para esse utilizador — faz `.cap login <user> <senha>` primeiro' };

  try {
    if (p.tipo === '2fa') {
      // ── two_factor_login (API privada com os mesmos cookies) ──
      const form = new URLSearchParams({
        username: user, verificationCode: code, two_factor_identifier: p.identificador || '',
        trust_this_device: '1', guid: p.guid, device_id: p.guid,
      }).toString();
      const r = await req('POST', 'https://i.instagram.com/api/v1/accounts/two_factor_login/', {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(form),
          'X-CSRFToken': p.csrf, 'X-IG-App-ID': APP_ID, 'X-Requested-With': 'XMLHttpRequest',
          'Referer': 'https://www.instagram.com/', 'Cookie': p.jar.join('; '),
        }, body: form,
      });
      let j = {}; try { j = JSON.parse(r.body); } catch {}
      const all = p.jar.concat(cookiesOf(r));
      const sid = pick(all, 'sessionid');
      if (j.two_factor_required && !sid) return { ok: false, erro: 'código recusado (2FA): ' + (j.message || 'tenta de novo') };
      if (j.two_factor_info?.two_factor_identifier) { p.identificador = j.two_factor_info.two_factor_identifier; }
      if (sid && (j.authenticated !== false)) {
        pendentes.delete(user);
        return { ok: true, sid, user, userId: String(j.userId || '') };
      }
      if (r.status === 429) return { ok: false, erro: 'rate-limit 429 — espera uns minutos' };
      return { ok: false, erro: 'código recusado: ' + (j.message || j.error_title || `HTTP ${r.status}`) };
    }

    // ── checkpoint: security_code no challenge aberto ──
    const form = new URLSearchParams({ security_code: code, _csrftoken: p.csrf, guid: p.guid, device_id: p.guid }).toString();
    const r = await req('POST', `https://i.instagram.com/api/v1/challenge/${p.checkpointPath}/`, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(form),
        'X-CSRFToken': p.csrf, 'X-IG-App-ID': APP_ID, 'X-Requested-With': 'XMLHttpRequest',
        'Referer': 'https://www.instagram.com/', 'Cookie': p.jar.join('; '),
      }, body: form,
    });
    let j = {}; try { j = JSON.parse(r.body); } catch {}
    const resolvido = j.action === 'close' || j.status === 'ok' || j.step_name === null;
    if (!resolvido) {
      if (j.challenge || /invalid|incorrect|errado/i.test(String(j.message || ''))) return { ok: false, erro: 'código errado — verifica o SMS/email e tenta de novo' };
      return { ok: false, erro: 'challenge não aceitou o código: ' + (j.message || j.step_name || `HTTP ${r.status}`) };
    }
    // challenge resolvido — refaz o login para obter o sessionid
    p.jar = p.jar.concat(cookiesOf(r));
    const r2 = await _postLogin(user, p.pw, p.csrf, p.jar, p.guid);
    let sid = pick(r2.all, 'sessionid');
    if (!sid && r2.j?.checkpoint_url) return { ok: false, erro: 'challenge resolvido mas o login ainda bloqueia — tenta o login de novo' };
    if (!sid) {
      // último recurso: pede o cookie atualizado — pode ter vindo no próprio challenge
      sid = pick(p.jar, 'sessionid');
    }
    if (sid) {
      pendentes.delete(user);
      return { ok: true, sid, user };
    }
    return { ok: false, erro: 'challenge resolvido mas não voltei a obter o sessionid — faz `.cap login` de novo que agora deve entrar direto' };
  } catch (e) {
    return { ok: false, erro: 'falha ao confirmar código: ' + e.message };
  }
}

module.exports = { loginComSenha, confirmarCodigo, estadoPendente, cancelarPendente, _normUser };
