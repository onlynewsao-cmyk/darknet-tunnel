'use strict';
const path = require('path');
const A = require(path.join(__dirname, '..', 'src', 'aura', 'auraAssunto'));
let ok = 0, fail = 0;
const t = (n, c, e) => { c ? ok++ : fail++; console.log((c ? '✅' : '❌') + ' ' + n + (e ? ' → ' + e : '')); };

const jid = '120363@g.us';
A.actualizar(jid, 'Abri o grupo pra ti', { groupName: 'YouTube e Mídias Sociais' });
t('assunto fica o grupo actual', A.ler(jid)?.assunto === 'YouTube e Mídias Sociais');
t('"dele" é vago', A.ePronomeVago('Mande o link dele'));
const r = A.resolver('Mande o link dele', jid, { groupName: 'YouTube e Mídias Sociais' });
t('resolve dele → nome do grupo', /YouTube/i.test(r), r);
t('sem pronome não mexe', A.resolver('bom dia', jid) === 'bom dia');
const p = A.paraPrompt(jid, { groupName: 'YouTube e Mídias Sociais' });
t('prompt pede para não inventar', /n[aã]o inventes/i.test(p));

console.log('\n' + ok + ' OK / ' + fail + ' FALHOU');
process.exit(fail ? 1 : 0);
