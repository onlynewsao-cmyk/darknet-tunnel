const mongoose = require('mongoose');
const config = require('../config');

let isConnected = false;

async function connectDB() {
  if (isConnected) return mongoose.connection;
  if (!config.mongodb.uri) {
    console.warn('⚠️  MONGODB_URI não definida. O bot funcionará SEM persistência.');
    return null;
  }
  try {
    await mongoose.connect(config.mongodb.uri, {
      serverSelectionTimeoutMS: 15000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
      minPoolSize: 2,
      heartbeatFrequencyMS: 10000,

      // v6.75: o default do Mongoose é 10s de buffer. Quando o Mongo pisca
      // (acontece muito no free tier), CADA query do caminho quente ficava
      // 10s pendurada antes de falhar — userManager, roleResolver, antiSpam,
      // antiLink e messageListener não têm guarda de readyState, ao contrário
      // do botConfigCache. Resultado: uma mensagem podia demorar dezenas de
      // segundos. Com 2s, o fallback entra quase de imediato e o bot continua
      // rápido. Não afecta o caminho normal: com o Mongo ligado, não há buffer.
      bufferTimeoutMS: 2000,
    });
    isConnected = true;
    console.log('✅ MongoDB conectado');

    // v6.45: garante que índices NOVOS são criados em colecções que já
    // existem. O autoIndex do Mongoose só actua na criação do modelo —
    // num banco antigo, um índice adicionado depois nunca aparecia.
    // Sem o índice em User.whatsappNumber (a query mais frequente do
    // bot) o MongoDB fazia varredura completa em cada mensagem.
    // Corre em background para não atrasar o arranque.
    setImmediate(async () => {
      const alvos = ['User', 'GroupSettings', 'Command', 'Economy'];
      for (const nome of alvos) {
        try {
          const M = mongoose.models[nome];
          if (M) await M.syncIndexes();
        } catch (e) {
          console.warn(`[Índices] ${nome}:`, e.message?.slice(0, 60));
        }
      }
      console.log('✅ Índices verificados');
    });

    return mongoose.connection;
  } catch (err) {
    console.error('❌ Erro ao conectar MongoDB:', err.message);
    return null;
  }
}

module.exports = { connectDB, mongoose };
