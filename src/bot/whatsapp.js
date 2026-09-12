/**
 * DARK BOT v5 — WhatsApp Engine
 * @systemzero/baileys como motor principal
 * Reconexão inteligente + keep-alive para Render Free
 */
'use strict';

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers,
  makeCacheableSignalKeyStore,
  delay,
} = require('@systemzero/baileys');

const pino   = require('pino');
const fs     = require('fs');
const path   = require('path');
const QRCode = require('qrcode');
const { useMongoAuthState } = require('./mongoAuthState');
const mongoose = require('mongoose');

const config          = require('../config');
const messageListener = require('./messageListener');
const commandHandler  = require('./commandHandler');
const messageRouter   = require('./messageRouter');
const antispam        = require('./antiSpam');
const antiLink        = require('./antiLink');
const groupEvents     = require('./groupEvents');

const AUTH_FOLDER = path.join(__dirname, '..', '..', 'data', 'auth');
if (!fs.existsSync(AUTH_FOLDER)) fs.mkdirSync(AUTH_FOLDER, { recursive: true });

// ── Keep-alive para Render Free ─────────────────────────────
let _keepAlive = null;
function startKeepAlive(url) {
  if (_keepAlive || !url || url.includes('localhost')) return;
  const lib = url.startsWith('https') ? require('https') : require('http');
  _keepAlive = setInterval(() => {
    lib.get(`${url}/ping`, res => {
      console.log(`🏓 Keep-alive ${res.statusCode}`);
    }).on('error', () => {});
  }, 14 * 60 * 1000); // 14 min
  console.log(`⏰ Keep-alive activo → ${url}`);
}

// ── Backoff de reconexão ─────────────────────────────────────
// v7.44: mais lento — reconectar a cada 3 s depois de um corte do servidor
// parece automação agressiva. Primeira tentativa aos 8 s, tecto 2 min.
const BACKOFF = [8000, 15000, 30000, 60000, 120000];
let _attempt = 0;
const nextDelay = () => BACKOFF[Math.min(_attempt++, BACKOFF.length - 1)];
const resetDelay = () => { _attempt = 0; };

// ── Versão do WhatsApp Web ───────────────────────────────────
// v7.18: o pair code é sensível à versão. WhatsApp rejeita versões
// antigas: a notificação não cai e o código não conecta ("sem ligação").
// Fallback fixo + fetch com cache (o código antigo lia a resposta
// errada — `Array.isArray` — e nunca usava a versão nova).
const WA_VERSION_FALLBACK = [2, 3000, 1043857760];
let _waVersionCache = null;
let _waVersionTs = 0;
async function _resolverWaVersion(log) {
  if (_waVersionCache && Date.now() - _waVersionTs < 6 * 60 * 60 * 1000) return _waVersionCache;
  try {
    const latest = await Promise.race([
      fetchLatestBaileysVersion(),
      new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 4000)),
    ]);
    if (latest && Array.isArray(latest.version) && latest.version.length === 3) {
      _waVersionCache = latest.version;
      _waVersionTs = Date.now();
      return _waVersionCache;
    }
  } catch (e) {
    if (log) log('warn', `Versão WA não verificada (${e?.message?.slice(0, 40)}), uso fallback`);
  }
  return WA_VERSION_FALLBACK;
}

class WhatsAppBot {
  constructor() {
    this.io = null;
    this.sock = null;
    this.qrCode = null;
    this.pairingCode = null;
    this.status = 'disconnected';
    this.mode = 'qr';
    this.user = null;
    this.lastError = null;
    this.startedAt = null;
    this.msgCount = 0;
    this.cmdCount = 0;
    this.recentInbox = []; // v6.95: últimas 20 mensagens (mascaradas) p/ /diag
    this.starting = false;
    this.logs = [];
    this.mongoAuth = null;
    this._reconnectTimer = null;
    this._qrTimer = null;
  }

  setIO(io) { this.io = io; }

  emit(event, data) {
    try { if (this.io) this.io.emit(event, data); } catch {}
  }

  setStatus(s, extra = {}) {
    this.status = s;
    this.emit('bot:status', { status: s, ...extra });
    console.log(`📡 [BOT] ${s}`);
  }

  log(level, msg) {
    const entry = { level, message: msg, time: new Date().toISOString() };
    this.logs.push(entry);
    if (this.logs.length > 100) this.logs.shift();
    console.log(`[${level.toUpperCase()}] ${msg}`);
    this.emit('bot:log', entry);
  }

  async getAuthState() {
    if (mongoose.connection.readyState === 1) {
      try {
        this.mongoAuth = await useMongoAuthState({ prefix: '' });
        this.log('info', '🗄️ Auth: MongoDB (principal)');
        return { state: this.mongoAuth.state, saveCreds: this.mongoAuth.saveCreds };
      } catch (e) {
        this.log('warn', 'MongoAuth falhou: ' + e.message);
      }
    }
    this.log('info', '📁 Auth: arquivos locais');
    return useMultiFileAuthState(AUTH_FOLDER);
  }

  async clearSession() {
    if (mongoose.connection.readyState === 1) {
      try {
        const Session = require('../database/models/Session');
        // Não apaga a sessão do Baileys de chamadas (call:*)
        await Session.deleteMany({ fileName: { $not: /^call:/ } });
      } catch {}
    }
    if (this.mongoAuth) {
      try { await this.mongoAuth.clearSession(); } catch {}
    }
    try { fs.rmSync(AUTH_FOLDER, { recursive: true, force: true }); fs.mkdirSync(AUTH_FOLDER, { recursive: true }); } catch {}
    this.qrCode = null; this.pairingCode = null; this.user = null;
  }

  async closeSocket() {
    if (!this.sock) return;
    try { this.sock.ev.removeAllListeners(); } catch {}
    try { this.sock.end(); } catch {}
    this.sock = null;
    await delay(600);
  }

  _clearTimer() {
    if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null; }
  }

  /**
   * Espera o socket ficar pronto (conectado) ou timeout
   * @param {number} timeoutMs - tempo máximo de espera
   * @returns {Promise<boolean>}
   */
  _waitForSocketReady(timeoutMs = 30000) {
    return this._esperarWsAberto(timeoutMs);
  }

  /**
   * v7.17 — espera o WEBSOCKET abrir (não a conexão completa 'open').
   *
   * O pair code exige isto: requestPairingCode → sendNode →
   * sendRawMessage atira "Connection Closed" se `ws.isOpen` for false.
   * A última alteração ao pair code (da656f1) trocou a espera por um
   * `delay(2000)` cego — no Render free o websocket muitas vezes ainda
   * não abriu aos 2s, o pedido rebentava e o bot ficava "sem ligação".
   *
   * `waitForSocketOpen()` do Baileys devolve quando o ws abre e rejeita
   * se fechar. Esperar por `connection === 'open'` NÃO serve: esse só
   * dispara DEPOIS do emparelhamento terminar (loop infinito).
   */
  _esperarWsAberto(timeoutMs = 30000) {
    const sock = this.sock;
    if (sock?.ws?.isOpen) return Promise.resolve(true);
    if (typeof sock?.waitForSocketOpen === 'function') {
      return Promise.race([
        sock.waitForSocketOpen().then(() => true),
        new Promise((_, r) => setTimeout(() => r(new Error('Timeout a abrir ligação (sem ligação ao WhatsApp)')), timeoutMs)),
      ]);
    }
    // fallback: poll do ws cru
    return new Promise((resolve, reject) => {
      const t0 = Date.now();
      const timer = setInterval(() => {
        const ws = sock?.ws;
        if (ws?.isOpen) { clearInterval(timer); resolve(true); }
        else if (ws?.isClosed || Date.now() - t0 > timeoutMs) {
          clearInterval(timer);
          reject(new Error('Timeout a abrir ligação (sem ligação ao WhatsApp)'));
        }
      }, 400);
    });
  }

  /**
   * v7.18 — espera o SERVIDOR ficar pronto para o pair code.
   *
   * O websocket aberto não chega: o requestPairingCode (companion_hello)
   * só é processado depois de o servidor aceitar o login e pedir o
   * emparelhamento — o que o fork sinaliza com o evento `qr`
   * (resposta `pair-device`). Chamar antes deixa o pedido cair e a
   * notificação nunca chega ao telemóvel.
   */
  _esperarProntoParaPair(timeoutMs = 30000) {
    const sock = this.sock;
    if (!sock) return Promise.reject(new Error('socket ausente'));
    return new Promise((resolve, reject) => {
      let done = false;
      const fim = (err) => {
        if (done) return; done = true;
        clearTimeout(timer);
        try { sock.ev.off('connection.update', onUpd); } catch {}
        err ? reject(err) : resolve(true);
      };
      const timer = setTimeout(() => fim(new Error('Timeout: WhatsApp não respondeu (sem ligação)')), timeoutMs);
      const onUpd = (u) => {
        if (u?.qr) return fim(null);                        // servidor pronto (pair-device)
        if (u?.connection === 'open') return fim(null);     // já emparelhado
        if (u?.connection === 'close') {
          const code = u?.lastDisconnect?.error?.output?.statusCode;
          return fim(new Error(`Ligação fechada antes de emparelhar (${code || '?'})`));
        }
      };
      sock.ev.on('connection.update', onUpd);
      // se o ws já abriu e o servidor já mandou pair-device, resolve já
      if (sock?.ws?.isOpen) {
        // não resolve na hora: o qr/close chega nos próximos ms
      }
    });
  }

  async start({ mode = 'qr', phoneNumber = null, fresh = false } = {}) {
    const cleanMode = mode === 'pair' ? 'pair' : 'qr';

    if (this.status === 'connected' && !fresh) {
      this.setStatus('connected', { user: this.user }); return;
    }
    if (this.starting) {
      this.setStatus(this.status, { qr: this.qrCode, pairingCode: this.pairingCode, user: this.user }); return;
    }

    this._clearTimer();
    this.starting = true;
    this.mode = cleanMode;
    this.qrCode = null; this.pairingCode = null; this.lastError = null;

    try {
      await this.closeSocket();
      if (cleanMode === 'pair' || fresh) {
        await this.clearSession();
        this.log('info', 'Sessão limpa');
      }

      const { state, saveCreds } = await this.getAuthState();

      // Versão estável recomendada (WhatsApp Web fix)
      // v7.18: versão fresca (cache 6h) — versão velha quebra o pair code
      const version = await _resolverWaVersion((l, m) => this.log(l, m));
      this.log('info', `📱 WA Version: [${version.join(', ')}]`);
      const logger = pino({ level: 'silent' });

      this.sock = makeWASocket({
        version, logger,
        printQRInTerminal: false,
        auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
        browser: cleanMode === 'pair' ? Browsers.ubuntu('Chrome') : Browsers.macOS('Safari'),

        // Performance
        markOnlineOnConnect:        false,
        generateHighQualityLinkPreview: false,
        syncFullHistory:            false,
        // v7.27: TRUE — o número do próprio bot é SUBDONO e pode executar
        // comandos a partir do telemóvel ligado. O messageRouter filtra o que
        // é `fromMe` e só deixa passar comandos com prefixo (nunca as
        // respostas do próprio bot), por isso não há loop.
        emitOwnEvents:              true,
        fireInitQueries:            true,

        // Timeouts Render Free
        connectTimeoutMs:           45000,
        keepAliveIntervalMs:        20000,
        retryRequestDelayMs:        500,
        defaultQueryTimeoutMs:      60000,

        // Patch de compatibilidade de botões
        // v5.1: NÃO re-envolve buttonsMessage com viewOnce:true — essas vêm do
        // ButtonV2 (MB.cjs) que já usa o mecanismo próprio (additionalNodes
        // native_flow). Re-envolver quebrava a renderização em clientes novos.
        patchMessageBeforeSending: (msg) => {
          const isMBv2 = msg.buttonsMessage?.viewOnce === true;
          if (isMBv2) return msg;
          if (!(msg.buttonsMessage || msg.templateMessage || msg.listMessage)) return msg;
          return {
            viewOnceMessage: {
              message: { ...msg, messageContextInfo: { deviceListMetadataVersion: 2, deviceListMetadata: {} } },
            },
          };
        },

        getMessage: async (key) => {
          try {
            const { messageCache } = require('./messageListener');
            return messageCache.get(key.id)?.message;
          } catch {}
          return undefined;
        },
      });

      this.setStatus('connecting', { mode: cleanMode });
      // v7.45 — comportamento humano: lido + 'a escrever…/a gravar…' + atraso proporcional antes de cada envio
      try { require('./humanizer').wrap(this.sock); } catch (e) { this.log('warn', 'humanizer: ' + e.message); }
      this.sock.ev.on('creds.update', saveCreds);

      this.sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr && cleanMode === 'qr') {
          try {
            this.qrCode = await QRCode.toDataURL(qr, { width: 420, margin: 2, color: { dark: '#0a0a0a', light: '#ffffff' } });
            this.setStatus('qr', { qr: this.qrCode });
            this.log('info', '📱 QR Code gerado');
            // Auto-renova se não escanear em 55s
            if (this._qrTimer) clearTimeout(this._qrTimer);
            this._qrTimer = setTimeout(() => {
              if (this.status === 'qr') {
                this.starting = false;
                this.start({ mode: 'qr' }).catch(() => {});
              }
            }, 55000);
          } catch (e) { this.log('error', 'QR falhou: ' + e.message); }
        }

        if (connection === 'open') {
          if (this._qrTimer) { clearTimeout(this._qrTimer); this._qrTimer = null; }
          resetDelay();
          this._conflitos = 0;
          this.user = this.sock.user;
          this.startedAt = new Date();
          this.qrCode = null; this.pairingCode = null;
          this.setStatus('connected', { user: this.user });
          this.log('success', `✅ Conectado: ${this.user?.id}`);
          startKeepAlive(config.appUrl);

          // v6.79 — o Dono quer que o telemóvel dele toque assim que o bot
          // arranca, e depois de 5 em 5 min. Pára-se sozinho ao fim de 3
          // falhas seguidas para não parecer spam à Meta.
          try {
            require('./autoCall').arrancar(() => this.sock);
          } catch (e) {
            this.log('warn', 'autoCall: ' + String(e?.message || e).slice(0, 80));
          }
        }

        if (connection === 'close') {
          const code   = lastDisconnect?.error?.output?.statusCode;
          const reason = lastDisconnect?.error?.message || '?';
          const isLoggedOut = code === DisconnectReason.loggedOut || code === 401;

          // ── v6.70: CONFLITO DE SESSÃO (440) ────────────────────
          // Duas instâncias com as MESMAS credenciais (ex.: Render +
          // um `node src/index.js` local, ou dois deploys ao mesmo
          // tempo) roubam a ligação uma à outra em ciclo: cada uma
          // reconecta, derruba a outra, e o WhatsApp acaba por
          // marcar o número. Sintoma para o utilizador: "o bot está
          // online mas não responde a nada".
          // Reconectar já não resolve — só alimenta o ciclo.
          const isConflito = code === DisconnectReason.connectionReplaced ||
                             code === 440 || /conflict|replaced/i.test(reason);

          this.log('warn', `Fechado (${code}): ${reason}`);
          this.setStatus('disconnected', { reason: code, message: reason });
          // v7.44: chamadas VoIP activas morrem com o socket — limpa o estado
          // (senão a próxima ligação acha que ainda está em chamada).
          try { const v = require('./callVoip'); for (const a of v.todas()) v.desligar(this.sock, a.jid).catch(() => {}); } catch {}

          if (isConflito) {
            this._conflitos = (this._conflitos || 0) + 1;
            this.log('error',
              `⚠️ CONFLITO DE SESSÃO (${this._conflitos}x) — outra instância ligou-se ` +
              `com as mesmas credenciais. Fecha as outras (local/segundo deploy).`);
            if (this._conflitos >= 3) {
              this.log('error', '⛔ 3 conflitos seguidos — parei de reconectar para não queimar o número. Reinicia o serviço quando só houver UMA instância.');
              return;
            }
            // recua muito mais devagar do que o backoff normal
            this._reconnectTimer = setTimeout(() => {
              this.starting = false;
              this.start({ mode: 'qr' }).catch(() => {});
            }, 60000);
            return;
          }

          // v7.44: 403 = conta restrita/bloqueada temporariamente pela Meta.
          // Reconectar em ciclo só piora. Espera 15 min e avisa.
          const isRestrito = code === 403 || code === DisconnectReason.forbidden || /forbidden|restrict/i.test(reason);
          if (isRestrito) {
            this.log('error', '⛔ 403 — a conta parece RESTRITA pela Meta. Vou esperar 15 min antes de tentar de novo. Não uses chamadas/broadcast até a restrição sair.');
            this.setStatus('restricted', { reason: code, message: reason });
            try { require('./callVoip').todas().forEach(a => require('./callVoip').desligar(this.sock, a.jid).catch(() => {})); } catch {}
            this._reconnectTimer = setTimeout(() => {
              this.starting = false;
              this.start({ mode: 'qr' }).catch(() => {});
            }, 15 * 60 * 1000);
            return;
          }

          if (isLoggedOut) {
            await this.clearSession();
            this.log('warn', 'Sessão expirada — reconecte manualmente.');
          } else {
            this._conflitos = 0;
            const d = nextDelay();
            this.log('info', `Reconectando em ${d / 1000}s...`);
            this._reconnectTimer = setTimeout(() => {
              this.starting = false;
              this.start({ mode: 'qr' }).catch(() => {});
            }, d);
          }
        }
      });

      // Mensagens: router único, suporta lotes e todos os tipos de payload.
      this.sock.ev.on('messages.upsert', (batch) => {
        messageRouter.process(this, batch).catch((err) => {
          console.error('[MESSAGE_ROUTER]', err?.stack || err?.message || err);
        });
      });

      // Anti-delete
      this.sock.ev.on('messages.update', async (updates) => {
        try {
          const dels = updates.filter(u => u.update?.message === null || u.update?.messageStubType === 1);
          if (dels.length) await messageListener.onDelete(this.sock, dels, this.io);
        } catch {}
      });

      // Grupos
      this.sock.ev.on('group-participants.update', async (event) => {
        try { await groupEvents.handle(this.sock, event); } catch {}
        // v7.42: linha do tempo da AURA (quem entrou/saiu/promoveu, quando)
        try {
          const meta = await this.sock.groupMetadata(event.id).catch(() => null);
          await require('../aura/auraLinhaTempo').doEventoParticipantes(this.sock, event, meta);
        } catch {}
      });
      this.sock.ev.on('groups.update', async (updates) => {
        for (const u of (updates || [])) {
          try { await require('../aura/auraLinhaTempo').doEventoGrupo(u); } catch {}
        }
      });

      // ── v6.68: CHAMADAS — atender, ouvir, falar, responder ───
      // O Baileys NÃO tem WebRTC, por isso não existe stream de áudio
      // bidireccional (o rejectCall é a única primitiva de chamada que
      // a lib expõe). O callHandler faz o mais próximo que funciona a
      // sério: assume a chamada e conversa por notas de voz — ela
      // atende, fala, ouve, entende e responde em áudio.
      this.sock.ev.on('call', async (calls) => {
        // Se o Baileys secundário de chamadas está ligado, ele trata.
        // Evita atender duas vezes (PTT em dobro).
        try {
          const { getCallBot } = require('./callSocket');
          if (getCallBot().isConnected()) {
            this.log('info', '[Call] a cargo do Baileys secundário');
            return;
          }
        } catch {}
        for (const call of calls) {
          try {
            const callHandler = require('./callHandler');
            const ownerNumber = String(config.owner?.number || '').replace(/\D/g, '');
            const ownerJid = ownerNumber ? ownerNumber + '@s.whatsapp.net' : '';
            const r = await callHandler.onCall(this.sock, call, { ownerJid, ownerNumber });
            if (r?.ok && !r.ignorado) {
              this.log('info', `[Call] ${r.modo} — ${String(call.from).split('@')[0]}`);
            }
          } catch (e) {
            console.warn('[Call]', e.message?.slice(0, 80));
          }
        }
      });

      // Pair Code - Chamado imediatamente após criar o socket (não espera conexão)
      if (cleanMode === 'pair') {
        try {
          const clean = String(phoneNumber || '').replace(/\D/g, '');
          if (clean.length < 10) throw new Error('Número inválido (mín. 10 dígitos com DDI)');
          if (this.sock.authState.creds.registered) throw new Error('Sessão activa. Use Reset e tente novamente.');

          this.setStatus('pairing', { phoneNumber: clean });
          this.log('info', `A gerar pair code para ${clean}...`);

          // v7.17: espera o WEBSOCKET abrir antes de pedir o código
          // (não espera a conexão completa — essa só vem após emparelhar)
          await this._esperarWsAberto(30000);

          // O servidor pode não emitir o evento `qr` no modo pair. Não
          // podemos ficar bloqueados 30s à espera dele: o pair code é
          // solicitado pelo próprio requestPairingCode assim que o WS abre.
          // Usamos o evento quando existir, mas seguimos após 5s para
          // evitar o estado "disconnected" sem código no Render.
          await this._esperarProntoParaPair(5000).catch((e) => {
            this.log('warn', `Servidor não enviou sinal pair-device; vou pedir o código: ${e.message}`);
          });

          // Pede o código imediatamente (como na documentação Baileys)
          const code = await Promise.race([
            this.sock.requestPairingCode(clean),
            new Promise((_, r) => setTimeout(() => r(new Error('Timeout ao pedir pair code (30s)')), 30000))
          ]);
          this.pairingCode = code?.match(/.{1,4}/g)?.join('-') || code;

          this.setStatus('pairing', { pairingCode: this.pairingCode, phoneNumber: clean });
          this.log('success', `🔐 Pair Code gerado: ${this.pairingCode}`);
          this.log('info', `Aguarde a notificação no WhatsApp do número ${clean}`);

        } catch (e) {
          this.lastError = e.message;
          this.log('error', 'Pair Code falhou: ' + e.message);
          this.setStatus('disconnected', { error: e.message });
          this.emit('bot:error', { message: e.message });
        }
      }

      this.starting = false;
    } catch (e) {
      this.starting = false;
      this.lastError = e.message;
      this.setStatus('disconnected', { error: e.message });
      this.emit('bot:error', { message: e.message });
      console.error('[BOT START]', e.message);
      throw e;
    }
  }

  async logout() {
    this._clearTimer();
    try { if (this.sock) await this.sock.logout(); } catch {}
    await this.clearSession();
    await this.closeSocket();
    this.user = null; this.qrCode = null; this.pairingCode = null;
    this.setStatus('disconnected');
    this.log('info', '🔌 Desconectado');
  }

  getStatus() {
    return {
      status:       this.status,
      mode:         this.mode,
      qr:           this.qrCode,
      pairingCode:  this.pairingCode,
      user:         this.user,
      startedAt:    this.startedAt,
      messageCount: this.msgCount,
      commandCount: this.cmdCount,
      lastError:    this.lastError,
      recentLogs:   this.logs.slice(-30),
      uptime:       this.startedAt ? Math.floor((Date.now() - this.startedAt.getTime()) / 1000) : 0,
    };
  }
}

let _instance = null;
function getBot(io) {
  if (!_instance) _instance = new WhatsAppBot();
  if (io) _instance.setIO(io);
  return _instance;
}

module.exports = { getBot, WhatsAppBot };
