// Gerador de stubs funcionais — node scripts/gen-functional-stubs.js
const fs = require('fs');
const sd = require('../src/bot/submenuData');
const allCmds = JSON.parse(fs.readFileSync('/tmp/all_cmds.json', 'utf8'));

// Comandos que já têm implementação real (não registar stub)
const ch = require('../src/bot/caseHandler'); ch.init();
const nc = require('../src/bot/nativeCommands');
const pk = ['interactions','family','economy','games','cheats'].map(m => Object.keys(require('../src/bot/packages/' + m)));
const realCmds = new Set([...ch.CASES.keys(), ...Object.keys(nc), ...pk.flat()]);

const missing = allCmds.filter(c => !realCmds.has(c) && c !== '__change_theme_handler__');
console.log('Comandos com implementação real:', realCmds.size);
console.log('Comandos que precisam de stub funcional:', missing.length);

const L = [];
L.push("'use strict';");
L.push("const TR = require('../themeResolver');");
L.push("const { applyFont } = require('../botPersonality');");
L.push("const sd = require('../submenuData');");
L.push("const R = (a,b) => Math.floor(Math.random()*(b-a+1))+a;");
L.push("const P = a => a[Math.floor(Math.random()*a.length)];");
L.push("const DH=['Explodindo 🔥','Máximo 💯','Sem limites 🚀','Absurdo 😱'];");
L.push("const DM=['Moderado ⚖️','Na média 📊','Equilibrado ☯️'];");
L.push("const DL=['Quase zero 📉','Mínimo 🔋','Esperança 🌱'];");
L.push("function dg(p){return p>70?P(DH):p>30?P(DM):P(DL);}");
L.push("");
L.push("async function hZ({sock,msg,ctx,args,command}){");
L.push("  const t=await TR.getThemeForContext(ctx.remoteJid);");
L.push("  const tgt=args[0]?args.join(' ').replace(/[@+]/g,''):ctx.pushName;");
L.push("  const p=R(1,100);");
L.push("  const lp=t.linePrefix||'║';");
L.push("  const txt=(t.topBorder||'').replace(/{TITLE}/g,command.toUpperCase()).replace(/{ICON}/g,t.icon)+'\\n'+lp+' Alvo: @'+tgt+'\\n'+lp+' Nível: *'+p+'%*\\n'+lp+' '+dg(p)+'\\n'+(t.bottomBorder||'').replace(/{ICON}/g,t.icon);");
L.push("  return sock.sendMessage(ctx.remoteJid,{text:txt},{quoted:msg});");
L.push("}");
L.push("");
L.push("async function hR({sock,msg,ctx,command,reply}){");
L.push("  const t=await TR.getThemeForContext(ctx.remoteJid);");
L.push("  if(!ctx.isGroup)return reply('👥 Só em grupos.');");
L.push("  const meta=await sock.groupMetadata(ctx.remoteJid);");
L.push("  const mbs=meta.participants.filter(p=>!p.admin).slice(0,10).map(p=>({n:p.id.split('@')[0],j:p.id,p:R(1,100)})).sort((a,b)=>b.p-a.p);");
L.push("  const lbl=command.replace('rank','').toUpperCase();");
L.push("  const lp=t.linePrefix||'║';");
L.push("  const ls=mbs.map((r,i)=>lp+' '+(i+1)+'. @'+r.n+' — *'+r.p+'%* '+lbl.toLowerCase());");
L.push("  const txt=(t.topBorder||'').replace(/{TITLE}/g,'RANK '+lbl).replace(/{ICON}/g,t.icon)+'\\n'+ls.join('\\n')+'\\n'+(t.bottomBorder||'').replace(/{ICON}/g,t.icon);");
L.push("  return sock.sendMessage(ctx.remoteJid,{text:txt,mentions:mbs.map(r=>r.j)},{quoted:msg});");
L.push("}");
L.push("");
L.push("async function hT({sock,msg,ctx,args,command,reply,prefix}){");
L.push("  const txt=args.join(' ').trim();");
L.push("  if(!txt)return reply('✍️ Uso: `'+prefix+command+' texto`');");
L.push("  const fm={bold:'bold',bold2:'bold',mini:'tiny',tiny:'tiny',smallcaps:'smallcaps',scaps:'smallcaps',mono:'mono',monospace:'mono',code:'mono',glitch:'glitch',zalgo:'glitch'};");
L.push("  return sock.sendMessage(ctx.remoteJid,{text:applyFont(txt,fm[command]||'smallcaps')},{quoted:msg});");
L.push("}");
L.push("");
L.push("async function hI({sock,msg,ctx,args,command}){");
L.push("  const t=await TR.getThemeForContext(ctx.remoteJid);");
L.push("  const a={soco:'👊 socou',beijar:'💋 beijou',abracar:'🤗 abraçou',tapa:'👋 tapou',morder:'🦷 mordeu',lamber:'👅 lambeu',dancar:'💃 dançou com',cafune:'💆 cafuné em',explodir:'💥 explodiu',matar:'💀 eliminou',sexo:'🔥 levou pra cama',goza:'😏 provocou',mamar:'🍼 deu mamá',beijob:'💋 beijou ousadamente',surubao:'😈 chamou pra suruba',tomate:'🍅 atirou tomate em'};");
L.push("  const act=a[command]||'💫 interagiu com';");
L.push("  const tgt=args[0]?args.join(' '):'o ar 😂';");
L.push("  return sock.sendMessage(ctx.remoteJid,{text:(t.icon||'💫')+' *'+ctx.pushName+'* '+act+' *'+tgt+'*'},{quoted:msg});");
L.push("}");
L.push("");
L.push("async function hE({sock,msg,ctx,args,command}){");
L.push("  const t=await TR.getThemeForContext(ctx.remoteJid);");
L.push("  const e={trabalhar:'⚒️',minerar:'⛏️',explorar:'🗺️',masmorra:'🏰',pescar:'🎣',fish:'🎣',coletar:'🧺',colher:'🌾',meditar:'🧘',forge:'🔨',enchant:'✨',eat:'🍽️',cook:'🍳',plantar:'🌱',cultivar:'🌿',cacar:'🏹'}[command]||'🎮';");
L.push("  const c=R(10,500),x=R(5,100),lp=t.linePrefix||'▸';");
L.push("  return sock.sendMessage(ctx.remoteJid,{text:(t.icon||'🎮')+' *'+e+' '+command.toUpperCase()+'*\\n'+lp+' '+ctx.pushName+' ganhou:\\n'+lp+' 💰 *'+c+'* moedas\\n'+lp+' ⭐ *'+x+'* XP\\n> '+(t.vibe||'Dark Engine')},{quoted:msg});");
L.push("}");
L.push("");
L.push("async function hA({sock,msg,ctx,args,command,reply}){");
L.push("  const t=await TR.getThemeForContext(ctx.remoteJid);");
L.push("  if(!ctx.isGroup)return reply('👥 Só em grupos.');");
L.push("  try{");
L.push("    if(command==='open'){await sock.groupSettingUpdate(ctx.remoteJid,'not_announcement');return sock.sendMessage(ctx.remoteJid,{text:(t.icon||'🛡️')+' 🔓 Grupo aberto.'},{quoted:msg});}");
L.push("    if(command==='close'){await sock.groupSettingUpdate(ctx.remoteJid,'announcement');return sock.sendMessage(ctx.remoteJid,{text:(t.icon||'🛡️')+' 🔒 Grupo fechado.'},{quoted:msg});}");
L.push("    if(command==='linkgp'){const c=await sock.groupInviteCode(ctx.remoteJid);return sock.sendMessage(ctx.remoteJid,{text:(t.icon||'🛡️')+' 🔗 https://chat.whatsapp.com/'+c},{quoted:msg});}");
L.push("  }catch(e){return reply((t.icon||'❌')+' Erro: '+e.message);}");
L.push("  return reply((t.icon||'🛡️')+' *'+command.toUpperCase()+'*\\n'+(t.linePrefix||'▸')+' Comando admin\\n> '+(t.vibe||''));");
L.push("}");
L.push("");
L.push("async function hIA({sock,msg,ctx,args,command,reply}){");
L.push("  const txt=args.join(' ').trim();");
L.push("  if(!txt)return reply('🤖 Uso: `'+command+' <pergunta>`');");
L.push("  try{const ai=require('../ai');const a=await ai.chat('['+command+'] '+txt,'',{},false);return sock.sendMessage(ctx.remoteJid,{text:'🤖 *'+command.toUpperCase()+'*\\n\\n'+a},{quoted:msg});}");
L.push("  catch{return reply('🤖 IA indisponível.');}");
L.push("}");
L.push("");
L.push("async function hD({sock,msg,ctx,args,command,reply,prefix}){");
L.push("  const t=await TR.getThemeForContext(ctx.remoteJid);");
L.push("  const cat=sd.categorize(command);");
L.push("  const m=sd.SUBMENU_META[cat]||{icon:'📌',title:'COMANDO'};");
L.push("  return reply((t.icon||'📌')+' *'+command.toUpperCase()+'* — '+m.icon+' '+m.title+'\\n'+(t.linePrefix||'▸')+' Uso: `'+prefix+command+(args.length?' '+args.join(' '):' <args>')+'`\\n> '+(t.vibe||''));");
L.push("}");
L.push("");
L.push("const H={zoeira:hZ,rank:hR,texto:hT,interacoes:hI,economia:hE,admin:hA,ia:hIA};");
L.push("");
L.push("module.exports = function(registerCase) {");

const HMAP = {zoeira:'hZ',rank:'hR',texto:'hT',interacoes:'hI',economia:'hE',admin:'hA',ia:'hIA'};

for (const cmd of missing) {
  const cat = sd.categorize(cmd);
  const h = HMAP[cat] || 'hD';
  const safe = cmd.replace(/'/g, "\\'").replace(/\\/g, "\\\\");
  L.push("  registerCase(['" + safe + "'], async(c){return (" + h + ")(c);}, true);");
}

L.push("};");

fs.writeFileSync('src/bot/cases/stubs.js', L.join('\n'));
console.log('✅ stubs.js gerado com', missing.length, 'comandos funcionais');
