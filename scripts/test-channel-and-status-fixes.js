'use strict';
/**
 * Test suite for:
 * 1. WhatsApp Channel (@newsletter) broadcast messages not triggering Aura / commands.
 * 2. WhatsApp Status feed (status@broadcast) not triggering Aura / commands.
 * 3. Group status handling in messageListener (admin group status not deleted / broken into black screen).
 * 4. Correct imports of baileys-v6 in channel & profile cases.
 */

const assert = require('assert');
const Module = require('module');

// Mock mongoose e dotenv se não estiverem instalados no sandbox
const _orig = Module.prototype.require;
Module.prototype.require = function (s) {
  if (s === 'dotenv') return { config: () => ({}) };
  if (s === 'bcryptjs') return { hash: async () => '', compare: async () => true, genSalt: async () => '' };
  if (s === 'axios') return { get: async () => ({ data: {} }), post: async () => ({ data: {} }) };
  if (s === 'yt-search') return async () => ({ videos: [] });
  if (s === 'baileys-v6' || s.endsWith('/baileys')) {
    return {
      downloadContentFromMessage: async function* () { yield Buffer.from('data'); },
      downloadMediaMessage: async () => Buffer.from('data'),
      proto: { Message: class {} }
    };
  }
  if (s === 'mongoose' || s.endsWith('/mongoose')) {
    class Schema {
      constructor() { this.statics = {}; this.methods = {}; }
      index() { return this; } set() { return this; } static() { return this; } method() { return this; }
      pre() { return this; } post() { return this; } virtual() { return { get: () => this, set: () => this }; }
      static plugin() { return this; }
      static get Types() { return { Mixed: Object, ObjectId: class {} }; }
    }
    const mkModel = () => {
      const M = function () {};
      M.findOne = () => ({ lean: async () => null, sort: () => ({ lean: async () => [] }), exec: async () => null });
      M.find = () => ({ lean: async () => [] });
      M.updateOne = async () => ({});
      M.findOneAndUpdate = async () => ({});
      M.create = async () => ({});
      M.model = M;
      return M;
    };
    return { Schema, model: () => mkModel(), connect: async () => ({}), Types: { ObjectId: class {} }, connection: { readyState: 1 } };
  }
  return _orig.apply(this, arguments);
};

async function run() {
  console.log('--- Testing Channel & Group Status Fixes ---');

  // Test 1: Modules load without error
  try {
    const reg = () => {};
    require('../src/bot/cases/identidadeCanal')(reg);
    require('../src/bot/cases/perfilWhatsApp')(reg);
    require('../src/bot/cases/crescimento')(reg);
    console.log('✓ Test 1: Cases (identidadeCanal, perfilWhatsApp, crescimento) loaded cleanly with baileys-v6');
  } catch (e) {
    assert.fail('Test 1 failed: ' + e.message);
  }

  // Test 2: commandHandler ignores @newsletter messages
  const commandHandler = require('../src/bot/commandHandler');
  const mockSock = {
    sendMessage: async (jid, content) => {
      throw new Error('sendMessage should NOT be called for newsletter: ' + jid);
    },
    user: { id: '123456789:1@s.whatsapp.net' }
  };

  const channelMsg = {
    key: {
      remoteJid: '120363388990011@newsletter',
      fromMe: false,
      id: 'NEWSLETTER_MSG_123'
    },
    message: {
      conversation: 'É a rede kkkk'
    }
  };

  const handledChannel = await commandHandler.handle(mockSock, channelMsg);
  assert.strictEqual(handledChannel, false, 'commandHandler should return false for channel messages');
  console.log('✓ Test 2: Channel messages (@newsletter) ignored by commandHandler (no Aura response)');

  // Test 3: commandHandler ignores status@broadcast messages
  const statusMsg = {
    key: {
      remoteJid: 'status@broadcast',
      fromMe: false,
      id: 'STATUS_MSG_123'
    },
    message: {
      conversation: 'Status update text'
    }
  };

  const handledStatus = await commandHandler.handle(mockSock, statusMsg);
  assert.strictEqual(handledStatus, false, 'commandHandler should return false for status@broadcast');
  console.log('✓ Test 3: Status messages (status@broadcast) ignored by commandHandler');

  // Test 4: messageListener ignores @newsletter and status@broadcast
  const messageListener = require('../src/bot/messageListener');
  let deleteCalled = false;
  const mockSockListener = {
    sendMessage: async (jid, content) => {
      if (content && content.delete) {
        deleteCalled = true;
      }
    },
    groupMetadata: async (jid) => {
      return {
        id: jid,
        participants: [
          { id: '244900000001@s.whatsapp.net', admin: 'superadmin' },
          { id: '244900000002@s.whatsapp.net', admin: null },
          { id: '123456789@s.whatsapp.net', admin: 'admin' }
        ]
      };
    },
    user: { id: '123456789:0@s.whatsapp.net' }
  };

  // Channel message upsert should return early
  await messageListener.onUpsert(mockSockListener, {
    messages: [channelMsg]
  });
  assert.strictEqual(deleteCalled, false, 'Channel message should not trigger deletion or processing in messageListener');
  console.log('✓ Test 4: Channel message ignored in messageListener.onUpsert');

  // Test 5: Admin group status should NOT be deleted
  const groupJid = '120363000000000000@g.us';
  messageListener.antiStatusCache.add(groupJid);

  const adminGroupStatusMsg = {
    key: {
      remoteJid: groupJid,
      participant: '244900000001@s.whatsapp.net',
      fromMe: false,
      id: 'STATUS_ADMIN_123'
    },
    message: {
      groupStatusMessageV2: {
        caption: 'Admin status update'
      }
    }
  };

  deleteCalled = false;
  await messageListener.onUpsert(mockSockListener, {
    messages: [adminGroupStatusMsg]
  });
  assert.strictEqual(deleteCalled, false, 'Admin group status message should NOT be deleted by messageListener');
  console.log('✓ Test 5: Admin group status NOT deleted (prevents infinite spinning black screen)');

  // Test 6: Non-admin group status SHOULD be deleted if anti-status is active and bot is admin
  const nonAdminGroupStatusMsg = {
    key: {
      remoteJid: groupJid,
      participant: '244900000002@s.whatsapp.net',
      fromMe: false,
      id: 'STATUS_MEMBER_123'
    },
    message: {
      groupStatusMessageV2: {
        caption: 'Member status update'
      }
    }
  };

  deleteCalled = false;
  await messageListener.onUpsert(mockSockListener, {
    messages: [nonAdminGroupStatusMsg]
  });
  assert.strictEqual(deleteCalled, true, 'Non-admin group status message should be deleted when anti-status is enabled and bot is admin');
  console.log('✓ Test 6: Non-admin group status is deleted as expected when anti-status is active');

  console.log('\n--- ALL CHANNEL & STATUS TESTS PASSED (6/6) ---');
  process.exit(0);
}

run().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
