/**
 * gifHelper.js — GIF/MP4 robusto, variado e ESPELHO DA AÇÃO (v7.27)
 *
 * O que mudou face à v6:
 *  - Tenor v2 foi descontinuado pela Google (403 "Tenor API is discontinued")
 *    e o endpoint v1 exige key → as duas fontes "principais" estavam mortas
 *    e cada falha custava ~6,5 s antes do fallback seguinte.
 *  - nekos.best devolvia 403 porque exige User-Agent de bot (não de browser).
 *  - O mapeamento era por `includes()` na query inglesa: "rico", "burro",
 *    "psicopata", "rei"… caíam todos em `happy`. Agora cada ação tem a SUA
 *    reação em CADA fonte (tapa → slap em todas; rico → money/celebrate…).
 *
 * Fontes (todas sem key, consultadas EM PARALELO, sem filtro de conteúdo):
 *   otakugifs.xyz · nekos.best · purrbot.site v2 · waifu.pics ·
 *   some-random-api.com · nekos.life · (Tenor/Giphy só se houver key)
 *
 * Regras:
 *  - NUNCA bloqueia GIF por conteúdo (sem contentfilter/rating).
 *  - Prefere fontes com a reação EXATA; só depois usa reações vizinhas.
 *  - Evita repetir o mesmo URL nas últimas 10 chamadas do mesmo comando.
 *  - Converte GIF/WebP → MP4 (gifPlayback) com ffmpeg; MP4 passa direto.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const mediaHandler = require('./mediaHandler');
const config = require('../config');

const TENOR_KEY = config.tenorApiKey;
const GIPHY_KEY = process.env.GIPHY_API_KEY || '';
const MAX_BYTES = 6 * 1024 * 1024;
const TIMEOUT_MS = 6500;
const BOT_UA = 'DarkBot/7.27 (+https://github.com/onlynewsao-cmyk/dark-bot)';
const recentByKey = new Map(); // key -> [url]

// ───────────────────────────────────────────────────────────────
// CATÁLOGO DE REAÇÕES POR FONTE (verificado em 2026-09-04)
// ───────────────────────────────────────────────────────────────
const OTAKU = new Set('airkiss angrystare bite bleh blush brofist celebrate cheers clap confused cool cry cuddle dance drool evillaugh facepalm handhold happy headbang hug huh kiss laugh lick love mad nervous no nom nosebleed nuzzle nyah pat peek pinch poke pout punch roll run sad scared shout shrug shy sigh sing sip slap sleep slowclap smack smile smug sneeze sorry stare stop surprised sweat thumbsup tickle tired wave wink woah yawn yay yes'.split(' '));
const NEKOS_BEST = new Set('lurk shoot sleep clap shrug stare wave poke confused smile peck wink sip blush smug tickle yeet think highfive feed wag bite teehee shocked bleh bored nom nya yawn facepalm cuddle kick happy carry hug kabedon baka bonk pat angry spin shake run nod nope kiss dance punch handshake slap cry lappillow pout blowkiss handhold salute thumbsup laugh tableflip'.split(' '));
const PURR = new Set('angry bite blush comfy cry cuddle dance eevee fluff holo hug kiss kitsune lay lick neko okami pat poke pout senko shiro slap smile tail tickle'.split(' '));
const WAIFU = new Set('waifu neko shinobu megumin bully cuddle cry hug awoo kiss lick pat smug bonk yeet blush smile wave highfive handhold nom bite glomp slap kill kick happy wink poke dance cringe'.split(' '));
const SRA = new Set('hug pat wink face-palm nom cry kiss poke'.split(' '));
const NEKOS_LIFE = new Set('hug pat cuddle tickle feed slap kiss smug spank ngif'.split(' '));

// ───────────────────────────────────────────────────────────────
// AÇÃO → reações candidatas (ordem = prioridade) + queries Tenor/Giphy
// A 1ª reação é o espelho exato; as seguintes são vizinhas aceitáveis.
// ───────────────────────────────────────────────────────────────
const R = {
  // carinho / amor
  hug:        { r: ['hug', 'cuddle', 'glomp', 'nuzzle'], t: ['anime hug', 'anime tight hug'] },
  kiss:       { r: ['kiss', 'peck', 'blowkiss', 'airkiss'], t: ['anime kiss', 'anime romantic kiss'] },
  pat:        { r: ['pat', 'cuddle', 'nuzzle'], t: ['anime head pat', 'anime pat cute'] },
  cuddle:     { r: ['cuddle', 'hug', 'comfy', 'lappillow'], t: ['anime cuddle', 'anime snuggle'] },
  love:       { r: ['love', 'handhold', 'blowkiss', 'blush', 'kiss'], t: ['anime love confession', 'anime love heart'] },
  flirt:      { r: ['wink', 'blush', 'smug', 'shy', 'kabedon'], t: ['anime wink flirt', 'anime flirt blush'] },
  shy:        { r: ['shy', 'blush', 'pout', 'nervous'], t: ['anime shy blush', 'anime embarrassed'] },
  care:       { r: ['pat', 'feed', 'cuddle', 'hug', 'comfy'], t: ['anime nurse heal', 'anime taking care'] },
  bless:      { r: ['happy', 'clap', 'salute', 'smile', 'yay'], t: ['anime pray blessing', 'anime blessing light'] },
  chocolate:  { r: ['feed', 'nom', 'happy', 'blush', 'love'], t: ['anime chocolate gift', 'anime valentine chocolate'] },
  spoil:      { r: ['pat', 'feed', 'cuddle', 'nuzzle'], t: ['anime spoil princess', 'anime pamper'] },
  lick:       { r: ['lick', 'bite', 'nom'], t: ['anime lick'] },
  tickle:     { r: ['tickle', 'poke', 'laugh'], t: ['anime tickle'] },
  poke:       { r: ['poke', 'pinch', 'tickle'], t: ['anime poke'] },
  handhold:   { r: ['handhold', 'handshake', 'hug'], t: ['anime hold hands'] },
  marry:      { r: ['love', 'handhold', 'kiss', 'blush', 'happy'], t: ['anime wedding', 'anime marriage proposal'] },
  family:     { r: ['hug', 'cuddle', 'pat', 'happy', 'carry'], t: ['anime family hug', 'anime family cute'] },
  divorce:    { r: ['tableflip', 'angry', 'cry', 'nope', 'no'], t: ['anime breakup', 'anime divorce papers'] },

  // luta / violência
  slap:       { r: ['slap', 'smack', 'bonk'], t: ['anime slap', 'anime slap face'] },
  punch:      { r: ['punch', 'bonk', 'smack', 'kick'], t: ['anime punch', 'anime powerful punch'] },
  kick:       { r: ['kick', 'yeet', 'punch'], t: ['anime kick', 'anime flying kick'] },
  beat:       { r: ['punch', 'bonk', 'kick', 'slap', 'smack'], t: ['anime beat up', 'anime beatdown'] },
  bite:       { r: ['bite', 'nom', 'lick'], t: ['anime bite', 'anime vampire bite'] },
  kill:       { r: ['kill', 'shoot', 'punch', 'yeet', 'evillaugh'], t: ['anime kill dramatic', 'anime death scene'] },
  shoot:      { r: ['shoot', 'kill', 'angrystare', 'mad'], t: ['anime shooting gun', 'anime gun action'] },
  stab:       { r: ['kill', 'shoot', 'mad', 'angrystare', 'punch'], t: ['anime knife stab', 'anime knife attack'] },
  spit:       { r: ['bleh', 'nope', 'no', 'angry'], t: ['anime spit disgust', 'anime spit take'] },
  push:       { r: ['yeet', 'kick', 'bonk', 'punch'], t: ['anime push away', 'anime shove'] },
  poison:     { r: ['evillaugh', 'smug', 'feed', 'kill'], t: ['anime poison drink', 'anime evil poison'] },
  bully:      { r: ['bully', 'poke', 'bonk', 'smug', 'evillaugh'], t: ['anime bully tease', 'anime bullying'] },
  curse:      { r: ['evillaugh', 'angrystare', 'mad', 'smug', 'lurk'], t: ['anime dark curse spell', 'anime witch curse'] },
  angry:      { r: ['angry', 'mad', 'angrystare', 'tableflip', 'shout'], t: ['anime angry', 'anime furious rage'] },
  yeet:       { r: ['yeet', 'kick', 'tableflip'], t: ['anime yeet throw'] },
  faint:      { r: ['tired', 'sleep', 'lay', 'sigh', 'cry'], t: ['anime faint collapse', 'anime pass out'] },

  // emoções / estados
  cry:        { r: ['cry', 'sad', 'pout', 'sigh'], t: ['anime cry', 'anime crying tears'] },
  laugh:      { r: ['laugh', 'teehee', 'evillaugh', 'happy'], t: ['anime laugh', 'anime laughing hard'] },
  happy:      { r: ['happy', 'yay', 'smile', 'celebrate', 'dance'], t: ['anime happy', 'anime excited'] },
  sad:        { r: ['sad', 'cry', 'sigh', 'bored', 'lurk'], t: ['anime sad', 'anime sad alone'] },
  cringe:     { r: ['cringe', 'facepalm', 'bleh', 'sweat', 'baka'], t: ['anime cringe', 'anime facepalm'] },
  facepalm:   { r: ['facepalm', 'face-palm', 'sigh', 'baka'], t: ['anime facepalm'] },
  think:      { r: ['think', 'confused', 'huh', 'stare', 'hmm'], t: ['anime thinking', 'anime pondering'] },
  confused:   { r: ['confused', 'huh', 'think', 'shrug', 'baka'], t: ['anime confused', 'anime confused dumb'] },
  sleep:      { r: ['sleep', 'yawn', 'tired', 'lay', 'bored'], t: ['anime sleeping', 'anime sleepy'] },
  wake:       { r: ['yawn', 'shocked', 'surprised', 'shake', 'stare'], t: ['anime wake up', 'anime waking up morning'] },
  scared:     { r: ['scared', 'nervous', 'shocked', 'sweat', 'run'], t: ['anime scared', 'anime terrified'] },
  shocked:    { r: ['shocked', 'surprised', 'woah', 'stare', 'huh'], t: ['anime shocked', 'anime jaw drop'] },
  bored:      { r: ['bored', 'yawn', 'sigh', 'stare', 'lurk'], t: ['anime bored', 'anime boredom'] },
  tired:      { r: ['tired', 'yawn', 'sleep', 'sigh', 'sweat'], t: ['anime tired exhausted', 'anime exhausted'] },
  nervous:    { r: ['nervous', 'sweat', 'shy', 'blush', 'scared'], t: ['anime nervous sweat', 'anime anxious'] },
  smug:       { r: ['smug', 'cool', 'evillaugh', 'wink'], t: ['anime smug', 'anime smirk'] },
  pout:       { r: ['pout', 'angry', 'huh', 'bleh'], t: ['anime pout', 'anime pouting'] },
  jealous:    { r: ['angrystare', 'pout', 'mad', 'stare', 'angry'], t: ['anime jealous', 'anime jealousy'] },
  disgust:    { r: ['bleh', 'nope', 'no', 'cringe', 'facepalm'], t: ['anime disgust', 'anime disgusted face'] },
  betrayal:   { r: ['cry', 'shocked', 'stare', 'sad', 'tableflip'], t: ['anime betrayal shocked', 'anime betrayed'] },
  proud:      { r: ['smug', 'cool', 'thumbsup', 'salute', 'happy'], t: ['anime proud confident', 'anime confident pose'] },
  nosebleed:  { r: ['nosebleed', 'drool', 'blush', 'shy'], t: ['anime nosebleed', 'anime drool'] },
  drool:      { r: ['drool', 'nosebleed', 'nom', 'stare'], t: ['anime drool hungry', 'anime drooling'] },
  evil:       { r: ['evillaugh', 'smug', 'lurk', 'angrystare'], t: ['anime evil laugh', 'anime villain smile'] },
  lonely:     { r: ['lurk', 'sad', 'sigh', 'stare', 'bored'], t: ['anime lonely', 'anime alone window'] },

  // ações / diversão
  dance:      { r: ['dance', 'headbang', 'spin', 'celebrate', 'yay'], t: ['anime dance', 'anime dancing'] },
  celebrate:  { r: ['celebrate', 'yay', 'cheers', 'clap', 'highfive', 'dance'], t: ['anime celebration', 'anime victory'] },
  highfive:   { r: ['highfive', 'brofist', 'handshake', 'clap'], t: ['anime high five'] },
  wave:       { r: ['wave', 'salute', 'smile', 'peek'], t: ['anime wave hello', 'anime waving'] },
  eat:        { r: ['nom', 'feed', 'drool', 'happy'], t: ['anime eating', 'anime eating food'] },
  coffee:     { r: ['sip', 'nom', 'comfy', 'happy'], t: ['anime coffee sip', 'anime drinking coffee'] },
  drink:      { r: ['sip', 'cheers', 'nom'], t: ['anime drinking', 'anime cheers drink'] },
  drunk:      { r: ['cheers', 'sip', 'spin', 'roll', 'shake'], t: ['anime drunk', 'anime drunk funny'] },
  gossip:     { r: ['peek', 'smug', 'lurk', 'teehee', 'shout'], t: ['anime whisper gossip', 'anime gossip'] },
  run:        { r: ['run', 'yeet', 'spin', 'scared'], t: ['anime running', 'anime run fast'] },
  sing:       { r: ['sing', 'headbang', 'shout', 'dance'], t: ['anime singing', 'anime karaoke'] },
  study:      { r: ['think', 'sweat', 'tired', 'stare', 'sigh'], t: ['anime studying', 'anime studying books'] },
  code:       { r: ['think', 'cool', 'stare', 'sweat', 'headbang'], t: ['anime hacker typing', 'anime coding computer'] },
  game:       { r: ['headbang', 'shout', 'yay', 'cool', 'mad'], t: ['anime gamer', 'anime playing games'] },
  work:       { r: ['tired', 'sweat', 'sigh', 'salute', 'think'], t: ['anime working hard', 'anime office work'] },
  train:      { r: ['sweat', 'shout', 'headbang', 'run', 'punch'], t: ['anime training workout', 'anime power up'] },
  meditate:   { r: ['comfy', 'sleep', 'happy', 'sigh', 'lay'], t: ['anime meditation', 'anime meditating calm'] },
  bath:       { r: ['comfy', 'blush', 'happy', 'sip', 'lay'], t: ['anime bath relax', 'anime hot spring'] },
  cook:       { r: ['feed', 'nom', 'happy', 'cool'], t: ['anime cooking', 'anime chef cooking'] },
  summon:     { r: ['evillaugh', 'shout', 'lurk', 'woah', 'clap'], t: ['anime summon dark portal', 'anime summoning circle'] },
  aura:       { r: ['cool', 'woah', 'headbang', 'shout', 'evillaugh'], t: ['anime aura power', 'anime power up aura'] },
  power:      { r: ['cool', 'shout', 'woah', 'headbang', 'evillaugh'], t: ['anime powerful aura', 'anime overpowered'] },
  bat:        { r: ['lurk', 'evillaugh', 'peek', 'woah'], t: ['halloween bat dark', 'anime vampire bat'] },
  travel:     { r: ['run', 'wave', 'happy', 'woah', 'carry'], t: ['anime travel journey', 'anime adventure'] },
  party:      { r: ['celebrate', 'dance', 'cheers', 'headbang', 'yay'], t: ['anime party', 'anime party celebration'] },
  music:      { r: ['headbang', 'sing', 'dance', 'happy'], t: ['anime music headphones', 'anime listening music'] },
  phone:      { r: ['stare', 'lurk', 'peek', 'bored', 'teehee'], t: ['anime phone addiction', 'anime scrolling phone'] },
  sports:     { r: ['run', 'kick', 'sweat', 'celebrate', 'highfive'], t: ['anime sports', 'anime athlete run'] },
  farm:       { r: ['happy', 'nom', 'sweat', 'wave'], t: ['anime farm nature', 'anime countryside'] },
  home:       { r: ['comfy', 'lay', 'sip', 'sleep', 'bored'], t: ['anime cozy home', 'anime stay home couch'] },
  city:       { r: ['cool', 'wave', 'run', 'stare'], t: ['anime city night', 'anime urban city'] },

  // dinheiro / economia
  money:      { r: ['celebrate', 'yay', 'smug', 'drool', 'cool'], t: ['anime money rich', 'anime money rain'] },
  poor:       { r: ['cry', 'sad', 'sigh', 'lurk', 'tired'], t: ['anime poor broke', 'anime empty wallet'] },
  shopping:   { r: ['yay', 'happy', 'celebrate', 'drool', 'woah'], t: ['anime shopping bags', 'anime spending money'] },
  thief:      { r: ['lurk', 'run', 'peek', 'evillaugh', 'smug'], t: ['anime thief sneaky', 'anime stealing run'] },
  gamble:     { r: ['nervous', 'sweat', 'celebrate', 'cry', 'shocked'], t: ['anime gambling casino', 'anime kakegurui'] },
  gift:       { r: ['feed', 'happy', 'blush', 'yay', 'love'], t: ['anime gift present', 'anime giving gift'] },
  winner:     { r: ['celebrate', 'yay', 'thumbsup', 'highfive', 'salute'], t: ['anime winner trophy', 'anime champion'] },
  loser:      { r: ['cry', 'sad', 'facepalm', 'sigh', 'tableflip'], t: ['anime loser defeat', 'anime lose sad'] },
  boss:       { r: ['cool', 'salute', 'smug', 'thumbsup', 'stare'], t: ['anime boss cool', 'anime mafia boss'] },
  king:       { r: ['cool', 'smug', 'salute', 'clap', 'celebrate'], t: ['anime king throne', 'anime royal king'] },
  queen:      { r: ['smug', 'cool', 'blush', 'wave', 'wink'], t: ['anime queen royal', 'anime queen elegant'] },

  // medidores (traços de personalidade)
  beautiful:  { r: ['blush', 'wink', 'smile', 'nosebleed', 'woah'], t: ['anime beautiful sparkle', 'anime gorgeous'] },
  ugly:       { r: ['bleh', 'cringe', 'nope', 'facepalm', 'scared'], t: ['anime ugly funny', 'anime disgusted reaction'] },
  hot:        { r: ['nosebleed', 'drool', 'blush', 'wink', 'kabedon'], t: ['anime hot attractive', 'anime sexy wink'] },
  dumb:       { r: ['baka', 'confused', 'huh', 'facepalm', 'bleh'], t: ['anime dumb confused', 'anime baka'] },
  smart:      { r: ['think', 'cool', 'smug', 'thumbsup', 'nod'], t: ['anime genius glasses', 'anime smart idea'] },
  crazy:      { r: ['spin', 'evillaugh', 'headbang', 'roll', 'shout'], t: ['anime crazy laugh', 'anime insane'] },
  psycho:     { r: ['evillaugh', 'angrystare', 'lurk', 'stare', 'kill'], t: ['anime psycho yandere', 'anime yandere stare'] },
  strong:     { r: ['punch', 'cool', 'shout', 'headbang', 'thumbsup'], t: ['anime strong muscle', 'anime flex strong'] },
  weak:       { r: ['tired', 'cry', 'sweat', 'sigh', 'lay'], t: ['anime weak tired', 'anime weak collapse'] },
  lucky:      { r: ['celebrate', 'yay', 'woah', 'happy', 'thumbsup'], t: ['anime lucky clover', 'anime lucky win'] },
  unlucky:    { r: ['cry', 'facepalm', 'tableflip', 'sigh', 'sad'], t: ['anime unlucky fail', 'anime bad luck'] },
  gay:        { r: ['blush', 'happy', 'dance', 'wink', 'love'], t: ['anime rainbow pride', 'anime rainbow happy'] },
  simp:       { r: ['drool', 'nosebleed', 'blush', 'handhold', 'love'], t: ['anime simp blush', 'anime simp heart eyes'] },
  cheater:    { r: ['peek', 'lurk', 'smug', 'nervous', 'run'], t: ['anime cheating caught', 'anime betrayal cheating'] },
  loyal:      { r: ['salute', 'handhold', 'nod', 'hug', 'thumbsup'], t: ['anime loyal knight', 'anime loyal friend'] },
  sinner:     { r: ['evillaugh', 'smug', 'lurk', 'wink', 'nosebleed'], t: ['anime devil smirk', 'anime demon smile'] },
  holy:       { r: ['clap', 'salute', 'happy', 'smile', 'nod'], t: ['anime church pray', 'anime angel light'] },
  skeptic:    { r: ['stare', 'huh', 'shrug', 'nope', 'think'], t: ['anime skeptical face', 'anime doubt stare'] },
  lazy:       { r: ['lay', 'bored', 'yawn', 'sleep', 'comfy'], t: ['anime lazy couch', 'anime lazy day'] },
  addicted:   { r: ['stare', 'drool', 'lurk', 'headbang', 'shake'], t: ['anime addicted phone', 'anime obsessed'] },
  possessive: { r: ['angrystare', 'kabedon', 'hug', 'lurk', 'stare'], t: ['anime yandere possessive', 'anime possessive hug'] },
  cold:       { r: ['stare', 'cool', 'nope', 'shrug', 'lurk'], t: ['anime cold stare', 'anime ice cold attitude'] },
  fierce:     { r: ['angrystare', 'shout', 'punch', 'mad', 'cool'], t: ['anime fierce glare', 'anime badass'] },
  playful:    { r: ['teehee', 'poke', 'tickle', 'wink', 'bleh'], t: ['anime playful tease', 'anime playful wink'] },
  calm:       { r: ['comfy', 'sip', 'smile', 'nod', 'lay'], t: ['anime calm peaceful', 'anime serene tea'] },
  annoying:   { r: ['poke', 'shout', 'bleh', 'tableflip', 'facepalm'], t: ['anime annoying', 'anime annoyed reaction'] },
  affection:  { r: ['cuddle', 'hug', 'nuzzle', 'pat', 'love'], t: ['anime affectionate', 'anime warm hug'] },
  messy:      { r: ['roll', 'spin', 'tableflip', 'sweat', 'shrug'], t: ['anime messy room', 'anime chaos mess'] },
  silly:      { r: ['bleh', 'teehee', 'baka', 'roll', 'huh'], t: ['anime silly goofy', 'anime silly face'] },
  muscle:     { r: ['punch', 'cool', 'thumbsup', 'shout', 'headbang'], t: ['anime muscle flex', 'anime bodybuilder'] },
  charming:   { r: ['wink', 'smile', 'blush', 'blowkiss', 'cool'], t: ['anime charming smile', 'anime charming prince'] },
  formal:     { r: ['salute', 'nod', 'cool', 'stare', 'handshake'], t: ['anime formal suit bow', 'anime gentleman bow'] },
  creative:   { r: ['think', 'woah', 'happy', 'yay', 'clap'], t: ['anime painting art', 'anime creative drawing'] },
  arrogant:   { r: ['smug', 'cool', 'evillaugh', 'shrug', 'stare'], t: ['anime arrogant smirk', 'anime arrogant laugh'] },
  tech:       { r: ['cool', 'think', 'stare', 'woah', 'thumbsup'], t: ['anime hacker computer', 'anime technology screen'] },
  sick:       { r: ['sneeze', 'tired', 'lay', 'sweat', 'cry'], t: ['anime sick fever', 'anime sick in bed'] },
  funny:      { r: ['laugh', 'teehee', 'bleh', 'roll', 'clap'], t: ['anime funny comedy', 'anime laughing hard'] },
  humble:     { r: ['nod', 'salute', 'sorry', 'smile', 'shy'], t: ['anime humble bow', 'anime bowing thanks'] },
  freedom:    { r: ['run', 'spin', 'celebrate', 'wave', 'yay'], t: ['anime freedom run', 'anime free spirit'] },
  childish:   { r: ['pout', 'teehee', 'roll', 'bleh', 'cry'], t: ['anime childish tantrum', 'anime childish cute'] },
  anxious:    { r: ['nervous', 'sweat', 'scared', 'shake', 'sigh'], t: ['anime anxious nervous', 'anime worried sweat'] },
  quiet:      { r: ['lurk', 'peek', 'shy', 'stare', 'nod'], t: ['anime quiet shy', 'anime silent stare'] },
  careless:   { r: ['shrug', 'roll', 'yawn', 'bored', 'lay'], t: ['anime careless shrug', 'anime whatever shrug'] },
  local:      { r: ['wave', 'happy', 'sip', 'nod'], t: ['anime neighborhood', 'anime local shop'] },
  manly:      { r: ['cool', 'punch', 'salute', 'thumbsup', 'brofist'], t: ['anime manly cool', 'anime manly tears'] },
  mature:     { r: ['sip', 'cool', 'nod', 'smile', 'stare'], t: ['anime mature elegant', 'anime elegant woman'] },
  skinny:     { r: ['tired', 'sweat', 'shake', 'nom'], t: ['anime skinny thin', 'anime skinny funny'] },
  sly:        { r: ['smug', 'peek', 'lurk', 'wink', 'evillaugh'], t: ['anime sly smirk', 'anime sly fox'] },
  mysterious: { r: ['lurk', 'peek', 'stare', 'cool', 'smug'], t: ['anime mysterious dark', 'anime mysterious mask'] },
  legend:     { r: ['cool', 'salute', 'woah', 'celebrate', 'clap'], t: ['anime legend hero', 'anime legendary'] },
  modern:     { r: ['cool', 'wave', 'wink', 'dance'], t: ['anime modern style', 'anime fashion modern'] },
  nerd:       { r: ['think', 'stare', 'cool', 'nod', 'headbang'], t: ['anime nerd glasses', 'anime nerd push glasses'] },
  offline:    { r: ['sleep', 'lay', 'yawn', 'bored'], t: ['anime offline sleep', 'anime disconnected'] },
  online:     { r: ['wave', 'headbang', 'happy', 'stare', 'cool'], t: ['anime online gaming', 'anime online typing'] },
  organized:  { r: ['nod', 'thumbsup', 'salute', 'cool', 'clap'], t: ['anime organized neat', 'anime clean tidy'] },
  otaku:      { r: ['headbang', 'nosebleed', 'drool', 'yay', 'woah', 'dance', 'blush'], t: ['anime otaku fan', 'anime otaku excited'] },
  clown:      { r: ['bleh', 'teehee', 'facepalm', 'laugh', 'roll'], t: ['anime clown funny', 'clown makeup meme'] },
  optimistic: { r: ['happy', 'thumbsup', 'yay', 'smile', 'wave'], t: ['anime optimistic sunshine', 'anime positive vibes'] },
  pessimistic:{ r: ['sigh', 'sad', 'bored', 'lurk', 'shrug'], t: ['anime pessimistic rain', 'anime gloomy'] },
  standard:   { r: ['shrug', 'nod', 'smile', 'wave'], t: ['anime normal person', 'anime average'] },
  player:     { r: ['wink', 'smug', 'kabedon', 'blowkiss', 'cool'], t: ['anime player flirt', 'anime playboy wink'] },
  trickster:  { r: ['smug', 'evillaugh', 'teehee', 'peek', 'wink'], t: ['anime trickster smug', 'anime prank'] },
  popular:    { r: ['wave', 'celebrate', 'blush', 'clap', 'cool'], t: ['anime popular crowd', 'anime popular idol'] },
  practical:  { r: ['nod', 'thumbsup', 'think', 'salute'], t: ['anime practical work', 'anime toolbox fix'] },
  president:  { r: ['salute', 'cool', 'clap', 'nod', 'handshake'], t: ['anime president speech', 'anime student council president'] },
  realistic:  { r: ['shrug', 'nod', 'stare', 'sip', 'think'], t: ['anime realistic calm', 'anime deadpan'] },
  prayer:     { r: ['clap', 'salute', 'nod', 'smile', 'happy'], t: ['anime prayer faith', 'anime praying hands'] },
  romantic:   { r: ['love', 'kiss', 'handhold', 'blush', 'blowkiss'], t: ['anime romantic', 'anime romantic sunset'] },
  naughty:    { r: ['wink', 'smug', 'teehee', 'lick', 'bleh'], t: ['anime naughty wink', 'anime mischievous'] },
  healthy:    { r: ['run', 'thumbsup', 'happy', 'sweat', 'nom'], t: ['anime healthy sport', 'anime jogging morning'] },
  couch:      { r: ['lay', 'comfy', 'bored', 'sleep', 'yawn'], t: ['anime couch lazy', 'anime couch potato'] },
  follower:   { r: ['nod', 'run', 'salute', 'peek', 'wave'], t: ['anime follower group', 'anime sheep follow'] },
  gentleman:  { r: ['salute', 'handshake', 'nod', 'cool', 'wink'], t: ['anime gentleman bow', 'anime butler'] },
  lady:       { r: ['wave', 'smile', 'sip', 'blush', 'wink'], t: ['anime lady elegant', 'anime elegant tea'] },
  serious:    { r: ['stare', 'nod', 'cool', 'angrystare'], t: ['anime serious face', 'anime stern serious'] },
  friendly:   { r: ['wave', 'smile', 'highfive', 'hug', 'handshake'], t: ['anime friendly wave', 'anime friends'] },
  social:     { r: ['wave', 'cheers', 'highfive', 'celebrate', 'handshake'], t: ['anime friends group', 'anime social party'] },
  dreamer:    { r: ['stare', 'sleep', 'happy', 'think', 'woah'], t: ['anime dreamer stars', 'anime daydream sky'] },
  superstitious:{ r: ['scared', 'nervous', 'peek', 'sweat', 'shake'], t: ['anime superstitious charm', 'anime fortune telling'] },
  sneaky:     { r: ['lurk', 'peek', 'run', 'smug'], t: ['anime sneaky ninja', 'anime sneaking'] },
  worker:     { r: ['sweat', 'tired', 'salute', 'thumbsup', 'nod'], t: ['anime hard worker', 'anime construction work'] },
  traditional:{ r: ['nod', 'salute', 'sip', 'smile'], t: ['anime traditional kimono', 'anime japan tradition'] },
  traitor:    { r: ['evillaugh', 'lurk', 'smug', 'peek', 'shoot'], t: ['anime traitor betrayal', 'anime villain reveal'] },
  visionary:  { r: ['woah', 'think', 'stare', 'cool', 'clap'], t: ['anime visionary future', 'anime looking horizon'] },
  dependent:  { r: ['cuddle', 'hug', 'handhold', 'cry', 'lappillow'], t: ['anime clingy', 'anime dependent clingy hug'] },
  retro:      { r: ['headbang', 'dance', 'cool', 'sip'], t: ['anime retro 90s', 'retro anime aesthetic'] },
  adventure:  { r: ['run', 'woah', 'celebrate', 'carry', 'wave'], t: ['anime adventure journey', 'anime explorer'] },
  flag:       { r: ['salute', 'shout', 'clap', 'celebrate'], t: ['anime flag wave', 'anime salute flag'] },
  dog:        { r: ['wag', 'awoo', 'nom', 'happy', 'run'], t: ['anime dog girl wag', 'anime puppy'] },
  eating:     { r: ['nom', 'feed', 'drool', 'happy'], t: ['anime eating a lot', 'anime food mukbang'] },
  comedy:     { r: ['laugh', 'teehee', 'clap', 'slowclap', 'bleh'], t: ['anime comedy skit', 'anime comedy laugh'] },
  confident:  { r: ['cool', 'smug', 'thumbsup', 'salute', 'wink'], t: ['anime confident smirk', 'anime confident walk'] },
  world:      { r: ['woah', 'wave', 'run', 'celebrate'], t: ['anime world travel', 'anime globe travel'] },
  genius:     { r: ['think', 'cool', 'smug', 'clap', 'woah'], t: ['anime genius plan', 'anime genius glasses'] },
  rainbow:    { r: ['happy', 'dance', 'blush', 'celebrate', 'wink'], t: ['anime rainbow', 'anime rainbow pride'] },
  powerful:   { r: ['cool', 'shout', 'punch', 'evillaugh', 'woah'], t: ['anime powerful aura', 'anime power unleashed'] },
  spending:   { r: ['yay', 'celebrate', 'drool', 'shopping', 'cry'], t: ['anime spending money', 'anime shopping spree'] },
  coder:      { r: ['think', 'cool', 'stare', 'headbang', 'sweat'], t: ['anime coding hacker', 'anime programmer typing'] },
  study:      { r: ['think', 'sweat', 'tired', 'stare'], t: ['anime studying hard', 'anime study books'] },
  rich:       { r: ['celebrate', 'smug', 'yay', 'cool', 'drool'], t: ['anime rich money', 'anime rich laugh'] },
};

// ───────────────────────────────────────────────────────────────
// PALAVRAS-CHAVE (pt/en) → ação. Ordem importa: específicas primeiro.
// ───────────────────────────────────────────────────────────────
const KEYWORDS = [
  // luta (antes de emoções: "beat up fight" não pode virar "sad")
  ['facada|esfaque|knife|stab', 'stab'], ['tiro|atirar|shoot|gun', 'shoot'], ['matar|kill|death|morte', 'kill'],
  ['envenen|poison|veneno', 'poison'], ['amaldi|curse|maldi|feiti', 'curse'], ['bullying|bully|tease', 'bully'],
  ['tapa|slap|bofetada', 'slap'], ['soco|punch', 'punch'], ['chut|pontape|kick', 'kick'], ['espanc|bater|beat|brutal|surra', 'beat'],
  ['morder|bite|vampir', 'bite'], ['cuspir|spit|cospe', 'spit'], ['empurr|push|shove|knock', 'push'], ['yeet|arremess', 'yeet'],
  ['desmai|faint|pass out|sem energia', 'faint'],
  // carinho
  ['casament|wedding|marry|marri|noiv', 'marry'], ['divorc|breakup|separ', 'divorce'], ['famil|adoc|adoç|adopt|filh', 'family'],
  ['abrac|abraç|hug', 'hug'], ['beij|kiss', 'kiss'], ['cafun|head pat|headpat|acarici', 'pat'], ['cuddle|aconcheg|snuggle', 'cuddle'],
  ['declar|confession|love|amor|coração|heart', 'love'], ['flert|flirt|paquer|wink|piscad', 'flirt'], ['timid|shy|embarrass|vergonh', 'shy'],
  ['cuidar|nurse|heal|care|cura', 'care'], ['bencao|benção|bless|abenço', 'bless'], ['chocolate|valentine', 'chocolate'],
  ['paparic|spoil|pamper|mim', 'spoil'], ['lamber|lick', 'lick'], ['cocega|cócega|tickle', 'tickle'], ['cutuc|poke', 'poke'],
  ['mao dada|mão dada|handhold|hold hands', 'handhold'], ['presente|gift', 'gift'],
  // estados
  ['chor|cry|tears|lagrim', 'cry'], ['mimimi|dramatic', 'cry'], ['rir|laugh|hilar|risada|kkk', 'laugh'], ['cringe', 'cringe'], ['facepalm', 'facepalm'],
  ['acord|wake', 'wake'], ['dormi|sleep|dream|sono|sonol', 'sleep'], ['pens|think|ponder', 'think'], ['confus|dumb|burr|baka|bobo|boba|silly', 'dumb'],
  ['assust|scared|terrif|medo|covard|afraid', 'scared'], ['choc|shock|surpres|jaw', 'shocked'], ['entedi|bored|tedio|tédio', 'bored'],
  ['cansad|tired|exaust|fraco|weak', 'weak'], ['nervos|nervous|anxi|ansios|worry', 'anxious'], ['smug|smirk|convenc', 'smug'],
  ['bico|pout|emburr', 'pout'], ['ciume|ciúme|jealous|envy|invej', 'jealous'], ['nojo|disgust|feio|feia|ugly', 'ugly'],
  ['trai|betray|corno|chifr|cheat', 'betrayal'], ['nosebleed|sangue no nariz', 'nosebleed'], ['drool|bab', 'drool'],
  ['evil|vila|villain|dark magic|demon', 'evil'], ['sozinh|lonely|alone|antissoc|antisocial', 'lonely'], ['triste|sad|gloom', 'sad'],
  ['bravo|braba|angry|furious|raiva|rage|fierce|mad ', 'angry'],
  // ações
  ['danc|danç|dance|bailar', 'dance'], ['celebr|victory|vitoria|vitória|comemor', 'celebrate'], ['highfive|high five|toca aqui', 'highfive'],
  ['acen|wave|hello|hola|tchau|ola', 'wave'], ['comer|eat|food|comid|comil|hungry|fome|mukbang', 'eat'], ['cafe|café|coffee|espresso', 'coffee'],
  ['bebad|bêbad|drunk|beer|cerveja', 'drunk'], ['beber|drink|cheers|brind', 'drink'], ['fofoc|gossip|whisper|secret', 'gossip'],
  ['corr|run|escape|sprint', 'run'], ['cant|sing|karaoke|microphone', 'sing'], ['estud|study|books|prova', 'study'],
  ['program|hacker|coding|codar|code|dev', 'code'], ['gamer|gaming|jogar|game|controller', 'game'], ['trabalh|work|office|emprego', 'work'],
  ['trein|workout|training|academia|gym|bombad|muscle|forte|strong|flex', 'strong'], ['medit|meditation|zen', 'meditate'],
  ['banho|bath|shower|spring', 'bath'], ['cozinh|cook|chef', 'cook'], ['summon|invoc|portal', 'summon'], ['god|supreme|godadm', 'power'],
  ['aura', 'aura'], ['halloween|bat|morceg', 'bat'], ['viaj|travel|journey|aventur|adventure|explor', 'adventure'],
  ['party|festa|balada', 'party'], ['music|música|musica|headphone', 'music'], ['celular|phone|vicia|addict', 'addicted'],
  ['atleta|sport|athlete|futebol|soccer|bola', 'sports'], ['fazend|farm|roça|countryside', 'farm'], ['caseir|home|cozy|casa', 'home'],
  ['cidade|city|urban|cosmopolit', 'city'], ['sofa|sofá|couch|potato|pregui|lazy|relax', 'lazy'],
  // dinheiro
  ['bilion|billion|milion|million|rico|rica|rich|money|dinheiro|coins|wealth', 'rich'], ['pobre|poor|broke|falid', 'poor'],
  ['gast|spend|shopping|compra', 'shopping'], ['ladr|thief|steal|roub|sneaky|furt', 'thief'], ['crime|crimin', 'thief'],
  ['apost|gambl|casino|bet', 'gamble'], ['winner|vencedor|campe|trophy|trofeu|troféu|win', 'winner'], ['loser|perded|derrot|fail|perdeu', 'loser'],
  ['chefe|boss|mafia', 'boss'], ['rei|king|throne', 'king'], ['rainha|queen', 'queen'], ['president', 'president'],
  ['ranking|rank|top', 'winner'], ['daily|diari|diári', 'gift'],
  // medidores
  ['lind|beaut|gorgeous|sparkle|charm', 'beautiful'], ['gostos|hot|attract|sexy|bucet|piroc|pirok', 'hot'], ['intelig|smart|esperto|genio|gênio|genius', 'genius'],
  ['doid|crazy|malu|louc|insane|wild', 'crazy'], ['psico|psycho|yandere', 'psycho'], ['sort|lucky|clover', 'lucky'], ['azar|unlucky|bad luck', 'unlucky'],
  ['gay|rainbow|pride|arco', 'gay'], ['gado|gada|simp', 'simp'], ['fiel|loyal|leal', 'loyal'], ['pecad|sinner|devil|safad|naughty|sacan', 'naughty'],
  ['crente|church|pray|holy|angel|fé|faith|orac|oraç', 'prayer'], ['ateu|ateia|skeptic|cetic|cétic|doubt', 'skeptic'],
  ['possess|clingy|grud|depend', 'possessive'], ['desapeg|cold|frio|ice|gelo|indiferen', 'cold'], ['brincalh|playful', 'playful'],
  ['calm|tranquil|serene|paz', 'calm'], ['chat|annoy|irrit|insuport', 'annoying'], ['carinhos|affection|warm', 'affection'],
  ['bagunc|messy|chaos|desorgan', 'messy'], ['charmos|charming|prince', 'charming'], ['formal|suit|conservador|conservadora', 'formal'],
  ['criativ|creative|art|paint|desenh', 'creative'], ['desumild|arrogant|metid|arrogan', 'arrogant'], ['digital|tech|technology', 'tech'],
  ['doent|sick|fever|ill|gripe', 'sick'], ['engraç|engrac|funny|comed|comédia|comedy|piad', 'comedy'], ['humild|humble|bow', 'humble'],
  ['livre|freedom|free spirit|liberd', 'freedom'], ['crianc|crianç|childish|infantil|kid', 'childish'], ['quiet|caladin|calad|silent|tímido', 'quiet'],
  ['careless|desleix|whatever|tanto faz', 'careless'], ['local|bairro|neighborhood', 'local'], ['machao|machão|manly|macho', 'manly'],
  ['madur|mature|elegant', 'mature'], ['magr|skinny|thin', 'skinny'], ['malandr|sly|fox|espert', 'sly'], ['misterios|mysterious|mask', 'mysterious'],
  ['lend|legend|hero|heroi|herói', 'legend'], ['modern|fashion|estilos', 'modern'], ['nerd|glasses|oculos|óculos', 'nerd'],
  ['offline|desconect', 'offline'], ['online|conect', 'online'], ['organiz|neat|tidy|arrumad', 'organized'], ['otaku|weeb|fan', 'otaku'],
  ['palhac|palhaç|clown', 'clown'], ['otimis|optimis|positiv', 'optimistic'], ['pessimis|gloomy|negativ', 'pessimistic'], ['padrao|padrão|standard|normal|average|comum', 'standard'],
  ['pegador|pegadora|player|playboy|galinh', 'player'], ['trapac|trickster|prank|cheat', 'trickster'], ['popular|idol|famos', 'popular'],
  ['pratic|prátic|practical|fix|tool', 'practical'], ['realist|deadpan', 'realistic'], ['romantic|romântic|sunset', 'romantic'],
  ['saudav|saudáv|healthy|jogging', 'healthy'], ['seguidor|follower|sheep|puxa', 'follower'], ['cavalheir|gentleman|butler', 'gentleman'],
  ['dama|lady|elegante', 'lady'], ['seri|serious|stern|sério', 'serious'], ['amig|friendly|friend', 'friendly'], ['social|group|turma', 'social'],
  ['sonhad|dreamer|daydream|stars', 'dreamer'], ['supersti|charm|fortune|benzed', 'superstitious'], ['ninja|sneak|stealth', 'sneaky'],
  ['trabalhad|worker|hard work|construction|esforç', 'worker'], ['tradic|tradition|kimono|japan', 'traditional'], ['traidor|traitor|reveal', 'traitor'],
  ['visionar|visionár|visionary|future|futur|horizon', 'visionary'], ['retro|analog|analóg|90s|vintage', 'retro'],
  ['bandeira|flag|bolsonar|comunist|patriot', 'flag'], ['cachorr|dog|puppy|wag|woof', 'dog'], ['mundo|world|globe|globo', 'world'],
  ['powerful|poder|power', 'powerful'], ['confian|confident|confiante', 'confident'], ['insone|insomnia|noite|night|madrug', 'tired'],
  ['feliz|happy|alegr|excited|smile|sorri|yay|celebr', 'happy'], ['reaction|wow|amazing|woah', 'shocked'],
];

// ───────────────────────────────────────────────────────────────
// utilitários
// ───────────────────────────────────────────────────────────────
function delayReject(ms, label = 'timeout') {
  return new Promise((_, reject) => setTimeout(() => reject(new Error(label)), ms));
}
function withTimeout(p, ms = TIMEOUT_MS) { return Promise.race([p, delayReject(ms)]); }
function normalize(s = '') {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function rememberRecent(key, url) {
  const list = recentByKey.get(key) || [];
  list.unshift(url);
  recentByKey.set(key, [...new Set(list)].slice(0, 10));
}
function isRecent(key, url) { return (recentByKey.get(key) || []).includes(url); }

function getFfmpegBin() {
  try { return require('ffmpeg-static') || 'ffmpeg'; } catch { return 'ffmpeg'; }
}

function detectKind(buffer, url = '') {
  if (!buffer || buffer.length < 12) return 'unknown';
  if (buffer.slice(4, 8).toString() === 'ftyp') return 'mp4';
  if (buffer.slice(0, 6).toString() === 'GIF87a' || buffer.slice(0, 6).toString() === 'GIF89a') return 'gif';
  if (buffer.slice(0, 4).toString() === 'RIFF' && buffer.slice(8, 12).toString() === 'WEBP') return 'webp';
  if (buffer.slice(0, 8).toString('hex') === '89504e470d0a1a0a') return 'png';
  if (buffer.slice(0, 3).toString('hex') === 'ffd8ff') return 'jpg';
  if (/\.mp4(?:\?|$)/i.test(url)) return 'mp4';
  if (/\.gif(?:\?|$)/i.test(url)) return 'gif';
  if (/\.webp(?:\?|$)/i.test(url)) return 'webp';
  return 'unknown';
}
function extForKind(kind) {
  return ({ gif: 'gif', webp: 'webp', mp4: 'mp4', png: 'png', jpg: 'jpg' })[kind] || 'bin';
}

function convertAnimatedToMp4(inputBuffer, kind = 'gif') {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'darkbot-gif-'));
  const inputPath = path.join(tmpDir, `input.${extForKind(kind)}`);
  const outputPath = path.join(tmpDir, 'output.mp4');
  try {
    fs.writeFileSync(inputPath, inputBuffer);
    const args = ['-y'];
    // imagem estática (png/jpg/webp parado) → 3 s de vídeo para o gifPlayback não falhar
    if (kind === 'png' || kind === 'jpg') args.push('-loop', '1', '-t', '3');
    else args.push('-t', '8');
    args.push('-i', inputPath,
      '-vf', 'fps=15,scale=360:-2:flags=lanczos,format=yuv420p',
      '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-movflags', '+faststart',
      outputPath);
    execFileSync(getFfmpegBin(), args, { stdio: 'ignore', timeout: 45000 });
    const out = fs.readFileSync(outputPath);
    if (!out || out.length < 500 || detectKind(out) !== 'mp4') throw new Error('MP4 inválido');
    return out;
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

// ───────────────────────────────────────────────────────────────
// resolução ação → reações
// ───────────────────────────────────────────────────────────────
// Frases compostas verificadas ANTES dos tokens (a ordem das palavras importa)
const PHRASES = [
  ['high five|toca aqui', 'highfive'], ['evil laugh|risada mal', 'evil'], ['dark magic|summon|invoc', 'summon'],
  ['power up|god mode|godadm|supreme', 'power'], ['pass out|sem energia|faint', 'faint'], ['hold hands|mao dada|mão dada', 'handhold'],
  ['head pat|headpat', 'pat'], ['wake up|acord', 'wake'], ['beat up|surra|espanc', 'beat'], ['knock down|shove', 'push'],
  ['face-palm|facepalm', 'facepalm'], ['jaw drop', 'shocked'], ['bad luck|azar', 'unlucky'], ['hot spring', 'bath'],
  ['thief|ladr|roub|steal', 'thief'], ['yandere possessive|possessive', 'possessive'], ['lucky clover|clover|sort', 'lucky'],
  ['confident|confian', 'confident'], ['devil|pecad|safad|naughty', 'naughty'], ['joker|doid|malu|crazy|louc|insane', 'crazy'],
  ['working|trabalh|office', 'work'], ['mimimi|dramatic|cry|chor', 'cry'], ['workout|training|trein|academia|gym', 'strong'],
];

function resolveAction(query = '') {
  const q = normalize(query).trim();
  if (!q) return 'happy';
  if (R[q]) return q;                          // já é uma ação canónica
  for (const [pat, action] of PHRASES) if (new RegExp(pat, 'i').test(q)) return action;
  // token a token, pela ordem em que aparecem ("anime cry tears" → cry, não tears)
  const tokens = q.split(/[^a-z0-9]+/).filter(t => t && t !== 'anime' && t.length > 1);
  for (const tok of tokens) {
    if (R[tok]) return tok;
    for (const [pat, action] of KEYWORDS) if (new RegExp('^(?:' + pat + ')', 'i').test(tok)) return action;
  }
  for (const [pat, action] of KEYWORDS) if (new RegExp(pat, 'i').test(q)) return action;
  return 'happy';
}

/** Compatível com o código antigo: devolve a categoria + nomes por fonte. */
function resolveCategory(query = '') {
  const action = resolveAction(query);
  const entry = R[action] || R.happy;
  const first = (set) => entry.r.find(x => set.has(x)) || null;
  return {
    action,
    reactions: entry.r,
    otaku: entry.r.filter(x => OTAKU.has(x)),
    nekos: first(NEKOS_BEST),
    waifu: first(WAIFU),
    purr: first(PURR),
    sra: first(SRA),
    life: first(NEKOS_LIFE),
    tenor: entry.t,
  };
}

// ───────────────────────────────────────────────────────────────
// fontes — cada uma devolve [{ url, exact:boolean, src }] ou []
// `exact` = a reação existe nessa fonte com o nome do espelho (1.ª escolha)
// ───────────────────────────────────────────────────────────────
function pickReaction(reactions, set, max = 2) {
  // todas as reações da ação que a fonte suporta, por prioridade
  return reactions.filter(x => set.has(x)).slice(0, max);
}

async function srcOtaku(reactions) {
  const out = [];
  const cands = pickReaction(reactions, OTAKU, 2);
  await Promise.all(cands.map(async (r, i) => {
    try {
      const d = await withTimeout(mediaHandler.fetchJson(`https://api.otakugifs.xyz/gif?reaction=${encodeURIComponent(r)}&format=gif`));
      if (d?.url) out.push({ url: d.url, exact: i === 0, src: 'otaku' });
    } catch {}
  }));
  return out;
}

async function srcNekosBest(reactions) {
  const out = [];
  const cands = pickReaction(reactions, NEKOS_BEST, 2);
  await Promise.all(cands.map(async (r, i) => {
    try {
      const d = await withTimeout(mediaHandler.fetchJson(
        `https://nekos.best/api/v2/${encodeURIComponent(r)}?amount=3`, { headers: { 'User-Agent': BOT_UA } }));
      for (const it of (d?.results || [])) if (it?.url) out.push({ url: it.url, exact: i === 0, src: 'nekos.best' });
    } catch {}
  }));
  return out;
}

async function srcPurr(reactions) {
  const out = [];
  const cands = pickReaction(reactions, PURR, 2);
  await Promise.all(cands.map(async (r, i) => {
    try {
      const d = await withTimeout(mediaHandler.fetchJson(
        `https://api.purrbot.site/v2/img/sfw/${encodeURIComponent(r)}/gif`, { headers: { 'User-Agent': BOT_UA } }));
      if (d?.link && d.error === false) out.push({ url: d.link, exact: i === 0, src: 'purrbot' });
    } catch {}
  }));
  return out;
}

async function srcWaifu(reactions) {
  const out = [];
  const cands = pickReaction(reactions, WAIFU, 2);
  await Promise.all(cands.map(async (r, i) => {
    try {
      const d = await withTimeout(mediaHandler.fetchJson(`https://api.waifu.pics/sfw/${encodeURIComponent(r)}`));
      if (d?.url) out.push({ url: d.url, exact: i === 0, src: 'waifu.pics' });
    } catch {}
  }));
  return out;
}

async function srcSRA(reactions) {
  const out = [];
  const map = { facepalm: 'face-palm' };
  const cands = reactions.map(x => map[x] || x).filter(x => SRA.has(x)).slice(0, 2);
  await Promise.all(cands.map(async (r, i) => {
    try {
      const d = await withTimeout(mediaHandler.fetchJson(`https://api.some-random-api.com/animu/${encodeURIComponent(r)}`, { headers: { 'User-Agent': BOT_UA } }));
      if (d?.link) out.push({ url: d.link, exact: i === 0, src: 'some-random-api' });
    } catch {}
  }));
  return out;
}

async function srcNekosLife(reactions) {
  const out = [];
  const cands = pickReaction(reactions, NEKOS_LIFE, 1);
  await Promise.all(cands.map(async (r, i) => {
    try {
      const d = await withTimeout(mediaHandler.fetchJson(`https://nekos.life/api/v2/img/${encodeURIComponent(r)}`));
      if (d?.url) out.push({ url: d.url, exact: i === 0, src: 'nekos.life' });
    } catch {}
  }));
  return out;
}

async function srcTenor(queries) {
  // A Google descontinuou a Tenor API pública; só tenta se houver key e sem filtro.
  if (!TENOR_KEY) return [];
  const out = [];
  await Promise.all(queries.slice(0, 2).map(async (q, i) => {
    try {
      const url = `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(q)}&key=${TENOR_KEY}&limit=15&media_filter=tinymp4,mp4,gif&contentfilter=off&random=true`;
      const d = await withTimeout(mediaHandler.fetchJson(url));
      for (const x of (d?.results || [])) {
        const u = x.media_formats?.tinymp4?.url || x.media_formats?.mp4?.url || x.media_formats?.gif?.url;
        if (u) out.push({ url: u, exact: i === 0, src: 'tenor' });
      }
    } catch {}
  }));
  return out;
}

async function srcGiphy(queries) {
  if (!GIPHY_KEY) return [];
  const out = [];
  await Promise.all(queries.slice(0, 2).map(async (q, i) => {
    try {
      const url = `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_KEY}&q=${encodeURIComponent(q)}&limit=15&rating=r&lang=pt`;
      const d = await withTimeout(mediaHandler.fetchJson(url));
      for (const x of (d?.data || [])) {
        const u = x.images?.fixed_height?.mp4 || x.images?.original?.mp4 || x.images?.original?.url;
        if (u) out.push({ url: u, exact: i === 0, src: 'giphy' });
      }
    } catch {}
  }));
  return out;
}

/**
 * Recolhe candidatos de TODAS as fontes em paralelo e ordena:
 *   1) reação exata, 2) não repetido recentemente, 3) aleatório.
 */
async function fetchCandidates(query) {
  const cat = resolveCategory(query);
  const key = `gif:${cat.action}`;
  const settled = await Promise.allSettled([
    srcOtaku(cat.reactions),
    srcNekosBest(cat.reactions),
    srcPurr(cat.reactions),
    srcWaifu(cat.reactions),
    srcSRA(cat.reactions),
    srcNekosLife(cat.reactions),
    srcTenor(cat.tenor),
    srcGiphy(cat.tenor),
  ]);
  const all = [];
  const seen = new Set();
  for (const s of settled) {
    if (s.status !== 'fulfilled') continue;
    for (const c of s.value) if (c?.url && !seen.has(c.url)) { seen.add(c.url); all.push(c); }
  }
  const exactFresh = shuffle(all.filter(c => c.exact && !isRecent(key, c.url)));
  const nearFresh  = shuffle(all.filter(c => !c.exact && !isRecent(key, c.url)));
  const stale      = shuffle(all.filter(c => isRecent(key, c.url)));
  return { key, action: cat.action, list: [...exactFresh, ...nearFresh, ...stale] };
}

// mantém a API antiga: devolve só 1 URL (útil para testes/diagnóstico)
async function fetchCandidateUrls(query) {
  const { list } = await fetchCandidates(query);
  return list.map(c => c.url);
}
async function fetchTenorMp4Url(query) { const r = await srcTenor(resolveCategory(query).tenor); return r[0]?.url || null; }
async function fetchOtakuGifUrl(query) { const r = await srcOtaku(resolveCategory(query).reactions); return r[0]?.url || null; }
async function fetchWaifuGifUrl(query) { const r = await srcWaifu(resolveCategory(query).reactions); return r[0]?.url || null; }
async function fetchNekosGifUrl(query) { const r = await srcNekosBest(resolveCategory(query).reactions); return r[0]?.url || null; }

async function bufferToWhatsappMp4(url) {
  const buf = await withTimeout(mediaHandler.fetchBuffer(url, 5, { headers: { 'User-Agent': BOT_UA } }), 9000);
  if (!buf || buf.length < 500) return null;
  const kind = detectKind(buf, url);
  if (kind === 'unknown') return null;
  const mp4 = kind === 'mp4' ? buf : convertAnimatedToMp4(buf, kind);
  if (!mp4 || mp4.length < 500 || mp4.length > MAX_BYTES) return null;
  return mp4;
}

/**
 * Devolve um Buffer MP4 pronto para `gifPlayback: true`, ou null.
 * Tenta até 4 candidatos (ordenados por fidelidade à ação).
 */
async function fetchGifBuffer(query) {
  if (!query) return null;
  const { key, list } = await fetchCandidates(query);
  let tried = 0;
  for (const c of list) {
    if (tried++ >= 4) break;
    try {
      const mp4 = await bufferToWhatsappMp4(c.url);
      if (mp4) { rememberRecent(key, c.url); return mp4; }
    } catch {}
  }
  return null;
}

async function sendWithGif(sock, msg, ctx, text, mentions, query) {
  mentions = mentions || [];
  if (query) {
    try {
      const buf = await fetchGifBuffer(query);
      if (buf) {
        return sock.sendMessage(ctx.remoteJid, {
          video: buf,
          gifPlayback: true,
          caption: text,
          mentions,
          mimetype: 'video/mp4',
        }, { quoted: msg });
      }
    } catch {}
  }
  return sock.sendMessage(ctx.remoteJid, { text, mentions }, { quoted: msg });
}

module.exports = {
  fetchGifBuffer,
  fetchCandidates,
  fetchCandidateUrls,
  fetchTenorMp4Url,
  fetchOtakuGifUrl,
  fetchWaifuGifUrl,
  fetchNekosGifUrl,
  sendWithGif,
  resolveCategory,
  resolveAction,
  ACTIONS: R,
  SOURCES: { OTAKU, NEKOS_BEST, PURR, WAIFU, SRA, NEKOS_LIFE },
};
