'use strict';
/**
 * v12.9.45 — PERFIL WHATSAPP DO BOT (só Dono)
 *
 * O ✓ é uma etiqueta visual no nome do perfil; NÃO é o selo oficial da Meta.
 *
 *  .perfilbot / .certificado     → painel e explicação da etiqueta
 *  .nomebot <nome>               → troca nome do perfil e aplica ✓
 *  .fotobot                      → responde a uma foto, ou envia foto com esta legenda
 *  .biobot <texto>               → troca a descrição/About (alias: setbio)
 *  .removerfotobot               → remove a foto, quando suportado pelo socket Baileys
 */

function soDono(isOwner, reply) {
  if (isOwner) return true;
  // Mantém o mesmo padrão dos outros comandos de identidade: resposta clara,
  // sem executar qualquer alteração do perfil.
  reply('👑 Só o *Dono* pode alterar o perfil WhatsApp do bot.');
  return false;
}

function imagemDaMensagem(msg) {
  const conteudo = msg?.message || {};
  // Imagem enviada com a legenda ".fotobot"
  if (conteudo.imageMessage) return conteudo.imageMessage;

  // Imagem citada ao mandar ".fotobot"
  const info = conteudo.extendedTextMessage?.contextInfo ||
    conteudo.imageMessage?.contextInfo ||
    conteudo.videoMessage?.contextInfo || {};
  return info.quotedMessage?.imageMessage || null;
}

async function descarregarImagem(img) {
  const { downloadContentFromMessage } = require('baileys');
  const partes = [];
  for await (const parte of downloadContentFromMessage(img, 'image')) partes.push(parte);
  return Buffer.concat(partes);
}

module.exports = function registerPerfilWhatsApp(registerCase) {
  registerCase(['perfilbot', 'waperfil', 'certificado', 'certificadobot'], async ({ sock, msg, ctx, isOwner, reply, prefix }) => {
    if (!soDono(isOwner, reply)) return;
    const nome = String(sock.user?.name || sock.user?.verifiedName || '—').trim();
    const p = prefix || ctx?.prefix || '.';
    return reply([
      '🪪 *PERFIL WHATSAPP DO BOT*',
      '',
      '👤 nome actual: *' + nome + '*',
      '✓ etiqueta visual: *activa*',
      '',
      '⚠️ O ✓ no nome é uma *etiqueta visual*. Não é, e não tenta imitar, o selo oficial/conta empresarial verificada da Meta.',
      '',
      '*Alterar o perfil:*',
      '• `' + p + 'nomebot <novo nome>` — muda o nome e mantém ✓',
      '• responde a uma foto com `' + p + 'fotobot` — muda a foto',
      '• ou envia uma foto com a legenda `' + p + 'fotobot`',
      '• `' + p + 'biobot <texto>` — muda a descrição/About',
      '• `' + p + 'removerfotobot` — tira a foto actual',
    ].join('\n'));
  });

  registerCase(['nomebot', 'setnomebot', 'mudarnomebot'], async ({ sock, msg, ctx, args, isOwner, reply }) => {
    if (!soDono(isOwner, reply)) return;
    const cru = args.join(' ').replace(/\s+/g, ' ').trim();
    if (!cru) return reply('Uso: `' + (ctx?.prefix || '.') + 'nomebot <novo nome>`\n\nEx.: `.nomebot DARK NET`');
    if (cru.length < 2 || cru.length > 25) return reply('❌ O nome deve ter entre *2 e 25 caracteres* (limite do WhatsApp).');

    const { comVerificado } = require('../identidadeViva');
    const nome = comVerificado(cru);
    try {
      await sock.updateProfileName(nome);
      // Actualiza a sessão em memória para o painel responder já com o nome novo.
      if (sock.user) sock.user.name = nome;
      return reply('✅ *NOME DO PERFIL ACTUALIZADO*\n\n👤 ' + nome + '\n\n> O ✓ é uma etiqueta visual; não é selo oficial da Meta.');
    } catch (e) {
      return reply('❌ Não consegui alterar o nome: ' + String(e?.message || e).slice(0, 120));
    }
  });

  registerCase(['fotobot', 'setfotobot', 'perfilfoto'], async ({ sock, msg, ctx, isOwner, reply }) => {
    if (!soDono(isOwner, reply)) return;
    const imagem = imagemDaMensagem(msg);
    if (!imagem) {
      return reply('📷 Responde a uma *FOTO* com `' + (ctx?.prefix || '.') + 'fotobot`\n\nou envia a foto com essa legenda para eu usar como foto de perfil.');
    }
    try {
      const buffer = await descarregarImagem(imagem);
      if (!buffer?.length || buffer.length < 100) return reply('❌ Não consegui ler essa imagem. Tenta enviar a foto novamente.');
      if (buffer.length > 15 * 1024 * 1024) return reply('❌ A imagem tem mais de 15 MB. Envia uma foto menor para o WhatsApp aceitar.');
      await sock.updateProfilePicture(sock.user.id, buffer);
      return reply('✅ *FOTO DO PERFIL ACTUALIZADA* 📷');
    } catch (e) {
      return reply('❌ Não consegui alterar a foto: ' + String(e?.message || e).slice(0, 120));
    }
  });

  registerCase(['biobot', 'sobremimbot', 'aboutbot'], async ({ sock, msg, ctx, args, isOwner, reply }) => {
    if (!soDono(isOwner, reply)) return;
    const texto = args.join(' ').trim();
    if (!texto) return reply('Uso: `' + (ctx?.prefix || '.') + 'biobot <descrição>`\n\nEx.: `.biobot Atendimento todos os dias`');
    if (texto.length > 139) return reply('❌ A descrição do WhatsApp aceita no máximo *139 caracteres*.');
    try {
      await sock.updateProfileStatus(texto);
      return reply('✅ *DESCRIÇÃO DO PERFIL ACTUALIZADA*\n\n' + texto);
    } catch (e) {
      return reply('❌ Não consegui alterar a descrição: ' + String(e?.message || e).slice(0, 120));
    }
  });

  registerCase(['removerfotobot', 'apagarfotobot', 'delfotobot'], async ({ sock, ctx, isOwner, reply }) => {
    if (!soDono(isOwner, reply)) return;
    if (typeof sock.removeProfilePicture !== 'function') {
      return reply('⚠️ Esta sessão WhatsApp não disponibiliza a remoção da foto. Podes trocá-la com `' + (ctx?.prefix || '.') + 'fotobot`.');
    }
    try {
      await sock.removeProfilePicture(sock.user.id);
      return reply('✅ *FOTO DO PERFIL REMOVIDA*.');
    } catch (e) {
      return reply('❌ Não consegui remover a foto: ' + String(e?.message || e).slice(0, 120));
    }
  });
};

module.exports._internals = { imagemDaMensagem, descarregarImagem };
