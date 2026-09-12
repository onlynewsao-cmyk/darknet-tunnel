/**
 * C∆P — Login Instagram por utilizador/senha (web login ajax).
 * Devolve sessionid para o pool. Trata checkpoint/2FA com mensagens claras.
 * Nunca guarda a senha — só o sessionid resultante.
 */
'use strict';

const https = require('https');
const crypto = require('crypto');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const APP_ID = '936619743392459';

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

async function loginComSenha(username, password) {
  const user = String(username || '').trim().replace(/^@/, '');
  const pw = String(password || '');
  if (!user || !pw) return { ok: false, erro: 'utilizador e senha obrigatórios' };

  // 1) csrftoken + cookies iniciais
  let jar = [];
  try {
    const r0 = await req('GET', 'https://i.instagram.com/api/v1/si/fetch_headers/?challenge_type=signup&guid=' + crypto.randomBytes(16).toString('hex'));
    jar = cookiesOf(r0);
  } catch (e) { return { ok: false, erro: 'sem ligação ao Instagram: ' + e.message }; }
  const csrf = pick(jar, 'csrftoken');
  if (!csrf) return { ok: false, erro: 'não obtive csrftoken (IP bloqueado?)' };

  // 2) POST login ajax (senha em claro com timestamp — método web oficial quando não há chave pública)
  const enc = `#PWD_INSTAGRAM_BROWSER:0:${Math.floor(Date.now() / 1000)}:${pw}`;
  const form = new URLSearchParams({ username: user, enc_password: enc, queryParams: '{}', optIntoOneTap: 'false', trustedDeviceRecords: '{}' }).toString();
  let r1;
  try {
    r1 = await req('POST', 'https://www.instagram.com/api/v1/web/accounts/login/ajax/', {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(form),
        'X-CSRFToken': csrf, 'X-IG-App-ID': APP_ID, 'X-Requested-With': 'XMLHttpRequest', 'X-Instagram-AJAX': '1',
        'Referer': 'https://www.instagram.com/accounts/login/', 'Origin': 'https://www.instagram.com', 'Cookie': jar.join('; '),
      }, body: form,
    });
  } catch (e) { return { ok: false, erro: 'falha no pedido de login: ' + e.message }; }

  if (r1.status === 429) return { ok: false, erro: 'Instagram limitou o IP do servidor (429) — usa o sessionid do browser ou CAP_PROXY', temporario: true };
  let j = {}; try { j = JSON.parse(r1.body); } catch {}
  const all = jar.concat(cookiesOf(r1));
  const sid = pick(all, 'sessionid');

  if (j.two_factor_required) return { ok: false, erro: 'conta com 2FA — desliga o 2FA nessa conta secundária ou usa o sessionid do browser', twoFactor: true };
  if (j.checkpoint_url || j.message === 'checkpoint_required') return { ok: false, erro: 'Instagram pediu verificação (checkpoint). Abre a conta no telemóvel, confirma "fui eu", e tenta de novo — ou usa o sessionid do browser', checkpoint: true };
  if (j.authenticated === false || (j.user === false)) return { ok: false, erro: j.user === false ? 'utilizador não existe' : 'senha incorrecta' };
  if (j.spam) return { ok: false, erro: 'Instagram marcou como suspeito (spam) — espera e tenta pelo sessionid do browser' };
  if (j.authenticated && sid) return { ok: true, sid, user, userId: String(j.userId || '') };
  return { ok: false, erro: `resposta inesperada (${r1.status}${j.message ? ': ' + j.message : ''})` };
}

module.exports = { loginComSenha };
