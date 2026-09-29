/**
 * v12.9.11 — BASE CENTRAL DE CONTACTOS 🕸️
 * Contactos capturados dos grupos (sem duplicados) + grupos conhecidos.
 * Persistência: data/central/base.json + espelho em BotConfig
 * (o dashboard lê a mesma base — ambos os lados actualizados).
 */
'use strict';
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data', 'central');
const BASE_FILE = path.join(DATA_DIR, 'base.json');

const state = { grupos: {}, contactos: {}, UpdatedAt: 0 };
let _loaded = false;

function carregar() {
  if (_loaded) return state;
  _loaded = true;
  try {
    if (fs.existsSync(BASE_FILE)) Object.assign(state, JSON.parse(fs.readFileSync(BASE_FILE, 'utf8')));
  } catch (e) { console.warn('[CENTRAL] base corrompida, a recomeçar:', e.message); }
  return state;
}

// ═══ v12.9.36 — ESCALA 1M+ ═══════════════════════════════════
// JSON.stringify de 1M contactos ≈ 500MB numa string → rebenta. A base
// passa a persistir no MONGODB (bulkWrite dos SÓ os alterados, em lotes);
// o ficheiro JSON fica como fallback apenas para bases pequenas (<150k).
let _modoMongo = false;
const _dirty = new Set();           // nums alterados desde o último flush
let _flushT = null;
let _avisoFile = false;
function _marcarSujo(num) { _dirty.add(num); }

async function _flushMongo() {
  clearTimeout(_flushT); _flushT = null;
  if (!_modoMongo || !_dirty.size) return;
  const CC = require('../database/models/CentralContacto');
  const nums = [..._dirty]; _dirty.clear();
  const ops = [];
  for (const num of nums) {
    const c = state.contactos[num];
    if (!c) { ops.push({ deleteOne: { filter: { num } } }); continue; }
    ops.push({ updateOne: { filter: { num }, update: { $set: { num, nome: c.nome || '', jid: c.jid || '', grupos: c.grupos || {}, slots: c.slots || {}, ddi: c.ddd?.ddi || '?', pais: c.ddd?.pais || 'Desconhecido', ddd: c.ddd?.ddd || '-', addedAt: c.addedAt || 0, ts: c.ts || 0 } }, upsert: true } });
  }
  for (let i = 0; i < ops.length; i += 500) {
    try { await CC.bulkWrite(ops.slice(i, i + 500), { ordered: false }); }
    catch (e) {
      console.warn('[CENTRAL] flush mongo:', String(e.message).slice(0, 60));
      // v12.9.40: mongo falhou → NÃO perder a base: salva no FICHEIRO
      if (_modoMongo && Object.keys(state.contactos).length <= 150000) {
        _modoMongo = false;
        try {
          fs.mkdirSync(DATA_DIR, { recursive: true });
          fs.writeFileSync(BASE_FILE + '.tmp', JSON.stringify(state));
          fs.renameSync(BASE_FILE + '.tmp', BASE_FILE);
          console.warn('[CENTRAL] mongo indisponível — base salva no FICHEIRO (' + Object.keys(state.contactos).length + ')');
        } catch (e2) { console.warn('[CENTRAL] fallback ficheiro:', e2.message); }
      }
    }
  }
}

// ═══ v12.9.40: CAPTURADOS → USUÁRIOS DO BOT ═══
// os números capturados entram TAMBÉM na colecção User (whatsappNumber +
// autoCreated) — o registo que o bot consulta em TODA mensagem. Fila com
// flush em lotes de 500 (nunca bloqueia a captura); senha = 1 hash único
// intrasponível (estes usuários entram pelo WhatsApp, não pelo dashboard).
const _usersFila = new Map();     // num → nome
const _usersFeitos = new Set();   // já sincronizados nesta vida do processo
let _usersT = null;
let _HASH_USERS = null;
function _senhaHash() {
  if (!_HASH_USERS) {
    try { _HASH_USERS = require('bcryptjs').hashSync('dk-' + require('crypto').randomBytes(24).toString('hex'), 8); }
    catch { _HASH_USERS = '$2a$08$DARKUSERSsemloginsemloginsemloginsssssss'; }
  }
  return _HASH_USERS;
}
function _sincronizarUsuarios() {
  clearTimeout(_usersT); _usersT = null;
  if (!_modoMongo || !_usersFila.size) return Promise.resolve();
  const User = require('../database/models/User');
  const entra = [..._usersFila.entries()]; _usersFila.clear();
  const ops = [];
  for (const [num, nome] of entra) {
    if (_usersFeitos.has(num)) continue;
    _usersFeitos.add(num);
    ops.push({ updateOne: { filter: { username: num.toLowerCase() }, update: { $setOnInsert: { username: num.toLowerCase(), whatsappNumber: num, password: _senhaHash(), name: String(nome || '').slice(0, 60), role: 'free', active: true, autoCreated: true } }, upsert: true } });
  }
  if (!ops.length) return Promise.resolve();
  return (async () => {
    for (let i = 0; i < ops.length; i += 500) {
      try { await User.bulkWrite(ops.slice(i, i + 500), { ordered: false }); }
      catch (e) { console.warn('[CENTRAL] sync usuários:', String(e.message).slice(0, 60)); }
    }
  })();
}
function _filaUsuarios(pares) {
  if (!_modoMongo || !pares || !pares.length) return;
  for (const [num, nome] of pares) if (!_usersFeitos.has(num) && !_usersFila.has(num)) _usersFila.set(num, nome || '');
  if (_usersFila.size && !_usersT) _usersT = setTimeout(() => { _sincronizarUsuarios().catch(() => {}); }, 4000);
}
async function sincronizarUsuarios() {
  if (_usersT) { clearTimeout(_usersT); _usersT = null; }
  await _sincronizarUsuarios();
}
function usuariosNaFila() { return _usersFila.size; }

function guardar() {
  state.UpdatedAt = Date.now();
  if (_modoMongo) {
    // lotes de 500 dos alterados — nunca serializa a base inteira
    if (!_flushT) _flushT = setTimeout(() => { _flushT = null; _flushMongo().catch(() => {}); }, 2000);
    return;
  }
  if (Object.keys(state.contactos).length > 150000) {
    if (!_avisoFile) { _avisoFile = true; console.warn('[CENTRAL] base >150k e sem mongo — file save ignorado (protecção RAM). Liga o MongoDB.'); }
    return;
  }
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(BASE_FILE + '.tmp', JSON.stringify(state));
    fs.renameSync(BASE_FILE + '.tmp', BASE_FILE);   // v12.9.34: atómica — base grande nunca corrompida a meio
  } catch (e) { console.warn('[CENTRAL] save:', e.message); }
  clearTimeout(_t);
  _t = setTimeout(() => {
    try { require('../database/models/BotConfig').set('central_base', { contactos: state.contactos, grupos: state.grupos, UpdatedAt: state.UpdatedAt }).catch(() => {}); } catch {}
  }, 600);
}
let _t = null;

// arranque (chamado do index.js depois do connectDB): carrega TODOS os
// contactos do mongo por CURSOR (streaming — sem string gigante)
async function carregarMongo() {
  try {
    const mongoose = require('mongoose');
    if (mongoose.connection?.readyState !== 1) return false;
    const CC = require('../database/models/CentralContacto');
    const total = await CC.countDocuments();
    if (!total) { _modoMongo = true; return true; }
    const cursor = CC.find({}).lean().cursor();
    let n = 0;
    for (let doc = await cursor.next(); doc; doc = await cursor.next()) {
      state.contactos[doc.num] = { nome: doc.nome || '', jid: doc.jid || doc.num + '@s.whatsapp.net', grupos: doc.grupos || {}, slots: doc.slots || {}, addedAt: doc.addedAt || 0, ts: doc.ts || 0, ddd: { ddi: doc.ddi || '?', pais: doc.pais || 'Desconhecido', ddd: doc.ddd || '-', rotulo: ('+' + (doc.ddi || '?') + ' ' + (doc.ddd || '')).trim() } };
      n++;
    }
    _modoMongo = true; _loaded = true;
    console.log('[CENTRAL] base do MONGODB: ' + n + ' contactos (escala 1M+ ok)');
    return true;
  } catch (e) { console.warn('[CENTRAL] carregarMongo:', String(e.message).slice(0, 60)); return false; }
}
function modoMongo() { return _modoMongo; }

// ── v12.9.23 — DDD & PAÍS 🌍 ────────────────────────────────
// O "DDD" internacional = país + código de área. Tabela dos códigos
// mais comuns na base (Angola, Brasil, Portugal, etc.).
// v12.9.36: 66 países REAIS (ddi correctos; 3-dígitos primeiro — o matching é startsWith)
// Ordinais importam: nunca pôr '1' antes de '124…' etc. '35' genérico REMOVIDO (era falso).
// v12.9.39 — TABELA MUNDIAL REAL (206 DDIs / 245 países), gerada a partir da metadata
// do libphonenumber-js (a mesma base dos selectores de país p/ enviar SMS):
// DDI correcto por país + primeiros dígitos MÓVEIS reais (94=Sri Lanka, 234 Nigéria 7/8/9…)
const PAISES = [
{ ddi: '211', pais: 'Sudão do Sul', ddds: { '9': 'Móvel' }, },
  { ddi: '212', pais: 'Marrocos/Saara Ocidental', ddds: { '6': 'Móvel', '7': 'Móvel' }, },
  { ddi: '213', pais: 'Argélia', ddds: { '5': 'Móvel', '6': 'Móvel' }, },
  { ddi: '216', pais: 'Tunísia', ddds: { '2': 'Móvel', '4': 'Móvel', '5': 'Móvel', '9': 'Móvel' }, },
  { ddi: '218', pais: 'Líbia', ddds: { '9': 'Móvel' }, },
  { ddi: '220', pais: 'Gâmbia', ddds: { '2': 'Móvel', '3': 'Móvel', '4': 'Móvel', '5': 'Móvel', '6': 'Móvel', '7': 'Móvel', '9': 'Móvel' }, },
  { ddi: '221', pais: 'Senegal', ddds: { '7': 'Móvel' }, },
  { ddi: '222', pais: 'Mauritânia', ddds: { '2': 'Móvel', '3': 'Móvel', '4': 'Móvel' }, },
  { ddi: '223', pais: 'Mali', ddds: { '6': 'Móvel', '7': 'Móvel', '8': 'Móvel', '9': 'Móvel' }, },
  { ddi: '224', pais: 'Guiné', ddds: { '6': 'Móvel' }, },
  { ddi: '225', pais: 'Costa do Marfim', ddds: { '0': 'Móvel' }, },
  { ddi: '226', pais: 'Burquina Faso', ddds: { '5': 'Móvel', '6': 'Móvel', '7': 'Móvel' }, },
  { ddi: '227', pais: 'Níger', ddds: { '2': 'Móvel', '8': 'Móvel', '9': 'Móvel' }, },
  { ddi: '228', pais: 'Togo', ddds: { '7': 'Móvel', '9': 'Móvel' }, },
  { ddi: '229', pais: 'Benin', ddds: { '0': 'Móvel' }, },
  { ddi: '230', pais: 'Maurício', ddds: { '5': 'Móvel' }, },
  { ddi: '231', pais: 'Libéria', ddds: { '7': 'Móvel' }, },
  { ddi: '232', pais: 'Serra Leoa', ddds: { '2': 'Móvel', '3': 'Móvel', '7': 'Móvel' }, },
  { ddi: '233', pais: 'Gana', ddds: { '2': 'Móvel', '5': 'Móvel' }, },
  { ddi: '234', pais: 'Nigéria', ddds: { '7': 'Móvel', '8': 'Móvel', '9': 'Móvel' }, },
  { ddi: '235', pais: 'Chade', ddds: { '6': 'Móvel', '9': 'Móvel' }, },
  { ddi: '236', pais: 'República Centro-Africana', ddds: { '7': 'Móvel' }, },
  { ddi: '237', pais: 'Camarões', ddds: { '6': 'Móvel' }, },
  { ddi: '238', pais: 'Cabo Verde', ddds: { '5': 'Móvel', '9': 'Móvel' }, },
  { ddi: '239', pais: 'São Tomé e Príncipe', ddds: { '9': 'Móvel' }, },
  { ddi: '240', pais: 'Guiné Equatorial', ddds: { '2': 'Móvel' }, },
  { ddi: '241', pais: 'Gabão', ddds: { '0': 'Móvel', '6': 'Móvel', '7': 'Móvel' }, },
  { ddi: '242', pais: 'República do Congo', ddds: { '0': 'Móvel' }, },
  { ddi: '243', pais: 'Congo - Kinshasa', ddds: { '8': 'Móvel', '9': 'Móvel' }, },
  { ddi: '244', pais: 'Angola', ddds: { '9': 'Móvel' }, },
  { ddi: '245', pais: 'Guiné-Bissau', ddds: { '9': 'Móvel' }, },
  { ddi: '246', pais: 'Território Britânico do Oceano Índico', ddds: { '3': 'Móvel' }, },
  { ddi: '247', pais: 'Ilha de Ascensão', ddds: { '2': 'Móvel', '3': 'Móvel', '4': 'Móvel', '7': 'Móvel' }, },
  { ddi: '248', pais: 'Seicheles', ddds: { '2': 'Móvel' }, },
  { ddi: '249', pais: 'Sudão', ddds: { '1': 'Móvel', '9': 'Móvel' }, },
  { ddi: '250', pais: 'Ruanda', ddds: { '7': 'Móvel' }, },
  { ddi: '251', pais: 'Etiópia', ddds: { '7': 'Móvel', '8': 'Móvel', '9': 'Móvel' }, },
  { ddi: '252', pais: 'Somália', ddds: { '6': 'Móvel', '7': 'Móvel' }, },
  { ddi: '253', pais: 'Djibuti', ddds: { '7': 'Móvel' }, },
  { ddi: '254', pais: 'Quênia', ddds: { '1': 'Móvel', '7': 'Móvel' }, },
  { ddi: '255', pais: 'Tanzânia', ddds: { '6': 'Móvel', '7': 'Móvel' }, },
  { ddi: '256', pais: 'Uganda', ddds: { '7': 'Móvel' }, },
  { ddi: '257', pais: 'Burundi', ddds: { '2': 'Móvel', '6': 'Móvel', '7': 'Móvel' }, },
  { ddi: '258', pais: 'Moçambique', ddds: { '8': 'Móvel' }, },
  { ddi: '260', pais: 'Zâmbia', ddds: { '5': 'Móvel', '7': 'Móvel', '9': 'Móvel' }, },
  { ddi: '261', pais: 'Madagascar', ddds: { '3': 'Móvel' }, },
  { ddi: '262', pais: 'Reunião/Mayotte', ddds: { '6': 'Móvel' }, },
  { ddi: '263', pais: 'Zimbábue', ddds: { '7': 'Móvel' }, },
  { ddi: '264', pais: 'Namíbia', ddds: { '8': 'Móvel' }, },
  { ddi: '265', pais: 'Malaui', ddds: { '8': 'Móvel', '9': 'Móvel' }, },
  { ddi: '266', pais: 'Lesoto', ddds: { '5': 'Móvel', '6': 'Móvel' }, },
  { ddi: '267', pais: 'Botsuana', ddds: { '7': 'Móvel' }, },
  { ddi: '268', pais: 'Essuatíni', ddds: { '7': 'Móvel' }, },
  { ddi: '269', pais: 'Comores', ddds: { '3': 'Móvel', '4': 'Móvel' }, },
  { ddi: '290', pais: 'Santa Helena/Tristão da Cunha', ddds: { '5': 'Móvel', '6': 'Móvel' }, },
  { ddi: '291', pais: 'Eritreia', ddds: { '7': 'Móvel' }, },
  { ddi: '297', pais: 'Aruba', ddds: { '5': 'Móvel', '6': 'Móvel' }, },
  { ddi: '298', pais: 'Ilhas Faroé', ddds: { '2': 'Móvel', '5': 'Móvel', '7': 'Móvel', '9': 'Móvel' }, },
  { ddi: '299', pais: 'Groenlândia', ddds: { '2': 'Móvel', '4': 'Móvel', '5': 'Móvel' }, },
  { ddi: '350', pais: 'Gibraltar', ddds: { '5': 'Móvel' }, },
  { ddi: '351', pais: 'Portugal', ddds: { '9': 'Móvel' }, },
  { ddi: '352', pais: 'Luxemburgo', ddds: { '6': 'Móvel' }, },
  { ddi: '353', pais: 'Irlanda', ddds: { '8': 'Móvel' }, },
  { ddi: '354', pais: 'Islândia', ddds: { '6': 'Móvel' }, },
  { ddi: '355', pais: 'Albânia', ddds: { '6': 'Móvel' }, },
  { ddi: '356', pais: 'Malta', ddds: { '9': 'Móvel' }, },
  { ddi: '357', pais: 'Chipre', ddds: { '9': 'Móvel' }, },
  { ddi: '358', pais: 'Finlândia/Ilhas Aland', ddds: { '4': 'Móvel' }, },
  { ddi: '359', pais: 'Bulgária', ddds: { '4': 'Móvel' }, },
  { ddi: '370', pais: 'Lituânia', ddds: { '6': 'Móvel' }, },
  { ddi: '371', pais: 'Letônia', ddds: { '2': 'Móvel' }, },
  { ddi: '372', pais: 'Estônia', ddds: { '5': 'Móvel', '8': 'Móvel' }, },
  { ddi: '373', pais: 'Moldávia', ddds: { '6': 'Móvel' }, },
  { ddi: '374', pais: 'Armênia', ddds: { '7': 'Móvel', '9': 'Móvel' }, },
  { ddi: '375', pais: 'Bielorrússia', ddds: { '2': 'Móvel' }, },
  { ddi: '376', pais: 'Andorra', ddds: { '3': 'Móvel', '5': 'Móvel', '6': 'Móvel' }, },
  { ddi: '377', pais: 'Mônaco', ddds: { '6': 'Móvel', '7': 'Móvel' }, },
  { ddi: '378', pais: 'San Marino', ddds: { '6': 'Móvel' }, },
  { ddi: '380', pais: 'Ucrânia', ddds: { '5': 'Móvel' }, },
  { ddi: '381', pais: 'Sérvia', ddds: { '6': 'Móvel' }, },
  { ddi: '382', pais: 'Montenegro', ddds: { '6': 'Móvel' }, },
  { ddi: '383', pais: 'Kosovo', ddds: { '4': 'Móvel' }, },
  { ddi: '385', pais: 'Croácia', ddds: { '9': 'Móvel' }, },
  { ddi: '386', pais: 'Eslovênia', ddds: { '3': 'Móvel', '4': 'Móvel', '5': 'Móvel', '7': 'Móvel' }, },
  { ddi: '387', pais: 'Bósnia e Herzegovina', ddds: { '6': 'Móvel' }, },
  { ddi: '389', pais: 'Macedônia do Norte', ddds: { '7': 'Móvel' }, },
  { ddi: '420', pais: 'Tchéquia', ddds: { '6': 'Móvel' }, },
  { ddi: '421', pais: 'Eslováquia', ddds: { '9': 'Móvel' }, },
  { ddi: '423', pais: 'Liechtenstein', ddds: { '6': 'Móvel' }, },
  { ddi: '500', pais: 'Ilhas Malvinas', ddds: { '5': 'Móvel', '6': 'Móvel' }, },
  { ddi: '501', pais: 'Belize', ddds: { '6': 'Móvel' }, },
  { ddi: '502', pais: 'Guatemala', ddds: { '3': 'Móvel', '4': 'Móvel', '5': 'Móvel' }, },
  { ddi: '503', pais: 'El Salvador', ddds: { '5': 'Móvel', '6': 'Móvel', '7': 'Móvel' }, },
  { ddi: '504', pais: 'Honduras', ddds: { '3': 'Móvel', '7': 'Móvel', '8': 'Móvel', '9': 'Móvel' }, },
  { ddi: '505', pais: 'Nicarágua', ddds: { '8': 'Móvel' }, },
  { ddi: '506', pais: 'Costa Rica', ddds: { '6': 'Móvel', '7': 'Móvel', '8': 'Móvel' }, },
  { ddi: '507', pais: 'Panamá', ddds: { '6': 'Móvel' }, },
  { ddi: '508', pais: 'São Pedro e Miquelão', ddds: { '5': 'Móvel' }, },
  { ddi: '509', pais: 'Haiti', ddds: { '3': 'Móvel', '4': 'Móvel' }, },
  { ddi: '590', pais: 'Guadalupe/São Bartolomeu', ddds: { '6': 'Móvel' }, },
  { ddi: '591', pais: 'Bolívia', ddds: { '6': 'Móvel', '7': 'Móvel' }, },
  { ddi: '592', pais: 'Guiana', ddds: { '6': 'Móvel', '7': 'Móvel' }, },
  { ddi: '593', pais: 'Equador', ddds: { '9': 'Móvel' }, },
  { ddi: '594', pais: 'Guiana Francesa', ddds: { '6': 'Móvel' }, },
  { ddi: '595', pais: 'Paraguai', ddds: { '9': 'Móvel' }, },
  { ddi: '596', pais: 'Martinica', ddds: { '6': 'Móvel' }, },
  { ddi: '597', pais: 'Suriname', ddds: { '7': 'Móvel', '8': 'Móvel' }, },
  { ddi: '598', pais: 'Uruguai', ddds: { '9': 'Móvel' }, },
  { ddi: '599', pais: 'Curaçao/Países Baixos Caribenhos', ddds: { '9': 'Móvel' }, },
  { ddi: '670', pais: 'Timor-Leste', ddds: { '7': 'Móvel' }, },
  { ddi: '672', pais: 'Ilha Norfolk', ddds: { '3': 'Móvel' }, },
  { ddi: '673', pais: 'Brunei', ddds: { '7': 'Móvel', '8': 'Móvel' }, },
  { ddi: '674', pais: 'Nauru', ddds: { '5': 'Móvel', '8': 'Móvel' }, },
  { ddi: '675', pais: 'Papua-Nova Guiné', ddds: { '7': 'Móvel' }, },
  { ddi: '676', pais: 'Tonga', ddds: { '7': 'Móvel', '8': 'Móvel' }, },
  { ddi: '677', pais: 'Ilhas Salomão', ddds: { '7': 'Móvel', '8': 'Móvel', '9': 'Móvel' }, },
  { ddi: '678', pais: 'Vanuatu', ddds: { '5': 'Móvel', '8': 'Móvel' }, },
  { ddi: '679', pais: 'Fiji', ddds: { '2': 'Móvel', '5': 'Móvel', '7': 'Móvel', '8': 'Móvel', '9': 'Móvel' }, },
  { ddi: '680', pais: 'Palau', ddds: { '6': 'Móvel' }, },
  { ddi: '681', pais: 'Wallis e Futuna', ddds: { '8': 'Móvel' }, },
  { ddi: '682', pais: 'Ilhas Cook', ddds: { '5': 'Móvel', '7': 'Móvel', '8': 'Móvel' }, },
  { ddi: '683', pais: 'Niue', ddds: { '8': 'Móvel' }, },
  { ddi: '685', pais: 'Samoa', ddds: { '7': 'Móvel' }, },
  { ddi: '686', pais: 'Quiribati', ddds: { '6': 'Móvel', '7': 'Móvel' }, },
  { ddi: '687', pais: 'Nova Caledônia', ddds: { '5': 'Móvel', '7': 'Móvel', '8': 'Móvel', '9': 'Móvel' }, },
  { ddi: '688', pais: 'Tuvalu', ddds: { '9': 'Móvel' }, },
  { ddi: '689', pais: 'Polinésia Francesa', ddds: { '8': 'Móvel' }, },
  { ddi: '690', pais: 'Tokelau', ddds: { '7': 'Móvel' }, },
  { ddi: '691', pais: 'Micronésia', },
  { ddi: '692', pais: 'Ilhas Marshall', ddds: { '2': 'Móvel' }, },
  { ddi: '850', pais: 'Coreia do Norte', ddds: { '1': 'Móvel' }, },
  { ddi: '852', pais: 'Hong Kong, RAE da China', ddds: { '5': 'Móvel', '6': 'Móvel', '9': 'Móvel' }, },
  { ddi: '853', pais: 'Macau, RAE da China', ddds: { '6': 'Móvel' }, },
  { ddi: '855', pais: 'Camboja', ddds: { '1': 'Móvel', '6': 'Móvel', '8': 'Móvel', '9': 'Móvel' }, },
  { ddi: '856', pais: 'Laos', ddds: { '2': 'Móvel', '3': 'Móvel' }, },
  { ddi: '880', pais: 'Bangladesh', ddds: { '1': 'Móvel' }, },
  { ddi: '886', pais: 'Taiwan', ddds: { '9': 'Móvel' }, },
  { ddi: '960', pais: 'Maldivas', ddds: { '7': 'Móvel', '9': 'Móvel' }, },
  { ddi: '961', pais: 'Líbano', ddds: { '7': 'Móvel', '8': 'Móvel' }, },
  { ddi: '962', pais: 'Jordânia', ddds: { '7': 'Móvel' }, },
  { ddi: '963', pais: 'Síria', ddds: { '9': 'Móvel' }, },
  { ddi: '964', pais: 'Iraque', ddds: { '7': 'Móvel' }, },
  { ddi: '965', pais: 'Kuwait', ddds: { '5': 'Móvel', '6': 'Móvel', '9': 'Móvel' }, },
  { ddi: '966', pais: 'Arábia Saudita', ddds: { '5': 'Móvel' }, },
  { ddi: '967', pais: 'Iêmen', ddds: { '7': 'Móvel' }, },
  { ddi: '968', pais: 'Omã', ddds: { '7': 'Móvel', '9': 'Móvel' }, },
  { ddi: '970', pais: 'Territórios palestinos', ddds: { '5': 'Móvel' }, },
  { ddi: '971', pais: 'Emirados Árabes Unidos', ddds: { '5': 'Móvel' }, },
  { ddi: '972', pais: 'Israel', ddds: { '5': 'Móvel' }, },
  { ddi: '973', pais: 'Barein', ddds: { '3': 'Móvel' }, },
  { ddi: '974', pais: 'Catar', ddds: { '3': 'Móvel', '5': 'Móvel', '6': 'Móvel', '7': 'Móvel' }, },
  { ddi: '975', pais: 'Butão', ddds: { '1': 'Móvel', '7': 'Móvel', '8': 'Móvel' }, },
  { ddi: '976', pais: 'Mongólia', ddds: { '7': 'Móvel', '8': 'Móvel', '9': 'Móvel' }, },
  { ddi: '977', pais: 'Nepal', ddds: { '9': 'Móvel' }, },
  { ddi: '992', pais: 'Tadjiquistão', ddds: { '0': 'Móvel', '1': 'Móvel', '2': 'Móvel', '7': 'Móvel', '8': 'Móvel', '9': 'Móvel' }, },
  { ddi: '993', pais: 'Turcomenistão', ddds: { '6': 'Móvel' }, },
  { ddi: '994', pais: 'Azerbaijão', ddds: { '1': 'Móvel', '4': 'Móvel', '5': 'Móvel', '6': 'Móvel', '7': 'Móvel' }, },
  { ddi: '995', pais: 'Geórgia', ddds: { '5': 'Móvel' }, },
  { ddi: '996', pais: 'Quirguistão', ddds: { '2': 'Móvel', '5': 'Móvel', '6': 'Móvel', '7': 'Móvel' }, },
  { ddi: '998', pais: 'Uzbequistão', ddds: { '9': 'Móvel' }, },
  { ddi: '20', pais: 'Egito', ddds: { '1': 'Móvel' }, },
  { ddi: '27', pais: 'África do Sul', ddds: { '6': 'Móvel', '7': 'Móvel', '8': 'Móvel' }, },
  { ddi: '30', pais: 'Grécia', ddds: { '6': 'Móvel' }, },
  { ddi: '31', pais: 'Países Baixos', ddds: { '6': 'Móvel' }, },
  { ddi: '32', pais: 'Bélgica', ddds: { '4': 'Móvel' }, },
  { ddi: '33', pais: 'França', ddds: { '6': 'Móvel' }, },
  { ddi: '34', pais: 'Espanha', ddds: { '6': 'Móvel', '7': 'Móvel' }, },
  { ddi: '36', pais: 'Hungria', ddds: { '2': 'Móvel', '3': 'Móvel', '5': 'Móvel', '7': 'Móvel' }, },
  { ddi: '39', pais: 'Itália/Cidade do Vaticano', ddds: { '3': 'Móvel' }, },
  { ddi: '40', pais: 'Romênia', ddds: { '7': 'Móvel' }, },
  { ddi: '41', pais: 'Suíça', ddds: { '6': 'Móvel', '7': 'Móvel' }, },
  { ddi: '43', pais: 'Áustria', ddds: { '6': 'Móvel' }, },
  { ddi: '44', pais: 'Reino Unido/Guernsey', ddds: { '7': 'Móvel' }, },
  { ddi: '45', pais: 'Dinamarca', ddds: { '3': 'Móvel' }, },
  { ddi: '46', pais: 'Suécia', ddds: { '7': 'Móvel' }, },
  { ddi: '47', pais: 'Noruega/Svalbard', ddds: { '4': 'Móvel', '9': 'Móvel' }, },
  { ddi: '48', pais: 'Polônia', ddds: { '2': 'Móvel', '5': 'Móvel' }, },
  { ddi: '49', pais: 'Alemanha', ddds: { '1': 'Móvel' }, },
  { ddi: '51', pais: 'Peru', ddds: { '9': 'Móvel' }, },
  { ddi: '52', pais: 'México', },
  { ddi: '53', pais: 'Cuba', ddds: { '5': 'Móvel' }, },
  { ddi: '54', pais: 'Argentina', ddds: { '9': 'Móvel' }, },
  { ddi: '55', pais: 'Brasil', ddds: { '1': 'Móvel', '2': 'Móvel', '3': 'Móvel', '4': 'Móvel', '5': 'Móvel', '6': 'Móvel', '7': 'Móvel', '8': 'Móvel', '9': 'Móvel' }, },
  { ddi: '56', pais: 'Chile', },
  { ddi: '57', pais: 'Colômbia', ddds: { '3': 'Móvel' }, },
  { ddi: '58', pais: 'Venezuela', ddds: { '4': 'Móvel' }, },
  { ddi: '60', pais: 'Malásia', ddds: { '1': 'Móvel' }, },
  { ddi: '61', pais: 'Austrália/Ilha Christmas', ddds: { '4': 'Móvel' }, },
  { ddi: '62', pais: 'Indonésia', ddds: { '8': 'Móvel' }, },
  { ddi: '63', pais: 'Filipinas', ddds: { '9': 'Móvel' }, },
  { ddi: '64', pais: 'Nova Zelândia', ddds: { '2': 'Móvel' }, },
  { ddi: '65', pais: 'Singapura', ddds: { '8': 'Móvel', '9': 'Móvel' }, },
  { ddi: '66', pais: 'Tailândia', ddds: { '6': 'Móvel', '8': 'Móvel', '9': 'Móvel' }, },
  { ddi: '81', pais: 'Japão', ddds: { '6': 'Móvel', '7': 'Móvel', '8': 'Móvel', '9': 'Móvel' }, },
  { ddi: '82', pais: 'Coreia do Sul', ddds: { '1': 'Móvel' }, },
  { ddi: '84', pais: 'Vietnã', ddds: { '3': 'Móvel', '5': 'Móvel', '8': 'Móvel', '9': 'Móvel' }, },
  { ddi: '86', pais: 'China', ddds: { '1': 'Móvel' }, },
  { ddi: '90', pais: 'Turquia', ddds: { '5': 'Móvel' }, },
  { ddi: '91', pais: 'Índia', ddds: { '8': 'Móvel', '9': 'Móvel' }, },
  { ddi: '92', pais: 'Paquistão', ddds: { '3': 'Móvel' }, },
  { ddi: '93', pais: 'Afeganistão', ddds: { '7': 'Móvel' }, },
  { ddi: '94', pais: 'Sri Lanka', ddds: { '7': 'Móvel' }, },
  { ddi: '95', pais: 'Mianmar (Birmânia)', ddds: { '9': 'Móvel' }, },
  { ddi: '98', pais: 'Irã', ddds: { '9': 'Móvel' }, },
  { ddi: '1', pais: 'EUA/Canadá', },
  { ddi: '7', pais: 'Rússia/Cazaquistão', ddds: { '9': 'Móvel' }, },
];

function dddDe(num) {
  const s = String(num || '').replace(/\D/g, '');
  for (const p of PAISES) {
    if (s.startsWith(p.ddi)) {
      const resto = s.slice(p.ddi.length);
      if (!resto) continue;
      let area = '';
      if (p.ddi === '55' && resto.length >= 2) area = resto.slice(0, 2);            // Brasil: DDD de 2 dígitos
      else if (p.ddds) {
        const primeiro = resto[0];
        if (!p.ddds[primeiro]) area = resto.slice(0, 2);
        else area = (primeiro === '9' && p.ddi === '244' && resto.length >= 2) ? resto.slice(0, 2) : primeiro; // AO móvel: 9 + operador (92=Unitel, 99=Africell…)
      }
      else area = resto.slice(0, 2);
      return { ddi: p.ddi, pais: p.pais, ddd: area || '-', rotulo: `+${p.ddi} ${area || ''}`.trim() };
    }
  }
  return { ddi: '?', pais: 'Desconhecido', ddd: s.slice(0, 2) || '-', rotulo: s.slice(0, 2) || '-' };
}

// meta do Baileys: { id, subject, participants: [{ id: '2449...@s.whatsapp.net' | 'xxx@lid', notify?, name? }] }
// v12.9.37 — LID vs TELEFONE: o WhatsApp novo manda participantes como
// '<lid>@lid' nos metadados de grupo; o número real vem em 'phoneNumber'
// (ou id @s.whatsapp.net). LID NÃO É NÚMERO DE TELEFONE: sem telefone
// disponível o participante NÃO entra na base (não serve p/ add em grupos).
function _participanteTelefone(p) {
  const cands = [p?.phoneNumber, p?.jid, p?.id].filter(Boolean).map(String);
  const pn = cands.find((j) => /@s\.whatsapp\.net$/i.test(j));
  if (pn) {
    const num = pn.split('@')[0].split(':')[0].replace(/\D/g, '');
    if (num.length >= 7 && num.length <= 15) return { num, jidP: num + '@s.whatsapp.net' };
  }
  const id = String(p?.id || '');
  if (/@lid$/i.test(id)) return null;   // só LID → ignorar (não poluir a base)
  const num = id.split('@')[0].split(':')[0].replace(/\D/g, '');
  if (num.length >= 7 && num.length <= 15) return { num, jidP: num + '@s.whatsapp.net' };
  return null;
}

function capturarGrupo(jid, meta, { fonte = '', slot = null, persistir = true } = {}) {
  // v12.9.34: persistir=false → memória só (captura em LOTES feita pelo chamador;
  // com 1000+ grupos, carregar+guardar a base completa POR GRUPO era O(n²))
  if (persistir) carregar();
  const nome = String(meta?.subject || '').slice(0, 120) || 'grupo';
  state.grupos[jid] = { nome, membros: (meta?.participants || []).length, nomeFonte: fonte, ts: Date.now() };
  let novos = 0, duplicados = 0, lidsIgnorados = 0;
  const _paresNovos = [];
  for (const p of (meta?.participants || [])) {
    const _tel = _participanteTelefone(p);
    if (!_tel) { if (String(p?.id || '').includes('@lid')) lidsIgnorados++; continue; }
    const num = _tel.num;
    const jidP = _tel.jidP;
    if (!num || num.length < 7) continue;
    const nomeP = String(p.notify || p.name || p.verifiedName || '').slice(0, 80);
    const ex = state.contactos[num];
    if (ex) {
      duplicados++;
      ex.grupos = ex.grupos || {};
      if (!ex.grupos[jid]) ex.grupos[jid] = nome;
      if (nomeP && !ex.nome) ex.nome = nomeP;
      // v12.9.35 FIX: o `if` só guardava a 1ª instrução — ex.slots[slot]=… corria SEMPRE
      // e rebentava em contacto repetido sem slot (era o crash silencioso do .capturar!)
      if (slot) { ex.slots = ex.slots || {}; ex.slots[slot] = Date.now(); } // v12.9.23: por qual NÚMERO foi visto
      ex.ts = Date.now();
    } else {
      novos++;
      state.contactos[num] = { nome: nomeP, jid: jidP, grupos: { [jid]: nome }, addedAt: Date.now(), ts: Date.now(), ddd: dddDe(num), ...(slot ? { slots: { [slot]: Date.now() } } : {}) };
      _marcarSujo(num);
      _paresNovos.push([num, nomeP]);
    }
  }
  guardar();
  _filaUsuarios(_paresNovos);
  return { novos, duplicados, total: (meta?.participants || []).length, nome, lidsIgnorados };
}

function stats() {
  carregar();
  const nGrupos = Object.keys(state.grupos).length;
  // v12.9.36: porGrupo numa ÚNICA passada (antes: 1 scan completo POR GRUPO
  // = 1e9 operações com 1M contactos × 1000 grupos)
  const _porGrupoTally = {};
  for (const c of Object.values(state.contactos)) {
    for (const jid of Object.keys(c.grupos || {})) _porGrupoTally[jid] = (_porGrupoTally[jid] || 0) + 1;
  }
  const porGrupo = Object.entries(state.grupos)
    .map(([jid, g]) => ({ jid, nome: g.nome, membros: _porGrupoTally[jid] || 0, capturados: _porGrupoTally[jid] || 0, ts: g.ts }))
    .sort((a, b) => b.capturados - a.capturados);
  // v12.9.23: resumo por DDD/país + por slot de captura
  const _ddd = {};
  const _paisesT = {};
  const _slots = {};
  for (const [num, c] of Object.entries(state.contactos)) {
    const d = c.ddd || dddDe(num);
    const chave = `+${d.ddi} ${d.ddd}`.trim();
    _ddd[chave] = _ddd[chave] || { rotulo: chave, pais: d.pais, ddi: d.ddi, ddd: d.ddd, total: 0 };
    _ddd[chave].total++;
    _paisesT[d.pais] = (_paisesT[d.pais] || 0) + 1;
    for (const sl of Object.keys(c.slots || {})) { _slots[sl] = _slots[sl] || { slot: sl, total: 0 }; _slots[sl].total++; }
  }
  const ddds = Object.values(_ddd).sort((a, b) => b.total - a.total);
  const paises = Object.entries(_paisesT).map(([pais, total]) => ({ pais, total })).sort((a, b) => b.total - a.total);
  const slots = Object.values(_slots).sort((a, b) => b.total - a.total);
  return { total: Object.keys(state.contactos).length, nGrupos, porGrupo, ddds, paises, slots, updatedAt: state.UpdatedAt };
}

// fonte para addcentral: 'todos' → base inteira; jid de grupo → só quem está nesse grupo
function fonteParaAdd(filtroJid) {
  carregar();
  const out = [];
  for (const [num, c] of Object.entries(state.contactos)) {
    if (filtroJid && filtroJid !== 'todos' && !(c.grupos && c.grupos[filtroJid])) continue;
    out.push({ num, jid: c.jid || num + '@s.whatsapp.net', nome: c.nome || '' });
  }
  return out;
}

/**
 * v12.9.24: captura DIRECTA de números (passiva — entrada/saída em grupos).
 * Igual ao capturarGrupo mas recebe os números prontos.
 */
function capturarContactos(nums, jidGrupo, nomeGrupo, opts = {}) {
  const { slot = null } = opts || {};
  const _paresCC = [];   // v12.9.36: tolera opts=null (era crash silencioso)
  carregar();
  let novos = 0, duplicados = 0;
  state.grupos[jidGrupo] = state.grupos[jidGrupo] || { nome: String(nomeGrupo || '').slice(0, 120), membros: 0, nomeFonte: 'passiva', ts: Date.now() };
  state.grupos[jidGrupo].ts = Date.now();
  for (const num0 of nums) {
    const num = String(num0 || '').replace(/\D/g, '');
    if (!num || num.length < 7) continue;
    const ex = state.contactos[num];
    if (ex) {
      duplicados++;
      ex.grupos = ex.grupos || {};
      if (!ex.grupos[jidGrupo]) ex.grupos[jidGrupo] = state.grupos[jidGrupo].nome;
      if (slot) { ex.slots = ex.slots || {}; ex.slots[slot] = Date.now(); }
      ex.ts = Date.now();
    } else {
      novos++;
      state.contactos[num] = { nome: '', jid: num + '@s.whatsapp.net', grupos: { [jidGrupo]: state.grupos[jidGrupo].nome }, addedAt: Date.now(), ts: Date.now(), ddd: dddDe(num), ...(slot ? { slots: { [slot]: Date.now() } } : {}) };
      _marcarSujo(num);
      _paresCC.push([num, '']);
    }
  }
  // v12.9.36: membros INCREMENTAL — o scan completo da base por chamada
  // custava O(base) POR LOTE (250M operações a 500k contactos!)
  state.grupos[jidGrupo].membros = (state.grupos[jidGrupo].membros || 0) + novos;
  guardar();
  _filaUsuarios(_paresCC);
  return { novos, duplicados };
}

/** v12.9.23: lista os contactos de um DDD ('244 9', '55 11', …) ou de um país ('+244'). */
function contactosPorDdd(filtro) {
  carregar();
  let f = String(filtro || '').trim().toLowerCase();
  if (f && !f.startsWith('+') && /^\d/.test(f)) f = '+' + f; // aceita "244 9" e "+244 9"
  const out = [];
  for (const [num, c] of Object.entries(state.contactos)) {
    const d = c.ddd || dddDe(num);
    const rot = `+${d.ddi} ${d.ddd}`.trim().toLowerCase();
    const rotP = `+${d.ddi} ${String(d.ddd).slice(0, 1)}`.toLowerCase();
    if (rot === f || rotP === f || ('+' + String(d.ddi)) === f || String(d.pais).toLowerCase() === f) {
      out.push({ num, jid: c.jid || num + '@s.whatsapp.net', nome: c.nome || '', ddd: d });
    }
  }
  return out;
}

/** v12.9.24: fonte para addcentral filtrada por DDD/país — mesma regra do contactosPorDdd. */
function fontePorDdd(filtro) {
  return contactosPorDdd(filtro).map(x => ({ num: x.num, jid: x.jid, nome: x.nome }));
}

function remover(num) {
  carregar();
  const had = !!state.contactos[num];
  delete state.contactos[num];
  guardar();
  return had;
}

function limpar() {
  state.contactos = {};
  state.grupos = {};
  guardar();
  return true;
}

// comunidade: grupos filhos do pai (linkedParentJid) a partir da lista viva do bot
function filhosComunidade(jidPai, allMeta) {
  return Object.values(allMeta || {}).filter(g => g && String(g.linkedParentJid || '') === String(jidPai));
}

// v12.9.37: purga dos LIDs captados antes do fix (jid @lid = lixo p/ grupos)
function limparLids() {
  carregar();
  let removidos = 0;
  for (const [num, c] of Object.entries(state.contactos)) {
    if (/@lid/i.test(String(c.jid || ''))) { delete state.contactos[num]; removidos++; }
  }
  if (_modoMongo) {
    try {
      const CC = require('../database/models/CentralContacto');
      CC.deleteMany({ jid: { $regex: '@lid', $options: 'i' } }).catch(() => {});
    } catch {}
  }
  if (removidos) guardar();
  return removidos;
}
function contarLids() {
  carregar();
  let n = 0;
  for (const c of Object.values(state.contactos)) { if (/@lid/i.test(String(c.jid || ''))) n++; }
  return n;
}

module.exports = { carregar, guardar, capturarGrupo, capturarContactos, stats, fonteParaAdd, fontePorDdd, remover, limpar, filhosComunidade, dddDe, contactosPorDdd, PAISES, carregarMongo, modoMongo, limparLids, contarLids, sincronizarUsuarios, usuariosNaFila };
