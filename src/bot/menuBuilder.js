/**
 * Menu Builder — Estilo Cyberpunk/Matrix/Glitch
 */

function formatUptime(ms) {
  const s = Math.floor(ms/1000);
  const d = Math.floor(s/86400), h = Math.floor((s%86400)/3600), m = Math.floor((s%3600)/60);
  return `${d}d ${h}h ${m}m`;
}

function glitch(text) {
  return text.split('').map(c => Math.random() > 0.7 ? `${c}\u0336` : c).join('');
}

function buildMainMenu({ ctx, config, stats, prefixes }) {
  const p = config.bot.prefix;
  const userName = (ctx.pushName || 'D4RK_USER').toUpperCase();
  const number = ctx.senderNumber || '????';
  // v6.40: alinhado com o roleResolver — 👑 Dono > 💎 VIP > 🛡️ Admin > 🆓 Free
  const roleIcon = stats.role === 'owner'   ? '👑 DONO SUPREMO'
                 : stats.role === 'premium' ? '💎 VIP'
                 : stats.role === 'admin'   ? '🛡️ ADMIN'
                 : '🆓 FREE';
  const uptime = formatUptime(Date.now() - (stats.startTime || Date.now()));
  const prefixList = (prefixes || [p]).join(' ');

  return `╔═══════════════════════════════════╗
║  ▓▓▓ ${config.bot.name.padEnd(28, ' ').slice(0,28)}▓▓▓
║  ▒▒▒  ⚡ THE_D4RK_S1DE_OF_W3B ⚡   ▒▒▒
╚═══════════════════════════════════╝

▰▱▰▱▰▱▰▱▰▱▰▱▰▱▰▱▰▱▰▱▰▱▰▱▰▱
▌  *◈ USER_PROFILE ◈*  ▐
▰▱▰▱▰▱▰▱▰▱▰▱▰▱▰▱▰▱▰▱▰▱▰▱▰▱
┃ ➣ NAME: \`${userName}\`
┃ ➣ NUM:  \`+${number}\`
┃ ➣ TIER: ${roleIcon}
┃ ➣ ZONE: ${ctx.isGroup ? '👥 ' + (ctx.groupName||'GROUP') : '📱 PRIVATE'}
╰━━━━━━━━━━━━━━━━━━━━━━━━━

▰▱▰▱▰▱▰▱▰▱▰▱▰▱▰▱▰▱▰▱▰▱▰▱
▌  *◈ SYS_STATUS ◈*  ▐
▰▱▰▱▰▱▰▱▰▱▰▱▰▱▰▱▰▱▰▱▰▱▰▱
┃ ⚡ OWNER:    ${config.owner.name}
┃ 🕒 UPTIME:   ${uptime}
┃ 👥 USERS:    ${stats.totalUsers || 0}
┃ 🌐 GROUPS:   ${stats.totalGroups || 0}
┃ 🔑 PREFIXES: \`${prefixList}\`
╰━━━━━━━━━━━━━━━━━━━━━━━━━

╔═══════════════════════════════════╗
║  ░▒▓ NEURAL.AI ▓▒░               ║
╚═══════════════════════════════════╝
┣━ ⌬ \`${p}ia\` ➜ chat com IA
┣━ ⌬ \`${p}gpt\` ➜ alias para !ia
┣━ ⌬ \`${p}imagem\` ➜ gerar imagem
┗━ ⌬ \`${p}figura\` ➜ sticker IA

╔═══════════════════════════════════╗
║  ░▒▓ DATA.LEECH ▓▒░              ║
╚═══════════════════════════════════╝
┣━ ▶ \`${p}play\` ➜ áudio YouTube
┣━ ▶ \`${p}play2\` ➜ áudio HD 320kbps
┣━ ▶ \`${p}video\` ➜ vídeo YouTube
┣━ ▶ \`${p}video2\` ➜ vídeo low quality
┣━ ▶ \`${p}tiktok\` ➜ TikTok sem marca
┣━ ▶ \`${p}instagram\` ➜ Instagram
┣━ ▶ \`${p}fb\` ➜ Facebook
┣━ ▶ \`${p}twitter\` ➜ X/Twitter
┣━ ▶ \`${p}spotify\` ➜ Spotify
┣━ ▶ \`${p}soundcloud\` ➜ SoundCloud
┗━ ▶ \`${p}pinterest\` ➜ Pinterest

╔═══════════════════════════════════╗
║  ░▒▓ STICKER.FORGE ▓▒░           ║
╚═══════════════════════════════════╝
┣━ ◢ \`${p}sticker\` ➜ foto→sticker
┣━ ◢ \`${p}toimg\` ➜ sticker→foto
┣━ ◢ \`${p}attp\` ➜ texto animado
┗━ ◢ \`${p}ttp\` ➜ texto sticker

╔═══════════════════════════════════╗
║  ░▒▓ GROUP.CTRL ▓▒░              ║
╚═══════════════════════════════════╝
┣━ ⚙ \`${p}ban\` / \`${p}kick\` ➜ banir
┣━ ⚙ \`${p}promote\` ➜ tornar admin
┣━ ⚙ \`${p}demote\` ➜ remover admin
┣━ ⚙ \`${p}grupo\` ➜ info grupo
┣━ ⚙ \`${p}link\` ➜ link convite
┣━ ⚙ \`${p}revoke\` ➜ resetar link
┣━ ⚙ \`${p}open\` / \`${p}close\` ➜ abrir/fechar
┣━ ⚙ \`${p}todos\` ➜ marcar todos
┣━ ⚙ \`${p}hidetag\` ➜ marcar oculto
┣━ ⚙ \`${p}antilink\` on/off ➜ anti-link
┣━ ⚙ \`${p}antispam\` on/off ➜ anti-spam
┗━ ⚙ \`${p}welcome\` on/off ➜ boas-vindas

╔═══════════════════════════════════╗
║  ░▒▓ SOCIAL.NET ▓▒░              ║
╚═══════════════════════════════════╝
┣━ ♥ \`${p}abracar\` \`${p}beijar\`
┣━ ♥ \`${p}cafune\` \`${p}declarar\`
┣━ ♥ \`${p}flertar\` \`${p}paparico\`
┣━ ☠ \`${p}tapa\` \`${p}soco\` \`${p}chute\`
┣━ ☠ \`${p}tiro\` \`${p}facada\` \`${p}matar\`
┣━ ☠ \`${p}bater\` \`${p}morder\` \`${p}cuspir\`
┣━ ☠ \`${p}empurrar\` \`${p}envenenar\`
┣━ ☠ \`${p}espancar\` \`${p}bullying\`
┗━ ◈ \`${p}mimimi\` \`${p}fofocar\` \`${p}acordar\` \`${p}cuidar\` \`${p}bencao\` \`${p}amaldicoar\`

╔═══════════════════════════════════╗
║  ░▒▓ SCAN.METRICS ▓▒░            ║
╚═══════════════════════════════════╝
┣━ ▼ \`${p}gay\` \`${p}lindo\` \`${p}feio\`
┣━ ▼ \`${p}burro\` \`${p}corno\` \`${p}rico\`
┗━ ▼ \`${p}safado\` \`${p}doido\` \`${p}gostoso\` \`${p}malucao\`

╔═══════════════════════════════════╗
║  ░▒▓ FAMILY.SYS ▓▒░              ║
╚═══════════════════════════════════╝
┣━ ⛓ \`${p}casar\` @user
┣━ ⛓ \`${p}aceitar\` / \`${p}recusar\`
┣━ ⛓ \`${p}divorciar\` \`${p}esposa\`
┣━ ⛓ \`${p}adotar\` @user
┣━ ⛓ \`${p}expulsar\` @filho
┗━ ⛓ \`${p}familia\`

╔═══════════════════════════════════╗
║  ░▒▓ CRYPTO.WALLET ▓▒░           ║
╚═══════════════════════════════════╝
┣━ ⬢ \`${p}saldo\` \`${p}daily\`
┣━ ⬢ \`${p}trabalhar\` \`${p}crime\`
┣━ ⬢ \`${p}pedir\` \`${p}roubar\` @user
┣━ ⬢ \`${p}depositar\` \`${p}sacar\`
┣━ ⬢ \`${p}transferir\` \`${p}apostar\`
┣━ ⬢ \`${p}loja\` \`${p}comprar\`
┣━ ⬢ \`${p}inventario\` \`${p}usar\`
┗━ ⬢ \`${p}heal\` \`${p}ranking\`

╔═══════════════════════════════════╗
║  ░▒▓ GAME.NET ▓▒░                ║
╚═══════════════════════════════════╝
┣━ ▣ \`${p}forca\` \`${p}letra\` \`${p}palavra\`
┣━ ▣ \`${p}quiz\` \`${p}resp\`
┣━ ▣ \`${p}adivinha\` \`${p}chute\`
┣━ ▣ \`${p}blackjack\` <aposta>
┣━ ▣ \`${p}russa\` (roleta russa)
┣━ ▣ \`${p}verdade\` \`${p}desafio\` \`${p}vd\`
┣━ ▣ \`${p}bingo\` \`${p}cacapalavras\`
┗━ ▣ \`${p}desistir\`

╔═══════════════════════════════════╗
║  ░▒▓ VPN.DECRYPT ⭐ PREMIUM ▓▒░   ║
╚═══════════════════════════════════╝
┣━ 🔓 \`${p}decrypt\` ➜ info
┣━ 🔓 Envie arquivo .ehi/.hat/.npv4
┗━ 🔓 ou cola URI bdnet://, wyrvpn://

╔═══════════════════════════════════╗
║  ░▒▓ UTILS.KIT ▓▒░               ║
╚═══════════════════════════════════╝
┣━ ⚒ \`${p}ping\` \`${p}info\` \`${p}id\`
┣━ ⚒ \`${p}dono\` \`${p}perfil\`
┣━ ⚒ \`${p}qrcode\` \`${p}calc\`
┣━ ⚒ \`${p}translate\` \`${p}clima\`
┗━ ⚒ \`${p}encurtar\`

╔═══════════════════════════════════╗
║  ░▒▓ PREMIUM.ACCESS ▓▒░          ║
╚═══════════════════════════════════╝
┗━ ⭐ \`${p}vip\` \`${p}assinar\` \`${p}meuplano\`

${stats.role === 'owner' ? `╔═══════════════════════════════════╗
║  ░▒▓ R00T.PANEL 👑 ▓▒░           ║
╚═══════════════════════════════════╝
┣━ 📢 \`${p}broadcast\` <msg>
┣━ ⭐ \`${p}setpremium\` <num> [dias]
┣━ 🚫 \`${p}blacklist\` / \`${p}unblacklist\`
┣━ 📊 \`${p}stats\` \`${p}restart\`
┣━ 🎭 \`${p}forjar\` \`${p}simular\`
┣━ 🎭 \`${p}fakeban\` \`${p}fakelog\`
┣━ 🎭 \`${p}forcareacao\` \`${p}send\`
┣━ 🎭 \`${p}eval\` \`${p}shell\`
┣━ 👁 \`${p}antidelete\` on/off
┣━ 👁 \`${p}apagadas\` \`${p}espiao\`
┣━ 👁 \`${p}grupos\` \`${p}ver\` <jid>
┣━ 🎮 \`${p}winforca\` \`${p}winquiz\`
┣━ 🎮 \`${p}winadivinha\` \`${p}godmode\`
┗━ 💸 \`${p}dar\` @user <valor> / \`${p}cassar\`

` : ''}╔═══════════════════════════════════╗
║  ░▒▓ ${config.bot.name} v6 ▓▒░         ║
║  ░▒▓ POWERED_BY: ${config.owner.name} ▓▒░  ║
╚═══════════════════════════════════╝
▰▱▰▱▰▱▰▱ END_OF_TRANSMISSION ▰▱▰▱▰▱▰▱`;
}

function buildMiniBanner(text) {
  return `▰▱▰▱▰▱▰▱▰▱▰▱▰▱▰▱▰▱▰▱
▌ ${text}
▰▱▰▱▰▱▰▱▰▱▰▱▰▱▰▱▰▱▰▱`;
}

function buildResultBox(title, lines) {
  let out = `╔═══════════════════════════════════╗\n║  ░▒▓ ${title} ▓▒░\n╚═══════════════════════════════════╝\n`;
  for (const l of lines) out += `┃ ${l}\n`;
  out += `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`;
  return out;
}

module.exports = { buildMainMenu, buildMiniBanner, buildResultBox, glitch, formatUptime };
