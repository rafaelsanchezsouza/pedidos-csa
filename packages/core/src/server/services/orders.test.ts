import { describe, it, expect } from 'vitest'
import { createOrdersService } from './orders'
import { createOrdersRouter } from '../routes/orders'
import { createMemoryRepo } from '../memoryRepo'
import { withRouter, json } from '../testutil'
import type { AppConfig } from '../../config.js'
import type { PaymentService } from './payments.js'
import type { WhatsAppGateway } from '../repo.js'

const config: AppConfig = {
  brand: { name: 'Fermentou!', tagline: 't', icon: '/i.png', colors: { light: {}, dark: {} } },
  vocabulary: { pickupLabel: 'Retirada', otpAppName: 'Fermentou!' },
  capabilities: { offeringSource: 'from-catalog', multiTenant: false, paymentStrategy: 'monthly-post' },
  tenantDefaults: {
    quotaTerm: 'Fornada', quotas: [{ name: 'F', price: 65 }], quotaInteira: 65, quotaMeia: 40,
    roleDefaults: [], dueDay: 10, orderSendDay: 2, orderSendHour: 6, weekChangeDay: 0,
  },
}

const WEEK = '2025-08-04'

const seed = {
  producers: { pr1: { name: 'Sítio', contact: '(11) 99999-0000', tenantId: 't1' } },
  weekly_offerings: {
    of1: { tenantId: 't1', weekStart: WEEK, producerId: 'pr1', producerName: 'Sítio', items: [{ productId: 'p1', productName: 'Pão', unit: 'un' }] },
  },
  orders: {
    o1: {
      userId: 'u1', userName: 'Ana', tenantId: 't1', weekId: WEEK, status: 'enviado',
      items: [{ productId: 'p1', productName: 'Pão', unit: 'un', qty: 2 }, { productId: 'outro', productName: 'Café', unit: 'kg', qty: 1 }],
    },
    rascunho: {
      userId: 'u2', userName: 'Bia', tenantId: 't1', weekId: WEEK, status: 'rascunho',
      items: [{ productId: 'p1', productName: 'Pão', unit: 'un', qty: 5 }],
    },
  },
}

describe('createOrdersService', () => {
  it('consolida só itens do produtor, só pedidos enviados; nome do tenant cai na config', async () => {
    const svc = createOrdersService({ repo: createMemoryRepo(seed) }, config)
    const text = await svc.buildConsolidatedText('t1', WEEK, 'pr1')
    expect(text).toContain('*Fermentou! — Semana de 2025-08-04*') // sem doc do tenant → brand.name
    expect(text).toContain('Ana')
    expect(text).toContain('2 un Pão')
    expect(text).not.toContain('Café') // item de outro produtor
    expect(text).not.toContain('Bia') // rascunho não conta
  })

  it('sem pedidos do produtor devolve null', async () => {
    const svc = createOrdersService({ repo: createMemoryRepo(seed) }, config)
    expect(await svc.buildConsolidatedText('t1', '2025-08-11', 'pr1')).toBeNull()
  })

  it('getProducerMessages devolve o contato CRU (quem normaliza é o adapter)', async () => {
    const svc = createOrdersService({ repo: createMemoryRepo(seed) }, config)
    const msgs = await svc.getProducerMessages('t1', WEEK)
    expect(msgs).toHaveLength(1)
    expect(msgs[0]!.contact).toBe('(11) 99999-0000')
  })

  it('lockWeek grava o lock e fecha extras; isWeekLocked enxerga', async () => {
    const repo = createMemoryRepo({ ...seed, tenants: { t1: { name: 'Loja', extrasAberto: true } } })
    const svc = createOrdersService({ repo }, config)
    expect(await svc.isWeekLocked('t1', WEEK)).toBe(false)
    await svc.lockWeek('t1', WEEK)
    expect(await svc.isWeekLocked('t1', WEEK)).toBe(true)
    expect((await repo.getDoc<{ extrasAberto: boolean }>('tenants', 't1'))!.extrasAberto).toBe(false)
  })
})

describe('createOrdersRouter', () => {
  const fakePayments = () => {
    const calls: unknown[] = []
    return {
      calls,
      svc: { upsertPaymentsForOrder: async (...args: unknown[]) => { calls.push(args) } } as unknown as PaymentService,
    }
  }
  const fakeZap = () => {
    const sent: Array<{ phone: string; message: string }> = []
    const whatsapp: WhatsAppGateway = { async sendMessage(phone, message) { sent.push({ phone, message }) } }
    return { sent, whatsapp }
  }

  it('com extras fechados, membro leva 403 e admin passa', async () => {
    const base = {
      ...seed,
      tenants: { t1: { name: 'Loja', extrasAberto: false } },
      users: { comum: { acesso: ['consumidor'] }, adm: { acesso: ['admin'] } },
    }
    const body = { method: 'POST', body: JSON.stringify({ userId: 'x', userName: 'X', tenantId: 't1', weekId: WEEK, items: [], status: 'rascunho' }), ...json }
    for (const [uid, status] of [['comum', 403], ['adm', 201]] as const) {
      const { svc } = fakePayments()
      const { whatsapp } = fakeZap()
      const repo = createMemoryRepo(base)
      const router = createOrdersRouter({ repo, payments: svc, orders: createOrdersService({ repo }, config), whatsapp })
      await withRouter('/api/orders', router, async (get) => {
        expect((await get('/api/orders', body)).status).toBe(status)
      }, { uid })
    }
  })

  it('POST enviado dispara upsert de pagamentos com o mês do weekId', async () => {
    const { svc, calls } = fakePayments()
    const { whatsapp } = fakeZap()
    const repo = createMemoryRepo(seed)
    const router = createOrdersRouter({ repo, payments: svc, orders: createOrdersService({ repo }, config), whatsapp })
    await withRouter('/api/orders', router, async (get) => {
      await get('/api/orders', {
        method: 'POST',
        body: JSON.stringify({ userId: 'u9', userName: 'Zé', tenantId: 't1', weekId: WEEK, items: [], status: 'enviado' }),
        ...json,
      })
      expect(calls).toEqual([['u9', 'Zé', 't1', '2025-08']])
    })
  })

  it('send-consolidated-whatsapp envia ao produtor e tranca a semana', async () => {
    const { svc } = fakePayments()
    const { whatsapp, sent } = fakeZap()
    const repo = createMemoryRepo({ ...seed, tenants: { t1: { name: 'Loja', extrasAberto: true } } })
    const orders = createOrdersService({ repo }, config)
    const router = createOrdersRouter({ repo, payments: svc, orders, whatsapp })
    await withRouter('/api/orders', router, async (get) => {
      const res = await get('/api/orders/send-consolidated-whatsapp', {
        method: 'POST', body: JSON.stringify({ tenantId: 't1', weekId: WEEK, producerId: 'pr1' }), ...json,
      })
      expect(await res.json()).toEqual({ success: true })
      expect(sent).toHaveLength(1)
      expect(sent[0]!.phone).toBe('(11) 99999-0000') // cru — adapter é quem normaliza
      expect(await orders.isWeekLocked('t1', WEEK)).toBe(true)
    })
  })
})
