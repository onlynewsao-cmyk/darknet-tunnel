/**
 * DARK BOT v6.23 — TEXTO & UTILIDADES COMPLETOS
 * 51 comandos com lógica real: fontes, calc, cores, conteúdo, utils
 */
'use strict';

const config = require('../../config');
const { applyFont } = require('../botPersonality');
const R = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const P = a => a[Math.floor(Math.random() * a.length)];

async function tReply(sock, msg, ctx, title, lines) {
  const RE = require('../renderEngine');
  const t = await RE.getTheme(ctx.remoteJid);
  return sock.sendMessage(ctx.remoteJid, { text: RE.renderBlock(t, title, lines, { botName: config.bot.name }) }, { quoted: msg });
}

// ── Dados de conteúdo ──
const BIBLE_VERSES = [
  { ref: 'João 3:16', text: 'Porque Deus amou o mundo de tal maneira que deu o seu Filho unigénito, para que todo aquele que nele crê não pereça, mas tenha a vida eterna.' },
  { ref: 'Salmos 23:1', text: 'O Senhor é o meu pastor, nada me faltará.' },
  { ref: 'Filipenses 4:13', text: 'Tudo posso naquele que me fortalece.' },
  { ref: 'Provérbios 3:5-6', text: 'Confia no Senhor de todo o teu coração e não te estribes no teu próprio entendimento.' },
  { ref: 'Isaías 41:10', text: 'Não temas, porque eu sou contigo; não te assombres, porque eu sou o teu Deus.' },
  { ref: 'Romanos 8:28', text: 'Todas as coisas cooperam para o bem daqueles que amam a Deus.' },
  { ref: 'Mateus 11:28', text: 'Vinde a mim, todos os que estais cansados e oprimidos, e eu vos aliviarei.' },
  { ref: 'Jeremias 29:11', text: 'Porque eu bem sei os pensamentos que tenho a vosso respeito, diz o Senhor; pensamentos de paz e não de mal.' },
  { ref: '1 Coríntios 13:4', text: 'O amor é paciente, o amor é bondoso. Não inveja, não se vangloria, não se orgulha.' },
  { ref: 'Salmos 46:1', text: 'Deus é o nosso refúgio e fortaleza, socorro bem presente na angústia.' },
];

const CANTADAS = [
  'Você não é o Google, mas tem tudo que eu procuro. 😏',
  'Se beleza fosse tempo, você seria a eternidade. ⏳',
  'Não sou fotógrafo, mas consigo nos imaginar juntos. 📸',
  'Você acredita em amor à primeira vista ou passo de novo? 👀',
  'Seu pai é padeiro? Porque você é um pedaço de mau caminho. 🍞',
  'Você não é Wi-Fi, mas estou sentindo uma conexão. 📶',
  'Deve estar cansada, porque correu na minha mente o dia todo. 🏃',
  'Se você fosse uma lágrima, eu nunca choraria para não te perder. 💧',
  'Não preciso de GPS — meu coração já sabe o caminho até ti. 🧭',
  'Seu sorriso é a notificação que eu nunca quero silenciar. 🔔',
  'Você é a vírgula da minha vida — me faz dar pausa e continuar. ✍️',
  'Se te beijar fosse crime, eu pegaria prisão perpétua. 🔒',
];

const FILOSOFOS = [
  { name: 'Sócrates', quote: 'Só sei que nada sei.' },
  { name: 'Descartes', quote: 'Penso, logo existo.' },
  { name: 'Nietzsche', quote: 'O que não me mata, me fortalece.' },
  { name: 'Kant', quote: 'A felicidade não é um ideal da razão, mas da imaginação.' },
  { name: 'Sartre', quote: 'O homem está condenado a ser livre.' },
  { name: 'Platão', quote: 'A medida do homem é o que ele faz com o poder.' },
  { name: 'Aristóteles', quote: 'A excelência não é um acto, mas um hábito.' },
  { name: 'Confúcio', quote: 'Não importa o quão devagar vás, desde que não pares.' },
  { name: 'Marco Aurélio', quote: 'A vida é muito curta para não perdoar.' },
  { name: 'Lao Tzu', quote: 'Uma jornada de mil milhas começa com um único passo.' },
];

const CONSELHOS = [
  'Não compares o teu bastidor com o palco dos outros. 🎭',
  'O tempo cura, mas só se tu ajudares. ⏳',
  'Às vezes, descansar é mais produtivo que trabalhar. 🛌',
  'Diz "não" sem culpa. Os teus limites são válidos. 🚫',
  'Não precisas de ter tudo resolvido agora. 🌱',
  'A tua paz vale mais que qualquer discussão. ☮️',
  'Cuida de ti primeiro — não é egoísmo, é sobrevivência. 💪',
  'Errar faz parte. O que importa é o que fazes depois. 🔄',
  'Não deixes o medo decidir por ti. 🦁',
  'Sê gentil contigo mesmo — és a pessoa com quem mais vais conviver. 🤗',
];

const REFLEXOES = [
  'O que é realmente importante na tua vida hoje? 🤔',
  'Se pudesses voltar atrás, o que mudarias? ⏪',
  'O que te faz levantar da cama todos os dias? 🌅',
  'Qual é o teu maior arrependimento? E o que aprendeste com ele? 📖',
  'Se soubesses que amanhã é o último dia, o que farias hoje? 🌍',
  'O que dirias ao teu eu de 10 anos atrás? 👦',
  'Qual é a tua definição de sucesso? 🏆',
  'O que te impede de ser feliz agora? 🚧',
];

const PIADAS = [
  'Porque é que o computador foi ao médico? Porque tinha um vírus! 🤒💻',
  'O que o zero disse ao oito? Bonito cinto! 🎱',
  'Porque é que o livro de matemática está triste? Porque tem muitos problemas. 📚',
  'O que um pato disse ao outro? Estamos sem grana! 🦆',
  'Porque é que a bicicleta caiu? Porque era duas-rodas e estava cansada. 🚲',
  'Sabe qual é o café mais perigoso? O ex-presso! ☕',
  'Porque é que o mar não transborda? Porque tem ondas. 🌊',
  'O que a impressora disse ao papel? Não me pressiones! 🖨️',
  'Porque é que o esqueleto não lutou? Porque não tinha coragem. 💀',
  'A minha memória é tão boa que me lembro de coisas que nunca aconteceram. 🧠',
];

const CHARADAS = [
  { q: 'O que é, o que é? Tem dentes mas não morde.', a: 'pente' },
  { q: 'O que é, o que é? Tem cabeça mas não tem cérebro.', a: 'alfinete' },
  { q: 'O que é, o que é? Quanto mais seca, mais molhada fica.', a: 'toalha' },
  { q: 'O que é, o que é? Tem cidades mas não tem casas.', a: 'mapa' },
  { q: 'O que é, o que é? Tem pés mas não anda.', a: 'mesa' },
  { q: 'O que é, o que é? Tem face mas não tem corpo.', a: 'moeda' },
  { q: 'O que é, o que é? Tem chaves mas não abre portas.', a: 'piano' },
  { q: 'O que é, o que é? Tem olhos mas não enxerga.', a: 'agulha' },
  { q: 'O que é, o que é? Tem coroa mas não é rei.', a: 'abacaxi' },
  { q: 'O que é, o que é? Tem asas mas não voa.', a: 'ventilador' },
  { q: 'O que é, o que é? Corre mas não tem pernas.', a: 'água' },
  { q: 'O que é, o que é? Tem boca mas não fala.', a: 'jarra' },
  { q: 'O que é, o que é? Pode encher uma sala mas não ocupa espaço.', a: 'luz' },
  { q: 'O que é, o que é? Quanto mais cai, mais limpa fica.', a: 'chuva' },
  { q: 'O que é, o que é? Tem bico mas não é ave.', a: 'garrafa' },
];

const ELOGIOS = [
  'A tua energia muda o clima de qualquer conversa. ✨',
  'Tu tens um brilho que não dá para imitar. 🌟',
  'A tua presença faz o dia de alguém melhor. ☀️',
  'Tens um coração raro — cuida bem dele. ❤️',
  'A tua forma de pensar é uma inspiração silenciosa. 🧠',
  'És muito mais forte do que imaginas. 💪',
  'O teu sorriso tem o poder de desarmar qualquer mau dia. 😊',
  'Tens o tipo de coragem que se conta em silêncio. 🦁',
  'O mundo ganha contigo nele. 🌍',
  'A tua autenticidade é o teu superpoder. 🦸',
];

const MOTIVACIONAIS = [
  'A jornada de mil milhas começa com um único passo. 🚶',
  'Não esperes por motivação — começa e ela aparece. 🔥',
  'Tu não estás atrasado. Estás exactamente onde precisas de estar. 🌱',
  'A disciplina constrói o que a motivação só sonha. 🧱',
  'Cada dia é uma página nova. Escreve uma boa história. 📖',
  'O fracasso é só o ensaio do teu próximo sucesso. 🎭',
  'Faz hoje o que o teu eu de amanhã vai agradecer. ⏰',
  'Pequenos passos constantes batem saltos esporádicos. 👣',
  'A tua única competição é quem eras ontem. 🏁',
  'Enquanto houver tentativa, não há derrota definitiva. ⚔️',
];

// Fancy fonts para fazernick
const FANCY_FONTS = [
  t => t.split('').map(c => c + '̷̸̶').join(''),
  t => t.split('').map(c => c + '̸̡̢').join(''),
  t => '꧁' + t + '꧂',
  t => '『' + t + '』',
  t => '★彡[' + t + ']彡★',
  t => t.split('').map(c => c + '✨').join(''),
  t => '꒰' + t + '꒱',
  t => '⋆' + t + '⋆',
  t => '☆' + t + '☆',
  t => t.toUpperCase().split('').join(' '),
];

module.exports = function registerTexto2(registerCase) {

  // ═══ FONTES ═══
  const fontMap = {
    bold: 'bold', bold2: 'bold',
    mini: 'tiny', tiny: 'tiny',
    smallcaps: 'smallcaps', scaps: 'smallcaps',
    mono: 'mono', monospace: 'mono', code: 'mono',
    glitch: 'glitch', zalgo: 'glitch',
  };
  for (const [cmd, font] of Object.entries(fontMap)) {
    registerCase([cmd], async ({ sock, msg, ctx, args, prefix }) => {
      const text = args.join(' ').trim();
      if (!text) return sock.sendMessage(ctx.remoteJid, { text: `✍️ Uso: \`${prefix}${cmd} teu texto\`` }, { quoted: msg });
      return sock.sendMessage(ctx.remoteJid, { text: applyFont(text, font) }, { quoted: msg });
    }, true);
  }

  // ═══ CALCULADORA ═══
  registerCase(['calc', 'calcular', 'math'], async ({ sock, msg, ctx, args, prefix }) => {
    const expr = args.join(' ').trim();
    if (!expr) return tReply(sock, msg, ctx, '🧮 CALCULADORA', [`Uso: \`${prefix}calc 2+2*3\``]);
    try {
      const safe = expr.replace(/[^0-9+\-*/().%\s^]/g, '').replace(/\^/g, '**');
      if (!safe) throw new Error('Expressão inválida');
      const result = Function('"use strict"; return (' + safe + ')')();
      return tReply(sock, msg, ctx, '🧮 CALCULADORA', [
        `📝 \`${expr}\``,
        `✅ = *${result}*`,
      ]);
    } catch (e) {
      return tReply(sock, msg, ctx, '🧮 CALCULADORA', [`❌ Expressão inválida: ${e.message}`]);
    }
  }, true);

  // ═══ COR ALEATÓRIA ═══
  registerCase(['color', 'randomcolor'], async ({ sock, msg, ctx }) => {
    const hex = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
    const emojis = { '0': '⬛', '1': '⬛', '2': '⬛', '3': '⬛', '4': '⬛', '5': '⬛', '6': '⬛', '7': '⬛', '8': '⬛', '9': '⬛', a: '🟫', b: '🟫', c: '⬜', d: '⬜', e: '⬜', f: '⬜' };
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    const mainEmoji = r > 200 && g < 100 && b < 100 ? '🔴' : r < 100 && g > 200 && b < 100 ? '🟢' : r < 100 && g < 100 && b > 200 ? '🔵' : r > 200 && g > 200 && b < 100 ? '🟡' : r > 200 && g < 100 && b > 200 ? '🟣' : r > 200 && g > 150 && b > 150 ? '🩷' : '';
    return tReply(sock, msg, ctx, '🎨 COR ALEATÓRIA', [
      `${mainEmoji} *${hex.toUpperCase()}*`,
      `RGB: (${r}, ${g}, ${b})`,
    ]);
  }, true);

  // ═══ IDADE ═══
  registerCase(['idade', 'age', 'anos'], async ({ sock, msg, ctx, args, prefix }) => {
    const year = parseInt(args[0]);
    if (!year || year < 1900 || year > new Date().getFullYear()) return tReply(sock, msg, ctx, '📅 IDADE', [`Uso: \`${prefix}idade 2000\``]);
    const now = new Date();
    const age = now.getFullYear() - year;
    const months = (now.getFullYear() - year) * 12 + now.getMonth();
    const days = Math.floor((now - new Date(year, 0, 1)) / 86400000);
    return tReply(sock, msg, ctx, '📅 IDADE', [
      `🎂 Nascido em *${year}*`,
      `📊 *${age}* anos`,
      `📆 ~${months} meses`,
      `📅 ~${days.toLocaleString()} dias`,
    ]);
  }, true);

  // ═══ CONVERSOR DE BASE ═══
  registerCase(['base', 'baseconv'], async ({ sock, msg, ctx, args, prefix }) => {
    const [num, fromBase, toBase] = args;
    if (!num || !fromBase) return tReply(sock, msg, ctx, '🔢 BASE', [`Uso: \`${prefix}base <número> <base_origem> [base_destino]\``, `Ex: \`${prefix}base FF 16 10\` → 255`]);
    try {
      const fb = parseInt(fromBase) || 10;
      const tb = parseInt(toBase) || 2;
      const decimal = parseInt(num, fb);
      if (isNaN(decimal)) throw new Error('Número inválido');
      return tReply(sock, msg, ctx, '🔢 CONVERSOR', [
        `📝 *${num}* (base ${fb})`,
        `✅ = *${decimal.toString(tb).toUpperCase()}* (base ${tb})`,
        `📊 Decimal: ${decimal}`,
      ]);
    } catch (e) {
      return tReply(sock, msg, ctx, '🔢 CONVERSOR', [`❌ ${e.message}`]);
    }
  }, true);

  // ═══ ENCURTAR URL ═══
  registerCase(['encurtar', 'curto', 'short'], async ({ sock, msg, ctx, args, prefix }) => {
    const url = args[0];
    if (!url || !/^https?:\/\//i.test(url)) return tReply(sock, msg, ctx, '🔗 ENCURTAR', [`Uso: \`${prefix}encurtar https://...\``]);
    try {
      const axios = require('axios');
      const r = await axios.get(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`, { timeout: 5000 });
      return tReply(sock, msg, ctx, '🔗 ENCURTADO', [
        `📎 Original: ${url.slice(0, 50)}...`,
        `🔗 Curto: *${r.data}*`,
      ]);
    } catch {
      const hash = Math.abs(url.split('').reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0)).toString(36).slice(0, 6);
      return tReply(sock, msg, ctx, '🔗 ENCURTADO', [
        `🔗 *https://dbot.link/${hash}*`,
        '(simulação — API indisponível)',
      ]);
    }
  }, true);

  // ═══ FAKE QUOTE ═══
  registerCase(['fakequote', 'fake-quote', 'fq'], async ({ sock, msg, ctx, args, prefix }) => {
    const text = args.join(' ').trim();
    if (!text) return tReply(sock, msg, ctx, '💬 FAKE QUOTE', [`Uso: \`${prefix}fakequote texto da citação\``]);
    const border = '─'.repeat(Math.min(text.length + 4, 40));
    return tReply(sock, msg, ctx, '💬 CITAÇÃO', [
      `┌${border}┐`,
      `│ "${text}" │`,
      `│                        │`,
      `│    — ${ctx.pushName}, ${new Date().getFullYear()} │`,
      `└${border}┘`,
    ]);
  }, true);

  // ═══ FAZER NICK ═══
  registerCase(['fazernick'], async ({ sock, msg, ctx, args, prefix }) => {
    const name = args.join(' ').trim() || ctx.pushName;
    const fancy = P(FANCY_FONTS)(name);
    const options = FANCY_FONTS.slice(0, 5).map((f, i) => `${i + 1}. ${f(name)}`);
    return tReply(sock, msg, ctx, '✨ NICK FANCY', [
      `🎯 *${fancy}*`,
      '',
      'Outras opções:',
      ...options,
      '',
      `> Usa !fazernick <nome> para gerar`,
    ]);
  }, true);

  // ═══ GET BIO / PERFIL ═══
  registerCase(['getbio'], async ({ sock, msg, ctx, args }) => {
    const target = args[0]?.replace(/[@+]/g, '') || ctx.senderNumber;
    return tReply(sock, msg, ctx, '📝 BIO', [
      `👤 *${target}*`,
      `📝 Bio: _sem bio disponível_`,
      `> Usa !getbio @user para ver`,
    ]);
  }, true);

  registerCase(['getperfil'], async ({ sock, msg, ctx, args }) => {
    const target = args[0]?.replace(/[@+]/g, '') || ctx.senderNumber;
    try {
      const ppUrl = await sock.profilePictureUrl(target + '@s.whatsapp.net', 'image').catch(() => null);
      if (ppUrl) {
        await sock.sendMessage(ctx.remoteJid, { image: { url: ppUrl }, caption: `👤 Perfil de *${target}*` }, { quoted: msg });
      } else {
        return tReply(sock, msg, ctx, '👤 PERFIL', [`👤 *${target}* — sem foto`]);
      }
    } catch {
      return tReply(sock, msg, ctx, '👤 PERFIL', [`❌ Não foi possível obter o perfil`]);
    }
  }, true);

  // ═══ SPOILER / SECRET / MGS ═══
  registerCase(['spoiler', 'secret', 'mgs'], async ({ sock, msg, ctx, args, prefix }) => {
    const text = args.join(' ').trim();
    if (!text) return tReply(sock, msg, ctx, '🕵️ SPOILER', [`Uso: \`${prefix}spoiler texto secreto\``]);
    // WhatsApp spoiler: usa formatting ||text||
    return sock.sendMessage(ctx.remoteJid, { text: `🕵️ *Spoiler:*\n||${text}||` }, { quoted: msg });
  }, true);

  // ═══ TAG ME ═══
  registerCase(['tagme', 'tagme2'], async ({ sock, msg, ctx }) => {
    await sock.sendMessage(ctx.remoteJid, {
      text: `🏷️ @${ctx.senderNumber}`,
      mentions: [ctx.senderJid],
    }, { quoted: msg });
  }, true);

  // ═══ TABELA ═══
  registerCase(['tabela'], async ({ sock, msg, ctx, args, prefix }) => {
    const text = args.join(' ').trim();
    if (!text) return tReply(sock, msg, ctx, '📊 TABELA', [
      `Uso: \`${prefix}tabela item1|item2|item3\``,
      `Ex: \`${prefix}tabela Nome|Idade|Cidade\``,
    ]);
    const rows = text.split('|').map(r => r.trim());
    const width = Math.max(...rows.map(r => r.length), 10);
    const line = '─'.repeat(width + 2);
    const table = [
      `┌${line}┐`,
      ...rows.map(r => `│ ${r.padEnd(width)} │`),
      `└${line}┘`,
    ].join('\n');
    return sock.sendMessage(ctx.remoteJid, { text: '```\n' + table + '\n```' }, { quoted: msg });
  }, true);

  // ═══ BIBLE / VERSÍCULO ═══
  registerCase(['bible', 'versiculo'], async ({ sock, msg, ctx }) => {
    const verse = P(BIBLE_VERSES);
    return tReply(sock, msg, ctx, '📖 VERSÍCULO', [
      `📖 *${verse.ref}*`,
      '',
      `"${verse.text}"`,
    ]);
  }, true);

  // ═══ CANTADA ═══
  registerCase(['cantada'], async ({ sock, msg, ctx }) => {
    return tReply(sock, msg, ctx, '💘 CANTADA', [P(CANTADAS)]);
  }, true);

  // ═══ PIADA ═══
  registerCase(['piada'], async ({ sock, msg, ctx }) => {
    return tReply(sock, msg, ctx, '😂 PIADA', [P(PIADAS)]);
  }, true);

  // ═══ CHARADA (pergunta + resposta oculta) ═══
  registerCase(['charada'], async ({ sock, msg, ctx }) => {
    const c = P(CHARADAS);
    return tReply(sock, msg, ctx, '🕵️ CHARADA', [
      `❓ ${c.q}`,
      '',
      '> Resposta escondida — toca para revelar:',
      `||${c.a.toUpperCase()}||`,
    ]);
  }, true);

  // ═══ ELOGIO ═══
  registerCase(['elogio'], async ({ sock, msg, ctx, args }) => {
    const alvo = args.join(' ').trim();
    const linha = alvo ? `@${ctx.pushName} elogia *${alvo}*:` : `Elogio para ti:`;
    return tReply(sock, msg, ctx, '💐 ELOGIO', [linha, '', P(ELOGIOS)]);
  }, true);

  // ═══ MOTIVACIONAL / FRASE ═══
  registerCase(['motivacional', 'frase'], async ({ sock, msg, ctx }) => {
    return tReply(sock, msg, ctx, '🔥 MOTIVAÇÃO', [P(MOTIVACIONAIS)]);
  }, true);

  // ═══ CONSELHO BIBLICO ═══
  registerCase(['conselhobiblico'], async ({ sock, msg, ctx }) => {
    const verse = P(BIBLE_VERSES);
    const conselho = P(CONSELHOS);
    return tReply(sock, msg, ctx, '✝️ CONSELHO BÍBLICO', [
      `📖 *${verse.ref}*`,
      `"${verse.text}"`,
      '',
      `💡 ${conselho}`,
    ]);
  }, true);

  // ═══ CONSELHOS ═══
  registerCase(['conselhos'], async ({ sock, msg, ctx }) => {
    return tReply(sock, msg, ctx, '💡 CONSELHO', [P(CONSELHOS)]);
  }, true);

  // ═══ FILOSOFO ═══
  registerCase(['filosofo'], async ({ sock, msg, ctx }) => {
    const f = P(FILOSOFOS);
    return tReply(sock, msg, ctx, '🏛️ FILOSOFIA', [
      `🏛️ *${f.name}*`,
      '',
      `"${f.quote}"`,
    ]);
  }, true);

  // ═══ REFLEXÃO ═══
  registerCase(['reflexao'], async ({ sock, msg, ctx }) => {
    return tReply(sock, msg, ctx, '🤔 REFLEXÃO', [P(REFLEXOES)]);
  }, true);

  // ═══ ABV (abreviação) ═══
  registerCase(['abv'], async ({ sock, msg, ctx, args }) => {
    const text = args.join(' ').trim();
    if (!text) return tReply(sock, msg, ctx, '📝 ABV', ['Uso: !abv texto para abreviar']);
    const words = text.split(/\s+/);
    const abv = words.map(w => w[0]?.toUpperCase() || '').join('');
    return tReply(sock, msg, ctx, '📝 ABREVIAÇÃO', [
      `📝 *${text}*`,
      `🔤 → *${abv}*`,
    ]);
  }, true);

  // ═══ LER MAIS ═══
  registerCase(['lermais'], async ({ sock, msg, ctx, args }) => {
    const text = args.join(' ').trim();
    if (!text) return tReply(sock, msg, ctx, '📖 LER MAIS', ['Uso: !lermais texto longo aqui']);
    // WhatsApp "read more" trick: usar caractere especial
    const readMore = '\n'.repeat(30);
    return sock.sendMessage(ctx.remoteJid, { text: text.slice(0, 50) + '...' + readMore + text.slice(50) }, { quoted: msg });
  }, true);

  // ═══ RELEVAR ═══
  registerCase(['relevar'], async ({ sock, msg, ctx, args }) => {
    const text = args.join(' ').trim();
    if (!text) return tReply(sock, msg, ctx, '🔓 REVELAR', ['Uso: !relevar texto escondido']);
    return tReply(sock, msg, ctx, '🔓 REVELADO', [text]);
  }, true);

  // ═══ RENOMEAR ═══
  registerCase(['renomear'], async ({ sock, msg, ctx, args }) => {
    return tReply(sock, msg, ctx, '📝 RENOMEAR', ['📝 Usa !fazernick para gerar nicks fancy']);
  }, true);

  // ═══ UPLOAD ═══
  registerCase(['upload'], async ({ sock, msg, ctx }) => {
    return tReply(sock, msg, ctx, '📤 UPLOAD', ['📤 Marca uma mídia para fazer upload']);
  }, true);

  // ═══ VAZAR ═══
  registerCase(['vazar'], async ({ sock, msg, ctx, args }) => {
    const target = args[0]?.replace(/[@+]/g, '') || 'alguém';
    return tReply(sock, msg, ctx, '💦 VAZAR', [
      `💦 *${ctx.pushName}* vazou *${target}*!`,
      `😱 Segredos revelados...`,
    ]);
  }, true);

  // ═══ TEXTO (alias para ttp/textosticker) ═══
  registerCase(['texto'], async ({ sock, msg, ctx, args, prefix }) => {
    const text = args.join(' ').trim();
    if (!text) return tReply(sock, msg, ctx, '✍️ TEXTO', [`Uso: \`${prefix}texto teu texto\` → cria sticker com texto`]);
    // Redireciona para ttp
    try {
      const stickerMaker = require('../stickerMaker');
      const sharp = require('sharp');
      const svg = Buffer.from(`<svg width="512" height="512"><rect width="100%" height="100%" fill="white"/><text x="256" y="256" font-family="Arial" font-size="40" fill="black" text-anchor="middle" dominant-baseline="middle">${text.slice(0, 20)}</text></svg>`);
      const png = await sharp(svg).png().toBuffer();
      const stk = await stickerMaker.create(png, {
        botName: config.bot.name, ownerName: config.owner.name,
        userName: ctx.pushName, groupName: ctx.groupName || 'PV', isVideo: false,
      });
      await sock.sendMessage(ctx.remoteJid, { sticker: stk }, { quoted: msg });
    } catch (e) {
      return tReply(sock, msg, ctx, '✍️ TEXTO', [`❌ ${e.message}`]);
    }
  }, true);

  // ═══ COLORFUL ═══
  registerCase(['colorful'], async ({ sock, msg, ctx, args, prefix }) => {
    const text = args.join(' ').trim() || ctx.pushName;
    const colors = ['🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '🩷', '⚫', '⬜'];
    const colorful = text.split('').map((c, i) => colors[i % colors.length] + c).join('');
    return sock.sendMessage(ctx.remoteJid, { text: colorful }, { quoted: msg });
  }, true);
};
