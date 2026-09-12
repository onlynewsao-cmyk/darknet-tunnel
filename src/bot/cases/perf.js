/**
 * ⚡ PERFORMANCE ENGINE — Comando de Stats
 */
'use strict';

module.exports = function registerPerfCases(registerCase) {
  registerCase(['perf', 'performance', 'stats', 'velocidade', 'speed'], async ({ sock, msg, ctx, reply, isOwner }) => {
    const perf = require('../performance');
    const stats = perf.getPerfStats();
    const mem = process.memoryUsage();
    const memMB = (mem.heapUsed / 1024 / 1024).toFixed(1);
    const uptimeSec = Math.floor((Date.now() - perf.perfMetrics.startTime) / 1000);
    const uptimeMin = Math.floor(uptimeSec / 60);
    const uptimeH = Math.floor(uptimeMin / 60);
    
    const cacheLines = Object.entries(stats.caches)
      .filter(([_, s]) => s.size > 0 || s.hits > 0)
      .map(([name, s]) => `  ${name}: ${s.size} items | hit: ${s.hitRate}`)
      .join('\n') || '  (sem dados ainda)';

    const text = [
      `⚡ *PERFORMANCE ENGINE — STATS*`,
      ``,
      `🕐 Uptime: *${uptimeH}h ${uptimeMin % 60}min*`,
      `📨 Mensagens processadas: *${stats.messagesProcessed}*`,
      `⏱️ Tempo médio de resposta: *${stats.avgResponseTime}*`,
      `🧠 Memória: *${memMB} MB*`,
      ``,
      `📊 *CACHES:*`,
      cacheLines,
      ``,
      `🚀 *OPTIMIZAÇÕES ACTIVAS:*`,
      `  ✅ LRU Cache com TTL`,
      `  ✅ Pre-compiled Regex`,
      `  ✅ Parallel AI Providers (race)`,
      `  ✅ Fast Aura Trigger Detection`,
      `  ✅ Lazy Module Loading`,
      `  ✅ Response Cache (1min)`,
      `  ✅ Auto Memory Cleanup (5min)`,
      ``,
      `> Mais rápido que o Flash ⚡`,
    ].join('\n');

    await reply(text);
  });
};
