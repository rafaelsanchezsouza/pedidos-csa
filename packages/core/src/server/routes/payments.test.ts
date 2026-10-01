import { describe, it, expect } from 'vitest'
import { createPaymentsRouter } from './payments'
import { createPaymentService } from '../services/payments'
import { createMemoryRepo } from '../memoryRepo'
import { withRouter, json, adminDeTeste } from '../testutil'
import type { AppConfig } from '../../config.js'
import type { PaymentDoc } from '../../types.js'

const config: AppConfig = {
  brand: { name: 'X', tagline: 't', icon: '/i.png', colors: { light: {}, dark: {} } },
  vocabulary: { pickupLabel: 'Retirada', otpAppName: 'X', deliveryFeeLabel: 'Entrega' },
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

describe('correcao de valor — só admin, histórico do servidor', () => {
  const fatura = () => ({
    p1: {
      userId: 'm1', userName: 'Ana', tenantId: 't1', month: '2026-09',
      producerName: 'Entrega', amount: 48, verified: false, dateCreated: 'd', dateUpdated: 'd',
    },
  })
  const comAdmin = () => createMemoryRepo({
    users: { ...adminDeTeste('t1'), m1: { name: 'Ana', tenantId: 't1', acesso: ['consumidor'] } },
    payments: fatura(),
  })
  const rota = (repo: ReturnType<typeof createMemoryRepo>) =>
    createPaymentsRouter({ repo, payments: createPaymentService({ repo }, config) })
  const corrigir = (get: (p: string, i?: RequestInit) => Promise<Response>, body: object) =>
    get('/api/payments/p1/correcao', { method: 'POST', body: JSON.stringify(body), ...json })

  it('grava o valor novo, marca corrigido e carimba o de-para', async () => {
    const repo = comAdmin()
    await withRouter('/api/payments', rota(repo), async (get) => {
      const r = await corrigir(get, { amount: 36, motivo: 'faltou uma entrega' })
      expect(r.status).toBe(200)
    })
    const doc = (await repo.getDoc<PaymentDoc>('payments', 'p1'))!
    expect(doc).toMatchObject({ amount: 36, amountOriginal: 48, corrigido: true })
    expect(doc.correcoes).toEqual([
      { de: 48, para: 36, por: 'u1', em: expect.any(String), motivo: 'faltou uma entrega' },
    ])
  })

  it('duas correções: o original continua sendo o valor GERADO e o histórico acumula', async () => {
    const repo = comAdmin()
    await withRouter('/api/payments', rota(repo), async (get) => {
      await corrigir(get, { amount: 36 })
      await corrigir(get, { amount: 24 })
    })
    const doc = (await repo.getDoc<PaymentDoc>('payments', 'p1'))!
    expect(doc).toMatchObject({ amount: 24, amountOriginal: 48 })
    expect(doc.correcoes!.map((c) => [c.de, c.para])).toEqual([[48, 36], [36, 24]])
    // sem motivo a chave nem existe: Firestore recusa `undefined`
    expect(doc.correcoes![0]).not.toHaveProperty('motivo')
  })

  it('desfazer volta ao valor gerado, destrava e REGISTRA a volta', async () => {
    const repo = comAdmin()
    await withRouter('/api/payments', rota(repo), async (get) => {
      await corrigir(get, { amount: 36 })
      const r = await get('/api/payments/p1/correcao', { method: 'DELETE' })
      expect(r.status).toBe(200)
    })
    const doc = (await repo.getDoc<PaymentDoc>('payments', 'p1'))!
    expect(doc).toMatchObject({ amount: 48, corrigido: false })
    expect(doc.correcoes).toHaveLength(2)
    expect(doc.correcoes![1]).toMatchObject({ de: 36, para: 48, motivo: 'Correção desfeita' })
  })

  it('sem correção não há o que desfazer', async () => {
    const repo = comAdmin()
    await withRouter('/api/payments', rota(repo), async (get) => {
      expect((await get('/api/payments/p1/correcao', { method: 'DELETE' })).status).toBe(400)
    })
  })

  it('valor inválido é 400 e não escreve nada', async () => {
    const repo = comAdmin()
    await withRouter('/api/payments', rota(repo), async (get) => {
      expect((await corrigir(get, { amount: -1 })).status).toBe(400)
      expect((await corrigir(get, { amount: 'muito' })).status).toBe(400)
      expect((await corrigir(get, {})).status).toBe(400)
    })
    expect((await repo.getDoc<PaymentDoc>('payments', 'p1'))!).toMatchObject({ amount: 48 })
    expect((await repo.getDoc<PaymentDoc>('payments', 'p1'))!.corrigido).toBeUndefined()
  })

  it('o dono da fatura não corrige a si mesmo', async () => {
    const repo = comAdmin()
    await withRouter('/api/payments', rota(repo), async (get) => {
      expect((await corrigir(get, { amount: 0 })).status).toBe(403)
      expect((await get('/api/payments/p1/correcao', { method: 'DELETE' })).status).toBe(403)
    }, { uid: 'm1' })
    expect((await repo.getDoc<PaymentDoc>('payments', 'p1'))!.amount).toBe(48)
  })

  it('fornecedor confere, mas não remarca valor', async () => {
    const repo = createMemoryRepo({
      users: { u1: { name: 'Sítio', tenantId: 't1', acesso: ['fornecedor'], producerId: 'pr1' } },
      payments: fatura(),
    })
    await withRouter('/api/payments', rota(repo), async (get) => {
      expect((await corrigir(get, { amount: 1 })).status).toBe(403)
    })
  })

  it('PUT /:id não é atalho para mexer no valor nem forjar o histórico', async () => {
    const repo = comAdmin()
    await withRouter('/api/payments', rota(repo), async (get) => {
      const r = await get('/api/payments/p1', {
        method: 'PUT',
        body: JSON.stringify({ verified: true, amount: 1, corrigido: true, correcoes: [{ de: 9, para: 1, por: 'x', em: 'y' }] }),
        ...json,
      })
      expect(r.status).toBe(200)
    })
    const doc = (await repo.getDoc<PaymentDoc>('payments', 'p1'))!
    expect(doc.verified).toBe(true) // o que o PUT faz continua funcionando
    expect(doc.amount).toBe(48)
    expect(doc.corrigido).toBeUndefined()
    expect(doc.correcoes).toBeUndefined()
  })
})
