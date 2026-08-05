import { describe, it, expect } from 'vitest'
import { createWhatsappAuthRouter } from './whatsappAuth'
import { createMemoryRepo } from '../memoryRepo'
import { withRouter, json } from '../testutil'
import type { AuthGateway, WhatsAppGateway } from '../repo.js'
import type { AppConfig } from '../../config.js'

const config: AppConfig = {
  brand: { name: 'Fermentou!', tagline: 't', icon: '/i.png', colors: { light: {}, dark: {} } },
  vocabulary: { pickupLabel: 'Retirada', otpAppName: 'Fermentou!' },
  capabilities: { offeringSource: 'from-catalog', multiTenant: false, paymentStrategy: 'monthly-post' },
  tenantDefaults: {
    quotaTerm: 'F', quotas: [{ name: 'F', price: 65 }], quotaInteira: 65, quotaMeia: 40,
    roleDefaults: [], dueDay: 10, orderSendDay: 2, orderSendHour: 6, weekChangeDay: 0,
  },
}

const auth: AuthGateway = {
  async createUser() { return { uid: 'x' } },
  async updateUser() {},
  async getUserEmail() { return null },
  async generatePasswordResetLink() { return '' },
  async createCustomToken(uid) { return `token-${uid}` },
  async deleteUser() {},
}

const seed = {
  users: { u1: { name: 'Ana', email: 'ana@x.com', contact: '11 98888-7777', tenantId: 't1' } },
  tenants: { t1: { name: 'Padoca' } },
}

function zap() {
  const sent: Array<{ phone: string; message: string }> = []
  const whatsapp: WhatsAppGateway = { async sendMessage(phone, message) { sent.push({ phone, message }) } }
  return { sent, whatsapp }
}

describe('createWhatsappAuthRouter', () => {
  it('request-otp por email: envia código com o nome do tenant; fluxo completo autentica', async () => {
    const repo = createMemoryRepo(seed)
    const { sent, whatsapp } = zap()
    const router = createWhatsappAuthRouter({ repo, auth, whatsapp }, config)
    await withRouter('/api/auth/whatsapp', router, async (get) => {
      const res = await get('/api/auth/whatsapp/request-otp', {
        method: 'POST', body: JSON.stringify({ identifier: 'Ana@X.com' }), ...json,
      })
      expect(await res.json()).toEqual({ success: true })
      expect(sent).toHaveLength(1)
      expect(sent[0]!.phone).toBe('5511988887777')
      expect(sent[0]!.message).toContain('ao Padoca')
      const code = sent[0]!.message.match(/\*(\d{6})\*/)![1]

      const verify = await get('/api/auth/whatsapp/verify-otp', {
        method: 'POST', body: JSON.stringify({ identifier: '11 98888-7777', code }), ...json,
      })
      expect(await verify.json()).toEqual({ customToken: 'token-u1' })
      // código é de uso único
      const again = await get('/api/auth/whatsapp/verify-otp', {
        method: 'POST', body: JSON.stringify({ identifier: '11 98888-7777', code }), ...json,
      })
      expect(again.status).toBe(400)
    })
  })

  it('não revela se o usuário existe; rate-limit de 60s não reenvia', async () => {
    const repo = createMemoryRepo(seed)
    const { sent, whatsapp } = zap()
    const router = createWhatsappAuthRouter({ repo, auth, whatsapp }, config)
    await withRouter('/api/auth/whatsapp', router, async (get) => {
      const desconhecido = await get('/api/auth/whatsapp/request-otp', {
        method: 'POST', body: JSON.stringify({ identifier: 'nao@existe.com' }), ...json,
      })
      expect(await desconhecido.json()).toEqual({ success: true })
      expect(sent).toHaveLength(0)

      await get('/api/auth/whatsapp/request-otp', { method: 'POST', body: JSON.stringify({ identifier: 'ana@x.com' }), ...json })
      await get('/api/auth/whatsapp/request-otp', { method: 'POST', body: JSON.stringify({ identifier: 'ana@x.com' }), ...json })
      expect(sent).toHaveLength(1) // segundo pedido dentro de 60s não reenvia
    })
  })

  it('código errado é 400', async () => {
    const repo = createMemoryRepo(seed)
    const { whatsapp } = zap()
    const router = createWhatsappAuthRouter({ repo, auth, whatsapp }, config)
    await withRouter('/api/auth/whatsapp', router, async (get) => {
      await get('/api/auth/whatsapp/request-otp', { method: 'POST', body: JSON.stringify({ identifier: 'ana@x.com' }), ...json })
      const res = await get('/api/auth/whatsapp/verify-otp', {
        method: 'POST', body: JSON.stringify({ identifier: 'ana@x.com', code: '000000' }), ...json,
      })
      expect(res.status).toBe(400)
    })
  })
})
