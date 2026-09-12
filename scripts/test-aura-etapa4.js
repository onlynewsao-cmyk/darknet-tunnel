#!/usr/bin/env node
/**
 * DARK BOT — AURA ETAPA 4 — GESTÃO DE CANAL COMPLETA
 *
 * Cobre:
 *   • Cérebro (detectarCapacidade): renomear, descrever, foto, tirar foto,
 *     estatísticas, apagar, agendar, postar no canal — e os negativos
 *     (info/seguir/deixar de seguir continuam a ir para o sítio certo).
 *   • Permissões: gestão é só do Dono; estatísticas são livres.
 *   • auraCanais: guardar/lembrar o canal do bot + renomear/descrever/foto/
 *     tirar foto/estatísticas/apagar (com socket mockado).
 *   • auraActions.criarCanal: cria E guarda o canal (com descrição opcional).
 *   • auraExec.canal_postar: publica DE VERDADE (antes ficava em `gerar`).
 *   • auraExec.canal_agendar: liga à agenda real.
 *   • Gate de voz: "muda o nome do meu canal" passa `pareceOrdem`.
 *
 * Uso: node scripts/test-aura-etapa4.js
 */
'use strict';

process.env.OWNER_NUMBER = '244945280380';

const brain = require('../src/aura/auraBrain');
const canais = require('../src/aura/auraCanais');
const acts = require('../src/aura/auraActions');
const exec = require('../src/aura/auraExec');

let ok = 0, fail = 0;
const t = (n, c, e) => { e = e || ''; c ? ok++ : fail++; console.log('  ' + (c ? '✅' : '❌') + ' ' + n + (e ? ' → ' + String(e).slice(0, 70) : '')); };
const cap = (frase) => { const r = brain.detectarCapacidade(frase); return r ? r.id : null; };

/** Socket fake de gestão de canal — regista as chamadas. */
function sockCanal(log = []) {
  return {
    newsletterMetadata: async () => ({ id: '0029Novo@newsletter', name: 'Dark News', description: 'Canal oficial', subscribers: 500, invite: 'xyz123' }),
    newsletterUpdateName: async (jid, n) => { log.push(['name', jid, n]); },
    newsletterUpdateDescription: async (jid, d) => { log.push(['desc', jid, d]); },
    newsletterUpdatePicture: async (jid, b) => { log.push(['pic', jid, b.length]); },
    newsletterRemovePicture: async (jid) => { log.push(['rmpic', jid]); },
    newsletterDelete: async (jid) => { log.push(['del', jid]); },
    newsletterAdminCount: async () => 3,
    newsletterCreate: async (nome, desc) => ({ id: '0029Novo', name: nome, description: desc, invite: 'xyz123' }),
  };
}

(async () => {
  console.log('\n╔═══ 1. Cérebro — frases de gestão de canal ═══╗');
  {
    const casos = [
      ['muda o nome do meu canal para Dark News', 'canal_renomear'],
      ['renomeia o canal', 'canal_renomear'],
      ['muda a descrição do canal para Novidades', 'canal_descrever'],
      ['põe esta foto no canal', 'canal_foto'],
      ['muda a foto do meu canal', 'canal_foto'],
      ['tira a foto do canal', 'canal_tirarfoto'],
      ['estatísticas do meu canal', 'canal_stats'],
      ['como está o meu canal', 'canal_stats'],
      ['apaga o meu canal', 'canal_apagar'],
      ['agenda um post no canal todos os dias', 'canal_agendar'],
      ['posta no canal: bom dia', 'canal_postar'],
    ];
    for (const [f, esperado] of casos) t(`"${f}" → ${esperado}`, cap(f) === esperado, cap(f));

    // negativos — não roubar as capacidades existentes
    const neg = [
      ['como está o canal Dark News', 'canal_info'],
      ['info do canal', 'canal_info'],
      ['segue o canal X', 'canal_seguir'],
      ['deixa de seguir o canal X', 'canal_deixar'],
      ['status do grupo', null],
    ];
    for (const [f, esperado] of neg) t(`"${f}" NÃO vira gestão`, cap(f) === esperado, cap(f));
  }

  console.log('\n╔═══ 2. Permissões ═══╗');
  {
    const capa = brain.POR_ID.get('canal_renomear');
    t('canal_renomear é só do Dono', capa.nivel === 'dono');
    t('canal_stats é livre', brain.POR_ID.get('canal_stats').nivel === 'todos');
    t('canal_apagar é destrutivo', brain.POR_ID.get('canal_apagar').risco === 'destrutivo');
    const naoDono = brain.podeFazer(brain.POR_ID.get('canal_renomear'), { isOwner: false, isAdmin: false });
    t('não-Dono não renomeia', naoDono.pode === false);
    const dono = brain.podeFazer(brain.POR_ID.get('canal_renomear'), { isOwner: true, isAdmin: false });
    t('Dono renomeia', dono.pode === true);
  }

  console.log('\n╔═══ 3. Gate de voz ═══╗');
  {
    t('"muda o nome do meu canal" pareceOrdem', brain.pareceOrdem('muda o nome do meu canal para X') === true);
    t('"mostra as estatísticas do meu canal" pareceOrdem', brain.pareceOrdem('mostra as estatísticas do meu canal') === true);
    t('"estatísticas do meu canal" → canal_stats', cap('mostra as estatísticas do meu canal') === 'canal_stats');
  }

  console.log('\n╔═══ 4. auraCanais — gestão (socket mockado) ═══╗');
  {
    const log = [];
    const sock = sockCanal(log);
    await canais.guardarCanal({ jid: '0029Novo@newsletter', name: 'Dark News', description: 'Canal oficial', invite: 'xyz123' });
    const meu = await canais.meuCanal();
    t('guarda e lembra o canal', meu && meu.jid === '0029Novo@newsletter');
    t('normJid acrescenta @newsletter', canais.normJid('0029Novo') === '0029Novo@newsletter');

    let r = await canais.renomearCanal(sock, 'muda o nome do meu canal para Novidades', 'Novidades');
    t('renomearCanal', r.ok && log.some(l => l[0] === 'name' && l[1] === '0029Novo@newsletter' && l[2] === 'Novidades'));

    r = await canais.descreverCanal(sock, 'muda a descrição do meu canal para Coisas novas', 'Coisas novas');
    t('descreverCanal', r.ok && log.some(l => l[0] === 'desc' && l[2] === 'Coisas novas'));

    r = await canais.fotoCanal(sock, 'põe esta foto no canal', Buffer.alloc(1000, 1));
    t('fotoCanal', r.ok && log.some(l => l[0] === 'pic' && l[2] === 1000));

    r = await canais.fotoCanal(sock, 'põe esta foto no canal', Buffer.alloc(10));
    t('fotoCanal recusa buffer vazio', !r.ok);

    r = await canais.tirarFotoCanal(sock, 'tira a foto do canal');
    t('tirarFotoCanal', r.ok && log.some(l => l[0] === 'rmpic'));

    r = await canais.estatisticasCanal(sock, 'estatísticas do meu canal');
    t('estatisticasCanal', r.ok && r.msg.includes('500') && r.msg.includes('3 admins') && r.msg.includes('whatsapp.com/channel/xyz123'));

    r = await canais.apagarCanal(sock, 'apaga o meu canal');
    t('apagarCanal', r.ok && log.some(l => l[0] === 'del'));
    t('apagar limpa o estado', (await canais.meuCanal()) === null);
  }

  console.log('\n╔═══ 5. criarCanal — cria E guarda ═══╗');
  {
    const log = [];
    const sock = sockCanal(log);
    const r = await acts.executar('criarCanal', 'Dark News', { sock, ctx: { botName: 'DARK BOT' } });
    t('criarCanal responde com link', r.ok && r.msg.includes('whatsapp.com/channel/xyz123'));
    const meu = await canais.meuCanal();
    t('criarCanal guarda o canal', meu && meu.jid === '0029Novo@newsletter' && meu.name === 'Dark News');

    // com descrição
    const r2 = await acts.executar('criarCanal', 'Dark News com a descrição Notícias diárias', { sock, ctx: { botName: 'DARK BOT' } });
    const meu2 = await canais.meuCanal();
    t('criarCanal aceita descrição', meu2 && meu2.description === 'Notícias diárias');
  }

  console.log('\n╔═══ 6. auraExec — postar e agendar ═══╗');
  {
    const aiPath = require.resolve('../src/bot/ai');
    const realAi = require.cache[aiPath];
    require.cache[aiPath] = { id: aiPath, filename: aiPath, loaded: true, exports: { chat: async () => 'Bom dia, família! ☀️' } };

    let posted = null;
    const sockPost = { ...sockCanal(), sendMessage: async (jid, cont) => { posted = [jid, cont.text]; } };
    await canais.guardarCanal({ jid: '0029Novo@newsletter', name: 'Dark News' });

    let r = await exec.executar('canal_postar', 'posta no canal: bom dia', {
      sock: sockPost, msg: null, ctx: { remoteJid: 'pv@s.whatsapp.net', isGroup: false },
      texto: 'posta no canal: bom dia', isOwner: true, isAdmin: false,
    });
    t('canal_postar publica de verdade', r.ok && posted && posted[0] === '0029Novo@newsletter' && posted[1] === 'Bom dia, família! ☀️');

    r = await exec.executar('canal_agendar', 'agenda um post no canal todos os dias', {
      sock: sockPost, msg: null, ctx: { remoteJid: 'pv@s.whatsapp.net', isGroup: false },
      texto: 'agenda um post no canal todos os dias', isOwner: true, isAdmin: false,
    });
    t('canal_agendar liga à agenda', r.ok && /Agendado|agendamento/i.test(r.msg));

    if (realAi) require.cache[aiPath] = realAi; else delete require.cache[aiPath];
    await canais.guardarCanal(null);
  }

  console.log(`\n${fail === 0 ? '🎉' : '⚠️ '} ETAPA 4: ${ok} OK / ${fail} FALHOU\n`);
  process.exit(fail ? 1 : 0);
})();
