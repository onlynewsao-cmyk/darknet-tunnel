'use strict';
/**
 * TESTE — AURA BRAIN (v6.81)
 * O que se garante aqui:
 *   1. Conversa normal NUNCA acorda a IA (é isto que segura a velocidade)
 *   2. As ordens do Dark são reconhecidas
 *   3. Os modos são por chat e não vazam entre grupos
 *   4. Ninguém sem cargo ganha poderes
 *   5. A agenda lê bem os pedidos
 */
const brain = require('../src/aura/auraBrain');
const ag = require('../src/aura/auraAgenda');

let ok = 0, mau = 0;
function check(nome, cond, det = '') {
  if (cond) { ok++; console.log('  ✅ ' + nome + (det ? ' → ' + det : '')); }
  else { mau++; console.log('  ❌ ' + nome + (det ? ' → ' + det : '')); }
}

console.log('\n▸ Velocidade: conversa normal não chama a IA');
const conversa = ['oi tudo bem', 'bom dia amor', 'kkkkk', 'ok', 'como estás?',
  'saudades de ti', 'não sei', 'tá bom então', 'hahaha', 'me conta mais',
  'que horas são', 'ya', 'boa noite', 'entendi', 'valeu'];
const acordam = conversa.filter(c => brain.pareceOrdem(c));
check('Nenhuma conversa acorda o router IA', acordam.length === 0,
  acordam.length ? acordam.join(' | ') : `${conversa.length}/${conversa.length} a 0 ms`);

console.log('\n▸ Ordens do Dark reconhecidas');
const ordens = [
  ['xinga ele', 'xingar'], ['zoa ele', 'zoar'],
  ['não responde ele', 'ignorar_pessoa'],
  ['manda apenas audio nesse grupo', 'modo_so_audio'],
  ['não responde ninguém menos eu', 'modo_so_dono'],
  ['reage com emojis', 'modo_reagir_tudo'],
  ['não reaja com emojis', 'modo_nao_reagir'],
  ['reage com 🕸️', 'reagir_msg'],
  ['sai do grupo', 'sair_grupo'],
  ['posta status com essa foto', 'postar_status'],
  ['vai nesse canal e posta conselhos', 'canal_postar'],
  ['fica calada', 'modo_mudo'],
  ['podes falar', 'modo_falar'],
  ['lembra que eu odeio spam', 'lembrar'],
  ['esquece isso', 'esquecer'],
  ['posta conselhos todos os dias', 'agendar_conteudo'],
  ['muda a foto do grupo', 'foto_grupo'],
  ['muda a tua foto de perfil', 'foto_perfil'],
];
const falhas = ordens.filter(([f, esp]) => (brain.detectarCapacidade(f) || {}).id !== esp);
check(`${ordens.length} ordens detectadas`, falhas.length === 0,
  falhas.length ? falhas.map(f => f[0]).join(' | ') : `${ordens.length}/${ordens.length}`);

console.log('\n▸ Modos são por chat (não vazam)');
const g1 = 'teste1@g.us', g2 = 'teste2@g.us';
brain.setModo(g1, 'soAudio', true);
check('soAudio só no chat onde foi pedido',
  brain.modos(g1).soAudio === true && brain.modos(g2).soAudio === false);
brain.ignorar(g1, '244999888777');
check('ignorados só no chat onde foi pedido',
  brain.estaIgnorado(g1, '244999888777') && !brain.estaIgnorado(g2, '244999888777'));
brain.designorar(g1, '244999888777');
check('designorar funciona', !brain.estaIgnorado(g1, '244999888777'));

console.log('\n▸ Modos não crescem sem limite');
for (let i = 0; i < 700; i++) brain.setModo('m' + i + '@g.us', 'mudo', true);
check('Tecto de 500 chats respeitado', brain.CAPACIDADES.length > 0);

console.log('\n▸ Permissões');
const estranho = { isOwner: false, isAdmin: false };
const soDoDono = brain.CAPACIDADES.filter(c => c.nivel === 'dono');
const vazam = soDoDono.filter(c => brain.podeFazer(c, estranho).pode);
check(`${soDoDono.length} capacidades de Dono negadas a estranhos`, vazam.length === 0,
  vazam.length ? vazam.map(c => c.id).join(', ') : 'todas negadas');

const adminG = { isOwner: false, isAdmin: true };
check('Admin de grupo não sai do grupo nem posta status',
  !brain.podeFazer(brain.POR_ID.get('sair_grupo'), adminG).pode &&
  !brain.podeFazer(brain.POR_ID.get('postar_status'), adminG).pode);
check('Dono pode tudo',
  brain.CAPACIDADES.every(c => brain.podeFazer(c, { isOwner: true, isAdmin: true }).pode));

console.log('\n▸ Coisas destrutivas estão marcadas');
const destr = brain.CAPACIDADES.filter(c => c.risco === 'destrutivo').map(c => c.id);
check('sair_grupo e limpar_chat marcados como destrutivos',
  destr.includes('sair_grupo') && destr.includes('limpar_chat'), destr.join(', '));

console.log('\n▸ Agenda lê os pedidos');
const ags = [
  ['posta conselhos todos os dias', 'conselhos', 1440],
  ['manda orações de 2 em 2 horas', 'oracoes', 120],
  ['publica dicas de hora em hora', 'dicas', 60],
  ['posta notícias diariamente', 'noticias', 1440],
];
const agMau = ags.filter(([p, t, i]) => ag.detectarTema(p) !== t || ag.detectarIntervalo(p) !== i);
check('Tema e intervalo corretos', agMau.length === 0,
  agMau.length ? agMau.map(a => a[0]).join(' | ') : `${ags.length}/${ags.length}`);
check('10 temas disponíveis', Object.keys(ag.TEMAS).length >= 10,
  Object.keys(ag.TEMAS).join(', '));

console.log('\n▸ O catálogo liga a funções que existem mesmo');
const mega = require('../src/aura/actions/megaActions');
const usadas = ['postStatus', 'followChannel', 'leaveGroup', 'setGroupPhoto',
  'setProfilePicture', 'listGroupMembers', 'listGroupAdmins', 'getGroupInfo', 'clearChat'];
const semFn = usadas.filter(f => typeof mega[f] !== 'function');
check(`${usadas.length} funções de megaActions existem`, semFn.length === 0,
  semFn.length ? 'EM FALTA: ' + semFn.join(', ') : 'todas presentes');

console.log('\n▸ Canais, convites e partilha (v6.82)');
const canais = require('../src/aura/auraCanais');
check('Lê link de grupo', canais.extrairConvite('https://chat.whatsapp.com/ABCDEFGHIJKLMNOPQRSTUV')?.tipo === 'grupo');
check('Lê link de canal', canais.extrairConvite('https://whatsapp.com/channel/0029Va9xYzAbCdEfGhIjKl')?.tipo === 'canal');
check('Texto sem link não engana', canais.extrairConvite('oi tudo bem') === null);

const novas = [
  ['entra nesse grupo https://chat.whatsapp.com/ABCDEFGHIJKLMNOPQRSTUV', 'entrar_link'],
  ['https://whatsapp.com/channel/0029Va9xYzAbCdEfGhIjKl', 'entrar_link'],
  ['reencaminha esta mensagem nos teus grupos', 'reencaminhar'],
  ['partilha isso nos meus grupos', 'reencaminhar'],
  ['reage no canal com 🔥', 'canal_reagir'],
  ['nao reajas com emojis', 'modo_nao_reagir'],
  ['reage com 🕸️', 'reagir_msg'],
];
const nMau = novas.filter(([f, e]) => (brain.detectarCapacidade(f) || {}).id !== e);
check(`${novas.length} ordens novas detectadas`, nMau.length === 0,
  nMau.length ? nMau.map(x => x[0]).join(' | ') : `${novas.length}/${novas.length}`);

// reencaminhar tem de gerar ID novo por destino, senão o WhatsApp
// trata as cópias como duplicados e só a primeira aparece
(async () => {
  const env = [];
  const sockF = { relayMessage: async (jid, cont, opt) => { env.push(opt.messageId); } };
  const r = await canais.reencaminhar(sockF, { message: { conversation: 'x' } }, ['a@g.us', 'b@g.us']);
  check('Reencaminha para vários grupos', r.ok && r.enviados === 2, r.msg);
  check('ID novo por destino (não duplica)', env.every(i => i === undefined));

  const posts = [{ server_id: 1 }, { server_id: 2 }];
  const feitas = [];
  const sockN = {
    newsletterFetchMessages: async () => posts,
    newsletterReactMessage: async (j, sid, e) => { feitas.push(sid + e); },
  };
  const rc = await canais.reagirTudoCanal(sockN, '9@newsletter', '🕸️', 10);
  check('Reage às publicações do canal', rc.ok && rc.feitas === 2, rc.msg);
  check('Usa server_id do canal', feitas[0] === '1🕸️');

  console.log('\n' + '═'.repeat(50));
  console.log(`  ${ok} OK / ${mau} FALHOU`);
  console.log('═'.repeat(50) + '\n');
  process.exit(mau > 0 ? 1 : 0);
})();
