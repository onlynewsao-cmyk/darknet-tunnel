// Gerador de stubs — executa: node scripts/gen-stubs.js
const fs = require('fs');
const missing = JSON.parse(fs.readFileSync('/tmp/missing_cmds.json', 'utf8'));

const CATS = {
  rpg_perfil: ['rg','perfilrpg','rankrg','nome','rankricos','ficha','meustatus','toprpg','rankglobal','ranklvl','equipamentos','carteira'],
  rpg_economia: ['depositar','levantar','transferir','doar','daily','bau','roubar','dep','sacar','pix','comprar','vender','vagas','emprego','demitir','habilidades','desafiosemanal','desafiomensal','investir','sell','topriqueza','tributos'],
  rpg_trabalho: ['trabalhar','minerar','work','mine','fish','coletar','colher','caçar','plantar','cultivar','plantacao','cook','receitas','ingredientes','eat','vendercomida','sementes'],
  rpg_evolucao: ['meditar','explorar','gear','masmorra','qg','evoluir','prestige','streak','reivindicar','speedup','bossrpg','eventos'],
  rpg_cassino: ['cassino','coinflip','crash','slots','apostar','blackjack','loteria','corrida','leilao'],
  rpg_pet: ['lojapet','treinarpet','petnome','pets','adotar','feed','train','evolve','petbattle','renamepet','petbet','equippet','unequippet'],
  rpg_combate: ['duelrpg','arena','torneio','assaltar','crime','guerra'],
  rpg_craft: ['forge','enchant','dismantle','reparar','materiais','precos'],
  rpg_social: ['casar','divorciar','namorar','terminar','casais','abracarrpg','beijarrpg','baterrpg','proteger'],
  rpg_familia: ['adotaruser','deserdar','arvore'],
  rpg_cla: ['criarcla','convidar','aceitarconvite','recusarconvite','expulsar','rmconvite'],
  rpg_premium: ['lojapremium','comprarpremium','boost','propriedades','cprop','cprops'],
  rpg_admin: ['rpgadd','rpgremove','rpgsetlevel','rpgadditem','rpgremoveitem','rpgresetplayer','rpgresetglobal','rpgstats'],
  search: ['stalkff','ttstalk','gitubstalk','stalkinsta','aptoide','rbxcodes','gethtml','idcanal','cep','cnpj','google','apps','dicionario','wikipedia'],
  ia: ['gpt5','gpt4','copiloto','claude','pplx','nano','nano2','sys-img','gemma','gemma2','codegemma','qwen','qwen2','qwen3','qwencoder','llama','llama3','phi','phi3','yi','kimi','kimik2','cog','mistral','magistral','baichuan','marin','rakutenai','rocket','swallow','falcon','ideias','explicar','resumirurl','resumirchat','recomendar','debater','aventura'],
  figurinhas: ['figmeme','figraiva','figcoreana','figanime','figroblox','figemoji','figdesenho','figengracada','attp','brat','brat2','legenda'],
  random: ['vazar','lermais','upload','abv','renomear','relevar','tabela','conselhos','getperfil','getbio','fazernick','listaddi','listaddd','conselho','conselhobiblico','piada','charada','motivacional','elogio','reflexao'],
  interacao: ['chute','chutar','tapa','tapar','soco','socar','beijob','beijarb','abraco','goza','gozar','mamar','mamada','mordida','lamber','lambida','explodir','sexo','surubao','tomate','cafune'],
  efeitos: ['naruto','rainbow','shadowsky','smoke','stars','metal','butterfly','cemetery','flaming','gradient','graffiti','harrypotter','neonparty','neonglow','neonmetalic','tiktoktxt','battlefield','pubg'],
  audio: ['bass','bass2','bass3','grave','grave2','grave3','reverb','reverb2','reverb3','8d2','8d3','slowed','slowed2','slowed3','slowedreverb','slowedreverb2','slowedreverb3','chorus','chorus2','chorus3','nightcore','vaporwave','hardcore','robot','chipmunk','squirrel','monster','whisper','pitch','deep','echo','stadium','cave','underwater','telephone','radio','lofi','flanger','phaser','tremolo','vibrato','reverse','karaoke','blown','earrape','fat','smooth','tomp3','shazam','myinstants','pintemp3','pintemp4'],
  downloads_extra: ['playid','yt3v2','yt4v2','twitterdl','spotify2','scdl','kwai','igstory','gdrive','mediafire','mcplugin','instamp3','instamp4','tiktok2','ttk','ttk2','playvid2','pinterest2','letra'],
  logos: ['darkgreen','write','advanced','typography','pixel','flag','americanflag','deleting','pornhub','avengers','captainamerica','stone3d','neon2','thor','deadpool','blackpink'],
  jogos: ['tictactoe','connect4','uno','memoria','wordle','digitar','batalhanaval','stop','anagrama','dueloquiz','cacapalavras','jogodavelha','eununca','vab','chance','quando','casal','shipo','ppt'],
  admin: ['promover','rebaixar','mute2','desmute2','listamute','adv','rmadv','listadv','dam','totag','sorteio','nomegp','linkgp','opengp','closegp','soadm','antilinkgp','antilinkhard','aceitatodos','proibir','antistatus','multiprefixo','ban2','bam','setbammsg','limparrank','resetrank','mantercontador','blockuser','unblockuser','listblocksgp','addblacklist','delblacklist','listblacklist','blockcmd','unblockcmd','hidetag','descgrupo','fotogrupo','addregra','delregra','automsg','banghost','limitmessage','dellimitmessage','solicitacoes','aprovar','recusarsolic','addmod','delmod','listmods','grantmodcmd','revokemodcmd','listmodcmds','wladd','wl.remove','wl.lista','parcerias','addparceria','delparceria','antidoc','antiloc','antifig','antibtn','antilinkcanal','antilinksoft','antiporn','x9','captcha','antitoxic','antipalavra','legendasaiu','legendabv','fotobv','rmfotobv','fotosaiu','rmfotosaiu','addautoadm','addautoadmidia','listautoadm','delautoadm','autorespostas','autorepo','autodl','minmessage','assistente','modobn','modoparceria','modorpg','modolite','autosticker','cmdlimit','fotomenugrupo','infoperso'],
  perfil_extra: ['myvip','lid','perfilpic','avaliar','suporte','subdono','bug','atividade','rankativo','rankinativo','rankativos','checkativo','totalcmd','topcmd','caixa','rara','lendaria','roles','role.vou','role.nvou','role.confirmados','role.criar','role.alterar','role.excluir','mention','afk','voltei','statusbot','statusgp','zipbot','gitbot','likeff','infoff'],
  flood: ['flood'],
  antiraid: ['antidemote','antiflood','antifigurinha','capturalink','antiraid','modoraid','raidstatus'],
  relacionamentos: ['brincadeira','namoro','casamento','trair','historicotraicao'],
};

const cmdCat = {};
for (const [cat, cmds] of Object.entries(CATS)) {
  for (const c of cmds) cmdCat[c] = cat;
}

const CAT_META = {
  rpg_perfil: { icon: '🩸', label: 'PERFIL & RANKING RPG' },
  rpg_economia: { icon: '💰', label: 'ECONOMIA RPG' },
  rpg_trabalho: { icon: '⚒️', label: 'TRABALHOS' },
  rpg_evolucao: { icon: '🧘', label: 'EVOLUÇÃO' },
  rpg_cassino: { icon: '🎰', label: 'CASSINO & APOSTAS' },
  rpg_pet: { icon: '🐾', label: 'PETS & COMPANHEIROS' },
  rpg_combate: { icon: '⚔️', label: 'COMBATE & BATALHAS' },
  rpg_craft: { icon: '🔨', label: 'CRAFTING' },
  rpg_social: { icon: '💝', label: 'SOCIAL RPG' },
  rpg_familia: { icon: '👨‍‍👧', label: 'FAMÍLIA' },
  rpg_cla: { icon: '🏰', label: 'CLÃ & COMUNIDADE' },
  rpg_premium: { icon: '💎', label: 'LOJA PREMIUM' },
  rpg_admin: { icon: '🔧', label: 'ADMIN RPG' },
  search: { icon: '🔎', label: 'SEARCH & STALK' },
  ia: { icon: '🤖', label: "IAs & CHATBOTS" },
  figurinhas: { icon: '🖼️', label: 'FIGURINHAS' },
  random: { icon: '🎲', label: 'RANDOM & UTILS' },
  interacao: { icon: '💬', label: 'INTERAÇÕES' },
  efeitos: { icon: '🎨', label: 'EFEITOS DE TEXTO' },
  audio: { icon: '🎧', label: 'EFEITOS DE ÁUDIO' },
  downloads_extra: { icon: '📥', label: 'DOWNLOADS EXTRA' },
  logos: { icon: '🖋️', label: 'LOGOTIPOS' },
  jogos: { icon: '🎮', label: 'JOGOS & DIVERSÃO' },
  admin: { icon: '🛡️', label: 'ADMIN & GRUPO' },
  perfil_extra: { icon: '👤', label: 'PERFIL & STATUS' },
  flood: { icon: '💥', label: 'FLOOD' },
  antiraid: { icon: '🛡️', label: 'ANTI RAID' },
  relacionamentos: { icon: '💞', label: 'RELACIONAMENTOS' },
  outros: { icon: '📌', label: 'OUTROS' },
};

// Build lines
const lines = [];
lines.push("/**");
lines.push(" * DARK BOT v5.5 — Stubs de comandos do ficheiro de referência");
lines.push(" * Gerado automaticamente — 882 comandos organizados por categoria");
lines.push(" * Cada stub responde com o tom da personalidade activa (change)");
lines.push(" */");
lines.push("'use strict';");
lines.push("");
lines.push("const themeResolver = require('../themeResolver');");
lines.push("");
lines.push("const CAT_META = " + JSON.stringify(CAT_META, null, 2) + ";");
lines.push("");
lines.push("module.exports = function registerStubs(registerCase) {");

for (const cmd of missing) {
  const cat = cmdCat[cmd] || 'outros';
  const safeCmd = cmd.replace(/'/g, "\\'").replace(/\\/g, '\\\\');
  lines.push("  registerCase(['" + safeCmd + "'], async ({ ctx, prefix, reply }) => {");
  lines.push("    const t = await themeResolver.getThemeForContext(ctx.remoteJid).catch(() => null);");
  lines.push("    const ic = t?.icon || '⚙️';");
  lines.push("    const m = CAT_META['" + cat + "'] || CAT_META.outros;");
  lines.push("    return reply(ic + ' *' + '" + safeCmd.toUpperCase() + "' + '* — ' + m.icon + ' ' + m.label + '\\n\\n' + (t?.bullet || '▸') + ' Comando registado — lógica em desenvolvimento.\\n' + (t?.bullet || '▸') + ' Uso: `' + prefix + safeCmd + '`\\n\\n> _' + (t?.vibe || 'Dark Engine') + '_');");
  lines.push("  }, true); // true = só se não existir");
}

lines.push("};");

fs.writeFileSync('src/bot/cases/stubs.js', lines.join('\n'));
console.log('✅ stubs.js criado:', missing.length, 'comandos');
console.log('   Categorias:', Object.keys(CATS).length);
console.log('   Tamanho:', (lines.join('\n').length / 1024).toFixed(0), 'KB');
