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
    const direta = msg?.message?.imageMessage;
    const citada = msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;
    if (!direta && !citada) return null;

    const alvo = direta
      ? msg
      : { key: msg.key, message: { imageMessage: citada } };

    const { downloadMediaMessage } = require('@systemzero/baileys');
    const buf = await downloadMediaMessage(alvo, 'buffer', {}, {
      reuploadRequest: sock?.updateMediaMessage,
    });
    return buf && buf.length > 500 ? buf : null;
  } catch {
    return null;
  }
}

/** Emoji pedido na frase, senão 🖤. */
function emojiDaFrase(texto) {
  const m = String(texto || '').match(/\p{Extended_Pictographic}[\uFE0F\u200D]*/gu);
  return m && m.length ? m[m.length - 1] : '🖤';
}

// ── Executor ────────────────────────────────────────────────

async function executar(id, arg, { sock, msg, ctx, texto, isOwner, isAdmin }) {
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
    case 'reagir_msg': {
      const emoji = arg && /\p{Extended_Pictographic}/u.test(arg) ? arg : emojiDaFrase(texto);
      const ctxInfo = msg?.message?.extendedTextMessage?.contextInfo;
      const chave = ctxInfo?.stanzaId
        ? { remoteJid: jid, id: ctxInfo.stanzaId, participant: ctxInfo.participant, fromMe: false }
        : msg.key;
      await sock.sendMessage(jid, { react: { text: emoji, key: chave } });
      return { ok: true, silencioso: true };
    }

    // ══ STATUS ════════════════════════════════════════════
    case 'postar_status': {
      const img = await imagemDaMensagem(msg, sock);
      const legenda = (arg || '').trim();
      if (!img && !legenda) {
        return { ok: false, msg: 'Manda a foto (ou diz-me o texto) que eu ponho no status.' };
      }
      const r = img
        ? await mega.postStatus(sock, legenda, img, 'image')
        : await mega.postStatus(sock, legenda, null, 'text');
      return r?.success
        ? { ok: true, msg: 'Publicado no status. ✅' }
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
      if (!r.ok && !r.msg) return { ok: false, msg: null };
      return r;
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
        return { ok: true, msg: `Não vi ninguém com esse nome aqui no grupo. 🤔` };
      }
      const num = String(jid).split('@')[0];
      return {
        ok: true,
        msg: eDono
          ? `Esse é o meu Dark 👑 @${num}`
          : `Esse é ${mostra} → @${num}`,
        mencionar: [jid],
      };
    }

    case 'falar_com_todos': {
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
    case 'promover_admin': {
      const grupo = require('./auraGrupo');
      return grupo.executarPedido(sock, {
        ctx, msg, texto,
        pedido: grupo.detectarPedidoGrupo(texto, { temPendente: !!grupo.verPendente(jid) })
          || { acao: 'promote', deSi: true },
      });
    }

    case 'rebaixar_admin': {
      const grupo = require('./auraGrupo');
      return grupo.executarPedido(sock, {
        ctx, msg, texto,
        pedido: { acao: 'demote', deSi: false },
      });
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

    case 'foto_perfil': {
      const img = await imagemDaMensagem(msg, sock);
      if (!img) return { ok: false, msg: 'Manda a foto que eu ponho no meu perfil.' };
      const r = await mega.setProfilePicture(sock, img);
      return r?.success
        ? { ok: true, msg: 'Mudei a minha foto. Que tal? 😏' }
        : { ok: false, msg: `Não deu: ${r?.message || 'erro'}` };
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
        ? { ok: true, msg: 'Chat limpo.' }
        : { ok: false, msg: 'O WhatsApp não me deixou limpar este chat.' };
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

module.exports = { executar, alvoDaMensagem, imagemDaMensagem, emojiDaFrase };
