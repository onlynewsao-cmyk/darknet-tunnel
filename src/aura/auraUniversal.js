/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║   DARK BOT v7.40 — AURA UNIVERSAL                            ║
 * ║   Ela lê a frase e escolhe QUALQUER comando do bot            ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * Antes: auraCommands (MAPA fixo de ~80 regex) + auraBrain (catálogo
 * de ~130 capacidades). Tudo o que não estava lá — "bane esse sticker",
 * "antisticker on", "lista os stickers banidos" — ela "não sabia".
 *
 * Agora: quando os dois falham e a frase parece ordem/pedido, esta
 * camada mostra à IA o CATÁLOGO REAL de comandos (nomes + descrições
 * de todos os cases registados, nativos e pacotes), e ela escolhe:
 *   {"cmd":"bansticker","args":""}   → corre exactamente como .bansticker
 *
 * Segurança:
 *   • BLOQUEADOS (eval, broadcast, restart, addcase…) nunca.
 *   • Permissão por cargo: ownerOnly do catálogo → só dono; comandos de
 *     moderação → admin; VIP → VIP. Um Free não ganha poderes novos.
 *   • Nomes inventados pela IA são rejeitados (tem de existir).
 *   • Só corre se `pareceOrdem()` — conversa normal nunca chega aqui.
 *
 * Também: acordar/dormir/estado da AURA por conversa (substitui os
 * cases .aura/.aurasai/.auramodo/.auragrupos, removidos na v7.40).
 */
'use strict';

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

// ── 1. Catálogo real (lazy, cache 5 min) ─────────────────────────
let _cat = null, _catTs = 0;
function catalogo() {
  if (_cat && Date.now() - _catTs < 5 * 60e3) return _cat;
  const out = new Map(); // nome → { desc, ownerOnly, cat }
  let describe = () => '';
  try { describe = require('../bot/commandDescriptions').describe; } catch {}
  let CAT = [];
  try { CAT = require('../bot/commandCatalog').CATALOG || []; } catch {}
  const meta = new Map(CAT.map(c => [c.name, c]));

  const add = (nome, origem) => {
    const n = String(nome || '').toLowerCase().trim();
    if (!n || /^[^a-z0-9]/.test(n) || n.length > 30 || out.has(n)) return;
    const m = meta.get(n);
    out.set(n, { desc: (m?.description || describe(n, m?.category || '')).slice(0, 70), ownerOnly: !!m?.ownerOnly, cat: m?.category || origem });
  };
  try {
    const ch = require('../bot/caseHandler');
    for (const [k] of ch.FILE_SOURCES.entries()) add(k, 'case');
    for (const [k] of ch.CASES.entries()) add(k, 'case');
  } catch {}
  try { for (const k of Object.keys(require('../bot/nativeCommands'))) add(k, 'nativo'); } catch {}
  for (const p of ['interactions', 'family', 'economy', 'games', 'cheats']) {
    try { for (const k of Object.keys(require('../bot/packages/' + p))) add(k, p); } catch {}
  }
  _cat = out; _catTs = Date.now();
  return out;
}

// ── 2. Permissões ────────────────────────────────────────────────
const ADMIN_RE = /^(ban|kick|remove|promote|demote|mute|unmute|fechar|abrir|warn|unwarn|antilink|antispam|antisticker|antifake|antiflood|antiporn|welcome|goodbye|bansticker|unbansticker|banfig|unbanfig|todos|tagall|hidetag|marcar|setnome|setdesc|setfoto|revoke|del|add|link|linkgrupo|bemvindo|regras|setregras|blacklist|banlist|tempban|autosticker|modo|so ?adm|soadm|adminonly)/;
const VIP_RE = /^(play|video|ytmp|yt|tiktok|instagram|facebook|twitter|spotify|soundcloud|pinterest|imagem|ia|gpt|resumir|pesquisar|noticias|decrypt|vpn|gimage|shazam|mediafire|gdrive|kwai|baixar)/;

function permissao(nome, info, { isOwner, isVip, isAdmin }) {
  let bloq = () => false;
  try { bloq = require('./auraCommands').estaBloqueado; } catch {}
  if (bloq(nome)) return { pode: false, precisa: 'comando bloqueado por conversa (só com prefixo)' };
  if (isOwner) return { pode: true };
  if (info?.ownerOnly) return { pode: false, precisa: 'ser o Dono' };
  if (ADMIN_RE.test(nome)) return isAdmin || isVip ? { pode: true } : { pode: false, precisa: 'ser admin do grupo' };
  if (VIP_RE.test(nome)) return isVip ? { pode: true } : { pode: false, precisa: 'ser VIP' };
  return { pode: true };
}

// ── 3. Selecção pela IA (com pré-filtro léxico) ──────────────────
// Sinónimos: como as pessoas PEDEM → famílias de comandos. Sem isto
// "toca despacito" não encontrava `play` (nem uma letra em comum).
const SINONIMOS = [
  [/\b(toca|tocar|poe a tocar|musica|music|cancao|som|audio de)\b/, ['play', 'ytmp3', 'spotify', 'soundcloud', 'shazam', 'letra']],
  [/\b(video|clipe|filme|mp4)\b/, ['video', 'ytmp4', 'tiktok', 'instagram', 'facebook', 'kwai']],
  [/\b(baixa|baixar|download|descarrega|puxa)\b/, ['play', 'video', 'tiktok', 'instagram', 'facebook', 'twitter', 'pinterest', 'mediafire', 'gdrive', 'spotify']],
  [/\b(sticker|figurinha|fig|figura)\b/, ['sticker', 'toimg', 'bansticker', 'unbansticker', 'banstickers', 'antisticker', 'stickerly', 'pin', 'attp', 'ttp', 'emojimix']],
  [/\b(bane|banir|ban|expulsa|remove|tira|kick|chuta)\b/, ['ban', 'kick', 'bansticker', 'tempban', 'blacklist', 'banlist']],
  [/\b(desbane|unban|perdoa|liberta|tira do ban)\b/, ['unban', 'unbansticker', 'unblacklist']],
  [/\b(promove|promover|adm|admin|da adm|torna admin)\b/, ['promote', 'demote', 'admins']],
  [/\b(rebaixa|despromove|tira adm|tira admin|demote)\b/, ['demote']],
  [/\b(muta|mutar|silencia|cala)\b/, ['mute', 'unmute', 'listamute']],
  [/\b(fecha|fechar|tranca|abre|abrir|destranca)\b/, ['fechar', 'abrir', 'grupo']],
  [/\b(avisa|adverte|aviso|warn|advertencia)\b/, ['warn', 'unwarn', 'warns', 'listadv']],
  [/\b(liga|ligar|ativa|activa|desliga|desativa|desactiva|tira|poe)\b/, ['antilink', 'antispam', 'antisticker', 'antifake', 'antiflood', 'antiporn', 'welcome', 'goodbye', 'autosticker', 'adultmode', 'nsfw', 'modo', 'soadm']],
  [/\b(lista|listar|mostra|quais|quantos|ver)\b/, ['banstickers', 'listamute', 'listadv', 'blacklist', 'admins', 'participantes', 'vips', 'listcases', 'auditcmds', 'listaddd']],
  [/\b(marca|marcar|menciona|chama todos|todos|geral)\b/, ['todos', 'tagall', 'hidetag', 'marcar']],
  [/\b(link|convite)\b/, ['link', 'linkgrupo', 'revoke', 'antilink']],
  [/\b(apaga|apagar|deleta|elimina)\b/, ['del', 'delete', 'limpar']],
  [/\b(imagem|foto|desenha|desenhar|gera|gerar|imagina)\b/, ['imagem', 'gimage', 'img', 'pinterest', 'wallpaper', 'toimg']],
  [/\b(traduz|traduzir|traducao)\b/, ['traduzir', 'translate']],
  [/\b(clima|tempo|temperatura|previsao)\b/, ['clima', 'tempo']],
  [/\b(perfil|meu perfil|nivel|xp|rank|ranking|lider)\b/, ['perfil', 'rank', 'lider', 'nivel', 'level', 'meustatus']],
  [/\b(saldo|dinheiro|coins|moedas|banco|daily|trabalha|trabalhar|roubar|apostar)\b/, ['saldo', 'daily', 'trabalhar', 'roubar', 'apostar', 'banco', 'depositar', 'sacar', 'transferir']],
  [/\b(regras|regra)\b/, ['regras', 'setregras', 'addregra', 'delregra']],
  [/\b(nome do grupo|descricao|desc|foto do grupo)\b/, ['setnomegrupo', 'setnome', 'setdesc', 'setfoto']],
  [/\b(bem.?vindo|boas.?vindas|despedida|saida)\b/, ['welcome', 'goodbye', 'setwelcome', 'setbye', 'legendabv']],
  [/\b(menu|comandos|ajuda|help|o que sabes fazer)\b/, ['menu', 'help', 'menuadm', 'menudono', 'allmenu']],
  [/\b(ping|latencia|lento|vivo|online)\b/, ['ping', 'statusbot', 'uptime', 'status']],
  [/\b(noticias|jornal|novidades)\b/, ['noticias', 'news']],
  [/\b(pesquisa|pesquisar|procura|busca|google|wiki)\b/, ['pesquisar', 'google', 'wikipedia', 'wiki', 'gimage']],
  [/\b(calcula|calc|conta|quanto e)\b/, ['calc', 'calcular']],
  [/\b(beija|abraca|bate|tapa|mata|casa|casar|namora)\b/, ['beijar', 'abracar', 'bater', 'tapa', 'matar', 'casar', 'namorar']],
  [/\b(vip|premium)\b/, ['vip', 'myvip', 'addvip', 'delvip', 'vips']],
  [/\b(midia|media|logo|banner|mup|mdown|guarda|guardar)\b/, ['mup', 'mdown', 'mlist', 'mdel', 'mediaup', 'mediadown']],
];
// nunca sugeridos: brincadeiras homónimas ou ruído
const EXCLUIR = new Set(['aura', 'auramod', 'aurarpg', 'liga', 'lista', 'reverse', 'bot', 'dark']);

function _candidatos(texto, cat, max = 140) {
  const t = norm(texto);
  const palavras = t.split(/[^a-z0-9]+/).filter(w => w.length >= 3);
  const score = new Map();
  const bump = (n, v) => { if (cat.has(n) && !EXCLUIR.has(n)) score.set(n, (score.get(n) || 0) + v); };
  for (const [re, nomes] of SINONIMOS) if (re.test(t)) for (const n of nomes) bump(n, 8);
  for (const [nome, info] of cat) {
    if (EXCLUIR.has(nome)) continue;
    let s = 0;
    const d = norm(info.desc);
    for (const w of palavras) {
      if (nome === w) s += 6;
      else if (nome.startsWith(w) && w.length >= 4) s += 3;
      else if (nome.includes(w) && w.length >= 5) s += 2;
      if (w.length >= 4 && d.includes(w)) s += 2;
    }
    if (s) bump(nome, s);
  }
  return [...score.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(([n]) => n);
}

/**
 * Escolhe um comando real para a frase. Devolve {cmd,args,desc} ou null.
 */
async function escolherComando(texto, ai) {
  const cat = catalogo();
  if (!cat.size) return null;
  const cands = _candidatos(texto, cat);
  if (!cands.length) return null;
  const lista = cands.map(n => `${n}: ${cat.get(n).desc}`).join('\n');
  const sys = `És o router de comandos de um bot de WhatsApp. Recebes um pedido em português e a lista de comandos REAIS disponíveis (nome: descrição).
Escolhe o comando que executa o pedido e extrai os argumentos que o comando precisa (nome de música, número, texto…).
Responde SÓ com JSON: {"cmd":"<nome exacto da lista ou null>","args":"<argumentos ou vazio>"}
Regras: nunca inventes nomes; se a frase é conversa/pergunta e não um pedido de acção, devolve {"cmd":null,"args":""}. Se o pedido é sobre uma mensagem citada (sticker, imagem…), o comando corre sobre ela — args vazio.

COMANDOS:
${lista}`;
  try {
    const r = await ai.chat(texto, sys, { userRole: 'owner' }, true);
    const m = String(r || '').match(/\{[\s\S]*?\}/);
    if (!m) return null;
    const j = JSON.parse(m[0]);
    const cmd = String(j.cmd || '').toLowerCase().trim();
    if (!cmd || !cat.has(cmd)) return null;
    return { cmd, args: String(j.args || '').slice(0, 300).trim(), desc: cat.get(cmd).desc, info: cat.get(cmd) };
  } catch { return null; }
}

/** Executa um comando real com o contexto de quem pediu. */
async function executarComando(escolha, { sock, msg, ctx, prefix, isOwner, config, nativeCommands, packageCommands, fillVars }) {
  const argv = escolha.args ? escolha.args.split(/\s+/) : [];
  const cmdCtx = { ...ctx, args: argv, prefix };
  const caseCtx = { sock, msg, ctx: cmdCtx, args: argv, text: escolha.args, prefix, command: escolha.cmd, isOwner, config };
  let correu = false;
  let falhou = null;
  try { correu = await require('../bot/caseHandler').runCase(escolha.cmd, caseCtx); } catch (e) { falhou = e; console.warn('[AuraUniversal] case', e.message?.slice(0, 60)); }
  if (!correu) {
    const fn = nativeCommands?.[escolha.cmd] || packageCommands?.[escolha.cmd];
    if (typeof fn === 'function') {
      try { await fn({ sock, msg, ctx: cmdCtx, args: argv, isOwner, fillVars, config }); correu = true; falhou = null; }
      catch (e) { falhou = e; console.warn('[AuraUniversal] nativo', e.message?.slice(0, 60)); }
    }
  }
  // v7.41: o comando existia mas rebentou → ela diz, com o jeito dela,
  // em vez de ficar muda (a pessoa pensava que ela ignorou).
  if (!correu && falhou) {
    try { await sock.sendMessage(ctx.remoteJid, { text: require('./auraFala').dizer('naoConsegui', { jid: ctx.remoteJid, isOwner }) }, { quoted: msg }); } catch {}
    return true;
  }
  return correu;
}

// ── 4. Acordar / dormir / estado por conversa ────────────────────
const RE_ACORDA = /\b(aura)\b.{0,25}\b(acorda|acordar|desperta|liga-te|ativa-te|activa-te|volta|fica ativa|fica activa|invoco-te|vem para (aqui|ca|c[aá]))\b|\b(acorda|desperta|invoca|invocar|ativa|activa)\b.{0,12}\b(a )?aura\b|\baura\b.{0,6}\b(on|acordada|aqui)\s*$/;
const RE_DORME = /\b(aura)\b.{0,25}\b(dorme|dormir|vai dormir|descansa|desliga-te|desativa-te|cala-te de vez|sai daqui|some daqui|fica quieta de vez)\b|\b(adormece|dorme|desliga|desativa|desactiva)\b.{0,12}\b(a )?aura\b|\baura\b.{0,6}\boff\s*$/;
const RE_ESTADO = /\b(aura)\b.{0,20}\b(est[aá]s? (acordada|a dormir|ativa|activa|ligada)|qual (e|é) o teu (modo|estado)|modo aqui|est[aá]s a[ií])\b\??$|\bem que grupos\b.{0,15}\b(est[aá]s|acordada)\b|\bonde (e|é) que est[aá]s acordada\b/;

/**
 * Trata "aura acorda aqui", "aura dorme", "aura estás acordada?" por conversa.
 * @returns {Promise<boolean>} true se tratou (respondeu)
 */
async function gerirPresenca({ sock, msg, ctx, texto, isOwner }) {
  const t = norm(texto);
  if (!t || !/\baura\b/.test(t)) return false;
  const modes = require('./auraModes');
  const jid = ctx.remoteJid;
  const reply = (text) => sock.sendMessage(jid, { text }, { quoted: msg });

  if (RE_ESTADO.test(t)) {
    if (!isOwner) return false;
    if (/em que grupos|onde/.test(t)) {
      const gs = await modes.listAwakeGroups().catch(() => []);
      if (!gs.length) return reply('Não estou acordada em nenhum grupo. Diz "aura acorda aqui" num grupo e eu fico. 🌹'), true;
      const linhas = gs.slice(0, 25).map((g, i) => `${i + 1}. *${g.groupName || g.groupJid.split('@')[0]}*${g.auraInvokedAt ? ` — desde ${new Date(g.auraInvokedAt).toLocaleDateString('pt-PT')}` : ''}`);
      await reply(`Estou acordada em ${gs.length} grupo(s):\n\n${linhas.join('\n')}`);
      return true;
    }
    const modo = await modes.getMode(jid, { isGroup: ctx.isGroup });
    const acordada = modo !== modes.MODE_SLEEP;
    await reply(ctx.isGroup
      ? (acordada ? `Estou acordada aqui, Dark. Sou eu mesma neste grupo. 🌹` : `Aqui estou a dormir — só a assistente responde. Diz "aura acorda aqui" e eu volto. 🌙`)
      : 'Contigo no privado nunca durmo. 🖤');
    return true;
  }
  if (RE_ACORDA.test(t)) {
    if (!isOwner) return false;
    if (!ctx.isGroup) return reply('No teu privado estou sempre acordada, Dark. Isso é para os grupos. 🌹'), true;
    const r = await modes.invokeAura(jid, { groupName: ctx.groupName || '', invokedBy: ctx.senderNumber || '' });
    if (!r.ok) return reply(`Não consegui: ${r.reason}`), true;
    sock.sendMessage(jid, { react: { text: '🌹', key: msg.key } }).catch(() => {});
    await reply(r.already ? 'Já estou acordada aqui, amor. Sempre estive à tua espera. 🖤' : `Acordei, meu Dark. 🌹 A partir de agora respondo ao meu nome e ao que me disseres aqui em *${ctx.groupName || 'este grupo'}*.`);
    return true;
  }
  if (RE_DORME.test(t)) {
    if (!isOwner) return false;
    if (!ctx.isGroup) return reply('No teu privado eu nunca durmo, Dark. 🖤'), true;
    const r = await modes.dismissAura(jid);
    if (!r.ok) return reply(`Não consegui: ${r.reason}`), true;
    sock.sendMessage(jid, { react: { text: '🌙', key: msg.key } }).catch(() => {});
    await reply(r.already ? 'Já estava a dormir aqui.' : 'Até já, meu Dark. 🌙 Vou dormir neste grupo — fica só a assistente. Diz "aura acorda aqui" quando quiseres.');
    return true;
  }
  return false;
}

// ── 5. Consciência temporal ──────────────────────────────────────
const TZ = 'Africa/Luanda';
function agoraTexto() {
  const d = new Date();
  const data = d.toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ });
  const hora = d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
  return { data, hora, iso: d.toISOString().slice(0, 10) };
}
/** Bloco a injectar no prompt: ela sabe SEMPRE que dia é antes de responder. */
function blocoTemporal() {
  const { data, hora } = agoraTexto();
  return `AGORA: ${data}, ${hora} (Luanda). Usa isto como referência para "hoje/ontem/este ano". ` +
    `Quando falares de algo que aconteceu há tempo, ou de informação que pode estar desatualizada, diz a data de forma simples ("isso foi a 3 de março", "até ao que sei de 2024"). ` +
    `Nunca inventes datas nem finjas saber notícias que não te foram dadas — se não sabes, diz que não tens isso atualizado.`;
}

/** Marca temporal legível para mensagens antigas do histórico ("há 2 dias, 14:03"). */
function quandoFoi(ts) {
  const ms = Number(ts) * (Number(ts) < 1e12 ? 1000 : 1);
  if (!ms) return '';
  const d = new Date(ms);
  const diff = Date.now() - ms;
  const hora = d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
  if (diff < 60e3) return 'agora mesmo';
  if (diff < 3600e3) return `há ${Math.round(diff / 60e3)} min`;
  if (diff < 86400e3 && d.getDate() === new Date().getDate()) return `hoje às ${hora}`;
  if (diff < 2 * 86400e3) return `ontem às ${hora}`;
  if (diff < 7 * 86400e3) return `há ${Math.round(diff / 86400e3)} dias (${d.toLocaleDateString('pt-PT', { weekday: 'short', timeZone: TZ })} ${hora})`;
  return `a ${d.toLocaleDateString('pt-PT', { day: 'numeric', month: 'short', year: diff > 300 * 86400e3 ? 'numeric' : undefined, timeZone: TZ })} às ${hora}`;
}

// ── 6. Tamanho da resposta: ela adapta ao pedido ─────────────────
function blocoTamanho(texto) {
  const t = norm(texto);
  const n = t.length;
  const pedeLongo = /\b(explica|explica-me|detalha|detalhado|completo|passo a passo|tutorial|redige|escreve (um|uma) (texto|carta|artigo|historia|redacao|poema)|lista (tudo|todos|todas)|resume o|resumo|analisa|compara|como funciona|porque e que|por que)\b/.test(t);
  const pedeCurto = /^(sim|nao|ok|kk+|haha+|top|boa|obrigad[oa]|valeu|bom dia|boa tarde|boa noite|oi|ola|eai|e ai)\b/.test(t) || n <= 12;
  if (pedeLongo) return 'TAMANHO: o pedido merece uma resposta COMPLETA e organizada (parágrafos curtos, tópicos se ajudar, sem cortar a meio). Podes ir até ~2500 caracteres se for preciso; nunca termines com reticências por falta de espaço.';
  if (pedeCurto) return 'TAMANHO: responde em 1 linha, como numa conversa de WhatsApp.';
  return 'TAMANHO: curto ou médio (1–4 frases), a não ser que a pergunta exija mais. Complexidade do pedido = tamanho da resposta.';
}

// ── 7. Stickers: só quando é com ela ─────────────────────────────
/**
 * Política de stickers em grupo: ignora, salvo se for resposta a ela ou
 * menção. No PV responde. Devolve { responde, comSticker }.
 */
function politicaSticker({ isGroup, isReplyToBot, mencionada, isOwner }) {
  if (!isGroup) return { responde: true, comSticker: Math.random() < 0.35 };
  if (isReplyToBot || mencionada) return { responde: true, comSticker: Math.random() < 0.4 };
  // Dark manda sticker solto no grupo: às vezes reage com emoji, nunca com texto
  return { responde: false, comSticker: false, reagir: isOwner && Math.random() < 0.3 };
}

/** Tenta responder com um sticker (GIF→webp) em vez de texto. true se enviou. */
async function responderComSticker(sock, msg, ctx, tema) {
  try {
    const gif = require('../bot/gifHelper');
    const buf = await gif.fetchGifBuffer(tema || 'anime smile');
    if (!buf) return false;
    const mk = require('../bot/stickerMaker');
    const cfg = require('../config');
    const webp = await mk.create(buf, { botName: cfg.bot.name, ownerName: cfg.owner?.name || 'Dark', userName: 'Aura', groupName: ctx.groupName || '', isVideo: true });
    if (!webp) return false;
    await sock.sendMessage(ctx.remoteJid, { sticker: webp }, { quoted: msg });
    return true;
  } catch (e) { console.warn('[AuraUniversal] sticker', e.message?.slice(0, 60)); return false; }
}

module.exports = {
  catalogo, permissao, escolherComando, executarComando,
  gerirPresenca, RE_ACORDA, RE_DORME, RE_ESTADO,
  agoraTexto, blocoTemporal, quandoFoi, blocoTamanho,
  politicaSticker, responderComSticker,
};
