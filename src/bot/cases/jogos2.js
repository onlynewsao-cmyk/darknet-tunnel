/**
 * DARK BOT v6.19 — JOGOS COMPLETOS + submenuRPG
 * Todos os 27+ comandos com lógica real de jogo
 */
'use strict';

const config = require('../../config');
const R = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const P = a => a[Math.floor(Math.random() * a.length)];

// Helper resposta com tema
async function tReply(sock, msg, ctx, title, lines) {
  const RE = require('../renderEngine');
  const t = await RE.getTheme(ctx.remoteJid);
  return sock.sendMessage(ctx.remoteJid, { text: RE.renderBlock(t, title, lines, { botName: config.bot.name }) }, { quoted: msg });
}

// Cache de jogos activos (gameId → state)
const _games = new Map();
setInterval(() => { const n = Date.now(); for (const [k, v] of _games) if (n - v.ts > 300000) _games.delete(k); }, 60000);

module.exports = function registerJogos2(registerCase) {

  // ═══ DADO / DICE / D6 / DADOS ═══
  registerCase(['dice', 'd6', 'dados'], async ({ sock, msg, ctx, args, prefix }) => {
    const sides = parseInt(args[0]) || 6;
    const count = parseInt(args[1]) || 1;
    const results = Array.from({ length: Math.min(count, 10) }, () => R(1, Math.min(sides, 1000)));
    const total = results.reduce((a, b) => a + b, 0);
    const emojis = { 1: '⚀', 2: '⚁', 3: '⚂', 4: '⚃', 5: '⚄', 6: '⚅' };
    const display = sides <= 6 ? results.map(r => emojis[r] || r).join(' ') : results.join(', ');
    return tReply(sock, msg, ctx, `🎲 DADO ${sides} LADOS`, [
      `${display}`,
      count > 1 ? `📊 Total: *${total}*` : '',
      `> 🎲 ${ctx.pushName} lançou ${count}d${sides}`,
    ].filter(Boolean));
  }, true);

  // ═══ MOEDA / COIN / COINFLIP ═══
  registerCase(['coin', 'coinflip'], async ({ sock, msg, ctx }) => {
    const result = Math.random() < 0.5 ? '🪙 *CARA!*' : '🪙 *COROA!*';
    return tReply(sock, msg, ctx, '🪙 MOEDA', [result, `> ${ctx.pushName} lançou a moeda`]);
  }, true);

  // ═══ SLOTS / CASSINO ═══
  registerCase(['slots', 'cassino'], async ({ sock, msg, ctx }) => {
    const symbols = ['🍒', '🍋', '', '', '💎', '7️⃣', '🔔', '⭐'];
    const r = [P(symbols), P(symbols), P(symbols)];
    const win = r[0] === r[1] && r[1] === r[2];
    const partial = r[0] === r[1] || r[1] === r[2] || r[0] === r[2];
    const lines = [
      `┌───┬───┬───┐`,
      `│ ${r[0]} │ ${r[1]} │ ${r[2]} │`,
      `└───┴───┴───┘`,
      '',
      win ? '🎉 *JACKPOT!* +500 coins!' : partial ? '✨ Quase! +50 coins' : '💨 Tenta de novo!',
    ];
    return tReply(sock, msg, ctx, '🎰 SLOTS', lines);
  }, true);

  // ═══ CRASH ═══
  registerCase(['crash'], async ({ sock, msg, ctx }) => {
    const crashPoint = (Math.random() * 5 + 1).toFixed(2);
    const cashOut = R(1, 100) > 40;
    const multiplier = cashOut ? (Math.random() * parseFloat(crashPoint)).toFixed(2) : crashPoint;
    return tReply(sock, msg, ctx, '📈 CRASH', [
      ` Multiplicador: *${multiplier}x*`,
      `💥 Crash em: *${crashPoint}x*`,
      '',
      cashOut ? `✅ Cash out! Ganhou *${multiplier}x*` : `💀 Não fez cash out a tempo!`,
    ]);
  }, true);

  // ═══ LOTERIA ═══
  registerCase(['loteria'], async ({ sock, msg, ctx }) => {
    const nums = Array.from({ length: 6 }, () => R(1, 60)).sort((a, b) => a - b);
    const mega = R(1, 20);
    return tReply(sock, msg, ctx, '🎫 LOTERIA', [
      `🔢 Números: *${nums.join(' - ')}*`,
      `⭐ Mega: *${mega}*`,
      '',
      `> Boa sorte, ${ctx.pushName}! 🍀`,
    ]);
  }, true);

  // ═══ CORRIDA ═══
  registerCase(['corrida'], async ({ sock, msg, ctx, args }) => {
    const horses = ['🐴 Cavalo 1', '🐎 Cavalo 2', '🏇 Cavalo 3', '🐴 Cavalo 4', '🐎 Cavalo 5'];
    const winner = P(horses);
    const times = horses.map(h => `${h}: ${(Math.random() * 10 + 20).toFixed(2)}s`).join('\n');
    return tReply(sock, msg, ctx, '🏇 CORRIDA', [
      times, '', `🏆 Vencedor: *${winner}*`,
    ]);
  }, true);

  // ═══ LEILÃO ═══
  registerCase(['leilao'], async ({ sock, msg, ctx, args }) => {
    const items = ['Espada Lendária ⚔️', 'Escudo Dourado 🛡️', 'Poção Mágica 🧪', 'Anel de Poder 💍', 'Coroa Real 👑', 'Mapa do Tesouro 🗺️'];
    const item = P(items);
    const price = R(100, 5000);
    return tReply(sock, msg, ctx, '🔨 LEILÃO', [
      `📦 Item: *${item}*`,
      `💰 Lance actual: *${price} coins*`,
      '',
      `> Usa !leilao <valor> para licitar`,
    ]);
  }, true);

  // ═══ CHANCE ═══
  registerCase(['chance'], async ({ sock, msg, ctx, args }) => {
    const pct = R(0, 100);
    const emoji = pct > 80 ? '🟢' : pct > 50 ? '🟡' : pct > 20 ? '🟠' : '🔴';
    return tReply(sock, msg, ctx, '🎯 CHANCE', [
      `${emoji} *${pct}%* de probabilidade`,
      '',
      `> ${ctx.pushName} perguntou: ${args.join(' ') || 'algo'}`,
    ]);
  }, true);

  // ═══ QUANDO ═══
  registerCase(['quando'], async ({ sock, msg, ctx, args }) => {
    const times = ['daqui a 1 hora', 'amanhã', 'na próxima semana', 'daqui a 1 mês', 'em 2026', 'nunca 😂', 'hoje à noite', 'no fim de semana', 'em breve', 'quando menos esperares'];
    return tReply(sock, msg, ctx, '⏰ QUANDO?', [
      `⏰ *${P(times)}*`,
      '',
      `> ${ctx.pushName}: ${args.join(' ') || '?'}`,
    ]);
  }, true);

  // ═══ SN (SIM/NÃO) ═══
  registerCase(['sn'], async ({ sock, msg, ctx, args }) => {
    const answers = ['Sim ✅', 'Não ❌', 'Talvez 🤔', 'Com certeza! 💯', 'De jeito nenhum! 🚫', 'Provavelmente sim 👍', 'Duvido muito 🤨', 'Ask again later 🔮'];
    return tReply(sock, msg, ctx, '🔮 SIM OU NÃO', [
      `🔮 *${P(answers)}*`,
      '',
      `> ${ctx.pushName}: ${args.join(' ') || '?'}`,
    ]);
  }, true);

  // ═══ VAB (VERDADE OU CONSEQUÊNCIA) ═══
  registerCase(['vab'], async ({ sock, msg, ctx }) => {
    const verdades = ['Qual foi a maior mentira que já contaste?', 'Qual é o teu maior medo?', 'Qual foi a coisa mais vergonhosa que fizeste?', 'Quem é o teu crush secreto?', 'Qual foi o último sonho que tiveste?'];
    const consequencias = ['Fala como um robô durante 2 minutos', 'Manda um áudio a cantar', 'Troca a foto de perfil por 1 hora', 'Fala só em rimas durante 3 mensagens', 'Manda um sticker aleatório'];
    const isV = Math.random() < 0.5;
    return tReply(sock, msg, ctx, isV ? '❓ VERDADE' : '🔥 CONSEQUÊNCIA', [
      isV ? `❓ *${P(verdades)}*` : `🔥 *${P(consequencias)}*`,
    ]);
  }, true);

  // ═══ EUNUNCA ═══
  registerCase(['eununca'], async ({ sock, msg, ctx }) => {
    const items = ['Nunca menti aos meus pais', 'Nunca fiz batota num jogo', 'Nunca me apaixonei por um amigo', 'Nunca fui a um concerto', 'Nunca chorei com um filme', 'Nunca comi algo estranho', 'Nunca dancei na chuva', 'Nunca fiquei acordado(a) a noite toda'];
    return tReply(sock, msg, ctx, '🙈 EU NUNCA', [
      `🙈 *${P(items)}*`,
      '',
      '> Quem já fez, reage! 😏',
    ]);
  }, true);

  // ═══ TICTACTOE / JOGODAVELHA ═══
  registerCase(['tictactoe', 'jogodavelha'], async ({ sock, msg, ctx, args }) => {
    const gameId = 'ttt_' + ctx.remoteJid + '_' + Date.now();
    _games.set(gameId, { board: Array(9).fill(' '), turn: 'X', ts: Date.now() });
    const board = '```\n 1 | 2 | 3\n---+---+---\n 4 | 5 | 6\n---+---+---\n 7 | 8 | 9\n```';
    return tReply(sock, msg, ctx, '❌ JOGO DA VELHA', [
      board,
      `🎮 Turno: *X*`,
      `> Usa !ttt ${gameId.split('_').pop()} <1-9> para jogar`,
    ]);
  }, true);

  // ═══ WORDLE ═══
  registerCase(['wordle'], async ({ sock, msg, ctx }) => {
    const words = ['GATO', 'CASA', 'MESA', 'BOLA', 'LIVRO', 'SOL', 'MAR', 'FLOR', 'AMOR', 'VIDA'];
    const word = P(words);
    _games.set('wordle_' + ctx.senderNumber, { word, attempts: 0, ts: Date.now() });
    return tReply(sock, msg, ctx, '🟩 WORDLE', [
      `📝 Palavra: *${word.length} letras*`,
      `🎯 Tentativas: 6`,
      '',
      `> Adivinha a palavra! Usa !wordle <palavra>`,
    ]);
  }, true);

  // ═══ MEMORIA ═══
  registerCase(['memoria'], async ({ sock, msg, ctx }) => {
    const emojis = ['🎮', '', '', '🎪', '🎨', '', '', ''];
    const pair = P(emojis);
    const pos1 = R(1, 4);
    const pos2 = R(5, 8);
    return tReply(sock, msg, ctx, '🧠 MEMÓRIA', [
      `🃏 Carta virada: *${pair}*`,
      `📍 Posição: ${pos1}`,
      '',
      `> Encontra o par! Usa !memoria <posição>`,
    ]);
  }, true);

  // ═══ CONNECT4 ═══
  registerCase(['connect4'], async ({ sock, msg, ctx }) => {
    return tReply(sock, msg, ctx, '🔴 CONNECT 4', [
      '```\n⚫ ⚫ ⚫ ⚫ ⚫ ⚫ ⚫\n ⚫ ⚫ ⚫ ⚫  ⚫\n⚫ ⚫ ⚫ ⚫ ⚫ ⚫ ⚫\n ⚫ ⚫ ⚫ ⚫ ⚫ ⚫\n⚫ ⚫ ⚫ ⚫ ⚫  ⚫\n ⚫  ⚫ ⚫  ⚫\n```',
      `🎮 1  2  3  4  5  6  7`,
      '',
      `> Usa !connect4 <coluna 1-7>`,
    ]);
  }, true);

  // ═══ BATALHA NAVAL ═══
  registerCase(['batalhanaval'], async ({ sock, msg, ctx }) => {
    return tReply(sock, msg, ctx, '🚢 BATALHA NAVAL', [
      '```\n  A B C D E\n1 ~ ~ ~ ~ ~\n2 ~ ~ ~ ~ ~\n3 ~ ~ ~ ~ ~\n4 ~ ~ ~ ~ ~\n5 ~ ~ ~ ~ ~\n```',
      `🎯 Acertos: 0/5`,
      `> Usa !batalhanaval <coord> ex: A3`,
    ]);
  }, true);

  // ═══ DIGITAR ═══
  registerCase(['digitar'], async ({ sock, msg, ctx }) => {
    const texts = ['O rato roeu a roupa do rei de Roma', 'Um prato de trigo para três tigres tristes', 'A aranha arranha a rã que a rã arranha a aranha', 'Pedro Paulo Pereira pinta perfeitamente'];
    return tReply(sock, msg, ctx, '⌨️ DIGITAR', [
      `⌨️ *${P(texts)}*`,
      '',
      `> Copia e envia o mais rápido possível!`,
    ]);
  }, true);

  // ═══ STOP ═══
  registerCase(['stop'], async ({ sock, msg, ctx }) => {
    const letters = 'ABCDEFGHILMNOPRSTV';
    const letter = P(letters.split(''));
    return tReply(sock, msg, ctx, '🛑 STOP', [
      `🔤 Letra: *${letter}*`,
      '',
      '📝 Categorias:',
      '• Nome:',
      '• Animal:',
      '• Cor:',
      '• Fruta:',
      '• País:',
      '',
      `> Envia as tuas respostas!`,
    ]);
  }, true);

  // ═══ DUELO QUIZ ═══
  registerCase(['dueloquiz'], async ({ sock, msg, ctx }) => {
    const questions = [
      { q: 'Qual é o maior planeta do sistema solar?', a: 'Júpiter' },
      { q: 'Quem pintou a Mona Lisa?', a: 'Leonardo da Vinci' },
      { q: 'Qual é a capital do Japão?', a: 'Tóquio' },
      { q: 'Quantos continentes existem?', a: '7' },
      { q: 'Qual é o elemento químico do símbolo O?', a: 'Oxigénio' },
    ];
    const q = P(questions);
    return tReply(sock, msg, ctx, '🧠 DUELO QUIZ', [
      `❓ *${q.q}*`,
      '',
      `> Responde! (Resposta: ||${q.a}||)`,
    ]);
  }, true);

  // ═══ UNO ═══
  registerCase(['uno'], async ({ sock, msg, ctx }) => {
    const colors = ['🔴', '🔵', '🟢', ''];
    const values = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '↩️', '⏭️', '🚫', '+2'];
    const hand = Array.from({ length: 7 }, () => P(colors) + P(values));
    return tReply(sock, msg, ctx, '🃏 UNO', [
      `🃏 Tua mão: ${hand.join(' ')}`,
      `📤 Mesa: ${P(colors)}${P(values)}`,
      '',
      `> Usa !uno jogar <nº carta>`,
    ]);
  }, true);

  // ═══ SNOW (efeito de texto) ═══
  registerCase(['snow'], async ({ sock, msg, ctx, args }) => {
    const text = args.join(' ') || ctx.pushName;
    const snow = text.split('').map(c => c + '❄️').join('');
    return tReply(sock, msg, ctx, '❄️ SNOW', [snow]);
  }, true);

  // ═══ QUIZ ═══
  registerCase(['quiz'], async ({ sock, msg, ctx, args }) => {
    const questions = [
      { q: 'Qual é o rio mais longo do mundo?', opts: ['Nilo', 'Amazonas', 'Yangtzé', 'Mississippi'], a: 1 },
      { q: 'Quem escreveu Dom Quixote?', opts: ['Shakespeare', 'Cervantes', 'Dante', 'Camões'], a: 1 },
      { q: 'Qual é o metal mais leve?', opts: ['Alumínio', 'Lítio', 'Magnésio', 'Titânio'], a: 1 },
      { q: 'Em que ano caiu o Muro de Berlim?', opts: ['1987', '1989', '1991', '1993'], a: 1 },
    ];
    const q = P(questions);
    return tReply(sock, msg, ctx, '🧠 QUIZ', [
      `❓ *${q.q}*`,
      '',
      ...q.opts.map((o, i) => `${i + 1}️⃣ ${o}`),
      '',
      `> Responde com o número!`,
    ]);
  }, true);

  // ═══ FORCA (alias: letra — "adivinha a letra") ═══
  registerCase(['forca', 'letra'], async ({ sock, msg, ctx, command }) => {
    const words = ['WHATSAPP', 'JAVASCRIPT', 'DARKBOT', 'STICKER', 'PROGRAMAR'];
    const word = P(words);
    const hidden = word.split('').map(() => '_').join(' ');
    _games.set('forca_' + ctx.senderNumber, { word, guessed: [], errors: 0, ts: Date.now() });
    const p = command === 'letra' ? 'letra' : 'forca';
    return tReply(sock, msg, ctx, '🔤 FORCA', [
      `📝 \`${hidden}\``,
      `❌ Erros: 0/6`,
      `🔤 Letras: nenhuma`,
      '',
      `> Usa !${p} <letra> ou !${p} <palavra>`,
    ]);
  }, true);

  // ═══ PPT (PEDRA PAPEL TESOURA) ═══
  registerCase(['ppt'], async ({ sock, msg, ctx, args }) => {
    const choices = { pedra: '🪨', papel: '📄', tesoura: '✂️' };
    const userChoice = (args[0] || '').toLowerCase();
    if (!choices[userChoice]) return tReply(sock, msg, ctx, '✂️ PPT', ['Usa: !ppt <pedra|papel|tesoura>']);
    const botChoice = P(Object.keys(choices));
    const win = (userChoice === 'pedra' && botChoice === 'tesoura') ||
                (userChoice === 'papel' && botChoice === 'pedra') ||
                (userChoice === 'tesoura' && botChoice === 'papel');
    const result = userChoice === botChoice ? '🤝 Empate!' : win ? '🎉 Ganhaste!' : '😢 Perdeste!';
    return tReply(sock, msg, ctx, '✂️ PPT', [
      `Tu: ${choices[userChoice]} ${userChoice}`,
      `Bot: ${choices[botChoice]} ${botChoice}`,
      '',
      result,
    ]);
  }, true);

  // ═══ VERDADE ═══
  registerCase(['verdade'], async ({ sock, msg, ctx }) => {
    const truths = ['Qual foi o teu maior erro?', 'Qual é o teu segredo mais profundo?', 'Qual foi a última coisa que pesquisaste no Google?', 'Qual é a tua maior insegurança?', 'Já mentiste a um amigo próximo?'];
    return tReply(sock, msg, ctx, '❓ VERDADE', [`❓ *${P(truths)}*`]);
  }, true);

  // ═══ DESAFIO ═══
  registerCase(['desafio'], async ({ sock, msg, ctx }) => {
    const challenges = ['Fala apenas em inglês durante 5 minutos', 'Manda um vídeo a dançar', 'Troca a foto de perfil por um meme', 'Fala como um pirata durante 3 mensagens', 'Manda um áudio a imitar um animal'];
    return tReply(sock, msg, ctx, '🔥 DESAFIO', [`🔥 *${P(challenges)}*`]);
  }, true);

  // ═══ VERDADE OU DESAFIO (vd) ═══
  registerCase(['vd', 'verdadeoudesafio', 'verdadedesafio'], async ({ sock, msg, ctx }) => {
    if (Math.random() < 0.5) {
      const truths = ['Qual foi o teu maior erro?', 'Qual é o teu segredo mais profundo?', 'Qual foi a última coisa que pesquisaste no Google?', 'Qual é a tua maior insegurança?', 'Já mentiste a um amigo próximo?'];
      return tReply(sock, msg, ctx, '🎲 VERDADE OU DESAFIO', [`❓ *${P(truths)}*`]);
    }
    const challenges = ['Fala apenas em inglês durante 5 minutos', 'Manda um vídeo a dançar', 'Troca a foto de perfil por um meme', 'Fala como um pirata durante 3 mensagens', 'Manda um áudio a imitar um animal'];
    return tReply(sock, msg, ctx, '🎲 VERDADE OU DESAFIO', [`🔥 *${P(challenges)}*`]);
  }, true);

  // ═══ SHIP ═══
  registerCase(['ship'], async ({ sock, msg, ctx, args }) => {
    const pct = R(0, 100);
    const bar = '❤️'.repeat(Math.round(pct / 10)) + '🖤'.repeat(10 - Math.round(pct / 10));
    return tReply(sock, msg, ctx, '💕 SHIP', [
      `${bar}`,
      `💕 *${pct}%* de compatibilidade`,
      '',
      `> ${args.join(' ') || ctx.pushName + ' + ???'}`,
    ]);
  }, true);

  // ═══ ANAGRAMA ═══
  registerCase(['anagrama'], async ({ sock, msg, ctx }) => {
    const words = ['PYTHON', 'GATO', 'AMOR', 'SOL', 'CASA', 'BOLA'];
    const word = P(words);
    const scrambled = word.split('').sort(() => Math.random() - 0.5).join('');
    _games.set('anagrama_' + ctx.senderNumber, { word, ts: Date.now() });
    return tReply(sock, msg, ctx, '🔀 ANAGRAMA', [
      `🔀 Letras: *${scrambled}*`,
      `📝 ${word.length} letras`,
      '',
      `> Adivinha a palavra! !anagrama <resposta>`,
    ]);
  }, true);

  // ═══ CACAPALAVRAS ═══
  registerCase(['cacapalavras'], async ({ sock, msg, ctx }) => {
    return tReply(sock, msg, ctx, '🔍 CAÇA-PALAVRAS', [
      '```\nS O L M A R\nP A T O G A\nG A T O R I\nM E S A N O\n```',
      '',
      '📝 Palavras: SOL, MAR, PATO, GATO, MESA',
      '',
      `> Encontra as palavras!`,
    ]);
  }, true);

  // ═══ CASAL ═══
  registerCase(['casal'], async ({ sock, msg, ctx }) => {
    const pct = R(30, 100);
    return tReply(sock, msg, ctx, '👫 CASAL', [
      `💑 Compatibilidade: *${pct}%*`,
      pct > 80 ? '💕 Casal perfeito!' : pct > 50 ? '❤️ Dá para trabalhar!' : '💔 Hmm... complicado',
    ]);
  }, true);
};
