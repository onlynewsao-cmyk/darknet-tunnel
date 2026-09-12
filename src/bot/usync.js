'use strict';
/**
 * USYNC — ler o recado/status de contactos (v7.9, Etapa 3).
 *
 * O WhatsApp não expõe o recado ("about") de um contacto no perfil
 * normal. A forma certa é uma USyncQuery com o protocolo `status`:
 *
 *     query.withStatusProtocol()
 *     resultado.list[i] → { id, status: string|null, setAt: Date }
 *
 *   - status === null  → a pessoa não tem recado (ou está oculto);
 *   - status === ''    → recado vazio;
 *   - status === texto → o recado.
 *
 * Referência no fork: lib/WAUSync/Protocols/USyncStatusProtocol.js e
 * lib/Socket/chats.js (`fetchStatus`). Aqui usa-se `executeUSyncQuery`
 * directamente para ter controlo do alvo (eu, quem perguntou, ou um
 * contacto mencionado).
 */

/** @returns {{USyncQuery:Function, USyncUser:Function}} */
function pegarClasses() {
  const raiz = require('@systemzero/baileys');
  if (raiz.USyncQuery && raiz.USyncUser) return raiz;
  // fallback para import directo do sub-módulo
  const q = require('@systemzero/baileys/lib/WAUSync/USyncQuery.js');
  const u = require('@systemzero/baileys/lib/WAUSync/USyncUser.js');
  return { USyncQuery: q.USyncQuery, USyncUser: u.USyncUser };
}

/** Alvo óbvio na mensagem: a primeira menção, senão nulo. */
function mencionado(msg) {
  const ci = msg?.message?.extendedTextMessage?.contextInfo;
  const list = ci?.mentionedJid || [];
  const eu = msg?.key?.remoteJid;
  // ignora a menção ao próprio bot, se for a única relevante
  return list[0] || null;
}

/**
 * Lê o recado/status de um contacto.
 * @param {object} sock socket Baileys (com executeUSyncQuery)
 * @param {object} c { ctx, msg, texto }
 * @returns {Promise<{ok:boolean, msg:string}>}
 */
async function lerStatus(sock, { ctx, msg, texto }) {
  const { USyncQuery, USyncUser } = pegarClasses();
  const emGrupo = !!ctx?.isGroup;
  const meuJid = sock?.user?.id || sock?.authState?.creds?.me?.id || null;

  // 1. alguém mencionado → o recado dessa pessoa
  const alvoMencionado = mencionado(msg);
  // 2. "teu/tua/seu" → o MEU recado; "meu/minha" → o de quem pergunta
  const t = String(texto || '');
  const falaDeMim = /\b(teu|tua|seu|tua)\b.{0,8}\b(recado|status|estado|bio)\b/.test(t) ||
                    /\b(recado|status|estado|bio)\b.{0,10}\b(teu|tua|seu)\b/.test(t);

  let alvo;
  let deQuem = 'dessa pessoa';
  // "status do/da/de <alguém>" sem menção → não dá para resolver o jid
  const pedeTerceiro = /(?:status|recado)\b.{0,20}\b(?:do|da|de)\b/i.test(t) && !falaDeMim;
  if (pedeTerceiro && !alvoMencionado) {
    return {
      ok: false,
      msg: 'Para eu ver o status de alguém, menciona a pessoa (@nome) na mensagem, ou diz o número com o código do país.',
    };
  }
  if (alvoMencionado) {
    alvo = alvoMencionado;
    deQuem = 'dessa pessoa';
  } else if (falaDeMim) {
    if (!meuJid) return { ok: false, msg: 'Ainda não sei qual é a minha conta. Tenta daqui a pouco.' };
    alvo = meuJid;
    deQuem = 'meu';
  } else {
    // por omissão: no PV leio o meu; no grupo leio o de quem perguntou
    if (emGrupo) {
      alvo = ctx?.senderJid || (ctx?.senderNumber ? `${ctx.senderNumber}@s.whatsapp.net` : null);
      deQuem = 'teu';
    } else {
      alvo = meuJid;
      deQuem = 'meu';
    }
    if (!alvo) return { ok: false, msg: 'Não consegui perceber de quem queres o status.' };
  }

  try {
    const query = new USyncQuery().withStatusProtocol();
    query.withUser(new USyncUser().withId(alvo));
    const res = await sock.executeUSyncQuery(query);
    const item = (res?.list || [])[0];
    if (!item) return { ok: true, msg: 'Não consegui ler o recado agora.' };

    if (item.status == null) {
      const semRecado = deQuem === 'meu'
        ? 'Eu não tenho recado definido.'
        : deQuem === 'teu'
          ? 'Tu não tens recado definido.'
          : 'Essa pessoa não tem recado definido.';
      return { ok: true, msg: semRecado };
    }
    if (item.status === '') {
      return { ok: true, msg: deQuem === 'meu' ? 'O meu recado está vazio.' : 'O recado está vazio.' };
    }
    const quando = item.setAt instanceof Date && !isNaN(item.setAt)
      ? `\n(definido em ${item.setAt.toLocaleDateString('pt-PT')})`
      : '';
    return { ok: true, msg: `Recado:${quando}\n\n${item.status}` };
  } catch (e) {
    return { ok: false, msg: `Não consegui ler o recado: ${String(e?.message || e).slice(0, 80)}` };
  }
}

module.exports = { lerStatus, pegarClasses };
