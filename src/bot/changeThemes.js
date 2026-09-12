/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║   DARK BOT v5 — changeThemes.js                             ║
 * ║   Sistema de Temas Visuais Globais                          ║
 * ║   Cada tema = identidade visual completa e única            ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * Cada tema define:
 *  frame      → 6 caracteres [TL, TR, BL, BR, H, V]
 *  bullet     → marcador de lista
 *  sep        → separador entre itens
 *  accent     → caracter/emoji de destaque
 *  icon       → ícone principal do tema
 *  vibe       → assinatura / rodapé
 *  headerDec  → decoração do cabeçalho (usa {TITLE})
 *  react      → emoji de reação nos comandos
 *  tip        → dica/assinatura do tema
 *  menuTitle  → título do menu principal
 *  menuFooter → rodapé do menu
 *  thumbText  → texto nas captions/thumbnails
 *  sectionSep → separador entre secções
 *  style      → índice FRAMES no menuThemes.js (0-9)
 *  emoji      → emoji do tema
 */

'use strict';

const THEMES = {

  // ════════════════════════════════════════════════════════
  //  0. DARK  (identidade padrão — completamente única)
  //     Símbolo: teia de aranha  |  Estética: abismo, sombra
  // ════════════════════════════════════════════════════════
  dark: {
    name:       'dark',
    label:      '🕸️ DARK — Abismo Engine',
    emoji:      '🕸️',
    style:      0,
    frame:      ['╭', '╮', '╰', '╯', '─', '│'],
    bullet:     '▸',
    sep:        '⌁',
    accent:     '🕸️',
    icon:       '🌑',
    vibe:       '🌑 ᴅᴀʀᴋ ᴇɴɢɪɴᴇ ᴠ5 🕸️',
    headerDec:  '╭─⌁─〔 {TITLE} 〕─⌁─╮',
    react:      '⏳',
    tip:        '🌑 O abismo não faz barulho — age.',
    menuTitle:  '🕸️ DARK BOT — Painel Sombrio',
    menuFooter: '> 🌑 Dark Engine v5 | 🕸️ Dark Net',
    thumbText:  '🕸️ {BOT}',
    sectionSep: '╰─⌁──────────────────⌁─╯',
  },

  // ════════════════════════════════════════════════════════
  //  1. CYBER  —  Identidade: Matriz / Código Verde / Neural
  // ════════════════════════════════════════════════════════
  cyber: {
    name:       'cyber',
    label:      '🧬 CYBER — Neural Matrix',
    emoji:      '🧬',
    style:      1,
    frame:      ['┏', '┓', '┗', '┛', '━', '┃'],
    bullet:     '⌬',
    sep:        '⟐',
    accent:     '◈',
    icon:       '🧬',
    vibe:       '░▒▓ NEURAL MATRIX ▓▒░',
    headerDec:  '┏⟐⟐〔 {TITLE} 〕⟐⟐┓',
    react:      '🔄',
    tip:        '🧬 Código vivo: evolui a cada interacção.',
    menuTitle:  '🧬 CYBER — Neural Matrix',
    menuFooter: '> ░▒▓ NEURAL MATRIX ▓▒░',
    thumbText:  '🧬 {BOT}',
    sectionSep: '┣━⟐━━━━━━━━━━━━━━━━⟐━┫',
  },

  // ════════════════════════════════════════════════════════
  //  2. ROYAL  —  Identidade: Ouro / Coroa / Aura Suprema
  // ════════════════════════════════════════════════════════
  royal: {
    name:       'royal',
    label:      '👑 ROYAL — Soberania Suprema',
    emoji:      '👑',
    style:      2,
    frame:      ['╔', '╗', '╚', '╝', '═', '║'],
    bullet:     '◈',
    sep:        '✦',
    accent:     '♾️',
    icon:       '👑',
    vibe:       '♾️ +999.999 AURA REAL ♾️',
    headerDec:  '╔✦✦〔 {TITLE} 〕✦✦╗',
    react:      '👑',
    tip:        '♾️ Soberania não se explica — sente-se.',
    menuTitle:  '👑 ROYAL — Soberania Suprema',
    menuFooter: '> ♾️ +999.999 AURA REAL ♾️',
    thumbText:  '👑 {BOT}',
    sectionSep: '╠══✦══════════════╦══╣',
  },

  // ════════════════════════════════════════════════════════
  //  3. SHADOW  —  Identidade: Minimalismo / Sombra Silenciosa
  // ════════════════════════════════════════════════════════
  shadow: {
    name:       'shadow',
    label:      '🌫️ SHADOW — Silêncio Absoluto',
    emoji:      '🌫️',
    style:      3,
    frame:      ['┌', '┐', '└', '┘', '─', '│'],
    bullet:     '·',
    sep:        '∙',
    accent:     '○',
    icon:       '🌫️',
    vibe:       '∙ ∙ ∙  s i l ê n c i o  ∙ ∙ ∙',
    headerDec:  '┌∙∙∙〔 {TITLE} 〕∙∙∙┐',
    react:      '🌫️',
    tip:        '🌫️ O silêncio é a linguagem mais poderosa.',
    menuTitle:  '🌫️ SHADOW — Silêncio Absoluto',
    menuFooter: '> ∙ ∙ ∙  s i l ê n c i o  ∙ ∙ ∙',
    thumbText:  '∙ {BOT}',
    sectionSep: '├──────────────────────┤',
  },

  // ════════════════════════════════════════════════════════
  //  4. BLADE  —  Identidade: Lâmina / Aço / Guerreiro
  // ════════════════════════════════════════════════════════
  blade: {
    name:       'blade',
    label:      '⚔️ BLADE — Lâmina de Aço',
    emoji:      '⚔️',
    style:      4,
    frame:      ['╒', '╕', '╘', '╛', '═', '│'],
    bullet:     '⫸',
    sep:        '╱',
    accent:     '⚔️',
    icon:       '⚔️',
    vibe:       '⚔️ LÂMINA SUPREMA ⚔️',
    headerDec:  '⚔️═〔 {TITLE} 〕═⚔️',
    react:      '⚔️',
    tip:        '⚔️ Quem afila a lâmina vence sem lutar.',
    menuTitle:  '⚔️ BLADE — Lâmina de Aço',
    menuFooter: '> ⚔️ LÂMINA SUPREMA ⚔️',
    thumbText:  '⚔️ {BOT}',
    sectionSep: '╞⚔️══════════════⚔️╡',
  },

  // ════════════════════════════════════════════════════════
  //  5. HACKER  —  Identidade: Terminal / Root / Código
  // ════════════════════════════════════════════════════════
  hacker: {
    name:       'hacker',
    label:      '💻 HACKER — Root Terminal',
    emoji:      '💻',
    style:      5,
    frame:      ['╓', '╖', '╙', '╜', '─', '║'],
    bullet:     '$',
    sep:        '::',
    accent:     '#',
    icon:       '💻',
    vibe:       'root@darkbot:~# █',
    headerDec:  '[[ {TITLE} ]]',
    react:      '💻',
    tip:        '$ echo "acesso autorizado — bem-vindo, root"',
    menuTitle:  '💻 HACKER — Terminal Root',
    menuFooter: '> root@darkbot:~# exit 0',
    thumbText:  '$ {BOT}',
    sectionSep: '╟──────────────────────╢',
  },

  // ════════════════════════════════════════════════════════
  //  6. MOONLIGHT  —  Identidade: Lua / Cosmos / Astral
  // ════════════════════════════════════════════════════════
  moonlight: {
    name:       'moonlight',
    label:      '🌙 MOONLIGHT — Cosmos Astral',
    emoji:      '🌙',
    style:      6,
    frame:      ['▛', '▜', '▙', '▟', '▀', '▌'],
    bullet:     '☾',
    sep:        '⋆',
    accent:     '✦',
    icon:       '🌙',
    vibe:       '🌙 cosmos online ✦ lua cheia',
    headerDec:  '🌙⋆⋆〔 {TITLE} 〕⋆⋆🌙',
    react:      '🌙',
    tip:        '🌙 O cosmos não tem pressa — tem precisão.',
    menuTitle:  '🌙 MOONLIGHT — Cosmos Astral',
    menuFooter: '> 🌙 cosmos online ✦ lua cheia',
    thumbText:  '🌙 {BOT}',
    sectionSep: '▙✦▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀✦▟',
  },

  // ════════════════════════════════════════════════════════
  //  7. DIAMOND  —  Identidade: Gema / Cristal / Luxo
  // ════════════════════════════════════════════════════════
  diamond: {
    name:       'diamond',
    label:      '💎 DIAMOND — Cristal Premium',
    emoji:      '💎',
    style:      7,
    frame:      ['◢', '◣', '◥', '◤', '━', '┃'],
    bullet:     '◆',
    sep:        '◇',
    accent:     '✧',
    icon:       '💎',
    vibe:       '💎 CRISTAL PREMIUM ◆◇◆',
    headerDec:  '◆◇〔 {TITLE} 〕◇◆',
    react:      '💎',
    tip:        '💎 Pressão cria diamantes — e bots de elite.',
    menuTitle:  '💎 DIAMOND — Cristal Premium',
    menuFooter: '> 💎 CRISTAL PREMIUM ◆◇◆',
    thumbText:  '💎 {BOT}',
    sectionSep: '◢◆━━━━━━━━━━━━━━━━◆◣',
  },

  // ════════════════════════════════════════════════════════
  //  8. FIRE  —  Identidade: Chamas / Ego / Intensidade
  // ════════════════════════════════════════════════════════
  fire: {
    name:       'fire',
    label:      '🔥 FIRE — Chamas do Ego',
    emoji:      '🔥',
    style:      8,
    frame:      ['🔥', '🔥', '🔥', '🔥', '═', '┃'],
    bullet:     '▶',
    sep:        '🔥',
    accent:     '🌋',
    icon:       '🔥',
    vibe:       '🔥 EGO MODE: ON 🌋 LIMITES: OFF',
    headerDec:  '🔥〔 {TITLE} 〕🔥',
    react:      '🔥',
    tip:        '🔥 O fogo não pede licença — consome.',
    menuTitle:  '🔥 FIRE — Chamas do Ego',
    menuFooter: '> 🔥 EGO MODE: ON 🌋 LIMITES: OFF',
    thumbText:  '🔥 {BOT}',
    sectionSep: '┃🔥══════════════🔥┃',
  },

  // ════════════════════════════════════════════════════════
  //  9. SPIDER  —  Identidade: Teia / Armadilha / Web
  // ════════════════════════════════════════════════════════
  spider: {
    name:       'spider',
    label:      '🕷️ SPIDER — Web Suprema',
    emoji:      '🕷️',
    style:      9,
    frame:      ['⎔', '⎔', '⎔', '⎔', '═', '║'],
    bullet:     '⛓',
    sep:        '⌁',
    accent:     '🕷️',
    icon:       '🕷️',
    vibe:       '🕷️ web automation core 🕸️',
    headerDec:  '🕷️⌁〔 {TITLE} 〕⌁🕷️',
    react:      '🕷️',
    tip:        '🕸️ A teia captura tudo — ninguém escapa.',
    menuTitle:  '🕷️ SPIDER — Web Suprema',
    menuFooter: '> 🕷️ web automation core 🕸️',
    thumbText:  '🕷️ {BOT}',
    sectionSep: '║⌁⛓⌁⌁⌁⌁⌁⌁⌁⌁⌁⌁⌁⌁⌁⌁⌁⌁⌁⌁⌁⌁║',
  },

  // ════════════════════════════════════════════════════════
  //  10. DRAGON  —  Identidade: Dragão / Poder / Mitologia
  // ════════════════════════════════════════════════════════
  dragon: {
    name:       'dragon',
    label:      '🐉 DRAGON — Poder Mitológico',
    emoji:      '🐉',
    style:      2,
    frame:      ['〔', '〕', '【', '】', '═', '║'],
    bullet:     '⊛',
    sep:        '»',
    accent:     '🔴',
    icon:       '🐉',
    vibe:       '🐉 © DRAGON SYSTEM 🔴',
    headerDec:  '🐉═══〔 {TITLE} 〕═══🐉',
    react:      '🐉',
    tip:        '🐉 O dragão não age sem propósito — domina.',
    menuTitle:  '🐉 DRAGON — Sistema Supremo',
    menuFooter: '> 🐉 © DRAGON SYSTEM 🔴',
    thumbText:  '🐉 {BOT}',
    sectionSep: '〔⊛════════════════⊛〕',
  },

  // ════════════════════════════════════════════════════════
  //  11. ITADORI  —  Identidade: Jujutsu / Maldição / Força
  // ════════════════════════════════════════════════════════
  // ════════════════════════════════════════════════════════
  //  12. SASUKE  —  Identidade: Sharingan / Uchiha / Sangue
  // ════════════════════════════════════════════════════════
  // ════════════════════════════════════════════════════════
  //  13. NEON  —  Identidade: Cidade Neon / Cyberpunk / Roxo
  // ════════════════════════════════════════════════════════
  neon: {
    name:       'neon',
    label:      '💜 NEON — Cidade Cyberpunk',
    emoji:      '💜',
    style:      4,
    frame:      ['╔', '╗', '╚', '╝', '─', '┊'],
    bullet:     '◉',
    sep:        '∷',
    accent:     '✵',
    icon:       '💜',
    vibe:       '💜 NEON CITY ∷ ONLINE ◉',
    headerDec:  '◉∷〔 {TITLE} 〕∷◉',
    react:      '💜',
    tip:        '💜 A cidade nunca dorme — nem o bot.',
    menuTitle:  '💜 NEON — Cidade Cyberpunk',
    menuFooter: '> 💜 NEON CITY ∷ ONLINE ◉',
    thumbText:  '💜 {BOT}',
    sectionSep: '╚◉∷───────────────────∷◉╝',
  },

  // ════════════════════════════════════════════════════════
  //  14. GOTHIC  —  Identidade: Arte Negra / Trevas / Cruz
  // ════════════════════════════════════════════════════════
  gothic: {
    name:       'gothic',
    label:      '🖤 GOTHIC — Arte das Trevas',
    emoji:      '🖤',
    style:      5,
    frame:      ['✠', '✠', '✠', '✠', '─', '┊'],
    bullet:     '✝',
    sep:        '†',
    accent:     '☠️',
    icon:       '🖤',
    vibe:       '✝ Arte das Trevas ✝ in nomine',
    headerDec:  '✝†〔 {TITLE} 〕†✝',
    react:      '🖤',
    tip:        '☠️ Das trevas nasce a maior arte.',
    menuTitle:  '🖤 GOTHIC — Arte das Trevas',
    menuFooter: '> ✝ Arte das Trevas ✝ in nomine',
    thumbText:  '✝ {BOT}',
    sectionSep: '✠†──────────────────†✠',
  },

  // ════════════════════════════════════════════════════════
  //  15. ALIEN  —  Identidade: Extraterrestre / Cosmos / Hexágono
  // ════════════════════════════════════════════════════════
  alien: {
    name:       'alien',
    label:      '👾 ALIEN — Protocolo Extraterrestre',
    emoji:      '👾',
    style:      6,
    frame:      ['⬡', '⬡', '⬡', '⬡', '─', '⋮'],
    bullet:     '⬡',
    sep:        '∎',
    accent:     '🛸',
    icon:       '👾',
    vibe:       '👾 PROTOCOLO EXTRA-DIMENSIONAL 🛸',
    headerDec:  '⬡∎〔 {TITLE} 〕∎⬡',
    react:      '👾',
    tip:        '🛸 O protocolo alien não tem limites conhecidos.',
    menuTitle:  '👾 ALIEN — Protocolo Extra-Dim',
    menuFooter: '> 👾 PROTOCOLO EXTRA-DIMENSIONAL 🛸',
    thumbText:  '👾 {BOT}',
    sectionSep: '⬡∎──────────────────∎⬡',
  },

  // ════════════════════════════════════════════════════════
  //  16. OMEGA  —  Identidade: Fim / Absoluto / Universo
  // ════════════════════════════════════════════════════════
  omega: {
    name:       'omega',
    label:      '♾️ OMEGA — Fim e Começo',
    emoji:      '♾️',
    style:      2,
    frame:      ['Ω', 'Ω', 'Ω', 'Ω', '═', '¦'],
    bullet:     'Ω',
    sep:        '∞',
    accent:     '⚛️',
    icon:       '♾️',
    vibe:       'Ω OMEGA PROTOCOL — sem início, sem fim ∞',
    headerDec:  'Ω∞〔 {TITLE} 〕∞Ω',
    react:      '♾️',
    tip:        '∞ O omega é o fim que abre o próximo ciclo.',
    menuTitle:  '♾️ OMEGA — Absoluto Universal',
    menuFooter: '> Ω OMEGA PROTOCOL — sem início, sem fim ∞',
    thumbText:  '♾️ {BOT}',
    sectionSep: 'Ω∞════════════════∞Ω',
  },

  // ════════════════════════════════════════════════════════
  //  17. STORM  —  Identidade: Relâmpago / Tempestade / Caos
  // ════════════════════════════════════════════════════════
  storm: {
    name:       'storm',
    label:      '⚡ STORM — Tempestade Caótica',
    emoji:      '⚡',
    style:      1,
    frame:      ['⚡', '⚡', '⚡', '⚡', '━', '┃'],
    bullet:     '▷',
    sep:        '⚡',
    accent:     '🌩️',
    icon:       '⚡',
    vibe:       '⚡ TEMPESTADE ONLINE 🌩️ CAOS TOTAL',
    headerDec:  '⚡━〔 {TITLE} 〕━⚡',
    react:      '⚡',
    tip:        '⚡ A tempestade não avisa — já chegou.',
    menuTitle:  '⚡ STORM — Tempestade Caótica',
    menuFooter: '> ⚡ TEMPESTADE ONLINE 🌩️ CAOS TOTAL',
    thumbText:  '⚡ {BOT}',
    sectionSep: '┃⚡━━━━━━━━━━━━━━━━━⚡┃',
  },

  // ════════════════════════════════════════════════════════
  //  18. ANCIENT  —  Identidade: Antigo / Rúnico / Mitológico
  // ════════════════════════════════════════════════════════
  ancient: {
    name:       'ancient',
    label:      '🏛️ ANCIENT — Runas Ancestrais',
    emoji:      '🏛️',
    style:      5,
    frame:      ['᛭', '᛭', '᛭', '᛭', '─', '⁞'],
    bullet:     'ᚱ',
    sep:        'ᚢ',
    accent:     '⚱️',
    icon:       '🏛️',
    vibe:       'ᚱᚢᚾ — os ancestrais codificaram ⚱️',
    headerDec:  'ᚱᚢ〔 {TITLE} 〕ᚢᚱ',
    react:      '🏛️',
    tip:        '🏛️ Quem lê as runas, decifra o futuro.',
    menuTitle:  '🏛️ ANCIENT — Runas Ancestrais',
    menuFooter: '> ᚱᚢᚾ — os ancestrais codificaram ⚱️',
    thumbText:  '🏛️ {BOT}',
    sectionSep: '᛭ᚱᚢ──────────────────ᚢᚱ᛭',
  },

  // ════════════════════════════════════════════════════════
  //  19. CRYSTAL  —  Identidade: Transparência / Gelo / Pureza
  // ════════════════════════════════════════════════════════
  crystal: {
    name:       'crystal',
    label:      '🔮 CRYSTAL — Visão do Futuro',
    emoji:      '🔮',
    style:      7,
    frame:      ['❄', '❄', '❄', '❄', '─', '⁞'],
    bullet:     '◇',
    sep:        '❄',
    accent:     '✨',
    icon:       '🔮',
    vibe:       '🔮 CRYSTAL VISION — o futuro é claro',
    headerDec:  '❄✨〔 {TITLE} 〕✨❄',
    react:      '🔮',
    tip:        '🔮 A bola de cristal nunca mente — o código também não.',
    menuTitle:  '🔮 CRYSTAL — Visão do Futuro',
    menuFooter: '> 🔮 CRYSTAL VISION — o futuro é claro',
    thumbText:  '🔮 {BOT}',
    sectionSep: '❄◇──────────────────◇❄',
  },

  // ════════════════════════════════════════════════════════
  //  20. VOID  —  Identidade: Vazio / Nada / Zero
  // ════════════════════════════════════════════════════════
  void: {
    name:       'void',
    label:      '🌀 VOID — O Nada Absoluto',
    emoji:      '🌀',
    style:      3,
    frame:      ['░', '░', '░', '░', '▒', '▓'],
    bullet:     '▪',
    sep:        '▫',
    accent:     '●',
    icon:       '🌀',
    vibe:       '🌀 v o i d ▓▒░ null.protocol',
    headerDec:  '░▒〔 {TITLE} 〕▒░',
    react:      '🌀',
    tip:        '🌀 No vazio, tudo é possível.',
    menuTitle:  '🌀 VOID — Protocolo Nulo',
    menuFooter: '> 🌀 v o i d ▓▒░ null.protocol',
    thumbText:  '🌀 {BOT}',
    sectionSep: '░▪▒──────────────────▒▪░',
  },

  // ════════════════════════════════════════════════════════
  //  21. SAKURA  —  Identidade: Flor / Delicadeza / Força
  // ════════════════════════════════════════════════════════
  sakura: {
    name:       'sakura',
    label:      '🌸 SAKURA — Flor de Cerejeira',
    emoji:      '🌸',
    style:      0,
    frame:      ['꒰', '꒱', '꒰', '꒱', '─', '┊'],
    bullet:     '✿',
    sep:        '·˚',
    accent:     '🌸',
    icon:       '🌸',
    vibe:       '🌸 hanami protocol · flores em queda',
    headerDec:  '✿·˚〔 {TITLE} 〕˚·✿',
    react:      '🌸',
    tip:        '🌸 A flor mais bela dura pouco — por isso impacta.',
    menuTitle:  '🌸 SAKURA — Flor de Cerejeira',
    menuFooter: '> 🌸 hanami protocol · flores em queda',
    thumbText:  '🌸 {BOT}',
    sectionSep: '꒰✿·˚──────────────˚·✿꒱',
  },

  // ════════════════════════════════════════════════════════
  //  22. MATRIX  —  Identidade: Simulação / Código / Verde
  // ════════════════════════════════════════════════════════
  matrix: {
    name:       'matrix',
    label:      '🟩 MATRIX — Código de Simulação',
    emoji:      '🟩',
    style:      1,
    frame:      ['⌈', '⌉', '⌊', '⌋', '─', '¦'],
    bullet:     '0x',
    sep:        '>>',
    accent:     '01',
    icon:       '🟩',
    vibe:       '// MATRIX: SIMULATION ACTIVE //',
    headerDec:  '⌈>> {TITLE} <<⌉',
    react:      '🟩',
    tip:        '// red pill ou blue pill? Já escolheste.',
    menuTitle:  '🟩 MATRIX — Simulação Activa',
    menuFooter: '> // MATRIX: SIMULATION ACTIVE //',
    thumbText:  '0x {BOT}',
    sectionSep: '⌊>>──────────────────<<⌋',
  },

  // ════════════════════════════════════════════════════════
  //  23. RITUAL  —  Identidade: Magia / Ocultismo / Sigilo
  // ════════════════════════════════════════════════════════
  ritual: {
    name:       'ritual',
    label:      '🔯 RITUAL — Magia Oculta',
    emoji:      '🔯',
    style:      2,
    frame:      ['⛧', '⛧', '⛧', '⛧', '═', '⁞'],
    bullet:     '⁶⁶⁶',
    sep:        '✶',
    accent:     '🕯️',
    icon:       '🔯',
    vibe:       '🔯 in nomine — ritual iniciado ⛧',
    headerDec:  '⛧✶〔 {TITLE} 〕✶⛧',
    react:      '🔯',
    tip:        '🕯️ O ritual não perdoa os que duvidam.',
    menuTitle:  '🔯 RITUAL — Magia Oculta',
    menuFooter: '> 🔯 in nomine — ritual iniciado ⛧',
    thumbText:  '🔯 {BOT}',
    sectionSep: '⛧✶════════════════════✶⛧',
  },

  // ════════════════════════════════════════════════════════
  //  24. AURORA  —  Identidade: Aurora Boreal / Cores / Magia Natural
  // ════════════════════════════════════════════════════════
  aurora: {
    name:       'aurora',
    label:      '🌌 AURORA — Borealis Engine',
    emoji:      '🌌',
    style:      6,
    frame:      ['꩜', '꩜', '꩜', '꩜', '─', '⋮'],
    bullet:     '✦',
    sep:        '〰',
    accent:     '🌌',
    icon:       '🌌',
    vibe:       '🌌 aurora borealis — luzes do norte',
    headerDec:  '✦〰〔 {TITLE} 〕〰✦',
    react:      '🌌',
    tip:        '🌌 Cada cor da aurora é uma frequência de poder.',
    menuTitle:  '🌌 AURORA — Borealis Engine',
    menuFooter: '> 🌌 aurora borealis — luzes do norte',
    thumbText:  '🌌 {BOT}',
    sectionSep: '꩜✦───────────────────✦꩜',
  },

  // ════════════════════════════════════════════════════════
  //  25. EMPEROR  —  Identidade: Império / Domínio / Grandeza
  // ════════════════════════════════════════════════════════
  emperor: {
    name:       'emperor',
    label:      '🏴 EMPEROR — Domínio Imperial',
    emoji:      '🏴',
    style:      2,
    frame:      ['▓', '▓', '▓', '▓', '═', '║'],
    bullet:     '⚜',
    sep:        '⚔',
    accent:     '🏴',
    icon:       '⚜',
    vibe:       '⚜ IMPERIUM SINE FINE ⚔ domínio eterno',
    headerDec:  '⚜⚔〔 {TITLE} 〕⚔⚜',
    react:      '🏴',
    tip:        '⚜ Impérios não se pedem — conquistam-se.',
    menuTitle:  '⚜ EMPEROR — Domínio Imperial',
    menuFooter: '> ⚜ IMPERIUM SINE FINE ⚔',
    thumbText:  '⚜ {BOT}',
    sectionSep: '▓⚜⚔════════════════⚔⚜▓',
  },


  // ═══════════════════════════════════════════════════════════
  // v5.6 — 7 CHANGES EXACTOS DO FICHEIRO DE REFERÊNCIA
  // Cada um usa os caracteres Unicode decorativos exactos
  // ═══════════════════════════════════════════════════════════

  ronin: {
    name: 'ronin', label: '⛩️ RONIN — Lâmina Sombria', emoji: '⛩️', style: 7,
    frame: ['◢','◣','◥','◤','━','┃'],
    bullet: '⛩️', sep: '🩸', accent: '🩸', icon: '⛩️',
    vibe: '⛩️ ᴀʀᴋ ʀᴏɴɴ ᴇɴɢɪɴᴇ 🩸',
    headerDec: '◢⛩️🩸〔 {TITLE} 〕🩸⛩️◣',
    react: '⛩️', tip: '🩸 O caminho do ronin não tem volta.',
    menuTitle: '⛩️ 𝐄𝐔 𝐑𝐏𝐆 ⛩️',
    menuFooter: '> ⛩️ DARK RONIN 🩸',
    thumbText: '⛩️ {BOT}',
    topBorder: '❀ ━━━ ⛩️🩸 ━━━ ❀',
    bottomBorder: '╰━━━ ⛩️🩸 ━━━╯',
    sectionTop: '┃ ┏━━ {ICON} {TITLE} ⛩️ ━━┓',
    linePrefix: '┃ ⛩️🩸 ',
    sectionSep: '┃ ⛩️🩸 ━━━━━━━━ ⛩️ ━━━━━━━━ 🩸⛩️ ┃',
    footerLine: '┃ └─݊━⵿໋݊─⊢ ️ 𝑺𝑺𝑲𝑬 𝑶 🩸 ⵿໋━⵿໋━⵿໋─┘',
    headerTop: '⛩️  ⋆⋅  ⋆ ──── ⊰˖°️ ࣪',
    infoLine: '┃ ⛩️ ',
    font: 'rpg', personality: 'dark',
  },

  cipher: {
    name: 'cipher', label: '⌬ CIPHER — Protocolo Sombrio', emoji: '⌬', style: 8,
    frame: ['┏','┓','┗','┛','━','┃'],
    bullet: '⌬', sep: '═', accent: '᳀', icon: '⌬',
    vibe: '𝙳𝙰𝚁𝙺 𝙱𝙾𝚃 𝚅6',
    headerDec: '┏⌬〔 *{TITLE}* 〕⌬┓',
    react: '⌬', tip: '⌬ Cipher — precisão absoluta.',
    menuTitle: '⌬ CIPHER',
    menuFooter: '> 𝙳𝙰 𝙱𝚃 𝚅6',
    thumbText: '⌬ {BOT}',
    topBorder: '╔━᳀『 *{TITLE}* 』═᳀',
    bottomBorder: '╚═━═━═━═━═━═━═━═᳀',
    sectionTop: '᳀═『 *{TITLE}* 』═᳀',
    linePrefix: '⌬ ',
    footerLine: '> 𝙳𝙰𝙺 𝙾𝚃 𝚅6',
    sectionSep: '⌬═━━━━━━━━━━━━━━━━━━━━━━═⌬',
    font: 'monospace', personality: 'formal',
  },

  sorcerer: {
    name: 'sorcerer', label: '🌀 SORCERER — Magia Sombria', emoji: '🌀', style: 9,
    frame: ['╓','╖','╙','╜','─','║'],
    bullet: '⋆🌀ׁ̟̇·₊˚', sep: '⟡', accent: '🌀', icon: '🌀',
    vibe: '🕸️ ᴅᴀ sᴏᴄᴇʀʀ ᴠ6',
    headerDec: '╓🌀⋆〔 {TITLE} 〕⋆🌀╖',
    react: '🌀', tip: '🌀 O poder está dentro de ti.',
    menuTitle: '🌀 MENU SORCERER',
    menuFooter: '> 🕸️ ᴅᴀᴋ ʙᴏᴛ ᴠ1',
    thumbText: '🌀 {BOT}',
    topBorder: '╭─ ┄┄───────ׂ─ׅ────ׅ─ׅ───ׅ───⟡',
    bottomBorder: '╰─ ͡┄┄───────ׂ─ׅ────ׅ─ׅ───ׅ───⟡',
    sectionTop: '┃ ┏☆ ── ★ ── ☆ ── ★ ──┛',
    sectionTitle: '┃ ╎      🌀 {TITLE} 🌀',
    sectionSep: '└─╌✩̣̣̣ͯ┄•͙✧┄ͯ•͙͙✧•͙͙ͯ┄•͙✧•✩͙─┘',
    linePrefix: '║ 🌀⋆ ',
    sectionBottom: '┗╌✩̣̣̣ͯ┄•͙✧┄✩•͙͙•͙͙✩ͯ┄•͙✧•✩͙╌╯',
    font: 'smallcaps', personality: 'cute',
  },

  phantom: {
    name: 'phantom', label: '👾 PHANTOM — Domínio Sombrio', emoji: '👾', style: 6,
    frame: ['▛','▜','▙','▟','▀','▌'],
    bullet: '✦', sep: '⋆｡°✩', accent: '💀', icon: '👾',
    vibe: '☩ 𝐃𝐀𝐑𝐊-𝐏𝐇𝐀𝐓𝐎𝐌',
    headerDec: '▛👾💀〔 {TITLE} 〕💀👾▜',
    react: '👾', tip: '👾 Dark Phantom — domínio total.',
    menuTitle: '👾 MENU PRINCIPAL',
    menuFooter: '> ☩ 𝐃𝐀𝐑𝐊-𝐏𝐇𝐀𝐓𝐎𝐌',
    thumbText: '👾 {BOT}',
    topBorder: '┌─*˚˚*ੈ‧₊˚୨୧⋆ ˚｡⋆『{ICON}』⋆ ｡⋆୨˚*ੈ‧₊˚*̥˚─┐',
    bottomBorder: '└─*̥˚˚*ੈ‧₊˚୨୧⋆ ˚｡⋆『{ICON}』⋆ ｡⋆୨˚*ੈ‧₊˚*̥˚─┘',
    sectionTop: '┊ ✦『 {ICON} 』✦ {TITLE} ✦『 {ICON} 』✦',
    linePrefix: '╎ 👾 ',
    sectionSep: '⋆｡°✩ ───────── ⋆｡°✩°｡⋆ ───────── ✩°｡⋆',
    font: 'bold', personality: 'aggressive',
  },

  rose: {
    name: 'rose', label: '💝 ROSE — Purpurina Sombria', emoji: '💝', style: 8,
    frame: ['✦','✦','✧','✧','━','┃'],
    bullet: '💝', sep: '💝', accent: '💖', icon: '💝',
    vibe: '💝 DARK BOT 💝',
    headerDec: '✦💝💖〔 {TITLE} 〕💖💝✦',
    react: '💝', tip: '💝 Com carinho, sempre.',
    menuTitle: '💝 MENU PRINCIPAL 💝',
    menuFooter: '> 💝 DARK BOT 💝',
    thumbText: '💝 {BOT}',
    topBorder: '╭━━━〔 💝 {TITLE} 〕━━━╮',
    bottomBorder: '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
    separator: '💝━━━━━━━━━━━━━━━━━━━━━━━━━━💝',
    linePrefix: '┃ ',
    sectionSep: '💝━━━━━━━━━━━━━━━━━━━━━━━━━━💝',
    headerTop: '💝╭━━━━━━━━━━━━━━━━━━━━━━━━╮💝',
    headerMid: '💝┃     ✧ {BOT} ✧      ┃💝',
    headerBot: '💝╰━━━━━━━━━━━━━━━━━━━━━━━━╯💝',
    font: 'normal', personality: 'cute',
  },

  steel: {
    name: 'steel', label: '💔 STEEL — Coração de Aço', emoji: '💔', style: 3,
    frame: ['┌','┐','└','┘','─','│'],
    bullet: '💔', sep: '💔', accent: '💔', icon: '💔',
    vibe: '💔 Dark Steel Engine',
    headerDec: '┌💔〔 {TITLE} 〕💔┐',
    react: '💔', tip: '💔 A máquina não para.',
    menuTitle: '💔 MENU PRINCIPAL',
    menuFooter: '> 💔 Dark Steel',
    thumbText: '💔 {BOT}',
    topBorder: '╭┈💔 *{ICON} {TITLE}*',
    bottomBorder: '╰─┈┈┈┈┈┈◜◞┈┈┈┈┈┈─╯',
    linePrefix: '┊💔',
    sectionSep: '┊💔┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈💔┊',
    font: 'normal', personality: 'dark',
  },

  pixel: {
    name: 'pixel', label: '🖋️ PIXEL — Design Proibido', emoji: '🖋️', style: 1,
    frame: ['╔','╗','╚','╝','═','║'],
    bullet: '🖋️', sep: '✨', accent: '✨', icon: '🖋️',
    vibe: '🖋️ Dark Pixel Design',
    headerDec: '╔🖋️✨〔 {TITLE} 〕✨🖋️╗',
    react: '🖋️', tip: '🖋️ Arte em cada pixel.',
    menuTitle: '🖋️ LOGOS & DESIGN',
    menuFooter: '> ╰═════════════════ 🌟',
    thumbText: '🖋️ {BOT}',
    topBorder: '╔═════ ◦ ✨ ◦ ═════╗',
    bottomBorder: '╰═════════════════ 🌟',
    sectionTop: '╰╦══════════════════ 🖋️',
    sectionLine: '┃│〘{ICON}〙➢ #{CMD} - {DESC}',
    sectionSep: '┃│ ✨ ══════════════════════ ✨ │┃',
    sectionBottom: '┃╰══ 🖋️',
    font: 'normal', personality: 'formal',
  },

};

// ── Exportações ────────────────────────────────────────────────────────────────

function getTheme(name = 'dark') {
  const n = String(name || 'dark').toLowerCase().trim();
  const t = THEMES[n] || THEMES.dark;
  // v5.3: auto-atribui personalidade + fonte se não definidas
  if (!t.personality) t.personality = _inferPersonality(n);
  if (!t.font) t.font = _inferFont(n);
  return t;
}

// Inferir personalidade pelo nome do tema
function _inferPersonality(name) {
  if (/ronin|sasuke|royal|emperor|crown|queen|king/.test(name)) return 'royal';
  if (/sorcerer|itadori|rose|emilly|cute|sakura|kawaii|aurora|crystal/.test(name)) return 'cute';
  if (/phantom|systemmd|steel|maquinista|blade|storm|fire|dragon|omega|void|ritual/.test(name)) return 'aggressive';
  if (/cipher|systemzero|pixel|maquinista2|formal|diamond|neon|hacker/.test(name)) return 'formal';
  return 'dark';
}

// Inferir fonte pelo nome do tema
function _inferFont(name) {
  if (/cipher|systemzero|hacker|matrix|cyber/.test(name)) return 'monospace';
  if (/ronin|sasuke|gothic|ritual|ancient|void/.test(name)) return 'smallcaps';
  if (/glitch|storm|neon/.test(name)) return 'glitch';
  if (/royal|emperor|crown/.test(name)) return 'bold';
  if (/cute|sakura|kawaii/.test(name)) return 'tiny';
  return 'smallcaps'; // default DARK: smallcaps para tudo
}

function listThemes() {
  return Object.values(THEMES);
}

/**
 * v7.23 — pagina os temas em secções para a lista interativa.
 * O native_flow single_select aceita ~10 rows por secção; com 31 temas
 * a lista rebentava. Devolve [{ title, rows: [{title, description, id}] }].
 */
function paginarTemas(maxPorSeccao = 10, icon = '🎭') {
  const all = listThemes();
  const seccoes = [];
  for (let i = 0; i < all.length; i += maxPorSeccao) {
    const bloco = all.slice(i, i + maxPorSeccao);
    seccoes.push({
      title: `${icon} TEMAS ${i + 1}–${i + bloco.length} DE ${all.length}`,
      rows: bloco.map(th => ({
        title:       `${th.emoji} ${th.name.toUpperCase()}`,
        description: th.vibe.slice(0, 72),
        id:          `CHANGE_THEME_${th.name}`,
      })),
    });
  }
  return seccoes;
}

/**
 * Preview formatado de um tema
 */
function previewTheme(theme, botName = 'DARK BOT', prefix = '!') {
  const f  = theme.frame;
  const H  = f[4] || '─';
  const V  = f[5] || '│';
  const tl = f[0], tr = f[1], bl = f[2], br = f[3];
  const W  = 26;
  const bar = (txt) => `${V} ${String(txt || '').slice(0, W).padEnd(W)} ${V}`;
  const top = `${tl}${H.repeat(W + 2)}${tr}`;
  const bot = `${bl}${H.repeat(W + 2)}${br}`;
  const sep = bar(`${theme.sep}`.repeat(Math.min(3, W)));

  return [
    `*${theme.emoji} ${theme.label}*`,
    '',
    top,
    bar(`${theme.icon}  *${botName}*`),
    bar(theme.vibe.slice(0, W)),
    sep,
    bar(`${theme.bullet} Prefixo: *${prefix}*`),
    bar(`${theme.bullet} Reação: ${theme.react}`),
    bar(`${theme.bullet} Borda: ${tl}${H}${H}${H}${tr}`),
    bar(`${theme.bullet} Sep: ${theme.sep} | Marcador: ${theme.bullet}`),
    bar(`${theme.bullet} Ícone: ${theme.icon} | Accent: ${theme.accent}`),
    sep,
    bar(theme.tip.slice(0, W)),
    bot,
    '',
    `> ${theme.headerDec.replace('{TITLE}', 'PREVIEW')}`,
    '',
    `📌 Aplicar: *${prefix}change ${theme.name}*`,
  ].join('\n');
}

/**
 * Lista todos os temas em texto
 */
function listThemesText(prefix = '!', currentTheme = 'dark') {
  const all = Object.values(THEMES);
  let txt  = `╔══════════════════════════════╗\n`;
  txt     += `║  🎭 *TEMAS DO BOT*            ║\n`;
  txt     += `╚══════════════════════════════╝\n\n`;
  txt     += `Tema actual: *${currentTheme.toUpperCase()}*\n\n`;

  for (const t of all) {
    const active = t.name === currentTheme ? ' ◄ *ACTIVO*' : '';
    txt += `${t.emoji} *${t.name.toUpperCase()}*${active}\n`;
    txt += `  _${t.vibe.slice(0, 40)}_\n`;
    txt += `  ${t.frame[0]}${t.frame[4].repeat(3)}${t.frame[1]} ${t.bullet} ${t.sep}\n\n`;
  }

  txt += `> 🎨 ${all.length} temas disponíveis\n`;
  txt += `> Aplicar: *${prefix}change <nome>*`;
  return txt;
}

function formatHeader(theme, title = '') {
  return theme.headerDec.replace('{TITLE}', title);
}

function formatBlock(theme, lines = []) {
  const f  = theme.frame;
  const H  = f[4] || '─';
  const V  = f[5] || '│';
  const tl = f[0], tr = f[1], bl = f[2], br = f[3];
  const W  = 26;
  const bar = (txt) => `${V} ${String(txt || '').slice(0, W).padEnd(W)} ${V}`;
  return [
    `${tl}${H.repeat(W + 2)}${tr}`,
    ...lines.map(l => bar(l)),
    `${bl}${H.repeat(W + 2)}${br}`,
  ].join('\n');
}

module.exports = { THEMES, getTheme, listThemes, paginarTemas, previewTheme, listThemesText, formatHeader, formatBlock };
