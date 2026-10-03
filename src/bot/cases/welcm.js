'use strict';
/**
 * DARK BOT — Welcome2 / Welcm3 / RG Card (v8.4) 🎨
 *
 *  !welcome2 on|off  (admin) → o enter do grupo passa a mandar a FOTO IA
 *                     da pessoa — arte gerada à medida com a foto de
 *                     perfil dela no cartão.
 *  !welcm3 on|off    (admin) → igual mas em GIF de super animação
 *                     (pan da arte + anel pulsante + chuva de faísca).
 *  !rgcard [gif]     (jogador) → cartão do herói com a SUA foto de
 *                     perfil — a mesma arte do welcome no RPG.
 *
 * welcome2 e welcm3 são mutuamente exclusivos por grupo (ligar um
 * desliga o outro); os dois OFF = welcome clássico do bot.
 */
const config = require('../../config');

async function tReply(sock, msg, ctx, title, lines) {
  try {
    const RE = require('../renderEngine');
    const t = await RE.getTheme(ctx.remoteJid);
    return sock.sendMessage(ctx.remoteJid, { text: RE.renderBlock(t, title, lines, { botName: config.bot.name }) }, { quoted: msg });
  } catch {
    return sock.sendMessage(ctx.remoteJid, { text: `*${title}*\n\n${lines.join('\n')}` }, { quoted: msg });
  }
}

async function toggle(caseCtx, campo) {
  const { sock, msg, ctx, args, prefix, isOwner, isAdminFn } = caseCtx;
  const adm = isOwner || (typeof isAdminFn === 'function' ? await isAdminFn().catch(() => false) : false);
  if (ctx.isGroup && !adm) {
    return tReply(sock, msg, ctx, '🛡️ SÓ ADMINS', ['⚠️ Só os admins do grupo (ou o Dono Supremo) mexem neste welcome.']);
  }
  const a = String(args[0] || '').toLowerCase();
  const GroupSettings = require('../../database/models/GroupSettings');
  const cur = await GroupSettings.findOne({ groupJid: ctx.remoteJid }).lean().catch(() => null);
  let ligar = a === 'on';
  if (a !== 'on' && a !== 'off') ligar = !(cur && cur[campo]);   // sem arg → alterna

  const upd = campo === 'welcome2'
    ? { welcome2: ligar, welcm3: false }
    : { welcm3: ligar, welcome2: false };
  await GroupSettings.findOneAndUpdate({ groupJid: ctx.remoteJid }, upd, { upsert: true });

  const sw = ligar ? '🟢 ON  ━━━━●' : '🔴 OFF ●━━━━';
  if (campo === 'welcome2') {
    if (ligar) return tReply(sock, msg, ctx, '🎨 WELCOME2 — FOTO DE ENTRADA IA', [
      '🖼️━━━━━━━━━━━━━━━━━━━━━━━━🖼️',
      `✨  *WELCOME2* · ${sw}`,
      '',
      '📜  Quando alguém entra no grupo, o bot pinta uma FOTO só dela:',
      '🎭  arte IA temática (portal de obsidiana violeta) + a foto de',
      'perfil do membro incorporada no próprio cartão, com nome e nº.',
      '',
      `🔁  Isto troca o welcome clássico do grupo. Desliga com *${prefix}welcome2 off*.`,
      (cur?.welcm3 ? `🎞️  (welcm3 estava ligado — ficou OFF automaticamente)` : ''),
      '',
      `🌟  Versão animada: *${prefix}welcm3 on* — GIF de super animação.`,
    ].filter(Boolean));
    return tReply(sock, msg, ctx, '🖼️ WELCOME2 — ADORMECEU', [
      '🖼️━━━━━━━━━━━━━━━━━━━━━━━━🖼️',
      `🌒  *WELCOME2* · ${sw}`,
      '⚰️  O grupo volta ao welcome clássico do bot.',
    ]);
  }
  if (ligar) return tReply(sock, msg, ctx, '🎞️ WELCM3 — GIF DE SUPER ANIMAÇÃO', [
    '🎞️━━━━━━━━━━━━━━━━━━━━━━━━🎞️',
    `✨  *WELCM3* · ${sw}`,
    '',
    '📜  A entrada virou CINEMA: a arte IA desloca-se em pan,',
    '💫 o anel de obsidiana pulsa em torno da foto de perfil',
    'e uma chuva de faísca violeta sobe o cartão inteiro —',
    '18 frames num GIF de gifPlayback que roda a segundos todos.',
    '',
    `🔁  Troca o welcome clássico e o welcome2. Desliga com *${prefix}welcm3 off*.`,
    (cur?.welcome2 ? `🖼️  (welcome2 estava ligado — ficou OFF automaticamente)` : ''),
  ].filter(Boolean));
  return tReply(sock, msg, ctx, '🎞️ WELCM3 — ADORMECEU', [
    '🎞️━━━━━━━━━━━━━━━━━━━━━━━━🎞️',
    `🌒  *WELCM3* · ${sw}`,
    '⚰️  O grupo volta ao welcome clássico do bot.',
  ]);
}

module.exports = function (registerCase) {
  registerCase(['welcome2', 'bv2', 'bemvindo2'], (cc) => toggle(cc, 'welcome2'));
  registerCase(['welcm3', 'bv3', 'bemvindo3'], (cc) => toggle(cc, 'welcm3'));

  // ══ RPG: cartão do herói com a mesma arte de entrada ══════════
  registerCase(['rgcard', 'fichacard', 'rgcartao', 'heroicard'], async ({ sock, msg, ctx, args, prefix }) => {
    sock.sendMessage(ctx.remoteJid, { react: { text: '🎨', key: msg.key } }).catch(() => {});
    try {
      const engine = require('../rpg/engine');
      const p = await engine.peekPlayer(ctx.senderNumber);
      const tem = !!(p && (p.started || p.raceBonusApplied || (p.name && p.name !== 'Aventureiro')));
      if (!tem) {
        return tReply(sock, msg, ctx, '🧙 PERSONAGEM POR EXISTIR', [
          `O cartão de herói precisa de uma ficha. Cria-a com *${prefix}rpgstart* —`,
          'depois volta e eu pinto-o com a tua foto de perfil dentro.',
        ]);
      }
      const wa = require('../welcomeArt');
      let ppUrl = null;
      try { ppUrl = await sock.profilePictureUrl(ctx.senderJid || ctx.remoteJid, 'image').catch(() => null); } catch {}
      const botName = (config.bot?.name) || 'DARK BOT';
      const gif = args.some(a => /gif|anim|welcm3|gif3/i.test(a));
      // A arte nasce da raça/classe/nível e também da cidade onde o
      // jogador a pediu. É uma leitura curta e só acontece no !rgcard.
      let region = null;
      if (ctx.isGroup) {
        try { region = await require('../rpg/regions').getCountryForGroup(ctx.remoteJid); } catch {}
      }
      // v8.4: a arte NUNCA pode pendurar o comando — deadline 6s e queda
      // garantida para o gradiente local (o dia em que a IA dorme, o
      // jogador continua a receber um cartão bonito).
      const comPrazo = (prom, ms) => new Promise((res, rej) => {
        const t = setTimeout(() => rej(new Error('arte fora de prazo')), ms);
        t.unref?.();
        prom.then(v => { clearTimeout(t); res(v); }, err => { clearTimeout(t); rej(err); });
      });
      const tenta = async () => {
        if (gif) {
          const animacao = await wa.heroGif(p, { profilePicUrl: ppUrl, botName, region, jid: ctx.remoteJid, frames: 12 });
          if (animacao?.length > 2048) {
            return sock.sendMessage(ctx.remoteJid, {
              video: animacao, gifPlayback: true, mimetype: 'video/mp4',
              caption: `🎞️ *${p.name}* — cartão de herói animado (DARK VILLE)`,
            }, { quoted: msg });
          }
        }
        // Host sem ffmpeg ou arte IA lenta: o cartão estático local continua
        // a sair imediatamente, em vez de o comando falhar.
        return sock.sendMessage(ctx.remoteJid, {
          image: await wa.heroCard(p, { profilePicUrl: ppUrl, botName, region, jid: ctx.remoteJid }),
          caption: `🪶 *${p.name}* — cartão de herói${gif ? ' (animação indisponível neste momento)' : ''}\n💡 animado: \`${prefix}rgcard gif\``,
        }, { quoted: msg });
      };
      try {
        await comPrazo(tenta(), 3500);
      } catch (e1) {
        // queda: gradiente local (0 rede) — rápido e bonito à mesma
        const local = { profilePicUrl: null, fetchFn: async () => null, botName, region, jid: ctx.remoteJid };
        // A queda de prazo/rede é sempre uma imagem local, nunca um MP4
        // vazio. Isto mantém !rgcard rápido mesmo sem ffmpeg no host.
        await sock.sendMessage(ctx.remoteJid, {
          image: await wa.heroCard(p, local),
          caption: `🪶 *${p.name}* — cartão de herói${gif ? ' (animação indisponível neste momento)' : ''}\n💡 animado: \`${prefix}rgcard gif\``,
        }, { quoted: msg });
      }
      sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } }).catch(() => {});
    } catch (e) {
      if (process.env.DEBUG_RGCARD) console.error('[rgcard]', e.stack);
      sock.sendMessage(ctx.remoteJid, { react: { text: '❌', key: msg.key } }).catch(() => {});
      return tReply(sock, msg, ctx, '❌ PINTURA FALHOU', [String(e.message || e).slice(0, 160)]);
    }
  });
};
