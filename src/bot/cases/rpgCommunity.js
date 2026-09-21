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
  const rpgTheme = require('../rpg/rpgTheme');
  return rpgTheme.rpgReply(sock, msg, ctx, title, lines);
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

    // v7.90: 5000 berries merecem CONFIRMAÇÃO por botões (ou !rpgsim / !rpgnao)
    return require('../rpg/ui').confirmar(sock, msg, ctx, {
      titulo: `🏰 *CRIAR O CLÃ ${clanName.toUpperCase()}*`,
      linhas: [`👑 Líder: ${p.name}`, '💰 Custo: *5000 berries*', '(confirmas com um toque)'],
      txtSim: '✅ Criar clã',
      txtNao: '❌ Cancelar',
      onSim: async ({ sock, msg, ctx }) => _criarClanAgora(sock, msg, ctx, clanName),
      onNao: async ({ sock, msg, ctx }) => tReply(sock, msg, ctx, '🏰 Clã', ['Criação cancelada — os berries ficam contigo.']),
    });
  }, true);

  // v7.90: o efeito real do !criaclan (corre DEPOIS de confirmado)
  async function _criarClanAgora(sock, msg, ctx, clanName) {
    const p = await rpg.getPlayer(ctx.senderNumber);
    if (!p) return tReply(sock, msg, ctx, '❌ Ficha', ['Ainda não tens personagem. Usa *!criarpersonagem*.']);
    if ((p.coins || 0) < 5000) return tReply(sock, msg, ctx, '❌ Berries', ['Precisas de 5000 berries para criar um clã.']);
    if (p.guild) return tReply(sock, msg, ctx, '🏰 Clã', ['Já estás no clã *' + p.guild + '*.']);

    await sock.sendMessage(ctx.remoteJid, { react: { text: '⏳', key: msg.key } });

    // v7.88 — RPG DE UM SÓ GRUPO: sem comunidade DARK VILLE, o clã nasce
    // LOCAL (vive neste grupo, sem subgrupo do WhatsApp) — mesmos custos/título.
    let temComunidade = false;
    try { temComunidade = !!(await community.loadState())?.communityJid; } catch {}

    if (!temComunidade) {
      p.coins -= 5000;
      p.guild = clanName;
      p.title = 'Líder do Clã';
      await rpg.savePlayer(p);
      await sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } });
      return tReply(sock, msg, ctx, '🏰 CLÃ CRIADO — MODO LOCAL', [
        `📛 Nome: *${clanName}*`,
        `👑 Líder: @${ctx.senderJid.split('@')[0]}`,
        '🏠 Base: *este grupo* (RPG de um só grupo)',
        '💰 Custo: 5000 berries',
        '',
        '> Membros entram com *!guilda entrar ' + clanName + '* — o clã é deste grupo.',
      ]);
    }

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
        // v7.47: citava o !addclan, que não existe. O líder adiciona à mão.
        msg_text += '📤 *Adiciona os membros no grupo do clã (és admin).*';

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
  }

  // ═══ MENU DARKRPG ═══
  registerCase(['menu-rpg', 'menurpg', 'rpgmenu'], async ({ sock, msg, ctx, prefix }) => {
    // v7.97: o menu RPG só abre onde o mundo está ligado (modorpg/comunidade).
    const gateR = require('../rpg/gate');
    if (!await gateR.modoAberto({ ...ctx, _msg: msg })) {
      return sock.sendMessage(ctx.remoteJid, { text: gateR.MSG_MODO }, { quoted: msg });
    }
    const p = prefix || '!';

    // ══ v8.00 MENURPG VIVO ═════════════════════════════════════
    // Deixou de ser uma parede de texto estática: agora lê a TUA
    // personagem (cartão HP/MP/nível/gold/vidas/guilda) e abre uma
    // LISTA TOQUE-PARA-CORRER — cada linha é um comando real; se
    // não tens personagem, o portal de criação fica no topo.
    let pl = null;
    try { pl = await require('../rpg/engine').peekPlayer(ctx.senderNumber); } catch {}
    const temChar = !!(pl && (pl.started || pl.raceBonusApplied || (pl.name && pl.name !== 'Aventureiro')));

    const _bar = (at, mx, cells = 10) => {
      const a = Math.max(0, Number(at) || 0), m2 = Math.max(1, Number(mx) || 0);
      const full = Math.round(Math.min(1, a / m2) * cells);
      return '▰'.repeat(full) + '▱'.repeat(cells - full);
    };
    const _bio = (pl?.biome?.visited?.length) || 0;

    let cartao;
    if (temChar) {
      cartao =
        '🕸️━━━━━━━━━━━━━━━━━━━━━━━🕸️\n' +
        '   *DARK VILLE* — *O TEU LIVRO*\n' +
        '🕸️━━━━━━━━━━━━━━━━━━━━━━━🕸️\n\n' +
        `🪶 *${(pl.name || 'Aventureiro').slice(0, 24)}*\n` +
        `🧬 ${String(pl.race || 'humano').toUpperCase()} · ${String(pl.class || 'guerreiro').toUpperCase()}\n` +
        `⭐ Nível *${pl.level || 1}* · XP ${pl.xp || 0}\n` +
        `❤️ ${_bar(pl.hp, pl.maxHp)} ${pl.hp ?? 0}/${pl.maxHp ?? 100}\n` +
        `🔮 ${_bar(pl.mp, pl.maxMp)} ${pl.mp ?? 0}/${pl.maxMp ?? 80}\n` +
        `💛 ${pl.coins ?? 0} gold · 🏦 ${pl.bank ?? 0} banco\n` +
        `💓 ${pl.lives ?? 3} vidas · ⚔️ ${pl.kills ?? 0} K / 💀 ${pl.deaths ?? 0} M\n` +
        (pl.guild ? `🏰 guilda: *${String(pl.guild).slice(0, 22)}*\n` : '') +
        (pl.winStreak ? `🔥 sequência de vitórias: *${pl.winStreak}*\n` : '') +
        `🗺️ biomas pisados: ${_bio}\n`;
    } else {
      cartao =
        '🕸️━━━━━━━━━━━━━━━━━━━━━━━🕸️\n' +
        '   *DARK VILLE* — *O TEU LIVRO*\n' +
        '🕸️━━━━━━━━━━━━━━━━━━━━━━━🕸️\n\n' +
        '⚠️ *Ainda não tens personagem neste mundo.*\n' +
        'A 1ª linha da lista (*CRIAR PERSONAGEM*) abre o portal —\n' +
        '_escolhe raça, classe e nome, e entra._ 🌀\n';
    }

    // ── linhas da lista (só comandos que EXISTEM no mundo) ────
    const R = (cmd, desc) => ({ title: `◈ ${p}${cmd}`, description: (desc || '').slice(0, 70), id: `${p}${cmd}` });
    const seccoes = [];
    if (!temChar) {
      seccoes.push({ title: '🌀 PORTAL DE ENTRADA', rows: [
        R('rpgstart', 'Criar a tua personagem — raça + classe + nome'),
        R('racas', 'Raças e classes disponíveis'),
        R('rpginfo', 'Como funciona o mundo'),
      ]});
      seccoes.push({ title: '🏆 VITRINE (sem personagem)', rows: [
        R('ranking', 'Tabela de heróis — quem manda em DARK VILLE'),
        R('mapa', 'O mapa do mundo — biomas e cidades'),
      ]});
    } else {
      seccoes.push({ title: '🎭 A TUA PERSONAGEM', rows: [
        R('rg', 'Ficha completa — atributos, magia, reputação'),
        R('tab', 'Abas interactivas — perfil, ficha, mochila, mundo, registos'),
        R('ficha', 'A tua ficha rápida — números no essencial'),
        R('nome', 'Mudar de nome — rebatiza o herói'),
        R('vidas', 'As tuas vidas — e como recuperá-las'),
        R('rgcard', 'Cartão de herói — a tua foto de perfil na arte (gif: rgcard gif)'),
        R('reviver', 'Reviver depois de morrer — gastas gold'),
      ]});
      seccoes.push({ title: '⚔️ AVENTURA & COMBATE', rows: [
        R('lutar', 'Combate PvE — sobe de nível e ganha loot'),
        R('explorar', 'Explorar biomas — tesouros e perigos'),
        R('quest', 'Missões do dia — histórias e recompensas'),
        R('historia', 'A tua história — capítulos e enredos'),
        R('viajar', 'Viajar no mundo — teleporta o teu herói'),
        R('irpara', 'Ir directo p/ bioma — sem voltas'),
        R('descansar', 'Descansar — recupera HP e MP'),
        R('pocao', 'Usar poção — cura imediata'),
      ]});
      seccoes.push({ title: '🃏 INVENTÁRIO & BAÚ', rows: [
        R('inventario', 'O teu inventário — armas, armaduras, poções'),
        R('bau', 'O teu baú — guarda e organiza'),
        R('falar', 'Falar com o mundo — NPCs e pistas'),
      ]});
      seccoes.push({ title: '🏰 PRAÇA — SOCIAL & RANKS', rows: [
        R('guilda', 'A tua guilda — ver, criar ou aderir'),
        R('criarguilda', 'Fundar guilda — a tua tag no mundo'),
        R('criaclan', 'Criar um clã — fundar irmandade'),
        R('npc', 'Falar com NPCs — pistas e histórias'),
        R('ranking', 'Tabela de heróis — o topo de DARK VILLE'),
        R('mundial', 'Rank mundial — o mundo inteiro a competir'),
      ]});
    }
    seccoes.push({ title: '🛠️ LIVRO DO MUNDO', rows: [
      R('regrasrpg', 'Regras da comunidade — o pacto'),
      R('rpgguia', 'Guia do aventureiro — primeiros passos'),
    ]});

    const bodyTxt = cartao +
      '\n📜 *O LIVRO DE COMANDOS DO RPG — escreve e joga:*\n' +
      '🕸️━━━━━━━━━━━━━━━━━━━━━━━🕸️';

    // ── v8.01: o menurpg é a LISTA DE TEXTO dos comandos RPG ─────
    // (a versão interactiva toque-para-correr vive na fila "RPG &
    // AVENTURA" do menu principal; aqui fica o livro, inteiro e em
    // texto, com o cartão vivo da personagem no topo)
    const listagem = seccoes.map(s =>
      '\n*' + s.title + '*\n' +
      s.rows.map(r => '  ' + r.id + (r.description ? ' — ' + r.description : '')).join('\n')
    ).join('\n');
    return sock.sendMessage(ctx.remoteJid, { text: bodyTxt + listagem + '\n\n🕸️━━━━━━━━━━━━━━━━━━━━━━━🕸️' }, { quoted: msg });
  }, true);
};
