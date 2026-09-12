# DARK BOT — Contexto de trabalho local

Atualizado em 2026-09-04 após sincronização de `main`.

## Estado sincronizado

- Repositório: `https://github.com/onlynewsao-cmyk/dark-bot`
- Pasta local: `/home/user/dark-bot`
- Branch: `main`
- Commit atual: `3cbaea75f0bb09edc7c7b14418d8d837f8de47b3` (`3cbaea7 fix: reconhecer admins com ids lid e pn`)
- Working tree limpo no momento da sincronização.
- 376 ficheiros versionados (~93 mil linhas: `src/bot` 43k, `scripts` 12k, `src/aura` 9.7k, `src/views` 4.3k, `src/decrypter` 3.2k).
- Não foram copiados `.env`, sessões, credenciais ou chaves de runtime.

### Últimos commits desde a sincronização anterior (f4a291b)

| Commit | O que muda |
|---|---|
| `3cbaea7` | Admin do grupo reconhecido por `id`, `jid`, `lid`, `pn` (WhatsApp mistura LID e número). |
| `01cf75e` | AURA volta a responder a mensagens consecutivas no PV (cooldown global removido, dedup por `chat+messageId`). |
| `d69ed1e` / `9a92bdb` | Chamada iniciada pela AURA vai para o PN do Dono, não para o LID. |
| `7afa74c` | Pair code destravado (aguarda WS aberto antes de `requestPairingCode`). |
| `3a67da0` | `AUTO_CALL=off` por defeito — chamadas automáticas desligadas. |
| `c462d01` | Botões do card `play` na mesma linha. |
| `ec07f15` | README com identidade visual completa. |
| `d77e1ba` | Normalização do JID alternativo no PV (`remoteJidAlt`/`remoteJidPn`). |
| `2d2c717` | `mediaQuality.js` — perfis baixa/média/alta para áudio/vídeo. |

---

## 1. Arranque e infraestrutura

| Ficheiro | Função |
|---|---|
| `src/index.js` (568 l) | Bootstrap: Express + EJS + `express-session` (MongoStore) + Socket.IO. Regista `liveBroadcaster.setIO(io)`. Rotas: `/` (auth), `/dashboard`, `/api`. Health: `/health` (Render), `/ping` (UptimeRobot), `/status`, `/diag` (diagnóstico com últimas 20 msgs mascaradas, estado de chamadas, auto-call), `/test-pv`. Auto-start do bot se existir `Session` guardada. Timers: refresh do `botConfigCache` a cada 5 min, `auraHuman.limparMoods`, `auraAgenda.arrancar`, `auraProativa.arrancar`, `scheduler`. Handlers `unhandledRejection`/`uncaughtException` que **não** matam o processo (v6.91). |
| `src/config.js` (87 l) | Normaliza env: `port`, `isProd`/`isProduction`, `sessionSecret`, `appUrl`, `channelUrl`, `owner{name,number,username,password}`, `bot{name,number,prefix}`, `mongodb.uri`, `cloudinary`, `ai{groq,gemini,openrouter,openai,cerebras,apifreellm,assemblyai,elevenlabs,tavily,huggingface}`, `tenorApiKey`, `maxYoutubeSeconds`, `stickerVideoMaxSec`. |
| `src/database/connection.js` / `migrate.js` | Ligação Mongoose e migrações. |
| `src/middleware/auth.js` | `requireAuth` / `requireOwner` para o dashboard. |
| `render.yaml` | Blueprint Render Free (porta 10000, `--max-old-space-size=400`, `/health`, yt-dlp opcional). |
| `.env.example` | Variáveis mínimas: servidor, dono, bot, MongoDB, IA (Groq/Gemini), `AUTO_CALL`, Cobalt/YT proxy, Tenor, Cloudinary. |
| `quickstart.js`, `fix-aura.js`, `tmp-load.js`, `mediaQuality.js` | Utilitários de raiz. `mediaQuality.js` é usado por `systemZeroPlay`/`downloads`. |

### Modelos MongoDB (`src/database/models/`, 19)

| Modelo | Campos-chave |
|---|---|
| `User` | username, password (bcrypt), whatsappNumber, role, premiumUntil, pvCommandsToday, vipGroupLimit, aiTone, aiMemoryId |
| `Session` | fileName, content — credenciais Baileys persistidas (via `mongoAuthState.js`) |
| `BotConfig` | key/value genérico (prefixos, owners extra, `dynamic_cases_v2`, temas, watermark…) |
| `GroupSettings` | botEnabled, antilink (modo/ação/warns/stats), antisticker, antispam, welcome/goodbye, onlyAdmins, prefixo, tema, tipo de grupo |
| `GroupMemberActivity` | mensagens/comandos por membro, warnings, inatividade |
| `Command` / `CommandOverride` | comandos criados no dashboard / overrides (enable, accessLevel, resposta custom) sobre comandos nativos |
| `Economy` | coins, bank, xp, level, aura, cooldowns (work/daily/rob/crime…), inventário, casamento |
| `RPGPlayer` | personagem, universo, raça, classe, stats, equipamento, quest, mundo, karma |
| `GameSession` | jogo ativo por grupo (estado, aposta, pote, vencedor) |
| `AiMemory` | histórico + perfil por utilizador para a IA/AURA |
| `BannedSticker` | hash de figurinhas banidas por grupo (sticker-ban da AURA) |
| `AntiStatus`, `DeletedMessage`, `DecryptLog`, `Log`, `Media`, `Payment`, `Schedule` | auxiliares (anti-status, anti-delete, logs do decrypter, mídia Cloudinary, pagamentos premium, agendamentos) |

---

## 2. Ligação WhatsApp

| Ficheiro | Função |
|---|---|
| `src/bot/whatsapp.js` (550 l) | Classe `WhatsAppBot` (singleton via `getBot(io)`). Auth: `useMongoAuthState` (produção) ou `useMultiFileAuthState` (local). Resolve versão WA, `makeWASocket` (`@systemzero/baileys`), backoff de reconexão, keep-alive de 14 min. Eventos: `creds.update`, `connection.update` (QR → Socket.IO, pair code), `messages.upsert` → `commandHandler`, `messages.update` (anti-delete), `group-participants.update` → `groupEvents`, `call` → `callHandler`. |
| `src/bot/mongoAuthState.js` | Persistência das creds/keys Baileys no modelo `Session`. |
| `src/bot/callSocket.js` | **Segundo** socket Baileys isolado só para chamadas (callbot). |
| `src/bot/callHandler.js`, `atenderChamada.js`, `realCall.js`, `callBridge.js`, `autoCall.js`, `liveVoip.js` | Pipeline de chamadas: atender (sequência WACRG), originar chamada real (o telemóvel toca), bridge que tenta todos os métodos, auto-call ao Dono (desligado por defeito), voz RTP experimental. |
| `src/bot/usync.js` | Resolução LID ⇄ número de telefone. |
| `src/bot/liveBroadcaster.js` | Emite `bot:log`, `bot:message`, `user:command` etc. para o dashboard via Socket.IO. |

---

## 3. Pipeline de mensagens (`src/bot/commandHandler.js`, 3077 l)

Ordem real dentro de `_handleInner(sock, msg)`:

1. **Normalização** — `unwrapWhatsAppMessage`, `normalizeIncomingMsg`, `extractText`, `getSenderInfo` (LID/PN, `remoteJidAlt`), ruído ignorável.
2. **Interceptores de UI** — resposta numérica do card de música (`musicaCard`), listas do RPG (`rpg/createFlow`), lista do `change` (temas), botões de plano premium.
3. **PrefixEngine v2** — prefixo por grupo/global, `ctx.prefixSource` (`group` | `global` | `button`).
4. **Dono + blacklist + configs** num único round-trip (`botConfigCache`): número env, número do dashboard, LID, owners extra.
5. **Proteções** — `antiLink` (DarkShield v2), `antiSpam` v3, `antiSticker` (aprendizagem por hash), `stickerBan`, `rulesEngine` (regras aprendidas por conversa).
6. **Regras de aluguel / cargo** — `roleResolver` (Dono, Subdono, VIP, Free, Admin do grupo), aviso de aluguel (v6.94: assistente nunca fica calada).
7. **Mídia sem comando** — AURA multimodal: ver imagem, ler documento, ler link, transcrever áudio, `stickerVision`, decrypt automático de ficheiros (`.ehi`, `.hat`, …).
8. **Sem prefixo → AURA** — `auraDecide` escolhe se responde; `auraBrain.rotearComIA` pode traduzir linguagem natural em comando (`caseHandler.runCase`); senão `auraHuman`/`auraModes` geram a resposta.
9. **Com prefixo → despacho de comando** (ordem de prioridade):
   1. `CommandOverride` do dashboard (pode desativar/restringir);
   2. limite Free no PV (50 cmds/dia);
   3. **`caseHandler.runCase`** — ~1870 cases (prioridade máxima);
   4. `packages/*` (interactions, family, economy, games, cheats);
   5. `nativeCommands`;
   6. `Command` da base de dados (criados no dashboard);
   7. comando desconhecido → sugestão por Levenshtein só se o prefixo real foi usado.
10. Pós-execução — `incrementUserCommand`, contadores do grupo, `reactions` (✅/❌), broadcast para o dashboard.

### Motor de cases (`src/bot/caseHandler.js`, 1227 l)

- `loadCases()` carrega todos os `src/bot/cases/*.js`; cada ficheiro exporta `function(registerCase)` e chama `registerCase(['play','music',…], handler)`.
- Cases dinâmicos guardados em `BotConfig.dynamic_cases_v2` (comandos `addcase` / `delcase` / `listcases`, só Dono). `detectFormat` aceita 4 formatos (switch-case clássico, `module.exports.execute`, função, arrow); `adaptCaseCode` traduz `conn`/`m`/`reply`; `validateCase` bloqueia `eval`, `Function(`, `child_process`, path traversal; `ensureDeps` instala dependências em falta.
- `buildM()` constrói o wrapper `m` clássico para compatibilidade com cases de outros bots.

### Ficheiros de cases (`src/bot/cases/`, 38 ficheiros, 10.8k l)

| Ficheiro | Área |
|---|---|
| `downloads.js`, `downloads2.js`, `musica.js` | play/play2/play3/playhq, ytd/gyt (botões), video/video2, TikTok/IG/FB/Twitter/Spotify via `dl/*`, card DARK TÓXICO |
| `stickers.js`, `stickers2.js`, `stickerly.js`, `pack.js`, `figcategorias.js`, `stickerBan.js` | figurinhas, packs, renomear, watermark, categorias, sticker.ly, ban por hash |
| `ia.js`, `ia2.js` | comandos de IA (gpt, imagine, transcrever, tts) — acordar/dormir AURA é por conversa (v7.40) |
| `grupos.js`, `audioAdmin2.js`, `online.js`, `medidores.js` | administração de grupos, anti-*, welcome, marcar todos, medidores/brincadeiras |
| `economia2.js`, `jogos2.js`, `interacoes2.js`, `random.js` | economia extra, jogos, interações, aleatórios |
| `rpg2.js`, `rpgSetup.js`, `rpgWorld.js`, `rpgCommunity.js` | RPG completo (usa `src/bot/rpg/*`) |
| `search2.js`, `texto2.js`, `logos.js`, `info.js` | pesquisas (Pinterest, imagens, wiki), texto fancy, logos, info/menus |
| `premium.js`, `rental2.js`, `finalizar.js`, `perf.js` | planos, aluguel de grupos, finalizar fluxo, performance |
| `change.js`, `dynamicSubmenus.js`, `chamadas.js` | temas do `change`, submenus dinâmicos, comandos de chamadas |
| `extras.js`, `extraCases.js`, `stubs.js` | miscelânea; `stubs.js` gera respostas funcionais para comandos ainda sem implementação real |

### Pacotes nativos (`src/bot/packages/`, 3.8k l)

`interactions.js` (~200 interações com GIFs Tenor), `family.js` (casamento, adoção, divórcio), `economy.js` (trabalho, daily, roubo, crime, loja, ranking), `games.js` (quiz com `quizData.js`, forca, velha, etc.), `cheats.js` (comandos de dono para economia/RPG).

### RPG (`src/bot/rpg/`, 2.4k l)

`createFlow.js` (criação por listas interativas), `engine.js` (combate, XP, drops), `world.js` (mundo com estado, viagens, descobertas), `community.js` (RPG por comunidades com rate-limit e adoção), `images.js`.

### Outros módulos de `src/bot/`

| Módulo | Função |
|---|---|
| `ai.js` (900+ l) | Roteador de IA com fallback e marcação de provider em baixo: Groq → Gemini → Cerebras → HuggingFace → OpenRouter → ApiFreeLLM; `transcribeAudio` (Groq Whisper / AssemblyAI), `speakElevenLabs`, `generateImage`, `searchTavily`, contexto web (RSS notícias), visão (Gemini). `aiSanitizer.js` limpa "thinking" e instruções internas. |
| `botPersonality.js`, `auraPersonality.js`, `themeResolver.js`, `themeFormatter.js`, `menuThemes.js`, `changeThemes.js`, `renderEngine.js`, `fancyText.js`, `menuBuilder.js` | Sistema visual: temas por grupo, `change`, molduras, tipografia, menus cyberpunk |
| `commandCatalog.js`, `commandDescriptions.js`, `submenuData.js`, `nativeCommands.js` | Catálogo de comandos/menus/submenus (auditado por `audit-org-comandos.js`) |
| `prefixEngine.js`, `prefixManager.js`, `roleResolver.js`, `userManager.js`, `botConfigCache.js`, `requestCache.js` | Prefixos, cargos, utilizadores atómicos, cache de config e de pedidos |
| `antiLink.js`, `antiSpam.js`, `antiSticker.js`, `messageListener.js` (anti-delete), `groupEvents.js` (welcome/goodbye + trial 3 dias) | Proteção e eventos de grupo |
| `stickerMaker.js`, `stickerPack.js`, `stickerRename.js`, `stickerWm.js`, `stickerVision.js`, `stickerly.js`, `watermark.js`, `gifHelper.js`, `compressor.js`, `mediaHandler.js`, `welcomeImage.js` | Pipeline de mídia (sharp + ffmpeg) |
| `systemZeroPlay.js`, `ytdl.js`, `downloader.js`, `dl/{helpers,social,others}.js`, `musicaCard.js` | Downloads: SystemZone API → yt-dlp → `@distube/ytdl-core` → youtubei.js → Invidious; social via Cobalt/worker |
| `imageSearch.js`, `pinterestSearch.js`, `erome.js`, `sexcom.js`, `portal18.js` | Pesquisa de imagens; Portal 18+ owner-only com entrega privada |
| `scheduler.js`, `facebookPublisher.js`, `performance.js`, `reactions.js`, `darkUtils.js`, `caseAxios.js`, `buttonHandler.js`, `messageRouter.js` | Agendamentos, publicação FB, perf, reações, utilitários |

---

## 4. AURA (`src/aura/`, 33 ficheiros, 9.7k l)

Camadas, na ordem em que uma mensagem passa:

| Camada | Ficheiros | Função |
|---|---|---|
| **Decisão** | `auraDecide.js`, `auraTalk.js`, `auraModes.js` | Se responde e como (menção, resposta, PV, janela de 3 min de conversa). Dois modos por grupo: *pessoa* (AURA 19 anos, leal ao Dark) e *assistente*. Acordada por defeito nos grupos (v6.93). |
| **Contexto** | `context/userContext.js`, `auraAssunto.js`, `auraHistorico.js`, `auraMemory.js`, `auraAvancada.js`, `memory/*` | Quem fala (Dono/Subdono/VIP/Free/ADM), assunto atual, leitura das mensagens citadas do grupo, memória curta (1h) e longa (`AiMemory`), lealdade, memória de grupo, ações agendadas. |
| **Compreensão** | `auraIntent.js`, `auraBrain.js`, `auraInterpret.js`, `auraInstructionGuard.js`, `decision/intentHandler.js` | Intenção → 3 camadas por custo (regex → tabela de capacidades → IA). `auraInterpret` reformula pedidos recusados pelos modelos. Guard: instruções ≠ comandos. |
| **Execução** | `auraExec.js`, `auraActions.js`, `auraCommands.js`, `auraGrupo.js`, `auraCanais.js`, `actions/{mega,advanced,profile}Actions.js` | Executa capacidades reais: comandos sem prefixo, promote/demote, criar canal, entrar por link, aceitar convites, perfil, +100 mega-ações (só Dono/admin com gates). |
| **Aprendizagem** | `rulesEngine.js`, `stickerBan.js` | Aprende qualquer regra por conversa ("bane quem mandar link X") e executa sozinha; banimento de figurinhas ensinado por resposta. |
| **Voz e mídia** | `auraVoz.js`, `auraMedia.js` | Áudio (ElevenLabs / fallback), texto limpo sem rubricas; vê/ouve/lê imagens, áudio, documentos, links. |
| **Proatividade** | `auraProativa.js`, `auraAgenda.js` | Fala quando quer (limites anti-spam); publicações periódicas (conselhos, notícias, daily). |
| **Saída** | `auraHuman.js`, `auraSanitizer.js`, `offlineResponses.js` | Personalidade final, humores, filtragem de instruções internas e emojis proibidos, respostas offline quando a IA está sem quota. |

---

## 5. Dashboard web (`src/routes/`, `src/views/`, `src/public/`)

- **Auth** (`routes/auth.js`): `/login`, `/register`, `/logout`; rate-limit; Dono criado a partir do env.
- **Dashboard** (`routes/dashboard.js`, 23 páginas EJS): `home`, `connect` (QR/pair code + callbot/VoIP), `control`, `console` (logs em tempo real), `broadcast`, `schedule`, `settings`, `ia`, `commands` + `command-edit`, `board` (overrides), `media`, `users`, `payments`, `stats`, `backup`, `groups`, `internet`, `decrypter`, `profile`, `subscribe`, `add-bot`.
- **API** (`routes/api.js`, ~60 endpoints): estado/ligar/logout/reset do bot, callbot e VoIP (`/voip/pair`, `/call/me`), CRUD de comandos e overrides, upload de mídia (Cloudinary), utilizadores (premium/free), broadcast, agendamentos, settings (canal, watermark, estilo/mídia do menu), pagamentos (aprovar/rejeitar), decrypt (ficheiro/URL/enviar por WA), grupos (settings, membros, enviar, banir, sair), backup export/import/reset, controlo (`/control/:action`).
- **Front**: `public/css/style.css` (cyberpunk), `public/js/app.js` (Socket.IO client).

## 6. Dark Net Engine — Decrypter (`src/decrypter/`, 3.2k l)

`engine.js` deteta e decifra configs de VPN/tunnel: `ehi` (HTTP Injector), `hat` (HA Tunnel), `npv`, `netmod`, `darktunnel`, `anytunnel`, `apnalite`, `tlstunnel`, `wyrvpn`, `bdnet`, `ssh`, `openvpn`, `wireguard`, `json`, `text`. `brute.js` tenta chaves conhecidas, `formatter.js` produz o texto final, `DecryptLog` regista. Invocado pelo dashboard e automaticamente no WhatsApp quando chega um documento suportado (`handleDecryptRequest`).

## 7. Simulador e scripts

- `src/sim/` — WhatsApp falso no browser (`npm run sim`) com `fakeSock.js` para testar mensagens e chamadas sem ligação real.
- `scripts/` (110 ficheiros) — `check-syntax`, `check-ejs`, `audit-commands`, `audit-org-comandos`, testes por área (AURA ×30, RPG, downloads, stickers, economia, menus, cargos, chamadas/VoIP, pair code, temas, rules engine) e utilitários (`gen-stubs`, `fix-*`, `setup-voip`, `test-diag-producao`).
- `incoming-cases/` — 19 snippets externos ainda **não integrados** (dependem de `conn`, `waguri`, `pdfkit`, ESM…; ver `INTEGRATION-PLAN.md`).
- `exports/case-som-portavel.js` — case exportado.

---

## Alterações locais v7.27 (2026-09-04) — GIF espelho + bot subdono

### GIFs (interações, zoeira/medidores, economia, família, nativos)
Diagnóstico: a Tenor API v2 foi **descontinuada pela Google** (403) e a v1 exige key; nekos.best devolvia 403 por User-Agent de browser; o mapeamento antigo fazia `includes()` em frases inglesas e quase tudo (`rico`, `burro`, `psicopata`, `rei`…) caía em `happy`. Cada comando esperava ~13 s de timeouts antes do fallback.

- `src/bot/gifHelper.js` reescrito: catálogo `ACTIONS` (≈190 ações) → reações por fonte; 6 fontes sem key consultadas **em paralelo** (`otakugifs`, `nekos.best` com UA de bot, `purrbot v2`, `waifu.pics`, `some-random-api`, `nekos.life`) + Tenor/Giphy só se houver key; **sem filtro de conteúdo** (`contentfilter=off`, `rating=r`); prioridade = reação exata → vizinha → repetida; converte GIF/WebP/PNG → MP4 `gifPlayback`.
- `mediaHandler.fetchBuffer/fetchJson` aceitam `opts.headers`.
- `packages/interactions.js`, `cases/medidores.js`, `packages/economy.js`, `packages/family.js`, `nativeCommands.js`: passam a **ação canónica** (`slap`, `rich`, `marry`, `summon`…) em vez de frases Tenor.
- Novo `scripts/test-gif-espelho.js` (`npm run test:gif`, `test:gif-live`): 130/130 OK; ao vivo, 6–12 candidatos por ação de 4–5 fontes, MP4 em 0,8–3,9 s.

### Número do bot = SUBDONO
- `whatsapp.js`: `emitOwnEvents: true`.
- `messageRouter.js`: mensagens `fromMe` entram no pipeline **só** se começarem por prefixo activo + nome de comando (respostas do bot nunca têm prefixo → sem loop). Inbox marca `bot·self`.
- `commandHandler.js`: `ctx.isBotSelf` (fromMe / `sock.user.id` / `BOT_NUMBER` / LID do bot) → `isOwner=true`, `ctx.isSubOwner=true`, **`isPrimaryOwner=false`** (sem "Criador Supremo" nem comandos exclusivos do Dono).
- `roleResolver.js`: idem (passo 1b). `aura/context/userContext.js`: números hardcoded removidos; `BOT_NUMBER` vai para `SUBOWNER_NUMBERS`.
- Novo `scripts/test-bot-subdono.js` (`npm run test:subdono`): 15/15 OK.

## Alterações locais v7.28 (2026-09-04) — AURA sabe QUEM fala (pelo número)

Problema: AURA, assistente e IA identificavam as pessoas pelo `pushName`. Qualquer um com "Dark" no nome podia ser tratado como Dono pela IA; dois membros com o mesmo nome misturavam-se; o histórico do grupo (`AiMemory GROUP:<jid>`) e o `groupContext` guardavam só `Nome: texto`.

- Novo `src/aura/auraIdentidade.js`:
  - `identificar(sock,msg,ctx)` → `{numero, lid, jid, pushName, verificadoPorNumero, isOwner, isBotSelf, cargo, rotulo}`. Fonte de verdade = número; LID resolvido por `participantAlt`/`remoteJidAlt`, `groupMetadata.phoneNumber/lid`, cache LID↔PN e `signalRepository.lidMapping`. Sem número confirmado → `lid:…` marcado "não verificado" (nunca inventa).
  - Perfil por **pessoa × chat**: total, últimas 12 msgs, palavras mais usadas, a quem respondeu, nomes já usados, alcunha. Persistido em `BotConfig aura_ident_*` a cada 60 s.
  - `blocoParaPrompt()` → "IDENTIDADE (regra absoluta): reconheces pelo NÚMERO… QUEM FALA AGORA: +244…|nome (não verificado) · cargo REAL … ESTÁ A RESPONDER A: +… · OUTRAS PESSOAS NESTE GRUPO: …".
  - `contextoGrupoComNumeros()` e `linhaHistorico()` → `[+244…|Nome]: texto` em vez de `Nome: texto`.
- `commandHandler.js`: identifica e regista **todas** as mensagens (com ou sem comando) logo após resolver dono/subdono; aprende pares LID↔PN do `groupMetadata`; groupContext, PV context e AiMemory usam o número; bloco de identidade entra na consciência da AURA e no assistente; `auraRespond` recebe `isSubOwner`.
- `auraHuman.js`: prompt diz que o nome exibido não prova nada, detecta impostor com "Dark" no nome, e tem bloco próprio para SUBDONO (número do bot / `owner_numbers`: obedece, mas não é o Dark). Limite da consciência 1600 → 3200 chars.
- `auraModes.js`: assistente recebe `opts.identidade`. `index.js`: arranca a persistência.
- Novo `scripts/test-aura-identidade.js` (`npm run test:identidade`): 29/29 OK.

## Validação executada (2026-09-04)

Ambiente: Node v20.20.2, `npm ci --ignore-scripts` + `npm rebuild sharp --foreground-scripts`.

- `npm test` (suite completa, ~78 auditorias incl. `test:gif`, `test:subdono` e `test:identidade`): **exit 0 — 0 falhas** em ~11,5 min.
  - Cargos 12/12, AURA brain 21/21, E2E 16/16, submenus 85/85, MENU18 32/32, AURA avançada 19/19, admin-dono OK, casehandler v7 + addcase-pin OK, rules engine OK.
- `node scripts/check-syntax.js`: OK · `check-ejs.js`: OK · `audit-commands.js`: OK · `audit-org-comandos.js`: OK (sem fantasmas/stubs).
- `npm audit --omit=dev`: não concluiu no sandbox por timeout de rede (última medição conhecida: 9 vulnerabilidades, 1 moderada / 8 altas, transitivas).

## Pontos de atenção para próximas alterações

1. **Versão:** `package.json` continua em `6.92.0`, mas o código já tem marcas v6.95 / v7.2x. Alinhar só numa release deliberada.
2. **Segredos:** o token GitHub veio em `uploads/text.txt` (fora do repositório). Não foi gravado no remote (`origin` ficou sem credenciais) nem em ficheiros versionados. Deve ser **revogado** e substituído por um token de escopo mínimo.
3. **Dependências:** `sharp`, `wa-sticker-formatter`, `yt-search`, axios/file-type/image-size transitivas com alertas. Atualizar incrementalmente com a suíte a correr; nunca `npm audit fix --force`.
4. **Execução dinâmica:** `caseHandler.compileCase` usa `eval` e `ensureDeps` instala pacotes — só o Dono chega lá e `validateCase` filtra; preservar esses gates em qualquer alteração.
5. **LID vs PN:** toda a lógica de identidade (dono, admin, PV) já compara `id/jid/lid/pn/phoneNumber`. Novas funcionalidades devem usar `roleResolver` e `usync` em vez de comparar strings de JID.
6. **Chamadas:** `AUTO_CALL=off` por defeito; `realCall`/`liveVoip` são experimentais e dependem da versão do Baileys.
7. **Rede em testes:** auditorias de downloads/pesquisa dependem de APIs externas (SystemZone, yande.re, Tenor) e podem falhar sem significar regressão.
8. **incoming-cases:** não registar nenhum via `addcase` sem antes converter para o contexto nativo e rever segurança.

## Procedimento padrão para futuras tarefas

```bash
cd /home/user/dark-bot
git pull --ff-only origin main
npm ci && npm rebuild sharp --foreground-scripts
npm test
```

Antes de mexer em produção: reproduzir com um teste isolado, alterar o menor bloco possível, executar sintaxe/EJS/auditorias relevantes e por fim a suíte completa. Para mudanças de MongoDB, WhatsApp, IA, Cloudinary ou VoIP, testar também com variáveis reais isoladas e nunca salvá-las no workspace.

## Alterações locais v7.29 — comandos por seleção (clique em lista/botão)
- Fluxo verificado: row id `${prefix}${cmd}` → `extractText` (listResponseMessage / interactiveResponseMessage.paramsJson / buttonsResponse / templateButtonReply) → `prefixEngine.detect` → handler. 61 itens `sel` em 15 categorias, 0 sem handler.
- Bug corrigido: 16 toggles (`adminToggles` em `cases/audioAdmin2.js` + `antispam` em `cases/grupos.js`) respondiam só "Uso: on|off" quando clicados sem args. Agora sem argumento **alternam** o estado (on↔off); `status|help|ajuda` mostra a ajuda.
- Novo teste `scripts/test-selecao-cmds.js` (`npm run test:selecao`, no `npm test`): executa cada comando `sel` com args vazios e falha se a resposta for apenas texto de uso.

## Alterações locais v7.30 — C∆P (Capture) + submenu planos + aluguel avançado
- **`src/cap/capEngine.js`** — motor C∆P: alvos (`ig:user`), verificação periódica (padrão 30 min, backoff em 429), download com verificação (bytes/mime sniff), galeria em `data/cap/<alvo>/` (+ .txt com legenda), envio para destinos WA com legenda C∆P, log (`baixado|parcial|falhou|enviado|erro`), `capturarTudo` (capture all), stories/feed completo só com `sessionid` (guardado em `data/cap/cap.json` + espelho `BotConfig cap_state`, nunca versionado). Fase 1: Instagram via `web_profile_info` (12 posts públicos sem login). 1.ª verificação apenas marca histórico como visto (sem spam).
- **`src/bot/cases/cap.js`** — `!cap add|del|lista|ver|check|all|ultimo|destino|guardar|auto|stories|intervalo|galeria|log|login|logout` (dono/subdono). `cap login` apaga a mensagem com o cookie.
- `src/index.js` — `capEngine.arrancar()` + `start(getSock)` no arranque.
- **`planos`** deixou de ser alias de `vip`: submenu próprio em `rental2.js` (estado VIP + aluguel do grupo, lista `single_select` → vip/alugar/trial/statusalugar/perfil/dono).
- **Aluguel avançado** (`!alugar`): `30`/`+7` soma ao tempo restante, `-3` subtrai (só dono/subdono), `=30` define exacto, `<jid> op` para outro grupo; encerra quando chega a 0; limite VIP só conta em activação nova.
- `scripts/test-cap-planos.js` (`npm run test:cap`, no `npm test`) — 37 checks (rede IG tolerante a 429).
- v7.31: `cap ver` espelha o sssinstagram (posts · followers · following · bio · separadores POSTS/REELS/STORIES/HIGHLIGHTS); novos `cap reels|highlights|storys @user [n]`; `igHighlights` (tray + reels_media highlight:ID, requer sessão). Análise sssinstagram: Worker Hub `api-wh.sssinstagram.com` com body assinado (`_s` SHA-256, chunk ofuscado) + Cloudflare Turnstile → inviável server-side; fonte deles é a API privada IG com contas logadas (mesmo que `cap login`).
- v7.32: sessões IG em **pool** (`state.session.igPool`, rotação por pedido + UA rotativo + hosts www/i.instagram + retry/backoff em 429 via `igGet`); `cap login` valida com `accounts/current_user` e responde "Logado como @x"; `cap sessoes`, `cap testar`, `cap logout [@conta|all]`; `IG_SESSIONID` no `.env` (carregado se pool vazio); `login_required` marca a sessão inválida e avisa o dono no PV (1x). Motivo: 429 no servidor do user sem login.
- v7.33 (429 no servidor): fallback **yt-dlp** por item (`ytdlpItem`) quando o CDN/API falha — validado a baixar reel com IP em 429; `cap link <url>`; proxy opcional `CAP_PROXY` (https-proxy-agent adicionado) só para instagram.com; mensagem 429 explica causa/solução. APIs públicas de terceiros (siputzx, zahwazein, ryzendesu, agatz, vreden, nekolabs) testadas → todas mortas/503; não usar.
- v7.34: **login IG por utilizador/senha** (`src/cap/igLogin.js`, web login ajax com `enc_password #PWD_INSTAGRAM_BROWSER:0`; trata 2FA/checkpoint/429/senha errada; validado contra IG real → "senha incorrecta" para conta falsa). `!cap login <user> <senha>` (só PV, apaga msg). **Dashboard `/dashboard/cap`** (`views/dashboard/cap.ejs`, link na sidebar): login por senha ou sessionid, lista/teste/remoção de sessões, alvos (add/del/verificar), log. API: `/api/cap/state|login|logout|testar|alvo|check` (requireApiOwner).
- v7.35 — **dashboard ↔ bot sincronizados**: os toggles `antilink_enabled`, `antispam_enabled`, `reactions_enabled` do painel Controle eram gravados mas o bot nunca os lia. Agora: antiLink/antiSpam usam o global como padrão quando o grupo não decidiu (`antilinkOptOut`/`antispamOptOut` no GroupSettings; `!antilink off` no grupo vence o global); `reactions.react()` respeita `reactions_enabled`. Novo card "Funções avançadas" no Controle: adult_mode, theme_apply_all, godmode, tema activo (select 31 temas), tom da IA, blacklist, blocked_commands, disabled_users/groups, owner_numbers (todos lidos pelo bot via botConfigCache). Entrega de média validada: `!cap link` reel 9 MB → `sendMessage({video: Buffer, mimetype})` com magic `ftyp`. Posts só-foto sem sessão: embed também tem login-wall neste IP → exige `cap login`.

## v7.36 — AURA: voz completa + fim do spam "sem aluguel"
- **Áudio truncado**: `auraVoz.textoParaFalar` cortava em 500 chars, o handler cortava outra vez em 500 e recusava respostas >900 chars; ElevenLabs tinha timeout de 15s. Agora: até 1800 chars falados, `ai.splitForTts` parte por frases (≤900) e concatena os MP3, timeout 60s, e novo fallback grátis `ai.speakGoogleTts` (gTTS, pedaços de 190 chars) antes do espeak.
- **Spam do aviso sem aluguel**: `_avisoSemAluguel` disparava em QUALQUER mensagem de cada membro (cooldown por grupo+pessoa). Agora só dispara quando a mensagem parece comando (`prefixInfo || pareceComando`) e 1×/6h por grupo.
- Teste: `npm run test:auravozspam` (10 checks). Arsenal AURA auditado: 56 acções no `auraExec` (modos, canais, grupo, memória, agenda), identidade por número/LID mantida; `pushName` só para exibição.

## v7.37 — AURA: vontade própria + cérebro ligado às funções + aprendizagem
- `src/aura/auraVontade.js`: saturação por pessoa (msgs/2min, repetição, monossílabos), humor do chat pesa; `querResponder()` corre DEPOIS do `deveResponder` (Dark em PV com pergunta nunca é ignorado); a IA pode responder `[SILENCIO]` ou `[REAGIR:emoji]` e o handler respeita.
- `src/aura/auraCerebro.js`: a IA recebe a lista de ferramentas reais (capacidades do `auraBrain` + `CMDS_IA` do `auraCommands`, filtradas por cargo) e pede-as com `[FAZ:<id> <arg>]`; execução via `auraExec`/`caseHandler.runCase`/`nativeCommands` com as MESMAS permissões (`podeFazer`/`podeExecutar`, `BLOQUEADOS`); máx. 2 por resposta. Aprende com `[APRENDI:facto]` (pessoa → `auraMemory` importante) e `[APRENDI_GRUPO:facto]` (→ BotConfig `aura_saber_<jid>`, máx 20), reinjectado no prompt seguinte via `saberParaPrompt`.
- `auraHuman.consciencia` cap 3200→6500 chars. `auraVoz.limparParaTts` ignora os marcadores novos.
- Teste: `npm run test:auravontade` (30 checks).

## v7.46 — Anti-tipos (as protecções passaram a funcionar)
- Diagnóstico: `.antistatus/.antiflood/.antidoc/.antiloc/.antifigurinha/.antibtn/.antipalavra/.antitoxic/.antiporn/.antilinkhard|soft|gp|canal` só gravavam a flag (audioAdmin2.js adminToggles) — **nenhum módulo as lia**; os campos nem existiam no schema (strict → nem gravava). Só antilink/antispam/antisticker eram reais. Qualquer membro podia ligar/desligar.
- `src/bot/antiTipos.js` (novo): `detectar(msg, gs)` + `check(sock,msg)` no messageRouter (a par de antiLink/antiSpam). Cobre: antistatus (statusMentionMessage/groupStatusMentionMessage/statusSourceType), **antimencao** (≥`antimencaoMax` 8 @s ou @todos), **antipagamento** (request/sendPayment/paymentInvite), **antiinvisivel** (zero-width, fantasma, zalgo, lixo unicode), antiflood (repetida 4×/30 s, >6000 chars, 12 linhas iguais), antidoc, antiloc, antifigurinha/antifig, antibtn, antipalavra (`palavrasProibidas`), antitoxic (lista interna), antiporn (termos). Desembrulha ephemeral/viewOnce. Acção: apaga + aviso (cooldown 20 s) → 3.º remove; admins/Dono imunes; sem bot admin não faz nada.
- GroupSettings: campos novos (todas as flags + `palavrasProibidas`, `antimencaoMax`, `antitiposMaxWarns`, `antitiposNotify`).
- Toggles agora só Dono/Admin (isAdminFn). Novos: `.antimencao .antipagamento .antiinvisivel .addpalavra .delpalavra .palavras`. antilinkhard→kick 1 aviso all_links; soft→só apaga; gp→whatsapp_only; canal→all_links.
- Teste `scripts/test-antitipos.js` 34/34.

## v7.45 — Humanizador (comportamento de pessoa)
- `src/bot/humanizer.js`: embrulha `sock.sendMessage` uma vez (whatsapp.js após makeWASocket). Antes de responder a uma msg recebida: atraso 0.4–1.8 s → `readMessages` (✓✓ azul) → presença `composing`/`recording` → espera proporcional (texto ~40 cps, 0.7–4.5 s; PTT 1.5–6 s; media 0.9–3 s) → `paused` → envia. Envios seguidos ao mesmo chat (<12 s): 0.35–1.1 s. Envios de sistema (sem msg recebida): jitter 0.15–0.7 s. Reacções/delete/edit passam directo. PV sem resposta: marca lido 2.5–9 s depois (`lerSemResponder`). Grupos nunca são marcados lidos sem resposta. `HUMANIZE=off` desliga; `HUMANIZE_CPS`.
- messageRouter: `humanizer.notaRecebida(msg)` por msg, `lerSemResponder` quando nada respondeu.
- Broadcast (dashboard e AURA `sendBroadcast`): mínimo 6 s + jitter 0–4 s entre destinos (era 2 s fixo / 0).
- Auditoria AURA (anti-restrição): proactiva já era segura (1 msg/tick 5 min, ≥120 min por chat, só grupos 'aura' + PV do Dono, noite calada); PV a desconhecidos: não existe (falar_com = menção no grupo; ownerPv só ao Dono). Corrigido: `call_*` nível 'dono' no catálogo; `reagirTudo` reage a ~35 % das msgs com 1.5–7.5 s de atraso (era 100 % instantâneo); `reencaminhar` máx. 10 grupos e 5–9 s entre eles (era 400 ms sem limite); `reagirTudoCanal` tecto 15 reacções, 1.2–3 s entre elas (era 30 × 350 ms).
- Teste `scripts/test-humanizer.js` 10/10 (`npm run test:humanizer`).

## v7.44 — Anti-restrição (conta ficou restrita 06/09 após chamada + bot no PV)
- Diagnóstico: a chamada VoIP funcionou; depois um bot ligou para o PV → o `callHandler` respondeu automaticamente (texto + tentativa de callback) a um número desconhecido; somado a reconexões a cada 3 s, a Meta marcou "mensagens automáticas/em massa" (restrição temporária ~6 h; sessão mantém-se).
- `callHandler.onCall`: chamada de número que **nunca falou com o bot** (sem `User`) e sem modo explícito → modo `silencio` (rejeita sem mensagem). `tentarCallbackVozReal` só para o Dono.
- `callVoip`: 1 chamada de cada vez, máx. 20 min, 2 min entre chamadas, 6/hora (`_resetLimites` para testes). `.call` e "aura liga-me" só o Dono.
- `whatsapp.js`: BACKOFF 8s→2min (era 3s→48s); `403/forbidden` → estado `restricted`, espera 15 min, desliga chamadas activas; ao fechar o socket termina chamadas VoIP.
- Dashboard /connect: removidos os cartões antigos "Baileys de Chamadas (secundário)" e "Voz Real (3.º aparelho)" + rotas `/api/callbot/*`, `/api/voip/status|start|pair|logout`, auto-start do callSocket em index.js. Novo cartão "Chamadas de Voz (VoIP)" com `GET /api/voip/calls` (estado do bot, activas, limites) e `POST /api/voip/hangup`; estado `restricted` com aviso. CSS `.status-restricted/.status-off`.
- Testes: callvoip 16/16, callback 15/15 (expectativa actualizada), chamadas 29/29, brain 21/21, sintaxe OK.

## v7.43 — Chamadas de voz REAIS (VoIP) — `.call` / `.tocar` / `.fala` / `.desligar` + AURA
- **O que faltava**: `@systemzero/baileys` estava em 1.1.1 (só `rejectCall`; realCall.js fazia o telemóvel tocar mas sem áudio). A partir de **1.1.3** a lib traz VoIP nativo (`lib/Socket/voip/*`: WebRTC/SRTP, Opus) e activa sozinha `setupVoip(sock)` em `makeWASocket`: `sock.startCall(jid)`, `sock.startGroupCall(gjid)` (até 6), `sock.playCallAudio(callId, pcm s16le 16 kHz mono)`, `sock.stopCallAudio`, `sock.endCall`, estado em `sock.calls[id].status`, evento `call` com `accept/reject/timeout/terminate`. **Só envia áudio** (a lib não expõe o áudio recebido) → ela fala/toca na chamada e ouve por notas de voz (callHandler antigo mantém-se).
- Deps: `@systemzero/baileys ^1.1.4`, `opusscript ^0.1.1` (package.json); **ffmpeg** no servidor (`ffmpeg-static` ou `apt install ffmpeg`; `callVoip.ffmpegBin()` cai para o do sistema / `FFMPEG_PATH`).
- Novo `src/bot/callVoip.js`: `ligar(sock, chatJid)` (PV espera atender 35 s; grupo não espera), `tocarBuffer` (ffmpeg → PCM), `tocarMusica` (systemZeroPlay.ytAudio → buffer/url), `falar` (TTS speakWithFallback → chamada), `parar`, `desligar`, `activa`, `todas`; limpa estado no fim da chamada.
- Novo `src/bot/cases/chamadaVoz.js`: `.call/.ligar/.liga/.chamada` (sem número = VoIP neste chat; com número → `.ligarnum` antigo), `.tocar <música>`, `.fala <texto>`, `.pararmusica`, `.desligar`, `.callstatus` (dono). Mensagens na voz dela; ela cumprimenta na própria chamada ao atender.
- `chamadas.js`: aliases `call/chamada` do modo de chamadas passaram a `chamadas/calls/modochamadas`; `ligar/call` por número → `ligarnum`; `desligar` PTT → `encerrar`.
- AURA: `auraActions` `ligar`/`ligarGrupo` usam VoIP primeiro ("aura liga-me" → toca, atende, ela fala); `auraBrain` capacidades `call_tocar` ("toca X na call"), `call_falar` ("diz na call que…"), `call_parar`, `call_desligar` → `auraExec`.
- Teste `npm run test:callvoip` (15 checks, sock mockado + conversão PCM real com ffmpeg).

## v7.42 — Linha do tempo do grupo ("quem fez, faz, fez quando") + actualizada antes de responder
- Novo `src/aura/auraLinhaTempo.js`: regista eventos do grupo com data — entrou/adicionou, saiu, removido (autor≠alvo), promovido, despromovido, fechou/abriu, nome/descrição, e os comandos que ELA executou por ordem de alguém (`doComando`). Fonte: `group-participants.update` e `groups.update` (whatsapp.js) + auraCommands/router universal (commandHandler). Persistência `BotConfig aura_timeline_<jid>` (400 eventos, debounce 4 s).
- Consulta directa antes do cérebro: "quem promoveu o João?", "quem removeu a Maria?", "quem fechou o grupo?", "o que aconteceu aqui hoje/ontem/esta semana?", "quem saiu ontem?" → lista com @menções e `quandoFoi` ("hoje às 14:03", "há 3 dias"). Sem registos → diz que foi antes de começar a tomar nota (não inventa).
- `paraPrompt(jid)` entra na consciência (últimos 6 acontecimentos) para ela saber os factos ao conversar.
- `ai.needsWeb` alargado (últimos/2024-29/preço/custa/dólar/kwanza/quem é o presidente/ainda existe/já saiu/morreu/eleições…) → vai à net antes de responder quando a pergunta depende de estar actualizada; junto com o `blocoTemporal` (v7.40) diz a data do que é antigo.
- Testes: cases 19/19, vontade-cérebro 30/30, comandos 22/22, brain 21/21, modes 28/28, grupo OK.

## v7.41 — A voz da AURA em tudo (`src/aura/auraFala.js`)
- Auditoria do pedido "verifica se a Aura deixa mensagem programada": ela saía do personagem em 5 sítios — `Não consegui: <erro técnico>` (brain/actions), `Diz outra vez o que queres, sem rodeios.` (interpret), `Entendi./Ok./👋` e `_confusa_ Não entendi muito bem` (fallback offline), e os comandos executados por conversa a responder `❌ Uso: !cmd <arg>` / `TypeError…` / `Só o Dono pode`.
- `auraFala.dizer(tipo,{isOwner,jid,oque,precisa})` — frases dela por situação (naoPercebi / naoConsegui / faltaAlgo / naoPodes / semCabeca), variantes Dark vs outros, sem repetir a última no mesmo chat.
- `auraFala.humanizar(texto)` — reescreve mensagens com cara de sistema (`pareceBot`: ❌/⚠️/Uso:/erros JS/HTTP/"só o dono") mantendo a informação útil ("Uso: !ban @pessoa" → "Faço já — só me falta a pessoa (marca com @) 🌹"); erros técnicos nunca vazam.
- `auraFala.sockNaVozDela(sock)` — Proxy do sock passado aos comandos executados POR CONVERSA (auraCommands e router universal): texto com cara de bot sai na voz dela; reacções/média/textos normais intactos. Comando que rebenta → ela responde ("Tentei, mas não me deixou…") em vez de silêncio.
- Ligado em: commandHandler (brain exec, actions exec, r.msg, permissão negada do universal), auraInterpret.consertarSeRecusou, auraHuman.generateDynamicResponse, auraUniversal.executarComando.

## v7.40 — AURA universal: sem comandos próprios, executa QUALQUER comando por conversa, sabe a data, stickers só com ela
- **Removidos** `src/bot/cases/auraInvoke.js` (`.aura/.aurasai/.auramodo/.auragrupos`) e entradas no `submenuData.js`. O `.aura` de brincadeira (GIF ⚡, packages/interactions) mantém-se. Acordar/dormir/estado agora por conversa (só dono): "aura acorda aqui", "aura dorme", "aura estás acordada?", "aura em que grupos estás acordada?" → `auraUniversal.gerirPresenca` (commandHandler, logo após `_auraAwakeHere`).
- **Novo `src/aura/auraUniversal.js`**:
  - `catalogo()` — mapa real de ~2090 comandos (FILE_SOURCES + CASES + nativos + pacotes) com descrição (`commandDescriptions`/`commandCatalog`), cache 5 min.
  - `escolherComando(texto, ai)` — pré-filtro léxico + SINONIMOS (toca→play, bane sticker→bansticker, liga→anti*…) → ~140 candidatos → IA devolve `{cmd,args}`; nomes fora do catálogo rejeitados.
  - `permissao()` — BLOQUEADOS de auraCommands (eval/broadcast/restart/addcase…) nunca; `ownerOnly` só dono; ADMIN_RE (ban/promote/anti*/bansticker…) admin ou VIP; VIP_RE (downloads/IA) VIP; resto livre.
  - `executarComando()` — `caseHandler.runCase` → nativo → pacote, com `isOwner` real de quem pediu.
  - Ligado no commandHandler DEPOIS do `auraCommands.detectarComando` e antes de `_fotosPedidas`: só se `brain.pareceOrdem` && !`eInstrucao`; comandos SENSIVEIS passam ainda por `auraInstructionGuard.eOrdem`. Sem permissão (não-dono) → "Isso é *!cmd* — precisas de X".
  - `blocoTemporal()` (data/hora Luanda + regra "diz a data se for coisa antiga / não inventes") e `blocoTamanho(texto)` (1 linha / 1–4 frases / completa até ~2500) injectados no prompt da AURA (`auraHuman.auraRespond`) e do assistente (`auraModes.assistantRespond`). `quandoFoi(ts)` usado no `auraHistorico` ("hoje às 14:03", "há 3 dias").
  - `politicaSticker()` — sticker solto em grupo: não responde (dono: 30% reage com emoji); reply/menção a ela ou PV: responde, ~35–40% com sticker dela (`responderComSticker`: gifHelper → stickerMaker). Ligado no deveResponder e antes do envio do texto.
- `ai.js`: `max_tokens` 1000→2000 (Groq/OpenRouter/Gemini) para respostas longas não cortarem.
- Testes: test:cases 19/19, vontade-cerebro 30/30, comandos 22/22, brain 21/21, modes 28/28.

## v7.39 — `!downcase` universal: qualquer comando sai como `case 'x': { … break; }` pronto para `!addcase`
- Antes só os cases dinâmicos saíam nesse formato; ficheiros mandavam o `registerCase([...], async …)` cru e nativos/pacotes o `fn.toString()`.
- Novo exportador em `caseHandler.js` (`buildCaseExport`, `exportFileCase`, `exportNativeCase`, `_topLevelDecls`, `_helpersUsedBy`, `_bodyOf`):
  cabeçalho `// ╔…╗` (origem, ficheiro:linha, aliases, variáveis disponíveis) + `case 'cmd': {` + **helpers do ficheiro original usados pelo corpo inlinados** (fecho transitivo; `require('../x')` → `./x`) + corpo + `break; }`.
  Nativos: `reply(sock,msg,ctx,txt)`/`react(sock,msg,e)` viram adaptadores `replyN/reactN`; `module.exports.x(` → `require('./nativeCommands').x(`.
- 5 fontes cobertas: dinâmico, ficheiro de cases, nativo, pacotes (interactions/family/economy/games/cheats) e gestão (addcase/downcase/… do próprio caseHandler, só consulta).
- Correcções de parsing que afectavam também o `!addcase`:
  - `extractCaseCode` aceita comentários antes do `case`.
  - Scanner `_matchClose` ciente de strings/templates/regex/comentários, partilhado por `extractBalancedBlock`, `extractSourceFromFile` e `_topLevelDecls` (um `)` numa string cortava o bloco — cap.js, downloads2.js).
  - `adaptCaseCode` só remove o **último** `break;` (removia o 1.º de um loop → "Unexpected token 'const'").
  - `extractSourceFromFile` já não perde o `)` em `async (c) => runPin(c), true)`.
  - Wrapper RAW_CODE avalia o código dentro de um bloco `{ }` → o case pode redeclarar `quoted`/`config`/`url`… sem "already declared".
- Verificação: round-trip downcase→extract→validate em **383/383 cases de ficheiro** e **173/173 nativos** (excepto os 2 `['rank'+cmd]` gerados em loop, que não têm nome estático); e2e real downcase→addcase→run para ping/ban/mediadown/beijar/play. `npm run test:cases` 19/19.

## v7.38 — addcase/downcase/listcases + mup/mdown verificados e corrigidos
- Harness `scripts/test-cases-media.js` (`npm run test:cases`, 19 checks) corre os comandos reais com sock/DB/Cloudinary mockados.
- **Bugs corrigidos em `caseHandler.js`**:
  1. `addcase` recebia `text` com quebras de linha colapsadas → um `// comentário` na 1ª linha engolia o código; gravava "com sucesso" mas o comando não fazia nada. Agora lê o texto original da mensagem (`ctx.fullText`).
  2. Formato `module.exports` falhava SEMPRE ("Unexpected token '.'"): o adaptador trocava `from`→`ctx.remoteJid` também nos PARÂMETROS de `execute(sock, from, …)`. Listas de parâmetros protegidas; e o módulo agora é avaliado dentro do wrapper (tinha "ctx is not defined" em runtime). Aceita `execute/run/handler/start` ou `module.exports = fn`.
  3. Formato `function`: usava o nome do COMANDO como nome da função (`!addcase ola` + `function meuCmd` → "ola is not defined"). Agora detecta o nome no código e a assinatura (m-first ou sock-first).
  4. "5️⃣ Texto simples" só funcionava com aspas; texto plano sem JS agora vira `string`.
- `mup/mdown/mlist/mdel` (aliases de mediaup/mediadown/medialist/mediadel): funcionam; upload Cloudinary + modelo Media, regex por prefixo de nome, só dono para up/del. Nada a corrigir.
- 1876 cases em disco continuam a compilar (antes = depois).
