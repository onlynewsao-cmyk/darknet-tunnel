/**
 * DARK BOT — A AURA ESTÁ VIVA? (v6.69)
 *
 * O Dono reportou: "não responde nem por texto, nem por voz, nem por
 * marcação, nem por responder a mensagem dela, nem no PV nem nos
 * grupos". Este teste corre o commandHandler.handle() A SÉRIO em
 * cada uma dessas vias e falha se ela ficar calada.
 *
 * BUGS REAIS QUE APANHA (todos estavam em produção):
 *
 *  1. /aura.*(ri|laugh|😂)/ sem \b — o "ri" apanhava o "ri" de
 *     "cRIar". "aura cria um grupo..." respondia "_ri muito_ 🤣🤣🤣"
 *     e a ordem NUNCA corria. Foi exactamente o que o Dono viu.
 *  2. auraTriggerActive = _auraAwakeHere ? isAuraTrigger : false
 *     Num grupo em modo assistente (42 dos 44 grupos reais) chamar
 *     "aura ..." não fazia NADA. Ela parecia morta nos grupos.
 *  3. isOwnerFreeText exigia _auraAwakeHere até no PV.
 *
 * Uso: node scripts/test-aura-viva.js
 */
'use strict';

process.env.OWNER_NUMBER = '244945280380';
process.env.BOT_PREFIX = '.';

const path = require('path');
const Module = require('module');
const orig = Module.prototype.require;

// Estado que imita a base REAL de produção (lida do Atlas):
//   ai_auto_enabled=true, owner_lid, 1 grupo desactivado,
//   grupos com auraMode undefined (= modo assistente)
const STORE = {
  ai_auto_enabled: true,
  owner_lid: '213907088089212@lid',
  disabled_users: ['244', '244957875066'],
  disabled_groups: ['120363409173532035@g.us'],
  bot_interaction_enabled: true,
  prefixes: ['.'],
};

Module.prototype.require = function (id) {
  if (/models\/(\w+)$/.test(id)) {
    const nome = /models\/(\w+)$/.exec(id)[1];
    const doc = {
      whatsappNumber: '244945280380', role: 'owner', active: true,
      isPremium() { return true; }, save: async () => {}, coins: 100,
      botEnabled: true, isHosted: true, hostedUntil: null,
      trialExpiresAt: new Date(Date.now() + 864e5),
      commandsUsedToday: 0, totalCommands: 0,
      lastResetDate: new Date().toISOString().split('T')[0],
      blockedCommands: [], blockedSubmenus: [],
      // grupos reais: a maioria tem auraMode undefined (assistente)
      auraMode: undefined, onlyAdmins: false, addMessage() {},
    };
    const w = v => { const p = Promise.resolve(v); p.lean = () => Promise.resolve(v); p.select = () => p; p.sort = () => p; p.limit = () => p; p.catch = () => p; return p; };
    return {
      findOne: () => w(nome === 'GroupSettings' ? { groupJid: 'g@g.us', botEnabled: true, auraMode: undefined } : doc),
      find: () => w([doc]), create: async () => doc, updateOne: async () => ({}),
      findOneAndUpdate: async () => doc, countDocuments: async () => 1,
      getOrCreate: async () => doc, deleteMany: async () => ({}), deleteOne: async () => ({}),
    };
  }
  if (id.endsWith('botConfigCache')) {
    return { get: async (k, d) => (k in STORE ? STORE[k] : d), set: async (k, v) => { STORE[k] = v; },
             clear: () => {}, refresh: async () => 0, getMany: async () => ({}), dump: () => STORE };
  }
  return orig.apply(this, arguments);
};

const ch = require(path.join(__dirname, '..', 'src', 'bot', 'commandHandler'));
let ok = 0, fail = 0;
const t = (n, c, e) => { e = e || ''; c ? ok++ : fail++; console.log('  ' + (c ? '✅' : '❌') + ' ' + n + (e ? ' → ' + String(e).replace(/\n/g, ' ').slice(0, 68) : '')); };

const BOT = '244949926074';
const OUT = [];
const sock = {
  user: { id: BOT + ':79@s.whatsapp.net' },
  sendMessage: async (j, c) => {
    if (c.react) return { key: {} };
    OUT.push({ j, text: c.text ? String(c.text) : null, audio: !!c.audio, image: !!c.image, ptt: !!c.ptt });
    return { key: { id: 'x' } };
  },
  groupMetadata: async (j) => ({ id: j, subject: 'Grupo', participants: [
    { id: '244945280380@s.whatsapp.net', admin: null }, { id: BOT + '@s.whatsapp.net', admin: 'admin' }] }),
  sendPresenceUpdate: async () => {}, readMessages: async () => {},
  profilePictureUrl: async () => null,
  groupCreate: async () => ({ id: 'novo@g.us' }), groupInviteCode: async () => 'ABC123',
  rejectCall: async () => {},
};

function msgTexto(texto, { grupo = null, lid = false, reply = false } = {}) {
  const remote = grupo || (lid ? '213907088089212@lid' : '244945280380@s.whatsapp.net');
  const key = { remoteJid: remote, fromMe: false, id: 'M' + Math.random() };
  if (grupo) key.participant = '244945280380@s.whatsapp.net';
  if (lid) key.remoteJidAlt = '244945280380@s.whatsapp.net';
  const m = { key, pushName: 'Dark', messageTimestamp: Math.floor(Date.now() / 1000),
              message: { conversation: texto } };
  if (reply) {
    m.message = { extendedTextMessage: { text: texto,
      contextInfo: { stanzaId: 'S1', participant: BOT + '@s.whatsapp.net',
                     quotedMessage: { conversation: 'mensagem dela' } } } };
  }
  return m;
}

async function correr(msg) {
  OUT.length = 0;
  try { await ch.handle(sock, msg); } catch (e) { return { erro: e.message }; }
  return { respostas: OUT.slice() };
}
const falou = r => !r.erro && r.respostas && r.respostas.length > 0;
const txt1 = r => (r.respostas && r.respostas[0] && (r.respostas[0].text || (r.respostas[0].audio ? '[AUDIO]' : '[img]'))) || '';

(async () => {
  console.log('\n╔═══ A AURA ESTÁ VIVA? — todas as vias ═══╗');

  // ── 1. O BUG DO "_ri_" ──────────────────────────────────────
  console.log('\n▸ 1. Ordens que davam "_ri muito_ 🤣"');
  const cRi = /\baura\b[\s,]*(por favor\s*)?\b(ri|rir|risada|gargalha|gargalhada|laugh)\b\s*$/i;
  t('"aura CRIa um grupo" NÃO é pedido de riso',
    !cRi.test('aura cria um grupo na comunidade DARK RPG chamado Arena'), '');
  t('"aura escreve" também não', !cRi.test('aura escreve um texto'), '');
  t('"aura ria" (outra palavra) não', !cRi.test('aura ria de mim'), '');
  t('"aura ri" continua a rir', cRi.test('aura ri'), '');

  const rOrdem = await correr(msgTexto('aura cria um grupo chamado Arena', { grupo: '120363406930879349@g.us' }));
  t('A ordem EXECUTA (não responde com riso)',
    falou(rOrdem) && !/_ri|gargalha|🤣/.test(txt1(rOrdem)), txt1(rOrdem));

  // ── 2. PV ───────────────────────────────────────────────────
  console.log('\n▸ 2. Privado');
  const rPv = await correr(msgTexto('oi aura tudo bem?'));
  t('PV do Dono responde', falou(rPv), txt1(rPv));
  const rLid = await correr(msgTexto('tudo bem?', { lid: true }));
  t('PV por LID responde (WhatsApp moderno)', falou(rLid), txt1(rLid));

  // ── 3. GRUPOS ───────────────────────────────────────────────
  console.log('\n▸ 3. Grupos (modo assistente — 42 dos 44 grupos reais)');
  const rG = await correr(msgTexto('aura tudo bem?', { grupo: '120363406930879349@g.us' }));
  t('Chamar "aura ..." funciona em modo assistente', falou(rG), txt1(rG));
  const rQuieta = await correr(msgTexto('bom dia malta', { grupo: '120363406930879349@g.us' }));
  t('Não se mete onde não é chamada', !falou(rQuieta), txt1(rQuieta) || '(calada)');

  // ── 4. MARCAÇÃO E RESPOSTA ──────────────────────────────────
  console.log('\n▸ 4. Marcação e resposta directa');
  const mMenc = msgTexto('@' + BOT + ' tudo bem?', { grupo: '120363406930879349@g.us' });
  mMenc.message = { extendedTextMessage: { text: '@' + BOT + ' tudo bem?',
    contextInfo: { mentionedJid: [BOT + '@s.whatsapp.net'] } } };
  t('Responde quando é marcada', falou(await correr(mMenc)), '');
  const rReply = await correr(msgTexto('e isso?', { grupo: '120363406930879349@g.us', reply: true }));
  t('Responde a quem responde à mensagem dela', falou(rReply), txt1(rReply));

  // ── 5. VOZ ──────────────────────────────────────────────────
  console.log('\n▸ 5. Voz');
  const ai = require(path.join(__dirname, '..', 'src', 'bot', 'ai'));
  const _sp = ai.speakWithFallback;
  ai.speakWithFallback = async () => Buffer.alloc(9000, 1);
  const rVoz = await correr(msgTexto('manda um audio dizendo bom dia'));
  t('Pedido de áudio devolve ÁUDIO', falou(rVoz) && rVoz.respostas.some(x => x.audio || x.ptt),
    rVoz.respostas.map(x => x.audio ? 'AUDIO' : 'txt').join(','));
  const rEco = await correr(msgTexto('fala oi'));
  t('"fala oi" NÃO faz eco (responde, não repete)',
    falou(rEco) && !/^fala oi$/i.test(String(txt1(rEco)).trim()), txt1(rEco));
  ai.speakWithFallback = _sp;

  // ── 6. CHAMADAS ─────────────────────────────────────────────
  console.log('\n▸ 6. Chamadas (voz e vídeo)');
  const call = require(path.join(__dirname, '..', 'src', 'bot', 'callHandler'));
  ai.speakWithFallback = async () => Buffer.alloc(9000, 1);

  OUT.length = 0;
  await call.setMode('244945280380@s.whatsapp.net', 'atender');
  const rc = await call.onCall(sock, { id: 'c1', from: '244945280380@s.whatsapp.net', status: 'offer', isVideo: false },
    { ownerJid: '244945280380@s.whatsapp.net', ownerNumber: '244945280380', isOwner: true });
  t('Atende chamada de VOZ', rc.modo === 'atender', rc.modo);

  OUT.length = 0;
  call.terminar('244945280380@s.whatsapp.net');
  const rv = await call.onCall(sock, { id: 'c2', from: '244945280380@s.whatsapp.net', status: 'offer', isVideo: true },
    { ownerJid: '244945280380@s.whatsapp.net', ownerNumber: '244945280380', isOwner: true });
  t('Atende chamada de VÍDEO', rv.modo === 'atender', rv.modo);
  // v7.0 — o comportamento correcto (v6.76/v6.77) é a AURA FALAR ao atender:
  // a saudação de voz é o sinal de que ela atendeu. A asserção antiga exigia
  // silêncio total (comportamento revertido em 7a3a068).
  t('Atender fala a saudação (áudio)', OUT.some(o => o.audio || o.ptt),
    OUT.map(o => o.image ? 'IMG' : (o.audio || o.ptt ? 'AUDIO' : 'txt')).join(','));
  call.terminar('244945280380@s.whatsapp.net');
  ai.speakWithFallback = _sp;

  console.log('\n  ' + ok + ' OK / ' + fail + ' FALHOU\n');
  process.exit(fail ? 1 : 0);
})();
