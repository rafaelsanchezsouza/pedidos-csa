export interface Tenant {
  id: string
  name: string
  adminId: string
  dateCreated: string
  quotaInteira?: number
  quotaMeia?: number
  freteDelivery?: number  // frete padrão da tenant (por entrega); membro pode ter override
  dueDay?: number
  orderSendDay?: number   // 0-6 (0=Dom, 2=Ter), default 2
  orderSendHour?: number  // 0-23, default 6
  weekChangeDay?: number  // 0-6 (0=Dom), default 0
  extrasAberto?: boolean  // false = pedidos encerrados manualmente
}

export interface User {
  id: string
  name: string
  email: string
  address: string
  neighborhood?: string
  contact: string
  frequency: 'semanal' | 'quinzenal'
  deliveryType: 'retirada' | 'entrega'
  tenantId: string
  acesso: 'admin' | 'user' | 'superadmin' | 'produtor'
  role?: string
  isentoCotas?: boolean
  disabled?: boolean
  deleted?: boolean
  mustChangePassword?: boolean
  quinzenalParity?: 'par' | 'impar'
  quota?: 'Cota inteira' | 'Meia cota'
  acolhidaExpiry?: string
  deliveryOrder?: number // posição manual na lista de entrega (só deliveryType 'entrega'); ausente = não ordenado
  freteDelivery?: number // override do frete deste membro; ausente = usa o padrão da tenant
}

export interface TenantRole {
  id: string
  name: string
  tenantId: string
}

export interface Producer {
  id: string
  name: string
  contact: string
  tenantId: string
  pixKey?: string
}

export interface Product {
  id: string
  name: string
  unit: string
  price: number
  producerId: string
  tenantId: string
  dateUpdated: string
  /** Item do cardápio fixo (cobrado via cota) ou extra pedido avulso. Ausente = extra. */
  type?: 'fixo' | 'extra'
  /** Produto fora de linha some da oferta sem apagar o histórico. Ausente = ativo. */
  ativo?: boolean
}

export interface OfferingItem {
  productId: string
  productName: string
  unit: string
  price: number
  type: 'fixo' | 'extra'
}

export interface WeeklyOffering {
  id: string
  producerId: string
  producerName: string
  tenantId: string
  items: OfferingItem[]
  weekStart: string
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

export interface Order {
  id: string
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

export interface Payment {
  id: string
  userId: string
  userName: string
  tenantId: string
  month: string
  producerName: string
  proofUrl?: string
  verified: boolean
  amount: number
  dueDate?: string
  dateCreated: string
  dateUpdated: string
}

/** Item em edição no formulário de oferta, antes de virar `OfferingItem`. */
export interface OfferingDraftItem {
  name: string
  unit: string
  price: number
  type: 'fixo' | 'extra'
  /** Id do produto no catálogo; ausente = item novo, criado ao salvar a oferta. */
  matchedProductId?: string
}
