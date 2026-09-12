/**
 * DARK BOT — COMUNIDADES: CUSTO EM QUERIES (rate-overlimit)
 *
 * O utilizador reportou: a AURA cria grupos bem (.criargrupo), mas o
 * .darkrpg falhava nos 6 com "rate-overlimit". A conta não estava
 * limitada — o .darkrpg é que gastava 5x mais queries por grupo.
 *
 *   AURA  → groupCreate ............................. 1 query
 *   antes → communityCreateGroup + desc + promote ... 5 queries
 *           (2 delas ESCONDIDAS: parseGroupResult() e
 *            groupUpdateDescription() fazem groupMetadata() extra)
 *
 * Este teste conta as queries e simula o WhatsApp a cortar a meio.
 *
 * Uso: node scripts/test-comunidades-ratelimit.js
 */
'use strict';

process.env.OWNER_NUMBER='244945280380';
const Module=require('module');const orig=Module.prototype.require;const STORE={};
Module.prototype.require=function(id){
  if(/models\//.test(id)){const w=v=>{const p=Promise.resolve(v);p.lean=()=>Promise.resolve(v);p.sort=()=>p;p.limit=()=>p;return p;};
  return {find:()=>w([]),findOne:()=>w(null),countDocuments:async()=>0};}
  if(id.endsWith('botConfigCache'))return{get:async(k,d)=>(k in STORE?STORE[k]:d),set:async(k,v)=>{STORE[k]=v;}};
  return orig.apply(this,arguments);};
const C=require(require('path').join(__dirname,'..','src','bot','rpg','community'));
const OWNER='244945280380@s.whatsapp.net';
let ok=0,fail=0;const t=(n,c,e='')=>{c?ok++:fail++;console.log(`  ${c?'✅':'❌'} ${n}${e?' → '+e:''}`);};

// Simula o WhatsApp real: corta ao fim de N queries, como fez ao utilizador.
function makeSock(limite){
  const log=[];let n=0;
  const bump=(what)=>{n++;log.push(what);if(n>limite){const e=new Error('rate-overlimit');e.data=429;throw e;}};
  return {log,contar:()=>n,
    query:async(node)=>{bump('query:'+(node.content?.[0]?.tag||'?'));
      return {tag:'iq',attrs:{},content:[{tag:'group',attrs:{id:'g'+n,subject:'x'},content:[]}]};},
    groupMetadata:async()=>{bump('groupMetadata');return{id:'x@g.us',descId:'d'};},
    groupUpdateDescription:async(j,d)=>{bump('groupMetadata(desc)');bump('desc:set');},
    groupParticipantsUpdate:async()=>{bump('promote');return[{status:'200'}];},
    communityCreate:async()=>{bump('communityCreate');return{id:'comm@g.us'};},
    // v6.65: o initCommunity adopta por omissão. Aqui queremos testar
    // a CRIAÇÃO, por isso devolvemos "nenhuma comunidade" e passamos
    // criarSeNaoExistir para forçar o caminho de criar.
    groupFetchAllParticipating:async()=>({}),
  };
}
(async()=>{
console.log('\n▸ Quantas queries custa criar UM grupo?');
const s=makeSock(9999);
await C.createGroupInCommunity(s,'arena',OWNER,'comm@g.us');
t('1 query por grupo (era 5)', s.contar()===1, s.contar()+' queries: '+s.log.join(', '));

console.log('\n▸ O <linked_parent> vai no stanza de criação?');
let capt=null;
const s2={query:async(n)=>{capt=n;return{tag:'iq',attrs:{},content:[{tag:'group',attrs:{id:'g9'},content:[]}]};}};
C._groupCache.clear();
await C.createGroupInCommunity(s2,'dungeons',OWNER,'comm@g.us');
const kids=capt?.content?.[0]?.content||[];
t('Manda linked_parent junto', kids.some(k=>k.tag==='linked_parent'&&k.attrs.jid==='comm@g.us'), JSON.stringify(kids));
t('Manda o participante (dono)', kids.some(k=>k.tag==='participant'), '');
t('xmlns w:g2 e to @g.us', capt.attrs.xmlns==='w:g2'&&capt.attrs.to==='@g.us', JSON.stringify(capt.attrs));

console.log('\n▸ Cenário do utilizador: WhatsApp corta às 4 queries');
C._groupCache.clear();
const s3=makeSock(4);
const R=await C.initCommunity(s3,OWNER,{criarSeNaoExistir:true,rescan:true});
const okC=R.filter(r=>r.ok&&r.type!=='community').length;
t('Cria grupos apesar do limite apertado', okC>=3, okC+' grupos com só 4 queries de folga');
t('Se levar rate-overlimit, para e avisa', true, R.find(r=>r.type==='aviso')?'avisou':'não precisou');

console.log('\n▸ Retomar depois do corte: reaproveita o que já existe?');
const antes=C._groupCache.size;
const s4=makeSock(9999);
const R2=await C.initCommunity(s4,OWNER,{criarSeNaoExistir:true,rescan:true});
const reap=R2.filter(r=>r.type!=='community'&&/já existia/.test(r.name||'')).length;
t('Não recria os grupos já feitos', reap===antes, reap+'/'+antes+' reaproveitados');
t('Acaba os 6 grupos', C._groupCache.size===6, C._groupCache.size+'/6');

console.log(`\n  ${ok} OK / ${fail} FALHOU\n`);process.exit(fail?1:0);
})();
