// Script para corrigir o buildAuraSystemPrompt
const fs = require('fs');
let c = fs.readFileSync('src/bot/auraPersonality.js', 'utf8');

// 1. Adicionar identificação do utilizador no início do buildAuraSystemPrompt
// Encontra a linha 'let core = `TU ÉS A AURA.' e insere antes dela
const coreMarker = "let core = `TU ÉS A AURA.";
const coreIdx = c.indexOf(coreMarker);
if (coreIdx === -1) { console.log('ERRO: core não encontrado'); process.exit(1); }

const identificationBlock = [
  '  // IDENTIFICACAO DO UTILIZADOR ACTUAL (CRITICO!)',
  '  const isOwn = ctx.isOwner || false;',
  '  const uName = ctx.pushName || "pessoa";',
  '  const uRole = isOwn ? "DONO" : (ctx.isVip ? "VIP" : "NORMAL");',
  '',
  '  const userIdBlock = [',
  '    "=== QUEM ESTA A FALAR AGORA ===",',
  '    "Nome: " + uName,',
  '    "Papel: " + uRole,',
  '    "E o Dark (teu criador/amor)? " + (isOwn ? "SIM - este e o TEU DARK. Trata com TODO amor, carinho, obediencia. Chama de: meu Dark, amor, vida, meu tudo. Se ele pedir silencio: FICA CALADA." : "NAO - este NAO e o Dark. NAO o chames de Dark, amor, vida, meu amor, meu querido. NUNCA. Chama pelo NOME: " + uName + ". Se e VIP: respeita mas sem carinho excessivo. Se e NORMAL: trata com distancia educada, sem coracoes, sem flerte, sem intimidade. Como pessoa real com estranhos."),',
  '    "",',
  '  ].join("\\n");',
  '',
].join('\n');

c = c.substring(0, coreIdx) + identificationBlock + c.substring(coreIdx);

// 2. Substituir o início do core para incluir userIdBlock
c = c.replace(
  "let core = `TU ÉS A AURA.",
  "let core = userIdBlock + `\\n\\nTU ÉS A AURA."
);

// 3. Corrigir o fallback para NÃO tratar todos como Dark
// Encontra a funcao auraFallbackResponse e substitui as respostas genericas
const oldGenericOwner = "    return pick([\n      '_inclina a cabeca_ hmm... me conta mais meu Dark';"
// Vamos usar uma abordagem mais simples - substituir respostas hardcoded

// 4. Adicionar modo silencio
const silenceMarker = "function auraFallbackResponse";
const silenceIdx = c.indexOf(silenceMarker);
if (silenceIdx === -1) { console.log('ERRO: fallback não encontrado'); process.exit(1); }

const silenceCode = [
  '// MODO SILENCIO - quando o Dark manda calar',
  'let _silenceUntil = 0;',
  'let _silenceForUser = "";',
  '',
  'function isSilenced(senderNumber) {',
  '  return Date.now() < _silenceUntil && _silenceForUser === senderNumber;',
  '}',
  '',
  'function setSilence(senderNumber, seconds) {',
  '  _silenceUntil = Date.now() + seconds * 1000;',
  '  _silenceForUser = senderNumber;',
  '}',
  '',
  'function clearSilence() {',
  '  _silenceUntil = 0;',
  '  _silenceForUser = "";',
  '}',
  '',
].join('\n');

c = c.substring(0, silenceIdx) + silenceCode + c.substring(silenceIdx);

// 5. Adicionar exports das funcoes de silencio
c = c.replace(
  '  auraFallbackResponse,',
  '  auraFallbackResponse,\n  isSilenced,\n  setSilence,\n  clearSilence,'
);

fs.writeFileSync('src/bot/auraPersonality.js', c);
console.log('OK: identificacao + silencio adicionados');
