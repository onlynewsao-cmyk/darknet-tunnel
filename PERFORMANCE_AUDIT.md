# Auditoria de lentidão e funcionalidade — DARK BOT

Data: 12/09/2026

## Resumo

O bot não está inútil: a suíte cobre 246 comandos catalogados, 93 comandos de download com handlers e os módulos principais carregam. Porém, existem caminhos que podem ser lentos por desenho e dependências externas que não podem ser garantidas pelo código sozinho.

## Validações executadas

- `npm test`: iniciou a suíte completa.
- Sintaxe: **215 ficheiros, 0 erros**.
- EJS: **32 templates, 0 erros**.
- Catálogo: **246 comandos, auditoria OK**.
- Auditoria de downloads: **93/93 handlers reais**.
- Cases de mídia: **19/19 OK**.
- AURA, permissões e menus: auditorias principais passaram.
- Duas falhas conhecidas em `test:menu18`: conversão imagem/GIF para WebP/figurinha por erro de módulo nativo `sharp` no ambiente de teste.
- Teste externo de download: providers públicos podem falhar, expirar ou ignorar qualidade; por isso há fallbacks e validação de bytes.

## Principais fontes de lentidão

### 1. Rede externa em série

Downloads e mídia passam por API SystemZone, yt-dlp, ytdl-core, youtubei.js e serviços de fallback, em sequência. Cada fallback possui timeout próprio; quando vários falham, o utilizador pode esperar dezenas de segundos.

Mitigação já existente: lazy-load dos módulos e fallbacks. Recomendação: usar yt-dlp + FFmpeg no container e limitar tentativas de fallback por comando.

### 2. AURA

A AURA pode consultar MongoDB, histórico, memória, regras e provider de IA antes de responder. Isso é funcional, mas naturalmente mais lento que um comando direto.

Para produção rápida:

```env
HUMANIZE=off
AUTO_CALL=off
```

### 3. Humanizador

Quando ativado, adiciona leitura, estado de escrita/gravação, atraso proporcional e jitter. É uma escolha de experiência, não um problema de infraestrutura.

### 4. WhatsApp/Baileys

O `.ping` mede o tempo da operação de envio/edição no WhatsApp, não apenas CPU do Northflank. Uma resposta de 2–4 segundos pode ocorrer mesmo com `/health` abaixo de 300 ms.

### 5. Conversão de mídia

FFmpeg, sharp e upload do ficheiro são operações CPU/memória. 512 MB pode ser suficiente para texto e áudio curto, mas 1 GB é mais seguro para vídeo/stickers.

## Problemas funcionais encontrados e corrigidos nesta linha

- Aliases duplicados entre `downloads.js`, `downloads2.js`, `online.js` e `extraCases.js` foram separados.
- Fallback yt-dlp ignorava bitrate de áudio e usava sempre 128K; passou a respeitar 96k/192k/320k.
- Fallback yt-dlp ignorava a resolução recebida e usava quase sempre 720p; passou a respeitar 360/720/1080.
- `loader.to` podia ignorar o bitrate; o áudio do fallback é normalizado pelo FFmpeg antes de ser enviado.
- Docker passou a instalar explicitamente `python3-pip`, `yt-dlp` e FFmpeg.
- Prefixo padrão alinhado com a documentação: `.`.

## Riscos que exigem atenção no deploy

1. O Dockerfile deve ser usado no Northflank; `npm ci` precisa executar scripts para preparar módulos nativos.
2. O MongoDB Atlas deve estar acessível pelos egress IPs do Northflank.
3. Providers externos podem retornar HTTP 429, vídeos indisponíveis ou URLs expiradas.
4. A qualidade recebida só pode ser garantida quando o provider/fallback entrega o ficheiro para conversão local; uma API externa pode limitar a fonte original.
5. Uma única instância é obrigatória para evitar duas sessões WhatsApp concorrentes.
6. Não usar chamadas VoIP automáticas no primeiro deploy.

## Configuração recomendada

```env
NODE_ENV=production
PORT=3000
HUMANIZE=off
AUTO_CALL=off
```

Northflank:

```text
Instances: 1
Health check: /health
Port: 3000
512 MB: texto/AURA leve
1024 MB: mídia, FFmpeg e stickers
```

## Critério de “funciona de verdade”

Um comando de mídia deve ser considerado funcional somente quando:

1. recebe uma URL ou pesquisa válida;
2. obtém bytes maiores que o mínimo;
3. valida o tipo de ficheiro;
4. respeita limite de duração/tamanho;
5. normaliza a qualidade quando necessário;
6. envia o buffer ao WhatsApp;
7. informa falha sem prometer entrega quando todos os providers falham.

Os testes estáticos confirmam handlers e contratos. A entrega real depende de rede, WhatsApp, providers, MongoDB e credenciais do ambiente de produção.
