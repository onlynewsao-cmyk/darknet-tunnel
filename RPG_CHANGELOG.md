# 🎮 RPG — CHANGELOG ÚNICO E PERMANENTE

> **Este é O documento do RPG.** Único, canónico e estável: só cresce para
> baixo, nunca é reescrito. Cada versão acrescenta uma entrada no topo.
> Se algum dia existirem dúvidas sobre "como o RPG funciona", é aqui.

---

## v7.92 — OPÇÕES DENTRO DA LISTA
- listas RPG passam a mostrar corpo curto; os resultados aparecem quando se toca ESCOLHER ▾ (em vez de duplicar no texto)

## v7.91 — TUDO CLICÁVEL
- todas as pesquisas com lista (play/spotify2/video/...) clicáveis; stalks com opções; migração sessão; darknet-tunnel = repo verdadeiro

## v7.90 — UI CLICÁVEL (botões e listas) 🎮
- **`src/bot/rpg/ui.js`** — motor de interacção do RPG:
  - `confirmar()` → botões **✅ Sim / ❌ Não** (clique → corre o efeito 1× e morre)
  - `escolher()` → **lista single_select** (toque → corre o efeito da opção)
  - Cliques voltam como tokens `RPGSIM_` / `RPGNAO_` / `RPGSEL_` interceptados
    no commandHandler (mesmo mecanismo provado do RPGPICK_/CHANGE_THEME_)
  - Fallback escrito: `!rpgsim` / `!rpgnao` / `!rpgescolher <n>`
  - Pendente expira em 3 min; clique duplo não cobra duas vezes
- **Confirmado por botões:** `!reviver` (500 coins), `!guilda criar` (1000),
  `!criaclan` (5000 berries), **refazer personagem no `!rpgstart`** (antes
  apagava tudo sem aviso — agora ✅ Refazer / 🛡️ Manter)

## v7.89 — ESCUDO DE VERDADE (antis vivos)
- auto-visu1 baixava por `sock.downloadMediaMessage` (inexistente) → reenvio
  em ver-uma-vez nunca acontecia; agora usa o export `baileys-v6 (alias oficial @whiskeysockets/baileys 6.7.24)`
- `antifoto/antivideo/antiaudio/antitexto/anticontacto/autoVisu1/autoDl` e
  **`modorpg`** agora EXISTEM no schema (antes o mongoose apagava os toggles:
  respondia "ON" mas nada persistia — o mundo RPG estava eternamente fechado)

## v7.88 — RESET + MUNDO DUPLO 🌱
- Reset único: todas as personagens apagadas; **todos** se registam de novo
- **Comunidade DARK VILLE = mundo internacional** — RPG sempre aberto lá
- **Grupos normais:** pedem `!modorpg on` e têm **RPG de um só grupo**
  completo (clã LOCAL sem subgrupo, `!guilda entrar` funcional)
- Sugestão de comando já não sugere o próprio comando que correu (vacilo)

## v7.87 — MUNDO FECHADO 🌍
- Grupo sem `modorpg` = mundo fechado; sem personagem só portal/vitrine
- Criação marca `started`; gate único em `rpg/gate.js`

## v6.63 – v6.90 — BASE
- Listas de criação de personagem (raça/classe) clicáveis, `RPGPICK_`
- `!criaclan` cobra 5000 e promove o líder; bónus de raça uma única vez
- Comunidade WhatsApp (arena/dungeons/trocas/cavernas/lazer/arsenal)

---
*Regras deste ficheiro: 1 entrada por versão, mais recente em cima, nunca
apagar entradas, nunca duplicar changelogs do RPG noutro ficheiro.*
