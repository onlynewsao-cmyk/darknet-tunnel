/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║   DARK BOT — Image Search v1                                 ║
 * ║   PROCURAR imagens reais, não gerar com IA                   ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * O PROBLEMA:
 *   Quando se pedia "manda uma foto de um cavalo", a AURA gerava
 *   uma imagem com IA. Mas quem pede uma foto quer uma FOTO REAL,
 *   não um desenho inventado.
 *
 * FONTES (testadas ao vivo, por ordem de qualidade):
 *   1. Pinterest    — melhor variedade (108KB reais confirmados)
 *   2. Wikimedia    — fotos reais, licença livre
 *   3. Openverse    — banco aberto (Flickr e outros)
 *
 * Fora de serviço (testadas): gimage API (502), DuckDuckGo (403),
 * lorem.space (domínio morto).
 */

'use strict';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function getJson(url, ms = 12000) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': UA, Accept: 'application/json' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(to); }
}

// ── 1. Pinterest (via downloader que já existia) ────────────
async function viaPinterest(q, n) {
  const dl = require('./downloader');
  const r = await dl.pinterestSearch(q);
  return (r || []).slice(0, n).map(x => ({
    url: typeof x === 'string' ? x : x.url,
    fonte: 'Pinterest',
  })).filter(x => x.url);
}

// ── 2. Wikimedia Commons ────────────────────────────────────
async function viaWikimedia(q, n) {
  const url = 'https://commons.wikimedia.org/w/api.php?action=query&format=json' +
    `&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(q)}` +
    `&gsrlimit=${n + 2}&prop=imageinfo&iiprop=url`;
  const d = await getJson(url);
  const pages = d?.query?.pages ? Object.values(d.query.pages) : [];
  return pages
    .map(p => ({ url: p?.imageinfo?.[0]?.url, titulo: p?.title, fonte: 'Wikimedia' }))
    .filter(x => x.url && /\.(jpe?g|png|webp)$/i.test(x.url))
    .slice(0, n);
}

// ── 3. Openverse ────────────────────────────────────────────
async function viaOpenverse(q, n) {
  const d = await getJson(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&page_size=${n + 2}`);
  return (d?.results || [])
    .map(x => ({ url: x.url, titulo: x.title, fonte: 'Openverse' }))
    .filter(x => x.url)
    .slice(0, n);
}

/**
 * Procura imagens reais para um termo. Tenta as fontes em cascata.
 * @returns {Promise<Array<{url:string, titulo?:string, fonte:string}>>}
 */
async function buscarImagens(termo, quantidade = 1) {
  const q = String(termo || '').trim();
  if (!q) throw new Error('Diz o que queres que eu procure');
  const n = Math.max(1, Math.min(10, quantidade));

  const fontes = [viaPinterest, viaWikimedia, viaOpenverse];
  let ultimoErro = null;

  for (const fn of fontes) {
    try {
      const r = await fn(q, n);
      if (r?.length) return r;
    } catch (e) { ultimoErro = e; }
  }
  throw new Error(`Não encontrei imagens de "${q}"` + (ultimoErro ? '' : ''));
}

function semAura(texto) {
  return String(texto || '')
    .replace(/^(a\s+)?aura\s*[,:]?\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Detectar pedido de imagem em linguagem natural ──────────
// "manda uma foto de um cavalo" → { querImagem: true, termo: 'cavalo' }
// "Aura monstra o Cristiano" (typo) também conta.
const PEDIDO_RE = /\b(mand[ae]|envi[ae]|manda-?me|envia-?me|mostr[ae]|monstra|mosta|quero|arranj[ae]|procur[ae]|busc[ae]|acha|traz|traga|d[áa]-?me|me\s+d[êe]|me\s+d[áa]|d[êe]-?me)\b/i;
const COISA_RE = /\b(foto|fotos|imagem|imagens|figura|figuras|retrato|pic|wallpaper|papel de parede)\b/i;

// v6.54: "me de um cavalo" — sem a palavra "foto". No diálogo real o
// utilizador escreveu isto e a AURA respondeu com uma piada em vez de
// mandar a imagem. Se há verbo de pedir + substantivo concreto, é
// pedido de imagem: ninguém diz "me dá um cavalo" à espera de texto.
const PEDIR_COISA_RE = /^\s*(me\s+)?(d[êea]|manda|mande|envia|envie|traz|traga|mostra|mostre|monstra|mosta|arranja|quero)\s+(me\s+)?(um|uma|uns|umas|o|a)?\s*([a-zà-ú0-9][\w\sà-ú-]{1,40})\s*$/i;

const NAO_IMAGEM = /\b(audio|áudio|voz|ptt|beijo|abraço|abraco|ajuda|conselho|opinião|opiniao|piada|musica|música|tempo|minuto|segundo|momento|desconto|dinheiro|coins?|resposta|explicação|explicacao|link|convite|invite|grupo|chamada|call|menu|comandos|membros|admins|saldo|regras|normas|descricao|descrição|lista|ranking|horario|horário|status|prefixo|admin|admins|dono|quem|qual)\b/i;

// v6.85 — "mostra o Drake e o Kendrick" (print do Dark): verbo de
// MOSTRAR + coisa concreta É pedido de foto, mesmo sem a palavra
// "foto". O NAO_IMAGEM protege menus/regras/etc.
const MOSTRA_RE = /\b(mostra|monstra|mostre|mosta)\b/i;

// pedidos explícitos de GERAR (aí sim, IA)
const GERAR_RE = /\b(cria|criar|gera|gerar|desenha|desenhar|imagina|imaginar|inventa|faz\s+um\s+desenho|arte\s+de)\b/i;

function detectarPedidoImagem(texto) {
  const t = semAura(texto);
  if (!t || t.length > 200) return null;

  // v6.54: "Mande um áudio por favor" era lido como pedido de imagem
  // de "áudio por favor". Pedido de voz nunca é pedido de imagem.
  const semAcento = t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/\b(audio|voz|ptt|nota de voz|mensagem de voz)\b/.test(semAcento)) return null;
  if (/\b(link|convite|invite)\b/.test(semAcento)) return null;

  const querGerar = GERAR_RE.test(t) && COISA_RE.test(t);
  let querBuscar = (PEDIDO_RE.test(t) && COISA_RE.test(t)) ||
    (MOSTRA_RE.test(t) && !NAO_IMAGEM.test(t));

  // "me de um cavalo" — pedido de coisa concreta, sem dizer "foto"
  if (!querBuscar && !querGerar) {
    const m = PEDIR_COISA_RE.exec(t);
    if (m) {
      const coisa = String(m[5] || '').trim();
      // exclui pedidos que claramente não são de imagem
      const naoEhImagem = /\b(audio|áudio|voz|ptt|beijo|abraço|abraco|ajuda|conselho|opinião|opiniao|piada|musica|música|tempo|minuto|segundo|momento|desconto|dinheiro|coins?|resposta|explicação|explicacao|link|convite|invite|grupo|chamada|call)\b/i;
      if (coisa.length >= 3 && !naoEhImagem.test(coisa)) {
        return { gerar: false, termo: coisa.slice(0, 80) };
      }
    }
    return null;
  }

  // extrai o termo: tudo depois de "de/do/da/sobre" ou depois da palavra-chave
  let termo = t;
  const m = t.match(/\b(?:de|do|da|dos|das|sobre|com)\s+(.{2,80})$/i);
  if (m) {
    termo = m[1];
  } else {
    termo = t.replace(PEDIDO_RE, ' ').replace(GERAR_RE, ' ').replace(COISA_RE, ' ');
  }

  // v6.54: \b não funciona bem com acentos ('dragão' virava 'dragã'
  // porque o \b caía antes do 'o'). Usamos limites explícitos.
  termo = termo
    .replace(/(^|\s)(uma?|uns|umas|o|a|os|as|meu|minha|por favor|pf|pfv|pra mim|para mim|aí|ai|agora|aqui|aura|já|ja)(?=\s|$)/gi, ' ')
    .replace(/^(agora|aqui|aura|olha|eita)[,!\s]+/i, '')
    .replace(/[?!.,;:]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (!termo || termo.length < 2) return null;
  if (NAO_IMAGEM.test(termo)) return null;
  return { gerar: querGerar && !querBuscar, termo: termo.slice(0, 80), vago: eTermoVago(termo), nomes: nomesDoTermo(termo) };
}

// ── v6.85 — TERMOS VAGOS E MULTI-NOME ─────────────────────
// "Mande a foto deles" → "deles" não é pesquisável (no print de
// produção veio uma imagem preta "1º DELAS"). E "o Drake e o Kendrick"
// numa só pesquisa não devolve os dois. Agora: termo vago resolve-se
// pelo último termo pesquisado no chat; multi-nome pesquisa-se um a um.
const VAGO_RE = /^(dele|deles|dela|delas|dos dois|das duas|d[oa]s dois|juntos|junto|o mesmo|a mesma|esse|essa|isso|estes|estas|aquele|aquela|ambos|os dois|as duas)$/i;

function eTermoVago(termo) {
  return VAGO_RE.test(String(termo || '').trim());
}

/** "Drake e Kendrick" → ["Drake","Kendrick"] (máx. 3). */
function nomesDoTermo(termo) {
  return String(termo || '')
    .split(/\s+(?:e|&|\+|,|\/)\s+/)
    .map(s => s.replace(/^(o|a|os|as|do|da|dos|das|um|uma)\s+/i, '').trim())
    .filter(s => s.length >= 2 && !eTermoVago(s))
    .slice(0, 3);
}

// Memória por chat do último termo pesquisado com sucesso.
const _ultimoTermo = new Map();
function lembrarTermo(jid, termo) {
  if (!jid || !termo) return;
  if (_ultimoTermo.size > 300) _ultimoTermo.delete(_ultimoTermo.keys().next().value);
  _ultimoTermo.set(jid, termo);
}
function ultimoTermo(jid) { return _ultimoTermo.get(jid) || ''; }

/**
 * Resolve o termo final de pesquisa: vago → contexto (último termo +
 * nomes desta frase); multi-nome fica a cargo de quem chama.
 */
function resolverTermo({ jid = '', termo = '', texto = '' } = {}) {
  if (!eTermoVago(termo)) return { termo, nomes: nomesDoTermo(termo), resolvido: false };
  // nomes escritos NESTA mensagem — extraídos pelo detector
  // ("manda a foto do Drake e do Kendrick" → ["Drake","Kendrick"])
  let nomes = [];
  try {
    const d = detectarPedidoImagem(texto);
    nomes = (d?.nomes || []).filter(n => !eTermoVago(n));
  } catch {}
  // senão, o último termo pesquisado neste chat ("deles" → "Drake")
  const anterior = ultimoTermo(jid);
  if (!nomes.length && anterior) nomes = [anterior];
  return { termo: nomes[0] || termo, nomes, resolvido: true };
}

/**
 * Quando o modelo FINGE que enviou ("_envia uma foto do Messi_"),
 * extrai a acção real para o bot executar.
 */
function extrairAcaoFalsa(texto) {
  const t = String(texto || '');
  const foto = t.match(/_?\s*(?:envia|manda|mostra|envio|mando)\s+(?:uma?\s+)?(?:foto|imagem|figura)\s+(?:d[oea]|do|da|de)\s+([^_.*\n]{2,80})\s*_?/i)
    || t.match(/\[IMAGE:([^\]]+)\]/i);
  if (foto) {
    const termo = String(foto[1] || '').replace(/[._*]+$/g, '').trim();
    if (termo.length >= 2) return { tipo: 'imagem', termo: termo.slice(0, 80) };
  }
  const audio = t.match(/_?\s*(?:envia|manda|grava|envio)\s+(?:um\s+)?(?:áudio|audio|voz|ptt)\b([^_\n]{0,200})/i)
    || t.match(/\(ÁUDIO\)\s*([\s\S]{2,300})/i)
    || t.match(/\(AUDIO\)\s*([\s\S]{2,300})/i);
  if (audio) {
    const fala = String(audio[1] || '').replace(/[_*]+/g, ' ').trim();
    return { tipo: 'audio', termo: fala.slice(0, 400) };
  }
  const fig = t.match(/[*_]?\s*(?:envia|manda|envio)\s+(?:um\s+)?sticker\s+(?:de|d[oea]|com)?\s*([^_*\n]{2,80})/i)
    || t.match(/\[STICKER:([^\]]+)\]/i);
  if (fig) {
    const termo = String(fig[1] || '').replace(/[_*"“”]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (termo.length >= 2) return { tipo: 'sticker', termo: termo.slice(0, 80) };
  }
  return null;
}

module.exports = {
  buscarImagens,
  detectarPedidoImagem,
  extrairAcaoFalsa,
  semAura,
  viaPinterest,
  viaWikimedia,
  viaOpenverse,
  eTermoVago,
  nomesDoTermo,
  lembrarTermo,
  ultimoTermo,
  resolverTermo,
};
