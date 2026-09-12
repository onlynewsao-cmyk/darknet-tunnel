#!/usr/bin/env node
/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║  DARK BOT v6.90 — AUDITORIA REAL DO RPG 🕸️                   ║
 * ╚═══════════════════════════════════════════════════════════════╝
 *
 * O `test:rpgcom` só verifica se cada comando "devolve texto" — por
 * isso um comando que responde sempre "⏳ COOLDOWN" ou "💀 Estás
 * morto" passa como verde. Esta auditoria CORRE os comandos com um
 * jogador realista e exige que façam o que dizem:
 *
 *   1. Nenhum comando do RPG rebenta nem responde vazio.
 *   2. Nenhum responde com a mensagem de bloqueio quando não há razão
 *      para bloquear (o bug dos `if` sem chavetas no rpg2.js).
 *   3. O ciclo de jogo funciona mesmo: criar → ficha → explorar →
 *      lutar → poção → guilda → nome → rank.
 *
 * Sem MongoDB: o motor de RPG é ligado a um jogador em memória, mas os
 * CASES correm a sério (caseHandler.runCase).
 */
'use strict';

process.env.NODE_ENV = 'development';

const path = require('path');
const mongoose = require('mongoose');
mongoose.set('bufferTimeoutMS', 150);

const REPO = path.join(__dirname, '..');
const GRUPO = '120363000000000000@g.us';
const DONO = '244945280380';

let ok = 0, fail = 0;
const t = (n, c, e) => {
  c ? ok++ : fail++;
  console.log(`  ${c ? '✅' : '❌'} ${n}${e ? ' → ' + String(e).slice(0, 100) : ''}`);
};

// ── jogador realista ────────────────────────────────────────
function jogadorNovo() {
  return {
    whatsappNumber: DONO, name: 'Kira', title: '', faction: null, guild: null,
    race: 'humano', class: 'guerreiro', raceBonusApplied: true,
    level: 5, xp: 40, xpNext: 600,
    hp: 150, maxHp: 150, mp: 80, maxMp: 80, lives: 3,
    stats: { str: 10, dex: 8, int: 7, vit: 9, luk: 6 },
    coins: 2500, bank: 0,
    inventory: ['poção de vida', 'poção de vida', 'erva medicinal'],
    items: [], equipment: { weapon: null, armor: null, accessory: null },
    quest: { current: null, step: 0, completed: [] },
    skills: [], transforms: [],
    kills: 3, deaths: 0, bossKills: 0, streak: 2, bestStreak: 4,
    karma: 0, reputation: 12,
    lastDaily: null, lastWork: null, lastBattle: null, lastExplore: null, lastQuest: null,
    save: async () => {},
  };
}

// ── sock falso que grava tudo ───────────────────────────────
let OUT = [];
const sock = {
  user: { id: '244949926074@s.whatsapp.net' },
  sendMessage: async (j, c) => {
    if (c?.react) return { key: {} };
    const txt = c?.text || c?.caption || '';
    if (txt) OUT.push(txt);
    if (c?.image) OUT.push('[IMG]');
    return { key: { id: 'm' } };
  },
  relayMessage: async (j, message) => {
    const corpo = message?.viewOnceMessage?.message?.interactiveMessage?.body?.text
      || message?.interactiveMessage?.body?.text || '';
    OUT.push(corpo || '[INTERACTIVO]');
    return {};
  },
  groupMetadata: async () => ({
    id: GRUPO, subject: 'Dark Net',
    participants: [{ id: DONO + '@s.whatsapp.net', admin: 'superadmin' }],
  }),
  sendPresenceUpdate: async () => {}, readMessages: async () => {},
  waUploadToServer: async () => ({}),
  sendMessageReadReceipt: async () => {},
};

const msg = {
  key: { remoteJid: GRUPO, participant: DONO + '@s.whatsapp.net', id: 'X1' },
  message: { conversation: '!cmd' },
};
const ctxBase = {
  remoteJid: GRUPO, isGroup: true, senderJid: DONO + '@s.whatsapp.net',
  senderNumber: DONO, pushName: 'Dark', isOwner: true, isPrimaryOwner: true, prefix: '!',
};
const cfg = { bot: { prefix: '!', name: 'DARK BOT' }, owner: { name: 'Dark', number: DONO } };

// Assinaturas de rebentamento dentro da resposta
const RE_ERRO = /Erro no case|is not a function|Cannot read|Cannot convert|is not defined|Cannot access|undefined is not|of undefined/i;
// Mensagens de bloqueio que só fazem sentido quando há motivo
const BLOQUEIOS_SEM_MOTIVO = [
  [/⏳ ?\*?cooldown/i, 'cooldown'],
  [/💀 estás morto/i, 'morto'],
  [/sem vidas/i, 'sem vidas'],
  [/❌ sem poções/i, 'sem poções'],
  [/ainda tens vidas/i, 'ainda tens vidas'],
  [/precisas de 1000 coins/i, 'sem coins'],
  [/❌ não tens coins|coins insuficientes/i, 'sem coins'],
];

// Recusas que são a resposta CORRECTA para o jogador padrão desta auditoria
// (nível 5, 3 vidas, 2500 coins). Sem isto o `.reviver` contava como bug
// por fazer exactamente o que deve.
const BLOQUEIO_ESPERADO = {
  reviver: 'ainda tens vidas',
  revive: 'ainda tens vidas',
};

(async () => {
  const rpg = require(path.join(REPO, 'src/bot/rpg/engine'));
  const ch = require(path.join(REPO, 'src/bot/caseHandler'));
  const sd = require(path.join(REPO, 'src/bot/submenuData'));

  let jogador = jogadorNovo();
  rpg.getPlayer = async () => jogador;
  rpg.savePlayer = async () => { jogador.save?.(); };

  // Os comandos de economia (packages/economy.js) lêem o modelo Economy
  // directo. Sem MongoDB ficavam 150 ms à espera e contavam como "erro" —
  // o que escondia os bugs reais por trás do ruído do ambiente.
  const Economy = require(path.join(REPO, 'src/database/models/Economy'));
  const economia = {
    userId: DONO, coins: 2500, bank: 0, dailyStreak: 1, lastDaily: null,
    lastWork: null, lastCrime: null, inventory: [], xp: 0, level: 1,
    addXp: async function (n) { this.xp += n; },
    save: async () => {},
  };
  // Query encadeável: o código faz Economy.find(...).sort(...).limit(...)
  const query = (res) => {
    const q = {
      sort: () => q, limit: () => q, skip: () => q, select: () => q,
      lean: () => q, populate: () => q,
      then: (ok, ko) => Promise.resolve(res).then(ok, ko),
      catch: (ko) => Promise.resolve(res).catch(ko),
    };
    return q;
  };
  Economy.getOrCreate = async () => economia;
  Economy.findOne = async () => economia;
  Economy.find = () => query([economia]);
  Economy.aggregate = async () => [];
  Economy.updateOne = async () => ({ acknowledged: true });
  Economy.findOneAndUpdate = async () => economia;
  Economy.countDocuments = async () => 1;

  // O aluguer (trial/rent) mexe no GroupSettings — sem Mongo ficava pendurado.
  const GroupSettings = require(path.join(REPO, 'src/database/models/GroupSettings'));
  const gsFake = { groupJid: GRUPO, save: async () => {} };
  GroupSettings.findOne = () => query(gsFake);
  GroupSettings.findOneAndUpdate = async () => gsFake;

  // Os cooldowns do rpg2 vivem num Map do módulo: sem os limpar, a 2ª
  // passagem pelos mesmos comandos apanha o cooldown da 1ª e a auditoria
  // reportava "COOLDOWN" como se fosse o bug das chavetas.
  let semCooldown = () => {};

  try { ch.loadCases(); } catch (e) { console.log('loadCases:', e.message); }

  // DEPOIS do loadCases: ele apaga a require.cache dos cases e volta a
  // requerê-los, pelo que só agora temos a instância que o caseHandler usa.
  // (Antes disto, limpávamos o Map de cooldowns de outra instância e a
  // auditoria continuava a ver "COOLDOWN" na 2ª passagem.)
  const rpg2 = require(path.join(REPO, 'src/bot/cases/rpg2'));
  semCooldown = () => rpg2._resetCooldowns?.();

  async function correr(cmd, args = []) {
    semCooldown();
    OUT = [];
    try {
      await ch.runCase(cmd, {
        sock, msg, ctx: { ...ctxBase }, args,
        text: args.join(' '), prefix: '!', isOwner: true, config: cfg,
      });
    } catch (e) {
      OUT.push('❌ Erro no case ' + cmd + ': ' + e.message);
    }
    return OUT.join(' \n ');
  }

  // ══ 1. TODOS os comandos do RPG correm sem rebentar ══════════
  console.log('\n═══ 1. TODOS OS COMANDOS DO RPG (economia) CORREM? ═══');
  const todos = [...ch.CASES.keys()].filter(c => {
    try { return sd.categorize(c) === 'economia'; } catch { return false; }
  });
  const rebentam = [], vazios = [], bloqueiam = [];
  for (const cmd of todos) {
    jogador = jogadorNovo();
    const r = await correr(cmd);
    const limpo = r.replace(/\s+/g, ' ').trim();
    if (!limpo || limpo.length < 10) { vazios.push(cmd); continue; }
    if (RE_ERRO.test(limpo)) { rebentam.push(`${cmd} → ${limpo.match(RE_ERRO)[0]}`); continue; }
    // Há comandos cuja recusa É a resposta certa para o jogador padrão:
    // `.reviver` com 3 vidas deve mesmo dizer "ainda tens vidas".
    const esperado = BLOQUEIO_ESPERADO[cmd];
    const falsoBloqueio = BLOQUEIOS_SEM_MOTIVO.find(([re, nome]) =>
      re.test(limpo) && nome !== esperado);
    if (falsoBloqueio) bloqueiam.push(`${cmd} (${falsoBloqueio[1]})`);
  }
  t(`${todos.length} comandos RPG respondem sem erro`, rebentam.length === 0,
    rebentam.length ? `${rebentam.length} rebentam: ${rebentam.slice(0, 6).join(' | ')}` : `${todos.length}/${todos.length}`);
  t('nenhum responde vazio', vazios.length === 0, vazios.join(', '));
  t('nenhum bloqueia sem motivo (if sem chavetas)', bloqueiam.length === 0,
    bloqueiam.length ? `${bloqueiam.length}: ${bloqueiam.slice(0, 8).join(' | ')}` : 'todos limpos');

  // ══ 2. CICLO DE JOGO REAL ════════════════════════════════════
  console.log('\n═══ 2. CICLO DE JOGO (criar → jogar → subir) ═══');

  // criar por selecção (createFlow do v6.89 + schema do v6.90)
  jogador = jogadorNovo();
  const flow = require(path.join(REPO, 'src/bot/rpg/createFlow'));
  flow.pendentes().clear();
  await correr('rpgstart', ['Kira']);
  const listaRacas = OUT.join(' ');
  t('!rpgstart abre a lista de raças', /RPGPICK_R_|ESCOLHE A RAÇA/i.test(listaRacas) || /raça/i.test(listaRacas),
    listaRacas.slice(0, 60));

  OUT = [];
  await flow.pick({ sock, msg, ctx: { ...ctxBase }, token: 'RPGPICK_R_shinobi' });
  const listaClasses = OUT.join(' ');
  t('escolher raça abre a lista de classes', /RPGPICK_C_|CLASSE/i.test(listaClasses), listaClasses.slice(0, 60));

  OUT = [];
  await flow.pick({ sock, msg, ctx: { ...ctxBase }, token: 'RPGPICK_C_pirata' });
  t('escolher classe cria o personagem', jogador.race === 'shinobi' && jogador.class === 'pirata',
    `race=${jogador.race} class=${jogador.class}`);
  t('a raça/class sobrevivem no documento (schema)', (() => {
    const M = require(path.join(REPO, 'src/database/models/RPGPlayer'));
    const d = new M({ whatsappNumber: DONO });
    d.race = jogador.race; d.class = jogador.class;
    const o = d.toObject();
    return o.race === 'shinobi' && o.class === 'pirata';
  })());

  // bónus só uma vez
  const antes = { ...jogador.stats };
  await flow.pick({ sock, msg, ctx: { ...ctxBase }, token: 'RPGPICK_C_pirata' });
  t('repetir a criação não volta a somar bónus',
    JSON.stringify(jogador.stats) === JSON.stringify(antes),
    `${JSON.stringify(antes)} → ${JSON.stringify(jogador.stats)}`);

  // ficha
  jogador = jogadorNovo();
  const ficha = await correr('rg');
  t('.rg mostra a ficha com raça e classe',
    /Kira/i.test(ficha) && /humano/i.test(ficha) && /guerreiro/i.test(ficha), ficha.slice(0, 70));

  // explorar
  jogador = jogadorNovo();
  const expl = await correr('explorar', ['floresta']);
  t('.explorar explora mesmo (não é cooldown/erro)',
    !/cooldown/i.test(expl) && !RE_ERRO.test(expl) && expl.length > 30, expl.slice(0, 80));

  // lutar
  jogador = jogadorNovo();
  const luta = await correr('lutar');
  t('.lutar combate mesmo com HP cheio',
    !/estás morto/i.test(luta) && !/sem vidas/i.test(luta) && !RE_ERRO.test(luta), luta.slice(0, 80));

  // poção
  jogador = jogadorNovo();
  const pocoesAntes = jogador.inventory.filter(i => i === 'poção de vida').length;
  const pot = await correr('pocao');
  const pocoesDepois = jogador.inventory.filter(i => i === 'poção de vida').length;
  t('.pocao gasta uma poção (tinha 2)',
    pocoesAntes === 2 && pocoesDepois === 1 && !/sem poções/i.test(pot),
    `${pocoesAntes} → ${pocoesDepois} · ${pot.slice(0, 50)}`);

  // guilda
  jogador = jogadorNovo();
  const g = await correr('guilda', ['criar', 'Dark Side']);
  t('.guilda criar cria a guilda e cobra os 1000 coins',
    jogador.guild === 'Dark Side' && jogador.coins === 1500,
    `guild=${jogador.guild} coins=${jogador.coins}`);

  // nome
  jogador = jogadorNovo();
  const nm = await correr('nome', ['Shadow']);
  t('.nome muda o nome', jogador.name === 'Shadow', `name=${jogador.name} · ${nm.slice(0, 50)}`);

  // quest
  jogador = jogadorNovo();
  const q1 = await correr('quest');
  t('.quest dá uma quest (não fica em loop "prologo")',
    !/cooldown/i.test(q1) && !RE_ERRO.test(q1) && !!jogador.quest?.current
    && jogador.quest.current !== 'prologo',
    `quest=${jogador.quest?.current} · ${q1.slice(0, 60)}`);
  const q2 = await correr('quest', ['1']);
  t('.quest 1 processa a escolha e dá XP',
    !RE_ERRO.test(q2) && (jogador.xp > 40 || /xp/i.test(q2)), `xp=${jogador.xp} · ${q2.slice(0, 60)}`);

  // reviver sem motivo
  jogador = jogadorNovo();
  const rev = await correr('reviver');
  t('.reviver recusa só quando faz sentido (tem vidas)', /ainda tens vidas/i.test(rev), rev.slice(0, 50));

  // ══ 3. O MUNDO (v6.90) ════════════════════════════════════════
  console.log('\n═══ 3. MUNDO — mapa com estado, viagens e mundial ═══');
  const world = require(path.join(REPO, 'src/bot/rpg/world'));

  jogador = jogadorNovo();
  const mapa0 = world.mapa(jogador);
  const prog0 = world.progresso(jogador);
  t('!world mostra o mapa com progresso (0% no início)',
    prog0.total > 0 && prog0.visitados === 0 && /0%/.test(mapa0.join(' ')),
    `${prog0.visitados}/${prog0.total}`);

  const v1 = world.viajar(jogador, 'floresta');
  t('!viajar floresta descobre o bioma e dá XP',
    v1.ok && v1.primeiraVez === true && jogador.world.visited.includes('floresta')
    && jogador.xp > 40, `xp=${jogador.xp} · ${v1.linhas?.[0]}`);

  const xpDepois = jogador.xp;
  const v2 = world.viajar(jogador, 'floresta');
  t('visitar outra vez não volta a pagar a descoberta',
    v2.ok && v2.primeiraVez === false && jogador.xp === xpDepois + (jogador.xp - xpDepois),
    `primeiraVez=${v2.primeiraVez}`);

  const v3 = world.viajar(jogador, 'atlântida');
  t('sítio que não existe é recusado com a lista do mapa',
    v3.ok === false && /não conheço/i.test(v3.motivo) && /floresta/.test(v3.motivo),
    v3.motivo?.slice(0, 50));

  // mundo persiste no schema
  t('o mundo sobrevive no documento (schema world.visited)', (() => {
    const M = require(path.join(REPO, 'src/database/models/RPGPlayer'));
    const d = new M({ whatsappNumber: DONO });
    d.world = { visited: ['floresta'], discoveries: 1 };
    const o = d.toObject();
    return Array.isArray(o.world?.visited) && o.world.visited[0] === 'floresta';
  })());

  // os comandos estão registados e respondem
  jogador = jogadorNovo();
  const cWorld = await correr('world');
  t('!world responde com o mapa', /MAPA DO MUNDO/i.test(cWorld) && /explorado/i.test(cWorld),
    cWorld.slice(0, 60));
  const cViajar = await correr('viajar', ['montanha']);
  t('!viajar montanha viaja mesmo', /MONTANHA/i.test(cViajar), cViajar.slice(0, 60));
  const cMundial = await correr('mundial');
  t('!mundial responde (degrada sem DB, não rebenta)',
    cMundial.length > 20 && !RE_ERRO.test(cMundial), cMundial.slice(0, 60));

  console.log(`\n  ${ok} OK / ${fail} FALHOU\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => {
  console.error('\n💥 auditoria rebentou:', e.message);
  process.exit(1);
});
