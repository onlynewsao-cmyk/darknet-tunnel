/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║   DARK BOT v7 — DARKRPG Community Commands v3                ║
 * ║   addglb → grupo geral | Arsenal → comunicados | 4h updates  ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */
'use strict';

const config = require('../../config');
const rpg = require('../rpg/engine');
const community = require('../rpg/community');

async function tReply(sock, msg, ctx, title, lines) {
  const RE = require('../renderEngine');
  const t = await RE.getTheme(ctx.remoteJid);
  return sock.sendMessage(ctx.remoteJid, { text: RE.renderBlock(t, title, lines, { botName: config.bot.name }) }, { quoted: msg });
}

module.exports = function registerRPGCommunity(registerCase) {

  // ═══ v7.25: SELECCIONAR ESTE GRUPO COMO GRUPO DO RPG ═══
  // O Dono cria a comunidade à mão, adiciona o bot como ADM, entra num
  // dos grupos da comunidade e dispara o comando desse grupo. O bot
  // regista-o, TROCA O NOME, põe a descrição, liga-o à comunidade e
  // promove o dono — o RPG passa a funcionar ali.
  async function definirGrupo({ sock, msg, ctx, isOwner, tipo }) {
    if (!isOwner) return tReply(sock, msg, ctx, '🚫 Acesso', ['Só o dono pode definir os grupos do RPG.']);
    if (!ctx.isGroup) return tReply(sock, msg, ctx, '👥 Grupo', ['Isto só funciona dentro do grupo da comunidade.']);

    const def = community.COMMUNITY_GROUPS[tipo];
    if (!def) return tReply(sock, msg, ctx, '❌ Tipo', ['Tipo inválido: ' + tipo]);

    await sock.sendMessage(ctx.remoteJid, { react: { text: def.emoji, key: msg.key } }).catch(() => {});

    const r = await community.adoptGroupAs(sock, tipo, ctx.remoteJid, ctx.senderJid);
    if (!r.ok) {
      return tReply(sock, msg, ctx, '❌ Falhou', [String(r.error).slice(0, 140)]);
    }

    const linhas = [
      def.emoji + ' *' + def.name + '*',
      '',
      def.desc,
      '',
      'O que fiz aqui:',
      ...(r.acoes.length ? r.acoes.map(a => '▸ ' + a) : ['▸ Nada por fazer — já estava tudo certo']),
      '',
      '🎮 *O RPG já funciona neste grupo.* Comandos:',
      '• !rpgstart <nome> <raça> <classe> — criar personagem',
      '• !rg — ficha · !lutar — batalha · !explorar — explorar',
    ];
    return tReply(sock, msg, ctx, def.emoji + ' GRUPO DEFINIDO', linhas);
  }

  registerCase(['setarena'],   async (a) => definirGrupo({ ...a, tipo: 'arena' }));
  registerCase(['setdungeons'], async (a) => definirGrupo({ ...a, tipo: 'dungeons' }));
  registerCase(['settrocas'],  async (a) => definirGrupo({ ...a, tipo: 'trocas' }));
  registerCase(['setcavernas'], async (a) => definirGrupo({ ...a, tipo: 'cavernas' }));
  registerCase(['setlazer'],   async (a) => definirGrupo({ ...a, tipo: 'lazer' }));
  registerCase(['setarsenal'], async (a) => definirGrupo({ ...a, tipo: 'arsenal' }));

  // um comando único também: !setgrupo arena|dungeons|trocas|cavernas|lazer|arsenal
  registerCase(['setgrupo'], async ({ sock, msg, ctx, args, isOwner }) => {
    const tipo = String(args[0] || '').toLowerCase().trim();
    if (!community.COMMUNITY_GROUPS[tipo]) {
      return tReply(sock, msg, ctx, '❓ Qual grupo?', [
        'Usa um destes:',
        '⚔️ !setarena   🐉 !setdungeons   💰 !settrocas',
        '⛏️ !setcavernas   😂 !setlazer   🏆 !setarsenal',
        '',
        'Ou: !setgrupo <arena|dungeons|trocas|cavernas|lazer|arsenal>',
      ]);
    }
    return definirGrupo({ sock, msg, ctx, isOwner, tipo });
  });

  // ═══ INICIAR DARKRPG ═══
  registerCase(['darkrpg', 'rpginit', 'iniciar-rpg'], async ({ sock, msg, ctx, isOwner, args }) => {
    if (!isOwner) return tReply(sock, msg, ctx, '🚫 Acesso', ['Só o dono pode iniciar o DARKRPG.']);

    await sock.sendMessage(ctx.remoteJid, { react: { text: '🚀', key: msg.key } });

    try {
      // v6.65: `!darkrpg <nome>` escolhe a comunidade; sem argumento
      // procura a que tenha DARK/VILLE no nome. Só cria do zero com
      // `!darkrpg criar` — criar à mão pela app não gasta queries e é
      // o que evita o rate-overlimit.
      const arg = (args || []).join(' ').trim();
      const criar = /^criar$/i.test(arg);
      const results = await community.initCommunity(sock, ctx.senderJid, {
        nome: criar ? null : (arg || null),
        criarSeNaoExistir: criar,
        rescan: true,
      });

      const falhas = results.filter(r => !r.ok && r.type !== 'aviso');
      const limitado = results.some(r => /rate-overlimit|429/i.test(String(r.error || '')));
      const commRes = results.find(r => r.type === 'community');
      const ad = commRes?.adopcao;

      let report = falhas.length
        ? '🕸️ *DARK🕸️VILLE — PARCIAL*\n\n'
        : '🕸️ *DARK🕸️VILLE — PRONTA!*\n\n';
      report += '━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
      for (const r of results) {
        if (r.type === 'aviso') continue;
        report += r.ok ? '✅ ' + r.name + '\n' : '❌ ' + (r.name || r.type) + ': ' + r.error + '\n';
      }
      report += '━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

      // Relatório da adopção: o que encontrei na tua comunidade.
      if (ad) {
        report += '🔎 *Encontrei a tua comunidade:*\n';
        report += '📛 ' + ad.nome + '\n';
        if (ad.existentes?.length) {
          report += '\n📂 *Já lá estavam:*\n';
          for (const g of ad.existentes.slice(0, 10)) report += '  • ' + g.nome + '\n';
        }
        report += '\n👑 *Tu:*\n';
        report += ad.dono.dentro ? '  ✅ Dentro da comunidade\n' : '  ❌ Fora da comunidade\n';
        report += ad.dono.admin ? '  ✅ Admin\n' : '  ⚠️ Não és admin\n';
        for (const a of ad.dono.acoes || []) report += '  ▸ ' + a + '\n';
        if (ad.outras?.length) {
          report += '\nℹ️ Outras comunidades tuas: ' + ad.outras.join(', ') + '\n';
          report += 'Usa *!darkrpg <nome>* para escolher outra.\n';
        }
        report += '\n';
      }

      if (limitado) {
        // v6.64: em vez de só dizer "rate-overlimit", explica o que fazer.
        report += '⚠️ *O WhatsApp limitou a conta (rate-overlimit).*\n\n';
        report += 'Não é bug do bot — é o WhatsApp a travar criação de\n';
        report += 'grupos em série. O que já foi criado está guardado.\n\n';
        report += '🕐 *Espera ~1 hora e corre !darkrpg outra vez.*\n';
        report += 'Ele continua de onde parou, sem duplicar nada.\n\n';
      } else if (!falhas.length) {
        report += '👑 *Você é ADM em todos os grupos!*\n';
        report += '🏰 *Clãs são independentes — líderes comandam.*\n\n';
      }

      // Não encontrou comunidade nenhuma → diz como resolver.
      if (!commRes?.ok && /não encontrei nenhuma comunidade/i.test(String(commRes?.error || ''))) {
        report += '💡 *Como resolver:*\n';
        report += '1. Cria a comunidade pela app do WhatsApp\n';
        report += '2. Adiciona-me a ela (e dá-me admin)\n';
        report += '3. Corre *!darkrpg* outra vez\n\n';
        report += 'Criar pela app não gasta nada — é assim que se evita\n';
        report += 'o rate-overlimit. Se preferires que eu crie: *!darkrpg criar*\n\n';
      }

      report += '🎮 *Próximos passos:*\n';
      report += '• !darkrpg-test — Testar tudo\n';
      report += '• !addglb — Adicionar todos ao grupo geral\n';
      report += '• !criaclan <nome> — Criar um clã\n';
      report += '• !comunicado — Enviar ranking no Arsenal';

      await sock.sendMessage(ctx.remoteJid, { text: report }, { quoted: msg });
      await sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } });
    } catch (e) {
      await sock.sendMessage(ctx.remoteJid, { react: { text: '❌', key: msg.key } });
      return tReply(sock, msg, ctx, '❌ Erro', [e.message]);
    }
  }, true);

  // ═══ TESTAR DARKRPG ═══
  registerCase(['darkrpg-test', 'rpgtest'], async ({ sock, msg, ctx, isOwner }) => {
    if (!isOwner) return tReply(sock, msg, ctx, '🚫 Acesso', ['Só o dono.']);

    await community.loadState();
    let report = '🧪 *TESTE DARKRPG*\n\n';
    report += '━━━━━━━━━━━━━━━━━━━━━━━━━━\n';

    // Testa grupos
    report += '🏰 *Grupos:*\n';
    for (const [type, def] of Object.entries(community.COMMUNITY_GROUPS)) {
      const jid = community._groupCache.get(type);
      const mainTag = def.isMain ? ' (PRINCIPAL)' : '';
      report += jid ? '  ✅ ' + def.name + mainTag + '\n' : '  ❌ ' + def.name + ' (não criado)\n';
    }

    // Testa clãs
    report += '\n🏰 *Clãs:*\n';
    if (community._clanGroups.size === 0) {
      report += '  Nenhum clã criado ainda.\n';
    } else {
      for (const [name, clan] of community._clanGroups.entries()) {
        report += '  ✅ ' + name + ' → ' + clan.jid + '\n';
      }
    }

    // Testa banco de dados
    report += '\n📊 *Banco de dados:*\n';
    try {
      const RPGPlayer = require('../../database/models/RPGPlayer');
      const count = await RPGPlayer.countDocuments();
      report += '  ✅ ' + count + ' jogadores registrados\n';
    } catch (e) {
      report += '  ❌ Erro: ' + e.message + '\n';
    }

    report += '━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
    report += '✅ *Tudo pronto para !addglb!*';

    return sock.sendMessage(ctx.remoteJid, { text: report }, { quoted: msg });
  }, true);

  // ═══ STATUS DARKRPG ═══
  registerCase(['darkrpg-status', 'rpgstatus'], async ({ sock, msg, ctx, isOwner }) => {
    if (!isOwner) return tReply(sock, msg, ctx, '🚫 Acesso', ['Só o dono.']);

    await community.loadState();
    let status = '📊 *STATUS DARK🕸️VILLE*\n\n';
    status += '━━━━━━━━━━━━━━━━━━━━━━━━━━\n';

    for (const [type, def] of Object.entries(community.COMMUNITY_GROUPS)) {
      const jid = community._groupCache.get(type);
      const mainTag = def.isMain ? ' ⭐' : '';
      status += jid ? '✅ ' + def.name + mainTag + '\n' : '❌ ' + def.name + '\n';
    }

    status += '\n🏰 *Clãs:*\n';
    if (community._clanGroups.size === 0) {
      status += '  Nenhum clã criado ainda.\n';
    } else {
      for (const [name, clan] of community._clanGroups.entries()) {
        status += '  🏰 ' + name + '\n';
      }
    }

    status += '━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
    return sock.sendMessage(ctx.remoteJid, { text: status }, { quoted: msg });
  }, true);

  // ═══ ADDGLB — ADICIONA TODOS AO GRUPO GERAL ═══
  registerCase(['addglb', 'addglobal'], async ({ sock, msg, ctx, isOwner }) => {
    if (!isOwner) return tReply(sock, msg, ctx, '🚫 Acesso', ['Só o dono.']);

    await sock.sendMessage(ctx.remoteJid, { react: { text: '⏳', key: msg.key } });

    try {
      const results = await community.addAllUsersToMainGroup(sock, ctx.senderJid);

      let report = '📤 *ADDGLB — DARK🕸️VILLE*\n\n';
      report += '━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
      report += '✅ Adicionados ao grupo geral: ' + results.added.length + '\n';
      report += '📩 Convites enviados: ' + results.invited.length + '\n';
      report += '❌ Erros: ' + results.errors.length + '\n';
      // v6.63: mostra os erros reais em vez de só contar.
      if (results.errors.length) {
        report += '\n⚠️ *Motivos:*\n';
        for (const e of results.errors.slice(0, 5)) report += '  • ' + String(e).slice(0, 70) + '\n';
        if (results.errors.length > 5) report += '  • (+' + (results.errors.length - 5) + ')\n';
      }
      report += '━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
      report += 'ℹ️ *Os usuários agora podem entrar nos outros grupos pela comunidade.*\n';
      report += '🏰 *Clãs criados com !criaclan têm grupo próprio.*';

      await sock.sendMessage(ctx.remoteJid, { text: report }, { quoted: msg });
      await sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } });
    } catch (e) {
      await sock.sendMessage(ctx.remoteJid, { react: { text: '❌', key: msg.key } });
      return tReply(sock, msg, ctx, '❌ Erro', [e.message]);
    }
  }, true);

  // ═══ COMUNICADO — ENVIA RANKING NO ARSENAL ═══
  registerCase(['comunicado', 'ranking-update', 'arsenal'], async ({ sock, msg, ctx, isOwner }) => {
    if (!isOwner) return tReply(sock, msg, ctx, '🚫 Acesso', ['Só o dono.']);

    await sock.sendMessage(ctx.remoteJid, { react: { text: '📊', key: msg.key } });

    try {
      await community.loadState();
      const report = await community.generateDailyReport();
      const arsenalJid = community._groupCache.get('arsenal');

      if (arsenalJid) {
        await sock.sendMessage(arsenalJid, { text: report });
        await sock.sendMessage(ctx.remoteJid, { text: '✅ *Comunicado enviado ao Arsenal da Fama!*' }, { quoted: msg });
      } else {
        await sock.sendMessage(ctx.remoteJid, { text: report }, { quoted: msg });
      }
      await sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } });
    } catch (e) {
      await sock.sendMessage(ctx.remoteJid, { react: { text: '❌', key: msg.key } });
      return tReply(sock, msg, ctx, '❌ Erro', [e.message]);
    }
  }, true);

  // ═══ CRIAR CLÃ ═══
  registerCase(['criaclan', 'criaclã', 'newclan'], async ({ sock, msg, ctx, args }) => {
    const clanName = args.join(' ').trim();
    if (!clanName) return tReply(sock, msg, ctx, '❌ Uso', ['!criaclan <nome do clã>']);

    const p = await rpg.getPlayer(ctx.senderNumber);
    if (!p) return tReply(sock, msg, ctx, '❌ Ficha', ['Ainda não tens personagem. Usa *!criarpersonagem*.']);
    if ((p.coins || 0) < 5000) {
      return tReply(sock, msg, ctx, '❌ Berries', [
        'Precisas de 5000 berries para criar um clã.',
        'Tens: ' + (p.coins || 0),
      ]);
    }
    // v6.63: já estás num clã? Antes deixava criar vários e o berries ia-se.
    if (p.guild) return tReply(sock, msg, ctx, '🏰 Clã', ['Já estás no clã *' + p.guild + '*.']);

    await sock.sendMessage(ctx.remoteJid, { react: { text: '⏳', key: msg.key } });

    try {
      const result = await community.createClanGroup(sock, clanName, ctx.senderJid);

      if (result.ok) {
        p.coins -= 5000;
        p.guild = clanName;
        p.title = 'Líder do Clã';
        await rpg.savePlayer(p);

        let msg_text = '🏰 *CLÃ CRIADO COM SUCESSO!*\n\n';
        msg_text += '━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
        msg_text += '📛 Nome: *' + clanName + '*\n';
        msg_text += '👑 Líder: @' + ctx.senderJid.split('@')[0] + '\n';
        msg_text += '🔗 Grupo: ' + result.name + '\n';
        msg_text += '💰 Custo: 5000 berries\n';
        msg_text += '━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
        msg_text += '👑 *O líder foi promovido a admin do grupo do clã!*\n';
        msg_text += '📤 *Use !addclan @user para adicionar membros.*';

        await sock.sendMessage(ctx.remoteJid, { text: msg_text, mentions: [ctx.senderJid] }, { quoted: msg });
        await sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } });
      } else {
        await sock.sendMessage(ctx.remoteJid, { react: { text: '❌', key: msg.key } });
        return tReply(sock, msg, ctx, '❌ Erro', [result.error]);
      }
    } catch (e) {
      await sock.sendMessage(ctx.remoteJid, { react: { text: '❌', key: msg.key } });
      return tReply(sock, msg, ctx, '❌ Erro', [e.message]);
    }
  }, true);

  // ═══ MENU DARKRPG ═══
  registerCase(['menu-rpg', 'menurpg', 'rpgmenu'], async ({ sock, msg, ctx, prefix }) => {
    const p = prefix || '!';

    return sock.sendMessage(ctx.remoteJid, {
      text: '🕸️━━━━━━━━━━━━━━━━━━━━━━━🕸️\n' +
        '  *DARK🕸️VILLE — MENU RPG*\n' +
        '🕸️━━━━━━━━━━━━━━━━━━━━━━━🕸️\n\n' +
        '🏰 *COMUNIDADE:*\n' +
        '  ' + p + 'darkrpg — Iniciar comunidade\n' +
        '  ' + p + 'darkrpg-test — Testar tudo\n' +
        '  ' + p + 'addglb — Adicionar todos ao grupo geral\n' +
        '  ' + p + 'comunicado — Enviar ranking no Arsenal\n' +
        '  ' + p + 'criaclan <nome> — Criar clã\n\n' +
        // v6.63: o menu citava despertar/x1/gacha/forja/cartas/raid/
        // portal/addclan — NENHUM desses cases existe. O utilizador
        // escrevia e não acontecia nada. Só ficam os que respondem.
        '🎭 *PERSONAGEM:*\n' +
        '  ' + p + 'criarpersonagem — Cria a tua ficha\n' +
        '  ' + p + 'perfil — Vê os teus status\n' +
        '  ' + p + 'nome <nome> — Muda o teu nome\n' +
        '  ' + p + 'racas — Vê raças e classes\n' +
        '  ' + p + 'vidas — Vê as tuas vidas\n\n' +
        '⚔️ *BATALHA:*\n' +
        '  ' + p + 'lutar — Combate PvE\n' +
        '  ' + p + 'quest — Missões\n' +
        '  ' + p + 'explorar — Explora os biomas\n' +
        '  ' + p + 'descansar — Recupera HP\n\n' +
        '🃏 *ITENS:*\n' +
        '  ' + p + 'inventario — O teu baú\n' +
        '  ' + p + 'loja — Comprar itens\n' +
        '  ' + p + 'pocao — Usar poção\n\n' +
        '🏰 *SOCIAL:*\n' +
        '  ' + p + 'guilda — Criar/ver guilda\n' +
        '  ' + p + 'ranking — Leaderboard\n' +
        '  ' + p + 'regras — Regras da comunidade\n\n' +
        '🕸️━━━━━━━━━━━━━━━━━━━━━━━🕸️'
    }, { quoted: msg });
  }, true);
};
