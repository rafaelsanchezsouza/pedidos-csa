export interface Colmeia {
  id: string
  name: string
  adminId: string
  dateCreated: string
}

export interface User {
  id: string
  name: string
  email: string
  address: string
  contact: string
  frequency: 'semanal' | 'quinzenal'
  deliveryType: 'colmeia' | 'entrega'
  colmeiaId: string
  role: 'admin' | 'user' | 'superadmin' | 'produtor'
  disabled?: boolean
  deleted?: boolean
}

export interface Producer {
  id: string
  name: string
  contact: string
  colmeiaId: string
  pixKey?: string
}

export interface Product {
  id: string
  name: string
  unit: string
  price: number
  producerId: string
  colmeiaId: string
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
  colmeiaId: string
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
  colmeiaId: string
  weekId: string
  items: OrderItem[]
  status: 'rascunho' | 'enviado'
  dateCreated: string
  dateUpdated: string
}

export interface Payment {
  id: string
  userId: string
  userName: string
  colmeiaId: string
  month: string
  producerName: string
  proofUrl?: string
  verified: boolean
  amount: number
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
