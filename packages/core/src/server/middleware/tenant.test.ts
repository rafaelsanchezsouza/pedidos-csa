import { describe, it, expect } from 'vitest'
import type { Request, Response } from 'express'
import { createTenantMiddleware } from './tenant'
import { createMemoryRepo } from '../memoryRepo'

const run = async (req: Partial<Request>) => {
  const repo = createMemoryRepo({ users: { u1: { tenantId: 't-do-doc' } } })
  const mw = createTenantMiddleware({ repo })
  let called = false
  await mw(req as Request, {} as Response, () => { called = true })
  expect(called).toBe(true)
  return req as Request
}

describe('createTenantMiddleware', () => {
  it('header x-tenant-id vence', async () => {
    const req = await run({ headers: { 'x-tenant-id': 't-header' }, user: { uid: 'u1', email: '' } })
    expect(req.tenantId).toBe('t-header')
  })

  it('sem header, resolve pelo doc do usuário', async () => {
    const req = await run({ headers: {}, user: { uid: 'u1', email: '' } })
    expect(req.tenantId).toBe('t-do-doc')
  })

  it('sem header e sem user, segue sem tenantId', async () => {
    const req = await run({ headers: {} })
    expect(req.tenantId).toBeUndefined()
  })

  it('usuário sem doc, segue sem tenantId', async () => {
    const req = await run({ headers: {}, user: { uid: 'desconhecido', email: '' } })
    expect(req.tenantId).toBeUndefined()
  })
})
