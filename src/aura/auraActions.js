/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║   DARK BOT — AURA ACTIONS v1                                 ║
 * ║   Ela faz o que uma pessoa faz no WhatsApp                   ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * O Dark fala normalmente e ela executa. Sem comandos.
 *
 *   "aura cria um grupo chamado Família"   → cria o grupo
 *   "cria um canal chamado Dark News"      → cria o canal
 *   "muda o nome do grupo para X"          → renomeia
 *   "muda a descrição para X"              → altera descrição
 *   "fecha o grupo" / "abre o grupo"       → só admins / todos
 *   "sai deste grupo"                      → sai
 *   "manda o link do grupo"                → link de convite
 *   "muda o meu nome para X"               → nome do perfil
 *   "põe o recado X"                       → status/recado
 *
 * Verificado contra a API do Baileys: groupCreate, newsletterCreate,
 * groupUpdateSubject, groupUpdateDescription, groupSettingUpdate,
 * groupLeave, groupInviteCode, updateProfileName, updateProfileStatus.
 *
 * SEGURANÇA: só o Dono Supremo. Nada disto corre para mais ninguém.
 */

'use strict';

// v6.61: guarda a última comunidade criada por cada dono, para
// "cria um grupo na comunidade" saber onde meter o grupo.
const _ultimaComunidade = new Map();

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Extrai o nome depois de "chamado/chamada/com o nome/de nome". */
function extrairNome(texto) {
  const m = String(texto).match(/(?:chamad[oa]|com o nome|de nome|nome|:)\s+["'“”]?([^"'“”\n]{2,60})["'“”]?\s*$/i);
  if (m) return m[1].trim();
  // "cria um grupo Família" — nome no fim, sem palavra-chave
  const m2 = String(texto).match(/(?:grupo|canal|newsletter|comunidade)\s+(?:novo\s+|nova\s+)?["'“”]?([^"'“”\n]{2,60})["'“”]?\s*$/i);
  if (m2) {
    const n = m2[1].trim();
    if (!/^(aqui|agora|novo|nova|por favor|pf)$/i.test(n)) return n;
  }
  return null;
}

/**
 * v6.67 — Extrai o nome do grupo em "liga o grupo Arena à comunidade".
 * Devolve null se for "liga ESTE grupo" (aí é o grupo actual).
 */
function extrairNomeGrupoLigar(texto) {
  const t = String(texto || '');
  if (/\b(este|esse|deste|desse|aqui|actual|atual)\s+grupo\b/i.test(t)) return null;
  if (/\bgrupo\s+(este|esse|aqui)\b/i.test(t)) return null;

  // "liga o grupo Arena à comunidade" | "adiciona o grupo Arena na comunidade"
  let m = t.match(/\bgrupo\s+(?:chamad[oa]\s+)?["'“]?(.+?)["'”]?\s+(?:[àaá]|na|no|em|para|pra|de|da)\s+comunidade\b/i);
  if (m) return m[1].trim();

  // "adiciona um grupo na comunidade chamado Suporte"
  m = t.match(/\bum?\s+grupo\s+.*?\s+comunidade\s+(?:chamad[oa]\s+)["'“]?(.+?)["'”]?\s*$/i);
  if (m) return m[1].trim();

  // "adiciona à comunidade o grupo Arena"
  m = t.match(/comunidade\s+(?:o\s+)?grupo\s+(?:chamad[oa]\s+)?["'“]?(.+?)["'”]?\s*$/i);
  if (m) return m[1].trim();

  return null;
}

/** Pedido claro do convite DESTE grupo — nunca é o Link do Zelda. */
function ePedidoLinkGrupo(texto) {
  const t = norm(texto);
  if (!t || t.length > 120) return false;
  if (!/\b(link|convite|invite)\b/.test(t)) return false;
  if (/\bcomunidade\b/.test(t)) return false;
  if (/\b(pinterest|youtube|tiktok|instagram|site|url da (musica|música))\b/.test(t)) return false;
  return (
    /\b(manda|mande|envia|envie|mostra|mostre|quero|passa|gera|da|dá|verdadeiro|verdade|real|deste|desse|dele|dela|daqui|grupo|gp)\b/.test(t) ||
    /^(o\s+)?link\b/.test(t) ||
    /\blink\s+(verdadeiro|real|do grupo|dele)\b/.test(t)
  );
}

/** Extrai o valor depois de "para". */
function extrairPara(texto) {
  const m = String(texto).match(/\bpara\s+["'“”]?([^"'“”\n]{1,120})["'“”]?\s*$/i);
  return m ? m[1].trim() : null;
}

/**
 * Detecta a intenção de acção. Devolve null se não for uma ordem.
 * @returns {{acao:string, valor?:string}|null}
 */
function detectarAcao(texto) {
  const t = norm(texto);
  if (!t || t.length > 220) return null;

  // ── Fechar / abrir grupo (antes de "criar": mais específico) ──
  if (/\b(fecha|fechar|tranca|trancar|restringe|silencia)\b/.test(t) && /\bgrupo\b/.test(t)) {
    return { acao: 'fecharGrupo' };
  }
  if (/\b(abre|abrir|destranca|libera|liberta|desbloqueia)\b/.test(t) && /\bgrupo\b/.test(t)) {
    return { acao: 'abrirGrupo' };
  }

  // ── Criar canal (newsletter) ──────────────────────────────
  // v6.54: 'abre' saiu daqui — "abre o grupo" é libertar o grupo,
  // não criar um novo. Só 'cria/faz/monta' criam.
  // 'abre um canal CHAMADO x' é criar; 'abre o grupo' já foi tratado acima
  if (/\b(cria|criar|faz|fazer|monta|montar|abre|abrir)\b/.test(t) && /\b(canal|newsletter)\b/.test(t)) {
    return { acao: 'criarCanal', valor: extrairNome(texto) };
  }

  // ── v6.61: a ordem importa (mais específico primeiro) ─────
  // "cria um grupo NA COMUNIDADE" tem de ser testado antes de
  // "cria uma comunidade" — senão a segunda regra apanha-o e
  // acaba a criar uma comunidade chamada "Avisos".

  // 1. Grupo DENTRO da comunidade — CRIAR um novo.
  // v6.67: 'adiciona' e 'add' saíram daqui. "adiciona o grupo Arena
  // na comunidade" é LIGAR um grupo que já existe, não criar outro
  // — e o extrairNome devolvia lixo ("Arena na comunidade").
  if (/\b(cria|criar|faz|fazer|abre|abrir)\b/.test(t) &&
      /\bgrupo\b/.test(t) &&
      /\b(na|dentro da|nesta|da|pra|para a)\s+comunidade\b/.test(t)) {
    return { acao: 'grupoNaComunidade', valor: extrairNome(texto) };
  }

  // 1b. v6.66: convite/link da comunidade — antes de "ligar" e "criar",
  // senão "manda o convite da comunidade" cai no sítio errado.
  if (/\b(convite|link|invite|entrar)\b/.test(t) && /\bcomunidade\b/.test(t)) {
    return { acao: 'conviteComunidade' };
  }
  // "adiciona-me à comunidade" / "mete-me na comunidade"
  if (/\b(adiciona|add|mete|poe|põe|coloca|entra)\b/.test(t) &&
      /\b(me|nos)\b/.test(t) && /\bcomunidade\b/.test(t)) {
    return { acao: 'conviteComunidade' };
  }

  // 2. Ligar um grupo NOMEADO à comunidade (o grupo já existe)
  // v6.67: "liga o grupo Arena à comunidade" / "adiciona o grupo X
  // à comunidade" — antes caía no ligarComunidade, que só liga o
  // grupo ONDE a mensagem foi escrita.
  if (/\b(liga|ligar|junta|juntar|vincula|vincular|associa|adiciona|mete|poe|põe|coloca)\b/.test(t) &&
      /\bcomunidade\b/.test(t) && /\bgrupo\b/.test(t)) {
    const nome = extrairNomeGrupoLigar(texto);
    if (nome) return { acao: 'ligarGrupoNomeado', valor: nome };
    return { acao: 'ligarComunidade' };
  }

  // 2b. Ligar ESTE grupo a uma comunidade
  if (/\b(liga|ligar|junta|juntar|vincula|vincular|associa|mete|poe)\b/.test(t) &&
      /\bcomunidade\b/.test(t)) {
    return { acao: 'ligarComunidade' };
  }

  // 3. Criar a comunidade
  if (/\b(cria|criar|faz|fazer|monta|montar|abre|abrir)\b/.test(t) && /\bcomunidade\b/.test(t)) {
    return { acao: 'criarComunidade', valor: extrairNome(texto) };
  }

  // 3b. v7.9 ETAPA 3 — informação da comunidade (não é criar nem ligar)
  if (/\bcomunidade\b/.test(t) &&
      /\b(que|quais|quantos)\b[^.?!]{0,20}\bgrupos\b/.test(t)) {
    return { acao: 'gruposComunidade' };
  }
  if (/\bcomunidade\b/.test(t) &&
      /\b(info|informa[çc][aã]o|detalhes|como est[aá]|sobre a comunidade|membros|quantos s[aã]o)\b/.test(t)) {
    return { acao: 'infoComunidade' };
  }

  // ── Criar grupo ───────────────────────────────────────────
  if (/\b(cria|criar|faz|fazer|monta|montar)\b/.test(t) && /\bgrupo\b/.test(t)) {
    return { acao: 'criarGrupo', valor: extrairNome(texto) };
  }

  // ── Renomear grupo ────────────────────────────────────────
  if (/\b(muda|mudar|altera|alterar|troca|trocar|renomeia|poe|por)\b/.test(t) &&
      /\bnome\b/.test(t) && /\bgrupo\b/.test(t)) {
    return { acao: 'nomeGrupo', valor: extrairPara(texto) };
  }

  // ── Descrição do grupo ────────────────────────────────────
  if (/\b(muda|mudar|altera|alterar|poe|por|define)\b/.test(t) && /\b(descricao|descrição|assunto|topico|tópico)\b/.test(t)) {
    return { acao: 'descricaoGrupo', valor: extrairPara(texto) };
  }

  // ── Sair do grupo ─────────────────────────────────────────
  if (/\b(sai|sair|abandona|abandonar|deixa)\b.*\b(deste grupo|do grupo|daqui)\b/.test(t)) {
    return { acao: 'sairGrupo' };
  }

  // ── Link de convite (ordens claras, ANTES da IA / Pinterest) ──
  // "mande o link", "o link dele", "link verdadeiro", "convite do grupo"
  if (ePedidoLinkGrupo(t)) {
    return { acao: 'linkGrupo' };
  }

  // ── Nome do perfil do bot ─────────────────────────────────
  if (/\b(muda|mudar|altera|troca|poe|por)\b/.test(t) && /\b(teu nome|nome do bot|meu nome|nosso nome)\b/.test(t)) {
    return { acao: 'nomePerfil', valor: extrairPara(texto) };
  }

  // ── Recado / status ───────────────────────────────────────
  if (/\b(muda|mudar|altera|poe|por|define|actualiza|atualiza)\b/.test(t) && /\b(recado|status|estado|bio)\b/.test(t)) {
    return { acao: 'recado', valor: extrairPara(texto) };
  }

  // ── Ligar / chamada ───────────────────────────────────────
  if (/\b(me liga|liga-?me|liga pra mim|liga para mim|faz uma chamada|faz uma call|chamada de voz|chamada de video|videochamada)\b/.test(t)) {
    const video = /\b(video|v[ií]deo|videocall|videochamada)\b/.test(t);
    const grupo = /\bgrupo\b/.test(t);
    return { acao: grupo ? 'ligarGrupo' : 'ligar', valor: video ? 'video' : 'voice' };
  }

  return null;
}

// ── Executores ──────────────────────────────────────────────

/**
 * v6.66 — Descobre QUAL é a comunidade, sem depender de a AURA a ter
 * criado nesta sessão (o Render reinicia e o Map em memória esvazia).
 *
 * Ordem: mãe deste grupo → guardada no MongoDB → a última que criei →
 * varrimento (1 query). Se só houver uma comunidade, é essa.
 */
async function _descobrirComunidade(sock, ctx, jid, emGrupo) {
  const C = require('../bot/rpg/community');

  // 1. Estou dentro de um grupo que já pertence a uma comunidade?
  if (emGrupo) {
    try {
      const meta = await sock.groupMetadata(jid);
      const parent = meta?.linkedParent || meta?.parentGroup;
      if (parent) return { jid: parent, nome: 'esta comunidade' };
    } catch {}
  }

  // 2. Já adoptada e guardada no MongoDB?
  // v6.66: confirma que ainda existe. Se o Dono a apagou, o JID em
  // cache fica morto e daria "item-not-found" para sempre.
  try {
    await C.loadState();
    const guardada = C.getCommunityJid();
    if (guardada) {
      let viva = true;
      try {
        const meta = typeof sock.communityMetadata === 'function'
          ? await sock.communityMetadata(guardada)
          : await sock.groupMetadata(guardada);
        viva = !!meta;
      } catch { viva = false; }

      if (viva) return { jid: guardada, nome: 'DARK VILLE' };
      await C.forgetCommunity();   // apagada → esquece e procura outra
    }
  } catch {}

  // 3. Criada nesta sessão?
  const recente = _ultimaComunidade.get(String(ctx?.senderNumber || ''));
  if (recente) return { jid: recente, nome: 'a comunidade' };

  // 4. Varre o WhatsApp (1 query).
  try {
    const scan = await C.scanCommunities(sock);
    if (scan.ok && scan.comunidades.length === 1) {
      const c = scan.comunidades[0];
      return { jid: c.id, nome: c.subject || 'a comunidade' };
    }
    if (scan.ok && scan.comunidades.length > 1) {
      const pref = scan.comunidades.find(c => /dark|ville/i.test(c.subject || ''));
      if (pref) return { jid: pref.id, nome: pref.subject };
      return {
        jid: null,
        erro: 'Tenho várias comunidades: ' + scan.comunidades.map(c => c.subject).join(', ') +
              '. Diz-me qual — ou usa *!darkrpg <nome>* para eu fixar uma.',
      };
    }
  } catch {}

  return {
    jid: null,
    erro: 'Não encontrei nenhuma comunidade onde eu esteja. Adiciona-me à comunidade primeiro (e dá-me admin).',
  };
}

async function executar(acao, valor, { sock, ctx }) {
  const jid = ctx?.remoteJid;
  const emGrupo = !!ctx?.isGroup;

  switch (acao) {
    case 'criarGrupo': {
      if (!valor) return { ok: false, msg: 'Diz-me o nome do grupo. Ex: *cria um grupo chamado Família*' };
      const donoJid = ctx.senderJid || `${ctx.senderNumber}@s.whatsapp.net`;

      // v6.66: se houver comunidade adoptada, o grupo nasce lá dentro
      // (é o que o Dono espera). Sem comunidade, grupo normal.
      const C = require('../bot/rpg/community');
      let commJid = null, commNome = '';
      try {
        await C.loadState();
        commJid = C.getCommunityJid();
        if (commJid) commNome = 'DARK VILLE';
      } catch {}

      const g = await C.createNamedGroup(sock, valor, donoJid, commJid, { forcarLink: !!commJid });
      if (!g.ok) {
        const limitado = /rate-overlimit|429/i.test(String(g.error));
        return {
          ok: false,
          msg: limitado
            ? 'O WhatsApp travou-me por criar grupos a mais. Espera ~1h e pede outra vez.'
            : `Não consegui criar o grupo: ${g.error}`,
        };
      }

      let link = '';
      try {
        const code = await sock.groupInviteCode(g.jid);
        if (code) link = `\nhttps://chat.whatsapp.com/${code}`;
      } catch {}

      const onde = commJid ? ` dentro da comunidade *${commNome}*` : '';
      return { ok: true, msg: `Pronto, criei o grupo *${valor}*${onde} e já te meti lá dentro.${link}` };
    }

    case 'criarCanal': {
      // v7.14: "cria um canal e me manda o link" — o pedido do link NÃO é
      // o nome do canal. Tira-se o rabo da frase; sem nome usa o do bot.
      let nome = String(valor || '')
        .replace(/\s*[,;]?\s*(?:e|e a[íi]|e depois)\s*(?:me\s+)?(?:manda|mandar|envia|enviar|manda-?me|envia-?me)\s+o\s+link\.?\s*$/i, '')
        .replace(/\s*[,;]?\s*(?:me\s+)?(?:manda|mandar|envia|enviar|manda-?me|envia-?me)\s+o\s+link\.?\s*$/i, '')
        .trim();
      if (!nome) nome = String(ctx?.botName || 'DARK BOT');

      if (typeof sock.newsletterCreate !== 'function' && typeof sock.query !== 'function') {
        return { ok: false, msg: 'A minha versão do WhatsApp não deixa criar canais.' };
      }

      // v7.10: aceita descrição: "cria um canal chamado X com a descrição Y"
      let desc = `Canal do ${ctx?.botName || 'DARK BOT'}`;
      const mDesc = nome.match(/^(.{2,60}?)\s+(?:com a|com|de)\s+descri[çc][aã]o\s+(?:de\s+)?["'“”]?(.+)$/i);
      if (mDesc) { nome = mDesc[1].trim(); desc = mDesc[2].trim(); }

      const canais = require('./auraCanais');

      // v7.14: cria pelo caminho seguro — o newsletterCreate do fork
      // rebenta em `thread.picture.id` porque um canal novo tem picture=null.
      let n = null;
      try {
        n = await canais.criarCanalSeguro(sock, nome, desc);
      } catch (e) {
        return { ok: false, msg: `Não consegui criar o canal: ${String(e?.message || e).slice(0, 80)}` };
      }
      // fallback: fork sem os internals que o caminho seguro precisa
      if (!n) {
        try {
          n = await sock.newsletterCreate(nome, desc);
        } catch (e) {
          return { ok: false, msg: 'Não consegui criar o canal agora. Tenta outra vez.' };
        }
      }

      const id = n?.id || n?.jid || '';
      const invite = n?.invite || n?.inviteCode || '';

      // v7.10: lembra o canal para "muda o nome do MEU canal" funcionar
      if (id) {
        try {
          await canais.guardarCanal({
            jid: canais.normJid(id),
            name: n?.name || nome,
            description: n?.description || desc,
            invite,
            criadoEm: Date.now(),
          });
        } catch { /* sem persistência não bloqueia */ }
      }

      return {
        ok: true,
        msg: `Criei o canal *${nome}*.` +
             (invite ? `\n🔗 https://whatsapp.com/channel/${invite}` : (id ? `\nID: ${id}` : '')) +
             '\n\nAgora posso gerir: *muda o nome do meu canal*, *muda a descrição*, *põe a foto*, *estatísticas do canal*.',
      };
    }

    // ── v6.61: COMUNIDADES ────────────────────────────────
    // A API do Baileys tem communityCreate/communityCreateGroup/
    // communityLinkGroup, mas o bot nunca as usava — por isso
    // "criar comunidade" nunca funcionou.
    case 'criarComunidade': {
      if (!valor) return { ok: false, msg: 'Diz-me o nome. Ex: *cria uma comunidade chamada Dark Net*' };
      if (typeof sock.communityCreate !== 'function') {
        return { ok: false, msg: 'A minha versão do WhatsApp não deixa criar comunidades.' };
      }
      const c = await sock.communityCreate(valor, `Comunidade do ${ctx?.botName || 'DARK BOT'}`);
      const cid = c?.id || c?.jid || '';
      if (!cid) return { ok: false, msg: 'Pedi para criar mas o WhatsApp não devolveu a comunidade.' };

      // guarda a última comunidade — para "cria um grupo na comunidade"
      _ultimaComunidade.set(String(ctx?.senderNumber || ''), cid);

      let link = '';
      try {
        const code = await sock.communityInviteCode?.(cid);
        if (code) link = `\nhttps://chat.whatsapp.com/${code}`;
      } catch {}

      return {
        ok: true,
        msg: `Criei a comunidade *${valor}*.${link}\n\n` +
             `Agora podes dizer *"cria um grupo na comunidade chamado X"*.`,
      };
    }

    case 'grupoNaComunidade': {
      if (!valor) return { ok: false, msg: 'Diz o nome do grupo. Ex: *cria um grupo na comunidade chamado Avisos*' };

      const C = require('../bot/rpg/community');
      const donoJid = ctx.senderJid || `${ctx.senderNumber}@s.whatsapp.net`;

      // v6.66: já não depende de eu ter criado a comunidade nesta
      // sessão. Procuro-a: a mãe deste grupo → a guardada no
      // MongoDB → a única onde eu esteja.
      const comunidade = await _descobrirComunidade(sock, ctx, jid, emGrupo);
      if (!comunidade.jid) return { ok: false, msg: comunidade.erro };

      // Garante que o Dono está lá dentro e é admin. Se o WhatsApp
      // não deixar adicionar, manda o convite.
      const dono = await C.ensureOwnerInCommunity(sock, comunidade.jid, donoJid);

      // v6.67: já não desiste ao primeiro erro — tenta criar dentro,
      // depois pela API, depois cria solto e liga a seguir.
      const g = await C.createNamedGroup(sock, valor, donoJid, comunidade.jid, { forcarLink: true });
      if (!g.ok) {
        return {
          ok: false,
          msg: g.limitado
            ? 'O WhatsApp travou-me por criar grupos a mais. Espera ~1h e pede outra vez.'
            : `Não consegui criar o grupo *${valor}*: ${g.error}` +
              (g.via?.length ? `\n\nTentei por: ${g.via.join(' → ')}` : ''),
        };
      }

      _ultimaComunidade.set(String(ctx?.senderNumber || ''), comunidade.jid);

      let link = '';
      try {
        const code = await sock.groupInviteCode(g.jid);
        if (code) link = `\nhttps://chat.whatsapp.com/${code}`;
      } catch {}

      let extra = '';
      if (dono.acoes?.length) extra = '\n\n' + dono.acoes.map(a => '▸ ' + a).join('\n');
      if (dono.convite) extra += `\n${dono.convite}`;

      // Criou mas não conseguiu ligar → diz a verdade, não finge.
      if (!g.ligado) {
        return {
          ok: true,
          msg: `Criei o grupo *${valor}*, mas não consegui metê-lo na comunidade ` +
               `*${comunidade.nome}*.${link}\n\nProvavelmente não sou admin da comunidade. ` +
               `Dá-me admin e diz *"liga o grupo ${valor} à comunidade"*.${extra}`,
        };
      }

      return {
        ok: true,
        msg: `Criei o grupo *${valor}* dentro da comunidade *${comunidade.nome}*.${link}${extra}`,
      };
    }

    // v6.67: "liga o grupo X à comunidade" — o grupo já existe.
    case 'ligarGrupoNomeado': {
      if (!valor) return { ok: false, msg: 'Diz qual grupo. Ex: *liga o grupo Arena à comunidade*' };
      const C = require('../bot/rpg/community');
      const c = await _descobrirComunidade(sock, ctx, jid, emGrupo);
      if (!c.jid) return { ok: false, msg: c.erro };

      const r = await C.linkExistingGroup(sock, valor, c.jid);
      if (!r.ok) return { ok: false, msg: `Não consegui ligar *${valor}*: ${r.error}` };
      return { ok: true, msg: `Meti o grupo *${r.nome}* na comunidade *${c.nome}*.` };
    }

    case 'ligarComunidade': {
      if (!emGrupo) return { ok: false, msg: 'Isto só dá dentro de um grupo.' };
      if (typeof sock.communityLinkGroup !== 'function') {
        return { ok: false, msg: 'A minha versão do WhatsApp não deixa isso.' };
      }
      // v6.66: descobre a comunidade em vez de exigir que eu a tenha criado.
      const c = await _descobrirComunidade(sock, ctx, jid, false);
      if (!c.jid) return { ok: false, msg: c.erro };
      try {
        await sock.communityLinkGroup(jid, c.jid);
      } catch (e) {
        return { ok: false, msg: `Não consegui ligar: ${e.message}` };
      }
      return { ok: true, msg: `Liguei este grupo à comunidade *${c.nome}*.` };
    }

    // v6.66: "manda o convite da comunidade"
    case 'conviteComunidade': {
      const C = require('../bot/rpg/community');
      const donoJid = ctx.senderJid || `${ctx.senderNumber}@s.whatsapp.net`;
      const c = await _descobrirComunidade(sock, ctx, jid, emGrupo);
      if (!c.jid) return { ok: false, msg: c.erro };

      const dono = await C.ensureOwnerInCommunity(sock, c.jid, donoJid);
      const link = dono.convite || await C.getCommunityInvite(sock, c.jid);

      if (!link) {
        return {
          ok: false,
          msg: `Encontrei a comunidade *${c.nome}* mas o WhatsApp não me deu o link. ` +
               'Preciso de ser admin dela.',
        };
      }
      const estado = dono.dentro
        ? (dono.admin ? 'Já estás lá dentro e és admin.' : 'Já estás lá dentro.')
        : 'Ainda não estás lá — entra por aqui:';
      return { ok: true, msg: `Comunidade *${c.nome}*.\n${estado}\n${link}` };
    }

    case 'nomeGrupo': {
      if (!emGrupo) return { ok: false, msg: 'Isto só dá dentro de um grupo.' };
      if (!valor) return { ok: false, msg: 'Diz para que nome. Ex: *muda o nome do grupo para X*' };
      await sock.groupUpdateSubject(jid, valor);
      return { ok: true, msg: `Mudei o nome para *${valor}*.` };
    }

    case 'descricaoGrupo': {
      if (!emGrupo) return { ok: false, msg: 'Isto só dá dentro de um grupo.' };
      if (!valor) return { ok: false, msg: 'Diz qual é a descrição. Ex: *muda a descrição para X*' };
      await sock.groupUpdateDescription(jid, valor);
      return { ok: true, msg: 'Descrição actualizada.' };
    }

    case 'fecharGrupo': {
      if (!emGrupo) return { ok: false, msg: 'Isto só dá dentro de um grupo.' };
      await sock.groupSettingUpdate(jid, 'announcement');
      return { ok: true, msg: 'Fechei o grupo. Agora só os admins podem falar.' };
    }

    case 'abrirGrupo': {
      if (!emGrupo) return { ok: false, msg: 'Isto só dá dentro de um grupo.' };
      await sock.groupSettingUpdate(jid, 'not_announcement');
      return { ok: true, msg: 'Abri o grupo. Toda a gente pode falar.' };
    }

    case 'linkGrupo': {
      if (!emGrupo) return { ok: false, msg: 'Isto só dá dentro de um grupo.' };
      const code = await sock.groupInviteCode(jid);
      return { ok: true, msg: `Aqui está:\nhttps://chat.whatsapp.com/${code}` };
    }

    case 'sairGrupo': {
      if (!emGrupo) return { ok: false, msg: 'Isto só dá dentro de um grupo.' };
      await sock.sendMessage(jid, { text: 'Até depois. 🌹' });
      await sock.groupLeave(jid);
      return { ok: true, msg: null }; // já se despediu
    }

    case 'nomePerfil': {
      if (!valor) return { ok: false, msg: 'Diz para que nome.' };
      if (typeof sock.updateProfileName !== 'function') return { ok: false, msg: 'Não consigo mudar o nome agora.' };
      await sock.updateProfileName(valor);
      return { ok: true, msg: `Mudei o meu nome para *${valor}*.` };
    }

    case 'recado': {
      if (!valor) return { ok: false, msg: 'Diz qual é o recado.' };
      if (typeof sock.updateProfileStatus !== 'function') return { ok: false, msg: 'Não consigo mudar o recado agora.' };
      await sock.updateProfileStatus(valor);
      return { ok: true, msg: 'Recado actualizado.' };
    }

    case 'ligar': {
      // v7.43: chamada de voz REAL (VoIP) quando a lib suporta — ela liga,
      // espera atender e cumprimenta na própria chamada.
      try {
        const voip = require('../bot/callVoip');
        if (voip.suportado(sock) && valor !== 'video' && ctx.isOwner) {   // v7.44: só o Dono
          const _n = String(ctx.senderNumber || '').replace(/\D/g, '');
          const alvoV = emGrupo ? (_n ? _n + '@s.whatsapp.net' : ctx.senderJid) : jid;
          sock.sendMessage(jid, { text: 'A ligar… atende aí! 📞' }).catch(() => {});
          const rv = await voip.ligar(sock, alvoV);
          if (rv.ok) {
            setTimeout(() => voip.falar(sock, alvoV, 'Oi. Estou aqui. Diz-me que música queres ouvir, ou fala comigo por áudio.').catch(() => {}), 1200);
            return { ok: true, msg: 'Estou na chamada. 🎧 Pede-me uma música ("toca X") quando quiseres.' };
          }
          if (/atendeu|recusou/.test(rv.motivo || '')) return { ok: true, msg: 'Liguei e não atendeste… 😕 Quando quiseres, diz "liga-me" outra vez.' };
        }
      } catch (e) { console.warn('[Aura ligar voip]', e.message?.slice(0, 60)); }
      const bridge = require('../bot/callBridge');
      // v6.75 — em grupo o ctx.senderJid vem como @lid e o <offer> rebenta
      // com "No sessions". Para chamadas usa-se SEMPRE o número (PN).
      const _num = String(ctx.senderNumber || '').replace(/\D/g, '');
      const alvo = emGrupo
        ? (_num ? _num + '@s.whatsapp.net' : ctx.senderJid)
        : jid;
      const r = await bridge.tentarLigar(sock, alvo, { tipo: valor || 'voice', pushName: ctx.pushName || '' });
      const tipo = (valor === 'video') ? 'vídeo' : 'voz';
      return {
        ok: true,
        msg: r.ok
          ? `Já te liguei em ${tipo}. Atende — se a chamada nativa não abrir, manda áudio que eu estou na linha.`
          : `Tentei ligar em ${tipo}. Manda um áudio que eu atendo já.`,
      };
    }

    case 'ligarGrupo': {
      if (!emGrupo) return { ok: false, msg: 'Isto só dá dentro de um grupo.' };
      try {
        const voip = require('../bot/callVoip');
        if (voip.suportado(sock)) {
          const rv = await voip.ligar(sock, jid);
          if (rv.ok) return { ok: true, msg: 'Abri a chamada de voz no grupo (até 6 pessoas). Entrem! 📞 Pede-me músicas com "toca X".' };
        }
      } catch {}
      const bridge = require('../bot/callBridge');
      await bridge.ligarGrupo(sock, jid);
      return { ok: true, msg: 'Abri a chamada no grupo. Entram pelo link / botão de chamada.' };
    }

    // ════ v7.9 ETAPA 3 — INFORMAÇÃO DA COMUNIDADE ════

    case 'infoComunidade': {
      if (!emGrupo) return { ok: false, msg: 'Diz-me dentro de um grupo da comunidade (ou diz *"cria uma comunidade"*).' };
      if (typeof sock.communityMetadata !== 'function') {
        return { ok: false, msg: 'A minha versão do WhatsApp não lê comunidades.' };
      }
      const c = await _descobrirComunidade(sock, ctx, jid, false);
      if (!c.jid) return { ok: false, msg: c.erro || 'Este grupo não está numa comunidade.' };
      try {
        const m = await sock.communityMetadata(c.jid);
        const linhas = [`Comunidade *${c.nome}*`];
        if (m && m.desc) linhas.push(m.desc);
        const membros = m ? (m.size ?? m.participants?.length) : 0;
        if (typeof membros === 'number') linhas.push(`👥 ${membros} membros`);
        return { ok: true, msg: linhas.join('\n\n') };
      } catch (e) {
        return { ok: true, msg: `Comunidade *${c.nome}*. (Não consegui mais detalhes: ${String(e?.message || e).slice(0, 60)})` };
      }
    }

    case 'gruposComunidade': {
      if (!emGrupo) return { ok: false, msg: 'Diz-me dentro de um grupo da comunidade.' };
      if (typeof sock.communityMetadata !== 'function') {
        return { ok: false, msg: 'A minha versão do WhatsApp não lê comunidades.' };
      }
      const c = await _descobrirComunidade(sock, ctx, jid, false);
      if (!c.jid) return { ok: false, msg: c.erro || 'Este grupo não está numa comunidade.' };
      try {
        const m = await sock.communityMetadata(c.jid);
        const ps = (m && m.participants) || [];
        // na comunidade os grupos aparecem como participantes com jid de grupo
        const grupos = ps.filter(p => p && p.id && /@g\.us$/.test(p.id));
        if (!grupos.length) return { ok: true, msg: `A comunidade *${c.nome}* não tem grupos ligados ainda.` };
        return { ok: true, msg: `Grupos da comunidade *${c.nome}*:\n` + grupos.map(g => '▸ ' + g.id.split('@')[0]).join('\n') };
      } catch (e) {
        return { ok: false, msg: `Não consegui listar os grupos: ${String(e?.message || e).slice(0, 60)}` };
      }
    }

    default:
      return { ok: false, msg: null };
  }
}

module.exports = { detectarAcao, executar, extrairNome, extrairPara, ePedidoLinkGrupo, norm, _ultimaComunidade };
