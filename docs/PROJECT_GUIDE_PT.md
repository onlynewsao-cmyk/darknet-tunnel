# DARK BOT (`darknet-tunnel`) — guia técnico para continuidade

> **Fotografia-base analisada:** 14/10/2026 · branch `main` · commit `b43da6ab23f7c1820614bfc58ded181b21756cc8`
> **Branch de revisão actual:** `fix/aura-stability-2026-10` · destino `origin/fix/aura-stability-2026-10` (nunca `main`). `origin/main` avançou para `1c1be5c`; esta branch permanece baseada em `b43da6a` e não foi rebaseada sobre a alteração independente.
> **Pasta local:** `/home/user/dark-bot` · clone feito com `--depth 1` (histórico completo não transferido).
> **Pacote:** `dark-bot@9.20.0`. O número do pacote, os badges do README e os comentários internos não estão sincronizados; ver “Desfasamentos” abaixo.

Este documento descreve o **código que está neste checkout**, não certifica o comportamento de produção. Não foi criado `.env`, não foram instaladas dependências, nem foram ligados WhatsApp, MongoDB, Instagram, IA ou serviços de deploy. Desde a fotografia-base, esta branch recebeu correcções para limite/cancelamento da cadeia de IA, timeout de ligação WhatsApp, confirmação de acções destrutivas e três adições funcionais: transparência da persona AURA, aprendizagem de preferências globais do Dono com escopo seguro, tarefas persistentes com confirmação privada e vídeo de submenu em GIF mudo/loop. O estado detalhado está em `docs/AURA_STABILITY_REVIEW_PT.md`; os testes são mocks, sem validação de serviços reais.

## 1. Em poucas palavras

Apesar do nome GitHub `onlynewsao-cmyk/darknet-tunnel`, o projecto é uma aplicação Node.js chamada **DARK BOT**: um bot WhatsApp baseado em Baileys, com dashboard web, AURA (IA conversacional e execução de acções), comandos, moderação, mídia/downloads, jogos/RPG/economia, sessões, chamadas, um decrypter de configurações VPN/túnel e uma integração Instagram chamada C∆P.

É um projecto grande e de elevado poder operacional: pode ler/processar mensagens, moderar grupos, enviar mensagens, guardar sessões WhatsApp, executar comandos administrativos, fazer downloads, publicar/monitorizar dados externos e armazenar contactos. Antes de qualquer melhoria funcional, a prioridade recomendada é fechar as superfícies de autenticação e de privacidade descritas na secção 9.

## 2. Estado deste workspace

| Item | Estado observado |
|---|---|
| Origem identificada | `https://github.com/onlynewsao-cmyk/darknet-tunnel.git` (`origin` configurado) |
| Base da análise | `main` · `b43da6ab23f7c1820614bfc58ded181b21756cc8`; remoto `origin/main` em `1c1be5c` |
| Branch local de revisão | `fix/aura-stability-2026-10` · destino de publicação `origin/fix/aura-stability-2026-10`; sem alterações directas a `main` |
| Mensagem do commit-base | `fix(channels-status): prevent channel auto-replies, preserve admin group status, and fix Baileys imports` |
| Data do commit-base | `2026-10-14T08:35:31Z` |
| Ficheiros versionados na fotografia-base | 658 |
| `src/` na fotografia-base | 358 ficheiros; 306 JavaScript; 37 templates EJS |
| Módulos principais na fotografia-base | 53 ficheiros em `src/aura/`; 68 módulos em `src/bot/cases/`; 24 modelos MongoDB; 188 scripts em `scripts/` |
| Verificações da fotografia-base | 306 JS sem erros de sintaxe; 37 EJS com tags equilibradas; `git diff --check` sem erros |
| Verificações da branch | `node --check` em todos os JS alterados/novos; testes mockados: aprendizagem/agenda 16, política GIF 7, assistente 33, modos 28, cérebro 21, vontade/cérebro 39, confirmação, timeout de IA 3, timeout WhatsApp e assunto 5. `git diff --check` passou. `test-aura-avancada.js` e `test-aura-proativa.js` bloqueados por falta de `mongoose` |
| Dependências/runtime | Node `v20.20.2` e npm `10.8.2` disponíveis; `node_modules/` não instalado |
| Segredos | Não foi copiado `.env`; `.env.example` contém placeholders. Uma pesquisa estática por padrões comuns de tokens não encontrou um segredo óbvio; isso não substitui uma auditoria de segredos completa. |

O commit actual é um snapshot público; o clone raso permite analisar o estado presente, mas não reconstituir toda a história de alterações.

## 3. Arquitectura em mapa

```text
src/index.js
  ├─ config + ligação MongoDB + seed do utilizador Dono
  ├─ Express/EJS + sessões web + API + Socket.IO
  ├─ WhatsApp singleton (getBot) + recuperação da sessão
  └─ scheduler, agendas, AURA proactiva e tarefas de domínio

WhatsApp (baileys-v6 (alias oficial @whiskeysockets/baileys 6.7.24))
  └─ messages.upsert → src/bot/messageRouter.js
       ├─ normalização de JID/LID/PN, filtros e deduplicação
       ├─ messageListener (cache, actividade, anti-delete/spy opcionais)
       ├─ commandHandler (comandos, interacções e AURA)
       └─ antiLink / antiSpam / antiTipos / antiFoba / autoDl
            └─ resposta WhatsApp, persistência e eventos Socket.IO
```

### Arranque e sessão

1. `src/index.js` carrega `src/config.js`, tenta ligar ao MongoDB e sincroniza/cria a conta do Dono se as variáveis necessárias existirem. Em produção, o arranque é terminado se a ligação Mongo falhar.
2. É criado o servidor Express, as sessões do dashboard são persistidas pelo `connect-mongo`, registam-se as rotas e o Socket.IO. O bot pode reconectar automaticamente se existir o documento de credenciais `creds`.
3. `src/bot/whatsapp.js` cria o socket Baileys, usa `src/bot/mongoAuthState.js` com Mongo disponível e ficheiros locais como fallback. Suporta QR/pair-code, backoff, watchdog, reconexão e failover de sessões.
4. Há inicialização de agendadores e módulos de domínio. O arranque chama também `src/bot/rpg/reset788.js`; verificar cuidadosamente a condição de execução desse reset antes de alterar dados RPG ou a rotina de boot. `src/aura/memory/scheduledActions.js` mantém tarefas pontuais em `BotConfig`, interpreta `Africa/Luanda` e pede confirmação privada antes de executar.

### Entrada e execução de mensagens

- `messageRouter.process()` ignora eventos de histórico que não sejam `notify`, descarta ruído, normaliza mensagens e JIDs alternativos, aplica deduplicação e limita a concorrência global (8 por defeito). Lotes são paralelos entre chats, mantendo ordem dentro do mesmo chat do lote.
- Reacções, canais e feeds de status têm tratamento próprio; o código actual procura impedir que conteúdo de canais/status seja interpretado como conversa ou comando.
- **Não é uma cadeia estritamente sequencial:** o router chama `messageListener.onUpsert()` sem aguardar e executa `commandHandler`, filtros e alguns módulos de protecção em paralelo. Ao corrigir uma moderação, confirmar ordem, duplicação e corridas entre esses caminhos.
- `commandHandler.js` normaliza texto/interacções, resolve prefixos e identidade, verifica configuração/permissões, aplica limites e gates, e encaminha para cases, pacotes, comandos nativos ou AURA.
- `caseHandler.js` carrega comandos estáticos e cases dinâmicos guardados no Mongo. Um case dinâmico do Dono pode sobrepor um comando existente. O handler de RPG tem um gate próprio; o catch do gate está actualmente aberto (continua a execução após erro), pelo que esse caminho merece revisão.

### Cargos e permissões

O código usa Dono, número do próprio bot/subdono, utilizadores premium/VIP, administrador do grupo e utilizador free. `roleResolver.js` centraliza parte da resolução, mas o `commandHandler`, cada módulo/case e certas rotas também têm verificações próprias. **Não assumir que um gate global autoriza todos os comandos nem que `roleResolver` é a única implementação.** Para mudanças de permissão, verificar a cadeia completa e os testes de Dono/admin/VIP.

### AURA e IA

- **Percepção/decisão:** `auraBrain.js`, `auraIntent.js`, `auraDecide.js`, `auraDestinatario.js`, `auraContextual.js`.
- **Contexto/memória:** `auraHistorico.js`, `auraLinhaTempo.js`, `auraMemory.js`, `auraAvancada.js`, `AiMemory`.
- **Execução:** `auraCommands.js`, `auraExec.js`, `auraActions.js`, `auraUniversal.js`; capacidades naturais passam por gates de cargo antes de executar acções.
- **Identidade e entrega:** `auraIdentidade.js`, `auraHuman.js`, `auraFala.js`, `auraVoz.js`, `auraMedia.js`, `auraDelivery.js`.
- **IA externa:** `src/bot/ai.js` agrega providers e fallback — Groq, DeepSeek, Gemini, Hugging Face, Cerebras, ApiFreeLLM, OpenRouter e OpenAI, de acordo com configuração. Há cache e circuit breaker. A visão, transcrição, pesquisa web/Tavily e voz usam caminhos/providers adicionais.
- **Limite importante:** uma resposta da AURA pode envolver excertos de conversa, nomes/números, imagens ou áudio enviados a um provider externo. Confirmar minimização de dados e consentimento antes de ampliar memória, proactividade ou análise multimodal.
- **Identidade:** a persona é uma assistente automatizada com estilo goth ficcional. Os prompts não devem afirmar que é humana, consciente, parceira romântica ou uma pessoa/cosplayer real. `auraSelfie.getSelfie()` selecciona apenas imagens `aura_virtual_*`; novas gerações pedem ilustração não fotorealista e deixam claro que é personagem.
- **Aprendizagem:** preferências explícitas do Dono são guardadas globalmente e incluídas no contexto em todos os chats; a instrução mais recente prevalece. Factos pessoais não são generalizados; correcções de terceiros são locais. Regras condicionais destrutivas e links de convite permanecem limitados ao grupo em que foram ensinados.
- **Tarefas agendadas:** mensagens sem prefixo podem criar tarefas do Dono principal. Na hora definida, o bot envia pedido privado `CONFIRMAR TAREFA <id>`/`CANCELAR TAREFA <id>`. Só executa após confirmar e persistir a remoção da tarefa; pedidos sem capacidade reconhecida produzem lembrete, não alegação de execução.

## 4. Mapa dos componentes

| Área | Ficheiros de entrada / orientação |
|---|---|
| Bootstrap/configuração | `src/index.js`, `src/config.js`, `.env.example` |
| WhatsApp e sessão | `src/bot/whatsapp.js`, `mongoAuthState.js`, `sessionCenter.js`, `sessionBackup.js` |
| Router/commands | `src/bot/messageRouter.js`, `commandHandler.js`, `caseHandler.js`, `nativeCommands.js` |
| Comandos por domínio | `src/bot/cases/`, `src/bot/packages/`, `commandCatalog.js`, `submenuData.js` |
| AURA | `src/aura/` e `src/bot/ai.js` |
| Moderação | `antiLink.js`, `antiSpam.js`, `antiTipos.js`, `antiSticker.js`, `groupEvents.js`, `GroupSettings.js` |
| Downloads/mídia | `downloader.js`, `ytdl.js`, `convertEngine.js`, `mediaHandler.js`, `compressor.js`, `sticker*.js`, `src/bot/dl/` |
| RPG/economia/jogos | `src/bot/rpg/`, `src/bot/packages/`, `cases/rpg*.js`, modelos correspondentes |
| Dashboard e API | `src/routes/`, `src/middleware/auth.js`, `src/views/`, `src/public/` |
| Decrypter | `src/decrypter/` — parsers por formato + motor forense |
| Instagram/C∆P | `src/cap/capEngine.js`, `igLogin.js`, `apiKeys.js` |
| Contactos centrais | `src/bot/centralBase.js`, `capturaViva.js`, rotas `/api/central/*` |
| Chamadas | `callHandler.js`, `callVoip.js`, `callBridge.js`, `realCall.js`, `autoCall.js` |
| Testes | `scripts/`; vários scripts são regressão/mock, outros têm nomes “real/live” e podem usar rede. Inspeccionar antes de executar. |

Os ficheiros de maior acoplamento são `commandHandler.js` (4.308 linhas), `caseHandler.js` (1.491), `routes/api.js` (1.714), `ai.js` (1.358), `capEngine.js` (1.599) e `sessionCenter.js` (829). Alterações pequenas e testes específicos são mais seguras do que refactors amplos nestes módulos.

## 5. Dados, sessão e retenção

| Dados | Implementação/retensão observada | Atenção |
|---|---|---|
| Sessão web | `express-session` + MongoStore; cookie `httpOnly`, `sameSite=lax` e `secure` em produção | `SESSION_SECRET` tem fallback estático em `src/config.js`; o arranque não recusa explicitamente esse fallback em produção. |
| Credenciais WhatsApp | `mongoAuthState.js` serializa credenciais/keys Baileys para `Session.content`; sessões adicionais usam prefixos/slots | Não vi cifra ao nível da aplicação para estes documentos Baileys. Tratar Mongo, backups e exportações como credenciais de controlo da conta. |
| Memória AURA | `AiMemory` guarda até 40 mensagens por contexto; índice TTL após 7 dias sem interacção; o handler usa janelas menores no prompt | As mensagens de grupo usam contexto do grupo. O TTL depende dos índices TTL efectivamente criados no Mongo. |
| Actividade de grupo | `GroupMemberActivity` guarda números/nomes, mensagens, comandos e última actividade | É dado pessoal/profilagem de actividade; definir aviso e finalidade. |
| Anti-delete | Se activado, `DeletedMessage` guarda texto e payload raw; índice TTL de 7 dias | A activação permite recuperar mensagens eliminadas e enviá-las ao Dono. É uma função sensível. |
| “Espião” live | Se `spy_enabled`, emite para Socket.IO texto, autor, grupo/PV e tipo de mídia | O evento está sujeito ao problema crítico de autorização Socket.IO abaixo. |
| View-once | `auraViewOnce.js` grava mídia em `assets/view-once/` e mantém metadados em memória | Não encontrei retenção/limpeza da pasta. O fluxo normal chama `handleViewOnce()` no router e volta a chamá-lo no handler, pelo que pode gravar duas cópias. Isto contorna a expectativa de visualização única; desactivar/remover por defeito. |
| Central de contactos | `CentralContacto`/`CentralGrupo` e fallback `data/central`; guarda número, nome e proveniência de grupos; sincroniza alguns registos para `User` auto-criado | Não vi TTL geral. Captura exige base legal/consentimento, limitação de acesso e retenção. |
| Logs/decrypter | `DecryptLog` procura guardar metadados extraídos sem palavra-passe completa; saída do decrypter pode incluir credenciais VPN | Não partilhar ficheiros/resultados nem logs sem os sanear. |

## 6. Dashboard, rotas e APIs

O dashboard usa Express + EJS + Socket.IO. `dashboard.js` aplica `requireLogin` à área e `requireOwner` às páginas administrativas. A API mistura endpoints de sessão autenticada, owner e chaves `dk_` com escopos (`ig`, `wa`, `sistema`, `ia`, `admin`). A autorização precisa ser revista por endpoint — não há um único gate automático para toda a API.

Rotas públicas esperadas: `/ping`, `/health` e uma página `/status` simples. Há **duas** declarações para `GET /status`; a primeira responde imediatamente, tornando a seguinte, mais detalhada, inalcançável no fluxo normal.

### Problema crítico do Socket.IO

Em `src/index.js`, o servidor é criado com `cors: { origin: '*' }`, sem middleware de autenticação de handshake (`io.use`). Qualquer ligação nova recebe `bot.getStatus()`. `getStatus()` inclui `qr`, `pairingCode`, o utilizador ligado, logs recentes e outros dados; `whatsapp.js` também transmite estados/logs globalmente. Eventos como `bot:spy`, `bot:deleted`, `user:command`, `group:event`, `antilink:action`, `broadcast:*` e estados de sessão podem conter informação operacional ou pessoal.

**Impacto:** um cliente não autenticado que alcance o Socket.IO pode receber estado e eventos administrativos; durante o emparelhamento, QR/pair-code é especialmente sensível e pode comprometer a conta WhatsApp. Isto é uma análise estática do código, não foi feito teste de exploração.

Há uma segunda rota com o mesmo problema: `GET /api/bot/status` usa apenas `requireApiAuth` e devolve `getStatus()` inteiro, sem filtrar QR, pair-code, utilizador ou logs. Como `/register` aceita auto-registo free, um visitante pode criar conta e chamar este endpoint. A página de ligação é owner-only, mas a API não preserva essa fronteira.

### Diagnósticos públicos

`GET /diag` e `GET /test-pv` são registados directamente em `src/index.js`, antes das rotas autenticadas, sem middleware de login/owner:

- `/diag` devolve número do Dono/bot, flags de configuração, estado interno, `owner_lid`, listas de utilizadores/grupos desactivados, estado de chamadas e a caixa de entrada recente mascarada.
- `/test-pv` invoca `commandHandler.handle()` com mensagens e socket simulados; não envia via WhatsApp real pelo socket simulado, mas executa lógica do handler e pode tocar em serviços/DB/providers conforme a configuração.

Remover de produção ou proteger com owner + rate-limit; devolver apenas diagnóstico minimizado e nunca QR, pairing code, números ou inbox.

## 7. Decrypter, Instagram e automações

### Dark Net Decrypter

`src/decrypter/` reconhece EHI, HAT, NPV, DarkTunnel, TLS Tunnel, OpenVPN, SSH, JSON/V2Box, NetMod, AnyTunnel, BDNet, APNA Lite, WYRVPN, WireGuard e texto/URI. O fluxo tenta parser por extensão/conteúdo e inclui análise forense offline com candidatos de compressão/cifras/senhas comuns. Não é quebra universal de criptografia; ficheiros protegidos podem continuar sem leitura. O resultado pode revelar hosts, utilizadores, passwords, private keys ou tokens.

O endpoint `/api/decrypt/url` aceita URL de utilizador premium e chama `mediaHandler.fetchBuffer()`, que suporta HTTP(S) e segue redireccionamentos sem uma lista de IPs privados/hosts permitidos visível neste caminho. **Risco SSRF estático:** restringir host, esquema, resolução DNS/endereços locais e cada redirect, impor limites de tamanho/tempo; idealmente aceitar apenas origens explicitamente permitidas.

### C∆P / Instagram

A integração pode usar sessão Instagram, consultar perfis/stories/highlights, monitorizar alvos e servir endpoints com API keys. Tratar `IG_SESSIONID`, cookies e resultados como credenciais/dados pessoais; usar só em contas e conteúdos autorizados. Não guardar session IDs em exemplos/logs.

### Chamadas e divulgação

Há módulos para chamadas e sessões/failover, bem como comandos de broadcast/divulgação. Alguns caminhos usam linguagem de “anti-ban”, atrasos/jitter ou divulgação “invisível”. Não orientar melhorias para esconder automação, contornar controlos ou enviar sem consentimento. Melhorias seguras: listas opt-in, divulgação visível e identificada, limites conservadores, auditoria, cancelamento simples e respeito às regras do WhatsApp.

O repositório também inclui `portal18`/fontes adultas e amostras 18+. Manter segregação por idade, permissões, consentimento e distribuição legal; não incluir esses assets em demos públicas.

## 8. Instalação e execução — com cautela

Requisitos declarados: Node `>=18` (Docker usa Node 20), MongoDB em produção, FFmpeg para conversões/chamadas e Python/yt-dlp para certos downloads. O fluxo indicado pelo README é `npm ci`, copiar `.env.example` para `.env` e `npm start`, mas **não executar sem rever o hook**:

- `package.json` define `postinstall` que tenta instalar `yt-dlp` via `pip` sem versão fixada.
- `Dockerfile` também instala FFmpeg e `yt-dlp`, depois executa `npm ci --omit=dev`; o hook do package pode tentar outra instalação.
- `render.yaml` tem uma configuração de deploy diferente, com limite de heap menor do que o Dockerfile.
- O `SESSION_SECRET` de produção deve ser longo, aleatório e injectado pelo secret manager. Configurar Mongo, Dono, número do bot, `APP_URL` e pelo menos um provider de IA; chaves ficam fora do Git.

Para testes futuros, inspeccionar o script específico antes de correr. `scripts/check-syntax.js` e `scripts/check-ejs.js` foram executados sem instalar dependências; não foram executados `npm ci`, `npm test`, `npm audit`, testes “real/live”, nem qualquer deploy/sessão real.

## 9. Registo de riscos prioritários

| Prioridade | Evidência no checkout | Acção recomendada antes de produção/novas funcionalidades |
|---|---|---|
| **P0 — Socket.IO/API de status sem autorização suficiente** | `src/index.js`: `cors origin '*'`, sem `io.use`; no connect envia `getStatus()`. `whatsapp.js:getStatus()` inclui QR e pair-code; eventos são globais. Além disso, `/api/bot/status` devolve o mesmo objecto a qualquer utilizador autenticado; `/register` permite criar conta free. | Autenticar handshake com a sessão web; salas por role; fazer `/api/bot/status` owner-only e devolver payload minimizado; nunca enviar QR/pair-code/logs/spy a visitantes; separar status público mínimo; limitar origem. Criar testes de visitante e conta free. |
| **P0 — `/diag` e `/test-pv` públicos** | Registados sem `requireLogin`/`requireOwner`. `/diag` expõe dados internos/identificadores; `/test-pv` executa o handler. | Remover ou proteger owner-only, aplicar rate-limit e reduzir saída; teste HTTP anónimo deve obter 401/404. |
| **P1 — View-once guardado** | `auraViewOnce.js` escreve mídia sem TTL; router e commandHandler podem chamar o save no mesmo evento. | Desligar por defeito/remover; se existir caso legítimo, pedir consentimento explícito, idempotência por message ID, encriptação e retenção curta/eliminação verificável. |
| **P1 — SSRF pelo decrypter URL** | URL arbitrária HTTP(S) chega a `mediaHandler.fetchBuffer()`; redirects não mostram filtro de IP privado. | Allowlist de domínios, validação IPv4/IPv6 e DNS a cada redirect, negar loopback/link-local/metadata, limite de bytes/timeouts e rate-limit. |
| **P1 — Segredo de webhook acessível por chave `ig`** | `GET /api/ig/webhook/entregas` usa `_ig` (chave de escopo Instagram ou sessão Dono) e devolve `webhookSecret` junto com as entregas. | Tornar owner-only, remover o segredo da resposta e usar um escopo separado/rotação para gestão de webhooks. |
| **P1 — Secret de sessão com fallback estático** | `src/config.js` usa `dark-secret-change-me-2025` se `SESSION_SECRET` faltar; não vi bloqueio de boot em produção. | Em `NODE_ENV=production`, falhar se secret ausente/placeholder/fraco; rotacionar sessões após mudar o secret. |
| **P1 — Credenciais Baileys em Mongo** | `mongoAuthState.js` grava JSON de creds/keys em `Session.content`; não há cifra de aplicação neste módulo. | Cifra de envelope com chave fora da BD, acesso mínimo, backups cifrados e procedimento para apagar/reatribuir sessões após incidente. |
| **P1 — Privacidade/retensão de mensagens e contactos** | Anti-delete, spy, actividade de membros, view-once e Central de Contactos. Alguns dados têm TTL, outros não. | Desactivados por defeito, aviso/consentimento, minimização, auditoria de acessos e retenção por finalidade; rever políticas legais/local e termos das plataformas. |
| **P2 — Execução dinâmica** | `caseHandler` usa `eval`; instalação dinâmica usa `execSync('npm install …')`; `packages/cheats.js` expõe `eval`/`shell` com gate de Dono. | Não expor a rede; remover instalação automática; rever dependências num PR; preferir código revisto/versões fixadas; não chamar “sandbox” ao processo Node. |
| **P2 — Registo de contas aberto** | `/register` permite auto-registo free com limite em memória de 5/h por IP. | Se dashboard for privado, desactivar registo. Se for funcionalidade prevista, adicionar verificação e rate-limit persistente/por IP adequado. |
| **P2 — Chaves API em query string** | O resolver de `X-API-Key` também aceita `?key=`. | Preferir header `X-API-Key`/Bearer e deixar de aceitar query para reduzir exposição em logs, histórico e referrers. |
| **P2 — Comportamento de divulgação** | Módulos de divulgação/broadcast incluem ritmos anti-restrição e opções de invisibilidade. | Substituir por opt-in, transparência e limites explícitos; não implementar stealth ou evasão de anti-spam. |
| **P2 — Dependências e documentação** | Hook `postinstall` não fixado; documentação/versionamento divergentes. | Pin de ferramentas auxiliares, SBOM/audit numa branch de segurança; estabelecer uma versão única e gerar docs/testes do código actual. |

## 10. Desfasamentos de documentação

- `package.json`: `9.20.0`.
- Badge do README: `9.11.0`; a lista de novidades e contagens são promocionais/históricas e não prova de release.
- Comentários de código incluem séries `v12.9.x` (por exemplo, `commandHandler.js` contém `v12.9.50`).
- `ESTRUTURA_WORKSPACE.md` descreve um snapshot de Setembro e cita `v11.2.0`.
- `WORKSPACE_CONTEXT.md` e `docs/WORKSPACE_REVIEW_2026-09-16.md` descrevem o snapshot `v7.72.0`.
- `REPO_AUDIT.md` aponta para uma revisão mais antiga; `docs/ARCHITECTURE.md` diz ter sido gerado em 10/09.

Usar este guia para o mapa actual do checkout e abrir os ficheiros-fonte antes de confiar em números de comandos/testes. Não atualizar a versão do pacote apenas para fazê-la coincidir com comentários; definir primeiro qual é a versão oficial de release.

## 11. Sequência recomendada para as próximas melhorias

1. Fechar Socket.IO e endpoints diagnósticos; adicionar testes de acesso anónimo/owner e garantir que QR/pair-code nunca sai para o canal público.
2. Decidir política explícita para view-once, spy e anti-delete; remover recolha silenciosa e adicionar retenção/idempotência onde a função for mantida.
3. Corrigir SSRF e endurecer o `SESSION_SECRET`; rever protecção dos dados de sessão WhatsApp.
4. Confirmar gates (Dono/admin/VIP/free), sobretudo a execução dinâmica e o gate RPG fail-open, com testes isolados.
5. Depois, escolher uma funcionalidade de produto e fazer patch pequeno na área adequada, sem alterar simultaneamente AURA, permissões e router.
6. Instalar dependências apenas após rever o `postinstall`; correr primeiro `test:syntax`, `test:ejs` e testes da área. Testes com “real/live” precisam de ambiente isolado e segredos descartáveis.
7. Unificar release/versionamento e actualizar a documentação antiga.

**Linha de base executada nesta preparação:**

```text
node scripts/check-syntax.js  → 306 ficheiros, 0 erros
node scripts/check-ejs.js     → 37 templates, tags equilibradas
git diff --check              → OK
```

A revisão é estática e inicial. Não é pentest, não valida políticas de terceiros e não certifica cada comando, rota ou provider em produção.
