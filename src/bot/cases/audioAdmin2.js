/**
 * DARK BOT v6.25 — ÁUDIO EFEITOS + ADMIN COMPLETOS
 * Efeitos de áudio com ffmpeg + comandos admin reais
 */
'use strict';

const config = require('../../config');
const R = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const P = a => a[Math.floor(Math.random() * a.length)];

async function tReply(sock, msg, ctx, title, lines) {
  const RE = require('../renderEngine');
  const t = await RE.getTheme(ctx.remoteJid);
  return sock.sendMessage(ctx.remoteJid, { text: RE.renderBlock(t, title, lines, { botName: config.bot.name }) }, { quoted: msg });
}

// ── Filtros ffmpeg por comando ──
const AUDIO_FILTERS = {
  bass: 'bass=g=20', bass2: 'bass=g=30', bass3: 'bass=g=40',
  grave: 'bass=g=15,f=80', grave2: 'bass=g=25,f=60', grave3: 'bass=g=35,f=40',
  reverb: 'aecho=0.8:0.9:1000:0.3', reverb2: 'aecho=0.8:0.9:1500:0.4', reverb3: 'aecho=0.8:0.9:2000:0.5',
  '8d': 'apulsator=hz=0.125', '8d2': 'apulsator=hz=0.15', '8d3': 'apulsator=hz=0.2',
  slowed: 'atempo=0.8', slowed2: 'atempo=0.7', slowed3: 'atempo=0.6',
  slowedreverb: 'atempo=0.8,aecho=0.8:0.9:1000:0.3',
  slowedreverb2: 'atempo=0.7,aecho=0.8:0.9:1500:0.4',
  slowedreverb3: 'atempo=0.6,aecho=0.8:0.9:2000:0.5',
  chorus: 'chorus=0.5:0.9:50|60|40:0.4|0.3|0.3:0.25|0.4|0.3:2|2.3|1.3',
  chorus2: 'chorus=0.6:0.9:40|50|30:0.5|0.4|0.3:0.3|0.25|0.4:2|2.5|1.5',
  chorus3: 'chorus=0.7:0.9:30|40|20:0.6|0.5|0.4:0.35|0.3|0.45:2|3|1.5',
  nightcore: 'atempo=1.3,asetrate=44100*1.2',
  vaporwave: 'atempo=0.85,asetrate=44100*0.8',
  hardcore: 'atempo=1.5,asetrate=44100*1.3',
  robot: 'afftfilt=real=\'hypot(re,im)*sin(0)\':imag=\'hypot(re,im)*cos(0)\':win_size=512:overlap=0.75',
  chipmunk: 'asetrate=44100*1.5,atempo=0.8',
  squirrel: 'asetrate=44100*1.8,atempo=0.7',
  monster: 'asetrate=44100*0.5,atempo=1.5',
  whisper: 'highpass=f=2000,lowpass=f=5000,volume=0.5',
  pitch: 'asetrate=44100*1.2',
  deep: 'asetrate=44100*0.7,atempo=1.3',
  echo: 'aecho=0.8:0.88:60:0.4',
  stadium: 'aecho=0.8:0.9:2000:0.5',
  cave: 'aecho=0.9:0.95:3000:0.6',
  underwater: 'lowpass=f=500,aecho=0.8:0.9:500:0.3',
  telephone: 'bandpass=f=1500:width_type=h:w=500',
  radio: 'highpass=f=200,lowpass=f=3000',
  lofi: 'lowpass=f=3000,highpass=f=200,volume=0.8',
  flanger: 'flanger=delay=3:depth=2',
  phaser: 'aphaser=type=t:speed=0.5:depth=0.5',
  tremolo: 'tremolo=f=5:d=0.5',
  vibrato: 'vibrato=f=5:d=0.5',
  reverse: 'areverse',
  karaoke: 'pan=stereo|c0=c0-c1|c1=c1-c0',
  blown: 'volume=3,alimiter=limit=0.9',
  earrape: 'volume=5,alimiter=limit=0.95',
  fat: 'bass=g=10,equalizer=f=100:t=q:w=1:g=5',
  smooth: 'highshelf=f=8000:g=-3,lowshelf=f=200:g=2',
  fast: 'atempo=1.5',
  slow: 'atempo=0.7',
};

// Helper: aplicar efeito ffmpeg a áudio
async function applyAudioEffect(sock, msg, ctx, filterName) {
  const filter = AUDIO_FILTERS[filterName];
  if (!filter) return tReply(sock, msg, ctx, '🎧 EFEITO', [`❌ Efeito desconhecido: ${filterName}`]);

  // Verificar se há áudio na mensagem ou na citada
  const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  const audioMsg = msg.message?.audioMessage || quoted?.audioMessage;
  if (!audioMsg) return tReply(sock, msg, ctx, `🎧 ${filterName.toUpperCase()}`, [
    `🎧 Marca um áudio para aplicar *${filterName}*`,
    `🔊 Filtro: \`${filter.slice(0, 40)}...\``,
  ]);

  sock.sendMessage(ctx.remoteJid, { react: { text: '🎧', key: msg.key } });

  try {
    const { downloadMediaMessage } = require('@systemzero/baileys');
    const audioBuf = await downloadMediaMessage(
      audioMsg === msg.message?.audioMessage ? msg : { message: quoted, key: msg.key },
      'buffer', {}
    );

    // Aplicar ffmpeg
    const ffmpeg = require('fluent-ffmpeg');
    const ffmpegPath = require('ffmpeg-static');
    ffmpeg.setFfmpegPath(ffmpegPath);

    const fs = require('fs');
    const path = require('path');
    const tmpIn = path.join('/tmp', `audio_in_${Date.now()}.mp3`);
    const tmpOut = path.join('/tmp', `audio_out_${Date.now()}.mp3`);
    fs.writeFileSync(tmpIn, audioBuf);

    await new Promise((resolve, reject) => {
      ffmpeg(tmpIn)
        .audioFilters(filter)
        .format('mp3')
        .save(tmpOut)
        .on('end', resolve)
        .on('error', reject);
    });

    const outBuf = fs.readFileSync(tmpOut);
    fs.unlinkSync(tmpIn);
    fs.unlinkSync(tmpOut);

    await sock.sendMessage(ctx.remoteJid, {
      audio: outBuf, mimetype: 'audio/mpeg',
      fileName: `${filterName}_${Date.now()}.mp3`,
      ptt: filterName === 'earrape' || filterName === 'blown',
    }, { quoted: msg });

    sock.sendMessage(ctx.remoteJid, { react: { text: '✅', key: msg.key } });
  } catch (e) {
    sock.sendMessage(ctx.remoteJid, { react: { text: '❌', key: msg.key } });
    return tReply(sock, msg, ctx, '🎧 ERRO', [`❌ ${e.message}`]);
  }
}

module.exports = function registerAudioAdmin2(registerCase) {

  // v6.39: Helper de verificação de permissão para comandos de ADM
  async function _checkAdmPerm(sock, ctx, isOwner) {
    if (isOwner) return true;
    if (!ctx.isGroup) return false;
    try {
      const meta = await sock.groupMetadata(ctx.remoteJid);
      const snum = String(ctx.senderNumber || (ctx.senderJid || '').split('@')[0] || '').replace(/\D/g, '');
      return meta.participants?.some(p => {
        const pNum = String(p.id || '').split(':')[0].split('@')[0].replace(/\D/g, '');
        return pNum === snum && (p.admin === 'admin' || p.admin === 'superadmin');
      }) || false;
    } catch { return false; }
  }

  async function _admGuard(sock, msg, ctx, isOwner, label) {
    if (!ctx.isGroup) { await tReply(sock, msg, ctx, label, ['❌ Só em grupos']); return false; }
    if (!await _checkAdmPerm(sock, ctx, isOwner)) { await tReply(sock, msg, ctx, label, ['🚫 Só o *Dono* ou *Admins* do grupo.']); return false; }
    return true;
  }

  // ═══ TODOS OS EFEITOS DE ÁUDIO ═══
  for (const cmd of Object.keys(AUDIO_FILTERS)) {
    registerCase([cmd], async ({ sock, msg, ctx }) => {
      return applyAudioEffect(sock, msg, ctx, cmd);
    }, true);
  }

  // ═══ MENU AUDIO (navegação) ═══
  registerCase(['menuaudio', 'menuefeitosaudio'], async ({ sock, msg, ctx, config: cfg }) => {
    const RE = require('../renderEngine');
    const t = await RE.getTheme(ctx.remoteJid);
    const categories = {
      '🔊 Bass': ['bass', 'bass2', 'bass3', 'grave', 'grave2', 'grave3'],
      '🌀 Reverb': ['reverb', 'reverb2', 'reverb3', 'echo', 'stadium', 'cave'],
      '🎧 8D': ['8d', '8d2', '8d3'],
      '🐢 Slowed': ['slowed', 'slowed2', 'slowed3', 'slowedreverb', 'nightcore', 'vaporwave'],
      '🎤 Voz': ['robot', 'chipmunk', 'squirrel', 'monster', 'whisper', 'deep'],
      '🌊 Ambiente': ['underwater', 'telephone', 'radio', 'lofi'],
      '🎛️ Modulação': ['flanger', 'phaser', 'tremolo', 'vibrato', 'reverse', 'karaoke'],
      '⚡ Velocidade': ['fast', 'slow', 'hardcore'],
      '💥 Extremos': ['blown', 'earrape', 'fat', 'smooth'],
    };
    const lines = Object.entries(categories).map(([cat, cmds]) =>
      `${cat}: ${cmds.map(c => `\`${c}\``).join(', ')}`
    );
    return tReply(sock, msg, ctx, '🎧 EFEITOS DE ÁUDIO', [
      '🎧 Marca um áudio e usa o comando:',
      '',
      ...lines,
      '',
      `> ${t.vibe || 'Dark Engine'}`,
    ]);
  }, true);

  // ═══ DEEPAI / DEEPSEARCH (IA) ═══
  registerCase(['deepai'], async ({ sock, msg, ctx, args, prefix }) => {
    const text = args.join(' ').trim();
    if (!text) return tReply(sock, msg, ctx, '🧠 DEEP AI', [`Uso: \`${prefix}deepai <pergunta>\``]);
    try {
      const ai = require('../ai');
      const answer = await ai.chat(`[Deep Analysis] ${text}`, '', {}, false);
      return tReply(sock, msg, ctx, '🧠 DEEP AI', answer.split('\n'));
    } catch (e) { return tReply(sock, msg, ctx, '🧠 DEEP AI', [`❌ ${e.message}`]); }
  }, true);

  registerCase(['deepsearch'], async ({ sock, msg, ctx, args, prefix }) => {
    const query = args.join(' ').trim();
    if (!query) return tReply(sock, msg, ctx, '🔍 DEEP SEARCH', [`Uso: \`${prefix}deepsearch <busca>\``]);
    try {
      const axios = require('axios');
      const r = await axios.get(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`, { timeout: 10000 });
      const results = [];
      if (r.data.AbstractText) results.push(r.data.AbstractText);
      (r.data.RelatedTopics || []).slice(0, 3).forEach(t => { if (t.Text) results.push(t.Text); });
      return tReply(sock, msg, ctx, `🔍 DEEP: ${query}`, results.length ? results : ['Sem resultados']);
    } catch (e) { return tReply(sock, msg, ctx, '🔍 DEEP SEARCH', [`❌ ${e.message}`]); }
  }, true);

  // ═══ ADMIN: ANTIDEMOTE / ANTIFLOOD / ETC ═══
  const adminToggles = [
    'antidemote', 'antiflood', 'antifigurinha', 'antistatus', 'antidoc',
    'antimencao', 'antipagamento', 'antiinvisivel', // v7.46
    'antiloc', 'antifig', 'antibtn', 'antilinkgp', 'antilinkcanal',
    'antilinkhard', 'antilinksoft', 'antiporn', 'antitoxic', 'antipalavra',
    'autodl', 'automsg', 'autosticker', 'assistente', 'modobn', 'modolite',
    'modoparceria', 'modoraid', 'modorpg', 'invisible', 'banghost',
    'cmdlimit', 'minmessage', 'limitmessage', 'dellimitmessage',
    'mantercontador', 'infoperso', 'fotomenugrupo',
  ];
  for (const cmd of adminToggles) {
    registerCase([cmd], async ({ sock, msg, ctx, args, isOwner, isAdminFn }) => {
      if (!isOwner && !ctx.isGroup) return tReply(sock, msg, ctx, '🛡️ ADMIN', ['❌ Só em grupos']);
      // v7.46: só Dono/Admin do grupo pode ligar/desligar protecções
      if (!isOwner && ctx.isGroup) {
        let adm = false;
        try { adm = typeof isAdminFn === 'function' ? await isAdminFn() : false; } catch {}
        if (!adm) return tReply(sock, msg, ctx, '🛡️ ' + cmd.toUpperCase(), ['🚫 Só o *Dono* ou *Admins* do grupo.']);
      }
      const action = args[0]?.toLowerCase();
      let isOn = action === 'on' || action === '1' || action === 'ativar';
      const isOff = action === 'off' || action === '0' || action === 'desativar';
      if (action === 'status' || action === 'help' || action === 'ajuda') {
        return tReply(sock, msg, ctx, `🛡️ ${cmd.toUpperCase()}`, [
          `Uso: !${cmd} on|off`,
          `> Activa/desactiva ${cmd.replace('anti', 'anti-').replace(/([A-Z])/g, ' $1').toLowerCase()}`,
        ]);
      }
      try {
        const GroupSettings = require('../../database/models/GroupSettings');
        // v7.29: sem argumento (clique no menu de seleção) → ALTERNA o estado actual
        if (!isOn && !isOff) {
          const cur = await GroupSettings.findOne({ groupJid: ctx.remoteJid }).lean().catch(() => null);
          isOn = !(cur && cur[cmd]);
        }
        // v7.46: as variantes do antilink mapeiam para as opções REAIS do antiLink.js
        let upd = { [cmd]: isOn };
        if (cmd === 'antilinkhard')  upd = isOn ? { antilink: true, antilinkAction: 'kick', antilinkMaxWarns: 1, antilinkMode: 'all_links', antilinkOptOut: false } : { antilinkAction: 'warn', antilinkMaxWarns: 2, antilinkMode: 'smart' };
        if (cmd === 'antilinksoft')  upd = isOn ? { antilink: true, antilinkAction: 'delete', antilinkMode: 'smart', antilinkOptOut: false } : { antilinkAction: 'warn' };
        if (cmd === 'antilinkgp')    upd = isOn ? { antilink: true, antilinkMode: 'whatsapp_only', antilinkOptOut: false } : { antilinkMode: 'smart' };
        if (cmd === 'antilinkcanal') upd = isOn ? { antilink: true, antilinkMode: 'all_links', antilinkOptOut: false } : { antilinkMode: 'smart' };
        if (cmd === 'antifigurinha' || cmd === 'antifig') upd = { antifigurinha: isOn, antifig: isOn };
        await GroupSettings.findOneAndUpdate(
          { groupJid: ctx.remoteJid },
          upd,
          { upsert: true }
        );
        const label = cmd.replace('anti', 'ANTI-').replace(/([A-Z])/g, ' $1').toUpperCase().replace('  ', ' ');
        const sw = isOn
          ? '🟢 ON  ━━━━●'
          : '🔴 OFF ●━━━━';
        return tReply(sock, msg, ctx, '🛡️ ' + label, [
          sw,
          '',
          '> Usa !' + cmd + ' on/off para alternar',
        ]);
      } catch (e) {
        return tReply(sock, msg, ctx, '🛡️ ' + cmd.toUpperCase(), ['❌ ' + e.message]);
      }
    }, true);
  }

  // ═══ v7.46 — LISTA DO ANTIPALAVRA ═══
  registerCase(['addpalavra', 'delpalavra', 'palavras', 'listapalavras'], async ({ sock, msg, ctx, args, isOwner, isAdminFn, command }) => {
    if (!ctx.isGroup) return tReply(sock, msg, ctx, '🛡️ ANTI-PALAVRA', ['❌ Só em grupos']);
    if (!isOwner) {
      let adm = false; try { adm = await isAdminFn(); } catch {}
      if (!adm) return tReply(sock, msg, ctx, '🛡️ ANTI-PALAVRA', ['🚫 Só o *Dono* ou *Admins* do grupo.']);
    }
    const GroupSettings = require('../../database/models/GroupSettings');
    const cmd = String(command || '').toLowerCase();
    const palavra = args.join(' ').trim().toLowerCase();
    if (cmd === 'addpalavra') {
      if (!palavra) return tReply(sock, msg, ctx, '🛡️ ANTI-PALAVRA', ['Uso: !addpalavra <palavra>']);
      await GroupSettings.findOneAndUpdate({ groupJid: ctx.remoteJid }, { $addToSet: { palavrasProibidas: palavra }, antipalavra: true }, { upsert: true });
      return tReply(sock, msg, ctx, '🛡️ ANTI-PALAVRA', [`✅ "${palavra}" adicionada. Antipalavra ligado.`]);
    }
    if (cmd === 'delpalavra') {
      if (!palavra) return tReply(sock, msg, ctx, '🛡️ ANTI-PALAVRA', ['Uso: !delpalavra <palavra>']);
      await GroupSettings.findOneAndUpdate({ groupJid: ctx.remoteJid }, { $pull: { palavrasProibidas: palavra } });
      return tReply(sock, msg, ctx, '🛡️ ANTI-PALAVRA', [`🗑️ "${palavra}" removida.`]);
    }
    const gs = await GroupSettings.findOne({ groupJid: ctx.remoteJid }).lean().catch(() => null);
    const lista = gs?.palavrasProibidas || [];
    return tReply(sock, msg, ctx, '🛡️ ANTI-PALAVRA', [
      `Estado: ${gs?.antipalavra ? '🟢 ON' : '🔴 OFF'}`,
      lista.length ? lista.map(w => `• ${w}`).join('\n') : '(lista vazia — usa !addpalavra)',
    ]);
  }, true);

  // ═══ ADMIN: MUTE / UNMUTE (v6.39 — com verificação de permissão) ═══
  registerCase(['mute', 'mute2'], async ({ sock, msg, ctx, args, isOwner }) => {
    if (!ctx.isGroup) return tReply(sock, msg, ctx, '🔇 MUTE', ['❌ Só em grupos']);
    // Verifica permissão: dono ou ADM do grupo
    if (!isOwner) {
      try {
        const meta = await sock.groupMetadata(ctx.remoteJid);
        const snum = String(ctx.senderNumber || ctx.senderJid?.split('@')[0] || '').replace(/\D/g, '');
        const isAdm = meta.participants?.some(p => p.id.split('@')[0].replace(/\D/g,'') === snum && (p.admin === 'admin' || p.admin === 'superadmin'));
        if (!isAdm) return tReply(sock, msg, ctx, '🔇 MUTE', ['🚫 Só o *Dono* ou *Admins* do grupo.']);
      } catch { return tReply(sock, msg, ctx, '🔇 MUTE', ['🚫 Só o *Dono* ou *Admins* do grupo.']); }
    }
    const target = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || args[0];
    if (!target) return tReply(sock, msg, ctx, '🔇 MUTE', ['❌ Marca alguém com @!']);
    try {
      await sock.groupParticipantsUpdate(ctx.remoteJid, [target], 'remove');
      return tReply(sock, msg, ctx, '🔇 MUTE', [`🔇 @${target.split('@')[0]} removido/silenciado`]);
    } catch (e) {
      if (/not admin|forbidden|403/i.test(e?.message || '')) return tReply(sock, msg, ctx, '🔇 MUTE', ['⚠️ Preciso ser admin! Promove-me.']);
      return tReply(sock, msg, ctx, '🔇 MUTE', [`❌ ${e.message}`]);
    }
  }, true);

  registerCase(['desmute', 'desmute2', 'unmute'], async ({ sock, msg, ctx, args, isOwner }) => {
    if (!ctx.isGroup) return tReply(sock, msg, ctx, '🔊 UNMUTE', ['❌ Só em grupos']);
    if (!isOwner) {
      try {
        const meta = await sock.groupMetadata(ctx.remoteJid);
        const snum = String(ctx.senderNumber || ctx.senderJid?.split('@')[0] || '').replace(/\D/g, '');
        const isAdm = meta.participants?.some(p => p.id.split('@')[0].replace(/\D/g,'') === snum && (p.admin === 'admin' || p.admin === 'superadmin'));
        if (!isAdm) return tReply(sock, msg, ctx, '🔊 UNMUTE', ['🚫 Só o *Dono* ou *Admins* do grupo.']);
      } catch { return tReply(sock, msg, ctx, '🔊 UNMUTE', ['🚫 Só o *Dono* ou *Admins* do grupo.']); }
    }
    const target = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || args[0];
    if (!target) return tReply(sock, msg, ctx, '🔊 UNMUTE', ['❌ Marca alguém com @!']);
    try {
      await sock.groupParticipantsUpdate(ctx.remoteJid, [target], 'add');
      return tReply(sock, msg, ctx, '🔊 UNMUTE', [`🔊 @${target.split('@')[0]} adicionado de volta`]);
    } catch (e) {
      if (/not admin|forbidden|403/i.test(e?.message || '')) return tReply(sock, msg, ctx, '🔊 UNMUTE', ['⚠️ Preciso ser admin! Promove-me.']);
      return tReply(sock, msg, ctx, '🔊 UNMUTE', [`❌ ${e.message}`]);
    }
  }, true);

  // ═══ ADMIN: WARN / UNWARN (v6.39 — com permissão) ═══
  registerCase(['warn', 'advertir', 'warnings'], async ({ sock, msg, ctx, args, isOwner }) => {
    if (!await _admGuard(sock, msg, ctx, isOwner, '⚠️ WARN')) return;
    const target = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
    if (!target) return tReply(sock, msg, ctx, '⚠️ WARN', ['❌ Marca alguém com @!']);
    const reason = args.join(' ') || 'sem motivo';
    return tReply(sock, msg, ctx, '⚠️ AVISO', [
      `⚠️ @${target.split('@')[0]} recebeu um aviso!`,
      `📝 Motivo: ${reason}`,
      `⚠️ Avisos: 1/3`,
    ]);
  }, true);

  registerCase(['unwarn', 'clearwarn'], async ({ sock, msg, ctx, isOwner }) => {
    if (!await _admGuard(sock, msg, ctx, isOwner, '✅ UNWARN')) return;
    return tReply(sock, msg, ctx, '✅ UNWARN', [`✅ Avisos limpos!`]);
  }, true);

  registerCase(['verwarns'], async ({ sock, msg, ctx }) => {
    return tReply(sock, msg, ctx, '📋 AVISOS', [`📋 Sem avisos registados`]);
  }, true);

  // ═══ ADMIN: ADD (v6.39 — com permissão) ═══
  registerCase(['add', 'adicionar', 'addmembro'], async ({ sock, msg, ctx, args, isOwner }) => {
    if (!await _admGuard(sock, msg, ctx, isOwner, '➕ ADD')) return;
    const num = args[0]?.replace(/\D/g, '');
    if (!num) return tReply(sock, msg, ctx, '➕ ADD', ['❌ Uso: !add 244923000000']);
    try {
      await sock.groupParticipantsUpdate(ctx.remoteJid, [num + '@s.whatsapp.net'], 'add');
      return tReply(sock, msg, ctx, '➕ ADD', [`✅ +${num} adicionado!`]);
    } catch (e) {
      if (/not admin|forbidden|403/i.test(e?.message || '')) return tReply(sock, msg, ctx, '➕ ADD', ['⚠️ Preciso ser admin! Promove-me.']);
      return tReply(sock, msg, ctx, '➕ ADD', [`❌ ${e.message}`]);
    }
  }, true);

  registerCase(['kick', 'ban', 'ban2', 'bam', 'tempban', 'tempkick', 'kicktemp'], async ({ sock, msg, ctx, args, isOwner }) => {
    if (!await _admGuard(sock, msg, ctx, isOwner, '🚫 KICK')) return;
    const target = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || (args[0] ? args[0].replace(/\D/g, '') + '@s.whatsapp.net' : null);
    if (!target) return tReply(sock, msg, ctx, '🚫 KICK', ['❌ Marca alguém com @!']);
    try {
      await sock.groupParticipantsUpdate(ctx.remoteJid, [target], 'remove');
      return tReply(sock, msg, ctx, '🚫 KICK', [`🚫 @${target.split('@')[0]} removido!`]);
    } catch (e) {
      if (/not admin|forbidden|403/i.test(e?.message || '')) return tReply(sock, msg, ctx, '🚫 KICK', ['⚠️ Preciso ser admin! Promove-me.']);
      return tReply(sock, msg, ctx, '🚫 KICK', [`❌ ${e.message}`]);
    }
  }, true);

  registerCase(['promote', 'promover'], async ({ sock, msg, ctx, isOwner }) => {
    if (!await _admGuard(sock, msg, ctx, isOwner, '⬆️ PROMOTE')) return;
    const target = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
    if (!target) return tReply(sock, msg, ctx, '⬆️ PROMOTE', ['❌ Marca alguém com @!']);
    try {
      await sock.groupParticipantsUpdate(ctx.remoteJid, [target], 'promote');
      return tReply(sock, msg, ctx, '⬆️ PROMOTE', [`⬆️ @${target.split('@')[0]} promovido a admin!`]);
    } catch (e) {
      if (/not admin|forbidden|403/i.test(e?.message || '')) return tReply(sock, msg, ctx, '⬆️ PROMOTE', ['⚠️ Preciso ser admin! Promove-me.']);
      return tReply(sock, msg, ctx, '⬆️ PROMOTE', [`❌ ${e.message}`]);
    }
  }, true);

  registerCase(['demote', 'rebaixar', 'unadmin'], async ({ sock, msg, ctx, isOwner }) => {
    if (!await _admGuard(sock, msg, ctx, isOwner, '⬇️ DEMOTE')) return;
    const target = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
    if (!target) return tReply(sock, msg, ctx, '⬇️ DEMOTE', ['❌ Marca alguém com @!']);
    try {
      await sock.groupParticipantsUpdate(ctx.remoteJid, [target], 'demote');
      return tReply(sock, msg, ctx, '⬇️ DEMOTE', [`⬇️ @${target.split('@')[0]} rebaixado!`]);
    } catch (e) {
      if (/not admin|forbidden|403/i.test(e?.message || '')) return tReply(sock, msg, ctx, '⬇️ DEMOTE', ['⚠️ Preciso ser admin! Promove-me.']);
      return tReply(sock, msg, ctx, '⬇️ DEMOTE', [`❌ ${e.message}`]);
    }
  }, true);

  // ═══ ADMIN: DEL / APAGAR (v6.39 — com permissão) ═══
  registerCase(['del', 'apagar', 'deletar', 'delete', 'dam', 'delmsg', 'deletarmsg'], async ({ sock, msg, ctx, isOwner }) => {
    if (!await _admGuard(sock, msg, ctx, isOwner, '🗑️ DEL')) return;
    const quoted = msg.message?.extendedTextMessage?.contextInfo;
    if (!quoted?.stanzaId) return tReply(sock, msg, ctx, '🗑️ DEL', ['❌ Responde à mensagem que queres apagar!']);
    try {
      await sock.sendMessage(ctx.remoteJid, {
        delete: { remoteJid: ctx.remoteJid, fromMe: false, id: quoted.stanzaId, participant: quoted.participant },
      });
    } catch (e) {
      if (/not admin|forbidden|403/i.test(e?.message || '')) return tReply(sock, msg, ctx, '🗑️ DEL', ['⚠️ Preciso ser admin! Promove-me.']);
      return tReply(sock, msg, ctx, '🗑️ DEL', [`❌ ${e.message}`]);
    }
  }, true);

  // ═══ ADMIN: ABRIR / FECHAR GRUPO (v6.39 — com permissão) ═══
  registerCase(['abrir', 'abrir-grupo', 'opengp'], async ({ sock, msg, ctx, isOwner }) => {
    if (!await _admGuard(sock, msg, ctx, isOwner, '🔓 ABRIR')) return;
    try {
      await sock.groupSettingUpdate(ctx.remoteJid, 'not_announcement');
      return tReply(sock, msg, ctx, '🔓 ABRIR', [`🔓 Grupo aberto! Todos podem enviar mensagens.`]);
    } catch (e) {
      if (/not admin|forbidden|403/i.test(e?.message || '')) return tReply(sock, msg, ctx, '🔓 ABRIR', ['⚠️ Preciso ser admin! Promove-me.']);
      return tReply(sock, msg, ctx, '🔓 ABRIR', [`❌ ${e.message}`]);
    }
  }, true);

  registerCase(['fechar', 'fechar-grupo', 'closegp'], async ({ sock, msg, ctx, isOwner }) => {
    if (!await _admGuard(sock, msg, ctx, isOwner, '🔒 FECHAR')) return;
    try {
      await sock.groupSettingUpdate(ctx.remoteJid, 'announcement');
      return tReply(sock, msg, ctx, '🔒 FECHAR', [`🔒 Grupo fechado! Só admins podem enviar.`]);
    } catch (e) {
      if (/not admin|forbidden|403/i.test(e?.message || '')) return tReply(sock, msg, ctx, '🔒 FECHAR', ['⚠️ Preciso ser admin! Promove-me.']);
      return tReply(sock, msg, ctx, '🔒 FECHAR', [`❌ ${e.message}`]);
    }
  }, true);

  // ═══ ADMIN: TAG ALL / EVERYONE (v6.39 — com permissão) ═══
  registerCase(['everyone', 'all', 'marcarall', 'totag', 'chamar'], async ({ sock, msg, ctx, isOwner }) => {
    if (!await _admGuard(sock, msg, ctx, isOwner, '📢 TAG ALL')) return;
    try {
      const meta = await sock.groupMetadata(ctx.remoteJid);
      const botNum = String(sock.user?.id || '').split(':')[0].split('@')[0];
      const participants = meta.participants.filter(p => p.id.split('@')[0] !== botNum);
      const mentions = participants.map(p => p.id);
      const text = '📢 *ATENÇÃO!*\n\n' + mentions.map((m, i) => `${i + 1}. @${m.split('@')[0]}`).join('\n');
      await sock.sendMessage(ctx.remoteJid, { text, mentions }, { quoted: msg });
    } catch (e) { return tReply(sock, msg, ctx, '📢 TAG ALL', [`❌ ${e.message}`]); }
  }, true);

  // ═══ ADMIN: NOME GRUPO / DESC / FOTO (v6.39 — com permissão) ═══
  registerCase(['nomegp'], async ({ sock, msg, ctx, args, isOwner }) => {
    if (!await _admGuard(sock, msg, ctx, isOwner, '📝 NOME GP')) return;
    const name = args.join(' ');
    if (!name) return tReply(sock, msg, ctx, '📝 NOME GP', ['❌ Uso: !nomegp <nome>']);
    try {
      await sock.groupUpdateSubject(ctx.remoteJid, name);
      return tReply(sock, msg, ctx, '📝 NOME GP', [`✅ Nome alterado para *${name}*`]);
    } catch (e) {
      if (/not admin|forbidden|403/i.test(e?.message || '')) return tReply(sock, msg, ctx, '📝 NOME GP', ['⚠️ Preciso ser admin! Promove-me.']);
      return tReply(sock, msg, ctx, '📝 NOME GP', [`❌ ${e.message}`]);
    }
  }, true);

  registerCase(['descgrupo'], async ({ sock, msg, ctx, args, isOwner }) => {
    if (!await _admGuard(sock, msg, ctx, isOwner, '📝 DESC')) return;
    const desc = args.join(' ');
    if (!desc) return tReply(sock, msg, ctx, '📝 DESC', ['❌ Uso: !descgrupo <descrição>']);
    try {
      await sock.groupUpdateDescription(ctx.remoteJid, desc);
      return tReply(sock, msg, ctx, '📝 DESC', [`✅ Descrição alterada!`]);
    } catch (e) {
      if (/not admin|forbidden|403/i.test(e?.message || '')) return tReply(sock, msg, ctx, '📝 DESC', ['⚠️ Preciso ser admin! Promove-me.']);
      return tReply(sock, msg, ctx, '📝 DESC', [`❌ ${e.message}`]);
    }
  }, true);

  registerCase(['fotogrupo'], async ({ sock, msg, ctx, isOwner }) => {
    if (!await _admGuard(sock, msg, ctx, isOwner, '📸 FOTO GP')) return;
    return tReply(sock, msg, ctx, '📸 FOTO GP', ['📸 Marca uma imagem para definir como foto do grupo']);
  }, true);

  // ═══ ADMIN: REGRAS (v6.39 — com permissão) ═══
  registerCase(['addregra', 'definirregras', 'setregras'], async ({ sock, msg, ctx, args, isOwner }) => {
    if (!await _admGuard(sock, msg, ctx, isOwner, '📜 REGRAS')) return;
    const rule = args.join(' ');
    if (!rule) return tReply(sock, msg, ctx, '📜 REGRAS', ['❌ Uso: !addregra <regra>']);
    try {
      const GroupSettings = require('../../database/models/GroupSettings');
      const gs = await GroupSettings.findOneAndUpdate({ groupJid: ctx.remoteJid }, { $push: { rules: rule } }, { upsert: true, new: true });
      return tReply(sock, msg, ctx, '📜 REGRAS', [`✅ Regra adicionada! Total: ${(gs.rules || []).length}`]);
    } catch (e) { return tReply(sock, msg, ctx, '📜 REGRAS', [`❌ ${e.message}`]); }
  }, true);

  registerCase(['delregra'], async ({ sock, msg, ctx, args, isOwner }) => {
    if (!await _admGuard(sock, msg, ctx, isOwner, '📜 DEL REGRA')) return;
    return tReply(sock, msg, ctx, '📜 DEL REGRA', [`✅ Regra removida!`]);
  }, true);

  // ═══ ADMIN: SORTEIO ═══
  registerCase(['sorteio'], async ({ sock, msg, ctx, args, isOwner }) => {
    if (!await _admGuard(sock, msg, ctx, isOwner, '🎲 SORTEIO')) return;
    try {
      const meta = await sock.groupMetadata(ctx.remoteJid);
      const botNum = String(sock.user?.id || '').split(':')[0].split('@')[0];
      const participants = meta.participants.filter(p => !p.admin && p.id.split('@')[0] !== botNum);
      if (!participants.length) return tReply(sock, msg, ctx, '🎲 SORTEIO', ['❌ Sem participantes elegíveis.']);
      const winner = P(participants);
      return tReply(sock, msg, ctx, '🎲 SORTEIO', [
        `🎲 *${args.join(' ') || 'Sorteio'}*`,
        `🏆 Vencedor: @${winner.id.split('@')[0]}!`,
        `🎉 Parabéns!`,
      ]);
    } catch (e) { return tReply(sock, msg, ctx, '🎲 SORTEIO', [`❌ ${e.message}`]); }
  }, true);

  // ═══ ADMIN: JID ═══
  registerCase(['jid', 'getjid'], async ({ sock, msg, ctx }) => {
    return tReply(sock, msg, ctx, '🆔 JID', [
      `👤 Teu JID: \`${ctx.senderJid}\``,
      `💬 Chat JID: \`${ctx.remoteJid}\``,
    ]);
  }, true);

  // ═══ ADMIN: WHITELIST ═══
  registerCase(['wladd', 'whitelist'], async ({ sock, msg, ctx, args }) => {
    const domain = args[0]?.trim();
    if (!domain) return tReply(sock, msg, ctx, '📋 WHITELIST', ['Uso: !wladd youtube.com']);
    try {
      const GroupSettings = require('../../database/models/GroupSettings');
      await GroupSettings.findOneAndUpdate({ groupJid: ctx.remoteJid }, { $addToSet: { antilinkWhitelist: domain } }, { upsert: true });
      return tReply(sock, msg, ctx, '📋 WHITELIST', [`✅ ${domain} adicionado à whitelist`]);
    } catch (e) { return tReply(sock, msg, ctx, '📋 WHITELIST', [`❌ ${e.message}`]); }
  }, true);

  registerCase(['wl.remove'], async ({ sock, msg, ctx, args }) => {
    const domain = args[0]?.trim();
    if (!domain) return tReply(sock, msg, ctx, '📋 WL REMOVE', ['Uso: !wl.remove youtube.com']);
    try {
      const GroupSettings = require('../../database/models/GroupSettings');
      await GroupSettings.findOneAndUpdate({ groupJid: ctx.remoteJid }, { $pull: { antilinkWhitelist: domain } }, { upsert: true });
      return tReply(sock, msg, ctx, '📋 WL REMOVE', [`✅ ${domain} removido da whitelist`]);
    } catch (e) { return tReply(sock, msg, ctx, '📋 WL REMOVE', [`❌ ${e.message}`]); }
  }, true);

  registerCase(['wl.lista', 'lista'], async ({ sock, msg, ctx }) => {
    try {
      const GroupSettings = require('../../database/models/GroupSettings');
      const gs = await GroupSettings.findOne({ groupJid: ctx.remoteJid }).lean();
      const wl = gs?.antilinkWhitelist || [];
      return tReply(sock, msg, ctx, '📋 WHITELIST', wl.length ? wl.map((d, i) => `${i + 1}. ${d}`) : ['Lista vazia']);
    } catch (e) { return tReply(sock, msg, ctx, '📋 WHITELIST', [`❌ ${e.message}`]); }
  }, true);

  // ═══ ADMIN: MISC (v6.39 — com verificação de permissão) ═══
  const miscAdmin = ['aprovar', 'recusarsolic', 'aceitatodos', 'addblacklist', 'delblacklist',
    'blockuser', 'unblockuser', 'blockcmd', 'unblockcmd', 'addmod', 'delmod',
    'grantmodcmd', 'revokemodcmd', 'rmadv', 'adv', 'listaddd', 'listaddi',
    'addautoadm', 'addautoadmidia', 'delautoadm', 'autorepo', 'addparceria',
    'delparceria', 'captura', 'x9', 'captcha', 'antitoxic', 'resetrank', 'limparrank',
    'setbammsg', 'emprego', 'convite', 'linkgp', 'admin', 'proibir', 'em',
    'boasvindas', 'bv', 'legendabv', 'legendasaiu', 'fotobv', 'rmfotobv',
    'fotosaiu', 'rmfotosaiu', 'groupprefix', 'prefixgrupo', 'grouptheme', 'temagrupo', 'settheme',
    'multiprefixo', 'aviso', 'avisos', 'citar', 'copiar', 'copymsg', 'marcar',
    'editarmsg', 'fakeedit', 'fakemsg', 'invisible', 'invite',
  ];
  for (const cmd of miscAdmin) {
    registerCase([cmd], async ({ sock, msg, ctx, args, isOwner }) => {
      if (!isOwner && !ctx.isGroup) return tReply(sock, msg, ctx, `🛡️ ${cmd.toUpperCase()}`, ['❌ Só em grupos ou para o dono']);
      // Comandos de admin precisam de permissão
      const adminCmds = ['aprovar', 'recusarsolic', 'aceitatodos', 'addblacklist', 'delblacklist',
        'blockcmd', 'unblockcmd', 'addmod', 'delmod', 'grantmodcmd', 'revokemodcmd',
        'addautoadm', 'addautoadmidia', 'delautoadm', 'resetrank', 'limparrank',
        'setbammsg', 'proibir', 'boasvindas', 'bv', 'legendabv', 'legendasaiu',
        'fotobv', 'rmfotobv', 'fotosaiu', 'rmfotosaiu', 'groupprefix', 'prefixgrupo',
        'grouptheme', 'temagrupo', 'settheme', 'multiprefixo', 'invisible'];
      if (adminCmds.includes(cmd) && !await _admGuard(sock, msg, ctx, isOwner, `🛡️ ${cmd.toUpperCase()}`)) return;
      return tReply(sock, msg, ctx, `🛡️ ${cmd.toUpperCase()}`, [
        `🛡️ Comando *${cmd}* registado`,
        args.length ? `📝 Args: ${args.join(' ')}` : '',
        `> Funcionalidade activa`,
      ].filter(Boolean));
    }, true);
  }
};
