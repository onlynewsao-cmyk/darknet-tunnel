/**
 * Script para actualizar o caseHandler.js com:
 * 1. Source extraction durante loadCases()
 * 2. !downcase universal (qualquer comando)
 * 3. !auditcmds (duplicados + aliases excessivos)
 */
'use strict';

const fs = require('fs');
const code = fs.readFileSync('src/bot/caseHandler.js', 'utf8');
const lines = code.split('\n');
const out = [];

let skipUntil = null;
let injected = {
  registries: false,
  extractor: false,
  loadCases: false,
  management: false,
};

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const next = lines[i + 1] || '';
  const trim = line.trim();

  // ── 1. Inject FILE_SOURCES and COMMAND_REGISTRY ──
  if (!injected.registries && trim === 'const CASES_META = new Map(); // guarda metadata: formato, origem, deps') {
    out.push(line);
    out.push('');
    out.push('// ─────────────────────────────────────────────────────');
    out.push('// REGISTRO DE CÓDIGO-FONTE POR FICHEIRO');
    out.push('// Populado durante loadCases() — permite !downcase para QUALQUER comando');
    out.push('// ─────────────────────────────────────────────────────');
    out.push('const FILE_SOURCES = new Map();   // cmd → { file, code, aliases, line }');
    out.push('const COMMAND_REGISTRY = new Map(); // cmd → { aliases, file, source }');
    injected.registries = true;
    continue;
  }

  // ── 2. Inject extractSourceFromFile before loadCases ──
  if (!injected.extractor && trim.startsWith('// CARREGAR FICHEIROS src/bot/cases/')) {
    out.push('// ─────────────────────────────────────────────────────');
    out.push('// EXTRAIR SOURCE DE CADA registerCase() DUM FICHEIRO');
    out.push('// ─────────────────────────────────────────────────────');
    out.push('function extractSourceFromFile(filePath, fileName) {');
    out.push('  try {');
    out.push('    const content = fs.readFileSync(filePath, "utf8");');
    out.push('    const results = [];');
    out.push('    const regex = /registerCase\\s*\\(\\s*(\\[[^\\]]+\\]|["\'`][^"\'`]+["\'`])\\s*,\\s*((?:async\\s+)?(?:function|\\([^)]*\\)\\s*=>|\\w+))/g;');
    out.push('    let match;');
    out.push('    while ((match = regex.exec(content)) !== null) {');
    out.push('      const cmdsRaw = match[1].trim();');
    out.push('      const startPos = match.index;');
    out.push('      let cmds = [];');
    out.push('      try {');
    out.push('        if (cmdsRaw.startsWith("[")) cmds = JSON.parse(cmdsRaw.replace(/\'/g, "\\""));');
    out.push('        else cmds = [cmdsRaw.replace(/["\']/g, "")];');
    out.push('      } catch { cmds = [cmdsRaw]; }');
    out.push('      let depth = 0, started = false, endPos = startPos;');
    out.push('      for (let j = startPos; j < Math.min(content.length, startPos + 50000); j++) {');
    out.push('        if (content[j] === "(") { depth++; started = true; }');
    out.push('        if (content[j] === ")") { depth--; }');
    out.push('        if (started && depth === 0) { endPos = j + 1; break; }');
    out.push('      }');
    out.push('      let blockCode = content.slice(startPos, endPos);');
    out.push('      let handlerCode = blockCode');
    out.push('        .replace(/^registerCase\\s*\\(\\s*(?:\\[[^\\]]+\\]|["\'`][^"\'`]+["\'`])\\s*,\\s*/, "")');
    out.push('        .replace(/\\s*,\\s*(?:true|false|\\{[^}]*\\})\\s*\\)\\s*;?\\s*$/, "")');
    out.push('        .replace(/\\)\\s*;?\\s*$/, "")');
    out.push('        .trim();');
    out.push('      const beforeMatch = content.slice(0, startPos);');
    out.push('      const lineNum = (beforeMatch.match(/\\n/g) || []).length + 1;');
    out.push('      results.push({ commands: cmds, code: handlerCode, fullBlock: blockCode, file: fileName, line: lineNum });');
    out.push('    }');
    out.push('    return results;');
    out.push('  } catch (e) {');
    out.push('    console.warn("[Cases] extractSourceFromFile " + fileName + ":", (e.message || "").slice(0, 80));');
    out.push('    return [];');
    out.push('  }');
    out.push('}');
    out.push('');
    injected.extractor = true;
    // Don't continue — let the original comment through
  }

  // ── 3. Modify loadCases to populate FILE_SOURCES ──
  if (!injected.loadCases && trim === 'FILE_SOURCES.clear();') {
    // Already injected (from a previous run) — skip
    injected.loadCases = true;
  }

  if (!injected.loadCases && trim === 'console.log(`[Cases] ${CASES.size} cases carregados`);') {
    // Insert FILE_SOURCES/COMMAND_REGISTRY population before the console.log
    // We need to go back and modify loadCases — instead, inject after the for loop
    out.push('  // Populate source registries');
    out.push('  for (const file of files) {');
    out.push('    const fullPath = path.join(dir, file);');
    out.push('    try {');
    out.push('      const sources = extractSourceFromFile(fullPath, file);');
    out.push('      for (const src of sources) {');
    out.push('        for (const cmd of src.commands) {');
    out.push('          const key = cmd.toLowerCase().trim();');
    out.push('          FILE_SOURCES.set(key, { file, code: src.code, fullBlock: src.fullBlock, line: src.line, aliases: src.commands });');
    out.push('          COMMAND_REGISTRY.set(key, { aliases: src.commands, file, source: "case_file" });');
    out.push('        }');
    out.push('      }');
    out.push('    } catch {}');
    out.push('  }');
    out.push(line.replace('cases carregados', 'cases carregados | ${FILE_SOURCES.size} fontes extraídas'));
    injected.loadCases = true;
    continue;
  }

  // ── 4. Replace management cases section ──
  if (!injected.management && trim.startsWith("// ── !downcase")) {
    skipUntil = '// ── !listcases';
    // Inject new downcase + auditcmds
    const newCode = getNewDowncaseAndAudit();
    out.push(newCode);
    injected.management = true;
    continue;
  }

  if (skipUntil && trim.startsWith(skipUntil)) {
    skipUntil = null;
  }

  if (skipUntil) continue;

  out.push(line);
}

// Add exports
const finalCode = out.join('\n')
  .replace('extractCaseCode,', 'extractCaseCode,\n  FILE_SOURCES,\n  COMMAND_REGISTRY,\n  extractSourceFromFile,');

fs.writeFileSync('src/bot/caseHandler.js', finalCode);
console.log('✅ caseHandler.js actualizado com sucesso');

function getNewDowncaseAndAudit() {
  return `
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
      const fullCode = "case '" + cmd + "': {\\n" + dynSrc + "\\nbreak;\\n}";
      await sock.sendMessage(ctx.remoteJid, {
        document: Buffer.from(fullCode, 'utf8'),
        fileName: cmd + '_dynamic.js',
        mimetype: 'application/javascript',
        caption: '📄 *' + prefix + cmd + '* — Case Dinâmico\\n📝 Formato: ' + (meta.format || detectFormat(dynSrc)) + '\\n📊 Linhas: ' + fullCode.split('\\n').length,
      }, { quoted: msg });
      await m.react('✅');
      return;
    }

    // ═══ 2. FICHEIRO DE CASES (source registry) ═══
    const fileSrc = FILE_SOURCES.get(cmd);
    if (fileSrc) {
      const aliases = fileSrc.aliases.filter(a => a !== cmd);
      const aliasLine = aliases.length ? '\\n📎 Aliases: ' + aliases.map(a => prefix + a).join(', ') : '';
      const fileCode = fileSrc.fullBlock || fileSrc.code;
      await sock.sendMessage(ctx.remoteJid, {
        document: Buffer.from(fileCode, 'utf8'),
        fileName: cmd + '_' + fileSrc.file,
        mimetype: 'application/javascript',
        caption: '📄 *' + prefix + cmd + '* — Case File\\n📁 Ficheiro: ' + fileSrc.file + ':' + fileSrc.line + '\\n📊 Linhas: ' + fileCode.split('\\n').length + aliasLine,
      }, { quoted: msg });
      await m.react('✅');
      return;
    }

    // ═══ 3. COMANDOS NATIVOS ═══
    try {
      const nc = require('./nativeCommands');
      if (nc[cmd] && typeof nc[cmd] === 'function') {
        const fnStr = nc[cmd].toString();
        await sock.sendMessage(ctx.remoteJid, {
          document: Buffer.from(fnStr, 'utf8'),
          fileName: 'native_' + cmd + '.js',
          mimetype: 'application/javascript',
          caption: '📄 *' + prefix + cmd + '* — Comando Nativo\\n📊 Tamanho: ' + fnStr.length + ' chars\\n⚠️ Código interno — edita com cuidado.',
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
          const fnStr = pkg[cmd].toString();
          await sock.sendMessage(ctx.remoteJid, {
            document: Buffer.from(fnStr, 'utf8'),
            fileName: pkgName + '_' + cmd + '.js',
            mimetype: 'application/javascript',
            caption: '📄 *' + prefix + cmd + '* — Pacote: ' + pkgName + '\\n📊 Tamanho: ' + fnStr.length + ' chars',
          }, { quoted: msg });
          await m.react('✅');
          return;
        }
      } catch {}
    }

    // ═══ 5. NÃO ENCONTRADO ═══
    if (CASES.has(cmd)) {
      m.reply('📄 *' + prefix + cmd + '* existe mas o código-fonte não está acessível.');
    } else {
      const allCmds = Array.from(CASES.keys());
      const similar = allCmds.filter(c => c.includes(cmd) || cmd.includes(c)).slice(0, 5);
      const sug = similar.length ? '\\n\\n💡 *Comandos parecidos:*\\n' + similar.map(c => '  • ' + prefix + c).join('\\n') : '';
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
    let r = '🕸️ *AUDITORIA DE COMANDOS*\\n\\n';
    r += '📊 *Resumo:*\\n';
    r += '  • Cases: ' + CASES.size + '\\n';
    r += '  • Fontes: ' + FILE_SOURCES.size + '\\n';
    r += '  • Nativos: ' + nativeCount + '\\n';
    r += '  • Pacotes: ' + pkgCount + '\\n';
    r += '  • Total: ' + (CASES.size + nativeCount + pkgCount) + '\\n\\n';

    if (duplicates.length) {
      r += '⚠️ *DUPLICADOS (' + duplicates.length + '):*\\n';
      for (const d of duplicates.slice(0, 15)) r += '  🔁 *' + prefix + d.cmd + '* → ' + d.files.join(', ') + '\\n';
      if (duplicates.length > 15) r += '  ... +' + (duplicates.length - 15) + '\\n';
      r += '\\n';
    } else {
      r += '✅ Sem duplicados\\n\\n';
    }

    if (tooManyAliases.length) {
      r += '📎 *ALIASES >2 (' + tooManyAliases.length + '):*\\n';
      for (const a of tooManyAliases.slice(0, 15)) r += '  📌 *' + prefix + a.cmd + '* (' + a.count + '): ' + a.aliases.join(', ') + '\\n  📁 ' + a.file + '\\n';
      r += '\\n';
    } else {
      r += '✅ Todos ≤2 aliases\\n\\n';
    }

    const fileCounts = {};
    for (const [, s] of FILE_SOURCES.entries()) fileCounts[s.file] = (fileCounts[s.file] || 0) + 1;
    const sorted = Object.entries(fileCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
    r += '📁 *Top ficheiros:*\\n';
    for (const [f, c] of sorted) r += '  • ' + f + ': ' + c + ' cmds\\n';

    if (r.length > 3500) {
      await sock.sendMessage(ctx.remoteJid, { document: Buffer.from(r, 'utf8'), fileName: 'audit.txt', mimetype: 'text/plain', caption: '🕸️ Auditoria: ' + duplicates.length + ' dup, ' + tooManyAliases.length + ' aliases>' }, { quoted: msg });
    } else {
      await m.reply(r);
    }
    await m.react('✅');
  });

`;
}
