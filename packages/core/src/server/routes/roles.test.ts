import { describe, it, expect } from 'vitest'
import { createRolesRouter } from './roles'
import { createMemoryRepo } from '../memoryRepo'
import { withRouter, json } from '../testutil'
import type { AppConfig } from '../../config.js'

const config = (roleDefaults: string[]): AppConfig => ({
  brand: { name: 'X', tagline: 't', icon: '/i.png', colors: { light: {}, dark: {} } },
  vocabulary: { pickupLabel: 'Colmeia', otpAppName: 'X' },
  capabilities: { offeringSource: 'parse-message', messageParser: 'fuzzy', multiTenant: false, paymentStrategy: 'monthly-post' },
  tenantDefaults: {
    quotaTerm: 'Cota', quotas: [{ name: 'Cota inteira', price: 65 }], quotaInteira: 65, quotaMeia: 40,
    roleDefaults, dueDay: 10, orderSendDay: 2, orderSendHour: 6, weekChangeDay: 0,
  },
})

describe('createRolesRouter', () => {
  it('GET semeia os defaults da config que faltarem (fim do DEFAULTS hardcoded)', async () => {
    const repo = createMemoryRepo({ roles: { r1: { name: 'colmeia', tenantId: 't1' } } })
    const router = createRolesRouter({ repo }, config(['colmeia', 'coagricultor']))
    await withRouter('/api/roles', router, async (get) => {
      const roles = await (await get('/api/roles?tenantId=t1')).json()
      expect(roles.map((r: { name: string }) => r.name).sort()).toEqual(['coagricultor', 'colmeia'])
    })
  })

  it('GET com roleDefaults vazio não semeia nada (padaria)', async () => {
    const repo = createMemoryRepo()
    await withRouter('/api/roles', createRolesRouter({ repo }, config([])), async (get) => {
      expect(await (await get('/api/roles?tenantId=t1')).json()).toEqual([])
    })
  })

  it('POST duplicado é 409; sem tenant é 400', async () => {
    const repo = createMemoryRepo({ roles: { r1: { name: 'cozinha', tenantId: 't1' } } })
    const router = createRolesRouter({ repo }, config([]))
    await withRouter('/api/roles', router, async (get) => {
      const dup = await get('/api/roles', { method: 'POST', body: JSON.stringify({ name: 'cozinha' }), ...json })
      expect(dup.status).toBe(409)
    }, { tenantId: 't1' })
    await withRouter('/api/roles', router, async (get) => {
      const semTenant = await get('/api/roles', { method: 'POST', body: JSON.stringify({ name: 'x' }), ...json })
      expect(semTenant.status).toBe(400)
    })
  })

  it('DELETE de função padrão é 400; de função livre é 204', async () => {
    const repo = createMemoryRepo({
      roles: { r1: { name: 'colmeia', tenantId: 't1' }, r2: { name: 'cozinha', tenantId: 't1' } },
    })
    const router = createRolesRouter({ repo }, config(['colmeia']))
    await withRouter('/api/roles', router, async (get) => {
      expect((await get('/api/roles/r1', { method: 'DELETE' })).status).toBe(400)
      expect((await get('/api/roles/r2', { method: 'DELETE' })).status).toBe(204)
      expect(await repo.getDoc('roles', 'r2')).toBeNull()
    })
  })
})
