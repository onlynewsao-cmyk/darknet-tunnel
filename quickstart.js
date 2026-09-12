#!/usr/bin/env node
/**
 * ╔═══════════════════════════════════════════════════════════════════════╗
 * ║   DARK BOT — ARRANQUE RÁPIDO 🚀                                      ║
 * ║   node quickstart.js                                                  ║
 * ║   Conecta ao WhatsApp via QR Code ou Pairing Code no terminal        ║
 * ╚═══════════════════════════════════════════════════════════════════════╝
 *
 * COMO USAR:
 *   1. npm install
 *   2. cp .env.example .env  (e preenche pelo menos MONGODB_URI + GROQ_API_KEY)
 *   3. node quickstart.js
 *   4. Abre o WhatsApp → Dispositivos conectados → Conectar dispositivo
 *   5. Lê o QR Code no terminal OU digita o número para pairing code
 *   6. PRONTO! O bot está vivo! 🎉
 */

'use strict';

require('dotenv').config();

const readline = require('readline');
const path = require('path');
const fs = require('fs');

// ── Cores no terminal ────────────────────────────────────────────────
const c = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
};

function banner() {
  console.log(`
${c.red}${c.bold}
  ██████╗  █████╗ ██████╗ ██╗  ██╗    ██████╗  ██████╗ ████████╗
  ██╔══██╗██╔══██╗██╔══██╗██║ ██╔╝    ██╔══██╗██╔═══██╗╚══██╔══╝
  ██║  ██║███████║██████╔╝█████╔╝     ██████╔╝██║   ██║   ██║   
  ██║  ██║██╔══██║██╔══██╗██╔═██╗     ██╔══██╗██║   ██║   ██║   
  ██████╔╝██║  ██║██║  ██║██║  ██╗    ██████╔╝╚██████╔╝   ██║   
  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝    ╚═════╝  ╚═════╝    ╚═╝   
${c.reset}
${c.magenta}  ═══════════════════════════════════════════════════════════${c.reset}
${c.cyan}  ️  DARK BOT v6.44 — MAIS RÁPIDO QUE O FLASH ⚡${c.reset}
${c.magenta}  ═══════════════════════════════════════════════════════════${c.reset}
${c.dim}  Aura: jovem brasileira, 19 anos, OTOME, apaixonada pelo Dark 🌹${c.reset}
  `);
}

async function checkPrerequisites() {
  console.log(`${c.yellow}🔍 A verificar pré-requisitos...${c.reset}\n`);
  
  const checks = [];
  
  // MongoDB
  const mongoUri = process.env.MONGODB_URI;
  if (mongoUri) {
    checks.push({ name: 'MongoDB URI', ok: true, detail: mongoUri.slice(0, 30) + '...' });
  } else {
    checks.push({ name: 'MongoDB URI', ok: false, detail: 'NÃO CONFIGURADO — usa mongodb://localhost:27017/darkbot' });
  }
  
  // IA
  const hasGroq = !!process.env.GROQ_API_KEY;
  const hasGemini = !!process.env.GEMINI_API_KEY;
  const hasRouter = !!process.env.OPENROUTER_API_KEY;
  checks.push({ name: 'Groq API', ok: hasGroq, detail: hasGroq ? '✅ Configurado' : '❌ Falta (gratuito: console.groq.com)' });
  checks.push({ name: 'Gemini API', ok: hasGemini, detail: hasGemini ? '✅ Configurado' : '⬜ Opcional' });
  checks.push({ name: 'OpenRouter', ok: hasRouter, detail: hasRouter ? '✅ Configurado' : '⬜ Opcional' });
  
  // Owner
  const ownerNum = (process.env.OWNER_NUMBER || '').replace(/\D/g, '');
  checks.push({ name: 'Dono (número)', ok: ownerNum.length >= 8, detail: ownerNum || 'NÃO CONFIGURADO' });
  
  // Baileys
  try {
    require.resolve('@systemzero/baileys');
    checks.push({ name: 'Baileys', ok: true, detail: '@systemzero/baileys instalado' });
  } catch {
    checks.push({ name: 'Baileys', ok: false, detail: 'NÃO INSTALADO — corre: npm install' });
  }
  
  // Print results
  let allOk = true;
  for (const check of checks) {
    const icon = check.ok ? `${c.green}✅` : `${c.red}❌`;
    console.log(`  ${icon} ${c.bold}${check.name}${c.reset}: ${check.detail}`);
    if (!check.ok && check.name !== 'Gemini API' && check.name !== 'OpenRouter') allOk = false;
  }
  
  console.log('');
  
  if (!allOk) {
    console.log(`${c.red}${c.bold}⚠️  Alguns pré-requisitos estão em falta!${c.reset}`);
    console.log(`${c.yellow}   Copia .env.example para .env e preenche os valores.${c.reset}`);
    console.log(`${c.yellow}   Se não tens MongoDB, instala: https://www.mongodb.com/try/download/community${c.reset}`);
    console.log(`${c.yellow}   Ou usa MongoDB Atlas (gratuito): https://www.mongodb.com/cloud/atlas${c.reset}\n`);
    
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise(r => rl.question(`${c.cyan}   Continuar mesmo assim? (s/n): ${c.reset}`, r));
    rl.close();
    if (answer.toLowerCase() !== 's') {
      console.log(`${c.red}   Cancelado.${c.reset}`);
      process.exit(1);
    }
  }
  
  return true;
}

async function main() {
  banner();
  await checkPrerequisites();
  
  console.log(`${c.green}${c.bold}🚀 A iniciar DARK BOT...${c.reset}\n`);
  
  // ── Conectar MongoDB ─────────────────────────────────────────────
  const { connectDB } = require('./src/database/connection');
  try {
    await connectDB();
    console.log(`${c.green}✅ MongoDB conectado!${c.reset}\n`);
  } catch (e) {
    console.log(`${c.red}❌ Erro ao conectar MongoDB: ${e.message}${c.reset}`);
    console.log(`${c.yellow}   O bot vai funcionar sem base de dados (funcionalidade limitada)${c.reset}\n`);
  }
  
  // ── Iniciar WhatsApp Bot ─────────────────────────────────────────
  const { getBot } = require('./src/bot/whatsapp');
  const bot = getBot();
  
  // Escolher modo de conexão
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  
  console.log(`${c.cyan}${c.bold}📱 Como queres conectar?${c.reset}`);
  console.log(`  ${c.green}1${c.reset}) ${c.bold}QR Code${c.reset} — Lê com o WhatsApp no telemóvel`);
  console.log(`  ${c.green}2${c.reset}) ${c.bold}Pairing Code${c.reset} — Digita um código de 8 dígitos`);
  console.log('');
  
  const mode = await new Promise(r => rl.question(`${c.cyan}   Escolhe (1 ou 2): ${c.reset}`, r));
  
  if (mode.trim() === '2') {
    bot.mode = 'pairing';
    console.log(`\n${c.yellow}   Digita o teu número de WhatsApp (com código do país):${c.reset}`);
    const phone = await new Promise(r => rl.question(`${c.cyan}   Número: ${c.reset}`, r));
    bot.pairingPhone = phone.trim().replace(/\D/g, '');
    console.log(`${c.green}   ✅ Número registado: +${bot.pairingPhone}${c.reset}\n`);
  } else {
    bot.mode = 'qr';
    console.log(`${c.green}   ✅ Modo QR Code seleccionado${c.reset}\n`);
  }
  
  rl.close();
  
  // ── Listeners de eventos ─────────────────────────────────────────
  // QR Code no terminal
  const origSetStatus = bot.setStatus.bind(bot);
  bot.setStatus = function(status, extra = {}) {
    origSetStatus(status, extra);
    
    if (status === 'qr' && extra.qr) {
      const QRCode = require('qrcode');
      QRCode.toString(extra.qr, { type: 'terminal', small: true }, (err, url) => {
        if (!err) {
          console.log(`\n${c.yellow}${c.bold}📱 LÊ ESTE QR CODE COM O WHATSAPP:${c.reset}`);
          console.log(`${c.dim}   WhatsApp → ⋮ → Dispositivos conectados → Conectar dispositivo${c.reset}\n`);
          console.log(url);
          console.log(`${c.dim}   O QR expira em ~60 segundos. Se expirar, um novo aparece.${c.reset}\n`);
        }
      });
    }
    
    if (status === 'pairing' && extra.pairingCode) {
      console.log(`\n${c.magenta}${c.bold}🔑 CÓDIGO DE PAIRING:${c.reset}`);
      console.log(`${c.white}${c.bold}   ┌─────────────────┐${c.reset}`);
      console.log(`${c.white}${c.bold}   │  ${extra.pairingCode}  │${c.reset}`);
      console.log(`${c.white}${c.bold}   └─────────────────┘${c.reset}`);
      console.log(`${c.dim}   Digita este código no WhatsApp → Dispositivos conectados${c.reset}\n`);
    }
    
    if (status === 'connected') {
      console.log(`\n${c.green}${c.bold}  ╔═══════════════════════════════════════════════════════╗${c.reset}`);
      console.log(`${c.green}${c.bold}  ║   ✅ DARK BOT CONECTADO COM SUCESSO! 🎉              ║${c.reset}`);
      console.log(`${c.green}${c.bold}  ║    Aura está viva e pronta para ti, Dark!          ║${c.reset}`);
      console.log(`${c.green}${c.bold}  ║   ⚡ Performance Engine: ACTIVO                       ║${c.reset}`);
      console.log(`${c.green}${c.bold}  ║   🧠 IA: ${process.env.GROQ_API_KEY ? 'GROQ ACTIVO' : 'SEM CHAVE'}                              ║${c.reset}`);
      console.log(`${c.green}${c.bold}  ╚═══════════════════════════════════════════════════════╝${c.reset}\n`);
      console.log(`${c.cyan}   O bot está a correr! Envia mensagens no WhatsApp.${c.reset}`);
      console.log(`${c.cyan}   Usa ${c.bold}.menu${c.reset}${c.cyan} para ver todos os comandos.${c.reset}`);
      console.log(`${c.cyan}   Usa ${c.bold}.perf${c.reset}${c.cyan} para ver estatísticas de performance.${c.reset}`);
      console.log(`${c.cyan}   Diz ${c.bold}aura oi${c.reset}${c.cyan} para falar com a Aura. 🌹${c.reset}\n`);
    }
    
    if (status === 'disconnected') {
      console.log(`\n${c.red}⚠️  Bot desconectado. A reconectar...${c.reset}\n`);
    }
  };
  
  // ── Iniciar! ─────────────────────────────────────────────────────
  try {
    const startMode = bot.mode === 'pairing' ? 'pair' : 'qr';
    const startPhone = bot.pairingPhone || null;
    await bot.start({ mode: startMode, phoneNumber: startPhone, fresh: true });
    console.log(`${c.green}✅ Bot iniciado! A aguardar conexão...${c.reset}\n`);
    console.log(`${c.dim}   Dica: Se o QR não aparecer, verifica a tua conexão à internet.${c.reset}`);
    console.log(`${c.dim}   Dica: Pressiona Ctrl+C para parar o bot.${c.reset}\n`);
  } catch (e) {
    console.error(`${c.red}❌ Erro ao iniciar: ${e.message}${c.reset}`);
    process.exit(1);
  }
  
  // ── Graceful shutdown ────────────────────────────────────────────
  process.on('SIGINT', async () => {
    console.log(`\n${c.yellow}🛑 A parar o bot...${c.reset}`);
    try { await bot.stop(); } catch {}
    console.log(`${c.green}✅ Bot parado. Até à próxima, Dark! 🖤${c.reset}`);
    process.exit(0);
  });
}

main().catch(e => {
  console.error(`${c.red}❌ Erro fatal: ${e.message}${c.reset}`);
  console.error(e.stack);
  process.exit(1);
});
