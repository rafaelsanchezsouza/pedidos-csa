import { countDeliveryWeeks } from '../../domain/week.js'
import { weeklyRate, quotaAmount } from '../../domain/quota.js'
import { resolveFrete } from '../../domain/frete.js'
import { isEntrega } from '../../domain/delivery.js'
import type { QuotaTier } from '../../types.js'
import type { AppConfig } from '../../config.js'
import type { EngineDeps } from '../repo.js'

// Sentinelas de producerName nas faturas geradas (não vêm de pedido). São TOKENS DE DADO
// canônicos, iguais nos dois apps — o rótulo que o membro vê é vocabulário da UI.
export const PRODUCER_COTA = 'Cota'
export const PRODUCER_FRETE = 'Entrega'

interface OrderItem {
  price: number
  qty: number
  producerName: string
}

interface OrderDoc {
  userId: string
  userName: string
  tenantId: string
  weekId: string
  items: OrderItem[]
  status: 'rascunho' | 'enviado'
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

interface UserDoc {
  name: string
  quota?: string
  quotaQty?: number
  frequency?: 'semanal' | 'quinzenal'
  quinzenalParity?: 'par' | 'impar'
  isentoCotas?: boolean
  disabled?: boolean
  deleted?: boolean
  deliveryType?: string
  freteDelivery?: number
}

interface TenantSettings {
  quotas?: QuotaTier[]
  quotaInteira?: number
  quotaMeia?: number
  freteDelivery?: number
  dueDay?: number
}

// 'cota' vence no mês anterior (pré-consumo); 'extras' e 'frete' no mês seguinte (pós-consumo).
function buildDueDate(month: string, type: 'cota' | 'extras' | 'frete', dueDay: number): string {
  const [year, m] = month.split('-').map(Number) as [number, number]
  let targetYear = year
  let targetMonth: number
  if (type === 'cota') {
    targetMonth = m - 1
    if (targetMonth === 0) { targetMonth = 12; targetYear-- }
  } else {
    targetMonth = m + 1
    if (targetMonth === 13) { targetMonth = 1; targetYear++ }
  }
  return `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`
}

export type PaymentService = ReturnType<typeof createPaymentService>

export function createPaymentService({ repo }: EngineDeps, config: AppConfig) {
  // Doc do tenant com os defaults da config por baixo — fim dos ?? 65/40/10 espalhados.
  const settingsDe = (t: TenantSettings | null): TenantSettings => {
    const d = config.tenantDefaults
    return {
      quotas: t?.quotas?.length ? t.quotas : d.quotas,
      quotaInteira: t?.quotaInteira ?? d.quotaInteira,
      quotaMeia: t?.quotaMeia ?? d.quotaMeia,
      freteDelivery: t?.freteDelivery,
      dueDay: t?.dueDay ?? d.dueDay,
    }
  }

  async function upsertPaymentsForOrder(
    userId: string,
    userName: string,
    tenantId: string,
    month: string,
  ): Promise<void> {
    const [orders, tenantDoc] = await Promise.all([
      repo.listDocs<OrderDoc>('orders', [
        ['userId', '==', userId],
        ['tenantId', '==', tenantId],
      ]),
      repo.getDoc<TenantSettings>('tenants', tenantId),
    ])
    const settings = settingsDe(tenantDoc)
    const monthOrders = orders.filter((o) => o.status === 'enviado' && o.weekId.startsWith(month))

    // Agrupar por producerName
    const byProducer = new Map<string, number>()
    for (const order of monthOrders) {
      for (const item of order.items) {
        const producer = item.producerName
        byProducer.set(producer, (byProducer.get(producer) ?? 0) + item.price * item.qty)
      }
    }

    const existing = await repo.listDocs<PaymentDoc>('payments', [
      ['userId', '==', userId],
      ['tenantId', '==', tenantId],
      ['month', '==', month],
    ])
    // Nunca tocar em 'Cota' nem 'Entrega' — faturas geradas separadamente, não vêm de pedido
    const existingByProducer = new Map(
      existing.filter((p) => p.producerName !== PRODUCER_COTA && p.producerName !== PRODUCER_FRETE).map((p) => [p.producerName, p]),
    )

    const now = new Date().toISOString()
    const dueDate = buildDueDate(month, 'extras', settings.dueDay!)

    // Upsert produtores com saldo > 0
    await Promise.all(
      [...byProducer.entries()].map(async ([producerName, amount]) => {
        const prev = existingByProducer.get(producerName)
        if (prev) {
          await repo.updateDoc<PaymentDoc>('payments', prev.id, { amount, dateUpdated: now })
        } else {
          await repo.createDoc<PaymentDoc>('payments', {
            userId, userName, tenantId, month, producerName, amount, dueDate,
            verified: false, dateCreated: now, dateUpdated: now,
          })
        }
      }),
    )

    // Zerar docs de produtores que não aparecem mais nos pedidos enviados
    await Promise.all(
      [...existingByProducer.entries()]
        .filter(([producerName]) => !byProducer.has(producerName))
        .map(([, doc]) => repo.updateDoc<PaymentDoc>('payments', doc.id, { amount: 0, dateUpdated: now })),
    )
  }

  // Upsert de uma fatura gerada ('Cota'/'Entrega') do mês do usuário.
  async function upsertGenerated(
    producerName: string,
    uid: string,
    userName: string,
    tenantId: string,
    month: string,
    amount: number,
    dueDate: string,
  ): Promise<{ doc: PaymentDoc & { id: string }; created: boolean }> {
    const existing = await repo.listDocs<PaymentDoc>('payments', [
      ['userId', '==', uid],
      ['tenantId', '==', tenantId],
      ['month', '==', month],
      ['producerName', '==', producerName],
    ])
    const now = new Date().toISOString()
    if (existing.length > 0) {
      const prev = existing[0]!
      await repo.updateDoc<PaymentDoc>('payments', prev.id, { amount, dueDate, dateUpdated: now })
      return { doc: { ...prev, amount, dueDate, dateUpdated: now }, created: false }
    }
    const doc = await repo.createDoc<PaymentDoc>('payments', {
      userId: uid, userName, tenantId, month, producerName, amount, dueDate,
      verified: false, dateCreated: now, dateUpdated: now,
    })
    return { doc, created: true }
  }

  // Valor mensal da cota: tier do usuário (tiers dinâmicos, com legado inteira/meia por
  // baixo) × quotaQty (CSA #45; ausente = 1) × entregas do mês. Fórmula única dos dois apps.
  const valorCota = (u: UserDoc, settings: TenantSettings, month: string): number => {
    const weeks = countDeliveryWeeks(month, u.frequency ?? 'semanal', u.quinzenalParity)
    return quotaAmount(weeklyRate(u.quota, settings), u.quotaQty, weeks)
  }

  async function generateQuotaForUser(
    uid: string,
    tenantId: string,
    month: string,
  ): Promise<(PaymentDoc & { id: string }) | { skipped: true }> {
    const [userDoc, tenantDoc] = await Promise.all([
      repo.getDoc<UserDoc>('users', uid),
      repo.getDoc<TenantSettings>('tenants', tenantId),
    ])
    if (!userDoc?.quota) throw new Error('Usuário sem cota definida')
    if (userDoc.isentoCotas) return { skipped: true }

    const settings = settingsDe(tenantDoc)
    const amount = valorCota(userDoc, settings, month)
    const dueDate = buildDueDate(month, 'cota', settings.dueDay!)
    return (await upsertGenerated(PRODUCER_COTA, uid, userDoc.name, tenantId, month, amount, dueDate)).doc
  }

  async function generateQuotaForAll(tenantId: string, month: string): Promise<{ generated: number }> {
    const [users, tenantDoc] = await Promise.all([
      repo.listDocs<UserDoc>('users', [['tenantId', '==', tenantId]]),
      repo.getDoc<TenantSettings>('tenants', tenantId),
    ])
    const settings = settingsDe(tenantDoc)
    const eligible = users.filter((u) => u.quota && !u.isentoCotas && !u.disabled && !u.deleted)
    const dueDate = buildDueDate(month, 'cota', settings.dueDay!)
    let generated = 0
    for (const u of eligible) {
      const { created } = await upsertGenerated(
        PRODUCER_COTA, u.id, u.name, tenantId, month, valorCota(u, settings, month), dueDate,
      )
      if (created) generated++
    }
    return { generated }
  }

  // Fatura de frete ('Entrega'), mensal, por membro que recebe por entrega.
  // Espelha a cota: valor = frete efetivo × nº de entregas do mês (respeita quinzenal).
  async function generateFreteForUser(
    uid: string,
    tenantId: string,
    month: string,
  ): Promise<(PaymentDoc & { id: string }) | { skipped: true }> {
    const [userDoc, tenantDoc] = await Promise.all([
      repo.getDoc<UserDoc>('users', uid),
      repo.getDoc<TenantSettings>('tenants', tenantId),
    ])
    if (!userDoc) throw new Error('Usuário não encontrado')
    const settings = settingsDe(tenantDoc)
    const frete = resolveFrete(userDoc, settings)
    // Só gera para quem recebe por entrega e tem frete > 0.
    if (!isEntrega(userDoc) || frete <= 0) return { skipped: true }

    const entregas = countDeliveryWeeks(month, userDoc.frequency ?? 'semanal', userDoc.quinzenalParity)
    const dueDate = buildDueDate(month, 'frete', settings.dueDay!)
    return (await upsertGenerated(PRODUCER_FRETE, uid, userDoc.name, tenantId, month, frete * entregas, dueDate)).doc
  }

  async function generateFreteForAll(tenantId: string, month: string): Promise<{ generated: number }> {
    const [users, tenantDoc] = await Promise.all([
      repo.listDocs<UserDoc>('users', [['tenantId', '==', tenantId]]),
      repo.getDoc<TenantSettings>('tenants', tenantId),
    ])
    const settings = settingsDe(tenantDoc)
    const dueDate = buildDueDate(month, 'frete', settings.dueDay!)
    const eligible = users.filter(
      (u) => isEntrega(u) && !u.disabled && !u.deleted && resolveFrete(u, settings) > 0,
    )
    let generated = 0
    for (const u of eligible) {
      const frete = resolveFrete(u, settings)
      const entregas = countDeliveryWeeks(month, u.frequency ?? 'semanal', u.quinzenalParity)
      const { created } = await upsertGenerated(
        PRODUCER_FRETE, u.id, u.name, tenantId, month, frete * entregas, dueDate,
      )
      if (created) generated++
    }
    return { generated }
  }

  return {
    upsertPaymentsForOrder,
    generateQuotaForUser,
    generateQuotaForAll,
    generateFreteForUser,
    generateFreteForAll,
  }
}
