/**
 * FOTINHA — Pinkchyu Selfie System v12.0 💜
 * .fotinha [tipo] — manda foto da Aura/Pinkchyu
 * .fotinha perfil — coloca foto dela como foto do bot
 * Tipos: selfie, cosplay, goth, cute, stream
 */
const fs = require('fs');
const path = require('path');

function getSelfieMod() {
  try { return require('../../aura/auraSelfie'); } catch { return null; }
}

module.exports = {
  name: 'fotinha',
  aliases: ['fotoaura', 'fotodela', 'selfie', 'fotinhadela', 'pinkchyu', 'fotinhaura'],
  desc: 'Foto da Aura/Pinkchyu — selfie goth baddie 🖤',
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
      let imgPath = null;
      try { imgPath = selfieMod.getSelfie(tipo); } catch {}
      let buf = null;
      if (imgPath && fs.existsSync(imgPath)) {
        buf = fs.readFileSync(imgPath);
      } else {
        // generate
        try {
          const ai = require('../ai');
          const prompts = {
            selfie: 'goth girl selfie, pink hair, dark makeup, cute, 23yo latina, aesthetic, instagram style, high quality',
            cosplay: 'goth girl cosplay Kafka Honkai Star Rail, purple hair, goth outfit, cute, high quality',
            goth: 'goth baddie girl, black outfit, chains, dark makeup, pink hair, cute goth aesthetic',
            cute: 'cute goth girl selfie, kawaii, pinkchyu style, 23yo, aesthetic',
            stream: 'goth gamer girl streaming setup, purple lights, cute, pinkchyu twitch style',
          };
          buf = await ai.generateImage(prompts[tipo] || prompts.selfie);
        } catch (e) {
          console.warn('[fotinha perfil gen]', e.message?.slice(0,60));
        }
      }
      if (!buf) {
        await sock.sendMessage(ctx.remoteJid, { text: 'Não consegui pegar minha fotinha agora 😔' }, { quoted: msg });
        return;
      }
      const r = await selfieMod.updateProfilePicture(sock, buf);
      if (r.success) {
        await sock.sendMessage(ctx.remoteJid, { text: `Prontinho meu Dark! Coloquei minha fotinha ${tipo} no perfil 🖤 rawr\n\n${r.message || ''}` }, { quoted: msg });
      } else {
        await sock.sendMessage(ctx.remoteJid, { text: `Não consegui atualizar: ${r.message}` }, { quoted: msg });
      }
      return;
    }

    // .fotinha [tipo] — envia foto
    const tipo = ['cosplay','goth','cute','stream','selfie'].find(t => fullText.includes(t) || sub === t) || 'selfie';
    let imgPath = null;
    try { imgPath = selfieMod.getSelfie(tipo); } catch {}

    if (imgPath && fs.existsSync(imgPath)) {
      const caption = selfieMod.getCaptionForType(tipo, isOwner);
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
        selfie: 'goth girl selfie, pink hair, dark makeup, cute, 23yo latina, aesthetic, instagram style, high quality, pinkchyu',
        cosplay: 'goth girl cosplay Kafka Honkai Star Rail or Lucy Edgerunners or Makima Chainsaw Man, purple hair, goth outfit, cute, high quality, cosplay',
        goth: 'goth baddie girl, black outfit, chains, dark makeup, pink hair, cute goth aesthetic, instagram',
        cute: 'cute goth girl selfie, kawaii, pinkchyu style, 23yo, aesthetic, soft lighting',
        stream: 'goth gamer girl streaming setup, purple LED lights, cute, pinkchyu twitch partner style, gaming',
      };
      const buf = await ai.generateImage(prompts[tipo] || prompts.selfie);
      if (buf && buf.length > 500) {
        // save
        try {
          const dir = path.join(__dirname, '..', '..', '..', 'assets', 'aura_selfies');
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(path.join(dir, `${tipo}_${Date.now()}.jpg`), buf);
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
