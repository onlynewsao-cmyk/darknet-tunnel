/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║   DARK BOT v5 — cases/change.js                             ║
 * ║   Sistema de Temas Globais — !change                        ║
 * ║                                                             ║
 * ║   !change          → lista interativa (single_select)       ║
 * ║   !change <nome>   → aplica tema imediatamente              ║
 * ║   !change reset    → volta ao tema dark (padrão)            ║
 * ║   !change info     → info do tema activo                    ║
 * ║   !change preview <n> → preview sem aplicar                 ║
 * ╚══════════════════════════════════════════════════════════════╝
 */
'use strict';

const config          = require('../../config');
const BotConfig       = require('../../database/models/BotConfig');
const botConfigCache  = require('../botConfigCache');
const changeThemes    = require('../changeThemes');

module.exports = function registerChangeCases(registerCase) {

  registerCase(
    ['change', 'tema', 'settheme', 'changetheme', 'themechange', 'mudarstema'],
    async ({ sock, msg, ctx, args, prefix, isOwner, reply }) => {

      const botName = config.bot?.name || 'DARK BOT';

      const currentThemeName = await botConfigCache
        .get('active_theme', 'dark').catch(() => 'dark');
      const currentTheme = changeThemes.getTheme(currentThemeName);

      const { generateWAMessageFromContent, proto } =
        require('@systemzero/baileys');

      // ── Sem args → lista interativa de seleção ─────────────────────
      if (!args.length) {
        const t = currentTheme;

        // v7.23: paginado (10 por secção) — ver changeThemes.paginarTemas
        const seccoes = changeThemes.paginarTemas(10, t.icon);

        const bodyTxt =
          `${t.icon} *TEMAS DO BOT — ${botName}*\n\n` +
          `${t.bullet} Tema actual: *${currentThemeName.toUpperCase()}*\n` +
          `${t.bullet} Cada tema muda: bordas, ícones, símbolos, menus, submenus e todos os textos visíveis\n\n` +
          `Seleciona um tema abaixo ${t.accent}`;

        const listParams = {
          title:    `${t.icon} TEMAS DISPONÍVEIS`,
          sections: seccoes,
        };

        try {
          const m = generateWAMessageFromContent(ctx.remoteJid, {
            interactiveMessage: proto.Message.InteractiveMessage.fromObject({
              body:   proto.Message.InteractiveMessage.Body.fromObject({ text: bodyTxt }),
              footer: proto.Message.InteractiveMessage.Footer.fromObject({
                text: `${t.icon} ${botName} ${t.sep} ${t.vibe.slice(0, 50)}`,
              }),
              header: proto.Message.InteractiveMessage.Header.fromObject({
                title: '', hasMediaAttachment: false,
              }),
              nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
                buttons: [{
                  name: 'single_select',
                  buttonParamsJson: JSON.stringify(listParams),
                }],
              }),
            }),
          }, { userJid: sock.user?.id, quoted: msg });
          await sock.relayMessage(ctx.remoteJid, m.message, { messageId: m.key.id });
        } catch {
          // Fallback texto se interactiveMessage falhar
          let txt = `${t.icon} *TEMAS DISPONÍVEIS — ${botName}*\n\n`;
          for (const th of all) {
            const active = th.name === currentThemeName ? ' ◄ *ACTIVO*' : '';
            txt += `${th.emoji} *${th.name.toUpperCase()}*${active} — _${th.vibe.slice(0,40)}_\n`;
          }
          txt += `\n${t.bullet} Aplicar: *${prefix}change <nome>*`;
          await reply(txt);
        }
        return;
      }

      // ── info → preview do tema activo ──────────────────────────────
      if (args[0].toLowerCase() === 'info') {
        return reply(changeThemes.previewTheme(currentTheme, botName, prefix));
      }

      // ── reset → volta ao dark ───────────────────────────────────────
      if (args[0].toLowerCase() === 'reset') {
        if (!isOwner) return reply('🚫 Só o Dono pode mudar o tema.');
        await BotConfig.set('active_theme', 'dark');
        await BotConfig.set('menu_style', '0');
        botConfigCache.clear();
        const t = changeThemes.getTheme('dark');
        return reply(
          `${t.icon} *TEMA RESETADO*\n\n` +
          `${t.bullet} Voltou ao tema *DARK* (padrão)\n\n` +
          `> ${t.vibe}`
        );
      }

      // ── preview <nome> ──────────────────────────────────────────────
      if (args[0].toLowerCase() === 'preview') {
        const themeName = args[1]?.toLowerCase()?.trim();
        if (!themeName) return reply(`❓ Qual tema?\nEx: *${prefix}change preview dragon*`);
        const t = changeThemes.getTheme(themeName);
        return reply(changeThemes.previewTheme(t, botName, prefix));
      }

      // ── Aplicar tema por nome ───────────────────────────────────────
      // v6.13: ADM do grupo pode mudar o tema DO GRUPO
      // Dono muda o tema GLOBAL
      const GroupSettings = require('../../database/models/GroupSettings');
      if (!isOwner && ctx.isGroup) {
        // Verificar se é admin do grupo
        try {
          const meta = ctx.groupMeta || await sock.groupMetadata(ctx.remoteJid);
          const snum = ctx.senderNumber;
          const isAdm = meta?.participants?.some(pt =>
            pt.id.split('@')[0].replace(/\D/g, '') === snum &&
            (pt.admin === 'admin' || pt.admin === 'superadmin'));
          if (!isAdm) return reply('🚫 Só o Dono ou ADM do grupo pode mudar o tema.');
          // ADM muda só o tema do grupo
          const themeName = args[0].toLowerCase().trim();
          const found = changeThemes.listThemes().find(t => t.name === themeName);
          if (!found) {
            const list = changeThemes.listThemes().map(t => (t.icon || '🕸️') + ' ' + t.name).join(', ');
            return reply('❓ Tema não encontrado.\nDisponíveis: ' + list);
          }
          await GroupSettings.findOneAndUpdate(
            { groupJid: ctx.remoteJid },
            { groupTheme: found.name },
            { upsert: true }
          );
          const t = changeThemes.getTheme(found.name);
          return reply(
            t.icon + ' *TEMA DO GRUPO ALTERADO*\n\n' +
            t.bullet + ' Tema: *' + found.name.toUpperCase() + '*\n' +
            t.bullet + ' Grupo: *' + (ctx.groupName || ctx.remoteJid) + '*\n\n' +
            '> ' + t.vibe
          );
        } catch (e) {
          return reply('❌ Erro: ' + e.message);
        }
      }
      if (!isOwner) return reply('🚫 Só o Dono pode mudar o tema global.');

      const themeName = args[0].toLowerCase().trim();
      const found = changeThemes.listThemes().find(t => t.name === themeName);

      if (!found) {
        const list = changeThemes.listThemes().map(t => `${t.emoji} ${t.name}`).join('\n');
        return reply(
          `❌ Tema *${themeName}* não encontrado.\n\n*Temas disponíveis:*\n${list}\n\n💡 Use: *${prefix}change* para ver a lista interativa`
        );
      }

      await BotConfig.set('active_theme', found.name);
      await BotConfig.set('menu_style', String(found.style));
      botConfigCache.clear();

      // Confirmação no estilo do NOVO tema
      const f  = found.frame;
      const H  = f[4] || '─';
      const V  = f[5] || '│';
      const W  = 28;
      const bar = (txt) => `${V} ${String(txt).slice(0, W).padEnd(W)} ${V}`;

      const confirm =
        `${found.icon} ─ ⋆⋅ ${found.accent} ⋅⋆ ─ ${found.icon}\n\n` +
        `${found.headerDec.replace('{TITLE}', 'TEMA APLICADO')}\n` +
        `${bar(``)}\n` +
        `${bar(`${found.bullet} Bot: ${botName}`)}\n` +
        `${bar(`${found.bullet} Novo tema: ${found.name.toUpperCase()}`)}\n` +
        `${bar(`${found.bullet} Ícone: ${found.icon}`)}\n` +
        `${bar(`${found.bullet} Reação: ${found.react}`)}\n` +
        `${bar(`${found.bullet} Borda: ${f[0]}${H.repeat(4)}${f[1]}`)}\n` +
        `${bar(`${found.bullet} Marcador: ${found.bullet} ${found.sep}`)}\n` +
        `${bar(``)}\n` +
        `${bar(found.tip.slice(0, W))}\n` +
        `${found.sectionSep || `${f[2]}${H.repeat(W + 2)}${f[3]}`}\n\n` +
        `✅ *Tema aplicado!* Todo o bot adoptou o estilo *${found.name.toUpperCase()}*\n\n` +
        `> ${found.icon} ${found.menuFooter.replace('{BOT}', botName)}`;

      return reply(confirm);
    }
  );

  // ── Handler do botão da lista interativa ────────────────────────────
  // Quando o utilizador seleciona da lista → aplica automaticamente
  registerCase(['__change_theme_handler__'], async () => {}); // placeholder, handled below

  // ── !temas — alias rápido ────────────────────────────────────────────
  registerCase(['temas', 'themes', 'listthemes', 'listtemas'], async ({ prefix, reply }) => {
    const currentThemeName = await botConfigCache
      .get('active_theme', 'dark').catch(() => 'dark');
    const all = changeThemes.listThemes();
    const t   = changeThemes.getTheme(currentThemeName);
    let txt = `${t.icon} *TEMAS DO BOT*\n\nTema actual: *${currentThemeName.toUpperCase()}*\n\n`;
    for (const th of all) {
      const active = th.name === currentThemeName ? ' ◄ ACTIVO' : '';
      txt += `${th.emoji} *${th.name.toUpperCase()}*${active}\n`;
      txt += `  _${th.vibe.slice(0,45)}_\n`;
    }
    txt += `\n${t.bullet} Aplicar: *${prefix}change <nome>*\n`;
    txt += `${t.bullet} Lista interativa: *${prefix}change*`;
    return reply(txt);
  });
};
