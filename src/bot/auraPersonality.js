/**
 * AURA PERSONALITY - Compatibilidade
 * Este arquivo existe apenas para manter o commandHandler funcionando.
 * A lógica real está em src/aura/auraHuman.js
 */

const auraHuman = require('../aura/auraHuman');

module.exports = {
  // Re-exporta todas as funções do auraHuman
  isSilenced: auraHuman.isSilenced,
  setSilence: auraHuman.setSilence,
  clearSilence: auraHuman.clearSilence,
  respondAsHuman: auraHuman.respondAsHuman,
  recallPerson: auraHuman.recallPerson,
  rememberPerson: auraHuman.rememberPerson,
  detectCountry: auraHuman.detectCountry,
  getMood: auraHuman.getMood,
  setMood: auraHuman.setMood,
  clearMood: auraHuman.clearMood,
  limparMoods: auraHuman.limparMoods,
  detectDarkAttack: auraHuman.detectDarkAttack,
  detectDarkMention: auraHuman.detectDarkMention,
  getDarkDefense: auraHuman.getDarkDefense,
  buildAuraSystemPrompt: auraHuman.buildAuraSystemPrompt,
  auraRespond: auraHuman.auraRespond
};