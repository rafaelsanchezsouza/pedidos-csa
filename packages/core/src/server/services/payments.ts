import { countDeliveryWeeks } from '../../domain/week.js'
import { emAcolhida, semanasConfirmadas, UTC_OFFSET_PADRAO } from '../../domain/acolhida.js'
import { weeklyRate, quotaAmount } from '../../domain/quota.js'
import { resolveFrete } from '../../domain/frete.js'
import { isEntrega } from '../../domain/delivery.js'
import type { AcolhidaWeekDoc, OrderDoc, PaymentDoc, UserDoc, TenantDoc } from '../../types.js'
import type { AppConfig } from '../../config.js'
import type { EngineDeps } from '../repo.js'

export type { PaymentDoc }

// Sentinelas de producerName nas faturas geradas (não vêm de pedido). São TOKENS DE DADO
// canônicos, iguais nos dois apps — o rótulo que o membro vê é vocabulário da UI.
export const PRODUCER_COTA = 'Cota'
export const PRODUCER_FRETE = 'Entrega'

// Visão de configuração financeira do tenant (subconjunto do TenantDoc canônico).
type TenantSettings = Pick<TenantDoc, 'quotas' | 'quotaInteira' | 'quotaMeia' | 'freteDelivery' | 'dueDay'>

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
    dueDate: string | undefined,
  ): Promise<{ doc: PaymentDoc & { id: string }; created: boolean }> {
    const existing = await repo.listDocs<PaymentDoc>('payments', [
      ['userId', '==', uid],
      ['tenantId', '==', tenantId],
      ['month', '==', month],
      ['producerName', '==', producerName],
    ])
    const now = new Date().toISOString()
    // Firestore recusa `undefined` em campo: fatura sem vencimento OMITE a chave.
    const comVenc = dueDate === undefined ? {} : { dueDate }
    if (existing.length > 0) {
      const prev = existing[0]!
      await repo.updateDoc<PaymentDoc>('payments', prev.id, { amount, ...comVenc, dateUpdated: now })
      return { doc: { ...prev, amount, ...comVenc, dateUpdated: now }, created: false }
    }
    const doc = await repo.createDoc<PaymentDoc>('payments', {
      userId: uid, userName, tenantId, month, producerName, amount, ...comVenc,
      verified: false, dateCreated: now, dateUpdated: now,
    })
    return { doc, created: true }
  }

  // Quantas semanas cobrar deste membro neste mês — e quantas delas são entrega.
  //
  // Membro efetivo: o calendário decide (todas as entregas do mês, quinzenal respeitado) e o
  // frete segue o `deliveryType` do cadastro. Membro em acolhida: só o que ele CONFIRMOU, e o
  // tipo de entrega é o daquela semana — ele escolhe toda semana se retira ou recebe em casa.
  // Sem confirmação não há semana, e sem semana não há valor: é o que faz a acolhida ser
  // experimentação de verdade, em vez de um mês assinado adiantado.
  async function semanasDeCobranca(
    u: UserDoc & { id?: string },
    uid: string,
    tenantId: string,
    month: string,
    agora: Date,
  ): Promise<{ cota: number; entrega: number }> {
    const utcOffset = config.tenantDefaults.utcOffset ?? UTC_OFFSET_PADRAO
    if (!emAcolhida(u, agora, utcOffset)) {
      const weeks = countDeliveryWeeks(month, u.frequency ?? 'semanal', u.quinzenalParity)
      return { cota: weeks, entrega: isEntrega(u) ? weeks : 0 }
    }
    const docs = await repo.listDocs<AcolhidaWeekDoc>('acolhidaWeeks', [
      ['userId', '==', uid],
      ['tenantId', '==', tenantId],
    ])
    const { total, entregas } = semanasConfirmadas(docs, month)
    return { cota: total, entrega: entregas }
  }

  // Valor da cota: tier do usuário (tiers dinâmicos, com legado inteira/meia por baixo) ×
  // quotaQty (CSA #45; ausente = 1) × semanas cobráveis. Fórmula única dos dois apps.
  const valorCota = (u: UserDoc, settings: TenantSettings, semanas: number): number =>
    quotaAmount(weeklyRate(u.quota, settings), u.quotaQty, semanas)

  async function generateQuotaForUser(
    uid: string,
    tenantId: string,
    month: string,
    agora = new Date(),
  ): Promise<(PaymentDoc & { id: string }) | { skipped: true }> {
    const [userDoc, tenantDoc] = await Promise.all([
      repo.getDoc<UserDoc>('users', uid),
      repo.getDoc<TenantSettings>('tenants', tenantId),
    ])
    if (!userDoc?.quota) throw new Error('Usuário sem cota definida')
    if (userDoc.isentoCotas) return { skipped: true }

    const settings = settingsDe(tenantDoc)
    const semanas = await semanasDeCobranca(userDoc, uid, tenantId, month, agora)
    const amount = valorCota(userDoc, settings, semanas.cota)
    // Acolhida não tem vencimento: o membro paga a semana que vai consumir, não uma fatura
    // com prazo. `dueDate` ausente é o que a tela usa para não cobrar data dele.
    const dueDate = emAcolhida(userDoc, agora, config.tenantDefaults.utcOffset ?? UTC_OFFSET_PADRAO)
      ? undefined
      : buildDueDate(month, 'cota', settings.dueDay!)
    return (await upsertGenerated(PRODUCER_COTA, uid, userDoc.name, tenantId, month, amount, dueDate)).doc
  }

  async function generateQuotaForAll(tenantId: string, month: string, agora = new Date()): Promise<{ generated: number }> {
    const [users, tenantDoc] = await Promise.all([
      repo.listDocs<UserDoc>('users', [['tenantId', '==', tenantId]]),
      repo.getDoc<TenantSettings>('tenants', tenantId),
    ])
    const settings = settingsDe(tenantDoc)
    const eligible = users.filter((u) => u.quota && !u.isentoCotas && !u.disabled && !u.deleted)
    const dueDate = buildDueDate(month, 'cota', settings.dueDay!)
    let generated = 0
    for (const u of eligible) {
      const semanas = await semanasDeCobranca(u, u.id, tenantId, month, agora)
      const venc = emAcolhida(u, agora, config.tenantDefaults.utcOffset ?? UTC_OFFSET_PADRAO)
        ? undefined
        : dueDate
      const { created } = await upsertGenerated(
        PRODUCER_COTA, u.id, u.name, tenantId, month, valorCota(u, settings, semanas.cota), venc,
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
    agora = new Date(),
  ): Promise<(PaymentDoc & { id: string }) | { skipped: true }> {
    const [userDoc, tenantDoc] = await Promise.all([
      repo.getDoc<UserDoc>('users', uid),
      repo.getDoc<TenantSettings>('tenants', tenantId),
    ])
    if (!userDoc) throw new Error('Usuário não encontrado')
    const settings = settingsDe(tenantDoc)
    const frete = resolveFrete(userDoc, settings)
    if (frete <= 0) return { skipped: true }

    // Quem está em acolhida escolhe o tipo A CADA SEMANA, então a elegibilidade não pode sair
    // do `deliveryType` do cadastro: sai das semanas em que ele pediu em casa.
    const semanas = await semanasDeCobranca(userDoc, uid, tenantId, month, agora)
    const naAcolhida = emAcolhida(userDoc, agora, config.tenantDefaults.utcOffset ?? UTC_OFFSET_PADRAO)
    if (!naAcolhida && !isEntrega(userDoc)) return { skipped: true }
    if (naAcolhida && semanas.entrega === 0) return { skipped: true }

    const dueDate = naAcolhida ? undefined : buildDueDate(month, 'frete', settings.dueDay!)
    return (await upsertGenerated(
      PRODUCER_FRETE, uid, userDoc.name, tenantId, month, frete * semanas.entrega, dueDate,
    )).doc
  }

  async function generateFreteForAll(tenantId: string, month: string, agora = new Date()): Promise<{ generated: number }> {
    const [users, tenantDoc] = await Promise.all([
      repo.listDocs<UserDoc>('users', [['tenantId', '==', tenantId]]),
      repo.getDoc<TenantSettings>('tenants', tenantId),
    ])
    const settings = settingsDe(tenantDoc)
    const dueDate = buildDueDate(month, 'frete', settings.dueDay!)
    const utcOffset = config.tenantDefaults.utcOffset ?? UTC_OFFSET_PADRAO
    // Membro em acolhida entra na lista mesmo com `deliveryType: 'retirada'` no cadastro: o
    // que vale é o que ele escolheu nas semanas. Filtrar por `isEntrega` aqui o deixaria de
    // fora e o frete das semanas em que ele pediu em casa nunca seria cobrado.
    const eligible = users.filter(
      (u) => !u.disabled && !u.deleted && resolveFrete(u, settings) > 0
        && (isEntrega(u) || emAcolhida(u, agora, utcOffset)),
    )
    let generated = 0
    for (const u of eligible) {
      const frete = resolveFrete(u, settings)
      const semanas = await semanasDeCobranca(u, u.id, tenantId, month, agora)
      if (semanas.entrega === 0) continue
      const venc = emAcolhida(u, agora, utcOffset) ? undefined : dueDate
      const { created } = await upsertGenerated(
        PRODUCER_FRETE, u.id, u.name, tenantId, month, frete * semanas.entrega, venc,
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
