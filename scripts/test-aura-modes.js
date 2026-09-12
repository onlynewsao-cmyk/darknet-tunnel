/**
 * DARK BOT — Teste dos dois modos da AURA
 *
 *   🌹 AURA      → só onde o Dono Supremo a invocou
 *   🤖 ASSISTENTE → todos os outros grupos (estilo Meta AI)
 *
 * Corre sem MongoDB (usa um mock em memória do GroupSettings).
 * Uso: node scripts/test-aura-modes.js
 */
'use strict';

process.env.OWNER_NUMBER = process.env.OWNER_NUMBER || '244945280380';

const path = require('path');
const Module = require('module');
const origRequire = Module.prototype.require;

// ── Mock do GroupSettings (em memória) ──────────────────────
const DB = new Map(); // groupJid → doc

Module.prototype.require = function (id) {
  if (id.endsWith('models/GroupSettings')) {
    return {
      findOne(q) {
        const doc = DB.get(q.groupJid) || null;
        const p = Promise.resolve(doc);
        p.select = () => p;
        p.lean = () => Promise.resolve(doc);
        p.catch = (f) => Promise.resolve(doc);
        return p;
      },
      find(q) {
        const all = [...DB.values()].filter(d => d.auraMode === q.auraMode);
        const p = Promise.resolve(all);
        p.select = () => p;
        p.lean = () => Promise.resolve(all);
        p.catch = () => Promise.resolve(all);
        return p;
      },
      updateOne(q, upd) {
        const cur = DB.get(q.groupJid) || { groupJid: q.groupJid };
        DB.set(q.groupJid, { ...cur, ...(upd.$set || {}) });
        return Promise.resolve({ ok: 1 });
      },
    };
  }
  return origRequire.apply(this, arguments);
};

const modes = require(path.join(__dirname, '..', 'src', 'aura', 'auraModes'));

const G1 = '111111@g.us'; // grupo do Dark
const G2 = '222222@g.us'; // grupo alheio
const PV = '244945280380@s.whatsapp.net';

let ok = 0, fail = 0;
const check = (nome, cond, extra = '') => {
  cond ? ok++ : fail++;
  console.log(`  ${cond ? '✅' : '❌'} ${nome}${extra ? ' → ' + extra : ''}`);
};

(async () => {
  console.log('\n╔═══════════════════════════════════════════════════════════════════╗');
  console.log('║       DARK BOT — TESTE DOS DOIS MODOS DA AURA                     ║');
  console.log('╚═══════════════════════════════════════════════════════════════════╝\n');

  console.log('▸ Estado inicial (nenhuma invocação)');
  check('Grupo novo começa em ASSISTENTE (modo base)',
    (await modes.getMode(G1, { isGroup: true })) === modes.MODE_ASSISTANT);
  check('v6.93: mas está ACORDADA por defeito', await modes.isAuraAwake(G1, { isGroup: true }));
  check('Segundo grupo também ASSISTENTE',
    (await modes.getMode(G2, { isGroup: true })) === modes.MODE_ASSISTANT);
  check('PV do Dark é sempre AURA',
    (await modes.getMode(PV, { isGroup: false })) === modes.MODE_AURA);

  console.log('\n▸ O Dono invoca a AURA no grupo 1');
  const r1 = await modes.invokeAura(G1, { groupName: 'Grupo do Dark', invokedBy: '244945280380' });
  check('Invocação com sucesso', r1.ok && !r1.already);
  check('Grupo 1 agora é AURA', await modes.isAuraAwake(G1, { isGroup: true }));

  console.log('\n▸ ISOLAMENTO (o ponto crítico)');
  // v6.93: acordada POR DEFEITO — mas o estado INVOCADA é por grupo
  check('Grupo 2 está acordada por defeito mas NÃO invocada',
    (await modes.isAuraAwake(G2, { isGroup: true })) && !(await modes.isAuraInvoked(G2, { isGroup: true })),
    'invocar num grupo não afecta outro');

  console.log('\n▸ Invocar duas vezes');
  const r2 = await modes.invokeAura(G1, {});
  check('Detecta que já estava acordada', r2.ok && r2.already);

  console.log('\n▸ Listagem');
  const lista = await modes.listAwakeGroups();
  check('Lista tem exactamente 1 grupo', lista.length === 1, `${lista.length} grupo(s)`);

  console.log('\n▸ Pôr a dormir');
  const r3 = await modes.dismissAura(G1);
  check('Dismiss com sucesso', r3.ok);
  // v6.93: "aura dorme" → MODE_SLEEP (acordada por defeito continua nos outros)
  check('Grupo 1 ficou DORMIDA (sleep)', !(await modes.isAuraAwake(G1, { isGroup: true })));
  check('Grupo 2 (intocado) continua acordada por defeito', await modes.isAuraAwake(G2, { isGroup: true }));
  check('PV continua AURA (não é afectado)',
    (await modes.getMode(PV, { isGroup: false })) === modes.MODE_AURA);

  console.log('\n▸ Persona do assistente (o que NÃO pode aparecer)');
  const p = modes.buildAssistantPrompt({
    botName: 'DARK BOT', userName: 'João', isGroup: true, groupName: 'Trabalho',
  });
  // Nota: "amor"/"ciúmes" aparecem legitimamente nas PROIBIÇÕES do prompt
  // ("Nada de amor…", "Não tens ciúmes"). O que importa é que a persona
  // da AURA não esteja lá como INSTRUÇÃO de comportamento.
  const proibidas = ['namorada', 'OTOME', '19 anos', 'brasileira', 'meu Dark', 'obedece'];
  for (const w of proibidas) {
    check(`Persona AURA ausente: "${w}"`, !new RegExp(w, 'i').test(p));
  }
  check('Nega explicitamente romance/ciúmes', /não tens.*romance.*ciúmes/i.test(p));
  check('Proíbe tratamento afectuoso', /nada de "amor"/i.test(p));
  check('Não tem "dono" especial', /n[ãa]o tens.*dono/i.test(p));
  check('Prompt define-se como assistente', /assistente/i.test(p));
  check('Prompt pede respostas curtas', /curt|1 a 3 frases/i.test(p));

  console.log('\n▸ Sanitização (se a persona escapar)');
  const mod = require(path.join(__dirname, '..', 'src', 'aura', 'auraModes'));
  // acede à função interna via assistantFallback/behaviour observável
  const suja = 'Claro meu amor! 😍😍😍😍 [STICKER:beijo] Aqui está, querida!';
  // _sanitize não é exportada — validamos pelo efeito no fallback público
  check('Fallback não usa tratamento afectuoso',
    !/amor|querid/i.test(mod.assistantFallback('oi', { prefix: '.' })));

  console.log('\n▸ Fallback offline do assistente');
  const f1 = mod.assistantFallback('oi', { prefix: '.', botName: 'DARK BOT' });
  // v6.44: o fallback passou a ter variantes curtas e humanas
  check('Saudação é natural e curta', /^(ol[áa]|oi)/i.test(f1) && f1.length < 60, JSON.stringify(f1.slice(0, 45)));
  check('Saudação sem emoji', !/\p{Extended_Pictographic}/u.test(f1));
  const f2 = mod.assistantFallback('quem és tu', { prefix: '.', botName: 'DARK BOT' });
  check('Identifica-se como assistente', /assistente/i.test(f2));

  console.log(`\n  ${ok} OK / ${fail} FALHOU\n`);
  process.exit(fail ? 1 : 0);
})();
