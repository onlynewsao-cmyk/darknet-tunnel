# Deploy do DARK BOT no Northflank

O serviço deve ser criado no projeto **dark-bot** do Northflank usando este repositório e o `Dockerfile` incluído na raiz.

## 1. Criar o serviço

No Northflank:

> Para permanecer no plano gratuito, selecione o compute/free tier disponível na sua conta, sem adicionar volumes ou recursos pagos. O serviço WhatsApp pode consumir memória durante downloads e chamadas; monitore o uso antes de aumentar o plano.


1. Abrir o projeto `dark-bot`.
2. Selecionar **Create service**.
3. Escolher **Build from repository**.
4. Ligar ao GitHub usando a integração oficial/OAuth e selecionar `onlynewsao-cmyk/dark-bot`. Se o Northflank solicitar um token, colá-lo apenas no campo seguro da integração; nunca em variáveis de build, ficheiros ou logs.
5. Branch: `main`.
6. Build type: `Dockerfile`.
7. Dockerfile path: `/Dockerfile`.
8. Port: `3000`, protocolo HTTP.
9. Expor o serviço publicamente com um domínio Northflank.
10. Ativar auto-deploy somente depois de confirmar o primeiro deploy manual.

O container instala Node 20, dependências de produção e FFmpeg. O processo inicia com `node src/index.js`.

## 2. Variáveis obrigatórias

Adicionar em **Secrets / Environment variables** do serviço. Nunca gravar estes valores no GitHub:

```text
NODE_ENV=production
PORT=3000
APP_URL=https://<dominio-publico-do-northflank>
SESSION_SECRET=<segredo-aleatorio-com-pelo-menos-32-caracteres>
MONGODB_URI=<uri-do-mongodb-atlas>
OWNER_NAME=Dark Net
OWNER_NUMBER=<numero-com-codigo-do-pais-sem-simbolos>
OWNER_USERNAME=<utilizador-do-dashboard>
OWNER_PASSWORD=<senha-forte-do-dashboard>
BOT_NAME=DARK BOT
BOT_NUMBER=<numero-do-whatsapp-do-bot-sem-simbolos>
BOT_PREFIX=.
```

Para a AURA, adicionar **pelo menos um** provider:

```text
GROQ_API_KEY=<segredo>
# ou GEMINI_API_KEY=<segredo>
# ou OPENROUTER_API_KEY=<segredo>
```

Variáveis opcionais ficam documentadas em `.env.example`, incluindo Cloudinary, Tenor/Giphy, Cobalt, proxy YouTube, C∆P e Facebook Publisher.

## 3. MongoDB Atlas

Criar um utilizador dedicado e uma base `darkbot`. Autorizar o IP de saída do Northflank no Network Access do Atlas; durante a primeira configuração pode ser necessário permitir temporariamente `0.0.0.0/0`, preferindo depois restringir aos egress IPs apresentados pelo Northflank.

A senha da URI deve estar URL-encoded quando contiver caracteres especiais. A aplicação encerra em produção se `MONGODB_URI` estiver ausente ou não conseguir conectar.

## 4. Health checks

Depois do serviço iniciar, testar:

```text
GET https://<dominio>/ping
GET https://<dominio>/health
```

Configurar no Northflank o health check HTTP em `/health` na porta `3000`. O `/ping` é um endpoint leve para monitorização externa.

## 5. Primeiro arranque

1. Fazer deploy.
2. Conferir logs: conexão MongoDB, servidor na porta configurada e ausência de erros de módulo nativo.
3. Acessar `/dashboard/connect`.
4. Conectar o WhatsApp por QR code ou pair-code.
5. Confirmar login em `/login` com `OWNER_USERNAME` e `OWNER_PASSWORD`.
6. Testar uma mensagem simples e um comando de mídia.

A sessão Baileys é persistida no MongoDB. Não apagar a coleção de autenticação durante um restart normal.

## 6. Configuração recomendada

- Usar Node 20 ou superior.
- Habilitar restart automático em falha.
- Definir limite de memória adequado aos downloads/conversões.
- Usar volume persistente apenas para temporários, se necessário; a sessão principal está no MongoDB.
- Não habilitar chamadas automáticas sem validar limites e políticas do WhatsApp.
- Manter `AUTO_CALL=off` inicialmente.
- Usar um domínio estável antes de definir `APP_URL`, pois essa URL participa dos cookies, links e dashboard.

## 7. Segurança da credencial GitHub

Uma credencial GitHub foi anexada nesta conversa. Por segurança, ela deve ser considerada comprometida: revogar imediatamente no GitHub em **Settings → Developer settings → Personal access tokens** e criar outra com escopo mínimo, preferencialmente usando a integração OAuth/GitHub do Northflank em vez de inserir token manualmente.

Não colocar token em:

- `Dockerfile`;
- `render.yaml`;
- `package.json`;
- `.env.example`;
- logs;
- variáveis `ARG` do Docker.

## 8. Rollback

Antes de ativar auto-deploy, guardar o commit funcional atual. Em caso de falha, usar o commit anterior no serviço Northflank e verificar primeiro os logs de MongoDB, `APP_URL`, variáveis de IA, FFmpeg e porta.
