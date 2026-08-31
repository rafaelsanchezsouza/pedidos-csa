import { describe, it, expect } from 'vitest'
import { createPaymentsRouter } from './payments'
import { createPaymentService } from '../services/payments'
import { createMemoryRepo } from '../memoryRepo'
import { withRouter, json } from '../testutil'
import type { AppConfig } from '../../config.js'
import type { PaymentDoc } from '../../types.js'

const config: AppConfig = {
  brand: { name: 'X', tagline: 't', icon: '/i.png', colors: { light: {}, dark: {} } },
  vocabulary: { pickupLabel: 'Retirada', otpAppName: 'X' },
  capabilities: { offeringSource: 'from-catalog', multiTenant: false, paymentStrategy: 'monthly-post' },
  tenantDefaults: {
    quotaTerm: 'Cota', quotas: [{ name: 'Cota inteira', price: 65 }],
    quotaInteira: 65, quotaMeia: 40, roleDefaults: [],
    dueDay: 10, orderSendDay: 2, orderSendHour: 6, weekChangeDay: 0, utcOffset: -3,
  },
}
describe('POST /:id/comprovante — comprovante por semana (acolhida)', () => {
  const fatura = () => ({
    p1: { userId: 'u1', userName: 'Novo', tenantId: 't1', month: '2026-09', producerName: 'Cota', amount: 130, verified: false },
  })

  it('anexa o comprovante da semana e mantém proofUrl para as telas antigas', async () => {
    const repo = createMemoryRepo({ users: { u1: { name: 'Novo', tenantId: 't1' } }, payments: fatura() })
    const router = createPaymentsRouter({ repo, payments: createPaymentService({ repo }, config) })
    await withRouter('/api/payments', router, async (get) => {
      const r = await get('/api/payments/p1/comprovante', {
        method: 'POST', body: JSON.stringify({ weekId: '2026-09-07', url: 'http://s/1.jpg' }), ...json,
      })
      expect(r.status).toBe(200)
    })
    const doc = await repo.getDoc<PaymentDoc>('payments', 'p1')
    expect(doc!.proofs).toEqual([{ weekId: '2026-09-07', url: 'http://s/1.jpg', dateUploaded: expect.any(String) }])
    expect(doc!.proofUrl).toBe('http://s/1.jpg')
  })

  it('reenviar a mesma semana substitui, em vez de duplicar a linha', async () => {
    const repo = createMemoryRepo({ users: { u1: { name: 'Novo', tenantId: 't1' } }, payments: fatura() })
    const router = createPaymentsRouter({ repo, payments: createPaymentService({ repo }, config) })
    await withRouter('/api/payments', router, async (get) => {
      const envia = (weekId: string, url: string) => get('/api/payments/p1/comprovante', {
        method: 'POST', body: JSON.stringify({ weekId, url }), ...json,
      })
      await envia('2026-09-14', 'http://s/b.jpg')
      await envia('2026-09-07', 'http://s/a.jpg')
      await envia('2026-09-07', 'http://s/a-corrigido.jpg')
    })
    const doc = await repo.getDoc<PaymentDoc>('payments', 'p1')
    expect(doc!.proofs!.map((p) => [p.weekId, p.url])).toEqual([
      ['2026-09-07', 'http://s/a-corrigido.jpg'],
      ['2026-09-14', 'http://s/b.jpg'],
    ])
  })

  it('membro não anexa na fatura de outro', async () => {
    const repo = createMemoryRepo({
      users: { u1: { name: 'Novo', tenantId: 't1' }, u2: { name: 'Outro', tenantId: 't1' } },
      payments: fatura(),
    })
    const router = createPaymentsRouter({ repo, payments: createPaymentService({ repo }, config) })
    await withRouter('/api/payments', router, async (get) => {
      const r = await get('/api/payments/p1/comprovante', {
        method: 'POST', body: JSON.stringify({ weekId: '2026-09-07', url: 'http://s/1.jpg' }), ...json,
      })
      expect(r.status).toBe(403)
    }, { uid: 'u2' })
  })
})
