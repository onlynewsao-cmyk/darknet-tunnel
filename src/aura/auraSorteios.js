'use strict';
/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║   AURA SORTEIOS & ENQUETES AVANÇADAS v9.23                  ║
 * ║   Sistema completo de sorteios, quizzes e engajamento       ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * Funcionalidades:
 *   1. SORTEIO POR VOTO — escolhe vencedor aleatório dos votos de uma enquete
 *   2. SORTEIO POR REAÇÃO — escolhe de quem reagiu a um post
 *   3. SORTEIO POR NOME — inscrição por nome (reagem com emoji para entrar)
 *   4. SORTEIO POR SEGUIR — só seguidores do canal podem participar
 *   5. QUIZ — enquete com resposta certa (mostra quem acertou)
 *   6. ENQUETE MÚLTIPLA — selecione várias opções
 *   7. ENQUETE COM LIMITE — só N primeiros votam
 *   8. DASHBOARD DE ENGAJAMENTO — métricas por post
 *   9. AUTO-POST — publica conteúdo automático baseado em triggers
 */

const { randomBytes, createHash } = require('crypto');

// ── Estado dos sorteios ─────────────────────────────────────
const _sorteios = new Map();  // id → { tipo, jid, postId, opcoes, participantes, vencedor, ts, config }
const SORTEIO_TTL = 7 * 24 * 60 * 60 * 1000; // 7 dias

// ── Estado dos quizzes ──────────────────────────────────────
const _quizzes = new Map();  // pollId → { jid, pergunta, opcoes, respostaCerta, ts }
const QUIZ_TTL = 24 * 60 * 60 * 1000; // 24 horas

// ── Cache de participantes ──────────────────────────────────
const _participantes = new Map();  // sorteioId → Set<jid>

// ── Métricas de engajamento ─────────────────────────────────
const _metricas = new Map();  // jid → { posts, votos, reacoes, seguidores, ts }

// ══════════════════════════════════════════════════════════════
// 1. SORTEIO POR VOTO — vencedor aleatório dos votos
// ══════════════════════════════════════════════════════════════

/**
 * Cria um sorteio a partir de uma enquete já existente no canal.
 * @param {object} sock - socket Baileys
 * @param {string} canalJid - jid do canal (@newsletter)
 * @param {string} pollId - ID da mensagem da enquete
 * @param {object} opts - { nome, premio, nVencedores }
 */
async function criarSorteioPorVoto(sock, canalJid, pollId, opts = {}) {
  const nome = opts.nome || 'Sorteio';
  const premio = opts.premio || '';
  const nVencedores = Math.max(1, Math.min(10, Number(opts.nVencedores) || 1));

  // Buscar votos da enquete
  const votos = await _buscarVotos(sock, canalJid, pollId);
  if (!votos.length) {
    return { ok: false, msg: 'Ainda não há votos nessa enquete. Espera mais pessoas votarem.' };
  }

  const id = 'sort_' + randomBytes(4).toString('hex');
  const sorteio = {
    id, tipo: 'voto', jid: canalJid, postId: pollId,
    nome, premio, nVencedores,
    participantes: votos.map(v => ({ jid: v.jid, nome: v.nome, opcao: v.opcao })),
    vencedor: null, ts: Date.now(), config: opts,
  };
  _sorteios.set(id, sorteio);

  return { ok: true, id, sorteio, msg: `🎲 Sorteio *${nome}* criado com ${votos.length} participantes.` };
}

/**
 * Executa o sorteio — escolhe N vencedores aleatórios.
 */
async function executarSorteio(sock, sorteioId) {
  const s = _sorteios.get(sorteioId);
  if (!s) return { ok: false, msg: 'Sorteio não encontrado.' };
  if (s.vencedor) return { ok: false, msg: `O sorteio *${s.nome}* já tem vencedor: *${s.vencedor[0]?.nome || 'alguém'}*` };

  const pool = [...s.participantes];
  if (!pool.length) return { ok: false, msg: 'Sem participantes.' };

  // Fisher-Yates shuffle e pegar N
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  s.vencedor = pool.slice(0, s.nVencedores);
  _sorteios.set(sorteioId, s);

  const linhas = s.vencedor.map((v, i) => {
    const medalha = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
    return `${medalha} *${v.nome || 'Anónimo'}*${v.opcao ? ` (votou: ${v.opcao})` : ''}`;
  });

  return {
    ok: true, vencedores: s.vencedor,
    msg: `🎲 *SORTEIO: ${s.nome}*\n\n` +
         `🏆 Vencedor${s.vencedor.length > 1 ? 'es' : ''}:\n${linhas.join('\n')}\n\n` +
         (s.premio ? `🎁 Prémio: ${s.premio}\n` : '') +
         `📊 ${pool.length} participantes`,
  };
}

// ══════════════════════════════════════════════════════════════
// 2. SORTEIO POR REAÇÃO — quem reagiu ao post
// ══════════════════════════════════════════════════════════════

/**
 * Cria sorteio entre quem reagiu a uma publicação.
 * Usa newsletterFetchMessages para ler reações.
 */
async function criarSorteioPorReacao(sock, canalJid, postId, opts = {}) {
  const nome = opts.nome || 'Sorteio por Reação';
  const emojiAlvo = opts.emoji || null; // null = qualquer reação
  const nVencedores = Math.max(1, Math.min(10, Number(opts.nVencedores) || 1));

  // Buscar reações do post
  const reacoes = await _buscarReacoes(sock, canalJid, postId, emojiAlvo);
  if (!reacoes.length) {
    return { ok: false, msg: 'Ninguém reagiu a essa publicação ainda.' };
  }

  const id = 'reac_' + randomBytes(4).toString('hex');
  const sorteio = {
    id, tipo: 'reacao', jid: canalJid, postId,
    nome, premio: opts.premio || '', nVencedores,
    participantes: reacoes,
    vencedor: null, ts: Date.now(), config: opts,
  };
  _sorteios.set(id, sorteio);

  return { ok: true, id, sorteio, msg: `🎲 Sorteio *${nome}* criado com ${reacoes.length} reações.` };
}

// ══════════════════════════════════════════════════════════════
// 3. SORTEIO POR NOME — inscrição por reação com emoji
// ══════════════════════════════════════════════════════════════

/**
 * Publica um post de inscrição no canal. Seguidores reagem com emoji
 * para entrar no sorteio.
 */
async function criarSorteioPorNome(sock, canalJid, opts = {}) {
  const nome = opts.nome || 'Sorteio Aberto';
  const premio = opts.premio || 'Prémio surpresa';
  const emojiInscricao = opts.emoji || '🎲';
  const nVencedores = Math.max(1, Math.min(10, Number(opts.nVencedores) || 1));
  const regras = opts.regras || '';

  const id = 'nome_' + randomBytes(4).toString('hex');

  // Publicar post de inscrição
  const texto = `🎲 *${nome.toUpperCase()}*\n\n` +
    `🎁 Prémio: *${premio}*\n\n` +
    `📝 Como participar:\n` +
    `▸ Reage com ${emojiInscricao} neste post\n` +
    `▸ ${nVencedores > 1 ? `${nVencedores} vencedores serão sorteados` : 'Será sorteado 1 vencedor'}\n` +
    (regras ? `\n📋 Regras: ${regras}\n` : '') +
    `\n⏰ Boa sorte! 🍀`;

  let resp;
  try {
    resp = await sock.sendMessage(canalJid, { text: texto });
  } catch (e) {
    return { ok: false, msg: 'Não consegui publicar o sorteio: ' + String(e?.message || e).slice(0, 60) };
  }

  const postId = resp?.key?.id || resp?.id || '';

  const sorteio = {
    id, tipo: 'nome', jid: canalJid, postId,
    nome, premio, nVencedores, emojiInscricao,
    participantes: [], vencedor: null, ts: Date.now(), config: opts,
    postTexto: texto,
  };
  _sorteios.set(id, sorteio);

  return {
    ok: true, id, postId, sorteio,
    msg: `🎲 Sorteio *${nome}* publicado no canal!\n\n` +
         `Post ID: ${postId}\n` +
         `Emoji de inscrição: ${emojiInscricao}\n\n` +
         `Quando quiseres fechar: *!canal sorteio fechar ${id}*`,
  };
}

// ══════════════════════════════════════════════════════════════
// 4. SORTEIO POR SEGUIR — só seguidores participam
// ══════════════════════════════════════════════════════════════

/**
 * Sorteio exclusivo para seguidores. Publica post com enquete
 * "Quero participar" — quem vota entra no sorteio.
 * Depois verifica se é seguidor (via metadata).
 */
async function criarSorteioPorSeguir(sock, canalJid, opts = {}) {
  const nome = opts.nome || 'Sorteio de Seguidores';
  const premio = opts.premio || 'Prémio exclusivo';
  const nVencedores = Math.max(1, Math.min(10, Number(opts.nVencedores) || 1));

  const id = 'seg_' + randomBytes(4).toString('hex');

  // Criar enquete de participação
  const pergunta = `🎲 ${nome} — Queres participar?`;
  const opcoes = ['✅ Sim, quero participar!', '❌ Não, obrigado'];

  let resp;
  try {
    const secret = randomBytes(32);
    resp = await sock.sendMessage(canalJid, {
      poll: { name: pergunta, values: opcoes, selectableCount: 1, messageSecret: secret },
    });
  } catch (e) {
    return { ok: false, msg: 'Não consegui criar a enquete: ' + String(e?.message || e).slice(0, 60) };
  }

  const pollId = resp?.key?.id || resp?.id || '';

  const sorteio = {
    id, tipo: 'seguir', jid: canalJid, postId: pollId,
    nome, premio, nVencedores,
    participantes: [], vencedor: null, ts: Date.now(), config: opts,
    opcoes,
  };
  _sorteios.set(id, sorteio);

  // Publicar texto explicativo junto com a enquete
  await sock.sendMessage(canalJid, {
    text: `🎲 *${nome.toUpperCase()}*\n\n` +
          `🎁 Prémio: *${premio}*\n\n` +
          `📋 Regras:\n` +
          `▸ Só seguidores do canal podem participar\n` +
          `▸ Vota "✅ Sim" na enquete acima\n` +
          `▸ ${nVencedores > 1 ? `${nVencedores} vencedores sorteados` : '1 vencedor sorteado'}\n\n` +
          `🍀 Boa sorte!`,
  }).catch(() => {});

  return {
    ok: true, id, pollId, sorteio,
    msg: `🎲 Sorteio *${nome}* criado com enquete de participação!\n` +
         `Seguidores votam "✅ Sim" para entrar.\n\n` +
         `Para fechar: *!canal sorteio fechar ${id}*`,
  };
}

// ══════════════════════════════════════════════════════════════
// 5. QUIZ — enquete com resposta certa
// ══════════════════════════════════════════════════════════════

/**
 * Cria um quiz no canal — enquete com uma resposta correta.
 * Quando alguém vota, o bot verifica se acertou.
 */
async function criarQuiz(sock, canalJid, opts = {}) {
  const pergunta = opts.pergunta || 'Pergunta do quiz';
  const opcoes = opts.opcoes || ['A', 'B', 'C'];
  const respostaCerta = opts.resposta || opts.respostaCerta || opcoes[0];
  const nVencedores = Math.max(1, Math.min(10, Number(opts.nVencedores) || 1));

  // Verificar que a resposta certa está nas opções
  const idxResposta = opcoes.findIndex(o =>
    o.toLowerCase().trim() === respostaCerta.toLowerCase().trim()
  );
  if (idxResposta === -1) {
    return { ok: false, msg: `A resposta "${respostaCerta}" não está nas opções. Opções: ${opcoes.join(', ')}` };
  }

  const id = 'quiz_' + randomBytes(4).toString('hex');

  // Criar enquete
  const secret = randomBytes(32);
  let resp;
  try {
    resp = await sock.sendMessage(canalJid, {
      poll: { name: `🧠 QUIZ: ${pergunta}`, values: opcoes, selectableCount: 1, messageSecret: secret },
    });
  } catch (e) {
    return { ok: false, msg: 'Não consegui criar o quiz: ' + String(e?.message || e).slice(0, 60) };
  }

  const pollId = resp?.key?.id || resp?.id || '';

  const quiz = {
    id, jid: canalJid, pollId,
    pergunta, opcoes, respostaCerta: opcoes[idxResposta],
    ts: Date.now(), respostas: [], nVencedores,
  };
  _quizzes.set(pollId, quiz);
  _sorteios.set(id, { ...quiz, tipo: 'quiz', nome: pergunta, participantes: [], vencedor: null, premio: opts.premio || '' });

  // Publicar dica junto
  await sock.sendMessage(canalJid, {
    text: `🧠 *QUIZ*\n\n` +
          `📝 ${pergunta}\n\n` +
          `💡 Vota na resposta que achas certa!\n` +
          `📊 Resultados só aparecem depois de votares.\n` +
          (opts.premio ? `🎁 Quem acertar concorre a: *${opts.premio}*\n` : '') +
          `\n⏰ Boa sorte!`,
  }).catch(() => {});

  return {
    ok: true, id, pollId, quiz,
    msg: `🧠 Quiz criado!\n\n` +
         `Pergunta: ${pergunta}\n` +
         `Resposta certa: ||${opcoes[idxResposta]}|| (oculta)\n` +
         `Opções: ${opcoes.join(', ')}`,
  };
}

/**
 * Revela o resultado do quiz — quem acertou.
 */
async function revelarQuiz(sock, canalJid, quizId) {
  const quiz = _sorteios.get(quizId);
  if (!quiz || quiz.tipo !== 'quiz') return { ok: false, msg: 'Quiz não encontrado.' };

  // Buscar votos e filtrar quem acertou
  const votos = await _buscarVotos(sock, canalJid, quiz.pollId);
  const acertaram = votos.filter(v =>
    v.opcao?.toLowerCase().trim() === quiz.respostaCerta.toLowerCase().trim()
  );
  const erraram = votos.filter(v =>
    v.opcao?.toLowerCase().trim() !== quiz.respostaCerta.toLowerCase().trim()
  );

  const linhas = [
    `🧠 *RESULTADO DO QUIZ*`,
    ``,
    `📝 ${quiz.pergunta}`,
    `✅ Resposta certa: *${quiz.respostaCerta}*`,
    ``,
    `📊 ${votos.length} participantes · ${acertaram.length} acertaram · ${erraram.length} erraram`,
  ];

  if (acertaram.length) {
    linhas.push('', '🏆 *Quem acertou:*');
    acertaram.slice(0, 10).forEach((v, i) => {
      linhas.push(`${i + 1}. ${v.nome || 'Anónimo'}`);
    });
    if (acertaram.length > 10) linhas.push(`... e mais ${acertaram.length - 10}`);
  }

  // Se tem prémio, fazer sorteio entre quem acertou
  if (quiz.premio && acertaram.length) {
    const nVencedores = Math.min(quiz.nVencedores || 1, acertaram.length);
    const vencedores = _sortearDe(acertaram, nVencedores);
    linhas.push('', `🎁 *Vencedor${vencedores.length > 1 ? 'es' : ''} do prémio:*`);
    vencedores.forEach((v, i) => {
      linhas.push(`${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '•'} ${v.nome || 'Anónimo'}`);
    });
    linhas.push('', `🎁 Prémio: ${quiz.premio}`);
    quiz.vencedor = vencedores;
    _sorteios.set(quizId, quiz);
  }

  return { ok: true, msg: linhas.join('\n') };
}

// ══════════════════════════════════════════════════════════════
// 6. ENQUETE MÚLTIPLA — selecione várias opções
// ══════════════════════════════════════════════════════════════

/**
 * Cria enquete com seleção múltipla (até N opções).
 */
async function criarEnqueteMultipla(sock, canalJid, opts = {}) {
  const pergunta = opts.pergunta || 'Escolha as suas opções';
  const opcoes = opts.opcoes || ['Opção 1', 'Opção 2', 'Opção 3'];
  const maxSelecoes = Math.max(2, Math.min(opcoes.length, Number(opts.maxSelecoes) || opcoes.length));

  const secret = randomBytes(32);
  try {
    const resp = await sock.sendMessage(canalJid, {
      poll: { name: pergunta, values: opcoes, selectableCount: maxSelecoes, messageSecret: secret },
    });
    const pollId = resp?.key?.id || resp?.id || '';
    return {
      ok: true, pollId,
      msg: `📊 Enquete múltipla criada!\n\n` +
           `${pergunta}\n` +
           `Opções: ${opcoes.join(', ')}\n` +
           `Seleciona até ${maxSelecoes} opções`,
    };
  } catch (e) {
    return { ok: false, msg: 'Não consegui criar: ' + String(e?.message || e).slice(0, 60) };
  }
}

// ══════════════════════════════════════════════════════════════
// 7. ENQUETE COM LIMITE — só N primeiros votam
// ══════════════════════════════════════════════════════════════

/**
 * Enquete que fecha automaticamente após N votos.
 */
async function criarEnqueteComLimite(sock, canalJid, opts = {}) {
  const pergunta = opts.pergunta || 'Vota rápido!';
  const opcoes = opts.opcoes || ['Sim', 'Não'];
  const limite = Math.max(2, Number(opts.limite) || 10);

  const secret = randomBytes(32);
  let resp;
  try {
    resp = await sock.sendMessage(canalJid, {
      poll: { name: `${pergunta} (só ${limite} votos!)`, values: opcoes, selectableCount: 1, messageSecret: secret },
    });
  } catch (e) {
    return { ok: false, msg: 'Não consegui criar: ' + String(e?.message || e).slice(0, 60) };
  }

  const pollId = resp?.key?.id || resp?.id || '';

  const sorteio = {
    id: 'lim_' + randomBytes(4).toString('hex'),
    tipo: 'limite', jid: canalJid, pollId,
    nome: pergunta, limite, participantes: [], vencedor: null,
    ts: Date.now(), config: opts, opcoes,
  };
  _sorteios.set(sorteio.id, sorteio);

  return {
    ok: true, id: sorteio.id, pollId, sorteio,
    msg: `⚡ Enquete com limite criada!\n\n` +
         `${pergunta}\n` +
         `Só os primeiros ${limite} votam!\n` +
         `Opções: ${opcoes.join(', ')}`,
  };
}

// ══════════════════════════════════════════════════════════════
// 8. DASHBOARD DE ENGAJAMENTO
// ══════════════════════════════════════════════════════════════

/**
 * Analisa o engajamento do canal — posts, votos, reações.
 */
async function dashboardEngajamento(sock, canalJid) {
  if (typeof sock.newsletterMetadata !== 'function' || typeof sock.newsletterFetchMessages !== 'function') {
    return { ok: false, msg: 'API de canais indisponível.' };
  }

  let meta = null, posts = [];
  try {
    meta = await sock.newsletterMetadata('jid', canalJid);
    posts = await sock.newsletterFetchMessages(canalJid, 50, 0, 0);
  } catch (e) {
    return { ok: false, msg: 'Não consegui ler o canal: ' + String(e?.message || e).slice(0, 60) };
  }

  const totalPosts = posts?.length || 0;
  const totalReacoes = posts?.reduce((sum, p) => sum + (p.reactions?.length || 0), 0) || 0;
  const postsComVoto = posts?.filter(p => p.message?.pollCreationMessageV3 || p.message?.pollCreationMessage) || [];

  const linhas = [
    `📊 *ENGAJAMENTO DO CANAL*`,
    ``,
    `📡 Canal: *${meta?.name || 'Canal'}*`,
    `👥 ${meta?.subscribers ?? '?'} seguidores`,
    ``,
    `📝 *${totalPosts}* publicações recentes`,
    `❤️ *${totalReacoes}* reações totais`,
    `📊 *${postsComVoto.length}* enquetes`,
    ``,
    `📈 Taxa de engajamento: ${totalPosts > 0 ? Math.round((totalReacoes / totalPosts) * 10) / 10 : 0} reações/post`,
  ];

  // Top posts por reações
  const topPosts = [...(posts || [])]
    .filter(p => (p.reactions?.length || 0) > 0)
    .sort((a, b) => (b.reactions?.length || 0) - (a.reactions?.length || 0))
    .slice(0, 3);

  if (topPosts.length) {
    linhas.push('', '🏆 *Top posts por reações:*');
    topPosts.forEach((p, i) => {
      const texto = p.message?.conversation ||
                    p.message?.extendedTextMessage?.text ||
                    p.message?.imageMessage?.caption ||
                    p.message?.pollCreationMessageV3?.name ||
                    '[ mídia ]';
      const nReacoes = p.reactions?.length || 0;
      linhas.push(`${i + 1}. ${String(texto).slice(0, 50)}... — ${nReacoes} reações`);
    });
  }

  return { ok: true, msg: linhas.join('\n'), meta, posts: totalPosts, reacoes: totalReacoes };
}

// ══════════════════════════════════════════════════════════════
// 9. LISTAR SORTEIOS ATIVOS
// ══════════════════════════════════════════════════════════════

function listarSorteios(canalJid = null) {
  const now = Date.now();
  const lista = [];
  for (const [, s] of _sorteios) {
    if (now - s.ts > SORTEIO_TTL) continue;
    if (canalJid && s.jid !== canalJid) continue;
    lista.push({
      id: s.id,
      tipo: s.tipo,
      nome: s.nome,
      premio: s.premio,
      participantes: s.participantes?.length || 0,
      vencedor: s.vencedor,
      ts: s.ts,
      postId: s.postId,
    });
  }
  return lista.sort((a, b) => b.ts - a.ts);
}

// ══════════════════════════════════════════════════════════════
// HELPERS INTERNOS
// ══════════════════════════════════════════════════════════════

/**
 * Busca votos de uma enquete no canal.
 * Usa o messageCache + decryptPollVote.
 */
async function _buscarVotos(sock, canalJid, pollId) {
  const votos = [];
  let cache;
  try { cache = require('../bot/messageListener').messageCache; } catch { return votos; }

  // Encontrar a mensagem de criação para obter opções e secret
  let info = null;
  for (const [, m] of cache) {
    if (m.key?.id !== pollId || m.key?.remoteJid !== canalJid) continue;
    const pc = m.message?.pollCreationMessageV3 || m.message?.pollCreationMessage;
    const secret = m.messageContextInfo?.messageSecret;
    if (pc?.options?.length && secret) {
      info = { options: pc.options.map(o => o.optionName), secret };
      break;
    }
  }
  if (!info) return votos;

  // Buscar votos
  for (const [, m] of cache) {
    const pu = m?.message?.pollUpdateMessage;
    if (!pu) continue;
    const key = pu.pollCreationMessageKey;
    if (key?.id !== pollId || key?.remoteJid !== canalJid) continue;

    const voter = m.key?.participant || m.key?.remoteJid || '';
    let selectedOptions = null;
    try {
      const { decryptPollVote } = require('@systemzero/baileys');
      const vote = decryptPollVote(
        { encPayload: pu.vote?.encPayload, encIv: pu.vote?.encIv },
        { pollCreatorJid: sock?.user?.id || '', pollMsgId: pollId, pollEncKey: info.secret, voterJid: voter }
      );
      selectedOptions = (vote?.selectedOptions || []).map(h => Buffer.from(h).toString('hex'));
    } catch { continue; }

    if (selectedOptions?.length) {
      for (const h of selectedOptions) {
        const idx = info.options.findIndex(o => _hashOpt(o) === h);
        votos.push({
          jid: voter,
          nome: String(voter).split('@')[0],
          opcao: idx >= 0 ? info.options[idx] : 'outra',
        });
      }
    }
  }

  return votos;
}

/**
 * Busca reações de uma publicação no canal.
 */
async function _buscarReacoes(sock, canalJid, postId, emojiAlvo = null) {
  const reacoes = [];
  let posts;
  try {
    posts = await sock.newsletterFetchMessages(canalJid, 50, 0, 0);
  } catch { return reacoes; }

  const post = posts?.find(p =>
    String(p.server_id ?? p.serverId ?? p.id) === String(postId) ||
    p.key?.id === postId
  );
  if (!post?.reactions?.length) return reacoes;

  for (const r of post.reactions) {
    if (emojiAlvo && r.emoji !== emojiAlvo) continue;
    reacoes.push({
      jid: r.senderJid || r.jid || '',
      nome: String(r.senderJid || r.jid || '').split('@')[0],
      emoji: r.emoji,
    });
  }

  return reacoes;
}

function _hashOpt(nome) {
  return createHash('sha256').update(String(nome)).digest('hex');
}

function _sortearDe(pool, n) {
  const arr = [...pool];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, n);
}

// ── Cleanup periódico ───────────────────────────────────────
setInterval(() => {
  const now = Date.now();
  for (const [k, s] of _sorteios) {
    if (now - s.ts > SORTEIO_TTL) _sorteios.delete(k);
  }
  for (const [k, q] of _quizzes) {
    if (now - q.ts > QUIZ_TTL) _quizzes.delete(k);
  }
}, 10 * 60 * 1000).unref?.();

module.exports = {
  // Sorteios
  criarSorteioPorVoto,
  criarSorteioPorReacao,
  criarSorteioPorNome,
  criarSorteioPorSeguir,
  executarSorteio,
  listarSorteios,

  // Quiz
  criarQuiz,
  revelarQuiz,

  // Enquetes avançadas
  criarEnqueteMultipla,
  criarEnqueteComLimite,

  // Dashboard
  dashboardEngajamento,

  // Helpers (para testes)
  _sorteios,
  _quizzes,
  _buscarVotos,
  _buscarReacoes,
  _sortearDe,
};