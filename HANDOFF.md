# Handoff — monorepo `pedidos`

Estado em **2026-08-21**. Motor único (`packages/core`) + dois apps deployáveis sozinhos
(`apps/csa`, `apps/fermentou`). **Os dois estão no ar rodando deste monorepo** — os repos
originais deixaram de ser a fonte da verdade e agora servem só de rollback.

Leia junto: **`ARQUITETURA.md`** (decisões, histórico fatia a fatia, o porquê de cada escolha) e
**`CLAUDE.md`** (regras de trabalho e portão de verificação).

---

## 1. Onde está rodando

| | CSA | Fermentou |
|---|---|---|
| **URL** | https://csaparahyba.com.br | https://csaparahyba.com.br:8092 |
| **Firebase** | `pedidos-csa` | `fermentou-9a97d` |
| **pm2** | `pedidos-csa` | `pedidos-app` |
| **Backend** | `127.0.0.1:3001` | `127.0.0.1:3004` |
| **Dir na VM** | `/opt/pedidos-csa` | `/opt/pedidos-app` |
| **Entrypoint** | `dist-server/server/index.js` | `dist-server/server/index.js` |
| **Oferta nasce de** | mensagem do produtor (`parse-message`, parser `fuzzy`) | catálogo (`from-catalog`) |
| **Rótulo da não-entrega** | `Colmeia` | `Retirada` |

O código dos **dois** apps vive em `github.com/rafaelsanchezsouza/pedidos-csa` (o repo da CSA
foi reaproveitado; a `main` de lá é este monorepo desde 2026-08-28). A tag **`pre-monorepo`**
marca o último commit do layout antigo — é o rollback no remoto. `~/repos/pedidos-app` nunca
teve remote; agora tem backup por tabela, dentro deste repo.

VM Oracle única (`csaparahyba.com.br`), nginx na frente, cert Let's Encrypt compartilhado.
O `evolution-api` (WhatsApp) é **infra da VM**, na 8080 — não é deployado por nenhum dos apps.
Hoje os dois usam a **mesma instância** do WhatsApp (número da CSA); número dedicado para o
Fermentou segue pendente.

## 2. Rodar e testar

```bash
npm install
npm run build -w @pedidos/core               # SEMPRE antes dos apps — eles consomem o dist/
npm run test:tz --workspaces --if-present    # ×3 fusos (BR/UTC/UTC+14) — NÃO PULAR
npm run build -w pedidos-csa  && npm run build:backend -w pedidos-csa
npm run build -w pedidos-app  && npm run build:backend -w pedidos-app
```

Placar atual: **core 185**, **csa 31**, **fermentou 9** — todos ×3 fusos. **Sem CI: o verde local
é o único portão.** Mudou estrutura de emissão? `rm -rf apps/*/dist-server` antes (o `tsc` não
limpa o `outDir`).

## 3. Deployar

```bash
cd apps/<app> && bash deploy.sh          # build + npm pack do core + scp + npm install + pm2
cd apps/<app> && bash deploy.sh --skip-build
```

O script **se verifica no fim**: lê `PORT` do `.env.production`, bate em `/api/tenants` pelo
localhost da VM e falha imprimindo o log do pm2 se nada responder. `OK: backend respondeu 401` é
o resultado bom — 401 é o esperado sem token.

**Merge em `main` não faz deploy.** Produção só muda rodando `deploy.sh`.

### Segredos — não estão no git
Cada app precisa de dois arquivos **gitignored**, que não vieram no `git subtree`:

| Arquivo | O que é | Onde tem cópia |
|---|---|---|
| `apps/<app>/.env.production` | Firebase, Evolution, GitHub, OpenAI, `PORT` | `~/repos/pedidos-csa`, `~/repos/pedidos-app` |
| `apps/<app>/deploy.env` | VM_USER/VM_HOST/VM_DIR/SSH_KEY/ENV_FILE | idem |

Numa máquina nova, copie os quatro antes de qualquer deploy.

## 4. Estado da migração da CSA (importante)

A produção da CSA foi migrada para o modelo canônico em **2026-08-21**, de forma **aditiva**:

- `tenants` criada (mesmos ids de `colmeias`, que continua lá)
- `tenantId` escrito em 458 docs, **`colmeiaId` preservado ao lado**
- `deliveryType 'colmeia'` → `'retirada'` em 18 docs (única mudança não-aditiva)

**Enquanto o `colmeiaId` existir, o rollback é barato:** redeployar a CSA a partir de
`~/repos/pedidos-csa` (intacto) e o código antigo acha tudo de novo, sem restaurar backup. O
único resíduo seriam os 18 `deliveryType`, que no código antigo trocam o rótulo na tela mas não
afetam regra (o frete pergunta `isEntrega`, que segue certa).

**A limpeza ainda não rodou** — é o passo que encerra esse rollback:

```bash
cd apps/csa
FIREBASE_ENV=prod npx tsx scripts/migrate-csa-canonico.ts --executar --limpar-legado
```

Backup da véspera da migração: `~/backup-csa-2026-08-21.json` (463 docs). **Tem dados pessoais
de membros** — fora do repo, apagar quando não for mais necessário.

## 5. Convenções e armadilhas (o que não é óbvio)

**Do motor**
- Rotas e serviços do core são **factories `(deps, config)`**. Portas em
  `packages/core/src/server/repo.ts` (`Repo`, `AuthGateway`, `WhatsAppGateway`) e
  `parseMessage.ts` (`MessageParser`).
- **Adapters ficam no app**: `server/adapters.ts`, `repositories/firestore.ts`,
  `middleware/auth.ts`, `services/whatsapp/`, jobs (cron é infra do app).
- **O engine não lê `process.env`** — integrações e segredos entram no boot do app.
- `@pedidos/core/server` é export separado do barrel raiz (o front importa `@pedidos/core` e não
  pode arrastar express); `@pedidos/core/ui` idem para React.
- Editar o core exige `npm run build -w @pedidos/core` para o server enxergar a mudança.

**De permissão**
- A autorização é do **servidor** (`packages/core/src/server/auth.ts`). Rota que muda dado ou lê
  dado de terceiro carrega o `Ator` e checa. O tenant vem do **recurso**, nunca do header.

**Dos dados**
- **`acesso` é lista** no modelo, mas a produção da CSA tem **string** (`'user'`/`'admin'`). Os
  predicados do core são **dual-mode** e normalizam rótulos legados (`user`→`consumidor`,
  `produtor`→`fornecedor`). **Nunca** comparar `user.acesso === 'admin'` — use `isAdmin` e cia.
- `deliveryType`: o motor só pergunta `isEntrega(u)`. O token de não-entrega é vocabulário de UI
  e **nunca** decide regra.
- Cuidado ao renomear: na CSA, `colmeia` em `roleDefaults` é **função no coletivo**, não tipo de
  entrega. E o texto de tela ("Nova Colmeia") é vocabulário do app, não modelo.

**De data e fuso**
- A regra de semana/quinzena já quebrou **3×** por fuso. `test:tz` roda em BR/UTC/UTC+14 e **não
  pode ser pulado**. A lógica é única, em `packages/core/src/domain/week.ts`.

**De UI**
- Componentes do core precisam de `../../packages/core/src/ui/**/*.tsx` no `content` do Tailwind
  de cada app. **Sem isso o build passa e o layout quebra em silêncio.**
- `applyBrand(brand, 'light'|'dark'|'auto')` — o tema é **parâmetro obrigatório** e os dois apps
  passam `'light'`. Ativar dark mode exige `'auto'` **e** ajustar o Tailwind (`darkMode: ['class']`
  e ninguém adiciona a classe hoje).
- A paleta da CSA está **espelhada** em `src/config.ts` e `src/index.css` — o CSS é o fallback
  que evita o flash antes do JS. Mexeu num, mexa no outro.

**De deploy** (as armadilhas que já custaram um deploy inteiro)
- `pm2 restart` **reusa o script da primeira subida** e ignora caminho novo. Por isso o script
  faz `pm2 delete` + `pm2 start`.
- `dotenv` **não reclama de path inexistente** — o boot seguia sem variável nenhuma e só
  estourava depois, no firebase-admin. Por isso `env.ts` procura o arquivo subindo e **falha
  dizendo o que faltou**.
- `@pedidos/core` é workspace e `npm install` não o resolve na VM: o deploy leva um **tarball**
  (`npm pack`) e reescreve a dep para `file:`. É `npm pack <caminho>`, **não** `npm --prefix`.
- **A verificação do motor cobre o `dist` inteiro, não um arquivo.** Até 2026-08-31 ela
  comparava só o sha de `dist/server/index.js`: mudança em `domain/` ou `ui/` passava com
  "motor confere" sem que nada daquilo fosse verificado (pegou o `fimDaAcolhida`). Agora é o
  sha da árvore — com `LC_ALL=C` no `sort` dos dois lados, senão a locale da sua máquina e a
  da VM ordenam diferente e a verificação falha em todo deploy por um motivo que não é o deploy.
- **O nome do arquivo de env tem que bater dos dois lados.** `env.ts` carrega `.env.production`
  (com `NODE_ENV=production`); o `deploy.sh` da CSA copiava para `.env` — o deploy atualizava um
  arquivo que o app nunca lê, e o boot pegava um `.env.production` obsoleto largado na VM.
  Sintoma: variável nova não chega e o erro só aparece no uso (foi assim que o
  `EVOLUTION_INSTANCE_NAME` sumiu e o login quebrou com 404 da Evolution em 2026-08-28).
  Corrigido nos dois apps; o `.env` velho entra no `rm` do deploy.

## 6. Pendências, em ordem

1. **Limpeza do legado da CSA** (`--limpar-legado`), depois de alguns dias de uso verde. Até lá o
   rollback existe.
2. **Aposentar os repos originais** (`~/repos/pedidos-csa`, `~/repos/pedidos-app` — os clones
   locais pré-monorepo) — só depois do
   item 1, porque são o plano de rollback. Arquivar, não apagar.
3. **Apagar o backup** com dados pessoais (`~/backup-csa-2026-08-21.json`).
4. **WhatsApp dedicado para o Fermentou** (hoje divide o número da CSA; ver `~/repos/ZAP-PROTOCOL.md`).
5. **Pix pré-entrega** — decisão de produto antes de codar (`apps/fermentou/PENDENCIAS.md` B1/B2).
6. **`.env.development`** não existe em nenhum dos dois apps — `npm run dev` quebra no boot do
   Firebase. Decidir se dev aponta para o mesmo projeto ou um separado.
7. ~~**Ligar o webhook de issues**~~ — **feito em 2026-08-30.** `/issue <texto>` no grupo
   `dev-csa` abre issue e o bot responde com o link (validado: issue #59). A entrada é
   compartilhada com o note-app pelo `zap-hub` (`~/repos/zap-hub`, ver `ZAP-PROTOCOL.md` §8).
   **O zap-hub não tem remote** — só existe nesta máquina.
8. **Isolamento por cliente + onboarding sem código novo** — questão em aberto, ver
   `ARQUITETURA.md` §5 "Questões em aberto" #3. Hoje o repo é **público** e um cliente novo
   custa ~6k linhas copiadas. Decisão adiada conscientemente em 2026-08-28: a solução tem que
   servir a N clientes, não ser um remendo pro Fermentou.

## 7. Riscos conhecidos

**Autorização — corrigida no código, ainda NÃO em produção.** Até 2026-08-21 o engine confiava no
frontend: bastava estar autenticado para listar todos os membros (nome, e-mail, telefone,
endereço), editar produto de qualquer tenant, marcar a **própria fatura como paga** ou se
**promover a admin** via `PUT /users/me`. Era pré-existente (a "Pendência F3" do handoff antigo),
não veio da adoção do engine.

A regra está agora em `packages/core/src/server/auth.ts`, com 18 testes escritos como casos
negativos (`server/auth.test.ts`) — o tenant vem sempre do recurso, nunca do header.

⚠️ **A primeira tentativa de deploy NÃO levou a trava** e passou verde: o `npm install` na VM
respondeu "up to date" porque o tarball do core sempre se chamou `pedidos-core-0.1.0.tgz` — nome
e versão fixos, dependência considerada satisfeita. O `deploy.sh` agora **carimba o tarball com
timestamp**, apaga a cópia instalada antes de instalar e **compara o sha256** do
`@pedidos/core` da VM com o build local, falhando se divergir.

O que **não** está fechado: o escopo de fornecedor depende de `User.producerId` estar preenchido.
Usuário com `acesso: ['fornecedor']` e sem `producerId` não consegue editar nada — é o lado
seguro do erro, mas confira o cadastro antes de dar esse acesso a alguém.

## 8. Docs

| Doc | Para quê |
|---|---|
| `ARQUITETURA.md` | decisões, histórico fatia a fatia, roteiro da migração (§4.5) |
| `CLAUDE.md` | regras de trabalho, portão de verificação |
| `apps/*/BUSINESS_RULES.md` | regras de negócio de cada cliente |
| `apps/fermentou/PENDENCIAS.md` | decisões de produto em aberto |
| `apps/fermentou/MERGE.md` | mapa fork × CSA (histórico; os port-backs do §6 já entraram) |
| `apps/*/definicoes_projeto.md` | **desatualizados** — descrevem os apps antes do monorepo |
