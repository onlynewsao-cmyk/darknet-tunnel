#!/usr/bin/env node
/**
 * DARK BOT — .pack (trocar nome/autor/slogan/link do pack)
 *
 * Cobre:
 *   • helpers puros: parseSub, isOnOff, limpar, packStatusText
 *   • roteamento do case com ambiente simulado (BD/cache/wm falsos):
 *     status, nome (grupo e global), autor, slogan, on/off, visivel,
 *     permissões (admin vs dono), link inválido, subcomando desconhecido.
 *
 * Uso: node scripts/test-pack.js
 */
'use strict';

process.env.OWNER_NUMBER = '244945280380';
process.env.BOT_PREFIX = '.';

const path = require('path');
const Module = require('module');
const orig = Module.prototype.require;

// ── Fakes ──────────────────────────────────────────────────────────
const STORE = {}; // BotConfig + cache partilhados

const fakeBcc = {
  get: async (k, d) => (k in STORE ? STORE[k] : d),
  set: async (k, v) => { STORE[k] = v; },
  clear: () => {},
};

const fakeBotConfig = {
  set: async (k, v) => { STORE[k] = v; },
  get: async (k, d) => (k in STORE ? STORE[k] : d),
};

const fakeWm = {
  _groups: new Map(),
  _global: null,
  async getForJid(jid) { return this._groups.get(jid) || null; },
  async saveForJid(jid, data) {
    const prev = this._groups.get(jid) || {};
    const next = {
      enabled: data.enabled !== false,
      brand: data.brand !== undefined ? data.brand : prev.brand,
      slogan: data.slogan !== undefined ? data.slogan : prev.slogan,
      channelUrl: data.channelUrl !== undefined ? data.channelUrl : (prev.channelUrl || ''),
      channelName: data.channelName !== undefined ? data.channelName : (prev.channelName || ''),
      linkType: data.linkType !== undefined ? data.linkType : (prev.linkType || ''),
      packName: (data.channelName !== undefined ? data.channelName : prev.channelName) || (data.brand !== undefined ? data.brand : prev.brand) || '',
    };
    this._groups.set(jid, next);
    return next;
  },
  async clearForJid(jid) { this._groups.set(jid, { enabled: false, channelUrl: '' }); return null; },
  async saveGlobalDefault(data) {
    this._global = { packName: data.channelName || data.brand || 'GLOBAL', channelUrl: data.link || data.channelUrl || '' };
    return this._global;
  },
  async resolveAnyLink(text) {
    const t = String(text || '');
    if (/channel\//.test(t)) return { type: 'channel', url: t, name: '' };
    if (/chat\.whatsapp\.com/.test(t)) return { type: 'group', url: t, name: '' };
    return null;
  },
  statusText(saved, p) {
    return saved?.enabled ? 'PACK ACTIVO' : 'PACK OFF';
  },
};

Module.prototype.require = function (id) {
  if (typeof id === 'string' && id.endsWith('botConfigCache')) return fakeBcc;
  if (typeof id === 'string' && /models[/\\]BotConfig$/.test(id)) return fakeBotConfig;
  if (typeof id === 'string' && id.endsWith('stickerWm')) return fakeWm;
  return orig.apply(this, arguments);
};

const packModule = require(path.join(__dirname, '..', 'src', 'bot', 'cases', 'pack'));

let handler = null;
packModule((cmds, fn) => {
  if (Array.isArray(cmds) && cmds.some(c => c === 'pack' || c === 'pacote')) handler = fn;
});

let ok = 0, fail = 0;
const t = (n, c, e) => { e = e || ''; c ? ok++ : fail++; console.log('  ' + (c ? '✅' : '❌') + ' ' + n + (e ? ' → ' + String(e).slice(0, 90) : '')); };

// ── Invocador do handler ──────────────────────────────────────────
function ctxFactory({ isOwner = true, isGroup = false, admin = false } = {}) {
  const out = [];
  const ctx = {
    remoteJid: isGroup ? '120363000000@g.us' : '244945280380@s.whatsapp.net',
    isGroup,
    isOwner,
    senderNumber: isOwner ? '244945280380' : '244900000000',
    pushName: isOwner ? 'Dark' : 'User',
    groupName: isGroup ? 'Grupo Teste' : 'PV',
    groupMeta: null,
  };
  const sock = { sendMessage: async () => ({}) };
  return {
    ctx, sock,
    reply: async (text) => { out.push(text); return text; },
    react: async () => {},
    isAdminFn: async () => admin,
    args: (arr) => ({ sock, ctx, args: arr, prefix: '.', reply: async (text) => { out.push(text); return text; }, react: async () => {}, isOwner, isAdminFn: async () => admin }),
    out,
  };
}

(async () => {
  // ══════════════════════════════════════════════════════════
  console.log('\n╔═══ 1. Helpers puros ═══╗');
  // ══════════════════════════════════════════════════════════
  {
    const H = packModule;
    t('parseSub simples', JSON.stringify(H.parseSub(['nome', 'Dark Pack'])) === JSON.stringify({ global: false, sub: 'nome', value: 'Dark Pack' }), JSON.stringify(H.parseSub(['nome', 'Dark Pack'])));
    t('parseSub global', JSON.stringify(H.parseSub(['global', 'nome', 'X'])) === JSON.stringify({ global: true, sub: 'nome', value: 'X' }), JSON.stringify(H.parseSub(['global', 'nome', 'X'])));
    t('parseSub vazio', JSON.stringify(H.parseSub([])) === JSON.stringify({ global: false, sub: '', value: '' }), JSON.stringify(H.parseSub([])));
    t('isOnOff on', H.isOnOff('on') === 'on' && H.isOnOff('SIM') === 'on' && H.isOnOff('1') === 'on', '');
    t('isOnOff off', H.isOnOff('off') === 'off' && H.isOnOff('não') === 'off' && H.isOnOff('0') === 'off', '');
    t('isOnOff nulo', H.isOnOff('banana') === null, String(H.isOnOff('banana')));
    t('limpar corta espaços', H.limpar('  Dark   Pack  ') === 'Dark Pack', H.limpar('  Dark   Pack  '));
    const st = H.packStatusText('.', { enabled: true, visible: false, packName: 'DARK BOT', author: 'Dark Net', text: 'DARK BOT' }, null, false);
    t('status global monta texto', st.includes('DARK BOT') && st.includes('Dark Net') && st.includes('Global'), st.slice(0, 40));
  }

  // ══════════════════════════════════════════════════════════
  console.log('\n╔═══ 2. Roteamento: status ═══╗');
  // ══════════════════════════════════════════════════════════
  {
    const { args, out } = ctxFactory({ isOwner: true });
    await handler(args([]));
    t('Status sem argumentos responde', out.length === 1 && out[0].includes('PACK DE FIGURINHAS'), (out[0] || '').slice(0, 30));

    const g = ctxFactory({ isOwner: true, isGroup: true });
    await handler(g.args(['status']));
    t('Status em grupo responde', g.out[0].includes('Este grupo'), (g.out[0] || '').slice(0, 60));
  }

  // ══════════════════════════════════════════════════════════
  console.log('\n╔═══ 3. Nome (global vs grupo) ═══╗');
  // ══════════════════════════════════════════════════════════
  {
    // Dono no PV → global
    const pv = ctxFactory({ isOwner: true });
    await handler(pv.args(['nome', 'DARK PACK 2']));
    t('Dono no PV: nome → global', STORE.sticker_pack_name === 'DARK PACK 2', String(STORE.sticker_pack_name));

    // Dono no grupo → grupo
    const grp = ctxFactory({ isOwner: true, isGroup: true });
    await handler(grp.args(['nome', 'Pack do Grupo']));
    t('Dono no grupo: nome → grupo', fakeWm._groups.get(grp.ctx.remoteJid)?.channelName === 'Pack do Grupo', String(fakeWm._groups.get(grp.ctx.remoteJid)?.channelName));

    // global explícito
    await handler(pv.args(['global', 'nome', 'GLOBAL PACK']));
    t('global nome → global', STORE.sticker_pack_name === 'GLOBAL PACK', String(STORE.sticker_pack_name));

    // sem valor → pede valor
    const pv2 = ctxFactory({ isOwner: true });
    await handler(pv2.args(['nome']));
    t('nome sem valor pede uso', (pv2.out[0] || '').includes('Usa'), (pv2.out[0] || '').slice(0, 30));
  }

  // ══════════════════════════════════════════════════════════
  console.log('\n╔═══ 4. Autor / slogan / texto ═══╗');
  // ══════════════════════════════════════════════════════════
  {
    const pv = ctxFactory({ isOwner: true });
    await handler(pv.args(['autor', 'Dark Net Oficial']));
    t('autor global', STORE.sticker_author_name === 'Dark Net Oficial', String(STORE.sticker_author_name));

    await handler(pv.args(['slogan', 'O melhor do mundo']));
    t('slogan global', STORE.sticker_wm_slogan === 'O melhor do mundo', String(STORE.sticker_wm_slogan));

    await handler(pv.args(['texto', 'DARK BOT']));
    t('texto visível global', STORE.sticker_watermark_text === 'DARK BOT', String(STORE.sticker_watermark_text));

    const grp = ctxFactory({ isOwner: true, isGroup: true });
    await handler(grp.args(['marca', 'MARCA GRUPO']));
    t('marca no grupo → brand', fakeWm._groups.get(grp.ctx.remoteJid)?.brand === 'MARCA GRUPO', String(fakeWm._groups.get(grp.ctx.remoteJid)?.brand));
  }

  // ══════════════════════════════════════════════════════════
  console.log('\n╔═══ 5. on/off + visivel ═══╗');
  // ══════════════════════════════════════════════════════════
  {
    const pv = ctxFactory({ isOwner: true });
    await handler(pv.args(['off']));
    t('off global → desliga marca', STORE.sticker_watermark_enabled === false, String(STORE.sticker_watermark_enabled));
    await handler(pv.args(['on']));
    t('on global → liga marca', STORE.sticker_watermark_enabled === true, String(STORE.sticker_watermark_enabled));

    await handler(pv.args(['visivel', 'on']));
    t('visivel on', STORE.sticker_visible_watermark === true, String(STORE.sticker_visible_watermark));
    await handler(pv.args(['visivel', 'off']));
    t('visivel off', STORE.sticker_visible_watermark === false, String(STORE.sticker_visible_watermark));

    const pv2 = ctxFactory({ isOwner: true });
    await handler(pv2.args(['visivel']));
    t('visivel sem valor pede on/off', (pv2.out[0] || '').includes('on'), (pv2.out[0] || '').slice(0, 30));
  }

  // ══════════════════════════════════════════════════════════
  console.log('\n╔═══ 6. Permissões ═══╗');
  // ══════════════════════════════════════════════════════════
  {
    const adm = ctxFactory({ isOwner: false, isGroup: true, admin: true });
    await handler(adm.args(['nome', 'Pack Admin']));
    t('Admin de grupo muda o pack do grupo', fakeWm._groups.get(adm.ctx.remoteJid)?.channelName === 'Pack Admin', String(fakeWm._groups.get(adm.ctx.remoteJid)?.channelName));

    const adm2 = ctxFactory({ isOwner: false, isGroup: true, admin: true });
    await handler(adm2.args(['global', 'nome', 'X']));
    t('Admin NÃO muda o global', (adm2.out[0] || '').includes('Dono'), (adm2.out[0] || '').slice(0, 30));

    const naoAdm = ctxFactory({ isOwner: false, isGroup: true, admin: false });
    await handler(naoAdm.args(['nome', 'X']));
    t('Não-admin é barrado', (naoAdm.out[0] || '').includes('Dono') || (naoAdm.out[0] || '').includes('Admins'), (naoAdm.out[0] || '').slice(0, 40));

    const pvNaoDono = ctxFactory({ isOwner: false, isGroup: false });
    await handler(pvNaoDono.args(['nome', 'X']));
    t('Não-dono no PV é barrado', (pvNaoDono.out[0] || '').includes('Dono'), (pvNaoDono.out[0] || '').slice(0, 40));
  }

  // ══════════════════════════════════════════════════════════
  console.log('\n╔═══ 7. Link + subcomando desconhecido ═══╗');
  // ══════════════════════════════════════════════════════════
  {
    const grp = ctxFactory({ isOwner: true, isGroup: true });
    await handler(grp.args(['link', 'https://whatsapp.com/channel/0029VbC8voN4Y9lszc9VuT2D']));
    t('link de canal guardado no grupo', (fakeWm._groups.get(grp.ctx.remoteJid)?.channelUrl || '').includes('channel/'), String(fakeWm._groups.get(grp.ctx.remoteJid)?.channelUrl));

    const inv = ctxFactory({ isOwner: true });
    await handler(inv.args(['link', 'isto nao e um link']));
    t('link inválido recusado', (inv.out[0] || '').includes('reconheci'), (inv.out[0] || '').slice(0, 40));

    const desc = ctxFactory({ isOwner: true });
    await handler(desc.args(['batata']));
    t('subcomando desconhecido', (desc.out[0] || '').includes('desconhecido'), (desc.out[0] || '').slice(0, 40));
  }

  console.log('\n───────────────────────────────');
  console.log((fail === 0 ? '✅' : '❌') + ` ${ok} OK / ${fail} FALHOU\n`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error('💥 Erro no teste:', e);
  process.exit(1);
});
