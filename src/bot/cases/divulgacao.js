/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║  DARK BOT v9.8 — CLIENTE ONLINE ☣️ DIVULGAÇÃO (DARKTOXIC)     ║
 * ║                                                               ║
 * ║   !cliente            — o painel-tudo (lista de seleção ☣️)   ║
 * ║   GRUPOS              — !divulgar add/addall/list/del/delall  ║
 * ║   VELOCIDADE          — !delay (painel) / !delay 0..5000 /    ║
 * ║                         !delayultrarapido → ⚡ SUPER (v9.15)   ║
 * ║   DISPARO (4 passos)  — !divulgar / !divulgarrapido / media   ║
 * ║                         !divulgarteste / !divulgarstop /      ║
 * ║                         !divulgarhistorico                    ║
 * ║   SEU BOT / PLANO     — !conectarbot !meubot !desconectarbot  ║
 * ║                         !aluguel                              ║
 * ║                                                               ║
 * ║   VISIBILIDADE: visível = @marcações à vista; invisível =     ║
 * ║   menção SILENCIOSA (notifica todos sem tags visíveis — o     ║
 * ║   ADM não vê a lista de mencionados, só os normais zumbem).   ║
 * ║   APENAS DONO. Estado isolado POR DONO (botConfigCache).      ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */
'use strict';

const config = require('../../config');

// ── estado isolado por dono ──────────────────────────────────
const _STOP = new Set();           // owner → true quando pede dstop
const _SESS = new Map();           // owner → {fase, texto, media}
const _ULTIMOS = new Map();        // owner → { vis, montar }  — p/ divulgarrepetir
const _AGENDADOS = new Map();      // owner → timer (divulgaragenda)
const _FLUXO = new Map();          // `${jid}|${num}` → assistente 4 passos
const TTL_FLUXO = 15 * 60 * 1000;

const _kFluxo = (ctx) => `${ctx.remoteJid}|${_num(ctx.senderNumber)}`;

// ── v9.14 CANAL SECRETO — o ADM não vê NADA ──────────────────
// Tudo o que é da divulgação (assistente, painéis, botões fixos,
// relatórios, hubs) saído DE UM GRUPO vai para o PV do dono. O botão
// de divulgar "parecia morto" porque os ADM o viam carregar — agora
// literalmente não aparece lá: só no privado do dono.
function _pv(ctx) { return `${_num(ctx.senderNumber || ctx.senderJid)}@s.whatsapp.net`; }
function _alvo(ctx) { return ctx.isGroup ? _pv(ctx) : ctx.remoteJid; }

function _num(n) { return String(n || '').replace(/\D/g, ''); }
async function _get(bcc, k) { return bcc.get(`divulg_${k}`, null); }
async function _set(bcc, k, v) { return bcc.set(`divulg_${k}`, v); }

// ── DARKTOXIC (mesmo ADN do cartão de prefixo) ───────────────
// v9.18 🕷️ TEMAS DO CLIENTE — a moldura dos painéis do dono (darktoxic é
// sempre a base da casa; ARANHA é a variante web). Cache por dono +
// _TEMA_ATUAL por invocação (o wrapper do registerCase trata do carregamento).
const TEMAS = {
  darktoxic: {
    selo: '   ☠️ *DARKTOXIC* ☠️',
    top: '☣️◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢☣️',
    fim: '☣️◤◢◤◢◤◢◤◢◤◢◤◢◤◢◢☣️',
    marco: (t) => `🕸️〘 ${t} 〙🕸️`,
  },
  aranha: {
    selo: '   🕷️ *WEB TOXICA* 🕸️',
    top: '🕸️╔══»»»»»»»══╗🕷️',
    fim: '🕷️╚══«««««««══╝🕸️',
    marco: (t) => `🕸️《 ${t} 》🕷️`,
  },
};
const _TEMA_CACHE = new Map(); // own → nome do tema (gravado no BotConfig)
let _TEMA_ATUAL = 'darktoxic';

function _tema(own) { return _TEMA_CACHE.get(String(own)) || 'darktoxic'; }

function _dtox(titulo, linhas, rodape = '') {
  const T = TEMAS[_TEMA_ATUAL] || TEMAS.darktoxic;
  const corpo = (linhas || []).map(l => `▸ ${l}`).join('\n');
  return [
    T.top,
    T.selo,
    T.marco(titulo),
    '',
    corpo,
    rodape ? '\n' + rodape : '',
    T.fim,
  ].join('\n').replace(/\n\n\n+/g, '\n\n');
}

// ── relay com o selo biz/native_flow (fantasma = nunca mais) ─
async function _relayBiz(sock, jid, m, extra = {}) {
  return sock.relayMessage(jid, m.message, {
    messageId: m.key.id,
    additionalNodes: [{ tag: 'biz', attrs: {}, content: [{
      tag: 'interactive', attrs: { type: 'native_flow', v: '1' },
      content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }],
    }] }],
    ...extra,
  });
}

/** Lista de seleção (single_select) darktoxic. */
async function _lista(sock, msg, ctx, { titulo, corpo, seccoes, rodape }) {
  const { generateWAMessageFromContent, proto } = require('@systemzero/baileys');
  const m = generateWAMessageFromContent(_alvo(ctx), {
    interactiveMessage: proto.Message.InteractiveMessage.fromObject({
      body: { text: corpo },
      footer: { text: rodape || `☣️ ${config.bot.name} · DARKTOXIC` },
      header: { title: '', hasMediaAttachment: false },
      nativeFlowMessage: {
        buttons: [{ name: 'single_select', buttonParamsJson: JSON.stringify({ title: titulo, sections: seccoes }) }],
      },
    }),
  }, { userJid: sock.user?.id, quoted: msg });
  return _relayBiz(sock, _alvo(ctx), m);
}

const sleep = (ms) => new Promise(r => setTimeout(r, Math.max(1, ms)));

/**
 * Corpo por modo:
 *  · visível  → banner ☣️ + texto + hidetag (ADM vê — é propósito);
 *  · invisível → texto CRU com ruído único (bypass, zero beacon);
 *  · sem      → texto directo.
 */
/**
 * v9.15 — GIRO (inspirado nos bots de divulgação pagos que «variam o
 * texto para não repetir»): se o dono guardou cópias com `!giro`, cada
 * envio da onda sai com a CÓPIA SEGUINTE do carrossel — nunca duas
 * ondas byte-a-byte iguais, nem com o mesmo arranque.
 */
const _GIRO_IDX = new Map(); // own → próximo índice
async function _corpoDesp(texto, vis, tag, own = '') {
  let t = String(texto || '').slice(0, 4000);
  if (own) {
    try {
      const bcc = require('../botConfigCache');
      const giro = await _get(bcc, `giro_${own}`);
      if (Array.isArray(giro) && giro.length) {
        const i = (_GIRO_IDX.get(own) || 0) % giro.length;
        _GIRO_IDX.set(own, i + 1);
        t = String(giro[i] || t).slice(0, 4000);
      }
    } catch {}
  }
  if (vis === 'visivel') return `☣️ *DIVULGAÇÃO* ☣️\n\n${_ruido(t)}${tag || ''}`;
  if (vis === 'invisivel') return _ruido(t);
  return t;
}

/** Metadados do grupo (para menções). Silencioso em erro. */
async function _meta(sock, jid) {
  try { return await sock.groupMetadata(jid); } catch { return null; }
}

/** Separa [admins, membros] de uma lista de participantes. */
function _separaAdm(participants) {
  const admins = [], membros = [];
  for (const p of participants || []) (p.admin ? admins : membros).push(p.id);
  return { admins, membros };
}

/**
 * BYPASS anti-detecção (modo invisível):
 * 1) cada mensagem sai TEXTUALMENTE ÚNICA — insere ruído invisível
 *    (zero-width) noutra posição por grupo → detective de cópia
 *    (hash de texto idêntico em N grupos) morre de fome;
 * 2) nada de banners — sai o CRU do utilizador (o "☣️ DIVULGAÇÃO"
 *    é ele próprio um beacon para anti-divulgação).
 */
function _ruido(texto) {
  const zero = ['\u200b', '\u200c', '\u2060', '\u180e'];
  const alvo = String(texto || '');
  if (alvo.length < 3) return alvo + zero[0];
  const n = 1 + Math.floor(Math.random() * 2);          // 1–2 pontos de ruído
  let out = alvo;
  for (let i = 0; i < n; i++) {
    const pos = 1 + Math.floor(Math.random() * (out.length - 1));
    out = out.slice(0, pos) + zero[Math.floor(Math.random() * zero.length)] + out.slice(pos);
  }
  return out;
}

/** jitter: o relógio metronómico é o 2º sinal de bot — desliza ±25% */

// ── RITMO ANTI-BAN (v9.13) ───────────────────────────────────────
// O que frita uma conta no WhatsApp é assinatura de broadcast:
//  · mensagens promo quase coladas umas às outras (1..300ms) em N grupos;
//  · exactamente o mesmo intervalo entre elas (metrónomo);
//  · texto promo idêntico em dezenas de grupos (hash duplicado).
// v9.15 — SUPER MODO (pedido do dono): TODO o ritmo "humano" de
// proteção (piso de 950ms, pausas de 28–45s, esperas de 65–130s entre
// passes, jitter) foi REMOVIDO do motor. O bot dispara a fundo; o único
// travão é o `delay` que o dono escolher em `!delay` (omissão: 0).
// O ruído zero-width FICA — não é teatro: é o que faz cada cópia sair
// com texto byte-a-byte único (bypass de dedupe/detete dos bots-alvo).

async function _historico(sock, bcc, own, entrada) {
  const hist = (await _get(bcc, `hist_${own}`) || []).concat(entrada).slice(-20);
  await _set(bcc, `hist_${own}`, hist).catch(() => {});
}

// ════════════════════════════════════════════════════════════
// MOTOR DO DISPARO
// ════════════════════════════════════════════════════════════
/**
 * Envia para todos os grupos registados.
 * vis: 'visivel' (tags à vista) · 'invisivel' (menção silenciosa) · 'sem'
 * montar: (grupo) => {content, precisaMencoes}
 */
async function _disparar(sock, msg, ctx, { vis, montar, vezes = 1 }) {
  const bcc = require('../botConfigCache');
  const own = _num(ctx.senderNumber);
  const grupos = (await _get(bcc, `grupos_${own}`)) || [];
  const delay = Number(await _get(bcc, `delay_${own}`)) || 0;
  if (!grupos.length) return { ok: false, motivo: 'sem-grupos' };

  _STOP.delete(own);
  let feitos = 0, erros = 0;
  const falhas = [];
  // v9.15 📊 MÉTRICAS POR GRUPO (padrão dos bots de divulgação pagos):
  // 3 falhas seguidas = grupo morto (saiu/apagou-me) → EXCLUÍDO da onda
  // automaticamente; `!divulgar metricas` mostra tudo, `reativar N` resuscita.
  const stats = Object.assign({}, (await _get(bcc, `stats_${own}`)) || {});
  let mortos = [];
  const vivos = grupos.filter((g) => {
    const st0 = stats[g.jid] || {};
    const morto = (st0.consec || 0) >= 3;
    if (morto) mortos.push(g);
    return !morto;
  });
  const ondaGrupos = vivos;
  if (mortos.length) await _set(bcc, `grupos_${own}`, vivos);
  // 🔀 ordem baralhada em cada passe — o mesmo grupo raramente recebe 2.º
  const ordem = [...ondaGrupos];
  for (let i = ordem.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ordem[i], ordem[j]] = [ordem[j], ordem[i]];
  }
  // v9.15 SUPER: sem piso, sem pausa, sem jitter — só o delay do dono.
  const base = Math.max(0, delay);
  for (let vez = 0; vez < Math.max(1, vezes); vez++) {
    if (_STOP.has(own)) break;
    for (let i = 0; i < ordem.length; i++) {
    if (_STOP.has(own)) break;
    const g = ordem[i];
    try {
      let mencoes = [], textoTag = '';
      if (vis !== 'sem') {
        const meta = await _meta(sock, g.jid);
        const { admins, membros } = _separaAdm(meta?.participants || []);
        if (vis === 'visivel') {
          // VISÍVEL: ADM vê tudo — hidetag com TODAS as tags à vista.
          mencoes = [...admins, ...membros];
          if (mencoes.length) {
            textoTag = '\n\n' + mencoes.slice(0, 200).map(pid => `@${pid.split('@')[0]}`).join(' ');
          }
        } else if (vis === 'invisivel') {
          // INVISÍVEL: menciona TODOS MENOS OS ADM — eles nem notificação
          // recebem, hidetag limpa (zero @ no texto), nada lhes salta à vista.
          mencoes = membros;
          // textoTag fica vazio de propósito.
        }
      }
      const { content } = await montar(g, textoTag, mencoes, vez);
      await sock.sendMessage(g.jid, content);
      feitos++;
      { const st0 = stats[g.jid] || (stats[g.jid] = { ok: 0, fail: 0, consec: 0 });
        st0.ok++; st0.consec = 0; st0.nome = g.nome || st0.nome || ''; st0.last = new Date().toISOString(); }
    } catch (e) {
      erros++; falhas.push(`${g.nome || g.jid}: ${String(e.message).slice(0, 40)}`);
      const st0 = stats[g.jid] || (stats[g.jid] = { ok: 0, fail: 0, consec: 0 });
      st0.fail++; st0.consec++; st0.nome = g.nome || st0.nome || ''; st0.last = new Date().toISOString();
    }
    if (i + 1 < ordem.length && base > 0) await sleep(base);
    }
  }
  try { await _set(bcc, `stats_${own}`, stats); } catch {}
  const parado = _STOP.has(own);
  _STOP.delete(own);
  await _historico(sock, bcc, own, {
    quando: new Date().toISOString(), vis, delay, vezes,
    bypass: vis === 'invisivel',
    total: grupos.length * Math.max(1, vezes), grupos: grupos.length, feitos, erros, parado,
  });
  return { ok: true, total: grupos.length * Math.max(1, vezes), feitos, erros, parado, falhas, delay, vezes, mortos: mortos.map((m) => m.nome || m.jid) };
}

function _resumo(r, p) {
  if (r.motivo === 'sem-grupos') {
    return _dtox('D I V U L G A R', [
      '⚠️ *Sem grupos registados para o disparo.*',
      'PASSO 1: adiciona primeiro:',
      `   \`${p}divulgar add\` (dentro do grupo) ou \`${p}divulgar addall\``,
      `Lista: \`${p}divulgar list\``,
    ]);
  }
  return _dtox('R E L A T Ó R I O  D A  O N D A', [
    `📦 Alvos: *${r.total}*${(r.vezes || 1) > 1 ? ` (🔁 vez${r.vezes}x)` : ''}`,
    `✅ Enviado: *${r.feitos}*`,
    `❌ Falhou: *${r.erros}*${r.falhas?.length ? ` (${r.falhas[0]})` : ''}`,
    `⏱️ Delay: ${r.delay ? `*${r.delay}ms*` : '*0ms ⚡ SUPER*'}${r.parado ? ' · 🛑 PARADO por ti' : ''}`,
    r.parado ? `Retomar: volta a lançar !divulgar` : `Histórico: \`${p}divulgarhistorico\``,
    (r.mortos && r.mortos.length) ? `⚰️ ${r.mortos.length} morto(s) EXCLUÍDO automaticamente (3❌): ${r.mortos.slice(0,2).join(', ')}${r.mortos.length>2?'…':''} — \`${p}divulgar metricas\`` : '',
  ]);
}

// ════════════════════════════════════════════════════════════
// PAINEL PRINCIPAL (!cliente) — secção a secção, darktoxic
// ════════════════════════════════════════════════════════════
async function _painelCliente(sock, msg, ctx) {
  const bcc = require('../botConfigCache');
  const p = ctx.prefix || config.bot.prefix || '!';
  const own = _num(ctx.senderNumber);
  const grupos = (await _get(bcc, `grupos_${own}`)) || [];
  const delay = Number(await _get(bcc, `delay_${own}`)) || 0;
  // v9.15 SUPER: sem teatro nem travões de fábrica — velocidade é
  // escolha do dono, o motor obedece na hora.
  const delayNome = { 0: '⚡ SUPER (sem pausas)', 1: '🚀 ULTRA', 70: '🔥 RÁPIDO', 300: '🐢 MÉDIO', 1200: '🛡️ CONSERVADOR', 2000: '🐌 LENTO', 5000: '🐌🐌 MUITO LENTO' }[delay] || `🔧 ${delay}ms`;

  const corpo = _dtox('C L I E N T E  -  O N L I N E', [
    '📦 *DIVULGAÇÃO — 4 PASSOS*',
    `📌 Grupos guardados: *${grupos.length}* (só teus, isolado)`,
    `⏱️ Velocidade: *${delayNome}* (${delay}ms)`,
    '',
    '1️⃣ Adiciona grupos → 📦',
    '2️⃣ Escolhe a velocidade → ⏱️',
    '3️⃣ Escolhe 👁️ visível / 🕶️ invisível',
    '4️⃣ Toca em 🚀 DIVULGAR ou responde à tua mídia',
    '',
    '🎨 TABULEIRO VIVO: `!letras` · `!nick` · `!deco` · `!caixa` · `!simbolos`',
    `✨ CLIENTE ATIVO — ${own}`,
    `\`${p}delay\` · \`${p}divulgar list\` · \`${p}divulgarhistorico\``,
  ]);

  const R = (label, desc, id) => ({ title: label.slice(0, 24), description: desc.slice(0, 70), id });
  const seccoes = [
    { title: '📦 GRUPOS', rows: [
      R('add grupo atual', 'regista ESTE grupo na tua onda', `${p}divulgar add`),
      R('addall automático', 'regista TODOS os grupos onde estou', `${p}divulgar addall`),
      R('listar grupos', 'vê a tua onda, numerada', `${p}divulgar list`),
      R('apagar todos', 'limpa a lista (del N tira 1)', `${p}divulgar delall`),
    ] },
    { title: '⏱️ VELOCIDADE / DELAY', rows: [
      R('painel do delay', 'presets com 🟢 no activo', `${p}delay`),
      R('super 0ms', '⚡ omissão — sem pausas', `${p}delay super`),
      R('ultra 1ms', '🚀 sem respirar', `${p}delay ultra`),
      R('conservador 1200ms', '🛡️ ainda rápido', `${p}delay antiban`),
    ] },
    { title: '🌀 GIRO · AGENDA · MÉTRICAS', rows: [
      R('carrossel de cópias', 'texto varia a cada envio — anti-repetição', `${p}giro a || b || c`),
      R('estado do giro', 'ver as cópias gravadas', `${p}giro`),
      R('agenda pontual', '⏰ HH:MM, minutos ou diário — sobrevive a restart', `${p}divulgaragenda 21:30 texto`),
      R('ver agenda', 'ondas programadas', `${p}divulgaragendas`),
      R('métricas por grupo', '📊 ✅/❌ + ⚰️ excluídos automaticamente', `${p}divulgar metricas`),
      R('reativar morto', 'resuscita grupo excluído por 3 falhas', `${p}divulgar reativar 1`),
      R('enquete / votação', '📊 enquete real ou votação com botões', `${p}enquete`),
      R('canal reage', '🤡 reacções em massa nos posts (dono)', `${p}canalreagir 🤡`),
      R('cartão de links', '📇 botões de link «iguais aos do canal», 1–3, foto opcional', `${p}linkcartao`),
      R('onda em cartão', '📇🚀 cartão de links para TODOS os grupos (visível/invisível)', `${p}divulgarcartao`),
      R('lista de comandos', '⚡ nomes curtos da onda — !onda, !parar, !cartao…', `${p}comandosonda`),
    ] },
    { title: '🎨 ESTILO & LETRAS', rows: [
      R('tema do cliente', '🕷️ aranha ou ☣️ clássico — moldura dos painéis', `${p}clientetema`),
      R('as 22 fontes', 'letras E números — negrito, 𝓼𝓬𝓻𝓲𝓹𝓽, 🄱🄰🄽🄳…', `${p}letras dark`),
      R('6 tamanhos', '𝐆𝐑𝐀𝐍𝐃𝐄 ↔ ₘᵢᴄᵣₒ — 𝐝𝐢𝐠í𝐭𝐨𝐬 incluídos', `${p}tamanho dark 2026`),
      R('nick único', '10 nicks do tabuleiro, sem repetir', `${p}nick meu nome`),
      R('decorar nome', 'volta kawai/egípcia, nome limpo', `${p}deco nome`),
      R('caixa-moldura', 'texto emoldurado p/ bio e status', `${p}caixa nome`),
      R('baús de símbolos', '𓂀egípcios, 𒀭sumer, ➳setas, ⠿braille', `${p}simbolos`),
    ] },
    { title: '🎭 TEMAS', rows: [
      R('temas do bot', '!change + botões 🔁 CHANGE / ✖ NÃO', `${p}change`),
      R('tema do cartão', 'prefixo com 8 capas', `${p}prefixotema`),
    ] },
    { title: '🚀 ENVIAR — 4 PASSOS', rows: [
      R('divulgar texto', 'passo a passo interactivo', `${p}divulgar`),
      R('visivel rápido', '⚡ texto+tags à vista em 1 toque', `${p}divulgarrapido visivel`),
      R('invisível rápido', '🕶️ menção escondida — ADM não vê', `${p}divulgarrapido invisivel`),
      R('teste', 'manda 1x de volta P/ TI validar', `${p}divulgarteste`),
      R('repetir onda', '🔁 a última onda sai outra vez', `${p}divulgarrepetir`),
      R('agendar onda', '⏰ dispara daqui a N minutos', `${p}divulgaragenda`),
      R('stats', '📈 prova dos números — alcance e entregue', `${p}divulgarstats`),
      R('histórico', '📊 últimas 20 ondas', `${p}divulgarhistorico`),
      R('parar envio', '🛑 cancela a onda em curso (+agenda)', `${p}divulgarstop`),
    ] },
    { title: '🤖 SEU BOT · 💰 PLANO', rows: [
      R('conectar número', 'regista o teu bot cliente', `${p}conectarbot`),
      R('meu bot', '📊 estado & stats da tua onda', `${p}meubot`),
      R('desconectar', '🔌 desliga o teu bot', `${p}desconectarbot`),
      R('planos', '💵 tabela de aluguer', `${p}aluguel`),
    ] },
  ];

  // v9.9: HUB EM CARROSSEL — 4 cartões com capa darktoxic (IA, cache)
  // e botões vivos; se o carrossel não sair, cai para a lista (abaixo).
  let carro = false;
  if (sock.waUploadToServer) {
    try {
      carro = await require('../rpg/carousel').enviarCarrossel(sock, msg, ctx, {
        corpo,
        rodape: `☣️ ${config.bot.name} · cliente ${own.slice(-4)} · toca nas cartas`,
        cards: [
          { corpo: `📦 *GRUPOS DA ONDA*\n${grupos.length} registados e isolados — só teus, só isto.`, rodape: '☣️ PASSO 1',
            promptImg: 'dark toxic green and violet neon cluster of chat bubbles, glowing toxic hive, poster style, no text',
            cacheKey: 'dtox_grupos',
            botoes: [
              { texto: '📦 AddAll automático', id: `${p}divulgar addall` },
              { texto: '📋 Ver a minha onda', id: `${p}divulgar list` },
            ] },
          { corpo: `⏱️ *VELOCIDADE / DELAY*\nAtiva agora: *${delayNome}* (${delay}ms) — motor SUPER, sem pausas de fábrica.`, rodape: '☣️ PASSO 2',
            promptImg: 'dark toxic violet neon speedometer with toxic green glow, cyberpunk timer, poster style, no text',
            cacheKey: 'dtox_delay',
            botoes: [
              { texto: '⏱️ Painel do delay', id: `${p}delay` },
              { texto: '⚡ Rápido 70ms', id: `${p}delay rapido` },
            ] },
          { corpo: '🚀 *ENVIAR — 4 PASSOS*\nGrupos → velocidade → visibilidade (👁️/🕶️) → disparo com relatório.', rodape: '☣️ PASSO 3–4',
            promptImg: 'toxic green mist signal broadcasting across dark city skyline, neon violet beams, poster style, no text',
            cacheKey: 'dtox_enviar',
            botoes: [
              { texto: '🚀 Divulgar agora', id: `${p}divulgar` },
              { texto: '📇 Onda em cartão', id: `${p}divulgarcartao` },
              { texto: '👁️ Teste visível', id: `${p}divulgarteste visivel` },
            ] },
          { corpo: '🎨 *ESTILO DO CLIENTE*\n22 fontes, gerador de nicks, molduras e 8 capas para o cartão. Tudo texto puro — abre em qualquer WhatsApp.', rodape: '☣️ TABULEIRO',
            promptImg: 'neon violet and toxic green calligraphy glyphs floating in dark cyberspace, ornate unicode sigils, poster style, no text',
            cacheKey: 'dtox_estilo',
            botoes: [
              { texto: '🔠 As 22 fontes', id: `${p}letras dark bot` },
              { texto: '🎭 TEMAS', id: `${p}change` },
            ] },
          { corpo: '🤖 *SEU BOT + PLANO*\nEstado do teu número, stats da onda, cartão de links e a tabela do aluguel.', rodape: '☣️ Oficina',
            promptImg: 'dark robotic hand holding glowing toxic green phone, violet neon circuits, poster style, no text',
            cacheKey: 'dtox_bot',
            botoes: [
              { texto: '📊 Meu bot', id: `${p}meubot` },
              { texto: '📇 Cartão de links', id: `${p}linkcartao` },
              { texto: '💵 Planos', id: `${p}aluguel` },
            ] },
        ],
      });
    } catch { carro = false; }
  }
  if (!carro) {
    await _lista(sock, msg, ctx, {
      titulo: '☣️ CLIENTE ONLINE',
      corpo,
      seccoes,
      rodape: `☣️ ${config.bot.name} · cliente ${own.slice(-4)} · DARKTOXIC`,
    });
  }
}

// ── ONDA DE BROADCAST (o core partilhado) ────────────────────
async function _onda(sock, msg, ctx, montar, vis, rotulo, vezes = 1) {
  const own = _num(ctx.senderNumber);
  const bcc = require('../botConfigCache');
  const grupos = (await _get(bcc, `grupos_${own}`)) || [];
  const delay = Number(await _get(bcc, `delay_${own}`)) || 0;
  await sock.sendMessage(_alvo(ctx), {
    text: _dtox('A D I V U L G A R', [
      `🚀 Onda *${rotulo}* a correr… ⚡ SUPER`,
      `📦 ${grupos.length} grupos · 🔁 ${vezes}x · ⏱️ ${delay ? delay + 'ms' : '0ms ⚡'} · 👁️ ${vis === 'visivel' ? 'VISÍVEL (ADM vê)' : vis === 'invisivel' ? 'INVISÍVEL (ADM não vê nada)' : 'SEM MENÇÕES'}`,
      `🔀 ordem aleatória${((await _get(bcc, `giro_${own}`).catch(() => null)) || []).length ? ` · 🌀 giro x${((await _get(bcc, `giro_${own}`)) || []).length}` : ''}`,
      '🛑 cancelar a qualquer momento: `!divulgarstop`',
    ]),
  }, { quoted: msg }).catch(() => {});
  const r = await _disparar(sock, msg, ctx, { vis, montar, vezes });
  const p = ctx.prefix || config.bot.prefix || '!';
  _ULTIMOS.set(own, { vis, montar });
  // v9.9: o RELATÓRIO traz botões FIXOS (quick_reply) — a onda morre
  // e já nasce a próxima acção à mão (repõe a sessão, vê stats, para).
  const textoR = _resumo(r, p);
  try {
    const { generateWAMessageFromContent, proto } = require('@systemzero/baileys');
    const m = generateWAMessageFromContent(_alvo(ctx), {
      interactiveMessage: proto.Message.InteractiveMessage.fromObject({
        body: { text: textoR },
        footer: { text: `☣️ DARKTOXIC · onda ${rotulo}` },
        header: { title: '', hasMediaAttachment: false },
        nativeFlowMessage: { buttons: [
          { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '🔁 Repetir mesma onda', id: `${p}divulgarrepetir` }) },
          { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '📊 Histórico', id: `${p}divulgarhistorico` }) },
          { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '🛑 Parar', id: `${p}divulgarstop` }) },
        ] },
      }),
    }, { userJid: sock.user?.id, quoted: msg });
    await _relayBiz(sock, _alvo(ctx), m);
    return;
  } catch { /* sem interactivo → texto */ }
  await sock.sendMessage(_alvo(ctx), { text: textoR }).catch(() => {});
}

/** Texto a divulgar — do quote, dos args ou da sessão. */
function _textoDe(msg, args) {
  const q = msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  const qTxt = q?.conversation || q?.extendedTextMessage?.text || '';
  return (args.join(' ').trim() || String(qTxt).trim()).slice(0, 4000);
}

/** Mídia do quote: foto/vídeo/doc/áudio. */
async function _mediaDe(msg, tipo, caption) {
  const q = msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  const chave = { foto: 'imageMessage', video: 'videoMessage', doc: 'documentMessage', audio: 'audioMessage' }[tipo];
  const alvo = q?.[chave] || msg?.message?.[chave];
  if (!alvo) return null;
  try {
    const { downloadMediaMessage } = require('@systemzero/baileys');
    // a chave da MENSAGEM CITADA (stanzaId) — a desencriptação usa o id dela
    const ctxInfo = msg?.message?.extendedTextMessage?.contextInfo || {};
    const fakeMsg = {
      key: q ? { remoteJid: ctxInfo.remoteJid || msg.key?.remoteJid, id: ctxInfo.stanzaId || msg.key?.id, fromMe: !!ctxInfo.participant === false && false } : msg.key,
      message: { [chave]: alvo },
    };
    const buf = await downloadMediaMessage(fakeMsg, 'buffer', {});
    if (tipo === 'foto') return { image: buf, caption };
    if (tipo === 'video') return { video: buf, caption, mimetype: alvo.mimetype || 'video/mp4' };
    if (tipo === 'doc') return { document: buf, caption, mimetype: alvo.mimetype || 'application/pdf', fileName: alvo.fileName || 'divulgacao' };
    if (tipo === 'audio') return { audio: buf, mimetype: alvo.mimetype || 'audio/mpeg', ptt: !!alvo.ptt };
  } catch { return null; }
  return null;
}


/** Apaga UMA mensagem do grupo (o botão só pode apagar como admin —
 * se não puder, falha em silêncio). */
async function _apagar(sock, jid, key) {
  try { if (key) await sock.sendMessage(jid, { delete: key }); } catch {}
}

/**
 * v9.18 🔏 SELAR O RASTO — «porque é que as fotos não ficam invisíveis?»
 * Porque a moderação via a TUA mensagem: o comando com o URL escrito, a
 * foto que enviaste para responderes, o «invisivel» que teclaste. A onda
 * já era limpa; o rasto do dono não era. Com o dono a usar a divulgação
 * num grupo, este selo APAGA a mensagem do comando e, SE a foto/vídeo
 * citado era do próprio dono, a original também. Nunca toca em mensagens
 * de terceiros.
 */
async function _selar(sock, msg, ctx, { comQuote = true } = {}) {
  try {
    if (!ctx || !ctx.isGroup || !msg || !msg.key) return;
    const ownerNum = _num((config.owner && config.owner.number) || '');
    if (!ownerNum || _num(ctx.senderNumber) !== ownerNum) return; // só o dono
    await _apagar(sock, msg.key.remoteJid || ctx.remoteJid, msg.key);
    if (!comQuote) return;
    const ci = msg?.message?.extendedTextMessage?.contextInfo;
    if (ci && ci.stanzaId && String(ci.participant || '').startsWith(ownerNum + '@')) {
      await _apagar(sock, ci.remoteJid || ctx.remoteJid, { remoteJid: ci.remoteJid || ctx.remoteJid, id: ci.stanzaId, fromMe: false });
    }
  } catch {}
}

/**
 * v9.17 📇 parser do cartão: «TÍTULO | Nome=url ; Nome2=url2».
 * Corpo antes do `|`; 1–3 links depois (separados por `;` ou quebra de linha
 * — vírgula NÁO separa, URLs têm-as). Aceita link nu → rótulo «Abrir link».
 * Segmento inválido = null (usage), nunca adivinhar.
 */
function _parseCartao(txt) {
  const t = String(txt || '').trim();
  if (!t || !t.includes('|')) return null;
  const iPipe = t.indexOf('|');
  const corpo = t.slice(0, iPipe).trim();
  const resto = t.slice(iPipe + 1);
  const links = [];
  for (const seg of resto.split(/[;\n]+/)) {
    const s2 = seg.trim();
    if (!s2) continue;
    const par = s2.match(/^([^=]{1,24}?)\s*=\s*(https?:\/\/\S+)$/);
    const nu = s2.match(/^(https?:\/\/\S+)$/);
    if (par) links.push({ text: par[1].trim(), url: par[2].trim() });
    else if (nu) links.push({ text: 'Abrir link', url: nu[1].trim() });
    else return null;
  }
  if (!corpo || !links.length || links.length > 3) return null;
  return { titulo: corpo.slice(0, 300), links };
}

// ══════════════════ v9.15 — AGENDA PERSISTENTE + RE-ARM ══════════════════
/** Próximo instante: HH:MM (hoje ou amanhã) ou daqui a N minutos. */
function _msProximaHora(hm, min) {
  if (hm) {
    const h = +hm[1], m = +hm[2];
    if (h > 23 || m > 59) return null;
    const d = new Date();
    d.setSeconds(0, 0); d.setHours(h, m);
    if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
    return d.getTime();
  }
  if (Number.isInteger(min) && min >= 1 && min <= 14400) return Date.now() + min * 60000;
  return null;
}

/** Arma (ou re-arma) o setTimeout a partir do registo gravado. */
function _armar(own, ag) {
  try {
    if (!ag || !ag.at) return;
    if (_AGENDADOS.has(own)) { clearTimeout(_AGENDADOS.get(own)); _AGENDADOS.delete(own); }
    const ms = ag.at - Date.now();
    if (ms > 2 ** 31 - 2) return;             // >24 dias: re-arma no arranque seguinte
    const t = setTimeout(() => _disparoAgendado(own, ag), Math.max(1000, ms));
    if (t.unref) t.unref();
    _AGENDADOS.set(own, t);
  } catch {}
}

/** Onda agendada: usa o sock vivo do momento (não o do comando). */
async function _disparoAgendado(own, ag) {
  try {
    _AGENDADOS.delete(own);
    const bot = require('../whatsapp').getBot();
    const sock = bot && (bot.sock || bot.client);
    if (!sock) { _armar(own, { ...ag, at: Date.now() + 60000 }); return; }
    const ctxLite = {
      remoteJid: `${own}@s.whatsapp.net`, senderJid: `${own}@s.whatsapp.net`,
      senderNumber: own, isGroup: false, prefix: '!', fromMe: false,
    };
    const bcc = require('../botConfigCache');
    await _onda(sock, null, ctxLite, async (_g, tag, mencoes) => ({
      content: { text: await _corpoDesp(ag.texto, ag.vis, tag, own), mentions: ag.vis === 'sem' ? [] : mencoes },
    }), ag.vis, 'agendada⏰');
    if (!ag.diario) { await _set(bcc, `agenda_${own}`, null); return; }
    const at = ag.at + 86400000;
    const novo = { ...ag, at, atISO: new Date(at).toISOString() };
    await _set(bcc, `agenda_${own}`, novo);
    _armar(own, novo);
  } catch (e) { console.error(`⏰ [agenda] disparo falhou (${own}):`, e.message); }
}

/** No arranque: re-arma tudo o que estava gravado (atraso ≤30min dispara logo). */
async function _rearmAgendas(tenta = 0) {
  try {
    const BotConfig = require('../../database/models/BotConfig');
    const docs = await BotConfig.find({ key: /^divulg_agenda_/ }).lean();
    for (const d of docs) {
      const own = String(d.key).replace('divulg_agenda_', '');
      let ag = d.value;
      if (typeof ag === 'string') { try { ag = JSON.parse(ag); } catch { ag = null; } }
      if (!ag || !ag.at) continue;
      const late = Date.now() - ag.at;
      if (!ag.diario && late > 30 * 60000) continue;      // velho: não dispara
      if (!ag.diario && late > 0) { _disparoAgendado(own, { ...ag, at: Date.now() }); continue; }
      while (ag.diario && ag.at <= Date.now()) ag = { ...ag, at: ag.at + 86400000 };
      _armar(own, ag);
      console.log(`⏰ [agenda] re-armada p/ ${new Date(ag.at).toLocaleString('pt-PT')}`);
    }
  } catch (e) {
    if (tenta < 10) setTimeout(() => _rearmAgendas(tenta + 1), 30000); // espera pelo Mongo
  }
}
if (typeof setTimeout === 'function') { const _t = setTimeout(() => _rearmAgendas(), 8000); if (_t.unref) _t.unref(); }


module.exports = function registerDivulgacao(_registerCase) {
  // v9.14: TODA a superfície da divulgação fala no PV do dono quando
  // o comando veio de grupo — ADM deixa de VER painéis e botões (e de
  // os achar «mortos» ao carregar).
  const registerCase = (names, fn, ...resto) => _registerCase(names, async (argz) => {
    // v9.18 🕷️ tema do dono: carrega (1× em memória) e veste o _dtox da invocação
    const own0 = argz && argz.ctx ? _num(argz.ctx.senderNumber) : '';
    const temaAntigo = _TEMA_ATUAL;
    if (own0) {
      try {
        if (!_TEMA_CACHE.has(String(own0))) _TEMA_CACHE.set(String(own0), (await _get(require('../botConfigCache'), `tema_${own0}`)) || 'darktoxic');
        _TEMA_ATUAL = _tema(own0);
      } catch {}
    }
    try {
    if (argz && argz.sock && argz.ctx) {
      const { sock, ctx } = argz;
      const reply0 = argz.reply;
      argz.reply = (t) => {
        const alvo = _alvo(ctx);
        return sock.sendMessage(alvo, { text: t }).catch(() => reply0 ? reply0(t) : null);
      };
    }
    return await fn(argz);
    } finally { _TEMA_ATUAL = temaAntigo; }
  }, ...resto);
  const deny = (reply) => reply('☣️ Este painel é *só do dono* — darktoxic fechado fora.');

  // ── HUB MASTER ──
  registerCase(['cliente', 'clienteonline', 'divulgacao', 'cli'], async ({ sock, msg, ctx, isOwner, reply }) => {
    if (!isOwner) return deny(reply);
    return _painelCliente(sock, msg, ctx);
  });

  // ── GRUPOS ──
  const _fDivulgar = async ({ sock, msg, ctx, args, prefix, isOwner, reply }) => {
    if (!isOwner) return deny(reply);
    const bcc = require('../botConfigCache');
    const own = _num(ctx.senderNumber);
    const p = prefix || config.bot.prefix || '!';
    const sub = String(args[0] || '').toLowerCase();

    const grupos = (await _get(bcc, `grupos_${own}`)) || [];
    const guardar = (g) => _set(bcc, `grupos_${own}`, g);

    if (sub === 'add') {
      if (!ctx.isGroup) return reply(`☣️ Entra no grupo-alvo e repete \`${p}divulgar add\` — eu registo ESTE.`);
      if (grupos.some(g => g.jid === ctx.remoteJid)) return reply('☣️ Este grupo já está na tua onda. ✅');
      let nome = ctx.groupName || '';
      try { nome = nome || (await sock.groupMetadata(ctx.remoteJid))?.subject || ctx.remoteJid; } catch {}
      grupos.push({ jid: ctx.remoteJid, nome, adicionado: new Date().toISOString() });
      await guardar(grupos);
      return reply(_dtox('G R U P O  R E G I S T A D O', [`📦 ${nome}`, `Total da onda: *${grupos.length}*`, `\`${p}divulgar list\``]));
    }

    if (sub === 'addall') {
      const todos = await sock.groupFetchAllParticipating().catch(() => ({}));
      const conhecidos = new Set(grupos.map(g => g.jid));
      let add = 0;
      for (const [jid, m] of Object.entries(todos)) {
        if (!conhecidos.has(jid)) { grupos.push({ jid, nome: m.subject || jid, adicionado: new Date().toISOString() }); add++; conhecidos.add(jid); }
      }
      await guardar(grupos);
      return reply(_dtox('A D D A L L', ['📦 PEGA TODOS AUTOMÁTICO!', `Novos: *${add}*`, `Total da onda: *${grupos.length}*`]));
    }

    if (sub === 'list') {
      if (!grupos.length) return reply(_dtox('A TUA ONDA', ['(vazia)', `\`${p}divulgar add\` num grupo · \`${p}divulgar addall\` pega todos`]));
      const linhas = grupos.map((g, i) => `${i + 1}. 📦 ${g.nome}`);
      return _lista(sock, msg, ctx, {
        titulo: '📦 OS TEUS GRUPOS',
        corpo: _dtox('G R U P O S  D A  O N D A', [...linhas.slice(0, 24), grupos.length > 24 ? `…+${grupos.length - 24}` : '', `\`${p}divulgar del N\` remove o de número N`].filter(Boolean)),
        seccoes: [{ title: '📦 GRUPOS', rows: grupos.slice(0, 24).map((g, i) => ({ title: (g.nome || g.jid).slice(0, 24), description: `${i + 1} — ${g.adicionado.slice(0, 10)}`, id: `${p}divulgar detalhe ${i + 1}` })) }],
      });
    }

    if (sub === 'detalhe') {
      const n = Number(args[1]); const g = grupos[n - 1];
      if (!g) return reply('☣️ Número inválido.');
      return reply(_dtox('G R U P O', [`📦 *${g.nome}*`, `JID: \`${g.jid}\``, `Registado: ${g.adicionado.slice(0, 10)}`, `Remover: \`${p}divulgar del ${n}\``, ' ', `Toca "${p}divulgar del ${n}" como ação rápida ⤵️`]));
    }

    if (sub === 'del') {
      const n = Number(args[1]);
      if (!Number.isInteger(n) || n < 1 || n > grupos.length) return reply(`☣️ Usa \`${p}divulgar del N\` — o N da \`${p}divulgar list\` (ex.: \`${p}divulgar del 1\`).`);
      const tirado = grupos.splice(n - 1, 1)[0];
      await guardar(grupos);
      return reply(_dtox('R E M O V I D O', [`🗑️ ${tirado.nome}`, `Ficam: *${grupos.length}*`]));
    }

    if (sub === 'delall') {
      await guardar([]);
      return reply(_dtox('L I M P O', ['🗑️ Apagados TODOS os grupos da tua onda.']));
    }

    // v9.15 📊 MÉTRICAS — entrega real POR grupo + cemitério reactivável
    if (sub === 'metricas' || sub === 'stats') {
      const stats = (await _get(bcc, `stats_${own}`)) || {};
      const noOnda = Object.keys(stats).filter((j) => !grupos.some((g) => g.jid === j));
      if (!grupos.length && !noOnda.length) return reply(`📭 Sem métricas ainda — corre uma onda primeiro (\`${p}divulgar\`).`);
      const linhas = grupos.map((g, i) => {
        const st0 = stats[g.jid] || { ok: 0, fail: 0 };
        const taxa = (st0.ok + st0.fail) ? Math.round((st0.ok / (st0.ok + st0.fail)) * 100) : 100;
        return `${i + 1}. ${g.nome || g.jid.split('@')[0]} — ✅${st0.ok} ❌${st0.fail} · 📶${taxa}%${st0.last ? ' · ' + new Date(st0.last).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}`;
      });
      const cemit = noOnda.map((j, i) => `⚰️ ${i + 1}. ${(stats[j].nome || j.split('@')[0])} (${stats[j].fail}❌ seguidos) — \`${p}divulgar reativar ${i + 1}\``);
      const textoM = _dtox('M É T R I C A S  D A  O N D A', [
        `📦 na onda: ${grupos.length} · ⚰️ excluídos: ${noOnda.length}`,
        '',
        ...(linhas.length ? ['🟢 activos:'].concat(linhas.slice(0, 15)) : []),
        ...(cemit.length ? ['', '🪦 fora (3 falhas seguidas):'].concat(cemit.slice(0, 8)) : []),
        '',
        '🔀 ordem baralhada em cada passe · 🌀 variação: `!giro`',
      ]);
      // v9.17 🔘 botões a FUNCIONAR em todo o lado — reativar sem escrever nada
      const bt = require('../buttonHandler');
      try {
        await bt.sendButtons(sock, _alvo(ctx), textoM, '☣️ DARKTOXIC · métricas', [
          { id: `${p}divulgar metricas`, text: '🔄 Actualizar' },
          ...noOnda.slice(0, 2).map((j, i) => ({ id: `${p}divulgar reativar ${i + 1}`, text: `⚰️ Reativar ${i + 1}` })),
          { id: `${p}cliente`, text: '🕸️ Menu cliente' },
        ], msg);
      } catch { return reply(textoM); }
      return;
    }
    if (sub === 'reativar' || sub === 'reactivar') {
      const stats = (await _get(bcc, `stats_${own}`)) || {};
      const noOnda = Object.keys(stats).filter((j) => !grupos.some((g) => g.jid === j));
      const n = parseInt(args[1], 10);
      if (!noOnda.length) return reply('🪦 Nenhum grupo excluído — todos estão na onda.');
      if (!Number.isInteger(n) || n < 1 || n > noOnda.length) return reply(`☣️ \`${p}divulgar reativar N\` (N do \`${p}divulgar metricas\`, 1–${noOnda.length}).`);
      const jid = noOnda[n - 1];
      grupos.push({ jid, nome: stats[jid].nome || jid.split('@')[0], adicionado: new Date().toISOString().slice(0, 10) });
      stats[jid].consec = 0; stats[jid].fail = 0;
      await guardar(grupos);
      try { await _set(bcc, `stats_${own}`, stats); } catch {}
      return reply(_dtox('R E S U S C I T A D O', [`⚰️➡️🟢 ${stats[jid].nome || jid} voltou à onda (${grupos.length} alvos).`]));
    }

    // ── 4 PASSOS ESCRITOS (o assistente âncora — o teu modelo) ──
    const texto = _textoDe(msg, args);
    if (!grupos.length && texto) {
      return reply(_dtox('D I V U L G A R', [
        '⚠️ *Sem grupos registados.*',
        'PASSO 1: adiciona primeiro:',
        `   \`${p}divulgar add\` (neste grupo) · \`${p}divulgar addall\` (todos automático)`,
      ]));
    }
    if (!texto) {
      // já tem fluxo? retoma o passo actual em vez de recomeçar
      const key = _kFluxo(ctx);
      _FLUXO.set(key, { passo: 'texto', expira: Date.now() + TTL_FLUXO, own, alvo: _alvo(ctx) });
      return reply(
        '✨━━━━━━━━━━━━━━━━━━━━✨\n' +
        '✨ *Passo 1/4 — O TEXTO DA DIVULGAÇÃO*\n' +
        '📝 Envia o texto que queres divulgar agora.\n' +
        '(para foto/vídeo/doc/áudio: responde à mídia com `!divulgarfoto…`)\n\n' +
        `❌ \`${p}cancelar\` ou escreve *cancelar* para sair\n` +
        '✨━━━━━━━━━━━━━━━━━━━━✨');
    }
    _FLUXO.set(_kFluxo(ctx), { passo: 'vezes', texto, expira: Date.now() + TTL_FLUXO, own, alvo: _alvo(ctx) });
    return reply(
      '✅ *TEXTO SALVO COM SUCESSO!*\n\n' +
      `📝 *Prévia:*\n> ${texto.slice(0, 140)}${texto.length > 140 ? '…' : ''}\n\n` +
      '✨ *Passo 2/4 — Quantas VEZES enviar?*\n' +
      '🔁 Escreve um número de *1 a 10*\n' +
      '`1` = envia 1x, `5` = envia 5x **em cada grupo**\n\n' +
      '❌ `.cancelar` para cancelar');

  // fim do case divulgar (o assistente continua por ESCRITO, via consumir)
  };
  // v9.18 ⚡ NOMES CURTOS — a onda fala a língua do bot: ONDA. Tudo o que
  // era !divulgar* ganha a forma !onda*/curta, sem partir nada: os nomes
  // velhos continuam à ordem. Lista completa: !comandosonda
  registerCase(['divulgar', 'onda'], _fDivulgar);
  registerCase(['medidor', 'ondamedidor'], async (p0) => _fDivulgar({ ...p0, args: ['metricas'] }));

  // ── ATALHO RÁPIDO ──
  registerCase(['divulgarrapido', 'ondarapida'], async ({ sock, msg, ctx, args, isOwner, reply }) => {
    if (!isOwner) return deny(reply);
    const vis = /^(visivel|visível)$/i.test(args[0] || '') ? 'visivel' : /^invis/i.test(args[0] || '') ? 'invisivel' : 'sem';
    const texto = _textoDe(msg, args.slice(1));
    if (!texto) return reply(`☣️ \`${ctx.prefix || config.bot.prefix}ondarapida visivel|invisivel <texto>\` — a mensagem vai de imediato.`);
    if (vis === 'invisivel') await _selar(sock, msg, ctx); // v9.18 🔏 zero rasto no grupo
    await _onda(sock, msg, ctx, async (_g, tag, mencoes) => ({
      content: { text: await _corpoDesp(texto, vis, tag, _num(ctx.senderNumber)), mentions: vis === 'sem' ? [] : mencoes },
    }), vis, 'rápido');
  });

  // ── TESTE (só para o próprio dono, 1 envio) ──
  registerCase(['divulgarteste', 'ondateste'], async ({ sock, msg, ctx, args, isOwner, reply }) => {
    if (!isOwner) return deny(reply);
    const vis = /^visivel|visível$/i.test(args[0] || '') ? 'visivel' : /^invis/i.test(args[0] || '') ? 'invisivel' : 'sem';
    const texto = _textoDe(msg, args.slice(1)) || '(teste darktoxic ☣️)';
    const mencoes = vis === 'sem' ? [] : [ctx.senderJid];
    const tag = vis === 'visivel' ? `\n\n@${_num(ctx.senderNumber)}` : '';
    await sock.sendMessage(ctx.remoteJid, {
      text: `☣️ *TESTE* ☣️\n\n${texto}${tag}`, mentions: mencoes,
    }, { quoted: msg }).catch(() => {});
    return reply(_dtox('T E S T E  O K', ['🔬 Enviado acima, em modo *' + (vis === 'sem' ? 'sem menções' : vis) + '*', `Real: \`${ctx.prefix || config.bot.prefix}divulgar\``]));
  });

  // ── STOP & HISTÓRICO ──
  registerCase(['divulgarstop', 'ondaparar', 'parar'], async ({ sock, msg, ctx, isOwner, reply }) => {
    if (!isOwner) return deny(reply);
    const own = _num(ctx.senderNumber);
    _STOP.add(own);
    const ag = _AGENDADOS.get(own);
    if (ag) { clearTimeout(ag); _AGENDADOS.delete(own); }
    { const _b = require('../botConfigCache'); await _set(_b, `agenda_${own}`, null); await _set(_b, `giro_${own}`, null); } // v9.15: stop limpa agenda+giro
    return reply(_dtox('A P A R A R', ['🛑 Sinal de paragem lançado — a onda morre no próximo grupo.', ag ? '⏰ Agenda pendente também cancelada.' : '']));
  });

  // v9.9: REPETIR a última onda — botão fixo do relatório
  registerCase(['divulgarrepetir', 'ondarepetir', 'repetir'], async ({ sock, msg, ctx, isOwner, reply }) => {
    if (!isOwner) return deny(reply);
    const ult = _ULTIMOS.get(_num(ctx.senderNumber));
    if (!ult) return reply('☣️ Ainda não há onda anterior nesta sessão para repetir.');
    return _onda(sock, msg, ctx, ult.montar, ult.vis, 'rep');
  });

  // v9.9: DASHBOARD de totais (a prova dos números, darktoxic)
  registerCase(['divulgarstats', 'divulgarestatistica', 'divgstat', 'ondastats'], async ({ sock, msg, ctx, isOwner, reply }) => {
    if (!isOwner) return deny(reply);
    const bcc = require('../botConfigCache');
    const own = _num(ctx.senderNumber);
    const hist = (await _get(bcc, `hist_${own}`)) || [];
    const grupos = (await _get(bcc, `grupos_${own}`)) || [];
    const ondas = hist.length;
    const alcance = hist.reduce((a, h) => a + (h.total || 0), 0);
    const entregue = hist.reduce((a, h) => a + (h.feitos || 0), 0);
    const sucesso = alcance ? Math.round((entregue / alcance) * 100) : 0;
    const last = hist[hist.length - 1];
    const linhas = [
      `📦 Ondas disparadas: *${ondas}*`,
      `🎯 Grupos alcançados (cumulativo): *${alcance}*`,
      `✅ Entregues com sucesso: *${entregue}* (${sucesso}%)`,
      `⚗️ Grupos guardados agora: *${grupos.length}*`,
      last ? `🕒 Última onda: ${String(last.quando).slice(5, 16).replace('T', ' ')} · ${last.vis} · delay ${last.delay}ms` : '🕒 Ainda sem ondas — corre a primeira.',
      '',
      `Vê as últimas 20: \`${ctx.prefix || config.bot.prefix}divulgarhistorico\``,
    ];
    return reply(_dtox('P R O V A   D O S   N Ú M E R O S', linhas));
  });

  // v9.9: AGENDA — dispara daqui a N minutos (timer desta sessão)
  /**
   * v9.15 ⏰ AGENDA REAL — inspirado nos bots de divulgação pagos
   * (agendamento pontual + recorrente). Agora aceita:
   *   !divulgaragenda 21:30 [visivel|invisivel] <texto>   → próxima hora certa
   *   !divulgaragenda 15 …                                 → daqui a 15 min
   *   !divulgaragenda diario 21:30 …                       → dispara TODOS OS DIAS
   * A agenda é PERSISTIDA (BotConfig) e re-armada no arranque do bot —
   * reiniciar já não a apaga. Ver: !divulgaragendas · apaga: !divulgarstop.
   */
  registerCase(['divulgaragenda', 'divulgarprogramar', 'ondaagenda', 'agenda'], async ({ sock, msg, ctx, args, isOwner, reply }) => {
    if (!isOwner) return deny(reply);
    const p = ctx.prefix || config.bot.prefix || '!';
    const bcc = require('../botConfigCache');
    const own = _num(ctx.senderNumber);
    const a = (args || []).slice();
    let diario = false;
    if (/^diari[oa]$|^d$|^todos?os?dias$/i.test(String(a[0] || ''))) { diario = true; a.shift(); }
    const t1 = String(a[0] || '');
    const hm = t1.match(/^(\d{1,2}):(\d{2})$/);
    const min = parseInt(t1, 10);
    const temVis = /^vis|^invis/i.test(a[1] || '');
    const vis = /^invis/i.test(a[1] || '') ? 'invisivel' : /^vis/i.test(a[1] || '') ? 'visivel' : 'sem';
    if (!hm && !(Number.isInteger(min) && min >= 1 && min <= 14400)) {
      return reply([
        '☣️ `' + p + 'divulgaragenda <HH:MM | minutos> [diario] [visivel|invisivel] <texto>`',
        '   ex.: `' + p + 'divulgaragenda 21:30 visivel drop às 21h`',
        '   ex.: `' + p + 'divulgaragenda 15 invisivel leak novo`',
        '   ex.: `' + p + 'divulgaragenda diario 08:00 bom dia⚡` (recorrente)',
        '📜 ver: `' + p + 'divulgaragendas` · cancelar: `' + p + 'divulgarstop`',
      ].join('\n'));
    }
    const ondaTexto = _textoDe(msg, a.slice(temVis ? 2 : 1));
    if (!ondaTexto) return reply('☣️ Falta o texto da onda: `' + p + 'divulgaragenda ' + t1 + ' ' + (vis === 'sem' ? '' : 'visivel ') + '<texto>`.');
    const at = _msProximaHora(hm, min);
    if (!at) return reply('☣️ Hora inválida (usa HH:MM 24h; minutos 1–14400 = 10 dias).');
    const ag = { at, atISO: new Date(at).toISOString(), vis, texto: ondaTexto, diario, criado: new Date().toISOString() };
    await _set(bcc, `agenda_${own}`, ag);
    _armar(own, ag);
    const em = Math.max(0, Math.round((at - Date.now()) / 60000));
    return reply(_dtox('A G E N D A D A', [
      `⏰ Dispara às *${new Date(at).toLocaleString('pt-PT', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })}* (daqui a *${em >= 60 ? Math.floor(em / 60) + 'h' + String(em % 60).padStart(2, '0') : em + 'min'}*)${diario ? ' · 🔁 TODOS OS DIAS' : ''}.`,
      `👁️ modo *${vis}* · 📝 "${ondaTexto.slice(0, 90)}${ondaTexto.length > 90 ? '…' : ''}"`,
      '💾 gravada — sobrevive a restart. Cancelar: `' + p + 'divulgarstop`',
    ]));
  });

  registerCase(['divulgaragendas', 'ondaagendas', 'agendas'], async ({ sock, msg, ctx, prefix, isOwner, reply }) => {
    if (!isOwner) return deny(reply);
    const bcc = require('../botConfigCache');
    const ags = await _get(bcc, `agenda_${_num(ctx.senderNumber)}`);
    if (!ags) return reply('📭 Sem agenda gravada — cria uma: `' + (ctx.prefix || '!') + 'divulgaragenda 21:30 texto`.');
    const a = [].concat(ags || []);
    const textoA = _dtox('A G E N D A', a.map((x) => `⏰ ${new Date(x.at).toLocaleString('pt-PT', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })} · ${x.diario ? '🔁 diário · ' : ''}${x.vis} · "${String(x.texto).slice(0, 60)}…"`).concat(['', '⛔ tudo: `!divulgarstop` · só agenda: `!divulgaragendaremove`']));
    // v9.17 🔘 botões da agenda — acções sem teclar
    const pA = prefix || config.bot.prefix || '!';
    const btA = require('../buttonHandler');
    try {
      await btA.sendButtons(sock, _alvo(ctx), textoA, '☣️ DARKTOXIC · agenda', [
        { id: `${pA}divulgaragenda`, text: '⏰ Nova agenda' },
        { id: `${pA}divulgarstop`, text: '🛑 Parar tudo' },
        { id: `${pA}divulgaragendaremove`, text: '🗑️ Soltar agenda' },
        { id: `${pA}cliente`, text: '🕸️ Menu cliente' },
      ], msg);
    } catch { return reply(textoA); }
    return;
  });

  /**
   * v9.15 🌀 GIRO — o truque dos bots pagos «variar texto para não
   * parecer repetitivo»: 1–8 cópias separadas por ||, e CADA envio da
   * onda usa a seguinte (carrossel). Sem giro = texto único + ruído.
   */
  registerCase(['giro', 'variacao', 'variacoes'], async ({ ctx, args, isOwner, reply }) => {
    if (!isOwner) return deny(reply);
    const bcc = require('../botConfigCache');
    const own = _num(ctx.senderNumber);
    const p = ctx.prefix || '!';
    const t0 = String(args[0] || '').toLowerCase();
    if (t0 === 'off' || t0 === 'desligar') {
      await _set(bcc, `giro_${own}`, []);
      _GIRO_IDX.delete(own);
      return reply(`🌀 Giro desligado — volta ao texto único (+ ruído).`);
    }
    if (!args.length) {
      const g = (await _get(bcc, `giro_${own}`)) || [];
      if (!g.length) return reply(_dtox('🌀 G I R O', [
        'Liga o carrossel de cópias: `!giro texto1 || texto2 || texto3`',
        '1–8 versões, até ~900 caracteres cada.',
        'Cada envio da onda roda para a seguinte → zero repetição.',
        'Estado: OFF · desligar: `!giro off`',
      ]));
      return reply(_dtox('🌀 G I R O', g.map((x, i) => `${i + 1}. ${x.slice(0, 70)}${x.length > 70 ? '…' : ''}`).concat(['', `➡️ roda a cada envio · \`${p}giro off\` desliga`])));
    }
    const corpo = (args || []).join(' ');
    const copias = corpo.split(/\|\|/).map((x) => x.trim()).filter(Boolean).slice(0, 8).map((x) => x.slice(0, 900));
    if (copias.length < 2) return reply(`☣️ Manda 2+ cópias separadas por \`||\` — ex.: \`${p}giro drop novo 🔥 || 🚨 acaba de sair || ⚡ não percas o drop\`.`);
    await _set(bcc, `giro_${own}`, copias);
    _GIRO_IDX.set(own, 0);
    return reply(_dtox('🌀 G I R O  L I G A D O', copias.map((x, i) => `${i + 1}. ${x.slice(0, 70)}${x.length > 70 ? '…' : ''}`).concat(['', `✅ ${copias.length} cópias em rotação — a próxima onda já usa. Ver: \`${p}giro\``])));
  });

  registerCase(['divulgaragendaremove', 'desagendar', 'ondadesagenda', 'desagenda'], async ({ ctx, isOwner, reply }) => {
    if (!isOwner) return deny(reply);
    const bcc = require('../botConfigCache');
    const own = _num(ctx.senderNumber);
    if (_AGENDADOS.has(own)) { clearTimeout(_AGENDADOS.get(own)); _AGENDADOS.delete(own); }
    await _set(bcc, `agenda_${own}`, null);
    return reply(`✅ Agenda de *${own}* apagada (timer + registo).`);
  });

  registerCase(['divulgarhistorico', 'ondahistorico', 'historico'], async ({ sock, msg, ctx, isOwner, reply }) => {
    if (!isOwner) return deny(reply);
    const bcc = require('../botConfigCache');
    const hist = (await _get(bcc, `hist_${_num(ctx.senderNumber)}`)) || [];
    if (!hist.length) return reply(_dtox('H I S T Ó R I C O', ['(vazio — corre a tua primeira onda!)']));
    const linhas = hist.slice(-8).reverse().map(h =>
      `🕒 ${String(h.quando).slice(5, 16).replace('T', ' ')} · ${h.vis} · ✅${h.feitos}/📦${h.total}${h.erros ? ` ❌${h.erros}` : ''}${h.parado ? ' 🛑' : ''}`);
    return reply(_dtox('H I S T Ó R I C O  D A S  O N D A S', linhas.reverse()));
  });

  // ── VELOCIDADE ──
  // v9.15 SUPER MODO — a omissão é 0ms: rajada total, sem teatro.
  // Os presets «lentos» continuam à mão de quem os quiser gerir.
  const DELAYS = {
    super: { ms: 0, icon: '⚡', aviso: 'SUPER — SEM PAUSAS (OMISSÃO)' },
    ultra: { ms: 1, icon: '🚀', aviso: 'sem respirar' },
    rapido: { ms: 70, icon: '🔥', aviso: 'quase nada' },
    medio: { ms: 300, icon: '🐢', aviso: 'respiração leve' },
    antiban: { ms: 1200, icon: '🛡️', aviso: 'conservador' },
    devagar: { ms: 2000, icon: '🐌', aviso: 'modo caracol' },
    ultrarapido: { ms: 5000, icon: '🐌🐌', aviso: 'pedalada suave' },
  };
  // v9.15: o velho `!delayultrarapido` (5s!) passou a ser SINÓNIMO de
  // SUPER — quem grita «ultra-rápido» quer rajada, não pausa.
  DELAYS.delayultrarapido = DELAYS.super;
  const _delayCase = async ({ sock, msg, ctx, args, prefix, isOwner, reply }) => {
    if (!isOwner) return deny(reply);
    const bcc = require('../botConfigCache');
    const own = _num(ctx.senderNumber);
    const p = prefix || config.bot.prefix || '!';
    const atual = Number(await _get(bcc, `delay_${own}`)) || 0;

    const sub = String(args[0] || '').toLowerCase();
    if (!sub) {
      const presets = ['super', 'ultra', 'rapido', 'medio', 'antiban', 'devagar'];
      const corpo = _dtox('V E L O C I D A D E   /   D E L A Y', [
        ...presets.map(k => `${DELAYS[k].icon} *${k}* — ${DELAYS[k].ms}ms ${DELAYS[k].ms === atual ? '🟢 ATIVO' : `(${DELAYS[k].aviso})`}`),
        `👑 O motor agora é SUPER: nada de pausas de fabrica.`, 
        `🔧 custom: \`${p}delay 100\` (0 a 5000ms)`,
        '',
        '👆 Toca num preset ou escreve o valor.',
      ]);
      return _lista(sock, msg, ctx, {
        titulo: '⏱️ ESCOLHE A VELOCIDADE',
        corpo,
        seccoes: [{ title: '⏱️ DELAY', rows: presets.map(k => ({
          title: `${DELAYS[k].icon} ${k}`, description: `${DELAYS[k].ms}ms · ${DELAYS[k].aviso}`.slice(0, 70), id: `${p}delay ${k}`,
        })) }],
      });
    }

    let ms = (sub in DELAYS) ? DELAYS[sub].ms : undefined;
    if (ms === undefined && /^\d+$/.test(sub)) ms = Math.max(0, Math.min(5000, Number(sub)));
    if (ms === undefined) return reply(`☣️ Delay inválido — presets (\`${p}delay\`) ou custom 0..5000: \`${p}delay 100\`.`);

    await _set(bcc, `delay_${own}`, ms);
    const nome = Object.entries(DELAYS).find(([, v]) => v?.ms === ms)?.[0];
    return reply(_dtox('V E L O C I D A D E  F I X A D A', [`${(DELAYS[nome]?.icon) || '🔧'} *${nome || 'custom'}* — *${ms}ms*`, `${(DELAYS[nome]?.aviso) || 'customizado'}`, `A tua próxima onda usa isto. 🚀`]));
  };
  registerCase(['delay', 'velocidade'], _delayCase);

  // ── v9.18 🕷️ TEMA DO CLIENTE — moldura dos painéis do dono ──
  registerCase(['clientetema', 'temacliente'], async ({ sock, msg, ctx, args, isOwner, reply }) => {
    if (!isOwner) return deny(reply);
    const p = ctx.prefix || config.bot.prefix || '!';
    const bcc = require('../botConfigCache');
    const own = _num(ctx.senderNumber);
    const escolha = String(args[0] || '').toLowerCase().replace(/[^a-z]/g, '');
    if (escolha && escolha !== 'aranha' && escolha !== 'darktoxic' && escolha !== 'dark' && escolha !== 'classico') {
      return reply(`☣️ Temas: \`aranha\` 🕷️ ou \`darktoxic\` ☣️ — \`${p}clientetema aranha\`.`);
    }
    if (escolha) {
      const tema = (escolha === 'dark' || escolha === 'classico') ? 'darktoxic' : escolha;
      await _set(bcc, `tema_${own}`, tema);
      _TEMA_CACHE.set(String(own), tema);
      const ant = _TEMA_ATUAL; _TEMA_ATUAL = tema;
      const ok = _dtox('T E M A  G U A R D A D O', [`🖼️ Painéis do cliente agora em *${tema.toUpperCase()}* — moldura nova em tudo: ${p}cliente, métricas, agenda, relatórios.`]);
      _TEMA_ATUAL = ant;
      return reply(ok);
    }
    const atual = _tema(own);
    const bt = require('../buttonHandler');
    const textoT = _dtox('T E M A  D O  C L I E N T E', [
      `🖼️ atual: *${atual.toUpperCase()}*`,
      '☣️ darktoxic — a clássica ◢◤◣◥',
      '🕷️ aranha — teia ╔» ╝« (nova)',
      '',
      'Muda a moldura de TODOS os painéis e relatórios do dono.',
    ]);
    try {
      await bt.sendButtons(sock, _alvo(ctx), textoT, '☣️ DARKTOXIC · tema', [
        { id: `${p}clientetema aranha`, text: '🕷️ Aranha' },
        { id: `${p}clientetema darktoxic`, text: '☣️ Darktoxic' },
      ], msg);
    } catch { return reply(textoT); }
  });

  // ── v9.18 📜 LISTA DE COMANDOS — texto puro, zero botões (contrato) ──
  registerCase(['comandosonda', 'comandosdivulgar', 'ondacomandos'], async ({ ctx, isOwner, reply }) => {
    if (!isOwner) return deny(reply);
    const p = ctx.prefix || config.bot.prefix || '!';
    return reply([
      '⚡ *COMANDOS DA ONDA — ' + (config.bot.name || 'DARK BOT').toUpperCase() + '*',
      '',
      '`!cli` — painel completo (hubs, listas, tudo)',
      '`!onda` — assistente 4 passos · `!ondarapida invisivel texto` — direto',
      '`!ondafoto !ondavideo !ondadoc !ondaaudio` [visivel|invisivel] — responde à media',
      '`!cartao título | Nome=url` — cartão p/ ti · `!ondacartao invisivel t | N=url` — p/ a onda',
      '`!onda add` (este grupo) · `!onda addall` · `!onda list` · `!onda del N`',
      '`!parar` · `!repetir` · `!historico` · `!medidor` — controlo da onda',
      '`!agenda 21:30 texto` · `!agendas` · `!desagenda`',
      '`!velocidade 0..5000` (=!delay) · `!giro a || b || c`',
      '`!clientetema` — 🕷️ aranha ou ☣️ darktoxic',
      '`!enquete "P" | a | b` · `!canalreagir 🤡 10 <link>`',
      '',
      'Invisível = menção sem tags + rasto do dono SELADO (apago os teus comandos e a foto citada).',
      'DARK BOT 🕸️',
    ].join('\n'));
  });
  registerCase(['delayultrarapido'], async (p0) => _delayCase({ ...p0, args: ['super'] }));

  // ── MÍDIA (foto/video/doc/audio via quote) ──────────────────
  const MEDIA = [
    { cmd: 'divulgarfoto', tipo: 'foto' }, { cmd: 'divulgarvideo', tipo: 'video' },
    { cmd: 'divulgardoc', tipo: 'doc' }, { cmd: 'divulgaraudio', tipo: 'audio' },
  ];
  for (const { cmd, tipo } of MEDIA) {
    registerCase([cmd, `onda${tipo === 'audio' ? 'audio' : tipo}`], async ({ sock, msg, ctx, args, isOwner, reply }) => {
      if (!isOwner) return deny(reply);
      const p = ctx.prefix || config.bot.prefix || '!';
      const vis = /^invis/i.test(args[0] || '') ? 'invisivel' : /^vis/i.test(args[0] || '') ? 'visivel' : 'sem';
      const caption = _textoDe(msg, args.slice(0).filter(Boolean)) || '';
      const midia = await _mediaDe(msg, tipo, caption.replace(/^visível$|^visivel$|^invisível$|^invisivel$/i, '').trim());
      // v9.18 🔏 invisível a sério: apaga o comando E a foto original do dono
      // no grupo — era ISSO que deixava «as fotos visíveis» ao ADM.
      if (vis === 'invisivel') await _selar(sock, msg, ctx);
      if (!midia) return reply(`☣️ Responde a ${tipo === 'foto' ? 'uma foto' : tipo === 'video' ? 'um vídeo' : tipo === 'doc' ? 'um documento' : 'um áudio'} com \`${p}${cmd} [visivel|invisivel] [legenda]\`.`);
      await _onda(sock, msg, ctx, async (_g, tag, mencoes) => ({
        content: {
          ...midia,
          caption: vis === 'visivel'
            ? `${midia.caption ? midia.caption + '\n\n' : ''}☣️ ${tag ? tag : ''}`.trim()
            : _ruido(midia.caption || '☣'),
          mentions: vis === 'sem' ? [] : mencoes,
        },
      }), vis, tipo);
    });
  }

  // ═══════════════ v9.17 📇 CARTÕES DE LINK «IGUAIS AOS DO CANAL» ═══════════════
  // Os links vivem nos BOTÕES (urlButton/cta_url) — corpo limpo, foto opcional
  // (responder a uma foto). O anti-link deste mesmo bot (v9.17) varre esta
  // superfície: um cartão destes SÓ engana moderadores que leem texto.
  registerCase(['divulgarcartao', 'ondacartao'], async ({ sock, msg, ctx, args, isOwner, reply }) => {
    if (!isOwner) return deny(reply);
    const p = ctx.prefix || config.bot.prefix || '!';
    const t0 = String(args[0] || '').toLowerCase();
    const vis = /^invis/i.test(t0) ? 'invisivel' : /^vis/i.test(t0) ? 'visivel' : 'sem';
    const parsed = _parseCartao(_textoDe(msg, vis !== 'sem' ? args.slice(1) : args));
    await _selar(sock, msg, ctx); // v9.18 🔏 o comando com URL não fica no grupo
    if (!parsed) return reply(
      `☣️ \`${p}divulgarcartao [visivel|invisivel] TÍTULO | Nome=https://link ; Nome2=https://link2\`\n` +
      '1 a 3 botões de link por cartão · foto: responde a uma foto com o comando.\n' +
      `Testar só para ti: \`${p}cartao …\` (=!linkcartao)`);
    const midia = await _mediaDe(msg, 'foto', parsed.titulo);
    const mkBtns = () => parsed.links.map((l, i) => ({ index: i + 1, urlButton: { displayText: l.text.slice(0, 20), url: l.url } }));
    // PROBE real: um envio no PV do dono valida o formato ANTES da onda — se
    // o cliente não aceitar templateButtons (ou foto+botões), o cartão degrada
    // para links no corpo e a onda NÃO morre grupo a grupo.
    let comBotoes = true, comFoto = !!midia;
    try {
      const base = comFoto ? { image: midia.image, caption: parsed.titulo } : { text: parsed.titulo };
      await sock.sendMessage(_alvo(ctx), { ...base, footer: '☣️ DARKTOXIC · pré-visual', templateButtons: mkBtns() });
    } catch {
      if (comFoto) {
        try { await sock.sendMessage(_alvo(ctx), { text: parsed.titulo, footer: '☣️ DARKTOXIC · pré-visual', templateButtons: mkBtns() }); comFoto = false; }
        catch { comBotoes = false; comFoto = !!midia; }
      } else comBotoes = false;
    }
    if (!comBotoes) {
      await reply('⚠️ Este cliente não aceitou o cartão com botões — a onda vai seguir com os links no corpo da mensagem.');
    }
    await _onda(sock, msg, ctx, async (_g, tag, mencoes) => {
      const corpoTxt = [
        vis === 'visivel' && tag ? `☣️ ${tag.trim()}` : '',
        parsed.titulo,
        !comBotoes ? parsed.links.map((l) => `🔗 ${l.text}: ${l.url}`).join('\n') : '',
      ].filter(Boolean).join('\n\n');
      const content = comFoto
        ? { image: midia.image, caption: corpoTxt }
        : { text: corpoTxt };
      content.footer = '☣️ DARKTOXIC';
      if (comBotoes) content.templateButtons = mkBtns();
      if (vis === 'invisivel' && mencoes.length) content.mentions = mencoes;
      return { content };
    }, vis, 'cartão');
  });

  registerCase(['linkcartao', 'cartaolink', 'cartaodelinks', 'cartao'], async ({ sock, msg, ctx, args, isOwner, reply }) => {
    if (!isOwner) return deny(reply);
    const p = ctx.prefix || config.bot.prefix || '!';
    const parsed = _parseCartao(_textoDe(msg, args));
    await _selar(sock, msg, ctx); // v9.18 🔏 idem — cartão é privado
    if (!parsed) return reply(
      `☣️ \`${p}linkcartao TÍTULO | Nome=https://link ; Nome2=https://link2\`\n` +
      '1 a 3 botões de link, iguais aos dos posts de canal · foto opcional (responde a uma foto).\n' +
      `Para a onda inteira: \`${p}divulgarcartao [invisivel] …\``);
    const midia = await _mediaDe(msg, 'foto', '');
    try {
      const { sendUrlButtons } = require('../buttonHandler');
      await sendUrlButtons(sock, _alvo(ctx), parsed.titulo, '☣️ DARKTOXIC', parsed.links, null, midia ? { image: midia.image } : {});
    } catch {
      const linhas = parsed.links.map((l) => `🔗 ${l.text}: ${l.url}`).join('\n');
      await sock.sendMessage(_alvo(ctx), { text: `${parsed.titulo}\n\n${linhas}` }).catch(() => {});
    }
  });

  // contato (vcard pelo número) + localização (lat,lon)
  registerCase(['divulgarcontato', 'ondacontato'], async ({ sock, msg, ctx, args, isOwner, reply }) => {
    if (!isOwner) return deny(reply);
    const p = ctx.prefix || config.bot.prefix || '!';
    const numero = String(args[0] || '').replace(/\D/g, '');
    if (!numero || numero.length < 8) return reply(`☣️ \`${p}divulgarcontato <número> <nome...>\` — envia um cartão de contato pela onda.`);
    const nome = args.slice(1).join(' ').trim() || 'Contacto';
    const vcard =
      'BEGIN:VCARD\nVERSION:3.0\n' +
      `FN:${nome}\nTEL;type=CELL;type=VOICE;waid=${numero}:+${numero}\nEND:VCARD`;
    const mensagem = {
      contacts: { displayName: nome, contacts: [{ vcard }] },
    };
    await _onda(sock, msg, ctx, async () => ({ content: mensagem }), 'sem', 'contato');
  });

  registerCase(['divulgarloc', 'ondaloc'], async ({ sock, msg, ctx, args, isOwner, reply }) => {
    if (!isOwner) return deny(reply);
    const p = ctx.prefix || config.bot.prefix || '!';
    const m = String(args.join(' ')).match(/(-?\d+\.\d+)[\s,]+(-?\d+\.\d+)/);
    if (!m) return reply(`☣️ \`${p}divulgarloc <lat,lon> [nome]\` — ex.: \`${p}divulgarloc -8.838333,13.234444 Luanda\`.`);
    const nomeL = args.join(' ').replace(m[0], '').trim() || 'Localização';
    await _onda(sock, msg, ctx, async () => ({
      content: { location: { degreesLatitude: Number(m[1]), degreesLongitude: Number(m[2]), name: nomeL } },
    }), 'sem', 'localização');
  });

  // ── SEU BOT + PLANO ──
  registerCase(['conectarbot'], async ({ sock, msg, ctx, args, isOwner, reply }) => {
    if (!isOwner) return deny(reply);
    const bcc = require('../botConfigCache');
    const num = String(args[0] || '').replace(/\D/g, '');
    const p = ctx.prefix || config.bot.prefix || '!';
    if (!num || num.length < 9) return reply(`☣️ \`${p}conectarbot 55DDDNUMERO\` — regista o número do teu bot cliente.`);
    await _set(bcc, `bot_${_num(ctx.senderNumber)}`, { numero: num, ligado: new Date().toISOString(), ativo: true });
    return reply(_dtox('B O T  D O  C L I E N T E', [
      `📱 Número registado: *+${num}*`,
      '🔌 Estado: *registado / ativo*',
      `Estado completo: \`${p}meubot\` · desligar: \`${p}desconectarbot\``,
    ]));
  });

  registerCase(['meubot'], async ({ sock, msg, ctx, isOwner, reply }) => {
    if (!isOwner) return deny(reply);
    const bcc = require('../botConfigCache');
    const own = _num(ctx.senderNumber);
    const bot = await _get(bcc, `bot_${own}`);
    const grupos = (await _get(bcc, `grupos_${own}`)) || [];
    const delay = Number(await _get(bcc, `delay_${own}`)) || 1200;
    const hist = (await _get(bcc, `hist_${own}`)) || [];
    const ondasOk = hist.reduce((a, h) => a + (h.feitos || 0), 0);
    return reply(_dtox('O  T E U   B O T', [
      `📱 Número: ${bot ? `+*${bot.numero}*` : '(não registado — `!conectarbot`)'}`,
      `🔌 Estado: ${bot?.ativo ? '*ATIVO*' : 'desligado'}`,
      '🤖 Bot mestre: online ⏱️ ' + Math.floor(process.uptime() / 60) + 'min',
      '',
      `📦 Grupos da onda: *${grupos.length}* · delay *${delay}ms*`,
      `📊 Ondas na história: *${hist.length}* · total entregue: *${ondasOk}*`,
    ]));
  });

  registerCase(['desconectarbot'], async ({ sock, msg, ctx, isOwner, reply }) => {
    if (!isOwner) return deny(reply);
    const bcc = require('../botConfigCache');
    const own = _num(ctx.senderNumber);
    const bot = await _get(bcc, `bot_${own}`);
    if (!bot) return reply('☣️ Não tens bot registado — nada a desconectar.');
    bot.ativo = false; bot.desligado = new Date().toISOString();
    await _set(bcc, `bot_${own}`, bot);
    return reply(_dtox('D E S C O N E C T A D O', ['🔌 Bot do cliente desligado.', `Religar: \`${ctx.prefix || config.bot.prefix}conectarbot ${bot.numero}\``]));
  });

  registerCase(['aluguel'], async ({ sock, msg, ctx, isOwner, reply }) => {
    if (!isOwner) return deny(reply);
    const p = ctx.prefix || config.bot.prefix || '!';
    return reply(_dtox('P L A N O S  D E  A L U G U E L', [
      '⭐ *7 dias* — entrada, testa a máquina',
      '💎 *30 dias* — cliente oficial, suporte VIP',
      '🏆 *90 dias* — melhor custo/benefício + extras',
      '',
      `Comprar: \`${p}alugar\` · estado: \`${p}statusalugar\``,
    ]));
  });
};

// ════════════════════════════════════════════════════════════
// ASSISTENTE ESCRITO — consumir() é chamado pelo commandHandler
// em TODA mensagem; só actua quando há sessão viva (chat+dono).
// Passos: texto → vezes(1-10) → cartão de grupos → visivel/invisivel
// Em qualquer altura: `.cancelar` / `cancelar` aborta.
// ════════════════════════════════════════════════════════════
async function consumir(sock, msg, ctx, text) {
  let key = _kFluxo(ctx);
  let sess = _FLUXO.get(key);
  // v9.14: assistente arranca no grupo mas fala no PV — se o dono
  // respondeu no privado dele, a sessão migra (ADM continua cego).
  if (!sess && ctx.remoteJid === _pv(ctx)) {
    const alvoNum = `|${_num(ctx.senderNumber)}`;
    for (const [k, s2] of _FLUXO) {
      if (k.endsWith(alvoNum)) { _FLUXO.delete(k); sess = s2; _FLUXO.set(key, s2); break; }
    }
  }
  if (!sess) return false;
  if (Date.now() > sess.expira) { _FLUXO.delete(key); return false; }
  // v9.18: o consumir corre fora do wrapper — veste o tema do dono à mão
  try {
    if (!_TEMA_CACHE.has(String(sess.own))) _TEMA_CACHE.set(String(sess.own), (await _get(require('../botConfigCache'), `tema_${sess.own}`)) || 'darktoxic');
    _TEMA_ATUAL = _tema(sess.own);
  } catch {}
  const alvo = sess.alvo || ctx.remoteJid;   // respostas sempre no PV/quando começou

  // é subcomando real com prefixo (ex.: !divulgarhistorico)? Não toca —
  // excepto o cancelar universal (esse trava tudo, com ou sem prefixo).
  const raw = String(text || '').trim();
  const t = raw.toLowerCase().replace(/^[.!·/#]+/, '');
  if (/^cancel(ar|e)$/.test(t)) {
    // v9.18 🔏 abortar limpa o rasto: as passadas escritas no grupo somem-se
    for (const k2 of (sess.k || [])) await _apagar(sock, k2.remoteJid || ctx.remoteJid, k2);
    await _apagar(sock, ctx.remoteJid, msg.key);
    _FLUXO.delete(key);
    await sock.sendMessage(alvo, {
      text: _dtox('A S S I S T E N T E  A B O R T A D O', ['🛑 Saíste do assistente de divulgação. Nada foi enviado.']),
    }).catch(() => {});
    return true;
  }
  if (/^[.!·/#]/.test(raw)) return false;   // comandos reais passam sempre
  if (!raw && sess.passo !== 'texto') return false;
  sess.expira = Date.now() + TTL_FLUXO;
  // v9.18 🔏 guarda a pegada deste passo (key) — se o dono escolher INVISÍVEL
  // (ou abortar), apagamos tudo o que ele teclou no grupo: texto, números,
  // a palavra «invisivel» e as próprias fotos/vídeos que citou.
  if (ctx.isGroup && msg && msg.key) {
    (sess.k = sess.k || []).push({ ...(msg.key), remoteJid: msg.key.remoteJid || ctx.remoteJid });
    if (sess.k.length > 6) sess.k.shift();
  }

  // ── PASSO 1/4: o texto chega livre ──
  if (sess.passo === 'texto') {
    // mídia com legenda conta como texto (a onda não sai ainda)
    if (!raw) return true;
    sess.texto = raw.slice(0, 4000); sess.passo = 'vezes';
    await sock.sendMessage(alvo, {
      text:
        '✅ *TEXTO SALVO COM SUCESSO!*\n\n' +
        `📝 *Prévia:*\n> ${sess.texto.slice(0, 140)}${sess.texto.length > 140 ? '…' : ''}\n\n` +
        '✨ *Passo 2/4 — Quantas VEZES enviar?*\n' +
        '🔁 Escreve um número de *1 a 10*\n' +
        '`1` = envia 1x, `5` = envia 5x **em cada grupo**\n\n' +
        '❌ `.cancelar` para cancelar',
    }, { quoted: msg }).catch(() => {});
    return true;
  }

  // ── PASSO 2/4: vezes 1-10 ──
  if (sess.passo === 'vezes') {
    const n = /^0?(\d{1,2})$/.test(t) ? Math.min(10, Math.max(1, parseInt(t, 10))) : 0;
    if (!n) {
      await sock.sendMessage(alvo, {
        text: '🔁 Só aceito um número de *1 a 10* — escreve o número (ou `.cancelar`).',
      }).catch(() => {});
      return true;
    }
    sess.vezes = n; sess.passo = 'vis';
    const bcc = require('../botConfigCache');
    const grupos = (await _get(bcc, `grupos_${sess.own}`)) || [];
    const nomes = grupos.slice(0, 15).map(g => `• ${g.nome}`);
    if (grupos.length > 15) nomes.push(`• ... e mais ${grupos.length - 15} grupos`);
    await sock.sendMessage(alvo, {
      text:
        '✨━━━━━━━━━━━━━━━━━━━━✨\n' +
        `✅  *GRUPOS SELECIONADOS: ${grupos.length}*\n` +
        '✨━━━━━━━━━━━━━━━━━━━━✨\n\n' +
        `📝 Texto: ${sess.texto.slice(0, 60)}${sess.texto.length > 60 ? '…' : ''}\n` +
        `🔁 Vezes: *${n}x*\n` +
        `📦 Grupos: *${grupos.length}* (seus, isolado)\n\n` +
        nomes.join('\n') + '\n\n' +
        '✨  *Passo 4/4 — VISÍVEL OU INVISÍVEL?*\n\n' +
        '👁️  Escreve *visivel* = marca TODOS no grupo (hidetag à vista — o ADM vê)\n' +
        '👁️‍🗨️  Escreve *invisivel* = marca TODOS MENOS ADM — eles não recebem nada,\n' +
        '      hidetag limpa + texto único por grupo (bypass activo)\n\n' +
        '💡 *Diferença:*\n' +
        '• Visível: todos mencionados, ADM recebe notificação\n' +
        '• Invisível: só membros mencionados, ADM nem desconfia\n\n' +
        '❌ `.cancelar` para cancelar\n' +
        '✨━━━━━━━━━━━━━━━━━━━━✨',
    }, { quoted: msg }).catch(() => {});
    return true;
  }

  // ── PASSO 3/4 (o 4º da referência): visiblidade ──
  if (sess.passo === 'vis') {
    const vis = /^invis|^i$/.test(t) ? 'invisivel' : /^vis|^v$/.test(t) ? 'visivel' : '';
    if (!vis) {
      await sock.sendMessage(alvo, {
        text: '👁️ Escreve *visivel* ou *invisivel* — ou `.cancelar` para abortar.',
      }).catch(() => {});
      return true;
    }
    _FLUXO.delete(key);
    const texto = sess.texto, vezes = sess.vezes || 1;
    // v9.18 🔏 INVISÍVEL = zero rasto: apaga TODAS as passadas do assistente
    if (vis === 'invisivel') {
      for (const k2 of (sess.k || [])) await _apagar(sock, k2.remoteJid || ctx.remoteJid, k2);
      await _apagar(sock, ctx.remoteJid, msg.key);
    }
    await _onda(sock, msg, ctx, async (_g, tag, mencoes) => ({
      content: { text: await _corpoDesp(texto, vis, tag, _num(ctx.senderNumber)), mentions: mencoes },
    }), vis, 'assistente', vezes);
    return true;
  }

  return false;
}

module.exports.consumir = consumir;
// v9.15 — ganchos de teste (giro/agenda), sem expor nada ao runtime
module.exports.__test = { _corpoDesp, _msProximaHora, _armar, _AGENDADOS, _GIRO_IDX, _parseCartao };
