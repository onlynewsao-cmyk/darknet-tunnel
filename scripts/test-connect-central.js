'use strict';
/* Central Connect + proteção de PV Free: regressões sem rede/WhatsApp real. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const handler = require(path.join(root, 'src/bot/commandHandler'));
const botConfigCache = require(path.join(root, 'src/bot/botConfigCache'));
const hotCache = require(path.join(root, 'src/bot/hotCache'));
const prefixEngine = require(path.join(root, 'src/bot/prefixEngine'));
const nativeCommands = require(path.join(root, 'src/bot/nativeCommands'));
const User = require(path.join(root, 'src/database/models/User'));

// O gate carrega este módulo só ao atender texto Free. Substituímo-lo aqui
// para testar política/cota sem chamar fornecedor de IA ou rede externa.
const auraModesPath = require.resolve(path.join(root, 'src/aura/auraModes'));
const savedAuraModes = require.cache[auraModesPath];
let auraFreeCalls = [];
require.cache[auraModesPath] = {
  id: auraModesPath, filename: auraModesPath, loaded: true,
  exports: {
    assistantRespond: async (text, opts) => {
      auraFreeCalls.push({ text, opts });
      return `Resposta assistente: ${text}`;
    },
  },
};

async function run() {
  const originalGet = botConfigCache.get;
  const originalSet = botConfigCache.set;
  const originalGetUser = hotCache.getUser;
  const originalDetect = prefixEngine.detect;
  const originalUserFindOneAndUpdate = User.findOneAndUpdate;
  const originalDbReadyState = User.db.readyState;
  let user = { role: 'free' };
  botConfigCache.get = async (key, fallback) => ({
    owner_numbers: [],
    owner_number: '244900000000',
    owner_lid: '',
  }[key] ?? fallback);
  hotCache.getUser = async () => user;
  prefixEngine.detect = async (text) => {
    const raw = String(text || '').trim();
    return raw.startsWith('!') ? { prefix: '!', rest: raw.slice(1) } : null;
  };
  botConfigCache.set = async (key, value) => value;

  try {
    const freeCtx = { isGroup: false, senderNumber: '244911111111', senderLid: '', remoteJid: '244911111111@s.whatsapp.net' };
    const freeMsg = { key: { remoteJid: freeCtx.remoteJid, fromMe: false } };
    const pvSent = [];
    const pvSock = { user: { id: '244900000099@s.whatsapp.net' }, sendMessage: async (_jid, payload) => { pvSent.push(payload); return {}; } };
    assert.equal(await handler.bloquearPvFreeForaSticker(pvSock, freeMsg, freeCtx, '!play música'), true, 'Free no PV bloqueia comando que não é sticker');
    assert.match(pvSent.at(-1).text, /ACESSO FREE NO PRIVADO/);
    assert.match(pvSent.at(-1).text, /trial de 7 dias/);
    assert.equal(await handler.bloquearPvFreeForaSticker(pvSock, freeMsg, freeCtx, '!fig'), false, 'aliases de criar sticker ficam liberados');
    const avisosAntes = pvSent.length;
    assert.equal(await handler.bloquearPvFreeForaSticker(pvSock, freeMsg, freeCtx, '!menu'), true, 'comando Free não abre menus no PV');
    assert.equal(pvSent.length, avisosAntes, 'o mesmo Free não recebe aviso repetido no mesmo dia');

    const auraCtx = { isGroup: false, senderNumber: '244922222222', senderLid: '', remoteJid: '244922222222@s.whatsapp.net', pushName: 'Free' };
    const auraMsg = { key: { remoteJid: auraCtx.remoteJid, fromMe: false } };
    const auraSent = [];
    const auraSock = { user: { id: '244900000099@s.whatsapp.net' }, sendMessage: async (_jid, payload) => { auraSent.push(payload); return {}; } };
    for (let i = 1; i <= 10; i++) {
      assert.equal(await handler.bloquearPvFreeForaSticker(auraSock, auraMsg, auraCtx, `pergunta simples ${i}`), true, 'texto Free é tratado pelo assistente limitado');
    }
    assert.equal(auraFreeCalls.length, 10, 'Free recebe exactamente 10 respostas simples diárias');
    assert(auraFreeCalls.every(c => c.opts.freePvLimited === true && c.opts.isGroup === false && c.opts.isVip === false), 'AURA Free recebe contexto restrito, sem privilégios');
    assert.equal(auraSent.filter(p => /^Resposta assistente:/.test(p.text || '')).length, 10, 'cada pergunta autorizada recebe apenas resposta textual');
    assert.equal(await handler.bloquearPvFreeForaSticker(auraSock, auraMsg, auraCtx, 'pergunta simples 11'), true, 'a décima primeira pergunta fica bloqueada');
    assert.equal(auraFreeCalls.length, 10, 'limite não chama IA na 11ª pergunta');
    assert.match(auraSent.at(-1).text, /ACESSO FREE NO PRIVADO/, 'ao esgotar a cota, mostra a orientação comercial');
    assert.equal(await handler.bloquearPvFreeForaSticker(auraSock, auraMsg, auraCtx, '!play música'), true, 'Free continua sem downloads mesmo após usar AURA');
    assert.equal(await handler.bloquearPvFreeForaSticker(auraSock, auraMsg, auraCtx, '?play música'), true, 'tentativa com prefixo errado não vira pergunta AURA');
    assert.equal(auraFreeCalls.length, 10, 'nenhum comando, mesmo com prefixo errado, consome a cota AURA');
    assert.equal(auraSent.length, 11, 'orientação comercial não repete no mesmo dia');

    // Simula a marca durável quando um processo novo (ou outro worker) vê o
    // mesmo Free: a chave em memória muda, mas a base impede novo anúncio.
    let persistedNoticeDate = '';
    let persistedWrites = 0;
    User.db.readyState = 1;
    User.findOneAndUpdate = (filter, update) => ({
      lean: async () => {
        persistedWrites++;
        if (persistedNoticeDate !== filter.freePvNoticeDate?.$ne) {
          persistedNoticeDate = update.$set.freePvNoticeDate;
          return { whatsappNumber: filter.whatsappNumber, freePvNoticeDate: persistedNoticeDate };
        }
        return null;
      },
    });
    const restartSent = [];
    const restartSock = { user: { id: '244900000099@s.whatsapp.net' }, sendMessage: async (_jid, payload) => { restartSent.push(payload); return {}; } };
    const restartMsg = { key: { remoteJid: '244933333333@s.whatsapp.net', fromMe: false } };
    const restartCtx = { isGroup: false, senderNumber: '244933333333', senderLid: '', remoteJid: restartMsg.key.remoteJid };
    await handler.bloquearPvFreeForaSticker(restartSock, restartMsg, restartCtx, '!menu');
    const otherWorkerCtx = { ...restartCtx, remoteJid: '244933333333@lid', senderLid: '555555555555' };
    await handler.bloquearPvFreeForaSticker(restartSock, { key: { remoteJid: otherWorkerCtx.remoteJid, fromMe: false } }, otherWorkerCtx, '!menu');
    assert.equal(restartSent.length, 1, 'marca persistida evita anúncio duplicado depois de restart/worker');
    assert.equal(persistedWrites, 2, 'segundo worker consulta a marca diária persistida');
    User.findOneAndUpdate = originalUserFindOneAndUpdate;
    User.db.readyState = originalDbReadyState;

    user = { role: 'premium', premiumUntil: null };
    assert.equal(await handler.bloquearPvFreeForaSticker(pvSock, freeMsg, freeCtx, '!play música'), false, 'VIP mantém acesso completo no PV');
    user = { role: 'free' };

    const ownerLidCtx = { isGroup: false, senderNumber: '555551234567890', senderLid: '555551234567890', senderJid: '555551234567890@lid', remoteJid: '555551234567890@lid' };
    const ownerLidMsg = { key: { remoteJid: ownerLidCtx.remoteJid, fromMe: false } };
    const ownerLidSock = {
      user: { id: '244900000099@s.whatsapp.net' }, sendMessage: async () => { throw new Error('Dono LID não pode receber aviso Free'); },
      signalRepository: { lidMapping: { getPNForLID: async () => '244900000000@s.whatsapp.net' } },
    };
    assert.equal(await handler.bloquearPvFreeForaSticker(ownerLidSock, ownerLidMsg, ownerLidCtx, '!play música'), false, 'Dono com LID mapeado mantém acesso completo');
    assert.equal(ownerLidCtx.senderNumber, '244900000000', 'LID do Dono é normalizado para o PN verificado');

    const replies = [];
    await nativeCommands.pvfree({
      sock: { sendMessage: async (_jid, payload) => replies.push(payload.text) },
      msg: { key: {} }, ctx: { remoteJid: 'owner@s.whatsapp.net', prefix: '!' }, args: ['on'], isOwner: true,
    });
    assert(/POLÍTICA DE PV FREE/.test(replies[0]) && /política é fixa/i.test(replies[0]), '!pvfree explica a política fixa sem alterar o gate');
  } finally {
    botConfigCache.get = originalGet;
    botConfigCache.set = originalSet;
    hotCache.getUser = originalGetUser;
    prefixEngine.detect = originalDetect;
    User.findOneAndUpdate = originalUserFindOneAndUpdate;
    User.db.readyState = originalDbReadyState;
    if (savedAuraModes) require.cache[auraModesPath] = savedAuraModes;
    else delete require.cache[auraModesPath];
  }

  assert.equal(typeof nativeCommands.pvfree, 'function', 'Comando !pvfree deve existir');
  assert(User.schema.path('freeAuraUsed') && User.schema.path('freeAuraDate'), 'cota AURA Free é persistida no perfil');
  assert(User.schema.path('freePvNoticeDate'), 'aviso comercial Free é persistido no perfil');

  const sidebar = fs.readFileSync(path.join(root, 'src/views/partials/sidebar.ejs'), 'utf8');
  const hrefs = [...sidebar.matchAll(/<a\s+href="([^"]+)"/g)].map(m => m[1]);
  const duplicates = hrefs.filter((href, index) => hrefs.indexOf(href) !== index);
  assert.deepEqual(duplicates, [], 'A barra lateral não pode ter abas duplicadas');
  assert(!hrefs.includes('/dashboard/sessoes'), 'Failover deve estar unificado em Connect, sem aba separada');
  assert(hrefs.includes('/dashboard/connect'), 'A central Connect deve continuar acessível');

  const connectView = fs.readFileSync(path.join(root, 'src/views/dashboard/connect.ejs'), 'utf8');
  assert(connectView.includes('Sessões de reserva / Failover'));
  assert(connectView.includes('/dashboard/connect/failover/adicionar'));
  assert(connectView.includes('/dashboard/connect/status.json'));
  assert(!connectView.includes('refreshCallStatus(true)'));
  assert(!connectView.includes('refreshVoipStatus(true)'));

  const dashboardRoutes = fs.readFileSync(path.join(root, 'src/routes/dashboard.js'), 'utf8');
  assert(dashboardRoutes.includes("res.redirect('/dashboard/connect#failover')"));
  assert(dashboardRoutes.includes("'/connect/failover/adicionar'"));
  assert(dashboardRoutes.includes("'/connect/failover/rodar'"));

  console.log('✅ Gate comercial de PV Free e Central Connect/Failover validados.');
}

run().then(() => process.exit(0)).catch(error => {
  console.error('❌ Teste Connect/PV Free falhou:', error);
  process.exit(1);
});
