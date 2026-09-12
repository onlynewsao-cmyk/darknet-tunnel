'use strict';
/**
 * AURA GRUPO — promote/demote a sério.
 *
 * O Dark dizia "me adiciona com ADM" e a Aura respondia "já te
 * adicionei" sem chamar o WhatsApp, ou inventava que "só o dono
 * do grupo pode". Mentira. Um admin do WhatsApp PODE promover.
 * Aqui executa-se `groupParticipantsUpdate` e só se diz que
 * fez se o WhatsApp aceitou.
 */

function norm(s) {
  return String(s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ').trim();
}

function baseId(jid) {
  return String(jid || '').split(':')[0].split('@')[0];
}

function soDigitos(s) {
  return String(s || '').replace(/\D/g, '');
}

function idsIguais(a, b) {
  if (!a || !b) return false;
  const ra = baseId(a);
  const rb = baseId(b);
  if (ra && rb && ra === rb) return true;
  const da = soDigitos(ra);
  const db = soDigitos(rb);
  return !!(da && db && da.length >= 8 && da === db);
}

function botIds(sock) {
  const id = sock?.user?.id || '';
  const lid = sock?.user?.lid || '';
  return {
    num: baseId(id),
    lid: baseId(lid),
    jid: id,
  };
}

function acharNoGrupo(meta, hints) {
  const parts = meta?.participants || [];
  const lista = (Array.isArray(hints) ? hints : [hints]).filter(Boolean);
  for (const p of parts) {
    const candidatos = [p.id, p.jid, p.phoneNumber, p.lid];
    for (const c of candidatos) {
      for (const h of lista) {
        if (idsIguais(c, h)) return p;
      }
    }
  }
  return null;
}

function botEhAdmin(sock, meta) {
  const b = botIds(sock);
  const p = acharNoGrupo(meta, [b.num, b.lid, b.jid]);
  return !!(p && (p.admin === 'admin' || p.admin === 'superadmin'));
}

function participanteEhAdmin(p) {
  return !!(p && (p.admin === 'admin' || p.admin === 'superadmin'));
}

function jidDoSender(ctx) {
  return ctx.senderJid
    || (ctx.senderNumber ? ctx.senderNumber + '@s.whatsapp.net' : '')
    || '';
}

function hintsDoSender(ctx) {
  return [
    ctx.senderJid,
    ctx.senderNumber,
    ctx.senderLid,
    ctx.senderLid ? ctx.senderLid + '@lid' : '',
    ctx.senderNumber ? ctx.senderNumber + '@s.whatsapp.net' : '',
  ].filter(Boolean);
}

function mencoes(msg) {
  const m = msg?.message || {};
  return m.extendedTextMessage?.contextInfo?.mentionedJid
    || m.imageMessage?.contextInfo?.mentionedJid
    || m.videoMessage?.contextInfo?.mentionedJid
    || m.interactiveResponseMessage?.contextInfo?.mentionedJid
    || [];
}

// Pedido claro de virar / dar admin
const RE_PROMOTE = new RegExp(
  '\\b(' +
    'me\\s+(adiciona|adiciona-?me|poe|poem|mete|faz|da|promove)\\b.{0,28}\\b(adm|admin)|' +
    '(adiciona|poe|poem|mete|faz|promove)[- ]?me\\b.{0,20}\\b(adm|admin)|' +
    'adiciona.{0,24}\\bcom\\s+(adm|admin)|' +
    '(quero|queria)\\s+ser\\s+(adm|admin)|' +
    'me\\s+(faz|torna|poe|poem)\\s+(de\\s+)?(adm|admin)|' +
    '(da|da-?me|me\\s+da)\\s+(o\\s+)?(adm|admin)|' +
    'torna[- ]?me\\s+(adm|admin)|' +
    'promove[- ]?me|' +
    'promove(r)?\\b|' +
    'da\\s+admin|' +
    'torna\\s+admin|' +
    'poe\\s+como\\s+admin|' +
    'agora\\s+(me\\s+)?(adiciona|promove)' +
  ')\\b',
  'i'
);

const RE_DEMOTE = /\b(despromove|rebaixa|tira (o |de )?admin|remove (o )?admin|tira (o )?adm)\b/i;

// Depois de ela não ser admin: o Dark insiste / confirma que ela já é
const RE_INSISTE = /\b(podes sim|podes fazer|o que passa|agora tens|ja tens|agora estas|agora adiciona|agora promove|entao (faz|adiciona|promove)|faz isso|vai la|vai entao)\b/i;

const _pendentes = new Map(); // jid -> { acao, alvoHint, ts }
const PENDENTE_TTL = 15 * 60 * 1000;

function marcarPendente(jid, acao, alvoHint) {
  if (!jid) return;
  _pendentes.set(jid, { acao, alvoHint, ts: Date.now() });
}

function verPendente(jid) {
  const p = _pendentes.get(jid);
  if (!p) return null;
  if (Date.now() - p.ts > PENDENTE_TTL) {
    _pendentes.delete(jid);
    return null;
  }
  return p;
}

function limparPendente(jid) {
  _pendentes.delete(jid);
}

function detectarPedidoGrupo(texto, { temPendente = false } = {}) {
  const t = norm(texto);
  if (!t || t.length > 280) return null;
  if (RE_DEMOTE.test(t)) return { acao: 'demote', deSi: /\b(me |mim)\b/.test(t) };
  if (RE_PROMOTE.test(t)) return { acao: 'promote', deSi: /\b(me |mim|quero ser|adiciona-?me|promove-?me)\b/.test(t) || !/@/.test(texto) };
  if (temPendente && RE_INSISTE.test(t)) return { acao: 'promote', deSi: true, viaPendente: true };
  return null;
}

function resolverAlvos(sock, meta, ctx, msg, pedido) {
  const mentioned = mencoes(msg);
  if (mentioned.length) {
    return mentioned.map(j => {
      const p = acharNoGrupo(meta, [j]);
      return p?.id || j;
    });
  }
  // Sem @ : é o próprio remetente (me adiciona / quero ser ADM)
  const p = acharNoGrupo(meta, hintsDoSender(ctx));
  if (p?.id) return [p.id];
  const j = jidDoSender(ctx);
  return j ? [j] : [];
}

function msgErroWhatsApp(err) {
  const e = String(err?.message || err || '');
  if (/not.?admin|forbidden|403|401|unauthorized/i.test(e)) {
    return 'Ainda não sou admin aqui. Promove-me e eu faço de verdade.';
  }
  if (/not.?in.?group|no.?participant|404/i.test(e)) {
    return 'Não te encontrei na lista do grupo. Marca com @.';
  }
  return 'O WhatsApp recusou: ' + e.slice(0, 120);
}

/**
 * Executa promote/demote. Nunca mente.
 * @returns {{ok:boolean, msg:string, mencionar?:string[], pendente?:boolean}}
 */
async function executarPedido(sock, { ctx, msg, texto, pedido }) {
  if (!ctx?.isGroup) {
    return { ok: false, msg: 'Isto só dá para fazer num grupo.' };
  }

  let meta = ctx.groupMeta;
  try { meta = await sock.groupMetadata(ctx.remoteJid); } catch {}
  if (!meta?.participants?.length) {
    return { ok: false, msg: 'Não consegui ler o grupo agora.' };
  }

  const acao = pedido.acao === 'demote' ? 'demote' : 'promote';
  const alvos = resolverAlvos(sock, meta, ctx, msg, pedido);
  if (!alvos.length) {
    return { ok: false, msg: 'Marca a pessoa com @, ou diz "me põe admin".' };
  }

  if (!botEhAdmin(sock, meta)) {
    marcarPendente(ctx.remoteJid, acao, alvos[0]);
    return {
      ok: false,
      pendente: true,
      msg: acao === 'promote'
        ? 'Ainda não sou admin deste grupo. Promove-me primeiro — quando tiver o poder, eu te ponho. Não vou fingir que já fiz.'
        : 'Ainda não sou admin. Promove-me e eu rebaixo.',
    };
  }

  const feitos = [];
  const jaEram = [];
  const falhas = [];

  for (const jid of alvos) {
    const p = acharNoGrupo(meta, [jid]);
    if (acao === 'promote' && participanteEhAdmin(p)) {
      jaEram.push(p.id || jid);
      continue;
    }
    if (acao === 'demote' && p && !participanteEhAdmin(p)) {
      jaEram.push(p.id || jid);
      continue;
    }
    try {
      await sock.groupParticipantsUpdate(ctx.remoteJid, [p?.id || jid], acao);
      feitos.push(p?.id || jid);
    } catch (e) {
      falhas.push(msgErroWhatsApp(e));
    }
  }

  if (feitos.length) {
    limparPendente(ctx.remoteJid);
    const tags = feitos.map(j => '@' + baseId(j)).join(' ');
    return {
      ok: true,
      mencionar: feitos,
      msg: acao === 'promote'
        ? `Pronto. ${tags} agora é admin. Feito no WhatsApp, não é conversa.`
        : `Pronto. ${tags} já não é admin.`,
    };
  }

  if (jaEram.length && !falhas.length) {
    limparPendente(ctx.remoteJid);
    return {
      ok: true,
      mencionar: jaEram,
      msg: acao === 'promote' ? 'Já és admin neste grupo.' : 'Essa pessoa já não é admin.',
    };
  }

  marcarPendente(ctx.remoteJid, acao, alvos[0]);
  return {
    ok: false,
    pendente: true,
    msg: falhas[0] || 'Não consegui alterar o cargo.',
  };
}

async function tentarPendente(sock, { ctx, msg, texto }) {
  const pend = verPendente(ctx.remoteJid);
  if (!pend) return null;
  const t = norm(texto);
  if (!RE_INSISTE.test(t) && !RE_PROMOTE.test(t)) return null;
  return executarPedido(sock, {
    ctx, msg, texto,
    pedido: { acao: pend.acao, deSi: true, viaPendente: true },
  });
}

module.exports = {
  norm,
  idsIguais,
  botEhAdmin,
  acharNoGrupo,
  detectarPedidoGrupo,
  executarPedido,
  tentarPendente,
  marcarPendente,
  verPendente,
  limparPendente,
  resolverAlvos,
  mencoes,
  RE_PROMOTE,
  RE_DEMOTE,
  RE_INSISTE,
};
