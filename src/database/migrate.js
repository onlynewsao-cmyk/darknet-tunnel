/**
 * Migrações automáticas no boot
 * - Renomeia sessions antigas do Baileys
 * - Limpa usernames duplicados que causam erro de upsert
 */
const mongoose = require('mongoose');

async function migrate() {
  if (mongoose.connection.readyState !== 1) return;
  const db = mongoose.connection.db;

  try {
    const collections = await db.listCollections().toArray();
    const sessionsCol = db.collection('sessions');

    const indexes = await sessionsCol.indexes().catch(() => []);
    const hasFileNameIndex = indexes.find(i => i.name === 'fileName_1');

    if (hasFileNameIndex) {
      console.log('🔧 Detectado conflito de sessions, corrigindo...');
      try {
        const oldExists = collections.find(c => c.name === 'sessions_old_baileys');
        if (oldExists) {
          console.log('🗑️ sessions_old_baileys já existe, dropando sessions atual');
          await sessionsCol.drop();
        } else {
          await db.renameCollection('sessions', 'sessions_old_baileys');
          console.log('✅ sessions renomeada para sessions_old_baileys');
        }

        setImmediate(async () => {
          try {
            const oldCol = db.collection('sessions_old_baileys');
            const newCol = db.collection('baileys_sessions');
            const cursor = oldCol.find({ fileName: { $exists: true, $ne: null } });
            let count = 0;
            while (await cursor.hasNext()) {
              const doc = await cursor.next();
              const { _id, ...rest } = doc;
              await newCol.updateOne({ fileName: rest.fileName }, { $set: rest }, { upsert: true }).catch(() => {});
              count++;
            }
            console.log(`🔄 Migração background: ${count} docs Baileys copiados`);
          } catch (e) { console.error('Migração background falhou:', e.message); }
        });
      } catch (e) {
        try {
          await sessionsCol.dropIndex('fileName_1');
          console.log('✅ Índice fileName_1 removido (fallback)');
        } catch (e2) { console.error('Não conseguiu nem dropar índice:', e2.message); }
      }
      console.log('✅ Migração sessions concluída');
    }

    // ==================== MIGRAÇÃO USERS ====================
    // Limpa users duplicados / sem whatsappNumber + autoCreated
    try {
      const usersCol = db.collection('users');

      // 1) Acha users autoCreated SEM whatsappNumber (lixo que ficou)
      const ghostCount = await usersCol.countDocuments({
        autoCreated: true,
        $or: [{ whatsappNumber: '' }, { whatsappNumber: { $exists: false } }, { whatsappNumber: null }],
      });

      if (ghostCount > 0) {
        const r = await usersCol.deleteMany({
          autoCreated: true,
          $or: [{ whatsappNumber: '' }, { whatsappNumber: { $exists: false } }, { whatsappNumber: null }],
        });
        console.log(`🧹 Removidos ${r.deletedCount} users fantasma (autoCreated sem WhatsApp)`);
      }

      // 2) Acha duplicatas de username 'wa_<numero>' que NÃO têm whatsappNumber vinculado
      const orphanUsernames = await usersCol.find({
        username: /^wa_\d+/,
        $or: [{ whatsappNumber: '' }, { whatsappNumber: { $exists: false } }],
      }).toArray();

      let fixed = 0;
      for (const u of orphanUsernames) {
        // Extrai número do username
        const m = u.username.match(/^wa_(\d+)/);
        if (!m) continue;
        const num = m[1];

        // Verifica se já existe user com esse whatsappNumber
        const existing = await usersCol.findOne({ whatsappNumber: num, _id: { $ne: u._id } });
        if (existing) {
          // Já tem outro user com esse número — deleta o órfão
          await usersCol.deleteOne({ _id: u._id });
          fixed++;
        } else {
          // Não tem outro — vincula o whatsappNumber
          await usersCol.updateOne({ _id: u._id }, { $set: { whatsappNumber: num } });
          fixed++;
        }
      }
      if (fixed > 0) console.log(`🔄 ${fixed} usernames wa_ órfãos foram corrigidos`);
    } catch (e) {
      console.warn('Users migração:', e.message);
    }

  } catch (err) {
    console.error('⚠️ Erro na migração (não fatal):', err.message);
  }
}

module.exports = { migrate };
