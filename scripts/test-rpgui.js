'use strict';
/**
 * v7.90 — RPG UI: botões ✅/❌, listas de escolha, fallback escrito
 * e a confirmação de refazer personagem. Tudo sem Mongo/Baileys real.
 */
const Module = require('module');
const orig = Module.prototype.require;

let OUT = [];        // textos capturados (sendMessage + corpos interactivos)
let BTNS = [];       // ids extraídos dos botões da última msg interactiva
let ROWS = [];       // rowIds extraídos da última lista
let ENGINE = null;   // mock v7.90 do rpg/engine (peekPlayer etc.)

const sock = {
  user: { id: '244949@s.whatsapp.net' },
  sendMessage: async (j, c) => { const t = c?.text || c?.caption || ''; if (t) OUT.push(t); return { key: {} }; },
  relayMessage: async (j, m) => {
    const im = m?.viewOnceMessage?.message?.interactiveMessage || m?.interactiveMessage;
    OUT.push(im?.body?.text || '[INTERACTIVO]');
    BTNS = []; ROWS = [];
    for (const b of im?.nativeFlowMessage?.buttons || []) {
      try {
        const p = JSON.parse(b.buttonParamsJson || '{}');
        if (p.id) BTNS.push(p.id);
        for (const s of p.sections || []) for (const r of s.rows || []) ROWS.push(r.id);
      } catch {}
    }
    return {};
  },
};
const msg = { key: { remoteJid: '1@g.us', participant: '244001@s.whatsapp.net', id: 'X' }, message: { conversation: 'oi' } };
const ctx = { remoteJid: '1@g.us', senderNumber: '244001', senderJid: '244001@s.whatsapp.net', isGroup: true };
const ctxOutro = { ...ctx, senderNumber: '244999', senderJid: '244999@s.whatsapp.net' };

// ── mocks dos módulos pesados ──
Module.prototype.require = function (id) {
  if (id === '../hotCache') return { getGroupSettings: async () => GLOBAL_GS || null };
  if (id === './community') return { loadState: async () => ({ communityJid: null }), isCommunityGroup: () => false };
  if (id.endsWith('models/RPGPlayer')) return { findOne: async () => GLOBAL_CHAR || null };
  if (id === './engine' || id === '../rpg/engine') return ENGINE || orig.apply(this, arguments);
  if (id.endsWith('/config') || id === '../../config') return { bot: { name: 'DARK BOT', prefix: '!' }, owner: { number: '244900000001' } };
  return orig.apply(this, arguments);
};
let GLOBAL_GS = null, GLOBAL_CHAR = null;

const ui = require('../src/bot/rpg/ui');
const gate = require('../src/bot/rpg/gate');

let ok = 0, fail = 0;
const t = (n, c, x = '') => { if (c) { ok++; console.log('  ✅', n); } else { fail++; console.log('  ❌', n, String(x).slice(0, 90)); } };

(async () => {
  console.log('\n═══ 1. CONFIRMAR/NEGAR (botões) ═══');
  let efeito = 0, cancel = 0;
  OUT = [];
  await ui.confirmar(sock, msg, ctx, {
    titulo: '🧪 TESTE', linhas: ['linha'],
    onSim: async () => { efeito++; }, onNao: async () => { cancel++; },
  });
  const pend = ui.pendentes().get('244001');
  t('pendente criado com 2 botões', !!pend && BTNS.length === 2, JSON.stringify(BTNS));
  t('ids são RPGSIM_/RPGNAO_', /^RPGSIM_/.test(BTNS[0] || '') && /^RPGNAO_/.test(BTNS[1] || ''), BTNS.join(','));
  t('fallback escrito anunciado no corpo', OUT.join(' ').includes('!rpgsim'), OUT[0]?.slice(0, 60));

  await ui.resolver(sock, msg, ctx, BTNS[0]);
  t('clique SIM executa 1×', efeito === 1 && cancel === 0, `efeito=${efeito}`);
  await ui.resolver(sock, msg, ctx, BTNS[0]);
  t('clique SIM repetido não duplica', efeito === 1, `efeito=${efeito}`);

  OUT = [];
  await ui.confirmar(sock, msg, ctx, { titulo: '🧪 T2', onSim: async () => { efeito++; }, onNao: async () => { cancel++; } });
  await ui.resolver(sock, msg, ctx, BTNS[1]);
  t('clique NÃO executa o cancelamento', cancel === 1 && efeito === 1, `cancel=${cancel}`);

  OUT = [];
  await ui.confirmar(sock, msg, ctx, { titulo: '🧪 T3', onSim: async () => { efeito++; }, onNao: async () => {} });
  await ui.resolver(sock, msg, ctxOutro, BTNS[0]); // token era do 244001
  t('token de outra pessoa recusado', efeito === 1 && OUT.join(' ').includes('expirou'), OUT.join(' ').slice(0, 70));

  console.log('\n═══ 2. LISTA DE ESCOLHA ═══');
  OUT = []; let escolhido = -1;
  await ui.escolher(sock, msg, ctx, {
    titulo: 'CAMINHO', subtitulo: 'DESTINOS', linhas: ['Para onde vais?'],
    opcoes: [{ label: 'Floresta', desc: 'próxima' }, { label: 'Caverna', desc: 'perigosa' }, { label: 'Aldeia' }],
    onEscolha: async (idx) => { escolhido = idx; },
  });
  t('lista tem 3 rows clicáveis', ROWS.length === 3 && ROWS.every(r => /^RPGSEL_\w+_\d$/.test(r)), ROWS.join(','));
  await ui.resolver(sock, msg, ctx, ROWS[1]);
  t('toque na 2.ª opção executa', escolhido === 1, `idx=${escolhido}`);

  OUT = []; escolhido = -1;
  ui.pendentes().set('244001', { tok: 'zzz', tipo: 'sel', expira: Date.now() + 60000, dados: { onEscolha: async (i) => { escolhido = i; }, n: 3 } });
  await ui.escolherPorTexto(sock, msg, ctx, '9');
  t('número fora da lista avisa', escolhido === -1 && /inválida/i.test(OUT.join(' ')), OUT.join(' ').slice(0, 60));
  await ui.escolherPorTexto(sock, msg, ctx, '2');
  t('!rpgescolher 2 funciona', escolhido === 1, `idx=${escolhido}`);
  OUT = [];
  await ui.decidirPorTexto(sock, msg, ctx, true);
  t('!rpgsim sem pendente avisa', OUT.join(' ').includes('pendentes'), OUT.join(' ').slice(0, 60));

  console.log('\n═══ 3. GATE: comandos escritos são LIVRES ═══');
  GLOBAL_GS = {}; GLOBAL_CHAR = null; // sem modorpg, sem char
  t('rpgnao passa o gate', (await gate.verificar('rpgnao', { isGroup: true, remoteJid: '1@g.us', senderNumber: '244001', isOwner: false, pushName: 'T' })) === null);
  t('rpgsim passa o gate', (await gate.verificar('rpgsim', { isGroup: true, remoteJid: '1@g.us', senderNumber: '244001', isOwner: false, pushName: 'T' })) === null);
  t('rpgescolher passa o gate', (await gate.verificar('rpgescolher', { isGroup: true, remoteJid: '1@g.us', senderNumber: '244001', isOwner: false, pushName: 'T' })) === null);

  console.log('\n═══ 4. REFAZER PERSONAGEM — confirma em vez de apagar ═══');
  Module.prototype.require = function (id) {
    if (id === './engine') return {
      peekPlayer: async () => ({ started: true, name: 'Shin', race: 'elfo', class: 'mago', level: 3 }),
      getPlayer: async () => { throw new Error('NÃO devia criar antes de confirmar'); },
      ORIGINS: {},
      RACES: { humano: { emoji: '🧑', desc: 'equilibrado' }, elfo: { emoji: '🧝', desc: 'ágil' } },
      CLASSES: { guerreiro: { emoji: '⚔️', desc: 'força' }, mago: { emoji: '🪄', desc: 'magia' } },
    };
    if (id === '../renderEngine') return { getTheme: async () => null };
    if (id === '../../config') return { bot: { name: 'DARK BOT' } };
    return orig.apply(this, arguments);
  };
  delete require.cache[require.resolve('../src/bot/rpg/createFlow')];
  const flow = require('../src/bot/rpg/createFlow');
  OUT = []; BTNS = [];
  await flow.start({ sock, msg, ctx, args: [] });
  t('com char: pergunta antes de apagar', OUT.join(' ').includes('JÁ EXISTE') && BTNS.some(b => /^RPGSIM_/.test(b)), OUT.join(' ').slice(0, 70));
  OUT = [];
  await ui.decidirPorTexto(sock, msg, ctx, true); // "@!rpgsim"
  t('confirmação reinicia pelo pedido de nome', /CRIAÇÃO DE PERSONAGEM|rpgnome/i.test(OUT.join(' ')), OUT.join(' ').slice(0, 70));

  console.log(`\n${fail ? '💥' : '🎉'} RPG-UI: ${ok} OK / ${fail} FALHOU\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('💥 EXCEPÇÃO:', e); process.exit(1); });
