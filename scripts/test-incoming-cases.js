'use strict';
/**
 * v7.47 — Testa TODOS os comandos vindos de incoming-cases + motores:
 *  tools (tourl/fakechat/fdc/grok/tikpic/pdf/upscale/edit/ff/spotifysearch)
 *  games (minado) · admin (delstts/horarios/antifoba/autoapresentar)
 *  engines (antiFoba, autoApresentar, scheduler.checkGroupSchedules)
 *  tomp3 fundido (downloads2) · cep enriquecido (search2)
 *  submenuData.categorize (sem órfãos) · auraUniversal (sinónimos novos)
 *
 * Rede externa: stubbed (axios + fetch). DB: stubbed (memória).
 */
process.env.OWNER_NUMBER = '244900000001';
process.env.BOT_NUMBER = '244900000002';
process.env.NYX_FF_TOKEN = 'TESTTOKEN';

const Module = require('module');
const orig = Module.prototype.require;

// ── GroupSettings em memória ─────────────────────────────────────
const gsStore = new Map();
function gsDoc(jid) {
  if (!gsStore.has(jid)) {
    gsStore.set(jid, {
      groupJid: jid, antifoba: false, fobaBlacklist: [], autoapresentar: false,
      aberturaHora: '', fechamentoHora: '', horariosExecuted: {},
      save: async function () { return this; },
    });
  }
  return gsStore.get(jid);
}
const w = (v) => { const p = Promise.resolve(v); p.lean = () => p; p.select = () => p; p.sort = () => p; p.limit = () => p; p.catch = () => p; return p; };

// ── axios stub (APIs externas) ───────────────────────────────────
const axiosStub = {
  get: async (url) => {
    const u = String(url);
    if (u.includes('fatosdesconhecidos')) return { data: { status: true, resultado: { titulo: 'TITULO TESTE', conteudo: 'CONTEUDO TESTE', imagem: null } } };
    if (u.includes('grok-4-5')) return { data: { status: true, text: 'RESPOSTA GROK TESTE' } };
    if (u.includes('photooxy/tiktok')) return { data: { status: true, imagem: 'https://cdn.test/tt.jpg' } };
    if (u.includes('nyxlikesff.store/info')) return { data: { status: 'success', nickname: 'NICKTESTE', id: '123', level: 70, likes: 5000, xp: 999, region: 'BR', br_max_rank: 'Diamante', br_rank_point: 3000 } };
    if (u.includes('nyxlikesff.store/like')) return { data: { status: 'success', nickname: 'NICKTESTE', likes_added: 100, likes_before: 5000, likes_end: 5100 } };
    if (u.includes('nano-banana/status')) return { data: { estado: 'done', imagem: 'https://cdn.test/edit.jpg' } };
    if (u.includes('viacep.com.br')) return { data: { cep: '01001-000', logradouro: 'Praça da Sé', bairro: 'Sé', localidade: 'São Paulo', uf: 'SP', regiao: 'Sudeste', complemento: 'lado ímpar' } };
    throw new Error('axios stub: URL inesperada ' + u.slice(0, 60));
  },
};

// ── downloadMediaMessage stub (flag-gated) ───────────────────────
const FAKE_IMG = Buffer.from('FAKEIMAGEDATA'.repeat(100));
const FAKE_VID = Buffer.from('FAKEVIDEODATA'.repeat(100));

Module.prototype.require = function (id) {
  if (/models[\\/]GroupSettings/.test(id)) {
    return {
      findOne: (q) => w(gsDoc(q.groupJid)),
      findOneAndUpdate: async (q, u) => {
        const d = gsDoc(q.groupJid);
        const set = u.$set || u;
        for (const [k, v] of Object.entries(set)) {
          if (k.startsWith('$')) continue;
          if (k.includes('.')) { const [a, b] = k.split('.'); d[a] = d[a] || {}; d[a][b] = v; }
          else d[k] = v;
        }
        return d;
      },
      updateOne: async (q, u) => {
        const d = gsDoc(q.groupJid);
        const set = u.$set || u;
        for (const [k, v] of Object.entries(set)) {
          if (k.startsWith('$')) continue;
          if (k.includes('.')) { const [a, b] = k.split('.'); d[a] = d[a] || {}; d[a][b] = v; }
          else d[k] = v;
        }
      },
      find: (q) => {
        const all = [...gsStore.values()].filter(g =>
          (g.aberturaHora && g.aberturaHora !== '') || (g.fechamentoHora && g.fechamentoHora !== ''));
        return w(all);
      },
      create: async () => ({}),
    };
  }
  if (/models[\\/]/.test(id)) return { find: () => w([]), findOne: () => w(null), findOneAndUpdate: async () => null, countDocuments: async () => 0, create: async () => ({}), updateOne: async () => ({}), deleteMany: async () => ({}), deleteOne: async () => ({}) };
  if (id === 'axios') return axiosStub;
  if (id === '../ai' || id.endsWith('/bot/ai')) return { chat: async () => 'CONTEUDO IA PARA TESTE DO PDF' };
  if (id === 'baileys-v6' && global.__STUB_DL__) {
    return { downloadMediaMessage: async () => (global.__STUB_DL__ === 'video' ? FAKE_VID : FAKE_IMG) };
  }
  if (id.endsWith('botConfigCache')) return { get: async (k, d) => d, set: async () => {}, clear: () => {}, refresh: async () => {} };
  if (id === './whatsapp' || id === '../whatsapp') return { getBot: () => global.__FAKEBOT__ || {} };
  return orig.apply(this, arguments);
};

// ── fetch stub (catbox / vyro / nano-banana create) ──────────────
const realFetch = global.fetch;
global.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.includes('catbox.moe')) return { ok: true, text: async () => 'https://files.catbox.moe/abc123.jpg' };
  if (u.includes('0x0.st')) return { ok: true, text: async () => 'https://0x0.st/abc123.jpg' };
  if (u.includes('inferenceengine.vyro.ai')) return { ok: true, arrayBuffer: async () => FAKE_IMG };
  if (u.includes('nano-banana?')) return { ok: true, json: async () => ({ status: true, job_id: 'JOB1' }) };
  if (u.includes('systemzone.store/api/photooxy')) return { ok: true, json: async () => ({ status: true, imagem: 'https://cdn.test/tt.jpg' }) };
  throw new Error('fetch stub: URL inesperada ' + u.slice(0, 60));
};

const ch = require('../src/bot/caseHandler');
ch.loadCases();

// mediaHandler já capturou o baileys real no loadCases → override direto,
// gated por flag (sem flag = falha como na vida real sem mídia válida).
const mh = require('../src/bot/mediaHandler');
mh.downloadFromMessage = async () => {
  if (!global.__STUB_DL__) throw new Error('download real indisponível em teste');
  return global.__STUB_DL__ === 'video' ? FAKE_VID : FAKE_IMG;
};

let ok = 0, fail = 0;
const t = (n, c, d = '') => { c ? ok++ : fail++; console.log(`  ${c ? '✅' : '❌'} ${n}${d ? ' — ' + String(d).slice(0, 120) : ''}`); };

// ── fakes ────────────────────────────────────────────────────────
const G = '120363@g.us';
const DONO = '244900000001@s.whatsapp.net';
const BOT = '244900000002@s.whatsapp.net';
const MEMBRO = '244900000003@s.whatsapp.net';
const sent = [];
const kicked = [];
const settingUpdates = [];

const sock = {
  user: { id: '244900000002:1@s.whatsapp.net' },
  sendMessage: async (jid, content) => {
    sent.push({ jid, ...content });
    if (content?.delete) return {};
    return { key: { id: 'K' + sent.length, remoteJid: jid, fromMe: true } };
  },
  groupMetadata: async () => ({
    subject: 'Grupo Teste',
    participants: [
      { id: DONO, admin: 'superadmin' },
      { id: BOT, admin: 'admin' },
      { id: MEMBRO },
    ],
  }),
  groupParticipantsUpdate: async (jid, ps, action) => { kicked.push({ jid, ps, action }); return []; },
  groupSettingUpdate: async (jid, setting) => { settingUpdates.push({ jid, setting }); },
};

function mkMsg(over = {}) {
  return {
    key: { remoteJid: G, participant: DONO, id: 'M' + Math.random().toString(36).slice(2), fromMe: false },
    pushName: 'Dono',
    message: { conversation: '!teste' },
    ...over,
  };
}
function mkCtx(over = {}) {
  return {
    remoteJid: G, isGroup: true, senderJid: DONO, senderNumber: '244900000001',
    pushName: 'Dono', isOwner: true, isPrimaryOwner: true, prefix: '!', ...over,
  };
}
async function run(cmd, { args = [], text = '', msg = null, ctx = null, isOwner = true } = {}) {
  sent.length = 0;
  const m = msg || mkMsg();
  const c = ctx || mkCtx();
  const r = await ch.runCase(cmd, { sock, msg: m, ctx: c, args, text, prefix: '!', isOwner, config: {} });
  await new Promise(r2 => setTimeout(r2, 50));
  return { ran: r, out: sent.map(s => s.text || s.caption || Object.keys(s).join(',')), raw: [...sent] };
}
const said = (arr, re) => arr.some(o => re.test(String(o)));

// ── SUITE ────────────────────────────────────────────────────────
(async () => {
  console.log('── incomingTools: tourl ──');
  let r = await run('tourl');
  t('tourl sem mídia → ajuda', said(r.out, /Responde a uma|mídia/i), r.out[0]);
  global.__STUB_DL__ = 'image';
  r = await run('tourl', { msg: mkMsg({ message: { extendedTextMessage: { text: '!tourl', contextInfo: { stanzaId: 'Q1', participant: DONO, quotedMessage: { imageMessage: { mimetype: 'image/jpeg' } } } } } }) });
  global.__STUB_DL__ = null;
  t('tourl com imagem → URL catbox', said(r.out, /catbox\.moe/), r.out.join(' | '));

  console.log('── incomingTools: fakechat ──');
  r = await run('fakechat');
  t('fakechat sem args → formato', said(r.out, /Formato incorreto/), r.out[0]);
  r = await run('fakechat', { text: 'oi|tchau' });
  t('fakechat sem quote → pede quote', said(r.out, /Responde à mensagem/), r.out[0]);
  r = await run('fakechat', {
    text: 'mensagem fake|resposta do bot',
    msg: mkMsg({ message: { extendedTextMessage: { text: '!fakechat x', contextInfo: { stanzaId: 'Q2', participant: MEMBRO, quotedMessage: { conversation: 'alvo' } } } } }),
  });
  t('fakechat com quote → envia c/ quote falso', r.raw.some(s => s.text === 'resposta do bot'), JSON.stringify(r.raw.map(s => s.text)));

  console.log('── incomingTools: fdc / grok / tiktokphoto ──');
  r = await run('fdc');
  t('fdc → título da API', said(r.out, /TITULO TESTE/), r.out[0]);
  r = await run('grok');
  t('grok sem texto → uso', said(r.out, /Uso:/), r.out[0]);
  r = await run('grok', { text: 'quem és tu' });
  t('grok → resposta da API', said(r.out, /RESPOSTA GROK/), r.out.join(' | '));
  r = await run('tiktokphoto');
  t('tiktokphoto sem args → ajuda', said(r.out, /PHOTO OXY/), r.out[0]);
  r = await run('tiktokphoto', { text: 'Grande|pequeno' });
  t('tiktokphoto → imagem', r.raw.some(s => s.image), JSON.stringify(r.raw.map(s => Object.keys(s))));

  console.log('── incomingTools: pdf ──');
  r = await run('pdf');
  t('pdf sem texto → ajuda', said(r.out, /transformar em PDF/i), r.out[0]);
  r = await run('pdf', { text: 'currículo do João' });
  t('pdf → documento (.txt fallback sem pdfkit, .pdf se instalado)',
    r.raw.some(s => s.document && /documento_\d+\.(txt|pdf)/.test(s.fileName || '')), JSON.stringify(r.raw.map(s => s.fileName)));

  console.log('── incomingTools: upscale ──');
  r = await run('upscale');
  t('upscale sem imagem → ajuda', said(r.out, /JPEG\/PNG/), r.out[0]);
  global.__STUB_DL__ = 'image';
  r = await run('hd', { msg: mkMsg({ message: { extendedTextMessage: { text: '!hd', contextInfo: { stanzaId: 'Q3', participant: DONO, quotedMessage: { imageMessage: { mimetype: 'image/jpeg' } } } } } }) });
  global.__STUB_DL__ = null;
  t('hd com imagem → imagem melhorada', r.raw.some(s => s.image), JSON.stringify(r.raw.map(s => Object.keys(s))));

  console.log('── incomingTools: edits/editl/edit ──');
  r = await run('edits');
  t('edits sem imagem → ajuda', said(r.out, /adicionar à seleção/), r.out[0]);
  global.__STUB_DL__ = 'image';
  const qImg = () => mkMsg({ message: { extendedTextMessage: { text: '!edits', contextInfo: { stanzaId: 'Q4', participant: DONO, quotedMessage: { imageMessage: { mimetype: 'image/jpeg' } } } } } });
  r = await run('edits', { msg: qImg() });
  t('edits guarda 1.ª imagem', said(r.out, /Imagem 1 adicionada/), r.out[0]);
  r = await run('edits', { msg: qImg() });
  t('edits guarda 2.ª imagem', said(r.out, /Imagem 2 adicionada/), r.out[0]);
  r = await run('edits', { msg: qImg() });
  t('edits 3.ª → limite 2', said(r.out, /máximo 2/), r.out[0]);
  r = await run('edit', { text: '' });
  t('edit sem prompt → pede prompt', said(r.out, /Diz o que queres editar|quero.*editar/i), r.out[0]);
  r = await run('edit', { text: 'faz ela sorrir' });
  global.__STUB_DL__ = null;
  t('edit → imagem editada', r.raw.some(s => s.image), JSON.stringify(r.raw.map(s => Object.keys(s))));
  const editMod = require('../src/bot/cases/incomingTools');
  t('edit consome a sessão', (editMod._editSessions?.size || 0) === 0);
  r = await run('editl');
  t('editl limpa', said(r.out, /limpa/), r.out[0]);

  console.log('── incomingTools: Free Fire ──');
  delete process.env.NYX_FF_TOKEN;
  r = await run('infoff', { text: '123' });
  t('infoff sem token → msg config', said(r.out, /NYX_FF_TOKEN/), r.out[0]);
  process.env.NYX_FF_TOKEN = 'TESTTOKEN';
  r = await run('infoff');
  t('infoff sem UID → uso', said(r.out, /Uso:/), r.out[0]);
  r = await run('infoff', { text: 'abc' });
  t('infoff UID inválido → erro', said(r.out, /só números/), r.out[0]);
  r = await run('perfilff', { text: '123' });
  t('perfilff → painel jogador', said(r.out, /NICKTESTE/), r.out[0]);
  r = await run('like');
  t('like sem UID → uso', said(r.out, /Uso:/), r.out[0]);
  r = await run('enviarlike', { text: '123' });
  t('enviarlike → sucesso +100', said(r.out, /\+100/), r.out[0]);

  console.log('── incomingTools: spotifysearch ──');
  r = await run('spotifysearch');
  t('spotifysearch delega ao spotify (uso)', said(r.out, /spotify/i), r.out[0]);

  console.log('── incomingGames: minado ──');
  r = await run('minado');
  t('minado ajuda', said(r.out, /JOGO MINADO/), r.out[0]);
  r = await run('minado', { args: ['iniciar', 'facil'] });
  t('minado iniciar facil → tabuleiro 5x5', said(r.out, /Nível: Fácil/) && /⬜/.test(r.out.join('')), r.out[0]?.slice(0, 60));
  r = await run('minado', { args: ['ver'] });
  t('minado ver → tabuleiro', said(r.out, /MINADO/), r.out[0]?.slice(0, 40));
  r = await run('minado', { args: ['abrir', 'ZZ'] });
  t('minado abrir inválida → erro', said(r.out, /Posição inválida/), r.out[0]);
  r = await run('campominado', { args: ['marcar', 'A1'] });
  t('campominado (alias) marcar A1 → 🚩', said(r.out, /Casa marcada/), r.out[0]?.slice(0, 50));
  r = await run('minado', { args: ['desmarcar', 'A1'] });
  t('minado desmarcar A1', said(r.out, /Bandeira removida/), r.out[0]?.slice(0, 50));
  r = await run('minado', { args: ['abrir', 'A1'] });
  t('minado abrir A1 → casa aberta ou bomba', said(r.out, /Casa aberta|bomba/i), r.out[0]?.slice(0, 50));
  await run('minado', { args: ['iniciar', 'facil'] }); // v7.60: garante partida p/ sair (abrir pode rebentar = flake)
  r = await run('minado', { args: ['sair'] });
  t('minado sair', said(r.out, /encerrada/), r.out[0]);
  r = await run('minado', { args: ['ver'] });
  t('minado ver sem partida → aviso', said(r.out, /Não tens partida/), r.out[0]);

  console.log('── incomingAdmin: delstts ──');
  r = await run('delstts', { ctx: mkCtx({ isGroup: false, remoteJid: DONO }), isOwner: true });
  t('delstts fora de grupo → erro', said(r.out, /só funciona em grupos/i), r.out[0]);
  r = await run('delstts', { ctx: mkCtx({ senderJid: MEMBRO, senderNumber: '244900000003', isOwner: false }), isOwner: false });
  t('delstts não-admin → negado', said(r.out, /Apenas \*admins/), r.out[0]);
  r = await run('delstts');
  t('delstts admin sem quote → pede quote', said(r.out, /Responde ao status/), r.out[0]);
  r = await run('delstts', { msg: mkMsg({ message: { extendedTextMessage: { text: '!delstts', contextInfo: { stanzaId: 'ST1', participant: MEMBRO, quotedMessage: { conversation: 'status' } } } } }) });
  t('delstts admin+quote → apaga', r.raw.some(s => s.delete) && said(r.out, /apagado/i), r.out.join(' | '));

  console.log('── incomingAdmin: horários ──');
  r = await run('abrirgp', { args: ['25:99'] });
  t('abrirgp hora inválida → erro', said(r.out, /Formato inválido/i), r.out[0]);
  r = await run('abertura', { args: ['06:00'] });
  t('abertura 06:00 → agenda', said(r.out, /ABRIR.*06:00/), r.out[0]);
  r = await run('fechargp', { args: ['23:00'] });
  t('fechargp 23:00 → agenda', said(r.out, /FECHAR.*23:00/), r.out[0]);
  r = await run('horariosgp');
  t('horariosgp mostra os dois', said(r.out, /06:00/) && said(r.out, /23:00/), r.out[0]);
  t('horários persistidos no GS', gsDoc(G).aberturaHora === '06:00' && gsDoc(G).fechamentoHora === '23:00');
  r = await run('limparhorarios');
  t('limparhorarios limpa', gsDoc(G).aberturaHora === '' && said(r.out, /removidos/), r.out[0]);
  // scheduler executa no horário (tempo fake)
  gsDoc(G).aberturaHora = '06:00'; gsDoc(G).fechamentoHora = '23:00';
  // Horários são automação de serviço: esta parte testa o caminho activo.
  gsDoc(G).isHosted = true;
  gsDoc(G).hostedUntil = new Date(Date.now() + 60_000);
  gsDoc(G).horariosExecuted = {};
  global.__FAKEBOT__ = { sock, connectionStatus: 'connected' };
  const sched = require('../src/bot/scheduler');
  const moment = require('moment-timezone');
  settingUpdates.length = 0;
  await sched.checkGroupSchedules(moment.tz('2026-01-02 06:00', 'Africa/Luanda'));
  t('scheduler abre às 06:00', settingUpdates.some(s => s.setting === 'not_announcement'), JSON.stringify(settingUpdates));
  t('scheduler marca executado', gsDoc(G).horariosExecuted.abertura === '2026-01-02');
  settingUpdates.length = 0;
  await sched.checkGroupSchedules(moment.tz('2026-01-02 06:00', 'Africa/Luanda'));
  t('scheduler não repete no dia', settingUpdates.length === 0);
  await sched.checkGroupSchedules(moment.tz('2026-01-02 23:00', 'Africa/Luanda'));
  t('scheduler fecha às 23:00', settingUpdates.some(s => s.setting === 'announcement'));
  t('scheduler exporta checkGroupSchedules', typeof sched.checkGroupSchedules === 'function');

  console.log('── incomingAdmin: antifoba ──');
  r = await run('antifoba');
  t('antifoba sem args → alterna p/ ON', said(r.out, /ATIVADO/) && gsDoc(G).antifoba === true, r.out[0]);
  r = await run('antifoba', { args: ['status'] });
  t('antifoba status', said(r.out, /ATIVADO/), r.out[0]);
  r = await run('antifoba', { args: ['off'] });
  t('antifoba off', said(r.out, /DESATIVADO/) && gsDoc(G).antifoba === false, r.out[0]);
  r = await run('fobadd', { args: ['63', '55'] });
  t('fobadd 63 55', said(r.out, /63.*55|55.*63/), r.out[0]);
  r = await run('fobalista');
  t('fobalista mostra', said(r.out, /\+63/) && said(r.out, /\+55/), r.out[0]);
  r = await run('fobdel', { args: ['55'] });
  t('fobdel 55', !gsDoc(G).fobaBlacklist.includes('55'), r.out[0]);

  console.log('── incomingAdmin: autoapresentar ──');
  r = await run('autoapresentar');
  t('autoapresentar sem args → alterna p/ ON', said(r.out, /ATIVADA/) && gsDoc(G).autoapresentar === true, r.out[0]);
  r = await run('autoapresentar', { args: ['off'] });
  t('autoapresentar off', said(r.out, /DESATIVADA/) && gsDoc(G).autoapresentar === false, r.out[0]);

  console.log('── engine: antiFoba ──');
  const antiFoba = require('../src/bot/antiFoba');
  // A regra pode continuar guardada, mas sem serviço nenhum motor punitivo
  // pode apagar ou remover membros.
  gsDoc(G).antifoba = true;
  gsDoc(G).fobaBlacklist = ['63'];
  gsDoc(G).isHosted = false;
  gsDoc(G).hostedUntil = null;
  gsDoc(G).trialExpiresAt = null;
  const violMsg = mkMsg({
    key: { remoteJid: G, participant: MEMBRO, id: 'V1', fromMe: false },
    message: { interactiveMessage: { body: { text: 'clica' }, nativeFlowMessage: { buttons: [{ url: 'https://golpe.xyz/oferta' }] } } },
  });
  sent.length = 0; kicked.length = 0;
  t('antifoba sem serviço não apaga nem bane',
    await antiFoba.check(sock, violMsg) === false && sent.length === 0 && kicked.length === 0);
  gsDoc(G).isHosted = true;
  gsDoc(G).hostedUntil = new Date(Date.now() + 60_000);
  delete violMsg._hot;
  t('antifoba com serviço pune link oculto (apaga+bane+avisa)',
    await antiFoba.check(sock, violMsg) === true && sent.some(s => s.delete) &&
    kicked.some(k => k.action === 'remove') && sent.some(s => /Anti-Fobados/.test(s.text || '')),
    JSON.stringify(sent.map(s => Object.keys(s))) + ' ' + JSON.stringify(kicked));
  const admMsg = mkMsg({
    key: { remoteJid: G, participant: DONO, id: 'V2', fromMe: false },
    message: { conversation: 'vejam https://exemplo.com' },
  });
  sent.length = 0; kicked.length = 0;
  t('antifoba: admin imune', await antiFoba.check(sock, admMsg) === false && kicked.length === 0);
  const quoteMsg = mkMsg({
    key: { remoteJid: G, participant: MEMBRO, id: 'V3', fromMe: false },
    message: { extendedTextMessage: { text: 'olha isto', contextInfo: { quotedMessage: { conversation: 'https://golpe.xyz' } } } },
  });
  sent.length = 0; kicked.length = 0;
  t('antifoba: só citar infração não pune', await antiFoba.check(sock, quoteMsg) === false && kicked.length === 0);
  // join com DDI blacklist
  sent.length = 0; kicked.length = 0;
  const metaJoin = { participants: [{ id: DONO, admin: 'superadmin' }, { id: BOT, admin: 'admin' }, { id: '63900111222@s.whatsapp.net' }] };
  const banidos = await antiFoba.onJoin(sock, G, ['63900111222@s.whatsapp.net'], metaJoin);
  t('antifoba onJoin bane +63', banidos.length === 1 && kicked.length === 1, JSON.stringify(banidos));
  kicked.length = 0;
  const banidos2 = await antiFoba.onJoin(sock, G, ['244900000009@s.whatsapp.net'], metaJoin);
  t('antifoba onJoin poupa +244', banidos2.length === 0 && kicked.length === 0);

  console.log('── engine: autoApresentar ──');
  const autoAP = require('../src/bot/autoApresentar');
  gsDoc(G).autoapresentar = true;
  gsDoc(G).isHosted = false;
  gsDoc(G).hostedUntil = null;
  sent.length = 0;
  await autoAP.onParticipantsUpdate(sock, G, [MEMBRO], 'add', await sock.groupMetadata());
  t('autoAP sem serviço fica silenciosa e não cria pendência', sent.length === 0 && !(autoAP._internals.pendentes.get(G)?.size));
  gsDoc(G).isHosted = true;
  gsDoc(G).hostedUntil = new Date(Date.now() + 60_000);
  await autoAP.onParticipantsUpdate(sock, G, [MEMBRO], 'add', await sock.groupMetadata());
  t('autoAP com serviço add → aviso + pendência', sent.some(s => /Apresenta-te/.test(s.text || '')) && (autoAP._internals.pendentes.get(G)?.size || 0) === 1);
  const falou = autoAP.onMessage(sock, mkMsg({ key: { remoteJid: G, participant: MEMBRO, id: 'F1', fromMe: false }, message: { conversation: 'olá!' } }));
  t('autoAP membro falou → cancela', falou === true && (autoAP._internals.pendentes.get(G)?.size || 0) === 0);
  await autoAP.onParticipantsUpdate(sock, G, [MEMBRO], 'add', await sock.groupMetadata());
  const tok = [...autoAP._internals.pendentes.get(G).keys()][0];
  sent.length = 0; kicked.length = 0;
  await autoAP._internals.removerSeNaoApresentou(sock, G, tok);
  t('autoAP prazo → remove + avisa', kicked.some(k => k.action === 'remove') && sent.some(s => /Membro removido/.test(s.text || '')));
  t('autoAP cancela em massa', (() => { autoAP._internals.pendentes.set(G, new Map([['a', {}], ['b', {}]])); return autoAP.cancelarPendenciasDoGrupo(G) === 2; })());

  console.log('── gate comum: filtros sem serviço ──');
  // Todos estes filtros tinham caminhos próprios fora do commandHandler.
  // A regressão importante é: flags legadas ON não podem apagar/avisar num
  // grupo sem trial/aluguel.
  gsDoc(G).isHosted = false;
  gsDoc(G).hostedUntil = null;
  gsDoc(G).trialExpiresAt = null;
  gsDoc(G).antispam = true;
  gsDoc(G).antilink = true;
  gsDoc(G).antitexto = true;
  const filtroMsg = mkMsg({
    key: { remoteJid: G, participant: MEMBRO, id: 'GATE1', fromMe: false },
    message: { conversation: 'https://exemplo.test spam spam spam' },
  });
  sent.length = 0; kicked.length = 0;
  const antiSpam = require('../src/bot/antiSpam');
  const antiLink = require('../src/bot/antiLink');
  const antiTipos = require('../src/bot/antiTipos');
  const gates = await Promise.all([
    antiSpam.check(sock, filtroMsg),
    antiLink.check(sock, filtroMsg),
    antiTipos.check(sock, filtroMsg),
  ]);
  t('anti-spam/link/tipos sem serviço não moderam', gates.every(x => x === false) && sent.length === 0 && kicked.length === 0, JSON.stringify(gates));

  console.log('── tomp3 fundido + cep ──');
  global.__STUB_DL__ = 'video';
  const qVid = mkMsg({ message: { extendedTextMessage: { text: '!tomp3', contextInfo: { stanzaId: 'QV', participant: DONO, quotedMessage: { videoMessage: { mimetype: 'video/mp4' } } } } } });
  r = await run('tomp3', { msg: qVid });
  global.__STUB_DL__ = null;
  t('tomp3 c/ vídeo citado → tenta converter (áudio ou erro gracioso, sem crash)',
    r.ran === true && (r.raw.some(s => s.audio) || said(r.out, /TOMP3|Erro/i)), r.out.join(' | ').slice(0, 100));
  r = await run('tomp3');
  t('tomp3 sem nada → ajuda dupla', said(r.out, /ytd/) && said(r.out, /tomp3/), r.out[0]);
  r = await run('cep', { args: ['01001000'] });
  t('cep enriquecido (região+complemento)', said(r.out, /Sudeste/) && said(r.out, /lado ímpar/), r.out.join(' | '));

  console.log('── catálogo / submenus / AURA ──');
  const sd = require('../src/bot/submenuData');
  const novos = ['tourl', 'fakechat', 'fdc', 'grok', 'tiktokphoto', 'pdf', 'upscale', 'hd', 'remini', 'edits', 'editl', 'edit', 'infoff', 'ffinfo', 'perfilff', 'like', 'enviarlike', 'minado', 'campominado', 'delstts', 'abrirgp', 'abertura', 'fechargp', 'fechamento', 'horariosgp', 'limparhorarios', 'antifoba', 'fobadd', 'fobdel', 'fobalista', 'autoapresentar', 'spotifysearch', 'tomp3video'];
  const semHandler = novos.filter(c => !ch.CASES.has(c));
  t('todos os novos comandos têm handler', semHandler.length === 0, semHandler.join(','));
  const orfaos = novos.filter(c => sd.categorize(c) === 'outros');
  t('nenhum cai em "outros" (sem órfãos)', orfaos.length === 0, orfaos.join(','));
  const uniSrc = require('fs').readFileSync(require.resolve('../src/aura/auraUniversal.js'), 'utf8');
  t('AURA conhece os novos (sinónimos)', ['tourl', 'fakechat', 'minado', 'antifoba', 'autoapresentar', 'upscale'].every(s => uniSrc.includes(`'${s}'`)));

  global.fetch = realFetch;
  console.log(`\n${fail ? '💥' : '🎉'} INCOMING-CASES: ${ok} OK / ${fail} FALHOU\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERR', e); process.exit(1); });
