# Configuração estável do DARK BOT no Northflank

## Não usar duas instâncias

O DARK BOT mantém uma sessão WhatsApp Baileys. Duas instâncias podem abrir duas conexões para a mesma conta e causar:

- mensagens duplicadas;
- QR/pair-code inválido;
- conflito de sessão MongoDB;
- reconexões contínuas;
- downloads duplicados;
- consumo duplicado;
- comportamento aparentemente lento ou instável.

Configuração obrigatória:

```text
Instances: 1
Horizontal autoscaling: disabled
```

## Recursos recomendados

Para texto, dashboard e AURA leve:

```text
0,5 vCPU shared
1024 MB RAM
```

Para áudio, vídeo, stickers e FFmpeg:

```text
1 vCPU dedicated
2048 MB RAM
```

4 GB e 2 instâncias não tornam o WhatsApp “invencível”; aumentam o custo e podem piorar a sessão se houver concorrência.

## Deploy seguro

1. Parar o serviço anterior ou aguardar o rollout terminar.
2. Selecionar **1 instance**.
3. Desativar autoscaling horizontal.
4. Manter `PORT=3000` e health check `/health`.
5. Fazer um único redeploy.
6. Aguardar um pod ficar `Ready`.
7. Testar `/health` e `/ping`.
8. Confirmar somente uma sessão WhatsApp conectada.

## Variáveis de operação

```env
NODE_ENV=production
PORT=3000
HUMANIZE=off
AUTO_CALL=off
```

O bot deve ser escalado verticalmente, aumentando CPU/RAM de uma única instância, e não horizontalmente.

## Interpretação das métricas

- CPU baixa e memória estável: o gargalo costuma ser rede, WhatsApp, MongoDB ou provider externo.
- CPU alta durante FFmpeg: esperado durante conversão.
- Memória subindo sem cair: investigar buffers/downloads e reiniciar após confirmar o job.
- Pod duplicado: reduzir para uma instância imediatamente.
- Probe latency alta, mas `/health` normal: verificar rollout, rede e cold start.
