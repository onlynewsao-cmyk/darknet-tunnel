'use strict';
/**
 * AURA CÉREBRO (v7.37) — a IA liga-se às FUNCIONALIDADES e APRENDE.
 *
 * Antes: o catálogo (auraBrain) e os comandos (auraCommands) eram
 * detectados por regex ANTES da IA; a IA em si só "conversava" e só
 * podia disparar um [CMD:] se fosse o Dark. Resultado: pedidos ditos
 * de forma diferente da regex caíam em conversa fiada.
 *
 * Agora:
 *  1. FERRAMENTAS NO PROMPT — a IA recebe a lista do que sabe fazer
 *     (capacidades do auraBrain + comandos do auraCommands) filtrada
 *     pelo cargo de quem fala, e pode responder com
 *        [FAZ:<id> <argumento>]
 *     O handler executa via auraExec (capacidades) ou caseHandler
 *     (comandos), com as MESMAS permissões de sempre.
 *  2. APRENDIZAGEM AUTÓNOMA — depois de cada conversa, a IA pode
 *     anotar [APRENDI:<facto curto>] (sobre a pessoa) ou
 *     [APRENDI_GRUPO:<facto>] (sobre o chat). Guardado em BotConfig
 *     (auraMemory / aura_saber_<jid>) e reinjectado no prompt seguinte.
 *  3. AUTO-APRENDIZAGEM DE ATALHOS — quando o Dark corrige
 *     ("quando digo X faz Y") já existe o rulesEngine; aqui apenas
 *     lembramos à IA que ela pode sugerir ao Dark ensinar uma regra.
 */

const RE_FAZ = /\[\s*FAZ\s*:\s*([a-z_]+)(?:\s+([^\]]{0,200}))?\s*\]/gi;
const RE_APRENDI = /\[\s*APRENDI\s*:\s*([^\]]{3,160})\s*\]/gi;
const RE_APRENDI_GRUPO = /\[\s*APRENDI_GRUPO\s*:\s*([^\]]{3,160})\s*\]/gi;

// Comandos (auraCommands) que a IA pode invocar por [FAZ:cmd_<nome>].
// Curto de propósito: são os que fazem sentido em conversa.
const CMDS_IA = {
  play: 'tocar/enviar música (arg: nome da música)',
  sticker: 'fazer figurinha da imagem/vídeo citado',
  menu: 'mostrar o menu do bot',
  ping: 'ver se o bot está vivo / latência',
  saldo: 'ver saldo/moedas da pessoa',
  perfil: 'mostrar o perfil da pessoa',
  clima: 'ver o tempo numa cidade (arg: cidade)',
  traduzir: 'traduzir texto (arg: idioma texto)',
  ban: 'remover a pessoa citada/mencionada do grupo',
  promover: 'dar admin à pessoa citada/mencionada',
  rebaixar: 'tirar admin à pessoa citada/mencionada',
  fechar: 'fechar o grupo (só admins falam)',
  abrir: 'abrir o grupo',
  link: 'enviar o link do grupo',
  marcar: 'mencionar toda a gente do grupo (arg: mensagem)',
  apagar: 'apagar a mensagem citada',
  cap: 'C∆P — Instagram: ver perfil/stories/posts (arg: ver @user | stories @user | link <url>)',
};

function _brain() { return require('./auraBrain'); }
function _cmds() { return require('./auraCommands'); }

/**
 * Lista de ferramentas que ESTA pessoa pode usar, para o prompt.
 * Curta (≤ ~1800 chars) para não pesar no modelo.
 */
function ferramentasParaPrompt({ isOwner = false, isAdmin = false, isVip = false, isGroup = false } = {}) {
  const linhas = [];
  // comandos primeiro (curtos e mais pedidos); capacidades a seguir
  try {
    const cmds = _cmds();
    for (const [nome, desc] of Object.entries(CMDS_IA)) {
      if (cmds.estaBloqueado(nome)) continue;
      if (!cmds.podeExecutar(nome, { isOwner, isVip, isAdmin }).pode) continue;
      if (!isGroup && /grupo|admin|mencionar toda/i.test(desc)) continue;
      linhas.push(`cmd_${nome}: ${desc}`);
    }
  } catch {}
  try {
    const brain = _brain();
    for (const c of brain.CAPACIDADES) {
      if (!c || !c.id || !c.desc) continue;
      if (!brain.podeFazer(c, { isOwner, isAdmin }).pode) continue;
      if (!isGroup && /grupo|admin|membro/i.test(c.desc) && !/canal|status|lembr|record|agend/i.test(c.desc)) continue;
      linhas.push(`${c.id}: ${String(c.desc).slice(0, 48)}${c.arg && c.arg !== 'nenhum' ? ' (+arg)' : ''}`);
    }
  } catch {}
  if (!linhas.length) return '';
  let txt = linhas.join('\n');
  if (txt.length > 3400) txt = txt.slice(0, 3400) + '\n…';
  return [
    'O QUE SABES FAZER DE VERDADE (ferramentas):',
    'Quando a pessoa te pede uma destas coisas, FAZ — não digas que vais fazer. Inclui no fim da tua resposta o marcador',
    '  [FAZ:<id> <argumento>]',
    'e escreve à frente só uma frase curta natural (ou nada). Podes usar até 2 marcadores. Nunca inventes ids que não estão na lista. Se não tens permissão para algo, di-lo com sinceridade.',
    txt,
  ].join('\n');
}

/** Bloco de aprendizagem para o prompt. */
function instrucaoAprendizagem({ isOwner = false } = {}) {
  return [
    'APRENDER (memória própria):',
    'Se nesta conversa descobrires algo que vale a pena lembrar sobre a pessoa (nome real, gosto, cidade, relação, algo que te pediu para nunca fazer), anota no fim:  [APRENDI:<facto curto>]',
    'Se for sobre o grupo/chat (regra do grupo, quem manda, assunto habitual):  [APRENDI_GRUPO:<facto curto>]',
    'Máximo 2 anotações por resposta e só quando for mesmo novo. Os marcadores são invisíveis para a pessoa.',
    isOwner ? 'O Dark também te pode ensinar regras fixas ("quando eu disser X faz Y") — se ele repetir muito um pedido, sugere-lhe isso.' : '',
  ].filter(Boolean).join('\n');
}

/**
 * Lê a resposta da IA: extrai [FAZ:], [APRENDI:], [APRENDI_GRUPO:]
 * e devolve o texto limpo.
 */
function interpretar(resposta) {
  const r = String(resposta || '');
  const acoes = [], factos = [], factosGrupo = [];
  let m;
  RE_FAZ.lastIndex = 0;
  while ((m = RE_FAZ.exec(r)) && acoes.length < 2) acoes.push({ id: m[1].toLowerCase(), arg: String(m[2] || '').trim() });
  RE_APRENDI.lastIndex = 0;
  while ((m = RE_APRENDI.exec(r)) && factos.length < 2) factos.push(m[1].trim());
  RE_APRENDI_GRUPO.lastIndex = 0;
  while ((m = RE_APRENDI_GRUPO.exec(r)) && factosGrupo.length < 2) factosGrupo.push(m[1].trim());
  const texto = r.replace(RE_FAZ, '').replace(RE_APRENDI, '').replace(RE_APRENDI_GRUPO, '').replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return { acoes, factos, factosGrupo, texto };
}

/**
 * Executa as acções que a IA pediu, com permissões reais.
 * @returns {Promise<{executadas:number, respostas:string[]}>}
 */
async function executarAcoes(acoes, { sock, msg, ctx, texto, isOwner, isAdmin, isVip, caseHandler, config, runNativo }) {
  const out = { executadas: 0, respostas: [] };
  if (!Array.isArray(acoes) || !acoes.length) return out;
  const brain = _brain();
  const cmds = _cmds();
  for (const a of acoes.slice(0, 2)) {
    try {
      if (a.id.startsWith('cmd_')) {
        const nome = a.id.slice(4);
        if (!CMDS_IA[nome] || cmds.estaBloqueado(nome)) continue;
        if (!cmds.podeExecutar(nome, { isOwner, isVip, isAdmin }).pode) continue;
        const args = a.arg ? a.arg.split(/\s+/) : [];
        const prefix = ctx.prefix || config?.bot?.prefix || '!';
        const fakeCtx = { ...ctx, args, prefix };
        let correu = false;
        if (caseHandler) {
          correu = await caseHandler.runCase(nome, {
            sock, msg, ctx: fakeCtx, args, text: a.arg, prefix, command: nome, isOwner, config,
          }).catch(() => false);
        }
        // não é case → nativo/pacote (menu, saldo…), igual ao auraCommands
        if (!correu && typeof runNativo === 'function') correu = await runNativo(nome, { ctx: fakeCtx, args }).catch(() => false);
        if (correu) out.executadas++;
        else out.respostas.push(`Não encontrei a função "${nome}" aqui.`);
        continue;
      }
      const cap = brain.POR_ID.get(a.id);
      if (!cap) continue;
      if (!brain.podeFazer(cap, { isOwner, isAdmin }).pode) continue;
      const exec = require('./auraExec');
      const r = await exec.executar(a.id, a.arg, { sock, msg, ctx, texto, isOwner, isAdmin });
      out.executadas++;
      if (r?.msg && !r.gerar) out.respostas.push(String(r.msg));
    } catch (e) {
      out.respostas.push(`Tentei ${a.id} mas não consegui: ${String(e.message || e).slice(0, 80)}`);
    }
  }
  return out;
}

// ── Saber sobre o grupo/chat ────────────────────────────────
function _keyGrupo(jid) { return 'aura_saber_' + String(jid || '').replace(/\W/g, ''); }

async function guardarSaberGrupo(jid, facto) {
  const f = String(facto || '').trim().slice(0, 160);
  if (!jid || f.length < 3) return false;
  try {
    const bcc = require('../bot/botConfigCache');
    const cur = (await bcc.get(_keyGrupo(jid), [])) || [];
    const arr = Array.isArray(cur) ? cur : [];
    if (arr.some(x => x.toLowerCase() === f.toLowerCase())) return true;
    arr.push(f);
    await bcc.set(_keyGrupo(jid), arr.slice(-20));
    return true;
  } catch { return false; }
}

async function saberGrupo(jid) {
  try {
    const bcc = require('../bot/botConfigCache');
    const cur = (await bcc.get(_keyGrupo(jid), [])) || [];
    return Array.isArray(cur) ? cur : [];
  } catch { return []; }
}

/** Guarda o que a IA anotou (pessoa + grupo). */
async function aprender({ factos = [], factosGrupo = [], senderNumber, remoteJid, isGroup }) {
  let n = 0;
  try {
    const mem = require('./auraMemory');
    for (const f of factos) { await mem.guardar(senderNumber, f, { importante: true }); n++; }
  } catch {}
  if (isGroup) for (const f of factosGrupo) { if (await guardarSaberGrupo(remoteJid, f)) n++; }
  return n;
}

/** Bloco "o que já sabes" para o prompt. */
async function saberParaPrompt({ senderNumber, remoteJid, isGroup }) {
  const partes = [];
  try {
    const mem = require('./auraMemory');
    const m = await mem.lembrar(senderNumber);
    const p = mem.paraPrompt(m);
    if (p) partes.push(p);
  } catch {}
  if (isGroup) {
    const sg = await saberGrupo(remoteJid);
    if (sg.length) partes.push('O QUE SABES DESTE GRUPO:\n- ' + sg.slice(-10).join('\n- '));
  }
  return partes.join('\n\n');
}

module.exports = {
  CMDS_IA, ferramentasParaPrompt, instrucaoAprendizagem, interpretar, executarAcoes,
  aprender, saberParaPrompt, guardarSaberGrupo, saberGrupo, RE_FAZ, RE_APRENDI, RE_APRENDI_GRUPO,
};
