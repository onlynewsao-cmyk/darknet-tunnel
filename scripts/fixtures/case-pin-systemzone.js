case 'pin': {

    try {

        if (!text) return m.reply(
            `╔━᳀『 ᴘɪɴᴛᴇʀᴇsᴛ 』═᳀\n` +
            `⌬ Use: *${prefix}pin <termo>*\n` +
            `⌬ Ex: *${prefix}pin gatos*\n` +
            `⌬ Ex: *${prefix}pin gatos |6|vídeo*\n` +
            `⌬ Ex: *${prefix}pin gatos |imagem*\n` +
            `⌬ Manda até 10 mídias em álbum\n` +
            `╚═━═━═━═━═━═━═━═᳀`
        );

        await systemZR.sendMessage(m.chat, { react: { text: '🔎', key: m.key } });

        const partes = text.split('|').map(p => p.trim()).filter(Boolean);
        const query = partes.shift();

        let limit = 6;
        let tipo = 'image';

        for (const p of partes) {
            if (/^\d+$/.test(p)) {
                limit = Math.max(1, Math.min(10, parseInt(p, 10)));
            } else if (/^v[ií]deos?$/i.test(p)) {
                tipo = 'video';
            } else if (/^(imagens?|imagem|fotos?|image)$/i.test(p)) {
                tipo = 'image';
            }
        }

        if (!query) return m.reply(`Uso: ${prefix}pin <termo> |qtd|tipo`);

        const { data } = await axios.get(`https://systemzone.store/api/v3/pinterest`, {
            params: { q: query, type: tipo, limit, ia: true },
            timeout: 180000
        });

        const results = Array.isArray(data?.results) ? data.results : [];
        if (!data?.status || !results.length) {
            await systemZR.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
            return m.reply('Nenhum resultado encontrado para esse termo.');
        }

        const albumMessage = results
            .filter(item => item.media_url)
            .slice(0, limit)
            .map(item => item.type === 'video'
                ? { video: { url: item.media_url }, mimetype: 'video/mp4' }
                : { image: { url: item.media_url }, mimetype: 'image/jpeg' }
            );

        if (!albumMessage.length) {
            await systemZR.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
            return m.reply('Não foi possível carregar nenhuma mídia.');
        }

        await systemZR.sendMessage(m.chat, { albumMessage }, { quoted: m });
        await systemZR.sendMessage(m.chat, { react: { text: '✅', key: m.key } });

    } catch (e) {
        console.error('[pin]', e.message);
        await systemZR.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
        m.reply('Erro ao buscar no Pinterest: ' + e.message);
    }

}
break;
