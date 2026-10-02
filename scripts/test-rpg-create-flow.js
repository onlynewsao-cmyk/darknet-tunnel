// E2E RPG creation — nome explícito, carrossel/lista, biografia e atributos
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
const stub = (p, exp) => { const r = path.resolve(p); require.cache[r] = { id: r, filename: r, loaded: true, exports: exp }; };

const RACES = {
  humano: { emoji: '🧑', desc: 'Equilibrado', bonus: { str: 1 } },
  elfo_sombrio: { emoji: '🌑', desc: 'Ágil', bonus: { dex: 2 } },
};
const CLASSES = {
  guerreiro: { emoji: '⚔️', desc: 'Frente de batalha', primary: 'str' },
  mago_negro: { emoji: '🔮', desc: 'Magia proibida', primary: 'int' },
};
stub(path.join(ROOT, 'src/config.js'), { bot: { name: 'DARK BOT' } });
let playerSaved = null;
stub(path.join(ROOT, 'src/bot/rpg/engine.js'), {
  RACES, CLASSES, ORIGINS: {}, SKILLS: {},
  peekPlayer: async () => null,
  getPlayer: async () => ({ name: 'Aventureiro', equipment: {}, skills: [], level: 1, coins: 0 }),
  savePlayer: async (p) => { playerSaved = JSON.parse(JSON.stringify(p)); }, getRank: () => ({ emoji: '⚪', name: 'E' }),
});
stub(path.join(ROOT, 'src/bot/rpg/ui.js'), { confirmar: async () => {} });
stub(path.join(ROOT, 'src/bot/rpg/rpgTheme.js'), { rpgRender: (_, xs) => xs.join('\n'), rpgReply: async () => {} });
let carouselCall = null;
stub(path.join(ROOT, 'src/bot/rpg/carousel.js'), {
  enviarCarrossel: async (_sock, _msg, _ctx, options) => { carouselCall = options; return true; },
});

(async () => {
  const R = []; const ok = (n, c) => { R.push((c ? '✅' : '❌') + ' ' + n); if (!c) process.exitCode = 1; };
  const flow = require(path.join(ROOT, 'src/bot/rpg/createFlow.js'));
  const enviados = [];
  const sock = { user: { id: '244949926074@s.whatsapp.net' }, sendMessage: async (_, c) => { enviados.push(String(c.text || '')); return {}; } };
  const ctx = { remoteJid: 'g@g.us', senderNumber: '244911100000', prefix: '.', pushName: 'Nome WhatsApp Não Usar' };
  const msg = { key: { id: 'x' }, message: {} };
  const ultima = () => enviados.at(-1) || '';

  // 1 — rpgstart só pede nome, sem escolher do pushName e sem abrir botão/lista.
  enviados.length = 0;
  await flow.start({ sock, msg, ctx, args: [] });
  let p = flow.pendentes().get(ctx.senderNumber);
  ok('rpgstart começa por pedir .rpgnome', p?.step === 'nome' && /rpgnome <teu nome>/.test(ultima()));
  ok('não usa pushName como personagem', !p?.name && !ultima().includes('Nome WhatsApp Não Usar'));

  // 2 — nome explícito abre género; fallback escrito sempre acompanha lista.
  enviados.length = 0;
  await flow.definirNome({ sock, msg, ctx, args: ['Kael', 'Storm'] });
  p = flow.pendentes().get(ctx.senderNumber);
  ok('rpgnome guarda nome e abre género', p?.name === 'Kael Storm' && p?.step === 'genero');
  ok('género tem fallback .rpgselecionar', /rpgselecionar <número>/.test(ultima()));

  // 3 — género → idade → raça; idade concede bônus só uma vez.
  await flow.pick({ sock, msg, ctx, token: 'RPGCR_G_masculino' });
  p = flow.pendentes().get(ctx.senderNumber);
  ok('botão género avança para idade', p?.step === 'idade' && p?.gender === 'masculino');
  sock.waUploadToServer = async () => ({}); // força a via real de carrossel, mockada acima
  await flow.pick({ sock, msg, ctx, token: 'RPGCR_I_adulto' });
  p = flow.pendentes().get(ctx.senderNumber);
  ok('botão idade avança para raça', p?.step === 'raca' && p?.age === 25);
  ok('idade adulto aplica bónus uma vez', p?.stats?.str === 8 && p?.stats?.vit === 7);
  ok('raça abre carrossel com plano B escrito', /rpgselecionar <número>/.test(carouselCall?.corpo || ''));
  ok('cartas de raça têm título e consulta Pinterest', carouselCall?.cards?.every(c => c.titulo && c.pinterestQuery && c.botoes?.[0]?.id?.startsWith('RPGCR_R_')));

  // Clique repetido/velho de idade não reaplica +2 STR/+1 VIT nem retrocede.
  enviados.length = 0;
  await flow.pick({ sock, msg, ctx, token: 'RPGCR_I_adulto' });
  p = flow.pendentes().get(ctx.senderNumber);
  ok('idade velha é bloqueada sem duplicar bónus', p?.step === 'raca' && p?.stats?.str === 8 && p?.stats?.vit === 7 && /já não é da etapa actual/.test(ultima()));

  // 4 — IDs actuais, IDs históricos e bónus declarados em RACES funcionam.
  await flow.pick({ sock, msg, ctx, token: 'RPGPICK_R_elfo_sombrio' });
  p = flow.pendentes().get(ctx.senderNumber);
  ok('RPGPICK de raça com _ é normalizado e abre classe', p?.step === 'classe' && p?.race === 'elfo_sombrio');
  ok('raça aplica o bónus de RACES quando ORIGINS não o tem', p?.stats?.dex === 8);
  ok('classes recebem o mesmo carrossel Pinterest', carouselCall?.cards?.every(c => c.titulo && c.pinterestQuery && c.botoes?.[0]?.id?.startsWith('RPGCR_C_')));
  await flow.escolherNumero(sock, msg, ctx, 2); // classe mago_negro — fallback textual
  p = flow.pendentes().get(ctx.senderNumber);
  ok('rpgselecionar escolhe classe e abre bio', p?.step === 'bio' && p?.class === 'mago_negro');

  // 5 — biografia própria pede o texto, guarda-o e abre a distribuição de atributos.
  await flow.pick({ sock, msg, ctx, token: 'RPGCR_B_custom' });
  p = flow.pendentes().get(ctx.senderNumber);
  ok('bio custom pede rpgbio antes dos atributos', p?.step === 'bio_custom' && /rpgbio <a tua história>/.test(ultima()));
  await flow.escolherNumero(sock, msg, ctx, 1);
  ok('fallback numérico não salta a bio custom', /rpgbio <história>/.test(ultima()));
  await flow.definirBio({ sock, msg, ctx, args: ['Fugi', 'do', 'reino', 'para', 'salvar', 'a', 'minha', 'irmã.'] });
  p = flow.pendentes().get(ctx.senderNumber);
  ok('rpgbio abre stats e preserva texto próprio', p?.step === 'stats' && /salvar a minha irmã/.test(p?.bio || ''));

  // 6 — botões, comando escrito e confirmar finalizam o point-buy sem perder a bio.
  await flow.pick({ sock, msg, ctx, token: 'RPGCR_S_str' });
  p = flow.pendentes().get(ctx.senderNumber);
  ok('botão de atributo consome um ponto', p?.stats?.str === 9 && p?.pointsLeft === 11);
  await flow.ajustarStat(sock, msg, ctx, ['-str']);
  p = flow.pendentes().get(ctx.senderNumber);
  ok('rpgcr -str devolve ponto', p?.stats?.str === 8 && p?.pointsLeft === 12);
  await flow.pick({ sock, msg, ctx, token: 'RPGCR_S_CONFIRM' });
  ok('confirmar stats grava a ficha e encerra wizard', !flow.pendentes().has(ctx.senderNumber) && playerSaved?.started === true && /salvar a minha irmã/.test(playerSaved?.bio || ''));

  // 7 — sessão expirada não reinicia em "Aventureiro" nem aceita escolha.
  await flow.start({ sock, msg, ctx, args: [] });
  p = flow.pendentes().get(ctx.senderNumber);
  p.expira = Date.now() - 1;
  enviados.length = 0;
  await flow.pick({ sock, msg, ctx, token: 'RPGCR_G_masculino' });
  ok('sessão expirada é apagada e pede rpgstart', !flow.pendentes().has(ctx.senderNumber) && /criação expirou.*rpgstart/i.test(ultima()));

  // Os cases públicos expõem nome, biografia e fallback, sem colidir com o RPG UI.
  const handlers = {};
  require(path.join(ROOT, 'src/bot/cases/rpg2.js'))((cmds, fn) => [].concat(cmds).forEach(c => handlers[c] = fn));
  ok('cases registam rpgnome, rpgbio e rpgselecionar', typeof handlers.rpgnome === 'function' && typeof handlers.rpgbio === 'function' && typeof handlers.rpgselecionar === 'function');
  await handlers.rpgstart({ sock, msg, ctx, args: [] });
  await handlers.rpgnome({ sock, msg, ctx, args: ['Luna'] });
  p = flow.pendentes().get(ctx.senderNumber);
  ok('case rpgnome encaminha para o wizard', p?.name === 'Luna' && p?.step === 'genero');
  flow.pendentes().delete(ctx.senderNumber);

  // O commandHandler aceita tokens de chaves com _ e - do carrossel/lista.
  const handlerSource = fs.readFileSync(path.join(ROOT, 'src/bot/commandHandler.js'), 'utf8');
  ok('router aceita token RPGCR com _ e -', /RPGCR_\[A-Z\]_\[a-z0-9_-\]\+/.test(handlerSource));
  ok('router mantém RPGPICK legado com _ e -', /RPGPICK_\[RC\]_\[a-z0-9_-\]\+/.test(handlerSource));

  console.log(R.join('\n'));
  console.log(process.exitCode ? '❌ FALHOU' : '✅ TODOS OS TESTES PASSARAM');
  process.exit(process.exitCode || 0);
})().catch(e => { console.error('💥 ' + e.message + '\n' + e.stack); process.exit(1); });
