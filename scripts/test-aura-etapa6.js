#!/usr/bin/env node
/**
 * DARK BOT — AURA ETAPA 6 — CANAL DE STICKERS (v7.13)
 *
 * Cobre:
 *   • Cérebro: adotar_canal (antes de entrar_link), canal_perguntar,
 *     canal_respostas, canal_stickers, canal_pack, foto fixada.
 *   • auraCanais.adotarCanal: subscribe + guardar o canal (mock).
 *   • auraCanais.parsePergunta: pergunta + opções.
 *   • auraCanais.perguntarSeguidores: enquete (poll) e pergunta aberta.
 *   • auraCanais.lerRespostasCanal: votos (contagem + ilegíveis) e
 *     comentários em texto — sem inventar quando não há nada.
 *   • auraCanais.enviarStickersCanal / enviarPackCanal: busca + envio.
 *   • auraExec liga os casos.
 *   • Permissões: tudo só do Dono.
 *
 * Uso: node scripts/test-aura-etapa6.js
 */
'use strict';

process.env.OWNER_NUMBER = '244945280380';

const brain = require('../src/aura/auraBrain');
const canais = require('../src/aura/auraCanais');
const exec = require('../src/aura/auraExec');

let ok = 0, fail = 0;
const t = (n, c, e) => { e = e || ''; c ? ok++ : fail++; console.log('  ' + (c ? '✅' : '❌') + ' ' + n + (e ? ' → ' + String(e).slice(0, 70) : '')); };
const cap = (frase) => { const r = brain.detectarCapacidade(frase); return r ? r.id : null; };

/** Socket fake de canal de stickers. */
function sockCanal(log = []) {
  return {
    user: { id: '5511999999999@s.whatsapp.net' },
    newsletterMetadata: async (tipo, key) => ({ id: '0029Novo@newsletter', name: 'Stickers DARK', description: 'canal de stickers', invite: 'abc123', subscribers: 500 }),
    newsletterFollow: async (jid) => { log.push(['follow', jid]); },
    sendMessage: async (jid, cont) => { log.push(['msg', jid, cont]); return { key: { id: 'poll1' } }; },
  };
}

(async () => {
  console.log('\n╔═══ 1. Cérebro — detecção ═══╗');
  {
    const casos = [
      ['gere este canal https://whatsapp.com/channel/abc123456789012345', 'adotar_canal'],
      ['assume o meu canal https://whatsapp.com/channel/abc123456789012345', 'adotar_canal'],
      ['toma conta do canal', 'adotar_canal'],
      ['pergunta aos seguidores quais stickers querem: gatos, cães', 'canal_perguntar'],
      ['faz uma enquete no canal sobre stickers', 'canal_perguntar'],
      ['vê as respostas do canal', 'canal_respostas'],
      ['o que responderam no canal', 'canal_respostas'],
      ['manda 5 stickers de gatos no canal', 'canal_stickers'],
      ['envia stickers pro canal', 'canal_stickers'],
      ['manda um pack de gatos no canal', 'canal_pack'],
      ['envia um pack pro canal', 'canal_pack'],
      ['muda a foto fixada do canal', 'canal_foto'],
    ];
    for (const [f, esperado] of casos) t(`"${f}" → ${esperado}`, cap(f) === esperado, cap(f));

    const neg = [
      ['entra nesse canal https://whatsapp.com/channel/abc123456789012345', 'entrar_link'],
      ['status do grupo', null],
      ['manda stickers de gatos', null],
    ];
    for (const [f, esperado] of neg) t(`"${f}" NÃO vira gestão errada`, cap(f) === esperado, cap(f));
  }

  console.log('\n╔═══ 2. Permissões ═══╗');
  {
    for (const id of ['adotar_canal', 'canal_perguntar', 'canal_respostas', 'canal_stickers', 'canal_pack']) {
      t(`${id} é só do Dono`, brain.POR_ID.get(id).nivel === 'dono');
    }
    t('não-Dono não pergunta', brain.podeFazer(brain.POR_ID.get('canal_perguntar'), { isOwner: false, isAdmin: false }).pode === false);
    t('Dono pergunta', brain.podeFazer(brain.POR_ID.get('canal_perguntar'), { isOwner: true, isAdmin: false }).pode === true);
  }

  console.log('\n╔═══ 3. parsePergunta ═══╗');
  {
    let r = canais.parsePergunta('pergunta aos seguidores quais stickers querem: gatos, cães, memes');
    t('pergunta + 3 opções', r.pergunta === 'Quais stickers querem' && r.opcoes.length === 3 && r.opcoes[0] === 'gatos');
    r = canais.parsePergunta('faz uma enquete no canal: futebol, memes, amor');
    t('enquete → opções separadas por vírgula', r.opcoes.length === 3 && r.opcoes.includes('futebol'));
    r = canais.parsePergunta('pergunta no canal quais stickers querem');
    t('sem opções → pergunta aberta', r.pergunta.length >= 6 && r.opcoes.length === 0);
  }

  console.log('\n╔═══ 4. adotarCanal — assume a gestão ═══╗');
  {
    const log = [];
    const sock = sockCanal(log);
    await canais.guardarCanal(null);
    const r = await canais.adotarCanal(sock, 'gere este canal https://whatsapp.com/channel/abc123456789012345');
    t('entra (follow)', r.ok && log.some(l => l[0] === 'follow' && l[1] === '0029Novo@newsletter'));
    const meu = await canais.meuCanal();
    t('guarda como meu canal', meu && meu.jid === '0029Novo@newsletter' && meu.name === 'Stickers DARK');
    const semLink = await canais.adotarCanal(sock, 'gere o canal');
    t('sem link → pede o link', !semLink.ok);
    await canais.guardarCanal(null);
  }

  console.log('\n╔═══ 5. perguntarSeguidores ═══╗');
  {
    const log = [];
    const sock = sockCanal(log);
    await canais.guardarCanal({ jid: '0029Novo@newsletter', name: 'Stickers DARK' });

    let r = await canais.perguntarSeguidores(sock, 'meu canal', 'pergunta aos seguidores quais stickers querem: gatos, cães');
    t('manda enquete (poll) no canal', r.ok && log.some(l => l[0] === 'msg' && l[1] === '0029Novo@newsletter' && l[2]?.poll?.values?.length === 2));
    t('resposta mostra as opções', r.ok && r.msg.includes('1. gatos') && r.msg.includes('2. cães'));

    r = await canais.perguntarSeguidores(sock, 'meu canal', 'pergunta no canal quais stickers querem');
    t('sem opções → pergunta aberta em texto', r.ok && log.some(l => l[2]?.text && /quais stickers querem/i.test(l[2].text)));
    await canais.guardarCanal(null);
  }

  console.log('\n╔═══ 6. lerRespostasCanal — votos e comentários ═══╗');
  {
    const { messageCache } = require('../src/bot/messageListener');
    messageCache.clear();
    const JID = '0029Novo@newsletter';
    // votos (encPayload inválido → contados como ilegíveis, sem inventar)
    messageCache.set('v1', {
      key: { remoteJid: JID, id: 'v1', participant: '2449111111111@s.whatsapp.net' },
      pushName: 'Ana', messageTimestamp: 1700001000,
      message: { pollUpdateMessage: { pollCreationMessageKey: { remoteJid: JID, id: 'poll1' }, vote: { encPayload: Buffer.from('x'), encIv: Buffer.from('y') } } },
    });
    // comentário em texto
    messageCache.set('c1', {
      key: { remoteJid: JID, id: 'c1', participant: '2449222222222@s.whatsapp.net', fromMe: false },
      pushName: 'Bruno', messageTimestamp: 1700002000,
      message: { conversation: 'quero stickers de futebol!' },
    });
    // mensagem do próprio bot (ignorada)
    messageCache.set('c2', {
      key: { remoteJid: JID, id: 'c2', fromMe: true },
      message: { conversation: 'pergunta' },
    });

    const sock = { user: { id: '5511999999999@s.whatsapp.net' } };
    await canais.guardarCanal({ jid: JID, name: 'Stickers DARK' });

    let r = await canais.lerRespostasCanal(sock, 'meu canal');
    t('conta o voto recebido', r.ok && /1 voto/i.test(r.msg));
    t('marca voto ilegível sem inventar opção', r.ok && /não consegui ler|ileg/i.test(r.msg));
    t('lê os comentários em texto', r.ok && r.msg.includes('Bruno') && r.msg.includes('futebol'));

    messageCache.clear();
    r = await canais.lerRespostasCanal(sock, 'meu canal');
    t('sem nada → diz que ninguém respondeu', r.ok && /ninguém respondeu|não há votos/i.test(r.msg));
    await canais.guardarCanal(null);
  }

  console.log('\n╔═══ 7. enviarStickersCanal / enviarPackCanal ═══╗');
  {
    const slyPath = require.resolve('../src/bot/stickerly');
    const packPath = require.resolve('../src/bot/stickerPack');
    const realSly = require.cache[slyPath];
    const realPack = require.cache[packPath];
    require.cache[slyPath] = {
      id: slyPath, filename: slyPath, loaded: true,
      exports: { searchAndDownload: async (q) => ({ stickers: [{ buf: Buffer.alloc(600, 1) }, { buf: Buffer.alloc(600, 2) }], title: 'Gatos fofos' }) },
    };
    require.cache[packPath] = {
      id: packPath, filename: packPath, loaded: true,
      exports: { sendNativeStickerPack: async (s, j, bufs) => { packLog.push(['pack', j, bufs.length]); return true; } },
    };

    const JID = '0029Novo@newsletter';
    await canais.guardarCanal({ jid: JID, name: 'Stickers DARK' });
    let log = [];
    const sock = sockCanal(log);
    let packLog = [];

    let r = await canais.enviarStickersCanal(sock, 'meu canal', 'gatos', 5);
    t('envia stickers um a um', r.ok && log.filter(l => l[0] === 'msg' && l[2]?.sticker).length === 2 && /2 stickers?/.test(r.msg));

    r = await canais.enviarPackCanal(sock, 'meu canal', 'gatos');
    t('envia o pack inteiro', r.ok && packLog.some(l => l[0] === 'pack' && l[1] === JID && l[2] === 2));

    r = await canais.enviarStickersCanal(sock, 'meu canal', 'esses', 5);
    t('"esses" sem vencedor → pede tema', !r.ok);

    if (realSly) require.cache[slyPath] = realSly; else delete require.cache[slyPath];
    if (realPack) require.cache[packPath] = realPack; else delete require.cache[packPath];
    await canais.guardarCanal(null);
  }

  console.log('\n╔═══ 8. auraExec — casos ligados ═══╗');
  {
    const log = [];
    const sock = sockCanal(log);
    const base = { sock, msg: null, ctx: { remoteJid: 'pv@s.whatsapp.net', isGroup: false }, isOwner: true, isAdmin: false };

    let r = await exec.executar('adotar_canal', null, { ...base, texto: 'gere este canal https://whatsapp.com/channel/abc123456789012345' });
    t('auraExec adotar_canal', r.ok && log.some(l => l[0] === 'follow'));

    r = await exec.executar('canal_perguntar', null, { ...base, texto: 'pergunta aos seguidores quais stickers querem: gatos, cães' });
    t('auraExec canal_perguntar', r.ok && log.some(l => l[2]?.poll?.values?.length === 2));

    r = await exec.executar('canal_stickers', null, { ...base, texto: 'manda 5 stickers de gatos no canal' });
    t('auraExec canal_stickers liga ao enviar', r && typeof r.msg === 'string');
    await canais.guardarCanal(null);
  }

  console.log(`\n${fail === 0 ? '🎉' : '⚠️ '} ETAPA 6: ${ok} OK / ${fail} FALHOU\n`);
  process.exit(fail ? 1 : 0);
})();
