/**
 * server.js — Servidor do SIMULADOR (dev/local).
 *
 * Sobe um WhatsApp falso no browser para testar mensagens e chamadas de
 * voz/vídeo contra o código REAL do bot, sem ligar a conta e sem risco de ban.
 *
 * Corre isolado do bot de produção:  npm run sim
 * Usa Mongo em memória se não houver MONGODB_URI.
 */
'use strict';

const path = require('path');
const express = require('express');

const PORT = Number(process.env.SIM_PORT || 4600);

async function arrancarMongo() {
  if (process.env.MONGODB_URI) {
    console.log('[sim] a usar MONGODB_URI do ambiente');
    return null;
  }
  const { MongoMemoryServer } = require('mongodb-memory-server');
  const mem = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mem.getUri() + 'darkbot_sim';
  console.log('[sim] Mongo em memória:', process.env.MONGODB_URI);
  return mem;
}

async function main() {
  await arrancarMongo();

  // valores mínimos para o config não rejeitar
  process.env.NODE_ENV = process.env.NODE_ENV || 'development';
  process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'sim-secret-only-local';
  process.env.OWNER_NUMBER = process.env.OWNER_NUMBER || '244945280380';
  process.env.BOT_NUMBER = process.env.BOT_NUMBER || '244949926074';

  // liga a base de dados (os handlers precisam dela)
  try {
    await require('../database/connection').connectDB();
    console.log('[sim] base de dados ligada');
  } catch (e) {
    console.log('[sim] aviso: BD não ligou —', e.message);
  }

  const sim = require('./simulador');
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(express.static(path.join(__dirname, 'public')));

  const guarda = (fn) => async (req, res) => {
    try {
      const r = await fn(req, res);
      res.json({ ok: true, ...r });
    } catch (e) {
      res.status(500).json({ ok: false, erro: e?.message || String(e) });
    }
  };

  app.post('/api/msg', guarda(async (req) => {
    const { texto, de, grupo, pushName } = req.body || {};
    if (!texto) throw new Error('texto em falta');
    return { r: await sim.enviarMensagem({ texto, de, grupo, pushName }) };
  }));

  app.post('/api/call/in', guarda(async (req) => {
    const { de, isVideo, isGroup } = req.body || {};
    return { r: await sim.chamadaRecebida({ de, isVideo: !!isVideo, isGroup: !!isGroup }) };
  }));

  app.post('/api/call/out', guarda(async (req) => {
    const { para, isVideo, via } = req.body || {};
    return { r: await sim.chamadaSaida({ para, isVideo: !!isVideo, via }) };
  }));

  app.post('/api/reset', guarda(async () => sim.reset()));
  app.get('/api/estado', guarda(async () => ({ estado: sim.estado() })));
  app.get('/api/historico', guarda(async () => ({ historico: sim.historico() })));

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[sim] SIMULADOR pronto em http://0.0.0.0:${PORT}`);
  });
}

main().catch(e => { console.error('[sim] erro fatal:', e); process.exit(1); });
