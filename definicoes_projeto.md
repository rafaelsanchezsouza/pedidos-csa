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
| Env | dotenv |

## Comandos

```bash
npm run dev          # Frontend (http://localhost:5173)
npm run dev:server   # Backend (http://localhost:3001)
npm run dev:all      # Ambos simultaneamente
npm run build        # tsc -b + vite build
npm run build:backend # tsc -p server/tsconfig.json
npm run lint         # ESLint
```

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
│   │   └── Sidebar.tsx
│   └── ui/                    # Componentes shadcn/ui
├── contexts/
│   └── AuthContext.tsx        # Auth state + seleção de colmeia
├── hooks/
│   └── useAuth.ts
├── lib/
│   └── utils.ts               # cn() para classnames
├── pages/
│   ├── LoginPage.tsx
│   ├── PedidosPage.tsx
│   ├── CatalogoPage.tsx       # Admin: catálogo de produtos
│   ├── OfertasPage.tsx        # Admin: ofertas semanais + parsing
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

## Padrões de Design

**Multi-tenancy**: Todo dado tem `colmeiaId`. Queries sempre filtram por colmeia. Superadmin vê todas; admin e user veem apenas a própria.

**Parsing Flow**: Admin cola mensagem WhatsApp → `POST /api/offerings/parse` → OpenAI retorna `ParsedProduct[]` → admin revisa → salva como `WeeklyOffering`.

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
