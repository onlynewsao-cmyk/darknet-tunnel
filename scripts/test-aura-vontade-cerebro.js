'use strict';
/** v7.37 — vontade própria + cérebro ligado às funcionalidades + aprendizagem */
let ok = 0, fail = 0;
const check = (n, c, x = '') => { if (c) { ok++; console.log('  ✅', n); } else { fail++; console.log('  ❌', n, x); } };
const vont = require('../src/aura/auraVontade');
const cer = require('../src/aura/auraCerebro');

console.log('\n═══ VONTADE ═══');
vont.limpar();
check('sem histórico → saturação 0', vont.saturacao('g', '1') === 0);
for (let i = 0; i < 10; i++) vont.registar('g', '1', 'oi');
check('10× "oi" em 2 min → saturada', vont.saturacao('g', '1') >= 0.7, String(vont.saturacao('g', '1')));
let ign = 0; for (let i = 0; i < 200; i++) if (!vont.querResponder({ jid: 'g', num: '1', isGroup: true, mood: 'normal' }).responde) ign++;
check('pessoa saturada é ignorada na maioria das vezes', ign > 100, `ign=${ign}/200`);
let okDark = 0; for (let i = 0; i < 100; i++) if (vont.querResponder({ jid: 'pv', num: '9', isOwner: true, isGroup: false, perguntaDirecta: true }).responde) okDark++;
check('Dark em PV com pergunta → sempre responde', okDark === 100);
let calmo = 0; for (let i = 0; i < 200; i++) if (!vont.querResponder({ jid: 'g', num: '2', isGroup: false, mood: 'feliz', perguntaDirecta: true }).responde) calmo++;
check('pessoa nova, feliz, pergunta em PV → quase nunca ignora', calmo <= 2, `ign=${calmo}`);
let raiva = 0; for (let i = 0; i < 300; i++) if (!vont.querResponder({ jid: 'g', num: '3', isGroup: true, mood: 'com_raiva' }).responde) raiva++;
check('com raiva num grupo → ignora bastante', raiva > 80, `ign=${raiva}/300`);
const r1 = vont.interpretarResposta('[SILENCIO]');
check('[SILENCIO] → silêncio', r1.silencio && r1.texto === '');
const r2 = vont.interpretarResposta('[REAGIR:🙄]');
check('[REAGIR:🙄] só → silencio+reagir', r2.silencio && r2.reagir === '🙄');
const r3 = vont.interpretarResposta('Tá bom Dark, faço já. [REAGIR:🖤]');
check('texto + REAGIR → mantém texto', !r3.silencio && r3.reagir === '🖤' && r3.texto === 'Tá bom Dark, faço já.');
check('instrução menciona [SILENCIO]', /\[SILENCIO\]/.test(vont.instrucao({ isGroup: true, sat: 0.6 })));

console.log('\n═══ CÉREBRO ═══');
const fOwner = cer.ferramentasParaPrompt({ isOwner: true, isGroup: true });
const fFree = cer.ferramentasParaPrompt({ isOwner: false, isAdmin: false, isVip: false, isGroup: true });
check('dono vê ferramentas', fOwner.includes('[FAZ:') && fOwner.includes('cmd_play'));
check('dono vê acções de dono (modo_mudo, canal…)', /modo_mudo|canal_/.test(fOwner));
check('free não vê ban/promover', !/cmd_ban|cmd_promover/.test(fFree));
check('free ainda vê menu/ping', /cmd_menu|cmd_ping/.test(fFree));
check('free NÃO vê play (é VIP no bot)', !/cmd_play/.test(fFree));
check('lista cabe no prompt (≤ 3800)', fOwner.length <= 3800, String(fOwner.length));
const i1 = cer.interpretar('Toco já, Dark 🖤 [FAZ:cmd_play shakira waka waka] [APRENDI:o Dark gosta de Shakira]');
check('interpreta FAZ + arg', i1.acoes.length === 1 && i1.acoes[0].id === 'cmd_play' && i1.acoes[0].arg === 'shakira waka waka');
check('interpreta APRENDI', i1.factos[0] === 'o Dark gosta de Shakira');
check('texto limpo sem marcadores', i1.texto === 'Toco já, Dark 🖤');
const i2 = cer.interpretar('[FAZ:modo_mudo] [FAZ:canal_info] [FAZ:cmd_menu] ok');
check('máx. 2 acções', i2.acoes.length === 2);
const i3 = cer.interpretar('[APRENDI_GRUPO:aqui só se fala de futebol]');
check('interpreta APRENDI_GRUPO', i3.factosGrupo[0] === 'aqui só se fala de futebol' && i3.texto === '');

(async () => {
  // executarAcoes: permissões e caseHandler mock
  let corrido = null;
  const caseHandler = { runCase: async (nome, c) => { corrido = { nome, args: c.args }; return true; } };
  const base = { sock: {}, msg: {}, ctx: { remoteJid: 'g@g.us', isGroup: true, prefix: '!' }, texto: '', caseHandler, config: { bot: { prefix: '!' } } };
  let r = await cer.executarAcoes([{ id: 'cmd_ban', arg: '' }], { ...base, isOwner: false, isAdmin: false, isVip: false });
  check('free NÃO consegue cmd_ban', r.executadas === 0 && corrido === null);
  r = await cer.executarAcoes([{ id: 'cmd_play', arg: 'shakira' }], { ...base, isOwner: false, isAdmin: false, isVip: false });
  check('free NÃO consegue cmd_play (VIP)', r.executadas === 0);
  r = await cer.executarAcoes([{ id: 'cmd_play', arg: 'shakira' }], { ...base, isOwner: false, isAdmin: false, isVip: true });
  check('VIP consegue cmd_play (via caseHandler)', r.executadas === 1 && corrido?.nome === 'play' && corrido.args[0] === 'shakira');
  r = await cer.executarAcoes([{ id: 'cmd_eval', arg: '1+1' }], { ...base, isOwner: true });
  check('cmd fora da lista (eval) nunca corre', r.executadas === 0);
  r = await cer.executarAcoes([{ id: 'inexistente_xyz', arg: '' }], { ...base, isOwner: true });
  check('id inventado é ignorado', r.executadas === 0);

  // voz: limparParaTts tira marcadores novos
  const voz = require('../src/aura/auraVoz');
  check('TTS não lê marcadores', !/\[/.test(voz.limparParaTts('Olá [FAZ:cmd_play x] [APRENDI:y] tudo bem')));

  // handler integrado
  const fs = require('fs'); const src = fs.readFileSync('src/bot/commandHandler.js', 'utf8');
  check('handler: vontade após deveResponder', /vont\.querResponder\(/.test(src));
  check('handler: cérebro no prompt', /cer\.ferramentasParaPrompt\(/.test(src) && /cer\.saberParaPrompt\(/.test(src));
  check('handler: interpreta SILENCIO/FAZ/APRENDI', /vont\.interpretarResposta\(finalAnswer\)/.test(src) && /cer\.executarAcoes\(/.test(src) && /cer\.aprender\(/.test(src));
  console.log(`\n${fail ? '💥' : '🎉'} AURA VONTADE+CÉREBRO: ${ok} OK / ${fail} FALHOU\n`);
  process.exit(fail ? 1 : 0);
})();
