'use strict';
/**
 * AURA BRAIN — v6.81
 * ═══════════════════════════════════════════════════════════
 * O motor que faz a AURA capaz de MUITAS coisas em vez de
 * poucas. Três camadas, por ordem de custo:
 *
 *   1. MODOS      — estado por chat (só áudio, ignorar alguém,
 *                   só o Dono, reagir a tudo...). Custo: 0 ms.
 *   2. CATÁLOGO   — ~130 capacidades reais, cada uma com os
 *                   gatilhos naturais em PT. Custo: 0 ms.
 *   3. ROUTER IA  — só quando 1 e 2 falham E a frase parece uma
 *                   ordem. A IA escolhe a capacidade e extrai os
 *                   argumentos. Custo: ~1 s, e SÓ nesses casos.
 *
 * REGRA DE OURO (o Dark exigiu velocidade): a camada 3 nunca
 * corre em conversa normal. `pareceOrdem()` é o portão — se a
 * frase não tiver verbo de comando, nem se toca na IA.
 *
 * As acções não são reescritas aqui: `megaActions.js` já tinha
 * ~130 funções prontas que nunca ninguém chamava. Isto liga-as.
 */

const mega = require('./actions/megaActions');
const adv = require('./actions/advancedActions');

// ── Estado por chat ─────────────────────────────────────────
// Tudo o que é "modo" vive aqui: um Map por chat, com limpeza.
// Nada disto toca no MongoDB no caminho da mensagem — ler um
// Map é ~0 ms e a promessa ao Dark foi não abrandar nada.
const _modos = new Map();   // jid -> { soAudio, soDono, semReagir, reagirTudo, mudo, ignorados:Set }
const MODOS_MAX = 500;

function modos(jid) {
  if (!jid) return {};
  let m = _modos.get(jid);
  if (!m) {
    m = { soAudio: false, soDono: false, semReagir: false, reagirTudo: false, mudo: false, ignorados: new Set() };
    if (_modos.size >= MODOS_MAX) _modos.delete(_modos.keys().next().value);
    _modos.set(jid, m);
  }
  return m;
}

function setModo(jid, chave, valor) {
  const m = modos(jid);
  m[chave] = valor;
  return m;
}

function ignorar(jid, numero) {
  modos(jid).ignorados.add(String(numero).replace(/\D/g, ''));
}
function designorar(jid, numero) {
  modos(jid).ignorados.delete(String(numero).replace(/\D/g, ''));
}
function estaIgnorado(jid, numero) {
  const m = _modos.get(jid);
  if (!m || !m.ignorados.size) return false;
  return m.ignorados.has(String(numero).replace(/\D/g, ''));
}
function limparModos() { _modos.clear(); }

// ── Normalização ────────────────────────────────────────────
function norm(s) {
  return String(s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ').trim();
}

/**
 * O PORTÃO. Só passa daqui o que cheira a ordem.
 * Sem isto, cada "bom dia" acordava a IA e metia 1 s em tudo.
 */
const VERBO_ORDEM = new RegExp(
  '\\b(' +
  'faz|fazer|cria|criar|manda|mandar|envia|enviar|poe|poem|por|coloca|mete|' +
  'muda|mudar|troca|trocar|altera|alterar|define|definir|configura|' +
  'liga|ligar|desliga|desligar|ativa|activa|ativar|activar|desativa|desactiva|' +
  'abre|abrir|fecha|fechar|tranca|destranca|' +
  'apaga|apagar|remove|remover|elimina|tira|tirar|limpa|limpar|' +
  'bane|banir|expulsa|expulsar|kicka|chuta|' +
  'promove|promover|rebaixa|rebaixar|adiciona|adicionar|' +
  'marca|marcar|menciona|mencionar|' +
  'reage|reagir|reaja|responde|responder|' +
  'ignora|ignorar|bloqueia|bloquear|silencia|silenciar|cala|' +
  'sai|sair|entra|entrar|junta|' +
  'posta|postar|publica|publicar|partilha|' +
  'segue|seguir|deixa de seguir|' +
  'xinga|xingar|zoa|zoar|humilha|insulta|provoca|' +
  'agenda|agendar|programa|marca para|' +
  'lembra|lembrar|esquece|esquecer|guarda|memoriza|' +
  'procura|procurar|pesquisa|pesquisar|busca|' +
  'baixa|baixar|descarrega|download|' +
  'traduz|traduzir|resume|resumir|' +
  'gera|gerar|desenha|desenhar|' +
  'fixa|fixar|arquiva|arquivar|' +
  'vai|ve|olha|verifica|mostra|mostre|mostrar|fala|falar|diz|diga|avisa|anuncia|chama|' +
  'para de|deixa de|comeca a|passa a' +
  ')\\b', 'i');

function pareceOrdem(texto) {
  const t = norm(texto);
  if (!t || t.length < 3 || t.length > 300) return false;
  return VERBO_ORDEM.test(t);
}

/**
 * CATÁLOGO DE CAPACIDADES
 * ───────────────────────
 * Cada entrada: id, gatilhos (regex ou null se só via IA),
 * o que faz, que argumento precisa e quem pode.
 *
 * `nivel`: 'dono' | 'admin' | 'todos'
 * `arg`  : 'nenhum' | 'depois' | 'alvo' | 'texto' | 'emoji'
 * `risco`: 'seguro' | 'destrutivo'  (destrutivo pede confirmação)
 */
const CAPACIDADES = [
  // ══ v7.43 — CHAMADA DE VOZ REAL ══════════════════════════
  {
    id: 'call_tocar', nivel: 'dono', arg: 'depois', risco: 'seguro',
    desc: 'Tocar uma música na chamada de voz activa ("toca X na call")',
    gatilhos: [/\b(toca|tocar|poe|põe|coloca|mete)\b.{0,40}\b(na (call|chamada|liga[cç][aã]o)|aqui na call)\b/, /\b(na (call|chamada))\b.{0,20}\b(toca|poe|põe|coloca)\b/],
  },
  {
    id: 'call_falar', nivel: 'dono', arg: 'depois', risco: 'seguro',
    desc: 'Dizer algo em voz alta na chamada activa ("diz na call que…")',
    gatilhos: [/\b(diz|fala|grita|anuncia)\b.{0,10}\bna (call|chamada)\b/],
  },
  {
    id: 'call_parar', nivel: 'dono', arg: 'nenhum', risco: 'seguro',
    desc: 'Parar a música que está a tocar na chamada',
    gatilhos: [/\b(para|pára|parar|pausa|stop)\b.{0,12}\b(a )?(musica|música|som|call)\b/, /\b(cala|tira) (a|essa) (musica|música)\b/],
  },
  {
    id: 'call_desligar', nivel: 'dono', arg: 'nenhum', risco: 'seguro',
    desc: 'Desligar/terminar a chamada de voz',
    gatilhos: [/\b(desliga|desligar|termina|encerra|sai d[ae])\b.{0,10}\b(a )?(call|chamada|liga[cç][aã]o)\b/, /^\s*(aura[, ]*)?desliga\s*$/],
  },
  // ══ v7.11 ETAPA 5 — VER O GRUPO (histórico) ══════════════
  {
    id: 'quem_escreveu', nivel: 'todos', arg: 'depois', risco: 'seguro',
    desc: 'Dizer quem escreveu uma mensagem (citada ou por texto exacto)',
    gatilhos: [/\bquem\b.{0,10}\b(escreveu|mandou|enviou|digitou|disse)\b/],
  },
  {
    id: 'o_que_escreveu', nivel: 'todos', arg: 'depois', risco: 'seguro',
    desc: 'Mostrar as últimas mensagens de uma pessoa no grupo',
    gatilhos: [
      /\b(o que|mostra o que|que)\b.{0,10}\b(?:e que\s+)?(?:o|a|ao)\s+@?[a-z0-9_\-]{2,30}\s+(?:escreveu|disse|mandou|falou|enviou)\b/,
      /\b(o que|mostra o que)\b.{0,10}\b(?:escreveu|disse|mandou|falou)\s+(?:o|a)\s+@?[a-z0-9_\-]{2,30}\b/,
    ],
  },
  {
    id: 'falar_com', nivel: 'dono', arg: 'depois', risco: 'moderado',
    desc: 'Falar apenas com uma pessoa (menciona só ela)',
    gatilhos: [
      /\b(fala|responde|escreve|manda)\b.{0,14}\b(so|somente|apenas)\b.{0,14}\b(com|para|pra|pro|ao|a)\b/,
      /\b(responde)\b.{0,10}\b(a|ao)\s+@?(?!toda|todos|todo mundo|ninguem|gente)\S+/,
      /\b(fala|escreve|manda)\b.{0,12}\b(com|para|pra|pro|ao)\s+(o|a|ao|a)\s+@?\S+(?!.{0,16}\b(todos|toda a gente|todo mundo|ninguem)\b)/,
    ],
  },
  {
    id: 'falar_com_todos', nivel: 'dono', arg: 'depois', risco: 'moderado',
    desc: 'Falar com todos do grupo (menciona toda a gente; "escondidas" = hidetag real)',
    gatilhos: [
      /\b(diz|diga|avisa|anuncia|manda|chama|menciona|marca)\b.{0,10}\b(a todos|a toda a gente|todos do grupo|ao grupo todo|todos aqui|todo mundo|todos)\b/,
      /\b(chama|menciona|marca) todos\b/,
      /\bfala com todos\b.{0,12}\b(que|dizendo|e diz|:)\b/,
      /\btodos\b.{0,14}\b(escondidas?|hidetag|sem marcar)\b/,
      /\b(menciona|marca)\b.{0,20}\b(escondidas?|hidetag)\b/,
    ],
  },
  {
    // v6.85 — "Aura quem é o dark mark ele": identifica a pessoa no
    // grupo e marca-a. Antes caía na IA e virava "Diz outra vez...".
    id: 'marcar_pessoa', nivel: 'dono', arg: 'depois', risco: 'seguro',
    desc: 'Dizer quem é uma pessoa do grupo e marcá-la',
    gatilhos: [
      /\bquem\s+[ée]\s.{0,30}\b(marca|mark|aponta|menciona)\b/,
      /\b(marca|mark|aponta|menciona)\s+(o|a|ele|ela)\b/,
      /\bquem\s+[ée]\s+(o|a)\s+[a-z0-9_~|.\-]{2,30}\b/i,
    ],
  },

  // ══ MODOS DE COMPORTAMENTO (o que o Dark pediu) ═══════════
  {
    id: 'modo_so_audio', nivel: 'dono', arg: 'nenhum', risco: 'seguro',
    desc: 'Passar a responder só com áudio neste chat',
    gatilhos: [/\b(so|somente|apenas|mais)\b.{0,12}\b(audio|voz)\b/, /\bresponde\b.{0,12}\b(em|com|por)\b.{0,6}\b(audio|voz)\b/, /\bmanda\b.{0,12}\bapenas audio\b/],
  },
  {
    id: 'modo_so_texto', nivel: 'dono', arg: 'nenhum', risco: 'seguro',
    desc: 'Voltar a responder em texto',
    gatilhos: [/\b(para|deixa|chega)\b.{0,14}\b(audio|voz)\b/, /\b(so|somente|apenas)\b.{0,10}\btexto\b/, /\bvolta\b.{0,12}\btexto\b/],
  },
  {
    id: 'modo_so_dono', nivel: 'dono', arg: 'nenhum', risco: 'seguro',
    desc: 'Só responder ao Dark, ignorar toda a gente',
    gatilhos: [/\bnao responde\b.{0,18}\b(ninguem|ninguem aqui|mais ninguem)\b/, /\b(so|somente|apenas)\b.{0,12}\b(a mim|comigo|ao dark|pra mim|para mim)\b/, /\bignora\b.{0,10}\b(todos|toda a gente|o resto|os outros)\b/],
  },
  {
    id: 'modo_todos', nivel: 'dono', arg: 'nenhum', risco: 'seguro',
    desc: 'Voltar a responder a toda a gente',
    gatilhos: [/\b(responde|fala)\b.{0,14}\b(a todos|com todos|toda a gente|normal)\b/, /\b(para|deixa)\b.{0,12}\bde ignorar\b/],
  },
  {
    id: 'modo_nao_reagir', nivel: 'dono', arg: 'nenhum', risco: 'seguro',
    desc: 'Parar de reagir com emojis',
    // v6.82: faltava "reajas"/"reages" — "nao reajas com emojis" caía no vazio.
    gatilhos: [/\bnao rea(ge|ges|gir|ja|jas)\b/, /\b(para|deixa|chega)\b.{0,14}\breagir\b/, /\bsem emoji/],
  },
  {
    id: 'modo_reagir_tudo', nivel: 'dono', arg: 'nenhum', risco: 'seguro',
    desc: 'Reagir com emoji a todas as mensagens',
    gatilhos: [/\brea(ge|ja|gir)\b.{0,16}\b(com emojis|nas mensagens|a tudo|em tudo|todas as|todas)\b/, /\b(poe|comeca a|passa a)\b.{0,12}\breagir\b/],
  },
  {
    id: 'modo_mudo', nivel: 'dono', arg: 'nenhum', risco: 'seguro',
    desc: 'Ficar calada neste chat',
    gatilhos: [/\b(fica|cala|silencio|shh)\b.{0,10}\b(calada|quieta|em silencio)\b/, /\bnao fales?\b.{0,10}\b(mais|aqui)\b/],
  },
  {
    id: 'modo_falar', nivel: 'dono', arg: 'nenhum', risco: 'seguro',
    desc: 'Voltar a falar',
    gatilhos: [/\b(podes|pode|volta a)\b.{0,10}\bfalar\b/, /\b(fim|acabou)\b.{0,12}\bsilencio\b/],
  },
  {
    id: 'ignorar_pessoa', nivel: 'dono', arg: 'alvo', risco: 'seguro',
    desc: 'Ignorar uma pessoa específica',
    gatilhos: [/\b(nao responde|ignora|nao fala com)\b.{0,20}\b(ele|ela|esse|essa|este|esta)\b/],
  },
  {
    id: 'designorar_pessoa', nivel: 'dono', arg: 'alvo', risco: 'seguro',
    desc: 'Voltar a responder a essa pessoa',
    gatilhos: [/\b(volta a|podes)\b.{0,14}\b(responder|falar)\b.{0,14}\b(ele|ela|esse|essa)\b/],
  },

  // ══ ATITUDE (xingar, zoar) ════════════════════════════════
  {
    id: 'xingar', nivel: 'dono', arg: 'alvo', risco: 'seguro',
    desc: 'Xingar/insultar alguém com força',
    gatilhos: [/\bxinga/, /\bxingar\b/, /\binsulta/, /\bhumilha/, /\bmanda(-| )lhe?\b.{0,10}\b(uns|umas)\b/, /\bda(-| )lhe?\b.{0,12}\bporrada verbal\b/],
  },
  {
    id: 'zoar', nivel: 'dono', arg: 'alvo', risco: 'seguro',
    desc: 'Zoar/gozar com alguém, com humor',
    gatilhos: [/\bzoa/, /\bzoar\b/, /\bgoza/, /\btroca\b.{0,8}\bdele\b/, /\bmete(-| )te?\b.{0,10}\bcom ele\b/, /\bprovoca\b/, /\btira (sarro|onda)\b/],
  },
  {
    id: 'respeitar', nivel: 'todos', arg: 'alvo', risco: 'seguro',
    desc: 'Tratar essa pessoa com respeito',
    gatilhos: [/\b(me |m |te )?respeita(r|me)?\b/],
  },
  {
    id: 'elogiar', nivel: 'dono', arg: 'alvo', risco: 'seguro',
    desc: 'Elogiar alguém',
    gatilhos: [/\belogia\b/, /\bda um gas\b/, /\banima\b.{0,10}\b(ele|ela)\b/],
  },

  // ══ REACÇÕES ══════════════════════════════════════════════
  {
    id: 'reagir_msg', nivel: 'todos', arg: 'emoji', risco: 'seguro',
    desc: 'Reagir a esta mensagem com um emoji',
    // v6.82: o "(?!.*canal)" evita roubar as frases de canal, que são
    // tratadas por canal_reagir/entrar_link mais abaixo no catálogo.
    gatilhos: [
      /^(?!.*\bcanal\b)(?=.*\breage\b.{0,20}\bcom\b)/,
      /^(?!.*\bcanal\b)(?=.*\bpoe\b.{0,10}\b(um|uma)?\s*(emoji|reacao)\b)/,
    ],
  },

  // ══ STATUS / STORIES ══════════════════════════════════════
  {
    id: 'postar_status', nivel: 'dono', arg: 'texto', risco: 'seguro',
    desc: 'Publicar um status/story (texto ou a imagem enviada)',
    gatilhos: [/\b(posta|publica|poe|coloca|bota)\b.{0,20}\b(status|estado|story|stories)\b/, /\bstatus\b.{0,16}\b(com|dessa|desta|essa foto)\b/],
  },
  {
    // v7.9 ETAPA 3: LER o recado/status de alguém via USync.
    // "qual é o meu recado", "qual é o teu status", "status do @fulano".
    id: 'ver_status', nivel: 'todos', arg: 'alvo', risco: 'seguro',
    desc: 'Ler o recado/status de um contacto (via USync)',
    gatilhos: [
      /\b(recado|bio)\b.{0,14}\b(meu|teu|minha|tua|diz|mostra|qual|v[eê]|o que)\b/,
      /\b(meu|teu|minha|tua)\b.{0,10}\b(recado|bio)\b/,
      /\b(status|recado)\b(?!.{0,20}\b(grupo|bot|canal|comunidade)\b).{0,16}\b(do|da|de)\b.{0,40}/,
      /\b(teu|tua|seu|sua)\b.{0,10}\b(status|estado)\b/,
    ],
  },

  // ══ CANAIS (newsletter) ═══════════════════════════════════
  {
    id: 'canal_postar', nivel: 'dono', arg: 'texto', risco: 'seguro',
    desc: 'Publicar conteúdo num canal',
    gatilhos: [/\b(vai|va)\b.{0,16}\bcanal\b.{0,24}\b(posta|publica|manda|poe)\b/, /\b(posta|publica|manda)\b.{0,16}\bno canal\b/],
  },
  {
    // v6.82: passou a funcionar mesmo. O fork tem newsletterFetchMessages
    // + newsletterReactMessage, por isso dá para varrer as publicações
    // antigas do canal e reagir a cada uma. Antes devolvia "não dá".
    id: 'canal_reagir', nivel: 'dono', arg: 'emoji', risco: 'moderado',
    desc: 'Reagir às publicações de um canal com um emoji',
    gatilhos: [/\bcanal\b.{0,30}\brea(ge|gir|ja)\b/, /\brea(ge|gir|ja)\b.{0,30}\bcanal\b/],
  },
  {
    // v7.9 ETAPA 3: deixar de seguir tem de vir ANTES de seguir,
    // senão "deixa de seguir o canal X" é lido como "seguir".
    id: 'canal_deixar', nivel: 'dono', arg: 'depois', risco: 'seguro',
    desc: 'Deixar de seguir um canal',
    gatilhos: [/\b(deixa de seguir|deixar de seguir|deixar o canal|unfollow)\b.{0,14}\b(canal|newsletter)\b/, /\b(canal|newsletter)\b.{0,14}\b(deixa de seguir|deixar de seguir|unfollow)\b/],
  },
  {
    id: 'canal_stats', nivel: 'todos', arg: 'nenhum', risco: 'seguro',
    desc: 'Estatísticas do canal do bot (seguidores, admins)',
    gatilhos: [/\b(estat[ií]sticas|stats|n[úu]meros)\b.{0,20}\b(canal|newsletter)\b/, /\b(canal|newsletter)\b.{0,20}\b(estat[ií]sticas|stats|n[úu]meros|seguidores)\b/, /\bcomo est[aá]\b.{0,10}\b(meu|o meu|nosso)\b.{0,6}\bcanal\b/],
  },
  {
    id: 'canal_info', nivel: 'todos', arg: 'depois', risco: 'seguro',
    desc: 'Informação sobre um canal (nome, descrição, seguidores)',
    gatilhos: [/\b(info|informa[çc][aã]o|detalhes|como est[aá]|sobre o canal|seguidores|subscritores)\b.{0,16}\b(canal|newsletter)\b/, /\b(canal|newsletter)\b.{0,16}\b(info|informa[çc][aã]o|detalhes|seguidores|subscritores)\b/],
  },
  {
    id: 'canal_seguir', nivel: 'dono', arg: 'depois', risco: 'seguro',
    desc: 'Seguir um canal',
    gatilhos: [/\b(segue|seguir|entra n|subscreve)\b.{0,14}\b(canal|newsletter)\b/],
  },

  // ══ v7.10 ETAPA 4 — GESTÃO DO CANAL DO BOT ══════════════
  {
    id: 'canal_renomear', nivel: 'dono', arg: 'nome', risco: 'moderado',
    desc: 'Mudar o nome do canal do bot',
    gatilhos: [/\b(muda|mudar|renomeia|renomear|altera|alterar|troca)\b.{0,20}\bnome\b.{0,16}\b(canal|newsletter)\b/, /\b(canal|newsletter)\b.{0,16}\b(muda|mudar|renomeia|renomear|altera)\b.{0,16}\bnome\b/, /\b(renomeia|renomear)\b.{0,14}\b(canal|newsletter)\b/],
  },
  {
    id: 'canal_descrever', nivel: 'dono', arg: 'texto', risco: 'moderado',
    desc: 'Mudar a descrição do canal do bot',
    gatilhos: [/\b(muda|mudar|altera|alterar|poe|põe|define|definir)\b.{0,20}\b(descri[çc][aã]o|desc|bio)\b.{0,16}\b(canal|newsletter)\b/, /\b(canal|newsletter)\b.{0,16}\b(muda|mudar|altera|alterar|define)\b.{0,16}\b(descri[çc][aã]o|desc)\b/],
  },
  {
    id: 'canal_foto', nivel: 'dono', arg: 'nenhum', risco: 'moderado',
    desc: 'Mudar a foto (fixada) do canal do bot para a imagem enviada',
    gatilhos: [/\b(muda|mudar|troca|poe|põe|coloca|altera)\b.{0,20}\b(foto|imagem|foto fixada)\b.{0,16}\b(canal|newsletter)\b/, /\b(canal|newsletter)\b.{0,16}\b(muda|mudar|troca|poe|põe|coloca)\b.{0,16}\b(foto|imagem|foto fixada)\b/],
  },
  {
    id: 'canal_tirarfoto', nivel: 'dono', arg: 'nenhum', risco: 'moderado',
    desc: 'Remover a foto do canal do bot',
    gatilhos: [/\b(tira|tirar|remove|remover|apaga)\b.{0,16}\ba foto\b.{0,16}\b(canal|newsletter)\b/, /\b(canal|newsletter)\b.{0,16}\b(tira|tirar|remove|remover)\b.{0,16}\bfoto\b/],
  },
  {
    id: 'canal_apagar', nivel: 'dono', arg: 'nenhum', risco: 'destrutivo',
    desc: 'Apagar o canal do bot (irreversível)',
    gatilhos: [/\b(apaga|apagar|elimina|eliminar|deleta|exclui)\b.{0,16}\b(canal|newsletter)\b/, /\b(canal|newsletter)\b.{0,16}\b(apaga|apagar|elimina|eliminar|deleta|exclui)\b/],
  },
  {
    id: 'canal_agendar', nivel: 'dono', arg: 'texto', risco: 'seguro',
    desc: 'Agendar publicações periódicas no canal do bot',
    gatilhos: [/\b(agenda|agendar|programa|todos os dias|diariamente|todas as)\b.{0,30}\bno canal\b/, /\bno canal\b.{0,20}\b(todos os dias|diariamente|de hora em hora|agenda|agendar)\b/],
  },

  // ══ v7.15 — ACEITAR CONVITE DE CANAL ═══════════════════════
  {
    // "aceita o link de convite do canal" — segue o link (na mensagem
    // ou o último que recebeste) em vez de fingir que entrou.
    id: 'aceitar_convite_canal', nivel: 'dono', arg: 'nenhum', risco: 'seguro',
    desc: 'Aceitar um convite de canal (segue o link do convite)',
    gatilhos: [
      /\baceita\b.{0,20}\b(convite|link|link de convite)\b.{0,20}\b(canal|newsletter)\b/,
      /\baceita\b.{0,10}\b(canal|newsletter)\b/,
      /\baceita\b.{0,10}\bo\s+convite\b/,
      /\baceita\b.{0,10}\bo\s+link\b/,
    ],
  },

  // ══ v7.13 ETAPA 6 — CANAL DE STICKERS ════════════════════
  {
    // "gere este canal <link>" tem de vir ANTES de entrar_link,
    // senão o link dispara o "entrar" simples e não adopta a gestão.
    id: 'adotar_canal', nivel: 'dono', arg: 'depois', risco: 'moderado',
    desc: 'Assumir a gestão de um canal por convite (subscribe + guardar)',
    gatilhos: [
      /whatsapp\.com\/channel\/[0-9A-Za-z_-]{15,40}[\s\S]{0,60}\b(gere|gerir|assume|assumir|adota|adotar|toma conta|meu canal)\b/,
      /\b(gere|gerir|assume|assumir|adota|adotar|toma conta)\b.{0,20}\b(canal|newsletter)\b/,
      /\b(meu canal|canal de stickers|canal do bot)\b.{0,20}(link|convite)?/,
    ],
  },
  {
    id: 'canal_perguntar', nivel: 'dono', arg: 'texto', risco: 'seguro',
    desc: 'Perguntar aos seguidores do canal o que querem (enquete ou texto)',
    gatilhos: [
      /\b(pergunta|perguntar|questiona|questionar|faz uma enquete|faz um poll)\b.{0,24}\b(seguidores|subscritores|membros do canal|no canal|canal)\b/,
      /\b(enquete|poll)\b.{0,20}\b(no canal|canal|seguidores)\b/,
      /\bpergunta no canal\b/,
    ],
  },
  {
    id: 'canal_respostas', nivel: 'dono', arg: 'nenhum', risco: 'seguro',
    desc: 'Ler as respostas/votos do canal (quem respondeu, o que escolheram)',
    gatilhos: [
      /\b(v[eê]|le|ler|l[êe]|mostra|mostre)\b.{0,14}\bas respostas?\b.{0,14}\b(do canal|no canal|canal|da enquete|do poll)\b/,
      /\b(o que|quem)\b.{0,16}\bresponderam\b.{0,14}\b(no canal|canal|na enquete)\b/,
    ],
  },
  {
    id: 'canal_stickers', nivel: 'dono', arg: 'texto', risco: 'moderado',
    desc: 'Enviar stickers de um tema para o canal (um a um)',
    gatilhos: [
      /\b(manda|mandar|envia|enviar)\b.{0,14}\b(\d+\s+)?stickers?\b.{0,24}\b(no canal|pro canal|para o canal|canal)\b/,
      /\b(no canal|pro canal|para o canal)\b.{0,16}\bstickers?\b/,
    ],
  },
  {
    id: 'canal_pack', nivel: 'dono', arg: 'texto', risco: 'moderado',
    desc: 'Enviar um pack inteiro de stickers de um tema para o canal',
    gatilhos: [
      /\b(manda|mandar|envia|enviar)\b.{0,14}\b(pack|pacote)\b.{0,24}\b(no canal|pro canal|para o canal|canal)\b/,
      /\b(no canal|pro canal|para o canal)\b.{0,16}\b(pack|pacote)\b/,
    ],
  },

  // ══ ENTRAR / PARTILHAR (v6.82) ════════════════════════════
  {
    // Um link de convite basta — não é preciso dizer "entra".
    // O gatilho do link vem primeiro para "entra nesse grupo <link>"
    // não ser confundido com outra coisa.
    id: 'entrar_link', nivel: 'dono', arg: 'depois', risco: 'seguro',
    desc: 'Entrar num grupo ou seguir um canal por link',
    gatilhos: [
      /chat\.whatsapp\.com\/(?:invite\/)?[0-9A-Za-z]{20,26}/i,
      /whatsapp\.com\/channel\/[0-9A-Za-z_-]{15,40}/i,
      /\b(entra|entrar|junta-te|adere)\b.{0,20}\b(nesse|neste|no)\b.{0,10}\b(grupo|canal)\b/,
    ],
  },
  {
    id: 'reencaminhar', nivel: 'dono', arg: 'depois', risco: 'moderado',
    desc: 'Reencaminhar/partilhar esta mensagem para os grupos',
    gatilhos: [
      /\b(reencaminha|reenvia|encaminha|partilha|compartilha|espalha|divulga)\b.{0,30}\b(grupos|meus grupos|teus grupos|todos)\b/,
      /\b(manda|posta|publica)\b.{0,16}\b(isto|isso|esta mensagem|este post|essa mensagem)\b.{0,20}\b(nos|em todos os|nos teus|nos meus)\b.{0,10}\bgrupos\b/,
      /\b(reencaminha|partilha|compartilha)\b.{0,16}\b(esta|essa|este|esse)\b.{0,12}\b(mensagem|post|publicacao|publicação)\b/,
    ],
  },
  // ══ GRUPO — gestão ════════════════════════════════════════
  {
    id: 'sair_grupo', nivel: 'dono', arg: 'nenhum', risco: 'destrutivo',
    desc: 'Sair do grupo',
    gatilhos: [/\b(sai|sair|abandona|deixa)\b.{0,16}\b(do grupo|deste grupo|daqui|grupo)\b/],
  },
  {
    id: 'foto_grupo', nivel: 'admin', arg: 'nenhum', risco: 'seguro',
    desc: 'Mudar a foto do grupo para a imagem enviada',
    gatilhos: [/\b(muda|troca|poe|coloca|altera)\b.{0,20}\b(foto|imagem)\b.{0,16}\bgrupo\b/],
  },
  {
    id: 'foto_perfil', nivel: 'dono', arg: 'nenhum', risco: 'seguro',
    desc: 'Mudar a foto de perfil do bot para a imagem enviada',
    gatilhos: [/\b(muda|troca|poe|coloca|altera)\b.{0,20}\b(tua foto|foto de perfil|teu perfil|minha foto)\b/],
  },
  {
    id: 'listar_membros', nivel: 'admin', arg: 'nenhum', risco: 'seguro',
    desc: 'Listar os membros do grupo',
    gatilhos: [/\b(lista|mostra|quem sao|quais)\b.{0,16}\b(membros|participantes|pessoal)\b/],
  },
  {
    id: 'promover_admin', nivel: 'admin', arg: 'alvo', risco: 'seguro',
    desc: 'Promover alguém (ou o próprio) a admin do grupo — acção real no WhatsApp',
    gatilhos: [
      /\bme\s+(adiciona|poe|poem|mete|faz|da|promove)\b.{0,28}\b(adm|admin)/,
      /\b(adiciona|poe|faz|promove)[- ]?me\b.{0,20}\b(adm|admin)/,
      /\badiciona.{0,24}\bcom\s+(adm|admin)/,
      /\b(quero|queria)\s+ser\s+(adm|admin)/,
      /\b(da|da-?me|me\s+da)\s+(o\s+)?(adm|admin)/,
      /\bpromove(r)?\b/,
      /\b(da|torna)\s+admin\b/,
      /\bagora\s+(adiciona|promove)\b/,
    ],
  },
  {
    id: 'rebaixar_admin', nivel: 'admin', arg: 'alvo', risco: 'seguro',
    desc: 'Tirar admin a alguém',
    gatilhos: [/\b(despromove|rebaixa|tira (o |de )?admin|remove (o )?admin)\b/],
  },
  {
    id: 'listar_admins', nivel: 'todos', arg: 'nenhum', risco: 'seguro',
    desc: 'Listar os admins do grupo',
    gatilhos: [/\b(lista|mostra|quem sao|quais)\b.{0,16}\badmin/],
  },
  {
    id: 'info_grupo', nivel: 'todos', arg: 'nenhum', risco: 'seguro',
    desc: 'Informação sobre o grupo',
    gatilhos: [/\b(info|informacao|dados|stats|estatisticas)\b.{0,14}\b(do grupo|deste grupo|grupo)\b/],
  },
  {
    id: 'limpar_chat', nivel: 'dono', arg: 'nenhum', risco: 'destrutivo',
    desc: 'Limpar a conversa',
    gatilhos: [/\b(limpa|apaga)\b.{0,14}\b(o chat|a conversa|tudo aqui)\b/],
  },

  // ══ MEMÓRIA ═══════════════════════════════════════════════
  {
    id: 'lembrar', nivel: 'todos', arg: 'texto', risco: 'seguro',
    desc: 'Guardar uma informação na memória',
    gatilhos: [/\b(lembra|memoriza|guarda|anota|nao te esquecas)\b.{0,10}\b(te )?(que|disso|isto|isso)\b/, /\b(lembra|guarda)(-| )te\b/],
  },
  {
    id: 'esquecer', nivel: 'todos', arg: 'texto', risco: 'seguro',
    desc: 'Esquecer uma informação',
    gatilhos: [/\b(esquece|apaga)\b.{0,16}\b(isso|aquilo|isto|essa|o que|que eu)\b/, /\besquece(-| )te\b/],
  },
  {
    id: 'recordar', nivel: 'todos', arg: 'texto', risco: 'seguro',
    desc: 'Recordar o que foi guardado',
    gatilhos: [/\b(lembras|lembra)(-| )te\b.{0,14}\b(daquilo|daquele|disso|de que|do que)\b/, /\bo que\b.{0,12}\b(guardaste|te disse|anotaste)\b/],
  },

  // ══ AGENDAMENTO (daily, orações, dicas...) ════════════════
  {
    id: 'agendar_conteudo', nivel: 'dono', arg: 'texto', risco: 'seguro',
    desc: 'Agendar publicações periódicas (conselhos, orações, dicas, notícias...)',
    gatilhos: [/\b(agenda|programa|todos os dias|diariamente|de manha|todas as)\b.{0,30}\b(posta|publica|manda|envia)\b/, /\b(posta|publica|manda)\b.{0,30}\b(todos os dias|diariamente|de hora em hora|todas as manhas)\b/],
  },
  {
    id: 'parar_agendamento', nivel: 'dono', arg: 'nenhum', risco: 'seguro',
    desc: 'Parar as publicações agendadas',
    gatilhos: [/\b(para|cancela|chega)\b.{0,20}\b(agendad|automatic|de postar)\b/],
  },
];

// Índice por id, para o router da IA validar o que ela devolve.
const POR_ID = new Map(CAPACIDADES.map(c => [c.id, c]));

/**
 * CAMADA 2 — casa a frase contra o catálogo. 0 ms.
 */
function detectarCapacidade(texto) {
  const t = norm(texto);
  if (!t) return null;
  for (const cap of CAPACIDADES) {
    if (!cap.gatilhos) continue;
    for (const re of cap.gatilhos) {
      if (re.test(t)) return { id: cap.id, cap, via: 'catalogo' };
    }
  }
  return null;
}

/**
 * CAMADA 3 — a IA escolhe a capacidade quando o catálogo falha.
 * Só corre se `pareceOrdem()` deixou passar, por isso o custo
 * não aparece em conversa normal.
 */
async function rotearComIA(texto, ai) {
  const lista = CAPACIDADES.map(c => `${c.id}: ${c.desc}`).join('\n');
  const sys = `És um router de comandos. Lês um pedido em português e escolhes UMA capacidade da lista.
Responde SÓ em JSON: {"id":"<id ou null>","arg":"<argumento ou vazio>"}
Se nenhuma servir, devolve {"id":null,"arg":""}. Nunca inventes ids.

CAPACIDADES:
${lista}`;
  try {
    const r = await ai.chat(texto, sys, { userRole: 'owner' }, true);
    const m = String(r || '').match(/\{[\s\S]*?\}/);
    if (!m) return null;
    const j = JSON.parse(m[0]);
    if (!j.id || !POR_ID.has(j.id)) return null;
    return { id: j.id, cap: POR_ID.get(j.id), arg: String(j.arg || '').slice(0, 200), via: 'ia' };
  } catch {
    return null;
  }
}

/**
 * Permissão. Espelha a lógica de auraCommands: o Dono passa
 * sempre, o resto é por cargo.
 */
function podeFazer(cap, { isOwner, isAdmin }) {
  if (isOwner) return { pode: true };
  if (cap.nivel === 'dono') return { pode: false, precisa: 'ser o Dono' };
  if (cap.nivel === 'admin' && !isAdmin) return { pode: false, precisa: 'ser admin do grupo' };
  return { pode: true };
}

module.exports = {
  // estado
  modos, setModo, ignorar, designorar, estaIgnorado, limparModos,
  // router
  pareceOrdem, detectarCapacidade, rotearComIA, podeFazer,
  // dados
  CAPACIDADES, POR_ID, norm,
  // acções já existentes, reexpostas para quem executa
  mega, adv,
};
