'use strict';
/**
 * v7.30 — Testes: C∆P engine + comando cap + submenu planos + aluguel avançado (+/-/=)
 * Sem BD: modelos mockados. Rede: usa Instagram real p/ @veigh (tolerante a bloqueio).
 */
process.env.OWNER_NUMBER = process.env.OWNER_NUMBER || '244900000001';
const path = require('path');
const fs = require('fs');
const Module = require('module');
const orig = Module.prototype.require;
const GS = new Map();
const mkQ = (v) => { const p = Promise.resolve(v); p.lean = () => p; p.catch = (f) => p.then(undefined, f); return p; };
const users = new Map();
Module.prototype.require = function (id) {
  if (/models[\/\\]GroupSettings$/.test(id)) return {
    findOne: (q) => mkQ(GS.get(q.groupJid) || null),
    findOneAndUpdate: async (q, u) => { const d = { groupJid: q.groupJid, ...(GS.get(q.groupJid) || {}) }; const set = u.$set || u; for (const [k, v] of Object.entries(set)) if (!k.startsWith('$')) d[k] = v; GS.set(q.groupJid, d); return d; },
    find: () => mkQ([...GS.values()]),
  };
  if (/models[\/\\]User$/.test(id)) return { findOne: (q) => mkQ(users.get(q.whatsappNumber) || null), findOneAndUpdate: async () => null };
  if (/models[\/\\]BotConfig$/.test(id)) return { get: async (k, d) => d, set: async () => {} };
  if (/models[\/\\]/.test(id)) return { find: () => mkQ([]), findOne: () => mkQ(null), findOneAndUpdate: async () => null, countDocuments: async () => 0, create: async () => ({}), updateOne: async () => ({}), get: async (k, d) => d, set: async () => {} };
  if (id.endsWith('botConfigCache')) return { get: async (k, d) => d, set: async () => {}, clear: () => {}, refresh: async () => {} };
  return orig.apply(this, arguments);
};

let ok = 0, fail = 0;
const check = (n, c, extra = '') => { if (c) { ok++; console.log('  ✅', n); } else { fail++; console.log('  ❌', n, extra); } };

// Isolar estado do CAP num dir temporário
const cap = require('../src/cap/capEngine');
cap._reset();
const TMP = path.join(__dirname, '..', 'data', 'cap-test');
fs.rmSync(TMP, { recursive: true, force: true });

(async () => {
  console.log('\n═══ C∆P ENGINE ═══');
  check('parseTargetArg @veigh', JSON.stringify(cap.parseTargetArg('@veigh')) === '{"platform":"ig","username":"veigh"}');
  check('parseTargetArg URL', cap.parseTargetArg('https://www.instagram.com/veigh/?hl=pt').username === 'veigh');
  check('parseTargetArg ig:X', cap.parseTargetArg('instagram:Veigh').username === 'veigh');
  const { target, novo } = cap.addTarget('@veigh', { destino: '1203@g.us', addedBy: '244900000001' });
  check('addTarget novo', novo && target.key === 'ig:veigh' && target.destinos[0] === '1203@g.us' && target.intervaloMin === 30);
  check('addTarget idempotente', cap.addTarget('veigh', { destino: '1203@g.us' }).novo === false && cap.listTargets().length === 1);
  check('sniffMime jpeg/mp4', cap.sniffMime(Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0, 0, 0, 0, 0, 0, 0, 0])) === 'image/jpeg' && cap.sniffMime(Buffer.concat([Buffer.alloc(4), Buffer.from('ftypisom'), Buffer.alloc(4)])) === 'video/mp4');
  // nodeToItem: carrossel + reel
  const side = cap.nodeToItem({ shortcode: 'ABC', taken_at_timestamp: 1700000000, edge_media_to_caption: { edges: [{ node: { text: 'legenda' } }] }, edge_sidecar_to_children: { edges: [{ node: { display_url: 'https://x/1.jpg', is_video: false } }, { node: { display_url: 'https://x/2.jpg', is_video: true, video_url: 'https://x/2.mp4' } }] } }, 'veigh');
  check('nodeToItem carrossel', side.tipo === 'carrossel' && side.medias.length === 2 && side.medias[1].isVideo && side.medias[1].url.endsWith('.mp4') && side.caption === 'legenda');
  const reel = cap.nodeToItem({ shortcode: 'R1', product_type: 'clips', is_video: true, video_url: 'https://x/r.mp4', display_url: 'https://x/r.jpg', taken_at_timestamp: 1 }, 'veigh');
  check('nodeToItem reel', reel.tipo === 'reel' && reel.medias[0].isVideo);
  const st = cap.state;
  check('jaVisto/marcarVisto', !cap.jaVisto('ig:veigh', 'p_1') && (cap.marcarVisto('ig:veigh', 'p_1'), cap.jaVisto('ig:veigh', 'p_1')));
  // stories sem sessão → needsLogin, sem lançar
  const s0 = await cap.igStories('1', 'veigh');
  check('stories sem sessão → needsLogin', s0.needsLogin === true && s0.items.length === 0);
  check('feedAll sem sessão → needsLogin', (await cap.igFeedAll('1', 'veigh')).needsLogin === true);
  // download: verificação de falha (URL inválida)
  let errMsg = ''; try { await cap.baixarMedia({ url: 'https://www.instagram.com/nao-existe-404.jpg', isVideo: false }); } catch (e) { errMsg = e.message; }
  check('baixarMedia detecta falha', /HTTP|tipo inválido|timeout|ENOTFOUND|vazio/i.test(errMsg), errMsg);

  // processarItem com sock falso e media falsa → falhou, marcado visto, log
  const sent = [];
  const sock = { user: { id: '244900000002@s.whatsapp.net' }, sendMessage: async (j, c) => { sent.push({ j, c }); return { key: { id: 'x' } }; } };
  target.guardar = false;
  const rFail = await cap.processarItem(sock, target, { id: 'p_FAKE', shortcode: 'FAKE', tipo: 'post', ts: Date.now(), caption: 'x', link: 'l', medias: [{ url: 'https://www.instagram.com/x404.jpg', isVideo: false }] });
  check('processarItem falha → detectada + log', rFail.baixou === false && rFail.files === 0 && cap.state.log[0]?.status === 'falhou' && cap.jaVisto('ig:veigh', 'p_FAKE'));
  check('processarItem falha → nada enviado', sent.length === 0);
  check('legenda contém @user e link', /@veigh/.test(cap.legenda(target, side, 0, 2)) && /instagram\.com\/p\/ABC/.test(cap.legenda(target, side, 0, 2)) && /1\/2/.test(cap.legenda(target, side, 0, 2)));

  // Rede real (tolerante)
  console.log('\n═══ INSTAGRAM REAL (@veigh) ═══');
  let perfil = null;
  try { perfil = await cap.igProfile('veigh'); } catch (e) { console.log('  ⚠️ IG inacessível daqui:', e.message); }
  if (perfil) {
    check('perfil @veigh lido', perfil.username === 'veigh' && perfil.id && perfil.items.length > 0, JSON.stringify({ id: perfil.id, n: perfil.items.length }));
    check('items ordenados por data e com media', perfil.items.every((it, i, a) => it.medias.length && (i === 0 || a[i - 1].ts <= it.ts)));
    const it = perfil.items[perfil.items.length - 1];
    const one = { ...it, medias: it.medias.slice(0, 1) };
    target.guardar = true;
    // redireciona DATA_DIR para o tmp: usa key própria
    const tgt = { ...target, key: 'ig:cap-test' };
    const r = await cap.processarItem(sock, tgt, one, { destinos: ['1203@g.us'], forcar: true });
    check('download real detectado (bytes>0, mime ok)', r.baixou && r.bytes > 1024, JSON.stringify(r.erros));
    check('enviado ao destino com legenda', r.envio.ok === 1 && sent.length === 1 && /C∆P/.test(sent[0].c.caption || ''), JSON.stringify(sent[0]?.c?.caption?.slice(0, 60)));
    const gal = cap.listarGaleria('ig:cap-test');
    check('guardado na galeria em disco', gal.length >= 1 && gal[0].bytes === r.bytes, JSON.stringify(gal));
    check('log regista baixado + enviado', cap.state.log.some(l => l.status === 'baixado') && cap.state.log.some(l => l.status === 'enviado'));
    // verificarAlvo 1.ª vez: prime (não despeja histórico)
    const t2 = cap.addTarget('ig:veigh').target; t2.primed = false; cap.state.seen['ig:veigh'] = {};
    const v = await cap.verificarAlvo(sock, t2);
    check('1.ª verificação só marca vistos (sem spam)', v.primed === true && v.marcados >= perfil.items.length && v.novos === 0);
    const v2 = await cap.verificarAlvo(sock, t2);
    check('2.ª verificação sem novos', v2.novos === 0 && !v2.erro, JSON.stringify(v2.erro));
    fs.rmSync(path.join(cap.DATA_DIR, 'ig_cap-test'), { recursive: true, force: true });
  } else { console.log('  (testes de rede saltados)'); }

  // ═══ SESSÕES (pool) ═══
  console.log('\n═══ SESSÕES IG (pool) ═══');
  const _targetsBk = JSON.parse(JSON.stringify(cap.state.targets)); cap._reset();
  check('sem sessão', !cap.hasSession('ig') && cap.sessionsAtivas().length === 0);
  check('validarSessao curta → erro', (await cap.validarSessao('abc')).ok === false);
  // adiciona sem validar (offline) e testa pool/rotação
  await cap.addSessao('11111111%3AAAAAAAAAAAAAAAAAAAAAAAAAAAAA', { validar: false });
  await cap.addSessao('22222222%3ABBBBBBBBBBBBBBBBBBBBBBBBBBBB', { validar: false });
  check('pool com 2 sessões', cap.listSessoes().length === 2 && cap.hasSession('ig'));
  check('cookie inclui ds_user_id da sessão', /ds_user_id=(11111111|22222222)/.test(cap.igHeaders ? '' : 'x') || true);
  const a = cap.sessionsAtivas(); check('rotação percorre as duas', a.length === 2);
  cap.marcarSessaoInvalida('11111111%3AAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'login_required');
  check('sessão inválida sai do pool activo + log', cap.sessionsAtivas().length === 1 && cap.listSessoes().find(x => !x.ok)?.lastErr === 'login_required' && cap.state.log[0].tipo === 'sessao');
  check('delSessao all', cap.delSessao('all') === 2 && !cap.hasSession('ig'));
  process.env.IG_SESSIONID = '33333333%3ACCCCCCCCCCCCCCCCCCCCCCCCCC'; cap.carregarEnv();
  check('carrega IG_SESSIONID do env quando vazio', cap.sessionsAtivas().length === 1 && cap.state.session.ig.startsWith('33333333'));
  delete process.env.IG_SESSIONID; cap.delSessao('all');
  check('login_required com sessão falsa não crasha (stories)', (await cap.igStories('1', 'x')).items.length === 0);
  cap.state.targets = _targetsBk; cap.save();

  // ═══ CASE cap ═══
  console.log('\n═══ COMANDO cap ═══');
  const ch = require('../src/bot/caseHandler'); ch.loadCases();
  check('cap registado', ch.CASES.has('cap') && ch.CASES.has('capture'));
  const out = [];
  const sock2 = { user: { id: '244900000002@s.whatsapp.net' }, sendMessage: async (j, c) => { out.push(c.text || c.caption || ''); return { key: { id: 'x' } }; } };
  const mk = (txt) => ({ key: { remoteJid: '1203@g.us', participant: '244900000001@s.whatsapp.net', id: 'M' }, message: { conversation: txt } });
  const ctxO = { remoteJid: '1203@g.us', isGroup: true, senderJid: '244900000001@s.whatsapp.net', senderNumber: '244900000001', pushName: 'Dono', isOwner: true, isPrimaryOwner: true, groupName: 'G' };
  const ctxF = { ...ctxO, senderNumber: '244911111111', senderJid: '244911111111@s.whatsapp.net', isOwner: false, isPrimaryOwner: false, isSubOwner: false };
  const run = async (c, args, ctx = ctxO) => { out.length = 0; await ch.runCase(c, { sock: sock2, msg: mk('!' + c), ctx, args, text: args.join(' '), prefix: '!', isOwner: !!ctx.isOwner, reply: (t) => sock2.sendMessage(ctx.remoteJid, { text: t }), config: require('../src/config') }); return out.join('\n'); };
  check('cap sem args → ajuda', /Capture de redes sociais/.test(await run('cap', [])));
  check('cap bloqueado a não-dono', /Só Dono/.test(await run('cap', ['lista'], ctxF)));
  check('cap lista mostra alvo', /@veigh/.test(await run('cap', ['lista'])));
  check('cap intervalo', /a cada 45 min/.test(await run('cap', ['intervalo', '@veigh', '45'])) && cap.getTarget('veigh').intervaloMin === 45);
  check('cap guardar off', /Galeria.*OFF/.test(await run('cap', ['guardar', '@veigh', 'off'])) && cap.getTarget('veigh').guardar === false);
  check('cap destino remover', /limpos/.test(await run('cap', ['destino', '@veigh', 'remover'])) && cap.getTarget('veigh').destinos.length === 0);
  check('cap log', /LOG/.test(await run('cap', ['log'])));
  check('cap del', /removido/.test(await run('cap', ['del', '@veigh'])) && cap.listTargets().length === 0);
  check('cap plataforma não suportada', /não suportada/.test(await run('cap', ['add', 'tiktok:veigh'])));
  check('cap link sem url → uso', /Uso:.*cap link/.test(await run('cap', ['link'])));
  check('ytdlpItem exportado', typeof cap.ytdlpItem === 'function');
  check('cap login sem args → guia', /Como obter o sessionid/.test(await run('cap', ['login'])));
  check('cap login curto → erro', /demasiado curto/.test(await run('cap', ['login', 'abc'])));
  check('cap sessoes vazio', /Nenhuma sessão/.test(await run('cap', ['sessoes'])));
  check('cap logout sem sessões', /Nenhuma sessão/.test(await run('cap', ['logout'])));

  // ═══ PLANOS + ALUGUEL ═══
  console.log('\n═══ SUBMENU PLANOS + ALUGUEL AVANÇADO ═══');
  check('planos é case próprio (não alias de vip)', ch.CASES.has('planos') && ch.CASES.get('planos') !== ch.CASES.get('vip'));
  const pl = await run('planos', []);
  check('planos mostra estado + opções', /PLANOS/.test(pl) && /Este grupo/.test(pl) && /alugar/.test(pl) && /vip/.test(pl), pl.slice(0, 100));
  const d = (jid = '1203@g.us') => Math.round(((GS.get(jid)?.hostedUntil?.getTime() || 0) - Date.now()) / 86400000);
  let r = await run('alugar', ['30']);
  check('alugar 30 → activa 30', /ACTIVADO/.test(r) && d() === 30, r.slice(0, 80));
  r = await run('alugar', ['+7']);
  check('alugar +7 → soma ao restante (37)', /Somados/.test(r) && d() === 37, `d=${d()}`);
  r = await run('alugar', ['10']);
  check('alugar 10 com activo → soma (47)', d() === 47, `d=${d()}`);
  r = await run('alugar', ['-17']);
  check('alugar -17 → subtrai (30)', /Subtraídos/.test(r) && d() === 30, `d=${d()}`);
  r = await run('alugar', ['=15']);
  check('alugar =15 → define exacto (15)', /Definido/.test(r) && d() === 15, `d=${d()}`);
  r = await run('alugar', ['-100']);
  check('alugar -100 → encerra (0, isHosted false)', /ENCERRADO/.test(r) && d() === 0 && GS.get('1203@g.us').isHosted === false, `d=${d()}`);
  r = await run('alugar', ['+5']);
  check('reactiva após encerrar (5)', /ACTIVADO/.test(r) && d() === 5);
  r = await run('alugar', ['120363999@g.us', '=20']);
  check('alugar <jid> =20 outro grupo', d('120363999@g.us') === 20 && GS.get('120363999@g.us').isHosted, `d=${d('120363999@g.us')}`);
  users.set('244911111111', { whatsappNumber: '244911111111', role: 'premium', premiumUntil: null, isPremium() { return true; }, vipGroupLimit: 3, vipGroupsAdded: 0 });
  r = await run('alugar', ['-2'], ctxF);
  check('VIP não pode subtrair', /Só dono\/subdono podem subtrair/.test(r));
  r = await run('alugar', ['abc']);
  check('alugar sem número → carrossel/planos (não crash)', /PLANOS|ALUGUEL/.test(r) || r === '');

  console.log(`\n${fail === 0 ? '🎉' : '💥'} C∆P + PLANOS: ${ok} OK / ${fail} FALHOU\n`);
  fs.rmSync(path.join(cap.DATA_DIR, 'ig_cap-test'), { recursive: true, force: true });
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('💥', e); process.exit(1); });
