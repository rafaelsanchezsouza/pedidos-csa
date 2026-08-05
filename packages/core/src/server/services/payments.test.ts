import { describe, it, expect } from 'vitest'
import { createPaymentService, PRODUCER_COTA, PRODUCER_FRETE, type PaymentDoc } from './payments'
import { createMemoryRepo } from '../memoryRepo'
import type { AppConfig } from '../../config.js'

const config: AppConfig = {
  brand: { name: 'X', tagline: 't', icon: '/i.png', colors: { light: {}, dark: {} } },
  vocabulary: { pickupLabel: 'Retirada', otpAppName: 'X' },
  capabilities: { offeringSource: 'from-catalog', multiTenant: false, paymentStrategy: 'monthly-post' },
  tenantDefaults: {
    quotaTerm: 'Cota',
    quotas: [{ name: 'Cota inteira', price: 65 }, { name: 'Meia cota', price: 40 }],
    quotaInteira: 65, quotaMeia: 40, roleDefaults: [],
    dueDay: 10, orderSendDay: 2, orderSendHour: 6, weekChangeDay: 0,
  },
}

// Agosto/2025: 4 quartas dentro do mês (dias 6, 13, 20, 27) → 4 semanas de entrega p/ semanal.
const MONTH = '2025-08'

const pagamentos = async (repo: ReturnType<typeof createMemoryRepo>, producerName: string) =>
  (await repo.listDocs<PaymentDoc>('payments')).filter((p) => p.producerName === producerName)

describe('generateQuotaForUser', () => {
  it('valor = tier × quotaQty × entregas do mês; vencimento no mês ANTERIOR (pré-consumo)', async () => {
    const repo = createMemoryRepo({
      users: { u1: { name: 'Ana', tenantId: 't1', quota: 'Meia cota', quotaQty: 2, frequency: 'semanal' } },
      tenants: { t1: { dueDay: 5 } },
    })
    const svc = createPaymentService({ repo }, config)
    const doc = await svc.generateQuotaForUser('u1', 't1', MONTH)
    // 40 (Meia cota, do default da config — tenant sem quotas) × 2 cotas × 4 semanas
    expect(doc).toMatchObject({ producerName: PRODUCER_COTA, amount: 40 * 2 * 4, dueDate: '2025-07-05' })
  })

  it('sem doc do tenant, tudo cai nos defaults da config (fim dos ?? 65/10)', async () => {
    const repo = createMemoryRepo({
      users: { u1: { name: 'Ana', tenantId: 't1', quota: 'Cota inteira', frequency: 'semanal' } },
    })
    const svc = createPaymentService({ repo }, config)
    const doc = await svc.generateQuotaForUser('u1', 't1', MONTH)
    expect(doc).toMatchObject({ amount: 65 * 4, dueDate: '2025-07-10' })
  })

  it('isento pula; sem cota definida lança', async () => {
    const repo = createMemoryRepo({
      users: {
        isento: { name: 'I', tenantId: 't1', quota: 'Cota inteira', isentoCotas: true },
        semCota: { name: 'S', tenantId: 't1' },
      },
    })
    const svc = createPaymentService({ repo }, config)
    expect(await svc.generateQuotaForUser('isento', 't1', MONTH)).toEqual({ skipped: true })
    await expect(svc.generateQuotaForUser('semCota', 't1', MONTH)).rejects.toThrow('sem cota definida')
  })

  it('upsert: segunda geração atualiza o mesmo doc, não duplica', async () => {
    const repo = createMemoryRepo({
      users: { u1: { name: 'Ana', tenantId: 't1', quota: 'Cota inteira', frequency: 'semanal' } },
    })
    const svc = createPaymentService({ repo }, config)
    await svc.generateQuotaForUser('u1', 't1', MONTH)
    await svc.generateQuotaForUser('u1', 't1', MONTH)
    expect(await pagamentos(repo, PRODUCER_COTA)).toHaveLength(1)
  })
})

describe('generateQuotaForAll / generateFreteForAll', () => {
  it('gera só para elegíveis e conta apenas docs novos', async () => {
    const repo = createMemoryRepo({
      users: {
        a: { name: 'A', tenantId: 't1', quota: 'Cota inteira', frequency: 'semanal' },
        isento: { name: 'I', tenantId: 't1', quota: 'Cota inteira', isentoCotas: true },
        desativado: { name: 'D', tenantId: 't1', quota: 'Cota inteira', disabled: true },
        semCota: { name: 'S', tenantId: 't1' },
      },
    })
    const svc = createPaymentService({ repo }, config)
    expect(await svc.generateQuotaForAll('t1', MONTH)).toEqual({ generated: 1 })
    // segunda rodada: nada novo
    expect(await svc.generateQuotaForAll('t1', MONTH)).toEqual({ generated: 0 })
  })

  it('frete: só deliveryType entrega com frete > 0; quinzenal conta metade das semanas', async () => {
    const repo = createMemoryRepo({
      users: {
        entrega: { name: 'E', tenantId: 't1', deliveryType: 'entrega', frequency: 'quinzenal', quinzenalParity: 'impar' },
        retirada: { name: 'R', tenantId: 't1', deliveryType: 'retirada' },
        semFrete: { name: 'Z', tenantId: 't1', deliveryType: 'entrega', freteDelivery: 0 },
      },
      tenants: { t1: { freteDelivery: 12 } },
    })
    const svc = createPaymentService({ repo }, config)
    expect(await svc.generateFreteForAll('t1', MONTH)).toEqual({ generated: 1 })
    const fretes = await pagamentos(repo, PRODUCER_FRETE)
    expect(fretes).toHaveLength(1)
    // agosto/2025: semanas fixas (ímpar) = 2 entregas → 12 × 2; vencimento mês SEGUINTE
    expect(fretes[0]).toMatchObject({ userName: 'E', amount: 24, dueDate: '2025-09-10' })
  })
})

describe('upsertPaymentsForOrder', () => {
  it('agrupa por produtor, zera quem sumiu e NUNCA toca em Cota/Entrega', async () => {
    const repo = createMemoryRepo({
      orders: {
        o1: {
          userId: 'u1', userName: 'Ana', tenantId: 't1', weekId: '2025-08-04', status: 'enviado',
          items: [
            { producerName: 'Sítio', price: 10, qty: 2 },
            { producerName: 'Horta', price: 5, qty: 1 },
          ],
        },
        rascunho: {
          userId: 'u1', userName: 'Ana', tenantId: 't1', weekId: '2025-08-11', status: 'rascunho',
          items: [{ producerName: 'Sítio', price: 100, qty: 1 }],
        },
      },
      payments: {
        pCota: {
          userId: 'u1', userName: 'Ana', tenantId: 't1', month: MONTH,
          producerName: PRODUCER_COTA, amount: 260, verified: false, dateCreated: 'd', dateUpdated: 'd',
        },
        pAntigo: {
          userId: 'u1', userName: 'Ana', tenantId: 't1', month: MONTH,
          producerName: 'Quitanda', amount: 50, verified: false, dateCreated: 'd', dateUpdated: 'd',
        },
      },
    })
    const svc = createPaymentService({ repo }, config)
    await svc.upsertPaymentsForOrder('u1', 'Ana', 't1', MONTH)

    const all = await repo.listDocs<PaymentDoc>('payments')
    const por = (n: string) => all.find((p) => p.producerName === n)!
    expect(por('Sítio').amount).toBe(20) // rascunho não conta
    expect(por('Horta').amount).toBe(5)
    expect(por('Quitanda').amount).toBe(0) // sumiu dos pedidos → zera
    expect(por(PRODUCER_COTA).amount).toBe(260) // intocada
  })
})
