#!/usr/bin/env node
/**
 * DARK BOT — instala a VOZ REAL (RTP) opcional.
 *
 * Usa: node scripts/setup-voip.js  (ou: npm run setup:voip)
 *
 * Instala SEM gravar no package.json (--no-save) de propósito: o
 * @roamhq/wrtc é um módulo nativo que pode rebentar o build do Render
 * Free. Assim o VoIP fica disponível onde a máquina aguenta (VPS, local,
 * Render pago) e o bot principal nunca depende dele.
 */
'use strict';

const { execSync } = require('child_process');

console.log('📞 DARK BOT — VOZ REAL (baileys-caller)\n');
console.log('Vai instalar (sem gravar no package.json):');
console.log('  • baileys-caller     git+https://github.com/SheIITear/baileys-caller.git');
console.log('  • @whiskeysockets/baileys  (peer dependency)');
console.log('  • @roamhq/wrtc       (módulo nativo — precisa de prebuild ou compilador)\n');

try {
  execSync(
    'npm install --no-save --no-audit --no-fund ' +
    'git+https://github.com/SheIITear/baileys-caller.git ' +
    '@whiskeysockets/baileys@^7.0.0-rc11',
    { stdio: 'inherit' }
  );
} catch (e) {
  console.error('\n❌ A instalação falhou: ' + String(e.message || e));
  process.exit(1);
}

console.log('\n✅ Instalado. Passos seguintes:');
console.log('   1. Reinicia o bot (npm start).');
console.log('   2. Liga o 3.º aparelho: na 1.ª vez o QR do VoIP aparece nos logs');
console.log('      (WhatsApp → Aparelhos conectados → Ligar um aparelho).');
console.log('   3. .ligar <numero>  ou deixa o autoCall ligar para o Dono —');
console.log('      a Aura vai FALAR e OUVIR de verdade.');
console.log('\n⚠️  Limites: só voz 1:1 de SAÍDA. Atender ENTRADA com áudio não');
console.log('    existe em nenhuma lib Baileys (ver AURA-VOZ-REAL.md).');
