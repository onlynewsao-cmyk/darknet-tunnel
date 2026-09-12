'use strict';
/** v7.36 — áudio completo (sem truncar) + aviso "sem aluguel" sem spam */
const fs = require('fs');
let ok = 0, fail = 0;
const check = (n, c, x = '') => { if (c) { ok++; console.log('  ✅', n); } else { fail++; console.log('  ❌', n, x); } };

console.log('\n═══ VOZ ═══');
const voz = require('../src/aura/auraVoz');
const longo = 'Dark, ouve bem o que te vou dizer sobre isto. '.repeat(30); // ~1400 chars
const fala = voz.textoParaFalar(longo, {});
check('textoParaFalar não corta em 500', fala.length > 1200, 'len=' + fala.length);
const ai = require('../src/bot/ai');
check('splitForTts exportado', typeof ai.splitForTts === 'function' && typeof ai.speakGoogleTts === 'function');
const parts = ai.splitForTts('A. B! C? '.repeat(400), 900);
check('split respeita 900 e não perde texto', parts.every(p => p.length <= 900) && parts.join(' ').replace(/\s+/g, '').length === 'A. B! C? '.repeat(400).replace(/\s+/g, '').length, JSON.stringify(parts.map(p => p.length)));
check('split texto curto → 1 pedaço', ai.splitForTts('curto', 900).length === 1);
const src = fs.readFileSync('src/bot/commandHandler.js', 'utf8');
check('handler sem .slice(0, 500) no TTS', !/speakWithFallback\([a-zA-Z]+\.slice\(0, 500\)\)/.test(src));
check('handler sem tecto de 900 chars para voz', !/pediuAudio && finalAnswer\.length > 0 && finalAnswer\.length < 900/.test(src));
const aisrc = fs.readFileSync('src/bot/ai.js', 'utf8');
check('ElevenLabs timeout ≥ 60s', /timeout: 60000/.test(aisrc));

console.log('\n═══ AVISO SEM ALUGUEL ═══');
check('aviso só quando parece comando', /if \(prefixInfo \|\| pareceComando\(text\)\) await _avisoSemAluguel/.test(src));
check('cooldown por GRUPO (não por pessoa)', /const k = ctx\.remoteJid;\s*\n\s*const agora/.test(src));

(async () => {
  console.log('\n═══ gTTS real (tolerante) ═══');
  try { const b = await ai.speakGoogleTts('Teste de voz completo da Aura, frase um. Frase dois para juntar.'); check('gTTS devolve MP3', b.length > 5000 && b[0] === 0xFF, 'bytes=' + b.length); }
  catch (e) { console.log('  ⚠️ gTTS indisponível daqui:', e.message); }
  console.log(`\n${fail ? '💥' : '🎉'} AURA VOZ+SPAM: ${ok} OK / ${fail} FALHOU\n`);
  process.exit(fail ? 1 : 0);
})();
