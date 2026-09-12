'use strict';
const path = require('path');
const S = require(path.join(__dirname, '..', 'src', 'aura', 'auraSanitizer'));
const I = require(path.join(__dirname, '..', 'src', 'aura', 'auraIntent'));
const A = require(path.join(__dirname, '..', 'src', 'aura', 'auraActions'));
let ok = 0, fail = 0;
const t = (n, c, e) => { c ? ok++ : fail++; console.log((c ? '✅' : '❌') + ' ' + n + (e ? ' → ' + e : '')); };

t('"." é só pontuação', S.eSoPontuacao('.'));
t('"oi" não é pontuação', !S.eSoPontuacao('oi'));
t('limpa leak do prefixo', !/prefixo/i.test(S.limparResposta('_ignora a mensagem começando com prefixo ponto e não responde_')));
t('limpa recusa de chamada', !/não posso atender/i.test(S.limparResposta('Não posso atender a esse pedido. Posso ajudar com outra coisa?')));
t('"vai dormir" do dono no grupo é sleep', I.detectAuraIntent('Vai dormir', { isOwner: true, isGroup: true }) === I.INTENT_SLEEP);
t('auraActions ligar', A.detectarAcao('me liga')?.acao === 'ligar');
t('auraActions chamada voz', A.detectarAcao('Faz uma chamada de voz comigo')?.acao === 'ligar');
t('auraActions video', A.detectarAcao('faz uma videochamada')?.valor === 'video');
t('"Mande o link dele" é linkGrupo', A.detectarAcao('Mande o link dele')?.acao === 'linkGrupo');
t('"O link verdadeiro" é linkGrupo', A.detectarAcao('O link verdadeiro')?.acao === 'linkGrupo');
t('"manda o link do grupo" é linkGrupo', A.detectarAcao('manda o link do grupo')?.acao === 'linkGrupo');
const img = require(path.join(__dirname, '..', 'src', 'bot', 'imageSearch'));
t('"Mande o link dele" NÃO é imagem', img.detectarPedidoImagem('Mande o link dele') == null);
t('fake invite é inventado', S.eLinkInventado('https://chat.whatsapp.com/abcdefghijkl'));

console.log('\n' + ok + ' OK / ' + fail + ' FALHOU');
process.exit(fail ? 1 : 0);
