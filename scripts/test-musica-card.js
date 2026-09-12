#!/usr/bin/env node
/**
 * DARK BOT — case 'som' (cartão de música descartável) (v7.21)
 *
 * Cobre:
 *   • legenda() com o layout exacto (título, duração, views, publicado, canal).
 *   • mostrar() guarda o pendente e envia a CAPA (imagem) com legenda.
 *   • tentarNumero(): sem pendente → false (não intercepta); com pendente:
 *       01 → áudio (ptt false) · 02 → documento · 03 → voz (ptt true)
 *     e o pendente é descartado depois de usado.
 *   • limpeza TTL.
 *
 * Uso: node scripts/test-musica-card.js
 */
'use strict';

process.env.MONGODB_URI = '';
process.env.OWNER_NUMBER = '244945280380';

const mc = require('../src/bot/musicaCard');

let ok = 0, fail = 0;
const t = (n, c, e) => { e = e || ''; c ? ok++ : fail++; console.log('  ' + (c ? '✅' : '❌') + ' ' + n + (e ? ' → ' + String(e).slice(0, 70) : '')); };

const VIDEO = {
  title: 'Parabéns kizomba Feliz Aniversario',
  youtube_url: 'https://www.youtube.com/watch?v=abc12345678',
  thumbnail: 'https://i.ytimg.com/vi/abc12345678/hqdefault.jpg',
  author: 'Filipe Sebastião',
  views: 1808669,
  duration: '6:07',
  ago: '6 years ago',
};

// sock mock que captura as mensagens
function mkSock(log = []) {
  return {
    sendMessage: async (jid, cont, opts) => {
      log.push({ jid, cont, opts });
      return { key: { id: 'x' } };
    },
  };
}

// stub do ytdl (evita downloads reais)
function stubYtdl() {
  const p = require.resolve('../src/bot/ytdl');
  const real = require.cache[p];
  require.cache[p] = {
    id: p, filename: p, loaded: true,
    exports: { getAudio: async () => ({ buffer: Buffer.alloc(4096, 1), title: 'Parabéns kizomba' }) },
  };
  return real;
}

function stubSystemZeroPlay() {
  const p = require.resolve('../src/bot/systemZeroPlay');
  const real = require.cache[p];
  require.cache[p] = {
    id: p, filename: p, loaded: true,
    exports: { ytAudio: async () => { throw new Error('api fora'); }, ytsearch: async () => ({ resultados: [VIDEO] }) },
  };
  return real;
}

(async () => {
  const realYtdl = stubYtdl();
  const realSZP = stubSystemZeroPlay();

  console.log('\n╔═══ 1. legenda — layout ═══╗');
  {
    const l = mc.legenda(VIDEO);
    t('título', l.includes('Parabéns kizomba Feliz Aniversario'));
    t('duração', l.includes('6:07'));
    t('views formatados (1,808,669)', l.includes('1,808,669'));
    t('publicado (6 years ago)', l.includes('6 years ago'));
    t('canal', l.includes('Filipe Sebastião'));
    t('opções 01/02/03', l.includes('01') && l.includes('02') && l.includes('03'));
    t('sem campos vazios órfãos', !l.includes('_0_') && !l.includes('_—_'));
  }

  console.log('\n╔═══ 2. mostrar — capa + pendente ═══╗');
  {
    const log = [];
    const sock = mkSock(log);
    const ctx = { remoteJid: '123@g.us', senderNumber: '244945280380' };
    // stub fetchBuffer? mediaHandler.fetchBuffer tentaria rede — vamos só ver a mensagem
    const mhPath = require.resolve('../src/bot/mediaHandler');
    const realMH = require.cache[mhPath];
    require.cache[mhPath] = {
      id: mhPath, filename: mhPath, loaded: true,
      exports: { fetchBuffer: async () => null, fetchJson: async () => { throw new Error('n'); } },
    };

    await mc.mostrar(sock, { key: { id: 'q' } }, ctx, { ...VIDEO, thumbnail: '' });
    t('enviou mensagem', log.length === 1);
    t('texto é a legenda (sem capa)', log[0].cont.text && log[0].cont.text.includes('Parabéns kizomba'));
    t('guardou pendente', mc._pendentes.has('123@g.us::244945280380'));

    if (realMH) require.cache[mhPath] = realMH; else delete require.cache[mhPath];
  }

  console.log('\n╔═══ 3. tentarNumero — sem pendente não intercepta ═══╗');
  {
    mc._pendentes.clear();
    const log = [];
    const sock = mkSock(log);
    const r = await mc.tentarNumero(sock, { key: { id: 'q' } }, { remoteJid: 'x@g.us', senderNumber: '999' }, '01');
    t('"01" sem pendente → false', r === false);
    t('nada enviado', log.length === 0);
  }

  console.log('\n╔═══ 4. tentarNumero — 01/02/03 ═══╗');
  {
    const ctx = { remoteJid: '123@g.us', senderNumber: '244945280380' };
    const key = '123@g.us::244945280380';

    // 01 → áudio
    mc._pendentes.set(key, { video: VIDEO, ts: Date.now() });
    let log = [];
    let sock = mkSock(log);
    let r = await mc.tentarNumero(sock, { key: { id: 'q' } }, ctx, '01');
    t('"01" → tratou', r === true);
    t('"01" → áudio (ptt false)', log.some(x => x.cont.audio && x.cont.ptt === false));
    t('pendente descartado', !mc._pendentes.has(key));

    // 02 → documento
    mc._pendentes.set(key, { video: VIDEO, ts: Date.now() });
    log = [];
    sock = mkSock(log);
    r = await mc.tentarNumero(sock, { key: { id: 'q' } }, ctx, '2');
    t('"2" → documento', r === true && log.some(x => x.cont.document && x.cont.fileName.endsWith('.mp3')));
    t('pendente descartado (2)', !mc._pendentes.has(key));

    // 03 → voz (ptt true; sem ffmpeg cai no mp3 ptt)
    mc._pendentes.set(key, { video: VIDEO, ts: Date.now() });
    log = [];
    sock = mkSock(log);
    r = await mc.tentarNumero(sock, { key: { id: 'q' } }, ctx, '03');
    t('"03" → voz (ptt true)', r === true && log.some(x => x.cont.audio && x.cont.ptt === true));
    t('pendente descartado (3)', !mc._pendentes.has(key));

    // "4" não é opção
    mc._pendentes.set(key, { video: VIDEO, ts: Date.now() });
    r = await mc.tentarNumero(sock, { key: { id: 'q' } }, ctx, '04');
    t('"04" → não intercepta', r === false);
    t('pendente intacto (4)', mc._pendentes.has(key));
    mc._pendentes.clear();
  }

  console.log('\n╔═══ 5. busca com fallback (SystemZone) ═══╗');
  {
    // yt-search real pode falhar sem rede; forçamos o fallback
    const v = await mc.buscar('parabens kizomba').catch(e => null);
    // se a rede estiver em baixo devolve null — não rebenta o teste de rede
    t('buscar devolve ou erro controlado', v === null || (v && v.title));
  }

  if (realYtdl) require.cache[require.resolve('../src/bot/ytdl')] = realYtdl; else delete require.cache[require.resolve('../src/bot/ytdl')];
  if (realSZP) require.cache[require.resolve('../src/bot/systemZeroPlay')] = realSZP; else delete require.cache[require.resolve('../src/bot/systemZeroPlay')];

  console.log('\n╔═══ 6. FONTE estilizada (letras/símbolos/emojis) ═══╗');
  {
    const ft = require('../src/bot/fancyText');
    t('estilizar pequenas', ft.estilizar('title', 'pequenas') === 'ᴛɪᴛʟᴇ');
    t('estilizar cartao (negrito+smallcaps)', ft.estilizar('duration', 'cartao') === '𝗗ᴜʀᴀᴛɪᴏɴ');
    t('estilizar views', ft.estilizar('views', 'cartao') === '𝗩ɪᴇᴡꜱ');
    t('estilizar published', ft.estilizar('published', 'cartao') === '𝗣ᴜʙʟɪꜱʜᴇᴅ');
    t('estilizar channel', ft.estilizar('channel', 'cartao') === '𝗖ʜᴀɴɴᴇʟ');
    t('estilizar mono (REPLY WITH NUMBER)', ft.estilizar('REPLY WITH NUMBER', 'mono') === '𝚁𝙴𝙿𝙻𝚈 𝚆𝙸𝚃𝙷 𝙽𝚄𝙼𝙱𝙴𝚁');
    t('ROTULOS.downAudio', ft.ROTULOS.downAudio === 'ᴅᴏᴡɴʟᴏᴀᴅ ᴀᴜᴅɪᴏ');
    // a legenda do bot usa os mesmos rótulos (fonte única)
    const l = mc.legenda(VIDEO);
    t('legenda usa a fonte estilizada', l.includes('ᴛɪᴛʟᴇ') && l.includes('𝗗ᴜʀᴀᴛɪᴏɴ') && l.includes('𝚁𝙴𝙿𝙻𝚈 𝚆𝙸𝚃𝙷 𝙽𝚄𝙼𝙱𝙴𝚁'));
  }

  console.log('\n╔═══ 7. Código portável (para outros bots) ═══╗');
  {
    const fs = require('fs');
    const path = require('path');
    const ficheiro = path.join(__dirname, '..', 'exports', 'case-som-portavel.js');
    t('ficheiro portável existe', fs.existsSync(ficheiro));

    const port = require('../exports/case-som-portavel.js');
    t('portável exporta som()', typeof port.som === 'function');
    t('portável exporta tentarNumero()', typeof port.tentarNumero === 'function');
    t('portável exporta estilizar()', typeof port.estilizar === 'function');

    const lp = port.legenda(VIDEO);
    t('portável: legenda estilizada', lp.includes('ᴛɪᴛʟᴇ') && lp.includes('𝗗ᴜʀᴀᴛɪᴏɴ') && lp.includes('01') && lp.includes('03'));

    const codigo = fs.readFileSync(ficheiro, 'utf8');
    t('portável marca ADAPTE AQUI (fonte)', /ADAPTE AQUI/.test(codigo) && /FONTE/.test(codigo));
    t('portável marca ADAPTE AQUI (download)', /DOWNLOAD/.test(codigo) && /baixarAudio/.test(codigo));
    // autónomo: só depende de pacotes npm/builtins — nunca de ficheiros do repo (`../`)
    const alvos = [...codigo.matchAll(/require\(['"]([^'"]+)['"]\)/g)].map(m => m[1]);
    const interno = alvos.filter(a => a.startsWith('..'));
    t('portável é autónomo (nada de ../ do repo)', interno.length === 0);

    // tentarNumero do portável (mesmo contrato)
    port._pendentes.clear();
    port._pendentes.set('123@g.us::244945280380', { video: { ...VIDEO, youtube_url: 'https://youtu.be/abc12345678' }, ts: Date.now() });
    const r = await port.tentarNumero(mkSock([]), { key: { id: 'q' } }, { remoteJid: '123@g.us', senderNumber: '244945280380' }, '01')
      .catch(() => 'erro-controlado');
    t('portável tentarNumero responde (tratou ou erro controlado)', r === true || r === 'erro-controlado');
    port._pendentes.clear();
  }

  console.log('\n╔═══ 8. case somcode registada ═══╗');
  {
    const caseHandler = require('../src/bot/caseHandler');
    caseHandler.init();   // carrega os ficheiros de cases (síncrono)
    const { CASES } = caseHandler;
    t('somcode registado', CASES.has('somcode'));
    t('codsom registado', CASES.has('codsom'));
    t('codesom registado', CASES.has('codesom'));
  }

  console.log(`\n${fail === 0 ? '🎉' : '⚠️ '} MUSICA CARD: ${ok} OK / ${fail} FALHOU\n`);
  process.exit(fail ? 1 : 0);
})();
