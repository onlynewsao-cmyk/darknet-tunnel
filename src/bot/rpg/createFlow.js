/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║   DARK BOT — RPG CREATE FLOW (v6.89)                         ║
 * ║   Gerador de personagens por SELECÇÃO (listas clicáveis)     ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * `!rpgstart`            → lista clicável de RAÇAS → CLASSES → ficha
 * `!rpgstart Nome`       → idem, com o nome já fixado
 * `!rpgstart N r c`      → caminho escrito directo (continua a funcionar)
 *
 * Os cliques chegam como selectedRowId (RPGPICK_R_<raça> /
 * RPGPICK_C_<classe>) e são interceptados no commandHandler — mesmo
 * mecanismo do CHANGE_THEME_ (provado em produção).
 */
'use strict';

const config = require('../../config');
const rpg = require('./engine');

/** Criações a meio: senderNumber → { name, race } */
const _pendentes = new Map();

function _norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

/** Encontra a chave real (shinobi, pirata…) a partir de texto livre. */
function _acharRaca(txt) {
  const n = _norm(txt);
  if (!n) return '';
  if (rpg.RACES[n]) return n;
  for (const k of Object.keys(rpg.RACES)) if (_norm(k) === n) return k;
  return '';
}
function _acharClasse(txt) {
  const n = _norm(txt);
  if (!n) return '';
  if (rpg.CLASSES[n]) return n;
  for (const k of Object.keys(rpg.CLASSES)) if (_norm(k) === n) return k;
  return '';
}

// ── Envio da lista clicável ─────────────────────────────────
// Mesmo padrão do dynamicSubmenus: interactiveMessage + single_select,
// relay com biz/native_flow. Fallback para texto se o relay falhar.
async function _enviarLista(sock, msg, ctx, titulo, subtitulo, corpo, rows, rodape) {
  const RE = require('../renderEngine');
  const t = await RE.getTheme(ctx.remoteJid).catch(() => null);
  const textBody = corpo;

  try {
    const { generateWAMessageFromContent, proto } = require('@systemzero/baileys');
    const m = generateWAMessageFromContent(ctx.remoteJid, {
      interactiveMessage: proto.Message.InteractiveMessage.fromObject({
        body: proto.Message.InteractiveMessage.Body.fromObject({ text: textBody }),
        footer: proto.Message.InteractiveMessage.Footer.fromObject({ text: rodape }),
        header: proto.Message.InteractiveMessage.Header.fromObject({ title: '', hasMediaAttachment: false }),
        nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
          buttons: [{
            name: 'single_select',
            buttonParamsJson: JSON.stringify({
              title,
              sections: [{ title: subtitulo, rows }],
            }),
          }],
        }),
      }),
    }, { userJid: sock.user?.id, quoted: msg });
    await sock.relayMessage(ctx.remoteJid, m.message, {
      messageId: m.key.id,
      additionalNodes: [{ tag: 'biz', attrs: {}, content: [{
        tag: 'interactive', attrs: { type: 'native_flow', v: '1' },
        content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }],
      }]}],
    });
    return true;
  } catch (_) {}

  // fallback: texto (a lista em texto continua navegável por escrito)
  await sock.sendMessage(ctx.remoteJid, { text: textBody }, { quoted: msg }).catch(() => {});
  return false;
}

function _listaRacas(name) {
  const linhas = [
    `🎭 *ESCOLHE A RAÇA DE ${String(name).toUpperCase()}*`,
    '',
    ...Object.entries(rpg.RACES).map(([k, v]) => `${v.emoji} *${k}* — ${v.desc}`),
    '',
    '> Toca numa raça acima para continuar 🎯',
  ];
  const rows = Object.entries(rpg.RACES).map(([k, v]) => ({
    title: `${v.emoji} ${k.charAt(0).toUpperCase() + k.slice(1)}`,
    description: (v.desc || '').slice(0, 72),
    id: `RPGPICK_R_${k}`,
  }));
  return { linhas, rows };
}

function _listaClasses(name, race) {
  const linhas = [
    `⚔️ *ESCOLHE A CLASSE DE ${String(name).toUpperCase()}*`,
    `${rpg.RACES[race]?.emoji || '🧬'} Raça: *${race}*`,
    '',
    ...Object.entries(rpg.CLASSES).map(([k, v]) => `${v.emoji} *${k}* — ${v.desc}`),
    '',
    '> Toca numa classe acima para nascer 🎯',
  ];
  const rows = Object.entries(rpg.CLASSES).map(([k, v]) => ({
    title: `${v.emoji} ${k.charAt(0).toUpperCase() + k.slice(1)}`,
    description: (v.desc || '').slice(0, 72),
    id: `RPGPICK_C_${k}`,
  }));
  return { linhas, rows };
}

// ── Ficha final ─────────────────────────────────────────────
async function _ficha(sock, msg, ctx, p) {
  const race = rpg.RACES[p.race] || rpg.RACES.humano;
  const cls = rpg.CLASSES[p.class] || rpg.CLASSES.guerreiro;
  const rank = rpg.getRank(p.level);
  await rpg.savePlayer(p).catch(() => {});

  const RE = require('../renderEngine');
  const t = await RE.getTheme(ctx.remoteJid).catch(() => null);
  const linhas = [
    `${race.emoji} *${p.name}* — ${p.race} ${cls.emoji} ${p.class}`,
    `${rank.emoji} Rank ${rank.name} · Nível ${p.level}`,
    '',
    `❤️ ${p.hp}/${p.maxHp} HP · 💙 ${p.mp}/${p.maxMp} MP`,
    `⚔️ STR ${p.stats.str} · 🏃 DEX ${p.stats.dex} · 🔮 INT ${p.stats.int}`,
    `🛡️ VIT ${p.stats.vit} · 🍀 LUK ${p.stats.luk}`,
    `💰 ${p.coins || 0} coins · 🎒 ${(p.inventory || []).length} itens`,
    '',
    '> Personagem criado! Usa *.rg* para ver a ficha completa.',
  ];
  const corpo = t
    ? RE.renderBlock(t, '🎭 PERSONAGEM CRIADO', linhas, { botName: config.bot.name })
    : linhas.join('\n');
  await sock.sendMessage(ctx.remoteJid, { text: corpo }, { quoted: msg }).catch(() => {});
}

async function _finalizar(sock, msg, ctx, name, race, cls) {
  const p = await rpg.getPlayer(ctx.senderNumber);
  p.name = name || p.name || 'Aventureiro';
  p.race = race;
  p.class = cls;

  // bónus da origem escolhida (se houver) — entra nas stats base.
  // v6.90: UMA vez só. Antes somava a cada !rpgstart, pelo que bastava
  // repetir o comando para inflar stats e HP/MP sem limite.
  const origem = rpg.ORIGINS?.[race];
  if (origem?.bonus && !p.raceBonusApplied) {
    p.stats = p.stats || { str: 6, dex: 6, int: 6, vit: 6, luk: 6 };
    for (const [k, v] of Object.entries(origem.bonus)) {
      p.stats[k] = (p.stats[k] || 0) + v;
    }
    p.maxHp = (p.maxHp || 150) + (origem.bonus.vit || 0) * 5;
    p.hp = p.maxHp;
    p.maxMp = (p.maxMp || 80) + (origem.bonus.int || 0) * 5;
    p.mp = p.maxMp;
    p.raceBonusApplied = true;
  }
  await _ficha(sock, msg, ctx, p);
}

// ── API ─────────────────────────────────────────────────────

/** `!rpgstart [Nome] [raça] [classe]` — cria directo ou abre as listas. */
async function start({ sock, msg, ctx, args }) {
  const tokens = (args || []).map(String).filter(Boolean);
  let race = '', cls = '';
  if (tokens.length >= 2) {
    cls = _acharClasse(tokens[tokens.length - 1]);
    if (cls) tokens.pop();
  }
  if (tokens.length >= 1) {
    race = _acharRaca(tokens[tokens.length - 1]);
    if (race) tokens.pop();
  }
  const name = tokens.join(' ').trim() || ctx.pushName || 'Aventureiro';

  // caminho escrito completo: !rpgstart Nome raça classe
  if (race && cls) return _finalizar(sock, msg, ctx, name, race, cls);

  // só a raça veio → falta a classe (lista de classes)
  if (race) {
    _pendentes.set(ctx.senderNumber, { name, race });
    const { linhas, rows } = _listaClasses(name, race);
    return _enviarLista(sock, msg, ctx, '⚔️ ESCOLHER CLASSE', 'CLASSES', linhas.join('\n'), rows, `🎭 ${config.bot.name} · RPG`);
  }

  // nada escolhido → lista de raças
  _pendentes.set(ctx.senderNumber, { name });
  const { linhas, rows } = _listaRacas(name);
  return _enviarLista(sock, msg, ctx, '🧬 ESCOLHER RAÇA', 'RAÇAS', linhas.join('\n'), rows, `🎭 ${config.bot.name} · RPG`);
}

/** Clique RPGPICK_R_<raça> / RPGPICK_C_<classe>. true se consumiu. */
async function pick({ sock, msg, ctx, token }) {
  const m = /^RPGPICK_(R|C)_([a-z]+)$/i.exec(String(token || '').trim());
  if (!m) return false;
  const tipo = m[1].toUpperCase();
  const chave = _acharRaca(m[2]) || _acharClasse(m[2]);
  if (!chave) return false;

  const pend = _pendentes.get(ctx.senderNumber) || { name: ctx.pushName || 'Aventureiro' };

  if (tipo === 'R') {
    const race = _acharRaca(m[2]);
    if (!race) return false;
    _pendentes.set(ctx.senderNumber, { ...pend, race });
    const { linhas, rows } = _listaClasses(pend.name, race);
    await _enviarLista(sock, msg, ctx, '⚔️ ESCOLHER CLASSE', 'CLASSES', linhas.join('\n'), rows, `🎭 ${config.bot.name} · RPG`);
    return true;
  }

  // tipo C — última escolha: a classe fecha a ficha
  const cls = _acharClasse(m[2]);
  if (!cls) return false;
  const race = pend.race || 'humano';
  _pendentes.delete(ctx.senderNumber);
  await _finalizar(sock, msg, ctx, pend.name, race, cls);
  return true;
}

/** Estado (testes). */
function pendentes() { return _pendentes; }

module.exports = { start, pick, pendentes };
