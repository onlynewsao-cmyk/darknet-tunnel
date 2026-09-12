# Auditoria e atualização — DARK BOT

**Data da revisão:** 10/09/2026  
**Origem:** https://github.com/onlynewsao-cmyk/dark-bot  
**Branch clonada:** `main`  
**Último commit observado:** `98587ae` — v7.46, anti-tipos aplicado no router

## Resultado desta atualização

- Workspace sincronizado a partir do repositório remoto.
- Dependências reinstaladas com `npm ci --ignore-scripts` para inspeção segura.
- **215 ficheiros JavaScript verificados sem erros de sintaxe.**
- Criado `docs/ARCHITECTURE.md`, com o mapa de módulos, fluxo de mensagens, AURA, dashboard, persistência, mídia, permissões e operação.
- Nenhuma API key, token, `.env` ou credencial foi copiada para a documentação.

## Estrutura funcional

| Área | Localização | Responsabilidade |
|---|---|---|
| Arranque | `src/index.js` | Express, Socket.IO, rotas, health checks e auto-start |
| WhatsApp | `src/bot/whatsapp.js` | Baileys, QR/pair-code, sessão e reconexão |
| Mensagens | `src/bot/messageListener.js`, `messageRouter.js` | Entrada, contexto, filtros e roteamento |
| Comandos | `src/bot/caseHandler.js`, `cases/`, `nativeCommands.js` | Catálogo e execução de comandos |
| AURA | `src/aura/` | Intenção, memória, personalidade, ações, voz e regras |
| Segurança | `antiLink.js`, `antiSpam.js`, `antiSticker.js`, `antiTipos.js` | Proteções e moderação de grupos |
| Mídia | `downloader.js`, `mediaHandler.js`, `sticker*.js`, `renderEngine.js` | Download, conversão, stickers e entrega |
| Dados | `src/database/` | MongoDB, modelos, migrações e autenticação da sessão |
| Dashboard | `src/routes/`, `src/views/`, `src/public/` | Gestão web e APIs operacionais |
| Jogos | `src/bot/rpg/` e modelos associados | RPG, economia, jogos e comunidades |
| Decrypter | `src/decrypter/` | Análise de formatos de configuração |
| C∆P | `src/cap/` | Integração Instagram opcional |
| Qualidade | `scripts/` | Auditorias, simuladores, smoke e testes |

A descrição detalhada está em [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Validações executadas

```text
npm ci --ignore-scripts       OK — 556 pacotes instalados
scripts/check-syntax.js      OK — 215 ficheiros, 0 erros
```

`npm audit` reportou **13 vulnerabilidades** no conjunto instalado (4 moderadas e 9 altas). O resultado inclui dependências transitivas e pacotes nativos. Não foi executado `npm audit fix --force`, pois pode introduzir breaking changes.

## Riscos e recomendações

1. **Segredos:** uma API key “fixada” não deve ser colocada em código, commit, `.env` versionado ou logs. Usar variável de ambiente/secret manager. Se já foi exposta, revogar imediatamente e emitir outra com escopo mínimo.
2. **Dependências:** tratar vulnerabilidades por atualização incremental, começando por `multer`, `axios`, `sharp` e dependências transitivas; rodar a suíte após cada alteração.
3. **Módulos nativos:** validar `sharp`, FFmpeg e `opusscript` no ambiente final. A instalação acima ignorou scripts de postinstall de propósito.
4. **Integrações externas:** testes de WhatsApp, MongoDB, IA, Instagram e downloads reais exigem credenciais/serviços e não foram simulados nesta atualização.
5. **Deploy:** confirmar `APP_URL`, `MONGODB_URI`, provider de IA, FFmpeg e health checks antes de produção.

## Próxima sequência recomendada

```bash
npm run test:syntax
npm run test:ejs
npm run test:smoke
npm run test:commands
npm run test:roles
npm run test:casehandler
npm audit --omit=dev
```

Para testes reais, configurar segredos fora do repositório, fazer backup do MongoDB e executar primeiro num ambiente isolado.
