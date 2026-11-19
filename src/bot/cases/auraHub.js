/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║  DARK BOT v9.5 — !aurahub ⚡                                  ║
 * ║  A Central da Aura em BOTÕES: o dono vê o estado actual e     ║
 * ║  liga/desliga toca-a-toco (voz, proativa, humor, presença).   ║
 * ║  Cada botão executa o comando real do !auraset — uma única    ║
 * ║  capa bonita por cima da central prudente.                    ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */
'use strict';

const HUMORES = ['normal', 'feliz', 'animada', 'provocante', 'cansada', 'sonolenta', 'triste', 'com_raiva', 'revoltada'];
const NIVEIS = ['calma', 'normal', 'viva'];

function _proximo(lista, atual) {
  const i = lista.indexOf(atual);
  return lista[(i + 1) % lista.length] || lista[0] || '';
}

module.exports = function registerAuraHub(registerCase) {
  registerCase(['aurahub', 'auractrl', 'controlaura'], async ({ sock, msg, ctx, prefix, isOwner, reply }) => {
    if (!isOwner) return reply('🚫 O hub da Aura é só para o *dono* (`!auraset` para ver o estado).');

    const config = require('../../config');
    const bcc = require('../botConfigCache');
    const brain = require('../../aura/auraBrain');
    const hum = require('../../aura/auraHuman');
    const modes = require('../../aura/auraModes');

    // estado actual (tudo tolerante a falhas — hub nunca rebenta)
    const M = brain.modos(ctx.remoteJid);
    const vozOn = M.soAudio === true;
    const proaOn = await bcc.get('aura_proactive_enabled', true).catch(() => true);
    const proaNivel = await bcc.get('aura_proactive_nivel', 'viva').catch(() => 'viva');
    const humor = hum.getMood().mood || 'normal';
    const acordou = await modes.isAuraAwake(ctx.remoteJid, { isGroup: ctx.isGroup }).catch(() => true);
    const hasGroq = !!config.ai?.groq, hasGemini = !!config.ai?.gemini;

    const corpo = [
      '⚡ *HUB DA AURA* — toca e muda',
      '',
      `🧠 IA: ${hasGroq ? '✅ Groq' : '❌ Groq'} · ${hasGemini ? '✅ Gemini' : '❌ Gemini'}`,
      `🔊 Voz: *${vozOn ? 'áudio' : 'texto'}*`,
      `💭 Proativa: *${proaOn ? proaNivel : 'desligada'}*`,
      `😌 Humor: *${humor}*`,
      `📍 Aqui: *${acordou ? 'acordada 🌹' : 'a dormir 🌙'}*`,
      '',
      '> Os botões correm os mesmos comandos do `!auraset` —',
      '> escreves à mão: `!auraset <voz|proativa|humor|acorda|dorme>`',
    ].join('\n');

    // botões com o estado ACTUAL embutido: cada toque executa o oposto/próximo
    const botoes = [
      { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: vozOn ? '🔇 Voz: OFF' : '🎙️ Voz: ON', id: `${prefix}auraset voz ${vozOn ? 'off' : 'on'}` }) },
      { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: proaOn ? '💭 Desligar proativa' : '💭 Ligar proativa', id: `${prefix}auraset proativa ${proaOn ? 'off' : 'on'}` }) },
      { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: `⚡ Nível → ${_proximo(NIVEIS, proaNivel)}`, id: `${prefix}auraset proativa ${_proximo(NIVEIS, proaNivel)}` }) },
      { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: `😌 Humor → ${_proximo(HUMORES, humor)}`, id: `${prefix}auraset humor ${_proximo(HUMORES, humor)}` }) },
      { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: acordou ? '🌙 Dorme aqui' : '🌹 Acorda aqui', id: `${prefix}auraset ${acordou ? 'dorme' : 'acorda'}` }) },
    ];

    try {
      const { generateWAMessageFromContent, proto } = require('baileys-v6');
      const m = generateWAMessageFromContent(ctx.remoteJid, {
        interactiveMessage: proto.Message.InteractiveMessage.fromObject({
          body: { text: corpo },
          footer: { text: `${config.bot.name} · só o dono 🕸️` },
          header: { title: '', hasMediaAttachment: false },
          nativeFlowMessage: { buttons: botoes },
        }),
      }, { userJid: sock.user?.id, quoted: msg });
      await sock.relayMessage(ctx.remoteJid, m.message, {
        messageId: m.key.id,
        additionalNodes: [{ tag: 'biz', attrs: {}, content: [{
          tag: 'interactive', attrs: { type: 'native_flow', v: '1' },
          content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }],
        }] }],
      });
      return true;
    } catch (_) {}

    return reply(`${corpo}\n\n${HUMORES.join(' · ')}`);
  });
};
