> **Revisado em 2026-09-21.** Estrutura, modelos, coleções e rotas descrevem o app **hoje**
> (monorepo, dados canônicos `tenantId`/`tenants`, rotas servidas pelo engine
> `@pedidos/core/server`). O que este doc cobre é a **CSA**; para o motor compartilhado e o
> estado operacional, [`../../ARQUITETURA.md`](../../ARQUITETURA.md) e
> [`../../HANDOFF.md`](../../HANDOFF.md) continuam sendo a fonte da verdade.
# Definições do Projeto — pedidos-csa

## Visão Geral

App web para gestão de pedidos de uma CSA (Comunidade que Sustenta a Agricultura). Produtores enviam mensagens de WhatsApp com produtos disponíveis → admin faz parsing → usuários fazem pedidos semanais → admin gera consolidado para enviar ao produtor.

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | React 19 + TypeScript, Vite 7, React Router v7 |
| Estilo | Tailwind CSS v3 + shadcn/ui |
| Ícones | lucide-react |
| Backend | Express.js + TypeScript (tsx watch) |
| Banco | Firebase Firestore (NoSQL) |
| Auth | Firebase Authentication (email/senha) |
| Parsing | fuzzy do core (ativo) / OpenAI GPT-4o-mini (adapter do app, inativo) |
| Testes | Vitest (`node` para lógica, `jsdom` + Testing Library para tela) |
| Env | dotenv |

## Comandos

```bash
npm run build -w @pedidos/core   # SEMPRE antes: o app consome o dist/ do motor
npm run dev          # Frontend (http://localhost:5173)
npm run dev:server   # Backend (http://localhost:3001)
npm run dev:all      # Ambos simultaneamente
npm run build        # tsc -b + vite build
npm run build:backend # tsc -p server/tsconfig.json
npm run lint         # ESLint
npm test             # Vitest (fuso America/Sao_Paulo)
npm run test:watch   # Vitest em watch
npm run test:tz      # Suíte em 3 fusos (BR/UTC/Kiritimati) — ver "Datas e fusos"
```

Testes ficam ao lado do código (`*.test.ts` para lógica, `*.test.tsx` para componente). O
ambiente padrão é `node`; teste de componente declara `// @vitest-environment jsdom` na
primeira linha e usa Testing Library (`render`/`screen`). Não há CI: **o verde local é o
único portão antes de produção**, e o deploy é manual via `deploy.sh` (ver README) — merge
em `main` não sobe nada.

## Estrutura de Pastas

Componentes e regras compartilhados com o fermentou vivem em `packages/core`
(`@pedidos/core`, `@pedidos/core/ui`, `@pedidos/core/server`) — aqui fica só o que é da CSA.

```
src/
├── App.tsx                    # Roteamento + ProtectedRoute
├── config.ts                  # AppConfig da CSA (capabilities, vocabulário, defaults)
├── components/
│   ├── layout/                # Header, Layout, Sidebar, BottomNav
│   └── ReportarProblema.tsx   # Depende do contexto do app; por isso não está no core
├── contexts/AuthContext.tsx   # Auth state + seleção de colmeia (tenant)
├── hooks/                     # useAuth, useUploadProof
├── lib/                       # utils (cn), quota
├── pages/                     # Login, DefinirSenha, Pedidos, Perfil, Pagamentos, Acolhida,
│                              # Catalogo, Ofertas, Entregas, ConsolidadoGeral,
│                              # VerificarPagamentos, Admin
├── services/                  # firebase (client), api (HTTP tipado, Bearer + x-tenant-id)
└── types/index.ts             # Interfaces do app (fonte da verdade dos modelos)

server/
├── index.ts                   # Boot: monta os routers do core com os adapters daqui
├── env.ts                     # Carrega .env.production e falha dizendo o que faltou
├── adapters.ts                # Liga as portas do engine às implementações do app
├── middleware/auth.ts         # Verifica Firebase ID token
├── repositories/firestore.ts  # Porta Repo → Firestore
├── jobs/                      # quotaJob, sendOrdersJob (cron é infra do app)
└── services/
    ├── payments.ts, orders.ts # Serviços do app injetados nas rotas do core
    ├── whatsapp/              # Evolution API (envio e login por WhatsApp)
    └── parseMessage/openai.ts # Adapter alternativo; o parser fuzzy vive no core
```

## Modelos de Dados

As interfaces vivem em [`src/types/index.ts`](src/types/index.ts) — **é lá que se olha**, não
aqui (duplicar campo em doc só cria divergência). O que importa saber:

- O tenant é `tenantId` em **todo** documento, e a coleção é `tenants`. O `colmeiaId` do modelo
  antigo foi apagado da produção em 2026-08-31 e **não existe mais** — "colmeia" segue como
  vocabulário de tela na CSA, nunca como campo.
- `acesso` (não `role`) é o nível de acesso: `superadmin` | `admin` | `produtor` | `user`.
  `role` é a **função no coletivo** (texto livre configurável por colmeia).
- `deliveryType` é `'entrega' | 'retirada'`. O motor só pergunta `isEntrega(u)`; o token de
  não-entrega é vocabulário de UI (`colmeia` no legado) e nunca decide regra.
- `weekId`/`weekStart`: data ISO da segunda-feira da semana (ver "Datas e fusos").

## Coleções Firestore

| Coleção | ID do Doc | Campos principais |
|---|---|---|
| `tenants` | auto | name, adminId, quotaInteira, quotaMeia, freteDelivery, dueDay, orderSendDay, orderSendHour, weekChangeDay, extrasAberto |
| `users` | uid Firebase | name, email, contact, address, acesso, role, tenantId, frequency, deliveryType, quota, quotaQty, acolhidaExpiry |
| `products` | auto | name, unit, price, producerId, tenantId, dateUpdated |
| `producers` | auto | name, contact, pixKey, tenantId |
| `weekly_offerings` | auto | producerId, producerName, tenantId, items[], weekStart, rawMessage |
| `orders` | auto | userId, userName, tenantId, weekId, items[], status, doacao, recebido, suspensa |
| `payments` | auto | userId, tenantId, month, producerName, amount, proofs[], verified, dueDate |
| `acolhida_weeks` | auto | userId, tenantId, weekId, confirmado |
| `tenant_roles` | auto | name, tenantId |

## Endpoints da API

Base `/api` (proxy para `http://localhost:3001` em dev). Todas exigem
`Authorization: Bearer {idToken}`; o tenant vai no header `x-tenant-id` (e em `?tenantId=` nas
listagens). **Quem monta é o app, mas os routers são do engine**
(`packages/core/src/server/routes/`) — a lista abaixo é o que `server/index.ts` monta hoje.

| Prefixo | Rotas |
|---|---|
| `/api/tenants` | `GET /`, `GET /:id`, `POST /`, `PUT /:id` |
| `/api/users` | `GET /me`, `PUT /me`, `GET /`, `POST /`, `POST /create-member`, `POST /create-member-batch`, `PUT /reorder-delivery`, `PUT /rename-quota`, `PUT /:uid`, `POST /:uid/reset-password`, `DELETE /:uid` |
| `/api/products` | `GET /`, `POST /`, `POST /import-batch`, `PUT /:id`, `DELETE /:id` |
| `/api/producers` | `GET /`, `POST /`, `PUT /:id`, `DELETE /:id` |
| `/api/offerings` | `GET /`, `POST /parse`, `POST /fallback`, `POST /`, `PUT /:id` |
| `/api/orders` | `GET /my`, `GET /consolidated`, `GET /consolidated-text`, `GET /week-lock`, `GET /history`, `GET /monthly`, `POST /send-consolidated-whatsapp`, `POST /`, `PUT /:id` |
| `/api/payments` | `GET /my`, `GET /`, `POST /quota`, `POST /quota/all`, `POST /frete`, `POST /frete/all`, `POST /:id/comprovante`, `PUT /:id` |
| `/api/acolhida` | `GET /:weekId`, `GET /:weekId/todos`, `POST /` |
| `/api/roles` | `GET /`, `POST /`, `DELETE /:id` |
| `/api/issues` | `POST /` (abre issue no GitHub a partir do "Reportar problema") |
| `/api/auth/whatsapp` | Login por WhatsApp — **antes** do middleware de auth |
| `/api/whatsapp/webhook` | Webhook da Evolution — **antes** do middleware de auth |

`POST /api/offerings/from-catalog` existe no engine, mas **não na CSA**: é da capacidade
`offeringSource='from-catalog'` (o fermentou). A CSA usa `parse-message`.

## Auth Flow

1. Login via `signInWithEmailAndPassword(auth, email, password)`
2. Firebase retorna `user` com `getIdToken()` disponível
3. `AuthContext` carrega perfil via `/api/users/me` e a lista de tenants
4. Seleção de colmeia salva em `localStorage` com chave `colmeia_{uid}`
5. Todas as chamadas à API incluem `Authorization: Bearer {idToken}`
6. Header `x-tenant-id` transmite o contexto de tenant para o backend
7. Middleware `auth.ts` (do app) verifica o token via Firebase Admin SDK
8. Middleware de tenant (do core) injeta `req.tenantId`
9. **Autorização é do servidor**: rota que muda dado, ou lê dado de terceiro, carrega o `Ator`
   e checa (`packages/core/src/server/auth.ts`). O tenant vem do **recurso**, nunca do header

## Datas e fusos

Área que já gerou três bugs (#43, #48 e um anterior em `getWeekStart`). Regras:

**Nunca** faça `new Date('YYYY-MM-DD')` e leia com getter local. A string resolve para
meia-noite **UTC**; lida com `getFullYear()/getMonth()/getDate()` em fuso negativo (BR) ela
recua um dia. Foi o #43: a semana saía off-by-one e invertia a paridade de todo quinzenal.
Parseie os componentes na mão, ou ancore em `T12:00:00` como fazem `shiftWeek`/`getWeekDelivery`.

**Nunca** derive o ciclo quinzenal do número da semana ISO. A numeração reseta todo ano e em
ano de 53 semanas (2026, 2032...) a paridade repete na virada. Foi o #48. O ciclo vem de um
contador contínuo a partir de âncora fixa — ver `getWeekIndex` e `BUSINESS_RULES.md`.

~~**Regra duplicada entre client e server**~~ — **resolvido**. A duplicação
`src/lib/weekUtils.ts` × `server/services/weekMath.ts` (causa do #43) acabou com o monorepo:
os dois lados importam `packages/core/src/domain/week.ts`, e nenhum dos dois arquivos existe
mais. Regra com hora do dia recebe o **fuso do tenant** (`relogioDoTenant`/`semanaDoTenant`),
nunca getter local do processo — o servidor roda em UTC.

Os testes rodam em fuso BR por padrão porque é o dos usuários; `npm run test:tz` roda também
em UTC (o container de produção) e Kiritimati (UTC+14) para travar independência de fuso.

## Padrões de Design

**Multi-tenancy**: todo dado tem `tenantId` e as queries sempre filtram por ele. Superadmin vê todos; admin e user, só o próprio. O tenant do recurso é que manda — header não autoriza nada.

**Cabeçalho de tela via `PageHeader`**: toda tela com header monta o topo pelo `PageHeader`, nunca com JSX solto. Os slots são nomeados (`title`, `titleExtra`, `subtitle`, `secondaryAction`, `primaryAction`, `dateNav`) e a ordem à direita é fixa: `secondaryAction → primaryAction → dateNav`. Quem usa preenche o slot certo e não escolhe a ordem, então as telas não divergem entre si por construção. A ordem é travada por `PageHeader.test.tsx` — mexer nela quebra o teste. Ordem vertical abaixo do header: `PageHeader → Abas (só AdminPage) → Filtragem → Conteúdo`.

Layout responsivo do `PageHeader`: no **desktop** é uma linha horizontal (título à esquerda, ações+navegador à direita). No **mobile** empilha (título → ações → navegador) e o `dateNav` vira uma barra `sticky top-0` de largura total, colada ao conteúdo — resolve o deslocamento que dependia do tamanho do título/subtítulo. O truque é `display:contents` (`contents sm:flex`) no mobile: dissolve as caixas do header para o pai do navegador virar a raiz da página (alta) em vez do header (curto) — `sticky` só gruda enquanto o pai está visível. **Não remover o `contents`** sem entender isso, ou o navegador solta no início da rolagem. `WeekNavigator`/`MonthNavigator` usam `w-full`/`flex-1` no mobile para preencher a barra.

**`EstadoLista` para carregando/vazio**: `loading` vence `vazio` (anunciar "nenhum resultado" antes dos dados chegarem é mentira). **Só serve para empty-state em `Card`** — telas cujo vazio vive em `<TableRow>` (CatalogoPage, AdminPage) mantêm a guarda `if (loading) return` manual e não usam o componente.

**Parsing Flow**: Admin cola mensagem WhatsApp → `POST /api/offerings/parse` → o parser fuzzy do core devolve `ParsedProduct[]` já casados com o catálogo do produtor → admin revisa (corrigir nome reconfere o vínculo; dá para adicionar item fora da mensagem) → salva como `WeeklyOffering`.

**Lógica testável fora do IO**: cálculo puro não fica em módulo que importa Firestore, senão
não dá para testar sem subir o firebase-admin. É o que levou o cálculo de semanas para
`packages/core/src/domain/week.ts`, fora do serviço de pagamentos.

**Abstração Firestore** (`server/repositories/firestore.ts`):
```typescript
getDoc<T>(collection, id)
listDocs<T>(collection, filters)
createDoc<T>(collection, data)
updateDoc<T>(collection, id, data)
deleteDoc(collection, id)
```

## Variáveis de Ambiente

```bash
# Frontend (prefixo VITE_ = expostas no browser)
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=

# Backend (apenas servidor)
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=   # \n precisa ser substituído por newlines reais
PORT=3001
HOST=127.0.0.1          # em produção fica atrás do nginx
APP_URL=                # base dos links enviados por WhatsApp
CRON_ENABLED=           # default: ligado só com NODE_ENV=production

# Opcionais — cada bloco desliga a funcionalidade se faltar
OPENAI_API_KEY=         # só com capabilities.messageParser='openai' (hoje inativo)
EVOLUTION_API_URL=      # WhatsApp (envio de consolidado e login por WhatsApp)
EVOLUTION_API_KEY=
EVOLUTION_INSTANCE_NAME=
GITHUB_OWNER=           # "Reportar problema" abre issue; sem os três, a rota fica fora
GITHUB_REPO=
GITHUB_TOKEN=
WHATSAPP_ISSUES_GROUP_JID=  # webhook: grupo que vira issue
WHATSAPP_ISSUES_PREFIX=
ZAP_WEBHOOK_SECRET=
```

O boot **falha dizendo o que faltou** (`server/env.ts`) — em produção o arquivo lido é
`.env.production`, e é esse nome que o `deploy.sh` copia para a VM.
