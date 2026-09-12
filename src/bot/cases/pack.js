/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║   DARK BOT — .pack (trocar nome do pack etc.)                 ║
 * ║                                                               ║
 * ║   Um comando só para configurar o PACK das figurinhas:        ║
 * ║   nome, autor/marca, slogan, link e marca d'água.             ║
 * ║                                                               ║
 * ║   • No GRUPO (dono/admin) → muda o pack DESTE grupo           ║
 * ║   • No PV (dono) ou com "global" → muda o default global      ║
 * ║                                                               ║
 * ║   Uso:                                                        ║
 * ║     .pack                        → estado actual               ║
 * ║     .pack nome <Nome do Pack>    → muda o nome/título          ║
 * ║     .pack autor <Autor>          → muda o autor/marca          ║
 * ║     .pack slogan <Frase>         → muda o slogan               ║
 * ║     .pack link <link canal/grupo>→ muda o link «Ver pacote»    ║
 * ║     .pack on | off               → liga/desliga a marca        ║
 * ║     .pack visivel on | off       → texto visível no sticker    ║
 * ║     .pack global <sub> <valor>   → força o default global      ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */
'use strict';

/* ══════════════════════════ Helpers puros (testáveis) ══════════════════════════ */

const GLOBAL_KEYS = new Set(['global', 'default', 'padrao', 'padrão']);
const STATUS_KEYS = new Set(['status', 'ver', 'info', 'mostrar']);
const NOME_KEYS = new Set(['nome', 'name', 'titulo', 'título', 'canal']);
const AUTOR_KEYS = new Set(['autor', 'author', 'marca', 'brand']);
const TEXTO_KEYS = new Set(['texto', 'text', 'wm', 'marcavisivel']);
const SLOGAN_KEYS = new Set(['slogan', 'frase']);
const LINK_KEYS = new Set(['link', 'url']);

/**
 * Separa os argumentos em { global, sub, value }.
 *   ['.pack', 'global', 'nome', 'X'] → { global:true, sub:'nome', value:'X' }
 *   ['.pack', 'nome', 'X']           → { global:false, sub:'nome', value:'X' }
 */
function parseSub(args) {
  const a = (Array.isArray(args) ? args : []).map(x => String(x));
  const first = (a[0] || '').toLowerCase();
  if (GLOBAL_KEYS.has(first)) {
    return { global: true, sub: (a[1] || '').toLowerCase(), value: a.slice(2).join(' ').trim() };
  }
  return { global: false, sub: first, value: a.slice(1).join(' ').trim() };
}

/** 'on'/'off'/nulo a partir de sinónimos PT/EN. */
function isOnOff(v) {
  const s = String(v || '').toLowerCase().trim();
  if (['on', 'sim', 'true', '1', 'ativo', 'ativar', 'ligar'].includes(s)) return 'on';
  if (['off', 'nao', 'não', 'false', '0', 'inativo', 'desativo', 'desativar', 'desligar'].includes(s)) return 'off';
  return null;
}

/** Normaliza o texto (limpa espaços, corta no tamanho). */
function limpar(val, max = 80) {
  return String(val || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Monta o texto de estado. Puro — não toca em BD nem socket. */
function packStatusText(prefix, glob, chat, isGroup) {
  const p = prefix || '.';
  const onOff = (b) => (b ? '✅ ON' : '🛑 OFF');
  let out = `📦 *PACK DE FIGURINHAS*\n\n` +
    `🌐 *Global* (default de todos os stickers):\n` +
    `   Nome: *${glob.packName || '—'}*\n` +
    `   Autor: *${glob.author || '—'}*\n` +
    `   Marca d'água: ${onOff(glob.enabled)}\n` +
    `   Visível: ${onOff(glob.visible)}\n` +
    `   Texto visível: *${glob.text || '—'}*\n`;

  if (isGroup) {
    if (chat && (chat.enabled || chat.channelUrl)) {
      out += `\n🏠 *Este grupo*:\n` +
        `   Título: *${chat.packName || chat.channelName || '—'}*\n` +
        `   Marca: *${chat.brand || '—'}*\n` +
        `   Link: ${chat.channelUrl || chat.packUrl || '—'}\n`;
    } else {
      out += `\n🏠 *Este grupo*: ainda sem pack próprio.\n`;
    }
  }

  out += `\n*Comandos:*\n` +
    `   ${p}pack nome <Nome>\n` +
    `   ${p}pack autor <Autor>\n` +
    `   ${p}pack slogan <Frase>\n` +
    `   ${p}pack link <link canal/grupo>\n` +
    `   ${p}pack on | off\n` +
    `   ${p}pack visivel on | off\n` +
    `   ${p}pack global nome <Nome>  (só dono)\n`;
  return out;
}

/* ══════════════════════════ Snapshot / setters ══════════════════════════ */

async function globalSnapshot() {
  const bcc = require('../botConfigCache');
  const config = require('../../config');
  return {
    enabled: await bcc.get('sticker_watermark_enabled', true).catch(() => true),
    visible: await bcc.get('sticker_visible_watermark', false).catch(() => false),
    packName: await bcc.get('sticker_pack_name', `${config.bot.name} • ${config.owner.name}`).catch(() => ''),
    author: await bcc.get('sticker_author_name', 'auto').catch(() => 'auto'),
    text: await bcc.get('sticker_watermark_text', config.bot.name || 'DARK BOT').catch(() => 'DARK BOT'),
  };
}

async function setGlobal(key, val) {
  const BotConfig = require('../database/models/BotConfig');
  await BotConfig.set(key, val);
  try { require('../botConfigCache').clear(); } catch {}
}

async function chatSnapshot(jid) {
  const wm = require('../stickerWm');
  return wm.getForJid(jid).catch(() => null);
}

async function setChat(jid, patch) {
  const wm = require('../stickerWm');
  const cur = await wm.getForJid(jid).catch(() => null);
  return wm.saveForJid(jid, {
    brand: patch.brand !== undefined ? patch.brand : cur?.brand,
    slogan: patch.slogan !== undefined ? patch.slogan : cur?.slogan,
    channelUrl: patch.channelUrl !== undefined ? patch.channelUrl : (cur?.channelUrl || ''),
    cta: patch.cta !== undefined ? patch.cta : cur?.cta,
    channelName: patch.channelName !== undefined ? patch.channelName : (cur?.channelName || ''),
    linkType: patch.linkType !== undefined ? patch.linkType : (cur?.linkType || ''),
  });
}

async function setGlobalLink(url, name) {
  const wm = require('../stickerWm');
  return wm.saveGlobalDefault({ link: url, channelName: name || '' });
}

async function setGlobalSlogan(val) {
  const BotConfig = require('../database/models/BotConfig');
  await BotConfig.set('sticker_wm_slogan', val);
  try { require('../botConfigCache').clear(); } catch {}
}

/* ══════════════════════════ Case ══════════════════════════ */

module.exports = function registerPack(registerCase) {
  registerCase(['pack', 'pacote'], async ({ sock, ctx, args, prefix, reply, react, isOwner, isAdminFn }) => {
    const p = prefix || '.';
    const jid = ctx.remoteJid || '';
    const isGroup = !!ctx.isGroup;
    const parsed = parseSub(args);

    // ── STATUS ────────────────────────────────────────────────
    if (!parsed.sub || STATUS_KEYS.has(parsed.sub)) {
      const glob = await globalSnapshot();
      const chat = isGroup ? await chatSnapshot(jid) : null;
      return reply(packStatusText(p, glob, chat, isGroup));
    }

    // ── Permissões ────────────────────────────────────────────
    let isAdmin = false;
    if (isGroup && !isOwner) {
      try { isAdmin = typeof isAdminFn === 'function' ? await isAdminFn() : false; } catch {}
    }
    const podeChat = isOwner || isAdmin;
    if (!podeChat) {
      return reply(isGroup
        ? '🚫 Só o *Dono* ou *Admins* do grupo podem mudar o pack aqui.'
        : '🚫 Só o *Dono* muda o pack.');
    }

    // Acções GLOBAL (forçadas com "global") exigem dono
    if (parsed.global && !isOwner) {
      return reply('🚫 Só o *Dono* define o pack *global*.');
    }

    const sub = parsed.sub;
    const value = limpar(parsed.value);

    // ── ON / OFF ──────────────────────────────────────────────
    if (sub === 'on' || sub === 'off') {
      const on = sub === 'on';
      // em grupo (sem "global") → pack do grupo; senão → marca global
      if (isGroup && !parsed.global) {
        const cur = await chatSnapshot(jid);
        if (on) {
          if (!cur) return reply(`ℹ️ Este grupo ainda não tem pack. Define primeiro:\n*${p}pack nome* <Nome>  ou  *${p}pack link* <link>`);
          await setChat(jid, {});
          return reply(`✅ Pack *deste grupo*: *ACTIVO*.\n${require('../stickerWm').statusText(await chatSnapshot(jid), p)}`);
        }
        await require('../stickerWm').clearForJid(jid);
        return reply('✅ Pack deste grupo *DESACTIVADO*. Volta ao default global.');
      }
      await setGlobal('sticker_watermark_enabled', on);
      return reply(`✅ Marca d'água *global*: ${on ? '✅ ON' : '🛑 OFF'}.`);
    }

    // ── VISIVEL on/off (global) ───────────────────────────────
    if (sub === 'visivel' || sub === 'visível') {
      if (!isOwner) return reply('🚫 Só o *Dono* muda a marca visível global.');
      const st = isOnOff(parsed.value);
      if (!st) return reply(`Usa: *${p}pack visivel* on | off`);
      await setGlobal('sticker_visible_watermark', st === 'on');
      return reply(`✅ Texto visível no sticker: ${st === 'on' ? '✅ ON' : '🛑 OFF'}.`);
    }

    // ── NOME ──────────────────────────────────────────────────
    if (NOME_KEYS.has(sub)) {
      if (!value) return reply(`Usa: *${p}pack ${parsed.global ? 'global ' : ''}nome* <Nome do Pack>`);
      if (isGroup && !parsed.global) {
        await setChat(jid, { channelName: value });
        return reply(`✅ Título do pack *deste grupo*: *${value}*\n\n${require('../stickerWm').statusText(await chatSnapshot(jid), p)}`);
      }
      await setGlobal('sticker_pack_name', value.slice(0, 80));
      return reply(`✅ Nome do pack *global*: *${value.slice(0, 80)}*`);
    }

    // ── AUTOR / MARCA ─────────────────────────────────────────
    if (AUTOR_KEYS.has(sub)) {
      if (!value) return reply(`Usa: *${p}pack ${parsed.global ? 'global ' : ''}autor* <Autor>`);
      if (isGroup && !parsed.global) {
        await setChat(jid, { brand: value });
        return reply(`✅ Marca do pack *deste grupo*: *${value}*\n\n${require('../stickerWm').statusText(await chatSnapshot(jid), p)}`);
      }
      await setGlobal('sticker_author_name', value.slice(0, 80));
      return reply(`✅ Autor do pack *global*: *${value.slice(0, 80)}*`);
    }

    // ── TEXTO VISÍVEL (marca no sticker) — global, dono ──────
    if (TEXTO_KEYS.has(sub)) {
      if (!isOwner) return reply('🚫 Só o *Dono* muda o texto visível da marca.');
      if (!value) return reply(`Usa: *${p}pack texto* <Texto>`);
      await setGlobal('sticker_watermark_text', value.slice(0, 32));
      return reply(`✅ Texto da marca visível: *${value.slice(0, 32)}*`);
    }

    // ── SLOGAN ────────────────────────────────────────────────
    if (SLOGAN_KEYS.has(sub)) {
      if (!value) return reply(`Usa: *${p}pack ${parsed.global ? 'global ' : ''}slogan* <Frase>`);
      if (isGroup && !parsed.global) {
        await setChat(jid, { slogan: value });
        return reply(`✅ Slogan do pack *deste grupo*: *${value}*\n\n${require('../stickerWm').statusText(await chatSnapshot(jid), p)}`);
      }
      await setGlobalSlogan(value.slice(0, 80));
      return reply(`✅ Slogan *global*: *${value.slice(0, 80)}*`);
    }

    // ── LINK ──────────────────────────────────────────────────
    if (LINK_KEYS.has(sub)) {
      if (!value) return reply(`Cola o link: *${p}pack ${parsed.global ? 'global ' : ''}link* https://whatsapp.com/channel/...`);
      react('⏳');
      const wm = require('../stickerWm');
      const detected = await wm.resolveAnyLink(value, sock).catch(() => null);
      if (!detected?.url) {
        return reply(`❌ Não reconheci esse link. Usa um link de canal ou grupo do WhatsApp:\n*${p}pack link* https://whatsapp.com/channel/...`);
      }
      if (isGroup && !parsed.global) {
        const cur = await chatSnapshot(jid);
        await setChat(jid, {
          channelUrl: detected.url,
          channelName: detected.name || cur?.channelName || '',
          linkType: detected.type || '',
        });
        react('✅');
        return reply(`✅ Link de *${detected.type === 'group' ? 'grupo' : 'canal'}* guardado para este grupo.\n` +
          (detected.name ? '' : `Não apanhei o nome. Usa *${p}pack nome* Nome do Canal\n\n`) +
          require('../stickerWm').statusText(await chatSnapshot(jid), p));
      }
      const saved = await setGlobalLink(detected.url, detected.name || '');
      react('✅');
      return reply(`✅ Link *global* do «Ver pacote»:\n` +
        `Nome: *${saved.packName}*\nLink: ${saved.channelUrl}\n` +
        (detected.name ? '' : `Se o nome não veio, usa *${p}pack global nome* Nome do Canal`));
    }

    return reply(`❓ Subcomando desconhecido: *${sub}*\nUsa *${p}pack* para ver tudo o que podes mudar.`);
  });
};

module.exports.parseSub = parseSub;
module.exports.isOnOff = isOnOff;
module.exports.limpar = limpar;
module.exports.packStatusText = packStatusText;
