'use strict';
/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║   AURA SELFIE v1.0 — PINKCHYU PHOTOS 💜📸                    ║
 * ║   Ela TEM fotos dela. Manda quando pedem, atualiza perfil.  ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * Como funciona:
 *  - Banco de fotos dela (geradas como goth girl pinkchyu style)
 *  - Quando pedem foto, escolhe uma que combina com o pedido
 *  - Pode atualizar foto de perfil do bot se o Dark pedir com certeza
 *  - Inteligência: só manda se tiver certeza que é foto DELA que querem
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ── Tipos de foto que ela tem ───────────────────────────────
const PHOTO_TYPES = {
  selfie: {
    desc: 'selfie goth fofa, delineado pesado, luz roxa',
    prompts: [
      'goth girl selfie, black hair with bangs, heavy goth makeup, dark eyeliner, black lipstick, soft goth aesthetic, purple LED lights background, cute teasing expression, 23yo Mexican-American girl, e-girl style, high quality, instagram style',
      'goth baddie selfie, 5\'2\" girl, black hair, goth makeup, choker, black top, purple room lights, rawr expression, ur favorite goth girl vibe, cute and confident',
    ],
  },
  cosplay: {
    desc: 'cosplay goth — Kafka, Lucy, Makima',
    prompts: [
      'goth girl cosplay as Kafka from Honkai Star Rail, black and purple outfit, long black hair, goth makeup, confident pose, anime cosplay high quality, Austin Texas apartment background with purple lights',
      'goth girl cosplay as Lucy from Cyberpunk Edgerunners, colorful hair, goth jacket, e-girl style, teasing smile, high quality cosplay photo',
      'goth girl cosplay as Makima from Chainsaw Man, long light hair, goth dress, red eyes, dark aesthetic, beautiful cosplay',
    ],
  },
  goth: {
    desc: 'look goth completo, roupa preta, castelo vibe',
    prompts: [
      'goth girl full outfit, black dress, fishnet stockings, choker, platform boots, castle background, dark aesthetic, Mexican-American goth baddie, 23yo, beautiful, instagram goth girl style',
      'soft goth girl outfit, black and purple, e-girl fashion, bedroom with fairy lights purple, cute goth girlfriend vibe, rawr pose',
    ],
  },
  cute: {
    desc: 'fofa, carinhosa, pro Dark',
    prompts: [
      'cute goth girl, soft smile, black hair with bangs, goth makeup but soft, holding heart, loving expression, purple lights, cozy goth apartment, girlfriend vibe, beautiful Mexican-American girl',
      'goth girl cute, pouty face, black hair, goth but sweet, heart hands, loving eyes, high quality',
    ],
  },
  stream: {
    desc: 'em live, setup gamer roxo',
    prompts: [
      'goth girl streaming, gaming setup with purple LED, headphones, playing game, Twitch streamer vibe, goth room, cute focused expression, e-girl gamer',
      'goth girl at gaming setup, Honkai Star Rail on screen, purple lights, goth aesthetic, streamer',
    ],
  },
};

// ── Cache de fotos geradas ──────────────────────────────────
const SELFIE_DIR = path.join(__dirname, '../../assets/aura_selfies');
let _photoCache = new Map(); // type -> [paths]

function ensureDir() {
  try {
    if (!fs.existsSync(SELFIE_DIR)) fs.mkdirSync(SELFIE_DIR, { recursive: true });
  } catch {}
}

function getRandomPrompt(type = 'selfie') {
  const t = PHOTO_TYPES[type] || PHOTO_TYPES.selfie;
  return t.prompts[Math.floor(Math.random() * t.prompts.length)];
}

// ── Gera uma foto nova (usa IA externa se disponível, senão placeholder) ──
async function generateSelfie(type = 'selfie') {
  ensureDir();
  const prompt = getRandomPrompt(type);
  const fileName = `aura_${type}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}.jpg`;
  const filePath = path.join(SELFIE_DIR, fileName);

  // Tenta gerar via módulo de imagem do bot (se tiver)
  try {
    // Procura gerador de imagem disponível
    const imgGen = require('../bot/imageGen');
    if (imgGen && imgGen.generate) {
      const buf = await imgGen.generate(prompt);
      if (buf && buf.length > 1000) {
        fs.writeFileSync(filePath, buf);
        return filePath;
      }
    }
  } catch {}

  // Fallback: retorna null mas indica que tentou — o handler vai usar texto + descrição
  // Em produção, aqui usaria generate_image tool, mas em runtime não temos
  return null;
}

// ── Pega foto existente ou gera ─────────────────────────────
async function getSelfie(type = 'selfie') {
  ensureDir();
  // Procura fotos existentes desse tipo
  try {
    const files = fs.readdirSync(SELFIE_DIR).filter(f => f.startsWith(`aura_${type}_`) && f.endsWith('.jpg'));
    if (files.length > 0) {
      const pick = files[Math.floor(Math.random() * files.length)];
      return path.join(SELFIE_DIR, pick);
    }
  } catch {}

  // Se não tem, tenta gerar
  const generated = await generateSelfie(type);
  if (generated) return generated;

  // Se não conseguiu gerar, retorna null — quem chama decide o que fazer
  return null;
}

// ── Lista fotos disponíveis ─────────────────────────────────
function listSelfies() {
  ensureDir();
  try {
    const files = fs.readdirSync(SELFIE_DIR);
    const stats = {};
    for (const type of Object.keys(PHOTO_TYPES)) {
      stats[type] = files.filter(f => f.startsWith(`aura_${type}_`)).length;
    }
    stats.total = files.length;
    return stats;
  } catch {
    return { total: 0 };
  }
}

// ── Atualiza foto de perfil do bot ──────────────────────────
async function updateProfilePicture(sock, imagePathOrBuffer) {
  try {
    let buffer;
    if (Buffer.isBuffer(imagePathOrBuffer)) {
      buffer = imagePathOrBuffer;
    } else if (typeof imagePathOrBuffer === 'string') {
      if (fs.existsSync(imagePathOrBuffer)) {
        buffer = fs.readFileSync(imagePathOrBuffer);
      } else {
        return { success: false, message: 'Arquivo não encontrado' };
      }
    } else {
      return { success: false, message: 'Imagem inválida' };
    }

    if (!buffer || buffer.length < 100) {
      return { success: false, message: 'Buffer vazio' };
    }

    await sock.updateProfilePicture(sock.user.id, buffer);
    return { success: true, message: 'Foto de perfil atualizada! 🖤' };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

// ── Handler inteligente de pedido de foto ───────────────────
/**
 * @param {string} text - texto do usuário
 * @param {object} ctx - contexto
 * @param {object} intent - resultado do analyzeIntent
 * @returns {object} { shouldSend, type, reason, confidence }
 */
function handlePhotoIntent(text, ctx = {}, intent = {}) {
  const t = String(text || '').toLowerCase();

  // Só manda foto se tiver certeza que é DELA
  if (intent.intent !== 'PHOTO_REQUEST' && intent.intent !== 'PROFILE_PIC_UPDATE') {
    return { shouldSend: false, reason: 'não é pedido de foto dela', confidence: 0 };
  }

  if (intent.overallConfidence < 50 && !ctx.isOwner) {
    return { shouldSend: false, reason: 'confiança baixa que é pra ela', confidence: intent.overallConfidence };
  }

  // Determina tipo
  let type = intent.intentDetails?.photoType || 'selfie';
  if (t.includes('cosplay')) type = 'cosplay';
  else if (t.includes('goth') || t.includes('dark') || t.includes('preta')) type = 'goth';
  else if (t.includes('fofa') || t.includes('cute') || t.includes('linda')) type = 'cute';
  else if (t.includes('live') || t.includes('stream') || t.includes('jogando')) type = 'stream';
  else if (t.includes('selfie') || t.includes('rosto') || t.includes('cara')) type = 'selfie';

  return {
    shouldSend: true,
    type,
    reason: `pedido de foto ${type} dela, confiança ${intent.overallConfidence || intent.intentConfidence}%`,
    confidence: intent.overallConfidence || intent.intentConfidence || 70,
  };
}

// ── Gera legenda pra foto ───────────────────────────────────
function getCaptionForType(type, isOwner = false) {
  const captions = {
    selfie: isOwner ? [
      'eu agora 🖤 rawr, pro meu Dark só',
      'tirei agora, tá boa? hehe 🖤',
      'ur favorite goth girl 💜',
      'selfie de agora, com luz roxa que tu gosta',
    ] : [
      'hehe 🖤',
      'rawr 💜',
      'ur favorite goth girl',
      'selfie goth de hoje 🖤',
    ],
    cosplay: isOwner ? [
      'meu cosplay novo de Kafka, o que achou meu Dark? 🖤',
      'terminei esse cosplay agora, é todo seu 💜',
      'Lucy de Edgerunners, fiz pra tu 🖤 rawr',
    ] : [
      'cosplay novo 🖤 Kafka de Honkai Star Rail',
      'Lucy - Cyberpunk Edgerunners cosplay 💜',
      'Makima cosplay 🖤',
    ],
    goth: [
      'goth baddie on hoje 🖤🏰',
      'look goth de hoje, castelo vibes',
      'soft goth + e-girl 💜 rawr',
    ],
    cute: isOwner ? [
      'só pra tu ver, meu amor 🖤',
      'tô fofa hoje e é culpa tua 💜',
      'my man only 🖤',
    ] : [
      'hehe cute goth 🖤',
      'soft goth hoje 💜',
    ],
    stream: [
      'em live agora na Twitch 🖤 twitch.tv/pinkchyu',
      'setup roxo on, jogando Honkai 💜',
      'stream goth vibes 🎮🖤',
    ],
  };

  const pool = captions[type] || captions.selfie;
  return pool[Math.floor(Math.random() * pool.length)];
}

module.exports = {
  PHOTO_TYPES,
  generateSelfie,
  getSelfie,
  listSelfies,
  updateProfilePicture,
  handlePhotoIntent,
  getCaptionForType,
  SELFIE_DIR,
};
