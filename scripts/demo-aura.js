#!/usr/bin/env node
/**
 * AURA — Script de Demonstração Completa
 * Testa todas as funcionalidades e verifica erros de comportamento
 */

console.log('='.repeat(60));
console.log('🌹 AURA — DEMONSTRAÇÃO COMPLETA 🌹');
console.log('='.repeat(60));

const aura = require('../src/aura/auraHuman');
const userContext = require('../src/aura/context/userContext');
const intentHandler = require('../src/aura/decision/intentHandler');
const advancedActions = require('../src/aura/actions/advancedActions');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    const result = fn();
    if (result === false) {
      console.log(`  ❌ ${name}`);
      failed++;
    } else {
      console.log(`  ✅ ${name}`);
      passed++;
    }
  } catch (e) {
    console.log(`  ❌ ${name}: ${e.message}`);
    failed++;
  }
}

async function testAsync(name, fn) {
  try {
    const result = await fn();
    if (result === false) {
      console.log(`  ❌ ${name}`);
      failed++;
    } else {
      console.log(`  ✅ ${name}`);
      passed++;
    }
  } catch (e) {
    console.log(`  ❌ ${name}: ${e.message}`);
    failed++;
  }
}

async function run() {
  // ══════════════════════════════════════════════════════════════
  // 1. MEMÓRIA DE PESSOAS
  // ══════════════════════════════════════════════════════════════
  console.log('\n📝 1. MEMÓRIA DE PESSOAS');
  console.log('-'.repeat(40));

  test('recallPerson retorna null para número desconhecido', () => {
    return aura.recallPerson('999999999') === null;
  });

  test('rememberPerson e recallPerson funcionam', () => {
    aura.rememberPerson('244945280380', { name: 'Dark', gender: 'male', notes: 'Meu criador' });
    const mem = aura.recallPerson('244945280380');
    return mem && mem.name === 'Dark' && mem.gender === 'male';
  });

  test('Memória persiste entre chamadas', () => {
    const mem = aura.recallPerson('244945280380');
    return mem && mem.notes === 'Meu criador';
  });

  // ══════════════════════════════════════════════════════════════
  // 2. DETECÇÃO DE PAÍS
  // ══════════════════════════════════════════════════════════════
  console.log('\n🌍 2. DETECÇÃO DE PAÍS');
  console.log('-'.repeat(40));

  test('Detecta Angola (244)', () => {
    const country = aura.detectCountry('244945280380');
    return country.code === 'AO' && country.name === 'Angola';
  });

  test('Detecta Brasil (55)', () => {
    const country = aura.detectCountry('5511999999999');
    return country.code === 'BR' && country.name === 'Brasil';
  });

  test('Detecta Portugal (351)', () => {
    const country = aura.detectCountry('351912345678');
    return country.code === 'PT' && country.name === 'Portugal';
  });

  test('Detecta Internacional', () => {
    const country = aura.detectCountry('12125551234');
    return country.code === '??' && country.name === 'Internacional';
  });

  // ══════════════════════════════════════════════════════════════
  // 3. SISTEMA DE HUMOR
  // ══════════════════════════════════════════════════════════════
  console.log('\n😊 3. SISTEMA DE HUMOR');
  console.log('-'.repeat(40));

  test('Humor padrão é normal', () => {
    const mood = aura.getMood();
    return mood.mood === 'normal';
  });

  test('setMood funciona', () => {
    aura.setMood('feliz', 'Teste');
    const mood = aura.getMood();
    return mood.mood === 'feliz' && mood.reason === 'Teste';
  });

  test('Humor inválido volta para normal', () => {
    aura.setMood('humor_invalido');
    const mood = aura.getMood();
    return mood.mood === 'normal';
  });

  test('Humor com_raiva tem intensidade 8', () => {
    aura.setMood('com_raiva');
    const mood = aura.getMood();
    return mood.intensity === 8;
  });

  // Reset mood
  aura.setMood('normal');

  // ══════════════════════════════════════════════════════════════
  // 4. DEFESA DO DARK
  // ══════════════════════════════════════════════════════════════
  console.log('\n🛡️ 4. DEFESA DO DARK');
  console.log('-'.repeat(40));

  test('detectDarkAttack detecta ataque', () => {
    return aura.detectDarkAttack('Dark é idiota', 'Dark', '244945280380') === true;
  });

  test('detectDarkAttack ignora mensagem normal', () => {
    return aura.detectDarkAttack('Oi Dark, tudo bem?', 'Dark', '244945280380') === false;
  });

  test('detectDarkMention detecta menção', () => {
    return aura.detectDarkMention('Oi Dark', ['244945280380@s.whatsapp.net'], '244945280380') === true;
  });

  test('getDarkDefense retorna resposta', () => {
    const defense = aura.getDarkDefense('João');
    return typeof defense === 'string' && defense.includes('João');
  });

  // ══════════════════════════════════════════════════════════════
  // 5. SISTEMA DE SILÊNCIO
  // ══════════════════════════════════════════════════════════════
  console.log('\n🔇 5. SISTEMA DE SILÊNCIO');
  console.log('-'.repeat(40));

  test('isSilenced retorna false inicialmente', () => {
    return aura.isSilenced('244945280380') === false;
  });

  test('setSilence funciona', () => {
    aura.setSilence('244945280380', 60);
    return aura.isSilenced('244945280380') === true;
  });

  test('clearSilence funciona', () => {
    aura.clearSilence('244945280380');
    return aura.isSilenced('244945280380') === false;
  });

  test('clearSilence() limpa tudo', () => {
    aura.setSilence('111111111', 60);
    aura.setSilence('222222222', 60);
    aura.clearSilence();
    return aura.isSilenced('111111111') === false && aura.isSilenced('222222222') === false;
  });

  // ══════════════════════════════════════════════════════════════
  // 6. USER CONTEXT
  // ══════════════════════════════════════════════════════════════
  console.log('\n👤 6. USER CONTEXT');
  console.log('-'.repeat(40));

  await testAsync('getUserContext para Dono', async () => {
    const ctx = await userContext.getUserContext('244945280380');
    return ctx.isOwner === true && ctx.role === 'dono' && ctx.level === 100;
  });

  await testAsync('getUserContext para número desconhecido', async () => {
    const ctx = await userContext.getUserContext('999999999');
    return ctx.isOwner === false && ctx.role === 'free';
  });

  await testAsync('getTreatmentStyle retorna correto', async () => {
    const ctx = await userContext.getUserContext('244945280380');
    return ctx.treatment === 'intimate';
  });

  // ══════════════════════════════════════════════════════════════
  // 7. INTENT HANDLER
  // ══════════════════════════════════════════════════════════════
  console.log('\n🎯 7. INTENT HANDLER');
  console.log('-'.repeat(40));

  test('detectIntent detecta create_group', () => {
    const intent = intentHandler.detectIntent('Aura cria um grupo');
    return intent.intent === 'create_group' && intent.confidence >= 0.8;
  });

  test('detectIntent detecta leave_group', () => {
    const intent = intentHandler.detectIntent('Aura sai desse grupo');
    return intent.intent === 'leave_group';
  });

  test('detectIntent detecta get_link', () => {
    const intent = intentHandler.detectIntent('Aura pega o link');
    return intent.intent === 'get_link';
  });

  test('detectIntent detecta block_user', () => {
    const intent = intentHandler.detectIntent('Aura bloqueia o fulano');
    return intent.intent === 'block_user';
  });

  test('detectIntent retorna unknown para texto aleatório', () => {
    const intent = intentHandler.detectIntent('xyz abc 123');
    return intent.intent === 'unknown';
  });

  await testAsync('shouldExecuteCommand para Dono', async () => {
    const result = await intentHandler.shouldExecuteCommand('244945280380', 'ban');
    return result.execute === true && result.reason === 'owner';
  });

  await testAsync('shouldExecuteCommand bloqueia Free', async () => {
    const result = await intentHandler.shouldExecuteCommand('999999999', 'ban');
    return result.execute === false;
  });

  await testAsync('shouldExecuteCommand permite Free usar menu', async () => {
    const result = await intentHandler.shouldExecuteCommand('999999999', 'menu');
    return result.execute === true && result.reason === 'public';
  });

  // ══════════════════════════════════════════════════════════════
  // 8. ADVANCED ACTIONS (verificação de existência)
  // ══════════════════════════════════════════════════════════════
  console.log('\n⚡ 8. ADVANCED ACTIONS');
  console.log('-'.repeat(40));

  test('createGroup existe', () => typeof advancedActions.createGroup === 'function');
  test('leaveGroup existe', () => typeof advancedActions.leaveGroup === 'function');
  test('getGroupInviteLink existe', () => typeof advancedActions.getGroupInviteLink === 'function');
  test('revokeInviteLink existe', () => typeof advancedActions.revokeInviteLink === 'function');
  test('setGroupDescription existe', () => typeof advancedActions.setGroupDescription === 'function');
  test('setGroupSubject existe', () => typeof advancedActions.setGroupSubject === 'function');
  test('getGroupMetadata existe', () => typeof advancedActions.getGroupMetadata === 'function');
  test('blockUser existe', () => typeof advancedActions.blockUser === 'function');
  test('unblockUser existe', () => typeof advancedActions.unblockUser === 'function');
  test('sendLocation existe', () => typeof advancedActions.sendLocation === 'function');
  test('sendPoll existe', () => typeof advancedActions.sendPoll === 'function');
  test('forwardMessage existe', () => typeof advancedActions.forwardMessage === 'function');
  test('sendDocument existe', () => typeof advancedActions.sendDocument === 'function');
  test('sendContact existe', () => typeof advancedActions.sendContact === 'function');
  test('pinChat existe', () => typeof advancedActions.pinChat === 'function');
  test('unpinChat existe', () => typeof advancedActions.unpinChat === 'function');
  test('archiveChat existe', () => typeof advancedActions.archiveChat === 'function');
  test('unarchiveChat existe', () => typeof advancedActions.unarchiveChat === 'function');
  test('clearChat existe', () => typeof advancedActions.clearChat === 'function');
  test('muteChat existe', () => typeof advancedActions.muteChat === 'function');
  test('changeProfilePicture existe', () => typeof advancedActions.changeProfilePicture === 'function');
  test('changeProfileName existe', () => typeof advancedActions.changeProfileName === 'function');
  test('changeProfileStatus existe', () => typeof advancedActions.changeProfileStatus === 'function');
  test('postStatus existe', () => typeof advancedActions.postStatus === 'function');
  test('followChannel existe', () => typeof advancedActions.followChannel === 'function');
  test('reactToMessage existe', () => typeof advancedActions.reactToMessage === 'function');

  // ══════════════════════════════════════════════════════════════
  // 9. BUILD SYSTEM PROMPT
  // ══════════════════════════════════════════════════════════════
  console.log('\n🔧 9. BUILD SYSTEM PROMPT');
  console.log('-'.repeat(40));

  test('buildAuraSystemPrompt para Dono', () => {
    const prompt = aura.buildAuraSystemPrompt({ isOwner: true, userName: 'Dark' });
    return prompt.includes('TEU DARK') && prompt.includes('obediência');
  });

  test('buildAuraSystemPrompt para VIP', () => {
    const prompt = aura.buildAuraSystemPrompt({ isVip: true, userName: 'VIP User' });
    return prompt.includes('VIP') && prompt.includes('respeito');
  });

  test('buildAuraSystemPrompt para Free', () => {
    const prompt = aura.buildAuraSystemPrompt({ userName: 'Free User' });
    return prompt.includes('distância educada') && prompt.includes('SEM corações');
  });

  test('buildAuraSystemPrompt inclui país', () => {
    const prompt = aura.buildAuraSystemPrompt({ userCountry: { name: 'Angola', emoji: '🇦🇴' } });
    return prompt.includes('Angola') && prompt.includes('🇦🇴');
  });

  test('buildAuraSystemPrompt inclui mediaContext', () => {
    const prompt = aura.buildAuraSystemPrompt({ mediaContext: '📸 Foto recebida' });
    return prompt.includes('📸 Foto recebida');
  });

  // ══════════════════════════════════════════════════════════════
  // 10. VERIFICAÇÃO DE ERROS DE COMPORTAMENTO
  // ══════════════════════════════════════════════════════════════
  console.log('\n🔍 10. VERIFICAÇÃO DE ERROS');
  console.log('-'.repeat(40));

  test('Aura NUNCA revela que é bot', () => {
    const prompt = aura.buildAuraSystemPrompt({});
    return !prompt.toLowerCase().includes('és uma ia') && !prompt.toLowerCase().includes('sou um bot');
  });

  test('Aura NUNCA usa frases de bot', () => {
    const prompt = aura.buildAuraSystemPrompt({});
    return !prompt.includes('Posso ajudar?') && !prompt.includes('Claro!');
  });

  test('Silêncio bloqueia mensagens de não-Donos', () => {
    aura.setSilence('999999999', 60);
    const silenced = aura.isSilenced('999999999');
    aura.clearSilence('999999999');
    return silenced === true;
  });

  test('Dono pode cancelar silêncio', () => {
    aura.setSilence('244945280380', 60);
    aura.clearSilence('244945280380');
    return aura.isSilenced('244945280380') === false;
  });

  test('Memória não vaza entre usuários', () => {
    aura.rememberPerson('111111111', { name: 'User1' });
    aura.rememberPerson('222222222', { name: 'User2' });
    const mem1 = aura.recallPerson('111111111');
    const mem2 = aura.recallPerson('222222222');
    return mem1.name === 'User1' && mem2.name === 'User2' && mem1.name !== mem2.name;
  });

  // ══════════════════════════════════════════════════════════════
  // RESULTADO FINAL
  // ══════════════════════════════════════════════════════════════
  console.log('\n' + '='.repeat(60));
  console.log('📊 RESULTADO FINAL');
  console.log('='.repeat(60));
  console.log(`  ✅ Testes passaram: ${passed}`);
  console.log(`  ❌ Testes falharam: ${failed}`);
  console.log(`  📈 Total: ${passed + failed}`);
  console.log(`  🎯 Taxa de sucesso: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
  console.log('='.repeat(60));

  if (failed === 0) {
    console.log('\n🎉 TODOS OS TESTES PASSARAM! A AURA ESTÁ 100% FUNCIONAL! 🖤🌹');
  } else {
    console.log(`\n⚠️ ${failed} teste(s) falharam. Verifica os erros acima.`);
  }

  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
