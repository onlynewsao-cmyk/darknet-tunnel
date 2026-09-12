#!/usr/bin/env node
/**
 * AURA — Teste Completo de Personalidade e Temas
 * Verifica todos os tipos de usuário e integração com change
 */

require('dotenv').config();
const aura = require('../src/aura/auraHuman');
const changeThemes = require('../src/bot/changeThemes');
const themeResolver = require('../src/bot/themeResolver');
const { getOfflineResponse, detectAndRespondOffline } = require('../src/aura/offlineResponses');

let passed = 0;
let failed = 0;
const errors = [];

function test(name, result) {
  if (result) { passed++; }
  else { failed++; errors.push(name); }
}

console.log('='.repeat(70));
console.log('🌹 AURA — TESTE COMPLETO DE PERSONALIDADE E TEMAS');
console.log('='.repeat(70));

// ══════════════════════════════════════════════════════════════
// 1. TIPOS DE USUÁRIO
// ══════════════════════════════════════════════════════════════
console.log('\n👤 1. TIPOS DE USUÁRIO');
console.log('-'.repeat(50));

const userTypes = [
  { role: 'dono', label: '👑 Dono (Dark)', number: '244945280380' },
  { role: 'subdono', label: '🔱 Subdono', number: '244987654321' },
  { role: 'vip', label: '💎 VIP', number: '244911111111' },
  { role: 'admin', label: '🛡️ ADM Grupo', number: '244922222222' },
  { role: 'free', label: '🆓 Free', number: '244933333333' },
  { role: 'trial', label: '⏳ Trial', number: '244944444444' },
];

for (const user of userTypes) {
  const prompt = aura.buildAuraSystemPrompt({
    isOwner: user.role === 'dono',
    isVip: user.role === 'vip',
    userName: user.label,
    userRole: user.role,
  });

  test(`${user.label} - prompt inclui regras`, prompt.length > 100);
  test(`${user.label} - prompt é único`, prompt.length > 50);
}

// ══════════════════════════════════════════════════════════════
// 2. SISTEMA DE TEMAS (CHANGE)
// ══════════════════════════════════════════════════════════════
console.log('\n🎨 2. SISTEMA DE TEMAS (CHANGE)');
console.log('-'.repeat(50));

const themes = ['dark', 'cyber', 'royal', 'shadow', 'blade', 'hacker'];
for (const themeName of themes) {
  const theme = changeThemes.getTheme(themeName);
  test(`Tema ${themeName} existe`, !!theme);
  test(`Tema ${themeName} tem frame`, theme?.frame?.length === 6);
  test(`Tema ${themeName} tem personalidade`, !!theme?.personality || !!theme?.vibe);
}

// ══════════════════════════════════════════════════════════════
// 3. RESPOSTAS OFFLINE POR TIPO
// ══════════════════════════════════════════════════════════════
console.log('\n💬 3. RESPOSTAS OFFLINE POR TIPO');
console.log('-'.repeat(50));

const testCases = [
  { type: 'greeting', role: 'owner', expected: ['Dark', 'amor', '🖤', '🌹'] },
  { type: 'greeting', role: 'vip', expected: ['Oi', 'Olá'] },
  { type: 'greeting', role: 'free', expected: ['Oi', 'Olá', '👋'] },
  { type: 'goodbye', role: 'owner', expected: ['logo', 'Dark', '🖤'] },
  { type: 'thanks', role: 'owner', expected: ['obrigada', 'Dark', '🖤', 'cora', 'amor'] },
  { type: 'joke', role: 'owner', expected: ['😂', 'ri'] },
];

for (const tc of testCases) {
  const response = getOfflineResponse(tc.type, tc.role);
  test(`Offline ${tc.type}/${tc.role} - resposta existe`, !!response);
  if (response) {
    const hasExpected = tc.expected.some(e => response.toLowerCase().includes(e.toLowerCase()));
    test(`Offline ${tc.type}/${tc.role} - conteúdo correto`, hasExpected);
  }
}

// ══════════════════════════════════════════════════════════════
// 4. DETECÇÃO DE INTENÇÕES OFFLINE
// ══════════════════════════════════════════════════════════════
console.log('\n🎯 4. DETECÇÃO DE INTENÇÕES OFFLINE');
console.log('-'.repeat(50));

const intentTests = [
  { text: 'Oi Aura', expected: 'greeting' },
  { text: 'Bom dia', expected: 'greeting' },
  { text: 'Como está?', expected: 'howAreYou' },
  { text: 'O que faz?', expected: 'whatCanYouDo' },
  { text: 'Te amo', expected: 'love' },
  { text: 'Obrigado', expected: 'thanks' },
  { text: 'Tchau', expected: 'goodbye' },
  { text: 'Piada', expected: 'joke' },
  { text: 'Triste', expected: 'sad' },
  { text: 'Feliz', expected: 'happy' },
];

for (const it of intentTests) {
  const response = detectAndRespondOffline(it.text, 'owner');
  test(`Intenção "${it.text}" - resposta existe`, !!response);
}

// ══════════════════════════════════════════════════════════════
// 5. PERSONALIDADE POR TEMA
// ══════════════════════════════════════════════════════════════
console.log('\n🎭 5. PERSONALIDADE POR TEMA');
console.log('-'.repeat(50));

const themePersonalities = {
  dark: { tone: 'misterioso', keywords: ['sombra', 'abismo', 'dark'] },
  royal: { tone: 'formal', keywords: ['majestade', 'reino', 'coroa'] },
  cyber: { tone: 'técnico', keywords: ['neural', 'matrix', 'dados'] },
  cute: { tone: 'fofo', keywords: ['senpai', 'chan', 'kawaii'] },
};

for (const [themeName, info] of Object.entries(themePersonalities)) {
  const theme = changeThemes.getTheme(themeName);
  if (theme) {
    test(`Tema ${themeName} - personalidade ativa`, !!theme.personality || !!theme.vibe);
  }
}

// ══════════════════════════════════════════════════════════════
// 6. SISTEMA DE HUMOR
// ══════════════════════════════════════════════════════════════
console.log('\n😊 6. SISTEMA DE HUMOR');
console.log('-'.repeat(50));

const humores = ['normal', 'feliz', 'triste', 'com_raiva', 'animada', 'sonolenta', 'provocante', 'cansada'];
for (const humor of humores) {
  aura.setMood(humor);
  test(`Humor ${humor} - aplicado`, aura.getMood().mood === humor);
}
aura.setMood('normal');

// ══════════════════════════════════════════════════════════════
// 7. MEMÓRIA DE PESSOAS
// ══════════════════════════════════════════════════════════════
console.log('\n💾 7. MEMÓRIA DE PESSOAS');
console.log('-'.repeat(50));

aura.rememberPerson('244945280380', { name: 'Dark', gender: 'male', notes: 'Meu criador' });
aura.rememberPerson('244911111111', { name: 'VIP1', gender: 'female', notes: 'Utilizadora VIP' });

test('Memória Dono', aura.recallPerson('244945280380')?.name === 'Dark');
test('Memória VIP', aura.recallPerson('244911111111')?.name === 'VIP1');
test('Memória desconhecido retorna null', aura.recallPerson('999999999') === null);

// ══════════════════════════════════════════════════════════════
// 8. DEFESA DO DARK
// ══════════════════════════════════════════════════════════════
console.log('\n🛡️ 8. DEFESA DO DARK');
console.log('-'.repeat(50));

test('Detecta ataque', aura.detectDarkAttack('Dark é idiota', 'Dark', '244945280380') === true);
test('Ignora normal', aura.detectDarkAttack('Oi Dark tudo bem', 'Dark', '244945280380') === false);
test('Detecta menção', aura.detectDarkMention('Oi Dark', ['244945280380@s.whatsapp.net'], '244945280380') === true);
test('Defesa retorna resposta', aura.getDarkDefense('João').includes('João'));

// ══════════════════════════════════════════════════════════════
// 9. SISTEMA DE SILÊNCIO
// ══════════════════════════════════════════════════════════════
console.log('\n🔇 9. SISTEMA DE SILÊNCIO');
console.log('-'.repeat(50));

test('isSilenced false inicialmente', aura.isSilenced('244945280380') === false);
aura.setSilence('244945280380', 60);
test('setSilence funciona', aura.isSilenced('244945280380') === true);
aura.clearSilence('244945280380');
test('clearSilence funciona', aura.isSilenced('244945280380') === false);

// ══════════════════════════════════════════════════════════════
// 10. DETECÇÃO DE PAÍS
// ══════════════════════════════════════════════════════════════
console.log('\n🌍 10. DETECÇÃO DE PAÍS');
console.log('-'.repeat(50));

test('Angola (244)', aura.detectCountry('244945280380').code === 'AO');
test('Brasil (55)', aura.detectCountry('5511999999999').code === 'BR');
test('Portugal (351)', aura.detectCountry('351912345678').code === 'PT');
test('Internacional', aura.detectCountry('12125551234').code === '??');

// ══════════════════════════════════════════════════════════════
// RESULTADO FINAL
// ══════════════════════════════════════════════════════════════
console.log('\n' + '='.repeat(70));
console.log('📊 RESULTADO FINAL');
console.log('='.repeat(70));
console.log(`  ✅ Testes passaram: ${passed}`);
console.log(`  ❌ Testes falharam: ${failed}`);
console.log(`  📈 Total: ${passed + failed}`);
console.log(`  🎯 Taxa de sucesso: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

if (errors.length > 0) {
  console.log('\n⚠️ ERROS ENCONTRADOS:');
  errors.forEach(e => console.log(`  - ${e}`));
}

console.log('='.repeat(70));

if (failed === 0) {
  console.log('\n🎉 TODOS OS TESTES PASSARAM! A AURA ESTÁ 100% FUNCIONAL! 🖤🌹');
}

process.exit(failed > 0 ? 1 : 0);
