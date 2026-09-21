'use strict';
/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║   DARK BOT — RPG STORY MODE v11.0                               ║
 * ║   Carrossel de Mundos | Teste de Iniciante | Evolução            ║
 * ║   Status por Jogador | Imagens Reais | 8 Mundos de Anime         ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

const fs = require('fs');
const path = require('path');
const rpg = require('./engine');
const combat = require('./combat');
const config = require('../../config');

const R = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const P = (a) => a[Math.floor(Math.random() * a.length)];

const IMAGES_DIR = path.join(__dirname, 'images');

// ══════════════════════════════════════════════════════════════
// CATÁLOGO DE MUNDOS — COM TESTES DE INICIANTE
// ══════════════════════════════════════════════════════════════
const WORLDS = {
  naruto: {
    id: 'naruto', emoji: '\u{1f363}', name: 'Naruto',
    desc: 'O mundo dos shinobis. Chakra, Jutsus e o Caminho Ninja.',
    cor: '#FF6B00', nivelMin: 1, capitulos: 0,
    recompensaFinal: { item: 'Rasengan Absoluto', title: 'Hokage', xp: 5000, coins: 10000 },
    image: 'naruto.jpg',
    teste: {
      titulo: '\u{1f363} Teste do Shinobi',
      descricao: 'Prova que conheces o mundo ninja de Konoha!',
      perguntas: [
        { q: 'Quem é o sensei da Equipe 7?', opcoes: ['Kakashi Hatake', 'Iruka Umino', 'Jiraiya', 'Asuma Sarutobi'], correta: 0 },
        { q: 'Qual é o jutsu de assinatura de Naruto?', opcoes: ['Chidori', 'Rasengan', 'Sharingan', 'Byakugan'], correta: 1 },
        { q: 'Quantas caudas tem a Kyuubi?', opcoes: ['7', '8', '9', '10'], correta: 2 },
        { q: 'Quem é o líder da Akatsuki?', opcoes: ['Orochimaru', 'Pain', 'Madara', 'Obito'], correta: 1 },
      ],
    },
    evolucoes: [
      { nivel: 0, titulo: 'Academia Ninja', emoji: '\u{1f393}' },
      { nivel: 3, titulo: 'Genin', emoji: '\u{1f343}' },
      { nivel: 5, titulo: 'Chuunin', emoji: '\u2694\uFE0F' },
      { nivel: 7, titulo: 'Jounin', emoji: '\u{1f525}' },
      { nivel: 10, titulo: 'Hokage', emoji: '\u{1f363}' },
    ],
  },
  onepiece: {
    id: 'onepiece', emoji: '\u{1f3f4}\u200D\u2620\uFE0F', name: 'One Piece',
    desc: 'Grand Line espera. Haki, Akuma no Mi e o Rei dos Piratas.',
    cor: '#E60012', nivelMin: 5, capitulos: 0,
    recompensaFinal: { item: 'Gomu Gomu no Mi Awakened', title: 'Rei dos Piratas', xp: 8000, coins: 15000 },
    image: 'onepiece.jpg',
    teste: {
      titulo: '\u{1f3f4}\u200D\u2620\uFE0F Teste do Pirata',
      descricao: 'Prova que estás pronto para a Grand Line!',
      perguntas: [
        { q: 'Navio dos Chapéu de Palha?', opcoes: ['Thousand Sunny', 'Going Merry', 'Oro Jackson', 'Red Force'], correta: 1 },
        { q: 'O cozinheiro dos Chapéu de Palha?', opcoes: ['Zoro', 'Sanji', 'Usopp', 'Brook'], correta: 1 },
        { q: 'O que é o Haki?', opcoes: ['Fruta do diabo', 'Poder espiritual', 'Técnica de espada', 'Tipo de navio'], correta: 1 },
        { q: 'Quem é o Rei dos Piratas?', opcoes: ['Luffy', 'Shanks', 'Gol D. Roger', 'Barba Branca'], correta: 2 },
      ],
    },
    evolucoes: [
      { nivel: 0, titulo: 'Pirata Iniciante', emoji: '\u26F5' },
      { nivel: 3, titulo: 'Pirata East Blue', emoji: '\u{1f30a}' },
      { nivel: 6, titulo: 'Supernova', emoji: '\u2B50' },
      { nivel: 10, titulo: 'Yonkou', emoji: '\u{1f451}' },
      { nivel: 18, titulo: 'Rei dos Piratas', emoji: '\u{1f3f4}\u200D\u2620\uFE0F' },
    ],
  },
  sololeveling: {
    id: 'sololeveling', emoji: '\u2694\uFE0F', name: 'Solo Leveling',
    desc: 'O Sistema escolheu-te. Portões, Monstros e Monarca das Sombras.',
    cor: '#7B2FBE', nivelMin: 10, capitulos: 0,
    recompensaFinal: { item: 'Arma do Monarca', title: 'Monarca das Sombras', xp: 10000, coins: 20000 },
    image: 'sololeveling.jpg',
    teste: {
      titulo: '\u2694\uFE0F Teste do Caçador',
      descricao: 'O Sistema vai testar os teus reflexos!',
      perguntas: [
        { q: 'Rank inicial de Jin-Woo?', opcoes: ['D', 'C', 'E', 'B'], correta: 2 },
        { q: 'O que é o "Arise"?', opcoes: ['Uma espada', 'Invocar sombras', 'Um portal', 'Cura'], correta: 1 },
        { q: 'Quem é o Rei dos Dragões?', opcoes: ['Igris', 'Baran', 'Antares', 'Thomas Andre'], correta: 2 },
        { q: 'O que o Sistema obriga Jin-Woo a fazer?', opcoes: ['Meditar', 'Treinar', 'Dormir', 'Comer'], correta: 1 },
      ],
    },
    evolucoes: [
      { nivel: 0, titulo: 'Rank E', emoji: '\u{1f480}' },
      { nivel: 3, titulo: 'Rank C', emoji: '\u2694\uFE0F' },
      { nivel: 5, titulo: 'Rank A', emoji: '\u{1f525}' },
      { nivel: 7, titulo: 'Rank S', emoji: '\u26A1' },
      { nivel: 9, titulo: 'Monarca das Sombras', emoji: '\u{1f464}' },
    ],
  },
  jjk: {
    id: 'jjk', emoji: '\u{1f441}\uFE0F', name: 'Jujutsu Kaisen',
    desc: 'Maldições, Domínios e o Infinito. O mundo das trevas.',
    cor: '#2D1B69', nivelMin: 15, capitulos: 0,
    recompensaFinal: { item: 'Olho de Sukuna', title: 'Feiticeiro Especial', xp: 12000, coins: 25000 },
    image: 'jjk.jpg',
    teste: {
      titulo: '\u{1f441}\uFE0F Teste do Feiticeiro',
      descricao: 'Prova que podes enfrentar maldições!',
      perguntas: [
        { q: 'Professor de Yuji?', opcoes: ['Nanami', 'Gojo', 'Todo', 'Megumi'], correta: 1 },
        { q: 'O que é um Domínio?', opcoes: ['Técnica de cura', 'Espaço de combate supremo', 'Uma arma', 'Tipo de maldição'], correta: 1 },
        { q: 'Técnica de Gojo?', opcoes: ['Infinity', 'Cleave', 'Idle Transfiguration', 'Dismantle'], correta: 0 },
        { q: 'Rei das Maldições?', opcoes: ['Mahito', 'Sukuna', 'Kenjaku', 'Jogo'], correta: 1 },
      ],
    },
    evolucoes: [
      { nivel: 0, titulo: 'Grau 4', emoji: '\u{1f4d6}' },
      { nivel: 3, titulo: 'Grau 2', emoji: '\u2694\uFE0F' },
      { nivel: 6, titulo: 'Grau 1', emoji: '\u{1f525}' },
      { nivel: 8, titulo: 'Especial', emoji: '\u{1f441}\uFE0F' },
      { nivel: 10, titulo: 'Nível Gojo', emoji: '\u267E\uFE0F' },
    ],
  },
  dragonball: {
    id: 'dragonball', emoji: '\u{1f409}', name: 'Dragon Ball',
    desc: 'Ki, Transformações e o Universo em jogo. Além dos limites.',
    cor: '#FF9500', nivelMin: 20, capitulos: 0,
    recompensaFinal: { item: 'Esfera do Dragão Dourada', title: 'Guerreiro Lendário', xp: 15000, coins: 30000 },
    image: 'dragonball.jpg',
    teste: {
      titulo: '\u{1f409} Teste do Guerreiro Z',
      descricao: 'Prova que tens Ki suficiente!',
      perguntas: [
        { q: 'Planeta natal de Goku?', opcoes: ['Namek', 'Terra', 'Vegeta', 'Kaioshin'], correta: 2 },
        { q: 'Quem derrotou Cell?', opcoes: ['Goku', 'Vegeta', 'Gohan', 'Trunks'], correta: 2 },
        { q: 'O que é o Ultra Instinto?', opcoes: ['Transformação Saiyajin', 'Corpo move-se sozinho', 'Técnica de cura', 'Um Kaioken'], correta: 1 },
        { q: 'Quantas esferas do dragão existem?', opcoes: ['5', '6', '7', '10'], correta: 2 },
      ],
    },
    evolucoes: [
      { nivel: 0, titulo: 'Humano', emoji: '\u{1f9d1}' },
      { nivel: 3, titulo: 'Saiyajin', emoji: '\u26A1' },
      { nivel: 5, titulo: 'Super Saiyajin', emoji: '\u{1f49b}' },
      { nivel: 7, titulo: 'SSJ Blue', emoji: '\u{1f499}' },
      { nivel: 10, titulo: 'Ultra Instinto', emoji: '\u26AA' },
    ],
  },
  demonslayer: {
    id: 'demonslayer', emoji: '\u{1f5e1}\uFE0F', name: 'Demon Slayer',
    desc: 'Respirações, Demônios e o Juramento do Hashira.',
    cor: '#1a1a2e', nivelMin: 8, capitulos: 0,
    recompensaFinal: { item: 'Espada Nichirin Dourada', title: 'Hashira Supremo', xp: 9000, coins: 18000 },
    image: 'demonslayer.jpg',
    teste: {
      titulo: '\u{1f5e1}\uFE0F Teste do Caçador',
      descricao: 'Prova que podes empunhar uma Nichirin!',
      perguntas: [
        { q: 'Respiração de Tanjiro?', opcoes: ['Fogo', 'Água', 'Trovão', 'Vento'], correta: 1 },
        { q: 'Progenitor dos demónios?', opcoes: ['Kokushibo', 'Muzan', 'Akaza', 'Daki'], correta: 1 },
        { q: 'O que é um Hashira?', opcoes: ['Um demónio', 'Pilar — guerreiro supremo', 'Uma espada', 'Uma técnica'], correta: 1 },
        { q: 'Fraqueza dos demónios?', opcoes: ['Água', 'Fogo', 'Luz solar', 'Espadas'], correta: 2 },
      ],
    },
    evolucoes: [
      { nivel: 0, titulo: 'Iniciante', emoji: '\u{1f331}' },
      { nivel: 3, titulo: 'Caçador', emoji: '\u2694\uFE0F' },
      { nivel: 5, titulo: 'Hashira', emoji: '\u{1f525}' },
      { nivel: 7, titulo: 'Hashira Supremo', emoji: '\u{1f5e1}\uFE0F' },
      { nivel: 9, titulo: 'Lenda', emoji: '\u2728' },
    ],
  },
  dmc: {
    id: 'dmc', emoji: '\u{1f608}', name: 'Devil May Cry',
    desc: 'Dante, demônios e estilo. O sangue de Sparda corre em ti.',
    cor: '#8B0000', nivelMin: 12, capitulos: 0,
    recompensaFinal: { item: 'Rebellion Awakened', title: 'Filho de Sparda', xp: 11000, coins: 22000 },
    image: 'dmc.jpg',
    teste: {
      titulo: '\u{1f608} Teste do Caçador de Demónios',
      descricao: 'Prova que tens estilo SSS!',
      perguntas: [
        { q: 'Irmão gémeo de Dante?', opcoes: ['Nero', 'Vergil', 'Sparda', 'Mundus'], correta: 1 },
        { q: 'Espada de Dante?', opcoes: ['Yamato', 'Rebellion', 'Force Edge', 'Alastor'], correta: 1 },
        { q: 'O que é o Devil Trigger?', opcoes: ['Uma arma', 'Transformação demoníaca', 'Técnica de cura', 'Um combo'], correta: 1 },
        { q: 'Estilo mais icónico de Dante?', opcoes: ['Trickster', 'Swordmaster', 'Royalguard', 'Gunslinger'], correta: 1 },
      ],
    },
    evolucoes: [
      { nivel: 0, titulo: 'Humano', emoji: '\u{1f9d1}' },
      { nivel: 3, titulo: 'Meio-Demónio', emoji: '\u{1f608}' },
      { nivel: 5, titulo: 'Devil Hunter', emoji: '\u2694\uFE0F' },
      { nivel: 7, titulo: 'Filho de Sparda', emoji: '\u{1f525}' },
      { nivel: 9, titulo: 'Estilo SSS', emoji: '\u{1f48e}' },
    ],
  },
  bleach: {
    id: 'bleach', emoji: '\u{1f47b}', name: 'Bleach',
    desc: 'Zanpakuto, Soul Society e o poder dos Quincy.',
    cor: '#FF4500', nivelMin: 18, capitulos: 0,
    recompensaFinal: { item: 'Zangetsu Final', title: 'Shinigami Capitão', xp: 13000, coins: 27000 },
    image: 'bleach.jpg',
    teste: {
      titulo: '\u{1f47b} Teste do Shinigami',
      descricao: 'Prova que podes proteger Soul Society!',
      perguntas: [
        { q: 'Zanpakuto de Ichigo?', opcoes: ['Senbonzakura', 'Zangetsu', 'Kyoka Suigetsu', 'Hyourinmaru'], correta: 1 },
        { q: 'O que é o Bankai?', opcoes: ['Forma selada', 'Libertação final da Zanpakuto', 'Técnica de cura', 'Tipo de Hollow'], correta: 1 },
        { q: 'Líder dos Quincy?', opcoes: ['Uryu', 'Yhwach', 'Aizen', 'Grimmjow'], correta: 1 },
        { q: 'Companhias na Soul Society?', opcoes: ['10', '11', '13', '15'], correta: 2 },
      ],
    },
    evolucoes: [
      { nivel: 0, titulo: 'Alma', emoji: '\u{1f47b}' },
      { nivel: 3, titulo: 'Shinigami', emoji: '\u2694\uFE0F' },
      { nivel: 5, titulo: 'Vice-Capitão', emoji: '\u{1f525}' },
      { nivel: 7, titulo: 'Capitão', emoji: '\u2B50' },
      { nivel: 9, titulo: 'Rei Shinigamis', emoji: '\u{1f47b}' },
    ],
  },
};
const NARUTO_CHAPTERS = [
  // ═══ ARCO 1: ACADEMIA NINJA (Cap 1-3) ═══════════════════════
  {
    id: 'nar_ch01', titulo: 'Episódio 1: O Pior Aluno',
    descricao: 'Konoha, a Vila Oculta da Folha. Tu és Naruto Uzumaki — o pior aluno da academia ninja. Mas tens um segredo...',
    nivel: 1, xp: 50, coins: 100,
    nodes: [
      { id: 'n1_01', texto: '🎓 *A Academia Ninja de Konoha*\n\nO professor Iruka olha para ti com frustração.\n"Naruto! Tu falhaste o exame pela terceira vez!"\n\nOs outros alunos riem. Sasuke Uchiha nem olha para ti.\n\nMas tu sabes o que ninguém sabe — dentro de ti vive a Raposa de Nove Caudas, a Kyuubi.', falante: 'Iruka' },
      { id: 'n1_02', texto: '🎓 *Escolha o teu destino:*', escolhas: [
        { txt: '🔥 "Eu vou ser Hokage! Acreditem nisso!"', next: 'n1_03a', xp: 20 },
        { txt: '😤 Roubar o Pergaminho Proibido', next: 'n1_03b', xp: 15 },
        { txt: '😠 Desafiar Sasuke para um duelo', next: 'n1_03c', xp: 10 },
      ]},
      { id: 'n1_03a', texto: '🔥 *O Sonho do Hokage*\n\nIruka sorri. "Talvez... talvez tenhas potencial."\n\nRecebes a missão de treinar com um parceiro. O teu caminho começa agora!', xp: 30, item: 'bandana ninja' },
      { id: 'n1_03b', texto: '📖 *O Pergaminho Proibido*\n\nÀ noite, infiltras-te na torre e roubas o pergaminho. Dentro, encontras o Jutsu Multi-Clone das Sombras!\n\n"Mais de mil clones?!" — é impossível para um genin... mas tu não és genin normal.', xp: 40, skill: 'Kage Bunshin no Jutsu', next: 'n1_04' },
      { id: 'n1_03c', texto: '⚡ *Duelo com Sasuke*\n\nSasuke aceita com um sorriso frio. "Interessante."\n\nO combate é rápido — mas surpreendes toda a gente!\n\n(Nota: Sasuke será o teu rival para sempre)', xp: 25, next: 'n1_04' },
      { id: 'n1_04', texto: '🎓 *O Exame de Graduação*\n\nIruka aparece com a bandana ninja.\n"Naruto... passaste."\n\nRecebes a bandana. Agora és Genin de Konoha.\n\n> 🎓 *Primeiro passo do ninja completo!*', xp: 30, item: 'bandana de genin' },
    ],
    boss: null,
    recompensas: { xp: 150, coins: 200, item: 'bandana de genin' },
  },
  {
    id: 'nar_ch02', titulo: 'Episódio 2: Equipe 7',
    descricao: 'Agora fazes parte de uma equipe. O teu sensei é Kakashi Hatake — o ninja copiador.',
    nivel: 2, xp: 80, coins: 150,
    nodes: [
      { id: 'n2_01', texto: '👥 *Equipe 7*\n\nOs membros:\n🍥 Naruto (tu)\n👁️ Sasuke Uchiha — o prodígio\n💗 Sakura Haruno — a inteligente\n🎭 Kakashi Hatake — o sensei\n\nKakashi chega 3 horas atrasado. "Desculpem, perdi-me no caminho da vida..."\n\n"Primeiro teste: sobrevivam contra mim."', falante: 'Kakashi' },
      { id: 'n2_02', texto: '⚡ *O Exame dos Sinos*\n\nKakashi tem dois sinos. Vocês são 3. Precisam de roubar pelo menos um.\n\nSasuke ataca primeiro — é bloqueado facilmente.\nSakura cai numa ilusão.\n\nAgora és tu!', escolhas: [
        { txt: '🍥 Usar Kage Bunshin!', next: 'n2_03a', xp: 30 },
        { txt: '🦊 Sentir o chakra da Kyuubi', next: 'n2_03b', xp: 25 },
        { txt: '🤝 Pedir ajuda ao Sasuke', next: 'n2_03c', xp: 20 },
      ]},
      { id: 'n2_03a', texto: '🍥 *Mil Clones!*\n\n"Multi-Clone das Sombras!"\n\nCem N Narutos cercam Kakashi. Ele sorri. "Impressionante..."\n\nMas é rápido demais. Derruba-te com um golpe.\n\nAinda assim — passaste no teste. O verdadeiro teste era trabalhar em equipa.', xp: 40, skill: 'Kage Bunshin no Jutsu' },
      { id: 'n2_03b', texto: '🦊 *O Chakra da Kyuubi*\n\nSentes algo a ferver dentro de ti. O chakra vermelho emerge!\n\nKakashi recua. "Esse poder..."\n\nMas controlas-te a tempo. O sensei está impressionado.', xp: 35 },
      { id: 'n2_03c', texto: '🤝 *Trabalho em Equipa*\n\n"Não precisamos de lutar entre nós!"\n\nSasuke olha para ti. Sakura sorri.\n\nKakashi: "Exato. A lição era essa. Trabalho em equipa."\n\n*Vocês passam!*', xp: 45, title: 'Ninja de Equipa' },
      { id: 'n2_04', texto: '👥 *Missões D-Rank*\n\nAgora fazem missões básicas: apanhar gatos, limpar rios, escoltar velhinhas.\n\nMas algo está a mudar em Konoha... há rumores de uma missão de rank mais alto.\n\n> *Próximo: Missão no País das Ondas!*', xp: 50, coins: 200 },
    ],
    recompensas: { xp: 200, coins: 300, item: 'sino de Kakashi' },
  },
  {
    id: 'nar_ch03', titulo: 'Episódio 3: O País das Ondas',
    descricao: 'A primeira missão real. O construtor da ponte está em perigo — um mercenário chamado Zabuza Momochi persegue-o.',
    nivel: 3, xp: 120, coins: 300,
    nodes: [
      { id: 'n3_01', texto: '🌊 *Caminho para o País das Ondas*\n\nVocês escoltam Tazuna, o construtor da ponte. No caminho, encontram dois Irmãos Demônio.\n\n"Naruto, Sasuke — mostrem o que aprenderam!"\n\nO combate é rápido. Vocês vencem.', falante: 'Kakashi' },
      { id: 'n3_02', texto: '⚔️ *A Névoa Espessa*\n\nDe repente, uma lâmina gigante voa entre vocês!\n\n"Quem é?!"\n\nDa névoa, surge um homem com um bandagem na boca e olhos mortos.\n\n*Zabuza Momochi — o Demônio da Névoa Oculta.*', boss: {
        nome: 'Zabuza Momochi', emoji: '⚔️', hp: 500, atk: 45, def: 20, xp: 300, coins: 500,
        habilidades: ['Lâmina Guilhotina', 'Névoa Assassina', 'Clone de Água'],
        descricao: 'Um dos Sete Espadachins da Névoa. Mestre do silent killing.',
      }},
      { id: 'n3_03', texto: '⚔️ *Zabuza ataca!*\n\nO combate é brutal. Kakashi é selado numa prisão de água!\n\n"Sasuke! Naruto! Protejam Tazuna!"\n\nMas Zabuza é forte demais...', escolhas: [
        { txt: '🍥 Criar 100 clones e cercar Zabuza!', next: 'n3_04a', xp: 40 },
        { txt: '🦊 Libertar o chakra da Kyuubi!', next: 'n3_04b', xp: 35 },
        { txt: '⚡ Trabalhar com Sasuke (combo)', next: 'n3_04c', xp: 50 },
      ]},
      { id: 'n3_04a', texto: '🍥 *Exército de Clones!*\n\n"Cem clones das sombras!"\n\nZabuza corta dezenas deles, mas um acerta! O suficiente para Kakashi escapar.\n\n"Ainda não acabou..."', xp: 60, coins: 300 },
      { id: 'n3_04b', texto: '🦊 *A Raposa Rugiu!*\n\nChakra vermelho envolve-te. Zabuza recua.\n\n"Esse chakra... é a Kyuubi?!"\n\nMas perdes o controlo por um segundo. Kakashi intervém a tempo.', xp: 55 },
      { id: 'n3_04c', texto: '⚡ *Combo Perfeito!*\n\nSasuke lança shurikens. Tu usas clones como distração. No momento certo — SASUKE ATACA!\n\nZabuza é atingido! Kakashi aproveita e usa o Raikiri!\n\n"Obrigado, miúdos."', xp: 80, title: 'Tática de Equipa' },
      { id: 'n3_05', texto: '🌊 *A Ponte do País das Ondas*\n\nVocês derrotam Zabuza. A ponte é construída.\n\nO País das Ondas é livre.\n\nInari chora de alegria. "Obrigado, Naruto..."\n\n> 🌊 *Arco do País das Ondas completo!*\n> ⭐ *Confiar em si mesmo é o primeiro passo para ser Hokage.*', xp: 100, coins: 500, item: 'bandagem de Zabuza' },
    ],
    recompensas: { xp: 400, coins: 800, item: 'Lâmina de Zabuza', skill: 'Névoa Assassina' },
  },
  // ═══ ARCO 2: EXAMES CHUUNIN (Cap 4-8) ═════════════════════
  {
    id: 'nar_ch04', titulo: 'Episódio 4: Os Exames Chuunin',
    descricao: 'Chegou a hora de subir de rank. Os exames Chuunin reúnem os melhores genins de todas as aldeias!',
    nivel: 5, xp: 200, coins: 500,
    nodes: [
      { id: 'n4_01', texto: '📝 *1ª Fase: Exame Escrito*\n\nMorre-se de medo. O proctor Ibiki faz perguntas impossíveis.\n\nA verdadeira prova é NÃO desistir.\n\nNaruto está a falhar... mas olha para os outros e percebe: todos estão com medo.\n\n"Eu NUNCA vou desistir!"', escolhas: [
        { txt: '🔥 Responder com confiança (arriscado)', next: 'n4_02a', xp: 30 },
        { txt: '🧠 Copiar de Sasuke (inteligente)', next: 'n4_02b', xp: 25 },
      ]},
      { id: 'n4_02a', texto: '🔥 *A 10ª Pergunta*\n\n"Se errares, nunca mais podes ser ninja!"\n\nMas a verdadeira pergunta era: "Aceitas o risco?"\n\n"SIM! EU ACEITO!"\n\n*Passaste!* O coragem vale mais que conhecimento.', xp: 50 },
      { id: 'n4_02b', texto: '🧠 *Estratégia Inteligente*\n\nSasuke usa o Sharingan para ler os lábios. Tu copias.\n\nNão é bonito, mas funciona. Vocês avançam.', xp: 40 },
      { id: 'n4_03', texto: '🌲 *2ª Fase: Floresta da Morte*\n\nEquipas de 3 contra todos. Precisam de um pergaminho do Céu e da Terra.\n\nVocês encontram Orochimaru disfarçado!\n\n🐍 *O Sannin Lendário aparece!*', boss: {
        nome: 'Orochimaru', emoji: '🐍', hp: 1200, atk: 80, def: 40, xp: 500, coins: 1000,
        habilidades: ['Marca Amaldiçoada', 'Kusanagi', 'Substituição de Pele'],
        descricao: 'Um dos Três Sannins Lendários. Procura o Sharingan de Sasuke.',
      }},
      { id: 'n4_04', texto: '🐍 *O Selo Amaldiçoado*\n\nOrochimaru morde Sasuke! Um selo negro aparece no pescoço dele.\n\n"Esse menino... pertence-me."\n\nSasuke cai inconsciente. Tu e Sakura protegem-no.\n\n> *Sasuke recebeu a Marca Amaldiçoada...*', xp: 60, coins: 300 },
      { id: 'n4_05', texto: '🏆 *3ª Fase: Torneio Preliminar*\n\nVocês sobreviveram! Agora — combates 1v1!\n\nOs sorteios:\n🍥 Naruto vs Kiba\n👁️ Sasuke vs Yoroi\n💗 Sakura vs Ino\n\n> *Escolhe o teu combate!*', escolhas: [
        { txt: '⚔️ Lutar contra Kiba!', next: 'n4_06a', xp: 40 },
        { txt: '👀 Assistir Sasuke vs Yoroi', next: 'n4_06b', xp: 20 },
      ]},
      { id: 'n4_06a', texto: '⚔️ *Naruto vs Kiba!*\n\nKiba + Akamaru. Dois contra um.\n\n"Vou derrotar-te fácil, Naruto!"\n\nMas Naruto tem uma surpresa...\n\n*Usas o Kage Bunshin + transformação!*\n\nKiba confunde o clone com Akamaru e ataca o próprio parceiro!', xp: 80, coins: 400, title: 'Vencedor Preliminar' },
      { id: 'n4_06b', texto: '👀 *Sasuke vs Yoroi*\n\nSasuke usa o Sharingan. O combate é rápido.\n\nMas a Marca Amaldiçoada quase se activa... Kakashi sela-a depois.\n\nSasuke vence, mas está preocupado.', xp: 30 },
      { id: 'n4_07', texto: '🏆 *Exames Chuunin — Fase Final!*\n\nOs finalistas estão definidos. O torneio será em 1 mês!\n\nEntretanto... treinas com Jiraiya, o Sannin Pervertido!\n\n"Eu ensino-te a invocar sapos!"\n\n> 🏆 *Exames Chuunin — Parte 1 completa!*', xp: 150, coins: 500, skill: 'Invocação: Sapo' },
    ],
    recompensas: { xp: 600, coins: 1500, skill: 'Kuchiyose no Jutsu' },
  },
  // ═══ ARCO 3: INVASÃO DE KONOHA (Cap 5-6) ═══════════════════
  {
    id: 'nar_ch05', titulo: 'Episódio 5: A Invasão de Konoha',
    descricao: 'O torneio é interrompido! Orochimaru ataca Konoha com a areia e o som!',
    nivel: 8, xp: 300, coins: 800,
    nodes: [
      { id: 'n5_01', texto: '🏆 *Torneio Final*\n\nO teu adversário é Neji Hyuga — o gênio do Byakugan.\n\n"Naruto... o destino já decidiu que perdes."\n\n"Eu não acredito no destino!"', boss: {
        nome: 'Neji Hyuga', emoji: '👁️', hp: 800, atk: 55, def: 25, xp: 400, coins: 600,
        habilidades: ['Punho Suave', 'Rotação Celestial', 'Byakugan'],
        descricao: 'Prodígio do clã Hyuga. Acredita que o destino é imutável.',
      }},
      { id: 'n5_02', texto: '👁️ *Naruto vs Neji*\n\nNeji bloqueia todos os teus tenketsu! Não podes usar chakra!\n\nMas... a Kyuubi não depende de tenketsu!\n\n"Eu vou mudar o destino!"\n\n*UM SOCO!* Neji cai.\n\nO público explode!', xp: 100, coins: 500, title: 'Desafiante do Destino' },
      { id: 'n5_03', texto: '💀 *A INVASÃO!*\n\nDe repente — fumo por todo o lado!\n\nOrochimaru aparece com o Hokage!\n\nGaara transforma-se no Shukaku!\n\nKonoha está em perigo!', escolhas: [
        { txt: '🍥 Perseguir Gaara!', next: 'n5_04a', xp: 50 },
        { txt: '💀 Lutar contra Orochimaru!', next: 'n5_04b', xp: 40 },
      ]},
      { id: 'n5_04a', texto: '🍥 *Naruto vs Gaara!*\n\nGaara está completamente transformado. O Shukaku ameaça destruir tudo!\n\n"EU SOU O DEUS AREIA!"\n\nMas Naruto invoca Gamabunta!\n\n*Sapo vs Shukaku!*\n\nA batalha ÉPICA!', boss: {
        nome: 'Gaara (Shukaku)', emoji: '🏜️', hp: 1500, atk: 90, def: 35, xp: 600, coins: 1000,
        habilidades: ['Caixão de Areia', 'Defesa Absoluta', 'Shukaku Completo'],
        descricao: 'Jinchuuriki de uma cauda. O Shukaku despertou!',
      }},
      { id: 'n5_04b', texto: '💀 *O Sacrifício do Hokage*\n\nO Terceiro Hokage luta contra Orochimaru.\n\nUsa o Selo Morto Divino!\n\n"Orochimaru... não vais destruir a minha vila!"\n\nO Hokage morre como herói.\n\n> 💀 *O Terceiro Hokage sacrificou-se por Konoha...*', xp: 30, coins: 200 },
      { id: 'n5_05', texto: '🍥 *Naruto vs Gaara — Final!*\n\nNaruto usa o Rasengan (aprendido com Jiraiya)!\n\n*BOOM!* Gaara cai.\n\n"Porqu-te... tão forte?"\n\n"Porque protejo os meus amigos!"\n\nGaara chora. Pela primeira vez, alguém o entende.\n\n> 🍥 *Invasão de Konoha repelida!*\n> 💀 *O Terceiro Hokage caiu...*\n> ⭐ *Mas uma nova era começa.*', xp: 200, coins: 1000, skill: 'Rasengan' },
    ],
    recompensas: { xp: 1000, coins: 2500, skill: 'Rasengan', title: 'Herói de Konoha' },
  },
  // ═══ ARCO 4: BUSCA POR TSUNADE (Cap 6) ════════════════════
  {
    id: 'nar_ch06', titulo: 'Episódio 6: A Busca por Tsunade',
    descricao: 'Konoha precisa de um novo Hokage. Jiraiya leva-te à procura de Tsunade — a melhor médica do mundo.',
    nivel: 10, xp: 250, coins: 600,
    nodes: [
      { id: 'n6_01', texto: '🍺 *O Desafio de Tsunade*\n\nTsunade recusa ser Hokage. Aposta contigo: se sobreviveres a 3 golpes dela, aceita.\n\n"Ei, garoto... não me provoques."\n\nO primeiro golpe quebra 3 costelas!', boss: {
        nome: 'Tsunade', emoji: '💎', hp: 1000, atk: 70, def: 30, xp: 350, coins: 800,
        habilidades: ['Força Monstro', 'Cura Regenerativa', 'Sell: Byakugou'],
        descricao: 'A Sannin Lendária. A mulher mais forte do mundo ninja.',
      }},
      { id: 'n6_02', texto: '💎 *Naruto vs Tsunade*\n\nSobrevives ao segundo e terceiro golpe!\n\nTsunade está espantada. "Esse garoto..."\n\nE mostras o Rasengan!\n\n"ELE APRENDEU O RASENGAN?!"\n\nTsunade aceita. Será a Quinta Hokage.', xp: 100, coins: 500, title: 'Ninja de Rank Superior' },
      { id: 'n6_03', texto: '⚔️ *Orochimaru Aparece!*\n\nAntes de ir para casa — Orochimaru e Kabuto atacam!\n\nO combate é feroz. Mas Tsunade supera o medo de sangue.\n\nVocês vencem!\n\n> 💎 *Tsunade é a nova Hokage!*\n> 🍥 *O caminho para o ninja mais forte continua...*', xp: 80, coins: 400 },
    ],
    recompensas: { xp: 500, coins: 1500, item: 'Colar de Tsunade' },
  },
  // ═══ ARCO 5: SASUKE FOGE (Cap 7-8) ════════════════════════
  {
    id: 'nar_ch07', titulo: 'Episódio 7: A Fuga de Sasuke',
    descricao: 'Sasuke deixa Konoha para procurar poder junto de Orochimaru. Tu vais atrás dele!',
    nivel: 12, xp: 350, coins: 800,
    nodes: [
      { id: 'n7_01', texto: '🌙 *Partida Noturna*\n\nSakura tenta impedir Sasuke.\n\n"Sasuke... por favor não vás..."\n\nEle knock-out-a com um golpe no pescoço.\n\n"Obrigado, Sakura... mas preciso de poder."', falante: 'Sasuke' },
      { id: 'n7_02', texto: '🌙 *Equipe de Resgate*\n\nShikamaru lidera: Naruto, Choji, Kiba, Neji.\n\nCada um enfrenta um dos Quatro do Som!\n\nNaruto persegue Sasuke!', escolhas: [
        { txt: '⚡ Correr diretamente atrás de Sasuke', next: 'n7_03a', xp: 40 },
        { txt: '🤝 Ajudar primeiro os companheiros', next: 'n7_03b', xp: 50 },
      ]},
      { id: 'n7_03a', texto: '⚡ *O Vale do Fim*\n\nEncontras Sasuke no Vale do Fim — o mesmo sítio onde Hashirama e Madara lutaram.\n\n"Naruto... não me sigas."', falante: 'Sasuke' },
      { id: 'n7_03b', texto: '🤝 *Proteger a Equipa*\n\nAjudas Choji contra Jirobo. Depois Neji contra Kidomaru.\n\nMas quando chegas ao Vale do Fim... Sasuke já está em transformação.', xp: 30 },
      { id: 'n7_04', texto: '⚡ *Naruto vs Sasuke — O COMBATE FINAL*\n\nSasuke activa o Segundo Nível da Marca Amaldiçoada!\n\nAsas negras. Chakra negro.\n\nNaruto liberta a Kyuubi!\n\n🦊 *Rasengan vs Chidori!*', boss: {
        nome: 'Sasuke (Marca Nível 2)', emoji: '👁️', hp: 2000, atk: 110, def: 45, xp: 800, coins: 1500,
        habilidades: ['Chidori', 'Sharingan Avançado', 'Marca Nível 2', 'Garanhã de Fogo'],
        descricao: 'O teu melhor amigo e maior rival. Escolheu o caminho das trevas.',
      }},
      { id: 'n7_05', texto: '⚡ *O Golpe Final*\n\nRasengan vs Chidori!\n\n*EXPLOSAO!*\n\nAmbos caem. Sasuke sobrevive — e foge.\n\nNaruto fica inconsciente na chuva.\n\n"Naruto... eu preciso de te trazer de volta..."\n\n> ⚡ *Sasuke fugiu para Orochimaru...*\n> 💔 *O teu melhor amigo escolheu as trevas...*\n> ⭐ *Mas eu vou trazê-lo de volta. É a minha promessa ninja!*', xp: 200, coins: 1000, title: 'Ninja que Não Desiste' },
    ],
    recompensas: { xp: 1200, coins: 3000, title: 'Guardião da Promessa' },
  },
  // ═══ ARCO 6: SHIPPUDEN (Cap 9-15) ══════════════════════════
  {
    id: 'nar_ch08', titulo: 'Episódio 8: Shippuden — O Regresso',
    descricao: '2 anos e meio depois. Treinaste com Jiraiya. Agora voltas mais forte!',
    nivel: 15, xp: 400, coins: 1000,
    nodes: [
      { id: 'n8_01', texto: '🍥 *Naruto Shippuden!*\n\nVoltaste! Mais alto, mais forte, mais determinado.\n\nMas Konoha mudou:\n- Gaara é agora Kazekage\n- Sasuke ainda está com Orochimaru\n- Akatsuki está em movimento\n\n"A Akatsuki... quer a Kyuubi!"', falante: 'Kakashi' },
      { id: 'n8_02', texto: '🏜️ *Missão: Salvar Gaara!*\n\nA Akatsuki raptou Gaara!\n\nDeidara e Sasori levaram-no.\n\nTu e Chiyo vão resgatá-lo!', boss: {
        nome: 'Sasori', emoji: '🎭', hp: 1800, atk: 100, def: 50, xp: 600, coins: 1200,
        habilidades: ['Mil Mãos', 'Mãos Vermelhas', 'Veneno Mortal'],
        descricao: 'Mestre bonequeiro da Akatsuki. 300 bonecos ao seu comando.',
      }},
      { id: 'n8_03', texto: '🎭 *Sasori vs Sakura & Chiyo*\n\nO combate é intenso! Sasori controla 100 bonecos!\n\nMas Sakura destroi o corpo dele com um soco!\n\n"Impossível... uma kunoichi tão forte?"\n\nGaara é salvo!', xp: 150, coins: 600 },
      { id: 'n8_04', texto: '💀 *A Akatsuki Ataca*\n\nDeidara destrói Konoha com a C0!\n\nPain — o líder da Akatsuki — aparece!\n\n"Eu sou a dor. Eu sou o mundo."\n\n*SEIS CAMINHOS DA DOR!*', boss: {
        nome: 'Pain (6 Caminhos)', emoji: '🌀', hp: 3500, atk: 150, def: 60, xp: 1500, coins: 3000,
        habilidades: ['Shinra Tensei', 'Bansho Tenin', 'Chibaku Tensei', 'Rinne Rebirth'],
        descricao: 'O líder da Akatsuki. O deus que se julga.',
      }},
      { id: 'n8_05', texto: '🌀 *Naruto vs Pain — O COMBATE ÉPICO*\n\nNaruto entra em Modo Sábio!\n\n"Sinto a natureza... sinto tudo!"\n\nPain vs Modo Sábio Naruto!\n\n*Shinra Tensei!* Konoha é destruída!\n\nMas Naruto não desiste!', escolhas: [
        { txt: '🐸 Usar Modo Sábio Perfeito!', next: 'n8_06a', xp: 80 },
        { txt: '🦊 Libertar a Kyuubi!', next: 'n8_06b', xp: 70 },
      ]},
      { id: 'n8_06a', texto: '🐸 *Modo Sábio Perfeito!*\n\nNaruto derrota todos os 6 caminhos!\n\nDepois encontra Nagato — o verdadeiro Pain.\n\n"Porqu-te... não me odeias?"\n\n"Porque vingança não resolve nada. Eu vou mudar o mundo!"\n\nNagato chora. E revive todos os mortos de Konoha.', xp: 200, coins: 1500, skill: 'Modo Sábio', title: 'Herói de Konoha' },
      { id: 'n8_06b', texto: '🦊 *A Kyuubi Desperta!*\n\n8 caudas! O chakra destrói tudo!\n\nMas Minato — o teu pai — aparece na mente de Naruto!\n\n"Eu acredito em ti, filho..."\n\nNaruto controla-se e vence.', xp: 180, coins: 1200 },
      { id: 'n8_07', texto: '🍥 *O Herói de Konoha!*\n\nNaruto venceu Pain. Konoha é reconstruída.\n\nToda a vila celebra.\n\nO povo que antes odiava Naruto agora grita:\n"NARUTO! NARUTO! NARUTO!"\n\n> 🍥 *O sonho do Hokage está mais perto...*\n> ⭐ *Mas a guerra está a chegar...*', xp: 300, coins: 2000, title: 'Herói de Konoha' },
    ],
    recompensas: { xp: 2000, coins: 5000, skill: 'Modo Sábio', title: 'Herói da Vila' },
  },
  // ═══ ARCO 7: A GRANDE GUERRA (Cap 9-12) ════════════════════
  {
    id: 'nar_ch09', titulo: 'Episódio 9: A Quarta Grande Guerra Ninja',
    descricao: 'A Akatsuki declara guerra! Todas as aldeias unem-se contra Madara e Obito!',
    nivel: 25, xp: 800, coins: 2000,
    nodes: [
      { id: 'n9_01', texto: '⚔️ *A ALIANÇA SHINOBI!*\n\nTodas as 5 nações unidas!\n\n100.000 shinobis contra o exército de Zetsu Branco.\n\n"Esta é a última batalha!"', falante: 'Gaara' },
      { id: 'n9_02', texto: '👁️ *Obito Uchiha Revelado!*\n\nO homem por trás da Akatsuki!\n\n"Eu vou criar um mundo perfeito... o Mundo da Lua Infinita!"\n\nObito revive Madara Uchiha!', boss: {
        nome: 'Madara Uchiha', emoji: '👁️', hp: 5000, atk: 200, def: 80, xp: 2000, coins: 5000,
        habilidades: ['Susanoo Perfeito', 'Chibaku Tensei', 'Limbo', 'Rinnegan'],
        descricao: 'O lenda dos Uchiha. O shinobi mais forte de todos os tempos.',
      }},
      { id: 'n9_03', texto: '👁️ *Madara vs Todos!*\n\nMadara destrói exércitos inteiros!\n\nO Susanoo Perfeito cobre o céu!\n\nNaruto e Sasuke unem-se!\n\n"Finalmente... juntos de novo!"', escolhas: [
        { txt: '🍥 Modo Kurama + Rasenshuriken!', next: 'n9_04a', xp: 100 },
        { txt: '👁️ Susanoo + Amaterasu!', next: 'n9_04b', xp: 100 },
        { txt: '⚡ Combo Naruto + Sasuke!', next: 'n9_04c', xp: 150 },
      ]},
      { id: 'n9_04a', texto: '🍥 *Modo Kurama!*\n\nO chakra dourado envolve Naruto!\n\n"RASENSHURIKEN!"\n\nMadara é atingido! Mas regenera-se!\n\n"Impossível... ele está a igualar-me?!"', xp: 150, coins: 1000, skill: 'Modo Kurama' },
      { id: 'n9_04b', texto: '👁️ *Sasuke Rinnegan!*\n\nSasuke activa o Rinnegan!\n\n"SUSANOO!"\n\nO Susanoo de Sasuke vs o de Madara!', xp: 150, coins: 1000 },
      { id: 'n9_04c', texto: '⚡ *A EQUIPA PERFEITA!*\n\nNaruto e Sasuke atacam juntos!\n\nRasengan + Chidori!\n\nMadara recua pela primeira vez!\n\n"Vocês dois... são a reencarnação de Indra e Ashura!"', xp: 200, coins: 1500, title: 'Reencarnação de Ashura' },
      { id: 'n9_05', texto: '🌕 *Kaguya Ōtsutsuki!*\n\nMadara é traído por Black Zetsu!\n\nKaguya — a deusa coelho — desperta!\n\n"Todos serão um comigo..."\n\nA batalha final!', boss: {
        nome: 'Kaguya Ōtsutsuki', emoji: '🌙', hp: 8000, atk: 250, def: 100, xp: 5000, coins: 10000,
        habilidades: ['Ash Bones', 'Amenominaka', 'Yomotsu Hirasaka', 'Infinite Tsukuyomi'],
        descricao: 'A progenitora do chakra. A ameaça mais poderosa de sempre.',
      }},
      { id: 'n9_06', texto: '🌙 *Selo de Kaguya!*\n\nNaruto e Sasuke usam o selo de Hagoromo!\n\n"SUN SEAL!"\n\nKaguya é selada!\n\nA guerra acabou!\n\nMas... Sasuke quer revolução.\n\n"Vou matar os 5 Kages e governar sozinho."', xp: 300, coins: 3000 },
      { id: 'n9_07', texto: '⚡ *Naruto vs Sasuke — Final!*\n\nO Vale do Fim, de novo.\n\nRasengan vs Chidori. Kyuubi vs Susanoo.\n\nAmbos perdem um braço.\n\n"Sasuke... tu ganhaste..."\n\n"Não... empatámos."\n\n> ⚡ *A guerra acabou. Sasuke regressa.*\n> 🍥 *Naruto é o herói do mundo ninja.*\n> 🏆 *O caminho para Hokage está aberto!*', xp: 500, coins: 5000, title: 'Lenda dos Shinobis' },
    ],
    recompensas: { xp: 5000, coins: 15000, skill: 'Modo Kurama', title: 'Lenda Viva', item: 'Braço de Chakra' },
  },
  {
    id: 'nar_ch10', titulo: 'Episódio 10: O Sétimo Hokage',
    descricao: 'Depois de anos... o sonho torna-se realidade.',
    nivel: 30, xp: 1000, coins: 5000,
    nodes: [
      { id: 'n10_01', texto: '🍥 *A Cerimónia*\n\nToda a Konoha reunida.\n\nTsunade sorri. "Naruto Uzumaki... és o Sétimo Hokage."\n\nA vila inteira grita:\n"HOKAGE! HOKAGE! HOKAGE!"\n\nO rapaz que era odiado... agora é o líder.\n\n> 🍥 *PARABÉNS! Completaste a história de Naruto!*\n> 🏆 *Conquista: Sétimo Hokage!*\n> ⭐ *O teu sonho tornou-se realidade.*', xp: 2000, coins: 10000, title: 'Sétimo Hokage', item: 'Roupa de Hokage' },
    ],
    recompensas: { xp: 5000, coins: 20000, title: 'Sétimo Hokage', item: 'Roupa de Hokage' },
  },
];

const ONEPIECE_CHAPTERS = [
  // ═══ ARCO 1: ROMANCE DAWN (Cap 1) ═════════════════════════
  {
    id: 'op_ch01', titulo: 'Romance Dawn — O Começo da Aventura',
    descricao: 'Foosha Village. Um chapéu de palha. Um sonho impossível.',
    nivel: 5, xp: 80, coins: 200,
    nodes: [
      { id: 'o1_01', texto: '👒 *Foosha Village*\n\nUm miúdo de 7 anos come uma fruta estranha. O corpo torna-se de borracha!\n\nShanks, o pirata ruivo, ri-se. "Comeste a Gomu Gomu no Mi! Agora nunca mais podes nadar!"\n\nMas Luffy não se importa. Shanks é o seu herói.', falante: 'Shanks' },
      { id: 'o1_02', texto: '🏔️ *O Banditouros da Montanha*\n\nOs banditos humilham Shanks. Derramam sake na cabeça dele.\n\nShanks ri. "Sake na minha cabeça? Não vale a pena lutar por isso."\n\nMas quando ameaçam Luffy...\n\nShanks olha sério. "Ninguém toca no meu amigo."', falante: 'Shanks' },
      { id: 'o1_03', texto: '👒 *O Chapéu de Palha*\n\nShanks perde o braço para salvar Luffy de um Rei do Mar.\n\n"Luffy... eu confio-te o meu chapéu."\n\n"Devolve-me quando fores um grande pirata!"\n\n> 👒 *O chapéu que mudou tudo...*', xp: 30, item: 'Chapéu de Palha de Shanks' },
      { id: 'o1_04', texto: '⛵ *10 Anos Depois*\n\nLuffy tem 17 anos. Parte sozinho num barril.\n\n"EU SOU MONKEY D. LUFFY! VOU SER O REI DOS PIRATAS!"\n\nO mar chama. A aventura começa.\n\n> ⛵ *Partida de Foosha Village!*\n> 🏴‍☠️ *O sonho do One Piece começa agora.*', xp: 50, coins: 300, title: 'Pirata Chapéu de Palha' },
    ],
    recompensas: { xp: 200, coins: 500, item: 'Chapéu de Palha', title: 'Pirata Chapéu de Palha' },
  },
  // ═══ ARCO 2: BUGGY (Cap 2) ════════════════════════════════
  {
    id: 'op_ch02', titulo: 'O Palhaço Pirata — Buggy!',
    descricao: 'A primeira ilha. O primeiro vilão. Buggy, o palhaço que se parte em pedaços!',
    nivel: 6, xp: 100, coins: 300,
    nodes: [
      { id: 'o2_01', texto: '🎪 *Vila do Buggy*\n\nLuffy chega a uma ilha terrorizada pelo pirata Buggy.\n\nUm cão chamado Chouchou protege a loja do seu dono.\n\n"Não toquem no cão!" — Luffy fica furioso.', falante: 'Luffy' },
      { id: 'o2_02', texto: '🤡 *Buggy, o Palhaço*\n\n"Eu sou Buggy! O futuro Rei dos Piratas!"\n\nComeu a Bari Bari no Mi — pode partir-se em pedaços!\n\nLuffy: "Que poder estúpido!"\n\nBuggy: "ESTÚPIDO?!"', boss: {
        nome: 'Buggy', emoji: '🤡', hp: 400, atk: 35, def: 15, xp: 200, coins: 400,
        habilidades: ['Buggy Ball', 'Partes Separadas', 'Barragem de Bolas'],
        descricao: 'O pirata palhaço. Comeu a Bara Bara no Mi.',
      }},
      { id: 'o2_03', texto: '🤡 *Luffy vs Buggy*\n\nBuggy divide-se em pedaços! Mas Luffy estica o braço...\n\n"GOMU GOMU NO... PISTOL!"\n\n*BAM!* Buggy voa pelos ares!\n\n"Obrigado, Luffy!" — o povo da vila celebra.', xp: 80, coins: 200 },
      { id: 'o2_04', texto: '⚔️ *Nami, a Gata Ladra*\n\nUma mulher laranja aparece. "Eu sou Nami. Navegadora."\n\nEla rouba o tesouro de Buggy e foge.\n\nLuffy: "Ei! Queres ser minha pirata?"\n\nNami: "Só se me pagares."\n\n> ⚔️ *Nami junta-se (temporariamente)!*', xp: 40, coins: 100 },
    ],
    recompensas: { xp: 300, coins: 700, item: 'Bola de Buggy' },
  },
  // ═══ ARCO 3: CAPITÃO KURO (Cap 3) ═════════════════════════
  {
    id: 'op_ch03', titulo: 'O Génio Maligno — Capitão Kuro',
    descricao: 'Um mordomo que esconde um passado terrível. A vila de Kaya está em perigo!',
    nivel: 7, xp: 120, coins: 400,
    nodes: [
      { id: 'o3_01', texto: '🏡 *Vila Syrup*\n\nUma rapariga rica chamada Kaya tem um mordomo chamado Klahadoll.\n\nMas Luffy desconfia. "Esse gajo é estranho!"\n\nUsopp, o mentiroso, confirma: "Kuro é um pirata!"', falante: 'Usopp' },
      { id: 'o3_02', texto: '🐱 *Capitão Kuro*\n\n"Três anos a fingir ser mordomo... para roubar a fortuna de Kaya!"\n\nKuro usa garras afiadas. É rápido como o vento!\n\n"Ninguém me vê mover!"', boss: {
        nome: 'Capitão Kuro', emoji: '🐱', hp: 600, atk: 45, def: 20, xp: 250, coins: 500,
        habilidades: ['Shakushi', 'Claws Rush', 'Gato Assassino'],
        descricao: 'O pirata que fingiu ser mordomo por 3 anos.',
      }},
      { id: 'o3_03', texto: '🐱 *Luffy vs Kuro*\n\nKuro é rápido demais! Corta Luffy várias vezes!\n\nMas Luffy agarra-o! "GOMU GOMU NO... GATLING!"\n\n*PA PA PA PA PA!*\n\nKuro cai. Kaya está salva!', xp: 100, coins: 300 },
      { id: 'o3_04', texto: '🏴‍☠️ *Going Merry!*\n\nKaya dá-vos o Going Merry — um navio com cabeça de carneiro!\n\nUsopp junta-se à tripulação!\n\n"Eu sou Usopp! O capitão dos Piratas de Usopp!"\n\nLuffy: "Não! Tu és o meu atirador!"\n\n> 🏴‍☠️ *Going Merry é o vosso navio!*\n> 🎯 *Usopp junta-se!*', xp: 60, coins: 200, item: 'Going Merry' },
    ],
    recompensas: { xp: 350, coins: 900, item: 'Going Merry', title: 'Atirador de Elite' },
  },
  // ═══ ARCO 4: BARATIE (Cap 4-5) ════════════════════════════
  {
    id: 'op_ch04', titulo: 'O Restaurante no Mar — Baratie',
    descricao: 'Um restaurante flutuante. O chef mais forte do mundo. Don Krieg, o almirante dos 5000.',
    nivel: 8, xp: 150, coins: 500,
    nodes: [
      { id: 'o4_01', texto: '🍽️ *Baratie — O Restaurante Flutuante*\n\nLuffy trabalha como empregado para pagar as dívidas!\n\nZeff, o chef de perna única, é duro mas justo.\n\n"Num restaurante, a comida é sagrada!"', falante: 'Zeff' },
      { id: 'o4_02', texto: '🍽️ *Sanji, o Chef*\n\nUm chef loiro que dá comida a qualquer pirata faminto.\n\n"Ninguém merece passar fome."\n\nLuffy: "Tu! Vem ser meu cozinheiro!"\n\nSanji: "Eu não posso... tenho um sonho."', falante: 'Sanji' },
      { id: 'o4_03', texto: '⚓ *Don Krieg — O Almirante dos 5000*\n\nKrieg chega com o seu armada destruída. Quer roubar o Baratie!\n\n"EU SOU DON KRIEG! O homem mais forte do East Blue!"\n\nMas Luffy não vai deixar isso acontecer!', boss: {
        nome: 'Don Krieg', emoji: '⚓', hp: 800, atk: 55, def: 30, xp: 300, coins: 600,
        habilidades: ['Mao de 5000', 'Armadura de Espinhos', 'Lança de Gás'],
        descricao: 'O almirante dos 5000. Armada inteira destruída pela Grand Line.',
      }},
      { id: 'o4_04', texto: '⚔️ *Luffy vs Krieg*\n\nKrieg tem 5000 homens! Mas Luffy é mais forte que 5000!\n\n"GOMU GOMU NO... BAZOOKA!"\n\n*BOOM!* Krieg é destruído!\n\nSanji: "...Esse gajo é incrível."', xp: 120, coins: 400 },
      { id: 'o4_05', texto: '👨‍🍳 *A Promessa de Sanji*\n\nSanji decide ir com Luffy!\n\n"Zeff... eu vou encontrar o All Blue!"\n\nZeff: "Vai, miúdo. E nunca deixes de cozinhar."\n\nSanji chora. Abraça o seu mestre.\n\n> 👨‍🍳 *Sanji junta-se como cozinheiro!*\n> 🌊 *O All Blue espera!*', xp: 80, coins: 300, item: 'Diable Jambe' },
    ],
    recompensas: { xp: 500, coins: 1200, skill: 'Diable Jambe', title: 'Chef do Mar' },
  },
  // ═══ ARCO 5: ARLONG PARK (Cap 5-6) ════════════════════════
  {
    id: 'op_ch05', titulo: 'Arlong Park — A Tirania dos Tritões',
    descricao: 'O passado de Nami revelado. 10 anos de escravidão. Arlong, o tritão mais cruel do East Blue.',
    nivel: 9, xp: 200, coins: 600,
    nodes: [
      { id: 'o5_01', texto: '🗺️ *Cocoyama Village*\n\nNami trai a tripulação! Rouba o Going Merry e foge!\n\nMas Luffy descobre a verdade: Nami é escrava de Arlong!\n\nHá 10 anos, Arlong matou a mãe de Nami e escravizou a vila!\n\nNami desenha mapas para Arlong em troca da liberdade da vila.', falante: 'Genzo' },
      { id: 'o5_02', texto: '🗡️ *Nami Chora*\n\n"NÃO POSSO SALVAR A MINHA VILA!"\n\nNami apunhala o tatuagem da Arlong Pirates.\n\nLuffy olha para ela. Calmo. Sério.\n\n"Põe o chapéu." — Luffy coloca o chapéu na cabeça de Nami.\n\n"EU VOU DERROTAR ARLONG!"', falante: 'Luffy' },
      { id: 'o5_03', texto: '🐟 *Arlong Park — O Combate!*\n\nLuffy vs Arlong!\n\nO tritão mais forte do East Blue!\n\n"A humanos nunca vão vencer tritões!"\n\nMas Luffy não é humano normal...', boss: {
        nome: 'Arlong', emoji: '🐟', hp: 1200, atk: 70, def: 35, xp: 400, coins: 800,
        habilidades: ['Shark Saw', 'Dentes de Tritão', 'Kiribachi', 'Água Doce'],
        descricao: 'O tritão mais forte do East Blue. Escravizou a vila de Nami por 10 anos.',
      }},
      { id: 'o5_04', texto: '🐟 *GOMU GOMU NO... AXE!*\n\nLuffy parte a torre de Arlong!\n\n"GOMU GOMU NO... BAZOOKA!"\n\nArlong Park desmorona!\n\nNami olha para o céu. Chora de alegria.\n\n"Obrigada... Luffy."', xp: 200, coins: 500 },
      { id: 'o5_05', texto: '🗺️ *Navegadora dos Piratas do Chapéu de Palha*\n\nArlong Park está em ruínas.\n\nNami: "Luffy... eu sou a tua nave."\n\nLuffy: "OBVIAMENTE!"\n\n> 🗺️ *Nami juntou-se oficialmente!*\n> 🏴‍☠️ *Equipe: Luffy, Zoro, Nami, Usopp, Sanji*\n> ⭐ *O East Blue está quase conquistado!*', xp: 150, coins: 400, title: 'Libertador de Cocoyama' },
    ],
    recompensas: { xp: 600, coins: 1500, title: 'Libertador do East Blue', skill: 'Clima Tempo' },
  },
  // ═══ ARCO 6: LOGUETOWN (Cap 6) ════════════════════════════
  {
    id: 'op_ch06', titulo: 'Loguetown — O Início e o Fim',
    descricao: 'A cidade onde Gol D. Roger nasceu e morreu. Luffy quase morre no mesmo lugar.',
    nivel: 10, xp: 200, coins: 500,
    nodes: [
      { id: 'o6_01', texto: '⚔️ *Loguetown — Praça da Execução*\n\nRoger foi executado aqui.\n\nLuffy sobe à forca. Sorri.\n\n"Quando eu morrer... isso é que é ser pirata!"', falante: 'Luffy' },
      { id: 'o6_02', texto: '⚡ *Buggy e Alvida!*\n\nBuggy volta! Com Alvida!\n\nLuffy está preso na forca!\n\n"HAHAHA! VOU MATAR O LUFFY!"\n\nMas... um relâmpago atinge Buggy!\n\nAlguém protege Luffy de cima...', boss: {
        nome: 'Buggy & Alvida', emoji: '🤡', hp: 800, atk: 50, def: 20, xp: 300, coins: 600,
        habilidades: ['Buggy Ball', 'Sube Sube no Mi', 'Combo Pirata'],
        descricao: 'O palhaço voltou com vingança!',
      }},
      { id: 'o6_03', texto: '⚡ *O Destino*\n\nO relâmpago salvou Luffy!\n\nSmoker, o capitão da Marinha, observa.\n\n"Esse miúdo... é perigoso demais."\n\nLuffy escapa com a ajuda de Dragon!\n\n"Quem é aquele homem?"\n\n> ⚡ *Luffy escapa de Loguetown!*\n> 🌊 *Rumo à Grand Line!*', xp: 150, coins: 300 },
    ],
    recompensas: { xp: 400, coins: 1000, title: 'Fugitivo da Marinha' },
  },
  // ═══ ARCO 7: GRAND LINE — ALABASTA (Cap 7-12) ═════════════
  {
    id: 'op_ch07', titulo: 'A Entrada na Grand Line',
    descricao: 'Reverse Mountain. A corrente que separa os mares. Laboon, a baleia gigante.',
    nivel: 11, xp: 250, coins: 600,
    nodes: [
      { id: 'o7_01', texto: '🏔️ *Reverse Mountain!*\n\nO navio sobe a montanha! A água flui para cima!\n\n"A GRAND LINE! CHEGÁMOS!"\n\nMas uma baleia gigante bloqueia o caminho!', falante: 'Luffy' },
      { id: 'o7_02', texto: '🐋 *Laboon — A Baleia que Espera*\n\nUma baleia gigante bate a cabeça na montanha!\n\n"Porqu-te, baleia?"\n\nUm velho explica: "Ela espera os piratas do Rumbar que a deixaram há 50 anos."\n\nLuffy: "Eu vou voltar! Prometo!"', xp: 80, coins: 200 },
      { id: 'o7_03', texto: '⚔️ *Whiskey Peak — Os Caçadores de Recompensa!*\n\nUma vila amigável... que é uma armadilha!\n\n100 caçadores de recompensa atacam!\n\nZoro: "Deixa comigo."\n\n*100 homens. 3 espadas. 0 hipóteses.*', xp: 100, coins: 300 },
      { id: 'o7_04', texto: '🦕 *Little Garden — Os Gigantes*\n\nDois gigantes duelam há 100 anos!\n\nDorry e Broggy. O orgulho dos guerreiros.\n\n"Esta batalha é sagrada!"\n\nLuffy aprende sobre a honra dos gigantes.', xp: 80, coins: 200 },
      { id: 'o7_05', texto: '🏥 *Drum Island — O Doutor Rena!*\n\nNami está doente! Precisam de um médico!\n\nNa ilha da neve, encontram Tony Tony Chopper!\n\n"Eu sou um rena! Mas... sou médico!"\n\nWapol, o rei que come tudo, ataca!', boss: {
        nome: 'Wapol', emoji: '🦷', hp: 700, atk: 45, def: 25, xp: 300, coins: 500,
        habilidades: ['Baku Baku no Mi', 'Comer e Evoluir', 'Machvise'],
        descricao: 'O rei que come tudo. Comeu o próprio reino!',
      }},
      { id: 'o7_06', texto: '🦌 *Chopper — O Doutor Rena!*\n\nLuffy derrota Wapol!\n\nChopper: "Luffy... eu posso ir contigo?"\n\nLuffy: "CLARO! Tu és o nosso doutor!"\n\nHiluluk sorri do céu.\n\n> 🦌 *Chopper junta-se!*\n> 🏴‍☠️ *Equipe: Luffy, Zoro, Nami, Usopp, Sanji, Chopper*', xp: 120, coins: 400, item: 'Chapéu de Hiluluk' },
    ],
    recompensas: { xp: 700, coins: 1800, title: 'Navegador da Grand Line' },
  },
  {
    id: 'op_ch08', titulo: 'Alabasta — O Reino da Areia',
    descricao: 'Vivi precisa de ajuda. Crocodile, o Shichibukai, quer destruir o seu reino!',
    nivel: 13, xp: 350, coins: 800,
    nodes: [
      { id: 'o8_01', texto: '🏜️ *Alabasta!*\n\nA princesa Vivi implora: "Salvem o meu reino!"\n\nCrocodile — Mr. 0 — está a manipular o país!\n\n"Ele quer o Ancient Weapon Pluton!"\n\nLuffy: "Eu vou derrotar esse crocodilo!"', falante: 'Vivi' },
      { id: 'o8_02', texto: '🏜️ *A Guerra Civil!*\n\nO povo de Alabasta luta entre si!\n\nCobra, o rei, é acusado de roubar a água.\n\nMas foi Crocodile quem fez tudo!\n\n"Eu sou o herói deste reino... HAHAHAHA!"', falante: 'Crocodile' },
      { id: 'o8_03', texto: '🐊 *Crocodile — O Shichibukai!*\n\nLuffy vs Crocodile!\n\n"Tu és areia! Eu sou borracha!"\n\nCrocodile desidrata tudo o que toca!\n\nLuffy morre... mas revive com a água de Vivi!', boss: {
        nome: 'Crocodile', emoji: '🐊', hp: 2500, atk: 100, def: 50, xp: 800, coins: 1500,
        habilidades: ['Suna Suna no Mi', 'Desidratação', 'Hook Dourado', 'Grand Line Shichibukai'],
        descricao: 'O Shichibukai do deserto. Controla a areia e destrói reinos.',
      }},
      { id: 'o8_04', texto: '🐊 *Luffy vs Crocodile — Round Final!*\n\nLuffy usa sangue para solidificar a areia!\n\n"GOMU GOMU NO... STORM!"\n\n*BOOOOOM!*\n\nCrocodile voa pelo ar!\n\nAlabasta é salva!', xp: 300, coins: 800 },
      { id: 'o8_05', texto: '🏜️ *Alabasta Livre!*\n\nVivi chora de alegria.\n\n"Obrigada... Piratas do Chapéu de Palha!"\n\nO povo celebra. A chuva cai.\n\n> 🏜️ *Alabasta salva!*\n> 🏴‍☠️ *Vivi fica... mas o navio parte.*\n> 💔 "Eu voltarei... amigos!"', xp: 200, coins: 500, title: 'Herói de Alabasta' },
    ],
    recompensas: { xp: 1000, coins: 2500, title: 'Herói de Alabasta', skill: 'Gomu Gomu no Storm' },
  },
  // ═══ ARCO 8: SKYPIEA (Cap 9-10) ═══════════════════════════
  {
    id: 'op_ch09', titulo: 'Skypiea — O Céu Inexistente',
    descricao: 'Uma ilha no céu! Enel, o deus que controla o raio, ameaça destruir tudo!',
    nivel: 16, xp: 400, coins: 1000,
    nodes: [
      { id: 'o9_01', texto: '☁️ *O Mar Branco!*\n\nO Going Merry sobe pelo Knock Up Stream!\n\n"O CÉU! ESTAMOS NO CÉU!"\n\nUma ilha flutuante! Anjos com asas!\n\nBem-vindo a Skypiea!', falante: 'Luffy' },
      { id: 'o9_02', texto: '⚡ *Enel — O Deus do Raio!*\n\nEnel controla o raio! Pode ouvir tudo na ilha!\n\n"EU SOU DEUS! E deuses não morrem!"\n\nDestruirá Skypiea com o Ark Maxim!\n\nLuffy: "Tu não és deus!"', boss: {
        nome: 'Enel', emoji: '⚡', hp: 3000, atk: 130, def: 55, xp: 1000, coins: 2000,
        habilidades: ['Goro Goro no Mi', 'Raigo', 'El Thor', '200 milhões de Volts'],
        descricao: 'O deus auto-proclamado de Skypiea. Comeu a fruta do raio.',
      }},
      { id: 'o9_03', texto: '⚡ *Luffy vs Enel!*\n\nEnel: "O raio é invencível!"\n\nLuffy: "Eu sou de borracha!"\n\n*O raio não funciona em Luffy!*\n\n"IMPOSSÍVEL! QUEM ÉS TU?!"\n\n"GOMU GOMU NO... BAZOOKA!"', xp: 300, coins: 800 },
      { id: 'o9_04', texto: '🔔 *O Sino de Ouro!*\n\nLuffy bate no sino de ouro!\n\n*TANNNNN!*\n\nO som chega a Jaya! Cricket ouve!\n\n"Obrigado... Shandora existe!"\n\n> ☁️ *Skypiea salva!*\n> ⭐ *O sonho de Cricket realizou-se!*', xp: 200, coins: 500, item: 'Fragmento de Ouro' },
    ],
    recompensas: { xp: 1200, coins: 3000, item: 'Ouro de Skypiea', title: 'Vencedor do Céu' },
  },
  // ═══ ARCO 9: WATER 7 / ENIES LOBBY (Cap 11-14) ════════════
  {
    id: 'op_ch10', titulo: 'Water 7 — A Cidade da Água',
    descricao: 'O Going Merry morre. Franky, o cyborg. CP9, os assassinos do governo!',
    nivel: 20, xp: 500, coins: 1200,
    nodes: [
      { id: 'o10_01', texto: '🚢 *A Morte do Going Merry*\n\n"O navio... não pode mais navegar."\n\nIceburg: "O Going Merry morreu."\n\nLuffy chora. Usopp não aceita.\n\n"EU NÃO VOU ABANDONAR O MERRY!"\n\nLuffy vs Usopp. O mais difícil.', falante: 'Iceburg' },
      { id: 'o10_02', texto: '⚔️ *Luffy vs Usopp*\n\nUsopp desafia Luffy!\n\n"Se queres o navio, tens que me derrotar!"\n\nO combate é emocional. Luffy ganha... mas chora.\n\n"Desculpa... Usopp..."', xp: 150, coins: 300 },
      { id: 'o10_03', texto: '🕵️ *CP9 Revelado!*\n\nRob Lucci. Kaku. Jabra. Kalifa. Blueno.\n\nOs agentes secretos do governo!\n\nEles raptaram Robin!\n\n"Robin vai morrer em Enies Lobby!"', falante: 'Rob Lucci' },
      { id: 'o10_04', texto: '🏛️ *Enies Lobby — O Tribunal do Mundo!*\n\nOs Piratas do Chapéu de Palha invadem a ilha da justiça!\n\nLuffy enfrenta 10.000 marines!\n\n"DEVOLVAM A MINHA NAKAMA!"', xp: 200, coins: 500 },
      { id: 'o10_05', texto: '⚖️ *A Declaração de Guerra!*\n\nLuffy queima a bandeira do Governo Mundial!\n\n"Isto é uma declaração de guerra contra o mundo inteiro!"\n\nRobin: "EU QUERO VIVER!"\n\nTodo o mundo chora.', xp: 300, coins: 800, title: 'Inimigo do Mundo' },
      { id: 'o10_06', texto: '🐆 *Luffy vs Rob Lucci!*\n\nO combate mais difícil até agora!\n\nLucci usa o Rokushiki completo!\n\nLuffy inventa o Gear Second!\n\n"GOMU GOMU NO... JET PISTOL!"', boss: {
        nome: 'Rob Lucci', emoji: '🐆', hp: 4000, atk: 160, def: 70, xp: 1500, coins: 3000,
        habilidades: ['Rokushiki', 'Shigan', 'Rankyaku', 'Gear Leopard'],
        descricao: 'O agente mais forte do CP9. Leopard hybrid form.',
      }},
      { id: 'o10_07', texto: '🐆 *GEAR SECOND!*\n\nLuffy activa o Gear Second!\n\nO corpo fica vermelho! Velocidade extrema!\n\n"GOMU GOMU NO... JET GATLING!"\n\n*PA PA PA PA PA PA PA!*\n\nLucci cai!\n\nEnies Lobby está a desmoronar!', xp: 400, coins: 1000, skill: 'Gear Second' },
      { id: 'o10_08', texto: '🔥 *O Going Merry — A Última Viagem*\n\nO Going Merry aparece sozinho!\n\n"Eu queria... navegar mais um pouco..."\n\nLuffy: "Obrigado, Merry... por tudo."\n\nO navio queima no horizonte.\n\nTodos choram.\n\n> 🔥 *Going Merry... obrigado por tudo.*\n> 🏴‍☠️ *Franky junta-se! O Thousand Sunny espera!*', xp: 300, coins: 1000, title: 'Guerreiro de Enies Lobby', item: 'Klabautermann' },
    ],
    recompensas: { xp: 2500, coins: 6000, skill: 'Gear Second', title: 'Guerreiro de Enies Lobby', item: 'Thousand Sunny' },
  },
  // ═══ ARCO 10: THRILLER BARK (Cap 12) ══════════════════════
  {
    id: 'op_ch11', titulo: 'Thriller Bark — O Navio Fantasma',
    descricao: 'Gecko Moria rouba sombras! Brook, o esqueleto que faz piadas!',
    nivel: 22, xp: 400, coins: 1000,
    nodes: [
      { id: 'o11_01', texto: '👻 *Thriller Bark!*\n\nUm navio gigante coberto de névoa!\n\nZombies! Monstros! E um esqueleto que...\n\n"Posso ver a tua calcinha, Nami?"\n\nBrook: "Yohohoho! Skull joke!"', falante: 'Brook' },
      { id: 'o11_02', texto: '🧟 *Gecko Moria — O Shichibukai das Sombras!*\n\nMoria rouba sombras e coloca-as em zombies!\n\n"Os teus amigos vão ser os meus soldados!"\n\nLuffy: "DEVOLVE AS SOMBRAS!"', boss: {
        nome: 'Gecko Moria', emoji: '🧟', hp: 3500, atk: 140, def: 60, xp: 1200, coins: 2500,
        habilidades: ['Kage Kage no Mi', 'Shadow Luffy', 'Doppelman', 'Giant Shadow'],
        descricao: 'O Shichibukai que controla sombras. Perdeu contra Kaido.',
      }},
      { id: 'o11_03', texto: '🧟 *Luffy vs Moria!*\n\nMoria engole 1000 sombras! Torna-se gigante!\n\nMas Luffy usa o Gear Third!\n\n"GOMU GOMU NO... GIGANT PISTOL!"\n\n*CRASH!*\n\nAs sombras voltam aos donos!', xp: 300, coins: 700, skill: 'Gear Third' },
      { id: 'o11_04', texto: '🎵 *Brook — O Músico!*\n\nBrook: "Luffy... eu posso ir contigo?"\n\nLuffy: "TU ÉS O NOSSO MÚSICO!"\n\nBrook: "Mas... eu sou só um esqueleto..."\n\nLuffy: "TU ÉS FIXE!"\n\n> 🎵 *Brook junta-se!*\n> 🏴‍☠️ *Equipe: 8 membros!*', xp: 150, coins: 400, item: 'Violino de Brook' },
    ],
    recompensas: { xp: 1000, coins: 2500, skill: 'Gear Third', title: 'Caçador de Thriller Bark' },
  },
  // ═══ ARCO 11: SABAODY / MARINEFORD (Cap 13-16) ═════════════
  {
    id: 'op_ch12', titulo: 'Sabaody — A Separação',
    descricao: 'A Marinha ataca. Os Pacifistas. Kizaru. A tripulação é separada!',
    nivel: 25, xp: 600, coins: 1500,
    nodes: [
      { id: 'o12_01', texto: '🌳 *Sabaody Archipelago*\n\nAs árvores gigantes produzem bubbles!\n\nMas... um Tenryuubito é atacado!\n\nA Marinha envia o Almirante Kizaru!\n\n"Luz... é a coisa mais rápida do mundo."', falante: 'Kizaru' },
      { id: 'o12_02', texto: '💥 *Pacifista!*\n\nCyborgs idênticos ao Kuma atacam!\n\nCada um é mais forte que um Shichibukai!\n\n"Não podemos vencer isto!"\n\nKuma aparece. O verdadeiro.', boss: {
        nome: 'Bartholomew Kuma', emoji: '🐻', hp: 5000, atk: 180, def: 80, xp: 1500, coins: 3000,
        habilidades: ['Nikyu Nikyu no Mi', 'Repelir Tudo', 'Ursus Shock'],
        descricao: 'O Shichibukai que se tornou cyborg. Cada membro voa para uma ilha diferente.',
      }},
      { id: 'o12_03', texto: '🐻 *A Separação!*\n\nKuma toca em cada membro da tripulação!\n\n*PUFF!* Voam para ilhas diferentes!\n\n"NÃO! ZORO! SANJI! NAMI!"\n\nLuffy é enviado para Amazon Lily.\n\n> 💔 *A tripulação foi separada...*\n> ⭐ *Luffy precisa de ficar mais forte!*', xp: 200, coins: 500 },
      { id: 'o12_04', texto: '👑 *Amazon Lily — As Guerreiras Kuja*\n\nLuffy chega à ilha só de mulheres!\n\nBoa Hancock, a imperatriz, apaixona-se por ele!\n\n"Eu vou ajudar-te a salvar o teu irmão!"\n\nAce vai ser executado em Marineford!', falante: 'Hancock' },
      { id: 'o12_05', texto: '🔥 *Impel Down — A Prisão Inabalável!*\n\nLuffy invade a prisão mais segura do mundo!\n\nBon Clay sacrifica-se por ele!\n\nIvankov ajuda-o a descer!\n\n"ACE! EU ESTOU A CAMINHO!"', xp: 250, coins: 600 },
      { id: 'o12_06', texto: '⚔️ *MARINEFORD — A GUERRA!*\n\nA maior batalha de sempre!\n\nBarba Branca vs Marinha!\n\nLuffy chega ao meio da guerra!\n\n"ACE! EU VOU SALVAR-TE!"', xp: 300, coins: 800 },
      { id: 'o12_07', texto: '🔥 *O Sacrifício de Ace*\n\nAce é salvo! Mas...\n\nAkainu ataca por trás!\n\n"Luffy... obrigado por me amar..."\n\nAce morre nos braços de Luffy.\n\n> 💀 *Portgas D. Ace morreu...*\n> 😭 *O momento mais triste da história.*', xp: 200, coins: 500, title: 'Irmão de Ace' },
      { id: 'o12_08', texto: '😭 *O Luto de Luffy*\n\nLuffy entra em colapso.\n\n"Eu não... consigo... proteger ninguém..."\n\nJinbe: "Luffy! O que ainda tens?!"\n\nLuffy: "...Eu tenho os meus amigos."\n\n> 😭 *Luffy decide ficar mais forte!*\n> ⏰ *2 anos de treino com Rayleigh!*', xp: 300, coins: 800, title: 'Sobrevivente de Marineford' },
    ],
    recompensas: { xp: 2500, coins: 6000, title: 'Sobrevivente de Marineford' },
  },
  // ═══ ARCO 12: FISHMAN ISLAND (Cap 14) ══════════════════════
  {
    id: 'op_ch13', titulo: 'Fishman Island — O Fundo do Mar',
    descricao: '2 anos depois. A tripulação reunida. O terrorismo dos Novos Tritões!',
    nivel: 28, xp: 500, coins: 1200,
    nodes: [
      { id: 'o13_01', texto: '🌊 *Reunidos!*\n\n2 anos depois! A tripulação junta-se em Sabaody!\n\nCada um ficou mais forte!\n\n"RUMO A FISHMAN ISLAND!"\n\nO Thousand Sunny mergulha no oceano!', xp: 100, coins: 300 },
      { id: 'o13_02', texto: '🐟 *Hody Jones — O Novo Arlong!*\n\nHody quer destruir o Ryugu Kingdom!\n\n"Humanos são inferiores!"\n\nLuffy: "Tu não és como Arlong. Tu és mais fraco!"', boss: {
        nome: 'Hody Jones', emoji: '🐟', hp: 4000, atk: 150, def: 60, xp: 1200, coins: 2500,
        habilidades: ['Energy Steroids', 'Shark Arrows', 'Ultramarine'],
        descricao: 'O novo terror dos tritões. Odiou humanos desde sempre.',
      }},
      { id: 'o13_03', texto: '🐟 *Luffy vs Hody — No Fundo do Mar!*\n\nLuffy luta debaixo de água!\n\n"GOMU GOMU NO... RED HAWK!"\n\n*FOGO debaixo de água!*\n\nHody é derrotado!\n\nA ilha dos tritões é livre!', xp: 300, coins: 700, skill: 'Red Hawk' },
      { id: 'o13_04', texto: '👸 *A Declaração de Shirahoshi*\n\nShirahoshi: "Eu quero ver o sol!"\n\nNeptune: "Vai, filha. O mundo é teu."\n\n> 🌊 *Fishman Island salva!*\n> 🏴‍☠️ *A tripulação está de volta!*\n> ⭐ *Rumo ao Novo Mundo!*', xp: 200, coins: 500, title: 'Protector de Fishman Island' },
    ],
    recompensas: { xp: 1200, coins: 3000, skill: 'Red Hawk', title: 'Protector do Mar' },
  },
  // ═══ ARCO 13: PUNK HAZARD (Cap 15) ════════════════════════
  {
    id: 'op_ch14', titulo: 'Punk Hazard — A Ilha Proibida',
    descricao: 'Caesar Clown, o cientista louco. Smoker vs Law. A aliança começa!',
    nivel: 30, xp: 600, coins: 1500,
    nodes: [
      { id: 'o14_01', texto: '🔥❄️ *Punk Hazard — Metade Fogo, Metade Gelo!*\n\nAkainu e Aokaji lutaram aqui!\n\nAgora é uma ilha dividida!\n\nCaesar Clown faz experiências em crianças!', falante: 'Trafalgar Law' },
      { id: 'o14_02', texto: '☠️ *Caesar Clown — O Cientista Louco!*\n\n"Eu sou o melhor cientista do mundo!\nO Vegapunk é um impostor!"\n\nCaesar usa gás venenoso!\n\nLuffy: "TU FAZES EXPERIÊNCIAS EM CRIANÇAS?!"', boss: {
        nome: 'Caesar Clown', emoji: '☠️', hp: 3500, atk: 140, def: 55, xp: 1000, coins: 2000,
        habilidades: ['Gasu Gasu no Mi', 'Shinokuni', 'Gastille', 'Oxygen Removal'],
        descricao: 'O cientista que trabalha para Doflamingo. Controla gás.',
      }},
      { id: 'o14_03', texto: '☠️ *Luffy vs Caesar!*\n\nCaesar remove o oxigénio!\n\nMas Luffy não precisa de oxigénio... é de borracha!\n\n"GOMU GOMU NO... ELEPHANT GUN!"\n\n*BOOM!*\n\nCaesar é capturado!', xp: 300, coins: 800 },
      { id: 'o14_04', texto: '🤝 *A Aliança Luffy-Law!*\n\nLaw: "Vamos derrotar Kaido."\n\nLuffy: "COMO?!"\n\nLaw: "Destruindo as fábricas de Smile de Doflamingo em Dressrosa."\n\nLuffy: "OK! VAMOS!"\n\n> 🤝 *Aliança Pirata formada!*\n> ⭐ *Objetivo: Kaido, o Yonkou!*', xp: 200, coins: 500, title: 'Aliado do Coração' },
    ],
    recompensas: { xp: 1500, coins: 3500, title: 'Aliado do Coração' },
  },
  // ═══ ARCO 14: DRESSROSA (Cap 16-18) ═══════════════════════
  {
    id: 'op_ch15', titulo: 'Dressrosa — O Reino dos Brinquedos',
    descricao: 'Doflamingo, o rei tirano. O Coliseu. Gear Fourth!',
    nivel: 33, xp: 800, coins: 2000,
    nodes: [
      { id: 'o15_01', texto: '🎭 *Dressrosa — O Reino das Marionetes!*\n\nDoflamingo controla tudo!\n\nOs humanos viram brinquedos! As pessoas esquecem-se deles!\n\nRebecca luta no Coliseu para salvar o pai!\n\n"Eu preciso de ajuda... Luffy!"', falante: 'Rebecca' },
      { id: 'o15_02', texto: '🏟️ *O Coliseu Corrida!*\n\nLuffy luta contra centenas de guerreiros!\n\nHack. Bellamy. Bartolomeo. Cavendish.\n\nMas o prémio é o Mera Mera no Mi — a fruta de Ace!\n\n"ESSA FRUTA É DO MEU IRMÃO!"', xp: 200, coins: 500 },
      { id: 'o15_03', texto: '🦩 *Doflamingo — O Rei Marionetista!*\n\n"Eu sou Doflamingo! O rei desta ilha!\nEu controlo tudo — até o céu!"\n\nO Ito Ito no Mi permite controlar pessoas como marionetas!\n\n"Vocês são todos os meus brinquedos!"', boss: {
        nome: 'Doflamingo', emoji: '🦩', hp: 6000, atk: 200, def: 80, xp: 2000, coins: 5000,
        habilidades: ['Ito Ito no Mi', 'Birdcage', 'Parasite', 'Overheat', 'Awakening'],
        descricao: 'O rei tirano de Dressrosa. Shichibukai. Controla fios.',
      }},
      { id: 'o15_04', texto: '💥 *GEAR FOURTH — BOUNDMAN!*\n\nLuffy infla os músculos!\n\n"GOMU GOMU NO... KING KONG GUN!"\n\nO punho gigante destrói tudo!\n\nDoflamingo: "QUE PODER É ESSE?!"\n\n*CRASH!*\n\nDressrosa é liberta!', xp: 500, coins: 1500, skill: 'Gear Fourth' },
      { id: 'o15_05', texto: '🎭 *Dressrosa Livre!*\n\nO Birdcage desaparece!\n\nO povo celebra. Rebecca abraça o pai.\n\n"Agora Dressrosa é livre!"\n\n> 🎭 *Dressrosa liberta!*\n> 🏴‍☠️ *A Aliança cresce! 5600 homens!*\n> ⭐ *Rumo a Whole Cake Island!*', xp: 300, coins: 1000, title: 'Libertador de Dressrosa' },
    ],
    recompensas: { xp: 3000, coins: 8000, skill: 'Gear Fourth', title: 'Libertador de Dressrosa' },
  },
  // ═══ ARCO 15: WHOLE CAKE ISLAND (Cap 19-21) ════════════════
  {
    id: 'op_ch16', titulo: 'Whole Cake Island — O Território de Big Mom',
    descricao: 'Sanji é raptado! Big Mom quer casá-lo com a filha! O passado de Sanji!',
    nivel: 36, xp: 1000, coins: 2500,
    nodes: [
      { id: 'o16_01', texto: '🍰 *Whole Cake Island!*\n\nSanji foi raptado pela Yonkou Big Mom!\n\n"Eu preciso do teu casamento, Sanji!"\n\nLuffy: "EU VOU SALVAR O SANJI!"', falante: 'Luffy' },
      { id: 'o16_02', texto: '👨‍🍳 *O Passado de Sanji*\n\nSanji é filho de Judge Vinsmoke!\n\nOs Germas — soldados genéticos!\n\n"Tu és um fracasso, Sanji!"\n\nSanji chora. Mas Luffy está lá.\n\n"Tu és o meu cozinheiro!"', xp: 200, coins: 500 },
      { id: 'o16_03', texto: '🍩 *Katakuri — O Homem que Vê o Futuro!*\n\nCharlotte Katakuri. O doce mais forte!\n\nPode ver 5 segundos no futuro!\n\n"Eu nunca perdi... até hoje!"', boss: {
        nome: 'Charlotte Katakuri', emoji: '🍩', hp: 7000, atk: 220, def: 90, xp: 2500, coins: 6000,
        habilidades: ['Mochi Mochi no Mi', 'Future Sight', 'Buzz Cut Mochi', 'Power Mochi'],
        descricao: 'O doce mais forte de Big Mom. Vê o futuro. Nunca perdeu.',
      }},
      { id: 'o16_04', texto: '🍩 *Luffy vs Katakuri — O Combate Mais Longo!*\n\n12 horas de combate!\n\nLuffy aprende a ver o futuro!\n\n"GOMU GOMU NO... SNAKE MAN!"\n\nKatakuri cai... de pé!\n\n"Porqu-te... tão forte?"\n\n"Porque eu vou ser o Rei dos Piratas!"', xp: 500, coins: 1500, skill: 'Snake Man' },
      { id: 'o16_05', texto: '👨‍🍳 *Sanji Volta!*\n\nSanji faz o bolo de casamento perfeito!\n\nBig Mom come e desmaia!\n\nLuffy foge com Sanji!\n\n"Sanji! VEM PARA CASA!"\n\n"Eu voltei... capitão!"\n\n> 🍰 *Whole Cake Island completa!*\n> 🏴‍☠️ *Sanji está de volta!*', xp: 300, coins: 1000, title: 'Herói de Whole Cake' },
    ],
    recompensas: { xp: 3500, coins: 9000, skill: 'Snake Man', title: 'Herói de Whole Cake' },
  },
  // ═══ ARCO 16: WANO (Cap 22-25) ════════════════════════════
  {
    id: 'op_ch17', titulo: 'Wano — O País dos Samurais',
    descricao: 'O país fechado. Kaido, a Besta. O Raid em Onigashima!',
    nivel: 40, xp: 1500, coins: 3000,
    nodes: [
      { id: 'o17_01', texto: '🌸 *Wano Kuni!*\n\nO país dos samurais! Fechado ao mundo!\n\nKaido controla tudo com as suas Smile!\n\nOshiruko — a comida favorita de Luffy — é proibida!\n\n"QUEM É QUE PROIBE O OSHIRUKO?!"', falante: 'Kinemon' },
      { id: 'o17_02', texto: '🐉 *Kaido — A Besta Mais Forte!*\n\n"Eu sou Kaido! A criatura mais forte do mundo!"\n\nTransforma-se num dragão!\n\nLuffy: "DRAGÃO?! EU VOU DERROTAR-TE!"', boss: {
        nome: 'Kaido', emoji: '🐉', hp: 10000, atk: 280, def: 120, xp: 4000, coins: 10000,
        habilidades: ['Uo Uo no Mi', 'Thunder Bagua', 'Boro Breath', 'Flame Dragon'],
        descricao: 'O Yonkou mais forte. A criatura mais poderosa do mundo.',
      }},
      { id: 'o17_03', texto: '⚔️ *O Raid em Onigashima!*\n\n5000 guerreiros contra Kaido!\n\nOs Scabbards atacam!\n\nLuffy sobe ao telhado!\n\n"KAIDO! EU VOU MANDAR-TE VOAR!"', xp: 400, coins: 1000 },
      { id: 'o17_04', texto: '🐉 *Luffy vs Kaido — A Batalha Épica!*\n\nLuffy usa o Gear Fifth!\n\nO corpo fica branco! Cartoon physics!\n\n"GOMU GOMU NO... BAJRANG GUN!"\n\nO punho do Deus Macaco!\n\n*KAIDO CAI!*\n\nWANO É LIVRE!', xp: 800, coins: 2000, skill: 'Gear Fifth' },
      { id: 'o17_05', texto: '🌸 *Wano Livre!*\n\nMomonosuke torna-se Shogun!\n\nO povo de Wano celebra!\n\nOs fogos de artifício iluminam o céu!\n\n"Obrigado... Luffy!"\n\n> 🌸 *Wano é livre!*\n> 🏆 *Luffy é reconhecido como Yonkou!*\n> ⭐ *O One Piece está mais perto...*', xp: 500, coins: 2000, title: 'Yonkou' },
    ],
    recompensas: { xp: 5000, coins: 15000, skill: 'Gear Fifth', title: 'Yonkou do Chapéu de Palha', item: 'Bajrang Gun' },
  },
  {
    id: 'op_ch18', titulo: 'One Piece — O Rei dos Piratas',
    descricao: 'Laugh Tale. O tesouro de Roger. O sonho de Luffy.',
    nivel: 50, xp: 5000, coins: 20000,
    nodes: [
      { id: 'o18_01', texto: '🏴‍☠️ *Laugh Tale!*\n\nA ilha final! Onde Roger deixou o One Piece!\n\nLuffy abre o baú.\n\nDentro... um chapéu de palha igual ao dele.\n\nE uma carta de Roger:\n\n"Se estás a ler isto... és tão doido como eu.\nO One Piece é..."\n\n> 🏴‍☠️ *MONKEY D. LUFFY É O REI DOS PIRATAS!*\n> 🏆 *Parabéns! Completaste One Piece!*\n> ⭐ *O sonho tornou-se realidade.*', xp: 10000, coins: 50000, title: 'Rei dos Piratas', item: 'One Piece' },
    ],
    recompensas: { xp: 20000, coins: 50000, title: 'Rei dos Piratas', item: 'One Piece' },
  },
];

const SOLOLEVELING_CHAPTERS = [
  // ═══ ARCO 1: O CAÇADOR MAIS FRACO (Cap 1) ══════════════════
  {
    id: 'sl_ch01', titulo: 'O Caçador Mais Fraco do Mundo',
    descricao: 'Portões se abrem. Monstros saem. Caçadores combatem. Tu és o mais fraco de todos.',
    nivel: 10, xp: 150, coins: 400,
    nodes: [
      { id: 's1_01', texto: '🏥 *Hospital de Caçadores — Coreia*\n\nSung Jin-Woo. Rank E. O caçador mais fraco da Coreia.\n\nOs outros riem dele. "Esse gajo vai morrer num portão D."\n\nMas Jin-Woo não desiste. A mãe está doente. A irmã precisa de pagar a faculdade.\n\nEle caça para sobreviver.', falante: 'Sung Jin-Woo' },
      { id: 's1_02', texto: '🚪 *Portão Duplo — Rank C*\n\nUma missão simples. Rank C. Rotina.\n\nMas dentro do portão... outro portão se abre!\n\n"O QUE É ISTO?!"\n\nO Double Dungeon. Um calabouço dentro de um calabouço.\n\nTodos entram. Ninguém sabe que é uma armadilha.', xp: 50, coins: 200 },
      { id: 's1_03', texto: '🗿 *As Estátuas de Pedra*\n\nEstátuas gigantes com olhos vermelhos!\n\n"ADORE AO DEUS OU MORRA!"\n\nAs estátuas começam a matar!\n\nJin-Woo vê os outros a morrerem um a um.\n\n"Eu preciso de sobreviver... pela minha família!"', xp: 30 },
      { id: 's1_04', texto: '💀 *O Sacrifício*\n\nJin-Woo decide ficar para trás.\n\n"Vão! Eu distraio-as!"\n\nAs estátuas destroem-no. O corpo está em pedaços.\n\nMas no momento da morte...\n\n> *Você se tornou o "Player"*\n> *O Sistema foi activado.*', xp: 100, title: 'Player' },
      { id: 's1_05', texto: '📱 *O Sistema*\n\nJin-Woo acorda num hospital.\n\nMas algo mudou. Há uma interface flutuante à sua frente!\n\n┌─────────────────────┐\n│ STATUS               │\n│ Level: 1             │\n│ HP: 100/100          │\n│ STR: 10  DEX: 10    │\n│ INT: 10  VIT: 10    │\n│ Percepção: 10        │\n└─────────────────────┘\n\n"Que... que é isto?"\n\n> 📱 *O Sistema escolheu Jin-Woo!*\n> ⭐ *A partir de agora... tudo muda.*', xp: 150, coins: 500, skill: 'O Sistema' },
    ],
    recompensas: { xp: 500, coins: 1200, title: 'Player', skill: 'O Sistema' },
  },
  // ═══ ARCO 2: TREINO E PRIMEIRO PORTÃO (Cap 2-3) ═══════════
  {
    id: 'sl_ch02', titulo: 'A Missão Diária — Treino ou Morte',
    descricao: 'O Sistema exige treino diário. Falhar = morte. Jin-Woo transforma-se.',
    nivel: 11, xp: 200, coins: 500,
    nodes: [
      { id: 's2_01', texto: '🏋️ *Missão Diária*\n\n┌─────────────────────────┐\n│ MISSÃO DIÁRIA           │\n│ Flexões: 100            │\n│ Abdominais: 100         │\n│ Agachamentos: 100       │\n│ Correr: 10km            │\n│                         │\n│ Prazo: 24 horas         │\n│ Penalidade: MORTE       │\n└─────────────────────────┘\n\n"SE EU FALHAR... MORRO?!"\n\nJin-Woo treina até desmaiar.', xp: 80, coins: 200 },
      { id: 's2_02', texto: '🏋️ *O Corpo Muda*\n\nDepois de semanas de treino brutal...\n\nO corpo de Jin-Woo transforma-se!\n\nMúsculos. Velocidade. Força.\n\n"Eu sou... mais forte?"\n\nO E-Rank agora é mais forte que um C-Rank!', xp: 120, coins: 300 },
      { id: 's2_03', texto: '🚪 *Primeiro Portão Solo — Rank E*\n\nJin-Woo entra num portão sozinho!\n\nGoblins. Aranhas. Lobos.\n\nMas agora... ele é diferente!\n\n"EU VOU MATAR TODOS!"\n\n*SLASH SLASH SLASH!*\n\nNível subiu! 1 → 5!', xp: 150, coins: 400, title: 'Caçador Solo' },
      { id: 's2_04', texto: '⬆️ *Level Up!*\n\n┌─────────────────────┐\n│ LEVEL UP! 1 → 5     │\n│ HP: 250/250          │\n│ STR: 25  DEX: 25    │\n│ INT: 25  VIT: 25    │\n│ Percepção: 25        │\n└─────────────────────┘\n\nO poder cresce exponencialmente!\n\nCada monstro morto = mais força!\n\n> ⬆️ *O treino mais brutal do mundo está a dar frutos!*', xp: 100, coins: 300 },
    ],
    recompensas: { xp: 600, coins: 1500, title: 'Caçador Solo', skill: 'Level Up' },
  },
  // ═══ ARCO 3: BLUE VENOM FANG TIGER (Cap 3) ════════════════
  {
    id: 'sl_ch03', titulo: 'O Tigre de Veneno Azul',
    descricao: 'Um portão C. Um boss que devoraria qualquer E-Rank. Mas Jin-Woo já não é E-Rank.',
    nivel: 13, xp: 300, coins: 800,
    nodes: [
      { id: 's3_01', texto: '🐯 *Portão Rank C — Floresta*\n\nJin-Woo entra num portão C para testar o seu poder.\n\nMonstros Rank C caem com um golpe!\n\n"Estes monstros... são fáceis?"\n\nMas no fundo da floresta... algo se move.', xp: 100, coins: 250 },
      { id: 's3_02', texto: '🐯 *Blue Venom Fang Tiger!*\n\nUm tigre gigante com presas azuis venenosas!\n\nRank B! O boss do portão!\n\n"GRAAAWWWW!"\n\nJin-Woo: "Eu nunca lutei contra um B..."\n\nMas o Sistema mostra: [Vitória: 67%]', boss: {
        nome: 'Blue Venom Fang Tiger', emoji: '🐯', hp: 2000, atk: 90, def: 40, xp: 400, coins: 800,
        habilidades: ['Veneno Azul', 'Garra Mortal', 'Rugido Paralisante'],
        descricao: 'Um boss Rank B. O veneno azul mata em minutos.',
      }},
      { id: 's3_03', texto: '🐯 *Jin-Woo vs Blue Venom Tiger!*\n\nO tigre é rápido! O veneno queima!\n\nMas Jin-Woo usa a Adaga de Pedra!\n\n*SLASH!*\n\nO tigre cai!\n\n"Eu... derrotei um boss Rank B?!"\n\n> 🐯 *Primeiro boss Rank B derrotado!*\n> ⬆️ *Level: 15*', xp: 200, coins: 500, item: 'Presa de Veneno Azul' },
    ],
    recompensas: { xp: 800, coins: 2000, item: 'Presa de Veneno Azul', title: 'Caçador de Bosses' },
  },
  // ═══ ARCO 4: RED GATE (Cap 4) ═════════════════════════════
  {
    id: 'sl_ch04', titulo: 'O Portão Vermelho — Elfos do Gelo',
    descricao: 'Um portão que não fecha. Jin-Woo é preso com um grupo de caçadores fracos.',
    nivel: 15, xp: 400, coins: 1000,
    nodes: [
      { id: 's4_01', texto: '🔴 *Red Gate!*\n\nO portão fica vermelho! Não fecha!\n\n"Estamos presos dentro!"\n\nElfos do gelo atacam! São Rank B!\n\nOs caçadores fracos entram em pânico!\n\nMas Jin-Woo mantém a calma.', xp: 100, coins: 300 },
      { id: 's4_02', texto: '❄️ *Os Elfos do Gelo*\n\nOs elfos são guerreiros ancestrais!\n\nA sua líder é uma elfa com poderes de gelo!\n\n"Humanos... invadiram o nosso mundo..."\n\nJin-Woo: "Eu não quero lutar. Mas preciso de sair."', xp: 100, coins: 250 },
      { id: 's4_03', texto: '❄️ *O Líder dos Elfos*\n\nO General dos Elfos aparece!\n\nRank A! O mais forte do portão!\n\n"NINGUÉM sai daqui!"', boss: {
        nome: 'General dos Elfos do Gelo', emoji: '❄️', hp: 3000, atk: 120, def: 50, xp: 600, coins: 1200,
        habilidades: ['Lança de Gelo', 'Muralha Glacial', 'Grito do Inverno'],
        descricao: 'O General dos Elfos do Gelo. Rank A. Controla o gelo.',
      }},
      { id: 's4_04', texto: '❄️ *Jin-Woo vs General Elfo!*\n\nO gelo congela tudo!\n\nMas Jin-Woo é mais rápido!\n\n*SLASH! SLASH!*\n\nO General cai!\n\nOs elfos rendem-se!\n\nO portão abre!', xp: 300, coins: 700 },
      { id: 's4_05', texto: '⬆️ *O Poder Cresce!*\n\nJin-Woo sai do portão. Os outros caçadores olham para ele.\n\n"Quem... é aquele gajo?"\n\nO Sistema mostra:\n┌─────────────────────┐\n│ Level: 25            │\n│ Rank estimado: A     │\n│ Habilidade desbloq:  │\n│ Summon Shadow        │\n└─────────────────────┘\n\n> ⬆️ *Jin-Woo agora é Rank A!*\n> 👤 *Habilidade desbloqueada: Invocar Sombra!*', xp: 200, coins: 500, skill: 'Invocar Sombra' },
    ],
    recompensas: { xp: 1000, coins: 2500, skill: 'Invocar Sombra', title: 'Caçador Rank A' },
  },
  // ═══ ARCO 5: O CASTELO DEMONÍACO (Cap 5-6) ════════════════
  {
    id: 'sl_ch05', titulo: 'O Castelo Demoníaco — Baran',
    descricao: 'O Sistema revela um calabouço secreto. O Rei Demônio Baran espera no topo.',
    nivel: 18, xp: 600, coins: 1500,
    nodes: [
      { id: 's5_01', texto: '🏰 *O Castelo Demoníaco*\n\nO Sistema revela um calabouço secreto!\n\n"Calabouço Especial desbloqueado!"\n\n100 andares de demónios!\n\nCada andar é mais difícil que o anterior!', xp: 100, coins: 300 },
      { id: 's5_02', texto: '👹 *Os Demónios*\n\nAndar 1 a 50: demónios Rank C a B.\n\nJin-Woo limpa tudo!\n\nAs suas sombras crescem:\n- Igris (Cavaleiro Sombrio)\n- Tank (Urso Sombrio)\n- Iron (Guerreiro Sombrio)\n\nO exército das sombras começa!', xp: 200, coins: 500 },
      { id: 's5_03', texto: '⚔️ *Igris — O Cavaleiro Vermelho!*\n\nNo andar 50, um cavaleiro vermelho bloqueia o caminho!\n\nRank S! O guarda-costas de Baran!\n\n"NINGUÉM PASSA!"', boss: {
        nome: 'Igris, o Cavaleiro Vermelho', emoji: '⚔️', hp: 5000, atk: 180, def: 80, xp: 1000, coins: 2000,
        habilidades: ['Espada Vermelha', 'Corte Sombrio', 'Carga do Cavaleiro'],
        descricao: 'O guarda-costas de Baran. Um cavaleiro das trevas.',
      }},
      { id: 's5_04', texto: '⚔️ *Jin-Woo vs Igris!*\n\nIgris é incrivelmente rápido!\n\nA espada vermelha corta o ar!\n\nMas Jin-Woo usa as sombras!\n\n"SOMBRA: ARISE!"\n\nIgris é derrotado... e ressuscita como sombra!\n\n"Eu... vou servir-te, Mestre."', xp: 400, coins: 1000, skill: 'Igris (Sombra)' },
      { id: 's5_05', texto: '👑 *Baran — O Rei Demônio Branco!*\n\nAndar 100. O trono.\n\nBaran. O Rei Demônio.\n\n"Tu... és o novo Monarca?"\n\n"Eu sou Sung Jin-Woo. E eu vou derrotar-te!"', boss: {
        nome: 'Baran, Rei Demônio', emoji: '👑', hp: 8000, atk: 220, def: 100, xp: 2000, coins: 5000,
        habilidades: ['Lança de Baran', 'Tempestade de Relâmpagos', 'Exército Demoníaco', 'Dragon Fear'],
        descricao: 'O Rei Demônio Branco. O chefe final do Castelo Demoníaco.',
      }},
      { id: 's5_06', texto: '👑 *Jin-Woo vs Baran — Batalha Final!*\n\nBaran convoca o seu exército!\n\nMas Jin-Woo tem o seu próprio exército!\n\n"SOMBRA: ARISE! ARISE! ARISE!"\n\nDezenas de sombras vs demónios!\n\nJin-Woo avança. Corta Baran ao meio!\n\n"O Rei Demônio... caiu!"', xp: 600, coins: 2000, skill: 'Dragon Fear', title: 'Matador de Reis Demônios' },
    ],
    recompensas: { xp: 2500, coins: 6000, skill: 'Exército das Sombras', title: 'Matador de Reis Demônios' },
  },
  // ═══ ARCO 6: JEJU ISLAND (Cap 7-8) ════════════════════════
  {
    id: 'sl_ch06', titulo: 'A Ilha de Jeju — A Raid Mais Mortal',
    descricao: 'Formigas gigantes evoluíram. A Coreia, o Japão e os EUA unem-se para a raid.',
    nivel: 22, xp: 800, coins: 2000,
    nodes: [
      { id: 's6_01', texto: '🐜 *A Ameaça das Formigas*\n\nNa Ilha de Jeju, formigas gigantes evoluíram!\n\nSão Rank A a S! Milhares delas!\n\nA Coreia convoca os melhores caçadores!\n\nJin-Woo é convidado... mas os outros não confiam nele.', xp: 150, coins: 400 },
      { id: 's6_02', texto: '🐜 *A Raid Começa!*\n\nEquipes entram na ilha!\n\nFormigas por todo o lado!\n\nMas Jin-Woo limpa tudo sozinho!\n\n"As formigas... são fáceis para mim?"\n\nOs outros caçadores ficam em choque!', xp: 200, coins: 500 },
      { id: 's6_03', texto: '👑 *A Rainha das Formigas!*\n\nA Rainha aparece! Rank S!\n\nEla controla todas as formigas!\n\n"Humanos... são a minha comida!"', boss: {
        nome: 'Rainha das Formigas', emoji: '👑', hp: 6000, atk: 200, def: 90, xp: 1500, coins: 3000,
        habilidades: ['Controle de Formigas', 'Rainha Hive Mind', 'Evolução Rápida'],
        descricao: 'A Rainha das Formigas de Jeju. Controla milhares de formigas.',
      }},
      { id: 's6_04', texto: '👑 *O Rei das Formigas!*\n\nA Rainha é derrotada... mas o Rei aparece!\n\nRank SSS! O monstro mais forte já visto!\n\n"Eu sou o Rei... e este mundo é meu!"', boss: {
        nome: 'Rei das Formigas', emoji: '🐜', hp: 12000, atk: 300, def: 120, xp: 3000, coins: 8000,
        habilidades: ['Telepatia', 'Destruição Massiva', 'Exército de Formigas', 'Evolução Final'],
        descricao: 'O Rei das Formigas. Rank SSS. Quase invencível.',
      }},
      { id: 's6_05', texto: '🐜 *Jin-Woo vs Rei das Formigas!*\n\nA batalha mais difícil até agora!\n\nO Rei é rápido demais!\n\nMas Jin-Woo usa Igris + o exército das sombras!\n\n"SOMBRA: ARISE!"\n\nO Rei cai! E torna-se sombra!\n\n> 🐜 *Jeju Island salva!*\n> ⭐ *Jin-Woo é o caçador mais forte da Coreia!*\n> 👤 *Exército: 130 sombras!*', xp: 800, coins: 3000, skill: 'Rei das Sombras', title: 'Caçador Nacional' },
    ],
    recompensas: { xp: 3500, coins: 10000, skill: 'Rei das Sombras', title: 'Caçador Nacional' },
  },
  // ═══ ARCO 7: THOMAS ANDRE (Cap 9-10) ═══════════════════════
  {
    id: 'sl_ch07', titulo: 'O Caçador Nacional dos EUA — Thomas Andre',
    descricao: 'O caçador mais forte dos EUA desafia Jin-Woo. A rivalidade explode.',
    nivel: 26, xp: 1000, coins: 2500,
    nodes: [
      { id: 's7_01', texto: '🇺🇸 *Thomas Andre — O Gigante dos EUA!*\n\n"Tu és o famoso coreano? Mostre-me o que tens!"\n\nThomas Andre. Rank Nacional. O mais forte dos EUA.\n\nEle não respeita ninguém.\n\nJin-Woo: "Tu não me provoques."', falante: 'Thomas Andre' },
      { id: 's7_02', texto: '💪 *Jin-Woo vs Thomas Andre!*\n\nO combate destrói um edifício inteiro!\n\nThomas é forte... mas Jin-Woo é mais!\n\n"SOMBRA: ARISE!"\n\nThomas é derrotado!\n\n"Impossível... eu sou o mais forte...!"', boss: {
        nome: 'Thomas Andre', emoji: '💪', hp: 10000, atk: 280, def: 110, xp: 2500, coins: 6000,
        habilidades: ['Super Strength', 'Titan Mode', 'Regeneração', 'National Level'],
        descricao: 'O caçador mais forte dos EUA. National Level Hunter.',
      }},
      { id: 's7_03', texto: '🏆 *O Mais Forte do Mundo!*\n\nA notícia espalha-se:\n\n"Um coreano derrotou Thomas Andre!"\n\nO mundo inteiro conhece o nome:\n\nSUNG JIN-WOO.\n\n> 🏆 *Jin-Woo é reconhecido mundialmente!*\n> ⭐ *Mas a verdadeira ameaça está a chegar...*', xp: 500, coins: 1500, title: 'Caçador de Classe Nacional' },
    ],
    recompensas: { xp: 3000, coins: 8000, title: 'Caçador de Classe Nacional' },
  },
  // ═══ ARCO 8: OS MONARCAS (Cap 11-13) ═══════════════════════
  {
    id: 'sl_ch08', titulo: 'Os Monarcas — A Guerra Dimensional',
    descricao: 'Os Monarcas de outras dimensões invadem a Terra. Jin-Woo descobre o seu destino.',
    nivel: 30, xp: 1500, coins: 4000,
    nodes: [
      { id: 's8_01', texto: '🌀 *A Invasão Começa!*\n\nPortões se abrem por todo o mundo!\n\nMonarcas de outras dimensões invadem!\n\n- Monarca das Bestas\n- Monarca do Gelo\n- Monarca das Chamas\n\n"Este mundo... vai ser nosso!"', xp: 200, coins: 500 },
      { id: 's8_02', texto: '👤 *O Arquiteto Revela a Verdade!*\n\nO Arquiteto do Sistema aparece!\n\n"Jin-Woo... tu és o sucessor do Monarca das Sombras!"\n\n"O teu pai... era o Monarca anterior!"\n\n"O Sistema foi criado para te preparar!"', falante: 'Arquiteto' },
      { id: 's8_03', texto: '⚔️ *O Monarca das Bestas!*\n\nO primeiro Monarca ataca!\n\nRank Nacional x 10! Poder incompreensível!\n\n"Humanos são insetos para mim!"', boss: {
        nome: 'Monarca das Bestas', emoji: '🦁', hp: 15000, atk: 350, def: 150, xp: 4000, coins: 10000,
        habilidades: ['Controle de Bestas', 'Fúria Primitiva', 'Exército Animal', 'Roar Dimensional'],
        descricao: 'O Monarca das Bestas. Controla criaturas de 100 dimensões.',
      }},
      { id: 's8_04', texto: '🦁 *Jin-Woo vs Monarca das Bestas!*\n\nO exército das sombras vs o exército animal!\n\nMilhares de soldados de cada lado!\n\nJin-Woo avança. Corta o Monarca!\n\n"SOMBRA: ARISE!"\n\nO Monarca... torna-se sombra!', xp: 800, coins: 2000 },
      { id: 's8_05', texto: '⚡ *O Monarca das Chamas!*\n\nO segundo Monarca aparece!\n\nFogo que destrói cidades inteiras!\n\n"Eu vou queimar este mundo até às cinzas!"', boss: {
        nome: 'Monarca das Chamas', emoji: '🔥', hp: 18000, atk: 400, def: 140, xp: 5000, coins: 12000,
        habilidades: ['Chama Eterna', 'Ocean de Fogo', 'Explosão Solar', 'Exército de Fogo'],
        descricao: 'O Monarca das Chamas. O fogo que consome mundos.',
      }},
      { id: 's8_06', texto: '🔥 *Jin-Woo vs Monarca das Chamas!*\n\nO fogo queima tudo!\n\nMas Jin-Woo usa as sombras para se proteger!\n\n"SOMBRA: DOME!"\n\nA sombra bloqueia o fogo!\n\nJin-Woo avança e corta!\n\n"Os Monarcas... não são invencíveis!"', xp: 1000, coins: 3000 },
      { id: 's8_07', texto: '❄️ *O Monarca do Gelo!*\n\nO terceiro Monarca congela o mundo!\n\nTemperatura: -200°C!\n\n"Este mundo vai ser o meu trono de gelo!"', boss: {
        nome: 'Monarca do Gelo', emoji: '❄️', hp: 20000, atk: 380, def: 160, xp: 5000, coins: 12000,
        habilidades: ['Zero Absoluto', 'Glaciar Eterno', 'Exército de Gelo', 'Congelamento Total'],
        descricao: 'O Monarca do Gelo. O frio que congela o tempo.',
      }},
      { id: 's8_08', texto: '❄️ *Jin-Woo vs Monarca do Gelo!*\n\nO frio congela as sombras!\n\nMas Jin-Woo aquece com o poder do Monarca das Chamas!\n\n"Eu absorvi o teu poder!"\n\nFogo vs Gelo!\n\nO Monarca do Gelo... derrete!', xp: 1000, coins: 3000 },
      { id: 's8_09', texto: '👤 *O Monarca das Sombras Desperta!*\n\nJin-Woo absorveu os poderes dos 3 Monarcas!\n\nO corpo brilha de poder!\n\n"EU SOU O MONARCA DAS SOMBRAS!"\n\nO exército das sombras: 10.000 soldados!\n\n> 👤 *Sung Jin-Woo é o Monarca das Sombras!*\n> ⭐ *O poder supremo foi alcançado!*', xp: 2000, coins: 5000, title: 'Monarca das Sombras', skill: 'Exército de 10.000 Sombras' },
    ],
    recompensas: { xp: 8000, coins: 25000, title: 'Monarca das Sombras', skill: 'Exército de 10.000 Sombras' },
  },
  // ═══ ARCO 9: ANTARES — O REI DOS DRAGÕES (Cap 14-15) ═══════
  {
    id: 'sl_ch09', titulo: 'Antares — O Rei dos Dragões',
    descricao: 'O Monarca mais forte. O dragão que destrói mundos. A batalha final.',
    nivel: 40, xp: 3000, coins: 8000,
    nodes: [
      { id: 's9_01', texto: '🐉 *A Última Invasão!*\n\nO céu parte-se ao meio!\n\nUm dragão colossal aparece!\n\nANTARES — O Rei dos Dragões!\n\nO Monarca mais forte de todas as dimensões!\n\n"Este mundo... vai ser a minha última conquista."', falante: 'Antares' },
      { id: 's9_02', texto: '🐉 *O Poder de Antares!*\n\nAntares destrói uma cidade inteira com o sopro!\n\nOs caçadores mais fortes do mundo não conseguem fazer nada!\n\nThomas Andre: "Ele é... impossível..."\n\nSó Jin-Woo pode pará-lo!', xp: 300, coins: 800 },
      { id: 's9_03', texto: '🐉 *Jin-Woo vs Antares — A BATALHA FINAL!*\n\n10.000 sombras vs o exército de dragões!\n\nJin-Woo voa nas costas do dragão sombrio!\n\n"SOMBRA: ARISE!"\n\nMas Antares é forte demais!\n\n"EU SOU O REI DOS DRAGÕES! NINGUÉM ME DERROTA!"', boss: {
        nome: 'Antares, Rei dos Dragões', emoji: '🐉', hp: 30000, atk: 500, def: 200, xp: 10000, coins: 30000,
        habilidades: ['Sopro Destruidor', 'Voo Supremo', 'Exército de Dragões', 'Breath of Destruction', 'Dragon Fear Supremo'],
        descricao: 'O Monarca mais forte. O Rei dos Dragões. O fim de todos os mundos.',
      }},
      { id: 's9_04', texto: '🐉 *O Golpe Final!*\n\nJin-Woo reúne todo o seu poder!\n\nTodas as sombras! Todos os Monarcas absorvidos!\n\n"ANTARES! ESTA É A MINHA PROMESSA!"\n\n"SOMBRA: ARRIIIIISE!"\n\nO exército das sombras avança!\n\nJin-Woo perfura Antares com a Espada do Monarca!\n\n*EXPLOSAO DIMENSIONAL!*\n\nAntares cai!\n\n> 🐉 *ANTARES DERROTADO!*\n> 🏆 *A GUERRA DIMENSIONAL ACABOU!*\n> 👤 *Jin-Woo é o Monarca Supremo!*', xp: 5000, coins: 15000, title: 'Monarca Supremo', item: 'Espada de Antares' },
      { id: 's9_05', texto: '🌅 *O Novo Mundo!*\n\nA guerra acabou. Os portões fecham.\n\nJin-Woo olha para o céu.\n\n"Pai... eu cumpri a tua missão."\n\nO mundo é livre. Os Monarcas foram derrotados.\n\nJin-Woo sorri.\n\n"Eu era o caçador mais fraco do mundo..."\n"...e agora sou o mais forte."\n\n> 🌅 *FIM — Solo Leveling completo!*\n> 🏆 *Sung Jin-Woo — O Monarca das Sombras!*\n> ⭐ *Do zero ao absoluto.*', xp: 3000, coins: 10000, title: 'Lenda Suprema' },
    ],
    recompensas: { xp: 15000, coins: 40000, title: 'Monarca Supremo', item: 'Espada de Antares', skill: 'Poder Absoluto' },
  },
];

const JJK_CHAPTERS = [
  {
    id: 'jjk_ch01', titulo: 'O Dedo de Sukuna',
    descricao: 'Itadori Yuji engole o dedo do Rei das Maldições. A sua vida muda para sempre.',
    nivel: 15, xp: 200, coins: 500,
    nodes: [
      { id: 'j1_01', texto: '🏫 *Escola Secundária de Sendai*\n\nItadori Yuji é o atleta mais forte da escola. Mas hoje...\n\nO clã oculto do seu avô moribundo deixa-lhe um dedo humano.\n\n"E não o abras..." — são as últimas palavras do avô.', falante: 'Yuji' },
      { id: 'j1_02', texto: '👁️ *A Maldição!*\n\nUma maldição ataca a escola! Megumi Fushiguro aparece!\n\n"Esse dedo... é de Sukuna! O Rei das Maldições!"\n\nYuji engole o dedo para salvar os amigos!', xp: 100, coins: 200 },
      { id: 'j1_03', texto: '👁️ *Sukuna Desperta!*\n\nYuji transforma-se! Dois rostos! Olhos vermelhos!\n\n"Eu sou Ryomen Sukuna... o Rei das Maldições!"\n\nMas Yuji recupera o controlo!\n\nSatoru Gojo aparece. "Interessante... ele consegue conter Sukuna?"', falante: 'Gojo' },
      { id: 'j1_04', texto: '👁️ *A Decisão de Gojo*\n\nGojo: "Yuji... vais morrer. Ou vais viver e comer todos os dedos de Sukuna?"\n\n"Eu prefiro morrer como humano!"\n\nGojo sorri. "Então... vamos ao colégio de Jujutsu!"\n\n> 👁️ *Itadori Yuji torna-se um feiticeiro jujutsu!*', xp: 150, coins: 300, title: 'Recipiente de Sukuna' },
    ],
    recompensas: { xp: 600, coins: 1200, title: 'Recipiente de Sukuna' },
  },
  {
    id: 'jjk_ch02', titulo: 'O Colégio de Jujutsu',
    descricao: 'Gojo Sensei. Nobara. Megumi. A trio mais desequilibrada.',
    nivel: 16, xp: 250, coins: 600,
    nodes: [
      { id: 'j2_01', texto: '🏛️ *Colégio de Jujutsu de Tóquio*\n\nGojo apresenta:\n- Megumi Fushiguro — Ten Shadows\n- Nobara Kugisaki — Straw Doll\n- Yuji Itadori — Sukuna\n\n"Vocês são a minha turma favorita!"', falante: 'Gojo' },
      { id: 'j2_02', texto: '🪆 *Nobara, a Rainha!*\n\n"Eu sou Nobara! Bonita, forte e com mau feitio!"\n\nUsa bonecos de palha e pregos amaldiçoados.\n\n"Ninguém me controla!"', falante: 'Nobara' },
      { id: 'j2_03', texto: '🐺 *Missão: Maldição de Grau Especial!*\n\nUma maldição de Grau Especial aparece num hospital!\n\nYuji e Nobara enfrentam-na juntos!', boss: { nome: 'Maldição do Hospital', emoji: '🐺', hp: 3000, atk: 130, def: 50, xp: 500, coins: 1000, habilidades: ['Domínio do Hospital', 'Cura Maligna', 'Grito Paralisante'], descricao: 'Uma maldição nascida do medo dos pacientes.' }},
      { id: 'j2_04', texto: '👊 *Punho Divergente!*\n\nYuji combate corpo a corpo! A maldição cai!\n\n"Vamos! Juntos somos mais fortes!"\n\n> 🏛️ *Primeira missão completa!*', xp: 200, coins: 400, title: 'Feiticeiro Iniciante' },
    ],
    recompensas: { xp: 700, coins: 1500, title: 'Feiticeiro Iniciante' },
  },
  {
    id: 'jjk_ch03', titulo: 'O Incidente de Yasohachi Bridge',
    descricao: 'Junpei. Mahito. A crueldade das maldições.',
    nivel: 18, xp: 300, coins: 800,
    nodes: [
      { id: 'j3_01', texto: '🌊 *Junpei Yoshino*\n\nUm estudante isolado. Mahito encontra-o.\n\n"Eu posso dar-te poder... para vingar a tua mãe."\n\nMahito transforma pessoas em maldições. É o pior dos piores.', falante: 'Mahito' },
      { id: 'j3_02', texto: '💀 *Mahito — A Maldição Humana!*\n\n"Eu sou Mahito. Nasci do ódio dos humanos contra humanos."\n\nA sua técnica: Idle Transfiguration. Muda a forma da alma!\n\nJunpei é transformado em maldição!', boss: { nome: 'Mahito', emoji: '💀', hp: 4000, atk: 150, def: 60, xp: 800, coins: 2000, habilidades: ['Idle Transfiguration', 'Polymorphic Soul', 'Body Repel'], descricao: 'A maldição que nasceu do ódio humano.' }},
      { id: 'j3_03', texto: '👊 *Yuji vs Mahito!*\n\nYuji tenta salvar Junpei... mas é tarde!\n\n"MAHITO! EU VOU MATAR-TE!"\n\nGojo aparece e salva Yuji. Mas foge.\n\n> 💀 *Junpei morreu... Mahito vai pagar.*', xp: 250, coins: 600, title: 'Vingança Prometida' },
    ],
    recompensas: { xp: 900, coins: 2000, title: 'Vingança Prometida' },
  },
  {
    id: 'jjk_ch04', titulo: 'O Evento de Troca — Kyoto',
    descricao: 'Feiticeiros de Tóquio vs Kyoto. Todo quer matar Yuji!',
    nivel: 20, xp: 400, coins: 1000,
    nodes: [
      { id: 'j4_01', texto: '⚔️ *Evento de Troca entre Escolas!*\n\nTóquio vs Kyoto! Os melhores feiticeiros!\n\nAoi Todo de Kyoto: "Yuji! Vou matar-te!"\n\nMas Todo muda de ideias depois de lutar!', falante: 'Todo' },
      { id: 'j4_02', texto: '👊 *Yuji vs Todo — Irmãos de Alma!*\n\nTodo é o mais forte de Kyoto!\n\nMas depois de ver a determinação de Yuji:\n\n"Tu és o meu melhor amigo! Vamos treinar juntos!"\n\nTodo torna-se o mentor de Yuji!', xp: 300, coins: 600, skill: 'Black Flash' },
      { id: 'j4_03', texto: '⚡ *Black Flash!*\n\nYuji executa o Black Flash pela primeira vez!\n\nO impacto distorce o espaço!\n\n*CRACK!*\n\nTodo sorri. "Excelente...!"', xp: 400, coins: 800, skill: 'Black Flash' },
      { id: 'j4_04', texto: '💀 *A Invasão de Hanami!*\n\nHanami — uma maldição de Grau Especial — invade!\n\nTodos unem-se para lutar!', boss: { nome: 'Hanami', emoji: '🌿', hp: 5000, atk: 180, def: 70, xp: 1000, coins: 2500, habilidades: ['Domínio da Floresta', 'Disaster Plants', 'Wooden Ball'], descricao: 'A maldição da natureza. Quer eliminar a humanidade.' }},
      { id: 'j4_05', texto: '🌿 *Gojo Satoru — O Mais Forte!*\n\nGojo aparece!\n\n"Vocês aborrecem-me."\n\nUsa o Infinito. Hanami recua.\n\n"Eu sou o mais forte. Nunca se esqueçam."\n\n> ⚔️ *Evento de Troca termina com vitória de Tóquio!*', xp: 300, coins: 700, title: 'Feiticeiro de Grau 1' },
    ],
    recompensas: { xp: 1500, coins: 3500, skill: 'Black Flash', title: 'Feiticeiro de Grau 1' },
  },
  {
    id: 'jjk_ch05', titulo: 'A Queda de Gojo',
    descricao: 'O plano de Geto. O selamento de Gojo. O mundo perde o seu guarda.',
    nivel: 25, xp: 600, coins: 1500,
    nodes: [
      { id: 'j5_01', texto: '👁️ *O Incidente de Shibuya!*\n\nAs maldições atacam Shibuya! É uma armadilha para Gojo!\n\nMahito, Jogo, Hanami, Dagon — todos juntos!\n\n"Eles querem selar o Gojo!"', xp: 200 },
      { id: 'j5_02', texto: '👁️ *Gojo vs Todos!*\n\nGojo enfrenta 4 Graus Especiais ao mesmo tempo!\n\n"Infinito... é o poder de um deus."\n\nMas... o Prison Realm! O selo ancestral!', boss: { nome: 'Jogo + Hanami + Dagon', emoji: '👁️', hp: 8000, atk: 250, def: 100, xp: 2000, coins: 5000, habilidades: ['Domínio Combinado', 'Disaster Trio', 'Maximum: Meteor'], descricao: 'Três Graus Especiais contra o mais forte.' }},
      { id: 'j5_03', texto: '💀 *Gojo é Selado!*\n\nO Prison Realm ativa-se!\n\n"GOJO-SENSEI! NÃO!"\n\nGojo desaparece. O mundo fica sem o seu protetor.\n\n> 💀 *Satoru Gojo foi selado...*', xp: 300, coins: 800 },
      { id: 'j5_04', texto: '🔥 *A Rebelião de Geto!*\n\nSuguru Geto (ou alguém que parece) lidera a revolta!\n\n"Sem Gojo... o mundo das maldições vai mudar!"\n\nYuji: "Eu vou salvar o Gojo!"', xp: 300, coins: 600, title: 'Feiticeiro Rebelde' },
    ],
    recompensas: { xp: 1800, coins: 4500, title: 'Sobrevivente de Shibuya' },
  },
  {
    id: 'jjk_ch06', titulo: 'A Guerra contra as Maldições',
    descricao: 'Sem Gojo, os feiticeiros lutam sozinhos.',
    nivel: 28, xp: 800, coins: 2000,
    nodes: [
      { id: 'j6_01', texto: '⚔️ *A Culling Game!*\n\nKenjaku (a verdadeira mente por trás) ativa o jogo!\n\nFeiticeiros e maldições presos em barreiras!\n\n"Matem para sobreviver!"', xp: 300 },
      { id: 'j6_02', texto: '👁️ *Megumi descende nas Sombras!*\n\nMegumi usa o Mahoraga — o Shikigami mais forte!\n\nMas o preço é a sua própria vida...\n\nYuji: "MEGUMI! NÃO!"', xp: 200, coins: 500 },
      { id: 'j6_03', texto: '💀 *Mahito vs Yuji — O Combate Final!*\n\nYuji enfrenta Mahito de novo!\n\n"Tu mataste o Junpei! Tu vais pagar!"\n\nMahito: "Humanos são todos iguais... fracos!"', boss: { nome: 'Mahito (Forma Verdadeira)', emoji: '💀', hp: 10000, atk: 280, def: 100, xp: 3000, coins: 7000, habilidades: ['Soul Multiplicity', 'Instant Spirit Body', 'Domain Expansion: Self-Embodiment'], descricao: 'Mahito na sua forma mais forte.' }},
      { id: 'j6_04', texto: '👊 *Yuji derrota Mahito!*\n\n"Eu não sou tu! Eu protejo os meus amigos!"\n\nMahito é derrotado!\n\n> 👊 *Mahito foi destruído!*', xp: 800, coins: 2000, title: 'Destruidor de Maldições' },
    ],
    recompensas: { xp: 2500, coins: 6000, title: 'Destruidor de Maldições' },
  },
  {
    id: 'jjk_ch07', titulo: 'Sukuna Assume o Controlo',
    descricao: 'O Rei das Maldições desperta verdadeiramente.',
    nivel: 32, xp: 1000, coins: 3000,
    nodes: [
      { id: 'j7_01', texto: '👁️ *Sukuna Toma o Corpo!*\n\nYuji perde o controlo! Sukuna assume!\n\n"Eu sou o Rei das Maldições! Este corpo é meu!"\n\nMegumi tenta parar... mas Sukuna é forte demais!', falante: 'Sukuna' },
      { id: 'j7_02', texto: '👁️ *Domain Expansion: Malevolent Shrine!*\n\nSukuna ativa o seu Domínio!\n\nMil lâminas cortam tudo!\n\nNinguém pode escapar!', xp: 500, coins: 1500, skill: 'Malevolent Shrine' },
      { id: 'j7_03', texto: '👁️ *Sukuna vs Todos os Feiticeiros!*', boss: { nome: 'Sukuna (20 Dedos)', emoji: '👁️', hp: 20000, atk: 500, def: 200, xp: 8000, coins: 20000, habilidades: ['Cleave', 'Dismantle', 'Malevolent Shrine', 'Fire Arrow'], descricao: 'O Rei das Maldições com poder total.' }},
      { id: 'j7_04', texto: '💀 *O Sacrifício Final!*\n\nYuji luta dentro do próprio corpo!\n\n"SUKUNA! EU VOU DERROTAR-TE DE DENTRO!"\n\nMas Sukuna é forte demais...\n\n> 💀 *Sukuna conquistou o corpo de Yuji...*', xp: 500, coins: 1500 },
    ],
    recompensas: { xp: 3500, coins: 9000, title: 'Recipiente Perdido' },
  },
  {
    id: 'jjk_ch08', titulo: 'Gojo Libertado',
    descricao: 'O selo é quebrado. O mais forte regressa.',
    nivel: 35, xp: 1200, coins: 3500,
    nodes: [
      { id: 'j8_01', texto: '👁️ *O Prison Realm é quebrado!*\n\nYuji e Megumi encontram o selo!\n\n"GOJO-SENSEI! ESTAMOS AQUI!"\n\nO selo parte-se. Luz azul inunda tudo!', xp: 400 },
      { id: 'j8_02', texto: '👁️ *Gojo Satoru — O Mais Forte!*\n\nGojo aparece. Mais forte que nunca.\n\n"Saudades. O que perdi?"\n\nYuji: "Tudo. Tudo mudou."\n\nGojo: "Então... vamos mudar de volta."', falante: 'Gojo' },
      { id: 'j8_03', texto: '👁️ *Gojo vs Sukuna — O Combate Supremo!*', boss: { nome: 'Gojo Satoru', emoji: '👁️', hp: 25000, atk: 600, def: 250, xp: 10000, coins: 25000, habilidades: ['Infinity', 'Hollow Purple', 'Domain Expansion: Unlimited Void', 'Six Eyes'], descricao: 'O feiticeiro mais forte de todos os tempos.' }},
      { id: 'j8_04', texto: '👁️ *Gojo vs Sukuna — O Infinito vs O Rei!*\n\nA batalha mais épica da história!\n\nGojo usa o Hollow Purple!\n\nSukuna contra-ataca com Cleave!\n\nO mundo treme!\n\n> 👁️ *A batalha mais intensa da história...*', xp: 1000, coins: 3000, title: 'Testemunha do Infinito' },
    ],
    recompensas: { xp: 4500, coins: 12000, title: 'Testemunha do Infinito' },
  },
  {
    id: 'jjk_ch09', titulo: 'O Preço da Vitória',
    descricao: 'Gojo cai. Os alunos continuam a luta.',
    nivel: 38, xp: 1500, coins: 4000,
    nodes: [
      { id: 'j9_01', texto: '💀 *Gojo Cai!*\n\nSukuna usa uma técnica que nem Gojo esperava!\n\n"O mais forte... caiu."\n\nO mundo perde o seu herói.\n\nYuji chora. Mas não desiste.', xp: 300, coins: 800 },
      { id: 'j9_02', texto: '🔥 *A Última Esperança!*\n\nYuji, Megumi, Nobara, Todo, Maki — todos juntos!\n\n"GOJO-SENSEI ACREDITOU EM NÓS! NÃO VAMOS FALHAR!"\n\nA nova geração levanta-se!', xp: 400, coins: 1000 },
      { id: 'j9_03', texto: '👊 *Yuji vs Sukuna — Round Final!*', boss: { nome: 'Sukuna (Forma Final)', emoji: '👁️', hp: 30000, atk: 700, def: 280, xp: 12000, coins: 30000, habilidades: ['World Cutting Slash', 'Malevolent Shrine', 'Fire Arrow', 'Reverse Cursed Technique'], descricao: 'Sukuna no seu poder supremo.' }},
      { id: 'j9_04', texto: '👊 *O Punho Final!*\n\nYuji reúne todo o seu poder!\n\nCada amigo. Cada perda. Cada momento.\n\n"EU SOU ITADORI YUJI! E EU VOU PROTEGER O MUNDO!"\n\n*BLACK FLASH FINAL!*\n\nSukuna cai!', xp: 2000, coins: 5000, title: 'Herói de Jujutsu' },
    ],
    recompensas: { xp: 5000, coins: 15000, title: 'Herói de Jujutsu' },
  },
  {
    id: 'jjk_ch10', titulo: 'O Novo Mundo',
    descricao: 'Sem maldições. Sem sofrimento. O mundo que Gojo sonhou.',
    nivel: 40, xp: 2000, coins: 5000,
    nodes: [
      { id: 'j10_01', texto: '🌅 *O Mundo Depois*\n\nAs maldições desaparecem. O mundo é livre.\n\nYuji olha para o céu.\n\n"Avô... eu cumpri a promessa."\n\nMegumi sorri. Nobara ri-se.\n\nGojo, do além, acena.\n\n> 🌅 *FIM — Jujutsu Kaisen completo!*\n> 🏆 *Itadori Yuji salvou o mundo!*\n> ⭐ *A geração mais forte.*', xp: 5000, coins: 15000, title: 'Lenda de Jujutsu', item: 'Olho de Sukuna' },
    ],
    recompensas: { xp: 10000, coins: 30000, title: 'Lenda de Jujutsu', item: 'Olho de Sukuna' },
  },
];

const DRAGONBALL_CHAPTERS = [
  {
    id: 'db_ch01', titulo: 'O Rapaz da Cauda',
    descricao: 'Montanha Paozu. Um rapaz com cauda de macaco vive sozinho ate Bulma aparecer.',
    nivel: 20, xp: 300, coins: 800,
    nodes: [
      { id: 'd1_01', texto: '🐉 *Montanha Paozu*\n\nUm rapaz de 12 anos com cauda vive sozinho. Pesca, treina e come. Muito.\n\n"Eu sou Son Goku!"', falante: 'Goku' },
      { id: 'd1_02', texto: '🔮 *Bulma e as Esferas do Dragao!*\n\n"EU SOU BULMA! Procuro as 7 Esferas do Dragao!"\n\nGoku: "Que fixe! Eu vou contigo!"', falante: 'Bulma' },
      { id: 'd1_03', texto: '🐢 *Mestre Roshi*\n\nGoku treina com o velho pervertido durante 8 meses!\n\nDepois entra no 21o Torneio de Artes Marciais!', xp: 200, coins: 500, item: 'Kinton' },
    ],
    recompensas: { xp: 800, coins: 2000, item: 'Kinton', title: 'Lutador de Torneio' },
  },
  {
    id: 'db_ch02', titulo: 'O Rei Piccolo',
    descricao: 'O demónio mais antigo desperta. Goku precisa de vinganca.',
    nivel: 22, xp: 400, coins: 1000,
    nodes: [
      { id: 'd2_01', texto: '💀 *Krillin Morreu!*\n\nO demónio mais antigo do mundo despertou!', xp: 100 },
      { id: 'd2_02', texto: '👹 *Goku vs Rei Piccolo!*', boss: { nome: 'Rei Piccolo', emoji: '👹', hp: 4000, atk: 150, def: 60, xp: 800, coins: 2000, habilidades: ['Makankosappo', 'Explosao Demoníaca'], descricao: 'O demónio mais antigo do mundo.' }},
      { id: 'd2_03', texto: '🏆 *Goku vence e torna-se Campeao Mundial!*', xp: 300, title: 'Campeao Mundial' },
    ],
    recompensas: { xp: 1200, coins: 3000, title: 'Campeao Mundial' },
  },
  {
    id: 'db_ch03', titulo: 'A Chegada dos Saiyajins',
    descricao: 'Raditz revela a verdade: Goku e um Saiyajin!',
    nivel: 25, xp: 600, coins: 1500,
    nodes: [
      { id: 'd3_01', texto: '⚡ *Raditz — O Irmao de Goku!*\n\n"Tu es um Saiyajin! Foste enviado para destruir a Terra!"', falante: 'Raditz' },
      { id: 'd3_02', texto: '⚡ *Goku vs Raditz!*', boss: { nome: 'Raditz', emoji: '⚡', hp: 3000, atk: 140, def: 50, xp: 600, coins: 1500, habilidades: ['Ki Blast', 'Double Sunday'], descricao: 'O irmao de Goku.' }},
      { id: 'd3_03', texto: '💀 *Goku morre para derrotar Raditz...*', xp: 200 },
      { id: 'd3_04', texto: '🏋️ *Treino com o Rei Kaioh!*\n\nGoku aprende o Kaioken!\n\n"KAIOKEN TIMES 2!"', xp: 300, skill: 'Kaioken' },
      { id: 'd3_05', texto: '💥 *Goku vs Vegeta!*', boss: { nome: 'Vegeta', emoji: '👑', hp: 6000, atk: 200, def: 80, xp: 1500, coins: 3000, habilidades: ['Galick Gun', 'Oozaru'], descricao: 'O Principe dos Saiyajins.' }},
      { id: 'd3_06', texto: '👑 *Vegeta foge!*\n\nRumo a Namek!', xp: 400, title: 'Saiyajin de Classe Baixa' },
    ],
    recompensas: { xp: 2500, coins: 6000, skill: 'Kaioken', title: 'Saiyajin' },
  },
  {
    id: 'db_ch04', titulo: 'Namek — O Imperador Frieza',
    descricao: 'O planeta Namek. O tirano mais cruel do universo.',
    nivel: 30, xp: 1000, coins: 2500,
    nodes: [
      { id: 'd4_01', texto: '🟢 *O Planeta Namek!*\n\nFrieza ja esta la!', xp: 200 },
      { id: 'd4_02', texto: '⚡ *Goku vs Ginyu Force!*', xp: 300 },
      { id: 'd4_03', texto: '👿 *Frieza — O Tirano!*', boss: { nome: 'Frieza (Forma Final)', emoji: '👿', hp: 15000, atk: 300, def: 120, xp: 3000, coins: 8000, habilidades: ['Death Beam', 'Death Ball'], descricao: 'O imperador do universo.' }},
      { id: 'd4_04', texto: '💀 *Krillin morre de novo!*\n\nGoku: "KRILLIN... AAAAAAH!"\n\nO cabelo fica dourado. Os olhos verdes.\n\n> 💛 *SUPER SAIYAJIN!*', xp: 500, skill: 'Super Saiyajin' },
      { id: 'd4_05', texto: '💛 *Goku SSJ vs Frieza!*\n\nGoku vence! Namek explode!', xp: 500, title: 'Super Saiyajin' },
    ],
    recompensas: { xp: 3500, coins: 9000, skill: 'Super Saiyajin', title: 'Super Saiyajin' },
  },
  {
    id: 'db_ch05', titulo: 'Androides e Cell',
    descricao: 'Trunks do futuro avisa: androides vao destruir a Terra!',
    nivel: 35, xp: 1200, coins: 3000,
    nodes: [
      { id: 'd5_01', texto: '⚡ *Trunks do Futuro!*\n\n"Em 3 anos, androides vao destruir a Terra!"', falante: 'Trunks' },
      { id: 'd5_02', texto: '🤖 *Os Androides 17 e 18!*\n\nVegeta atinge o Super Saiyajin!\n\n"FINAL FLASH!"', xp: 300, skill: 'Final Flash' },
      { id: 'd5_03', texto: '🧬 *Cell — O Perfeito!*', boss: { nome: 'Cell Perfeito', emoji: '🧬', hp: 20000, atk: 350, def: 150, xp: 4000, coins: 10000, habilidades: ['Kamehameha', 'Regeneracao'], descricao: 'O ser perfeito.' }},
      { id: 'd5_04', texto: '⚡ *Gohan atinge o Super Saiyajin 2!*\n\n"VOCES VAO PAGAR!"', xp: 500, skill: 'Super Saiyajin 2' },
      { id: 'd5_05', texto: '⚡ *Gohan vence Cell!*', xp: 500, title: 'Heroi do Torneio' },
    ],
    recompensas: { xp: 3000, coins: 8000, skill: 'Super Saiyajin 2', title: 'Heroi do Torneio' },
  },
  {
    id: 'db_ch06', titulo: 'Majin Buu',
    descricao: 'O demónio mais antigo desperta. A Terra esta em perigo!',
    nivel: 40, xp: 1500, coins: 4000,
    nodes: [
      { id: 'd6_01', texto: '💀 *Majin Buu desperta!*\n\nBabidi controla Vegeta!', xp: 300 },
      { id: 'd6_02', texto: '👑 *Vegeta sacrifica-se!*\n\n"TRUNKS... BULMA... EU VOU SALVAR-VOS!"', xp: 400 },
      { id: 'd6_03', texto: '💀 *Buu absorve todos!*', boss: { nome: 'Super Buu', emoji: '💀', hp: 25000, atk: 400, def: 160, xp: 5000, coins: 12000, habilidades: ['Absorcao', 'Candy Beam', 'Regeneracao'], descricao: 'O demónio mais antigo.' }},
      { id: 'd6_04', texto: '🐉 *Goku SSJ3!*\n\n"EU VOU ALÉM DOS LIMITES!"', xp: 600, skill: 'Super Saiyajin 3' },
      { id: 'd6_05', texto: '🌍 *Genkidama!*\n\nToda a Terra da energia!\n\n*BUU É DESTRUÍDO!*', xp: 600, title: 'Salvador da Terra' },
    ],
    recompensas: { xp: 4000, coins: 10000, skill: 'Super Saiyajin 3', title: 'Salvador da Terra' },
  },
  {
    id: 'db_ch07', titulo: 'Battle of Gods — Beerus',
    descricao: 'O Deus da Destruição desperta! E mais forte que qualquer Saiyajin!',
    nivel: 45, xp: 2000, coins: 5000,
    nodes: [
      { id: 'd7_01', texto: '😴 *Beerus acorda!*\n\n"Eu sou o Deus da Destruição. Alguém me provocou."', falante: 'Beerus' },
      { id: 'd7_02', texto: '💜 *Goku vs Beerus!*', boss: { nome: 'Beerus', emoji: '😴', hp: 30000, atk: 500, def: 200, xp: 6000, coins: 15000, habilidades: ['Hakai', 'Sphere of Destruction'], descricao: 'O Deus da Destruição.' }},
      { id: 'd7_03', texto: '🔴 *Super Saiyajin God!*\n\nGoku atinge o poder divino!', xp: 800, skill: 'Super Saiyajin God' },
      { id: 'd7_04', texto: '🔴 *Goku SSG vs Beerus!*\n\nO combate destrói planetas!\n\nBeerus fica impressionado!', xp: 600, title: 'Deus Saiyajin' },
    ],
    recompensas: { xp: 5000, coins: 12000, skill: 'Super Saiyajin God', title: 'Deus Saiyajin' },
  },
  {
    id: 'db_ch08', titulo: 'Resurrection F — Golden Frieza',
    descricao: 'Frieza volta da morte com uma nova forma dourada!',
    nivel: 50, xp: 2500, coins: 6000,
    nodes: [
      { id: 'd8_01', texto: '👿 *Frieza ressuscita!*\n\n"EU VOU VINGAR-ME DO GOKU!"', falante: 'Frieza' },
      { id: 'd8_02', texto: '💛 *Golden Frieza!*', boss: { nome: 'Golden Frieza', emoji: '💛', hp: 35000, atk: 550, def: 220, xp: 7000, coins: 18000, habilidades: ['Golden Death Beam', 'Earth Breaker'], descricao: 'Frieza na sua forma dourada.' }},
      { id: 'd8_03', texto: '💙 *Super Saiyajin Blue!*\n\nGoku atinge o SSB!', xp: 1000, skill: 'Super Saiyajin Blue' },
      { id: 'd8_04', texto: '💙 *Goku SSB vs Golden Frieza!*\n\nGoku vence de novo!', xp: 800, title: 'Saiyajin Blue' },
    ],
    recompensas: { xp: 6000, coins: 15000, skill: 'Super Saiyajin Blue', title: 'Saiyajin Blue' },
  },
  {
    id: 'db_ch09', titulo: 'Goku Black — Zamasu',
    descricao: 'Um Kaioshin corrompido rouba o corpo de Goku!',
    nivel: 55, xp: 3000, coins: 7000,
    nodes: [
      { id: 'd9_01', texto: '🖤 *Goku Black!*\n\nUm Goku do futuro com o poder de Zamasu!', xp: 400 },
      { id: 'd9_02', texto: '💜 *Zamasu Imortal!*', boss: { nome: 'Zamasu Fusionado', emoji: '💜', hp: 40000, atk: 600, def: 250, xp: 8000, coins: 20000, habilidades: ['Holy Wrath', 'Lightning of Absolution'], descricao: 'O deus corrompido.' }},
      { id: 'd9_03', texto: '⚡ *Trunks SSJ Rage!*\n\n"EU VOU PROTEGER TODOS!"', xp: 800, skill: 'Spirit Sword' },
      { id: 'd9_04', texto: '🌍 *Zeno apaga a linha temporal!*\n\nO universo e salvo!', xp: 600, title: 'Guerreiro Temporal' },
    ],
    recompensas: { xp: 7000, coins: 17000, skill: 'Spirit Sword', title: 'Guerreiro Temporal' },
  },
  {
    id: 'db_ch10', titulo: 'Torneio do Poder',
    descricao: '8 universos lutam pela sobrevivencia! Goku alcanca o poder supremo!',
    nivel: 60, xp: 4000, coins: 10000,
    nodes: [
      { id: 'd10_01', texto: '🏆 *Torneio do Poder!*\n\n8 universos! 80 guerreiros! O universo perdedor e apagado!', xp: 500 },
      { id: 'd10_02', texto: '💪 *Jiren — O Mais Forte!*', boss: { nome: 'Jiren', emoji: '💪', hp: 50000, atk: 800, def: 300, xp: 10000, coins: 25000, habilidades: ['Power Impact', 'Invisible Strikes', 'Full Power'], descricao: 'O guerreiro mais forte do Universo 11.' }},
      { id: 'd10_03', texto: '⚪ *ULTRA INSTINTO!*\n\nGoku atinge o poder supremo!\n\nO corpo move-se sozinho!\n\nO cabelo fica prateado!', xp: 2000, skill: 'Ultra Instinto' },
      { id: 'd10_04', texto: '⚪ *Goku UI vs Jiren!*\n\nA batalha mais epica de todos os tempos!\n\nGoku vence! O Universo 7 e salvo!', xp: 1500, title: 'Mortal Mais Forte' },
      { id: 'd10_05', texto: '🏆 *FIM — Dragon Ball Super!*\n\nGoku e o mortal mais forte do multiverso!\n\n> 🏆 *Parabens! Completaste Dragon Ball!*', xp: 3000, coins: 20000, title: 'Lenda Saiyajin' },
    ],
    recompensas: { xp: 10000, coins: 30000, skill: 'Ultra Instinto', title: 'Lenda Saiyajin' },
  },
];

const DEMONSLAYER_CHAPTERS = [
  {
    id: 'ds_ch01', titulo: 'A Família Assassinada',
    descricao: 'Tanjiro encontra a família morta. Nezuko torna-se demónio.',
    nivel: 8, xp: 150, coins: 400,
    nodes: [
      { id: 'ds1_01', texto: '❄️ *Montanha Neve*\n\nTanjiro Kamado volta para casa... e encontra a família inteira morta.\n\nSangue por todo o lado.\n\nMas... Nezuko ainda respira!\n\n"NEZUKO! AGUENTA!"', falante: 'Tanjiro' },
      { id: 'ds1_02', texto: '👹 *Nezuko Transforma-se!*\n\nNezuko torna-se demónio!\n\nMas... ela não ataca Tanjiro!\n\n"Nezuko... tu ainda és a minha irmã!"\n\nGiyu Tomioka aparece. "Mate-a."\n\n"NUNCA!"', xp: 100, coins: 200 },
      { id: 'ds1_03', texto: '⚔️ *Giyu Tomioka — Pilar da Água!*\n\nGiyu quer matar Nezuko. Tanjiro protege-a.\n\n"Se a minha irmã matar alguém, eu vou junto!"\n\nGiyu hesita. Pela primeira vez, vê algo diferente.', xp: 80 },
      { id: 'ds1_04', texto: '🏔️ *Urokodaki — O Treino!*\n\nGiyu envia Tanjiro para Urokodaki, o antigo Pilar da Água.\n\n"Treina durante 2 anos. Depois enfrenta a seleção."\n\nTanjiro aprende a Respiração da Água!\n\n> ❄️ *O caminho do Caçador de Demónios começa!*', xp: 200, coins: 500, skill: 'Respiração da Água' },
    ],
    recompensas: { xp: 500, coins: 1200, skill: 'Respiração da Água', title: 'Caçador Iniciante' },
  },
  {
    id: 'ds_ch02', titulo: 'A Seleção Final',
    descricao: 'Monte Fujikasane. Sobreviver ao amanhecer entre demónios.',
    nivel: 9, xp: 200, coins: 500,
    nodes: [
      { id: 'ds2_01', texto: '🌸 *Monte Fujikasane*\n\n100 candidatos. Demónios por todo o lado.\n\nSobrevivam até ao amanhecer!\n\nTanjiro luta com a espada de Urokodaki.', xp: 100 },
      { id: 'ds2_02', texto: '⚡ *Zenitsu Agatsuma!*\n\nUm rapaz medroso que só luta a dormir!\n\n"Eu não quero morrer! Quero casar!"\n\nMas quando adormece... usa a Respiração do Trovão!', falante: 'Zenitsu' },
      { id: 'ds2_03', texto: '🐗 *Inosuke Hashibira!*\n\nUm rapaz com cabeça de javali!\n\n"EU SOU O REI DA MONTANHA!"\n\nUsa duas espadas e Respiração da Besta!', falante: 'Inosuke' },
      { id: 'ds2_04', texto: '⚔️ *A Manhã Chega!*\n\nOs sobreviventes são aceites como Caçadores de Demónios!\n\nTanjiro, Zenitsu e Inosuke tornam-se uma equipa!\n\n> ⚔️ *Seleção Final completa!*', xp: 150, coins: 300, title: 'Caçador de Demónios' },
    ],
    recompensas: { xp: 600, coins: 1500, title: 'Caçador de Demónios' },
  },
  {
    id: 'ds_ch03', titulo: 'O Comboio Infinito',
    descricao: 'Enmu, um Lua Inferior, controla um comboio de sonhos!',
    nivel: 11, xp: 300, coins: 800,
    nodes: [
      { id: 'ds3_01', texto: '🚂 *O Comboio Infinito!*\n\nUm comboio onde todos adormecem!\n\nEnmu controla os sonhos!\n\nTanjiro está preso num sonho feliz... com a família viva...', xp: 150, coins: 300 },
      { id: 'ds3_02', texto: '😴 *O Sonho de Tanjiro*\n\nA família está viva. Nezuko é humana. Tudo é perfeito.\n\nMas Tanjiro sabe que não é real.\n\n"Eu preciso de acordar... há pessoas para proteger!"\n\n*Corta o próprio pescoço no sonho!*', xp: 200, coins: 400 },
      { id: 'ds3_03', texto: '🌙 *Enmu — Lua Inferior 1!*', boss: { nome: 'Enmu', emoji: '😴', hp: 3000, atk: 120, def: 50, xp: 600, coins: 1500, habilidades: ['Manipulação de Sonhos', 'Sono Eterno', 'Fusão com Comboio'], descricao: 'O demónio que controla sonhos.' }},
      { id: 'ds3_04', texto: '🔥 *Rengoku — O Pilar da Chama!*\n\nKyojuro Rengoku aparece!\n\n"Não se preocupem! Estou aqui!"\n\nA Respiração da Chama destrói Enmu!', xp: 300, coins: 600, skill: 'Respiração da Chama' },
      { id: 'ds3_05', texto: '🔥 *Rengoku vs Akaza!*\n\nAkaza — Lua Superior 3 — aparece!\n\n"Rengoku! Junta-te a mim!"\n\n"NUNCA! Eu protejo os meus!"', boss: { nome: 'Akaza', emoji: '🔥', hp: 8000, atk: 250, def: 100, xp: 2000, coins: 5000, habilidades: ['Destructive Death', 'Compass Needle', 'Air Type'], descricao: 'Lua Superior 3. O demónio que respeita os guerreiros fortes.' }},
      { id: 'ds3_06', texto: '🔥 *O Sacrifício de Rengoku!*\n\nRengoku luta até ao amanhecer!\n\n"Tanjiro... protege as pessoas!"\n\nRengoku morre de pé. Os olhos abertos.\n\n> 🔥 *Kyojuro Rengoku... o herói que nunca se rendeu.*', xp: 500, coins: 1500, title: 'Herdeiro da Chama' },
    ],
    recompensas: { xp: 2000, coins: 5000, skill: 'Respiração da Chama', title: 'Herdeiro da Chama' },
  },
  {
    id: 'ds_ch04', titulo: 'A Vila dos Ferreiros',
    descricao: 'Espadas novas. Novos poderes. As Prostitutas vêm aí.',
    nivel: 14, xp: 400, coins: 1000,
    nodes: [
      { id: 'ds4_01', texto: '🔨 *Vila dos Ferreiros!*\n\nTanjiro precisa de uma nova espada!\n\nHaganezuka, o ferreiro, está furioso.\n\n"PARA DE PARTIR AS ESPADAS!"', falante: 'Haganezuka' },
      { id: 'ds4_02', texto: '⚔️ *A Espada Negra-Verde!*\n\nTanjiro recebe uma espada especial!\n\nCor: Negro-Verde. Rara como a de Yoriichi!\n\n"Esta espada... escolheu-te."', xp: 200, coins: 500, item: 'Espada Nichirin Negra-Verde' },
      { id: 'ds4_03', texto: '🌊 *Treino com Tengen!*\n\nTengen Uzui, o Pilar do Som, treina Tanjiro!\n\n"Eu sou o mais extravagante! O mais bonito!"\n\nA Respiração do Som é única!', xp: 300, coins: 700, skill: 'Respiração do Som' },
      { id: 'ds4_04', texto: '⚔️ *As Prostitutas Chegam!*\n\nDaki e Gyutaro — Luas Superiores 6!\n\nVão destruir o Distrito Vermelho!\n\n> 🔨 *Missão: Destruir as Luas Superiores!*', xp: 250, coins: 600 },
    ],
    recompensas: { xp: 1200, coins: 3000, item: 'Espada Nichirin', skill: 'Respiração do Som' },
  },
  {
    id: 'ds_ch05', titulo: 'O Distrito Vermelho — Daki e Gyutaro',
    descricao: 'As prostitutas mais belas e mortais.',
    nivel: 16, xp: 500, coins: 1500,
    nodes: [
      { id: 'ds5_01', texto: '🌙 *Distrito do Entretenimento!*\n\nTanjiro, Zenitsu e Inosuke infiltram-se!\n\nDaki é a geisha mais bela... e mais mortífera!\n\n"Vocês são tão feios... vou matar-vos."', falante: 'Daki' },
      { id: 'ds5_02', texto: '🌙 *Daki — Lua Superior 6!*', boss: { nome: 'Daki', emoji: '🌙', hp: 5000, atk: 180, def: 70, xp: 1200, coins: 3000, habilidades: ['Obi Demoníaco', 'Blood Demon Art', 'Regeneracao'], descricao: 'Lua Superior 6. A geisha demoníaca.' }},
      { id: 'ds5_03', texto: '👹 *Gyutaro — O Verdadeiro Lua Superior 6!*\n\nDaki é só metade! Gyutaro é o verdadeiro!\n\n"Eu sou o irmão mais velho! Ninguém toca na minha irmã!"', boss: { nome: 'Gyutaro', emoji: '👹', hp: 7000, atk: 220, def: 90, xp: 2000, coins: 5000, habilidades: ['Blood Sickles', 'Poison Blood', 'Rotating Circular Slashes'], descricao: 'O verdadeiro Lua Superior 6.' }},
      { id: 'ds5_04', texto: '🔥 *Tengen vs Gyutaro!*\n\nTengen luta com as duas espadas!\n\n"EU SOU O MAIS EXTRAVAGANTE!"\n\nMas Gyutaro é forte demais! Tengen perde uma mão!', xp: 400, coins: 1000 },
      { id: 'ds5_05', texto: '⚡ *Tanjiro + Tengen vs Gyutaro — FINAL!*\n\nTanjiro corta a cabeça de Gyutaro!\n\nTengen corta a de Daki!\n\nAo mesmo tempo!\n\n*AS LUAS SUPERIORES 6 CAEM!*\n\n> 🌙 *Distrito Vermelho salvo!*', xp: 600, coins: 2000, title: 'Caçador de Luas' },
    ],
    recompensas: { xp: 2500, coins: 7000, title: 'Caçador de Luas' },
  },
  {
    id: 'ds_ch06', titulo: 'A Casa das Borboletas — Treino Hashira',
    descricao: 'Tanjiro treina com os Pilares para ficar mais forte.',
    nivel: 18, xp: 600, coins: 1500,
    nodes: [
      { id: 'ds6_01', texto: '🦋 *Casa das Borboletas!*\n\nTanjiro treina com Shinobu Kocho, o Pilar dosInsetos!\n\n"Eu vou matar todos os demónios... com um sorriso!"', falante: 'Shinobu' },
      { id: 'ds6_02', texto: '⚡ *A Marca do Caçador!*\n\nTanjiro desbloqueia a Marca!\n\nAparece na testa como uma cicatriz flamejante!\n\n"Este poder... é de outro nível!"', xp: 300, coins: 800, skill: 'Marca do Caçador' },
      { id: 'ds6_03', texto: '⚡ *Respiração Trovejante — Forma 7!*\n\nTanjiro combina Água + Trovão!\n\nCria a sua própria técnica!\n\n> ⚡ *Tanjiro evoluiu!*', xp: 400, coins: 1000, skill: 'Respiração Trovejante' },
      { id: 'ds6_04', texto: '⚔️ *Reunião dos Pilares!*\n\nOs 9 Pilares juntos!\n\n"Tanjiro... vais enfrentar Muzan em breve."\n\n> 🦋 *Preparação para a batalha final!*', xp: 300, coins: 700, title: 'Guerreiro Hashira' },
    ],
    recompensas: { xp: 1800, coins: 4500, skill: 'Marca do Caçador', title: 'Guerreiro Hashira' },
  },
  {
    id: 'ds_ch07', titulo: 'A Fortaleza Infinita — Kokushibo',
    descricao: 'A lua superior mais forte. O demónio que foi humano.',
    nivel: 22, xp: 800, coins: 2000,
    nodes: [
      { id: 'ds7_01', texto: '🏯 *A Fortaleza Infinita!*\n\nA base de Muzan! Uma dimensão onde nada morre!\n\nCada sala é uma armadilha!\n\nOs Pilares entram!', xp: 200, coins: 500 },
      { id: 'ds7_02', texto: '⚔️ *Kokushibo — Lua Superior 1!*\n\nO demónio mais forte abaixo de Muzan!\n\nEra humano... irmão de Yoriichi!\n\n"Eu escolhi ser demónio... para superar o meu irmão!"', boss: { nome: 'Kokushibo', emoji: '⚔️', hp: 12000, atk: 300, def: 130, xp: 3000, coins: 8000, habilidades: ['Respiração Lunar', 'Blood Demon Art', 'See-Through World', 'Six Eyes'], descricao: 'Lua Superior 1. O demónio mais forte.' }},
      { id: 'ds7_03', texto: '⚔️ *Os Pilares vs Kokushibo!*\n\nMuichiro, Sanemi, Gyomei — os mais fortes!\n\nKokushibo é impossível!\n\nMas Muichiro usa o selo do Criador!', xp: 500, coins: 1500 },
      { id: 'ds7_04', texto: '⚔️ *Kokushibo Cai!*\n\nGyomei, o Pilar da Rocha, dá o golpe final!\n\n"Eu... finalmente... posso descansar?"\n\n> ⚔️ *Lua Superior 1 derrotado!*', xp: 800, coins: 2500, title: 'Destruidor de Luas' },
    ],
    recompensas: { xp: 3000, coins: 8000, title: 'Destruidor de Luas' },
  },
  {
    id: 'ds_ch08', titulo: 'Muzan Kibutsuji — O Progenitor',
    descricao: 'O demónio original. O que criou todos os demónios.',
    nivel: 26, xp: 1200, coins: 3000,
    nodes: [
      { id: 'ds8_01', texto: '👹 *Muzan Kibutsuji!*\n\nO progenitor de todos os demónios!\n\n"Eu sou perfeito. Imortal. Ninguém me pode matar!"\n\nMuzan transforma Nezuko em humano... ou tenta!', falante: 'Muzan' },
      { id: 'ds8_02', texto: '🔥 *Tanjiro vs Muzan!*', boss: { nome: 'Muzan Kibutsuji', emoji: '👹', hp: 25000, atk: 500, def: 200, xp: 8000, coins: 20000, habilidades: ['Demon Blood', 'Thousand Arms', 'Regeneracao Absoluta', 'Demon Transformation'], descricao: 'O progenitor de todos os demónios.' }},
      { id: 'ds8_03', texto: '🔥 *Todos os Pilares vs Muzan!*\n\nOs 9 Pilares restantes atacam juntos!\n\nMuzan é forte demais! Mata Pilares com um golpe!\n\nMas Tanjiro não desiste!', xp: 600, coins: 1500 },
      { id: 'ds8_04', texto: '☀️ *O Amanhecer!*\n\nTanjiro luta até o sol nascer!\n\nMuzan começa a derreter!\n\n"IMPOSSÍVEL! EU SOU PERFEITO!"\n\nMas o sol é o seu inimigo final!', xp: 1000, coins: 3000, title: 'Destruidor de Muzan' },
    ],
    recompensas: { xp: 4500, coins: 12000, title: 'Destruidor de Muzan' },
  },
  {
    id: 'ds_ch09', titulo: 'O Amanhecer Eterno',
    descricao: 'Muzan cai. O mundo é livre. Nezuko torna-se humana.',
    nivel: 30, xp: 1500, coins: 4000,
    nodes: [
      { id: 'ds9_01', texto: '☀️ *Muzan Morre!*\n\nO sol consome Muzan!\n\n"EU... NÃO... POSSO... MORRER!"\n\nMas morre. Os demónios desaparecem.\n\nO mundo é livre!', xp: 500, coins: 1500 },
      { id: 'ds9_02', texto: '🌸 *Nezuko é Humana!*\n\nNezuko acorda humana!\n\n"Tanjiro... irmão..."\n\nTanjiro chora. A sua irmã voltou.', xp: 500, coins: 1500 },
      { id: 'ds9_03', texto: '🌅 *O Mundo sem Demónios!*\n\nOs sobreviventes celebram!\n\nZenitsu casa com Nezuko (finalmente!).\n\nInosuke continua a ser selvagem.\n\nTanjiro olha para o céu.\n\n"Rengoku... cumprimos a missão."\n\n> 🌅 *FIM — Demon Slayer completo!*\n> 🏆 *O sol nasceu sobre um mundo sem demónios.*', xp: 3000, coins: 10000, title: 'Lenda dos Caçadores', item: 'Espada Nichirin Dourada' },
    ],
    recompensas: { xp: 8000, coins: 25000, title: 'Lenda dos Caçadores', item: 'Espada Nichirin Dourada' },
  },
];

const DMC_CHAPTERS = [
  {
    id: 'dmc_ch01', titulo: 'O Sangue de Sparda',
    descricao: 'Dante, o filho do cavaleiro demoníaco. Meio-humano, meio-demónio.',
    nivel: 12, xp: 200, coins: 500,
    nodes: [
      { id: 'dm1_01', texto: '😈 *Devil May Cry — A Loja*\n\n"Dante. Caçador de demónios."\n\nUma loja escura. Pizza. Whisky. E muitas armas.\n\nDante é filho de Sparda — o cavaleiro demoníaco que salvou a humanidade.', falante: 'Dante' },
      { id: 'dm1_02', texto: '💃 *Trish Aparece!*\n\nUma mulher loira entra na loja.\n\n"Eu tenho um trabalho para ti... em Mallet Island."\n\nDante aceita. O dinheiro é bom.', falante: 'Trish' },
      { id: 'dm1_03', texto: '👹 *Demónios por Todo o Lado!*\n\nMallet Island está infestada de demónios!\n\nDante usa Ebony & Ivory — as pistolas duplas!\n\n*BANG BANG BANG!*\n\n"Vamos lá... isto vai ser divertido!"', xp: 150, coins: 300, item: 'Ebony & Ivory' },
      { id: 'dm1_04', texto: '⚔️ *Rebellion — A Espada de Sparda!*\n\nDante empunha a Rebellion — a espada do pai!\n\n"O sangue de Sparda corre em mim!"\n\n> ⚔️ *Dante desperta o poder demoníaco!*', xp: 200, coins: 500, skill: 'Devil Trigger', title: 'Caçador de Demónios' },
    ],
    recompensas: { xp: 600, coins: 1500, skill: 'Devil Trigger', title: 'Caçador de Demónios' },
  },
  {
    id: 'dmc_ch02', titulo: 'Vergil — O Irmão Gémeo',
    descricao: 'O irmão de Dante. O que escolheu o poder.',
    nivel: 15, xp: 300, coins: 800,
    nodes: [
      { id: 'dm2_01', texto: '⚔️ *Vergil!*\n\nO irmão gémeo de Dante!\n\n"Eu quero o poder do pai... a qualquer preço!"\n\nVergil é o oposto de Dante — frio, calculista, obcecado.', falante: 'Vergil' },
      { id: 'dm2_02', texto: '⚔️ *Dante vs Vergil!*', boss: { nome: 'Vergil', emoji: '⚔️', hp: 5000, atk: 200, def: 80, xp: 1500, coins: 3000, habilidades: ['Yamato', 'Judgement Cut', 'Rapid Slash', 'Devil Trigger'], descricao: 'O irmão gémeo de Dante. Mestre da Yamato.' }},
      { id: 'dm2_03', texto: '⚔️ *Irmãos Separados!*\n\nDante e Vergil lutam no topo da torre!\n\n"Vergil! Não precisas de ser como o pai!"\n\n"Eu SUPERO o pai!"\n\nVergil cai no abismo demoníaco...\n\n> ⚔️ *Vergil desaparece... por agora.*', xp: 400, coins: 1000, title: 'Filho de Sparda' },
    ],
    recompensas: { xp: 1200, coins: 3000, title: 'Filho de Sparda' },
  },
  {
    id: 'dmc_ch03', titulo: 'A Demónio que Tornou-se Humana',
    descricao: 'Trish trai Dante... ou não?',
    nivel: 17, xp: 350, coins: 900,
    nodes: [
      { id: 'dm3_01', texto: '💀 *Trish Traz Dante!*\n\nTrish é uma demónio criada por Mundus!\n\nEla trai Dante! Mas...\n\nDante salva-a mesmo assim!', xp: 200, coins: 500 },
      { id: 'dm3_02', texto: '👹 *Mundus — O Imperador dos Demónios!*', boss: { nome: 'Mundus', emoji: '👹', hp: 8000, atk: 280, def: 120, xp: 3000, coins: 8000, habilidades: ['Orbs Demoníacos', 'Inferno', 'Chuva de Meteoros', 'Mundo Demoníaco'], descricao: 'O imperador do mundo demoníaco.' }},
      { id: 'dm3_03', texto: '😈 *Devil Trigger Total!*\n\nDante ativa o Devil Trigger completo!\n\nAsas demoníacas! Poder supremo!\n\n"EU SOU O FILHO DE SPARDA!"\n\nMundus é derrotado!', xp: 500, coins: 1500, skill: 'Devil Trigger Perfeito' },
      { id: 'dm3_04', texto: '😈 *Devil May Cry — O Fim!*\n\nTrish torna-se humana. Dante continua a caçar.\n\n"O trabalho nunca acaba..."\n\n> 😈 *Fim do primeiro capítulo!*', xp: 300, coins: 800, title: 'Lenda de Sparda' },
    ],
    recompensas: { xp: 2000, coins: 5000, skill: 'Devil Trigger Perfeito', title: 'Lenda de Sparda' },
  },
  {
    id: 'dmc_ch04', titulo: 'DMC3 — A Origem',
    descricao: 'O jovem Dante. A torre de Temen-Ni-Gru. A rivalidade com Vergil.',
    nivel: 20, xp: 500, coins: 1200,
    nodes: [
      { id: 'dm4_01', texto: '🍕 *O Jovem Dante!*\n\nDante tem 19 anos. Pizza e atitude!\n\n"Eu não me importo com nada!"\n\nMas Vergil quer abrir a torre demoníaca!', falante: 'Dante' },
      { id: 'dm4_02', texto: '⚔️ *Dante vs Vergil — Round 1!*', boss: { nome: 'Vergil (Jovem)', emoji: '⚔️', hp: 4000, atk: 180, def: 70, xp: 1200, coins: 2500, habilidades: ['Yamato', 'Judgement Cut', 'Rapid Slash'], descricao: 'Vergil no seu auge.' }},
      { id: 'dm4_03', texto: '⚡ *Os Estilos de Combate!*\n\nDante desbloqueia os estilos!\n- Swordmaster (espadas)\n- Gunslinger (armas)\n- Trickster (agilidade)\n- Royalguard (defesa)\n\n> ⚡ *Dante torna-se completo!*', xp: 400, coins: 1000, skill: 'Estilos de Combate' },
      { id: 'dm4_04', texto: '⚔️ *Dante vs Vergil — Final!*\n\nNo topo da torre! Sangue e honra!\n\n"Eu protejo o que o pai protegeu!"\n\nVergil cai. Dante chora.\n\n> ⚔️ *Os irmãos separados... novamente.*', xp: 500, coins: 1500, title: 'Estiloso' },
    ],
    recompensas: { xp: 2000, coins: 5000, skill: 'Estilos de Combate', title: 'Estiloso' },
  },
  {
    id: 'dmc_ch05', titulo: 'DMC4 — Nero',
    descricao: 'Um novo herói. Nero. O sobrinho de Dante.',
    nivel: 22, xp: 600, coins: 1500,
    nodes: [
      { id: 'dm5_01', texto: '⚔️ *Nero — O Novo Herói!*\n\nNero é um caçador da Ordem da Espada!\n\nTem um braço demoníaco — o Devil Bringer!\n\n"Eu vou proteger Kyrie!"', falante: 'Nero' },
      { id: 'dm5_02', texto: '😈 *Dante vs Nero!*\n\nDante ataca a Ordem! Nero defende!\n\n"Quem és tu?!"\n\n"Eu sou Dante. Prazer."', boss: { nome: 'Dante (DMC4)', emoji: '😈', hp: 6000, atk: 220, def: 90, xp: 1500, coins: 3500, habilidades: ['Rebellion', 'Ebony & Ivory', 'Trickster', 'Royalguard'], descricao: 'Dante no seu auge.' }},
      { id: 'dm5_03', texto: '⚔️ *Sanctus — O Falso Deus!*\n\nSanctus usa o poder de Sparda!\n\n"Eu sou o novo Deus!"\n\nNero: "Tu não és Deus! És um farsante!"', boss: { nome: 'Sanctus', emoji: '💀', hp: 7000, atk: 240, def: 100, xp: 2000, coins: 5000, habilidades: ['Sparda Sword', 'Ascension', 'Divine Armour'], descricao: 'O líder da Ordem que roubou o poder de Sparda.' }},
      { id: 'dm5_04', texto: '⚔️ *Nero vence! Dante sorri.*\n\n"Nero... tu tens o sangue de Sparda."\n\n"Eu sei... e vou honrar esse nome."\n\n> ⚔️ *DMC4 completo! Nero é o novo herói!*', xp: 600, coins: 2000, title: 'Novo Filho de Sparda' },
    ],
    recompensas: { xp: 2500, coins: 6000, skill: 'Devil Bringer', title: 'Novo Filho de Sparda' },
  },
  {
    id: 'dmc_ch06', titulo: 'DMC5 — O Regresso de Vergil',
    descricao: 'Vergil volta. Nero descobre a verdade. Dante e Vergil — a batalha final.',
    nivel: 25, xp: 800, coins: 2000,
    nodes: [
      { id: 'dm6_01', texto: '💀 *V é Vergil!*\n\nO misterioso "V" é a metade humana de Vergil!\n\n"Eu sou uma parte dele... a parte que queria redenção."', falante: 'V' },
      { id: 'dm6_02', texto: '⚔️ *Vergil Regressa!*\n\nVergil reúne as duas metades!\n\n"Eu quero uma revanche, Dante."\n\nA Qliphoth cresce! Demónios invadem!', xp: 400, coins: 1000 },
      { id: 'dm6_03', texto: '⚔️ *Dante vs Vergil — A Batalha Definitiva!*', boss: { nome: 'Vergil (Completo)', emoji: '⚔️', hp: 12000, atk: 350, def: 150, xp: 4000, coins: 10000, habilidades: ['Yamato Perfeita', 'Judgement Cut End', 'Devil Trigger', 'Beowulf'], descricao: 'Vergil no seu poder máximo.' }},
      { id: 'dm6_04', texto: '⚔️ *Nero Desperta!*\n\nNero: "PAREM! VOCÊS SÃO FAMÍLIA!"\n\nNero ativa o Devil Trigger!\n\nAsas de energia! Poder divino!\n\n"Eu não vou deixar vocês se matarem!"', xp: 800, coins: 2500, skill: 'Devil Trigger Nero' },
      { id: 'dm6_05', texto: '😈 *Dante e Vergil — Irmãos de Novo!*\n\nNero separa Dante e Vergil!\n\n"Vocês são irmãos... parem de lutar!"\n\nVergil sorri. Pela primeira vez.\n\n"Obrigado... Nero."\n\n> 😈 *DMC5 completo! Família reunida!*', xp: 1000, coins: 3000, title: 'Lenda de Sparda' },
    ],
    recompensas: { xp: 4000, coins: 10000, skill: 'Devil Trigger Nero', title: 'Lenda de Sparda' },
  },
  {
    id: 'dmc_ch07', titulo: 'O Inferno Profundo',
    descricao: 'Dante e Vergil descem ao inferno para lutar para sempre.',
    nivel: 28, xp: 1000, coins: 2500,
    nodes: [
      { id: 'dm7_01', texto: '🔥 *O Abismo Demoníaco!*\n\nDante e Vergil descem ao inferno!\n\nDemónios sem fim! Mas os irmãos lutam juntos!\n\n"FINALMENTE... JUNTOS!"', xp: 300, coins: 800 },
      { id: 'dm7_02', texto: '👹 *O Demónio Antigo!*', boss: { nome: 'Rei do Inferno', emoji: '👹', hp: 10000, atk: 300, def: 130, xp: 3000, coins: 8000, habilidades: ['Inferno Eterno', 'Chama Demoníaca', 'Exército Infernal'], descricao: 'O rei dos demónios infernais.' }},
      { id: 'dm7_03', texto: '⚔️ *Dante + Vergil vs O Rei!*\n\nOs irmãos Sparda lutam juntos!\n\nA combinação perfeita!\n\n*SLASH SLASH SLASH!*\n\nO Rei do Inferno cai!', xp: 800, coins: 2000, title: 'Guerreiro do Inferno' },
      { id: 'dm7_04', texto: '😈 *O Novo Capítulo!*\n\nDante fica no inferno. Vergil também.\n\n"Vamos ver quem é o mais forte!"\n\nNero fica na Terra. O novo protetor.\n\n> 😈 *O ciclo de Sparda continua...*', xp: 500, coins: 1500, title: 'Guardião do Inferno' },
    ],
    recompensas: { xp: 3000, coins: 8000, title: 'Guardião do Inferno' },
  },
  {
    id: 'dmc_ch08', titulo: 'O Estilo SSS',
    descricao: 'Dante no seu auge. O estilo supremo.',
    nivel: 30, xp: 1200, coins: 3000,
    nodes: [
      { id: 'dm8_01', texto: '🔥 *SSS — Triple S!*\n\nDante atinge o estilo supremo!\n\nCada golpe é perfeito! Cada combo é divino!\n\n"VOCÊS NÃO SÃO PARES PARA MIM!"', xp: 400, coins: 1000, skill: 'SSS Style' },
      { id: 'dm8_02', texto: '⚔️ *Os Demónios Fogem!*\n\nDante é tão forte que os demónios fogem!\n\n"Onde estão?! Eu quero mais!"\n\nTrish: "Dante... já não há mais demónios."', xp: 300, coins: 800 },
      { id: 'dm8_03', texto: '🍕 *A Pizza Final!*\n\nDante come uma pizza. Bebe whisky.\n\n"O trabalho acabou... por agora."\n\nMas um novo cliente entra na loja.\n\n"Dante? Preciso da tua ajuda."\n\n"Quanto pagas?"\n\n> 🍕 *Devil May Cry nunca acaba...*', xp: 500, coins: 1500, title: 'Estilo SSS' },
    ],
    recompensas: { xp: 2000, coins: 5000, skill: 'SSS Style', title: 'Estilo SSS' },
  },
  {
    id: 'dmc_ch09', titulo: 'O Legado de Sparda',
    descricao: 'A história completa de Sparda revelada.',
    nivel: 32, xp: 1500, coins: 4000,
    nodes: [
      { id: 'dm9_01', texto: '⚔️ *Sparda — O Cavaleiro Demoníaco!*\n\nHá 2000 anos, Sparda rebelou-se contra os demónios!\n\n"Eu vou proteger os humanos!"\n\nSelou o mundo demoníaco e viveu como humano.', xp: 500, coins: 1500 },
      { id: 'dm9_02', texto: '⚔️ *O Sacrifício de Sparda!*\n\nSparda deu a vida pelos filhos!\n\n"Dante... Vergil... protejam o mundo."\n\nA espada Rebellion e a Yamato são as suas heranças.', xp: 500, coins: 1500, item: 'Espada de Sparda' },
      { id: 'dm9_03', texto: '😈 *O Legado Continua!*\n\nDante, Vergil e Nero.\n\nTrês gerações de Sparda.\n\nO sangue demoníaco que protege a humanidade.\n\n> 😈 *FIM — Devil May Cry completo!*\n> 🏆 *O legado de Sparda é eterno.*', xp: 2000, coins: 6000, title: 'Herdeiro de Sparda', item: 'Rebellion Awakened' },
    ],
    recompensas: { xp: 6000, coins: 18000, title: 'Herdeiro de Sparda', item: 'Rebellion Awakened' },
  },
];

const BLEACH_CHAPTERS = [
  {
    id: 'bl_ch01', titulo: 'O Shinigami Substituto',
    descricao: 'Ichigo Kurosaki vê espíritos. Rukia Kuchiki dá-lhe os poderes de Shinigami.',
    nivel: 18, xp: 250, coins: 600,
    nodes: [
      { id: 'b1_01', texto: '👻 *Karakura Town*\n\nIchigo Kurosaki, 15 anos. Vê fantasmas.\n\nUma mulher de preto aparece!\n\n"Eu sou Rukia Kuchiki. Shinigami. Caçadora de almas malignas."', falante: 'Rukia' },
      { id: 'b1_02', texto: '👻 *O Hollow Ataca!*\n\nUma máscara branca! Uma criatura que devora almas!\n\n"HOLLOW!"\n\nMas Ichigo não foge! Protege a família!', xp: 100, coins: 200 },
      { id: 'b1_03', texto: '⚔️ *Ichigo Torna-se Shinigami!*\n\nRukia transfere os seus poderes!\n\nIchigo empunha uma Zanpakutō gigante!\n\n"Eu vou proteger todos!"\n\nO Hollow é destruído!', xp: 200, coins: 500, skill: 'Zanpakutō', title: 'Shinigami Substituto' },
      { id: 'b1_04', texto: '⚔️ *O Treino de Urahara!*\n\nKisuke Urahara, o génio, treina Ichigo!\n\n"Para ser Shinigami, precisas de morrer primeiro!"\n\nIchigo entra na Soul Society!\n\n> ⚔️ *O caminho do Shinigami começa!*', xp: 150, coins: 400, skill: 'Getsuga Tensho' },
    ],
    recompensas: { xp: 700, coins: 1800, skill: 'Zanpakutō', title: 'Shinigami Substituto' },
  },
  {
    id: 'bl_ch02', titulo: 'Soul Society — A Invasão',
    descricao: 'Rukia é condenada à morte. Ichigo invade a Soul Society para a salvar!',
    nivel: 20, xp: 400, coins: 1000,
    nodes: [
      { id: 'b2_01', texto: '🏛️ *Soul Society!*\n\nO mundo dos mortos! Onde vivem os Shinigamis!\n\n13 Companhias! Capitães lendários!\n\nRukia vai ser executada!', xp: 200, coins: 500 },
      { id: 'b2_02', texto: '⚡ *Ichigo vs Renji!*\n\nRenji Abarai, Vice-Capitão, bloqueia o caminho!\n\n"Não passes! Rukia morrerá!"\n\nMas Ichigo é mais forte!', boss: { nome: 'Renji Abarai', emoji: '⚡', hp: 3000, atk: 140, def: 60, xp: 600, coins: 1500, habilidades: ['Zabimaru', 'Hado #31', 'Shikai'], descricao: 'Vice-Capitão da 6ª Companhia.' }},
      { id: 'b2_03', texto: '⚡ *Ichigo vs Byakuya!*\n\nByakuya Kuchiki, o Capitão mais frio!\n\n"Tu és um substituto. Morre."', boss: { nome: 'Byakuya Kuchiki', emoji: '⚡', hp: 5000, atk: 200, def: 80, xp: 1200, coins: 3000, habilidades: ['Senbonzakura', 'Senkei', 'Gokei'], descricao: 'O Capitão da 6ª Companhia. O mais elegante.' }},
      { id: 'b2_04', texto: '⚡ *Ichigo Ativa o Bankai!*\n\n"ZANGETSU!"\n\nA espada muda! Fica preta e vermelha!\n\nTensa Zangetsu!\n\nByakuya está espantado!\n\n> ⚡ *Bankai desbloqueado!*', xp: 500, coins: 1500, skill: 'Bankai: Tensa Zangetsu' },
    ],
    recompensas: { xp: 1800, coins: 4500, skill: 'Bankai: Tensa Zangetsu', title: 'Bankai User' },
  },
  {
    id: 'bl_ch03', titulo: 'A Traição de Aizen',
    descricao: 'O Capitão mais amado trai a Soul Society!',
    nivel: 22, xp: 500, coins: 1200,
    nodes: [
      { id: 'b3_01', texto: '👁️ *Aizen Sousuke — O Traiçoeiro!*\n\nAizen não morreu! Tudo foi um plano!\n\n"Eu sou o génio supremo. Ninguém me pode parar."\n\nEle roubou o Hogyoku!', falante: 'Aizen' },
      { id: 'b3_02', texto: '👁️ *Aizen vs Todos!*', boss: { nome: 'Aizen Sousuke', emoji: '👁️', hp: 10000, atk: 300, def: 130, xp: 3000, coins: 8000, habilidades: ['Kyoka Suigetsu', 'Hogyoku', 'Hado #90', 'Complete Hypnosis'], descricao: 'O génio supremo. Controla os 5 sentidos.' }},
      { id: 'b3_03', texto: '⚡ *Ichigo vs Aizen!*\n\nIchigo usa o Final Getsuga Tensho!\n\n"EU SOU... O GETSUGA!"\n\nO poder supremo! Mas a que preço?', xp: 800, coins: 2000, skill: 'Final Getsuga Tensho' },
      { id: 'b3_04', texto: '👁️ *Aizen é Selado!*\n\nUrahara sela Aizen!\n\n"Obrigado, Ichigo..."\n\nMas Ichigo perde os poderes de Shinigami!\n\n> 👁️ *Aizen selado. Ichigo perde os poderes.*', xp: 500, coins: 1500, title: 'Herói de Karakura' },
    ],
    recompensas: { xp: 2500, coins: 6000, skill: 'Final Getsuga Tensho', title: 'Herói de Karakura' },
  },
  {
    id: 'bl_ch04', titulo: 'Os Quincy — A Nova Ameaça',
    descricao: 'Os Quincy regressam. Yhwach, o pai dos Quincy, quer destruir tudo.',
    nivel: 25, xp: 600, coins: 1500,
    nodes: [
      { id: 'b4_01', texto: '⚔️ *A Invasão Quincy!*\n\nYhwach invade a Soul Society!\n\n"Eu sou o pai dos Quincy. Vou destruir tudo."\n\nOs Capitães caem um a um!', xp: 200, coins: 500 },
      { id: 'b4_02', texto: '💀 *O Massacre dos Shinigamis!*\n\nYhwach mata Yamamoto, o Capitão-General!\n\n"O mais forte... caiu."\n\nA Soul Society está em ruínas!', xp: 300, coins: 800 },
      { id: 'b4_03', texto: '⚡ *Ichigo Desperta de Novo!*\n\nIchigo recupera os poderes! Mais forte que nunca!\n\n"ZANGETSU! ESTOU DE VOLTA!"\n\nA Zanpakutō muda! Dupla!', xp: 400, coins: 1000, skill: 'Zangetsu Dupla' },
      { id: 'b4_04', texto: '⚔️ *Ichigo vs Yhwach — Round 1!*', boss: { nome: 'Yhwach', emoji: '⚔️', hp: 15000, atk: 400, def: 170, xp: 4000, coins: 10000, habilidades: ['The Almighty', 'Sankt Altar', 'Auswahlen', 'Reishi Absorption'], descricao: 'O pai dos Quincy. Vê todos os futuros.' }},
      { id: 'b4_05', texto: '⚔️ *Ichigo é derrotado... por agora.*\n\nYhwach é forte demais!\n\nMas Ichigo promete: "Eu vou voltar mais forte!"\n\n> ⚔️ *A guerra dos Quincy começou...*', xp: 500, coins: 1500, title: 'Guerreiro Quincy' },
    ],
    recompensas: { xp: 2500, coins: 6500, skill: 'Zangetsu Dupla', title: 'Guerreiro Quincy' },
  },
  {
    id: 'bl_ch05', titulo: 'O Rei Quincy — Yhwach',
    descricao: 'A batalha final contra o inimigo mais poderoso.',
    nivel: 28, xp: 800, coins: 2000,
    nodes: [
      { id: 'b5_01', texto: '⚔️ *A Contra-Invasão!*\n\nIchigo + Uryu + Renji + todos!\n\nInfiltram o Palácio Real de Yhwach!\n\n"A VINGANÇA COMEÇA AGORA!"', xp: 300, coins: 800 },
      { id: 'b5_02', texto: '⚔️ *Yhwach vs Ichigo — A Batalha Suprema!*', boss: { nome: 'Yhwach (Final)', emoji: '⚔️', hp: 25000, atk: 600, def: 250, xp: 8000, coins: 20000, habilidades: ['The Almighty Perfeito', 'Sankt Zwinger', 'Auswahlen Supremo', 'Rei do Mundo'], descricao: 'Yhwach no seu poder supremo.' }},
      { id: 'b5_03', texto: '⚔️ *O Getsuga Final!*\n\nIchigo usa o Getsuga Tensho final!\n\nUryu atira a seta de prata!\n\n*YHWACH É DERROTADO!*\n\nA Soul Society é salva!', xp: 1500, coins: 5000, skill: 'Getsuga Final' },
      { id: 'b5_04', texto: '⚔️ *O Fim da Guerra!*\n\nO mundo é restaurado. Os Quincy desaparecem.\n\nIchigo olha para o céu.\n\n"Obrigado... Zangetsu."\n\n> ⚔️ *Guerra dos Quincy terminou!*', xp: 800, coins: 2500, title: 'Salvador da Soul Society' },
    ],
    recompensas: { xp: 4000, coins: 10000, skill: 'Getsuga Final', title: 'Salvador da Soul Society' },
  },
  {
    id: 'bl_ch06', titulo: 'A Verdade sobre Zangetsu',
    descricao: 'Ichigo descobre a verdade sobre o seu poder.',
    nivel: 30, xp: 1000, coins: 2500,
    nodes: [
      { id: 'b6_01', texto: '👁️ *O Verdadeiro Zangetsu!*\n\nO velho na mente de Ichigo... é Yhwach!\n\n"Eu sou a parte Quincy do teu poder!"\n\nMas o verdadeiro Zangetsu é o Hollow!', xp: 500, coins: 1500 },
      { id: 'b6_02', texto: '⚔️ *Ichigo Aceita Tudo!*\n\n"Eu sou Shinigami. Sou Quincy. Sou Hollow.\nSou Humano. Sou TUDO!"\n\nA Zangetsu final nasce!', xp: 800, coins: 2000, skill: 'Zangetsu Verdadeira' },
      { id: 'b6_03', texto: '⚔️ *O Poder Completo!*\n\nIchigo atinge o poder supremo!\n\nTodos os caminhos num só!\n\n> ⚔️ *Ichigo é o guerreiro mais completo da história!*', xp: 600, coins: 1500, title: 'Shinigami Quincy Hollow' },
    ],
    recompensas: { xp: 3000, coins: 7000, skill: 'Zangetsu Verdadeira', title: 'Shinigami Quincy Hollow' },
  },
  {
    id: 'bl_ch07', titulo: 'O Novo Mundo',
    descricao: 'A paz regressa. Ichigo e os amigos. O mundo é salvo.',
    nivel: 32, xp: 1500, coins: 4000,
    nodes: [
      { id: 'b7_01', texto: '🌅 *Karakura Town — Amanhecer!*\n\nIchigo volta para casa.\n\nOrihime sorri. Chad acena. Uryu ignora (mas sorri por dentro).\n\nTudo voltou ao normal.', xp: 500, coins: 1500 },
      { id: 'b7_02', texto: '⚔️ *O Espírito Continua!*\n\nIchigo continua a proteger Karakura!\n\nMas agora... com amigos ao lado.\n\n"Eu não preciso de lutar sozinho!"', xp: 500, coins: 1500 },
      { id: 'b7_03', texto: '👻 *FIM — Bleach completo!*\n\nIchigo Kurosaki. O Shinigami Substituto.\n\nO que mudou o destino de dois mundos.\n\n> 👻 *Parabéns! Completaste Bleach!*\n> 🏆 *Ichigo — O Herói dos Dois Mundos!*\n> ⭐ *Bankai... é apenas o começo.*', xp: 5000, coins: 15000, title: 'Herói dos Dois Mundos', item: 'Zangetsu Final' },
    ],
    recompensas: { xp: 10000, coins: 30000, title: 'Herói dos Dois Mundos', item: 'Zangetsu Final' },
  },
];



WORLDS.naruto.capitulos = NARUTO_CHAPTERS.length;
WORLDS.onepiece.capitulos = ONEPIECE_CHAPTERS.length;
WORLDS.sololeveling.capitulos = SOLOLEVELING_CHAPTERS.length;
WORLDS.jjk.capitulos = JJK_CHAPTERS.length;
WORLDS.dragonball.capitulos = DRAGONBALL_CHAPTERS.length;
WORLDS.demonslayer.capitulos = DEMONSLAYER_CHAPTERS.length;
WORLDS.dmc.capitulos = DMC_CHAPTERS.length;
WORLDS.bleach.capitulos = BLEACH_CHAPTERS.length;

function _getChapters(worldId) {
  const map = {
    naruto: NARUTO_CHAPTERS,
    onepiece: ONEPIECE_CHAPTERS,
    sololeveling: SOLOLEVELING_CHAPTERS,
    jjk: JJK_CHAPTERS,
    dragonball: DRAGONBALL_CHAPTERS,
    demonslayer: DEMONSLAYER_CHAPTERS,
    dmc: DMC_CHAPTERS,
    bleach: BLEACH_CHAPTERS,
  };
  return map[worldId] || [];
}

// ══════════════════════════════════════════════════════════════
// REGISTO DE PROGRESSO DO JOGADOR
// ══════════════════════════════════════════════════════════════

async function getProgress(p, worldId) {
  if (!p.storyProgress) p.storyProgress = {};
  if (!p.storyProgress[worldId]) {
    p.storyProgress[worldId] = { capitulo: 0, node: null, completos: [], testePassado: false, testePontos: 0 };
  }
  if (p.storyProgress[worldId].testePassado === undefined) p.storyProgress[worldId].testePassado = false;
  if (p.storyProgress[worldId].testePontos === undefined) p.storyProgress[worldId].testePontos = 0;
  return p.storyProgress[worldId];
}

// ══════════════════════════════════════════════════════════════
// FUNÇÕES DE UI
// ══════════════════════════════════════════════════════════════

async function tReply(sock, msg, ctx, title, lines) {
  const RE = require('../renderEngine');
  const t = await RE.getTheme(ctx.remoteJid).catch(() => null);
  return sock.sendMessage(ctx.remoteJid, {
    text: RE.renderBlock(t, title, lines, { botName: config.bot.name })
  }, { quoted: msg });
}

async function enviarBotoes(sock, msg, ctx, corpo, botoes) {
  try {
    const { generateWAMessageFromContent, proto } = require('@systemzero/baileys');
    const m = generateWAMessageFromContent(ctx.remoteJid, {
      interactiveMessage: proto.Message.InteractiveMessage.fromObject({
        body: { text: corpo },
        footer: { text: '\u{1f4d6} RPG Story Mode v11' },
        header: { title: '', hasMediaAttachment: false },
        nativeFlowMessage: {
          buttons: botoes.map(b => ({
            name: 'quick_reply',
            buttonParamsJson: JSON.stringify({ display_text: b.text, id: b.id }),
          })),
        },
      }),
    }, { userJid: sock.user?.id, quoted: msg });
    await sock.relayMessage(ctx.remoteJid, m.message, {
      messageId: m.key.id,
      additionalNodes: [{ tag: 'biz', attrs: {}, content: [{
        tag: 'interactive', attrs: { type: 'native_flow', v: '1' },
        content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }],
      }] }],
    });
    return true;
  } catch { return false; }
}

async function enviarLista(sock, msg, ctx, titulo, rows, corpo) {
  try {
    const { generateWAMessageFromContent, proto } = require('@systemzero/baileys');
    const m = generateWAMessageFromContent(ctx.remoteJid, {
      interactiveMessage: proto.Message.InteractiveMessage.fromObject({
        body: { text: corpo },
        footer: { text: '\u{1f4d6} RPG Story Mode v11' },
        header: { title: '', hasMediaAttachment: false },
        nativeFlowMessage: {
          buttons: [{
            name: 'single_select',
            buttonParamsJson: JSON.stringify({ title: titulo, sections: [{ title: titulo, rows }] }),
          }],
        },
      }),
    }, { userJid: sock.user?.id, quoted: msg });
    await sock.relayMessage(ctx.remoteJid, m.message, {
      messageId: m.key.id,
      additionalNodes: [{ tag: 'biz', attrs: {}, content: [{
        tag: 'interactive', attrs: { type: 'native_flow', v: '1' },
        content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }],
      }] }],
    });
    return true;
  } catch { return false; }
}

// ══════════════════════════════════════════════════════════════
// CARROSSEL DE MUNDOS COM IMAGENS
// ══════════════════════════════════════════════════════════════

async function enviarCarrossel(sock, msg, ctx, cards) {
  try {
    const { generateWAMessageFromContent, proto, prepareWAMessageMedia } = require('@systemzero/baileys');
    const carouselCards = [];
    for (const card of cards) {
      let headerObj = { title: card.title, hasMediaAttachment: false };
      if (card.imagePath && fs.existsSync(card.imagePath)) {
        try {
          const imgBuffer = fs.readFileSync(card.imagePath);
          const mediaMsg = await prepareWAMessageMedia(
            { image: imgBuffer },
            { upload: sock.waUploadToServer }
          );
          if (mediaMsg && mediaMsg.imageMessage) {
            headerObj = {
              title: card.title,
              hasMediaAttachment: true,
              imageMessage: mediaMsg.imageMessage,
            };
          }
        } catch (e) { /* fallback */ }
      }
      carouselCards.push(
        proto.Message.InteractiveMessage.CarouselCard.fromObject({
          header: proto.Message.InteractiveMessage.Header.fromObject(headerObj),
          body: proto.Message.InteractiveMessage.Body.fromObject({ text: card.body }),
          footer: card.footer ? proto.Message.InteractiveMessage.Footer.fromObject({ text: card.footer }) : undefined,
          nativeFlowMessage: {
            buttons: (card.buttons || []).map(b => ({
              name: 'quick_reply',
              buttonParamsJson: JSON.stringify({ display_text: b.text, id: b.id }),
            })),
          },
        })
      );
    }
    const m = generateWAMessageFromContent(ctx.remoteJid, {
      interactiveMessage: proto.Message.InteractiveMessage.fromObject({
        carouselMessage: { cards: carouselCards },
      }),
    }, { userJid: sock.user?.id, quoted: msg });
    await sock.relayMessage(ctx.remoteJid, m.message, {
      messageId: m.key.id,
      additionalNodes: [{ tag: 'biz', attrs: {}, content: [{
        tag: 'interactive', attrs: { type: 'native_flow', v: '1' },
        content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }],
      }] }],
    });
    return true;
  } catch (e) {
    console.error('[STORY] Carousel error:', e.message);
    return false;
  }
}

async function enviarImagem(sock, msg, ctx, imagePath, caption, botoes) {
  try {
    if (fs.existsSync(imagePath)) {
      const buffer = fs.readFileSync(imagePath);
      await sock.sendMessage(ctx.remoteJid, { image: buffer, caption }, { quoted: msg });
      if (botoes && botoes.length) {
        await enviarBotoes(sock, msg, ctx, '\u{1f446} Escolhe:', botoes);
      }
      return true;
    }
  } catch {}
  await tReply(sock, msg, ctx, '\u{1f4d6}', [caption]);
  if (botoes && botoes.length) await enviarBotoes(sock, msg, ctx, '\u{1f446} Escolhe:', botoes);
  return false;
}

// ══════════════════════════════════════════════════════════════
// STATUS COMPLETO DO JOGADOR
// ══════════════════════════════════════════════════════════════

async function mostrarStatus(sock, msg, ctx) {
  const p = await rpg.getPlayer(ctx.senderNumber);
  const race = rpg.RACES[p.race] || rpg.RACES.humano;
  const cls = rpg.CLASSES[p.class] || rpg.CLASSES.guerreiro;
  const barra = (cur, max) => {
    const n = Math.max(0, Math.min(10, Math.ceil((cur || 0) / (max || 1) * 10)));
    return '\u{1f7e9}'.repeat(n) + '\u2B1B'.repeat(10 - n);
  };
  const worldLinhas = [];
  for (const [id, w] of Object.entries(WORLDS)) {
    const prog = await getProgress(p, id);
    const capAtual = prog.capitulo || 0;
    const total = w.capitulos;
    const pct = total > 0 ? Math.round((capAtual / total) * 100) : 0;
    const teste = prog.testePassado ? '\u2705' : '\u{1f512}';
    const evo = w.evolucoes.reduce((acc, e) => capAtual >= e.nivel ? e : acc, w.evolucoes[0]);
    const desbloqueado = p.level >= w.nivelMin;
    if (desbloqueado) {
      worldLinhas.push(w.emoji + ' *' + w.name + '* ' + teste + ' ' + evo.emoji + ' ' + evo.titulo);
      worldLinhas.push('   ' + barra(capAtual, total) + ' ' + capAtual + '/' + total + ' (' + pct + '%)');
    } else {
      worldLinhas.push(w.emoji + ' *' + w.name + '* \u{1f512} Nv.' + w.nivelMin);
    }
  }
  let totalCaps = 0, totalCompletos = 0;
  for (const [id, w] of Object.entries(WORLDS)) {
    const prog = await getProgress(p, id);
    totalCaps += (prog.completos ? prog.completos.length : 0);
    if (prog.capitulo >= w.capitulos && w.capitulos > 0) totalCompletos++;
  }
  const gEmoji = p.gender === 'feminino' ? '\u{1f469}' : p.gender === 'masculino' ? '\u{1f468}' : '\u{1f9d1}';
  return tReply(sock, msg, ctx, race.emoji + ' ' + p.name.toUpperCase() + ' \u2014 STATUS', [
    gEmoji + ' *' + p.name + '* \u2014 ' + p.race + ' ' + cls.emoji + ' ' + p.class,
    p.title ? '\u{1f3c5} ' + p.title : '',
    '', '\u{1f4ca} *ESTATISTICAS*',
    '\u2B50 Nivel ' + p.level + ' | XP: ' + p.xp + '/' + p.xpNext,
    '\u2764\uFE0F HP: ' + p.hp + '/' + p.maxHp + ' | \u{1f499} MP: ' + p.mp + '/' + p.maxMp,
    '\u2694\uFE0F STR:' + p.stats.str + ' \u{1f3c3} DEX:' + p.stats.dex + ' \u{1f52e} INT:' + p.stats.int + ' \u{1f6e1}\uFE0F VIT:' + p.stats.vit + ' \u{1f340} LUK:' + p.stats.luk,
    '\u{1f4b0} ' + p.coins + ' coins | \u2764\uFE0F Vidas: ' + '\u2665\uFE0F'.repeat(p.lives) + '\u{1f5a4}'.repeat(Math.max(0, 3 - p.lives)),
    '', '\u{1f4d6} *MODO HISTORIA*',
    '\u{1f3c6} Mundos completos: ' + totalCompletos + '/' + Object.keys(WORLDS).length,
    '\u{1f4da} Capitulos concluidos: ' + totalCaps,
    '\u2728 Skills: ' + (p.skills || []).length + ' | \u{1f392} Itens: ' + (p.inventory || []).length,
    '', '*\u2500\u2500 PROGRESSO POR MUNDO \u2500\u2500*',
    ...worldLinhas,
    '', '\u2694\uFE0F *COMBATE*',
    '\u{1f480} ' + p.kills + ' kills | \u2620\uFE0F ' + p.deaths + ' mortes | \u{1f451} ' + p.bossKills + ' bosses',
    '\u{1f525} Streak: ' + p.streak + ' | Melhor: ' + p.bestStreak,
  ].filter(Boolean));
}

// ══════════════════════════════════════════════════════════════
// LISTAR MUNDOS \u2014 CARROSSEL COM IMAGENS
// ══════════════════════════════════════════════════════════════

async function listarMundos(sock, msg, ctx) {
  const p = await rpg.getPlayer(ctx.senderNumber);
  if (!p.storyProgress) p.storyProgress = {};
  const cards = [];
  for (const [id, w] of Object.entries(WORLDS)) {
    const prog = await getProgress(p, id);
    const capAtual = prog.capitulo || 0;
    const total = w.capitulos;
    const pct = total > 0 ? Math.round((capAtual / total) * 100) : 0;
    const desbloqueado = p.level >= w.nivelMin;
    const testePassado = prog.testePassado;
    const evo = w.evolucoes.reduce((acc, e) => capAtual >= e.nivel ? e : acc, w.evolucoes[0]);
    const status = !desbloqueado ? '\u{1f512} Bloqueado' : pct >= 100 ? '\u2705 Completo' : testePassado ? '\u{1f3ae} Em progresso' : '\u{1f4dd} Teste pendente';
    const barraStr = '\u{1f7e9}'.repeat(Math.min(10, Math.round(pct / 10))) + '\u2B1B'.repeat(10 - Math.min(10, Math.round(pct / 10)));
    const body = [
      w.desc, '', status,
      '\u{1f4ca} Nivel min: ' + w.nivelMin + ' | \u{1f3af} ' + capAtual + '/' + total + ' capitulos',
      barraStr,
      testePassado ? evo.emoji + ' Rank: ' + evo.titulo : '\u{1f512} Passa o teste primeiro!',
      '',
      desbloqueado ? '\u{1f3ae} Toca para entrar!' : '\u2B06\uFE0F Sobe para nivel ' + w.nivelMin,
    ].join('\n');
    const buttons = [];
    if (desbloqueado) {
      buttons.push(testePassado
        ? { text: '\u{1f3ae} Entrar', id: 'STORY_' + id }
        : { text: '\u{1f4dd} Teste Iniciante', id: 'STESTE_' + id });
    }
    buttons.push({ text: '\u{1f4ca} Info', id: 'SINFO_' + id });
    const imagePath = path.join(IMAGES_DIR, w.image);
    cards.push({
      title: w.emoji + ' ' + w.name,
      body, footer: desbloqueado ? (testePassado ? '\u{1f3ae} Pronto!' : '\u{1f4dd} Faz o teste!') : '\u{1f512} Bloqueado',
      imagePath, buttons,
    });
  }
  const headerText = [
    '\u{1f4d6} *MODO HISTORIA v11*',
    '\u{1f4ca} Nv.' + p.level + ' \u00B7 ' + Object.keys(WORLDS).length + ' mundos e',
    '', '> Desliza para ver todos os mundos! \u{1f447}',
  ].join('\n');
  const sent = await enviarCarrossel(sock, msg, ctx, cards);
  if (!sent) {
    const rows = [];
    for (const [id, w] of Object.entries(WORLDS)) {
      const prog = await getProgress(p, id);
      const desbloqueado = p.level >= w.nivelMin;
      const testePassado = prog.testePassado;
      if (desbloqueado) {
        rows.push({
          title: w.emoji + ' ' + w.name,
          description: testePassado ? prog.capitulo + '/' + w.capitulos + ' cap' : '\u{1f4dd} Teste',
          id: testePassado ? 'STORY_' + id : 'STESTE_' + id,
        });
      }
    }
    if (rows.length) await enviarLista(sock, msg, ctx, '\u{1f4d6} MUNDOS', rows, headerText);
    else await tReply(sock, msg, ctx, '\u{1f4d6} MODO HISTORIA', [headerText, '', '\u{1f512} Nenhum mundo desbloqueado.']);
  }
}

// ══════════════════════════════════════════════════════════════
// TESTE DE INICIANTE
// ══════════════════════════════════════════════════════════════

async function iniciarTeste(sock, msg, ctx, worldId) {
  const p = await rpg.getPlayer(ctx.senderNumber);
  const w = WORLDS[worldId];
  if (!w) return tReply(sock, msg, ctx, '\u274C', ['Mundo nao encontrado.']);
  if (p.level < w.nivelMin) return tReply(sock, msg, ctx, '\u{1f512} MUNDO BLOQUEADO', [w.emoji + ' *' + w.name + '*', 'Precisas de nivel *' + w.nivelMin + '*']);
  const prog = await getProgress(p, worldId);
  if (prog.testePassado) return tReply(sock, msg, ctx, w.emoji + ' ' + w.name, ['\u2705 Ja passaste o teste!']);
  if (!p._testState) p._testState = {};
  p._testState[worldId] = { pergunta: 0, acertos: 0 };
  await rpg.savePlayer(p);
  const imagePath = path.join(IMAGES_DIR, w.image);
  const intro = [w.emoji + ' *' + w.teste.titulo + '*', w.teste.descricao, '', '\u{1f4dd} *4 perguntas sobre ' + w.name + '*', '\u{1f3af} Precisas de acertar 3 para passar!', '', '> Vamos comecar!'].join('\n');
  await enviarImagem(sock, msg, ctx, imagePath, intro, [{ text: '\u{1f4dd} Comecar Teste', id: 'STESTQ_' + worldId + '_0' }]);
}

async function mostrarPergunta(sock, msg, ctx, worldId, perguntaIdx) {
  const p = await rpg.getPlayer(ctx.senderNumber);
  const w = WORLDS[worldId];
  if (!w || !w.teste || !w.teste.perguntas || !w.teste.perguntas[perguntaIdx]) return;
  const pergunta = w.teste.perguntas[perguntaIdx];
  const botoes = pergunta.opcoes.map((op, i) => ({ text: op.slice(0, 25), id: 'STESTA_' + worldId + '_' + perguntaIdx + '_' + i }));
  const corpo = [w.emoji + ' *' + w.teste.titulo + '*', '\u{1f4dd} Pergunta ' + (perguntaIdx + 1) + ' de ' + w.teste.perguntas.length, '', pergunta.q].join('\n');
  await enviarBotoes(sock, msg, ctx, corpo, botoes);
}

async function responderPergunta(sock, msg, ctx, worldId, perguntaIdx, respostaIdx) {
  const p = await rpg.getPlayer(ctx.senderNumber);
  const w = WORLDS[worldId];
  if (!w || !w.teste || !w.teste.perguntas || !w.teste.perguntas[perguntaIdx]) return;
  const pergunta = w.teste.perguntas[perguntaIdx];
  const correto = parseInt(respostaIdx) === pergunta.correta;
  if (!p._testState) p._testState = {};
  if (!p._testState[worldId]) p._testState[worldId] = { pergunta: 0, acertos: 0 };
  if (correto) p._testState[worldId].acertos++;
  const acertos = p._testState[worldId].acertos;
  const total = w.teste.perguntas.length;
  const proxima = perguntaIdx + 1;
  if (proxima < total) {
    const feedback = correto ? '\u2705 Correto!' : '\u274C Errado!';
    await enviarBotoes(sock, msg, ctx, feedback + '\n\n\u{1f4ca} Acertos: ' + acertos + '/' + total, [{ text: '\u25B6\uFE0F Proxima', id: 'STESTQ_' + worldId + '_' + proxima }]);
  } else {
    const passou = acertos >= Math.ceil(total * 0.75);
    const prog = await getProgress(p, worldId);
    if (passou) {
      prog.testePassado = true;
      prog.testePontos = acertos;
      rpg.addXP(p, 200);
      await rpg.savePlayer(p);
      const imagePath = path.join(IMAGES_DIR, w.image);
      await enviarImagem(sock, msg, ctx, imagePath, [w.emoji + ' *TESTE PASSADO!*', '\u2705 Acertos: ' + acertos + '/' + total, '\u2B50 +200 XP', '', '\u{1f389} Agora podes entrar no mundo de ' + w.name + '!'].join('\n'), [{ text: '\u{1f3ae} Entrar no Mundo', id: 'STORY_' + worldId }]);
    } else {
      await rpg.savePlayer(p);
      await enviarBotoes(sock, msg, ctx, [w.emoji + ' *TESTE REPROVADO*', '\u274C Acertos: ' + acertos + '/' + total + ' (min: ' + Math.ceil(total * 0.75) + ')', '', '\u{1f4aa} Estuda mais e tenta novamente!'].join('\n'), [
        { text: '\u{1f4dd} Tentar Novamente', id: 'STESTE_' + worldId },
        { text: '\u{1f4d6} Voltar aos Mundos', id: 'STORY_MENU' },
      ]);
    }
  }
}

async function mostrarInfoMundo(sock, msg, ctx, worldId) {
  const p = await rpg.getPlayer(ctx.senderNumber);
  const w = WORLDS[worldId];
  if (!w) return;
  const prog = await getProgress(p, worldId);
  const capAtual = prog.capitulo || 0;
  const total = w.capitulos;
  const pct = total > 0 ? Math.round((capAtual / total) * 100) : 0;
  const testePassado = prog.testePassado;
  const desbloqueado = p.level >= w.nivelMin;
  const evo = w.evolucoes.reduce((acc, e) => capAtual >= e.nivel ? e : acc, w.evolucoes[0]);
  const evoLinhas = w.evolucoes.map(e => (capAtual >= e.nivel ? '\u2705' : '\u{1f512}') + ' ' + e.emoji + ' ' + e.titulo + ' (Cap. ' + e.nivel + ')');
  const imagePath = path.join(IMAGES_DIR, w.image);
  const info = [
    w.emoji + ' *' + w.name.toUpperCase() + '*', w.desc, '',
    '\u{1f4ca} Nivel min: ' + w.nivelMin + ' | ' + (desbloqueado ? '\u2705 Desbloqueado' : '\u{1f512} Bloqueado'),
    '\u{1f4dd} Teste: ' + (testePassado ? '\u2705 Passado' : '\u274C Nao feito'),
    '\u{1f4da} Progresso: ' + capAtual + '/' + total + ' (' + pct + '%)',
    evo ? evo.emoji + ' Rank: ' + evo.titulo : '',
    '', '*\u2500\u2500 EVOLUCAO \u2500\u2500*', ...evoLinhas, '',
    '\u{1f3c6} Recompensa: ' + w.recompensaFinal.title,
    '\u{1f4b0} ' + w.recompensaFinal.coins + ' coins | \u2B50 ' + w.recompensaFinal.xp + ' XP',
    '\u{1f381} Item: ' + w.recompensaFinal.item,
  ].filter(Boolean);
  const botoes = [];
  if (desbloqueado && testePassado) botoes.push({ text: '\u{1f3ae} Entrar', id: 'STORY_' + worldId });
  else if (desbloqueado && !testePassado) botoes.push({ text: '\u{1f4dd} Fazer Teste', id: 'STESTE_' + worldId });
  botoes.push({ text: '\u{1f4d6} Voltar', id: 'STORY_MENU' });
  await enviarImagem(sock, msg, ctx, imagePath, info.join('\n'), botoes);
}

// ══════════════════════════════════════════════════════════════
// JOGAR UM MUNDO
// ══════════════════════════════════════════════════════════════

async function jogarMundo(sock, msg, ctx, worldId) {
  const p = await rpg.getPlayer(ctx.senderNumber);
  const w = WORLDS[worldId];
  if (!w) return tReply(sock, msg, ctx, '\u274C', ['Mundo nao encontrado.']);
  if (p.level < w.nivelMin) return tReply(sock, msg, ctx, '\u{1f512} BLOQUEADO', [w.emoji + ' *' + w.name + '*', 'Nivel *' + w.nivelMin + '* necessario. Tens *' + p.level + '*']);
  const prog = await getProgress(p, worldId);
  if (!prog.testePassado) return iniciarTeste(sock, msg, ctx, worldId);
  const chapters = _getChapters(worldId);
  if (!chapters.length) return tReply(sock, msg, ctx, w.emoji + ' ' + w.name, ['Sem capitulos.']);
  const capIdx = Math.min(prog.capitulo || 0, chapters.length - 1);
  return _mostrarCapitulo(sock, msg, ctx, p, w, chapters[capIdx], capIdx);
}

// ══════════════════════════════════════════════════════════════
// MOSTRAR CAPITULO
// ══════════════════════════════════════════════════════════════

async function _mostrarCapitulo(sock, msg, ctx, p, w, chapter, capIdx) {
  const prog = p.storyProgress[w.id];
  const nodeId = prog.node || (chapter.nodes[0] ? chapter.nodes[0].id : null);
  const node = chapter.nodes.find(n => n.id === nodeId) || chapter.nodes[0];
  if (!node) return tReply(sock, msg, ctx, w.emoji + ' ' + chapter.titulo, ['Capitulo vazio.']);
  const capituloLinhas = [w.emoji + ' *' + chapter.titulo + '*', '\u{1f4d6} Capitulo ' + (capIdx + 1) + ' de ' + w.capitulos, '\u{1f4ca} Nivel: ' + chapter.nivel, ''];
  const evo = w.evolucoes.reduce((acc, e) => capIdx >= e.nivel ? e : acc, w.evolucoes[0]);
  if (evo) capituloLinhas.push(evo.emoji + ' *Rank:* ' + evo.titulo, '');
  const corpo = capituloLinhas.join('\n') + node.texto;
  const imagePath = path.join(IMAGES_DIR, w.image);
  if (capIdx === 0 || node.boss || node.escolhas) {
    await enviarImagem(sock, msg, ctx, imagePath, corpo).catch(() => {});
  }
  if (node.escolhas && node.escolhas.length) {
    const botoes = node.escolhas.map((e, i) => ({ id: 'STORYC_' + w.id + '_' + chapter.id + '_' + node.id + '_' + i, text: e.txt.slice(0, 25) }));
    return enviarBotoes(sock, msg, ctx, corpo, botoes);
  }
  if (node.boss) {
    await tReply(sock, msg, ctx, w.emoji + ' ' + chapter.titulo, [corpo]);
    return _iniciarBossFight(sock, msg, ctx, p, w, chapter, node);
  }
  if (!node.next && !node.escolhas) {
    await tReply(sock, msg, ctx, w.emoji + ' ' + chapter.titulo, [corpo]);
    if (node.xp) rpg.addXP(p, node.xp);
    if (node.coins) p.coins += node.coins;
    if (node.item && !p.inventory.includes(node.item)) p.inventory.push(node.item);
    if (node.skill && !p.skills.includes(node.skill)) p.skills.push(node.skill);
    if (node.title) p.title = node.title;
    prog.capitulo = (prog.capitulo || 0) + 1;
    prog.node = null;
    if (!prog.completos) prog.completos = [];
    prog.completos.push(chapter.id);
    if (chapter.recompensas) {
      const r = chapter.recompensas;
      if (r.xp) rpg.addXP(p, r.xp);
      if (r.coins) p.coins += r.coins;
      if (r.item && !p.inventory.includes(r.item)) p.inventory.push(r.item);
      if (r.skill && !p.skills.includes(r.skill)) p.skills.push(r.skill);
      if (r.title) p.title = r.title;
    }
    await rpg.savePlayer(p);
    const chapters = _getChapters(w.id);
    if (prog.capitulo < chapters.length) {
      const proximo = chapters[prog.capitulo];
      const evo2 = w.evolucoes.reduce((acc, e) => prog.capitulo >= e.nivel ? e : acc, w.evolucoes[0]);
      await enviarBotoes(sock, msg, ctx, '\u2705 *' + chapter.titulo + '* completo!\n\n' + (evo2 ? evo2.emoji + ' *Rank:* ' + evo2.titulo + '\n' : '') + '\u{1f4d6} Proximo: *' + proximo.titulo + '*', [{ id: 'STORY_' + w.id, text: '\u{1f4d6} Proximo Capitulo' }]);
    } else {
      await enviarImagem(sock, msg, ctx, imagePath, '\u{1f3c6} *' + w.name + ' COMPLETO!*\n\n\u{1f389} PARABENS!\n\u{1f3c6} ' + w.recompensaFinal.title + '\n\u{1f381} ' + w.recompensaFinal.item + '\n\u{1f4b0} ' + w.recompensaFinal.coins + ' coins', [{ id: 'STORY_MENU', text: '\u{1f4d6} Outros Mundos' }]);
      const rf = w.recompensaFinal;
      if (rf.xp) rpg.addXP(p, rf.xp);
      if (rf.coins) p.coins += rf.coins;
      if (rf.item) p.inventory.push(rf.item);
      if (rf.title) p.title = rf.title;
      await rpg.savePlayer(p);
    }
    return;
  }
  if (node.next) {
    await enviarBotoes(sock, msg, ctx, corpo, [{ id: 'STORYN_' + w.id + '_' + chapter.id + '_' + node.next, text: '\u25B6\uFE0F Continuar' }]);
    return;
  }
  await tReply(sock, msg, ctx, w.emoji + ' ' + chapter.titulo, [corpo]);
}

async function _iniciarBossFight(sock, msg, ctx, p, w, chapter, node) {
  const boss = node.boss;
  await enviarBotoes(sock, msg, ctx, ['\u{1f451} *BOSS: ' + boss.nome + '*', boss.descricao, '', '\u2764\uFE0F HP: ' + boss.hp + ' | \u2694\uFE0F ATK: ' + boss.atk + ' | \u{1f6e1}\uFE0F DEF: ' + boss.def, '\u2728 ' + boss.habilidades.join(', '), '', '\u{1f3af} Escolhe:'].join('\n'), [
    { id: 'RPGFIGHT_' + boss.nome.replace(/ /g, '_'), text: '\u2694\uFE0F Lutar!' },
    { id: 'STORY_' + w.id, text: '\u{1f3c3} Fugir' },
  ]);
}

// ══════════════════════════════════════════════════════════════
// PROCESSAR CLIQUES
// ══════════════════════════════════════════════════════════════

async function resolverClique(sock, msg, ctx, token) {
  const tk = String(token || '');
  if (tk === 'STORY_MENU') { await listarMundos(sock, msg, ctx); return true; }
  let m = tk.match(/^STORY_([a-z]+)$/i);
  if (m) { await jogarMundo(sock, msg, ctx, m[1].toLowerCase()); return true; }
  m = tk.match(/^STESTE_([a-z]+)$/i);
  if (m) { await iniciarTeste(sock, msg, ctx, m[1].toLowerCase()); return true; }
  m = tk.match(/^STESTQ_([a-z]+)_(\d+)$/i);
  if (m) { await mostrarPergunta(sock, msg, ctx, m[1].toLowerCase(), parseInt(m[2])); return true; }
  m = tk.match(/^STESTA_([a-z]+)_(\d+)_(\d+)$/i);
  if (m) { await responderPergunta(sock, msg, ctx, m[1].toLowerCase(), parseInt(m[2]), parseInt(m[3])); return true; }
  m = tk.match(/^SINFO_([a-z]+)$/i);
  if (m) { await mostrarInfoMundo(sock, msg, ctx, m[1].toLowerCase()); return true; }
  m = tk.match(/^STORYC_([a-z]+)_([^_]+)_([^_]+)_(\d+)$/i);
  if (m) { await _processarEscolha(sock, msg, ctx, m[1], m[2], m[3], parseInt(m[4])); return true; }
  m = tk.match(/^STORYN_([a-z]+)_([^_]+)_([^_]+)$/i);
  if (m) { await _processarProximo(sock, msg, ctx, m[1], m[2], m[3]); return true; }
  return false;
}

async function _processarEscolha(sock, msg, ctx, worldId, chapterId, nodeId, choiceIdx) {
  const p = await rpg.getPlayer(ctx.senderNumber);
  const w = WORLDS[worldId];
  const chapters = _getChapters(worldId);
  const chapter = chapters.find(c => c.id === chapterId);
  if (!chapter) return tReply(sock, msg, ctx, '\u274C', ['Capitulo nao encontrado.']);
  const node = chapter.nodes.find(n => n.id === nodeId);
  if (!node || !node.escolhas || !node.escolhas[choiceIdx]) return tReply(sock, msg, ctx, '\u274C', ['Escolha invalida.']);
  const choice = node.escolhas[choiceIdx];
  if (choice.xp) rpg.addXP(p, choice.xp);
  if (choice.coins) p.coins += choice.coins;
  if (choice.item && !p.inventory.includes(choice.item)) p.inventory.push(choice.item);
  if (choice.skill && !p.skills.includes(choice.skill)) p.skills.push(choice.skill);
  if (choice.title) p.title = choice.title;
  const prog = await getProgress(p, worldId);
  prog.node = choice.next || null;
  if (choice.next) {
    const nextNode = chapter.nodes.find(n => n.id === choice.next);
    if (nextNode) {
      await rpg.savePlayer(p);
      const corpo = w.emoji + ' *' + chapter.titulo + '*\n\n' + nextNode.texto;
      if (nextNode.escolhas && nextNode.escolhas.length) {
        const botoes = nextNode.escolhas.map((e, i) => ({ id: 'STORYC_' + worldId + '_' + chapterId + '_' + nextNode.id + '_' + i, text: e.txt.slice(0, 25) }));
        await enviarBotoes(sock, msg, ctx, corpo, botoes);
      } else if (nextNode.next) {
        await enviarBotoes(sock, msg, ctx, corpo, [{ id: 'STORYN_' + worldId + '_' + chapterId + '_' + nextNode.next, text: '\u25B6\uFE0F Continuar' }]);
      } else {
        await tReply(sock, msg, ctx, w.emoji + ' ' + chapter.titulo, [corpo]);
        prog.capitulo = (prog.capitulo || 0) + 1; prog.node = null;
        if (!prog.completos) prog.completos = [];
        prog.completos.push(chapterId);
        await rpg.savePlayer(p);
        if (prog.capitulo < chapters.length) {
          await enviarBotoes(sock, msg, ctx, '\u2705 Capitulo completo!', [{ id: 'STORY_' + worldId, text: '\u{1f4d6} Proximo' }]);
        }
      }
      return;
    }
  }
  prog.capitulo = (prog.capitulo || 0) + 1; prog.node = null;
  if (!prog.completos) prog.completos = [];
  prog.completos.push(chapterId);
  await rpg.savePlayer(p);
  await tReply(sock, msg, ctx, w.emoji + ' ' + chapter.titulo, ['\u2705 Escolha: *' + choice.txt + '*', choice.xp ? '\u2B50 +' + choice.xp + ' XP' : '', choice.item ? '\u{1f392} +' + choice.item : '', '', '> Proximo com *!historia*'].filter(Boolean));
}

async function _processarProximo(sock, msg, ctx, worldId, chapterId, nextNodeId) {
  const p = await rpg.getPlayer(ctx.senderNumber);
  const w = WORLDS[worldId];
  const chapters = _getChapters(worldId);
  const chapter = chapters.find(c => c.id === chapterId);
  if (!chapter) return;
  const node = chapter.nodes.find(n => n.id === nextNodeId);
  if (!node) return;
  const prog = await getProgress(p, worldId);
  prog.node = nextNodeId;
  await rpg.savePlayer(p);
  const corpo = w.emoji + ' *' + chapter.titulo + '*\n\n' + node.texto;
  if (node.escolhas && node.escolhas.length) {
    const botoes = node.escolhas.map((e, i) => ({ id: 'STORYC_' + worldId + '_' + chapterId + '_' + node.id + '_' + i, text: e.txt.slice(0, 25) }));
    await enviarBotoes(sock, msg, ctx, corpo, botoes);
  } else if (node.next) {
    await enviarBotoes(sock, msg, ctx, corpo, [{ id: 'STORYN_' + worldId + '_' + chapterId + '_' + node.next, text: '\u25B6\uFE0F Continuar' }]);
  } else {
    await tReply(sock, msg, ctx, w.emoji + ' ' + chapter.titulo, [corpo]);
    prog.capitulo = (prog.capitulo || 0) + 1; prog.node = null;
    if (!prog.completos) prog.completos = [];
    prog.completos.push(chapterId);
    await rpg.savePlayer(p);
  }
}

module.exports = {
  WORLDS, NARUTO_CHAPTERS, listarMundos, jogarMundo, iniciarTeste,
  mostrarStatus, resolverClique, getProgress, _getChapters,
  enviarBotoes, enviarLista, enviarCarrossel, enviarImagem, tReply,
};
