#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { mongoose } = require('../src/database/connection');
const GroupSettings = require('../src/database/models/GroupSettings');
const BannedSticker = require('../src/database/models/BannedSticker');

// Simula o estado que vem da base: o filtro só deve actuar quando a
// configuração E o serviço do grupo estão activos.
const stickerSettings = {
  groupJid: '120363TEST@g.us', antisticker: true, antistickerNotify: true,
  isHosted: true, hostedUntil: new Date(Date.now() + 60_000),
};
mongoose.connection.readyState = 1;
GroupSettings.findOne = () => ({ lean: async () => stickerSettings });
GroupSettings.findOneAndUpdate = async () => stickerSettings;
GroupSettings.updateOne = async () => ({});
BannedSticker.find = () => ({ sort: () => ({ lean: async () => [] }) });
BannedSticker.findOneAndUpdate = async () => ({});
BannedSticker.deleteMany = async () => ({});

const antiSticker = require('../src/bot/antiSticker');

const GROUP = '120363TEST@g.us';
const HASH = Buffer.from('sticker-bloqueado-para-teste');

function message({ id, participant, hash = HASH }) {
  return {
    key: { id, remoteJid: GROUP, participant, fromMe: false },
    message: { stickerMessage: { fileSha256: hash, fileEncSha256: Buffer.from('enc-' + id) } },
  };
}

(async () => {
  antiSticker._reset();
  await antiSticker.setActivo(GROUP, true);
  await antiSticker.setAviso(GROUP, true);
  const learned = await antiSticker.aprender({
    groupJid: GROUP, hash: HASH, hashEnc: Buffer.from('enc-base'), animated: false,
    reason: 'Conteúdo impróprio\nsem flood no painel',
  });
  assert.strictEqual(learned.ok, true);
  const learnedList = await antiSticker.listaDe(GROUP);
  assert.strictEqual(learnedList[0].reason, 'Conteúdo impróprio sem flood no painel');

  const sent = [];
  const sock = {
    signalRepository: {
      lidMapping: {
        getPNForLID: async (lid) => lid === '991991991@lid' ? '244701991991@s.whatsapp.net' : '',
      },
    },
    sendMessage: async (jid, content) => { sent.push({ jid, ...content }); return {}; },
  };

  const first = await antiSticker.filtrar(sock, message({ id: 'sticker-1', participant: '991991991@lid' }));
  assert.strictEqual(first.apagada, true);
  const deletion = sent.find(x => x.delete);
  const warning = sent.find(x => x.text);
  assert.ok(deletion, 'apaga a figurinha banida');
  assert.ok(warning, 'avisa depois de apagar');
  assert.match(warning.text, /@244701991991/);
  assert.ok(!warning.text.includes('991991991'), 'nunca escreve dígitos do LID');
  assert.deepStrictEqual(warning.mentions, ['244701991991@s.whatsapp.net']);
  assert.ok(!/<@/.test(warning.text), 'usa marcação WhatsApp @número, não HTML');

  const beforeDuplicate = sent.length;
  const duplicate = await antiSticker.filtrar(sock, message({ id: 'sticker-1', participant: '991991991@lid' }));
  assert.strictEqual(duplicate.apagada, true);
  assert.strictEqual(duplicate.duplicada, true);
  assert.strictEqual(sent.length, beforeDuplicate, 'evento duplicado não volta a apagar nem avisar');

  const noPn = await antiSticker.filtrar(sock, message({ id: 'sticker-2', participant: '992992992@lid' }));
  assert.strictEqual(noPn.apagada, true);
  const safeWarning = sent.filter(x => x.text).at(-1);
  assert.ok(!safeWarning.text.includes('992992992'), 'LID sem PN não aparece no aviso');
  assert.deepStrictEqual(safeWarning.mentions, [], 'LID sem PN não é enviado como mention');

  const forgotten = await antiSticker.esquecer(GROUP, { hash: HASH });
  assert.strictEqual(forgotten.ok, true);
  const afterUnban = await antiSticker.filtrar(sock, message({ id: 'sticker-3', participant: '991991991@lid' }));
  assert.strictEqual(afterUnban.apagada, false, 'figurinha desaprendida deixa de ser apagada');

  console.log('✅ anti-sticker moderation OK');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
