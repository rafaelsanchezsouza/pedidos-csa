import { auth } from './firebase'
import type { Tenant, Product, Producer, WeeklyOffering, Order, User, Payment, TenantRole } from '@/types'

const BASE_URL = '/api'

async function getToken(): Promise<string> {
  const user = auth.currentUser
  if (!user) throw new Error('Não autenticado')
  return user.getIdToken()
}

async function request<T>(path: string, options: RequestInit = {}, tenantId?: string): Promise<T> {
  const token = await getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }
  if (tenantId) headers['x-tenant-id'] = tenantId
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers as Record<string, string> | undefined) },
  })
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error((error as { message?: string }).message || 'Erro na requisição')
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const tenantsApi = {
  list: () => request<Tenant[]>('/tenants'),
  get: (id: string) => request<Tenant>(`/tenants/${id}`),
  create: (data: { name: string }) => request<Tenant>('/tenants', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Tenant>) =>
    request<Tenant>(`/tenants/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
}

export const productsApi = {
  list: (tenantId: string) => request<Product[]>(`/products?tenantId=${tenantId}`, {}, tenantId),
  create: (data: Omit<Product, 'id' | 'dateUpdated'>, tenantId: string) =>
    request<Product>('/products', { method: 'POST', body: JSON.stringify(data) }, tenantId),
  update: (id: string, data: Partial<Product>, tenantId: string) =>
    request<Product>(`/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }, tenantId),
  delete: (id: string, tenantId: string) =>
    request<void>(`/products/${id}`, { method: 'DELETE' }, tenantId),
  importBatch: (products: Array<Omit<Product, 'id' | 'dateUpdated'>>, tenantId: string) =>
    request<{ results: ProductBatchResult[] }>('/products/import-batch', { method: 'POST', body: JSON.stringify({ products }) }, tenantId),
}

export interface ProductBatchResult {
  name: string
  success: boolean
  error?: string
}

export const producersApi = {
  list: (tenantId: string) => request<Producer[]>(`/producers?tenantId=${tenantId}`, {}, tenantId),
  create: (data: Omit<Producer, 'id'>, tenantId: string) =>
    request<Producer>('/producers', { method: 'POST', body: JSON.stringify(data) }, tenantId),
  update: (id: string, data: Partial<Producer>, tenantId: string) =>
    request<Producer>(`/producers/${id}`, { method: 'PUT', body: JSON.stringify(data) }, tenantId),
  delete: (id: string, tenantId: string) =>
    request<void>(`/producers/${id}`, { method: 'DELETE' }, tenantId),
}

export const offeringsApi = {
  list: (weekId: string, tenantId: string) =>
    request<WeeklyOffering[]>(`/offerings?weekId=${weekId}&tenantId=${tenantId}`, {}, tenantId),
  create: (data: Omit<WeeklyOffering, 'id' | 'dateCreated'>, tenantId: string) =>
    request<WeeklyOffering>('/offerings', { method: 'POST', body: JSON.stringify(data) }, tenantId),
  update: (id: string, data: Partial<WeeklyOffering>, tenantId: string) =>
    request<WeeklyOffering>(`/offerings/${id}`, { method: 'PUT', body: JSON.stringify(data) }, tenantId),
  fromCatalog: (weekStart: string, tenantId: string, producerId?: string) =>
    request<WeeklyOffering[]>('/offerings/from-catalog', {
      method: 'POST',
      body: JSON.stringify({ weekStart, tenantId, producerId }),
    }, tenantId),
  fallback: (weekStart: string, tenantId: string, producerId?: string) =>
    request<WeeklyOffering[]>('/offerings/fallback', {
      method: 'POST',
      body: JSON.stringify({ weekStart, tenantId, producerId }),
    }, tenantId),
}

export const ordersApi = {
  getMy: (weekId: string, tenantId: string) =>
    request<Order | null>(`/orders/my?weekId=${weekId}&tenantId=${tenantId}`, {}, tenantId),
  create: (data: Omit<Order, 'id' | 'dateCreated' | 'dateUpdated'>, tenantId: string) =>
    request<Order>('/orders', { method: 'POST', body: JSON.stringify(data) }, tenantId),
  update: (id: string, data: Partial<Order>, tenantId: string) =>
    request<Order>(`/orders/${id}`, { method: 'PUT', body: JSON.stringify(data) }, tenantId),
  getConsolidated: (weekId: string, tenantId: string) =>
    request<Order[]>(`/orders/consolidated?weekId=${weekId}&tenantId=${tenantId}`, {}, tenantId),
  getConsolidatedText: (weekId: string, tenantId: string, producerId: string) =>
    request<{ text: string }>(`/orders/consolidated-text?weekId=${weekId}&tenantId=${tenantId}&producerId=${producerId}`, {}, tenantId),
  sendConsolidatedWhatsApp: (weekId: string, tenantId: string, producerId: string) =>
    request<{ success: boolean }>('/orders/send-consolidated-whatsapp', {
      method: 'POST',
      body: JSON.stringify({ weekId, tenantId, producerId }),
    }, tenantId),
  getWeekLock: (weekId: string, tenantId: string) =>
    request<{ locked: boolean }>(`/orders/week-lock?weekId=${weekId}&tenantId=${tenantId}`, {}, tenantId),
  getHistory: (tenantId: string, userId?: string) =>
    request<Order[]>(`/orders/history?tenantId=${tenantId}${userId ? `&userId=${userId}` : ''}`, {}, tenantId),
  getMonthly: (month: string, tenantId: string) =>
    request<Order[]>(`/orders/monthly?month=${month}&tenantId=${tenantId}`, {}, tenantId),
  toggleRecebido: (userId: string, userName: string, weekId: string, tenantId: string, recebido: boolean) =>
    request<{ id: string; recebido: boolean }>('/orders/recebido', {
      method: 'PATCH',
      body: JSON.stringify({ userId, userName, weekId, tenantId, recebido }),
    }, tenantId),
}

export const paymentsApi = {
  getMy: (month: string, tenantId: string) =>
    request<Payment[]>(`/payments/my?month=${month}&tenantId=${tenantId}`, {}, tenantId),
  list: (month: string, tenantId: string) =>
    request<Payment[]>(`/payments?month=${month}&tenantId=${tenantId}`, {}, tenantId),
  update: (id: string, data: Partial<Payment>, tenantId: string) =>
    request<Payment>(`/payments/${id}`, { method: 'PUT', body: JSON.stringify(data) }, tenantId),
  ensureQuota: (month: string, tenantId: string) =>
    request<Payment>('/payments/quota', { method: 'POST', body: JSON.stringify({ month, tenantId }) }, tenantId),
  ensureFrete: (month: string, tenantId: string) =>
    request<Payment | { skipped: true }>('/payments/frete', { method: 'POST', body: JSON.stringify({ month, tenantId }) }, tenantId),
}

export const issuesApi = {
  create: (data: { title: string; body: string }) =>
    request<{ url: string; number: number }>('/issues', { method: 'POST', body: JSON.stringify(data) }),
}

export const rolesApi = {
  list: (tenantId: string) =>
    request<TenantRole[]>('/roles', {}, tenantId),
  create: (name: string, tenantId: string) =>
    request<TenantRole>('/roles', { method: 'POST', body: JSON.stringify({ name }) }, tenantId),
  delete: (id: string, tenantId: string) =>
    request<void>(`/roles/${id}`, { method: 'DELETE' }, tenantId),
}

export const whatsappApi = {
  requestOtp: async (identifier: string): Promise<{ success: boolean }> => {
    const res = await fetch(`${BASE_URL}/auth/whatsapp/request-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }))
      throw new Error((err as { message?: string }).message || 'Erro ao enviar código')
    }
    return res.json()
  },
  verifyOtp: async (identifier: string, code: string): Promise<{ customToken: string }> => {
    const res = await fetch(`${BASE_URL}/auth/whatsapp/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, code }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }))
      throw new Error((err as { message?: string }).message || 'Código inválido ou expirado')
    }
    return res.json()
  },
}

export interface BatchResult {
  name: string
  email: string
  success: boolean
  error?: string
  password?: string
}

export const usersApi = {
  getMe: (tenantId?: string) => request<User>('/users/me', {}, tenantId),
  updateMe: (data: Partial<User>, tenantId?: string) =>
    request<User>('/users/me', { method: 'PUT', body: JSON.stringify(data) }, tenantId),
  list: (tenantId: string) => request<User[]>(`/users?tenantId=${tenantId}`, {}, tenantId),
  create: (data: Omit<User, 'id'>) =>
    request<User>('/users', { method: 'POST', body: JSON.stringify(data) }),
  createMember: (data: Omit<User, 'id'> & { password?: string }, tenantId: string) =>
    request<User & { password?: string }>('/users/create-member', { method: 'POST', body: JSON.stringify(data) }, tenantId),
  createMemberBatch: (members: Array<Omit<User, 'id'> & { password?: string }>, tenantId: string) =>
    request<{ results: BatchResult[] }>('/users/create-member-batch', { method: 'POST', body: JSON.stringify({ members }) }, tenantId),
  update: (uid: string, data: Partial<User>, tenantId: string) =>
    request<User>(`/users/${uid}`, { method: 'PUT', body: JSON.stringify(data) }, tenantId),
  reorderDelivery: (orderedIds: string[], tenantId: string) =>
    request<{ updated: number }>('/users/reorder-delivery', { method: 'PUT', body: JSON.stringify({ orderedIds }) }, tenantId),
  disable: (uid: string, tenantId: string) =>
    request<User>(`/users/${uid}`, { method: 'PUT', body: JSON.stringify({ disabled: true }) }, tenantId),
  enable: (uid: string, tenantId: string) =>
    request<User>(`/users/${uid}`, { method: 'PUT', body: JSON.stringify({ disabled: false }) }, tenantId),
  delete: (uid: string, tenantId: string) =>
    request<{ success: boolean }>(`/users/${uid}`, { method: 'DELETE' }, tenantId),
  resetPassword: (uid: string, tenantId: string) =>
    request<{ link: string; whatsappSent: boolean }>(`/users/${uid}/reset-password`, { method: 'POST' }, tenantId),
}
