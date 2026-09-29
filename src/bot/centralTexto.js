// v12.9.35 — LISTA EM TEXTO PURO: o WhatsApp novo aceita o carrossel/lista
// interactiva SEM erro mas deixa de a renderizar no telefone (a cascatas do
// carrosselSeguro nunca caía porque o relay "success"). Texto numerado
// renderiza SEMPRE e alimenta os comandos (capturar <nº>, addcentral…).
async function listaTexto(sock, jid, titulo, itens, { quoted = null, nota = '', porPagina = 20 } = {}) {
  const pags = Math.max(1, Math.ceil(itens.length / porPagina));
  for (let pg = 0; pg < pags; pg++) {
    const fatia = itens.slice(pg * porPagina, pg * porPagina + porPagina);
    let txt = pags > 1
      ? `${titulo} — página ${pg + 1}/${pags}\n\n`
      : `${titulo}\n\n`;
    txt += fatia.map((it) => `${it.marcador ? it.marcador + ' ' : ''}${it.num ? `*${it.num}.*` : '•'} ${it.titulo}${it.detalhe ? `\n     ${it.detalhe}` : ''}`).join('\n');
    if (nota && pg === pags - 1) txt += `\n\n${nota}`;
    if (pg < pags - 1) txt += '\n\n_(segue na próxima página…)_';
    const enviar = { text: txt };
    if (quoted && quoted.key) enviar.quoted = quoted;
    await sock.sendMessage(jid, enviar);
  }
  return pags;
}

module.exports = { listaTexto };
