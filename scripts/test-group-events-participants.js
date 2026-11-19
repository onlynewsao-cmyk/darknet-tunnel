#!/usr/bin/env node
/**
 * v11.2.3 — group-participants.update com OBJECTOS Baileys
 * (regressão: add/remove sem welcome/goodbye)
 */
'use strict';
process.env.MONGODB_URI = '';
const assert = require('assert');
const Module = require('module');
const _orig = Module.prototype.require;

let _gs = {
  groupJid: '120363TEST@g.us',
  // Este suite exercita avisos ligados; a licença activa torna-os elegíveis.
  isHosted: true,
  hostedUntil: new Date(Date.now() + 60_000),
  welcomeEnabled: true,
  goodbyeEnabled: true,
  welcome2: false,
  welcm3: false,
  x9: true,
  customWelcomeMsg: 'OI {user} no {grupo}',
  customGoodbyeMsg: 'TCHAU {user} de {grupo}',
};

Module.prototype.require = function (id) {
  const s = String(id);
  if (s === 'mongoose' || s.endsWith('/mongoose')) {
    const Sch = function () { return { index() { return this; } }; };
    Sch.Types = { Mixed: Object };
    return { Schema: Sch, model: () => ({}), models: {}, connect: async () => ({}) };
  }
  if (s.endsWith('GroupSettings') || s.endsWith('models/GroupSettings')) {
    return {
      findOne: () => ({ lean: async () => ({ ..._gs }), catch: async () => null }),
      create: async (d) => d,
    };
  }
  if (s.endsWith('botConfigCache')) {
    // Este suite exercita avisos explicitamente ligados no grupo; o default
    // real é OFF e é coberto pelo teste de defaults/migração.
    return { get: async (k, d) => (k === 'welcome_image_enabled' ? false : k === 'welcome_enabled' ? true : d), set: async () => {} };
  }
  if (s.endsWith('changeThemes')) {
    return { getTheme: () => ({ name: 'dark', emoji: '🕸️', icon: '🕸️', vibe: 'x', frame: ['╭','╮','╰','╯','─','│'], bullet: '•' }) };
  }
  if (s.endsWith('welcomeImage')) return { generateWelcomeImage: async () => null };
  if (s.endsWith('welcomeArt')) return { artCard: async () => null, artGif: async () => null };
  if (s.endsWith('antiFoba')) return { onJoin: async () => [] };
  if (s.endsWith('autoApresentar')) return { onParticipantsUpdate: async () => {} };
  if (s.endsWith('liveBroadcaster')) return { groupEvent: () => {} };
  if (s.endsWith('GroupMemberActivity') || s.endsWith('models/GroupMemberActivity')) {
    return {
      findOne: () => ({
        sort: () => ({ lean: async () => null, catch: async () => null }),
        lean: async () => null,
        catch: async () => null,
      }),
    };
  }
  if (s.endsWith('Economy') || s.endsWith('models/Economy')) {
    return { findOne: () => ({ lean: async () => null, catch: async () => null }) };
  }
  if (s.endsWith('/config') || s.endsWith('src/config')) {
    return { bot: { name: 'DARK BOT', prefix: '!' }, owner: { name: 'Dark', number: '244900000' } };
  }
  return _orig.apply(this, arguments);
};

const sent = [];
const lidMap = new Map([
  ['991991991@lid', '244701991991@s.whatsapp.net'],
  ['992992992@lid', '244702992992@s.whatsapp.net'],
  ['993993993@lid', '244703993993@s.whatsapp.net'],
]);
const sock = {
  user: { id: '999:1@s.whatsapp.net', lid: '999@lid' },
  signalRepository: { lidMapping: { getPNForLID: async (lid) => lidMap.get(lid) || '' } },
  groupMetadata: async () => ({
    subject: 'Grupo Teste',
    participants: [
      { id: '111@s.whatsapp.net', admin: 'superadmin' },
      { id: '222@s.whatsapp.net' },
      { id: '999@s.whatsapp.net', admin: 'admin' },
    ],
  }),
  profilePictureUrl: async () => null,
  groupParticipantsUpdate: async () => ({}),
  sendMessage: async (jid, c) => { sent.push({ jid, ...c }); return { key: { id: 'k' } }; },
};

(async () => {
  console.log('=== normalizeParticipant + handle com OBJECTOS ===\n');
  // fresh module
  delete require.cache[require.resolve('../src/bot/groupEvents')];
  const ge = require('../src/bot/groupEvents');

  // 1) normalize
  const a = ge.normalizeParticipant('244912345678@s.whatsapp.net');
  assert.strictEqual(a.number, '244912345678');
  assert.ok(a.jid.includes('244912345678'));
  console.log('✔ string legacy ok');

  const b = ge.normalizeParticipant({
    id: '1234567890@lid',
    phoneNumber: '244999887766@s.whatsapp.net',
    lid: '1234567890@lid',
  });
  assert.strictEqual(b.number, '244999887766');
  assert.ok(b.pnJid.endsWith('@s.whatsapp.net'));
  assert.ok(b.jid.includes('244999887766') || b.pnJid.includes('244999887766'));
  console.log('✔ object Baileys (id=lid + phoneNumber) ok');

  const c = ge.normalizeParticipant({ id: '244111222333@s.whatsapp.net', admin: null });
  assert.strictEqual(c.number, '244111222333');
  console.log('✔ object com id PN ok');

  const lidPuro = ge.normalizeParticipant('991991991@lid');
  assert.strictEqual(lidPuro.number, '', 'LID nunca vira número');
  assert.strictEqual(lidPuro.pnJid, '', 'LID sem mapa não fabrica PN');
  const lidResolvido = await ge.resolveParticipant(sock, '991991991@lid');
  assert.strictEqual(lidResolvido.number, '244701991991');
  assert.strictEqual(lidResolvido.pnJid, '244701991991@s.whatsapp.net');
  console.log('✔ LID puro não vaza; mapa Signal resolve PN quando existe');

  // 2) ADD com objecto → welcome
  sent.length = 0;
  ge._welDebug._ultimoWel.clear();
  ge._welDebug._comboWel.clear();
  await ge.handle(sock, {
    id: '120363TEST@g.us',
    action: 'add',
    participants: [
      { id: '999888777@lid', phoneNumber: '244555666777@s.whatsapp.net', lid: '999888777@lid' },
    ],
  });
  assert.ok(sent.length >= 1, 'devia enviar welcome, sent=' + sent.length);
  const wel = sent.find(s => /OI @244555666777 no Grupo Teste/.test(s.text || s.caption || ''));
  assert.ok(wel, 'welcome custom: ' + JSON.stringify(sent[0]));
  assert.ok((wel.mentions || []).some(m => String(m).includes('244555666777')), 'menção PN');
  console.log('✔ ADD object → welcome com número real + menção');

  // 3) X9 profissional no add
  const x9 = sent.find(s => /X9/i.test(s.text || '') && /Entrou/i.test(s.text || ''));
  assert.ok(x9, 'x9 no add: ' + JSON.stringify(sent.map(s => s.text)));
  assert.ok(/actividade|atividade/i.test(x9.text), 'x9 header profissional');
  assert.ok(/@244555666777/.test(x9.text), 'x9 menciona número');
  console.log('✔ X9 profissional anuncia entrada');

  // 4) REMOVE object → goodbye
  sent.length = 0;
  await ge.handle(sock, {
    id: '120363TEST@g.us',
    action: 'remove',
    participants: [
      { id: '999888777@lid', phoneNumber: '244555666777@s.whatsapp.net' },
    ],
  });
  assert.ok(sent.some(s => /TCHAU @244555666777 de Grupo Teste/.test(s.text || s.caption || '')), 'goodbye: ' + JSON.stringify(sent));
  console.log('✔ REMOVE object → goodbye');

  // 5) ADD string legacy ainda funciona
  sent.length = 0;
  ge._welDebug._ultimoWel.clear();
  await ge.handle(sock, {
    id: '120363TEST@g.us',
    action: 'add',
    participants: ['244123123123@s.whatsapp.net'],
  });
  assert.ok(sent.some(s => /OI @244123123123/.test(s.text || s.caption || '')), 'legacy string welcome');
  console.log('✔ ADD string legacy ok');

  // 5b) Evento que chega SÓ com @lid: usa PN mapeado, sem interpolar LID.
  sent.length = 0;
  ge._welDebug._ultimoWel.clear();
  await ge.handle(sock, {
    id: '120363TEST@g.us', action: 'add', participants: [{ id: '991991991@lid', lid: '991991991@lid', notify: 'Lia Mapeada' }],
  });
  const welMapeado = sent.find(s => /OI @244701991991 no Grupo Teste/.test(s.text || s.caption || ''));
  assert.ok(welMapeado, 'welcome com PN vindo do mapa: ' + JSON.stringify(sent));
  assert.ok(!/(?:^|[^0-9])991991991(?:$|[^0-9])/.test(welMapeado.text || welMapeado.caption || ''), 'LID não aparece no texto');
  const x9Mapeado = sent.find(s => /X9/.test(s.text || ''));
  assert.ok(x9Mapeado && /@244701991991/.test(x9Mapeado.text), 'X9 usa PN mapeado');
  console.log('✔ welcome/X9 com LID isolado usam PN real mapeado');

  // 5c) Sem mapeamento, o bot mantém a menção interna mas mostra nome/fallback honesto — nunca dígitos LID.
  sent.length = 0;
  ge._welDebug._ultimoWel.clear();
  await ge.handle(sock, {
    id: '120363TEST@g.us', action: 'add', participants: [{ id: '994994994@lid', lid: '994994994@lid', notify: 'Pessoa Privada' }],
  });
  const welSemPn = sent.find(s => /OI Pessoa Privada no Grupo Teste/.test(s.text || s.caption || ''));
  assert.ok(welSemPn, 'welcome sem PN usa nome: ' + JSON.stringify(sent));
  assert.ok(!/994994994/.test(welSemPn.text || welSemPn.caption || ''), 'nunca mostra dígitos do LID');
  const x9SemPn = sent.find(s => /X9/.test(s.text || ''));
  assert.ok(x9SemPn && !/994994994/.test(x9SemPn.text), 'X9 também não revela LID');
  console.log('✔ fallback sem mapeamento não revela LID');

  // 5d) Padrões globais novos: welcome e despedida marcam só o PN real.
  const originalWelcome = _gs.customWelcomeMsg;
  const originalGoodbye = _gs.customGoodbyeMsg;
  _gs.customWelcomeMsg = '';
  _gs.customGoodbyeMsg = '';
  sent.length = 0;
  ge._welDebug._ultimoWel.clear();
  await ge.handle(sock, {
    id: '120363TEST@g.us', action: 'add', participants: [{ id: '991991991@lid', lid: '991991991@lid', notify: 'Lia Mapeada' }],
  });
  const welcomePadrao = sent.find(s => /BEM-VINDO\(A\)/.test(s.text || s.caption || ''));
  assert.ok(welcomePadrao && /@244701991991/.test(welcomePadrao.text || welcomePadrao.caption || ''), 'welcome padrão: ' + JSON.stringify(sent));
  assert.deepStrictEqual(welcomePadrao.mentions, ['244701991991@s.whatsapp.net'], 'welcome marca o PN exacto');

  sent.length = 0;
  await ge.handle(sock, {
    id: '120363TEST@g.us', action: 'remove', participants: [{ id: '991991991@lid', lid: '991991991@lid', notify: 'Lia Mapeada' }],
  });
  const goodbyePadrao = sent.find(s => /ATÉ BREVE/.test(s.text || s.caption || ''));
  assert.ok(goodbyePadrao && /@244701991991/.test(goodbyePadrao.text || goodbyePadrao.caption || ''), 'despedida padrão: ' + JSON.stringify(sent));
  assert.deepStrictEqual(goodbyePadrao.mentions, ['244701991991@s.whatsapp.net'], 'despedida marca o PN exacto, nunca LID');

  sent.length = 0;
  await ge.handle(sock, {
    id: '120363TEST@g.us', action: 'remove', participants: [{ id: '994994994@lid', lid: '994994994@lid', notify: 'Pessoa Privada' }],
  });
  const goodbyeSemPn = sent.find(s => /ATÉ BREVE/.test(s.text || s.caption || ''));
  assert.ok(goodbyeSemPn && !/994994994/.test(goodbyeSemPn.text || goodbyeSemPn.caption || ''), 'despedida sem PN não revela LID');
  assert.deepStrictEqual(goodbyeSemPn.mentions, [], 'sem PN, não envia marcação LID');

  _gs.customWelcomeMsg = originalWelcome;
  _gs.customGoodbyeMsg = originalGoodbye;
  console.log('✔ padrões welcome/despedida fazem marcação PN correcta');

  // 6) bot add não dispara welcome de membro
  sent.length = 0;
  ge._welDebug._ultimoWel.clear();
  await ge.handle(sock, {
    id: '120363TEST@g.us',
    action: 'add',
    participants: [{ id: '999@s.whatsapp.net', phoneNumber: '999@s.whatsapp.net' }],
  });
  // Com default OFF, um evento/replay que parece adicionar o bot não faz
  // anúncio de trial, welcome, despedida nem X9 no grupo.
  assert.strictEqual(sent.length, 0, 'bot add silencioso: ' + JSON.stringify(sent));
  console.log('✔ bot adicionado → silencioso por padrão');

  // 7) resolveDisplayName + NOME no art (não número)
  const nome = await ge.resolveDisplayName(sock, {
    number: '244700700700',
    mentionJid: '244700700700@s.whatsapp.net',
    part: {
      number: '244700700700',
      pnJid: '244700700700@s.whatsapp.net',
      notify: 'maria silva',
      name: '',
      raw: { notify: 'maria silva' },
    },
    meta: { participants: [] },
  });
  assert.strictEqual(nome, 'Maria Silva');
  console.log('✔ resolveDisplayName usa notify (title-case)');

  const x9pro = ge.buildX9Text('promote', '244111', 'João');
  assert.ok(/Promovido/i.test(x9pro) && /\*João\*/.test(x9pro) && /@244111/.test(x9pro));
  assert.ok(!/^🕵️ X9:/.test(x9pro), 'não é o one-liner antigo');
  console.log('✔ buildX9Text profissional');

  // 7b) X9 deixa inequívocos alvo/beneficiado e autor em cada transição.
  const alvo = { number: '244701991991', displayName: 'Lia' };
  const autor = { number: '244702992992', displayName: 'Carlos' };
  const cenariosX9 = [
    ['add', /Entrou|adicionado/i, /Adicionado por/i],
    ['remove', /removid/i, /Removido por/i],
    ['promote', /Promoção/i, /Promovido por/i],
    ['demote', /Rebaixamento/i, /Rebaixado por/i],
  ];
  for (const [acao, esperado, autorRotulo] of cenariosX9) {
    const texto = ge.buildX9Text(acao, alvo, undefined, autor);
    assert.ok(esperado.test(texto), `${acao}: ação certa — ${texto}`);
    assert.ok(/@244701991991/.test(texto) && /@244702992992/.test(texto), `${acao}: alvo e autor — ${texto}`);
    assert.ok(autorRotulo.test(texto), `${acao}: autor rotulado — ${texto}`);
  }
  const saida = ge.buildX9Text('remove', alvo, undefined, alvo);
  assert.ok(/Saída voluntária/i.test(saida) && /@244701991991/.test(saida) && !/Removido por/i.test(saida));
  console.log('✔ X9 cobre entrada, saída, remoção, promoção e rebaixamento com actor/alvo');

  // 7c) O author vindo no evento chega ao X9 com resolução LID → PN.
  sent.length = 0;
  await ge.handle(sock, {
    id: '120363TEST@g.us', action: 'promote', author: '992992992@lid',
    participants: [{ id: '991991991@lid', lid: '991991991@lid', notify: 'Lia' }],
  });
  const x9Actor = sent.find(s => /Promoção/.test(s.text || ''));
  assert.ok(x9Actor && /@244701991991/.test(x9Actor.text) && /@244702992992/.test(x9Actor.text), 'X9 actor PN: ' + JSON.stringify(sent));
  assert.ok(/Promovido por/i.test(x9Actor.text));
  console.log('✔ event.author é mostrado no X9 de promoção');

  // 8) welcome2 passa NAME (não número) para artCard
  let artOpts = null;
  // re-mock welcomeArt via cache wipe + require patch
  Module.prototype.require = function (id) {
    const s = String(id);
    if (s.endsWith('welcomeArt')) {
      return {
        artCard: async (opts) => { artOpts = opts; return Buffer.alloc(3000, 1); },
        artGif: async () => null,
      };
    }
    return _orig.apply(this, arguments);
  };
  // force re-require path used by groupEvents — patch via on-the-fly:
  // groupEvents already loaded welcomeArt lazily inside onJoin; replace require cache
  const waPath = require.resolve('../src/bot/welcomeArt');
  require.cache[waPath] = {
    id: waPath, filename: waPath, loaded: true, exports: {
      artCard: async (opts) => { artOpts = opts; return Buffer.alloc(3000, 1); },
      artGif: async () => null,
    },
  };
  // also ensure GroupSettings etc still mocked — groupEvents already in cache with old requires
  // call onJoin path via handle with welcome2
  _gs.welcome2 = true;
  _gs.welcm3 = false;
  _gs.customWelcomeMsg = 'OI {user}';
  sent.length = 0;
  artOpts = null;
  ge._welDebug._ultimoWel.clear();
  await ge.handle(sock, {
    id: '120363TEST@g.us',
    action: 'add',
    participants: [{
      id: '555@lid',
      phoneNumber: '244700700700@s.whatsapp.net',
      notify: 'Ana Costa',
    }],
  });
  assert.ok(sent.some(s => s.image), 'welcome2 image sent');
  assert.ok(artOpts, 'artCard chamado: ' + JSON.stringify(artOpts));
  assert.strictEqual(artOpts.name, 'Ana Costa', 'art usa NOME não número: ' + JSON.stringify(artOpts));
  assert.ok(!/244700700700/.test(artOpts.name), 'nome não é o telefone');
  // caption default/custom sem moldura de tema
  const cap = sent.find(s => s.image)?.caption || '';
  assert.ok(!/╭━━|╰━━|> sombra|> x\b/.test(cap), 'caption sem frame/vibe: ' + cap);
  console.log('✔ welcome2 artCard recebe NOME + caption limpa');

  // Regressão do incidente: mesmo que flags antigas continuem ON, um grupo
  // sem trial/aluguel não recebe welcome/X9 nem acções automáticas.
  _gs.isHosted = false;
  _gs.hostedUntil = null;
  _gs.trialExpiresAt = null;
  sent.length = 0;
  ge._welDebug._ultimoWel.clear();
  await ge.handle(sock, {
    id: '120363TEST@g.us', action: 'add',
    participants: [{ id: '244800800800@s.whatsapp.net', notify: 'Grupo Livre' }],
  });
  assert.strictEqual(sent.length, 0, 'grupo sem serviço permanece silencioso: ' + JSON.stringify(sent));
  console.log('✔ grupo sem serviço: eventos opcionais ficam silenciosos');

  console.log('\n✅ group-events participants OK\n');
})().catch((e) => { console.error(e); process.exit(1); });
