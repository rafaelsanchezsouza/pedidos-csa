import type { DeliveryType } from '@pedidos/core'

export interface Tenant {
  id: string
  name: string
  adminId: string
  dateCreated: string
  quotaInteira?: number
  quotaMeia?: number
  freteDelivery?: number  // frete padrão da colmeia (por entrega); membro pode ter override
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
  deliveryType: DeliveryType
  tenantId: string
  acesso: 'admin' | 'user' | 'superadmin' | 'produtor'
  role?: string
  isentoCotas?: boolean
  disabled?: boolean
  deleted?: boolean
  mustChangePassword?: boolean
  quinzenalParity?: 'par' | 'impar'
  quota?: 'Cota inteira' | 'Meia cota'
  quotaQty?: number // quantidade de cotas do tipo acima (padrão 1); ex: André = 2 inteiras, Luciano = 3 meias
  acolhidaExpiry?: string
  deliveryOrder?: number // posição manual na lista de entrega (só deliveryType 'entrega'); ausente = não ordenado
  freteDelivery?: number // override do frete deste membro; ausente = usa o padrão da colmeia
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
  rawMessage?: string
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
  /** Comprovantes por semana (acolhida). `proofUrl` segue com o último enviado. */
  proofs?: Array<{ weekId: string; url: string; dateUploaded: string }>
  verified: boolean
  amount: number
  dueDate?: string
  dateCreated: string
  dateUpdated: string
}

export interface ParsedProduct {
  name: string
  unit: string
  price: number
  type: 'fixo' | 'extra'
  matchedProductId?: string
}

/** Confirmação semanal de quem está em acolhida. */
export interface AcolhidaWeek {
  id: string
  userId: string
  tenantId: string
  weekId: string
  confirmado: boolean
  dateCreated: string
  dateUpdated: string
}

export interface AcolhidaSemana {
  confirmacao: AcolhidaWeek | null
  /** Instante-limite (ISO) para confirmar: segunda 23h59 no fuso do tenant. */
  prazo: string
  aberto: boolean
}
