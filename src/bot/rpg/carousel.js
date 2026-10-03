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
/** Cache de capas Pinterest: cacheKey → URL de imagem (vive na sessão do bot). */
const _pinCache = new Map();
const CACHE_MAX = 120; // impede crescimento infinito numa sessão longa
const PINTEREST_SEARCH_ENDPOINT = 'https://api.siputzx.my.id/api/s/pinterest?query=';

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
    if (cacheKey) {
      if (_imgCache.size >= CACHE_MAX) _imgCache.clear();
      _imgCache.set(cacheKey, buf);
    }
    return buf;
  } catch { return null; }
}

/**
 * Obtém uma capa do mesmo endpoint usado pelo comando !pinterest. A URL é
 * entregue directamente ao Baileys, como no carrossel Pinterest, por isso a
 * carta de raça não depende de a IA externa responder a tempo.
 */
async function _imagemPinterest(cacheKey, query, prazoMs = 4000) {
  if (!query) return null;
  if (cacheKey && _pinCache.has(cacheKey)) return _pinCache.get(cacheKey);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), prazoMs);
  try {
    const response = await fetch(PINTEREST_SEARCH_ENDPOINT + encodeURIComponent(query), {
      signal: controller.signal,
      headers: { 'User-Agent': 'DarkNet-RPG/1.0' },
    });
    if (!response.ok) return null;
    const data = await response.json();
    const results = data?.data || data?.result || data?.results || [];
    const first = Array.isArray(results) ? results.find((item) => {
      const url = typeof item === 'string' ? item : (item?.image_url || item?.image || item?.url || item?.src);
      return /^https?:\/\//i.test(String(url || ''));
    }) : null;
    const url = typeof first === 'string' ? first : (first?.image_url || first?.image || first?.url || first?.src);
    if (!/^https?:\/\//i.test(String(url || ''))) return null;
    if (cacheKey) {
      if (_pinCache.size >= CACHE_MAX) _pinCache.clear();
      _pinCache.set(cacheKey, url);
    }
    return url;
  } catch { return null; }
  finally { clearTimeout(timer); }
}

/**
 * Envia um carrossel interactivo.
 * @param opts.corpo   texto acima das cartas (leva SEMPRE o plano-B numerado)
 * @param opts.rodape  rodapé da mensagem
 * @param opts.cards   [{ titulo, corpo, rodape, botoes[], pinterestQuery|promptImg|imagem, cacheKey, imgW, imgH }]
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
      // Para raças/classes, a capa Pinterest segue exactamente o mesmo
      // caminho de upload do comando !pinterest. A IA permanece como fallback.
      let imageMessage = null;
      const pinterestUrl = c.imagemUrl || (c.pinterestQuery
        ? await _imagemPinterest('pin_' + (c.cacheKey || c.pinterestQuery), c.pinterestQuery, c.prazoMs)
        : null);
      const buf = pinterestUrl ? null : (c.imagem || (c.promptImg
        ? await _imagem(c.cacheKey || c.promptImg, c.promptImg, c.imgW || imgW, c.imgH || imgH, c.prazoMs)
        : null));
      if ((pinterestUrl || buf) && sock.waUploadToServer) {
        try {
          const media = await prepareWAMessageMedia(
            pinterestUrl ? { image: { url: pinterestUrl } } : { image: buf },
            { upload: sock.waUploadToServer }
          );
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

module.exports = { enviarCarrossel, _imagem, _imagemPinterest, _imgCache, _pinCache };
