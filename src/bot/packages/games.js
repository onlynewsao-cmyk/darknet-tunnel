/**
 * JOGOS multiplayer no grupo
 */
const GameSession = require('../../database/models/GameSession');
const Economy = require('../../database/models/Economy');
const ai = require('../ai');
const { QUESTIONS } = require('./quizData');
const mathAnswers = new Map(); // senderNumber -> expected answer

const reply = (sock, msg, ctx, text, mentions = []) =>
  sock.sendMessage(ctx.remoteJid, { text, mentions }, { quoted: msg });
const pick = a => a[Math.floor(Math.random()*a.length)];
const randInt = (a,b) => Math.floor(Math.random()*(b-a+1))+a;

// ============ FORCA ============
const PALAVRAS = [
  { word: 'WHATSAPP', dica: 'Aplicativo de mensagens' },
  { word: 'COMPUTADOR', dica: 'Máquina pra programar' },
  { word: 'ANGOLA', dica: 'País africano lusófono' },
  { word: 'BRASIL', dica: 'País sul-americano' },
  { word: 'DARKBOT', dica: 'O melhor bot do WhatsApp' },
  { word: 'PROGRAMACAO', dica: 'Arte de criar código' },
  { word: 'INTELIGENCIA', dica: 'Capacidade mental' },
  { word: 'TELEFONE', dica: 'Aparelho de comunicar' },
  { word: 'MUSICA', dica: 'Arte dos sons' },
  { word: 'FUTEBOL', dica: 'Esporte mais popular' },
  { word: 'CHOCOLATE', dica: 'Doce delicioso' },
  { word: 'AVENTURA', dica: 'História emocionante' },
  { word: 'CACHORRO', dica: 'Melhor amigo do homem' },
  { word: 'ESTUDAR', dica: 'O que estudantes fazem' },
  { word: 'INTERNET', dica: 'Rede mundial' },
];

// ============ QUIZ INFINITO ============
const quizSessions = new Map();
module.exports.quizSessions = quizSessions;

function getQuizSession(groupJid) {
  if (!quizSessions.has(groupJid)) {
    quizSessions.set(groupJid, {
      active: false,
      current: null,
      used: new Set(),
      scores: new Map(),
      lastWinner: null,
      answerers: new Set(),
      timeout: null,
    });
  }
  return quizSessions.get(groupJid);
}

function pickRandomQuestion(session) {
  const unusedIndices = QUESTIONS.map((_, i) => i).filter(i => !session.used.has(i));
  let idx;
  if (unusedIndices.length === 0) {
    session.used.clear();
    idx = Math.floor(Math.random() * QUESTIONS.length);
  } else {
    idx = unusedIndices[Math.floor(Math.random() * unusedIndices.length)];
  }
  session.used.add(idx);
  return QUESTIONS[idx];
}

// ... (other functions) ...

function normalizeAiQuestion(q) {
  if (!q || typeof q !== 'object') return null;
  if (!q.q || !Array.isArray(q.opts) || q.opts.length < 4) return null;
  const opts = q.opts.slice(0, 4).map(x => String(x).trim()).filter(Boolean);
  if (opts.length !== 4) return null;
  const a = Number(q.a);
  if (!Number.isInteger(a) || a < 0 || a > 3) return null;
  return { q: String(q.q).trim(), opts, a, cat: q.cat || 'Gemini' };
}

async function generateGeminiQuestion() {
  if (typeof ai.chatGemini !== 'function') return null;
  const prompt = 'Gere UMA pergunta de quiz em português com 4 opções curtas. Misture temas: Angola, mundo, ciência, tecnologia, história, cultura geral, esportes, matemática ou internet. Retorne APENAS JSON válido, sem markdown, no formato {"q":"pergunta","opts":["op1","op2","op3","op4"],"a":0,"cat":"categoria"}. O campo a é o índice correto de 0 a 3.';
  const raw = await ai.chatGemini(prompt, 'Você gera perguntas de quiz para WhatsApp. Só JSON válido.');
  const json = String(raw).replace(/```json|```/gi, '').trim().match(/\{[\s\S]*\}/)?.[0];
  return normalizeAiQuestion(JSON.parse(json || raw));
}

async function sendQuestion(sock, remoteJid, session) {
  let q;
  
  // Banco local tem 1000+ perguntas; Gemini entra para criar perguntas inéditas e manter o quiz infinito.
  const shouldUseGemini = Math.random() < 0.35 || session.used.size >= QUESTIONS.length - 5;
  if (shouldUseGemini) {
    try { q = await generateGeminiQuestion(); } catch (e) { q = null; }
  }
  if (!q) q = pickRandomQuestion(session);

  session.current = q;
  session.answerers.clear();
  const text = `🧠 *QUIZ INTELIGENTE!* (Powered by Gemini)\n\n` +
    `📂 *${q.cat}*\n` +
    `❓ ${q.q}\n\n` +
    q.opts.map((o, i) => `*${i + 1}.* ${o}`).join('\n') +
    `\n\nResponda: !resp <1-4>\n💰 Vale 300 🪙 + 30 XP`;
  return sock.sendMessage(remoteJid, { text });
}

const TRIVIA_BUSCA = ['banana','elefante','xadrez','arco-íris','vulcão','dragão','tesouro','pirata','samurai','astronauta','cientista','feijoada','pescaria','dinossauro','sereia'];

const VERDADES = [
  'Qual foi seu pior mico?', 'Já roubou algo? Conta!', 'Quantos crushs você tem agora?',
  'Qual sua maior mentira?', 'Já chorou vendo desenho? Qual?', 'Sua pior nota na escola?',
  'Qual foi sua maior vergonha?', 'Já beijou alguém errado?', 'Tem alguém que você finge gostar?',
  'Conta um segredo que ninguém sabe', 'Qual sua maior insegurança?', 'O que mais odeia em si mesmo?',
  'Já cantou alto no chuveiro?', 'Sua maior obsessão estranha?', 'Já bisbilhotou celular de alguém?',
];

const DESAFIOS = [
  'Manda áudio cantando uma música!', 'Tira foto fazendo careta!', 'Manda foto do seu pé 🦶',
  'Liga pra um número aleatório!', 'Pede em casamento o último que falou no grupo!',
  'Mande figurinha de você dormindo!', 'Conte uma piada bem ruim!', 'Imite um animal por áudio!',
  'Mande um print do seu navegador!', 'Diga "eu te amo" pra alguém no grupo!',
  'Faça uma dança e mande vídeo!', 'Coma algo apimentado e grava!', 'Mande nudes (do seu sapato 👟)',
];

module.exports = {
  // ============ FORCA ============
  async forca({ sock, msg, ctx }) {
    if (!ctx.isGroup) return reply(sock, msg, ctx, '👥 Só em grupos!');
    const existing = await GameSession.findOne({ groupJid: ctx.remoteJid, game: 'forca', active: true });
    if (existing) {
      const guessed = existing.state.guessed || [];
      const word = existing.state.word;
      const display = word.split('').map(c => guessed.includes(c) ? c : '_').join(' ');
      return reply(sock, msg, ctx,
        `🎮 *FORCA em andamento*\n\n📝 \`${display}\`\n❌ Erros: ${existing.state.errors}/6\n💡 Dica: ${existing.state.hint}\n\nUse: !letra <X> ou !palavra <PALAVRA>`);
    }
    const word = pick(PALAVRAS);
    await GameSession.create({
      groupJid: ctx.remoteJid, game: 'forca', startedBy: ctx.senderNumber,
      state: { word: word.word, hint: word.dica, guessed: [], errors: 0 },
    });
    return reply(sock, msg, ctx,
      `🎮 *FORCA INICIADA!*\n\n` +
      `📝 \`${'_ '.repeat(word.word.length).trim()}\`\n` +
      `💡 Dica: *${word.dica}*\n\n` +
      `🔤 \`!letra X\` — adivinhar letra\n` +
      `📝 \`!palavra XXXXX\` — adivinhar palavra completa\n` +
      `🛑 \`!desistir\` — encerrar`);
  },

  async letra({ sock, msg, ctx, args }) {
    if (!ctx.isGroup) return reply(sock, msg, ctx, '👥 Só em grupos!');
    const session = await GameSession.findOne({ groupJid: ctx.remoteJid, game: 'forca', active: true });
    if (!session) return reply(sock, msg, ctx, '🎮 Inicie com !forca');
    const letter = (args[0] || '').toUpperCase().slice(0,1);
    if (!letter.match(/[A-Z]/)) return reply(sock, msg, ctx, '🔤 Letra inválida');
    const s = session.state;
    if (s.guessed.includes(letter)) return reply(sock, msg, ctx, `⚠️ Letra ${letter} já tentada`);
    s.guessed.push(letter);
    const correct = s.word.includes(letter);
    if (!correct) s.errors++;
    session.markModified('state'); await session.save();
    const display = s.word.split('').map(c => s.guessed.includes(c) ? c : '_').join(' ');
    const won = !display.includes('_');
    const lost = s.errors >= 6;
    if (won || lost) {
      session.active = false; session.endedAt = new Date();
      session.winner = won ? ctx.senderNumber : '';
      await session.save();
      const eco = await Economy.getOrCreate(ctx.senderNumber, ctx.pushName);
      if (won) { const r = 500; eco.coins += r; eco.wins++; eco.addXp(50); await eco.save();
        return reply(sock, msg, ctx, `🏆 *@${ctx.senderNumber} VENCEU!*\n\n📝 Palavra: *${s.word}*\n💰 +${r} 🪙 e +50 XP`, [ctx.senderJid]);
      }
      return reply(sock, msg, ctx, `💀 *PERDERAM!*\n\n📝 A palavra era: *${s.word}*`);
    }
    return reply(sock, msg, ctx,
      `${correct ? '✅' : '❌'} Letra: *${letter}*\n\n📝 \`${display}\`\n❌ Erros: ${s.errors}/6\n🔤 Tentadas: ${s.guessed.join(', ')}`);
  },

  async palavra({ sock, msg, ctx, args }) {
    if (!ctx.isGroup) return reply(sock, msg, ctx, '👥 Só em grupos!');
    const session = await GameSession.findOne({ groupJid: ctx.remoteJid, game: 'forca', active: true });
    if (!session) return reply(sock, msg, ctx, '🎮 Inicie com !forca');
    const guess = (args.join(' ') || '').toUpperCase();
    if (guess === session.state.word) {
      session.active = false; session.endedAt = new Date(); session.winner = ctx.senderNumber;
      await session.save();
      const eco = await Economy.getOrCreate(ctx.senderNumber, ctx.pushName);
      const r = 1000; eco.coins += r; eco.wins++; eco.addXp(100); await eco.save();
      return reply(sock, msg, ctx, `🏆 *@${ctx.senderNumber} VENCEU!*\n\n📝 Palavra: *${session.state.word}*\n💰 +${r} 🪙 e +100 XP`, [ctx.senderJid]);
    } else {
      session.state.errors += 2;
      session.markModified('state'); await session.save();
      if (session.state.errors >= 6) {
        session.active = false; await session.save();
        return reply(sock, msg, ctx, `💀 *PERDERAM!*\n\nPalavra errada e morreram.\n📝 Era: *${session.state.word}*`);
      }
      return reply(sock, msg, ctx, `❌ Errou! Penalidade +2 erros (${session.state.errors}/6)`);
    }
  },

  async desistir({ sock, msg, ctx }) {
    // Reseta sessão do DB
    const sessionDB = await GameSession.findOne({ groupJid: ctx.remoteJid, active: true });
    if (sessionDB) {
      sessionDB.active = false;
      sessionDB.endedAt = new Date();
      await sessionDB.save();
    }

    // Reseta sessão em memória do Quiz
    const sessionMem = quizSessions.get(ctx.remoteJid);
    if (sessionMem && sessionMem.active) {
      sessionMem.active = false;
      sessionMem.current = null;
      sessionMem.answerers.clear();
      sessionMem.scores.clear();
      if (sessionMem.timeout) clearTimeout(sessionMem.timeout);
    }

    const gameName = sessionDB?.game || (sessionMem?.active ? 'quiz' : 'jogo');
    const txt = sessionDB?.state?.word ? `\n📝 Palavra era: *${sessionDB.state.word}*` : '';
    return reply(sock, msg, ctx, `🛑 Jogo *${gameName}* cancelado.${txt}`);
  },

  // ============ QUIZ INFINITO ============
  async quiz({ sock, msg, ctx }) {
    if (!ctx.isGroup) return reply(sock, msg, ctx, '👥 Só em grupos!');
    const session = getQuizSession(ctx.remoteJid);
    if (session.active && session.current) {
      const q = session.current;
      return reply(sock, msg, ctx,
        `🧠 *Quiz já está rodando!*\n\n❓ ${q.q}\n\n` +
        q.opts.map((o, i) => `*${i + 1}.* ${o}`).join('\n') +
        `\n\nResponda: !resp <1-4>`);
    }
    session.active = true;
    session.scores = new Map();
    session.used.clear();
    session.lastWinner = null;
    await sendQuestion(sock, ctx.remoteJid, session);
    // Compatível com !desistir
    await GameSession.findOneAndUpdate(
      { groupJid: ctx.remoteJid, game: 'quiz', active: true },
      { groupJid: ctx.remoteJid, game: 'quiz', startedBy: ctx.senderNumber, active: true, state: {} },
      { upsert: true }
    );
    return;
  },

  async resp({ sock, msg, ctx, args }) {
    if (!ctx.isGroup) return reply(sock, msg, ctx, '👥 Só em grupos!');
    const session = getQuizSession(ctx.remoteJid);
    if (!session.active || !session.current) return reply(sock, msg, ctx, '🎮 Inicie com !quiz');
    const choice = parseInt(args[0]) - 1;
    if (isNaN(choice) || choice < 0 || choice > 3) return reply(sock, msg, ctx, '❌ Use !resp 1-4');
    if (session.answerers.has(ctx.senderNumber)) return reply(sock, msg, ctx, '⚠️ Você já respondeu esta pergunta');
    session.answerers.add(ctx.senderNumber);
    const q = session.current;
    if (choice === q.a) {
      const eco = await Economy.getOrCreate(ctx.senderNumber, ctx.pushName);
      const basePoints = 300;
      const streakBonus = (session.lastWinner === ctx.senderNumber) ? 100 : 0;
      const totalPoints = basePoints + streakBonus;
      eco.coins += totalPoints;
      eco.wins++;
      eco.addXp(30 + (streakBonus ? 20 : 0));
      await eco.save();
      if (!session.scores.has(ctx.senderNumber)) {
        session.scores.set(ctx.senderNumber, { name: ctx.pushName, points: 0, streak: 0, correct: 0 });
      }
      const score = session.scores.get(ctx.senderNumber);
      score.points += totalPoints;
      score.correct++;
      if (session.lastWinner === ctx.senderNumber) score.streak++;
      else score.streak = 1;
      session.lastWinner = ctx.senderNumber;
      await reply(sock, msg, ctx,
        `🏆 *@${ctx.senderNumber} ACERTOU!*\n\n` +
        `✅ Resposta: *${q.opts[q.a]}*\n` +
        `💰 +${totalPoints} 🪙 e +${30 + (streakBonus ? 20 : 0)} XP` +
        (score.streak > 1 ? ` 🔥 *Streak x${score.streak}!*` : '') +
        `\n\n⏳ Próxima pergunta em 2 segundos...`, [ctx.senderJid]);
      if (session.timeout) clearTimeout(session.timeout);
      session.timeout = setTimeout(() => {
        sendQuestion(sock, ctx.remoteJid, session).catch(() => {});
      }, 2500);
      return;
    }
    await reply(sock, msg, ctx, `❌ @${ctx.senderNumber} errou! (${session.answerers.size} já tentaram)`, [ctx.senderJid]);
    if (session.answerers.size >= 4) {
      if (session.timeout) clearTimeout(session.timeout);
      session.timeout = setTimeout(() => {
        sock.sendMessage(ctx.remoteJid, {
          text: `⏱️ Ninguém acertou! A resposta era: *${q.opts[q.a]}*\n\n🔄 Nova pergunta em 2 segundos...`
        }).catch(() => {});
        session.timeout = setTimeout(() => {
          sendQuestion(sock, ctx.remoteJid, session).catch(() => {});
        }, 2000);
      }, 1500);
    }
  },

  async quizplacar({ sock, msg, ctx }) {
    if (!ctx.isGroup) return reply(sock, msg, ctx, '👥 Só em grupos!');
    const session = getQuizSession(ctx.remoteJid);
    if (!session.active || session.scores.size === 0) return reply(sock, msg, ctx, '🎮 Nenhum placar ainda. Use !quiz');
    const sorted = [...session.scores.entries()].sort((a, b) => b[1].points - a[1].points);
    const board = sorted.map(([num, s], i) => {
      const medals = ['🥇', '🥈', '🥉'];
      const prefix = medals[i] || `${i + 1}.`;
      return `${prefix} @${num} — ${s.points} pts (${s.correct} acertos)`;
    }).join('\n');
    return reply(sock, msg, ctx,
      `🏆 *PLACAR DO QUIZ*\n\n${board}\n\n_Total de perguntas: ${session.used.size}_`,
      sorted.map(([num]) => `${num}@s.whatsapp.net`));
  },

  // ============ ADIVINHA NÚMERO ============
  async adivinha({ sock, msg, ctx }) {
    if (!ctx.isGroup) return reply(sock, msg, ctx, '👥 Só em grupos!');
    const ex = await GameSession.findOne({ groupJid: ctx.remoteJid, game: 'adivinha', active: true });
    if (ex) return reply(sock, msg, ctx, `🎯 Jogo em andamento!\nUse !chute <número>`);
    const n = randInt(1, 100);
    await GameSession.create({
      groupJid: ctx.remoteJid, game: 'adivinha', startedBy: ctx.senderNumber,
      state: { number: n, attempts: 0, tried: [] },
    });
    return reply(sock, msg, ctx, `🎯 *ADIVINHA O NÚMERO!*\n\nPensei num número entre *1 e 100*.\n\nUse: !chute <número>\n💰 Prêmio: 500 🪙`);
  },

  async chute({ sock, msg, ctx, args }) {
    if (!ctx.isGroup) return reply(sock, msg, ctx, '👥 Só em grupos!');
    const session = await GameSession.findOne({ groupJid: ctx.remoteJid, game: 'adivinha', active: true });
    if (!session) return reply(sock, msg, ctx, '🎯 Inicie com !adivinha');
    const guess = parseInt(args[0]);
    if (isNaN(guess)) return reply(sock, msg, ctx, '❌ Use !chute <número>');
    session.state.attempts++;
    session.state.tried.push(`${ctx.pushName}: ${guess}`);
    session.markModified('state'); await session.save();
    if (guess === session.state.number) {
      session.active = false; session.winner = ctx.senderNumber; await session.save();
      const eco = await Economy.getOrCreate(ctx.senderNumber, ctx.pushName);
      eco.coins += 500; eco.wins++; eco.addXp(50); await eco.save();
      return reply(sock, msg, ctx, `🏆 *@${ctx.senderNumber} ACERTOU!*\nNúmero era *${guess}* (${session.state.attempts} tentativas)\n💰 +500 🪙 e +50 XP`, [ctx.senderJid]);
    }
    const hint = guess < session.state.number ? '⬆️ MAIOR' : '⬇️ MENOR';
    return reply(sock, msg, ctx, `${hint} que ${guess}! (tentativa ${session.state.attempts})`);
  },

  // ============ BLACKJACK (21) ============
  async blackjack({ sock, msg, ctx, args }) {
    const bet = parseInt(args[0]) || 100;
    if (bet < 10) return reply(sock, msg, ctx, '🎲 Aposta mínima: 10. Use !blackjack <valor>');
    const eco = await Economy.getOrCreate(ctx.senderNumber, ctx.pushName);
    if (eco.coins < bet) return reply(sock, msg, ctx, `❌ Você só tem ${eco.coins}`);
    // Joga rápido contra o dealer
    const deck = newDeck();
    const player = [drawCard(deck), drawCard(deck)];
    const dealer = [drawCard(deck), drawCard(deck)];
    while (sumHand(dealer) < 17) dealer.push(drawCard(deck));
    while (sumHand(player) < 17 && Math.random() > 0.4) player.push(drawCard(deck));
    const pSum = sumHand(player), dSum = sumHand(dealer);
    let result, winnings;
    if (pSum > 21) { result = '💀 ESTOUROU! Perdeu'; winnings = -bet; }
    else if (dSum > 21 || pSum > dSum) { result = '🏆 GANHOU!'; winnings = bet; }
    else if (pSum === dSum) { result = '🤝 Empate'; winnings = 0; }
    else { result = '💀 Dealer venceu'; winnings = -bet; }
    eco.coins += winnings;
    if (winnings > 0) { eco.wins++; eco.addXp(20); }
    else if (winnings < 0) eco.losses++;
    await eco.save();
    return reply(sock, msg, ctx,
      `♠️ *BLACKJACK 21* ♣️\n\n` +
      `🧑 Você: ${player.join(' ')} = *${pSum}*\n` +
      `🤖 Dealer: ${dealer.join(' ')} = *${dSum}*\n\n` +
      `${result}\n💰 ${winnings >= 0 ? '+' : ''}${winnings} 🪙`);
  },

  // ============ ROLETA RUSSA ============
  async russa({ sock, msg, ctx }) {
    const bullet = randInt(1, 6);
    const eco = await Economy.getOrCreate(ctx.senderNumber, ctx.pushName);
    if (bullet === 1) {
      eco.hp = 0; eco.losses++; await eco.save();
      return reply(sock, msg, ctx,
        `🔫 *ROLETA RUSSA*\n\n💥 BANG! @${ctx.senderNumber} morreu!\n☠️ HP zerado\n\n_Use !heal_`, [ctx.senderJid]);
    }
    const reward = randInt(100, 500); eco.coins += reward; eco.wins++; eco.addXp(20); await eco.save();
    return reply(sock, msg, ctx,
      `🔫 *ROLETA RUSSA*\n\n🎯 *Click!* @${ctx.senderNumber} sobreviveu! (1 em 6)\n💰 +${reward} 🪙`, [ctx.senderJid]);
  },

  // ============ VERDADE OU DESAFIO ============
  async verdade({ sock, msg, ctx }) {
    return reply(sock, msg, ctx, `🟢 *VERDADE:*\n\n_${pick(VERDADES)}_`);
  },
  async desafio({ sock, msg, ctx }) {
    return reply(sock, msg, ctx, `🔴 *DESAFIO:*\n\n_${pick(DESAFIOS)}_`);
  },
  async vd({ sock, msg, ctx }) {
    if (Math.random() > 0.5) return reply(sock, msg, ctx, `🟢 *VERDADE:*\n\n_${pick(VERDADES)}_`);
    return reply(sock, msg, ctx, `🔴 *DESAFIO:*\n\n_${pick(DESAFIOS)}_`);
  },

  // ============ SHIP Ó (variante do ship) ============
  async shipo({ sock, msg, ctx, args }) {
    const pct = randInt(0, 100);
    const bar = '❤️'.repeat(Math.round(pct / 10)) + '🖤'.repeat(10 - Math.round(pct / 10));
    const alvo = args.join(' ').trim() || `${ctx.pushName} + ???`;
    return reply(sock, msg, ctx, `💕 *SHIP Ó*\n\n${bar}\n💕 *${pct}%* de compatibilidade\n\n> ${alvo}`);
  },

  // ============ GÊNIO (charadas de lógica) ============
  async genio({ sock, msg, ctx, args }) {
    const GENIOS = [
      { q: 'Um fazendeiro tem 17 ovelhas. Todas menos 9 morrem. Quantas ficam?', a: '9' },
      { q: 'A mãe de Maria tem 4 filhas: Ana, Bela, Carla e...?', a: 'maria' },
      { q: 'Quantos meses têm 28 dias?', a: '12' },
      { q: 'Se tens 3 maçãs e levas 2 contigo, com quantas ficas?', a: '2' },
      { q: 'O pai de João tem 5 filhos: Nana, Nene, Nini, Nono e...?', a: 'joao' },
      { q: 'O que pesa mais: 1 kg de ferro ou 1 kg de algodão?', a: 'igual' },
      { q: 'Quantos segundos tem uma hora?', a: '3600' },
      { q: 'Divide 30 por meio e soma 10. Quanto dá?', a: '70' },
      { q: 'O que está sempre à tua frente mas nunca consegues ver?', a: 'futuro' },
      { q: 'Qual é o mês com 28 ou 29 dias?', a: 'fevereiro' },
    ];

    const key = `genio_${ctx.senderNumber}`;
    const expected = mathAnswers.get(key);

    if (expected && args.length > 0) {
      const ans = args.join(' ').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ');
      const exp = String(expected).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
      mathAnswers.delete(key);
      const eco = await Economy.getOrCreate(ctx.senderNumber, ctx.pushName);
      if (ans === exp || ans.includes(exp) || exp.includes(ans)) {
        eco.coins += 300; eco.wins++; eco.addXp(30); await eco.save();
        return reply(sock, msg, ctx, `🧠 Correto! Era *${expected}*\n💰 +300 🪙 +30 XP`);
      }
      eco.coins = Math.max(0, eco.coins - 50); eco.losses++; await eco.save();
      return reply(sock, msg, ctx, `❌ Errado! Era *${expected}*\n💀 -50 🪙`);
    }

    const e = pick(GENIOS);
    mathAnswers.set(key, e.a);
    return reply(sock, msg, ctx,
      `🧠 *GÊNIO!*\n\n${e.q}\n\nResponda: !genio <resposta>\n💰 Vale 300 🪙 +30 XP`);
  },

  // ============ DESAFIO SEMANAL / MENSAL (rotativo por data) ============
  async desafiomensal({ sock, msg, ctx }) {
    const now = new Date();
    const mes = now.getMonth() + 1;
    const ano = now.getFullYear();
    const d = pick(DESAFIOS);
    const ultimoDia = new Date(ano, mes, 0).getDate();
    const diasRestantes = Math.max(0, ultimoDia - now.getDate());
    return reply(sock, msg, ctx,
      `📅 *DESAFIO DO MÊS* (${String(mes).padStart(2, '0')}/${ano})\n\n_${d}_\n\n⏳ Faltam *${diasRestantes}* dias para acabar\n💰 Quem concluir e provar, marca o Dono!`);
  },

  async desafiosemanal({ sock, msg, ctx }) {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    const semana = Math.floor(((now - start) / 86400000 + start.getDay() + 1) / 7) + 1;
    const d = pick(DESAFIOS);
    return reply(sock, msg, ctx,
      `📅 *DESAFIO DA SEMANA* (semana ${semana}/${now.getFullYear()})\n\n_${d}_\n\n⏳ Roda de novo no domingo\n💰 Quem concluir e provar, marca o Dono!`);
  },

  // ============ AKINATOR FAKE ============
  async akinator({ sock, msg, ctx }) {
    const respostas = [
      'É homem? 🤔', 'É famoso? 🌟', 'Tá vivo? 💀', 'É brasileiro? 🇧🇷', 'É jogador de futebol? ⚽',
      'É político? 🏛️', 'É cantor? 🎤', 'Aparece na TV? 📺',
    ];
    return reply(sock, msg, ctx, `🧞 *AKINATOR*\n\nResponda:\n*${pick(respostas)}*\n\n_(em breve: jogo completo)_`);
  },

  // ============ BINGO ============
  async bingo({ sock, msg, ctx }) {
    if (!ctx.isGroup) return reply(sock, msg, ctx, '👥 Só em grupos!');
    const numbers = [];
    while (numbers.length < 5) {
      const n = randInt(1, 75);
      if (!numbers.includes(n)) numbers.push(n);
    }
    const cartela = numbers.sort((a,b)=>a-b).join(' • ');
    const sorteado = randInt(1, 75);
    const ganhou = numbers.includes(sorteado);
    const eco = await Economy.getOrCreate(ctx.senderNumber, ctx.pushName);
    if (ganhou) { eco.coins += 1000; eco.wins++; eco.addXp(50); await eco.save();
      return reply(sock, msg, ctx, `🎱 *BINGO!*\n\nCartela: \`${cartela}\`\n🎯 Sorteado: *${sorteado}*\n\n🏆 *BINGO!* +1000 🪙`);
    }
    return reply(sock, msg, ctx, `🎱 *BINGO*\n\nCartela: \`${cartela}\`\n🎯 Sorteado: *${sorteado}*\n\n💀 Não rolou!`);
  },

  // ============ CAÇA-PALAVRAS ============
  async cacapalavras({ sock, msg, ctx }) {
    const palavra = pick(TRIVIA_BUSCA);
    const grid = [];
    const size = 6;
    const dir = randInt(0,1); // 0=horizontal, 1=vertical
    const padStart = randInt(0, size - palavra.length);
    const fixedRow = randInt(0, size-1);
    for (let i = 0; i < size; i++) {
      const row = [];
      for (let j = 0; j < size; j++) {
        if (dir === 0 && i === fixedRow && j >= padStart && j < padStart + palavra.length) {
          row.push(palavra[j - padStart].toUpperCase());
        } else if (dir === 1 && j === fixedRow && i >= padStart && i < padStart + palavra.length) {
          row.push(palavra[i - padStart].toUpperCase());
        } else {
          row.push(String.fromCharCode(65 + randInt(0,25)));
        }
      }
      grid.push(row.join(' '));
    }
    return reply(sock, msg, ctx,
      `🔍 *CAÇA-PALAVRAS*\n\n\`\`\`\n${grid.join('\n')}\n\`\`\`\n\nAche a palavra escondida!\nDica: tem ${palavra.length} letras\n\n_Apenas visual, prêmio: orgulho 😎_`);
  },

  // ============ JOKENPÔ ============
  async jokenpo({ sock, msg, ctx, args }) {
    const choices = ['pedra', 'papel', 'tesoura'];
    const user = (args[0] || '').toLowerCase();
    if (!choices.includes(user)) {
      return reply(sock, msg, ctx, `🎮 *JOKENPÔ!*\n\nUse: !jokenpo <pedra|papel|tesoura>\n💰 Aposta: 50 🪙`);
    }
    const botC = pick(choices);
    let result, eco;
    if (user === botC) {
      result = '🤝 Empate!';
    } else if ((user === 'pedra' && botC === 'tesoura') || (user === 'papel' && botC === 'pedra') || (user === 'tesoura' && botC === 'papel')) {
      result = '🏆 Você ganhou! +100 🪙 +10 XP';
      eco = await Economy.getOrCreate(ctx.senderNumber, ctx.pushName);
      eco.coins += 100; eco.wins++; eco.addXp(10); await eco.save();
    } else {
      result = '💀 Você perdeu! -50 🪙';
      eco = await Economy.getOrCreate(ctx.senderNumber, ctx.pushName);
      eco.coins = Math.max(0, eco.coins - 50); eco.losses++; await eco.save();
    }
    return reply(sock, msg, ctx, `✊ *JOKENPÔ!*\n\n🧑 Você: ${user}\n🤖 Bot: ${botC}\n\n${result}`);
  },

  // ============ DADO ============
  async dado({ sock, msg, ctx }) {
    const n = randInt(1, 6);
    const eco = await Economy.getOrCreate(ctx.senderNumber, ctx.pushName);
    let txt = `🎲 *DADO!*\n\nCaiu: *${n}*`;
    if (n === 6) {
      eco.coins += 200; eco.wins++; eco.addXp(15); await eco.save();
      txt += `\n🏆 Sorte máxima! +200 🪙 +15 XP`;
    } else if (n >= 4) {
      eco.coins += 50; eco.addXp(5); await eco.save();
      txt += `\n✅ Ganhou +50 🪙 +5 XP`;
    } else {
      txt += `\n💀 Nada dessa vez.`;
    }
    return reply(sock, msg, ctx, txt);
  },

  // ============ CARA OU COROA ============
  async caraoucoroa({ sock, msg, ctx, args }) {
    const guess = (args[0] || '').toLowerCase();
    if (!['cara', 'coroa'].includes(guess)) {
      return reply(sock, msg, ctx, `🪙 *CARA OU COROA!*\n\nUse: !caraoucoroa <cara|coroa>\n💰 Aposta: 50 🪙`);
    }
    const side = Math.random() < 0.5 ? 'cara' : 'coroa';
    const eco = await Economy.getOrCreate(ctx.senderNumber, ctx.pushName);
    if (guess === side) {
      eco.coins += 100; eco.wins++; eco.addXp(10); await eco.save();
      return reply(sock, msg, ctx, `🪙 *CARA OU COROA!*\n\nResultado: *${side.toUpperCase()}*\n🏆 Você ganhou! +100 🪙 +10 XP`);
    }
    eco.coins = Math.max(0, eco.coins - 50); eco.losses++; await eco.save();
    return reply(sock, msg, ctx, `🪙 *CARA OU COROA!*\n\nResultado: *${side.toUpperCase()}*\n💀 Você perdeu! -50 🪙`);
  },

  // ============ MATH CHALLENGE ============
  async math({ sock, msg, ctx }) {
    const ops = [
      () => { const a = randInt(1,20), b = randInt(1,20); return { q: `${a} + ${b}`, a: a+b }; },
      () => { const a = randInt(10,50), b = randInt(1,10); return { q: `${a} - ${b}`, a: a-b }; },
      () => { const a = randInt(2,12), b = randInt(2,12); return { q: `${a} × ${b}`, a: a*b }; },
    ];
    const op = pick(ops)();
    mathAnswers.set(ctx.senderNumber, op.a);
    return reply(sock, msg, ctx,
      `🧮 *MATH CHALLENGE!*\n\nQuanto é: *${op.q}* ?\n\nResponda: !mathresp <número>\n💰 Vale 150 🪙 +10 XP`);
  },
  async mathresp({ sock, msg, ctx, args }) {
    const expected = mathAnswers.get(ctx.senderNumber);
    if (expected === undefined) return reply(sock, msg, ctx, '🎮 Inicie com !math');
    const ans = parseInt(args[0]);
    if (isNaN(ans)) return reply(sock, msg, ctx, '❌ Use !mathresp <número>');
    mathAnswers.delete(ctx.senderNumber);
    const eco = await Economy.getOrCreate(ctx.senderNumber, ctx.pushName);
    if (ans === expected) {
      eco.coins += 150; eco.wins++; eco.addXp(10); await eco.save();
      return reply(sock, msg, ctx, `✅ Correto! *${expected}*\n💰 +150 🪙 +10 XP`);
    }
    eco.coins = Math.max(0, eco.coins - 30); eco.losses++; await eco.save();
    return reply(sock, msg, ctx, `❌ Errado! Era *${expected}*\n💀 -30 🪙`);
  },

  // ============ TERMO (WORDLE) ============
  async termo({ sock, msg, ctx, args }) {
    if (!ctx.isGroup) return reply(sock, msg, ctx, '👥 Só em grupos!');
    const session = getQuizSession(ctx.remoteJid);

    // Se tem argumentos, tenta responder
    if (args.length > 0 && session.termoActive) {
      const guess = (args[0] || '').toUpperCase().trim();
      if (guess.length !== 5) return reply(sock, msg, ctx, '❌ Use 5 letras: !termo CASA');

      session.termoPlayers.add(ctx.senderNumber);
      if (session.termoAttempts.length >= 6) {
        session.termoActive = false;
        return reply(sock, msg, ctx, `💀 *TERMO PERDIDO!*\nA palavra era: *${session.termoWord}*`);
      }

      const word = session.termoWord;
      const wordLetters = word.split('');
      const guessLetters = guess.split('');
      let result = '';
      const exact = new Array(5).fill(false);
      const wordCount = {};
      for (const l of wordLetters) wordCount[l] = (wordCount[l] || 0) + 1;

      for (let i = 0; i < 5; i++) {
        if (guessLetters[i] === wordLetters[i]) {
          exact[i] = true;
          wordCount[guessLetters[i]]--;
        }
      }
      for (let i = 0; i < 5; i++) {
        if (exact[i]) result += '🟩';
        else if (wordCount[guessLetters[i]] > 0) {
          result += '🟨';
          wordCount[guessLetters[i]]--;
        } else result += '⬛';
      }

      session.termoAttempts.push(`${guess}  ${result}`);

      if (guess === word) {
        session.termoActive = false;
        const eco = await Economy.getOrCreate(ctx.senderNumber, ctx.pushName);
        eco.coins += 500; eco.wins++; eco.addXp(50); await eco.save();
        return reply(sock, msg, ctx,
          `🏆 *@${ctx.senderNumber} ACERTOU!*\n\n` +
          `✅ *${word}*\n` +
          `Tentativas: ${session.termoAttempts.length}/6\n` +
          `💰 +500 🪙 +50 XP`, [ctx.senderJid]);
      }

      if (session.termoAttempts.length >= 6) {
        session.termoActive = false;
        return reply(sock, msg, ctx,
          `💀 *TERMO PERDIDO!*\n\n` +
          `A palavra era: *${word}*\n\n` +
          session.termoAttempts.join('\n'));
      }

      return reply(sock, msg, ctx,
        `🟩🟨⬛ *TERMO* (${session.termoAttempts.length}/6)\n\n` +
        session.termoAttempts.join('\n') +
        `\n\nPróxima: !termo <palavra>`);
    }

    // Inicia novo jogo
    if (session.termoActive) return reply(sock, msg, ctx, `🎮 Termo já em andamento!\nTentativas: ${session.termoAttempts.length}/6`);

    const PALAVRAS_TERMO = [
      'CASA','AMOR','FATO','IDEA','VIDA','MESA','PATO','GATO','RATO','LOBO','URSO','PEIXE','VENTO','PRAIA','TERRA','LUA','NOITE','DIA',
      'CARRO','MOTO','BARCO','TREM','AVIAO','FOGO','AGUA','GELO','PEDRA','METAL','OURO','PRATA','COBRE','FERRO','VIDRO','PAPEL','MADEIRA',
      'FRUTA','MACA','UVA','PERA','MORANGO','BANANA','MELAO','MELANCIA','LIMAO','LARANJA','TOMATE','BATATA','CENOURA','CEBOLA','ALHO',
      'MUSICA','RITMO','CANTO','PIANO','FLAUTA','BATERIA','TAMBOR','TROMPETE','SAXOFONE','VIOLINO','CELLO','Harpa','ORGAN','TECLADO',
      'CORPO','CABECA','ROSTO','OLHO','NARIZ','BOCA','DENTE','LINGUA','LABIO','ORELHA','CABELO','PESCO','OMBRO','BRACO','COTOVELO','MAO',
      'PEITO','COSTA','CINTURA','QUADRIL','NAEGA','PERNA','JOELHO','TORNOZELO','PE','PELE','OSSO','SANGUE','CORACAO','PULMAO','RIM','FIGADO',
      'CEU','NUVEM','ESTRELA','PLANETA','MARTE','VENUS','JUPITER','SATURNO','URANO','NETUNO','MERCURIO','PLUTAO','GALAXIA','UNIVERSO','COMETA',
      'PAIS','MAE','PAI','FILHO','FILHA','IRMAO','IRMA','AVO','NETO','NETA','TIO','TIA','PRIMO','PRIMA','SOBRINHO','SOBRINHA','MARIDO',
      'ESCOLA','AULA','PROFESSOR','ALUNO','LIVRO','CADERNO','CANETA','LAPIS','BORRACHA','REGRA','COMPASSO','GLOBO','QUADRO','GIZ','MOCHILA',
      'CIDADE','RUA','AVENIDA','PRACA','PREDIO','APARTAMENTO','LOJA','MERCADO','FARMACIA','HOSPITAL','IGREJA','PONTE','TUNEL','ESTACAO',
    ];
    const validas = PALAVRAS_TERMO.filter(p => p.length === 5);
    const word = pick(validas.length ? validas : ['CASA','AMOR','FATO']);
    session.termoActive = true;
    session.termoWord = word;
    session.termoAttempts = [];
    session.termoPlayers = new Set();
    return reply(sock, msg, ctx,
      `🟩🟨⬛ *TERMO!*\n\nAdivinhe a palavra de *5 letras*.\n` +
      `🟩 = letra certa no lugar certo\n` +
      `🟨 = letra certa no lugar errado\n` +
      `⬛ = letra não existe\n\n` +
      `Use: !termo <palavra> (ex: !termo CASA)\n` +
      `6 tentativas. Quem acertar ganha 500 🪙 + 50 XP`);
  },

  // ============ JOGO DA VELHA ============
  async velha({ sock, msg, ctx, args }) {
    if (!ctx.isGroup) return reply(sock, msg, ctx, '👥 Só em grupos!');
    const session = getQuizSession(ctx.remoteJid);

    const arg0 = (args[0] || '').toLowerCase();

    // Jogar movimento ou entrar
    if (session.velhaActive && args.length > 0) {
      const pos = parseInt(arg0) - 1;

      // Comando "entrar"
      if (arg0 === 'entrar' || arg0 === 'join' || arg0 === 'entra') {
        if (session.velhaPlayers.length >= 2) return reply(sock, msg, ctx, '⚠️ Já tem 2 jogadores!');
        if (session.velhaPlayers[0] === ctx.senderNumber) return reply(sock, msg, ctx, '⚠️ Você já é o jogador ❌');
        session.velhaPlayers.push(ctx.senderNumber);
        return reply(sock, msg, ctx,
          `⭕❌ *JOGO DA VELHA!*\n\n` +
          `❌ @${session.velhaPlayers[0]}\n` +
          `⭕ @${session.velhaPlayers[1]}\n\n` +
          `Vez de ❌! Use: !velha <1-9>`);
      }

      // Movimento
      if (!isNaN(pos) && pos >= 0 && pos <= 8) {
        if (session.velhaBoard[pos]) return reply(sock, msg, ctx, '⚠️ Posição ocupada!');
        const isPlayer = session.velhaPlayers.includes(ctx.senderNumber);
        const isSolo = session.velhaPlayers.length === 1;
        const currentSymbol = session.velhaCurrent === 0 ? '❌' : '⭕';
        const currentPlayer = session.velhaPlayers[session.velhaCurrent] || ctx.senderNumber;

        if (!isSolo && !isPlayer) return reply(sock, msg, ctx, '⚠️ Você não está no jogo! Use !velha entrar');
        if (!isSolo && currentPlayer !== ctx.senderNumber) return reply(sock, msg, ctx, `⚠️ Agora é a vez de ${currentSymbol}`);

        session.velhaBoard[pos] = currentSymbol;
        const b = session.velhaBoard;
        const wins = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
        const won = wins.some(([a,bb,c]) => b[a] && b[a] === b[bb] && b[a] === b[c]);

        const fmt = (i) => b[i] || (i+1);
        const board = `${fmt(0)} │ ${fmt(1)} │ ${fmt(2)}\n───┼───┼───\n${fmt(3)} │ ${fmt(4)} │ ${fmt(5)}\n───┼───┼───\n${fmt(6)} │ ${fmt(7)} │ ${fmt(8)}`;

        if (won) {
          session.velhaActive = false;
          const eco = await Economy.getOrCreate(ctx.senderNumber, ctx.pushName);
          eco.coins += 300; eco.wins++; eco.addXp(30); await eco.save();
          return reply(sock, msg, ctx,
            `🏆 *@${ctx.senderNumber} VENCEU!*\n\n${board}\n\n💰 +300 🪙 +30 XP`, [ctx.senderJid]);
        }

        if (!b.includes(null)) {
          session.velhaActive = false;
          return reply(sock, msg, ctx, `🤝 *VELHA!*\n\n${board}`);
        }

        session.velhaCurrent = (session.velhaCurrent + 1) % 2;
        const nextSym = session.velhaCurrent === 0 ? '❌' : '⭕';
        const nextPlayer = session.velhaPlayers[session.velhaCurrent];
        let text = `${board}\n\nVez de ${nextSym}`;
        if (nextPlayer) text += ` @${nextPlayer}`;
        return reply(sock, msg, ctx, text, nextPlayer ? [`${nextPlayer}@s.whatsapp.net`] : []);
      }
    }

    // Mostrar tabuleiro se já está ativo
    if (session.velhaActive) {
      const b = session.velhaBoard;
      const fmt = (i) => b[i] || (i+1);
      return reply(sock, msg, ctx,
        `⭕❌ *JOGO DA VELHA em andamento!*\n\n` +
        `${fmt(0)} │ ${fmt(1)} │ ${fmt(2)}\n` +
        `───┼───┼───\n` +
        `${fmt(3)} │ ${fmt(4)} │ ${fmt(5)}\n` +
        `───┼───┼───\n` +
        `${fmt(6)} │ ${fmt(7)} │ ${fmt(8)}\n\n` +
        `Vez de: ${session.velhaCurrent === session.velhaPlayers[0] ? '❌' : '⭕'}\n` +
        `Use: !velha <1-9>`);
    }

    // Inicia novo jogo
    session.velhaActive = true;
    session.velhaBoard = new Array(9).fill(null);
    session.velhaPlayers = [ctx.senderNumber];
    session.velhaCurrent = 0;
    return reply(sock, msg, ctx,
      `⭕❌ *JOGO DA VELHA!*\n\n` +
      `1 │ 2 │ 3\n` +
      `───┼───┼───\n` +
      `4 │ 5 │ 6\n` +
      `───┼───┼───\n` +
      `7 │ 8 │ 9\n\n` +
      `❌ @${ctx.senderNumber} começou!\n` +
      `Aguardando desafiante... Use !velha entrar\n` +
      `Ou jogue sozinho vs Bot (use !velha <1-9>)`);
  },

  // ============ ENIGMA / CHARADAS ============
  async enigma({ sock, msg, ctx, args }) {
    const ENIGMAS = [
      { q: 'O que é, o que é? Tem dentes mas não morde.', a: 'pente' },
      { q: 'O que é, o que é? Tem cabeça mas não tem cérebro.', a: 'alfinete' },
      { q: 'O que é, o que é? Quanto mais seca, mais molhada fica.', a: 'toalha' },
      { q: 'O que é, o que é? Tem cidades mas não tem casas.', a: 'mapa' },
      { q: 'O que é, o que é? Tem rios mas não tem água.', a: 'mapa' },
      { q: 'O que é, o que é? Tem floresta mas não tem árvores.', a: 'mapa' },
      { q: 'O que é, o que é? Tem montanhas mas não tem pedras.', a: 'mapa' },
      { q: 'O que é, o que é? Tem pés mas não anda.', a: 'mesa' },
      { q: 'O que é, o que é? Tem face mas não tem corpo.', a: 'moeda' },
      { q: 'O que é, o que é? Tem anel mas não é noivado.', a: 'telefone' },
      { q: 'O que é, o que é? Tem chaves mas não abre portas.', a: 'piano' },
      { q: 'O que é, o que é? Tem olhos mas não enxerga.', a: 'agulha' },
      { q: 'O que é, o que é? Tem coroa mas não é rei.', a: 'abacaxi' },
      { q: 'O que é, o que é? Tem cama mas não dorme.', a: 'rio' },
      { q: 'O que é, o que é? Tem asas mas não voa.', a: 'ventilador' },
      { q: 'O que é, o que é? Corre mas não tem pernas.', a: 'agua' },
      { q: 'O que é, o que é? Tem boca mas não fala.', a: 'jarra' },
      { q: 'O que é, o que é? Tem braços mas não abraça.', a: 'cadeira' },
      { q: 'O que é, o que é? Pode encher uma sala mas não ocupa espaço.', a: 'luz' },
      { q: 'O que é, o que é? Tem bico mas não é ave.', a: 'garrafa' },
      { q: 'O que é, o que é? Quanto mais cai, mais limpa fica.', a: 'chuva' },
      { q: 'O que é, o que é? Tem ponta mas não é lápis.', a: 'guarda chuva' },
      { q: 'O que é, o que é? Tem lago mas não tem peixe.', a: 'lagoa' },
      { q: 'O que é, o que é? Tem raízes mas não é planta.', a: 'problema' },
      { q: 'O que é, o que é? Tem um aro mas não é argola.', a: 'roda' },
      { q: 'O que é, o que é? Tem uma fila mas não é pessoa.', a: 'dente' },
      { q: 'O que é, o que é? Tem uma língua mas não fala.', a: 'sapato' },
      { q: 'O que é, o que é? Tem uma escama mas não é peixe.', a: 'milho' },
      { q: 'O que é, o que é? Tem cano mas não é instrumento.', a: 'cano' },
    ];

    const key = `enigma_${ctx.senderNumber}`;
    const expected = mathAnswers.get(key);

    // Se há resposta e há enigma ativo, valida
    if (expected && args.length > 0) {
      const ans = args.join(' ').toLowerCase().trim().replace(/\s+/g, ' ');
      mathAnswers.delete(key);
      const eco = await Economy.getOrCreate(ctx.senderNumber, ctx.pushName);
      if (ans === expected || ans.includes(expected) || expected.includes(ans)) {
        eco.coins += 200; eco.wins++; eco.addXp(20); await eco.save();
        return reply(sock, msg, ctx, `✅ Correto! Era *${expected}*\n💰 +200 🪙 +20 XP`);
      }
      eco.coins = Math.max(0, eco.coins - 40); eco.losses++; await eco.save();
      return reply(sock, msg, ctx, `❌ Errado! Era *${expected}*\n💀 -40 🪙`);
    }

    // Novo enigma
    const e = pick(ENIGMAS);
    mathAnswers.set(key, e.a);
    return reply(sock, msg, ctx,
      `🧩 *ENIGMA!*\n\n${e.q}\n\nResponda: !enigma <resposta>\n💰 Vale 200 🪙 +20 XP`);
  },

  // ============ TELEFONE SEM FOME ============
  async telefone({ sock, msg, ctx, args }) {
    if (!ctx.isGroup) return reply(sock, msg, ctx, '👥 Só em grupos!');
    const session = getQuizSession(ctx.remoteJid);
    if (session.telefoneActive) {
      if (!session.telefoneChain) session.telefoneChain = [];
      if (session.telefoneChain.length === 0) {
        const frase = args.join(' ').trim();
        if (!frase) return reply(sock, msg, ctx, '📝 Escreva a frase para começar: !telefone <frase>');
        session.telefoneOriginal = frase;
        session.telefoneChain.push({ num: ctx.senderNumber, name: ctx.pushName, text: frase });
        return reply(sock, msg, ctx,
          `📞 *TELEFONE SEM FOME iniciado!*\n\n` +
          `Frase original enviada em privado para @${ctx.senderNumber}\n` +
          `Agora o próximo deve usar !telefone para repetir o que entendeu!\n\n` +
          `Próximo: quem quiser, diga !telefone e o bot enviará a frase por PV.`, [ctx.senderJid]);
      }
      const last = session.telefoneChain[session.telefoneChain.length - 1];
      if (last.num === ctx.senderNumber && session.telefoneChain.length > 1) {
        return reply(sock, msg, ctx, '⚠️ Espere outra pessoa!');
      }
      const frase = args.join(' ').trim();
      if (!frase) {
        try {
          await sock.sendMessage(ctx.senderJid, {
            text: `📞 *TELEFONE SEM FOME*\n\nRepita esta frase no grupo com !telefone <frase>:\n\n"${last.text}"\n\n_(Não mostre para ninguém!)_`,
          });
          return reply(sock, msg, ctx, `📞 @${ctx.senderNumber} recebeu a frase por PV! Aguarde...`, [ctx.senderJid]);
        } catch (e) {
          return reply(sock, msg, ctx, `❌ Não consegui enviar PV. Frase: "${last.text}"`);
        }
      }
      session.telefoneChain.push({ num: ctx.senderNumber, name: ctx.pushName, text: frase });
      if (session.telefoneChain.length >= 5) {
        session.telefoneActive = false;
        let result = `📞 *TELEFONE SEM FOME — RESULTADO!*\n\n`;
        result += `Original: "${session.telefoneOriginal}"\n\n`;
        session.telefoneChain.forEach((p, i) => {
          result += `${i+1}. @${p.num}: "${p.text}"\n`;
        });
        const mentions = session.telefoneChain.map(p => `${p.num}@s.whatsapp.net`);
        return reply(sock, msg, ctx, result, mentions);
      }
      return reply(sock, msg, ctx,
        `📞 @${ctx.senderNumber} repetiu!\n\n` +
        `"${frase}"\n\n` +
        `Próximo: !telefone (recebe por PV) ou !telefone <frase> se já souber`);
    }
    session.telefoneActive = true;
    session.telefoneChain = [];
    session.telefoneOriginal = '';
    return reply(sock, msg, ctx,
      `📞 *TELEFONE SEM FOME!*\n\n` +
      `1. Alguém manda !telefone <frase secreta>\n` +
      `2. O bot envia a frase em PV para o próximo\n` +
      `3. Cada um repete o que entendeu no grupo\n` +
      `4. Após 5 pessoas, o bot revela a cadeia completa!\n\n` +
      `Quem começa?`);
  },

  // ============ TRUCO SIMPLIFICADO ============
  async truco({ sock, msg, ctx, args }) {
    if (!ctx.isGroup) return reply(sock, msg, ctx, '👥 Só em grupos!');
    const session = getQuizSession(ctx.remoteJid);

    const arg0 = (args[0] || '').toLowerCase();

    // Aceitar desafio
    if (session.trucoActive && !session.trucoAcceptor && (arg0 === 'aceitar' || arg0 === 'aceito' || arg0 === 'sim')) {
      if (session.trucoChallenger.num === ctx.senderNumber) return reply(sock, msg, ctx, '⚠️ Você desafiou, não pode aceitar!');
      const eco = await Economy.getOrCreate(ctx.senderNumber, ctx.pushName);
      if (eco.coins < session.trucoBet) return reply(sock, msg, ctx, `❌ Você precisa de ${session.trucoBet} 🪙`);

      session.trucoAcceptor = { num: ctx.senderNumber, name: ctx.pushName };
      eco.coins -= session.trucoBet; await eco.save();
      const ecoC = await Economy.getOrCreate(session.trucoChallenger.num, session.trucoChallenger.name);
      ecoC.coins -= session.trucoBet; await ecoC.save();

      const deck = [];
      const naipes = ['♠️','♥️','♦️','♣️'];
      const nomes = ['2','3','4','5','6','7','J','Q','K','A'];
      const forcas = [5,6,7,8,9,10,11,12,13,14];
      for (const n of naipes) {
        for (let i = 0; i < nomes.length; i++) deck.push({ nome: nomes[i]+n, forca: forcas[i] });
      }
      for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
      }
      const c1 = [deck[0], deck[1], deck[2]];
      const c2 = [deck[3], deck[4], deck[5]];
      session.trucoDeck = { c1, c2 };
      session.trucoRound = 0;
      session.trucoScore = [0, 0];
      session.trucoC1 = session.trucoChallenger.num;
      session.trucoC2 = session.trucoAcceptor.num;

      try {
        await sock.sendMessage(`${session.trucoC1}@s.whatsapp.net`, {
          text: `🃏 *TRUCO* — Suas cartas:\n\n${c1.map((c,i) => `${i+1}. ${c.nome} (força ${c.forca})`).join('\n')}\n\nUse no grupo: !truco jogar <1-3>`,
        });
        await sock.sendMessage(`${session.trucoC2}@s.whatsapp.net`, {
          text: `🃏 *TRUCO* — Suas cartas:\n\n${c2.map((c,i) => `${i+1}. ${c.nome} (força ${c.forca})`).join('\n')}\n\nUse no grupo: !truco jogar <1-3>`,
        });
      } catch (e) {}

      return reply(sock, msg, ctx,
        `🃏 *TRUCO ACEITO!*\n\n` +
        `❌ ${session.trucoChallenger.name}\n` +
        `⭕ ${session.trucoAcceptor.name}\n\n` +
        `Aposta: *${session.trucoBet} 🪙*\n` +
        `Cartas enviadas por PV!\n` +
        `Rodada 1/3 — Use: !truco jogar <1-3>`,
        [`${session.trucoC1}@s.whatsapp.net`, `${session.trucoC2}@s.whatsapp.net`]);
    }

    // Jogar carta
    if (session.trucoActive && session.trucoAcceptor && arg0 === 'jogar') {
      const idx = parseInt(args[1]) - 1;
      if (isNaN(idx) || idx < 0 || idx > 2) return reply(sock, msg, ctx, '❌ Use !truco jogar <1-3>');

      const isP1 = ctx.senderNumber === session.trucoC1;
      const isP2 = ctx.senderNumber === session.trucoC2;
      if (!isP1 && !isP2) return reply(sock, msg, ctx, '⚠️ Você não está no jogo!');

      const player = isP1 ? 'p1' : 'p2';
      if (!session.trucoPlayed) session.trucoPlayed = {};
      if (session.trucoPlayed[player] !== undefined) return reply(sock, msg, ctx, '⚠️ Você já jogou esta rodada!');
      session.trucoPlayed[player] = idx;

      const deck = isP1 ? session.trucoDeck.c1 : session.trucoDeck.c2;
      const card = deck[idx];

      if (session.trucoPlayed.p1 !== undefined && session.trucoPlayed.p2 !== undefined) {
        const c1 = session.trucoDeck.c1[session.trucoPlayed.p1];
        const c2 = session.trucoDeck.c2[session.trucoPlayed.p2];
        const winner = c1.forca > c2.forca ? 0 : c1.forca < c2.forca ? 1 : -1;
        if (winner !== -1) session.trucoScore[winner]++;
        session.trucoRound++;
        session.trucoPlayed = {};

        let text = `🃏 *RODADA ${session.trucoRound}*\n\n`;
        text += `❌ ${session.trucoChallenger.name}: ${c1.nome}\n`;
        text += `⭕ ${session.trucoAcceptor.name}: ${c2.nome}\n\n`;
        if (winner === 0) text += `✅ Venceu ❌ ${session.trucoChallenger.name}!`;
        else if (winner === 1) text += `✅ Venceu ⭕ ${session.trucoAcceptor.name}!`;
        else text += `🤝 Empate!`;
        text += `\nPlacar: ${session.trucoScore[0]} - ${session.trucoScore[1]}`;

        if (session.trucoRound >= 3 || session.trucoScore[0] >= 2 || session.trucoScore[1] >= 2) {
          session.trucoActive = false;
          const finalWinner = session.trucoScore[0] > session.trucoScore[1] ? 0 : session.trucoScore[0] < session.trucoScore[1] ? 1 : -1;
          const total = session.trucoBet * 2;
          if (finalWinner !== -1) {
            const winNum = finalWinner === 0 ? session.trucoC1 : session.trucoC2;
            const winName = finalWinner === 0 ? session.trucoChallenger.name : session.trucoAcceptor.name;
            const eco = await Economy.getOrCreate(winNum, winName);
            eco.coins += total; eco.wins++; eco.addXp(40); await eco.save();
            text += `\n\n🏆 *${winName} VENCEU!*\n💰 +${total} 🪙 +40 XP`;
          } else {
            const eco1 = await Economy.getOrCreate(session.trucoC1, session.trucoChallenger.name);
            const eco2 = await Economy.getOrCreate(session.trucoC2, session.trucoAcceptor.name);
            eco1.coins += session.trucoBet; eco2.coins += session.trucoBet; await eco1.save(); await eco2.save();
            text += `\n\n🤝 *EMPATE!* Aposta devolvida.`;
          }
        } else {
          text += `\n\nPróxima rodada: !truco jogar <1-3>`;
        }
        return reply(sock, msg, ctx, text,
          [`${session.trucoC1}@s.whatsapp.net`, `${session.trucoC2}@s.whatsapp.net`]);
      }

      return reply(sock, msg, ctx,
        `🃏 @${ctx.senderNumber} jogou *${card.nome}*!\n` +
        `Aguardando oponente...`, [ctx.senderJid]);
    }

    if (session.trucoActive) return reply(sock, msg, ctx, `🎮 Truco já em andamento!\nUse: !truco aceitar / !truco jogar <1-3>`);

    // Novo desafio
    const valor = parseInt(arg0) || 1;
    if (valor < 1 || valor > 12) return reply(sock, msg, ctx, '💰 Aposta: 1-12. Use: !truco <valor>');
    const eco = await Economy.getOrCreate(ctx.senderNumber, ctx.pushName);
    if (eco.coins < valor * 100) return reply(sock, msg, ctx, `❌ Você precisa de ${valor*100} 🪙`);

    session.trucoActive = true;
    session.trucoBet = valor * 100;
    session.trucoChallenger = { num: ctx.senderNumber, name: ctx.pushName };
    session.trucoAcceptor = null;
    return reply(sock, msg, ctx,
      `🃏 *TRUCO!*\n\n` +
      `@${ctx.senderNumber} desafiou com *${valor*100} 🪙*!\n\n` +
      `Quem aceita? Responda: !truco aceitar`, [ctx.senderJid]);
  },

  // ============ ADIVINHA NÚMERO ============
  async adivinha({ sock, msg, ctx, args }) {
    if (!ctx.isGroup) return reply(sock, msg, ctx, '👥 Só em grupos!');
    const session = await GameSession.findOne({ groupJid: ctx.remoteJid, game: 'adivinha', active: true });
    const num = parseInt(args[0]);
    if (!session) {
      const secret = randInt(1, 100);
      await GameSession.create({
        groupJid: ctx.remoteJid, game: 'adivinha', startedBy: ctx.senderNumber,
        state: { secret, tries: 0, maxTries: 7 },
      });
      return reply(sock, msg, ctx, `🔢 *ADIVINHA O NÚMERO (1-100)*

Tente: !adivinha <número>
Você tem 7 tentativas!`);
    }
    if (isNaN(num)) return reply(sock, msg, ctx, '❌ Use: !adivinha 42');
    const s = session.state;
    s.tries++;
    if (num === s.secret) {
      session.active = false; await session.save();
      const eco = await Economy.getOrCreate(ctx.senderNumber, ctx.pushName);
      const prize = Math.max(100, 800 - s.tries * 100);
      eco.coins += prize; eco.addXp(30); await eco.save();
      return reply(sock, msg, ctx, `🎉 *@${ctx.senderNumber} ACERTOU!*

Número: *${s.secret}*
Tentativas: ${s.tries}/7
💰 +${prize} 🪙`, [ctx.senderJid]);
    }
    if (s.tries >= s.maxTries) {
      session.active = false; await session.save();
      return reply(sock, msg, ctx, `💀 *PERDERAM!*

Número era: *${s.secret}*`);
    }
    session.markModified('state'); await session.save();
    const dica = num < s.secret ? 'MAIOR ⬆️' : 'MENOR ⬇️';
    return reply(sock, msg, ctx, `❌ Errou! Dica: ${dica}
Tentativa ${s.tries}/7`);
  },

  // ============ PEDRA PAPEL TESOURA ============
  async ppt({ sock, msg, ctx, args }) {
    const choice = (args[0] || '').toLowerCase();
    const map = { pedra: '✊', papel: '✋', tesoura: '✌️', p: '✊', pa: '✋', t: '✌️' };
    if (!map[choice]) return reply(sock, msg, ctx, '✊✋✌️ Use: !ppt pedra/papel/tesoura');
    const bot = pick(['pedra','papel','tesoura']);
    const user = choice.startsWith('p') && choice.length<3 ? 'pedra' : choice.startsWith('pa') ? 'papel' : choice.startsWith('t') ? 'tesoura' : choice;
    const win = (user==='pedra'&&bot==='tesoura')||(user==='papel'&&bot==='pedra')||(user==='tesoura'&&bot==='papel');
    const draw = user===bot;
    const eco = await Economy.getOrCreate(ctx.senderNumber, ctx.pushName);
    let txt = `✊✋✌️ *PPT*

Você: ${map[user]} ${user}
Bot: ${map[bot]} ${bot}

`;
    if (draw) { txt += '🤝 Empate!'; }
    else if (win) { eco.coins += 50; eco.addXp(10); await eco.save(); txt += '🏆 Você venceu! +50 🪙'; }
    else { eco.coins = Math.max(0, eco.coins - 20); await eco.save(); txt += '💀 Perdeu! -20 🪙'; }
    return reply(sock, msg, ctx, txt);
  },

  // ============ ANAGRAMA ============
  async anagrama({ sock, msg, ctx, args }) {
    if (!ctx.isGroup) return reply(sock, msg, ctx, '👥 Só em grupos!');
    const session = await GameSession.findOne({ groupJid: ctx.remoteJid, game: 'anagrama', active: true });
    const palavras = ['DARKBOT','WHATSAPP','ANGOLA','BRASIL','PROGRAMAR','INTERNET','FUTEBOL','MUSICA','COMPUTADOR','TELEFONE'];
    if (!session) {
      const word = pick(palavras);
      const scrambled = word.split('').sort(()=>Math.random()-0.5).join('');
      await GameSession.create({ groupJid: ctx.remoteJid, game: 'anagrama', startedBy: ctx.senderNumber, state: { word, scrambled, start: Date.now() } });
      return reply(sock, msg, ctx, `🔤 *ANAGRAMA*

Desembaralhe: *${scrambled}*

Responda: !anagrama <palavra>`);
    }
    const guess = (args[0]||'').toUpperCase();
    if (guess === session.state.word) {
      session.active = false; await session.save();
      const time = Math.round((Date.now()-session.state.start)/1000);
      const eco = await Economy.getOrCreate(ctx.senderNumber, ctx.pushName);
      const prize = Math.max(100, 500 - time*5);
      eco.coins += prize; eco.addXp(25); await eco.save();
      return reply(sock, msg, ctx, `✅ *@${ctx.senderNumber} ACERTOU!*

Palavra: *${session.state.word}*
Tempo: ${time}s
💰 +${prize} 🪙`, [ctx.senderJid]);
    }
    return reply(sock, msg, ctx, `❌ Errado! Dica: ${session.state.scrambled}`);
  },

  // ============ MATEMÁTICA RÁPIDA ============
  async math({ sock, msg, ctx, args }) {
    const key = ctx.senderNumber;
    if (!mathAnswers.has(key)) {
      const a = randInt(10,99), b = randInt(10,99), op = pick(['+','-','*']);
      const ans = op==='+'?a+b:op==='-'?a-b:a*b;
      mathAnswers.set(key, ans);
      setTimeout(()=>mathAnswers.delete(key), 30000);
      return reply(sock, msg, ctx, `🧮 *MATEMÁTICA RÁPIDA*

Quanto é *${a} ${op} ${b}* ?

Responda: !math <resposta>
30 segundos!`);
    }
    const ans = mathAnswers.get(key);
    const guess = parseInt(args[0]);
    if (guess === ans) {
      mathAnswers.delete(key);
      const eco = await Economy.getOrCreate(ctx.senderNumber, ctx.pushName);
      eco.coins += 150; eco.addXp(20); await eco.save();
      return reply(sock, msg, ctx, `✅ Correto! +150 🪙 +20 XP`);
    }
    return reply(sock, msg, ctx, `❌ Errado! Tente novamente: !math <número>`);
  },

  // ============ ROLETA RUSSA ============
  async roleta({ sock, msg, ctx }) {
    if (!ctx.isGroup) return reply(sock, msg, ctx, '👥 Só em grupos!');
    const eco = await Economy.getOrCreate(ctx.senderNumber, ctx.pushName);
    if (eco.coins < 100) return reply(sock, msg, ctx, '❌ Precisa 100 🪙 para jogar');
    const bullet = randInt(1,6);
    const shot = randInt(1,6);
    eco.coins -= 100;
    if (shot === bullet) {
      eco.losses++; await eco.save();
      return reply(sock, msg, ctx, `💥 *BANG!* @${ctx.senderNumber} morreu!

Perdeu 100 🪙`, [ctx.senderJid]);
    } else {
      const win = 500;
      eco.coins += win; eco.wins++; eco.addXp(50); await eco.save();
      return reply(sock, msg, ctx, `😅 *CLICK!* @${ctx.senderNumber} sobreviveu!

Ganhou ${win} 🪙`, [ctx.senderJid]);
    }
  },
};

// helpers blackjack
function newDeck() {
  const suits = ['♠️','♥️','♦️','♣️'];
  const vals = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
  const d = [];
  for (const s of suits) for (const v of vals) d.push(v + s);
  return d.sort(() => Math.random() - 0.5);
}
function drawCard(deck) { return deck.pop(); }
function sumHand(hand) {
  let sum = 0, aces = 0;
  for (const c of hand) {
    const v = c.slice(0, c.length-2);
    if (v === 'A') { aces++; sum += 11; }
    else if (['J','Q','K'].includes(v)) sum += 10;
    else sum += parseInt(v);
  }
  while (sum > 21 && aces > 0) { sum -= 10; aces--; }
  return sum;
}
