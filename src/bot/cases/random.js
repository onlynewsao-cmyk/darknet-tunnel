/**
 * DARK BOT v5.4 — Cases Random / Utilitários / Diversão
 * Comandos do ficheiro de referência que não precisam de API externa.
 */
'use strict';

const { applyFont } = require('../botPersonality');

// Dados estáticos
const CANTADAS = [
  'Você não é o Google, mas tem tudo que eu procuro. 😏',
  'Se beleza fosse tempo, você seria a eternidade. ⏳',
  'Não sou fotógrafo, mas consigo nos imaginar juntos. 📸',
  'Você acredita em amor à primeira vista ou passo de novo? 👀',
  'Seu pai é padeiro? Porque você é um pedaço de mau caminho. 🍞',
  'Você não é Wi-Fi, mas estou sentindo uma conexão. 📶',
  'Deve estar cansada, porque correu na minha mente o dia todo. 🏃',
  'Se você fosse uma lágrima, eu nunca choraria para não te perder. 💧',
  'Não sou astronauta, mas vivo nas nuvens pensando em ti. 🚀',
  'Você é a vírgula da minha vida — me faz dar pausa e continuar. ✍️',
  'Seu sorriso é a notificação que eu nunca quero silenciar. 🔔',
  'Não preciso de GPS — meu coração já sabe o caminho até ti. 🧭',
];

const FILOSOFIA = [
  '"A única coisa que sei é que nada sei." — Sócrates',
  '"Penso, logo existo." — René Descartes',
  '"O homem é a medida de todas as coisas." — Protágoras',
  '"A vida não examinada não merece ser vivida." — Sócrates',
  '"Tudo flui, nada permanece." — Heráclito',
  '"O que não me mata, me fortalece." — Friedrich Nietzsche',
  '"A liberdade é o que fazes com o que foi feito de ti." — Jean-Paul Sartre',
  '"O inferno são os outros." — Jean-Paul Sartre',
  '"Deus está morto." — Friedrich Nietzsche',
  '"A felicidade não é um ideal da razão, mas da imaginação." — Kant',
  '"O ser humano é condenado a ser livre." — Sartre',
  '"A vida é um sonho de um sonho." — Calderón de la Barca',
];

const BIBLIA = [
  '"Porque Deus amou o mundo de tal maneira que deu o seu Filho unigénito." — João 3:16',
  '"O Senhor é o meu pastor, nada me faltará." — Salmos 23:1',
  '"Tudo posso naquele que me fortalece." — Filipenses 4:13',
  '"Porque eu bem sei os pensamentos que tenho a vosso respeito, diz o Senhor." — Jeremias 29:11',
  '"Não temas, porque eu sou contigo." — Isaías 41:10',
  '"O amor é paciente, o amor é bondoso." — 1 Coríntios 13:4',
  '"Em todo o tempo ama o amigo, e para a angústia nasce o irmão." — Provérbios 17:17',
  '"Confia no Senhor de todo o teu coração." — Provérbios 3:5',
  '"Porque o salário do pecado é a morte, mas o dom gratuito de Deus é a vida eterna." — Romanos 6:23',
  '"Vinde a mim, todos os que estais cansados e oprimidos, e eu vos aliviarei." — Mateus 11:28',
];

const CORES = [
  { nome: 'Vermelho', hex: '#FF0000', emoji: '🔴' },
  { nome: 'Azul', hex: '#0000FF', emoji: '🔵' },
  { nome: 'Verde', hex: '#00FF00', emoji: '🟢' },
  { nome: 'Amarelo', hex: '#FFFF00', emoji: '🟡' },
  { nome: 'Roxo', hex: '#800080', emoji: '🟣' },
  { nome: 'Laranja', hex: '#FFA500', emoji: '🟠' },
  { nome: 'Rosa', hex: '#FF69B4', emoji: '🩷' },
  { nome: 'Preto', hex: '#000000', emoji: '⚫' },
  { nome: 'Branco', hex: '#FFFFFF', emoji: '⚪' },
  { nome: 'Ciano', hex: '#00FFFF', emoji: '🩵' },
  { nome: 'Dourado', hex: '#FFD700', emoji: '✨' },
  { nome: 'Prata', hex: '#C0C0C0', emoji: '' },
];

module.exports = function registerRandomCases(registerCase) {

  // ── !calc — calculadora ──────────────────────────────────
  registerCase(['calc', 'calcular', 'math'], async ({ text, reply }) => {
    if (!text) return reply(' Uso: `!calc 2+2` ou `!calc 15*3-7`');
    try {
      // Sanitizar: só permitir números e operadores
      const safe = text.replace(/[^0-9+\-*/().%\s]/g, '');
      if (!safe.trim()) return reply('❌ Expressão inválida.');
      const result = Function('"use strict"; return (' + safe + ')')();
      return reply(`🧮 *${text.trim()}* = *${result}*`);
    } catch { return reply('❌ Erro na expressão. Use apenas números e +−×÷()'); }
  });

  // ── !cor — cor aleatória ─────────────────────────────────
  registerCase(['cor', 'color', 'randomcolor'], async ({ reply }) => {
    const c = CORES[Math.floor(Math.random() * CORES.length)];
    return reply(`${c.emoji} *Cor do dia:* ${c.nome}\n HEX: \`${c.hex}\``);
  });

  // ── !bold — texto bold ───────────────────────────────────
  registerCase(['bold', 'negrito'], async ({ text, reply }) => {
    if (!text) return reply('✍️ Uso: `!bold teu texto aqui`');
    return reply(applyFont(text, 'bold'));
  });

  // ── !mini — texto mini/tiny ──────────────────────────────
  registerCase(['mini', 'tiny', 'pequeno'], async ({ text, reply }) => {
    if (!text) return reply('✍️ Uso: `!mini teu texto aqui`');
    return reply(applyFont(text, 'tiny'));
  });

  // ── !smallcaps — texto smallcaps ─────────────────────────
  registerCase(['smallcaps', 'scaps'], async ({ text, reply }) => {
    if (!text) return reply('✍️ Uso: `!smallcaps teu texto aqui`');
    return reply(applyFont(text, 'smallcaps'));
  });

  // ── !mono — texto monospace ──────────────────────────────
  registerCase(['mono', 'monospace', 'code'], async ({ text, reply }) => {
    if (!text) return reply('✍️ Uso: `!mono teu texto aqui`');
    return reply('```\n' + text + '\n```');
  });

  // ── !glitch — texto glitch ───────────────────────────────
  registerCase(['glitch', 'zalgo'], async ({ text, reply }) => {
    if (!text) return reply('✍️ Uso: `!glitch teu texto aqui`');
    return reply(applyFont(text, 'glitch'));
  });

  // ── !cantadas — cantada aleatória ────────────────────────
  registerCase(['cantadas', 'cantada', 'pickup'], async ({ reply }) => {
    return reply('💘 ' + CANTADAS[Math.floor(Math.random() * CANTADAS.length)]);
  });

  // ── !filosofia — frase filosófica ────────────────────────
  registerCase(['filosofia', 'filosofo', 'philosophy'], async ({ reply }) => {
    return reply('🏛️ ' + FILOSOFIA[Math.floor(Math.random() * FILOSOFIA.length)]);
  });

  // ── !biblia — versículo bíblico ──────────────────────────
  registerCase(['biblia', 'versiculo', 'bible'], async ({ reply }) => {
    return reply('📖 ' + BIBLIA[Math.floor(Math.random() * BIBLIA.length)]);
  });

  // ── !tagme — mencionar o utilizador ──────────────────────
  registerCase(['tagme', 'tagme2'], async ({ sock, msg, ctx, reply }) => {
    await sock.sendMessage(ctx.remoteJid, {
      text: `🏷️ @${ctx.senderNumber}`,
      mentions: [ctx.senderJid],
    }, { quoted: msg });
  });

  // ── !dado — lançar dado ──────────────────────────────────
  registerCase(['dado', 'dice', 'd6'], async ({ text, reply }) => {
    const sides = parseInt(text) || 6;
    if (sides < 2 || sides > 1000) return reply('🎲 Uso: `!dado [lados]` (2-1000, padrão 6)');
    const result = Math.floor(Math.random() * sides) + 1;
    return reply(`🎲 *Dado de ${sides} lados:* ${result}`);
  });

  // ── !moeda — cara ou coroa ───────────────────────────────
  registerCase(['moeda', 'coin', 'flip'], async ({ reply }) => {
    const r = Math.random() < 0.5 ? '🪙 *Cara!*' : '🪙 *Coroa!*';
    return reply(r);
  });

  // ── !roleta — roleta russa ───────────────────────────────
  registerCase(['roleta', 'roulette'], async ({ sock, msg, ctx, reply }) => {
    const chamber = Math.floor(Math.random() * 6) + 1;
    const bullet = Math.floor(Math.random() * 6) + 1;
    if (chamber === bullet) {
      return reply(`💀 *BANG!* Câmara ${chamber}/6 — @${ctx.senderNumber} foi eliminado!\n\n_(brincadeira, calma 😄)_`, );
    }
    return reply(`🔫 *Click...* Câmara ${chamber}/6 — @${ctx.senderNumber} sobreviveu! 😅`);
  });

  // ── !encurtar — encurtar URL (simulado) ──────────────────
  registerCase(['encurtar', 'short', 'curto'], async ({ text, reply }) => {
    if (!text || !/^https?:\/\//i.test(text)) return reply('🔗 Uso: `!encurtar https://...`');
    // Simulação — sem API externa
    const hash = text.split('').reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0);
    const short = Math.abs(hash).toString(36).slice(0, 6);
    return reply(`🔗 *Link encurtado:*\n\`https://dbot.link/${short}\`\n\n_(simulação — para links reais usa bit.ly)_`);
  });

  // ── !fake-quote — citação falsa ──────────────────────────
  registerCase(['fakequote', 'fake-quote', 'fq'], async ({ sock, msg, ctx, args, reply }) => {
    const quote = args.join(' ').trim();
    if (!quote) return reply('💬 Uso: `!fakequote texto da citação`');
    return reply(
      `┌──────────────────────┐\n` +
      `│ "${quote}" │\n` +
      `│                        │\n` +
      `│    — ${ctx.pushName || 'Anónimo'}, ${new Date().getFullYear()} │\n` +
      `└──────────────────────┘`
    );
  });

  // ── !idade — calcular idade ──────────────────────────────
  registerCase(['idade', 'age', 'anos'], async ({ text, reply }) => {
    const year = parseInt(text);
    if (!year || year < 1900 || year > new Date().getFullYear()) {
      return reply('📅 Uso: `!idade 2000` (ano de nascimento)');
    }
    const age = new Date().getFullYear() - year;
    return reply(`📅 *Idade:* ${age} anos (nascido em ${year})`);
  });

  // ── !uptime — tempo online do bot ────────────────────────
  registerCase(['uptime', 'tempoonline'], async ({ reply }) => {
    const s = Math.floor(process.uptime());
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    return reply(`⏱️ *Uptime:* ${d}d ${h}h ${m}m`);
  });

  // ── !base — converter base numérica ──────────────────────
  registerCase(['base', 'baseconv'], async ({ text, reply }) => {
    const parts = text.split(/\s+/);
    if (parts.length < 2) return reply('🔢 Uso: `!base <número> <base_origem> [base_destino]`\nEx: `!base 255 10 16` → FF');
    try {
      const num = parseInt(parts[0], parseInt(parts[1]) || 10);
      const toBase = parseInt(parts[2]) || 2;
      return reply(`🔢 *${parts[0]}* (base ${parts[1] || 10}) → *${num.toString(toBase).toUpperCase()}* (base ${toBase})`);
    } catch { return reply('❌ Erro na conversão.'); }
  });

  // ── !bold2 — texto com negrito markdown ──────────────────
  registerCase(['bold2', 'b2'], async ({ text, reply }) => {
    if (!text) return reply('✍️ Uso: `!bold2 texto`');
    return reply(`*${text}*`);
  });

  // ── !mgs — mensagem secreta (spoiler) ────────────────────
  registerCase(['mgs', 'spoiler', 'secret'], async ({ text, reply }) => {
    if (!text) return reply('🕵️ Uso: `!mgs mensagem secreta`');
    // Unicode spoiler (combining characters)
    const hidden = text.split('').map(c => c + '\u200B\u200C\u200D').join('');
    return reply(`🕵️ *Mensagem oculta:* ||${text}||\n\n_(arrasta para ver)_`);
  });
};
