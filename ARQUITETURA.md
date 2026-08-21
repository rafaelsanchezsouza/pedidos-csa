# Pedidos — motor compartilhado, apps separados

Monorepo com um **motor único** (`packages/core`) consumido por **apps separados e
independentemente deployáveis** (`apps/csa`, `apps/fermentou`). As diferenças entre clientes
são **configuração**, não fork de código.

> Estado: **tasks 1–5 concluídas e verdes**; **task 6 quase concluída** — `core/ui`, conserto do
> `deploy.sh`, script de migração canônica **ensaiado sobre uma cópia da produção** e **a CSA já
> roda sobre o engine** (o `server/routes/` dos dois apps sumiu). Resta o **evento único**:
> migrar a produção na janela e deployar os dois apps. Branch
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

**Placar atual:** `@pedidos/core` **167 testes**, `apps/csa` **28**, `apps/fermentou` **9** — todos
× 3 fusos (BR/UTC/UTC+14). Builds front + backend dos dois apps verdes.
> Os números dos apps **caíram** de propósito na task 6: os testes de UI que eram cópia nos dois
> (PageHeader, EstadoLista) subiram para o core. Soma cresceu; a duplicação sumiu.

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
1. ~~`migrate-csa-canonico.ts` + validação em cópia~~ (feito; falta **rodar em produção** na
   janela — ver o roteiro da janela em §4.5).
2. ~~CSA adota o engine~~ (feito na 7ª fatia — o código já é canônico e **exige** o banco
   migrado; por isso migração e deploy são o mesmo evento).
3. Deployar os dois apps (o `deploy.sh` já foi consertado, mas **nunca rodou de verdade** —
   o primeiro deploy é o teste).
- ✅ **Deploy consertado** (5ª fatia da task 6) — estava quebrado **nos dois apps** desde a
  task 1 (a CSA tinha o mesmo defeito, ainda não notado): o `deploy.sh` mandava
  `package.json` + `package-lock.json` e rodava `npm ci` na VM, mas `"@pedidos/core": "*"` é
  um workspace e não resolve fora do monorepo.
  **Solução:** `npm pack` do core (o `files: ["dist"]` já limita o tarball ao artefato) →
  o tarball vai junto e um `package.deploy.json` gerado na hora aponta a dep para
  `file:./pedidos-core-0.1.0.tgz`; a VM roda `npm install --omit=dev` (não `ci`: o lock não
  cobre a substituição) e o `package-lock.json` obsoleto do app deixou de ser enviado —
  ele é resquício de quando cada app era repo próprio; no monorepo o lock válido é o da raiz.
  Pegadinha: **`npm pack <caminho>`**, não `npm --prefix … pack` — com `--prefix` ele empacota
  o app, não o core.
  *Verificado localmente sem tocar na VM:* etapas locais rodadas de ponta a ponta, install num
  diretório limpo fora do workspace (411 pacotes, ok) e `import()` do
  `dist-server/server/index.js` resolvendo **todos** os módulos — para só no
  `Service account object must contain a string "project_id"`, que é falta de credencial, não
  de módulo. **O deploy de verdade (scp/ssh/pm2) continua não testado** — exige a VM.
  Efeito colateral do mesmo achado: `npm run build -w @pedidos/core` agora faz `rm -rf dist`
  antes (o `tsc` não limpa o `outDir`, e testes de builds antigos estavam indo para o tarball),
  e o `tsconfig.ui.json` passou a excluir também `*.test.ts` (só excluía `.tsx`).
- ✅ **Script de migração canônica escrito e ensaiado** (6ª fatia da task 6) — em
  `apps/csa/scripts/`:
  - `migracao-canonico.ts` é a **lógica sobre uma porta `Store`** (listar/criar/atualizar), não
    um script acoplado ao Firestore. Por isso o **mesmo código** roda em memória (ensaio),
    no emulador e em produção — 11 testes com store de memória (`memoryStore.ts`).
  - `migrate-csa-canonico.ts` é a CLI com os adapters e as travas: **dry-run é o padrão**
    (só escreve com `--executar`), `--dump=<arquivo>` faz o ensaio em memória, e o alvo
    (memória / emulador / Firestore real + projeto) é **impresso antes de qualquer escrita**.
  - `dump-firestore.ts` (somente leitura) é o **backup exigido pela decisão 4** e a fonte do
    ensaio. O JSON tem dados pessoais: fica fora do repo.
  - **Idempotente e abortável:** roda a apuração inteira antes de escrever; se algum doc tiver
    `colmeiaId` e `tenantId` divergentes, **aborta sem escrever nada**. Segunda passada é no-op
    (travado por teste). `colmeias` **não é apagada** — fica como rollback; limpar é passo
    separado, depois da validação.
  - **Ensaio sobre cópia da produção (2026-08-20):** 458 docs renomeados
    (`orders` 43, `payments` 215, `producers` 2, `products` 99, `roles` 4, `users` 39,
    `week_locks` 14, `weekly_offerings` 42), 2 tenants criados com o mesmo id, 18
    `deliveryType 'colmeia'→'retirada'`, **zero órfãos e zero avisos**. Conferido por diff
    campo a campo: nenhum doc perdido, nenhum valor alterado fora do escopo.
  - **Escopo deliberado:** `weekly_offerings`, `week_locks` e `otp_codes` **não mudam de nome** —
    o engine já usa esses nomes; a única coleção renomeada é `colmeias`→`tenants`. E `acesso`
    **fica string na produção**: os predicados do core são dual-mode (task 3), então mexer nos
    dados seria risco sem ganho. O engine passa a **escrever** lista; a leitura aceita os dois.
  - `vite.config.ts` da CSA passou a incluir `scripts/**/*.test.ts` na suíte.
- ✅ **CSA adotou o engine** (7ª fatia da task 6) — o `server/routes/` da CSA **sumiu**; o boot
  virou o mesmo do fermentou: `adapters.ts` (Firebase Auth + Evolution API sob as portas),
  `repo` no `repositories/firestore.ts`, `services/{payments,orders}.ts` instanciando os
  serviços do core com `(repo, config)`, e as 9 rotas vindas das factories. `paymentService`,
  `ordersService`, `middleware/colmeia.ts` e o barrel `parseMessage/` foram **deletados**.
  - **Superfície idêntica:** os endpoints das rotas próprias e das do core batem 1:1 — o core é
    superset (traz `/from-catalog` e `/rename-quota`, que a CSA não usa). Nenhum endpoint da CSA
    ficou para trás.
  - **Front canônico no mesmo commit:** `colmeiaId`→`tenantId` (175 pontos), header
    `x-colmeia-id`→`x-tenant-id`, `/api/colmeias`→`/api/tenants`, tipos `Colmeia`/`ColmeiaRole`
    → `Tenant`/`TenantRole`, `colmeiasApi`→`tenantsApi`, e `deliveryType` passou a usar
    `DeliveryType`/`isEntrega` do core em vez de comparar com `'colmeia'`.
    *Front e backend são um commit só de propósito* — sobem juntos com a migração, na janela.
  - **A fronteira que NÃO se moveu:** vocabulário de tela. "Nova Colmeia", "Selecionar Colmeia"
    e o rótulo da não-entrega seguem `Colmeia` (via `vocabulary.pickupLabel`), assim como as
    variáveis locais das páginas. Canônico é o **modelo e o protocolo**; a tela é do app.
    Mesma razão pela qual `roleDefaults: ['colmeia', ...]` continua — ali `colmeia` é **função
    no coletivo**, não o token de entrega.
  - **`acesso` continua string no front da CSA**: o engine repassa o que o cliente manda, os
    predicados são dual-mode e a produção não muda de forma. Coerente com a decisão de não
    migrar esse campo.
  - `parseMessage`: a config diz `'fuzzy'`, que vem do core, então **nada é injetado no boot**.
    O `openai.ts` fica no app como adapter alternativo (dep e chave só aqui), apontando para as
    portas do core.
  - **Port-backs do `MERGE.md` §6 que entraram junto** (a CSA os herdou ao adotar o engine, como
    previsto): `/api/setup` robusto (exige `adminUid`+`tenantName`, cria o doc do admin, trava
    ao existir qualquer tenant) — **sem** fornecedor padrão, porque na CSA a oferta nasce da
    mensagem do produtor; e o `deploy.sh` com `NODE_ENV=production` explícito + `--update-env`
    (§6.3): sem isso o `env.ts` não carregava o `.env.production` e o pm2 reusava o ambiente da
    primeira subida.
  - **Emissão mudou igual à do fermentou:** `rootDir: '..'` no `server/tsconfig.json` para
    compilar `src/config.ts` junto → o entrypoint virou `dist-server/server/index.js`; `start`
    e `deploy.sh` atualizados.
  - *Verificado além do build:* backend subiu de verdade em porta local com credencial de
    mentira (RSA gerada na hora) — as 9 rotas respondem 401 (montadas, exigindo token), o OTP
    público responde 400 (valida corpo) e os dois jobs agendam. É o teste que pega rota não
    montada e factory que estoura no boot.
  - ⚠️ **A partir daqui a CSA exige o banco migrado.** O código não lê mais `colmeias`/
    `colmeiaId`; rodar contra a produção atual não acha nada. Migração e deploy são o mesmo
    evento (§4.5).

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
    ├── csa/                     # app CSA — consome o ENGINE inteiro (desde a task 6)
    │   ├── src/lib/             # SÓ o que é específico: quota.ts (formatQuota), utils.ts
    │   ├── scripts/             # migração canônica (lógica sobre porta Store) + dump/backup
    │   └── server/              # entrypoint fino: index.ts + adapters.ts, middleware/auth,
    │                            #   repositories/firestore, services/{whatsapp,parseMessage/
    │                            #   openai}, jobs/
    └── fermentou/               # app Fermentou — consome o ENGINE inteiro
        ├── src/config.ts        # AppConfig do app
        ├── src/lib/             # brand.ts, features.ts, utils.ts
        └── server/              # entrypoint fino: index.ts + adapters.ts, middleware/auth,
                                 #   repositories/firestore, services/whatsapp, jobs/
```

**Nenhum dos dois apps tem mais `server/routes/`** — tudo vem do engine. O que ainda vive nos
apps é adapter ou infra (auth Firebase, Firestore, whatsapp, cron) e as páginas com o
vocabulário de cada cliente. A última duplicação (as rotas `colmeia*` da CSA) morreu na 7ª fatia
da task 6.

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

**Por que os dados precisam mudar** (a pergunta volta sempre): não é "só trocar o engine". O
motor só conhece `tenants`/`tenantId` e **não tem camada de mapeamento** por decisão explícita
(decisão 2). Adotar o engine sem renomear os dados faz o app ler uma coleção `tenants` vazia —
os dados continuam lá, invisíveis. A alternativa seria ressuscitar a leitura dos dois nomes:
código que nasce para morrer, exatamente o que a decisão 2 recusou.

**Roteiro da janela** (script pronto e ensaiado; nada disso rodou em produção ainda):
```bash
cd apps/csa
FIREBASE_ENV=prod OUT=~/backup-csa-$(date +%F).json npx tsx scripts/dump-firestore.ts  # backup
FIREBASE_ENV=prod npx tsx scripts/migrate-csa-canonico.ts              # dry-run: confere o placar
FIREBASE_ENV=prod npx tsx scripts/migrate-csa-canonico.ts --executar   # a passada única
```
Front e backend sobem **no mesmo deploy** — o front só passa a mandar `x-tenant-id`/`/api/tenants`
depois da migração, e o backend antigo não entende os nomes novos. Rollback = reverter o deploy;
a coleção `colmeias` e o `colmeiaId` originais não são apagados pelo script (limpeza é passo
posterior, com o app já verde).

---

## 5. O que falta

- **Task 6 — ui kit + apps finos + migração** (a única restante): ~~`config-csa.ts`~~,
  ~~`core/ui`~~, ~~script de migração canônica + validação em cópia~~, ~~CSA adota o engine~~ e
  ~~consertar o `deploy.sh`~~ (feitos). Falta **um evento só**: na janela, rodar a migração
  (roteiro em §4.5) e deployar os dois apps — o `deploy.sh` nunca rodou de verdade, então o
  primeiro deploy é o teste dele. Sugestão de ordem: **fermentou primeiro** (não tem dados
  reais e não depende de migração), que valida o `deploy.sh` antes de a CSA depender dele.

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
