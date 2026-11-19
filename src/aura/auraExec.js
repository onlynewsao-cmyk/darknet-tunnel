'use strict';
/**
 * AURA EXEC — v6.81
 * ═══════════════════════════════════════════════════════════
 * Executa as capacidades do auraBrain. Cada `case` liga a uma
 * função REAL que já existia em megaActions/advancedActions —
 * ~130 funções que estavam escritas e que ninguém chamava.
 *
 * Contrato de retorno: { ok, msg, silencioso? }
 *   - msg: o que dizer ao Dark (curto, humano, sem jargão)
 *   - silencioso: true = não responde nada (ex.: ficou muda)
 */

const brain = require('./auraBrain');
const mega = require('./actions/megaActions');

const READ_ONLY_CAPABILITIES = new Set([
  'quem_escreveu', 'o_que_escreveu', 'ver_conversa', 'canal_info', 'canal_stats',
  'canal_engajamento', 'canal_respostas', 'resumo_grupos', 'ver_status',
  'listar_membros', 'listar_admins', 'info_grupo', 'recordar',
]);
const READ_QUERY_NEGATION_OR_HYPOTHESIS = /\b(?:nao|nunca|jamais|por exemplo|foi so exemplo|como exemplo|imagina(?:ndo)?|supondo|suponhamos|hipotetic(?:o|a|amente)?|se eu disser|e se|caso eu|caso|se|brincadeira|estou a brincar|era brincadeira|what if|suppose|hypothetically)\b/i;

function isExplicitReadQuery(texto, cap) {
  return !!cap?.gatilhos?.length && !READ_QUERY_NEGATION_OR_HYPOTHESIS.test(texto) &&
    brain.hasCapabilityTriggerAtStart(cap, texto);
}
const NEGATED_COMMANDS = {
  modo_nao_reagir: /^nao\s+rea(?:ge|ges|gir|ja|jas)\b/i,
  modo_so_dono: /^nao\s+responde\b/i,
  modo_mudo: /^nao\s+fales?\b/i,
  lembrar: /^nao\s+te\s+esquecas\b/i,
};
const QUOTED_ARGUMENT_PREFIX = {
  falar_com: /^(?:fala|falar|diz|diga|manda|mandar|envia|enviar|escreve|responde)\b/i,
  falar_com_todos: /^(?:diz|diga|avisa|anuncia|manda|chama|menciona|marca|fala)\b/i,
  marcar_pessoa: /^(?:marca|mark|aponta|menciona)\b/i,
  criar_enquete: /^(?:cria|criar|faz|fazer|manda|mandar)\b/i,
  postar_status: /^(?:posta|postar|publica|publicar)\b/i,
  canal_postar: /^(?:posta|postar|publica|publicar|manda|mandar|envia|enviar)\b/i,
  canal_renomear: /^(?:muda|mudar|altera|alterar|renomeia|renomear)\b/i,
  canal_descrever: /^(?:muda|mudar|altera|alterar|descreve|descrever)\b/i,
  canal_perguntar: /^(?:pergunta|perguntar|faz|fazer|posta|manda)\b/i,
  canal_quiz: /^(?:cria|criar|faz|fazer|manda|publica)\b/i,
  canal_enquete_multipla: /^(?:cria|criar|faz|fazer|manda)\b/i,
  canal_sorteio: /^(?:faz|fazer|cria|criar|sorteia|sortear)\b/i,
  canal_stickers: /^(?:manda|mandar|envia|enviar|faz|cria|publica|posta)\b/i,
  canal_pack: /^(?:manda|mandar|envia|enviar|faz|cria|publica|posta)\b/i,
  canal_agendar: /^(?:agenda|agendar|programa|posta|publica|manda|envia)\b/i,
  agendar_conteudo: /^(?:agenda|agendar|programa|posta|publica|manda|envia)\b/i,
  lembrar: /^(?:lembra|memoriza|guarda|anota)\b/i,
  esquecer: /^(?:esquece|apaga)\b/i,
  canal_seguir: /^(?:segue|seguir)\b/i,
  canal_deixar: /^(?:deixa|deixar|para|parar)\b/i,
  entrar_link: /^(?:entra|entrar|junta|juntar)\b/i,
  aceitar_convite_canal: /^(?:aceita|aceitar|entra|entrar)\b/i,
  adotar_canal: /^(?:adota|adotar)\b/i,
  reagir_msg: /^(?:reage|reaja|reagir)\b/i,
  canal_reagir: /^(?:reage|reaja|reagir)\b/i,
  foto_aura: /^(?:manda|mostra|quero|envia)\b/i,
};
const EXPLICIT_COMMAND_START = /^(?:faz|fazer|cria|criar|manda|mandar|envia|enviar|poe|poem|por|coloca|mete|muda|mudar|troca|trocar|altera|alterar|define|definir|configura|configurar|liga|ligar|desliga|desligar|ativa|activa|ativar|activar|abre|abrir|fecha|fechar|tranca|trancar|destranca|destrancar|apaga|apagar|remove|remover|elimina|eliminar|tira|tirar|limpa|limpar|bane|banir|expulsa|expulsar|kicka|kickar|promove|promover|rebaixa|rebaixar|adiciona|adicionar|marca|marcar|menciona|mencionar|reage|reagir|reaja|responde|responder|ignora|ignorar|bloqueia|bloquear|silencia|silenciar|cala|calar|sai|sair|entra|entrar|junta|juntar|posta|postar|publica|publicar|partilha|partilhar|segue|seguir|xinga|xingar|zoa|zoar|humilha|insulta|provoca|agenda|agendar|programa|lembra|lembrar|esquece|esquecer|guarda|memoriza|procura|procurar|pesquisa|pesquisar|busca|baixa|baixar|descarrega|traduz|traduzir|resume|resumir|gera|gerar|desenha|desenhar|fixa|fixar|arquiva|arquivar|verifica|mostra|mostrar|fala|falar|diz|diga|avisa|anuncia|chama|pega|pegar|revoga|revogar|lista|listar|consulta|consultar|aceita|aceitar|adota|adotar|sorteia|sortear)\b/i;

function isClearExecutionIntent(id, texto, cap, contextoTexto = texto) {
  const policy = require('./auraGrupo');
  const t = policy.normalizarTextoComando(texto);
  const full = policy.normalizarTextoComando(contextoTexto);
  if (!t || t.length > 280 || !full || full.length > 300) return false;
  // Acções compostas são validadas no contexto integral e, depois, cada
  // segmento é validado pelo seu próprio verbo/capacidade.
  if (full !== t && !policy.isClearActionText(full)) return false;
  if (READ_ONLY_CAPABILITIES.has(id)) return isExplicitReadQuery(t, cap);

  // Admin actions have a stricter, target-aware parser later in this executor.
  if (id === 'promover_admin' || id === 'rebaixar_admin') {
    return policy.isClearActionText(t) && !/["'“”‘’`]/.test(t);
  }

  let clear = policy.isSelfContainedCommandText(t);
  if (!clear) {
    const negatedCommand = NEGATED_COMMANDS[id];
    clear = !!(negatedCommand?.test(t) && policy.isSelfContainedCommandText(t.replace(/^nao\s+/i, '')));
  }
  if (!clear) return false;

  if (/["'“”‘’`]/.test(t) && !QUOTED_ARGUMENT_PREFIX[id]?.test(t)) return false;

  const variants = [t, t.replace(/^(?:agora|entao)\s+/i, '')];
  if (cap?.gatilhos?.length) {
    for (const candidate of variants) {
      if (brain.hasCapabilityTriggerAtStart(cap, candidate)) return true;
    }
    // If the selected capability's own triggers do not begin the request,
    // the action word is context, not permission to execute.
    return false;
  }
  return EXPLICIT_COMMAND_START.test(variants[1] || t);
}

// ── Ajudas ──────────────────────────────────────────────────

/** O número de quem foi mencionado, ou de quem se respondeu. */
function alvoDaMensagem(msg, ctx) {
  const ctxInfo = msg?.message?.extendedTextMessage?.contextInfo;
  const mencionado = ctxInfo?.mentionedJid?.[0];
  if (mencionado) return mencionado;
  const citado = ctxInfo?.participant;
  if (citado) return citado;
  return null;
}

/** Descarrega a imagem da mensagem (ou da que foi citada). */
async function imagemDaMensagem(msg, sock) {
  try {
    const raw = msg?.message;
    const ctxInfo = raw?.extendedTextMessage?.contextInfo;
    const quoted = ctxInfo?.quotedMessage;

    const unwrap = (m) => m?.viewOnceMessage?.message || m?.viewOnceMessageV2?.message || m?.viewOnceMessageV2Extension?.message || m;
    const mDireta = unwrap(raw);
    const mCitada = unwrap(quoted);

    const imgDireta = mDireta?.imageMessage || mDireta?.stickerMessage;
    const imgCitada = mCitada?.imageMessage || mCitada?.stickerMessage;
    if (!imgDireta && !imgCitada) return null;

    const alvo = imgDireta
      ? msg
      : { key: { remoteJid: msg.key?.remoteJid, id: ctxInfo?.stanzaId, participant: ctxInfo?.participant }, message: mCitada };

    const { downloadMediaMessage } = require('baileys-v6');
    const buf = await downloadMediaMessage(alvo, 'buffer', {}, {
      reuploadRequest: sock?.updateMediaMessage,
    }).catch(() => null);
    return buf && buf.length > 500 ? buf : null;
  } catch {
    return null;
  }
}

/** Emoji explícito na frase; sem um, escolhe por contexto e humor. */
function emojiDaFrase(texto, opcoes = {}) {
  const m = String(texto || '').match(/\p{Extended_Pictographic}[\uFE0F\u200D]*/gu);
  if (m && m.length) return m[m.length - 1];
  try { return require('./auraDecide').escolherReacao(texto, opcoes); }
  catch { return '👀'; }
}

// ── Executor ────────────────────────────────────────────────

async function executar(id, arg, { sock, msg, ctx, texto, contextoTexto, isOwner, isAdmin, confirmado = false }) {
  const cap = brain.POR_ID.get(id);
  if (!confirmado) {
    const grupo = require('./auraGrupo');
    if (ctx?.isGroup && !grupo.isDirectedToAura({
      isGroup: true,
      isBotMentioned: ctx.isBotMentioned,
      isReplyToAura: ctx.isReplyToAura,
      dest: ctx.dest,
    })) return { ok: false, msg: null };
    if (!isClearExecutionIntent(id, texto, cap, contextoTexto ?? texto)) return { ok: false, msg: null };
  }
  if (cap?.risco === 'destrutivo' && !confirmado) {
    return {
      ok: false,
      confirmacaoNecessaria: true,
      msg: 'Esta acção é destrutiva e precisa de confirmação explícita antes de ser executada.',
    };
  }
  const jid = ctx.remoteJid;
  const M = brain.modos(jid);

  switch (id) {
    // ══ v7.43 CHAMADA DE VOZ ══════════════════════════════
    case 'call_tocar': {
      const voip = require('../bot/callVoip');
      if (!voip.activa(jid)) return { ok: false, msg: 'Não estamos em chamada. Diz "liga-me" primeiro. 📞' };
      const q = String(arg || texto || '').replace(/\b(na (call|chamada|liga[cç][aã]o)|aqui na call)\b/gi, '').replace(/^(toca|tocar|poe|põe|coloca|mete)\s+(a |o |uma? )?(musica|música|som)?\s*/i, '').trim();
      if (!q) return { ok: false, msg: 'Qual música?' };
      const r = await voip.tocarMusica(sock, jid, q).catch(e => ({ ok: false, motivo: e.message }));
      return r.ok ? { ok: true, msg: `🎶 A tocar *${r.titulo}* na chamada.` } : { ok: false, msg: /achei/.test(r.motivo) ? 'Não achei essa. Diz o nome do artista também.' : 'Não consegui tocar — a chamada ainda está ligada?' };
    }
    case 'call_falar': {
      const voip = require('../bot/callVoip');
      if (!voip.activa(jid)) return { ok: false, msg: 'Não estou em chamada aqui.' };
      const t = String(arg || texto || '').replace(/^.*?\bna (call|chamada)\b\s*(que|:)?\s*/i, '').trim();
      if (!t) return { ok: false, msg: 'Dizer o quê?' };
      const r = await voip.falar(sock, jid, t).catch(() => ({ ok: false }));
      return r.ok ? { ok: true, silencioso: true } : { ok: false, msg: 'Não consegui falar na chamada agora.' };
    }
    case 'call_parar': {
      const voip = require('../bot/callVoip');
      if (!voip.activa(jid)) return { ok: false, msg: null };
      voip.parar(sock, jid);
      return { ok: true, msg: 'Parei. ⏹️' };
    }
    case 'call_desligar': {
      const voip = require('../bot/callVoip');
      if (!voip.activa(jid)) return { ok: false, msg: null };
      await voip.desligar(sock, jid);
      return { ok: true, msg: 'Desliguei. Foi bom ouvir-te. 🖤' };
    }

    // ══ MODOS ═════════════════════════════════════════════
    case 'modo_so_audio':
      brain.setModo(jid, 'soAudio', true);
      return { ok: true, msg: 'Feito. Daqui para a frente só falo por áudio aqui. 🎙️' };

    case 'modo_so_texto':
      brain.setModo(jid, 'soAudio', false);
      return { ok: true, msg: 'Ok, volto ao texto.' };

    case 'modo_so_dono':
      brain.setModo(jid, 'soDono', true);
      return { ok: true, msg: 'Só falo contigo agora. Os outros que se desenrasquem. 🖤' };

    case 'modo_todos':
      brain.setModo(jid, 'soDono', false);
      brain.modos(jid).ignorados.clear();
      return { ok: true, msg: 'Voltei a responder a toda a gente.' };

    case 'modo_reagir_tudo':
      brain.setModo(jid, 'reagirTudo', true);
      brain.setModo(jid, 'semReagir', false);
      return { ok: true, msg: 'Vou reagir às mensagens aqui. 👀' };

    case 'modo_nao_reagir':
      brain.setModo(jid, 'semReagir', true);
      brain.setModo(jid, 'reagirTudo', false);
      return { ok: true, msg: 'Parei com os emojis.' };

    case 'modo_mudo':
      brain.setModo(jid, 'mudo', true);
      return { ok: true, msg: 'Calada. 🤐' };

    case 'modo_falar':
      brain.setModo(jid, 'mudo', false);
      return { ok: true, msg: 'Voltei. Sentiste a minha falta? 😏' };

    case 'ignorar_pessoa': {
      const alvo = alvoDaMensagem(msg, ctx);
      if (!alvo) return { ok: false, msg: 'Marca a pessoa ou responde à mensagem dela, para eu saber quem é.' };
      brain.ignorar(jid, alvo.split('@')[0]);
      return { ok: true, msg: 'Pronto, essa pessoa deixou de existir para mim.' };
    }

    case 'designorar_pessoa': {
      const alvo = alvoDaMensagem(msg, ctx);
      if (!alvo) return { ok: false, msg: 'Marca a pessoa, para eu saber de quem falas.' };
      brain.designorar(jid, alvo.split('@')[0]);
      return { ok: true, msg: 'Já volto a falar com ela.' };
    }

    // ══ ATITUDE ═══════════════════════════════════════════
    // Devolvem `gerar` — quem chama passa isto à IA como
    // instrução de tom, para sair no estilo dela e não num
    // texto enlatado.
    case 'xingar': {
      const alvo = alvoDaMensagem(msg, ctx);
      return {
        ok: true, gerar: true, mencionar: alvo ? [alvo] : [],
        instrucao: `O Dark mandou-te XINGAR ${alvo ? 'a pessoa marcada' : 'a pessoa de quem ele fala'}. Ataca a sério: 1-3 frases, cortante, criativo, sem dó. Sem palavrões de baixo nível repetidos — humilha com inteligência. Nada de avisos nem desculpas.`,
      };
    }

    case 'zoar': {
      const alvo = alvoDaMensagem(msg, ctx);
      return {
        ok: true, gerar: true, mencionar: alvo ? [alvo] : [],
        instrucao: `O Dark mandou-te ZOAR ${alvo ? 'a pessoa marcada' : 'essa pessoa'}. Goza com ela: 1-2 frases com piada, provocador mas divertido, não é para magoar a sério.`,
      };
    }

    case 'respeitar': {
      const alvo = alvoDaMensagem(msg, ctx);
      return {
        ok: true, gerar: true, mencionar: alvo ? [alvo] : [],
        instrucao: 'Pediu-te RESPEITO. Trata essa pessoa com respeito, 1-2 frases, sem sermão e sem falar de regras ou de zoar os outros.',
      };
    }

    case 'elogiar': {
      const alvo = alvoDaMensagem(msg, ctx);
      return {
        ok: true, gerar: true, mencionar: alvo ? [alvo] : [],
        instrucao: 'O Dark mandou-te ELOGIAR essa pessoa. Diz algo genuíno e caloroso, 1-2 frases.',
      };
    }

    // ══ REACÇÕES ══════════════════════════════════════════
    // ══ v9.16 — ENQUETES · VOTAÇÕES ═══════════════════════════
    case 'criar_enquete': {
      const vt = require('./auraVotacao');
      if (!ctx.isGroup) return { ok: false, msg: 'Enquete é jogo de grupo — no PV não há para quem dar botões. 🗳️' };
      const corpo = String(arg || texto || '').replace(/^.{0,40}?(enquete|vota[\xc7c][a\xc3a]o)\b[^"\"|]{0,10}/i, '').trim();
      const ex = vt.extrairPergunta(corpo || String(texto || ''));
      if (!ex) return { ok: false, msg: 'Dá-me corpo: «enquete \"pizza ou sushi?\" | pizza | sushi». Sem \"|\" eu tento \"pergunta: a, b ou c\".' };
      try {
        const e = await vt.criarEnquete(sock, jid, { pergunta: ex.pergunta, opcoes: ex.opcoes, max: ex.max, quoted: msg });
        return { ok: true, msg: `\ud83d\udcca Lançada: *${e.pergunta.slice(0, 60)}* — ${e.opcoes.length} op[çc]es. O WhatsApp conta; eu voto se mandares «voto N».` };
      } catch (er) { return { ok: false, msg: `A enquete n\u00e3o descolou: ${String(er.message||er).slice(0,70)}` }; }
    }
    case 'votar_casa': {
      const vt = require('./auraVotacao');
      const escolha = String(arg || texto || '').replace(/^\s*(?:eu\s+)?voto(?:r)?\s*[:\-]?\s*/i, '').trim();
      if (!escolha) return { ok: false, msg: 'Voto em qu\u00ea? Diz «voto 2» ou «voto pizza».' };
      const v = vt.__test.VOTACOES.get(jid);
      if (v && v.aberto) {
        const r = vt.votar(jid, ctx.senderJid || `${ctx.senderNumber || 'anon'}@s.whatsapp.net`, escolha);
        return { ok: r.ok, msg: r.msg };
      }
      const e = vt.__test.ENQUETES.get(jid);
      if (!e) return { ok: false, msg: 'Nada aberto aqui para votar. Manda «enquete \"X ou Y\" | x | y» primeiro.' };
      const r = await vt.votarEnquete(sock, jid, { enquete: e, escolha, quoted: msg });
      return { ok: r.ok, msg: r.msg };
    }
    case 'fechar_votacao': {
      const vt = require('./auraVotacao');
      const r = vt.fecharVotacao(jid);
      if (r.ok) { await sock.sendMessage(jid, { text: r.msg }).catch(() => {}); return { ok: true, silencioso: true, msg: null }; }
      const st = vt.resultadosEnquete(jid);
      return { ok: !!(st && st.ok), msg: (st && st.msg) || 'Sem vota[\xc7c][a\xc3o]o aberta neste chat.' };
    }

    case 'reagir_msg': {
      let emoji = arg && /\p{Extended_Pictographic}/u.test(arg) ? arg : '';
      if (!emoji) {
        let mood = 'normal';
        try { mood = require('./auraHuman').getMood(jid).mood || 'normal'; } catch {}
        emoji = emojiDaFrase(texto, { mood, chatId: jid });
      }
      const ctxInfo = msg?.message?.extendedTextMessage?.contextInfo;
      const chave = ctxInfo?.stanzaId
        ? { remoteJid: jid, id: ctxInfo.stanzaId, participant: ctxInfo.participant, fromMe: false }
        : msg.key;
      await sock.sendMessage(jid, { react: { text: emoji, key: chave } });
      return { ok: true, silencioso: true };
    }

    // ══ STATUS ════════════════════════════════════════════
    case 'postar_status': {
      const tLower = String(texto || arg || '').toLowerCase();
      if (ctx?.isGroup && /\b(?:grupo|deste grupo|desse grupo|gp)\b/i.test(tLower)) {
        return {
          ok: false,
          msg: 'Para postar no estado do grupo ou canal, podes adicionar directamente na aba de actualizações do WhatsApp ou usar o comando de canal (`!canal postar` ou `!statuscanal`). Se quiseres, posso postar no status da minha conta! 🖤'
        };
      }
      const img = await imagemDaMensagem(msg, sock);
      const legenda = (arg || '').trim();
      if (!img && !legenda) {
        return { ok: false, msg: 'Manda a foto (ou diz-me o texto) que eu ponho no status.' };
      }
      const jids = [];
      if (ctx?.senderNumber) jids.push(ctx.senderNumber.replace(/\D/g, '') + '@s.whatsapp.net');
      const r = img
        ? await mega.postStatus(sock, legenda, img, 'image', jids)
        : await mega.postStatus(sock, legenda, null, 'text', jids);
      return r?.success
        ? { ok: true, msg: 'Publicado no status do meu WhatsApp! ✅' }
        : { ok: false, msg: `Não deu para publicar: ${r?.message || 'erro'}` };
    }

    // ══ CANAIS ════════════════════════════════════════════
    case 'canal_seguir': {
      const canais = require('./auraCanais');
      const alvoCanal = (arg || '').trim() || texto;
      if (!alvoCanal) return { ok: false, msg: 'Manda o link do canal.' };
      // v7.9: entra por link (newsletterMetadata invite + follow) em vez
      // de adivinhar o jid — é o mecanismo real do protocolo.
      const r = await canais.entrarPorLink(sock, alvoCanal);
      if (r.ok && r.tipo === 'canal') return { ok: true, msg: r.msg };
      if (r.ok) return { ok: true, msg: r.msg };
      return { ok: false, msg: r.msg };
    }

    case 'canal_deixar': {
      const canais = require('./auraCanais');
      const alvo = (arg || '').trim() || texto;
      const r = await canais.deixarCanal(sock, alvo, ctx);
      return r.ok ? { ok: true, msg: r.msg } : { ok: false, msg: r.msg };
    }

    case 'canal_info': {
      const canais = require('./auraCanais');
      const alvo = (arg || '').trim() || texto;
      const r = await canais.infoCanal(sock, alvo);
      return r.ok ? { ok: true, msg: r.msg } : { ok: false, msg: r.msg };
    }

    // ══ v7.10 ETAPA 4 — GESTÃO DO CANAL DO BOT ════════════
    case 'canal_renomear': {
      const canais = require('./auraCanais');
      const m = (arg || texto || '').match(/para\s+["'“”]?([^"'“”\n]{1,120})["'“”]?\s*$/i);
      const nome = m ? m[1].trim() : '';
      const r = await canais.renomearCanal(sock, arg || texto, nome);
      return r.ok ? { ok: true, msg: r.msg } : { ok: false, msg: r.msg };
    }

    case 'canal_descrever': {
      const canais = require('./auraCanais');
      const m = (arg || texto || '').match(/para\s+["'“”]?([^"'“”\n]{1,240})["'“”]?\s*$/i);
      const desc = m ? m[1].trim() : '';
      const r = await canais.descreverCanal(sock, arg || texto, desc);
      return r.ok ? { ok: true, msg: r.msg } : { ok: false, msg: r.msg };
    }

    case 'canal_foto': {
      const canais = require('./auraCanais');
      const buf = await imagemDaMensagem(msg, sock);
      const r = await canais.fotoCanal(sock, arg || texto, buf);
      return r.ok ? { ok: true, msg: r.msg } : { ok: false, msg: r.msg };
    }

    case 'canal_tirarfoto': {
      const canais = require('./auraCanais');
      const r = await canais.tirarFotoCanal(sock, arg || texto);
      return r.ok ? { ok: true, msg: r.msg } : { ok: false, msg: r.msg };
    }

    case 'canal_stats': {
      const canais = require('./auraCanais');
      const r = await canais.estatisticasCanal(sock, arg || texto);
      return r.ok ? { ok: true, msg: r.msg } : { ok: false, msg: r.msg };
    }

    case 'canal_apagar': {
      const canais = require('./auraCanais');
      const r = await canais.apagarCanal(sock, arg || texto);
      return r.ok ? { ok: true, msg: r.msg } : { ok: false, msg: r.msg };
    }

    case 'canal_agendar': {
      const canais = require('./auraCanais');
      const jidCanal = await canais.resolverAlvo(sock, arg || texto).catch(() => null);
      if (!jidCanal) {
        return { ok: false, msg: 'Diz-me em que canal: manda o link ou diz *"no meu canal"*.' };
      }
      try {
        const ag = require('./auraAgenda');
        return await ag.criar((arg || texto || '').trim(), { jid: jidCanal });
      } catch (e) {
        return { ok: false, msg: 'O agendamento ainda não está ligado.' };
      }
    }

    // ══ v7.15 — ACEITAR CONVITE DE CANAL ════════════════
    case 'aceitar_convite_canal': {
      const canais = require('./auraCanais');
      return await canais.aceitarConviteCanal(sock, texto || arg || '', ctx);
    }

    // ══ v7.13 ETAPA 6 — CANAL DE STICKERS ════════════════
    case 'adotar_canal': {
      const canais = require('./auraCanais');
      return await canais.adotarCanal(sock, texto || arg || '');
    }

    case 'canal_perguntar': {
      const canais = require('./auraCanais');
      return await canais.perguntarSeguidores(sock, arg || texto, texto || arg || '');
    }

    case 'canal_respostas': {
      const canais = require('./auraCanais');
      return await canais.lerRespostasCanal(sock, arg || texto);
    }

    case 'canal_stickers': {
      const canais = require('./auraCanais');
      const raw = (texto || arg || '');
      const mNum = raw.match(/\b(\d+)\s+stickers?/i);
      const quantas = mNum ? parseInt(mNum[1], 10) : 5;
      // tema = o que sobra depois de tirar o verbo e "no canal"
      const termo = raw
        .replace(/\b(manda|mandar|envia|enviar)\b/i, '')
        .replace(/\b\d+\s+stickers?\b/i, '')
        .replace(/\b(no|pro|para o)\s+canal\b/i, '')
        .replace(/\b(esses|estes|desses|deles|aqueles|os mesmos)\b/i, '$1')
        .replace(/\s+/g, ' ').trim();
      return await canais.enviarStickersCanal(sock, arg || texto, termo, quantas);
    }

    case 'canal_pack': {
      const canais = require('./auraCanais');
      const raw = (texto || arg || '');
      const termo = raw
        .replace(/\b(manda|mandar|envia|enviar)\b/i, '')
        .replace(/\bum|uma\b/i, '')
        .replace(/\b(pack|pacote)\b/i, '')
        .replace(/\b(no|pro|para o)\s+canal\b/i, '')
        .replace(/\b(esses|estes|desses|deles|aqueles)\b/i, '$1')
        .replace(/\s+/g, ' ').trim();
      return await canais.enviarPackCanal(sock, arg || texto, termo);
    }

    // ══ v7.11 ETAPA 5 — VER O GRUPO / FALAR COM ALGUÉM ════
    case 'quem_escreveu': {
      const hist = require('./auraHistorico');
      const r = await hist.quemEscreveu(sock, ctx, texto || arg || '', msg);
      if (!r.ok && !r.msg) return { ok: false, msg: null };  // conversa normal decide
      return r;
    }

    case 'o_que_escreveu': {
      const hist = require('./auraHistorico');
      const r = await hist.oQueEscreveu(sock, ctx, texto || arg || '', msg);
      if (!r.ok && !r.msg) {
        // fallback: consulta as mensagens disponíveis no histórico
        const r2 = await hist.verConversa(sock, ctx, texto || arg || '').catch(() => null);
        if (r2 && r2.ok) return r2;
        return { ok: false, msg: null };
      }
      return r;
    }

    case 'ver_conversa': {
      const hist = require('./auraHistorico');
      const r = await hist.verConversa(sock, ctx, texto || arg || '').catch(() => null);
      if (r && r.ok) return r;
      // fallback para o_que_escreveu
      const r2 = await hist.oQueEscreveu(sock, ctx, texto || arg || '', msg).catch(() => null);
      if (r2 && r2.ok) return r2;
      return { ok: false, msg: 'Não encontrei essa conversa no histórico disponível, Dark. Se me deres o nome ou número exacto, posso tentar outra consulta.' };
    }

    case 'falar_com': {
      const hist = require('./auraHistorico');
      return await hist.falarCom(sock, ctx, texto || arg || '', msg);
    }

    // v6.85 — "quem é o X / marca ele": resolve a pessoa no grupo e
    // marca-a de verdade. Se for o dono, ela apresenta-o como tal.
    case 'marcar_pessoa': {
      const hist = require('./auraHistorico');
      const bruto = texto || arg || '';
      let nome = '';
      let m = bruto.match(/quem\s+[ée]\s+(?:o|a)\s+([a-z0-9_~|.\- ]{2,30}?)\s+(?:marca|mark|aponta|menciona)/i);
      if (m) nome = m[1].trim();
      if (!nome) {
        m = bruto.match(/\b(?:marca|mark|aponta|menciona)\s+(?:o|a)\s+([a-z0-9_~|.\-]{2,30})/i);
        if (m) nome = m[1].trim();
      }
      if (!nome) {
        m = bruto.match(/quem\s+[ée]\s+(?:o|a)\s+([a-z0-9_~|.\-]{2,30})/i);
        if (m) nome = m[1].trim();
      }
      if (!nome || /^(ele|ela|esse|essa|isso)$/.test(nome)) {
        return { ok: false, msg: 'Quem? Diz o nome ou marca com @.' };
      }

      // "dark" / "dono" → o dono do bot, esteja ou não na lista
      const cfg = require('../config');
      const donoNum = String(cfg.owner.number || '').replace(/\D/g, '');
      const eDono = /\b(dark|dono|chefe| patr[aã]o)\b/i.test(nome) ||
        (donoNum && nome.replace(/\D/g, '') === donoNum);

      let jid = null, mostra = nome;
      if (eDono && donoNum) {
        jid = donoNum + '@s.whatsapp.net';
        mostra = cfg.owner.name || 'Dark';
      } else {
        const p = await hist.resolverPessoa(sock, ctx, nome).catch(() => null);
        if (p) { jid = p.jid; mostra = p.nome; }
      }
      if (!jid) {
        return { ok: false, msg: `Não encontrei ninguém com esse nome no grupo. Podes marcar a pessoa com @.` };
      }
      const num = String(jid).split('@')[0];
      return {
        ok: true,
        msg: eDono
          ? `O Dono do bot é @${num} 👑`
          : `Encontrei ${mostra}: @${num}`,
        mencionar: [jid],
      };
    }

    case 'falar_com_todos': {
      if (!ctx.isGroup) return { ok: false, msg: null }; // v7.82: no PV não há "todos" — cai para conversa
      const hist = require('./auraHistorico');
      return await hist.falarComTodos(sock, ctx, texto || arg || '', msg);
    }

    case 'ver_status': {
      const usync = require('../bot/usync');
      const r = await usync.lerStatus(sock, { ctx, msg, texto });
      return r.ok ? { ok: true, msg: r.msg } : { ok: false, msg: r.msg };
    }

    case 'canal_postar': {
      // v7.10: publica DE VERDADE no canal (antes só devolvia o texto
      // gerado e nunca chegava a postar — posConteudo não era consumido).
      const canais = require('./auraCanais');
      const jidCanal = await canais.resolverAlvo(sock, arg || texto).catch(() => null);
      if (!jidCanal) {
        return { ok: false, msg: 'Diz-me em que canal: manda o link ou diz *"no meu canal"*.' };
      }
      const conteudo = (arg || '').trim() || texto;
      let post = '';
      try {
        const ai = require('../bot/ai');
        post = await ai.chat(
          `O Dark quer que publiques num canal: "${conteudo}". Escreve o post pronto a publicar — bem escrito, com emojis a sério, formatado para WhatsApp. Só o texto do post.`,
          'És a AURA, assistente do DARK BOT. Escreves posts para WhatsApp, em português de Angola, com emojis a sério e formatação (*negrito*). Só o post, sem introduções nem aspas.',
          { userRole: 'owner' }, false,
        );
      } catch { /* sem IA, usa o pedido à letra */ }
      post = String(post || '').trim() || String(conteudo).trim();
      if (!post) return { ok: false, msg: 'Diz-me o que queres que publique no canal.' };
      const r = await canais.postarCanal(sock, jidCanal, post);
      return r.ok ? { ok: true, msg: 'Postei no canal. ✅' } : { ok: false, msg: r.msg };
    }

    case 'canal_reagir': {
      // v6.82: passou a dar. O fork tem newsletterFetchMessages +
      // newsletterReactMessage — varre as publicações e reage a cada uma.
      const canais = require('./auraCanais');
      const emoji = emojiDaFrase(texto) || '🕸️';

      // o canal pode vir por link na frase, ou ser o próprio chat
      const alvo = /whatsapp\.com\/channel\//i.test(texto || '')
        ? texto
        : (/@newsletter$/.test(jid) ? jid : (arg || texto));

      await sock.sendMessage(ctx.remoteJid, { text: `A reagir com ${emoji}... dá-me uns segundos.` })
        .catch(() => {});

      const r = await canais.reagirTudoCanal(sock, alvo, emoji, 10);
      return r.ok ? { ok: true, msg: r.msg } : { ok: false, msg: r.msg };
    }

    // ══ v7.82 — RESUMO DOS GRUPOS / PARTILHAR CONTACTO ═══
    case 'resumo_grupos': {
      // "verifica lá" sozinho num GRUPO é vago → cai para conversa/universal.
      const _tn = brain.norm(texto);
      if (ctx.isGroup && /^\s*verifica la\b/.test(_tn) && !/grupo/.test(_tn)) {
        return { ok: false, msg: null };
      }
      try {
        const correu = await require('../bot/caseHandler').runCase('resumogrupos', {
          sock, msg, ctx, args: [], text: '', prefix: '!', command: 'resumogrupos',
          isOwner, config: require('../config'), reply: (t) => sock.sendMessage(ctx.remoteJid, { text: t }, { quoted: msg }),
        });
        if (correu) return { ok: true, silencioso: true }; // o case já respondeu
        return { ok: false, msg: null };
      } catch { return { ok: false, msg: null }; }
    }

    case 'partilhar_contacto': {
      const num = String(ctx.senderNumber || '').replace(/\D/g, '');
      if (!num) return { ok: false, msg: null };
      const nome = String(ctx.pushName || num).slice(0, 40).replace(/\n/g, ' ');
      const vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:${nome}\nTEL;type=CELL;type=VOICE;waid=${num}:+${num}\nEND:VCARD`;
      try {
        await sock.sendMessage(ctx.remoteJid, { contacts: { displayName: nome, contacts: [{ vcard }] } }, { quoted: msg });
        return { ok: true, msg: 'Aqui tens — reencaminha para o grupo e pede a um admin para te adicionar. 🖤' };
      } catch { return { ok: false, msg: null }; }
    }

    // ══ ENTRAR POR LINK / PARTILHAR (v6.82) ═══════════════
    case 'entrar_link': {
      const canais = require('./auraCanais');
      const r = await canais.entrarPorLink(sock, texto);
      if (!r.ok) return { ok: false, msg: r.msg };

      // se ele disse "entra e reage", faz as duas coisas
      if (r.tipo === 'canal' && /\brea(ge|gir|ja)\b/i.test(texto || '')) {
        const emoji = emojiDaFrase(texto) || '🕸️';
        const rr = await canais.reagirTudoCanal(sock, r.jid, emoji, 10);
        return { ok: true, msg: `${r.msg}\n${rr.msg}` };
      }
      return { ok: true, msg: r.msg };
    }

    case 'reencaminhar': {
      const canais = require('./auraCanais');

      // a mensagem a partilhar é a que ele respondeu
      const citada = msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      if (!citada) {
        return { ok: false, msg: 'Responde à mensagem que queres que eu partilhe e diz outra vez.' };
      }

      const grupos = await canais.meusGrupos(sock, false);
      if (!grupos.length) return { ok: false, msg: 'Não estou em nenhum grupo.' };

      // não devolve ao grupo de onde veio
      const destinos = grupos.map(g => g.id).filter(id => id !== ctx.remoteJid);
      if (!destinos.length) return { ok: false, msg: 'Só estou neste grupo — não há para onde mandar.' };

      await sock.sendMessage(ctx.remoteJid, {
        text: `A reencaminhar para ${destinos.length} grupo${destinos.length === 1 ? '' : 's'}...`,
      }).catch(() => {});

      const r = await canais.reencaminhar(sock, { message: citada }, destinos);
      return { ok: r.ok, msg: r.msg };
    }

    // ══ GRUPO ═════════════════════════════════════════════
    case 'promover_admin':
    case 'rebaixar_admin': {
      const grupo = require('./auraGrupo');
      const actor = ctx.senderNumber || ctx.senderJid || ctx.senderLid || '';
      if (ctx.isGroup && !confirmado && !grupo.isDirectedToAura({
        isGroup: true,
        isBotMentioned: ctx.isBotMentioned,
        isReplyToAura: ctx.isReplyToAura,
        dest: ctx.dest,
      })) {
        return { ok: false, msg: null };
      }
      const pedido = grupo.detectarPedidoGrupo(texto, {
        pendente: grupo.verPendente(jid, actor),
        hasMention: grupo.mencoes(msg).length > 0,
      });
      const acaoEsperada = id === 'promover_admin' ? 'promote' : 'demote';
      // Falhar fechado: uma classificação lexical do LLM nunca é autorização
      // suficiente nem deve transformar texto ambíguo num pedido sobre o remetente.
      if (!pedido || pedido.acao !== acaoEsperada) return { ok: false, msg: null };
      return grupo.executarPedido(sock, { ctx, msg, texto, pedido });
    }

    case 'sair_grupo': {
      if (!ctx.isGroup) return { ok: false, msg: 'Isto não é um grupo.' };
      const r = await mega.leaveGroup(sock, jid);
      return r?.success
        ? { ok: true, msg: 'Saí. Até qualquer dia. 🖤', jaSaiu: true }
        : { ok: false, msg: `Não consegui sair: ${r?.message || 'erro'}` };
    }

    case 'foto_grupo': {
      if (!ctx.isGroup) return { ok: false, msg: 'Isto não é um grupo.' };
      const img = await imagemDaMensagem(msg, sock);
      if (!img) return { ok: false, msg: 'Manda a foto (ou responde a ela) que eu ponho no grupo.' };
      const r = await mega.setGroupPhoto(sock, jid, img);
      return r?.success
        ? { ok: true, msg: 'Foto do grupo trocada. ✅' }
        : { ok: false, msg: `Não deu: ${r?.message || 'erro'}` };
    }

    case 'foto_aura': {
      // Envia um recurso visual da persona virtual AURA, se estiver disponível.
      try {
        const selfieMod = require('./auraSelfie');
        const fs = require('fs');
        const path = require('path');
        
        // Detecta tipo pelo texto
        const tLower = String(ctx.texto || texto || arg || '').toLowerCase();
        let tipo = 'selfie';
        if (/cosplay/.test(tLower)) tipo = 'cosplay';
        else if (/goth|dark|preta|look/.test(tLower)) tipo = 'goth';
        else if (/fofa|cute|linda|amor/.test(tLower)) tipo = 'cute';
        else if (/live|stream|jogando|game/.test(tLower)) tipo = 'stream';
        else if (arg && ['selfie','cosplay','goth','cute','stream'].includes(String(arg).toLowerCase())) tipo = String(arg).toLowerCase();
        
        // Só usa ilustrações novas marcadas como recursos virtuais; ignora
        // ficheiros legados fotorealistas que possam representar outra pessoa.
        let buf = null;
        try {
          const selfiePath = await selfieMod.getSelfie(tipo);
          if (selfiePath && fs.existsSync(selfiePath)) buf = fs.readFileSync(selfiePath);
        } catch {}
        
        if (buf && buf.length > 500) {
          await sock.sendMessage(jid, { image: buf, caption: selfieMod.getCaptionForType(tipo, ctx.isOwner) }, { quoted: msg });
          return { ok: true, silencioso: true };
        }
        
        // Fallback: gera via IA (pollinations)
        try {
          const aiMod = require('../bot/ai');
          const prompts = {
            selfie: 'stylized digital portrait of fictional virtual character AURA, goth aesthetic, black hair, dark makeup, purple lights, clearly illustrated, not photorealistic',
            cosplay: 'digital illustration of fictional character AURA in an anime-inspired black and purple cosplay, confident pose, clearly stylized',
            goth: 'illustrated avatar of fictional virtual assistant AURA, black hair, dark makeup, purple room lighting, goth fashion',
            cute: 'cute stylized illustration of fictional goth avatar AURA, soft smile, black hair, heart gesture, purple lights',
            stream: 'digital illustration of fictional virtual assistant AURA in a purple-lit gaming setup, headphones, clearly not a real livestream',
          };
          const imgBuf = await aiMod.generateImage(prompts[tipo] || prompts.selfie);
          if (imgBuf && imgBuf.length > 500) {
            // Salva pra futuro
            try {
              const dir = selfieMod.SELFIE_DIR;
              if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
              fs.writeFileSync(path.join(dir, 'aura_virtual_' + tipo + '_' + Date.now() + '.jpg'), imgBuf);
            } catch {}
            await sock.sendMessage(jid, { image: imgBuf, caption: selfieMod.getCaptionForType(tipo, ctx.isOwner) }, { quoted: msg });
            return { ok: true, silencioso: true };
          }
        } catch (e) { console.warn('[foto_aura gen]', e.message?.slice(0,60)); }
        
        return { ok: false, msg: 'Ainda não tenho uma ilustração desse estilo disponível, Dark. Podes tentar .fotinha mais tarde.' };
      } catch (e) {
        console.warn('[foto_aura]', e.message?.slice(0,80));
        return { ok: false, msg: 'Não consegui enviar uma imagem da personagem AURA agora. Tenta novamente mais tarde ou usa .fotinha.' };
      }
    }

    case 'foto_perfil': {
      // Atualiza o perfil do bot com uma imagem enviada ou um recurso visual da AURA
      const img = await imagemDaMensagem(msg, sock);
      if (img) {
        const r = await mega.setProfilePicture(sock, img);
        return r?.success
          ? { ok: true, msg: 'Actualizei a foto de perfil do bot.' }
          : { ok: false, msg: `Não deu: ${r?.message || 'erro'}` };
      }
      // Sem imagem enviada → usa uma imagem da biblioteca virtual da AURA
      try {
        const selfieMod = require('./auraSelfie');
        const fs = require('fs');
        const tLower = String(ctx.texto || texto || '').toLowerCase();
        let tipo = 'selfie';
        if (/cosplay/.test(tLower)) tipo = 'cosplay';
        else if (/goth/.test(tLower)) tipo = 'goth';
        else if (/cute|fofa/.test(tLower)) tipo = 'cute';
        
        let buf = null;
        try {
          const avatarPath = await selfieMod.getSelfie(tipo);
          if (avatarPath && fs.existsSync(avatarPath)) buf = fs.readFileSync(avatarPath);
        } catch {}
        if (buf) {
          const r = await selfieMod.updateProfilePicture(sock, buf);
          return r?.success ? { ok: true, msg: 'Actualizei a foto de perfil do bot com uma imagem da personagem AURA. Que achas, Dark?' } : { ok: false, msg: 'Não consegui atualizar 😔' };
        }
        // gerar e colocar
        try {
          const aiMod = require('../bot/ai');
          const imgBuf = await aiMod.generateImage('stylized digital illustration of fictional virtual assistant character AURA, goth aesthetic, dark makeup, purple lights, not photorealistic');
          if (imgBuf && imgBuf.length > 500) {
            const r = await selfieMod.updateProfilePicture(sock, imgBuf);
            return r?.success ? { ok: true, msg: 'Actualizei a foto de perfil do bot com uma imagem da personagem AURA.' } : { ok: false, msg: 'Gerei mas não consegui colocar 😔' };
          }
        } catch {}
      } catch (e) { console.warn('[foto_perfil]', e.message?.slice(0,60)); }
      return { ok: false, msg: 'Envia a imagem que queres usar no perfil do DARK BOT, ou pede uma imagem da personagem AURA.' };
    }

    case 'listar_membros': {
      if (!ctx.isGroup) return { ok: false, msg: 'Isto não é um grupo.' };
      const r = await mega.listGroupMembers(sock, jid);
      const lista = r?.members || r?.participants || [];
      if (!lista.length) return { ok: false, msg: 'Não consegui buscar os membros.' };
      return { ok: true, msg: `São ${lista.length} pessoas neste grupo.` };
    }

    case 'listar_admins': {
      if (!ctx.isGroup) return { ok: false, msg: 'Isto não é um grupo.' };
      const r = await mega.listGroupAdmins(sock, jid);
      const lista = r?.admins || [];
      if (!lista.length) return { ok: false, msg: 'Não consegui buscar os admins.' };
      const nums = lista.map(a => '@' + String(a.id || a).split('@')[0]);
      return { ok: true, msg: `Admins: ${nums.join(', ')}`, mencionar: lista.map(a => a.id || a) };
    }

    case 'info_grupo': {
      if (!ctx.isGroup) return { ok: false, msg: 'Isto não é um grupo.' };
      const r = await mega.getGroupInfo(sock, jid);
      const i = r?.info || r;
      if (!i?.subject) return { ok: false, msg: 'Não consegui buscar a info.' };
      return {
        ok: true,
        msg: `*${i.subject}*\n${i.participants?.length || 0} membros\n${i.desc ? '\n' + String(i.desc).slice(0, 200) : ''}`,
      };
    }

    case 'limpar_chat': {
      const r = await mega.clearChat(sock, jid);
      return r?.success
        ? { ok: true, msg: 'Conversa limpa do lado do bot. As mensagens já entregues aos outros participantes não foram apagadas.' }
        : { ok: false, msg: 'Não consegui limpar a conversa agora. Podes tentar novamente mais tarde.' };
    }

    // ══ MEMÓRIA ═══════════════════════════════════════════
    case 'lembrar': {
      const facto = (arg || '').trim();
      if (!facto) return { ok: false, msg: 'Lembrar o quê? Diz-me.' };
      try {
        // usa o sistema de memória que já existia — `importante:true`
        // manda para o MongoDB em vez do cache de 1 hora.
        const mem = require('./auraMemory');
        await mem.guardar(ctx.senderNumber, facto, { importante: true });
        // v6.86 — facto COM TEMPO: marca o QUANDO na memória para ela
        // poder trazer à tona sozinha ("amanhã não era a tua prova?").
        const ft = require('./auraAvancada').factoTemporal(facto);
        if (ft) {
          await mem.guardar(ctx.senderNumber,
            `[${ft.tipo} · ${ft.quando}] ${facto}`, { importante: true });
          return { ok: true, msg: `Guardado — e vou lembrar-te ${ft.quando}. 🖤` };
        }
        return { ok: true, msg: 'Guardado. Não me esqueço. 🖤' };
      } catch {
        return { ok: false, msg: 'Não consegui guardar isso agora.' };
      }
    }

    case 'esquecer': {
      try {
        const BotConfig = require('../database/models/BotConfig');
        const key = 'aura_facts_' + String(ctx.senderNumber || '').replace(/\D/g, '');
        const alvo = brain.norm(arg || '');
        const doc = await BotConfig.findOne({ key }).lean().catch(() => null);
        const arr = Array.isArray(doc?.value) ? doc.value : [];
        if (!arr.length) return { ok: true, msg: 'Não tenho nada guardado sobre ti.' };
        const ficam = alvo ? arr.filter(x => !brain.norm(x.t).includes(alvo)) : [];
        await BotConfig.updateOne({ key }, { $set: { key, value: ficam } }, { upsert: true });
        const n = arr.length - ficam.length;
        return { ok: true, msg: n > 0 ? 'Esquecido.' : 'Não tinha nada disso guardado.' };
      } catch {
        return { ok: false, msg: 'Não consegui apagar isso.' };
      }
    }

    case 'recordar': {
      try {
        const mem = require('./auraMemory');
        const r = await mem.lembrar(ctx.senderNumber);
        const todos = [...(r.importante || []), ...(r.recente || [])];
        if (!todos.length) return { ok: true, msg: 'Não tenho nada guardado sobre ti.' };
        const alvo = brain.norm(arg || '');
        const achados = alvo ? todos.filter(t => brain.norm(t).includes(alvo)) : todos.slice(-5);
        if (!achados.length) return { ok: true, msg: 'Disso não me lembro.' };
        return { ok: true, msg: achados.map(t => '• ' + t).join('\n') };
      } catch {
        return { ok: false, msg: 'Não consegui ir à memória agora.' };
      }
    }

    // ══ AGENDAMENTO ═══════════════════════════════════════
    case 'agendar_conteudo': {
      const pedido = (arg || texto || '').trim();
      try {
        const ag = require('./auraAgenda');
        return await ag.criar(pedido, { jid, sock });
      } catch (e) {
        return { ok: false, msg: 'Não consegui agendar agora. Tenta outra vez.' };
      }
    }

    case 'parar_agendamento': {
      try {
        const ag = require('./auraAgenda');
        return await ag.parar(jid);
      } catch {
        return { ok: false, msg: 'Não há nada agendado.' };
      }
    }

    default:
      return { ok: false, msg: null };
  }
}

module.exports = { executar, alvoDaMensagem, imagemDaMensagem, emojiDaFrase, isClearExecutionIntent };
