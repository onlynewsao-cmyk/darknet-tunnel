/**
 * Assunto da conversa — o que SE ESTÁ a falar AGORA neste chat.
 * Serve para "o link DELE", "isso", "aquele grupo" não virarem invenção.
 */
'use strict';

const TTL = 45 * 60 * 1000;
const _chats = new Map(); // jid → { assunto, tipo, ultimo, falas: [] }

function _get(jid) {
  const k = String(jid || '');
  const s = _chats.get(k);
  if (!s) return null;
  if (Date.now() - s.ultimo > TTL) {
    _chats.delete(k);
    return null;
  }
  return s;
}

function ePronomeVago(texto) {
  const t = String(texto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return /\b(dele|dela|disso|disto|desse|desta|aquele|aquela|isso|isto|o mesmo|a mesma)\b/.test(t);
}

function extrairAssunto(texto, { groupName } = {}) {
  const t = String(texto || '').trim();
  if (!t || t.length < 2) return null;

  // "o grupo Arena" — só se vier um NOME, não "pra ti / agora"
  let m = t.match(/\b(?:o|este|esse|deste|desse)\s+grupo\s+(?:chamad[oa]\s+)?["“]?([A-ZÁÉÍÓÚ0-9][^"”\n,]{1,50})["”]?/i);
  if (m) {
    const nome = m[1].trim();
    if (!/^(pra|para|por|agora|aqui|la|lá|ti|mim|favor|pf)\b/i.test(nome)) {
      return { assunto: nome, tipo: 'grupo' };
    }
  }

  if (/\b(este|esse|deste|desse|aqui|o)\s+grupo\b/i.test(t) && groupName) {
    return { assunto: groupName, tipo: 'grupo_aqui' };
  }

  m = t.match(/\b(?:m[uú]sica|som|faixa|m[uú]sica)\s+(?:do |da |de )?["“]?([^"”\n?]{2,50})["”]?/i);
  if (m) return { assunto: m[1].trim(), tipo: 'musica' };

  m = t.match(/\b(?:sobre|acerca de|falando de|a falar de|do assunto)\s+["“]?([^"”\n?]{2,60})["”]?/i);
  if (m) return { assunto: m[1].trim(), tipo: 'tema' };

  // nome próprio isolado depois de "o/a"
  m = t.match(/\b(?:o|a)\s+([A-ZÁÉÍÓÚÂÊÔ][\wÁÉÍÓÚÂÊÔáéíóúâêô]{2,24})\b/);
  if (m && !/^(Dark|Aura|Grupo|Link)$/i.test(m[1])) {
    return { assunto: m[1], tipo: 'nome' };
  }

  return null;
}

function actualizar(jid, texto, meta = {}) {
  const k = String(jid || '');
  if (!k) return;
  const now = Date.now();
  const cur = _get(k) || { assunto: '', tipo: '', ultimo: now, falas: [] };
  cur.falas.push(String(texto || '').slice(0, 160));
  cur.falas = cur.falas.slice(-8);
  const novo = extrairAssunto(texto, meta);
  if (novo) {
    cur.assunto = novo.assunto;
    cur.tipo = novo.tipo;
  } else if (!cur.assunto && meta.groupName && /\bgrupo\b/i.test(texto || '')) {
    cur.assunto = meta.groupName;
    cur.tipo = 'grupo_aqui';
  }
  cur.ultimo = now;
  _chats.set(k, cur);
  return cur;
}

function ler(jid) {
  return _get(jid);
}

/** Troca "dele/disso" pelo assunto actual, se houver. */
function resolver(texto, jid, { groupName } = {}) {
  const orig = String(texto || '');
  const s = _get(jid);
  if (!ePronomeVago(orig)) return orig;
  const alvo = s?.assunto || (groupName && /\b(grupo|dele|daqui)\b/i.test(orig) ? groupName : '');
  if (!alvo) return orig;
  return orig.replace(
    /\b(dele|dela|disso|disto|desse|desta|aquele|aquela|isso|isto)\b/gi,
    alvo
  );
}

function paraPrompt(jid, { groupName } = {}) {
  const s = _get(jid);
  const linhas = [];
  if (s?.assunto) {
    linhas.push(`ASSUNTO DESTA CONVERSA (não inventes outro): ${s.assunto}` + (s.tipo ? ` [${s.tipo}]` : ''));
  } else if (groupName) {
    linhas.push(`Estão no grupo WhatsApp "${groupName}". Se falarem em "o grupo" / "o link dele" SEM outro assunto, é ESTE grupo.`);
  }
  if (s?.falas?.length) {
    linhas.push('Últimas falas:\n- ' + s.falas.slice(-5).join('\n- '));
  }
  linhas.push('Se não souberes do que se trata, PERGUNTA. Não inventes eventos, sítios nem links.');
  return linhas.join('\n');
}

module.exports = { actualizar, ler, resolver, paraPrompt, ePronomeVago, extrairAssunto };
