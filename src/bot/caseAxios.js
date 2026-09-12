/**
 * Axios para cases dinâmicos.
 * APIs de outros bots (systemzone, siputzx, …) caem com 502.
 * Se o pedido for Pinterest e falhar, devolve o mesmo formato
 * { status, results:[{ media_url, type }] } a partir das fontes nossas.
 */
'use strict';

function isPinterestRequest(url, config) {
  const u = String(url || '');
  const p = config?.params || {};
  try {
    return /pinterest/i.test(u) || /pinterest/i.test(JSON.stringify(p));
  } catch {
    return /pinterest/i.test(u);
  }
}

function pickParam(url, config, names) {
  const p = config?.params || {};
  for (const n of names) {
    if (p[n] != null && String(p[n]).trim()) return String(p[n]).trim();
  }
  try {
    const u = new URL(String(url), 'https://dummy.local');
    for (const n of names) {
      const v = u.searchParams.get(n);
      if (v) return v;
    }
  } catch { /* url relativa sem query */ }
  return '';
}

function typeFrom(url, config) {
  const t = pickParam(url, config, ['type', 'tipo']).toLowerCase();
  if (/^v[ií]d/.test(t) || t === 'mp4') return 'video';
  if (/img|image|foto|imagens?/.test(t)) return 'image';
  return 'image';
}

function limitFrom(url, config) {
  const n = Number(pickParam(url, config, ['limit', 'qtd', 'quantidade']) || 6);
  return Math.max(1, Math.min(10, n || 6));
}

async function fallbackPin(url, config) {
  const q = pickParam(url, config, ['q', 'query', 'text', 'message', 'search']);
  if (!q) return null;
  const pin = require('./pinterestSearch');
  const results = await pin.searchPinterest(q, {
    type: typeFrom(url, config),
    limit: limitFrom(url, config),
  });
  if (!results.length) return null;
  const mapped = results.map((r) => ({
    media_url: r.media_url || r.url,
    type: r.type,
    image_url: r.image_url,
    url: r.url,
    description: r.description || '',
    pin: r.pin || '',
  }));
  return {
    data: {
      status: true,
      results: mapped,
      result: mapped,
      data: mapped,
    },
    status: 200,
    statusText: 'OK',
    headers: { 'x-darkbot-fallback': 'pinterest' },
    config: config || {},
  };
}

function createCaseAxios() {
  const axios = require('axios');
  const inst = axios.create({ timeout: 60000, validateStatus: (s) => s >= 200 && s < 300 });
  const origGet = inst.get.bind(inst);
  const origPost = inst.post.bind(inst);

  inst.get = async function get(url, config) {
    try {
      return await origGet(url, config);
    } catch (e) {
      if (isPinterestRequest(url, config)) {
        const fb = await fallbackPin(url, config).catch(() => null);
        if (fb) return fb;
      }
      throw e;
    }
  };

  inst.post = async function post(url, data, config) {
    try {
      return await origPost(url, data, config);
    } catch (e) {
      const merged = {
        ...(config || {}),
        params: {
          ...((config && config.params) || {}),
          ...(data && typeof data === 'object' && !Buffer.isBuffer(data) ? data : {}),
        },
      };
      if (isPinterestRequest(url, merged)) {
        const fb = await fallbackPin(url, merged).catch(() => null);
        if (fb) return fb;
      }
      throw e;
    }
  };

  return inst;
}

module.exports = { createCaseAxios, isPinterestRequest, fallbackPin };
