const express = require('express');
// v6.91: erros async nas rotas (await que lança) matavam o PROCESSO
// inteiro — Express 4 não os passa ao error handler. Este shim faz
// next(err) automaticamente. Sem isto, uma falha async em qualquer
// página do dashboard derrubava bot + site até o Render reiniciar
// ("erro do servidor interno").
require('express-async-errors');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cloudinary = require('cloudinary').v2;

const config = require('./config');
const darkUtils = require('./bot/darkUtils');
const { connectDB } = require('./database/connection');
const User = require('./database/models/User');
const Command = require('./database/models/Command');
const { getBot } = require('./bot/whatsapp');
const scheduler = require('./bot/scheduler');
const botConfigCache = require('./bot/botConfigCache');

// ── v6.67: Inicializa os consoles coloridos do DARK BOT ──────
darkUtils.consoleOnline(`⚡ ${darkUtils.botName} v${darkUtils.botVersion} — ${darkUtils.timed}`);
darkUtils.consoleInfo(`Data: ${darkUtils.data} | Hora: ${darkUtils.hora}`);

const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const apiRoutes = require('./routes/api');

async function ensureOwnerUser() {
  const ownerUsername = config.owner.username;
  if (!ownerUsername || !config.owner.password) {
    console.warn('⚠️  OWNER_USERNAME/OWNER_PASSWORD não definidos; não foi possível sincronizar o dono.');
    return;
  }

  let user = await User.findOne({ username: ownerUsername });
  if (!user) {
    await User.create({
      username: ownerUsername,
      password: config.owner.password,
      name: config.owner.name,
      whatsappNumber: config.owner.number,
      role: 'owner',
      active: true,
    });
    console.log(`👑 Dono criado/sincronizado: ${ownerUsername}`);
    return;
  }

  let changed = false;
  if (user.role !== 'owner') { user.role = 'owner'; changed = true; }
  if (!user.active) { user.active = true; changed = true; }
  if (user.name !== config.owner.name) { user.name = config.owner.name; changed = true; }
  if (user.whatsappNumber !== config.owner.number) { user.whatsappNumber = config.owner.number; changed = true; }

  // Se a senha do Render mudou, sincroniza o hash sem revelar a senha nos logs.
  const passwordMatches = await user.comparePassword(config.owner.password).catch(() => false);
  if (!passwordMatches) {
    user.password = config.owner.password;
    changed = true;
  }

  if (changed) {
    await user.save();
    console.log(`👑 Dono sincronizado: ${ownerUsername}`);
  }
}

async function seedDefaults(conn) {
  if (!conn) return;

  await ensureOwnerUser();

  const count = await Command.countDocuments();
  if (count === 0) {
    await Command.insertMany([
      { name: 'oi', description: 'Saudação', response: '👋 Olá {user}! Eu sou o {bot}.', category: 'geral' },
      { name: 'site', description: 'Site', response: '🌐 Visite nosso site!', category: 'info' },
      { name: 'vip-info', description: 'Info VIP', response: '⭐ Comando VIP {user}!', category: 'premium', accessLevel: 'premium' },
    ]);
    console.log('📚 Comandos seed criados');
  }
}

// ── v6.88: secret de cifra de sessão sempre válido para o kruptein ──────
// O kruptein só aceita secrets "complexos" (≥8 chars, ≥2 maiúsculas,
// ≥2 minúsculas, ≥2 números, ≥2 especiais) — senão lança erro ou TypeError
// dentro do MongoStore e o login falha com "Erro ao guardar sessão".
// Derivação determinística: o prefixo garante todas as classes exigidas
// e o hash sha512 do SESSION_SECRET mantém a unicidade por deploy.
function sessionCryptoSecret(raw) {
  const crypto = require('crypto');
  const hash = crypto.createHash('sha512').update(String(raw || '')).digest('base64');
  return `!!AAzz99${hash}`;
}

async function bootstrap() {
  // Cloudinary
  if (config.cloudinary.cloud_name) {
    cloudinary.config(config.cloudinary);
    console.log('☁️  Cloudinary configurado');
  }

  // MongoDB
  const conn = await connectDB();
  if (config.isProduction && !conn) {
    console.error('❌ MongoDB é obrigatório em produção. Corrija MONGODB_URI no Render e faça novo deploy.');
    console.error('💡 Dica: erro "bad auth" significa username/senha inválidos no MongoDB Atlas ou senha mal copiada/sem URL encode.');
    process.exit(1);
  }
  await seedDefaults(conn);

  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: '*' } });

  // v6.82: liga o live broadcaster ao Socket.IO — o feed live do
  // dashboard (Grupos) recebe user:command / group:event / antilink:action.
  // Antes o módulo existia mas nunca era inicializado nem chamado.
  require('./bot/liveBroadcaster').setIO(io);

  // Render fica atrás de proxy HTTPS. Sem isto, cookies seguros de sessão não persistem.
  app.set('trust proxy', 1);

  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));

  app.use(express.urlencoded({ extended: true, limit: '50mb' }));
  app.use(express.json({ limit: '50mb' }));
  app.use(express.static(path.join(__dirname, 'public')));

  const sessionConfig = {
    name: 'darkbot.sid',
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 * 7,
      httpOnly: true,
      secure: config.isProduction ? 'auto' : false,
      sameSite: 'lax',
    },
  };
  if (conn) {
    sessionConfig.store = MongoStore.create({
      mongoUrl: config.mongodb.uri,
      collectionName: 'web_sessions',
      ttl: 60 * 60 * 24 * 7,
      // v6.88 — fix crítico de login: o kruptein (cifra de sessões do
      // connect-mongo) EXIGE secret com ≥2 maiúsculas, ≥2 minúsculas,
      // ≥2 dígitos e ≥2 caracteres especiais. Um SESSION_SECRET normal
      // (ex.: `openssl rand -hex 32` — só minúsculas/hex, como o render.yaml
      // recomenda) fazia req.session.save() rebentar → "Erro ao guardar
      // sessão" → ninguém conseguia entrar no dashboard. Derivamos um
      // secret determinístico SEMPRE válido; a cifra continua a depender
      // do SESSION_SECRET real do ambiente.
      crypto: { secret: sessionCryptoSecret(config.sessionSecret) },
      touchAfter: 24 * 3600,
    });
  }
  app.use(session(sessionConfig));

  app.use(async (req, res, next) => {
    res.locals.user = req.session.user || null;
    res.locals.bot = config.bot;
    res.locals.owner = {
      name: config.owner.name,
      number: config.owner.number,
      username: config.owner.username,
    };
    res.locals.currentPath = req.path;
    res.locals.siteMeta = {
      title: await botConfigCache.get('site_meta_title', config.bot.name).catch(() => config.bot.name),
      description: await botConfigCache.get('site_meta_description', 'DARK BOT - Bot WhatsApp profissional com Dashboard').catch(() => 'DARK BOT - Bot WhatsApp profissional com Dashboard'),
      keywords: await botConfigCache.get('site_meta_keywords', 'whatsapp, bot, dark bot, automação').catch(() => 'whatsapp, bot, dark bot, automação'),
      image: await botConfigCache.get('site_meta_image', '/img/logo.jpg').catch(() => '/img/logo.jpg'),
    };
    // Compatibilidade com views antigas, sem expor segredos reais do process.env.
    res.locals.process = {
      env: {
        GROQ_API_KEY: config.ai.groqApiKey ? 'configured' : '',
        GEMINI_API_KEY: config.ai.geminiApiKey ? 'configured' : '',
        APP_URL: config.appUrl,
        NODE_ENV: config.nodeEnv,
      },
    };
    next();
  });

  // ── /health — Render liveness + UptimeRobot monitor ──────────────────
  // UptimeRobot deve monitorar esta URL com status 200.
  // Endpoint SEM autenticação, público, resposta rápida.
  app.get('/health', (req, res) => {
    const botStatus = getBot(io).getStatus();
    res.status(200).json({
      status: 'ok',
      bot: botStatus.status,
      voip_calls: (()=>{ try { return require('./bot/callVoip').todas().length; } catch { return 0; } })(),
      db: conn ? 'connected' : 'unavailable',
      uptime: botStatus.uptime || 0,
      messages: botStatus.messageCount || 0,
      commands: botStatus.commandCount || 0,
      ts: Date.now(),
      version: '6.92.0',
    });
  });

  // ── /ping — Keep-alive para UptimeRobot / cron-job.org ───────────────
  // Configure o UptimeRobot para fazer GET em: https://SEU-NOME.onrender.com/ping
  // Intervalo: 5 minutos (evita hibernação do Render Free)
  app.get('/ping', (req, res) => {
    res.status(200).send('OK');
  });

  // ── /status — Página pública de status do bot (sem login) ────────────
  app.get('/status', (req, res) => {
    const botStatus = getBot(io).getStatus();
    const isOnline = botStatus.status === 'connected';
    res.status(200).send(
      `<!DOCTYPE html><html lang="pt"><head><meta charset="utf-8">` +
      `<meta http-equiv="refresh" content="30">` +
      `<title>${config.bot.name} — Status</title>` +
      `<style>body{font-family:monospace;background:#0a0a0a;color:#8B5CF6;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}` +
      `.box{text-align:center;padding:2rem;border:1px solid #8B5CF6;border-radius:12px;max-width:400px}` +
      `h1{margin:0 0 1rem;font-size:1.5rem}.dot{display:inline-block;width:14px;height:14px;border-radius:50%;` +
      `background:${isOnline ? '#22c55e' : '#ef4444'};margin-right:8px;vertical-align:middle}` +
      `.muted{color:#666;font-size:.85rem;margin-top:1rem}</style></head>` +
      `<body><div class="box">` +
      `<h1>🕸️ ${config.bot.name}</h1>` +
      `<p><span class="dot"></span><strong>${isOnline ? 'ONLINE' : 'OFFLINE'}</strong></p>` +
      `<p>Bot: ${botStatus.status} | DB: ${conn ? 'ok' : 'off'}</p>` +
      `<p>Mensagens: ${botStatus.messageCount || 0} | Comandos: ${botStatus.commandCount || 0}</p>` +
      `<p class="muted">Uptime: ${botStatus.uptime || 0}s · Atualiza a cada 30s</p>` +
      `</div></body></html>`
    );
  });

  // ── /diag — Diagnóstico REAL do processo em produção (v6.70) ─────────
  // O Dono reportou 2x que a AURA não responde, mas os testes locais
  // passam todos. Isto mostra o que o processo do Render TEM MESMO
  // em memória: commit, chaves, guardas do fluxo e config da base.
  // Sem isto, estou a adivinhar em vez de diagnosticar.
  app.get('/diag', async (req, res) => {
    const out = { ok: true, hora: new Date().toISOString() };
    try {
      const { execSync } = require('child_process');
      try {
        out.commit = execSync('git rev-parse --short HEAD', { cwd: path.join(__dirname, '..') })
          .toString().trim();
      } catch { out.commit = '(sem git no Render — normal)'; }

      // O código em execução tem as correcções da v6.69?
      const fsx = require('fs');
      const chSrc = fsx.readFileSync(path.join(__dirname, 'bot', 'commandHandler.js'), 'utf8');
      const callSrc = fsx.readFileSync(path.join(__dirname, 'bot', 'callHandler.js'), 'utf8');
      out.correccoes = {
        'v6.69 regex_ri_com_fronteira': chSrc.includes('gargalhada|laugh'),
        'v6.69 trigger_sem_depender_do_modo': chSrc.includes('const auraTriggerActive = isAuraTrigger;'),
        'v6.69 pv_do_dono_sempre': chSrc.includes('(isPv || _auraAwakeHere)'),
        'v6.67 pvDeTodos': chSrc.includes('pvDeTodos'),
        'v6.68 callHandler_ligado': fsx.existsSync(path.join(__dirname, 'bot', 'callHandler.js')),
        'v6.72 unwrap_ephemeral': chSrc.includes('unwrapWhatsAppMessage'),
        'v6.72 pv_media': chSrc.includes('hasIncomingMedia'),
        'v6.72 call_aceitar': callSrc.includes('tentarAceitarChamada'),
        'v6.73 call_baileys_secundario': fsx.existsSync(path.join(__dirname, 'bot', 'callSocket.js')),
        'v6.74 live_voip_opcional': fsx.existsSync(path.join(__dirname, 'bot', 'liveVoip.js')),
      };

      out.bot = {
        nome: config.bot.name,
        prefixo: config.bot.prefix,
        owner: config.owner.number,
        numero: process.env.BOT_NUMBER || '(não definido)',
      };
      out.chaves = {
        groq: !!config.ai?.groqApiKey, gemini: !!config.ai?.geminiApiKey,
        elevenlabs: !!config.ai?.elevenlabsKey, assemblyai: !!config.ai?.assemblyaiKey,
        mongodb: !!process.env.MONGODB_URI,
      };

      const _b = getBot(io);
      const st = _b.getStatus();
      out.whatsapp = { estado: st.status, mensagens: st.messageCount, comandos: st.commandCount, uptime: st.uptime };
      // v6.95: caixa de entrada mascarada — ver /diag para diagnosticar PV
      out.caixa_entrada = Array.isArray(_b.recentInbox) ? _b.recentInbox.slice(-20) : [];

      // Conflito de sessão: duas instâncias com as mesmas credenciais.
      // É a causa nº1 de "online mas não responde a nada".
      out.conflitos_de_sessao = _b._conflitos || 0;
      if (out.conflitos_de_sessao > 0) {
        out.AVISO = 'Há outra instância ligada com as mesmas credenciais (Render + local, ou dois deploys). Fecha as outras.';
      }
      if (st.status === 'connected' && st.uptime > 300 && (st.messageCount || 0) === 0) {
        out.AVISO_SILENCIO = 'Ligado há mais de 5 min sem receber UMA mensagem — sinal de sessão roubada por outra instância.';
      }

      // Última tentativa de chamada real (o que o servidor respondeu ao <offer>)
      try { out.ultima_chamada = require('./bot/realCall').ultimoDiag() || null; } catch { out.ultima_chamada = null; }

      // v6.79 — estado do ciclo automático de chamadas para o Dono
      try { out.auto_call = require('./bot/autoCall').estado(); } catch { out.auto_call = null; }

      // O socket vivo tem mesmo os internos precisos para originar chamada?
      try {
        const _s = _b?.sock;
        out.call_capacidade = _s ? {
          query: typeof _s.query,
          getUSyncDevices: typeof _s.getUSyncDevices,
          assertSessions: typeof _s.assertSessions,
          createParticipantNodes: typeof _s.createParticipantNodes,
          generateMessageTag: typeof _s.generateMessageTag,
          createCallLink: typeof _s.createCallLink,
          suportado: require('./bot/realCall').suportado(_s)
        } : 'sem socket';
      } catch (e) { out.call_capacidade = 'erro: ' + e.message; }

      // As guardas que podem calar a AURA
      const bcc = require('./bot/botConfigCache');
      out.guardas = {
        ai_auto_enabled: await bcc.get('ai_auto_enabled', true),
        bot_interaction_enabled: await bcc.get('bot_interaction_enabled', true),
        disabled_groups: await bcc.get('disabled_groups', []),
        disabled_users: await bcc.get('disabled_users', []),
        owner_lid: await bcc.get('owner_lid', ''),
      };
    } catch (e) {
      out.ok = false; out.erro = e.message;
    }
    res.status(200).json(out);
  });


  // ── v6.71: /test-pv — diagnostico de PV em producao ──────────
  // Simula uma mensagem no PV e diz se a AURA a ve ou nao.
  // v6.92: o commandHandler é carregado aqui (sob demanda) em vez de
  // no topo do bootstrap — evita logs de debug e inicialização pesada
  // durante o arranque do servidor.
  app.get('/test-pv', async (req, res) => {
    const out = { ok: false };
    try {
      // Faz require directo (funciona no Render)
      const _cmdH = require('./bot/commandHandler');
      console.log('[DEBUG] commandHandler.handle:', typeof _cmdH.handle);
      const _cH = require('./bot/caseHandler');
      try { _cH.loadCases(); } catch {}

      const OUT = [];
      const sock = {
        user: { id: (process.env.BOT_NUMBER || '244949926074') + ':1@s.whatsapp.net' },
        sendMessage: async (j, c) => { OUT.push({ j, t: c.text ? String(c.text).slice(0, 60) : (c.audio ? '[audio]' : '[?]') }); return { key: { id: 'x' } }; },
        groupMetadata: async () => ({ participants: [], subject: 'G' }),
        sendPresenceUpdate: async () => {}, readMessages: async () => {}, profilePictureUrl: async () => null,
        createCallLink: async (t) => 'TKN_' + t,
      };
      const msg = { key: { id: 'T1', remoteJid: '244945280380@s.whatsapp.net', fromMe: false }, message: { conversation: 'oi' } };
      const r = await _cmdH.handle(sock, msg);
      const respostasDono = OUT.slice();
      OUT.length = 0;
      const eph = {
        key: { id: 'T2', remoteJid: '244900000111@s.whatsapp.net', fromMe: false },
        message: { ephemeralMessage: { message: { conversation: 'oi aura' } } },
      };
      const rEph = await _cmdH.handle(sock, eph);
      const respostasEph = OUT.slice();
      OUT.length = 0;
      const cmdPv = {
        key: { id: 'T3', remoteJid: '244900000111@s.whatsapp.net', fromMe: false },
        message: { conversation: '.ping' },
      };
      const rCmd = await _cmdH.handle(sock, cmdPv);
      out.ok = true;
      out.handleRetornou = r;
      out.respostas = respostasDono;
      out.totalRespostas = respostasDono.length;
      out.ephemeral = { handle: rEph, respostas: respostasEph.length, sample: respostasEph[0] || null };
      out.comandoPv = { handle: rCmd, respostas: OUT.length, sample: OUT[0] || null };
    } catch (e) {
      out.erro = e.message.slice(0, 200);
      out.stack = (e.stack || '').split('\n').slice(0, 4).join('\n');
    }
    res.json(out);
  });

  app.use('/', authRoutes);
  app.use('/dashboard', dashboardRoutes);
  app.use('/api', apiRoutes(io));

  // ── v6.91: ERROR HANDLER — 500 deixa de ser uma caixa-preta ────────
  // Regra 1: nada de matar o processo por um erro de request.
  // Regra 2: o Dono vê a CAUSA no ecrã (e no painel Consola via
  // bot:log); outros vêem página genérica. /api devolve JSON.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    const causa = String(err?.message || err || 'erro desconhecido');
    const stack = String(err?.stack || '').split('\n').slice(0, 4).join('\n');
    console.error(`💥 500 ${req.method} ${req.originalUrl}: ${causa}\n${stack}`);
    try {
      require('./bot/liveBroadcaster').emit('bot:log', {
        level: 'error',
        message: `💥 500 ${req.method} ${req.originalUrl}: ${causa}`,
      });
    } catch (_) {}
    const dono = req.session?.user?.role === 'owner';
    if (req.path.startsWith('/api/')) {
      return res.status(500).json({
        error: 'Erro interno do servidor',
        rota: req.originalUrl,
        ...(dono ? { causa } : {}),
      });
    }
    res.status(500).render('500', {
      title: 'Erro interno',
      detalhe: dono ? `${causa}\n${stack}` : '',
    });
  });

  app.use((req, res) => res.status(404).render('404', { title: '404' }));

  io.on('connection', (socket) => {
    const bot = getBot(io);
    socket.emit('bot:status', bot.getStatus());
  });

  // Bot - tenta auto-conectar se já tem sessão (MongoDB ou local)
  const bot = getBot(io);

  // v6.92 — o auto-start anterior usava countDocuments({ fileName: { $not: /^call:/ } })
  // com um try/catch vazio. No Render Free, a MongoDB pode ainda estar a
  // aquecer (bufferTimeoutMS de 2 s) e o contador falhava em silêncio —
  // resultado: o processo acordava, o dashboard abria (200), mas o bot
  // ficava "disconnected" para sempre sem QR nem erros. Agora:
  //   1. procuramos o documento EXACTO `creds` (sinal de sessão autenticada);
  //   2. fazemos retry com backoff curto (3 s, 6 s, 12 s) para cold start;
  //   3. todo o erro é logado na consola e no feed bot:log do dashboard.
  async function tentarAutoStart() {
    try {
      if (!conn) return false;
      const Session = require('./database/models/Session');
      // "creds" é o ficheiro que o useMongoAuthState escreve quando a sessão
      // principal está autenticada. As chaves de sinal têm nomes com hífen
      // (app-state-sync-key-…), por isso um filtro genérico $not:/^call:/
      // também as apanhava e mascarava a ausência do creds real.
      const creds = await Session.findOne({ fileName: 'creds' })
        .maxTimeMS(8000)
        .lean();
      if (!creds) {
        console.log('ℹ️  Nenhuma sessão WhatsApp autenticada no Mongo (sem doc "creds"). Use /dashboard/connect.');
        return false;
      }
      console.log('🔄 Sessão WhatsApp encontrada no MongoDB — reconectando...');
      await bot.start({ mode: 'qr' });
      return true;
    } catch (e) {
      console.error('[AutoStart]', e.message);
      try { require('./bot/liveBroadcaster').emit('bot:log', { level: 'error', message: `[AutoStart] ${e.message}` }); } catch (_) {}
      return false;
    }
  }

  if (conn) {
    // Primeira tentativa imediata. Se a MongoDB ainda não estiver pronta
    // (Render Free / cold start), reagendamos com backoff.
    let tentou = await tentarAutoStart();
    let atraso = 3000;
    for (let i = 0; i < 3 && !tentou; i++) {
      await new Promise(r => setTimeout(r, atraso));
      console.log(`[AutoStart] nova tentativa em ${atraso / 1000}s...`);
      tentou = await tentarAutoStart();
      atraso *= 2;
    }

    // v7.44 — Baileys secundário de chamadas REMOVIDO (2.º aparelho a reconectar = sinal de automação).
    // As chamadas usam o socket principal (callVoip).
  } else {
    // Fallback: arquivos locais (desenvolvimento / sem Mongo)
    try {
      const fs = require('fs');
      const authFolder = path.join(__dirname, '..', 'data', 'auth');
      if (fs.existsSync(path.join(authFolder, 'creds.json'))) {
        console.log('🔄 Sessão local encontrada - reconectando...');
        bot.start({ mode: 'qr' }).catch(e => console.error('Auto-start:', e.message));
      }
    } catch (e) {
      console.error('[AutoStart/local]', e.message);
    }
  }

  // Scheduler + Cache refresh
  if (conn) {
    scheduler.start();
    // Carrega o cache de configurações na inicialização
    botConfigCache.refresh().catch(() => {});
    // Refresh automático a cada 5 minutos
    setInterval(() => botConfigCache.refresh().catch(() => {}), 5 * 60 * 1000);

    // v6.80 — varre humores da Aura já expirados. Só toca num Map em
    // memória, fora do caminho das mensagens: custo nulo na resposta.
    setInterval(() => {
      try { require('./aura/auraHuman').limparMoods(); } catch (_) {}
    }, 10 * 60 * 1000).unref?.();

    // v6.81 — agenda da AURA (conselhos, orações, dicas, daily...).
    // Um só timer de 60 s para todas as agendas; quando não há nada
    // vencido devolve logo, e nem toca no MongoDB fora do TTL.
    try {
      require('./aura/auraAgenda').arrancar(() => bot.getSock?.() || bot.sock || null);
    } catch (e) { console.warn('[Agenda]', e.message); }

    // v6.83 — AURA PROATIVA: ela fala quando quer (texto gerado por IA,
    // só nos chats onde está acordada, com ritmo humano e limites).
    try {
      require('./aura/auraProativa').arrancar(() => bot.getSock?.() || bot.sock || null);
      // v7.28: persistência dos perfis de identidade (quem fala em cada grupo)
      try { require('./aura/auraIdentidade').arrancar(); } catch (_) {}
      // v7.30: C∆P — capturas automáticas de redes sociais
      try { const capE = require('./cap/capEngine'); capE.arrancar().then(() => capE.start(() => bot.getSock?.() || bot.sock || null)).catch(e => console.warn('[CAP]', e.message)); } catch (_) {}
    } catch (e) { console.warn('[Proativa]', e.message); }
  }

  server.listen(config.port, () => {
    console.log(`\n${'='.repeat(55)}`);
    console.log(`🕸️  ${config.bot.name} v6 — DARK BOT`);
    console.log(`${'='.repeat(55)}`);
    console.log(`🚀 Servidor:   ${config.appUrl}`);
    console.log(`📊 Dashboard:  ${config.appUrl}/dashboard`);
    console.log(`🔌 Connect:    ${config.appUrl}/dashboard/connect`);
    console.log(`❤️  Status:     ${config.appUrl}/status`);
    console.log(`🏓 UptimePing: ${config.appUrl}/ping  ← Configura no UptimeRobot`);
    console.log(`👑 Dono:       ${config.owner.name} (${config.owner.username})`);
    console.log(`🌍 NODE_ENV:   ${config.nodeEnv}`);
    console.log(`🗄️  MongoDB:    ${conn ? 'conectado ✅' : 'desconectado ⚠️'}`);
    const hasAI = !!(process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY);
    console.log(`🧠 IA:         ${hasAI ? 'configurada ✅' : 'sem chaves ⚠️ — defina GROQ_API_KEY no Render'}`);
    console.log(`${'='.repeat(55)}\n`);
  });
}

bootstrap().catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});

// ── v6.91: rede de segurança do processo ──────────────────────
// Uma promise rejeitada fora de rota (timer, scheduler, agenda) não
// pode derrubar bot + dashboard. Node 20 mata o processo por defeito
// — no Render Free isto era "site вниз" até reiniciar.
process.on('unhandledRejection', (reason) => {
  const msg = `🩹 [unhandledRejection] ${String(reason?.message || reason).slice(0, 200)}`;
  console.error(msg);
  try { require('./bot/liveBroadcaster').emit('bot:log', { level: 'error', message: msg }); } catch (_) {}
});
process.on('uncaughtException', (err) => {
  console.error(`🩹 [uncaughtException] ${String(err?.message || err).slice(0, 200)}\n${String(err?.stack || '').split('\n').slice(1, 3).join('\n')}`);
  try { require('./bot/liveBroadcaster').emit('bot:log', { level: 'error', message: `🩹 uncaughtException: ${String(err?.message || err).slice(0, 120)}` }); } catch (_) {}
});
