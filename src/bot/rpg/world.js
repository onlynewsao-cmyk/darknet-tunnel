/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║  DARK BOT v6.90 — MUNDO DO RPG 🌍                             ║
 * ╚═══════════════════════════════════════════════════════════════╝
 *
 * O `!world` era uma lista estática de biomas: igual para quem acabou
 * de criar o personagem e para quem já atravessou o abismo. Não havia
 * mundo — havia um menu.
 *
 * Agora o mundo tem ESTADO:
 *   • cada bioma tem nível recomendado e perigo próprios (já existiam
 *     no engine como `nivel`/`danger` mas ninguém os usava);
 *   • o jogador marca os biomas que percorre (`world.visited`) e a 1ª
 *     visita dá XP — explorar passa a valer a pena;
 *   • o mapa mostra o que falta e o que já foi visto;
 *   • `!viajar <bioma>` desloca o jogador e devolve um encontro real
 *     (loot/inimigo/NPC) usando os helpers do engine, não texto morto.
 *
 * Sem MongoDB nada rebenta: o ranking mundial degrada para uma
 * mensagem honesta e o resto funciona em memória.
 */
'use strict';

const rpg = require('./engine');

const R = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const P = (a) => a[Math.floor(Math.random() * a.length)];

/** Garante que o sub-documento do mundo existe (jogadores antigos). */
function mundoDe(p) {
  if (!p.world || typeof p.world !== 'object') {
    p.world = { visited: [], discoveries: 0, lastTravel: null, bossDefeated: [] };
  }
  if (!Array.isArray(p.world.visited)) p.world.visited = [];
  if (!Array.isArray(p.world.bossDefeated)) p.world.bossDefeated = [];
  if (typeof p.world.discoveries !== 'number') p.world.discoveries = 0;
  return p.world;
}

function biomas() {
  return Object.entries(rpg.BIOMES || {});
}

/** { visitados, total, pct } */
function progresso(p) {
  const mundo = mundoDe(p);
  const total = biomas().length;
  const visitados = new Set(mundo.visited.filter(b => rpg.BIOMES?.[b])).size;
  return { visitados, total, pct: total ? Math.round((visitados / total) * 100) : 0 };
}

/** Barra de progresso do mundo (10 blocos). */
function barra(pct, len = 10) {
  const cheios = Math.max(0, Math.min(len, Math.round((pct / 100) * len)));
  return '🟩'.repeat(cheios) + '⬛'.repeat(len - cheios);
}

/**
 * O jogador tem nível para este bioma?
 * Não bloqueia — avisa. Entrar num sítio acima do nível é uma escolha.
 */
function podeEntrar(p, chave) {
  const b = rpg.BIOMES?.[chave];
  if (!b) return { ok: false, motivo: 'esse sítio não existe no mapa' };
  const nivel = p.level || 1;
  if (nivel < b.nivel) {
    return {
      ok: false,
      motivo: `*${chave}* pede nível *${b.nivel}* e estás no *${nivel}*. ` +
              `Sobrevives, mas não digas que não avisei.`,
      perigoso: true,
    };
  }
  return { ok: true };
}

/** Linha do mapa para um bioma. */
function linhaMapa(p, chave, b) {
  const visto = mundoDe(p).visited.includes(chave);
  const nivel = p.level || 1;
  const marca = visto ? '✅' : (nivel >= b.nivel ? '🔓' : '🔒');
  const perigo = '⚠️'.repeat(b.danger || 1);
  const aviso = !visto && nivel < b.nivel ? ` _(+${b.nivel - nivel} níveis)_` : '';
  const loot = (b.loot || []).slice(0, 3).map(l => rpg.ITEMS?.[l]?.emoji || '·').join('');
  return `${marca} ${b.emoji} *${chave}* ${perigo} — ${b.desc}${aviso}\n` +
         `    └ 🎯 nv.${b.nivel} · ${loot} ${(b.loot || []).join(', ')}`;
}

/**
 * O mapa do mundo, com o estado do jogador.
 * @returns {string[]} linhas prontas para o tReply
 */
function mapa(p) {
  const prog = progresso(p);
  const rank = rpg.getRank?.(p.level || 1);
  const linhas = [
    `${barra(prog.pct)} *${prog.pct}%* explorado (${prog.visitados}/${prog.total})`,
    `🧭 ${rank?.emoji || ''} Rank *${rank?.name || '?'}* · Nível *${p.level || 1}*`,
    '',
  ];

  const [abertos, fechados] = biomas().reduce(([a, f], [k, b]) => {
    ((p.level || 1) >= b.nivel ? a : f).push([k, b]);
    return [a, f];
  }, [[], []]);

  linhas.push('🗺️ *O MUNDO*');
  for (const [k, b] of abertos) linhas.push(linhaMapa(p, k, b));
  if (fechados.length) {
    linhas.push('', `🔒 *AINDA FORA DO TEU ALCANCE* (${fechados.length})`);
    for (const [k, b] of fechados) linhas.push(linhaMapa(p, k, b));
  }

  linhas.push('', `> Viaja com *!viajar <sítio>* — ex: ${'`!viajar ' + (abertos[0]?.[0] || 'floresta') + '`'}`);
  if (prog.visitados < prog.total) {
    linhas.push(`> Faltam *${prog.total - prog.visitados}* sítios por descobrir.`);
  } else {
    linhas.push('🏆 *Viste o mundo inteiro.*');
  }
  return linhas;
}

/**
 * Viajar para um bioma. Marca a visita e devolve um encontro real.
 * @returns {{ok:boolean, motivo?:string, primeiraVez?:boolean, bioma?:string, linhas?:string[]}}
 */
function viajar(p, chave) {
  const chaveNorm = String(chave || '').toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const real = Object.keys(rpg.BIOMES || {}).find(k =>
    k === chaveNorm || k.normalize('NFD').replace(/[\u0300-\u036f]/g, '') === chaveNorm);

  if (!real) {
    return {
      ok: false,
      motivo: `Não conheço *${chave || 'isso'}*.\n\nO mapa tem: ` +
              Object.keys(rpg.BIOMES || {}).map(k => `\`${k}\``).join(', '),
    };
  }

  const b = rpg.BIOMES[real];
  const mundo = mundoDe(p);
  const primeiraVez = !mundo.visited.includes(real);
  const entrada = podeEntrar(p, real);

  const linhas = [`${b.emoji} *${real.toUpperCase()}* — ${'⚠️'.repeat(b.danger || 1)}`, b.desc, ''];

  if (!entrada.ok) {
    linhas.push(`⚠️ ${entrada.motivo}`, '');
  }

  // 1ª visita vale XP — senão explorar o mundo não servia para nada
  if (primeiraVez) {
    mundo.visited.push(real);
    mundo.discoveries = (mundo.discoveries || 0) + 1;
    const bonus = 15 * (b.nivel || 1);
    const subiu = rpg.addXP?.(p, bonus);
    linhas.push(`🧭 *Novo território descoberto!*`, `⭐ +${bonus} XP${subiu ? ` → *NÍVEL ${p.level}!*` : ''}`, '');
  }

  mundo.lastTravel = new Date();

  // encontro: loot, inimigo ou NPC — com os helpers do engine
  const tipo = P(['loot', 'inimigo', 'npc', 'loot']);
  if (tipo === 'loot') {
    const item = P(b.loot || ['pedra']);
    if (Array.isArray(p.inventory)) p.inventory.push(item);
    const emoji = rpg.ITEMS?.[item]?.emoji || '🎒';
    linhas.push(`${emoji} Encontraste *${item}*.`);
    const preco = rpg.ITEMS?.[item]?.price;
    if (preco) linhas.push(`💰 Vale cerca de *${preco}* coins (vende com \`!vender ${item}\`).`);
  } else if (tipo === 'inimigo') {
    const inimigo = rpg.generateEnemy?.(Math.max(1, (b.nivel || 1) + R(0, 2))) || null;
    if (inimigo) {
      const dano = Math.max(1, Math.round((p.maxHp || 150) * (0.05 + (b.danger || 1) * 0.01)));
      p.hp = Math.max(1, (p.hp || p.maxHp) - dano);
      const xp = R(5, 15) * (b.danger || 1);
      const subiu = rpg.addXP?.(p, xp);
      linhas.push(
        `⚔️ *${inimigo.emoji || '👹'} ${inimigo.name || 'criatura'}* saltou-te à frente!`,
        `❤️ -${dano} HP · ⭐ +${xp} XP${subiu ? ` → *NÍVEL ${p.level}!*` : ''}`,
        `> Combate a sério: \`!lutar\``,
      );
    } else {
      linhas.push('🌫️ Ouviste passos, mas não viste ninguém.');
    }
  } else {
    const npc = P(Object.values(rpg.NPCS || {}));
    if (npc) {
      const fala = Array.isArray(npc.dialogues) ? P(npc.dialogues) : npc.fala;
      linhas.push(`${npc.emoji} *${npc.name}*: _"${fala}"_`);
    } else {
      linhas.push('🌬️ Só o vento.');
    }
  }

  const prog = progresso(p);
  linhas.push('', `🌍 Mundo: ${barra(prog.pct)} ${prog.pct}%`);

  return { ok: true, primeiraVez, bioma: real, linhas };
}

/**
 * Ranking MUNDIAL — todos os jogadores do bot, por nível e reputação.
 * Degrada com honestidade se não houver MongoDB.
 */
async function rankingMundial(limite = 10) {
  try {
    const { mongoose } = require('../../database/connection');
    if (mongoose.connection.readyState !== 1) {
      return { ok: false, motivo: 'Sem base de dados ligada — não consigo ver o mundo inteiro.' };
    }
    const RPGPlayer = require('../../database/models/RPGPlayer');
    const tops = await RPGPlayer.find({})
      .sort({ level: -1, reputation: -1 })
      .limit(limite)
      .lean();
    if (!tops?.length) return { ok: false, motivo: 'Ainda ninguém entrou no mundo.' };

    const medalhas = ['🥇', '🥈', '🥉'];
    const linhas = tops.map((t, i) => {
      const rank = rpg.getRank?.(t.level || 1);
      return `${medalhas[i] || `*${i + 1}.*`} *${t.name || 'Aventureiro'}* ` +
             `${rank?.emoji || ''} nv.${t.level || 1} · ⭐${t.reputation || 0} · ` +
             `${t.race || 'humano'} ${t.class || 'guerreiro'}`;
    });
    return { ok: true, linhas, total: tops.length };
  } catch (e) {
    return { ok: false, motivo: 'Não consegui ler o ranking: ' + (e.message || '').slice(0, 60) };
  }
}

module.exports = {
  mapa,
  viajar,
  progresso,
  podeEntrar,
  mundoDe,
  barra,
  rankingMundial,
};
