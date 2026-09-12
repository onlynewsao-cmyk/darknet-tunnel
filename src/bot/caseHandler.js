/**
 * DARK BOT v7 — Case Handler Engine ULTRA DINÂMICO
 * ═══════════════════════════════════════════════════════
 *
 * Suporta TODOS os formatos de cases de QUALQUER bot:
 *
 * FORMATOS SUPORTADOS:
 *
 *   1. Standard switch/case (outros bots):
 *      case "ytplay4": { ... } break
 *      case 'copilot': { ... } break;
 *
 *   2. Module.exports (manga, módulos complexos):
 *      module.exports = { name: "manga", execute(sock, from, msg, args) { ... } }
 *
 *   3. Função solta:
 *      async function meuComando(sock, msg, text) { ... }
 *
 *   4. Código JS puro (sem wrapper):
 *      reply('Olá!');  // adaptado automaticamente
 *
 *   5. Resposta simples (string):
 *      "Olá! Eu sou o bot."
 *
 * VARIÁVEIS DETECTADAS E ADAPTADAS AUTOMATICAMENTE:
 *   lofi, systemZR, conn, client, this.sock → sock
 *   m.chat, m.from, from → ctx.remoteJid
 *   m.sender → ctx.senderJid
 *   m.key → msg.key
 *   m.reply() → reply()
 *   m.react() → react()
 *   m.pushName → ctx.pushName
 *   m.isGroup → ctx.isGroup
 *   m.quoted → quoted
 *   info → msg
 *   q → text
 *   m.makeCode() → makeCode()
 *   m.makeTable() → makeTable()
 *   m.sendRich() → sendRich()
 *
 * COMANDOS DE GESTÃO:
 *   !addcase <cmd> <código>   — adiciona case (qualquer formato)
 *   !removicase <cmd>         — remove case dinâmico
 *   !downcase <cmd>           — ver código do case
 *   !listcases                — listar todos os cases dinâmicos
 *   !runcase <cmd> [args...]  — executar um case directamente
 *   !reloadcases              — recarregar cases dos ficheiros
 *   !testcase <cmd>           — testa se o case compila sem erros
 */

'use strict';

const BotConfig = require('../database/models/BotConfig');
const path = require('path');
const fs = require('fs');

// ─────────────────────────────────────────────────────
// MAPA PRINCIPAL
// ─────────────────────────────────────────────────────
const CASES = new Map();
const CASES_SOURCE = new Map();
const CASES_META = new Map(); // guarda metadata: formato, origem, deps

// ─────────────────────────────────────────────────────
// REGISTRO DE CÓDIGO-FONTE POR FICHEIRO
// Populado durante loadCases() — permite !downcase para QUALQUER comando
// ─────────────────────────────────────────────────────
const FILE_SOURCES = new Map();   // cmd → { file, code, aliases, line }
const COMMAND_REGISTRY = new Map(); // cmd → { aliases, file, source }

// ─────────────────────────────────────────────────────
// WRAPPER "m" — estilo clássico COMPLETO
// ─────────────────────────────────────────────────────
function buildM(sock, msg, ctx) {
  const jid    = ctx.remoteJid;
  const sender = ctx.senderJid || jid;
  const key    = msg.key;

  const ctxInfo    = msg.message?.extendedTextMessage?.contextInfo ||
                     msg.message?.interactiveResponseMessage?.contextInfo || {};
  const quotedMsg  = ctxInfo.quotedMessage || null;
  const quotedId   = ctxInfo.stanzaId || null;
  const quotedPart = ctxInfo.participant || null;

  const quoted = quotedMsg ? {
    id:          quotedId,
    sender:      quotedPart || sender,
    participant: quotedPart,
    message:     quotedMsg,
    msg:         { message: quotedMsg, key: { id: quotedId, remoteJid: jid, participant: quotedPart, fromMe: false } },
    text: quotedMsg.conversation ||
          quotedMsg.extendedTextMessage?.text ||
          quotedMsg.imageMessage?.caption ||
          quotedMsg.videoMessage?.caption || '',
    isImage:   !!quotedMsg.imageMessage,
    isVideo:   !!quotedMsg.videoMessage,
    isAudio:   !!quotedMsg.audioMessage,
    isSticker: !!quotedMsg.stickerMessage,
    isDoc:     !!quotedMsg.documentMessage,
  } : null;

  const m = {
    key,
    msg,
    chat:     jid,
    sender,
    from:     jid,
    pushName: ctx.pushName || '',
    isGroup:  ctx.isGroup  || false,
    isOwner:  ctx.isOwner  || false,
    quoted,
    ts:       Date.now(),

    reply: async (text) => {
      const RE = require('./renderEngine');
      const themed = await RE.themeText(String(text), jid).catch(() => String(text));
      return sock.sendMessage(jid, { text: themed }, { quoted: msg });
    },
    react: (emoji) => sock.sendMessage(jid, { react: { text: emoji, key } }).catch(() => {}),
    delete: () => sock.sendMessage(jid, { delete: key }).catch(() => {}),

    // ── Rich Response helpers (estilo SystemZero) ──
    makeCode: (lang, code) => ({ type: 'code', lang, code }),
    makeText: (text) => ({ type: 'text', text }),
    makeTable: (rows) => ({ type: 'table', rows }),

    sendRich: async (target, parts, quotedMsg, capabilities) => {
      // Tenta enviar como mensagem formatada; fallback para texto simples
      try {
        let fullText = '';
        for (const part of parts) {
          if (part.type === 'code') {
            fullText += `\`\`\`${part.lang || ''}\n${part.code}\n\`\`\`\n\n`;
          } else if (part.type === 'table') {
            if (part.rows?.length) {
              const header = part.rows[0];
              fullText += header.map(h => `*${h}*`).join(' | ') + '\n';
              fullText += part.rows.slice(1).map(r => r.join(' | ')).join('\n') + '\n\n';
            }
          } else if (part.type === 'text') {
            fullText += part.text + '\n\n';
          }
        }
        return sock.sendMessage(target || jid, { text: fullText.trim() }, { quoted: quotedMsg || msg });
      } catch (e) {
        return sock.sendMessage(target || jid, { text: String(parts) }, { quoted: quotedMsg || msg });
      }
    },
  };

  return { m, quoted };
}

// ─────────────────────────────────────────────────────
// INSTALAÇÃO AUTOMÁTICA DE DEPENDÊNCIAS NPM
// ─────────────────────────────────────────────────────
const _installedDeps = new Set();

function ensureDeps(code) {
  const requireMatches = code.match(/require\s*\(\s*['"]([^'"./][^'"]*?)['"]\s*\)/g) || [];
  const importMatches = code.match(/from\s+['"]([^'"./][^'"]*?)['"]/g) || [];

  const deps = new Set();
  for (const m of requireMatches) {
    const pkg = m.match(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/)?.[1];
    if (pkg) {
      // Pega só o nome do pacote (sem subpath)
      const basePkg = pkg.startsWith('@') ? pkg.split('/').slice(0, 2).join('/') : pkg.split('/')[0];
      deps.add(basePkg);
    }
  }
  for (const m of importMatches) {
    const pkg = m.match(/from\s+['"]([^'"]+)['"]/)?.[1];
    if (pkg && !pkg.startsWith('.')) {
      const basePkg = pkg.startsWith('@') ? pkg.split('/').slice(0, 2).join('/') : pkg.split('/')[0];
      deps.add(basePkg);
    }
  }

  const missing = [];
  for (const dep of deps) {
    if (_installedDeps.has(dep)) continue;
    try {
      require.resolve(dep);
      _installedDeps.add(dep);
    } catch {
      missing.push(dep);
    }
  }

  return missing;
}

function installMissingDeps(deps) {
  if (!deps.length) return;
  const { execSync } = require('child_process');
  for (const dep of deps) {
    try {
      console.log(`[Cases] 📦 Instalando dependência: ${dep}`);
      execSync(`npm install ${dep} --save --legacy-peer-deps 2>/dev/null`, {
        cwd: path.join(__dirname, '..', '..'),
        timeout: 60000,
        stdio: 'pipe',
      });
      _installedDeps.add(dep);
      console.log(`[Cases] ✅ ${dep} instalado`);
    } catch (e) {
      console.warn(`[Cases] ⚠️ Falha ao instalar ${dep}: ${e.message?.slice(0, 80)}`);
    }
  }
}

// ─────────────────────────────────────────────────────
// DETECTOR DE FORMATO — identifica o tipo de código
// ─────────────────────────────────────────────────────
const FORMAT = {
  SWITCH_CASE: 'switch_case',       // case 'x': { ... } break
  MODULE_EXPORTS: 'module_exports', // module.exports = { execute() {} }
  FUNCTION: 'function',             // async function nome() {}
  RAW_CODE: 'raw_code',             // código JS solto
  STRING: 'string',                 // resposta de texto simples
};

function detectFormat(code) {
  const trimmed = code.trim();

  // 1. String simples (sem código JS)
  if ((trimmed.startsWith('"') || trimmed.startsWith("'") || trimmed.startsWith('`')) &&
      !trimmed.includes('require') && !trimmed.includes('function') && !trimmed.includes('=>') &&
      trimmed.length < 500) {
    return FORMAT.STRING;
  }

  // 1b. v7.38: texto simples SEM aspas ("Olá! só texto", "Regras: 1) …")
  // — o !addcase prometia "5️⃣ Texto simples" mas só aceitava com aspas.
  if (trimmed.length < 1500 && !/[;{}]|=>|\b(require|function|return|await|const|let|var|reply|sock|sendMessage|console)\b|\w+\s*\(/.test(trimmed)) {
    return FORMAT.STRING;
  }

  // 2. Module.exports pattern
  if (/module\.exports\s*=/.test(trimmed) || /exports\.\w+\s*=/.test(trimmed)) {
    return FORMAT.MODULE_EXPORTS;
  }

  // 3. Switch/case pattern
  if (/^case\s+['"`]/.test(trimmed) || /case\s+['"`][^'"]+['"]\s*:\s*\{/.test(trimmed)) {
    return FORMAT.SWITCH_CASE;
  }

  // 4. Function declaration
  if (/^(async\s+)?function\s+\w+/.test(trimmed)) {
    return FORMAT.FUNCTION;
  }

  // 5. Raw code
  return FORMAT.RAW_CODE;
}

// ─────────────────────────────────────────────────────
// EXTRATOR DE COMANDO — detecta o nome do case
// ─────────────────────────────────────────────────────
function extractCommandName(code, providedName) {
  if (providedName) return providedName.toLowerCase().trim();

  const trimmed = code.trim();

  // case 'nome': ou case "nome":
  const caseMatch = trimmed.match(/case\s+['"`]([a-zA-Z0-9_]+)['"`]\s*:/);
  if (caseMatch) return caseMatch[1].toLowerCase();

  // module.exports = { name: 'nome' }
  const nameMatch = trimmed.match(/name\s*:\s*['"`]([a-zA-Z0-9_]+)['"`]/);
  if (nameMatch) return nameMatch[1].toLowerCase();

  // function nomeComando(
  const fnMatch = trimmed.match(/(?:async\s+)?function\s+([a-zA-Z0-9_]+)/);
  if (fnMatch) return fnMatch[1].toLowerCase();

  return null;
}

// ─────────────────────────────────────────────────────
// ADAPTADOR UNIVERSAL — converte QUALQUER formato para DARK BOT
// ─────────────────────────────────────────────────────
function adaptCaseCode(code) {
  let c = code;

  // ═══ VARIÁVEIS DE SOCKET (todas → sock) ═══
  // Ordem importa: nomes mais longos primeiro para não substituir parcialmente
  c = c.replace(/\bsystemZR\b/g, 'sock');
  c = c.replace(/\blofi\b/g, 'sock');
  c = c.replace(/\bconn\b(?![a-zA-Z_])/g, 'sock');
  c = c.replace(/\bclient\b(?![a-zA-Z_])/g, 'sock');
  c = c.replace(/\bthis\.sock\b/g, 'sock');

  // ═══ WRAPPER m → variáveis do DARK BOT ═══
  c = c.replace(/\bm\.reply\s*\(/g, 'reply(');
  c = c.replace(/\bm\.react\s*\(/g, 'react(');
  c = c.replace(/\bm\.chat\b/g, 'ctx.remoteJid');
  c = c.replace(/\bm\.from\b/g, 'ctx.remoteJid');
  c = c.replace(/\bm\.key\b/g, 'msg.key');
  c = c.replace(/\bm\.sender\b/g, 'ctx.senderJid');
  c = c.replace(/\bm\.pushName\b/g, 'ctx.pushName');
  c = c.replace(/\bm\.isGroup\b/g, 'ctx.isGroup');
  c = c.replace(/\bm\.isOwner\b/g, 'isOwner');
  c = c.replace(/\bm\.quoted\b/g, 'quoted');
  c = c.replace(/\bm\.msg\b/g, 'msg');

  // ═══ Variáveis clássicas de outros bots ═══
  // v7.38: NÃO substituir quando são PARÂMETROS de função — em
  // `execute(sock, from, msg, args)` virava `execute(sock, ctx.remoteJid, …)`
  // = "Unexpected token '.'" e TODO o formato module.exports falhava.
  // Protegemos as listas de parâmetros com placeholders antes de trocar.
  const _params = [];
  c = c.replace(/(\bfunction\b[^(]*\(|\basync\s+function\b[^(]*\(|\b(?:execute|run|handler|start|exec|main)\s*\(|=>\s*|\(\s*(?=[^()]*\)\s*=>))([^()]*)\)/g, (all, head, params) => {
    if (!/\b(from|info|q)\b/.test(params)) return all;
    _params.push(params);
    return head + '__CASE_PARAMS_' + (_params.length - 1) + '__)';
  });
  // from → ctx.remoteJid (MAS não dentro de strings ou como parte de outra palavra)
  c = c.replace(/\bfrom\b(?!\s*['"`\w])/g, 'ctx.remoteJid');
  // info → msg (mensagem raw)
  c = c.replace(/\binfo\b(?!\s*['"`\w])/g, 'msg');
  // q → text (argumentos)
  c = c.replace(/\b(?<!\.)q\b(?!\s*['"`\w])/g, 'text');
  c = c.replace(/__CASE_PARAMS_(\d+)__/g, (_, i) => _params[Number(i)]);

  // ═══ Rich Response helpers ═══
  c = c.replace(/sock\.makeCode\s*\(/g, 'm.makeCode(');
  c = c.replace(/sock\.makeText\s*\(/g, 'm.makeText(');
  c = c.replace(/sock\.makeTable\s*\(/g, 'm.makeTable(');
  c = c.replace(/sock\.sendRich\s*\(/g, 'm.sendRich(');

  // ═══ sendMessage(from, → sendMessage(ctx.remoteJid, ═══
  c = c.replace(/sock\.sendMessage\(ctx\.remoteJid/g, 'sock.sendMessage(ctx.remoteJid');

  // ═══ Remove break; no final ═══
  // NOTA: NÃO remover '}' solto — extractCaseCode já trata disso.
  // Remover aqui quebrava o código quando havia if/else/try/catch.
  // v7.39: só o ÚLTIMO break (fim do código). Com /m apanhava o primeiro
  // `break;` de um loop (ex: `if (hp <= 0) break;`) e partia o case.
  c = c.replace(/\bbreak\s*;?\s*(?:\/\/[^\n]*)?\s*$/, '');

  // ═══ Adiciona axios se usado mas não importado ═══
  // Usa 'var' para permitir redeclaração caso o wrapper já o declare
  if (c.includes('axios') && !c.includes("require('axios')") && !c.includes('require("axios")') && !c.includes("require(`axios`)")) {
    c = "var axios = require('./caseAxios').createCaseAxios();\n" + c;
  }

  // ═══ Adiciona cheerio se usado mas não importado ═══
  if (c.includes('cheerio') && !c.includes("require('cheerio')") && !c.includes('require("cheerio")')) {
    c = "var cheerio = require('cheerio');\n" + c;
  }

  return c;
}

// ─────────────────────────────────────────────────────
// COMPILAR CÓDIGO → FUNÇÃO ASYNC
// ─────────────────────────────────────────────────────
function compileCase(code, cmdName) {
  let src = stripCodeFences(decodeHtmlEntities(String(code || '')));
  let format = detectFormat(src);
  // case 'x': { ... } break  NÃO é JS válido fora de switch.
  // Extrai o corpo antes de eval — senão rebenta mesmo com o case certo.
  if (format === FORMAT.SWITCH_CASE) {
    src = extractCaseCode(src);
    format = FORMAT.RAW_CODE;
  }
  const codeForAdapt = src;

  switch (format) {
    case FORMAT.STRING: {
      // String simples → reply direto
      const text = src.trim().replace(/^['"`]|['"`]$/g, '');
      return async ({ m }) => m.reply(text);
    }

    case FORMAT.MODULE_EXPORTS: {
      // module.exports = { execute(sock, from, msg, args, command, config) }
      // → adapta para o wrapper do DARK BOT
      // v7.38: o código adaptado usa `ctx.remoteJid`, `reply`, `text`…
      // mas era avaliado FORA do wrapper (sem essas variáveis) →
      // "ctx is not defined" em runtime. Agora o módulo é avaliado
      // dentro de cada execução, com o mesmo escopo do RAW_CODE.
      const adapted = adaptCaseCode(codeForAdapt);
      const wrapped = `
        (async function caseRun({ m, sock, msg, ctx, text, args, prefix, command, isOwner, config, reply, react, q, from, info, quoted }) {
          var axios = require('./caseAxios').createCaseAxios();
          var systemZR = sock, conn = sock, lofi = sock, client = sock;
          var module = { exports: {} }; var exports = module.exports;
          ${adapted}
          const _exp = module.exports && typeof module.exports === 'object' ? module.exports : {};
          const _run = typeof _exp.execute === 'function' ? _exp.execute
                     : typeof _exp.run === 'function' ? _exp.run
                     : typeof _exp.handler === 'function' ? _exp.handler
                     : typeof _exp.start === 'function' ? _exp.start
                     : typeof module.exports === 'function' ? module.exports : null;
          if (_run) return _run(sock, ctx.remoteJid, msg, args, command, config, { m, ctx, text, prefix, isOwner, reply, react, quoted });
          if (typeof _exp.handleMangaButton === 'function') return _exp.handleMangaButton(sock, msg);
        })
      `;
      return eval(wrapped);
    }

    case FORMAT.SWITCH_CASE: {
      // case 'nome': { ... } break
      const adapted = adaptCaseCode(codeForAdapt);
      const wrapped = `
        (async function caseRun({ m, sock, msg, ctx, text, args, prefix, command, isOwner, config, reply, react, q, from, info, quoted }) {
          var axios = require('./caseAxios').createCaseAxios();
          var systemZR = sock;
          var conn = sock;
          var lofi = sock;
          var client = sock;
          ${adapted}
        })
      `;
      return eval(wrapped);
    }

    case FORMAT.FUNCTION: {
      // async function nome(sock, msg, text) { ... }
      // v7.38: o nome da função vem do CÓDIGO, não do comando —
      // `!addcase ola` com `async function meuCmd(...)` dava
      // "ola is not defined". E o escopo agora tem ctx/reply/etc.
      const adapted = adaptCaseCode(codeForAdapt);
      const _fnName = (adapted.match(/\b(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(/) || [])[1]
        || (adapted.match(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function|\()/) || [])[1]
        || cmdName || 'meuComando';
      // assinatura: detecta se o 1º parâmetro é a mensagem/m (estilo m-first) ou sock
      const _sig = (adapted.match(new RegExp('function\\s*\\*?\\s*' + _fnName + '\\s*\\(([^)]*)\\)')) || [])[1] || '';
      const _mFirst = /^\s*(m|message|msg)\b/.test(_sig);
      const wrapped = `
        (async function caseRun({ m, sock, msg, ctx, text, args, prefix, command, isOwner, config, reply, react, q, from, info, quoted }) {
          var axios = require('./caseAxios').createCaseAxios();
          var systemZR = sock, conn = sock, lofi = sock, client = sock;
          var module = { exports: {} }; var exports = module.exports;
          ${adapted}
          var _fn = typeof ${_fnName} === 'function' ? ${_fnName} : (typeof module.exports === 'function' ? module.exports : null);
          if (!_fn) throw new Error('função "${_fnName}" não encontrada no case');
          return ${_mFirst ? '_fn(m, sock, msg, text, args, ctx, config)' : '_fn(sock, msg, text, args, ctx, config)'};
        })
      `;
      return eval(wrapped);
    }

    case FORMAT.RAW_CODE:
    default: {
      // Código solto → envolve no wrapper
      const adapted = adaptCaseCode(codeForAdapt);
      const wrapped = `
        (async function caseRun({ m, sock, msg, ctx, text, args, prefix, command, isOwner, config, reply, react, q, from, info, quoted }) {
          var axios = require('./caseAxios').createCaseAxios();
          var systemZR = sock;
          var conn = sock;
          var lofi = sock;
          var client = sock;
          // v7.39: bloco interno - o codigo colado pode redeclarar quoted/config/text (shadow)
          {
          ${adapted}
          }
        })
      `;
      return eval(wrapped);
    }
  }
}

// ─────────────────────────────────────────────────────
// REGISTAR UM CASE
// ─────────────────────────────────────────────────────
function registerCase(commands, handler, sourceOrOpts = null) {
  const onlyIfNew = sourceOrOpts === true || (typeof sourceOrOpts === 'object' && sourceOrOpts?.onlyIfNew);
  const source = typeof sourceOrOpts === 'string' ? sourceOrOpts : null;
  const meta = typeof sourceOrOpts === 'object' ? sourceOrOpts : null;
  const list = Array.isArray(commands) ? commands : [commands];
  for (const cmd of list) {
    const key = String(cmd).toLowerCase().trim();
    if (onlyIfNew && CASES.has(key)) continue;
    CASES.set(key, handler);
    if (source) CASES_SOURCE.set(key, source);
    if (meta) CASES_META.set(key, meta);
  }
}

// ─────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────
// EXTRAIR SOURCE DE CADA registerCase() DUM FICHEIRO
// ─────────────────────────────────────────────────────
function extractSourceFromFile(filePath, fileName) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    const results = [];
    const regex = /registerCase\s*\(\s*(\[[^\]]+\]|["'`][^"'`]+["'`])\s*,\s*((?:async\s+)?(?:function|\([^)]*\)\s*=>|\w+))/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
      const cmdsRaw = match[1].trim();
      const startPos = match.index;
      let cmds = [];
      try {
        if (cmdsRaw.startsWith("[")) cmds = JSON.parse(cmdsRaw.replace(/'/g, "\""));
        else cmds = [cmdsRaw.replace(/["']/g, "")];
      } catch { cmds = [cmdsRaw]; }
      // v7.39: scanner ciente de strings/comentários — um ')' dentro de
      // uma string cortava o bloco a meio (ex: cap.js).
      const openIdx = content.indexOf('(', startPos);
      const closeIdx = _matchClose(content, openIdx, '(', ')');
      const endPos = closeIdx > 0 ? closeIdx + 1 : Math.min(content.length, startPos + 50000);
      let blockCode = content.slice(startPos, endPos);
      // v7.39: tira `registerCase(<cmds>,` e o `)` final UMA vez; depois o
      // 3º argumento opcional (true/false/{…}). Antes, `runPin(c), true)`
      // perdia o `)` de runPin.
      let handlerCode = blockCode
        .replace(/^registerCase\s*\(\s*(?:\[[^\]]+\]|["'`][^"'`]+["'`])\s*,\s*/, "")
        .replace(/\)\s*;?\s*$/, "")
        .replace(/\s*,\s*(?:true|false|\{[^{}]*\})\s*$/, "")
        .trim();
      const beforeMatch = content.slice(0, startPos);
      const lineNum = (beforeMatch.match(/\n/g) || []).length + 1;
      results.push({ commands: cmds, code: handlerCode, fullBlock: blockCode, file: fileName, line: lineNum });
    }
    return results;
  } catch (e) {
    console.warn("[Cases] extractSourceFromFile " + fileName + ":", (e.message || "").slice(0, 80));
    return [];
  }
}

// CARREGAR FICHEIROS src/bot/cases/
// ─────────────────────────────────────────────────────
function loadCases() {
  const dir = path.join(__dirname, 'cases');
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));
  for (const file of files) {
    try {
      delete require.cache[require.resolve(path.join(dir, file))];
      const mod = require(path.join(dir, file));
      if (typeof mod === 'function') {
        mod(registerCase);
      } else if (mod instanceof Map) {
        mod.forEach((fn, cmd) => registerCase(cmd, fn));
      } else if (typeof mod === 'object') {
        Object.entries(mod).forEach(([cmd, fn]) => {
          if (typeof fn === 'function') registerCase(cmd, fn);
        });
      }
    } catch (e) {
      console.warn(`[Cases] Falha ao carregar ${file}:`, e.message?.slice(0, 80));
    }
  }
  // Populate source registries
  for (const file of files) {
    const fullPath = path.join(dir, file);
    try {
      const sources = extractSourceFromFile(fullPath, file);
      for (const src of sources) {
        for (const cmd of src.commands) {
          const key = cmd.toLowerCase().trim();
          FILE_SOURCES.set(key, { file, code: src.code, fullBlock: src.fullBlock, line: src.line, aliases: src.commands });
          COMMAND_REGISTRY.set(key, { aliases: src.commands, file, source: "case_file" });
        }
      }
    } catch {}
  }
  console.log(`[Cases] ${CASES.size} cases carregados | ${FILE_SOURCES.size} fontes extraídas`);
}

// ─────────────────────────────────────────────────────
// CASES DINÂMICOS (DB)
// ─────────────────────────────────────────────────────
let _dynamicLoaded = false;

async function loadDynamicCases() {
  try {
    const stored = await BotConfig.get('dynamic_cases_v2', {}).catch(() => ({}));
    if (!stored || typeof stored !== 'object') return;
    for (const [cmd, entry] of Object.entries(stored)) {
      // Cases do dono ganham aos nativos — é o ponto do addcase.
      const source = typeof entry === 'string' ? entry : entry.code || entry;
      const format = entry?.format || detectFormat(source);
      try {
        // Instala dependências automaticamente
        const missing = ensureDeps(source);
        if (missing.length) installMissingDeps(missing);

        const fn = compileCase(source, cmd);
        registerCase(cmd, fn, { source, format, dynamic: true });
      } catch (e) {
        // Case com erro → regista como resposta de texto
        const txt = String(source);
        registerCase(cmd, async ({ m }) => m.reply(txt), { source: txt, format: 'fallback', error: e.message });
      }
    }
  } catch {}
  _dynamicLoaded = true;
}

async function addDynamicCase(command, code) {
  const format = detectFormat(code);
  const stored = await BotConfig.get('dynamic_cases_v2', {}).catch(() => ({}));
  stored[command] = {
    code,
    format,
    addedAt: new Date().toISOString(),
    version: 7,
  };
  await BotConfig.set('dynamic_cases_v2', stored);

  // Instala dependências automaticamente
  const missing = ensureDeps(code);
  if (missing.length) installMissingDeps(missing);

  try {
    const fn = compileCase(code, command);
    registerCase(command, fn, { source: code, format, dynamic: true });
    return { ok: true, format, deps: missing };
  } catch (e) {
    registerCase(command, async ({ m }) => m.reply(code), { source: code, format: 'fallback', error: e.message });
    return { ok: false, format, error: e.message, deps: missing };
  }
}

async function delDynamicCase(command) {
  const stored = await BotConfig.get('dynamic_cases_v2', {}).catch(() => ({}));
  delete stored[command];
  await BotConfig.set('dynamic_cases_v2', stored);
  CASES.delete(command);
  CASES_SOURCE.delete(command);
  CASES_META.delete(command);
  // Se o case tapava um nativo (ex: pin), o nativo volta.
  try { loadCases(); } catch {}
  _dynamicLoaded = false;
  await loadDynamicCases();
}

async function listDynamicCases() {
  const stored = await BotConfig.get('dynamic_cases_v2', {}).catch(() => ({}));
  return Object.entries(stored).map(([cmd, entry]) => ({
    cmd,
    format: entry?.format || 'unknown',
    addedAt: entry?.addedAt || '?',
    version: entry?.version || 1,
    preview: (entry?.code || String(entry)).slice(0, 50),
  }));
}

async function getDynamicCaseSource(command) {
  const stored = await BotConfig.get('dynamic_cases_v2', {}).catch(() => ({}));
  const entry = stored[command];
  if (!entry) return null;
  return entry?.code || String(entry);
}

// ─────────────────────────────────────────────────────
// VALIDAÇÃO DE SINTAXE — testa sem executar
// ─────────────────────────────────────────────────────
function validateCase(code, cmdName) {
  const result = {
    valid: false,
    format: detectFormat(code),
    errors: [],
    warnings: [],
    deps: [],
  };

  try {
    // 1. Detecta dependências
    result.deps = ensureDeps(code);

    // 2. Tenta compilar
    const fn = compileCase(code, cmdName || 'test_cmd');

    // 3. Verifica se é função
    if (typeof fn !== 'function') {
      result.errors.push('Código não resultou numa função executável');
      return result;
    }

    // 4. Verificações de segurança
    const dangerous = ['process.exit', 'process.kill', 'rm -rf', 'rm -r /',
                       'eval(', 'Function(', '__dirname + \'/../..\'',
                       'child_process.execSync', '.execSync('];
    for (const d of dangerous) {
      if (code.includes(d)) {
        result.warnings.push(`⚠️ Código contém padrão perigoso: ${d}`);
      }
    }

    result.valid = true;
  } catch (e) {
    result.errors.push(e.message?.slice(0, 200));
  }

  return result;
}

// ─────────────────────────────────────────────────────
// EXECUTAR UM CASE
// ─────────────────────────────────────────────────────
async function runCase(command, rawCtx) {
  if (!_dynamicLoaded) await loadDynamicCases();

  const cmd = String(command || '').toLowerCase().trim();
  const handler = CASES.get(cmd);
  if (!handler) return false;

  const { msg, ctx, args, text, prefix, isOwner, config } = rawCtx;
  const sock = wrapSockForCases(rawCtx.sock, msg);
  const { m, quoted } = buildM(sock, msg, ctx);

  // isAdmin lazy
  const isAdminFn = async () => {
    if (ctx.isOwner) return true;
    if (!ctx.isGroup) return false;
    try {
      const meta = ctx.groupMeta || await sock.groupMetadata(ctx.remoteJid);
      const snum = ctx.senderNumber;
      return meta.participants?.some(p =>
        p.id.split('@')[0].replace(/\D/g, '') === snum &&
        (p.admin === 'admin' || p.admin === 'superadmin')
      ) || false;
    } catch { return false; }
  };

  const caseCtx = {
    m, quoted, sock, msg, ctx, args,
    text, prefix, command: cmd, isOwner, isAdminFn, config,
    reply: (t) => m.reply(t),
    react: (e) => m.react(e),
    // Aliases clássicos
    q:    text,
    from: ctx.remoteJid,
    info: msg,
  };

  try {
    const r = await handler(caseCtx);
    return r !== false;
  } catch (e) {
    console.error(`[Case:${cmd}]`, e.message?.slice(0, 100));
    try { await m.reply(`❌ Erro no case *${cmd}*:\n${e.message?.slice(0, 200)}`); } catch {}
    return true;
  }
}

// ─────────────────────────────────────────────────────
// EXTRAIR CÓDIGO DO CASE
// ─────────────────────────────────────────────────────
function decodeHtmlEntities(s) {
  return String(s || '')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x2F;/gi, '/')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function stripCodeFences(s) {
  let c = String(s || '').trim();
  if (/^```/.test(c)) {
    c = c.replace(/^```[a-zA-Z0-9_-]*\s*\n?/, '').replace(/\n?```\s*$/, '');
  }
  return c.trim();
}

/**
 * Corpo entre { } com strings, template `${}` e comentários.
 * O extractor antigo fazia replace no PRIMEIRO `}` isolado —
 * comia o fecho do if e o case rebentava com Unexpected token '}'.
 */
function extractBalancedBlock(src) {
  if (!src || src[0] !== '{') return null;
  const end = _matchClose(src, 0, '{', '}');   // v7.39: scanner partilhado (strings, templates, regex, comentários)
  if (end < 0) return null;
  return src.slice(1, end);
}

function extractCaseCode(rawText) {
  let code = stripCodeFences(decodeHtmlEntities(String(rawText || '').trim()));
  code = code.replace(/^---\s*/m, '').trim();
  // v7.39: comentários/cabeçalho ANTES do `case` (o !downcase exporta com
  // cabeçalho) não podem impedir a detecção do formato switch/case.
  const semCab = code.replace(/^(?:\s*(?:\/\/[^\n]*|\/\*[\s\S]*?\*\/)\s*)+/, '');
  if (/^case\s+['"`]/i.test(semCab)) code = semCab;

  const head = code.match(/^case\s+['"`][^'"`]+['"`]\s*:/i);
  if (head) {
    let rest = code.slice(head[0].length).replace(/^\s*/, '');
    if (rest.startsWith('{')) {
      const body = extractBalancedBlock(rest);
      if (body != null) {
        return body.replace(/\bbreak\s*;?\s*$/i, '').trim();
      }
    }
    return rest.replace(/\bbreak\s*;?\s*$/i, '').trim();
  }

  return code.replace(/\bbreak\s*;?\s*$/i, '').trim();
}

function wrapSockForCases(sock, msg) {
  if (!sock || typeof sock.sendMessage !== 'function') return sock;
  const orig = sock.sendMessage.bind(sock);
  return new Proxy(sock, {
    get(target, prop) {
      if (prop === 'sendMessage') {
        return (jid, content, opts = {}) => {
          let o = opts || {};
          if (o.quoted && o.quoted.key && !o.quoted.message && msg) {
            o = { ...o, quoted: msg };
          }
          return orig(jid, content, o);
        };
      }
      const val = target[prop];
      return typeof val === 'function' ? val.bind(target) : val;
    },
  });
}


// ─────────────────────────────────────────────────────
// v7.39 — EXPORTADOR UNIVERSAL DE CÓDIGO (!downcase)
// Todas as fontes (dinâmico, ficheiro, nativo, pacote) saem no MESMO
// formato dos cases dinâmicos:   case 'x': { …corpo… break; }
// e o corpo vem PRONTO a colar com !addcase: helpers do ficheiro que o
// corpo usa são inlinados; funções nativas ganham um adaptador para as
// variáveis do wrapper (sock, msg, ctx, args, text, reply, react…).
// ─────────────────────────────────────────────────────

/** v7.39 — percorre código ignorando strings, templates, regex simples e comentários; devolve índice de fecho do bloco que abre em `openIdx`. */
function _matchClose(content, openIdx, open, close) {
  let depth = 0, i = openIdx;
  const n = content.length;
  const prevSig = (k) => { let j = k - 1; while (j >= 0 && /\s/.test(content[j])) j--; return j >= 0 ? content[j] : '('; };
  while (i < n) {
    const ch = content[i];
    if (ch === '/' && content[i + 1] === '/') { i = content.indexOf('\n', i); if (i < 0) return -1; continue; }
    if (ch === '/' && content[i + 1] === '*') { i = content.indexOf('*/', i + 2); if (i < 0) return -1; i += 2; continue; }
    if (ch === "'" || ch === '"') { const q = ch; i++; while (i < n && content[i] !== q) { if (content[i] === '\\') i++; if (content[i] === '\n') break; i++; } i++; continue; }
    if (ch === '`') { i++; while (i < n && content[i] !== '`') { if (content[i] === '\\') i++; else if (content[i] === '$' && content[i + 1] === '{') { const e = _matchClose(content, i + 1, '{', '}'); if (e < 0) return -1; i = e; } i++; } i++; continue; }
    if (ch === '/' && /[=(,:;!&|?{}\[\n+\-*%<>~^]/.test(prevSig(i)) || (ch === '/' && /\b(return|typeof|case|in|of|new|delete|void|throw)\s*$/.test(content.slice(Math.max(0, i - 8), i)))) {
      // literal regex
      i++;
      while (i < n && content[i] !== '/' && content[i] !== '\n') {
        if (content[i] === '\\') { i += 2; continue; }
        if (content[i] === '[') { i++; while (i < n && content[i] !== ']' && content[i] !== '\n') { if (content[i] === '\\') i++; i++; } }
        i++;
      }
      i++; continue;
    }
    if (ch === open) depth++;
    else if (ch === close) { depth--; if (depth === 0) return i; }
    i++;
  }
  return -1;
}

const _fileHelperCache = new Map(); // file → [{name, code, isConst}]

/**
 * Extrai declarações de topo (function / const / let) do ficheiro de cases.
 * v7.39: estrutural — só declarações à profundidade 0 (topo do ficheiro)
 * ou 1 (dentro de `module.exports = function (registerCase) { … }`), e
 * NUNCA dentro de um registerCase(...) ou de outra função. Usa o scanner
 * ciente de strings/regex/comentários, por isso `)` em strings não parte.
 */
function _topLevelDecls(content) {
  const out = [];
  const n = content.length;
  let depth = 0, i = 0;
  const skipStr = (q) => { i++; while (i < n && content[i] !== q) { if (content[i] === '\\') i++; if (content[i] === '\n' && q !== '`') break; if (q === '`' && content[i] === '$' && content[i + 1] === '{') { const e = _matchClose(content, i + 1, '{', '}'); if (e < 0) { i = n; return; } i = e; } i++; } i++; };
  const prevSig = (k) => { let j = k - 1; while (j >= 0 && /\s/.test(content[j])) j--; return content[j] || ''; };
  while (i < n) {
    const ch = content[i], nx = content[i + 1];
    if (ch === '/' && nx === '/') { i = content.indexOf('\n', i); if (i < 0) break; continue; }
    if (ch === '/' && nx === '*') { i = content.indexOf('*/', i + 2); if (i < 0) break; i += 2; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { skipStr(ch); continue; }
    if ((ch === '/' && /[=(,:;!&|?{}\[\n+\-*%<>~^]/.test(prevSig(i))) || (ch === '/' && /\b(return|typeof|case|in|of|new|delete|void|throw)\s*$/.test(content.slice(Math.max(0, i - 8), i)))) { // regex literal
      i++; while (i < n && content[i] !== '/' && content[i] !== '\n') { if (content[i] === '\\') i++; else if (content[i] === '[') { while (i < n && content[i] !== ']' && content[i] !== '\n') { if (content[i] === '\\') i++; i++; } } i++; } i++; continue;
    }
    if (ch === '(' || ch === '[') { const e = _matchClose(content, i, ch, ch === '(' ? ')' : ']'); i = e > 0 ? e + 1 : i + 1; continue; }
    if (ch === '{') {
      if (depth >= 1) { const e = _matchClose(content, i, '{', '}'); i = e > 0 ? e + 1 : i + 1; continue; }
      depth++; i++; continue;
    }
    if (ch === '}') { depth--; i++; continue; }
    // início de linha?
    const atLineStart = i === 0 || content[i - 1] === '\n' || /^[ \t]*$/.test(content.slice(content.lastIndexOf('\n', i - 1) + 1, i));
    if (atLineStart && depth <= 1) {
      const rest = content.slice(i, i + 200);
      let m;
      if ((m = rest.match(/^(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(/))) {
        const parenOpen = i + m[0].length - 1;
        const parenClose = _matchClose(content, parenOpen, '(', ')');
        const bodyOpen = parenClose > 0 ? content.indexOf('{', parenClose) : -1;
        const bodyClose = bodyOpen > 0 ? _matchClose(content, bodyOpen, '{', '}') : -1;
        if (bodyClose > 0) { out.push({ name: m[1], code: _dedent(content.slice(i, bodyClose + 1)), kind: 'function' }); i = bodyClose + 1; continue; }
      } else if ((m = rest.match(/^(const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/))) {
        // vai até ao ';' ao mesmo nível (ou fim de linha se não houver)
        let k = i + m[0].length, d = 0, end = -1;
        while (k < n) {
          const c = content[k], c2 = content[k + 1];
          if (c === '/' && c2 === '/') { k = content.indexOf('\n', k); if (k < 0) k = n; continue; }
          if (c === '/' && c2 === '*') { k = content.indexOf('*/', k + 2); if (k < 0) k = n; else k += 2; continue; }
          if (c === "'" || c === '"' || c === '`') { const save = i; i = k; skipStr(c); k = i; i = save; continue; }
          if ('({['.includes(c)) d++;
          else if (')}]'.includes(c)) d--;
          else if (c === ';' && d === 0) { end = k + 1; break; }
          else if (c === '\n' && d === 0) { end = k; break; }
          k++;
        }
        if (end > 0) {
          let code = content.slice(i, end).trim();
          const kind = /require\(['"]\.\.?\/\.\.?\/database|require\(['"](?:\.\.\/)+config['"]\)/.test(code) ? 'require' : 'const';
          code = code.replace(/require\(\s*(['"])\.\.\/\.\.\//g, 'require($1../').replace(/require\(\s*(['"])\.\.\/(?!\.\.)/g, 'require($1./');
          out.push({ name: m[2], code, kind }); i = end; continue;
        }
      }
    }
    i++;
  }
  return out;
}

/** Helpers do ficheiro que este corpo usa (fecho transitivo). */
function _helpersUsedBy(body, decls) {
  const byName = new Map(decls.map(d => [d.name, d]));
  const need = new Set(); const queue = [body];
  while (queue.length) {
    const code = queue.pop();
    for (const d of decls) {
      if (need.has(d.name)) continue;
      if (new RegExp('\\b' + d.name.replace(/\$/g, '\\$') + '\\b').test(code)) { need.add(d.name); queue.push(d.code); }
    }
  }
  // mantém a ordem original do ficheiro; nomes que JÁ existem no wrapper
  // do addcase (config, quoted, reply, react, axios…) não são redeclarados.
  const WRAPPER = new Set(['m', 'sock', 'msg', 'ctx', 'text', 'args', 'prefix', 'command', 'isOwner', 'config', 'reply', 'react', 'q', 'from', 'info', 'quoted', 'axios', 'systemZR', 'conn', 'lofi', 'client', 'module', 'exports']);
  return decls.filter(d => need.has(d.name) && !(WRAPPER.has(d.name) && d.kind !== 'function'));
}

/** Corpo da arrow/função: tira `async ({…}) => {` e o `}` final. */
function _bodyOf(handlerCode) {
  const s = String(handlerCode || '').trim();
  // params entre parênteses (pode ter destructuring com chavetas)
  const pm = s.match(/^(?:async\s*)?(?:function\s*\w*\s*)?\(/);
  if (!pm) return { params: '', body: s };
  let depth = 0, i = pm[0].length - 1, end = -1;
  for (; i < s.length; i++) { if (s[i] === '(') depth++; else if (s[i] === ')') { depth--; if (!depth) { end = i; break; } } }
  if (end < 0) return { params: '', body: s };
  const params = s.slice(pm[0].length, end).trim();
  let rest = s.slice(end + 1).replace(/^\s*=>\s*/, '').trim();
  if (rest.startsWith('{')) {
    const inner = extractBalancedBlock(rest);
    if (inner != null) return { params, body: inner.replace(/^\n/, '').replace(/\n\s*$/, ''), param0: params.split(/[,{\s]/)[0] };
  }
  // arrow de expressão: `(caseCtx) => runPlaySearch(caseCtx, …)`
  const p0 = params.replace(/[{}]/g, '').split(',')[0].trim();
  const body = (p0 && !/[{:=]/.test(params) ? `const ${p0} = { m, sock, msg, ctx, text, args, prefix, command, isOwner, config, reply, react, quoted };\n` : '') + 'return ' + rest.replace(/;\s*$/, '') + ';';
  return { params, body };
}

/** Dedent uniforme. */
function _dedent(code) {
  const lines = String(code).split('\n');
  const ind = Math.min(...lines.filter(l => l.trim()).map(l => l.match(/^ */)[0].length));
  return lines.map(l => l.slice(Number.isFinite(ind) ? ind : 0)).join('\n');
}

/**
 * Monta o ficheiro final no formato case.
 * @param {string} cmd
 * @param {string} body   corpo pronto (usa sock,msg,ctx,args,text,reply,react…)
 * @param {object} info   { origem, ficheiro, linha, aliases, helpers:[{name,code}], nota, params }
 */
function buildCaseExport(cmd, body, info = {}) {
  const aliases = (info.aliases || []).filter(a => a !== cmd);
  const W = 60;
  const row = (t) => '// ║ ' + String(t).slice(0, W - 2).padEnd(W - 2) + ' ║';
  const cab = [
    '// ╔' + '═'.repeat(W) + '╗',
    row(`DARK BOT — case '${cmd}'`),
    row(`origem: ${info.origem || '?'}${info.ficheiro ? ' · ' + info.ficheiro + (info.linha ? ':' + info.linha : '') : ''}`),
    aliases.length ? row(`aliases: ${aliases.join(', ')}`) : null,
    row(`colar: envia este ficheiro e responde com  !addcase ${cmd}`),
    row('variáveis: sock, msg, ctx, args, text, prefix, reply, react,'),
    row('           quoted, isOwner, config, m, axios'),
    '// ╚' + '═'.repeat(W) + '╝',
  ].filter(Boolean).join('\n');
  const helpers = (info.helpers || []).length
    ? '\n  // ── helpers do ficheiro original (inlinados) ──\n' + info.helpers.map(h => _dedent(h.code).split('\n').map(l => (l.trim() ? '  ' + l : l)).join('\n')).join('\n\n') + '\n'
    : '';
  const nota = info.nota ? '\n  // ' + info.nota.replace(/\n/g, '\n  // ') + '\n' : '';
  const corpo = _dedent(body).split('\n').map(l => (l.trim() ? '  ' + l : l)).join('\n');
  return `${cab}\ncase '${cmd}': {${nota}${helpers}\n${corpo}\n  break;\n}\n`;
}

/** Exporta um case vindo de src/bot/cases/*.js */
function exportFileCase(cmd, fileSrc) {
  const { params, body } = _bodyOf(fileSrc.code);
  let decls = _fileHelperCache.get(fileSrc.file);
  if (!decls) {
    try { decls = _topLevelDecls(fs.readFileSync(path.join(__dirname, 'cases', fileSrc.file), 'utf8')); } catch { decls = []; }
    _fileHelperCache.set(fileSrc.file, decls);
  }
  const fixPath = (c) => c.replace(/require\(\s*(['"])\.\.\/\.\.\//g, 'require($1../').replace(/require\(\s*(['"])\.\.\/(?!\.\.)/g, 'require($1./');
  const helpers = _helpersUsedBy(body, decls).map(h => ({ ...h, code: fixPath(h.code) }));
  const nota = params ? `parâmetros originais do handler: ${params} — todos já existem no wrapper do !addcase.` : '';
  return buildCaseExport(cmd, fixPath(body), { origem: 'ficheiro de cases', ficheiro: fileSrc.file, linha: fileSrc.line, aliases: fileSrc.aliases, helpers, nota });
}

/** Exporta uma função nativa (nativeCommands / packages). Assinatura: ({ sock, msg, ctx, args, isOwner, config }) */
function exportNativeCase(cmd, fn, origem, extraHelpers = []) {
  const src = fn.toString();
  // método de objecto: `async ping({ … }) { … }`  ou  arrow / function
  const m = src.match(/^(?:async\s+)?(?:function\s*)?[\w$]*\s*\(([^)]*)\)\s*(?:=>)?\s*\{([\s\S]*)\}\s*$/);
  const params = m ? m[1].trim() : '';
  let body = m ? m[2] : src;
  // nativos usam reply(sock, msg, ctx, texto) e react(sock, msg, emoji) — adapta para o wrapper
  const usaReply4 = /\breply\(\s*sock\s*,\s*msg\s*,\s*ctx\s*,/.test(body);
  const usaReact3 = /\breact\(\s*sock\s*,\s*msg\s*,/.test(body);
  const helpers = [];
  if (usaReply4) helpers.push({ name: 'reply', code: 'const replyN = async (_s, _m, _c, texto) => reply(texto); // nativo: reply(sock,msg,ctx,txt)' });
  if (usaReact3) helpers.push({ name: 'react', code: 'const reactN = (_s, _m, emoji) => react(emoji);          // nativo: react(sock,msg,emoji)' });
  if (usaReply4) body = body.replace(/\breply\(\s*sock\s*,\s*msg\s*,\s*ctx\s*,/g, 'replyN(sock, msg, ctx,');
  if (usaReact3) body = body.replace(/\breact\(\s*sock\s*,\s*msg\s*,/g, 'reactN(sock, msg,');
  // `module.exports.outro(a)` → só faz sentido no ficheiro nativo
  const nota = [
    params ? `assinatura original: (${params})` : '',
    /module\.exports\./.test(body) ? 'ATENÇÃO: chama outros comandos nativos via module.exports.* — cola esses também ou substitui.' : '',
    /\bcfg\b/.test(body) && !/\bcfg\s*=/.test(body) ? 'cfg = config (alias)' : '',
  ].filter(Boolean).join('\n');
  const pre = /\bcfg\b/.test(body) && !/const\s+\{[^}]*cfg|cfg\s*=/.test(body) ? 'const cfg = config;\n' : '';
  return buildCaseExport(cmd, pre + body, { origem, helpers: [...extraHelpers, ...helpers], nota });
}

// ─────────────────────────────────────────────────────
// CASES DE GESTÃO
// ─────────────────────────────────────────────────────
function registerManagementCases() {

  // ── !addcase <cmd> [código] — ULTRA DINÂMICO ─────────────────
  registerCase(['addcase', 'addcmd', 'newcase'], async ({ m, sock, ctx, msg, args, text, isOwner, prefix }) => {
    if (!isOwner) return m.reply('🚫 Só o Dono pode adicionar cases.');

    const cmdName = args[0]?.toLowerCase().trim();
    if (!cmdName) return m.reply(
      `❌ *Como adicionar um case:*\n\n` +
      `*Formatos suportados:*\n` +
      `1️⃣ Switch/case de outros bots\n` +
      `2️⃣ module.exports com execute()\n` +
      `3️⃣ Função solta\n` +
      `4️⃣ Código JS puro\n` +
      `5️⃣ Texto simples\n\n` +
      `*Uso:* ${prefix}addcase <nome> <código>\n` +
      `Ou cola o código numa mensagem e responde com:\n` +
      `${prefix}addcase <nome>`
    );

    // Obtém o código: pode vir na mesma mensagem ou na mensagem citada
    // v7.38: `text`/`args` chegam com as QUEBRAS DE LINHA colapsadas
    // (args = split(/\s+/)) → "// comentário" engolia o código todo e
    // o case gravava "com sucesso" mas não fazia nada. Usa o texto
    // ORIGINAL da mensagem para preservar as linhas.
    const rawMsgText = String(
      ctx?.fullText || msg?.message?.conversation || msg?.message?.extendedTextMessage?.text || ''
    );
    let code = '';
    if (rawMsgText) {
      // tira "!addcase nome" da primeira linha, mantém o resto tal como veio
      const m1 = rawMsgText.match(/^\s*\S+\s+\S+[ \t]*([\s\S]*)$/);
      code = (m1 ? m1[1] : '').trim();
    }
    if (!code) code = args.slice(1).join(' ').trim();

    // Se há um --- separador, o código vem depois
    if (/^---\s*$/m.test(code)) {
      const parts = code.split(/^---\s*$/m);
      code = parts.slice(-1)[0]?.trim() || code;
    }

    // Citação: texto, bloco ```, ou documento .js/.txt
    if (!code && m.quoted) {
      code = (m.quoted.text || '').trim();
      if (!code && m.quoted.isDoc) {
        try {
          const { downloadMediaMessage } = require('@systemzero/baileys');
          const buf = await downloadMediaMessage(m.quoted.msg, 'buffer', {});
          if (buf && buf.length) code = buf.toString('utf8').trim();
        } catch (e) {
          console.warn('[addcase] quoted doc:', e.message?.slice(0, 80));
        }
      }
    }

    if (code) {
      code = stripCodeFences(decodeHtmlEntities(code));
    }

    if (!code) return m.reply(
      `❌ Falta o código!\n\n` +
      `Envia: *${prefix}addcase ${cmdName}*\n` +
      `e o código abaixo de --- ou responde a uma mensagem com o código`
    );

    // O nome é SEMPRE o que o dono escreveu (!addcase pinmp4 → pinmp4).
    // Antes, se o código era `case 'pin':` e só havia um argumento,
    // gravava como `pin` e tapava o comando nativo. Foi isso que
    // rebentou o @pin com o case colado.
    const finalName = cmdName;

    // Sempre passa pelo extractor: tira case/break, entidades HTML, fences.
    const cleanCode = extractCaseCode(code);

    // Mostra progresso
    await m.react('⏳');

    // Validação de sintaxe
    const validation = validateCase(cleanCode, finalName);

    if (!validation.valid) {
      await m.react('❌');
      return m.reply(
        `❌ *Erro de compilação:*\n\n` +
        `${validation.errors.join('\n')}\n\n` +
        `📝 *Formato detectado:* ${validation.format}\n` +
        `💡 Verifica a sintaxe e tenta novamente.`
      );
    }

    // Instala dependências em falta
    if (validation.deps.length > 0) {
      await m.reply(`📦 Instalando dependências: ${validation.deps.join(', ')}...`);
      installMissingDeps(validation.deps);
    }

    // Salva
    const result = await addDynamicCase(finalName, cleanCode);

    if (result.ok) {
      await m.react('✅');
      await m.reply(
        `✅ *Case adicionado com sucesso!*\n\n` +
        `📌 Comando: *${prefix}${finalName}*\n` +
        `📄 Formato: ${result.format}\n` +
        `📝 Linhas: ${cleanCode.split('\n').length}\n` +
        (result.deps.length ? `📦 Deps instaladas: ${result.deps.join(', ')}\n` : '') +
        `\n🧪 Testa com *${prefix}${finalName}*`
      );
    } else {
      await m.react('⚠️');
      await m.reply(
        `⚠️ *Case guardado com aviso:*\n${result.error}\n\n` +
        `📝 Formato: ${result.format}\n` +
        `Usa *${prefix}downcase ${finalName}* para ver o código.`
      );
    }
  });

  // ── !testcase <cmd> — testa compilação ───────────────────────
  registerCase(['testcase', 'testcasecode', 'validarcase'], async ({ m, args, isOwner, prefix }) => {
    if (!isOwner) return m.reply('🚫 Só o Dono.');
    const cmd = (args[0] || '').toLowerCase().trim();
    if (!cmd) return m.reply(`❌ Uso: *${prefix}testcase* <comando>`);

    const src = await getDynamicCaseSource(cmd);
    if (!src) return m.reply(`❌ Case *${prefix}${cmd}* não encontrado.`);

    await m.react('🧪');
    const result = validateCase(src, cmd);

    let msg = `🧪 *Teste do case: ${prefix}${cmd}*\n\n`;
    msg += `📝 Formato: \`${result.format}\`\n`;
    msg += `✅ Válido: ${result.valid ? 'SIM' : 'NÃO'}\n`;

    if (result.deps.length) msg += `📦 Deps: ${result.deps.join(', ')}\n`;
    if (result.errors.length) msg += `\n❌ *Erros:*\n${result.errors.map(e => `  • ${e}`).join('\n')}\n`;
    if (result.warnings.length) msg += `\n⚠️ *Avisos:*\n${result.warnings.map(w => `  • ${w}`).join('\n')}\n`;

    if (result.valid) {
      msg += `\n✅ Tudo OK!`;
    }

    await m.reply(msg);
  });

  // ── !removicase / !delcase <cmd> ────────────────────────
  registerCase(['removicase', 'delcase', 'delcmd', 'remcase', 'removecase'], async ({ m, args, isOwner, prefix }) => {
    if (!isOwner) return m.reply('🚫 Só o Dono pode remover cases.');
    const cmd = (args[0] || '').toLowerCase().trim();
    if (!cmd) return m.reply(`❌ Uso: *${prefix}removicase* <comando>`);

    const src = await getDynamicCaseSource(cmd);
    if (!src) return m.reply(`❌ Case *${prefix}${cmd}* não encontrado nos cases dinâmicos.`);

    await delDynamicCase(cmd);
    m.reply(`✅ Case *${prefix}${cmd}* removido com sucesso.`);
  });


  // ── !downcase <cmd> — GERADOR UNIVERSAL DE CÓDIGO ──────────────
  registerCase(['downcase', 'getcasecode', 'viewcase', 'showcase', 'vercode'], async ({ m, sock, msg, ctx, args, isOwner, prefix }) => {
    if (!isOwner) return m.reply('🚫 Só o Dono.');
    const cmd = (args[0] || '').toLowerCase().trim();
    if (!cmd) return m.reply('Uso: *' + prefix + 'downcase* <comando>');

    await m.react('🔍');

    // ═══ 1. CASES DINÂMICOS (DB) ═══
    const dynSrc = await getDynamicCaseSource(cmd);
    if (dynSrc) {
      const meta = CASES_META.get(cmd) || {};
      const fullCode = buildCaseExport(cmd, dynSrc, { origem: 'case dinâmico (addcase)', nota: 'formato guardado: ' + (meta.format || detectFormat(dynSrc)) });
      await sock.sendMessage(ctx.remoteJid, {
        document: Buffer.from(fullCode, 'utf8'),
        fileName: cmd + '_dynamic.js',
        mimetype: 'application/javascript',
        caption: '📄 *' + prefix + cmd + '* — Case Dinâmico\n📝 Formato: ' + (meta.format || detectFormat(dynSrc)) + '\n📊 Linhas: ' + fullCode.split('\n').length,
      }, { quoted: msg });
      await m.react('✅');
      return;
    }

    // ═══ 2. FICHEIRO DE CASES (source registry) ═══
    const fileSrc = FILE_SOURCES.get(cmd);
    if (fileSrc) {
      const aliases = fileSrc.aliases.filter(a => a !== cmd);
      const aliasLine = aliases.length ? '\n📎 Aliases: ' + aliases.map(a => prefix + a).join(', ') : '';
      // v7.39: sai como case completo (helpers do ficheiro inlinados), pronto para !addcase
      const fileCode = exportFileCase(cmd, fileSrc);
      await sock.sendMessage(ctx.remoteJid, {
        document: Buffer.from(fileCode, 'utf8'),
        fileName: cmd + '_case.js',
        mimetype: 'application/javascript',
        caption: '📄 *' + prefix + cmd + '* — Case (ficheiro)\n📁 Origem: ' + fileSrc.file + ':' + fileSrc.line + '\n📊 Linhas: ' + fileCode.split('\n').length + aliasLine + '\n\n♻️ Pronto para *' + prefix + 'addcase ' + cmd + '*',
      }, { quoted: msg });
      await m.react('✅');
      return;
    }

    // ═══ 3. COMANDOS NATIVOS ═══
    try {
      const nc = require('./nativeCommands');
      if (nc[cmd] && typeof nc[cmd] === 'function') {
        const fnStr = exportNativeCase(cmd, nc[cmd], 'nativo (nativeCommands.js)');
        await sock.sendMessage(ctx.remoteJid, {
          document: Buffer.from(fnStr, 'utf8'),
          fileName: cmd + '_case.js',
          mimetype: 'application/javascript',
          caption: '📄 *' + prefix + cmd + '* — Case (nativo)\n📊 Linhas: ' + fnStr.split('\n').length + '\n\n♻️ Pronto para *' + prefix + 'addcase ' + cmd + '*\n⚠️ Pode depender de módulos internos (ver notas no topo).',
        }, { quoted: msg });
        await m.react('✅');
        return;
      }
    } catch {}

    // ═══ 4. PACOTES ═══
    const pkgPaths = { interactions: './packages/interactions', family: './packages/family', economy: './packages/economy', games: './packages/games', cheats: './packages/cheats' };
    for (const [pkgName, pkgPath] of Object.entries(pkgPaths)) {
      try {
        const pkg = require(pkgPath);
        if (pkg[cmd] && typeof pkg[cmd] === 'function') {
          const fnStr = exportNativeCase(cmd, pkg[cmd], 'pacote ' + pkgName);
          await sock.sendMessage(ctx.remoteJid, {
            document: Buffer.from(fnStr, 'utf8'),
            fileName: cmd + '_case.js',
            mimetype: 'application/javascript',
            caption: '📄 *' + prefix + cmd + '* — Case (pacote ' + pkgName + ')\n📊 Linhas: ' + fnStr.split('\n').length + '\n\n♻️ Pronto para *' + prefix + 'addcase ' + cmd + '*',
          }, { quoted: msg });
          await m.react('✅');
          return;
        }
      } catch {}
    }

    // ═══ 4b. v7.39: cases registados DENTRO do caseHandler (addcase, downcase, listcases…) ═══
    try {
      const self = extractSourceFromFile(__filename, 'caseHandler.js').find(r => r.commands.includes(cmd));
      if (self) {
        const code = buildCaseExport(cmd, _bodyOf(self.code).body, { origem: 'gestão (caseHandler.js)', ficheiro: 'caseHandler.js', linha: self.line, aliases: self.commands, nota: 'usa funções internas do caseHandler (addDynamicCase, validateCase…) — só para consulta.' });
        await sock.sendMessage(ctx.remoteJid, { document: Buffer.from(code, 'utf8'), fileName: cmd + '_case.js', mimetype: 'application/javascript', caption: '📄 *' + prefix + cmd + '* — Case (gestão)\n📁 caseHandler.js:' + self.line + '\n📊 Linhas: ' + code.split('\n').length }, { quoted: msg });
        await m.react('✅');
        return;
      }
    } catch {}

    // ═══ 5. NÃO ENCONTRADO ═══
    if (CASES.has(cmd)) {
      m.reply('📄 *' + prefix + cmd + '* existe mas o código-fonte não está acessível.');
    } else {
      const allCmds = Array.from(CASES.keys());
      const similar = allCmds.filter(c => c.includes(cmd) || cmd.includes(c)).slice(0, 5);
      const sug = similar.length ? '\n\n💡 *Comandos parecidos:*\n' + similar.map(c => '  • ' + prefix + c).join('\n') : '';
      m.reply('❌ Comando *' + prefix + cmd + '* não encontrado.' + sug);
    }
  });

  // ── !auditcmds — AUDITORIA DE COMANDOS ──────────────────────────
  registerCase(['auditcmds', 'audit', 'verificarcmds', 'cmdcheck'], async ({ m, sock, msg, ctx, isOwner, prefix }) => {
    if (!isOwner) return m.reply('🚫 Só o Dono.');

    await m.react('🔍');

    // Duplicados
    const duplicates = [];
    const cmdSources = new Map();
    for (const [c, meta] of COMMAND_REGISTRY.entries()) {
      if (!cmdSources.has(c)) cmdSources.set(c, []);
      cmdSources.get(c).push(meta.file);
    }
    for (const [c, files] of cmdSources.entries()) {
      const unique = [...new Set(files)];
      if (unique.length > 1) duplicates.push({ cmd: c, files: unique });
    }

    // Aliases excessivos
    const tooManyAliases = [];
    const seen = new Set();
    for (const [c, src] of FILE_SOURCES.entries()) {
      if (seen.has(c)) continue;
      for (const a of src.aliases) seen.add(a);
      if (src.aliases.length > 2) {
        tooManyAliases.push({ cmd: src.aliases[0], aliases: src.aliases, file: src.file, count: src.aliases.length });
      }
    }

    // Contagens
    let nativeCount = 0, pkgCount = 0;
    try { nativeCount = Object.keys(require('./nativeCommands')).filter(k => typeof require('./nativeCommands')[k] === 'function').length; } catch {}
    for (const p of ['interactions', 'family', 'economy', 'games', 'cheats']) {
      try { pkgCount += Object.keys(require('./packages/' + p)).filter(k => typeof require('./packages/' + p)[k] === 'function').length; } catch {}
    }

    // Relatório
    let r = '🕸️ *AUDITORIA DE COMANDOS*\n\n';
    r += '📊 *Resumo:*\n';
    r += '  • Cases: ' + CASES.size + '\n';
    r += '  • Fontes: ' + FILE_SOURCES.size + '\n';
    r += '  • Nativos: ' + nativeCount + '\n';
    r += '  • Pacotes: ' + pkgCount + '\n';
    r += '  • Total: ' + (CASES.size + nativeCount + pkgCount) + '\n\n';

    if (duplicates.length) {
      r += '⚠️ *DUPLICADOS (' + duplicates.length + '):*\n';
      for (const d of duplicates.slice(0, 15)) r += '  🔁 *' + prefix + d.cmd + '* → ' + d.files.join(', ') + '\n';
      if (duplicates.length > 15) r += '  ... +' + (duplicates.length - 15) + '\n';
      r += '\n';
    } else {
      r += '✅ Sem duplicados\n\n';
    }

    if (tooManyAliases.length) {
      r += '📎 *ALIASES >2 (' + tooManyAliases.length + '):*\n';
      for (const a of tooManyAliases.slice(0, 15)) r += '  📌 *' + prefix + a.cmd + '* (' + a.count + '): ' + a.aliases.join(', ') + '\n  📁 ' + a.file + '\n';
      r += '\n';
    } else {
      r += '✅ Todos ≤2 aliases\n\n';
    }

    const fileCounts = {};
    for (const [, s] of FILE_SOURCES.entries()) fileCounts[s.file] = (fileCounts[s.file] || 0) + 1;
    const sorted = Object.entries(fileCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
    r += '📁 *Top ficheiros:*\n';
    for (const [f, c] of sorted) r += '  • ' + f + ': ' + c + ' cmds\n';

    if (r.length > 3500) {
      await sock.sendMessage(ctx.remoteJid, { document: Buffer.from(r, 'utf8'), fileName: 'audit.txt', mimetype: 'text/plain', caption: '🕸️ Auditoria: ' + duplicates.length + ' dup, ' + tooManyAliases.length + ' aliases>' }, { quoted: msg });
    } else {
      await m.reply(r);
    }
    await m.react('✅');
  });


  // ── !listcases ──────────────────────────────────────────
  registerCase(['listcases', 'listcmds', 'mycases', 'listcase'], async ({ m, isOwner, prefix }) => {
    if (!isOwner) return m.reply('🚫 Só o Dono pode ver os cases dinâmicos.');
    const list = await listDynamicCases();
    if (!list.length) return m.reply(
      `📭 *Sem cases dinâmicos.*\n\nAdiciona com:\n*${prefix}addcase <nome>*\ne o código abaixo`
    );

    const total = CASES.size;
    const lines = list.map((c, i) =>
      `  ⌬ *${prefix}${c.cmd}* [${c.format}] — _${c.preview}..._`
    ).join('\n');

    m.reply(
      `╔━᳀『 🕸️ CASES DINÂMICOS 』═᳀\n` +
      `\n  Total geral: *${total}* | Dinâmicos: *${list.length}*\n\n` +
      `${lines}\n\n` +
      `╚═━═━═━═━═━═━═━═᳀\n` +
      `> *${prefix}addcase* <cmd> + código\n` +
      `> *${prefix}testcase* <cmd> — testar compilação\n` +
      `> *${prefix}downcase* <cmd> — ver código\n` +
      `> *${prefix}removicase* <cmd> — remover`
    );
  });

  // ── !runcase <cmd> [args] ────────────────────────────────────
  registerCase(['runcase', 'execcase'], async ({ m, sock, msg, ctx, args, prefix, isOwner, config }) => {
    if (!isOwner) return m.reply('🚫 Só o Dono pode executar cases directamente.');
    const cmd = (args[0] || '').toLowerCase().trim();
    if (!cmd) return m.reply(`❌ Uso: *${prefix}runcase* <comando> [args...]`);

    const caseArgs = args.slice(1);
    const caseText = caseArgs.join(' ');
    const rawCtx = { sock, msg, ctx, args: caseArgs, text: caseText, prefix, isOwner, config };
    const handled = await runCase(cmd, rawCtx);
    if (!handled) m.reply(`❌ Case *${prefix}${cmd}* não encontrado.`);
  });

  // ── !reloadcases ──────────────────────────────────────────
  registerCase(['reloadcases', 'recarregarcases', 'refreshcases'], async ({ m, isOwner }) => {
    if (!isOwner) return m.reply('🚫 Só o Dono.');
    const before = CASES.size;
    loadCases();
    await loadDynamicCases();
    m.reply(`✅ Cases recarregados!\nAntes: ${before} | Agora: ${CASES.size}`);
  });
}

// ─────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────
function init() {
  registerManagementCases();
  loadCases();
  loadDynamicCases().catch(() => {});
}

module.exports = {
  registerCase,
  runCase,
  loadCases,
  loadDynamicCases,
  addDynamicCase,
  delDynamicCase,
  listDynamicCases,
  getDynamicCaseSource,
  validateCase,
  detectFormat,
  extractCommandName,
  ensureDeps,
  installMissingDeps,
  buildM,
  CASES,
  CASES_SOURCE,
  CASES_META,
  extractCaseCode,
  extractBalancedBlock,
  decodeHtmlEntities,
  stripCodeFences,
  compileCase,
  adaptCaseCode,
  FILE_SOURCES,
  COMMAND_REGISTRY,
  extractSourceFromFile,
  buildCaseExport, exportFileCase, exportNativeCase,
  init,
  FORMAT,
};
