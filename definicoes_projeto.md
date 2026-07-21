# Definições do Projeto — pedidos-app

## Visão Geral

Motor multi-tenant de gestão de pedidos e entregas. Cada organização (tenant) tem catálogo próprio e estável → admin gera a oferta da semana a partir dele → clientes pedem extras → admin gera o consolidado e a lista de entrega.

Fork de `pedidos-csa`, com nomes generalizados (`colmeia`→`tenant`) visando remesclar o backend (ver `requirements.md`, "Herança da CSA"). Primeiro cliente: uma padaria.

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | React 19 + TypeScript, Vite 7, React Router v7 |
| Estilo | Tailwind CSS v3 + shadcn/ui |
| Ícones | lucide-react |
| Backend | Express.js + TypeScript (tsx watch) |
| Banco | Firebase Firestore (NoSQL) |
| Auth | Firebase Authentication (email/senha) |
| Testes | Vitest (ambiente `node`, sem DOM) |
| Env | dotenv |

## Comandos

```bash
npm run dev          # Frontend (http://localhost:5173)
npm run dev:server   # Backend (http://localhost:3004)
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

```
src/
├── App.tsx                    # Roteamento principal + ProtectedRoute
├── main.tsx
├── index.css
├── components/
│   ├── layout/
│   │   ├── Header.tsx
│   │   ├── Layout.tsx         # Wrapper para páginas autenticadas
│   │   ├── Sidebar.tsx
│   │   └── BottomNav.tsx      # Navegação mobile
│   ├── PageHeader.tsx         # Cabeçalho único de todas as telas (ver "Padrões de Design")
│   ├── EstadoLista.tsx        # Estados carregando/vazio de lista
│   ├── WeekNavigator.tsx      # Navegação semanal (slot dateNav do PageHeader)
│   ├── MonthNavigator.tsx     # Navegação mensal (slot dateNav do PageHeader)
│   ├── ReportarProblema.tsx
│   └── ui/                    # Componentes shadcn/ui
├── contexts/
│   └── AuthContext.tsx        # Auth state + seleção de tenant
├── hooks/
│   └── useAuth.ts
├── lib/
│   ├── utils.ts               # cn() para classnames
│   ├── statusPagamento.ts     # statusLabel/statusVariant da fatura (+ .test.ts)
│   ├── weekUtils.ts           # Semanas, entregas e ciclo quinzenal (ver "Datas e fusos")
│   └── weekUtils.test.ts
├── pages/
│   ├── LoginPage.tsx
│   ├── DefinirSenhaPage.tsx
│   ├── PedidosPage.tsx        # Membro: pedido da semana
│   ├── PerfilPage.tsx
│   ├── PagamentosPage.tsx     # Membro: faturas do mês
│   ├── CatalogoPage.tsx       # Admin: catálogo de produtos
│   ├── OfertasPage.tsx        # Admin: oferta da semana (gerada do catálogo)
│   ├── EntregasPage.tsx       # Admin: lista de entrega da semana
│   ├── ConsolidadoGeralPage.tsx # Admin: todos os membros da semana + texto WhatsApp
│   ├── VerificarPagamentosPage.tsx
│   └── AdminPage.tsx
├── services/
│   ├── firebase.ts            # Init Firebase client
│   └── api.ts                 # HTTP client tipado (Bearer token automático)
└── types/
    └── index.ts               # Todas as interfaces TS

server/
├── index.ts                   # Setup Express + rotas
├── middleware/
│   ├── auth.ts                # Verifica Firebase ID token
│   └── tenant.ts              # Injeta req.tenantId
├── routes/
│   ├── tenants.ts
│   ├── users.ts
│   ├── products.ts
│   ├── producers.ts
│   ├── offerings.ts           # Oferta da semana: upsert + geração a partir do catálogo
│   └── orders.ts
├── repositories/
│   └── firestore.ts           # Abstração Firestore
└── services/
    ├── paymentService.ts      # Faturas, cotas e contagem de semanas de entrega
    ├── weekMath.ts            # Espelho puro de weekUtils p/ o backend (ver "Datas e fusos")
    └── weekMath.test.ts       # Trava a sincronia weekMath x weekUtils
```

## Modelos de Dados

```typescript
interface Tenant {
  id: string
  name: string
  adminId: string          // uid Firebase do admin
  dateCreated: string      // ISO 8601
}

interface User {
  id: string               // uid Firebase
  name: string
  email: string
  address: string
  contact: string
  frequency: 'semanal' | 'quinzenal'
  deliveryType: 'retirada' | 'entrega'
  tenantId: string
  acesso: Acesso[]         // ('superadmin'|'admin'|'consumidor'|'fornecedor')[] — múltiplas; ver BUSINESS_RULES
  producerId?: string      // se fornecedor: entidade fornecedor (catálogo) que ele representa
}

interface Producer {
  id: string
  name: string
  contact: string
  tenantId: string
}

interface Product {
  id: string
  name: string
  unit: string
  price: number
  producerId: string
  tenantId: string
  dateUpdated: string
  type?: 'fixo' | 'extra'   // ausente = extra
  ativo?: boolean           // ausente = ativo; false = fora de linha
}

interface OfferingItem {
  productId: string
  productName: string
  unit: string
  price: number
  type: 'fixo' | 'extra'
}

interface WeeklyOffering {
  id: string
  producerId: string
  producerName: string
  tenantId: string
  items: OfferingItem[]
  weekStart: string        // ISO 8601, início da semana (segunda)
  dateCreated: string
}

interface OrderItem {
  productId: string
  productName: string
  unit: string
  price: number
  qty: number
}

interface Order {
  id: string
  userId: string
  userName: string
  tenantId: string
  weekId: string           // ID da WeeklyOffering
  items: OrderItem[]
  status: 'rascunho' | 'enviado'
  dateCreated: string
  dateUpdated: string
}

interface Payment {
  id: string
  userId: string
  userName: string
  tenantId: string
  month: string            // "YYYY-MM"
  proofUrl?: string        // URL do comprovante no Firebase Storage
  verified: boolean
  amount: number
}

interface OfferingDraftItem {
  name: string
  unit: string
  price: number
  type: 'fixo' | 'extra'
  matchedProductId?: string  // Ausente = item novo, criado ao salvar a oferta
}
```

## Coleções Firestore

| Coleção | ID do Doc | Campos principais |
|---|---|---|
| `tenants` | auto | name, adminId, dateCreated |
| `users` | uid Firebase | name, email, role, tenantId, frequency, deliveryType |
| `products` | auto | name, unit, price, producerId, tenantId, dateUpdated, type, ativo |
| `producers` | auto | name, contact, tenantId |
| `weekly_offerings` | auto | producerId, tenantId, items[], weekStart |
| `orders` | auto | userId, tenantId, weekId, items[], status |

## Endpoints da API

Base URL: `/api` (proxy para `http://localhost:3004` em dev)

Todos protegidos por `Authorization: Bearer {idToken}` exceto `/api/setup`.

### Setup
| Método | Rota | Descrição |
|---|---|---|
| POST | `/api/setup` | Cria organização inicial (sem auth) |

### Tenants (Organizações)
| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/tenants` | Lista (filtrado por role) |
| GET | `/api/tenants/:id` | Detalhes |
| POST | `/api/tenants` | Cria nova |

### Usuários
| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/users/me` | Perfil do usuário atual |
| PUT | `/api/users/me` | Atualiza perfil |
| GET | `/api/users?tenantId=` | Lista usuários da organização (admin) |
| POST | `/api/users` | Cria usuário |
| PUT | `/api/users/reorder-delivery` | Persiste a ordem da lista de entrega (lista completa de ids → `deliveryOrder`). Registrada antes de `/:uid`. |
| PUT | `/api/users/:uid` | Atualiza usuário (admin) |

### Produtos
| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/products?tenantId=` | Lista catálogo |
| POST | `/api/products` | Cria produto |
| POST | `/api/products/import-batch` | Importa catálogo via CSV (lote) |
| PUT | `/api/products/:id` | Atualiza produto |
| DELETE | `/api/products/:id` | Remove produto |

### Produtores
| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/producers?tenantId=` | Lista produtores |
| POST | `/api/producers` | Cria produtor |
| PUT | `/api/producers/:id` | Atualiza produtor |
| DELETE | `/api/producers/:id` | Remove produtor |

### Ofertas Semanais
| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/offerings?weekId=&tenantId=` | Lista ofertas da semana |
| POST | `/api/offerings` | Cria oferta |
| PUT | `/api/offerings/:id` | Atualiza oferta |
| POST | `/api/offerings/from-catalog` | Gera/republica a oferta da semana a partir do catálogo ativo |
| POST | `/api/offerings/fallback` | Copia a oferta da semana anterior |

### Pedidos
| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/orders/my?weekId=&tenantId=` | Pedido do usuário atual para a semana |
| POST | `/api/orders` | Cria pedido |
| PUT | `/api/orders/:id` | Atualiza pedido |
| GET | `/api/orders/consolidated?weekId=&tenantId=` | Pedidos consolidados (admin) |

## Auth Flow

1. Login via `signInWithEmailAndPassword(auth, email, password)`
2. Firebase retorna `user` com `getIdToken()` disponível
3. `AuthContext` carrega perfil via `/api/users/me` e lista de tenants
4. Seleção de tenant salva em `localStorage` com chave `tenant_{uid}`
5. Todas as chamadas à API incluem `Authorization: Bearer {idToken}`
6. Header `x-tenant-id` transmite contexto de tenant para o backend
7. Middleware `auth.ts` verifica token via Firebase Admin SDK
8. Middleware `tenant.ts` injeta `req.tenantId`

## Datas e fusos

Área que já gerou três bugs (#43, #48 e um anterior em `getWeekStart`). Regras:

**Nunca** faça `new Date('YYYY-MM-DD')` e leia com getter local. A string resolve para
meia-noite **UTC**; lida com `getFullYear()/getMonth()/getDate()` em fuso negativo (BR) ela
recua um dia. Foi o #43: a semana saía off-by-one e invertia a paridade de todo quinzenal.
Parseie os componentes na mão, ou ancore em `T12:00:00` como fazem `shiftWeek`/`getWeekDelivery`.

**Nunca** derive o ciclo quinzenal do número da semana ISO. A numeração reseta todo ano e em
ano de 53 semanas (2026, 2032...) a paridade repete na virada. Foi o #48. O ciclo vem de um
contador contínuo a partir de âncora fixa — ver `getWeekIndex` e `BUSINESS_RULES.md`.

**Regra duplicada entre client e server**: `src/lib/weekUtils.ts` e `server/services/weekMath.ts`
implementam o mesmo cálculo porque o `rootDir` do tsconfig do server impede importar de `src/`.
Mudar um exige mudar o outro — `server/services/weekMath.test.ts` compara os dois semana a
semana e reprova a divergência. Client e server discordarem foi a causa do #43. A unificação
sai no #18.

Os testes rodam em fuso BR por padrão porque é o dos usuários; `npm run test:tz` roda também
em UTC (o container de produção) e Kiritimati (UTC+14) para travar independência de fuso.

## Padrões de Design

**Multi-tenancy**: Todo dado tem `tenantId`. Queries sempre filtram por tenant. Superadmin vê todas; admin e user veem apenas a própria.

**Cabeçalho de tela via `PageHeader`**: toda tela com header monta o topo pelo `PageHeader`, nunca com JSX solto. Os slots são nomeados (`title`, `titleExtra`, `subtitle`, `secondaryAction`, `primaryAction`, `dateNav`) e a ordem à direita é fixa: `secondaryAction → primaryAction → dateNav`. Quem usa preenche o slot certo e não escolhe a ordem, então as telas não divergem entre si por construção. A ordem é travada por `PageHeader.test.tsx` — mexer nela quebra o teste. Ordem vertical abaixo do header: `PageHeader → Abas (só AdminPage) → Filtragem → Conteúdo`.

Layout responsivo do `PageHeader`: no **desktop** é uma linha horizontal (título à esquerda, ações+navegador à direita). No **mobile** empilha (título → ações → navegador) e o `dateNav` vira uma barra `sticky top-0` de largura total, colada ao conteúdo — resolve o deslocamento que dependia do tamanho do título/subtítulo. O truque é `display:contents` (`contents sm:flex`) no mobile: dissolve as caixas do header para o pai do navegador virar a raiz da página (alta) em vez do header (curto) — `sticky` só gruda enquanto o pai está visível. **Não remover o `contents`** sem entender isso, ou o navegador solta no início da rolagem. `WeekNavigator`/`MonthNavigator` usam `w-full`/`flex-1` no mobile para preencher a barra.

**`EstadoLista` para carregando/vazio**: `loading` vence `vazio` (anunciar "nenhum resultado" antes dos dados chegarem é mentira). **Só serve para empty-state em `Card`** — telas cujo vazio vive em `<TableRow>` (CatalogoPage, AdminPage) mantêm a guarda `if (loading) return` manual e não usam o componente.

**Oferta a partir do catálogo**: a própria organização é a fornecedora, então não há mensagem para
interpretar. `POST /api/offerings/from-catalog` monta a oferta com os produtos `ativo !== false`
de cada produtor e faz upsert via `upsertOffering` — a mesma função do `POST /`, então
publicar do catálogo e publicar do formulário têm exatamente a mesma semântica (substitui a
oferta da semana, remove dos pedidos os itens que saíram, reabre os extras). O admin pode
ajustar os itens no dialog antes de salvar.

**Fornecedores continuam múltiplos**: a oferta é publicada por fornecedor. A organização é um
fornecedor; parcerias com outras produções entram como fornecedores adicionais.

**Lógica testável fora do IO**: cálculo puro não fica em módulo que importa Firestore, senão
não dá para testar sem subir o firebase-admin. Ex.: `server/services/weekMath.ts` foi extraído
do `paymentService.ts` por isso.

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
PORT=3004
```
