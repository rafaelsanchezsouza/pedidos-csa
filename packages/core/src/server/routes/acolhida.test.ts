import { describe, it, expect } from 'vitest'
import { createAcolhidaRouter } from './acolhida'
import { createPaymentService } from '../services/payments'
import { createMemoryRepo } from '../memoryRepo'
import { withRouter, json } from '../testutil'
import type { AppConfig } from '../../config.js'
import type { AcolhidaWeekDoc, PaymentDoc } from '../../types.js'

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

// Semana longe no futuro: o prazo (segunda 23:59 BRT) ainda está aberto quando o teste roda.
const SEMANA_ABERTA = '2099-08-31'
const SEMANA_FECHADA = '2020-08-31'

const novato = (extra: object = {}) => ({
  name: 'Novo', tenantId: 't1', quota: 'Cota inteira', frequency: 'semanal',
  deliveryType: 'retirada', acolhidaExpiry: '2099-12-31', ...extra,
})

function monta(users: Record<string, object>) {
  const repo = createMemoryRepo({ users })
  const payments = createPaymentService({ repo }, config)
  return { repo, router: createAcolhidaRouter({ repo, payments }, config) }
}

const post = (get: (p: string, i?: RequestInit) => Promise<Response>, body: unknown) =>
  get('/api/acolhida', { method: 'POST', body: JSON.stringify(body), ...json })

describe('createAcolhidaRouter', () => {
  it('confirmar a semana grava a escolha e já recalcula a fatura', async () => {
    const { repo, router } = monta({ u1: novato() })
    await withRouter('/api/acolhida', router, async (get) => {
      const r = await post(get, { weekId: SEMANA_ABERTA, confirmado: true, deliveryType: 'entrega' })
      expect(r.status).toBe(200)
    })
    const semanas = await repo.listDocs<AcolhidaWeekDoc>('acolhidaWeeks')
    expect(semanas[0]).toMatchObject({ userId: 'u1', weekId: SEMANA_ABERTA, confirmado: true, deliveryType: 'entrega' })
    const cota = (await repo.listDocs<PaymentDoc>('payments')).find((p) => p.producerName === 'Cota')
    expect(cota).toMatchObject({ amount: 65, month: '2099-08' })   // 1 semana confirmada
    expect(cota).not.toHaveProperty('dueDate')
  })

  it('desmarcar zera o valor da semana', async () => {
    const { repo, router } = monta({ u1: novato() })
    await withRouter('/api/acolhida', router, async (get) => {
      await post(get, { weekId: SEMANA_ABERTA, confirmado: true, deliveryType: 'retirada' })
      await post(get, { weekId: SEMANA_ABERTA, confirmado: false })
    })
    const cota = (await repo.listDocs<PaymentDoc>('payments')).find((p) => p.producerName === 'Cota')
    expect(cota).toMatchObject({ amount: 0 })
    expect((await repo.listDocs<AcolhidaWeekDoc>('acolhidaWeeks'))).toHaveLength(1)  // guarda o "não"
  })

  it('depois do prazo o membro recebe 409 explicando', async () => {
    const { router } = monta({ u1: novato() })
    await withRouter('/api/acolhida', router, async (get) => {
      const r = await post(get, { weekId: SEMANA_FECHADA, confirmado: true, deliveryType: 'entrega' })
      expect(r.status).toBe(409)
      expect((await r.json()).message).toContain('segunda-feira')
    })
  })

  it('admin corrige depois do prazo', async () => {
    const { router } = monta({
      u1: novato(),
      adm: { name: 'Admin', tenantId: 't1', acesso: ['admin'] },
    })
    await withRouter('/api/acolhida', router, async (get) => {
      const r = await post(get, { weekId: SEMANA_FECHADA, confirmado: true, deliveryType: 'entrega', userId: 'u1' })
      expect(r.status).toBe(200)
    }, { uid: 'adm' })
  })

  it('membro não confirma pelo outro', async () => {
    const { router } = monta({ u1: novato(), u2: novato({ name: 'Outro' }) })
    await withRouter('/api/acolhida', router, async (get) => {
      const r = await post(get, { weekId: SEMANA_ABERTA, confirmado: true, deliveryType: 'entrega', userId: 'u2' })
      expect(r.status).toBe(403)
    }, { uid: 'u1' })
  })

  it('confirmar sem dizer o tipo de entrega é 400', async () => {
    const { router } = monta({ u1: novato() })
    await withRouter('/api/acolhida', router, async (get) => {
      expect((await post(get, { weekId: SEMANA_ABERTA, confirmado: true })).status).toBe(400)
      expect((await post(get, { weekId: 'agosto', confirmado: true, deliveryType: 'entrega' })).status).toBe(400)
    })
  })

  it('GET devolve a confirmação, o prazo e se ainda dá tempo', async () => {
    const { router } = monta({ u1: novato() })
    await withRouter('/api/acolhida', router, async (get) => {
      const aberta = await (await get(`/api/acolhida/${SEMANA_ABERTA}`)).json()
      expect(aberta).toMatchObject({ confirmacao: null, aberto: true })
      expect(aberta.prazo).toBe('2099-09-01T02:59:59.999Z')          // 23:59:59 BRT
      const fechada = await (await get(`/api/acolhida/${SEMANA_FECHADA}`)).json()
      expect(fechada.aberto).toBe(false)
    })
  })
})
