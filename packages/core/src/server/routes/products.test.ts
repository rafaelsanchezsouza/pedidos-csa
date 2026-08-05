import { describe, it, expect } from 'vitest'
import { createProductsRouter } from './products'
import { createProducersRouter } from './producers'
import { createIssuesRouter } from './issues'
import { createMemoryRepo } from '../memoryRepo'
import { withRouter, json } from '../testutil'

describe('createProductsRouter', () => {
  it('GET filtra por tenant (query ou req.tenantId)', async () => {
    const repo = createMemoryRepo({
      products: {
        p1: { name: 'Pão', tenantId: 't1' },
        p2: { name: 'Café', tenantId: 't2' },
      },
    })
    await withRouter('/api/products', createProductsRouter({ repo }), async (get) => {
      const viaQuery = await (await get('/api/products?tenantId=t1')).json()
      expect(viaQuery.map((p: { name: string }) => p.name)).toEqual(['Pão'])
      const viaReq = await (await get('/api/products')).json()
      expect(viaReq.map((p: { name: string }) => p.name)).toEqual(['Pão'])
    }, { tenantId: 't1' })
  })

  it('import-batch devolve um resultado por linha, sem abortar no erro', async () => {
    const repo = createMemoryRepo()
    await withRouter('/api/products', createProductsRouter({ repo }), async (get) => {
      const res = await get('/api/products/import-batch', {
        method: 'POST',
        body: JSON.stringify({ products: [
          { name: 'Pão', unit: 'un', price: 10, producerId: 'pr1', tenantId: 't1' },
          { name: 'SemFornecedor', unit: 'un', price: 5, tenantId: 't1' },
        ] }),
        ...json,
      })
      const { results } = await res.json()
      expect(results).toEqual([
        { name: 'Pão', success: true },
        { name: 'SemFornecedor', success: false, error: expect.stringContaining('obrigatórios') },
      ])
      expect(await repo.listDocs('products')).toHaveLength(1)
    })
  })
})

describe('createProducersRouter', () => {
  it('GET filtra por tenant; sem tenant é 400', async () => {
    const repo = createMemoryRepo({ producers: { f1: { name: 'Sítio', tenantId: 't1' } } })
    await withRouter('/api/producers', createProducersRouter({ repo }), async (get) => {
      expect((await get('/api/producers')).status).toBe(400)
      const list = await (await get('/api/producers?tenantId=t1')).json()
      expect(list.map((p: { name: string }) => p.name)).toEqual(['Sítio'])
    })
  })
})

describe('createIssuesRouter', () => {
  it('sem título é 400; sem integração configurada é 500', async () => {
    await withRouter('/api/issues', createIssuesRouter(), async (get) => {
      expect((await get('/api/issues', { method: 'POST', body: JSON.stringify({}), ...json })).status).toBe(400)
      const res = await get('/api/issues', { method: 'POST', body: JSON.stringify({ title: 'bug' }), ...json })
      expect(res.status).toBe(500)
      expect((await res.json()).message).toContain('GitHub')
    })
  })
})
