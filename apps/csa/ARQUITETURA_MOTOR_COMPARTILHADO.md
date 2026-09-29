# Arquitetura: motor compartilhado, apps separados (`pedidos-csa` + `pedidos-app`)

## Contexto

Hoje existem dois repos separados, sem remote comum e com históricos já divergidos
(`git cherry-pick` deixou de funcionar). `pedidos-csa` está em produção com dados reais;
`pedidos-app` (fork, cliente Fermentou) está no ar mas sem dados. O usuário faz mudanças num
que serviriam ao outro e não quer duplicar código — mas **quer manter as duas aplicações
separadas** (deploys, Firebase, vocabulário próprios), compartilhando um único **motor**,
com as diferenças expressas em **configuração**.

Achado que orienta tudo: o **fork já está arquiteturalmente à frente** — tem `brand.ts`,
`features.ts` (`MULTI_TENANT`), modelo de `acesso` como lista, cotas dinâmicas e a nomenclatura
genérica `tenant`. A CSA é o desenho antigo (single-tenant-por-deploy) com vocabulário CSA
hardcoded inline (`colmeia`/`coagricultor`, "Pedidos CSA", `Flor de Quilombo`). Logo o motor
compartilhado **nasce do fork** (já genérico) e a CSA vira um app configurado sobre ele.

Custo escondido mais caro hoje: a lógica de semana/quinzena está **duplicada 4×** (2 apps ×
client/server) e já quebrou 3× por fuso. Unificá-la é o maior ganho isolado.

Doc de referência já no fork: `pedidos-app/MERGE.md` (mapa seção-a-seção das divergências).

### Decisões tomadas (usuário, 2026-07-29)
1. **Monorepo + workspaces** — um repo, `packages/core` + `apps/csa` + `apps/fermentou`,
   deploys independentes.
2. **Migração única da produção da CSA** — o motor usa nomes canônicos (`tenantId`, coleção
   `tenants`, header `x-tenant-id`, `deliveryType: 'retirada'`); a CSA é migrada uma vez.
   **Sem** camada de mapeamento no motor.
3. **Extração completa do motor agora** — domínio + engine de servidor + UI kit, com `AppConfig`
   dos dois apps e `parseMessage` reintroduzido como capacidade opcional.

## Alvo de arquitetura

```
pedidos/                         # monorepo (npm workspaces)
  packages/
    core/
      domain/                    # cálculo puro: week, quota(tiers+fallback), frete,
                                 #   delivery, status, csv  — importável por client E server
      server/                    # engine Express: route factories, services, middleware,
                                 #   repositories (portas), jobs — parametrizado por AppConfig
      ui/                        # design-system kit (PageHeader, primitives Radix/tailwind)
      types/                     # tipos canônicos do domínio (Tenant, User, Order, Payment…)
      config/                    # tipo AppConfig + defaults + validação
  apps/
    csa/                         # frontend (páginas/vocabulário CSA) + entrypoint server
                                 #   + config-csa.ts + brand + .env + deploy
    fermentou/                   # idem, vocabulário padaria
```

- **Cada app permanece deployável sozinho** (pm2/nginx/porta/Firebase próprios) — monorepo
  ≠ deploy único. É exatamente "apps separados, motor único".
- **Fronteira**: `core` = tudo que é motor (domínio + engine + kit de UI). As **páginas** e o
  **vocabulário** ficam em cada app (fluxos divergem: colapso de fornecedor único, abas
  Clientes/Admins, cadastro por tipo etc. — `MERGE.md` já declara "frontends podem permanecer
  separados"). Páginas consomem hooks/componentes do `core` + `AppConfig`.
- Alinha com o DIP/Ports & Adapters já exigido no `CLAUDE.md`: domínio define portas; cada app
  pluga adapters concretos (Firebase, WhatsApp, parser) e injeta `AppConfig`.

## `AppConfig` — a "configuração" (coração da proposta)

Um objeto tipado por app, injetado no motor. Como a CSA será migrada para nomes canônicos,
**não há perfil de persistência** — a config carrega marca, vocabulário, capacidades e seeds:

```ts
interface AppConfig {
  brand: Brand                              // reusa packages/core/ui + o BRAND do fork
  vocabulary: {                             // dicionário PT que substitui strings hardcoded
    quotaTerm: string                       // "Cota" | "Fornada"
    pickupLabel: string                     // rótulo de deliveryType 'retirada'
    roleDefaults: string[]                  // CSA: ['colmeia','coagricultor'] | padaria: []
    otpAppName: string                      // usa brand.name (fim do "Pedidos CSA" hardcoded)
  }
  capabilities: {
    offeringSource: 'parse-message' | 'from-catalog'   // CSA=parse, Fermentou=catalog
    messageParser?: 'fuzzy' | 'openai'                 // só quando offeringSource='parse-message'
    multiTenant: boolean
    paymentStrategy: 'monthly-post' | 'per-order-pix'  // extensível p/ F3
  }
  tenantDefaults: {                          // seeds do POST /setup (fim do 'Flor de Quilombo'
    name; quotas; quotaTerm; roleDefaults;   //   e do '65/40/10' hardcoded)
    dueDay; orderSendDay; orderSendHour; weekChangeDay
  }
  integrations: {                            // lidas do .env de cada app
    firebase; whatsapp: { instance }; openai?  // openai só existe no app CSA
  }
}
```

Seams que já existem e viram config-driven em vez de troca-de-import:
`server/services/parseMessage/index.ts` e `server/services/whatsapp/index.ts` (barrels
"implementação ativa"). A seleção passa a vir de `AppConfig.capabilities`/`integrations`.

## Trabalho de reconciliação (extração completa)

### 1. Esqueleto do monorepo
- Novo repo `pedidos/` com `package.json` raiz (`workspaces: ["packages/*","apps/*"]`).
- Mover o fork como `apps/fermentou` e a CSA como `apps/csa` (preservar história via
  `git subtree`/import; históricos divergidos — reconciliação é um evento único, não rebase).
- `packages/core` como workspace independente: **resolve o `rootDir` que hoje impede o server
  importar de `src/`** (`server/tsconfig.json` `rootDir:'.'` é a causa-raiz da duplicação de
  `weekMath.ts` vs `weekUtils.ts`). `core` compila próprio e é importado por client e server.

### 2. `packages/core/domain` (puro, maior ganho, menor risco)
- Unificar as 4 cópias de semana → **uma** (`weekUtils.ts`+`weekMath.ts`+cópia inline em
  `sendOrdersJob.ts`). Preservar `ANCORA_QUINZENAL` e os testes; rodar `test:tz`.
- Trazer o `quotaMath.ts` **do fork** (tiers dinâmicos + fallback p/ par legado
  `quotaInteira/quotaMeia`) — já é retrocompatível; descartar o `quotaAmount` da CSA.
- Mover idênticos: `freteMath`, `statusPagamento`, `deliveryOrder`, `csv`. Mover os `*.test.ts`
  junto.

### 3. `packages/core/types` + modelo de `acesso`
- Tipos canônicos consolidando os `UserDoc` inline espalhados (`users.ts`, `paymentService.ts`).
- Adotar o `acesso` como **lista** do fork (`src/lib/acesso.ts` + `server/services/acesso.ts`);
  predicados já normalizam rótulos legados (`user`→`consumidor`, `produtor`→`fornecedor`).

### 4. `packages/core/server` (engine parametrizado)
- Route factories `createXRouter(deps, config)` para: users, orders, payments, offerings,
  products, producers, roles, tenants, issues, whatsappAuth. Base = versões **do fork**
  (já em `tenant`/`tenantId`/`x-tenant-id`).
- `paymentService`/`ordersService`/`quotaJob`/`sendOrdersJob` movidos; remover fallbacks mágicos
  (`?? 40/65/10`, `?? 'CSA'`) → vêm de `config.tenantDefaults`.
- **Reintroduzir `parseMessage`** (`fuzzy` + `openai` + tipos) como capacidade opcional; ativo
  só quando `config.capabilities.offeringSource==='parse-message'`. Reintroduzir dep `openai`
  no app CSA (não no core base). Manter `POST /offerings/from-catalog` do fork em paralelo —
  ambos chamam `upsertOffering` (`MERGE.md` §2.6/§2.7).
- Middleware `tenant.ts` do fork (header `x-tenant-id`) vira o middleware do core.
- Repositório Firestore (`server/repositories/firestore.ts`) vira porta injetada; coleções
  canônicas (`tenants`, …).

### 5. `packages/core/ui`
- Extrair `PageHeader` e primitives compartilhadas; `applyBrand()` + `Brand` (fork) para o kit.
- Páginas ficam nos apps.

### 6. Apps finos
- `apps/fermentou`: `config-fermentou.ts` (offeringSource='from-catalog', roleDefaults=[],
  quotaTerm='Fornada', multiTenant=false, brand Fermentou).
- `apps/csa`: `config-csa.ts` (offeringSource='parse-message', messageParser conforme hoje,
  roleDefaults=['colmeia','coagricultor'], quotaTerm='Cota', brand CSA, openai). Entrypoint
  server importa as factories do core e injeta a config.

### 7. Migração única da produção CSA (janela + backup)
Script `scripts/migrate-csa-canonico.ts` (rodar uma vez contra o Firestore de produção):
- coleção `colmeias` → `tenants`; campo `colmeiaId` → `tenantId` em **todos** os docs
  (`users`, `orders`, `payments`, `products`, `producers`, `weekly_offerings`, `roles`,
  `week_locks` — ver chaves de doc `{colmeiaId}_{weekId}`).
- `User.deliveryType 'colmeia'` → `'retirada'` (atenção: `paymentService`/`freteMath` ramificam
  nesse valor).
- frontend CSA passa a mandar header `x-tenant-id` e usar rota `/api/tenants`.
- **Backup do Firestore antes; validar num projeto de staging/cópia primeiro** (sem CI, o verde
  local + a cópia são o único portão).

## Arquivos-chave

Motor (base = fork): `pedidos-app/server/routes/{tenants,offerings,products,roles,users,orders,payments}.ts`,
`pedidos-app/server/middleware/tenant.ts`, `pedidos-app/server/services/{quotaMath,acesso,paymentService,ordersService}.ts`,
`pedidos-app/src/lib/{brand,features,acesso}.ts`, `*/src/lib/{weekUtils,freteMath,statusPagamento,deliveryOrder,csv}.ts`,
`*/server/services/weekMath.ts` + `server/jobs/{quotaJob,sendOrdersJob}.ts`.

Capacidade só-CSA a reintroduzir: `pedidos-csa/server/services/parseMessage/` (`fuzzy,openai,types,index`),
`pedidos-csa/server/routes/offerings.ts` (`POST /parse`).

Hardcodes CSA a virar config: `pedidos-csa/server/{index.ts (setup 'Flor de Quilombo'),
routes/roles.ts (DEFAULTS), routes/users.ts (senha 'Csa1!', URL, ?? 'CSA'), routes/whatsappAuth.ts
(OTP "Pedidos CSA"), services/ordersService.ts (?? 'CSA'), services/paymentService.ts (40/65/10,
sentinelas 'Cota'/'Entrega')}`.

Build a reestruturar: `tsconfig.json`, `server/tsconfig.json` (o `rootDir`), `vite.config.ts`,
`package.json` (workspaces + scripts por app).

## Verificação (ponta a ponta)
1. `npm test` na raiz do monorepo (todos os workspaces) + **`npm run test:tz`** (BR/UTC/UTC+14 —
   a regra de fuso; não pular).
2. `npm run build:all` em `apps/csa` e `apps/fermentou` (o verde local é o único portão — sem CI).
3. **Migração**: rodar `migrate-csa-canonico.ts` contra uma **cópia** do Firestore de produção;
   verificar contagem de docs por coleção e valores migrados; só então rodar em prod com backup.
4. Subir os dois apps localmente (`dev:all` de cada) e validar os fluxos que divergem: CSA →
   `parseMessage` gera oferta + fatura mensal; Fermentou → `from-catalog` + cotas dinâmicas.
5. Deploy independente de cada app (`deploy.sh` de cada) — confirmar que continuam em portas/pm2
   separados. Validar OTP usando o nome do tenant (fim do "Pedidos CSA").

## Perguntas não resolvidas
- Nome/local do monorepo: repo novo `pedidos/` ou promover um dos existentes a raiz?
- `apps/csa` mantém Firebase de dev separado ou aponta pro mesmo projeto (o fork hoje não tem
  `.env.development` — `HANDOFF.md`)?
- Migração da CSA: aceitável exigir janela de manutenção curta, ou precisa ser zero-downtime
  (aí voltaria a precisar da fase transitória lendo os dois nomes do `MERGE.md` §7.2)?
- `role`/`acesso`: migrar os users da CSA para a lista de `acesso` junto com a migração canônica,
  ou deixar os predicados normalizarem em runtime (sem migrar esse campo)?
- Port-backs do `MERGE.md` §6 que corrigem bugs latentes na CSA (setup robusto, deploy) — aplicar
  já como parte da extração ou tratar como consequência automática do motor único?
