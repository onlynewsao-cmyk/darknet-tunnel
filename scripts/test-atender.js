'use strict';
const path = require('path');
const A = require(path.join(__dirname, '..', 'src', 'bot', 'atenderChamada'));
let ok = 0, fail = 0;
const t = (n, c, e) => { c ? ok++ : fail++; console.log((c ? '✅' : '❌') + ' ' + n + (e ? ' → ' + e : '')); };

(async () => {
  const nodes = [];
  const sock = {
    sendNode: async (n) => { nodes.push(n); },
    generateMessageTag: () => 'T1',
  };
  const r = await A.atender(sock, {
    id: 'CALL1', from: '244900000111@s.whatsapp.net', status: 'offer', isVideo: false,
  });
  t('atendeu', r.ok && r.atendeu, JSON.stringify(r.passos?.map(p => p.passo)));
  t('tipo voz', r.tipo === 'voz');
  t('mandou preaccept', nodes.some(n => n.content?.[0]?.tag === 'preaccept'));
  t('mandou accept', nodes.some(n => n.content?.[0]?.tag === 'accept'));
  t('accept tem opus 16k', nodes.some(n =>
    n.content?.[0]?.tag === 'accept' &&
    (n.content[0].content || []).some(c => c.tag === 'audio' && c.attrs.rate === '16000')));

  nodes.length = 0;
  const v = await A.atender(sock, {
    id: 'CALL2', from: '244900000111@s.whatsapp.net', isVideo: true, isGroup: true,
    groupJid: '120363@g.us',
  });
  t('vídeo+grupo atende', v.ok && v.tipo === 'video' && v.grupo);

  const d = await A.desligar(sock, { id: 'CALL1', from: '244900000111@s.whatsapp.net' });
  t('desligar manda terminate', d.ok && nodes.some(n => n.content?.[0]?.tag === 'terminate'));

  console.log('\n' + ok + ' OK / ' + fail + ' FALHOU');
  process.exit(fail ? 1 : 0);
})();
