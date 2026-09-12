'use strict';
const TR = require('../themeResolver');
const { applyFont } = require('../botPersonality');
const sd = require('../submenuData');
const R = (a,b) => Math.floor(Math.random()*(b-a+1))+a;
const P = a => a[Math.floor(Math.random()*a.length)];
const DH=['Explodindo 🔥','Máximo 💯','Sem limites 🚀','Absurdo 😱'];
const DM=['Moderado ⚖️','Na média 📊','Equilibrado ☯️'];
const DL=['Quase zero 📉','Mínimo 🔋','Esperança 🌱'];
function dg(p){return p>70?P(DH):p>30?P(DM):P(DL);}

async function hZ({sock,msg,ctx,args,command}){
  const t=await TR.getThemeForContext(ctx.remoteJid);
  const tgt=args[0]?args.join(' ').replace(/[@+]/g,''):ctx.pushName;
  const p=R(1,100);
  const lp=t.linePrefix||'║';
  const txt=(t.topBorder||'').replace(/{TITLE}/g,command.toUpperCase()).replace(/{ICON}/g,t.icon)+'\n'+lp+' Alvo: @'+tgt+'\n'+lp+' Nível: *'+p+'%*\n'+lp+' '+dg(p)+'\n'+(t.bottomBorder||'').replace(/{ICON}/g,t.icon);
  return sock.sendMessage(ctx.remoteJid,{text:txt},{quoted:msg});
}

async function hR({sock,msg,ctx,command,reply}){
  const t=await TR.getThemeForContext(ctx.remoteJid);
  if(!ctx.isGroup)return reply('👥 Só em grupos.');
  const meta=await sock.groupMetadata(ctx.remoteJid);
  const mbs=meta.participants.filter(p=>!p.admin).slice(0,10).map(p=>({n:p.id.split('@')[0],j:p.id,p:R(1,100)})).sort((a,b)=>b.p-a.p);
  const lbl=command.replace('rank','').toUpperCase();
  const lp=t.linePrefix||'║';
  const ls=mbs.map((r,i)=>lp+' '+(i+1)+'. @'+r.n+' — *'+r.p+'%* '+lbl.toLowerCase());
  const txt=(t.topBorder||'').replace(/{TITLE}/g,'RANK '+lbl).replace(/{ICON}/g,t.icon)+'\n'+ls.join('\n')+'\n'+(t.bottomBorder||'').replace(/{ICON}/g,t.icon);
  return sock.sendMessage(ctx.remoteJid,{text:txt,mentions:mbs.map(r=>r.j)},{quoted:msg});
}

async function hT({sock,msg,ctx,args,command,reply,prefix}){
  const txt=args.join(' ').trim();
  if(!txt)return reply('✍️ Uso: `'+prefix+command+' texto`');
  const fm={bold:'bold',bold2:'bold',mini:'tiny',tiny:'tiny',smallcaps:'smallcaps',scaps:'smallcaps',mono:'mono',monospace:'mono',code:'mono',glitch:'glitch',zalgo:'glitch'};
  return sock.sendMessage(ctx.remoteJid,{text:applyFont(txt,fm[command]||'smallcaps')},{quoted:msg});
}

async function hI({sock,msg,ctx,args,command}){
  const t=await TR.getThemeForContext(ctx.remoteJid);
  const a={soco:'👊 socou',beijar:'💋 beijou',abracar:'🤗 abraçou',tapa:'👋 tapou',morder:'🦷 mordeu',lamber:'👅 lambeu',dancar:'💃 dançou com',cafune:'💆 cafuné em',explodir:'💥 explodiu',matar:'💀 eliminou',sexo:'🔥 levou pra cama',goza:'😏 provocou',mamar:'🍼 deu mamá',beijob:'💋 beijou ousadamente',surubao:'😈 chamou pra suruba',tomate:'🍅 atirou tomate em'};
  const act=a[command]||'💫 interagiu com';
  const tgt=args[0]?args.join(' '):'o ar 😂';
  return sock.sendMessage(ctx.remoteJid,{text:(t.icon||'💫')+' *'+ctx.pushName+'* '+act+' *'+tgt+'*'},{quoted:msg});
}

async function hE({sock,msg,ctx,args,command}){
  const t=await TR.getThemeForContext(ctx.remoteJid);
  const e={trabalhar:'⚒️',minerar:'⛏️',explorar:'🗺️',masmorra:'🏰',pescar:'🎣',fish:'🎣',coletar:'🧺',colher:'🌾',meditar:'🧘',forge:'🔨',enchant:'✨',eat:'🍽️',cook:'🍳',plantar:'🌱',cultivar:'🌿',cacar:'🏹'}[command]||'🎮';
  const c=R(10,500),x=R(5,100),lp=t.linePrefix||'▸';
  return sock.sendMessage(ctx.remoteJid,{text:(t.icon||'🎮')+' *'+e+' '+command.toUpperCase()+'*\n'+lp+' '+ctx.pushName+' ganhou:\n'+lp+' 💰 *'+c+'* moedas\n'+lp+' ⭐ *'+x+'* XP\n> '+(t.vibe||'Dark Engine')},{quoted:msg});
}

// Verifica se quem envia é dono do bot ou admin do grupo.
// Só é chamado pelos comandos que executam acções reais (não pelos stubs
// de texto), portanto não acrescenta chamadas no caminho quente.
async function senderIsAdmOrOwner(sock,ctx){
  if(ctx.isOwner)return true;
  if(!ctx.isGroup)return false;
  try{
    const meta=await sock.groupMetadata(ctx.remoteJid);
    if(!meta?.participants)return false;
    const snum=String(ctx.senderNumber||'').replace(/\D/g,'');
    return meta.participants.some(p=>{
      const pNum=String(p.id||'').split(':')[0].split('@')[0].replace(/\D/g,'');
      return pNum===snum&&(p.admin==='admin'||p.admin==='superadmin');
    });
  }catch{return false;}
}

async function hA({sock,msg,ctx,args,command,reply}){
  const t=await TR.getThemeForContext(ctx.remoteJid);
  if(!ctx.isGroup)return reply('👥 Só em grupos.');
  // Comandos que executam acções reais exigem admin/dono.
  if(['open','close','linkgp'].includes(command)&&!await senderIsAdmOrOwner(sock,ctx)){
    return reply('🚫 Só o *Dono* ou *Admins* do grupo podem usar este comando.');
  }
  try{
    if(command==='open'){await sock.groupSettingUpdate(ctx.remoteJid,'not_announcement');return sock.sendMessage(ctx.remoteJid,{text:(t.icon||'🛡️')+' 🔓 Grupo aberto.'},{quoted:msg});}
    if(command==='close'){await sock.groupSettingUpdate(ctx.remoteJid,'announcement');return sock.sendMessage(ctx.remoteJid,{text:(t.icon||'🛡️')+' 🔒 Grupo fechado.'},{quoted:msg});}
    if(command==='linkgp'){const c=await sock.groupInviteCode(ctx.remoteJid);return sock.sendMessage(ctx.remoteJid,{text:(t.icon||'🛡️')+' 🔗 https://chat.whatsapp.com/'+c},{quoted:msg});}
  }catch(e){return reply((t.icon||'❌')+' Erro: '+e.message);}
  return reply((t.icon||'🛡️')+' *'+command.toUpperCase()+'*\n'+(t.linePrefix||'▸')+' Comando admin\n> '+(t.vibe||''));
}

async function hIA({sock,msg,ctx,args,command,reply}){
  const txt=args.join(' ').trim();
  if(!txt)return reply('🤖 Uso: `'+command+' <pergunta>`');
  try{const ai=require('../ai');const a=await ai.chat('['+command+'] '+txt,'',{},false);return sock.sendMessage(ctx.remoteJid,{text:'🤖 *'+command.toUpperCase()+'*\n\n'+a},{quoted:msg});}
  catch{return reply('🤖 IA indisponível.');}
}

async function hD({sock,msg,ctx,args,command,reply,prefix}){
  const t=await TR.getThemeForContext(ctx.remoteJid);
  const cat=sd.categorize(command);
  const m=sd.SUBMENU_META[cat]||{icon:'📌',title:'COMANDO'};
  return reply((t.icon||'📌')+' *'+command.toUpperCase()+'* — '+m.icon+' '+m.title+'\n'+(t.linePrefix||'▸')+' Uso: `'+prefix+command+(args.length?' '+args.join(' '):' <args>')+'`\n> '+(t.vibe||''));
}

const H={zoeira:hZ,rank:hR,texto:hT,interacoes:hI,economia:hE,admin:hA,ia:hIA};

module.exports = function(registerCase) {
};