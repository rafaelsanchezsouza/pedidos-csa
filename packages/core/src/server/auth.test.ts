// A política de autorização do engine, escrita como casos negativos: cada teste aqui é um
// ataque que funcionava até 2026-08-21, quando o gate existia só no frontend.
import { describe, it, expect } from 'vitest'
import { createUsersRouter } from './routes/users.js'
import { createProductsRouter } from './routes/products.js'
import { createProducersRouter } from './routes/producers.js'
import { createPaymentsRouter } from './routes/payments.js'
import { createPaymentService } from './services/payments.js'
import { createMemoryRepo } from './memoryRepo.js'
import { withRouter, json } from './testutil.js'
import type { AuthGateway, WhatsAppGateway } from './repo.js'
import type { AppConfig } from '../config.js'

const config: AppConfig = {
  brand: { name: 'X', tagline: 't', icon: '/i.png', colors: { light: {}, dark: {} } },
  vocabulary: { pickupLabel: 'Retirada', otpAppName: 'X' },
  capabilities: { offeringSource: 'from-catalog', multiTenant: true, paymentStrategy: 'monthly-post' },
  tenantDefaults: {
    quotaTerm: 'Cota', quotas: [{ name: 'C', price: 65 }], quotaInteira: 65, quotaMeia: 40,
    roleDefaults: [], dueDay: 10, orderSendDay: 2, orderSendHour: 6, weekChangeDay: 0,
  },
}

const auth: AuthGateway = {
  async createUser() { return { uid: 'novo' } },
  async updateUser() {},
  async getUserEmail() { return 'a@b.c' },
  async generatePasswordResetLink() { return 'https://reset' },
  async createCustomToken() { return 'tok' },
  async deleteUser() {},
}
const whatsapp: WhatsAppGateway = { async sendMessage() {} }

// Elenco fixo: um consumidor comum, um fornecedor com escopo, um admin — todos na tenant t1.
const elenco = {
  consumidor: { name: 'Ana', tenantId: 't1', acesso: ['consumidor'] },
  fornecedor: { name: 'Sítio', tenantId: 't1', acesso: ['fornecedor'], producerId: 'pr1' },
  admin: { name: 'Chefe', tenantId: 't1', acesso: ['admin'] },
  adminDeOutra: { name: 'Alheio', tenantId: 't2', acesso: ['admin'] },
}

describe('autorização — dados pessoais', () => {
  it('consumidor não lista os membros da tenant (nome, e-mail, telefone, endereço)', async () => {
    const repo = createMemoryRepo({ users: elenco })
    const router = createUsersRouter({ repo, auth, whatsapp }, config)
    await withRouter('/api/users', router, async (get) => {
      expect((await get('/api/users?tenantId=t1')).status).toBe(403)
    }, { uid: 'consumidor', tenantId: 't1' })
  })

  it('admin lista normalmente', async () => {
    const repo = createMemoryRepo({ users: elenco })
    const router = createUsersRouter({ repo, auth, whatsapp }, config)
    await withRouter('/api/users', router, async (get) => {
      const res = await get('/api/users?tenantId=t1')
      expect(res.status).toBe(200)
      expect((await res.json()).length).toBe(3)
    }, { uid: 'admin', tenantId: 't1' })
  })
})

// A produção da CSA nunca migrou o campo `acesso`: lá ele é string ('admin'), não lista, e há
// registro com o rótulo legado `role: 'superadmin'`. Se os predicados não aceitassem essas
// formas, a trava trancaria os próprios administradores para fora.
describe('autorização — formas legadas da CSA', () => {
  const legado = {
    adminString: { name: 'Admin CSA', tenantId: 't1', acesso: 'admin' },
    superLegado: { name: 'Super', tenantId: 't9', role: 'superadmin' },
    consumidorString: { name: 'Membro', tenantId: 't1', acesso: 'user' },
  }

  it("acesso: 'admin' (string) administra normalmente", async () => {
    const repo = createMemoryRepo({ users: legado })
    const router = createUsersRouter({ repo, auth, whatsapp }, config)
    await withRouter('/api/users', router, async (get) => {
      expect((await get('/api/users?tenantId=t1')).status).toBe(200)
    }, { uid: 'adminString', tenantId: 't1' })
  })

  it("role: 'superadmin' (rótulo legado) atravessa tenants", async () => {
    const repo = createMemoryRepo({ users: legado })
    const router = createUsersRouter({ repo, auth, whatsapp }, config)
    await withRouter('/api/users', router, async (get) => {
      expect((await get('/api/users?tenantId=t1')).status).toBe(200)
    }, { uid: 'superLegado', tenantId: 't1' })
  })

  it("acesso: 'user' (string legada de consumidor) continua barrado", async () => {
    const repo = createMemoryRepo({ users: legado })
    const router = createUsersRouter({ repo, auth, whatsapp }, config)
    await withRouter('/api/users', router, async (get) => {
      expect((await get('/api/users?tenantId=t1')).status).toBe(403)
    }, { uid: 'consumidorString', tenantId: 't1' })
  })
})

describe('autorização — escalada de privilégio', () => {
  it('PUT /me não deixa o membro se promover a admin', async () => {
    const repo = createMemoryRepo({ users: elenco })
    const router = createUsersRouter({ repo, auth, whatsapp }, config)
    await withRouter('/api/users', router, async (get) => {
      const res = await get('/api/users/me', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Ana Maria', acesso: ['admin'], tenantId: 't2' }),
        ...json,
      })
      expect(res.status).toBe(200)
      const doc = await repo.getDoc<{ name: string; acesso: string[]; tenantId: string }>('users', 'consumidor')
      expect(doc!.name).toBe('Ana Maria')     // o campo do perfil passa
      expect(doc!.acesso).toEqual(['consumidor']) // o privilégio, não
      expect(doc!.tenantId).toBe('t1')
    }, { uid: 'consumidor', tenantId: 't1' })
  })

  it('admin de outra tenant não edita usuário desta, nem mandando o header dela', async () => {
    const repo = createMemoryRepo({ users: elenco })
    const router = createUsersRouter({ repo, auth, whatsapp }, config)
    await withRouter('/api/users', router, async (get) => {
      const res = await get('/api/users/consumidor', {
        method: 'PUT', body: JSON.stringify({ name: 'Invadida' }), ...json,
      })
      expect(res.status).toBe(403)
      expect((await repo.getDoc<{ name: string }>('users', 'consumidor'))!.name).toBe('Ana')
    }, { uid: 'adminDeOutra', tenantId: 't1' })
  })
})

describe('autorização — catálogo', () => {
  const produtos = {
    doPr1: { name: 'Alface', unit: 'un', price: 3, producerId: 'pr1', tenantId: 't1', dateUpdated: 'd' },
    doPr2: { name: 'Couve', unit: 'un', price: 4, producerId: 'pr2', tenantId: 't1', dateUpdated: 'd' },
    deOutraTenant: { name: 'Pão', unit: 'un', price: 9, producerId: 'pr9', tenantId: 't2', dateUpdated: 'd' },
  }

  it('consumidor não cria produto', async () => {
    const repo = createMemoryRepo({ users: elenco })
    await withRouter('/api/products', createProductsRouter({ repo }), async (get) => {
      const res = await get('/api/products', {
        method: 'POST',
        body: JSON.stringify({ name: 'Grátis', unit: 'un', price: 0, producerId: 'pr1', tenantId: 't1' }),
        ...json,
      })
      expect(res.status).toBe(403)
      expect(await repo.listDocs('products')).toHaveLength(0)
    }, { uid: 'consumidor', tenantId: 't1' })
  })

  it('fornecedor edita o produto do próprio produtor, mas não o do vizinho', async () => {
    const repo = createMemoryRepo({ users: elenco, products: produtos })
    await withRouter('/api/products', createProductsRouter({ repo }), async (get) => {
      const meu = await get('/api/products/doPr1', { method: 'PUT', body: JSON.stringify({ price: 5 }), ...json })
      expect(meu.status).toBe(200)

      const alheio = await get('/api/products/doPr2', { method: 'PUT', body: JSON.stringify({ price: 1 }), ...json })
      expect(alheio.status).toBe(403)
      expect((await repo.getDoc<{ price: number }>('products', 'doPr2'))!.price).toBe(4)
    }, { uid: 'fornecedor', tenantId: 't1' })
  })

  it('admin não alcança produto de outra tenant nem mandando o header dela', async () => {
    const repo = createMemoryRepo({ users: elenco, products: produtos })
    await withRouter('/api/products', createProductsRouter({ repo }), async (get) => {
      const res = await get('/api/products/deOutraTenant', {
        method: 'DELETE',
      })
      expect(res.status).toBe(403)
      expect(await repo.getDoc('products', 'deOutraTenant')).not.toBeNull()
    }, { uid: 'admin', tenantId: 't2' })
  })

  it('import-batch autoriza linha a linha: a de fora falha, as de dentro passam', async () => {
    const repo = createMemoryRepo({ users: elenco })
    await withRouter('/api/products', createProductsRouter({ repo }), async (get) => {
      const res = await get('/api/products/import-batch', {
        method: 'POST',
        body: JSON.stringify({ products: [
          { name: 'Meu', unit: 'un', price: 1, producerId: 'pr1', tenantId: 't1' },
          { name: 'Do vizinho', unit: 'un', price: 1, producerId: 'pr2', tenantId: 't1' },
          { name: 'De outra tenant', unit: 'un', price: 1, producerId: 'pr1', tenantId: 't2' },
        ] }),
        ...json,
      })
      const { results } = await res.json()
      expect(results.map((r: { success: boolean }) => r.success)).toEqual([true, false, false])
      expect(await repo.listDocs('products')).toHaveLength(1)
    }, { uid: 'fornecedor', tenantId: 't1' })
  })

  it('só admin cria fornecedor', async () => {
    const repo = createMemoryRepo({ users: elenco })
    await withRouter('/api/producers', createProducersRouter({ repo }), async (get) => {
      const res = await get('/api/producers', {
        method: 'POST', body: JSON.stringify({ name: 'Novo', contact: '', tenantId: 't1' }), ...json,
      })
      expect(res.status).toBe(403)
    }, { uid: 'fornecedor', tenantId: 't1' })
  })
})

describe('autorização — faturas', () => {
  const pagamentos = {
    minha: { userId: 'consumidor', userName: 'Ana', tenantId: 't1', month: '2026-08', producerName: 'Cota',
             amount: 65, verified: false, dateCreated: 'd', dateUpdated: 'd' },
    deOutro: { userId: 'outro', userName: 'B', tenantId: 't1', month: '2026-08', producerName: 'Cota',
               amount: 65, verified: false, dateCreated: 'd', dateUpdated: 'd' },
  }
  const router = (repo: ReturnType<typeof createMemoryRepo>) =>
    createPaymentsRouter({ repo, payments: createPaymentService({ repo }, config) }, config)

  it('o dono anexa comprovante, mas NÃO marca a própria fatura como paga', async () => {
    const repo = createMemoryRepo({ users: elenco, payments: pagamentos })
    await withRouter('/api/payments', router(repo), async (get) => {
      const comprovante = await get('/api/payments/minha', {
        method: 'PUT', body: JSON.stringify({ proofUrl: 'https://foto' }), ...json,
      })
      expect(comprovante.status).toBe(200)

      const golpe = await get('/api/payments/minha', {
        method: 'PUT', body: JSON.stringify({ verified: true }), ...json,
      })
      expect(golpe.status).toBe(403)
      expect((await repo.getDoc<{ verified: boolean }>('payments', 'minha'))!.verified).toBe(false)
    }, { uid: 'consumidor', tenantId: 't1' })
  })

  it('o dono não mexe na fatura de outro membro', async () => {
    const repo = createMemoryRepo({ users: elenco, payments: pagamentos })
    await withRouter('/api/payments', router(repo), async (get) => {
      const res = await get('/api/payments/deOutro', {
        method: 'PUT', body: JSON.stringify({ proofUrl: 'https://foto' }), ...json,
      })
      expect(res.status).toBe(403)
    }, { uid: 'consumidor', tenantId: 't1' })
  })

  it('admin marca como verificada', async () => {
    const repo = createMemoryRepo({ users: elenco, payments: pagamentos })
    await withRouter('/api/payments', router(repo), async (get) => {
      const res = await get('/api/payments/minha', {
        method: 'PUT', body: JSON.stringify({ verified: true }), ...json,
      })
      expect(res.status).toBe(200)
      expect((await repo.getDoc<{ verified: boolean }>('payments', 'minha'))!.verified).toBe(true)
    }, { uid: 'admin', tenantId: 't1' })
  })

  it('o membro segue vendo as PRÓPRIAS faturas (a trava não pode fechar isto)', async () => {
    const repo = createMemoryRepo({ users: elenco, payments: pagamentos })
    await withRouter('/api/payments', router(repo), async (get) => {
      const res = await get('/api/payments/my?tenantId=t1&month=2026-08')
      expect(res.status).toBe(200)
      expect((await res.json()).map((p: { userId: string }) => p.userId)).toEqual(['consumidor'])
    }, { uid: 'consumidor', tenantId: 't1' })
  })

  it('consumidor não lista as faturas da tenant inteira', async () => {
    const repo = createMemoryRepo({ users: elenco, payments: pagamentos })
    await withRouter('/api/payments', router(repo), async (get) => {
      expect((await get('/api/payments?tenantId=t1&month=2026-08')).status).toBe(403)
    }, { uid: 'consumidor', tenantId: 't1' })
  })

  it('consumidor não dispara a geração de cotas da tenant', async () => {
    const repo = createMemoryRepo({ users: elenco })
    await withRouter('/api/payments', router(repo), async (get) => {
      const res = await get('/api/payments/quota/all', {
        method: 'POST', body: JSON.stringify({ tenantId: 't1', month: '2026-08' }), ...json,
      })
      expect(res.status).toBe(403)
    }, { uid: 'consumidor', tenantId: 't1' })
  })
})
