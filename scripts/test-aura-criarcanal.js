#!/usr/bin/env node
/**
 * DARK BOT — REGRESSÃO: "cria um canal e me manda o link" (v7.14)
 *
 * O bug: o newsletterCreate do fork faz `thread.picture.id` na resposta
 * e um canal recém-criado tem picture=null →
 * "Não consegui: Cannot read properties of null (reading 'id')".
 * O canal ERA criado; só a leitura é que rebentava.
 *
 * Cobre:
 *   • detectarAcao: "cria um canal e me manda o link" → criarCanal.
 *   • Limpeza do nome: "…e me manda o link" NÃO vira nome do canal.
 *   • criarCanalSeguro: cria via w:mex com parser seguro (picture=null OK).
 *   • parseCriacaoCanal: tolera picture/name/description ausentes.
 *   • executar('criarCanal') end-to-end: cria + link + guarda.
 *   • Fallback para sock.newsletterCreate quando não há sock.query.
 *
 * Uso: node scripts/test-aura-criarcanal.js
 */
'use strict';

process.env.OWNER_NUMBER = '244945280380';

const acts = require('../src/aura/auraActions');
const canais = require('../src/aura/auraCanais');

let ok = 0, fail = 0;
const t = (n, c, e) => { e = e || ''; c ? ok++ : fail++; console.log('  ' + (c ? '✅' : '❌') + ' ' + n + (e ? ' → ' + String(e).slice(0, 70) : '')); };

/** Mock do sock com a query w:mex — resposta REAL do WhatsApp (picture=null). */
function sockComQuery(nome, desc, invite = 'abc123xyz') {
  return {
    query: async (iq) => {
      const q = iq.content.find(n => n.tag === 'query');
      const vars = JSON.parse(q.content.toString());
      return {
        tag: 'iq',
        content: [{
          tag: 'result',
          content: Buffer.from(JSON.stringify({
            data: {
              xwa2_newsletter_create: {
                id: '0029Criado',
                thread_metadata: {
                  name: { text: vars.variables.input.name },
                  description: { text: vars.variables.input.description },
                  invite,
                  subscribers_count: '0',
                  creation_time: '1700000000',
                  verification: 'unverified',
                  picture: null,          // ← o que rebentava o fork
                },
                viewer_metadata: { mute: 0 },
              },
            },
          })),
        }],
      };
    },
    newsletterCreate: async () => { throw new Error('não devia ser chamado'); },
  };
}

(async () => {
  console.log('\n╔═══ 1. Detecção e limpeza do nome ═══╗');
  {
    const a = acts.detectarAcao('cria um canal e me manda o link');
    t('"cria um canal e me manda o link" → criarCanal', a?.acao === 'criarCanal');

    // o link não pode virar nome: executar e conferir o nome usado
    const r = await acts.executar('criarCanal', a.valor, { sock: sockComQuery(), ctx: { botName: 'DARK BOT' } });
    t('"e me manda o link" não vira nome', !r.msg.includes('manda o link') || !r.msg.includes('Criei o canal *e me manda'));
    t('usa o nome do bot por omissão', r.msg.includes('Criei o canal *DARK BOT*'));
    t('responde com o link', r.ok && r.msg.includes('https://whatsapp.com/channel/abc123xyz'));

    const r2 = await acts.executar('criarCanal', 'Dark News e me manda o link', { sock: sockComQuery(), ctx: { botName: 'DARK BOT' } });
    t('"Dark News e me manda o link" → canal Dark News', r2.msg.includes('Criei o canal *Dark News*'));
    await canais.guardarCanal(null);
  }

  console.log('\n╔═══ 2. parseCriacaoCanal — tolera picture null ═══╗');
  {
    const p = canais.parseCriacaoCanal({
      id: '123@newsletter',
      thread_metadata: {
        name: { text: 'X' },
        description: { text: 'Y' },
        invite: 'inv',
        subscribers_count: '7',
        picture: null,
      },
      viewer_metadata: { mute: 1 },
    });
    t('id lido', p.id === '123@newsletter');
    t('nome lido', p.name === 'X');
    t('invite lido', p.invite === 'inv');
    t('picture null NÃO rebenta', p.pictureId === '');
    t('resposta vazia → null', canais.parseCriacaoCanal(null) === null);
    t('thread sem name → vazio, não rebenta', canais.parseCriacaoCanal({ id: 'x', thread_metadata: {}, viewer_metadata: {} }).name === '');
  }

  console.log('\n╔═══ 3. criarCanalSeguro — caminho w:mex ═══╗');
  {
    const n = await canais.criarCanalSeguro(sockComQuery(), 'Dark News', 'Canal oficial');
    t('cria sem rebentar no picture null', n && n.id === '0029Criado');
    t('lê o nome', n.name === 'Dark News');
    t('lê o invite', n.invite === 'abc123xyz');
  }

  console.log('\n╔═══ 4. criarCanalSeguro — erros do servidor ═══╗');
  {
    const sockErr = {
      query: async () => ({ tag: 'iq', content: [{ tag: 'result', content: Buffer.from(JSON.stringify({ errors: [{ message: 'nome inválido' }] })) }] }),
    };
    let threw = false;
    try { await canais.criarCanalSeguro(sockErr, 'x', 'y'); } catch (e) { threw = true; }
    t('erro GraphQL → lança (sem criar 2x)', threw);
  }

  console.log('\n╔═══ 5. Fallback para newsletterCreate ═══╗');
  {
    // sock SEM query → criarCanalSeguro devolve null → usa newsletterCreate
    let chamou = false;
    const sockSemQuery = { newsletterCreate: async () => { chamou = true; return { id: '0029F', invite: 'fallback' }; } };
    const r = await acts.executar('criarCanal', 'Fallback', { sock: sockSemQuery, ctx: { botName: 'DARK BOT' } });
    t('sem sock.query → cai no newsletterCreate', chamou);
    t('e responde ok com link', r.ok && r.msg.includes('fallback'));
    await canais.guardarCanal(null);
  }

  console.log(`\n${fail === 0 ? '🎉' : '⚠️ '} CRIAR CANAL: ${ok} OK / ${fail} FALHOU\n`);
  process.exit(fail ? 1 : 0);
})();
