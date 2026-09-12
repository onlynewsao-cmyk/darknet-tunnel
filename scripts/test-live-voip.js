'use strict';
const path = require('path');
const V = require(path.join(__dirname, '..', 'src', 'bot', 'liveVoip'));
let ok = 0, fail = 0;
const t = (n, c, e) => { c ? ok++ : fail++; console.log((c ? '✅' : '❌') + ' ' + n + (e ? ' → ' + e : '')); };

(async () => {
  const st = V.getStatus();
  t('status sem crash', !!st && st.motor === 'baileys-caller');
  t('inbound marcado impossível', st.limites.inbound === false);
  t('video marcado impossível', st.limites.video === false);
  t('sem sessão por omissão', V.temSessao() === false);
  const r = await V.ligarAoVivo('244945280380');
  t('sem sessão não liga (não estraga)', r.ok === false && r.motivo === 'sem_sessao_voip', r.motivo);
  const r2 = await V.ligarAoVivo('12');
  t('número curto recusado', r2.ok === false && r2.motivo === 'numero_invalido');
  console.log('\n' + ok + ' OK / ' + fail + ' FALHOU');
  process.exit(fail ? 1 : 0);
})();
