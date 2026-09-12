/**
 * DARK BOT — AURA: SEM ECO DE VOZ + PV DE TODOS (v6.67)
 *
 * Bugs que apanha:
 *   • "fala oi" NUNCA mais é ordem de voz — só áudio/voz + verbo
 *     de pedido (manda, envia, grava, dizendo...).
 *   • PV de não-dono agora activa a AURA (pvDeTodos).
 *   • Chamadas: rejeitar + avisar o Dono.
 *
 * Uso: node scripts/test-aura-voz-pv.js
 */
'use strict';

process.env.OWNER_NUMBER = '244945280380';
const path = require('path');
const Module = require('module');
const orig = Module.prototype.require;
Module.prototype.require = function (id) {
  if (/models\//.test(id)) {
    const w = v => { const p = Promise.resolve(v); p.lean = () => Promise.resolve(v); p.sort = () => p; p.limit = () => p; return p; };
    return { find: () => w([]), findOne: () => w(null), countDocuments: async () => 0 };
  }
  if (id.endsWith('botConfigCache')) return { get: async (k, d) => d, set: async () => {} };
  return orig.apply(this, arguments);
};

let ok = 0, fail = 0;
const t = (n, c, e) => { e = e || ''; c ? ok++ : fail++; console.log('  ' + (c ? '✅' : '❌') + ' ' + n + (e ? ' → ' + String(e).slice(0, 70) : '')); };

// ══════════════════════════════════════════════════════════════
// 1. ECO DE VOZ — regex do bloco 702
// ══════════════════════════════════════════════════════════════
function ordemVoz(t) {
  const tv = t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return /\b(audio|voz|ptt|nota de voz|mensagem de voz)\b/.test(tv) &&
         /\b(manda|mande|envia|envie|grava|grave|quero|faz|faca|poe|responde|diz|fala)\b/.test(tv);
}
function conteudoVoz(t) {
  const m = t.match(/\b(?:dizendo|a dizer|que diga|diga|dizer|falando|assim|isto|isso)\b[:,]?\s+([\s\S]{2,300})$/i)
         || t.match(/[:"“]\s*([^"”\n]{2,300})["”]?\s*$/);
  return (m?.[1] || '').trim();
}

console.log('\n╔═══ 1. ECO DE VOZ ═══╗');
const eco = [
  'fala oi', 'aura fala oi', 'ele fala muito', 'a minha voz e linda',
  'tudo bem', 'bom dia', 'como estas',
];
let ecook = 0;
for (const f of eco) if (!ordemVoz(f)) ecook++;
t('Frases normais NÃO são ordem de voz', ecook === eco.length, ecook + '/' + eco.length);

const voz = [
  'manda um audio dizendo bom dia meu amor',
  'aura manda uma mensagem de voz',
  'grava um audio: te amo',
  'envia um audio a dizer que gostas de mim',
  'manda audio',
];
let vozok = 0;
for (const f of voz) if (ordemVoz(f)) vozok++;
t('Pedidos de áudio são detectados', vozok === voz.length, vozok + '/' + voz.length);

t('Conteúdo extraído certo', conteudoVoz('manda um audio dizendo bom dia') === 'bom dia', conteudoVoz('manda um audio dizendo bom dia'));
t('Sem conteúdo não faz eco', conteudoVoz('manda um audio') === '', conteudoVoz('manda um audio'));

// ══════════════════════════════════════════════════════════════
// 2. PV DE TODOS — a condição do commandHandler
// ══════════════════════════════════════════════════════════════
console.log('\n╔═══ 2. PV DE TODOS ═══╗');
function pvDeTodos(texto, isGroup) {
  const prefix = texto.startsWith('!') || texto.startsWith('.') || texto.startsWith('/');
  return !isGroup && !prefix && texto.length > 0;
}
t('PV de não-dono activa AURA', pvDeTodos('oi tudo bem?', false), '');
t('PV de dono também', pvDeTodos('fala comigo', false), '');
t('Comando no PV não activa', !pvDeTodos('.play shakira', false), '');
t('Grupo não activa por esta via', !pvDeTodos('oi', true), '');
t('Texto vazio não activa', !pvDeTodos('', false), '');

// ══════════════════════════════════════════════════════════════
// 3. CHAMADAS — rejectCall + notificar dono
// ══════════════════════════════════════════════════════════════
console.log('\n╔═══ 3. CHAMADAS ═══╗');
const reject = [];
const notific = [];
const sockCall = {
  rejectCall: async (id, from) => { reject.push({ id, from }); },
  sendMessage: async (j, c) => { notific.push({ j, t: c.text?.slice(0, 50) }); return {}; },
};
async function handleCall(sock, calls, ownerJid) {
  for (const call of calls) {
    if (call.status !== 'offer') return;
    try { await sock.rejectCall(call.id, call.from); } catch {}
    try { await sock.sendMessage(call.from, { text: `Olá! O Dark não pode atender chamadas de ${call.isVideo ? 'vídeo' : 'voz'} agora. Deixa uma mensagem por aqui que ele lê quando puder. 👋` }); } catch {}
    try {
      if (ownerJid && ownerJid !== call.from) {
        await sock.sendMessage(ownerJid, { text: `📞 Alguém te ligou! De: ${call.from.split('@')[0]} | Tipo: ${call.isVideo ? 'vídeo' : 'voz'}` });
      }
    } catch {}
  }
}
(async () => {
  await handleCall(sockCall, [{ id: 'c1', from: '999@s.whatsapp.net', status: 'offer', isVideo: false }], '244945280380@s.whatsapp.net');
  t('Rejeita a chamada', reject.length === 1 && reject[0].from === '999@s.whatsapp.net', JSON.stringify(reject));
  t('Mensagem ao chamador', notific.some(n => n.j === '999@s.whatsapp.net'), notific.map(n => n.j).join(','));
  t('Notifica o Dono', notific.some(n => n.j === '244945280380@s.whatsapp.net'), notific.map(n => n.t).join(' | '));

  // ══════════════════════════════════════════════════════════════
  // 4. DARK UTILS — selos e consoles
  // ══════════════════════════════════════════════════════════════
  console.log('\n╔═══ 4. DARK UTILS ═══╗');
  const DU = require(path.join(__dirname, '..', 'src', 'bot', 'darkUtils'));
  t('Bot name é DARK BOT', DU.botName === 'DARK BOT', DU.botName);
  t('Versão 3.0.0', DU.botVersion === '3.0.0', DU.botVersion);
  t('Selo principal existe', DU.seloDarkBot?.message?.contactMessage?.displayName === 'DARK BOT ✓', DU.seloDarkBot?.message?.contactMessage?.displayName);
  t('Selo GPT existe', DU.seloGpt?.message?.contactMessage?.displayName === 'Chat GPT', '');
  t('Selo Meta existe', DU.seloMeta?.message?.contactMessage?.displayName === 'Meta IA', '');
  t('Selo Copilot existe', DU.seloCopilot?.message?.contactMessage?.displayName === 'Microsoft Copilot', '');
  t('Console functions exist', typeof DU.consoleVerde === 'function' && typeof DU.consoleErro === 'function', '');
  t('fetchJson is function', typeof DU.fetchJson === 'function', '');
  t('getBuffer is function', typeof DU.getBuffer === 'function', '');

  console.log(`\n  ${ok} OK / ${fail} FALHOU\n`);
  process.exit(fail ? 1 : 0);
})();
