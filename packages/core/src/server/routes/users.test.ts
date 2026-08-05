import { describe, it, expect } from 'vitest'
import { createUsersRouter, type UsersDeps } from './users'
import { createMemoryRepo } from '../memoryRepo'
import { withRouter, json } from '../testutil'
import type { AuthGateway, WhatsAppGateway } from '../repo.js'
import type { AppConfig } from '../../config.js'

const config: AppConfig = {
  brand: { name: 'Fermentou!', tagline: 't', icon: '/i.png', colors: { light: {}, dark: {} } },
  vocabulary: { pickupLabel: 'Retirada', otpAppName: 'Fermentou!' },
  capabilities: { offeringSource: 'from-catalog', multiTenant: false, paymentStrategy: 'monthly-post' },
  tenantDefaults: {
    quotaTerm: 'Fornada', quotas: [{ name: 'F', price: 65 }], quotaInteira: 65, quotaMeia: 40,
    roleDefaults: [], dueDay: 10, orderSendDay: 2, orderSendHour: 6, weekChangeDay: 0,
  },
}

// Fakes das portas: gravam o que foi chamado para as asserções.
function fakes() {
  const sent: Array<{ phone: string; message: string }> = []
  const authCalls: Record<string, unknown[]> = { created: [], disabled: [], deleted: [] }
  let uidSeq = 0
  const auth: AuthGateway = {
    async createUser(email, password) { authCalls.created!.push({ email, password }); return { uid: `uid${++uidSeq}` } },
    async updateUser(uid, u) { authCalls.disabled!.push({ uid, ...u }) },
    async getUserEmail() { return 'a@b.c' },
    async generatePasswordResetLink(email) { return `https://reset/${email}` },
    async deleteUser(uid) { authCalls.deleted!.push(uid) },
  }
  const whatsapp: WhatsAppGateway = {
    async sendMessage(phone, message) { sent.push({ phone, message }) },
  }
  return { auth, whatsapp, sent, authCalls }
}

const member = {
  name: 'Ana', address: '', contact: '5511999', frequency: 'semanal', deliveryType: 'retirada',
  tenantId: 't1', acesso: ['consumidor'],
}

describe('createUsersRouter', () => {
  it('GET /me devolve o doc do usuário autenticado; 404 sem doc', async () => {
    const repo = createMemoryRepo({ users: { u1: { name: 'Ana', tenantId: 't1' } } })
    const { auth, whatsapp } = fakes()
    const router = createUsersRouter({ repo, auth, whatsapp }, config)
    await withRouter('/api/users', router, async (get) => {
      expect(((await (await get('/api/users/me')).json()) as { name: string }).name).toBe('Ana')
    })
    await withRouter('/api/users', router, async (get) => {
      expect((await get('/api/users/me')).status).toBe(404)
    }, { uid: 'fantasma' })
  })

  it('create-member cria login + doc e manda boas-vindas com o nome do tenant', async () => {
    const repo = createMemoryRepo({ tenants: { t1: { name: 'Padoca da Vila' } } })
    const { auth, whatsapp, sent } = fakes()
    const router = createUsersRouter({ repo, auth, whatsapp, appUrl: 'https://app.x' }, config)
    await withRouter('/api/users', router, async (get) => {
      const res = await get('/api/users/create-member', {
        method: 'POST', body: JSON.stringify({ email: 'ana@x.com', ...member }), ...json,
      })
      expect(res.status).toBe(201)
      const created = await res.json()
      expect(created.id).toBe('uid1')
      expect(created.mustChangePassword).toBe(true)
      expect((await repo.getDoc<{ email: string }>('users', 'uid1'))!.email).toBe('ana@x.com')
      // welcome roda async (não bloqueia a resposta) — dá uma folga mínima
      await new Promise((r) => setTimeout(r, 20))
      expect(sent).toHaveLength(1)
      expect(sent[0]!.message).toContain('Padoca da Vila')
      expect(sent[0]!.message).toContain('https://app.x')
    })
  })

  it('sem doc do tenant, boas-vindas cai no nome do app (fim do ?? CSA)', async () => {
    const repo = createMemoryRepo()
    const { auth, whatsapp, sent } = fakes()
    await withRouter('/api/users', createUsersRouter({ repo, auth, whatsapp }, config), async (get) => {
      await get('/api/users/create-member', {
        method: 'POST', body: JSON.stringify({ email: 'ana@x.com', ...member }), ...json,
      })
      await new Promise((r) => setTimeout(r, 20))
      expect(sent[0]!.message).toContain('Fermentou!')
    })
  })

  it('reorder-delivery valida ids da tenant e grava deliveryOrder = posição', async () => {
    const repo = createMemoryRepo({
      users: {
        a: { name: 'A', tenantId: 't1' }, b: { name: 'B', tenantId: 't1' },
        fora: { name: 'X', tenantId: 't2' },
      },
    })
    const { auth, whatsapp } = fakes()
    const router = createUsersRouter({ repo, auth, whatsapp }, config)
    await withRouter('/api/users', router, async (get) => {
      const bad = await get('/api/users/reorder-delivery', {
        method: 'PUT', body: JSON.stringify({ orderedIds: ['a', 'fora'] }), ...json,
      })
      expect(bad.status).toBe(400)
      const ok = await get('/api/users/reorder-delivery', {
        method: 'PUT', body: JSON.stringify({ orderedIds: ['b', 'a'] }), ...json,
      })
      expect(await ok.json()).toEqual({ updated: 2 })
      expect((await repo.getDoc<{ deliveryOrder: number }>('users', 'b'))!.deliveryOrder).toBe(0)
      expect((await repo.getDoc<{ deliveryOrder: number }>('users', 'a'))!.deliveryOrder).toBe(1)
    }, { tenantId: 't1' })
  })

  it('rename-quota cascateia só na tenant', async () => {
    const repo = createMemoryRepo({
      users: {
        a: { name: 'A', tenantId: 't1', quota: 'Meia' },
        b: { name: 'B', tenantId: 't1', quota: 'Inteira' },
        fora: { name: 'X', tenantId: 't2', quota: 'Meia' },
      },
    })
    const { auth, whatsapp } = fakes()
    await withRouter('/api/users', createUsersRouter({ repo, auth, whatsapp }, config), async (get) => {
      const res = await get('/api/users/rename-quota', {
        method: 'PUT', body: JSON.stringify({ from: 'Meia', to: 'Fornada Leve' }), ...json,
      })
      expect(await res.json()).toEqual({ updated: 1 })
      expect((await repo.getDoc<{ quota: string }>('users', 'a'))!.quota).toBe('Fornada Leve')
      expect((await repo.getDoc<{ quota: string }>('users', 'fora'))!.quota).toBe('Meia')
    }, { tenantId: 't1' })
  })

  it('reset-password usa o nome do app da config na mensagem', async () => {
    const repo = createMemoryRepo({ users: { u9: { name: 'Ana', contact: '5511', tenantId: 't1' } } })
    const { auth, whatsapp, sent } = fakes()
    await withRouter('/api/users', createUsersRouter({ repo, auth, whatsapp }, config), async (get) => {
      const res = await get('/api/users/u9/reset-password', { method: 'POST', body: '{}', ...json })
      const body = await res.json()
      expect(body.whatsappSent).toBe(true)
      expect(sent[0]!.message).toContain('no Fermentou!')
      expect(body.link).toBe('https://reset/a@b.c')
    })
  })

  it('DELETE remove o login e soft-deleta o doc', async () => {
    const repo = createMemoryRepo({ users: { u9: { name: 'Ana', tenantId: 't1' } } })
    const { auth, whatsapp, authCalls } = fakes()
    await withRouter('/api/users', createUsersRouter({ repo, auth, whatsapp }, config), async (get) => {
      await get('/api/users/u9', { method: 'DELETE' })
      expect(authCalls.deleted).toEqual(['u9'])
      const doc = await repo.getDoc<{ deleted: boolean; disabled: boolean }>('users', 'u9')
      expect(doc).toMatchObject({ deleted: true, disabled: true })
    })
  })
})
