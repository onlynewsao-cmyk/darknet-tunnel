# Integração dos cases recebidos

Os 19 ficheiros de comandos foram copiados para análise, sem serem registados automaticamente no `addcase`.

## Regra de integração

Cada case deve ser convertido para o contexto nativo do DARK BOT (`sock`, `msg`, `ctx`, `reply`, `q`, `from`, `prefix`) e passar por sintaxe, dependências, permissões, timeout e teste simulado antes de ser registado.

## Bloqueadores encontrados

- Todos os `.txt` recebidos são snippets, não ficheiros prontos do formato do projeto; `node --check` não os valida diretamente.
- Existem referências a APIs/variáveis de outro bot: `systemZR`, `conn`, `waguri`, `fetchJson`, `sendImage`, `sendAudio`, `okarunsite`, `API_KEY_WAGURI`.
- Existem módulos externos ausentes no projeto, incluindo `pdfkit` e `form-data` em alguns snippets.
- Há módulos ESM (`export default`) misturados com cases CommonJS.
- Não será executado código com `exec`, eliminação de mensagens, auto-admin ou anti-spam global sem revisão de segurança.
- O anexo que continha o token GitHub não foi mantido nesta pasta.

## Estado

Nenhum case foi colocado em produção nem adicionado ao catálogo enquanto depender de variáveis inexistentes ou credenciais embutidas. Isso evita quebrar o handler inteiro via `addcase`.
