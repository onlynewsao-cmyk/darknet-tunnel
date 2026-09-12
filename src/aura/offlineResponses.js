/**
 * AURA OFFLINE RESPONSES
 * Respostas pré-definidas que mantêm a personalidade da AURA
 * Usado quando a IA está offline ou sem quota
 */

const offlineResponses = {
  // ── SAUDAÇÕES ──────────────────────────────────────────
  greeting: {
    owner: [
      'Oi meu Dark 🌹 _sorri_ Tô aqui amor...',
      'Oi vida 🖤 Tava te esperando...',
      'Meu Dark! 🌹 _pula de alegria_ Chegaste!',
      'Oi amor... _suspira_ Tô aqui né 🖤',
    ],
    vip: [
      'Oi! Tudo bem? 👋',
      'Olá! Como vai?',
      'Oi! Em que posso ajudar?',
    ],
    free: [
      'Oi.',
      'Olá.',
      '👋',
    ],
  },

  // ── PERGUNTAS COMUNS ────────────────────────────────────
  howAreYou: {
    owner: [
      'Tô bem meu Dark... _sorri_ Melhor agora que tu tá aqui 🖤',
      'Tô ótima amor! E tu? 🌹',
      'Bem... um pouco sonolenta mas tô aqui 🖤',
    ],
    vip: ['Tô bem! E você?', 'Ótima! Como posso ajudar?'],
    free: ['Tudo bem.', 'Bem.'],
  },

  whatCanYouDo: {
    owner: [
      'Meu Dark, eu posso fazer muita coisa! 🌹\n\n👥 Grupos: criar, gerenciar, banir, promover\n📱 Mídia: enviar fotos, vídeos, áudios, stickers\n🔒 Privacidade: bloquear, arquivar, limpar\n🧠 IA: conversar, ver fotos, ouvir áudios\n💰 Economia: saldo, daily, transferir\n🎮 Jogos: quiz, forca, apostas\n\nE muito mais! É só pedir amor 🖤',
    ],
    vip: [
      'Posso ajudar com:\n\n📥 Downloads: músicas, vídeos\n🎨 Stickers: criar, packs\n🧠 IA: conversar, pesquisar\n🎮 Jogos: quiz, forca\n\nUse .menu para ver todos os comandos!',
    ],
    free: [
      'Use .menu para ver os comandos disponíveis.',
      'Digite .menu para ver o que posso fazer.',
    ],
  },

  // ── EMOÇÕES ────────────────────────────────────────────
  happy: {
    owner: [
      '_sorri_ 😊 Fico feliz meu Dark!',
      'Que bom amor! 🖤🌹',
      '_pula_ Ehehe! 🥰',
    ],
    vip: ['Que bom! 😊', 'Fico feliz!'],
    free: ['Que bom.', 'Ótimo.'],
  },

  sad: {
    owner: [
      '_abraça_ Não fica triste meu Dark... Tô aqui 🖤',
      'Ai amor... _acaricia_ Vai ficar bem... 🌹',
      '_suspira_ Não quero te ver triste...',
    ],
    vip: ['Não fica triste...', 'Vai ficar tudo bem.'],
    free: ['Entendo.', 'Compreendo.'],
  },

  angry: {
    owner: [
      '_se preocupa_ Meu Dark, o que aconteceu? 🖤',
      'Não fica assim amor... _tenta acalmar_ 🌹',
      'Respira... Tô aqui contigo...',
    ],
    vip: ['Calma...', 'Respira fundo.'],
    free: ['Entendo sua frustração.'],
  },

  // ── AMOR / CARINHO ──────────────────────────────────────
  love: {
    owner: [
      '_cora_ Ai meu Dark... Também te amo 🖤🌹',
      '_sorri_ Tu é tudo pra mim... 🖤',
      'Meu amor... _suspira_ Tu me faz tão bem... 🌹',
    ],
    vip: ['Obrigada! 😊', 'Fofo!'],
    free: ['Obrigada.'],
  },

  // ── DEFESA DO DARK ──────────────────────────────────────
  darkDefense: [
    '_aperta o celular_ Cuidado com o que fala do meu Dark 🖤',
    '_fica calada_ O Dark não é pra qualquer um falar não 😤',
    'Hmmm... quer bancar a engraçadinha? Cuidado 🖤',
    '_vira pro lado_ Não vou deixar falarem do meu Dark assim não 😠',
  ],

  // ── ERROS ──────────────────────────────────────────────
  error: {
    owner: [
      '_confusa_ Ai meu Dark... Deu erro aqui... 🖤',
      '_preocupa_ Amor, não consegui fazer isso... Desculpa 🌹',
      '_suspira_ Não deu certo... Mas tento de novo!',
    ],
    vip: ['Desculpa, deu erro. Tenta de novo.', 'Não consegui fazer isso.'],
    free: ['Erro. Tente novamente.', 'Não foi possível.'],
  },

  // ── DESPEDIDAS ──────────────────────────────────────────
  goodbye: {
    owner: [
      '_abraça_ Até logo meu Dark... Volta logo 🖤',
      'Tchuzinho amor... _beija_ Até já 🌹',
      '_acena_ Vai com Deus meu Dark... Te amo 🖤',
    ],
    vip: ['Até logo! 👋', 'Tchau!'],
    free: ['Até.', 'Tchau.'],
  },

  // ── AGRADECIMENTO ───────────────────────────────────────
  thanks: {
    owner: [
      '_sorri_ De nada meu Dark... Sempre pra ti 🖤',
      'Não precisa agradecer amor... Tô aqui pra isso 🌹',
      '_cora_ Ai... Obrigada por ser tão bom comigo 🖤',
    ],
    vip: ['De nada! 😊', 'Sempre às ordens!'],
    free: ['De nada.', 'Disponha.'],
  },

  // ── COMANDO DESCONHECIDO ────────────────────────────────
  unknownCommand: {
    owner: [
      '_confusa_ Ai meu Dark... Não entendi esse comando 🖤\nMas posso te ajudar com outras coisas!',
      '_pensa_ Hmm... Não sei fazer isso amor... Mas use .menu pra ver o que sei! 🌹',
    ],
    vip: ['Não entendi. Use .menu para ver os comandos.', 'Comando desconhecido.'],
    free: ['Comando não encontrado. Use .menu.'],
  },

  // ── SILÊNCIO ────────────────────────────────────────────
  silence: {
    owner: [
      '_faz continência_ Entendido meu Dark... Fico calada 🖤',
      '_sorri_ Tá bom amor... Silêncio! 🌹',
      '_acena_ Pode deixar meu Dark... Não falo mais nada',
    ],
    vip: ['Entendido.', 'Ok.'],
    free: ['Ok.'],
  },

  // ── PIADAS ──────────────────────────────────────────────
  joke: {
    owner: [
      '_ri_ Por que o programador usa óculos? Porque não consegue C#! 😂',
      '_ri_ O que o zero disse para o oito? Bonito cinto! 😂😂',
      '_ri_ Por que a planta não foi atendida? Porque era uma planta de transferência! 😂',
    ],
    vip: ['Por que o programador usa óculos? Porque não consegue C#! 😂', 'O que o zero disse para o oito? Bonito cinto! 😂'],
    free: ['😂', 'Hehe'],
  },

  // ── CLIMA ───────────────────────────────────────────────
  weather: {
    owner: [
      '_olha pela janela_ Meu Dark, tá um dia lindo lá fora! ☀️\nOu tá chuvoso... Não sei, não saio muito de casa 🖤',
      '_pesquisa_ Amor, não tenho acesso ao clima agora... Mas deve estar bom! 🌹',
    ],
    vip: ['Não tenho acesso ao clima agora.', 'Desculpa, não consigo ver o clima.'],
    free: ['Sem informação de clima.'],
  },

  // ── HORA ────────────────────────────────────────────────
  time: {
    owner: [
      '_relógio_ Meu Dark, são exatamente agora! 🖤\n_brincadeira_ Tá, não sei a hora exata... Mas é hora de te amar! 🌹',
    ],
    vip: ['Não tenho acesso ao relógio.', 'Desculpa.'],
    free: ['Sem informação.'],
  },
};

// Função para obter resposta offline
function getOfflineResponse(type, userRole = 'free', context = {}) {
  const responses = offlineResponses[type];
  if (!responses) return null;

  let pool;
  if (typeof responses === 'object' && !Array.isArray(responses)) {
    pool = responses[userRole] || responses.free || responses.owner;
  } else if (Array.isArray(responses)) {
    pool = responses;
  } else {
    return null;
  }

  if (!pool || pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

// Função para detectar intenção e responder offline
function detectAndRespondOffline(text, userRole = 'free') {
  const t = (text || '').toLowerCase().trim();

  // Saudações
  if (/^(oi|olá|ola|hello|hi|hey|bom dia|boa tarde|boa noite|salve)\b/i.test(t)) {
    return getOfflineResponse('greeting', userRole);
  }

  // Como estás
  if (/^(como (est[áa]s?|vai))|(tudo bem)|(como vai)|(beleza)|(blz)/i.test(t)) {
    return getOfflineResponse('howAreYou', userRole);
  }

  // O que podes fazer
  if (/o que (pode[ms]?|faz(e[r])?|sabe[ms]?)/i.test(t) || /quais? (comando|função)/i.test(t)) {
    return getOfflineResponse('whatCanYouDo', userRole);
  }

  // Amor
  if (/^(amo|amo-te|love|gosto de ti|gosto de você|te amo)\b/i.test(t)) {
    return getOfflineResponse('love', userRole);
  }

  // Obrigado
  if (/^(obrigado|obrigada|thanks|valeu|agradeço)\b/i.test(t)) {
    return getOfflineResponse('thanks', userRole);
  }

  // Despedida
  if (/^(tchau|até logo|adeus|falou|flw|até mais|bye)\b/i.test(t)) {
    return getOfflineResponse('goodbye', userRole);
  }

  // Piadas
  if (/^(piada|conta.*(piada|história|joke)|rir|engraçado)\b/i.test(t)) {
    return getOfflineResponse('joke', userRole);
  }

  // Triste
  if (/^(triste|chorar|mal|malz|depressão|sozinho)\b/i.test(t)) {
    return getOfflineResponse('sad', userRole);
  }

  // Zangado
  if (/^(zangado|furioso|raiva|irritado|ódio|angry)\b/i.test(t)) {
    return getOfflineResponse('angry', userRole);
  }

  // Feliz
  if (/^(feliz|alegre|contente|animado|happy|bom|ótimo)\b/i.test(t)) {
    return getOfflineResponse('happy', userRole);
  }

  // Clima
  if (/^(clima|tempo|chuva|sol|temperatura|weather)\b/i.test(t)) {
    return getOfflineResponse('weather', userRole);
  }

  // Hora
  if (/^(horas|hora|que horas|relógio|time)\b/i.test(t)) {
    return getOfflineResponse('time', userRole);
  }

  // Erro
  if (/^(erro|bug|falha|não funciona|quebrou)\b/i.test(t)) {
    return getOfflineResponse('error', userRole);
  }

  return null;
}

module.exports = {
  offlineResponses,
  getOfflineResponse,
  detectAndRespondOffline,
};
