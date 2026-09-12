require('dotenv').config();
const ai = require('../src/bot/ai');

async function test() {
  console.log('🔍 TESTE DO ARSENAL COMPLETO DE IA');
  console.log('='.repeat(60));

  const systemPrompt = 'Você é a Aura, uma jovem brasileira de 19 anos, fã de anime.';
  const messages = [{ role: 'user', content: 'Oi, como você está?' }];

  // Testar o cascade completo
  console.log('\n🧠 Testando cascade de IA...');
  const startTime = Date.now();
  const response = await ai.chat('Oi, como você está?', systemPrompt, { userRole: 'owner' }, true);
  const elapsed = Date.now() - startTime;
  
  console.log('\n📤 Resposta recebida:');
  console.log('  ' + response?.slice(0, 200));
  console.log('\n⏱️ Tempo:', elapsed, 'ms');
  console.log('  Status:', response && !response.startsWith('❌') ? '✅ FUNCIONA' : '❌ FALHA');

  // Testar cada provider individualmente
  console.log('\n\n📋 TESTE INDIVIDUAL:');
  
  // Groq
  console.log('\n1. Groq:');
  try {
    const r = await ai.chatGroq(messages, systemPrompt);
    console.log('  ✅', r?.slice(0, 50));
  } catch (e) { console.log('  ❌', e.message); }

  // Gemini
  console.log('\n2. Gemini:');
  try {
    const r = await ai.chatGemini(messages, systemPrompt);
    console.log('  ✅', r?.slice(0, 50));
  } catch (e) { console.log('  ❌', e.message); }

  // Cerebras
  console.log('\n3. Cerebras:');
  try {
    const r = await ai.chatCerebras(messages, systemPrompt);
    console.log('  ✅', r?.slice(0, 50));
  } catch (e) { console.log('  ❌', e.message); }

  // Hugging Face
  console.log('\n4. Hugging Face:');
  try {
    const r = await ai.chatHuggingFace(messages, systemPrompt);
    console.log('  ✅', r?.slice(0, 50));
  } catch (e) { console.log('  ❌', e.message); }

  // ApiFreeLLM
  console.log('\n5. ApiFreeLLM:');
  try {
    const r = await ai.chatApiFreeLLM(messages, systemPrompt);
    console.log('  ✅', r?.slice(0, 50));
  } catch (e) { console.log('  ❌', e.message); }

  console.log('\n' + '='.repeat(60));
}

test().catch(console.error);
