/**
 * DARK BOT — Marca d'água / descrição de stickers por grupo
 *
 * .definestickwm  → define pack + author de TODAS as figurinhas
 *                   que o bot manda naquele chat.
 *
 * Descrição dos stickers (NÃO leva o nome do canal):
 *   DARK NET 🕸️
 *   O melhor canal do mundo
 *   <link do canal/grupo>
 *   Siga o canal
 *
 * Activa por nome ou por link — o bot detecta canal ou grupo.
 */
'use strict';

const DEFAULT_BRAND = 'DARK NET 🕸️';
const DEFAULT_PACK = 'DARK NET 🕸️';
const DEFAULT_SLOGAN = 'O melhor canal do mundo';
const DEFAULT_CTA = 'Siga o canal';
const DEFAULT_PACK_URL = 'https://whatsapp.com/channel/0029VbC8voN4Y9lszc9VuT2D';

function stablePackId(seed = '') {
  try {
    return require('./stickerMaker').makePackId(seed || DEFAULT_PACK_URL);
  } catch {
    const crypto = require('crypto');
    const h = crypto.createHash('md5').update('darkbot-pack|' + String(seed || DEFAULT_PACK_URL)).digest('hex').slice(0, 16);
    return `com.darkbot.pack.${h}`;
  }
}

const CHANNEL_RE = /(?:https?:\/\/)?(?:www\.)?(?:whatsapp\.com|wa\.me)\/channel\/([A-Za-z0-9_-]{10,})(?:\/\S*)?/i;
const GROUP_RE = /(?:https?:\/\/)?(?:www\.)?chat\.whatsapp\.com\/(?:invite\/)?([A-Za-z0-9_-]{10,})/i;

let _bound = null;

function bind(ctx = {}) {
  _bound = {
    remoteJid: ctx.remoteJid || '',
    pushName: ctx.pushName || '',
  };
  try {
    const rc = require('./requestCache');
    rc.put('sticker_ctx', _bound);
  } catch {}
}

function currentCtx() {
  try {
    const rc = require('./requestCache');
    const cached = rc.get && rc.get('sticker_ctx');
    if (cached && cached.remoteJid) return cached;
  } catch {}
  return _bound;
}

function parseChannelLink(text = '') {
  const raw = String(text || '').trim();
  const m = raw.match(CHANNEL_RE);
  if (!m) return null;
  const code = m[1].replace(/[/?#].*$/, '');
  if (!code || code.length < 10) return null;
  return {
    type: 'channel',
    code,
    url: `https://whatsapp.com/channel/${code}`,
  };
}

function parseGroupLink(text = '') {
  const raw = String(text || '').trim();
  if (CHANNEL_RE.test(raw)) return null;
  const m = raw.match(GROUP_RE);
  if (!m) return null;
  const code = m[1].replace(/[/?#].*$/, '');
  if (!code || code.length < 10) return null;
  return {
    type: 'group',
    code,
    url: `https://chat.whatsapp.com/${code}`,
  };
}

function parseAnyLink(text = '') {
  return parseChannelLink(text) || parseGroupLink(text);
}

function extractChannelNameFromHtml(html = '') {
  const src = String(html || '');
  const pick = (...res) => {
    for (const re of res) {
      const m = src.match(re);
      const v = (m && (m[1] || m[2]) || '').replace(/\s+/g, ' ').trim();
      if (v && !/^whatsapp$/i.test(v)) return decodeHtml(v);
    }
    return '';
  };
  let name = pick(
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i,
    /<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["']/i,
    /"newsletter_name"\s*:\s*"([^"]+)"/i,
    /"name"\s*:\s*"([^"]{2,80})"\s*,\s*"description"/i,
    /<title[^>]*>([^<]+)<\/title>/i,
  );
  if (!name) return '';
  name = name
    .replace(/\s*[|\-–—•]\s*WhatsApp.*$/i, '')
    .replace(/^WhatsApp\s*[|\-–—•]\s*/i, '')
    .replace(/\s+on WhatsApp$/i, '')
    .trim();
  return name.slice(0, 80);
}

function decodeHtml(s = '') {
  return String(s)
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .trim();
}

/** PhotoAppWorld.com / Sticker.ly: o WhatsApp só mostra «Ver pacote» se o publisher for um site. */
function urlToPublisherSite(url = '') {
  const raw = String(url || '').trim();
  if (!raw) return '';
  return raw.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, '').slice(0, 120);
}

function composeMeta({
  brand = DEFAULT_BRAND,
  slogan = DEFAULT_SLOGAN,
  link = '',
  cta = DEFAULT_CTA,
  channelName = '',
} = {}) {
  const brandClean = String(brand || DEFAULT_BRAND).trim().slice(0, 80) || DEFAULT_BRAND;
  const sloganClean = String(slogan || DEFAULT_SLOGAN).trim().slice(0, 80) || DEFAULT_SLOGAN;
  const url = String(link || '').trim().slice(0, 200);
  const ctaClean = String(cta || DEFAULT_CTA).trim().slice(0, 80) || DEFAULT_CTA;
  const nameClean = String(channelName || '').trim().slice(0, 80);
  const site = urlToPublisherSite(url);
  const title = nameClean || brandClean;
  const authorLines = [sloganClean, url, ctaClean].filter(Boolean);
  return {
    packName: title,
    authorName: site || brandClean,
    brand: brandClean,
    slogan: sloganClean,
    channelUrl: url,
    packUrl: url,
    packId: stablePackId(url || brandClean),
    cta: ctaClean,
    channelName: nameClean,
    publisherSite: site,
    description: [title, ...authorLines].join('\n'),
  };
}

function cleanSearchName(name = '') {
  return String(name || '').replace(/\s+/g, ' ').trim().slice(0, 40);
}

/**
 * Pack de pesquisa (.pinpacks, .stickerly, .packbusca, …)
 * Se o grupo tem .definestickwm, o NOME DA PESQUISA vai na descrição.
 */
function composeSearchPack(searchName, saved) {
  const query = cleanSearchName(searchName) || 'DARK PACK';
  const url = (saved && (saved.channelUrl || saved.packUrl)) || DEFAULT_PACK_URL;
  const site = urlToPublisherSite(url);
  const title = (saved && (saved.channelName || saved.packName)) || DEFAULT_BRAND;
  if (!saved?.enabled) {
    return {
      packName: query,
      authorName: site || DEFAULT_BRAND,
      publisher: site || DEFAULT_BRAND,
      description: query,
      searchName: query,
      packUrl: DEFAULT_PACK_URL,
      packId: stablePackId(query),
    };
  }
  return {
    packName: title,
    authorName: site || saved.brand || DEFAULT_BRAND,
    publisher: site || saved.brand || DEFAULT_BRAND,
    description: [title, query, url].filter(Boolean).join('\n'),
    searchName: query,
    brand: saved.brand || DEFAULT_BRAND,
    packUrl: url,
    packId: saved.packId || stablePackId(url),
    channelName: saved.channelName || '',
  };
}

async function fetchChannelFromWeb(url) {
  const link = parseChannelLink(url);
  if (!link) return null;
  const axios = require('axios');
  const pages = [
    link.url,
    `https://www.whatsapp.com/channel/${link.code}`,
  ];
  for (const page of pages) {
    try {
      const r = await axios.get(page, {
        timeout: 12000,
        maxRedirects: 4,
        validateStatus: s => s >= 200 && s < 400,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'pt-PT,pt;q=0.9,en;q=0.8',
        },
      });
      const name = extractChannelNameFromHtml(String(r.data || ''));
      if (name) return { name, url: link.url, code: link.code, source: 'web' };
    } catch {}
  }
  return { name: '', url: link.url, code: link.code, source: 'web' };
}

async function fetchChannelFromSock(sock, url) {
  const link = parseChannelLink(url);
  if (!link || !sock) return null;
  const tryFns = [
    async () => sock.newsletterMetadata?.('invite', link.code),
    async () => sock.newsletterMetadata?.('invite', link.url),
    async () => sock.newsletterMetadata?.('jid', `${link.code}@newsletter`),
  ];
  for (const fn of tryFns) {
    try {
      const meta = await fn();
      const name = meta?.name || meta?.subject || meta?.title || meta?.newsletterName || '';
      if (name) {
        return {
          name: String(name).trim().slice(0, 80),
          url: link.url,
          code: link.code,
          jid: meta.id || meta.jid || '',
          source: 'baileys',
        };
      }
    } catch {}
  }
  return null;
}

async function resolveChannel(url, sock = null) {
  const link = parseChannelLink(url);
  if (!link) return null;
  const fromSock = await fetchChannelFromSock(sock, url).catch(() => null);
  if (fromSock?.name) return { ...fromSock, type: 'channel' };
  const fromWeb = await fetchChannelFromWeb(url).catch(() => null);
  if (fromWeb) return { ...fromWeb, type: 'channel' };
  return {
    type: 'channel',
    name: '',
    url: link.url,
    code: link.code,
    source: fromSock ? 'baileys' : 'unknown',
  };
}

async function resolveGroup(url, sock = null) {
  const link = parseGroupLink(url);
  if (!link) return null;
  if (sock?.groupGetInviteInfo) {
    try {
      const info = await sock.groupGetInviteInfo(link.code);
      const name = info?.subject || info?.name || '';
      return {
        type: 'group',
        name: String(name || '').trim().slice(0, 80),
        url: link.url,
        code: link.code,
        jid: info?.id || '',
        source: 'baileys',
      };
    } catch {}
  }
  return { type: 'group', name: '', url: link.url, code: link.code, source: 'link' };
}

async function resolveAnyLink(text, sock = null) {
  if (parseChannelLink(text)) return resolveChannel(text, sock);
  if (parseGroupLink(text)) return resolveGroup(text, sock);
  return null;
}

async function groupInviteUrl(sock, groupJid) {
  if (!sock || !groupJid || !String(groupJid).endsWith('@g.us')) return '';
  try {
    const code = await sock.groupInviteCode(groupJid);
    return code ? `https://chat.whatsapp.com/${code}` : '';
  } catch {
    return '';
  }
}

async function getGroupDoc(jid) {
  if (!jid) return null;
  const GroupSettings = require('../database/models/GroupSettings');
  const requestCache = require('./requestCache');
  return requestCache.remember(
    requestCache.K.group(jid) + ':doc',
    () => GroupSettings.findOne({ groupJid: jid })
  ).catch(() => null);
}

function fromDoc(gs) {
  if (!gs) return null;
  const url = String(gs.stickerChannelUrl || '').trim();
  const enabled = gs.stickerWmEnabled === true || !!url;
  if (!enabled) return null;
  const composed = composeMeta({
    brand: gs.stickerWmBrand || DEFAULT_BRAND,
    slogan: gs.stickerWmSlogan || DEFAULT_SLOGAN,
    link: url,
    cta: gs.stickerWmCta || DEFAULT_CTA,
    channelName: gs.stickerChannelName || '',
  });
  return {
    enabled: true,
    ...composed,
    packId: String(gs.stickerPackId || '').trim() || composed.packId,
    channelName: String(gs.stickerChannelName || '').trim(),
    linkType: String(gs.stickerWmLinkType || '').trim(),
  };
}

async function getGlobalDefault() {
  try {
    const botConfigCache = require('./botConfigCache');
    const url = String(await botConfigCache.get('sticker_pack_url', DEFAULT_PACK_URL) || DEFAULT_PACK_URL).trim();
    const brand = String(await botConfigCache.get('sticker_pack_brand', DEFAULT_BRAND) || DEFAULT_BRAND).trim();
    const slogan = String(await botConfigCache.get('sticker_wm_slogan', DEFAULT_SLOGAN) || DEFAULT_SLOGAN).trim();
    const cta = String(await botConfigCache.get('sticker_wm_cta', DEFAULT_CTA) || DEFAULT_CTA).trim();
    const channelName = String(await botConfigCache.get('sticker_pack_channel_name', '') || '').trim();
    return composeMeta({ brand, slogan, link: url || DEFAULT_PACK_URL, cta, channelName });
  } catch {
    return composeMeta({ link: DEFAULT_PACK_URL });
  }
}

async function saveGlobalDefault(data = {}) {
  const composed = composeMeta({
    brand: data.brand,
    slogan: data.slogan,
    link: data.channelUrl || data.link || data.packUrl,
    cta: data.cta,
    channelName: data.channelName,
  });
  const BotConfig = require('../database/models/BotConfig');
  await BotConfig.set('sticker_pack_url', composed.channelUrl);
  await BotConfig.set('sticker_pack_brand', composed.brand);
  await BotConfig.set('sticker_wm_slogan', composed.slogan);
  await BotConfig.set('sticker_wm_cta', composed.cta);
  await BotConfig.set('sticker_pack_id', composed.packId);
  await BotConfig.set('sticker_pack_channel_name', composed.channelName || '');
  try { require('./botConfigCache').clear(); } catch {}
  return composed;
}

/** Pack que o "Ver pacote" usa: grupo > global > canal default. Sempre tem URL. */
async function resolvePack(jid) {
  const local = jid ? await getForJid(jid).catch(() => null) : null;
  if (local?.enabled && (local.channelUrl || local.packUrl)) {
    return {
      ...local,
      packUrl: local.channelUrl || local.packUrl,
      packId: local.packId || stablePackId(local.channelUrl || local.brand),
    };
  }
  const glob = await getGlobalDefault();
  return {
    ...glob,
    enabled: false,
    packUrl: glob.channelUrl || DEFAULT_PACK_URL,
    packId: glob.packId || stablePackId(glob.channelUrl || DEFAULT_PACK_URL),
  };
}

async function getForJid(jid) {
  if (!jid) return null;
  try {
    return fromDoc(await getGroupDoc(jid));
  } catch {
    return null;
  }
}

async function apply(opts = {}) {
  if (opts.skipGroupWm) {
    const jid = opts.remoteJid || opts.jid || opts.ctx?.remoteJid || currentCtx()?.remoteJid;
    const pack = await resolvePack(jid).catch(() => composeMeta({ link: DEFAULT_PACK_URL }));
    return {
      ...opts,
      packName: opts.packName || pack.packName,
      authorName: opts.authorName || pack.authorName,
      packId: opts.packId || pack.packId,
      packUrl: opts.packUrl || pack.packUrl || DEFAULT_PACK_URL,
    };
  }
  const jid = opts.remoteJid || opts.jid || opts.ctx?.remoteJid || currentCtx()?.remoteJid;
  const search = opts.searchQuery || opts.packSearch || '';
  if (!jid && !search) return opts;
  const saved = jid ? await getForJid(jid) : null;
  const pack = await resolvePack(jid).catch(() => composeMeta({ link: DEFAULT_PACK_URL }));
  if (search) {
    const meta = composeSearchPack(search, saved);
    return {
      ...opts,
      packName: meta.packName,
      authorName: meta.authorName,
      packId: opts.packId || meta.packId || pack.packId,
      packUrl: pack.packUrl || DEFAULT_PACK_URL,
    };
  }
  if (!saved?.enabled) {
    return {
      ...opts,
      packName: opts.packName || pack.packName,
      authorName: opts.authorName || pack.authorName,
      packId: opts.packId || pack.packId,
      packUrl: opts.packUrl || pack.packUrl || DEFAULT_PACK_URL,
    };
  }
  return {
    ...opts,
    packName: saved.packName,
    authorName: saved.authorName,
    packId: opts.packId || saved.packId || pack.packId,
    packUrl: saved.channelUrl || pack.packUrl || DEFAULT_PACK_URL,
  };
}

async function saveForJid(jid, data = {}) {
  if (!jid) throw new Error('sem jid');
  const GroupSettings = require('../database/models/GroupSettings');
  const composed = composeMeta({
    brand: data.brand,
    slogan: data.slogan,
    link: data.channelUrl || data.link,
    cta: data.cta,
  });
  const update = {
    stickerWmEnabled: data.enabled !== false,
    stickerPackName: composed.packName,
    stickerAuthorName: composed.authorName.slice(0, 280),
    stickerChannelUrl: composed.channelUrl,
    stickerChannelName: String(data.channelName || '').slice(0, 80),
    stickerWmBrand: composed.brand,
    stickerWmSlogan: composed.slogan,
    stickerWmCta: composed.cta,
    stickerWmLinkType: String(data.linkType || '').slice(0, 20),
    stickerPackId: composed.packId,
  };
  const doc = await GroupSettings.findOneAndUpdate(
    { groupJid: jid },
    { $set: update },
    { upsert: true, new: true }
  );
  try {
    const requestCache = require('./requestCache');
    requestCache.forget(requestCache.K.group(jid) + ':doc');
    requestCache.put(requestCache.K.group(jid) + ':doc', doc);
  } catch {}
  return fromDoc(doc);
}

async function clearForJid(jid) {
  if (!jid) throw new Error('sem jid');
  const GroupSettings = require('../database/models/GroupSettings');
  const doc = await GroupSettings.findOneAndUpdate(
    { groupJid: jid },
    {
      $set: {
        stickerWmEnabled: false,
        stickerPackName: '',
        stickerAuthorName: '',
        stickerChannelUrl: '',
        stickerChannelName: '',
        stickerWmBrand: DEFAULT_BRAND,
        stickerWmSlogan: DEFAULT_SLOGAN,
        stickerWmCta: DEFAULT_CTA,
        stickerWmLinkType: '',
        stickerPackId: '',
      },
    },
    { upsert: true, new: true }
  );
  try {
    const requestCache = require('./requestCache');
    requestCache.forget(requestCache.K.group(jid) + ':doc');
    requestCache.put(requestCache.K.group(jid) + ':doc', doc);
  } catch {}
  return null;
}

function statusText(saved, prefix = '.') {
  if (!saved?.enabled) {
    return (
      `📦 *PACOTE DE FIGURINHAS*\n\n` +
      `Ainda não definiste o link deste chat.\n` +
      `«Ver pacote» abre o pack se já estiver guardado; se não, abre o link.\n\n` +
      `*${prefix}defpack* <link do canal ou grupo>\n` +
      `*${prefix}defpack global* <link> — default de TODOS os chats (dono)\n` +
      `*${prefix}defpack off*`
    );
  }
  return (
    `📦 *PACOTE DE FIGURINHAS* — activo\n\n` +
    `«Ver pacote»: pack guardado OU o link\n` +
    `Título (nome do canal): *${saved.packName || saved.channelName || '—'}*\n` +
    `Publisher (liberta Ver pacote): ${saved.authorName || '—'}\n` +
    `Link: ${saved.channelUrl || saved.packUrl || '—'}\n\n` +
    `Descrição:\n\`\`\`\n${saved.description}\n\`\`\`\n\n` +
    `*${prefix}defpack off* — desactivar`
  );
}

module.exports = {
  DEFAULT_BRAND,
  DEFAULT_PACK,
  DEFAULT_SLOGAN,
  DEFAULT_CTA,
  DEFAULT_PACK_URL,
  stablePackId,
  getGlobalDefault,
  saveGlobalDefault,
  resolvePack,
  CHANNEL_RE,
  GROUP_RE,
  bind,
  currentCtx,
  parseChannelLink,
  parseGroupLink,
  parseAnyLink,
  extractChannelNameFromHtml,
  composeMeta,
  composeSearchPack,
  urlToPublisherSite,
  cleanSearchName,
  resolveChannel,
  resolveGroup,
  resolveAnyLink,
  groupInviteUrl,
  fetchChannelFromWeb,
  fetchChannelFromSock,
  getForJid,
  apply,
  saveForJid,
  clearForJid,
  statusText,
};
