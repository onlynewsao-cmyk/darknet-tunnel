/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║   DARK BOT v8.6 — RPG CAROUSEL 🎠                             ║
 * ║   Carrossel interactivo com FOTOS para escolhas do mundo:     ║
 * ║   raças, classes, biomas (!viajar)… Cada carta leva imagem    ║
 * ║   gerada por IA (pollinations, com cache) + botões.           ║
 * ║                                                               ║
 * ║   Soberano mas NUNCA mandatário: quem chama envia o corpo     ║
 * ║   numerado/plano-B e cai para a lista single_select ou para   ║
 * ║   o texto se enviarCarrossel() devolver false.                ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */
'use strict';

const images = require('./images');

/** Cache de imagens geradas: cacheKey → Buffer (vive na sessão do bot). */
const _imgCache = new Map();

/**
 * Gera (ou devolve do cache) a imagem da carta.
 * 4 KB mínimos — resposta truncada/HTML não é imagem e rebentava o upload.
 */
// prazo por imagem: 3.5s (paralelo entre cartas) — acima disso o bot
// parecia pendurado e os arneses RPG (8s por case) marcavam timeout.
async function _imagem(cacheKey, prompt, w, h, prazoMs = 3500) {
  if (cacheKey && _imgCache.has(cacheKey)) return _imgCache.get(cacheKey);
  try {
    const buf = await Promise.race([
      images.generateFromPrompt(prompt, w, h),
      new Promise((_, rej) => setTimeout(() => rej(new Error('prazo')), prazoMs)),
    ]);
    if (!buf || buf.length < 4000) return null;
    if (cacheKey) _imgCache.set(cacheKey, buf);
    return buf;
  } catch { return null; }
}

/**
 * Envia um carrossel interactivo.
 * @param opts.corpo   texto acima das cartas (leva SEMPRE o plano-B numerado)
 * @param opts.rodape  rodapé da mensagem
 * @param opts.cards   [{ corpo, rodape, botoes[], promptImg|imagem, cacheKey, imgW, imgH }]
 *        botões: { texto, id } → quick_reply  |  { texto, url } → cta_url
 * @returns true se o carrossel saiu (mesmo com cartas sem imagem), false p/ fallback
 */
async function enviarCarrossel(sock, msg, ctx, { corpo, rodape, cards, imgW = 768, imgH = 512 }) {
  if (!sock?.relayMessage || !Array.isArray(cards) || !cards.length) return false;
  try {
    const { generateWAMessageFromContent, prepareWAMessageMedia, proto } = require('@systemzero/baileys');

    // Os clientes recentes são exigentes: objectos JS crus até podem renderizar
    // as cartas, mas o quick_reply pode chegar sem id (e a raça nunca avança).
    // Constrói cada camada com os protobufs oficiais, como no Story Mode.
    const cartas = await Promise.all(cards.map(async (c) => {
      // imagem: gerada por IA (c/cache), com prazo — sem imagem a carta
      // continua a navegar, só sem capa.
      let imageMessage = null;
      const buf = c.imagem || (c.promptImg
        ? await _imagem(c.cacheKey || c.promptImg, c.promptImg, c.imgW || imgW, c.imgH || imgH, c.prazoMs)
        : null);
      if (buf && sock.waUploadToServer) {
        try {
          const media = await prepareWAMessageMedia({ image: buf }, { upload: sock.waUploadToServer });
          imageMessage = media?.imageMessage || null;
        } catch {}
      }

      const botoes = (c.botoes || [])
        .filter((b) => b && (b.url || b.id))
        .map((b) => b.url
          ? { name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: String(b.texto || 'Abrir'), url: b.url, merchant_url: b.url }) }
          : { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: String(b.texto || 'Escolher'), id: String(b.id) }) });

      const header = proto.Message.InteractiveMessage.Header.fromObject(
        imageMessage
          ? { title: c.titulo || '', hasMediaAttachment: true, imageMessage }
          : { title: c.titulo || '', hasMediaAttachment: false }
      );
      return proto.Message.InteractiveMessage.CarouselCard.fromObject({
        header,
        body: proto.Message.InteractiveMessage.Body.fromObject({ text: String(c.corpo || '') }),
        footer: proto.Message.InteractiveMessage.Footer.fromObject({ text: String(c.rodape || '') }),
        nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({ buttons: botoes }),
      });
    }));

    const msgObj = generateWAMessageFromContent(ctx.remoteJid, {
      interactiveMessage: proto.Message.InteractiveMessage.fromObject({
        body: proto.Message.InteractiveMessage.Body.fromObject({ text: String(corpo || '') }),
        footer: proto.Message.InteractiveMessage.Footer.fromObject({ text: String(rodape || '') }),
        carouselMessage: { cards: cartas },
      }),
    }, { userJid: sock.user?.id, quoted: msg });

    // o selo biz/native_flow que os clientes novos exigem para RENDERIZAR
    // interactivos (sem isto a mensagem aparece "a carregar" ou nem aparece;
    // mesma forma do dynSub/createFlow, provada em produção)
    await sock.relayMessage(ctx.remoteJid, msgObj.message, {
      messageId: msgObj.key.id,
      additionalNodes: [{ tag: 'biz', attrs: {}, content: [{
        tag: 'interactive', attrs: { type: 'native_flow', v: '1' },
        content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }],
      }] }],
    });
    return true;
  } catch (e) {
    console.warn('[RPG Carrossel]', e.message?.slice(0, 60));
    return false;
  }
}

module.exports = { enviarCarrossel, _imagem, _imgCache };
