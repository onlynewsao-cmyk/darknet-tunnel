/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║   DARK BOT — Utilitários v3.0.0                             ║
 * ║   Selos verificados, consoles coloridos, helpers            ║
 * ╚══════════════════════════════════════════════════════════════╝
 */
'use strict';

const fs = require('fs');
const chalk = require('chalk');
const axios = require('axios');
const os = require('os');
const { exec, spawn, execSync } = require('child_process');

const botVersion = "3.0.0";
const botName = "DARK BOT";

// ══════════════════════════════════════════════════════════════
// DATA E HORA (Luanda / Angola)
// ══════════════════════════════════════════════════════════════
const moment = require('moment-timezone');
const data = moment.tz('Africa/Luanda').format('DD/MM/YYYY');
const hora = moment.tz('Africa/Luanda').format('HH:mm:ss');

// ══════════════════════════════════════════════════════════════
// SAUDAÇÃO POR HORÁRIO
// ══════════════════════════════════════════════════════════════
let timed = 'Boa Madrugada 🌆';
if (hora >= "05:30:00") timed = 'Bom Dia 🏙️';
if (hora >= "12:00:00") timed = 'Boa Tarde 🌇';
if (hora >= "19:00:00") timed = 'Boa Noite 🌃';

// ══════════════════════════════════════════════════════════════
// FUNÇÕES DE CONSOLE
// ══════════════════════════════════════════════════════════════
const consoleVerde = (txt) => console.log(chalk.green(txt));
const consoleVerde2 = (txt) => console.log(chalk.greenBright(txt));
const consoleVermelho = (txt) => console.log(chalk.red(txt));
const consoleVermelho2 = (txt) => console.log(chalk.redBright(txt));
const consoleAmarelo = (txt) => console.log(chalk.yellow(txt));
const consoleAmarelo2 = (txt) => console.log(chalk.yellowBright(txt));
const consoleAzul = (txt) => console.log(chalk.blue(txt));
const consoleAzul2 = (txt) => console.log(chalk.blueBright(txt));

const consoleErro = (txt) => console.log(chalk.redBright(`[ERRO] ${txt}`));
const consoleAviso = (txt) => console.log(chalk.yellowBright(`[AVISO] ${txt}`));
const consoleInfo = (txt) => console.log(chalk.cyanBright(`[INFO] ${txt}`));
const consoleOnline = (txt) => console.log(chalk.greenBright(`[ONLINE] ${txt}`));
const consoleSucesso = (txt) => console.log(chalk.green(`[SUCESSO] ${txt}`));

// ══════════════════════════════════════════════════════════════
// FETCH JSON
// ══════════════════════════════════════════════════════════════
async function fetchJson(url) {
  try {
    const res = await axios.get(url, { timeout: 25000 });
    return res.data;
  } catch (err) {
    console.error('[fetchJson] Erro:', err.message);
    throw err;
  }
}

// ══════════════════════════════════════════════════════════════
// GET BUFFER
// ══════════════════════════════════════════════════════════════
const getBuffer = async (url, options) => {
  try {
    options = options || {};
    const res = await axios({
      method: "get", url,
      headers: { 'DNT': 1, 'Upgrade-Insecure-Request': 1 },
      ...options, responseType: 'arraybuffer',
    });
    return res.data;
  } catch (err) { return err; }
};

// ══════════════════════════════════════════════════════════════
// SELOS VERIFICADOS
// ══════════════════════════════════════════════════════════════
const seloCriador = {
  key: { fromMe: false, participant: '0@s.whatsapp.net' },
  message: {
    extendedTextMessage: {
      text: 'DARK BOT ✓',
      title: null, jpegThumbnail: null,
    },
  },
};

const criarSeloContato = (numero, nome, from) => {
  const numeroLimpo = String(numero).replace(/[^0-9]/g, '');
  return {
    key: {
      participant: '0@s.whatsapp.net',
      remoteJid: from,
      fromMe: false,
    },
    message: {
      contactMessage: {
        displayName: nome,
        vcard: `BEGIN:VCARD\nVERSION:3.0\nN:;${nome};;;\nFN:${nome}\nitem1.TEL;waid=${numeroLimpo}:${numeroLimpo}\nitem1.X-ABLabel:Celular\nEND:VCARD`,
        contextInfo: { forwardingScore: 1, isForwarded: true },
      },
    },
  };
};

// Selo principal — DARK BOT verificado
const seloDarkBot = criarSeloContato("244949926074", "DARK BOT ✓");

// Selos de IA
const seloGpt = criarSeloContato("18002428478", "Chat GPT");
const seloMeta = criarSeloContato("13135550002", "Meta IA");
const seloCopilot = criarSeloContato("18772241042", "Microsoft Copilot");

// Selos bancários
const seloNubank = criarSeloContato("551150390444", "Nubank");
const seloBb = criarSeloContato("556140040001", "Banco do Brasil");
const seloBradesco = criarSeloContato("551133350237", "Bradesco");
const seloSantander = criarSeloContato("551140043535", "Santander");
const seloItau = criarSeloContato("551140044828", "Itaú");

// ══════════════════════════════════════════════════════════════
// EXPORTS
// ══════════════════════════════════════════════════════════════
module.exports = {
  botVersion, botName, timed, data, hora,
  fetchJson, getBuffer,
  consoleVerde, consoleVerde2, consoleVermelho, consoleVermelho2,
  consoleAmarelo, consoleAmarelo2, consoleAzul, consoleAzul2,
  consoleErro, consoleAviso, consoleInfo, consoleOnline, consoleSucesso,
  seloDarkBot, seloCriador, seloMeta, seloGpt, seloCopilot,
  seloNubank, seloBb, seloBradesco, seloSantander, seloItau,
};
