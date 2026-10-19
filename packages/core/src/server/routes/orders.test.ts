// Autorização de pedidos, escrita como casos negativos: cada teste é um ataque que funcionava
// até 2026-10 (HANDOFF §6 #13) — o router só olhava o gate de extras.
import { describe, it, expect } from 'vitest'
import { createOrdersRouter } from './orders'
import { createOrdersService } from '../services/orders'
import { createPaymentService } from '../services/payments'
import { createMemoryRepo } from '../memoryRepo'
import { withRouter, json } from '../testutil'
import type { AppConfig } from '../../config.js'
import type { OrderDoc } from '../../types.js'
import type { WhatsAppGateway } from '../repo.js'

const config: AppConfig = {
  brand: { name: 'X', tagline: 't', icon: '/i.png', colors: { light: {}, dark: {} } },
  vocabulary: { pickupLabel: 'Retirada', otpAppName: 'X', deliveryFeeLabel: 'Entrega' },
  capabilities: { offeringSource: 'from-catalog', multiTenant: true, paymentStrategy: 'monthly-post' },
  tenantDefaults: {
    quotaTerm: 'Cota', quotas: [{ name: 'C', price: 65 }], quotaInteira: 65, quotaMeia: 40,
    roleDefaults: [], dueDay: 10, orderSendDay: 2, orderSendHour: 6, weekChangeDay: 0, utcOffset: -3,
  },
}
const whatsapp: WhatsAppGateway = { async sendMessage() {} }

const SEMANA = '2026-10-12'
const pedido = (userId: string, extra: Partial<OrderDoc> = {}) => ({
  userId, userName: userId, tenantId: 't1', weekId: SEMANA, items: [], status: 'rascunho' as const,
  dateCreated: 'd', dateUpdated: 'd', ...extra,
})

const repoBase = (extra: Record<string, Record<string, unknown>> = {}) => createMemoryRepo({
  users: {
    ana: { name: 'Ana', tenantId: 't1', acesso: ['consumidor'] },
    bia: { name: 'Bia', tenantId: 't1', acesso: ['consumidor'] },
    admin: { name: 'Chefe', tenantId: 't1', acesso: ['admin'] },
    adminDeOutra: { name: 'Alheio', tenantId: 't2', acesso: ['admin'] },
  },
  tenants: { t1: { name: 'T1', extrasAberto: true } },
  orders: { daBia: pedido('bia') },
  ...extra,
})

const rota = (repo: ReturnType<typeof createMemoryRepo>) => createOrdersRouter({
  repo, whatsapp,
  payments: createPaymentService({ repo }, config),
  orders: createOrdersService({ repo }, config),
}, config)

type Get = (p: string, i?: RequestInit) => Promise<Response>
const post = (get: Get, body: object) => get('/api/orders', { method: 'POST', body: JSON.stringify(body), ...json })
const put = (get: Get, id: string, body: object) =>
  get(`/api/orders/${id}`, { method: 'PUT', body: JSON.stringify(body), ...json })
const recebido = (get: Get, body: object) =>
  get('/api/orders/recebido', { method: 'PATCH', body: JSON.stringify(body), ...json })

describe('pedidos — só o dono ou o admin da tenant escreve', () => {
  it('membro cria e edita o próprio pedido', async () => {
    const repo = repoBase()
    await withRouter('/api/orders', rota(repo), async (get) => {
      const r = await post(get, pedido('ana'))
      expect(r.status).toBe(201)
      const { id } = await r.json()
      expect((await put(get, id, { doacao: true })).status).toBe(200)
    }, { uid: 'ana', tenantId: 't1' })
  })

  it('membro não cria pedido em nome de outro', async () => {
    const repo = repoBase()
    await withRouter('/api/orders', rota(repo), async (get) => {
      expect((await post(get, pedido('bia'))).status).toBe(403)
    }, { uid: 'ana', tenantId: 't1' })
    expect(await repo.listDocs('orders', [['userId', '==', 'bia']])).toHaveLength(1)
  })

  it('membro não edita o pedido de outro pelo id', async () => {
    const repo = repoBase()
    await withRouter('/api/orders', rota(repo), async (get) => {
      expect((await put(get, 'daBia', { items: [{ productId: 'x' }] })).status).toBe(403)
    }, { uid: 'ana', tenantId: 't1' })
    expect((await repo.getDoc<OrderDoc>('orders', 'daBia'))!.items).toEqual([])
  })

  it('admin de outra tenant não escreve aqui', async () => {
    const repo = repoBase()
    await withRouter('/api/orders', rota(repo), async (get) => {
      expect((await post(get, pedido('bia'))).status).toBe(403)
      expect((await put(get, 'daBia', { doacao: true })).status).toBe(403)
    }, { uid: 'adminDeOutra', tenantId: 't1' })
  })

  it('admin da tenant escreve pedido de membro (Entregas, Consolidado Geral)', async () => {
    const repo = repoBase()
    await withRouter('/api/orders', rota(repo), async (get) => {
      expect((await post(get, pedido('ana', { suspensa: true }))).status).toBe(201)
      expect((await put(get, 'daBia', { incluida: true })).status).toBe(200)
    }, { uid: 'admin', tenantId: 't1' })
    expect((await repo.getDoc<OrderDoc>('orders', 'daBia'))!.incluida).toBe(true)
  })

  it('PUT não move o pedido de dono, tenant ou semana — nem para o admin', async () => {
    const repo = repoBase()
    await withRouter('/api/orders', rota(repo), async (get) => {
      expect((await put(get, 'daBia', { userId: 'ana', tenantId: 't2', weekId: '2020-01-06', doacao: true })).status).toBe(200)
    }, { uid: 'admin', tenantId: 't1' })
    const doc = (await repo.getDoc<OrderDoc>('orders', 'daBia'))!
    expect([doc.userId, doc.tenantId, doc.weekId, doc.doacao]).toEqual(['bia', 't1', SEMANA, true])
  })

  it('membro não marca o próprio pedido como recebido nem se inclui na entrega', async () => {
    const repo = repoBase({ orders: { daAna: pedido('ana') } })
    await withRouter('/api/orders', rota(repo), async (get) => {
      expect((await put(get, 'daAna', { recebido: true, incluida: true, doacao: true })).status).toBe(200)
      const r = await post(get, { ...pedido('ana'), weekId: '2026-10-19', recebido: true, suspensa: true })
      expect(r.status).toBe(201)
    }, { uid: 'ana', tenantId: 't1' })
    const editado = (await repo.getDoc<OrderDoc>('orders', 'daAna'))!
    expect([editado.recebido, editado.incluida, editado.doacao]).toEqual([undefined, undefined, true])
    const [criado] = await repo.listDocs<OrderDoc>('orders', [['weekId', '==', '2026-10-19']])
    expect([criado!.recebido, criado!.suspensa]).toEqual([undefined, undefined])
  })

  it('PUT em pedido inexistente é 404, não um doc criado do nada', async () => {
    const repo = repoBase()
    await withRouter('/api/orders', rota(repo), async (get) => {
      expect((await put(get, 'naoExiste', { doacao: true })).status).toBe(404)
    }, { uid: 'admin', tenantId: 't1' })
  })
})

describe('semana bloqueada (consolidado enviado) — 403 para quem não é admin', () => {
  const comLock = () => repoBase({
    orders: { daAna: pedido('ana') },
    week_locks: { [`t1_${SEMANA}`]: { tenantId: 't1', weekId: SEMANA, lockedAt: 'x' } },
  })

  it('membro não cria nem edita', async () => {
    const repo = comLock()
    await withRouter('/api/orders', rota(repo), async (get) => {
      expect((await post(get, pedido('ana'))).status).toBe(403)
      expect((await put(get, 'daAna', { doacao: true })).status).toBe(403)
    }, { uid: 'ana', tenantId: 't1' })
  })

  it('admin segue editando (ajuste depois do envio)', async () => {
    const repo = comLock()
    await withRouter('/api/orders', rota(repo), async (get) => {
      expect((await put(get, 'daAna', { doacao: true })).status).toBe(200)
    }, { uid: 'admin', tenantId: 't1' })
  })

  it('outra semana continua aberta', async () => {
    const repo = comLock()
    await withRouter('/api/orders', rota(repo), async (get) => {
      expect((await post(get, { ...pedido('ana'), weekId: '2026-10-19' })).status).toBe(201)
    }, { uid: 'ana', tenantId: 't1' })
  })
})

describe('PATCH /recebido — só admin da tenant', () => {
  const corpo = { userId: 'bia', userName: 'Bia', weekId: SEMANA, tenantId: 't1', recebido: true }

  it('membro não marca recebido (nem cria pedido alheio por aqui)', async () => {
    const repo = repoBase({ orders: {} })
    await withRouter('/api/orders', rota(repo), async (get) => {
      expect((await recebido(get, corpo)).status).toBe(403)
      expect((await recebido(get, { ...corpo, userId: 'ana' })).status).toBe(403)
    }, { uid: 'ana', tenantId: 't1' })
    expect(await repo.listDocs('orders')).toEqual([])
  })

  it('admin de outra tenant também não', async () => {
    const repo = repoBase()
    await withRouter('/api/orders', rota(repo), async (get) => {
      expect((await recebido(get, corpo)).status).toBe(403)
    }, { uid: 'adminDeOutra', tenantId: 't1' })
  })

  it('admin da tenant marca', async () => {
    const repo = repoBase()
    await withRouter('/api/orders', rota(repo), async (get) => {
      expect((await recebido(get, corpo)).status).toBe(200)
    }, { uid: 'admin', tenantId: 't1' })
    expect((await repo.getDoc<OrderDoc>('orders', 'daBia'))!.recebido).toBe(true)
  })
})
