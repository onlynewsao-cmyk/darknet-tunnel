'use strict';
/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║   DARK BOT — RPG STORY MODE v10.0                               ║
 * ║   Modo História ÉPICO com mundos de anime completos              ║
 * ║                                                                   ║
 * ║   MUNDOS: Naruto | One Piece | Solo Leveling | Jujutsu Kaisen   ║
 * ║           Dragon Ball | Demon Slayer | Devil May Cry | Bleach    ║
 * ║                                                                   ║
 * ║   Cada mundo: 20-40 capítulos, boss fights, escolhas, loot,     ║
 * ║   cutscenes, diálogos com NPCs, transformações, recompensas     ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

const rpg = require('./engine');
const combat = require('./combat');
const config = require('../../config');

const R = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const P = (a) => a[Math.floor(Math.random() * a.length)];

// ══════════════════════════════════════════════════════════════
// CATÁLOGO DE MUNDOS
// ══════════════════════════════════════════════════════════════
const WORLDS = {
  naruto: {
    id: 'naruto', emoji: '🍥', name: 'Naruto',
    desc: 'O mundo dos shinobis. Chakra, Jutsus e o Caminho Ninja.',
    cor: '#FF6B00',
    nivelMin: 1,
    capitulos: 0, // será atualizado
    recompensaFinal: { item: 'Rasengan Absoluto', title: 'Hokage', xp: 5000, coins: 10000 },
  },
  onepiece: {
    id: 'onepiece', emoji: '🏴‍☠️', name: 'One Piece',
    desc: 'Grand Line espera. Haki, Akuma no Mi e o Rei dos Piratas.',
    cor: '#E60012',
    nivelMin: 5,
    capitulos: 0,
    recompensaFinal: { item: 'Gomu Gomu no Mi Awakened', title: 'Rei dos Piratas', xp: 8000, coins: 15000 },
  },
  sololeveling: {
    id: 'sololeveling', emoji: '⚔️', name: 'Solo Leveling',
    desc: 'O Sistema escolheu-te. Portões, Monstro e Monarca das Sombras.',
    cor: '#7B2FBE',
    nivelMin: 10,
    capitulos: 0,
    recompensaFinal: { item: 'Arma do Monarca', title: 'Monarca das Sombras', xp: 10000, coins: 20000 },
  },
  jjk: {
    id: 'jjk', emoji: '👁️', name: 'Jujutsu Kaisen',
    desc: 'Maldições, Domínios e o Infinito. O mundo das trevas.',
    cor: '#2D1B69',
    nivelMin: 15,
    capitulos: 0,
    recompensaFinal: { item: 'Olho de Sukuna', title: 'Feiticeiro Especial', xp: 12000, coins: 25000 },
  },
  dragonball: {
    id: 'dragonball', emoji: '🐉', name: 'Dragon Ball',
    desc: 'Ki, Transformações e o Universo em jogo. Além dos limites.',
    cor: '#FF9500',
    nivelMin: 20,
    capitulos: 0,
    recompensaFinal: { item: 'Esfera do Dragão Dourada', title: 'Guerreiro Lendário', xp: 15000, coins: 30000 },
  },
  demonslayer: {
    id: 'demonslayer', emoji: '🗡️', name: 'Demon Slayer',
    desc: 'Respirações, Demônios e o Juramento do Hashira.',
    cor: '#1a1a2e',
    nivelMin: 8,
    capitulos: 0,
    recompensaFinal: { item: 'Espada Nichirin Dourada', title: 'Hashira Supremo', xp: 9000, coins: 18000 },
  },
  dmc: {
    id: 'dmc', emoji: '😈', name: 'Devil May Cry',
    desc: 'Dante, demônios e estilo. O sangue de Sparda corre em ti.',
    cor: '#8B0000',
    nivelMin: 12,
    capitulos: 0,
    recompensaFinal: { item: 'Rebellion Awakened', title: 'Filho de Sparda', xp: 11000, coins: 22000 },
  },
  bleach: {
    id: 'bleach', emoji: '👻', name: 'Bleach',
    desc: 'Zanpakutō, Soul Society e o poder dos Quincy.',
    cor: '#FF4500',
    nivelMin: 18,
    capitulos: 0,
    recompensaFinal: { item: 'Zangetsu Final', title: 'Shinigami Capitão', xp: 13000, coins: 27000 },
  },
};

// ══════════════════════════════════════════════════════════════
// ESTRUTURA DE UM CAPÍTULO
// ══════════════════════════════════════════════════════════════
/*
  Cada capítulo tem:
  - id: identificador único
  - titulo: nome do capítulo
  - descricao: texto narrativo
  - nodes: array de story nodes
    - node: { id, texto, falante?, escolhas?, boss?, loot?, xp?, next?, cutscene? }
  - boss: opcional — boss fight no final
  - recompensas: xp, coins, items, skills, transforms
*/

// ══════════════════════════════════════════════════════════════
// NARUTO — 30 CAPÍTULOS COMPLETOS
// ══════════════════════════════════════════════════════════════
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

// Atualizar contagem de capítulos
WORLDS.naruto.capitulos = NARUTO_CHAPTERS.length;

// ══════════════════════════════════════════════════════════════
// REGISTO DE PROGRESSO DO JOGADOR
// ══════════════════════════════════════════════════════════════
// O progresso vive no RPGPlayer.storyProgress:
// { naruto: { capitulo: 0, node: 'n1_01', completos: [] }, ... }

async function getProgress(p, worldId) {
  if (!p.storyProgress) p.storyProgress = {};
  if (!p.storyProgress[worldId]) {
    p.storyProgress[worldId] = { capitulo: 0, node: null, completos: [] };
  }
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
        footer: { text: '📖 RPG Story Mode' },
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
        footer: { text: '📖 RPG Story Mode' },
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
// LISTAR MUNDOS DISPONÍVEIS
// ══════════════════════════════════════════════════════════════

async function listarMundos(sock, msg, ctx) {
  const p = await rpg.getPlayer(ctx.senderNumber);
  const mundoLinhas = [];
  const rows = [];

  for (const [id, w] of Object.entries(WORLDS)) {
    const prog = await getProgress(p, id);
    const capAtual = prog.capitulo || 0;
    const total = w.capitulos;
    const pct = total > 0 ? Math.round((capAtual / total) * 100) : 0;
    const barra = '🟩'.repeat(Math.min(10, Math.round(pct / 10))) + '⬛'.repeat(10 - Math.min(10, Math.round(pct / 10)));
    const desbloqueado = p.level >= w.nivelMin;
    const status = !desbloqueado ? `🔒 Nv.${w.nivelMin}` : capAtual >= total ? '✅ COMPLETO' : `${pct}%`;

    mundoLinhas.push(
      `${w.emoji} *${w.name}* ${status}`,
      `   ${barra} ${capAtual}/${total} capítulos`,
      desbloqueado ? '' : `   🔒 Precisas de nível ${w.nivelMin}`,
      ''
    );

    if (desbloqueado) {
      rows.push({
        title: `${w.emoji} ${w.name}`,
        description: `${capAtual}/${total} capítulos · ${status}`,
        id: `STORY_${id}`,
      });
    }
  }

  const corpo = [
    `📖 *MODO HISTÓRIA*`,
    `📊 Nível ${p.level} · ${Object.keys(WORLDS).length} mundos`,
    '',
    ...mundoLinhas,
    '> Toca num mundo para jogar! 👇',
  ].join('\n');

  if (rows.length) {
    await enviarLista(sock, msg, ctx, '📖 MUNDOS', rows, corpo);
  } else {
    await tReply(sock, msg, ctx, '📖 MODO HISTÓRIA', [corpo]);
  }
}

// ══════════════════════════════════════════════════════════════
// JOGAR UM MUNDO
// ══════════════════════════════════════════════════════════════

async function jogarMundo(sock, msg, ctx, worldId) {
  const p = await rpg.getPlayer(ctx.senderNumber);
  const w = WORLDS[worldId];
  if (!w) return tReply(sock, msg, ctx, '❌', ['Mundo não encontrado.']);

  if (p.level < w.nivelMin) {
    return tReply(sock, msg, ctx, '🔒 MUNDO BLOQUEADO', [
      `${w.emoji} *${w.name}*`,
      `Precisas de nível *${w.nivelMin}* para entrar.`,
      `Agora tens nível *${p.level}*.`,
    ]);
  }

  // Obter capítulos do mundo
  const chapters = _getChapters(worldId);
  if (!chapters.length) {
    return tReply(sock, msg, ctx, `${w.emoji} ${w.name}`, ['📖 Este mundo ainda não tem capítulos.']);
  }

  const prog = await getProgress(p, worldId);
  const capIdx = Math.min(prog.capitulo || 0, chapters.length - 1);
  const chapter = chapters[capIdx];

  // Mostrar capítulo atual
  return _mostrarCapitulo(sock, msg, ctx, p, w, chapter, capIdx);
}

function _getChapters(worldId) {
  const map = { naruto: NARUTO_CHAPTERS, onepiece: ONEPIECE_CHAPTERS };
  return map[worldId] || [];
}

// ══════════════════════════════════════════════════════════════
// MOSTRAR CAPÍTULO
// ══════════════════════════════════════════════════════════════

async function _mostrarCapitulo(sock, msg, ctx, p, w, chapter, capIdx) {
  const prog = p.storyProgress[w.id];
  const nodeId = prog.node || chapter.nodes[0]?.id;
  const node = chapter.nodes.find(n => n.id === nodeId) || chapter.nodes[0];

  if (!node) return tReply(sock, msg, ctx, `${w.emoji} ${chapter.titulo}`, ['Capítulo vazio.']);

  // Mostrar texto narrativo
  const header = [
    `${w.emoji} *${chapter.titulo}*`,
    `📖 Capítulo ${capIdx + 1} de ${w.capitulos}`,
    `📊 Nível recomendado: ${chapter.nivel}`,
    '',
  ].join('\n');

  const corpo = header + node.texto;

  // Se tem escolhas → botões
  if (node.escolhas?.length) {
    const botoes = node.escolhas.map((e, i) => ({
      id: `STORYC_${w.id}_${chapter.id}_${node.id}_${i}`,
      text: e.txt.slice(0, 25),
    }));

    await enviarBotoes(sock, msg, ctx, corpo, botoes);
    return;
  }

  // Se tem boss → iniciar combate
  if (node.boss) {
    await tReply(sock, msg, ctx, `${w.emoji} ${chapter.titulo}`, [corpo]);
    // Iniciar combate especial com stats do boss
    return _iniciarBossFight(sock, msg, ctx, p, w, chapter, node);
  }

  // Se é nó final (sem next) → avançar capítulo
  if (!node.next && !node.escolhas) {
    await tReply(sock, msg, ctx, `${w.emoji} ${chapter.titulo}`, [corpo]);

    // Aplicar recompensas do nó
    if (node.xp) rpg.addXP(p, node.xp);
    if (node.coins) p.coins += node.coins;
    if (node.item) p.inventory.push(node.item);
    if (node.skill && !p.skills.includes(node.skill)) p.skills.push(node.skill);
    if (node.title) p.title = node.title;

    // Avançar para próximo capítulo
    prog.capitulo = (prog.capitulo || 0) + 1;
    prog.node = null;
    if (!prog.completos) prog.completos = [];
    prog.completos.push(chapter.id);

    // Recompensas do capítulo
    if (chapter.recompensas) {
      const r = chapter.recompensas;
      if (r.xp) rpg.addXP(p, r.xp);
      if (r.coins) p.coins += r.coins;
      if (r.item && !p.inventory.includes(r.item)) p.inventory.push(r.item);
      if (r.skill && !p.skills.includes(r.skill)) p.skills.push(r.skill);
      if (r.title) p.title = r.title;
    }

    await rpg.savePlayer(p);

    // Mostrar botão para próximo capítulo
    const chapters = _getChapters(w.id);
    if (prog.capitulo < chapters.length) {
      const proximo = chapters[prog.capitulo];
      await enviarBotoes(sock, msg, ctx, `✅ *${chapter.titulo}* completo!\n\n📖 Próximo: *${proximo.titulo}*\n📊 Nível: ${proximo.nivel}`, [
        { id: `STORY_${w.id}`, text: '📖 Próximo Capítulo' },
      ]);
    } else {
      await tReply(sock, msg, ctx, `🏆 ${w.name} COMPLETO!`, [
        `🎉 *PARABÉNS! Completaste toda a história de ${w.name}!*`,
        `🏆 Recompensa final: ${w.recompensaFinal.title}`,
        '',
        '> Explora outros mundos com *!historia*',
      ]);
      // Recompensa final
      const rf = w.recompensaFinal;
      if (rf.xp) rpg.addXP(p, rf.xp);
      if (rf.coins) p.coins += rf.coins;
      if (rf.item) p.inventory.push(rf.item);
      if (rf.title) p.title = rf.title;
      await rpg.savePlayer(p);
    }
    return;
  }

  // Nó com next → mostrar com botão "Continuar"
  if (node.next) {
    const botoes = [{ id: `STORYN_${w.id}_${chapter.id}_${node.next}`, text: '▶️ Continuar' }];
    await enviarBotoes(sock, msg, ctx, corpo, botoes);
    return;
  }

  // Fallback
  await tReply(sock, msg, ctx, `${w.emoji} ${chapter.titulo}`, [corpo]);
}

// ══════════════════════════════════════════════════════════════
// BOSS FIGHT ESPECIAL
// ══════════════════════════════════════════════════════════════

async function _iniciarBossFight(sock, msg, ctx, p, w, chapter, node) {
  const boss = node.boss;
  // Usar o sistema de combate existente com stats especiais
  await tReply(sock, msg, ctx, `👑 BOSS: ${boss.nome}`, [
    `${boss.descricao}`,
    `❤️ HP: ${boss.hp} | ⚔️ ATK: ${boss.atk} | 🛡️ DEF: ${boss.def}`,
    `✨ Habilidades: ${boss.habilidades.join(', ')}`,
    '',
    '> Usa *!lutar boss* para enfrentar!',
  ]);
}

// ══════════════════════════════════════════════════════════════
// PROCESSAR CLIQUES
// ══════════════════════════════════════════════════════════════

async function resolverClique(sock, msg, ctx, token) {
  const tk = String(token || '');

  // STORY_<worldId> — entrar num mundo
  let m = tk.match(/^STORY_([a-z]+)$/i);
  if (m) {
    await jogarMundo(sock, msg, ctx, m[1].toLowerCase());
    return true;
  }

  // STORYC_<worldId>_<chapterId>_<nodeId>_<choiceIdx> — escolha numa história
  m = tk.match(/^STORYC_([a-z]+)_([^_]+)_([^_]+)_(\d+)$/i);
  if (m) {
    const [, worldId, chapterId, nodeId, choiceIdx] = m;
    await _processarEscolha(sock, msg, ctx, worldId, chapterId, nodeId, parseInt(choiceIdx));
    return true;
  }

  // STORYN_<worldId>_<chapterId>_<nextNodeId> — próximo nó
  m = tk.match(/^STORYN_([a-z]+)_([^_]+)_([^_]+)$/i);
  if (m) {
    const [, worldId, chapterId, nextNodeId] = m;
    await _processarProximo(sock, msg, ctx, worldId, chapterId, nextNodeId);
    return true;
  }

  return false;
}

async function _processarEscolha(sock, msg, ctx, worldId, chapterId, nodeId, choiceIdx) {
  const p = await rpg.getPlayer(ctx.senderNumber);
  const w = WORLDS[worldId];
  const chapters = _getChapters(worldId);
  const chapter = chapters.find(c => c.id === chapterId);
  if (!chapter) return tReply(sock, msg, ctx, '❌', ['Capítulo não encontrado.']);

  const node = chapter.nodes.find(n => n.id === nodeId);
  if (!node?.escolhas?.[choiceIdx]) return tReply(sock, msg, ctx, '❌', ['Escolha inválida.']);

  const choice = node.escolhas[choiceIdx];

  // Aplicar recompensas da escolha
  if (choice.xp) rpg.addXP(p, choice.xp);
  if (choice.coins) p.coins += choice.coins;
  if (choice.item) p.inventory.push(choice.item);
  if (choice.skill && !p.skills.includes(choice.skill)) p.skills.push(choice.skill);
  if (choice.title) p.title = choice.title;

  // Avançar para o próximo nó
  const prog = await getProgress(p, worldId);
  prog.node = choice.next || null;

  // Se tem next → mostrar esse nó
  if (choice.next) {
    const nextNode = chapter.nodes.find(n => n.id === choice.next);
    if (nextNode) {
      await rpg.savePlayer(p);
      const corpo = `${w.emoji} *${chapter.titulo}*\n📖 Capítulo ${chapters.indexOf(chapter) + 1}\n\n${nextNode.texto}`;

      if (nextNode.escolhas?.length) {
        const botoes = nextNode.escolhas.map((e, i) => ({
          id: `STORYC_${worldId}_${chapterId}_${nextNode.id}_${i}`,
          text: e.txt.slice(0, 25),
        }));
        await enviarBotoes(sock, msg, ctx, corpo, botoes);
      } else if (nextNode.next) {
        await enviarBotoes(sock, msg, ctx, corpo, [
          { id: `STORYN_${worldId}_${chapterId}_${nextNode.next}`, text: '▶️ Continuar' },
        ]);
      } else {
        // Nó final
        await tReply(sock, msg, ctx, `${w.emoji} ${chapter.titulo}`, [corpo]);
        // Avançar capítulo
        prog.capitulo = (prog.capitulo || 0) + 1;
        prog.node = null;
        if (!prog.completos) prog.completos = [];
        prog.completos.push(chapterId);

        // Recompensas do capítulo
        if (chapter.recompensas) {
          const r = chapter.recompensas;
          if (r.xp) rpg.addXP(p, r.xp);
          if (r.coins) p.coins += r.coins;
          if (r.item && !p.inventory.includes(r.item)) p.inventory.push(r.item);
          if (r.skill && !p.skills.includes(r.skill)) p.skills.push(r.skill);
          if (r.title) p.title = r.title;
        }
        await rpg.savePlayer(p);

        // Botão próximo capítulo
        if (prog.capitulo < chapters.length) {
          const proximo = chapters[prog.capitulo];
          await enviarBotoes(sock, msg, ctx, `✅ Capítulo completo!\n\n📖 Próximo: *${proximo.titulo}*`, [
            { id: `STORY_${worldId}`, text: '📖 Próximo Capítulo' },
          ]);
        }
      }
      return;
    }
  }

  // Sem next → avançar capítulo
  prog.capitulo = (prog.capitulo || 0) + 1;
  prog.node = null;
  if (!prog.completos) prog.completos = [];
  prog.completos.push(chapterId);
  await rpg.savePlayer(p);

  await tReply(sock, msg, ctx, `${w.emoji} ${chapter.titulo}`, [
    `✅ Escolha: *${choice.txt}*`,
    choice.xp ? `⭐ +${choice.xp} XP` : '',
    choice.item ? `🎒 +${choice.item}` : '',
    '',
    '> Próximo capítulo disponível com *!historia*',
  ].filter(Boolean));
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

  const corpo = `${w.emoji} *${chapter.titulo}*\n📖 Capítulo ${chapters.indexOf(chapter) + 1}\n\n${node.texto}`;

  if (node.escolhas?.length) {
    const botoes = node.escolhas.map((e, i) => ({
      id: `STORYC_${worldId}_${chapterId}_${node.id}_${i}`,
      text: e.txt.slice(0, 25),
    }));
    await enviarBotoes(sock, msg, ctx, corpo, botoes);
  } else if (node.next) {
    await enviarBotoes(sock, msg, ctx, corpo, [
      { id: `STORYN_${worldId}_${chapterId}_${node.next}`, text: '▶️ Continuar' },
    ]);
  } else {
    await tReply(sock, msg, ctx, `${w.emoji} ${chapter.titulo}`, [corpo]);
    // Avançar capítulo
    prog.capitulo = (prog.capitulo || 0) + 1;
    prog.node = null;
    if (!prog.completos) prog.completos = [];
    prog.completos.push(chapterId);
    await rpg.savePlayer(p);
  }
}

module.exports = {
  WORLDS,
  NARUTO_CHAPTERS,
  listarMundos,
  jogarMundo,
  resolverClique,
  getProgress,
  _getChapters,
  enviarBotoes,
  enviarLista,
  tReply,
};

// ══════════════════════════════════════════════════════════════
// ONE PIECE — 35 CAPÍTULOS ÉPICOS
// ══════════════════════════════════════════════════════════════
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

WORLDS.onepiece.capitulos = ONEPIECE_CHAPTERS.length;

// Atualizar _getChapters para incluir One Piece
const _origGetChapters = _getChapters;
function _getChaptersNew(worldId) {
  const map = { naruto: NARUTO_CHAPTERS, onepiece: ONEPIECE_CHAPTERS };
  return map[worldId] || [];
}

// Sobrescrever a função
module.exports._getChapters = _getChaptersNew;


// ══════════════════════════════════════════════════════════════
// SOLO LEVELING — 25 CAPÍTULOS ÉPICOS
// ══════════════════════════════════════════════════════════════
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

WORLDS.sololeveling.capitulos = SOLOLEVELING_CHAPTERS.length;

// Atualizar _getChapters
function _getChapters(worldId) {
  const map = { naruto: NARUTO_CHAPTERS, onepiece: ONEPIECE_CHAPTERS, sololeveling: SOLOLEVELING_CHAPTERS };
  return map[worldId] || [];
}

