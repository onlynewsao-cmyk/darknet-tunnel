/**
 * DARK BOT — Auditoria do submenu MENU18 (Portal 18+)
 *
 * Um submenu de cada vez, com o mesmo rigor das APIs e da AURA:
 *   1. ACESSO      — Free bloqueado, VIP e Dono entram
 *   2. CONTEÚDO    — mostra o portal real (não a categoria 'outros')
 *   3. PROMESSAS   — todo o comando anunciado EXISTE mesmo
 *   4. HONESTIDADE — o menu diz quem pode usar cada comando
 *   5. SEGURANÇA   — privacidade, filtros e portal desligado por omissão
 *
 * Uso: node scripts/test-menu18.js
 */
'use strict';

process.env.OWNER_NUMBER = '244945280380';
process.env.BOT_NUMBER   = '244949926074';
process.env.BOT_NAME     = 'DARK BOT';
process.env.BOT_PREFIX   = '.';

const path = require('path');
const Module = require('module');
const origRequire = Module.prototype.require;

const OWNER = '244945280380';
const VIP   = '244555666777';
const FREE  = '244111222333';
const G     = '111111@g.us';

const users = new Map([
  [OWNER, { whatsappNumber: OWNER, role: 'owner' }],
  [VIP,   { whatsappNumber: VIP,   role: 'premium', premiumUntil: new Date(Date.now() + 864e5 * 30) }],
  [FREE,  { whatsappNumber: FREE,  role: 'free' }],
]);

const grupo = {
  groupJid: G, groupName: 'Teste', auraMode: 'assistant', botEnabled: true,
  isHosted: true, hostedUntil: null, trialExpiresAt: new Date(Date.now() + 864e5),
  commandsUsedToday: 0, totalCommands: 0,
  lastResetDate: new Date().toISOString().split('T')[0],
  blockedCommands: [], blockedSubmenus: [], groupPrefix: null, onlyAdmins: false,
  save: async () => {},
};

const userDoc = (n) => {
  const b = users.get(n) || { whatsappNumber: n, role: 'free' };
  return { ...b, active: true, commandsUsed: 0, createdAt: new Date(),
    isPremium() { return this.role === 'owner' || (this.role === 'premium' && (!this.premiumUntil || new Date(this.premiumUntil) > new Date())); },
    save: async () => {} };
};

Module.prototype.require = function (id) {
  const m = /models\/(\w+)$/.exec(id);
  if (m) {
    const w = (v) => { const p = Promise.resolve(v); p.lean = () => Promise.resolve(v); p.select = () => p; p.catch = () => p; return p; };
    if (m[1] === 'User') return { findOne: (q) => w(q?.whatsappNumber ? userDoc(String(q.whatsappNumber).replace(/\D/g, '')) : null), find: () => w([]), create: async () => userDoc(FREE), updateOne: async () => ({}), findOneAndUpdate: async () => null, countDocuments: async () => 0 };
    if (m[1] === 'GroupSettings') return { findOne: () => w(grupo), find: () => w([grupo]), create: async () => grupo, updateOne: async () => ({}), findOneAndUpdate: async () => null, countDocuments: async () => 0 };
    if (m[1] === 'BotConfig') return { findOne: () => w(null), find: () => w([]), get: async (k, d) => d, set: async () => {}, create: async () => ({}), updateOne: async () => ({}), findOneAndUpdate: async () => null, countDocuments: async () => 0 };
    return { findOne: () => w(null), find: () => w([]), create: async () => ({}), updateOne: async () => ({}), findOneAndUpdate: async () => null, countDocuments: async () => 0, getOrCreate: async () => ({ addMessage() {}, save: async () => {}, messages: [] }) };
  }
  if (id.endsWith('botConfigCache')) {
    const c = { owner_number: OWNER, ai_auto_enabled: true };
    return { get: async (k, d) => (k in c ? c[k] : d), set: async () => {}, clear: () => {}, refresh: async () => 0, getMany: async () => ({}), dump: () => c };
  }
  return origRequire.apply(this, arguments);
};

const cmdHandler = require(path.join(__dirname, '..', 'src', 'bot', 'commandHandler'));
const ch = require(path.join(__dirname, '..', 'src', 'bot', 'caseHandler'));

let GRUPO_OUT = [], PV_OUT = [];
const sock = {
  user: { id: '244949926074:1@s.whatsapp.net' },
  sendMessage: async (jid, c) => {
    if (c?.react) return { key: {} };
    const t = c?.text || c?.caption || '';
    if (t) (String(jid).endsWith('@g.us') ? GRUPO_OUT : PV_OUT).push(String(t));
    return { key: { id: 'm' } };
  },
  relayMessage: async (jid, msg) => {
    try { const b = msg?.interactiveMessage?.body?.text; if (b) GRUPO_OUT.push(String(b)); } catch {}
    return {};
  },
  groupMetadata: async () => ({ id: G, subject: 'Teste', participants: [
    { id: OWNER + '@s.whatsapp.net', admin: null },
    { id: VIP + '@s.whatsapp.net', admin: null },
    { id: FREE + '@s.whatsapp.net', admin: null }] }),
  sendPresenceUpdate: async () => {}, readMessages: async () => {}, waUploadToServer: async () => ({}),
};

const mkMsg = (t, de) => ({ key: { remoteJid: G, participant: de + '@s.whatsapp.net', id: 'X' + Math.random(), fromMe: false }, message: { conversation: t }, pushName: 'U', messageTimestamp: Math.floor(Date.now() / 1000) });

async function abrir(cmd, de) {
  GRUPO_OUT = []; PV_OUT = [];
  try { await cmdHandler.handle(sock, mkMsg(cmd, de)); } catch (e) { return { grupo: 'ERRO ' + e.message, pv: '' }; }
  return { grupo: GRUPO_OUT.join('\n'), pv: PV_OUT.join('\n') };
}

let ok = 0, fail = 0;
const check = (nome, cond, extra = '') => {
  cond ? ok++ : fail++;
  console.log(`  ${cond ? '✅' : '❌'} ${nome}${extra ? ' → ' + String(extra).replace(/\n/g, ' ').slice(0, 68) : ''}`);
};

(async () => {
  console.log('\n╔═══════════════════════════════════════════════════════════════════════╗');
  console.log('║          DARK BOT — AUDITORIA DO SUBMENU  🔞 MENU18                   ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════╝\n');

  ch.loadCases();

  // ══ 1. ACESSO ═════════════════════════════════════════════
  console.log('▸ Controlo de acesso');
  const rFree = await abrir('.menu18', FREE);
  check('Free é BLOQUEADO', /VIP|exclusiv/i.test(rFree.grupo) && !/hentai|xvideo/i.test(rFree.grupo + rFree.pv), rFree.grupo);
  check('Free não recebe nada no PV', !rFree.pv.trim());

  const rVip = await abrir('.menu18', VIP);
  check('VIP tem acesso', /PORTAL 18/i.test(rVip.pv + rVip.grupo));

  const rDono = await abrir('.menu18', OWNER);
  check('Dono tem acesso', /PORTAL 18/i.test(rDono.pv + rDono.grupo));

  // ══ 2. CONTEÚDO CERTO ═════════════════════════════════════
  console.log('\n▸ Mostra o portal real (não a categoria "outros")');
  const conteudo = rDono.pv + rDono.grupo;
  check('NÃO mostra "OUTROS COMANDOS"', !/OUTROS COMANDOS/i.test(conteudo));
  check('NÃO mostra lixo interno', !/__change_theme_handler__|acordaaura|alteradores/i.test(conteudo));
  check('Mostra comandos 18+ reais', /hentai/i.test(conteudo) && /hotchat/i.test(conteudo));

  // ══ 3. PRIVACIDADE ════════════════════════════════════════
  console.log('\n▸ Privacidade');
  check('Conteúdo vai para o PV, não para o grupo', rDono.pv.length > 200 && !/hentai/i.test(rDono.grupo), `PV ${rDono.pv.length} chars`);
  check('No grupo só fica o aviso', /PV|privad/i.test(rDono.grupo), rDono.grupo);

  // ══ 4. PROMESSAS CUMPRIDAS ════════════════════════════════
  console.log('\n▸ Todo o comando anunciado EXISTE');
  const nc = require(path.join(__dirname, '..', 'src', 'bot', 'nativeCommands'));
  const pk = { ...require(path.join(__dirname, '..', 'src', 'bot', 'packages', 'interactions')),
               ...require(path.join(__dirname, '..', 'src', 'bot', 'packages', 'games')) };
  const existe = (c) => ch.CASES.has(c) || typeof nc[c] === 'function' || typeof pk[c] === 'function';

  // extrai os comandos mencionados no texto do menu
  const anunciados = [...new Set((conteudo.match(/\.([a-z0-9]{3,20})\b/gi) || [])
    .map(x => x.slice(1).toLowerCase()))]
        // ignora fragmentos de domínios (nekos.life, e621.net, erome.com)
    .filter(c => !['menu18', 'vip', 'com', 'net', 'wa', 'life', 'org', 're'].includes(c));
  const inexistentes = anunciados.filter(c => !existe(c));
  check('Nenhum comando fantasma no menu', inexistentes.length === 0,
    inexistentes.length ? inexistentes.join(', ') : `${anunciados.length} verificados`);

  // os que foram removidos por não existirem
  // v6.49: nekos/yande/kona/e621/adultstats foram IMPLEMENTADOS (as funções
  // já existiam no portal18.js, só faltavam os comandos). Continuam sem
  // implementação: xvideodl, livro, fig18, pack18.
  // v6.50: xvideodl, fig18 e pack18 foram implementados.
  // Já não há comandos fantasma no menu.
  const fantasmas = [];
  const aindaLa = fantasmas.filter(c => new RegExp('\\.' + c + '\\b', 'i').test(conteudo));
  check('Comandos inexistentes foram removidos', aindaLa.length === 0, aindaLa.join(', '));

  // ══ 5. HONESTIDADE SOBRE PERMISSÕES ═══════════════════════
  console.log('\n▸ O menu diz a verdade sobre quem pode usar');
  const vipTexto = rVip.pv + rVip.grupo;
  check('VIP é avisado do acesso limitado', /acesso limitado|só do Dono/i.test(vipTexto));
  check('Dono vê "acesso total"', /Acesso total/i.test(conteudo));
  check('Comandos só-dono estão marcados 👑', /👑\s*\.hentai/i.test(conteudo));
  check('Comandos de VIP estão marcados 💎', /💎\s*\.erome/i.test(conteudo));
  check('Tem legenda a explicar os símbolos', /👑 = só Dono/i.test(conteudo));

  // ══ 6. SEGURANÇA ══════════════════════════════════════════
  console.log('\n▸ Segurança');
  const p18 = require(path.join(__dirname, '..', 'src', 'bot', 'portal18'));
  const proibidos = ['loli', 'teen colegial', 'criança', 'rape', 'zoofilia', 'underage'];
  const bloqueados = proibidos.filter(t => p18.isBlocked ? p18.isBlocked(t) : false);
  check('Filtro de termos ilegais activo', bloqueados.length === proibidos.length, `${bloqueados.length}/${proibidos.length}`);

  const src = require('fs').readFileSync(path.join(__dirname, '..', 'src', 'bot', 'nativeCommands.js'), 'utf8');
  check('Portal desligado por omissão', /adult_mode_enabled['"]?,\s*false/.test(src));
  check('Comandos verificam o dono', /isPrimaryOwnerOnly\(ctx\)/.test(src));

  // ══ 7. ENTREGA DE MÍDIA (o que interessa mesmo) ══════════
  // Não basta o comando existir: tem de devolver imagem/vídeo.
  console.log('\n▸ Os comandos ENTREGAM mídia? (chamadas reais às APIs)');
  const fontes = [
    ['yande.re',   () => p18.yandeImages('nude', 1)],
    ['konachan',   () => p18.konachanImages('nude', 1)],
    ['e621',       () => p18.e621Images('rating:e', 1)],
    ['nekos.life', () => p18.nekosLifeImage('lewd')],
  ];
  let vivas = 0;
  const urls = [];
  for (const [nome, fn] of fontes) {
    try {
      const r = await fn();
      if (r?.length && r[0].url) { vivas++; urls.push([nome, r[0].url]); }
    } catch {}
  }
  check('Pelo menos 3 fontes de imagem vivas', vivas >= 3, `${vivas}/4`);

  // A URL devolvida entrega mesmo bytes?
  // v7.7 — tenta TODAS as fontes vivas (a 1.ª às vezes devolve URL quebrada).
  if (urls.length) {
    let bytes = 0, tipo = '', nomeOk = '';
    for (const [nome, u] of urls) {
      try {
        const ctl = new AbortController();
        const to = setTimeout(() => ctl.abort(), 20000);
        const r = await fetch(u, { signal: ctl.signal, headers: { 'User-Agent': 'DarkBot/6.4' } });
        const t = r.headers.get('content-type') || '';
        const b = Buffer.from(await r.arrayBuffer()).length;
        clearTimeout(to);
        if (b > 10000 && /image|video/.test(t)) { bytes = b; tipo = t; nomeOk = nome; break; }
      } catch {}
    }
    check('A URL entrega mídia real (bytes)', bytes > 10000, `${nomeOk || '?'}: ${bytes} bytes ${tipo}`);
  } else {
    check('A URL entrega mídia real (bytes)', false, 'nenhuma fonte respondeu');
  }

  // Comandos novos existem e são funções
  const nc2 = require(path.join(__dirname, '..', 'src', 'bot', 'nativeCommands'));
  const novos = ['yande', 'kona', 'e621', 'nekos', 'adultstats'];
  const emFalta = novos.filter(c => typeof nc2[c] !== 'function');
  check('Comandos novos registados', emFalta.length === 0, emFalta.length ? emFalta.join(', ') : novos.join(', '));

  // O import que faltava (72 usos rebentavam)
  const srcNC = require('fs').readFileSync(path.join(__dirname, '..', 'src', 'bot', 'nativeCommands.js'), 'utf8');
  check('portal18 está importado', /require\(['"]\.\/portal18['"]\)/.test(srcNC));

  // erome carregava?
  let eromeOk = false;
  try { const er = require(path.join(__dirname, '..', 'src', 'bot', 'erome')); eromeOk = typeof er.search === 'function'; } catch {}
  check('Módulo erome carrega', eromeOk);

  // ══ 8. FIGURINHAS E DOWNLOAD (v6.50) ═════════════════════
  console.log('\n▸ Figurinhas 18+ e download (entrega real)');
  const mh = require(path.join(__dirname, '..', 'src', 'bot', 'mediaHandler'));
  const sm = require(path.join(__dirname, '..', 'src', 'bot', 'stickerMaker'));

  const novos2 = ['fig18', 'pack18', 'xvideodl'];
  const falta2 = novos2.filter(c => typeof nc2[c] !== 'function');
  check('fig18/pack18/xvideodl registados', falta2.length === 0, falta2.join(', ') || novos2.join(', '));

  // a cadeia completa: fonte → bytes → figurinha WebP
  let figOk = false, figInfo = '';
  try {
    const imgs = await p18.nekosLifeImage('lewd');
    const buf = await mh.fetchBuffer(imgs[0].url);
    const fig = await sm.create(buf, { botName: 'DARK BOT', ownerName: 'Dark', userName: 'D', groupName: 'PV', packName: 'T', authorName: 'T' });
    figOk = !!fig && fig.length > 5000 && fig.slice(8, 12).toString() === 'WEBP';
    figInfo = `${buf.length} bytes → ${fig ? fig.length : 0} bytes WebP`;
  } catch (e) { figInfo = e.message.slice(0, 50); }
  check('Cadeia imagem → figurinha WebP', figOk, figInfo);

  // safebooru: rede de segurança quando as adultas falham
  let sbOk = false, sbInfo = '';
  try {
    const r = await p18.safebooruImages('', 1);
    sbOk = !!(r?.length && r[0].url && !/undefined/.test(r[0].url));
    sbInfo = sbOk ? r[0].url.slice(0, 50) : 'sem resultado';
  } catch (e) { sbInfo = e.message.slice(0, 45); }
  check('Fonte de reserva (safebooru) viva', sbOk, sbInfo);

  // ══ 9. BUSCA POR NOME · GIFs · ANIMADAS (v6.51) ══════════
  console.log('\n▸ Busca por nome, GIFs e figurinhas animadas');

  const novos3 = ['buscar18', 'gif18', 'gifreact', 'shorts18', 'figbusca', 'figgif', 'packbusca'];
  const falta3 = novos3.filter(c => typeof nc2[c] !== 'function');
  check('7 comandos novos registados', falta3.length === 0, falta3.join(', ') || `${novos3.length} ok`);

  // busca por nome devolve resultados relevantes
  let nomeOk = false, nomeInfo = '';
  try {
    const r = await p18.searchByName('hatsune miku', 2);
    nomeOk = !!(r?.length && r[0].url);
    nomeInfo = nomeOk ? `${r.length} de ${r[0].source}` : 'vazio';
  } catch (e) { nomeInfo = e.message.slice(0, 45); }
  check('Busca por nome funciona', nomeOk, nomeInfo);

  // GIF real (magic bytes)
  let gifOk = false, gifInfo = '';
  try {
    const g = await p18.purrbotGif('neko', true);
    const b = await mh.fetchBuffer(g[0].url);
    gifOk = b.length > 10000 && b.slice(0, 3).toString() === 'GIF';
    gifInfo = `${b.length} bytes, GIF=${b.slice(0, 3).toString() === 'GIF'}`;
  } catch (e) { gifInfo = e.message.slice(0, 45); }
  check('GIF animado entrega bytes reais', gifOk, gifInfo);

  // animados por nome (gif/webm)
  let animOk = false, animInfo = '';
  try {
    const r = await p18.searchAnimated('', 2);
    animOk = !!(r?.length && r[0].url);
    animInfo = animOk ? `${r.length} de ${r[0].source}` : 'vazio';
  } catch (e) { animInfo = e.message.slice(0, 45); }
  check('Shorts/animados encontrados', animOk, animInfo);

  // GIF → figurinha ANIMADA (chunk ANIM no WebP)
  let animFigOk = false, animFigInfo = '';
  try {
    const g = await p18.purrbotGif('neko', true);
    const b = await mh.fetchBuffer(g[0].url);
    const fig = await sm.create(b, { botName: 'D', ownerName: 'D', userName: 'D', groupName: 'PV', packName: 'T', authorName: 'T', isVideo: true });
    animFigOk = !!fig && fig.slice(8, 12).toString() === 'WEBP' && fig.includes(Buffer.from('ANIM'));
    animFigInfo = fig ? `${fig.length} bytes, animada=${fig.includes(Buffer.from('ANIM'))}` : 'null';
  } catch (e) { animFigInfo = e.message.slice(0, 45); }
  check('GIF → figurinha ANIMADA', animFigOk, animFigInfo);

  console.log(`\n  ${ok} OK / ${fail} FALHOU\n`);
  process.exit(fail ? 1 : 0);
})();
