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
| Parsing | fuzzy matching (ativo) / OpenAI GPT-4o-mini (alternativa) |
| Testes | Vitest (ambiente `node`, sem DOM) |
| Env | dotenv |

## Comandos

```bash
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
│   └── AuthContext.tsx        # Auth state + seleção de colmeia
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
│   ├── OfertasPage.tsx        # Admin: ofertas semanais + parsing
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
│   └── colmeia.ts             # Injeta req.colmeiaId
├── routes/
│   ├── colmeias.ts
│   ├── users.ts
│   ├── products.ts
│   ├── producers.ts
│   ├── offerings.ts           # Usa parseProducerMessage do serviço de domínio
│   └── orders.ts
├── repositories/
│   └── firestore.ts           # Abstração Firestore
└── services/
    ├── paymentService.ts      # Faturas, cotas e contagem de semanas de entrega
    ├── weekMath.ts            # Espelho puro de weekUtils p/ o backend (ver "Datas e fusos")
    ├── weekMath.test.ts       # Trava a sincronia weekMath x weekUtils
    └── parseMessage/          # Serviço de domínio: parsing de mensagens de produtor
        ├── index.ts           # Exporta implementação ativa (fuzzy)
        ├── types.ts           # MessageParser, ParsedProduct, ExistingProduct
        ├── fuzzy.ts           # Impl: regex + Levenshtein (ATIVA, sem deps externas)
        └── openai.ts          # Impl: GPT-4o-mini (alternativa)
```

## Modelos de Dados

```typescript
interface Colmeia {
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
  deliveryType: 'colmeia' | 'entrega'
  colmeiaId: string
  role: 'admin' | 'user' | 'superadmin' | 'produtor'
}

interface Producer {
  id: string
  name: string
  contact: string
  colmeiaId: string
}

interface Product {
  id: string
  name: string
  unit: string
  price: number
  producerId: string
  colmeiaId: string
  dateUpdated: string
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
  colmeiaId: string
  items: OfferingItem[]
  weekStart: string        // ISO 8601, início da semana (segunda)
  rawMessage?: string      // Mensagem original do WhatsApp
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
  colmeiaId: string
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
  colmeiaId: string
  month: string            // "YYYY-MM"
  proofUrl?: string        // URL do comprovante no Firebase Storage
  verified: boolean
  amount: number
}

interface ParsedProduct {
  name: string
  unit: string
  price: number
  type: 'fixo' | 'extra'
  matchedProductId?: string  // Preenchido se achou no catálogo
}
```

## Coleções Firestore

| Coleção | ID do Doc | Campos principais |
|---|---|---|
| `colmeias` | auto | name, adminId, dateCreated |
| `users` | uid Firebase | name, email, role, colmeiaId, frequency, deliveryType |
| `products` | auto | name, unit, price, producerId, colmeiaId, dateUpdated |
| `producers` | auto | name, contact, colmeiaId |
| `weekly_offerings` | auto | producerId, colmeiaId, items[], weekStart, rawMessage |
| `orders` | auto | userId, colmeiaId, weekId, items[], status |

## Endpoints da API

Base URL: `/api` (proxy para `http://localhost:3001` em dev)

Todos protegidos por `Authorization: Bearer {idToken}` exceto `/api/setup`.

### Setup
| Método | Rota | Descrição |
|---|---|---|
| POST | `/api/setup` | Cria colmeia inicial (sem auth) |

### Colmeias
| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/colmeias` | Lista (filtrado por role) |
| GET | `/api/colmeias/:id` | Detalhes |
| POST | `/api/colmeias` | Cria nova |

### Usuários
| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/users/me` | Perfil do usuário atual |
| PUT | `/api/users/me` | Atualiza perfil |
| GET | `/api/users?colmeiaId=` | Lista usuários da colmeia (admin) |
| POST | `/api/users` | Cria usuário |

### Produtos
| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/products?colmeiaId=` | Lista catálogo |
| POST | `/api/products` | Cria produto |
| PUT | `/api/products/:id` | Atualiza produto |
| DELETE | `/api/products/:id` | Remove produto |

### Produtores
| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/producers?colmeiaId=` | Lista produtores |
| POST | `/api/producers` | Cria produtor |
| PUT | `/api/producers/:id` | Atualiza produtor |
| DELETE | `/api/producers/:id` | Remove produtor |

### Ofertas Semanais
| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/offerings?weekId=&colmeiaId=` | Lista ofertas da semana |
| POST | `/api/offerings` | Cria oferta |
| PUT | `/api/offerings/:id` | Atualiza oferta |
| POST | `/api/offerings/parse` | Faz parsing de mensagem via OpenAI |

### Pedidos
| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/orders/my?weekId=&colmeiaId=` | Pedido do usuário atual para a semana |
| POST | `/api/orders` | Cria pedido |
| PUT | `/api/orders/:id` | Atualiza pedido |
| GET | `/api/orders/consolidated?weekId=&colmeiaId=` | Pedidos consolidados (admin) |

## Auth Flow

1. Login via `signInWithEmailAndPassword(auth, email, password)`
2. Firebase retorna `user` com `getIdToken()` disponível
3. `AuthContext` carrega perfil via `/api/users/me` e lista de colmeias
4. Seleção de colmeia salva em `localStorage` com chave `colmeia_{uid}`
5. Todas as chamadas à API incluem `Authorization: Bearer {idToken}`
6. Header `x-colmeia-id` transmite contexto de colmeia para o backend
7. Middleware `auth.ts` verifica token via Firebase Admin SDK
8. Middleware `colmeia.ts` injeta `req.colmeiaId`

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

**Multi-tenancy**: Todo dado tem `colmeiaId`. Queries sempre filtram por colmeia. Superadmin vê todas; admin e user veem apenas a própria.

**Cabeçalho de tela via `PageHeader`**: toda tela com header monta o topo pelo `PageHeader`, nunca com JSX solto. Os slots são nomeados (`title`, `titleExtra`, `subtitle`, `secondaryAction`, `primaryAction`, `dateNav`) e a ordem à direita é fixa: `secondaryAction → primaryAction → dateNav`. Quem usa preenche o slot certo e não escolhe a ordem, então as telas não divergem entre si por construção. A ordem é travada por `PageHeader.test.tsx` — mexer nela quebra o teste. Ordem vertical abaixo do header: `PageHeader → Abas (só AdminPage) → Filtragem → Conteúdo`.

**`EstadoLista` para carregando/vazio**: `loading` vence `vazio` (anunciar "nenhum resultado" antes dos dados chegarem é mentira). **Só serve para empty-state em `Card`** — telas cujo vazio vive em `<TableRow>` (CatalogoPage, AdminPage) mantêm a guarda `if (loading) return` manual e não usam o componente.

**Parsing Flow**: Admin cola mensagem WhatsApp → `POST /api/offerings/parse` → OpenAI retorna `ParsedProduct[]` → admin revisa → salva como `WeeklyOffering`.

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
OPENAI_API_KEY=
PORT=3001
```
