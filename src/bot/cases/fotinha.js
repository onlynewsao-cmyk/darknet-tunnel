/**
 * FOTINHA — Pinkchyu Selfie System v12.2 💜 REAL PHOTOS ONLY!
 * .fotinha [tipo] — manda foto da Aura/Pinkchyu
 * .fotinha perfil — coloca foto dela como foto do bot
 * Tipos: selfie, cosplay, goth, cute, stream
 */
const fs = require('fs');
const path = require('path');

function getSelfieMod() {
  try { return require('../../aura/auraSelfie'); } catch { return null; }
}

function getRealSelfie(tipo) {
  try {
    const mod = getSelfieMod();
    if (!mod) return null;
    const dir = mod.SELFIE_DIR;
    if (!fs.existsSync(dir)) return null;
    let files = [];
    try { files = fs.readdirSync(dir).filter(f => f.startsWith('aura_' + tipo + '_') && f.endsWith('.jpg')); } catch {}
    if (files.length === 0) {
      try { files = fs.readdirSync(dir).filter(f => f.startsWith('aura_') && f.endsWith('.jpg')); } catch {}
    }
    if (files.length === 0) return null;
    const pick = files[Math.floor(Math.random() * files.length)];
    const full = path.join(dir, pick);
    if (fs.existsSync(full)) return full;
    return null;
  } catch { return null; }
}

module.exports = {
  name: 'fotinha',
  aliases: ['fotoaura', 'fotodela', 'selfie', 'fotinhadela', 'pinkchyu', 'fotinhaura'],
  desc: 'Foto da Aura/Pinkchyu — selfie goth baddie REAL 🖤',
  category: 'aura',
  async run({ sock, msg, ctx, args, text, isOwner }) {
    const selfieMod = getSelfieMod();
    if (!selfieMod) {
      await sock.sendMessage(ctx.remoteJid, { text: 'Módulo de selfies não carregou 😔' }, { quoted: msg });
      return;
    }

    const sub = (args[0] || '').toLowerCase().trim();
    const fullText = (text || '').toLowerCase();

    // .fotinha perfil — atualiza foto do bot com selfie dela
    if (['perfil', 'bot', 'pp', 'profile'].includes(sub) || fullText.includes('perfil')) {
      if (!isOwner) {
        await sock.sendMessage(ctx.remoteJid, { text: 'Só meu Dark pode mudar minha foto de perfil 🖤' }, { quoted: msg });
        return;
      }
      const tipo = ['cosplay','goth','cute','stream','selfie'].find(t => fullText.includes(t)) || 'selfie';
      let imgPath = getRealSelfie(tipo);
      let buf = null;
      if (imgPath && fs.existsSync(imgPath)) {
        buf = fs.readFileSync(imgPath);
      } else {
        // generate
        try {
          const ai = require('../ai');
          const prompts = {
            selfie: 'beautiful young woman selfie, black hair with bangs, dark makeup, purple lights, cute, high quality portrait',
            cosplay: 'young woman in anime cosplay costume, black and purple outfit, cute, high quality',
            goth: 'aesthetic portrait, black hair, dark makeup, purple room lighting, fashion style',
            cute: 'cute young woman, soft smile, black hair, heart hands, purple lights, cozy bedroom, beautiful',
            stream: 'young woman gamer streaming, purple LED lights, cute, gaming setup',
          };
          buf = await ai.generateImage(prompts[tipo] || prompts.selfie);
          if (buf && buf.length > 500) {
            try {
              const dir = selfieMod.SELFIE_DIR;
              if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
              fs.writeFileSync(path.join(dir, 'aura_' + tipo + '_' + Date.now() + '.jpg'), buf);
            } catch {}
          }
        } catch (e) {
          console.warn('[fotinha perfil gen]', e.message?.slice(0,60));
        }
      }
      if (!buf) {
        await sock.sendMessage(ctx.remoteJid, { text: 'Não consegui pegar minha fotinha agora 😔 mas tenho sim! Tenta de novo rawr' }, { quoted: msg });
        return;
      }
      const r = await selfieMod.updateProfilePicture(sock, buf);
      if (r.success) {
        await sock.sendMessage(ctx.remoteJid, { text: `Prontinho meu Dark! Coloquei minha fotinha REAL ${tipo} no perfil 🖤 rawr 💜\n\n${r.message || ''}` }, { quoted: msg });
      } else {
        await sock.sendMessage(ctx.remoteJid, { text: `Não consegui atualizar: ${r.message}` }, { quoted: msg });
      }
      return;
    }

    // .fotinha [tipo] — envia foto REAL
    const tipo = ['cosplay','goth','cute','stream','selfie'].find(t => fullText.includes(t) || sub === t) || 'selfie';
    let imgPath = getRealSelfie(tipo);

    if (imgPath && fs.existsSync(imgPath)) {
      const caption = selfieMod.getCaptionForType(tipo, isOwner);
      console.log('[fotinha] Enviando foto REAL:', imgPath);
      await sock.sendMessage(ctx.remoteJid, {
        image: fs.readFileSync(imgPath),
        caption,
      }, { quoted: msg });
      return;
    }

    // tenta gerar
    await sock.sendMessage(ctx.remoteJid, { text: `Tirando minha fotinha ${tipo} pra ti... 📸🖤 rawr` }, { quoted: msg });
    try {
      const ai = require('../ai');
      const prompts = {
        selfie: 'beautiful young woman selfie, black hair with bangs, dark makeup, purple lights, cute expression, high quality portrait',
        cosplay: 'young woman in anime cosplay costume, black and purple outfit, confident pose, high quality',
        goth: 'aesthetic portrait, black hair, dark makeup, purple room lighting, fashion style, high quality',
        cute: 'cute young woman, soft smile, black hair, heart hands, purple lights, cozy bedroom, beautiful',
        stream: 'young woman gamer streaming setup, purple LED lights, cute, pinkchyu twitch style',
      };
      const buf = await ai.generateImage(prompts[tipo] || prompts.selfie);
      if (buf && buf.length > 500) {
        // save
        try {
          const dir = selfieMod.SELFIE_DIR;
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(path.join(dir, 'aura_' + tipo + '_' + Date.now() + '.jpg'), buf);
        } catch {}
        const caption = selfieMod.getCaptionForType(tipo, isOwner);
        await sock.sendMessage(ctx.remoteJid, { image: buf, caption }, { quoted: msg });
        return;
      }
    } catch (e) {
      console.warn('[fotinha gen]', e.message?.slice(0,60));
    }

    await sock.sendMessage(ctx.remoteJid, { text: `Ainda não tenho fotinha ${tipo} salva 😔 mas já já tiro uma pra ti, ${isOwner ? 'meu Dark' : 'hehe'} 🖤\n\nUsa *.fotinha* pra selfie, *.fotinha cosplay*, *.fotinha goth*, *.fotinha cute*, *.fotinha stream*\nE *.fotinha perfil* (só Dono) pra colocar como foto do bot rawr` }, { quoted: msg });
  },
};
