'use strict';
const h = require('../src/bot/humanizer');
let ok = 0, fail = 0;
const t = (n, c, d = '') => { c ? ok++ : fail++; console.log(`  ${c ? '✅' : '❌'} ${n} ${d}`); };
(async () => {
  const ev = [];
  const sock = {
    sendMessage: async (jid, c) => { ev.push(['send', jid, Object.keys(c)[0]]); return { key: { id: 'x' } }; },
    sendPresenceUpdate: async (p, jid) => { ev.push(['presence', p]); },
    readMessages: async (keys) => { ev.push(['read', keys[0].id]); },
  };
  h.wrap(sock);
  t('wrap idempotente', h.wrap(sock) === sock && sock.__humanized);

  const msg = { key: { remoteJid: '244900@s.whatsapp.net', id: 'M1', fromMe: false }, message: { conversation: 'oi' } };
  h.notaRecebida(msg);
  let t0 = Date.now();
  await sock.sendMessage(msg.key.remoteJid, { text: 'Olá! Tudo bem contigo? '.repeat(4) });
  let dt = Date.now() - t0;
  const seq = ev.map(e => e[0] + (e[1] && e[0] !== 'send' ? ':' + e[1] : '')).join(' ');
  t('ordem: lido → composing → paused → envio', /read:M1 presence:composing presence:paused send/.test(seq), seq);
  t('atraso proporcional (>=1.1s, <=7s)', dt >= 1100 && dt <= 7000, dt + 'ms');

  ev.length = 0; t0 = Date.now();
  await sock.sendMessage(msg.key.remoteJid, { audio: Buffer.alloc(1), ptt: true, seconds: 8 });
  dt = Date.now() - t0;
  t('envio seguido: sem novo lido, atraso curto', !ev.some(e => e[0] === 'read') && dt < 1500, dt + 'ms ' + JSON.stringify(ev));

  ev.length = 0;
  h.notaRecebida({ key: { remoteJid: '244901@s.whatsapp.net', id: 'M2', fromMe: false } });
  t0 = Date.now();
  await sock.sendMessage('244901@s.whatsapp.net', { audio: Buffer.alloc(1), ptt: true, seconds: 5 });
  t('PTT → presença recording', ev.some(e => e[1] === 'recording'), JSON.stringify(ev));
  t('PTT atraso 1.5–8s', Date.now() - t0 >= 1500 && Date.now() - t0 <= 8000);

  ev.length = 0; t0 = Date.now();
  await sock.sendMessage('244902@s.whatsapp.net', { react: { text: '👍', key: msg.key } });
  t('reacção passa directo (sem presença/atraso)', ev.length === 1 && Date.now() - t0 < 100);

  ev.length = 0; t0 = Date.now();
  await sock.sendMessage('244903@s.whatsapp.net', { text: 'aviso agendado' });
  dt = Date.now() - t0;
  t('envio de sistema (sem msg recebida): só jitter curto', dt >= 100 && dt < 1000 && !ev.some(e => e[0] === 'read'), dt + 'ms');

  ev.length = 0;
  h.lerSemResponder(sock, { key: { remoteJid: '244904@s.whatsapp.net', id: 'M4', fromMe: false } });
  t('lerSemResponder não lê imediatamente', ev.length === 0);
  ev.length = 0;
  h.lerSemResponder(sock, { key: { remoteJid: '1@g.us', id: 'M5', fromMe: false } });
  await new Promise(r => setTimeout(r, 50));
  t('lerSemResponder ignora grupos', ev.length === 0);

  console.log(`\n${fail ? '❌' : '🎉'} HUMANIZER: ${ok} OK / ${fail} FALHOU`);
  process.exit(fail ? 1 : 0);
})();
