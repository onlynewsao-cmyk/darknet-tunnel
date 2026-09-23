'use strict';
/**
 * DARK BOT v7.60 — !setmenu — define foto/vídeo/GIF do menu e submenus.
 *
 * Uso (só dono, responde a foto/vídeo/GIF ou envia com a legenda):
 *   !setmenu menu            → mídia do MENU principal (carousel + texto)
 *   !setmenu downloads video → mídia do submenu downloads (força vídeo)
 *   !setmenu ia gif          → força GIF (loop, sem áudio)
 *   !setmenu grupo off       → remove a mídia do submenu grupo
 *   !setmenu                 → painel (o que está definido)
 *
 * Compressão "menos tamanho, mesma qualidade":
 *   foto  → max 1280px, JPEG q82 (sharp)
 *   video → max 720px, CRF 23, AAC 96k, ≤30s (ffmpeg)
 *   gif   → max 480px, CRF 26, sem áudio, ≤15s (ffmpeg)
 * Submenus guardam em assets/menu-media/ (chave menu_media_*_url=local:...).
 * O menu principal também copia para configs/LOGOS/fotomenu.* (carousel).
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..', '..', '..');
const MEDIA_DIR = path.join(ROOT, 'assets', 'menu-media');
const LOGOS_DIR = path.join(ROOT, 'configs', 'LOGOS');

const TARGETS = {
  // ── MENU PRINCIPAL (carousel) — suporta foto/vídeo/GIF que reproduz como GIF
  menu: 'menu', principal: 'menu', main: 'menu', fotomenu: 'menu',
  
  // ── DOWNLOADS
  downloads: 'menu_downloads', download: 'menu_downloads', dl: 'menu_downloads', down: 'menu_downloads',
  
  // ── FIGURINHAS / STICKERS
  stickers: 'menu_stickers', sticker: 'menu_stickers', fig: 'menu_stickers', figurinhas: 'menu_stickers', figurinha: 'menu_stickers',
  
  // ── IA & CHATBOTS
  ia: 'menuia', ai: 'menuia', chatbots: 'menuia', iabot: 'menuia',
  
  // ── JOGOS & SOCIAL
  jogos: 'menujogos', jogo: 'menujogos', game: 'menujogos', games: 'menujogos', social: 'menujogos', joos: 'menujogos',
  
  // ── ECONOMIA & RPG
  economia: 'menueconomia', eco: 'menueconomia', coins: 'menueconomia', economa: 'menueconomia', rg: 'menueconomia',
  
  // ── INTERAÇÕES & FAMÍLIA
  interacoes: 'menuinteracoes', 'interações': 'menuinteracoes', interacao: 'menuinteracoes', intera: 'menuinteracoes',
  familia: 'menuinteracoes', 'família': 'menuinteracoes', family: 'menuinteracoes',
  brincadeiras: 'menuinteracoes', brincadeira: 'menuinteracoes', div: 'menuinteracoes',
  diversao: 'menuinteracoes', 'diversão': 'menuinteracoes',
  
  // ── ZOEIRA & RANK
  zoeira: 'menuzoeira', medidores: 'menuzoeira', zoir: 'menuzoeira', rnk: 'menuzoeira', rank: 'menuzoeira',
  
  // ── TEXTO & FONTES
  texto: 'menutexto', utilidades: 'menutexto', fontes: 'menutexto', fonte: 'menutexto',
  
  // ── SEARCH & STALK
  search: 'menusearch', pesquisa: 'menusearch', stalk: 'menusearch', stal: 'menusearch', consulta: 'menusearch', consultas: 'menusearch',
  
  // ── AUDIO & EFEITOS
  audio: 'alteradores', alteradores: 'alteradores', fetos: 'alteradores', efeitos: 'menulogos', efeito: 'menulogos',
  'audio&fetos': 'alteradores',
  
  // ── LOGOS & EFEITOS
  logos: 'menulogos', logo: 'menulogos', logosefeitos: 'menulogos',
  
  // ── ADM & GRUPOS
  grupo: 'menugrupo', grupos: 'menugrupo', adm: 'menugrupo', admin: 'menugrupo', 'adm&grupos': 'menugrupo',
  
  // ── INFO & STATS
  status: 'menustatus', info: 'menustatus', stats: 'menustatus', 'info&stats': 'menustatus',
  
  // ── RPG & AVENTURA
  rpg: 'menueconomia', aventura: 'menueconomia', 'rpg&aventura': 'menueconomia', rpgaventura: 'menueconomia',
  
  // ── MENU+18 (VIP)
  'menu+18': 'menu18', menu18: 'menu18', '18': 'menu18', adulto: 'menu18', adult: 'menu18',
  
  // ── CMDS CULTOS / OWNER
  cultos: 'menudono', 'cmdscultos': 'menudono', ocultos: 'menudono',
  
  // ── CRIADOR
  criador: 'menustatus', creator: 'menustatus',
  
  // ── VIP & ALUGA
  alugar: 'menu_alugar', rent: 'menu_alugar', vip: 'menu_alugar', aluga: 'menu_alugar', 'vip&aluga': 'menu_alugar',
  
  // ── DONO & SYSTEM
  dono: 'menudono', owner: 'menudono', syst: 'menudono', system: 'menudono', 'dono&syst': 'menudono',
};

function resolveTarget(alias) {
  const raw = String(alias || '').toLowerCase().trim();
  if (!raw) return null;
  if (raw === 'menu' || raw === 'principal') return { key: 'menu', main: true };
  const a = raw.replace(/^menu_?/, '');
  const key = TARGETS[a] || TARGETS[raw];
  return key ? { key, main: false } : null;
}

function detectKind(hasImage, hasVideo, gifPlayback, arg) {
  const a = String(arg || '').toLowerCase();
  if (['foto', 'imagem', 'image', 'img', 'jpg', 'png'].includes(a)) return 'foto';
  if (['video', 'vídeo', 'mp4'].includes(a)) return 'video';
  if (['gif'].includes(a)) return 'gif';
  if (hasVideo) return gifPlayback ? 'gif' : 'video';
  if (hasImage) return 'foto';
  return null;
}

function ffmpegBin() {
  try { return require('ffmpeg-static') || 'ffmpeg'; } catch { return 'ffmpeg'; }
}

async function compressImage(buf) {
  try {
    const sharp = require('sharp');
    const out = await sharp(buf).resize({ width: 1280, withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
    const isJpeg = buf[0] === 0xFF && buf[1] === 0xD8;
    if (isJpeg && buf.length <= out.length) return buf;
    return out;
  } catch { return buf; }
}

async function compressVideo(buf, gif) {
  const execFileAsync = require('util').promisify(require('child_process').execFile);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'darkbot-setmenu-'));
  const inp = path.join(dir, 'in.bin');
  const out = path.join(dir, 'out.mp4');
  try {
    fs.writeFileSync(inp, buf);
    const args = gif
      ? ['-y', '-i', inp, '-t', '15', '-map', '0:v:0?', '-vf', "scale='min(480,iw)':-2", '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26', '-pix_fmt', 'yuv420p', '-an', '-movflags', '+faststart', out]
      : ['-y', '-i', inp, '-t', '30', '-vf', "scale='min(720,iw)':-2", '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', out];
    await execFileAsync(ffmpegBin(), args, { timeout: 120000 });
    const outBuf = fs.readFileSync(out);
    if (!outBuf?.length) throw new Error('compressão gerou vazio');
    const isMp4 = buf.length > 8 && buf.toString('ascii', 4, 8) === 'ftyp';
    if (isMp4 && buf.length <= outBuf.length) return buf;
    return outBuf;
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
}

function cache() { return require('../botConfigCache'); }

async function showPanel(prefix, reply) {
  const c = cache();
  // v12.0 PINKCHYU — todos submenus do menu principal mapeados, incluindo 18+
  const keys = ['menu', 'menu_downloads', 'menu_stickers', 'menujogos', 'menueconomia', 'menuia', 'menugrupo', 'menustatus', 'menulogos', 'menuinteracoes', 'alteradores', 'menuzoeira', 'menutexto', 'menusearch', 'menudono', 'menu_alugar', 'menu18'];
  const rows = await Promise.all(keys.map(async (k) => {
    const t = await c.get(`menu_media_${k}_type`, 'none').catch(() => 'none');
    const u = await c.get(`menu_media_${k}_url`, '').catch(() => '');
    if (!t || t === 'none' || !u) return `⚪ \`${k}\``;
    // v7.64: configurado mas sem bytes? o ficheiro perdeu-se no restart.
    const bin = await c.get(`menu_media_${k}_bin`, '').catch(() => '');
    let ok = !!bin;
    if (!ok && String(u).startsWith('local:')) {
      const rel = String(u).slice(6).split('?')[0].replace(/^menu-media\//, '');
      ok = fs.existsSync(path.join(MEDIA_DIR, rel));
    } else if (!ok) ok = true; // URL remota (dashboard): assume-se viva
    return `${ok ? '✅' : '⚠️'} \`${k}\` (${t})`;
  }));
  return reply(
    `💜 *MÍDIA DOS MENUS — PINKCHYU EDITION* 🖤☥\n\n${rows.join('\n')}\n\n` +
    `*Definir* (responde a foto/vídeo/GIF):\n` +
    `\`${prefix}setmenu menu\` — menu principal\n` +
    `\`${prefix}setmenu <submenu> [foto|video|gif]\`\n` +
    `ex: \`${prefix}setmenu downloads video\`\n\n` +
    `*Remover:* \`${prefix}setmenu <alvo> off\`\n\n⚠️ = ficheiro perdido no restart — redefine a mídia.\n✅ = guardado (sobrevive a restarts).`,
  );
}

async function clearTarget(t) {
  const c = cache();
  await c.set(`menu_media_${t.key}_url`, '').catch(() => {});
  await c.set(`menu_media_${t.key}_type`, 'none').catch(() => {});
  await c.set(`menu_media_${t.key}_bin`, '').catch(() => {}); // v7.64
  const files = [path.join(MEDIA_DIR, `${t.key}.mp4`), path.join(MEDIA_DIR, `${t.key}.jpg`)];
  if (t.main) files.push(path.join(LOGOS_DIR, 'fotomenu.mp4'), path.join(LOGOS_DIR, 'fotomenu.jpg'), path.join(LOGOS_DIR, 'fotomenu.png'));
  for (const f of files) { try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {} }
}

function registerSetmenu(registerCase) {
  registerCase(['setmenu', 'definirmenu', 'menumedia'], async ({ m, msg, ctx, args, prefix, isOwner, reply }) => {
    if (!isOwner) return reply('🚫 Só o *dono*.');
    if (!args.length) return showPanel(prefix, reply);

    const t = resolveTarget(args[0]);
    if (!t) return reply(`❌ Alvo desconhecido: \`${args[0]}\`\nVê a lista com \`${prefix}setmenu\``);

    const modo = String(args[1] || '').toLowerCase();
    if (['off', 'del', 'remover', 'limpar', 'none'].includes(modo)) {
      await clearTarget(t);
      return reply(`🗑️ Mídia de *${t.key}* removida.`);
    }

    // ── mídia: direta ou respondida ──
    const raw = m.msg?.message || msg?.message || {};
    const quoted = raw.extendedTextMessage?.contextInfo?.quotedMessage;
    const hasImage = !!(raw.imageMessage || quoted?.imageMessage);
    const qv = raw.videoMessage || quoted?.videoMessage;
    const hasVideo = !!qv;
    const srcMsg = raw.imageMessage || raw.videoMessage ? (m.msg || msg) : (quoted?.imageMessage || quoted?.videoMessage ? { message: quoted } : null);
    if (!srcMsg) return reply(`❓ Responde a uma *foto/vídeo/GIF* com:\n\`${prefix}setmenu ${args[0]} [foto|video|gif]\``);

    const kind = detectKind(hasImage, hasVideo, !!qv?.gifPlayback, args[1]);
    if (!kind) return reply(`❓ Tipo? Usa: \`${prefix}setmenu ${args[0]} foto|video|gif\``);

    await reply('⏳ A comprimir mídia (menos tamanho, mesma qualidade)...').catch(() => {});
    try {
      const mh = require('../mediaHandler');
      const buf = await mh.downloadFromMessage(srcMsg);
      if (!buf?.length) throw new Error('mídia vazia');
      const comp = kind === 'foto' ? await compressImage(buf) : await compressVideo(buf, kind === 'gif');
      if (!comp?.length) throw new Error('compressão falhou');

      fs.mkdirSync(MEDIA_DIR, { recursive: true });
      const ext = kind === 'foto' ? 'jpg' : 'mp4';
      const dest = path.join(MEDIA_DIR, `${t.key}.${ext}`);
      try { fs.unlinkSync(path.join(MEDIA_DIR, `${t.key}.${ext === 'mp4' ? 'jpg' : 'mp4'}`)); } catch {}
      fs.writeFileSync(dest, comp);
      if (t.main) {
        fs.mkdirSync(LOGOS_DIR, { recursive: true });
        try { fs.unlinkSync(path.join(LOGOS_DIR, kind === 'foto' ? 'fotomenu.mp4' : 'fotomenu.jpg')); } catch {}
        try { fs.unlinkSync(path.join(LOGOS_DIR, 'fotomenu.png')); } catch {}
        fs.writeFileSync(path.join(LOGOS_DIR, kind === 'foto' ? 'fotomenu.jpg' : 'fotomenu.mp4'), comp);
      }
      const c = cache();
      await c.set(`menu_media_${t.key}_url`, `local:menu-media/${t.key}.${ext}?v=${Date.now()}`);
      await c.set(`menu_media_${t.key}_type`, kind === 'foto' ? 'image' : kind);
      // v7.64: bytes no Mongo — ficheiros locais evaporam a cada restart
      // da Northflank (contentor efémero, sem volumes); o binário sobrevive.
      let binOk = false;
      if (comp.length <= 12 * 1024 * 1024) {
        await c.set(`menu_media_${t.key}_bin`, comp.toString('base64')).catch(() => {});
        binOk = true;
      }
      const kb = (b) => (b.length / 1024).toFixed(0);
      return reply(`✅ *${t.key}* agora tem ${kind === 'foto' ? '🖼️ foto' : kind === 'gif' ? '🎞️ GIF' : '🎬 vídeo'}!\n📦 ${kb(buf)}KB → ${kb(comp)}KB\nVê com o comando do menu.${binOk ? '' : ' (⚠️ pesado: só neste servidor)'}`);
    } catch (e) {
      return reply('❌ setmenu: ' + String(e?.message || e).slice(0, 120));
    }
  });
}

module.exports = registerSetmenu;
module.exports.resolveTarget = resolveTarget;
module.exports.detectKind = detectKind;
module.exports.compressImage = compressImage;
module.exports.compressVideo = compressVideo;
