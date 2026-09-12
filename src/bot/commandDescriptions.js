/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║   DARK BOT — Descrições de Comandos v1                       ║
 * ║   Nenhum comando aparece nos submenus sem explicação         ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * O PROBLEMA (medido):
 *   submenuData.buildItems() tinha `desc: ''` hardcoded — os 1564
 *   itens dos submenus saíam TODOS sem descrição. Era isso que
 *   produzia o "RESPONSAVEL — undefined" que apareceu no WhatsApp.
 *   O commandCatalog só cobre 274 comandos (15%).
 *
 * A SOLUÇÃO — três camadas, por ordem de qualidade:
 *   1. commandCatalog          — descrição escrita à mão (melhor)
 *   2. Dicionário por padrão   — famílias de comandos (bass, logo…)
 *   3. Derivação do nome       — último recurso, mas sempre legível
 *
 * Garantia: describe() NUNCA devolve vazio, null ou "undefined".
 */

'use strict';

// ── 1. Famílias de comandos (prefixo/sufixo → descrição) ────
// A ordem importa: o primeiro padrão que casar é usado.
const PADROES = [
  // Áudio — efeitos
  [/^(bass|grave)\d*$/,          'Reforça os graves do áudio'],
  [/^reverb\d*$/,                'Adiciona eco de sala ao áudio'],
  [/^8d\d*$/,                    'Efeito 8D — som a girar à volta'],
  [/^slowedreverb\d*$/,          'Áudio lento com reverb (slowed + reverb)'],
  [/^slowed\d*$/,                'Deixa o áudio mais lento'],
  [/^nightcore\d*$/,              'Acelera o áudio e sobe o tom'],
  [/^vaporwave\d*$/,             'Efeito vaporwave — lento e sonhador'],
  [/^chorus\d*$/,                'Efeito coro — engrossa a voz'],
  [/^(robot|robo)\d*$/,          'Transforma a voz em robô'],
  [/^(chipmunk|squirrel)\d*$/,   'Voz aguda de esquilo'],
  [/^(monster|demon)\d*$/,       'Voz grave de monstro'],
  [/^whisper\d*$/,               'Transforma o áudio em sussurro'],
  [/^(deep|pitch)\d*$/,          'Altera o tom da voz'],
  [/^echo\d*$/,                  'Adiciona eco ao áudio'],
  [/^(stadium|cave|underwater|telephone|radio)\d*$/, 'Simula o ambiente no áudio'],
  [/^lofi\d*$/,                  'Efeito lo-fi — som retro e suave'],
  [/^(flanger|phaser|tremolo|vibrato)\d*$/, 'Efeito de modulação no áudio'],
  [/^reverse\d*$/,               'Toca o áudio ao contrário'],
  [/^karaoke\d*$/,               'Remove a voz e deixa o instrumental'],
  [/^(earrape|blown)\d*$/,       'Distorce o áudio ao máximo'],
  [/^(fat|smooth|fast|slow|hardcore)\d*$/, 'Efeito de áudio'],

  // Downloads
  [/^(play|ytmp3|ytaudio)\d*$/,  'Baixa música do YouTube'],
  [/^(video|ytmp4|ytvideo)\d*$/, 'Baixa vídeo do YouTube'],
  [/^(tiktok|tt)\d*$/,           'Baixa vídeo do TikTok'],
  [/^(insta|ig|instagram)\d*$/,  'Baixa mídia do Instagram'],
  [/^(face|fb|facebook)\d*$/,    'Baixa vídeo do Facebook'],
  [/^(twitter|x|tw)\d*$/,        'Baixa vídeo do Twitter/X'],
  [/^(pin|pinterest)\d*$/,       'Baixa imagem do Pinterest'],
  [/^(kwai|snack)\d*$/,          'Baixa vídeo do Kwai'],
  [/^(spotify|spot)\d*$/,        'Baixa música do Spotify'],
  [/^(soundcloud|sc)\d*$/,       'Baixa áudio do SoundCloud'],
  [/^(mediafire|mf|gdrive|drive)\d*$/, 'Baixa ficheiro do link'],
  [/^apk\d*$/,                   'Procura e baixa aplicações Android'],
  [/^(dlmp3|dlmp3s|baixaraudio|audiodl)\d*$/, 'Baixa o áudio de um link'],
  [/^(dlmp4|baixarvideo|videodl)\d*$/, 'Baixa o vídeo de um link'],
  [/^(down|downloads|dl)\d*$/,   'Abre o menu de downloads'],

  // ── Conteúdo +18 (descrições específicas — antes dos padrões genéricos) ──
  [/^(hentai|ximg|yande|kona|e621|nekos|erome|eromevid|livros18)\d*$/, 'Busca conteúdo +18 (só Dono/VIP)'],
  [/^(fig18|pack18|gif18|shorts18)\d*$/, 'Conteúdo +18 em figurinha/pack/GIF (só Dono)'],
  [/^(xvideo|xvideodl|adultvideo|adultsearch|adultapi|adultmode|adultstats|buscar18)\d*$/, 'Vídeos/config +18 (só Dono)'],
  [/^(menu18|menu-rpg|menumais|maiscmds|cmdsocultos|menudono|menurpgfull|menurpg2)$/, 'Abre um menu especial'],
  [/^ranking-update$/,             'Actualiza o ranking do RPG'],

  // Stickers e imagem
  [/^(s|sticker|fig|figu|figurinha)\d*$/, 'Cria figurinha a partir de imagem ou vídeo'],
  [/^(toimg|toimage|img)\d*$/,   'Converte figurinha em imagem'],
  [/^(tovideo|tomp4|togif)\d*$/, 'Converte figurinha em vídeo ou GIF'],
  [/^(rmbg|removebg|nobg)\d*$/,  'Remove o fundo da imagem'],
  [/^(hd|upscale|remini)\d*$/,   'Melhora a qualidade da imagem'],
  [/^(emojimix|emix)\d*$/,       'Junta dois emojis numa figurinha'],
  [/^(attp|ttp)\d*$/,            'Transforma texto em figurinha'],
  [/^(brat|bratvideo)\d*$/,      'Cria figurinha estilo brat'],
  [/^(qc|quote)\d*$/,            'Cria figurinha de citação'],
  [/^(definestickwm|setstickwm|stickwmgrupo|definirmarca|defpack|definestickpack|setpack|packlink|verpack)$/, 'Define o pack e o link do «Ver pacote de figurinhas»'],
  [/^fig(anime|coreana|desenho|emoji|engracada|meme|raiva|roblox)$/, 'Pack de figurinhas por categoria (Sticker.ly)'],
  [/^gif$/, 'Envia um GIF por busca'],
  [/^(pack|pacote)$/, 'Muda nome/autor/slogan/link do pack de figurinhas (global ou do grupo)'],
  [/^(stickerrename|renamesticker|renomesticker|renamestick|renomear|trocarnome|packname)$/, 'Renomeia o pack/autor de qualquer sticker (responde a um sticker)'],
  [/^(nome|rename|nomear)$/,       'Define o nome do teu personagem RPG'],

  // Logos e efeitos de texto
  [/^logo/,                      'Gera um logo com o teu texto'],
  [/\b(naruto|neon\w*|rainbow|graffiti\w*|fire\w*|water\w*|ice\w*|gold\w*|silver\w*|galaxy\w*|retro\w*|metal\w*|titanium|smoke|snow|blood|stone3d|3dcrack|vintage3d|gradient|multicolor|colorful|glitter|glossy\w*|frozen|harrypotter|halloween|blackpink|pubg|battlefield|avengers|captain\w*|thor|deadpool|amongus|ffrose|ffgren|dragonfire|doubleexposure|summerbeach|cloudsky|shadowsky|watercolor|techstyle|royal|firework|ballon|stars|butterfly|flaming|cemetery|america\w*|flag|pixel|typography|ligatures|write|deleting|darkgreen|mascote\w*|lolavatar|skate\w*|phlogo|eraser|tiger|elegant\w*|fluffy\w*|fortune\w*|candy\w*|comic\w*|cool\w*|blue\w*|lava\w*|newyear|goldpink|pornhub|glitch|thunder|sand|steel|wood|glass|matrix)\b/,
                                 'Cria um logo estilizado com o teu texto'],

  // IA
  [/^(ia|ai|gpt|chatgpt|bard|claude|gemini|llama|qwen|copilot|deepseek)\d*$/, 'Conversa com a inteligência artificial'],
  [/^(imagine|imagem|img2|dalle|sd|flux)\d*$/, 'Gera uma imagem com IA'],
  [/^(traduz|traduzir|translate|tr)\d*$/, 'Traduz texto para outro idioma'],
  [/^(resumir|resumo|summarize)\d*$/, 'Resume um texto longo'],
  [/^(transcrever|transcribe|stt)\d*$/, 'Transcreve áudio para texto'],
  [/^(tts|voz|speak)\d*$/,        'Converte texto em voz'],
  [/^(npc|falar|talk)$/,           'Fala com um NPC do RPG'],

  // Administração de grupo
  [/^(ban|kick|remover|expulsar)\d*$/, 'Remove um membro do grupo'],
  [/^(add|adicionar)\d*$/,       'Adiciona alguém ao grupo'],
  [/^(promote|promover|daradm)\d*$/, 'Promove um membro a admin'],
  [/^(demote|rebaixar|tiraradm)\d*$/, 'Remove o cargo de admin'],
  [/^(mute|silenciar|fechar|close)\d*$/, 'Fecha o grupo — só admins falam'],
  [/^(unmute|abrir|open)\d*$/,   'Abre o grupo — todos podem falar'],
  [/^(warn|advertir|adv)\d*$/,   'Dá uma advertência a um membro'],
  [/^antilink/,                  'Controla o bloqueio de links no grupo'],
  [/^antispam/,                  'Controla o bloqueio de spam no grupo'],
  [/^anti/,                      'Activa ou desactiva uma protecção do grupo'],
  [/^(welcome|bemvindo|boasvindas)/, 'Configura a mensagem de boas-vindas'],
  [/^(marcar|tagall|todos|hidetag)\d*$/, 'Menciona todos os membros do grupo'],
  [/^(linkgrupo|link|convite)\d*$/, 'Mostra o link de convite do grupo'],

  // Economia e RPG
  [/^(saldo|balance|carteira|wallet)\d*$/, 'Mostra o teu saldo de coins'],
  [/^(daily|diario|bonus)\d*$/,  'Recebe a recompensa diária'],
  [/^(trabalhar|work|emprego)\d*$/, 'Trabalha para ganhar coins'],
  [/^(minerar|mine|garimpar)\d*$/, 'Minera para ganhar recursos'],
  [/^(apostar|bet|cassino|casino)\d*$/, 'Aposta os teus coins'],
  [/^(transferir|pix|pagar|pay)\d*$/, 'Transfere coins a outro membro'],
  [/^(loja|shop|comprar|buy)\d*$/, 'Abre a loja do bot'],
  [/^(inventario|inv|mochila)\d*$/, 'Mostra o teu inventário'],
  [/^(roubar|assaltar|steal)\d*$/, 'Tenta roubar coins de alguém'],

  // Interações
  [/^(abracar|abraco|hug)\d*$/,  'Abraça alguém'],
  [/^(beijar|beijo|kiss)\d*$/,   'Beija alguém'],
  [/^(casar|casamento|marry)\d*$/, 'Pede alguém em casamento'],
  [/^(divorciar|divorcio)\d*$/,  'Termina o casamento'],
  [/^(matar|kill|socar|tapa|chutar|bater)\d*$/, 'Interage de forma brincalhona'],

  // Jogos
  [/^(quiz|perguntas)\d*$/,      'Joga um quiz de perguntas'],
  [/^(forca|hangman)\d*$/,       'Joga o jogo da forca'],
  [/^(velha|jogodavelha|ttt)\d*$/, 'Joga o jogo do galo'],
  [/^(dado|dice|roll)\d*$/,      'Lança um dado'],
  [/^(moeda|coin|caracoroa)\d*$/, 'Atira uma moeda ao ar'],
  [/^(roleta|roulette)\d*$/,     'Roda a roleta da sorte'],
  [/^(ppt|pedrapapel)\d*$/,      'Joga pedra, papel ou tesoura'],

  // Zoeira e medidores
  [/^(gay|lesbica|corno|otaku|nerd|burro|feio|bonito|gostoso|safado|pilantra|macho|nojento)\d*$/,
                                 'Medidor de brincadeira — resultado aleatório'],
  [/(metro|medidor|nivel)$/,     'Medidor de brincadeira'],
  [/^(shipar|ship|shipo|casal)\d*$/,   'Faz o par entre duas pessoas'],
  [/^(atleta|pecador|possessivo|desapegado|sono|insone|sorte|sortudo|ciume|ciumao|inveja|invejoso|invejosa|viciado|viciada|viciadao|dorminhoco|bebado|doido|fraco|lindo)\d*$/, 'Medidor de brincadeira — resultado aleatório com GIF'],
  [/^(pirocudo|pirokudo|malucao|crente|ateu|ateia)\d*$/, 'Medidor de brincadeira — resultado aleatório com GIF'],
  [/^genio\d*$/,                 'Charadas de lógica (vale coins)'],
  [/^(speedup|reivindicar|streak)\d*$/, 'Acelera/reivindica recompensas do RPG'],
  [/^desafiosemanal\d*$/,        'Desafio da semana (rotativo)'],
  [/^desafiomensal\d*$/,         'Desafio do mês (rotativo)'],
  [/^(rank|ranking|top)/,        'Mostra o ranking do grupo'],

  // Pesquisa
  [/^(google|pesquisar|search|buscar)\d*$/, 'Pesquisa na internet'],
  [/^(wiki|wikipedia)\d*$/,      'Procura na Wikipédia'],
  [/^(letra|lyrics)\d*$/,        'Procura a letra de uma música'],
  [/^(clima|tempo|weather)\d*$/, 'Mostra a previsão do tempo'],
  [/^(cep|cnpj|cpf|ddd)\d*$/,    'Consulta dados públicos'],
  [/^(stalk|perfil)/,            'Mostra informações de um perfil'],

  // Texto
  [/^(negrito|bold|italico|sublinhado|riscado|mini|invertido|vaporfont)\d*$/, 'Formata o teu texto'],
  [/^(calc|calcular|math)\d*$/,  'Faz um cálculo matemático'],
  [/^(frase|citacao|conselho|motivacao)\d*$/, 'Envia uma frase inspiradora'],
  [/^(piada|humor|zoeira)\d*$/,  'Conta uma piada'],
  [/^(binario|base64|hex|md5|sha1|sha256|sha512)\d*$/, 'Codifica ou descodifica texto'],
  [/^(shazam|identificar|qualmusica)$/, 'Identifica a música pela letra'],

  // Info e sistema
  [/^(ping|speed|lat)\d*$/,      'Mostra a velocidade de resposta do bot'],
  [/^(info|sobre|about|status)\d*$/, 'Informações sobre o bot'],
  [/^(dono|owner|criador)\d*$/,  'Mostra o contacto do dono'],
  [/^(menu|help|ajuda|comandos)/, 'Mostra o menu de comandos'],
  [/^(vip|premium|planos)\d*$/,  'Vê os planos VIP'],

  // Dono
  [/^(broadcast|bc|transmitir)\d*$/, 'Envia uma mensagem a todos os grupos'],
  [/^(eval|exec|shell|term)\d*$/, 'Executa código — só o dono'],
  [/^(restart|reiniciar|shutdown)\d*$/, 'Controla o processo do bot'],
  [/^(block|unblock|bloquear)\d*$/, 'Bloqueia ou desbloqueia um contacto'],
  [/^(setprefix|prefixo)\d*$/,   'Muda o prefixo dos comandos'],
];

// ── 2. Palavras-chave soltas (fallback intermédio) ──────────
// v6.47: âncoras ^ e $ em vez de procura livre. Sem elas, 'som' casava
// dentro de 'someRandomCmd' e 'ia' dentro de quase tudo — davam
// descrições erradas com ar de correctas, que é pior do que nenhuma.
// v6.47: cada alternativa tem de ser a palavra INTEIRA no início ou no
// fim do nome. Sem isto 'som' casava dentro de 'someRandomCmd' e dava
// uma descrição errada com ar de correcta — pior do que não ter.
const PALAVRAS = [
  [/^(audio|som|voz|music)(\d*)$|(audio|voz|som)$/, 'Comando de áudio'],
  [/^(img|imagem|foto|photo|pic)(\d*)$|(imagem|foto)$/, 'Comando de imagem'],
  [/^(video|vid|mp4)(\d*)$|video$/,       'Comando de vídeo'],
  [/^(grupo|group|adm|admin)(\d*)$|(grupo|adm)$/, 'Comando de administração de grupo'],
  [/^(coin|money|dinheiro|bank|eco)(\d*)$|(coins|money)$/, 'Comando de economia'],
  [/^(game|jogo)(\d*)$|jogo$/,            'Comando de jogo'],
  [/^(sticker|fig)(\d*)$|sticker$/,       'Comando de figurinhas'],
  [/^(text|texto|font|fonte)(\d*)$|texto$/, 'Comando de texto'],
  [/^(download|baixar|dl)(\d*)$|download$/, 'Comando de download'],
  [/^(gpt|chatbot)(\d*)$/,                'Comando de inteligência artificial'],
];

/** Torna o nome do comando legível: 'slowedreverb2' → 'Slowed reverb 2'. */
function humanizar(cmd) {
  return String(cmd || '')
    .replace(/[_-]+/g, ' ')
    .replace(/([a-zà-ú])([A-ZÀ-Ú])/g, '$1 $2')  // camelCase
    .replace(/([a-zà-ú])(\d)/gi, '$1 $2')        // letra→número
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

let _catalogo = null;
function catalogo() {
  if (_catalogo) return _catalogo;
  _catalogo = new Map();
  try {
    const cc = require('./commandCatalog');
    for (const c of (cc.CATALOG || [])) {
      if (c?.name && c?.description) _catalogo.set(c.name, c.description);
    }
  } catch {}
  return _catalogo;
}

const _cache = new Map();

/**
 * Devolve a descrição de um comando. NUNCA vazio nem "undefined".
 *
 * @param {string} cmd       nome do comando
 * @param {string} categoria categoria do submenu (usada no fallback)
 * @returns {string}
 */
function describe(cmd, categoria = '') {
  if (!cmd) return 'Comando do bot';
  const nome = String(cmd).toLowerCase().trim();

  const hit = _cache.get(nome);
  if (hit) return hit;

  let d = '';

  // 1. Catálogo escrito à mão
  const doCatalogo = catalogo().get(nome);
  if (doCatalogo && String(doCatalogo).trim() && !/undefined/i.test(doCatalogo)) {
    d = String(doCatalogo).trim();
  }

  // 2. Famílias de comandos
  if (!d) {
    for (const [re, texto] of PADROES) {
      if (re.test(nome)) { d = texto; break; }
    }
  }

  // 3. Palavras-chave
  if (!d) {
    for (const [re, texto] of PALAVRAS) {
      if (re.test(nome)) { d = texto; break; }
    }
  }

  // 4. Último recurso: nome legível (nunca fica vazio)
  if (!d) {
    const CAT_TXT = {
      downloads: 'Download', stickers: 'Figurinhas', ia: 'IA', admin: 'Grupo',
      jogos: 'Jogo', economia: 'Economia', interacoes: 'Interação',
      texto: 'Texto', search: 'Pesquisa', audio: 'Áudio', logos: 'Logo',
      info: 'Info', zoeira: 'Zoeira', rank: 'Ranking', owner: 'Dono',
    };
    const sufixo = CAT_TXT[categoria];
    d = sufixo ? `${humanizar(nome)} — ${sufixo}` : humanizar(nome);
  }

  // v6.47: variantes numeradas (bass2, 8d3...) partilham a descrição da
  // família. Sem distinguir, a lista do WhatsApp mostrava 3 linhas
  // exactamente iguais e o utilizador não sabia qual escolher.
  // v7.6: exclui '18' — menu18/pack18/fig18 não são variantes de 'menu/pack/fig'.
  const variante = nome.match(/^(.+?)([2-9]|18)$/);
  if (variante && variante[2] !== '18' && d && !/\d/.test(d)) {
    const base = variante[1];
    // só marca se a versão sem número existir como comando conhecido
    if (catalogo().has(base) || PADROES.some(([re]) => re.test(base))) {
      d = `${d} (v${variante[2]})`;
    }
  }

  // Limpeza final: corta a 72 chars (limite da lista do WhatsApp)
  d = d.replace(/\s+/g, ' ').trim();
  if (d.length > 72) d = d.slice(0, 69).trimEnd() + '…';
  if (!d || /^undefined$/i.test(d)) d = 'Comando do bot';

  _cache.set(nome, d);
  return d;
}

module.exports = { describe, humanizar, PADROES };
