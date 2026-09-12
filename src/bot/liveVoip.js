/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║   DARK BOT — AURA VOZ REAL (RTP)                              ║
 * ║                                                               ║
 * ║   Chamada de VOZ 1:1 com áudio REAL de SAÍDA, via            ║
 * ║   baileys-caller (pilha WASM VoIP oficial do WhatsApp Web).   ║
 * ║                                                               ║
 * ║   ✅ A AURA FALA de verdade (TTS → Opus → RTP)                ║
 * ║   ✅ A AURA OUVE de verdade (RTP → PCM 16 kHz → transcrição)  ║
 * ║   ✅ Emparelha por QR **ou PAIR CODE** (3.º aparelho)         ║
 * ║   ✅ Sessão persistida no MongoDB (sobrevive a deploys)       ║
 * ║   ❌ Atender ENTRADA não existe em nenhuma lib Baileys        ║
 * ║   ❌ Vídeo  ❌ Grupo                                          ║
 * ║                                                               ║
 * ║   Sessão PRÓPRIA em data/auth-voip — nunca toca nas creds    ║
 * ║   do bot principal (senão o WhatsApp dá 440 e os dois caem).  ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */
'use strict';

const fs = require('fs');
const path = require('path');

const AUTH_DIR = path.join(__dirname, '..', '..', 'data', 'auth-voip');
const TMP_DIR = path.join(__dirname, '..', '..', 'data', 'voip-tmp');
const MONGO_PREFIX = 'voip:fs:';

let _client = null;
let _VoipClient = null;
let _estado = 'off';
let _ultimoErro = '';
let _chamada = null;
let _conexao = null;   // Promise da ligação em curso (evita 2 connects em paralelo)
let _qr = null;        // último QR capturado (para o dashboard)
let _pairCode = null;  // último pair code gerado (para o dashboard)
let _pairSocket = null;
let _watcher = null;
let _saveTimer = null;

/* ══════════════════════════ Estado ══════════════════════════ */

function temSessao() {
  try {
    return fs.existsSync(path.join(AUTH_DIR, 'creds.json'));
  } catch { return false; }
}

function getStatus() {
  return {
    motor: 'baileys-caller',
    disponivel: _voipDisponivel,
    estado: _estado,
    sessao: temSessao() || _sessaoNoMongo,
    chamadaActiva: !!_chamada,
    qr: _qr,
    pairingCode: _pairCode,
    ultimoErro: _ultimoErro,
    limites: { inbound: false, video: false, grupo: false, outboundVoz: true },
  };
}

let _voipDisponivel = null;
let _sessaoNoMongo = false;
async function disponivel() {
  // v7.19: nunca cola um "false" para sempre — se a 1.ª tentativa falhou
  // (módulo a carregar, disco), a próxima volta a tentar.
  try {
    await _carregarCliente();
    _voipDisponivel = true;
    return true;
  } catch (e) {
    _voipDisponivel = false;
    _ultimoErro = 'baileys-caller não instalado (npm run setup:voip)';
    return false;
  }
}

/* ══════════════════════════ ffmpeg + logger ══════════════════════════ */

function _ffmpegNoPath() {
  try {
    const ff = require('ffmpeg-static');
    if (ff && fs.existsSync(ff)) {
      const dir = path.dirname(ff);
      const sep = process.platform === 'win32' ? ';' : ':';
      if (!String(process.env.PATH || '').split(sep).includes(dir)) {
        process.env.PATH = dir + sep + (process.env.PATH || '');
      }
    }
  } catch {}
}

function _silentLogger() {
  return {
    level: 'silent',
    child: () => _silentLogger(),
    trace: () => {}, debug: () => {}, info: () => {},
    warn: () => {}, error: () => {}, fatal: () => {},
  };
}

/* ══════════════════════════ Cliente ══════════════════════════ */

async function _carregarCliente() {
  if (_VoipClient) return _VoipClient;
  const mod = await import('baileys-caller');
  const VoipClient = mod.VoipClient || mod.default?.VoipClient;
  if (!VoipClient) throw new Error('VoipClient em falta no baileys-caller');
  _VoipClient = VoipClient;
  return VoipClient;
}

/**
 * O baileys-caller imprime o QR via qrcode-terminal (import dinâmico).
 * O Node partilha o cache entre require() e import() para módulos CJS,
 * por isso patchar o .generate aqui captura o QR e deixa-o chegar ao
 * dashboard — e continua a imprimir no log como fallback.
 *
 * v7.19: o QR cru (string "2@...") não serve de src de <img>. O dashboard
 * precisa de um data URL — converte-se aqui com o pacote `qrcode` (o mesmo
 * que o bot principal usa). Antes, o QR aparecia no terminal (ASCII) e o
 * dashboard ficava com a imagem partida = "não consigo conectar o VoIP".
 */
function _capturarQr(onQr) {
  try {
    const qrt = require('qrcode-terminal');
    if (!qrt || qrt.__darkbot_patched) return;
    const QRCode = require('qrcode');
    const orig = qrt.generate;
    qrt.generate = function (qrData, opts, cb) {
      // continua a imprimir no terminal (fallback)
      const res = orig.call(this, qrData, opts, cb);
      try {
        QRCode.toDataURL(String(qrData || ''), { width: 420, margin: 2, color: { dark: '#0a0a0a', light: '#ffffff' } })
          .then((url) => {
            _qr = url;
            if (typeof onQr === 'function') onQr(url);
          })
          .catch(() => { _qr = String(qrData || ''); });
      } catch { _qr = String(qrData || ''); }
      return res;
    };
    qrt.__darkbot_patched = true;
  } catch {}
}

/* ══════════════════════════ MongoDB (sessão persistente) ══════════════════════════ */

function _mongoConectado() {
  try {
    const m = require('mongoose');
    return !!(m.connection && m.connection.readyState === 1);
  } catch { return false; }
}

function _listarArquivos(dir) {
  const out = [];
  (function walk(d, rel) {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const abs = path.join(d, e.name);
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) walk(abs, r);
      else out.push(r);
    }
  })(dir, '');
  return out;
}

/** Espelha data/auth-voip → MongoDB (colecção whatsapp_sessions, prefixo voip:fs:). */
async function _salvarNoMongo() {
  if (!_mongoConectado()) return false;
  try {
    const Session = require('../database/models/Session');
    const files = _listarArquivos(AUTH_DIR);
    for (const rel of files) {
      const data = await fs.promises.readFile(path.join(AUTH_DIR, rel));
      await Session.findOneAndUpdate(
        { fileName: MONGO_PREFIX + rel },
        { content: data.toString('base64') },
        { upsert: true }
      );
    }
    _sessaoNoMongo = files.length > 0;
    return true;
  } catch (e) {
    console.warn('[VoIP] guardar sessão no Mongo falhou:', String(e.message || e).slice(0, 120));
    return false;
  }
}

/** Restaura data/auth-voip ← MongoDB (antes de conectar). */
async function _restaurarDoMongo() {
  if (!_mongoConectado()) return false;
  try {
    const Session = require('../database/models/Session');
    const docs = await Session.find({ fileName: new RegExp('^' + MONGO_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).catch(() => []);
    if (!docs.length) return false;
    fs.mkdirSync(AUTH_DIR, { recursive: true });
    for (const d of docs) {
      const rel = String(d.fileName).slice(MONGO_PREFIX.length);
      if (!rel || rel.includes('..') || path.isAbsolute(rel)) continue;
      const abs = path.join(AUTH_DIR, rel);
      try {
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, Buffer.from(d.content, 'base64'));
      } catch {}
    }
    _sessaoNoMongo = true;
    return true;
  } catch (e) {
    console.warn('[VoIP] restaurar sessão do Mongo falhou:', String(e.message || e).slice(0, 120));
    return false;
  }
}

/** Re-guarda no Mongo sempre que os ficheiros de auth mudarem (rotação de chaves). */
function _vigiarDisco() {
  try {
    if (_watcher) return;
    fs.mkdirSync(AUTH_DIR, { recursive: true });
    _watcher = fs.watch(AUTH_DIR, { recursive: true }, () => {
      if (_saveTimer) clearTimeout(_saveTimer);
      _saveTimer = setTimeout(() => { _salvarNoMongo().catch(() => {}); }, 1500);
    });
  } catch {}
}

function _pararVigia() {
  if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null; }
  if (_watcher) { try { _watcher.close(); } catch {} _watcher = null; }
}

/* ══════════════════════════ Conexão (QR) ══════════════════════════ */

async function conectar({ onEstado, onQr } = {}) {
  const notificar = (s, extra = {}) => {
    _estado = s;
    try { if (typeof onEstado === 'function') onEstado(s, extra); } catch {}
  };

  if (_client) {
    notificar(_estado === 'em_chamada' ? 'em_chamada' : 'ligado');
    return _client;
  }
  if (_conexao) return _conexao;

  _conexao = (async () => {
    const VoipClient = await _carregarCliente();
    fs.mkdirSync(AUTH_DIR, { recursive: true });
    _ffmpegNoPath();

    // Render Free tem disco efémero: repõe a sessão a partir do MongoDB
    await _restaurarDoMongo();

    _qr = null;
    _pairCode = null;
    _capturarQr(onQr);

    // 1ª vez: o QR aparece no terminal/logs E no dashboard (data-qr).
    // Se já houver sessão, liga directo sem QR.
    notificar('a_ligar');
    const client = new VoipClient({ authDir: AUTH_DIR });
    await client.connect();
    _client = client;
    _qr = null;
    notificar('ligado');

    // persiste a sessão e fica a vigiar o disco
    await _salvarNoMongo();
    _vigiarDisco();
    return client;
  })().catch((e) => {
    _ultimoErro = String(e?.message || e).slice(0, 160);
    notificar('erro');
    _conexao = null;
    throw e;
  });

  return _conexao;
}

/* ══════════════════════════ Emparelhar por PAIR CODE ══════════════════════════ */

/**
 * Emparelha o 3.º aparelho por PAIR CODE (em vez de QR).
 * Usa @whiskeysockets/baileys v7 directamente para pedir o código,
 * guarda as creds em data/auth-voip e, ao emparelhar, entrega ao
 * baileys-caller (mesma identidade de aparelho, sem re-emparelhar).
 */
async function emparelhar(numero, { onEstado } = {}) {
  const digits = String(numero || '').replace(/\D/g, '');
  if (digits.length < 9) return { ok: false, motivo: 'numero_invalido' };

  const notificar = (s, extra = {}) => {
    _estado = s;
    try { if (typeof onEstado === 'function') onEstado(s, extra); } catch {}
  };

  if (_pairSocket) return { ok: false, motivo: 'ja_em_curso' };
  if (_client) return { ok: false, motivo: 'ja_ligado', detalhe: 'A Voz Real já está ligada. Desliga primeiro.' };

  try {
    const b = await import('@whiskeysockets/baileys');
    fs.mkdirSync(AUTH_DIR, { recursive: true });

    // Render Free: repõe sessão do Mongo para detectar se já está registado
    await _restaurarDoMongo();

    const { state, saveCreds } = await b.useMultiFileAuthState(AUTH_DIR);
    if (state.creds.registered) {
      return {
        ok: false, motivo: 'ja_registado',
        detalhe: 'Já existe uma sessão VoIP. Usa "Desligar Voz Real" e tenta de novo.',
      };
    }

    _qr = null;
    _pairCode = null;
    notificar('a_emparelhar');

    const sock = b.makeWASocket({
      auth: state,
      emitOwnEvents: true,
      logger: _silentLogger(),
    });
    _pairSocket = sock;
    sock.ev.on('creds.update', saveCreds);

    // v7.17: espera o websocket abrir antes de pedir o pair code.
    // requestPairingCode rebenta com "Connection Closed" se o ws ainda
    // não abriu — era o que deixava a Voz Real "sem ligação".
    try {
      await Promise.race([
        sock.waitForSocketOpen(),
        new Promise((_, r) => setTimeout(() => r(new Error('Timeout a abrir ligação')), 30000)),
      ]);
    } catch (e) {
      notificar('falhou', { detalhe: String(e?.message || e) });
      return { ok: false, motivo: 'sem_ligacao', detalhe: String(e?.message || e) };
    }
    // v7.19: deixa o handshake de ruído assentar antes do companion_hello
    // (o exemplo oficial do Baileys espera ~5s; 2s chega e é mais rápido)
    await new Promise(r => setTimeout(r, 2000));

    const code = await sock.requestPairingCode(digits);
    _pairCode = code;
    notificar('codigo', { pairingCode: code });

    // v7.20: depois do pair-success o servidor FECHA a ligação de propósito
    // (emite `isNewLogin` e espera o cliente reiniciar). Antes tratávamos
    // esse close como erro → o VoIP nunca se religava e o telemóvel ficava
    // preso a "a vincular". Agora o isNewLogin É o sinal de sucesso.
    await new Promise((resolve) => {
      let done = false;
      let novoLogin = false;
      const fim = (s, extra) => { if (done) return; done = true; notificar(s, extra); resolve(); };
      sock.ev.on('connection.update', (u) => {
        const d = _decidirEmparelhar(u, novoLogin);
        if (d.r === 'sucesso') {
          if (d.novoLogin) novoLogin = true;
          try { saveCreds(); } catch {}
          fim('emparelhado');
        } else if (d.r === 'erro') {
          _ultimoErro = 'fechou (' + (d.code || '?') + ')';
          fim('erro', { erro: _ultimoErro });
        }
      });
    });

    try { sock.ev.removeAllListeners(); } catch {}
    try { sock.end(); } catch {}
    _pairSocket = null;

    if (_estado === 'emparelhado') {
      await new Promise(r => setTimeout(r, 800));
      await conectar({ onEstado });
      return { ok: true, motivo: 'emparelhado', pairingCode: _pairCode };
    }
    return { ok: false, motivo: 'falhou', detalhe: _ultimoErro };
  } catch (e) {
    _ultimoErro = String(e?.message || e).slice(0, 160);
    try { _pairSocket?.end(); } catch {}
    _pairSocket = null;
    notificar('erro');
    return { ok: false, motivo: 'falhou', detalhe: _ultimoErro };
  }
}

/* ══════════════════════════ Chamada ══════════════════════════ */

/**
 * Liga ao número com áudio REAL.
 * @param {string} numero   número só com dígitos (ex: 244945280380)
 * @param {object} opts
 *   audioPath  — mp3/wav já gravado para tocar (senão usa 'silence')
 *   saudacao   — texto para a AURA FALAR ao atender (TTS → audioPath)
 *   durationMs — desligar sozinha ao fim de N ms
 *   onEstado   — callback(estado, extra)
 *   onEscuta   — callback(wavBuffer, { duracaoMs }) com o que a AURA ouviu
 */
async function ligarAoVivo(numero, opts = {}) {
  const digits = String(numero || '').replace(/\D/g, '');
  if (digits.length < 9) return { ok: false, motivo: 'numero_invalido' };

  if (!temSessao()) {
    return {
      ok: false,
      motivo: 'sem_sessao_voip',
      detalhe: 'Emparelha o 3.º aparelho (QR ou Pair Code) em Conectar → Voz Real',
    };
  }

  const notificar = (s, extra = {}) => {
    _estado = s;
    try { if (typeof opts.onEstado === 'function') opts.onEstado(s, extra); } catch {}
  };

  let client;
  try {
    client = await conectar({ onEstado: opts.onEstado });
  } catch (e) {
    _ultimoErro = String(e?.message || e).slice(0, 160);
    return { ok: false, motivo: 'nao_conectou', detalhe: _ultimoErro };
  }
  if (!client) return { ok: false, motivo: 'nao_instalado', detalhe: _ultimoErro };

  try {
    let audioPath = opts.audioPath || null;
    if (!audioPath && opts.saudacao) {
      try {
        const ai = require('./ai');
        const buf = await ai.speakWithFallback(String(opts.saudacao));
        audioPath = await gravarTtsTemp(buf);
      } catch { audioPath = null; }
    }

    const callOpts = {};
    if (audioPath && fs.existsSync(audioPath)) callOpts.audioSource = audioPath;
    else callOpts.audioSource = 'silence';
    if (Number(opts.durationMs) > 0) callOpts.durationMs = Number(opts.durationMs);

    const call = await client.call(digits, callOpts);
    _chamada = call;

    call.on('ringing', () => notificar('a_tocar'));
    call.on('connected', () => notificar('em_chamada'));
    call.on('ended', () => {
      _chamada = null;
      notificar('ligado');
    });
    call.on('error', (err) => {
      _ultimoErro = String(err?.message || err).slice(0, 120);
      _chamada = null;
      notificar('ligado');
    });

    // AURA a OUVIR: RTP → PCM 16 kHz → WAV → transcrição
    if (typeof opts.onEscuta === 'function') {
      const escuta = _criarEscuta(opts.onEscuta);
      call.on('audio', (pcm) => {
        try { escuta.push(pcm); } catch {}
      });
      call.on('ended', () => { try { escuta.finalizar(); } catch {} });
    }

    notificar('em_chamada');
    return { ok: true, metodo: 'baileys-caller-rtp', callId: call.callId, call };
  } catch (e) {
    _ultimoErro = String(e?.message || e).slice(0, 160);
    notificar('ligado');
    return { ok: false, motivo: 'falhou', detalhe: _ultimoErro };
  }
}

/* ══════════════════════════ Escuta (PCM → WAV) ══════════════════════════ */

function _criarEscuta(onWav, opts = {}) {
  const SAMPLE_RATE = 16000;
  const limiarRms = Number(opts.limiarRms) || 0.006;
  const silencioMs = Number(opts.silencioMs) || 650;
  const maxMs = Number(opts.maxMs) || 8000;
  const minMs = Number(opts.minMs) || 250;

  let chunks = [];
  let totalMs = 0;
  let falaMs = 0;
  let silencio = 0;
  let falando = false;

  function rms(f) {
    let s = 0;
    for (let i = 0; i < f.length; i++) s += f[i] * f[i];
    return Math.sqrt(s / f.length);
  }

  function limpar() {
    chunks = []; totalMs = 0; falaMs = 0; silencio = 0; falando = false;
  }

  function emitir() {
    if (!chunks.length || falaMs < minMs) { limpar(); return; }
    const total = chunks.reduce((n, c) => n + c.length, 0);
    const all = new Float32Array(total);
    let o = 0;
    for (const c of chunks) { all.set(c, o); o += c.length; }
    limpar();
    try {
      onWav(pcmParaWav(all, SAMPLE_RATE), { duracaoMs: Math.round((all.length / SAMPLE_RATE) * 1000) });
    } catch {}
  }

  return {
    push(pcm) {
      if (!pcm || !pcm.length) return;
      const ms = (pcm.length / SAMPLE_RATE) * 1000;
      const nivel = rms(pcm);
      if (nivel >= limiarRms) {
        falando = true;
        silencio = 0;
        chunks.push(pcm);
        totalMs += ms;
        falaMs += ms;
      } else if (falando) {
        chunks.push(pcm);
        totalMs += ms;
        silencio += ms;
        if (silencio >= silencioMs) emitir();
      }
      if (totalMs >= maxMs) emitir();
    },
    finalizar() { emitir(); },
  };
}

function pcmParaWav(samples, sampleRate = 16000) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    let v = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE((v * 32767) | 0, 44 + i * 2);
  }
  return buf;
}

/* ══════════════════════════ Utilitários ══════════════════════════ */

async function gravarTtsTemp(buffer) {
  if (!buffer || buffer.length < 200) return null;
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const p = path.join(TMP_DIR, 'out-' + Date.now() + '.mp3');
  fs.writeFileSync(p, buffer);
  return p;
}

function _encerrar() {
  try { _pairSocket?.end(); } catch {}
  _pairSocket = null;
  try { _chamada?.end(); } catch {}
  _chamada = null;
  try { _client?.disconnect(); } catch {}
  _client = null;
  _conexao = null;
  _qr = null;
  _pairCode = null;
  _pararVigia();
  _estado = 'off';
}

/** Desliga (mantém a sessão — disco + Mongo ficam intactos). */
function desligar() {
  _encerrar();
  _salvarNoMongo().catch(() => {});
}

/**
 * v7.20 — decide o que fazer com um connection.update durante o emparelhamento.
 * O par é: isNewLogin/open = sucesso; close só é erro se ainda não houve
 * isNewLogin (o close pós-pair-success é o "restart" esperado).
 */
function _decidirEmparelhar(u, jaViuNovoLogin) {
  if (u?.isNewLogin) return { r: 'sucesso', novoLogin: true };
  if (u?.connection === 'open') return { r: 'sucesso' };
  if (u?.connection === 'close') {
    return jaViuNovoLogin
      ? { r: 'ignora' }
      : { r: 'erro', code: u.lastDisconnect?.error?.output?.statusCode };
  }
  return { r: 'ignora' };
}

/**
 * v7.20 — desliga o aparelho do WhatsApp (logout de verdade).
 *
 * O VoipClient.disconnect() só faz `sock.end()` — o aparelho ficava
 * para sempre na lista "Aparelhos conectados" do WhatsApp ("não fecha
 * a conexão"). Aqui abre-se uma socket com as creds guardadas e chama-se
 * sock.logout(), que remove o aparelho do servidor.
 */
async function _logoutWhatsApp() {
  try {
    if (!temSessao()) return false;
    const b = await import('@whiskeysockets/baileys');
    const { state } = await b.useMultiFileAuthState(AUTH_DIR);
    if (!state.creds.registered) return false;

    const sock = b.makeWASocket({ auth: state, logger: _silentLogger(), emitOwnEvents: true });

    // v7.20: tudo com tecto rígido — o logout NUNCA pode pendurar a rota
    const abrir = new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('timeout a abrir para logout')), 12000);
      sock.ev.on('connection.update', (u) => {
        if (u.connection === 'open') { clearTimeout(t); resolve(); }
        else if (u.connection === 'close') { clearTimeout(t); reject(new Error('fechou antes do logout')); }
      });
    });
    await Promise.race([abrir, new Promise((_, r) => setTimeout(() => r(new Error('timeout logout')), 15000))]);

    await Promise.race([
      sock.logout(),
      new Promise((_, r) => setTimeout(() => r(new Error('timeout no logout()')), 15000)),
    ]);
    try { sock.ev.removeAllListeners(); } catch {}
    try { sock.end(); } catch {}
    return true;
  } catch (e) {
    console.warn('[VoIP] logout:', String(e?.message || e).slice(0, 100));
    return false;
  }
}

/** Desliga E apaga a sessão (disco + Mongo) — equivale a "reset" do VoIP. */
async function apagarSessao() {
  // v7.20: PRIMEIRO desliga o cliente/pairSocket locais — o logout abre uma
  // socket nova e, com o _client ainda ligado nas mesmas creds, dava 440
  // (conflito) e o logout nunca completava → ficava "processando".
  _encerrar();

  // v7.20: desliga o aparelho no WhatsApp (senão fica lá pendurado).
  // Melhor esforço — se falhar, o reset local segue na mesma.
  await _logoutWhatsApp().catch(() => {});
  _encerrar();
  try { fs.rmSync(AUTH_DIR, { recursive: true, force: true }); } catch {}
  _sessaoNoMongo = false;
  if (_mongoConectado()) {
    try {
      const Session = require('../database/models/Session');
      await Session.deleteMany({ fileName: new RegExp('^' + MONGO_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) });
    } catch {}
  }
}

module.exports = {
  getStatus,
  disponivel,
  temSessao,
  conectar,
  emparelhar,
  ligarAoVivo,
  gravarTtsTemp,
  desligar,
  apagarSessao,
  pcmParaWav,
  _criarEscuta,
  _salvarNoMongo,
  _restaurarDoMongo,
  _capturarQr,
  _decidirEmparelhar,
  _logoutWhatsApp,
  AUTH_DIR,
};
