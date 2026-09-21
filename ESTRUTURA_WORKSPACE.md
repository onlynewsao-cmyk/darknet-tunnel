# DARK BOT — Mapa do workspace (actualizado 2026-09-21)

Repo: `https://github.com/onlynewsao-cmyk/darknet-tunnel`  
Pasta local: `/home/user/dark-bot`  
Branch: `main` · Último commit visto: `v11.2.0` (RPG Multiverso)  
`package.json` version: `9.20.0` (desfasado do git tag)

---

## Visão geral

Bot WhatsApp Node.js com 4 superfícies:

1. **Runtime WhatsApp** (Baileys `@systemzero/baileys`)
2. **AURA** — IA conversacional com memória, voz, intenções e acções
3. **Dashboard web** — Express + EJS + Socket.IO
4. **Domínio** — MongoDB, downloads, RPG, DarkShield, VoIP, Decrypter

Entrada: `src/index.js` → `npm start`

---

## Árvore principal

```
dark-bot/
├── src/
│   ├── index.js              # Bootstrap Express + Socket.IO + bot
│   ├── config.js             # Env normalizado
│   ├── aura/                 # Cérebro AURA (intent, voz, memória, grupo…)
│   ├── bot/
│   │   ├── whatsapp.js       # Socket Baileys + eventos
│   │   ├── commandHandler.js # Pipeline principal de mensagens
│   │   ├── caseHandler.js    # Carrega/regista ~1944 cases
│   │   ├── nativeCommands.js # Comandos nativos (incl. clean/limpar)
│   │   ├── messageListener.js# Cache + anti-delete + anti-status
│   │   ├── cases/            # Cases por domínio (grupos, dl, rpg…)
│   │   ├── rpg/              # Motor RPG / story / multiverse
│   │   ├── packages/         # economy, games, family, cheats…
│   │   └── dl/               # Helpers de download
│   ├── database/models/      # 21 modelos Mongoose
│   ├── decrypter/            # Dark Net Decrypter (EHI, OVPN…)
│   ├── cap/                  # C∆P monitor IG
│   ├── routes/               # auth, dashboard, api
│   ├── views/ + public/      # UI dashboard
│   └── sim/                  # Simulador local
├── scripts/                  # Dezenas de testes de regressão
├── docs/                     # Architecture, audits
├── assets/                   # Menus, tabelas, demo
├── incoming-cases/           # Cases externos a integrar
├── COMMANDS-ATIVOS.md        # Lista dos 1944 cases
├── WORKSPACE_CONTEXT.md      # Contexto longo do projecto
└── Dockerfile / render.yaml / NORTHFLANK_*.md
```

### Fluxo de uma mensagem

```
Baileys (whatsapp.js)
  → messageListener (cache / anti-status / anti-sticker)
  → commandHandler
       ├─ prefixEngine + roleResolver
       ├─ antiLink / antiSpam / antiTipos / humanizer
       ├─ caseHandler (cases/*)
       ├─ nativeCommands
       └─ AURA (se conversa natural)
  → resposta WA + Socket.IO
```

---

## Comandos ADM — onde vivem

| Ficheiro | Papel |
|---|---|
| `src/bot/cases/grupos.js` | Core ADM v6.39 (ban, del, promote, open/close, antilink, warn…) |
| `src/bot/cases/audioAdmin2.js` | Efeitos de áudio + **2.ª** implementação de vários ADM |
| `src/bot/cases/incomingAdmin.js` | Pack incoming (delstts, abrirgp, horarios, antifoba…) |
| `src/bot/cases/finalizar.js` | soadm, admins, autoadm… |
| `src/bot/nativeCommands.js` | Nativos incl. **`limpar` / `clean` / `limpartudo`** |
| `src/bot/submenuData.js` | Categoria `admin` + secções do menu |
| `src/bot/cases/dynamicSubmenus.js` | `!menuadm` / `!menugrupo` / `!menuadmin` |
| `src/bot/commandCatalog.js` | Catálogo dashboard |

### Regras de poder (v6.39 — `grupos.js`)

- **Dono do bot** → sempre pode usar comandos ADM (mesmo sem ser admin do grupo)
- **ADM do grupo** → pode usar
- **Bot** tenta executar; se falhar por falta de admin, avisa
- **Membro normal** → `🚫 Só Dono ou Admins do grupo.`

### Menu ADM (`!menuadm` / `!menugrupo`)

Secções em `submenuData.js` → `SUBCATEGORIES.admin`:

1. 🛡️ Moderação  
2. ⛔ Protecções (Anti-X)  
3. 👋 Boas-vindas & Saída  
4. 👥 Grupo  
5. 🔐 Permissões & Cargos  
6. ⚙️ Configuração  

Visibilidade: admin do grupo, VIP ou dono (`dynamicSubmenus.js`).

### Principais comandos ADM

**Moderação:** `ban`/`kick`, `tempban`, `mute`/`unmute`, `warn`/`unwarn`, `promote`/`demote`, `del`/`apagar`, **`limpar`/`clean`**, `hidetag`, `todos`/`everyone`

**Grupo:** `abrir`/`fechar`, `add`, `link`/`revoke`, `nomegp`, `descgrupo`, `fotogrupo`, `regras`/`setregras`, `sorteio`, `admins`/`tagadmins`, `participantes`, `out`/`sair`

**Protecções:** `antilink` (+ hard/soft/gp/canal), `antispam`, `antiflood`, `antisticker`/`bansticker`, `antistatus`, `antimencao`, `antiporn`, `antitoxic`, `antipalavra`, `antiraid`, `captcha`, `x9`

**Config:** `setprefix`/`prefixgrupo`, `temagrupo`, `welcome`/`bv`, `soadm`, `blockcmd`, `addmod`, `whitelist`/`wladd`, `automsg`, `autodl`…

---

## 🧹 Comando `clean` / `limpar` / `limpartudo`

**Fonte:** `src/bot/nativeCommands.js` (~L1859)

```js
async limpar({ sock, msg, ctx, args }) {
  if (!ctx.isGroup) return reply(..., '👥 Só em grupos.');
  if (!(await isAdmin(sock, ctx))) return reply(..., '🚫 Só admins.');
  if (!(await botIsAdmin(sock, ctx))) return reply(..., '⚠️ Preciso ser admin.');
  const n = Math.min(Math.max(Number(args[0]) || 20, 1), 50);
  const { messageCache } = require('./messageListener');
  const recent = [...messageCache.values()]
    .filter(m => m?.key?.remoteJid === ctx.remoteJid)
    .slice(-n);
  let ok = 0;
  for (const m of recent) {
    try {
      await sock.sendMessage(ctx.remoteJid, { delete: m.key });
      ok++;
      await new Promise(r => setTimeout(r, 120));
    } catch {}
  }
  return reply(..., `🧹 DARK CLEAN … Apagadas: ${ok}`);
}
async clean(a) { return module.exports.limpar(a); }
async limpartudo(a) { return module.exports.limpar(a); }
```

### Comportamento

| Item | Detalhe |
|---|---|
| Aliases | `limpar`, `clean`, `limpartudo` |
| Uso | `!clean` ou `!limpar [N]` (N = 1–50, default **20**) |
| Onde | Só em **grupos** |
| Quem pode | `isAdmin(sock, ctx)` — admin do grupo; dono só se **godmode_admin** estiver ON |
| Bot precisa | Ser **admin** do grupo (`botIsAdmin`) |
| Fonte msgs | `messageListener.messageCache` (Map, máx. **2000** msgs globais) |
| Acção | `sock.sendMessage(jid, { delete: m.key })` com delay 120 ms |
| Categoria menu | `admin` → secção 🛡️ Moderação (`limpar` no regex; alias `clean` via map `clean:'admin'`) |
| Catálogo | `commandCatalog`: name `limpar`, `ownerOrAdmin: true` |

### Diferença vs `!del`

| | `!del` / `apagar` | `!clean` / `limpar` |
|---|---|---|
| Alvo | 1 mensagem **citada** | N mensagens **do cache** do grupo |
| Implementação | `grupos.js` + `audioAdmin2.js` | `nativeCommands.js` |
| Gate dono | Dono sempre (senderIsAdmOrOwner) | Dono só com godmode_admin |
| Limite | 1 | 1–50 (default 20) |

### Limitações reais do WhatsApp

- Só apaga o que o bot consegue via API (regras de tempo / “delete for everyone”).
- Só mensagens que ainda estão no `messageCache` em RAM (não é histórico completo do grupo).
- Cache é FIFO global (2000); em grupos muito activos as msgs antigas saem do cache.
- `limpartudo` é **alias** de `limpar` — **não** limpa o grupo inteiro.

### Nota de inconsistência de permissões

Em `grupos.js`, o dono passa sempre em `senderIsAdmOrOwner`.  
Em `nativeCommands.isAdmin`, o dono **só** passa se `BotConfig.godmode_admin_enabled` estiver activo.  
Ou seja: o dono pode usar `!ban`/`!del` sem ser admin do grupo, mas `!clean` exige ser admin do grupo **ou** godmode.

---

## Outros “clean/limpar” (não são o clean ADM)

| Comando | Onde | Função |
|---|---|---|
| `limparhorarios` | incomingAdmin | Limpa horários de abrir/fechar GP |
| `limparrank` / `resetrank` | audioAdmin2 misc | Reset ranking do grupo |
| `editlimpar` | IA / nano banana | Limpa sessão de edição de imagem |
| `cleanThumb` | mediaHandler | Valida thumbnail JPEG |
| `cleanQuery` | portal18 | Sanitiza queries adultas |
| cleanup AURA | auraSmart / auraSorteios | GC periódico interno |

---

## Modelos MongoDB (21)

`AiMemory`, `AntiStatus`, `BannedSticker`, `BotConfig`, `CloudMedia`, `Command`, `CommandOverride`, `DecryptLog`, `DeletedMessage`, `Economy`, `GameSession`, `GroupMemberActivity`, `GroupSettings`, `Log`, `Media`, `Payment`, `RPGPlayer`, `Schedule`, `Session`, `SessionSlot`, `User`

---

## Arranque rápido

```bash
cd dark-bot
cp .env.example .env   # MongoDB, OWNER_*, BOT_*, AI keys
npm ci
npm start              # porta 3000 (ou PORT)
```

Health: `GET /health`, `GET /ping`  
Dashboard: `/dashboard`  
Testes ADM vs Dono: `node scripts/test-admin-dono-audit.js`
