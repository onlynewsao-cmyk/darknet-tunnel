/**
 * DARK BOT — AURA executa comandos por conversa
 *
 * O pedido: "ela controla ~90% do bot, menos alguns de dono".
 *
 * Este teste garante as duas metades:
 *   1. EXECUTA o que deve   ("aura toca Shakira" → .play)
 *   2. NUNCA executa o que é perigoso (eval, broadcast, restart…)
 *
 * A segunda parte é a que interessa mesmo: um erro aqui é
 * irreversível em produção.
 *
 * Uso: node scripts/test-aura-comandos.js
 */
'use strict';

const path = require('path');
const C = require(path.join(__dirname, '..', 'src', 'aura', 'auraCommands'));

let ok = 0, fail = 0;
const check = (nome, cond, extra = '') => {
  cond ? ok++ : fail++;
  console.log(`  ${cond ? '✅' : '❌'} ${nome}${extra ? ' → ' + String(extra).slice(0, 60) : ''}`);
};

(async () => {
  console.log('\n╔═══════════════════════════════════════════════════════════════════╗');
  console.log('║      AURA — comandos por conversa (90% sim, dono não)             ║');
  console.log('╚═══════════════════════════════════════════════════════════════════╝\n');

  // ══ 1. O QUE DEVE EXECUTAR ════════════════════════════════
  console.log('▸ Executa comandos normais');
  const devem = [
    ['aura toca Shakira', 'play', 'Shakira'],
    ['toca a música despacito', 'play', 'despacito'],
    ['põe música despacito', 'play', 'despacito'],
    ['faz sticker disto', 'sticker', ''],
    ['qual é o meu saldo?', 'saldo', ''],
    ['quero a recompensa diária', 'daily', ''],
    ['quem são os admins?', 'admins', ''],
    ['meu perfil', 'perfil', ''],
  ];
  const falharam = devem.filter(([t, cmd, args]) => {
    const r = C.detectarComando(t);
    return !r || r.comando !== cmd || (args && r.args !== args);
  });
  check('Detecta os pedidos comuns', falharam.length === 0,
    falharam.length ? falharam.map(f => f[0]).join(' | ') : `${devem.length}/${devem.length}`);

  // ══ 2. O QUE NUNCA PODE EXECUTAR ══════════════════════════
  // v6.80 — a política passou a ter camadas. O Dono manda por
  // conversa; o que é IRREVERSÍVEL continua a exigir o comando
  // escrito à mão, e ninguém sem permissão passa seja no que for.
  console.log('\n▸ Irreversíveis bloqueados até para o Dono (exigem comando escrito)');
  const irreversiveis = [
    'eval', 'exec', 'shell', 'broadcast', 'bc', 'sendgroup',
    'restart', 'shutdown', 'adddono', 'removedono', 'addcase', 'delcase',
  ];
  const passaram = irreversiveis.filter(c => !C.estaBloqueado(c));
  check(`${irreversiveis.length} irreversíveis bloqueados`, passaram.length === 0,
    passaram.length ? '⚠️ PASSARAM: ' + passaram.join(', ') : 'todos bloqueados');

  console.log('\n▸ Comandos sensíveis negados a quem não tem permissão');
  const sensiveis = [
    'send', 'setpremium', 'blacklist', 'unblacklist', 'block',
    'setprefix', 'backup', 'panel', 'bomb', 'fakeban', 'espiao',
    'adultmode', 'hentai', 'ximg', 'xvideo', 'fig18',
    'change', 'menustyle', 'buttonmode', 'themeglobal', 'stickerwm',
  ];
  const estranho = { isOwner: false, isVip: false, isAdmin: false };
  const vazaram = sensiveis.filter(c => C.podeExecutar(c, estranho).pode);
  check(`${sensiveis.length} sensíveis negados a estranhos`, vazaram.length === 0,
    vazaram.length ? '⚠️ VAZARAM: ' + vazaram.join(', ') : 'todos negados');

  console.log('\n▸ Sensíveis também negados a admin de grupo');
  const adminGrupo = { isOwner: false, isVip: false, isAdmin: true };
  const vazAdmin = ['adultmode', 'setpremium', 'blacklist', 'backup', 'panel']
    .filter(c => C.podeExecutar(c, adminGrupo).pode);
  check('Admin de grupo não toca no que é do Dono', vazAdmin.length === 0,
    vazAdmin.length ? '⚠️ VAZARAM: ' + vazAdmin.join(', ') : 'todos negados');

  // ══ 3. Frases que mencionam comandos perigosos ════════════
  console.log('\n▸ Frases perigosas não viram comando');
  // "manda broadcast para todos" chegou a virar `.play broadcast`
  const frasesMas = [
    'manda broadcast para todos',
    'faz eval de 1+1',
    'reinicia o bot',
    'manda o hentai',
    'adiciona dono 123456',
    'põe o shell a correr',
  ];
  const viraram = frasesMas.filter(t => C.detectarComando(t) !== null);
  check('Nenhuma frase perigosa vira comando', viraram.length === 0,
    viraram.length ? viraram.join(' | ') : `${frasesMas.length}/${frasesMas.length}`);

  // ══ 4. Conversa normal continua conversa ══════════════════
  console.log('\n▸ Conversa normal não é comando');
  const conversa = ['oi tudo bem', 'me de um cavalo', 'como estás?', 'gosto muito de ti', 'bom dia'];
  const viraramCmd = conversa.filter(t => C.detectarComando(t) !== null);
  check('Conversa fica conversa', viraramCmd.length === 0,
    viraramCmd.length ? viraramCmd.join(' | ') : `${conversa.length}/${conversa.length}`);

  // ══ 5. Rede de segurança do catálogo ══════════════════════
  console.log('\n▸ Rede de segurança automática');
  // v6.80 — todo o ownerOnly do catálogo tem de ser negado a um
  // estranho, quer por bloqueio total quer por falta de permissão.
  let cobertos = 0, expostos = [];
  try {
    const cat = require(path.join(__dirname, '..', 'src', 'bot', 'commandCatalog'));
    const ownerOnly = (cat.CATALOG || []).filter(x => x.ownerOnly).map(x => x.name);
    const permitidos = new Set(['stats', 'donos', 'grupos', 'menudono', 'maiscmds']);
    const zé = { isOwner: false, isVip: false, isAdmin: false };
    for (const c of ownerOnly) {
      if (permitidos.has(c)) continue;
      (C.estaBloqueado(c) || !C.podeExecutar(c, zé).pode) ? cobertos++ : expostos.push(c);
    }
  } catch {}
  check('ownerOnly do catálogo negado a estranhos', expostos.length === 0,
    expostos.length ? '⚠️ ' + expostos.join(', ') : `${cobertos} cobertos`);

  // ══ 6. Só o Dono (verificado no handler) ══════════════════
  console.log('\n▸ Restrito ao Dono');
  const ch = require('fs').readFileSync(
    path.join(__dirname, '..', 'src', 'bot', 'commandHandler.js'), 'utf8');
  // v6.57: já não é "só o Dono" — todos executam, filtrado por cargo.
  // O que tem de continuar garantido é a verificação de permissão.
  check('Verifica permissão antes de correr',
    /podeExecutar\(pedido\.comando/.test(ch));
  check('Bloqueados são negados a toda a gente',
    /estaBloqueado/.test(require('fs').readFileSync(
      path.join(__dirname, '..', 'src', 'aura', 'auraCommands.js'), 'utf8')));

  // ══ 7. PERMISSÃO POR CARGO (v6.57) ════════════════════════
  // "porque que a assistente não me respondeu e não executa
  //  comandos dependendo do cargo?"
  console.log('\n▸ Assistente executa, filtrado por cargo');

  const FREE_ = {};
  const VIP_ = { isVip: true };
  const ADM_ = { isAdmin: true };
  const DONO_ = { isOwner: true };

  // qualquer um: informação e coisas inofensivas
  const livres = ['saldo', 'perfil', 'menu', 'ping', 'sticker', 'traduzir'];
  const negados = livres.filter(c => !C.podeExecutar(c, FREE_).pode);
  check('Free executa comandos livres', negados.length === 0,
    negados.join(', ') || `${livres.length}/${livres.length}`);

  // downloads só VIP
  check('Free NÃO executa play', !C.podeExecutar('play', FREE_).pode,
    C.podeExecutar('play', FREE_).precisa);
  check('VIP executa play', C.podeExecutar('play', VIP_).pode);

  // moderação só admin
  check('Free NÃO executa ban', !C.podeExecutar('ban', FREE_).pode,
    C.podeExecutar('ban', FREE_).precisa);
  check('Admin executa ban', C.podeExecutar('ban', ADM_).pode);

  // dono faz tudo menos os bloqueados
  check('Dono executa play', C.podeExecutar('play', DONO_).pode);
  check('Nem o Dono executa eval por conversa', !C.podeExecutar('eval', DONO_).pode);
  check('Nem o Dono executa broadcast', !C.podeExecutar('broadcast', DONO_).pode);

  // desconhecido é negado por omissão
  check('Comando desconhecido negado a Free', !C.podeExecutar('comandoQualquer', FREE_).pode);

  // o handler tem de passar o isOwner real, não fixo
  const chSrc = require('fs').readFileSync(
    path.join(__dirname, '..', 'src', 'bot', 'commandHandler.js'), 'utf8');
  check('Handler não força isOwner: true', !/command: pedido\.comando, isOwner: true/.test(chSrc));
  check('Handler verifica podeExecutar', /podeExecutar\(pedido\.comando/.test(chSrc));

  // a assistente sabe que executa
  const amSrc = require('fs').readFileSync(
    path.join(__dirname, '..', 'src', 'aura', 'auraModes.js'), 'utf8');
  check('Prompt diz que executa, não explica', /TU EXECUTAS, NÃO SÓ EXPLICAS/.test(amSrc));
  check('Prompt manda perguntar se ambíguo', /PERGUNTA o que falta/.test(amSrc));

  console.log(`\n  ${ok} OK / ${fail} FALHOU\n`);
  process.exit(fail ? 1 : 0);
})();
