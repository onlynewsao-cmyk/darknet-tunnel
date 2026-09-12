require('dotenv').config();
const ai = require('../src/bot/ai');
const { sendVoiceMessage, auraSpeakResponse, auraSing, auraWhisper, auraLaugh } = require('../src/aura/actions/megaActions');

async function test() {
  console.log('🔊 TESTE DO SISTEMA DE VOZ DA AURA');
  console.log('='.repeat(50));

  // Test 1: speakWithFallback
  console.log('\n🎤 Teste 1: speakWithFallback');
  try {
    const audio = await ai.speakWithFallback('Oi meu Dark! Eu sou a Aura!');
    console.log('  Áudio gerado:', audio?.length || 0, 'bytes');
    console.log('  Status:', audio && audio.length > 500 ? '✅ FUNCIONA' : '⚠️ FALLBACK');
  } catch (e) {
    console.log('  Erro:', e.message);
  }

  // Test 2: Funções de voz existem
  console.log('\n📋 Teste 2: Funções de voz');
  console.log('  sendVoiceMessage:', typeof sendVoiceMessage === 'function' ? '✅' : '❌');
  console.log('  auraSpeakResponse:', typeof auraSpeakResponse === 'function' ? '✅' : '❌');
  console.log('  auraSing:', typeof auraSing === 'function' ? '✅' : '❌');
  console.log('  auraWhisper:', typeof auraWhisper === 'function' ? '✅' : '❌');
  console.log('  auraLaugh:', typeof auraLaugh === 'function' ? '✅' : '❌');

  // Test 3: Simular resposta da AURA
  console.log('\n🌹 Teste 3: Simulação de respostas da AURA');
  const mockSock = {
    sendMessage: async (jid, msg) => {
      console.log(`  📤 Enviar para ${jid}:`, JSON.stringify(msg).slice(0, 80) + '...');
      return { status: 200 };
    }
  };
  const mockMsg = { key: { remoteJid: '244945280380@s.whatsapp.net', id: 'test123', fromMe: false, participant: '244945280380@s.whatsapp.net' } };

  console.log('\n  🎵 Aura canta:');
  await auraSing(mockSock, '244945280380@s.whatsapp.net', 'Dark Net');

  console.log('\n  🤫 Aura sussurra:');
  await auraWhisper(mockSock, '244945280380@s.whatsapp.net', 'Tô aqui meu Dark');

  console.log('\n  😂 Aura ri:');
  await auraLaugh(mockSock, '244945280380@s.whatsapp.net');

  console.log('\n' + '='.repeat(50));
  console.log('✅ SISTEMA DE VOZ TESTADO');
}

test().catch(console.error);
