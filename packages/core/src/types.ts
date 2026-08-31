// Modelo canônico do motor. Nomes canônicos: tenant/tenantId, deliveryType 'retirada'|'entrega'.
// Os *Doc são a forma ARMAZENADA (sem id — a porta Repo devolve WithId<T>); User/Payment no
// topo são as visões mínimas consumidas pelo cálculo puro do domínio.

export type Frequency = 'semanal' | 'quinzenal'
export type QuinzenalParity = 'par' | 'impar'
// Canônico. O legado 'colmeia' da CSA (até a migração) não entra no tipo: nenhuma regra lê o
// token de não-entrega — o motor só pergunta isEntrega(u).
export type DeliveryType = 'entrega' | 'retirada'

export interface QuotaTier {
  name: string
  price: number
}

export interface User {
  id: string
  name: string
  deliveryType?: DeliveryType
  deliveryOrder?: number
  frequency?: Frequency
  quinzenalParity?: QuinzenalParity
  quota?: string
  quotaQty?: number
  freteDelivery?: number
}

export interface Payment {
  verified?: boolean
  proofUrl?: string
}

// --- Docs canônicos (forma armazenada; escritas passam pelo engine) ---

export interface TenantDoc {
  name: string
  adminId: string
  dateCreated: string
  quotas?: QuotaTier[]
  quotaTerm?: string
  quotaInteira?: number
  quotaMeia?: number
  freteDelivery?: number
  dueDay?: number
  orderSendDay?: number
  orderSendHour?: number
  weekChangeDay?: number
  extrasAberto?: boolean
}

export interface UserDoc {
  name: string
  email: string
  address: string
  contact: string
  frequency: Frequency
  deliveryType: DeliveryType
  tenantId: string
  acesso: string[]
  producerId?: string
  role?: string
  isentoCotas?: boolean
  disabled?: boolean
  deleted?: boolean
  quota?: string
  quotaQty?: number // multiplicador de cota (CSA #45); ausente = 1
  quinzenalParity?: QuinzenalParity
  acolhidaExpiry?: string
  deliveryOrder?: number
  freteDelivery?: number
}

export interface ProducerDoc {
  name: string
  contact: string
  tenantId: string
  pixKey?: string
}

export interface ProductDoc {
  name: string
  unit: string
  price: number
  producerId: string
  tenantId: string
  dateUpdated: string
  type?: 'fixo' | 'extra'
  ativo?: boolean
}

export interface RoleDoc {
  name: string
  tenantId: string
}

export interface OfferingItem {
  productId: string
  productName: string
  unit: string
  price: number
  type: 'fixo' | 'extra'
}

export interface OfferingDoc {
  producerId: string
  producerName: string
  tenantId: string
  items: OfferingItem[]
  weekStart: string
  rawMessage?: string // só na capacidade parse-message (texto original do produtor)
  dateCreated: string
}

export interface OrderItem {
  productId: string
  productName: string
  unit: string
  price: number
  qty: number
  offeringId: string
  producerName: string
}

export interface OrderDoc {
  userId: string
  userName: string
  tenantId: string
  weekId: string
  items: OrderItem[]
  status: 'rascunho' | 'enviado'
  doacao?: boolean
  recebido?: boolean
  weeklyNote?: string
  weeklyAddress?: string
  suspensa?: boolean
  dateCreated: string
  dateUpdated: string
}

// Confirmação semanal de quem está em acolhida. Presença do doc = o membro respondeu;
// `confirmado` distingue "quero receber" de "não quero esta semana" — para o admin, não ter
// respondido e ter dito não são coisas diferentes.
//
// `deliveryType` é DA SEMANA, não do usuário: quem está experimentando escolhe a cada semana
// se retira ou recebe em casa, e é isso que decide a lista de entrega e o frete daquela semana.
export interface AcolhidaWeekDoc {
  userId: string
  tenantId: string
  weekId: string // segunda-feira da semana ('YYYY-MM-DD'), mesmo vocabulário dos pedidos
  confirmado: boolean
  deliveryType: DeliveryType
  dateCreated: string
  dateUpdated: string
}

export interface PaymentDoc {
  userId: string
  userName: string
  tenantId: string
  month: string
  producerName: string
  amount: number
  dueDate?: string
  proofUrl?: string
  verified: boolean
  dateCreated: string
  dateUpdated: string
}
