# Pedidos — motor compartilhado, apps separados

Monorepo com um **motor único** (`packages/core`) consumido por **apps separados e
independentemente deployáveis** (`apps/csa`, `apps/fermentou`). As diferenças entre clientes
são **configuração**, não fork de código.

> Estado: **tasks 1–4 concluídas e verdes**; **task 5 quase concluída** — engine `core/server`
> com portas (`Repo`, `AuthGateway`, `WhatsAppGateway`, `MessageParser`) e **todas as rotas do
> fermentou como factories** (inclusive `offerings`), modelo canônico em `types.ts` e CSA
> usando acesso-lista; **task 6 é a próxima**. Branch
> `feat/monorepo-motor-compartilhado`. Os repos originais (`~/repos/pedidos-csa`,
> `~/repos/pedidos-app`) seguem **intactos** como fonte da verdade até este monorepo substituí-los.

---

## 1. Por que

Existiam dois repos separados: `pedidos-csa` (CSA, **em produção com dados reais**) e
`pedidos-app` (fork genérico, 1º cliente padaria **Fermentou**, no ar sem dados). Mudanças úteis
num não chegavam ao outro e `git cherry-pick` já não funcionava (identificadores divergiram).
Objetivo: **um motor, dois apps**, sem duplicar código, mantendo deploys/Firebase/vocabulário
próprios de cada cliente.

Achado que orientou tudo: o **fork já estava à frente** (nomenclatura genérica `tenant`,
`brand.ts`, `acesso` como lista, cotas dinâmicas). Então o motor **nasce do fork** e a CSA vira
um app configurado sobre ele. Custo escondido mais caro: a lógica de semana/quinzena estava
**duplicada 4×** (2 apps × client/server) e já quebrou 3× por fuso — unificá-la foi o 1º ganho.

### Decisões (aprovadas pelo usuário)
1. **Monorepo + npm workspaces** — deploys independentes.
2. **Migração única** da produção da CSA para nomes canônicos (`colmeiaId`→`tenantId`, coleção
   `tenants`, header `x-tenant-id`, `deliveryType` `'colmeia'`→`'retirada'`). Motor **sem** camada
   de mapeamento.
3. **Extração completa** do motor (não fatiada por feature).
4. **Migração da CSA com janela de manutenção** (decidido 2026-08-10): script de **uma passada
   só**, com backup antes e ensaio em cópia. Zero-downtime exigiria ressuscitar a fase
   transitória lendo os dois nomes (`MERGE.md` §7.2) — código que nasce para morrer, que é
   justamente o que a decisão 2 quis evitar. O custo aceito é alguns minutos fora do ar.

---

## 2. O que já foi feito (verificado)

| Task | Entrega | Verde |
|---|---|---|
| **1. Esqueleto** | monorepo (workspaces); `pedidos-csa`→`apps/csa` e `pedidos-app`→`apps/fermentou` via `git subtree` (história preservada) | — |
| **2. Domínio** | `packages/core/domain`: `week` (unifica as 4 cópias client/server num módulo com cross-check), `quota` (tiers do fork + `quotaAmount`/`quotaQty` da CSA #45), `frete`, `status`, `delivery`, `csv`. **Os dois apps consomem** via `@pedidos/core`; **28 arquivos duplicados removidos** | core 65, csa 25, fermentou 27 (× BR/UTC/UTC+14) + builds |
| **3. Acesso** | `packages/core/acesso.ts`: modelo de permissão como **lista** (predicados + `tipoDeAcesso`/`montarAcesso`), entrada **dual-mode** (aceita `User` ou campo cru), **normaliza rótulos legados** da CSA (`user`→`consumidor`, `produtor`→`fornecedor`) — leitura retrocompatível sem migração. Fermentou consome | core 82, fermentou 19 |
| **4. Config** | `packages/core/config.ts`: contrato **`AppConfig`** + `validateAppConfig`. `apps/fermentou/src/config.ts` tipada e validada | core 89, fermentou 22, build front |

| **5. Engine** | `packages/core/server`: portas (`Repo`, `AuthGateway`, `WhatsAppGateway`, `MessageParser`) + **todas as rotas/serviços como factories `(deps, config)`**; modelo canônico em `types.ts`; CSA usando acesso-lista. Detalhe fatia a fatia abaixo | core 150, csa 25, fermentou 22 + 4 builds |

**Placar atual:** `@pedidos/core` **150 testes**, `apps/csa` **25**, `apps/fermentou` **22** — todos
× 3 fusos (BR/UTC/UTC+14). Builds front + backend dos dois apps verdes.

### Task 5 — fatia a fatia (concluída)
- **`isEntrega` + fim do `pickupValue`** (decisão registrada acima): predicado no domínio;
  apps adotaram nos pontos de regra.
- **`packages/core/server` criado (piloto `tenants` verde ponta-a-ponta no fermentou):**
  - `repo.ts` — **porta `Repo`** (getDoc/listDocs/createDoc/updateDoc/deleteDoc + `WhereOp`
    enxuto); assinatura idêntica ao repositório Firestore dos apps de propósito (adoção =
    montar um objeto). `memoryRepo.ts` — adapter de memória para testes (do core e dos apps).
  - `middleware/tenant.ts` — `createTenantMiddleware(deps)` (header `x-tenant-id` vence;
    fallback doc do usuário).
  - `routes/tenants.ts` — `createTenantsRouter(deps, config)`: seeds do POST vêm de
    `config.tenantDefaults` (fim do 'Fornada'/65/40/10 hardcoded); fornecedor-loja é semeado
    **sse** `offeringSource='from-catalog'`. Testado como servidor http real (porta efêmera +
    memoryRepo): permissões GET/PUT, seeds, sanitização de quotas.
  - Export `@pedidos/core/server` **separado do barrel raiz** (front não arrasta express).
  - Boot do fermentou injeta `repo` + `config` (de `src/config.ts`, agora compilado também
    pelo tsc do server — `rootDir: '..'`; **emissão mudou** para `dist-server/server/index.js`,
    `start` e `deploy.sh` atualizados). `routes/tenants.ts` e `middleware/tenant.ts` do app
    **removidos**.
- **Rotas pequenas movidas** (fatia 2): `roles` (defaults de `config.tenantDefaults.roleDefaults`),
  `producers`, `products`, `issues` (integração GitHub injetada no boot — engine não lê env).
- **Rota `users` movida** (fatia 3): portas **`AuthGateway`** (Firebase Auth) e
  **`WhatsAppGateway`** (adapter normaliza telefone); `Repo` ganha `setDoc`/`updateMany`;
  mensagem de reset usa `vocabulary.otpAppName` (fim do "App da CSA" hardcoded — no fork
  estava até errado); adapters do fermentou confinados em `server/adapters.ts`.
- **`paymentService` unificado + rota `payments`** (fatia 4): fórmula única
  `quotaAmount(weeklyRate(tier), quotaQty, weeks)` cobre fork e CSA (#45); fallbacks 65/40/10 →
  `config.tenantDefaults`; sentinelas `'Cota'`/`'Entrega'` = constantes canônicas;
  `countDeliveryWeeks` subiu para `domain/week` (era duplicado; testado ×3 fusos).
- **`orders` movido** (fatia 5): `createOrdersService` (consolidado por produtor, `lockWeek`,
  `isWeekLocked`) + `createOrdersRouter` (gate de extras, upsert de pagamentos ao enviar).
  `normalizePhone` no core com a regra **normalizar uma vez, no adapter que envia** (dupla
  normalização corrompia números curtos); serviços repassam contato cru. `sendOrdersJob`
  perdeu a cópia inline de `getWeekStart` e os `?? 2/6` (vêm da config); jobs continuam no
  app (o cron é infra do app; o core expõe a lógica).
- **`whatsappAuth` (OTP) movido** (fatia 6): rota pública com rate-limit e uso único;
  `AuthGateway` ganha `createCustomToken`; mensagem usa nome do tenant com fallback
  `vocabulary.otpAppName` (fim do "Pedidos CSA" hardcoded).
- **Porta `MessageParser` + parser fuzzy no core** (fatia 7a): `server/parseMessage.ts`
  (contrato `MessageParser`/`ExistingProduct`/`ParsedProduct`) e `server/fuzzyParser.ts`
  (implementação pura, default de `messageParser='fuzzy'`, agora com testes — não tinha).
  O adapter `openai` fica **no app CSA** (dep e chave injetadas no boot); o barrel
  `parseMessage/index.ts` morre na adoção — a seleção vem de `config.capabilities.messageParser`.
- **`offerings` movido — última rota** (fatia 7b): `createOfferingsRouter(deps, config)` com
  `upsertOffering` único (normaliza pelo catálogo, dedup, substitui oferta da semana, descarta
  produtos removidos dos pedidos, auto-desbloqueio de extras — via `Repo`, sem `db` direto).
  Rotas por capacidade: `POST /parse` montada **sse** `offeringSource='parse-message'`
  (fuzzy vem do core; `openai` exige `deps.parseMessage` e falha **no boot** se faltar);
  `POST /from-catalog` **sse** `'from-catalog'`. `rawMessage` é opcional no doc (só existe no
  fluxo parse) e o fallback o descarta ao copiar. Fermentou adotou; `server/routes/` do app
  **esvaziou**. Dead code não portado: `producerFilter` construído e nunca usado no /fallback
  dos dois apps.
- **Modelo canônico consolidado em `packages/core/src/types.ts`** (fatia 8): docs
  `Tenant/User/Producer/Product/Role/Offering/Order/Payment` num lugar só (supersets
  reconciliados — ex.: `UserDoc` ganha `quotaQty`/`quinzenalParity` que só o paymentService
  declarava). Rotas/serviços importam de lá e **re-exportam os mesmos nomes** (API do
  `@pedidos/core/server` inalterada); as visões locais viram projeções
  (`TenantSettings = Pick<TenantDoc, …>`). Ficou em `types.ts` (arquivo único) em vez de
  `types/` — os docs são só interfaces, não justificam diretório.
- **CSA adotou acesso-lista** (fatia 9 — fecha a task 5): as 20 checagens inline
  (`acesso === 'admin' || === 'superadmin'`, `=== 'produtor'`) viraram `isAdmin`/`isSuperadmin`/
  `isFornecedor` do core em `App`, `Sidebar`, `BottomNav`, `PedidosPage`,
  `VerificarPagamentosPage`, `EntregasPage`, `ConsolidadoGeralPage`, `AdminPage` e, no server,
  `colmeias.ts`/`orders.ts`. Os predicados normalizam os rótulos legados (`user`→`consumidor`,
  `produtor`→`fornecedor`) e aceitam o campo como string única — **leitura retrocompatível com a
  produção, sem migração de dados** (os testes da CSA seguem montando `acesso: 'user'`/`'admin'`
  como string e passam). Nenhuma mudança de comportamento: em `colmeias.ts` PUT o
  `isColmeiaAdmin` passou a incluir superadmin, que já entrava pelo `isSuperAdmin` ao lado.
  *Decisão de fronteira:* `middleware/auth` (verificação de token Firebase) e o serviço
  `whatsapp/` **ficam no app** — são adapters das portas, não engine.

### Task 6 — progresso
- **`core/ui` criado (piloto `PageHeader` verde nos dois apps)** (2ª fatia):
  - Export `@pedidos/core/ui`, **separado do barrel raiz e do `/server`** — o server importa
    `@pedidos/core` e não pode arrastar React, como já valia para o express.
  - **Build próprio**: `tsconfig.ui.json` (`jsx: react-jsx`, `module ESNext`/`bundler`) porque o
    `tsconfig.build.json` é NodeNext e não compila TSX; este passou a **excluir `src/ui`** e
    `src/test`. `npm run build -w @pedidos/core` roda os dois tsc.
  - `react` é **peerDependency opcional** — quem instala é o app; o core só a usa em `ui/`.
  - **Tailwind**: `../../packages/core/src/ui/**/*.tsx` entrou no `content` dos dois apps —
    sem isso as classes do componente não são geradas e o layout quebra **em silêncio** (build
    passa). Verificado no CSS emitido dos dois apps, não só no build.
  - Vitest do core ganhou jsdom + Testing Library (`src/test/setup.ts`, igual ao dos apps) e
    passou a incluir `.tsx`; os 9 testes do `PageHeader`, que eram **cópia idêntica nos dois
    apps**, viraram 9 no core.
  - *Fronteira do kit:* entra só o que não conhece o app. `ReportarProblema` **fica no app**
    apesar de quase idêntico — depende de `useAuth`/`issuesApi` e diverge no vocabulário
    (`colmeia` × `tenant`).
- **Primitives shadcn + `cn` movidos** (3ª fatia): os **10** componentes de `components/ui/`
  (badge, button, card, dialog, input, label, select, table, tabs, textarea) eram **cópia byte a
  byte** nos dois apps e agora vivem em `core/src/ui/primitives/`; `cn` (clsx + tailwind-merge)
  virou `core/src/ui/cn.ts` e o `lib/utils.ts` dos apps só o **reexporta** (os imports
  `@/lib/utils` espalhados continuam válidos). radix/lucide/cva/clsx/tailwind-merge entraram
  como **peerDependencies opcionais** do core. 34 arquivos trocaram
  `@/components/ui/*` por um único import de `@pedidos/core/ui`; `components/ui/` **sumiu** dos
  dois apps.
  *Prova de que nada mudou visualmente:* o CSS emitido pelo Vite tem **hash idêntico**
  (`index-JHq-dmPc.css`) antes e depois da extração — byte a byte o mesmo.
- **`EstadoLista`/`WeekNavigator`/`MonthNavigator` + `applyBrand`** (4ª fatia, fecha o kit):
  os três componentes eram idênticos nos dois apps e subiram junto com o teste do
  `EstadoLista` (era cópia dupla, agora é uma). `applyBrand` saiu do `lib/brand.ts` do
  fermentou para `core/ui`; o `brand.ts` do app ficou **só com o dado** e o tipo `Brand` passou
  a vir do core. `Layout`/`Sidebar`/`BottomNav` ficam no app — divergem em itens de menu e
  vocabulário.
  ⚠️ **Achado que mudaria a aparência da CSA em produção:** o `applyBrand` do fork escolhia a
  paleta por `prefers-color-scheme`, mas o Tailwind dos dois apps usa `darkMode: ['class']` e
  **ninguém adiciona a classe `.dark`** — ou seja, as telas são sempre claras e o bloco `.dark`
  do `index.css` nunca ativou. Ligar o `applyBrand` na CSA como estava teria dado tema escuro a
  quem usa o SO em dark mode. Por isso o **tema virou parâmetro obrigatório**
  (`applyBrand(brand, 'light'|'dark'|'auto')`) e os dois apps passam `'light'` explicitamente —
  preservando o comportamento atual. Travado por teste (`brand.test.ts` mostra 'light' × 'auto'
  com o sistema em escuro). Ativar dark mode de verdade = passar `'auto'` **e** ajustar o
  Tailwind.
  A paleta da CSA **segue espelhada** em `config.ts` e `index.css`: o CSS continua sendo o
  fallback que evita o flash antes do JS rodar. Tirar as cores de lá é decisão à parte, com
  esse custo.
- **`apps/csa/src/config.ts` criada** (1ª fatia): `AppConfig` da CSA com os valores que já
  estavam hardcoded — paleta do `index.css`, seeds do `POST /colmeias` (65/40/10),
  defaults dos jobs (terça 6h, semana vira domingo), `roleDefaults` `['colmeia','coagricultor']`,
  `pickupLabel: 'Colmeia'`, `offeringSource: 'parse-message'` + `messageParser: 'fuzzy'`.
  **Declarar não muda nada**: nada consome a config ainda (a CSA só adota o engine depois da
  migração) e a paleta segue sendo aplicada pelo `index.css`, não por `applyBrand`.
  ⚠️ A paleta está **espelhada** em `config.ts` e `index.css` até `core/ui` assumir — o CSS
  carrega o aviso. Comparar os dois num teste exigiria `node:fs`, e dar tipos de Node ao
  tsconfig do front custa mais do que a trava vale (`?raw` volta vazio no Vitest).

### Roteiro da próxima sessão — task 6
1. `migrate-csa-canonico.ts` (janela de manutenção — ver decisão 4); validar **em cópia** antes
   de produção.
2. Só **depois** da migração a CSA adota o engine (rotas `tenants`, `offerings` etc.) — até lá
   segue com as rotas próprias `colmeia*` e o `parseMessage/` local. O adapter `openai` do app
   nasce nessa adoção (a porta e o parser fuzzy já existem no core).
3. Consertar o `deploy.sh` do fermentou (⚠️ abaixo) e deployar os dois apps.
- ⚠️ **Deploy do fermentou está quebrado desde a task 1** (não é regressão): `deploy.sh` copia
  só o `package.json` do app e roda `npm ci` na VM — `@pedidos/core` não resolve fora do
  workspace. Resolver na task 6 (empacotar o core no artefato ou `npm pack`).

### Como o server consome o core (o ponto que exigia decisão)
`@pedidos/core` **builda para `dist`** (`tsc` NodeNext → `.js` + `.d.ts`); imports internos com
extensão `.js` (ESM válido no node). Assim **todos os consumidores resolvem igual** via
`package.json#exports`: Vite (front), Vitest, `tsc` node16 (server) e `node`/`tsx` (runtime).
Custo: editar o core exige `npm run build -w @pedidos/core` para o server ver a mudança
(o front, via Vite, também usa o `dist`).

---

## 3. Estrutura atual

```
pedidos/
├── package.json                 # workspaces: packages/*, apps/*
├── tsconfig.base.json
├── packages/
│   └── core/                    # @pedidos/core — o MOTOR (domínio + acesso + config + engine)
│       ├── package.json         # exports → dist; build = tsc NodeNext
│       ├── tsconfig.build.json  # emite dist (.js + .d.ts)
│       └── src/
│           ├── domain/          # week, quota, frete, status, delivery, csv (+ testes)
│           ├── server/          # ENGINE: repo.ts (portas), memoryRepo, testutil, phone,
│           │                    #   parseMessage (porta) + fuzzyParser, middleware/tenant,
│           │                    #   routes/* e services/* — todos factories (deps, config)
│           ├── acesso.ts        # modelo de permissão (lista) + predicados
│           ├── config.ts        # AppConfig + validateAppConfig
│           ├── types.ts         # modelo canônico (docs Tenant/User/Order/Payment/Offering…)
│           └── index.ts         # barrel (front); engine = '@pedidos/core/server'
└── apps/
    ├── csa/                     # app CSA — domínio/acesso do core; rotas ainda próprias
    │   ├── src/lib/             # SÓ o que é específico: quota.ts (formatQuota), utils.ts
    │   └── server/              # routes/{colmeias,offerings,...}, services/{paymentService,
    │                            #   ordersService, parseMessage/, whatsapp/}
    └── fermentou/               # app Fermentou — consome o ENGINE inteiro
        ├── src/config.ts        # AppConfig do app
        ├── src/lib/             # brand.ts, features.ts, utils.ts
        └── server/              # entrypoint fino: index.ts + adapters.ts, middleware/auth,
                                 #   repositories/firestore, services/whatsapp, jobs/
```

O fermentou **não tem mais `server/routes/`** — tudo vem do engine. O que ainda vive nos dois
apps é adapter ou infra (auth Firebase, Firestore, whatsapp, cron). A CSA segue com as rotas
próprias `colmeia*` e o `parseMessage/` local **até a migração canônica** (task 6) — é a última
duplicação, e é proposital.

---

## 4. Arquitetura-alvo

### 4.1 Camadas
```
packages/core/
  domain/    cálculo puro (feito)               → week, quota, frete, status, delivery, csv
  acesso     permissão (feito)
  config     AppConfig (feito)
  types.ts   modelo canônico (feito)            → Tenant, User, Order, Payment, Offering, Producer…
  server/    ENGINE parametrizado (feito)       → route factories, services, middleware,
             portas (Repo/Auth/WhatsApp/MessageParser) — recebem (deps, config).
             Jobs ficaram no app: cron é infra, o core expõe a lógica
  ui/        design-system kit (feito)          → cn, applyBrand, PageHeader, EstadoLista,
             build próprio (tsconfig.ui.json)      Week/MonthNavigator, 10 primitives shadcn
apps/<app>/
  src/       páginas + vocabulário próprios (consomem core + config)
  server/    entrypoint fino: monta integrações do .env + injeta AppConfig no engine
  config.ts  a instância de AppConfig do cliente
```

**Fronteira:** `core` = motor (domínio + engine + kit de UI). **Páginas e vocabulário ficam no
app** (os fluxos divergem: colapso de fornecedor único, abas Clientes/Admins, cadastro por tipo).
Cada app permanece **deployável sozinho** (pm2/nginx/porta/Firebase próprios) — monorepo ≠ deploy
único.

### 4.2 `AppConfig` — a configuração (feito na task 4)
Objeto tipado por app, injetado no motor. Só o **estático e seguro no front**:
```ts
interface AppConfig {
  brand:        Brand           // nome, tagline, ícone, paleta (light/dark)
  vocabulary:   { pickupLabel; otpAppName }
  capabilities: { offeringSource: 'parse-message'|'from-catalog'; messageParser?; multiTenant; paymentStrategy }
  tenantDefaults: { quotaTerm; quotas[]; quotaInteira; quotaMeia; roleDefaults[];
                    dueDay; orderSendDay; orderSendHour; weekChangeDay }
}
```
**Integrações/env** (Firebase, WhatsApp instance, OpenAI key) **não** entram no `AppConfig` — são
runtime do server e injetadas no boot do engine (task 5). É o que separa identidade/comportamento
(estático, compartilhável) de segredo (server-only).

| Knob | CSA | Fermentou |
|---|---|---|
| `offeringSource` | `parse-message` (+`messageParser`) | `from-catalog` |
| `tenantDefaults.quotaTerm` | `Cota` | `Fornada` |
| `tenantDefaults.roleDefaults` | `['colmeia','coagricultor']` | `[]` |
> `pickupValue` foi **removido** do contrato (task 5): nenhuma regra usa o token de
> não-entrega — o engine só testa `isEntrega(u)` e grava o canônico `'retirada'`.
| `vocabulary.pickupLabel` | `Colmeia` | `Retirada` |

### 4.3 Ports & Adapters (DIP, já exigido no CLAUDE.md)
O motor depende de **interfaces**; cada app pluga **adapters** concretos e injeta a config.
Portas em `core/src/server`: `Repo`, `AuthGateway`, `WhatsAppGateway` (`repo.ts`) e
`MessageParser` (`parseMessage.ts`). Adapters: Firestore, Firebase Auth, Evolution API
(todos no app) e o parser — `fuzzy` mora no core (é puro), `openai` no app CSA (dep e chave lá).
O barrel `parseMessage/index.ts` **morreu no core**: a seleção vem de
`config.capabilities.messageParser` + injeção. O `whatsapp/index.ts` do app segue como está —
é escolha de infra do app, não do motor.

### 4.4 Reconciliação de comportamento no engine (feito na task 5)
- **Route factories** `createXRouter(deps, config)` para todas as rotas (base = fork: `tenant`/
  `tenantId`/`x-tenant-id`).
- `paymentService`/`ordersService` movidos ao core; fallbacks mágicos (`?? 40/65/10`, `?? 'CSA'`,
  `'Flor de Quilombo'`) vêm de `config.tenantDefaults`. `quotaJob`/`sendOrdersJob` ficaram no app
  (cron = infra) chamando os serviços do core.
- **`parseMessage` reintroduzido** como capacidade opcional (ativo sse
  `offeringSource='parse-message'`); dep `openai` só no app CSA. `from-catalog` do fork segue em
  paralelo — ambos chamam `upsertOffering`.
- **Acesso lista adotado na CSA**; predicados do core normalizam os rótulos legados, então a
  leitura é retrocompatível e a produção não precisou de migração de dados.

### 4.5 Migração única da produção CSA (task 6)
Script `migrate-csa-canonico.ts` (rodar **uma vez**, com backup + em cópia antes de prod):
`colmeias`→`tenants`; `colmeiaId`→`tenantId` em todos os docs; `deliveryType 'colmeia'`→`'retirada'`;
front CSA passa a mandar `x-tenant-id` / `/api/tenants`. Depois disso o motor não tem camada de
compatibilidade — só nomes canônicos.

---

## 5. O que falta

- **Task 6 — ui kit + apps finos + migração** (a única restante): ~~`config-csa.ts`~~ e
  ~~`core/ui`~~ (feitos); falta o script de migração canônica da CSA + validação em cópia; CSA
  adota o engine (incluindo o adapter `openai` do `MessageParser`); consertar o `deploy.sh` do
  fermentou (⚠️ acima) e deployar os dois apps independentemente.

### Questões em aberto (decidir na task 6)

1. ~~Migração da CSA: janela ou zero-downtime?~~ **Decidido: janela de manutenção** (decisão 4).
2. **Port-backs do `MERGE.md` §6** (setup robusto, correções de deploy que consertam bugs
   latentes da CSA): a task 5 os trouxe **de graça no engine** — a CSA os herda no momento em
   que adota as rotas do core (task 6), não antes. Resta conferir §6 item a item na adoção
   para ver se sobrou algo que não veio junto.

---

## 6. Como rodar e testar

```bash
cd ~/repos/pedidos
npm install                                  # workspaces
npm run build -w @pedidos/core               # gera dist do motor (necessário p/ os apps)
npm run test:tz --workspaces --if-present    # todos os workspaces × BR/UTC/UTC+14
# por app:
npm run test:tz  -w pedidos-app              # (fermentou)
npm run build    -w pedidos-app              # front: tsc -b + vite
npm run build:backend -w pedidos-app         # server: tsc node16
```

Sem CI: **o verde local é o único portão**. `test:tz` cobre a regra de fuso (já quebrou 3×) e
**não pode ser pulado**.

---

## 7. Docs relacionados
- `pedidos-csa/ARQUITETURA_MOTOR_COMPARTILHADO.md` — plano original aprovado.
- `pedidos-app/MERGE.md` — mapa seção-a-seção das divergências fork×CSA (segue válido como
  referência; muda só a direção de deploy: de "único multi-tenant" para "apps separados").
- `pedidos-app/HANDOFF.md`, `PENDENCIAS.md`, `BUSINESS_RULES.md`.
