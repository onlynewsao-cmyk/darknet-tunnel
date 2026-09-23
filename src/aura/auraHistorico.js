'use strict';
/**
 * AURA HISTÓRICO — v12.3 (Empowerment + WhatsApp humano)
 * ═══════════════════════════════════════════════════════════
 * A Aura passa a VER as mensagens do grupo E do PV de verdade:
 *
 *   1. "quem escreveu isso?"  → lê a mensagem citada (contextInfo) e diz
 *      QUEM a escreveu, com o texto — sem adivinhar.
 *   2. "quem escreveu X?"     → varre o messageCache (últimas ~2000 msgs)
 *      e devolve o autor com a mensagem exacta.
 *   3. "o que é que o João escreveu?" → resolve o nome → jid e lista as
 *      últimas mensagens dessa pessoa no grupo.
 *   4. "fala só com o João" / "fala com todos" → menciona apenas a pessoa
 *      ou o grupo inteiro (mention @), com o recado que o Dark pedir.
 *   5. v12.3: "ver conversa com X", "o que conversei com X", "mensagens antigas"
 *      → mostra histórico REAL como pessoa que rola o chat pra cima.
 *   6. v12.3: "manda mensagem pro X no pv" → envia mensagem PRIVADA de verdade
 *      via sock.sendMessage, com decisão e certeza.
 *
 * Tudo sai do `messageCache` do messageListener — memória real do que
 * chegou, nunca invenção. Se não há prova, a Aura diz que não viu.
 * Com empoderamento: ela decide, tem certeza, age como pessoa real no WhatsApp.
 */

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Texto visível de uma mensagem (texto, legenda de mídia, etc.). */
function textoDaMsg(msg) {
  const m = msg?.message;
  if (!m) return '';
  return m.conversation || m.extendedTextMessage?.text ||
    m.imageMessage?.caption || m.videoMessage?.caption ||
    m.documentMessage?.caption || m.editedMessage?.message?.conversation ||
    m.editedMessage?.message?.extendedTextMessage?.text || '';
}

/** As mensagens deste grupo (não do bot), mais recentes primeiro. */
function mensagensDoGrupo(grupoJid, limite = 300) {
  let cache;
  try { cache = require('../bot/messageListener').messageCache; }
  catch { return []; }
  const lista = [];
  let i = 0;
  for (const [, msg] of cache) {
    if (msg?.key?.remoteJid !== grupoJid) continue;
    if (msg.key.fromMe) continue;
    const txt = textoDaMsg(msg);
    if (!txt || txt.length < 2) continue;
    const ts = Number(msg.messageTimestamp) || 0;
    lista.push({
      id: msg.key.id,
      jid: msg.key.participant || grupoJid,
      nome: msg.pushName || '',
      texto: txt,
      ts,
      ordem: i,
    });
    i++;
  }
  lista.sort((a, b) => (b.ts - a.ts) || (b.ordem - a.ordem));
  return lista.slice(0, limite);
}

/** v12.3: mensagens de uma pessoa específica (PV ou grupo) — como ver conversa real */
function mensagensDePessoa(pessoaJid, limite = 100) {
  let cache;
  try { cache = require('../bot/messageListener').messageCache; }
  catch { return []; }
  const lista = [];
  let i = 0;
  for (const [, msg] of cache) {
    const rJid = msg?.key?.remoteJid || '';
    const part = msg?.key?.participant || '';
    // PV: remoteJid == pessoaJid, ou grupo onde participant == pessoaJid
    const isFromPerson = rJid === pessoaJid || part === pessoaJid || rJid.includes(pessoaJid.split('@')[0]);
    if (!isFromPerson) continue;
    if (msg.key.fromMe) continue;
    const txt = textoDaMsg(msg);
    if (!txt || txt.length < 2) continue;
    const ts = Number(msg.messageTimestamp) || 0;
    lista.push({
      id: msg.key.id,
      jid: pessoaJid,
      remoteJid: rJid,
      nome: msg.pushName || '',
      texto: txt,
      ts,
      ordem: i,
    });
    i++;
  }
  lista.sort((a, b) => (b.ts - a.ts) || (b.ordem - a.ordem));
  return lista.slice(0, limite);
}

/** v12.3: ver conversa com alguém — histórico humano */
async function verConversa(sock, ctx, texto) {
  const t = norm(texto);
  // extrai nome: "ver conversa com João", "o que conversei com Maria", "histórico com João", "mensagens antigas do João"
  let nome = '';
  let m = t.match(/(?:ver|mostra|mostrar|ve|verifica|puxa|recupera)\s+(?:a\s+)?conversa\s+(?:com|do|da|de)\s+@?([a-z0-9_\-\s]{2,40})/);
  if (m) nome = m[1];
  else {
    m = t.match(/(?:o que|oq)\s+(?:eu\s+)?conversei\s+(?:com|do|da|de)\s+@?([a-z0-9_\-\s]{2,40})/);
    if (m) nome = m[1];
    else {
      m = t.match(/(?:mensagens?\s+antigas?|historico|histórico)\s+(?:com|do|da|de|d[oa])\s+@?([a-z0-9_\-\s]{2,40})/);
      if (m) nome = m[1];
      else {
        m = t.match(/(?:conversa|chat|pv)\s+(?:com|do|da|de)\s+@?([a-z0-9_\-\s]{2,40})/);
        if (m) nome = m[1];
      }
    }
  }
  nome = (nome || '').trim().split(' ').slice(0,3).join(' ').trim();
  if (!nome || nome.length < 2) {
    const mm = t.match(/@?([\d]{5,})/);
    if (mm) nome = mm[1];
  }
  if (!nome) return { ok: false, msg: null };

  const pessoa = await resolverPessoa(sock, ctx, nome);
  if (!pessoa) {
    // tenta buscar por número direto se não achou no grupo — pode ser PV
    if (/^[\d]{5,}$/.test(nome.replace(/\D/g,''))) {
      const num = nome.replace(/\D/g,'');
      const jid = `${num}@s.whatsapp.net`;
      const msgs = mensagensDePessoa(jid, 30);
      if (!msgs.length) {
        return { ok: true, msg: `Procurei conversa com ${nome} nas últimas mensagens e não achei nada. Pode ser que não conversaram recentemente ou o número não está no grupo.` };
      }
      let quando = () => '';
      try { quando = require('./auraUniversal').quandoFoi; } catch {}
      const linhas = msgs.slice(0,10).map(x => `▸ ${x.ts ? '(' + quando(x.ts) + ') ' : ''}[${x.remoteJid.includes('@g.us') ? 'grupo' : 'pv'}] "${x.texto.slice(0, 120)}"`);
      return { ok: true, msg: `Conversa com *${num}* (últimas ${msgs.length} msgs que achei):\n\n${linhas.join('\n')}` };
    }
    return { ok: true, msg: `Não encontrei "${nome}" — me fala o nome certo ou marca com @, Dark. Vou ver com certeza 🖤` };
  }

  const msgs = mensagensDoGrupo(ctx.remoteJid, 500).filter(x => x.jid === pessoa.jid);
  const msgsPv = mensagensDePessoa(pessoa.jid, 100);
  const todas = [...msgs, ...msgsPv].sort((a,b) => (b.ts - a.ts) || (b.ordem - a.ordem)).slice(0,20);

  if (!todas.length) {
    return { ok: true, msg: `*${pessoa.nome}* não escreveu nada nas últimas mensagens que vi aqui, Dark. Varri o cache e nada — deve fazer tempo que não fala.` };
  }
  let quando = () => '';
  try { quando = require('./auraUniversal').quandoFoi; } catch {}
  const linhas = todas.slice(0,10).map(x => `▸ ${x.ts ? quando(x.ts) + ' — ' : ''}"${x.texto.slice(0, 130)}"`);
  return {
    ok: true,
    msg: `Conversa com *${pessoa.nome}* — últimas ${todas.length} mensagens que achei (como pessoa real rolando o chat):\n\n${linhas.join('\n')}`,
    mencionar: [pessoa.jid],
  };
}

/** Jid da mensagem citada (quem a escreveu), se existir. */
function citado(msg) {
  const ci = msg?.message?.extendedTextMessage?.contextInfo ||
             msg?.message?.imageMessage?.contextInfo ||
             msg?.message?.videoMessage?.contextInfo ||
             msg?.message?.stickerMessage?.contextInfo || // v7.83: paridade com isReplyToBot
             msg?.message?.audioMessage?.contextInfo ||
             msg?.message?.buttonsResponseMessage?.contextInfo ||
             msg?.message?.interactiveResponseMessage?.contextInfo;
  if (!ci) return null;
  const quoted = ci.quotedMessage;
  const txt = textoDaMsg({ message: quoted }) || '';
  return {
    jid: ci.participant || ci.remoteJid || null,
    texto: txt,
  };
}

/** Lista de participantes do grupo (com fallback ao groupMetadata). */
async function participantes(sock, ctx) {
  if (Array.isArray(ctx?.groupMeta?.participants) && ctx.groupMeta.participants.length) {
    return ctx.groupMeta.participants;
  }
  try {
    const m = await sock.groupMetadata(ctx.remoteJid);
    return m?.participants || [];
  } catch { return []; }
}

/** Nome de exibição de um jid (pushName do cache → número). */
function nomeDoJid(jid, grupoJid) {
  const msgs = mensagensDoGrupo(grupoJid, 500);
  for (const m of msgs) if (m.jid === jid && m.nome) return m.nome;
  return String(jid || '').split('@')[0];
}

/** Resolve um nome (ou número) → { jid, nome } dentro do grupo. */
async function resolverPessoa(sock, ctx, nome) {
  const n = norm(nome).replace(/^@/, '');
  if (!n || n.length < 2) return null;
  const parts = await participantes(sock, ctx);

  const grupoJid = ctx?.remoteJid;
  // 1. menção directa (@número) ou jid
  if (/^[\d]{5,}$/.test(n)) {
    const achado = parts.find(p => p.id.split('@')[0] === n);
    if (achado) return { jid: achado.id, nome: nomeDoJid(achado.id, grupoJid) };
    const jid = `${n}@s.whatsapp.net`;
    return { jid, nome: nomeDoJid(jid, grupoJid) };
  }

  const words = n.split(' ').filter(w => w.length >= 3);
  const alvo = words.length ? words : [n];

  // 2. por número (substring de todas as palavras)
  for (const p of parts) {
    const num = p.id.split('@')[0];
    if (alvo.every(w => num.includes(w))) return { jid: p.id, nome: nomeDoJid(p.id, grupoJid) };
  }

  // 3. por nome de exibição (pushName das últimas mensagens)
  const porNome = new Map();
  for (const m of mensagensDoGrupo(ctx.remoteJid, 500)) {
    if (m.nome && !porNome.has(m.jid)) porNome.set(m.jid, m.nome);
  }
  for (const [jid, push] of porNome) {
    if (alvo.every(w => norm(push).includes(w))) return { jid, nome: push };
  }

  // 4. parcial: uma palavra que bata
  for (const [jid, push] of porNome) {
    if (alvo.some(w => norm(push).includes(w))) return { jid, nome: push };
  }
  return null;
}

/** "quem escreveu X?" → autores certos. */
async function quemEscreveu(sock, ctx, texto, msg) {
  const t = norm(texto);
  const cit = citado(msg);

  // 1. mensagem citada → resposta 100% certa
  if (cit?.jid) {
    const nome = nomeDoJid(cit.jid, ctx.remoteJid);
    const prova = cit.texto ? `\n\n"${cit.texto.slice(0, 140)}"` : '';
    return {
      ok: true,
      msg: `Foi @${String(cit.jid).split('@')[0]} (*${nome}*).${prova}`,
      mencionar: [cit.jid],
    };
  }

  // 2. termo a procurar depois do verbo
  const m = t.match(/quem\s+(?:foi\s+que\s+)?(?:escreveu|mandou|enviou|digitou|disse)\s+(.+)$/);
  let q = m ? m[1].replace(/[?!.]+$/, '').trim() : '';
  // "isso/essa/esta/aquilo" sozinhos não identificam nada
  if (/^(isso|essa|essa mensagem|esta|este|aquilo|isto|essa msg|a mensagem)$/.test(q)) q = '';
  if (!q || q.length < 3) {
    // não há como saber — deixa a conversa normal responder
    return { ok: false, msg: null };
  }

  const msgs = mensagensDoGrupo(ctx.remoteJid, 300);
  const achadas = msgs.filter(x => norm(x.texto).includes(norm(q))).slice(0, 3);
  if (!achadas.length) {
    return {
      ok: true,
      msg: `Varri as últimas ${msgs.length} mensagens deste grupo e *ninguém* escreveu algo com "${q}".`,
    };
  }
  // v7.40: cada achado diz QUANDO foi ("hoje às 14:03", "há 3 dias")
  let quando = () => '';
  try { quando = require('./auraUniversal').quandoFoi; } catch {}
  const linhas = achadas.map(x =>
    `▸ @${String(x.jid).split('@')[0]} (*${x.nome || x.jid.split('@')[0]}*)${x.ts ? ' — ' + quando(x.ts) : ''}: "${x.texto.slice(0, 120)}"`);
  return {
    ok: true,
    msg: `Quem escreveu "${q}":\n\n${linhas.join('\n')}`,
    mencionar: achadas.map(x => x.jid),
  };
}

/** "o que é que o João escreveu?" → últimas mensagens dele. */
async function oQueEscreveu(sock, ctx, texto, msg) {
  const t = norm(texto);
  let nome = '';
  let m = t.match(/(?:o que|mostra o que|que)\s+(?:e\s+que\s+)?(?:o|a|ao|a)\s+@?([a-z0-9_\-]{2,30})\s+(?:escreveu|disse|mandou|falou|enviou|digitou)/);
  if (m) nome = m[1];
  else {
    m = t.match(/(?:o que|mostra o que)\s+(?:e\s+que\s+)?(?:escreveu|disse|mandou|falou)\s+(?:o|a)\s+@?([a-z0-9_\-]{2,30})/);
    if (m) nome = m[1];
    else {
      // v12.3: ver conversa com X, o que conversei com X, mensagens antigas do X
      m = t.match(/(?:ver|mostra|mostrar|o que|conversa|conversei|historico|mensagens?\s+antigas?)\s+(?:com|do|da|de)?\s*@?([a-z0-9_\-]{2,30})/);
      if (m) {
        const cand = m[1];
        // evita pegar palavras genéricas
        if (!/^(com|que|conversa|mensagens|antigas|historico|conversei|eu|voce|vc)$/.test(cand)) nome = cand;
      }
    }
  }
  if (!nome) {
    // menção directa: "o que escreveu @numero" / "o que o @numero mandou" / "conversa com @numero"
    const mm = t.match(/@?([\d]{5,})/);
    if (mm) nome = mm[1];
  }
  if (!nome) return { ok: false, msg: null };

  const pessoa = await resolverPessoa(sock, ctx, nome);
  if (!pessoa) {
    return { ok: true, msg: `Não encontrei "${nome}" neste grupo. Menciona com @ ou escreve o nome/número certo.` };
  }

  const msgs = mensagensDoGrupo(ctx.remoteJid, 500).filter(x => x.jid === pessoa.jid).slice(0, 5);
  if (!msgs.length) {
    return { ok: true, msg: `*${pessoa.nome}* não escreveu nada nas últimas mensagens deste grupo.` };
  }
  let quando = () => '';
  try { quando = require('./auraUniversal').quandoFoi; } catch {}
  const linhas = msgs.map(x => `▸ ${x.ts ? '(' + quando(x.ts) + ') ' : ''}"${x.texto.slice(0, 120)}"`);
  return {
    ok: true,
    msg: `As últimas mensagens de *${pessoa.nome}* aqui:\n\n${linhas.join('\n')}`,
    mencionar: [pessoa.jid],
  };
}

/** Extrai { nome, conteudo } de "fala só com o João que ..." */
function parseFalarCom(texto) {
  let t = String(texto || '').trim();
  t = t.replace(/^(fala|responde|diz|manda|escreve|mande|fala so|fala somente|fala apenas)\b/i, '').trim();
  t = t.replace(/^(so|somente|apenas|mensagem|msg)\s+/i, '').trim();
  t = t.replace(/^(com|para|pra|pro|ao|a|pro|pra)\s+(o|a|ao|a|@)?\s*/i, '').trim();
  // divide no "que" / "dizendo" / ":"
  const sep = t.match(/\s+(?:que|dizendo|e diz|:)\s+/i);
  let nome = t, conteudo = '';
  if (sep) {
    nome = t.slice(0, sep.index).trim();
    conteudo = t.slice(sep.index + sep[0].length).trim();
  }
  return { nome, conteudo };
}

/** "fala só com X" → resposta a mencionar apenas essa pessoa. */
async function falarCom(sock, ctx, texto, msg) {
  const ci = msg?.message?.extendedTextMessage?.contextInfo ||
             msg?.message?.imageMessage?.contextInfo ||
             msg?.message?.videoMessage?.contextInfo;
  const mencionado = ci?.mentionedJid?.[0];

  const { nome, conteudo } = parseFalarCom(texto);

  let jid = mencionado;
  let nomeMostra = '';
  if (jid) {
    nomeMostra = nomeDoJid(jid, ctx.remoteJid);
  } else if (nome) {
    const p = await resolverPessoa(sock, ctx, nome);
    if (p) { jid = p.jid; nomeMostra = p.nome; }
    else if (/^[\d]{5,}$/.test(nome.replace(/\D/g,''))) {
      const num = nome.replace(/\D/g,'');
      jid = `${num}@s.whatsapp.net`;
      nomeMostra = num;
    }
  }
  if (!jid) {
    return { ok: true, msg: `Não encontrei quem querias, Dark. Diz o nome certo ou marca com @ — vou mandar com certeza 🖤` };
  }

  const num = String(jid).split('@')[0];
  const recado = conteudo || `👋 o chefe quer falar contigo.`;
  const isPv = /\b(no\s+pv|pv|privado|no\s+privado|direct|mensagem\s+privada)\b/i.test(texto || '');

  // v12.3: se pedir no PV, envia de verdade no privado com decisão
  if (isPv) {
    try {
      await sock.sendMessage(jid, { text: recado });
      return {
        ok: true,
        msg: `Feito Dark 🖤 mandei no PV de *${nomeMostra || num}* com certeza: "${recado.slice(0,120)}"`,
        mencionar: [],
        _sentPrivately: true,
        _targetJid: jid,
      };
    } catch (e) {
      return {
        ok: true,
        msg: `Tentei mandar no PV de *${nomeMostra || num}* mas deu erro: ${e.message}. Vou mencionar aqui então: @${num} ${recado}`,
        mencionar: [jid],
      };
    }
  }

  return {
    ok: true,
    msg: `@${num} ${recado}`,
    mencionar: [jid],
  };
}

/** "fala com todos" → menciona o grupo inteiro (menos o bot). */
async function falarComTodos(sock, ctx, texto, msg) {
  const parts = await participantes(sock, ctx);
  const botNum = String(sock?.user?.id || '').split(':')[0].split('@')[0];
  const botLid = String(sock?.user?.lid || '').split(':')[0].split('@')[0];

  // v6.85 — HIDETAG A SÉRIO: o WhatsApp tem o grupo com jid + LID do
  // mesmo participante; antes saía "@Dark @Dark" e até "@AurΔ" (o bot
  // em LID). Deduplica por número e exclui o bot nas duas formas.
  const vistos = new Set();
  const alvos = [];
  for (const p of parts) {
    const jid = p.id;
    const num = String(jid).split('@')[0].replace(/\D/g, '');
    if (!num || vistos.has(num)) continue;
    vistos.add(num);
    if (num === botNum || (botLid && num === botLid)) continue; // o bot não se menciona
    alvos.push(jid);
  }
  if (!alvos.length) return { ok: true, msg: 'Não encontrei ninguém para mencionar.' };

  // o recado vem depois de "que" / "dizendo" / ":"
  let conteudo = '';
  const m = String(texto || '').match(/\b(?:que|dizendo|e diz)\s+(.+)$/i) ||
            String(texto || '').match(/:\s*(.+)$/);
  if (m) conteudo = m[1].trim();

  // v6.85 — "as escondidas" / hidetag: o texto NÃO leva a lista de @
  // (isso era o que aparecia como lista visível no print do Dark).
  // Os mentions no array chegam a todos sem escrever os nomes.
  const escondidas = /escondid|hidetag|sem marcar|n[ãa]o marca|ocult|invisivel/i.test(texto || '');

  const txt = escondidas
    ? (conteudo || '📢')
    : (conteudo || '📢 Atenção, pessoal!') +
      '\n\n' + alvos.map(j => '@' + String(j).split('@')[0]).join(' ');
  return { ok: true, msg: txt, mencionar: alvos };
}

module.exports = {
  norm, textoDaMsg, mensagensDoGrupo, mensagensDePessoa, verConversa, citado, nomeDoJid,
  participantes, resolverPessoa,
  quemEscreveu, oQueEscreveu, falarCom, falarComTodos,
  parseFalarCom,
};
