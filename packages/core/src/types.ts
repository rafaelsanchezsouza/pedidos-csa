// Modelo de domínio canônico (subconjunto mínimo consumido pelo cálculo puro).
// O modelo completo (Order, Offering, Producer, Tenant completo, acesso...) entra em types/
// na task de tipos. Nomes canônicos: tenant/tenantId, deliveryType 'retirada'|'entrega'.

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
