/**
 * DARK BOT v6.3 — Dados completos de TODOS os submenus
 * Cada comando classificado como:
 *   sel: true  → aparece na LISTA de seleção (executa directo)
 *   sel: false → aparece só no TEXTO (precisa de dados/args/mention)
 */
'use strict';

// ── CLASSIFICAÇÃO AUTOMÁTICA POR PADRÃO DE NOME ──────────────
// Comandos que NÃO precisam de argumentos (executam directo)
const SEL_PATTERNS = [
  // ══════════════════════════════════════════════════════════════════════
  // v7.7 — AÇÃO DIRETA = apenas INTERRUPTORES (on/off, activar/desactivar)
  // e acções que INICIAM algo sem precisar de input.
  //
  // Info/status, medidores de zoeira e rankings DEIXARAM de ser "acção
  // directa": ficam no texto dos submenus, não como botão clicável.
  // ══════════════════════════════════════════════════════════════════════

  // ── TOGGLES DE GRUPO (ligar/desligar — interruptores) ──
  /^antilink$/, /^antispam$/, /^antiflood$/, /^antifigurinha$/,
  /^antidoc$/, /^antiloc$/, /^antiporn$/, /^antitoxic$/,
  /^antidemote$/, /^antistatus$/, /^antibtn$/, /^antipalavra$/,
  /^antimencao$/, /^antipagamento$/, /^antiinvisivel$/, /^addpalavra$/, /^delpalavra$/, /^palavras$/,
  /^antiraid$/, /^antilinkcanal$/, /^antilinkgp$/, /^antilinkhard$/, /^antilinksoft$/,
  /^welcome$/, /^bemvindo$/, /^goodbye$/, /^saida$/, /^boasvindas$/,
  /^autosticker$/, /^autorespostas$/,
  /^open$/, /^close$/, /^abrir$/, /^fechar$/, /^opengp$/, /^closegp$/,
  /^whitelist$/, /^resetlink$/, /^novo-link$/, /^revoke$/,
  /^adultmode$/, /^buttonmode$/, /^antidelete$/, /^espiao$/,

  // ── ACÇÕES QUE INICIAM (jogos / recompensas / trabalho) ──
  /^forca$/, /^quiz$/, /^adivinha$/, /^dado$/, /^dice$/, /^d6$/,
  /^moeda$/, /^coin$/, /^coinflip$/, /^caraoucoroa$/, /^flip$/,
  /^roleta$/, /^roulette$/, /^verdade$/, /^desafio$/, /^vd$/,
  /^bingo$/, /^blackjack$/, /^russa$/, /^enigma$/, /^charada$/,
  /^eununca$/, /^cacapalavras$/, /^batalhanaval$/, /^genio$/,
  /^daily$/, /^diario$/, /^trabalhar$/, /^work$/, /^minerar$/, /^mine$/,
  /^pescar$/, /^fish$/, /^coletar$/, /^colher$/, /^saldo$/, /^coins$/,
  /^carteira$/, /^inventario$/, /^inv$/, /^caixa$/,
  /^cambio$/, /^cripto$/, /^noticias$/, /^conselho$/,
];

function isSelectable(cmd) {
  return SEL_PATTERNS.some(re => re.test(cmd));
}

// ── CATEGORIAS POR PADRÃO DE NOME ────────────────────────────
function categorize(cmd) {
  const c = cmd.toLowerCase();
  // v6.15: overrides explícitos (prioridade máxima)
  const OVERRIDES = {
    pinpacks:'stickers', pinpack:'stickers', pinsticker:'stickers',
    casar:'interacoes', divorciar:'interacoes', namorar:'interacoes',
    '8d':'audio', '8d2':'audio', '8d3':'audio',
    abraco:'interacoes', beijo:'interacoes',
    ficha:'economia', explore:'economia',
    cantada:'texto', bible:'texto', versiculo:'texto', filosofo:'texto',
    // v6.84: 'cor' (regex de texto, prefixo) roubava corno/corna para
    // TEXTO — são medidores de zoeira. compress é utilidade de mídia.
    corno:'zoeira', corna:'zoeira', compress:'texto',
    coin:'jogos', dice:'jogos', d6:'jogos',
    vip:'info', assinar:'info',
    cmdsocultos:'owner', portal18:'owner',
    copilot:'ia', chat:'ia', ask:'ia',
    unmute:'admin', unadmin:'admin', calar:'admin',
    fechar:'admin', 'fechar-grupo':'admin', abrir:'admin', 'abrir-grupo':'admin',
    everyone:'admin', all:'admin', whitelist:'admin',
    facebook:'downloads', tt:'downloads', tw:'downloads',
    fig:'stickers', figurinha:'stickers',
    tikstalk:'search', ttstalk:'search',
    blackhzx:'logos', blood:'logos', cemiterio:'logos', ffavatar:'logos',
    themechange:'owner', themes:'owner',
    texto:'texto', submenuRPG:'economia', menurpg:'economia', maiscmds:'owner', menumais:'owner', textosticker:'stickers', fight:'jogos',advanced:'logos',deleting:'logos',emprego:'economia',deepai:'ia',deepsearch:'search',menuaudio:'info', inveja:'zoeira',invejosa:'zoeira',invejoso:'zoeira',invisible:'admin',invite:'admin',pixel:'logos',casal:'interacoes',casamento:'interacoes',nome:'economia',rg:'economia',ficha:'economia', imagem:'ia', stickers:'info', legendasaiu:'admin', legendabv:'admin', textsticker:'stickers', txtsticker:'stickers',
    // v6.47: 's' é o alias mais usado de sticker e caía em 'outros'
    s:'stickers', fig:'stickers', figu:'stickers',
    baixaraudio:'downloads',
    // v7.0 — Comandos que caíam em 'outros'
    acordar:'ia', mymemory:'ia', resetia:'ia', imagine:'ia', img:'ia', pergunta:'ia', news:'ia', jornal:'ia',
    amaldicoar:'interacoes', bencao:'interacoes', bullying:'interacoes', chutar:'interacoes', cuspir:'interacoes',
    declarar:'interacoes', envenenar:'interacoes', espancar:'interacoes', facada:'interacoes', flertar:'interacoes',
    highfive:'interacoes', lutar:'interacoes', mimimi:'interacoes', pontape:'interacoes', rir:'interacoes',
    tiro:'interacoes', wave:'interacoes', bater:'interacoes', cantar:'interacoes', chorar:'interacoes',
    chocolate:'interacoes', comer:'interacoes', cafe:'interacoes', cafezinho:'interacoes', crente:'interacoes',
    pedir:'interacoes', pensar:'interacoes', falar:'interacoes', dormir:'interacoes', descansar:'interacoes',
    estudar:'interacoes', cuidar:'interacoes', experimentar:'interacoes', desistir:'interacoes', negrito:'interacoes',
    pequeno:'interacoes', telefone:'interacoes', estender:'interacoes', revelar:'interacoes', esposa:'interacoes',
    programar:'interacoes', malucao:'interacoes', suic:'interacoes', suicidio:'interacoes', timido:'interacoes',
    jokenpo:'jogos', truco:'jogos', roulette:'jogos', russa:'jogos', genio:'jogos', enigma:'jogos',
    flip:'jogos', ship:'jogos', shipo:'jogos', bingo:'jogos', akinator:'jogos', chute:'jogos',
    caraoucoroa:'jogos', combate:'jogos', adivinha:'jogos', simular:'jogos', palavra:'jogos', velha:'jogos',
    music:'downloads', music2:'downloads', music3:'downloads', musica:'downloads', yt:'downloads', ig:'downloads',
    fullhd:'downloads', hq:'downloads', ytfhd:'downloads', ythd:'downloads', sp:'downloads', vd:'jogos',
    wiki:'search', movie:'search', procurar:'search', githubstalk:'search', ghstalk:'search',
    instastalk:'search', stalktk:'search', episodiosanime:'search', lives:'search', robloxcodes:'search',
    world:'search', mapa:'search', historia:'search', buscalivro:'search', buscar18:'owner',
    normas:'admin', rules:'admin', setrules:'admin', setsubject:'admin', removeaviso:'admin',
    godadm:'admin', godmode:'admin', listrents:'admin', trial:'admin', rent:'admin',
    cancelrent:'admin', renew:'admin', renovar:'admin', clean:'admin', espiao:'admin', captura:'admin',
    guild:'economia', guilda:'economia', criarguilda:'economia', criarpersonagem:'economia', newchar:'economia',
    racas:'economia', quest:'economia', rpgstart:'economia', shop:'economia', heal:'economia',
    revive:'economia', reviver:'economia', pocao:'economia', potion:'economia', forjar:'economia',
    npc:'economia', usar:'economia', hospedar:'economia', cassar:'economia', cripto:'economia', cambio:'economia',
    gif:'stickers', gifreact:'interacoes', figbusca:'owner', figgif:'owner', ximg:'stickers', pin:'stickers', pack18:'owner',
    packbusca:'owner', packname:'stickers', takepack:'stickers', slypack:'stickers', sly:'stickers',
    definestickwm:'stickers', setstickwm:'stickers', stickwmgrupo:'stickers', definirmarca:'stickers',
    neymar:'logos', placaneymar:'logos',
    audiofx:'audio', audiomeme:'audio',
    auditcmds:'owner', audit:'owner', vercode:'owner', cmdcheck:'owner', newcase:'owner',
    recarregarcases:'owner', refreshcases:'owner', removecase:'owner', remcase:'owner',
    showcase:'owner', validarcase:'owner', verificarcmds:'owner', listcmds:'owner', mycases:'owner',
    // v7.7 — comandos 18+ foram movidos para a categoria '18' (só menu18).
    '__change_theme_handler__':'owner',
    _adultsend:'18',
    cmdsocultos:'owner',
    aceitar:'interacoes', aceitarinvocacao:'interacoes', ameme:'interacoes',
    cat:'interacoes', dog:'interacoes', fofocar:'interacoes', hallobat:'interacoes',
    mata:'interacoes', paparico:'interacoes', pet:'interacoes', pickup:'interacoes',
    polo:'interacoes', recusar:'interacoes', recusarinvocacao:'interacoes',
    rename:'interacoes', talk:'interacoes', treinar:'interacoes',
    winadivinha:'jogos', winforca:'jogos', winquiz:'jogos',
    doido:'zoeira',
    alugar:'economia', desalugar:'economia', rentstatus:'economia', dar:'economia',
    biomas:'search', capitulo:'search', lercap:'search', lermanga:'search',
    manga:'search', mangacap:'search', 'mangá':'search', livros18:'owner',
    dicio:'search', significado:'search', search:'search',
    apagadas:'admin', fakeban:'admin', fakelog:'admin',
    d:'admin', list:'admin', mdel:'admin', mdown:'admin', mlist:'admin',
    mm:'admin', mup:'admin', off:'admin', remove:'admin', revoke:'admin',
    resetlink:'admin', silenciar:'admin', 'silent-tag':'admin', tagall:'admin',
    apigratis:'info', alteradores:'info', b2:'info', ca:'info', getprefix:'info',
    id:'info', lat:'info', listtemas:'info', listthemes:'info', morecmds:'info',
    mp4:'info', msgid:'info', msginfo:'info', mudarstema:'info', myid:'info',
    perf:'info', performance:'info', planos:'info', prefixo:'info', premium:'info',
    speed:'info', staff:'info', start:'info', submenurpg:'info', tecnologica:'info',
    tema:'info', tempo:'info', ver:'info', velocidade:'info', weather:'info',
    fullsticker:'stickers', renamesticker:'stickers',
    'novo-link':'admin', rpginfo:'economia', teste:'info', termo:'jogos',
    aura:'ia', dormiraura:'ia', modoaura:'ia',
    cap:'owner', capture:'owner', captura:'owner', 'c∆p':'owner',   // v7.30 C∆P
    planos:'info', menuplanos:'info', submenuplanos:'info', plans:'info',
    'microsoft-ai':'ia', rest:'info', pais:'info', getcasecode:'owner', listcase:'owner',

 baixarvideo:'downloads',
    dlmp3:'downloads', dlmp4:'downloads', ytmp3:'downloads', ytmp4:'downloads',
    ytaudio:'downloads', ytplay4:'downloads', fhd:'downloads', vid:'downloads', vid2:'downloads',
    down:'downloads', downloads:'downloads',
    boasvindas:'admin', bv:'admin',
    equipe:'info', subdono:'info',
    tempoonline:'info', uptime:'info',
      'despertar':'economia',
    'rpgstart':'economia',
    'newchar':'economia',
    'rg':'economia',
    'ficha':'economia',
    'perfilrpg':'economia',
    'quest':'economia',
    'historia':'economia',
    'aventura':'economia',
    'lutar':'economia',
    'fight':'economia',
    'combate':'economia',
    'explorar':'economia',
    'explore':'economia',
    'descansar':'economia',
    'rest':'economia',
    'pocao':'economia',
    'potion':'economia',
    'reviver':'economia',
    'revive':'economia',
    'guilda':'economia',
    'guild':'economia',
    'criarguilda':'economia',
    'rankrpg':'economia',
    'toprpg':'economia',
    'rankglobal':'economia',
    'inventario':'economia',
    'inv':'economia',
    'bau':'economia',
    'npc':'economia',
    'falar':'economia',
    'talk':'economia',
    'mapa':'economia',
    'biomas':'economia',
    'world':'economia',
    'vidas':'economia',
    'lives':'economia',
    'racas':'economia',
    'classes':'economia',
    'rpginfo':'economia',
    'nome':'economia',
    'rename':'economia',
    'pet':'economia',
    'pets':'economia',
    'gacha':'economia',
    'cartas':'economia',
    'criaclan':'owner',
    'criaclã':'owner',
    'newclan':'owner',
    'darkrpg':'owner',
    'rpginit':'owner',
    'iniciar-rpg':'owner',
    'darkrpg-test':'owner',
    'rpgtest':'owner',
    'darkrpg-status':'owner',
    'rpgstatus':'owner',
    'menu-rpg':'owner',
    'rpgmenu':'owner',
    'comunicado':'owner',
    'arsenal':'owner',
    'ranking-update':'owner',
    'addglb':'owner',
    'addglobal':'owner',
    'regras':'admin',
    'rules':'admin',
    'normas':'admin',
    'arena':'economia',
    'torneio':'economia',
    'duelrpg':'economia',
    'duelar':'economia',
    'masmorra':'economia',
    'dungeon':'economia',
    'bossrpg':'economia',
    'evoluir':'economia',
    'prestige':'economia',
    'streak':'economia',
    'diario':'economia',
    // v7.6 — ADM & GRUPOS limpo: os de DONO saem do menu de grupo
    // e os miscategorizados vão para as categorias certas.
    addcase:'owner', addcmd:'owner', addcmdvip:'owner', addia:'owner',
    delcase:'owner', delcmd:'owner', downcase:'owner', runcase:'owner',
    reloadcases:'owner', listcases:'owner', testcase:'owner', testcasecode:'owner',
    execcase:'owner', removicase:'owner',
    espiao:'owner', fakeban:'owner', fakelog:'owner', fakeedit:'owner', fakemsg:'owner',
    godmode:'owner', apagadas:'owner', grupos:'owner',
    godadm:'interacoes', empurrar:'interacoes',
    x9:'downloads', autosticker:'stickers',
    // ── v6.87: anti-figurinha aprendida (!bansticker) ──────────────
    // É moderação de grupo (só admin/dono), por isso fica em 'admin'
    // ao lado do antilink/antispam. A lista fica em 'stickers', que é
    // onde quem procura figurinhas a vai procurar.
    antisticker:'admin', antifigban:'admin',
    bansticker:'admin', banfig:'admin', banfigurinha:'admin',
    aprendersticker:'admin', aprenderfig:'admin',
    unbansticker:'admin', unbanfig:'admin', desbansticker:'admin',
    esquecersticker:'admin', esquecerfig:'admin', listabansticker:'admin',
    banstickers:'admin', stickerbans:'stickers',
    // ── v6.90: mundo do RPG ──────────────────────────────────────
    // 'mapa'/'biomas'/'world' já estavam cá, mas espalhados ('search') —
    // são comandos do RPG e apareciam fora do submenu certo.
    world:'economia', mapa:'economia', biomas:'economia', mundomap:'economia',
    viajar:'economia', travel:'economia', irpara:'economia',
    mundial:'economia', rankmundial:'economia', worldrank:'economia',
    rankingmundial:'economia',
    gruposaura:'ia',
    regrasrpg:'economia', regrasville:'economia', bvrpg:'economia', welcomerpg:'economia',
    rent:'economia', trial:'economia', renovar:'economia', renew:'economia',
    cancelrent:'economia', listrents:'economia', alugar:'economia', hospedar:'economia',
    statusalugar:'economia', desalugar:'economia', estender:'economia',
    meualuguel:'economia', gruposalugados:'economia',
    // v7.6b — ECONOMIA & RPG limpo: donos/cheats saem, miscategorizados vão ao sítio
    dar:'owner', forjar:'owner',
    rpgadd:'owner', rpgremove:'owner', rpgsetlevel:'owner',
    rpgadditem:'owner', rpgremoveitem:'owner', rpgresetplayer:'owner', rpgstats:'owner',
    invocaraura:'ia',
    invokedono:'admin',
    cambio:'info', cripto:'info',
    welcomerpg:'admin', bvrpg:'admin', regrasrpg:'admin', regrasville:'admin',
    casais:'interacoes', dependente:'zoeira',
    // v7.7 — SEGREGAÇÃO DEFINITIVA: comandos 18+ ficam SÓ no menu18.
    // A categoria '18' não tem submenu dinâmico → não aparecem em mais
    // nenhum submenu (só no menu18 nativo).
    hentai:'18', ximg:'18', yande:'18', kona:'18', e621:'18', nekos:'18',
    erome:'18', eromevid:'18', livros18:'18', xvideo:'18', xvideodl:'18',
    adultvideo:'18', adultsearch:'18', adultapi:'18', adultmode:'18', adultstats:'18',
    buscar18:'18', fig18:'18', pack18:'18', gif18:'18', shorts18:'18', hotchat:'18',
    figbusca:'18', packbusca:'18', figgif:'18', portal18:'18', menu18:'18',
    // ── v7.25: seleccionar grupo da comunidade (RPG) → owner ──────
    setgrupo:'owner', setarena:'owner', setdungeons:'owner', settrocas:'owner',
    setcavernas:'owner', setlazer:'owner', setarsenal:'owner',
    // ── v7.24: 'outros' → sítio certo ──────────────────────────────
    // Música / cartão som → downloads
    som:'downloads', song:'downloads', faixa:'downloads', track:'downloads', musik:'downloads', disco:'downloads',
    qualmusica:'downloads', identificar:'downloads', pinvideo:'downloads', letra:'jogos',
    // Tradução / frases → texto
    traduzir:'texto', trad:'texto', translate:'texto', frase:'texto',
    // Ajuda / horas / chamadas → info
    help:'info', ajuda:'info', cmds:'info', comandos:'info',
    hora:'info', horas:'info', data:'info', date:'info', agora:'info',
    liga:'info', ligar:'info', desliga:'info', desligar:'info', encerrar:'info',
    call:'info', calls:'info', chamada:'info', chamadas:'info', 'chamada-video':'info', vcall:'info',
    ligame:'info', 'liga-me':'info', ligacao:'info', tocar:'info', tocarcall:'info', playcall:'info', calltocar:'info',
    fala:'info', falacall:'info', dizcall:'info', falanacall:'info', pararmusica:'info', paramusica:'info', stopcall:'info',
    desligacall:'info', endcall:'info', terminarchamada:'info', callstatus:'info', callsativas:'info',
    pausa:'info', para:'info', modochamadas:'info', ligarnum:'info', ligarnumero:'info', callnum:'info', desligarptt:'info',
    antimencao:'admin', antipagamento:'admin', antiinvisivel:'admin', addpalavra:'admin', delpalavra:'admin', palavras:'admin', listapalavras:'admin',
    diag:'info', diagnostico:'info', 'diagnóstico':'info',
    // AURA (moderação da aura) → ia
    auramod:'ia', aurarpg:'ia', moderar:'ia',
    // Código do case → owner
    somcode:'owner', codsom:'owner',
    // RPG → economia
    cozinhar:'economia', desmontar:'economia', encantar:'economia', leaderboard:'economia', ranking:'economia',
    'darkrpg-guia':'economia', rpgguia:'economia', rpgregras:'economia', rpgsetup:'economia',
    // Packs de stickers → stickers
    definestickpack:'stickers', defpack:'stickers', setpack:'stickers', pack:'stickers',
    packlink:'stickers', pacote:'stickers', verpack:'stickers',
    renamestick:'stickers', renomesticker:'stickers', trocarnome:'stickers',
    // Roblox → search
    robloxcode:'search',
    // Eventos → interacoes
    event:'interacoes', evento:'interacoes', eventos:'interacoes',
  };
  if (OVERRIDES[c]) return OVERRIDES[c];
  // Downloads
  if (/^(down|downloads)$/.test(c)) return 'info'; // navegação de submenu
  if (/^(play|video|ytd|gyt|tiktok|instagram|fb|twitter|spotify|soundcloud|pinterest|pinpack|pinmp4|pinsticker|statusvideo|yt3v2|yt4v2|playid|playhq|tomp3|shazam|myinstants|pintemp|instamp|letra|kwai|igstory|gdrive|mediafire|mcplugin|ttk|scdl|spotify2|twitterdl|playvid|pinterest2|sc$)/.test(c)) return 'downloads';
  // Stickers & Imagens
  if (/^(sticker|sfull|figubug|toimg|attp|ttp|imagem|figura|gimage|stickerrename|brat|legenda|figmeme|figraiva|figcoreana|figanime|figroblox|figemoji|figdesenho|figengracada|aisticker|jeff|faber|norian|totext|ptvmsg|gerarlink|rvisu|8d$)/.test(c)) return 'stickers';
  // IA
  if (/^(ia|gpt|chatgpt|gpt4|gpt5|copiloto|claude|pplx|nano|nano2|sys-img|gemma|gemma2|codegemma|qwen|qwen2|qwen3|qwencoder|llama|llama3|phi|phi3|yi|kimi|kimik2|cog|mistral|magistral|baichuan|marin|rakutenai|rocket|swallow|falcon|ideias|explicar|resumir|corrigir|resumirurl|resumirchat|recomendar|debater|aventura|addai|addmetaai|aimemoria|airesetar)/.test(c)) return 'ia';
  // Admin & Grupo
  if (/^(kick|ban|ban2|bam|promote|demote|rebaixar|promover|mute|desmute|mute2|desmute2|del|dam|limpar|marcar|totag|sorteio|nomegp|descgrupo|fotogrupo|addregra|delregra|setregras|regras|setdesc|setnomegrupo|add|adicionar|addmembro|tempban|tempkick|advertir|warn|unwarn|warnings|resetwarn|inativos|inatividade|atividade|participantes|jid|getjid|antidemote|antiflood|antifigurinha|antistatus|antidoc|antiloc|antifig|antibtn|antilinkgp|antilinkcanal|antilinkhard|antilinksoft|antiporn|antitoxic|antipalavra|x9|captcha|aceitatodos|proibir|em|lista|multiprefixo|setbammsg|limparrank|resetrank|mantercontador|blockuser|unblockuser|addblacklist|delblacklist|blockcmd|unblockcmd|automsg|banghost|limitmessage|dellimitmessage|aprovar|recusarsolic|addmod|delmod|grantmodcmd|revokemodcmd|wladd|wl\.|addparceria|delparceria|addautoadm|addautoadmidia|delautoadm|autorepo|autodl|minmessage|assistente|modobn|modoparceria|modorpg|modolite|autosticker|cmdlimit|fotomenugrupo|infoperso|legendasaiu|legendabv|fotobv|rmfotobv|fotosaiu|rmfotosaiu|soadm|open|close|opengp|closegp|actgp|grupo|linkgp|adv|rmadv|listadv|listamute|listblocksgp|listblacklist|listmods|listmodcmds|listautoadm|autorespostas|raidstatus|solicitacoes|antiraid|capturalink|modoraid|parcerias|addparceria|delparceria|admin|admins|tagadmins|link|todos|hidetag|out|sair|leave|bye|setprefix|prefixgrupo|groupprefix|settheme|temagrupo|grouptheme)/.test(c)) return 'admin';
  // Jogos
  if (/^(quiz|resp|forca|jogodavelha|tictactoe|connect4|uno|memoria|wordle|digitar|batalhanaval|stop|anagrama|dueloquiz|cacapalavras|eununca|vab|chance|quando|sn|ppt|dado|moeda|roleta|verdade|desafio|cassino|blackjack|slots|crash|apostar|loteria|corrida|leilao|dados|coinflip)/.test(c)) return 'jogos';
  // Economia & RPG
  if (/^(daily|saldo|coins|depositar|levantar|transferir|doar|bau|roubar|trabalhar|minerar|work|mine|fish|coletar|colher|caçar|plantar|cultivar|cook|eat|vendercomida|explorar|masmorra|bossrpg|evoluir|prestige|streak|reivindicar|speedup|dep|sacar|pix|loja|comprar|vender|emprego|demitir|investir|sell|topriqueza|diario|caixa|rara|lendaria|presente|lojapremium|comprarpremium|boost|propriedades|cprop|cprops|tributos|meustats|dungeon|class|casa|auction|mercado|listar|cmerc|meusan|cancelar|duelrpg|arena|torneio|assaltar|crime|guerra|forge|enchant|dismantle|reparar|materiais|precos|receitas|ingredientes|sementes|plantacao|vagas|habilidades|desafiosemanal|desafiomensal|toprpg|rankglobal|ranklvl|equipamentos|carteira|perfilrpg|inv|rpgstats|rpgadd|rpgremove|rpgsetlevel|rpgadditem|rpgremoveitem|rpgresetplayer|rpgresetglobal)/.test(c)) return 'economia';
  // Interações & Família
  if (/^(abracar|abracarrpg|beijar|beijarrpg|tapa|tapar|soco|socar|dancar|matar|matar|cafune|morder|mordida|lamber|lambida|explodir|sexo|surubao|tomate|goza|gozar|mamar|mamada|beijob|beijarb|casar|divorciar|namorar|terminar|proteger|baterrpg|adotaruser|deserdar|criarcla|convidar|aceitarconvite|recusarconvite|expulsar|rmconvite|casamento|trair|historicotraicao|brincadeira|namoro|relacionamento|casais|familia|arvore|cla|pets|adotar|feed|train|evolve|petbattle|renamepet|petbet|equippet|unequippet|petnome|treinarpet|lojapet|rep|vote|toprep|denunciar|denuncias|conquistas|missoes|eventos)/.test(c)) return 'interacoes';
  // Texto & Fontes
  if (/^(bold|bold2|mini|tiny|smallcaps|scaps|mono|monospace|code|glitch|zalgo|calc|calcular|math|cor|color|randomcolor|base|baseconv|encurtar|short|curto|fakequote|fake-quote|fq|tagme|tagme2|mgs|spoiler|secret|lermais|upload|vazar|renomear|relevar|tabela|conselhos|getperfil|getbio|fazernick|listaddi|listaddd|abv|conselho|conselhobiblico|piada|charada|motivacional|elogio|reflexao|fato|cantadas|filosofia|biblia|horoscopo|idade|age|anos)/.test(c)) return 'texto';
  // Search & Stalk
  if (/^(stalkff|ttstalk|gitubstalk|stalkinsta|anime|anime2|filme|aptoide|rbxcodes|gethtml|idcanal|cep|cnpj|ip|clima|google|noticias|apps|dicionario|wikipedia|pesquisar|resumir|notícias)/.test(c)) return 'search';
  // Audio
  if (/^(bass|bass2|bass3|grave|grave2|grave3|reverb|reverb2|reverb3|8d|8d2|8d3|slowed|slowed2|slowed3|slowedreverb|slowedreverb2|slowedreverb3|chorus|chorus2|chorus3|nightcore|vaporwave|hardcore|robot|chipmunk|squirrel|monster|whisper|pitch|deep|echo|stadium|cave|underwater|telephone|radio|lofi|flanger|phaser|tremolo|vibrato|reverse|karaoke|blown|earrape|fat|smooth|fast|slow|menuaudio)/.test(c)) return 'audio';
  // Logos
  if (/^(darkgreen|write|advanced|typography|pixel|flag|americanflag|deleting|pornhub|avengers|captainamerica|stone3d|neon2|thor|amongus|deadpool|blackpink|naruto|rainbow|shadowsky|smoke|stars|metal|butterfly|cemetery|flaming|gradient|graffiti|harrypotter|neonparty|neonglow|neonmetalic|tiktoktxt|battlefield|pubg|anime|game|ffrose|ffgren|fluffy|lava|cool|comic|fire|water|ice|elegant|gold|fortune|blue|silver|neon|skate|retro|candy|glossy|newyear|tiger|galaxy|dragonfire|goldpink|mascote|titanium|eraser|halloween|snow|america|mascoteneon|doubleexposure|3dcrack|colorful|ballon|multicolor|graffitipaint|graffitistyle|frozen|ligatures|watercolor|summerbeach|cloudsky|techstyle|royal|firework|mascotemetal|captain|graffitiwall|phlogo|glitter|vintage3d)/.test(c)) return 'logos';
  // Info & Perfil
  if (/^(ping|info|perfil|dono|criador|donos|subdono|uptime|status|statusbot|statusgp|system|stats|aiapis|myvip|lid|perfilpic|avaliar|suporte|bug|zipbot|gitbot|likeff|infoff|me|dados|meustatus|totalcmd|topcmd|rankativo|rankinativo|rankativos|checkativo|atividade|rep|toprep|denuncias|conquistas|caixa|diario|roles|role\.|mention|afk|voltei|statusbot|statusgp)/.test(c)) return 'info';
  // Zoeira (medidores)
  if (/^(gay|gay2|lindo|lindo2|linda|feio|feio2|feia|burro|burro2|burra|inteligente|otaku|fiel|infiel|corno|corna|gado|gada|gostoso|gostosa|rico|rica|pobre|safado|safada|vesgo|vesga|bebado|bebada|machista|homofobico|homofobica|racista|chato|chata|sortudo|sortuda|azarado|azarada|forte|fraco|fraca|pegador|pegadora|otario|otaria|macho|bobo|boba|nerd|nerd2|preguicoso|preguicosa|trabalhador|trabalhadora|brabo|braba|malandro|malandra|simpatico|simpatica|engracado|engracada|charmoso|charmosa|misterioso|misteriosa|carinhoso|carinhosa|desumilde|humilde|ciumento|ciumenta|corajoso|corajosa|covarde|esperto|esperta|talarico|talarica|chorao|chorona|brincalhao|brincalhona|bolsonarista|petista|comunista|lulista|traidor|traidora|bandido|bandida|cachorro|cachorra|vagabundo|vagabunda|pilantra|mito|padrao|comedia|psicopata|fortao|fortona|magrelo|magrela|bombado|bombada|chefe|presidente|presidenta|rei|rainha|patrao|patroa|playboy|zueiro|zueira|gamer|programador|programadora|visionario|visionaria|billionario|bilionaria|poderoso|poderosa|vencedor|vencedora|senhor|senhora|fofoqueiro|fofoqueira|dorminhoco|dorminhoca|comilao|comilona|sedentario|sedentaria|atleta|estudioso|estudiosa|romantico|romantica|extrovertido|extrovertida|introvertido|introvertida|calmo|calma|nervoso|nervosa|organizado|organizada|bagunceiro|bagunceira|economico|economica|gastador|gastadora|saudavel|doente|supersticioso|supersticiosa|cetico|cetica|religioso|religiosa|ateu|ateia|tradicional|moderno|moderna|conservador|conservadora|liberal|patriotico|patriotica|cosmopolita|rural|urbano|urbana|aventureiro|aventureira|caseiro|caseira|viajante|local|global|tecnologico|tecnologicas|analogico|analogica|digital|offline|online|social|antisocial|popular|solitario|solitaria|lider|seguidor|seguidora|independente|dependente|criativo|criativa|pratico|pratica|sonhador|sonhadora|realista|otimista|pessimista|confiante|inseguro|insegura|maduro|madura|infantil|serio|seria|sorte|sortudo2|responsavel|irresponsavel|lesbica|bucetuda|ladra|nazista|homofobica|racista|chata|sortuda|azarada|fraca|pegadora|otaria|boba|nerd|preguicosa|trabalhadora|braba|linda|malandra|simpatica|engracada|charmosa|misteriosa|carinhosa|ciumenta|corajosa|esperta|talarica|chorona|brincalhona|traidora|bandida|cachorra|vagabunda|fortona|magrela|bombada|presidenta|rainha|patroa|programadora|visionaria|bilionaria|poderosa|vencedora|senhora|fofoqueira|dorminhoca|comilona|sedentaria|estudiosa|romantica|extrovertida|introvertida|calma|nervosa|organizada|bagunceira|economica|gastadora|supersticiosa|cetica|religiosa|ateia|moderna|conservadora|patriotica|urbana|aventureira|caseira|tecnologicas|analogica|solitaria|seguidora|criativa|pratica|sonhadora|insegura|madura|seria|criente|pecador|ciumao|possessivo|desapegado|sono|insone|dorminhoco2|viciado|viciada|viciadao|invejoso|invejosa|inveja|pirocudo|pirokudo|safado|safada|vesgo|vesga|bebado|bebada)/.test(c)) return 'zoeira';
  // v7.24: rank<adjetivo> é o rank do medidor — fica JUNTO do medidor
  // (zoeira), não num submenu à parte. rankativo/ranklvl/etc já foram
  // apanhados acima (info/economia).
  if (/^rank/.test(c)) return 'zoeira';
  // Owner
  if (/^(broadcast|send|eval|restart|panel|addcase|removicase|downcase|listcases|runcase|reloadcases|setprefix|settheme|temas|change|themeglobal|globaltheme|buttonmode|menustyle|addcmdvip|flood)/.test(c)) return 'owner';
  // Anti-link / Anti-spam / Welcome
  if (/^(antilink|antispam|welcome|goodbye|bemvindo|saida|antistatus|antimencao|antipagamento|antiinvisivel|antiflood|antidoc|antiloc|antifig|antibtn|antiporn|antitoxic|antipalavra|addpalavra|delpalavra|palavras|autosticker)/.test(c)) return 'admin';
  // Flood
  if (/^flood/.test(c)) return 'admin';
  // Relacionamentos
  if (/^(brincadeira|namoro|casamento|trair|historicotraicao|namorar|terminar|relacionamento|casais|casar|divorciar)/.test(c)) return 'interacoes';
  // v6.15: fallback para padrões adicionais
  const extra = categorizeExtra(c);
  if (extra) return extra;
  return 'outros';
}

// ── META DE CADA SUBMENU ─────────────────────────────────────
const { describe } = require('./commandDescriptions');

const SUBMENU_META = {
  downloads:    { title: '📥 DOWNLOADS',              sub: 'Música • Vídeo • Redes Sociais',     btn: '📥 Downloads' },
  stickers:     { title: '🎨 STICKERS & IMAGENS',     sub: 'Figurinhas • Packs • Arte Visual',   btn: '🎨 Stickers' },
  ia:           { title: '🤖 IA & CHATBOTS',           sub: 'Inteligência Artificial com Memória', btn: '🤖 IA' },
  admin:        { title: '👥 ADM & GRUPOS',            sub: 'Moderação • Regras • Automação',     btn: '👥 ADM & GRUPOS' },
  jogos:        { title: '🎮 JOGOS & DIVERSÃO',        sub: 'Quiz • Forca • Casino • Mini-games',  btn: '🎮 Jogos' },
  economia:     { title: '💰 ECONOMIA & RPG',          sub: 'Coins • Bank • RPG • Crafting',       btn: '💰 Economia' },
  interacoes:   { title: '💕 INTERAÇÕES & FAMÍLIA',    sub: 'Abraçar • Beijar • Casar • Pets',     btn: '💕 Interações' },
  texto:        { title: '✍️ TEXTO & UTILIDADES',      sub: 'Fontes • Calc • Frases • Ferramentas', btn: '✍️ Texto' },
  search:       { title: '🔎 SEARCH & STALK',          sub: 'Pesquisas • Stalk • Consultas',       btn: '🔎 Search' },
  audio:        { title: '🎧 EFEITOS DE ÁUDIO',        sub: 'Bass • Reverb • 8D • Slowed • Voz',   btn: '🎧 Áudio' },
  logos:        { title: '🖋️ LOGOS & EFEITOS',         sub: 'Criação de logos e efeitos de texto',  btn: '🖋️ Logos' },
  info:         { title: 'ℹ️ INFO & PERFIL',           sub: 'Ping • Status • Perfil • Diagnóstico', btn: 'ℹ️ Info' },
  zoeira:       { title: '😂 ZOEIRA & MEDIDORES',      sub: 'Medidores • Rankings • Brincadeiras',   btn: '😂 Zoeira' },
  owner:        { title: '👑 DONO & SISTEMA',          sub: 'Broadcast • Eval • Config • Cases',    btn: '👑 Dono' },
};

// ── EMOJIS POR CATEGORIA ─────────────────────────────────────
const CAT_EMOJI = {
  downloads: '📥', stickers: '🎨', ia: '🤖', admin: '🛡️', jogos: '🎮',
  economia: '💰', interacoes: '💕', texto: '✍️', search: '🔎', audio: '🎧',
  logos: '🖋️', info: 'ℹ️', zoeira: '😂', owner: '👑',
};

// ── v7.24: ALIASES — um comando não pode aparecer em 2 submenus ──
// Nem encher o submenu com 5 nomes para a MESMA função (play/music/
// musica/yt/ytmp3 → só play). Deriva-se dos grupos reais do registerCase
// (COMMAND_REGISTRY): o 1.º nome é o canónico, os restantes escondem-se.
const NAO_ESCONDER = new Set(['letra']);   // letra = jogada da forca, não alias

function eAlias(cmd) {
  try {
    const ch = require('./caseHandler');
    const reg = ch.COMMAND_REGISTRY.get(cmd);
    if (!reg || !Array.isArray(reg.aliases) || reg.aliases.length < 2) return false;
    if (NAO_ESCONDER.has(cmd)) return false;
    return reg.aliases[0] !== cmd;
  } catch { return false; }
}

// ── v7.24: SUB-CATEGORIAS dentro de cada submenu ────────────────
// Agrupa os comandos por secção (título + padrão). O 1.º padrão que
// casar ganha; senão cai em "Geral".
const SUBCATEGORIES = {
  downloads: [
    { id: '🎵 Música', re: /^(play|play2|play3|playhq|hq|playmax|music|musica|yt|ytmp3|ytd|baixaraudio|dlmp3|som|song|faixa|track|musik|disco|qualmusica|shazam|identificar|tomp3|letra|spotify|scdl)$/ },
    { id: '🎬 Vídeo', re: /^(video|vid|ytmp4|yt4|gyt|baixarvideo|dlmp4|pinvideo|pinmp4|pinvd|playvid|playid|fhd|fullhd|ytfhd|ythd)$/ },
    { id: '📱 Redes Sociais', re: /^(tiktok|tt|instagram|ig|facebook|fb|twitter|tw|x|pinterest|pinpack|pinpacks|kwai|igstory|gdrive|mediafire|mcplugin|scdl)$/ },
  ],
  admin: [
    { id: '🛡️ Moderação', re: /^(kick|ban|ban2|bam|mute|desmute|mute2|desmute2|tempban|tempkick|warn|advertir|unwarn|warnings|resetwarn|promote|demote|rebaixar|promover|calar|unmute|unadmin|silenciar|del|apagar|deletar|delete|limpar|dam|fakeban|fakelog|fakeedit|fakemsg)$/ },
    { id: '⛔ Protecções (Anti-X)', re: /^(antilink|antilinkgp|antilinkcanal|antilinkhard|antilinksoft|antispam|antiflood|antifigurinha|antistatus|antimencao|antipagamento|antiinvisivel|antidoc|antiloc|antifig|antibtn|antiporn|antitoxic|antipalavra|addpalavra|delpalavra|palavras|antidemote|antiraid|capturalink|captcha|x9)$/ },
    { id: '👋 Boas-vindas & Saída', re: /^(welcome|bemvindo|boasvindas|bv|goodbye|saida|legendabv|legendasaiu|fotobv|rmfotobv|fotosaiu|rmfotosaiu)$/ },
    { id: '👥 Grupo', re: /^(open|abrir|abrir-grupo|close|fechar|fechar-grupo|opengp|closegp|actgp|grupo|setnomegrupo|nomegp|setdesc|descgrupo|fotogrupo|setregras|regras|rules|normas|addregra|delregra|link|linkgp|convite|invite|revoke|resetlink|novo-link|add|adicionar|addmembro|out|sair|leave|bye|todos|hidetag|everyone|all|tagall|marcar|totag|sorteio|participantes|admins|tagadmins|jid|getjid|atividade|inativos|inatividade)$/ },
    { id: '🔐 Permissões & Cargos', re: /^(addmod|delmod|grantmodcmd|revokemodcmd|listmods|listmodcmds|listautoadm|addautoadm|addautoadmidia|delautoadm|whitelist|wladd|wldel|wllist|blockuser|unblockuser|addblacklist|delblacklist|listblacklist|listblocksgp|listamute|listadv|adv|rmadv|addparceria|delparceria|parcerias|aprovar|recusarsolic|solicitacoes)$/ },
    { id: '⚙️ Configuração', re: /^(setprefix|prefixgrupo|groupprefix|multiprefixo|settheme|temagrupo|grouptheme|buttonmode|assistente|modobn|modoparceria|modorpg|modolite|autorespostas|automsg|banghost|blockcmd|unblockcmd|cmdlimit|limitmessage|dellimitmessage|minmessage|autorepo|autodl|autosticker|fotomenugrupo|infoperso|soadm|espiao|raidstatus|list)$/ },
  ],
  economia: [
    { id: '💰 Economia', re: /^(daily|diario|saldo|coins|carteira|caixa|banco|depositar|levantar|transferir|doar|dep|sacar|pix|loja|comprar|vender|sell|emprego|demitir|investir|tributos|cambio|cripto|topriqueza|rankricos|propriedades|cprop|cprops|boost|rara|lendaria|presente)$/ },
    { id: '⚒️ Trabalho', re: /^(trabalhar|work|minerar|mine|pescar|fish|coletar|colher|cacar|plantar|cultivar|cook|cozinhar|eat|vendercomida|assaltar|crime|roubar)$/ },
    { id: '⚔️ RPG', re: /^(rpgstart|newchar|despertar|perfilrpg|ficha|rg|quest|historia|aventura|explorar|explore|lutar|fight|combate|duelrpg|duelar|arena|torneio|masmorra|dungeon|bossrpg|npc|pocao|potion|reviver|revive|evoluir|prestige|streak|vidas|lives|racas|classes|rpginfo|mapa|biomas|world|cartas|gacha|pet|pets|guilda|guild|criarguilda|rankrpg|toprpg|ranking|leaderboard|rankglobal|ranklvl)$/ },
    { id: '🔨 Crafting', re: /^(forge|forjar|enchant|encantar|dismantle|desmontar|reparar|materiais|precos|receitas|ingredientes|sementes|plantacao|equipamentos|gear|qg|bau|inventario|inv|usar)$/ },
    { id: '🏠 Aluguer', re: /^(alugar|desalugar|hospedar|rent|trial|renovar|renew|cancelrent|listrents|statusalugar|meualuguel|gruposalugados|estender)$/ },
  ],
  interacoes: [
    { id: '💕 Carinho', re: /^(abracar|abracarrpg|beijar|beijarrpg|cafune|morder|mordida|lamber|lambida|flertar|chocolate|cafe|cafezinho|paparico|highfive|wave|declarar|elogiar)$/ },
    { id: '🤪 Zoeira Física', re: /^(tapa|tapar|soco|socar|matar|mata|chutar|pontape|bater|espancar|facada|tiro|envenenar|amaldicoar|bencao|bullying|mimimi|cuspir|empurrar|godadm|goza|gozar)$/ },
    { id: '👨‍👩‍👧 Família & Casamento', re: /^(casar|divorciar|namorar|terminar|casamento|namoro|relacionamento|casais|familia|arvore|trair|historicotraicao|proteger|adotaruser|deserdar|casal)$/ },
    { id: '🐾 Pets', re: /^(adotar|feed|train|evolve|petbattle|renamepet|petbet|equippet|unequippet|petnome|treinarpet|lojapet|pet)$/ },
    { id: '🎭 Acções', re: /^(cantar|rir|chorar|dancar|dormir|comer|pedir|pensar|falar|estudar|cuidar|experimentar|desistir|programar|aceitar|recusar|aceitarinvocacao|recusarinvocacao|talk)$/ },
  ],
  texto: [
    { id: '🔤 Fontes', re: /^(bold|bold2|mini|tiny|smallcaps|scaps|mono|monospace|code|glitch|zalgo|negrito|pequeno)$/ },
    { id: '🛠️ Ferramentas', re: /^(calc|calcular|math|base|baseconv|encurtar|short|curto|cor|color|randomcolor|traduzir|trad|translate|renomear)$/ },
    { id: '💬 Frases & Conselhos', re: /^(conselho|conselhobiblico|piada|charada|motivacional|elogio|reflexao|fato|cantada|filosofo|biblia|versiculo|frase|horoscopo|idade|age|anos)$/ },
  ],
  search: [
    { id: '🔍 Stalk', re: /^(stalkff|ttstalk|tikstalk|stalkinsta|instastalk|stalktk|githubstalk|ghstalk|gitubstalk)$/ },
    { id: '📡 Consultas', re: /^(clima|tempo|cep|cnpj|ip|dicionario|dicio|significado|gethtml|idcanal|apps|aptoide|rbxcodes|robloxcodes|robloxcode)$/ },
    { id: '🌐 Web & Notícias', re: /^(google|pesquisar|procurar|search|wikipedia|wiki|noticias|news|jornal|deepsearch|filme|movie|anime|anime2|manga|lermanga|mangacap|capitulo|lercap|episodiosanime|historia)$/ },
  ],
  audio: [
    { id: '🔊 Graves & Bass', re: /^(bass|bass2|bass3|grave|grave2|grave3|earrape|fat|smooth)$/ },
    { id: '🌌 Espaciais & Reverb', re: /^(8d|8d2|8d3|reverb|reverb2|reverb3|echo|stadium|cave|underwater|flanger|phaser|tremolo|vibrato|chorus|chorus2|chorus3|lofi)$/ },
    { id: '🤖 Voz', re: /^(robot|chipmunk|squirrel|monster|whisper|pitch|deep|telephone|radio|karaoke|blown|reverse)$/ },
    { id: '⏩ Velocidade & Estilo', re: /^(slowed|slowed2|slowed3|slowedreverb|slowedreverb2|slowedreverb3|nightcore|vaporwave|hardcore|fast|slow|audiofx|audiomeme)$/ },
  ],
  info: [
    { id: '🤖 Bot', re: /^(ping|info|status|statusbot|statusgp|system|stats|uptime|tempoonline|aiapis|totalcmd|topcmd|likeff|infoff|dono|criador|donos|suporte|bug|zipbot|gitbot|start)$/ },
    { id: '👤 Perfil', re: /^(perfil|me|dados|meustatus|lid|myid|msgid|msginfo|perfilpic|getprefix|prefixo|avaliar|roles|mention|afk|voltei|equipe|subdono|staff|planos|menuplanos|submenuplanos|plans|vip|assinar|premium|myvip|alugar|trial|statusalugar|estender)$/ },
    { id: '📞 Chamadas', re: /^(ligar|liga|ligame|liga-me|ligacao|desligar|desliga|desligacall|endcall|terminarchamada|encerrar|call|calls|chamada|chamadas|chamada-video|vcall|videocall|tocar|tocarcall|playcall|calltocar|fala|falacall|dizcall|falanacall|pararmusica|paramusica|stopcall|callstatus|callsativas)$/ },
    { id: '🕐 Utilidades', re: /^(hora|horas|data|date|agora|help|ajuda|cmds|comandos|menu|diag|diagnostico|diagnóstico|tempo|clima)$/ },
  ],
  stickers: [
    { id: '🎨 Criar', re: /^(sticker|s|fig|figurinha|sfull|figubug|attp|ttp|toimg|aisticker|brat|legenda|totext|ptvmsg)$/ },
    { id: '📦 Packs', re: /^(pinpack|pinpacks|pinsticker|pack|pacote|packlink|verpack|setpack|defpack|definestickpack|sly|slypack|takepack|packname|renamestick|renomesticker|trocarnome|stickerrename)$/ },
    { id: '🔎 Busca', re: /^(figbusca|figgif|figmeme|figraiva|figcoreana|figanime|figroblox|figemoji|figdesenho|figengracada|gimage|imagem)$/ },
    { id: '🏷️ Marca / Watermark', re: /^(stickerwm|definestickwm|setstickwm|stickwmgrupo|definirmarca|textosticker|textsticker|txtsticker)$/ },
  ],
  ia: [
    { id: '💬 Conversa', re: /^(ia|gpt|chat|ask|pergunta|chatgpt|gpt4|gpt5|copiloto|copilot|claude|pplx|llama|llama3|gemma|gemma2|qwen|qwen2|qwen3|kimi|mistral|magistral|explicar|ideias|debater|recomendar|aventura)$/ },
    { id: '🖼️ Imagem', re: /^(imagem|img|imagine|gerar|gimage|sys-img|deepai)$/ },
    { id: '🧠 Memória', re: /^(aimemoria|mymemory|airesetar|resetia|clearmemory|addai|addmetaai)$/ },
    { id: '🌹 AURA', re: /^(auramod|aurarpg|moderar)$/ },
  ],
  jogos: [
    { id: '🎯 Clássicos', re: /^(quiz|forca|adivinha|charada|enigma|eununca|cacapalavras|batalhanaval|genio|wordle|memoria|stop|anagrama|digitar|jogodavelha|tictactoe|velha)$/ },
    { id: '🎲 Sorte & Dados', re: /^(dado|dice|d6|moeda|coin|coinflip|caraoucoroa|flip|roleta|roulette|dados|chance|quando|sn|ppt|jokenpo)$/ },
    { id: '🃏 Apostas & Casino', re: /^(cassino|blackjack|slots|crash|apostar|loteria|corrida|leilao|truco|bingo|russa|akinator|combate|simular|palavra|chute|termo|vab)$/ },
  ],
  logos: [
    { id: '🖋️ Logos', re: /^(darkgreen|write|advanced|typography|pixel|flag|americanflag|deleting|pornhub|avengers|captainamerica|thor|amongus|deadpool|blackpink|naruto|harrypotter|battlefield|pubg|anime|game|blackhzx|blood|cemiterio|ffavatar|ffrose|ffgren|neymar|placaneymar)$/ },
    { id: '✨ Efeitos', re: /^(stone3d|neon2|rainbow|shadowsky|smoke|stars|metal|butterfly|flaming|gradient|graffiti|neonparty|neonglow|neonmetalic|tiktoktxt|lava|cool|comic|fire|water|ice|elegant|gold|fortune|blue|silver|neon|skate|retro|candy|glossy|newyear|tiger|galaxy|dragonfire|goldpink|mascote|titanium|eraser|halloween|snow|america|mascoteneon|doubleexposure|3dcrack|colorful|ballon|multicolor|graffitipaint|graffitistyle|frozen|ligatures|watercolor|summerbeach|cloudsky|techstyle|royal|firework|mascotemetal|captain|graffitiwall|phlogo|glitter|vintage3d)$/ },
  ],
  zoeira: [
    { id: '📏 Medidores', re: /.*/ },   // zoeira é SÓ medidores — 1 grupo
  ],
  owner: [
    { id: '🏰 RPG / Comunidade', re: /^(darkrpg|rpginit|iniciar-rpg|setgrupo|setarena|setdungeons|settrocas|setcavernas|setlazer|setarsenal|criaclan|criaclã|newclan|menu-rpg|menurpg|rpgmenu|rpgmenu2|comunicado|arsenal|ranking-update|addglb|addglobal|darkrpg-status|rpgstatus|darkrpg-test|rpgtest)$/ },
    { id: '📡 C∆P Capture', re: /^(cap|capture|captura|c∆p)$/ },
    { id: '👑 Sistema', re: /^(broadcast|send|eval|exec|shell|restart|shutdown|panel|autodecrypt|prefixos|buttonmode|menustyle)$/ },
    { id: '🧩 Cases', re: /^(addcase|removicase|downcase|listcases|runcase|reloadcases|execcase|testcase|testcasecode|viewcase|getcasecode|listcase|mycases|validarcase|verificarcmds|cmdcheck|vercode|audit|auditcmds|recarregarcases|refreshcases|removecase|remcase|showcase|newcase|listcmds|somcode|codsom)$/ },
    { id: '🎨 Temas', re: /^(change|tema|settheme|themes|temas|listtemas|listthemes|themechange|themeglobal|globaltheme|mudarstema)$/ },
  ],
};

/** Devolve o id da sub-categoria de um comando dentro de uma categoria. */
function subcategorize(cmd, category) {
  const grupos = SUBCATEGORIES[category];
  if (!grupos) return 'Geral';
  for (const g of grupos) {
    if (g.re.test(cmd)) return g.id;
  }
  return 'Geral';
}

// ── CONSTRUIR ITENS DE UM SUBMENU ────────────────────────────
function buildItems(commands, category) {
  const caseHandler = require('./caseHandler');
  const nativeCommands = require('./nativeCommands');
  const packageCommands = {
    ...require('./packages/interactions'),
    ...require('./packages/family'),
    ...require('./packages/economy'),
    ...require('./packages/games'),
    ...require('./packages/cheats'),
  };
  
  return commands
    .filter(cmd => {
      // Filtrar comandos sem função E internos (ex: _adultSend, __change_theme_handler__)
      if (typeof cmd === 'string' && cmd.startsWith('_')) return false;
      const hasFunction = caseHandler.CASES.has(cmd) || 
                          typeof nativeCommands[cmd] === 'function' || 
                          typeof packageCommands[cmd] === 'function';
      if (!hasFunction || categorize(cmd) !== category) return false;
      // v7.24: um comando NÃO aparece em 2 submenus nem como alias
      // (play/music/musica/yt → só play). O alias continua a funcionar
      // digitado — só não polui o submenu.
      if (eAlias(cmd)) return false;
      return true;
    })
    .sort()
    .map(cmd => ({
      cmd,
      emoji: CAT_EMOJI[category] || '📌',
      // v6.47: era `desc: ''` fixo — TODOS os 1564 itens dos submenus
      // saíam sem descrição, o que produzia o "undefined" no WhatsApp.
      desc: describe(cmd, category),
      sel: isSelectable(cmd),
      subcat: subcategorize(cmd, category),   // v7.24: secção dentro do submenu
    }));
}

// ── OBTER TODOS OS SUBMENUS COM ITENS ────────────────────────
function getAllSubmenus(allCommands) {
  const result = {};
  for (const [cat, meta] of Object.entries(SUBMENU_META)) {
    const items = buildItems(allCommands, cat);
    if (items.length > 0) {
      result[cat] = { ...meta, items };
    }
  }
  return result;
}

// ── OBTER MENU PRINCIPAL (lista de submenus) ─────────────────
function getMainMenuSections(allSubmenus) {
  const sections = [];
  // Secção 1: Menus diversos
  const sec1 = { title: '📋 MENUS', rows: [] };
  const sec2 = { title: '⚡ AÇÕES DIRECTAS', rows: [] };

  for (const [cat, data] of Object.entries(allSubmenus)) {
    if (cat === 'owner') continue; // owner só aparece para dono
    sec1.rows.push({
      header: `${data.title}`,
      title: data.sub,
      id: `menu_${cat}`,
    });
  }
  sections.push(sec1);

  // Secção 2: Comandos de ação directa (sel)
  const directCmds = [];
  for (const [, data] of Object.entries(allSubmenus)) {
    for (const item of data.items) {
      if (item.sel) directCmds.push(item);
    }
  }
  if (directCmds.length > 0) {
    sec2.rows = directCmds.slice(0, 30).map(item => ({
      header: `${item.emoji} ${item.cmd}`,
      title: item.desc || 'Executar directamente',
      id: item.cmd,
    }));
    sections.push(sec2);
  }

  return sections;
}


// ── PADRÕES ADICIONAIS (v6.15) ──────────────────────────────────
function categorizeExtra(c) {
  // Downloads extras
  if (/^(baixaraudio|baixarvideo|dlmp3|dlmp4|dlmp3s|dlmp4s|ytaudio|ytmp3|ytmp4|ytmp3s|ytmp4s|ytplay4|yt4k|yt4|fhd|vid|vid2|down|downloads|facebook|fbvideo|fbfoto|fbpost|fbstory|fbstatus|tw|tt|tiktok2|instagram2|pinterest2|pinmp4|pinvd|spotify2|scdl|soundcloud2|letra|kwai|igstory|gdrive|mediafire|mcplugin|tomp3|shazam|myinstants|pintemp3|pintemp4|instamp3|instamp4|playid|playhq|yt3v2|yt4v2|sc$)/.test(c)) return 'downloads';
  // Stickers extras
  if (/^(fig|figurinha|textosticker|textsticker|txtsticker|pinpacks|pinpack|pinsticker|stickerwm|definestickwm|setstickwm|stickwmgrupo|definirmarca|watermark|sfull2|figubug3|aisticker|jeff|faber|norian|totext|ptvmsg|gerarlink|rvisu|brat2|legenda|figmeme|figraiva|figcoreana|figanime|figroblox|figemoji|figdesenho|figengracada)/.test(c)) return 'stickers';
  // IA extras
  if (/^(copilot|copiloto|chat|ask|chatgpt2|gpt3|gpt4|gpt5|checkia|clearmemory|addai|addmetaai)/.test(c)) return 'ia';
  // Admin extras
  if (/^(unmute|unadmin|calar|fechar|fechar-grupo|abrir|abrir-grupo|everyone|all|whitelist|wladd|wldel|wllist|definirregras|setregras|regras|avisos|aviso|chamar|clearwarn|verwarns|fakeedit|fakemsg|editarmsg|copiar|copymsg|citar|blacklist|unblacklist|antidemote|antiflood|antifigurinha|antistatus|antidoc|antiloc|antifig|antibtn|antilinkgp|antilinkcanal|antilinkhard|antilinksoft|antiporn|antitoxic|antipalavra|x9|captcha|aceitatodos|proibir|multiprefixo|setbammsg|limparrank|resetrank|mantercontador|blockuser|unblockuser|addblacklist|delblacklist|blockcmd|unblockcmd|automsg|banghost|limitmessage|dellimitmessage|aprovar|recusarsolic|addmod|delmod|grantmodcmd|revokemodcmd|listmods|listmodcmds|listautoadm|autorespostas|raidstatus|solicitacoes|antiraid|capturalink|modoraid|parcerias|addparceria|delparceria|addautoadm|addautoadmidia|delautoadm|autorepo|autodl|minmessage|assistente|modobn|modoparceria|modorpg|modolite|autosticker|cmdlimit|fotomenugrupo|infoperso|legendasaiu|legendabv|fotobv|rmfotobv|fotosaiu|rmfotosaiu|soadm|opengp|closegp|actgp|adv|rmadv|listadv|listamute|listblocksgp|listblacklist|apagar|deletar|delete|del|dam|limpar|marcar|totag|sorteio|nomegp|descgrupo|fotogrupo|addregra|delregra|setdesc|setnomegrupo|add|adicionar|addmembro|tempban|tempkick|advertir|warn|unwarn|warnings|resetwarn|inativos|inatividade|atividade|participantes|jid|getjid|convite|link|linkgp|admins|tagadmins|hidetag|out|sair|leave|bye|setprefix|prefixgrupo|groupprefix|settheme|temagrupo|grouptheme|boasvindas|bv|welcome|goodbye|saida|bemvindo)/.test(c)) return 'admin';
  // Jogos extras
  if (/^(coin|dice|d6|dado2|moeda2|ppt2|quiz2|forca2|jogodavelha2|tictactoe2|connect4|uno|memoria|wordle|digitar|batalhanaval|stop|anagrama|dueloquiz|cacapalavras|eununca|vab|chance|quando|sn|cassino|blackjack|slots|crash|apostar|loteria|corrida|leilao|dados|coinflip)/.test(c)) return 'jogos';
  // Economia/RPG extras
  if (/^(ficha|explore|explorar2|rg|perfilrpg|rankrg|nome|rankricos|carteira|inv|equipamentos|toprpg|rankglobal|ranklvl|rpgstats|rpgadd|rpgremove|rpgsetlevel|rpgadditem|rpgremoveitem|rpgresetplayer|rpgresetglobal|dep|sacar|pix|loja|comprar|vender|emprego|demitir|investir|sell|topriqueza|diario|caixa|rara|lendaria|presente|lojapremium|comprarpremium|boost|propriedades|cprop|cprops|tributos|meustats|dungeon|class|casa|auction|mercado|listar|cmerc|meusan|cancelar|duelrpg|arena|torneio|assaltar|crime|guerra|forge|enchant|dismantle|reparar|materiais|precos|receitas|ingredientes|sementes|plantacao|vagas|habilidades|desafiosemanal|desafiomensal|meditar|gear|qg|masmorra|bossrpg|eventos|missoes|conquistas|streak|reivindicar|speedup|prestige|evoluir|pescar|fish|coletar|colher|cacar|plantar|cultivar|cook|eat|vendercomida|trabalhar|minerar|work|mine)/.test(c)) return 'economia';
  // Interações extras
  if (/^(abraco|beijo|casar|divorciar|namorar|terminar|proteger|baterrpg|adotaruser|deserdar|criarcla|convidar|aceitarconvite|recusarconvite|expulsar|rmconvite|casamento|trair|historicotraicao|brincadeira|namoro|relacionamento|casais|familia|arvore|cla|pets|adotar|feed|train|evolve|petbattle|renamepet|petbet|equippet|unequippet|petnome|treinarpet|lojapet|rep|vote|toprep|denunciar|denuncias)/.test(c)) return 'interacoes';
  // Texto extras
  if (/^(cantada|bible|versiculo|filosofo|filosofia2|piada2|charada2|motivacional2|elogio2|reflexao2|fato2|conselho2|conselhobiblico|horoscopo2|cor2|color2|randomcolor|base2|baseconv|encurtar2|short2|curto2|fakequote2|fq2|tagme2|tagme2|mgs2|spoiler|secret|lermais2|upload2|vazar2|renomear2|relevar2|tabela2|conselhos2|getperfil2|getbio2|fazernick2|listaddi2|listaddd2|abv2|bold2|mini2|tiny2|smallcaps2|scaps2|mono2|monospace2|code2|glitch2|zalgo2|calc2|calcular2|math2)/.test(c)) return 'texto';
  // Search extras
  if (/^(tikstalk|ttstalk|gitubstalk|stalkinsta|stalkff|anime2|filme2|aptoide|rbxcodes|gethtml|idcanal|cep|cnpj|ip|clima2|google|noticias|apps|dicionario|wikipedia|pesquisar|resumir|notícias)/.test(c)) return 'search';
  // Logos extras
  if (/^(blackhzx|blood|cemiterio|ffavatar|lolavatar|pubgavatar|amongus|captain|deadpool|blackpink|thor|stone3d|neon2|graffiti2|harrypotter|neonparty|neonglow|neonmetalic|tiktoktxt|battlefield|pubg|naruto|rainbow|shadowsky|smoke|stars|metal|butterfly|cemetery|flaming|gradient|darkgreen|write|advanced|typography|pixel|flag|americanflag|deleting|pornhub|avengers|captainamerica)/.test(c)) return 'logos';
  // Info extras
  if (/^(vip|assinar|myvip|statusbot|statusgp|system|stats|uptime|tempoonline|aiapis|lid|perfilpic|avaliar|suporte|bug|zipbot|gitbot|likeff|infoff|me|dados|meustatus|totalcmd|topcmd|rankativo|rankinativo|rankativos|checkativo|roles|mention|afk|voltei|equipe|subdono|donos|criador|dono|info|perfil|ping)/.test(c)) return 'info';
  // Audio extras
  if (/^(8d|8d2|8d3|bass2|bass3|grave2|grave3|reverb2|reverb3|slowed2|slowed3|slowedreverb2|slowedreverb3|chorus2|chorus3|nightcore|vaporwave|hardcore|robot|chipmunk|squirrel|monster|whisper|pitch|deep|echo|stadium|cave|underwater|telephone|radio|lofi|flanger|phaser|tremolo|vibrato|reverse|karaoke|blown|earrape|fat|smooth|fast|slow|menuaudio)/.test(c)) return 'audio';
  // Owner extras
  if (/^(cmdsocultos|portal18|themechange|themes|broadcast|send|eval|shell|execcase|testcase|viewcase|listcases|downcase|addcase|removicase|reloadcases|runcase|panel|restart|autodecrypt|prefixos|blackhzx|espiar|antidelete)/.test(c)) return 'owner';
  return null;
}

module.exports = {
  isSelectable,
  categorize,
  eAlias,
  subcategorize,
  buildItems,
  getAllSubmenus,
  getMainMenuSections,
  SUBMENU_META,
  SUBCATEGORIES,
  CAT_EMOJI,
  SEL_PATTERNS,
};
