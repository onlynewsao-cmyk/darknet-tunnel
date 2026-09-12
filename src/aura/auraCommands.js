/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║   DARK BOT — AURA COMMANDS v1                                ║
 * ║   Ela executa comandos por conversa, sem prefixo             ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 *   "aura toca Shakira"        → .play shakira
 *   "faz sticker disto"        → .sticker
 *   "baixa esse vídeo"         → .video
 *   "qual é o meu saldo?"      → .saldo
 *   "quem é o admin aqui?"     → .admins
 *
 * REGRA DE SEGURANÇA (o pedido do Dark):
 *   Ela controla ~90% do bot, MENOS os comandos perigosos de dono.
 *   Um erro de interpretação num `eval` ou `broadcast` é
 *   irreversível — esses continuam a exigir o prefixo escrito à mão.
 *
 * A lista de bloqueio é dupla:
 *   1. BLOQUEADOS — nomes explícitos (destrutivos/irreversíveis)
 *   2. ownerOnly do commandCatalog — rede de segurança automática
 *      para comandos de dono que eu não tenha previsto
 */

'use strict';

// v6.87 — GUARDA DE INSTRUÇÕES: conversa que só MENCIONA uma acção
// não pode ser executada como ordem. Ver auraInstructionGuard.js.
const guarda = require('./auraInstructionGuard');

// ── 1. NUNCA por conversa, nem para o Dono ──────────────────
// Critério: destrutivo, irreversível, ou afecta terceiros em massa.
// v6.80 — O DONO PEDE, ELA FAZ.
//
// A lista era enorme: moderação, grupos, configuração, adulto, links,
// tudo proibido por conversa. O resultado é que o Dark pedia "fecha o
// grupo" e ela respondia com conversa em vez de fechar. Ele não quer
// uma assistente que explica porque não pode — quer uma que faz.
//
// Ficam de fora APENAS os que são irreversíveis se ela interpretar
// mal uma frase. O critério deixou de ser "é perigoso?" e passou a
// ser "se ela se enganar, dá para desfazer?".
//   - fechar um grupo por engano → abre-se outra vez. LIBERTADO.
//   - banir alguém por engano    → volta a adicionar-se. LIBERTADO.
//   - modo adulto por engano     → desliga-se. LIBERTADO.
//   - `eval` de código por engano→ não há volta. BLOQUEADO.
//   - broadcast a todos os grupos→ já foi, viram todos. BLOQUEADO.
//   - reiniciar a meio de algo   → perde estado/sessão. BLOQUEADO.
//   - dar poder de dono a alguém → essa pessoa pode tirar-te o bot. BLOQUEADO.
//
// Isto continua a ser desfazível PELO DARK com o comando escrito à
// mão (`.eval`, `.broadcast`, ...). Não é uma proibição — é só a
// exigência de que ESTES sejam escritos, não interpretados.
const BLOQUEADOS = new Set([
  // execução de código — um erro de interpretação é catastrófico
  // e não tem como desfazer-se
  'eval', 'exec', 'shell', 'term', 'terminal', 'bash', 'sh',
  // afectam TODOS os grupos/utilizadores de uma vez — sem recolha
  'broadcast', 'bc', 'sendgroup', 'transmitir',
  // ciclo de vida do processo — derruba a sessão do WhatsApp
  'restart', 'reiniciar', 'shutdown', 'desligar', 'stop', 'kill',
  // dar/tirar poder de dono — quem recebe pode virar o bot contra ele
  'adddono', 'removedono',
  // mexem no próprio código em execução
  'addcase', 'delcase', 'removicase', 'runcase', 'execcase',
]);

/** True se este comando NUNCA pode ser executado por conversa. */
function estaBloqueado(cmd) {
  const c = String(cmd || '').toLowerCase().trim();
  if (!c) return true;
  if (BLOQUEADOS.has(c)) return true;

  // v6.80: a "rede de segurança" que bloqueava TODO o ownerOnly do
  // catálogo foi removida. Era ela que fazia a AURA recusar ao Dark
  // coisas perfeitamente reversíveis só porque estavam marcadas como
  // comando de dono. Quem manda agora é a lista BLOQUEADOS acima,
  // que é curta e explícita. O cargo continua a ser verificado em
  // podeExecutar() — um Free não passa a fazer comandos de dono.
  return false;
}

// ── 2. Frases → comandos ────────────────────────────────────
// Cada entrada: [regex, comando, extractor de argumentos]
// A ordem importa — o primeiro que casar ganha.
const MAPA = [
  // música e vídeo
  // v6.55: 'manda' sozinho era genérico demais — "manda broadcast para
  // todos" virava `.play broadcast`. Agora exige a palavra música/som
  // ou um verbo inequívoco de tocar.
  [/\b(toca|tocar|toque)\b/i, 'play', 'depois'],
  [/\b(p[oõ]e|coloca|manda|quero ouvir|ouvir|bota)\b[^.?!]{0,20}\b(m[úu]sica|som|canção|cancao|mp3)\b/i, 'play', 'depois'],
  [/\b(baixa|baixar|descarrega|download)\b.*\b(m[úu]sica|audio|mp3)\b/i, 'play', 'depois'],
  [/\b(baixa|baixar|descarrega|download|manda|mandar|envia|enviar)\b.*\b(v[íi]deo|mp4|filme)\b/i, 'video', 'depois'],
  [/\b(procura|pesquisa|acha)\b.*\b(no youtube|youtube|yt)\b/i, 'play', 'depois'],

  // figurinhas
  [/\b(faz|fazer|cria|criar|transforma|converte)\b.*\b(sticker|figurinha|fig)\b/i, 'sticker', 'nenhum'],
  [/\b(sticker|figurinha)\b.*\b(disto|disso|dessa|desta|dessa imagem|dessa foto)\b/i, 'sticker', 'nenhum'],
  [/\b(transforma|converte)\b.*\b(em imagem|em foto|pra imagem)\b/i, 'toimg', 'nenhum'],

  // economia
  [/\b(qual|quanto)\b.*\b(meu saldo|minha carteira|meus coins|tenho de coins)\b/i, 'saldo', 'nenhum'],
  [/\b(meu saldo|minha carteira|meus coins)\b/i, 'saldo', 'nenhum'],
  [/\b(recompensa|b[óo]nus|daily|di[áa]ri[ao])\b/i, 'daily', 'nenhum'],
  [/\b(trabalhar|trabalha|quero trabalhar)\b/i, 'trabalhar', 'nenhum'],

  // grupo (informativo — moderação continua a exigir comando)
  [/\b(quem|quais)\b.*\b(s[ãa]o os admin|admins|administradores)\b/i, 'admins', 'nenhum'],
  [/\b(quantos|quantas)\b.*\b(membros|pessoas|participantes)\b.*\b(grupo|aqui)\b/i, 'participantes', 'nenhum'],
  [/\b(regras|regulamento)\b.*\b(grupo|aqui)\b/i, 'regras', 'nenhum'],

  // informação
  [/\b(meu perfil|minha ficha|meus dados)\b/i, 'perfil', 'nenhum'],
  [/\b(qual|mostra)\b.*\b(o menu|os comandos|lista de comandos)\b/i, 'menu', 'nenhum'],
  [/\b(ping|latência|latencia|velocidade)\b.*\b(bot|tua|teu)\b/i, 'ping', 'nenhum'],

  // utilidades
  [/\b(traduz|traduzir)\b/i, 'traduzir', 'depois'],
  [/\b(clima|tempo|previs[ãa]o)\b.*\b(em|de|no|na)\b/i, 'clima', 'depois'],
  // v7.16: "letra da música X" ia parar ao jogo da forca (`letra`).
  // Não há comando de letras de música — deixa cair para a IA responder.

  // ── v6.80: MODERAÇÃO E GRUPO ────────────────────────────────
  // Faltava tudo isto. O Dark dizia "aura fecha o grupo" e ela
  // respondia com conversa, porque a frase nem chegava a ser
  // reconhecida como ordem. O cargo é validado em podeExecutar().
  [/\b(bane|banir|ban|expulsa|expulsar|remove|remover|tira|kick|chuta)\b/i, 'ban', 'nenhum'],
  [/\b(promove|promover|p[õo]e como admin|torna admin|d[aá] admin|adiciona.{0,20}(adm|admin)|quero ser (adm|admin)|me (faz|p[õo]e|mete|d[aá]) .{0,10}(adm|admin)|com (adm|admin))\b/i, 'promote', 'nenhum'],
  [/\b(despromove|despromover|rebaixa|rebaixar|tira (o |de )?admin|remove (o )?admin)\b/i, 'demote', 'nenhum'],
  [/\b(fecha|fechar|tranca|trancar|silencia)\b[^.?!]{0,15}\b(o grupo|grupo|aqui|chat)\b/i, 'fechar', 'nenhum'],
  [/\b(abre|abrir|destranca|destrancar|liberta)\b[^.?!]{0,15}\b(o grupo|grupo|aqui|chat)\b/i, 'abrir', 'nenhum'],
  [/\b(marca|marcar|chama|menciona|mencionar)\b[^.?!]{0,15}\b(todos|toda a gente|geral|pessoal)\b/i, 'tagall', 'nenhum'],
  // v6.87: "todos" sozinho era catastrófico — "somos todos irmãos"
  // punha o bot a marcar o grupo inteiro. Ficam só as formas
  // inequívocas; a ordem a sério ("marca todos") já está no padrão
  // logo acima.
  [/\b(tagall|marcatodos|marca todos|chama todos)\b/i, 'tagall', 'nenhum'],
  [/\b(link|convite)\b[^.?!]{0,15}\b(do grupo|grupo|daqui|deste grupo)\b/i, 'link', 'nenhum'],
  [/\b(manda|mostra|d[aá]|envia|qual)\b[^.?!]{0,15}\b(o link|link)\b/i, 'link', 'nenhum'],
  [/\b(avisa|avisar|adverte|warn)\b/i, 'warn', 'nenhum'],
  [/\b(muta|mutar|cala|calar|silencia)\b/i, 'mute', 'nenhum'],
  [/\b(desmuta|desmutar|descala|unmute)\b/i, 'unmute', 'nenhum'],

  // protecções do grupo — ligar/desligar por conversa
  [/\b(liga|ligar|ativa|activa|ativar|activar|p[õo]e)\b[^.?!]{0,20}\b(antilink|anti-link|anti link)\b/i, 'antilink', 'nenhum'],
  [/\b(desliga|desligar|desativa|desactiva|tira|remove)\b[^.?!]{0,20}\b(antilink|anti-link|anti link)\b/i, 'antilink', 'nenhum'],
  [/\b(liga|ligar|ativa|activa|ativar|activar|p[õo]e)\b[^.?!]{0,20}\b(antispam|anti-spam|anti spam)\b/i, 'antispam', 'nenhum'],
  [/\b(liga|ligar|ativa|activa|ativar|activar|p[õo]e)\b[^.?!]{0,20}\b(bem.?vindo|boas.?vindas|welcome)\b/i, 'welcome', 'nenhum'],

  // ── v6.80: GESTÃO DO GRUPO ──────────────────────────────────
  // Nomes verificados contra os cases reais (registerCase) — não
  // inventados. `criargrupo` não existe no bot, por isso não está
  // aqui: mapear para um comando inexistente só produzia um erro.
  [/\b(muda|mudar|troca|trocar|altera|p[õo]e|renomeia)\b[^.?!]{0,20}\b(nome do grupo|nome daqui|nome deste grupo)\b/i, 'setnomegrupo', 'depois'],
  [/\b(muda|mudar|troca|trocar|altera|p[õo]e)\b[^.?!]{0,20}\b(descri[çc][ãa]o|desc)\b/i, 'setdesc', 'depois'],
  [/\b(revoga|revogar|reseta|resetar|novo)\b[^.?!]{0,15}\b(link|convite)\b/i, 'revoke', 'nenhum'],
  [/\b(apaga|apagar|elimina|deleta)\b[^.?!]{0,15}\b(essa|esta|a)?\s*(mensagem|msg)\b/i, 'del', 'nenhum'],
  [/\b(adiciona|adicionar|p[õo]e|coloca)\b[^.?!]{0,12}\b\+?\d{8,15}\b/i, 'add', 'depois'],
  [/\b(adiciona|adicionar|p[õo]e)\b[^.?!]{0,15}\b(no grupo|ao grupo|aqui)\b/i, 'add', 'depois'],

  // ── v6.80: MÉDIA E IA ───────────────────────────────────────
  [/\b(cria|criar|desenha|desenhar|gera|gerar|imagina)\b[^.?!]{0,20}\b(uma |um )?(imagem|foto|desenho|arte)\b/i, 'imagem', 'depois'],
  [/\b(pesquisa|procura|busca|search)\b[^.?!]{0,15}\b(na net|na internet|no google|sobre)\b/i, 'pesquisar', 'depois'],
  [/\b(resume|resumir|resumo)\b/i, 'resumir', 'depois'],

  // ── v6.80: ADULTO — reversível; o Dark é adulto e sabe o que pede ──
  // `adultmode` precisa de on/off, por isso o argumento é forçado
  // conforme o verbo da frase (ver detectarComando).
  [/\b(liga|ligar|ativa|activa|ativar|activar|p[õo]e|abre)\b[^.?!]{0,20}\b(modo adulto|conte[úu]do adulto|portal 18|18\+|nsfw)\b/i, 'adultmode', 'on'],
  [/\b(desliga|desligar|desativa|desactiva|tira|fecha)\b[^.?!]{0,20}\b(modo adulto|conte[úu]do adulto|portal 18|18\+|nsfw)\b/i, 'adultmode', 'off'],

  // ── v7.9 ETAPA 3: STATUS / INFORMAÇÃO DO BOT E DO GRUPO ─────
  // Ordem importa: as regras específicas (grupo/bot) vêm ANTES da
  // genérica "meu status", senão "status do grupo" cai em "meu status".
  [/\bstatus\b[^.?!]{0,16}\b(grupo|gp)\b/i, 'statusgp', 'nenhum'],
  [/\bcomo (est[aá]|vai|t[aá])[^.?!]{0,16}\b(grupo|gp)\b/i, 'statusgp', 'nenhum'],
  [/\b(info|informa[çc][aã]o)\b[^.?!]{0,16}\b(do grupo|deste grupo|desse grupo)\b/i, 'statusgp', 'nenhum'],
  [/\bstatus\b[^.?!]{0,16}\bbot\b/i, 'statusbot', 'nenhum'],
  [/\bcomo (est[aá]|vai)[^.?!]{0,16}\bbot\b/i, 'statusbot', 'nenhum'],
  [/\bbot\b[^.?!]{0,16}\b(t[aá] vivo|est[aá] vivo|online|de p[eé]|funciona|acordado)\b/i, 'statusbot', 'nenhum'],
  [/\b(meu status|meu estado|meu progresso|como estou|minha situa[çc][aã]o)\b/i, 'meustatus', 'nenhum'],
  [/\b(sou vip|meu vip|o meu vip|estado do vip|situa[çc][aã]o do vip)\b/i, 'myvip', 'nenhum'],
  [/\b(qual|manda|d[aá]|mostra|passa|envia)\b[^.?!]{0,16}\b(teu|o teu|seu|o seu|do bot)\b[^.?!]{0,8}\bcanal\b/i, 'ca', 'nenhum'],
  [/\b(quem est[aá] ativo|ativos|atividade|participa[çc][aã]o)\b[^.?!]{0,16}\b(do grupo|no grupo|aqui|grupo)\b/i, 'checkativo', 'nenhum'],
  [/\b(l[ií]deres|ranking|top|top 5)\b[^.?!]{0,16}\b(do grupo|no grupo|aqui|grupo)\b/i, 'lider', 'nenhum'],
];

/** Tira o que vem depois do verbo — o argumento do comando. */
function extrairDepois(texto, regex) {
  const m = regex.exec(texto);
  if (!m) return '';
  let resto = texto.slice(m.index + m[0].length).trim();

  // limpa palavras de ligação no início
  // v6.55: limpa palavras de ligação E os substantivos genéricos que
  // sobram do próprio pedido ('a música despacito' → 'despacito',
  // 'esse vídeo do youtube' → sem argumento útil → não executa).
  resto = resto
    .replace(/^(a|o|um|uma|de|do|da|para|pra|me|essa|esse|isso|isto|aí|ai|por favor|pf|pfv)\s+/gi, '')
    // v6.80: "cria um grupo chamado Teste" → "Teste"
    .replace(/^(chamad[oa]|com o nome|de nome|com nome|nome)\s+/gi, '')
    .replace(/^(m[úu]sica|som|audio|áudio|v[íi]deo|filme|canção|cancao|track|faixa)\s+/gi, '')
    .replace(/\s*(no|do|da|no youtube|do youtube|da net|na net)\s*$/gi, '')
    .replace(/^(no |do |da )?youtube\s*$/gi, '')
    .replace(/\s*(por favor|pf|pfv)\s*$/gi, '')
    .replace(/[?!.]+$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return resto;
}

// ── v6.89: INSTRUÇÃO ≠ COMANDO ─────────────────────────────
// "Se eu responder alguém com este sticker de ban vc remove ele tá"
// tem verbos de comando (ban, remove) mas é uma REGRA para o futuro,
// não uma ordem para AGORA. Sem esta guarda, o interpretador roubava
// a frase e respondia com o uso do `.ban` (bug do print).
// Ordens directas ("aura bane o Zeca") continuam a funcionar.
const RE_INSTRUCAO_INICIO = /^\s*(se|quando|caso)\s+/i;
const RE_INSTRUCAO_CONDICIONAL =
  /\b(se|quando|caso)\s+(eu\s+|tu\s+|v[oó]c[eê]\s+|vc\s+)?(responder|responde|responderem|falar|mandar|enviar|envio|puser|p[oó]r|colocar|usar|clicar|reagir)\b[^.?!]{0,100}\b(v[oó]c[eê]|vc|voc[eê]|tu|bote?|bot|ela)\b[^.?!]{0,60}\b(remov|ban|expuls|kick|chuta|apag|delet|mut|silenc|promov|rebaix|avisa|responde|fala)\b/i;

/** True se a frase é uma INSTRUÇÃO condicional (regra), não uma ordem. */
function eInstrucao(texto) {
  const t = String(texto || '').trim();
  if (!t) return false;
  return RE_INSTRUCAO_INICIO.test(t) || RE_INSTRUCAO_CONDICIONAL.test(t);
}

/**
 * Detecta se a frase é um pedido de comando.
 * @returns {{comando:string, args:string}|null}
 */
function detectarComando(texto) {
  const t = String(texto || '').trim();
  if (!t || t.length > 200) return null;

  // tira o nome dela do início — "aura toca X" → "toca X"
  const semNome = t.replace(/^\s*(aura|dark bot|bot)\s*[,:]?\s*/i, '').trim();
  if (!semNome) return null;

  // v6.89: "se eu responder com o sticker X vc remove" não é ordem —
  // é uma regra que ela deve APRENDER (ver src/aura/stickerBan.js).
  if (eInstrucao(semNome)) return null;

  // v6.55: se a frase menciona um comando bloqueado, não executa NADA.
  // Rede de segurança contra interpretações criativas — "manda
  // broadcast" nunca pode acabar como `.play broadcast`.
  const palavras = semNome.toLowerCase().split(/[^a-zà-ú0-9]+/);
  if (palavras.some(w => w && BLOQUEADOS.has(w))) return null;

  for (const [re, cmd, modo] of MAPA) {
    if (!re.test(semNome)) continue;
    if (estaBloqueado(cmd)) return null;

    // v6.87: a frase é MESMO uma ordem, ou só fala da acção?
    // "o ban foi injusto" / "ele marca golos" / "não bana o rapaz"
    // casam com os padrões do MAPA mas não são instruções.
    // `continue` (e não `return null`) para um padrão seguinte ainda
    // poder casar com uma ordem verdadeira noutra parte da frase.
    if (!guarda.classificar(semNome, { comando: cmd, regex: re }).ordem) continue;

    // v6.80: 'on'/'off' são argumentos fixos — comandos que ligam ou
    // desligam algo (adultmode) precisam do valor explícito, e é o
    // verbo da frase que o determina.
    const args = modo === 'depois' ? extrairDepois(semNome, re)
      : (modo === 'on' || modo === 'off') ? modo
      : '';

    // comandos que precisam de argumento e não o têm → não força
    const precisaArg = ['play', 'video', 'traduzir', 'clima'];
    if (precisaArg.includes(cmd) && (!args || args.length < 2)) continue;

    return { comando: cmd, args };
  }
  return null;
}

/** Lista legível do que ela NÃO faz por conversa (para explicar). */
function porqueNaoFaco(cmd) {
  const c = String(cmd || '').toLowerCase();
  if (/^(eval|exec|shell|term)/.test(c)) return 'executar código';
  if (/^(broadcast|bc|send)/.test(c)) return 'mandar mensagem a todos os grupos';
  if (/^(restart|shutdown)/.test(c)) return 'reiniciar o bot';
  if (/dono|premium|blacklist/.test(c)) return 'mexer em permissões';
  return 'isso';
}

// ── v6.57: PERMISSÃO POR CARGO ──────────────────────────────
// A assistente também executa comandos — mas o que cada um pode
// depende do cargo. Antes só o Dono executava por conversa; um VIP
// ou Free que pedisse "qual o meu saldo" recebia uma conversa fiada
// ("verifica no aplicativo do banco") em vez do comando real.

// Qualquer pessoa pode: informação e coisas inofensivas
const LIVRES = new Set([
  'menu', 'ping', 'info', 'perfil', 'saldo', 'daily', 'trabalhar',
  'admins', 'participantes', 'regras', 'dono', 'sticker', 'toimg',
  'traduzir', 'clima', 'letra', 'calc', 'wikipedia', 'vip',
  // v7.9 Etapa 3: informação inofensiva
  'statusgp', 'statusbot', 'meustatus', 'myvip', 'ca', 'checkativo', 'lider', 'infoff',
]);

// VIP e acima: downloads e coisas que custam recursos
const SO_VIP = new Set([
  'play', 'video', 'play2', 'video2', 'ytmp3', 'ytmp4',
  'imagem', 'ia', 'gpt', 'resumir', 'pesquisar',
]);

// Admin do grupo e acima: moderação
const SO_ADMIN = new Set([
  'ban', 'kick', 'promote', 'demote', 'mute', 'unmute',
  'fechar', 'abrir', 'warn', 'antilink', 'antispam', 'welcome',
  'todos', 'marcar', 'tagall', 'link', 'linkgrupo',
  // v6.80
  'setnomegrupo', 'setdesc', 'revoke', 'del', 'add', 'hidetag',
]);

// v6.80: só o Dono, por conversa. Reversíveis, mas não são para
// qualquer admin de grupo alugado andar a disparar.
const SO_DONO = new Set([
  'adultmode',
]);

/**
 * O cargo permite executar este comando por conversa?
 * @param {string} cmd
 * @param {{isOwner:boolean, isVip:boolean, isAdmin:boolean}} quem
 * @returns {{pode:boolean, precisa?:string}}
 */
function podeExecutar(cmd, quem = {}) {
  const c = String(cmd || '').toLowerCase().trim();
  if (estaBloqueado(c)) return { pode: false, precisa: 'comando de dono' };

  const { isOwner = false, isVip = false, isAdmin = false } = quem;
  if (isOwner) return { pode: true };                       // dono faz tudo (menos bloqueados)
  if (SO_DONO.has(c)) return { pode: false, precisa: 'ser o Dono' };
  if (LIVRES.has(c)) return { pode: true };
  if (SO_ADMIN.has(c)) return isAdmin || isVip
    ? { pode: true }
    : { pode: false, precisa: 'ser admin do grupo' };
  if (SO_VIP.has(c)) return isVip
    ? { pode: true }
    : { pode: false, precisa: 'ser VIP' };

  // desconhecido → só dono, por segurança
  return { pode: false, precisa: 'permissão' };
}

module.exports = { detectarComando, eInstrucao, estaBloqueado, podeExecutar, porqueNaoFaco, BLOQUEADOS, MAPA, LIVRES, SO_VIP, SO_ADMIN, SO_DONO };
