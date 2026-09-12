/**
 * DARK BOT v6.8 — Submenus Dinâmicos
 * Sobrepõe os submenus hardcoded com versões que mostram
 * TODOS os comandos de cada categoria (do submenuData).
 */
'use strict';

const sd = require('../submenuData');

async function dynSub(sock, msg, ctx, config, category) {
  const meta = sd.SUBMENU_META[category];
  if (!meta) return;
  
  const ch = require('../caseHandler');
  const nativeCommands = require('../nativeCommands');
  const packageCommands = {
    ...require('../packages/interactions'),
    ...require('../packages/family'),
    ...require('../packages/economy'),
    ...require('../packages/games'),
    ...require('../packages/cheats'),
  };
  
  // Combinar TODOS os comandos de todas as fontes
  const allCmds = [...new Set([
    ...ch.CASES.keys(),
    ...Object.keys(nativeCommands),
    ...Object.keys(packageCommands),
  ])];
  
  const items = sd.buildItems(allCmds, category);
  
  if (!items.length) return;
  
  // Usar sendStyledCommandList do nativeCommands
  const nc = require('../nativeCommands');
  // sendStyledCommandList não é exportada — preciso de a chamar indirectamente
  // Alternativa: construir a resposta directamente
  
  const RE = require('../renderEngine');
  const t = await RE.getTheme(ctx.remoteJid);
  const pe = require('../prefixEngine');
  const p = await pe.getActivePrefix(ctx.remoteJid).catch(() => config.bot.prefix);
  const botName = config.bot.name || 'DARK BOT';

  // v6.40: cargo do utilizador — mostrado no rodapé do submenu
  const roleResolver = require('../roleResolver');
  const roleInfo = ctx._role || await roleResolver.resolveRole({ ctx, msg, sock })
    .catch(() => ({ cargo: '🆓 FREE', vip: 'INATIVO ❌' }));
  
  // Separar sel vs texto
  const selCmds = items.filter(it => it.sel === true);
  const txtCmds = items.filter(it => it.sel !== true);
  
  // Texto com bordas do change
  const textBody = RE.renderSubmenu(t, meta.title.replace(/^[^\s]+\s/, ''), txtCmds.map(it => ({
    name: it.cmd,
    desc: it.desc || '',
    group: it.subcat || undefined,   // v7.24: secção dentro do submenu
  })), { prefix: p, botName });
  
  // Lista de seleção
  const rows = selCmds.slice(0, 24).map(it => ({
    title: `${it.emoji || t.bullet || '▸'} ${p}${it.cmd}`,
    description: (it.desc || '').slice(0, 72),
    id: `${p}${it.cmd}`,
  }));
  
  let sent = false;
  if (rows.length) {
    try {
      const { generateWAMessageFromContent, proto } = require('@systemzero/baileys');
      const listParams = {
        title: `${t.icon || '🕸️'} ${meta.title}`,
        sections: [{ title: `${t.icon || '🕸️'} AÇÕES DIRECTAS`, rows }],
      };
      const m = generateWAMessageFromContent(ctx.remoteJid, {
        interactiveMessage: proto.Message.InteractiveMessage.fromObject({
          body: proto.Message.InteractiveMessage.Body.fromObject({ text: textBody }),
          footer: proto.Message.InteractiveMessage.Footer.fromObject({ text: `${t.icon || '🕸️'} ${botName} · ${roleInfo.cargo}` }),
          header: proto.Message.InteractiveMessage.Header.fromObject({ title: '', hasMediaAttachment: false }),
          nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
            buttons: [{ name: 'single_select', buttonParamsJson: JSON.stringify(listParams) }],
          }),
        }),
      }, { userJid: sock.user?.id, quoted: msg });
      await sock.relayMessage(ctx.remoteJid, m.message, {
        messageId: m.key.id,
        additionalNodes: [{ tag: 'biz', attrs: {}, content: [{
          tag: 'interactive', attrs: { type: 'native_flow', v: '1' },
          content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }],
        }]}],
      });
      sent = true;
    } catch {}
  }
  
  if (!sent) {
    const footer = `\n\n> ${t.icon || '🕸️'} ${roleInfo.cargo} · VIP: ${roleInfo.vip}`;
    await sock.sendMessage(ctx.remoteJid, { text: textBody + footer }, { quoted: msg });
  }
}

module.exports = function registerDynamicSubmenus(registerCase) {
  // Verificar se usuário pode ver o submenu
  // v6.40: usa roleResolver — mesma hierarquia do menu principal
  // 👑 Dono > 💎 VIP > 🛡️ Admin > 🆓 Free
  async function canSeeSubmenu(ctx, category, sock = null, msg = null) {
    const roleResolver = require('../roleResolver');
    const r = await roleResolver.resolveRole({ ctx, msg, sock: sock || ctx.sock })
      .catch(() => ({ isOwner: false, isVip: false, isAdmin: false }));

    // Guarda no ctx para reutilização no resto do fluxo (evita novas queries)
    ctx._role = r;

    // Dono sempre vê tudo
    if (r.isOwner) return true;

    // Submenus SÓ para dono — nunca aparecem para VIP/Admin/Free
    const OWNER_ONLY = ['owner', 'dono', 'menudono', 'system', 'sistema'];
    if (OWNER_ONLY.includes(category)) return false;

    // Submenus SÓ para VIP (e dono) — nunca aparecem para Free
    const VIP_ONLY = ['portal18', 'cmdsocultos', 'adult', 'menu18', 'vip', 'premium'];
    if (VIP_ONLY.includes(category)) return r.isVip;

    // Submenus de administração — admin do grupo, VIP ou dono
    const ADMIN_ONLY = ['admin', 'menuadm', 'moderacao'];
    if (ADMIN_ONLY.includes(category)) return r.isAdmin || r.isVip;

    // Todos os outros submenus são visíveis para todos
    return true;
  }
  
  // Sobrepõe TODOS os submenus com versões dinâmicas
  registerCase(['menudownload', 'down', 'menudl', 'downloads'], async ({ sock, msg, ctx, config }) => {
    if (!await canSeeSubmenu(ctx, 'downloads', sock, msg)) {
      return sock.sendMessage(ctx.remoteJid, { text: '🚫 Submenu exclusivo para VIPs. Use .vip para ver planos.' }, { quoted: msg });
    }
    return dynSub(sock, msg, ctx, config, 'downloads');
  });
  
  registerCase(['menustickers', 'menufigurinhas'], async ({ sock, msg, ctx, config }) => {
    return dynSub(sock, msg, ctx, config, 'stickers');
  });
  
  registerCase(['menuia', 'menubotia'], async ({ sock, msg, ctx, config }) => {
    return dynSub(sock, msg, ctx, config, 'ia');
  });
  
  registerCase(['menugrupo', 'menuadm', 'menuadmin'], async ({ sock, msg, ctx, config }) => {
    // Visível para todos (informativo), mas o cargo aparece no rodapé
    return dynSub(sock, msg, ctx, config, 'admin');
  });
  
  registerCase(['menujogos', 'menugames'], async ({ sock, msg, ctx, config }) => {
    return dynSub(sock, msg, ctx, config, 'jogos');
  });
  
  registerCase(['menueconomia', 'menucoins', 'menubank'], async ({ sock, msg, ctx, config }) => {
    return dynSub(sock, msg, ctx, config, 'economia');
  });
  
  registerCase(['menuinteracoes', 'menufamilia', 'brincadeiras', 'menudiversao'], async ({ sock, msg, ctx, config }) => {
    return dynSub(sock, msg, ctx, config, 'interacoes');
  });
  
  registerCase(['menuaudio', 'menualteradores'], async ({ sock, msg, ctx, config }) => {
    return dynSub(sock, msg, ctx, config, 'audio');
  });

  registerCase(['menustatus'], async ({ sock, msg, ctx, config }) => {
    return dynSub(sock, msg, ctx, config, 'info');
  });
  
  // Novos submenus que não existiam
  registerCase(['menutexto', 'menuutilidades'], async ({ sock, msg, ctx, config }) => {
    return dynSub(sock, msg, ctx, config, 'texto');
  });
  
  registerCase(['menusearch', 'menustalk'], async ({ sock, msg, ctx, config }) => {
    return dynSub(sock, msg, ctx, config, 'search');
  });
  
  registerCase(['menulogos', 'menulogos2', 'menuefeitos'], async ({ sock, msg, ctx, config }) => {
    return dynSub(sock, msg, ctx, config, 'logos');
  });
  
  registerCase(['menuinfo', 'menuperfil'], async ({ sock, msg, ctx, config }) => {
    return dynSub(sock, msg, ctx, config, 'info');
  });
  
  registerCase(['menuzoeira', 'menumedidores'], async ({ sock, msg, ctx, config }) => {
    return dynSub(sock, msg, ctx, config, 'zoeira');
  });
  
  // v7.24: rank<adjetivo> passou para zoeira (medidores) — o submenu
  // 'rank' já não existe; menurank abre os medidores/rankings.
  registerCase(['menurank', 'menuranking'], async ({ sock, msg, ctx, config }) => {
    return dynSub(sock, msg, ctx, config, 'zoeira');
  });
  
      registerCase(['submenuRPG', 'menurpg', 'menurpg2'], async ({ sock, msg, ctx, config }) => {
    return dynSub(sock, msg, ctx, config, 'economia');
  });

  // v6.40: 'maiscmds' abria o submenu do DONO para toda a gente — corrigido.
  registerCase(['maiscmds', 'menumais'], async ({ sock, msg, ctx, config }) => {
    if (!await canSeeSubmenu(ctx, 'owner', sock, msg)) {
      return sock.sendMessage(ctx.remoteJid,
        { text: '👑 *Submenu exclusivo do DONO SUPREMO.*\n\n🆓 O teu cargo actual não tem acesso.' },
        { quoted: msg });
    }
    return dynSub(sock, msg, ctx, config, 'owner');
  });

  registerCase(['menuowner', 'menudono', 'menusystem'], async ({ sock, msg, ctx, config }) => {
    // Silêncio total para não-donos: o submenu nem sequer existe para eles.
    if (!await canSeeSubmenu(ctx, 'owner', sock, msg)) return;
    return dynSub(sock, msg, ctx, config, 'owner');
  });

  // Submenus VIP — não aparecem para Free
  // v6.48: 'menu18' e 'cmdsocultos' JÁ TÊM implementação própria em
  // nativeCommands.js (portal 18+ real, com hentai/xvideo/hotchat/…
  // e envio no PV por segurança). Como os cases correm ANTES dos
  // nativos, este handler estava a roubá-los e a mostrar a categoria
  // 'outros' — 189 comandos misturados, incluindo lixo interno como
  // '__change_theme_handler__' e 'acordaaura'. Nada de conteúdo 18+.
  //
  // Agora só fazemos o controlo de acesso; se o utilizador pode ver,
  // devolvemos false para o comando nativo correcto tratar do resto.
  registerCase(['menu18', 'cmdsocultos', 'menuvip'], async ({ sock, msg, ctx }) => {
    if (!await canSeeSubmenu(ctx, 'menu18', sock, msg)) {
      return sock.sendMessage(ctx.remoteJid,
        { text: '💎 *Submenu exclusivo VIP.*\n\n🆓 Cargo actual: FREE — VIP: INATIVO ❌\nUsa `.vip` para veres os planos.' },
        { quoted: msg });
    }
    return false; // → cai no nativeCommands.menu18 / cmdsocultos
  });
};
