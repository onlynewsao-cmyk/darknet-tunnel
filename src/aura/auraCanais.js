'use strict';
const { randomBytes, createHash } = require('crypto');

/**
 * AURA — CANAIS, CONVITES E PARTILHA (v6.82)
 *
 * O que aqui está e porquê:
 *
 *  1. entrarPorLink()  — aceita links de GRUPO (chat.whatsapp.com/XXXX) e de
 *     CANAL (whatsapp.com/channel/XXXX). São dois mecanismos diferentes no
 *     protocolo: grupo usa `groupAcceptInvite(code)`, canal usa
 *     `newsletterMetadata('invite', code)` + `newsletterFollow(jid)`.
 *
 *  2. reagirTudoCanal() — na v6.81 disse que era impossível. Estava errado:
 *     o fork exporta `newsletterFetchMessages(jid, count, since, after)` e
 *     `newsletterReactMessage(jid, serverId, emoji)`. Dá para varrer as
 *     últimas N publicações e reagir a cada uma.
 *     ATENÇÃO: as reacções de canal usam `server_id` (um número por post),
 *     não a `key.id` das mensagens normais.
 *
 *  3. reencaminhar() — partilhar uma mensagem para vários grupos.
 *     NÃO se usa o `forwardMessage` do megaActions: aquele reaproveita o
 *     `messageId` original em todos os destinos, e o WhatsApp trata IDs
 *     repetidos como duplicados (a segunda cópia desaparece). Aqui gera-se
 *     um ID novo por destino e marca-se `forwardingScore` para o WhatsApp
 *     mostrar "reencaminhada", como faz a app.
 *
 * Velocidade: nada disto corre no caminho das mensagens normais. Só é
 * chamado quando o cérebro reconhece uma ordem explícita.
 */

const RE_GRUPO = /chat\.whatsapp\.com\/(?:invite\/)?([0-9A-Za-z]{20,26})/i;
const RE_CANAL = /(?:whatsapp\.com|wa\.me)\/channel\/([0-9A-Za-z_-]{15,40})/i;

/** Tira o código de convite de um texto. */
function extrairConvite(texto = '') {
  const g = String(texto).match(RE_GRUPO);
  if (g) return { tipo: 'grupo', code: g[1] };
  const c = String(texto).match(RE_CANAL);
  if (c) return { tipo: 'canal', code: c[1] };
  return null;
}

/**
 * Entra num grupo ou canal a partir de um link.
 * @returns {{ok:boolean, tipo?:string, jid?:string, nome?:string, msg:string}}
 */
async function entrarPorLink(sock, texto) {
  const conv = extrairConvite(texto);
  if (!conv) {
    return { ok: false, msg: 'Não vi nenhum link de grupo nem de canal na mensagem. Manda o link que eu entro.' };
  }

  // ── GRUPO OU COMUNIDADE ─────────────────────────────────
  if (conv.tipo === 'grupo') {
    // v7.9: um link chat.whatsapp.com tanto pode ser de grupo como de
    // comunidade. A comunidade é o caso específico — testa-se primeiro.
    try {
      if (typeof sock.communityGetInviteInfo === 'function') {
        const c = await sock.communityGetInviteInfo(conv.code);
        if (c?.isCommunity && typeof sock.communityAcceptInvite === 'function') {
          const jid = await sock.communityAcceptInvite(conv.code);
          const nome = c.subject || c.name || '';
          return {
            ok: true, tipo: 'comunidade', jid, nome,
            msg: nome ? `Entrei na comunidade *${nome}*. 🖤` : 'Entrei na comunidade. 🖤',
          };
        }
      }
    } catch { /* não era comunidade — segue para grupo */ }

    try {
      // Espreita antes de entrar — assim consigo dizer o nome.
      let nome = '';
      try {
        const info = await sock.groupGetInviteInfo(conv.code);
        nome = info?.subject || '';
      } catch { /* alguns convites não deixam espreitar; entra na mesma */ }

      const jid = await sock.groupAcceptInvite(conv.code);
      return {
        ok: true, tipo: 'grupo', jid, nome,
        msg: nome ? `Entrei no *${nome}*. 🖤` : 'Entrei no grupo. 🖤',
      };
    } catch (e) {
      const m = String(e?.message || e);
      if (/not-authorized|403/i.test(m)) return { ok: false, msg: 'Esse convite já não serve — foi revogado ou o link expirou.' };
      if (/gone|410/i.test(m)) return { ok: false, msg: 'Esse grupo já não existe.' };
      if (/conflict|409/i.test(m)) return { ok: false, msg: 'Já estou nesse grupo.' };
      return { ok: false, msg: `Não consegui entrar: ${m.slice(0, 80)}` };
    }
  }

  // ── CANAL (newsletter) ───────────────────────────────────
  try {
    if (typeof sock.newsletterMetadata !== 'function' || typeof sock.newsletterFollow !== 'function') {
      return { ok: false, msg: 'Esta versão do WhatsApp que uso não mexe em canais.' };
    }
    const meta = await sock.newsletterMetadata('invite', conv.code);
    if (!meta?.id) return { ok: false, msg: 'Não encontrei esse canal — o link deve estar partido.' };

    await sock.newsletterFollow(meta.id);
    return {
      ok: true, tipo: 'canal', jid: meta.id, nome: meta.name || '',
      msg: meta.name ? `Segui o canal *${meta.name}*. 🖤` : 'Segui o canal. 🖤',
    };
  } catch (e) {
    return { ok: false, msg: `Não consegui seguir o canal: ${String(e?.message || e).slice(0, 80)}` };
  }
}

/**
 * Reage às últimas publicações de um canal.
 * @param {string} alvoJid  jid do canal (@newsletter) — ou link
 * @param {string} emoji
 * @param {number} quantas  tecto de segurança (por omissão 30)
 */
async function reagirTudoCanal(sock, alvoJid, emoji = '🕸️', quantas = 10) {
  quantas = Math.min(Number(quantas) || 10, 15); // v7.45 anti-restrição: tecto 15 reacções por pedido
  let jid = alvoJid;

  // aceita link em vez de jid
  if (!/@newsletter$/.test(String(jid || ''))) {
    const conv = extrairConvite(String(alvoJid || ''));
    if (conv?.tipo === 'canal') {
      try {
        const meta = await sock.newsletterMetadata('invite', conv.code);
        jid = meta?.id;
      } catch { /* fica indefinido, tratado abaixo */ }
    }
  }
  if (!/@newsletter$/.test(String(jid || ''))) {
    return { ok: false, msg: 'Preciso do link do canal ou de estar dentro dele.' };
  }
  if (typeof sock.newsletterFetchMessages !== 'function') {
    return { ok: false, msg: 'Esta versão não me deixa ler as publicações do canal.' };
  }

  let posts = [];
  try {
    posts = await sock.newsletterFetchMessages(jid, Math.min(quantas, 50), 0, 0);
  } catch (e) {
    return { ok: false, msg: `Não consegui ler o canal: ${String(e?.message || e).slice(0, 70)}` };
  }
  if (!Array.isArray(posts) || !posts.length) {
    return { ok: false, msg: 'Esse canal não tem publicações que eu consiga ler.' };
  }

  let feitas = 0, falhas = 0;
  for (const p of posts) {
    // o server_id aparece com nomes diferentes conforme a versão
    const sid = p?.server_id ?? p?.serverId ?? p?.newsletterServerId ?? p?.id;
    if (sid === undefined || sid === null) { falhas++; continue; }
    try {
      await sock.newsletterReactMessage(jid, String(sid), emoji);
      feitas++;
      // trava anti-banimento: o WhatsApp corta quem dispara em rajada
      await new Promise(r => setTimeout(r, 1200 + Math.floor(Math.random() * 1800)));
    } catch { falhas++; }
  }

  if (!feitas) return { ok: false, msg: 'Não consegui reagir a nenhuma publicação.' };
  return {
    ok: true, feitas, falhas,
    msg: `Reagi com ${emoji} a ${feitas} publicaç${feitas === 1 ? 'ão' : 'ões'}${falhas ? ` (${falhas} não deram)` : ''}. 🖤`,
  };
}

/** Publica texto num canal. */
async function postarCanal(sock, jid, texto) {
  try {
    await sock.sendMessage(jid, { text: texto });
    return { ok: true };
  } catch (e) { return { ok: false, msg: String(e?.message || e).slice(0, 80) }; }
}

/**
 * Reencaminha uma mensagem para vários destinos.
 *
 * Gera ID novo por destino (ver nota no topo) e marca como reencaminhada.
 * @param {object} msg  a mensagem original (a que foi respondida)
 * @param {string[]} destinos  lista de jids
 */
async function reencaminhar(sock, msg, destinos = []) {
  const conteudo = msg?.message;
  if (!conteudo) return { ok: false, enviados: 0, msg: 'Essa mensagem não tem conteúdo que eu consiga reencaminhar.' };

  // desembrulha mensagens efémeras / view-once, senão o reenvio sai vazio
  const real = conteudo.ephemeralMessage?.message
    || conteudo.viewOnceMessage?.message
    || conteudo.viewOnceMessageV2?.message
    || conteudo.documentWithCaptionMessage?.message
    || conteudo;

  // marca "reencaminhada", como a app faz
  const tipo = Object.keys(real)[0];
  if (tipo && real[tipo] && typeof real[tipo] === 'object') {
    real[tipo].contextInfo = {
      ...(real[tipo].contextInfo || {}),
      isForwarded: true,
      forwardingScore: Math.max(1, (real[tipo].contextInfo?.forwardingScore || 0) + 1),
    };
  }

  let enviados = 0;
  const falhou = [];
  // v7.45 anti-restrição: no máximo 10 grupos por pedido
  const MAX_DESTINOS = 10;
  destinos = destinos.slice(0, MAX_DESTINOS);
  for (const jid of destinos) {
    try {
      // ID novo por destino: com o mesmo ID o WhatsApp engole as cópias
      await sock.relayMessage(jid, real, { messageId: undefined });
      enviados++;
      await new Promise(r => setTimeout(r, 5000 + Math.floor(Math.random() * 4000))); // v7.45: 5–9 s entre grupos
    } catch (e) {
      falhou.push(jid);
    }
  }

  return {
    ok: enviados > 0,
    enviados,
    falhou: falhou.length,
    msg: enviados
      ? `Reencaminhei para ${enviados} grupo${enviados === 1 ? '' : 's'}${falhou.length ? ` (${falhou.length} falharam)` : ''}. 🖤`
      : 'Não consegui reencaminhar para nenhum grupo.',
  };
}

/**
 * Lista os grupos onde ela está.
 * @param {boolean} soAdmin  só onde ela é admin (evita levar com bloqueios)
 */
async function meusGrupos(sock, soAdmin = false) {
  try {
    const todos = await sock.groupFetchAllParticipating();
    const eu = (sock.user?.id || '').split(':')[0].split('@')[0];
    const lista = Object.values(todos || {});
    if (!soAdmin) return lista;
    return lista.filter(g => (g.participants || []).some(p =>
      String(p.id || '').includes(eu) && (p.admin === 'admin' || p.admin === 'superadmin')));
  } catch { return []; }
}

// ═══════════════════════════════════════════════════════════
// v7.10 ETAPA 4 — GESTÃO DO CANAL DO BOT
// Lembra o canal criado/gerido pelo bot (MongoDB via botConfigCache),
// para "muda o nome do MEU canal" funcionar sem precisar de link.
// ═══════════════════════════════════════════════════════════

const CHAVE_CANAL = 'aura_canal';
let _meuCanalCache = null;

/** Guarda o canal do bot (jid, name, invite, description). */
async function guardarCanal(dados) {
  _meuCanalCache = dados || null;
  try {
    const cache = require('../bot/botConfigCache');
    await cache.set(CHAVE_CANAL, dados || null);
  } catch { /* sem BD não persiste, mas fica em memória */ }
}

/** O canal do bot (guardado), ou null. */
async function meuCanal() {
  if (_meuCanalCache) return _meuCanalCache;
  try {
    const cache = require('../bot/botConfigCache');
    const d = await cache.get(CHAVE_CANAL, null);
    if (d && d.jid) _meuCanalCache = d;
    return _meuCanalCache;
  } catch { return null; }
}

/** Garante o sufixo @newsletter num jid de canal. */
function normJid(id) {
  const s = String(id || '').trim();
  if (!s) return '';
  return s.endsWith('@newsletter') ? s : `${s}@newsletter`;
}

/** Resolve o jid de um canal a partir de um link ou jid directo. */
async function resolverCanal(sock, alvo) {
  const t = String(alvo || '').trim();
  if (/@newsletter$/i.test(t)) return t;
  const conv = extrairConvite(t);
  if (conv?.tipo === 'canal') {
    const meta = await sock.newsletterMetadata('invite', conv.code);
    return meta?.id || null;
  }
  return null;
}

/**
 * v7.10 — resolve o alvo de uma acção de gestão: link, jid, ou o
 * "meu canal" guardado (por omissão). Para seguir/deixar de seguir
 * passa { permitirMeu: false } — não faz sentido seguir o próprio canal.
 */
async function resolverAlvo(sock, texto, opts = {}) {
  const { permitirMeu = true } = opts;
  const t = String(texto || '').trim();
  const direto = await resolverCanal(sock, t).catch(() => null);
  if (direto) return direto;
  if (permitirMeu) {
    const meu = await meuCanal();
    if (meu?.jid) return meu.jid;
  }
  return null;
}

/**
 * v7.9 — informação de um canal (nome, descrição, seguidores).
 */
async function infoCanal(sock, alvo) {
  if (typeof sock.newsletterMetadata !== 'function') {
    return { ok: false, msg: 'Esta versão do WhatsApp que uso não lê canais.' };
  }
  const jid = await resolverAlvo(sock, alvo, { permitirMeu: true }).catch(() => null);
  let meta = null;
  try {
    if (jid) {
      meta = await sock.newsletterMetadata('jid', jid);
    } else {
      const conv = extrairConvite(String(alvo || ''));
      if (conv?.tipo === 'canal') meta = await sock.newsletterMetadata('invite', conv.code);
    }
  } catch (e) {
    return { ok: false, msg: `Não consegui ler o canal: ${String(e?.message || e).slice(0, 80)}` };
  }
  if (!meta?.name && !meta?.description) {
    return { ok: false, msg: 'Não encontrei esse canal — manda o link (whatsapp.com/channel/...).' };
  }
  const linhas = [`Canal *${meta.name || ''}*`];
  if (meta.description) linhas.push(String(meta.description).slice(0, 220));
  if (typeof meta.subscribers === 'number') linhas.push(`👥 ${meta.subscribers} seguidores`);
  if (meta.invite) linhas.push(`https://whatsapp.com/channel/${meta.invite}`);
  return { ok: true, msg: linhas.join('\n\n') };
}

/**
 * v7.9 — deixar de seguir um canal (por link ou jid).
 */
async function deixarCanal(sock, alvo) {
  if (typeof sock.newsletterUnfollow !== 'function') {
    return { ok: false, msg: 'Esta versão do WhatsApp que uso não deixa de seguir canais.' };
  }
  const jid = await resolverCanal(sock, alvo).catch(() => null);
  if (!jid) return { ok: false, msg: 'Manda o link do canal que queres que eu deixe de seguir.' };
  try {
    await sock.newsletterUnfollow(jid);
    return { ok: true, msg: 'Deixei de seguir o canal. ✅' };
  } catch (e) {
    return { ok: false, msg: `Não consegui deixar de seguir: ${String(e?.message || e).slice(0, 80)}` };
  }
}

// ═══════════════════════════════════════════════════════════
// v7.10 ETAPA 4 — GESTÃO DO CANAL (renomear, descrever, foto, stats, apagar)
// ═══════════════════════════════════════════════════════════

/** Muda o nome do canal do bot. */
async function renomearCanal(sock, alvo, nome) {
  if (!nome) return { ok: false, msg: 'Diz para que nome. Ex: *muda o nome do meu canal para Dark News*' };
  if (typeof sock.newsletterUpdateName !== 'function') {
    return { ok: false, msg: 'Esta versão do WhatsApp que uso não muda o nome de canais.' };
  }
  const jid = await resolverAlvo(sock, alvo).catch(() => null);
  if (!jid) return { ok: false, msg: 'Não sei qual é o meu canal. Cria um primeiro (*cria um canal chamado X*) ou manda o link.' };
  try {
    await sock.newsletterUpdateName(jid, nome);
    if (nome) { const m = await meuCanal(); if (m) await guardarCanal({ ...m, name: nome }); }
    return { ok: true, msg: `Mudei o nome do canal para *${nome}*. ✅` };
  } catch (e) {
    return { ok: false, msg: `Não consegui mudar o nome: ${String(e?.message || e).slice(0, 80)}` };
  }
}

/** Muda a descrição do canal do bot. */
async function descreverCanal(sock, alvo, desc) {
  if (!desc) return { ok: false, msg: 'Diz qual é a descrição. Ex: *muda a descrição do meu canal para X*' };
  if (typeof sock.newsletterUpdateDescription !== 'function') {
    return { ok: false, msg: 'Esta versão do WhatsApp que uso não muda a descrição de canais.' };
  }
  const jid = await resolverAlvo(sock, alvo).catch(() => null);
  if (!jid) return { ok: false, msg: 'Não sei qual é o meu canal. Cria um primeiro ou manda o link.' };
  try {
    await sock.newsletterUpdateDescription(jid, desc);
    const m = await meuCanal(); if (m) await guardarCanal({ ...m, description: desc });
    return { ok: true, msg: 'Descrição do canal actualizada. ✅' };
  } catch (e) {
    return { ok: false, msg: `Não consegui mudar a descrição: ${String(e?.message || e).slice(0, 80)}` };
  }
}

/** Muda a foto do canal do bot (recebe um Buffer de imagem). */
async function fotoCanal(sock, alvo, buffer) {
  if (!buffer || buffer.length < 500) return { ok: false, msg: 'Manda/enviar uma imagem para eu pôr como foto do canal.' };
  if (typeof sock.newsletterUpdatePicture !== 'function') {
    return { ok: false, msg: 'Esta versão do WhatsApp que uso não muda a foto de canais.' };
  }
  const jid = await resolverAlvo(sock, alvo).catch(() => null);
  if (!jid) return { ok: false, msg: 'Não sei qual é o meu canal. Cria um primeiro ou manda o link.' };
  try {
    await sock.newsletterUpdatePicture(jid, buffer);
    return { ok: true, msg: 'Foto do canal actualizada. ✅' };
  } catch (e) {
    return { ok: false, msg: `Não consegui mudar a foto: ${String(e?.message || e).slice(0, 80)}` };
  }
}

/** Remove a foto do canal do bot. */
async function tirarFotoCanal(sock, alvo) {
  if (typeof sock.newsletterRemovePicture !== 'function') {
    return { ok: false, msg: 'Esta versão do WhatsApp que uso não remove a foto de canais.' };
  }
  const jid = await resolverAlvo(sock, alvo).catch(() => null);
  if (!jid) return { ok: false, msg: 'Não sei qual é o meu canal. Cria um primeiro ou manda o link.' };
  try {
    await sock.newsletterRemovePicture(jid);
    return { ok: true, msg: 'Removi a foto do canal. ✅' };
  } catch (e) {
    return { ok: false, msg: `Não consegui remover a foto: ${String(e?.message || e).slice(0, 80)}` };
  }
}

/** Estatísticas do canal do bot (nome, descrição, seguidores, admins). */
async function estatisticasCanal(sock, alvo) {
  if (typeof sock.newsletterMetadata !== 'function') {
    return { ok: false, msg: 'Esta versão do WhatsApp que uso não lê canais.' };
  }
  const jid = await resolverAlvo(sock, alvo).catch(() => null);
  if (!jid) return { ok: false, msg: 'Não sei qual é o meu canal. Cria um primeiro ou manda o link.' };
  try {
    const meta = await sock.newsletterMetadata('jid', jid);
    const linhas = [`📡 *${meta?.name || 'Canal'}*`];
    if (meta?.description) linhas.push(String(meta.description).slice(0, 200));
    if (typeof meta?.subscribers === 'number') linhas.push(`👥 ${meta.subscribers} seguidores`);
    if (typeof sock.newsletterAdminCount === 'function') {
      const admins = await sock.newsletterAdminCount(jid).catch(() => null);
      if (typeof admins === 'number') linhas.push(`🛡️ ${admins} admins`);
    }
    if (meta?.invite) linhas.push(`🔗 https://whatsapp.com/channel/${meta.invite}`);
    return { ok: true, msg: linhas.join('\n\n') };
  } catch (e) {
    return { ok: false, msg: `Não consegui ler as estatísticas: ${String(e?.message || e).slice(0, 80)}` };
  }
}

/** Apaga o canal do bot. DESTRUTIVO — só o Dono chega aqui. */
async function apagarCanal(sock, alvo) {
  if (typeof sock.newsletterDelete !== 'function') {
    return { ok: false, msg: 'Esta versão do WhatsApp que uso não apaga canais.' };
  }
  const jid = await resolverAlvo(sock, alvo).catch(() => null);
  if (!jid) return { ok: false, msg: 'Não sei qual é o meu canal.' };
  try {
    await sock.newsletterDelete(jid);
    await guardarCanal(null);
    return { ok: true, msg: 'Apaguei o canal. ✅' };
  } catch (e) {
    return { ok: false, msg: `Não consegui apagar: ${String(e?.message || e).slice(0, 80)}` };
  }
}

// ═══════════════════════════════════════════════════════════
// v7.14 — CRIAR CANAL SEM REBENTAR NO PARSER DO FORK
// O newsletterCreate do Baileys faz `thread.picture.id` na resposta e um
// canal recém-criado tem picture=null → "Cannot read properties of null
// (reading 'id')". O canal É criado no WhatsApp, só a leitura é que morre.
// Aqui replica-se a MESMA query w:mex, com parser seguro.
// ═══════════════════════════════════════════════════════════

/** Parseia a resposta do create sem assumir que picture/name existem. */
function parseCriacaoCanal(response) {
  if (!response || typeof response !== 'object') return null;
  const thread = response.thread_metadata || {};
  const viewer = response.viewer_metadata || {};
  const pic = thread.picture || {};
  return {
    id: response.id || '',
    name: (thread.name && thread.name.text) || '',
    description: (thread.description && thread.description.text) || '',
    invite: thread.invite || '',
    subscribers: parseInt(thread.subscribers_count || '0', 10) || 0,
    verification: thread.verification || '',
    pictureId: pic.id || '',
    mute_state: viewer.mute,
  };
}

/**
 * Cria um canal via w:mex com parser seguro.
 * @returns {Promise<object|null>} dados do canal criado, ou null se não
 *   conseguiu sequer correr (sem internals). LANÇA se o servidor responder
 *   erro — assim quem chama nunca cria o canal duas vezes.
 */
async function criarCanalSeguro(sock, nome, desc) {
  if (!sock || typeof sock.query !== 'function') return null;
  let QueryIds, XWAPaths, S_WHATSAPP_NET;
  try {
    const raiz = require('@systemzero/baileys');
    QueryIds = raiz.QueryIds; XWAPaths = raiz.XWAPaths;
    S_WHATSAPP_NET = require('@systemzero/baileys/lib/WABinary/index.js').S_WHATSAPP_NET;
    if (!QueryIds?.CREATE || !XWAPaths?.xwa2_newsletter_create) return null;
  } catch { return null; }

  const tag = typeof sock.generateMessageTag === 'function'
    ? sock.generateMessageTag()
    : 'AQ' + Date.now() + Math.random().toString(36).slice(2);

  const result = await sock.query({
    tag: 'iq',
    attrs: { id: tag, type: 'get', to: S_WHATSAPP_NET, xmlns: 'w:mex' },
    content: [{
      tag: 'query',
      attrs: { query_id: QueryIds.CREATE },
      content: Buffer.from(JSON.stringify({
        variables: { input: { name: nome, description: desc ?? null } },
      }), 'utf-8'),
    }],
  });

  const child = (Array.isArray(result?.content) ? result.content : []).find(n => n?.tag === 'result');
  if (!child?.content) throw new Error('resposta do WhatsApp vazia');
  let data;
  try { data = JSON.parse(child.content.toString()); } catch { throw new Error('resposta ilegível'); }
  if (data?.errors?.length) {
    const e = new Error(data.errors.map(x => x.message || 'erro').join(', '));
    e.graphql = data.errors[0];
    throw e;
  }
  return parseCriacaoCanal(data?.data?.[XWAPaths.xwa2_newsletter_create]);
}

// ═══════════════════════════════════════════════════════════
// v7.13 — CANAL DE STICKERS: assumir, perguntar, ler e enviar
// ═══════════════════════════════════════════════════════════

// Enquetes que EU criei no canal: pollId → { jid, options, secret }.
// O secret é o messageSecret do poll — sem ele não se descodificam votos.
const _polls = new Map();
// Último vencedor de uma enquete (para "manda esses stickers").
const _vencedor = new Map();

/** Assume a gestão de um canal a partir do convite (subscribe + guarda). */
async function adotarCanal(sock, texto) {
  const conv = extrairConvite(texto);
  if (conv?.tipo !== 'canal') {
    return { ok: false, msg: 'Manda o link do canal (whatsapp.com/channel/...) que eu assumo.' };
  }
  if (typeof sock.newsletterMetadata !== 'function' || typeof sock.newsletterFollow !== 'function') {
    return { ok: false, msg: 'Esta versão do WhatsApp que uso não mexe em canais.' };
  }
  try {
    const meta = await sock.newsletterMetadata('invite', conv.code);
    if (!meta?.id) return { ok: false, msg: 'Não encontrei esse canal — o link deve estar partido.' };
    await sock.newsletterFollow(meta.id);
    await guardarCanal({
      jid: meta.id,
      name: meta.name || '',
      description: meta.description || '',
      invite: meta.invite || conv.code,
      criadoEm: Date.now(),
    });
    return {
      ok: true, jid: meta.id, nome: meta.name || 'sem nome',
      msg: `Entrei e assumi a gestão do canal *${meta.name || 'sem nome'}*. 🖤\n\nAgora posso: *posta no canal*, *muda o nome/descrição/foto*, *pergunta aos seguidores* e *manda stickers/packs*.`,
    };
  } catch (e) {
    return { ok: false, msg: `Não consegui entrar: ${String(e?.message || e).slice(0, 80)}` };
  }
}

/** Extrai pergunta + opções de "pergunta aos seguidores X: a, b, c". */
function parsePergunta(texto) {
  let t = String(texto || '').trim();
  let opcoes = [];
  const idx = t.search(/[:?]/);
  if (idx >= 0) {
    const resto = t.slice(idx + 1).trim();
    const cands = resto.split(/\s*(?:,|\bou\b|;)\s*/i)
      .map(x => x.replace(/[?!.]+$/, '').trim())
      .filter(x => x.length > 0 && x.length <= 60);
    if (cands.length >= 2) { opcoes = cands; t = t.slice(0, idx).trim(); }
  }
  let pergunta = t
    .replace(/^(pergunta|perguntar|questiona|questionar|faz|fazer|faz uma|faz um)\b\s*/i, '')
    .replace(/^(?:uma|um)\s+(?:enquete|poll|pergunta)\s*/i, '')
    .replace(/^(?:enquete|poll)\s*/i, '')
    .replace(/^(?:aos|para os|aos meus)\s+(?:seguidores|subscritores|membros do canal|seguidores do canal)\s*/i, '')
    .replace(/^(?:no canal|no meu canal|no canal de stickers)\s*/i, '')
    .trim();
  pergunta = pergunta ? pergunta.charAt(0).toUpperCase() + pergunta.slice(1) : '';
  if (!pergunta || pergunta.length < 6) pergunta = 'Quais stickers querem?';
  return { pergunta, opcoes };
}

/** Publica uma pergunta (enquete ou texto) no canal. */
async function perguntarSeguidores(sock, alvo, texto) {
  const jid = await resolverAlvo(sock, alvo).catch(() => null);
  if (!jid) return { ok: false, msg: 'Não sei qual é o meu canal. Assuma um primeiro (manda o link) ou diz o canal.' };

  const { pergunta, opcoes } = parsePergunta(texto);
  try {
    if (opcoes.length >= 2 && typeof sock.sendMessage === 'function') {
      const secret = randomBytes(32);
      const resp = await sock.sendMessage(jid, {
        poll: { name: pergunta, values: opcoes, selectableCount: 1, messageSecret: secret },
      });
      const pollId = resp?.key?.id || resp?.id || '';
      if (pollId) _polls.set(pollId, { jid, options: opcoes, secret });
      return {
        ok: true,
        msg: `Perguntei no canal: *${pergunta}*\n\n${opcoes.map((o, i) => `${i + 1}. ${o}`).join('\n')}\n\nQuando houver respostas, diz *"vê as respostas do canal"*.`,
      };
    }
    // sem opções → pergunta aberta em texto (seguidores respondem nos comentários)
    const r = await postarCanal(sock, jid, `📢 ${pergunta}\nRespondam nos comentários. 👇`);
    return r.ok
      ? { ok: true, msg: `Perguntei no canal: *${pergunta}*. Quando responderem, diz *"vê as respostas"*.` }
      : { ok: false, msg: r.msg || 'Não consegui publicar a pergunta.' };
  } catch (e) {
    return { ok: false, msg: `Não consegui publicar a pergunta: ${String(e?.message || e).slice(0, 80)}` };
  }
}

function _hashOpt(nome) { return createHash('sha256').update(String(nome)).digest('hex'); }

/** Lê as respostas do canal: votos (descodificados) + comentários. */
async function lerRespostasCanal(sock, alvo) {
  const jid = await resolverAlvo(sock, alvo).catch(() => null);
  if (!jid) return { ok: false, msg: 'Não sei qual é o meu canal.' };

  let cache;
  try { cache = require('../bot/messageListener').messageCache; } catch { cache = new Map(); }
  const hist = require('./auraHistorico');

  // 1. votos nas enquetes que eu criei
  const votos = {};
  let total = 0, ilegiveis = 0;
  for (const [, m] of cache) {
    const pu = m?.message?.pollUpdateMessage;
    if (!pu) continue;
    const key = pu.pollCreationMessageKey;
    if (key?.remoteJid !== jid) continue;
    let info = _polls.get(key.id);
    // v7.13: recupera o secret da mensagem de criação (sobrevive a reinícios)
    if (!info) {
      for (const [, m2] of cache) {
        if (m2.key?.id !== key.id || m2.key?.remoteJid !== jid) continue;
        const pc = m2.message?.pollCreationMessageV3 || m2.message?.pollCreationMessage;
        const secret = m2.messageContextInfo?.messageSecret;
        if (pc?.options?.length && secret) {
          info = { jid, options: pc.options.map(o => o.optionName), secret };
          _polls.set(key.id, info);
        }
        break;
      }
    }
    if (!info) continue;
    const voter = m.key?.participant || m.key?.remoteJid || '';
    let hashes = null;
    try {
      const { decryptPollVote } = require('@systemzero/baileys');
      const vote = decryptPollVote(
        { encPayload: pu.vote?.encPayload, encIv: pu.vote?.encIv },
        { pollCreatorJid: sock?.user?.id || '', pollMsgId: key.id, pollEncKey: info.secret, voterJid: voter }
      );
      hashes = (vote?.selectedOptions || []).map(h => Buffer.from(h).toString('hex'));
    } catch { hashes = null; }
    total++;
    if (hashes && hashes.length) {
      for (const h of hashes) {
        const idx = info.options.findIndex(o => _hashOpt(o) === h);
        const nome = idx >= 0 ? info.options[idx] : 'outra opção';
        votos[nome] = (votos[nome] || 0) + 1;
      }
    } else { ilegiveis++; }
  }

  // 2. comentários em texto no canal
  const textos = [];
  for (const [, m] of cache) {
    if (m?.key?.remoteJid !== jid || m.key.fromMe) continue;
    const txt = hist.textoDaMsg(m);
    if (txt && txt.length >= 2) {
      textos.push({ quem: m.pushName || String(m.key.participant || '').split('@')[0], txt: txt.slice(0, 120) });
    }
  }

  const linhas = [];
  if (total) {
    const ordem = Object.entries(votos).sort((a, b) => b[1] - a[1]);
    linhas.push(`📊 *${total} voto${total > 1 ? 's' : ''}* nas enquetes do canal:`);
    if (ordem.length) {
      linhas.push(ordem.map(([n, c]) => `▸ ${n}: ${c}`).join('\n'));
      _vencedor.set(String(sock?.user?.id || 'bot'), ordem[0][0]);
    }
    if (ilegiveis) linhas.push(`_(${ilegiveis} voto${ilegiveis > 1 ? 's' : ''} não consegui ler — chega depois que eu tento outra vez)_`);
  } else {
    linhas.push('Ainda não há votos nas minhas enquetes.');
  }
  if (textos.length) {
    linhas.push('', `💬 ${textos.length} resposta${textos.length > 1 ? 's' : ''} em texto:`);
    linhas.push(textos.slice(0, 8).map(t => `▸ ${t.quem}: "${t.txt}"`).join('\n'));
  } else if (!total) {
    return { ok: true, msg: 'Ainda ninguém respondeu ao canal. Pergunta primeiro ou espera um pouco.' };
  }
  return { ok: true, msg: linhas.join('\n') };
}

/** Envia N stickers de um tema para o canal (busca real no sticker.ly). */
async function enviarStickersCanal(sock, alvo, termo, quantas = 5) {
  const jid = await resolverAlvo(sock, alvo).catch(() => null);
  if (!jid) return { ok: false, msg: 'Não sei qual é o meu canal.' };
  let q = (termo || '').trim();
  // "manda esses stickers" → o vencedor da última enquete
  if (/^(esses|estes|desses|deles|aqueles|os mesmos|o vencedor)$/i.test(q)) {
    q = _vencedor.get(String(sock?.user?.id || 'bot')) || '';
  }
  if (!q || q.length < 2) return { ok: false, msg: 'Diz o tema dos stickers. Ex: *manda 5 stickers de gatos no canal*' };
  try {
    const sly = require('../bot/stickerly');
    const r = await sly.searchAndDownload(q, Math.min(Number(quantas) || 5, 15));
    if (!r.stickers.length) return { ok: false, msg: `Não encontrei stickers de "${q}".` };
    let enviados = 0;
    for (const st of r.stickers.slice(0, Math.min(Number(quantas) || 5, 15))) {
      try {
        await sock.sendMessage(jid, { sticker: st.buf });
        enviados++;
        await new Promise(res => setTimeout(res, 400));
      } catch { /* um a um; se falhar, continua */ }
    }
    if (!enviados) return { ok: false, msg: `Encontrei stickers de "${q}" mas não consegui enviar.` };
    return { ok: true, msg: `Enviei ${enviados} sticker${enviados > 1 ? 's' : ''} de *${q}* para o canal. 🖤` };
  } catch (e) {
    return { ok: false, msg: `Não consegui buscar stickers: ${String(e?.message || e).slice(0, 80)}` };
  }
}

/** Envia um pack inteiro de stickers de um tema para o canal. */
async function enviarPackCanal(sock, alvo, termo) {
  const jid = await resolverAlvo(sock, alvo).catch(() => null);
  if (!jid) return { ok: false, msg: 'Não sei qual é o meu canal.' };
  let q = (termo || '').trim();
  if (/^(esses|estes|desses|deles|aqueles|o vencedor)$/i.test(q)) {
    q = _vencedor.get(String(sock?.user?.id || 'bot')) || '';
  }
  if (!q || q.length < 2) return { ok: false, msg: 'Diz o tema do pack. Ex: *manda um pack de gatos no canal*' };
  try {
    const sly = require('../bot/stickerly');
    const r = await sly.searchAndDownload(q, 30);
    if (!r.stickers.length) return { ok: false, msg: `Não encontrei stickers de "${q}".` };
    const bufs = r.stickers.map(s => s.buf).filter(Boolean);
    const okc = await require('../bot/stickerPack').sendNativeStickerPack(sock, jid, bufs, {
      name: r.title || q, publisher: 'DARK NET 🕸️', description: `Pack de ${q}`,
    });
    return okc
      ? { ok: true, msg: `Mandei o pack *${r.title || q}* para o canal. 🖤` }
      : { ok: false, msg: 'Não consegui mandar o pack — diz *"manda N stickers"* que envio um a um.' };
  } catch (e) {
    return { ok: false, msg: `Não consegui montar o pack: ${String(e?.message || e).slice(0, 80)}` };
  }
}

/**
 * v7.15 — "aceita o link/convite do canal". Segue o link que está na
 * própria mensagem; se não houver, procura o ÚLTIMO link de canal que
 * recebeste neste chat (o convite que mandaram) e segue-o. Se não houver
 * nenhum, pede o link com honestidade — nunca finge que entrou.
 */
async function aceitarConviteCanal(sock, texto, ctx) {
  const conv = extrairConvite(texto);
  if (conv?.tipo === 'canal') return entrarPorLink(sock, texto);

  // varrer o cache: último link de canal neste chat
  try {
    const cache = require('../bot/messageListener').messageCache;
    const hist = require('./auraHistorico');
    let melhor = null;
    for (const [, m] of cache) {
      if (m.key?.remoteJid !== ctx?.remoteJid) continue;
      const c = extrairConvite(hist.textoDaMsg(m));
      if (c?.tipo === 'canal') {
        const ts = Number(m.messageTimestamp) || 0;
        if (!melhor || ts > melhor.ts) melhor = { txt: hist.textoDaMsg(m), ts };
      }
    }
    if (melhor) {
      const r = await entrarPorLink(sock, melhor.txt);
      if (r.ok) return r;
    }
  } catch { /* sem cache, segue para o pedido honesto */ }

  return { ok: false, msg: 'Manda o link do canal (whatsapp.com/channel/…) que eu entro já.' };
}

module.exports = {
  extrairConvite, entrarPorLink, reagirTudoCanal, postarCanal,
  reencaminhar, meusGrupos, resolverCanal, resolverAlvo, infoCanal, deixarCanal,
  guardarCanal, meuCanal, normJid,
  renomearCanal, descreverCanal, fotoCanal, tirarFotoCanal,
  estatisticasCanal, apagarCanal,
  adotarCanal, parsePergunta, perguntarSeguidores, lerRespostasCanal,
  enviarStickersCanal, enviarPackCanal,
  criarCanalSeguro, parseCriacaoCanal, aceitarConviteCanal,
  RE_GRUPO, RE_CANAL,
};
