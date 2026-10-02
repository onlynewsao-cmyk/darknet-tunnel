#!/usr/bin/env node
/** Serialização do carrossel RPG e IDs quick_reply ponta a ponta. */
'use strict';
const path = require('path');
const Module = require('module');
const carouselPath = path.join(__dirname, '..', 'src', 'bot', 'rpg', 'carousel.js');
const fromObject = (type) => ({ fromObject: (obj) => ({ __protoType: type, ...obj }) });
const interactive = {
  fromObject: fromObject('InteractiveMessage').fromObject,
  Header: fromObject('Header'),
  Body: fromObject('Body'),
  Footer: fromObject('Footer'),
  NativeFlowMessage: fromObject('NativeFlowMessage'),
  CarouselCard: fromObject('CarouselCard'),
};
const fakeBaileys = {
  proto: { Message: { InteractiveMessage: interactive } },
  prepareWAMessageMedia: async ({ image }) => ({ imageMessage: { uploaded: Buffer.isBuffer(image) } }),
  generateWAMessageFromContent: (jid, message) => ({ key: { id: 'carousel-test' }, message: { jid, ...message } }),
};
const original = Module.prototype.require;
Module.prototype.require = function patchedRequire(id) {
  if (id === '@systemzero/baileys') return fakeBaileys;
  if (id === './images') return { generateFromPrompt: async () => null };
  return original.apply(this, arguments);
};

(async () => {
  const { enviarCarrossel } = require(carouselPath);
  let relay = null;
  const sock = {
    user: { id: 'bot@s.whatsapp.net' },
    waUploadToServer: async () => ({}),
    relayMessage: async (jid, message, options) => { relay = { jid, message, options }; },
  };
  const sent = await enviarCarrossel(sock, { key: { id: 'quoted' } }, { remoteJid: 'group@g.us' }, {
    corpo: 'Escolhe a raça', rodape: 'RPG',
    cards: [{ titulo: 'Elfo sombrio', corpo: 'Ágil', rodape: 'RPG', botoes: [{ texto: 'Ser elfo', id: 'RPGCR_R_elfo_sombrio' }] }],
  });
  const assert = (condition, label) => {
    console.log(`${condition ? '✅' : '❌'} ${label}`);
    if (!condition) process.exitCode = 1;
  };
  const im = relay?.message?.interactiveMessage;
  const card = im?.carouselMessage?.cards?.[0];
  const button = card?.nativeFlowMessage?.buttons?.[0];
  const reply = JSON.parse(button?.buttonParamsJson || '{}');
  assert(sent === true && relay?.jid === 'group@g.us', 'carrossel é enviado via relayMessage');
  assert(im?.__protoType === 'InteractiveMessage', 'interactiveMessage é serializado por protobuf');
  assert(card?.__protoType === 'CarouselCard' && card?.header?.__protoType === 'Header' && card?.body?.__protoType === 'Body', 'card, header e body usam protobuf');
  assert(card?.nativeFlowMessage?.__protoType === 'NativeFlowMessage', 'nativeFlowMessage usa protobuf');
  assert(button?.name === 'quick_reply' && reply.id === 'RPGCR_R_elfo_sombrio', 'quick_reply preserva o ID de raça completo');
  assert(relay?.options?.additionalNodes?.[0]?.content?.[0]?.content?.[0]?.attrs?.name === 'mixed', 'selo native_flow mixed é incluído');
  Module.prototype.require = original;
  process.exit(process.exitCode || 0);
})().catch((err) => {
  Module.prototype.require = original;
  console.error('💥', err.stack || err.message);
  process.exit(1);
});
