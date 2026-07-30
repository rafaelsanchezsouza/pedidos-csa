# Pedidos — motor compartilhado, apps separados

Monorepo com um **motor único** (`packages/core`) consumido por **apps separados e
independentemente deployáveis** (`apps/csa`, `apps/fermentou`). As diferenças entre clientes
são **configuração**, não fork de código.

> Estado: **tasks 1–4 concluídas e verdes**; tasks 5–6 pendentes. Branch
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

---

## 2. O que já foi feito (verificado)

| Task | Entrega | Verde |
|---|---|---|
| **1. Esqueleto** | monorepo (workspaces); `pedidos-csa`→`apps/csa` e `pedidos-app`→`apps/fermentou` via `git subtree` (história preservada) | — |
| **2. Domínio** | `packages/core/domain`: `week` (unifica as 4 cópias client/server num módulo com cross-check), `quota` (tiers do fork + `quotaAmount`/`quotaQty` da CSA #45), `frete`, `status`, `delivery`, `csv`. **Os dois apps consomem** via `@pedidos/core`; **28 arquivos duplicados removidos** | core 65, csa 25, fermentou 27 (× BR/UTC/UTC+14) + builds |
| **3. Acesso** | `packages/core/acesso.ts`: modelo de permissão como **lista** (predicados + `tipoDeAcesso`/`montarAcesso`), entrada **dual-mode** (aceita `User` ou campo cru), **normaliza rótulos legados** da CSA (`user`→`consumidor`, `produtor`→`fornecedor`) — leitura retrocompatível sem migração. Fermentou consome | core 82, fermentou 19 |
| **4. Config** | `packages/core/config.ts`: contrato **`AppConfig`** + `validateAppConfig`. `apps/fermentou/src/config.ts` tipada e validada | core 89, fermentou 22, build front |

**Placar atual:** `@pedidos/core` **89 testes**, `apps/csa` **25**, `apps/fermentou` **22** — todos
× 3 fusos (BR/UTC/UTC+14). Builds front + backend dos dois apps verdes.

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
│   └── core/                    # @pedidos/core — o MOTOR (por ora: domínio + acesso + config)
│       ├── package.json         # exports → dist; build = tsc NodeNext
│       ├── tsconfig.build.json  # emite dist (.js + .d.ts)
│       └── src/
│           ├── domain/          # week, quota, frete, status, delivery, csv (+ testes)
│           ├── acesso.ts        # modelo de permissão (lista) + predicados
│           ├── config.ts        # AppConfig + validateAppConfig
│           ├── types.ts         # tipos canônicos (mínimos por enquanto)
│           └── index.ts         # barrel
└── apps/
    ├── csa/                     # app CSA (consome o core no domínio)
    │   ├── src/lib/             # SÓ o que é específico: quota.ts (formatQuota), utils.ts
    │   └── server/              # routes/{colmeias,offerings,...}, services/{paymentService,
    │                            #   ordersService, parseMessage/, whatsapp/}
    └── fermentou/               # app Fermentou (consome domínio + acesso + config)
        ├── src/config.ts        # AppConfig do app
        ├── src/lib/             # brand.ts, features.ts, utils.ts
        └── server/              # routes/{tenants,offerings,...}, services/{paymentService,...}
```

Ainda **duplicado entre os apps** (alvo das tasks 5–6): `paymentService.ts`, `ordersService.ts`,
`server/routes/*`, `server/middleware`, `whatsapp/`, jobs. E **divergente por enquanto**:
`colmeias.ts`↔`tenants.ts`, `parseMessage/` (só CSA), tipos `User`/`Tenant`.

---

## 4. Arquitetura-alvo

### 4.1 Camadas
```
packages/core/
  domain/    cálculo puro (feito)               → week, quota, frete, status, delivery, csv
  acesso     permissão (feito)
  config     AppConfig (feito)
  types/     modelo canônico completo (task 5)  → Tenant, User, Order, Payment, Offering, Producer…
  server/    ENGINE parametrizado (task 5)      → route factories, services, middleware,
             repositories (portas), jobs — recebem (deps, config)
  ui/        design-system kit (task 6)         → PageHeader, primitives, applyBrand/Brand
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
                    dueDay; orderSendDay; orderSendHour; weekChangeDay; pickupValue }
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
| `pickupValue` | `retirada` (após migração) | `retirada` |
| `vocabulary.pickupLabel` | `Colmeia` | `Retirada` |

### 4.3 Ports & Adapters (DIP, já exigido no CLAUDE.md)
O motor depende de **interfaces**; cada app pluga **adapters** concretos e injeta a config:
- **Portas:** `WhatsAppGateway` (existe), `MessageParser` (existe), repositório Firestore.
- **Adapters:** Evolution API, fuzzy/OpenAI parser, Firestore.
- Os *barrels* `parseMessage/index.ts` e `whatsapp/index.ts` (hoje trocam implementação por
  edição de import) passam a **selecionar por `AppConfig.capabilities`/integrações**.

### 4.4 Reconciliação de comportamento no engine (task 5)
- **Route factories** `createXRouter(deps, config)` para todas as rotas (base = fork: `tenant`/
  `tenantId`/`x-tenant-id`).
- `paymentService`/`ordersService`/`quotaJob`/`sendOrdersJob` movidos ao core; fallbacks mágicos
  (`?? 40/65/10`, `?? 'CSA'`, `'Flor de Quilombo'`) passam a vir de `config.tenantDefaults`.
- **`parseMessage` reintroduzido** como capacidade opcional (ativo sse
  `offeringSource='parse-message'`); dep `openai` só no app CSA. `from-catalog` do fork segue em
  paralelo — ambos chamam `upsertOffering`.
- **Acesso lista adotado na CSA** (hoje checagens `acesso === 'admin'` inline); predicados do core
  normalizam, então a leitura é retrocompatível.

### 4.5 Migração única da produção CSA (task 6)
Script `migrate-csa-canonico.ts` (rodar **uma vez**, com backup + em cópia antes de prod):
`colmeias`→`tenants`; `colmeiaId`→`tenantId` em todos os docs; `deliveryType 'colmeia'`→`'retirada'`;
front CSA passa a mandar `x-tenant-id` / `/api/tenants`. Depois disso o motor não tem camada de
compatibilidade — só nomes canônicos.

---

## 5. O que falta

- **Task 5 — engine de servidor parametrizado** (a maior): mover routes/services/middleware/jobs
  ao `packages/core/server` como factories `(deps, config)`; `types/` canônico completo; boot do
  server injeta integrações do `.env`; reintroduz `parseMessage`; CSA adota acesso-lista.
  *Sugestão de fatiamento:* boot + injeção de config/integrações + **1 rota piloto** (`tenants`)
  verde ponta-a-ponta antes de mover o resto.
- **Task 6 — ui kit + apps finos + migração**: extrair `PageHeader`/primitives/`applyBrand` para
  `core/ui`; `config-csa.ts`; script de migração canônica da CSA; validar em cópia; deploy
  independente dos dois apps.

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
