'use strict';
/**
 * v12.9.41 — IDENTIDADE VERIFICADA VIVA
 *
 * • ETIQUETA EM GRUPOS: o nome do perfil do bot passa a levar o símbolo
 *   verificado (✓) — é a etiqueta que aparece acima das mensagens dele
 *   nas conversas de grupo (updateProfileName, idempotente).
 * • MENSAGEM DE STATUS (About): a 1ª vez que liga, o bot escreve na
 *   "mensagem de status" (About/perfil) o nome dele + o nome do Dono,
 *   ambos com ✓ (updateProfileStatus). Fica gravada uma flag — o Dono
 *   que mude depois com .setbio (nunca se sobrepõe ao Dono).
 */
const CONFIG = require('../config');

function comVerificado(nome) {
  const n = String(nome || '').trim();
  if (!n) return n;
  return /[✓✔✅]\s*$/.test(n) ? n : n + ' ✓';
}

/** Aplica a etiqueta verificada ao perfil do bot (chamado no connection 'open'). */
async function aplicar(sock) {
  const atual = String(sock.user?.name || sock.user?.verifiedName || '').trim();
  // preserva o nome que o perfil JÁ tem (só acrescenta o ✓ em falta);
  // se o perfil estiver sem nome, usa o do config
  const nome = comVerificado(atual || (CONFIG.bot?.name || ''));
  if (nome && nome !== atual) {
    await sock.updateProfileName(nome);
  }
  return nome;
}

/** Mensagem de status (About) com o nome do dono verificado — 1× (flag na BD). */
async function aplicarBioUmaVez(sock) {
  try {
    const cache = require('./botConfigCache');
    if (await cache.get('selo_bio_feito', false)) return false;   // Dono manda: .setbio vence
    const selo = await require('./identidadeCanal').selo();
    const dono = CONFIG.owner?.name || selo.nome;
    const linhas = [
      `${comVerificado(CONFIG.bot?.name || selo.nome)}`,
      `👑 Dono: ${comVerificado(dono)}`,
      `🤖 Bot WhatsApp oficial — usa o menu para começar`,
    ];
    await sock.updateProfileStatus(linhas.join('\n'));
    await cache.set('selo_bio_feito', true);
    return true;
  } catch { return false; }
}

module.exports = { comVerificado, aplicar, aplicarBioUmaVez };
