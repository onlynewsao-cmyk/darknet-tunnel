/**
 * DARK BOT — AUDITORIA REAL DAS COMUNIDADES
 *
 * Não é "o comando existe". É: cria, reinicia o processo, recupera,
 * e o WhatsApp a dizer que não.
 *
 * Bugs que este teste apanha (todos eram reais em produção):
 *   • addAllUsersToMainGroup procurava _groupCache.get('aldeia') —
 *     chave que NUNCA existiu. O .addglb falhava 100% das vezes.
 *   • Todo o estado vivia em Maps de memória: o Render reinicia e
 *     o bot esquecia a comunidade toda.
 *   • groupParticipantsUpdate devolve [{status:'403'}] em vez de
 *     atirar erro — o catch nunca corria, ninguém recebia convite
 *     e o relatório dizia "adicionado" a quem não entrou.
 *   • O erro real das 3 tentativas era deitado fora.
 *   • group.id rebentava se o Baileys devolvesse null.
 *
 * Uso: node scripts/test-comunidades-real.js
 */
'use strict';

process.env.OWNER_NUMBER='244945280380';
const Module=require('module');const orig=Module.prototype.require;
const STORE={};
Module.prototype.require=function(id){
  if(/models\//.test(id)){const docs=[{whatsappNumber:'244900000001',name:'Zé',active:true},{whatsappNumber:'244900000002',name:'Ana',active:true}];
  const w=v=>{const p=Promise.resolve(v);p.lean=()=>Promise.resolve(v);p.sort=()=>p;p.limit=()=>p;p.select=()=>p;return p;};
  return {findOne:()=>w(docs[0]),find:()=>w(docs),getOrCreate:async()=>docs[0],countDocuments:async()=>2};}
  if(id.endsWith('botConfigCache'))return{get:async(k,d)=>(k in STORE?STORE[k]:d),set:async(k,v)=>{STORE[k]=v;}};
  return orig.apply(this,arguments);};
const C=require(require('path').join(__dirname,'..','src','bot','rpg','community'));
const OWNER='244945280380@s.whatsapp.net';
let ok=0,fail=0; const t=(n,c,e='')=>{c?ok++:fail++;console.log(`  ${c?'✅':'❌'} ${n}${e?' → '+String(e).slice(0,70):''}`);};
(async()=>{
console.log('\n╔═══ COMUNIDADES WHATSAPP — AUDITORIA REAL ═══╗');
console.log('\n▸ A. Comunidade cria e PERSISTE');
let n=0;
// v6.65: o initCommunity passou a ADOPTAR por omissão (criar à mão
// custa 0 queries). Para criar do zero é preciso criarSeNaoExistir.
const sockOK={communityCreate:async()=>({id:'comm1@g.us'}),communityCreateGroup:async(s)=>({id:'g'+(++n)+'@g.us'}),
 groupUpdateDescription:async()=>{},groupParticipantsUpdate:async()=>[{status:'200'}],communityLinkGroup:async()=>{},groupCreate:async()=>({id:'gx@g.us'}),
 groupFetchAllParticipating:async()=>({}),
 query:async(node)=>({tag:'iq',attrs:{},content:[{tag:'group',attrs:{id:'g'+(++n)},content:[]}]})};
const r=await C.initCommunity(sockOK,OWNER,{criarSeNaoExistir:true,rescan:true});
t('Comunidade + 6 grupos criados', r.filter(x=>x.ok).length===7, r.filter(x=>x.ok).length+'/7');
t('Estado gravado no MongoDB', !!STORE['darkrpg_community_v1'], JSON.stringify(STORE['darkrpg_community_v1']||{}).slice(0,60));
t('Arsenal ficou no cache', !!C._groupCache.get('arsenal'), C._groupCache.get('arsenal'));

console.log('\n▸ B. Reinício do Render (memória limpa) — sobrevive?');
delete require.cache[require.resolve(require('path').join(__dirname,'..','src','bot','rpg','community'))];
const C2=require(require('path').join(__dirname,'..','src','bot','rpg','community'));
t('Antes do load, cache vazio', C2._groupCache.size===0, 'size='+C2._groupCache.size);
await C2.loadState();
t('Depois do loadState, recupera grupos', C2._groupCache.size===6, 'size='+C2._groupCache.size);
t('Recupera o JID da comunidade', C2.getCommunityJid()==='comm1@g.us', C2.getCommunityJid());

console.log('\n▸ C. addglb — o bug do "aldeia"');
const addd=[];
const sockAdd={groupParticipantsUpdate:async(g,p,a)=>{addd.push(p[0]);return [{status:'200',jid:p[0]}];},sendMessage:async()=>{}};
const R=await C2.addAllUsersToMainGroup(sockAdd,OWNER);
t('Encontra grupo principal (antes falhava sempre)', !!R.group, R.group);
t('Adiciona os 2 utilizadores', R.added.length===2, 'added='+R.added.length+' inv='+R.invited.length+' err='+R.errors.length);

console.log('\n▸ D. WhatsApp recusa o add (status 403) → manda convite?');
const invs=[];
const sock403={groupParticipantsUpdate:async()=>[{status:'403'}],sendMessage:async(j,c)=>{invs.push(j);}};
const R2=await C2.addAllUsersToMainGroup(sock403,OWNER);
t('Não mente a dizer "adicionado"', R2.added.length===0, 'added='+R2.added.length);
t('Cai para convite por PV', R2.invited.length===2, 'invited='+R2.invited.length);

console.log('\n▸ E. Erros reais chegam ao dono?');
const sockErr={communityCreate:async()=>{throw new Error('rate-overlimit')},communityFetchAllParticipating:async()=>({})};
const e1=await C.createWhatsAppCommunity(sockErr,OWNER);
t('Reporta o motivo real', !e1.ok && /rate-overlimit/.test(e1.error), e1.error);
const sockNull={communityCreateGroup:async()=>null,groupUpdateDescription:async()=>{},groupParticipantsUpdate:async()=>[]};
const e2=await C.createGroupInCommunity(sockNull,'arena',OWNER,'comm1@g.us');
t('Grupo null não rebenta e diz porquê', !e2.ok && /ID do grupo/.test(e2.error), e2.error);

console.log('\n▸ F. Baileys sem suporte a comunidades');
const e3=await C.createWhatsAppCommunity({},OWNER);
t('Avisa em vez de crashar', !e3.ok && /nao suporta/.test(e3.error), e3.error);

console.log(`\n  ${ok} OK / ${fail} FALHOU\n`);
process.exit(fail?1:0);
})();
