# DARK BOT — mapa técnico e funcional

> Documento gerado durante a revisão do workspace em **10/09/2026**. Não contém credenciais nem valores de `.env`.

## 1. Visão geral

O DARK BOT é uma aplicação Node.js que combina quatro superfícies:

1. **Runtime WhatsApp** — conexão Baileys, receção/normalização de mensagens, roteamento de comandos, envio de texto/mídia e reconexão.
2. **AURA** — camada conversacional com memória, intenção, personalidade, regras, ações, mídia, voz e execução autorizada de comandos.
3. **Dashboard web** — Express + EJS + Socket.IO para conexão, operação, gestão, pagamentos, mídia, decrypter, grupos e monitorização.
4. **Serviços de domínio** — MongoDB, downloads/conversão, RPG/economia, proteção de grupos, chamadas VoIP e Dark Net Decrypter.

Entrada principal: `src/index.js`. A aplicação exige Node 18+, MongoDB e pelo menos um provider de IA para a experiência completa.

## 2. Fluxo de uma mensagem

```text
Baileys
  -> src/bot/messageListener.js
  -> humanização / contexto / anti-tipos / grupo
  -> src/bot/messageRouter.js
  -> commandHandler ou AURA
  -> caseHandler / nativeCommands / módulos especializados
  -> mediaHandler, downloader, sticker, áudio ou texto
  -> resposta WhatsApp + eventos Socket.IO + logs
```

- `whatsapp.js` mantém a sessão, QR/pair-code, eventos de conexão e persistência Mongo.
- `messageListener.js` transforma o evento Baileys em uma mensagem interna.
- `prefixEngine.js` e `prefixManager.js` resolvem prefixo global, por grupo e aliases.
- `roleResolver.js` aplica Dono, subdono, admin, VIP, premium, membro e utilizador comum.
- `humanizer.js` marca leitura e simula escrita/gravação com atraso configurável.
- `antiLink.js`, `antiSpam.js`, `antiSticker.js` e `antiTipos.js` impõem proteção conforme as definições do grupo.
- `buttonHandler.js` trata respostas interativas; `groupEvents.js` trata alterações de grupo e alimenta a linha do tempo da AURA.

## 3. Comandos

O catálogo é composto por:

- `src/bot/cases/` — casos de comandos organizados por domínio;
- `src/bot/caseHandler.js` — resolução e execução do caso;
- `src/bot/nativeCommands.js` — comandos internos/estruturais;
- `src/bot/commandCatalog.js` e `commandDescriptions.js` — catálogo e ajuda;
- `src/bot/submenuData.js`, `menuBuilder.js`, `menuThemes.js` — menus e temas;
- `src/bot/cases/dl/` — downloads e conversões;
- `src/bot/cases/packages/` — pacotes de comandos;
- `src/bot/rpg/` — RPG, comunidade, combate e economia.

O comando pode chegar por prefixo, botão/lista ou linguagem natural da AURA. A execução natural não ignora permissões: a intenção é convertida para o mesmo pipeline de autorização do comando explícito.

## 4. AURA

`src/aura/` é modular e separa conversa de execução:

- **Perceção e intenção:** `auraBrain`, `auraIntent`, `auraInterpret`, `auraDecide`;
- **Contexto e memória:** `auraHistorico`, `auraMemory`, `auraLinhaTempo`, `auraAssunto`, `context/`, `memory/`;
- **Personalidade e fala:** `auraIdentidade`, `auraHuman`, `auraFala`, `auraTalk`, `auraModes`, `auraPersonality`;
- **Ações:** `auraActions`, `auraExec`, `auraCommands`, `actions/`, `decision/`;
- **Grupo e proatividade:** `auraGrupo`, `auraProativa`, `auraAgenda`, `auraCanais`;
- **Mídia/voz:** `auraMedia`, `auraVoz`, `stickerVision`;
- **Segurança:** `auraInstructionGuard`, `auraSanitizer`, `rulesEngine`, `stickerBan`.

O modo offline (`offlineResponses.js`) permite respostas básicas quando um provider falha. Providers e sanitização estão em `src/bot/ai.js` e `aiSanitizer.js`.

## 5. Mídia e chamadas

- `downloader.js`, `ytdl.js`, `caseAxios.js`, `pinterestSearch.js`, `imageSearch.js` e `erome.js` consultam fontes externas.
- `mediaHandler.js`, `compressor.js`, `renderEngine.js`, `sharp`, FFmpeg e `mediaQuality.js` preparam o ficheiro final.
- `stickerMaker.js`, `stickerPack.js`, `stickerRename.js`, `stickerWm.js`, `stickerVision.js` e `stickerly.js` cobrem stickers.
- `callVoip.js`, `callBridge.js`, `callSocket.js`, `callHandler.js`, `realCall.js` e `liveVoip.js` cobrem o fluxo VoIP, restrito pelo código de permissões e limites.

Downloads dependem de rede e podem usar fallbacks. FFmpeg e módulos nativos precisam ser validados no ambiente de deploy.

## 6. Persistência

`src/database/connection.js` abre MongoDB; `migrate.js` aplica migrações. Modelos atuais:

`AiMemory`, `AntiStatus`, `BannedSticker`, `BotConfig`, `Command`, `CommandOverride`, `DecryptLog`, `DeletedMessage`, `Economy`, `GameSession`, `GroupMemberActivity`, `GroupSettings`, `Log`, `Media`, `Payment`, `RPGPlayer`, `Schedule`, `Session` e `User`.

A sessão WhatsApp usa `mongoAuthState.js`. Backups/importações passam pelas rotas de dashboard e devem ser usados apenas com autenticação de Dono.

## 7. Dashboard e APIs

- `src/routes/auth.js` — login, registo, sessão e logout;
- `src/routes/dashboard.js` — páginas EJS do centro de controlo;
- `src/routes/api.js` — estado, conexão, comandos, overrides, uploads, usuários, broadcast, agenda, pagamentos, grupos, backup, IA, configurações, C∆P e decrypter;
- `src/middleware/auth.js` — autenticação e autorização;
- `src/public/` e `src/views/` — assets, layouts, páginas, parciais e páginas de erro.

`src/index.js` também registra Socket.IO, health checks e inicialização automática. O `APP_URL` deve ser a raiz do domínio público.

## 8. Dark Net Decrypter e C∆P

- `src/decrypter/index.js` orquestra a análise;
- `engine.js` identifica/processa formatos;
- `formatter.js` normaliza o resultado;
- `brute.js` executa rotinas de tentativa;
- `formats/` contém adaptadores de EHI, HAT, NPV, SSH, OVPN, WireGuard, JSON, TXT e outros suportados.

`src/cap/` concentra funcionalidades de Instagram/C∆P e login opcional por sessão. Credenciais devem ficar somente em variáveis de ambiente ou no armazenamento seguro da aplicação.

## 9. Operação

```bash
npm ci
cp .env.example .env
npm start
```

Verificações seguras e sem credenciais reais:

```bash
npm run test:syntax
npm run test:ejs
npm run test:smoke
npm run test:commands
npm run test:roles
npm run test:auramodes
npm run test:casehandler
npm audit --omit=dev
```

Testes que fazem chamadas reais ao WhatsApp, MongoDB, IA, Instagram ou provedores de mídia devem ser executados isoladamente e nunca com dados de produção sem backup.

## 10. Pontos de atenção

1. Dependências nativas (`sharp`, FFmpeg, `opusscript`) precisam de validação no mesmo sistema do deploy.
2. O pacote inclui dependências com avisos de manutenção e vulnerabilidades transitivas; atualizar incrementalmente, sem `npm audit fix --force` automático.
3. Chaves da API do GitHub e demais segredos não devem ser gravados no repositório, logs ou documentação. Se uma chave foi exposta, revogá-la e criar outra com escopo mínimo.
4. O repositório tem uma suíte extensa de testes, mas a validação completa precisa de serviços externos para cobrir os caminhos reais.
