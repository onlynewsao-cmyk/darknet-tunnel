'use strict';
/**
 * ═══════════════════════════════════════════════════════════════════
 *  AURA v9.16 — ENQUETES, VOTOS E VOTAÇÕES-DA-CASA
 * ═══════════════════════════════════════════════════════════════════
 *
 *  Dois mundos, uma porta:
 *
 *   A) ENQUETE REAL do WhatsApp (`content.poll`) — o motor pergunta
 *      ao fork `baileys-v6`: envio com values[{optionName}] +
 *      selectableCount; o VOTO é um `pollUpdate` com `sha256Progression`
 *      = SHA-256 do nome da opção (é assim que o fork agrega em
 *      getAggregateVotesInPollMessage — verificado no código).
 *
 *   B) VOTAÇÃO-DA-CASA — o bot arbitra o jogo: botões quick_reply,
 *      UM VOTO POR PESSOA (contabilizado por jid), troca de voto livre
 *      até fechar, resultados com percentagens e empate. Funciona onde
 *      a enquete real não vive (miúdos em clientes antigos) e é o modo
 *      honesto de «ver quem ganha» — o bot NÃO falsifica votos nem
 *      reações alheias: assinaturas são criptográficas, e voto múltiplo
 *      por contas de fora é fraude de enquete + banho de ban na hora.
 *
 *  Estado em memória por chat (enquetes/votações vivem enquanto o bot
 *  vive — suficiente: quem reinicia o bot recomeça o jogo).
 */
const crypto = require('crypto');

const ENQUETES = new Map();  // jid → { key, id, pergunta, opcoes, max, quando, meusVotos: Map }
const VOTACOES = new Map();  // jid → { id, pergunta, opcoes, votos: Map(jid→idx), aberto, quando, msgKey, secreta, admin }

const sha256 = (s) => crypto.createHash('sha256').update(Buffer.from(String(s), 'utf-8')).digest();

// ────────────────────────── PARSER ─────────────────────────────────
/**
 * «Pergunta | opção A | opção B | opção C» → { pergunta, opcoes }
 * Aceita também aspas na pergunta e `[2]` de múltipla escolha.
 */
function extrairPergunta(texto = '') {
  let t = String(texto).trim();
  let max = 1;
  const mMax = t.match(/\[(\d{1,2})\]\s*/);
  if (mMax) { max = Math.max(1, Math.min(12, +mMax[1])); t = t.replace(mMax[0], ' '); }
  const partes = t.split(/\s*(?:\|\||\|)\s*/).filter(Boolean);
  if (partes.length >= 2) {
    let pergunta = partes[0].trim();
    let opcoes = partes.slice(1).map((x) => x.trim()).filter(Boolean);
    const aspas = pergunta.match(/^["“](.+?)["”]$/);
    if (aspas) pergunta = aspas[1].trim();
    opcoes = opcoes.map((o) => (o.match(/^["“](.+?)["”]$/) || [null, o])[1].trim()).slice(0, 12);
    if (pergunta && opcoes.length >= 2) return { pergunta, opcoes, max };
  }
  // fallback PT: «pergunta: a, b ou c»
  const virg = t.match(/^(.{4,120}?)\s*[:\-–]\s*(.+)$/);
  if (virg) {
    const opcoes = virg[2].split(/\s*(?:,|;|\be\b|\bou)\s*/).map((x) => x.trim()).filter((x) => x.length >= 1).slice(0, 12);
    if (opcoes.length >= 2) return { pergunta: virg[1].trim().replace(/^["“]|["”]$/g, ''), opcoes, max };
  }
  return null;
}

// ────────────────────── A) ENQUETE REAL (protocolo) ─────────────────
async function criarEnquete(sock, jid, { pergunta, opcoes, max = 1, quoted = null }) {
  if (opcoes.length < 2) throw new Error('preciso de 2+ opções');
  const r = await sock.sendMessage(jid, {
    poll: { name: pergunta.slice(0, 256), values: opcoes.map((o) => ({ optionName: String(o).slice(0, 100) })), selectableCount: Math.min(max, opcoes.length) },
  }, { quoted });
  const reg = {
    key: r.key, id: r.key.id, pergunta, opcoes: opcoes.slice(), max: Math.max(1, max),
    quando: Date.now(), meusVotos: new Map(), secret: true,
  };
  ENQUETES.set(jid, reg);
  return reg;
}

/** Votar (ou mudar o voto) na enquete real — 1 voto por conta, claro. */
async function votarEnquete(sock, jid, { enquete, escolha, quoted = null }) {
  const e = enquete || ENQUETES.get(jid);
  if (!e) return { ok: false, msg: 'Não conheço nenhuma enquete ativa neste chat — fui eu que a criei nesta sessão?' };
  let idx = -1;
  // número SÓ se for inteiro puro: «1e1» não pode virar 1
  const mn = String(escolha).match(/^\s*(\d{1,2})\s*$/);
  if (mn) { const n = +mn[1]; if (n >= 1 && n <= e.opcoes.length) idx = n - 1; }
  if (idx < 0) {
    const alvo = String(escolha).toLowerCase().trim();
    idx = e.opcoes.findIndex((o) => o.toLowerCase() === alvo || o.toLowerCase().includes(alvo));
  }
  if (idx < 0) return { ok: false, msg: `Opção não encontrada — vai 1–${e.opcoes.length} ou escreve o nome.` };
  const op = e.opcoes[idx];
  await sock.sendMessage(jid, {
    pollUpdate: {
      key: { ...e.key, fromMe: true, remoteJid: jid },
      senderTimestampMs: Date.now(),
      vote: { sha256Progression: sha256(op) },
    },
  }, { quoted }).catch(async (er) => {
    // alguns builds esperam o hash via content.pollUpdates — tenta o caminho alternativo
    await sock.sendMessage(jid, { pollUpdates: { key: e.key, selectedOptions: [op] } }, { quoted });
  });
  const antes = e.meusVotos.has('me') ? e.meusVotos.get('me') : null; // 0 é índice válido — || não serve
  e.meusVotos.set('me', idx);
  return { ok: true, msg: `Voto registado: *${op}*${antes !== null && antes !== idx ? ` (mudei de «${e.opcoes[antes]}»)` : ''} ✅`, mudou: antes !== null && antes !== idx };
}

/** Tentar ler os resultados; se o cliente não expõe, explica como ver. */
function resultadosEnquete(jid, escolha = '') {
  const e = ENQUETES.get(jid);
  if (!e) return { ok: false, msg: 'Sem enquete ativa da minha memória neste chat.' };
  const linhas = [`📊 *${e.pergunta.slice(0, 90)}*`, ''];
  const extra = (e.puxada || {});
  e.opcoes.forEach((o, i) => {
    const c = (extra.counts && extra.counts[i]) || (e.meusVotos.get('me') === i ? 1 : 0);
    const barra = '█'.repeat(Math.min(12, c)) || '·';
    linhas.push(`${i + 1}. ${o.slice(0, 40)}  ${barra} ${c}`);
  });
  linhas.push('', '👉 Segura a enquete no chat → «Votos» para a contagem completa do WhatsApp.');
  return { ok: true, msg: linhas.join('\n') };
}

/**
 * Se o store do sock guardar a msg da enquete com pollUpdates, agregamos
 * de verdade — senão fica silencioso (o botão «Votos» do app é a fonte).
 */
async function puxarResultados(sock, e) {
  try {
    const store = sock.store && (sock.store.messages || sock.store.loadMessage);
    let msg = null;
    if (store && typeof store.loadMessage === 'function') msg = await store.loadMessage(e.key.remoteJid, e.key.id);
    else if (store && typeof store.get === 'function') msg = store.get(e.key.id);
    if (!msg) return null;
    const { getAggregateVotesInPollMessage } = require('baileys-v6');
    const agg = getAggregateVotesInPollMessage({ message: msg.message, pollUpdates: msg.pollUpdates || [] });
    const counts = e.opcoes.map((o) => { const a = agg.find((x) => x.name === o); return a ? a.voters.length : 0; });
    e.puxada = { counts, total: counts.reduce((s, x) => s + x, 0) };
    return e.puxada;
  } catch { return null; }
}

// ───────────────────── B) VOTAÇÃO-DA-CASA (o bot conta) ─────────────
/**
 * Abre o jogo. `opcoes` = array. `secreta`: contagem só no fim.
 * Botões quick_reply com id `!votar N` → o toque cai no caso igual.
 */
async function abrirVotacao(sock, jid, { pergunta, opcoes, quoted = null, secreta = false, admin = '', bot = null }) {
  if (VOTACOES.get(jid)?.aberto) return { ok: false, msg: 'Já há votação aberta aqui — fecha primeiro: `!votacao fechar`.' };
  const vh = require('../bot/buttonHandler');
  const botoes = opcoes.slice(0, 10).map((o, i) => ({ text: `🗳️ ${i + 1}. ${String(o).slice(0, 20)}`, id: `!votar ${i + 1}` }));
  const corpo = [
    `🗳️ *VOTAÇÃO ABERTA*${admin ? ` · por ${admin}` : ''}`,
    '',
    `❓ ${pergunta}`,
    '',
    opcoes.map((o, i) => `▫️ ${i + 1}. ${o}`).join('\n'),
    '',
    secreta ? '🤫 contagem secreta — só abro na hora do veredicto.' : '👀 contagem visível: `!votacao status`.',
    '🗳️ toca num botão ou escreve `!votar N`. 1 pessoa = 1 voto (podes trocar até fechar).',
  ].join('\n');
  const r = await vh.sendButtons(sock, jid, corpo.slice(0, 900), 'DARK BOT 🕸️ · votação', botoes, quoted);
  const reg = {
    id: `${Date.now()}`, pergunta, opcoes: opcoes.slice(), votos: new Map(),
    aberto: true, quando: Date.now(), secreta, admin,
    msgKey: r && r.key ? r.key : null,
  };
  VOTACOES.set(jid, reg);
  return { ok: true, reg };
}

function votar(jid, autorJid, escolha) {
  const v = VOTACOES.get(jid);
  if (!v) return { ok: false, msg: 'Sem votação a decorrer aqui. Abre uma: `!votacao abrir "pergunta" | a | b`.' };
  if (!v.aberto) return { ok: false, msg: 'Essa já fechou — veredito dado. Abre outra: `!votacao abrir …`.' };
  let idx = -1;
  const mn = String(escolha).match(/^\s*(\d{1,2})\s*$/); // «1e1» fica na rua
  if (mn) { const n = +mn[1]; if (n >= 1 && n <= v.opcoes.length) idx = n - 1; }
  if (idx < 0) {
    const alvo = String(escolha).toLowerCase().trim();
    idx = v.opcoes.findIndex((o) => o.toLowerCase() === alvo || o.toLowerCase().startsWith(alvo));
  }
  if (idx < 0) return { ok: false, msg: `Opção errada — vai 1–${v.opcoes.length}.` };
  const antes = v.votos.get(autorJid);
  v.votos.set(autorJid, idx);
  const quem = String(autorJid).split('@')[0];
  const mesma = antes !== undefined && antes === idx;
  return {
    ok: true,
    trocou: antes !== undefined && antes !== idx,
    mesma,
    msg: (antes === undefined
      ? `🗳️ voto de @${quem} registado: *${v.opcoes[idx]}*${v.secreta ? '' : ` (${contagem(v)[idx]} agora)`}`
      : mesma
        ? `🆗 @${quem} já tinha esse — nada mudou (contagem intacta).`
        : `🔄 @${quem} mudou: *${v.opcoes[antes]}* → *${v.opcoes[idx]}*`) + (v.secreta ? ' 🤫 contagem secreta.' : ''),
  };
}

function contagem(v) {
  const c = v.opcoes.map(() => 0);
  for (const i of v.votos.values()) c[i]++;
  return c;
}

function statusVotacao(jid) {
  const v = VOTACOES.get(jid);
  if (!v) return { ok: false, msg: 'Sem votação aqui.' };
  if (v.secreta) return { ok: true, msg: `🤫 *${v.pergunta.slice(0, 80)}* — ${v.votos.size} voto(s) dentro do envelope. O número é segredo até \`!votacao fechar\`.` };
  const c = contagem(v);
  const total = Math.max(1, c.reduce((s, x) => s + x, 0));
  return {
    ok: true,
    msg: [`📊 *${v.pergunta.slice(0, 90)}*`, '', ...v.opcoes.map((o, i) => {
      const pct = Math.round((c[i] / total) * 100);
      return `${c[i] ? '🟩' : '⬜'} ${o.slice(0, 32)} — ${c[i]}v · ${pct}% ${'█'.repeat(Math.round(pct / 5))}`;
    }), '', `👥 ${v.votos.size} a votarem`].join('\n'),
  };
}

function fecharVotacao(jid) {
  const v = VOTACOES.get(jid);
  if (!v) return { ok: false, msg: 'Sem votação aqui.' };
  if (!v.aberto) return { ok: false, msg: 'Já estava fechada.', v };
  v.aberto = false;
  const c = contagem(v);
  const max = Math.max(...c);
  const ganhadoras = c.map((x, i) => [x, i]).filter(([x]) => x === max);
  const total = v.votos.size;
  const linhas = [
    `⚖️ *VEREDICTO — ${v.pergunta.slice(0, 80)}*`,
    '',
    ...v.opcoes.map((o, i) => {
      const pct = total ? Math.round((c[i] / total) * 100) : 0;
      return `${c[i] === max && max > 0 ? '🏆' : '▫️'} ${o} — ${c[i]}v (${pct}%)`;
    }),
    '',
    max === 0 ? '🫥 Ninguém votou — a pergunta fica no ar.'
      : ganhadoras.length > 1 ? `🤝 EMPATE real: ${ganhadoras.map(([, i]) => v.opcoes[i]).join(' = ')}`
        : `🥇 Vence *${v.opcoes[ganhadoras[0][1]]}* com ${max} voto(s) de ${total}.`,
    `👥 ${total} votante(s) · 1 pessoa = 1 voto, contagem auditável — sem dedos fantasma.`,
  ];
  return { ok: true, msg: linhas.join('\n'), v };
}

function limpar(jid) { VOTACOES.delete(jid); ENQUETES.delete(jid); }
module.exports = {
  extrairPergunta,
  criarEnquete, votarEnquete, resultadosEnquete, puxarResultados,
  abrirVotacao, votar, statusVotacao, fecharVotacao, limpar,
  __test: { ENQUETES, VOTACOES, contagem, sha256 },
};
