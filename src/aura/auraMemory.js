/**
 * Memória: 90% do que importa fica; o resto some em 1 hora.
 */
'use strict';

const IMPORTANTE = /\b(chamo-?me|meu nome|gosto de|amo|odeio|mor[oa]|vivo em|anivers[aá]rio|lembra|nunca|sempre|trabalho|fam[ií]lia|namorad|filho|filha|idade|tenho \d+|conta|iban|senha|endere[cç]o|telefone|email|morada|apelido)\b/i;

// v7.8 — mídia com legenda relevante também é importante
const MIDIA_IMPORTANTE = /^(?:\[FOTO\]|\[DOC\]|\[LINK\]|\[ÁUDIO\]).{15,}/i;

const _leve = new Map(); // key → { itens: [{t, ts}], expira }
const HORA = 60 * 60 * 1000;

function eImportante(texto) {
  const t = String(texto || '');
  if (t.length > 120) return true;
  return IMPORTANTE.test(t) || MIDIA_IMPORTANTE.test(t);
}

function _k(num) { return String(num || '').replace(/\D/g, ''); }

async function guardar(numero, texto, { importante } = {}) {
  const num = _k(numero);
  const t = String(texto || '').slice(0, 280);
  if (!num || t.length < 4) return;
  const imp = importante != null ? importante : eImportante(t);

  if (imp) {
    try {
      const BotConfig = require('../database/models/BotConfig');
      const key = 'aura_facts_' + num;
      const cur = await BotConfig.findOne({ key }).lean().catch(() => null);
      const arr = Array.isArray(cur?.value) ? cur.value : [];
      arr.push({ t, ts: Date.now() });
      const keep = arr.slice(-40);
      await BotConfig.updateOne({ key }, { $set: { key, value: keep } }, { upsert: true });
    } catch {}
    return;
  }

  const now = Date.now();
  const slot = _leve.get(num) || { itens: [], expira: now + HORA };
  slot.itens = (slot.itens || []).filter(x => now - x.ts < HORA);
  slot.itens.push({ t, ts: now });
  slot.itens = slot.itens.slice(-12);
  slot.expira = now + HORA;
  _leve.set(num, slot);
}

async function lembrar(numero) {
  const num = _k(numero);
  const out = { importante: [], recente: [] };
  try {
    const BotConfig = require('../database/models/BotConfig');
    const doc = await BotConfig.findOne({ key: 'aura_facts_' + num }).lean();
    if (Array.isArray(doc?.value)) out.importante = doc.value.slice(-12).map(x => x.t);
  } catch {}
  const slot = _leve.get(num);
  const now = Date.now();
  if (slot) {
    out.recente = (slot.itens || []).filter(x => now - x.ts < HORA).map(x => x.t);
  }
  return out;
}

function paraPrompt(mem) {
  if (!mem) return '';
  const a = (mem.importante || []).slice(-8);
  const b = (mem.recente || []).slice(-4);
  let s = '';
  if (a.length) s += 'FACTOS IMPORTANTES (guarda sempre):\n- ' + a.join('\n- ');
  if (b.length) s += (s ? '\n' : '') + 'Recente (pode esquecer daqui a 1h):\n- ' + b.join('\n- ');
  return s;
}

/**
 * v7.8 — guarda resumos do que a AURA viu/ouviu/leu (mídia).
 * Usa a mesma heurística: importante fica para sempre, resto some em 1h.
 */
async function guardarMedia(numero, resumo) {
  if (!resumo || String(resumo).length < 6) return;
  const imp = eImportante(resumo);
  return guardar(numero, resumo, { importante: imp });
}

module.exports = { eImportante, guardar, guardarMedia, lembrar, paraPrompt };
