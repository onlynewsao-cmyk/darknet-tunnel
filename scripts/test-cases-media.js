'use strict';
/** v7.38 — addcase/downcase/listcases/delcase/runcase/testcase + mediaup/mediadown/medialist/mediadel (mocks de DB/Cloudinary) */
process.env.NODE_ENV='test';
const Module=require('module'); const orig=Module.prototype.require;
const store={}; 
Module.prototype.require=function(id){
  if(id.endsWith('database/models/BotConfig')||id==='../database/models/BotConfig'||id==='./database/models/BotConfig'){ return { get:async(k,d)=>store[k]??d, set:async(k,v)=>{store[k]=v}, findOne:()=>({lean:async()=>null}) }; }
  if(id.endsWith('models/Media')){ return global.MediaMock; }
  if(id==='cloudinary'){ return { v2:{ config(){}, uploader:{ upload:async(d,o)=>({secure_url:'https://res.cloudinary.com/x/'+o.public_id, public_id:o.public_id, bytes:d.length}), destroy:async()=>({}) } } }; }
  return orig.apply(this,arguments);
};
const ch=require('../src/bot/caseHandler');
const out=[]; const sock={ sendMessage:async(jid,p)=>{ out.push(p); return {key:{id:'x'}} }, groupMetadata:async()=>({participants:[]}) };
const ctx={ remoteJid:'g@g.us', isGroup:true, senderNumber:'244900', isOwner:true, prefix:'!' };
function mk(text, quoted){ const key={id:'m'+Math.random(),remoteJid:ctx.remoteJid,participant:'244900@s.whatsapp.net'}; const message = quoted? {extendedTextMessage:{text,contextInfo:{quotedMessage:{conversation:quoted},stanzaId:'q1',participant:'244900@s.whatsapp.net'}}} : {conversation:text}; return {key,message,pushName:'Dark'}; }
// simulate the handler's path: args = rest.split(/\s+/), text = args.join(' ')
async function run(full, quoted){ const rest=full.replace(/^!/,''); const args=rest.split(/\s+/); const cmd=args.shift(); out.length=0; const ok=await ch.runCase(cmd,{sock,msg:mk(full,quoted),ctx,args,text:args.join(' ').trim(),prefix:'!',isOwner:true,config:{bot:{prefix:'!'}}}); await new Promise(r=>setTimeout(r,150)); return {ok,out:out.map(p=>p.text||p.caption||(p.react?'react:'+p.react.text:'')||JSON.stringify(Object.keys(p)))}; }
(async()=>{
  ch.init(); await ch.loadDynamicCases();
  let ok=0,fail=0; const C=(n,c,x='')=>{ if(c)ok++; else fail++; console.log(c?'  ✅':'  ❌',n,c?'':x); };
  let r=await run('!addcase ola\n---\n// diz olá\nreply("Olá do case!")');
  C('addcase com --- multilinha (comentário //)', r.out.some(t=>/adicionado com sucesso/i.test(t)), JSON.stringify(r.out));
  r=await run('!ola'); C('!ola executa e responde', r.out.some(t=>/Olá do case/.test(t)), JSON.stringify(r.out));
  r=await run('!addcase teste2', 'case \'teste2\': {\n  reply("citado ok")\n  break\n}'); C('addcase por citação (switch/case)', r.out.some(t=>/sucesso/i.test(t)), JSON.stringify(r.out));
  r=await run('!teste2'); C('!teste2 executa', r.out.some(t=>/citado ok/.test(t)), JSON.stringify(r.out));
  r=await run('!addcase mod', 'module.exports = { name: "mod", async execute(sock, from, msg, args) { await sock.sendMessage(from, { text: "mod ok " + args.join(" ") }) } }'); C('addcase module.exports', r.out.some(t=>/sucesso/i.test(t)), JSON.stringify(r.out));
  r=await run('!mod a b'); C('!mod a b executa', r.out.some(t=>/mod ok a b/.test(t)), JSON.stringify(r.out));
  r=await run('!listcases'); C('listcases mostra 3', /ola/.test(r.out[0])&&/teste2/.test(r.out[0])&&/mod/.test(r.out[0]), JSON.stringify(r.out));
  r=await run('!downcase ola'); C('downcase ola → documento', r.out.some(t=>/Case Dinâmico/.test(t)), JSON.stringify(r.out));
  r=await run('!downcase ping'); C('downcase ping (ficheiro/nativo)', r.out.some(t=>/Case \(ficheiro\)|Case \(nativo\)|Pronto para/.test(t)), JSON.stringify(r.out));
  r=await run('!testcase ola'); C('testcase ola válido', r.out.some(t=>/Válido: SIM/.test(t)), JSON.stringify(r.out));
  r=await run('!runcase ola'); C('runcase ola', r.out.some(t=>/Olá do case/.test(t)), JSON.stringify(r.out));
  r=await run('!delcase ola'); C('delcase ola', r.out.some(t=>/removido/.test(t)), JSON.stringify(r.out));
  r=await run('!ola'); C('!ola já não existe', r.ok===false, JSON.stringify(r));
  // não-dono
  out.length=0; await ch.runCase('addcase',{sock,msg:mk('!addcase x reply(1)'),ctx,args:['x','reply(1)'],text:'x reply(1)',prefix:'!',isOwner:false,config:{}}); await new Promise(r=>setTimeout(r,150)); C('não-dono bloqueado', /Só o Dono/.test(out[0]?.text||''));
  // mup / mdown
  const docs={}; global.MediaMock={ findOneAndUpdate:async(q,d)=>{docs[d.name]=d;return d}, findOne:async(q)=>{const re=q.name.$regex;const k=Object.keys(docs).find(n=>re.test(n));return k?{...docs[k],deleteOne:async()=>{delete docs[k]}}:null}, find:()=>({sort:()=>({limit:()=>({lean:async()=>Object.values(docs)})})}) };
  const nc=require('../src/bot/nativeCommands');
  const mh=require('../src/bot/mediaHandler'); mh.downloadFromMessage=async()=>Buffer.from('imgdata');
  out.length=0; await nc.mup({sock,msg:{key:{id:'i'},message:{imageMessage:{mimetype:'image/jpeg',url:'x'}}},ctx,args:['logo','oficial'],isOwner:true,config:{}}); C('mup guarda "logo oficial"', out.some(p=>/Mídia guardada/.test(p.text||'')), JSON.stringify(out));
  out.length=0; await nc.mdown({sock,msg:{key:{id:'j'},message:{conversation:'!mdown logo'}},ctx,args:['logo']}); C('mdown envia imagem', out.some(p=>p.image), JSON.stringify(out.map(p=>Object.keys(p))));
  out.length=0; await nc.mlist({sock,msg:{key:{id:'k'},message:{}},ctx,isOwner:true}); C('mlist lista', /logo oficial/.test(out[0]?.text||''));
  out.length=0; await nc.mdel({sock,msg:{key:{id:'l'},message:{}},ctx,args:['logo'],isOwner:true}); C('mdel apaga', /apagada/.test(out[0]?.text||''));
  out.length=0; await nc.mup({sock,msg:{key:{id:'i'},message:{conversation:'x'}},ctx,args:[],isOwner:true,config:{}}); C('mup sem mídia avisa', /Responde\/envias/.test(out[0]?.text||''));
  console.log(`\n${fail?'💥':'🎉'} ADDCASE/DOWNCASE/MUP/MDOWN: ${ok} OK / ${fail} FALHOU\n`); process.exit(fail?1:0);
})().catch(e=>{console.error('ERR',e);process.exit(1)});
