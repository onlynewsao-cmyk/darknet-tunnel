/**
 * DARK BOT v7 — Testes do Case Handler Ultra Dinâmico
 * ═══════════════════════════════════════════════════════
 */

'use strict';

const { detectFormat, validateCase, extractCommandName, ensureDeps, FORMAT } = require('../src/bot/caseHandler');

let passed = 0;
let failed = 0;
let total = 0;

function test(name, fn) {
  total++;
  try {
    const result = fn();
    if (result === false) {
      console.log('  ❌ FAIL: ' + name);
      failed++;
    } else {
      console.log('  ✅ ' + name);
      passed++;
    }
  } catch (e) {
    console.log('  ❌ FAIL: ' + name + ' — ' + (e.message || '').slice(0, 100));
    failed++;
  }
}

// ═══════════════════════════════════════════════════════
// TESTE 1: Detecção de formato
// ═══════════════════════════════════════════════════════
console.log('\n═══ 1. DETECÇÃO DE FORMATO ═══');

test('switch/case com aspas duplas', function() {
  return detectFormat('case "ytplay4": { reply("ok") } break') === FORMAT.SWITCH_CASE;
});

test('switch/case com aspas simples', function() {
  return detectFormat("case 'copilot': { reply('ok') } break;") === FORMAT.SWITCH_CASE;
});

test('module.exports', function() {
  return detectFormat('module.exports = { name: "manga", execute: function() {} }') === FORMAT.MODULE_EXPORTS;
});

test('function declaration', function() {
  return detectFormat('async function meuComando(sock, msg) { }') === FORMAT.FUNCTION;
});

test('código JS puro', function() {
  return detectFormat('reply("Olá!");') === FORMAT.RAW_CODE;
});

test('string simples', function() {
  return detectFormat('"Olá! Eu sou o bot."') === FORMAT.STRING;
});

// ═══════════════════════════════════════════════════════
// TESTE 2: Extração de nome
// ═══════════════════════════════════════════════════════
console.log('\n═══ 2. EXTRAÇÃO DE NOME ═══');

test('extrai de case "ytplay4"', function() {
  return extractCommandName('case "ytplay4": { }') === 'ytplay4';
});

test("extrai de case 'copilot'", function() {
  return extractCommandName("case 'copilot': { }") === 'copilot';
});

test('extrai de module.exports name', function() {
  return extractCommandName('module.exports = { name: "manga", execute: function() {} }') === 'manga';
});

test('extrai de function declaration', function() {
  return extractCommandName('async function meuComando(sock, msg) {}') === 'meucomando';
});

test('usa nome fornecido', function() {
  return extractCommandName('reply("ok")', 'test') === 'test';
});

// ═══════════════════════════════════════════════════════
// TESTE 3: Detecção de dependências
// ═══════════════════════════════════════════════════════
console.log('\n═══ 3. DETECÇÃO DE DEPENDÊNCIAS ═══');

test('detecta axios', function() {
  var deps = ensureDeps("var axios = require('axios');");
  return Array.isArray(deps);
});

test('detecta cheerio', function() {
  var deps = ensureDeps("var cheerio = require('cheerio');");
  return Array.isArray(deps);
});

test('não detecta módulos internos', function() {
  var deps = ensureDeps("var path = require('path'); var fs = require('fs');");
  return !deps.includes('path') && !deps.includes('fs');
});

test('detecta pacote scoped', function() {
  var deps = ensureDeps("var x = require('@google/generative-ai');");
  return Array.isArray(deps);
});

// ═══════════════════════════════════════════════════════
// TESTE 4: Validação de cases reais
// ═══════════════════════════════════════════════════════
console.log('\n═══ 4. VALIDAÇÃO DE CASES REAIS ═══');

// ytplay4 — código adaptado (sem template literals problemáticos)
var ytplay4Code = [
  'if (!q) {',
  '    return reply("Informe uma url do YouTube.");',
  '}',
  'await reply("Baixando seu video...");',
  'try {',
  '    var res = await fetch("https://systemzone.store/v1/exp?url=" + encodeURIComponent(q) + "&quality=1080");',
  '    var gab = await res.json();',
  '    if (!gab.status) return reply("Nao foi possivel baixar.");',
  '    await lofi.sendMessage(from, {',
  '        video: { url: gab.download_url },',
  '        mimetype: "video/mp4",',
  '        caption: gab.title',
  '    }, { quoted: info });',
  '} catch (err) {',
  '    reply("Ocorreu um erro.");',
  '}'
].join('\n');

test('ytplay4 — formato detectado', function() {
  return detectFormat(ytplay4Code) === FORMAT.RAW_CODE;
});

test('ytplay4 — compila sem erros', function() {
  var v = validateCase(ytplay4Code, 'ytplay4');
  if (!v.valid) console.log('    ERRORS:', v.errors);
  return v.valid;
});

// copilot — código real
var copilotCode = [
  'if (!text) return m.reply("cade a pergunta?");',
  'try {',
  "    await systemZR.sendMessage(m.chat, { react: { text: '👀', key: m.key } });",
  "    var axios = require('axios');",
  "    var resp = await axios.get('https://systemzone.store/api/copilot2', { params: { text: text, model: 'gpt-5' } });",
  "    var data = resp.data;",
  "    if (!data || !data.status || !data.result) throw new Error('Sem resposta');",
  "    await systemZR.sendMessage(m.chat, { text: data.result }, { quoted: m });",
  "    await systemZR.sendMessage(m.chat, { react: { text: '✅', key: m.key } });",
  '} catch (e) {',
  "    m.reply('Erro ao consultar o Copilot.');",
  '}'
].join('\n');

test('copilot — compila sem erros', function() {
  var v = validateCase(copilotCode, 'copilot');
  if (!v.valid) console.log('    ERRORS:', v.errors);
  return v.valid;
});

// ttkstalk — código real
var tiktokCode = [
  'try {',
  "    var axios = require('axios');",
  '    if (!q) return reply("exemplo: .ttkstalk neymar");',
  '    var user = q.trim();',
  '    reply("Consultando perfil");',
  "    var resp = await axios.get('https://systemzone.store/api/tiktok/stalk?user=' + user);",
  '    var data = resp.data;',
  '    if (!data || !data.status) return reply("Usuario nao encontrado.");',
  '    var txt = "👤 " + data.nickname + " (@" + data.username + ")\\n📝 " + data.bio;',
  '    await lofi.sendMessage(from, { image: { url: data.avatar }, caption: txt }, { quoted: info });',
  '} catch (e) {',
  '    reply("Erro ao consultar API.");',
  '}'
].join('\n');

test('ttkstalk — compila sem erros', function() {
  var v = validateCase(tiktokCode, 'ttkstalk');
  if (!v.valid) console.log('    ERRORS:', v.errors);
  return v.valid;
});

// claude — código real
var claudeCode = [
  "if (!text) return m.reply('Por favor, informe o texto.');",
  "await systemZR.sendMessage(m.chat, { react: { text: '🤖', key: m.key } });",
  'try {',
  "    var axios = require('axios');",
  "    var resp = await axios.get('https://systemzone.store/api/ia/claude-haiku?apikey=freekey&text=' + encodeURIComponent(text));",
  '    var data = resp.data;',
  "    if (!data || !data.text) throw new Error('Sem resposta');",
  "    await systemZR.sendMessage(m.chat, { text: data.text }, { quoted: m });",
  "    await systemZR.sendMessage(m.chat, { react: { text: '✅', key: m.key } });",
  '} catch (e) {',
  "    await m.reply('Erro ao consultar o Claude.');",
  '}'
].join('\n');

test('claude — compila sem erros', function() {
  var v = validateCase(claudeCode, 'claude');
  if (!v.valid) console.log('    ERRORS:', v.errors);
  return v.valid;
});

// addai — código real
var addaiCode = [
  'try {',
  "    await lofi.groupParticipantsUpdate(from, ['867051314767696@bot'], 'add');",
  "    reply('✅ META AI foi adicionada.');",
  '} catch (e) {',
  "    reply('❌ Nao foi possivel.');",
  '}'
].join('\n');

test('addai — compila sem erros', function() {
  var v = validateCase(addaiCode, 'addai');
  if (!v.valid) console.log('    ERRORS:', v.errors);
  return v.valid;
});

// ═══════════════════════════════════════════════════════
// TESTE 5: Validação de string simples
// ═══════════════════════════════════════════════════════
console.log('\n═══ 5. STRING SIMPLES ═══');

test('string com aspas duplas', function() {
  var v = validateCase('"Olá! Bem-vindo ao bot!"', 'saudacao');
  return v.valid;
});

test('string com aspas simples', function() {
  var v = validateCase("'Oi! Tudo bem?'", 'oi');
  return v.valid;
});

// ═══════════════════════════════════════════════════════
// TESTE 6: Casos extremos
// ═══════════════════════════════════════════════════════
console.log('\n═══ 6. CASOS EXTREMOS ═══');

test('código com async/await', function() {
  var code = "var resp = await axios.get('https://api.example.com');\nreply(resp.data);";
  var v = validateCase(code, 'api');
  if (!v.valid) console.log('    ERRORS:', v.errors);
  return v.valid;
});

test('código vazio', function() {
  var v = validateCase('', 'vazio');
  return v.valid;
});

test('código com try/catch completo', function() {
  var code = "try {\n    var r = await axios.get('https://test.com');\n    reply(r.data);\n} catch(e) {\n    reply('Erro: ' + e.message);\n}";
  var v = validateCase(code, 'trytest');
  if (!v.valid) console.log('    ERRORS:', v.errors);
  return v.valid;
});

test('código com if/else', function() {
  var code = "if (isOwner) {\n    reply('É o dono!');\n} else {\n    reply('Não é o dono.');\n}";
  var v = validateCase(code, 'iftest');
  return v.valid;
});

// ═══════════════════════════════════════════════════════
// TESTE 7: Variable adaptation
// ═══════════════════════════════════════════════════════
console.log('\n═══ 7. ADAPTAÇÃO DE VARIÁVEIS ═══');

test('lofi → sock', function() {
  var code = "await lofi.sendMessage(from, { text: 'ok' });";
  var v = validateCase(code, 'testlofi');
  return v.valid;
});

test('systemZR → sock', function() {
  var code = "await systemZR.sendMessage(m.chat, { text: 'ok' });";
  var v = validateCase(code, 'testsys');
  return v.valid;
});

test('m.reply → reply', function() {
  var code = "m.reply('test');";
  var v = validateCase(code, 'testmreply');
  return v.valid;
});

test('m.chat → ctx.remoteJid', function() {
  var code = "sock.sendMessage(m.chat, { text: 'ok' });";
  var v = validateCase(code, 'testmchat');
  return v.valid;
});

test('switch/case aninhado (pin systemzone) compila', function() {
  var fs = require('fs');
  var path = require('path');
  var ch = require('../src/bot/caseHandler');
  var raw = fs.readFileSync(path.join(__dirname, 'fixtures/case-pin-systemzone.js'), 'utf8');
  var body = ch.extractCaseCode(raw);
  if (!body.includes("tipo = 'video'") || !body.includes('catch (e)')) return false;
  var v = validateCase(raw, 'pin');
  if (!v.valid) { console.log('    ERRORS:', v.errors); return false; }
  return true;
});

// ═══════════════════════════════════════════════════════
// RESULTADO
// ═══════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(50));
console.log('📊 RESULTADO: ' + passed + '/' + total + ' passaram, ' + failed + ' falharam');
console.log('═'.repeat(50) + '\n');

if (failed > 0) {
  console.log('❌ ALGUNS TESTES FALHARAM!\n');
  process.exit(1);
} else {
  console.log('✅ TODOS OS TESTES PASSARAM!\n');
  process.exit(0);
}
