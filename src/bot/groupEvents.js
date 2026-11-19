/**
 * DARK BOT v11.2.4 — Group Events
 * Welcome/Goodbye + Trial + cartões (nome real, PP nítida, caption limpa, X9 pro)
 */
'use strict';

const config          = require('../config');
const botConfigCache  = require('./botConfigCache');
const GroupSettings   = require('../database/models/GroupSettings');
const changeThemes    = require('./changeThemes');
const { generateWelcomeImage } = require('./welcomeImage');
const participantIdentity = require('./participantIdentity');
const { DEFAULT_WELCOME_TEMPLATE, DEFAULT_GOODBYE_TEMPLATE } = require('../database/groupNoticeDefaults');
const { hasActiveEntitlement } = require('./groupEntitlement');

function fillVars(text, { userName, groupName, botName, ownerName, number, memberCount } = {}) {
  // Sem PN resolvido, {user} usa o nome legível; nunca `@` + dígitos do LID.
  const safeUser = number ? `@${number}` : (userName || 'Membro');
  return String(text || '')
    .replace(/\{user\}/gi,  safeUser)
    .replace(/\{nome\}/gi,  userName  || number || 'Membro')
    .replace(/\{grupo\}/gi, groupName || '')
    .replace(/\{membros\}/gi, String(Number(memberCount) || 0))
    .replace(/\{bot\}/gi,   botName   || 'DARK BOT')
    .replace(/\{dono\}/gi,  ownerName || 'Dark Net')
    .trim();
}

/**
 * Compatibilidade pública para os consumidores antigos deste módulo. A
 * normalização segura vive em participantIdentity e NUNCA extrai telefone de
 * um `@lid`.
 */
function normalizeParticipant(p) {
  return participantIdentity.normalizeParticipant(p);
}

async function resolveParticipant(sock, p, meta) {
  return participantIdentity.resolveParticipant(sock, p, meta);
}

function jidNum(j) {
  return participantIdentity.jidNumber(j);
}

function safeMentionJids(...jids) {
  return jids
    .filter(jid => typeof jid === 'string' && jid && !participantIdentity.isLid(jid))
    .filter((jid, index, all) => all.indexOf(jid) === index);
}

/** True se o texto parece só um número de telefone (não um nome). */
function looksLikePhone(s) {
  const t = String(s || '').trim();
  if (!t) return true;
  const digits = t.replace(/\D/g, '');
  if (digits.length >= 8 && digits.length >= t.replace(/[\s+\-().]/g, '').length * 0.8) return true;
  return false;
}

function prettyName(s) {
  let n = String(s || '').trim();
  if (!n) return '';
  if (n === n.toLowerCase()) n = n.replace(/\b\w/g, c => c.toUpperCase());
  return n.slice(0, 40);
}

/**
 * Resolve o nome legível do membro (nunca o número se houver alternativa).
 * Ordem: notify/name do participant → meta.participants → sock.contacts
 * → GroupMemberActivity → Economy → fallback número.
 */
async function resolveDisplayName(sock, { number, mentionJid, part, meta } = {}) {
  const tryName = (v) => {
    const s = String(v || '').trim();
    if (!s || looksLikePhone(s)) return '';
    return prettyName(s);
  };

  // 1) do objecto do evento
  let n = tryName(part?.notify) || tryName(part?.name) || tryName(part?.raw?.notify) || tryName(part?.raw?.name) || tryName(part?.raw?.verifiedName);
  if (n) return n;

  // 2) meta do grupo (participants Contact)
  try {
    const list = meta?.participants || [];
    const hit = list.find((x) => {
      const ids = [x.id, x.phoneNumber, x.lid, x.jid].filter(Boolean).map(String);
      const nums = ids.map(jidNum).filter(Boolean);
      return (mentionJid && ids.includes(mentionJid))
        || (part?.jid && ids.includes(part.jid))
        || (part?.pnJid && ids.includes(part.pnJid))
        || (number && nums.includes(String(number)));
    });
    n = tryName(hit?.notify) || tryName(hit?.name) || tryName(hit?.verifiedName);
    if (n) return n;
  } catch {}

  // 3) store de contactos Baileys (se existir)
  try {
    const cands = [mentionJid, part?.pnJid, part?.jid, part?.lid, number && `${number}@s.whatsapp.net`].filter(Boolean);
    const maps = [sock?.contacts, sock?.store?.contacts, sock?.contactCache].filter(Boolean);
    for (const map of maps) {
      for (const j of cands) {
        const c = (typeof map.get === 'function' ? map.get(j) : map[j]) || null;
        if (!c) continue;
        n = tryName(c.notify) || tryName(c.name) || tryName(c.verifiedName) || tryName(c.pushName);
        if (n) return n;
      }
    }
  } catch {}

  // 4) actividade recente / economy (DB)
  if (number) {
    try {
      const GMA = require('../database/models/GroupMemberActivity');
      const row = await GMA.findOne({ memberNumber: String(number) }).sort({ lastMessageAt: -1 }).lean().catch(() => null);
      n = tryName(row?.pushName);
      if (n) return n;
    } catch {}
    try {
      const Economy = require('../database/models/Economy');
      const eco = await Economy.findOne({
        $or: [
          { whatsappNumber: String(number) },
          { number: String(number) },
        ],
      }).lean().catch(() => null);
      n = tryName(eco?.name) || tryName(eco?.nickname);
      if (n) return n;
    } catch {}
  }

  // fallback: número (só se não houver nome)
  return String(number || 'Membro');
}

// ── ANTI-BAN: saudação combinada em tempestade de entradas (v9.13) ──
const WEL_JANELA_MS       = Math.max(1, Number(process.env.WEL_JANELA_MS) || 40000);
const WEL_COMBO_DEBOUNCE  = Math.max(1, Number(process.env.WEL_COMBO_DEBOUNCE) || 12000);
const WEL_COMBO_MAX_NOMES = 6;
const _ultimoWel = new Map();   // groupJid → ts do último welcome enviado
const _comboWel  = new Map();   // groupJid → { timer, pessoas:[{jid,num,name}], grupo }

function _comboEncaixa(sock, groupJid, participantJid, number, groupName, displayName) {
  let combo = _comboWel.get(groupJid);
  if (!combo) {
    combo = { timer: null, pessoas: [], grupo: groupName };
    _comboWel.set(groupJid, combo);
  }
  if (!combo.pessoas.some((p) => p.jid === participantJid)) {
    combo.pessoas.push({ jid: participantJid, num: number, name: displayName || number });
  }
  if (!combo.timer) {
    combo.timer = setTimeout(() => { _comboDispara(sock, groupJid).catch(() => {}); }, WEL_COMBO_DEBOUNCE);
    if (combo.timer.unref) combo.timer.unref();
  }
}

async function _comboDispara(sock, groupJid) {
  const combo = _comboWel.get(groupJid);
  _comboWel.delete(groupJid);
  if (!combo || !combo.pessoas.length) return;
  // A janela anti-rajada é assíncrona; revalida o serviço antes de falar.
  const gs = await GroupSettings.findOne({ groupJid }).lean().catch(() => null);
  if (!hasActiveEntitlement(gs)) return;
  const mostrados = combo.pessoas.slice(0, WEL_COMBO_MAX_NOMES);
  const resto = combo.pessoas.length - mostrados.length;
  const nomes = mostrados.map((p) => {
    if (!p.num) return `*${p.name || 'Novo membro'}*`;
    return p.name && !looksLikePhone(p.name) && p.name !== p.num
      ? `*${p.name}* (@${p.num})`
      : `@${p.num}`;
  }).join(', ');
  const nomeBot = config.bot?.name || 'DARK BOT';
  const texto =
    `🎉 *Bem-vindos(as)!*\n\n` +
    `${nomes}${resto > 0 ? ` … e mais ${resto}` : ''}\n` +
    `entraram juntos em *${combo.grupo}*.\n\n` +
    `— ${nomeBot}`;
  _ultimoWel.set(groupJid, Date.now());
  await sock.sendMessage(groupJid, {
    text: texto,
    mentions: safeMentionJids(...mostrados.map((p) => p.jid)),
  }).catch(() => {});
}

async function ownerPv(sock, text) {
  const num = String(config.owner.number || '').replace(/\D/g, '');
  if (!num) return;
  return sock.sendMessage(`${num}@s.whatsapp.net`, { text }).catch(() => {});
}

/** Formata uma pessoa sem vazar identificadores LID em texto. */
function x9Person(identity, fallbackName) {
  const p = typeof identity === 'object' && identity
    ? identity
    : { number: identity, name: fallbackName };
  const number = String(p.number || '').replace(/\D/g, '');
  const name = p.displayName || p.name || p.notify || fallbackName || '';
  const showName = name && !looksLikePhone(name) && String(name) !== number;
  if (number) return showName ? `*${name}*\n@${number}` : `@${number}`;
  return showName ? `*${name}*` : '_Identidade não informada pelo WhatsApp_';
}

/**
 * X9 com sujeito e autor. A assinatura antiga (action, number, nome) continua
 * aceite; a forma nova é `buildX9Text(action, subject, undefined, actor)`.
 */
function buildX9Text(action, subject, displayName, actor) {
  const alvo = typeof subject === 'object' && subject
    ? { ...subject, displayName: subject.displayName || displayName }
    : { number: subject, displayName };
  const executor = actor && typeof actor === 'object' ? actor : null;
  const mesmo = executor && participantIdentity.sameParticipant(alvo, executor);

  let icon = '•';
  let label = String(action || 'Evento do grupo');
  let papelAlvo = 'Pessoa afectada';
  let papelAutor = 'Acção feita por';
  if (action === 'add') {
    icon = '➕'; label = mesmo ? 'Entrada no grupo' : 'Membro adicionado ao grupo';
    papelAlvo = mesmo ? 'Entrou' : 'Entrou';
    papelAutor = 'Adicionado por';
  } else if (action === 'remove') {
    icon = mesmo ? '🚪' : '🚫';
    label = mesmo ? 'Saída voluntária do grupo' : (executor ? 'Membro removido do grupo' : 'Saída ou remoção do grupo');
    papelAlvo = mesmo ? 'Saiu' : (executor ? 'Removido' : 'Participante');
    papelAutor = 'Removido por';
  } else if (action === 'promote') {
    icon = '⬆️'; label = 'Promoção a administrador'; papelAlvo = 'Promovido'; papelAutor = 'Promovido por';
  } else if (action === 'demote') {
    icon = '⬇️'; label = 'Rebaixamento de administrador'; papelAlvo = 'Rebaixado'; papelAutor = 'Rebaixado por';
  }

  let text = `📡 *X9 · actividade*\n${icon} ${label}\n👤 *${papelAlvo}:* ${x9Person(alvo, displayName)}`;
  if (executor && !mesmo) text += `\n🛡️ *${papelAutor}:* ${x9Person(executor)}`;
  else if (!executor && ['remove', 'promote', 'demote'].includes(action)) text += '\n🛡️ *Autor:* _não informado pelo WhatsApp_';
  return text;
}

async function handle(sock, event) {
  try {
    const { id: groupJid, action } = event;
    if (!groupJid?.endsWith('@g.us')) return;

    // O metadata pode trazer o PN já associado ao LID; se não trouxer,
    // resolveParticipant consulta a tabela privada do Signal no socket.
    const rawParts = Array.isArray(event.participants) ? event.participants : [];
    const meta = event._participantMetadata || await sock.groupMetadata(groupJid).catch(() => null);
    const parts = (await Promise.all(rawParts.map(p => resolveParticipant(sock, p, meta)))).filter(Boolean);
    const author = event.authorInfo || await resolveParticipant(sock, event.author, meta);
    if (!parts.length && rawParts.length) {
      console.warn('[GroupEvents] participants ilegíveis:', typeof rawParts[0], JSON.stringify(rawParts[0]).slice(0, 120));
    }

    const botNum  = jidNum(sock.user?.id);
    const botNums = new Set(
      [sock.user?.id, sock.user?.lid, sock.user?.phoneNumber, botNum && (botNum + '@s.whatsapp.net')]
        .filter(Boolean)
        .map(jidNum)
        .filter(Boolean),
    );
    const botIds = new Set([sock.user?.id, sock.user?.lid, sock.user?.phoneNumber].filter(Boolean).map(x => String(x).toLowerCase()));
    const participanteDoBot = (p) => (p?.number && botNums.has(p.number)) ||
      [p?.jid, p?.pnJid, p?.lid, p?.raw?.id, p?.raw?.jid].some((id) => botIds.has(String(id || '').toLowerCase()));
    const botRemoved = action === 'remove' && parts.some(participanteDoBot);
    const groupName = meta?.subject || 'grupo';

    // v12.9.24 CAPTURA PASSIVA: cada movimento num grupo alimenta a base
    // central sozinho (entrada/saída/promoção) — sem apertar botão nenhum.
    try {
      const base = require('./centralBase');
      const slot = String(sock?.user?.id || '').split('@')[0].split(':')[0].replace(/\D/g, '').slice(-2) || '';
      const rotuloSlot = `bot:${slot}`;
      if (botRemoved) {
        // Metadata normalmente já fica inacessível neste ponto; conserva o nome
        // e a proveniência, mas deixa claro no dashboard que esta sessão saiu.
        base.marcarGrupoInativo(groupJid, { nome: groupName });
      } else if (action === 'promote' || action === 'demote') {
        base.capturarGrupo(groupJid, meta, { slot: rotuloSlot });
      } else {
        // add/remove: regista o grupo + os participantes do evento
        const nums = parts.map(p => String(p?.number || '').replace(/\D/g, '')).filter(n => n && n.length >= 7 && !n.includes('-'));
        if (nums.length) base.capturarContactos(nums, groupJid, groupName, { slot: rotuloSlot });
      }
    } catch {}

    // v6.82: feed live do dashboard (página Grupos).
    try {
      require('./liveBroadcaster').groupEvent({
        type: action,
        group: { jid: groupJid, name: groupName },
        participants: parts.map(p => ({ jid: p.jid, number: p.number })),
      });
    } catch (e) {}

    const botAdded = action === 'add' && parts.some(participanteDoBot);
    if (botAdded) {
      try { require('./centralBase').capturarGrupo(groupJid, meta, { fonte: 'bot-adicionado' }); } catch {}
      await onBotAdded(sock, groupJid, groupName, meta);
      return;
    }

    const gs = await GroupSettings.findOne({ groupJid }).lean().catch(() => null);

    // Eventos chegam mesmo em grupos onde o bot foi apenas adicionado. Sem
    // trial/aluguel não há welcome, X9, promoção automática, avisos ou
    // punições. A única chamada mantida é a limpeza da auto-apresentação,
    // para cancelar qualquer timer velho caso o serviço tenha acabado.
    if (!hasActiveEntitlement(gs)) {
      try { await require('./autoApresentar').onParticipantsUpdate(sock, groupJid, parts, action, meta); } catch {}
      return;
    }

    // anti-fobados / auto-apresentação (aceitam string OU objecto)
    let banidosFoba = [];
    if (action === 'add') {
      try { banidosFoba = await require('./antiFoba').onJoin(sock, groupJid, parts, meta) || []; } catch {}
      try { await require('./autoApresentar').onParticipantsUpdate(sock, groupJid, parts, action, meta); } catch {}
    }
    if (action === 'remove') {
      try { await require('./autoApresentar').onParticipantsUpdate(sock, groupJid, parts, action, meta); } catch {}
    }
    const banidosSet = new Set((banidosFoba || []).map(b => {
      if (typeof b === 'string') return b;
      const n = normalizeParticipant(b);
      return n?.jid || n?.pnJid || '';
    }).filter(Boolean));

    for (const p of parts) {
      if (!p.jid && !p.pnJid) continue;
      if (p.number && botNums.has(p.number)) continue;
      const mentionJid = p.pnJid || p.jid;
      const actJid = p.jid || p.pnJid;
      if (banidosSet.has(p.jid) || banidosSet.has(p.pnJid) || banidosSet.has(actJid)) continue;

      const number = p.number || "";
      const displayName = await resolveDisplayName(sock, { number, mentionJid, part: p, meta });

      if (action === 'add') {
        await onJoin(sock, groupJid, mentionJid, number, groupName, gs, meta, displayName);
        // auto-ADM
        try {
          const autos = (gs?.autoAdmins || []).map(n => String(n).replace(/\D/g, ''));
          if (p.number && autos.includes(p.number)) {
            await sock.groupParticipantsUpdate(groupJid, [actJid], 'promote').catch(() => {});
            await sock.sendMessage(groupJid, {
              text: `🤖 Auto-ADM: @${p.number} promovido.`,
              mentions: [mentionJid],
            }).catch(() => {});
          }
        } catch {}
      }
      if (action === 'remove') {
        await onLeave(sock, groupJid, mentionJid, number, groupName, gs, displayName);
      }
      // X9 profissional
      if (gs?.x9 && ['add', 'remove', 'promote', 'demote'].includes(action)) {
        try {
          // `resolveDisplayName` devolve "Membro" como fallback de welcome.
          // No X9, sem PN e sem nome real, é mais honesto dizer que WhatsApp
          // não informou a identidade do que fingir reconhecer a pessoa.
          const x9DisplayName = !number && displayName === 'Membro' ? '' : displayName;
          const subject = { ...p, number, displayName: x9DisplayName };
          const actorName = author ? await resolveDisplayName(sock, {
            number: author.number, mentionJid: author.pnJid || author.jid, part: author, meta,
          }) : '';
          const x9Actor = author ? {
            ...author,
            displayName: !author.number && actorName === 'Membro' ? '' : actorName,
          } : null;
          const mentions = safeMentionJids(...[subject, x9Actor]
            .filter(Boolean)
            .map(person => person.pnJid || person.jid));
          await sock.sendMessage(groupJid, {
            text: buildX9Text(action, subject, displayName, x9Actor),
            mentions,
          }).catch(() => {});
        } catch {}
      }
    }
  } catch (e) {
    console.error('[GroupEvents]', e?.message || e);
  }
}

async function onBotAdded(sock, groupJid, groupName, meta) {
  const trialDays = 7;
  const trialEnd = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);
  let gs = await GroupSettings.findOne({ groupJid }).catch(() => null);
  if (!gs) {
    gs = await GroupSettings.create({
      groupJid,
      groupName,
      isHosted:        false,
      trialExpiresAt:  trialEnd,
      trialUsedAt:     new Date(),
      hostedUntil:     null,
      commandsUsedToday: 0,
      welcome:         false,
      goodbye:         false,
      welcomeEnabled:  false,
      goodbyeEnabled:  false,
      x9:              false,
      botArrivalNotify: false,
    }).catch(() => null);
  } else {
    // Re-adicionar o bot não pode renovar um trial expirado nem criar tempo
    // grátis depois de um aluguel. Só documentos antigos sem qualquer registo
    // de trial recebem a primeira activação.
    const hasTrialHistory = !!gs.trialUsedAt || !!gs.trialExpiresAt;
    if (!gs.isHosted && !hasTrialHistory) {
      gs.trialExpiresAt = trialEnd;
      gs.trialUsedAt = new Date();
    }
    gs.groupName = groupName;
    await gs.save().catch(() => {});
  }

  // Por padrão o bot entra em silêncio. Isso evita que um replay/sincronização
  // de participantes pareça uma nova entrada em todos os grupos.
  if (gs?.botArrivalNotify !== true) return;
  const trialActive = !gs.isHosted && gs.trialExpiresAt && new Date(gs.trialExpiresAt) > new Date();
  // Num re-add sem trial novo não anunciamos uma oferta que já não existe.
  if (!trialActive) return;

  const p = config.bot.prefix;

  const arrival =
    `🕸️ *${config.bot.name}* chegou!\n\n` +
    `╭━━━〔 🎁 *TRIAL GRATUITO* 〕━━━╮\n` +
    `┃ ⏰ *${trialDays} dias* de acesso completo!\n` +
    `┃ 📅 Expira: *${trialEnd.toLocaleDateString('pt-PT')}*\n` +
    `┣━━━━━━━━━━━━━━━━━━━━━━━━━━┫\n` +
    `┃ 📋 *Comandos iniciais:*\n` +
    `┃  • *${p}menubtn* — menu interactivo\n` +
    `┃  • *${p}play* <música> — baixar música\n` +
    `┃  • *${p}ia* <pergunta> — IA com memória\n` +
    `┃  • *${p}alugar* — ver planos de hospedagem\n` +
    `┃  • *${p}ping* — testar o bot\n` +
    `┣━━━━━━━━━━━━━━━━━━━━━━━━━━┫\n` +
    `┃ 💡 Após o trial: *${p}alugar <dias>*\n` +
    `┃ 👑 Suporte: wa.me/${config.owner.number}\n` +
    `╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯`;

  await sock.sendMessage(groupJid, { text: arrival }).catch(() => {});

  // Relatório ao dono também não deve transformar LID interno em telefone.
  const admins = (meta?.participants || [])
    .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
    .map((p) => {
      const ident = normalizeParticipant(p);
      return prettyName(p.notify || p.name || p.verifiedName) || ident?.number || 'Admin';
    }).join(', ');

  await ownerPv(sock,
    `🆕 *Bot adicionado!*\n\n` +
    `📋 Grupo: *${groupName}*\n` +
    `🔑 JID: \`${groupJid}\`\n` +
    `👑 Admins: ${admins || '?'}\n` +
    `🎁 Trial: *${trialDays} dias* activos\n\n` +
    `Para hospedar permanentemente:\n` +
    `*${p}alugar ${groupJid} 30*`
  );
}

async function onJoin(sock, groupJid, participantJid, number, groupName, gs, meta, displayName) {
  if (gs?.welcomeEnabled === false) return;
  const globalOn = await botConfigCache.get('welcome_enabled', false).catch(() => false);
  if (!globalOn) return;

  const memberName = (displayName && !looksLikePhone(displayName)) ? displayName : String(number || 'Membro');

  // v9.13 anti-ban: tempestade de entradas → agrega
  const agora = Date.now();
  if (agora - (_ultimoWel.get(groupJid) || 0) < WEL_JANELA_MS) {
    _comboEncaixa(sock, groupJid, participantJid, number, groupName, memberName);
    return;
  }
  _ultimoWel.set(groupJid, agora);

  const memberCount = (meta?.participants?.length) || 0;

  let themeName = 'dark';
  try {
    const tn = await botConfigCache.get('active_theme', 'dark').catch(() => 'dark');
    const t  = changeThemes.getTheme(tn || 'dark');
    themeName = t?.name || tn || 'dark';
  } catch {}

  // Foto de perfil: só a URL temporária que o WhatsApp já expõe; se a
  // privacidade do membro negar acesso, o cartão usa o avatar com inicial.
  let ppUrl = null;
  try {
    ppUrl = (await require('./visualIdentity').resolveVisualProfile(sock, participantJid, { metadata })).url || null;
  } catch {}

  // Template universal, limpo e seguro. Se não houver PN resolvido,
  // {user} torna-se o nome/fallback, nunca os dígitos de um @lid.
  const template = gs?.customWelcomeMsg || gs?.customWelcome || DEFAULT_WELCOME_TEMPLATE;
  const caption = fillVars(template, {
    userName: memberName, groupName, botName: config.bot.name,
    ownerName: config.owner.name, number, memberCount,
  });
  const mentions = safeMentionJids(participantJid);

  // Media custom do grupo
  const welcomeImg = gs?.welcomeWithMedia;
  if (welcomeImg) {
    try {
      if (String(welcomeImg).startsWith('local:')) {
        const mediaHandler = require('./mediaHandler');
        const buf = await mediaHandler.fetchBuffer(welcomeImg);
        if (buf?.length > 200) {
          await sock.sendMessage(groupJid, {
            image: buf, caption, mentions,
          }).catch(() => {});
          return;
        }
      } else {
        await sock.sendMessage(groupJid, {
          image: { url: welcomeImg }, caption, mentions,
        }).catch(() => {});
        return;
      }
    } catch (e) { console.warn('[Welcome custom media]', e.message); }
  }

  // WELCM3 — GIF
  if (gs?.welcm3) {
    try {
      const wa = require('./welcomeArt');
      const mp4 = await wa.artGif({
        profilePicUrl: ppUrl,
        name: memberName,
        sub1: `Entrou em ${groupName}`.slice(0, 44),
        sub2: `Membro nº ${memberCount}`,
        footer: `${config.bot.name}`,
        kind: 'welcome',
        frames: 12,
      });
      if (mp4?.length > 2048) {
        await sock.sendMessage(groupJid, {
          video: mp4, gifPlayback: true, mimetype: 'video/mp4',
          caption, mentions,
        }).catch(() => {});
        return;
      }
      // Alguns hosts não têm ffmpeg. Nesse caso mantém a arte personalizada
      // como imagem, em vez de perder por completo o welcome configurado.
      const png = await wa.artCard({
        profilePicUrl: ppUrl,
        name: memberName,
        sub1: `Entrou em ${groupName}`.slice(0, 44),
        sub2: `Membro nº ${memberCount}`,
        footer: `${config.bot.name}`,
        kind: 'welcome',
      });
      if (png?.length > 2048) {
        await sock.sendMessage(groupJid, { image: png, caption, mentions }).catch(() => {});
        return;
      }
    } catch (e) { console.warn('[Welcome GIF]', e.message); }
  }

  // WELCOME2 — cartão IA
  if (gs?.welcome2) {
    try {
      const wa = require('./welcomeArt');
      const png = await wa.artCard({
        profilePicUrl: ppUrl,
        name: memberName,
        sub1: `Entrou em ${groupName}`.slice(0, 44),
        sub2: `Membro nº ${memberCount}`,
        footer: `${config.bot.name}`,
        kind: 'welcome',
      });
      if (png?.length > 2048) {
        await sock.sendMessage(groupJid, {
          image: png, caption, mentions,
        }).catch(() => {});
        return;
      }
    } catch (e) { console.warn('[Welcome2 art]', e.message); }
  }

  // Imagem clássica (foto + nome)
  const welcomeImageEnabled = await botConfigCache.get('welcome_image_enabled', true).catch(() => true);

  if (gs?.welcomeWithPhoto !== false && welcomeImageEnabled !== false) {
    try {
      const imgBuf = await generateWelcomeImage({
        profilePicUrl: ppUrl,
        memberName,
        memberNum:     memberCount,
        groupName,
        themeName,
        botName:       config.bot.name,
      });
      if (imgBuf) {
        await sock.sendMessage(groupJid, {
          image: imgBuf, caption, mentions,
        });
        return;
      }
    } catch (e) {
      console.warn('[Welcome Image]', e.message);
    }
  }

  await sock.sendMessage(groupJid, { text: caption, mentions }).catch(() => {});
}

async function onLeave(sock, groupJid, participantJid, number, groupName, gs, displayName) {
  if (gs?.goodbyeEnabled === false) return;
  if (gs?.goodbye === false && gs?.goodbyeEnabled == null) return;
  const globalOn = await botConfigCache.get('welcome_enabled', false).catch(() => false);
  if (!globalOn) return;

  const memberName = (displayName && !looksLikePhone(displayName)) ? displayName : String(number || 'Membro');

  // O template de despedida usa a mesma fonte de identidade segura do
  // welcome. Isto corrige a marcação com LID/falso telefone.
  const template = gs?.customGoodbyeMsg || gs?.customGoodbye || DEFAULT_GOODBYE_TEMPLATE;
  const text = fillVars(template, {
    userName: memberName, groupName, botName: config.bot.name,
    ownerName: config.owner.name, number,
  });
  const mentions = safeMentionJids(participantJid);

  const byeImg = gs?.goodbyeWithMedia;
  if (byeImg) {
    try {
      if (String(byeImg).startsWith('local:')) {
        const mediaHandler = require('./mediaHandler');
        const buf = await mediaHandler.fetchBuffer(byeImg);
        if (buf?.length > 200) {
          await sock.sendMessage(groupJid, {
            image: buf, caption: text, mentions,
          }).catch(() => {});
          return;
        }
      } else {
        await sock.sendMessage(groupJid, {
          image: { url: byeImg }, caption: text, mentions,
        }).catch(() => {});
        return;
      }
    } catch (e) { console.warn('[Goodbye Image]', e.message); }
  }

  await sock.sendMessage(groupJid, { text, mentions }).catch(() => {});
}

module.exports = {
  handle,
  normalizeParticipant,
  resolveParticipant,
  resolveDisplayName,
  buildX9Text,
  _welDebug: { _ultimoWel, _comboWel, WEL_JANELA_MS, WEL_COMBO_DEBOUNCE, _comboEncaixa, _comboDispara },
};
