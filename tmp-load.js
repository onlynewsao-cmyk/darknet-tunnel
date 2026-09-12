const mods=['./src/bot/commandHandler','./src/bot/callHandler','./src/bot/whatsapp','./src/aura/auraHuman','./src/aura/auraActions','./src/bot/darkUtils','./src/bot/ai'];
for(const m of mods){
  try{ require(m); console.log('OK    '+m); }
  catch(e){ console.log('❌ REBENTA '+m+' → '+e.message.slice(0,120)); }
}
