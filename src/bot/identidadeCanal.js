'use strict';
/**
 * v7.93 — IDENTIDADE: link do canal + selo de contacto verificado
 *
 * O link do canal (menu 📡, !premium, botões de canal...) e o contacto
 * "verificado ✓" passam a ser DINÂMICOS: o Dono muda com !setcanal e
 * !setselo e reflecte-se em TODO o lado onde aparecem.
 */

const config = require('../config');

const CANAL_DEF = 'https://whatsapp.com/channel/0029VbDMnJs6buMDAqf2Fq1z';
const SELO_DEF = { nome: 'DARK BOT ✓', numero: '244949926074' };

function _cache() { return require('./botConfigCache'); }

/** Link do canal actual — v12.9.41: 'off' APAGA a sério (devolve '')
 *  em vez de repor o link padrão do env. */
async function canalLink() {
  try {
    if (await _cache().get('channel_off', false)) return '';
    const v = await _cache().get('channel_url', '');
    if (v) return v;
  } catch {}
  return config.channelUrl || CANAL_DEF;
}

async function setCanal(url) {
  const v = String(url || '').trim();
  if (!v) {   // OFF = apagar: não volta ao padrão
    await _cache().set('channel_off', true);
    await _cache().set('channel_url', '');
    return;
  }
  await _cache().set('channel_off', false);
  await _cache().set('channel_url', v);
}

/** Selo de contacto verificado { nome, numero } (DB > padrão). */
async function selo() {
  const def = { ...SELO_DEF };
  try {
    const nome = await _cache().get('selo_nome', '');
    const numero = String(await _cache().get('selo_numero', '')).replace(/\D/g, '');
    return { nome: nome || def.nome, numero: numero || def.numero };
  } catch { return def; }
}

async function setSelo(nome, numero) {
  if (nome) await _cache().set('selo_nome', String(nome).trim());
  if (numero) await _cache().set('selo_numero', String(numero).replace(/\D/g, '').trim());
}

/** Mensagem de contacto (vcard) citável — o "contacto verificado ✓". */
function seloMsg(nome, numero) {
  const num = String(numero || '').replace(/\D/g, '');
  return {
    key: { participant: '0@s.whatsapp.net', remoteJid: 'status@broadcast', fromMe: false },
    message: {
      contactMessage: {
        displayName: nome,
        vcard: `BEGIN:VCARD\nVERSION:3.0\nN:;${nome};;;\nFN:${nome}\nitem1.TEL;waid=${num}:${num}\nitem1.X-ABLabel:Celular\nEND:VCARD`,
        contextInfo: { forwardingScore: 1, isForwarded: true },
      },
    },
  };
}

// v12.9.41: envia o contacto verificado como CARTÃO REAL (o quote fake de
// status@broadcast deixou de renderizar nos clientes novos do WhatsApp)
async function enviarSelo(sock, jid, nome, numero, quoted = null) {
  const num = String(numero || '').replace(/\D/g, '');
  const env = { contacts: { displayName: nome, contacts: [{ vcard: `BEGIN:VCARD\nVERSION:3.0\nN:;${nome};;;\nFN:${nome}\nitem1.TEL;waid=${num}:${num}\nitem1.X-ABLabel:Celular\nEND:VCARD` }] } };
  if (quoted && quoted.key) env.quoted = quoted;
  return sock.sendMessage(jid, env);
}

module.exports = { canalLink, setCanal, selo, setSelo, seloMsg, enviarSelo, CANAL_DEF, SELO_DEF };
