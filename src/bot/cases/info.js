/**
 * DARK BOT v5 — Cases de Informação
 * ping, info, dono, criador, id, aiapis, vip
 */
'use strict';

const config        = require('../../config');
const botConfigCache = require('../botConfigCache');
const changeThemes  = require('../changeThemes');

/**
 * Helper: retorna o tema activo (por grupo ou global)
 * v5.3: usa themeResolver para "camuflagem 100%" por grupo
 */
const themeResolver = require('../themeResolver');
async function getActiveTheme(groupJid = null) {
  try { return await themeResolver.getThemeForContext(groupJid); }
  catch { return changeThemes.getTheme('dark'); }
}

module.exports = function registerInfoCases(registerCase) {

  // ── case 'ping' ────────────────────────────────────────────
  registerCase(['ping', 'speed', 'lat'], async ({ sock, msg, ctx, reply, react }) => {
    // Ping rápido: uma única operação WhatsApp. A versão anterior enviava
    // "Calculando" e depois fazia edit, duplicando o round-trip e inflando
    // a latência apresentada. Aqui medimos processamento local (não o
    // tempo de entrega do WhatsApp) e enviamos somente a resposta final.
    const t0   = Date.now();
    const t    = await getActiveTheme(ctx.remoteJid);
    const RE   = require('../renderEngine');
    const ram  = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    const lat  = Date.now() - t0;
    const bar  = lat < 100 ? '🟢 Excelente' : lat < 300 ? '🟡 Boa' : '🔴 Alta';

    const txt = RE.renderInfo(t, [
      ['PONG', `${config.bot.name}`],
      ['PROCESSAMENTO', `${lat}ms ${bar}`],
      ['RAM', `${ram} MB`],
      ['TEMA', `${t.name.toUpperCase()}`],
    ], { title: 'PING', botName: config.bot.name });

    await sock.sendMessage(ctx.remoteJid, { text: txt }, { quoted: msg });
  });

  // ── case 'id' / 'jid' ─────────────────────────────────────
  registerCase(['id', 'jid', 'myid'], async ({ ctx, reply }) => {
    const t = await getActiveTheme(ctx.remoteJid);
    const f = t.frame;
    const b = t.bullet;
    return reply(
      `${f[0]}${f[4].repeat(20)}${f[1]}\n` +
      `${f[5]} ${t.icon} *SEUS IDs* ${f[5]}\n` +
      `${f[2]}${f[4].repeat(20)}${f[3]}\n\n` +
      `${b} Número: *+${ctx.senderNumber}*\n` +
      `${b} JID: \`${ctx.senderJid}\`\n` +
      `${b} Chat: \`${ctx.remoteJid}\`\n` +
      (ctx.isGroup ? `${b} Grupo: *${ctx.groupName}*` : `${b} Chat Privado`) +
      `\n\n> ${t.vibe}`
    );
  });

  // ── case 'perfil' ──────────────────────────────────────────
  registerCase(['perfil', 'perfiluser', 'rankuser'], async ({ sock, msg, ctx, reply, prefix }) => {
    const t = await getActiveTheme(ctx.remoteJid);
    const f = t.frame;
    const b = t.bullet;
    const W = 26;
    const bar = (txt) => `${f[5]} ${String(txt).slice(0, W).padEnd(W)} ${f[5]}`;

    // v6.40: cargo resolvido pelo roleResolver — fonte ÚNICA de verdade
    // 👑 DONO SUPREMO > 💎 VIP > 🛡️ ADMIN > 🆓 FREE
    const roleResolver = require('../roleResolver');
    const rinfo = await roleResolver.resolveRole({ ctx, msg, sock })
      .catch(() => ({ cargo: '🆓 FREE', vip: 'INATIVO ❌', user: null }));

    const cargo  = rinfo.cargo;
    const vipTxt = rinfo.vip;

    let cmds = 0;
    let desde = '—';
    let genero = 'não definido';
    try {
      const u = rinfo.user;
      if (u) {
        cmds   = u.commandsUsed || 0;
        desde  = u.createdAt ? new Date(u.createdAt).toLocaleDateString('pt-BR') : '—';
        genero = { male: '♂ Masculino', female: '♀ Feminino', other: '⚧ Outro' }[u.gender] || 'não definido';
      }
    } catch {}

    const txt =
      `${f[0]}${f[4].repeat(W + 2)}${f[1]}\n` +
      bar(`${t.icon} ᴘᴇʀғɪʟ ᴅᴇ ᴜsᴜáʀɪᴏ`) + '\n' +
      bar(t.vibe.slice(0, W)) + '\n' +
      `${f[2]}${f[4].repeat(W + 2)}${f[3]}\n\n` +
      `${b} 👤 Nome: *${ctx.pushName || 'Desconhecido'}*\n` +
      `${b} 📱 Número: *+${ctx.senderNumber}*\n` +
      `${b} 🎭 Cargo: *${cargo}*\n` +
      `${b} ⭐ VIP: *${vipTxt}*\n` +
      `${b} ⚧ Género: *${genero}*\n` +
      `${b} 🧮 Comandos: *${cmds}*\n` +
      `${b} 📅 No bot desde: *${desde}*\n` +
      `${b} 📍 Local: ${ctx.isGroup ? `*${ctx.groupName || 'grupo'}*` : '*chat privado*'}\n\n` +
      `> ${t.icon} ${prefix}alterargenero — mudar género\n` +
      `> ${t.icon} ${prefix}vip — tornar-se VIP`;

    return reply(txt);
  });

  // ── case 'donos' ───────────────────────────────────────────
  registerCase(['donos', 'subdonos', 'equipe', 'staff'], async ({ reply }) => {
    const t = await getActiveTheme(ctx.remoteJid);
    const f = t.frame;
    const b = t.bullet;

    const extras = await botConfigCache.get('owner_numbers', []).catch(() => []);
    const extraList = (Array.isArray(extras) ? extras : String(extras || '').split(/[\s,]+/))
      .map(n => String(n).replace(/\D/g, '')).filter(n => n.length >= 8);

    const lines = [
      `${f[0]}${f[4].repeat(28)}${f[1]}`,
      `${f[5]} ${t.icon} ᴅᴏɴᴏs ᴅᴏ ${config.bot.name} ${t.icon}`,
      `${f[2]}${f[4].repeat(28)}${f[3]}`,
      '',
      `${b} 👑 *Dono Supremo:* ${config.owner.name}`,
      `${b}    wa.me/${config.owner.number}`,
    ];
    if (extraList.length) {
      lines.push('');
      extraList.forEach((n, i) => lines.push(`${b} 🛡️ *Sub-Dono ${i + 1}:* +${n}\n${b}    wa.me/${n}`));
    }
    lines.push('', `> ${t.vibe}`);

    return reply(lines.join('\n'));
  });

  // ── rankativos / rankativo / rankinativo ────────────────────
  // v7.3 — deixou de ser stub ("Uso: <args>") e passou a mostrar o
  // ranking REAL de atividade do grupo, a partir do GroupMemberActivity
  // (mensagens e comandos registados pelo messageListener/commandHandler).
  registerCase(['rankativos', 'rankativo', 'rankinativo'], async ({ sock, msg, ctx, reply, command }) => {
    const t = await getActiveTheme(ctx.remoteJid);
    const f = t.frame;
    const b = t.bullet;
    const ehInativo = command === 'rankinativo';

    if (!ctx.isGroup) return reply('👥 O ranking de atividade é só em *grupos*.');

    let docs = [];
    try {
      const GroupMemberActivity = require('../database/models/GroupMemberActivity');
      docs = await GroupMemberActivity.find({ groupJid: ctx.remoteJid })
        .sort(ehInativo ? { lastMessageAt: 1, messages: 1 } : { messages: -1, lastMessageAt: -1 })
        .limit(10)
        .lean()
        .catch(() => []);
    } catch {}

    if (!Array.isArray(docs) || !docs.length) {
      return reply(
        `${f[0]}${f[4].repeat(24)}${f[1]}\n` +
        `${f[5]} ${t.icon} ${ehInativo ? 'ʀᴀɴᴋ ɪɴᴀᴛɪᴠᴏ' : 'ʀᴀɴᴋ ᴀᴛɪᴠᴏ'} ${t.icon}\n` +
        `${f[2]}${f[4].repeat(24)}${f[3]}\n\n` +
        `${b} Ainda não há atividade registada neste grupo.\n` +
        `${b} Manda umas mensagens e tenta outra vez. 🕸️\n\n` +
        `> ${t.vibe}`
      );
    }

    const medalhas = ['🥇', '🥈', '🥉'];
    const linhas = [
      `${f[0]}${f[4].repeat(24)}${f[1]}`,
      `${f[5]} ${t.icon} ${ehInativo ? 'ʀᴀɴᴋ ɪɴᴀᴛɪᴠᴏ' : 'ʀᴀɴᴋ ᴀᴛɪᴠᴏ'} ${t.icon}`,
      `${f[2]}${f[4].repeat(24)}${f[3]}`,
      '',
    ];
    const mentions = [];
    docs.forEach((d, i) => {
      const nome = (d.pushName || d.memberNumber || '?').toString().slice(0, 20);
      const jid = d.memberJid;
      if (jid) mentions.push(jid);
      const medal = medalhas[i] || `#${i + 1}`;
      const msgs = d.messages || 0;
      const cmds = d.commands || 0;
      const quando = d.lastMessageAt ? new Date(d.lastMessageAt).toLocaleDateString('pt-BR') : '—';
      const extra = ehInativo
        ? `— visto a ${quando}`
        : `— ${msgs} msgs · ${cmds} cmds`;
      linhas.push(`${b} ${medal} @${(d.memberNumber || '?')} ${extra}\n${b}    ${nome}`);
    });
    linhas.push('', `> ${t.vibe}`);

    const texto = linhas.join('\n');
    return sock.sendMessage(ctx.remoteJid, { text: texto, mentions }, { quoted: msg });
  });

  // ── hora / data ────────────────────────────────────────────
  registerCase(['hora', 'horas', 'data', 'date', 'agora'], async ({ sock, msg, ctx }) => {
    const t = await getActiveTheme(ctx.remoteJid);
    const f = t.frame;
    const b = t.bullet;
    const agora = new Date();
    const data = agora.toLocaleDateString('pt-PT', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    const hora = agora.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const fuso = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    return reply(
      `${f[0]}${f[4].repeat(22)}${f[1]}\n` +
      `${f[5]} ${t.icon} HORA E DATA ${t.icon}\n` +
      `${f[2]}${f[4].repeat(22)}${f[3]}\n\n` +
      `${b} 📅 ${data}\n` +
      `${b} ⏰ ${hora}\n` +
      `${b} 🌍 Fuso: ${fuso}\n\n` +
      `> ${t.vibe}`
    );
  });

  // ── diagnóstico / diag — estado real do bot ────────────────
  registerCase(['diagnostico', 'diagnóstico', 'diag'], async ({ ctx, reply }) => {
    const t = await getActiveTheme(ctx.remoteJid);
    const f = t.frame;
    const b = t.bullet;

    const fmtUptime = (s) => {
      s = Math.floor(s || 0);
      const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
      return d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}m ${s % 60}s`;
    };

    let waStatus = 'desconhecido';
    let waNum = '—';
    let msgs = 0, cmds = 0;
    try {
      const bot = require('../whatsapp').getBot();
      const st = bot.getStatus();
      waStatus = st.status || 'desconhecido';
      waNum = st.user?.id ? String(st.user.id).split(':')[0].split('@')[0] : '—';
      msgs = st.messageCount || 0;
      cmds = st.commandCount || 0;
    } catch {}

    let mongo = 'desconectado';
    try {
      const mongoose = require('mongoose');
      mongo = mongoose.connection.readyState === 1 ? 'conectado' : 'desconectado';
    } catch {}

    let versao = '?';
    try { versao = require('../../../package.json').version || '?'; } catch { try { versao = require('../../package.json').version || '?'; } catch {} }

    const ram = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    const uptimeProc = fmtUptime(process.uptime());

    return reply(
      `${f[0]}${f[4].repeat(24)}${f[1]}\n` +
      `${f[5]} ${t.icon} DIAGNÓSTICO DO BOT ${t.icon}\n` +
      `${f[2]}${f[4].repeat(24)}${f[3]}\n\n` +
      `${b} 🤖 Bot: *${config.bot.name}* v${versao}\n` +
      `${b} 📶 WhatsApp: *${waStatus}* (${waNum})\n` +
      `${b} 🗄️ MongoDB: *${mongo}*\n` +
      `${b} ⏱️ Uptime: *${uptimeProc}*\n` +
      `${b} 🧠 RAM: *${ram} MB*\n` +
      `${b} 💬 Mensagens: *${msgs}* · Comandos: *${cmds}*\n` +
      `${b} 🔧 Node: *${process.version}*\n\n` +
      `> ${t.vibe}`
    );
  });

  // ── help (alias do menu) ───────────────────────────────────
  registerCase(['help', 'ajuda', 'comandos', 'cmds'], async ({ sock, msg, ctx, config }) => {
    try {
      const nc = require('../nativeCommands');
      return await nc.menu({ sock, msg, ctx, config, isOwner: ctx.isOwner });
    } catch (e) {
      return sock.sendMessage(ctx.remoteJid, { text: '📋 Usa *menu* para ver os comandos.' }, { quoted: msg });
    }
  });

  // ── case 'aiapis' ──────────────────────────────────────────
  registerCase(['aiapis', 'iaapis', 'checkia'], async ({ ctx, prefix, reply }) => {    const aiMod = require('../ai');
    const t     = await getActiveTheme(ctx.remoteJid);
    const b     = t.bullet;

    // v6.42: mostra o estado REAL (chave presente + circuit breaker),
    // em vez de dizer só "OK" por a variável existir.
    const down = aiMod.providerStatus ? aiMod.providerStatus() : {};
    const mark = (key, name) => {
      if (!key) return `\u2b1c *${name}* — sem chave`;
      const secs = down[name.toLowerCase()];
      if (secs) {
        const m = Math.ceil(secs / 60);
        return `\u26a0\ufe0f *${name}* — em pausa (${m} min)`;
      }
      return `\u2705 *${name}* — pronta`;
    };

    const a = config.ai;
    const linhas = [
      `${t.icon} *ARSENAL DE IA — ${config.bot.name}*`,
      ``,
      `*\ud83e\udde0 Texto*`,
      mark(a.groqApiKey,      'Groq'),
      mark(a.geminiApiKey,    'Gemini'),
      mark(a.huggingfaceKey,  'HuggingFace'),
      mark(a.cerebrasApiKey,  'Cerebras'),
      mark(a.apifreellmKey,   'ApiFreeLLM'),
      mark(a.openrouterApiKey,'OpenRouter'),
      ``,
      `*\ud83c\udfa4 Voz & \ud83d\udd0d Pesquisa*`,
      mark(a.elevenlabsKey, 'ElevenLabs'),
      mark(a.assemblyaiKey, 'AssemblyAI'),
      mark(a.tavilyKey,     'Tavily'),
      ``,
      `${b} *Modelos Groq:* ${(aiMod.GROQ_MODELS || []).slice(0, 2).join(' \u00b7 ')}`,
      `${b} *Modelos Gemini:* ${(aiMod.GEMINI_MODELS || []).slice(0, 2).join(' \u00b7 ')}`,
      ``,
      `\u2705 Not\u00edcias RSS \u00b7 Imagens Pollinations \u2014 sem chave`,
      ``,
      (a.groqApiKey || a.geminiApiKey || a.huggingfaceKey)
        ? `\ud83d\udfe2 IA ACTIVA \u2014 *${prefix}ia* <pergunta>`
        : `\ud83d\udd34 IA INACTIVA \u2014 configura GROQ_API_KEY no Render`,
      ``,
      `> ${t.vibe}`,
    ];
    return reply(linhas.join('\n'));
  });
};
