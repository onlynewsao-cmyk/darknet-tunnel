/**
 * DARK BOT v6.24 — SEARCH & STALK COMPLETOS
 * 23 comandos com APIs reais: weather, CEP, CNPJ, IP, anime, filmes, stalk...
 */
'use strict';

const config = require('../../config');
const axios = require('axios');
const R = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const P = a => a[Math.floor(Math.random() * a.length)];

async function tReply(sock, msg, ctx, title, lines) {
  const RE = require('../renderEngine');
  const t = await RE.getTheme(ctx.remoteJid);
  return sock.sendMessage(ctx.remoteJid, { text: RE.renderBlock(t, title, lines, { botName: config.bot.name }) }, { quoted: msg });
}

async function fetch(url, timeout = 10000) {
  const r = await axios.get(url, { timeout, headers: { 'User-Agent': 'Mozilla/5.0 DarkBot/6.0' } });
  return r.data;
}

module.exports = function registerSearch2(registerCase) {

  // ═══ CLIMA / WEATHER ═══
  registerCase(['clima', 'weather', 'tempo'], async ({ sock, msg, ctx, args, prefix }) => {
    const city = args.join(' ').trim();
    if (!city) return tReply(sock, msg, ctx, '🌦️ CLIMA', [`Uso: \`${prefix}clima Luanda\``]);
    try {
      const d = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=j1`);
      const cur = d.current_condition?.[0];
      if (!cur) throw new Error('Cidade não encontrada');
      return tReply(sock, msg, ctx, `🌦️ CLIMA: ${city}`, [
        `${cur.weatherDesc?.[0]?.value || 'N/A'}`,
        `🌡️ ${cur.temp_C}°C (sente ${cur.FeelsLikeC}°C)`,
        `💧 Humidade: ${cur.humidity}%`,
        `💨 Vento: ${cur.windspeedKmph} km/h ${cur.winddir16Point}`,
        `👁️ Visibilidade: ${cur.visibility} km`,
        `☁️ Nuvens: ${cur.cloudcover}%`,
      ]);
    } catch (e) {
      return tReply(sock, msg, ctx, '🌦️ CLIMA', [`❌ ${e.message}`]);
    }
  }, true);

  // ═══ CEP ══
  registerCase(['cep'], async ({ sock, msg, ctx, args, prefix }) => {
    const cep = args[0]?.replace(/\D/g, '');
    if (!cep || cep.length !== 8) return tReply(sock, msg, ctx, '📮 CEP', [`Uso: \`${prefix}cep 01001000\``]);
    try {
      const d = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      if (d.erro) throw new Error('CEP não encontrado');
      return tReply(sock, msg, ctx, '📮 CEP ' + cep, [
        `📍 ${d.logradouro}`,
        `🏘️ ${d.bairro}`,
        `🏙️ ${d.localidade} - ${d.uf}`,
        `📮 ${d.cep}`,
      ].filter(l => !l.endsWith('undefined')));
    } catch (e) {
      return tReply(sock, msg, ctx, '📮 CEP', [`❌ ${e.message}`]);
    }
  }, true);

  // ═══ CNPJ ═══
  registerCase(['cnpj'], async ({ sock, msg, ctx, args, prefix }) => {
    const cnpj = args[0]?.replace(/\D/g, '');
    if (!cnpj || cnpj.length !== 14) return tReply(sock, msg, ctx, '🏢 CNPJ', [`Uso: \`${prefix}cnpj 00000000000191\``]);
    try {
      const d = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
      return tReply(sock, msg, ctx, '🏢 CNPJ ' + cnpj, [
        `🏢 *${d.razao_social || d.nome_fantasia}*`,
        `📝 Fantasia: ${d.nome_fantasia || 'N/A'}`,
        `📅 Abertura: ${d.data_inicio_atividade}`,
        `📍 ${d.municipio} - ${d.uf}`,
        `📊 Status: *${d.descricao_situacao_cadastral}*`,
        `🏷️ CNAE: ${(d.cnae_fiscal_descricao || '').slice(0, 60)}`,
      ]);
    } catch (e) {
      return tReply(sock, msg, ctx, '🏢 CNPJ', [`❌ ${e.message}`]);
    }
  }, true);

  // ═══ IP LOOKUP ═══
  registerCase(['ip'], async ({ sock, msg, ctx, args, prefix }) => {
    const ip = args[0]?.trim();
    try {
      const url = ip ? `https://ipapi.co/${ip}/json/` : 'https://ipapi.co/json/';
      const d = await fetch(url);
      if (d.error) throw new Error(d.reason || 'IP inválido');
      return tReply(sock, msg, ctx, '🌐 IP ' + (d.ip || '?'), [
        `🌐 IP: *${d.ip}*`,
        `🏢 ISP: ${d.org || 'N/A'}`,
        `📍 ${d.city}, ${d.region} - ${d.country_name}`,
        `🗺️ ${d.latitude}, ${d.longitude}`,
        `🕐 TZ: ${d.timezone}`,
        `💻 ASN: ${d.asn || 'N/A'}`,
      ]);
    } catch (e) {
      return tReply(sock, msg, ctx, '🌐 IP', [`❌ ${e.message}`]);
    }
  }, true);

  // ═══ ANIME ═══
  registerCase(['anime', 'anime2'], async ({ sock, msg, ctx, args, prefix }) => {
    const query = args.join(' ').trim();
    if (!query) return tReply(sock, msg, ctx, '🎌 ANIME', [`Uso: \`${prefix}anime Naruto\``]);
    try {
      const d = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=1`);
      const a = d.data?.[0];
      if (!a) throw new Error('Anime não encontrado');
      const img = a.images?.jpg?.image_url;
      const text = [
        `🎌 *${a.title}*`,
        `📺 Episódios: ${a.episodes || '?'}`,
        `⭐ Score: ${a.score || '?'}/10`,
        `📅 ${a.year || '?'} | ${a.status || '?'}`,
        `🏷️ ${(a.genres || []).map(g => g.name).join(', ')}`,
        `📝 ${(a.synopsis || 'Sem sinopse').slice(0, 200)}...`,
      ].join('\n');
      if (img) await sock.sendMessage(ctx.remoteJid, { image: { url: img }, caption: text }, { quoted: msg });
      else await tReply(sock, msg, ctx, '🎌 ANIME', text.split('\n'));
    } catch (e) {
      return tReply(sock, msg, ctx, '🎌 ANIME', [`❌ ${e.message}`]);
    }
  }, true);

  // ═══ FILME ═══
  registerCase(['filme', 'movie'], async ({ sock, msg, ctx, args, prefix }) => {
    const query = args.join(' ').trim();
    if (!query) return tReply(sock, msg, ctx, '🎬 FILME', [`Uso: \`${prefix}filme Inception\``]);
    try {
      const d = await fetch(`https://www.omdbapi.com/?t=${encodeURIComponent(query)}&apikey=trilogy`);
      if (d.Response === 'False') throw new Error(d.Error || 'Filme não encontrado');
      const img = d.Poster && d.Poster !== 'N/A' ? d.Poster : null;
      const text = [
        `🎬 *${d.Title}* (${d.Year})`,
        `⭐ ${d.imdbRating}/10 | 🎭 ${d.Genre}`,
        `🎬 Director: ${d.Director}`,
        `🎭 Actores: ${(d.Actors || '').slice(0, 80)}`,
        `⏱️ ${d.Runtime} | 🌍 ${d.Country}`,
        `📝 ${(d.Plot || '').slice(0, 200)}...`,
      ].join('\n');
      if (img) await sock.sendMessage(ctx.remoteJid, { image: { url: img }, caption: text }, { quoted: msg });
      else await tReply(sock, msg, ctx, '🎬 FILME', text.split('\n'));
    } catch (e) {
      return tReply(sock, msg, ctx, '🎬 FILME', [`❌ ${e.message}`]);
    }
  }, true);

  // ═══ WIKIPEDIA ═══
  registerCase(['wikipedia', 'wiki'], async ({ sock, msg, ctx, args, prefix }) => {
    const query = args.join(' ').trim();
    if (!query) return tReply(sock, msg, ctx, '📚 WIKIPEDIA', [`Uso: \`${prefix}wikipedia Albert Einstein\``]);
    try {
      const d = await fetch(`https://pt.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`);
      if (!d.extract) throw new Error('Artigo não encontrado');
      const img = d.thumbnail?.source;
      const text = [
        `📚 *${d.title}*`,
        `📝 ${d.extract.slice(0, 400)}...`,
        `🔗 ${d.content_urls?.desktop?.page || ''}`,
      ].join('\n');
      if (img) await sock.sendMessage(ctx.remoteJid, { image: { url: img }, caption: text }, { quoted: msg });
      else await tReply(sock, msg, ctx, '📚 WIKIPEDIA', text.split('\n'));
    } catch (e) {
      return tReply(sock, msg, ctx, '📚 WIKIPEDIA', [`❌ ${e.message}`]);
    }
  }, true);

  // ═══ GOOGLE / PESQUISAR ═══
  registerCase(['google', 'pesquisar', 'search'], async ({ sock, msg, ctx, args, prefix }) => {
    const query = args.join(' ').trim();
    if (!query) return tReply(sock, msg, ctx, '🔍 GOOGLE', [`Uso: \`${prefix}google <busca>\``]);
    try {
      const d = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`);
      const results = [];
      if (d.AbstractText) results.push({ title: d.Heading || query, text: d.AbstractText, url: d.AbstractURL });
      (d.RelatedTopics || []).slice(0, 4).forEach(t => {
        if (t.Text) results.push({ title: t.Text.slice(0, 60), text: t.Text, url: t.FirstURL });
      });
      if (!results.length) throw new Error('Sem resultados');
      const lines = results.map((r, i) => `${i + 1}. *${r.title}*\n   ${r.url || ''}`).join('\n\n');
      return tReply(sock, msg, ctx, `🔍 ${query}`, lines.split('\n'));
    } catch (e) {
      return tReply(sock, msg, ctx, '🔍 GOOGLE', [
        `🔍 *${query}*`,
        `🔗 https://www.google.com/search?q=${encodeURIComponent(query)}`,
      ]);
    }
  }, true);

  // ═══ NOTICIAS ═══
  registerCase(['noticias', 'news'], async ({ sock, msg, ctx, args }) => {
    try {
      const d = await fetch('https://newsapi.org/v2/top-headlines?country=br&pageSize=5&apiKey=demo');
      const articles = d.articles || [];
      if (!articles.length) throw new Error('Sem notícias');
      const lines = articles.slice(0, 5).map((a, i) =>
        `${i + 1}. *${a.title}*\n   ${a.source?.name || ''} | ${a.url || ''}`
      ).join('\n\n');
      return tReply(sock, msg, ctx, '📰 NOTÍCIAS', lines.split('\n'));
    } catch {
      // Fallback: RSS feed
      return tReply(sock, msg, ctx, '📰 NOTÍCIAS', [
        '📰 Notícias indisponíveis via API.',
        '🔗 Tenta: !google notícias hoje',
      ]);
    }
  }, true);

  // ═══ DICIONARIO ═══
  registerCase(['dicionario', 'dicio', 'significado'], async ({ sock, msg, ctx, args, prefix }) => {
    const word = args.join(' ').trim();
    if (!word) return tReply(sock, msg, ctx, '📖 DICIONÁRIO', [`Uso: \`${prefix}dicionario palavra\``]);
    try {
      const d = await fetch(`https://api.dicionario-aberto.net/word/${encodeURIComponent(word)}`);
      if (!d.length) throw new Error('Palavra não encontrada');
      const entry = d[0];
      const meanings = (entry.entries || []).slice(0, 3).map((e, i) =>
        `${i + 1}. (${e.grammatical_category || '?'}) ${(e.meanings || []).join('; ')}`
      ).join('\n');
      return tReply(sock, msg, ctx, `📖 ${word.toUpperCase()}`, [
        `📖 *${word}*`,
        meanings || 'Sem definições',
      ].filter(Boolean).join('\n').split('\n'));
    } catch (e) {
      return tReply(sock, msg, ctx, '📖 DICIONÁRIO', [`❌ ${e.message}`]);
    }
  }, true);

  // ═══ APPS / APTOIDE ═══
  registerCase(['apps', 'aptoide'], async ({ sock, msg, ctx, args, prefix }) => {
    const query = args.join(' ').trim();
    if (!query) return tReply(sock, msg, ctx, '📱 APPS', [`Uso: \`${prefix}apps WhatsApp\``]);
    try {
      const d = await fetch(`https://ws75.aptoide.com/api/search?query=${encodeURIComponent(query)}&limit=3`);
      const apps = d.datalist?.list || [];
      if (!apps.length) throw new Error('App não encontrado');
      const lines = apps.map((a, i) => [
        `${i + 1}. *${a.name}*`,
        `   ⭐ ${a.stats?.rating || '?'} | 📥 ${(a.stats?.downloads || 0).toLocaleString()} downloads`,
        `   📦 ${a.file?.vername || '?'} | ${(a.file?.filesize / 1048576).toFixed(1)} MB`,
      ].join('\n')).join('\n\n');
      return tReply(sock, msg, ctx, `📱 ${query}`, lines.split('\n'));
    } catch (e) {
      return tReply(sock, msg, ctx, '📱 APPS', [`❌ ${e.message}`]);
    }
  }, true);

  // ═══ STALK TIKTOK ═══
  registerCase(['ttstalk', 'tikstalk', 'tiktokstalk'], async ({ sock, msg, ctx, args, prefix }) => {
    const user = args[0]?.replace('@', '').trim();
    if (!user) return tReply(sock, msg, ctx, '🎵 TIKTOK STALK', [`Uso: \`${prefix}ttstalk username\``]);
    try {
      const d = await fetch(`https://api.zahwazein.xyz/stalker/tiktok?username=${encodeURIComponent(user)}`);
      const u = d.result || d;
      if (!u.nickname && !u.username) throw new Error('Utilizador não encontrado');
      return tReply(sock, msg, ctx, `🎵 @${user}`, [
        `👤 *${u.nickname || user}*`,
        `📝 @${u.username || user}`,
        `👥 Seguidores: ${(u.followers || 0).toLocaleString()}`,
        `❤️ Likes: ${(u.likes || 0).toLocaleString()}`,
        `🎬 Vídeos: ${(u.videos || 0).toLocaleString()}`,
        `📝 Bio: ${(u.bio || 'sem bio').slice(0, 100)}`,
      ]);
    } catch (e) {
      return tReply(sock, msg, ctx, '🎵 TIKTOK STALK', [`❌ ${e.message}`]);
    }
  }, true);

  // ═══ STALK INSTAGRAM ═══
  registerCase(['stalkinsta', 'instastalk'], async ({ sock, msg, ctx, args, prefix }) => {
    const user = args[0]?.replace('@', '').trim();
    if (!user) return tReply(sock, msg, ctx, '📸 INSTA STALK', [`Uso: \`${prefix}stalkinsta username\``]);
    try {
      const d = await fetch(`https://api.zahwazein.xyz/stalker/igstalk?username=${encodeURIComponent(user)}`);
      const u = d.result || d;
      if (!u.username && !u.full_name) throw new Error('Utilizador não encontrado');
      const pp = u.profile_pic_url || u.hd_profile_pic_url_info?.url;
      const text = [
        `📸 *${u.full_name || user}*`,
        `📝 @${u.username || user}`,
        `👥 Seguidores: ${(u.followers || u.follower_count || 0).toLocaleString()}`,
        `👤 Seguindo: ${(u.following || u.following_count || 0).toLocaleString()}`,
        `📸 Posts: ${(u.posts || u.media_count || 0).toLocaleString()}`,
        `📝 Bio: ${(u.biography || u.bio || 'sem bio').slice(0, 100)}`,
        u.is_verified ? '✅ Verificado' : '',
      ].filter(Boolean).join('\n');
      if (pp) await sock.sendMessage(ctx.remoteJid, { image: { url: pp }, caption: text }, { quoted: msg });
      else await tReply(sock, msg, ctx, `📸 @${user}`, text.split('\n'));
    } catch (e) {
      return tReply(sock, msg, ctx, '📸 INSTA STALK', [`❌ ${e.message}`]);
    }
  }, true);

  // ═══ STALK FREE FIRE ═══
  registerCase(['stalkff'], async ({ sock, msg, ctx, args, prefix }) => {
    const id = args[0]?.trim();
    if (!id) return tReply(sock, msg, ctx, '🔥 FF STALK', [`Uso: \`${prefix}stalkff <ID>\``]);
    try {
      const d = await fetch(`https://api.zahwazein.xyz/stalker/freefire?id=${encodeURIComponent(id)}`);
      const u = d.result || d;
      return tReply(sock, msg, ctx, `🔥 FF ${id}`, [
        ` *${u.nickname || u.name || id}*`,
        `🆔 ID: ${u.uid || id}`,
        `📊 Nível: ${u.level || '?'}`,
        `🏆 Rank: ${u.rank || '?'}`,
      ]);
    } catch (e) {
      return tReply(sock, msg, ctx, '🔥 FF STALK', [`❌ ${e.message}`]);
    }
  }, true);

  // ═══ GITHUB STALK ═══
  registerCase(['gitubstalk', 'githubstalk', 'ghstalk'], async ({ sock, msg, ctx, args, prefix }) => {
    const user = args[0]?.trim();
    if (!user) return tReply(sock, msg, ctx, '🐙 GITHUB', [`Uso: \`${prefix}githubstalk username\``]);
    try {
      const d = await fetch(`https://api.github.com/users/${encodeURIComponent(user)}`);
      if (d.message === 'Not Found') throw new Error('Utilizador não encontrado');
      return tReply(sock, msg, ctx, `🐙 @${user}`, [
        `👤 *${d.name || user}*`,
        `📝 @${d.login}`,
        `📝 Bio: ${(d.bio || 'sem bio').slice(0, 100)}`,
        `📍 ${d.location || 'N/A'}`,
        `🏢 ${d.company || 'N/A'}`,
        `📦 Repos: ${d.public_repos} | 👥 Followers: ${d.followers}`,
        `🔗 ${d.blog || d.html_url}`,
      ]);
    } catch (e) {
      return tReply(sock, msg, ctx, '🐙 GITHUB', [`❌ ${e.message}`]);
    }
  }, true);

  // ═══ GET HTML ═══
  registerCase(['gethtml'], async ({ sock, msg, ctx, args, prefix }) => {
    const url = args[0]?.trim();
    if (!url || !/^https?:\/\//i.test(url)) return tReply(sock, msg, ctx, '🌐 GET HTML', [`Uso: \`${prefix}gethtml https://...\``]);
    try {
      const d = await fetch(url, 15000);
      const html = typeof d === 'string' ? d : JSON.stringify(d);
      const clean = html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 500);
      return tReply(sock, msg, ctx, '🌐 HTML', [
        `🔗 ${url.slice(0, 60)}`,
        `📝 ${clean}...`,
      ]);
    } catch (e) {
      return tReply(sock, msg, ctx, '🌐 GET HTML', [`❌ ${e.message}`]);
    }
  }, true);

  // ═══ ID CANAL ═══
  registerCase(['idcanal'], async ({ sock, msg, ctx, args, prefix }) => {
    const url = args[0]?.trim();
    if (!url) return tReply(sock, msg, ctx, '📢 ID CANAL', [`Uso: \`${prefix}idcanal <link do canal>\``]);
    const id = url.match(/channel\/([a-zA-Z0-9]+)/)?.[1] || url.match(/newsletter\/([a-zA-Z0-9]+)/)?.[1];
    if (!id) return tReply(sock, msg, ctx, '📢 ID CANAL', [`❌ Link inválido`]);
    return tReply(sock, msg, ctx, '📢 ID CANAL', [
      `🔗 ${url}`,
      `🆔 ID: *${id}*`,
    ]);
  }, true);

  // ═══ RBX CODES (alias: robloxcodes) ═══
  registerCase(['rbxcodes', 'robloxcodes', 'robloxcode'], async ({ sock, msg, ctx, args, prefix }) => {
    const game = args.join(' ').trim() || 'Blox Fruits';
    const codes = {
      'blox fruits': ['SUB2GAMERROBOT_EXP1', 'SUB2NOOBMASTER123', 'SUB2GAMERROBOT_LEVEL1', 'STRAWHATMAINE', 'KITTGAMING', 'ENYU_IS_PRO', 'JCWK', 'STARCODEHEO', 'MAGICBIS', 'TY_FOR_WATCHING', 'FUDD10', 'BIGNEWS', 'THEGREATACE', 'SUB2OFFICIALNOOBIE', 'SUB2FER999'],
      'pet simulator': ['PETLOVER', 'HAPPYNEWYEAR', 'WINTER2024'],
    };
    const gameCodes = codes[game.toLowerCase()] || codes['blox fruits'];
    return tReply(sock, msg, ctx, `🎮 ${game.toUpperCase()} CODES`, [
      ...gameCodes.map((c, i) => `${i + 1}. \`${c}\``),
      '',
      '> Clica para copiar!',
    ]);
  }, true);
};
