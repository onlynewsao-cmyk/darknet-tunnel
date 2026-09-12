require('dotenv').config();
const aura = require('../src/aura/auraHuman');
const ai = require('../src/bot/ai');

async function test() {
  console.log('🔍 DIAGNÓSTICO COMPLETO DA AURA');
  console.log('='.repeat(60));

  // Test 1: Verificar se a IA responde
  console.log('\n🧠 Teste 1: Resposta da IA (Groq)');
  const r1 = await ai.chat('Oi, como você está?', 'Você é a Aura, uma jovem brasileira de 19 anos.', { userRole: 'owner' });
  console.log('  Resposta:', r1?.slice(0, 150) || 'SEM RESPOSTA');
  console.log('  Status:', r1 && !r1.startsWith('❌') ? '✅ FUNCIONA' : '❌ FALHA');

  // Test 2: Verificar AURA completa
  console.log('\n🌹 Teste 2: AURA completa');
  const r2 = await aura.auraRespond('Oi Aura', { isOwner: true, userName: 'Dark', senderNumber: '244945280380' });
  console.log('  Resposta:', r2?.slice(0, 150) || 'SEM RESPOSTA');

  // Test 3: Verificar diferentes tipos de usuário
  console.log('\n👤 Teste 3: Tipos de usuário');
  const tipos = [
    { isOwner: true, userRole: 'owner', nome: 'Dono' },
    { isVip: true, userRole: 'vip', nome: 'VIP' },
    { userRole: 'subdono', nome: 'Subdono' },
    { userRole: 'group_admin', nome: 'ADM' },
    { userRole: 'trial', nome: 'Trial' },
    { userRole: 'free', nome: 'Free' },
  ];

  for (const tipo of tipos) {
    const r = await aura.auraRespond('Oi', { ...tipo, userName: tipo.nome, senderNumber: '244912345678' });
    console.log(`  ${tipo.nome}: ${r?.slice(0, 80)}...`);
  }

  console.log('\n' + '='.repeat(60));
}

test().catch(console.error);
