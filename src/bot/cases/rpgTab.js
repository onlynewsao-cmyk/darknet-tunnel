/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║  DARK BOT v9.5 — !tab · ABA INTERATIVA DO AVENTUREIRO 📑      ║
 * ║                                                               ║
 * ║  Um hub persistente: o jogador navega entre abas (perfil,     ║
 * ║  ficha, inventário, mundo, registos) tocando na lista — a     ║
 * ║  aba renderiza E o hub reabre sozinho para a próxima troca.   ║
 * ║  Por escrito: `!tab <perfil|ficha|inv|mundo|stats>`.          ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */
'use strict';

const config = require('../../config');

function _t(n) { return `${(n || 0).toLocaleString('pt-PT')}`; }

// ══ AS ABAS (renderizam a partir do doc do engine) ════════════
const ABAS = {
  perfil: {
    label: '👤 Perfil', keys: ['perfil', 'profile'],
    linhas: (p, rank) => [
      `${(p.race || 'humano')} ${p.class || 'guerreiro'} ${p.title ? `· «${p.title}»` : ''}`,
      `${rank.emoji} Rank ${rank.name} · Nível *${p.level || 1}*`,
      `✨ XP ${_t(p.xp)}/${_t(p.xpNext || 100)}`,
      `❤️ x${p.lives ?? 3} vidas · 💰 ${_t(p.coins)} coins`,
      p.guild ? `🛡️ Guilda: *${p.guild}*` : '🛡️ Sem guilda',
      p.faction ? `⚜️ Facção: *${p.faction}*` : null,
    ].filter(Boolean),
  },
  ficha: {
    label: '⚔️ Ficha', keys: ['ficha', 'statsbase', 'atributos'],
    linhas: (p) => {
      const s = p.stats || {};
      return [
        `❤️ HP ${p.hp}/${p.maxHp} · 💙 MP ${p.mp}/${p.maxMp}`,
        '',
        `⚔️ STR *${s.str ?? 6}* — força bruta`,
        `🏃 DEX *${s.dex ?? 6}* — agilidade`,
        `🔮 INT *${s.int ?? 6}* — magia`,
        `🛡️ VIT *${s.vit ?? 6}* — resistência`,
        `🍀 LUK *${s.luk ?? 6}* — sorte`,
        '',
        `🏦 Banco: ${_t(p.bank)} coins guardados`,
      ];
    },
  },
  inv: {
    label: '🎒 Inventário', keys: ['inv', 'inventario', 'inventory', 'mochila'],
    linhas: (p) => {
      const itens = Array.isArray(p.inventory) ? p.inventory : [];
      const cont = new Map();
      for (const it of itens) cont.set(it, (cont.get(it) || 0) + 1);
      const linhas = itens.length
        ? [...cont.entries()].slice(0, 12).map(([it, n]) => `▸ ${it}${n > 1 ? ` ×${n}` : ''}`)
        : ['(mochila vazia — explora para encher)'];
      if (itens.length && cont.size > 12) linhas.push(`…+${cont.size - 12} tipos`);
      const eq = p.equipment || {};
      const eqs = [eq.weapon && `🗡️ ${eq.weapon}`, eq.armor && `🛡️ ${eq.armor}`, eq.accessory && `💍 ${eq.accessory}`].filter(Boolean);
      return [
        ...linhas,
        '',
        eqs.length ? `⚙️ Equipado: ${eqs.join(' · ')}` : '⚙️ Nada equipado (forja/compra na 🛒)',
      ];
    },
  },
  mundo: {
    label: '🌍 Mundo', keys: ['mundo', 'mapa', 'world'],
    linhas: (p, rank, rpg) => {
      const vistos = new Set((p.biome?.visited || p.world?.visited || []).filter(b => rpg.BIOMES?.[b]));
      const biomas = Object.entries(rpg.BIOMES || {});
      return [
        ...biomas.map(([k, b]) =>
          `${vistos.has(k) ? '✅' : '⬜'} ${b.emoji} *${k}* — nv.${b.nivel}`),
        '',
        `🧭 ${vistos.size}/${biomas.length} biomas descobertos · ✦ ${p.world?.discoveries ?? vistos.size} descobertas`,
        '> viaja com `!viajar <sítio>` — a 1ª visita dá XP',
      ];
    },
  },
  stats: {
    label: '🏆 Registos', keys: ['stats', 'registos', 'records', 'historico'],
    linhas: (p) => [
      `⚔️ Kills: *${_t(p.kills)}* · ☠️ Mortes: *${_t(p.deaths)}*`,
      `👹 Bosses abatidos: *${_t(p.bossKills)}*`,
      `🔥 Streak: *${p.streak || 0}* · máx.: *${p.bestStreak || 0}*`,
      `😇 Karma: *${p.karma || 0}* · 🌟 Reputação: *${_t(p.reputation)}*`,
      '',
      '> vê onde ficas: `!ranking` · `!mundial`',
    ],
  },
};
const ORDEM = ['perfil', 'ficha', 'inv', 'mundo', 'stats'];

async function _render(sock, msg, ctx, p, abaKey) {
  const rpg = require('../rpg/engine');
  const rank = rpg.getRank(p.level || 1);
  const aba = ABAS[abaKey];
  const rpgTheme = require('../rpg/rpgTheme');
  const linhas = aba.linhas(p, rank, rpg);
  const titulo = `📑 ${String(p.name || 'Aventureiro').toUpperCase()} — ${aba.label}`;
  await rpgTheme.rpgReply(sock, msg, ctx, titulo, linhas);
}

/** Abre o hub (escolher) — o onEscolha renderiza e reabre, navegação infinita. */
async function _hub(sock, msg, ctx, p) {
  const ui = require('../rpg/ui');
  const nVisit = new Set(p.biome?.visited || p.world?.visited || []).size;
  await ui.escolher(sock, msg, ctx, {
    titulo: '📑 AS TUAS ABAS',
    subtitulo: 'ABA',
    linhas: [
      `👤 *${p.name || 'Aventureiro'}* · Nv.${p.level || 1} · 💰 ${_t(p.coins)}c`,
      `🎒 ${(p.inventory || []).length} itens · 🌍 ${nVisit} biomas · ❤️ x${p.lives ?? 3}`,
    ],
    opcoes: ORDEM.map(k => ({
      label: ABAS[k].label,
      desc: { perfil: 'quem és no mundo', ficha: 'atributos e recursos', inv: 'a tua mochila', mundo: 'o que já descobriste', stats: 'kills, bosses, streak' }[k],
    })),
    onEscolha: async (idx, s2) => {
      const aba = ORDEM[Math.max(0, Math.min(idx, ORDEM.length - 1))] || 'perfil';
      const p2 = await require('../rpg/engine').getPlayer((s2.ctx || ctx).senderNumber).catch(() => p);
      await _render(s2.sock || sock, s2.msg || msg, s2.ctx || ctx, p2 || p, aba);
      await _hub(s2.sock || sock, s2.msg || msg, s2.ctx || ctx, p2 || p); // reabre como uma "tab bar" viva
    },
  });
}

module.exports = function registerRpgTab(registerCase) {
  registerCase(['tab', 'abas', 'meurpg'], async ({ sock, msg, ctx, args }) => {
    const rpg = require('../rpg/engine');
    const p = await rpg.getPlayer(ctx.senderNumber);
    if (!p?.started) {
      return sock.sendMessage(ctx.remoteJid, {
        text: '📑 Ainda não tens abas — cria o teu personagem com `!rpgstart` (toca na lista de raças ou escreve nome + raça + classe).',
      }, { quoted: msg }).catch(() => {});
    }
    const pedido = String(args?.[0] || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (pedido) {
      const aba = ORDEM.find(k => ABAS[k].keys.includes(pedido));
      if (!aba) {
        return sock.sendMessage(ctx.remoteJid, {
          text: `📑 Aba desconhecida: \`${pedido}\`\nAbas: ${ORDEM.map(k => `\`${k}\``).join(', ')} — ou escreve só \`!tab\` e navega a tocar.`,
        }, { quoted: msg }).catch(() => {});
      }
      return _render(sock, msg, ctx, p, aba);
    }
    return _hub(sock, msg, ctx, p);
  }, true); // gate RPG como os irmãos do mundo
};
