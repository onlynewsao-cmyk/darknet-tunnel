/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║   DARK BOT v6.73 — Baileys SECUNDÁRIO (só chamadas)          ║
 * ║                                                               ║
 * ║   Segundo aparelho ligado no MESMO número.                    ║
 * ║   Sessão isolada (call:creds) — NÃO usa as creds do bot       ║
 * ║   principal, senão o WhatsApp dá 440 e os dois caem.          ║
 * ║                                                               ║
 * ║   Este socket:                                                ║
 * ║   • recebe o evento 'call' e atende                           ║
 * ║   • ouve notas de voz só durante uma chamada activa           ║
 * ║   • NÃO processa .menu / AURA / grupos (evita eco)            ║
 * ╚═══════════════════════════════════════════════════════════════╝
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

const pino = require('pino');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const mongoose = require('mongoose');
const { useMongoAuthState } = require('./mongoAuthState');
const config = require('../config');
const commandHandler = require('./commandHandler');

const AUTH_FOLDER = path.join(__dirname, '..', '..', 'data', 'auth-call');
if (!fs.existsSync(AUTH_FOLDER)) fs.mkdirSync(AUTH_FOLDER, { recursive: true });

const BACKOFF = [3000, 6000, 12000, 24000, 48000];

// v7.18: versão fresca — versão velha quebra o pair code (notificação não cai)
const WA_VERSION_FALLBACK = [2, 3000, 1043857760];
let _waVersionCache = null;
let _waVersionTs = 0;
async function _resolverWaVersion() {
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
  } catch { /* usa fallback */ }
  return WA_VERSION_FALLBACK;
}

class CallBaileys {
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
    this.starting = false;
    this.logs = [];
    this.mongoAuth = null;
    this._reconnectTimer = null;
    this._qrTimer = null;
    this._attempt = 0;
    this._conflitos = 0;
    this.callCount = 0;
  }

  setIO(io) { this.io = io; }

  emit(event, data) {
    try { if (this.io) this.io.emit(event, data); } catch {}
  }

  setStatus(s, extra = {}) {
    this.status = s;
    this.emit('callbot:status', { status: s, ...extra, role: 'calls' });
    console.log(`📞 [CALLBOT] ${s}`);
  }

  log(level, msg) {
    const entry = { level, message: msg, time: new Date().toISOString() };
    this.logs.push(entry);
    if (this.logs.length > 80) this.logs.shift();
    console.log(`[CALLBOT ${level.toUpperCase()}] ${msg}`);
    this.emit('callbot:log', entry);
  }

  async getAuthState() {
    if (mongoose.connection.readyState === 1) {
      try {
        this.mongoAuth = await useMongoAuthState({ prefix: 'call' });
        this.log('info', '🗄️ Auth chamadas: MongoDB (call:*)');
        return { state: this.mongoAuth.state, saveCreds: this.mongoAuth.saveCreds };
      } catch (e) {
        this.log('warn', 'MongoAuth call falhou: ' + e.message);
      }
    }
    this.log('info', '📁 Auth chamadas: arquivos locais');
    return useMultiFileAuthState(AUTH_FOLDER);
  }

  async clearSession() {
    if (this.mongoAuth) {
      try { await this.mongoAuth.clearSession(); } catch {}
    } else if (mongoose.connection.readyState === 1) {
      try {
        const Session = require('../database/models/Session');
        await Session.deleteMany({ fileName: /^call:/ });
      } catch {}
    }
    try {
      fs.rmSync(AUTH_FOLDER, { recursive: true, force: true });
      fs.mkdirSync(AUTH_FOLDER, { recursive: true });
    } catch {}
    this.qrCode = null;
    this.pairingCode = null;
    this.user = null;
  }

  async closeSocket() {
    if (!this.sock) return;
    try { this.sock.ev.removeAllListeners(); } catch {}
    try { this.sock.end(); } catch {}
    this.sock = null;
    await delay(400);
  }

  _clearTimer() {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  }

  async start({ mode = 'qr', phoneNumber = null, fresh = false } = {}) {
    const cleanMode = mode === 'pair' ? 'pair' : 'qr';

    if (this.status === 'connected' && !fresh) {
      this.setStatus('connected', { user: this.user });
      return;
    }
    if (this.starting) {
      this.setStatus(this.status, { qr: this.qrCode, pairingCode: this.pairingCode, user: this.user });
      return;
    }

    this._clearTimer();
    this.starting = true;
    this.mode = cleanMode;
    this.qrCode = null;
    this.pairingCode = null;
    this.lastError = null;

    try {
      await this.closeSocket();
      if (cleanMode === 'pair' || fresh) {
        await this.clearSession();
        this.log('info', 'Sessão de chamadas limpa');
      }

      const { state, saveCreds } = await this.getAuthState();
      const version = await _resolverWaVersion();
      this.log('info', `📱 WA Version (calls): [${version.join(', ')}]`);
      const logger = pino({ level: 'silent' });

      this.sock = makeWASocket({
        version,
        logger,
        printQRInTerminal: false,
        auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
        // Fingerprint diferente do bot principal → o WhatsApp vê 2 aparelhos
        browser: cleanMode === 'pair' ? Browsers.windows('Chrome') : Browsers.ubuntu('Firefox'),
        markOnlineOnConnect: false,
        generateHighQualityLinkPreview: false,
        syncFullHistory: false,
        emitOwnEvents: false,
        fireInitQueries: true,
        connectTimeoutMs: 45000,
        keepAliveIntervalMs: 20000,
        retryRequestDelayMs: 500,
        defaultQueryTimeoutMs: 60000,
      });

      this.setStatus('connecting', { mode: cleanMode });
      this.sock.ev.on('creds.update', saveCreds);

      this.sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr && cleanMode === 'qr') {
          try {
            this.qrCode = await QRCode.toDataURL(qr, {
              width: 420, margin: 2,
              color: { dark: '#0a0a0a', light: '#ffffff' },
            });
            this.setStatus('qr', { qr: this.qrCode });
            this.log('info', '📱 QR do Baileys de CHAMADAS gerado');
            if (this._qrTimer) clearTimeout(this._qrTimer);
            this._qrTimer = setTimeout(() => {
              if (this.status === 'qr') {
                this.starting = false;
                this.start({ mode: 'qr' }).catch(() => {});
              }
            }, 55000);
          } catch (e) {
            this.log('error', 'QR call falhou: ' + e.message);
          }
        }

        if (connection === 'open') {
          if (this._qrTimer) { clearTimeout(this._qrTimer); this._qrTimer = null; }
          this._attempt = 0;
          this._conflitos = 0;
          this.user = this.sock.user;
          this.startedAt = new Date();
          this.qrCode = null;
          this.pairingCode = null;
          this.setStatus('connected', { user: this.user });
          this.log('success', `✅ Call-Baileys ligado: ${this.user?.id}`);
        }

        if (connection === 'close') {
          const code = lastDisconnect?.error?.output?.statusCode;
          const reason = lastDisconnect?.error?.message || '?';
          const isLoggedOut = code === DisconnectReason.loggedOut || code === 401;
          const isConflito = code === DisconnectReason.connectionReplaced ||
            code === 440 || /conflict|replaced/i.test(reason);

          this.log('warn', `Call-Baileys fechado (${code}): ${reason}`);
          this.setStatus('disconnected', { reason: code, message: reason });

          if (isConflito) {
            this._conflitos += 1;
            this.log('error', `⚠️ Conflito na sessão de CHAMADAS (${this._conflitos}x). Não uses as mesmas creds do bot principal.`);
            if (this._conflitos >= 3) return;
            this._reconnectTimer = setTimeout(() => {
              this.starting = false;
              this.start({ mode: 'qr' }).catch(() => {});
            }, 60000);
            return;
          }

          if (isLoggedOut) {
            await this.clearSession();
            this.log('warn', 'Sessão de chamadas expirada — reconecta no dashboard.');
          } else {
            this._conflitos = 0;
            const d = BACKOFF[Math.min(this._attempt++, BACKOFF.length - 1)];
            this.log('info', `Reconectando call-bot em ${d / 1000}s...`);
            this._reconnectTimer = setTimeout(() => {
              this.starting = false;
              this.start({ mode: 'qr' }).catch(() => {});
            }, d);
          }
        }
      });

      // ÚNICO trabalho deste socket: chamadas
      this.sock.ev.on('call', async (calls) => {
        for (const call of calls) {
          try {
            const callHandler = require('./callHandler');
            const ownerNumber = String(config.owner?.number || '').replace(/\D/g, '');
            const ownerJid = ownerNumber ? ownerNumber + '@s.whatsapp.net' : '';
            const r = await callHandler.onCall(this.sock, call, { ownerJid, ownerNumber });
            if (r?.ok && !r.ignorado) {
              this.callCount += 1;
              this.log('info', `[CallBot] ${r.modo} — ${String(call.from).split('@')[0]}`);
            }
          } catch (e) {
            this.log('warn', '[CallBot] ' + String(e.message || e).slice(0, 80));
          }
        }
      });

      // Durante uma chamada activa, as notas de voz vêm para ESTE aparelho.
      this.sock.ev.on('messages.upsert', async (m) => {
        try {
          let msg = m.messages?.[0];
          if (!msg?.message || msg.key.fromMe) return;
          if (typeof commandHandler.normalizeIncomingMsg === 'function') {
            msg = commandHandler.normalizeIncomingMsg(msg);
          }
          const jid = msg.key.remoteJid || '';
          if (jid.endsWith('@g.us')) return;
          const audio = msg.message.audioMessage;
          if (!audio) return;
          const callHandler = require('./callHandler');
          if (!callHandler.chamadaActiva(jid)) return;
          const { downloadMediaMessage } = require('@systemzero/baileys');
          const buf = await downloadMediaMessage(msg, 'buffer', {}).catch(() => null);
          if (!buf || buf.length < 100) return;
          await callHandler.continuarConversa(this.sock, jid, buf, {
            pushName: msg.pushName || '',
          });
        } catch (e) {
          console.warn('[CallBot msg]', e.message?.slice(0, 60));
        }
      });

      if (cleanMode === 'pair') {
        try {
          const clean = String(phoneNumber || '').replace(/\D/g, '');
          if (clean.length < 10) throw new Error('Número inválido (mín. 10 dígitos com DDI)');
          if (this.sock.authState.creds.registered) {
            throw new Error('Sessão de chamadas activa. Usa Reset e tenta outra vez.');
          }
          this.setStatus('pairing', { phoneNumber: clean });
          this.log('info', `A gerar pair code de CHAMADAS para ${clean}...`);
          // v7.17: espera o websocket abrir (requestPairingCode rebenta
          // com "Connection Closed" se chamado antes — deixava "sem ligação")
          await this._esperarWsAberto(30000);
          // v7.18: espera o servidor aceitar o login antes do companion_hello
          await this._esperarProntoParaPair(30000);
          const code = await Promise.race([
            this.sock.requestPairingCode(clean),
            new Promise((_, r) => setTimeout(() => r(new Error('Timeout pair code (30s)')), 30000)),
          ]);
          this.pairingCode = code?.match(/.{1,4}/g)?.join('-') || code;
          this.setStatus('pairing', { pairingCode: this.pairingCode, phoneNumber: clean });
          this.log('success', `🔐 Pair Code CHAMADAS: ${this.pairingCode}`);
        } catch (e) {
          this.lastError = e.message;
          this.log('error', 'Pair Code call falhou: ' + e.message);
          this.setStatus('disconnected', { error: e.message });
          this.emit('callbot:error', { message: e.message });
        }
      }

      this.starting = false;
    } catch (e) {
      this.starting = false;
      this.lastError = e.message;
      this.setStatus('disconnected', { error: e.message });
      this.emit('callbot:error', { message: e.message });
      throw e;
    }
  }

  async logout() {
    this._clearTimer();
    try { if (this.sock) await this.sock.logout(); } catch {}
    await this.clearSession();
    await this.closeSocket();
    this.user = null;
    this.qrCode = null;
    this.pairingCode = null;
    this.setStatus('disconnected');
    this.log('info', '🔌 Call-Baileys desligado');
  }

  /**
   * v7.17 — espera o WEBSOCKET abrir (não a conexão completa 'open').
   * requestPairingCode → sendNode → sendRawMessage atira "Connection
   * Closed" se `ws.isOpen` for false; esperar por `connection === 'open'`
   * não serve porque esse só dispara DEPOIS do emparelhamento terminar.
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
   * v7.18 — espera o SERVIDOR aceitar o login (evento qr/pair-device).
   * Sem isto o companion_hello cai e a notificação do pair code não chega.
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
        if (u?.qr) return fim(null);
        if (u?.connection === 'open') return fim(null);
        if (u?.connection === 'close') {
          const code = u?.lastDisconnect?.error?.output?.statusCode;
          return fim(new Error(`Ligação fechada antes de emparelhar (${code || '?'})`));
        }
      };
      sock.ev.on('connection.update', onUpd);
    });
  }

  isConnected() {
    return this.status === 'connected' && !!this.sock;
  }

  getStatus() {
    return {
      role: 'calls',
      status: this.status,
      mode: this.mode,
      qr: this.qrCode,
      pairingCode: this.pairingCode,
      user: this.user,
      startedAt: this.startedAt,
      callCount: this.callCount,
      lastError: this.lastError,
      recentLogs: this.logs.slice(-30),
      uptime: this.startedAt ? Math.floor((Date.now() - this.startedAt.getTime()) / 1000) : 0,
    };
  }
}

let _instance = null;
function getCallBot(io) {
  if (!_instance) _instance = new CallBaileys();
  if (io) _instance.setIO(io);
  return _instance;
}

module.exports = { getCallBot, CallBaileys };
