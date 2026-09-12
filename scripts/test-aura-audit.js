/**
 * DARK BOT — Auditoria da AURA
 *
 * Verifica os problemas encontrados na revisão v6.44:
 *   1. Funções que rebentavam com argumentos em falta
 *   2. Mensagens de sistema ("❌ IA sem chave") a chegar ao utilizador
 *   3. Assistente com falas de robô / emojis
 *   4. Compreensão de linguagem natural (sem comandos)
 *   5. Memória persistente
 *
 * Uso: node scripts/test-aura-audit.js
 */
'use strict';

const path = require('path');
const AURA = path.join(__dirname, '..', 'src', 'aura');

let ok = 0, fail = 0;
const check = (nome, cond, extra = '') => {
  cond ? ok++ : fail++;
  console.log(`  ${cond ? '✅' : '❌'} ${nome}${extra ? ' → ' + extra : ''}`);
};

(async () => {
  console.log('\n╔═══════════════════════════════════════════════════════════════════╗');
  console.log('║            DARK BOT — AUDITORIA DA AURA                           ║');
  console.log('╚═══════════════════════════════════════════════════════════════════╝\n');

  // ── 1. Robustez das funções ────────────────────────────────
  console.log('▸ Funções não rebentam sem argumentos');
  const A = require(path.join(AURA, 'auraHuman'));
  const semSock = ['auraThinkOutLoud', 'auraFunFact', 'auraSingSong', 'auraIndirect', 'auraProactive'];
  for (const fn of semSock) {
    let sobreviveu = false;
    try { const r = await A[fn](); sobreviveu = r && r.success === false; } catch { sobreviveu = false; }
    check(`${fn}() devolve erro em vez de rebentar`, sobreviveu);
  }

  // ── 2. Funções puras devolvem valores válidos ──────────────
  console.log('\n▸ Funções de apoio');
  check('detectCountry(244…) = Angola', A.detectCountry('244945280380')?.code === 'AO');
  check('detectCountry(55…) = Brasil',  A.detectCountry('5511999998888')?.code === 'BR');
  check('detectDarkAttack detecta insulto', A.detectDarkAttack('o dark é um lixo') === true);
  check('detectDarkAttack ignora frase normal', A.detectDarkAttack('bom dia pessoal') === false);
  check('getMood devolve objecto', typeof A.getMood()?.mood === 'string');
  check('getDarkDefense devolve texto', String(A.getDarkDefense() || '').length > 5);
  check('loadPerson existe (memória persistente)', typeof A.loadPerson === 'function');

  // ── 3. Intenção em linguagem natural ───────────────────────
  console.log('\n▸ A AURA entende (sem comandos)');
  const I = require(path.join(AURA, 'auraIntent'));
  const O = { isOwner: true, isGroup: true, isReplyToBot: false };
  const casos = [
    ['aura, acorda', 'wake'], ['aura vem cá', 'wake'], ['aura volta a ser tu', 'wake'],
    ['aura, dorme', 'sleep'], ['aura sai daqui', 'sleep'], ['aura modo profissional', 'sleep'],
    ['aura tás aí?', 'status'],
    // ambíguos → não deve agir
    ['aura', null], ['que aura tu tens', null], ['mede minha aura', null],
    ['bom dia pessoal', null],
  ];
  for (const [txt, esp] of casos) {
    check(`"${txt}" → ${esp || 'nada'}`, I.detectAuraIntent(txt, O) === esp);
  }
  check('Membro não controla a AURA',
    I.detectAuraIntent('aura acorda', { isOwner: false, isGroup: true }) === null);
  check('No PV não há invocação (já está acordada)',
    I.detectAuraIntent('aura acorda', { isOwner: true, isGroup: false }) === null);

  // ── 4. Assistente não parece robô ──────────────────────────
  console.log('\n▸ Assistente fala como pessoa');
  const M = require(path.join(AURA, 'auraModes'));
  const prompt = M.buildAssistantPrompt({ botName: 'DARK BOT', userName: 'João', isGroup: true });
  check('Prompt proíbe "sou um assistente virtual"', /NUNCA digas/i.test(prompt));
  check('Prompt proíbe emojis', /SEM emojis/i.test(prompt));
  check('Prompt proíbe frases de call-center', /call-center/i.test(prompt));

  // fallback offline não deve ter emojis nem falas de robô
  const fb = M.assistantFallback('oi', { prefix: '.', botName: 'DARK BOT' });
  check('Fallback sem emoji', !/\p{Extended_Pictographic}/u.test(fb), JSON.stringify(fb.slice(0, 40)));
  check('Fallback sem "assistente virtual"', !/assistente virtual/i.test(fb));

  // ── 5. Mensagens de sistema nunca chegam ao utilizador ─────
  console.log('\n▸ Erros do motor não vazam para o chat');
  const src = require('fs').readFileSync(path.join(AURA, 'auraModes.js'), 'utf8');
  const src2 = require('fs').readFileSync(path.join(AURA, 'auraHuman.js'), 'utf8');
  check('auraModes filtra qualquer "❌"', /startsWith\('❌'\)/.test(src));
  check('auraHuman filtra qualquer "❌"', /startsWith\('❌'\)/.test(src2));

  // ── 6. Documentação honesta do código morto ────────────────
  console.log('\n▸ Código não utilizado está assinalado');
  check('Funções mortas têm aviso de auditoria', /NÃO são chamadas por/i.test(src2));

  // ── 7. Variáveis inexistentes no caminho da resposta ───────
  // v6.52: `!isSilenced` (variável que não existe) rebentava a
  // resposta da AURA em TODAS as mensagens — ela ficava muda e o
  // erro só aparecia no log como "[Aura] isSilenced is not defined".
  // Os testes com mocks não apanharam isto porque o erro estava
  // depois da geração da resposta.
  console.log('\n▸ Caminho da resposta sem variáveis fantasma');
  const chSrc = require('fs').readFileSync(path.join(__dirname, '..', 'src', 'bot', 'commandHandler.js'), 'utf8');
  // ignora comentários (// …) para não apanhar a nota histórica
  const semComentarios = chSrc.split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');
  const usoSolto = /(?<!aura\.)(?<![\w.])isSilenced\b(?!\s*\()/.test(semComentarios);
  check('isSilenced nunca usado como variável solta', !usoSolto,
    usoSolto ? 'encontrado uso solto' : 'só via aura.isSilenced()');

  // ── 8. Entrega no PV é verificada ──────────────────────────
  // v6.52: o ownerPv construía o JID do .env e o .catch engolia o
  // erro — o bot confirmava "enviado no PV" e não chegava nada.
  console.log('\n▸ Entrega no PV é confirmada, não assumida');
  const p18src = require('fs').readFileSync(path.join(__dirname, '..', 'src', 'bot', 'portal18.js'), 'utf8');
  check('ownerPv devolve true/false', /return true;/.test(p18src) && /return false;/.test(p18src));
  check('ownerPv tenta o JID real do chamador', /ctx\?\.senderJid/.test(p18src));
  check('ownerPv memoriza o JID que funcionou', /_pvJidOk/.test(p18src));

  const ncSrc = require('fs').readFileSync(path.join(__dirname, '..', 'src', 'bot', 'nativeCommands.js'), 'utf8');
  check('Avisa no grupo se o PV falhar', /pvOk === false/.test(ncSrc) && /Não consegui enviar no teu PV/.test(ncSrc));

  // ── 9. Bugs do diálogo real reportado (v6.53) ──────────────
  console.log('\n▸ Bugs do diálogo reportado');

  // "aura dormi" (sem o 'e') não era reconhecido
  const formasDormir = ['aura dormi', 'aura dorme', 'aura durma', 'aura vai dormir'];
  const falhas = formasDormir.filter(t => I.detectAuraIntent(t, O) !== 'sleep');
  check('Reconhece "dormi/dorme/durma"', falhas.length === 0, falhas.join(', ') || `${formasDormir.length}/4`);

  // LID: no PV o senderNumber saía errado e ela rejeitava o Dono
  const { getSenderInfo } = require(path.join(__dirname, '..', 'src', 'bot', 'commandHandler'));
  const pvLid = getSenderInfo({ key: { remoteJid: '18923@lid', remoteJidAlt: '244945280380@s.whatsapp.net' } });
  check('PV com LID resolve o número real', pvLid.senderNumber === '244945280380', pvLid.senderNumber);
  const grpLid = getSenderInfo({ key: { remoteJid: '1@g.us', participant: '18923@lid', participantAlt: '244945280380@s.whatsapp.net' } });
  check('Grupo com LID resolve o número real', grpLid.senderNumber === '244945280380', grpLid.senderNumber);

  // o prompt tem de dizer o que ela consegue fazer
  const ah = require('fs').readFileSync(path.join(AURA, 'auraHuman.js'), 'utf8');
  check('Prompt diz que ela VÊ imagens', /VER IMAGENS/i.test(ah));
  check('Prompt diz que ela FALA em áudio', /FALAR EM ÁUDIO/i.test(ah));
  check('Prompt proíbe recusar perguntas gerais', /RESPONDER A TUDO/i.test(ah));
  check('Prompt proíbe duvidar do Dono', /NUNCA duvides de que é ele/i.test(ah));

  // pedido de áudio é detectado nas formas reais
  const detectaAudio = (t) => {
    const x = String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return /\b(audio|voz|ptt|nota de voz|mensagem de voz)\b/.test(x) &&
           /\b(mand[ae]|envi[ae]|manda-?me|envia-?me|quero|faz|faca|grav[ae]|poe|poem|diz|fala|responde)\b/.test(x);
  };
  const pedidos = ['Mande um áudio por favor', 'manda áudio', 'me manda um audio', 'grava um áudio'];
  const naoDetectados = pedidos.filter(t => !detectaAudio(t));
  check('Detecta pedido de áudio (inclui imperativo)', naoDetectados.length === 0, naoDetectados.join(', ') || `${pedidos.length}/4`);
  check('Não confunde conversa sobre áudio', !detectaAudio('o que achas do audio do filme'));

  // voiceId antigo dava 402
  const aiSrc = require('fs').readFileSync(path.join(__dirname, '..', 'src', 'bot', 'ai.js'), 'utf8');
  check('speakWithFallback já não usa a voz que dá 402',
    !/speakWithFallback\(text, voiceId = '21m00Tcm4TlvDq8ikWAM'\)/.test(aiSrc));

  // ── 10. Procurar imagens em vez de gerar (v6.54) ───────────
  console.log('\n▸ Imagens: procura em vez de gerar');
  const IS = require(path.join(__dirname, '..', 'src', 'bot', 'imageSearch'));

  const pedeCavalo = IS.detectarPedidoImagem('Me de um cavalo');
  check('"Me de um cavalo" é pedido de imagem', pedeCavalo?.termo === 'cavalo' && !pedeCavalo.gerar,
    JSON.stringify(pedeCavalo));
  check('"manda foto de praia" → buscar', IS.detectarPedidoImagem('manda uma foto de praia')?.gerar === false);
  check('"cria imagem de dragão" → gerar', IS.detectarPedidoImagem('cria uma imagem de um dragão')?.gerar === true);
  check('Pedido de áudio NÃO é imagem', IS.detectarPedidoImagem('Mande um áudio por favor') === null);
  check('"me da um beijo" não é imagem', IS.detectarPedidoImagem('me da um beijo') === null);

  // ── 11. Acções do WhatsApp (v6.54) ─────────────────────────
  console.log('\n▸ Acções do WhatsApp por linguagem natural');
  const ACT = require(path.join(AURA, 'auraActions'));
  const casosAcao = [
    ['cria um grupo chamado Família', 'criarGrupo', 'Família'],
    ['cria um canal chamado Dark News', 'criarCanal', 'Dark News'],
    ['muda o nome do grupo para Os Manos', 'nomeGrupo', 'Os Manos'],
    ['fecha o grupo', 'fecharGrupo', undefined],
    ['abre o grupo', 'abrirGrupo', undefined],
    ['manda o link do grupo', 'linkGrupo', undefined],
  ];
  const erros = casosAcao.filter(([t, a, v]) => {
    const r = ACT.detectarAcao(t);
    return !r || r.acao !== a || (v !== undefined && r.valor !== v);
  });
  check('Detecta as 6 acções principais', erros.length === 0,
    erros.length ? erros.map(e => e[0]).join(' | ') : '6/6');
  check('Conversa normal não vira acção', ACT.detectarAcao('oi tudo bem') === null);
  check('Canal é suportado (newsletterCreate)', /newsletterCreate/.test(
    require('fs').readFileSync(path.join(AURA, 'auraActions.js'), 'utf8')));

  // ── 12. Voz mais humana (v6.54) ────────────────────────────
  console.log('\n▸ Voz');
  const aiTxt = require('fs').readFileSync(path.join(__dirname, '..', 'src', 'bot', 'ai.js'), 'utf8');
  check('Usa o modelo mais expressivo (eleven_v3)', /eleven_v3/.test(aiTxt));
  check('Stability baixa (menos robótico)', /stability:\s*0\.[0-4]/.test(aiTxt));

  // ── 13. Prompt sabe das novas capacidades ──────────────────
  console.log('\n▸ Prompt actualizado');
  const ahTxt = require('fs').readFileSync(path.join(AURA, 'auraHuman.js'), 'utf8');
  check('Prompt diz que PROCURA imagens', /PROCURAR IMAGENS/i.test(ahTxt));
  check('Prompt diz que USA o WhatsApp', /USAR O WHATSAPP/i.test(ahTxt));

  const chTxt2 = require('fs').readFileSync(path.join(__dirname, '..', 'src', 'bot', 'commandHandler.js'), 'utf8');
  check('Visão analisa pessoas/texto/local', /PESSOAS:.*quantas|LOCAL:/s.test(chTxt2));
  // v6.81: o cérebro novo entra antes deste bloco, por isso a distância
  // entre o `if (isOwner)` e o `auraActions` cresceu. O que importa é que
  // o require continue DENTRO do bloco do Dono — margem alargada.
  check('Acções só para o Dono', /if \(isOwner\) \{[\s\S]{0,4000}auraActions/.test(chTxt2));

  // ── 14. Ela DECIDE se responde (v6.56) ─────────────────────
  // "Tá parecendo um bot, responde SEMPRE, mesmo o que não é pra ela"
  console.log('\n▸ Decide se responde (não reage a tudo)');
  const DEC = require(path.join(AURA, 'auraDecide'));

  const sempre = [
    ['aura tudo bem?', { isOwner: true, isGroup: true }],
    ['o que achas?', { isOwner: true, isGroup: true }],
    ['faz um sticker', { isOwner: true, isGroup: true }],
    ['oi', { isOwner: true, isGroup: false }],
    ['seja o que for', { isOwner: true, isGroup: true, mencionada: true }],
    ['qualquer coisa', { isOwner: true, isGroup: true, respostaAoBot: true }],
  ];
  const naoRespondeu = sempre.filter(([t, o]) => !DEC.deveResponder({ texto: t, ...o }).responde);
  check('Responde sempre quando falam com ela', naoRespondeu.length === 0,
    naoRespondeu.map(x => x[0]).join(' | ') || `${sempre.length}/${sempre.length}`);

  const nunca = [
    ['bom dia pessoal', { isOwner: false, isGroup: true }],
    ['eu acho que sim', { isOwner: false, isGroup: true }],
    ['@244111222333 vem cá', { isOwner: true, isGroup: true }],
  ];
  const meteuSe = nunca.filter(([t, o]) => DEC.deveResponder({ texto: t, ...o }).responde);
  check('Não se mete na conversa dos outros', meteuSe.length === 0,
    meteuSe.map(x => x[0]).join(' | ') || `${nunca.length}/${nunca.length}`);

  // comentário solto: nem sempre, nem nunca
  let n = 0;
  for (let i = 0; i < 200; i++) {
    if (DEC.deveResponder({ texto: 'que calor hoje', isOwner: true, isGroup: true, pessoasNoGrupo: 12, msgsDesdeUltima: 5 }).responde) n++;
  }
  check('Comentário solto é selectivo', n > 20 && n < 180, `${n}/200 (~${Math.round(n / 2)}%)`);

  // grupo grande = mais reservada
  let g = 0, p2 = 0;
  for (let i = 0; i < 200; i++) {
    if (DEC.deveResponder({ texto: 'olha isto', isOwner: true, isGroup: true, pessoasNoGrupo: 20, msgsDesdeUltima: 5 }).responde) g++;
    if (DEC.deveResponder({ texto: 'olha isto', isOwner: true, isGroup: true, pessoasNoGrupo: 2, msgsDesdeUltima: 5 }).responde) p2++;
  }
  check('Mais reservada em grupo grande', g < p2, `grande ${g} < pequeno ${p2}`);

  check('Escolhe o formato da resposta', typeof DEC.comoResponder === 'function' &&
    DEC.comoResponder({ texto: 'manda audio', pediuAudio: true }) === 'audio');
  check('Tem reacções contextuais', /😂/.test(DEC.escolherReacao('kkkk que engraçado')));

  // ── 15. Sem cargos no modo AURA (v6.56) ────────────────────
  console.log('\n▸ A AURA humana não fala de cargos');
  const ahC = require('fs').readFileSync(path.join(AURA, 'auraHuman.js'), 'utf8');
  check('Prompt proíbe mencionar VIP/planos', /NUNCA menciones VIP/i.test(ahC));
  check('Já não trata por subdono/trial', !/userRole === 'subdono'/.test(ahC));
  check('Diz que não é atendimento', /NÃO és um atendimento/i.test(ahC));
  check('Manda variar o tamanho das respostas', /Não respondes sempre do mesmo tamanho/i.test(ahC));
  check('Manda não comentar tudo no grupo', /NÃO comentas tudo/i.test(ahC));

  // ── 16. Adapta-se ao ambiente (v6.58) ──────────────────────
  // "em grupos com várias ou poucas pessoas ela me trata do mesmo jeito"
  console.log('\n▸ Trata o Dark conforme o sítio');

  const base = { isOwner: true, userName: 'Dark', userRole: 'owner' };
  const pPV = A.buildAuraSystemPrompt({ ...base, isPrivateChat: true });
  const pPeq = A.buildAuraSystemPrompt({ ...base, isPrivateChat: false, pessoasNoGrupo: 4, groupName: 'Familia' });
  const pGde = A.buildAuraSystemPrompt({ ...base, isPrivateChat: false, pessoasNoGrupo: 40, groupName: 'Trabalho' });

  check('Os 3 ambientes geram prompts diferentes',
    pPV !== pPeq && pPeq !== pGde && pPV !== pGde);
  check('PV autoriza tratamento íntimo', /ESTÃO SÓ OS DOIS/.test(pPV));
  check('Grupo grande manda conter-se', /grupo GRANDE|NADA de "amor"/.test(pGde));
  check('Grupo grande sabe quantas pessoas', /40 pessoas/.test(pGde));
  check('Grupo pequeno é intermédio', /Grupo pequeno/.test(pPeq));
  check('PV não tem aviso de contenção', !/NADA de "amor"/.test(pPV));
  check('Nome do grupo chega ao prompt', /Trabalho/.test(pGde));

  // regras de comportamento em grupo
  const ahG = require('fs').readFileSync(path.join(AURA, 'auraHuman.js'), 'utf8');
  check('Manda levar intimidades para o PV', /Assuntos íntimos: leva para o PV/.test(ahG));
  check('Proíbe respostas de sistema', /não posso cumprir esse\s*\n?\s*pedido|soe a sistema/.test(ahG));
  check('Tem exemplos concretos de desconversa', /Guarda isso para logo/.test(ahG));
  check('Manda ser mais discreta com mais gente', /mais gente houver, mais discreta/.test(ahG));

  // o handler passa mesmo o tamanho do grupo
  const chG = require('fs').readFileSync(
    path.join(__dirname, '..', 'src', 'bot', 'commandHandler.js'), 'utf8');
  check('Handler envia pessoasNoGrupo ao prompt',
    /pessoasNoGrupo:\s*ctx\.groupMeta\?\.participants\?\.length/.test(chG));

  console.log(`\n  ${ok} OK / ${fail} FALHOU\n`);
  process.exit(fail ? 1 : 0);
})();
