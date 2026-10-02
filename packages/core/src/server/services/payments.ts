import { countDeliveryWeeks } from '../../domain/week.js'
import { emAcolhida, semanasConfirmadas, UTC_OFFSET_PADRAO } from '../../domain/acolhida.js'
import { weeklyRate, quotaAmount } from '../../domain/quota.js'
import { freteDoMembro } from '../../domain/frete.js'
import { isEntrega } from '../../domain/delivery.js'
import type { AcolhidaWeekDoc, OrderDoc, PaymentDoc, UserDoc, TenantDoc } from '../../types.js'
import type { AppConfig } from '../../config.js'
import type { EngineDeps } from '../repo.js'

export type { PaymentDoc }

// Definidos em types.ts (o front também precisa deles e não pode importar daqui);
// re-exportados para a API de '@pedidos/core/server' não mudar.
export { PRODUCER_COTA, PRODUCER_FRETE } from '../../types.js'
import { PRODUCER_COTA, PRODUCER_FRETE } from '../../types.js'

// Visão de configuração financeira do tenant (subconjunto do TenantDoc canônico).
type TenantSettings = Pick<
  TenantDoc,
  'quotas' | 'quotaInteira' | 'quotaMeia' | 'freteDelivery' | 'fretePorBairro' | 'freteVigenteDesde' | 'dueDay'
>

/** Por que a fatura de frete não foi gerada. `skipped` é mantido para quem só testa isso. */
export interface PuloDoFrete {
  skipped: true
  motivo: 'nao-e-entrega' | 'fora-da-vigencia' | 'sem-frete' | 'frete-zero'
}

/** Membro de entrega sem preço de frete resolvível — não gera fatura, vira pendência. */
export interface PendenciaFrete {
  userId: string
  userName: string
  neighborhood?: string
}

/**
 * A geração de frete não roda só no cron do dia 1: `POST /payments/frete` dispara para o mês
 * que o membro estiver NAVEGANDO em Meus Pagamentos. Sem esta trava, passear para um mês
 * anterior criaria a fatura daquele mês — cobrança retroativa sem ninguém pedir. A guarda
 * mora aqui, e não na rota, porque o `acolhida.ts` também gera.
 */
const dentroDaVigencia = (month: string, t: TenantSettings): boolean =>
  !t.freteVigenteDesde || month >= t.freteVigenteDesde

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
      fretePorBairro: t?.fretePorBairro,
      freteVigenteDesde: t?.freteVigenteDesde,
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
          if (prev.corrigido) return // correção manual do admin vence o recálculo
          await repo.updateDoc<PaymentDoc>('payments', prev.id, { amount, dateUpdated: now })
        } else {
          await repo.createDoc<PaymentDoc>('payments', {
            userId, userName, tenantId, month, producerName, amount, dueDate,
            verified: false, dateCreated: now, dateUpdated: now,
          })
        }
      }),
    )

    // Zerar docs de produtores que não aparecem mais nos pedidos enviados (menos os corrigidos
    // à mão: zerar apagaria o ajuste do admin).
    await Promise.all(
      [...existingByProducer.entries()]
        .filter(([producerName, doc]) => !byProducer.has(producerName) && !doc.corrigido)
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
      // Correção manual do admin vence a geração. Esta passada não roda só no cron do dia 1:
      // `POST /payments/frete` dispara a cada abertura de Meus Pagamentos e a confirmação da
      // acolhida dispara as duas — sem a trava o ajuste seria desfeito em silêncio.
      const campos = prev.corrigido ? { ...comVenc } : { amount, ...comVenc }
      await repo.updateDoc<PaymentDoc>('payments', prev.id, { ...campos, dateUpdated: now })
      return { doc: { ...prev, ...campos, dateUpdated: now }, created: false }
    }
    const doc = await repo.createDoc<PaymentDoc>('payments', {
      userId: uid, userName, tenantId, month, producerName, amount, ...comVenc,
      verified: false, dateCreated: now, dateUpdated: now,
    })
    return { doc, created: true }
  }

  // Quantas semanas cobrar deste membro neste mês.
  //
  // Membro efetivo: o calendário decide (todas as entregas do mês, quinzenal respeitado).
  // Membro em acolhida: só as que ele CONFIRMOU — sem confirmação não há semana, e sem semana
  // não há valor. É o que faz a acolhida ser experimentação de verdade, em vez de um mês
  // assinado adiantado.
  //
  // O TIPO de entrega não entra aqui: continua sendo do usuário (`isEntrega`), como sempre foi.
  // O membro em acolhida troca o dele na tela principal; a acolhida muda quantas semanas
  // contam, não como ele recebe.
  async function semanasDeCobranca(
    u: UserDoc,
    uid: string,
    tenantId: string,
    month: string,
    agora: Date,
  ): Promise<number> {
    const utcOffset = config.tenantDefaults.utcOffset ?? UTC_OFFSET_PADRAO
    if (!emAcolhida(u, agora, utcOffset)) {
      return countDeliveryWeeks(month, u.frequency ?? 'semanal', u.quinzenalParity)
    }
    const docs = await repo.listDocs<AcolhidaWeekDoc>('acolhidaWeeks', [
      ['userId', '==', uid],
      ['tenantId', '==', tenantId],
    ])
    return semanasConfirmadas(docs, month)
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
    const amount = valorCota(userDoc, settings, semanas)
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
        PRODUCER_COTA, u.id, u.name, tenantId, month, valorCota(u, settings, semanas), venc,
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
  ): Promise<(PaymentDoc & { id: string }) | PuloDoFrete> {
    const [userDoc, tenantDoc] = await Promise.all([
      repo.getDoc<UserDoc>('users', uid),
      repo.getDoc<TenantSettings>('tenants', tenantId),
    ])
    if (!userDoc) throw new Error('Usuário não encontrado')
    const settings = settingsDe(tenantDoc)
    if (!isEntrega(userDoc)) return { skipped: true, motivo: 'nao-e-entrega' as const }
    if (!dentroDaVigencia(month, settings)) return { skipped: true, motivo: 'fora-da-vigencia' as const }

    // Sem preço resolvível é PENDÊNCIA, não entrega grátis: com tabela por bairro, tratar
    // indefinido como 0 esconderia o cadastro incompleto atrás de uma fatura de R$ 0.
    const f = freteDoMembro(userDoc, settings)
    if (f.origem === 'indefinido') return { skipped: true, motivo: 'sem-frete' as const }
    if (f.valor <= 0) return { skipped: true, motivo: 'frete-zero' as const }
    const frete = f.valor

    // Em acolhida muda só a CONTAGEM: paga o frete das semanas que confirmou.
    const semanas = await semanasDeCobranca(userDoc, uid, tenantId, month, agora)
    const naAcolhida = emAcolhida(userDoc, agora, config.tenantDefaults.utcOffset ?? UTC_OFFSET_PADRAO)
    const dueDate = naAcolhida ? undefined : buildDueDate(month, 'frete', settings.dueDay!)
    return (await upsertGenerated(
      PRODUCER_FRETE, uid, userDoc.name, tenantId, month, frete * semanas, dueDate,
    )).doc
  }

  // Devolve também QUEM ficou sem fatura por falta de preço: quem avisa é o job do app
  // (cron e WhatsApp são infra do app; o motor só apura).
  async function generateFreteForAll(
    tenantId: string,
    month: string,
    agora = new Date(),
  ): Promise<{ generated: number; semFrete: PendenciaFrete[] }> {
    const [users, tenantDoc] = await Promise.all([
      repo.listDocs<UserDoc>('users', [['tenantId', '==', tenantId]]),
      repo.getDoc<TenantSettings>('tenants', tenantId),
    ])
    const settings = settingsDe(tenantDoc)
    if (!dentroDaVigencia(month, settings)) return { generated: 0, semFrete: [] }

    const dueDate = buildDueDate(month, 'frete', settings.dueDay!)
    const utcOffset = config.tenantDefaults.utcOffset ?? UTC_OFFSET_PADRAO
    const deEntrega = users.filter((u) => isEntrega(u) && !u.disabled && !u.deleted)

    let generated = 0
    const semFrete: PendenciaFrete[] = []
    for (const u of deEntrega) {
      const f = freteDoMembro(u, settings)
      if (f.origem === 'indefinido') {
        semFrete.push({ userId: u.id, userName: u.name, ...(u.neighborhood ? { neighborhood: u.neighborhood } : {}) })
        continue
      }
      if (f.valor <= 0) continue // 0 explícito é entrega grátis, não pendência
      const semanas = await semanasDeCobranca(u, u.id, tenantId, month, agora)
      const venc = emAcolhida(u, agora, utcOffset) ? undefined : dueDate
      const { created } = await upsertGenerated(
        PRODUCER_FRETE, u.id, u.name, tenantId, month, f.valor * semanas, venc,
      )
      if (created) generated++
    }
    return { generated, semFrete }
  }

  return {
    upsertPaymentsForOrder,
    generateQuotaForUser,
    generateQuotaForAll,
    generateFreteForUser,
    generateFreteForAll,
  }
}
