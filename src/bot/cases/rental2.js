/**
 * DARK BOT v7.67 — ALUGUEL SYSTEM-ZERO + menu18 PV
 * Planos com preços (Kz + R$), pedidos com Multicaixa/Pix, gate duro.
 */
'use strict';

const config = require('../../config');
const GroupSettings = require('../../database/models/GroupSettings');
const User = require('../../database/models/User');
const Payment = require('../../database/models/Payment');
const botConfigCache = require('../botConfigCache');
const { toMs } = require('../groupEntitlement');

// O campo hostedUntil vazio representa aluguel permanente legado. Mantemos
// essa compatibilidade em todos os cartões/renovações, sem aceitar datas
// inválidas como serviço activo.
function isPermanentHosted(gs) {
  return !!gs?.isHosted && (gs.hostedUntil == null || gs.hostedUntil === '');
}
function isHostedActive(gs, now = Date.now()) {
  return !!gs?.isHosted && (isPermanentHosted(gs) || toMs(gs.hostedUntil) > now);
}
function isTrialActive(gs, now = Date.now()) {
  return toMs(gs?.trialExpiresAt) > now;
}
function hostedDaysLeft(gs, now = Date.now()) {
  return isPermanentHosted(gs) ? null : Math.max(0, Math.ceil((toMs(gs?.hostedUntil) - now) / 86400000));
}

// v7.67: espelho em memória dos pedidos (o Mongo é a verdade; a memória
// cobre testes + janelas sem DB). reference → pedido.
const _pedidos = new Map();
function _pedidosTrim() {
  while (_pedidos.size > 500) _pedidos.delete(_pedidos.keys().next().value);
}

// v7.67: gate duro — em grupo sem aluguel/trial, SÓ o funil passa.
const GATE_ALLOW = new Set([
  'alugar', 'hospedar', 'rent',
  'trial', 'teste', 'experimentar',
  'planos', 'menuplanos', 'submenuplanos', 'plans',
  'statusalugar', 'rentstatus', 'meualuguel',
  'paguei', 'pagar', 'pedido', 'pedidos',
  'vip', 'assinar', 'premium', 'meuplano',
  'dono', 'ajuda', 'help',
]);
function gateAllows(text = '', prefix = '!') {
  try {
    const t0 = String(text || '').trim();
    const p0 = String(prefix || '!');
    const body = p0 && t0.startsWith(p0) ? t0.slice(p0.length) : t0;
    const cmd = body.trim().split(/\s+/)[0].replace(/^[^a-z0-9]+/i, '').toLowerCase();
    return GATE_ALLOW.has(cmd);
  } catch { return false; }
}

async function isSubDono(ctx, isOwner, localConfig) {
  if (isOwner) return true;
  try {
    const extraOwners = await botConfigCache.get('owner_numbers', []).catch(() => []);
    const ownerNums = [localConfig.owner.number, ...(Array.isArray(extraOwners) ? extraOwners : [])].map(n => String(n).replace(/\D/g, ''));
    return ownerNums.includes(String(ctx.senderNumber).replace(/\D/g, ''));
  } catch { return false; }
}

async function tReply(sock, msg, ctx, title, lines) {
  const RE = require('../renderEngine');
  const t = await RE.getTheme(ctx.remoteJid);
  return sock.sendMessage(ctx.remoteJid, { text: RE.renderBlock(t, title, lines, { botName: config.bot.name }) }, { quoted: msg });
}

// ── Planos de aluguel ──
// v7.67: preços editáveis pelo dono (!setpreco). Valores iniciais são
// PLACEHOLDERS — o dono deve ajustar à sua tabela.
const RENTAL_PLANS = [
  { id: 'trial', nome: '🆓 TRIAL', dias: 7, kz: 0, brl: 0, emoji: '🆓',
    desc: '7 dias grátis\n500 cmds/dia\nComandos básicos\nSem IA avançada', cmdsDay: 500 },
  { id: 'semanal', nome: '⭐ SEMANAL', dias: 7, kz: 1500, brl: 5, emoji: '⭐',
    desc: '7 dias\nComandos ilimitados\nDownloads HD\nIA com memória\nSuporte básico', cmdsDay: -1 },
  { id: 'mensal', nome: '💎 MENSAL', dias: 30, kz: 5000, brl: 15, emoji: '💎',
    desc: '30 dias\nTudo do semanal\n+Portal 18+\n+Comandos VIP\n+Badge premium', cmdsDay: -1 },
  { id: 'trimestral', nome: '🏆 TRIMESTRAL', dias: 90, kz: 12000, brl: 40, emoji: '🏆',
    desc: '90 dias\nTudo do mensal\n+Prioridade máxima\n+Suporte 24/7\n+Sem limites', cmdsDay: -1 },
  { id: 'anual', nome: '👑 ANUAL', dias: 365, kz: 40000, brl: 120, emoji: '👑',
    desc: '365 dias\nTudo ilimitado\n+Domínio total\n+API privada\n+Suporte dedicado', cmdsDay: -1 },
];

async function getPrices() {
  const over = await botConfigCache.get('rent_preco', {}).catch(() => ({}));
  const out = {};
  for (const pl of RENTAL_PLANS) {
    const o = (over && over[pl.id]) || {};
    out[pl.id] = {
      kz: Number.isFinite(+o.kz) ? +o.kz : pl.kz,
      brl: Number.isFinite(+o.brl) ? +o.brl : pl.brl,
    };
  }
  return out;
}
const fmtKz = (v) => `${Number(v || 0).toLocaleString('pt-PT')} Kz`;
const fmtBrl = (v) => `R$ ${Number(v || 0).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
function precoTxt(id, prices) {
  if (id === 'trial') return 'Grátis';
  const p = (prices && prices[id]) || {};
  const parts = [];
  if (+p.kz > 0) parts.push(fmtKz(p.kz));
  if (+p.brl > 0) parts.push(fmtBrl(p.brl));
  return parts.length ? parts.join(' · ') : '💬 Falar com o dono';
}

// v7.67: dados de pagamento do dono (!setpagamento).
async function getPayData() {
  const d = await botConfigCache.get('rent_pay', {}).catch(() => ({}));
  return {
    pix: String(d.pix || ''), pixNome: String(d.pixNome || ''),
    pixCode: String(d.pixCode || ''),
    mcIban: String(d.mcIban || ''), mcNome: String(d.mcNome || ''), mcExpress: String(d.mcExpress || ''),
  };
}

function mkPedidoRef() {
  return 'DARK-' + String(Math.floor(10000000 + Math.random() * 90000000));
}

function pedidoNotes(p) {
  let n = `grupo:${p.groupJid}|plano:${p.planId}|dias:${p.dias}|kz:${p.amountKz}|brl:${p.brl}|gnome:${String(p.groupName || '').replace(/[|]/g, ' ').slice(0, 60)}`;
  if (p.paid) n += `|pago:${p.paid.by}:${p.paid.ts}:${String(p.paid.obs || '').replace(/[|]/g, ' ').slice(0, 100)}`;
  if (p.paid?.receipt) n += '|rec:1'; // v7.69: comprovativo recebido
  return n;
}

function pedidoFromDoc(d) {
  if (!d) return null;
  const kv = {};
  for (const part of String(d.notes || '').split('|')) {
    const i = part.indexOf(':');
    if (i > 0) kv[part.slice(0, i)] = part.slice(i + 1);
  }
  if (!kv.grupo || !kv.plano) return null;
  return {
    reference: d.reference, planId: kv.plano, dias: +kv.dias || 0,
    amountKz: +kv.kz || 0, brl: +kv.brl || 0,
    groupJid: kv.grupo, groupName: kv.gnome || '',
    byNumber: d.whatsappNumber || '', byName: d.username || '',
    status: d.status || 'pendente', ts: d.createdAt ? new Date(d.createdAt).getTime() : Date.now(),
    paid: kv.pago ? { by: String(kv.pago).split(':')[0] || '', ts: +String(kv.pago).split(':')[1] || 0, obs: String(kv.pago).split(':').slice(2).join(':'), receipt: kv.rec === '1' } : null,
  };
}

async function savePedido(p) {
  p.notes = pedidoNotes(p);
  _pedidos.set(p.reference, { ...p });
  _pedidosTrim();
  try {
    await Payment.findOneAndUpdate(
      { reference: p.reference },
      {
        whatsappNumber: p.byNumber, username: p.byName,
        amount: p.amountKz, currency: 'AOA', method: 'multicaixa',
        plan: p.planId, reference: p.reference, status: p.status || 'pendente',
        notes: p.notes,
        ...(p.approvedAt ? { approvedAt: p.approvedAt } : {}), // v7.79: data de aprovação p/ !vendas
      },
      { upsert: true, new: true },
    );
  } catch {}
  return p;
}

async function findPedido(ref) {
  const r = String(ref || '').toUpperCase().trim();
  if (_pedidos.has(r)) return _pedidos.get(r);
  try {
    const d = await Payment.findOne({ reference: r }).lean();
    const p = pedidoFromDoc(d);
    if (p) { _pedidos.set(r, p); _pedidosTrim(); }
    return p;
  } catch { return null; }
}

// v7.68: cartão NATIVO de fatura (orderMessage) — igual ao do System Zero:
// "PEDIDO N.º … / Fatura via Pix / Quantidade: 1 / Total … / Ver encomenda".
// É só visual (o pagamento confirma-se com !paguei/!ativar).
function buildPedidoOrder({ orderNum, title, total1000, currency, body, sellerJid, thumb }) {
  const { proto } = require('baileys-v6');
  const orderMessage = {
    orderId: String(orderNum || ''),
    itemCount: 1,
    status: proto.Message.OrderMessage.OrderStatus.INQUIRY,
    surface: proto.Message.OrderMessage.OrderSurface.CATALOG,
    message: String(body || ''),
    orderTitle: String(title || 'Fatura'),
    sellerJid: String(sellerJid || ''),
    token: require('crypto').randomBytes(16).toString('hex'),
    totalAmount1000: Math.round(+total1000 || 0),
    totalCurrencyCode: String(currency || 'BRL'),
    messageVersion: 1,
  };
  if (thumb?.length) orderMessage.thumbnail = thumb;
  return { orderMessage };
}

let _orderThumbCache = null; // null = não tentado; Buffer | false
async function getOrderThumb() {
  if (_orderThumbCache !== null) return _orderThumbCache || null;
  try {
    const fs = require('fs');
    const path = require('path');
    const logo = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'img', 'logo.jpg'));
    const sharp = require('sharp');
    _orderThumbCache = await sharp(logo).resize(96, 96, { fit: 'cover' }).jpeg({ quality: 70 }).toBuffer();
  } catch { _orderThumbCache = false; }
  return _orderThumbCache || null;
}

module.exports = function registerRental2(registerCase) {

  // ═══ ALUGAR COM CARROSSEL DE PLANOS ═══
  registerCase(['alugar', 'hospedar', 'rent'], async ({ sock, msg, ctx, args, isOwner, config: cfg, reply }) => {
    const localConfig = cfg || config;
    const p = localConfig.bot.prefix;
    const ownerNum = String(localConfig.owner.number || '').replace(/\D/g, '');

    // v7.30 ALUGUEL AVANÇADO — aceita:
    //   !alugar 30      → soma 30 dias ao tempo restante (ou activa 30 se não houver)
    //   !alugar +7      → soma 7 dias
    //   !alugar -3      → subtrai 3 dias (nunca abaixo de hoje)
    //   !alugar =30     → define exactamente 30 dias a partir de agora
    //   !alugar <jid> 30 / +7 / -3 / =30 → o mesmo, para outro grupo (dono/subdono)
    let targetJid = ctx.isGroup ? ctx.remoteJid : '';
    let opArg = args[0] || '';
    if (/@g\.us$/.test(opArg) || /^\d{15,}(-\d+)?$/.test(opArg)) { targetJid = opArg.includes('@') ? opArg : opArg + '@g.us'; opArg = args[1] || ''; }
    const opM = String(opArg).match(/^([+\-=]?)(\d{1,4})$/);
    const dias = opM ? parseInt(opM[2], 10) : NaN;
    const op = opM ? (opM[1] || '+') : '';
    if (opM && dias >= 1 && dias <= 3650) {
      const u = await User.findOne({ whatsappNumber: ctx.senderNumber }).catch(() => null);
      const isVip = u && u.isPremium && u.isPremium();
      const extraOwners = await botConfigCache.get('owner_numbers', []).catch(() => []);
      const ownerNums = [localConfig.owner.number, ...(Array.isArray(extraOwners) ? extraOwners : [])].map(n => String(n).replace(/\D/g, ''));
      const isSubDono = isOwner || ownerNums.includes(ctx.senderNumber);

      if (!isSubDono && !isVip) {
        return tReply(sock, msg, ctx, '🏠 ALUGUEL', [
          '❌ Só Dono, SubDonos ou VIP podem alugar.',
          '',
          `📲 Contacta: wa.me/${ownerNum}`,
          `> Usa !vip para ver planos`,
        ]);
      }

      if (!targetJid) return tReply(sock, msg, ctx, '🏠 ALUGUEL', [`❌ Usa num grupo ou: ${p}alugar <jid> <dias>`]);
      if (targetJid !== ctx.remoteJid && !isSubDono) return tReply(sock, msg, ctx, '🏠 ALUGUEL', ['❌ Só dono/subdono podem alugar para outro grupo.']);
      if (op === '-' && !isSubDono) return tReply(sock, msg, ctx, '🏠 ALUGUEL', ['❌ Só dono/subdono podem subtrair dias.']);

      const atual = await GroupSettings.findOne({ groupJid: targetJid }).lean().catch(() => null);
      if (isPermanentHosted(atual)) {
        return tReply(sock, msg, ctx, '🏠 ALUGUEL', [
          '✅ Este grupo tem *aluguel permanente* ativo.',
          'Não precisa somar dias. Para trocar para um prazo definido, cancela primeiro com *!cancelaraluguel*.',
        ]);
      }
      const agora = Date.now();
      const fimAtual = isHostedActive(atual, agora) ? toMs(atual.hostedUntil) : 0;
      const restanteMs = Math.max(0, fimAtual - agora);
      const tinhaAtivo = restanteMs > 0;

      // Verificar limite VIP (só conta quando activa um grupo novo)
      if (!isSubDono && isVip && !tinhaAtivo) {
        const limit = u.vipGroupLimit || 3;
        const added = u.vipGroupsAdded || 0;
        if (added >= limit) return tReply(sock, msg, ctx, '🏠 ALUGUEL', [`❌ Limite VIP: ${added}/${limit} grupos`]);
        await User.findOneAndUpdate({ whatsappNumber: ctx.senderNumber }, { $inc: { vipGroupsAdded: 1 } }).catch(() => {});
      }

      let novoFimMs;
      if (op === '=') novoFimMs = agora + dias * 86400000;
      else if (op === '-') novoFimMs = Math.max(agora, (tinhaAtivo ? fimAtual : agora) - dias * 86400000);
      else novoFimMs = (tinhaAtivo ? fimAtual : agora) + dias * 86400000;

      const until = new Date(novoFimMs);
      const diasRestantes = Math.max(0, Math.ceil((novoFimMs - agora) / 86400000));
      const diasAntes = Math.ceil(restanteMs / 86400000);
      const continuaAtivo = novoFimMs > agora + 60000;
      const gName = targetJid === ctx.remoteJid ? (ctx.groupName || targetJid) : (atual?.groupName || targetJid);

      await GroupSettings.findOneAndUpdate(
        { groupJid: targetJid },
        {
          isHosted: continuaAtivo, hostedUntil: until, trialExpiresAt: new Date(0),
          rentedBy: atual?.rentedBy && tinhaAtivo ? atual.rentedBy : ctx.senderNumber,
          rentedAt: tinhaAtivo && atual?.rentedAt ? atual.rentedAt : new Date(),
          ...(targetJid === ctx.remoteJid ? { groupName: ctx.groupName || '' } : {}),
        },
        { upsert: true, new: true }
      );
      try { require('../hotCache').forgetGroup(targetJid); } catch {} // v7.53: fura o TTL

      const opTxt = op === '=' ? `📐 Definido: *${dias} dias* a partir de agora`
        : op === '-' ? `➖ Subtraídos: *${dias} dias* (tinha ${diasAntes})`
        : tinhaAtivo ? `➕ Somados: *${dias} dias* aos ${diasAntes} que restavam` : `⏰ Duração: *${dias} dias*`;

      return tReply(sock, msg, ctx, continuaAtivo ? (tinhaAtivo ? '🔄 ALUGUEL ACTUALIZADO' : '✅ ALUGUEL ACTIVADO') : '🚫 ALUGUEL ENCERRADO', [
        `📋 Grupo: *${gName}*`,
        opTxt,
        `🧮 Total restante: *${diasRestantes} dias*`,
        `📅 Expira: *${until.toLocaleDateString('pt-PT')} ${until.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}*`,
        `👤 Por: *${ctx.pushName}*`,
        '',
        continuaAtivo ? '🚀 Comandos *ILIMITADOS* activados!' : `> Usa ${p}alugar <dias> para reactivar`,
      ]);
    }

    // v7.67: !alugar plano:<id> (vem da lista "Escolher Plano") — qualquer
    // pessoa do grupo pode pedir; o dono aprova com !ativar.
    const planoId = String(args[0] || '').match(/^plano:([a-z]+)$/i)?.[1]?.toLowerCase();
    if (planoId) {
      const plan = RENTAL_PLANS.find(x => x.id === planoId && x.id !== 'trial');
      if (!plan) return reply(`❌ Plano desconhecido. Usa *${p}alugar* para ver os planos.`);
      if (!ctx.isGroup) return reply('❌ O pedido faz-se *dentro do grupo* a ativar.');
      const prices = await getPrices();
      const pay = await getPayData();
      const kz = prices[plan.id].kz, brl = prices[plan.id].brl;
      const gs0 = await GroupSettings.findOne({ groupJid: ctx.remoteJid }).lean().catch(() => null);
      if (isPermanentHosted(gs0)) return reply('✅ Este grupo tem *aluguel permanente* activo; não precisa de renovação.');
      const renov = isHostedActive(gs0);
      const ref = mkPedidoRef();
      await savePedido({
        reference: ref, planId: plan.id, dias: plan.dias, amountKz: kz, brl,
        groupJid: ctx.remoteJid, groupName: ctx.groupName || '',
        byNumber: ctx.senderNumber, byName: ctx.pushName || '',
        status: 'pendente', ts: Date.now(), paid: null,
      });
      // v7.96: "o contacto X está interessado no aluguel" → avisa já o Dono
      try {
        await require('../../aura/auraAvisos').avisarPedidoNovo(sock, config, {
          numero: ctx.senderNumber, nome: ctx.pushName || '', ref,
          total: `${precoTxt(plan.id, prices)}`,
        });
      } catch {}
      const payLines = [];
      if (pay.pix) payLines.push(`🔑 Pix: *${pay.pix}*${pay.pixNome ? ` (${pay.pixNome})` : ''} → ${fmtBrl(brl)}`);
      if (pay.pixCode) payLines.push(`📋 Pix copia-e-cola:\n${pay.pixCode}`);
      if (pay.mcIban) payLines.push(`🏦 IBAN: *${pay.mcIban}*${pay.mcNome ? ` (${pay.mcNome})` : ''} → ${fmtKz(kz)}`);
      if (pay.mcExpress) payLines.push(`📲 Multicaixa Express: *${pay.mcExpress}* → ${fmtKz(kz)}`);
      const pedidoTxt =
        `🧾 *PEDIDO ${ref}*\n\n` +
        `📦 Plano: *${plan.nome}* (${plan.dias} dias)\n` +
        `💰 Total: *${precoTxt(plan.id, prices)}*\n` +
        `🏠 Grupo: ${ctx.groupName || ''}\n` +
        (renov ? `🔄 Renovação — soma aos dias que restam.\n` : ``) +
        `\n` +
        (payLines.length ? `*Como pagar:*\n${payLines.join('\n')}\n\n` : `📲 Pagamento: fala com o dono: wa.me/${ownerNum}\n\n`) +
        `Depois de pagar: *${p}paguei ${ref}*`;
      // v7.68: tenta primeiro o cartão NATIVO de fatura; se falhar cai no
      // cartão interativo e depois em texto (cadeia intacta).
      try {
        const { generateWAMessageFromContent } = require('baileys-v6');
        let cardCur = 'BRL', cardTitle = 'Fatura via Pix', cardTotal = brl;
        if ((pay.mcIban || pay.mcExpress) && kz > 0) { cardCur = 'AOA'; cardTitle = 'Fatura Multicaixa'; cardTotal = kz; }
        else if (!(pay.pix && brl > 0) && kz > 0) { cardCur = 'AOA'; cardTitle = 'Fatura'; cardTotal = kz; }
        const sellerJid = sock.user?.id || '';
        if (!sellerJid) throw new Error('sem seller');
        const thumb = await getOrderThumb().catch(() => null);
        const content = buildPedidoOrder({
          orderNum: ref.replace(/\D/g, ''), title: cardTitle,
          total1000: Math.round(cardTotal * 1000), currency: cardCur,
          body: `${plan.nome} · ${plan.dias} dias\nPedido ${ref}`,
          sellerJid, thumb,
        });
        const om = generateWAMessageFromContent(ctx.remoteJid, content, { userJid: sock.user?.id, quoted: msg });
        await sock.relayMessage(ctx.remoteJid, om.message, { messageId: om.key.id });
        return reply(pedidoTxt);
      } catch {}
      try {
        const { generateWAMessageFromContent, proto } = require('baileys-v6');
        const m = generateWAMessageFromContent(ctx.remoteJid, {
          interactiveMessage: proto.Message.InteractiveMessage.fromObject({
            body: proto.Message.InteractiveMessage.Body.fromObject({ text: pedidoTxt }),
            footer: proto.Message.InteractiveMessage.Footer.fromObject({ text: `${localConfig.bot.name}` }),
            nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
              buttons: [
                { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '✅ Já paguei', id: `${p}paguei ${ref}` }) },
                { name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: '📲 Falar com o Dono', url: `https://wa.me/${ownerNum}`, merchant_url: `https://wa.me/${ownerNum}` }) },
              ],
            }),
          }),
        }, { userJid: sock.user?.id, quoted: msg });
        await sock.relayMessage(ctx.remoteJid, m.message, {
          messageId: m.key.id,
          additionalNodes: [{ tag: 'biz', attrs: {}, content: [{ tag: 'interactive', attrs: { type: 'native_flow', v: '1' }, content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }] }] }],
        });
      } catch { await reply(pedidoTxt); }
      return;
    }

    // Sem argumento → cartão de planos estilo System Zero (foto + lista)
    const { generateWAMessageFromContent, proto, prepareWAMessageMedia } = require('baileys-v6');
    const RE = require('../renderEngine');
    const t = await RE.getTheme(ctx.remoteJid);

    // Verificar estado actual do grupo
    let currentStatus = '🆓 Sem aluguel activo';
    if (ctx.isGroup) {
      const gs = await GroupSettings.findOne({ groupJid: ctx.remoteJid }).lean().catch(() => null);
      if (isHostedActive(gs)) {
        const daysLeft = hostedDaysLeft(gs);
        currentStatus = daysLeft == null ? '🟢 Aluguel permanente' : `🟢 Activo — ${daysLeft} dias restantes`;
      } else if (isTrialActive(gs)) {
        const daysLeft = Math.ceil((toMs(gs.trialExpiresAt) - Date.now()) / 86400000);
        currentStatus = `🆓 Trial — ${daysLeft} dias restantes`;
      }
    }

    // v7.67: cartão único com foto (!setmenu alugar) + lista de planos.
    const prices = await getPrices();
    const planLine = (pl) => `${pl.emoji} *${pl.nome}* — ${pl.dias} dias — ${precoTxt(pl.id, prices)}`;
    const cardBody =
      `🏠 *ALUGUEL DO BOT* 🏠\n\n` +
      `📋 Estado: ${currentStatus}\n\n` +
      `💎 Ative o ${localConfig.bot.name} no seu grupo:\n\n` +
      RENTAL_PLANS.filter(pl => pl.id !== 'trial').map(planLine).join('\n') +
      `\n\n🆓 *TRIAL* — 7 dias grátis: *${p}trial*\n\n` +
      `Escolha um plano abaixo 👇`;
    const planRows = RENTAL_PLANS.filter(pl => pl.id !== 'trial').map(pl => ({
      title: `${pl.emoji} ${pl.nome.replace(/^[^\s]+\s/, '')} — ${precoTxt(pl.id, prices)}`.slice(0, 60),
      description: `${pl.dias} dias · ${pl.desc.split('\n').slice(1, 3).join(' · ')}`.slice(0, 72),
      id: `${p}alugar plano:${pl.id}`,
    }));
    planRows.push(
      { title: '🆓 Trial 7 dias grátis', description: '500 cmds/dia · sem cartão', id: `${p}trial` },
      { title: '📊 Estado do aluguel', description: 'Ver dias restantes', id: `${p}statusalugar` },
    );
    const channelUrl = await require('../identidadeCanal').canalLink();
    const channelBtn = channelUrl
      ? { name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: '📢 Canal Oficial', url: channelUrl, merchant_url: channelUrl }) }
      : { name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: '📲 Falar com o Dono', url: `https://wa.me/${ownerNum}`, merchant_url: `https://wa.me/${ownerNum}` }) };

    try {
      let cardHeader = { title: '', hasMediaAttachment: false };
      try {
        const NC = require('../nativeCommands');
        const _mmUrl = await botConfigCache.get('menu_media_menu_alugar_url', '').catch(() => '');
        const _mmType = await botConfigCache.get('menu_media_menu_alugar_type', 'none').catch(() => 'none');
        if (_mmUrl && _mmType && _mmType !== 'none') {
          const _mmBuf = await NC.getMenuMediaBuf('menu_alugar', _mmUrl).catch(() => null);
          if (_mmBuf?.length) {
            if (_mmType === 'image') {
              const _mm = await prepareWAMessageMedia({ image: _mmBuf }, { upload: sock.waUploadToServer });
              if (_mm?.imageMessage) cardHeader = { title: '', hasMediaAttachment: true, imageMessage: _mm.imageMessage };
            } else {
              const _mm = await prepareWAMessageMedia({ video: _mmBuf, gifPlayback: _mmType === 'gif' }, { upload: sock.waUploadToServer });
              if (_mm?.videoMessage) cardHeader = { title: '', hasMediaAttachment: true, videoMessage: _mm.videoMessage };
            }
          }
        }
      } catch {}
      const m = generateWAMessageFromContent(ctx.remoteJid, {
        interactiveMessage: proto.Message.InteractiveMessage.fromObject({
          header: proto.Message.InteractiveMessage.Header.fromObject(cardHeader),
          body: proto.Message.InteractiveMessage.Body.fromObject({ text: cardBody }),
          footer: proto.Message.InteractiveMessage.Footer.fromObject({ text: `${t.icon || '🕸️'} ${localConfig.bot.name}` }),
          nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
            buttons: [
              { name: 'single_select', buttonParamsJson: JSON.stringify({ title: '🛒 Escolher Plano', sections: [{ title: 'PLANOS DISPONÍVEIS', rows: planRows }] }) },
              channelBtn,
            ],
          }),
        }),
      }, { userJid: sock.user?.id, quoted: msg });
      await sock.relayMessage(ctx.remoteJid, m.message, {
        messageId: m.key.id,
        additionalNodes: [{ tag: 'biz', attrs: {}, content: [{ tag: 'interactive', attrs: { type: 'native_flow', v: '1' }, content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }] }] }],
      });
    } catch (e) {
      // Fallback texto
      const lines = RENTAL_PLANS.map(pl => [
        planLine(pl),
        `${pl.desc.split('\n')[0]}`,
        pl.id === 'trial' ? `> ${p}trial para activar` : `> ${p}alugar plano:${pl.id} para pedir`,
      ].join('\n')).join('\n\n');
      return tReply(sock, msg, ctx, '🏠 PLANOS DE ALUGUEL', [
        `📋 Estado: ${currentStatus}`,
        '',
        lines,
        '',
        `📲 Dúvidas: wa.me/${ownerNum}`,
      ].flat());
    }
  }, true);

  // ═══ v7.30 SUBMENU PLANOS — junta Premium (VIP) + Aluguel num só menu ═══
  registerCase(['planos', 'menuplanos', 'submenuplanos', 'plans'], async ({ sock, msg, ctx, isOwner, config: cfg }) => {
    const localConfig = cfg || config;
    const p = localConfig.bot.prefix;
    const ownerNum = String(localConfig.owner.number || '').replace(/\D/g, '');
    const RE = require('../renderEngine');
    const t = await RE.getTheme(ctx.remoteJid);

    // Estado do utilizador (VIP) e do grupo (aluguel)
    const u = await User.findOne({ whatsappNumber: ctx.senderNumber }).lean().catch(() => null);
    const vipAtivo = !!(u && u.role === 'premium' && (!u.premiumUntil || new Date(u.premiumUntil) > new Date()));
    const vipTxt = isOwner ? '👑 DONO — acesso total' : vipAtivo ? `💎 VIP activo${u.premiumUntil ? ' até ' + new Date(u.premiumUntil).toLocaleDateString('pt-PT') : ''}` : '🆓 FREE';
    let alugTxt = '— (só em grupos)';
    if (ctx.isGroup) {
      const gs = await GroupSettings.findOne({ groupJid: ctx.remoteJid }).lean().catch(() => null);
      if (isHostedActive(gs)) {
        const daysLeft = hostedDaysLeft(gs);
        alugTxt = daysLeft == null ? '🟢 Aluguel permanente' : `🟢 Activo — ${daysLeft} dias restantes`;
      } else if (isTrialActive(gs)) alugTxt = `🆓 Trial — ${Math.ceil((toMs(gs.trialExpiresAt) - Date.now()) / 86400000)} dias restantes`;
      else alugTxt = '🔴 Sem aluguel';
    }

    const rows = [
      { title: '⭐ Planos Premium (VIP)', description: 'Carrossel: 7 / 30 / 90 dias', id: `${p}vip` },
      { title: '🏠 Planos de Aluguel', description: 'Trial, semanal, mensal, trimestral, anual', id: `${p}alugar` },
      { title: '🆓 Activar Trial (7 dias)', description: 'Grátis, 500 cmds/dia', id: `${p}trial` },
      { title: '📊 Estado do Aluguel', description: 'Dias restantes, quem activou', id: `${p}statusalugar` },
      { title: '👤 Meu Perfil / VIP', description: 'Cargo, VIP e limites', id: `${p}perfil` },
      { title: '📲 Falar com o Dono', description: `wa.me/${ownerNum}`, id: `${p}dono` },
    ];
    const body = RE.renderBlock(t, '💎 PLANOS', [
      `👤 Tu: *${vipTxt}*`,
      `🏠 Este grupo: *${alugTxt}*`,
      '',
      '*⭐ PREMIUM (pessoa)* — cmds ilimitados, downloads HD, IA com memória, menu+18, alugar grupos.',
      '*🏠 ALUGUEL (grupo)* — bot activo no grupo para todos.',
      '',
      `▸ ${p}vip — ver planos premium`,
      `▸ ${p}alugar — ver planos de aluguel`,
      `▸ ${p}alugar 30 · +7 · -3 · =30 — somar/subtrair/definir dias`,
      `▸ ${p}trial — 7 dias grátis`,
      `▸ ${p}statusalugar — estado do aluguel`,
      '',
      `📲 Dono: wa.me/${ownerNum}`,
    ], { botName: localConfig.bot.name });

    try {
      const { generateWAMessageFromContent, proto } = require('baileys-v6');
      const m = generateWAMessageFromContent(ctx.remoteJid, {
        viewOnceMessage: { message: { interactiveMessage: proto.Message.InteractiveMessage.fromObject({
          body: proto.Message.InteractiveMessage.Body.fromObject({ text: body }),
          footer: proto.Message.InteractiveMessage.Footer.fromObject({ text: `${t.icon || '🕸️'} ${localConfig.bot.name}` }),
          nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
            buttons: [{ name: 'single_select', buttonParamsJson: JSON.stringify({ title: '💎 Escolher', sections: [{ title: 'PLANOS', rows }] }) }],
          }),
        }) } },
      }, { userJid: sock.user?.id, quoted: msg });
      await sock.relayMessage(ctx.remoteJid, m.message, { messageId: m.key.id });
    } catch (e) {
      await sock.sendMessage(ctx.remoteJid, { text: body }, { quoted: msg });
    }
  });

  // ═══ TRIAL GRÁTIS ═══
  registerCase(['trial', 'teste', 'experimentar'], async ({ sock, msg, ctx, config: cfg }) => {
    if (!ctx.isGroup) return tReply(sock, msg, ctx, '🆓 TRIAL', ['❌ Só em grupos']);
    const gs = await GroupSettings.findOne({ groupJid: ctx.remoteJid }).lean().catch(() => null);
    if (isHostedActive(gs)) return tReply(sock, msg, ctx, '🆓 TRIAL', ['✅ Já tens aluguel activo!']);
    if (isTrialActive(gs)) {
      const daysLeft = Math.ceil((toMs(gs.trialExpiresAt) - Date.now()) / 86400000);
      return tReply(sock, msg, ctx, '🆓 TRIAL', [`🆓 Trial activo — ${daysLeft} dias restantes`]);
    }
    // Trial é uma oferta única. Registos antigos sem trialUsedAt mas com data
    // de trial já expirada contam como usados e não podem ser reciclados.
    if (gs?.trialUsedAt || gs?.trialExpiresAt) {
      return tReply(sock, msg, ctx, '🆓 TRIAL', ['⌛ Este grupo já usou o trial gratuito.', '💎 Usa !alugar para reactivar o bot.']);
    }
    const trialEnd = new Date(Date.now() + 7 * 86400000);
    await GroupSettings.findOneAndUpdate(
      { groupJid: ctx.remoteJid },
      { trialExpiresAt: trialEnd, trialUsedAt: new Date(), isHosted: false, groupName: ctx.groupName || '' },
      { upsert: true, new: true }
    );
    try { require('../hotCache').forgetGroup(ctx.remoteJid); } catch {} // v7.53: fura o TTL
    return tReply(sock, msg, ctx, '🆓 TRIAL ACTIVADO', [
      `🆓 *7 dias grátis* activados!`,
      `📅 Expira: ${trialEnd.toLocaleDateString('pt-PT')}`,
      `📋 500 cmds/dia`,
      '',
      `> Usa !alugar para planos completos`,
    ]);
  }, true);

  // ═══ STATUS ALUGUEL ═══
  registerCase(['statusalugar', 'rentstatus', 'meualuguel'], async ({ sock, msg, ctx }) => {
    if (!ctx.isGroup) return tReply(sock, msg, ctx, '🏠 STATUS', ['❌ Só em grupos']);
    const gs = await GroupSettings.findOne({ groupJid: ctx.remoteJid }).lean().catch(() => null);
    if (!gs) return tReply(sock, msg, ctx, '🏠 STATUS', ['❌ Sem configuração. Usa !trial ou !alugar']);

    const hosted = isHostedActive(gs);
    const trial = isTrialActive(gs);
    const permanent = isPermanentHosted(gs);
    const expires = permanent ? 'permanente' : (toMs(gs.hostedUntil) ? new Date(toMs(gs.hostedUntil)).toLocaleDateString('pt-PT') : '—');
    const trialExp = toMs(gs.trialExpiresAt) ? new Date(toMs(gs.trialExpiresAt)).toLocaleDateString('pt-PT') : '—';
    const diasHost = hostedDaysLeft(gs);
    const diasTrial = toMs(gs.trialExpiresAt) ? Math.max(0, Math.ceil((toMs(gs.trialExpiresAt) - Date.now()) / 86400000)) : 0;
    const cmdsUsed = gs.commandsUsedToday || 0;

    return tReply(sock, msg, ctx, '🏠 STATUS ALUGUEL', [
      hosted ? '🟢 *ALUGUEL ACTIVO*' : trial ? '🆓 *TRIAL ACTIVO*' : '🔴 *INACTIVO*',
      '',
      hosted ? (permanent ? '📅 Plano: *permanente*' : `📅 Expira: ${expires} (*${diasHost} dias restantes*)`) : '',
      trial ? `📅 Trial expira: ${trialExp} (*${diasTrial} dias restantes*)` : '',
      `👤 Activado por: ${gs.rentedBy || '—'}`,
      `📊 Comandos hoje: ${cmdsUsed}${hosted ? ' (ilimitado)' : ` / 500`}`,
      '',
      hosted ? '🚀 Todos os comandos ILIMITADOS' : trial ? '⚡ 500 cmds/dia' : '📲 Usa !trial ou !alugar',
    ].filter(Boolean));
  }, true);

  // ═══ CANCELAR ALUGUEL ═══
  registerCase(['cancelaraluguel', 'cancelrent', 'desalugar'], async ({ sock, msg, ctx, isOwner, config: cfg }) => {
    if (!ctx.isGroup) return tReply(sock, msg, ctx, '🚫 CANCELAR', ['❌ Só em grupos']);
    const localConfig = cfg || config;
    const extraOwners = await botConfigCache.get('owner_numbers', []).catch(() => []);
    const ownerNums = [localConfig.owner.number, ...(Array.isArray(extraOwners) ? extraOwners : [])].map(n => String(n).replace(/\D/g, ''));
    const isSubDono = isOwner || ownerNums.includes(ctx.senderNumber);

    const gs = await GroupSettings.findOne({ groupJid: ctx.remoteJid }).lean().catch(() => null);
    if (!gs?.isHosted) return tReply(sock, msg, ctx, '🚫 CANCELAR', ['❌ Sem aluguel activo']);
    if (!isSubDono && gs.rentedBy !== ctx.senderNumber) {
      return tReply(sock, msg, ctx, '🚫 CANCELAR', ['❌ Só quem alugou ou o dono pode cancelar']);
    }

    await GroupSettings.findOneAndUpdate({ groupJid: ctx.remoteJid }, { isHosted: false, hostedUntil: new Date(0) }, { upsert: true });
    try { require('../hotCache').forgetGroup(ctx.remoteJid); } catch {} // v7.53: fura o TTL
    return tReply(sock, msg, ctx, '🚫 ALUGUEL CANCELADO', [
      `🚫 Aluguel cancelado para *${ctx.groupName || ctx.remoteJid}*`,
      `> Usa !alugar para reactivar`,
    ]);
  }, true);

  // ═══ ESTENDER ALUGUEL ═══
  registerCase(['estender', 'renew', 'renovar'], async ({ sock, msg, ctx, args, isOwner, config: cfg }) => {
    if (!ctx.isGroup) return tReply(sock, msg, ctx, '🔄 ESTENDER', ['❌ Só em grupos']);
    const dias = parseInt(args[0]);
    if (!dias || dias < 1) return tReply(sock, msg, ctx, '🔄 ESTENDER', ['Uso: !estender <dias>', '> Ou: !alugar +7 / -3 / =30']);

    const gs = await GroupSettings.findOne({ groupJid: ctx.remoteJid }).lean().catch(() => null);
    if (isPermanentHosted(gs)) return tReply(sock, msg, ctx, '🔄 ESTENDER', ['✅ Este grupo tem aluguel permanente; não precisa de extensão.']);
    if (!isHostedActive(gs)) return tReply(sock, msg, ctx, '🔄 ESTENDER', ['❌ Sem aluguel activo para estender']);

    const currentEnd = new Date(toMs(gs.hostedUntil));
    const base = currentEnd > new Date() ? currentEnd : new Date();
    const newEnd = new Date(base.getTime() + dias * 86400000);

    await GroupSettings.findOneAndUpdate({ groupJid: ctx.remoteJid }, { hostedUntil: newEnd }, { upsert: true });
    try { require('../hotCache').forgetGroup(ctx.remoteJid); } catch {} // v7.53: fura o TTL
    return tReply(sock, msg, ctx, '🔄 ALUGUEL ESTENDIDO', [
      `➕ +${dias} dias adicionados`,
      `📅 Nova data: *${newEnd.toLocaleDateString('pt-PT')}*`,
    ]);
  }, true);

  // ═══ LISTAR GRUPOS ALUGADOS (dono) ═══
  registerCase(['listrents', 'meusgrupos', 'gruposalugados'], async ({ sock, msg, ctx, isOwner, config: cfg }) => {
    const localConfig = cfg || config;
    const extraOwners = await botConfigCache.get('owner_numbers', []).catch(() => []);
    const ownerNums = [localConfig.owner.number, ...(Array.isArray(extraOwners) ? extraOwners : [])].map(n => String(n).replace(/\D/g, ''));
    const isSubDono = isOwner || ownerNums.includes(ctx.senderNumber);
    if (!isSubDono) return tReply(sock, msg, ctx, '📋 GRUPOS', ['❌ Só dono/subdono']);

    const filter = isOwner ? { isHosted: true } : { isHosted: true, rentedBy: ctx.senderNumber };
    const groups = await GroupSettings.find(filter).lean().catch(() => []);
    const active = groups.filter(g => !g.hostedUntil || new Date(g.hostedUntil) > new Date());

    if (!active.length) return tReply(sock, msg, ctx, '📋 GRUPOS ALUGADOS', ['📋 Nenhum grupo activo']);

    const lines = active.map((g, i) => {
      const daysLeft = g.hostedUntil ? Math.ceil((new Date(g.hostedUntil) - Date.now()) / 86400000) : '∞';
      return `${i + 1}. *${g.groupName || g.groupJid}* — ${daysLeft}d — por ${g.rentedBy || '?'}`;
    });
    return tReply(sock, msg, ctx, `📋 GRUPOS ALUGADOS (${active.length})`, lines);
  }, true);

  // ═══ v7.67 PAGUEI — cliente avisa que pagou; dono é chamado no PV ═══
  registerCase(['paguei', 'pagar', 'pedido'], async ({ sock, msg, ctx, args, config: cfg, reply }) => {
    const localConfig = cfg || config;
    const p = localConfig.bot.prefix;
    const ref = String(args[0] || '').toUpperCase().trim();
    if (!/^DARK-\d{8}$/.test(ref)) {
      return reply(`Uso: *${p}paguei DARK-12345678* [observação]\n> O número do pedido veio no *${p}alugar*.`);
    }
    const ped = await findPedido(ref);
    if (!ped) return reply('❌ Pedido não encontrado. Confere o número.');
    if (ped.status === 'aprovado') return reply('✅ Este pedido *já foi aprovado*.');
    const obs = args.slice(1).join(' ').slice(0, 100);
    ped.paid = { by: ctx.senderNumber, name: ctx.pushName || '', ts: Date.now(), obs, receipt: false };
    ped.status = 'pendente';
    const plan = RENTAL_PLANS.find(x => x.id === ped.planId);
    const ownerNum = String(localConfig.owner.number || '').replace(/\D/g, '');
    const ownerTxt =
      `💰 *PAGAMENTO AVISADO*\n\n` +
      `🧾 Pedido: *${ref}*\n` +
      `📦 Plano: *${plan ? plan.nome : ped.planId}* (${ped.dias} dias)\n` +
      `💰 Valor: *${fmtKz(ped.amountKz)}*${ped.brl > 0 ? ` · *${fmtBrl(ped.brl)}*` : ''}\n` +
      `🏠 Grupo: ${ped.groupName || ped.groupJid}\n` +
      `👤 Avisado por: ${ctx.pushName || ''} (${ctx.senderNumber})${obs ? `\n📝 Obs: ${obs}` : ''}\n\n` +
      `✅ Para ativar: *${p}ativar ${ref}*`;
    // v7.69: comprovativo por foto (directa ou respondida) → segue para o PV do dono.
    let receiptOk = false;
    try {
      const raw = msg?.message || {};
      const quoted = raw.extendedTextMessage?.contextInfo?.quotedMessage;
      const imgSrc = raw.imageMessage ? msg : (quoted?.imageMessage ? { key: msg.key, message: quoted } : null);
      if (imgSrc && ownerNum) {
        const buf = await require('../mediaHandler').downloadFromMessage(imgSrc);
        if (buf?.length) {
          await sock.sendMessage(`${ownerNum}@s.whatsapp.net`, { image: buf, caption: `📎 Comprovativo\n\n${ownerTxt}` });
          receiptOk = true;
        }
      }
    } catch {}
    ped.paid.receipt = receiptOk;
    await savePedido(ped);
    if (!receiptOk && ownerNum) {
      await sock.sendMessage(`${ownerNum}@s.whatsapp.net`, { text: ownerTxt }).catch(() => {});
    }
    return reply(receiptOk
      ? `✅ Pagamento de *${ref}* + 📎 *comprovativo* enviados!\n👑 O dono foi avisado e ativa em breve.`
      : `✅ Pagamento de *${ref}* registado!\n👑 O dono foi avisado e ativa em breve.\n📎 Dica: responde com a *foto do comprovativo* + *${p}paguei ${ref}*.`);
  });

  // ═══ v7.67 ATIVAR — dono aprova o pedido e o grupo liga ═══
  registerCase(['ativar'], async ({ sock, msg, ctx, args, isOwner, config: cfg, reply }) => {
    const localConfig = cfg || config;
    const p = localConfig.bot.prefix;
    if (!await isSubDono(ctx, isOwner, localConfig)) return reply('🚫 Só o *dono*.');
    const ref = String(args[0] || '').toUpperCase().trim();
    if (!/^DARK-\d{8}$/.test(ref)) return reply(`Uso: *${p}ativar DARK-12345678*`);
    const ped = await findPedido(ref);
    if (!ped) return reply('❌ Pedido não encontrado.');
    if (ped.status === 'aprovado') return reply('✅ Este pedido *já estava aprovado*.');
    const agora = Date.now();
    const atual = await GroupSettings.findOne({ groupJid: ped.groupJid }).lean().catch(() => null);
    if (isPermanentHosted(atual)) {
      return reply('✅ Este grupo já tem aluguel permanente activo; este pedido não deve ser activado. Rejeita-o ou verifica o grupo antes de cobrar.');
    }
    const fimAtual = isHostedActive(atual, agora) ? toMs(atual.hostedUntil) : 0;
    const tinhaAtivo = fimAtual > agora;
    const novoFimMs = (tinhaAtivo ? fimAtual : agora) + ped.dias * 86400000;
    const until = new Date(novoFimMs);
    await GroupSettings.findOneAndUpdate(
      { groupJid: ped.groupJid },
      {
        isHosted: true, hostedUntil: until, trialExpiresAt: new Date(0),
        rentedBy: ped.byNumber, rentedAt: new Date(),
        groupName: ped.groupName || atual?.groupName || '',
      },
      { upsert: true, new: true },
    ).catch(() => null);
    try { require('../hotCache').forgetGroup(ped.groupJid); } catch {}
    ped.status = 'aprovado';
    ped.approvedAt = new Date(); // v7.79
    await savePedido(ped);
    const plan = RENTAL_PLANS.find(x => x.id === ped.planId);
    await sock.sendMessage(ped.groupJid, {
      text:
        `✅ *ALUGUEL ATIVADO*\n\n` +
        `📦 Plano: *${plan ? plan.nome : ped.planId}*\n` +
        `⏰ Duração: *${ped.dias} dias*${tinhaAtivo ? ' (renovação — somou ao que restava)' : ''}\n` +
        `📅 Expira: *${until.toLocaleDateString('pt-PT')}*\n\n` +
        `🚀 Comandos *ILIMITADOS* ativos!`,
    }).catch(() => {});
    return reply(`✅ *${ref}* aprovado — *${ped.groupName || ped.groupJid}* ativo por *${ped.dias} dias*.`);
  });

  // ═══ v7.79 REJEITAR — dono recusa o pedido e o grupo é avisado ═══
  registerCase(['rejeitar', 'recusar', 'reject'], async ({ sock, msg, ctx, args, isOwner, config: cfg, reply }) => {
    const localConfig = cfg || config;
    const p = localConfig.bot.prefix;
    if (!await isSubDono(ctx, isOwner, localConfig)) return reply('🚫 Só o *dono*.');
    const ref = String(args[0] || '').toUpperCase().trim();
    if (!/^DARK-\d{8}$/.test(ref)) return reply(`Uso: *${p}rejeitar DARK-12345678* [motivo]`);
    const ped = await findPedido(ref);
    if (!ped) return reply('❌ Pedido não encontrado.');
    if (ped.status === 'aprovado') return reply('❌ Este pedido *já foi aprovado* — usa o painel para estornar.');
    if (ped.status === 'rejeitado') return reply('❌ Este pedido *já estava rejeitado*.');
    const motivo = args.slice(1).join(' ').slice(0, 120) || 'Pagamento não confirmado';
    ped.status = 'rejeitado';
    await savePedido(ped);
    await sock.sendMessage(ped.groupJid, {
      text: `🔴 *PEDIDO RECUSADO*\n\n🧾 Pedido: *${ref}*\n📝 Motivo: ${motivo}\n\n💬 Fala com o dono ou tenta de novo com *${p}alugar*.`,
    }).catch(() => {});
    return reply(`🔴 *${ref}* rejeitado — *${ped.groupName || ped.groupJid}* avisado.`);
  });

  // ═══ v7.67 PEDIDOS — dono lista pendentes ═══
  registerCase(['pedidos'], async ({ ctx, isOwner, config: cfg, reply }) => {
    const localConfig = cfg || config;
    const p = localConfig.bot.prefix;
    if (!await isSubDono(ctx, isOwner, localConfig)) return reply('🚫 Só o *dono*.');
    const all = new Map();
    for (const [k, v] of _pedidos) if (v.status !== 'aprovado') all.set(k, v);
    try {
      const docs = await Payment.find({ status: 'pendente' }).lean().catch(() => []);
      for (const d of docs || []) {
        if (!d || all.has(d.reference)) continue;
        const q = pedidoFromDoc(d);
        if (q && q.status !== 'aprovado') all.set(q.reference, q);
      }
    } catch {}
    if (!all.size) return reply('📭 Sem pedidos pendentes.');
    const rows = [...all.values()]
      .sort((a, b) => (b.ts || 0) - (a.ts || 0))
      .slice(0, 20)
      .map(q => `${q.paid ? '💰' : '⏳'} *${q.reference}* — ${q.planId} ${q.dias}d — ${q.groupName || q.groupJid}${q.paid?.receipt ? ' 📎' : ''}${q.paid ? ` — pago? avisa ${q.paid.by}` : ''}`);
    return reply(`🧾 *PEDIDOS PENDENTES (${all.size})*\n\n${rows.join('\n')}\n\n✅ Aprovar: *${p}ativar DARK-12345678*`);
  });

  // ═══ v7.79 VENDAS — painel de receita do dono ═══
  registerCase(['vendas', 'faturamento', 'receita', 'lucro'], async ({ ctx, isOwner, config: cfg, reply }) => {
    const localConfig = cfg || config;
    const p = localConfig.bot.prefix;
    if (!await isSubDono(ctx, isOwner, localConfig)) return reply('🚫 Só o *dono*.');
    const aprovados = await Payment.find({ status: 'aprovado' }).lean().catch(() => []) || [];
    const pendentes = await Payment.find({ status: 'pendente' }).lean().catch(() => []) || [];
    let totKz = 0, totBrl = 0, mesKz = 0, mesN = 0;
    const porPlano = {};
    const mes0 = new Date(); mes0.setDate(1); mes0.setHours(0, 0, 0, 0);
    for (const d of aprovados) {
      const kz = +d.amount || 0; totKz += kz;
      const m = /brl:([\d.]+)/.exec(String(d.notes || '')); // BRL vive nas notes
      if (m) totBrl += +m[1] || 0;
      const pid = d.plan || '?'; porPlano[pid] = (porPlano[pid] || 0) + 1;
      const ap = d.approvedAt ? new Date(d.approvedAt) : (d.updatedAt ? new Date(d.updatedAt) : null);
      if (ap && ap >= mes0) { mesN++; mesKz += kz; }
    }
    let pagos = 0;
    for (const d of pendentes) { if (pedidoFromDoc(d)?.paid) pagos++; }
    for (const q of _pedidos.values()) { // memória pode ter pago ainda não gravado
      if (q.status === 'pendente' && q.paid && !pendentes.some(d => d.reference === q.reference)) pagos++;
    }
    const agora = Date.now();
    const hosted = await GroupSettings.find({ isHosted: true }).lean().catch(() => []) || [];
    const ativos = hosted.filter(g => isHostedActive(g, agora));
    const expirando = ativos.filter(g => !isPermanentHosted(g) && toMs(g.hostedUntil) - agora <= 3 * 86400000);
    const trials = await GroupSettings.countDocuments({ trialExpiresAt: { $gt: new Date() } }).catch(() => 0);
    const planoTxt = Object.entries(porPlano).sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `   📦 ${k}: *${v}*`).join('\n');
    return reply(
      `💰 *VENDAS — DARK BOT*\n\n` +
      `💵 Receita total: *${fmtKz(totKz)}*${totBrl > 0 ? ` + *${fmtBrl(totBrl)}*` : ''}\n` +
      `🧾 Pedidos aprovados: *${aprovados.length}*\n` +
      (planoTxt ? planoTxt + '\n' : '') +
      `🆕 Este mês: *${mesN}* (${fmtKz(mesKz)})\n\n` +
      `🏠 Grupos ativos: *${ativos.length}*` +
      (expirando.length ? ` (⏰ ${expirando.length} a expirar ≤3d)` : '') + '\n' +
      `🆓 Trials ativos: *${trials}*\n` +
      `⏳ Pendentes: *${pendentes.length}*` +
      (pagos ? ` (💰 ${pagos} pagos a aguardar — *${p}pedidos*)` : ''),
    );
  });

  // ═══ v7.67 SETPRECO — dono define preços (!setpreco mensal 5000 15) ═══
  registerCase(['setpreco', 'setpreço'], async ({ ctx, args, isOwner, config: cfg, reply }) => {
    const localConfig = cfg || config;
    const p = localConfig.bot.prefix;
    if (!await isSubDono(ctx, isOwner, localConfig)) return reply('🚫 Só o *dono*.');
    const prices = await getPrices();
    const id = String(args[0] || '').toLowerCase();
    if (!id) {
      const rows = RENTAL_PLANS.filter(pl => pl.id !== 'trial').map(pl => `${pl.emoji} *${pl.nome}* — ${precoTxt(pl.id, prices)}`);
      return reply(`💰 *PREÇOS ATUAIS*\n\n${rows.join('\n')}\n\nUso: *${p}setpreco <plano> <kz> [brl]*\nex: *${p}setpreco mensal 5000 15*`);
    }
    const plan = RENTAL_PLANS.find(x => x.id === id && x.id !== 'trial');
    if (!plan) return reply(`❌ Plano? ${RENTAL_PLANS.filter(x => x.id !== 'trial').map(x => x.id).join(', ')}`);
    const kz = args[1] !== undefined ? +args[1] : prices[id].kz;
    const brl = args[2] !== undefined ? +args[2] : prices[id].brl;
    if (!Number.isFinite(kz) || kz < 0 || !Number.isFinite(brl) || brl < 0) return reply('❌ Valores inválidos. Ex: *!setpreco mensal 5000 15*');
    const over = await botConfigCache.get('rent_preco', {}).catch(() => ({}));
    over[id] = { kz, brl };
    await botConfigCache.set('rent_preco', over).catch(() => {});
    return reply(`✅ *${plan.nome}*: ${fmtKz(kz)} · ${fmtBrl(brl)}`);
  });

  // ═══ v7.67 SETPAGAMENTO — dono define Pix/Multicaixa ═══
  registerCase(['setpagamento', 'setpag'], async ({ ctx, args, isOwner, config: cfg, reply }) => {
    const localConfig = cfg || config;
    const p = localConfig.bot.prefix;
    if (!await isSubDono(ctx, isOwner, localConfig)) return reply('🚫 Só o *dono*.');
    const sub = String(args[0] || '').toLowerCase();
    if (!sub) {
      const d = await getPayData();
      return reply(
        `💳 *DADOS DE PAGAMENTO*\n\n` +
        `🔑 Pix: ${d.pix ? `*${d.pix}*${d.pixNome ? ` (${d.pixNome})` : ''}` : '—'}\n` +
        `📋 Pix código: ${d.pixCode ? '✅ definido' : '—'}\n` +
        `🏦 IBAN: ${d.mcIban ? `*${d.mcIban}*${d.mcNome ? ` (${d.mcNome})` : ''}` : '—'}\n` +
        `📲 Express: ${d.mcExpress || '—'}\n\n` +
        `*${p}setpagamento pix <chave> [nome]*\n` +
        `*${p}setpagamento pixcode <código copia-e-cola>*\n` +
        `*${p}setpagamento mc <iban> [nome]*\n` +
        `*${p}setpagamento express <número>*`,
      );
    }
    const cur = await botConfigCache.get('rent_pay', {}).catch(() => ({}));
    if (sub === 'pix') {
      if (!args[1]) return reply('Uso: *!setpagamento pix <chave> [nome]*');
      cur.pix = args[1]; cur.pixNome = args.slice(2).join(' ').slice(0, 60);
    } else if (sub === 'pixcode' || sub === 'cola') {
      if (!args[1]) return reply('Uso: *!setpagamento pixcode <código>*');
      cur.pixCode = args.slice(1).join(' ').slice(0, 500);
    } else if (sub === 'mc' || sub === 'iban') {
      if (!args[1]) return reply('Uso: *!setpagamento mc <iban> [nome]*');
      cur.mcIban = args[1]; cur.mcNome = args.slice(2).join(' ').slice(0, 60);
    } else if (sub === 'express' || sub === 'mcexpress') {
      if (!args[1]) return reply('Uso: *!setpagamento express <número>*');
      cur.mcExpress = args[1];
    } else if (sub === 'limpar' || sub === 'off') {
      for (const k of ['pix', 'pixNome', 'pixCode', 'mcIban', 'mcNome', 'mcExpress']) delete cur[k];
    } else return reply('❌ Usa: *pix*, *pixcode*, *mc*, *express* ou *limpar*.');
    await botConfigCache.set('rent_pay', cur).catch(() => {});
    return reply('✅ Dados de pagamento atualizados.');
  });
};

// ── v7.69: avisos de expiração (3d + 1d + expirou) ──
// Corre a cada 30min (arrancarRental, ligado no boot). Sem schema novo:
// o "já avisei" vive em memória por data de expiração (restart pode
// repetir 1 aviso — inofensivo); expirado desliga-se sozinho (1x natural).
const _expiryWarned = new Set();
function _warnKey(jid, untilIso, tag) { return `${jid}|${untilIso}|${tag}`; }

async function checkExpiries(sock) {
  const out = { warned3: [], warned1: [], expired: [] };
  let groups = [];
  try {
    groups = await GroupSettings.find({ isHosted: true }).lean().catch(() => []);
  } catch { return out; }
  const now = Date.now();
  const D = 86400000;
  for (const g of groups || []) {
    try {
      if (!g?.groupJid || !g?.hostedUntil || g.isHosted === false) continue;
      const untilMs = new Date(g.hostedUntil).getTime();
      if (!Number.isFinite(untilMs)) continue;
      const left = untilMs - now;
      const jid = g.groupJid;
      const untilIso = new Date(untilMs).toISOString();
      const gname = g.groupName || '';
      if (left <= 0) {
        await GroupSettings.findOneAndUpdate({ groupJid: jid }, { isHosted: false }).catch(() => {});
        try { require('../hotCache').forgetGroup(jid); } catch {}
        if (sock) await sock.sendMessage(jid, { text: `🔴 *ALUGUEL EXPIRADO*\n\n${gname ? `🏠 ${gname}\n` : ''}Os comandos voltaram a bloquear.\n\n💎 Reativa com *!alugar* — renovar soma dias novos.` }).catch(() => {});
        try { // v7.79+v7.96: dono avisado com cartão de decisão (renovar/adiar/sair)
          await require('../../aura/auraAvisos').avisarAluguel(sock, config, { jid, gname: gname || '', tag: 'expirado', dias: 0 });
        } catch {}
        out.expired.push(jid);
        continue;
      }
      const days = Math.ceil(left / D);
      const k1 = _warnKey(jid, untilIso, 'd1'), k3 = _warnKey(jid, untilIso, 'd3');
      if (days <= 1 && !_expiryWarned.has(k1)) {
        _expiryWarned.add(k1); _expiryWarned.add(k3); // d1 enviado → d3 nunca mais faz sentido
        if (sock) await sock.sendMessage(jid, { text: `⏰ *ALUGUEL A EXPIRAR*\n\n${gname ? `🏠 ${gname}\n` : ''}⚠️ Resta *menos de 1 dia* (expira ${new Date(untilMs).toLocaleDateString('pt-PT')}).\n\n🔄 Renova com *!alugar* para não ficar sem bot.` }).catch(() => {});
        try { await require('../../aura/auraAvisos').avisarAluguel(sock, config, { jid, gname: gname || '', tag: 'aviso', dias: 1 }); } catch {} // v7.96: dono também recebe (com cartão renovar)
        out.warned1.push(jid);
      } else if (days <= 3 && !_expiryWarned.has(k3) && !_expiryWarned.has(k1)) {
        _expiryWarned.add(k3);
        if (sock) await sock.sendMessage(jid, { text: `⏰ *ALUGUEL A EXPIRAR*\n\n${gname ? `🏠 ${gname}\n` : ''}📅 Restam *${days} dias* (expira ${new Date(untilMs).toLocaleDateString('pt-PT')}).\n\n🔄 Renova com *!alugar* — soma aos dias que restam.` }).catch(() => {});
        try { await require('../../aura/auraAvisos').avisarAluguel(sock, config, { jid, gname: gname || '', tag: 'aviso', dias: days }); } catch {} // v7.96
        out.warned3.push(jid);
      }
    } catch {}
  }
  if (_expiryWarned.size > 2000) _expiryWarned.clear();
  return out;
}

let _rentTimer = null;
function arrancarRental(getSock, intervalMs = 30 * 60 * 1000) {
  if (_rentTimer) return;
  _rentTimer = setInterval(() => {
    try { const sock = getSock?.(); if (sock) checkExpiries(sock).catch(() => {}); } catch {}
  }, intervalMs);
  _rentTimer.unref?.();
  console.log('🏠 Watcher de aluguel activo — avisos de expiração');
}
function pararRental() { if (_rentTimer) { clearInterval(_rentTimer); _rentTimer = null; } }

// v7.67: exports p/ gate (commandHandler) e testes.
module.exports.GATE_ALLOW = GATE_ALLOW;
module.exports.gateAllows = gateAllows;
module.exports.RENTAL_PLANS = RENTAL_PLANS;
module.exports.getPrices = getPrices;
module.exports.precoTxt = precoTxt;
module.exports.mkPedidoRef = mkPedidoRef;
module.exports.findPedido = findPedido;
module.exports.savePedido = savePedido;
module.exports.isSubDono = isSubDono;
module.exports._pedidos = _pedidos;
module.exports.buildPedidoOrder = buildPedidoOrder;
module.exports.getOrderThumb = getOrderThumb;
module.exports.checkExpiries = checkExpiries;
module.exports.arrancarRental = arrancarRental;
module.exports.pararRental = pararRental;
