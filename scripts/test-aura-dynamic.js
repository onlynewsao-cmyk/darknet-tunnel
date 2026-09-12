require('dotenv').config();
const aura = require('../src/aura/auraHuman');

async function test() {
  console.log('🌹 TESTE DE RESPOSTAS DINÂMICAS DA AURA');
  console.log('='.repeat(60));

  // Testar múltiplas vezes para ver variação
  console.log('\n👑 Respostas para o DONO (5x cada):');
  
  const tests = [
    { text: 'Oi Aura', ctx: { isOwner: true, userName: 'Dark', senderNumber: '244945280380' } },
    { text: 'Como você está?', ctx: { isOwner: true, userName: 'Dark', senderNumber: '244945280380' } },
    { text: 'Te amo', ctx: { isOwner: true, userName: 'Dark', senderNumber: '244945280380' } },
    { text: 'Conta uma piada', ctx: { isOwner: true, userName: 'Dark', senderNumber: '244945280380' } },
    { text: 'Tchau', ctx: { isOwner: true, userName: 'Dark', senderNumber: '244945280380' } },
  ];

  for (const t of tests) {
    console.log(`\n  📝 "${t.text}"`);
    const responses = new Set();
    for (let i = 0; i < 5; i++) {
      const r = await aura.auraRespond(t.text, t.ctx);
      responses.add(r);
      console.log(`     ${i + 1}. ${r?.slice(0, 60)}...`);
    }
    console.log(`  📊 Variação: ${responses.size} respostas diferentes`);
  }

  // Testar respostas para Free
  console.log('\n\n👤 Respostas para FREE:');
  const freeTests = ['Oi', 'Tchau', 'O que faz?'];
  for (const text of freeTests) {
    const responses = new Set();
    for (let i = 0; i < 3; i++) {
      const r = await aura.auraRespond(text, { userName: 'Fulano', senderNumber: '999999999' });
      responses.add(r);
    }
    console.log(`  📝 "${text}": ${responses.size} variações`);
  }

  // Testar funções proativas
  console.log('\n\n🚀 Funções proativas:');
  const mockSock = { sendMessage: async (jid, msg) => console.log(`  📤 ${msg.text?.slice(0, 50)}...`) };
  
  console.log('\n  🌅 Bom dia:');
  await aura.auraProactive(mockSock, '244945280380@s.whatsapp.net', 'morning');
  
  console.log('\n  💭 Pensamento:');
  await aura.auraThinkOutLoud(mockSock, '244945280380@s.whatsapp.net');
  
  console.log('\n  🎵 Cantar:');
  await aura.auraSingSong(mockSock, '244945280380@s.whatsapp.net');
  
  console.log('\n  🧠 Fato:');
  await aura.auraFunFact(mockSock, '244945280380@s.whatsapp.net');

  console.log('\n' + '='.repeat(60));
  console.log('✅ TESTE COMPLETO');
}

test().catch(console.error);
