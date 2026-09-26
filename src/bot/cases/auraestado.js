/**
 * v12.9.9 — .auraestado 🔍 diagnóstico da AURA (dono)
 * Porque é que ela fala ou cala: chaves de IA, último erro do motor,
 * modo do chat, saturação e como despertar.
 */
'use strict';

module.exports = function registerAuraEstado(registerCase) {
  registerCase(['auraestado', 'estadoaura', 'auradiag'], async ({ sock, msg, ctx, prefix, isOwner, reply }) => {
    if (!isOwner) return reply('👑 Só o dono vê o diagnóstico da Aura.');
    const L = [];
    const cfg = require('../../config');
    const ai = cfg.ai || {};
    const chaves = [
      ['GROQ_API_KEY', ai.groqApiKey], ['GEMINI_API_KEY', ai.geminiApiKey],
      ['OPENROUTER_API_KEY', ai.openrouterApiKey], ['OPENAI_API_KEY', ai.openaiApiKey],
      ['HUGGINGFACE_KEY', ai.huggingfaceKey], ['CEREBRAS_API_KEY', ai.cerebrasApiKey],
      ['APIFREELLM_KEY', ai.apifreellmKey], ['DEEPSEEK_API_KEY', ai.deepseekApiKey],
    ];
    const com = chaves.filter(([, v]) => v && String(v).length > 8);
    L.push('🧠 *MOTOR DE IA*');
    if (com.length) com.forEach(([k]) => L.push(`  ✅ ${k}`));
    else {
      L.push('  ❌ NENHUMA chave de IA configurada!');
      L.push('  > Sem chave a Aura fica em modo offline (frases genéricas) ou cala.');
      L.push('  > Cura: adiciona no Northflank/.env → *GROQ_API_KEY* (grátis em console.groq.com)');
    }
    try {
      const erro = require('../../aura/auraHuman').ultimoErroIA();
      if (erro?.ts) {
        L.push('', `⚠️ *Último erro do motor:* ${erro.motivo}`);
        L.push(`   (${Math.max(1, Math.round((Date.now() - erro.ts) / 60000))} min atrás)`);
      }
    } catch {}
    try {
      const modes = require('../../aura/auraModes');
      const acordada = await modes.isAuraAwake(ctx.remoteJid, { isGroup: ctx.isGroup });
      L.push('', ctx.isGroup ? '👥 *ESTE GRUPO*' : '💬 *ESTE PV*');
      L.push(`  ${acordada ? '🟢 Aura acordada' : '🔴 Aura a dormir'}`);
      if (!acordada) L.push('  > Acorda com: *aura acorda aqui*');
    } catch {}
    try {
      const M = require('../../aura/auraBrain').modos(ctx.remoteJid);
      const especiais = [];
      if (M.semReagir) especiais.push('sem reagir');
      if (M.silencio) especiais.push('silêncio total');
      if (M.soDono) especiais.push('só dono');
      if (especiais.length) L.push(`  ⚠️ Modos activos: ${especiais.join(', ')} — desliga no *${prefix}aurahub*`);
    } catch {}
    if (ctx.isGroup) {
      try {
        const bcc = require('../botConfigCache');
        const v = await bcc.get('ai_auto_enabled', null);
        L.push('', `🤖 Auto-IA de grupos: ${v === true || v === 'true' || v === 'on' ? '🟢 ON' : '🔴 OFF (só fala acordada/mencionada)'}`);
      } catch {}
    }
    L.push('', '> Dica: *aura acorda aqui* · *aura dorme* · menu completo em ' + prefix + 'aurahub');
    return reply(L.join('\n'));
  });
};
