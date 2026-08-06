import { describe, it, expect } from 'vitest'
import { createOfferingsRouter } from './offerings'
import { createMemoryRepo } from '../memoryRepo'
import { withRouter, json } from '../testutil'
import type { AppConfig } from '../../config.js'

const catalogConfig: AppConfig = {
  brand: { name: 'X', tagline: 't', icon: '/i.png', colors: { light: {}, dark: {} } },
  vocabulary: { pickupLabel: 'Retirada', otpAppName: 'X' },
  capabilities: { offeringSource: 'from-catalog', multiTenant: false, paymentStrategy: 'monthly-post' },
  tenantDefaults: {
    quotaTerm: 'Fornada',
    quotas: [{ name: 'Fornada Completa', price: 65 }],
    quotaInteira: 65,
    quotaMeia: 40,
    roleDefaults: [],
    dueDay: 10,
    orderSendDay: 2,
    orderSendHour: 6,
    weekChangeDay: 0,
  },
}

const parseConfig: AppConfig = {
  ...catalogConfig,
  capabilities: { ...catalogConfig.capabilities, offeringSource: 'parse-message', messageParser: 'fuzzy' },
}

describe('createOfferingsRouter — GET', () => {
  it('filtra por tenant e semana', async () => {
    const repo = createMemoryRepo({
      weekly_offerings: {
        o1: { tenantId: 't1', producerId: 'pr1', weekStart: '2026-08-03', items: [] },
        o2: { tenantId: 't1', producerId: 'pr1', weekStart: '2026-07-27', items: [] },
        o3: { tenantId: 't2', producerId: 'pr2', weekStart: '2026-08-03', items: [] },
      },
    })
    await withRouter('/api/offerings', createOfferingsRouter({ repo }, catalogConfig), async (get) => {
      const all = await (await get('/api/offerings')).json()
      expect(all.map((o: { id: string }) => o.id).sort()).toEqual(['o1', 'o2'])
      const semana = await (await get('/api/offerings?weekId=2026-08-03')).json()
      expect(semana.map((o: { id: string }) => o.id)).toEqual(['o1'])
    }, { tenantId: 't1' })
  })
})

describe('createOfferingsRouter — POST (upsert)', () => {
  const base = {
    producerId: 'pr1', producerName: 'Sítio', tenantId: 't1', weekStart: '2026-08-03',
  }

  it('cria produto novo no catálogo, atualiza preço do existente e deduplica', async () => {
    const repo = createMemoryRepo({
      products: { p1: { name: 'Alface', unit: 'unid', price: 3, producerId: 'pr1', tenantId: 't1' } },
    })
    await withRouter('/api/offerings', createOfferingsRouter({ repo }, catalogConfig), async (get) => {
      const res = await get('/api/offerings', {
        method: 'POST',
        body: JSON.stringify({ ...base, items: [
          { productId: 'p1', productName: 'alfacinha', unit: 'unid', price: 4, type: 'fixo' },
          { productId: 'p1', productName: 'Alface', unit: 'unid', price: 4, type: 'fixo' },
          { productId: 'novo', productName: 'Rúcula', unit: 'maço', price: 5, type: 'extra' },
        ] }),
        ...json,
      })
      expect(res.status).toBe(201)
      const offering = await res.json()
      // dedup + nome normalizado pelo catálogo
      expect(offering.items).toHaveLength(2)
      expect(offering.items[0]).toMatchObject({ productId: 'p1', productName: 'Alface', price: 4 })
      // preço do catálogo atualizado; produto novo criado
      const products = await repo.listDocs<{ name: string; price: number }>('products')
      expect(products.find((p) => p.id === 'p1')!.price).toBe(4)
      expect(products.some((p) => p.name === 'Rúcula')).toBe(true)
    })
  })

  it('substitui a oferta da semana e remove dos pedidos os produtos que saíram', async () => {
    const repo = createMemoryRepo({
      products: {
        p1: { name: 'Alface', unit: 'unid', price: 4, producerId: 'pr1', tenantId: 't1' },
        p2: { name: 'Couve', unit: 'maço', price: 5, producerId: 'pr1', tenantId: 't1' },
      },
      weekly_offerings: {
        o1: { ...base, items: [
          { productId: 'p1', productName: 'Alface', unit: 'unid', price: 4, type: 'fixo' },
          { productId: 'p2', productName: 'Couve', unit: 'maço', price: 5, type: 'fixo' },
        ], dateCreated: 'd' },
      },
      orders: {
        ped1: { tenantId: 't1', weekId: '2026-08-03', items: [
          { productId: 'p1', offeringId: 'o1' },
          { productId: 'p2', offeringId: 'o1' },
        ] },
      },
    })
    await withRouter('/api/offerings', createOfferingsRouter({ repo }, catalogConfig), async (get) => {
      await get('/api/offerings', {
        method: 'POST',
        body: JSON.stringify({ ...base, items: [
          { productId: 'p1', productName: 'Alface', unit: 'unid', price: 4, type: 'fixo' },
        ] }),
        ...json,
      })
      const offerings = await repo.listDocs('weekly_offerings')
      expect(offerings).toHaveLength(1) // substituiu, não criou outra
      const order = await repo.getDoc<{ items: Array<{ productId: string }> }>('orders', 'ped1')
      expect(order!.items.map((i) => i.productId)).toEqual(['p1'])
    })
  })

  it('nova oferta reabre extras fechados do tenant', async () => {
    const repo = createMemoryRepo({ tenants: { t1: { name: 'L', extrasAberto: false } } })
    await withRouter('/api/offerings', createOfferingsRouter({ repo }, catalogConfig), async (get) => {
      await get('/api/offerings', {
        method: 'POST',
        body: JSON.stringify({ ...base, items: [] }),
        ...json,
      })
      const tenant = await repo.getDoc<{ extrasAberto?: boolean }>('tenants', 't1')
      expect(tenant!.extrasAberto).toBe(true)
    })
  })
})

describe('createOfferingsRouter — fallback', () => {
  it('copia a última oferta de quem não tem na semana, descartando rawMessage', async () => {
    const repo = createMemoryRepo({
      weekly_offerings: {
        velha: { producerId: 'pr1', producerName: 'Sítio', tenantId: 't1', weekStart: '2026-07-27',
          items: [{ productId: 'p1', productName: 'Alface', unit: 'unid', price: 4, type: 'fixo' }],
          rawMessage: 'texto original', dateCreated: 'd' },
        deOutro: { producerId: 'pr2', producerName: 'Horta', tenantId: 't1', weekStart: '2026-08-03',
          items: [], dateCreated: 'd' },
      },
    })
    await withRouter('/api/offerings', createOfferingsRouter({ repo }, catalogConfig), async (get) => {
      const res = await get('/api/offerings/fallback', {
        method: 'POST',
        body: JSON.stringify({ weekStart: '2026-08-03', tenantId: 't1' }),
        ...json,
      })
      expect(res.status).toBe(201)
      const created = await res.json()
      expect(created).toHaveLength(1)
      expect(created[0]).toMatchObject({ producerId: 'pr1', weekStart: '2026-08-03' })
      expect(created[0].rawMessage).toBeUndefined()
    })
  })
})

describe('createOfferingsRouter — capacidades', () => {
  it('from-catalog: gera oferta por produtor a partir do catálogo ativo; /parse não existe', async () => {
    const repo = createMemoryRepo({
      products: {
        p1: { name: 'Pão', unit: 'unid', price: 12, producerId: 'pr1', tenantId: 't1', type: 'fixo' },
        p2: { name: 'Café', unit: 'pct', price: 30, producerId: 'pr2', tenantId: 't1' },
        inativo: { name: 'Broa', unit: 'unid', price: 8, producerId: 'pr1', tenantId: 't1', ativo: false },
      },
      producers: {
        pr1: { name: 'Padaria', tenantId: 't1' },
        pr2: { name: 'Torrefação', tenantId: 't1' },
      },
    })
    await withRouter('/api/offerings', createOfferingsRouter({ repo }, catalogConfig), async (get) => {
      const res = await get('/api/offerings/from-catalog', {
        method: 'POST',
        body: JSON.stringify({ weekStart: '2026-08-03', tenantId: 't1' }),
        ...json,
      })
      expect(res.status).toBe(201)
      const created = await res.json()
      expect(created).toHaveLength(2)
      const padaria = created.find((o: { producerId: string }) => o.producerId === 'pr1')
      expect(padaria.producerName).toBe('Padaria')
      expect(padaria.items.map((i: { productName: string }) => i.productName)).toEqual(['Pão'])
      expect(padaria.items[0].type).toBe('fixo')

      expect((await get('/api/offerings/parse', { method: 'POST', body: '{}', ...json })).status).toBe(404)
    })
  })

  it('parse-message + fuzzy: extrai itens e enriquece preço pelo catálogo; /from-catalog não existe', async () => {
    const repo = createMemoryRepo({
      products: { p1: { name: 'Alface', unit: 'unid', price: 4.5, producerId: 'pr1', tenantId: 't1' } },
    })
    await withRouter('/api/offerings', createOfferingsRouter({ repo }, parseConfig), async (get) => {
      const res = await get('/api/offerings/parse', {
        method: 'POST',
        body: JSON.stringify({ rawMessage: 'Alface 4,00\nRúcula 3,00', tenantId: 't1' }),
        ...json,
      })
      expect(res.status).toBe(200)
      const parsed = await res.json()
      // Alface casa com o catálogo → preço do catálogo vence; Rúcula fica com o da mensagem
      expect(parsed).toEqual([
        { name: 'Alface', unit: 'unid', price: 4.5, type: 'extra', matchedProductId: 'p1' },
        { name: 'Rúcula', unit: 'unid', price: 3, type: 'extra' },
      ])

      expect((await get('/api/offerings/from-catalog', { method: 'POST', body: '{}', ...json })).status).toBe(404)
    })
  })

  it("messageParser='openai' sem adapter injetado falha no boot (não em runtime)", () => {
    const config: AppConfig = {
      ...catalogConfig,
      capabilities: { ...catalogConfig.capabilities, offeringSource: 'parse-message', messageParser: 'openai' },
    }
    expect(() => createOfferingsRouter({ repo: createMemoryRepo() }, config)).toThrow(/parseMessage/)
  })

  it("messageParser='openai' usa o adapter injetado", async () => {
    const config: AppConfig = {
      ...catalogConfig,
      capabilities: { ...catalogConfig.capabilities, offeringSource: 'parse-message', messageParser: 'openai' },
    }
    const repo = createMemoryRepo()
    const parseMessage = async () => [{ name: 'Via adapter', unit: 'unid', price: 1, type: 'extra' as const }]
    await withRouter('/api/offerings', createOfferingsRouter({ repo, parseMessage }, config), async (get) => {
      const res = await get('/api/offerings/parse', {
        method: 'POST',
        body: JSON.stringify({ rawMessage: 'x', tenantId: 't1' }),
        ...json,
      })
      expect(await res.json()).toEqual([{ name: 'Via adapter', unit: 'unid', price: 1, type: 'extra' }])
    })
  })
})
