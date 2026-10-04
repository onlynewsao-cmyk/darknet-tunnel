<div align="center">

<img src="assets/hero.png" alt="DARK BOT — banner" width="100%" />

[![Typing](https://readme-typing-svg.demolab.com?font=Fira+Code&size=22&pause=1200&color=00FF9D&center=true&vCenter=true&width=760&lines=IA+VIVA+%C2%B7+M%C3%8DDIA+REAL+%C2%B7+RPG+%C2%B7+MODERA%C3%87%C3%83O;1900%2B+cases+%C2%B7+88+grupos+de+teste+verdes;Pipeline+83ms+%E2%86%92+1ms+%E2%9A%A1+TURBO;N%C3%A3o+%C3%A9+s%C3%B3+automa%C3%A7%C3%A3o.+%C3%89+presen%C3%A7a.)](https://github.com/onlynewsao-cmyk/darknet-tunnel)

<img src="src/public/img/logo.jpg" alt="DARK BOT" width="220" />

# 🕸️ DARK BOT
## ☠️ O LADO SOMBRIO DO WHATSAPP ☠️

[![Status](https://img.shields.io/badge/STATUS-ONLINE-00ff9d?style=for-the-badge&logo=whatsapp&logoColor=white)](https://github.com/onlynewsao-cmyk/darknet-tunnel)
[![Versão](https://img.shields.io/badge/VERSÃO-9.11.0-b14aed?style=for-the-badge)](https://github.com/onlynewsao-cmyk/darknet-tunnel)
[![Testes](https://img.shields.io/badge/TESTES-88_GRUPOS_VERDES-00f0ff?style=for-the-badge)](https://github.com/onlynewsao-cmyk/darknet-tunnel)
[![Node](https://img.shields.io/badge/NODE.JS-20-00f0ff?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![AURA](https://img.shields.io/badge/AURA-AWAKE-ff2e88?style=for-the-badge)](https://github.com/onlynewsao-cmyk/darknet-tunnel)
[![License](https://img.shields.io/badge/LICENSE-MIT-b14aed?style=for-the-badge)](LICENSE)

> **Não é só um bot. É uma presença.**
> Conversa, reage, cria, modera, joga, pesquisa, baixa e transforma o teu WhatsApp numa central viva.

<img src="assets/dark-anim.svg" alt="DARK BOT animado" width="100%" />

</div>

---

## 🆕 NOVIDADES

| Versão | Destaques |
|---|---|
| **v7.94** 🎞️ | **STICKERS ANIMADOS COMPLETOS** — GIF sem cap de 24 frames (escada q 70→6 até caber) e vídeo com TODOS os segundos (padrão 30s, era 8s); novo !setbio (Dono) edita a descrição geral (About) do bot em todo o lado |
| **v7.95** 🧠 | **AURA COM PERCEPÇÃO** — «representa-me num sticker» marca a intenção e a foto/vídeo seguinte CONVERTE sozinha (2 min, sem reescrever comando); SEM resposta dupla (a dica temática não sai mais ao lado do texto da IA); «manda em texto / tem muito barulho» desliga a voz por 90 min (só «manda voz/áudio» cancela); stickers/imagens por iniciativa da IA só saem quando a pessoa pede; «qual é o meu @?» recebe o número real com menção |
| **v7.96** 👁️ | **AURA VIGIA & INFORMA** — permissões persistidas do Dono (!permissoes/!permitir): avisa ONDE entrou, aluguel a acabar/expirado (com cartão renovar +30d/adiar/sair), "contacto X quer alugar/VIP/procurou-te" (dedupe 6h), convite recebido em PV vira CARTÃO DE SELECÇÃO (formato da lista do menu) ✅entrar/❌recusar, e partilha o número do Dark só com permissão; perguntas em conversa respondidas com dados reais: "quantos grupos tenho? com/sem aluguel, em trial, comandos mais usados, mais ativos, inativos"; regra no cérebro: incerteza → PERGUNTA antes, certeza → executa logo |
| **v9.16** 🗳️ | **ENQUETES · VOTAÇÕES · REACÇÕES DE CANAL + CONVITE HONESTO** — `!enquete "P" | a | b | c` lança a enquete REAL do WhatsApp (payload `poll` + voto `pollUpdate` com o hash sha256 do fork, `!voto N` vota/muda) e `!votacao` abre a VOTAÇÃO-DA-CASA com botões 🗳️: 1 pessoa = 1 voto, troca livre até fechar, contagem visível ou 🤫 secreta, veredicto com percentagens e empate auditado (`!votacao status/fechar/limpar`, `!votar N`). Canais: `!canalreagir 🤡 10 <link>` cola reacções nos últimos posts (newsletterReactMessage, teto 15/pedido) — a Aura já obedece a «reage no canal com X». FALSAÇÃO? Fora de jogo: assinaturas são criptográficas, multi-conta é fraude + ban — o bot arbitra votações honestas, não fantoches. **FIX do convite (print real):** o `groupAcceptInvite` do fork devolve *undefined* quando ENTRA com sucesso — o cartão AURASEL lia isso como falha e gritava «link inválido» quando o pedido estava é na fila de aprovação. Agora o despacho do convite (e o atalho do dono no PV) passa pelo motor `entrarPorLink`: distingue entrou / ⏳ aprovação-pendente / revogado / morto / já-lá, avisa quem convidou, e cobre também comunidade e canal. Aura ganha as intenções criar_enquete / votar_casa / fechar_votacao (admin-gate no fechar). Testes novos: test-votacao (parser, payload, hash, empate, secreta, gates, regressão do convite ×5) ligada ao `npm test`. |
| **v9.15** ⚡ | **SUPER + TABULEIRO VIVO + DIVULGAÇÃO DE PRO** — humano FORA: humanizer em off por omissão, motor de divulgação a `0ms` (presets `!delay super/ultra…`), cartão de prefixo AGORA CURTO (≤4 linhas, texto puro — abre em qualquer cliente) com 8 temas e 39 temas globais onde o `!change` pede CONFIRMAÇÃO (CHANGE/não, janela de 3min, dono reverte). **TABULEIRO VIVO** (8 comandos): `!letras` converte LETRAS **E NÚMEROS** nas 22 fontes (𝐃𝐚𝐫𝐤 𝟐𝟎𝟐𝟔), `!tamanho` com 6 TAMANHOS (ＧＩＧＡＮＴＥ→ₘᵢᴄᵣₒ, ⁴²/₄₂ incluídos), `!nick`/`!nickmais` (10 únicos por semente, sem repetir), `!deco`, `!caixa`, `!num` (11 estilos), `!simbolos` (17 baús verbatim). **O estilo muda com o !change**: os cartões do tabuleiro vestem a moldura/marcador/vibe do tema activo, e os temas novos trazem `fonte:` própria (egipcio→fraktur abre o !nick). **DIVULGAÇÃO EVOLUÍDA** (pesquisa em bots de disparo): ⏰ agenda REAL `!divulgaragenda 21:30|15min|diario` persistida em BD e re-armada após restart (atraso ≤30min dispara na hora); 🌀 `!giro txt1 || txt2 || txt3` roda cópias a CADA envio (anti-repetição); 📊 métricas por grupo (✅/❌/taxa) com **exclusão automática de mortos** (3 falhas seguidas → ⚰️, `!divulgar metricas`/`!divulgar reativar N`); 🔀 ordem baralhada em cada passe. Submenus organizados (aliases números/packs/tamanho/giro). Suites: afontes, adivulgacao, prefixo-auto (21), submenus (40), temas (44), turbo (173), humanizer, antitipos, cases-media — TODAS 0 falhas. |
| **v9.14** 🕸️ | **CENTRAL DE SESSÕES + DIVULGAÇÃO INVISÍVEL AOS ADM** — novo failover de 4 slots de contas: a sessão que FUNCIONA fica sempre no slot 1; as guardadas esperam quietas (o bot só «faz o contacto» — probes leves de 30 em 30 min — para manter a ligação viva enquanto a sessão «permanece lá»); fim do ciclo «só funciona a primeira». Slot 1 banido/expirado/restrito → a próxima viva assume sozinha (os docs `slotN:*` sobrevivem até ao `clearSession`). Sessões novas: pairing com código no dashboard, ~2 DIAS de insistência antes de a marcar como morta, e promoção automática assim que abre. Nova página **/dashboard/sessoes** (estados, adicionar, rodar agora, remover) com link na lateral — o «conectar bot» de sempre ficou intacto. **DIVULGAÇÃO=CANAL SECRETO:** assistente de 4 passos, painéis, lista, relatório e BOTÕES FIXOS saem APENAS no PV do dono (a sessão migra se o dono responde no PV) — o Admin deixa de ver o «botão morto» do divulgar carregável no grupo. Baseado na pesquisa de padrões multi-sessão Baileys (auth por slot, probes com timeout, rotação por motivo de queda). Testes: test-asessions (swap atómico, retry 2d, failover 1-passo, call:* intocado) + canal secreto no test-adivulgacao. |
| **v9.13** 🛡️ | **AUDITORIA ANTI-BAN — O bot deixa de ser íman de ban temporário** — a divulgação ganhou ritmo de gente: piso DURO ~950ms por envio (presets suicidas de 1/70/300ms agora avisam «risco ban» no painel `!delay` e o piso protege na mesma), pausa HUMANA de 28–45s a cada 7–11 envios, espera aleatória de 65–130s ENTRE PASSES (o 🔁Não sai metronómico), e ruído zero-width TAMBÉM no corpo visível — nenhuma cópia sai byte-a-byte igual (detector de broadcast morre de fome). Welcome em tempestade de entradas: máx. 1 saudação por grupo por 40s, os restantes entram num cartão combinado único (debounce 12s, texto, até 6 @…+N) — acabou o «imagem por cabeça» que é assinatura clássica de automação. Verificações: chamadas só do Dono ✔, humanizer 80–260ms ✔, humanizador de presença ✔, backoff de reconexão ✔. Testes: pacing medido ao milésimo + combo de welcome agregado. |
| **v9.12** 🎴 | **CARTÃO DE PREFIXO REDESENHADO (o teu design, à letra)** — o tema darktoxic do `prefixo` ganha respiro: linha em branco entre cada bloco (fadiga → ☠️DARKTOXIC☠️ → ◈ Prefixo actual → ◈ Cópia num toque → fadiga), linha da moldura `P R E F I X O` e dica `👆 toca no botão` removidas, e assinatura **DARK BOT 🕸️** no fim. Corrige ainda o bug histórico do `filter(Boolean)` que engolia as linhas em branco — agora o cartão sai EXACTAMENTE como desenhado. Botão de copiar intacto. |
| **v9.11** ✨ | **O ASSISTENTE DE 4 PASSOS (o teu modelo, à letra)** — `!divulgar texto` abre o assistente ESCRITO: *TEXTO SALVO COM SUCESSO* → Passo 2/4 quantas VEZES (1–10, escrito) → cartão ✨ GRUPOS SELECIONADOS: N com bullets dos primeiros 15 grupos → Passo 4/4 escreve `visivel` (marca TODOS, ADM vê) ou `invisivel` (marca todos MENOS ADM, bypass activo) → dispara com vezes, jitter e relatório com botões fixos. `.cancelar` aborta em qualquer passo; sessão isolada por chat+dono com TTL 15min e comandos livres (texto com prefixo nunca é engolido). O motor ganhou 🔁Vezes no relatório e no histórico. |
| **v9.10** 🕶️ | **VISÍVEL vs INVISÍVEL — REFINADO** — visível = hidetag clássico à vista p/ TODOS (ADM incluído vê e pode reagir); **invisível = menciona todos MENOS os ADM** — eles nem notificação recebem, hidetag 100% limpa (zero tags à vista), e o BYPASS liga-se: texto sai CRU (sem banner beacon) + ruído invisível ÚNICO por grupo (anti-duplicados) + ritmo com jitter (anti-metronome). Todas as formas (texto, foto, vídeo, doc, agenda, repetir) respeitam a mesma política. |
| **v9.9** 🚀 | **CLIENTE ONLINE · COMPLEMENTO INTERACTIVO** — o hub `!cliente` abre em CARROSSEL (4 cartões com capa darktoxic gerada por IA + botões vivos, caindo para a lista se precisar); o relatório de cada onda traz BOTÕES FIXOS (🔁 repetir a mesma onda, 📊 histórico, 🛑 parar); novos cmds: `!divulgarrepetir`, `!divulgarstats` (prova dos números: ondas, alcance, entregue %), `!divulgaragenda <min> [vis]* <texto>` — agenda real de sessão que o `!divulgarstop` também cancela. |
| **v9.8** ☣️ | **CLIENTE ONLINE — DIVULGAÇÃO DARKTOXIC (dono)** — `!cliente` abre o painel-tudo (4 secções, selo biz, moldura ☣️☠️🕸️, estado real: grupos + delay + cliente ativo). Gestão de grupos `!divulgar add/addall/list/del/delall` (estado isolado por dono); velocidade `!delay` com 🟢 no activo, presets ultra→devagar + custom 1..5000ms + `!delayultrarapido`; disparo em 4 passos com escolha 👁️ visível (tags à vista) / 🕶️ invisível (menção silenciosa — ADM não vê a lista de marcados, notificação chega a todos) / 🔕 sem, stop live e relatório; atalhos `!divulgarrapido`, teste, histórico (20 ondas); mídia por quote: foto/vídeo/doc/áudio + contato (vcard) + localização; SEU BOT `!conectarbot`/`!meubot`/`!desconectarbot` + tabela `!aluguel`. |
| **v9.5** 📑 | **ABA INTERATIVA & HUB DA AURA** — `!tab` abre abas vivas do aventureiro (perfil, ficha, mochila, mundo, registos) que navegam a tocar e reabrem sozinho; `!aurahub` (dono) vira a Central da Aura em BOTÕES que reflectem o estado real (voz, proativa, nível, humor, presença) e correm os mesmos comandos do `!auraset`; caça ao relay fantasma concluída: `!change`, `!maiscmds` e as decisões AURASEL ganham o selo biz/native_flow. |
| **v9.0** 🎠 | **CARROSSEIS** — o carrossel VIP (`!vip`/`!planos`) ganhou o selo biz/native_flow que os clientes novos exigem (era o relay fantasma sem renderizar); o RPG fala em FOTOS: a criação (`!rpgstart`) e o mundo (`!viajar`) agora abrem em carrossel com capa gerada por IA por carta (cache por sessão), botões vivos (RPGPICK e `!viajar <sítio>`) e o plano-B numerado sempre no corpo — carrossel → lista → texto, nunca beco sem saída. |
| **v8.6** 🎭 | **MENURPG AO DIA & CRIAÇÃO SEM BECOS** — o livro do `!menurpg` cobre todos os 25 comandos vivos (ficha, reviver, historia, irpara, falar, criarguilda…); a criação `!rpgstart` ganha **plano-B escrito** (opções numeradas + `!rpgstart Nome raça classe` no próprio corpo) e foi curado o bug que calava a lista clicável (`title is not defined`); o dynSub fala em vez de silêncio quando uma área fica vazia. |
| **v8.5** ☠️ | **DARKTOXIC** — novo tema do cartão de prefixo (o `!prefixo` e a palavra "prefixo" ganham vinhas tóxicas + crânio + moldura aranha; botão de copiar intacto); `!prefixotema` (dono) lista/troca os temas com 🟢 no activo e preview imediato — o CLÁSSICO ⍟ v7.72 fica guardado como herança. |
| **v8.4** 🎨 | **WELCOME2 · WELCM3 · RG CARD** — `welcome2`: entrada do grupo passa a mandar uma FOTO IA pintada à medida do membro (arte pollinations + foto de perfil incorporada no cartão, nome + nº no grupo); `welcm3`: a mesma arte em GIF de super animação (pan, anel pulsante, chuva de faísca — 12 frames reais, gifPlayback); toggles só-admin, mutuamente exclusivos, com CHANGE rico; `!rgcard [gif]`: o mesmo motor pinta o cartão do herói RPG com a foto de perfil (menurpg tem a linha); _fetch valida content-type p/ HTML nunca rebentar o sharp. |
| **v8.3** 🔥 | **FREE FIRE VIVO + SPOTIFY EMBED** — `!ff`/`!freefire`/`!ffplayer <UID> [região]` mostra o cartão completo do guerreiro (nick, nível c/ barra XP, prime, ranks BR/CS + máximos, likes/badges, elite pass, pet, signature, credit score, datas), `!ffregioes` cataloga as 16 regiões (BR por omissão); a API gratuita freefireapis.lat é a via primária do `!infoff`/`!ffinfo` legado (NYX_FF_TOKEN só de emergência; região sem token orienta a troca). Spotify: colecções usam a via **EMBED oficial** (open.spotify.com/embed/… — com trackList real); os comandos partilham links do player Spotify e não substituem faixas por downloads de terceiros. |
| **v8.2** 🛠️ | **CONVERTE-TUDO** — `tomp3`/`mp4to3`/`4to3` (MP3 192k), `tovoice`/`topt`/`mp4tovoice`/`mp3tovoice` (nota de voz OPUS c/ waveform), `togif`/`mp4togif` (GIF ≤10s gifPlayback), `videoaimg`/`primeiraframe` (1ª frame PNG), `todoc` (mídia → documento c/ extensão certa) — tudo aceita vídeo, áudio, sticker animado ou documento citado; limites de 50 MB e mensagens de uso simpáticas; motor convertEngine (ffmpeg-static) partilhado; testes com ffmpeg REAL por magic bytes (OggS/ID3/PNG). |
| **v8.1** 📜 | **MENURPG LISTA DE TEXTO** — o `!menurpg` é o LIVRO EM TEXTO dos comandos RPG: cartão vivo da personagem (raça/classe, nível/XP, barras ❤️/🔮, gold/banco, vidas, K/M, guilda, streak, biomas) + 18 comandos em 5 secções — ZERO botões (a labor interactiva fica na fila "RPG & AVENTURA" do menu principal). Sem personagem, o PORTAL lidera. Prefixo dinâmico; gate intacto. |
| **v8.0** 🕸️ | **MENURPG VIVO** — adeus parede de texto: o `!menurpg` agora lê a TUA personagem (cartão com nome, raça/classe, nível/XP, barras ❤️/🔮, gold/banco, vidas, K/M, guilda, sequência de vitórias, biomas) e abre uma LISTA TOQUE-PARA-CORRER com 18 linhas por secções (A TUA PERSONAGEM · AVENTURA & COMBATE · INVENTÁRIO & BAÚ · PRAÇA · LIVRO DO MUNDO). Sem personagem, o PORTAL de criação lidera e a vitrine (ranking/mapa) continua aberta. Só comandos que existem; prefixo dinâmico; queda em texto rico se as listas falharem. |
| **v7.99** 🌋 | **GATE RPG REBORN** — o `runCase` chamava o gate ANTES de `msg`/`sock` existirem (ReferenceError a cair num catch vazio ⇒ mundo SEMPRE aberto para todos); agora o gate corre depois, com falha auditável (log `[RPG-GATE]`) — e o próprio gate deixou de escorregar aberto quando o grupo nem registo tem na DB. Grupo sem `!modorpg` pede o modo; sem personagem pede `!rpgstart`; PV/comunidade continuam abertos. |
| **v7.98** 💚 | **SPOTIFY EM 3 NÍVEIS** — `!spotify`/`!spotify1` baixa ⚡ 48k · `!spotify2` média 🎧 128k · `!spotify3` máxima 💎 320k; os três aceitam NOME (lista até 8 resultados) e LINK de playlist, álbum, EP e CD (a colecção desce faixa a faixa com cartão de resumo, cap de 20); a qualidade do nível é SEMPRE aplicada via FFmpeg depois do download (não é "veio o que veio"); episódios/podcasts avisam com jeitinho; spotify2 deixou de ser alias invisível. |
| **v7.97** 🌑 | **RPG GATE TOTAL + CHANGE RICO** — verificação (zero comandos RPG duplicados no registo) e gate coerente: submenuRPG/menurpg NEM ABREM onde o mundo dorme (ficavam em economia genérica); a fila "RPG & AVENTURA" do menu principal esconde sem !modorpg; PV e comunidade sempre abertos; cérebro: incerteza → pergunta antes; o `!modorpg on/off` sai com CHANGE único e rico — o portal de DARK VILLE abre/adormece com arte própria e primeiros passos (tudo por !modorpg, comando cfg |
| **v7.93** 🪪 | **CLIQUE IGUAL AO MENU (fix id) + ID DINÂMICA + PLAY SEM LISTA** — rows usam `id` (o campo que o menu usa; `rowId` quebrava a selecção); !setcanal/!setselo Dono mudam canal ✚ selo verificado em todos os sítios; !setcanal off volta; canalinfo/selo mostram; !play directo de novo |
| **v7.92** 📋 | **RESULTADOS DENTRO DA LISTA** — corpo curto ("toca ▾ — tens N opções"), os itens aparecem SÓ quando se toca ESCOLHER (feedback da imagem); idem no rpg/ui.escolher |
| **v7.91** 📋 | **PESQUISAS CLICÁVEIS** — lista single_select (estilo submenu) TODAS as pesquisas: play/video/spotify2/soundcloud/myinstants/ttks/tiktoktxt; stalks (ttstalk/insta/github) deixam de ser cegas: opções 📷 foto / 🔗 link / 🎬 vídeos; clique LISTANUM_n resolve igual ao número |
| **v7.90** 🎮 | **RPG UI CLICÁVEL** — botões ✅/❌ (reviver, fundar guilda, criar clã, refazer personagem) e listas single_select; fallback !rpgsim/!rpgnao/!rpgescolher; RPG_CHANGELOG.md único e permanente |
| **v7.89** 🩹 | **ESCUDO DE VERDADE** — auto-visu1 baixava por método inexistente (nunca reenviava); toggles v7.86 (antifoto/vídeo/áudio/texto/contacto/autovisu1/autodl) e modorpg estavam FORA do schema — mongoose apagava-os, agora persistem e funcionam; 16 toggles legados gravam de verdade |
| **v7.88** 🌱 | **RPG RESET + MUNDO DUPLO** — reset único de todas as personagens (todos se registam de novo); comunidade DARK VILLE = mundo internacional sempre aberto; grupos normais = RPG de um só grupo (clã local, !guilda entrar); sugestão de comando não vacila |
| **v7.87** 🌍 | **RPG MUNDO FECHADO** — grupo sem `!modorpg on` = mundo fechado; sem personagem só o portal/vitrine funcionam; criação marca `started` |
| **v7.86** 👁️ | **AUTO-VISU1 + ANTIS COMPLETOS** — anti-foto/vídeo convertem em "ver uma vez" (mantém descrição, marca quem mandou); antifoto/antivideo/antiaudio/antitexto/anticontacto/autovisu1; AutoDL agora padrão OFF |
| **v7.85** 🎛️ | **ESCUDO À MEDIDA** — `!antilink redes <lista|off|all>`, `!antilink grupos on|off`, `!antilink canais on|off`; o aviso mostra SÓ o que o grupo aceita |
| **v7.84** 🕸️ | **ESCUDO VIVO** — links permitidos ativam o DARK DL (download automático por grupo, `!antilink autodl off` p/ desligar); aviso do escudo curto e humano; FACTOS no prompt (PV incluído) contra alucinações de links |
| **v7.83** 👂 | **AURA ATENTA** — destinatário real: sabe se falam COM ela (menção/resposta/vocativo), DELA (3ª pessoa → reacção leve) ou ENTRE SI (cala-se); "aura" como gíria não a chama; prompt mostra quem respondeu a quem, quem marcou quem + excerto citado |
| **v7.82** 🛡️ | **AURA VERDADE** — router com filtro `notify` + dedup (fim das respostas duplas/contraditórias); capacidades `resumo_grupos` e `partilhar_contacto` (vCard); `falar_com_todos` não corre no PV; router-IA com exemplos negativos; grounding anti-alucinação |
| **v7.81** 📣 | **AURA CONTA** — `!resumogrupos` (digest: grupos ativos, msgs/sem, top faladores, estado 💎/🆓/🔴); "verifica lá"/"o que se passa nos grupos" por conversa; guarda anti-falso-positivo no router (audit só se a frase falar de comandos) |
| **v7.80** 🏆 | **RANK SEMANAL** — `!ranksemanal` (top da semana ISO, zera sozinho, prune rolante sem scheduler) + bugfix `!rankativos` (path inexistente — nunca mostrava nada) |
| **v7.79** 💰 | **MONETIZAÇÃO PRO** — `!vendas` (receita Kz+R$, por plano, ativos/expirando/trials/pendentes), `!rejeitar` com motivo, `approvedAt` no ativar, dono avisado na expiração |
| **v7.78** 📋 | **LISTAS RESTANTES** — myinstants, tiktokstalk, anime e filme com escolha por número; auditoria final (pinterest/pinvd/Aura/portal18 sem títulos — sem lista) |
| **v7.77** 📋 | **LISTAS COMPLETAS** — play/vídeo/sly/Spotify/SoundCloud/erome/ttks/NPC mostram todos os resultados e o user escolhe o número; sly animado preserva a animação |
| **v7.76** 🚀 | **CANAL SUPER** — `!super` (um post para todos os canais + `grupos`), alvo por comando `!canal @2 …`, `!canal painel` estilo Meta |
| **v7.75** 🛡️ | **GRUPOS PRO** — `!backupgp`/`!restoregp` (fotografia da config), `!slowmode` (modo lento), `!setwarnlimit`, antiflood com rajada + chuva de figurinhas |
| **v7.74** ⚡ | **CENTRAL DA AURA** — `!auraset`: painel IA/voz/humor/memória/proativa/presença; voz por chat, nível de vida, humor, `memoria`/`esquecer`, `acorda`/`dorme` |
| **v7.73** 📢 | **CANAIS PRO** — `divulgar` (cross-post grupo→canal), `postar` com foto/vídeo, multi-canal (`lista`/`usar`), `resumo` do grupo no canal, agenda `Nx ao dia` |
| **v7.72** 🔑 | **PREFIXO AUTO** — dizer "prefixo" mostra o cartão System-style com botão de copiar; `!prefixo` usa o mesmo cartão; funciona até sem aluguel (funil) |
| **v7.71** 💭 | **AURA VIVA** — fala sozinha em todos os grupos (menos os adormecidos); humor manda na iniciativa; reacções espontâneas; níveis calma/normal/viva |
| **v7.70** ☀️ | **PV nunca dorme** — cliente no privado recebe SEMPRE resposta (vontade e `[SILENCIO]` não calam); só flood extremo silencia; resposta de cortesia com `!menu` |
| **v7.69** 📎 | **Funil rende mais** — `!paguei` aceita foto do comprovativo (segue p/ o dono); Pix copia-e-cola no pedido; avisos de expiração 3d/1d + desligar expirados |
| **v7.68** 🧾 | **Fatura nativa** — pedido `!alugar plano:X` gera cartão `orderMessage` (PEDIDO N.º / Fatura / Total / Ver encomenda) com fallback interativo→texto |
| **v7.67** 🏠 | **Aluguer System-Zero** — cartão `!alugar` com foto + lista de planos; pedidos `DARK-N` com Multicaixa/Pix; `!paguei`→avisa dono→`!ativar`; gate duro em grupo sem ativação; trial 7 dias; `!setpreco`/`!setpagamento` |
| **v7.66** 🖼️ | **`!setmenu` aparece** — submenus dinâmicos (`menuia`…) ignoravam a mídia; header interativo agora usa foto/vídeo; alvos órfãos fundidos; novos alvos `zoeira`/`texto`/`search`/`dono`; digest `!noticias` em paralelo (16s→4s) |
| **v7.65** 🧰 | **Arsenal da Aura** — Tavily a sério nas respostas (RSS de fallback); transcrição Whisper→AssemblyAI; `needsWeb` dispara em pesquisar/buscar/procurar |
| **v7.64** 🖼️ | **`!setmenu` persistente** — mídia guardada no Mongo (sobrevive a restarts); painel avisa ⚠️ se o ficheiro se perdeu; **Twitter/IG** com routing vídeo/foto corrigido; **Kwai** por scrape direto; **`!shazam`** com fallback grátis + áudio citado via Whisper |
| **v7.63** 🌹 | **Aura de volta** — Groq sem os Llama mortos (gpt-oss primeiro), Gemini 3.7/3.6, OpenAI ligado, fallback PopCat morto removido; humor novo **`revoltada`** ("aura fica revoltada") |
| **v7.62** 📥 | **Comandos principais livres** — downloads/play/vídeo funcionam sempre (fora dos modos); `!like` ganha aliases `likesff`, `likeff`, `fflike`, `likefree`; nativo `likeff`→`likebot`; `!fdc` com fallback offline em 4s |
| **v7.61** 🚦 | **`!modo` por utilidade** — cada grupo liga/desliga categorias (brincadeiras, jogos, IA…); comando barrado pede ativação ao admin |
| **v7.60** 🎛️ | **`!modo`** (painel de funcionalidades) · **`!canal`** (Aura gere canais: postar/criar/agendar/stats) · **`!setmenu`** (foto/vídeo/GIF do menu com compressão inteligente) |
| **v7.59** 🎵 | **Áudio do botão SEM capa** — removido `externalAdReply`+thumbnail (quebrava entrega/renderização); áudio simples entrega sempre + log `nocover` |
| **v7.58** ⚡ | **React colado** — disparo imediato sem await de config (cache 10s) + 139 `await react` removidos (cada comando poupa ~1 RTT) |
| **v7.57** 👑 | **`!admins` melhorado** — lista todos (👑 dono / 🛡️ admins, `2/13`) ou verifica UMA pessoa: responde com `!admins`, `!eadmin @pessoa` / número |
| **v7.56** 🔊 | **Áudio blindado** — validação de bytes MP3 antes de cada envio + thumbnails saneados (só JPEG/PNG ≤96KB) · **`.musictest`** diagnóstico (só dono) · logs `[MUSIC-SEND]` |
| **v7.55** 👻 | 11 **comandos fantasma** implementados (`info`, `restart`, `blacklist`, `setpremium`, `qrcode`, `horoscopo`, `decrypt`, `statusvideo`, `x`, `figura`, `bass`) · fallback yt-dlp no TikTok · `audit-publico` 1605/0 |
| **v7.54** 📥 | Histórico: o fluxo Spotify foi posteriormente substituído por links oficiais do player (sem fallback yt-dlp); SoundCloud mantém o seu próprio fluxo |
| **v7.53** ⚡ | Pipeline **83ms → 1ms**: hotCache TTL 45s, groupMetadata paralelo, stats fire-and-forget, presets `veryfast`, heartbeat `composing` na IA |
| **v7.52** 🚀 | TURBO: humanizer fast, 1 query/mensagem, ffmpeg/yt-dlp async, heap 1.5GB |
| **v7.51** 🛡️ | Call gates anti-ban: o bot **nunca** liga sozinho (o número cai na hora) |

<div align="center">

<video src="assets/demo.mp4" poster="assets/demo-poster.jpg" width="720" controls muted loop playsinline></video>

*[▶ Ver demo em ecrã cheio](assets/demo.mp4)*

</div>

---

## 🩸 ENTRA NO DARK SIDE

Imagina abrir o WhatsApp e encontrar uma entidade digital com identidade própria:

- menus que parecem painéis de comando;
- textos com símbolos, molduras e tipografia neon;
- respostas que mudam conforme a pessoa e o ambiente;
- cards com capas, botões e efeitos de interface;
- uma AURA que conversa como alguém real;
- um dashboard cyberpunk para controlar tudo;
- mídia verdadeira, convertida e entregue sem truques.

**Esse é o DARK BOT.**

<div align="center">

```text
╔══════════════════════════════════════════════════════╗
║  ☠️  DARK BOT — NÃO É UM BOT COMUM                  ║
║                                                      ║
║  🧠 PENSA     🎨 BRILHA     🛡️ PROTEGE              ║
║  🎵 TOCA      🎮 JOGA       🌑 DOMINA               ║
╚══════════════════════════════════════════════════════╝
```

</div>

---

## ⚡ UMA EXPERIÊNCIA VISUAL COMPLETA

### 🌌 Identidade neon viva

O DARK BOT foi pensado para ter uma identidade visual reconhecível em cada detalhe:

- roxo elétrico, ciano, rosa tóxico e vermelho de alerta;
- fundos com grid cyberpunk e pulsação neon;
- efeito glassmorphism nos cards;
- bordas luminosas e sombras coloridas;
- títulos em small caps e fontes monoespaçadas;
- separadores, símbolos Unicode e molduras exclusivas;
- respostas que parecem uma interface, não texto solto;
- temas de menu para mudar a atmosfera da rede.

<div align="center">
<img src="assets/menu-aura-neon.png" alt="Menu AURA Neon" width="300" />
<img src="assets/menu-aura-toxic.png" alt="Menu AURA Toxic" width="300" />
<img src="assets/menu-aura-moon.png" alt="Menu AURA Moon" width="300" />

*Três atmosferas: Neon · Toxic · Moon*

</div>

### ☠️ Card DARK TÓXICO

O comando `play` apresenta a música com capa, informações e botões numa experiência visual exagerada:

```text
╭━━━〔 ☠️ 𖤐 ᴅᴀʀᴋ ᴛᴏxɪᴄ ᴘʟᴀʏ 𖤐 ☠️ 〕━━━╮
┃ 🩸 Título da música
┃
┃ 👤 𝙲𝚊𝚗𝚊𝚕: artista ou canal
┃ ⏱️ 𝙳𝚞𝚛𝚊𝚌̧𝚊̃𝚘: 04:20
┃ 👁️ 𝚅𝚒𝚜𝚞𝚊𝚕𝚒𝚣𝚊𝚌̧𝚘̃𝚎𝚜: 1.234.567
┃
┃ ⚠️ 𓆩 𝙴𝚜𝚌𝚘𝚕𝚑𝚊 𝚘 𝚊𝚝𝚊𝚚𝚞𝚎 𓆪 ⚠️
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯

🩸 𖤐 𝙱𝙰𝙸𝚇𝙰𝚁 𝙰́𝚄𝙳𝙸𝙾 𖤐
☠️ 𖤐 𝙱𝙰𝙸𝚇𝙰𝚁 𝚅𝙸́𝙳𝙴𝙾 𖤐
```

### ✨ Cada resposta tem personalidade

O bot pode responder com:

```text
▸ texto estilizado
▸ reação contextual
▸ imagem real
▸ sticker estático ou animado
▸ áudio e nota de voz
▸ card com thumbnail
▸ botão interativo
▸ lista de seleção
▸ painel formatado
```

---

## 🧠 AURA — A ALMA DO DARK BOT

A AURA não aparece apenas quando alguém digita um comando. Ela entende contexto, ambiente e intenção.

<div align="center">
<img src="assets/aura-cover.png" alt="AURA" width="480" />
</div>

### Ela pode:

- conversar no privado;
- reconhecer o Dono, VIPs, admins e utilizadores;
- memorizar factos importantes;
- mudar de humor;
- acordar ou dormir num grupo;
- responder com personalidade diferente em PV e grupo;
- ouvir áudios e responder por voz;
- interpretar imagens e stickers;
- procurar fotos reais;
- aprender regras por conversa;
- executar ações autorizadas;
- controlar grupos através de linguagem natural;
- executar **qualquer comando do bot** só por conversa (com as permissões de cada um);
- saber que dia é, quem fez o quê no grupo e quando;
- **ligar-te de verdade** — chamada de voz real (até 6 pessoas), fala na chamada e toca música (`.call`, `.tocar`, "aura liga-me");
- falar de forma mais íntima, séria, irónica ou profissional.

> 📞 Chamadas de voz exigem `@systemzero/baileys ≥ 1.1.3`, `opusscript` e **ffmpeg** no servidor (`apt install ffmpeg` ou `ffmpeg-static`).
> 🛡️ O bot **nunca** liga sozinho — só quando o Dono pede (proteção anti-ban).

<div align="center">

```text
                 ✦ A U R A ✦
        ┌──────────────────────────┐
        │  memória   humor   voz   │
        │  visão     regras  alma  │
        └──────────────────────────┘
              “Estou aqui, meu Dark.”
```

</div>

---

## 🎵 MÍDIA DE VERDADE

Nada de respostas que prometem um ficheiro e entregam apenas um link quebrado. Cada rede é **testada ao vivo** — bytes reais verificados:

| Rede | Comando | Estado |
|---|---|---|
| TikTok | `.tiktok` | ✅ TikWM + fallback yt-dlp |
| YouTube | `.play` `.baixarvideo` `.baixaraudio` | ✅ ~1.5s |
| Facebook | `.facebook` | ✅ MP4 HD |
| X/Twitter | `.twitter` / `.x` | ✅ MP4 |
| Spotify | `.spotify` | ✅ MP3 via fallback |
| SoundCloud | `.soundcloud` | ✅ MP3 via fallback |
| Instagram | `.instagram` | ⚠️ precisa de cookies (`YTDLP_COOKIES_BASE64`) |
| Pinterest · GIFs · stickers | vários | ✅ |

### Velocidade escolhida para cada situação

| ⚡ Perfil | Áudio | Vídeo | Sensação |
|---|---:|---:|---|
| 🩸 Rápido | 96 kbps | 360p | chega primeiro |
| ☠️ Balanceado | 192 kbps | 720p | qualidade e velocidade |
| 💀 Supremo | 320 kbps | 1080p | máxima qualidade |

O motor usa conversão real com FFmpeg e fallbacks de download. O resultado é validado antes de chegar ao WhatsApp.

---

## 🎮 UM UNIVERSO DENTRO DO CHAT

### DARK RPG

Cria uma personagem, escolhe raça e classe, luta, evolui, entra em guildas, explora comunidades e constrói uma história.

### DARK BANK

Economia, carteira, banco, loja, recompensas, rankings e sistemas de progressão.

### JOGOS E INTERAÇÕES

Quiz, batalhas, roleta, anagramas, campo minado (`.minado`), rankings, família, desafios e dezenas de brincadeiras sociais.

### PACK INCOMING 🆕

Comandos vindos de fora, integrados e testados (76 asserts):

```text
🛡️ ADMIN  delstts · abrirgp/fechargp · horariosgp · antifoba · fobadd/fobdel · autoapresentar
🎮 JOGOS  minado (campo minado)
🔧 TOOLS  tourl · fakechat · fdc · grok · tiktokphoto · pdf · upscale · edits/edit
🎮 FF     infoff (perfil) · like (enviar likes) · spotifysearch
```

### DARKSHIELD

Proteção e autoridade para grupos:

```text
🛡️ anti-link       🛡️ anti-spam       🛡️ anti-raid
🛡️ anti-sticker    🛡️ anti-delete     🛡️ advertências
🛡️ whitelist       🛡️ bloqueios       🛡️ moderação
```

---

## 📡 DASHBOARD — O CENTRO DE COMANDO

Uma interface web para administrar o ecossistema inteiro:

- painel de estado do bot;
- QR code e pair-code;
- console de logs ao vivo;
- eventos em tempo real;
- controlo de grupos;
- utilizadores, cargos e premium;
- comandos e overrides;
- broadcasts com progresso;
- agenda e tarefas automáticas;
- pagamentos;
- mídia e Cloudinary;
- backup e importação;
- estatísticas;
- Dark Net Decrypter;
- CallBot e VoIP.

<div align="center">

```text
┌─────────────────────────────────────────────────────────┐
│  🕸️ DARK CONTROL CENTER                                │
├──────────────┬──────────────────────────────────────────┤
│  BOT ONLINE  │  AURA AWAKENED                          │
│  1944 CASES  │  SOCKET.IO LIVE                         │
│  DB READY    │  MEDIA ENGINE READY                     │
└──────────────┴──────────────────────────────────────────┘
```

</div>

---

## 🔐 DARK NET DECRYPTER

Uma área especializada para leitura e análise de configurações em vários formatos:

```text
EHI · HAT · NPV · SSH · OVPN · WIREGUARD · NETMOD
DARKTUNNEL · ANYTUNNEL · APNALITE · TLSTUNNEL · WYRVPN
JSON · TXT · BDNET
```

Com acesso controlado, logs e separação por permissões. No chat: envia o ficheiro, cola a URI ou usa `.decrypt` / `!vpn <uri>`.

---

## 💎 PERSONALIDADE VISUAL

O DARK BOT não depende de uma única aparência. Os menus e respostas podem assumir vários estilos:

```text
☠️ DARK TOXIC       — exagerado, agressivo, cheio de símbolos
🌌 CYBER NEON       — tecnológico, brilhante, futurista
🩸 BLOOD MOON       — sombrio, vermelho, intenso
💜 AURA             — elegante, místico, emocional
⚡ SYSTEM ZERO      — técnico, limpo, poderoso
👑 SUPREME          — premium, dourado, dominante
```

Cada tema pode alterar molduras, ícones, separadores, títulos e atmosfera.

---

## 🧬 NÚMEROS DO ECOSSISTEMA

<div align="center">

| 🧠 | 🎵 | 🎮 | 🛡️ | 📡 |
|---|---|---|---|---|
| AURA viva | mídia real | RPG e jogos | DarkShield | dashboard |
| memória | conversão | economia | moderação | eventos live |

### 1944 cases · 505 handlers · 20 modelos · 33 páginas · 88 grupos de teste · 1605 asserts

</div>

---

## 💎 PLANOS

<div align="center">
<img src="assets/tabela-precos-dark-bot.jpg" alt="Tabela de preços" width="480" />
</div>

---

## ☁️ DEPLOY NO NORTHFLANK

O projeto está preparado para o Northflank usando o `Dockerfile` da raiz. O container instala Node 20, FFmpeg e dependências de produção, expondo a porta `3000`.

Guia completo: [`NORTHFLANK_DEPLOY.md`](NORTHFLANK_DEPLOY.md).

No serviço, configurar `APP_URL`, `MONGODB_URI`, `SESSION_SECRET`, dados do Dono, dados do bot e pelo menos um provider de IA como secrets. Não colocar API keys no código ou no repositório.

Extras opcionais: `YTDLP_COOKIES_BASE64` (Instagram), `NYX_FF_TOKEN` (likes Free Fire), `GROQ_API_KEY` (IA).

Health checks:

```text
GET /health
GET /ping
```

## 🚀 COMEÇA A EXPERIÊNCIA

```bash
git clone https://github.com/onlynewsao-cmyk/darknet-tunnel.git
cd darknet-tunnel
npm ci
cp .env.example .env
npm start
```

Configura o teu ambiente com MongoDB, prefixo, número do Dono e pelo menos um provider de IA. Em produção, usa o Northflank com:

```env
APP_URL=https://teu-servico.northflank.com
```

> O `APP_URL` deve ser a raiz do domínio, sem `/dashboard` ou `/control`.

---

## 🧪 QUALIDADE

```bash
npm run test:syntax
npm run test:ejs
npm run test:smoke
npm run test:e2e
npm test
```

88 grupos de teste: sintaxe, menus, permissões, AURA, RPG, downloads (com **entrega real de mídia verificada**), conversão, chamadas anti-ban e fluxo end-to-end.

---

<div align="center">

# ☠️ DARK BOT
## 𝙽𝙰̃𝙾 𝙴́ 𝚂𝙾́ 𝙰𝚄𝚃𝙾𝙼𝙰𝙲̧𝙰̃𝙾.
## 𝙴́ 𝙿𝚁𝙴𝚂𝙴𝙽Ç𝙰. 🕸️

### Feito para dominar o caos com estilo.

</div>
