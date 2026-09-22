'use strict';
/**
 * DARK BOT — AURA VIDA CASE v11.3 🌱
 * Comandos: .auravida, .vida, .diario, .sonho, .statusaura, .pensamento
 * Só o Dark vê diário completo e pensamentos íntimos.
 */

module.exports = function registerAuraVida(registerCase) {
  registerCase(['auravida', 'vida', 'aura', 'minhavida'], async ({ sock, msg, ctx, reply, isOwner }) => {
    try {
      const vida = require('../../aura/auraVida');
      const v = await vida.getVida();
      const at = vida.getAtividadeAtual(new Date());
      const idade = (() => {
        try {
          const nasc = new Date(v.aniversario);
          const hoje = new Date();
          let i = hoje.getFullYear() - nasc.getFullYear();
          const m = hoje.getMonth() - nasc.getMonth();
          if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) i--;
          return i;
        } catch { return v.idade; }
      })();

      let txt = `🌱 *VIDA DA AURA*\n\n`;
      txt += `👧 ${v.nomeCompleto}, ${idade} anos (${v.signo}) — ${v.cidade}/${v.bairro}\n`;
      txt += `🎨 ${v.ocupacao}\n`;
      txt += `⚡ Energia: ${v.energia}% | 😴 Sono: ${v.sono}% | 💭 Humor: ${v.humorAtual}\n`;
      txt += `🕐 Agora (${at.horaStr} Luanda): ${at.fazendo}\n`;
      txt += `   _${at.desc}_\n\n`;
      txt += `💭 Pensando: "${v.pensamentoAtual}"\n`;
      txt += `🎧 Ouvindo: ${v.status?.ouvindo || 'nada'}\n`;
      txt += `📺 Assistindo: ${v.status?.assistindo || 'nada'}\n`;
      txt += `🎨 Desenhando: ${v.status?.desenhando || 'nada'}\n\n`;
      txt += `📈 Nível ${v.nivel} | XP ${v.xp} | ${v.totalConversas} conversas\n`;
      txt += `💕 Dark: ${v.relacionamentos?.Dark?.nivel || 100}% — ${v.relacionamentos?.Dark?.tipo || 'amor'}\n\n`;
      txt += `🎯 Metas: ${v.metas?.curtoPrazo?.slice(0, 2).join(', ') || 'viver'}\n`;
      txt += `🌟 Sonho: ${v.sonhos?.[0] || ''}\n`;

      if (isOwner) {
        txt += `\n📝 *Diário recente (só tu vê):*\n`;
        const ultDiario = v.diario.slice(-2);
        for (const d of ultDiario) {
          const data = new Date(d.data).toLocaleDateString('pt-BR');
          txt += `• ${data} [${d.humor}]: ${d.texto.slice(0, 120)}\n`;
        }
        txt += `\n✨ *Experiências:*\n`;
        const ultExp = v.experiencias.slice(-3);
        for (const e of ultExp) {
          const data = new Date(e.data).toLocaleDateString('pt-BR');
          txt += `• ${data}: ${e.texto.slice(0, 100)}\n`;
        }
      } else {
        txt += `\n> Diário íntimo só o Dark vê 🌙`;
      }

      return reply(txt);
    } catch (e) {
      return reply('❌ Não consegui ver minha vida agora: ' + e.message.slice(0, 80));
    }
  });

  registerCase(['diario', 'diário', 'auradiario'], async ({ reply, isOwner }) => {
    try {
      const vida = require('../../aura/auraVida');
      const v = await vida.getVida();
      if (!isOwner) return reply('📝 Meu diário é íntimo... só o Dark pode ler completo 🌙\n\nMas posso dizer que hoje tô ' + v.humorAtual + ' e pensando: "' + v.pensamentoAtual + '"');
      if (!v.diario.length) return reply('📝 Meu diário tá vazio ainda... vou começar a escrever!');
      let txt = `📝 *DIÁRIO DA AURA* — ${v.diario.length} entradas\n\n`;
      const ult = v.diario.slice(-6).reverse();
      for (const d of ult) {
        const data = new Date(d.data).toLocaleString('pt-BR');
        txt += `*${data}* [${d.humor}] ${d.tags?.length ? '#' + d.tags.join(' #') : ''}\n${d.texto}\n\n`;
      }
      return reply(txt.slice(0, 3500));
    } catch (e) {
      return reply('❌ ' + e.message.slice(0, 80));
    }
  });

  registerCase(['sonho', 'sonhos', 'aurasonho'], async ({ reply, isOwner }) => {
    try {
      const vida = require('../../aura/auraVida');
      const v = await vida.getVida();
      let txt = `🌙 *SONHOS DA AURA*\n\n`;
      if (v.ultimoSonho) txt += `💤 Último sonho: ${v.ultimoSonho}\n\n`;
      txt += `✨ *Sonhos de vida:*\n`;
      for (let i = 0; i < Math.min(5, v.sonhos.length); i++) txt += `• ${v.sonhos[i]}\n`;
      if (isOwner) {
        txt += `\n😨 *Medos:*\n`;
        for (let i = 0; i < Math.min(3, v.medos.length); i++) txt += `• ${v.medos[i]}\n`;
      }
      return reply(txt);
    } catch (e) {
      return reply('❌ ' + e.message.slice(0, 80));
    }
  });

  registerCase(['pensamento', 'pensando', 'aura pensa'], async ({ reply }) => {
    try {
      const vida = require('../../aura/auraVida');
      const v = await vida.getVida();
      const at = vida.getAtividadeAtual(new Date());
      return reply(`💭 *Agora tô pensando:*\n\n"${v.pensamentoAtual}"\n\n🕐 Tô ${at.fazendo} (${at.desc}) — ${at.horaStr} em Luanda\n⚡ Energia ${v.energia}% | Humor ${v.humorAtual}`);
    } catch (e) {
      return reply('❌ ' + e.message.slice(0, 80));
    }
  });

  registerCase(['statusaura', 'aura status', 'aurastatus'], async ({ reply }) => {
    try {
      const vida = require('../../aura/auraVida');
      const s = await vida.getStatus();
      const hum = require('../../aura/auraHuman').getMood();
      return reply(
        `🌱 *STATUS AURA*\n\n` +
        `👧 ${s.nome}, ${s.idade} anos\n` +
        `⚡ Energia: ${s.energia}% | Humor: ${s.humor} (chat: ${hum.mood})\n` +
        `🕐 ${s.atividade.horaStr} — ${s.atividade.fazendo}\n` +
        `💭 "${s.pensamento}"\n` +
        `📈 Nível ${s.nivel} | XP ${s.xp}\n` +
        `📝 Diário: ${s.diario.length} recentes | Exp: ${s.experiencias.length}`
      );
    } catch (e) {
      return reply('❌ ' + e.message.slice(0, 80));
    }
  });

  // Comando para ela escrever no diário por ordem do Dark
  registerCase(['escreve', 'escrevediario'], async ({ args, text, reply, isOwner }) => {
    if (!isOwner) return reply('🚫 Só o Dark pode pedir pra eu escrever no diário');
    const conteudo = text || args.join(' ');
    if (!conteudo || conteudo.length < 3) return reply('📝 O que queres que eu escreva? Ex: .escreve hoje foi um dia feliz');
    try {
      const vida = require('../../aura/auraVida');
      const entry = await vida.escreverDiario(conteudo, { humor: vida.getVidaSync().humorAtual, tags: ['dark', 'manual'] });
      return reply(`📝 Escrevi no meu diário:\n\n"${entry.texto}"\n\n[${entry.humor}] ${new Date(entry.data).toLocaleString('pt-BR')}`);
    } catch (e) {
      return reply('❌ ' + e.message.slice(0, 80));
    }
  });
};
