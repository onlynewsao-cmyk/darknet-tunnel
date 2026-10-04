/** v7.43 — chamadas VoIP: ligar/atender/tocar/parar/desligar com sock mockado. */
process.env.NODE_ENV = 'test';
const EventEmitter = require('events');
const voip = require('../src/bot/callVoip');
let ok = 0, bad = 0;
const C = (n, c, x = '') => { if (c) { ok++; console.log('  ✅', n); } else { bad++; console.log('  ❌', n, x); } };
(async () => {
  console.log('test-call-voip');
  C('lib ≥1.1.3 instalada', require('@systemzero/baileys/package.json').version >= '1.1.3');
  C('opusscript instalado', (() => { try { require.resolve('opusscript'); return true; } catch { return false; } })());
  const ev = new EventEmitter(); const played = []; let ended = null, stopped = 0, groupStarts = 0;
  const sock = { ev, calls: {}, user: { id: '1@s.whatsapp.net' },
    groupMetadata: async () => ({ participants: [
      { id: '1@s.whatsapp.net' }, { id: '2@lid' }, { id: '3@lid' },
    ] }),
    startCall: async (jid) => { const callId = 'c1'; sock.calls[callId] = { status: 'offer', peer: jid }; setTimeout(() => { sock.calls[callId].status = 'accept'; ev.emit('call', [{ id: callId, status: 'accept', from: jid }]); }, 100); return { callId }; },
    startGroupCall: async () => { groupStarts++; return { callId: 'g1', participantCount: 2 }; },
    playCallAudio: (id, pcm) => { played.push([id, pcm.length]); return true; },
    stopCallAudio: () => { stopped++; return true; }, endCall: async (id) => { ended = id; return true; },
    sendPresenceUpdate: async () => {} };
  C('suportado(sock)', voip.suportado(sock));
  C('não suportado sem startCall', !voip.suportado({ playCallAudio() {} }));
  const r = await voip.ligar(sock, '244900@s.whatsapp.net');
  C('ligar → atendida', r.ok && r.callId === 'c1', JSON.stringify(r));
  C('activa registada', !!voip.activa('244900@s.whatsapp.net'));
  // PCM: gera 1s de seno em wav e converte
  const sr = 8000, n = sr; const wav = Buffer.alloc(44 + n * 2);
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + n * 2, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(sr, 24); wav.writeUInt32LE(sr * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) wav.writeInt16LE(Math.round(Math.sin(i / 10) * 8000), 44 + i * 2);
  const t = await voip.tocarBuffer(sock, '244900@s.whatsapp.net', wav, { titulo: 'seno' }).catch(e => ({ ok: false, motivo: e.message }));
  C('tocarBuffer converte para PCM 16k e envia', t.ok && played.length === 1 && Math.abs(played[0][1] - 32000) < 2000, JSON.stringify(t) + ' ' + JSON.stringify(played));
  C('duração ≈1s', t.dur === 1, t.dur);
  C('parar', voip.parar(sock, '244900@s.whatsapp.net') && stopped === 1);
  C('desligar', await voip.desligar(sock, '244900@s.whatsapp.net') && ended === 'c1' && !voip.activa('244900@s.whatsapp.net'));
  // limites anti-restrição
  const rl = await voip.ligar(sock, '244902@s.whatsapp.net');
  C('cooldown 2 min entre chamadas bloqueia', !rl.ok && /espera/.test(rl.motivo), JSON.stringify(rl));
  voip._resetLimites();
  // recusada
  const sock2 = { ...sock, calls: {}, startCall: async (jid) => { setTimeout(() => ev.emit('call', [{ id: 'c2', status: 'reject' }]), 50); return { callId: 'c2' }; } };
  const r2 = await voip.ligar(sock2, '244901@s.whatsapp.net');
  C('recusada → ok:false', !r2.ok && /atendeu|recusou/.test(r2.motivo), JSON.stringify(r2));
  voip._resetLimites();
  // grupo
  const r3 = await voip.ligar(sock, '1@g.us');
  C('grupo → callId sem esperar accept', r3.ok && r3.grupo && r3.callId === 'g1' && r3.participantCount === 2);
  await voip.desligar(sock, '1@g.us');
  voip._resetLimites();
  const startsAntes = groupStarts;
  sock.groupMetadata = async () => ({ participants: [
    { id: '1@s.whatsapp.net' }, ...Array.from({ length: 7 }, (_, i) => ({ id: `${i + 2}@lid` })),
  ] });
  const r4 = await voip.ligar(sock, 'muito@g.us');
  C('grupo com mais de 6 pessoas é bloqueado antes do offer', !r4.ok && /limite de 6 pessoas/.test(r4.motivo || '') && groupStarts === startsAntes, JSON.stringify(r4));
  // cases registados + brain
  const ch = require('../src/bot/caseHandler'); ch.init(); await new Promise(r => setTimeout(r, 1200));
  C("cases call/tocar/fala/pararmusica/desligar em chamadaVoz.js", ['call', 'ligar', 'tocar', 'fala', 'pararmusica', 'desligar'].every(k => ch.FILE_SOURCES.get(k)?.file === 'chamadaVoz.js'));
  const b = require('../src/aura/auraBrain');
  C('brain: "toca X na call" → call_tocar', b.detectarCapacidade('toca shakira na call')?.id === 'call_tocar');
  C('brain: "desliga a chamada" → call_desligar', b.detectarCapacidade('aura desliga a chamada')?.id === 'call_desligar');
  console.log(`\n${bad ? '💥' : '🎉'} CALL VOIP: ${ok} OK / ${bad} FALHOU`); process.exit(bad ? 1 : 0);
})();
