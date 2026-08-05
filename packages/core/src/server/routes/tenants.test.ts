import { describe, it, expect } from 'vitest'
import express from 'express'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { createTenantsRouter } from './tenants'
import { createMemoryRepo } from '../memoryRepo'
import type { Repo } from '../repo.js'
import type { AppConfig } from '../../config.js'

const baseConfig: AppConfig = {
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

// Sobe o app numa porta efêmera e devolve um fetch já apontado para ela — o piloto é
// verificado como servidor http de verdade, não chamando handlers na mão.
async function withApp(
  repo: Repo,
  fn: (get: (path: string, init?: RequestInit) => Promise<Response>) => Promise<void>,
  { uid = 'u1', config = baseConfig }: { uid?: string; config?: AppConfig } = {},
): Promise<void> {
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => { req.user = { uid, email: '' }; next() })
  app.use('/api/tenants', createTenantsRouter({ repo }, config))
  const server = http.createServer(app)
  await new Promise<void>((r) => server.listen(0, r))
  const { port } = server.address() as AddressInfo
  try {
    await fn((path, init) => fetch(`http://127.0.0.1:${port}${path}`, init))
  } finally {
    await new Promise((r) => server.close(r))
  }
}

const json = { headers: { 'content-type': 'application/json' } }

describe('createTenantsRouter — GET', () => {
  const seed = {
    users: {
      sa: { acesso: ['superadmin'], tenantId: 't1' },
      u1: { acesso: ['consumidor'], tenantId: 't2' },
      semTenant: { acesso: ['consumidor'] },
    },
    tenants: {
      t1: { name: 'Loja A', adminId: 'sa', dateCreated: 'd' },
      t2: { name: 'Loja B', adminId: 'sa', dateCreated: 'd' },
    },
  }

  it('superadmin lista todos', async () => {
    await withApp(createMemoryRepo(seed), async (get) => {
      const tenants = await (await get('/api/tenants')).json()
      expect(tenants.map((t: { id: string }) => t.id).sort()).toEqual(['t1', 't2'])
    }, { uid: 'sa' })
  })

  it('usuário comum vê só o próprio tenant', async () => {
    await withApp(createMemoryRepo(seed), async (get) => {
      const tenants = await (await get('/api/tenants')).json()
      expect(tenants.map((t: { id: string }) => t.id)).toEqual(['t2'])
    })
  })

  it('usuário sem tenant recebe lista vazia', async () => {
    await withApp(createMemoryRepo(seed), async (get) => {
      expect(await (await get('/api/tenants')).json()).toEqual([])
    }, { uid: 'semTenant' })
  })

  it('GET /:id inexistente é 404', async () => {
    await withApp(createMemoryRepo(seed), async (get) => {
      expect((await get('/api/tenants/nao-existe')).status).toBe(404)
    })
  })
})

describe('createTenantsRouter — POST', () => {
  it('semeia o tenant com os defaults da config (fim dos hardcodes)', async () => {
    const repo = createMemoryRepo()
    await withApp(repo, async (get) => {
      const res = await get('/api/tenants', { method: 'POST', body: JSON.stringify({ name: 'Nova' }), ...json })
      expect(res.status).toBe(201)
      const t = await res.json()
      expect(t).toMatchObject({
        name: 'Nova', adminId: 'u1', quotaTerm: 'Fornada',
        quotas: [{ name: 'Fornada Completa', price: 65 }], quotaInteira: 65, quotaMeia: 40, dueDay: 10,
      })
    })
  })

  it('from-catalog semeia a própria loja como fornecedor único', async () => {
    const repo = createMemoryRepo()
    await withApp(repo, async (get) => {
      await get('/api/tenants', { method: 'POST', body: JSON.stringify({ name: 'Nova' }), ...json })
      const producers = await repo.listDocs<{ name: string }>('producers')
      expect(producers).toHaveLength(1)
      expect(producers[0]!.name).toBe('Nova')
    })
  })

  it('parse-message não semeia fornecedor (são cadastrados de verdade)', async () => {
    const repo = createMemoryRepo()
    const config: AppConfig = {
      ...baseConfig,
      capabilities: { ...baseConfig.capabilities, offeringSource: 'parse-message', messageParser: 'fuzzy' },
    }
    await withApp(repo, async (get) => {
      await get('/api/tenants', { method: 'POST', body: JSON.stringify({ name: 'Nova' }), ...json })
      expect(await repo.listDocs('producers')).toHaveLength(0)
    }, { config })
  })
})

describe('createTenantsRouter — PUT', () => {
  const seed = {
    users: {
      adm: { acesso: ['admin'], tenantId: 't1' },
      outro: { acesso: ['admin'], tenantId: 't2' },
      comum: { acesso: ['consumidor'], tenantId: 't1' },
    },
    tenants: { t1: { name: 'Loja', adminId: 'adm', dateCreated: 'd' } },
  }

  it('admin do tenant atualiza; quotas são sanitizadas', async () => {
    const repo = createMemoryRepo(seed)
    await withApp(repo, async (get) => {
      const res = await get('/api/tenants/t1', {
        method: 'PUT',
        body: JSON.stringify({ quotaTerm: ' Cesta ', quotas: [{ name: ' Cheia ', price: '80' }, { name: '', price: 1 }, null] }),
        ...json,
      })
      expect(res.status).toBe(200)
      const t = await res.json()
      expect(t.quotaTerm).toBe('Cesta')
      expect(t.quotas).toEqual([{ name: 'Cheia', price: 80 }])
    }, { uid: 'adm' })
  })

  it('admin de OUTRO tenant e usuário comum levam 403', async () => {
    for (const uid of ['outro', 'comum']) {
      await withApp(createMemoryRepo(seed), async (get) => {
        const res = await get('/api/tenants/t1', { method: 'PUT', body: JSON.stringify({ dueDay: 5 }), ...json })
        expect(res.status).toBe(403)
      }, { uid })
    }
  })
})
