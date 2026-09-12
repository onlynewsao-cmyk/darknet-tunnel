/**
 * DARK BOT — DIAGNOSTICO DE PRODUCAO (v6.71)
 *
 * O Dono reportou 3x que a AURA nao responde. Os testes locais passam
 * todos. Este script nao testa codigo — INTERROGA O BOT A CORRER e diz
 * se o problema e codigo, configuracao ou sessao roubada.
 *
 * Uso: node scripts/test-diag-producao.js [url]
 */
'use strict';

const URL = process.argv[2] || process.env.APP_URL || 'https://dark-bot-fqsn.onrender.com';
const https = require('https');

function get(p) {
  return new Promise((res) => {
    const r = https.get(URL + p, { timeout: 20000 }, x => {
      let b = ''; x.on('data', d => b += d);
      x.on('end', () => { try { res(JSON.parse(b)); } catch { res({ _raw: b.slice(0, 200), _code: x.statusCode }); } });
    });
    r.on('error', e => res({ _erro: e.message }));
    r.on('timeout', () => { r.destroy(); res({ _erro: 'timeout' }); });
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

let ok = 0, fail = 0, avisos = [];
const t = (n, c, e) => { e = e || ''; c ? ok++ : fail++; console.log('  ' + (c ? '✅' : '❌') + ' ' + n + (e ? ' → ' + String(e).slice(0, 70) : '')); };

(async () => {
  console.log('\n╔═══ DIAGNOSTICO DE PRODUCAO ═══╗');
  console.log('   ' + URL + '\n');

  console.log('▸ 1. O serviço está de pé?');
  const h = await get('/health');
  if (h._erro) {
    console.log('  ❌ Inacessível: ' + h._erro);
    console.log('\n  O serviço está em baixo. Vê os logs no painel do Render.\n');
    process.exit(1);
  }
  t('Responde ao /health', !!h.status, 'db=' + h.db + ' bot=' + h.bot);
  t('MongoDB ligado', h.db === 'connected', h.db);

  console.log('\n▸ 2. O código novo está lá?');
  const d = await get('/diag');
  if (d._code === 404 || d._erro) {
    console.log('  ❌ /diag não existe → o Render está a correr código ANTIGO.');
    console.log('     Faz Manual Deploy no painel do Render.\n');
    process.exit(1);
  }
  t('Rota /diag responde', d.ok === true, 'commit ' + (d.commit || '?'));
  const c = d.correccoes || {};
  const faltam = Object.entries(c).filter(([, v]) => !v).map(([k]) => k);
  t('Todas as correcções em execução', faltam.length === 0, faltam.join(', ') || Object.keys(c).length + ' ok');

  console.log('\n▸ 3. Configuração');
  const k = d.chaves || {};
  t('Chaves de IA presentes', k.groq || k.gemini, 'groq=' + k.groq + ' gemini=' + k.gemini);
  t('Voz configurada (ElevenLabs)', !!k.elevenlabs, String(k.elevenlabs));
  const g = d.guardas || {};
  t('ai_auto_enabled ligado', g.ai_auto_enabled !== false, String(g.ai_auto_enabled));
  t('bot_interaction_enabled ligado', g.bot_interaction_enabled !== false, String(g.bot_interaction_enabled));
  if ((g.disabled_groups || []).length) avisos.push('Grupos desactivados: ' + g.disabled_groups.join(', '));
  if ((g.disabled_users || []).length) avisos.push('Utilizadores bloqueados: ' + g.disabled_users.join(', '));

  console.log('\n▸ 4. Conflito de sessão (a causa nº1 de "online mas mudo")');
  t('Sem conflitos de sessão', (d.conflitos_de_sessao || 0) === 0, 'conflitos=' + (d.conflitos_de_sessao || 0));
  if (d.AVISO) avisos.push(d.AVISO);
  if (d.AVISO_SILENCIO) avisos.push(d.AVISO_SILENCIO);

  console.log('\n▸ 5. O processo é estável? (3 leituras / 40s)');
  const ups = [];
  for (let i = 0; i < 3; i++) {
    const x = await get('/health');
    ups.push({ up: x.uptime, msg: x.messages, bot: x.bot });
    if (i < 2) await sleep(20000);
  }
  console.log('     ' + ups.map(u => 'up=' + u.up + ' msg=' + u.msg).join('  |  '));
  const reiniciou = ups.some((u, i) => i > 0 && u.up < ups[i - 1].up);
  t('Não reiniciou durante o teste', !reiniciou, reiniciou ? 'O UPTIME CAIU — está a morrer e a renascer' : 'estável');

  console.log('\n▸ 6. Está mesmo a RECEBER do WhatsApp?');
  const ult = ups[ups.length - 1];
  t('Ligado ao WhatsApp', ult.bot === 'connected', ult.bot);
  const mudo = ult.bot === 'connected' && ult.up > 300 && (ult.msg || 0) === 0;
  t('Recebe mensagens (não está mudo)', !mudo,
    mudo ? 'connected há ' + ult.up + 's e ZERO mensagens = sessão roubada' : 'msg=' + ult.msg);

  console.log('\n╔═══ VEREDICTO ═══╗');
  if (mudo || (d.conflitos_de_sessao || 0) > 0) {
    console.log('  🔴 SESSÃO ROUBADA — outro dispositivo tem estas credenciais.');
    console.log('     O código está bom; as mensagens vão para o outro sítio.');
    console.log('     RESOLVE ASSIM:');
    console.log('       1. WhatsApp do bot → Aparelhos conectados → termina TODAS');
    console.log('       2. Confirma que só há UM serviço no Render');
    console.log('       3. Reconecta uma vez em /dashboard/connect');
  } else if (fail === 0) {
    console.log('  🟢 Produção saudável. Se ela continuar calada, o problema');
    console.log('     está no chat específico (grupo desactivado?) — vê os avisos.');
  } else {
    console.log('  🟡 Há ' + fail + ' verificação(ões) a falhar — vê acima.');
  }
  if (avisos.length) {
    console.log('\n  ⚠️  AVISOS:');
    for (const a of avisos) console.log('     • ' + a);
  }
  console.log('\n  ' + ok + ' OK / ' + fail + ' FALHOU\n');
  process.exit(0);   // diagnóstico nunca quebra o npm test
})();
