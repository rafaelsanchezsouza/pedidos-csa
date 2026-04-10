import { auth } from './firebase'
import type { Colmeia, Product, Producer, WeeklyOffering, Order, User, ParsedProduct, Payment, ColmeiaRole } from '@/types'

const BASE_URL = '/api'

async function getToken(): Promise<string> {
  const user = auth.currentUser
  if (!user) throw new Error('Não autenticado')
  return user.getIdToken()
}

async function request<T>(path: string, options: RequestInit = {}, colmeiaId?: string): Promise<T> {
  const token = await getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }
  if (colmeiaId) headers['x-colmeia-id'] = colmeiaId
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

export const colmeiasApi = {
  list: () => request<Colmeia[]>('/colmeias'),
  get: (id: string) => request<Colmeia>(`/colmeias/${id}`),
  create: (data: { name: string }) => request<Colmeia>('/colmeias', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Colmeia>) =>
    request<Colmeia>(`/colmeias/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
}

export const productsApi = {
  list: (colmeiaId: string) => request<Product[]>(`/products?colmeiaId=${colmeiaId}`, {}, colmeiaId),
  create: (data: Omit<Product, 'id' | 'dateUpdated'>, colmeiaId: string) =>
    request<Product>('/products', { method: 'POST', body: JSON.stringify(data) }, colmeiaId),
  update: (id: string, data: Partial<Product>, colmeiaId: string) =>
    request<Product>(`/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }, colmeiaId),
  delete: (id: string, colmeiaId: string) =>
    request<void>(`/products/${id}`, { method: 'DELETE' }, colmeiaId),
}

export const producersApi = {
  list: (colmeiaId: string) => request<Producer[]>(`/producers?colmeiaId=${colmeiaId}`, {}, colmeiaId),
  create: (data: Omit<Producer, 'id'>, colmeiaId: string) =>
    request<Producer>('/producers', { method: 'POST', body: JSON.stringify(data) }, colmeiaId),
  update: (id: string, data: Partial<Producer>, colmeiaId: string) =>
    request<Producer>(`/producers/${id}`, { method: 'PUT', body: JSON.stringify(data) }, colmeiaId),
  delete: (id: string, colmeiaId: string) =>
    request<void>(`/producers/${id}`, { method: 'DELETE' }, colmeiaId),
}

export const offeringsApi = {
  list: (weekId: string, colmeiaId: string) =>
    request<WeeklyOffering[]>(`/offerings?weekId=${weekId}&colmeiaId=${colmeiaId}`, {}, colmeiaId),
  create: (data: Omit<WeeklyOffering, 'id' | 'dateCreated'>, colmeiaId: string) =>
    request<WeeklyOffering>('/offerings', { method: 'POST', body: JSON.stringify(data) }, colmeiaId),
  update: (id: string, data: Partial<WeeklyOffering>, colmeiaId: string) =>
    request<WeeklyOffering>(`/offerings/${id}`, { method: 'PUT', body: JSON.stringify(data) }, colmeiaId),
  parse: (rawMessage: string, colmeiaId: string, producerId: string) =>
    request<ParsedProduct[]>('/offerings/parse', {
      method: 'POST',
      body: JSON.stringify({ rawMessage, colmeiaId, producerId }),
    }, colmeiaId),
  fallback: (weekStart: string, colmeiaId: string, producerId?: string) =>
    request<WeeklyOffering[]>('/offerings/fallback', {
      method: 'POST',
      body: JSON.stringify({ weekStart, colmeiaId, producerId }),
    }, colmeiaId),
}

export const ordersApi = {
  getMy: (weekId: string, colmeiaId: string) =>
    request<Order | null>(`/orders/my?weekId=${weekId}&colmeiaId=${colmeiaId}`, {}, colmeiaId),
  create: (data: Omit<Order, 'id' | 'dateCreated' | 'dateUpdated'>, colmeiaId: string) =>
    request<Order>('/orders', { method: 'POST', body: JSON.stringify(data) }, colmeiaId),
  update: (id: string, data: Partial<Order>, colmeiaId: string) =>
    request<Order>(`/orders/${id}`, { method: 'PUT', body: JSON.stringify(data) }, colmeiaId),
  getConsolidated: (weekId: string, colmeiaId: string) =>
    request<Order[]>(`/orders/consolidated?weekId=${weekId}&colmeiaId=${colmeiaId}`, {}, colmeiaId),
  getConsolidatedText: (weekId: string, colmeiaId: string, producerId: string) =>
    request<{ text: string }>(`/orders/consolidated-text?weekId=${weekId}&colmeiaId=${colmeiaId}&producerId=${producerId}`, {}, colmeiaId),
  getHistory: (colmeiaId: string, userId?: string) =>
    request<Order[]>(`/orders/history?colmeiaId=${colmeiaId}${userId ? `&userId=${userId}` : ''}`, {}, colmeiaId),
  getMonthly: (month: string, colmeiaId: string) =>
    request<Order[]>(`/orders/monthly?month=${month}&colmeiaId=${colmeiaId}`, {}, colmeiaId),
  toggleRecebido: (userId: string, userName: string, weekId: string, colmeiaId: string, recebido: boolean) =>
    request<{ id: string; recebido: boolean }>('/orders/recebido', {
      method: 'PATCH',
      body: JSON.stringify({ userId, userName, weekId, colmeiaId, recebido }),
    }, colmeiaId),
}

export const paymentsApi = {
  getMy: (month: string, colmeiaId: string) =>
    request<Payment[]>(`/payments/my?month=${month}&colmeiaId=${colmeiaId}`, {}, colmeiaId),
  list: (month: string, colmeiaId: string) =>
    request<Payment[]>(`/payments?month=${month}&colmeiaId=${colmeiaId}`, {}, colmeiaId),
  update: (id: string, data: Partial<Payment>, colmeiaId: string) =>
    request<Payment>(`/payments/${id}`, { method: 'PUT', body: JSON.stringify(data) }, colmeiaId),
  ensureQuota: (month: string, colmeiaId: string) =>
    request<Payment>('/payments/quota', { method: 'POST', body: JSON.stringify({ month, colmeiaId }) }, colmeiaId),
}

export const issuesApi = {
  create: (data: { title: string; body: string }) =>
    request<{ url: string; number: number }>('/issues', { method: 'POST', body: JSON.stringify(data) }),
}

export const rolesApi = {
  list: (colmeiaId: string) =>
    request<ColmeiaRole[]>('/roles', {}, colmeiaId),
  create: (name: string, colmeiaId: string) =>
    request<ColmeiaRole>('/roles', { method: 'POST', body: JSON.stringify({ name }) }, colmeiaId),
  delete: (id: string, colmeiaId: string) =>
    request<void>(`/roles/${id}`, { method: 'DELETE' }, colmeiaId),
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

export const usersApi = {
  getMe: (colmeiaId?: string) => request<User>('/users/me', {}, colmeiaId),
  updateMe: (data: Partial<User>, colmeiaId?: string) =>
    request<User>('/users/me', { method: 'PUT', body: JSON.stringify(data) }, colmeiaId),
  list: (colmeiaId: string) => request<User[]>(`/users?colmeiaId=${colmeiaId}`, {}, colmeiaId),
  create: (data: Omit<User, 'id'>) =>
    request<User>('/users', { method: 'POST', body: JSON.stringify(data) }),
  createMember: (data: Omit<User, 'id'> & { password: string }, colmeiaId: string) =>
    request<User>('/users/create-member', { method: 'POST', body: JSON.stringify(data) }, colmeiaId),
  update: (uid: string, data: Partial<User>, colmeiaId: string) =>
    request<User>(`/users/${uid}`, { method: 'PUT', body: JSON.stringify(data) }, colmeiaId),
  disable: (uid: string, colmeiaId: string) =>
    request<User>(`/users/${uid}`, { method: 'PUT', body: JSON.stringify({ disabled: true }) }, colmeiaId),
  enable: (uid: string, colmeiaId: string) =>
    request<User>(`/users/${uid}`, { method: 'PUT', body: JSON.stringify({ disabled: false }) }, colmeiaId),
  delete: (uid: string, colmeiaId: string) =>
    request<{ success: boolean }>(`/users/${uid}`, { method: 'DELETE' }, colmeiaId),
  resetPassword: (uid: string, colmeiaId: string) =>
    request<{ link: string }>(`/users/${uid}/reset-password`, { method: 'POST' }, colmeiaId),
}
